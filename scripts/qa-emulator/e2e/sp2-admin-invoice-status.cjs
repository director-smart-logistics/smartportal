// SP2 admin — change an invoice's status with the wizard (2026-09-27), through the REAL UI
// (http://localhost:5175, QA emulator, real functions):
//   Paquetes: search a tracking → the invoice badge is clickable for admins (pointer icon)
//     1. step 1 lists the trackings of the invoice
//     2. step 2: choose "Pagada" + reason (Siguiente disabled without a reason)
//     3. step 3: warns that SP1 governs invoice statuses and may overwrite; "Aplicar" disabled until confirmed
//     4. applied: invoice Pagada, packages → En Ruta (only forward: a delivered one stays), log with who/why/before/after
//   Facturas: open the invoice → "Cambiar estado" → Vencida → invoice updated + second log entry
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-admin-invoice-status.cjs
const { chromium } = require('playwright');
const path = require('path');
const AUTH = 'http://localhost:9099';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const patch = (p, o) => fetch(`${DB2}/${p}?${Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (p) => { const r = await fetch(`${DB2}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});
const signIn = async (email, password) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());
const logsOf = async (invoiceId) => ((await (await fetch(`${DB2}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'invoice_status_changes' }], where: { fieldFilter: { field: { fieldPath: 'invoiceId' }, op: 'EQUAL', value: { stringValue: invoiceId } } } } }) })).json()).filter((r) => r.document)).map((r) => r.document.fields);

(async () => {
  let adm = await signIn('admin2@prueba.local', 'Prueba1234!');
  if (!adm.localId) adm = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await patch(`users/${adm.localId}`, { role: 'admin', email: 'admin2@prueba.local', firstName: 'Admin', lastName: 'QA', status: 'active' });
  const INV = `QAINV${t}`, NUM = `SLQA9-20260925162655${t}`, T1 = `QAFACT${t}0001`, T2 = `QAFACT${t}0002`, now = new Date().toISOString();
  await patch(`invoices/${INV}`, { invoiceNumber: NUM, status: 'pending', clientName: 'Cliente Factura', clientSlCode: 'SLQA9', userSlCode: 'SLQA9', total: 12, currency: 'USD', date: now, createdAt: now });
  await patch(`shipments/S1${t}`, { tracking: T1, slCode: 'SLQA9', status: 'processed', customerName: 'Cliente Factura', invoiceId: INV, invoiceNumber: NUM, invoiceStatus: 'sent', createdAt: now });
  await patch(`shipments/S2${t}`, { tracking: T2, slCode: 'SLQA9', status: 'delivered', customerName: 'Cliente Factura', invoiceId: INV, invoiceNumber: NUM, invoiceStatus: 'sent', createdAt: now });
  await pause(4000);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x) => page.screenshot({ path: path.join(OUT, `invst-${x}.png`) }).catch(() => {});
  try {
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:5175/slm/packages'); await page.waitForTimeout(6000);
    for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
    const box = page.locator('input[data-scanner-input="true"]');
    await box.fill(T1); await box.press('Enter');
    await page.getByTestId('admin-search-board').waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const badge = page.getByTestId('board-invoice-status').first();
    const isButton = (await badge.evaluate((el) => el.tagName)) === 'BUTTON';
    const hasPointer = (await badge.evaluate((el) => getComputedStyle(el).cursor)) === 'pointer' && (await badge.locator('svg').count()) > 0;
    check('0. Admin: el badge de la factura es clicable (puntero + icono)', isButton && hasPointer);
    await shot('0-badge');
    await badge.click(); await page.waitForTimeout(3000);
    const wiz = page.getByTestId('invoice-status-wizard');
    const pk = await wiz.getByTestId('invoice-wizard-package').allInnerTexts();
    check('1. Paso 1: muestra los trackings de la factura', pk.length === 2 && pk.some((x) => x.includes(T1)) && pk.some((x) => x.includes(T2)), pk.join(' | '));
    await shot('1-packages');
    await wiz.getByTestId('invoice-wizard-next').click(); await page.waitForTimeout(600);
    await wiz.getByTestId('invoice-wizard-option-paid').click();
    const nextDisabled = await wiz.getByTestId('invoice-wizard-next').isDisabled();
    await wiz.getByTestId('invoice-wizard-reason').fill(`Pago SINPE confirmado ${t}`);
    check('2. Paso 2: sin motivo no deja seguir; con estado + motivo sí', nextDisabled && await wiz.getByTestId('invoice-wizard-next').isEnabled());
    await shot('2-status');
    await wiz.getByTestId('invoice-wizard-next').click(); await page.waitForTimeout(600);
    const warn = await wiz.getByTestId('invoice-wizard-sp1-warning').innerText().catch(() => '');
    const applyDisabled = await wiz.getByTestId('invoice-wizard-apply').isDisabled();
    check('3. Paso 3: aviso de que SP1 gobierna y puede sobrescribir; "Aplicar" bloqueado hasta confirmar', /SP1/.test(warn) && /sobrescribir/.test(warn) && applyDisabled);
    await wiz.getByTestId('invoice-wizard-understood').check();
    await shot('3-confirm');
    await wiz.getByTestId('invoice-wizard-apply').click(); await page.waitForTimeout(5000);
    await shot('4-done');
    const done = await wiz.getByTestId('invoice-wizard-done').isVisible().catch(() => false);
    const inv = await get(`invoices/${INV}`), s1 = await get(`shipments/S1${t}`), s2 = await get(`shipments/S2${t}`);
    check('4a. Factura Pagada; paquete Facturado → En Ruta; el entregado no retrocede', done && v(inv?.status) === 'paid' && v(s1?.status) === 'route' && v(s1?.invoiceStatus) === 'paid' && v(s2?.status) === 'delivered' && v(s2?.invoiceStatus) === 'paid',
      JSON.stringify({ inv: v(inv?.status), s1: v(s1?.status), s2: v(s2?.status) }));
    const logs1 = await logsOf(INV);
    check('4b. Log: quién, motivo, antes → después y cada paquete', logs1.length === 1 && v(logs1[0].performedByEmail) === 'admin2@prueba.local' && v(logs1[0].from) === 'pending' && v(logs1[0].to) === 'paid'
      && v(logs1[0].reason) === `Pago SINPE confirmado ${t}` && (logs1[0].packages?.arrayValue?.values || []).length === 2);
    await wiz.getByRole('button', { name: 'Cerrar' }).click(); await page.waitForTimeout(4000);
    check('4c. La búsqueda se refresca: el badge dice Pagada', /Pagada/i.test(await page.getByTestId('board-invoice-status').first().innerText().catch(() => '')));

    // Facturas
    await page.goto('http://localhost:5175/slm/invoices'); await page.waitForTimeout(5000);
    const sbox = page.getByPlaceholder(/Buscar por número de factura/);
    await sbox.fill(NUM); await sbox.press('Enter'); await page.waitForTimeout(4000);
    await page.getByText(NUM).first().click(); await page.waitForTimeout(2500);
    check('5a. Facturas: badge clicable + botón "Cambiar estado" para admin', (await page.getByTestId('invoice-status-badge').count()) === 1 && (await page.getByTestId('invoice-change-status').count()) === 1);
    await page.getByTestId('invoice-change-status').click(); await page.waitForTimeout(2500);
    const wiz2 = page.getByTestId('invoice-status-wizard');
    await wiz2.getByTestId('invoice-wizard-next').click(); await page.waitForTimeout(500);
    check('5b. El estado actual (Pagada) no se puede elegir', await wiz2.getByTestId('invoice-wizard-option-paid').isDisabled());
    await wiz2.getByTestId('invoice-wizard-option-overdue').click();
    await wiz2.getByTestId('invoice-wizard-reason').fill('Prueba de vencida QA');
    await wiz2.getByTestId('invoice-wizard-next').click(); await page.waitForTimeout(500);
    await wiz2.getByTestId('invoice-wizard-understood').check();
    await wiz2.getByTestId('invoice-wizard-apply').click(); await page.waitForTimeout(5000);
    await shot('5-facturas');
    const inv2 = await get(`invoices/${INV}`), s1b = await get(`shipments/S1${t}`);
    check('5c. Factura Vencida; el paquete sigue En Ruta (no retrocede); 2 registros en el log', v(inv2?.status) === 'overdue' && v(s1b?.status) === 'route' && (await logsOf(INV)).length === 2);
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
