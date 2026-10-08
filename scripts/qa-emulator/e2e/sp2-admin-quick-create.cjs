// Admin "Crear usuario rápido" (slAdminCreateUserQuick) on the QA emulator — real function, real triggers.
//   1. "Enviar enlace al cliente": account created with no password known to anyone; a one-time link is returned;
//      the link lets the customer set a password and log in; SL code in SP2 and the same SL code in SP1
//   2. "Yo establezco la contraseña": the customer logs in with it
//   3. without cédula → rejected with a clear message, nothing created
//   4. password mode without a password → rejected, nothing created
//   5. a customer (not admin) cannot create accounts
//   6. the same cédula twice → rejected (no duplicate account)
// Run: node scripts/qa-emulator/e2e/sp2-admin-quick-create.cjs
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slAdminCreateUserQuick';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const B = 'http://127.0.0.1:8080/v1/projects/demo-sp-qa/databases';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const x = await fn().catch(() => null); if (x || Date.now() > end) return x; await sleep(1000); } };
const post = async (url, body, headers = {}) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })).json();
const signIn = (email, password) => post(`${AUTH}/accounts:signInWithPassword?key=fake`, { email, password, returnSecureToken: true });
const get = async (db, p) => { const r = await fetch(`${B}/${db}/documents/${p}`, { headers: OWNER }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const exists = async (email) => (await post(`${AUTH}/accounts:createAuthUri?key=fake`, { identifier: email, continueUri: 'http://localhost' })).registered === true;
const t = String(Date.now()).slice(-6);
const ced = (k) => `4${t.slice(-5)}${k}${k}${k}`.slice(0, 9);

(async () => {
  // admin + customer tokens (roles live in users/{uid}.role, as in production)
  const mkUser = async (uid, email, role) => {
    await fetch(`${AUTH.replace('/v1', '')}/v1/projects/demo-sp-qa/accounts`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, email, password: 'Prueba1234!' }) }).catch(() => {});
    await fetch(`${B}/(default)/documents/users/${uid}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { uid: { stringValue: uid }, email: { stringValue: email }, role: { stringValue: role }, status: { stringValue: 'active' }, firstName: { stringValue: role }, lastName: { stringValue: 'QA' } } }) });
    return (await signIn(email, 'Prueba1234!')).idToken;
  };
  const adminTok = await mkUser('e2e-qc-admin', 'qc-admin@prueba.local', 'admin');
  const custTok = await mkUser('e2e-qc-cust', 'qc-cust@prueba.local', 'customer');
  const call = (tok, data) => post(FN, { data }, { Authorization: `Bearer ${tok}` });
  const base = (k) => ({ firstName: 'Cliente', lastName: `Rapido ${k}`, email: `qc-${k}-${t}@prueba.local`, phone: '88881200', dni: ced(k), ruta: 'San Jose Centro', acceptMarketing: false });

  // 1. link mode
  const p1 = { ...base(1), accessMode: 'link' };
  const r1 = await call(adminTok, p1);
  const link = r1.result?.passwordLink || '';
  check('1. "Enviar enlace al cliente" → cuenta creada y enlace de un solo uso', r1.result?.success === true && /oobCode=/.test(link), JSON.stringify(r1.error || { sl: r1.result?.slCode, link: !!link }).slice(0, 120));
  if (r1.result?.success) {
    const sl = r1.result.slCode; const uid = r1.result.uid;
    const u = await until(async () => { const f = await get('(default)', `users/${uid}`); return f && v(f.slCode) === sl && f; });
    check('   1. perfil SP2 con código SL, cédula y modo de acceso registrado', !!u && /^SL\d+$/.test(sl) && !!v(u.dni) && JSON.stringify(u.signup || {}).includes('link'), `${sl} dni=${u && v(u.dni)}`);
    const f1 = await until(() => get('portal', `customers/${sl}`), 40000);
    check('   1. ficha SP1 con el MISMO código y correo', !!f1 && v(f1.slCode) === sl && v(f1.email) === p1.email);
    const oob = new URL(link).searchParams.get('oobCode');
    const reset = await post(`${AUTH}/accounts:resetPassword?key=fake`, { oobCode: oob, newPassword: 'MiClaveNueva123!' });
    const login = await signIn(p1.email, 'MiClaveNueva123!');
    check('   1. el cliente usa el enlace, crea su contraseña y entra', !reset.error && !!login.idToken && login.localId === uid, JSON.stringify(reset.error || login.error || {}).slice(0, 100));
    const reuse = await post(`${AUTH}/accounts:resetPassword?key=fake`, { oobCode: oob, newPassword: 'OtraClave123!' });
    check('   1. el enlace no sirve dos veces', !!reuse.error, reuse.error?.message || 'se pudo reusar');
  }
  // 2. password mode
  const p2 = { ...base(2), accessMode: 'password', password: 'ClaveAdmin789!' };
  const r2 = await call(adminTok, p2);
  const l2 = r2.result?.success ? await signIn(p2.email, p2.password) : {};
  check('2. "Yo establezco la contraseña" → el cliente entra con ella; sin enlace', r2.result?.success === true && !!l2.idToken && !r2.result?.passwordLink, JSON.stringify(r2.error || { sl: r2.result?.slCode }).slice(0, 100));
  // 3. without cédula
  const p3 = { ...base(3), accessMode: 'link' }; delete p3.dni;
  const r3 = await call(adminTok, p3);
  check('3. Sin cédula → rechazado con mensaje claro, no se crea nada', r3.error?.status === 'INVALID_ARGUMENT' && /c[eé]dula/i.test(r3.error?.message || '') && !(await exists(p3.email)), r3.error?.message || JSON.stringify(r3.result || {}).slice(0, 80));
  // 4. password mode without password
  const p4 = { ...base(4), accessMode: 'password' };
  const r4 = await call(adminTok, p4);
  check('4. Contraseña elegida pero vacía → rechazado, no se crea nada', r4.error?.status === 'INVALID_ARGUMENT' && !(await exists(p4.email)), r4.error?.message || 'aceptado');
  // 5. a customer cannot create accounts
  const p5 = { ...base(5), accessMode: 'link' };
  const r5 = await call(custTok, p5);
  check('5. Un cliente no puede crear cuentas', r5.error?.status === 'PERMISSION_DENIED' && !(await exists(p5.email)), r5.error?.status || 'aceptado');
  // 6. same cédula twice
  const p6 = { ...base(6), accessMode: 'link', dni: p1.dni };
  const r6 = await call(adminTok, p6);
  check('6. La misma cédula otra vez → rechazado (sin cuenta duplicada)', r6.error?.status === 'ALREADY_EXISTS' && !(await exists(p6.email)), r6.error?.message || 'aceptado');
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
