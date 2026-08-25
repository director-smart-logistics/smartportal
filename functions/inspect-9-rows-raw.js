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

async function inspect9RowsRaw() {
  const manifestId = 'SL-MEGA-MAN-27-07-2026';
  const docData = await firestoreRequest('GET', `/manifests/${manifestId}`);
  const manifest = parseFields(docData.fields);
  const packages = manifest.packages || manifest.rows || [];

  const targetIndices = [76, 88, 99, 101, 134, 137, 145, 182, 248];

  console.log('=== RAW FIELDS FOR THE 9 ROWS IN MANIFEST DOCUMENT ===\n');

  targetIndices.forEach(idx => {
    const pkg = packages[idx - 1]; // 1-indexed to 0-indexed
    if (pkg) {
      console.log(`Row #${idx}:`);
      console.log(`   Tracking: ${pkg.tracking}`);
      console.log(`   Nombre: "${pkg.nombre}" | NombreCliente: "${pkg.nombreCliente}"`);
      console.log(`   slCode: "${pkg.slCode}" | sl_code: "${pkg.sl_code}" | codigoCliente: "${pkg.codigoCliente}"`);
      console.log(`   Ruta: "${pkg.ruta}" | Route: "${pkg.route}"`);
      console.log(`   Raw Record Keys:`, Object.keys(pkg));
      console.log('---');
    }
  });
}

inspect9RowsRaw().catch(console.error);
