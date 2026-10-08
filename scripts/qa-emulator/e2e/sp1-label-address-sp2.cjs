// F11.2 — Nova label option "Actualizar también la dirección del cliente en SmartWeb (SP2)" on the QA
// emulator (real functions: SP1 slUpdateSp2AddressFromLabel → SP2 users doc → SP2 push → SP1 customer):
//   1. a DELIVERY account cannot change the address (nothing written)
//   2. the text the label already shows → nothing written
//   3. a corrected street + instructions → SP2 principal (users doc, addresses[0], collection copy)
//      changes, province/canton/district and recipient are kept, SP1 gets it at once, before/after logged
//   4. a legacy customer with two addresses marked principal → rejected, nothing written
//   5. an empty address → rejected
//   6. NOTHING IS ERASED: a text without the details / instructions lines keeps otras señas and notes (SP2 and SP1)
// Run: node scripts/qa-emulator/e2e/sp1-label-address-sp2.cjs
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const J = { 'Content-Type': 'application/json' };
const PASS = 'Prueba1234!';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null
  : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'timestampValue' in v ? v.timestampValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? obj(v.mapValue.fields || {}) : undefined;
const obj = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { integerValue: String(x) }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const getDoc = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? obj((await r.json()).fields) : null; };
const putDoc = (base, p, data) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const query = async (base, coll, field, value) => ((await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json())
  .filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), ...obj(r.document.fields) })));

async function account(email, role) {
  const up = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) })).json();
  const uid = up.localId || (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) })).json()).localId;
  if (role) await fetch(`${AUTH}/projects/demo-sp-qa/accounts:update`, { method: 'POST', headers: H, body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify({ role }) }) });
  const token = (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) })).json()).idToken;
  return { uid, token };
}
const call = async (token, data) => (await fetch(`${FN}/slUpdateSp2AddressFromLabel`, { method: 'POST', headers: { ...J, Authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) })).text().then((t) => { try { return JSON.parse(t); } catch { return { error: { status: 'NO_FUNCTION', message: t.slice(0, 60) } }; } });

const ADDR = { streetAddress: 'Del parque 100 m sur', details: 'Casa azul', deliveryInstructions: 'Llamar al llegar', province: 'Heredia', canton: 'Barva',
  district: 'San Pedro', country: 'Costa Rica', recipientName: 'Cliente Etiqueta', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

async function customer(email, sl, dni, { legacy = false } = {}) {
  const { uid } = await account(email);
  for (const a of await query(DB2, 'addresses', 'userId', uid)) await fetch(`${DB2}/addresses/${a.id}`, { method: 'DELETE', headers: H });
  await fetch(`${DB2}/users/${uid}`, { method: 'DELETE', headers: H });
  await fetch(`${DB1}/customers/${sl}`, { method: 'DELETE', headers: H });
  await pause(1000);
  const block = { ...ADDR, id: `${sl}-A`, userId: uid, isDefault: true, isPrimary: true, isActive: true, status: 'active' };
  const base = { uid, email, slCode: sl, firstName: 'Cliente', lastName: 'Etiqueta', dni, phone: '88881111', role: 'customer', status: 'active', isActive: true, isVerified: true };
  if (legacy) {
    await putDoc(DB2, `addresses/${sl}-A`, block);
    await putDoc(DB2, `addresses/${sl}-B`, { ...block, id: `${sl}-B`, streetAddress: 'Otra casa' });
    await putDoc(DB2, `users/${uid}`, base);
  } else {
    await putDoc(DB2, `addresses/${sl}-A`, block);
    await putDoc(DB2, `users/${uid}`, { ...base, defaultAddress: block, addresses: [block], addressModel: 'single-v1' });
  }
  return uid;
}

(async () => {
  const SL = 'SL90021', SLB = 'SL90022';
  const uid = await customer('cliente-f11@prueba.local', SL, '100090021');
  const uidB = await customer('cliente-f11b@prueba.local', SLB, '100090022', { legacy: true });
  const staff = await account('f11-staff@prueba.local', 'AGENT');
  const driver = await account('f11-driver@prueba.local', 'DELIVERY');
  await pause(5000);
  const before = await getDoc(DB2, `users/${uid}`);

  const r1 = await call(driver.token, { slCode: SL, deliveryAddress: 'Robo 1' });
  check('1. Una cuenta de repartidor NO puede cambiar la dirección', r1.error?.status === 'PERMISSION_DENIED' && (await getDoc(DB2, `users/${uid}`))?.defaultAddress?.streetAddress === ADDR.streetAddress, JSON.stringify(r1.error || r1.result).slice(0, 100));

  const r2 = await call(staff.token, { slCode: SL, deliveryAddress: 'Del parque 100 m sur\nCasa azul\nInstrucciones: Llamar al llegar' });
  check('2. El mismo texto que ya muestra la etiqueta → no se escribe nada', r2.result?.changed === false && (await getDoc(DB2, `users/${uid}`))?.updatedAt === before?.updatedAt, JSON.stringify(r2.error || r2.result).slice(0, 100));

  const NEW = 'Del parque 300 m sur\nCasa azul, portón negro\nInstrucciones: Dejar con el guarda';
  const r3 = await call(staff.token, { slCode: SL, deliveryAddress: NEW });
  const u = await getDoc(DB2, `users/${uid}`);
  const copy = await getDoc(DB2, `addresses/${SL}-A`);
  const d = u?.defaultAddress || {};
  const sp2ok = r3.result?.changed === true && u?.addressModel === 'single-v1' && d.streetAddress === 'Del parque 300 m sur' && d.details === 'Casa azul, portón negro'
    && d.deliveryInstructions === 'Dejar con el guarda' && d.province === 'Heredia' && d.canton === 'Barva' && d.district === 'San Pedro' && d.recipientName === 'Cliente Etiqueta'
    && d.id === `${SL}-A` && d.updatedBy === 'f11-staff@prueba.local' && u.addresses?.length === 1 && JSON.stringify(u.addresses[0]) === JSON.stringify(d)
    && copy?.streetAddress === d.streetAddress && copy?.deliveryInstructions === d.deliveryInstructions && !u.sp1LastPushAt;
  let sp1 = null; const t0 = Date.now();
  while (Date.now() - t0 < 20000) { sp1 = (await getDoc(DB1, `customers/${SL}`))?.defaultAddress; if (sp1?.streetAddress === 'Del parque 300 m sur') break; await pause(500); }
  const log = (await query(DB1, 'sp2_address_admin_edits', 'slCode', SL)).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];   // this run's
  check('3. Dirección corregida → cambia en SP2 (users, addresses[0], copia) sin tocar provincia/cantón/distrito, y llega a SP1 de inmediato',
    sp2ok && sp1?.streetAddress === 'Del parque 300 m sur' && sp1?.deliveryInstructions === 'Dejar con el guarda' && sp1?.district === 'San Pedro'
    && log?.before?.streetAddress === ADDR.streetAddress && log?.after?.streetAddress === 'Del parque 300 m sur' && log?.by === 'f11-staff@prueba.local',
    JSON.stringify({ r: r3.error?.message || r3.result?.changed, sp2ok, sp1: sp1?.streetAddress, seg: ((Date.now() - t0) / 1000).toFixed(1), log: !!log }).slice(0, 160));

  const bBefore = JSON.stringify([await getDoc(DB2, `users/${uidB}`), await getDoc(DB2, `addresses/${SLB}-A`), await getDoc(DB2, `addresses/${SLB}-B`)]);
  const r4 = await call(staff.token, { slCode: SLB, deliveryAddress: 'Cambio' });
  const bAfter = JSON.stringify([await getDoc(DB2, `users/${uidB}`), await getDoc(DB2, `addresses/${SLB}-A`), await getDoc(DB2, `addresses/${SLB}-B`)]);
  check('4. Cliente con dos direcciones principales → rechazado, nada cambia', r4.error?.status === 'FAILED_PRECONDITION' && bBefore === bAfter, (r4.error?.message || JSON.stringify(r4.result)).slice(0, 110));

  const r5 = await call(staff.token, { slCode: SL, deliveryAddress: '  \n ' });
  check('5. Dirección vacía → rechazado', r5.error?.status === 'INVALID_ARGUMENT' && (await getDoc(DB2, `users/${uid}`))?.defaultAddress?.streetAddress === 'Del parque 300 m sur', (r5.error?.message || '').slice(0, 80));

  const r6 = await call(staff.token, { slCode: SL, deliveryAddress: 'Del parque 400 m sur\nInstrucciones:' });
  const d6 = (await getDoc(DB2, `users/${uid}`))?.defaultAddress || {};
  let s6 = null; const t6 = Date.now();
  while (Date.now() - t6 < 20000) { s6 = (await getDoc(DB1, `customers/${SL}`))?.defaultAddress; if (s6?.streetAddress === 'Del parque 400 m sur') break; await pause(500); }
  check('6. No se borra nada: sin línea de detalles ni instrucciones, SP2 y SP1 conservan otras señas y notas',
    r6.result?.changed === true && d6.streetAddress === 'Del parque 400 m sur' && d6.details === 'Casa azul, portón negro' && d6.deliveryInstructions === 'Dejar con el guarda'
    && s6?.details === 'Casa azul, portón negro' && s6?.deliveryInstructions === 'Dejar con el guarda', JSON.stringify({ d: d6.details, i: d6.deliveryInstructions, sp1: s6?.details }).slice(0, 140));

  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
