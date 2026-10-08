// D-8 — the admin panel changes a customer's e-mail / cédula through the server (QA emulator, real
// app adminService + functions, SP2 admin admin2@prueba.local from sp2-auth-flows):
//   1. new e-mail → profile AND login change together (new login works, old one does not)
//   2. the e-mail of another account → rejected       3. another account's cédula (0-prefixed form) → rejected
//   4. new cédula → claims move (old cédula free again, new one taken by this customer)
//   5. editing only the name → saved as before       6. a customer cannot call the admin function
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-d8-admin-identity.cjs
const { chromium } = require('playwright');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : undefined;
const getDoc = async (p) => { const r = await fetch(`${FS}/${p}`, { headers: OWNER }); if (r.status !== 200) return null; return Object.fromEntries(Object.entries((await r.json()).fields || {}).map(([k, v]) => [k, val(v)])); };
const login = async (email, pw = 'Prueba1234!') => (await (await fetch(`${AUTH}:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) })).json());
const available = async (dni) => (await (await fetch(`${FN}/slUserApi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { action: 'checkDniAvailable', dni } }) })).json()).result?.available;
const t = () => String(Date.now()).slice(-6);

(async () => {
  // A customer created by the server (with index claims), as a real registration.
  const email = `d8-${t()}@prueba.local`; const dni = `1-09${t().slice(0, 2)}-${t().slice(-4)}`;
  const reg = await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { email, password: 'Prueba1234!', firstName: 'Admin', lastName: 'Edita', phone: '88880501', dni, acceptTerms: true } }) })).json();
  const uid = reg.result?.uid;
  if (!uid) throw new Error('setup: ' + JSON.stringify(reg.error));

  const br = await chromium.launch(); const ctx = await br.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  const asAdmin = (data) => page.evaluate(async ([uid, data]) => {
    const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js');
    const { adminService } = await import('/src/infrastructure/firebase/admin-service.ts');
    if (getAuth().currentUser?.email !== 'admin2@prueba.local') await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!');
    try { await adminService.users.update(uid, data); return { ok: true }; } catch (e) { return { ok: false, err: String(e?.message || e) }; }
  }, [uid, data]);

  // 1. New e-mail
  const newEmail = `d8-new-${t()}@prueba.local`;
  const r1 = await asAdmin({ email: newEmail, firstName: 'Admin', lastName: 'Edita', dni });
  const u1 = await getDoc(`users/${uid}`);
  const newLogin = await login(newEmail), oldLogin = await login(email);
  check('1. Correo nuevo → cambian perfil Y correo de ingreso (el viejo ya no entra)', r1.ok && u1?.email === newEmail && newLogin.localId === uid && !oldLogin.localId, JSON.stringify({ r1, perfil: u1?.email, nuevoEntra: newLogin.localId === uid, viejoEntra: !!oldLogin.localId }).slice(0, 150));

  // 2. Another account's e-mail
  const r2 = await asAdmin({ email: 'cliente1@prueba.local' });
  check('2. Correo de otra cuenta → rechazado', !r2.ok && /otra cuenta|ingreso de otra/i.test(r2.err || '') && (await getDoc(`users/${uid}`))?.email === newEmail, JSON.stringify(r2).slice(0, 110));

  // 3. Another account's cédula, 0-prefixed form (cliente1: 100090001)
  const r3 = await asAdmin({ dni: '0100090001' });
  check('3. Cédula de otra cuenta (forma con 0) → rechazado', !r3.ok && /cédula/i.test(r3.err || ''), JSON.stringify(r3).slice(0, 110));

  // 4. New cédula → claims move
  const newDni = `1-08${t().slice(0, 2)}-${t().slice(-4)}`;
  const r4 = await asAdmin({ dni: newDni });
  const u4 = await getDoc(`users/${uid}`);
  const idxNew = await getDoc(`dni_index/${newDni.replace(/-/g, '')}`);
  check('4. Cédula nueva → el índice se mueve (la vieja queda libre, la nueva es de este cliente)', r4.ok && u4?.dni === newDni.replace(/-/g, '') && idxNew?.uid === uid && await available(dni) === true && await available(newDni) === false,
    JSON.stringify({ r4, dni: u4?.dni, idx: idxNew?.uid === uid }).slice(0, 140));

  // 5. Only the name
  const r5 = await asAdmin({ firstName: 'Nombre', lastName: 'Cambiado' });
  check('5. Editar solo el nombre → se guarda como antes', r5.ok && (await getDoc(`users/${uid}`))?.firstName === 'Nombre');

  // 6. A customer cannot use the admin function
  const cust = await login('cliente1@prueba.local');
  const r6 = await (await fetch(`${FN}/slAdminUpdateIdentity`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cust.idToken}` }, body: JSON.stringify({ data: { uid, email: 'robo@prueba.local' } }) })).json();
  check('6. Un cliente NO puede usar la función de admin', r6.error?.status === 'PERMISSION_DENIED', JSON.stringify(r6.error || r6.result).slice(0, 80));

  await br.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
