// D-2 — a login never creates a profile by itself (QA emulator, real app + functions).
// An "orphan" account (Auth without users doc, as after a merge or a deleted profile):
//   1. logs in → NO users doc is created (before: one without cédula and a NEW SL — a duplicate)
//   2. the app sends it to /onboarding
//   3. completing with a cédula that belongs to another account → rejected (no resurrection)
//   4. completing with its own new cédula → the profile is created by the server (SL assigned)
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-d2-login-no-profile.cjs
const path = require('path');
const { chromium } = require('playwright');
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const fnDir = path.join(__dirname, '../../../functions');
const { initializeApp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));
const auth = getAuth(initializeApp({ projectId: 'demo-sp-qa' }, 'd2'));
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const exists = async (p) => (await fetch(`${FS}/${p}`, { headers: OWNER })).status === 200;

(async () => {
  const email = `d2-orphan-${Date.now()}@prueba.local`;
  const orphan = await auth.createUser({ email, password: 'Prueba1234!', emailVerified: true, displayName: 'Huerfana Prueba' });

  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await page.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.locator('input[type=email]').first().fill(email); await page.locator('input[type=password]').first().fill('Prueba1234!');
  await page.locator('button[type=submit]').first().click(); await page.waitForTimeout(9000);

  check('1. Login de una cuenta sin perfil → NO se crea un perfil solo', !(await exists(`users/${orphan.uid}`)));
  check('2. La app lo lleva a completar su perfil (/onboarding)', /\/onboarding/.test(page.url()), page.url());

  const complete = (dni) => page.evaluate(async ([uid, email, dni]) => {
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    try { const p = await userService.createProfile({ uid, email, firstName: 'Huerfana', lastName: 'Prueba', phone: '88880401', dni, acceptTerms: true }); return { ok: true, sl: p.slCode }; }
    catch (e) { return { ok: false, err: String(e?.message || e), code: e?.code }; }
  }, [orphan.uid, email, dni]);
  const dup = await complete('100090001');   // cliente1's cédula
  check('3. Completar con la cédula de OTRA cuenta → rechazado (no resucita un duplicado)', dup.ok === false && /cédula/i.test(dup.err || '') && !(await exists(`users/${orphan.uid}`)), JSON.stringify(dup).slice(0, 120));
  const good = await complete(`1-03${String(Date.now()).slice(-2)}-${String(Date.now()).slice(-4)}`);
  check('4. Completar con su propia cédula → perfil creado por el servidor', good.ok === true && /^SL/.test(good.sl || '') && await exists(`users/${orphan.uid}`), JSON.stringify(good).slice(0, 100));

  await br.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
