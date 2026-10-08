// SP1 Paquetes/Facturas — "Manifiesto" cell → "Consolidación Transitoria" (moveInvoiceToTransitoria), 2026-09-28.
// Real case: a package that was moved to a manifest before (Carry-On → updatedManifest '25-09-2026DAN') and whose
// invoice is then annulled from the cell. Before the fix it kept updatedManifest = old manifest, so it vanished from
// SP1's Consolidation page and from SP2's "En Consolidación" list.
//   1. the package ends in consolidation: updatedManifest AND manifestNumber = consolidacion_transitoria, status consolidated
//   2. the invoice is annulled, its sibling package too (same invoice) — nothing else changes
//   3. SP2 "En Consolidación" (consolidation_items) lists it, with the FIRST invoice date (not the annul date)
//   4. a package of another invoice is not touched
// Runs the app's real function in the logged-in SP1 page (vite dev server) against the QA emulator.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-manifest-cell-transitoria.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const OUT = process.env.OUT || require('os').tmpdir();
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
const SL = 'SL90001';
const INV_ID = `QA-MCELL-${t}`, INV = `SL90001-20260922101010${t.slice(-3)}`; // first invoice 22/09
const A = `QAMCELL${t}A`, S = `QAMCELL${t}S`, X = `QAMCELL${t}X`;

(async () => {
  const pkg = (tr, extra = {}) => ({ trackingNumber: tr, tracking: tr, slCode: SL, customerName: 'CLIENTE UNO', status: 'customs', statusLabel: 'En Aduanas', manifestNumber: '25-09-2026DAN', updatedManifest: '25-09-2026DAN', weight: 1, createdAt: '2026-09-20T15:00:00.000Z', ...extra });
  await put(DB1, `invoices/${INV_ID}`, { invoiceNumber: INV, slCode: SL, customerName: 'CLIENTE UNO', status: 'sent', invoiceDate: '2026-09-22T16:10:10.000Z', totalAmount: 10, manifestNumber: '25-09-2026DAN', invoiceItems: [{ trackingNumber: A, description: 'QA', price: 5 }, { trackingNumber: S, description: 'QA', price: 5 }] });
  await put(DB1, `packages/${A}`, pkg(A, { invoiceId: INV_ID, invoiceNumber: INV }));
  await put(DB1, `packages/${S}`, pkg(S, { invoiceId: INV_ID, invoiceNumber: INV }));
  await put(DB1, `packages/${X}`, pkg(X));
  await sleep(4000);

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  // The same call the "Manifiesto" cell makes on confirm (PackageManifestEditor.handleConfirmTransitoria).
  const res = await page.evaluate(async (id) => {
    const m = await import('/client/lib/services/invoice-service.ts');
    return m.moveInvoiceToTransitoria(id, { annulledBy: 'admin@prueba.local', reason: 'Movido a Consolidación Transitoria desde celda de Paquetes' });
  }, INV_ID);
  await b.close();

  const pa = await until(async () => { const f = await get(DB1, `packages/${A}`); return v(f?.status) === 'consolidated' && f; });
  const ps = await get(DB1, `packages/${S}`), px = await get(DB1, `packages/${X}`), inv = await get(DB1, `invoices/${INV_ID}`);
  check('1. El paquete (antes movido por Carry-On) queda EN consolidación: updatedManifest y manifestNumber = transitoria', v(pa?.updatedManifest) === 'consolidacion_transitoria' && v(pa?.manifestNumber) === 'consolidacion_transitoria' && v(pa?.status) === 'consolidated',
    `updatedManifest=${v(pa?.updatedManifest)} manifestNumber=${v(pa?.manifestNumber)} res=${JSON.stringify({ ok: res?.success, moved: res?.movedTrackings?.length })}`);
  check('2. La factura queda anulada y el otro paquete de la factura también pasa a consolidación', v(inv?.status) === 'annulled' && v(ps?.updatedManifest) === 'consolidacion_transitoria');
  check('4. Un paquete de otra factura no se toca', v(px?.updatedManifest) === '25-09-2026DAN' && v(px?.status) === 'customs');
  const item = await until(async () => { const f = await get(DB2, `consolidation_items/${SL}_${A}`); return v(f?.active) === true && f; });
  check('3. SP2 "En Consolidación" lo lista con la fecha de su PRIMERA factura (22/09), no la de hoy', !!item && String(v(item.since)).startsWith('2026-09-22'), item ? `since=${v(item.since)}` : 'no aparece');

  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
