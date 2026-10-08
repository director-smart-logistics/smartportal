// D-3 / D-5 — a customer's identity (cédula, e-mail, phone, verification) and the uniqueness indexes
// are written ONLY by the server. QA emulator, real rules, real functions, the SP2 app's own code:
//   1. the customer cannot write dni / isVerified / email / phone on its doc directly
//   2. the customer cannot "occupy" a cédula or e-mail in dni_index / email_index
//   3. the verification modal's save (userService.updateProfile with cédula + verified fields) works
//      through the server: cédula, verifiedDni, isVerified and the dni_index claim
//   4. D-5: changing the cédula to one a LEGACY account has (no index claim) → rejected
//   5. non-identity updates (showVerificationModal…) keep working directly
//   6. Google onboarding: a Google account without profile completes it (server) → same uid, SL, provider
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-d3-d5-identity.cjs
const path = require('path');
const { chromium } = require('playwright');
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const fnDir = path.join(__dirname, '../../../functions');
const { initializeApp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));
const auth = getAuth(initializeApp({ projectId: 'demo-sp-qa' }, 'd3d5'));
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const s = (v) => ({ stringValue: v });
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : undefined;
const getDoc = async (p) => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); if (r.status !== 200) return null; const f = (await r.json()).fields || {}; return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)])); };
const rnd = () => String(Date.now()).slice(-4);

(async () => {
  // A fresh customer (created by the server, as a real registration).
  const email = `d3-${Date.now()}@prueba.local`;
  const reg = await (await fetch('http://127.0.0.1:5001/demo-sp-qa/us-central1/slRegisterUser', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { email, password: 'Prueba1234!', firstName: 'Ident', lastName: 'Prueba', phone: '88880201', dni: `1-07${rnd().slice(0, 2)}-${rnd()}`, acceptTerms: true } }) })).json();
  const uid = reg.result?.uid;
  check('Preparación: cliente creado por el servidor', !!uid, JSON.stringify(reg.error || {}).slice(0, 80));
  // A legacy account holding a cédula WITHOUT index claim (as 2805 production accounts).
  const legacyDni = `20${rnd()}${rnd().slice(0, 3)}`;
  await auth.deleteUser('d3-legacy').catch(() => {});
  await auth.createUser({ uid: 'd3-legacy', email: 'legacy@prueba.local', password: 'Prueba1234!' });   // else the orphan-profile guard deletes the doc
  await fetch(`${FS}/users/d3-legacy`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { uid: s('d3-legacy'), dni: s(legacyDni), slCode: s('SL20999'), email: s('legacy@prueba.local') } }) });

  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  const run = (fn, args) => page.evaluate(fn, args);
  await run(async ([email]) => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), email, 'Prueba1234!'); }, [email]);

  // 1 + 2. Direct writes denied.
  const direct = await run(async ([uid]) => {
    const { getFirestore, doc, updateDoc, setDoc } = await import('/node_modules/.vite/deps/firebase_firestore.js');
    const { getFirebaseApp } = await import('/src/infrastructure/firebase/config.ts');
    const db = getFirestore(getFirebaseApp()); const out = {};
    for (const [k, v] of [['dni', '999999999'], ['isVerified', true], ['email', 'otro@prueba.local'], ['phone', '00000000'], ['verifiedDni', '1']]) {
      try { await updateDoc(doc(db, 'users', uid), { [k]: v }); out[k] = 'PERMITIDO'; } catch { out[k] = 'denegado'; }
    }
    for (const [c, id] of [['dni_index', '555555555'], ['email_index', 'ajeno@prueba.local']]) {
      try { await setDoc(doc(db, c, id), { uid, claimedAt: 'x' }); out[c] = 'PERMITIDO'; } catch { out[c] = 'denegado'; }
    }
    return out;
  }, [uid]);
  check('1. El cliente NO puede escribir cédula/verificación/correo/teléfono directo', ['dni', 'isVerified', 'email', 'phone', 'verifiedDni'].every((k) => direct[k] === 'denegado'), JSON.stringify(direct));
  check('2. El cliente NO puede "ocupar" una cédula o correo en los índices', direct.dni_index === 'denegado' && direct.email_index === 'denegado');

  // 3. The verification modal's save goes through the server.
  const newDni = `1-06${rnd().slice(0, 2)}-${rnd()}`;
  const ver = await run(async ([uid, dni]) => {
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    try { await userService.updateProfile(uid, { dni, phone: '8888-0202', firstName: 'Ident', lastName: 'Verificado', isVerified: true, verifiedDni: dni, verificationSource: 'smart-portal-2', profileLastUpdatedBy: 'client' }); return { ok: true }; }
    catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [uid, newDni]);
  const u = await getDoc(`users/${uid}`); const normDni = newDni.replace(/-/g, '');
  const idx = await getDoc(`dni_index/${normDni}`);
  check('3. Guardar la verificación (cédula + verificado) funciona por el servidor', ver.ok && u?.dni === normDni && u?.isVerified === true && u?.phone === '8888-0202' && idx?.uid === uid, JSON.stringify({ ver, dni: u?.dni, isVerified: u?.isVerified, idx: idx?.uid === uid }).slice(0, 160));

  // 4. D-5: a cédula held by a legacy account (no index claim) → rejected.
  const d5 = await run(async ([uid, dni]) => {
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    try { await userService.updateProfile(uid, { dni }); return { ok: true }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [uid, legacyDni]);
  const u2 = await getDoc(`users/${uid}`);
  check('4. D-5: cambiar a la cédula de una cuenta legacy (sin índice) → rechazado', d5.ok === false && /cédula/i.test(d5.err || '') && u2?.dni === normDni, JSON.stringify(d5).slice(0, 120));

  // 5. Non-identity update keeps working directly.
  const flag = await run(async ([uid]) => {
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    try { await userService.updateProfile(uid, { showVerificationModal: false }); return { ok: true }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [uid]);
  check('5. Actualizaciones normales (ej. cerrar el modal) siguen funcionando', flag.ok && (await getDoc(`users/${uid}`))?.showVerificationModal === false);

  // 6. Google onboarding: Google account without profile completes it through the server.
  const gEmail = `d3-google-${Date.now()}@prueba.local`;
  const idp = await (await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: `g-${Date.now()}`, email: gEmail, email_verified: true }))}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }) })).json();
  const token = await auth.createCustomToken(idp.localId);
  const g = await run(async ([token, gEmail]) => {
    const { getAuth, signInWithCustomToken } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    const cred = await signInWithCustomToken(getAuth(), token);
    try { const p = await userService.createProfile({ uid: cred.user.uid, email: gEmail, firstName: 'Google', lastName: 'Nuevo', phone: '88880203', dni: `1-05${String(Date.now()).slice(-2)}-${String(Date.now()).slice(-4)}`, acceptTerms: true, providerId: 'google.com' }); return { ok: true, uid: cred.user.uid, sl: p.slCode, email: p.email }; }
    catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [token, gEmail]);
  check('6. Onboarding de Google completa el perfil por el servidor (mismo uid, SL, su correo)', g.ok && g.uid === idp.localId && /^SL/.test(g.sl || '') && g.email === gEmail, JSON.stringify(g).slice(0, 140));

  await br.close();
  await fetch(`${FS}/users/d3-legacy`, { method: 'DELETE', headers: OWNER });
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
