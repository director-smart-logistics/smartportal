/**
 * Restores SP2 user profiles that were emptied (doc left with only `ruta` + `updatedAt`) from the
 * customer's SP1 ficha — the SP1 ficha must point to that uid (firebaseUid) and the login's
 * slCode claim must match the ficha's code. Dry-run by default; writes only with --apply.
 *
 * Written: users/{uid} profile fields (merge — the doc only has ruta/updatedAt), plus the identity
 * indexes email_index / dni_index / slcode_index only when free. Addresses, payment methods,
 * shipments and pre-alerts are not touched (they still point to the uid).
 * profileLastUpdatedBy = 'admin-restore' so the SP2 trigger treats it as an admin change (no
 * customer-facing email). Backup + log (`account_restore_log`) before writing.
 *
 * Run: node scripts/audit/restore-emptied-sp2-profiles.cjs <SLcódigo>:<uid> [...] [--apply]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const pairs = args.filter((a) => a.includes(':')).map((a) => a.split(':'));
const QA = process.env.QA_EMULATOR === '1';
const cred = QA ? {} : { credential: applicationDefault() };
const sp1 = getFirestore(initializeApp({ ...cred, projectId: QA ? 'demo-sp-qa' : 'smart-portal-admin' }, 'sp1'), 'portal');
const app2 = initializeApp({ ...cred, projectId: QA ? 'demo-sp-qa' : 'smart-portal-2' }, 'sp2');
const sp2 = getFirestore(app2);
const auth2 = getAuth(app2);
const RUN = `restore-profile-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const OUT = path.join(__dirname, '../../audit-output', `${RUN}${QA ? '-QA' : ''}${APPLY ? '' : '-simulacion'}.json`);
const plain = (v) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (x && typeof x.toDate === 'function') ? { __ts: x.toDate().toISOString() } : x));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const v = (x) => (x === undefined ? null : x);

(async () => {
  console.log(`${APPLY ? 'APLICANDO' : 'SIMULACIÓN'} · ${QA ? 'EMULADOR' : 'PRODUCCIÓN'} · ${RUN}`);
  const out = { run: RUN, apply: APPLY, accounts: [] };
  for (const [sl, uid] of pairs) {
    const [c, u, login] = await Promise.all([sp1.collection('customers').doc(sl).get(), sp2.collection('users').doc(uid).get(), auth2.getUser(uid).catch(() => null)]);
    const x = c.data() || {}; const cur = u.data() || {};
    const problems = [];
    if (!c.exists) problems.push('no hay ficha SP1');
    if (x.firebaseUid !== uid) problems.push(`la ficha SP1 apunta a otro uid (${x.firebaseUid})`);
    if (!login) problems.push('el login no existe');
    else if (login.customClaims?.slCode && login.customClaims.slCode !== sl) problems.push(`el login dice ${login.customClaims.slCode}`);
    if (!u.exists) problems.push('no hay doc SP2');
    else if (['slCode', 'email', 'firstName', 'lastName', 'dni', 'phone'].some((k) => cur[k])) problems.push(`el doc SP2 ya tiene datos de identidad (${Object.keys(cur).join(',')})`);
    const other = await sp2.collection('users').where('slCode', '==', sl).get();
    if (other.docs.some((d) => d.id !== uid)) problems.push(`otro usuario SP2 ya usa ${sl}: ${other.docs.map((d) => d.id).join(',')}`);

    const email = x.email || login?.email || null;
    const firstName = x.firstName || ''; const lastName = x.lastName || '';
    const profile = {
      uid, id: uid, slCode: sl, email, firstName, lastName,
      displayName: x.fullName || `${firstName} ${lastName}`.trim(),
      firstNameLower: norm(firstName), lastNameLower: norm(lastName),
      searchTokens: [...new Set(norm(`${firstName} ${lastName}`).split(/\s+/).filter(Boolean))],
      phone: v(x.phone || login?.phoneNumber), phoneNumber: v(login?.phoneNumber || x.phone),
      dni: v(x.dni), country: x.country || 'Costa Rica', timezone: x.timezone || 'America/Costa_Rica',
      location: v(x.location), ruta: x.ruta || cur.ruta || 'por definir',
      tier: x.tier || 'basic', membershipTier: x.membershipTier || 'basic', memberSince: v(x.memberSince), membershipExpires: null,
      role: 'customer', status: 'active', isActive: true, disabled: false,
      emailVerified: !!login?.emailVerified, isVerified: !!x.isVerified,
      verifiedDni: v(x.verifiedDni), verifiedEmail: v(x.verifiedEmail), verifiedPhone: v(x.verifiedPhone),
      verificationSource: v(x.verificationSource), dateOfVerification: v(x.dateOfVerification),
      acceptMarketing: !!x.acceptMarketing, preferredLanguage: x.preferredLanguage || 'es',
      consolidationEnabled: !!x.consolidationEnabled, electronicInvoiceRequired: !!x.electronicInvoiceRequired,
      totalShipments: 0, pendingShipments: 0, providerId: 'password', migratedFromLegacy: true,
      showVerificationModal: false, showPromoBanner: false, showVisitGuide: false,
      createdAt: login ? new Date(login.metadata.creationTime).toISOString() : v(x.createdAt),
      lastSignInAt: v(login?.metadata?.lastSignInTime),
      profileLastUpdatedBy: 'admin-restore', restoredAt: new Date().toISOString(),
      restoredReason: 'Perfil SP2 vaciado el 2026-07-30; restaurado desde la ficha SP1 (paridad 2026-09-29)',
      updatedAt: new Date(),
    };
    const idx = [['email_index', String(email || '').toLowerCase()], ['dni_index', String(x.dni || '').trim()], ['slcode_index', sl]].filter(([, id]) => id);
    const idxState = [];
    for (const [col, id] of idx) { const s = await sp2.collection(col).doc(id).get(); idxState.push({ col, id, exists: s.exists, uid: s.get?.('uid') || null }); if (s.exists && s.get('uid') !== uid) problems.push(`${col}/${id} pertenece a otro uid (${s.get('uid')})`); }
    const entry = { slCode: sl, uid, problems, before: { sp2: plain(cur), sp1: plain(x), login: login ? plain(login.toJSON()) : null, indexes: idxState }, profile: plain(profile) };
    out.accounts.push(entry);
    console.log(`  ${sl} uid=${uid} · ${firstName} ${lastName} · ${email} · ruta ${profile.ruta}${problems.length ? ' · ✗ ' + problems.join('; ') : ' · OK'}`);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    if (!APPLY || problems.length) continue;
    const logRef = sp2.collection('account_restore_log').doc(`${RUN}_${sl}`);
    await logRef.set({ run: RUN, slCode: sl, uid, before: JSON.stringify(entry.before), status: 'pending', at: new Date().toISOString() });
    await sp2.runTransaction(async (tx) => {
      const snaps = await Promise.all(idx.map(([col, id]) => tx.get(sp2.collection(col).doc(id))));
      tx.set(sp2.collection('users').doc(uid), profile, { merge: true });
      idx.forEach(([col, id], i) => { if (!snaps[i].exists) tx.create(sp2.collection(col).doc(id), { uid, claimedAt: new Date().toISOString(), source: 'admin-restore-2026-09-29' }); });
    });
    await Promise.all([logRef.update({ status: 'done', doneAt: new Date().toISOString() }), sp1.collection('account_restore_log').doc(`${RUN}_${sl}`).set({ run: RUN, slCode: sl, uid, status: 'done', at: new Date().toISOString() })]);
    entry.status = 'done'; fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log('    ✓ restaurado');
  }
  console.log('Respaldo:', OUT);
  process.exit(out.accounts.some((a) => a.problems.length) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
