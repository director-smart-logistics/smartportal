// SP2 "En Consolidación" (2026-09-28) — SP1 decides, the server keeps the customer's list (onPackageConsolidationToSp2 →
// slSyncConsolidationFromSp1 → SP2 consolidation_items). QA emulator, real apps: SP1 on 5174 (annul flow of the app),
// SP2 on 5175 (customer dashboard).
//   1. an invoice annulled with the app's own flow (invoice-service moveInvoiceToTransitoria) → the package appears in
//      the customer's list with the date of its FIRST invoice
//   2. churn inside consolidation (weight, history, manifestUpdatedAt) → nothing pushed, date unchanged
//   3. the admin moves it out of consolidation to a manifest → it leaves the list (kept as inactive, with the reason)
//   4. re-invoiced (#2) and annulled again → back in the list with the SAME original date (#1)
//   5. customer changed while in consolidation → leaves the old customer's list, enters the new one's
//   6. rules: the owner reads its item, another customer cannot, nobody writes from the client; admin reads (Vista de cliente)
//   7. SP2 dashboard: tab order Facturados · Pre-alertados · En Consolidación · Entregado; the list shows ONLY tracking +
//      "En consolidación desde el <fecha>", no buttons; empty state for a customer without items
//   8. every push logged on both sides with the SAME correlation id (SP1 event id)
//   9. the package carries its FIRST invoice (firstInvoiceNumber/Date) set once by the server; a re-invoice does not change it
//  10. idempotency: the same event twice = no-op; an OLDER event (retry / out of order) is ignored, never resurrects
//  11. reconciliation (scripts/audit/reconcile-consolidation-items.cjs) reports 0 differences
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-sp2-consolidation-tab.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.OUT || require('os').tmpdir();
const B = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
const DB1 = `${B}/portal/documents`, DB2 = `${B}/(default)/documents`;
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 90000) => { const end = Date.now() + ms; for (;;) { const x = await fn(); if (x || Date.now() > end) return x; await sleep(1000); } };
const enc = (x) => x === null ? { nullValue: null } : typeof x === 'boolean' ? { booleanValue: x } : typeof x === 'number' ? { doubleValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (base, p, data) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const patch = (base, p, data) => fetch(`${base}/${p}?${Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
const get = async (base, p, headers = H) => { const r = await fetch(`${base}/${p}`, { headers }); return { status: r.status, f: r.status === 200 ? (await r.json()).fields : null }; };
const v = (f, k) => f?.[k] ? Object.values(f[k])[0] : undefined;
const q = async (base, col, field, value) => ((await (await fetch(`${base}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }) })).json()).filter((r) => r.document).map((r) => r.document.fields));

const t = String(Date.now()).slice(-6);
const SLX = 'SL90001', UIDX = 'e2e-sl90001';               // cliente1@prueba.local (seed)
const SLY = `SL7${t}`;
const A = `CONSTABA${t}`, Bk = `CONSTABB${t}`;
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000);
const stamp = (d) => { const x = new Date(daysAgo(d).getTime() - 6 * 3600e3); const p = (v, l = 2) => String(v).padStart(l, '0');
  return `${x.getUTCFullYear()}${p(x.getUTCMonth() + 1)}${p(x.getUTCDate())}${p(x.getUTCHours())}${p(x.getUTCMinutes())}${p(x.getUTCSeconds())}000`; };
const INV1 = `${SLX}-${stamp(20)}1-C`, INV2 = `${SLX}-${stamp(6)}2-C`;
const crDay = (iso) => new Date(iso).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
const item = (sl, trk) => get(DB2, `consolidation_items/${sl}_${trk}`);

async function signUp(email) {
  const r = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json();
  return r;
}
const signIn = async (email) => (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Prueba1234!', returnSecureToken: true }) })).json()).idToken;

async function invoice(id, num, days, trk, manifest) {
  await put(DB1, `invoices/${id}`, { invoiceNumber: num, invoiceDate: daysAgo(days).toISOString(), createdAt: daysAgo(days).toISOString(), status: 'sent', isConsolidation: true,
    slCode: SLX, clientSlCode: SLX, customerId: SLX, clientName: 'Cliente Uno', manifestNumber: manifest, manifestNumbers: [manifest], trackingNumbers: trk, trackingNumber: trk[0],
    packageCount: trk.length, totalAmount: 5 * trk.length, currency: 'USD', items: trk.map((x) => ({ trackingNumber: x, tracking: x, totalPrice: 5 })) });
  for (const x of trk) await patch(DB1, `packages/${x}`, { invoiceId: id, invoiceNumber: num, invoiceStatus: 'sent', manifestNumber: manifest, manifestId: manifest, status: 'processed' });
}

/** What the Facturas panel annul (Invoices.tsx handleAnnulInvoice) writes: invoice annulled + packages to transitoria. */
async function facturasAnnul(id, num, days, trk) {
  await patch(DB1, `invoices/${id}`, { status: 'annulled' });
  const emission = daysAgo(days).toISOString(), now2 = new Date().toISOString();
  for (const x of trk) {
    const cur = (await get(DB1, `packages/${x}`)).f || {};
    const hist = (cur.statusHistory?.arrayValue?.values || []);
    const note = { mapValue: { fields: { status: { stringValue: 'consolidated' }, changedAt: { stringValue: now2 }, changedBy: { stringValue: 'admin@prueba.local' }, note: { stringValue: `Factura ${num} anulada desde panel de facturas — paquete desvinculado.` } } } };
    const fields = { manifestId: enc('consolidacion_transitoria'), manifestNumber: enc('consolidacion_transitoria'), updatedManifest: enc('consolidacion_transitoria'), manifestUpdatedAt: enc(now2),
      consolidacion: enc(true), status: enc('consolidated'), annulledInvoiceId: enc(id), annulledInvoiceNumber: enc(num), annulledInvoiceDate: enc(emission), annulledAt: enc(now2), invoicedAt: enc(emission),
      statusHistory: { arrayValue: { values: [...hist, note] } } };
    const mask = [...Object.keys(fields), 'invoiceId', 'invoiceNumber', 'invoiceStatus'].map((k) => `updateMask.fieldPaths=${k}`).join('&');
    await fetch(`${DB1}/packages/${x}?${mask}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });   // invoiceId/Number/Status absent → deleted
  }
}
const FN = 'http://127.0.0.1:5001/demo-sp-qa/us-central1/slSyncConsolidationFromSp1';
const push = async (items) => (await (await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': 'qa-local-sync-secret' }, body: JSON.stringify({ items }) })).json());

(async () => {
  // The Firestore emulator does not reload rules from the file: load SP2's CURRENT rules (as run-regression.sh does).
  const cwd = require('path').join(__dirname, '../../..');
  const rulesTxt = require('fs').readFileSync(require('path').join(cwd, '../smart-portal-2/firestore.rules'), 'utf8');
  await fetch('http://localhost:8080/emulator/v1/projects/demo-sp-qa/databases/(default):securityRules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rulesTxt }] } }) });
  // The documented procedure for existing data (emulator): first invoice → SP2 list, both with --apply.
  const envE = { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080', GCLOUD_PROJECT: 'demo-sp-qa', SP2_CONSOLIDATION_SYNC_URL: FN, SP2_SYNC_SECRET: 'qa-local-sync-secret' };
  const bf1 = require('child_process').execSync('node scripts/audit/backfill-first-invoice.cjs --apply --only-consolidation', { cwd, env: envE, encoding: 'utf8' });
  const bf2 = require('child_process').execSync('node scripts/audit/backfill-consolidation-items.cjs --apply', { cwd, env: envE, encoding: 'utf8' });
  console.log('  backfill:', (bf1.match(/Aplicado:[^\n]*/) || [''])[0], '|', (bf2.match(/en consolidación: \d+/) || [''])[0], (bf2.match(/Aplicado en SP2:[^\n]*/) || [''])[0]);

  // Customer Y (SP2 account) for the rules / reassignment checks.
  const y = await signUp(`consy-${t}@prueba.local`);
  await put(DB2, `users/${y.localId}`, { slCode: SLY, email: `consy-${t}@prueba.local`, firstName: 'Consolida', lastName: 'Y', role: 'customer' });
  for (const [trk, sl] of [[A, SLX], [Bk, SLX]]) {
    await put(DB1, `packages/${trk}`, { tracking: trk, trackingNumber: trk, slCode: sl, customerId: sl, customerName: 'Cliente Uno', status: 'customs', manifestNumber: '01-09-2026DAN', manifestId: '01-09-2026DAN',
      weight: 1, price: 5, description: 'QA consolidación', createdAt: daysAgo(30).toISOString(), statusHistory: [] });
  }
  await sleep(2000);

  // SP1 app (real annul flow)
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  const run = (fn, ...args) => page.evaluate(async ([fn, args]) => { const m = await import('/client/lib/services/invoice-service.ts'); const r = await m[fn](...args); return r === undefined ? null : JSON.parse(JSON.stringify(r)); }, [fn, args]);

  // 1 — annul #1 (20 days ago) with the app's flow
  await invoice(`CONS-INV1-${t}`, INV1, 20, [A, Bk], '01-09-2026DAN');
  await run('moveInvoiceToTransitoria', `CONS-INV1-${t}`, { annulledBy: 'e2e' });
  const i1 = await until(async () => { const r = await item(SLX, A); return v(r.f, 'active') === true && r; });
  const since1 = v(i1?.f, 'since');
  check('1. Anular la factura (flujo real de la app) → el paquete aparece en la lista del cliente con la fecha de su PRIMERA factura',
    !!i1 && crDay(since1) === crDay(daysAgo(20).toISOString()) && v(i1.f, 'sourceInvoiceNumber') === INV1 && v(i1.f, 'userId') === UIDX, `since=${since1} fac=${v(i1?.f, 'sourceInvoiceNumber')}`);

  const pA1 = (await get(DB1, `packages/${A}`)).f;
  check('9a. El paquete guarda su PRIMERA factura (firstInvoiceNumber/Date, escrita por el servidor)', v(pA1, 'firstInvoiceNumber') === INV1 && !!v(pA1, 'firstInvoiceDate') && !!v(pA1, 'firstInvoiceSetAt'),
    `${v(pA1, 'firstInvoiceNumber')} · ${v(pA1, 'firstInvoiceSource')}`);

  // 2 — churn inside consolidation
  const logsA0 = (await q(DB1, 'consolidation_sync_logs', 'tracking', A)).length;
  await patch(DB1, `packages/${A}`, { weight: 2.5, manifestUpdatedAt: new Date().toISOString(), description: 'QA consolidación (editado)' });
  await sleep(6000);
  const i2 = await item(SLX, A);
  check('2. Cambios dentro de consolidación (peso, descripción) → no se envía nada y la fecha no cambia',
    (await q(DB1, 'consolidation_sync_logs', 'tracking', A)).length === logsA0 && v(i2.f, 'since') === since1 && v(i2.f, 'active') === true);

  // 3 — moved out to a manifest (what MoveManifestDialog / BulkMoveDialog write)
  await patch(DB1, `packages/${A}`, { manifestNumber: '30-09-2026DAN', manifestId: '30-09-2026DAN', updatedManifest: '30-09-2026DAN', manifestUpdatedAt: new Date().toISOString() });
  const i3 = await until(async () => { const r = await item(SLX, A); return v(r.f, 'active') === false && r; });
  check('3. El admin lo saca de consolidación a un manifiesto → sale de la lista (queda inactivo con el motivo, no se borra)',
    !!i3 && /manifiesto/.test(v(i3.f, 'removeReason') || ''), v(i3?.f, 'removeReason'));

  // 4 — re-invoiced #2 (6 days ago) and annulled again → back with the ORIGINAL date
  await invoice(`CONS-INV2-${t}`, INV2, 6, [A], '30-09-2026DAN');
  await facturasAnnul(`CONS-INV2-${t}`, INV2, 6, [A]);   // the package was moved out before: the Facturas panel annul (writes updatedManifest)
  const i4 = await until(async () => { const r = await item(SLX, A); return v(r.f, 'active') === true && r; });
  check('4. Re-facturado (#2) y anulado otra vez → vuelve a la lista con la MISMA fecha original (#1)', !!i4 && v(i4.f, 'since') === since1 && !!v(i4.f, 'reenteredAt'), `since=${v(i4?.f, 'since')}`);

  await sleep(3000);
  check('9b. Re-facturado y anulado: la primera factura guardada NO cambia (se escribe una sola vez)', v((await get(DB1, `packages/${A}`)).f, 'firstInvoiceNumber') === INV1);

  // 10 — idempotency and ordering, straight on SP2's endpoint
  const cur4 = (await item(SLX, A)).f;
  const same = await push([{ op: 'add', slCode: SLX, tracking: A, sp1PackageId: A, since: '2020-01-01T00:00:00.000Z', reason: 'repetido', eventId: v(cur4, 'lastEventId'), eventAt: v(cur4, 'lastEventAt') }]);
  const old = await push([{ op: 'remove', slCode: SLX, tracking: A, sp1PackageId: A, reason: 'evento viejo', eventId: 'e2e-viejo', eventAt: '2020-01-01T00:00:00.000Z' }]);
  const after10 = (await item(SLX, A)).f;
  check('10. Mismo evento dos veces = sin cambio; un evento VIEJO se ignora (no lo saca ni cambia la fecha)',
    same.results?.[0]?.outcome === 'unchanged' && old.results?.[0]?.outcome === 'ignored_stale' && v(after10, 'active') === true && v(after10, 'since') === since1,
    `${same.results?.[0]?.outcome} · ${old.results?.[0]?.outcome}`);

  // 5 — customer changed while in consolidation
  await patch(DB1, `packages/${Bk}`, { slCode: SLY, customerId: SLY });
  const moved = await until(async () => { const o = await item(SLX, Bk), nw = await item(SLY, Bk); return v(o.f, 'active') === false && v(nw.f, 'active') === true && { o, nw }; });
  check('5. Cambio de cliente estando en consolidación → sale de la lista del cliente anterior y entra en la del nuevo', !!moved && v(moved.nw.f, 'userId') === y.localId);

  // 6 — rules: checked with the SP2 app's own Firestore SDK in the customer's browser session (step 7c)
  // admin "Vista de cliente": verified in the UI by scripts/qa-emulator/e2e/sp1-sp2-consolidation-shots.cjs

  // 7 — SP2 dashboard UI (customer X)
  const ctx2 = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx2.route('**/*', (route) => { const u = new URL(route.request().url()); return (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? route.continue() : route.abort(); });
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(6000);
  await p2.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await p2.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await p2.waitForTimeout(2500);
  await p2.locator('input[type=email]').first().fill('cliente1@prueba.local');
  await p2.locator('input[type=password]').first().fill('Prueba1234!');
  await p2.locator('button[type=submit]').first().click(); await p2.waitForTimeout(9000);
  await p2.getByRole('button', { name: /Entendido/ }).click().catch(() => {});
  const tabs = await p2.locator('[data-testid="status-filter-tabs"] button').allInnerTexts();
  check('7a. Tabs en orden: Facturados · Pre-alertados · En Consolidación · Entregado', JSON.stringify(tabs.map((x) => x.trim().toUpperCase())) === JSON.stringify(['FACTURADOS', 'PRE-ALERTADOS', 'EN CONSOLIDACIÓN', 'ENTREGADO']), JSON.stringify(tabs));
  await p2.locator('[data-testid="status-filter-tabs"] button', { hasText: /En Consolidaci/i }).click(); await p2.waitForTimeout(2500);
  const row = p2.locator(`[data-testid="consolidation-row-${SLX}_${A}"]:visible`);
  // the test customer may accumulate more than 10 items across runs: walk the pages (10 per page)
  for (let i = 0; i < 12 && !(await row.count()); i++) {
    const next = p2.getByText(/Página \d+ de \d+/).first().locator('xpath=following-sibling::button[1]');
    if (!(await next.count())) break;
    await next.click().catch(() => {}); await p2.waitForTimeout(1200);
  }
  await row.waitFor({ timeout: 15000 }).catch(() => {});
  const rowText = (await row.count()) ? (await row.innerText()).replace(/\s+/g, ' ') : '';
  const expectDate = new Date(since1).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' });
  check('7b. La lista muestra SOLO el tracking y "En consolidación desde el <fecha de la primera factura>", sin botones',
    rowText.includes(A) && rowText.includes(`En consolidación desde el ${expectDate}`) && (await row.locator('button:not([title*="opiar" i]):not([aria-label*="opiar" i])').count()) === 0 && !rowText.includes(Bk),
    `${rowText} · esperado ${expectDate} · botones=${await row.locator('button').count()}`);
  await p2.locator('[data-testid="active-shipments-content"]').screenshot({ path: path.join(OUT, 'consolidation-tab.png') }).catch(() => {});
  await ctx2.close();

  // 7c — empty state (customer Y after its item leaves)
  await patch(DB1, `packages/${Bk}`, { manifestNumber: '30-09-2026DAN', manifestId: '30-09-2026DAN', updatedManifest: '30-09-2026DAN' });
  await until(async () => v((await item(SLY, Bk)).f, 'active') === false);
  const ctx3 = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx3.route('**/*', (route) => { const u = new URL(route.request().url()); return (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? route.continue() : route.abort(); });
  const p3 = await ctx3.newPage();
  await p3.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }); await p3.waitForTimeout(6000);
  await p3.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await p3.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await p3.waitForTimeout(2500);
  await p3.locator('input[type=email]').first().fill(`consy-${t}@prueba.local`);
  await p3.locator('input[type=password]').first().fill('Prueba1234!');
  await p3.locator('button[type=submit]').first().click(); await p3.waitForTimeout(9000);
  await p3.getByRole('button', { name: /Entendido/ }).click().catch(() => {});
  // A new customer without address gets the "Información incompleta" modal (it can pop up more than once): close it.
  for (let i = 0; i < 4; i++) { const later = p3.getByText('Más tarde', { exact: true }); if (await later.isVisible().catch(() => false)) await later.click().catch(() => {}); await p3.waitForTimeout(1500); }
  await p3.locator('[data-testid="status-filter-tabs"]:visible button', { hasText: /En Consolidaci/i }).first().dispatchEvent('click').catch(() => {}); await p3.waitForTimeout(2500);
  // 6a — rules through the app's own SDK, as this customer (Y)
  const rules = await p3.evaluate(async ([own, other]) => {
    const { firestoreService } = await import('/src/infrastructure/firebase/firestore-service.ts');
    const tryIt = async (fn) => { try { await fn(); return 'ok'; } catch (e) { return String(e?.code || e?.message || e).includes('permission') ? 'denied' : String(e?.code || e?.message); } };
    return {
      own: await tryIt(() => firestoreService.get('consolidation_items', own)),
      other: await tryIt(() => firestoreService.get('consolidation_items', other)),
      write: await tryIt(() => firestoreService.update('consolidation_items', own, { since: '2020-01-01' })),
      logs: await tryIt(() => firestoreService.getAll('consolidation_sync_logs', {})),
    };
  }, [`${SLY}_${Bk}`, `${SLX}_${A}`]);
  check('6a. Reglas (SDK real, como cliente): lee lo suyo; NO lo de otro; no puede escribir; no ve los logs', rules.own === 'ok' && rules.other === 'denied' && rules.write === 'denied' && rules.logs === 'denied', JSON.stringify(rules));
  // empty state: a complete seeded customer without packages in consolidation (cliente2 / SL90002) — a brand-new
  // account stays on the onboarding modals + loading skeletons (existing behavior, not this feature)
  const ctx4 = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx4.route('**/*', (route) => { const u = new URL(route.request().url()); return (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol)) ? route.continue() : route.abort(); });
  const p4 = await ctx4.newPage();
  await p4.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' }); await p4.waitForTimeout(6000);
  await p4.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await p4.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await p4.waitForTimeout(2500);
  await p4.locator('input[type=email]').first().fill('cliente2@prueba.local');
  await p4.locator('input[type=password]').first().fill('Prueba1234!');
  await p4.locator('button[type=submit]').first().click(); await p4.waitForTimeout(9000);
  await p4.getByRole('button', { name: /Entendido/ }).click().catch(() => {});
  await p4.locator('[data-testid="status-filter-tabs"]:visible button', { hasText: /En Consolidaci/i }).first().click().catch(() => {}); await p4.waitForTimeout(2500);
  const emptyEl = p4.locator('[data-testid="consolidation-empty"]:visible').first();
  const empty = await emptyEl.waitFor({ timeout: 10000 }).then(() => emptyEl.innerText()).then((x) => x.includes('No tienes paquetes en consolidación.') ? 1 : 0).catch(() => 0);
  await p3.screenshot({ path: path.join(OUT, 'consolidation-empty.png') }).catch(() => {});
  await p4.screenshot({ path: path.join(OUT, 'consolidation-empty.png') }).catch(() => {});
  await ctx4.close().catch(() => {});
  check('7c. Cliente sin paquetes en consolidación → "No tienes paquetes en consolidación."', empty > 0);
  await ctx3.close();

  // 8 — logs
  const l1 = await q(DB1, 'consolidation_sync_logs', 'tracking', A), l2 = await q(DB2, 'consolidation_sync_logs', 'tracking', A);
  const ids1 = new Set(l1.map((x) => v(x, 'eventId')));
  check('8. Cada alta/baja queda en el log de SP1 y en el de SP2, con el MISMO id de evento (correlación) y motivo',
    l1.length >= 3 && l2.length >= 3 && l1.every((x) => v(x, 'reason') && v(x, 'eventId')) && l2.filter((x) => ids1.has(v(x, 'eventId'))).length >= l1.length && l2.some((x) => v(x, 'outcome') === 'reactivated') && l2.some((x) => v(x, 'outcome') === 'ignored_stale'),
    `SP1=${l1.length} SP2=${l2.length} (${l2.map((x) => v(x, 'outcome')).join(',')})`);

  // 12 — the real production flow of 2026-09-28: in consolidation → Carry-On to a manifest → Nova processing →
  //      DRAFT -C invoice. It leaves the SP2 list; its first invoice stays the ORIGINAL one (not the new draft).
  const INV3 = `${SLX}-${stamp(1)}3-C`;
  await patch(DB1, `packages/${A}`, { manifestNumber: '25-09-2026DAN', manifestId: '25-09-2026DAN', updatedManifest: '25-09-2026DAN', manifestUpdatedAt: new Date().toISOString() });   // Carry-On
  await put(DB1, `invoices/CONS-INV3-${t}`, { invoiceNumber: INV3, invoiceDate: daysAgo(1).toISOString(), createdAt: daysAgo(1).toISOString(), status: 'draft', isConsolidation: true,
    slCode: SLX, clientSlCode: SLX, customerId: SLX, clientName: 'Cliente Uno', manifestNumber: '25-09-2026DAN', manifestNumbers: ['25-09-2026DAN'], trackingNumbers: [A], trackingNumber: A, packageCount: 1, totalAmount: 5, currency: 'USD', items: [{ trackingNumber: A, tracking: A, totalPrice: 5 }] });
  await patch(DB1, `packages/${A}`, { status: 'processed', invoiceNumber: INV3, invoiceStatus: 'draft' });   // what Nova "Guardar y facturar" leaves on it
  const i12 = await until(async () => { const r = await item(SLX, A); return v(r.f, 'active') === false && r; });
  await sleep(4000);
  const pA12 = (await get(DB1, `packages/${A}`)).f;
  check('12. Consolidación → Carry-On → Nova → factura BORRADOR -C: sale de la lista de SP2 y la primera factura sigue siendo la ORIGINAL',
    !!i12 && v(pA12, 'firstInvoiceNumber') === INV1 && v(i12.f, 'since') === since1, `${v(i12?.f, 'removeReason')} · primera=${v(pA12, 'firstInvoiceNumber')}`);

  // 11 — reconciliation: 0 differences for this run's packages (other e2e reuse trackings with new dates; SP2 keeps
  //      `since` write-once, so their leftovers are not this feature's differences)
  const rec = require('child_process').execSync('node scripts/audit/reconcile-consolidation-items.cjs', { cwd: require('path').join(__dirname, '../../..'), env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080', GCLOUD_PROJECT: 'demo-sp-qa' }, encoding: 'utf8' });
  const repFile = (rec.match(/Reporte: (\S+)/) || [])[1];
  const rep = repFile ? JSON.parse(require('fs').readFileSync(require('path').join(cwd, repFile), 'utf8')) : null;
  const mine = (x) => [A, Bk].includes(x.tracking);
  const diffMine = rep ? [...rep.missing, ...rep.extra, ...rep.wrongSince].filter(mine) : null;
  check('11. Reconciliación SP1 ↔ SP2: sin diferencias en los paquetes de esta prueba', !!rep && diffMine.length === 0,
    `${rec.split('\n').find((l) => /SP1 en consolidación/.test(l)) || ''} · de esta prueba: ${diffMine ? diffMine.length : '?'}`);

  await b.close();
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
