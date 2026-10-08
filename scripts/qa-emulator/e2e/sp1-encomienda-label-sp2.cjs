// Encomiendas → Manifiestos → "Generar etiqueta" (REAL SP1 app + real functions on the QA emulator), F11.2:
// the option "Actualizar también la dirección principal del cliente en SmartWeb (SP2)".
//   1. the option comes CHECKED by default
//   2. generating the label WITHOUT editing the address → SP2 is not written
//   3. editing the street → SP2 principal address changes; province/canton/district, otras señas and instructions are kept (nothing erased)
//   4. editing with the option UNCHECKED → SP2 is not written
// Uses its own QA customer (SL90024), created at the start and removed at the end (QA emulator only).
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-encomienda-label-sp2.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const SL = 'SL90024', TRK = 'LBLQA0001', M = 'ENC-QA-LBL', EMAIL = 'cliente-lbl-ui@prueba.local', PASS = 'Prueba1234!';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1', J = { 'Content-Type': 'application/json' };
const ADDR = { streetAddress: 'Del parque 100 m sur', details: 'Casa azul', deliveryInstructions: 'Llamar al llegar', province: 'Heredia', canton: 'Barva', district: 'San Pedro', country: 'Costa Rica', recipientName: 'Cliente Etiqueta UI' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = (p, ms) => Promise.race([p, pause(ms)]).catch(() => {});
const raw = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? r.json() : null; };
const sv = (f) => f?.stringValue;
const runQuery = async (base, coll, field, value) => (await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json()).filter((r) => r.document).map((r) => r.document);
/** Put a document back exactly as it was (fields added later are removed). */
const restore = async (base, p, before) => {
  const now = await raw(base, p);
  if (!before) { if (now) await fetch(`${base}/${p}`, { method: 'DELETE', headers: H }); return; }
  const keys = [...new Set([...Object.keys(before.fields || {}), ...Object.keys(now?.fields || {})])];
  const mask = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent('`' + k + '`')}`).join('&');
  await fetch(`${base}/${p}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: before.fields || {} }) });
};

const enc = (x) => typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const putDoc = (base, p, o) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const addrOf = (d) => { const a = d?.fields?.defaultAddress?.mapValue?.fields || {}; return Object.fromEntries(Object.entries(a).filter(([k]) => ['streetAddress', 'details', 'deliveryInstructions', 'province', 'canton', 'district', 'recipientName'].includes(k)).map(([k, v]) => [k, sv(v)])); };

(async () => {
  // QA customer: Auth account + SP2 users doc (single-v1) + address; SP2 pushes it to SP1.
  const up = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) })).json();
  const uid = up.localId || (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: J, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) })).json()).localId;
  const uidPath = `users/${uid}`;
  const block = { ...ADDR, id: `${SL}-A`, userId: uid, isDefault: true, isPrimary: true, isActive: true, status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  await putDoc(DB2, `addresses/${SL}-A`, block);
  await putDoc(DB2, uidPath, { uid, email: EMAIL, slCode: SL, firstName: 'Cliente', lastName: 'Etiqueta UI', dni: '100090024', phone: '88882222', role: 'customer', status: 'active', isActive: true, isVerified: true,
    defaultAddress: block, addresses: [block], addressModel: 'single-v1' });
  await putDoc(DB1, `customers/${SL}`, { slCode: SL, fullName: 'Cliente Etiqueta UI', email: EMAIL, ruta: 'Encomiendas', status: 'active', defaultAddress: block, addresses: [block] });
  await pause(6000);
  const snap = { u: null, c: null, a: {} };   // created by this test → removed at the end
  await fetch(`${DB1}/packages/${TRK}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { trackingNumber: { stringValue: TRK }, tracking: { stringValue: TRK }, slCode: { stringValue: SL },
    customerName: { stringValue: 'Cliente Etiqueta UI' }, ruta: { stringValue: 'Encomiendas' }, status: { stringValue: 'customs' }, manifestNumber: { stringValue: M }, weight: { doubleValue: 1 }, createdAt: { stringValue: new Date().toISOString() } } }) });

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `lbl-${name}.png`) }).catch(() => {});
  const sp2 = async () => { const d = await raw(DB2, uidPath); return { addr: addrOf(d), fields: d?.fields || {} }; };
  const changedKeys = (x, y) => Object.keys({ ...x.fields, ...y.fields }).filter((k) => JSON.stringify(x.fields[k]) !== JSON.stringify(y.fields[k]));
  const openLabel = async () => {
    await page.goto(`${APP}/encomiendas/manifests`); await page.waitForTimeout(6000);
    await page.getByRole('button', { name: /Refrescar caché/ }).first().click().catch(() => {}); await page.waitForTimeout(6000);
    await page.getByText(M).first().click(); await page.waitForTimeout(2500);
    if (!(await page.locator('button[title="Generar etiqueta"]').count())) { await page.getByText(/Cliente Etiqueta UI/i).first().click().catch(() => {}); await page.waitForTimeout(2500); }
    await page.locator('button[title="Generar etiqueta"]').first().click();
    await page.locator('#nova-label-address').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
    // The courier service is required to print; the QA customer has none.
    const courier = page.locator('#nova-label-courier');
    if (!(await courier.inputValue())) { await courier.fill('Correos de Costa Rica'); await page.getByText('Dirección de Entrega', { exact: false }).first().click(); await pause(500); }
  };
  const generate = async () => {
    await page.getByRole('button', { name: /^Generar Etiqueta$/ }).last().click();
    await page.waitForTimeout(8000);
  };
  try {
    await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
    await popup.waitForLoadState('domcontentloaded'); await popup.waitForTimeout(1500);
    if (await popup.getByText('admin@prueba.local').count()) await popup.getByText('admin@prueba.local').first().click();
    else {   // clean emulator: the Google account does not exist yet → add it in the emulator popup
      await popup.getByText(/Add new account/i).first().click(); await popup.waitForTimeout(800);
      await popup.locator('#email-input, input[type=email], input').first().fill('admin@prueba.local');
      await popup.getByRole('button', { name: /Sign in with Google/i }).first().click();
    }
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    ctx.on('page', (p) => { if (p !== page) setTimeout(() => p.close().catch(() => {}), 3000); });   // the printed label window

    await openLabel(); await shot('1-modal');
    const text0 = await page.locator('#nova-label-address').inputValue();
    check('1. La opción "Actualizar también en SmartWeb" viene marcada', await page.locator('#updateSp2Address').isChecked(), JSON.stringify(text0.slice(0, 60)));

    const s0 = await sp2();
    await generate();
    const s1 = await sp2();
    check('2. Generar la etiqueta SIN editar la dirección → la dirección en SP2 no cambia', JSON.stringify(s1.addr) === JSON.stringify(s0.addr), `otros campos que cambiaron en SP2: ${JSON.stringify(changedKeys(s0, s1))}`);

    await openLabel();
    const lines = (await page.locator('#nova-label-address').inputValue()).split('\n');
    const NEW = ['Calle Etiqueta QA 99', ...lines.slice(1)].join('\n');
    await page.locator('#nova-label-address').fill(NEW); await pause(500); await shot('3-edited');
    await generate(); await pause(4000);
    const s2 = await sp2();
    const keep = ['province', 'canton', 'district', 'details', 'deliveryInstructions', 'recipientName'];
    check('3. Editar la calle → la dirección principal en SP2 cambia', s2.addr.streetAddress === 'Calle Etiqueta QA 99', `antes=${s0.addr.streetAddress} ahora=${s2.addr.streetAddress}`);
    check('3b. … y no se borra nada: provincia, cantón, distrito y otras señas iguales', keep.every((k) => s2.addr[k] === s0.addr[k]), JSON.stringify(s2.addr));

    await openLabel();
    await page.locator('#updateSp2Address').uncheck(); await pause(300);
    const lines2 = (await page.locator('#nova-label-address').inputValue()).split('\n');
    await page.locator('#nova-label-address').fill(['Otra Calle No Enviar', ...lines2.slice(1)].join('\n')); await pause(500);
    const s3 = await sp2();
    await generate(); await pause(4000);
    const s4 = await sp2();
    check('4. Editar con la opción DESMARCADA → la dirección en SP2 no cambia', JSON.stringify(s4.addr) === JSON.stringify(s3.addr), s4.addr.streetAddress);
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await pause(5000);   // let the SP2 → SP1 push finish before restoring
    await limit((async () => {
      for (const d of await runQuery(DB2, 'addresses', 'userId', uidPath.split('/').pop())) await fetch(`${DB2}/addresses/${d.name.split('/').pop()}`, { method: 'DELETE', headers: H });
      await fetch(`${DB2}/${uidPath}`, { method: 'DELETE', headers: H });
      await pause(3000);
      await fetch(`${DB1}/customers/${SL}`, { method: 'DELETE', headers: H });
      await fetch(`${DB1}/packages/${TRK}`, { method: 'DELETE', headers: H });
    })(), 60000);
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
