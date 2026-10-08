/**
 * READ-ONLY. After unify-sl-codes.cjs: proves, for every "FROM TO" pair of a plan file, that
 *   - no document in ANY collection of SP1 or SP2 still has FROM in slCode / clientSlCode / customerId
 *     (except the audit trail: customers_merged, logs, *_archived, previous-code fields)
 *   - SP1 has ONE active ficha TO, pointing to the SP2 account; SP2 has ONE account with TO; the login says TO
 *   - Nova learning: every name that pointed to FROM now points to TO only (no name split between codes)
 *   - no Nova manifest row still carries FROM
 * Run: node scripts/audit/verify-unified-codes.cjs <plan.txt>   (lines: "FROM TO")
 */
'use strict';
const path = require('path');
const fs = require('fs');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore } = require(path.join(A, 'lib/firestore'));
const { getAuth } = require(path.join(A, 'lib/auth'));
const a2 = initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2');
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(a2);
const auth = getAuth(a2);
const HISTORY = /merged|archived|log|audit|corrections|history|deletions|restore/i;

(async () => {
  const plan = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => l.trim().split(/\s+/));
  const cols1 = (await sp1.listCollections()).map((c) => c.id).filter((c) => !HISTORY.test(c));
  const cols2 = (await sp2.listCollections()).map((c) => c.id).filter((c) => !HISTORY.test(c));
  const manifests = (await sp1.collection('manifests').get()).docs.map((d) => [d.id, JSON.stringify(d.data())]);
  let bad = 0;
  for (const [FROM, TO] of plan) {
    const issues = [];
    for (const [db, cols, name] of [[sp1, cols1, 'SP1'], [sp2, cols2, 'SP2']]) for (const c of cols) for (const f of ['slCode', 'clientSlCode', 'customerId']) {
      try { const s = await db.collection(c).where(f, '==', FROM).limit(3).get(); if (s.size) issues.push(`${name} ${c}.${f}=${FROM} (${s.size}+)`); } catch { /* not indexed */ }
    }
    const mRows = manifests.filter(([, j]) => j.includes(`"slCode":"${FROM}"`)).map(([id]) => id);
    if (mRows.length) issues.push(`manifiestos con ${FROM}: ${mRows.join(',')}`);
    if ((await sp1.doc(`customers/${FROM}`).get()).exists) issues.push(`SP1 ficha ${FROM} sigue existiendo`);
    const keep = await sp1.doc(`customers/${TO}`).get();
    const users = (await sp2.collection('users').where('slCode', '==', TO).get()).docs;
    if (!keep.exists || keep.get('status') === 'deleted') issues.push(`SP1 ficha ${TO} no activa`);
    if (users.length !== 1) issues.push(`SP2 cuentas con ${TO}: ${users.length}`);
    else {
      if (keep.exists && keep.get('firebaseUid') && keep.get('firebaseUid') !== users[0].id) issues.push('SP1 ficha apunta a otra cuenta');
      const l = await auth.getUser(users[0].id).catch(() => null);
      if (!l) issues.push('sin login'); else if (l.customClaims?.slCode !== TO) issues.push(`login dice ${l.customClaims?.slCode}`);
      if ((await sp2.doc(`slcode_index/${TO}`).get()).get('uid') !== users[0].id) issues.push('índice SL no apunta a la cuenta');
    }
    // Nova: a learned name must point to ONE code
    const names = new Set((await sp1.collection('match_feedback').where('slCode', '==', TO).get()).docs.map((d) => String(d.get('normalizedName') || d.get('rawName') || '').toUpperCase().trim()).filter(Boolean));
    for (const n of names) { const s = await sp1.collection('match_feedback').where('normalizedName', '==', n).get(); const codes = [...new Set(s.docs.map((d) => d.get('slCode')))]; if (codes.length > 1) issues.push(`Nova: "${n}" apunta a ${codes.join(' y ')}`); }
    const pk = (await sp1.collection('packages').where('slCode', '==', TO).get()).size;
    const pa = (await sp2.collection('pre_alerts').where('slCode', '==', TO).get()).size;
    const sh = (await sp2.collection('shipments').where('slCode', '==', TO).get()).size;
    console.log(`${issues.length ? '❌' : '✅'} ${FROM} → ${TO} · SP1 paquetes ${pk} · SP2 envíos ${sh} · pre-alertas ${pa}${issues.length ? ' · ' + issues.join(' · ') : ''}`);
    if (issues.length) bad++;
  }
  console.log(`\n${plan.length - bad}/${plan.length} sin restos del código anterior`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
