// "Revisar ruta" end to end on the QA emulator (real functions, both apps), with screenshots:
//   Setup: a customer in Guanacaste on route Encomiendas (before: Alajuela), a Nova learning entry and two SP1
//          packages (one in process, one delivered) on Encomiendas.
//   1. The CUSTOMER moves to Alajuela in the SmartWeb dashboard → the old encomienda is removed (users + copy)
//   2. SP1 opens the review: pending, recommends Alajuela, says it was Alajuela before, flags the encomienda
//      conflict, explains itself; routeAttention on; log; mirrored to SmartWeb; e-mail alert logged
//   3. SmartWeb admin card shows "Revisar ruta"; gerencia KEEPS Encomiendas → decision logged, SP1 closes the
//      same review but Nova keeps the badge (not the recommendation) → double check
//   4. SP1 Clientes shows the badge; the dialog confirms Alajuela → SP1 + SmartWeb + Nova learning updated,
//      the package in process moved (the delivered one untouched), integrity all green, badge gone by itself
//   5. Edge: nothing moves the route by itself at any step before a decision
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-sp2-route-review.cjs
const { chromium } = require('playwright');
const path = require('path');
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1';
const AUTH = 'http://localhost:9099';
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB2 = `${B}/(default)/documents`, DB1 = `${B}/portal/documents`;
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const t = String(Date.now()).slice(-6);
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const patch = (base, p, o) => fetch(`${base}/${p}?${Object.keys(o).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const dec = (f) => f == null ? f : 'stringValue' in f ? f.stringValue : 'booleanValue' in f ? f.booleanValue : 'nullValue' in f ? null : 'integerValue' in f ? Number(f.integerValue) : 'doubleValue' in f ? f.doubleValue
  : 'mapValue' in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, dec(v)])) : 'arrayValue' in f ? (f.arrayValue.values || []).map(dec) : f;
const doc = async (base, p) => { const f = await get(base, p); return f ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, dec(v)])) : null; };
const q = async (base, coll, field, value) => ((await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json()).filter((r) => r.document)).map((r) => Object.fromEntries(Object.entries(r.document.fields).map(([k, v]) => [k, dec(v)])));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await pause(1000); } return v; };
const limit = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]).catch(() => {});
const signIn = async (email, password) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json());

(async () => {
  let adm = await signIn('admin2@prueba.local', 'Prueba1234!');
  if (!adm.localId) adm = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin2@prueba.local', password: 'Prueba1234!', returnSecureToken: true }) })).json();
  await patch(DB2, `users/${adm.localId}`, { role: 'admin', email: 'admin2@prueba.local', firstName: 'Admin', lastName: 'QA', status: 'active' });
  const email = `ruta-${t}@prueba.local`, PASS = 'Prueba1234!';
  const reg = await (await fetch(`${FN}/slRegisterUser`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { email, password: PASS, firstName: 'Ruta', lastName: 'Revisar', phone: `8${t}9`, dni: `1-04${t.slice(0, 2)}-${t.slice(-4)}`, acceptTerms: true } }) })).json();
  const uid = reg.result?.uid, sl = reg.result?.slCode;
  if (!uid) { console.error('ERR registro', JSON.stringify(reg.error)); process.exit(1); }
  const now = new Date().toISOString();
  const GUANA = { id: `A${t}`, userId: uid, alias: 'Casa', type: 'residence', streetAddress: `Frente a la iglesia ${t}`, province: 'Guanacaste', canton: 'Liberia', district: 'Liberia Centro', country: 'Costa Rica', requiresEncomienda: true, encomienda: { id: 'enc-qa', name: 'Encomienda QA' }, isPrimary: true, isDefault: true, isActive: true, status: 'active', createdAt: now, updatedAt: now };
  // Setup = the state a real customer has before moving (no review open).
  await patch(DB2, `addresses/A${t}`, GUANA);
  await patch(DB2, `users/${uid}`, { addressModel: 'single-v1', defaultAddress: GUANA, addresses: [GUANA], ruta: 'Encomiendas', encomiendaProvider: 'Encomienda QA' });
  await until(async () => ((await doc(DB1, `customers/${sl}`))?.defaultAddress || {}).province === 'Guanacaste');
  await pause(3000);
  await patch(DB1, `customers/${sl}`, { ruta: 'Encomiendas', routeHistory: [{ previousRuta: 'Alajuela', newRuta: 'Encomiendas', changedAt: '2026-05-01T00:00:00.000Z', changedBy: 'ops@qa' }], routeReview: null, packagesOnPreviousRoute: null });
  await patch(DB2, `users/${uid}`, { routeReview: null });
  await patch(DB1, `match_feedback/QAMF${t}`, { slCode: sl, normalizedName: `RUTA REVISAR ${t}`, manifestName: `RUTA REVISAR ${t}`, fullName: 'Ruta Revisar', ruta: 'Encomiendas', hitCount: 3 });
  await patch(DB1, `packages/QAOPEN${t}`, { trackingNumber: `QAOPEN${t}`, slCode: sl, ruta: 'Encomiendas', status: 'processed', statusLabel: 'Facturado', createdAt: now });
  await patch(DB1, `packages/QADONE${t}`, { trackingNumber: `QADONE${t}`, slCode: sl, ruta: 'Encomiendas', status: 'delivered', statusLabel: 'Entregado', createdAt: now });
  await until(async () => (await doc(DB1, `customers/${sl}`))?.routeAttention !== true, 15000);
  await pause(2000);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const shot = (x, pg = page) => pg.screenshot({ path: path.join(OUT, `rr-${x}.png`) }).catch(() => {});
  try {
    // ── 1. The customer moves to Alajuela ──
    await page.goto('http://localhost:5175/'); await page.waitForTimeout(3500);
    await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
    await page.evaluate(async ([e, p]) => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), e, p); }, [email, PASS]);
    await page.goto('http://localhost:5175/account'); await page.waitForTimeout(8000);
    for (let i = 0; i < 5; i++) { await page.waitForTimeout(800); const later = page.getByRole('button', { name: /(Más tarde|Entendido)/ }); if (await later.count()) await later.first().click().catch(() => {}); }
    await page.getByTestId('delivery-addresses-card').getByTestId('delivery-addresses-add-button').click(); await page.waitForTimeout(2500);
    await page.getByTestId('location-province-button').first().click(); await page.waitForTimeout(400);
    await page.getByTestId('location-province-option-Alajuela').first().click(); await page.waitForTimeout(400);
    await page.getByTestId('location-district-input').first().fill('Alajuela Centro'); await page.waitForTimeout(800);
    await page.locator('[data-testid^="location-district-option-"]').first().click(); await page.waitForTimeout(500);
    await page.getByPlaceholder('Dirección completa').first().fill(`Del parque central 100 m norte ${t}`); await page.waitForTimeout(300);
    await shot('1-cliente-cambia');
    await page.getByRole('button', { name: /^Guardar/ }).last().click(); await page.waitForTimeout(6000);
    const u1 = await doc(DB2, `users/${uid}`); const copy = await doc(DB2, `addresses/A${t}`);
    check('1. El cliente se muda a Alajuela y la encomienda anterior se quita (users y copia)', u1?.defaultAddress?.province === 'Alajuela' && u1.defaultAddress.requiresEncomienda === false && !u1.defaultAddress.encomienda && copy && !copy.encomienda,
      JSON.stringify({ prov: u1?.defaultAddress?.province, req: u1?.defaultAddress?.requiresEncomienda, enc: u1?.defaultAddress?.encomienda || null, copyEnc: copy?.encomienda || null }));

    // ── 2. SP1 opens the review ──
    const c2 = await until(async () => { const c = await doc(DB1, `customers/${sl}`); return c?.routeReview?.status === 'pending' && c.routeAttention === true ? c : null; });
    const r2 = c2?.routeReview || {};
    check('2a. SP1: Revisar ruta pendiente, recomienda Alajuela, antes era Alajuela, conflicto de encomienda', r2.suggestedRuta === 'Alajuela' && r2.previousRuta === 'Alajuela' && /Encomiendas/.test(r2.encomiendaConflict || '') && r2.currentRuta === 'Encomiendas',
      JSON.stringify({ sug: r2.suggestedRuta, prev: r2.previousRuta, conflict: r2.encomiendaConflict }));
    check('2b. El resumen se explica solo (no es un error del sistema) y la ruta NO cambió sola', /antes era Alajuela/.test(r2.summary || '') && /No es un error del sistema/.test(r2.summary || '') && c2?.ruta === 'Encomiendas');
    check('2c. routeAttention encendido (badge en vivo) y log "created"', c2?.routeAttention === true && (await q(DB1, 'route_reviews', 'slCode', sl)).some((l) => l.event === 'created'));
    const u2 = await until(async () => { const u = await doc(DB2, `users/${uid}`); return u?.routeReview?.id === r2.id ? u : null; }, 15000);
    check('2d. Reflejado en SmartWeb (users.routeReview) y alerta de correo registrada', !!u2 && (await q(DB2, 'audit_logs', 'action', 'route_review_alert_sent')).some((l) => l.metadata?.slCode === sl));

    // ── 3. SmartWeb admin keeps Encomiendas ──
    await page.evaluate(async () => { const { getAuth, signOut } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signOut(getAuth()); }).catch(() => {});
    await page.evaluate(async () => { const { getAuth, signInWithEmailAndPassword } = await import('/node_modules/.vite/deps/firebase_auth.js'); await signInWithEmailAndPassword(getAuth(), 'admin2@prueba.local', 'Prueba1234!'); });
    await page.goto('http://localhost:5175/slm/users'); await page.waitForTimeout(5000);
    for (let i = 0; i < 3; i++) { const x = page.getByRole('button', { name: /(Aceptar todo|Más tarde|Entendido)/ }); if (await x.count()) await x.first().click().catch(() => {}); await page.waitForTimeout(600); }
    const box = page.locator('[role="main"][aria-label="Gestión de usuarios"] input').first();
    await box.fill(sl); await box.press('Enter'); await page.waitForTimeout(5000);
    const panel = page.locator('[data-testid="route-review-panel"]:visible').first();
    await panel.scrollIntoViewIfNeeded().catch(() => {});
    check('3a. SmartWeb: la tarjeta del cliente muestra "Revisar ruta" con el resumen y la recomendada', (await panel.count()) > 0 && /Alajuela/.test(await panel.innerText().catch(() => '')));
    await shot('2-smartweb-panel');
    await panel.getByTestId('route-review-keep').click(); await page.waitForTimeout(500);
    await shot('3-smartweb-confirmar');
    await page.locator('[data-testid="route-review-apply"]:visible').first().click(); await page.waitForTimeout(6000);
    await shot('4-smartweb-decidido');
    const c3 = await until(async () => { const c = await doc(DB1, `customers/${sl}`); return c?.routeReview?.status === 'resolved' ? c : null; }, 20000);
    check('3b. SP1 cierra la misma revisión con la decisión de SmartWeb (mantuvo, no la recomendada)', c3?.routeReview?.decision === 'kept_current' && c3.routeReview.resolvedIn === 'sp2' && c3.ruta === 'Encomiendas');
    await pause(3000);
    check('3c. Doble revisión: Nova mantiene el badge (routeAttention sigue encendido)', (await doc(DB1, `customers/${sl}`))?.routeAttention === true);

    // ── 4. SP1 Clientes: confirm Alajuela ──
    const ctx1 = await b.newContext({ viewport: { width: 1440, height: 950 } });   // SP1: Google sign-in popup (emulator)
    const p1 = await ctx1.newPage();
    await p1.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' }); await p1.waitForTimeout(6000);
    await shot('4b-sp1-login', p1);
    const gbtn = p1.getByRole('button', { name: /google/i }).first();
    await gbtn.waitFor({ timeout: 20000 });
    const [popup] = await Promise.all([ctx1.waitForEvent('page', { timeout: 30000 }), gbtn.click()]);
    await popup.waitForLoadState('domcontentloaded'); await popup.waitForTimeout(1500);
    if (await popup.getByText('admin@prueba.local').count()) await popup.getByText('admin@prueba.local').first().click();
    else { await popup.getByText(/Add new account/i).first().click(); await popup.waitForTimeout(800); await popup.locator('input').first().fill('admin@prueba.local'); await popup.getByRole('button', { name: /Sign in with Google/i }).first().click(); }
    await p1.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {});
    await p1.goto('http://localhost:5174/customers'); await p1.waitForTimeout(6000);
    for (let i = 0; i < 4 && !(await p1.getByPlaceholder(/Buscar por nombre, SL Code/).count()); i++) {   // first sign-in: the role claim lands after it
      await p1.goto('http://localhost:5174/customers'); await p1.waitForTimeout(6000);
    }
    await shot('4c-sp1-clientes', p1);
    await p1.getByPlaceholder(/Buscar por nombre, SL Code/).fill(sl); await p1.waitForTimeout(4000);
    const badge = p1.getByTestId('route-review-badge').first();
    check('4a. SP1 Clientes: badge "Revisar ruta" junto al nombre', (await badge.count()) > 0, await badge.innerText().catch(() => ''));
    await shot('5-sp1-clientes-badge', p1);
    await badge.click(); await p1.waitForTimeout(1500);
    const dlg = p1.getByTestId('route-review-dialog');
    const t0 = await dlg.innerText().catch(() => '');
    await shot('6-sp1-dialogo', p1);
    await dlg.getByTestId('route-review-accept').click(); await p1.waitForTimeout(2500);
    const t1 = await dlg.innerText().catch(() => '');
    check('4b. Diálogo: resumen claro + decisión de SmartWeb; al elegir la ruta lista el paquete en proceso (no el entregado)',
      /No es un error del sistema/.test(t0) && /mantuvo la ruta actual/.test(t0) && t1.includes(`QAOPEN${t}`) && !t1.includes(`QADONE${t}`));
    await shot('7-sp1-confirmar', p1);
    await dlg.getByTestId('route-review-apply').click();
    await p1.getByTestId('route-review-done').waitFor({ timeout: 45000 }).catch(() => {});
    await shot('8-sp1-integridad', p1);
    const integ = await p1.getByTestId('route-review-integrity').innerText().catch(() => '');
    const c4 = await doc(DB1, `customers/${sl}`), u4 = await doc(DB2, `users/${uid}`);
    check('4c. Ruta Alajuela en SP1 y SmartWeb; revisión confirmada en SP1', c4?.ruta === 'Alajuela' && u4?.ruta === 'Alajuela' && !!c4?.routeReview?.sp1ConfirmedAt, JSON.stringify({ sp1: c4?.ruta, sp2: u4?.ruta }));
    const mf = await doc(DB1, `match_feedback/QAMF${t}`), open = await doc(DB1, `packages/QAOPEN${t}`), done = await doc(DB1, `packages/QADONE${t}`);
    check('4d. Aprendizaje de Nova al día; paquete en proceso movido; el entregado intacto', mf?.ruta === 'Alajuela' && open?.ruta === 'Alajuela' && open?.rutaMovedFrom === 'Encomiendas' && done?.ruta === 'Encomiendas',
      JSON.stringify({ learn: mf?.ruta, open: open?.ruta, done: done?.ruta }));
    check('4e. Verificación de integridad en verde', /aplicada y verificada en todos lados/.test(await p1.getByTestId('route-review-done').innerText().catch(() => '')), integ.replace(/\n/g, ' | '));
    await p1.getByTestId('route-review-close').click().catch(() => {}); await p1.waitForTimeout(3000);
    check('4f. El badge desaparece solo (en vivo)', (await p1.getByTestId('route-review-badge').count()) === 0);
    await shot('9-sp1-sin-badge', p1);
    const events = (await q(DB1, 'route_reviews', 'slCode', sl)).map((l) => l.event);
    check('5. Todo quedó en el log (creada, decidida en SmartWeb, confirmada en SP1, paquetes, aprendizaje)', ['created', 'resolved_in_sp2', 'confirmed_in_sp1', 'packages_moved', 'learning_route_updated'].every((e) => events.includes(e)), events.join(','));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
