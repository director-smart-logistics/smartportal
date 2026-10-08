// SP1 → SP2 invoice sync: a recycled number (A1) and an unknown slCode (A2) must never move or
// hide another customer's package. Real endpoint slSyncInvoicesFromSp1, combined QA emulator only.
const BASE = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const SYNC = { 'Content-Type': 'application/json', 'x-sync-secret': 'qa-local-sync-secret' };
const str = (v) => ({ stringValue: v });
const ts = (d) => ({ timestampValue: new Date(Date.now() - d * 864e5).toISOString() });
const put = (path, f) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: f }) });
const get = async (p) => { const r = await fetch(`${FS}/${p}`, { headers: H }); if (r.status === 404) return null; const j = await r.json(); const o = {}; for (const [k, v] of Object.entries(j.fields || {})) o[k] = v.stringValue ?? v.nullValue ?? v.booleanValue; return o; };
const list = async () => { const j = await (await fetch(`${FS}/shipments?pageSize=300`, { headers: H })).json(); return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), t: d.fields?.tracking?.stringValue, sl: d.fields?.slCode?.stringValue, uid: d.fields?.userId?.stringValue, inv: d.fields?.invoiceId?.stringValue })); };
const inv = (id, sl, t) => fetch(`${BASE}/slSyncInvoicesFromSp1`, { method: 'POST', headers: SYNC, body: JSON.stringify({ invoices: [{ id, invoiceNumber: id, slCode: sl, clientName: 'X', status: 'pending', amount: 1, subtotal: 1, trackingNumber: t, trackingNumbers: [t], items: [{ description: 'p', tracking: t, quantity: 1, unitPrice: 1, amount: 1 }] }] }) }).then((r) => r.json());
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
let ok = 0, n = 0; const check = (name, cond, detail) => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name} — ${detail}`); };

(async () => {
  // A1: SL90002 received TBA330000000311 300 days ago (delivered; SP1-created doc, id = tracking).
  await put('shipments/TBA330000000311', { tracking: str('TBA330000000311'), slCode: str('SL90002'), userId: str('e2e-sl90002'), status: str('delivered'), createdAt: ts(300) });
  await pause(1500); await inv('QA-A1', 'SL90001', 'TBA330000000311'); await pause(3000);
  const old = await get('shipments/TBA330000000311');
  const mine = (await list()).filter((s) => s.t === 'TBA330000000311' && s.sl === 'SL90001');
  check('A1 número reciclado: el paquete viejo de SL90002 sigue siendo suyo', old && old.slCode === 'SL90002' && old.userId === 'e2e-sl90002' && !old.invoiceId, `viejo=${JSON.stringify(old && { sl: old.slCode, uid: old.userId, inv: old.invoiceId })}`);
  check('A1 SL90001 recibe su PROPIO paquete nuevo con la factura', mine.length === 1 && mine[0].inv === 'QA-A1' && mine[0].id !== 'TBA330000000311', `nuevo=${JSON.stringify(mine)}`);

  // A1 (SP1 domina): a CURRENT package of SL90002 invoiced to SL90001 → reassigned (operator correction).
  await put('shipments/TBA330000000312', { tracking: str('TBA330000000312'), slCode: str('SL90002'), userId: str('e2e-sl90002'), status: str('customs'), createdAt: ts(3) });
  await pause(1500); await inv('QA-A1B', 'SL90001', 'TBA330000000312'); await pause(3000);
  const cur = await get('shipments/TBA330000000312');
  check('A1 paquete ACTUAL de otra cuenta → se reasigna (SP1 domina, sin cambio)', cur && cur.slCode === 'SL90001' && cur.invoiceId === 'QA-A1B', JSON.stringify(cur && { sl: cur.slCode, inv: cur.invoiceId }));

  // A2: invoice with an slCode that does not exist in SP2.
  await put('shipments/TBA330000000313_e2e-sl90', { tracking: str('TBA330000000313'), slCode: str('SL90001'), userId: str('e2e-sl90001'), status: str('pre-alerted'), createdAt: ts(2) });
  await pause(1500); await inv('QA-A2', 'SL99999', 'TBA330000000313'); await pause(3000);
  const p2 = await get('shipments/TBA330000000313_e2e-sl90');
  check('A2 SL inexistente: el paquete de SL90001 conserva dueño y no se liga', p2 && p2.slCode === 'SL90001' && p2.userId === 'e2e-sl90001' && !p2.invoiceId, JSON.stringify(p2 && { sl: p2.slCode, uid: p2.userId, inv: p2.invoiceId }));
  console.log(`\n${ok}/${n} OK`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
