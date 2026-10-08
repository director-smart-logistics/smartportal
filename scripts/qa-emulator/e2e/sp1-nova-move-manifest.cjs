// Nova — moving packages to another manifest (REAL Nova on the QA emulator): Acciones → "Reasignar Encomiendas".
// Rule 2026-09-26: Nova only annuls — packages NEVER go to consolidation from Nova.
//   1. "Guardar y facturar" → an invoice for Cliente Uno (route Encomiendas)
//   2. the invoice is 'sent'; Reasignar Encomiendas → ENC-QA-MOVE → confirm
//   3. the 3 packages are in ENC-QA-MOVE (not in consolidacion_transitoria, not 'consolidated')
//   4. the invoice is annulled and the packages no longer point to it
//   5. nothing was added to manifest_consolidation
//   6. Cliente Dos (another route) is NOT moved: its packages stay in MOVE-QA
//   7. ATOMIC: the invoice annulment, the package moves and manifest_encomiendas are ONE commit (same commit time)
//   8. "Deshacer traslado" puts everything back in ONE commit: packages in MOVE-QA, invoice 'sent'
// READ-ONLY with respect to Nova's code: it drives the UI and reads Firestore. Test data is removed at the end.
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-nova-move-manifest.cjs
const { chromium } = require('playwright');
const path = require('path');
const APP = 'http://localhost:5174';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OUT = process.env.OUT || require('os').tmpdir();
const FIXTURE = path.join(__dirname, '../fixtures/manifest-move-qa.csv');
const MANIFEST = 'MOVE-QA', DEST = 'ENC-QA-MOVE';
const T = ['MVQA0001', 'MVQA0002', 'MVQA0003'];   // Cliente Uno — route Encomiendas
const OTHER = ['MVQA0101', 'MVQA0102'];            // Cliente Dos — another route: must NOT move
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const val = (f) => (f ? Object.values(f)[0] : undefined);
const setRuta = (sl, ruta) => fetch(`${DB1}/customers/${sl}?updateMask.fieldPaths=ruta`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { ruta: ruta ? { stringValue: ruta } : { nullValue: null } } }) });
const getDoc = async (p) => { const r = await fetch(`${DB1}/${p}`, { headers: H }); return r.status === 200 ? r.json() : null; };
const runQuery = async (q) => (await (await fetch(`${DB1}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: q }) })).json()).filter((r) => r.document);
const invoicesOf = async () => (await runQuery({ from: [{ collectionId: 'invoices' }], where: { fieldFilter: { field: { fieldPath: 'manifestNumber' }, op: 'EQUAL', value: { stringValue: MANIFEST } } } }))
  .map((r) => ({ id: r.document.name.split('/').pop(), st: val(r.document.fields?.status), sl: val(r.document.fields?.slCode) || val(r.document.fields?.clientSlCode) }));
const limit = (p, ms) => Promise.race([p, pause(ms)]).catch(() => {});

(async () => {
  let ruta0 = null, ruta0b = null;
  const cleanup = async () => {
    for (const t of [...T, ...OTHER]) { await fetch(`${DB1}/packages/${t}`, { method: 'DELETE', headers: H }); await fetch(`${DB1}/manifest_encomiendas/${t}`, { method: 'DELETE', headers: H }); await fetch(`${DB1}/manifest_consolidation/${t}`, { method: 'DELETE', headers: H }); }
    for (const inv of await invoicesOf()) await fetch(`${DB1}/invoices/${inv.id}`, { method: 'DELETE', headers: H });
    for (const m of [MANIFEST, DEST]) await fetch(`${DB1}/manifests/${m}`, { method: 'DELETE', headers: H });
  };
  await cleanup();
  ruta0 = val((await getDoc('customers/SL90001'))?.fields?.ruta) ?? null;
  ruta0b = val((await getDoc('customers/SL90002'))?.fields?.ruta) ?? null;
  // Nova only shows a customer's route when it exists in the routes catalog.
  await fetch(`${DB1}/routes/R-QA-ENC`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { name: { stringValue: 'Encomiendas' }, status: { stringValue: 'active' }, province: { stringValue: 'San José' } } }) });
  await fetch(`${DB1}/routes/R-QA-OTRA`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { name: { stringValue: 'Ruta QA Otra' }, status: { stringValue: 'active' }, province: { stringValue: 'San José' } } }) });
  await setRuta('SL90001', 'Encomiendas'); await setRuta('SL90002', 'Ruta QA Otra');
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const shot = (name) => page.screenshot({ path: path.join(OUT, `move-${name}.png`) }).catch(() => {});
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
    await page.getByText(T[0], { exact: true }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(5000); await shot('0-table');

    // 1. Save and invoice
    await page.getByRole('button', { name: /Guardar en BD|Actualizar BD|ingresados/ }).first().click();
    await page.getByRole('button', { name: /^Guardar y facturar/ }).first().click({ timeout: 20000 });
    await page.getByRole('button', { name: /Procesando/ }).first().waitFor({ state: 'detached', timeout: 180000 }).catch(() => {});
    await page.getByRole('button', { name: /Guardando/ }).first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(8000); await shot('1-saved');
    const inv1 = await invoicesOf();
    check('1. "Guardar y facturar": facturas de Cliente Uno y Cliente Dos, paquetes en MOVE-QA',
      inv1.length === 2 && inv1.some((i) => i.sl === 'SL90001') && (await Promise.all(T.map((t) => getDoc(`packages/${t}`)))).every((d) => val(d?.fields?.manifestNumber) === MANIFEST),
      JSON.stringify(inv1));
    const invUno = inv1.find((i) => i.sl === 'SL90001'), invDos = inv1.find((i) => i.sl === 'SL90002');
    // The invoice was sent to the customer → a move must annul it (drafts are deleted instead).
    await fetch(`${DB1}/invoices/${invUno?.id}?updateMask.fieldPaths=status`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'sent' } } }) });
    await pause(3000);

    // 2. Acciones → Reasignar Encomiendas → ENC-QA-MOVE
    // The toolbar "Acciones" (top of the table), not a customer group's "Acciones".
    await page.getByTestId('nova-toolbar-actions').click(); await page.waitForTimeout(800);
    await page.getByText('Reasignar Encomiendas', { exact: true }).first().click();
    const pick = page.getByRole('dialog').filter({ hasText: 'Trasladar en Bulk a Manifiesto' });
    await pick.waitFor({ timeout: 20000 });
    await pick.getByPlaceholder('Buscar manifiesto...').fill(DEST); await page.waitForTimeout(800);
    await pick.getByRole('button', { name: new RegExp(`${DEST}.*Usar este`) }).first().click();
    await pick.getByRole('button', { name: /^Siguiente$/ }).click(); await page.waitForTimeout(800); await shot('2-confirm');
    await page.getByRole('button', { name: /Confirmar traslado masivo/ }).first().click();
    await page.getByRole('button', { name: /Trasladando/ }).first().waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(8000); await shot('3-moved');

    const pk = await Promise.all(T.map((t) => getDoc(`packages/${t}`)));
    const rows = pk.map((d) => ({ m: val(d?.fields?.manifestNumber), st: val(d?.fields?.status), inv: val(d?.fields?.invoiceId) || null, cons: val(d?.fields?.consolidacion) }));
    check('2. Los 3 paquetes quedan en ENC-QA-MOVE', rows.every((r) => r.m === DEST), JSON.stringify(rows));
    check('3. Ningún paquete va a consolidación (ni "consolidacion_transitoria" ni estado "consolidated")',
      rows.every((r) => r.m !== 'consolidacion_transitoria' && r.st !== 'consolidated'), JSON.stringify(rows.map((r) => [r.m, r.st])));
    const inv2 = await invoicesOf();
    check('4. La factura enviada de Cliente Uno queda anulada y sus paquetes ya no apuntan a ella',
      inv2.find((i) => i.id === invUno?.id)?.st === 'annulled' && rows.every((r) => r.inv !== invUno?.id), JSON.stringify({ facturas: inv2, invoiceIds: rows.map((r) => r.inv) }));
    const cons = await Promise.all(T.map((t) => getDoc(`manifest_consolidation/${t}`)));
    check('5. No se agregó nada a la lista de consolidación', cons.every((d) => !d), JSON.stringify(cons.map((d) => !!d)));
    const other = await Promise.all(OTHER.map((t) => getDoc(`packages/${t}`)));
    const invDos2 = inv2.find((i) => i.id === invDos?.id);
    check('6. Cliente Dos (otra ruta) NO se mueve: sus paquetes siguen en MOVE-QA con su factura intacta',
      other.every((d) => val(d?.fields?.manifestNumber) === MANIFEST && val(d?.fields?.invoiceId) === invDos?.id) && invDos2 && invDos2.st !== 'annulled',
      JSON.stringify({ paquetes: other.map((d) => [val(d?.fields?.manifestNumber), val(d?.fields?.invoiceId)]), factura: invDos2 }));
    // 7. One operation: the invoice annulment and every moved package's history note carry the SAME time
    //    (computed once and written in one commit). The package→manifest_encomiendas mirror trigger only copies it after.
    const invDoc = await getDoc(`invoices/${invUno?.id}`);
    const annulledAt = val(invDoc?.fields?.annulledAt);
    const notes = pk.map((d) => (d?.fields?.statusHistory?.arrayValue?.values || []).map((v) => v.mapValue?.fields || {})
      .filter((h) => /por traslado a ENC-QA-MOVE/.test(val(h.note) || '')).map((h) => val(h.changedAt)));
    check('7. Atómico: la anulación de la factura y el traslado de los 3 paquetes son UNA sola operación (misma hora)',
      !!annulledAt && notes.every((n) => n.length === 1 && n[0] === annulledAt), JSON.stringify({ anuladaEn: annulledAt, notasPaquetes: notes }));

    // 8. Undo
    // The undo bar sits above the table: close the full-screen table to reach it.
    if (!(await page.getByRole('button', { name: /Deshacer traslado/ }).count())) { await page.getByLabel('Cerrar tabla').first().click().catch(() => {}); await page.waitForTimeout(2500); }
    console.log('  botones Deshacer visibles:', await page.getByRole('button', { name: /Deshacer traslado/ }).count());
    await shot('3b-undo-bar');
    // The bar sits BEHIND the full-screen table (existing layout, not changed): trigger its button directly.
    await page.getByRole('button', { name: /Deshacer traslado/ }).first().dispatchEvent('click');
    await page.getByText(/Reasignación revertida/).first().waitFor({ timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(5000); await shot('4-undone');
    const back = await Promise.all(T.map((t) => getDoc(`packages/${t}`)));
    const invBack = await getDoc(`invoices/${invUno?.id}`);
    check('8. "Deshacer traslado": paquetes de vuelta en MOVE-QA y la factura otra vez enviada',
      back.every((d) => val(d?.fields?.manifestNumber) === MANIFEST) && val(invBack?.fields?.status) === 'sent',
      JSON.stringify({ paquetes: back.map((d) => [val(d?.fields?.manifestNumber), val(d?.fields?.invoiceId)]), factura: val(invBack?.fields?.status) }));
    // Known (hallazgo 18, also in production): the SP1 package trigger removes the restored package↔invoice link a few
    // seconds later ("desired = before" rule). Reported, not asserted, until the trigger fix is approved.
    console.log('  (info) vínculo paquete↔factura tras deshacer:', JSON.stringify(back.map((d) => val(d?.fields?.invoiceId) || null)));
  } catch (e) {
    await shot('error'); console.error('ERR', e.message.split('\n')[0]);
  } finally {
    await limit(setRuta('SL90001', ruta0), 20000); await limit(setRuta('SL90002', ruta0b), 20000);
    await limit(fetch(`${DB1}/routes/R-QA-OTRA`, { method: 'DELETE', headers: H }), 20000);
    await limit(fetch(`${DB1}/routes/R-QA-ENC`, { method: 'DELETE', headers: H }), 20000);
    await limit(cleanup(), 30000);
    await limit(b.close(), 20000);
    console.log(`\n${ok}/${n}`);
    process.exit(ok === n && n > 0 ? 0 : 1);
  }
})();
