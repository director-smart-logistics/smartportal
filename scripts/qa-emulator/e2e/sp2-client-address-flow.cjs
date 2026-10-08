// SP2 customer dashboard — the customer's OWN address flow must keep working (regression guard for the
// admin address changes of 2026-09-27), through the REAL UI (http://localhost:5175, QA emulator):
//   1. a customer WITHOUT address sees the complete-your-information modal ("Información incompleta")
//   2. the left card says there is no address, with the "+" (Agregar dirección) and "Agregar Dirección" buttons
//   3. "+" → the customer adds the principal address (province / district / street) → saved in users (single-v1)
//   4. SP1 gets it (customer record, what the labels print)
//   5. the card shows it; "Editar dirección" → the customer edits it → users + SP1 updated
//   6. after reload that modal no longer shows
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-client-address-flow.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB2 = `${B}/(default)/documents`, DB1 = `${B}/portal/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const m = (f) => f?.mapValue?.fields || {};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});
const waitSp1 = async (sl, text) => { let c = null; for (let i = 0; i < 20; i++) { c = await get(DB1, `customers/${sl}`); if (JSON.stringify(c || {}).includes(text)) return true; await pause(1500); } return false; };

(async () => {
  const email = `sindir-${t}@prueba.local`, PASS = 'Prueba1234!';
  const reg = await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { email, password: PASS, firstName: 'Sin', lastName: 'Direccion', phone: `8${t}3`, dni: `1-05${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true } }) })).json();
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) { console.error('ERR registro', JSON.stringify(reg.error)); process.exit(1); }
  const STREET1 = `Del parque central 100 m norte ${t}`, STREET2 = `Del parque central 300 m sur ${t}`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x) => page.screenshot({ path: path.join(OUT, `cliaddr-${x}.png`) }).catch(() => {});
  try {
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
    await page.evaluate(async ([e, p]) => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), e, p); }, [email, PASS]);
    await page.goto('http://localhost:5175/account'); await page.waitForTimeout(8000);
    await shot('1-modal');
    const infoModal = page.getByText(/Información incompleta|Necesitamos tu información/);
    check('1. Sin dirección: sale el modal de completar la información (Dirección de entrega)', (await infoModal.count()) > 0 && (await page.getByText('Dirección de entrega').count()) > 0);
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }
    const card = page.getByTestId('delivery-addresses-card');
    const plus = card.getByTestId('delivery-addresses-add-button');
    check('2. La tarjeta dice que no hay dirección, con "+" y "Agregar Dirección"', (await card.getByTestId('delivery-addresses-empty-add-button').count()) === 1
      && (await plus.getAttribute('aria-label')) === 'Agregar dirección');
    await shot('2-card');
    await plus.click(); await page.waitForTimeout(1500);
    // "Mis Direcciones" (empty) → "Agregar Dirección" → choose type → form
    const addInList = page.getByRole('button', { name: /Agregar Dirección/ }).last();
    if (!(await page.getByTestId('address-choose-type-exact').count()) && await addInList.count()) { await addInList.click(); await page.waitForTimeout(1200); }
    if (await page.getByTestId('address-choose-type-exact').count()) { await page.getByTestId('address-choose-type-exact').click(); await page.waitForTimeout(1200); }
    await page.getByTestId('location-province-button').first().click(); await page.waitForTimeout(400);
    await page.getByTestId('location-province-option-San José').first().click(); await page.waitForTimeout(400);
    await page.getByTestId('location-district-input').first().fill('San Pedro'); await page.waitForTimeout(800);
    await page.locator('[data-testid^="location-district-option-"]').first().click(); await page.waitForTimeout(500);
    await page.getByPlaceholder('Dirección completa').first().fill(STREET1); await page.waitForTimeout(300);
    await shot('3-form');
    await page.getByRole('button', { name: /^Guardar/ }).last().click(); await page.waitForTimeout(6000);
    const u1 = await get(DB2, `users/${uid}`), a1 = m(u1?.defaultAddress);
    check('3. El cliente agrega su dirección principal (users single-v1)', v(u1?.addressModel) === 'single-v1' && v(a1.streetAddress) === STREET1 && v(a1.province) === 'San José',
      JSON.stringify({ model: v(u1?.addressModel), calle: v(a1.streetAddress), prov: v(a1.province), canton: v(a1.canton) }));
    check('4. SP1 recibe la dirección (etiquetas)', await waitSp1(sl, STREET1));
    await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(3000);
    await page.goto('http://localhost:5175/account'); await page.waitForTimeout(9000);
    check('6. Al recargar ya no sale el modal de completar la información', (await page.getByText(/Información incompleta|Necesitamos tu información/).count()) === 0);
    for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
    const card2 = page.getByTestId('delivery-addresses-card');
    check('5a. La tarjeta muestra la dirección y el botón pasa a "Editar dirección"', (await card2.getByTestId('delivery-address-item').count()) === 1
      && (await card2.getByTestId('delivery-addresses-add-button').getAttribute('aria-label')) === 'Editar dirección');
    await card2.getByTestId('delivery-addresses-add-button').click(); await page.waitForTimeout(2500);
    await page.getByPlaceholder('Dirección completa').first().fill(STREET2); await page.waitForTimeout(300);
    await shot('5-edit');
    await page.getByRole('button', { name: /^Guardar/ }).last().click(); await page.waitForTimeout(6000);
    const a2 = m((await get(DB2, `users/${uid}`))?.defaultAddress);
    check('5b. El cliente edita su dirección (users actualizado, sin duplicar)', v(a2.streetAddress) === STREET2 && v(a2.id) === v(a1.id), JSON.stringify({ calle: v(a2.streetAddress) }));
    check('5c. SP1 recibe la edición', await waitSp1(sl, STREET2));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
