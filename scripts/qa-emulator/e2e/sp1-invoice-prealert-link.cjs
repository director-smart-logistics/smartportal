// Phase 2 (F2.1–F2.3) across systems, combined QA emulator only:
// Nova saved the manifest (packages carry their confirmed pre-alert) → an SP1 invoice is written →
// onInvoiceWritten sends preAlertLinks → SP2 slSyncInvoicesFromSp1 links pre-alert ↔ shipment BY ID.
// Run AFTER: nova-upload.cjs with SAVE=1 on the scenarios manifest.
const BASE = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const str = (v) => ({ stringValue: v });
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
const get = async (db, path) => (await (await fetch(`${BASE}/${db}/documents/${path}`, { headers: H })).json()).fields || null;
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : undefined);
let ok = 0, n = 0; const check = (name, cond, detail) => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name} — ${detail}`); };

const FEDEX34 = '9632001960806794376300877098560696';
(async () => {
  const pkg = await get('portal', `packages/${FEDEX34}`);
  check('SP1: el paquete guardado por Nova tiene su pre-alerta', val(pkg, 'preAlertId') === '877098560696_SL90001', `preAlertId=${val(pkg, 'preAlertId')}`);

  const item = (t) => ({ mapValue: { fields: { trackingNumber: str(t), description: str('Paquete'), quantity: { integerValue: '1' }, unitPrice: { doubleValue: 10 }, amount: { doubleValue: 10 } } } });
  const inv = (id, sl, ts) => fetch(`${BASE}/portal/documents/invoices/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
    invoiceNumber: str(id), slCode: str(sl), clientName: str('QA'), status: str('pending'), amount: { doubleValue: 10 * ts.length },
    subtotal: { doubleValue: 10 * ts.length }, manifestNumber: str('PREALERT-SCENARIOS'),
    trackingNumbers: { arrayValue: { values: ts.map(str) } }, invoiceItems: { arrayValue: { values: ts.map(item) } } } }) });
  await inv('QA-F23-1', 'SL90001', [FEDEX34, 'TBA330000000402']);
  await inv('QA-F23-2', 'SL90002', ['TBA330000000301']);
  await pause(9000);   // SP1 trigger → SP2 sync

  const sh1 = await get('(default)', `shipments/${FEDEX34}`);
  const pa1 = await get('(default)', 'pre_alerts/877098560696_SL90001');
  check('SP2: el paquete del FedEx 34 quedó facturado y ligado a su pre-alerta (sin búsqueda)', val(sh1, 'invoiceId') === 'QA-F23-1' && val(sh1, 'prealertId') === '877098560696_SL90001', `invoiceId=${val(sh1, 'invoiceId')} prealertId=${val(sh1, 'prealertId')}`);
  check('SP2: la pre-alerta apunta a ese paquete y quedó facturada', val(pa1, 'shipmentId') === FEDEX34 && val(pa1, 'status') === 'invoiced', `shipmentId=${val(pa1, 'shipmentId')} status=${val(pa1, 'status')}`);
  const sh2 = await get('(default)', 'shipments/TBA330000000402');
  check('SP2: paquete sin pre-alerta → facturado como antes, sin prealertId', val(sh2, 'invoiceId') === 'QA-F23-1' && !val(sh2, 'prealertId'), `invoiceId=${val(sh2, 'invoiceId')} prealertId=${val(sh2, 'prealertId')}`);
  const sh3 = await get('(default)', 'shipments/TBA330000000301');
  const pa3 = await get('(default)', 'pre_alerts/TBA330000000301_SL90002');
  check('SP2: TBA de SL90002 ligado por id en ambos lados', val(sh3, 'prealertId') === 'TBA330000000301_SL90002' && val(pa3, 'shipmentId') === 'TBA330000000301' && val(pa3, 'status') === 'invoiced', `prealertId=${val(sh3, 'prealertId')} pre-alerta.shipmentId=${val(pa3, 'shipmentId')} ${val(pa3, 'status')}`);

  // Re-sync (invoice updated): nothing duplicated.
  await fetch(`${BASE}/portal/documents/invoices/QA-F23-1?updateMask.fieldPaths=notes`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { notes: str('re-sync') } }) });
  await pause(6000);
  const list = await (await fetch(`${BASE}/(default)/documents/shipments?pageSize=300`, { headers: H })).json();
  const same = (list.documents || []).filter((d) => val(d.fields, 'tracking') === FEDEX34 || val(d.fields, 'tracking') === '877098560696');
  check('Re-sincronizar no duplica', same.length === 1, `paquetes con ese número en SP2: ${same.map((d) => d.name.split('/').pop()).join(', ')}`);
  console.log(`\n${ok}/${n} OK`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
