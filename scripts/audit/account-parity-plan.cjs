/**
 * READ-ONLY (2026-09-29): SP1 customers ↔ SP2 users parity plan. Nothing is written anywhere.
 *
 * Rule: an account exists in both systems or in neither; no soft-deleted clients; no placeholder
 * fichas in SP1 `customers`. For every account that breaks the rule this lists the proposed action
 * and anything that could hurt operations (packages, invoices, SP2 shipments, Nova learning, a login
 * that is still in use). Accounts with any of those are marked REVISAR — never deleted automatically.
 *
 * Output: audit-output/plan-paridad-cuentas-<date>.xlsx (one sheet per group + summary)
 * Run:    node scripts/audit/account-parity-plan.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));

const app2 = initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2');
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(app2);

async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return docs;
}
const SL = (x) => { const s = String(x || '').toUpperCase().trim(); return /^SL\d+$/.test(s) ? s : ''; };
const iso = (v) => !v ? '' : typeof v.toDate === 'function' ? v.toDate().toISOString() : typeof v._seconds === 'number' ? new Date(v._seconds * 1000).toISOString() : String(v);
const isDel = (s) => s === 'deleted' || s === 'inactive';
const hasProfile = (x) => !!(x.email || x.firstName || x.lastName || x.fullName || x.name || x.dni || x.phone);

(async () => {
  const [custs, users, pk, inv, sh, pa, fb, pat, temps] = await Promise.all([
    readAll(sp1.collection('customers')), readAll(sp2.collection('users')),
    readAll(sp1.collection('packages').select('slCode', 'clientSlCode', 'customerId', 'status')),
    readAll(sp1.collection('invoices').select('slCode', 'status')),
    readAll(sp2.collection('shipments').select('userId', 'slCode', 'status')),
    readAll(sp2.collection('pre_alerts').select('userId', 'slCode')),
    readAll(sp1.collection('match_feedback').select('slCode')),
    readAll(sp1.collection('manifest_learning_patterns').select('slCode')),
    readAll(sp1.collection('temp_customers').select()),
  ]);
  const auth = new Map(); let tok;
  do { const r = await getAuth(app2).listUsers(1000, tok); for (const a of r.users) auth.set(a.uid, a); tok = r.pageToken; } while (tok);

  const count = (docs, keyFns) => { const m = new Map(); for (const d of docs) { const seen = new Set(); for (const f of keyFns) { const k = String(f(d) || '').trim().toUpperCase(); if (k && !seen.has(k)) { seen.add(k); m.set(k, (m.get(k) || 0) + 1); } } } return m; };
  const OPEN = (s) => !['delivered', 'returned', 'cancelled', 'deleted'].includes(String(s || ''));
  const pkBy = count(pk, [(d) => d.get('slCode'), (d) => d.get('clientSlCode'), (d) => d.get('customerId')]);
  const pkOpenBy = count(pk.filter((d) => OPEN(d.get('status'))), [(d) => d.get('slCode'), (d) => d.get('clientSlCode')]);
  const invBy = count(inv, [(d) => d.get('slCode')]);
  const shByUid = count(sh, [(d) => d.get('userId')]);
  const shOpenByUid = count(sh.filter((d) => OPEN(d.get('status'))), [(d) => d.get('userId')]);
  const paByUid = count(pa, [(d) => d.get('userId')]);
  const learnBy = count([...fb, ...pat], [(d) => d.get('slCode')]);
  const tempIds = new Set(temps.map((d) => d.id.toUpperCase()));

  const c1 = new Map(); for (const d of custs) { const k = SL(d.get('slCode')) || SL(d.id); if (k) c1.set(k, d); }
  const u2 = new Map(); for (const d of users) { const k = SL(d.get('slCode')); if (k) u2.set(k, d); }
  const u2ByUid = new Map(users.map((d) => [d.id, d]));

  const sp1Refs = (k) => ({ paquetesSP1: pkBy.get(k) || 0, abiertosSP1: pkOpenBy.get(k) || 0, facturasSP1: invBy.get(k) || 0, aprendizajeNova: learnBy.get(k) || 0 });
  const sp2Refs = (uid) => ({ enviosSP2: shByUid.get(String(uid).toUpperCase()) || 0, abiertosSP2: shOpenByUid.get(String(uid).toUpperCase()) || 0, prealertasSP2: paByUid.get(String(uid).toUpperCase()) || 0 });
  const loginOf = (uid) => { const a = auth.get(uid); return a ? { login: a.disabled ? 'deshabilitado' : 'activo', ultimoIngreso: a.metadata.lastSignInTime ? new Date(a.metadata.lastSignInTime).toISOString().slice(0, 10) : '', codigoEnLogin: a.customClaims?.slCode || '' } : { login: 'NO EXISTE', ultimoIngreso: '', codigoEnLogin: '' }; };
  const risks = (r) => {
    const out = [];
    if (r.abiertosSP1) out.push(`${r.abiertosSP1} paquete(s) ABIERTO(s) en SP1`);
    else if (r.paquetesSP1) out.push(`${r.paquetesSP1} paquete(s) en SP1`);
    if (r.facturasSP1) out.push(`${r.facturasSP1} factura(s) en SP1`);
    if (r.abiertosSP2) out.push(`${r.abiertosSP2} envío(s) abierto(s) en SP2`);
    else if (r.enviosSP2) out.push(`${r.enviosSP2} envío(s) en SP2`);
    if (r.prealertasSP2) out.push(`${r.prealertasSP2} pre-alerta(s)`);
    if (r.aprendizajeNova) out.push(`${r.aprendizajeNova} registro(s) de aprendizaje Nova (se borran al eliminar la ficha)`);
    if (r.login === 'activo' && r.ultimoIngreso >= '2026-06-01') out.push(`login activo, entró ${r.ultimoIngreso}`);
    return out;
  };
  const S = {};
  const add = (sheet, row, clean, safeAction) => {
    const rk = risks(row);
    row.riesgos = rk.join('; ') || '—';
    row.accion = rk.length ? `REVISAR — ${clean}` : safeAction;
    (S[sheet] = S[sheet] || []).push(row);
  };

  // A. SP1 fichas that are not customers (no SL code, or SL code with no data at all and no SP2 account)
  for (const d of custs) {
    const x = d.data(); const k = SL(x.slCode) || SL(d.id);
    if (k && (hasProfile(x) || u2.has(k))) continue;
    const key = (k || d.id).toUpperCase();
    const row = { sheet: 'A', fichaSP1: d.id, codigo: k || '(no es código SL)', campos: Object.keys(x).join(','), creada: iso(x.createdAt || x.updatedAt).slice(0, 10), enTempCustomers: tempIds.has(key) ? 'sí' : 'no', ...sp1Refs(key) };
    add('A Fichas SP1 no-cliente', row, 'tiene historial; decidir a qué cliente pertenece', 'Eliminar ficha SP1 (respaldo completo)');
  }
  // B. SP2 users without SL code
  for (const d of users) {
    const x = d.data(); if (SL(x.slCode)) continue;
    const c = custs.find((cd) => cd.get('firebaseUid') === d.id);
    const row = { uid: d.id, codigo: x.slCode || '', campos: Object.keys(x).join(','), fichaSP1PorUid: c ? `${c.id} (${c.get('fullName') || ''})` : 'no', ...loginOf(d.id), ...sp2Refs(d.id), ...(c ? sp1Refs(c.id) : {}) };
    const act = c && !hasProfile(x) ? 'RESTAURAR perfil SP2 desde la ficha SP1 y el login (es un cliente real)' : c ? 'Normalizar código' : 'Eliminar usuario SP2 (respaldo completo)';
    add('B Usuarios SP2 sin código', row, act, act);
  }
  // C. Soft-deleted / inactive in either system
  for (const [k, d] of u2) if (isDel(d.get('status'))) {
    const c = c1.get(k);
    const row = { codigo: k, uid: d.id, nombre: `${d.get('firstName') || ''} ${d.get('lastName') || ''}`.trim(), estadoSP2: d.get('status'), eliminadaEl: d.get('deletedAt') || '', fichaSP1: c ? (c.get('status') || 'active') : 'no existe', ...loginOf(d.id), ...sp1Refs(k), ...sp2Refs(d.id) };
    const act = c && !isDel(c.get('status')) ? 'CONFLICTO: eliminada en SP2 pero activa en SP1 — decidir' : 'Eliminar de los dos sistemas (respaldo completo; login ya deshabilitado)';
    add('C Soft-delete', { ...row, sistema: 'SP2' }, act, act);
  }
  for (const [k, c] of c1) if (isDel(c.get('status'))) {
    if (u2.has(k) && isDel(u2.get(k).get('status'))) continue; // already listed above
    const u = u2.get(k);
    const row = { codigo: k, uid: u?.id || '', nombre: c.get('fullName') || '', estadoSP1: c.get('status'), fichaSP2: u ? (u.get('status') || 'active') : 'no existe', ...(u ? loginOf(u.id) : {}), ...sp1Refs(k), ...(u ? sp2Refs(u.id) : {}) };
    const act = u && !isDel(u.get('status')) ? 'CONFLICTO: eliminada/inactiva en SP1 pero activa en SP2 — decidir' : 'Eliminar ficha SP1 (respaldo completo)';
    add('C Soft-delete', { ...row, sistema: 'SP1' }, act, act);
  }
  // D. Active in SP2, missing in SP1 (and E. SP1 ficha pointing to a different SP2 code)
  for (const [k, d] of u2) {
    if (c1.has(k) || isDel(d.get('status'))) continue;
    const twin = custs.find((c) => c.get('firebaseUid') === d.id);
    const row = { codigo: k, uid: d.id, nombre: `${d.get('firstName') || ''} ${d.get('lastName') || ''}`.trim(), correoSP2: d.get('email') || '(vacío)', ...loginOf(d.id), fichaSP1ConMismoLogin: twin ? twin.id : 'no', ...sp2Refs(d.id), ...(twin ? sp1Refs(twin.id) : {}) };
    const act = twin ? `Devolver en SP2 el código de SP1 (${twin.id}) y completar el correo desde el login` : 'Crear ficha en SP1 con la sincronización normal';
    (S['D Solo en SP2'] = S['D Solo en SP2'] || []).push({ ...row, riesgos: risks(row).join('; ') || '—', accion: act });
  }
  // F. Active SP2 users whose login no longer exists
  for (const [k, d] of u2) {
    if (isDel(d.get('status')) || auth.has(d.id)) continue;
    const row = { codigo: k, uid: d.id, nombre: `${d.get('firstName') || ''} ${d.get('lastName') || ''}`.trim(), correo: d.get('email') || '', creada: iso(d.get('createdAt')).slice(0, 10), fichaSP1: c1.has(k) ? (c1.get(k).get('status') || 'active') : 'no', ...sp1Refs(k), ...sp2Refs(d.id) };
    add('F Sin login', row, 'recrear login con el mismo correo (sin enviar nada)', 'Eliminar de los dos sistemas (respaldo completo)');
  }
  // G. SP1-only (active, with profile): SP2 account missing
  for (const [k, c] of c1) {
    if (u2.has(k) || isDel(c.get('status')) || !hasProfile(c.data())) continue;
    const uid = c.get('firebaseUid'); const u = uid ? u2ByUid.get(uid) : null;
    const row = { codigo: k, nombre: c.get('fullName') || '', correo: c.get('email') || '', firebaseUid: uid || '', usuarioSP2DeEseUid: u ? `${u.id} código=${u.get('slCode') || '(vacío)'} campos=${Object.keys(u.data()).length}` : 'no', ...(uid ? loginOf(uid) : {}), ...sp1Refs(k), ...(uid ? sp2Refs(uid) : {}) };
    const act = u && !hasProfile(u.data()) ? 'RESTAURAR perfil SP2 (quedó vacío) desde SP1 + login'
      : u ? `SP2 usa otro código (${u.get('slCode')}) — mismo cliente: unificar código`
        : 'Buscar cuenta SP2 de la misma persona (correo/cédula) — decidir';
    (S['G Solo en SP1'] = S['G Solo en SP1'] || []).push({ ...row, riesgos: risks(row).join('; ') || '—', accion: act });
  }

  const wb = XLSX.utils.book_new();
  const resumen = Object.entries(S).map(([h, rows]) => ({ grupo: h, cuentas: rows.length, REVISAR: rows.filter((r) => /REVISAR|CONFLICTO|decidir/.test(r.accion)).length, seguras: rows.filter((r) => !/REVISAR|CONFLICTO|decidir/.test(r.accion)).length }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
  for (const [h, rows] of Object.entries(S)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map((r) => { const { sheet, ...rest } = r; return rest; })), h.slice(0, 31));
  const out = path.join(__dirname, '../../audit-output', `plan-paridad-cuentas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  XLSX.writeFile(wb, out);
  console.table(resumen);
  console.log(`SP1 customers ${custs.length} · SP2 users ${users.length} · logins ${auth.size} · temp_customers ${temps.length}`);
  console.log('Plan (nada escrito):', out);
})().catch((e) => { console.error(e); process.exit(1); });
