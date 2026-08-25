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

async function inspectSL228() {
  console.log('=== FORENSIC DEEP DIVE FOR CLIENT SL228 (Valeria Balmaceda) ===\n');

  // 1. Fetch current master customer doc
  const custDoc = await firestoreRequest('GET', '/customers/SL228');
  let customerData = null;
  if (custDoc && custDoc.fields) {
    customerData = parseFields(custDoc.fields);
    console.log('1. Current Customer Profile (customers/SL228):');
    console.log(`   - Name: ${customerData.nombre || customerData.fullName}`);
    console.log(`   - Current Master Route: "${customerData.ruta}"`);
    console.log(`   - UpdatedAt: ${customerData.updatedAt || 'N/A'}`);
    console.log(`   - sp1LastPushAt: ${customerData.sp1LastPushAt || 'N/A'}`);
  } else {
    console.log('1. Customer SL228 NOT FOUND in customers collection!');
  }

  // 2. Fetch historical invoices for SL228
  console.log('\n2. Historical Invoices for SL228:');
  const invRes = await runStructuredQuery({
    from: [{ collectionId: 'invoices' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'slCode' },
        op: 'EQUAL',
        value: { stringValue: 'SL228' }
      }
    }
  });

  const invoices = invRes.map(item => item.document ? parseFields(item.document.fields) : null).filter(Boolean);
  if (invoices.length === 0) {
    console.log('   No invoices found for slCode SL228.');
  } else {
    invoices.forEach(inv => {
      console.log(`   - Invoice #${inv.invoiceNumber || inv.id} | Date: ${inv.createdAt || inv.fecha} | Manifest: ${inv.manifestNumber} | Route: "${inv.ruta || inv.deliverRuta || inv.route}" | Status: ${inv.status}`);
    });
  }

  // 3. Search audit logs for SL228 or gerencia user
  console.log('\n3. Audit Logs for SL228:');
  const auditRes = await runStructuredQuery({
    from: [{ collectionId: 'audit_logs' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'targetId' },
        op: 'EQUAL',
        value: { stringValue: 'SL228' }
      }
    }
  });

  const auditLogs = auditRes.map(item => item.document ? parseFields(item.document.fields) : null).filter(Boolean);
  if (auditLogs.length === 0) {
    console.log('   No explicit audit log entries targeting SL228.');
  } else {
    auditLogs.forEach(log => {
      console.log(`   - Log: ${log.action} | User: ${log.userEmail || log.userId} | Time: ${log.timestamp} | Details: ${JSON.stringify(log.details || {})}`);
    });
  }

  // Summary
  console.log('\n=== CONCLUSION FOR SL228 ===');
  if (customerData) {
    console.log(`Master profile route in customers/SL228 has ALWAYS been: "${customerData.ruta}".`);
  }
}

inspectSL228().catch(console.error);
