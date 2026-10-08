/**
 * Reconciliation SP1 ↔ SP2 "En Consolidación" (2026-09-28). READ-ONLY by default.
 *
 * Truth = SP1: packages SP1's Consolidation page lists (isInConsolidation) with their "Día 1" (stored firstInvoice*,
 * else the customer's SP1 invoices listing the tracking + package fields/history — functions/lib/consolidation/…).
 * Compared with SP2 consolidation_items:
 *   missing     — in consolidation in SP1, not active in SP2
 *   extra       — active in SP2, not in consolidation in SP1
 *   wrong_since — active in both, SP2 `since` ≠ SP1 Día 1 (full timestamp)
 *   no_user     — active in SP2 without userId (no SP2 account for that SL)
 * --apply repairs through SP2's endpoint (same path as the trigger, logged there with eventId "reconcile-<ts>"):
 *   missing → add · extra → remove · wrong_since → repair_since. Needs SP2_CONSOLIDATION_SYNC_URL + SP2_SYNC_SECRET.
 * A report is written to audit-output/reconcile-consolidation-<ts>.json.
 *
 * Emulator: FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-sp-qa (SP1 = db "portal", SP2 = "(default)").
 * Production: gcloud ADC for both projects (read); --apply only with the user's approval.
 * Build functions first (cd functions && npx tsc).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldPath } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const R = require(path.join(fnDir, 'lib/consolidation/consolidation-start.js'));

const APPLY = process.argv.includes('--apply');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const sp1 = getFirestore(initializeApp(emulator ? { projectId: process.env.GCLOUD_PROJECT || 'demo-sp-qa' } : { credential: applicationDefault(), projectId: 'smart-portal-admin' }, 'rec-sp1'), 'portal');
const sp2 = getFirestore(initializeApp(emulator ? { projectId: process.env.GCLOUD_PROJECT || 'demo-sp-qa' } : { credential: applicationDefault(), projectId: 'smart-portal-2' }, 'rec-sp2'));
const OUT = path.join(__dirname, '../../audit-output');

async function readAll(q0) {
  const docs = []; let last = null;
  for (;;) { let q = q0.orderBy(FieldPath.documentId()).limit(2000); if (last) q = q.startAfter(last); const s = await q.get(); docs.push(...s.docs); if (s.size < 2000) break; last = s.docs[s.docs.length - 1]; }
  return docs;
}

async function expectedFromSp1() {
  const pkgs = (await readAll(sp1.collection('packages'))).map((d) => ({ id: d.id, ...d.data() })).filter(R.isInConsolidation);
  const bySl = new Map();
  for (const sl of new Set(pkgs.map((p) => R.normSl(p.slCode || p.clientSlCode)).filter(Boolean))) {
    const [a, b] = await Promise.all([sp1.collection('invoices').where('slCode', '==', sl).get(), sp1.collection('invoices').where('clientSlCode', '==', sl).get()]);
    const m = new Map(); for (const d of [...a.docs, ...b.docs]) m.set(d.id, { id: d.id, ...d.data() });
    bySl.set(sl, [...m.values()]);
  }
  const exp = new Map();
  for (const p of pkgs) {
    const k = R.membershipKey(p); if (!k) continue;
    const hist = R.firstInvoiceFromInvoices(k.tracking, bySl.get(k.slCode) || []);
    const s = R.consolidationStart({ ...p, invoiceHistoryFirst: hist || undefined });
    exp.set(`${k.slCode}_${k.tracking}`, { ...k, sp1PackageId: p.id, since: s.date, sourceInvoiceNumber: s.invoiceNumber });
  }
  return exp;
}

(async () => {
  const exp = await expectedFromSp1();
  const items = (await readAll(sp2.collection('consolidation_items'))).map((d) => ({ id: d.id, ...d.data() }));
  const active = new Map(items.filter((x) => x.active === true).map((x) => [x.id, x]));
  const missing = [], extra = [], wrongSince = [], noUser = [];
  for (const [id, e] of exp) {
    const cur = active.get(id);
    if (!cur) missing.push(e);
    else if ((cur.since || null) !== (e.since || null)) wrongSince.push({ ...e, sp2Since: cur.since || null });
  }
  for (const [id, cur] of active) { if (!exp.has(id)) extra.push({ id, slCode: cur.slCode, tracking: cur.tracking, sp1PackageId: cur.sp1PackageId }); if (!cur.userId) noUser.push(id); }
  const report = { at: new Date().toISOString(), emulator, apply: APPLY, sp1InConsolidation: exp.size, sp2Active: active.size, missing, extra, wrongSince, noUser };
  console.log(`${emulator ? 'EMULADOR' : 'PRODUCCIÓN'} · SP1 en consolidación: ${exp.size} · SP2 activos: ${active.size} · faltan: ${missing.length} · sobran: ${extra.length} · fecha distinta: ${wrongSince.length} · sin cuenta SP2: ${noUser.length}`);
  const differences = missing.length + extra.length + wrongSince.length;
  console.log(differences ? `DIFERENCIAS: ${differences}` : 'SIN DIFERENCIAS (0)');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `reconcile-consolidation-${emulator ? 'emulador-' : ''}${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Reporte: ${path.relative(process.cwd(), file)}`);
  if (!APPLY || !differences) return;

  const url = process.env.SP2_CONSOLIDATION_SYNC_URL, secret = process.env.SP2_SYNC_SECRET;
  if (!url || !secret) { console.error('Faltan SP2_CONSOLIDATION_SYNC_URL / SP2_SYNC_SECRET: no se reparó nada.'); process.exit(2); }
  const eventId = `reconcile-${Date.now()}`, eventAt = new Date().toISOString(), by = 'reconcile-consolidation-items';
  const ops = [
    ...missing.map((e) => ({ op: 'add', ...e, reason: 'reconciliación: faltaba en SP2', eventId, eventAt, by })),
    ...extra.map((e) => ({ op: 'remove', slCode: e.slCode, tracking: e.tracking, sp1PackageId: e.sp1PackageId, reason: 'reconciliación: ya no está en consolidación en SP1', eventId, eventAt, by })),
    ...wrongSince.map((e) => ({ op: 'repair_since', ...e, reason: `reconciliación: fecha ${e.sp2Since} → ${e.since}`, eventId, eventAt, by })),
  ];
  const tally = {};
  for (let i = 0; i < ops.length; i += 100) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret }, body: JSON.stringify({ items: ops.slice(i, i + 100).map(({ sp2Since, ...x }) => x) }) });
    const json = await res.json().catch(() => ({}));
    for (const r of json.results || []) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
    if (!res.ok) console.error(`Lote ${i / 100 + 1}: HTTP ${res.status} ${json.error || ''}`);
  }
  console.log(`Reparado (eventId ${eventId}):`, JSON.stringify(tally));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
