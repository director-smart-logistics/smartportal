/**
 * Rule (user, 2026-09-28): invoice PAID more than 5 days ago → Entregado; no SP1 package nor invoice and
 * > 30 days → Entregado. In SP1 AND SP2, except the unusual cases (user, 2026-09-28:
 * "paquetes con más de 1 mes … moverlos a entregados, excepto … algún caso raro, por ejemplo alguien que consolidó").
 * Also: any SP2 shipment whose status differs from its SP1 package (any age) takes SP1's status.
 *
 * Per SP2 shipment (not delivered/returned/pre-alerted, not merged), SP1 package by tracking (exact, else last 12
 * of the same SL). Last movement = SP1 package updatedAt (else SP2 updatedAt/createdAt).
 *   excluded (reported, untouched):
 *     consolidación      tracking in SP1 manifest_consolidation (not delivered) or status consolidated
 *     retenido           SP1 retained/held
 *     retira en oficina  pickup (waiting for the customer)
 *     factura sin pagar  SP1 invoice sent / overdue / draft
 *     sin factura        SP1 package received / transit / customs with no invoice (still in warehouse / customs)
 *     sin paquete en SP1 and ≤ 30 days (may not be in a manifest yet)
 *   to Entregado (> 30 days): SP1 on_route / route / processed with a PAID invoice, or SP1 already delivered
 *   igualar a SP1: SP2 ≠ SP1 and not covered above (≤ 30 days)
 * SP1 is ONLY READ — nothing is written there (user decision 2026-09-28).
 * Backups of every document (both projects) for --rollback; logs: SP1 package_status_corrections, SP2
 * status_corrections; Excel with every group. No e-mail is sent by either system on these writes.
 *
 * node scripts/audit/fix-stale-packages.cjs            dry run (counts + Excel)
 * node scripts/audit/fix-stale-packages.cjs --apply
 * node scripts/audit/fix-stale-packages.cjs --rollback audit-output/stale-fix-backup-<ts>.json
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldValue, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

/** Paginated full read (a single .get() on a large collection can come back incomplete). Returns { docs, size }. */
async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return { docs, size: docs.length };
}
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));
const OUT = path.join(__dirname, '../../audit-output');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback') ? args[args.indexOf('--rollback') + 1] : null;

const MAP = { pre_alerted: 'pre-alerted', received: 'received', in_transit: 'transit', customs: 'customs', retained: 'held', consolidated: 'consolidated', consolidacion: 'consolidated', processed: 'processed', on_route: 'route', pickup: 'pickup', delivered: 'delivered', returned: 'returned', transit: 'transit', held: 'held', route: 'route', 'pre-alerted': 'pre-alerted' };
const LABEL2 = { received: 'Recibido en Miami', transit: 'En Tránsito a Costa Rica', customs: 'Procesando en Costa Rica', held: 'Retenido en Aduana', consolidated: 'Consolidado', processed: 'Facturado', route: 'En Ruta de Entrega', pickup: 'Retira en SmartLogistics', delivered: 'Entregado', returned: 'Devuelto' };
const ES = { received: 'Recibido', transit: 'En tránsito', customs: 'En aduanas', held: 'Retenido', consolidated: 'Consolidado', processed: 'Facturado', route: 'En ruta', pickup: 'Retira en oficina', delivered: 'Entregado', returned: 'Devuelto', 'pre-alerted': 'Pre-alertado' };
const CLOSED2 = new Set(['delivered', 'returned', 'pre-alerted', 'associated']);
const norm = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ms = (v) => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v._seconds === 'number' ? v._seconds * 1000 : (Date.parse(String(v)) || 0);
const days = (m) => m ? Math.floor((Date.now() - m) / 864e5) : null;

async function rollback(file) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [db, list, name] of [[sp1, b.sp1, 'packages'], [sp2, b.sp2, 'shipments']]) {
    let batch = db.batch(); let ops = 0;
    for (const d of list) { batch.set(db.collection(name).doc(d.id), d.data); if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; } }
    if (ops) await batch.commit();
  }
  console.log(`Reversa: SP1 ${b.sp1.length} paquetes, SP2 ${b.sp2.length} envíos restaurados.`);
}


/** Generation datetime embedded in the invoice number (slCode-yyyymmddHHMMSSmmm[-C]) → invoiceDate → createdAt. */
function invGenerated(inv) {
  const t = String(inv.invoiceNumber || '').match(/-(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\d*(?:-[A-Z])?$/);
  if (t) return Date.UTC(+t[1], +t[2] - 1, +t[3], +t[4], +t[5]) + 6 * 36e5; // stamped in Costa Rica time (UTC-6)
  return ms(inv.invoiceDate) || ms(inv.createdAt);
}
/** When the SP1 invoice was FIRST marked paid (user 2026-09-28: "5 días desde que se colocó en pagado"):
 *  first 'paid' entry of statusHistory → paidAt → (last resort) the invoice date. Never updatedAt: any later touch
 *  (a repeated bulk update, a sync) would make an invoice paid long ago look paid today. */
function invPaid(inv) {
  const h = (Array.isArray(inv.statusHistory) ? inv.statusHistory : []).filter((e) => /^paid$/i.test(e?.status || '')).map((e) => ms(e.changedAt || e.timestamp || e.at)).filter(Boolean);
  if (h.length) return Math.min(...h);
  return ms(inv.paidAt) || ms(inv.invoiceDate) || ms(inv.createdAt);
}

(async () => {
  if (ROLLBACK) return rollback(ROLLBACK);
  const [p1, inv1, cons, s2] = await Promise.all([
    readAll(sp1.collection('packages')),
    readAll(sp1.collection('invoices').select('invoiceNumber', 'status', 'paidAt', 'statusHistory', 'invoiceDate', 'createdAt')),
    readAll(sp1.collection('manifest_consolidation').select('tracking', 'status', 'slCode')),
    readAll(sp2.collection('shipments')),
  ]);
  console.log(`Leídos: SP1 paquetes ${p1.size}, facturas ${inv1.size}, consolidación ${cons.size} · SP2 envíos ${s2.size}`);
  const exact = new Map(); const tail = new Map(); const tail10 = new Map();
  const add = (m, k, v) => { const a = m.get(k) || []; a.push(v); m.set(k, a); };
  for (const d of p1.docs) { const x = { id: d.id, ...d.data() }; const k = norm(x.trackingNumber || x.tracking || d.id); if (!k) continue; add(exact, k, x); if (k.length >= 12) add(tail, k.slice(-12), x); if (k.length >= 10) add(tail10, k.slice(-10), x); }
  const RK = { 'pre-alerted': 0, received: 1, transit: 2, customs: 3, held: 3, consolidated: 4, processed: 5, route: 6, pickup: 6, delivered: 7, returned: 7 };
  const best = (a) => a ? [...a].sort((x, y) => (RK[MAP[y.status]] ?? -1) - (RK[MAP[x.status]] ?? -1))[0] : null;
  const invByNum = new Map(); const invById = new Map();
  for (const d of inv1.docs) { const x = { id: d.id, ...d.data() }; invById.set(d.id, x); if (x.invoiceNumber) invByNum.set(String(x.invoiceNumber).toUpperCase(), x); }
  // "In consolidation" = exactly what SP1's Consolidation Manifest page shows (useConsolidationData + isPackageTransitoria):
  // a non-terminal package parked in CONSOLIDACION_TRANSITORIA. manifest_consolidation is only a HISTORY of moves (884 old
  // rows) and packages.status 'consolidated' alone is often stale (user 2026-09-28: the page shows 25).
  const TRANS = 'consolidacion_transitoria';
  const isTrans = (q) => { const u = String(q.updatedManifest || '').trim().toLowerCase(), i = String(q.manifestId || '').trim().toLowerCase(), n = String(q.manifestNumber || '').trim().toLowerCase(), m = String(q.manifiesto || '').trim().toLowerCase(); return u ? u === TRANS : i ? i === TRANS : n ? n === TRANS : m === TRANS; };
  const inCons = new Set(p1.docs.map((d) => d.data()).filter((q) => isTrans(q) && !['delivered', 'processed', 'returned', 'pickup'].includes(String(q.status || '').toLowerCase())).map((q) => norm(q.trackingNumber || q.tracking)));
  console.log(`En consolidación (página de SP1): ${inCons.size}`);

  const plan = []; const excluded = []; const recent = []; const sp1Writes = new Map();
  for (const d of s2.docs) {
    const x = d.data();
    if (x.mergedInto || CLOSED2.has(x.status) || !x.status) continue;
    const k = norm(x.sp1Tracking || x.tracking || d.id);
    let p = best(exact.get(k)); let how = 'exacto';
    // Same matching as the audit: long barcodes in SP2 vs the short number SP1 keeps (and the reverse).
    const sameSl = (c) => new Set(c.map((z) => norm(z.slCode || z.clientSlCode))).size === 1;
    if (!p && k.length >= 12) { const c = tail.get(k.slice(-12)); if (c && sameSl(c)) { p = best(c); how = 'últimos 12'; } }
    if (!p && k.length >= 10) { const c = tail10.get(k.slice(-10)); if (c && c.length === 1) { p = c[0]; how = 'últimos 10'; } }
    if (!p) how = null;
    const sp1Raw = p ? MAP[p.status] : null;
    const reallyCons = inCons.has(k);
    // SP1 'consolidated' outside the consolidation page is a stale status: its label says where the package really is.
    const staleCons = sp1Raw === 'consolidated' && !reallyCons;
    const sp1s = staleCons ? (/entreg/i.test(p.statusLabel || '') ? 'delivered' : null) : sp1Raw;
    const inv = p && ((p.invoiceNumber && invByNum.get(String(p.invoiceNumber).toUpperCase())) || (p.invoiceId && invById.get(p.invoiceId))) || (x.invoiceNumber && invByNum.get(String(x.invoiceNumber).toUpperCase())) || null;
    const age = days(Math.max(ms(p?.updatedAt), p ? 0 : ms(x.updatedAt || x.createdAt)) || ms(x.updatedAt || x.createdAt));
    const base = { id: d.id, tracking: x.tracking || d.id, slCode: x.slCode || p?.slCode || null, sp2: x.status, sp1: p ? p.status : null, sp1Label: p?.statusLabel || null, match: how, invoice: inv?.invoiceNumber || p?.invoiceNumber || x.invoiceNumber || null, invoiceStatus: inv?.status || null, age, sp1Id: p?.id || null, data: x };
    const paid = inv && /^paid$/i.test(inv.status || '');
    const paidDays = paid ? days(invPaid(inv)) : null;
    const genDays = paid ? days(invGenerated(inv)) : null;
    const paidRule = (paidDays != null && paidDays >= 5) || (genDays != null && genDays > 20);
    // User 2026-09-28: a paid invoice beats a stale consolidation-manifest entry — only a package SP1 itself still has as
    // 'consolidated' stays consolidated; 'retira en oficina' with the invoice issued more than 5 days ago is delivered too.
    // User 2026-09-28: 'consolidated' but NOT in the consolidation page → it is delivered.
    if (!reallyCons && (staleCons || x.status === 'consolidated') && x.status !== 'delivered') { plan.push({ ...base, to: 'delivered', group: 'Marcado consolidado pero no está en consolidación', sp1Write: false }); continue; }
    if (reallyCons) { if (x.status !== 'consolidated') plan.push({ ...base, to: 'consolidated', group: 'En consolidación en SP1 (página de consolidación)', sp1Write: false }); else recent.push({ ...base, why: 'en consolidación' }); continue; }
    if (paid && x.status !== 'delivered' && (
      (paidRule && (staleCons || x.status === 'consolidated')) ||
      ((sp1s === 'pickup' || x.status === 'pickup') && genDays != null && genDays > 5))) {
      plan.push({ ...base, to: 'delivered', group: sp1s === 'pickup' || x.status === 'pickup' ? 'Retira en oficina, factura pagada emitida hace más de 5 días' : 'Fuera de consolidación y con factura pagada', paidDays, sp1Write: false });
      continue;
    }
    // unusual cases first
    const why =
      staleCons && sp1s !== 'delivered' ? `SP1 marca consolidado pero no está en consolidación (dato viejo; etiqueta: ${p.statusLabel || '-'})`
      : sp1s === 'held' || x.status === 'held' ? 'Retenido en aduana'
      : sp1s === 'pickup' || x.status === 'pickup' ? 'Retira en oficina (espera al cliente)'
      : inv && /^(sent|overdue|draft|pending)$/i.test(inv.status || '') && sp1s !== 'delivered' ? `Factura ${inv.invoiceNumber} sin pagar (${inv.status})`
      : p && ['received', 'transit', 'customs'].includes(sp1s) && !inv ? 'Sin factura en SP1 (aún en bodega / aduana)'
      : null;
    if (sp1s === 'delivered' && x.status !== 'delivered') { plan.push({ ...base, to: 'delivered', group: 'SP1 ya entregado', sp1Write: false }); continue; }
    // User 2026-09-28: an UNPAID invoice (SP1's current status) generated more than 7 days ago → delivered;
    // 'en ruta' / 'facturado' with no SP1 invoice and more than 7 days in that status → delivered.
    const unpaid = inv && /^(sent|overdue|draft|pending)$/i.test(inv.status || '');
    const invAge = inv ? days(invGenerated(inv)) : null;
    if (why && unpaid && !['held', 'pickup'].includes(sp1s) && invAge != null && invAge > 7) { plan.push({ ...base, to: 'delivered', group: `Factura sin pagar (${inv.status}) generada hace más de 7 días`, paidDays: invAge, sp1Write: false }); continue; }
    if (!inv && p && ['route', 'processed'].includes(sp1s) && ['route', 'processed'].includes(x.status) && age != null && age > 7) { plan.push({ ...base, to: 'delivered', group: 'En ruta / facturado sin factura, más de 7 días', sp1Write: false }); continue; }
    if (why) { if (sp1s && sp1s !== x.status && age != null && age <= 30) plan.push({ ...base, to: sp1s, group: 'Igualado a SP1 (caso especial reciente)', sp1Write: false }); else excluded.push({ ...base, why }); continue; }
    // User rule (2026-09-28): invoice PAID more than 5 days ago → the package is delivered (SP1 and SP2).
    // User 2026-09-28: paid → delivered once 5 days have passed since it was marked paid, or once the invoice is more
    // than 20 days old (its number is slCode + generation datetime, e.g. SL43-20260810143738820; paid ≤5 days after).
    if (paidRule) {
      plan.push({ ...base, to: 'delivered', group: paidDays != null && paidDays >= 5 ? 'Factura pagada hace 5 días o más' : 'Factura pagada, generada hace más de 20 días', paidDays, sp1Write: false });
      continue;
    }
    if (!p && !inv && age != null && age > 30) { plan.push({ ...base, to: 'delivered', group: 'Más de 30 días sin paquete ni factura en SP1', sp1Write: false }); continue; }
    if (age != null && age > 30 && p && ['route', 'processed'].includes(sp1s)) { excluded.push({ ...base, why: inv ? `Factura ${inv.invoiceNumber} ${inv.status}${paidDays != null ? ` hace ${paidDays} días` : ''}` : 'En ruta / facturado sin factura en SP1' }); continue; }
    if (p && sp1s && sp1s !== x.status) { plan.push({ ...base, to: sp1s, group: 'Igualado a SP1', sp1Write: false }); continue; }
    recent.push({ ...base, why: age == null ? 'sin fecha' : `${age} días` });
  }
  // User (2026-09-28): SP1 is NOT changed — only SP2 is corrected. SP1 is only read.
  void sp1Writes;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const row = (r) => ({ SL: r.slCode || '', Tracking: r.tracking, 'SP2 antes': ES[r.sp2] || r.sp2, 'SP1': r.sp1 ? `${r.sp1}${r.sp1Label ? ' / ' + r.sp1Label : ''}` : 'Sin paquete en SP1', 'Nuevo estado': r.to ? ES[r.to] || r.to : '', Grupo: r.group || '', Motivo: r.why || '', Factura: r.invoice || '', 'Estado factura': r.invoiceStatus || '', 'Días sin movimiento': r.age ?? 'sin fecha', 'Días desde que se pagó': r.paidDays ?? '', Coincidencia: r.match || '', 'ID SP2': r.id });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plan.map(row)), 'Cambios');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excluded.map(row)), 'Casos especiales (no se tocan)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recent.map(row)), 'Recientes coinciden');
  const xlsx = path.join(OUT, `paquetes-mas-de-30-dias-${APPLY ? 'aplicado' : 'simulacion'}-${stamp.slice(0, 16)}.xlsx`);
  XLSX.writeFile(wb, xlsx);
  const tally = (l, f) => Object.entries(l.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  console.log(`${APPLY ? 'APLICAR' : 'Simulación'}: ${plan.length} envíos SP2 cambian (SP1 solo lectura) · ${excluded.length} casos especiales sin tocar · ${recent.length} recientes que ya coinciden`);
  console.log('Cambios:'); tally(plan, (r) => `${r.group}: ${ES[r.sp2] || r.sp2} → ${ES[r.to] || r.to}`).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('Casos especiales:'); tally(excluded, (r) => r.why.replace(/Factura \S+ /, 'Factura X ')).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Excel: ${path.relative(process.cwd(), xlsx)}`);
  if (!APPLY) return;

  // Re-read right before writing; skip anything that moved
  const now = new Date().toISOString();
  const sp2Docs = [];
  for (let i = 0; i < plan.length; i += 300) {
    const snaps = await sp2.getAll(...plan.slice(i, i + 300).map((r) => sp2.collection('shipments').doc(r.id)));
    snaps.forEach((s, j) => { const r = plan[i + j]; if (s.exists && s.data().status === r.sp2) sp2Docs.push({ r, data: s.data() }); });
  }
  const backupFile = path.join(OUT, `stale-fix-backup-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ at: now, sp1: [], sp2: sp2Docs.map((d) => ({ id: d.r.id, data: d.data })) }));
  console.log(`Respaldo: ${path.relative(process.cwd(), backupFile)}`);
  let batch = sp2.batch(); let ops = 0;
  for (const { r } of sp2Docs) {
    const why = r.paidDays != null ? `${r.group} (pagada hace ${r.paidDays} días)` : `${r.group}${r.age != null ? ` (${r.age} días sin movimiento)` : ''}`;
    batch.update(sp2.collection('shipments').doc(r.id), { status: r.to, statusLabel: LABEL2[r.to] || r.to, updatedAt: now, statusCorrectedAt: now, statusCorrectedFrom: r.sp2, statusCorrectionReason: why, statusCorrectionSource: 'stale_packages_2026-09-28', ...(r.to === 'delivered' ? { deliveredAt: now } : {}),
      statusHistory: FieldValue.arrayUnion({ status: r.to, notes: `${LABEL2[r.to] || r.to} — corregido: ${why}`, timestamp: now, location: '', source: 'stale_packages_audit' }) });
    batch.set(sp2.collection('status_corrections').doc(), { shipmentId: r.id, tracking: r.tracking, slCode: r.slCode, from: r.sp2, to: r.to, group: r.group, reason: why, at: now, by: 'stale-packages-script', backupFile: path.basename(backupFile) });
    if ((ops += 2) >= 400) { await batch.commit(); batch = sp2.batch(); ops = 0; }
  }
  if (ops) await batch.commit();
  console.log(`Aplicado: SP2 ${sp2Docs.length} envíos corregidos (SP1 sin cambios).`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
