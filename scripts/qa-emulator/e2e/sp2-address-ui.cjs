// F8.4 — one delivery address per customer, in the local SP2 app (http://localhost:5175) on the QA
// emulator (every non-local request blocked), desktop + mobile: the card shows the principal address
// directly with the edit button; the modal opens straight on the edit screen (no list, no "Agregar
// Nueva Dirección"); Cancelar closes it; a legacy extra address is not offered; the existing rule
// that blocks changing the address with invoiced packages in process still holds (nothing changes
// in SP2 or SP1). Run AFTER sp2-address-sync.cjs (it leaves cliente1's principal address).
// Run: OUT=<shots dir> NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-address-ui.cjs
const { chromium } = require('playwright');
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, d = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${d ? ' — ' + d : ''}`); };
async function run(viewport, tag) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.route('**/*', (route) => { const u = new URL(route.request().url());
    const okH = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || (route.request().method() === 'GET' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname));
    return okH ? route.continue() : route.abort(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message.slice(0, 140)); });
  await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await page.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.locator('input[type=email]').first().fill('cliente1@prueba.local'); await page.locator('input[type=password]').first().fill('Prueba1234!');
  await page.locator('button[type=submit]').first().click(); await page.waitForTimeout(9000);
  await page.getByRole('button', { name: /Entendido/ }).click().catch(() => {});
  await page.setViewportSize(viewport); await page.waitForTimeout(2000);
  if (viewport.width < 1024) { await page.getByText('Ajusta tu').first().click(); await page.waitForTimeout(2500); }   // mobile: collapsible settings
  const card = page.locator('[data-testid="delivery-addresses-card"]:visible').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.screenshot({ path: `${OUT}/${tag}-card.png` }).catch(() => {});
  check(`${tag}: tarjeta muestra la dirección principal`, /F8 Calle|Zona Sur/.test(await card.innerText()), (await card.innerText()).replace(/\n/g, ' | ').slice(0, 90));
  check(`${tag}: sin card dentro del card ni "+N más"`, (await card.locator('.border.rounded-xl').count()) === 0 && (await page.locator('[data-testid="delivery-addresses-view-more"]').count()) === 0);
  check(`${tag}: no aparece la dirección legacy extra`, !/Oficina vieja/.test(await card.innerText()));
  const btn = card.locator('[data-testid="delivery-addresses-add-button"]');
  check(`${tag}: el botón es "Editar dirección"`, (await btn.getAttribute('aria-label')) === 'Editar dirección');
  await btn.click(); await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${tag}-modal.png` });
  check(`${tag}: abre directo en editar (Detalles Adicionales), sin la lista`, (await page.getByText('Detalles Adicionales').count()) >= 1 && (await page.getByText('Esta dirección está activa').count()) === 0);
  check(`${tag}: no ofrece "Agregar Nueva Dirección"`, (await page.getByText('Agregar Nueva Dirección').count()) === 0);
  await page.getByRole('button', { name: /^Cancelar$/ }).last().click(); await page.waitForTimeout(1500);
  check(`${tag}: Cancelar cierra el modal`, (await page.getByText('Detalles Adicionales').count()) === 0 && (await page.getByText('Esta dirección está activa').count()) === 0);
  if (tag === 'desktop') {
    await btn.click(); await page.waitForTimeout(2500);
    const street = `F8 Calle UI ${Date.now() % 100000}`;
    const input = page.locator('label:has-text("Dirección Completa") + * input, label:has-text("Dirección Completa") ~ input').first();
    const field = (await input.count()) ? input : page.locator('input[value*="F8 Calle"]').first();
    await field.fill(street);
    await page.screenshot({ path: OUT + '/desktop-before-save.png' }); await page.getByRole('button', { name: /Guardar/ }).last().click(); await page.waitForTimeout(2500); await page.screenshot({ path: OUT + '/desktop-after-save.png' }); await page.waitForTimeout(3500);
    const H = { Authorization: 'Bearer owner' };
    const q = await (await fetch('http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents/addresses?pageSize=50', { headers: H })).json();
    const mine = (q.documents || []).filter((d) => d.fields?.userId?.stringValue === 'e2e-sl90001');
    const sp1 = await (await fetch('http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents/customers/SL90001', { headers: H })).json();
    const sp1Street = sp1.fields?.defaultAddress?.mapValue?.fields?.streetAddress?.stringValue;
    const blocked = (await page.getByText('ACCIÓN NO PERMITIDA').count()) > 0;
    if (blocked) {
      // Existing rule: with invoiced packages in process the principal address cannot change.
      check('desktop: con paquetes facturados en proceso, Guardar se bloquea (regla existente)', true);
      check('desktop: bloqueado → nada cambia en SP2 ni en SP1', mine.length === 2 && !mine.some((d) => d.fields?.streetAddress?.stringValue === street) && sp1Street !== street, `SP1="${sp1Street}"`);
    } else {
      check('desktop: Guardar actualiza la MISMA dirección (no crea otra)', mine.length === 2 && mine.some((d) => d.fields?.streetAddress?.stringValue === street), `direcciones=${mine.length}`);
      check('desktop: y SP1 la tiene de inmediato (etiquetas)', sp1Street === street, `SP1="${sp1Street}"`);
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${tag}: sin scroll horizontal`, overflow <= 1, `sobra=${overflow}`);
  check(`${tag}: sin errores de página`, errors.length === 0, errors.join(' | '));
  await b.close();
}
(async () => {
  // A legacy second (non-principal) address of the same customer — it must not be offered.
  await fetch("http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents/addresses/F8ADDR2_e2e-sl90001", { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { userId: { stringValue: 'e2e-sl90001' }, alias: { stringValue: 'Trabajo (legacy)' }, streetAddress: { stringValue: 'Oficina vieja 123' }, province: { stringValue: 'San José' },
      canton: { stringValue: 'Central' }, country: { stringValue: 'Costa Rica' }, isDefault: { booleanValue: false }, isPrimary: { booleanValue: false }, isActive: { booleanValue: true },
      status: { stringValue: 'active' }, createdAt: { timestampValue: '2026-09-20T10:00:00Z' } } }) });
  await new Promise((r) => setTimeout(r, 3000));
  await run({ width: 1400, height: 1000 }, 'desktop'); await run({ width: 390, height: 844 }, 'mobile'); console.log(`\n${ok}/${n}`); })().catch((e) => { console.error('ERR', e.message); process.exit(1); });
