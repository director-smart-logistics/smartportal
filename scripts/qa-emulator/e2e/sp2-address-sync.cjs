// F8 — the customer's address in SP2 reaches SP1 (customers/{slCode}) at once and never goes back
// to an old one. Combined QA emulator only (real SP2 triggers → real SP1 slSyncCustomerFromSp2).
//   1. Customer saves a new address in SP2 → SP1 has it as default within seconds.
//   2. Three fast edits → SP1 ends with the LAST one.
//   3. An OLD push (snapshot taken before the last edit) arrives LAST at SP1 → SP1 keeps the current
//      address (G1: before F8.1 the old push overwrote it and the label printed the old address).
//   4. F8.2: outside the GAM with a service the customer PROPOSED → SP1 has it as suggestion + note
//      in the delivery instructions (the label prints them); 5. an official service removes both.
//   6. G7: the customer moves back into the GAM (SP2 requiresEncomienda:false) → SP1 clears the old
//      encomienda; 7. a legacy address document that does not state it keeps SP1's value.
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const FN1 = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slSyncCustomerFromSp2';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const UID = 'e2e-sl90001', SL = 'SL90001', ADDR = 'F8ADDR_e2e-sl90001';
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const str = (v) => ({ stringValue: v }); const bool = (v) => ({ booleanValue: v });
const addrFields = (street) => ({ createdAt: { timestampValue: '2026-09-01T10:00:00Z' }, userId: str(UID), alias: str('Casa'), streetAddress: str(street), province: str('San José'), canton: str('Escazú'),
  district: str('San Rafael'), country: str('Costa Rica'), isDefault: bool(true), isPrimary: bool(true), isActive: bool(true), status: str('active'),
  updatedAt: { timestampValue: new Date().toISOString() } });
const writeAddr = (street) => fetch(`${DB2}/addresses/${ADDR}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: addrFields(street) }) });
const sp1Street = async () => {
  const f = (await (await fetch(`${DB1}/customers/${SL}`, { headers: H })).json()).fields || {};
  return f.defaultAddress?.mapValue?.fields?.streetAddress?.stringValue;
};
const waitFor = async (want, ms = 25000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await sp1Street(); if (v === want) return { v, s: ((Date.now() - t0) / 1000).toFixed(1) }; await pause(500); } return { v, s: '>' + ms / 1000 }; };

(async () => {
  // The seeded embedded address of this account (users.addresses) is replaced by one real document.
  await fetch(`${DB2}/addresses/${ADDR}`, { method: 'DELETE', headers: H });
  await pause(3000);

  await writeAddr('F8 Calle 1');
  let r = await waitFor('F8 Calle 1');
  check('1. Dirección nueva en SP2 → SP1 la tiene como principal', r.v === 'F8 Calle 1', `SP1="${r.v}" en ${r.s}s`);

  for (const s of ['F8 Calle 2', 'F8 Calle 3', 'F8 Calle 4']) { await writeAddr(s); await pause(150); }
  r = await waitFor('F8 Calle 4');
  await pause(8000); const later = await sp1Street();
  check('2. Tres cambios rápidos → SP1 queda con el ÚLTIMO', r.v === 'F8 Calle 4' && later === 'F8 Calle 4', `SP1="${r.v}" en ${r.s}s; 8s después="${later}"`);

  // 3. A push that left with an old snapshot arrives last (what a slow trigger does in production).
  const user = { uid: UID, slCode: SL, email: 'cliente1@prueba.local', firstName: 'Cliente', lastName: 'Uno',
    updatedAt: new Date(Date.now() - 60000).toISOString(),
    addresses: [{ id: ADDR, userId: UID, alias: 'Casa', streetAddress: 'F8 Calle VIEJA', province: 'San José', canton: 'Escazú', isDefault: true, isActive: true, status: 'active' }] };
  const res = await fetch(FN1, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': 'qa-local-sync-secret' }, body: JSON.stringify({ user }) });
  await pause(1500);
  const after = await sp1Street();
  check('3. Un push VIEJO que llega de último NO pisa la dirección actual', after === 'F8 Calle 4', `HTTP ${res.status}; SP1="${after}"`);

  // 4–5. F8.2 encomienda proposed by the customer.
  const encFields = (extra) => ({ ...addrFields('F8 Calle 4'), requiresEncomienda: bool(true), deliveryInstructions: str('Portón negro'), ...extra });
  const sp1Addr = async () => (await (await fetch(`${DB1}/customers/${SL}`, { headers: H })).json()).fields?.defaultAddress?.mapValue?.fields || {};
  const v = (f, k) => (f[k] ? Object.values(f[k])[0] : undefined);
  const waitAddr = async (pred) => { for (let i = 0; i < 40; i++) { const f = await sp1Addr(); if (pred(f)) return f; await pause(500); } return sp1Addr(); };
  await fetch(`${DB2}/addresses/${ADDR}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: encFields({ encomiendaPendingReview: bool(true), encomiendaSubmittedName: str('Transportes QA') }) }) });
  let f = await waitAddr((x) => v(x, 'encomiendaSuggestedName') === 'Transportes QA');
  check('4. Encomienda propuesta por el cliente → SP1 la tiene y la nota va en las instrucciones (etiqueta)',
    v(f, 'encomiendaSuggestedName') === 'Transportes QA' && String(v(f, 'deliveryInstructions')).startsWith('Encomienda sugerida por el cliente: Transportes QA'),
    `sugerida=${v(f, 'encomiendaSuggestedName')} instrucciones="${v(f, 'deliveryInstructions')}"`);
  await fetch(`${DB2}/addresses/${ADDR}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: encFields({ encomienda: { mapValue: { fields: { id: str('correos'), name: str('Correos de Costa Rica') } } } }) }) });
  f = await waitAddr((x) => v(x, 'encomiendaSuggestedName') === null || v(x, 'encomiendaSuggestedName') === undefined);
  check('5. Con servicio oficial la sugerencia y su nota desaparecen', !v(f, 'encomiendaSuggestedName') && v(f, 'deliveryInstructions') === 'Portón negro',
    `sugerida=${v(f, 'encomiendaSuggestedName')} instrucciones="${v(f, 'deliveryInstructions')}"`);
  // 5b. From an official service to one the customer proposes → the proposal replaces the old one.
  await fetch(`${DB2}/addresses/${ADDR}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: encFields({ encomiendaPendingReview: bool(true), encomiendaSubmittedName: str('Transportes QA 2') }) }) });
  f = await waitAddr((x) => v(x, 'encomiendaSuggestedName') === 'Transportes QA 2');
  check('5b. Cambia de un servicio oficial a uno propuesto → SP1 deja el propuesto, no el viejo', v(f, 'encomiendaSuggestedName') === 'Transportes QA 2' && !f.encomienda?.mapValue,
    `sugerida=${v(f, 'encomiendaSuggestedName')} encomienda=${f.encomienda?.mapValue?.fields?.name?.stringValue}`);
  // 6. Back inside the GAM: SP2 states requiresEncomienda:false and has no encomienda.
  await fetch(`${DB2}/addresses/${ADDR}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { ...addrFields('F8 Calle GAM'), requiresEncomienda: bool(false) } }) });
  f = await waitAddr((x) => v(x, 'streetAddress') === 'F8 Calle GAM' && !x.encomienda?.mapValue);
  check('6. Vuelve al GAM → SP1 quita la encomienda vieja', v(f, 'streetAddress') === 'F8 Calle GAM' && !f.encomienda?.mapValue && v(f, 'requiresEncomienda') === false,
    `encomienda=${JSON.stringify(f.encomienda || null).slice(0, 60)} requiere=${v(f, 'requiresEncomienda')}`);
  // 7. Legacy document (no requiresEncomienda field) after SP1 had an encomienda → preserved as before.
  await fetch(`${DB2}/addresses/${ADDR}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: encFields({ encomienda: { mapValue: { fields: { id: str('correos'), name: str('Correos de Costa Rica') } } } }) }) });
  await waitAddr((x) => !!x.encomienda?.mapValue);
  await writeAddr('F8 Calle Legacy');
  f = await waitAddr((x) => v(x, 'streetAddress') === 'F8 Calle Legacy');
  check('7. Documento legacy sin el dato → SP1 conserva su encomienda (como antes)', f.encomienda?.mapValue?.fields?.name?.stringValue === 'Correos de Costa Rica',
    `encomienda=${f.encomienda?.mapValue?.fields?.name?.stringValue}`);
  await writeAddr('F8 Calle 4');

  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
