/**
 * READ-ONLY audit: does each package's route match its customer's route, and did Nova learn
 * wrong name → customer mappings (match_feedback)? Never writes: only get() calls.
 *
 * Checks
 *   1. packages (last --days, default 90): package.ruta ≠ current customer.ruta
 *      (ruta "Encomiendas" is listed separately: it is a consolidation route, not an error).
 *   2. packages whose slCode is not a customer.
 *   3. match_feedback: learned slCode that no longer exists; stored ruta ≠ customer ruta;
 *      manifest name that does not resemble the customer's name (possible pre-alert poisoning, N15);
 *      one name learned for 2+ customers.
 *
 * Usage
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-sp-qa node scripts/audit/audit-route-consistency.cjs
 *   node scripts/audit/audit-route-consistency.cjs --project smart-portal-admin [--days 90]
 * Output: summary on screen + full JSON report in $TMPDIR.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const DAYS = Number(arg('--days', '90'));
const emulator = /^(localhost|127\.0\.0\.1):/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
const project = emulator ? (process.env.GCLOUD_PROJECT || '') : arg('--project', '');
if (!emulator && project !== 'smart-portal-admin') {
  console.error('❌ Use the QA emulator or pass --project smart-portal-admin explicitly.');
  process.exit(1);
}

const norm = (s) => String(s ?? '').trim().toLowerCase();
const tokens = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
const looksAlike = (a, b) => { const B = new Set(tokens(b)); return tokens(a).some((t) => B.has(t)); };
const toMs = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? 0 : ms;
};

async function scan(col, onDoc) {
  let last = null;
  for (;;) {
    let q = col.orderBy('__name__').limit(1000);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) return;
    page.docs.forEach(onDoc);
    last = page.docs[page.docs.length - 1];
  }
}

(async () => {
  const app = initializeApp(emulator ? { projectId: project } : { projectId: project, credential: applicationDefault() }, 'route-audit');
  const db = getFirestore(app, 'portal');
  console.log(`🔎 READ-ONLY on ${emulator ? `emulator ${project}` : `PRODUCTION ${project}`} (portal), packages of the last ${DAYS} days`);

  const customers = new Map(); // SLxxx -> { ruta, name }
  await scan(db.collection('customers'), (d) => {
    const c = d.data();
    const sl = String(c.slCode || '').toUpperCase().trim();
    if (sl) customers.set(sl, { ruta: c.ruta || '', name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') });
  });

  const since = Date.now() - DAYS * 86400000;
  const routeMismatch = [], encomiendas = [], unknownCustomer = [];
  let pkgsChecked = 0;
  await scan(db.collection('packages'), (d) => {
    const p = d.data();
    if (toMs(p.createdAt) < since) return;
    pkgsChecked++;
    const sl = String(p.clientSlCode || p.slCode || '').toUpperCase().trim();
    if (!sl) return;
    const c = customers.get(sl);
    const row = { id: d.id, tracking: p.trackingNumber || p.tracking || '', slCode: sl, packageRuta: p.ruta || '', customerRuta: c?.ruta || '', manifest: p.manifestNumber || p.manifestId || '', status: p.status || '', createdAt: new Date(toMs(p.createdAt)).toISOString() };
    if (!c) { unknownCustomer.push(row); return; }
    if (norm(p.ruta) === norm(c.ruta)) return;
    (norm(p.ruta) === 'encomiendas' ? encomiendas : routeMismatch).push(row);
  });

  const fbMissing = [], fbRuta = [], fbName = [], byName = new Map();
  let fbChecked = 0;
  await scan(db.collection('match_feedback'), (d) => {
    const f = d.data();
    fbChecked++;
    const sl = String(f.slCode || '').toUpperCase().trim();
    const row = { id: d.id, manifestName: f.manifestName || '', slCode: sl, source: f.source || '', hitCount: f.hitCount || 0, ruta: f.ruta || '' };
    const key = f.normalizedName || norm(f.manifestName);
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key).add(sl);
    const c = customers.get(sl);
    if (!c) { fbMissing.push(row); return; }
    if (f.ruta && norm(f.ruta) !== norm(c.ruta)) fbRuta.push({ ...row, customerRuta: c.ruta });
    if (!looksAlike(f.manifestName, c.name)) fbName.push({ ...row, customerName: c.name });
  });
  const fbCollisions = [...byName].filter(([, s]) => s.size > 1).map(([name, s]) => ({ name, slCodes: [...s] }));

  const report = { project, days: DAYS, generatedAt: new Date().toISOString(), customers: customers.size, pkgsChecked, routeMismatch, encomiendas, unknownCustomer, feedback: { checked: fbChecked, missingCustomer: fbMissing, rutaDiffers: fbRuta, nameDoesNotResemble: fbName, collisions: fbCollisions } };
  const out = path.join(process.env.TMPDIR || '/tmp', `route-audit-${project}-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  const show = (title, rows, fmt) => { console.log(`\n${title}: ${rows.length}`); rows.slice(0, 15).forEach((r) => console.log('   ' + fmt(r))); };
  console.log(`Clientes: ${customers.size} · paquetes revisados: ${pkgsChecked} · aprendizajes revisados: ${fbChecked}`);
  show('❗ Paquetes con ruta distinta a la del cliente', routeMismatch, (r) => `${r.tracking} ${r.slCode}  paquete="${r.packageRuta}" cliente="${r.customerRuta}"  ${r.manifest} ${r.createdAt.slice(0, 10)}`);
  show('ℹ️  Paquetes en "Encomiendas" (cliente con otra ruta)', encomiendas, (r) => `${r.tracking} ${r.slCode} cliente="${r.customerRuta}"`);
  show('❗ Paquetes con un SL que no es cliente', unknownCustomer, (r) => `${r.tracking} ${r.slCode}`);
  show('❗ Aprendizajes a un SL que ya no existe', fbMissing, (r) => `"${r.manifestName}" → ${r.slCode} (${r.source}, ×${r.hitCount})`);
  show('⚠️  Aprendizajes con ruta vieja', fbRuta, (r) => `"${r.manifestName}" → ${r.slCode} guardada="${r.ruta}" cliente="${r.customerRuta}"`);
  show('❗ Aprendizajes cuyo nombre no se parece al cliente (posible envenenamiento)', fbName, (r) => `"${r.manifestName}" → ${r.slCode} "${r.customerName}" (${r.source}, ×${r.hitCount})`);
  show('❗ Un nombre aprendido para 2+ clientes', fbCollisions, (r) => `"${r.name}" → ${r.slCodes.join(', ')}`);
  console.log(`\nReporte completo: ${out}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
