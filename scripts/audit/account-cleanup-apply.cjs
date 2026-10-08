/**
 * Account cleanup (2026-09-29) — removes, from BOTH systems, accounts that have NO history at all.
 * Dry-run by default; writes only with --apply.
 *
 * Which accounts (re-evaluated live at run time, the Excel plan is not trusted):
 *   A  SP1 fichas that are not customers (no SL code, or an SL code with no data and no SP2 account)
 *   C  soft-deleted / inactive accounts (both systems agree: deleted or missing)
 *   F  active SP2 accounts whose login no longer exists
 * An account is touched ONLY if it has zero packages, invoices (SP1), shipments, pre-alerts (SP2)
 * and zero Nova learning records under its code — anything else is skipped and listed as REVISAR.
 * Conflicts (deleted in one system, active in the other) are never touched.
 *
 * Per account, before any delete:
 *   - full backup (SP1 ficha, SP2 user, addresses, payment methods, identity indexes, login record)
 *     appended to audit-output/account-cleanup-<ts>.json (flushed per account)
 *   - log doc `account_deletions_log/<id>` in SP1 and in SP2 (status pending → done / error)
 * Order: SP2 indexes → addresses → payment methods → SP2 user → login → wait for the SP2 trigger's
 * push to SP1 (it re-creates the ficha as "deleted") → SP1 ficha. A final pass verifies nothing came back.
 * Never touches packages, invoices, shipments, pre-alerts.
 *
 * Run:  node scripts/audit/account-cleanup-apply.cjs            (dry-run)
 *       node scripts/audit/account-cleanup-apply.cjs --apply --plan <simulacion.json>
 *         only accounts listed in that reviewed dry-run are touched (anything else is left alone)
 *       node scripts/audit/account-cleanup-apply.cjs --apply    (writes)
 *       QA_EMULATOR=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node … (emulator)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));

const APPLY = process.argv.includes('--apply');
const PLAN = process.argv.includes('--plan') ? process.argv[process.argv.indexOf('--plan') + 1] : null;
if (APPLY && !PLAN && process.env.QA_EMULATOR !== '1') { console.error('En producción --apply exige --plan <simulación revisada>.'); process.exit(1); }
const QA = process.env.QA_EMULATOR === '1';
const P1 = QA ? 'demo-sp-qa' : 'smart-portal-admin';
const P2 = QA ? 'demo-sp-qa' : 'smart-portal-2';
const cred = QA ? {} : { credential: applicationDefault() };
const app1 = initializeApp({ ...cred, projectId: P1 }, 'sp1');
const app2 = initializeApp({ ...cred, projectId: P2 }, 'sp2');
const sp1 = getFirestore(app1, 'portal');
const sp2 = getFirestore(app2);
const auth2 = getAuth(app2);
const RUN = `cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const OUT = path.join(__dirname, '../../audit-output', `account-cleanup-${QA ? 'QA-' : ''}${RUN.slice(8)}${APPLY ? '' : '-simulacion'}.json`);

async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return docs;
}
const SL = (x) => { const s = String(x || '').toUpperCase().trim(); return /^SL\d+$/.test(s) ? s : ''; };
const isDel = (s) => s === 'deleted' || s === 'inactive';
const hasProfile = (x) => !!(x.email || x.firstName || x.lastName || x.fullName || x.name || x.dni || x.phone);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toDate === 'function') ? { __ts: x.toDate().toISOString() } : x));

/** Live history check — any hit means the account is NOT cleaned. Codes compared case-insensitively. */
async function history(codes, uid) {
  const hits = {};
  const variants = [...new Set(codes.filter(Boolean).flatMap((c) => [c, c.toUpperCase(), c.toLowerCase(), c[0] + c.slice(1).toLowerCase()]))];
  const q = async (db, col, field, vals) => { let n = 0; for (let i = 0; i < vals.length; i += 10) n += (await db.collection(col).where(field, 'in', vals.slice(i, i + 10)).limit(5).get()).size; return n; };
  if (variants.length) {
    for (const [col, fields] of [['packages', ['slCode', 'clientSlCode', 'customerId']], ['invoices', ['slCode', 'clientSlCode', 'customerId']], ['match_feedback', ['slCode']], ['manifest_learning_patterns', ['slCode']]]) {
      let n = 0; for (const f of fields) n += await q(sp1, col, f, variants); if (n) hits[`SP1 ${col}`] = n;
    }
    for (const col of ['shipments', 'pre_alerts']) { const n = await q(sp2, col, 'slCode', variants); if (n) hits[`SP2 ${col} (código)`] = n; }
  }
  if (uid) for (const col of ['shipments', 'pre_alerts']) { const n = await q(sp2, col, 'userId', [uid]); if (n) hits[`SP2 ${col} (uid)`] = n; }
  return hits;
}

async function select() {
  const [custs, users] = await Promise.all([readAll(sp1.collection('customers')), readAll(sp2.collection('users'))]);
  const logins = new Set(); let tok;
  do { const r = await auth2.listUsers(1000, tok); r.users.forEach((u) => logins.add(u.uid)); tok = r.pageToken; } while (tok);
  const c1 = new Map(); for (const d of custs) { const k = SL(d.get('slCode')) || SL(d.id); if (k) c1.set(k, d); }
  const u2 = new Map(); for (const d of users) { const k = SL(d.get('slCode')); if (k) u2.set(k, d); }
  const out = new Map(); // key → { group, code, ficha, user }
  const put = (key, v) => { if (!out.has(key)) out.set(key, v); };
  for (const d of custs) { // A
    const x = d.data(); const k = SL(x.slCode) || SL(d.id);
    if (k && (hasProfile(x) || u2.has(k))) continue;
    if (k && isDel(x.status)) continue; // handled by C
    put(`sp1:${d.id}`, { group: 'A', code: k || d.id, ficha: d, user: null });
  }
  for (const [k, d] of u2) if (isDel(d.get('status'))) { // C (SP2 side)
    const c = c1.get(k); if (c && !isDel(c.get('status'))) continue; // conflict
    put(`sl:${k}`, { group: 'C', code: k, ficha: c || null, user: d });
  }
  for (const [k, c] of c1) if (isDel(c.get('status'))) { // C (SP1 side)
    const u = u2.get(k); if (u && !isDel(u.get('status'))) continue; // conflict
    put(`sl:${k}`, { group: 'C', code: k, ficha: c, user: u || null });
  }
  for (const [k, d] of u2) { // F
    if (isDel(d.get('status')) || logins.has(d.id)) continue;
    const c = c1.get(k); if (c && isDel(c.get('status'))) continue;
    put(`sl:${k}`, { group: 'F', code: k, ficha: c || null, user: d });
  }
  return [...out.values()];
}

async function backupOf(a) {
  const uid = a.user?.id || null;
  const b = { group: a.group, code: a.code, uid, sp1: {}, sp2: {}, login: null };
  if (a.ficha) b.sp1[`customers/${a.ficha.id}`] = plain(a.ficha.data());
  if (a.user) b.sp2[`users/${uid}`] = plain(a.user.data());
  const sp2Refs = [];
  if (uid) {
    for (const col of ['addresses', 'payment_methods', 'email_index', 'dni_index', 'slcode_index']) {
      const field = ['addresses', 'payment_methods'].includes(col) ? 'userId' : 'uid';
      const s = await sp2.collection(col).where(field, '==', uid).get();
      for (const d of s.docs) { b.sp2[`${col}/${d.id}`] = plain(d.data()); sp2Refs.push(d.ref); }
    }
    for (const sub of await sp2.collection('users').doc(uid).listCollections()) {
      const s = await sub.get(); for (const d of s.docs) { b.sp2[`users/${uid}/${sub.id}/${d.id}`] = plain(d.data()); sp2Refs.push(d.ref); }
    }
    const u = await auth2.getUser(uid).catch(() => null);
    if (u) b.login = plain(u.toJSON());
  }
  // slcode_index keyed by the code even when the uid field differs — only if it points to this account
  if (SL(a.code)) { const s = await sp2.collection('slcode_index').doc(SL(a.code)).get(); if (s.exists && (!s.get('uid') || s.get('uid') === uid)) { b.sp2[`slcode_index/${s.id}`] = plain(s.data()); if (!sp2Refs.some((r) => r.path === s.ref.path)) sp2Refs.push(s.ref); } }
  return { b, sp2Refs };
}

(async () => {
  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACIÓN (nada se escribe)'} · ${QA ? 'EMULADOR' : 'PRODUCCIÓN'} · run ${RUN}`);
  const cand = await select();
  const plan = []; const skipped = [];
  for (const a of cand) {
    const codes = [a.code, a.ficha?.id, a.user?.get('slCode')].filter(Boolean);
    const h = await history(codes, a.user?.id);
    if (Object.keys(h).length) skipped.push({ group: a.group, code: a.code, uid: a.user?.id || '', historial: h });
    else plan.push(a);
  }
  if (PLAN) {
    const allowed = new Set(JSON.parse(fs.readFileSync(PLAN, 'utf8')).accounts.map((x) => `${x.group}|${x.code}|${x.uid || ''}`));
    const before = plan.length;
    for (let i = plan.length - 1; i >= 0; i--) { const a = plan[i]; if (!allowed.has(`${a.group}|${a.code}|${a.user?.id || ''}`)) { skipped.push({ group: a.group, code: a.code, uid: a.user?.id || '', historial: { 'no está en el plan revisado': 1 } }); plan.splice(i, 1); } }
    console.log(`Plan revisado: ${allowed.size} cuentas · candidatas ahora ${before} · se ejecutan ${plan.length}`);
  }
  const summary = (arr) => arr.reduce((m, x) => ((m[x.group] = (m[x.group] || 0) + 1), m), {});
  console.log('Se eliminarían:', plan.length, summary(plan), '· REVISAR (con historial, no se tocan):', skipped.length, summary(skipped));
  for (const a of plan) console.log(`  ${a.group} ${a.code}${a.user ? ' uid=' + a.user.id : ''}${a.ficha ? ' ficha=' + a.ficha.id : ''}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const file = { run: RUN, at: new Date().toISOString(), apply: APPLY, env: QA ? 'emulator' : 'production', skipped, accounts: [] };
  const flush = () => fs.writeFileSync(OUT, JSON.stringify(file, null, 1));
  flush();
  if (!APPLY) { for (const a of plan) file.accounts.push((await backupOf(a)).b); flush(); console.log('Respaldo simulado:', OUT); return; }

  let done = 0, errors = 0;
  for (const a of plan) {
    const { b, sp2Refs } = await backupOf(a);
    const logId = `${RUN}_${(a.ficha?.id || a.user?.id || a.code).replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const entry = { ...b, logId, steps: [] };
    file.accounts.push(entry); flush(); // backup on disk BEFORE any delete
    const log = { run: RUN, group: a.group, slCode: a.code, uid: b.uid, reason: 'Limpieza paridad SP1↔SP2 2026-09-29: cuenta sin historial', backup: JSON.stringify(b), status: 'pending', at: new Date().toISOString() };
    try {
      await Promise.all([sp1.collection('account_deletions_log').doc(logId).set(log), sp2.collection('account_deletions_log').doc(logId).set(log)]);
      const t0 = Date.now();
      for (const r of sp2Refs) { await r.delete(); entry.steps.push(`SP2 ${r.path} borrado`); }
      if (a.user) { await a.user.ref.delete(); entry.steps.push(`SP2 users/${a.user.id} borrado`); }
      if (b.login) { await auth2.deleteUser(b.uid); entry.steps.push(`login ${b.uid} borrado`); }
      // The SP2 delete trigger pushes status "deleted" to SP1, which (re)creates the ficha. Wait for it, then remove.
      const pushExpected = a.user && a.user.get('email') && SL(a.user.get('slCode'));
      const ficha1 = sp1.collection('customers').doc(a.ficha?.id || SL(a.code) || a.code);
      if (pushExpected) {
        for (let i = 0; i < 30; i++) { const s = await ficha1.get(); const u = s.exists ? s.updateTime.toMillis() : 0; if (u >= t0) break; await sleep(1000); }
      }
      const s1 = await ficha1.get();
      if (s1.exists) {
        if (!a.ficha) entry.sp1_recreated_by_trigger = plain(s1.data());
        await ficha1.delete(); entry.steps.push(`SP1 customers/${ficha1.id} borrado`);
      }
      const upd = { status: 'done', steps: entry.steps, doneAt: new Date().toISOString() };
      await Promise.all([sp1.collection('account_deletions_log').doc(logId).update(upd), sp2.collection('account_deletions_log').doc(logId).update(upd)]);
      entry.status = 'done'; done++;
    } catch (err) {
      entry.status = 'error'; entry.error = err.message; errors++;
      const upd = { status: 'error', error: err.message, steps: entry.steps };
      await Promise.all([sp1.collection('account_deletions_log').doc(logId).set(upd, { merge: true }), sp2.collection('account_deletions_log').doc(logId).set(upd, { merge: true })]).catch(() => {});
      console.error(`  ✗ ${a.code}: ${err.message} — se detiene la ejecución`);
      flush(); break;
    }
    flush();
    console.log(`  ✓ ${a.group} ${a.code} (${entry.steps.length} pasos)`);
  }
  // Final check after the triggers settle: nothing may come back.
  await sleep(20000);
  const back = [];
  for (const e of file.accounts.filter((x) => x.status === 'done')) {
    const f = Object.keys(e.sp1)[0]?.split('/')[1] || SL(e.code) || e.code;
    const [c, u] = await Promise.all([sp1.collection('customers').doc(f).get(), e.uid ? sp2.collection('users').doc(e.uid).get() : Promise.resolve({ exists: false })]);
    if (c.exists || u.exists) back.push({ code: e.code, sp1: c.exists, sp2: u.exists });
  }
  file.finalCheck = { returned: back }; flush();
  console.log(`Hecho ${done} · errores ${errors} · reaparecidas ${back.length}${back.length ? ' ' + JSON.stringify(back) : ''}`);
  console.log('Respaldo:', OUT);
  process.exit(errors || back.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
