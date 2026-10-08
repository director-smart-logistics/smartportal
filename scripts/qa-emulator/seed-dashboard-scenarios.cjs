/**
 * Existing-data scenarios for the Phase 4 dashboard simulation (smart-portal-2
 * scripts/simulate-prealert-dashboard.cjs). SP2 database "(default)", customer SL90001 (e2e-sl90001),
 * other account SL90002 (e2e-sl90002). Emulator only: refuses to run otherwise. Triggers OFF while
 * writing (the data must look exactly like today's legacy data).
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
const triggers = (on) => fetch(`${HUB}/functions/${on ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' }).catch(() => {});
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const U1 = 'e2e-sl90001', U2 = 'e2e-sl90002';
const pa = (t, extra = {}) => ({ tracking: t, trackingNumber: t, canonicalTracking: t, slCode: 'SL90001', userId: U1, status: 'pending', active: true, createdAt: ago(5), ...extra });
const twin = (t, extra = {}) => ({ tracking: t, userId: U1, slCode: 'SL90001', status: 'pre-alerted', source: 'prealert', createdAt: ago(5), ...extra });

const PRE_ALERTS = {
  DASH01_SL90001: pa('TBA339900000001'),                                                        // pending, no shipment
  DASH02_SL90001: pa('TBA339900000002', { shipmentId: 'TBA339900000002_e2e-sl90' }),             // twin invoiced
  DASH03_SL90001: pa('877099000003', { shipmentId: '877099000003_e2e-sl90' }),                   // twin left alone + SP1 invoiced barcode
  DASH04_SL90001: pa('TBA339900000004', { shipmentId: 'TBA339900000004_e2e-sl90' }),             // twin never invoiced
  DASH05_SL90001: pa('TBA339900000005', { shipmentId: 'TBA339900000005_e2e-sl90' }),             // twin delivered
  DASH06_SL90001: pa('TBA339900000006', { createdAt: ago(120) }),                                // 120 days
  DASH09_SL90001: pa('TBA339900000009', { active: false, status: 'cancelled' }),                 // cancelled
  DASH10A_SL90001: pa('TBA339900000010'),                                                        // same package twice
  DASH10B_SL90001: pa('TBA339900000010', { canonicalTracking: 'TBA339900000010' }),
  DASH11_SL90001: pa('TBA339900000011'),                                                         // another account's live package
  DASH12_SL90001: pa('TBA339900000012', { shipmentId: 'NOPE_e2e-sl90' }),                        // dangling link
};
const SHIPMENTS = {
  'TBA339900000002_e2e-sl90': twin('TBA339900000002', { invoiceId: 'INV-D2', invoiceNumber: 'INV-D2', syncedFromSp1: true, status: 'processed' }),
  '877099000003_e2e-sl90': twin('877099000003'),
  '9632001960806794376300877099000003': { tracking: '9632001960806794376300877099000003', userId: U1, slCode: 'SL90001', status: 'processed', invoiceId: 'INV-D3', invoiceNumber: 'INV-D3', createdFromInvoiceSync: true, syncedFromSp1: true, createdAt: ago(2) },
  'TBA339900000004_e2e-sl90': twin('TBA339900000004'),
  'TBA339900000005_e2e-sl90': twin('TBA339900000005', { status: 'delivered' }),
  'TBA339900000007_e2e-sl90': twin('TBA339900000007'),                                           // twin WITHOUT pre-alert
  TBA339900000008: { tracking: 'TBA339900000008', userId: U1, slCode: 'SL90001', status: 'transit', syncedFromSp1: true, createdAt: ago(3) },  // SP1 injected, no invoice
  TBA339900000011: { tracking: 'TBA339900000011', userId: U2, slCode: 'SL90002', status: 'customs', syncedFromSp1: true, invoiceId: 'INV-D11', createdAt: ago(3) },
};

(async () => {
  const db = getFirestore(initializeApp({ projectId: project }));
  await triggers(false);
  try {
    for (const col of ['pre_alerts', 'shipments']) {
      const snap = await db.collection(col).get();
      for (const d of snap.docs) if (d.id.startsWith('DASH') || String(d.data().tracking || '').includes('3399000000') || String(d.data().tracking || '').includes('99000003')) await d.ref.delete();
    }
    for (const [id, d] of Object.entries(PRE_ALERTS)) await db.collection('pre_alerts').doc(id).set(d);
    for (const [id, d] of Object.entries(SHIPMENTS)) await db.collection('shipments').doc(id).set(d);
  } finally {
    await triggers(true);
  }
  console.log(`✅ Dashboard scenarios: ${Object.keys(PRE_ALERTS).length} pre-alerts, ${Object.keys(SHIPMENTS).length} shipments (triggers back ON)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
