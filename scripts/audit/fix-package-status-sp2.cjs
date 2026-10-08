/**
 * Correct SP2 shipment statuses from the 2026-09-28 audit (audit-package-status-deep.cjs), decided by the user:
 *   A. SP2 differs from SP1, same tracking (exact match)          → SP2 takes SP1's status
 *   B. SP2 differs from SP1, matched by the last 12 characters     → NOT applied (listed for review)
 *   C. SP2 open (Facturado / En ruta / Aduanas / Retenido / Retira) with no SP1 package nor invoice,
 *      last update > 30 days ago or no date                         → Entregado (the admin may delete them later)
 *   D. same as C but moved in the last 30 days                     → NOT applied (listed: may be real, not yet in SP1)
 *
 * Safety: re-reads every shipment and skips it if its status changed since the audit; full backup of each
 * document before writing (rollback: --rollback <file>); batches of 400; one log doc per change in SP2
 * `status_corrections`; statusHistory entry. No e-mail is sent (SP2 shipment triggers only close the pre-alert and
 * refresh the search index). Excel report of every group.
 *
 * Usage:  node scripts/audit/fix-package-status-sp2.cjs            (dry run: counts + Excel, writes nothing)
 *         node scripts/audit/fix-package-status-sp2.cjs --apply
 *         node scripts/audit/fix-package-status-sp2.cjs --rollback audit-output/status-fix-backup-<ts>.json
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldValue } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));

const OUT = path.join(__dirname, '../../audit-output');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback') ? args[args.indexOf('--rollback') + 1] : null;
const LABEL = { 'pre-alerted': 'Pre-Alertado', received: 'Recibido en Miami', transit: 'En Tránsito a Costa Rica', customs: 'Procesando en Costa Rica', held: 'Retenido en Aduana', consolidated: 'Consolidado', processed: 'Facturado', route: 'En Ruta de Entrega', pickup: 'Retira en SmartLogistics', delivered: 'Entregado', returned: 'Devuelto' };
const ES = { customs: 'En aduanas', held: 'Retenido', consolidated: 'Consolidado', processed: 'Facturado', route: 'En ruta', pickup: 'Retira en oficina', delivered: 'Entregado', received: 'Recibido', transit: 'En tránsito', returned: 'Devuelto', 'pre-alerted': 'Pre-alertado' };

async function rollback(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0; let batch = sp2.batch(); let ops = 0;
  for (const b of backup.docs) {
    batch.set(sp2.collection('shipments').doc(b.id), b.data); ops++; n++;
    if (ops >= 400) { await batch.commit(); batch = sp2.batch(); ops = 0; }
  }
  if (ops) await batch.commit();
  await sp2.collection('status_corrections').add({ event: 'rollback', at: new Date().toISOString(), backupFile: path.basename(file), count: n });
  console.log(`Reversa aplicada: ${n} envíos restaurados desde ${path.basename(file)}`);
}

(async () => {
  if (ROLLBACK) return rollback(ROLLBACK);
  const auditFile = fs.readdirSync(OUT).filter((f) => /^auditoria-estados-detalle-.*\.json$/.test(f)).sort().pop();
  const audit = JSON.parse(fs.readFileSync(path.join(OUT, auditFile), 'utf8'));
  const rows = audit.rows.filter((r) => r.kind !== 'stuck');
  const A = rows.filter((r) => r.kind === 'differs' && r.match === 'exacto' && r.proposed);
  const B = rows.filter((r) => r.kind === 'differs' && r.match !== 'exacto');
  const C = rows.filter((r) => r.kind === 'no-sp1' && (r.age == null || r.age > 30));
  const D = rows.filter((r) => r.kind === 'no-sp1' && r.age != null && r.age <= 30);
  const plan = [...A.map((r) => ({ ...r, group: 'A', to: r.proposed, why: `Igualado a SP1 (${r.reason})` })),
    ...C.map((r) => ({ ...r, group: 'C', to: 'delivered', why: 'Abierto en SP2 sin paquete ni factura en SP1; sin movimiento > 30 días' }))];

  // Re-read and verify nothing moved since the audit
  const changes = []; const skipped = [];
  for (let i = 0; i < plan.length; i += 300) {
    const refs = plan.slice(i, i + 300).map((r) => sp2.collection('shipments').doc(r.id));
    const snaps = await sp2.getAll(...refs);
    snaps.forEach((s, j) => {
      const r = plan[i + j];
      if (!s.exists) return skipped.push({ ...r, skip: 'ya no existe' });
      const d = s.data();
      if (d.status !== r.sp2) return skipped.push({ ...r, skip: `cambió desde la auditoría (${d.status})` });
      if (d.mergedInto) return skipped.push({ ...r, skip: 'fusionado' });
      changes.push({ r, data: d });
    });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Excel (always)
  const sheet = (list, extra) => list.map((r) => ({ SL: r.slCode || '', Tracking: r.tracking || r.id, 'Estado en SP2': ES[r.sp2] || r.sp2, 'Estado en SP1': r.sp1 ? `${r.sp1}${r.sp1Label ? ' / ' + r.sp1Label : ''}` : 'Sin paquete en SP1', 'Nuevo estado SP2': r.to ? (ES[r.to] || r.to) : '', Factura: r.invoice || '', 'Días sin movimiento': r.age ?? 'sin fecha', Motivo: r.why || r.reason || '', ...(extra ? extra(r) : {}), 'ID envío SP2': r.id }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet(changes.filter((c) => c.r.group === 'A').map((c) => c.r))), 'A igualados a SP1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet(changes.filter((c) => c.r.group === 'C').map((c) => c.r))), 'C sin SP1 a Entregado');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet(B, (r) => ({ 'Propuesto (SP1)': ES[r.proposed] || r.proposed || '' }))), 'B revisar (parcial)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet(D)), 'D recientes sin SP1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet(skipped, (r) => ({ Omitido: r.skip }))), 'Omitidos');
  const xlsx = path.join(OUT, `correccion-estados-sp2-${APPLY ? 'aplicado' : 'simulacion'}-${stamp.slice(0, 16)}.xlsx`);
  XLSX.writeFile(wb, xlsx);

  const byTo = changes.reduce((m, c) => { const k = `${c.r.group}: ${ES[c.r.sp2] || c.r.sp2} → ${ES[c.r.to] || c.r.to}`; m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log(`${APPLY ? 'APLICAR' : 'Simulación'} — auditoría ${auditFile}`);
  console.log(`A (igualar a SP1, exacto): ${changes.filter((c) => c.r.group === 'A').length} · C (sin SP1 → Entregado): ${changes.filter((c) => c.r.group === 'C').length} · omitidos por cambios: ${skipped.length}`);
  console.log(`No se aplican: B parcial ${B.length} · D recientes ${D.length}`);
  Object.entries(byTo).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Clientes que dejan de estar bloqueados (aprox.): ${new Set(changes.filter((c) => ['processed', 'route', 'held', 'pickup'].includes(c.r.sp2) && !['processed', 'route', 'held', 'pickup'].includes(c.r.to)).map((c) => c.r.slCode)).size}`);
  console.log(`Excel: ${path.relative(process.cwd(), xlsx)}`);
  if (!APPLY) return;

  const backupFile = path.join(OUT, `status-fix-backup-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ at: new Date().toISOString(), docs: changes.map((c) => ({ id: c.r.id, data: c.data })) }));
  console.log(`Respaldo para reversa: ${path.relative(process.cwd(), backupFile)}`);
  const now = new Date().toISOString();
  let batch = sp2.batch(); let ops = 0; let done = 0;
  for (const { r } of changes) {
    const ref = sp2.collection('shipments').doc(r.id);
    batch.update(ref, {
      status: r.to, statusLabel: LABEL[r.to] || r.to, updatedAt: now,
      statusCorrectedAt: now, statusCorrectedFrom: r.sp2, statusCorrectionReason: r.why, statusCorrectionSource: 'sp1_status_audit_2026-09-28',
      ...(r.to === 'delivered' ? { deliveredAt: now } : {}),
      statusHistory: FieldValue.arrayUnion({ status: r.to, notes: `${LABEL[r.to] || r.to} — corregido: ${r.why}`, timestamp: now, location: '', source: 'sp1_status_audit' }),
    });
    batch.set(sp2.collection('status_corrections').doc(), { shipmentId: r.id, tracking: r.tracking || null, slCode: r.slCode || null, from: r.sp2, to: r.to, group: r.group, reason: r.why, at: now, by: 'audit-script', backupFile: path.basename(backupFile) });
    ops += 2; done++;
    if (ops >= 400) { await batch.commit(); batch = sp2.batch(); ops = 0; process.stdout.write(`\r  ${done}/${changes.length}`); }
  }
  if (ops) await batch.commit();
  console.log(`\nAplicado: ${done} envíos corregidos en SP2.`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
