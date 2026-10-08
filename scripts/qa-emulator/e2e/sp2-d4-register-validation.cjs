// D-4 — slRegisterUser validates its input (QA emulator, real function):
//   1. without cédula → rejected          2. bot honeypot filled → rejected
//   3. invalid e-mail / short password → rejected (nothing created in Auth)
//   4. the public form's real payload → registers (the form is stricter than the server)
// The per-IP limit (20/hour) is not exercised here: it would lock the emulator IP for an hour.
// Run: node scripts/qa-emulator/e2e/sp2-d4-register-validation.cjs
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slRegisterUser';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const call = async (data) => (await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })).json();
const authExists = async (email) => (await (await fetch(`${AUTH}:createAuthUri?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, continueUri: 'http://localhost' }) })).json()).registered === true;
const t = () => String(Date.now()).slice(-6);
const base = () => ({ firstName: 'Valida', lastName: 'Registro', email: `d4-${t()}@prueba.local`, phone: '8888-0301', password: 'Prueba1234!', dni: `1-04${t().slice(0, 2)}-${t().slice(-4)}`, acceptTerms: true });

(async () => {
  let p = { ...base() }; delete p.dni;
  let r = await call(p);
  check('1. Sin cédula → rechazado', r.error?.status === 'INVALID_ARGUMENT' && !(await authExists(p.email)), JSON.stringify(r.error || { creada: !!r.result?.uid, sl: r.result?.slCode }).slice(0, 110));
  p = { ...base(), website_url: 'http://spam' }; r = await call(p);
  check('2. Campo anti-bot lleno → rechazado', r.error?.status === 'INVALID_ARGUMENT' && !(await authExists(p.email)));
  p = { ...base(), email: 'no-es-correo' }; r = await call(p);
  check('3a. Correo inválido → rechazado', r.error?.status === 'INVALID_ARGUMENT');
  p = { ...base(), password: '123' }; r = await call(p);
  check('3b. Contraseña corta → rechazado, sin cuenta en Auth', r.error?.status === 'INVALID_ARGUMENT' && !(await authExists(p.email)));
  p = base(); r = await call(p);
  check('4. El registro real del formulario → funciona', r.result?.success === true && /^SL/.test(r.result?.slCode || '') && await authExists(p.email), JSON.stringify(r.error || { sl: r.result?.slCode }).slice(0, 100));
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
