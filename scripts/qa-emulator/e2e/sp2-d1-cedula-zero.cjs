// D-1 — the same Costa Rican cédula with and without the leading zero is ONE person. QA emulator,
// real SP2 functions and app code. The cédula 303050904 is already registered (dni_index):
//   1. checkDniAvailable("0303050904") → taken        2. slRegisterUser with "03-0305-0904" → rejected
//   3. the app's userService.createProfile with "0303050904" → rejected
//   4. and the other way round: 0303050904 registered → "3-0305-0904" taken
//   5. a different cédula is still available (no false positives)
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-d1-cedula-zero.cjs
const { chromium } = require('playwright');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const s = (v) => ({ stringValue: v });
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const callable = async (name, data) => (await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })).json();
const claim = (dni, uid) => fetch(`${FS}/dni_index/${dni}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { uid: s(uid), claimedAt: s('2026-01-01') } }) });
const unclaim = (dni) => fetch(`${FS}/dni_index/${dni}`, { method: 'DELETE', headers: OWNER });

(async () => {
  for (const d of ['303050904', '0303050904', '404040404', '0404040404', '309990999', '0309990999']) await unclaim(d);
  await claim('303050904', 'd1-owner');

  const a = await callable('slUserApi', { action: 'checkDniAvailable', dni: '0303050904' });
  check('1. Disponibilidad de "0303050904" cuando 303050904 existe → ocupada', a.result?.available === false, JSON.stringify(a.result || a.error).slice(0, 80));

  const email = `d1-${Date.now()}@prueba.local`;
  const r = await callable('slRegisterUser', { email, password: 'Prueba1234!', firstName: 'Cedula', lastName: 'Cero', phone: '88880111', dni: '03-0305-0904', acceptTerms: true });
  check('2. Registro en el servidor con "03-0305-0904" → rechazado POR LA CÉDULA', !!r.error && /c[ée]dula|DNI/i.test(r.error.message || '') && !r.result?.uid, JSON.stringify(r.error || r.result).slice(0, 100));
  const okEmail = `d1-ok-${Date.now()}@prueba.local`;
  const r2 = await callable('slRegisterUser', { email: okEmail, password: 'Prueba1234!', firstName: 'Cedula', lastName: 'Nueva', phone: '88880113', dni: `3-08${String(Date.now()).slice(-2)}-${String(Date.now()).slice(-4)}`, acceptTerms: true });   // a fresh cédula each run
  check('2b. Registro en el servidor con una cédula nueva → funciona', !!r2.result && !r2.error, JSON.stringify(r2.error || { ok: true }).slice(0, 100));

  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.route('**/*', (x) => { const u = new URL(x.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? x.continue() : x.abort(); });
  const page = await ctx.newPage(); await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  const appEmail = `d1-app-${Date.now()}@prueba.local`;
  const c = await page.evaluate(async ([email]) => {
    const { getAuth, createUserWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    const cred = await createUserWithEmailAndPassword(getAuth(), email, 'Prueba1234!');
    try { await userService.createProfile({ uid: cred.user.uid, email, firstName: 'App', lastName: 'Cero', phone: '88880112', dni: '0303050904', acceptTerms: true, providerId: 'password' }); return { created: true }; }
    catch (e) { return { created: false, err: String(e?.message || e) }; }
  }, [appEmail]);
  check('3. La app (createProfile) con "0303050904" → rechazado', c.created === false && /cédula/i.test(c.err || ''), JSON.stringify(c).slice(0, 110));
  await br.close();

  await claim('0404040404', 'd1-owner-2');
  const b = await callable('slUserApi', { action: 'checkDniAvailable', dni: '4-0404-0404' });
  check('4. Al revés: 0404040404 existe → "4-0404-0404" ocupada', b.result?.available === false, JSON.stringify(b.result || b.error).slice(0, 80));

  const f = await callable('slUserApi', { action: 'checkDniAvailable', dni: `5-07${String(Date.now()).slice(-2)}-${String(Date.now()).slice(-4)}` });   // never used
  check('5. Otra cédula distinta sigue disponible (sin falsos positivos)', f.result?.available === true, JSON.stringify(f.result || f.error).slice(0, 80));

  for (const d of ['303050904', '0404040404', '309990999']) await unclaim(d);
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
