// SP1 Paquetes — changing ONE package's status offers the other packages of the SAME invoice (2026-09-28).
// In SP2 a "Facturados" card is the invoice; it only moves to "Entregados" when every package is delivered.
//   1. the confirmation lists the other packages of the invoice, all ticked, with their current status
//   2. the admin unticks one (partial delivery) → only the ticked ones change, in SP1 and in SP2
//   3. a package of ANOTHER invoice is never listed
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-packages-invoice-siblings.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const OUT = process.env.OUT || require('os').tmpdir();
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB1 = `${B}/portal/documents`, DB2 = `${B}/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => typeof x === 'number' ? { doubleValue: x } : typeof x === 'boolean' ? { booleanValue: x } : { stringValue: String(x) };
const put = (base, p, data) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const st = async (base, p) => { const f = await get(base, p); return f?.status?.stringValue; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 25000) => { const end = Date.now() + ms; for (;;) { const x = await fn(); if (x || Date.now() > end) return x; await sleep(1000); } };

const t = String(Date.now()).slice(-5);
const SL = `SL7${t}`, INV = `SL7${t}-20260901101010101`, INV2 = `SL7${t}-20260902101010101`;
const T = [1, 2, 3].map((i) => `QASIB${t}0${i}`), TX = `QASIB${t}99`;

(async () => {
  const uid = `us-${t}`;
  await put(DB2, `users/${uid}`, { slCode: SL, email: `sib-${t}@prueba.local`, firstName: 'Hermanos', lastName: 'QA', role: 'customer' });
  // real SP1 invoices (paid) so the table and the link triggers see them
  const item = (id) => ({ mapValue: { fields: { trackingNumber: { stringValue: id }, description: { stringValue: 'QA' }, price: { doubleValue: 5 } } } });
  for (const [inv, list] of [[INV, T], [INV2, [TX]]]) {
    await fetch(`${DB1}/invoices/ID-${inv}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { invoiceNumber: { stringValue: inv }, slCode: { stringValue: SL }, customerName: { stringValue: 'HERMANOS QA' }, status: { stringValue: 'paid' }, totalAmount: { doubleValue: 5 * list.length }, invoiceItems: { arrayValue: { values: list.map(item) } }, createdAt: { stringValue: new Date().toISOString() } } }) });
  }
  for (const id of [...T, TX]) {
    const inv = id === TX ? INV2 : INV;
    await put(DB1, `packages/${id}`, { tracking: id, trackingNumber: id, slCode: SL, customerName: 'HERMANOS QA', status: 'on_route', statusLabel: 'En Ruta', invoiceId: `ID-${inv}`, invoiceNumber: inv, invoiceStatus: 'paid', weight: 1, createdAt: new Date().toISOString() });
    await put(DB2, `shipments/${id}`, { tracking: id, slCode: SL, userId: uid, status: 'route', invoiceId: `ID-${inv}`, invoiceNumber: inv, createdAt: new Date().toISOString() });
  }
  await sleep(3000);

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Emulator-only limit: SP1's slUpdatePackage throws in the functions emulator (admin.firestore.FieldValue is not
  // exposed there; it is in production). The test answers that one callable by writing the same fields to SP1,
  // exactly like production; everything else (sibling lookup, slBulkUpdatePackageStatus, triggers, SP2) is real.
  await page.route('**/slUpdatePackage', async (route) => {
    const { data } = JSON.parse(route.request().postData() || '{}');
    const { packageId, ...fields } = data || {};
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
    await fetch(`${DB1}/packages/${packageId}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, enc(v)])) }) });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { success: true, data: { id: packageId } } }) });
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${APP}/packages`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
  await page.getByPlaceholder(/Buscar con JQL/).fill(T[0]); await page.keyboard.press('Enter');
  await page.getByText(T[0], { exact: true }).first().waitFor({ timeout: 30000 });

  await page.screenshot({ path: path.join(OUT, 'packages-0-search.png') });
  await page.getByText(T[0], { exact: true }).first().click({ button: 'right' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'packages-1-context.png') });
  await page.getByText('Actualizar Estado').first().hover(); await page.waitForTimeout(500);
  await page.getByRole('menuitem', { name: /^(Entregado|Delivered)/ }).first().click();
  const notice = page.getByTestId('invoice-siblings-notice');
  await notice.waitFor({ timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, 'packages-invoice-siblings.png') });
  const text = (await notice.count()) ? await notice.innerText() : '';
  check('1. La confirmación avisa los otros paquetes de la misma factura (marcados)', text.includes(T[1]) && text.includes(T[2]) && text.includes(INV) && (await page.getByTestId('invoice-sibling-check').evaluateAll((els) => els.every((e) => e.checked))), text.replace(/\s+/g, ' ').slice(0, 160));
  check('3. Un paquete de otra factura no aparece', !text.includes(TX));

  // partial: untick T[2]
  await notice.getByText(T[2]).locator('xpath=..').locator('input').uncheck();
  await page.getByRole('button', { name: /^(Confirmar|Confirm)$/ }).click();
  const s1 = await until(async () => (await st(DB1, `packages/${T[1]}`)) === 'delivered' && 'ok');
  const s2ok = await until(async () => (await st(DB2, `shipments/${T[0]}`)) === 'delivered' && (await st(DB2, `shipments/${T[1]}`)) === 'delivered' && 'ok');
  await sleep(3000);
  check('2a. SP1: el paquete y el marcado quedan Entregado', (await st(DB1, `packages/${T[0]}`)) === 'delivered' && !!s1);
  check('2b. SP1: el desmarcado no cambia', (await st(DB1, `packages/${T[2]}`)) === 'on_route');
  check('2c. SP2: los dos entregados, el desmarcado sigue En ruta, la otra factura intacta', !!s2ok && (await st(DB2, `shipments/${T[2]}`)) === 'route' && (await st(DB2, `shipments/${TX}`)) === 'route');
  await page.screenshot({ path: path.join(OUT, 'packages-invoice-siblings-after.png') });
  await b.close();
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
