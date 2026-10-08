/**
 * Renames ONE customer's code in SP1 and SP2 (e.g. a legacy "1458" without the SL prefix → "SL1458").
 * Simulation by default; --fix applies; --rollback <snapshot.json> puts everything back.
 *
 * Why: the SL code is the customer's identity in both systems; the pre-alert resolver turns digits into
 * "SL"+digits, so a code without the prefix points to an account that does not exist.
 *
 * What changes (nothing is deleted except the old SP1 ficha, which is copied to customers_merged):
 *   SP1  customers/<NEW> = full copy of customers/<OLD> with the new code (old code kept in
 *        previousSlCodes + searchTokens so admins still find it by the old number); packages and invoices;
 *        the rows of Nova manifests (manifests/*: arrays of rows with slCode) — each manifest in its own
 *        transaction, only this customer's rows, so a concurrent edit in Nova is never overwritten;
 *        slCode / clientSlCode / customerId; Nova learning; manifest_consolidation / manifest_encomiendas.
 *        Invoice NUMBERS are never changed (fiscal documents).
 *   SP2  users/<uid>.slCode (+ search tokens); shipments, pre_alerts and invoices slCode / clientSlCode;
 *        slcode_index/<NEW> (and <OLD> repointed); the login's slCode claim.
 *   Logs (status_corrections, sync logs) are history and stay as they were.
 * Order: SP1 new ficha + data → SP2 → login claim → SP1 old ficha removed last (its delete trigger only
 * purges learning of the OLD code, already moved). One snapshot + one log doc per run.
 *
 * Run: node scripts/audit/rename-sl-code.cjs --from 1458 --to SL1458 [--fix]
 *      node scripts/audit/rename-sl-code.cjs --from 1458 --to SL1458 --resume audit-output/renames/<file>.json
 *        (finishes a run that stopped after SP1: SP2, login, old ficha — reads the current state)
 *      node scripts/audit/rename-sl-code.cjs --rollback audit-output/renames/<file>.json
 *      EMU=1 FIRESTORE_EMULATOR_HOST=… FIREBASE_AUTH_EMULATOR_HOST=… (emulator)
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
const OUTDIR = process.env.OUTDIR || path.join(__dirname, '../../audit-output/renames');
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

async function rollback(file) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\nREVERSA ${snap.from} ← ${snap.to} (${EMU ? 'EMULADOR' : 'PRODUCCIÓN'}) · ${snap.docs.length} documentos`);
  if (snap.claims) { await auth2.setCustomUserClaims(snap.claims.uid, snap.claims.before); console.log(`  ✔ login ${snap.claims.uid}: código ${snap.claims.before?.slCode} otra vez`); }
  // SP1 old ficha first (so SP2's push lands on it), then everything else, the new ficha last.
  const order = [...snap.docs].sort((x, y) => (x.path === `customers/${snap.from}` ? -1 : y.path === `customers/${snap.from}` ? 1 : 0) || (x.path === `customers/${snap.to}` ? 1 : y.path === `customers/${snap.to}` ? -1 : 0));
  for (const d of order) {
    const db = DBS[d.db]; const ref = db.doc(d.path);
    if (d.before === null) await ref.delete(); else await ref.set(decode(db, d.before));
  }
  console.log('✅ Reversa completa.');
}

async function main() {
  const FROM = String(arg('--from') || '').trim(); const TO = String(arg('--to') || '').trim().toUpperCase();
  if (!FROM || !/^SL\d+$/.test(TO) || FROM.toUpperCase() === TO) { console.error('Uso: --from <código actual> --to SL<número> [--fix]'); process.exit(1); }
  const { sp1: db1, sp2: db2 } = DBS; const now = new Date().toISOString(); const stamp = now.replace(/[:.]/g, '-');
  const stop = (m) => { console.log(`\n⛔ ${m}\nNo se cambió nada.`); process.exit(2); };
  const touched = new Map(); const writes = { sp1: [], sp2: [] }; const ops = [];
  const say = (s) => { ops.push(s); console.log(`  ${FIX ? '✔' : '·'} ${s}`); };
  const touch = (k, ref) => touched.set(`${k}|${ref.path}`, { db: k, path: ref.path, ref });
  const q = async (db, c, f, v) => (await db.collection(c).where(f, '==', v).get()).docs;
  const union = async (db, c, fields, v) => { const m = new Map(); for (const f of fields) (await q(db, c, f, v)).forEach((d) => m.set(d.id, d)); return [...m.values()]; };
  console.log(`\n${FIX ? 'APLICAR' : 'SIMULACIÓN'} · ${FROM} → ${TO} · ${EMU ? 'EMULADOR' : 'PRODUCCIÓN'}\n`);

  // Preconditions: exactly one account with FROM in each system, TO free everywhere.
  const RESUME = arg('--resume');
  const oldFicha = await db1.collection('customers').doc(FROM).get();
  if (!oldFicha.exists) stop(`SP1: no existe customers/${FROM}.`);
  if (RESUME) return resume(RESUME, FROM, TO, oldFicha);
  const users = await q(db2, 'users', 'slCode', FROM);
  if (users.length !== 1) stop(`SP2: se espera 1 usuario con ${FROM} (hay ${users.length}).`);
  const user = users[0]; const uid = user.id;
  if (oldFicha.get('firebaseUid') && oldFicha.get('firebaseUid') !== uid) stop(`La ficha SP1 apunta a otro uid (${oldFicha.get('firebaseUid')}).`);
  if ((await db1.collection('customers').doc(TO).get()).exists) stop(`SP1: ${TO} ya existe.`);
  if ((await q(db2, 'users', 'slCode', TO)).length) stop(`SP2: ${TO} ya está en uso.`);
  for (const [db, c] of [[db1, 'packages'], [db1, 'invoices'], [db2, 'shipments'], [db2, 'pre_alerts']]) if ((await q(db, c, 'slCode', TO)).length) stop(`${c} ya tiene datos con ${TO}.`);
  const idxTo = await db2.collection('slcode_index').doc(TO).get();
  if (idxTo.exists && idxTo.get('uid') !== uid) stop(`slcode_index/${TO} pertenece a otro uid.`);
  const name = oldFicha.get('fullName') || [oldFicha.get('firstName'), oldFicha.get('lastName')].filter(Boolean).join(' ');
  console.log(`Cliente: ${name} · uid ${uid}\n`);

  // SP1
  console.log('SP1:');
  const x = oldFicha.data();
  const prev = [...new Set([...(x.previousSlCodes || []), FROM])];
  const tokens = [...new Set([...(x.searchTokens || []), FROM.toLowerCase(), TO.toLowerCase()])];
  const newRef = db1.collection('customers').doc(TO);
  touch('sp1', newRef); writes.sp1.push((b) => b.set(newRef, { ...x, id: TO, slCode: TO, previousSlCodes: prev, searchTokens: tokens, slCodeRenamedAt: now, slCodeRenamedFrom: FROM, updatedAt: now }));
  say(`customers/${TO}: copia completa de customers/${FROM} con el código nuevo (el número viejo sigue sirviendo para buscarla)`);
  const setIf = (d, fields) => Object.fromEntries(fields.filter((f) => String(d.get(f) ?? '').trim() === FROM).map((f) => [f, TO]));
  for (const d of await union(db1, 'packages', ['slCode', 'clientSlCode', 'customerId'], FROM)) { touch('sp1', d.ref); writes.sp1.push((b) => b.update(d.ref, { ...setIf(d, ['slCode', 'clientSlCode', 'customerId']), slCodeRenamedFrom: FROM })); }
  for (const d of await union(db1, 'invoices', ['slCode', 'clientSlCode', 'customerId'], FROM)) {
    touch('sp1', d.ref); const upd = { ...setIf(d, ['slCode', 'clientSlCode', 'customerId']), slCodeRenamedFrom: FROM };
    if (d.get('customer') && typeof d.get('customer') === 'object' && String(d.get('customer.slCode') || '') === FROM) upd['customer.slCode'] = TO;
    writes.sp1.push((b) => b.update(d.ref, upd));
  }
  for (const c of ['match_feedback', 'manifest_learning_patterns', 'manifest_consolidation', 'manifest_encomiendas']) for (const d of await q(db1, c, 'slCode', FROM)) { touch('sp1', d.ref); writes.sp1.push((b) => b.update(d.ref, { slCode: TO, slCodeRenamedFrom: FROM })); }
  const n1 = (c) => [...touched.values()].filter((t) => t.db === 'sp1' && t.path.startsWith(c + '/')).length;
  say(`paquetes: ${n1('packages')} · facturas: ${n1('invoices')} (números de factura sin cambio) · Nova/manifiestos: ${n1('match_feedback') + n1('manifest_learning_patterns') + n1('manifest_consolidation') + n1('manifest_encomiendas')}`);
  // Nova manifests keep rows (customers[], packages[], …) with the customer's code.
  const manifestHits = [];
  { let last = null; for (;;) { let qq = db1.collection('manifests').orderBy('__name__').limit(200); if (last) qq = qq.startAfter(last); const s = await qq.get();
    for (const d of s.docs) { const x = d.data(); const fields = Object.entries(x).filter(([, v]) => Array.isArray(v) && v.some((r) => r && typeof r === 'object' && String(r.slCode ?? '') === FROM)).map(([k]) => k); if (fields.length) manifestHits.push({ ref: d.ref, fields }); }
    if (s.size < 200) break; last = s.docs[s.docs.length - 1]; } }
  for (const m of manifestHits) touch('sp1', m.ref);
  say(`manifiestos de Nova con filas de este cliente: ${manifestHits.length} (${manifestHits.slice(0, 6).map((m) => m.ref.id).join(', ')}${manifestHits.length > 6 ? ', …' : ''})`);
  const mergedRef = db1.collection('customers_merged').doc(`${FROM}_renamed_${stamp}`);
  touch('sp1', oldFicha.ref); touch('sp1', mergedRef);
  say(`customers/${FROM}: se quita AL FINAL (copia en customers_merged)`);

  // SP2
  console.log('\nSP2:');
  const u = user.data(); const utoks = [...new Set([...(u.searchTokens || []), FROM.toLowerCase(), TO.toLowerCase()])];
  touch('sp2', user.ref); writes.sp2.push((b) => b.update(user.ref, { slCode: TO, previousSlCodes: [...new Set([...(u.previousSlCodes || []), FROM])], searchTokens: utoks, slCodeRenamedAt: now, updatedAt: now, profileLastUpdatedBy: 'admin-sl-rename' }));
  say(`users/${uid}: código ${FROM} → ${TO}`);
  for (const c of ['shipments', 'pre_alerts']) for (const d of await q(db2, c, 'slCode', FROM)) { touch('sp2', d.ref); writes.sp2.push((b) => b.update(d.ref, { slCode: TO, slCodeRenamedFrom: FROM })); }
  // SP2 invoices are re-synced by SP1's invoice trigger while this runs (docs recreated/removed): each one is
  // updated in its own transaction, only if it still exists and still has the old code.
  const sp2Invoices = await union(db2, 'invoices', ['slCode', 'clientSlCode'], FROM); sp2Invoices.forEach((d) => touch('sp2', d.ref));
  const n2 = (c) => [...touched.values()].filter((t) => t.db === 'sp2' && t.path.startsWith(c + '/')).length;
  say(`envíos: ${n2('shipments')} · pre-alertas: ${n2('pre_alerts')} · facturas SP2: ${sp2Invoices.length} (las que la sincronización de SP1 no haya rehecho ya)`);
  const idxNew = db2.collection('slcode_index').doc(TO); const idxOld = db2.collection('slcode_index').doc(FROM);
  touch('sp2', idxNew); writes.sp2.push((b) => b.set(idxNew, { uid, claimedAt: now, source: 'admin-sl-rename', renamedFrom: FROM }));
  if ((await idxOld.get()).exists) { touch('sp2', idxOld); writes.sp2.push((b) => b.set(idxOld, { uid, renamedTo: TO, renamedAt: now }, { merge: true })); }
  say(`slcode_index/${TO} → la cuenta${(await idxOld.get()).exists ? ` · slcode_index/${FROM} queda apuntando a la misma cuenta (renombrado)` : ''}`);
  const login = await auth2.getUser(uid).catch(() => null);
  const claims = login ? { uid, before: login.customClaims || null } : null;
  if (claims) say(`login ${login.email}: código en el login ${claims.before?.slCode ?? '(ninguno)'} → ${TO}`);
  const logRef = db2.collection('account_restore_log').doc(`rename_${stamp}_${FROM}_${TO}`); touch('sp2', logRef);
  if (writes.sp1.length > 450 || writes.sp2.length > 450) stop('Demasiadas escrituras para una sola operación.');
  if (!FIX) { console.log(`\nSimulación: ${touched.size} documentos. No se cambió nada.`); return; }

  const docs = [];
  for (const t of touched.values()) { const s = await t.ref.get(); docs.push({ db: t.db, path: t.path, before: s.exists ? encode(s.data()) : null }); }
  const file = path.join(OUTDIR, `${stamp}_${FROM}_to_${TO}.json`);
  fs.writeFileSync(file, JSON.stringify({ from: FROM, to: TO, uid, at: now, env: EMU ? 'emulator' : 'production', claims, ops, docs }, null, 1));
  console.log(`\nRespaldo para reversa: ${file} (${docs.length} documentos)`);
  const b1 = db1.batch(); writes.sp1.forEach((w) => w(b1)); await b1.commit(); console.log('  ✔ SP1: ficha nueva y datos con el código nuevo');
  let rows = 0;
  for (const m of manifestHits) {
    rows += await db1.runTransaction(async (tx) => {
      const snap = await tx.get(m.ref); const x = snap.data() || {}; const upd = {}; let n = 0;
      for (const [k, v] of Object.entries(x)) if (Array.isArray(v) && v.some((r) => r && typeof r === 'object' && String(r.slCode ?? '') === FROM)) {
        upd[k] = v.map((r) => (r && typeof r === 'object' && String(r.slCode ?? '') === FROM) ? (n++, { ...r, slCode: TO }) : r);
      }
      if (n) tx.update(m.ref, upd);
      return n;
    });
  }
  console.log(`  ✔ SP1: ${rows} filas en ${manifestHits.length} manifiestos de Nova con el código nuevo`);
  if (process.env.QA_STOP_AFTER_SP1 === '1') throw new Error('QA: corte simulado después de SP1');
  await applySp2();
  async function applySp2() {
    const b2 = db2.batch(); writes.sp2.forEach((w) => w(b2)); b2.set(logRef, { from: FROM, to: TO, uid, at: now, snapshot: path.basename(file), ops }, { merge: true }); await b2.commit();
    let inv = 0;
    for (const d of sp2Invoices) inv += await db2.runTransaction(async (tx) => { const s = await tx.get(d.ref); if (!s.exists) return 0; const upd = setIf(s, ['slCode', 'clientSlCode']); if (!Object.keys(upd).length) return 0; tx.update(d.ref, { ...upd, slCodeRenamedFrom: FROM }); return 1; });
    console.log(`  ✔ SP2: cuenta, envíos, pre-alertas e índice · facturas actualizadas aquí: ${inv}`);
  }
  if (claims) { await auth2.setCustomUserClaims(uid, { ...(claims.before || {}), slCode: TO }); console.log('  ✔ login: código actualizado'); }
  await new Promise((r) => setTimeout(r, 8000)); // let SP2's push reach the NEW SP1 ficha first
  await mergedRef.set({ ...(await oldFicha.ref.get()).data(), _renamed: { to: TO, at: now, snapshot: path.basename(file) } });
  await oldFicha.ref.delete(); console.log(`  ✔ SP1: customers/${FROM} quitada (copia en customers_merged)`);
  await new Promise((r) => setTimeout(r, 15000));
  const back = await db1.collection('customers').doc(FROM).get();
  const left = (await union(db1, 'packages', ['slCode', 'customerId'], FROM)).length + (await q(db2, 'shipments', 'slCode', FROM)).length + (await q(db2, 'users', 'slCode', FROM)).length;
  console.log(back.exists || left ? `\n⚠ Quedó algo con ${FROM}: ficha=${back.exists} datos=${left}` : `\n✅ ${FROM} → ${TO} en los dos sistemas. Reversa: node scripts/audit/rename-sl-code.cjs --rollback "${file}"`);
}

/** Finishes a run that stopped after the SP1 phase (SP1 already has the new code): SP2, login, old ficha. */
async function resume(file, FROM, TO, oldFicha) {
  const { sp1: db1, sp2: db2 } = DBS; const now = new Date().toISOString();
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (snap.from !== FROM || snap.to !== TO) { console.log('⛔ El respaldo es de otro cambio.'); process.exit(2); }
  if (!(await db1.collection('customers').doc(TO).get()).exists) { console.log(`⛔ SP1 no tiene customers/${TO}: la parte de SP1 no se aplicó; usa el cambio normal.`); process.exit(2); }
  const uid = snap.uid; const q = async (db, c, f, v) => (await db.collection(c).where(f, '==', v).get()).docs;
  console.log(`\nCOMPLETAR ${FROM} → ${TO} · ${EMU ? 'EMULADOR' : 'PRODUCCIÓN'} · uid ${uid}`);
  const snapPaths = new Set(snap.docs.map((d) => `${d.db}|${d.path}`));
  const extra = []; // docs not in the original snapshot (e.g. re-synced invoices) → saved for the rollback
  const keep = async (k, ref) => { if (!snapPaths.has(`${k}|${ref.path}`)) { const s = await ref.get(); extra.push({ db: k, path: ref.path, before: s.exists ? encode(s.data()) : null }); snapPaths.add(`${k}|${ref.path}`); } };
  const user = await db2.collection('users').doc(uid).get(); const u = user.data() || {};
  const b = db2.batch(); let n = 0;
  if (u.slCode === FROM) { await keep('sp2', user.ref); b.update(user.ref, { slCode: TO, previousSlCodes: [...new Set([...(u.previousSlCodes || []), FROM])], searchTokens: [...new Set([...(u.searchTokens || []), FROM.toLowerCase(), TO.toLowerCase()])], slCodeRenamedAt: now, updatedAt: now, profileLastUpdatedBy: 'admin-sl-rename' }); n++; }
  for (const c of ['shipments', 'pre_alerts']) for (const d of await q(db2, c, 'slCode', FROM)) { await keep('sp2', d.ref); b.update(d.ref, { slCode: TO, slCodeRenamedFrom: FROM }); n++; }
  const idxNew = db2.collection('slcode_index').doc(TO); const idxOld = db2.collection('slcode_index').doc(FROM);
  await keep('sp2', idxNew); b.set(idxNew, { uid, claimedAt: now, source: 'admin-sl-rename', renamedFrom: FROM });
  if ((await idxOld.get()).exists) { await keep('sp2', idxOld); b.set(idxOld, { uid, renamedTo: TO, renamedAt: now }, { merge: true }); }
  await b.commit(); console.log(`  ✔ SP2: cuenta, envíos, pre-alertas e índice (${n} documentos)`);
  let inv = 0;
  for (const f of ['slCode', 'clientSlCode']) for (const d of await q(db2, 'invoices', f, FROM)) { await keep('sp2', d.ref); inv += await db2.runTransaction(async (tx) => { const s = await tx.get(d.ref); if (!s.exists || String(s.get(f) ?? '') !== FROM) return 0; tx.update(d.ref, { [f]: TO, slCodeRenamedFrom: FROM }); return 1; }); }
  console.log(`  ✔ SP2: facturas pendientes actualizadas: ${inv}`);
  const login = await auth2.getUser(uid).catch(() => null);
  if (login && login.customClaims?.slCode !== TO) { await auth2.setCustomUserClaims(uid, { ...(login.customClaims || {}), slCode: TO }); console.log('  ✔ login: código actualizado'); }
  snap.docs.push(...extra); snap.resumedAt = now; fs.writeFileSync(file, JSON.stringify(snap, null, 1));
  await new Promise((r) => setTimeout(r, 8000));
  const cur = await oldFicha.ref.get();
  if (cur.exists) { await db1.collection('customers_merged').doc(`${FROM}_renamed_${now.replace(/[:.]/g, '-')}`).set({ ...cur.data(), _renamed: { to: TO, at: now, snapshot: path.basename(file) } }); await oldFicha.ref.delete(); console.log(`  ✔ SP1: customers/${FROM} quitada (copia en customers_merged)`); }
  await db2.collection('account_restore_log').doc(`rename_resume_${now.replace(/[:.]/g, '-')}_${FROM}_${TO}`).set({ from: FROM, to: TO, uid, at: now, snapshot: path.basename(file), resumed: true });
  await new Promise((r) => setTimeout(r, 15000));
  const left = { fichaVieja: (await db1.collection('customers').doc(FROM).get()).exists, sp1Paquetes: (await q(db1, 'packages', 'slCode', FROM)).length, sp2Usuario: (await q(db2, 'users', 'slCode', FROM)).length, sp2Envios: (await q(db2, 'shipments', 'slCode', FROM)).length, sp2Facturas: (await q(db2, 'invoices', 'clientSlCode', FROM)).length };
  const bad = Object.values(left).some((v) => v === true || v > 0);
  console.log(bad ? `\n⚠ Quedó algo con ${FROM}: ${JSON.stringify(left)}` : `\n✅ ${FROM} → ${TO} completo en los dos sistemas. Reversa: node scripts/audit/rename-sl-code.cjs --rollback "${file}"`);
}

(ROLLBACK ? rollback(ROLLBACK) : main()).then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
