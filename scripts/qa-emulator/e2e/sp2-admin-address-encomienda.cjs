// SP2 admin → Usuarios → Editar → "Direcciones" → encomienda picker (2026-09-29), REAL UI + real functions:
// gerencia gets the customer's picker (same list, search, "agregar proveedor") without the customer's limits.
//   1. a customer suggestion still PENDING is listed ("Sugerido por cliente") and choosing it approves it:
//      SP2 active + approved, and SP1's list gets it approved too (encomiendas trigger → slSyncEncomiendaFromSp2)
//   2. "Agregar proveedor" with a new name → created approved + active in SP2 and SP1 and assigned to the address
//   3. "Agregar proveedor" with the name of an existing one → reused, no duplicate
//   4. the modal does not jump: its position and height stay the same while filtering / selecting
//   5. SP1's customer ficha gets the chosen encomienda (confirmed)
//   6. route map (2026-09-29): Alajuela / Grecia with "Sarchí" in the text → Occidente, NO encomienda; the modal
//      shows the route of the sheet and warns that the text names another zone
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> [SP2_URL=http://localhost:5175] node scripts/qa-emulator/e2e/sp2-admin-address-encomienda.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const AUTH = 'http://localhost:9099';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB2 = `${B}/(default)/documents`, DB1 = `${B}/portal/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const WEB = process.env.SP2_URL || 'http://localhost:5175';
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { integerValue: String(x) }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } }
  : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const patch = (base, p, o) => fetch(`${base}/${p}?${Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const register = async (body) => (await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: body }) })).json());
const signIn = async (email, password) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const byName = async (base, name) => ((await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'encomiendas' }], where: { fieldFilter: { field: { fieldPath: 'name' }, op: 'EQUAL', value: { stringValue: name } } } } }) })).json()).filter((r) => r.document)).map((r) => ({ id: r.document.name.split('/').pop(), ...r.document.fields }));
const v = (f) => f && Object.values(f)[0];
const m = (f) => f?.mapValue?.fields || {};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});
const waitFor = async (fn, ms = 20000) => { for (let i = 0; i < ms / 1000; i++) { const x = await fn(); if (x) return x; await pause(1000); } return null; };

(async () => {
  let adm = await signIn('admin2@prueba.local', 'Prueba1234!');
  if (!adm.localId) adm = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await patch(DB2, `users/${adm.localId}`, { role: 'admin', email: 'admin2@prueba.local', firstName: 'Admin', lastName: 'QA', status: 'active' });
  const reg = await register({ email: `enc-${t}@prueba.local`, password: 'Prueba1234!', firstName: 'Encomienda', lastName: `Admin${t}`, phone: `8${t}6`, dni: `1-07${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true });
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) { console.error('ERR registro', JSON.stringify(reg.error)); process.exit(1); }
  const now = new Date().toISOString();
  const block = { id: `QAENCADDR${t}`, userId: uid, alias: 'Casa', type: 'home', streetAddress: `El Cairo ${t}`, province: 'Limón', canton: 'Siquirres', district: 'Siquirres',
    country: 'CR', isPrimary: true, isDefault: true, status: 'active', isActive: true, requiresEncomienda: true, encomienda: null, createdAt: now, updatedAt: now };
  await patch(DB2, `users/${uid}`, { addressModel: 'single-v1', defaultAddress: block, addresses: [block] });
  // A customer suggestion still pending (as in production: "Transportes barquero", pending)
  const NEWPHONE = `8${t.slice(-3)}-${t.slice(0, 4)}`;
  const PEND = `QA Barquero ${t}`, NEWP = `QA Transportes Nuevo ${t}`, EXIST = `QA Existente ${t}`;
  await patch(DB2, `encomiendas/qa-pend-${t}`, { name: PEND, phone: '8888-1111', email: '', zones: ['Limón'], description: '', active: false, isUserSubmitted: true, reviewStatus: 'pending', submittedBy: 'someone', createdAt: now, updatedAt: now });
  await patch(DB2, `encomiendas/qa-exist-${t}`, { name: EXIST, phone: '2222-3333', zones: ['Nacional'], description: 'ya existe', active: true, reviewStatus: 'approved', createdAt: now, updatedAt: now });
  await pause(4000);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x) => page.screenshot({ path: path.join(OUT, `enc-${x}.png`) }).catch(() => {});
  try {
    await page.goto(`${WEB}/`); await page.waitForTimeout(3500);
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    const openModal = async () => {
      await page.goto(`${WEB}/slm/users`); await page.waitForTimeout(5000);
      for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
      const box = page.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
      await box.fill(sl); await box.press('Enter'); await page.waitForTimeout(4000);
      await page.getByText(`Encomienda Admin${t}`, { exact: true }).first().click(); await page.waitForTimeout(2500);
      await page.getByRole('button', { name: /Direcciones/ }).first().click(); await page.waitForTimeout(2500);
      await page.getByRole('button', { name: 'Editar dirección' }).first().click(); await page.waitForTimeout(2500);
      return page.getByTestId('admin-address-modal');
    };
    let dlg = await openModal();
    const box0 = await dlg.boundingBox();
    const search = dlg.getByPlaceholder(/buscar tu transportista/);
    await search.fill('QA Barq'); await page.waitForTimeout(700);
    const box1 = await dlg.boundingBox();
    const item = dlg.getByTestId('encomienda-list').getByRole('button', { name: new RegExp(PEND) });
    const pendBadge = await item.getByText(/Sugerido por cliente/).count();
    await item.click(); await page.waitForTimeout(700);
    const box2 = await dlg.boundingBox();
    await search.fill('zzzz-nada'); await page.waitForTimeout(700);
    const box3 = await dlg.boundingBox();
    await search.fill(''); await page.waitForTimeout(500);
    await shot('1-selected');
    const same = (a, c) => a && c && Math.abs(a.y - c.y) < 2 && Math.abs(a.height - c.height) < 2;
    check('4. El modal no brinca: misma posición y alto al buscar, elegir y sin resultados', same(box0, box1) && same(box0, box2) && same(box0, box3), JSON.stringify([box0, box1, box2, box3].map((x) => x && [Math.round(x.y), Math.round(x.height)])));
    check('1a. La sugerencia pendiente del cliente aparece en la lista (marcada)', pendBadge === 1);
    await dlg.getByRole('button', { name: /Guardar Cambios/ }).click(); await page.waitForTimeout(6000);
    await shot('2-saved');
    const p2 = await get(DB2, `encomiendas/qa-pend-${t}`);
    check('1b. Al guardar, la sugerencia queda aprobada y activa en SP2', v(p2?.reviewStatus) === 'approved' && v(p2?.active) === true, JSON.stringify({ r: v(p2?.reviewStatus), a: v(p2?.active) }));
    const p1 = await waitFor(async () => { const x = await get(DB1, `encomiendas/qa-pend-${t}`); return x && v(x.reviewStatus) === 'approved' ? x : null; });
    check('1c. SP1 la recibe aprobada y activa (lista de Encomiendas)', !!p1 && v(p1.active) === true);
    const u1 = await get(DB2, `users/${uid}`);
    check('1d. La dirección del cliente queda con esa encomienda', v(m(m(u1?.defaultAddress).encomienda).id) === `qa-pend-${t}`);
    const c1 = await waitFor(async () => { const c = await get(DB1, `customers/${sl}`); return JSON.stringify(c || {}).includes(PEND) ? c : null; });
    check('5. SP1 (ficha del cliente) tiene la encomienda elegida', !!c1 && (await page.getByTestId('admin-address-sp1-ok').isVisible().catch(() => false)));
    await page.getByTestId('admin-address-close').click().catch(() => {}); await page.waitForTimeout(800);

    // 2. add a brand-new provider (approved at once)
    dlg = await openModal();
    await dlg.getByPlaceholder(/buscar tu transportista/).fill(NEWP); await page.waitForTimeout(500);
    const boxA = await dlg.boundingBox();
    await dlg.getByTestId('encomienda-suggest').click(); await page.waitForTimeout(800);
    const boxB = await dlg.boundingBox();
    await dlg.locator('input[type="tel"], input[inputmode="tel"]').first().fill(NEWPHONE).catch(async () => { await dlg.getByPlaceholder(/8888|teléfono|Teléfono/i).first().fill(NEWPHONE); });
    await dlg.getByTestId('new-provider-submit').click(); await page.waitForTimeout(2500);
    const added = await dlg.getByTestId('admin-provider-added').innerText().catch(() => '');
    await shot('3-added');
    check('4b. Abrir "Agregar proveedor" tampoco mueve el modal', same(boxA, boxB));
    const n2 = await byName(DB2, NEWP);
    check('2a. "Agregar proveedor" lo crea aprobado y activo en SP2 (una vez)', n2.length === 1 && v(n2[0].reviewStatus) === 'approved' && v(n2[0].active) === true && v(n2[0].phone).replace(/\D/g, '') === NEWPHONE.replace(/\D/g, ''), added);
    await dlg.getByRole('button', { name: /Guardar Cambios/ }).click(); await page.waitForTimeout(6000);
    const n1 = await waitFor(async () => { const x = await byName(DB1, NEWP); return x.length ? x : null; });
    check('2b. SP1 lo recibe aprobado y activo', !!n1 && n1.length === 1 && v(n1[0].reviewStatus) === 'approved' && v(n1[0].active) === true);
    await shot('4-saved-new');
    const err2 = await page.getByTestId('admin-address-error').innerText({ timeout: 500 }).catch(() => '');
    const u2 = await waitFor(async () => { const u = await get(DB2, `users/${uid}`); return v(m(m(u?.defaultAddress).encomienda).name) === NEWP ? u : null; }, 10000);
    check('2c. Queda asignado a la dirección del cliente', !!u2, err2);
    await page.getByTestId('admin-address-close').click().catch(() => {}); await page.waitForTimeout(800);

    // 3. same name as an existing provider → reused
    dlg = await openModal();
    await dlg.getByPlaceholder(/buscar tu transportista/).fill('zz sin resultado'); await page.waitForTimeout(400);
    await dlg.getByTestId('encomienda-suggest').click(); await page.waitForTimeout(800);
    const nameInput = dlg.locator('input[maxlength="100"]').first();
    await nameInput.fill(EXIST.toLowerCase());
    await dlg.locator('input[type="tel"], input[inputmode="tel"]').first().fill('7000-0000').catch(() => {});
    await dlg.getByTestId('new-provider-submit').click(); await page.waitForTimeout(2500);
    const added3 = await dlg.getByTestId('admin-provider-added').innerText().catch(() => '');
    check('3. Un nombre que ya existe se reutiliza (sin duplicado)', (await byName(DB2, EXIST)).length === 1 && (await byName(DB2, EXIST.toLowerCase())).length === 0 && /ya existía/.test(added3), added3);

    // 6. Grecia (Jessica's case): the map decides, the street text only warns
    const reg2 = await register({ email: `grecia-${t}@prueba.local`, password: 'Prueba1234!', firstName: 'Grecia', lastName: `Mapa${t}`, phone: `8${t}7`, dni: `1-08${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true });
    const g = { id: `QAGRE${t}`, userId: reg2.result.uid, alias: 'Casa', type: 'home', streetAddress: `Del Palí 200 m norte, camino a Sarchí ${t}`, province: 'Alajuela', canton: 'Grecia', district: 'Grecia',
      country: 'CR', isPrimary: true, isDefault: true, status: 'active', isActive: true, requiresEncomienda: true, encomienda: null, createdAt: now, updatedAt: now };
    await patch(DB2, `users/${reg2.result.uid}`, { addressModel: 'single-v1', defaultAddress: g, addresses: [g] });
    await pause(2500);
    await page.goto(`${WEB}/slm/users`); await page.waitForTimeout(5000);
    const search6 = page.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
    await search6.fill(reg2.result.slCode); await search6.press('Enter'); await page.waitForTimeout(4000);
    await page.getByText(`Grecia Mapa${t}`, { exact: true }).first().click(); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Direcciones/ }).first().click(); await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Editar dirección' }).first().click(); await page.waitForTimeout(3000);
    dlg = page.getByTestId('admin-address-modal');
    await shot('5-grecia');
    const routeTxt = await dlg.getByTestId('admin-address-route').innerText().catch(() => '');
    const warn = await dlg.getByTestId('admin-address-text-mismatch').innerText().catch(() => '');
    check('6. Grecia → Occidente según la hoja, sin encomienda (aunque el texto diga Sarchí)', /Occidente/.test(routeTxt) && !(await dlg.getByTestId('admin-address-encomienda').count()), routeTxt);
    check('6b. Aviso: el texto menciona otra zona (solo aviso, no cambia la ruta)', /Sarchí/.test(warn) && /Grecia/.test(warn), warn.slice(0, 100));
    await dlg.getByRole('button', { name: /Guardar Cambios/ }).click(); await page.waitForTimeout(5000);
    const ug = await get(DB2, `users/${reg2.result.uid}`);
    check('6c. Al guardar queda requiresEncomienda=false (el mapa corrige la marca vieja)', v(m(ug?.defaultAddress).requiresEncomienda) === false);
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
