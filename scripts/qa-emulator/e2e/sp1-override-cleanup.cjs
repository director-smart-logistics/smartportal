// F11.3 — scripts/audit/cleanup-admin-overrides.cjs on the QA emulator (real SP2 → SP1 sync).
// Rule by CONTENT (every word/number of dirección, otras señas, instrucciones). NOTHING IS DELETED.
//   1. dry-run writes nothing (SP1 and SP2)
//   2. --apply WITHOUT --sp2: only IGUAL gets its date; SP2 is not written
//   3. IGUAL (same content, other format): the override stays unchanged and only gets its date
//   4. A_SP2 (the admin added information): SP2 gets it, keeps everything the customer had, SP1 follows;
//      every word of both versions is in the result
//   5. REVISAR (the customer has information the admin text lacks / other service): untouched
//   6. PRECISION STOP: a write that would lose a word → SP2 restored, override not dated, run stops (exit 2)
//   7. --rollback: dates removed, SP2 address restored, SP1 follows
// Run: node scripts/qa-emulator/e2e/sp1-override-cleanup.cjs
const { execFileSync } = require('child_process');
const path = require('path');
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const J = { 'Content-Type': 'application/json' };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'integerValue' in v ? Number(v.integerValue)
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? obj(v.mapValue.fields || {}) : 'timestampValue' in v ? v.timestampValue : undefined;
const obj = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : x instanceof Date ? { timestampValue: x.toISOString() }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const fields = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)]));
const getDoc = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? obj((await r.json()).fields) : null; };
const put = (base, p, data) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: fields(data) }) });
const patch = (base, p, data) => fetch(`${base}/${p}?${Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: fields(data) }) });
const run = (a, env = {}) => { try { return { code: 0, out: execFileSync('node', [path.join(__dirname, '../../audit/cleanup-admin-overrides.cjs'), ...a, '--out', process.env.OUT || require('os').tmpdir()],
  { env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080', GCLOUD_PROJECT: 'demo-sp-qa', ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }; } catch (e) { return { code: e.status, out: String(e.stdout || '') }; } };
const tokens = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').split(' ').filter(Boolean));

const P = (updatedAt) => ({ streetAddress: 'Del parque 100 m sur', details: 'Casa azul', deliveryInstructions: 'Llamar', province: 'Heredia', canton: 'Barva', district: 'San Pedro',
  isDefault: true, isPrimary: true, isActive: true, status: 'active', encomienda: { name: 'Correos de Costa Rica' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt });
const OV = (text, courier = 'Correos de Costa Rica') => ({ deliveryAddress: text, courierService: courier });
const SAME = 'del parque 100 m sur, casa azul\nInstrucciones: LLAMAR';                                        // same content, other format
const ADDED = 'Del parque 100 m sur\nCasa azul, portón negro\nInstrucciones: Llamar, dejar en sucursal 12';  // the admin added information
const LACKS = 'Del parque 100 m sur\nInstrucciones: Llamar';                                                  // lacks the customer's otras señas
const SLS = ['SL90031', 'SL90033', 'SL90034', 'SL90035', 'SL90036'];

async function sp2Customer(sl, email, dni) {   // SP2 account with a single-v1 principal (the trigger creates the SP1 customer)
  const up = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json();
  const uid = up.localId || (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json()).localId;
  await fetch(`${DB2}/users/${uid}`, { method: 'DELETE', headers: H });
  await pause(800);
  const block = { ...P('2026-01-01T00:00:00.000Z'), id: `${sl}-A`, userId: uid };
  await put(DB2, `addresses/${sl}-A`, block);
  await put(DB2, `users/${uid}`, { uid, email, slCode: sl, firstName: 'Cliente', lastName: 'Override', dni, phone: '88882222', role: 'customer', status: 'active', isActive: true, isVerified: true,
    defaultAddress: block, addresses: [block], addressModel: 'single-v1' });
  return uid;
}
const snapshot = async (uid) => JSON.stringify([...(await Promise.all(SLS.map((sl) => getDoc(DB1, `customers/${sl}`)))), await getDoc(DB2, `users/${uid}`)]);

(async () => {
  for (const sl of SLS) await fetch(`${DB1}/customers/${sl}`, { method: 'DELETE', headers: H });
  const P0 = P('2026-01-01T00:00:00.000Z');
  await put(DB1, 'customers/SL90031', { slCode: 'SL90031', fullName: 'Igual', defaultAddress: P0, adminAddressOverride: OV(SAME) });
  await put(DB1, 'customers/SL90033', { slCode: 'SL90033', fullName: 'Otro servicio', defaultAddress: P0, adminAddressOverride: OV(SAME, 'Tracopa') });
  await put(DB1, 'customers/SL90035', { slCode: 'SL90035', fullName: 'Le falta info', defaultAddress: P0, adminAddressOverride: OV(LACKS) });
  const uid = await sp2Customer('SL90034', 'cliente-f113@prueba.local', '100090034');
  const uid6 = await sp2Customer('SL90036', 'cliente-f113b@prueba.local', '100090036');
  for (const sl of ['SL90034', 'SL90036']) {
    let c = null; for (let i = 0; i < 40 && !c?.defaultAddress; i++) { await pause(500); c = await getDoc(DB1, `customers/${sl}`); }
    await patch(DB1, `customers/${sl}`, { adminAddressOverride: OV(ADDED) });
  }
  await pause(2000);
  const five = ['SL90031', 'SL90033', 'SL90034', 'SL90035'];
  const snap = async () => JSON.stringify([...(await Promise.all(five.map((sl) => getDoc(DB1, `customers/${sl}`)))), await getDoc(DB2, `users/${uid}`)]);

  const before = await snap();
  run([]);
  await pause(1500);
  check('1. Dry-run no escribe nada (SP1 y SP2)', before === await snap());

  // 6 first, isolated: a write that loses a word must stop and restore.
  const stop = run(['--apply', '--sp2', '--sl', 'SL90036'], { F113_TEST_BREAK_SL: 'SL90036' });
  await pause(2500);
  const u6 = (await getDoc(DB2, `users/${uid6}`))?.defaultAddress || {};
  const c6 = await getDoc(DB1, 'customers/SL90036');
  check('6. Parada por precisión: si faltaría una palabra → SP2 restaurada, sin fecha, la corrida se detiene (exit 2)',
    stop.code === 2 && /SE DETIENE/.test(stop.out) && u6.details === 'Casa azul' && u6.deliveryInstructions === 'Llamar' && !c6.adminAddressOverride?.savedAt,
    JSON.stringify({ code: stop.code, sp2: [u6.details, u6.deliveryInstructions], fecha: c6.adminAddressOverride?.savedAt || null }));

  const noSp2 = run(['--apply', '--sl', 'SL90031,SL90034']);
  const r2run = (noSp2.out.match(/--rollback (\S+)/) || [])[1];
  const d0 = (await getDoc(DB2, `users/${uid}`))?.defaultAddress || {};
  const a0 = await getDoc(DB1, 'customers/SL90031'), b0 = await getDoc(DB1, 'customers/SL90034');
  check('2. --apply SIN --sp2: solo la IGUAL recibe fecha; SP2 no se escribe', !!a0.adminAddressOverride?.savedAt && !b0.adminAddressOverride?.savedAt && d0.details === 'Casa azul');
  run(['--rollback', r2run]);

  const out = run(['--apply', '--sp2', '--sl', 'SL90031,SL90033,SL90034,SL90035']);
  const runId = (out.out.match(/--rollback (\S+)/) || [])[1];
  let sp1 = null; for (let i = 0; i < 40; i++) { sp1 = await getDoc(DB1, 'customers/SL90034'); if (sp1?.defaultAddress?.details === 'Casa azul, portón negro') break; await pause(500); }
  const [a, c, e] = await Promise.all(['SL90031', 'SL90033', 'SL90035'].map((sl) => getDoc(DB1, `customers/${sl}`)));
  check('3. IGUAL: la escrita a mano se queda sin cambios y solo recibe su fecha',
    a.adminAddressOverride?.deliveryAddress === SAME && a.adminAddressOverride?.courierService === 'Correos de Costa Rica' && !!a.adminAddressOverride?.savedAt && a.adminAddressOverride?.savedAtSource === 'F11.3');
  const d2 = (await getDoc(DB2, `users/${uid}`))?.defaultAddress || {};
  const have = tokens([d2.streetAddress, d2.details, d2.deliveryInstructions].join(' '));
  const all = [...tokens(ADDED), ...tokens('Del parque 100 m sur Casa azul Llamar')].filter((w) => w !== 'instrucciones');
  check('4. A_SP2: SP2 recibe lo que el admin agregó, no pierde nada del cliente, provincia/cantón/distrito igual; SP1 la sigue',
    all.every((w) => have.has(w)) && d2.details === 'Casa azul, portón negro' && d2.deliveryInstructions === 'Llamar, dejar en sucursal 12' && d2.district === 'San Pedro'
    && sp1?.defaultAddress?.details === 'Casa azul, portón negro' && sp1?.defaultAddress?.deliveryInstructions === 'Llamar, dejar en sucursal 12' && sp1?.adminAddressOverride?.deliveryAddress === ADDED && !!sp1?.adminAddressOverride?.savedAt,
    JSON.stringify({ sp2: [d2.streetAddress, d2.details, d2.deliveryInstructions], faltan: all.filter((w) => !have.has(w)) }).slice(0, 170));
  check('5. REVISAR (a la escrita a mano le falta info del cliente / otro servicio): no se tocan',
    !c.adminAddressOverride.savedAt && c.adminAddressOverride.courierService === 'Tracopa' && !e.adminAddressOverride.savedAt && e.adminAddressOverride.deliveryAddress === LACKS);

  run(['--rollback', runId]);
  let r1 = null; for (let i = 0; i < 40; i++) { r1 = await getDoc(DB1, 'customers/SL90034'); if (r1?.defaultAddress?.details === 'Casa azul') break; await pause(500); }
  const r2 = (await getDoc(DB2, `users/${uid}`))?.defaultAddress || {};
  const ra = await getDoc(DB1, 'customers/SL90031');
  check('7. --rollback: se quitan solo las fechas, SP2 vuelve a su dirección y SP1 la sigue',
    JSON.stringify(ra.adminAddressOverride) === JSON.stringify(OV(SAME)) && JSON.stringify(r1.adminAddressOverride) === JSON.stringify(OV(ADDED))
    && r2.details === 'Casa azul' && r2.deliveryInstructions === 'Llamar' && r1.defaultAddress.details === 'Casa azul', JSON.stringify({ sp2: r2.details, sp1: r1?.defaultAddress?.details }));
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
