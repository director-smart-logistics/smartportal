// One "Eliminar cuenta" for SP1 + SP2 (2026-09-29), QA emulator with the real functions:
//   1. SP2 admin → "Eliminar" an account WITHOUT history → gone from SP2 (profile, addresses, indexes, login) AND
//      from SP1 (ficha); nothing re-created by the triggers; account_deletions_log in both systems with who, why
//      and a full backup
//   2. an account WITH history (a package in SP1) → nothing deleted in either system; the reason comes back;
//      the refusal is logged
//   3. "Deshabilitar acceso" on that account → login disabled, account identical in SP1 and SP2
//   4. SP1 "Eliminar cliente" (slDeleteCustomerAccount) without history → gone from both systems + login removed
//   5. the backup restores the account with account-cleanup-restore.cjs (profile, ficha, login)
// Run: node scripts/qa-emulator/e2e/sp1-sp2-account-delete.cjs
const path = require('path');
const { execFileSync } = require('child_process');
const AUTH = 'http://127.0.0.1:9099';
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const B = 'http://127.0.0.1:8080/v1/projects/demo-sp-qa/databases';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (db, p) => { const r = await fetch(`${B}/${db}/documents/${p}`, { headers: OWNER }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : { stringValue: String(x) };
const put = (db, p, o) => fetch(`${B}/${db}/documents/${p}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, x]) => [k, enc(x)])) }) });
const mkLogin = async (uid, email, claims) => { await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-sp-qa/accounts`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, email, password: 'Prueba1234!', ...(claims ? { customAttributes: JSON.stringify(claims) } : {}) }) }).catch(() => {}); };
const login = async (uid) => { const r = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-sp-qa/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: [uid] }) })).json(); return (r.users || [])[0] || null; };
const signIn = async (email) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json()).idToken;
const call = async (name, tok, data) => (await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ data }) })).json();
const runQuery = async (db, col, field, value) => (await (await fetch(`${B}/${db}/documents:runQuery`, { method: 'POST', headers: OWNER, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json()).filter((x) => x.document);
const t = String(Date.now()).slice(-6);

async function customer(k, withPackage) {
  const uid = `qa-del-${k}-${t}`, sl = `SL91${t}${'abcd'.indexOf(k) + 1}`, email = `del-${k}-${t}@prueba.local`;
  await mkLogin(uid, email); await sleep(1200);
  await put('(default)', `users/${uid}`, { uid, slCode: sl, email, firstName: 'Borrar', lastName: `QA ${k}`, status: 'active', role: 'customer', phone: '88881600' });
  await put('(default)', `addresses/qa-del-addr-${k}-${t}`, { userId: uid, alias: 'Casa', isDefault: true, status: 'active' });
  await put('(default)', `email_index/${email}`, { uid });
  await put('(default)', `slcode_index/${sl}`, { uid });
  await put('portal', `customers/${sl}`, { slCode: sl, firebaseUid: uid, email, firstName: 'Borrar', lastName: `QA ${k}`, status: 'active', ruta: 'Heredia' });
  if (withPackage) await put('portal', `packages/QADELPK${k}${t}`, { trackingNumber: `QADELPK${k}${t}`, slCode: sl, status: 'delivered' });
  return { uid, sl, email };
}

(async () => {
  // SP2 admin (users/{uid}.role) and SP1 admin (token role ADMIN)
  const a2 = { uid: `qa-del-admin2-${t}`, email: `del-admin2-${t}@prueba.local` };
  await mkLogin(a2.uid, a2.email); await sleep(1000);
  await put('(default)', `users/${a2.uid}`, { uid: a2.uid, email: a2.email, role: 'admin', status: 'active', firstName: 'Adm', lastName: 'Dos' });
  const tok2 = await signIn(a2.email);
  const a1 = { uid: `qa-del-admin1-${t}`, email: `del-admin1-${t}@prueba.local` };
  await mkLogin(a1.uid, a1.email);
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-sp-qa/accounts:update`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: a1.uid, customAttributes: JSON.stringify({ role: 'ADMIN' }) }) });
  const tok1 = await signIn(a1.email);

  // 1. SP2 "Eliminar" without history
  const c1 = await customer('a', false);
  const r1 = await call('slAdminSoftDeleteUser', tok2, { uid: c1.uid, reason: 'Cuenta de prueba sin uso' });
  await sleep(6000);
  const gone1 = !(await get('(default)', `users/${c1.uid}`)) && !(await get('portal', `customers/${c1.sl}`)) && !(await get('(default)', `slcode_index/${c1.sl}`)) && !(await get('(default)', `email_index/${c1.email}`)) && !(await login(c1.uid));
  check('1. SP2 "Eliminar" sin historial → sale de SP2 (perfil, índices, login) y de SP1 (ficha)', r1.result?.status === 'deleted' && gone1, JSON.stringify(r1.error || r1.result).slice(0, 120));
  const logs1 = [...await runQuery('portal', 'account_deletions_log', 'slCode', c1.sl), ...await runQuery('(default)', 'account_deletions_log', 'slCode', c1.sl)];
  const full = logs1.map((x) => x.document.fields).filter((f) => v(f.status) === 'deleted');
  check('   1. registro en SP1 y SP2 con quién, motivo y respaldo completo (incluye el login)', full.length === 2 && full.every((f) => v(f.reason) === 'Cuenta de prueba sin uso' && v(f.by) === a2.email && String(v(f.backup)).includes(c1.email)) && logs1.some((x) => x.document.fields.login), `${full.length} registros`);
  await sleep(4000);
  check('   1. nada se vuelve a crear por la sincronización', !(await get('portal', `customers/${c1.sl}`)) && !(await get('(default)', `users/${c1.uid}`)));

  // 2. with history → refused, nothing touched
  const c2 = await customer('b', true);
  const r2 = await call('slAdminSoftDeleteUser', tok2, { uid: c2.uid, reason: 'Intento de borrar con historial' });
  await sleep(2000);
  check('2. Cuenta con historial → no se elimina en ningún sistema y dice por qué', r2.result?.status === 'blocked' && /historial/.test(r2.result?.message || '') && !!(await get('(default)', `users/${c2.uid}`)) && !!(await get('portal', `customers/${c2.sl}`)) && !!(await login(c2.uid)), (r2.result?.message || JSON.stringify(r2.error)).slice(0, 110));
  // 3. disable login instead
  const r3 = await call('slAdminSoftDeleteUser', tok2, { uid: c2.uid, reason: 'Bloqueo de acceso', action: 'disable-login' });
  const l3 = await login(c2.uid);
  check('3. "Deshabilitar acceso" → login deshabilitado; la cuenta sigue igual en SP1 y SP2', r3.result?.status === 'login-disabled' && l3?.disabled === true && v((await get('(default)', `users/${c2.uid}`))?.status) === 'active' && v((await get('portal', `customers/${c2.sl}`))?.status) === 'active');

  // 4. SP1 "Eliminar cliente" without history
  const c4 = await customer('c', false);
  const r4 = await call('slDeleteCustomerAccount', tok1, { slCode: c4.sl, reason: 'Duplicada, creada por error' });
  await sleep(6000);
  check('4. SP1 "Eliminar cliente" sin historial → sale de SP1 y SP2, y se borra el login', r4.result?.status === 'deleted' && !(await get('portal', `customers/${c4.sl}`)) && !(await get('(default)', `users/${c4.uid}`)) && !(await login(c4.uid)), JSON.stringify(r4.error || r4.result).slice(0, 120));
  // SP1 with history → refused
  const c5 = await customer('d', true);
  const r5 = await call('slDeleteCustomerAccount', tok1, { slCode: c5.sl, reason: 'Intento con historial' });
  check('   4. SP1 con historial → no se elimina', r5.result?.status === 'blocked' && !!(await get('portal', `customers/${c5.sl}`)) && !!(await get('(default)', `users/${c5.uid}`)));

  // 5. restore from the log backup
  const lg = (await runQuery('portal', 'account_deletions_log', 'slCode', c4.sl)).map((x) => x.document.fields).find((f) => v(f.status) === 'deleted');
  const bk = JSON.parse(v(lg.backup));
  const fs = require('fs'); const tmp = path.join(require('os').tmpdir(), `qa-del-backup-${t}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ accounts: [{ ...bk, group: 'delete', code: c4.sl, uid: c4.uid, login: null }] }));
  execFileSync('node', [path.join(__dirname, '../../audit/account-cleanup-restore.cjs'), tmp, c4.sl, '--apply'], { env: { ...process.env, QA_EMULATOR: '1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, stdio: 'ignore' });
  await sleep(4000);
  check('5. El respaldo del registro recupera la cuenta completa (perfil, ficha, login)', !!(await get('(default)', `users/${c4.uid}`)) && !!(await get('portal', `customers/${c4.sl}`)) && !!(await login(c4.uid)));
  const logs5 = (await runQuery('portal', 'account_deletions_log', 'slCode', c4.sl)).map((x) => v(x.document.fields.status));
  check('   5. el registro queda como "restaurada" (la sincronización vuelve a funcionar para esa cuenta)', logs5.includes('restored') && !logs5.includes('deleted'), logs5.join(','));
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
