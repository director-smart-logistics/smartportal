// Gestión de Rutas → bulk status (slBulkUpdatePackageStatus) updates SP2 IN THE SAME CALL (2026-09-28):
//   1. "Entregado" on 2 packages of one invoice → both SP2 shipments delivered (the Facturados card goes to Entregados)
//      and the call returns what SP2 answered
//   2. a package without SL / a tracking SP2 does not have → reported as skipped WITH the reason (nothing silent)
//   3. the admin's status wins over SP2's regression guard only with forceSp2 (Gestión de Rutas); another caller
//      (e.g. a label reprint) never moves a delivered package back
//   4. every call is logged (package_status_sync_logs)
// Run: node scripts/qa-emulator/e2e/sp1-bulk-status-sp2.cjs   (combined QA emulator)
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB2 = `${B}/(default)/documents`, DB1 = `${B}/portal/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x } : { stringValue: String(x) };
const put = (base, p, o) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];

(async () => {
  // SP1 staff with the ADMIN role claim (what the callable checks)
  const email = `rutas-${t}@prueba.local`;
  const up = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await fetch(`${AUTH}/projects/demo-sp-qa/accounts:update`, { method: 'POST', headers: H, body: JSON.stringify({ localId: up.localId, customAttributes: JSON.stringify({ role: 'ADMIN' }) }) });
  const tok = (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json()).idToken;
  const call = async (data) => (await (await fetch(`${FN}/slBulkUpdatePackageStatus`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ data }) })).json()).result;

  const SL = `SL8${t}`, INV = `QAINVR${t}`, T1 = `QABULK${t}01`, T2 = `QABULK${t}02`, T3 = `QABULK${t}03`, T4 = `QABULK${t}04`;
  const uid = `u-${t}`;
  await put(DB2, `users/${uid}`, { slCode: SL, email: `c-${t}@prueba.local`, firstName: 'Bulk', lastName: 'QA', role: 'customer' });
  for (const [id, st] of [[T1, 'route'], [T2, 'route'], [T4, 'delivered']]) {
    await put(DB2, `shipments/${id}`, { tracking: id, slCode: SL, userId: uid, status: st, invoiceId: INV, invoiceNumber: INV, createdAt: new Date().toISOString() });
  }
  for (const [id, sl] of [[T1, SL], [T2, SL], [T3, SL], [T4, SL]]) await put(DB1, `packages/P${id}`, { trackingNumber: id, slCode: sl, status: 'route', statusLabel: 'En Ruta', ruta: 'Alajuela' });
  await put(DB1, `packages/PNOSL${t}`, { trackingNumber: `QANOSL${t}`, status: 'route' });
  await new Promise((r) => setTimeout(r, 2000));

  // 1 + 2
  const r1 = await call({ packageIds: [`P${T1}`, `P${T2}`, `P${T3}`, `PNOSL${t}`], status: 'delivered', extraFields: { statusLabel: 'Entregado' }, forceSp2: true });
  const s1 = v((await get(DB2, `shipments/${T1}`))?.status), s2 = v((await get(DB2, `shipments/${T2}`))?.status);
  check('1. Entregado en Rutas → SP2 entregado en el mismo paso (la tarjeta de la factura pasa a Entregados)', s1 === 'delivered' && s2 === 'delivered' && r1?.sp2?.updated >= 2, JSON.stringify({ s1, s2, sp2: r1?.sp2 && { u: r1.sp2.updated, s: r1.sp2.skipped, e: r1.sp2.errors } }));
  const det = r1?.sp2?.details || [];
  check('2. Omitidos con su motivo: sin SL en SP1 y tracking que SP2 no tiene', det.some((d) => d.tracking === `QANOSL${t}` && /Sin código SL/.test(d.reason || '')) && det.some((d) => d.tracking === T3 && d.reason), det.map((d) => `${d.tracking}: ${d.reason}`).join(' | '));
  // 3
  await call({ packageIds: [`P${T4}`], status: 'route', extraFields: {} });
  check('3a. Sin forzado (otro uso, p. ej. reimpresión de etiqueta) un entregado NO retrocede en SP2', v((await get(DB2, `shipments/${T4}`))?.status) === 'delivered');
  await call({ packageIds: [`P${T4}`], status: 'route', extraFields: {}, forceSp2: true });
  check('3b. Con forzado (decisión explícita en Gestión de Rutas) la ruta del admin gana en SP2', v((await get(DB2, `shipments/${T4}`))?.status) === 'route');
  // 4
  const logs = ((await (await fetch(`${DB1}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'package_status_sync_logs' }], where: { fieldFilter: { field: { fieldPath: 'by' }, op: 'EQUAL', value: { stringValue: email } } } } }) })).json()).filter((r) => r.document));
  check('4. Cada acción queda en el log con lo que respondió SP2', logs.length === 3);
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
