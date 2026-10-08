// SP2 admin → Usuarios → "Ver lo que el cliente ve" → Factura → "Estado" (2026-09-30), REAL UI + real functions.
// Owner's rule: only En ruta → Entregado and Entregado → En ruta, for the packages of THAT invoice, admin only.
// SP1 (the authority) is changed; its trigger brings the status to SP2 (what the customer sees).
//   0. "Ver Paquetes" is gone from the user card
//   1. the "Estado" button shows only in the admin's client view (never to the customer)
//   2. En ruta → Entregado: SP1 package delivered with who/why in its history + log; SP2 shipment delivered; the
//      modal confirms "ya visible para el cliente"
//   3. Entregado → En ruta: back to on_route in SP1 (previousDeliveredAt kept) and route in SP2
//   4. a package in another status (Retira en oficina) is not offered / not changed
//   5. without a reason the button stays disabled
//   6. another customer's package on the same invoice number is never touched (SP1 side check)
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-admin-packages-status.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const AUTH = 'http://localhost:9099';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB2 = `${B}/(default)/documents`, DB1 = `${B}/portal/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (base, p, o) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const patch = (base, p, o) => fetch(`${base}/${p}?${Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const register = async (body) => (await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })).json());
const signIn = async (email) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const x = await fn(); if (x || Date.now() > end) return x; await sleep(1000); } };
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});

(async () => {
  let adm = await signIn('admin2@prueba.local');
  if (!adm.localId) adm = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await patch(DB2, `users/${adm.localId}`, { role: 'admin', email: 'admin2@prueba.local', firstName: 'Admin', lastName: 'QA', status: 'active' });
  const email = `estado-${t}@prueba.local`;
  const reg = await register({ email, password: 'Prueba1234!', firstName: 'Estado', lastName: `Factura${t}`, phone: `8${t}8`, dni: `1-09${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true });
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) { console.error('ERR registro', JSON.stringify(reg.error)); process.exit(1); }
  // a complete customer (address + verified), so the dashboard shows the invoices without onboarding modals
  const addr = { id: `QAESTADDR${t}`, userId: uid, alias: 'Casa', type: 'home', streetAddress: 'Del parque 100 m sur', province: 'Heredia', canton: 'Barva', district: 'Barva', country: 'CR', isPrimary: true, isDefault: true, status: 'active', isActive: true };
  await patch(DB2, `users/${uid}`, { addressModel: 'single-v1', defaultAddress: addr, addresses: [addr], isVerified: true, showVerificationModal: false, onboardingCompleted: true });
  const INV = `${sl}-2026093000${t}`, INVID = `QAINV${t}`, R = `QAEST1${t}`, D = `QAEST2${t}`, F = `QAEST3${t}`, X = `QAEST9${t}`;
  const now = new Date().toISOString();
  const INV2 = `${sl}-2026093001${t}`, INVID2 = `QAINV2${t}`, S = `QAEST5${t}`;
  await put(DB1, `invoices/${INVID2}`, { invoiceNumber: INV2, status: 'paid', clientSlCode: sl, slCode: sl, customerId: sl, trackingNumbers: [S], items: [{ trackingNumber: S, tracking: S, description: 'Prueba', totalPrice: 10 }], totalAmount: 10, currency: 'USD', createdAt: now, invoiceDate: now });
  await put(DB2, `invoices/${INVID2}`, { invoiceNumber: INV2, status: 'paid', clientSlCode: sl, userId: uid, createdAt: now, date: now, total: 10, currency: 'USD', items: [{ description: 'Prueba', trackingNumber: S, total: 10 }] });
  await put(DB2, `invoices/${INVID}`, { invoiceNumber: INV, status: 'paid', clientSlCode: sl, userId: uid, createdAt: now, date: now, total: 30, currency: 'USD',
    items: [R, D, F].map((x) => ({ description: 'Prueba', trackingNumber: x, total: 10 })) });
  const ship = (trk, status) => put(DB2, `shipments/${trk}`, { tracking: trk, trackingNumber: trk, userId: uid, slCode: sl, status, invoiceNumber: INV, invoiceId: INVID, invoiceStatus: 'paid', invoiceReady: true, description: 'Prueba', createdAt: now, updatedAt: now });
  const pkg = (trk, status, owner = sl) => put(DB1, `packages/${trk}`, { trackingNumber: trk, tracking: trk, slCode: owner, status, invoiceNumber: INV, invoiceId: INVID, statusHistory: [], createdAt: now });
  // SP1 invoice (as in production: SP1 links a package to the invoice that lists its tracking)
  await put(DB1, `invoices/${INVID}`, { invoiceNumber: INV, status: 'paid', clientSlCode: sl, slCode: sl, customerId: sl, trackingNumbers: [R, D, F], items: [R, D, F].map((x) => ({ trackingNumber: x, tracking: x, description: 'Prueba', totalPrice: 10 })), totalAmount: 30, currency: 'USD', createdAt: now, invoiceDate: now });
  await put(DB2, `shipments/${S}`, { tracking: S, trackingNumber: S, userId: uid, slCode: sl, status: 'route', invoiceNumber: INV2, invoiceId: INVID2, invoiceStatus: 'paid', invoiceReady: true, description: 'Prueba', createdAt: now, updatedAt: now });
  await put(DB1, `packages/${S}`, { trackingNumber: S, tracking: S, slCode: sl, status: 'on_route', invoiceNumber: INV2, invoiceId: INVID2, statusHistory: [], createdAt: now });
  await ship(R, 'route'); await ship(D, 'delivered'); await ship(F, 'pickup');
  await pkg(R, 'on_route'); await pkg(D, 'delivered'); await pkg(F, 'pickup'); await pkg(X, 'on_route', 'SL90002'); // X: same invoice number, other customer (bad data)
  await patch(DB1, `packages/${D}`, { deliveredAt: '2026-09-28T15:00:00.000Z' });
  await sleep(2500);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x) => page.screenshot({ path: path.join(OUT, `estado-${x}.png`) }).catch(() => {});
  try {
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await page.goto('http://localhost:5175/slm/users'); await page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
    const box = page.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
    await box.fill(sl); await box.press('Enter'); await page.waitForTimeout(4000);
    await shot('0-card');
    check('0. "Ver Paquetes" ya no está en la tarjeta del cliente', (await page.getByRole('button', { name: /^\s*Ver Paquetes\s*$/ }).count()) === 0);
    await page.getByText('Acciones Admin', { exact: true }).first().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500);
    await page.getByText('Ver lo que el cliente ve', { exact: false }).first().click({ timeout: 10000 }); await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /^Paquetes$/ }).last().click().catch(() => {}); await page.waitForTimeout(2500);
    const btn = page.getByTestId(`invoice-status-btn-${INV}`).last();
    await btn.waitFor({ timeout: 15000 }).catch(() => {});
    await shot('1-card');
    check('1. En la vista del cliente (admin) la factura tiene el botón "Estado"', await btn.isVisible().catch(() => false));
    // 2 — En ruta → Entregado
    await btn.click(); await page.waitForTimeout(1000);
    const dlg = page.getByTestId('packages-status-modal');
    const offered = await dlg.innerText().catch(() => '');
    const opts = { toDel: await dlg.getByTestId('packages-status-to-delivered').innerText().catch(() => ''), toRoute: await dlg.getByTestId('packages-status-to-route').innerText().catch(() => '') };
    check('4. Solo se ofrecen En ruta → Entregado (1) y Entregado → En ruta (1); el que Retira en oficina no aparece', /1\s*$/.test(opts.toDel.trim()) && /1\s*$/.test(opts.toRoute.trim()) && !offered.includes(F), JSON.stringify(opts).replace(/\\n/g, ' '));
    await dlg.getByTestId('packages-status-to-delivered').click();
    check('5. Sin motivo el botón "Aplicar" está deshabilitado', await dlg.getByTestId('packages-status-apply').isDisabled());
    await dlg.getByTestId('packages-status-reason').fill('Entregado el 29/09, el chofer no lo marcó');
    await dlg.screenshot({ path: path.join(OUT, 'estado-1b-modal.png') }).catch(() => {});
    await dlg.getByTestId('packages-status-apply').click();
    const res = await dlg.getByTestId('packages-status-result').innerText({ timeout: 40000 }).catch(() => '');
    await shot('2-result');
    const p1 = await get(DB1, `packages/${R}`);
    const hist = (p1?.statusHistory?.arrayValue?.values || []).map((x) => x.mapValue.fields);
    check('2. SP1: el paquete queda Entregado con quién y motivo en su historial', v(p1?.status) === 'delivered' && hist.some((h) => v(h.status) === 'delivered' && v(h.changedBy) === 'admin2@prueba.local' && /chofer/.test(v(h.notes))) && !!v(p1?.deliveredAt), JSON.stringify({ s: v(p1?.status) }));
    const s1 = await until(async () => v((await get(DB2, `shipments/${R}`))?.status) === 'delivered');
    check('2b. SP2: el cliente lo ve Entregado; el modal lo confirma', !!s1 && /ya visible para el cliente/.test(res), res.replace(/\s+/g, ' ').slice(0, 120));
    const logs = ((await (await fetch(`${DB1}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'package_status_admin_changes' }], where: { fieldFilter: { field: { fieldPath: 'invoiceNumber' }, op: 'EQUAL', value: { stringValue: INV } } } } }) })).json()).filter((r) => r.document)).map((r) => r.document.fields);
    check('2c. Registro en SP1 (quién, motivo, antes → después)', logs.length === 1 && v(logs[0].by) === 'admin2@prueba.local' && v(logs[0].to) === 'delivered');
    check('6. El paquete de OTRO cliente con el mismo número de factura no se toca', v((await get(DB1, `packages/${X}`))?.status) === 'on_route' && v((await get(DB1, `packages/${F}`))?.status) === 'pickup');
    // 6b — SP1 reports a requested tracking that is not in the invoice (never ignored silently)
    const secret = (() => { try { const f = require('fs').readFileSync(path.join(require('os').tmpdir(), 'sp-qa-emulator', 'sp2/.env'), 'utf8'); return (f.match(/^ENCOMIENDA_SYNC_SECRET=(.*)$/m) || [])[1] || ''; } catch { return ''; } })();
    const r6 = await (await fetch(`${FN}/slSetPackagesStatusFromSp2`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret }, body: JSON.stringify({ invoiceNumber: INV, slCode: sl, to: 'delivered', reason: 'prueba tracking inexistente', by: 'qa', trackings: ['NOEXISTE123'] }) })).json();
    check('6b. Un tracking que no está en la factura de SP1 se reporta ("no está en esta factura"), nada cambia', (r6.changed || []).length === 0 && (r6.skipped || []).some((x) => x.tracking === 'NOEXISTE123' && /no está en esta factura/.test(x.reason)), JSON.stringify(r6.skipped || r6.error).slice(0, 120));
    await dlg.getByTestId('packages-status-close').click(); await page.waitForTimeout(1500);
    // 3 — Entregado → En ruta (the package that was delivered before)
    await page.getByTestId(`invoice-status-btn-${INV}`).last().click().catch(() => {}); await page.waitForTimeout(1000);
    const dlg2 = page.getByTestId('packages-status-modal');
    await dlg2.getByTestId('packages-status-to-route').click();
    for (const c of await dlg2.locator('input[type=checkbox]').all()) { const id = await c.getAttribute('data-testid'); if (id && !id.endsWith(D)) await c.uncheck(); }
    await dlg2.getByTestId('packages-status-reason').fill('Se marcó entregado por error');
    await dlg2.getByTestId('packages-status-apply').click();
    await dlg2.getByTestId('packages-status-result').waitFor({ timeout: 40000 }).catch(() => {});
    await shot('3-back');
    const p2 = await get(DB1, `packages/${D}`);
    const s2 = await until(async () => v((await get(DB2, `shipments/${D}`))?.status) === 'route');
    check('3. Entregado → En ruta: SP1 on_route (fecha de entrega guardada en previousDeliveredAt) y SP2 En ruta', v(p2?.status) === 'on_route' && v(p2?.previousDeliveredAt) === '2026-09-28T15:00:00.000Z' && !!s2, JSON.stringify({ s: v(p2?.status), prev: v(p2?.previousDeliveredAt) }));
    check('   3. solo el paquete elegido cambió (el otro sigue Entregado)', v((await get(DB1, `packages/${R}`))?.status) === 'delivered');
    // 7 — the card moves by itself: all packages of INV2 delivered → leaves Facturados, appears in Entregado; and back
    await page.getByTestId('packages-status-close').last().click().catch(() => {}); await page.waitForTimeout(1000);
    const tab = (name) => page.locator('[data-testid="status-filter-tabs"]', { hasText: /FACTURADOS/i }).last().locator('button', { hasText: name }).first();
    const cardIn = async (name) => { await tab(name).click().catch(() => {}); await page.waitForTimeout(2500); return (await page.getByTestId(`invoice-status-btn-${INV2}`).count()) > 0; };
    const before7 = await cardIn(/Facturados/i);
    await page.getByTestId(`invoice-status-btn-${INV2}`).last().click();
    const d7 = page.getByTestId('packages-status-modal');
    await d7.getByTestId('packages-status-reason').fill('Entregado, prueba de pestañas');
    await d7.getByTestId('packages-status-apply').click();
    await d7.getByTestId('packages-status-result').waitFor({ timeout: 40000 }).catch(() => {});
    await d7.getByTestId('packages-status-close').click().catch(() => {}); await page.waitForTimeout(2500);
    const inFact = await cardIn(/Facturados/i); const inEnt = await cardIn(/Entregado/i);
    await shot('7-en-entregado');
    check('7. Toda la factura Entregada → sale de Facturados y aparece sola en Entregado (sin recargar)', before7 && !inFact && inEnt, JSON.stringify({ antes: before7, facturados: inFact, entregado: inEnt }));
    await page.getByTestId(`invoice-status-btn-${INV2}`).last().click();
    const d8 = page.getByTestId('packages-status-modal');
    await d8.getByTestId('packages-status-reason').fill('Vuelve a ruta, prueba de pestañas');
    await d8.getByTestId('packages-status-apply').click();
    await d8.getByTestId('packages-status-result').waitFor({ timeout: 40000 }).catch(() => {});
    await d8.getByTestId('packages-status-close').click().catch(() => {}); await page.waitForTimeout(2500);
    let inEnt2 = true, waited = 0;
    for (; waited < 15 && inEnt2; waited++) { inEnt2 = await cardIn(/Entregado/i); if (inEnt2) await page.waitForTimeout(1000); }
    await shot('8a-entregado-tras-volver');
    const inFact2 = await cardIn(/Facturados/i);
    await shot('8-de-vuelta-en-facturados');
    check('8. Entregado → En ruta → vuelve sola a Facturados y sale de Entregado', !inEnt2 && inFact2, JSON.stringify({ entregado: inEnt2, facturados: inFact2, segundos: waited }));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 20000);
    // 1b — the customer never sees the button (own session)
    const b2 = await chromium.launch(); const c2 = await b2.newContext({ viewport: { width: 1400, height: 1000 } });
    await c2.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
    const p = await c2.newPage();
    try {
      await p.goto('http://localhost:5175/'); await p.waitForTimeout(3500);
      await p.evaluate(async (em) => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), em, 'Prueba1234!'); }, email);
      await p.goto('http://localhost:5175/account'); await p.waitForTimeout(8000);
      for (let i = 0; i < 3; i++) { const x = p.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await p.waitForTimeout(600); }
      await p.locator('[data-testid="status-filter-tabs"]:visible button', { hasText: /Facturados/i }).first().click().catch(() => {}); await p.waitForTimeout(2500);
      await p.locator(`[data-testid^="invoice-group-card-"]`).first().waitFor({ timeout: 20000 }).catch(() => {});
      const seesCard = await p.locator(`[data-testid^="invoice-group-card-"]`).count();
      await p.screenshot({ path: path.join(OUT, 'estado-4-cliente.png') }).catch(() => {});
      check('1b. El cliente (su propia sesión) VE su factura pero NO el botón "Estado"', seesCard > 0 && (await p.getByTestId(`invoice-status-btn-${INV}`).count()) === 0, `tarjetas de factura visibles: ${seesCard}`);
    } catch (e) { console.error('ERR cliente', e.message.split('\n')[0]); }
    await limit(b2.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
