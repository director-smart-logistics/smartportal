// "Día 1" in the consolidation manifests (rule 2026-09-28: the FIRST invoice of the package), emulated end to end on the QA emulator with the REAL Nova
// app (http://localhost:5174): the scenarios are built with the app's own annul flows
// (invoice-service moveInvoiceToTransitoria = "anulada → consolidación transitoria", and
// annulInvoicesByTrackingsAndManifest), then the page /consolidation/manifests is read as the admin sees it.
//
// Customer SL90050. Invoices #1 = 30 days ago, #2 = 15, #3 = 5, #5 = 10 (other flow), #4 = 2 (active),
// #6 = 25 and #7 = 12 (the production case SL26254).
//   P0 never invoiced (entered 20 days ago), sent to transitoria unlinked → Día 1 = 20 days ago · sin factura
//   P1 #1 annulled                                   → #1 (30) · anulada #1
//   P2 #1 annulled → re-invoiced #2 → annulled        → #1 (30) · anulada #1 (its FIRST invoice)
//   P3 #1 → #2 → #3, all annulled                     → #1 (30) · anulada #1
//   P7 #6 annulled → carry-on to another manifest → re-invoiced with P8 in #7 → annulled → #6 (25) (SL26254 package A)
//   P8 first invoice #7 (with P7), annulled           → #7 (12) (SL26254 package B)
//   P5 #2 annulled, then moved to another block       → leaves this view (it only shows transitoria); rule in day-one.spec S4
//   P6 #5 annulled by the other annul flow            → #5 (10) · anulada #5
//   P4 inside active invoice #4                       → shown in its invoice (not a consolidation line)
//   Customer counter ("Consolida desde")              → the OLDEST: #1 (30 days ago)
// Then NO FUNCTIONAL REGRESSION: the same customer card rendered with the code before F10 must be identical
// except the "Día 1" / counter texts (blocks, packages, weights, amounts, invoices, buttons).
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-consolidation-day-one.cjs
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const ROOT = path.join(__dirname, '../../..');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (p, data) => fetch(`${DB1}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const patch = (p, data) => fetch(`${DB1}/${p}?${Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });

const SL = 'SL90050';
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000);
const crDate = (d) => daysAgo(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Costa_Rica' });
const stamp = (d) => { const x = new Date(daysAgo(d).getTime() - 6 * 3600e3); const p = (v, l = 2) => String(v).padStart(l, '0');
  return `${x.getUTCFullYear()}${p(x.getUTCMonth() + 1)}${p(x.getUTCDate())}${p(x.getUTCHours())}${p(x.getUTCMinutes())}${p(x.getUTCSeconds())}000`; };
const INV = { 1: 30, 2: 15, 3: 5, 4: 2, 5: 10, 6: 25, 7: 12 };
const NUMS = Object.fromEntries(Object.keys(INV).map((k) => [k, `${SL}-${stamp(INV[k])}${k}-C`]));   // fixed once
const invNumber = (k) => NUMS[k];
const MAN = '01-09-2026DAN';
const TRK = { P0: 'F10TRKP0', P1: 'F10TRKP1', P2: 'F10TRKP2', P3: 'F10TRKP3', P4: 'F10TRKP4', P5: 'F10TRKP5', P6: 'F10TRKP6', P7: 'F10TRKP7', P8: 'F10TRKP8' };

async function seed() {
  await put(`customers/${SL}`, { slCode: SL, fullName: 'CLIENTE DIA UNO', customerName: 'CLIENTE DIA UNO', ruta: 'Heredia', consolidationEnabled: true });
  for (const [k, t] of Object.entries(TRK)) {
    await fetch(`${DB1}/packages/${t}`, { method: 'DELETE', headers: H });
    await put(`packages/${t}`, { tracking: t, trackingNumber: t, slCode: SL, customerId: SL, customerName: 'CLIENTE DIA UNO', status: 'consolidated', consolidacion: true, isConsolidated: true,
      manifestNumber: MAN, manifestId: MAN, weight: 1, price: 5, description: `Paquete ${k}`, createdAt: daysAgo(35).toISOString(), statusHistory: [],
      ...(k === 'P0' ? { firstConsolidatedAt: daysAgo(20).toISOString() } : {}) });
  }
  for (const k of [1, 2, 3, 4, 5, 6, 7]) await fetch(`${DB1}/invoices/F10-INV${k}`, { method: 'DELETE', headers: H });
  // SP2 "En Consolidación" keeps `since` write-once: the same trackings with new dates on every run need a clean list.
  for (const t of Object.values(TRK)) await fetch(`http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents/consolidation_items/${SL}_${t}`, { method: 'DELETE', headers: H });
}
/** Links packages to invoice #k exactly as invoicing does (invoice doc + package fields). */
async function invoice(k, keys, manifest = MAN) {
  const num = invNumber(k); const trk = keys.map((x) => TRK[x]);
  await put(`invoices/F10-INV${k}`, { invoiceNumber: num, invoiceDate: daysAgo(INV[k]).toISOString(), createdAt: daysAgo(INV[k]).toISOString(), status: 'sent', isConsolidation: true,
    slCode: SL, clientSlCode: SL, customerId: SL, clientName: 'CLIENTE DIA UNO', manifestNumber: manifest, manifestNumbers: [manifest], trackingNumbers: trk, trackingNumber: trk[0],
    packageCount: trk.length, totalAmount: 5 * trk.length, currency: 'USD', items: trk.map((t) => ({ trackingNumber: t, tracking: t, totalPrice: 5 })) });
  for (const t of trk) await patch(`packages/${t}`, { invoiceId: `F10-INV${k}`, invoiceNumber: num, invoiceStatus: 'sent', manifestNumber: manifest, manifestId: manifest, status: 'consolidated' });
}

(async () => {
  if (process.env.F10_TRACE) console.log('  start', new Date().toISOString());
  await seed();
  if (process.env.F10_TRACE) console.log('  seeded', new Date().toISOString(), await (async () => { const r = await (await fetch(`${DB1}/packages/${TRK.P1}`, { headers: H })).json(); return r.updateTime; })());
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 120)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#display-name-input').fill('Admin QA').catch(() => {}); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  // Real annul flows of the app.
  const run = (fn, ...args) => page.evaluate(async ([fn, args]) => { const m = await import('/client/lib/services/invoice-service.ts'); const r = await m[fn](...args); return r === undefined ? null : JSON.parse(JSON.stringify(r)); }, [fn, args]);
  const state = async (t) => { const r = await (await fetch(`${DB1}/packages/${t}`, { headers: H })).json(); const f = r.fields || {}; const v = (k) => f[k] ? Object.values(f[k])[0] : null; return `${t}: man=${v('manifestNumber')} inv=${v('invoiceId')} anul=${v('annulledInvoiceNumber')} upd=${r.updateTime}`; };
  await invoice(1, ['P1', 'P2', 'P3']);
  if (process.env.F10_TRACE) console.log('  after link #1 →', await state(TRK.P1));
  const r1 = await run('moveInvoiceToTransitoria', 'F10-INV1', { annulledBy: 'e2e' });
  if (process.env.F10_TRACE) console.log('  annul #1 →', JSON.stringify(r1).slice(0, 200), '|', await state(TRK.P1));
  await invoice(2, ['P2', 'P3', 'P5']);           await run('moveInvoiceToTransitoria', 'F10-INV2', { annulledBy: 'e2e' });
  await invoice(3, ['P3']);                       await run('moveInvoiceToTransitoria', 'F10-INV3', { annulledBy: 'e2e' });
  await invoice(5, ['P6'], '05-09-2026DAN'); await run('annulInvoicesByTrackingsAndManifest', [TRK.P6], '05-09-2026DAN', { annulledBy: 'e2e', reason: 'e2e F10' });
  await invoice(4, ['P4']);                       // stays active
  // SL26254 case: P7 first invoice #6 annulled, carry-on to another manifest, re-invoiced with P8 in #7, annulled.
  await invoice(6, ['P7']);                       await run('moveInvoiceToTransitoria', 'F10-INV6', { annulledBy: 'e2e' });
  await invoice(7, ['P7', 'P8'], '24-09-2026DAN'); await run('moveInvoiceToTransitoria', 'F10-INV7', { annulledBy: 'e2e' });
  await run('moveUnlinkedPackageToTransitoria', TRK.P0);   // S0: to transitoria without ever being invoiced
  // P5: moved by the admin to another block (a move changes the manifest, never the invoice fields).
  await patch(`packages/${TRK.P5}`, { manifestNumber: '20-09-2026DAN', manifestId: '20-09-2026DAN', updatedManifest: '20-09-2026DAN', manifestUpdatedAt: daysAgo(1).toISOString() });
  if (process.env.F10_TRACE) { console.log('  after all flows', new Date().toISOString(), '→', await state(TRK.P1)); for (let i = 0; i < 6; i++) { await pause(2000); console.log('  +', (i + 1) * 2, 's →', await state(TRK.P1)); } }
  await pause(1500);

  const readCard = async () => {
    await page.goto(`${APP}/consolidation/manifests`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
    const search = page.locator('input[placeholder*="uscar" i]').first();
    if (await search.count()) { await search.fill(SL); await page.waitForTimeout(2500); }
    const card = page.locator('div', { hasText: 'CLIENTE DIA UNO' }).filter({ has: page.locator('text=' + SL) }).last();
    const toggle = page.getByText('CLIENTE DIA UNO').first();
    // Open the card once if no package line is visible yet (works with the old code too: it has no badge test id).
    await page.waitForTimeout(3000);   // the search can force-collapse the cards for a moment
    for (let i = 0; i < 4 && !(await page.getByText(TRK.P2, { exact: true }).first().isVisible().catch(() => false)); i++) {
      const expand = page.locator('[title="Expandir cliente"]:visible').first();
      if (await expand.count()) await expand.click().catch(() => {}); else await toggle.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    const lines = await page.evaluate((trks) => Object.fromEntries(trks.map((t) => {
      const el = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent?.includes(t));
      let row = el; for (let i = 0; i < 8 && row && !/Día 1:/.test(row.textContent || ''); i++) row = row.parentElement;
      const m = (row?.textContent || '').match(/Día 1:\s*([0-9/]+)\s*(·\s*[^D]*?)?Días:\s*(\d+)/);
      return [t, m ? { date: m[1], source: (m[2] || '').replace('·', '').trim(), days: Number(m[3]) } : null];
    })), Object.values(TRK));
    const since = await page.locator('[aria-label^="Consolida desde"]').first().getAttribute('aria-label').catch(() => null);
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: path.join(OUT, `f10-card-${Date.now()}.png`), fullPage: true });
    return { lines, since, text };
  };

  const now = await readCard();
  const L = now.lines;
  const expect = (key, invK, daysBack, source) => {
    const l = L[TRK[key]];
    const okDate = l?.date === crDate(daysBack);
    const okSource = source ? (l?.source || '').includes(source) : true;
    check(`${key}: Día 1 = ${crDate(daysBack)}${source ? ` · ${source}` : ''}`, okDate && okSource && l?.days === daysBack, JSON.stringify(l));
  };
  expect('P0', null, 20, 'sin factura');
  expect('P1', 1, 30, `anulada ${invNumber(1)}`);
  expect('P2', 1, 30, `anulada ${invNumber(1)}`);
  expect('P3', 1, 30, `anulada ${invNumber(1)}`);
  expect('P7', 6, 25, `anulada ${invNumber(6)}`);
  expect('P8', 7, 12, `anulada ${invNumber(7)}`);
  check('P5 (sacado a otro bloque por el admin) sale de la vista de transitoria, como antes', !L[TRK.P5], JSON.stringify(L[TRK.P5]));
  expect('P6', 5, 10, `anulada ${invNumber(5)}`);
  check('P4 (factura #4 activa) no aparece como línea de consolidación sin facturar', !L[TRK.P4], JSON.stringify(L[TRK.P4]));
  const shortEs = (d) => daysAgo(d).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', timeZone: 'America/Costa_Rica' }).replace('.', '');
  check('Contador del cliente: "Consolida desde" = la factura más vieja (#1)', (now.since || '').includes(shortEs(30)), `${now.since} (esperado ${shortEs(30)})`);

  // No functional regression: the same card with the code before F10.
  const files = ['client/pages/consolidation/components/ConsolidationCustomerCard.tsx', 'client/pages/consolidation/components/types.ts'];
  const base = process.env.F10_BASE || 'aeae143c~1';
  const saved = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  let before;
  try {
    for (const f of files) fs.writeFileSync(path.join(ROOT, f), execSync(`git -C ${ROOT} show ${base}:${f}`, { encoding: 'utf8' }));
    await pause(3000);
    before = await readCard();
  } finally {
    files.forEach((f, i) => fs.writeFileSync(path.join(ROOT, f), saved[i]));
  }
  // Lines that change BY DESIGN: the Día 1 badge and its source, the day counts, the customer counter and
  // what follows from it (grace status, storage charge), and the page's clock ("Corte").
  const BY_DESIGN = /^(·\s*(anulada|factura|sin factura)|Corte:|\d{1,2} \w{3,5}\.? \d{2}$|Gracia|Bodegaje|Vence|Más de 90)/i;
  const norm = (t) => t.split('\n')
    .map((l) => l.replace(/Día 1:\s*[0-9/]+(\s*·[^\n]*)?/g, 'Día 1:<f>').replace(/Días:\s*\d+/g, 'Días:<n>').replace(/Consolida desde[^\n]*/g, 'Consolida desde<f>')
      .replace(/\b\d+\s*d(ías)?\b/gi, '<n>d').replace(/Bodegaje[^\n]*/g, 'Bodegaje<x>').replace(/Más de 90 días/g, '<n>d'))
    .map((l) => l.trim()).filter((l) => l && !BY_DESIGN.test(l) && l !== '<n>d');   // '<n>d' = grace days left of the customer counter
  const a = norm(before.text), c = norm(now.text);
  fs.writeFileSync(path.join(OUT, 'f10-before.txt'), a.join('\n')); fs.writeFileSync(path.join(OUT, 'f10-after.txt'), c.join('\n'));
  // The ORDER of the package rows changes by design (2026-09-28: Día 1 ascending); the content must be identical.
  const as = [...a].sort(), cs = [...c].sort();
  const diff = cs.filter((l, i) => l !== as[i]).slice(0, 8);
  check('Sin regresión funcional: la página tiene lo mismo que el código anterior salvo el "Día 1", el contador y el orden', a.length === c.length && diff.length === 0,
    diff.length ? `distinto: ${JSON.stringify(diff).slice(0, 300)}` : `${c.length} líneas iguales`);
  const order = c.filter((l) => /^F10TRKP\d$/.test(l));
  const want = ['P1', 'P2', 'P3', 'P7', 'P0', 'P8', 'P6'].map((k) => TRK[k]);
  check('Orden dentro del bloque: Día 1 ascendente (el más viejo primero; empate por tracking)', JSON.stringify(order) === JSON.stringify(want), JSON.stringify(order));
  check('El código anterior sí daba otro contador (la más reciente)', before.since !== now.since, `antes=${before.since} · ahora=${now.since}`);

  await b.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
