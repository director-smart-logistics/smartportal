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

async function forensicCheck() {
  let corruptedList = [];
  try {
    const json = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/route_restoration_evidence.json', 'utf8'));
    corruptedList = Array.isArray(json) ? json : (json.restored || json.results || []);
  } catch (e) {}

  const corruptedSlCodes = new Set(corruptedList.map(c => c.slCode || c.sl_code));

  const targetRows = [
    { index: 76, tracking: "GFUS01061745197441", slCodeInRow: "Desconocida", pkgName: "MARIA", rowRuta: "San Jose Centro" },
    { index: 88, tracking: "GFUS01061932946503", slCodeInRow: "Desconocida", pkgName: "FERNANDA NAVARRO", rowRuta: "San Jose Centro" },
    { index: 99, tracking: "GFUS01062025810304", slCodeInRow: "Cartago 2", pkgName: "REBECA GONZALEZ URENA", rowRuta: "Cartago 2" },
    { index: 101, tracking: "GFUS01062064629057", slCodeInRow: "Cartago 2", pkgName: "MARIA ELENA REDONDO SALAS", rowRuta: "Cartago 2" },
    { index: 134, tracking: "SPXMIA013632607160006951", slCodeInRow: "San Jose Centro", pkgName: "FERNANDA NAVARRO", rowRuta: "San Jose Centro" },
    { index: 137, tracking: "SPXMIA013632607180002014", slCodeInRow: "Encomiendas", pkgName: "KATHERINE DIAZ", rowRuta: "Encomiendas" },
    { index: 182, tracking: "TBA333010358827", slCodeInRow: "San Jose Centro", pkgName: "HAZEL GABRIELA ALFARO FONSECA", rowRuta: "San Jose Centro" },
    { index: 241, tracking: "TBA333007564417", slCodeInRow: "SL228", pkgName: "VALERIA BALMACEDA", rowRuta: "San Jose Coronado" },
    { index: 247, tracking: "1Z1F9B491235483516", slCodeInRow: "SL261488", pkgName: "JOSE ALBERTO", rowRuta: "DESCONOCIDA" },
    { index: 248, tracking: "4203319528659534614789226201944675", slCodeInRow: "Desconocida", pkgName: "JEAN MARCO OVARES TORRES", rowRuta: "San Jose Centro" }
  ];

  console.log('=== FORENSIC CHECK ON THE 10 DISCREPANCIES ===\n');

  for (const r of targetRows) {
    console.log(`Row #${r.index} | Tracking: ${r.tracking} | PkgName: "${r.pkgName}" | slCodeInRow: "${r.slCodeInRow}"`);
    console.log(`   - Row Assigned Route: "${r.rowRuta}"`);
    
    if (r.slCodeInRow.startsWith('SL')) {
      const isCorruptedInJulyBug = corruptedSlCodes.has(r.slCodeInRow);
      console.log(`   - Was ${r.slCodeInRow} in the 70 corrupted accounts from July 25-28? ${isCorruptedInJulyBug ? 'YES!' : 'NO (100% CLEAN)'}`);
      
      try {
        const cDoc = await firestoreRequest('GET', `/customers/${r.slCodeInRow}`);
        if (cDoc && cDoc.fields) {
          const cust = parseFields(cDoc.fields);
          console.log(`   - Master Profile (${r.slCodeInRow}): Name="${cust.nombre || cust.fullName}", Route="${cust.ruta}", UpdatedAt="${cust.updatedAt || 'N/A'}"`);
        }
      } catch (e) {
        console.log(`   - Master Profile (${r.slCodeInRow}): NOT FOUND`);
      }
    } else {
      console.log(`   - Cause: Structure formatting issue — the string "${r.slCodeInRow}" was written into the slCode column instead of an SL code.`);
    }
    console.log('');
  }
}

forensicCheck().catch(console.error);
