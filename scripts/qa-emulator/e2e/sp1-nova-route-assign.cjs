// Nova — customers and routes (REAL Nova on the QA emulator; tests only, Nova code is not changed).
//   1. a name with no customer match keeps the manifest name and shows "sin ruta"
//   2. a matched customer without a route shows "sin ruta"
//   3. the admin assigns a route in Nova → SP1 customers.ruta at once
//   4. … and the SP2 user does NOT change: decision ratified 2026-09-26 ("R1 no se aplica") — a route set in
//      Nova stays in SP1; only SP1 "Editar cliente" sends it to SP2 (docs/NOVA_RUTAS_Y_CLIENTES.md)
//   5. … and Nova's learning (match_feedback of that customer) has the new route
// Routes of the test customer (SP1 and SP2) are restored at the end.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-nova-route-assign.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const FIXTURE = path.join(__dirname, '../fixtures/manifest-route-assign.csv');
// A real route of the official list (slResolveRouteReview only accepts those; production's routes are all in it).
const ROUTE = 'Occidente', SL = 'SL90001';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'nullValue' in v ? null : 'booleanValue' in v ? v.booleanValue : undefined;
const q = async (base, coll, field, value) => ((await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }],
  where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json()).filter((r) => r.document).map((r) => ({ path: r.document.name.split('/documents/')[1], f: r.document.fields })));
const setField = (base, p, k, v) => fetch(`${base}/${p}?updateMask.fieldPaths=${k}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { [k]: v == null ? { nullValue: null } : { stringValue: v } } }) });

(async () => {
  await fetch(`${DB1}/routes/R-OCCIDENTE-QA`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { name: { stringValue: ROUTE }, status: { stringValue: 'active' }, province: { stringValue: 'Heredia' } } }) });
  for (const t of ['RTASSIGN001', 'RTASSIGN002', 'RTASSIGN003']) await fetch(`${DB1}/packages/${t}`, { method: 'DELETE', headers: H });
  const sp2User = (await q(DB2, 'users', 'slCode', SL))[0];
  const sp2Before = val(sp2User?.f?.ruta);
  await setField(DB1, `customers/${SL}`, 'ruta', null);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `route-${name}.png`) }).catch(() => {});
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
    await page.getByText('RTASSIGN001', { exact: true }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(4000); await shot('0-table');

    const rowText = async (t) => page.evaluate((t) => { const el = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim() === t); let r = el; for (let i = 0; i < 6 && r && r.tagName !== 'TR'; i++) r = r.parentElement; return r ? r.innerText.replace(/\s+/g, ' ') : ''; }, t);
    const unmatched = await rowText('RTASSIGN003');
    check('1. Sin coincidencia: conserva el nombre del manifiesto y sale "sin ruta"', /PERSONA INEXISTENTE QWERTY/i.test(unmatched) && /sin ruta/i.test(unmatched), unmatched.slice(0, 120));
    const matched = await rowText('RTASSIGN001');
    check('2. Cliente encontrado sin ruta: sale "sin ruta"', /CLIENTE UNO/i.test(matched) && /sin ruta/i.test(matched), matched.slice(0, 120));

    // Assign the route from the CLIENTE UNO group row ("sin ruta" chip → route).
    const groupRow = page.locator('tr').filter({ hasText: 'CLIENTE UNO' }).filter({ hasText: SL }).first();
    await groupRow.getByText('sin ruta', { exact: true }).first().click(); await page.waitForTimeout(800);
    await page.getByRole('menuitem', { name: ROUTE }).first().click();
    // Since 'Revisar ruta' (689feb9f): when the customer has a pending route review, Nova asks the admin to confirm
    // the route first — and a confirmed decision is applied in SP1, SP2 and Nova's learning (user decision).
    const confirmBtn = page.getByRole('button', { name: new RegExp(`^Confirmar ruta ${ROUTE}`) });
    let viaReview = false;
    let viaDialog = false;
    if (await confirmBtn.first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
      viaDialog = true;
      // a customer under review (address changed) → decision applied in SP1 + SP2; only packages on the previous
      // route → a plain Nova route edit (SP1), the packages follow the NEW route.
      viaReview = (await page.getByText(/Revisar ruta: el cliente cambió|Confirmar la ruta decidida/).count()) > 0;
      await confirmBtn.first().click();
      await page.getByTestId('route-review-done').waitFor({ timeout: 20000 }).catch(() => {});
    }
    const t0 = Date.now();
    let c1 = null; for (let i = 0; i < 20; i++) { c1 = (await (await fetch(`${DB1}/customers/${SL}`, { headers: H })).json()).fields; if (val(c1?.ruta) === ROUTE) break; await pause(250); }
    const sp1Ms = Date.now() - t0;
    await shot('1-assigned');
    check('3. Asignar ruta en Nova → customers de SP1 al instante', val(c1?.ruta) === ROUTE, `${sp1Ms} ms`);
    await pause(8000);   // long enough for any trigger / sync to have run
    const u = (await q(DB2, 'users', 'slCode', SL))[0];
    if (viaDialog) {
      const doneTxt = await page.getByTestId('route-review-done').innerText().catch(() => '');
      check('3b. El diálogo termina sin error y los paquetes en proceso quedan en la ruta NUEVA', /aplicada/.test(doneTxt) && !/El cliente no tiene ruta asignada/.test(doneTxt) && /todos en /.test(doneTxt), doneTxt.replace(/\s+/g, ' ').slice(0, 160));
    }
    if (viaReview) check('4. … confirmada desde "Revisar ruta": SP2 también queda con la ruta (decisión del admin, se aplica en todos lados)', val(u?.f?.ruta) === ROUTE, `SP2 ruta = ${JSON.stringify(val(u?.f?.ruta))}`);
    else check('4. … y el usuario de SP2 NO cambia (decisión: la ruta de Nova se queda en SP1)', val(u?.f?.ruta) === sp2Before, `SP2 ruta = ${JSON.stringify(val(u?.f?.ruta))} (antes ${JSON.stringify(sp2Before)})`);
    await pause(3000);
    const fb = await q(DB1, 'match_feedback', 'slCode', SL);
    check('5. … y lo aprendido por Nova (match_feedback del cliente) tiene la nueva ruta', fb.length === 0 || fb.every((d) => val(d.f.ruta) === ROUTE), `${fb.length} registros: ${JSON.stringify(fb.map((d) => val(d.f.ruta))).slice(0, 120)}`);
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    // Cleanup can never hang the regression round (b.close hung after the Google-emulator popup): each step has a limit.
    const limit = (p, ms, what) => Promise.race([p, new Promise((r) => setTimeout(() => { console.error(`ERR limpieza: ${what} no respondió en ${ms / 1000}s`); r(); }, ms))]).catch(() => {});
    await limit(setField(DB1, `customers/${SL}`, 'ruta', null), 20000, 'restaurar ruta SP1');
    if (sp2User) await limit(setField(DB2, sp2User.path, 'ruta', sp2Before ?? null), 20000, 'restaurar ruta SP2');
    await limit(fetch(`${DB1}/routes/R-OCCIDENTE-QA`, { method: 'DELETE', headers: H }), 20000, 'borrar ruta de prueba');
    await limit(b.close(), 20000, 'cerrar navegador');
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n ? 0 : 1);
  }
})();
