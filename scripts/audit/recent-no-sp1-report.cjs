/**
 * READ-ONLY (2026-09-28): SP2 shipments still open, moved in the last 30 days, with NO package in SP1 — for customer
 * service. Each one is classified by its number: a real carrier tracking, a store ORDER number (not a tracking), or
 * not valid, so the customer can be asked for the right tracking. Nothing is written anywhere.
 * Output: audit-output/recientes-sin-sp1-servicio-al-cliente-<date>.xlsx
 */
'use strict';
const path = require('path');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

/** Paginated full read (a single .get() on a large collection can come back incomplete). Returns { docs, size }. */
async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return { docs, size: docs.length };
}
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));

const ES = { received: 'Recibido', transit: 'En tránsito', customs: 'En aduanas', held: 'Retenido', consolidated: 'Consolidado', processed: 'Facturado', route: 'En ruta', pickup: 'Retira en oficina' };
const OPEN = new Set(Object.keys(ES));
const norm = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ms = (v) => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v._seconds === 'number' ? v._seconds * 1000 : (Date.parse(String(v)) || 0);

/** [type, detail] — raw keeps hyphens (order numbers are recognised by them). */
function classify(raw) {
  const r = String(raw || '').trim(); const u = r.toUpperCase(); const n = norm(r);
  if (!n || n.length < 8) return ['Dato no válido', 'Muy corto para ser un tracking'];
  if (/@/.test(r) || /\s{1,}\w+\s+\w+/.test(r)) return ['Dato no válido', 'Texto / correo, no un número'];
  if (/^\d{3}-\d{7}-\d{7}$/.test(r) || (/^1\d{16}$/.test(n) && /-/.test(r))) return ['Orden de compra', 'Amazon (número de pedido, no tracking)'];
  if (/^\d{2}-\d{5}-\d{5}$/.test(r)) return ['Orden de compra', 'eBay (número de pedido)'];
  if (/^PO-?\d{3}-\d+/i.test(r)) return ['Orden de compra', 'Temu (número de pedido)'];
  if (/^G[A-Z0-9]{2}\d{8,}/.test(n) && !/^GFUS/.test(n)) return ['Orden de compra', 'Shein (número de pedido)'];
  if (/^\d{9}$/.test(n) || /^W\d{9,}/.test(n)) return ['Orden de compra', 'Posible pedido de tienda (Walmart / otro)'];
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return ['Tracking real', 'UPS'];
  if (/^TBA\d{10,}$/.test(n)) return ['Tracking real', 'Amazon Logistics'];
  if (/^420\d{5}(9[2-5]\d{20})$/.test(n) || /^420\d{9}(9[2-5]\d{20})$/.test(n) || /^9[2-5]\d{20}$/.test(n) || /^9[2-5]\d{24}$/.test(n)) return ['Tracking real', 'USPS'];
  if (/^\d{12}$/.test(n) || /^\d{15}$/.test(n) || /^96\d{20}$/.test(n) || /^\d{34}$/.test(n)) return ['Tracking real', 'FedEx'];
  if (/^\d{10}$/.test(n) || /^JJ?D\d{10,}$/.test(n)) return ['Tracking real', 'DHL'];
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(n)) return ['Tracking real', 'Correo internacional (UPU)'];
  if (/^(YT|LP|UUSC|SF|JT|LX|CNG|YDH)\w{8,}$/.test(n)) return ['Tracking real', 'Courier China / internacional'];
  if (/^(GFUS|GFMX|GF)\d{10,}$/.test(n)) return ['Tracking real', 'Aeropost / GF (interno)'];
  if (/^(C|D)\d{14}$/.test(n) || /^1LS/.test(n)) return ['Tracking real', 'OnTrac / LaserShip'];
  if (/^\d{20,22}$/.test(n)) return ['Tracking real', 'USPS / FedEx (formato largo)'];
  return ['Formato desconocido', 'Revisar con el cliente'];
}

(async () => {
  const [p1, s2, users] = await Promise.all([
    readAll(sp1.collection('packages').select('trackingNumber', 'tracking', 'slCode', 'clientSlCode')),
    readAll(sp2.collection('shipments')),
    readAll(sp2.collection('users').select('slCode', 'firstName', 'lastName', 'email', 'phone')),
  ]);
  const exact = new Set(); const tail12 = new Set(); const tail10 = new Set();
  for (const d of p1.docs) { const k = norm(d.get('trackingNumber') || d.get('tracking') || d.id); if (!k) continue; exact.add(k); if (k.length >= 12) tail12.add(k.slice(-12)); if (k.length >= 10) tail10.add(k.slice(-10)); }
  const who = new Map(users.docs.map((d) => [String(d.get('slCode') || '').toUpperCase(), d.data()]));
  const rows = [];
  for (const d of s2.docs) {
    const x = d.data();
    if (x.mergedInto || !OPEN.has(x.status)) continue;
    const k = norm(x.sp1Tracking || x.tracking || d.id);
    if (exact.has(k) || (k.length >= 12 && tail12.has(k.slice(-12))) || (k.length >= 10 && tail10.has(k.slice(-10)))) continue;
    const age = Math.floor((Date.now() - (ms(x.updatedAt) || ms(x.createdAt))) / 864e5);
    if (!(age <= 30)) continue;
    const [type, detail] = classify(x.tracking || d.id);
    const u = who.get(String(x.slCode || '').toUpperCase()) || {};
    rows.push({ Tipo: type, Detalle: detail, SL: x.slCode || '', Cliente: [u.firstName, u.lastName].filter(Boolean).join(' '), Correo: u.email || '', 'Teléfono': u.phone || '',
      'Número registrado': x.tracking || d.id, 'Estado en SP2': ES[x.status] || x.status, 'Días desde el último movimiento': age, Factura: x.invoiceNumber || '', 'ID envío SP2': d.id });
  }
  rows.sort((a, b) => a.Tipo.localeCompare(b.Tipo) || a['Días desde el último movimiento'] - b['Días desde el último movimiento']);
  const tally = rows.reduce((m, r) => { const k = `${r.Tipo} — ${r.Detalle}`; m[k] = (m[k] || 0) + 1; return m; }, {});
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Clasificación: k, Cantidad: v }))), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Envíos');
  const file = path.join(__dirname, '../../audit-output', `recientes-sin-sp1-servicio-al-cliente-${new Date().toISOString().slice(0, 10)}.xlsx`);
  XLSX.writeFile(wb, file);
  console.log(`Envíos recientes sin paquete en SP1: ${rows.length}`);
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`Excel: ${path.relative(process.cwd(), file)}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
