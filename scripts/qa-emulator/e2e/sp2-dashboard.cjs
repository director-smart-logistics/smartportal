// F7 — SP2 customer dashboard end to end in the local SP2 app (http://localhost:5175) on the QA
// emulator; every non-local request is blocked. Asserts the Phase 4/5 rules with the data of
// seed-dashboard-scenarios.cjs: Pre-alertados list, Facturados only invoice cards, no search bar,
// quick pre-alert without twin, real delete with log, mobile without horizontal scroll.
// Run: OUT=<shots dir> NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-dashboard.cjs
const { chromium } = require('playwright');
const OUT = process.env.OUT || require("os").tmpdir();
const DB = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const NEW_T = 'TBA339900000020';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const byTracking = async (col, t) => (await (await fetch(`${DB}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: 'tracking' }, op: 'EQUAL', value: { stringValue: t } } } } }) })).json())
  .filter((r) => r.document).map((r) => r.document.name.split('/').pop());

async function login(viewport) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    const okHost = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)
      || (route.request().method() === 'GET' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname));
    return okHost ? route.continue() : route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message.slice(0, 140)); });
  await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await page.getByText('Ingresar', { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator('input[type=email]').first().fill('cliente1@prueba.local');
  await page.locator('input[type=password]').first().fill('Prueba1234!');
  await page.locator('button[type=submit]').first().click();
  await page.waitForTimeout(9000);
  await page.getByRole('button', { name: /Entendido/ }).click().catch(() => {});
  await page.setViewportSize(viewport);
  await page.waitForTimeout(2000);
  return { b, page, errors };
}
// Cards shown in the list: the card element itself, not the icons/badges inside it.
const cardRoots = (page) => page.locator('[data-testid="active-shipments-content"] [data-testid^="invoice-group-card-"], [data-testid="active-shipments-content"] [data-testid^="shipment-card-"]')
  .evaluateAll((els) => els.filter((e) => !e.parentElement.closest('[data-testid^="invoice-group-card-"], [data-testid^="shipment-card-"]')).length);
const createdMs = async (col, id) => { const d = await (await fetch(`${DB}/${col}/${id}`, { headers: H })).json(); const v = d.fields?.preAlertDate || d.fields?.createdAt; return Date.parse(v?.timestampValue || v?.stringValue || '') || Number(v?.integerValue || v?.doubleValue || 0); };  // the date the list shows (preAlertDate ?? createdAt)
const tab = async (page, re) => { await page.locator('button', { hasText: re }).first().click(); await page.waitForTimeout(1500); };
const pageIds = async (page) => (await page.locator('[data-testid^="prealert-row-"][data-testid$="-date"]').evaluateAll((els) =>
  els.map((e) => e.getAttribute('data-testid').replace('prealert-row-', '').replace('-date', ''))));
// Every page of the list (the dashboard paginates: "Página X de N").
const listIds = async (page) => {
  const all = [...await pageIds(page)];
  for (let i = 0; i < 20; i++) {
    const label = await page.getByText(/Página \d+ de \d+/).first().innerText().catch(() => '');
    const m = label.match(/Página (\d+) de (\d+)/); if (!m || m[1] === m[2]) break;
    await page.getByText(/Página \d+ de \d+/).first().locator('xpath=following-sibling::button[1]').click();
    await page.waitForTimeout(700);
    all.push(...await pageIds(page));
  }
  for (let i = 0; i < 20; i++) {   // back to page 1
    const label = await page.getByText(/Página \d+ de \d+/).first().innerText().catch(() => '');
    if (!label || /Página 1 de/.test(label)) break;
    await page.getByText(/Página \d+ de \d+/).first().locator('xpath=preceding-sibling::button[1]').click();
    await page.waitForTimeout(500);
  }
  return all;
};

(async () => {
  // ── desktop ──
  let { b, page, errors } = await login({ width: 1400, height: 1000 });
  await tab(page, /^Pre-?alertados$/i);
  let ids = await listIds(page);
  await page.locator('[data-testid="active-shipments-content"]').screenshot({ path: `${OUT}/desktop-prealertados.png` }).catch(() => {});
  const has = (id) => ids.includes(id);
  check('Pre-alertados: pendiente sin paquete', has('DASH01_SL90001'));
  check('Pre-alertados: >90 días sigue listada', has('DASH06_SL90001'));
  check('Pre-alertados: gemelo nunca facturado sigue listado', has('DASH04_SL90001'));
  check('Pre-alertados: NO la del gemelo facturado', !has('DASH02_SL90001'));
  check('Pre-alertados: NO la del paquete entregado', !has('DASH05_SL90001'));
  check('Pre-alertados: NO la cancelada', !has('DASH09_SL90001'));
  check('Pre-alertados: mismo paquete una sola vez', ids.filter((i) => i.startsWith('DASH10')).length === 1, ids.filter((i) => i.startsWith('DASH10')).join(','));
  const firstPage = (await pageIds(page)).length;
  check('Pre-alertados: todas, máximo 10 por página', firstPage > 0 && firstPage <= 10 && (ids.length <= 10 || (await page.getByText(/Página 1 de \d+/).count()) === 1), `página1=${firstPage} total=${ids.length}`);
  const times = []; for (const id of ids) times.push(await createdMs('pre_alerts', id));
  check('Pre-alertados: de la más reciente a la más antigua', times.every((x, i) => i === 0 || times[i - 1] >= x), times.map((x, i) => i && times[i - 1] < x ? `✗${ids[i - 1]}(${new Date(times[i - 1]).toISOString()})<${ids[i]}(${new Date(x).toISOString()})` : '').filter(Boolean).join(' ') || 'ok');
  check('Pre-alertados: lista sin timeline ni tarjetas de paquete', (await page.locator('[data-testid="active-shipments-content"] [data-testid^="shipment-card-"]').count()) === 0);
  await tab(page, /^Facturados$/i);
  await page.locator('[data-testid="active-shipments-content"]').screenshot({ path: `${OUT}/desktop-facturados.png` }).catch(() => {});
  const inv = await page.locator('[data-testid^="invoice-group-card-"]:not([data-testid*="badge"])').count();
  const loose = await page.locator('[data-testid="active-shipments-content"] [data-testid^="shipment-card-"][data-testid$="-badge"]').count();
  const invCards = await cardRoots(page);
  const invPaging = await page.getByText(/Página \d+ de \d+/).first().innerText().catch(() => '');
  const deliveredInFact = await page.locator('[data-testid="active-shipments-content"] [data-testid$="-delivered-badge"]').count();
  check('Facturados: máximo 10 por página (con paginación si hay más) y ninguna entregada', invCards > 0 && invCards <= 10 && deliveredInFact === 0,
    `página1=${invCards} ${invPaging || 'sin paginación'} entregadas=${deliveredInFact}`);
  check('Facturados: solo tarjetas de factura', inv > 0 && loose === 0, `facturas=${inv} paquetes sueltos=${loose}`);
  await tab(page, /^Entregados?$/i);
  await page.locator('[data-testid="active-shipments-content"]').screenshot({ path: `${OUT}/desktop-entregados.png` }).catch(() => {});
  const delivered = await cardRoots(page);
  check('Entregado: solo los últimos 10, sin paginación', delivered <= 10 && (await page.getByText(/Página \d+ de \d+/).count()) === 0, `tarjetas=${delivered}`);
  // More than 10 invoices: Facturados paginates (only not delivered), Entregado keeps the latest 10 — newest first.
  {
    const tag = String(Date.now()).slice(-5);
    const mk = (i, status) => ({ id: `PG${tag}-${status[0]}${i}`, inv: `INV-PG${tag}-${status[0]}${i}`, status, at: new Date(Date.now() + i * 60000).toISOString() });
    // Independent of what earlier tests left: top the customer's NOT-delivered invoices up to exactly 13.
    const openNow = await (async () => {
      const rows = ((await (await fetch(`${DB}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'shipments' }], where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: 'e2e-sl90001' } } } } }) })).json()).filter((r) => r.document).map((r) => r.document.fields));
      const g = new Map(); for (const f of rows) { const inv = (f.invoiceNumber || f.invoiceId)?.stringValue; if (inv) (g.get(inv) || g.set(inv, []).get(inv)).push(f.status?.stringValue); }
      return [...g.values()].filter((v) => !v.every((x) => x === 'delivered')).length;
    })();
    const nTransit = Math.max(3, 13 - openNow);
    const extra = [...Array.from({ length: nTransit }, (_, i) => mk(i + 1, 'transit')), ...Array.from({ length: 12 }, (_, i) => mk(i + 1, 'delivered'))];
    const put = (x) => fetch(`${DB}/shipments/${x.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
      tracking: { stringValue: `TPG${tag}${x.id.slice(-3)}` }, userId: { stringValue: 'e2e-sl90001' }, slCode: { stringValue: 'SL90001' }, status: { stringValue: x.status },
      invoiceId: { stringValue: x.inv }, invoiceNumber: { stringValue: x.inv }, createdAt: { stringValue: x.at }, updatedAt: { stringValue: x.at }, syncedFromSp1: { booleanValue: true } } }) });
    try {
      for (const x of extra) await put(x);
      await page.waitForTimeout(3500);
      await tab(page, /^Facturados$/i);
      const label = await page.getByText(/Página \d+ de \d+/).first().innerText().catch(() => '');
      const p1 = await page.locator('[data-testid="active-shipments-content"] [data-testid^="invoice-group-card-"]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid')).filter((t) => !/-(invoice-icon|delivered-badge|returned-badge)$/.test(t)));
      const noDelivered = (await page.locator('[data-testid="active-shipments-content"] [data-testid$="-delivered-badge"]').count()) === 0;
      await page.getByText(/Página \d+ de \d+/).first().locator('xpath=following-sibling::button[1]').click().catch(() => {}); await page.waitForTimeout(1200);
      const p2 = await cardRoots(page);
      await page.locator('[data-testid="active-shipments-content"]').screenshot({ path: `${OUT}/desktop-facturados-p2.png` }).catch(() => {});
      check('Facturados con 13 facturas no entregadas: pagina 10 + resto, sin entregadas, la más reciente primero',
        /Página 1 de 2/.test(label) && p1.length === 10 && p2 >= 1 && p2 <= 10 && noDelivered && p1[0] === `invoice-group-card-INV-PG${tag}-t${nTransit}`,
        `${label} p1=${p1.length} p2=${p2} primera=${p1[0]}`);
      await tab(page, /^Entregados?$/i);
      const d = await page.locator('[data-testid="active-shipments-content"] [data-testid^="invoice-group-card-"]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('data-testid')).filter((t) => !/-(invoice-icon|delivered-badge|returned-badge)$/.test(t)));
      const want = Array.from({ length: 10 }, (_, i) => `invoice-group-card-INV-PG${tag}-d${12 - i}`);
      check('Entregado con 18 entregas: solo las últimas 10, de la más reciente a la más antigua, sin paginación',
        JSON.stringify(d) === JSON.stringify(want) && (await page.getByText(/Página \d+ de \d+/).count()) === 0 && (await page.getByTestId('dashboard-latest-note').count()) === 1,
        `tarjetas=${d.length} primera=${d[0]} última=${d[d.length - 1]}`);
    } finally {
      for (const x of extra) await fetch(`${DB}/shipments/${x.id}`, { method: 'DELETE', headers: H });
      await page.waitForTimeout(2000);
    }
  }
  check('Sin barra de búsqueda', (await page.locator('input[placeholder*="Buscar" i]').count()) === 0);
  const qp = page.locator('[data-testid="quick-prealert-input"]:visible');
  check('Desktop: Pre-Alertar Rápido visible', (await qp.count()) === 1);
  // Create a pre-alert from the quick form → only pre_alerts, no twin; listed; then delete it.
  await qp.fill(NEW_T); await qp.press('Enter'); await page.waitForTimeout(6000);
  const pa = await byTracking('pre_alerts', NEW_T); const sh = await byTracking('shipments', NEW_T);
  check('Pre-alerta rápida creada en pre_alerts', pa.length === 1, pa.join(','));
  check('Sin paquete gemelo en shipments', sh.length === 0, sh.join(','));
  await tab(page, /^Pre-?alertados$/i);
  ids = await listIds(page);
  check('La nueva aparece en Pre-alertados en tiempo real', ids.includes(pa[0]));
  if (pa[0]) {
    await page.locator(`[data-testid="prealert-row-${pa[0]}-delete-button"]`).click();
    await page.getByRole('button', { name: /^Eliminar$/ }).last().click();
    await page.waitForTimeout(5000);
    check('Eliminar: desaparece de la lista', (await page.locator(`[data-testid="prealert-row-${pa[0]}"]`).count()) === 0);
    check('Eliminar: borrada de pre_alerts', (await byTracking('pre_alerts', NEW_T)).length === 0);
    const logs = await (await fetch(`${DB}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'prealert_deletions' }] } }) })).json();
    check('Eliminar: queda el log', logs.some((r) => JSON.stringify(r.document || {}).includes(NEW_T)));
  }
  check('Desktop sin errores de página', errors.length === 0, errors.join(' | '));
  await b.close();
  // ── mobile ──
  ({ b, page, errors } = await login({ width: 390, height: 844 }));
  await page.screenshot({ path: `${OUT}/mobile-home.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Móvil: sin scroll horizontal', overflow <= 1, `sobra=${overflow}px`);
  await tab(page, /^Pre-?alertados$/i);
  await page.locator('[data-testid="active-shipments-content"]').screenshot({ path: `${OUT}/mobile-prealertados.png` }).catch(() => {});
  check('Móvil: lista de pre-alertas visible', (await listIds(page)).length > 0);
  check('Móvil sin errores de página', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
