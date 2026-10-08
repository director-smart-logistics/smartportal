// SP2 admin → Usuarios → "Eliminar" through the REAL UI (http://localhost:5175, QA emulator, real functions + Auth).
// One "Eliminar" for SP1 + SP2 (2026-09-29): an account WITH history is never deleted — the modal says why and
// offers "Deshabilitar acceso" (the account stays identical in SP1 and SP2). Without history see
// sp1-sp2-account-delete.cjs.
//   1. without a reason the delete button stays disabled
//   2. the customer has a shipment → "Eliminar" is refused with the reason; nothing deleted
//   3. the refusal is logged in admin_email_actions (who, why)
//   4. "Deshabilitar acceso" → the customer can no longer sign in; the account and its shipment stay
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-admin-delete-user.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const AUTH = 'http://localhost:9099';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const register = async (body) => (await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })).json());
const signIn = async (email, password) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());
const get = async (p) => { const r = await fetch(`${DB2}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});

(async () => {
  // Test admin (created by earlier runner steps; created here when this test runs alone).
  let adm = await signIn('admin2@prueba.local', 'Prueba1234!');
  if (!adm.localId) adm = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await fetch(`${DB2}/users/${adm.localId}?updateMask.fieldPaths=role&updateMask.fieldPaths=email&updateMask.fieldPaths=firstName&updateMask.fieldPaths=lastName&updateMask.fieldPaths=status`, { method: 'PATCH', headers: H,
    body: JSON.stringify({ fields: { role: { stringValue: 'admin' }, email: { stringValue: 'admin2@prueba.local' }, firstName: { stringValue: 'Admin' }, lastName: { stringValue: 'QA' }, status: { stringValue: 'active' } } }) });
  const email = `borrar-${t}@prueba.local`, PASS = 'Prueba1234!', REASON = `Cuenta de prueba QA ${t}`;
  const reg = await register({ email, password: PASS, firstName: 'Borrar', lastName: 'Prueba', phone: `8${t}7`, dni: `1-07${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true });
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) { console.error('ERR registro', JSON.stringify(reg.error)); process.exit(1); }
  await fetch(`${DB2}/shipments/QADEL${t}?`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { userId: { stringValue: uid }, slCode: { stringValue: sl }, tracking: { stringValue: `QADEL${t}` } } }) });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x) => page.screenshot({ path: path.join(OUT, `del-${x}.png`) }).catch(() => {});
  try {
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await page.goto('http://localhost:5175/slm/users'); await page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
    const box = page.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
    await box.fill(sl); await box.press('Enter'); await page.waitForTimeout(4000);
    await page.getByText('Borrar Prueba', { exact: true }).first().click(); await page.waitForTimeout(2500);
    await page.getByText('Eliminar Usuario', { exact: true }).first().click(); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Continuar/ }).first().click(); await page.waitForTimeout(800);
    const dlg = page.getByRole('dialog').last();
    await dlg.getByLabel(new RegExp(`Escribe ${sl}`)).fill(sl);
    const delBtn = dlg.getByRole('button', { name: /Eliminar/ }).last();
    check('1. Sin motivo, el botón de eliminar sigue deshabilitado', await delBtn.isDisabled());
    await dlg.getByTestId('delete-user-reason').fill(REASON); await page.waitForTimeout(300); await shot('1-ready');
    check('1b. Con SL y motivo, el botón se habilita', await delBtn.isEnabled());
    await delBtn.click(); await page.waitForTimeout(5000); await shot('2-done');
    const blockedTxt = await dlg.getByTestId('delete-user-blocked').innerText().catch(() => '');
    const u = await get(`users/${uid}`);
    check('2. Con historial no se elimina: el modal dice por qué y la cuenta sigue', /historial/.test(blockedTxt) && v(u?.status) === 'active', blockedTxt.slice(0, 120));
    const logs = ((await (await fetch(`${DB2}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'admin_email_actions' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } } } }) })).json()).filter((r) => r.document)).map((r) => r.document.fields);
    check('3. El rechazo queda registrado (quién y por qué)', logs.some((l) => v(l.action) === 'delete_refused' && v(l.performedByEmail) === 'admin2@prueba.local' && v(l.reason) === REASON));
    await dlg.getByTestId('delete-user-disable-login').click(); await page.waitForTimeout(3500); await shot('3-disabled');
    const s = await signIn(email, PASS);
    const u2 = await get(`users/${uid}`);
    check('4. "Deshabilitar acceso": el cliente no puede entrar; la cuenta y su envío siguen', !s.localId && /USER_DISABLED/.test(JSON.stringify(s.error || {})) && v(u2?.status) === 'active' && !!(await get(`shipments/QADEL${t}`)), s.error?.message);
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await fetch(`${DB2}/shipments/QADEL${t}`, { method: 'DELETE', headers: H });
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
