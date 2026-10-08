// SP1 "Generar etiqueta" modal (2026-10-07, owner): when an admin typed an address for the customer, the modal shows
// BOTH (customer's SmartWeb address and the admin's) with dates, marks the newer one and warns; the default choice is
// unchanged (activeAdminOverride). Nothing is generated or written by this test.
//   0. no admin address → no comparison (as before)
//   1. admin address without date (before F11) → both shown, admin preselected, "no tiene fecha" warning; picking the
//      customer card uses the customer's address
//   2. admin address older than the customer's → customer marked newer + warning, customer preselected
//   3. admin address newer → admin marked newer, no warning, admin preselected
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-label-modal-both-addresses.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const SL = 'SL90025', TRK = 'LBLQA0002', M = 'ENC-QA-LBL2', EMAIL = 'cliente-lbl2-ui@prueba.local', PASS = 'Prueba1234!';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1', J = { 'Content-Type': 'application/json' };
const ADDR = { streetAddress: 'Del parque 100 m sur', details: 'Casa azul', deliveryInstructions: 'Llamar al llegar', province: 'Heredia', canton: 'Barva', district: 'San Pedro', country: 'Costa Rica', recipientName: 'Cliente Dos Direcciones' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, pause(ms)]).catch(() => {});
const raw = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? r.json() : null; };
const sv = (f) => f?.stringValue;
const runQuery = async (base, coll, field, value) => (await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json()).filter((r) => r.document).map((r) => r.document);
/** Put a document back exactly as it was (fields added later are removed). */
const restore = async (base, p, before) => {
  const now = await raw(base, p);
  if (!before) { if (now) await fetch(`${base}/${p}`, { method: 'DELETE', headers: H }); return; }
  const keys = [...new Set([...Object.keys(before.fields || {}), ...Object.keys(now?.fields || {})])];
  const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent('`' + k + '`')}`).join('&');
  await fetch(`${base}/${p}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: before.fields || {} }) });
};

const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const putDoc = (base, p, o) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const addrOf = (d) => { const a = d?.fields?.defaultAddress?.mapValue?.fields || {}; return Object.fromEntries(Object.entries(a).filter(([k]) => ['streetAddress', 'details', 'deliveryInstructions', 'province', 'canton', 'district', 'recipientName'].includes(k)).map(([k, v]) => [k, sv(v)])); };

(async () => {
  // QA customer: Auth account + SP2 users doc (single-v1) + address; SP2 pushes it to SP1.
  const up = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) })).json();
  const uid = up.localId || (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) })).json()).localId;
  const uidPath = `users/${uid}`;
  const block = { ...ADDR, id: `${SL}-A`, userId: uid, isDefault: true, isPrimary: true, isActive: true, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  await putDoc(DB2, `addresses/${SL}-A`, block);
  await putDoc(DB2, uidPath, { uid, email: EMAIL, slCode: SL, firstName: 'Cliente', lastName: 'Dos Direcciones', dni: '100090024', phone: '88882222', role: 'customer', status: 'active', isActive: true, isVerified: true,
    defaultAddress: block, addresses: [block], addressModel: 'single-v1' });
  await putDoc(DB1, `customers/${SL}`, { slCode: SL, fullName: 'Cliente Dos Direcciones', email: EMAIL, ruta: 'Encomiendas', status: 'active', defaultAddress: block, addresses: [block] });
  await pause(6000);
  const snap = { u: null, c: null, a: {} };   // created by this test → removed at the end
  await fetch(`${DB1}/packages/${TRK}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { trackingNumber: { stringValue: TRK }, tracking: { stringValue: TRK }, slCode: { stringValue: SL },
    customerName: { stringValue: 'Cliente Dos Direcciones' }, ruta: { stringValue: 'Encomiendas' }, status: { stringValue: 'customs' }, manifestNumber: { stringValue: M }, weight: { doubleValue: 1 }, createdAt: { stringValue: new Date().toISOString() } } }) });

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `lbl2-${name}.png`) }).catch(() => {});
  const sp2 = async () => { const d = await raw(DB2, uidPath); return { addr: addrOf(d), fields: d?.fields || {} }; };
  const changedKeys = (x, y) => Object.keys({ ...x.fields, ...y.fields }).filter((k) => JSON.stringify(x.fields[k]) !== JSON.stringify(y.fields[k]));
  const openLabel = async () => {
    await page.goto(`${APP}/encomiendas/manifests`); await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /Refrescar caché/ }).first().click().catch(() => {}); await page.waitForTimeout(6000);
    await page.getByText(M).first().click(); await page.waitForTimeout(2500);
    if (!(await page.locator('button[title="Generar etiqueta"]').count())) { await page.getByText(/Cliente Dos Direcciones/i).first().click().catch(() => {}); await page.waitForTimeout(2500); }
    await page.locator('button[title="Generar etiqueta"]').first().click();
    await page.locator('#nova-label-address').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
    // The courier service is required to print; the QA customer has none.
    const courier = page.locator('#nova-label-courier');
    if (!(await courier.inputValue())) { await courier.fill('Correos de Costa Rica'); await page.getByText('Dirección de Entrega', { exact: false }).first().click(); await pause(500); }
  };

  const setOverride = (o) => o ? putDoc(DB1, `customers/${SL}`, { slCode: SL, fullName: 'Cliente Dos Direcciones', email: EMAIL, ruta: 'Encomiendas', status: 'active', defaultAddress: block, addresses: [block], adminAddressOverride: o })
                               : putDoc(DB1, `customers/${SL}`, { slCode: SL, fullName: 'Cliente Dos Direcciones', email: EMAIL, ruta: 'Encomiendas', status: 'active', defaultAddress: block, addresses: [block] });
  const state = async () => ({
    panel: await page.getByTestId('label-address-compare').count(),
    clientSel: await page.getByTestId('label-address-option-client').getAttribute('aria-pressed').catch(() => null),
    adminSel: await page.getByTestId('label-address-option-admin').getAttribute('aria-pressed').catch(() => null),
    newerClient: await page.getByTestId('label-address-newer-client').count(), newerAdmin: await page.getByTestId('label-address-newer-admin').count(),
    warn: (await page.getByTestId('label-address-warning').allInnerTexts().catch(() => [])).join(' '),
    text: await page.locator('#nova-label-address').inputValue(),
  });
  const close = async () => { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(800); };
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
    await popup.waitForLoadState('domcontentloaded');
    if (await popup.getByText('admin@prueba.local').count()) await popup.getByText('admin@prueba.local').first().click();
    else { await popup.getByText(/Add new account/i).first().click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
    await page.waitForURL(/dashboard/, { timeout: 30000 });

    // 0 — no admin address → no comparison panel (as before)
    await setOverride(null); await pause(1500); await openLabel();
    let s = await state(); await shot('0-sin-admin');
    check('0. Sin dirección escrita por admin: no aparece la comparación (igual que antes)', s.panel === 0 && /Del parque 100 m sur/.test(s.text), JSON.stringify({ panel: s.panel }));
    await close();

    // 1 — legacy admin address (no date): both shown, admin preselected (unchanged default), "sin fecha" warning
    await setOverride({ deliveryAddress: 'ESCRITA ADMIN VIEJA 123, Liberia', courierService: 'Correos de Costa Rica' }); await pause(1500); await openLabel();
    s = await state(); await shot('1-sin-fecha');
    check('1. Dirección del admin SIN fecha: se ven las dos, la del admin queda elegida como antes y avisa que no se sabe cuál es más reciente',
      s.panel === 1 && s.adminSel === 'true' && s.clientSel === 'false' && /no tiene fecha/.test(s.warn) && /ESCRITA ADMIN VIEJA/.test(s.text) && !s.newerClient && !s.newerAdmin, JSON.stringify(s).slice(0, 220));
    await page.getByTestId('label-address-option-client').click(); await pause(600);
    s = await state(); await shot('1b-elige-cliente');
    check('1b. Al tocar la tarjeta del cliente se usa su dirección', s.clientSel === 'true' && /Del parque 100 m sur/.test(s.text) && !/ESCRITA ADMIN/.test(s.text), s.text.slice(0, 80));
    await close();

    // 2 — admin address OLDER than the customer's: client newer + warning; client preselected (activeAdminOverride)
    await setOverride({ deliveryAddress: 'ADMIN ANTIGUA 456', courierService: 'Correos de Costa Rica', savedAt: '2025-12-01T00:00:00.000Z' }); await pause(1500); await openLabel();
    s = await state(); await shot('2-cliente-mas-reciente');
    check('2. El cliente cambió su dirección DESPUÉS: "Más reciente" en la del cliente, aviso, y se usa la del cliente',
      s.panel === 1 && s.newerClient === 1 && !s.newerAdmin && /actualizó su dirección después/.test(s.warn) && s.clientSel === 'true' && /Del parque 100 m sur/.test(s.text), JSON.stringify(s).slice(0, 220));
    await close();

    // 3 — admin address NEWER: admin newer, no warning, admin preselected
    await setOverride({ deliveryAddress: 'ADMIN NUEVA 789, Nicoya', courierService: 'Correos de Costa Rica', savedAt: '2026-06-01T00:00:00.000Z' }); await pause(1500); await openLabel();
    s = await state(); await shot('3-admin-mas-reciente');
    check('3. La del admin es más nueva: "Más reciente" en la del admin, sin aviso, se usa la del admin',
      s.panel === 1 && s.newerAdmin === 1 && !s.newerClient && !s.warn && s.adminSel === 'true' && /ADMIN NUEVA 789/.test(s.text), JSON.stringify(s).slice(0, 220));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 15000);
    for (const p of [`packages/${TRK}`, `customers/${SL}`]) await fetch(`${DB1}/${p}`, { method: 'DELETE', headers: H });
    for (const p of [uidPath, `addresses/${SL}-A`]) await fetch(`${DB2}/${p}`, { method: 'DELETE', headers: H });
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
