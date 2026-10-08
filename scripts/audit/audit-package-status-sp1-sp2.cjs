/**
 * READ-ONLY audit (2026-09-28): does each SP2 shipment show the same status as its SP1 package?
 * Never writes: only get() / select() reads on both projects.
 *
 * Why: SP2 shows the customer "Facturados" (every invoice not delivered) and BLOCKS the address change while a
 * package is processed / route / held / pickup. A stale SP2 status (e.g. SP1 delivered, SP2 still Facturado)
 * shows packages the customer already has and blocks them for nothing.
 *
 * Truth = SP1 `status` mapped with the SAME table the SP1 → SP2 sync uses (SP2 sp1-shipment-sync.ts mapStatus).
 * SP1's own `statusLabel` (from ML Cargo) is reported apart when it disagrees with its `status`.
 *
 * Usage
 *   node scripts/audit/audit-package-status-sp1-sp2.cjs            (production, read-only)
 * Output: summary on screen + JSON + Markdown in audit-output/.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));

// Same as SP2 functions/src/sp1-shipment-sync.ts
const SP1_TO_SP2 = {
  pre_alerted: 'pre-alerted', associated: 'associated', received: 'received', in_transit: 'transit', customs: 'customs',
  retained: 'held', consolidated: 'consolidated', consolidacion: 'consolidated', processed: 'processed', on_route: 'route', pickup: 'pickup',
  delivered: 'delivered', returned: 'returned', 'pre-alerted': 'pre-alerted', transit: 'transit', held: 'held', route: 'route', ready: null,
};
const RANK = { 'pre-alerted': 0, associated: 0, received: 1, transit: 2, customs: 3, held: 3, consolidated: 4, processed: 5, route: 6, pickup: 6, delivered: 7, returned: 7 };
const LABEL = { 'pre-alerted': 'Pre-alertado', associated: 'Asociado', received: 'Recibido en Miami', transit: 'En tránsito', customs: 'En aduanas', held: 'Retenido', consolidated: 'Consolidado', processed: 'Facturado', route: 'En ruta', pickup: 'Retira en oficina', delivered: 'Entregado', returned: 'Devuelto' };
const BLOCKING = new Set(['processed', 'route', 'held', 'pickup']);            // today's SP2 address-change block
const FACTURADOS_OPEN = new Set(['processed', 'route', 'held', 'pickup', 'consolidated', 'customs']);
const LABEL_TO_SP2 = [[/entregad/i, 'delivered'], [/devuelt/i, 'returned'], [/ruta/i, 'route'], [/retir/i, 'pickup'], [/factur/i, 'processed'], [/consolid/i, 'consolidated'], [/reten/i, 'held'], [/aduan/i, 'customs'], [/tr[aá]nsito/i, 'transit'], [/recibid/i, 'received']];
const labelStatus = (l) => { for (const [re, s] of LABEL_TO_SP2) if (re.test(String(l || ''))) return s; return null; };
const norm = (t) => String(t || '').toUpperCase().replace(/\s+/g, '').trim();

(async () => {
  const t0 = Date.now();
  // SP1 packages (all; select only what is compared)
  const p1 = await sp1.collection('packages').select('trackingNumber', 'tracking', 'slCode', 'clientSlCode', 'status', 'statusLabel', 'invoiceNumber', 'ruta', 'updatedAt').get();
  const bySp1 = new Map();
  for (const d of p1.docs) {
    const x = d.data(); const k = norm(x.trackingNumber || x.tracking || d.id);
    if (!k) continue;
    const prev = bySp1.get(k);
    // several SP1 docs for one tracking: keep the most advanced one (it is what the sync would push last)
    const r = RANK[SP1_TO_SP2[x.status]] ?? -1;
    if (!prev || r > (RANK[SP1_TO_SP2[prev.status]] ?? -1)) bySp1.set(k, { id: d.id, ...x });
  }
  // SP2 shipments
  const s2 = await sp2.collection('shipments').select('tracking', 'sp1Tracking', 'slCode', 'userId', 'status', 'invoiceId', 'invoiceNumber', 'invoiceStatus', 'mergedInto', 'updatedAt', 'createdAt').get();

  const rows = []; const count = {}; const inc = (k) => { count[k] = (count[k] || 0) + 1; };
  let sp1Incoherent = 0; const sp1IncoherentPairs = {};
  for (const [, x] of bySp1) {
    const a = SP1_TO_SP2[x.status]; const b = labelStatus(x.statusLabel);
    if (a && b && a !== b) { sp1Incoherent++; const k = `${x.status} | ${x.statusLabel}`; sp1IncoherentPairs[k] = (sp1IncoherentPairs[k] || 0) + 1; }
  }
  for (const d of s2.docs) {
    const x = d.data();
    if (x.mergedInto) { inc('merged (ignored)'); continue; }
    const k = norm(x.sp1Tracking || x.tracking || d.id);
    const p = bySp1.get(k) || (x.tracking && bySp1.get(norm(x.tracking)));
    const s2s = x.status || '';
    if (!p) {
      if (FACTURADOS_OPEN.has(s2s) || BLOCKING.has(s2s)) { inc('D. SP2 abierto sin paquete en SP1'); rows.push({ cat: 'D', id: d.id, tracking: x.tracking, slCode: x.slCode || null, sp2: s2s, sp1: null, sp1Label: null, invoice: x.invoiceNumber || null, blocks: BLOCKING.has(s2s) }); }
      else inc('sin paquete en SP1 (pre-alertado / cerrado)');
      continue;
    }
    const expected = SP1_TO_SP2[p.status];
    if (!expected) { inc('SP1 con estado no mapeado (' + p.status + ')'); rows.push({ cat: 'E', id: d.id, tracking: x.tracking, slCode: x.slCode || p.slCode || null, sp2: s2s, sp1: p.status, sp1Label: p.statusLabel || null, invoice: x.invoiceNumber || p.invoiceNumber || null, blocks: BLOCKING.has(s2s) }); continue; }
    if (expected === s2s) { inc('A. coincide'); continue; }
    const cat = (RANK[s2s] ?? -1) < RANK[expected] ? 'B' : 'C';
    inc(cat === 'B' ? 'B. SP2 atrasado respecto a SP1' : 'C. SP2 adelantado respecto a SP1');
    rows.push({ cat, id: d.id, tracking: x.tracking, slCode: x.slCode || p.slCode || null, sp2: s2s, sp1: p.status, expected, sp1Label: p.statusLabel || null, invoice: x.invoiceNumber || p.invoiceNumber || null, blocks: BLOCKING.has(s2s) && !BLOCKING.has(expected) });
  }

  // Customers wrongly blocked / unblocked for an address change
  const blockedWrong = new Set(rows.filter((r) => r.blocks).map((r) => r.slCode).filter(Boolean));
  const transitions = {};
  for (const r of rows.filter((r) => r.cat === 'B' || r.cat === 'C')) { const k = `${r.cat} ${LABEL[r.sp2] || r.sp2} → ${LABEL[r.expected] || r.expected}`; transitions[k] = (transitions[k] || 0) + 1; }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(__dirname, '../../audit-output');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `auditoria-estados-sp1-sp2-${stamp}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), sp1Packages: p1.size, sp2Shipments: s2.size, count, transitions, sp1Incoherent, sp1IncoherentPairs, customersWronglyBlocked: [...blockedWrong], rows }, null, 2));
  const md = [
    `# Auditoría de estados de paquetes SP2 vs SP1 — ${stamp} (solo lectura)`, '',
    `SP1 paquetes: ${p1.size} · SP2 envíos: ${s2.size} · ${Math.round((Date.now() - t0) / 1000)} s`, '',
    '## Resumen', '', '| Categoría | Cantidad |', '| --- | --- |', ...Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '',
    `**Clientes bloqueados sin motivo para cambiar la dirección** (SP2 dice Facturado/En ruta/Retenido/Retira y SP1 dice otra cosa): ${blockedWrong.size}`, '',
    '## Diferencias por tipo (SP2 muestra → SP1 dice)', '', '| Diferencia | Cantidad |', '| --- | --- |', ...Object.entries(transitions).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '',
    `## Incoherencias dentro de SP1 (status vs etiqueta de ML Cargo): ${sp1Incoherent}`, '', '| status \\| etiqueta | Cantidad |', '| --- | --- |', ...Object.entries(sp1IncoherentPairs).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `| ${k} | ${v} |`), '',
  ].join('\n');
  fs.writeFileSync(path.join(out, `auditoria-estados-sp1-sp2-${stamp}.md`), md);
  console.log(md);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
