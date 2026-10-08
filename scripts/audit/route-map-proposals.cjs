/**
 * READ-ONLY (2026-09-29). The route map learns from the admins, with the owner's approval — it never changes by
 * itself. Reads every "Revisar ruta" decision (route_reviews in SP1 and SP2: resolved_in_sp1 / resolved_in_sp2)
 * and groups them by zone (province / canton / district of the new address). A zone where the admins chose the
 * SAME route at least MIN times (default 3) and that route is not what the map says today is listed as a
 * proposal. To adopt one: add it to HISTORY_RULES in functions/src/customers/route-segmentation.ts (the sheet
 * keeps winning), run the tests and scripts/route-map/export-to-sp2.sh.
 * Run: node scripts/audit/route-map-proposals.cjs [--min 3]   (needs functions/lib built)
 */
'use strict';
const path = require('path');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore } = require(path.join(A, 'lib/firestore'));
const { suggestRoute, sameRoute } = require(path.join(__dirname, '../../functions/lib/customers/route-segmentation.js'));
const args = process.argv.slice(2);
const MIN = Number(args.includes('--min') ? args[args.indexOf('--min') + 1] : 3);
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
const sp2 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-2' }, 'sp2'));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
(async () => {
  const [a, b] = await Promise.all([
    sp1.collection('route_reviews').where('event', '==', 'resolved_in_sp1').get(),
    sp2.collection('route_reviews').where('event', '==', 'resolved_in_sp2').get(),
  ]);
  const seen = new Set(); const zones = new Map();
  for (const d of [...a.docs, ...b.docs]) {
    const x = d.data(); const r = x.review || {}; const addr = r.newAddress || {};
    const key = `${x.slCode || ''}|${r.id || x.reviewId || d.id}`; if (seen.has(key)) continue; seen.add(key);
    const final = x.finalRuta || r.finalRuta; if (!final || !addr.canton) continue;
    const z = [addr.province, addr.canton, addr.district || ''].map(norm).join(' / ');
    const e = zones.get(z) || { zone: [addr.province, addr.canton, addr.district].filter(Boolean).join(' / '), addr, routes: {}, codes: new Set() };
    e.routes[final] = (e.routes[final] || 0) + 1; e.codes.add(x.slCode); zones.set(z, e);
  }
  let n = 0;
  for (const e of zones.values()) {
    const [top, count] = Object.entries(e.routes).sort((p, q) => q[1] - p[1])[0];
    const now = suggestRoute({ province: e.addr.province, canton: e.addr.canton, district: e.addr.district });
    if (count < MIN || (now && sameRoute(now.route, top))) continue;
    n++;
    console.log(`PROPUESTA ${e.zone}: los admins eligieron ${top} ${count} veces (${Object.entries(e.routes).map(([r, c]) => `${r}:${c}`).join(', ')}); el mapa dice ${now ? `${now.route} (${now.basis})` : 'sin regla'} · clientes ${[...e.codes].slice(0, 8).join(', ')}`);
  }
  console.log(`${seen.size} decisiones leídas · ${zones.size} zonas · ${n} propuesta(s) con ${MIN}+ decisiones iguales`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
