// Deploy rehearsal — Admin → Paquetes search by the last 6 digits (QA emulator, real app, real backfill script).
// Reproduces production as it is today and runs the runbook steps in order:
//   0. prod today: shipments indexed with the OLD rule (endings ≥ 10), pre_alerts without index (triggers OFF)
//   1. the admin types 6 digits → nothing (what the admin sees on localhost:3000 against prod)
//   2. backfill DRY-RUN (shipments + pre_alerts) → writes nothing
//   3. backfill --fix → only `trackingSearchKeys` changes (updatedAt and every other field identical)
//   4. triggers ON (new functions deployed) → 6 digits finds the package (Facturados) and the pre-alert (Pre-alertados)
//   5. backfill --fix again → writes nothing (idempotent)
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-tracking-backfill-rehearsal.cjs
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SP2 = path.join(__dirname, '../../../../smart-portal-2');
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const HUB = 'http://localhost:4400';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (p, o) => fetch(`${FS}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const raw = async (p) => (await (await fetch(`${FS}/${p}`, { headers: H })).json());
const triggers = (on) => fetch(`${HUB}/functions/${on ? 'enable' : 'disable'}BackgroundTriggers`, { method: 'PUT' });
// The shared keys module, exactly as the app / trigger / backfill use it.
const ts = require(path.join(SP2, 'node_modules/typescript'));
const mod = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(path.join(SP2, 'src/shared/tracking-search-keys.ts'), 'utf8'), { compilerOptions: { module: 1, target: 7 } }).outputText)(mod, mod.exports, require);
const K = mod.exports;
const backfill = (args) => execFileSync('node', ['scripts/backfill-tracking-search-keys.cjs', ...args, '--pause-ms=0', `--out=${path.join(OUT, 'rehearsal-backfill.json')}`],
  { cwd: SP2, env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080', GCLOUD_PROJECT: 'demo-sp-qa' }, encoding: 'utf8' });
const summary = () => JSON.parse(fs.readFileSync(path.join(OUT, 'rehearsal-backfill.json'), 'utf8')).summary;

const t = String(Date.now()).slice(-6);
const TS = `GFUS0107${t}044088`, TS6 = TS.slice(-6);          // package, indexed with the OLD rule
const TP = `9400111${t}5566778899`, TP6 = TP.slice(-6);        // pre-alert only, no index (as in prod)
const UPDATED = '2026-09-20T15:30:00.000Z';

(async () => {
  const docs = {
    [`shipments/RH-${t}`]: { tracking: TS, slCode: 'SLRH1', status: 'customs', customerName: 'Cliente Ensayo', createdAt: UPDATED, updatedAt: UPDATED,
      trackingSearchKeys: K.buildTrackingSearchKeys({ tracking: TS }).filter((k) => k.length >= 10) },   // prod today
    [`pre_alerts/${TP}_SLRH2`]: { trackingNumber: TP, tracking: TP, canonicalTracking: TP, slCode: 'SLRH2', status: 'pending', active: true, createdAt: UPDATED, updatedAt: UPDATED },
  };
  const b = await chromium.launch();
  try {
    await triggers(false);
    for (const [p, o] of Object.entries(docs)) await put(p, o);
    await pause(1500);
    const d0 = Object.fromEntries(await Promise.all(Object.keys(docs).map(async (p) => [p, await raw(p)])));
    check('0. Estado de prod reproducido: shipment con índice viejo (≥10) y pre-alerta sin índice',
      (d0[`shipments/RH-${t}`].fields.trackingSearchKeys.arrayValue.values || []).every((v) => v.stringValue.length >= 10) && !d0[`pre_alerts/${TP}_SLRH2`].fields.trackingSearchKeys);

    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await page.goto('http://localhost:5175/slm/packages'); await page.waitForTimeout(5000);
    const col = (id) => page.getByTestId(id).innerText().catch(() => '');
    const search = async (q) => {
      const box = page.locator('input[data-scanner-input="true"]'); await box.fill(q); await box.press('Enter');
      await pause(700); await page.getByTestId('admin-search-board').waitFor({ timeout: 20000 }).catch(() => {});
      await page.waitForFunction(() => !document.querySelector('[data-testid="board-paquetes"] .animate-spin'), null, { timeout: 60000 }).catch(() => {});
      await pause(800);
    };

    await search(TS6); const a1 = await col('board-paquetes');
    await search(TP6); const b1 = await col('board-prealertas');
    await page.screenshot({ path: path.join(OUT, 'rehearsal-1-before.png') });
    check(`1. ANTES del backfill: 6 dígitos (${TS6} / ${TP6}) no encuentran nada — igual que hoy en prod`, !a1.includes(TS) && !b1.includes(TP));

    backfill([]); const s2a = summary(); backfill(['--collection=pre_alerts']); const s2b = summary();
    const d2 = Object.fromEntries(await Promise.all(Object.keys(docs).map(async (p) => [p, await raw(p)])));
    check('2. Backfill DRY-RUN (shipments y pre_alerts): no escribe nada', s2a.written === 0 && s2b.written === 0 && s2a.needsWrite > 0 && s2b.needsWrite > 0
      && Object.keys(docs).every((p) => d2[p].updateTime === d0[p].updateTime), JSON.stringify({ shipments: [s2a.needsWrite, s2a.written], pre_alerts: [s2b.needsWrite, s2b.written] }));

    backfill(['--fix']); const s3a = summary(); backfill(['--fix', '--collection=pre_alerts']); const s3b = summary();
    const d3 = Object.fromEntries(await Promise.all(Object.keys(docs).map(async (p) => [p, await raw(p)])));
    const onlyKeys = Object.keys(docs).every((p) => {
      const f0 = d0[p].fields, f3 = d3[p].fields;
      return [...new Set([...Object.keys(f0), ...Object.keys(f3)])].filter((k) => JSON.stringify(f0[k]) !== JSON.stringify(f3[k])).every((k) => k === 'trackingSearchKeys');
    });
    const keysS = (d3[`shipments/RH-${t}`].fields.trackingSearchKeys?.arrayValue?.values || []).map((v) => v.stringValue);
    const keysP = (d3[`pre_alerts/${TP}_SLRH2`].fields.trackingSearchKeys?.arrayValue?.values || []).map((v) => v.stringValue);
    check('3. Backfill --fix: solo cambia trackingSearchKeys (updatedAt y todo lo demás igual) y ya incluye los 6 dígitos',
      s3a.written > 0 && s3b.written > 0 && onlyKeys && keysS.includes(TS6) && keysP.includes(TP6), JSON.stringify({ escritos: [s3a.written, s3b.written], soloIndice: onlyKeys }));

    await triggers(true); await pause(2000);
    await search(TS6); const a4 = await col('board-paquetes');
    await search(TP6); const b4 = await col('board-prealertas');
    await page.screenshot({ path: path.join(OUT, 'rehearsal-4-after.png') });
    check(`4. DESPUÉS (functions nuevas + backfill): 6 dígitos encuentran el paquete (Facturados) y la pre-alerta (Pre-alertados)`,
      a4.includes(TS) && /SmartID: SLRH1/.test(a4) && b4.includes(TP) && /SmartID: SLRH2/.test(b4));

    backfill(['--fix']); const s5a = summary(); backfill(['--fix', '--collection=pre_alerts']); const s5b = summary();
    const d5 = Object.fromEntries(await Promise.all(Object.keys(docs).map(async (p) => [p, await raw(p)])));
    check('5. Backfill otra vez: no escribe nada en estos documentos (idempotente)', Object.keys(docs).every((p) => d5[p].updateTime === d3[p].updateTime),
      JSON.stringify({ escritosEnLaColeccion: [s5a.written, s5b.written] }));
  } catch (e) {
    console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await triggers(true);
    for (const p of Object.keys(docs)) await fetch(`${FS}/${p}`, { method: 'DELETE', headers: H });
    await b.close();
    console.log(`\n${ok}/${n}`);
  }
})();
