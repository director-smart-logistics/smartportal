/**
 * READ-ONLY (2026-09-29). How the route map (sheet → route history → encomienda zones; street text never decides)
 * compares with the route each SP1 customer has today, and which OPEN "Revisar ruta" reviews would get a
 * different recommendation. Nothing is written. Output: audit-output/route-map-impact-<date>.xlsx
 * Run: node scripts/audit/route-map-impact.cjs   (needs functions/lib built)
 */
'use strict';
const path = require('path');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore } = require(path.join(A, 'lib/firestore'));
const XLSX = require(path.join(__dirname, '../../node_modules/xlsx'));
const { suggestRoute, sameRoute } = require(path.join(__dirname, '../../functions/lib/customers/route-segmentation.js'));
const sp1 = getFirestore(initializeApp({ credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'sp1'), 'portal');
(async () => {
  const s = await sp1.collection('customers').get();
  const rows = []; const tally = { igual: 0, distinta: 0, sinRegla: 0, sinDireccion: 0, sinRuta: 0 }; const reviews = [];
  for (const d of s.docs) {
    const x = d.data(); const a = x.defaultAddress || null; const ruta = String(x.ruta || '').trim();
    if (!a || !(a.province || a.canton)) { tally.sinDireccion++; continue; }
    const sug = suggestRoute({ province: a.province, canton: a.canton, district: a.district, requiresEncomienda: a.requiresEncomienda });
    const rr = x.routeReview;
    if (rr && rr.status === 'pending') {
      const oldS = rr.suggestedRuta || null; const newS = sug ? sug.route : null;
      if (!sameRoute(oldS, newS)) reviews.push({ codigo: d.id, zona: [a.province, a.canton, a.district].filter(Boolean).join(' / '), rutaActual: ruta, recomendadaAntes: oldS, recomendadaAhora: newS, motivo: sug ? sug.basis : '' });
    }
    if (!ruta || /definir|desconoc|sin ruta/i.test(ruta)) { tally.sinRuta++; continue; }
    if (!sug) { tally.sinRegla++; continue; }
    if (sameRoute(ruta, sug.route)) { tally.igual++; continue; }
    tally.distinta++;
    rows.push({ codigo: d.id, cliente: `${x.firstName || ''} ${x.lastName || ''}`.trim(), zona: [a.province, a.canton, a.district].filter(Boolean).join(' / '), rutaActual: ruta, mapa: sug.route, motivo: sug.basis });
  }
  const out = path.join(__dirname, '../../audit-output', `route-map-impact-${new Date().toISOString().slice(0, 10)}.xlsx`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Ruta distinta al mapa');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reviews), 'Revisiones abiertas');
  XLSX.writeFile(wb, out);
  console.log(JSON.stringify(tally));
  const byPair = {}; for (const r of rows) { const k = `${r.rutaActual} → mapa ${r.mapa}`; byPair[k] = (byPair[k] || 0) + 1; }
  for (const [k, n] of Object.entries(byPair).sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), k);
  console.log(`Revisiones abiertas con recomendación distinta: ${reviews.length}`);
  for (const r of reviews) console.log(`  ${r.codigo} ${r.zona}: ${r.recomendadaAntes} → ${r.recomendadaAhora} (ruta ${r.rutaActual})`);
  console.log('Lista:', out);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
