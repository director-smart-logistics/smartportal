/**
 * One-off backfill of SP2 "En Consolidación" (consolidation_items) from SP1 (2026-09-28).
 *
 * Reads EVERY SP1 package with pagination, keeps the ones SP1's Consolidation page lists (same predicate as the
 * trigger: functions/src/consolidation/consolidation-start.ts → isInConsolidation) and computes "Día 1" (first invoice)
 * with the same rule (stored firstInvoice*, else the customer's SP1 invoices + package fields/history). SP1 is only
 * read. Run scripts/audit/backfill-first-invoice.cjs FIRST so every package carries its firstInvoice*; afterwards
 * scripts/audit/reconcile-consolidation-items.cjs must report 0 differences.
 *
 *   dry run (default): prints the count and writes audit-output/backfill-consolidation-<ts>.json + .xlsx
 *   --apply           : POSTs the items as `add` to SP2's slSyncConsolidationFromSp1 in batches of 100
 *                       (idempotent; an existing item keeps its `since`). Needs SP2_CONSOLIDATION_SYNC_URL and
 *                       SP2_SYNC_SECRET in the environment — nothing is sent without them.
 *
 * Emulator: set FIRESTORE_EMULATOR_HOST (and GCLOUD_PROJECT=demo-sp-qa) — the script then reads the emulator.
 * Production: needs `gcloud auth application-default login` and the user's go (never run by the assistant).
 * Build functions first (cd functions && npx tsc): the rule is loaded from functions/lib.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { isInConsolidation, membershipKey, consolidationStart, firstInvoiceFromInvoices } = require(path.join(fnDir, 'lib/consolidation/consolidation-start.js'));

const APPLY = process.argv.includes('--apply');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = emulator ? (process.env.GCLOUD_PROJECT || 'demo-sp-qa') : 'smart-portal-admin';
const app = initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId }, 'sp1-backfill');
const sp1 = getFirestore(app, 'portal');
const OUT = path.join(__dirname, '../../audit-output');

async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return docs;
}

(async () => {
  const docs = await readAll(sp1.collection('packages'));
  // "Día 1": the customer's SP1 invoices listing the tracking (any status) + the package fields/history, earliest wins
  // (a stored firstInvoice* on the package is used as is).
  const members = docs.filter((d) => isInConsolidation(d.data()));
  const bySl = new Map();
  for (const sl of new Set(members.map((d) => String(d.get('slCode') || d.get('clientSlCode') || '').trim().toUpperCase()).filter(Boolean))) {
    const [a, b] = await Promise.all([sp1.collection('invoices').where('slCode', '==', sl).get(), sp1.collection('invoices').where('clientSlCode', '==', sl).get()]);
    const m = new Map(); for (const x of [...a.docs, ...b.docs]) m.set(x.id, { id: x.id, ...x.data() });
    bySl.set(sl, [...m.values()]);
  }
  const items = [];
  const seen = new Set();
  for (const d of docs) {
    const p = d.data();
    if (!isInConsolidation(p)) continue;
    const k = membershipKey(p);
    if (!k) { items.push({ skip: 'sin SL o tracking', sp1PackageId: d.id }); continue; }
    const key = `${k.slCode}_${k.tracking}`;
    if (seen.has(key)) { items.push({ skip: 'duplicado (mismo cliente y tracking)', sp1PackageId: d.id, ...k }); continue; }
    seen.add(key);
    const hist = firstInvoiceFromInvoices(k.tracking, bySl.get(k.slCode) || []);
    const s = consolidationStart({ ...p, invoiceHistoryFirst: hist || undefined });
    // eventAt = the package's own last write: a later real event (trigger) always wins over the backfill.
    items.push({ op: 'add', ...k, sp1PackageId: d.id, since: s.date, sourceInvoiceNumber: s.invoiceNumber, reason: 'carga inicial (backfill)', by: 'backfill-consolidation-items',
      eventId: `backfill-${d.id}`, eventAt: d.updateTime ? d.updateTime.toDate().toISOString() : new Date().toISOString(), scenario: s.scenario });
  }
  const toSend = items.filter((x) => x.op === 'add');
  const skipped = items.filter((x) => x.skip);
  console.log(`${emulator ? 'EMULADOR' : 'PRODUCCIÓN'} · paquetes SP1 leídos: ${docs.length} · en consolidación: ${toSend.length} · omitidos: ${skipped.length}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const base = path.join(OUT, `backfill-consolidation-${emulator ? 'emulador-' : ''}${APPLY ? 'aplicado' : 'simulacion'}-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ at: new Date().toISOString(), apply: APPLY, emulator, items }, null, 2));
  try {
    const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSend.map((x) => ({ SL: x.slCode, Tracking: x.tracking, 'En consolidación desde': x.since || '', 'Primera factura': x.sourceInvoiceNumber || '', Regla: x.scenario, 'ID SP1': x.sp1PackageId }))), 'En consolidación');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(skipped), 'Omitidos');
    XLSX.writeFile(wb, `${base}.xlsx`);
  } catch (e) { console.warn('Excel no generado:', e.message); }
  console.log(`Archivo: ${path.relative(process.cwd(), base)}.json/.xlsx`);
  if (!APPLY) { console.log('Simulación: no se envió nada a SP2. Usa --apply para cargar.'); return; }

  const url = process.env.SP2_CONSOLIDATION_SYNC_URL, secret = process.env.SP2_SYNC_SECRET;
  if (!url || !secret) { console.error('Faltan SP2_CONSOLIDATION_SYNC_URL / SP2_SYNC_SECRET: no se envió nada.'); process.exit(2); }
  const tally = {};
  for (let i = 0; i < toSend.length; i += 100) {
    const batch = toSend.slice(i, i + 100).map(({ scenario, ...x }) => x);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret }, body: JSON.stringify({ items: batch }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { console.error(`Lote ${i / 100 + 1}: HTTP ${res.status} ${json.error || ''}`); }
    for (const r of json.results || []) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
  }
  console.log('Aplicado en SP2:', JSON.stringify(tally));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
