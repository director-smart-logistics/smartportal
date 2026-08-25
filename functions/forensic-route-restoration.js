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

function parseAnyDate(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') {
    if (val.includes('/')) {
      const parts = val.split(/[\s/:]+/);
      if (parts.length >= 3) {
        // Assume DD/MM/YYYY
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        return new Date(Date.UTC(y, m, d));
      }
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

async function main() {
  console.log('=== FORENSIC ROUTE RESTORATION ANALYSIS (DRY-RUN v2) ===');
  console.log('Execution Time:', new Date().toISOString());

  const auditData = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/systemwide_customer_route_audit.json', 'utf8'));
  const updatedCustomers = auditData.updatedCustomers || [];
  console.log(`Auditing ${updatedCustomers.length} updated customers for route restoration...`);

  // Fetch all invoices emitted prior to July 25
  console.log('\n[1/3] Fetching all invoices from Firestore for historical evidence...');
  const allInvoices = await listCollectionDocs('invoices', 300);
  console.log(`Total Invoices fetched: ${allInvoices.length}`);

  const saturdayCutoff = new Date('2026-07-25T00:00:00.000Z');
  const historicalInvoiceMap = new Map();

  allInvoices.forEach(invDoc => {
    const inv = invDoc.data;
    const invDate = parseAnyDate(inv.createdAt || inv.issuedAt || inv.date || invDoc.id);
    
    const slCode = (inv.slCode || inv.customerId || inv.userId || '').trim().toUpperCase();
    const ruta = inv.ruta || inv.route;
    if (!slCode || !ruta || ruta === 'N/A' || ruta === 'Desconocida') return;

    // Record invoice
    if (!historicalInvoiceMap.has(slCode)) {
      historicalInvoiceMap.set(slCode, []);
    }
    historicalInvoiceMap.get(slCode).push({
      invoiceNumber: inv.invoiceNumber || invDoc.id,
      ruta,
      isPreSaturday: invDate ? invDate < saturdayCutoff : true,
      createdAt: invDate ? invDate.toISOString() : 'Sin Fecha'
    });
  });

  console.log(`Customers with historical invoices: ${historicalInvoiceMap.size}`);

  // Fetch all historical manifests prior to July 25
  console.log('\n[2/3] Fetching all historical manifests for package route evidence...');
  const allManifests = await listCollectionDocs('manifests', 300);
  console.log(`Total Manifests fetched: ${allManifests.length}`);

  const historicalManifestRouteMap = new Map();
  allManifests.forEach(mDoc => {
    const mData = mDoc.data;
    const mDate = parseAnyDate(mData.updatedAt || mData.createdAt);
    const packages = mData.packages || [];

    packages.forEach((pkg) => {
      const slCode = (pkg.slCode || pkg.userId || pkg.customerId || '').trim().toUpperCase();
      const ruta = pkg.ruta;
      if (slCode && ruta && ruta !== 'Desconocida') {
        if (!historicalManifestRouteMap.has(slCode)) {
          historicalManifestRouteMap.set(slCode, []);
        }
        historicalManifestRouteMap.get(slCode).push({
          manifestId: mDoc.id,
          manifestNumber: mData.manifestNumber || mDoc.id,
          ruta,
          isPreSaturday: mDate ? mDate < saturdayCutoff : true
        });
      }
    });
  });

  console.log(`Customers with historical manifest routes: ${historicalManifestRouteMap.size}`);

  console.log('\n[3/3] Cross-referencing current routes against historical evidence...');
  const restorationAnalysis = [];
  let corruptedCount = 0;
  let matchesHistoricalCount = 0;
  let noPriorHistoryCount = 0;

  for (const c of updatedCustomers) {
    const slCode = c.slCode;
    const name = c.name;
    const currentRuta = c.currentRuta;

    const priorInvoices = (historicalInvoiceMap.get(slCode) || []).filter(i => i.isPreSaturday);
    const priorManifests = (historicalManifestRouteMap.get(slCode) || []).filter(m => m.isPreSaturday);

    // Determine legitimate historical route
    let historicalRuta = null;
    let evidenceSource = '';

    if (priorInvoices.length > 0) {
      historicalRuta = priorInvoices[0].ruta;
      evidenceSource = `Factura #${priorInvoices[0].invoiceNumber} (${priorInvoices[0].createdAt.slice(0, 10)})`;
    } else if (priorManifests.length > 0) {
      historicalRuta = priorManifests[0].ruta;
      evidenceSource = `Manifiesto #${priorManifests[0].manifestNumber}`;
    }

    let status = '';
    if (!historicalRuta) {
      status = 'NO_PRIOR_HISTORY';
      noPriorHistoryCount++;
    } else if (currentRuta !== historicalRuta) {
      status = 'CORRUPTED_ROUTE_NEEDS_RESTORATION';
      corruptedCount++;
    } else {
      status = 'MATCHES_HISTORICAL';
      matchesHistoricalCount++;
    }

    restorationAnalysis.push({
      slCode,
      name,
      currentRuta,
      proposedRestoredRuta: historicalRuta || currentRuta,
      evidenceSource: evidenceSource || 'Sin historial previo al 25 de Julio',
      status,
      updatedAtCR: c.updatedAtCR
    });
  }

  console.log('\n=== RESTORATION ANALYSIS RESULTS ===');
  console.log('Total Updated Customers Audited:', updatedCustomers.length);
  console.log('Customers with Corrupted Routes Needing Reversal:', corruptedCount);
  console.log('Customers Matching Historical Routes (No Corruption):', matchesHistoricalCount);
  console.log('Customers without Prior History (New/Unchanged):', noPriorHistoryCount);

  const reportOutput = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalAudited: updatedCustomers.length,
      corruptedCount,
      matchesHistoricalCount,
      noPriorHistoryCount,
    },
    restorationAnalysis,
  };

  const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/route_restoration_evidence.json';
  fs.writeFileSync(outputPath, JSON.stringify(reportOutput, null, 2));
  console.log(`\n✅ Route Restoration Evidence Report saved to: ${outputPath}`);
}

main().catch(err => console.error('CRITICAL RESTORATION ERROR:', err));
