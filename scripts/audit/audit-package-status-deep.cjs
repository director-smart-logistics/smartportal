/**
 * READ-ONLY deep dive of audit-package-status-sp1-sp2.cjs (2026-09-28): for every OPEN SP2 shipment
 * (processed / route / held / pickup / consolidated / customs) that differs from SP1 or has no SP1 package:
 *   - age (last update), invoice in SP1 (by invoice number / id) and its status,
 *   - the SP1 package found by a looser tracking match (last 12 / 10 chars) when the exact one is missing,
 *   - the evidence SP1 gives for the correct status → proposed SP2 status + reason + confidence.
 * Also: SP2 shipments "En ruta" matching SP1 on_route but stuck for > 30 days.
 * Never writes. Output: audit-output/auditoria-estados-detalle-<date>.json + .md
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));

const MAP = { pre_alerted: 'pre-alerted', received: 'received', in_transit: 'transit', customs: 'customs', retained: 'held', consolidated: 'consolidated', processed: 'processed', on_route: 'route', pickup: 'pickup', delivered: 'delivered', returned: 'returned', transit: 'transit', held: 'held', route: 'route', 'pre-alerted': 'pre-alerted' };
const RANK = { 'pre-alerted': 0, received: 1, transit: 2, customs: 3, held: 3, consolidated: 4, processed: 5, route: 6, pickup: 6, delivered: 7, returned: 7 };
const OPEN = new Set(['processed', 'route', 'held', 'pickup', 'consolidated', 'customs']);
const BLOCKING = new Set(['processed', 'route', 'held', 'pickup']);
const norm = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ms = (v) => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v._seconds === 'number' ? v._seconds * 1000 : typeof v.seconds === 'number' ? v.seconds * 1000 : (Date.parse(String(v)) || 0);
const ageDays = (v) => { const m = ms(v); return m ? Math.floor((Date.now() - m) / 864e5) : null; };
const bucket = (d) => d == null ? 'sin fecha' : d <= 7 ? '≤7 días' : d <= 30 ? '8–30 días' : d <= 90 ? '31–90 días' : d <= 180 ? '91–180 días' : '>180 días';

(async () => {
  const [p1, inv1, s2] = await Promise.all([
    sp1.collection('packages').select('trackingNumber', 'tracking', 'slCode', 'clientSlCode', 'status', 'statusLabel', 'invoiceNumber', 'invoiceId', 'updatedAt', 'createdAt').get(),
    sp1.collection('invoices').select('invoiceNumber', 'status', 'slCode', 'clientSlCode', 'updatedAt', 'paidAt').get(),
    sp2.collection('shipments').select('tracking', 'sp1Tracking', 'slCode', 'status', 'invoiceId', 'invoiceNumber', 'invoiceStatus', 'mergedInto', 'updatedAt', 'createdAt', 'statusLockedAt', 'manuallyUpdated').get(),
  ]);
  const exact = new Map(); const tail12 = new Map(); const tail10 = new Map();
  const add = (m, k, v) => { if (!k) return; const a = m.get(k) || []; a.push(v); m.set(k, a); };
  for (const d of p1.docs) {
    const x = { id: d.id, ...d.data() }; const k = norm(x.trackingNumber || x.tracking || d.id);
    add(exact, k, x); if (k.length >= 12) add(tail12, k.slice(-12), x); if (k.length >= 10) add(tail10, k.slice(-10), x);
  }
  const best = (arr) => arr ? [...arr].sort((a, b) => (RANK[MAP[b.status]] ?? -1) - (RANK[MAP[a.status]] ?? -1))[0] : null;
  const invByNum = new Map(); const invById = new Map();
  for (const d of inv1.docs) { const x = { id: d.id, ...d.data() }; invById.set(d.id, x); if (x.invoiceNumber) invByNum.set(String(x.invoiceNumber).toUpperCase(), x); }

  const rows = [];
  for (const d of s2.docs) {
    const x = d.data();
    if (x.mergedInto || !OPEN.has(x.status)) continue;
    const k = norm(x.sp1Tracking || x.tracking || d.id);
    let p = best(exact.get(k)); let how = p ? 'exacto' : null;
    if (!p && k.length >= 12) { const c = tail12.get(k.slice(-12)); if (c && new Set(c.map((z) => norm(z.slCode || z.clientSlCode))).size === 1) { p = best(c); how = 'últimos 12'; } }
    if (!p && k.length >= 10) { const c = tail10.get(k.slice(-10)); if (c && c.length === 1) { p = c[0]; how = 'últimos 10'; } }
    const inv = (x.invoiceNumber && invByNum.get(String(x.invoiceNumber).toUpperCase())) || (x.invoiceId && invById.get(x.invoiceId)) || (p?.invoiceNumber && invByNum.get(String(p.invoiceNumber).toUpperCase())) || null;
    const expected = p ? MAP[p.status] : null;
    if (p && expected === x.status) {
      // matches SP1: only report "En ruta" / Facturado stuck for long
      const age = ageDays(p.updatedAt || x.updatedAt);
      if ((x.status === 'route' || x.status === 'processed') && age != null && age > 30) rows.push({ kind: 'stuck', id: d.id, tracking: x.tracking, slCode: x.slCode || p.slCode, sp2: x.status, sp1: p.status, sp1Label: p.statusLabel || null, age, invoice: inv?.invoiceNumber || x.invoiceNumber || null, invoiceStatus: inv?.status || null });
      continue;
    }
    // proposal
    let proposed = null; let reason = ''; let confidence = 'baja';
    if (p && expected) { proposed = expected; reason = `SP1 (${how}) dice ${p.status}${p.statusLabel ? ' / ' + p.statusLabel : ''}`; confidence = how === 'exacto' ? 'alta' : 'media'; }
    else if (!p && inv && /^(cancelled|annulled|void|deleted)$/i.test(inv.status || '')) { proposed = 'customs'; reason = `sin paquete en SP1; factura ${inv.invoiceNumber} anulada en SP1`; confidence = 'media'; }
    else if (!p && !inv && x.invoiceNumber) { proposed = null; reason = `sin paquete ni factura ${x.invoiceNumber} en SP1`; }
    else if (!p && inv) { proposed = null; reason = `sin paquete en SP1; factura ${inv.invoiceNumber} ${inv.status || ''} en SP1`; }
    else { reason = 'sin paquete ni factura en SP1'; }
    rows.push({ kind: p ? 'differs' : 'no-sp1', id: d.id, tracking: x.tracking, slCode: x.slCode || p?.slCode || null, sp2: x.status, sp1: p?.status || null, sp1Label: p?.statusLabel || null, match: how, invoice: inv?.invoiceNumber || x.invoiceNumber || null, invoiceStatus: inv?.status || null, age: ageDays(x.updatedAt || x.createdAt), proposed, reason, confidence, blocks: BLOCKING.has(x.status) });
  }

  const tally = (list, f) => list.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const noSp1 = rows.filter((r) => r.kind === 'no-sp1'), differs = rows.filter((r) => r.kind === 'differs'), stuck = rows.filter((r) => r.kind === 'stuck');
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(__dirname, '../../audit-output');
  fs.writeFileSync(path.join(out, `auditoria-estados-detalle-${stamp}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  const tbl = (title, obj) => [`**${title}**`, '', '| | Cantidad |', '| --- | --- |', ...Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), ''];
  const md = [
    `# Auditoría detallada de estados SP2 vs SP1 — ${stamp} (solo lectura)`, '',
    `## 1. Difieren de SP1: ${differs.length}`, '',
    ...tbl('Cómo se encontró en SP1', tally(differs, (r) => r.match)),
    ...tbl('Estado propuesto (lo que dice SP1)', tally(differs, (r) => `${r.sp2} → ${r.proposed}`)),
    `## 2. Abiertos en SP2 sin paquete en SP1: ${noSp1.length}`, '',
    ...tbl('Estado en SP2', tally(noSp1, (r) => r.sp2)),
    ...tbl('Antigüedad (última actualización en SP2)', tally(noSp1, (r) => bucket(r.age))),
    ...tbl('Factura', tally(noSp1, (r) => r.reason.replace(/factura \S+/, 'factura X').replace(/SP1;.*$/, 'SP1'))),
    `## 3. Coinciden con SP1 pero llevan > 30 días en "${'En ruta'}" o Facturado: ${stuck.length}`, '',
    ...tbl('Estado SP1 / etiqueta', tally(stuck, (r) => `${r.sp1} / ${r.sp1Label || '—'}`)),
    ...tbl('Antigüedad', tally(stuck, (r) => bucket(r.age))),
    ...tbl('Estado de la factura en SP1', tally(stuck, (r) => r.invoiceStatus || 'sin factura')),
    `Clientes afectados (bloqueo de dirección por 1+2+3): ${new Set(rows.filter((r) => r.blocks || r.kind === 'stuck').map((r) => r.slCode).filter(Boolean)).size}`,
  ].join('\n');
  fs.writeFileSync(path.join(out, `auditoria-estados-detalle-${stamp}.md`), md);
  console.log(md);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
