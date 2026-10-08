// Nova — what "Guardar en BD" persists when the admin works by blocks (REAL Nova on the QA emulator).
// READ-ONLY with respect to Nova's code: this only drives the UI and reads Firestore.
// Manifest SAVE-SCOPE: 3 packages of Cliente Uno (route A), 3 of Cliente Dos (route B).
//   1. route filter A + "Solo guardar datos en BD" → only A's 3 packages are saved
//   2. route filter B + "Solo guardar datos en BD" → B's 3 saved; A's packages untouched (same updateTime)
// Customers' routes are set for the test and restored at the end.
// R2 (found and FIXED 2026-09-26, F-AUTOSAVE-SAFE): the auto-save (hooks/use-nova-auto-save.ts →
// upsertManifestPackageOverrides) used to rewrite EVERY existing row, ignoring the route filter; a change made
// outside the Nova tab was overwritten with the stale table state. Now it writes only the rows/fields the
// admin changed in the tab. CONTROL=1: no second save. EXTERNAL=1: another admin's change survives.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-nova-save-scope.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const FIXTURE = path.join(__dirname, '../fixtures/manifest-save-scope.csv');
const A = ['SCOPEA0001', 'SCOPEA0002', 'SCOPEA0003'], B = ['SCOPEB0001', 'SCOPEB0002', 'SCOPEB0003'];
const ROUTE_A = 'Ruta Scope A', ROUTE_B = 'Ruta Scope B';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const setRuta = (sl, ruta) => fetch(`${DB1}/customers/${sl}?updateMask.fieldPaths=ruta`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { ruta: ruta ? { stringValue: ruta } : { nullValue: null } } }) });
const pkg = async (t) => { const r = await fetch(`${DB1}/packages/${t}`, { headers: H }); return r.status === 200 ? r.json() : null; };
const saved = async (ts) => (await Promise.all(ts.map(pkg))).map((d, i) => ({ t: ts[i], saved: !!d, upd: d?.updateTime || null, f: d?.fields || {} }));
/** Wait until background work after a save (SP2 sync flags, learning) stops touching these packages. */
const settle = async (ts) => { let prev = ''; for (let i = 0; i < 30; i++) { const cur = (await saved(ts)).map((x) => x.upd).join(); if (cur && cur === prev) return; prev = cur; await pause(3000); } };
const changedFields = (a, b) => [...new Set([...Object.keys(a.f), ...Object.keys(b.f)])].filter((k) => JSON.stringify(a.f[k]) !== JSON.stringify(b.f[k]));

(async () => {
  for (const t of [...A, ...B]) await fetch(`${DB1}/packages/${t}`, { method: 'DELETE', headers: H });
  // Nova only shows a customer's route when it exists in the routes catalog.
  for (const [id, name] of [['R-SCOPE-A', ROUTE_A], ['R-SCOPE-B', ROUTE_B]]) await fetch(`${DB1}/routes/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { name: { stringValue: name }, status: { stringValue: 'active' }, province: { stringValue: 'San José' } } }) });
  await setRuta('SL90001', ROUTE_A); await setRuta('SL90002', ROUTE_B);
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
      await page.getByRole('button', { name: /Solo guardar datos en BD/ }).first().click({ timeout: 20000 });
      await page.getByRole('button', { name: /Guardando/ }).first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(6000);
    };

    await filterRoute(ROUTE_A); await shot('1-filter-A');
    await saveOnly(); await shot('1-saved-A');
    await settle(A);
    const s1a = await saved(A), s1b = await saved(B);
    check('1. Filtro ruta A + "Solo guardar": se guardan SOLO los 3 de la ruta A', s1a.every((x) => x.saved) && s1b.every((x) => !x.saved), JSON.stringify({ A: s1a.map((x) => x.saved), B: s1b.map((x) => x.saved) }));

    if (process.env.EXTERNAL) {   // another admin / screen changes an A package while this Nova tab stays open
      await fetch(`${DB1}/packages/${A[0]}?updateMask.fieldPaths=customerName&updateMask.fieldPaths=ruta`, { method: 'PATCH', headers: H,
        body: JSON.stringify({ fields: { customerName: { stringValue: 'CAMBIO DE OTRO ADMIN' }, ruta: { stringValue: 'Ruta Cambiada Afuera' } } }) });
      await pause(1500);
      await filterRoute(ROUTE_B); await saveOnly(); await settle([...A, ...B]);
      const after = (await pkg(A[0])).fields;
      check('3. Un cambio hecho afuera en un paquete de A NO se pierde al guardar la ruta B en Nova',
        after.customerName?.stringValue === 'CAMBIO DE OTRO ADMIN' && after.ruta?.stringValue === 'Ruta Cambiada Afuera',
        JSON.stringify({ customerName: after.customerName?.stringValue, ruta: after.ruta?.stringValue }));
      return;
    }
    if (process.env.CONTROL) {   // control experiment: do NOT save B, just wait as long as a save takes
      await filterRoute(ROUTE_B); await pause(15000);
      await settle(A);
      const c = await saved(A);
      console.log('  CONTROL (sin guardar B): campos cambiados en A =', JSON.stringify(c.map((x, i) => changedFields(s1a[i], x))));
      return;
    }
    await filterRoute(ROUTE_B); await shot('2-filter-B');
    await saveOnly(); await shot('2-saved-B');
    await settle([...A, ...B]);
    const s2a = await saved(A), s2b = await saved(B);
    const aChanges = s2a.map((x, i) => changedFields(s1a[i], x));
    console.log('  horas de escritura  A:', JSON.stringify(s2a.map((x) => x.upd)), ' B:', JSON.stringify(s2b.map((x) => x.upd)), ' updatedAt A:', JSON.stringify(s2a.map((x) => x.f.updatedAt)));
    check('2. Filtro ruta B + "Solo guardar": se guardan los 3 de B y los de A NO se vuelven a escribir',
      s2b.every((x) => x.saved) && aChanges.every((c) => c.length === 0), JSON.stringify({ B: s2b.map((x) => x.saved), camposCambiadosEnA: aChanges }));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await setRuta('SL90001', null); await setRuta('SL90002', null);
    for (const id of ['R-SCOPE-A', 'R-SCOPE-B']) await fetch(`${DB1}/routes/${id}`, { method: 'DELETE', headers: H });
    await b.close();
    console.log(`\n${ok}/${n}`);
  }
})();
