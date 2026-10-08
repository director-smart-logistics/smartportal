// Full merge of one duplicate pair: SP2 account merge (same logic as slAdminMergeUsers) + SL/Nova/SP1 follow-up.
//   node merge-pair.cjs --pair SLVIEJO:SLQUEQUEDA            simulation (writes nothing)
//   node merge-pair.cjs --pair SLVIEJO:SLQUEQUEDA --fix      applies — FIRST saves a full snapshot for rollback
//   node merge-pair.cjs --rollback <snapshot.json>           puts every touched document back exactly as it was
// OLD_UID=<uid>: the old SP2 account when its profile lost its SL code (emptied doc).
// MOVE_LOGIN=1 (with DELETE_LOGIN=1): the kept account's login takes the old login's email/phone (the one the
//   customer really uses); the kept login's previous email/phone are saved in the snapshot.
// Emulator: EMU=1.  Rules (2026-09-27): invoices/packages never deleted; learning moves before the SP1 customer doc is
// deleted; the old login is DISABLED (reversible), not deleted; one log/snapshot per pair.
'use strict';
const path = require('path');
const fs = require('fs');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore, Timestamp } = require(path.join(A, 'lib/firestore'));
const { getAuth } = require(path.join(A, 'lib/auth'));

const args = process.argv.slice(2);
const EMU = process.env.EMU === '1';
const FIX = args.includes('--fix');
const ROLLBACK = args.includes('--rollback') ? args[args.indexOf('--rollback') + 1] : null;
const OUTDIR = process.env.OUTDIR || path.join(__dirname, '../../audit-output/merges');
fs.mkdirSync(OUTDIR, { recursive: true });

const a2 = initializeApp(EMU ? { projectId: 'demo-sp-qa' } : { projectId: 'smart-portal-2', credential: applicationDefault() }, 'sp2');
const a1 = initializeApp(EMU ? { projectId: 'demo-sp-qa' } : { projectId: 'smart-portal-admin', credential: applicationDefault() }, 'sp1');
const DBS = { sp2: getFirestore(a2), sp1: getFirestore(a1, 'portal') };
const auth2 = getAuth(a2);

// ── snapshot encoding (keeps Firestore types so a rollback restores them exactly) ──
const encode = (v) => v instanceof Timestamp ? { __ts: [v.seconds, v.nanoseconds] }
  : Array.isArray(v) ? v.map(encode) : v && typeof v === 'object' && v.constructor?.name === 'DocumentReference' ? { __ref: v.path }
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) : v;
const decode = (db, v) => v && v.__ts ? new Timestamp(v.__ts[0], v.__ts[1]) : v && v.__ref ? db.doc(v.__ref)
  : Array.isArray(v) ? v.map((x) => decode(db, x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(db, x)])) : v;

async function rollback(file) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\nREVERSA de ${snap.pair} (${EMU ? 'EMULADOR' : 'PRODUCCIÓN'}) · ${snap.docs.length} documentos\n`);
  // Logins FIRST: SP2 deletes a users doc created for a uid with no login (orphan guard).
  if (snap.keepAuthBefore) {
    await auth2.updateUser(snap.keepAuthBefore.uid, { email: snap.keepAuthBefore.email || undefined, phoneNumber: snap.keepAuthBefore.phone || null });
    await auth2.setCustomUserClaims(snap.keepAuthBefore.uid, snap.keepAuthBefore.claims || null);
    console.log(`  ✔ login ${snap.keepAuthBefore.uid}: correo ${snap.keepAuthBefore.email} otra vez`);
  }
  if (snap.auth?.uid) {
    const exists = await auth2.getUser(snap.auth.uid).then(() => true, () => false);
    if (!exists && snap.auth.record) {
      const r = snap.auth.record;
      await auth2.createUser({ uid: r.uid, email: r.email, phoneNumber: r.phoneNumber, displayName: r.displayName, emailVerified: !!r.emailVerified, disabled: !!snap.auth.disabledBefore });
      if (r.customClaims) await auth2.setCustomUserClaims(r.uid, r.customClaims);
      console.log(`  ✔ login ${snap.auth.email}: recreado con el mismo uid (contraseña con "Olvidé mi contraseña")`);
    } else { await auth2.updateUser(snap.auth.uid, { disabled: !!snap.auth.disabledBefore }); console.log(`  ✔ login ${snap.auth.email}: habilitado otra vez`); }
  }
  for (const d of snap.docs) {
    const db = DBS[d.db]; const ref = db.doc(d.path);
    if (d.before === null) { await ref.delete(); console.log(`  ✔ ${d.db} ${d.path}: no existía → se quita`); }
    else { await ref.set(decode(db, d.before)); console.log(`  ✔ ${d.db} ${d.path}: restaurado`); }
  }
  console.log('\n✅ Reversa completa.');
}

async function main() {
  const pairArg = args[args.indexOf('--pair') + 1] || '';
  const [OLD, KEEP] = pairArg.toUpperCase().split(':');
  if (!OLD || !KEEP || OLD === KEEP) { console.error('Uso: --pair SLVIEJO:SLQUEQUEDA [--fix] | --rollback archivo.json'); process.exit(1); }
  const { sp2: db2, sp1: db1 } = DBS;
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, '-');
  const touched = new Map();   // key db|path → { db, path, ref }
  const ops = [];              // human log
  const say = (s) => { ops.push(s); console.log(`  ${FIX ? '✔' : '·'} ${s}`); };
  const touch = (dbKey, ref) => touched.set(`${dbKey}|${ref.path}`, { db: dbKey, path: ref.path, ref });
  const stop = (m) => { console.log(`\n⛔ ${m}\nNo se cambió nada.`); process.exit(2); };
  const q = async (db, coll, field, value) => (await db.collection(coll).where(field, '==', value).get()).docs;
  const union = async (db, coll, fields, value) => { const m = new Map(); for (const f of fields) (await q(db, coll, f, value)).forEach((d) => m.set(d.id, d)); return [...m.values()]; };

  console.log(`\n${FIX ? 'APLICAR' : 'SIMULACIÓN'} · ${OLD} → ${KEEP} · ${EMU ? 'EMULADOR' : 'PRODUCCIÓN'}\n`);
  // ── Preconditions ──
  const uOld = process.env.OLD_UID ? [await db2.collection('users').doc(process.env.OLD_UID).get()].filter((d) => d.exists && !d.get('slCode')) : await q(db2, 'users', 'slCode', OLD);
  const uKeep0 = await q(db2, 'users', 'slCode', KEEP); const uKeep = uKeep0;
  if (uKeep.length !== 1) stop(`SP2: se espera 1 cuenta ${KEEP} (hay ${uKeep.length}).`);
  const keepUid = uKeep[0].id;
  // RESUME: the SP2 part was already applied (old account archived into the kept one) → only the rest runs.
  const archived = uOld.length ? null : (await q(db2, 'users_archived', 'slCode', OLD)).find((d) => d.get('_archive')?.mergedInto === keepUid);
  const RESUME = !!archived;
  if (!RESUME && uOld.length !== 1) stop(`SP2: se espera 1 cuenta ${OLD} (hay ${uOld.length}).`);
  if (RESUME) console.log('(Reanudar: la parte de SP2 ya estaba aplicada; se completa SL, Nova y SP1.)');
  const oldUid = RESUME ? archived.id : uOld[0].id, oldData = RESUME ? archived.data() : uOld[0].data();
  if (['admin', 'superadmin'].includes(oldData.role)) stop('SP2: la cuenta que se fusiona es admin.');
  const cKeep = await q(db1, 'customers', 'slCode', KEEP);
  if (cKeep.length !== 1) stop(`SP1: se espera 1 ficha ${KEEP} (hay ${cKeep.length}).`);
  const kc = cKeep[0].data();
  const keepName = kc.fullName || [kc.firstName, kc.lastName].filter(Boolean).join(' ') || KEEP;
  console.log(`Queda: ${KEEP} (${keepName}) · uid ${keepUid}\nSe fusiona: ${OLD} · uid ${oldUid}\n`);

  // ── Phase A — SP2 account merge (same collections as slAdminMergeUsers) ──
  console.log('A. SP2 — fusión de la cuenta:');
  const OWNED = [['addresses', 'userId'], ['payment_methods', 'userId'], ['shipments', 'userId'], ['packages', 'userId'], ['pre_alerts', 'userId'],
    ['invoices', 'userId'], ['payments', 'userId'], ['support_tickets', 'userId'], ['notification_tokens', 'userId'], ['auth_events', 'uid']];
  const writesA = [];
  if (!RESUME) for (const [coll, field] of OWNED) for (const d of await q(db2, coll, field, oldUid)) {
    touch('sp2', d.ref); writesA.push((b) => b.update(d.ref, { [field]: keepUid, mergedFrom: oldUid, mergedAt: now })); say(`${coll}/${d.id}: → cuenta ${KEEP}`);
  }
  if (!RESUME) for (const sub of ['settings', 'preferences', 'history']) for (const d of (await db2.collection('users').doc(oldUid).collection(sub).get()).docs) {
    const dst = db2.collection('users').doc(keepUid).collection(sub).doc(d.id);
    touch('sp2', dst); writesA.push((b) => b.set(dst, { ...d.data(), mergedFrom: oldUid }, { merge: true })); say(`users/${KEEP}/${sub}/${d.id}: copiado`);
  }
  if (!RESUME) for (const coll of ['email_index', 'dni_index']) for (const d of await q(db2, coll, 'uid', oldUid)) {
    touch('sp2', d.ref); writesA.push((b) => b.update(d.ref, { uid: keepUid, repointedFrom: oldUid, repointedAt: now })); say(`${coll}/${d.id}: → cuenta ${KEEP}`);
  }
  const archRef = db2.collection('users_archived').doc(oldUid), userRef = db2.collection('users').doc(oldUid), mergeRef = db2.collection('user_merges').doc(`${stamp}_${OLD}_into_${KEEP}`);
  if (!RESUME) { touch('sp2', archRef); touch('sp2', userRef); touch('sp2', mergeRef); say(`users/${oldUid} (${OLD}) → archivada en users_archived y quitada de users`); }

  // ── Phase B — SL follow-up in SP2 ──
  console.log('\nB. SP2 — SL nuevo en paquetes y pre-alertas:');
  const writesB = [];
  for (const coll of ['shipments', 'pre_alerts']) for (const d of await q(db2, coll, 'slCode', OLD)) {
    touch('sp2', d.ref); writesB.push((b) => b.update(d.ref, { slCode: KEEP, userId: keepUid, mergedFromSlCode: OLD, updatedAt: now })); say(`${coll}/${d.id}: SL ${OLD} → ${KEEP}`);
  }
  for (const d of (await q(db2, 'shipments', 'slCode', KEEP)).filter((x) => !x.get('userId'))) {
    touch('sp2', d.ref); writesB.push((b) => b.update(d.ref, { userId: keepUid, updatedAt: now })); say(`shipments/${d.id}: sin dueño → cuenta ${KEEP}`);
  }
  const idx = db2.collection('slcode_index').doc(OLD);
  if ((await idx.get()).exists) { touch('sp2', idx); writesB.push((b) => b.set(idx, { uid: keepUid, mergedInto: KEEP, mergedAt: now }, { merge: true })); say(`slcode_index/${OLD} → cuenta ${KEEP}`); }
  let authRec = null;
  try { const r = await auth2.getUser(oldUid); authRec = { uid: oldUid, email: r.email || null, phone: r.phoneNumber || null, providers: r.providerData.map((p) => p.providerId), disabledBefore: r.disabled, record: encode(JSON.parse(JSON.stringify(r.toJSON()))) }; if (!r.disabled) say(`login ${r.email} (${authRec.providers.join('+')}) → deshabilitado (reversible)`); } catch { /* none */ }
  // MOVE_LOGIN: the kept account's login takes the old login's email/phone (the ones the customer really uses).
  let keepAuthBefore = null;
  if (process.env.MOVE_LOGIN === '1') {
    if (process.env.DELETE_LOGIN !== '1') stop('MOVE_LOGIN exige DELETE_LOGIN=1 (el correo solo puede estar en un login).');
    if (!authRec?.email) stop('El login viejo no tiene correo que pasar.');
    const k = await auth2.getUser(keepUid);
    keepAuthBefore = { uid: keepUid, email: k.email || null, phone: k.phoneNumber || null, claims: k.customClaims || null };
    say(`login de ${KEEP}: correo ${k.email} → ${authRec.email}${authRec.phone && !k.phoneNumber ? `, teléfono → ${authRec.phone}` : ''} (el cliente entra con su correo; contraseña con "Olvidé mi contraseña")`);
    if (k.email && k.email.toLowerCase() !== authRec.email.toLowerCase()) {
      const typo = db2.collection('email_index').doc(k.email.toLowerCase());
      const t = await typo.get();
      if (t.exists && t.get('uid') === keepUid) { touch('sp2', typo); say(`email_index/${k.email.toLowerCase()} (correo con error) → se quita`); }
    }
    const good = db2.collection('email_index').doc(authRec.email.toLowerCase());
    touch('sp2', good); say(`email_index/${authRec.email.toLowerCase()} → cuenta ${KEEP}`);
  }

  // ── Phase C — Nova learning, then SP1 data (never deleted) ──
  console.log('\nC. Nova (aprendizaje y patrones) y SP1 (paquetes, facturas, manifiestos — no se borra nada):');
  const writesC = [];
  const keyOf = (d) => String(d.get('normalizedName') || d.get('rawName') || d.get('pattern') || '').toUpperCase().trim();
  for (const coll of ['match_feedback', 'manifest_learning_patterns']) {
    const keepByName = new Map((await q(db1, coll, 'slCode', KEEP)).map((d) => [keyOf(d), d]));
    for (const d of await q(db1, coll, 'slCode', OLD)) {
      const twin = keyOf(d) && keepByName.get(keyOf(d));
      touch('sp1', d.ref);
      if (twin) {
        touch('sp1', twin.ref);
        // Nova counts uses in `hitCount` (older docs: `hits`); keep the latest `lastHitAt`.
        const cnt = (x) => Number(x.get('hitCount') ?? x.get('hits')) || 0;
        const hitCount = cnt(twin) + cnt(d);
        const lt = [twin.get('lastHitAt'), d.get('lastHitAt')].filter(Boolean).sort((a, b) => (b.toMillis?.() ?? Date.parse(b)) - (a.toMillis?.() ?? Date.parse(a)))[0];
        writesC.push((b) => { b.update(twin.ref, { hitCount, ...(lt ? { lastHitAt: lt } : {}), updatedAt: now, mergedFromSlCode: OLD }); b.delete(d.ref); });
        say(`${coll}: "${keyOf(d)}" ya existe en ${KEEP} → usos sumados (${hitCount}), sin duplicado`);
      } else {
        const upd = coll === 'match_feedback' ? { slCode: KEEP, fullName: keepName, ruta: kc.ruta || '', consolidationEnabled: kc.consolidationEnabled === true, mergedFromSlCode: OLD, updatedAt: now } : { slCode: KEEP, mergedFromSlCode: OLD, updatedAt: now };
        writesC.push((b) => b.update(d.ref, upd)); say(`${coll}/${d.id}: "${keyOf(d)}" → ${KEEP}`);
      }
    }
  }
  const setIfOld = (d, fields) => Object.fromEntries(fields.filter((f) => String(d.get(f) || '').toUpperCase().trim() === OLD).map((f) => [f, KEEP]));
  for (const d of await union(db1, 'packages', ['slCode', 'clientSlCode', 'customerId', 'userId'], OLD)) {
    touch('sp1', d.ref); const upd = { ...setIfOld(d, ['slCode', 'clientSlCode', 'customerId', 'userId']), customerName: keepName, mergedFromSlCode: OLD, updatedAt: now };
    writesC.push((b) => b.update(d.ref, upd)); say(`packages/${d.id}: cliente ${OLD} → ${KEEP}`);
  }
  for (const d of await union(db1, 'invoices', ['slCode', 'clientSlCode', 'customerId'], OLD)) {
    touch('sp1', d.ref); const upd = { ...setIfOld(d, ['slCode', 'clientSlCode', 'customerId']), clientName: keepName, mergedFromSlCode: OLD, updatedAt: now };
    if (d.get('customer') && typeof d.get('customer') === 'object') { upd['customer.slCode'] = KEEP; upd['customer.fullName'] = keepName; }
    writesC.push((b) => b.update(d.ref, upd)); say(`invoices/${d.id} (${d.get('invoiceNumber') || ''}, ${d.get('status') || ''}): cliente → ${KEEP}; número sin cambio`);
  }
  for (const coll of ['manifest_encomiendas', 'manifest_consolidation']) for (const d of await q(db1, coll, 'slCode', OLD)) {
    touch('sp1', d.ref); writesC.push((b) => b.update(d.ref, { slCode: KEEP, customerName: keepName, mergedFromSlCode: OLD, updatedAt: now })); say(`${coll}/${d.id}: cliente → ${KEEP}`);
  }
  const cOld = await q(db1, 'customers', 'slCode', OLD);
  for (const d of cOld) { touch('sp1', d.ref); touch('sp1', db1.collection('customers_merged').doc(d.id)); say(`SP1 customers/${d.id} (${OLD}) → se borra AL FINAL (copia en customers_merged)`); }

  const nA = writesA.length + (RESUME ? 0 : 3), nB = writesB.length, nC = writesC.length;
  if (nA > 450 || nB > 450 || nC > 450) stop('Demasiadas escrituras para una sola operación.');
  if (!FIX) { console.log(`\nSimulación: ${touched.size} documentos. No se cambió nada.`); return; }

  // ── Snapshot BEFORE any write ──
  const docs = [];
  for (const t of touched.values()) { const s = await t.ref.get(); docs.push({ db: t.db, path: t.path, before: s.exists ? encode(s.data()) : null }); }
  const snapFile = path.join(OUTDIR, `${stamp}_${OLD}_into_${KEEP}.json`);
  fs.writeFileSync(snapFile, JSON.stringify({ pair: `${OLD}->${KEEP}`, at: now, env: EMU ? 'emulator' : 'production', oldUid, keepUid, auth: authRec, keepAuthBefore, ops, docs }, null, 1));
  console.log(`\nRespaldo para reversa: ${snapFile} (${docs.length} documentos)`);

  // ── Apply (each phase = ONE commit) ──
  // C FIRST: Nova learning + SP1 data move to the kept SL before SP2 tells SP1 the old account was deleted
  // (SP1's customer trigger purges the learning of a customer that becomes "deleted").
  if (nC) { const bC = db1.batch(); writesC.forEach((w) => w(bC)); await bC.commit(); } console.log('  ✔ C aplicada (Nova y SP1)');
  if (!RESUME) {
    const bA = db2.batch(); writesA.forEach((w) => w(bA));
    bA.set(archRef, { ...oldData, _archive: { archivedAt: now, originalUid: oldUid, mergedInto: keepUid, mergedBy: 'merge-pair script', snapshot: path.basename(snapFile) } });
    bA.delete(userRef);
    bA.set(mergeRef, { orphanUid: oldUid, canonicalUid: keepUid, executedBy: 'merge-pair script', executedAt: now, orphanSnapshot: { slCode: OLD, email: oldData.email || null, dni: oldData.dni || null }, canonicalSnapshot: { slCode: KEEP }, rollbackFile: path.basename(snapFile) });
    await bA.commit(); console.log('  ✔ A aplicada (fusión de la cuenta en SP2)');
  }
  if (nB) { const bB = db2.batch(); writesB.forEach((w) => w(bB)); await bB.commit(); } console.log('  ✔ B aplicada (SL en SP2)');
  if (authRec && !authRec.disabledBefore) await auth2.updateUser(oldUid, { disabled: true });
  if (authRec && process.env.DELETE_LOGIN === '1') { await auth2.deleteUser(oldUid); console.log(`  ✔ login ${authRec.email} BORRADO (datos del login en el respaldo)`); }
  if (keepAuthBefore) {
    const upd = { email: authRec.email };
    if (authRec.phone && !keepAuthBefore.phone) upd.phoneNumber = authRec.phone;
    await auth2.updateUser(keepUid, upd);
    await auth2.setCustomUserClaims(keepUid, { ...(keepAuthBefore.claims || {}), slCode: KEEP });
    const b = db2.batch();
    if (keepAuthBefore.email && keepAuthBefore.email.toLowerCase() !== authRec.email.toLowerCase()) {
      const typo = db2.collection('email_index').doc(keepAuthBefore.email.toLowerCase());
      const t = await typo.get(); if (t.exists && t.get('uid') === keepUid) b.delete(typo);
    }
    b.set(db2.collection('email_index').doc(authRec.email.toLowerCase()), { uid: keepUid, repointedFrom: oldUid, repointedAt: now }, { merge: true });
    await b.commit();
    console.log(`  ✔ login de ${KEEP}: ahora ${authRec.email}${upd.phoneNumber ? ' + ' + upd.phoneNumber : ''}`);
  }

  // ── Last: the old SP1 customer record, only when nothing points to OLD and SP2's "deleted" notice arrived ──
  const left = [];
  for (const [coll, fields] of [['packages', ['slCode', 'clientSlCode', 'customerId', 'userId']], ['invoices', ['slCode', 'clientSlCode', 'customerId']], ['match_feedback', ['slCode']], ['manifest_learning_patterns', ['slCode']], ['manifest_encomiendas', ['slCode']], ['manifest_consolidation', ['slCode']]]) {
    const n = (await union(db1, coll, fields, OLD)).length; if (n) left.push(`${coll}=${n}`);
  }
  if (left.length) { console.log(`\n⚠ SP1 todavía tiene datos con ${OLD} (${left.join(', ')}): NO se borra su ficha.`); return; }
  for (let i = 0; i < 90; i++) { const c = await q(db1, 'customers', 'slCode', OLD); if (!c.length || c.every((d) => d.get('status') === 'deleted')) break; await new Promise((r) => setTimeout(r, 1000)); }
  for (const d of await q(db1, 'customers', 'slCode', OLD)) {
    await db1.collection('customers_merged').doc(d.id).set({ ...d.data(), _merged: { into: KEEP, at: now, rollbackFile: path.basename(snapFile) } });
    await d.ref.delete();
  }
  await new Promise((r) => setTimeout(r, 15000));
  const back = await q(db1, 'customers', 'slCode', OLD);
  console.log(back.length ? `\n⚠ La ficha ${OLD} volvió a aparecer en SP1 (${back.map((d) => d.get('status')).join(',')}).` : `\n✅ ${OLD} fusionada en ${KEEP}. Reversa: node merge-pair.cjs --rollback "${snapFile}"`);
}

(ROLLBACK ? rollback(ROLLBACK) : main()).catch((e) => { console.error('ERR', e.message); process.exit(1); });
