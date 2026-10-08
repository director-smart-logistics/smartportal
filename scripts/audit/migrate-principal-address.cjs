/**
 * F12 — ULTRA-SAFE migration: each customer's principal address from the SP2 `addresses` collection
 * into their own users/{uid} doc (defaultAddress + addresses: [same], addressModel 'single-v1').
 * Plan and rules: docs/F12_ADDRESS_STRUCTURE_PLAN.md. Rule shared with the audit: address-principal.cjs.
 *
 * WHO IS MIGRATED (anything else is only reported — never written):
 *   users doc exists, slCode, SP1 customer exists, ONE principal (not ambiguous), taken from the
 *   collection, and the SP1 customer's address (what every label prints) is THE SAME address.
 *
 * SAFETY
 *   1. Dry-run unless --apply. Production only with --prod (default: QA emulator).
 *   2. Snapshot first: audit-output/f12-migration-<runId>/snapshot.json (before values of every
 *      candidate) — written BEFORE any write.
 *   3. One customer = one SP2 transaction: re-reads the user and the source address; aborts that
 *      customer if either changed since the snapshot (the customer edited meanwhile).
 *   4. The address text is never rewritten (canonicalAddress keeps the values; legacy field names →
 *      standard names exactly as SP1 already maps them). The collection documents are NOT touched.
 *   5. profileLastUpdatedBy 'system_migration' → no management e-mails. The users write pushes the
 *      customer to SP1 (normal SP2 trigger).
 *   6. Verification per batch: re-read users (fingerprint = source, one block, single-v1) and watch
 *      the SP1 customer for --watch seconds: what it prints must stay EXACTLY the baseline.
 *      Any difference → that customer is restored from the snapshot and the run STOPS (exit 2).
 *   7. Log: address_migration_log/{uid} in SP2 (runId, before, after, fingerprints, result).
 *   8. --rollback <runId> restores every customer of that run from its logged "before".
 *   9. Gradual: --sl <SL>[,<SL>…] (only those), --limit <n> (max customers this run), --batch <n> (verify every n).
 *
 * Usage
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-sp-qa node scripts/audit/migrate-principal-address.cjs [--apply] [--sl SL90001]
 *   node scripts/audit/migrate-principal-address.cjs --prod                               # dry-run, full report
 *   node scripts/audit/migrate-principal-address.cjs --prod --apply --sl SL25001           # ONLY with approval
 *   node scripts/audit/migrate-principal-address.cjs --prod --apply --limit 10 --batch 10  # ONLY with approval
 *   node scripts/audit/migrate-principal-address.cjs --prod --rollback <runId>            # restore a run
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldValue } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { principalOf, canonicalAddress, labelFingerprint, sameAddress, hasAddress } = require('./address-principal.cjs');

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const APPLY = args.includes('--apply');
const ROLLBACK = arg('--rollback', '');
const ONLY_SL = new Set(String(arg('--sl', '')).toUpperCase().split(',').map((x) => x.trim()).filter(Boolean));   // one or a comma list
const LIMIT = Number(arg('--limit', '0')) || Infinity;
const BATCH = Math.max(1, Number(arg('--batch', '10')));
const WATCH_S = Math.max(3, Number(arg('--watch', '12')));
const emulator = /^(localhost|127\.0\.0\.1):/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
const PROD = args.includes('--prod');
if (!emulator && !PROD) { console.error('❌ Use the QA emulator or pass --prod explicitly.'); process.exit(1); }
if (emulator && !String(process.env.GCLOUD_PROJECT || '').startsWith('demo-')) { console.error('❌ Emulator run requires a demo- GCLOUD_PROJECT.'); process.exit(1); }
if (PROD && APPLY && !ONLY_SL.size && LIMIT === Infinity) { console.error('❌ In production --apply needs --sl or --limit (gradual rollout).'); process.exit(1); }
// Test hooks — emulator only (the e2e forces a concurrent edit / an SP1 mismatch to prove the stop).
const TEST_MUTATE_UID = emulator ? (process.env.F12_TEST_MUTATE_UID || '') : '';
const TEST_BREAK_SL = emulator ? String(process.env.F12_TEST_BREAK_SL || '').toUpperCase() : '';

const OUT = arg('--out', path.join(__dirname, '../../audit-output'));
const runId = ROLLBACK || `${new Date().toISOString().replace(/[:.]/g, '-')}${emulator ? '-emu' : ''}`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = 'address_migration_log';

const sp2 = getFirestore(emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'sp2') : initializeApp({ projectId: 'smart-portal-2', credential: applicationDefault() }, 'sp2'));
const sp1 = getFirestore(emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'sp1') : initializeApp({ projectId: 'smart-portal-admin', credential: applicationDefault() }, 'sp1'), 'portal');

/** The users fields this migration writes — the snapshot keeps their "before" (absent = null + flag). */
const TOUCHED = ['defaultAddress', 'addresses', 'addressModel', 'addressMigratedAt', 'addressMigration', 'profileLastUpdatedBy'];
const beforeOf = (user) => Object.fromEntries(TOUCHED.map((k) => [k, user[k] === undefined ? { absent: true } : { value: user[k] }]));
const restorePayload = (before) => Object.fromEntries(TOUCHED.map((k) => [k, before[k]?.absent ? FieldValue.delete() : before[k].value]));

async function rollback() {
  const snap = await sp2.collection(LOG).where('runId', '==', runId).get();
  console.log(`ROLLBACK of run ${runId} on ${emulator ? 'emulator' : 'PRODUCTION'}: ${snap.size} customers`);
  let n = 0;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.result !== 'migrated') continue;
    await sp2.collection('users').doc(d.id).update(restorePayload(x.before));
    await d.ref.update({ result: 'rolled-back', rolledBackAt: FieldValue.serverTimestamp() });
    n++; console.log(`   restaurado ${x.slCode} (${d.id})`);
  }
  console.log(`✅ ${n} clientes restaurados`);
}

async function main() {
  if (ROLLBACK) return rollback();
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} run ${runId} on ${emulator ? 'emulator' : 'PRODUCTION'}${ONLY_SL.size ? ` (only ${[...ONLY_SL].join(', ')})` : ''}${LIMIT !== Infinity ? ` (limit ${LIMIT})` : ''}`);
  const [users, addrs, customers] = await Promise.all([sp2.collection('users').get(), sp2.collection('addresses').get(), sp1.collection('customers').get()]);
  const addrsByUser = new Map();
  for (const d of addrs.docs) { const u = d.get('userId'); if (u) (addrsByUser.get(u) || addrsByUser.set(u, []).get(u)).push({ id: d.id, ...d.data() }); }
  const custBySl = new Map(customers.docs.map((d) => [String(d.id).toUpperCase(), d.data()]));

  // ── 1. Plan + snapshot (no writes) ────────────────────────────────────────
  const plan = []; const skipped = {};
  const skip = (why, row) => { (skipped[why] = skipped[why] || []).push(row); };
  for (const u of users.docs) {
    const x = u.data(); const sl = String(x.slCode || '').toUpperCase();
    if (ONLY_SL.size && !ONLY_SL.has(sl)) continue;
    const row = { uid: u.id, sl };
    if (!sl) { skip('sin slCode', row); continue; }
    const c = custBySl.get(sl);
    if (!c) { skip('sin cliente en SP1', row); continue; }
    const sp1Default = hasAddress(c.defaultAddress) ? c.defaultAddress : null;
    if (x.addressModel === 'single-v1') { skip('ya migrado', row); continue; }
    const embedded = [x.defaultAddress, ...(Array.isArray(x.addresses) ? x.addresses : [])].filter((a) => a && typeof a === 'object');
    const p = principalOf(addrsByUser.get(u.id) || [], embedded, sp1Default);
    if (!p.principal) { skip('sin dirección en SP2', row); continue; }
    if (p.source !== 'collection') { skip('dirección solo embebida (sin doc en la colección)', row); continue; }
    if (p.ambiguous) { skip('REVISIÓN: varias marcadas como principal', row); continue; }
    if (!sp1Default) { skip('REVISIÓN: SP1 sin dirección', row); continue; }
    if (!sameAddress(p.principal, sp1Default)) { skip('REVISIÓN: SP1 imprime otra dirección', row); continue; }
    plan.push({ ...row, sourceId: p.principal.id, sourceFp: labelFingerprint(p.principal), sp1Fp: labelFingerprint(sp1Default), userBefore: beforeOf(x) });
    if (plan.length >= LIMIT) break;
  }
  const dir = path.join(OUT, `f12-migration-${runId}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify({ runId, at: new Date().toISOString(), apply: APPLY, plan, skipped }, null, 1));
  console.log(`   a migrar: ${plan.length}`);
  for (const [why, rows] of Object.entries(skipped)) console.log(`   omitidos — ${why}: ${rows.length}${why.startsWith('REVISIÓN') ? `  (${rows.slice(0, 5).map((r) => r.sl).join(', ')}${rows.length > 5 ? '…' : ''})` : ''}`);
  console.log(`   foto: ${path.join(dir, 'snapshot.json')}`);
  if (!APPLY) { console.log('Simulación: agrega --apply para migrar (solo con aprobación).'); return; }

  // ── 2. Migrate in batches, verify each batch, stop on the first anomaly ───
  const results = [];
  for (let i = 0; i < plan.length; i += BATCH) {
    const batch = plan.slice(i, i + BATCH); const written = [];
    for (const m of batch) {
      if (TEST_MUTATE_UID && m.uid === TEST_MUTATE_UID) {
        await sp2.collection('addresses').doc(m.sourceId).update({ streetAddress: 'CAMBIO CONCURRENTE (prueba)' });
      }
      const userRef = sp2.collection('users').doc(m.uid); const srcRef = sp2.collection('addresses').doc(m.sourceId);
      const outcome = await sp2.runTransaction(async (tx) => {
        const [us, src] = await Promise.all([tx.get(userRef), tx.get(srcRef)]);
        if (!us.exists || !src.exists) return { result: 'aborted', why: 'documento desaparecido' };
        const x = us.data(); const source = { id: src.id, ...src.data() };
        if (labelFingerprint(source) !== m.sourceFp) return { result: 'aborted', why: 'la dirección cambió desde la foto' };
        if (x.addressModel === 'single-v1') return { result: 'aborted', why: 'ya migrado por otro proceso' };
        if (JSON.stringify(beforeOf(x)) !== JSON.stringify(m.userBefore)) return { result: 'aborted', why: 'el usuario cambió desde la foto' };
        const block = canonicalAddress(source, m.uid);
        tx.update(userRef, {
          defaultAddress: block, addresses: [block], addressModel: 'single-v1', profileLastUpdatedBy: 'system_migration',
          addressMigratedAt: FieldValue.serverTimestamp(), addressMigration: { version: 'f12-v1', runId, sourceDocId: source.id },
        });
        return { result: 'written', block };
      });
      if (outcome.result !== 'written') {
        console.log(`   ⏭️  ${m.sl}: ${outcome.why} — no se tocó`);
        await sp2.collection(LOG).doc(m.uid).set({ runId, slCode: m.sl, result: 'aborted', why: outcome.why, at: FieldValue.serverTimestamp() });
        results.push({ ...m, result: 'aborted', why: outcome.why });
        continue;
      }
      written.push({ ...m, block: outcome.block });
    }
    if (TEST_BREAK_SL && written.some((w) => w.sl === TEST_BREAK_SL)) {
      await pause(3000);
      await sp1.collection('customers').doc(TEST_BREAK_SL).update({ 'defaultAddress.streetAddress': 'SP1 DISTINTO (prueba)' });
    }

    // Verify: users doc exact, SP1 keeps printing the baseline for WATCH_S seconds.
    const bad = [];
    for (const w of written) {
      const u = (await sp2.collection('users').doc(w.uid).get()).data() || {};
      const okUser = u.addressModel === 'single-v1' && Array.isArray(u.addresses) && u.addresses.length === 1
        && labelFingerprint(u.defaultAddress) === w.sourceFp && labelFingerprint(u.addresses[0]) === w.sourceFp;
      if (!okUser) bad.push({ w, why: 'el doc del usuario no quedó igual a la fuente' });
    }
    const t0 = Date.now();
    while (Date.now() - t0 < WATCH_S * 1000 && bad.length === 0) {
      for (const w of written) {
        const c = (await sp1.collection('customers').doc(w.sl).get()).data() || {};
        if (labelFingerprint(c.defaultAddress) !== w.sp1Fp) { bad.push({ w, why: 'SP1 cambió la dirección que imprime' }); break; }
      }
      await pause(1000);
    }
    for (const w of written) {
      const failed = bad.find((b) => b.w.uid === w.uid);
      if (failed) {
        await sp2.collection('users').doc(w.uid).update(restorePayload(w.userBefore));
        await sp2.collection(LOG).doc(w.uid).set({ runId, slCode: w.sl, result: 'restored', why: failed.why, before: w.userBefore, sourceDocId: w.sourceId, sourceFp: w.sourceFp, sp1Fp: w.sp1Fp, at: FieldValue.serverTimestamp() });
        console.log(`   ⛔ ${w.sl}: ${failed.why} → RESTAURADO desde la foto`);
        results.push({ ...w, result: 'restored', why: failed.why });
      } else {
        await sp2.collection(LOG).doc(w.uid).set({ runId, slCode: w.sl, result: 'migrated', before: w.userBefore, after: w.block, sourceDocId: w.sourceId, sourceFp: w.sourceFp, sp1Fp: w.sp1Fp, at: FieldValue.serverTimestamp() });
        results.push({ ...w, result: 'migrated' });
      }
    }
    console.log(`   lote ${i / BATCH + 1}: ${written.length - bad.length} migrados y verificados${bad.length ? `, ${bad.length} restaurados` : ''}`);
    if (bad.length) {
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 1));
      console.error(`⛔ DETENIDO en el lote ${i / BATCH + 1}. Nada más se migró. Resultados: ${path.join(dir, 'results.json')}`);
      process.exit(2);
    }
  }
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 1));
  const count = (r) => results.filter((x) => x.result === r).length;
  console.log(`✅ Terminado: ${count('migrated')} migrados y verificados, ${count('aborted')} sin tocar (cambiaron). Run ${runId} — rollback: --rollback ${runId}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
