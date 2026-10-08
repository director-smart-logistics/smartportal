// SP1 governs the package status in SP2, from ANY screen (onPackageStatusToSp2, 2026-09-28):
//   1. a status written straight to the SP1 package (inline edit in Paquetes, Distribución, scanner…, no browser push)
//      reaches the SP2 shipment by itself
//   2. SP1's decision wins even when it moves a package back (the admin decided it in SP1)
//   3. a change that is not the status (weight) sends nothing
//   4. a package without SL code is logged as skipped with the reason (never silent, never retried forever)
//   5. every push is in package_status_sync_logs with who / from / to / what SP2 answered
//   6. the warehouse scanner (slScannerLookup) only records the scan: status unchanged in SP1 and SP2, nothing pushed
// Run: node scripts/qa-emulator/e2e/sp1-status-trigger-sp2.cjs   (combined QA emulator)
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB2 = `${B}/(default)/documents`, DB1 = `${B}/portal/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x } : { stringValue: String(x) };
const put = (base, p, o, mask) => fetch(`${base}/${p}${mask ? '?' + Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&') : ''}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 25000) => { const end = Date.now() + ms; for (;;) { const x = await fn(); if (x || Date.now() > end) return x; await sleep(1000); } };
const logsFor = async (tracking) => ((await (await fetch(`${DB1}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'package_status_sync_logs' }], where: { fieldFilter: { field: { fieldPath: 'tracking' }, op: 'EQUAL', value: { stringValue: tracking } } } } }) })).json()).filter((r) => r.document).map((r) => r.document.fields));

(async () => {
  const SL = `SL9${t}`, INV = `QAINVT${t}`, T1 = `QATRIG${t}01`, T2 = `QATRIG${t}02`, TN = `QATRIGNOSL${t}`;
  const uid = `ut-${t}`;
  await put(DB2, `users/${uid}`, { slCode: SL, email: `ct-${t}@prueba.local`, firstName: 'Trigger', lastName: 'QA', role: 'customer' });
  for (const id of [T1, T2]) await put(DB2, `shipments/${id}`, { tracking: id, slCode: SL, userId: uid, status: 'route', invoiceId: INV, invoiceNumber: INV, createdAt: new Date().toISOString() });
  for (const id of [T1, T2]) await put(DB1, `packages/P${id}`, { trackingNumber: id, slCode: SL, status: 'on_route', statusLabel: 'En Ruta', ruta: 'Alajuela' });
  await put(DB1, `packages/P${TN}`, { trackingNumber: TN, status: 'on_route' });
  await sleep(3000);

  // 1 — as an inline edit in Paquetes / Distribución would do: only the SP1 doc changes, nobody pushes
  await put(DB1, `packages/P${T1}`, { status: 'delivered', statusLabel: 'Entregado', updatedBy: 'admin-qa@prueba.local' }, true);
  const s1 = await until(async () => v((await get(DB2, `shipments/${T1}`))?.status) === 'delivered' && 'delivered');
  check('1. Cambio de estado directo en SP1 (sin botón de sync) → SP2 lo aplica solo', s1 === 'delivered', `SP2: ${v((await get(DB2, `shipments/${T1}`))?.status)}`);
  check('1b. El otro paquete de la factura no se toca por este cambio', v((await get(DB2, `shipments/${T2}`))?.status) === 'route');

  // 2 — SP1 moves it back: SP1 decides
  await put(DB1, `packages/P${T1}`, { status: 'on_route', statusLabel: 'En Ruta' }, true);
  const s2 = await until(async () => v((await get(DB2, `shipments/${T1}`))?.status) === 'route' && 'route');
  check('2. Si SP1 lo regresa a En ruta, SP2 también (SP1 gobierna)', s2 === 'route');

  // 3 — weight only
  const before3 = (await logsFor(T2)).length;
  await put(DB1, `packages/P${T2}`, { weight: 9.5 }, true);
  await sleep(6000);
  check('3. Cambiar solo el peso no envía nada a SP2', (await logsFor(T2)).length === before3 && v((await get(DB2, `shipments/${T2}`))?.status) === 'route');

  // 4 — no SL
  await put(DB1, `packages/P${TN}`, { status: 'delivered' }, true);
  const ln = await until(async () => (await logsFor(TN))[0]);
  check('4. Paquete sin código SL → queda en el log como omitido con el motivo', !!ln && /Sin código SL/.test(JSON.stringify(ln.notUpdated || '')), ln ? JSON.stringify(ln.notUpdated).slice(0, 120) : 'sin log');

  // 5 — log content
  const l1 = await logsFor(T1);
  const first = l1.find((x) => v(x.status) === 'delivered');
  check('5. Log con origen, quién, de→a y respuesta de SP2', l1.length >= 2 && first && v(first.source) === 'onPackageStatusToSp2' && v(first.from) === 'on_route' && v(first.by) === 'admin-qa@prueba.local', `${l1.length} registros`);

  // 6 — warehouse scanner: sorting only
  const TS = `QATRIGSCAN${t}`;
  await put(DB1, `packages/P${TS}`, { trackingNumber: TS, tracking: TS, slCode: SL, status: 'on_route', statusLabel: 'En Ruta' });
  await put(DB2, `shipments/${TS}`, { tracking: TS, slCode: SL, userId: uid, status: 'route', createdAt: new Date().toISOString() });
  await sleep(2000);
  const scan = await (await fetch('http://127.0.0.1:5001/demo-sp-qa/us-central1/slScannerLookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { tracking: TS } }) })).json();
  await sleep(6000);
  const p6 = await get(DB1, `packages/P${TS}`);
  check('6. El escáner de bodega solo registra el escaneo: estado igual en SP1 y SP2, nada enviado', scan?.result?.found === true && v(p6?.status) === 'on_route' && !!p6?.scannedAt && v((await get(DB2, `shipments/${TS}`))?.status) === 'route' && (await logsFor(TS)).length === 0,
    `SP1=${v(p6?.status)} scannedAt=${!!p6?.scannedAt} SP2=${v((await get(DB2, `shipments/${TS}`))?.status)}`);

  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
