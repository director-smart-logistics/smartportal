/**
 * Verify the 2026-09-28 04:48 SP2 correction (fix-stale-packages.cjs) against a COMPLETE, PAGINATED read of SP1
 * (that run's single .get() returned only part of SP1's packages). Every SP2 shipment it changed is re-evaluated:
 *   - its SP1 package now found and it is an unusual case (consolidation, held, pickup, unpaid invoice, no invoice
 *     still in warehouse/customs) or SP1 says something else → the shipment is RESTORED from the backup;
 *   - otherwise the correction stands.
 * SP1 is only read. Dry run by default; --restore writes the restorations (SP2 only) with a log.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath, FieldValue } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));
const RESTORE = process.argv.includes('--restore');
const OUT = path.join(__dirname, '../../audit-output');
const MAP = { pre_alerted: 'pre-alerted', received: 'received', in_transit: 'transit', customs: 'customs', retained: 'held', consolidated: 'consolidated', consolidacion: 'consolidated', processed: 'processed', on_route: 'route', pickup: 'pickup', delivered: 'delivered', returned: 'returned', transit: 'transit', held: 'held', route: 'route' };
const RK = { 'pre-alerted': 0, received: 1, transit: 2, customs: 3, held: 3, consolidated: 4, processed: 5, route: 6, pickup: 6, delivered: 7, returned: 7 };
const norm = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ms = (v) => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v._seconds === 'number' ? v._seconds * 1000 : (Date.parse(String(v)) || 0);
const days = (m) => m ? Math.floor((Date.now() - m) / 864e5) : null;

async function readAll(db, coll, fields) {
  const out = []; let last = null;
  for (;;) {
    let q = db.collection(coll).orderBy(FieldPath.documentId()).limit(2000);
    if (fields) q = q.select(...fields);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    out.push(...s.docs);
    if (s.size < 2000) break;
    last = s.docs[s.docs.length - 1];
  }
  return out;
}

(async () => {
  const backupFile = fs.readdirSync(OUT).filter((f) => /^stale-fix-backup-2026-09-28T04-48/.test(f)).pop();
  const backup = JSON.parse(fs.readFileSync(path.join(OUT, backupFile), 'utf8'));
  const [p1, inv1, cons] = await Promise.all([
    readAll(sp1, 'packages', ['trackingNumber', 'tracking', 'slCode', 'clientSlCode', 'status', 'statusLabel', 'invoiceNumber', 'invoiceId']),
    readAll(sp1, 'invoices', ['invoiceNumber', 'status', 'paidAt', 'updatedAt']),
    readAll(sp1, 'manifest_consolidation', ['tracking', 'status']),
  ]);
  const cnt = await sp1.collection('packages').count().get();
  console.log(`SP1 leído por páginas: paquetes ${p1.length} (count() = ${cnt.data().count}), facturas ${inv1.length}, consolidación ${cons.length} · envíos a verificar: ${backup.sp2.length}`);
  const exact = new Map(); const t12 = new Map(); const t10 = new Map();
  const add = (m, k, v) => { const a = m.get(k) || []; a.push(v); m.set(k, a); };
  for (const d of p1) { const x = { id: d.id, ...d.data() }; const k = norm(x.trackingNumber || x.tracking || d.id); if (!k) continue; add(exact, k, x); if (k.length >= 12) add(t12, k.slice(-12), x); if (k.length >= 10) add(t10, k.slice(-10), x); }
  const best = (a) => a ? [...a].sort((x, y) => (RK[MAP[y.status]] ?? -1) - (RK[MAP[x.status]] ?? -1))[0] : null;
  const invByNum = new Map(); const invById = new Map();
  for (const d of inv1) { const x = { id: d.id, ...d.data() }; invById.set(d.id, x); if (x.invoiceNumber) invByNum.set(String(x.invoiceNumber).toUpperCase(), x); }
  const inCons = new Set(cons.filter((d) => !/deliver|entreg/i.test(String(d.get('status') || ''))).map((d) => norm(d.get('tracking') || d.id)));

  const keep = []; const restore = [];
  for (const b of backup.sp2) {
    const x = b.data; const k = norm(x.sp1Tracking || x.tracking || b.id);
    let p = best(exact.get(k));
    if (!p && k.length >= 12) { const c = t12.get(k.slice(-12)); if (c && new Set(c.map((z) => norm(z.slCode || z.clientSlCode))).size === 1) p = best(c); }
    if (!p && k.length >= 10) { const c = t10.get(k.slice(-10)); if (c && c.length === 1) p = c[0]; }
    const s1 = p ? MAP[p.status] : null;
    const inv = (p && ((p.invoiceNumber && invByNum.get(String(p.invoiceNumber).toUpperCase())) || (p.invoiceId && invById.get(p.invoiceId)))) || (x.invoiceNumber && invByNum.get(String(x.invoiceNumber).toUpperCase())) || null;
    const paidDays = inv && /^paid$/i.test(inv.status || '') ? days(ms(inv.paidAt) || ms(inv.updatedAt)) : null;
    const age = days(ms(x.updatedAt || x.createdAt));
    const rare = inCons.has(k) || s1 === 'consolidated' || x.status === 'consolidated' ? 'Consolidación'
      : s1 === 'held' || x.status === 'held' ? 'Retenido'
      : s1 === 'pickup' || x.status === 'pickup' ? 'Retira en oficina'
      : inv && /^(sent|overdue|draft|pending)$/i.test(inv.status || '') && s1 !== 'delivered' ? `Factura ${inv.status}`
      : p && ['received', 'transit', 'customs'].includes(s1) && !inv ? 'Sin factura (bodega/aduana)' : null;
    const ok = s1 === 'delivered' || (!rare && ((paidDays != null && paidDays > 5) || (!p && !inv && age != null && age > 30)));
    const row = { id: b.id, tracking: x.tracking || b.id, slCode: x.slCode || '', before: x.status, sp1: p ? `${p.status}${p.statusLabel ? ' / ' + p.statusLabel : ''}` : 'Sin paquete en SP1', factura: inv?.invoiceNumber || '', facturaEstado: inv?.status || '', pagadaHace: paidDays ?? '', motivo: rare || (ok ? '' : 'No cumple la regla con SP1 completo') };
    (ok ? keep : restore).push({ row, data: x });
  }
  console.log(`Correcciones que se sostienen: ${keep.length} · a restaurar: ${restore.length}`);
  const t = restore.reduce((m, r) => { m[r.row.motivo] = (m[r.row.motivo] || 0) + 1; return m; }, {});
  Object.entries(t).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(restore.map((r) => r.row)), 'Restaurados');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(keep.map((r) => r.row)), 'Se mantienen');
  const xf = path.join(OUT, `verificacion-correccion-2026-09-28-${RESTORE ? 'aplicada' : 'simulacion'}.xlsx`);
  XLSX.writeFile(wb, xf);
  console.log(`Excel: ${path.relative(process.cwd(), xf)}`);
  if (!RESTORE || !restore.length) return;
  const now = new Date().toISOString();
  let batch = sp2.batch(); let ops = 0;
  for (const r of restore) {
    // only the status fields go back, and only if nothing else moved the shipment since the correction
    const cur = (await sp2.collection('shipments').doc(r.row.id).get()).data() || {};
    if (cur.status !== 'delivered' || cur.statusCorrectionSource !== 'stale_packages_2026-09-28') { console.log(`  omitido (cambió desde la corrección): ${r.row.tracking} → ${cur.status}`); continue; }
    batch.update(sp2.collection('shipments').doc(r.row.id), { status: r.data.status, statusLabel: r.data.statusLabel ?? FieldValue.delete(), deliveredAt: r.data.deliveredAt ?? FieldValue.delete(), updatedAt: now,
      statusCorrectionSource: 'stale_packages_2026-09-28_restored', statusCorrectionReason: `Restaurado: ${r.row.motivo}`,
      statusHistory: FieldValue.arrayUnion({ status: r.data.status, notes: `Restaurado tras verificación con SP1 completo: ${r.row.motivo}`, timestamp: now, location: '', source: 'stale_packages_audit' }) });
    batch.set(sp2.collection('status_corrections').doc(), { shipmentId: r.row.id, tracking: r.row.tracking, event: 'restored_after_verification', to: r.data.status, reason: r.row.motivo, at: now, backupFile });
    if ((ops += 2) >= 400) { await batch.commit(); batch = sp2.batch(); ops = 0; }
  }
  if (ops) await batch.commit();
  console.log(`Restaurados en SP2: ${restore.length}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
