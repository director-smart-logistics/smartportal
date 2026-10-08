// N14: an SP1 invoice that changes customer moves only its own packages (or current packages of
// its previous customer) — never another customer's package nor an old/finished one.
// Real SP1 trigger onInvoiceWritten, combined QA emulator only.
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const str = (v) => ({ stringValue: v });
const put = (path, f) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: f }) });
const sl = async (id) => { const j = await (await fetch(`${FS}/packages/${id}`, { headers: H })).json(); return j.fields?.slCode?.stringValue; };
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
let ok = 0, n = 0; const check = (name, cond, detail) => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name} — ${detail}`); };

(async () => {
  // Start clean (QA emulator): this test's invoice and packages from a previous run.
  for (const path of ['invoices/QA-N14', 'packages/N14-OWN', 'packages/N14-OTHER', 'packages/N14-OLD']) {
    await fetch(`${FS}/${path}`, { method: 'DELETE', headers: H });
  }
  await pause(3000);
  const pkg = (id, t, s, extra) => put(`packages/${id}`, { trackingNumber: str(t), tracking: str(t), slCode: str(s), status: str(extra.status), createdAt: str(extra.createdAt), ...(extra.invoiceId ? { invoiceId: str(extra.invoiceId) } : {}) });
  await pkg('N14-OWN', 'TBA330000000321', 'SL90002', { status: 'customs', createdAt: ago(2), invoiceId: 'QA-N14' });   // this invoice
  await pkg('N14-OTHER', 'TBA330000000321', 'SL90003', { status: 'customs', createdAt: ago(2) });                     // another customer
  await pkg('N14-OLD', 'TBA330000000322', 'SL90002', { status: 'delivered', createdAt: ago(200), invoiceId: 'QA-OLD' }); // recycled, finished, billed long ago
  // Like the invoices Nova creates: items with their tracking, not a draft.
  const item = (t) => ({ mapValue: { fields: { trackingNumber: str(t), description: str('Paquete'), quantity: { integerValue: '1' }, unitPrice: { doubleValue: 10 }, amount: { doubleValue: 10 } } } });
  const inv = (sl) => put('invoices/QA-N14', { invoiceNumber: str('QA-N14'), slCode: str(sl), clientName: str('X'), status: str('pending'),
    amount: { doubleValue: 20 }, subtotal: { doubleValue: 20 },
    trackingNumbers: { arrayValue: { values: [str('TBA330000000321'), str('TBA330000000322')] } },
    invoiceItems: { arrayValue: { values: [item('TBA330000000321'), item('TBA330000000322')] } } });
  await inv('SL90002'); await pause(4000);
  await inv('SL90001'); await pause(6000);                 // client reassignment SL90002 → SL90001
  check('paquete de ESTA factura → sigue a la factura', (await sl('N14-OWN')) === 'SL90001', await sl('N14-OWN'));
  check('paquete de OTRO cliente con el mismo tracking → no se toca', (await sl('N14-OTHER')) === 'SL90003', await sl('N14-OTHER'));
  check('paquete viejo y entregado (número reciclado) → no se toca', (await sl('N14-OLD')) === 'SL90002', await sl('N14-OLD'));
  console.log(`\n${ok}/${n} OK`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
