// SP2 accounts through the REAL UI (browser, http://localhost:5175, QA emulator, real functions + Auth emulator):
//   0. the login has no Google button (removed 2026-09-26) and shows the note for former Google customers
//   1. home "¿Olvidaste tu contraseña?" → the Auth emulator records a PASSWORD_RESET e-mail for that account
//   2. admin → Usuarios → search the customer by SL → the user card opens
//   3. "Acceder como Usuario" → a link; opening it logs in AS THE CUSTOMER (their SL on the dashboard)
//   4. "Restablecer Contraseña → Enviar Correo de Recuperación" → PASSWORD_RESET recorded again
//   5. "Establecer Contraseña Manualmente" → the new password logs in, the old one no longer does
//   6. "Generar Enlace de Restablecimiento" (slSendPasswordReset) is NOT in the emulator (needs the e-mail secret):
//      checked in production with SL25001 (runbook)
//   7. a second registration with the same cédula (0-prefixed) or the same e-mail → rejected; nothing created
//   8. no JavaScript errors
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-admin-user-actions.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const AUTH = 'http://localhost:9099';
const OUT = process.env.OUT || require('os').tmpdir();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const oob = async (email) => ((await (await fetch(`${AUTH}/emulator/v1/projects/demo-sp-qa/oobCodes`)).json()).oobCodes || []).filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET').length;
const signIn = async (email, password) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());
const register = async (body) => (await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })).json());

(async () => {
  const email = `acciones-${t}@prueba.local`, PASS = 'Prueba1234!', NEWPASS = `Nueva${t}!Aa`;
  const dni = `1-06${t.slice(0, 2)}-${t.slice(-4)}`;
  const reg = await register({ email, password: PASS, firstName: 'Acciones', lastName: 'Admin', phone: `8${t}9`, dni, acceptTerms: true });
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) throw new Error('registro: ' + JSON.stringify(reg.error));

  const b = await chromium.launch();
  const mk = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] }); await c.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); }); return c; };
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => { if (!/Failed to fetch|network/i.test(e.message)) errors.push(e.message.slice(0, 140)); });
  try {
    // 1. Home: forgot password
    if (process.env.TRACE) console.log('>> step1');
    const home = await (await mk()).newPage(); watch(home);
    await home.goto('http://localhost:5175/'); await home.waitForTimeout(4000);
    await home.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
    await home.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await home.waitForTimeout(1500);
    check('0. El login ya no ofrece Google y muestra la guía para quien entraba con Google',
      (await home.locator('[data-testid="google-auth-button"]').count()) === 0 && (await home.getByText(/Iniciar Sesión con Google/).count()) === 0
      && (await home.locator('[data-testid="google-removed-note"]:visible').count()) === 1);
    // The note's "Crea tu contraseña aquí" opens the same recovery screen.
    await home.locator('[data-testid="google-removed-create-password"]:visible').first().click(); await home.waitForTimeout(800);
    const noteOpensRecovery = (await home.getByText('Recuperar Acceso').count()) > 0;
    await home.getByText('Inicia sesión', { exact: true }).first().click().catch(() => {}); await home.waitForTimeout(800);
    check('0b. "Crea tu contraseña aquí" (de la guía) abre la pantalla de recuperación', noteOpensRecovery);
    const before1 = await oob(email);
    await home.locator('button:has-text("¿Olvidaste tu contraseña?"):visible, a:has-text("¿Olvidaste tu contraseña?"):visible').first().click(); await home.waitForTimeout(1200);
    await home.getByText('Recuperar Acceso').first().waitFor({ timeout: 10000 });
    const recovery = home.locator('[data-testid="recovery-email-input"]:visible').first();
    await recovery.click(); await recovery.pressSequentially(email, { delay: 10 }); await home.waitForTimeout(400);
    await home.locator('[data-testid="recovery-submit"]:visible').first().click(); await home.waitForTimeout(3500);
    await home.screenshot({ path: path.join(OUT, 'acc-1-home-reset.png') });
    check('1. Home "¿Olvidaste tu contraseña?" → se genera el correo de recuperación para esa cuenta', (await oob(email)) > before1, `correos=${await oob(email)}`);

    // 2. Admin: users → search by SL → open the card
    if (process.env.TRACE) console.log('>> step2');
    const adm = await (await mk()).newPage(); watch(adm);
    await adm.goto('http://localhost:5175/'); await adm.waitForTimeout(3500);
    await adm.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await adm.goto('http://localhost:5175/slm/users'); await adm.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) { const x = adm.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await adm.waitForTimeout(600); }
    const box = adm.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
    await box.fill(sl); await box.press('Enter'); await adm.waitForTimeout(4000);
    await adm.getByText('Acciones Admin', { exact: true }).first().click(); await adm.waitForTimeout(2500);
    await adm.screenshot({ path: path.join(OUT, 'acc-2-user-card.png') });
    check('2. Admin → Usuarios: busca por SL y abre la ficha del cliente', (await adm.getByText('Acceder como Usuario').count()) > 0 && (await adm.getByText('Restablecer Contraseña').count()) > 0, sl);

    // 3. Impersonate
    if (process.env.TRACE) console.log('>> step3');
    await adm.getByText('Acceder como Usuario').first().click();
    await adm.getByText('Acceso Generado').first().waitFor({ timeout: 20000 }).catch(() => {});
    await adm.getByRole('button', { name: /Copiar Enlace/ }).first().click().catch(() => {}); await adm.waitForTimeout(800);
    const link = await adm.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    let impOk = false;
    if (link) {
      const imp = await (await mk()).newPage(); watch(imp);
      await imp.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:5175')); await imp.waitForTimeout(9000);
      for (let i = 0; i < 4; i++) { const x = imp.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await imp.waitForTimeout(700); }
      impOk = (await imp.locator('body').innerText()).includes(sl);
      await imp.screenshot({ path: path.join(OUT, 'acc-3-impersonated.png') });
    }
    check('3. "Acceder como Usuario" → "Copiar Enlace"; al abrirlo en otra sesión entra COMO el cliente (su SL en el dashboard)', /\/impersonate\?token=/.test(link) && impOk, link ? 'enlace generado' : 'sin enlace');

    // 4. Reset → e-mail
    if (process.env.TRACE) console.log('>> step4');
    // close the "Acceso Generado" panel (its X) — the admin buttons come back
    await adm.getByText('Acceso Generado').locator('xpath=ancestor::div[contains(@class,"bg-amber-50")][1]').locator('button').first().click().catch(() => {});
    await adm.waitForTimeout(800);
    await adm.getByText('Restablecer Contraseña').first().click(); await adm.waitForTimeout(1200);
    const before4 = await oob(email);
    await adm.getByText('Enviar Correo de Recuperación').first().click(); await adm.waitForTimeout(3500);
    check('4. "Restablecer Contraseña → Enviar Correo de Recuperación" → correo generado', (await oob(email)) > before4, `correos=${await oob(email)}`);

    // 5. Reset → manual password
    if (process.env.TRACE) console.log('>> step5');
    await adm.keyboard.press('Escape').catch(() => {}); await adm.waitForTimeout(500);
    if (!(await adm.getByText('Establecer Contraseña Manualmente').count())) { await adm.getByText('Restablecer Contraseña').first().click(); await adm.waitForTimeout(1200); }
    await adm.getByText('Establecer Contraseña Manualmente').first().click(); await adm.waitForTimeout(800);
    await adm.getByPlaceholder('Escribe la nueva contraseña').fill(NEWPASS);
    await adm.getByRole('button', { name: /^Establecer Contraseña$/ }).click(); await adm.waitForTimeout(3500);
    await adm.screenshot({ path: path.join(OUT, 'acc-5-manual.png') });
    const withNew = await signIn(email, NEWPASS), withOld = await signIn(email, PASS);
    check('5. "Establecer Contraseña Manualmente" → la nueva entra y la anterior ya no', withNew.localId === uid && !withOld.localId && (await adm.getByText('Contraseña Actualizada').count()) > 0);

    // 7. Duplicates are rejected (0-prefixed cédula / same e-mail)
    if (process.env.TRACE) console.log('>> step7');
    const d1 = await register({ email: `otro-${t}@prueba.local`, password: PASS, firstName: 'Dup', lastName: 'Cedula', phone: '88887777', dni: `0${dni.replace(/-/g, '')}`, acceptTerms: true });
    const d2 = await register({ email, password: PASS, firstName: 'Dup', lastName: 'Correo', phone: '88886666', dni: `1-05${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true });
    check('7. No se pueden crear cuentas duplicadas: misma cédula (con 0) o mismo correo → rechazado', !d1.result?.uid && !d2.result?.uid,
      JSON.stringify({ cedula: d1.error?.message?.slice(0, 60), correo: d2.error?.message?.slice(0, 60) }));
    check('8. Sin errores de JavaScript', errors.length === 0, errors.slice(0, 2).join(' | '));
  } catch (e) {
    console.error('ERR', e.message.split('\n')[0]);
    for (const pg of b.contexts().flatMap((c) => c.pages())) await pg.screenshot({ path: path.join(OUT, `acc-error-${Math.random().toString(36).slice(2, 6)}.png`) }).catch(() => {});
  } finally {
    await b.close();
    console.log(`\n${ok}/${n}`);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
