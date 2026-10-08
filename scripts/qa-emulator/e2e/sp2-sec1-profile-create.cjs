// SEC-1 — a client can only create ITS OWN plain customer profile (SP2 firestore.rules, users create).
// Real security rules on the QA emulator, with real Auth tokens (Firestore REST :commit, like the SDK):
//   attacks → denied: role admin, SL of another customer (already indexed), isVerified true,
//   another e-mail, SL not claimed in the same commit, a uid that is not yours;
//   D-3: even the plain shape is denied from the client (profiles are created by the server).
// Plus the real app path: userService.createProfile called inside the local SP2 app (http://localhost:5175).
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-sec1-profile-create.cjs
const { chromium } = require('playwright');
const PROJECT = 'demo-sp-qa';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `http://localhost:8080/v1/${DOCS}`;
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const s = (v) => ({ stringValue: v }); const b = (v) => ({ booleanValue: v });

async function account(email) {
  const body = JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true });
  let r = await (await fetch(`${AUTH}:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).json();
  if (!r.idToken) r = await (await fetch(`${AUTH}:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).json();
  return { uid: r.localId, token: r.idToken, email };
}
const profile = (a, sl, extra = {}) => ({ uid: s(a.uid), id: s(a.uid), slCode: s(sl), email: s(a.email), firstName: s('Sec'), lastName: s('Uno'), role: s('customer'),
  tier: s('basic'), membershipTier: s('basic'), isVerified: b(false), status: s('active'), isActive: b(true), ...extra });
/** One atomic commit, as the SDK transaction does: claim slcode_index + create the users doc. */
async function commit(a, userId, fields, { claimSl = fields.slCode?.stringValue, claimUid = a.uid } = {}) {
  const writes = [];
  if (claimSl) writes.push({ update: { name: `${DOCS}/slcode_index/${claimSl}`, fields: { uid: s(claimUid), claimedAt: s(new Date().toISOString()), year: s('26') } }, currentDocument: { exists: false } });
  writes.push({ update: { name: `${DOCS}/users/${userId}`, fields }, currentDocument: { exists: false } });
  const r = await fetch(`http://localhost:8080/v1/projects/${PROJECT}/databases/(default)/documents:commit`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
  return r.status;
}
const cleanup = async (uid, sl) => { await fetch(`${FS}/users/${uid}`, { method: 'DELETE', headers: OWNER }); if (sl) await fetch(`${FS}/slcode_index/${sl}`, { method: 'DELETE', headers: OWNER }); };

(async () => {
  const a = await account('sec1-a@prueba.local');
  const victimSl = 'SL90001';
  // The victim's SL is indexed (as after the backfill).
  await fetch(`${FS}/slcode_index/${victimSl}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { uid: s('e2e-sl90001'), claimedAt: s('2026-01-01') } }) });
  const newSl = () => `SL26SEC${Math.floor(Math.random() * 1e6)}`;

  let sl = newSl(); await cleanup(a.uid, sl);
  check('Ataque: crearse con role admin → DENEGADO', await commit(a, a.uid, profile(a, sl, { role: s('admin') })) === 403);
  sl = newSl();
  check('Ataque: usar el SL de otro cliente → DENEGADO', await commit(a, a.uid, profile(a, victimSl), { claimSl: null }) === 403);
  check('Ataque: crearse ya verificado → DENEGADO', await commit(a, a.uid, profile(a, sl, { isVerified: b(true) })) === 403);
  check('Ataque: con el correo de otra persona → DENEGADO', await commit(a, a.uid, profile(a, sl, { email: s('otra@prueba.local') })) === 403);
  check('Ataque: con ruta o campos de admin → DENEGADO', await commit(a, a.uid, profile(a, sl, { ruta: s('Encomiendas') })) === 403);
  check('Ataque: SL sin reclamarlo en la misma operación → DENEGADO', await commit(a, a.uid, profile(a, sl), { claimSl: null }) === 403);
  const other = await account('sec1-b@prueba.local');
  check('Ataque: crear el perfil de OTRO uid → DENEGADO', await commit(a, other.uid, profile({ ...a, uid: other.uid }, sl)) === 403);
  const st = await commit(a, a.uid, profile(a, sl));
  // D-3 (after SEC-1): even the plain shape is denied — profiles are created by the server only.
  check('Directo desde el cliente, aun con forma válida → DENEGADO (lo crea el servidor)', st === 403, `HTTP ${st}`);
  await cleanup(a.uid, sl);

  // Real app code: userService.createProfile (Google onboarding / login path) still works under the rule.
  const c = await account('sec1-app@prueba.local');
  await cleanup(c.uid);
  await fetch(`${FS}/email_index/${c.email}`, { method: 'DELETE', headers: OWNER });   // a previous run's claim
  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  const res = await page.evaluate(async ([email]) => {
    const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { userService } = await import('/src/infrastructure/firebase/user-service.ts');
    const cred = await signInWithEmailAndPassword(getAuth(), email, 'Prueba1234!');
    try { const p = await userService.createProfile({ uid: cred.user.uid, email, firstName: 'App', lastName: 'Sec', phone: '88880099', dni: `1-02${String(Date.now()).slice(-2)}-${String(Date.now()).slice(-4)}`, acceptTerms: true, providerId: 'password' }); return { ok: true, sl: p.slCode, role: p.role }; }
    catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [c.email]);
  check('App real: userService.createProfile (vía servidor) sigue funcionando', res.ok === true && res.role === 'customer', JSON.stringify(res).slice(0, 120));
  if (res.sl) await cleanup(c.uid, res.sl);
  await fetch(`${FS}/email_index/${c.email}`, { method: 'DELETE', headers: OWNER });
  await br.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
