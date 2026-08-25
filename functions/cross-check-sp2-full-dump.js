const fs = require('fs');

function normalizeSlCode(code) {
  if (!code) return '';
  const str = String(code).trim().toUpperCase();
  if (str.startsWith('SL')) return str;
  if (/^\d+$/.test(str)) return `SL${str}`;
  return str;
}

async function crossCheckDump() {
  const dump = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/all_sp2_users_with_ruta.json', 'utf8'));
  const sp2Users = dump.usersWithRuta || [];

  const sp2MapBySlCode = new Map();
  sp2Users.forEach(u => {
    const sl = normalizeSlCode(u.slCode);
    if (sl && sl !== 'N/A') {
      sp2MapBySlCode.set(sl, u);
    }
  });

  console.log(`Loaded ${sp2Users.length} SP2 users with 'ruta' property.`);
  console.log(`Mapped ${sp2MapBySlCode.size} unique slCodes from SP2.`);

  // Load the 70 restored list
  const restoredJson = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/route_restoration_evidence.json', 'utf8'));
  const allAnalysis = restoredJson.restorationAnalysis || [];
  const corrupted70 = allAnalysis.filter(x => x.status === 'CORRUPTED_ROUTE_NEEDS_RESTORATION');

  console.log(`\n=== CROSS-CHECKING THE 70 RESTORED ACCOUNTS AGAINST SP2 USERS ===`);
  console.log(`Evaluating ${corrupted70.length} restored accounts against SP2...`);

  let restoredInSP2 = 0;
  let sp2MatchedRestoredRoute = 0;
  let sp2DivergedFromRestoredRoute = 0;

  const restoredDivergences = [];

  corrupted70.forEach(item => {
    const slCode = normalizeSlCode(item.slCode);
    const restoredRoute = item.proposedRestoredRuta;
    const sp2User = sp2MapBySlCode.get(slCode);

    if (sp2User) {
      restoredInSP2++;
      const sp2Route = (sp2User.ruta || '').trim();
      if (restoredRoute && sp2Route.toLowerCase() === restoredRoute.toLowerCase()) {
        sp2MatchedRestoredRoute++;
      } else {
        sp2DivergedFromRestoredRoute++;
        restoredDivergences.push({
          slCode,
          name: item.name || sp2User.name,
          sp1RestoredRoute: restoredRoute,
          sp2Route: sp2Route,
          sp1CorruptedRoute: item.currentRuta
        });
      }
    }
  });

  console.log(`Of the 70 restored accounts:`);
  console.log(`   - Found in SP2 with 'ruta' property: ${restoredInSP2} / 70`);
  console.log(`   - SP2 route matched SP1 Restored Route 100%: ${sp2MatchedRestoredRoute}`);
  console.log(`   - SP2 route diverged from SP1 Restored Route: ${sp2DivergedFromRestoredRoute}`);

  if (restoredDivergences.length > 0) {
    console.log('\n--- DIVERGENCES BETWEEN SP1 RESTORED ROUTE AND SP2 USER ROUTE (FOR THE 70 RESTORED ACCOUNTS) ---');
    restoredDivergences.forEach(d => {
      console.log(`Client ${d.slCode} (${d.name}): SP1 Restored="${d.sp1RestoredRoute}" | SP1 Corrupted="${d.sp1CorruptedRoute}" | SP2 UserRoute="${d.sp2Route}"`);
    });
  }
}

crossCheckDump().catch(console.error);
