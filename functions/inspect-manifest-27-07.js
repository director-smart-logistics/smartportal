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

async function auditManifest2707() {
  const manifestId = 'SL-MEGA-MAN-27-07-2026';
  console.log(`Auditing manifest ${manifestId}...`);

  const docData = await firestoreRequest('GET', `/manifests/${manifestId}`);
  if (!docData || !docData.fields) {
    console.error(`Manifest ${manifestId} not found!`);
    return;
  }

  const manifest = parseFields(docData.fields);
  const packages = manifest.packages || manifest.rows || [];
  console.log(`Manifest ${manifestId} contains ${packages.length} packages.`);

  const slCodesSet = new Set();
  packages.forEach(pkg => {
    const sl = pkg.slCode || pkg.sl_code || pkg.codigoCliente;
    if (sl) slCodesSet.add(sl.trim());
  });

  console.log(`Unique slCodes: ${slCodesSet.size}`);

  // Batch get customer documents
  const customerMap = new Map();
  const slCodesArray = Array.from(slCodesSet);
  const docPaths = slCodesArray.map(sl => `projects/${projectId}/databases/${databaseId}/documents/customers/${sl}`);

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

  console.log(`Fetched ${customerMap.size} customer master profiles.`);

  // Fetch invoices for manifest
  const invQueryResult = await runStructuredQuery({
    from: [{ collectionId: 'invoices' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'manifestNumber' },
        op: 'EQUAL',
        value: { stringValue: manifestId }
      }
    }
  });

  const invoiceMap = new Map();
  invQueryResult.forEach(item => {
    if (item.document && item.document.fields) {
      const inv = parseFields(item.document.fields);
      const slCode = inv.slCode || inv.customerCode || inv.codigoCliente;
      if (slCode) {
        if (!invoiceMap.has(slCode)) invoiceMap.set(slCode, []);
        invoiceMap.get(slCode).push(inv);
      }
    }
  });

  console.log(`Found ${invQueryResult.length} total invoice documents for manifest.`);

  // Audit each package
  const rowsAudit = [];
  let totalOK = 0;
  let totalDiscrepancies = 0;
  const discrepanciesList = [];

  packages.forEach((pkg, index) => {
    const tracking = pkg.tracking || pkg.guia || pkg.trackingNumber || `ROW_${index}`;
    const slCode = pkg.slCode || pkg.sl_code || pkg.codigoCliente || 'UNLINKED';
    const pkgName = pkg.nombre || pkg.nombreCliente || pkg.name || 'N/A';
    const rowRuta = String(pkg.ruta || pkg.route || 'DESCONOCIDA').trim();

    const customer = customerMap.get(slCode);
    const masterRuta = customer ? String(customer.ruta || 'SIN_RUTA').trim() : 'N/A';
    const custName = customer ? String(customer.nombre || customer.fullName || 'N/A').trim() : 'N/A';

    const invoices = invoiceMap.get(slCode) || [];
    const invoiceDetails = invoices.map(inv => {
      const r = String(inv.ruta || inv.deliverRuta || inv.route || 'DESCONOCIDA').trim();
      return {
        invoiceNumber: inv.invoiceNumber || inv.consecutivo || inv.id || 'N/A',
        ruta: r,
        status: inv.status || 'N/A',
      };
    });

    const isRowVsMasterMatch = (rowRuta.toLowerCase() === masterRuta.toLowerCase());
    const isInvoiceVsMasterMatch = invoiceDetails.length === 0 || invoiceDetails.every(i => i.ruta.toLowerCase() === masterRuta.toLowerCase());

    const isOK = isRowVsMasterMatch && isInvoiceVsMasterMatch;
    if (isOK) {
      totalOK++;
    } else {
      totalDiscrepancies++;
      discrepanciesList.push({
        index: index + 1,
        tracking,
        slCode,
        pkgName,
        custName,
        rowRuta,
        masterRuta,
        invoices: invoiceDetails,
        reason: !isRowVsMasterMatch && !isInvoiceVsMasterMatch 
          ? 'ROW_AND_INVOICE_MISMATCH' 
          : !isRowVsMasterMatch ? 'ROW_MISMATCH' : 'INVOICE_MISMATCH'
      });
    }

    rowsAudit.push({
      index: index + 1,
      tracking,
      slCode,
      pkgName,
      custName,
      rowRuta,
      masterRuta,
      invoicesCount: invoices.length,
      invoiceDetails,
      isOK,
    });
  });

  const report = {
    manifestId,
    totalPackages: packages.length,
    uniqueCustomers: slCodesSet.size,
    totalInvoices: invQueryResult.filter(i => i.document).length,
    totalOK,
    totalDiscrepancies,
    discrepanciesList,
  };

  fs.writeFileSync(
    '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/manifest_27_07_audit_report.json',
    JSON.stringify(report, null, 2)
  );

  console.log(`\n=== AUDIT REPORT FOR ${manifestId} ===`);
  console.log(`Total packages: ${packages.length}`);
  console.log(`Unique slCodes: ${slCodesSet.size}`);
  console.log(`Total invoices found: ${report.totalInvoices}`);
  console.log(`Packages 100% OK (Route matched across manifest, master profile & invoices): ${totalOK}`);
  console.log(`Packages with Route Discrepancies: ${totalDiscrepancies}`);
}

auditManifest2707().catch(console.error);
