const fs = require('fs');
const https = require('https');

const firebaseTools = JSON.parse(fs.readFileSync('/Users/jbricenoz/.config/configstore/firebase-tools.json', 'utf8'));
const accessToken = firebaseTools.tokens.access_token;
const projectId = 'smart-portal-admin';
const databaseId = 'portal';

function firestoreGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${projectId}/databases/${databaseId}/documents${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function parseFirestoreFields(fieldsObj) {
  if (!fieldsObj) return {};
  const res = {};
  for (const [key, val] of Object.entries(fieldsObj)) {
    if (val.stringValue !== undefined) res[key] = val.stringValue;
    else if (val.integerValue !== undefined) res[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) res[key] = val.doubleValue;
    else if (val.booleanValue !== undefined) res[key] = val.booleanValue;
    else if (val.timestampValue !== undefined) res[key] = val.timestampValue;
    else if (val.arrayValue !== undefined) {
      res[key] = (val.arrayValue.values || []).map(v => parseFirestoreFields({ temp: v }).temp);
    } else if (val.mapValue !== undefined) {
      res[key] = parseFirestoreFields(val.mapValue.fields);
    } else if (val.nullValue !== undefined) {
      res[key] = null;
    }
  }
  return res;
}

async function listCollectionDocs(collectionName, pageSize = 300) {
  let docs = [];
  let pageToken = '';
  do {
    const url = `/${collectionName}?pageSize=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await firestoreGet(url);
    if (res.documents) {
      docs.push(...res.documents.map(d => ({
        id: decodeURIComponent(d.name.split('/').pop()),
        data: parseFirestoreFields(d.fields)
      })));
    }
    pageToken = res.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function main() {
  console.log('=== FORENSIC ROUTE AUDIT: MANIFEST 23/07/2026DAN ===');
  console.log('Execution Time:', new Date().toISOString());

  console.log('\n[1/4] Fetching all manifests from Firestore database "portal"...');
  const allManifests = await listCollectionDocs('manifests', 300);
  console.log(`Total manifests found: ${allManifests.length}`);

  let targetManifest = null;
  for (const m of allManifests) {
    const mn = (m.data.manifestNumber || m.id).toUpperCase();
    if (mn.includes('23') && mn.includes('07') && (mn.includes('DAN') || mn.includes('2026'))) {
      targetManifest = m;
      console.log(`FOUND MANIFEST: Doc ID="${m.id}" | Number="${m.data.manifestNumber}"`);
      break;
    }
  }

  if (!targetManifest) {
    console.error('CRITICAL: Manifest 23/07/2026DAN not found in manifests collection!');
    console.log('Sample manifest IDs found:');
    allManifests.slice(0, 15).forEach(m => console.log(' - ID:', m.id, '| Number:', m.data.manifestNumber));
    return;
  }

  const manifestData = targetManifest.data;
  const manifestId = targetManifest.id;

  console.log('\n--- MANIFEST METADATA ---');
  console.log('Doc ID:', manifestId);
  console.log('Manifest Number:', manifestData.manifestNumber || manifestId);
  console.log('Total Embedded Packages:', (manifestData.packages || []).length);
  console.log('Ruta Overrides:', manifestData.rutaOverrides || {});
  console.log('Updated At:', manifestData.updatedAt || 'N/A');

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

  console.log(`\n[2/4] Unique slCodes in Manifest: ${slCodeMap.size}`);

  console.log('\n[3/4] Fetching all invoices from Firestore...');
  const allInvoices = await listCollectionDocs('invoices', 300);
  console.log(`Total Invoices in DB: ${allInvoices.length}`);

  const targetMn = (manifestData.manifestNumber || manifestId).toUpperCase();
  const invoiceMapBySlCode = new Map();

  allInvoices.forEach(invDoc => {
    const inv = invDoc.data;
    const invMn = (inv.manifestNumber || '').toUpperCase();
    if (invMn && invMn !== targetMn && !targetMn.includes(invMn) && !invMn.includes(targetMn)) return;

    const slCode = (inv.slCode || inv.customerId || inv.userId || '').trim().toUpperCase();
    const invData = {
      invoiceId: invDoc.id,
      invoiceNumber: inv.invoiceNumber || invDoc.id,
      ruta: inv.ruta || inv.route || 'N/A',
      status: inv.status || 'N/A',
      totalUSD: inv.totalUSD || inv.total || 0,
      createdAt: inv.createdAt || 'N/A',
    };
    if (!invoiceMapBySlCode.has(slCode)) invoiceMapBySlCode.set(slCode, []);
    invoiceMapBySlCode.get(slCode).push(invData);
  });

  console.log(`Invoices mapped to manifest customers: ${Array.from(invoiceMapBySlCode.values()).reduce((a, b) => a + b.length, 0)}`);

  console.log('\n[4/4] Fetching all master customer profiles from Firestore...');
  const allCustomers = await listCollectionDocs('customers', 500);
  console.log(`Total Master Customers in DB: ${allCustomers.length}`);

  const customerMasterMap = new Map();
  allCustomers.forEach(c => {
    const sl = (c.data.slCode || c.id).trim().toUpperCase();
    customerMasterMap.set(sl, c.data);
  });

  console.log('\nFetching audit logs...');
  const allAuditLogs = await listCollectionDocs('audit_logs', 500);
  console.log(`Total Audit Logs in DB: ${allAuditLogs.length}`);

  const startDate = new Date('2026-07-26T00:00:00.000Z');
  const endDate = new Date('2026-07-28T23:59:59.999Z');

  const relevantAuditLogs = [];
  allAuditLogs.forEach(al => {
    const d = al.data;
    const tsStr = d.timestamp || d.createdAt || d.updatedAt;
    if (!tsStr) return;
    const logTime = new Date(tsStr);
    if (logTime >= startDate && logTime <= endDate) {
      relevantAuditLogs.push({
        id: al.id,
        timestamp: logTime.toISOString(),
        timestampCR: new Date(logTime.getTime() - 6 * 3600 * 1000).toISOString().replace('Z', ' (CR Time)'),
        action: d.action || d.type || 'N/A',
        userId: d.userId || d.userEmail || d.operator || 'system',
        targetId: d.targetId || 'N/A',
        details: d.details || d.metadata || {},
      });
    }
  });

  // Build Comprehensive Forensic Report
  const auditReport = [];
  let routeDiscrepancyCount = 0;
  let recentCustomerChangesCount = 0;

  for (const [slCode, info] of slCodeMap.entries()) {
    const master = customerMasterMap.get(slCode);
    const invoices = invoiceMapBySlCode.get(slCode) || [];

    const masterRuta = master?.ruta || master?.route || 'NO REGISTRADA';
    const masterUpdatedAt = master?.updatedAt || master?.sp1AdminUpdatedAt || null;

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

  console.log('\n=== AUDIT SUMMARY RESULTS ===');
  console.log('Total Customers (slCodes) Audited:', auditReport.length);
  console.log('Customers with Master Updates between July 26-28:', recentCustomerChangesCount);
  console.log('Customers with Invoice vs Master Route Discrepancies:', routeDiscrepancyCount);
  console.log('Relevant Audit Logs Found (July 26-28):', relevantAuditLogs.length);

  const reportOutput = {
    generatedAt: new Date().toISOString(),
    manifestId,
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
