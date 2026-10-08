// SP2 admin → Usuarios → Editar → "Direcciones": GERENCIA can always change the customer's address (last resort),
// through the REAL UI (http://localhost:5175, QA emulator, real functions). The worst case at once:
//   - the address lives ONLY in the users doc (F12 single-v1, no copy in `addresses`)
//   - it is outside the GAM (Limón → "requires encomienda") and the admin picks no encomienda
//   - the customer already used this month's 2 address changes
//   - a legacy extra address (not principal) still sits in `addresses`
// Checks:
//   0. the tab shows ONLY the principal address, with no "Agregar" and no delete button (one address per customer)
//   1. the admin saves the change and SP1 CONFIRMS it in the same step (SP1 customer updated, logged)
//   2. the customer's address (users doc) has the new text; the other fields are kept (never erased)
//   3. the encomienda it already had is kept (not erased because none was picked)
//   4. the customer's monthly limit does not apply to the admin (and is not consumed)
//   5. SP1 gets the new address (customer record)
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-admin-edit-address.cjs
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
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { integerValue: String(x) }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } }
  : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const patch = (base, p, o) => fetch(`${base}/${p}?${Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const register = async (body) => (await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })).json());
const signIn = async (email, password) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const m = (f) => f?.mapValue?.fields || {};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});

(async () => {
  let adm = await signIn('admin2@prueba.local', 'Prueba1234!');
  if (!adm.localId) adm = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await patch(DB2, `users/${adm.localId}`, { role: 'admin', email: 'admin2@prueba.local', firstName: 'Admin', lastName: 'QA', status: 'active' });
  const reg = await register({ email: `dir-${t}@prueba.local`, password: 'Prueba1234!', firstName: 'Direccion', lastName: 'Bloqueada', phone: `8${t}5`, dni: `1-06${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true });
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) { console.error('ERR registro', JSON.stringify(reg.error)); process.exit(1); }
  const ADDR_ID = `QAADDR${t}`, OLD_STREET = `Barrio Viejo ${t}, casa 4`, NEW_STREET = `Barrio Nuevo ${t}, casa 9`;
  const now = new Date(), monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const block = { id: ADDR_ID, userId: uid, alias: 'Casa', type: 'home', streetAddress: OLD_STREET, details: `Portón verde ${t}`, province: 'Limón', canton: 'Limón', district: 'Limón',
    country: 'CR', isPrimary: true, isDefault: true, status: 'active', isActive: true, recipientPhone: '88887777', requiresEncomienda: true,
    encomienda: { id: 'qa-enc', name: `Encomienda QA ${t}`, phone: '2222-2222' }, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  // Only in the users doc (no `addresses/{id}` copy) + the monthly limit already used.
  await patch(DB2, `users/${uid}`, { addressModel: 'single-v1', defaultAddress: block, addresses: [block], primaryAddressChanges: { count: 2, monthKey, lastChangedAt: now.toISOString() } });
  await patch(DB2, `addresses/QAOLD${t}`, { userId: uid, alias: 'Vieja', streetAddress: `Direccion vieja extra ${t}`, isPrimary: false, isDefault: false, createdAt: now.toISOString() });
  await pause(3000);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x) => page.screenshot({ path: path.join(OUT, `addr-${x}.png`) }).catch(() => {});
  try {
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await page.goto('http://localhost:5175/slm/users'); await page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
    const box = page.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
    await box.fill(sl); await box.press('Enter'); await page.waitForTimeout(4000);
    await page.getByText('Direccion Bloqueada', { exact: true }).first().click(); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Direcciones/ }).first().click(); await page.waitForTimeout(2500);
    await shot('1-tab');
    const main = page;
    const rules = await page.getByTestId('address-change-rules').innerText().catch(() => '');
    await page.getByTestId('address-change-rules').screenshot({ path: path.join(OUT, 'addr-0-banner.png') }).catch(() => {});
    check('0b. Banner para servicio al cliente: cuándo el cliente SÍ / con aviso / NO puede cambiar su dirección',
      /Sí puede/.test(rules) && /Pre-alertado/.test(rules) && /En consolidación/.test(rules) && /con aviso/.test(rules) && /En aduanas/.test(rules)
      && /No puede/.test(rules) && /En ruta/.test(rules) && /Facturado/.test(rules) && /Retenido/.test(rules) && /Retira en oficina/.test(rules), rules.replace(/\s+/g, ' ').slice(0, 140));
    check('0. Solo la dirección principal, sin "Agregar" ni "Eliminar"', (await main.getByRole('button', { name: 'Editar dirección' }).count()) === 1
      && !(await main.getByRole('button', { name: /^Agregar$/ }).count()) && !(await main.getByRole('button', { name: 'Eliminar dirección' }).count())
      && !(await main.getByText(`Direccion vieja extra ${t}`).count()) && (await main.getByText(OLD_STREET).count()) > 0);
    await page.getByRole('button', { name: 'Editar dirección' }).first().click(); await page.waitForTimeout(2000);
    const dlg = page.getByTestId('admin-address-modal');
    check('0b. Modal de gerencia (propio): aviso "Modo Gerencia" y encomienda opcional', (await dlg.getByText(/Modo Gerencia/).count()) > 0 && (await dlg.getByText(/opcional para gerencia/).count()) > 0);
    await dlg.getByTestId('admin-address-street-input').fill(NEW_STREET); await page.waitForTimeout(500);
    await shot('2-form');
    await dlg.getByRole('button', { name: /Guardar Cambios/ }).click(); await page.waitForTimeout(5000);
    await shot('3-saved');
    const errText = await page.getByTestId('admin-address-error').innerText({ timeout: 1000 }).catch(() => '');
    const sp1Ok = await page.getByTestId('admin-address-sp1-ok').isVisible().catch(() => false);
    const pend = await page.getByTestId('admin-address-sp1-pending').innerText({ timeout: 500 }).catch(() => '');
    check('1. Gerencia guarda y SP1 CONFIRMA en el mismo paso (mensaje verde)', !errText && sp1Ok, errText || pend);
    const c1now = await get(DB1, `customers/${sl}`);
    check('1b. SP1 ya tiene la dirección nueva al confirmar (sin esperar al trigger)', JSON.stringify(c1now || {}).includes(NEW_STREET));
    const alog = ((await (await fetch(`${DB2}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'address_changes' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } } } }) })).json()).filter((r) => r.document)).map((r) => r.document.fields);
    check('1c. Log en address_changes: quién, antes → después, SP1 confirmado', alog.length === 1 && v(alog[0].performedByEmail) === 'admin2@prueba.local'
      && v(m(alog[0].before).streetAddress) === OLD_STREET && v(m(alog[0].after).streetAddress) === NEW_STREET && v(m(alog[0].sp1).confirmed) === true);
    await page.getByTestId('admin-address-close').click().catch(() => {}); await page.waitForTimeout(800);
    check('1d. El modal se cierra con "Cerrar"', !(await page.getByTestId('admin-address-modal').count()));
    const u = await get(DB2, `users/${uid}`), a = m(u?.defaultAddress);
    check('2. La dirección del cliente tiene el texto nuevo y conserva sus otros datos', v(a.streetAddress) === NEW_STREET && v(a.details) === `Portón verde ${t}` && v(a.recipientPhone) === '88887777' && v(a.province) === 'Limón',
      JSON.stringify({ calle: v(a.streetAddress), señas: v(a.details), tel: v(a.recipientPhone) }));
    check('3. La encomienda que ya tenía se conserva (no se borra por no elegir otra)', v(m(a.encomienda).name) === `Encomienda QA ${t}`, JSON.stringify(v(m(a.encomienda).name) || null));
    check('4. El límite mensual del cliente no aplica a gerencia (y no se consume)', Number(v(m(u?.primaryAddressChanges).count)) === 2 && v(u?.profileLastUpdatedBy) === 'admin');
    let c1 = null;
    for (let i = 0; i < 20; i++) { c1 = await get(DB1, `customers/${sl}`); if (JSON.stringify(c1 || {}).includes(NEW_STREET)) break; await pause(1500); }
    check('4b. La dirección vieja extra no se toca (nada se borra)', !!(await get(DB2, `addresses/QAOLD${t}`)));
    check('5. SP1 recibe la dirección nueva (ficha del cliente)', JSON.stringify(c1 || {}).includes(NEW_STREET));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
