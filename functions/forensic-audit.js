const admin = require('firebase-admin');
const fs = require('fs');

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'smart-portal-admin' });
}
const db = admin.firestore();

async function main() {
  console.log('=== FORENSIC ROUTE AUDIT: MANIFEST 23/07/2026DAN ===');
  console.log('Execution Time:', new Date().toISOString());

  // 1. Locate manifest doc
  const possibleIds = [
    '23/07/2026DAN',
    '23-07-2026DAN',
    'SL-MEGA-MAN-23-07-2026DAN',
    'MEGA-23-07-2026DAN',
    '23_07_2026DAN',
    'SL-MEGA-MAN-23-07-2026',
    '23-07-2026',
    '23/07/2026'
  ];

  let manifestData = null;
  let manifestIdFound = '';

  for (const id of possibleIds) {
    try {
      const snap = await db.collection('manifests').doc(id).get();
      if (snap.exists) {
        manifestData = snap.data();
        manifestIdFound = snap.id;
        console.log(`Found manifest doc by ID: "${snap.id}"`);
        break;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!manifestData) {
    console.log('Searching manifests collection for 23/07/2026DAN...');
    const qSnap = await db.collection('manifests').get();
    for (const docSnap of qSnap.docs) {
      const d = docSnap.data();
      const mn = (d.manifestNumber || docSnap.id || '').toUpperCase();
      if (mn.includes('23') && mn.includes('07') && (mn.includes('DAN') || mn.includes('2026'))) {
        manifestData = d;
        manifestIdFound = docSnap.id;
        console.log(`Found manifest by scan: ID="${docSnap.id}" (manifestNumber: ${d.manifestNumber})`);
        break;
      }
    }
  }

  if (!manifestData) {
    console.error('ERROR: Could not locate manifest 23/07/2026DAN!');
    const qSnap = await db.collection('manifests').limit(10).get();
    console.log('Available manifests in Firestore:');
    qSnap.docs.forEach(d => console.log(' - ID:', d.id, '| Number:', d.data().manifestNumber));
    return;
  }

  console.log('\n--- MANIFEST METADATA ---');
  console.log('Doc ID:', manifestIdFound);
  console.log('Manifest Number:', manifestData.manifestNumber || manifestIdFound);
  console.log('Total Packages embedded:', (manifestData.packages || []).length);
  console.log('Ruta Overrides:', manifestData.rutaOverrides || {});

  const packages = manifestData.packages || [];
  const slCodeMap = new Map();

  packages.forEach((pkg) => {
    const slCode = (pkg.slCode || pkg.userId || pkg.customerId || '').trim().toUpperCase();
    if (!slCode) return;
    const name = (pkg.customerName || pkg.nombreCliente || pkg.nombre || '').trim();
    const tracking = (pkg.trackingNumber || pkg.tracking || '').trim().toUpperCase();
    const ruta = (pkg.ruta || '').trim();

    if (!slCodeMap.has(slCode)) {
      slCodeMap.set(slCode, { slCode, name, trackings: [], rutaInManifest: ruta });
    }
    if (tracking) slCodeMap.get(slCode).trackings.push(tracking);
  });

  console.log(`\nUnique slCodes in Manifest: ${slCodeMap.size}`);

  // Fetch Packages Collection for this manifest
  const pkgsSnap = await db.collection('packages')
    .where('manifestNumber', '==', manifestData.manifestNumber || manifestIdFound)
    .get();
  console.log(`Packages found in 'packages' collection: ${pkgsSnap.size}`);

  pkgsSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const slCode = (d.slCode || d.userId || '').trim().toUpperCase();
    if (slCode && !slCodeMap.has(slCode)) {
      slCodeMap.set(slCode, {
        slCode,
        name: (d.customerName || d.nombre || '').trim(),
        trackings: [d.trackingNumber || docSnap.id],
        rutaInManifest: d.ruta || '',
      });
    }
  });

  console.log(`Total Unique slCodes After Merge: ${slCodeMap.size}`);

  // Fetch Invoices for this manifest
  console.log('\n--- FETCHING INVOICES FOR MANIFEST ---');
  const invoicesSnap = await db.collection('invoices').get();
  console.log(`Total Invoices in Firestore: ${invoicesSnap.size}`);

  const invoiceMapBySlCode = new Map();

  invoicesSnap.docs.forEach((docSnap) => {
    const inv = docSnap.data();
    const invMn = (inv.manifestNumber || '').toUpperCase();
    const targetMn = (manifestData.manifestNumber || manifestIdFound).toUpperCase();

    // Check if invoice belongs to target manifest or contains its trackings
    const isManifestMatch = invMn && (invMn === targetMn || targetMn.includes(invMn) || invMn.includes(targetMn));
    if (!isManifestMatch) return;

    const slCode = (inv.slCode || inv.customerId || inv.userId || '').trim().toUpperCase();
    const invData = {
      invoiceId: docSnap.id,
      invoiceNumber: inv.invoiceNumber || docSnap.id,
      ruta: inv.ruta || inv.route || 'N/A',
      status: inv.status || 'N/A',
      totalUSD: inv.totalUSD || inv.total || 0,
      createdAt: inv.createdAt?.toDate ? inv.createdAt.toDate().toISOString() : inv.createdAt,
    };
    if (!invoiceMapBySlCode.has(slCode)) invoiceMapBySlCode.set(slCode, []);
    invoiceMapBySlCode.get(slCode).push(invData);
  });

  console.log(`Invoices mapped to manifest customers: ${Array.from(invoiceMapBySlCode.values()).reduce((a, b) => a + b.length, 0)}`);

  // Fetch Customer Master Profiles
  console.log('\n--- FETCHING MASTER CUSTOMER PROFILES ---');
  const slCodes = Array.from(slCodeMap.keys());
  const customerMasterMap = new Map();

  for (let i = 0; i < slCodes.length; i += 30) {
    const chunk = slCodes.slice(i, i + 30);
    if (chunk.length === 0) continue;
    const cSnap = await db.collection('customers').where('slCode', 'in', chunk).get();
    cSnap.docs.forEach(docSnap => {
      customerMasterMap.set(docSnap.id.toUpperCase(), docSnap.data());
    });
  }

  // Fetch Audit Logs (July 26 to July 28)
  console.log('\n--- FETCHING AUDIT LOGS (July 26 to July 28) ---');
  const startDate = new Date('2026-07-26T00:00:00.000Z');
  const endDate = new Date('2026-07-28T23:59:59.999Z');

  const auditSnap = await db.collection('audit_logs').get();
  console.log(`Total Audit Logs fetched: ${auditSnap.size}`);

  const relevantAuditLogs = [];
  auditSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    let logTime = null;
    if (d.timestamp?.toDate) logTime = d.timestamp.toDate();
    else if (typeof d.timestamp === 'string') logTime = new Date(d.timestamp);
    else if (typeof d.timestamp === 'number') logTime = new Date(d.timestamp);

    if (logTime && logTime >= startDate && logTime <= endDate) {
      relevantAuditLogs.push({
        id: docSnap.id,
        timestamp: logTime.toISOString(),
        timestampCR: new Date(logTime.getTime() - 6 * 3600 * 1000).toISOString().replace('Z', ' (CR Time)'),
        action: d.action || d.type || 'N/A',
        userId: d.userId || d.userEmail || d.operator || 'system',
        targetId: d.targetId || 'N/A',
        details: d.details || d.metadata || {},
      });
    }
  });

  // Build Audit Report
  const auditReport = [];
  let routeDiscrepancyCount = 0;
  let recentCustomerChangesCount = 0;

  for (const [slCode, info] of slCodeMap.entries()) {
    const master = customerMasterMap.get(slCode);
    const invoices = invoiceMapBySlCode.get(slCode) || [];

    const masterRuta = master?.ruta || master?.route || 'NO REGISTRADA';
    let masterUpdatedAt = null;
    if (master?.updatedAt?.toDate) masterUpdatedAt = master.updatedAt.toDate().toISOString();
    else if (master?.sp1AdminUpdatedAt?.toDate) masterUpdatedAt = master.sp1AdminUpdatedAt.toDate().toISOString();
    else masterUpdatedAt = master?.updatedAt || master?.sp1AdminUpdatedAt || null;

    let updatedRecently = false;
    if (masterUpdatedAt) {
      const uDate = new Date(masterUpdatedAt);
      if (uDate >= startDate && uDate <= endDate) updatedRecently = true;
    }

    if (updatedRecently) recentCustomerChangesCount++;

    const invoiceRutas = invoices.map(inv => inv.ruta).filter(Boolean);
    const hasInvoiceDiscrepancy = invoiceRutas.some(r => r !== masterRuta);
    if (hasInvoiceDiscrepancy) routeDiscrepancyCount++;

    auditReport.push({
      slCode,
      name: info.name || master?.fullName || master?.name || 'DESCONOCIDO',
      trackingsCount: info.trackings.length,
      rutaInManifest: info.rutaInManifest,
      masterCurrentRuta: masterRuta,
      masterUpdatedAt: masterUpdatedAt || 'N/A',
      updatedRecently,
      invoices: invoices.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        rutaOnInvoice: inv.ruta,
        status: inv.status,
        totalUSD: inv.totalUSD,
      })),
    });
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log('Total Customers (slCodes) Audited:', auditReport.length);
  console.log('Customers with Recent Master Updates (July 26-28):', recentCustomerChangesCount);
  console.log('Customers with Invoice vs Master Route Discrepancy:', routeDiscrepancyCount);
  console.log('Relevant Audit Logs Found:', relevantAuditLogs.length);

  const reportOutput = {
    generatedAt: new Date().toISOString(),
    manifestId: manifestIdFound,
    manifestNumber: manifestData.manifestNumber,
    summary: {
      totalCustomers: auditReport.length,
      recentCustomerChangesCount,
      routeDiscrepancyCount,
      relevantAuditLogsCount: relevantAuditLogs.length,
    },
    auditLogs: relevantAuditLogs,
    customers: auditReport,
  };

  const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/forensic_report_23_07.json';
  fs.writeFileSync(outputPath, JSON.stringify(reportOutput, null, 2));
  console.log(`\n✅ Forensic Audit Report saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('CRITICAL AUDIT ERROR:', err);
});
