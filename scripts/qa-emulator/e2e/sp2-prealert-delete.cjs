// F4.1 in the combined QA emulator: the customer deletes a pre-alert through slDeletePreAlert with a
// REAL session (Auth emulator). It disappears, a complete log stays in prealert_deletions; another
// account cannot delete it. Run after seed.sh + seed-dashboard-scenarios.cjs.
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slDeletePreAlert';
const DB = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail) => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name} — ${detail}`); };
const token = async (email) => (await (await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json()).idToken;
const del = async (email, preAlertId) => (await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token(email)}` },
  body: JSON.stringify({ data: { preAlertId } }) })).json();
const exists = async (path) => (await fetch(`${DB}/${path}`, { headers: H })).status === 200;

(async () => {
  const other = await del('cliente2@prueba.local', 'DASH01_SL90001');
  check('Otra cuenta NO puede borrarla', other.error?.status === 'PERMISSION_DENIED' && await exists('pre_alerts/DASH01_SL90001'), `respuesta=${JSON.stringify(other.error || other.result).slice(0, 80)}`);

  const r1 = await del('cliente1@prueba.local', 'DASH01_SL90001');
  check('El dueño la borra', r1.result?.success === true && !(await exists('pre_alerts/DASH01_SL90001')), `respuesta=${JSON.stringify(r1.result || r1.error).slice(0, 90)}`);

  const r2 = await del('cliente1@prueba.local', 'DASH04_SL90001');
  check('Con su gemelo viejo sin factura', r2.result?.twinDeleted === 'TBA339900000004_e2e-sl90' && !(await exists('shipments/TBA339900000004_e2e-sl90')), `twinDeleted=${r2.result?.twinDeleted}`);

  const r3 = await del('cliente1@prueba.local', 'DASH02_SL90001');
  check('Ligada a un paquete facturado → NO se borra', r3.error?.status === 'FAILED_PRECONDITION' && await exists('pre_alerts/DASH02_SL90001'), `respuesta=${JSON.stringify(r3.error).slice(0, 110)}`);

  const q = await (await fetch(`${DB}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'prealert_deletions' }] } }) })).json();
  const logs = q.filter((x) => x.document).map((x) => x.document.fields);
  const log1 = logs.find((f) => f.preAlertId?.stringValue === 'DASH01_SL90001');
  check('Registro completo en prealert_deletions', !!log1 && log1.deletedBy?.stringValue === 'e2e-sl90001' && log1.preAlert?.mapValue?.fields?.tracking?.stringValue === 'TBA339900000001',
    `registros=${logs.length} deletedBy=${log1?.deletedBy?.stringValue} tracking=${log1?.preAlert?.mapValue?.fields?.tracking?.stringValue}`);
  console.log(`\n${ok}/${n} OK`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
