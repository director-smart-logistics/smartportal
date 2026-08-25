const fs = require('fs');
const https = require('https');

const firebaseTools = JSON.parse(fs.readFileSync('/Users/jbricenoz/.config/configstore/firebase-tools.json', 'utf8'));
const accessToken = firebaseTools.tokens.access_token;
const projectId = 'smart-portal-admin';
const databaseId = 'portal';

function firestoreRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${projectId}/databases/${databaseId}/documents${path}`,
      method: method,
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
          resolve(data ? JSON.parse(data) : null);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

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

function batchGetDocuments(documents) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${projectId}/databases/${databaseId}/documents:batchGet`,
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
    req.write(JSON.stringify({ documents }));
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

async function deepAuditManifest() {
  const manifestId = 'SL-MEGA-MAN-27-07-2026';
  console.log(`Deep auditing manifest ${manifestId}...`);

  const docData = await firestoreRequest('GET', `/manifests/${manifestId}`);
  if (!docData || !docData.fields) {
    console.error(`Manifest ${manifestId} not found!`);
    return;
  }

  const manifest = parseFields(docData.fields);
  const packages = manifest.packages || manifest.rows || [];
  console.log(`Total packages: ${packages.length}`);

  const slCodesSet = new Set();
  packages.forEach(pkg => {
    const sl = pkg.slCode || pkg.sl_code || pkg.codigoCliente;
    if (sl) slCodesSet.add(sl.trim());
  });

  // Batch get customer documents
  const customerMap = new Map();
  const slCodesArray = Array.from(slCodesSet);
  const docPaths = slCodesArray.filter(sl => sl.startsWith('SL')).map(sl => `projects/${projectId}/databases/${databaseId}/documents/customers/${sl}`);

  for (let i = 0; i < docPaths.length; i += 100) {
    const batch = docPaths.slice(i, i + 100);
    const batchRes = await batchGetDocuments(batch);
    batchRes.forEach(item => {
      if (item.found && item.found.name && item.found.fields) {
        const parts = item.found.name.split('/');
        const slCode = parts[parts.length - 1];
        customerMap.set(slCode, parseFields(item.found.fields));
      }
    });
  }

  const routeSummary = new Map();
  const unlinkedPackages = [];
  const invalidSlCodePackages = [];
  const unknownRoutePackages = [];
  const noCustomerRoutePackages = [];
  const routeMismatchPackages = [];
  const perfectPackages = [];

  packages.forEach((pkg, index) => {
    const tracking = pkg.tracking || pkg.guia || pkg.trackingNumber || `ROW_${index}`;
    const slCode = (pkg.slCode || pkg.sl_code || pkg.codigoCliente || '').trim();
    const pkgName = pkg.nombre || pkg.nombreCliente || pkg.name || 'N/A';
    const rowRuta = (pkg.ruta || pkg.route || 'DESCONOCIDA').trim();

    // Track route distribution
    routeSummary.set(rowRuta, (routeSummary.get(rowRuta) || 0) + 1);

    if (!slCode) {
      unlinkedPackages.push({ index: index + 1, tracking, pkgName, rowRuta });
      return;
    }

    if (!slCode.startsWith('SL')) {
      invalidSlCodePackages.push({ index: index + 1, tracking, pkgName, slCode, rowRuta });
      return;
    }

    const customer = customerMap.get(slCode);
    const masterRuta = customer ? (customer.ruta || '').trim() : '';
    const custName = customer ? (customer.nombre || customer.fullName || '').trim() : 'N/A';

    if (!rowRuta || rowRuta.toUpperCase() === 'DESCONOCIDA') {
      unknownRoutePackages.push({ index: index + 1, tracking, slCode, pkgName, custName, masterRuta });
      return;
    }

    if (!masterRuta) {
      noCustomerRoutePackages.push({ index: index + 1, tracking, slCode, pkgName, custName, rowRuta });
      return;
    }

    if (rowRuta.toLowerCase() !== masterRuta.toLowerCase()) {
      routeMismatchPackages.push({ index: index + 1, tracking, slCode, pkgName, custName, rowRuta, masterRuta });
      return;
    }

    perfectPackages.push({ index: index + 1, tracking, slCode, pkgName, custName, rowRuta });
  });

  console.log('\n=== COMPREHENSIVE ROUTE DIAGNOSTIC REPORT ===');
  console.log(`Total packages in manifest: ${packages.length}`);
  console.log(`1. Perfect match (Row Route === Master Route): ${perfectPackages.length}`);
  console.log(`2. Text written in slCode column (not valid SL code): ${invalidSlCodePackages.length}`);
  console.log(`3. Route is 'DESCONOCIDA' or empty: ${unknownRoutePackages.length}`);
  console.log(`4. Customer Master Profile has NO route assigned: ${noCustomerRoutePackages.length}`);
  console.log(`5. Route mismatch (Row Route != Master Route): ${routeMismatchPackages.length}`);
  console.log(`6. Unlinked packages (no slCode): ${unlinkedPackages.length}`);

  console.log('\n--- ROUTE DISTRIBUTION SUMMARY ON MANIFEST ---');
  routeSummary.forEach((count, rName) => {
    console.log(`   - Route "${rName}": ${count} packages`);
  });

  if (invalidSlCodePackages.length > 0) {
    console.log('\n--- CATEGORY 2: TEXT WRITTEN IN SLCODE COLUMN ---');
    invalidSlCodePackages.forEach(p => console.log(`   Row #${p.index} | Tracking: ${p.tracking} | PkgName: ${p.pkgName} | ValueInSlCodeCol: "${p.slCode}" | AssignedRoute: "${p.rowRuta}"`));
  }

  if (unknownRoutePackages.length > 0) {
    console.log('\n--- CATEGORY 3: ROUTE IS DESCONOCIDA ---');
    unknownRoutePackages.forEach(p => console.log(`   Row #${p.index} | Tracking: ${p.tracking} | slCode: ${p.slCode} | PkgName: ${p.pkgName} | MasterRoute: "${p.masterRuta}"`));
  }

  if (noCustomerRoutePackages.length > 0) {
    console.log('\n--- CATEGORY 4: CUSTOMER PROFILE HAS NO ROUTE ---');
    noCustomerRoutePackages.forEach(p => console.log(`   Row #${p.index} | Tracking: ${p.tracking} | slCode: ${p.slCode} | CustName: ${p.custName} | RowRoute: "${p.rowRuta}"`));
  }

  if (routeMismatchPackages.length > 0) {
    console.log('\n--- CATEGORY 5: ROUTE MISMATCHES ---');
    routeMismatchPackages.forEach(p => console.log(`   Row #${p.index} | Tracking: ${p.tracking} | slCode: ${p.slCode} | CustName: ${p.custName} | RowRoute: "${p.rowRuta}" vs MasterRoute: "${p.masterRuta}"`));
  }
}

deepAuditManifest().catch(console.error);
