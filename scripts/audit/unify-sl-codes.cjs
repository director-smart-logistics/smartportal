/**
 * Unifies TWO SL codes of the SAME customer (same login / SP2 uid) into one, in SP1 and SP2.
 * Case: the 2026-01-11 migration gave the SP2 profile a new code while SP1 kept the old one (often two SP1
 * fichas pointing to the same uid), so packages, invoices and pre-alerts end up split between two codes and
 * Nova / the pre-alert matching never see them together.
 * Simulation by default; --fix applies; --rollback <snapshot.json> puts everything back (logins first).
 *
 * --from <code that goes away> --to <code that stays>
 * SP1  customers/<TO> kept (created from <FROM> if missing); empty fields of <TO> filled from <FROM> (never
 *      overwrites); <FROM> kept in previousSlCodes + searchTokens so admins still find the customer by it.
 *      packages, invoices (numbers never change), Nova learning (duplicates summed), manifest_consolidation,
 *      manifest_encomiendas and the rows of Nova manifests → <TO>. customers/<FROM> copied to customers_merged
 *      and removed LAST.
 * SP2  users/<uid>.slCode = <TO>; shipments, pre_alerts, invoices → <TO>; slcode_index/<TO> → uid,
 *      slcode_index/<FROM> kept pointing to the same uid (renamedTo); the login's slCode claim = <TO>.
 * Invoices in SP2 are re-synced by SP1's invoice trigger while this runs → each is updated in its own
 * transaction, only if it still exists and still has the old code.
 *
 * Run: node scripts/audit/unify-sl-codes.cjs --from SL<old> --to SL<kept> [--fix]
 *      node scripts/audit/unify-sl-codes.cjs --rollback audit-output/unify/<file>.json
 */
'use strict';
const path = require('path');
const fs = require('fs');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore, Timestamp } = require(path.join(A, 'lib/firestore'));
const { getAuth } = require(path.join(A, 'lib/auth'));

const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const EMU = process.env.EMU === '1';
const FIX = args.includes('--fix');
const ROLLBACK = arg('--rollback');
const OUTDIR = process.env.OUTDIR || path.join(__dirname, '../../audit-output/unify');
fs.mkdirSync(OUTDIR, { recursive: true });
const a2 = initializeApp(EMU ? { projectId: 'demo-sp-qa' } : { projectId: 'smart-portal-2', credential: applicationDefault() }, 'sp2');
const a1 = initializeApp(EMU ? { projectId: 'demo-sp-qa' } : { projectId: 'smart-portal-admin', credential: applicationDefault() }, 'sp1');
const DBS = { sp2: getFirestore(a2), sp1: getFirestore(a1, 'portal') };
const auth2 = getAuth(a2);
const encode = (v) => v instanceof Timestamp ? { __ts: [v.seconds, v.nanoseconds] } : Array.isArray(v) ? v.map(encode)
  : v && typeof v === 'object' && v.constructor?.name === 'DocumentReference' ? { __ref: v.path }
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) : v;
const decode = (db, v) => v && v.__ts ? new Timestamp(v.__ts[0], v.__ts[1]) : v && v.__ref ? db.doc(v.__ref)
  : Array.isArray(v) ? v.map((x) => decode(db, x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(db, x)])) : v;
// Customer-code fields inside manifest rows, at any depth (rows carry e.g. preAlert.slCode / preAlertSlCode).
const CODE_KEYS = new Set(['slCode', 'clientSlCode', 'customerId', 'preAlertSlCode', 'customerSlCode', 'userSlCode']);
function hasCode(v, FROM) { if (Array.isArray(v)) return v.some((x) => hasCode(x, FROM)); if (v && typeof v === 'object' && !(v instanceof Timestamp)) return Object.entries(v).some(([k, x]) => (CODE_KEYS.has(k) && String(x ?? '').toUpperCase() === FROM) || hasCode(x, FROM)); return false; }
function swapCode(v, FROM, TO, count) { if (Array.isArray(v)) return v.map((x) => swapCode(x, FROM, TO, count)); if (v && typeof v === 'object' && !(v instanceof Timestamp)) { const o = {}; for (const [k, x] of Object.entries(v)) { if (CODE_KEYS.has(k) && typeof x === 'string' && x.toUpperCase() === FROM) { o[k] = TO; count.n++; } else o[k] = swapCode(x, FROM, TO, count); } return o; } return v; }
const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !Object.keys(v).length);

async function rollback(file) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\nREVERSA ${snap.to} → ${snap.from} (${EMU ? 'EMULADOR' : 'PRODUCCIÓN'}) · ${snap.docs.length} documentos`);
  if (snap.claims) { await auth2.setCustomUserClaims(snap.claims.uid, snap.claims.before); console.log(`  ✔ login ${snap.claims.uid}: código ${snap.claims.before?.slCode ?? '(ninguno)'} otra vez`); }
  const first = (d) => (d.path === `customers/${snap.from}` ? 0 : d.path === `customers/${snap.to}` ? 2 : 1);
  for (const d of [...snap.docs].sort((x, y) => first(x) - first(y))) {
    const db = DBS[d.db]; const ref = db.doc(d.path);
    if (d.before === null) await ref.delete(); else await ref.set(decode(db, d.before));
  }
  console.log('✅ Reversa completa.');
}

async function main() {
  const FROM = String(arg('--from') || '').trim().toUpperCase(); const TO = String(arg('--to') || '').trim().toUpperCase();
  if (!/^SL\d+$/.test(FROM) || !/^SL\d+$/.test(TO) || FROM === TO) { console.error('Uso: --from SL<n> --to SL<n> [--fix]'); process.exit(1); }
  const { sp1: db1, sp2: db2 } = DBS; const now = new Date().toISOString(); const stamp = now.replace(/[:.]/g, '-');
  const stop = (m) => { console.log(`\n⛔ ${m}\nNo se cambió nada.`); process.exit(2); };
  const touched = new Map(); const w1 = []; const w2 = []; const ops = [];
  const say = (s) => { ops.push(s); console.log(`  ${FIX ? '✔' : '·'} ${s}`); };
  const touch = (k, ref) => touched.set(`${k}|${ref.path}`, { db: k, path: ref.path, ref });
  const q = async (db, c, f, v) => (await db.collection(c).where(f, '==', v).get()).docs;
  const union = async (db, c, fields, v) => { const m = new Map(); for (const f of fields) (await q(db, c, f, v)).forEach((d) => m.set(d.id, d)); return [...m.values()]; };
  console.log(`\n${FIX ? 'APLICAR' : 'SIMULACIÓN'} · ${FROM} → ${TO} · ${EMU ? 'EMULADOR' : 'PRODUCCIÓN'}\n`);

  // ── Preconditions: one customer, one login ──
  const fFrom = await db1.collection('customers').doc(FROM).get(); const fTo = await db1.collection('customers').doc(TO).get();
  if (!fFrom.exists && !fTo.exists) stop('SP1 no tiene ficha con ninguno de los dos códigos.');
  const usersFrom = await q(db2, 'users', 'slCode', FROM); const usersTo = await q(db2, 'users', 'slCode', TO);
  const users = [...usersFrom, ...usersTo];
  if (users.length !== 1) stop(`SP2: se espera UNA cuenta con ${FROM} o ${TO} (hay ${users.length}: ${users.map((d) => d.id + '=' + d.get('slCode')).join(', ')}).`);
  const user = users[0]; const uid = user.id;
  for (const f of [fFrom, fTo]) if (f.exists && f.get('firebaseUid') && f.get('firebaseUid') !== uid) stop(`SP1 customers/${f.id} apunta a otra cuenta (${f.get('firebaseUid')}).`);
  if (!fFrom.exists && !fTo.exists) stop('Sin fichas.');
  const idxTo = await db2.collection('slcode_index').doc(TO).get();
  if (idxTo.exists && idxTo.get('uid') !== uid) stop(`slcode_index/${TO} pertenece a otra cuenta.`);
  const base = (fTo.exists ? fTo : fFrom).data();
  console.log(`Cliente: ${base.fullName || [base.firstName, base.lastName].filter(Boolean).join(' ')} · cuenta SP2 ${uid} (hoy ${user.get('slCode')})\n`);

  // ── SP1 ──
  console.log('SP1:');
  const keepRef = db1.collection('customers').doc(TO); touch('sp1', keepRef);
  const src = fFrom.exists ? fFrom.data() : {}; const dst = fTo.exists ? fTo.data() : { ...src };
  const fill = {}; for (const [k, v] of Object.entries(src)) if (!['id', 'slCode', 'searchTokens', 'previousSlCodes', 'createdAt', 'updatedAt'].includes(k) && isEmpty(dst[k]) && !isEmpty(v)) fill[k] = v;
  const keepDoc = { ...dst, ...fill, id: TO, slCode: TO, firebaseUid: uid, previousSlCodes: [...new Set([...(dst.previousSlCodes || []), ...(src.previousSlCodes || []), FROM])], searchTokens: [...new Set([...(dst.searchTokens || []), ...(src.searchTokens || []), FROM.toLowerCase(), TO.toLowerCase()])], slCodesUnifiedAt: now, updatedAt: now };
  w1.push((b) => b.set(keepRef, keepDoc));
  say(`customers/${TO} ${fTo.exists ? 'se mantiene' : 'se crea desde ' + FROM}${Object.keys(fill).length ? ` · completa campos vacíos: ${Object.keys(fill).join(', ')}` : ''} · ${FROM} queda como código anterior (se puede buscar)`);
  const setIf = (d, fields) => Object.fromEntries(fields.filter((f) => String(d.get(f) ?? '').trim().toUpperCase() === FROM).map((f) => [f, TO]));
  const pk = await union(db1, 'packages', ['slCode', 'clientSlCode', 'customerId'], FROM); pk.forEach((d) => { touch('sp1', d.ref); w1.push((b) => b.update(d.ref, { ...setIf(d, ['slCode', 'clientSlCode', 'customerId']), slCodeUnifiedFrom: FROM })); });
  const inv = await union(db1, 'invoices', ['slCode', 'clientSlCode', 'customerId'], FROM); inv.forEach((d) => { touch('sp1', d.ref); const u = { ...setIf(d, ['slCode', 'clientSlCode', 'customerId']), slCodeUnifiedFrom: FROM }; if (d.get('customer') && typeof d.get('customer') === 'object' && String(d.get('customer.slCode') || '').toUpperCase() === FROM) u['customer.slCode'] = TO; w1.push((b) => b.update(d.ref, u)); });
  let nova = 0;
  const keyOf = (d) => String(d.get('normalizedName') || d.get('rawName') || d.get('pattern') || '').toUpperCase().trim();
  for (const c of ['match_feedback', 'manifest_learning_patterns']) {
    const keepBy = new Map((await q(db1, c, 'slCode', TO)).map((d) => [keyOf(d), d]));
    for (const d of await q(db1, c, 'slCode', FROM)) {
      nova++; touch('sp1', d.ref); const twin = keyOf(d) && keepBy.get(keyOf(d));
      if (twin) { touch('sp1', twin.ref); const cnt = (x) => Number(x.get('hitCount') ?? x.get('hits')) || 0; const hitCount = cnt(twin) + cnt(d); w1.push((b) => { b.update(twin.ref, { hitCount, updatedAt: now, slCodeUnifiedFrom: FROM }); b.delete(d.ref); }); }
      else w1.push((b) => b.update(d.ref, { slCode: TO, slCodeUnifiedFrom: FROM, updatedAt: now }));
    }
  }
  for (const c of ['manifest_consolidation', 'manifest_encomiendas', 'pre_alerts']) for (const d of await q(db1, c, 'slCode', FROM)) { touch('sp1', d.ref); w1.push((b) => b.update(d.ref, { slCode: TO, slCodeUnifiedFrom: FROM })); }
  const manifests = [];
  { let last = null; for (;;) { let qq = db1.collection('manifests').orderBy('__name__').limit(200); if (last) qq = qq.startAfter(last); const s = await qq.get();
    for (const d of s.docs) if (hasCode(d.data(), FROM)) { manifests.push(d.ref); touch('sp1', d.ref); }
    if (s.size < 200) break; last = s.docs[s.docs.length - 1]; } }
  say(`paquetes ${pk.length} · facturas ${inv.length} (números sin cambio) · aprendizaje Nova ${nova} · manifiestos de Nova ${manifests.length}`);
  const mergedRef = db1.collection('customers_merged').doc(`${FROM}_unified_into_${TO}_${stamp}`);
  if (fFrom.exists) { touch('sp1', fFrom.ref); touch('sp1', mergedRef); say(`customers/${FROM} se quita AL FINAL (copia en customers_merged)`); }

  // ── SP2 ──
  console.log('\nSP2:');
  const u = user.data();
  touch('sp2', user.ref); w2.push((b) => b.update(user.ref, { slCode: TO, previousSlCodes: [...new Set([...(u.previousSlCodes || []), FROM])], searchTokens: [...new Set([...(u.searchTokens || []), FROM.toLowerCase(), TO.toLowerCase()])], slCodesUnifiedAt: now, updatedAt: now, profileLastUpdatedBy: 'admin-sl-unify' }));
  say(`cuenta ${uid}: código ${u.slCode}${u.slCode === TO ? ' (ya es el que queda)' : ` → ${TO}`}`);
  let n2 = 0; for (const c of ['shipments', 'pre_alerts']) for (const d of await q(db2, c, 'slCode', FROM)) { n2++; touch('sp2', d.ref); w2.push((b) => b.update(d.ref, { slCode: TO, slCodeUnifiedFrom: FROM })); }
  const sp2Inv = await union(db2, 'invoices', ['slCode', 'clientSlCode'], FROM); sp2Inv.forEach((d) => touch('sp2', d.ref));
  say(`envíos y pre-alertas ${n2} · facturas SP2 ${sp2Inv.length}`);
  const idxT = db2.collection('slcode_index').doc(TO); const idxF = db2.collection('slcode_index').doc(FROM);
  touch('sp2', idxT); w2.push((b) => b.set(idxT, { uid, claimedAt: now, source: 'admin-sl-unify' }, { merge: true }));
  if ((await idxF.get()).exists) { touch('sp2', idxF); w2.push((b) => b.set(idxF, { uid, renamedTo: TO, renamedAt: now }, { merge: true })); }
  const login = await auth2.getUser(uid).catch(() => null); const claims = login ? { uid, before: login.customClaims || null } : null;
  if (claims) say(`login ${login.email}: código ${claims.before?.slCode ?? '(ninguno)'} → ${TO}`);
  const logRef = db2.collection('account_restore_log').doc(`unify_${stamp}_${FROM}_${TO}`); touch('sp2', logRef);
  if (w1.length > 450 || w2.length > 450) stop('Demasiadas escrituras para una sola operación.');
  if (!FIX) { console.log(`\nSimulación: ${touched.size} documentos. No se cambió nada.`); return; }

  const docs = []; for (const t of touched.values()) { const s = await t.ref.get(); docs.push({ db: t.db, path: t.path, before: s.exists ? encode(s.data()) : null }); }
  const file = path.join(OUTDIR, `${stamp}_${FROM}_into_${TO}.json`);
  fs.writeFileSync(file, JSON.stringify({ from: FROM, to: TO, uid, at: now, env: EMU ? 'emulator' : 'production', claims, ops, docs }, null, 1));
  console.log(`\nRespaldo para reversa: ${file} (${docs.length} documentos)`);
  const b1 = db1.batch(); w1.forEach((w) => w(b1)); await b1.commit(); console.log('  ✔ SP1: ficha, paquetes, facturas y Nova');
  let rows = 0;
  for (const ref of manifests) rows += await db1.runTransaction(async (tx) => { const s = await tx.get(ref); const x = s.data() || {}; const upd = {}; const count = { n: 0 }; for (const [k, v] of Object.entries(x)) if (hasCode(v, FROM)) upd[k] = swapCode(v, FROM, TO, count); if (count.n) tx.update(ref, upd); return count.n; });
  console.log(`  ✔ SP1: ${rows} filas en ${manifests.length} manifiestos`);
  const b2 = db2.batch(); w2.forEach((w) => w(b2)); b2.set(logRef, { from: FROM, to: TO, uid, at: now, snapshot: path.basename(file), ops }); await b2.commit(); console.log('  ✔ SP2: cuenta, envíos, pre-alertas e índice');
  let fi = 0; for (const d of sp2Inv) fi += await db2.runTransaction(async (tx) => { const s = await tx.get(d.ref); if (!s.exists) return 0; const upd = setIf(s, ['slCode', 'clientSlCode']); if (!Object.keys(upd).length) return 0; tx.update(d.ref, { ...upd, slCodeUnifiedFrom: FROM }); return 1; });
  console.log(`  ✔ SP2: facturas actualizadas aquí: ${fi} (las demás las rehízo la sincronización de SP1)`);
  if (claims) { await auth2.setCustomUserClaims(uid, { ...(claims.before || {}), slCode: TO }); console.log('  ✔ login: código actualizado'); }
  await new Promise((r) => setTimeout(r, 8000));
  if (fFrom.exists) { const cur = await fFrom.ref.get(); if (cur.exists) { await mergedRef.set({ ...cur.data(), _unified: { into: TO, at: now, snapshot: path.basename(file) } }); await fFrom.ref.delete(); } console.log(`  ✔ SP1: customers/${FROM} quitada (copia en customers_merged)`); }
  await new Promise((r) => setTimeout(r, 12000));
  const left = { fichaVieja: (await db1.collection('customers').doc(FROM).get()).exists, paquetes: (await union(db1, 'packages', ['slCode', 'customerId'], FROM)).length, facturas: (await q(db1, 'invoices', 'slCode', FROM)).length, usuarioSP2: (await q(db2, 'users', 'slCode', FROM)).length, envios: (await q(db2, 'shipments', 'slCode', FROM)).length, prealertas: (await q(db2, 'pre_alerts', 'slCode', FROM)).length, facturasSP2: (await q(db2, 'invoices', 'clientSlCode', FROM)).length };
  const keep = await db1.collection('customers').doc(TO).get(); const u2 = await db2.collection('users').doc(uid).get();
  const bad = Object.values(left).some((v) => v === true || v > 0) || !keep.exists || keep.get('status') === 'deleted' || u2.get('slCode') !== TO;
  console.log(bad ? `\n⚠ Revisar: ${JSON.stringify(left)} · SP1 ${TO}=${keep.exists && keep.get('status')} · SP2=${u2.get('slCode')}` : `\n✅ ${FROM} unificado en ${TO} en SP1 y SP2. Reversa: node scripts/audit/unify-sl-codes.cjs --rollback "${file}"`);
}

(ROLLBACK ? rollback(ROLLBACK) : main()).then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
