// Nova — "Guardar y facturar" by route blocks (REAL Nova on the QA emulator). Incident 2026-09-23: saving one
// route must never re-invoice customers of another route.
// READ-ONLY with respect to Nova's code: this only drives the UI and reads Firestore.
// Manifest SAVE-SCOPE: 3 packages of Cliente Uno (route A), 3 of Cliente Dos (route B).
//   1. route filter A + "Guardar y facturar" → an invoice for Cliente Uno only
//   2. route filter B + "Guardar y facturar" → an invoice for Cliente Dos; Cliente Uno's invoice is NOT touched
//   3. the admin edits a row in the table (auto-save) → that package is updated, NO invoice changes
//   5. the group invoice pill shows "…123456 [Estado]"
//   4. both invoices 'sent'; route filter A + "Anular y re-crear" → only Cliente Uno's invoice is regenerated;
//      Cliente Dos's invoice is untouched (invoices change only by the admin's explicit action, per block/filter)
//   6. Nova only annuls: Cliente Uno's packages stay in the manifest, linked to the new invoice (never to consolidation)
//   7. an edit after the regenerate reaches the DB (F2) and no invoice changes
// Customers' routes are set for the test and restored at the end.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-nova-save-scope.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const FIXTURE = path.join(__dirname, '../fixtures/manifest-save-scope-inv.csv');
const A = ['SCINVA0001', 'SCINVA0002', 'SCINVA0003'], B = ['SCINVB0001', 'SCINVB0002', 'SCINVB0003'];
const ROUTE_A = 'Ruta Scope A', ROUTE_B = 'Ruta Scope B', ROUTE_C = 'Ruta Scope C';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const setRuta = (sl, ruta) => fetch(`${DB1}/customers/${sl}?updateMask.fieldPaths=ruta`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { ruta: ruta ? { stringValue: ruta } : { nullValue: null } } }) });
const pkg = async (t) => { const r = await fetch(`${DB1}/packages/${t}`, { headers: H }); return r.status === 200 ? r.json() : null; };
const invoicesOf = async () => ((await (await fetch(`${DB1}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'invoices' }],
  where: { fieldFilter: { field: { fieldPath: 'manifestNumber' }, op: 'EQUAL', value: { stringValue: 'SAVE-SCOPE-INV' } } } } }) })).json()).filter((r) => r.document)
  .map((r) => ({ id: r.document.name.split('/').pop(), upd: r.document.updateTime, sl: r.document.fields?.slCode?.stringValue || r.document.fields?.clientSlCode?.stringValue, st: r.document.fields?.status?.stringValue, n: r.document.fields?.invoiceNumber?.stringValue })));
const saved = async (ts) => (await Promise.all(ts.map(pkg))).map((d, i) => ({ t: ts[i], saved: !!d, upd: d?.updateTime || null, f: d?.fields || {} }));
/** Wait until background work after a save (SP2 sync flags, learning) stops touching these packages. */
const settle = async (ts) => { let prev = ''; for (let i = 0; i < 30; i++) { const cur = (await saved(ts)).map((x) => x.upd).join(); if (cur && cur === prev) return; prev = cur; await pause(3000); } };
const changedFields = (a, b) => [...new Set([...Object.keys(a.f), ...Object.keys(b.f)])].filter((k) => JSON.stringify(a.f[k]) !== JSON.stringify(b.f[k]));

(async () => {
  for (const t of [...A, ...B]) await fetch(`${DB1}/packages/${t}`, { method: 'DELETE', headers: H });
  for (const inv of await invoicesOf()) await fetch(`${DB1}/invoices/${inv.id}`, { method: 'DELETE', headers: H });
  // Nova only shows a customer's route when it exists in the routes catalog.
  for (const [id, name] of [['R-SCOPE-A', ROUTE_A], ['R-SCOPE-B', ROUTE_B], ['R-SCOPE-C', ROUTE_C]]) await fetch(`${DB1}/routes/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { name: { stringValue: name }, status: { stringValue: 'active' }, province: { stringValue: 'San José' } } }) });
  await setRuta('SL90001', ROUTE_A); await setRuta('SL90002', ROUTE_B);
  // This test is about invoice scope, not 'Revisar ruta' (689feb9f): a review left pending by the address tests would
  // open the review panel on the route edit of step 3 — clear it for the two test customers (emulator data only).
  const clearRouteAttention = async () => { for (const sl of ['SL90001', 'SL90002']) await fetch(`${DB1}/customers/${sl}?updateMask.fieldPaths=routeReview&updateMask.fieldPaths=packagesOnPreviousRoute&updateMask.fieldPaths=routeAttention`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { routeAttention: { booleanValue: false } } }) }); };
  await clearRouteAttention();
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.text(); if (/\[Nova\]\[handleIngest\]|persisting|ingest/i.test(t)) console.log('  [nova]', t.slice(0, 300)); });
  const shot = (name) => page.screenshot({ path: path.join(OUT, `scope-${name}.png`), fullPage: false }).catch(() => {});
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
    await popup.waitForLoadState('domcontentloaded'); await popup.getByText('admin@prueba.local').first().click();
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    await page.getByRole('button', { name: /^Nova$/ }).first().click().catch(async () => { await page.getByText('Nova', { exact: true }).first().click(); });
    await page.waitForTimeout(4000);
    await page.locator('input[type=file]').first().setInputFiles(FIXTURE); await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    const cfg = page.getByRole('dialog').filter({ hasText: 'Configurar procesamiento' });
    await cfg.waitFor({ timeout: 60000 });
    await cfg.getByText('USA Aéreo', { exact: true }).click();
    const rate = cfg.locator('input').last(); if (!(await rate.inputValue())) await rate.fill('510');
    await cfg.getByRole('button', { name: 'Procesar manifiesto' }).click();
    await page.getByRole('button', { name: 'Ver tabla' }).last().click({ timeout: 240000 });
    await page.getByText(A[0], { exact: true }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(4000);
    await shot('0-table');

    const filterRoute = async (name) => {
      await page.getByLabel('Filtrar por ruta').first().click(); await page.waitForTimeout(800);
      await page.locator('[data-radix-popper-content-wrapper]').last().getByRole('button', { name: new RegExp(name) }).first().click();
      await page.waitForTimeout(1500);
    };
    const saveOnly = async () => {
      await page.getByRole('button', { name: /Guardar en BD|Actualizar BD|ingresados/ }).first().click();
      await page.getByRole('button', { name: /^Guardar y facturar/ }).first().click({ timeout: 20000 });
      await page.getByRole('button', { name: /Procesando/ }).first().waitFor({ state: 'detached', timeout: 180000 }).catch(() => {});
      await page.getByRole('button', { name: /Guardando/ }).first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(6000);
    };

    await filterRoute(ROUTE_A); await shot('1-filter-A');
    await saveOnly(); await shot('1-saved-A');
    await settle(A); await pause(3000);
    const i1 = await invoicesOf();
    check('1. Filtro ruta A + "Guardar y facturar": factura SOLO para Cliente Uno (SL90001)', i1.length >= 1 && i1.every((x) => x.sl === 'SL90001'), JSON.stringify(i1.map((x) => [x.sl, x.st, x.n])));

    if (process.env.CONTROL) {   // control experiment: do NOT save B, just wait as long as a save takes
      await filterRoute(ROUTE_B); await pause(15000);
      await settle(A);
      const c = await saved(A);
      console.log('  CONTROL (sin guardar B): campos cambiados en A =', JSON.stringify(c.map((x, i) => changedFields(s1a[i], x))));
      return;
    }
    await filterRoute(ROUTE_B); await shot('2-filter-B');
    await saveOnly(); await shot('2-saved-B');
    await settle([...A, ...B]); await pause(3000);
    const i2 = await invoicesOf();
    const uno1 = i1.filter((x) => x.sl === 'SL90001'), uno2 = i2.filter((x) => x.sl === 'SL90001');
    check('2. Filtro ruta B + "Guardar y facturar": factura para Cliente Dos y la de Cliente Uno NO se toca',
      i2.some((x) => x.sl === 'SL90002') && uno2.length === uno1.length && uno2.every((x) => uno1.some((y) => y.id === x.id && y.upd === x.upd && y.st === x.st)),
      JSON.stringify({ antes: uno1.map((x) => [x.n, x.st, x.upd]), despues: uno2.map((x) => [x.n, x.st, x.upd]), dos: i2.filter((x) => x.sl === 'SL90002').map((x) => [x.n, x.st]) }).slice(0, 400));

    // 3. Edit in the table (auto-save): change Cliente Dos's route to route C (auto-save is
    // active on a freshly processed manifest).
    const invBefore3 = await invoicesOf();
    const rowB = page.locator('tr').filter({ has: page.getByText(B[0], { exact: true }) }).first();
    await clearRouteAttention(); await page.waitForTimeout(2500);
    await rowB.getByText(ROUTE_B, { exact: true }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('menuitem', { name: ROUTE_C }).first().click();
    let p3 = null; for (let i = 0; i < 30; i++) { await pause(500); p3 = await pkg(B[0]); if (p3?.fields?.ruta?.stringValue === ROUTE_C) break; }
    await pause(4000);
    const footer = await page.locator('body').innerText().then((t) => (t.match(/(Guardado[^\n]{0,20}|Sin guardar[^\n]{0,30}|Cambios[^\n]{0,40}|Guardando[^\n]{0,20}|Error[^\n]{0,40})/g) || []).join(' | '));
    console.log('  indicador tras la edición:', footer, '| ruta en BD:', p3?.fields?.ruta?.stringValue);
    await shot('3-after-edit');
    await filterRoute(ROUTE_A);
    const invAfter3 = await invoicesOf();
    const sameInv = invBefore3.length === invAfter3.length && invBefore3.every((x) => invAfter3.some((y) => y.id === x.id && y.upd === x.upd));
    check('3. Edición en la tabla (auto-guardado) → el paquete se actualiza y NINGUNA factura cambia',
      p3?.fields?.ruta?.stringValue === ROUTE_C && sameInv, JSON.stringify({ ruta: p3?.fields?.ruta?.stringValue, facturasIguales: sameInv }));


    // 4. Regenerate by block: both invoices 'sent'; filter A → "Anular y re-crear".
    for (const inv of await invoicesOf()) await fetch(`${DB1}/invoices/${inv.id}?updateMask.fieldPaths=status`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'sent' } } }) });
    await pause(1500);
    const before4 = await invoicesOf();
    await filterRoute(ROUTE_A);
    await page.getByRole('button', { name: /Guardar en BD|Actualizar BD|ingresados/ }).first().click();
    const regen = page.getByRole('button', { name: /Anular y re-crear/ }).first();
    const regenVisible = await regen.isVisible({ timeout: 15000 }).catch(() => false);
    await shot('4-regen-dialog');
    if (regenVisible) {
      await regen.click();
      await page.getByRole('button', { name: /Procesando|Guardando/ }).first().waitFor({ state: 'detached', timeout: 180000 }).catch(() => {});
      await pause(8000);
    } else { await page.keyboard.press('Escape'); }
    const after4 = await invoicesOf();
    const dosBefore = before4.filter((x) => x.sl === 'SL90002'), dosAfter = after4.filter((x) => x.sl === 'SL90002');
    const unoAfter = after4.filter((x) => x.sl === 'SL90001');
    check('4. "Anular y re-crear" con filtro A → solo se regenera la factura de Cliente Uno; la de Cliente Dos queda intacta',
      regenVisible && dosAfter.length === dosBefore.length && dosAfter.every((x) => dosBefore.some((y) => y.id === x.id && y.upd === x.upd && y.st === x.st))
      && unoAfter.some((x) => x.st === 'annulled') && unoAfter.some((x) => x.st !== 'annulled'),
      JSON.stringify({ boton: regenVisible, uno: unoAfter.map((x) => [x.n, x.st]), dosAntes: dosBefore.map((x) => [x.n, x.st]), dosDespues: dosAfter.map((x) => [x.n, x.st]) }).slice(0, 450));


    // 5. The group invoice pill shows which invoice and its state ("…123456 [Borrador]").
    await filterRoute('Todas las rutas'); await pause(2500);
    const pills = await page.getByTestId('nova-group-invoice-badge').allInnerTexts();
    await shot('5-badges');
    const unoNew = after4.find((x) => x.sl === 'SL90001' && x.st !== 'annulled'), dos = after4.find((x) => x.sl === 'SL90002');
    const short = (num) => { const c = /-C$/.test(num); const core = c ? num.slice(0, -2) : num; return `…${core.slice(-6)}${c ? '-C' : ''}`; };
    check('5. La etiqueta del grupo muestra el número corto y el estado de la factura',
      pills.some((t) => t.includes(`${short(unoNew.n)} [Borrador]`)) && pills.some((t) => t.includes(`${short(dos.n)} [Enviada]`)), JSON.stringify(pills));

    // 6. Nova ONLY annuls (rule 2026-09-26): after "Anular y re-crear" Cliente Uno's packages stay in the
    //    manifest (never sent to consolidation — that is done only from Facturas) and are linked to the new invoice.
    const pa = await Promise.all(A.map(pkg));
    const f6 = pa.map((d) => ({ m: d?.fields?.manifestNumber?.stringValue, st: d?.fields?.status?.stringValue, inv: d?.fields?.invoiceNumber?.stringValue }));
    check('6. Tras "Anular y re-crear" desde Nova los paquetes siguen en el manifiesto (no van a consolidación) y quedan ligados a la factura nueva',
      f6.every((x) => x.m === 'SAVE-SCOPE-INV' && x.st !== 'consolidated' && x.inv === unoNew.n), JSON.stringify({ nueva: unoNew.n, paquetes: f6 }).slice(0, 400));

    // 7. F2: an edit after the regenerate reaches the DB; the footer never says "Guardado" while it has not.
    await filterRoute('Todas las rutas');
    const rowA = page.locator('tr').filter({ has: page.getByText(A[0], { exact: true }) }).first();
    await rowA.getByText(ROUTE_A, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(800);
    await page.getByRole('menuitem', { name: ROUTE_C }).first().click().catch(() => {});
    let dbRuta7 = null; for (let i = 0; i < 40; i++) { await pause(500); dbRuta7 = (await pkg(A[0]))?.fields?.ruta?.stringValue; if (dbRuta7 === ROUTE_C) break; }
    const ids7 = await page.locator('[data-testid^="nova-autosave-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    await shot('7-after-regen-edit');
    const inv7 = await invoicesOf();
    check('7. Edición después de regenerar: llega a la BD (el indicador no miente) y ninguna factura cambia',
      dbRuta7 === ROUTE_C && !(ids7.includes('nova-autosave-saved') && dbRuta7 !== ROUTE_C)
      && inv7.length === after4.length && inv7.every((x) => after4.some((y) => y.id === x.id && y.upd === x.upd)),
      JSON.stringify({ rutaBD: dbRuta7, indicador: ids7, facturas: inv7.length }));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    // Cleanup can never hang the regression round (it once hung 7h in b.close): each step has a limit.
    const limit = (p, ms, what) => Promise.race([p, new Promise((r) => setTimeout(() => { console.error(`ERR limpieza: ${what} no respondió en ${ms / 1000}s`); r(); }, ms))]).catch(() => {});
    await limit(Promise.all([setRuta('SL90001', null), setRuta('SL90002', null)]), 20000, 'restaurar rutas');
    await limit(Promise.all(['R-SCOPE-A', 'R-SCOPE-B', 'R-SCOPE-C'].map((id) => fetch(`${DB1}/routes/${id}`, { method: 'DELETE', headers: H }))), 20000, 'borrar rutas de prueba');
    await limit(b.close(), 20000, 'cerrar navegador');
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n ? 0 : 1);
  }
})();
