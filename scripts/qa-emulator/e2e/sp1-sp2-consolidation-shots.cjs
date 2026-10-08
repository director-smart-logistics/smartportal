// "Día 1" = FIRST invoice + SP2 "En Consolidación" — screenshots and checks of the two production shapes, built with
// the app's own flows on the QA emulator (2026-09-28):
//   SL26254: A first invoiced (#1, 5 days ago) and annulled → consolidation; carry-on to 24-09-2026DAN;
//     re-invoiced with B in #2-C (3 days ago) and annulled from the Facturas panel → both back in consolidation.
//     Expected: A = #1 date, B = #2 date; A listed FIRST; header counter = A's date.
//   SL7511 (6 packages): invoices #1 (7 days ago), #2 (5 days ago 13:09), #3 (5 days ago 14:29) annulled →
//     order: the two of #1 (by tracking), the one of #2, then the three of #3 (by tracking).
// Screens (OUT, default $CLAUDE_JOB_DIR/tmp/consolidation-shots): SP1 Consolidation page (both customers),
// SP2 dashboard "En Consolidación" desktop + mobile (SL26254), SP2 admin "Ver lo que el cliente ve" (SL26254).
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-sp2-consolidation-shots.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT || path.join(process.env.CLAUDE_JOB_DIR || require('os').tmpdir(), 'tmp/consolidation-shots');
fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB1 = `${B}/portal/documents`, DB2 = `${B}/(default)/documents`;
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 25000) => { const end = Date.now() + ms; for (;;) { const x = await fn(); if (x || Date.now() > end) return x; await sleep(1000); } };
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (base, p, data) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const patch = (base, p, data) => fetch(`${base}/${p}?${Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const del = (base, p) => fetch(`${base}/${p}`, { method: 'DELETE', headers: H });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f, k) => f?.[k] ? Object.values(f[k])[0] : undefined;

/** A moment N days ago at hh:mm Costa Rica time. */
const at = (days, hh, mm) => { const d = new Date(Date.now() - days * 86_400_000); const ymd = d.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }); return new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-06:00`); };
const num = (sl, d, suffix = '') => { const x = new Date(d.getTime() - 6 * 3600e3); const p = (v2, l = 2) => String(v2).padStart(l, '0');
  return `${sl}-${x.getUTCFullYear()}${p(x.getUTCMonth() + 1)}${p(x.getUTCDate())}${p(x.getUTCHours())}${p(x.getUTCMinutes())}${p(x.getUTCSeconds())}000${suffix}`; };
const crDate = (d) => d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Costa_Rica' });
const spDate = (d) => d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' });

const K = { sl: 'SL26254', name: 'CLIENTE SL26254 QA', A: 'GFUS01072532552769', B: 'GFUS01072527880385' };
const S = { sl: 'SL7511', name: 'CLIENTE SL7511 QA', pk: ['1Z215YE70310310687', 'GFUS01072035895872', 'GFUS01072167370240', 'GFUS01072342717504', 'GFUS01072352765185', 'TBA334559460645'] };
const dK1 = at(5, 14, 27), dK2 = at(3, 15, 21);
const dS1 = at(7, 14, 55), dS2 = at(5, 13, 9), dS3 = at(5, 14, 29);
const INV = { k1: num(K.sl, dK1), k2: num(K.sl, dK2, '-C'), s1: num(S.sl, dS1, '-C'), s2: num(S.sl, dS2, '-C'), s3: num(S.sl, dS3, '-C') };

async function invoice(id, number, date, sl, name, trk, manifest) {
  await put(DB1, `invoices/${id}`, { invoiceNumber: number, invoiceDate: date.toISOString(), createdAt: date.toISOString(), status: 'sent', isConsolidation: true, slCode: sl, clientSlCode: sl, customerId: sl, clientName: name,
    manifestNumber: manifest, manifestNumbers: [manifest], trackingNumbers: trk, trackingNumber: trk[0], packageCount: trk.length, totalAmount: 5 * trk.length, currency: 'USD', items: trk.map((x) => ({ trackingNumber: x, tracking: x, totalPrice: 5 })) });
  for (const x of trk) await patch(DB1, `packages/${x}`, { invoiceId: id, invoiceNumber: number, invoiceStatus: 'sent', manifestNumber: manifest, manifestId: manifest, status: 'processed' });
}
/** What the Facturas panel annul writes (Invoices.tsx handleAnnulInvoice). */
async function facturasAnnul(id, number, date, trk) {
  await patch(DB1, `invoices/${id}`, { status: 'annulled' });
  const now2 = new Date().toISOString();
  for (const x of trk) {
    const cur = await get(DB1, `packages/${x}`) || {};
    const hist = cur.statusHistory?.arrayValue?.values || [];
    const note = enc({ status: 'consolidated', changedAt: now2, changedBy: 'admin@prueba.local', note: `Factura ${number} anulada desde panel de facturas — paquete desvinculado.` });
    const fields = { manifestId: enc('consolidacion_transitoria'), manifestNumber: enc('consolidacion_transitoria'), updatedManifest: enc('consolidacion_transitoria'), manifestUpdatedAt: enc(now2),
      consolidacion: enc(true), status: enc('consolidated'), annulledInvoiceId: enc(id), annulledInvoiceNumber: enc(number), annulledInvoiceDate: enc(date.toISOString()), annulledAt: enc(now2), invoicedAt: enc(date.toISOString()),
      statusHistory: { arrayValue: { values: [...hist, note] } } };
    const mask = [...Object.keys(fields), 'invoiceId', 'invoiceNumber', 'invoiceStatus'].map((k) => `updateMask.fieldPaths=${k}`).join('&');
    await fetch(`${DB1}/packages/${x}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  }
}

(async () => {
  const cwd = path.join(__dirname, '../../..');
  const rulesTxt = fs.readFileSync(path.join(cwd, '../smart-portal-2/firestore.rules'), 'utf8');
  await fetch('http://localhost:8080/emulator/v1/projects/demo-sp-qa/databases/(default):securityRules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rulesTxt }] } }) });

  // Clean previous runs of these reproductions (emulator only): packages, invoices, SP2 list items.
  for (const t of [K.A, K.B, ...S.pk]) { await del(DB1, `packages/${t}`); }
  for (const t of [K.A, K.B]) await del(DB2, `consolidation_items/${K.sl}_${t}`);
  for (const t of S.pk) await del(DB2, `consolidation_items/${S.sl}_${t}`);
  for (const id of ['K1', 'K2', 'S1', 'S2', 'S3']) await del(DB1, `invoices/SHOT-${id}`);

  // SP2 account for "cliente SL26254", cloned from the complete seed profile (no onboarding modals).
  const email = 'sl26254-qa@prueba.local';
  let su = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json();
  if (!su.localId) su = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json();
  const seedUser = (await (await fetch(`${DB2}/users/e2e-sl90001`, { headers: H })).json()).fields;
  const fields = { ...seedUser, uid: { stringValue: su.localId }, email: { stringValue: email }, slCode: { stringValue: K.sl }, firstName: { stringValue: 'Cliente' }, lastName: { stringValue: 'SL26254 QA' }, displayName: { stringValue: 'Cliente SL26254 QA' }, dni: { stringValue: '100026254' } };
  delete fields.routeReview;
  await fetch(`${DB2}/users/${su.localId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });

  // SP1 customers + packages (in 01-09-2026DAN, received)
  await put(DB1, `customers/${K.sl}`, { slCode: K.sl, fullName: K.name, customerName: K.name, ruta: 'Heredia', consolidationEnabled: true });
  await put(DB1, `customers/${S.sl}`, { slCode: S.sl, fullName: S.name, customerName: S.name, ruta: 'Heredia', consolidationEnabled: true });
  for (const t of [K.A, K.B]) await put(DB1, `packages/${t}`, { tracking: t, trackingNumber: t, slCode: K.sl, customerId: K.sl, customerName: K.name, status: 'customs', consolidacion: true, manifestNumber: '01-09-2026DAN', manifestId: '01-09-2026DAN', weight: 1, price: 5, description: 'QA SL26254', createdAt: at(10, 9, 0).toISOString(), statusHistory: [] });
  for (const t of S.pk) await put(DB1, `packages/${t}`, { tracking: t, trackingNumber: t, slCode: S.sl, customerId: S.sl, customerName: S.name, status: 'customs', consolidacion: true, manifestNumber: '01-09-2026DAN', manifestId: '01-09-2026DAN', weight: 1, price: 5, description: 'QA SL7511', createdAt: at(10, 9, 0).toISOString(), statusHistory: [] });
  await sleep(2000);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  const run = (fn, ...args) => page.evaluate(async ([fn, args]) => { const m = await import('/client/lib/services/invoice-service.ts'); const r = await m[fn](...args); return r === undefined ? null : JSON.parse(JSON.stringify(r)); }, [fn, args]);

  // SL26254: #1 (A) annulled with the app's flow; carry-on to 24-09-2026DAN; #2-C (A+B) annulled from the Facturas panel.
  await invoice('SHOT-K1', INV.k1, dK1, K.sl, K.name, [K.A], '01-09-2026DAN');
  await run('moveInvoiceToTransitoria', 'SHOT-K1', { annulledBy: 'e2e' });
  await sleep(1500);
  await patch(DB1, `packages/${K.A}`, { manifestNumber: '24-09-2026DAN', manifestId: '24-09-2026DAN', updatedManifest: '24-09-2026DAN', manifestUpdatedAt: new Date().toISOString() });   // Carry-On
  await sleep(1500);
  await invoice('SHOT-K2', INV.k2, dK2, K.sl, K.name, [K.A, K.B], '24-09-2026DAN');
  await sleep(1500);
  await facturasAnnul('SHOT-K2', INV.k2, dK2, [K.A, K.B]);
  // SL7511: #1 (2 pkgs), #2 (1), #3 (3), all annulled.
  await invoice('SHOT-S1', INV.s1, dS1, S.sl, S.name, [S.pk[1], S.pk[2]], '01-09-2026DAN'); await sleep(800); await facturasAnnul('SHOT-S1', INV.s1, dS1, [S.pk[1], S.pk[2]]);
  await invoice('SHOT-S2', INV.s2, dS2, S.sl, S.name, [S.pk[5]], '01-09-2026DAN'); await sleep(800); await facturasAnnul('SHOT-S2', INV.s2, dS2, [S.pk[5]]);
  await invoice('SHOT-S3', INV.s3, dS3, S.sl, S.name, [S.pk[0], S.pk[3], S.pk[4]], '01-09-2026DAN'); await sleep(800); await facturasAnnul('SHOT-S3', INV.s3, dS3, [S.pk[0], S.pk[3], S.pk[4]]);
  await until(async () => v(await get(DB2, `consolidation_items/${K.sl}_${K.B}`), 'active') === true);
  await sleep(4000);

  const fA = await get(DB1, `packages/${K.A}`);
  check('SP1: el paquete A guarda su PRIMERA factura (la #1), aunque luego se re-facturó y anuló otra', v(fA, 'firstInvoiceNumber') === INV.k1, `${v(fA, 'firstInvoiceNumber')}`);

  // ── SP1 Consolidation page
  const readCard = async (sl, file) => {
    await page.goto('http://localhost:5174/consolidation/manifests', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
    const search = page.locator('input[placeholder*="uscar" i]').first();
    await search.fill(sl); await page.waitForTimeout(3500);
    const first = sl === K.sl ? K.A : S.pk[1];
    for (let i = 0; i < 4 && !(await page.getByText(first, { exact: true }).first().isVisible().catch(() => false)); i++) {
      const expand = page.locator('[title="Expandir cliente"]:visible').first();
      if (await expand.count()) await expand.click().catch(() => {}); await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    const lines = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && /^(GFUS|TBA|1Z)\w+$/.test((e.textContent || '').trim()))
      .map((e) => { let row = e; for (let i = 0; i < 8 && row && !/Día 1:/.test(row.textContent || ''); i++) row = row.parentElement; const m = (row?.textContent || '').match(/Día 1:\s*([0-9/]+)\s*(·\s*[^D]*?)?Días/); return { t: e.textContent.trim(), date: m?.[1] || null, src: (m?.[2] || '').replace('·', '').trim() }; }));
    const since = await page.locator('[aria-label^="Consolida desde"]').first().getAttribute('aria-label').catch(() => null);
    return { lines: lines.filter((l, i, a) => l.date && a.findIndex((x) => x.t === l.t) === i), since };
  };
  const k = await readCard(K.sl, 'sp1-consolidacion-SL26254.png');
  const kA = k.lines.find((l) => l.t === K.A), kB = k.lines.find((l) => l.t === K.B);
  check('SP1 SL26254: A = Día 1 de su PRIMERA factura (#1), B = la #2', kA?.date === crDate(dK1) && kA?.src.includes(INV.k1) && kB?.date === crDate(dK2), JSON.stringify(k.lines));
  check('SP1 SL26254: A (más viejo) aparece ARRIBA de B', k.lines.map((l) => l.t).join(',') === `${K.A},${K.B}`);
  const shortK = dK1.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', timeZone: 'America/Costa_Rica' }).replace('.', '');
  check('SP1 SL26254: el contador del encabezado ("Consolida desde") = el Día 1 más viejo (A)', (k.since || '').includes(shortK), `${k.since} (esperado ${shortK})`);
  const s = await readCard(S.sl, 'sp1-consolidacion-SL7511.png');
  const want = [S.pk[1], S.pk[2], S.pk[5], S.pk[0], S.pk[3], S.pk[4]];
  check('SP1 SL7511: orden por Día 1 (hora completa): los 2 de la #1, el de la #2 (13:09), los 3 de la #3 (14:29)', JSON.stringify(s.lines.map((l) => l.t)) === JSON.stringify(want), JSON.stringify(s.lines.map((l) => `${l.t} ${l.date}`)));

  // ── SP2 customer dashboard (SL26254)
  const sp2ctx = async (viewport) => { const c = await b.newContext({ viewport }); await c.route('**/*', (route) => { const u = new URL(route.request().url()); return (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? route.continue() : route.abort(); }); return c; };
  const login = async (c, mail, viewport) => {
    const p = await c.newPage();
    await p.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000);
    await p.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
    await p.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await p.waitForTimeout(2500);
    await p.locator('input[type=email]').first().fill(mail); await p.locator('input[type=password]').first().fill('Prueba1234!');
    await p.locator('button[type=submit]').first().click(); await p.waitForTimeout(9000);
    for (let i = 0; i < 3; i++) { const x = p.getByRole('button', { name: /(Entendido|Más tarde)/ }); if (await x.count()) await x.first().click().catch(() => {}); await p.waitForTimeout(600); }
    if (viewport) { await p.setViewportSize(viewport); await p.waitForTimeout(2000); }
    return p;
  };
  const readSp2List = async (p) => p.locator('[data-testid="consolidation-list"]:visible [data-testid^="consolidation-row-"][data-testid$="-tracking"]').allInnerTexts().catch(() => []);
  const c1 = await sp2ctx({ width: 1400, height: 1000 });
  const kp = await login(c1, email);
  await kp.locator('[data-testid="status-filter-tabs"]:visible button', { hasText: /En Consolidaci/i }).first().click({ timeout: 15000 }); await kp.waitForTimeout(3000);
  await kp.screenshot({ path: path.join(OUT, 'sp2-en-consolidacion-desktop.png'), fullPage: true });
  const listD = (await kp.locator('[data-testid="consolidation-list"]:visible').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('SP2 (cliente, escritorio): "En Consolidación" muestra A primero y luego B, con la fecha de su primera factura',
    listD.indexOf(K.A) >= 0 && listD.indexOf(K.A) < listD.indexOf(K.B) && listD.includes(`En consolidación desde el ${spDate(dK1)}`) && listD.includes(`En consolidación desde el ${spDate(dK2)}`), listD.slice(0, 200));
  await c1.close();
  const c2 = await sp2ctx({ width: 1400, height: 1000 });
  const km = await login(c2, email, { width: 390, height: 844 });
  await km.locator('[data-testid="status-filter-tabs"]:visible button', { hasText: /Consolidaci/i }).first().click({ timeout: 15000 }); await km.waitForTimeout(3000);
  await km.screenshot({ path: path.join(OUT, 'sp2-en-consolidacion-movil.png'), fullPage: true });
  const noHScroll = await km.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const listM = (await km.locator('[data-testid="consolidation-list"]:visible').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('SP2 (cliente, móvil): la lista se ve, en orden, sin scroll horizontal', listM.indexOf(K.A) >= 0 && listM.indexOf(K.A) < listM.indexOf(K.B) && noHScroll, `scrollH=${!noHScroll}`);
  await c2.close();

  // ── SP2 admin "Ver lo que el cliente ve" (SL26254) — the admin is logged in; the list uses the VIEWED customer
  // SP2 admin (same way the other admin e2e create it)
  let adm0 = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  if (!adm0.localId) adm0 = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await patch(DB2, `users/${adm0.localId}`, { role: 'admin', email: 'admin2@prueba.local', firstName: 'Admin', lastName: 'QA', status: 'active' });
  const c3 = await sp2ctx({ width: 1500, height: 1000 });
  const adm = await c3.newPage();
  await adm.goto('http://localhost:5175/'); await adm.waitForTimeout(3500);
  await adm.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
  await adm.goto('http://localhost:5175/slm/users'); await adm.waitForTimeout(5000);
  for (let i = 0; i < 3; i++) { const x = adm.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await adm.waitForTimeout(600); }
  const box = adm.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
  await box.fill(K.sl); await box.press('Enter'); await adm.waitForTimeout(4000);
  await adm.getByText('Acciones Admin', { exact: true }).first().click({ timeout: 8000 }).catch(() => {}); await adm.waitForTimeout(2000);
  await adm.getByText('Ver lo que el cliente ve', { exact: false }).first().click({ timeout: 10000 }); await adm.waitForTimeout(6000);
  await adm.getByRole('button', { name: /^Paquetes$/ }).last().click().catch(() => {}); await adm.waitForTimeout(2500);
  const tabBtn = adm.locator('[data-testid="status-filter-tabs"] button', { hasText: /En Consolidaci/i }).last();
  await tabBtn.scrollIntoViewIfNeeded().catch(() => {});
  await tabBtn.click({ timeout: 15000 }); await adm.waitForTimeout(3000);
  await adm.locator('[data-testid="consolidation-list"]').last().scrollIntoViewIfNeeded().catch(() => {});
  await adm.screenshot({ path: path.join(OUT, 'sp2-admin-vista-de-cliente.png'), fullPage: false });
  const listA = (await adm.locator('[data-testid="consolidation-list"]').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const tabsA = await adm.locator('[data-testid="status-filter-tabs"]').last().locator('button').allInnerTexts();
  check('SP2 admin "Vista de cliente": las 4 pestañas y "En Consolidación" con los paquetes de la cliente (A primero)',
    tabsA.length === 4 && listA.indexOf(K.A) >= 0 && listA.indexOf(K.A) < listA.indexOf(K.B), `${JSON.stringify(tabsA)} · ${listA.slice(0, 160)}`);
  await c3.close();

  await b.close();
  console.log(`\nCapturas: ${OUT}\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
