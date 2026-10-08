// annulInvoicesByTrackingsAndManifest — the three callers behave as intended (2026-09-29).
// Every package was moved earlier by Carry-On (updatedManifest = '25-09-2026DAN').
//   1. driver route assistant (toTransitoria): the package ends IN consolidation (updatedManifest = transitoria) and the
//      customer's SP2 "En Consolidación" lists it with its first invoice date
//   2. manifest move (movePackagesBetweenManifestDocs, no option): updatedManifest is NOT touched (unchanged behavior —
//      the package keeps the manifest it was just moved to)
//   3. Nova regenerate (keepPackagesInManifest): manifest, status and updatedManifest untouched; only the invoice link goes
// Runs the app's real function in the logged-in SP1 page (vite dev server) against the QA emulator.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-annul-to-transitoria.cjs
const { chromium } = require('playwright');
const APP = 'http://localhost:5174';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB1 = `${B}/portal/documents`, DB2 = `${B}/(default)/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => typeof x === 'number' ? { doubleValue: x } : typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (base, p, o) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; for (;;) { const x = await fn(); if (x || Date.now() > end) return x; await sleep(1000); } };

const t = String(Date.now()).slice(-6);
const SL = 'SL90001', MAN = '25-09-2026DAN';
const mk = (k, day) => ({ id: `QA-ANN-${k}-${t}`, tr: `QAANN${k}${t}`, day, inv: `SL90001-202609${day}101010${t.slice(-3)}` });
const D = mk('D', '21'), M = mk('M', '22'), N = mk('N', '23');

(async () => {
  for (const c of [D, M, N]) {
    await put(DB1, `invoices/${c.id}`, { invoiceNumber: c.inv, slCode: SL, customerName: 'CLIENTE UNO', status: 'sent', manifestNumber: MAN, invoiceDate: `2026-09-${c.day}T16:10:10.000Z`, totalAmount: 5, invoiceItems: [{ trackingNumber: c.tr, description: 'QA', price: 5 }] });
    await put(DB1, `packages/${c.tr}`, { trackingNumber: c.tr, tracking: c.tr, slCode: SL, customerName: 'CLIENTE UNO', status: 'customs', manifestNumber: MAN, updatedManifest: MAN, invoiceId: c.id, invoiceNumber: c.inv, weight: 1, createdAt: '2026-09-20T15:00:00.000Z' });
  }
  await sleep(4000);
  // status each package has right before the call (the invoice trigger already moved it to 'processed')
  const before = {}; for (const c of [D, M, N]) before[c.tr] = v((await get(DB1, `packages/${c.tr}`))?.status);

  const b = await chromium.launch(); const ctx = await b.newContext();
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  const call = (tr, opts) => page.evaluate(async ([tr, man, opts]) => {
    const m = await import('/client/lib/services/invoice-service.ts');
    return m.annulInvoicesByTrackingsAndManifest([tr], man, opts);
  }, [tr, MAN, opts]);
  // exactly what each caller passes
  await call(D.tr, { reason: 'Consolidación de ruta: QA', annulledBy: 'driver_app', toTransitoria: true });
  await call(M.tr, { annulledBy: 'system-move', reason: 'Anulada por movimiento de paquetes a manifiesto X' });
  await call(N.tr, { annulledBy: 'nova', reason: 'Anular y re-crear', keepPackagesInManifest: true });
  await b.close();

  const pd = await until(async () => { const f = await get(DB1, `packages/${D.tr}`); return v(f?.status) === 'consolidated' && f; });
  check('1. Asistente del chofer: el paquete (movido antes por Carry-On) queda EN consolidación', v(pd?.updatedManifest) === 'consolidacion_transitoria' && v(pd?.manifestNumber) === 'consolidacion_transitoria', `updatedManifest=${v(pd?.updatedManifest)}`);
  const item = await until(async () => { const f = await get(DB2, `consolidation_items/${SL}_${D.tr}`); return v(f?.active) === true && f; });
  check('1b. …y el cliente lo ve en "En Consolidación" con la fecha de su primera factura (21/09)', !!item && String(v(item.since)).startsWith('2026-09-21'), item ? `since=${v(item.since)}` : 'no aparece');
  const pm = await get(DB1, `packages/${M.tr}`);
  check('2. Mover entre manifiestos: updatedManifest NO se toca (igual que antes del cambio)', v(pm?.updatedManifest) === MAN, `updatedManifest=${v(pm?.updatedManifest)} status=${v(pm?.status)}`);
  const pn = await get(DB1, `packages/${N.tr}`);
  check('3. Nova (regenerar): manifiesto, estado y updatedManifest intactos; solo se quita el vínculo a la factura', v(pn?.updatedManifest) === MAN && v(pn?.manifestNumber) === MAN && v(pn?.status) === before[N.tr] && !pn?.invoiceId, `manifest=${v(pn?.manifestNumber)} status ${before[N.tr]}→${v(pn?.status)}`);
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
