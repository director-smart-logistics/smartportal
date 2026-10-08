// SP2 — "Permisos" is visible wherever the package shows (2026-09-28, case 1Z07W296YW16419701):
//   1. customer dashboard, Facturados (invoice card): the package row carries the "Permisos" badge (as the old
//      single-package cards did before Facturados became invoice cards)
//   2. admin → Paquetes (search board): the "Facturados / desde el portal" card says "Requiere permiso"
//      (it was only on the ML Cargo card)
//   3. a package WITHOUT permit shows neither badge
// Data: SP2 shipments of cliente1 (SL90001, e2e-sl90001) with requiresPermit true/false, as SP1 sync writes them.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-permit-indicators.cjs
const { chromium } = require('playwright');
const path = require('path');
const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x } : { stringValue: String(x) };
const put = (p, o) => fetch(`${FS}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const t = String(Date.now()).slice(-6);
const TP = `1Z07W296YW${t}01`, TN = `1Z07W296YW${t}02`, INV = `SL90001-20260928${t}000`;

const guard = async (ctx) => ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });

(async () => {
  const now = new Date().toISOString(); // never a future date: other dashboard tests order by date
  const base = { slCode: 'SL90001', userId: 'e2e-sl90001', status: 'processed', statusLabel: 'Facturado', invoiceId: `ID-${INV}`, invoiceNumber: INV, invoiceStatus: 'sent', syncedFromSp1: true, weight: 0.98, customerName: 'Cliente Uno', createdAt: now, updatedAt: now };
  await put(`shipments/${TP}`, { ...base, tracking: TP, requiresPermit: true, description: 'COSMETICOS' });
  await put(`shipments/${TN}`, { ...base, tracking: TN, requiresPermit: false, description: 'ROPA' });
  await put(`invoices/ID-${INV}`, { invoiceNumber: INV, slCode: 'SL90001', userId: 'e2e-sl90001', status: 'sent', total: 42, currency: 'USD', date: now, requiresPermit: true });
  await pause(4000);

  // 1 + 3 — customer dashboard
  let b = await chromium.launch(); let ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } }); await guard(ctx);
  let page = await ctx.newPage();
  await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await page.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.locator('input[type=email]').first().fill('cliente1@prueba.local');
  await page.locator('input[type=password]').first().fill('Prueba1234!');
  await page.locator('button[type=submit]').first().click(); await page.waitForTimeout(9000);
  await page.getByRole('button', { name: /Entendido/ }).click().catch(() => {});
  await page.locator('button', { hasText: /^Facturados$/i }).first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'permit-1-facturados.png') });
  const permitBadges = await page.locator('[data-testid$="-permit"]').filter({ hasText: 'Permisos' }).count();
  // the package row = the smallest element holding the tracking AND (for TP) the permit badge
  const rowWithBadge = (tr) => page.locator('div').filter({ hasText: tr }).filter({ has: page.locator('[data-testid$="-permit"]') }).filter({ hasNotText: tr === TP ? TN : TP });
  check('1. Facturados: la fila del paquete con permiso muestra el badge "Permisos"', (await page.getByText(TP).count()) > 0 && permitBadges >= 1 && (await rowWithBadge(TP).count()) > 0, `badges=${permitBadges}`);
  check('3a. El paquete SIN permiso no lleva badge', (await page.getByText(TN).count()) > 0 && (await rowWithBadge(TN).count()) === 0);
  await b.close();

  // 2 + 3 — admin search board
  b = await chromium.launch(); ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); await guard(ctx);
  page = await ctx.newPage();
  await page.goto('http://localhost:5175/'); await page.waitForTimeout(4000);
  await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
  await page.waitForTimeout(2500);
  await page.goto('http://localhost:5175/slm/packages'); await page.waitForTimeout(6000);
  for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
  const box = page.locator('input[data-scanner-input="true"]');
  const search = async (q) => { await box.fill(q); await box.press('Enter'); await pause(1500); await page.getByTestId('admin-search-board').waitFor({ timeout: 20000 }).catch(() => {}); await page.waitForFunction(() => !document.querySelector('[data-testid="board-paquetes"] .animate-spin'), null, { timeout: 60000 }).catch(() => {}); await pause(1000); };
  await search(TP);
  await page.getByTestId('board-paquetes').screenshot({ path: path.join(OUT, 'permit-2-admin-board.png') }).catch(() => {});
  check('2. Admin → Paquetes: la tarjeta de Facturados dice "Requiere permiso"', (await page.getByTestId('board-package-permit').count()) >= 1 && /Requiere permiso/i.test(await page.getByTestId('board-paquetes').innerText().catch(() => '')));
  await search(TN);
  check('3b. Admin → Paquetes: un paquete sin permiso no lo muestra', (await page.getByTestId('board-package-permit').count()) === 0);
  await b.close();

  // leave nothing behind for the other tests (same customer SL90001)
  for (const d of [`shipments/${TP}`, `shipments/${TN}`, `invoices/ID-${INV}`]) await fetch(`${FS}/${d}`, { method: 'DELETE', headers: H });
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
