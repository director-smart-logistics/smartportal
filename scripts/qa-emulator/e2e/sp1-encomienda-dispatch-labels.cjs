// Encomiendas → Salida (REAL SP1 app on the QA emulator): the shipping labels print the customer's PRINCIPAL
// address (F11, docs/F11_LABEL_ADDRESS_AUDIT.md) — never an inactive address, and the admin's hand-typed address
// only while it is newer than the customer's address.
//   SL90031: an inactive default address + an active one + an OLD admin correction → prints the active address
//   SL90032: principal address + a NEWER admin correction → prints the admin correction
// READ-ONLY with respect to the app's code: it drives the UI and reads the printed label. Test data is removed at the end.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-encomienda-dispatch-labels.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, pause(ms)]).catch(() => {});
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (p, o) => fetch(`${DB1}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const del = (p) => fetch(`${DB1}/${p}`, { method: 'DELETE', headers: H });

const M = 'ENC-QA-DISP', now = new Date().toISOString();
const DATA = {
  'customers/SL90031': { slCode: 'SL90031', fullName: 'Cliente Despacho Uno', ruta: 'Encomiendas', status: 'active', encomiendaServiceName: 'Encomiendas QA',
    addresses: [{ streetAddress: 'Calle Inactiva 1', province: 'San José', isActive: false, isDefault: true },
                { streetAddress: 'Avenida Principal 500', details: 'Porton negro', district: 'Carmen', canton: 'San José', province: 'San José', isActive: true, isDefault: false, updatedAt: '2026-09-01T00:00:00.000Z' }],
    adminAddressOverride: { deliveryAddress: 'Direccion vieja del admin', savedAt: '2026-01-01T00:00:00.000Z' } },
  'customers/SL90032': { slCode: 'SL90032', fullName: 'Cliente Despacho Dos', ruta: 'Encomiendas', status: 'active', encomiendaServiceName: 'Encomiendas QA',
    defaultAddress: { streetAddress: 'Calle Cliente 2', province: 'Alajuela', isActive: true, updatedAt: '2026-01-01T00:00:00.000Z' },
    adminAddressOverride: { deliveryAddress: 'Correccion admin nueva 77', savedAt: '2026-09-20T00:00:00.000Z' } },
  [`manifests/${M}`]: { manifestNumber: M, isEncomienda: true, createdAt: now },
};
for (const [i, sl, name] of [[1, 'SL90031', 'Cliente Despacho Uno'], [2, 'SL90032', 'Cliente Despacho Dos']]) {
  const inv = `INVQADISP${i}`, trk = `DISPQA000${i}`;
  // The screen shows PAID invoices by default.
  DATA[`invoices/${inv}`] = { invoiceNumber: inv, slCode: sl, clientSlCode: sl, customerId: sl, clientName: name, clientRoute: 'Encomiendas', ruta: 'Encomiendas', status: 'paid',
    manifestNumber: M, manifestNumbers: [M], trackingNumbers: [trk], totalAmount: 10, total: 10, currency: 'USD', createdAt: now, issueDate: now,
    invoiceItems: [{ trackingNumber: trk, description: 'Paquete QA', unitPrice: 10, totalPrice: 10, quantity: 1 }] };
  DATA[`packages/${trk}`] = { trackingNumber: trk, tracking: trk, slCode: sl, customerId: sl, customerName: name, ruta: 'Encomiendas', status: 'processed', manifestNumber: M, manifestId: M, invoiceId: inv, invoiceNumber: inv, weight: 1, price: 10, createdAt: now };
  DATA[`packages/${inv}`] = { trackingNumber: inv, tracking: inv, isMasterPackage: true, slCode: sl, customerId: sl, ruta: 'Encomiendas', status: 'processed', manifestNumber: M, updatedManifest: M, invoiceId: inv, invoiceNumber: inv, createdAt: now };
}

(async () => {
  for (const [p, o] of Object.entries(DATA)) await put(p, o);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `disp-${name}.png`) }).catch(() => {});
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
    await popup.waitForLoadState('domcontentloaded'); await popup.getByText('admin@prueba.local').first().click();
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    await page.goto(`${APP}/encomiendas/salida`); await page.waitForTimeout(5000);
    await page.getByRole('button', { name: /Cargar Datos/ }).first().click(); await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Cargar de todas formas/ }).click().catch(() => {});
    await page.getByText('Cliente Despacho Uno').first().waitFor({ timeout: 60000 });
    await page.getByText('Cliente Despacho Dos').first().waitFor({ timeout: 30000 });
    await pause(3000); await shot('0-loaded');
    await page.getByLabel('Seleccionar facturas de Cliente Despacho Uno').click();
    await page.getByLabel('Seleccionar facturas de Cliente Despacho Dos').click();
    await pause(800);
    const [labels] = await Promise.all([ctx.waitForEvent('page', { timeout: 30000 }), page.locator('#btn-print-shipping-labels').click()]);
    await labels.waitForLoadState('domcontentloaded').catch(() => {}); await pause(1500);
    const text = (await labels.locator('body').innerText()).replace(/\s+/g, ' ').toUpperCase();   // the label prints in capitals
    await labels.screenshot({ path: path.join(OUT, 'disp-1-labels.png'), fullPage: true }).catch(() => {});
    const i1 = text.indexOf('CLIENTE DESPACHO UNO'), i2 = text.indexOf('CLIENTE DESPACHO DOS');
    const part = (a, bIdx) => text.slice(a, bIdx > a ? bIdx : undefined);
    const one = i1 < 0 ? '' : part(i1, i2 > i1 ? i2 : text.length), two = i2 < 0 ? '' : part(i2, i1 > i2 ? i1 : text.length);
    check('1. Se imprimen las 2 etiquetas', i1 >= 0 && i2 >= 0, `${text.length} caracteres`);
    check('2. SL90031: imprime su dirección principal activa (calle y otras señas)', /AVENIDA PRINCIPAL 500/.test(one) && /PORTON NEGRO/.test(one), one.slice(0, 200));
    check('2b. SL90031: imprime también distrito, cantón y provincia (regla F11)', /CARMEN/.test(one));
    check('3. SL90031: NO imprime la dirección inactiva', !/CALLE INACTIVA 1/.test(one));
    check('4. SL90031: NO imprime la corrección vieja del admin (el cliente cambió su dirección después)', !/DIRECCION VIEJA DEL ADMIN/.test(one));
    check('5. SL90032: imprime la corrección del admin (más nueva que la dirección del cliente)', /CORRECCION ADMIN NUEVA 77/.test(two), two.slice(0, 200));
    const after = await Promise.all(['customers/SL90031', 'customers/SL90032'].map(async (p) => (await (await fetch(`${DB1}/${p}`, { headers: H })).json()).fields));
    check('6. Imprimir no cambia nada del cliente (dirección y corrección intactas)',
      JSON.stringify(after[0].addresses) === JSON.stringify(enc(DATA['customers/SL90031'].addresses)) && after[1].adminAddressOverride?.mapValue?.fields?.deliveryAddress?.stringValue === 'Correccion admin nueva 77');
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit((async () => { for (const p of Object.keys(DATA)) await del(p); })(), 30000);
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
