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

async function inspectHistoricalSL228() {
  const manifests = ['MEGA-MAN-23-06-2026', 'MEGA-MAN-02-07-2026', '16-07-2026DAN', 'SL-MEGA-MAN-27-07-2026'];
  console.log('=== HISTORICAL ROUTE HISTORY FOR SL228 (Valeria Balmaceda) ===\n');

  for (const mId of manifests) {
    try {
      const docData = await firestoreRequest('GET', `/manifests/${mId}`);
      if (docData && docData.fields) {
        const m = parseFields(docData.fields);
        const pkgs = m.packages || m.rows || [];
        const sl228Pkgs = pkgs.filter(p => (p.slCode || p.sl_code || p.codigoCliente) === 'SL228');
        sl228Pkgs.forEach(p => {
          console.log(`Manifest: ${mId} | Tracking: ${p.tracking || p.guia} | Row Assigned Route: "${p.ruta}"`);
        });
      }
    } catch (e) {}
  }
}

inspectHistoricalSL228().catch(console.error);
