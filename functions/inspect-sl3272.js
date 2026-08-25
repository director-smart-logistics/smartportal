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
  const slCodeTarget = 'SL3272';
  console.log(`=== FORENSIC DEEP-DIVE FOR CUSTOMER "${slCodeTarget}" ===`);

  // 1. Fetch Customer Master Profile
  console.log('\n[1/4] Fetching Customer document...');
  const customerDoc = await firestoreGet(`/customers/${slCodeTarget}`);
  let customerData = {};
  if (customerDoc.fields) {
    customerData = parseFirestoreFields(customerDoc.fields);
    console.log('Master Customer Doc Found:');
    console.log(' - Doc ID:', slCodeTarget);
    console.log(' - Name:', customerData.fullName || customerData.name);
    console.log(' - Current Ruta:', customerData.ruta || customerData.route);
    console.log(' - Previous Corrupted Ruta:', customerData.previousCorruptedRuta || 'N/A');
    console.log(' - UpdatedAt:', customerData.updatedAt || customerData.sp1AdminUpdatedAt);
    console.log(' - UpdatedBy:', customerData.updatedBy || customerData.sp1AdminUpdatedBy || 'N/A');
    console.log(' - RouteRestoredAt:', customerData.routeRestoredAt || 'N/A');
    console.log(' - RouteRestoredReason:', customerData.routeRestoredReason || 'N/A');
  } else {
    console.log(`Customer document "/customers/${slCodeTarget}" NOT found directly. Searching all customers...`);
    const allCustomers = await listCollectionDocs('customers', 500);
    const found = allCustomers.find(c => (c.data.slCode || '').toUpperCase() === slCodeTarget);
    if (found) {
      customerData = found.data;
      console.log('Master Customer Doc Found in collection scan:', found.id, customerData);
    }
  }

  // 2. Fetch Invoices for SL3272
  console.log('\n[2/4] Fetching Invoices for SL3272...');
  const allInvoices = await listCollectionDocs('invoices', 300);
  const sl3272Invoices = [];
  allInvoices.forEach(invDoc => {
    const inv = invDoc.data;
    const sl = (inv.slCode || inv.customerId || inv.userId || '').trim().toUpperCase();
    if (sl === slCodeTarget) {
      sl3272Invoices.push({
        id: invDoc.id,
        invoiceNumber: inv.invoiceNumber || invDoc.id,
        manifestNumber: inv.manifestNumber || 'N/A',
        ruta: inv.ruta || inv.route || 'N/A',
        status: inv.status || 'N/A',
        totalUSD: inv.totalUSD || inv.total || 0,
        createdAt: inv.createdAt || 'N/A'
      });
    }
  });

  console.log(`Invoices found for ${slCodeTarget}: ${sl3272Invoices.length}`);
  sl3272Invoices.forEach(i => console.log(' - Invoice:', i.invoiceNumber, '| Manifest:', i.manifestNumber, '| Ruta:', i.ruta, '| Status:', i.status, '| CreatedAt:', i.createdAt));

  // 3. Fetch Manifest Package Records for SL3272
  console.log('\n[3/4] Fetching Manifest Package Entries for SL3272...');
  const allManifests = await listCollectionDocs('manifests', 300);
  const sl3272ManifestEntries = [];

  allManifests.forEach(mDoc => {
    const mData = mDoc.data;
    const packages = mData.packages || [];
    packages.forEach(pkg => {
      const sl = (pkg.slCode || pkg.userId || pkg.customerId || '').trim().toUpperCase();
      if (sl === slCodeTarget) {
        sl3272ManifestEntries.push({
          manifestId: mDoc.id,
          manifestNumber: mData.manifestNumber || mDoc.id,
          trackingNumber: pkg.trackingNumber || pkg.tracking || 'N/A',
          ruta: pkg.ruta || 'N/A',
          manifestUpdatedAt: mData.updatedAt || 'N/A'
        });
      }
    });
  });

  console.log(`Manifest package records found for ${slCodeTarget}: ${sl3272ManifestEntries.length}`);
  sl3272ManifestEntries.forEach(m => console.log(' - Manifest:', m.manifestNumber, '| Tracking:', m.trackingNumber, '| Ruta:', m.ruta, '| UpdatedAt:', m.manifestUpdatedAt));

  // 4. Fetch Audit Logs for SL3272
  console.log('\n[4/4] Fetching Audit Logs for SL3272...');
  const allAuditLogs = await listCollectionDocs('audit_logs', 500);
  const sl3272AuditLogs = [];

  allAuditLogs.forEach(al => {
    const d = al.data;
    const str = JSON.stringify(d);
    if (str.includes(slCodeTarget) || d.targetId === slCodeTarget) {
      sl3272AuditLogs.push({
        id: al.id,
        timestamp: d.timestamp || d.createdAt || 'N/A',
        timestampCR: d.timestamp ? new Date(new Date(d.timestamp).getTime() - 6*3600*1000).toISOString().replace('Z', ' (Hora CR)') : 'N/A',
        action: d.action || d.type || 'N/A',
        userId: d.userId || d.userEmail || 'system',
        details: d.details || {}
      });
    }
  });

  console.log(`Audit Logs found mentioning ${slCodeTarget}: ${sl3272AuditLogs.length}`);
  sl3272AuditLogs.forEach(l => console.log(' - Log:', l.timestampCR, '| Action:', l.action, '| User:', l.userId, '| Details:', JSON.stringify(l.details)));

  const resultObj = {
    slCodeTarget,
    customerData,
    invoices: sl3272Invoices,
    manifestEntries: sl3272ManifestEntries,
    auditLogs: sl3272AuditLogs
  };

  const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/sl3272_forensic_details.json';
  fs.writeFileSync(outputPath, JSON.stringify(resultObj, null, 2));
  console.log(`\n✅ SL3272 Deep-Dive Report saved to: ${outputPath}`);
}

main().catch(err => console.error('CRITICAL ERROR:', err));
