// D-6 / D-7 / O-2 / O-6 on the QA emulator (real functions):
//   1. alias e-mail (juan.perez+x@gmail.com vs juanperez@gmail.com) → registration NOT blocked, alert recorded
//   2. same phone in another format (+506 …) → registration NOT blocked, alert recorded
//   3. a unique customer → no alert
//   4. O-6 merge: the account WITHOUT activity is deleted completely (profile archived, login deleted,
//      its Auth record logged in user_merges); the account with activity stays and keeps its data
//   5. O-6: merging the account WITH activity into one without → rejected
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-d6-d7-o6-alerts-merge.cjs
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const s = (v) => ({ stringValue: v });
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = () => String(Date.now()).slice(-6);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const register = async (email, phone) => (await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { email, password: 'Prueba1234!', firstName: 'Alerta', lastName: 'Prueba', phone, dni: `1-0${Math.floor(Math.random() * 9) + 1}${t().slice(0, 2)}-${t().slice(-4)}`, acceptTerms: true } }) })).json()).result;
const alertsFor = async (uid) => ((await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: OWNER, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: 'identity_alerts' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: s(uid) } } } }) })).json())
  .filter((r) => r.document).map((r) => r.document.fields.type.stringValue));
const exists = async (p) => (await fetch(`${FS}/${p}`, { headers: OWNER })).status === 200;
const authExists = async (email) => (await (await fetch(`${AUTH}:createAuthUri?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, continueUri: 'http://localhost' }) })).json()).registered === true;

(async () => {
  const tag = t(); const phone = `8${tag.slice(0, 3)}-${tag.slice(2, 6)}`;
  const a = await register(`juan.perez${tag}+tienda@gmail.com`, phone);
  const b = await register(`juanperez${tag}@gmail.com`, `7${tag.slice(0, 3)}${tag.slice(2, 6)}`);
  await pause(1500);
  check('1. Correo alias → el registro NO se bloquea y queda la alerta', !!b?.uid && (await alertsFor(b.uid)).includes('email-alias'), JSON.stringify(await alertsFor(b?.uid || '-')));
  const c = await register(`otro${tag}@prueba.local`, `+506 ${phone}`);
  await pause(1500);
  check('2. Mismo teléfono en otro formato → NO se bloquea y queda la alerta', !!c?.uid && (await alertsFor(c.uid)).includes('shared-phone'), JSON.stringify(await alertsFor(c?.uid || '-')));
  const d = await register(`unico${tag}@prueba.local`, `6${tag.slice(0, 3)}${tag.slice(1, 5)}`);
  await pause(1500);
  check('3. Cliente único → sin alerta', !!d?.uid && (await alertsFor(d.uid)).length === 0);

  // O-6: A has activity (a package billed by SP1), B has none.
  await fetch(`${FS}/shipments/O6-${tag}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { userId: s(a.uid), slCode: s(a.slCode), tracking: s(`O6${tag}`), invoiceId: s(`O6-INV-${tag}`), status: s('processed') } }) });
  const admin = (await (await fetch(`${AUTH}:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json()).idToken;
  const merge = async (orphanUid, canonicalUid) => (await fetch(`${FN}/slAdminMergeUsers`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
    body: JSON.stringify({ data: { orphanUid, canonicalUid, reason: 'e2e O-6' } }) })).json();

  const wrong = await merge(a.uid, d.uid);   // A (active) as the one to delete
  check('5. Fusionar dejando fuera la cuenta CON actividad → rechazado', wrong.error?.status === 'FAILED_PRECONDITION' && await exists(`users/${a.uid}`), (wrong.error?.message || '').slice(0, 110));

  const right = await merge(b.uid, a.uid);   // B (no activity) into A (active)
  const merges = ((await (await fetch(`${FS}:runQuery`, { method: 'POST', headers: OWNER, body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'user_merges' }], where: { fieldFilter: { field: { fieldPath: 'orphanUid' }, op: 'EQUAL', value: s(b.uid) } } } }) })).json()).filter((r) => r.document));
  const log = merges[0]?.document?.fields || {};
  check('4. La cuenta SIN actividad se elimina del todo (perfil y login) y queda el log para recuperarla',
    !!right.result?.success && !(await exists(`users/${b.uid}`)) && await exists(`users_archived/${b.uid}`) && !(await authExists(`juanperez${tag}@gmail.com`))
    && log.authDeleted?.booleanValue === true && !!log.orphanAuth?.mapValue?.fields?.email && await exists(`users/${a.uid}`) && await exists(`shipments/O6-${tag}`),
    JSON.stringify({ ok: right.result?.success, err: right.error?.message, authDeleted: log.authDeleted?.booleanValue }).slice(0, 140));

  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
