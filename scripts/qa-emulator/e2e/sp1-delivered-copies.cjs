// F9 — RoutesManagement bulk "Entregado" (SP1 → SP2 slSyncShipmentsFromSp1, exactly the payload the
// SP1 client sends: status delivered + forceSync) reaches EVERY SP2 copy of the customer's package:
// the legacy pre-alert twin ({tracking}_{uid}) and the invoice-sync copy — production case
// TBA334781454285 (one copy stayed "En ruta", the invoice card never reached Entregados).
// Another customer's document with the same number is never touched. Also the USPS long barcode
// (SP1 420+ZIP) that SP2 knows by the short number. Combined QA emulator only.
const DB = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slSyncShipmentsFromSp1';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const str = (v) => ({ stringValue: v });
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const put = (id, f) => fetch(`${DB}/shipments/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { createdAt: { timestampValue: new Date().toISOString() }, ...f } }) });
const status = async (id) => ((await (await fetch(`${DB}/shipments/${id}`, { headers: H })).json()).fields || {}).status?.stringValue;
const sync = (pkgs) => fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': 'qa-local-sync-secret' }, body: JSON.stringify({ packages: pkgs }) }).then((r) => r.json());

(async () => {
  const T = 'F9TBA0000000001', U = '9261290316854272399901', LONG = '42033195' + U;
  for (const id of [T, `${T}_e2e-sl90001`, `${T}_e2e-sl90002`, U, `${U}_e2e-sl90001`]) await fetch(`${DB}/shipments/${id}`, { method: 'DELETE', headers: H });
  // Customer SL90001: invoice-sync copy + legacy pre-alert twin, both "route" (invoice paid).
  await put(T, { tracking: str(T), slCode: str('SL90001'), userId: str('e2e-sl90001'), status: str('route'), invoiceId: str('QA-F9'), invoiceNumber: str('QA-F9'), createdFromInvoiceSync: { booleanValue: true } });
  await put(`${T}_e2e-sl90001`, { tracking: str(T), slCode: str('SL90001'), userId: str('e2e-sl90001'), status: str('route'), source: str('prealert'), invoiceId: str('QA-F9'), invoiceNumber: str('QA-F9') });
  // Another customer with the same number (recycled) — must not change.
  await put(`${T}_e2e-sl90002`, { tracking: str(T), slCode: str('SL90002'), userId: str('e2e-sl90002'), status: str('route') });
  // USPS: SP2 knows it by the short number (two copies), SP1 sends the long 420+ZIP barcode.
  await put(U, { tracking: str(U), slCode: str('SL90001'), userId: str('e2e-sl90001'), status: str('route'), invoiceId: str('QA-F9'), invoiceNumber: str('QA-F9') });
  await put(`${U}_e2e-sl90001`, { tracking: str(U), slCode: str('SL90001'), userId: str('e2e-sl90001'), status: str('route'), source: str('prealert') });
  await new Promise((r) => setTimeout(r, 1500));

  const res = await sync([
    { trackingNumber: T, slCode: 'SL90001', status: 'delivered', forceSync: true, invoiceId: 'QA-F9', invoiceNumber: 'QA-F9', invoiceStatus: 'paid' },
    { trackingNumber: LONG, slCode: 'SL90001', status: 'delivered', forceSync: true, invoiceId: 'QA-F9', invoiceNumber: 'QA-F9', invoiceStatus: 'paid' },
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  check('Respuesta del sync (lo que ve el admin)', res.summary?.updated === 2 && !res.summary?.skipped, JSON.stringify(res.summary));
  check('Copia de la factura → Entregado', await status(T) === 'delivered', await status(T));
  check('Gemelo de pre-alerta del MISMO cliente → Entregado (antes quedaba En ruta)', await status(`${T}_e2e-sl90001`) === 'delivered', await status(`${T}_e2e-sl90001`));
  check('Documento de OTRO cliente con el mismo número → no se toca', await status(`${T}_e2e-sl90002`) === 'route', await status(`${T}_e2e-sl90002`));
  check('USPS largo de SP1 → las dos copias cortas del cliente → Entregado', await status(U) === 'delivered' && await status(`${U}_e2e-sl90001`) === 'delivered', `${await status(U)} / ${await status(`${U}_e2e-sl90001`)}`);
  for (const id of [T, `${T}_e2e-sl90001`, `${T}_e2e-sl90002`, U, `${U}_e2e-sl90001`]) await fetch(`${DB}/shipments/${id}`, { method: 'DELETE', headers: H });
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
