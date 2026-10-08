// SP1 Rutas (RoutesManagement) — measures the "jump" the admin reports, on the REAL Nova app (QA emulator):
// choose the manifest, choose a route, select one package, "select all". For each step it records the
// browser's layout-shift score (CLS), the scroll jump and how far the package table moved.
// A step "jumps" when CLS > 0.1 (Google's threshold) or the table moves > 40 px or the scroll jumps > 40 px.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-routes-ui-jump.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const enc = (x) => typeof x === 'number' ? { doubleValue: x } : typeof x === 'boolean' ? { booleanValue: x } : { stringValue: String(x) };
const put = (p, data) => fetch(`${DB1}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const MAN = '26-09-2026QARUTA', ROUTE = 'Ruta QA Norte', N = Number(process.env.ROUTE_PKGS || 70);

async function seed() {
  await put('routes/R-QA-NORTE', { name: ROUTE, status: 'active', province: 'San José', createdAt: new Date().toISOString() });
  await put(`manifests/${MAN}`, { manifestNumber: MAN, processedAt: new Date().toISOString(), totalPackages: N, status: 'processed' });
  for (let i = 0; i < N; i++) {
    const t = `QARUTA${String(i).padStart(3, '0')}`;
    await put(`packages/${t}`, { tracking: t, trackingNumber: t, slCode: 'SL90001', customerName: 'Cliente Uno', manifestNumber: MAN, ruta: ROUTE, status: 'on_route', weight: 1, price: 5, createdAt: new Date().toISOString() });
  }
}

(async () => {
  await seed();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__cls = 0; window.__shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push({ v: +e.value.toFixed(3), src: (e.sources || []).map((s) => s.node?.nodeName + '.' + String(s.node?.className || '').slice(0, 40)).slice(0, 2) }); } })
      .observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${APP}/routes`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);

  const measure = async (label, action) => {
    const before = await page.evaluate(() => { window.__cls = 0; window.__shifts = []; const t = document.querySelector('div.divide-y.overflow-y-auto'); return { y: window.scrollY, top: t ? t.getBoundingClientRect().top : null, inner: t ? t.scrollTop : 0 }; });
    await action();
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => { const t = document.querySelector('div.divide-y.overflow-y-auto'); return { y: window.scrollY, top: t ? t.getBoundingClientRect().top : null, inner: t ? t.scrollTop : 0, cls: window.__cls, shifts: window.__shifts.slice(0, 4) }; });
    await page.screenshot({ path: path.join(OUT, `routes-${label.replace(/\W+/g, '-')}.png`) });
    const scrollJump = Math.abs(after.y - before.y);
    const tableMove = before.top != null && after.top != null ? Math.abs(after.top - before.top) : 0;
    const innerJump = Math.abs((after.inner || 0) - (before.inner || 0));
    const jumped = after.cls > 0.1 || tableMove > 40 || scrollJump > 40 || innerJump > 40;
    console.log(`  ${label}: CLS=${after.cls.toFixed(3)} scroll=${scrollJump}px tabla=${tableMove.toFixed(0)}px scrollInterno=${innerJump}px ${JSON.stringify(after.shifts)}`);
    return { jumped, cls: +after.cls.toFixed(3), scrollJump, tableMove: Math.round(tableMove), innerJump };
  };

  const r1 = await measure('elegir manifiesto', async () => {
    await page.getByRole('combobox').filter({ hasText: /Seleccionar Manifiesto/ }).first().click(); await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'routes-0-picker-open.png') });
    const pop = page.locator('[data-radix-popper-content-wrapper]').last();
    await pop.getByRole('button').filter({ hasText: MAN }).first().click();
  });
  check('Elegir el manifiesto no hace brincar la pantalla', !r1.jumped, JSON.stringify(r1));

  const r2 = await measure('elegir ruta', async () => {
    await page.getByText(ROUTE, { exact: true }).first().click();
  });
  check('Elegir la ruta no hace brincar la pantalla', !r2.jumped, JSON.stringify(r2));

  const r2b = await measure('expandir el grupo (70 filas)', async () => { await page.getByText('Sin Facturar', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"grid")][1]').locator('svg.lucide-chevron-right, button').first().click(); });
  check('Expandir el grupo de paquetes no hace brincar la pantalla', !r2b.jumped, JSON.stringify(r2b));

  const grid = () => page.locator('div.divide-y.overflow-y-auto').first();
  const r3 = await measure('marcar el grupo (70)', async () => { await grid().locator('input[type=checkbox]').nth(1).click(); });
  check('Marcar el grupo completo no hace brincar la pantalla', !r3.jumped, JSON.stringify(r3));

  const r4 = await measure('seleccionar todo', async () => { await page.getByLabel('Seleccionar todos en esta página').first().click(); });
  check('Seleccionar todo no hace brincar la pantalla', !r4.jumped, JSON.stringify(r4));

  // Bulk "Entregado" on all N packages — must be ONE atomic write (same commit time on every package).
  const bar = page.getByTestId('routes-bulk-actions');
  if (!(await bar.getByRole('button', { name: /Entregado/ }).count())) { await page.getByLabel('Seleccionar todos en esta página').first().click(); await page.waitForTimeout(800); }
  if (!(await bar.getByRole('button', { name: /Entregado/ }).count())) { await grid().locator('input[type=checkbox]').nth(1).click(); await page.waitForTimeout(800); }
  const selectedText = await bar.innerText();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });
  await bar.getByRole('button', { name: /Entregado/ }).click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'routes-confirm-dialog.png') });
  await page.getByRole('button', { name: 'Confirmar' }).click(); await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'routes-after-confirm.png') });
  let docs = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    docs = await Promise.all(Array.from({ length: N }, (_, k) => fetch(`${DB1}/packages/QARUTA${String(k).padStart(3, '0')}`, { headers: H }).then((r) => r.json())));
    if (docs.every((d) => d.fields?.status?.stringValue === 'delivered')) break;
  }
  const delivered = docs.filter((d) => d.fields?.status?.stringValue === 'delivered').length;
  const commits = new Set(docs.map((d) => d.updateTime)).size;
  await page.screenshot({ path: path.join(OUT, 'routes-bulk-delivered.png') });
  check(`Entregado en lote de ${N} paquetes desde la pantalla: todos actualizados en UNA sola escritura atómica`, delivered === N && commits === 1,
    JSON.stringify({ seleccion: selectedText.match(/\((\d+)\)/)?.[1], entregados: delivered, commitsDistintos: commits }));

  await b.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
