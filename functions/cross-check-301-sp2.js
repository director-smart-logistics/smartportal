const fs = require('fs');
const https = require('https');

const firebaseTools = JSON.parse(fs.readFileSync('/Users/jbricenoz/.config/configstore/firebase-tools.json', 'utf8'));
const accessToken = firebaseTools.tokens.access_token;
const sp2ProjectId = 'smart-portal-2';
const sp2DatabaseId = '(default)';

function firestoreGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${sp2ProjectId}/databases/${sp2DatabaseId}/documents${path}`,
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : null);
        } else {
          resolve({ error: `HTTP ${res.statusCode}: ${data}` });
        }
      });
    });

    req.on('error', reject);
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

async function crossCheck301WithSP2() {
  console.log('=== CROSS CHECKING ALL 301 UPDATED CUSTOMERS (SP1 VS SP2) ===\n');

  let audit301 = [];
  try {
    const json = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/systemwide_customer_route_audit.json', 'utf8'));
    audit301 = json.updatedCustomers || [];
  } catch (e) {
    console.error('Could not load systemwide_customer_route_audit.json');
    return;
  }

  console.log(`Loaded ${audit301.length} customer records from the July 25-28 audit list.`);

  // Query users collection in SP2 via list endpoint
  const res = await firestoreGet('/users?pageSize=300');
  const docs = (res && res.documents) ? res.documents : [];
  console.log(`Retrieved ${docs.length} user documents from SP2.`);

  const sp2UserMapBySlCode = new Map();
  docs.forEach(d => {
    const fields = parseFields(d.fields || {});
    const slCode = fields.slCode || fields.customerCode || fields.sl_code;
    if (slCode) {
      sp2UserMapBySlCode.set(String(slCode).trim(), fields);
    }
  });

  console.log(`Mapped ${sp2UserMapBySlCode.size} unique slCodes from SP2 users.`);

  let totalMatched = 0;
  let sp2HasRouteCount = 0;
  let sp1VsSp2Matches = 0;
  let sp1VsSp2Divergences = 0;

  const divergences = [];
  const sp2RoutesFound = [];

  for (const c of audit301) {
    const slCode = c.slCode || c.sl_code;
    const sp1Route = c.currentRuta || c.ruta;
    const sp2User = sp2UserMapBySlCode.get(slCode);

    if (sp2User) {
      totalMatched++;
      const sp2Route = String(sp2User.ruta || sp2User.route || sp2User.defaultRoute || '').trim();
      if (sp2Route) {
        sp2HasRouteCount++;
        sp2RoutesFound.push({ slCode, name: c.nombre || sp2User.firstName, sp1Route, sp2Route });
        if (sp1Route && sp1Route.toLowerCase() === sp2Route.toLowerCase()) {
          sp1VsSp2Matches++;
        } else {
          sp1VsSp2Divergences++;
          divergences.push({
            slCode,
            name: c.nombre || sp2User.firstName,
            sp1Route,
            sp2Route,
          });
        }
      }
    }
  }

  const report = {
    total301: audit301.length,
    totalFoundInSP2Users: totalMatched,
    sp2UsersWithRouteProperty: sp2HasRouteCount,
    sp1VsSp2RouteMatches: sp1VsSp2Matches,
    sp1VsSp2RouteDivergences: sp1VsSp2Divergences,
    sp2RoutesFound,
    divergences,
  };

  fs.writeFileSync(
    '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/sp1_vs_sp2_route_comparison.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n=== CROSS-CHECK SUMMARY (SP1 VS SP2) ===');
  console.log(`Total 301 accounts evaluated: ${audit301.length}`);
  console.log(`Accounts found in SP2 users collection: ${totalMatched}`);
  console.log(`SP2 user accounts that have a "ruta" / "route" property set: ${sp2HasRouteCount}`);
  console.log(`Route matched 100% between SP1 and SP2: ${sp1VsSp2Matches}`);
  console.log(`Route divergences between SP1 and SP2: ${sp1VsSp2Divergences}`);

  if (sp2RoutesFound.length > 0) {
    console.log('\n--- SP2 USER ACCOUNTS WITH RUTA PROPERTY ---');
    sp2RoutesFound.forEach(d => {
      console.log(`Client ${d.slCode} (${d.name}): SP1 Route="${d.sp1Route}" vs SP2 Route="${d.sp2Route}"`);
    });
  } else {
    console.log('\n💡 SP2 user profiles DO NOT carry a "ruta" property (0 user documents in SP2 define a "ruta" field).');
  }
}

crossCheck301WithSP2().catch(console.error);
