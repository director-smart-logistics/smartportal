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
  console.log('=== SYSTEM-WIDE FORENSIC ROUTE AUDIT (Since Saturday July 25, 2026) ===');
  console.log('Execution Time:', new Date().toISOString());

  // Date range: Saturday July 25, 2026 00:00:00 UTC to Present
  const saturdayDate = new Date('2026-07-25T00:00:00.000Z');

  console.log('\n[1/3] Fetching ALL master customers from Firestore database "portal"...');
  const allCustomers = await listCollectionDocs('customers', 500);
  console.log(`Total Master Customers in DB: ${allCustomers.length}`);

  console.log('\n[2/3] Fetching ALL audit logs from Firestore...');
  const allAuditLogs = await listCollectionDocs('audit_logs', 500);
  console.log(`Total Audit Logs in DB: ${allAuditLogs.length}`);

  // Filter audit logs for route updates or customer updates since July 25
  const relevantAuditLogs = [];
  allAuditLogs.forEach(al => {
    const d = al.data;
    const tsStr = d.timestamp || d.createdAt || d.updatedAt;
    if (!tsStr) return;
    const logTime = new Date(tsStr);
    if (logTime >= saturdayDate) {
      const action = String(d.action || d.type || '').toLowerCase();
      const detailsStr = JSON.stringify(d.details || {}).toLowerCase();
      const isRouteRelated = action.includes('route') || action.includes('customer') || detailsStr.includes('ruta') || detailsStr.includes('route');

      relevantAuditLogs.push({
        id: al.id,
        timestamp: logTime.toISOString(),
        timestampCR: new Date(logTime.getTime() - 6 * 3600 * 1000).toISOString().replace('Z', ' (Hora Costa Rica)'),
        action: d.action || d.type || 'N/A',
        userId: d.userId || d.userEmail || d.operator || 'system',
        targetId: d.targetId || 'N/A',
        isRouteRelated,
        details: d.details || d.metadata || {},
      });
    }
  });

  console.log(`Audit Logs since Saturday July 25: ${relevantAuditLogs.length}`);

  console.log('\n[3/3] Inspecting ALL customers updated since Saturday July 25...');
  const updatedCustomersSinceSaturday = [];

  allCustomers.forEach(c => {
    const d = c.data;
    const slCode = (d.slCode || c.id).trim().toUpperCase();
    const name = d.fullName || d.name || 'DESCONOCIDO';
    const currentRuta = d.ruta || d.route || 'NO REGISTRADA';

    const tsStr = d.updatedAt || d.sp1AdminUpdatedAt || null;
    let updatedAtDate = null;
    if (tsStr) updatedAtDate = new Date(tsStr);

    if (updatedAtDate && updatedAtDate >= saturdayDate) {
      const updatedAtCR = new Date(updatedAtDate.getTime() - 6 * 3600 * 1000).toISOString().replace('Z', ' (Hora CR)');

      // Find any audit log matching this slCode
      const customerAuditLogs = relevantAuditLogs.filter(l =>
        l.targetId === slCode ||
        l.targetId === c.id ||
        JSON.stringify(l.details).includes(slCode)
      );

      updatedCustomersSinceSaturday.push({
        slCode,
        name,
        currentRuta,
        updatedAt: updatedAtDate.toISOString(),
        updatedAtCR,
        auditLogsCount: customerAuditLogs.length,
        auditLogs: customerAuditLogs.map(l => ({
          timestampCR: l.timestampCR,
          action: l.action,
          userId: l.userId,
          details: l.details
        }))
      });
    }
  });

  // Sort by updatedAt descending
  updatedCustomersSinceSaturday.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  console.log('\n=== AUDIT SUMMARY RESULTS ===');
  console.log('Total System Master Customers:', allCustomers.length);
  console.log('Customers Updated Since Saturday July 25:', updatedCustomersSinceSaturday.length);
  console.log('Relevant Audit Logs Since Saturday July 25:', relevantAuditLogs.length);

  const reportOutput = {
    generatedAt: new Date().toISOString(),
    filterStartDate: saturdayDate.toISOString(),
    summary: {
      totalCustomersInSystem: allCustomers.length,
      customersUpdatedSinceSaturdayCount: updatedCustomersSinceSaturday.length,
      auditLogsSinceSaturdayCount: relevantAuditLogs.length,
    },
    auditLogsSinceSaturday: relevantAuditLogs,
    updatedCustomers: updatedCustomersSinceSaturday,
  };

  const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/systemwide_customer_route_audit.json';
  fs.writeFileSync(outputPath, JSON.stringify(reportOutput, null, 2));
  console.log(`\n✅ System-wide Route Audit Report saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('CRITICAL SYSTEM AUDIT ERROR:', err);
});
