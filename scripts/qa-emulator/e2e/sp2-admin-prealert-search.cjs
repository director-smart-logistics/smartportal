// SP2 Admin → Paquetes: results board "Paquetes | Pre-alertas | ML Cargo" — REAL browser, real app
// (http://localhost:5175/slm/packages) on the QA emulator, SP2 admin admin2@prueba.local (from sp2-auth-flows),
// real triggers (slShipmentSearchIndex / slPreAlertSearchIndex build trackingSearchKeys). Read-only feature.
//   1. without a search: tabs Paquetes | Pre-alertas; Pre-alertas lists the most recent (loaded on open); no duplicates audit
//   2. the LAST 6 DIGITS of a GFUS tracking (the admin's case, 2026-09-26) → the package, from OUR DB;
//      card: status under the tracking; Peso/SmartID/Cliente/Correo/Cédula/Ruta; invoice number, status, issue date,
//      manifest, total/TC/colones (invoice number + status badge visible; 'Detalle de la factura ($x)' collapsible); column badges; animated status; route in its route colour; a compact read-only
//      history INSIDE the card (collapsible 'Historial (n)'); NO Sync / Editar (the card is read-only); ML Cargo is NOT queried (only on "Consultar ML Cargo"); pre-alert cards show only tracking, SL and creation
//      date — green = the package owner's, amber = another account
//   3. an ending shared by two different packages → both shown as full cards, one ML button per match
//   4. a pre-alert found by its ending with no package → shown; Paquetes says it is not in our DB; ML Cargo runs only
//      after the admin presses the button
//   5. a package without pre-alerts (and without invoice → 'Sin factura') → Pre-alertas 0, as before; the previous result never stays on screen
//   6. the search wrote nothing (after the triggers settle); no JavaScript errors
//   7. roles: an 'operations' user gets the same board read-only (no Sync / Editar)
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-admin-prealert-search.cjs
const { chromium } = require('playwright');
const path = require('path');
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (p, o) => fetch(`${FS}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const raw = async (p) => (await (await fetch(`${FS}/${p}`, { headers: H })).json());
const t = String(Date.now()).slice(-6);
// GFUS-style: the admin types the last 9 digits.
const TG = `GFUS0107${t}2447`, TG9 = TG.slice(-6);
// Two different packages sharing the last 8 digits.
const TX1 = `TBA33${t}81234567`, TX2 = `SPXMIA${t}9981234567`, TX8 = '81234567';
// A pre-alert only (no package), found by its last 9.
const TP = `9400111${t}55443322119`, TP9 = TP.slice(-9);
const TC = `PASINPA${t}000123`;
// USPS package (22 digits) searched with its full 420+ZIP barcode, as the admin scans it.
const TU = `9234690${t}393605419`.slice(0, 22).padEnd(22, '7'), TU_BARCODE = `42033195${TU}`;

(async () => {
  const now = new Date().toISOString();
  const pre = (tr, sl, extra = {}) => ({ trackingNumber: tr, tracking: tr, canonicalTracking: tr, slCode: sl, userId: `u-${sl}`, displayName: `Cliente ${sl}`, status: 'pending', active: true, description: 'Zapatos', createdAt: now, ...extra });
  const ship = (tr, sl, extra = {}) => ({ tracking: tr, slCode: sl, status: 'customs', customerName: `Cliente ${sl}`, createdAt: now, ...extra });
  const docs = {
    [`shipments/G-${t}`]: ship(TG, 'SLPA2', { weight: 2.4, statusHistory: [{ status: 'received', description: 'Recibido en Miami', timestamp: '2026-09-15T17:59:00Z', location: 'Miami, FL' }, { status: 'customs', description: 'En aduanas', timestamp: '2026-09-24T16:44:00Z', location: 'Aduana CR' }], ruta: 'Alajuela', invoiceNumber: `SLPA2-20260924095042${t}`, invoiceId: `INV-${t}` }),
    [`invoices/INV-${t}`]: { invoiceNumber: `SLPA2-20260924095042${t}`, date: '2026-09-24T15:50:42.000Z', manifestNumber: `24-09-2026DAN${t}`, slCode: 'SLPA2', status: 'sent', total: 16.35, currency: 'USD', exchangeRate: 460, amountCRC: 7521 },
    [`pre_alerts/${TG}_SLPA2`]: pre(TG, 'SLPA2', { shipmentId: `G-${t}` }),
    [`pre_alerts/${TG}_SLPA3`]: pre(TG, 'SLPA3'),
    [`shipments/X1-${t}`]: ship(TX1, 'SLPA5'),
    [`shipments/X2-${t}`]: ship(TX2, 'SLPA6'),
    [`pre_alerts/${TP}_SLPA1`]: pre(TP, 'SLPA1'),
    [`shipments/C-${t}`]: ship(TC, 'SLPA4'),
    [`shipments/U-${t}`]: ship(TU, 'SLPA7'),
  };
  for (const [p, o] of Object.entries(docs)) await put(p, o);
  // Wait until the triggers indexed every doc (trackingSearchKeys) and stopped writing.
  const keysReady = async () => (await Promise.all(Object.keys(docs).filter((p) => !p.startsWith('invoices/')).map(raw))).every((d) => d.fields?.trackingSearchKeys);
  for (let i = 0; i < 30 && !(await keysReady()); i++) await pause(1000);
  const indexed = await keysReady();
  const snap = async () => Object.fromEntries(await Promise.all(Object.keys(docs).map(async (p) => [p, (await raw(p)).updateTime])));
  let before = await snap(); for (let i = 0; i < 10; i++) { await pause(1500); const cur = await snap(); if (JSON.stringify(cur) === JSON.stringify(before)) break; before = cur; }
  check('0. Los triggers indexan shipments Y pre_alerts (trackingSearchKeys)', indexed);

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/Failed to fetch|network/i.test(e.message)) errors.push(e.message.slice(0, 160)); });
  const shot = (name) => page.screenshot({ path: path.join(OUT, `pa-${name}.png`), fullPage: false }).catch(() => {});
  const col = (id) => page.getByTestId(id).innerText().catch(() => '');
  const box = () => page.locator('input[data-scanner-input="true"]');
  const settled = async () => {
    await page.getByTestId('admin-search-board').waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[data-testid="board-paquetes"] .animate-spin'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => !/Consultando ML Cargo/.test(document.querySelector('[data-testid="board-mlcargo"]')?.textContent || ''), null, { timeout: 90000 }).catch(() => {});
    await pause(800);
  };
  const search = async (q) => { await box().fill(q); await box().press('Enter'); await pause(700); await settled(); };
  try {
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(4000);
    await page.evaluate(async () => {
      const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
      await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!');
    });
    await page.waitForTimeout(2500);
    await page.goto('http://localhost:5175/slm/packages'); await page.waitForTimeout(6000);
    for (let i = 0; i < 3; i++) { const b2 = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await b2.count()) await b2.first().click().catch(() => {}); await page.waitForTimeout(800); }

    // 1. Idle: no tabs, no duplicates audit
    await shot('1-idle');
    check('1. Sin búsqueda: solo "Esperando tu búsqueda" (sin pestañas) y ya no está "Auditoría de Duplicados"',
      (await page.getByText('Esperando tu búsqueda').count()) > 0 && (await page.getByRole('tab').count()) === 0 && (await page.getByText('Auditoría de Duplicados').count()) === 0);

    // 2. Last 9 digits of a GFUS
    await search(TG9);
    const collapsedOk = !/Monto total/.test(await col('board-paquetes')) && /Detalle de la factura \(\$16\.35\)/.test(await col('board-paquetes')) && !/Emitida/.test(await col('board-paquetes')) && /Pendiente de pago/i.test(await page.getByTestId('board-invoice-status').innerText()) && /Historial \(2\)/.test(await col('board-paquetes'));
    await page.getByTestId('board-invoice-amounts-toggle').click().catch(() => {});
    await page.getByTestId('package-detail-toggle').click().catch(() => {});
    await pause(400);
    const p2 = await col('board-paquetes'), a2 = await col('board-prealertas'), m2 = await col('board-mlcargo');
    if (process.env.DEBUG_CARD) console.log('CARD>>>', JSON.stringify(p2), '\nROUTE>>>', await page.getByTestId('board-route').getAttribute('class').catch(() => 'NONE'), '\nLIVE>>>', await page.getByTestId('board-status-live').count());
    await shot('2-gfus-9-digitos');
    const tones = await page.getByTestId('admin-prealert-row').evaluateAll((els) => els.map((e) => [e.getAttribute('data-tone'), e.textContent]));
    const owner = tones.find(([tone]) => tone === 'owner'), other = tones.find(([tone]) => tone === 'other');
    check(`2. Últimos 6 dígitos (${TG9}) → el paquete desde NUESTRA base; ML Cargo no se consulta solo; tarjetas de pre-alerta: solo tracking, SL y fecha (verde dueño / ámbar otra cuenta)`,
      collapsedOk && p2.includes(TG) && !/Pre-alertado/i.test(p2) && /Ruta: Alajuela/i.test(p2) && p2.includes(`Factura: SLPA2-20260924095042${t}`) && /Emitida: 24 sept 2026/.test(p2) && p2.includes(`Manifiesto: 24-09-2026DAN${t}`)
      && /Peso: 2.4 kg/.test(p2) && /SmartID: SLPA2/.test(p2) && /Cliente: /.test(p2) && /Correo: /.test(p2) && /Cédula: /.test(p2)
      && /Pendiente de pago/i.test(p2) && /Monto total: \$16\.35/.test(p2) && /TC: 460\.00/.test(p2) && /Colones: ₡7[.\s ]?521/.test(p2)
      && /Facturados/i.test(p2) && /Pre-alertados/i.test(a2) && /desde el portal/.test(p2) && /el cliente lo hizo/.test(a2) && /3PL terceros/i.test(m2) && /warehouses/.test(m2) && /Consultar en ML/.test(m2)
      && (await page.getByTestId('board-package-card').getByTestId('package-detail').count()) === 1 && (await page.getByTestId('package-detail-sync').count()) === 0 && (await page.getByTestId('package-detail-edit').count()) === 0
      && (await page.getByTestId('board-package-card').getByTestId('board-sync').count()) === 1
      && (await page.getByTestId('board-package-card').getByTestId('board-sync').count()) === 1
      && (await page.getByTestId('board-package-status').getAttribute('class')).includes('uppercase') && (await page.getByTestId('board-status-live').count()) === 1
      && /(red|rose)-/.test(await page.getByTestId('board-route').getAttribute('class'))
      && /Historial/i.test(p2) && /Miami/.test(p2) && !/Solicitar Sync|Dueño|Retirar en SmartLogistics/.test(await page.locator('body').innerText()) && /solo se consulta si tú lo pides/.test(m2) && (await page.getByTestId('board-ml-consultar').count()) === 1
      && owner && owner[1].includes('SLPA2') && other && other[1].includes('SLPA3') && /Creada/.test(a2) && !/Esperando llegada|Cliente SLPA|Zapatos/.test(a2)
      && /SmartID: SLPA/.test(a2) && /Creada: /.test(a2),
      JSON.stringify({ paquetes: p2.replace(/\s+/g, ' ').slice(0, 90), ml: m2.replace(/\s+/g, ' ').slice(0, 60), prealertas: a2.replace(/\s+/g, ' ').slice(0, 120) }));

    // 3. Shared ending → every match as a full card in its column
    await search(TX8);
    const cards = await page.getByTestId('board-candidate').allInnerTexts();
    const p3 = await col('board-paquetes');
    const perMatch = await page.getByTestId('board-ml-consultar-match').allInnerTexts();
    await shot('3-varios-paquetes');
    check(`3. Terminación compartida (${TX8}) → las 2 coincidencias como tarjetas completas (SmartID, ruta, factura) y un "<tracking> · Consultar en ML" por coincidencia`,
      cards.length === 2 && cards.some((c) => c.includes(TX1) && /SmartID: SLPA5/.test(c)) && cards.some((c) => c.includes(TX2) && /SmartID: SLPA6/.test(c))
      && cards.every((c) => /Ruta: /.test(c) && /Factura: /.test(c)) && /2 paquetes terminan/.test(p3)
      && perMatch.length === 2 && perMatch.some((b) => b.includes(TX1)) && perMatch.some((b) => b.includes(TX2)),
      JSON.stringify({ cards: cards.map((c) => c.split('\n')[0]), botonesML: perMatch.length }));

    // 4. Pre-alert only, by its ending
    await search(TP9);
    const p4 = await col('board-paquetes'), a4 = await col('board-prealertas');
    await shot('4-solo-prealerta');
    const mlBefore = await col('board-mlcargo');
    await page.getByTestId('board-ml-consultar').click().catch(() => {});
    await pause(500); await settled();
    const mlAfter = await col('board-mlcargo');
    await shot('4b-ml-consultado');
    check(`4. Pre-alerta encontrada por su terminación (${TP9}) sin paquete; Paquetes dice que no está en nuestra base; ML Cargo solo tras "Consultar ML Cargo"`,
      a4.includes(TP) && /aún no está en nuestra base/.test(a4) && /No está en nuestra base/.test(p4) && (await page.getByTestId('package-detail').count()) === 0
      && /solo se consulta si tú lo pides/.test(mlBefore) && /(ML Cargo no tiene|Sin datos en ML Cargo|Existe en ML Cargo|ML Cargo no respondió)/.test(mlAfter) && /de nuevo/.test(mlAfter),
      JSON.stringify({ prealertas: a4.replace(/\s+/g, ' ').slice(0, 80), mlAntes: mlBefore.replace(/\s+/g, ' ').slice(0, 50), mlDespues: mlAfter.replace(/\s+/g, ' ').slice(0, 60) }));

    // 5. Package without pre-alerts; the previous result must not remain
    await search(TC);
    const p5 = await col('board-paquetes'), a5 = await col('board-prealertas');
    await shot('5-sin-prealerta');
    check('5. Paquete sin pre-alertas → Pre-alertas 0; no queda nada de la búsqueda anterior',
      p5.includes(TC) && /Sin factura/.test(p5) && /Nadie pre-alertó/.test(a5) && !a5.includes(TP) && !p5.includes(TG),
      JSON.stringify({ prealertas: a5.replace(/\s+/g, ' ').slice(0, 60) }));

    // 6. Read-only + no errors
    const after = await snap();
    const changed = Object.keys(docs).filter((p) => before[p] !== after[p]);
    check('6. La búsqueda no escribió nada y no hubo errores de JavaScript', changed.length === 0 && errors.length === 0, JSON.stringify({ changed, errors: errors.slice(0, 2) }));
    // 8 (UI only). ML Cargo is external: its answer is replaced here by a synthetic one to check the card layout
    //   (key: value fields and the timeline in the same style as the package history).
    await page.route('**/slMLCargo', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, data: { trackingNumber: TC, providerId: 'mlcargo', statusCode: 'customs', statusMessage: 'Tu paquete está en proceso de aduana', lastLocation: 'San José, Costa Rica', weight: 1.1,
        manifestId: '24-09-2026DAN', events: [{ description: 'En aduana', location: 'San José, Costa Rica', date: '2026-09-25T14:12:00' }, { description: 'Recibido en bodega Miami', location: 'Miami, FL', date: '2026-09-15T11:59:00' }],
        _raw: { packageInfo: { nombreCliente: 'CLIENTE PRUEBA', codigoCliente: 'ML-0001', bultos: 1, shipperDescripcion: 'Ebay', factura: '' } } } }) }));
    await search(TC);
    await page.getByTestId('board-ml-consultar').click().catch(() => {});
    await page.getByTestId('admin-ml-card').waitFor({ timeout: 20000 }).catch(() => {});
    await page.getByTestId('ml-history-toggle').click().catch(() => {});
    await pause(400);
    const ml8 = await page.getByTestId('admin-ml-card').innerText().catch(() => '');
    await shot('8-ml-card');
    check('8. Tarjeta ML Cargo (respuesta simulada): datos de ML en "Etiqueta: valor" y su historial con el mismo diseño que el del paquete',
      /Estado: Tu paquete está en proceso de aduana/.test(ml8) && /Cliente: CLIENTE PRUEBA/.test(ml8) && /Historial ML Cargo \(2\)/.test(ml8) && /En aduana/.test(ml8) && /San José, Costa Rica · 25 sept 2026/.test(ml8),
      ml8.replace(/\s+/g, ' ').slice(0, 200));
    await page.unroute('**/slMLCargo');

    // 9. Typed barcode vs the match: ML Cargo asks which tracking to query with.
    await search(TU_BARCODE);
    const p9 = await col('board-paquetes');
    const opts = await page.getByTestId('board-ml-consultar-match').evaluateAll((els) => els.map((e) => [e.getAttribute('data-kind'), e.textContent]));
    await shot('9-escrito-vs-coincidencia');
    check('9. Código de barras completo (420+ZIP) → encuentra el paquete; ML Cargo pregunta: "Lo que escribiste" o "Coincidencia en nuestra base"',
      p9.includes(TU) && opts.length === 2 && opts.some(([k, tx]) => k === 'typed' && tx.includes(TU_BARCODE)) && opts.some(([k, tx]) => k === 'match' && tx.includes(TU) && !tx.includes(TU_BARCODE)),
      JSON.stringify(opts.map(([k, tx]) => [k, tx.replace(/\s+/g, ' ').slice(0, 60)])));
    // A bare ending (6 digits) never offers the fragment itself.
    await search(TG9);
    const opts6 = await page.getByTestId('board-ml-consultar-match').count();
    check('10. Con solo la terminación (6 dígitos) no se ofrece consultar ML con el fragmento: un solo botón con el tracking completo',
      opts6 === 0 && (await page.getByTestId('board-ml-consultar').innerText()).includes(TG));

    // 7. Roles: an 'operations' user sees the same board, read-only (no Sync / Editar — canPerformAction).
    const OPS = { email: `ops-${t}@prueba.local`, password: 'Prueba1234!' };
    const su = await (await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...OPS, returnSecureToken: true }) })).json();
    await put(`users/${su.localId}`, { uid: su.localId, email: OPS.email, role: 'operations', firstName: 'Ops', lastName: 'QA', status: 'active' });
    await page.evaluate(async (o) => {
      const { getAuth, signOut, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
      await signOut(getAuth()); await signInWithEmailAndPassword(getAuth(), o.email, o.password);
    }, OPS);
    await page.waitForTimeout(2500);
    await page.goto('http://localhost:5175/slm/packages'); await page.waitForTimeout(6000);
    for (let i = 0; i < 3; i++) { const b2 = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await b2.count()) await b2.first().click().catch(() => {}); await page.waitForTimeout(800); }
    await search(TG9);
    const p7 = await col('board-paquetes');
    await shot('7-rol-operations');
    check('7. Rol operations: ve el mismo tablero de solo lectura (sin Sync ni Editar; Sync no aparece para su rol)',
      p7.includes(TG) && /SmartID: SLPA2/.test(p7) && (await page.getByTestId('package-detail-sync').count()) === 0 && (await page.getByTestId('package-detail-edit').count()) === 0
      && (await page.getByTestId('board-ml-consultar').count()) === 1 && (await page.getByTestId('board-sync').count()) === 0,
      JSON.stringify({ sync: await page.getByTestId('board-sync').count(), edit: await page.getByTestId('package-detail-edit').count(), ml: await page.getByTestId('board-ml-consultar').count(), mlMatch: await page.getByTestId('board-ml-consultar-match').count(), card: p7.replace(/\s+/g, ' ').slice(0, 400) }));
    await fetch(`${FS}/users/${su.localId}`, { method: 'DELETE', headers: H });
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    for (const p of Object.keys(docs)) await fetch(`${FS}/${p}`, { method: 'DELETE', headers: H });
    await b.close();
    console.log(`\n${ok}/${n}`);
  }
})();
