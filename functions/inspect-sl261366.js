const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

function getAccessToken() {
  return execSync('gcloud auth print-access-token').toString().trim();
}

const accessToken = getAccessToken();
const projectId = 'smart-portal-admin';
const databaseId = 'portal';

function runStructuredQuery(structuredQuery) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : []);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ structuredQuery }));
    req.end();
  });
}

function parseFirestoreValue(val) {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
  if (val.doubleValue !== undefined) return parseFloat(val.doubleValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.mapValue !== undefined) {
    const obj = {};
    const fields = val.mapValue.fields || {};
    for (const k in fields) {
      obj[k] = parseFirestoreValue(fields[k]);
    }
    return obj;
  }
  if (val.arrayValue !== undefined) {
    const arr = val.arrayValue.values || [];
    return arr.map(parseFirestoreValue);
  }
  return null;
}

function parseFields(fields) {
  const res = {};
  for (const key in fields) {
    res[key] = parseFirestoreValue(fields[key]);
  }
  return res;
}

async function inspectSL261366() {
  console.log('=== HISTORICAL EVIDENCE FOR CLIENT SL261366 (Gloriana Quirós) ===\n');

  // Check evidence JSON
  try {
    const json = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/route_restoration_evidence.json', 'utf8'));
    const item = (json.restorationAnalysis || []).find(x => x.slCode === 'SL261366');
    if (item) {
      console.log('1. Restoration Analysis Evidence Entry:');
      console.log(`   - slCode: ${item.slCode}`);
      console.log(`   - Name: ${item.name}`);
      console.log(`   - Current Ruta (during bug): "${item.currentRuta}"`);
      console.log(`   - Proposed Restored Ruta: "${item.proposedRestoredRuta}"`);
      console.log(`   - Evidence Source Cited: "${item.evidenceSource}"`);
      console.log(`   - Status: ${item.status}\n`);
    }
  } catch (e) {}

  // Fetch all historical invoices for SL261366
  console.log('2. Querying all historical invoices for SL261366 in Firestore...');
  const invRes = await runStructuredQuery({
    from: [{ collectionId: 'invoices' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'slCode' },
        op: 'EQUAL',
        value: { stringValue: 'SL261366' }
      }
    }
  });

  const invoices = invRes.map(item => item.document ? parseFields(item.document.fields) : null).filter(Boolean);
  console.log(`Found ${invoices.length} historical invoices for SL261366:`);
  invoices.forEach((inv, i) => {
    console.log(`   [Invoice ${i+1}] #${inv.invoiceNumber || inv.id} | Date: ${inv.createdAt || inv.fecha} | Manifest: "${inv.manifestNumber}" | Route: "${inv.ruta || inv.deliverRuta || inv.route}" | Status: ${inv.status}`);
  });

  // Query historical manifests
  console.log('\n3. Querying historical manifests containing SL261366...');
  const sampleManifests = ['16-07-2026DAN', 'MEGA-MAN-21-07-2026', 'MEGA-MAN-23-06-2026', 'SL-MEGA-MAN-27-07-2026'];
  for (const mId of sampleManifests) {
    try {
      const options = {
        hostname: 'firestore.googleapis.com',
        path: `/v1/projects/${projectId}/databases/${databaseId}/documents/manifests/${mId}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      };
      const dataStr = await new Promise(r => {
        const req = https.request(options, res => {
          let d = '';
          res.on('data', chunk => d += chunk);
          res.on('end', () => r(d));
        });
        req.end();
      });
      const parsed = JSON.parse(dataStr);
      if (parsed && parsed.fields) {
        const m = parseFields(parsed.fields);
        const pkgs = m.packages || m.rows || [];
        const matchingPkgs = pkgs.filter(p => (p.slCode || p.sl_code || p.codigoCliente) === 'SL261366');
        matchingPkgs.forEach(p => {
          console.log(`   [Manifest ${mId}] Tracking: ${p.tracking || p.guia} | Row Assigned Route: "${p.ruta}"`);
        });
      }
    } catch (e) {}
  }
}

inspectSL261366().catch(console.error);
