/**
 * Backfill of the packages' FIRST invoice (2026-09-28): firstInvoiceNumber / firstInvoiceDate / firstInvoiceSetAt /
 * firstInvoiceSource on SP1 packages that were ever invoiced and do not carry them yet (new links get them from the
 * trigger functions/src/packages/first-invoice.ts).
 *
 * Rule (same as the trigger, the SP1 Consolidation page and SP2 "En Consolidación"): the EARLIEST of the customer's SP1
 * invoices listing the tracking (any status, incl. annulled; soft-deleted skipped) and the invoices the package itself
 * remembers (fields + statusHistory) — functions/lib/consolidation/consolidation-start.js.
 *
 *   dry run (default)   : writes audit-output/backfill-first-invoice-<ts>.json + .xlsx, changes nothing
 *   --apply             : writes ONLY empty firstInvoice* fields (re-checked in a transaction per package), one log doc
 *                         per package in first_invoice_backfill_logs, and a backup file (ids) for --rollback
 *   --rollback <file>   : removes the four fields the backfill wrote, only where they still hold the backfilled values
 *   --only-consolidation: restrict to the packages SP1's Consolidation page lists
 *
 * Emulator: set FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-sp-qa. Production: gcloud ADC + the user's approval.
 * Build functions first (cd functions && npx tsc).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath, FieldValue } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const R = require(path.join(fnDir, 'lib/consolidation/consolidation-start.js'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY_CONS = args.includes('--only-consolidation');
const RB = args.includes('--rollback') ? args[args.indexOf('--rollback') + 1] : null;
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = emulator ? (process.env.GCLOUD_PROJECT || 'demo-sp-qa') : 'smart-portal-admin';
const db = getFirestore(initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId }, 'sp1-first-invoice'), 'portal');
const OUT = path.join(__dirname, '../../audit-output');
const SOURCE = 'backfill-first-invoice';

async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return docs;
}
const hasInvoiceSignal = (p) => { const num = String(p.invoiceNumber || '').trim(); return !!(p.invoiceId || (num && num.toLowerCase() !== R.TRANSITORIA) || p.annulledInvoiceNumber || p.annulledInvoiceId || p.invoicedAt); };

async function rollback(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let undone = 0, skipped = 0;
  for (const x of data.written || []) {
    const ref = db.collection('packages').doc(x.id);
    const ok = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get('firstInvoiceSource') !== x.firstInvoiceSource || cur.get('firstInvoiceDate') !== x.firstInvoiceDate || cur.get('firstInvoiceSetBy') !== SOURCE) return false;
      tx.update(ref, { firstInvoiceNumber: FieldValue.delete(), firstInvoiceDate: FieldValue.delete(), firstInvoiceSetAt: FieldValue.delete(), firstInvoiceSource: FieldValue.delete(), firstInvoiceSetBy: FieldValue.delete() });
      return true;
    });
    if (ok) { undone++; await db.collection('first_invoice_backfill_logs').add({ at: new Date().toISOString(), pkgId: x.id, event: 'rollback', backupFile: path.basename(file) }); } else skipped++;
  }
  console.log(`Rollback: ${undone} deshechos · ${skipped} omitidos (cambiaron después del backfill)`);
}

(async () => {
  if (RB) return rollback(RB);
  const [pkgDocs, invDocs] = await Promise.all([
    readAll(db.collection('packages')),
    readAll(db.collection('invoices').select('invoiceNumber', 'invoiceDate', 'createdAt', 'date', 'invoiceItems', 'items', 'isDeleted', 'status', 'slCode', 'clientSlCode')),
  ]);
  // customer → invoices
  const bySl = new Map();
  for (const d of invDocs) { const x = { id: d.id, ...d.data() }; for (const sl of new Set([R.normSl(x.slCode), R.normSl(x.clientSlCode)].filter(Boolean))) (bySl.get(sl) || bySl.set(sl, []).get(sl)).push(x); }
  const plan = [];
  for (const d of pkgDocs) {
    const p = d.data();
    if (p.firstInvoiceDate || !hasInvoiceSignal(p)) continue;
    if (ONLY_CONS && !R.isInConsolidation(p)) continue;
    const key = R.membershipKey(p);
    const hist = key ? R.firstInvoiceFromInvoices(key.tracking, bySl.get(key.slCode) || []) : null;
    const s = R.consolidationStart({ ...p, invoiceHistoryFirst: hist || undefined });
    if (s.scenario !== 'primera-factura' || !s.date) continue;
    plan.push({ id: d.id, slCode: key?.slCode || '', tracking: key?.tracking || '', firstInvoiceNumber: s.invoiceNumber, firstInvoiceDate: s.date,
      firstInvoiceSource: hist && hist.date === s.date ? 'invoices' : 'package', lastAnnulled: p.annulledInvoiceNumber || '', inConsolidation: R.isInConsolidation(p) });
  }
  console.log(`${emulator ? 'EMULADOR' : 'PRODUCCIÓN'} · paquetes ${pkgDocs.length} · facturas ${invDocs.length} · a completar: ${plan.length} (${plan.filter((x) => x.inConsolidation).length} en consolidación)`);
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = path.join(OUT, `backfill-first-invoice-${emulator ? 'emulador-' : ''}${APPLY ? 'aplicado' : 'simulacion'}-${stamp}`);
  try {
    const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plan.map((x) => ({ SL: x.slCode, Tracking: x.tracking, 'Primera factura': x.firstInvoiceNumber, 'Fecha primera factura': x.firstInvoiceDate, Fuente: x.firstInvoiceSource, 'Última anulada (en el paquete)': x.lastAnnulled, 'En consolidación': x.inConsolidation ? 'sí' : 'no', 'ID SP1': x.id }))), 'Primera factura');
    XLSX.writeFile(wb, `${base}.xlsx`);
  } catch (e) { console.warn('Excel no generado:', e.message); }
  if (!APPLY) { fs.writeFileSync(`${base}.json`, JSON.stringify({ at: new Date().toISOString(), apply: false, emulator, plan }, null, 2)); console.log(`Simulación: ${path.relative(process.cwd(), base)}.json/.xlsx`); return; }

  const now = new Date().toISOString();
  const written = [];
  for (const x of plan) {
    const ref = db.collection('packages').doc(x.id);
    const ok = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get('firstInvoiceDate')) return false;   // only empty fields
      tx.update(ref, { firstInvoiceNumber: x.firstInvoiceNumber ?? null, firstInvoiceDate: x.firstInvoiceDate, firstInvoiceSetAt: now, firstInvoiceSource: x.firstInvoiceSource, firstInvoiceSetBy: SOURCE });
      return true;
    });
    if (!ok) continue;
    written.push(x);
    await db.collection('first_invoice_backfill_logs').add({ at: now, pkgId: x.id, event: 'set', slCode: x.slCode, tracking: x.tracking, firstInvoiceNumber: x.firstInvoiceNumber, firstInvoiceDate: x.firstInvoiceDate, source: x.firstInvoiceSource, by: SOURCE });
  }
  fs.writeFileSync(`${base}.json`, JSON.stringify({ at: now, apply: true, emulator, written }, null, 2));
  console.log(`Aplicado: ${written.length} paquetes · respaldo para --rollback: ${path.relative(process.cwd(), base)}.json`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
