/**
 * READ-ONLY (2026-09-29). Single-address design: each customer keeps ONE principal address. Lists every customer
 * with more than one address (SP2 `addresses` docs, the SP2 profile copy `users.addresses`, the SP1 ficha copy
 * `customers.addresses`) and which one is the principal, and classifies:
 *   OK       one clear principal, the same in SP2 (profile + address doc) and SP1 → the others can be removed
 *   REVISAR  no principal, more than one, SP1 and SP2 disagree, or the principal document is missing
 * Nothing is written. Output: audit-output/direcciones-extra-<date>.xlsx (+ .json used by the apply step)
 * Run: node scripts/audit/address-extras-plan.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore, FieldPath } = require(path.join(A, 'lib/firestore'));
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
async function readAll(q0) { const docs = []; let last = null; for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; } return docs; }
const txt = (a) => [a?.alias, a?.streetAddress, a?.details, a?.canton, a?.province].filter(Boolean).join(' · ').slice(0, 160);
const iso = (v) => !v ? '' : typeof v.toDate === 'function' ? v.toDate().toISOString().slice(0, 10) : String(v).slice(0, 10);

(async () => {
  const [users, addrs, custs] = await Promise.all([readAll(sp2.collection('users')), readAll(sp2.collection('addresses')), readAll(sp1.collection('customers'))]);
  const byUser = new Map(); for (const d of addrs) { const u = d.get('userId'); if (!u) continue; (byUser.get(u) || byUser.set(u, []).get(u)).push(d); }
  const fichaByUid = new Map(); const fichaBySl = new Map();
  for (const c of custs) { if (c.get('firebaseUid')) fichaByUid.set(c.get('firebaseUid'), c); fichaBySl.set(c.id, c); }
  const rows = []; const plan = [];
  for (const u of users) {
    const x = u.data(); const docs = byUser.get(u.id) || []; const profile = Array.isArray(x.addresses) ? x.addresses : [];
    const ficha = fichaBySl.get(String(x.slCode || '')) || fichaByUid.get(u.id); const sp1List = Array.isArray(ficha?.get('addresses')) ? ficha.get('addresses').filter((a) => a && a.id) : [];
    const ids = new Set([...docs.map((d) => d.id), ...profile.map((a) => a?.id).filter(Boolean), ...sp1List.map((a) => a.id)]);
    if (ids.size <= 1) continue;
    const pDoc = docs.filter((d) => d.get('isPrimary') === true || d.get('isDefault') === true).map((d) => d.id);
    const pProfile = x.defaultAddress?.id || null; const pSp1 = ficha?.get('defaultAddress')?.id || null;
    const candidates = new Set([...pDoc, pProfile, pSp1].filter(Boolean));
    let status = 'OK'; const why = [];
    // The principal the labels print is SP1's defaultAddress, fed from the SP2 profile (single-address source of
    // truth). When those two agree, extra isPrimary flags on other address docs are leftovers of the old model.
    let principal = null;
    if (pProfile && pProfile === pSp1) { principal = pProfile; if (pDoc.length > 1 || (pDoc.length && !pDoc.includes(pProfile))) why.push('marcas de principal viejas en otras direcciones (se usan perfil SP2 + SP1)'); }
    else if (candidates.size === 1) principal = [...candidates][0];
    // Legacy profile without defaultAddress: the principal is SP1's (the one printed on labels) when it exists in SP2.
    else if (!pProfile && pSp1 && docs.some((d) => d.id === pSp1)) { principal = pSp1; why.push('perfil SP2 sin principal: se usa la de SP1 (etiquetas)'); }
    else if (!candidates.size) { status = 'REVISAR'; why.push('sin dirección principal'); }
    else {
      status = 'REVISAR';
      const show = (id) => { const d = docs.find((z) => z.id === id); return d ? `${txt(d.data())} [act. ${iso(d.get('updatedAt')) || '-'}]` : `${id} (no existe en SP2)`; };
      why.push(`SP2 perfil: ${pProfile ? show(pProfile) : '-'} ‖ SP1 etiquetas: ${pSp1 ? show(pSp1) : '-'}`);
    }
    if (principal && !docs.some((d) => d.id === principal)) { status = 'REVISAR'; why.push('la principal no existe en SP2'); }
    const pAddr = docs.find((d) => d.id === principal)?.data() || profile.find((a) => a?.id === principal) || null;
    const extras = [...ids].filter((id) => id !== principal).map((id) => { const d = docs.find((z) => z.id === id); const a = d?.data() || profile.find((z) => z?.id === id) || sp1List.find((z) => z.id === id) || {}; return { id, texto: txt(a), creada: iso(a.createdAt), enSP2: !!d, enPerfil: profile.some((z) => z?.id === id), enSP1: sp1List.some((z) => z.id === id) }; });
    rows.push({ estado: status, motivo: why.join('; '), codigo: x.slCode || '', uid: u.id, cliente: `${x.firstName || ''} ${x.lastName || ''}`.trim(), direcciones: ids.size, principal: pAddr ? txt(pAddr) : '(ninguna)', aEliminar: extras.map((e) => `${e.texto || e.id}${e.creada ? ' (' + e.creada + ')' : ''}`).join(' | '), fichaSP1: ficha ? ficha.id : 'no' });
    plan.push({ status, uid: u.id, slCode: x.slCode || null, fichaSp1: ficha ? ficha.id : null, principal, extras: extras.map((e) => e.id) });
  }
  rows.sort((a, b) => a.estado.localeCompare(b.estado) || String(a.codigo).localeCompare(String(b.codigo)));
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(__dirname, '../../audit-output', `direcciones-extra-${stamp}`);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Direcciones extra'); XLSX.writeFile(wb, out + '.xlsx');
  fs.writeFileSync(out + '.json', JSON.stringify(plan, null, 1));
  const ok = rows.filter((r) => r.estado === 'OK'); const rev = rows.filter((r) => r.estado !== 'OK');
  console.log(`Clientes con más de una dirección: ${rows.length} · OK (principal clara) ${ok.length} · REVISAR ${rev.length} · direcciones extra a quitar (OK): ${plan.filter((p) => p.status === 'OK').reduce((s, p) => s + p.extras.length, 0)}`);
  for (const r of rev) console.log(`  REVISAR ${r.codigo} ${r.cliente}: ${r.motivo}`);
  console.log('Lista:', out + '.xlsx');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
