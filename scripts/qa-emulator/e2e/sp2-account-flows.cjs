// SP2 customer account — REAL functional test (real browser, real app http://localhost:5175, real
// Firestore + functions + SP2→SP1 sync on the QA emulator). Nothing is mocked: a new customer is
// registered through slRegisterUser, logs in through the login form and clicks like a person.
//   1. login → dashboard shows the smartcard with the customer's name
//   1b. without an address, 'Editar perfil' is not covered by the automatic 'Información incompleta'
//   2. smartcard: edit the phone → saved in SP2 users AND reaches the SP1 customer; card shows it; the name is
//      locked for a verified customer (identity, F13)
//   3. consolidation ON (terms modal "Aceptar y Activar") → SP2 + SP1; OFF → SP2 + SP1
//   4. electronic invoice ON (terms) → SP2 + SP1; OFF → SP2 + SP1
//   5. reload → the state shown is the saved one (persisted)
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp2-account-flows.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'integerValue' in v ? Number(v.integerValue)
  : 'timestampValue' in v ? v.timestampValue : 'mapValue' in v ? obj(v.mapValue.fields || {}) : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : undefined;
const obj = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
const getDoc = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? obj((await r.json()).fields) : null; };
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await pause(500); } return v; };
const t = String(Date.now()).slice(-6);

(async () => {
  const email = `cuenta-${t}@prueba.local`, PASS = 'Prueba1234!';
  const reg = await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { email, password: PASS, firstName: 'Cuenta', lastName: 'Prueba', phone: `8${t.slice(0, 3)}${t.slice(2, 6)}`, dni: `1-07${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true } }) })).json();
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) throw new Error('registro: ' + JSON.stringify(reg.error));
  const sp1 = () => getDoc(DB1, `customers/${sl}`);
  await waitFor(sp1);

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/Failed to fetch|network/i.test(e.message)) errors.push(e.message.slice(0, 120)); });
  const shot = (name) => page.screenshot({ path: path.join(OUT, `acct-${name}.png`) }).catch(() => {});
  await page.goto('http://localhost:5175/'); await page.waitForTimeout(5000);
  await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await page.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2000);
  await page.locator('input[type=email]').first().fill(email); await page.locator('input[type=password]').first().fill(PASS);
  await page.locator('button[type=submit]').first().click(); await page.waitForTimeout(9000);
  // A first-login verification / promo modal may be open: close it the way a person would.
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(1200); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }
  await shot('1-dashboard');
  check('1. Login → dashboard con la smartcard del cliente', await page.getByText(sl, { exact: false }).count() > 0 && /cuenta/i.test(await page.locator('body').innerText()), sl);

  // 1b. Customer WITHOUT an address opens "Editar perfil": only that modal (the automatic
  //     "Información incompleta" used to open on top and hide the form — existing prod bug).
  await page.getByRole('button', { name: 'Editar información del perfil' }).first().click(); await page.waitForTimeout(2500);
  const editVisible = await page.getByText('Editar Perfil', { exact: true }).isVisible().catch(() => false);
  const incompleteVisible = await page.getByText('Información incompleta', { exact: true }).isVisible().catch(() => false);
  await shot('1b-edit-no-address');
  check('1b. Sin dirección: "Editar perfil" se ve solo (no le cae encima "Información incompleta")', editVisible && !incompleteVisible, JSON.stringify({ editVisible, incompleteVisible }));
  await page.getByRole('button', { name: 'Cancelar' }).first().click().catch(() => {}); await page.waitForTimeout(1000);
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(800); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }

  // The typical customer already has an address: register one with the app's own API (same path as the
  // address screen, covered in detail by sp2-address-ui), so the account flows run without the
  // "Información incompleta" reminder.
  await page.evaluate(async () => {
    const { api } = await import('/src/infrastructure/api/index.ts');
    await api.user.addresses.create({ alias: 'Casa', type: 'residence', country: 'Costa Rica', province: 'Heredia', canton: 'Barva', district: 'San Pedro',
      streetAddress: 'Cuenta calle 1', details: 'Casa azul', recipientName: 'Cuenta Prueba', recipientPhone: '8888-0001', requiresEncomienda: false, isDefault: true, isPrimary: true, isActive: true, status: 'active' });
  });
  await page.reload(); await page.waitForTimeout(7000);
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(800); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }

  // 2. Smartcard edit
  await page.getByRole('button', { name: 'Editar información del perfil' }).first().click(); await page.waitForTimeout(1500);
  const dlg = page;   // this modal is not role=dialog; while it is open its fields are unique on the page
  await shot('2-edit-open');
  // A verified customer cannot change their name (identity, F13) — the fields are locked by design.
  const nameLocked = await dlg.getByPlaceholder('Nombre').last().isDisabled() && await dlg.getByPlaceholder('Apellido').last().isDisabled();
  const phoneBox = dlg.getByPlaceholder(/8888-8888|\+506/).last();
  const newPhone = `7${t.slice(0, 3)}${t.slice(3, 6)}9`;
  await phoneBox.fill(newPhone);
  await shot('2-edit');
  await dlg.getByRole('button', { name: /Guardar/ }).last().click(); await page.waitForTimeout(3000);
  const u2 = await getDoc(DB2, `users/${uid}`);
  const c2 = await waitFor(async () => { const c = await sp1(); return c && String(c.phone || '').replace(/\D/g, '').endsWith(newPhone) ? c : null; });
  // After saving, the edit modal reminds a customer without an address to add it ("Más tarde" closes it).
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }
  await shot('2-after');
  const cardText = await page.locator('body').innerText();
  check('2. Smartcard: el teléfono se guarda en SP2 y llega a SP1; la tarjeta lo muestra; el nombre está bloqueado (identidad)',
    nameLocked && String(u2?.phone || '').replace(/\D/g, '').endsWith(newPhone) && !!c2 && cardText.replace(/\D/g, '').includes(newPhone),
    JSON.stringify({ sp2: [u2?.firstName, u2?.phone], sp1: [c2?.fullName, c2?.phone] }).slice(0, 160));

  // 3 / 4. Toggles
  const toggle = async (testid, field, sp1Field, label) => {
    await shot(`${testid}-before`);
    await page.locator(`[data-testid="${testid}-switch"]:visible`).first().click(); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Aceptar y Activar' }).click(); await page.waitForTimeout(2500);
    const onSp2 = (await getDoc(DB2, `users/${uid}`))?.[field] === true;
    const onSp1 = await waitFor(async () => (await sp1())?.[sp1Field] === true);
    await shot(`${testid}-on`);
    await page.locator(`[data-testid="${testid}-switch"]:visible`).first().click(); await page.waitForTimeout(2500);
    const offSp2 = (await getDoc(DB2, `users/${uid}`))?.[field] === false;
    const offSp1 = await waitFor(async () => (await sp1())?.[sp1Field] === false);
    check(`${label}: activar (con términos) y desactivar → SP2 y SP1`, onSp2 && !!onSp1 && offSp2 && !!offSp1, JSON.stringify({ onSp2, onSp1: !!onSp1, offSp2, offSp1: !!offSp1 }));
  };
  await toggle('consolidation-toggle', 'consolidationEnabled', 'consolidationEnabled', '3. Consolidación');
  await toggle('electronic-invoice-toggle', 'electronicInvoiceRequired', 'electronicInvoiceRequired', '4. Factura electrónica');

  // 5. Persisted: turn consolidation ON again, reload, the card shows it active.
  await page.locator('[data-testid="consolidation-toggle-switch"]:visible').first().click(); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Aceptar y Activar' }).click(); await page.waitForTimeout(2500);
  await page.reload(); await page.waitForTimeout(8000);
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(1200); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }
  const card = await page.locator('[data-testid="consolidation-toggle-card"]:visible').first().innerText().catch(() => '');
  const einv = await page.locator('[data-testid="electronic-invoice-toggle-card"]:visible').first().innerText().catch(() => '');
  await shot('5-reload');
  check('5. Al recargar se ve lo guardado (consolidación activa, factura electrónica desactivada) y el teléfono nuevo',
    !/Desactivad/i.test(card) && /Desactivad/i.test(einv) && (await page.locator('body').innerText()).replace(/\D/g, '').includes(newPhone), JSON.stringify({ card: card.slice(0, 60), einv: einv.slice(0, 60) }));
  check('6. Sin errores de JavaScript en la página', errors.length === 0, errors.slice(0, 3).join(' | '));

  await b.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
