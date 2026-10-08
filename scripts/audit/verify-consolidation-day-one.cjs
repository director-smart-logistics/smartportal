/**
 * READ-ONLY check of "Día 1" (FIRST invoice) for every package SP1's Consolidation page lists (2026-09-28).
 * Recomputes it with the shared rule (functions/lib/consolidation/consolidation-start.js: stored firstInvoice* first,
 * else the customer's SP1 invoices listing the tracking + the package fields/history, earliest by full timestamp) and,
 * when given --expected <file.json> (the audit export: Tracking / "Día 1 correcto (primera factura)"), compares the DAY
 * (Costa Rica). Also prints the customer counter (oldest package) per customer. Nothing is written.
 *
 *   node scripts/audit/verify-consolidation-day-one.cjs [--expected <json>]
 * Emulator: FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-sp-qa. Production: gcloud ADC (read only).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const R = require(path.join(fnDir, 'lib/consolidation/consolidation-start.js'));

const args = process.argv.slice(2);
const EXP = args.includes('--expected') ? args[args.indexOf('--expected') + 1] : null;
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = emulator ? (process.env.GCLOUD_PROJECT || 'demo-sp-qa') : 'smart-portal-admin';
const db = getFirestore(initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId }, 'sp1-verify-day-one'), 'portal');
const crDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }) : '';

async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return docs;
}

(async () => {
  const pkgs = (await readAll(db.collection('packages'))).map((d) => ({ id: d.id, ...d.data() })).filter(R.isInConsolidation);
  const bySl = new Map();
  for (const sl of new Set(pkgs.map((p) => R.normSl(p.slCode || p.clientSlCode)).filter(Boolean))) {
    const [a, b] = await Promise.all([db.collection('invoices').where('slCode', '==', sl).get(), db.collection('invoices').where('clientSlCode', '==', sl).get()]);
    const m = new Map(); for (const d of [...a.docs, ...b.docs]) m.set(d.id, { id: d.id, ...d.data() });
    bySl.set(sl, [...m.values()]);
  }
  const rows = pkgs.map((p) => {
    const k = R.membershipKey(p);
    const hist = k ? R.firstInvoiceFromInvoices(k.tracking, bySl.get(k.slCode) || []) : null;
    const s = R.consolidationStart({ ...p, invoiceHistoryFirst: hist || undefined });
    return { sl: k?.slCode || '', tracking: k?.tracking || p.trackingNumber || p.id, day: crDay(s.date), date: s.date, invoice: s.invoiceNumber, scenario: s.scenario, stored: !!p.firstInvoiceDate };
  });
  console.log(`${emulator ? 'EMULADOR' : 'PRODUCCIÓN (solo lectura)'} · en consolidación: ${rows.length} paquetes / ${new Set(rows.map((r) => r.sl)).size} clientes`);
  if (EXP) {
    const exp = JSON.parse(fs.readFileSync(EXP, 'utf8'));
    const byTrk = new Map(rows.map((r) => [R.normTracking(r.tracking), r]));
    let match = 0; const diff = [];
    for (const e of exp) {
      const r = byTrk.get(R.normTracking(e.Tracking));
      const want = e['Día 1 correcto (primera factura)'];
      if (r && r.day === want) match++; else diff.push({ tracking: e.Tracking, esperado: want, calculado: r?.day || '(no está en consolidación)', factura: r?.invoice });
    }
    console.log(`Coinciden por DÍA: ${match}/${exp.length}`);
    for (const d of diff) console.log('  ≠', JSON.stringify(d));
    const extra = rows.filter((r) => !exp.some((e) => R.normTracking(e.Tracking) === R.normTracking(r.tracking)));
    if (extra.length) console.log(`  (en consolidación ahora y no en el archivo: ${extra.length})`);
  }
  // customer counter = oldest package
  const bySlRows = new Map(); for (const r of rows) (bySlRows.get(r.sl) || bySlRows.set(r.sl, []).get(r.sl)).push(r);
  const counters = [...bySlRows.entries()].map(([sl, list]) => { const o = list.filter((x) => x.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.tracking.localeCompare(b.tracking))[0]; return `${sl}: ${o ? `${o.day} (${o.tracking})` : 'sin fecha'}`; });
  console.log('Contador por cliente (el paquete más viejo):\n  ' + counters.join('\n  '));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
