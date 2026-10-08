// Login from the HOME form — the real UI against the QA emulator (2026-09-29: the button had type=submit AND
// onClick, so every click signed in twice).
//   1. click "Ingresar" → ONE sign-in request, the customer ends up logged in
//   2. Enter in the password field → ONE sign-in request, logged in
//   3. wrong password → ONE request, a clear error, not logged in
// Run: NODE_PATH=<playwright dir>/node_modules [SP2_APP=http://localhost:5175/] node scripts/qa-emulator/e2e/sp2-login-home-form.cjs
const { chromium } = require('playwright');
const APP = process.env.SP2_APP || 'http://localhost:5175/';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const USER = { email: 'cliente1@prueba.local', password: 'Prueba1234!' };

async function attempt(b, { password, enter }) {
  const ctx = await b.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  let calls = 0; page.on('request', (r) => { if (/accounts:signInWithPassword/.test(r.url())) calls++; });
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('register-form').waitFor({ timeout: 30000 });
  await page.getByTestId('register-switch-to-login').click();
  await page.getByTestId('login-form').waitFor({ timeout: 15000 });
  await page.getByTestId('login-email-input').fill(USER.email);
  await page.getByTestId('login-password-input').fill(password);
  if (enter) await page.getByTestId('login-password-input').press('Enter'); else await page.getByTestId('login-submit').click();
  await page.waitForTimeout(6000);
  const uid = await page.evaluate(async () => { const { getAuth } = await import('/node_modules/.vite/deps/firebase_auth.js'); return getAuth().currentUser?.uid || null; }).catch(() => null);
  const text = await page.locator('body').innerText();
  await ctx.close();
  return { calls, uid, text };
}

(async () => {
  const b = await chromium.launch();
  let r = await attempt(b, { password: USER.password });
  check('1. Clic en "Ingresar" → una sola petición de inicio de sesión y entra', r.calls === 1 && !!r.uid, `peticiones ${r.calls}, sesión ${r.uid ? 'sí' : 'no'}`);
  r = await attempt(b, { password: USER.password, enter: true });
  check('2. Enter en la contraseña → una sola petición y entra', r.calls === 1 && !!r.uid, `peticiones ${r.calls}, sesión ${r.uid ? 'sí' : 'no'}`);
  r = await attempt(b, { password: 'Incorrecta999!' });
  const err = r.text.match(/[^\n]*(contraseña|credenciales|incorrect)[^\n]*/i);
  check('3. Contraseña incorrecta → una sola petición, mensaje claro, sin sesión', r.calls === 1 && !r.uid && !!err, `peticiones ${r.calls} · ${err ? err[0].slice(0, 80) : 'sin mensaje'}`);
  await b.close();
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
