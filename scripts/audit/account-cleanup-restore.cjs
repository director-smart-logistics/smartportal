/**
 * Restores accounts removed by account-cleanup-apply.cjs from its backup file.
 * Dry-run by default; writes only with --apply.
 *
 * Order matters: the login first (SP2 deletes a new users doc whose uid has no login — orphan guard),
 * then the SP2 user and its addresses / payment methods / identity indexes, then the SP1 ficha.
 * A login that did not exist at backup time is created with the same uid and email and a random
 * password (the customer uses "Olvidé mi contraseña"); nothing is sent to the customer.
 *
 * Run: node scripts/audit/account-cleanup-restore.cjs <backup.json> <SLcode|fichaId|uid> [...] [--apply]
 *      QA_EMULATOR=1 FIRESTORE_EMULATOR_HOST=… FIREBASE_AUTH_EMULATOR_HOST=… (emulator)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, Timestamp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const [file, ...keys] = args.filter((a) => a !== '--apply');
if (!file || !keys.length) { console.error('Uso: account-cleanup-restore.cjs <backup.json> <código|ficha|uid> [...] [--apply]'); process.exit(1); }
const QA = process.env.QA_EMULATOR === '1';
const cred = QA ? {} : { credential: applicationDefault() };
const app1 = initializeApp({ ...cred, projectId: QA ? 'demo-sp-qa' : 'smart-portal-admin' }, 'sp1');
const app2 = initializeApp({ ...cred, projectId: QA ? 'demo-sp-qa' : 'smart-portal-2' }, 'sp2');
const sp1 = getFirestore(app1, 'portal');
const sp2 = getFirestore(app2);
const auth2 = getAuth(app2);
const revive = (v) => Array.isArray(v) ? v.map(revive) : v && typeof v === 'object' ? (v.__ts ? Timestamp.fromDate(new Date(v.__ts)) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]))) : v;

(async () => {
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  const want = new Set(keys.map((k) => k.toUpperCase()));
  const accs = bk.accounts.filter((a) => want.has(String(a.code).toUpperCase()) || (a.uid && want.has(a.uid.toUpperCase())) || Object.keys(a.sp1).some((p) => want.has(p.split('/')[1].toUpperCase())));
  if (!accs.length) { console.error('Ninguna cuenta del respaldo coincide.'); process.exit(1); }
  console.log(`${APPLY ? 'RESTAURANDO' : 'SIMULACIÓN'} · ${QA ? 'EMULADOR' : 'PRODUCCIÓN'} · ${accs.length} cuenta(s)`);
  for (const a of accs) {
    const conflicts = [];
    for (const p of Object.keys(a.sp1)) if ((await sp1.doc(p).get()).exists) conflicts.push(`SP1 ${p}`);
    for (const p of Object.keys(a.sp2)) if ((await sp2.doc(p).get()).exists) conflicts.push(`SP2 ${p}`);
    if (a.uid && await auth2.getUser(a.uid).then(() => true, () => false)) conflicts.push(`login ${a.uid}`);
    const userDoc = a.uid ? a.sp2[`users/${a.uid}`] : null;
    const email = a.login?.email || userDoc?.email || null;
    console.log(`  ${a.code}: ${Object.keys(a.sp1).length} doc SP1, ${Object.keys(a.sp2).length} doc SP2, login ${a.login ? 'respaldado' : userDoc ? 'se crea nuevo' : 'no aplica'}${conflicts.length ? ' · YA EXISTE: ' + conflicts.join(', ') : ''}`);
    if (!APPLY) continue;
    if (conflicts.length) { console.log('    ✗ no se restaura: ya existe (no se sobrescribe nada)'); continue; }
    if (userDoc) {
      await auth2.createUser({ uid: a.uid, email: email || undefined, emailVerified: !!a.login?.emailVerified, phoneNumber: a.login?.phoneNumber || undefined, displayName: a.login?.displayName || undefined, disabled: !!a.login?.disabled, password: crypto.randomBytes(18).toString('base64') });
      if (a.login?.customClaims) await auth2.setCustomUserClaims(a.uid, a.login.customClaims);
    }
    // users doc first (other docs reference it), then the rest of SP2, then SP1
    const sp2Paths = Object.keys(a.sp2).sort((x, y) => (y === `users/${a.uid}`) - (x === `users/${a.uid}`));
    for (const p of sp2Paths) await sp2.doc(p).set(revive(a.sp2[p]));
    for (const p of Object.keys(a.sp1)) await sp1.doc(p).set(revive(a.sp1[p]));
    const log = { restoredAt: new Date().toISOString(), restoredFrom: path.basename(file) };
    if (a.logId) await Promise.all([sp1.collection('account_deletions_log').doc(a.logId).set(log, { merge: true }), sp2.collection('account_deletions_log').doc(a.logId).set(log, { merge: true })]);
    // "Eliminar cuenta" logs of this code → restored, so the SP1 sync guard (deleted accounts) lets it sync again
    for (const db of [sp1, sp2]) for (const d of (await db.collection('account_deletions_log').where('slCode', '==', a.code).get()).docs) {
      if (d.get('status') === 'deleted' || d.get('status') === 'pending') await d.ref.set({ ...log, status: 'restored', statusBeforeRestore: d.get('status') }, { merge: true });
    }
    console.log('    ✓ restaurada');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
