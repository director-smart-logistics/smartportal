/**
 * Nova ↔ SP2 pre-alert scenarios for the combined QA emulator (docs/QA_EMULATOR_SP1_SP2.md).
 * One manifest row per case (fixtures/manifest-prealert-scenarios.csv).
 *
 * Legacy documents are written with background triggers OFF, exactly as they exist today in
 * production (no slCode, no date, twins...). Otherwise SP2's trigger would fix them on create
 * and the test would not reflect real data. Triggers are turned back ON at the end.
 * Emulator only: refuses to run otherwise.
 */
'use strict';
const path = require('path');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

const fsHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const project = process.env.GCLOUD_PROJECT || '';
if (!/^(localhost|127\.0\.0\.1):/.test(fsHost) || !project.startsWith('demo-')) {
  console.error('❌ Not the local emulator with a demo project. Refusing to write.');
  process.exit(1);
}
const HUB = 'http://localhost:4400';
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

// SP2 pre-alerts (database "(default)"). u1 = SL90001 (e2e-sl90001), u2 = SL90002 (e2e-sl90002).
const u1 = { slCode: 'SL90001', userId: 'e2e-sl90001', displayName: 'Cliente Uno' };
const u2 = { slCode: 'SL90002', userId: 'e2e-sl90002', displayName: 'Cliente Dos' };
const live = (t, who, extra = {}) => ({ tracking: t, trackingNumber: t, canonicalTracking: t, status: 'pending', active: true, createdAt: daysAgo(3), ...who, ...extra });

const SP2_PRE_ALERTS = {
  // M1 FedEx: ML sends the 34-digit barcode, the customer pre-alerted the last 12
  '877098560696_SL90001': live('877098560696', u1),
  // M2 USPS: ML sends 420+ZIP+22, the customer pre-alerted the 22
  '9405511899223197428491_SL90002': live('9405511899223197428491', u2),
  // M3 exact TBA of SL90002 (manifest name says Cliente Uno → pre-alert wins, decision (a))
  'TBA330000000301_SL90002': live('TBA330000000301', u2),
  // M4 twins: two accounts pre-alerted the same tracking (legacy data)
  'TBA330000000401_SL90001': live('TBA330000000401', u1),
  'TBA330000000401_SL90002': live('TBA330000000401', { ...u2, displayName: 'Cliente Dos' }),
  // M5 legacy: no slCode, numeric userId 2429 (users/2429 is NOT SL2429)
  'TBA330000000402': { tracking: 'TBA330000000402', userId: '2429', status: 'pending', active: true, createdAt: daysAgo(3) },
  // M7 no date at all
  'TBA330000000404_SL90001': { tracking: 'TBA330000000404', canonicalTracking: 'TBA330000000404', status: 'pending', active: true, ...u1 },
  // M8 flagged by SP2 for review
  'TBA330000000405_SL90001': live('TBA330000000405', u1, { needsReview: true, reviewReason: 'slcode_user_mismatch' }),
  // M9 pre-alert still "pending" but its SP2 package was already DELIVERED
  'TBA330000000406_SL90001': live('TBA330000000406', u1, { shipmentId: 'TBA330000000406_e2e-sl90' }),
  // M10 cancelled / M11 200 days old
  'TBA330000000407_SL90002': live('TBA330000000407', u2, { active: false }),
  'TBA330000000408_SL90001': live('TBA330000000408', u1, { createdAt: daysAgo(200) }),
  // M13 consumed by another manifest
  'TBA330000000409_SL90002': live('TBA330000000409', u2, { status: 'manifested', manifestNumber: 'QA-MAN-ANTERIOR' }),
};
const SP2_SHIPMENTS = {
  'TBA330000000406_e2e-sl90': { tracking: 'TBA330000000406', slCode: 'SL90001', userId: 'e2e-sl90001', status: 'delivered', statusLabel: 'Entregado', prealertId: 'TBA330000000406_SL90001', createdAt: daysAgo(20) },
};
// SP1 synced copy (database "portal"): M6 ghost — SP2 has nothing for this tracking
const SP1_PRE_ALERTS_COPY = {
  'TBA330000000403_e2e-sl90': { tracking: 'TBA330000000403', slCode: 'SL90002', status: 'pre-alerted', createdAt: daysAgo(3) },
};

async function triggers(on) {
  const r = await fetch(`${HUB}/functions/${on ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });
  if (!r.ok) throw new Error(`hub ${r.status}`);
}

(async () => {
  const app = initializeApp({ projectId: project }, 'qa-nova-seed');
  const sp2 = getFirestore(app);
  const sp1 = getFirestore(app, 'portal');
  await triggers(false);
  try {
    // Artifacts of the late pre-alert e2e runs (LATE_PREALERT / LATE_AFTER_SAVE): M12 must start with none.
    for (const id of ['TBA330000000499_SL90001', 'TBA330000000499_SL90002', 'TBA330000000403_SL90002']) {
      await sp2.collection('pre_alerts').doc(id).delete().catch(() => {});
    }
    // Manifests saved by earlier e2e runs (SAVE=1) and their SP1 packages: each run starts clean,
    // so a tracking saved under one test manifest cannot block another (foreign-manifest guard).
    const QA_MANIFESTS = ['PREALERT-SCENARIOS', 'SEVERAL-MATCHES', 'PREALERT-NAME-LEARNING', 'GHOST-ONLY', 'DELIVERED-RECYCLED'];
    for (const mn of QA_MANIFESTS) {
      const pk = await sp1.collection('packages').where('manifestNumber', '==', mn).get();
      for (const d of pk.docs) await d.ref.delete();
      await sp1.collection('manifests').doc(mn).delete().catch(() => {});
      const inv = await sp1.collection('invoices').where('manifestNumber', '==', mn).get();
      for (const d of inv.docs) await d.ref.delete();
    }
    // SP2 shipments that earlier e2e invoice syncs created for the fixture trackings (the seeded
    // SP2 shipments below are written again afterwards).
    const fs = require('fs');
    const fixtureTrackings = new Set();
    for (const f of fs.readdirSync(path.join(__dirname, 'fixtures')).filter((x) => x.endsWith('.csv'))) {
      fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8').trim().split('\n').slice(1)
        .forEach((l) => { const t = l.split(',')[0].trim().toUpperCase(); if (t) fixtureTrackings.add(t); });
    }
    fixtureTrackings.add('877098560696');
    const tlist = [...fixtureTrackings];
    for (let i = 0; i < tlist.length; i += 10) {
      const snap = await sp2.collection('shipments').where('tracking', 'in', tlist.slice(i, i + 10)).get();
      for (const d of snap.docs) await d.ref.delete();
    }
    // Customer routes set by nova-upload.cjs CUSTOMER_ROUTES in a previous run: back to none.
    for (const sl of ['SL90001', 'SL90002']) {
      await sp1.collection('customers').doc(sl).update({ ruta: null }).catch(() => {});
    }
    // Nova's learned "manifest name → customer" mappings (SP1) start empty on every run, so one
    // test cannot poison the next (see audit N15).
    for (const col of ['match_feedback', 'manifest_learning_patterns']) {
      const snap = await sp1.collection(col).get();
      for (const d of snap.docs) await d.ref.delete();
      if (snap.size) console.log(`   emulador: ${col} limpiado (${snap.size} docs)`);
    }
    for (const [id, d] of Object.entries(SP2_PRE_ALERTS)) await sp2.collection('pre_alerts').doc(id).set(d);
    for (const [id, d] of Object.entries(SP2_SHIPMENTS)) await sp2.collection('shipments').doc(id).set(d);
    for (const [id, d] of Object.entries(SP1_PRE_ALERTS_COPY)) await sp1.collection('pre_alerts').doc(id).set(d);
  } finally {
    await triggers(true);
  }
  console.log(`✅ Nova scenarios: ${Object.keys(SP2_PRE_ALERTS).length} SP2 pre-alerts, ${Object.keys(SP2_SHIPMENTS).length} SP2 shipment, ${Object.keys(SP1_PRE_ALERTS_COPY).length} SP1 copy (triggers back ON)`);
  process.exit(0);
})().catch(async (e) => { console.error(e); await triggers(true).catch(() => {}); process.exit(1); });
