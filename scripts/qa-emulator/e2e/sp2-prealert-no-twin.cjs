// Phase 3 (F3.1–F3.3) in the combined QA emulator: a pre-alert through SP2's REAL public form
// (slSmartPreAlert) creates ONLY the pre-alert (no twin shipment); cancelling it (as the customer)
// and pre-alerting again reactivates the SAME pre-alert.
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const DB = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
const val = (f, k) => (f && f[k] ? Object.values(f[k])[0] : undefined);
let ok = 0, n = 0; const check = (name, cond, detail) => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name} — ${detail}`); };

const T = 'TBA330000000777';
const ID = `${T}_SL90001`;
const form = async () => (await fetch(`${FN}/slSmartPreAlert`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { tracking: T, sl: 'SL90001', dni: '100090001' } }) })).json();
const shipmentsOf = async () => {
  const q = await (await fetch(`${DB}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'shipments' }], where: { fieldFilter: { field: { fieldPath: 'tracking' }, op: 'EQUAL', value: { stringValue: T } } } } }) })).json();
  return q.filter((r) => r.document).map((r) => r.document.name.split('/').pop());
};

(async () => {
  await fetch(`${DB}/pre_alerts/${ID}`, { method: 'DELETE', headers: H });   // clean start (emulator)
  for (const id of await shipmentsOf()) await fetch(`${DB}/shipments/${id}`, { method: 'DELETE', headers: H });

  const r1 = await form();
  await pause(5000);   // slPreAlertCreated trigger
  const pa1 = (await (await fetch(`${DB}/pre_alerts/${ID}`, { headers: H })).json()).fields;
  check('El formulario público registra la pre-alerta', r1?.result?.success === true && val(pa1, 'active') === true, `respuesta=${JSON.stringify(r1?.result || r1?.error).slice(0, 90)}`);
  check('NO se crea paquete gemelo en shipments', (await shipmentsOf()).length === 0, `shipments con ${T}: ${(await shipmentsOf()).join(', ') || 'ninguno'}`);
  check('La pre-alerta no apunta a ningún paquete', !val(pa1, 'shipmentId'), `shipmentId=${val(pa1, 'shipmentId')}`);

  // The customer cancels it (what "Eliminar" will do in Phase 4: mark, never delete).
  await fetch(`${DB}/pre_alerts/${ID}?updateMask.fieldPaths=active&updateMask.fieldPaths=status&updateMask.fieldPaths=cancelledBy&updateMask.fieldPaths=cancelledAt`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ fields: { active: { booleanValue: false }, status: { stringValue: 'cancelled' },
      cancelledBy: { stringValue: 'customer' }, cancelledAt: { timestampValue: new Date().toISOString() } } }) });
  const r2 = await form();
  await pause(3000);
  const pa2 = (await (await fetch(`${DB}/pre_alerts/${ID}`, { headers: H })).json()).fields;
  check('Volver a pre-alertar lo que el cliente canceló → la MISMA pre-alerta, reactivada', r2?.result?.success === true && val(pa2, 'active') === true && val(pa2, 'status') === 'pending' && !val(pa2, 'cancelledBy'),
    `active=${val(pa2, 'active')} status=${val(pa2, 'status')} cancelledBy=${val(pa2, 'cancelledBy')}`);
  check('Sigue sin paquete gemelo', (await shipmentsOf()).length === 0, `shipments: ${(await shipmentsOf()).join(', ') || 'ninguno'}`);
  console.log(`\n${ok}/${n} OK`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
