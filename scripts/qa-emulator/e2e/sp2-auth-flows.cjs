// Auth anti-regression suite (F13 — duplicate accounts). Runs AFTER every identity change, on the QA
// emulator, with the SP2 app's own code (authService / adminService / callables in http://localhost:5175):
//   1. e-mail + password login                     2. "Olvidé mi contraseña" → reset e-mail generated
//   3. Google-only account → "Olvidé mi contraseña" → it gets a password, SAME uid (Google removal plan)
//   4. admin "entrar como usuario" (slAdminImpersonate) → session as the customer
//   5. admin panel edits a customer (adminService.users.update)
//   6. a customer cannot impersonate / edit another customer
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-auth-flows.cjs
const path = require('path');
const { chromium } = require('playwright');
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const fnDir = path.join(__dirname, '../../../functions');
const { initializeApp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));
const auth = getAuth(initializeApp({ projectId: 'demo-sp-qa' }, 'auth-flows'));
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const s = (v) => ({ stringValue: v });
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const oobCodes = async () => (await (await fetch('http://localhost:9099/emulator/v1/projects/demo-sp-qa/oobCodes')).json()).oobCodes || [];

(async () => {
  // SP2 admin for the admin flows (role admin in the users doc, as production admins).
  const ADMIN = { uid: 'e2e-admin-sp2', email: 'admin2@prueba.local' };
  await auth.deleteUser(ADMIN.uid).catch(() => {});
  // another test may have created the same e-mail with another uid (signUp) — start from a clean account
  const oldAdm = await auth.getUserByEmail(ADMIN.email).catch(() => null); if (oldAdm) await auth.deleteUser(oldAdm.uid);
  await auth.createUser({ uid: ADMIN.uid, email: ADMIN.email, password: 'Prueba1234!', emailVerified: true });
  await fetch(`${FS}/users/${ADMIN.uid}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { uid: s(ADMIN.uid), email: s(ADMIN.email), role: s('admin'), firstName: s('Admin'), lastName: s('QA'), status: s('active') } }) });
  // Google-only account (no password), as 687 production accounts.
  const G = { email: 'google-solo@prueba.local' };
  const old = await auth.getUserByEmail(G.email).catch(() => null); if (old) await auth.deleteUser(old.uid);
  const idp = await (await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: 'g-123', email: G.email, email_verified: true }))}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }) })).json();
  G.uid = idp.localId;
  await fetch(`${FS}/users/${G.uid}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { uid: s(G.uid), email: s(G.email), slCode: s('SL90009'), role: s('customer'), firstName: s('Google'), lastName: s('Solo'), status: s('active') } }) });

  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  const inApp = (fn, arg) => page.evaluate(fn, arg);

  // 1. Login
  const login = await inApp(async ([email]) => {
    const { authService } = await import('/src/infrastructure/firebase/auth-service.ts');
    try { const u = await authService.signInWithEmail({ email, password: 'Prueba1234!' }); return { ok: true, uid: u?.uid || u?.user?.uid }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, ['cliente1@prueba.local']);
  check('1. Login con correo y contraseña', login.ok, JSON.stringify(login).slice(0, 100));

  // 2. Password reset (the app's flow)
  const before = (await oobCodes()).length;
  const reset = await inApp(async ([email]) => {
    const { authService } = await import('/src/infrastructure/firebase/auth-service.ts');
    try { await authService.sendPasswordReset(email); return { ok: true }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, ['cliente2@prueba.local']);
  const codes = await oobCodes();
  check('2. "Olvidé mi contraseña" genera el correo de recuperación', reset.ok && codes.length > before && codes.some((c) => c.email === 'cliente2@prueba.local' && c.requestType === 'PASSWORD_RESET'), JSON.stringify(reset).slice(0, 80));

  // 3. Google-only account gets a password on the SAME account
  await inApp(async () => { const { getAuth, signOut } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signOut(getAuth()); });
  const g = await inApp(async ([email]) => {
    const { authService } = await import('/src/infrastructure/firebase/auth-service.ts');
    try { await authService.sendPasswordReset(email); return { ok: true }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [G.email]);
  const gCode = (await oobCodes()).reverse().find((c) => c.email === G.email && c.requestType === 'PASSWORD_RESET');
  let gOk = false, gSame = false;
  if (gCode) {
    await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oobCode: gCode.oobCode, newPassword: 'NuevaClave123!' }) });
    const si = await (await fetch(`http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: G.email, password: 'NuevaClave123!', returnSecureToken: true }) })).json();
    gOk = !!si.idToken; gSame = si.localId === G.uid;
  }
  check('3. Cuenta solo-Google: "Olvidé mi contraseña" → crea contraseña y entra con la MISMA cuenta', g.ok && gOk && gSame, `correo=${!!gCode} entra=${gOk} mismoUid=${gSame}`);

  // 4. Admin "entrar como usuario"
  const imp = await inApp(async ([adminEmail]) => {
    const { getAuth, signInWithEmailAndPassword, signInWithCustomToken } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('/node_modules/.vite/deps/firebase_functions.js');
    const { getFirebaseApp } = await import('/src/infrastructure/firebase/config.ts');
    await signInWithEmailAndPassword(getAuth(), adminEmail, 'Prueba1234!');
    const fns = getFunctions(getFirebaseApp(), 'us-central1');
    try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already */ }
    try {
      const r = await httpsCallable(fns, 'slAdminImpersonate')({ uid: 'e2e-sl90001' });
      const cred = await signInWithCustomToken(getAuth(), r.data.token);
      return { ok: true, uid: cred.user.uid };
    } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [ADMIN.email]);
  check('4. Admin "entrar como usuario" → sesión como el cliente', imp.ok && imp.uid === 'e2e-sl90001', JSON.stringify(imp).slice(0, 100));

  // 5. Admin panel edits a customer
  const edit = await inApp(async ([adminEmail]) => {
    const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { adminService } = await import('/src/infrastructure/firebase/admin-service.ts');
    await signInWithEmailAndPassword(getAuth(), adminEmail, 'Prueba1234!');
    try { await adminService.users.update('e2e-sl90002', { preferredLanguage: 'es' }); return { ok: true }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [ADMIN.email]);
  check('5. Panel admin: editar un cliente', edit.ok, JSON.stringify(edit).slice(0, 100));

  // 6. A customer cannot impersonate nor edit another customer
  const deny = await inApp(async () => {
    const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('/node_modules/.vite/deps/firebase_functions.js');
    const { getFirebaseApp } = await import('/src/infrastructure/firebase/config.ts');
    const { getFirestore, doc, updateDoc } = await import('/node_modules/.vite/deps/firebase_firestore.js');
    await signInWithEmailAndPassword(getAuth(), 'cliente1@prueba.local', 'Prueba1234!');
    const fns = getFunctions(getFirebaseApp(), 'us-central1'); try { connectFunctionsEmulator(fns, 'localhost', 5001); } catch { /* already */ }
    let imp = 'allowed', upd = 'allowed';
    try { await httpsCallable(fns, 'slAdminImpersonate')({ uid: 'e2e-sl90002' }); } catch { imp = 'denied'; }
    try { await updateDoc(doc(getFirestore(getFirebaseApp()), 'users', 'e2e-sl90002'), { phone: '0000' }); } catch { upd = 'denied'; }
    return { imp, upd };
  });
  check('6. Un cliente NO puede entrar como otro ni editarlo', deny.imp === 'denied' && deny.upd === 'denied', JSON.stringify(deny));

  await br.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
