// Public registration from the HOME form — the real UI, the real callable, the real triggers (QA emulator).
// Written after the 2026-09-26 → 29 outage: the D-4 schema rejected optional fields the callable client sends
// as null, and no test filled the form the way customers do. Every case goes through the browser form.
//   1. only the required fields (no birth date, no location, no marketing box) → account created
//   2. with province + canton selected → account created, location saved
//   3. the account exists everywhere: login, SP2 users doc with a valid SL code, email/dni/SL indexes,
//      SP1 ficha with the SAME SL code
//   4. the same cédula again → clear "already registered" message, no second account
//   5. no red "Error al crear tu cuenta" on a valid registration
//   6. the callable with the exact payload the client encodes (optional fields = null) → accepted
//   7. ONE slRegisterUser call per registration (click, and Enter in the password field) — before 2026-09-29
//      every click called it twice
//   8. the optional birth date typed in the form is saved (dateOfBirth + birthDate); no TSE answer (QA blocks
//      it) never blocks the registration
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-register-home-form.cjs
const { chromium } = require('playwright');
const APP = process.env.SP2_APP || 'http://localhost:5175/';
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slRegisterUser';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const H = { Authorization: 'Bearer owner' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const x = await fn().catch(() => null); if (x || Date.now() > end) return x; await sleep(1000); } };
const get = async (db, p) => { const r = await fetch(`${B}/${db}/documents/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const byEmail = async (email) => {
  const r = await fetch(`${B}/(default)/documents:runQuery`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: email } } } } }) });
  const d = (await r.json()).find((x) => x.document); return d ? { id: d.document.name.split('/').pop(), f: d.document.fields } : null;
};
const signIn = async (email, password) => (await (await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());
const t = String(Date.now()).slice(-7);
// A valid-format cédula that no seed uses (9 digits, first digit 1–7).
const cedula = (k) => `5${t.slice(-5)}${k}${k}${k}`.slice(0, 9);

async function fillForm(page, c) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const form = page.getByTestId('register-form');
  await form.waitFor({ timeout: 30000 });
  if (c.namesFirst) { await page.getByTestId('register-firstName-input').fill(c.firstName); await page.getByTestId('register-lastName-input').fill(c.lastName); }
  await page.getByTestId('register-dni-input').fill(c.dni);
  await page.waitForTimeout(2500); // availability + TSE lookup (TSE is blocked in QA → manual names)
  if (await page.getByTestId('register-nationality-input').isVisible().catch(() => false)) await page.getByTestId('register-nationality-input').fill('Costa Rica');
  await page.getByTestId('register-firstName-input').fill(c.firstName);
  await page.getByTestId('register-lastName-input').fill(c.lastName);
  await page.getByTestId('register-email-input').fill(c.email);
  await page.getByTestId('register-phone-input').fill(c.phone);
  if (c.canton) {
    const box = form.getByPlaceholder(/cant[oó]n|distrito|buscar/i).first();
    if (await box.count()) { await box.fill(c.canton); await page.waitForTimeout(800); await page.getByText(new RegExp(`^${c.canton}`, 'i')).first().click().catch(() => {}); }
  }
  await page.getByTestId('register-password-input').fill(c.password);
  const terms = page.getByTestId('register-acceptTerms-checkbox');
  if (await terms.count() && !(await terms.isChecked().catch(() => true))) await terms.check().catch(() => terms.click());
  await page.waitForTimeout(1500);
  if (c.dob) await page.getByTestId('register-dateOfBirth-input').fill(c.dob);
  if (c.enter) await page.getByTestId('register-password-input').press('Enter');
  else await page.getByTestId('register-submit').click();
}

(async () => {
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext(); await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? r.continue() : r.abort(); }); return ctx.newPage(); };
  const cases = [
    { name: '1. Solo los campos obligatorios (sin fecha, sin ubicación, sin publicidad)', dni: cedula(1), firstName: 'Karina', lastName: 'Registro Minimo', email: `reg-min-${t}@prueba.local`, phone: '8888-1101', password: 'Prueba1234!' },
    { name: '2. Con provincia y cantón', dni: cedula(2), firstName: 'Mario', lastName: 'Registro Ubicacion', email: `reg-loc-${t}@prueba.local`, phone: '8888-1102', password: 'Prueba1234!', canton: 'Desamparados', dob: '1990-08-30', enter: true },
    { name: '3. El TSE responde y el cliente escribió su nombre antes', dni: cedula(3), firstName: 'Ana', lastName: 'Registro Tse', email: `reg-tse-${t}@prueba.local`, phone: '8888-1105', password: 'Prueba1234!', namesFirst: true, tseDob: '15/03/1985' },
  ];
  // The QA emulator blocks the real TSE; case 3 answers from the TSE cache the function reads first.
  const tse = cases.find((c) => c.tseDob);
  await fetch(`${B}/(default)/documents/tse_cedula_cache/${tse.dni}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { cachedAt: { integerValue: String(Date.now()) }, persona: { mapValue: { fields: { cedula: { stringValue: tse.dni }, nombreCompleto: { stringValue: 'ANA REGISTRO TSE' }, fechaNacimiento: { stringValue: tse.tseDob }, nacionalidad: { stringValue: 'COSTARRICENSE' } } } } } }) });
  for (const c of cases) {
    const page = await mk();
    const errors = []; let calls = 0;
    page.on('request', (r) => { if (r.url().includes('slRegisterUser') && r.method() === 'POST') calls++; });
    page.on('response', async (r) => { if (r.url().includes('slRegisterUser') && r.request().method() === 'POST' && r.status() >= 400) errors.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`); });
    await fillForm(page, c);
    const u = await until(() => byEmail(c.email), 30000);
    await page.waitForTimeout(3000);
    check(`   ${c.name.slice(0, 2)} una sola llamada de registro (${c.enter ? 'Enter' : 'clic'})`, calls === 1, `llamadas: ${calls}`);
    const redErr = await page.getByText('Error al crear tu cuenta').isVisible().catch(() => false);
    check(c.name, !!u && !redErr && !errors.length, u ? `SL ${v(u.f.slCode)}${errors.length ? ' · respuestas con error: ' + errors.join(' | ') : ''}` : `no se creó · ${errors[0] || (redErr ? 'mensaje rojo' : 'sin respuesta')}`);
    check(`   ${c.name.slice(0, 2)} sin mensaje rojo "Error al crear tu cuenta"`, !redErr);
    if (!u) { await page.context().close(); continue; }
    const sl = v(u.f.slCode);
    const login = await signIn(c.email, c.password);
    check(`   ${c.name.slice(0, 2)} el cliente puede entrar con su correo y contraseña`, !!login.idToken && login.localId === u.id);
    check(`   ${c.name.slice(0, 2)} código SL válido y datos completos en SP2`, /^SL\d+$/.test(sl || '') && v(u.f.firstName) === c.firstName && !!v(u.f.dni) && v(u.f.status) !== 'deleted', `${sl} dni=${v(u.f.dni)}`);
    const idx = await Promise.all([get('(default)', `email_index/${c.email}`), get('(default)', `slcode_index/${sl}`)]);
    check(`   ${c.name.slice(0, 2)} índices de correo y SL apuntan a la cuenta`, idx.every((x) => x && v(x.uid) === u.id));
    const f1 = await until(() => get('portal', `customers/${sl}`), 40000);
    check(`   ${c.name.slice(0, 2)} ficha SP1 con el MISMO código y correo`, !!f1 && v(f1.slCode) === sl && v(f1.email) === c.email && v(f1.status) !== 'deleted', f1 ? `SP1 ${v(f1.slCode)}` : 'sin ficha SP1');
    if (c.tseDob) check('   3. fecha y nacionalidad del TSE guardadas aunque el nombre ya estaba escrito', v(u.f.dateOfBirth) === '1985-03-15' && v(u.f.birthDate) === '1985-03-15' && /costa/i.test(v(u.f.nationality) || '') && v(u.f.firstName) === c.firstName, `${v(u.f.dateOfBirth)} · ${v(u.f.nationality)} · nombre ${v(u.f.firstName)}`);
    if (c.dob) check('   2. la fecha de nacimiento escrita se guardó (dateOfBirth y birthDate)', v(u.f.dateOfBirth) === c.dob && v(u.f.birthDate) === c.dob, `${v(u.f.dateOfBirth)} / ${v(u.f.birthDate)}`);
    if (c.canton) check('   2. la ubicación elegida se guardó', JSON.stringify(u.f.location || {}).includes('Desamparados') || JSON.stringify(u.f).includes('Desamparados'));
    await page.context().close();
  }
  // 4. Same cédula again → the form stops it at the cédula step with a clear message; no second account
  const page = await mk();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('register-form').waitFor({ timeout: 30000 });
  await page.getByTestId('register-dni-input').fill(cases[0].dni);
  await page.waitForTimeout(4000);
  const body = await page.locator('body').innerText();
  const msg = body.match(/[^\n]*(ya (tiene|existe|est[aá])|ya registrad|inicia sesi[oó]n)[^\n]*/i);
  const blocked = !(await page.getByText('Cédula disponible').isVisible().catch(() => false));
  check('4. La misma cédula otra vez → el formulario lo detiene y lo explica (no se crea otra cuenta)', blocked && !!msg, msg ? msg[0].slice(0, 100) : 'sin mensaje');
  await page.context().close();
  // 6. The exact encoding of the callable client (optional fields = null)
  const p6 = { firstName: 'Nulos', lastName: 'Cliente', email: `reg-null-${t}@prueba.local`, phone: '88881104', password: 'Prueba1234!', dni: cedula(4), dateOfBirth: null, nationality: null, location: null, acceptMarketing: null, acceptTerms: true };
  const r6 = await (await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: p6 }) })).json();
  check('6. Campos opcionales en null (como los codifica el cliente) → aceptado', r6.result?.success === true && /^SL\d+$/.test(r6.result?.slCode || ''), JSON.stringify(r6.error || { sl: r6.result?.slCode }).slice(0, 120));
  await b.close();
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
