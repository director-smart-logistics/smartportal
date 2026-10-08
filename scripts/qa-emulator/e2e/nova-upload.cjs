const { chromium } = require('playwright');
// Nova (SP1) in the combined QA emulator: login as admin@prueba.local, attach the scenarios manifest.
// Run with: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/nova-upload.cjs
// The browser BLOCKS every non-local request (except public fonts + the Google popup loader).
const path = require('path');
const fs = require('fs');
const OUT = process.env.E2E_OUT || require('os').tmpdir() + '/sp1-nova-shots';
fs.mkdirSync(OUT, { recursive: true });
const FIXTURE = process.env.MANIFEST || path.join(__dirname, '../fixtures/manifest-prealert-scenarios.csv');
const APP = 'http://localhost:5174';
const external = [];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol);
    const staticOk = route.request().method() === 'GET' && (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' || (u.hostname === 'apis.google.com' && (u.pathname.startsWith('/js/') || u.pathname.startsWith('/_/scs/'))));
    if (local || staticOk) return route.continue();
    external.push(`${route.request().method()} ${u.hostname}${u.pathname.slice(0, 50)}`); return route.abort();
  });
  const page = await ctx.newPage();
  const novaLog = [];
  page.on('console', (m) => { const t = m.text(); if (/\[P\]|Pre-alert override|Learned match|→ "SL/.test(t)) novaLog.push(t); });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 120)));
  // Optional CUSTOMER_ROUTES="SL90001=Ruta Uno,SL90002=": set the SP1 customers' route (empty = none).
  if (process.env.CUSTOMER_ROUTES) {
    for (const pair of process.env.CUSTOMER_ROUTES.split(',')) {
      const [sl, ruta] = pair.split('=');
      await fetch(`http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents/customers/${sl}?updateMask.fieldPaths=ruta`, {
        method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { ruta: ruta ? { stringValue: ruta } : { nullValue: null } } }),
      });
    }
    console.log(`rutas de clientes: ${process.env.CUSTOMER_ROUTES}`);
  }
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  // existing emulator account appears in the list after the first login
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#display-name-input').fill('Admin QA').catch(() => {}); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.getByRole('button', { name: /^Nova$/ }).first().click().catch(async () => { await page.getByText('Nova', { exact: true }).first().click(); });
  await page.waitForTimeout(4000);
  console.log('nova url:', page.url());
  await page.screenshot({ path: OUT + '/sp1-04-nova.png' });
  console.log('file inputs:', await page.locator('input[type=file]').count());
  await page.locator('input[type=file]').first().setInputFiles(FIXTURE);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  // Processing settings dialog (the same the admin answers): route type + exchange rate.
  const cfg = page.getByRole('dialog').filter({ hasText: 'Configurar procesamiento' });
  await cfg.waitFor({ timeout: 60000 });
  await cfg.getByText('USA Aéreo', { exact: true }).click();
  const rate = cfg.locator('input').last();
  if (!(await rate.inputValue())) await rate.fill('510');
  await page.screenshot({ path: OUT + '/nova-01-config.png' });
  await cfg.getByRole('button', { name: 'Procesar manifiesto' }).click();

  // Nova answers in the chat with a summary card → "Ver tabla" opens the table (as the admin does).
  await page.getByRole('button', { name: 'Ver tabla' }).last().click({ timeout: 240000 });
  // Wait until every manifest tracking is visible in Nova's table.
  const trackings = fs.readFileSync(FIXTURE, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const seen = await page.getByText(trackings[0][0], { exact: true }).count();
    if (seen) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(8000);   // pre-alert live listener + customer lookups settle
  await page.screenshot({ path: OUT + '/nova-02-table.png', fullPage: true });

  // Read each row: P badge (title "Pre-alerta: SLxxxx — name | ...") and the row text.
  const readTable = async () => {
  const rows = [];
  const seenTracking = new Map();   // a tracking repeated in the manifest → read each of its rows
  for (const [tracking, , desc, name] of trackings) {
    const nth = seenTracking.get(tracking) || 0;
    seenTracking.set(tracking, nth + 1);
    const row = page.locator('tr').filter({ has: page.getByText(tracking, { exact: true }) }).nth(nth);
    const exists = await row.count();
    const badge = exists ? row.locator('span[title^="Pre-alerta:"]').first() : null;
    const badgeTitle = badge && (await badge.count()) ? await badge.getAttribute('title') : null;
    const kindEl = exists ? row.locator('[data-testid^="prealert-badge"]').first() : null;
    const badgeKind = kindEl && (await kindEl.count()) ? (({ 'prealert-badge': 'P verde', 'prealert-badge-name-mismatch': 'P ámbar: nombre distinto', 'prealert-badge-ambiguous': 'P ámbar: varias cuentas',
      'prealert-badge-several': (await kindEl.getAttribute('data-reason')) === 'repeated' ? 'P roja: repetido' : 'P roja: varias cuentas' })[await kindEl.getAttribute('data-testid')]) : '';
    const text = exists ? (await row.innerText()).replace(/\s+/g, ' ').trim() : '(fila no encontrada)';
    const sl = (text.match(/\bSL\d{2,7}\b/g) || []);
    rows.push({ case: desc.split(' ')[0], tracking, manifestName: name, badge: badgeKind, P: badgeTitle ? badgeTitle.replace(/\s*\|.*$/, '') : null, slInRow: [...new Set(sl)], row: text.slice(0, 220) });
  }
  return rows;
  };
  const rows = await readTable();
  await page.screenshot({ path: OUT + '/nova-02b-after-read.png', fullPage: true });
  fs.writeFileSync(OUT + '/nova-table.json', JSON.stringify(rows, null, 2));

  // Optional LATE_PREALERT="TRACKING:SLCODE:USERID": a customer pre-alerts WHILE the admin reviews
  // the table (written straight to the SP2 emulator, as SP2's form would leave it).
  const FS = 'http://localhost:8080/v1/projects/demo-sp-qa/databases';
  const latePreAlert = async (spec, label) => {
    const [t, sl, uid] = spec.split(':');
    const f = (v) => ({ stringValue: v });
    const r = await fetch(`${FS}/(default)/documents/pre_alerts/${t}_${sl}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { tracking: f(t), trackingNumber: f(t), canonicalTracking: f(t), slCode: f(sl), userId: f(uid),
        status: f('pending'), active: { booleanValue: true }, createdAt: { timestampValue: new Date().toISOString() } } }),
    });
    console.log(`${label} ${t} → ${sl}: HTTP ${r.status}`);
    await page.waitForTimeout(6000);   // live listener (if any)
    const lateRow = page.locator('tr').filter({ has: page.getByText(t, { exact: true }) }).first();
    const lateBadge = lateRow.locator('span[title^="Pre-alerta"]').first();
    const lateTitle = (await lateBadge.count()) ? await lateBadge.getAttribute('title') : null;
    console.log(`tras ${label}: ${t} P=${lateTitle || '—'} | fila: ${(await lateRow.innerText()).replace(/\s+/g, ' ').slice(0, 90)}`);
  };
  if (process.env.LATE_PREALERT) await latePreAlert(process.env.LATE_PREALERT, 'pre-alerta tardía');

  // Optional CANCEL_PREALERT="DOC_ID:TRACKING": the customer cancels a pre-alert WHILE the admin
  // reviews (F1.3/E2): the P must disappear, a notice must say so, the row's customer must NOT change.
  if (process.env.CANCEL_PREALERT) {
    const [docId, t] = process.env.CANCEL_PREALERT.split(':');
    const row = page.locator('tr').filter({ has: page.getByText(t, { exact: true }) }).first();
    const before = (await row.innerText()).replace(/\s+/g, ' ').slice(0, 90);
    const r = await fetch(`${FS}/(default)/documents/pre_alerts/${docId}?updateMask.fieldPaths=active`, {
      method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { active: { booleanValue: false } } }),
    });
    const notice = await page.getByText('Pre-alerta ya no vigente').first().innerText({ timeout: 15000 }).catch(() => '(sin aviso)');
    await page.waitForTimeout(3000);
    const badge = row.locator('[data-testid^="prealert-badge"]').first();
    const after = (await row.innerText()).replace(/\s+/g, ' ').slice(0, 90);
    console.log(`cancelada ${docId}: HTTP ${r.status} | aviso: ${notice} | P: ${(await badge.count()) ? await badge.getAttribute('data-testid') : '—'}`);
    console.log(`   fila antes:   ${before}`);
    console.log(`   fila después: ${after}`);
  }

  // Optional (VERIFY=1): what the admin does next — Acciones → "Corregir por Pre-Alertas".
  if (process.env.VERIFY) {
    await page.getByTestId('nova-toolbar-actions').click();
    await page.getByText('Corregir por Pre-Alertas', { exact: false }).first().click();
    const toast = await page.getByText(/Se han corregido \d+ asociaciones|No se encontraron discrepancias|No se corrigió ninguna fila/).first()
      .innerText({ timeout: 60000 }).catch(() => '(sin aviso)');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: OUT + '/nova-03-verify.png', fullPage: true });
    const after = [];
    for (const [tracking, , desc] of trackings) {
      const row = page.locator('tr').filter({ has: page.getByText(tracking, { exact: true }) }).first();
      const badge = row.locator('span[title^="Pre-alerta:"]').first();
      const title = (await badge.count()) ? await badge.getAttribute('title') : null;
      after.push({ case: desc.split(' ')[0], tracking, P: title ? title.replace(/\s*\|.*$/, '') : null });
    }
    fs.writeFileSync(OUT + '/nova-verify.json', JSON.stringify({ toast, rows: after }, null, 2));
    console.log('--- Corregir por Pre-Alertas ---');
    console.log('aviso:', toast.replace(/\s+/g, ' '));
    for (const r of after) console.log(`${r.case.padEnd(4)} ${r.tracking.padEnd(36)} P=${r.P || '—'}`);
  }

  // Optional (SAVE=1): "Guardar en BD" → "Solo guardar datos en BD" (packages, no emails).
  // Nova runs its silent auto-learning right after saving.
  if (process.env.SAVE) {
    await page.getByRole('button', { name: /Guardar en BD|Actualizar BD/ }).first().click();
    await page.getByRole('button', { name: /Solo guardar datos en BD/ }).first().click({ timeout: 20000 });
    await page.getByRole('button', { name: /Guardando/ }).first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(8000);   // silent learning is fire-and-forget after the save
    await page.screenshot({ path: OUT + '/nova-04-saved.png', fullPage: true });
    console.log('--- guardado ---');
    // Optional READ_PKG="T1,T2": what was SAVED for these packages (SP1 portal/packages).
    for (const t of (process.env.READ_PKG || '').split(',').filter(Boolean)) {
      const j = await (await fetch(`${FS}/portal/documents/packages/${t}`, { headers: { Authorization: 'Bearer owner' } })).json();
      const f = j.fields || {};
      const v = (k) => (f[k] ? Object.values(f[k])[0] : '—');
      console.log(`guardado ${t}: slCode=${v('slCode')} ruta="${v('ruta')}" preAlertId=${v('preAlertId')} preAlertSlCode=${v('preAlertSlCode')}`);
    }
    // Optional LATE_AFTER_SAVE="TRACKING:SLCODE:USERID": a customer pre-alerts AFTER the admin saved.
    // F1.5: nothing automatic after saving — the row must not change.
    if (process.env.LATE_AFTER_SAVE) await latePreAlert(process.env.LATE_AFTER_SAVE, 'pre-alerta después de guardar');
  }

  // Optional REOPEN=1: after saving, the admin re-opens the manifest FROM FIRESTORE
  // ("← Manifiestos" → "Ver manifiestos de Firestore" → "Cargar" → "Ver tabla").
  // The saved pre-alert P must still be there — without re-validating (F1.5).
  if (process.env.REOPEN) {
    await page.getByRole('button', { name: 'Volver' }).first().click();   // the red '← Manifiestos' button
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /Ver manifiestos de Firestore/ }).last().click();
    // "Cargar" of THIS manifest (the list also has manifests saved by earlier runs).
    const manifestNumber = path.basename(FIXTURE, '.csv').replace(/^manifest-/, '').toUpperCase();
    const entry = page.getByText(manifestNumber, { exact: true }).last()
      .locator('xpath=ancestor::div[.//button[normalize-space()="Cargar"]][1]');
    await entry.getByRole('button', { name: /^Cargar$/ }).click({ timeout: 30000 });
    console.log(`reabriendo ${manifestNumber}`);
    await page.getByRole('button', { name: 'Ver tabla' }).last().click({ timeout: 120000 }).catch(() => {});
    await page.getByText(trackings[0][0], { exact: true }).first().waitFor({ timeout: 60000 }).catch(async (e) => {
      await page.screenshot({ path: OUT + '/nova-07-reopen-failed.png', fullPage: true });
      throw e;
    });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: OUT + '/nova-07-reopened.png', fullPage: true });
    const reopened = await readTable();
    fs.writeFileSync(OUT + '/nova-table-reopened.json', JSON.stringify(reopened, null, 2));
    console.log('--- reabierto desde Firestore ---');
    for (const r of reopened) console.log(`${r.case.padEnd(4)} ${r.tracking.padEnd(36)} [${(r.badge || 'sin P').padEnd(26)}] ${(r.P || '—')}`);
  }


  // What Nova LEARNED (SP1 "portal" database): manifest name → customer mappings.
  await page.waitForTimeout(3000);
  const learned = [];
  for (const col of ['match_feedback', 'manifest_learning_patterns']) {
    const j = await (await fetch(`${FS}/portal/documents/${col}?pageSize=100`, { headers: { Authorization: 'Bearer owner' } })).json();
    for (const d of j.documents || []) {
      const x = d.fields || {};
      const name = (x.manifestName || x.normalizedName || x.rawName || x.name || {}).stringValue;
      if (!name) continue;   // aggregate stats docs (e.g. usa_air counters), not a mapping
      learned.push(`${col}: "${name}" → ${(x.slCode || {}).stringValue} (${(x.source || {}).stringValue || ''})`);
    }
  }
  console.log('--- aprendizaje de Nova ---');
  console.log(learned.length ? learned.join('\n') : '(nada aprendido)');
  fs.writeFileSync(OUT + '/nova-assignments.log', novaLog.join('\n'));
  console.log('--- asignaciones que registró el procesador de Nova ---');
  for (const l of novaLog) console.log('  ', l.slice(0, 160));
  for (const r of rows) console.log(`${r.case.padEnd(4)} ${r.tracking.padEnd(36)} [${(r.badge || 'sin P').padEnd(26)}] ${(r.P || '—')}`);
  console.log('EXTERNAL blocked:', [...new Set(external)]);
  await b.close();
})().catch(e => { console.error('ERR', e.message); console.log('EXTERNAL blocked:', [...new Set(external)]); process.exit(1); });
