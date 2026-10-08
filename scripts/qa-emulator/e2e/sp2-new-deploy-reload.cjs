// SP2: a tab left open across deploys (2026-09-30). Builds SP2 in production mode (build id "build-A") into a
// temp folder, serves it, and publishes a new /version.json ("build-B") as a deploy would:
//   1. same version → nothing happens
//   2. new deploy + the customer comes back to the tab → reloads at once to the new version
//   3. new deploy while the tab is in use → banner "Hay una versión nueva · Actualizar" (no reload); the button reloads
// Why: a customer's 2-month-old tab kept retrying a denied profile write (~1000/day) with code from July.
// Run: NODE_PATH=<playwright dir>/node_modules [SP2_DIR=...] node scripts/qa-emulator/e2e/sp2-new-deploy-reload.cjs
const { execSync, spawn } = require('child_process');
const os = require('os'); const path = require('path');
const SP2 = process.env.SP2_DIR || path.join(__dirname, '../../../../smart-portal-2');
const D = path.join(os.tmpdir(), `sp2-vtest-${Date.now()}`);
execSync(`npx vite build --outDir "${D}"`, { cwd: SP2, env: { ...process.env, VITE_BUILD_ID: 'build-A' }, stdio: 'ignore' });
try { execSync('git checkout -q -- package.json src/functions/package.json', { cwd: SP2, stdio: 'ignore' }); } catch { /* no bump */ }
const server = spawn('python3', ['-m', 'http.server', '5179', '--directory', D], { stdio: 'ignore' });
process.on('exit', () => server.kill());
process.env.D = D;
const { chromium } = require('playwright'); const fs = require('fs');
const V = process.env.D + '/version.json';
let ok = 0, n = 0; const check = (m, c, d = '') => { n++; if (c) ok++; console.log(`${c ? '✅' : '❌'} ${m}${d ? ' — ' + d : ''}`); };
(async () => { await new Promise((r) => setTimeout(r, 1500));
  fs.writeFileSync(V, JSON.stringify({ buildId: 'build-A' }));
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return ['localhost', '127.0.0.1'].includes(u.hostname) ? r.continue() : r.abort(); });
  const page = await ctx.newPage(); let loads = 0; page.on('load', () => loads++);
  await page.goto('http://localhost:5179/'); await page.waitForTimeout(4000);
  const setHidden = (h) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { value: h, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true); await setHidden(false); await page.waitForTimeout(1500);
  check('1. Misma versión publicada → no pasa nada (sin aviso, sin recarga)', loads === 1 && !(await page.getByTestId('new-deploy-banner').count()), `cargas=${loads}`);
  // new deploy while the customer is using the tab: the banner, no reload
  fs.writeFileSync(V, JSON.stringify({ buildId: 'build-B' }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock?.runFor?.(0);
  // trigger the periodic check path: call it via a visibility round-trip marked as "in use" is not possible → use the interval by fast-forwarding
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  // coming back to the tab after a new deploy → reload at once
  await setHidden(true); await setHidden(false); await page.waitForTimeout(3000);
  check('2. Deploy nuevo + el cliente vuelve a la pestaña → se recarga sola a la versión nueva', loads === 2, `cargas=${loads}`);
  await b.close();
  // 3. banner while in use: install a fake clock so the 10-minute check runs now
  const b2 = await chromium.launch(); const ctx2 = await b2.newContext();
  await ctx2.route('**/*', (r) => { const u = new URL(r.request().url()); return ['localhost', '127.0.0.1'].includes(u.hostname) ? r.continue() : r.abort(); });
  fs.writeFileSync(V, JSON.stringify({ buildId: 'build-A' }));
  const p2 = await ctx2.newPage(); let l2 = 0; p2.on('load', () => l2++);
  // capture the 10-minute periodic check so the test can run it now (the real app waits 10 minutes)
  await p2.addInitScript(() => { const orig = window.setInterval; window.setInterval = (fn, ms, ...a) => { if (ms === 600000) window.__deployCheck = fn; return orig(fn, ms, ...a); }; });
  await p2.goto('http://localhost:5179/');
  await p2.waitForFunction(() => !!window.__deployCheck, null, { timeout: 30000 }).catch(() => {});
  await p2.waitForTimeout(2500);
  check('3a. Con la misma versión, el componente activo no muestra aviso', !(await p2.getByTestId('new-deploy-banner').count()));
  fs.writeFileSync(V, JSON.stringify({ buildId: 'build-B' }));
  const captured = await p2.evaluate(() => { if (!window.__deployCheck) return false; window.__deployCheck(); return true; });
  await p2.waitForTimeout(2000);
  if (!captured) console.log('   (no se capturó el chequeo periódico)');
  const bannerTxt = await p2.getByTestId('new-deploy-banner').innerText().catch(() => '');
  check('3. Deploy nuevo mientras lo usa → aviso "Actualizar", sin recargar (no interrumpe)', /versión nueva/.test(bannerTxt) && l2 === 1, `${bannerTxt.replace(/\n/g, ' ')} · cargas=${l2}`);
  await p2.getByTestId('new-deploy-reload').click().catch(() => {}); await p2.waitForTimeout(2500);
  check('3b. "Actualizar" recarga la página', l2 === 2, `cargas=${l2}`);
  await b2.close(); fs.writeFileSync(V, JSON.stringify({ buildId: 'build-A' }));
  console.log(`\n${ok}/${n}`); process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
