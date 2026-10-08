// SP1 Gestión de Rutas → "Descargar GTI" (2026-09-28) — the real file, from the real screen, on the QA emulator.
// Reference = the file the customer uploads successfully to GTI (58 columns, sheet "Facturas").
//   1. the downloaded Excel has the reference headers (58, same order) and one row per PAID invoice of the route
//   2. every row: the reference constants + name + Flete / Logística computed from the invoice's own colones
//   3. (2026-10-05) a factura-electrónica customer IS in the file: Tipo de documento 1 + receptor (Tipo de cedula,
//      Cedula, Correo, Telefono), every other cell = the tiquete row; an unpaid invoice is not in the file
//   4. the invoices written to the file (FE included) are marked as downloaded (gtiDownloadCount)
//   5. the GTI Manifiestos record keeps the rows with their invoice id; downloading again replaces, never duplicates
//   7. (2026-10-05, SL1954 on SL-MEGA-MAN-29-09-2026) a customer with a DELETED invoice that lists the same tracking
//      as its live paid invoice is still in the file (only live invoices count; the deleted one never replaces it)
// Run: NODE_PATH=<playwright dir>/node_modules OUT=<dir> node scripts/qa-emulator/e2e/sp1-gti-download.cjs
const { chromium } = require('playwright');
const path = require('path');
const XLSX = require(path.join(__dirname, '../../../node_modules/xlsx'));
const APP = 'http://localhost:5174';
const OUT = process.env.OUT || require('os').tmpdir();
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const enc = (x) => typeof x === 'number' ? { doubleValue: x } : typeof x === 'boolean' ? { booleanValue: x } : Array.isArray(x) ? { arrayValue: { values: x.map(enc) } } : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, enc(v)])) } } : { stringValue: String(x) };
const put = (p, o) => fetch(`${DB1}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) }) });
const get = async (p) => { const r = await fetch(`${DB1}/${p}`, { headers: H }); return r.status === 200 ? (await r.json()).fields : null; };
const v = (f) => f && Object.values(f)[0];

const REF_HEADERS = ['Cuenta de GTI', 'Codigo actividad economica', 'Numero Interno', 'Tipo de documento', 'Condicion de venta', 'Plazo de credito', 'Medio de pago', 'Nombre Medio de Pago', 'Moneda', 'Tipo de cambio', 'Nombre receptor', 'Tipo de cedula', 'Cedula', 'Actividad Economica Receptor', 'Provincia', 'Canton', 'Distrito', 'Barrio', 'Direccion', 'Correo', 'Copias', 'Area', 'Telefono', 'Cantidad', 'Codigo del producto', 'Codigo Cabys', 'Unidad de medida', 'Precio', 'Detalle de linea', 'Monto descuento', 'Tipo descuento', 'Nombre Otro Descuento', 'Partida arancelaria', 'Codigo del impuesto', 'Porcentaje de impuesto', 'Codigo de la tarifa', 'Monto exportacion', 'Cantidad', 'Codigo del producto', 'Codigo Cabys', 'Unidad de medida', 'Precio', 'Detalle de linea', 'Monto descuento', 'Tipo descuento', 'Nombre Otro Descuento', 'Partida arancelaria', 'Codigo del impuesto', 'Porcentaje de impuesto', 'Codigo de la tarifa', 'Monto exportacion', 'Comentarios', 'Consecutivo de referencia', 'Tipo de accion de referencia', 'Nombre otra accion referencia', 'Tipo de documento de referencia', 'Nombre documento referencia', 'Razon de la nota'];
const refRow = (name, flete, log) => ['224916', '5229.0', '', '4', '1', '', '6', '', '1', '', name, '', '', '', '', '', '', '', '', '', '', '', '', '1', '01', '6531100000000', '24', flete, 'Flete Internacional', '', '', '', '', 1, 0, 1, '', '1', '02', '6791000000000', '24', log, 'Logistica de Importación', '', '', '', '', '1', '13', '8', '', '', '', '', '', '', '', ''];

const t = String(Date.now()).slice(-5);
const MAN = `GTI-QA-${t}`, ROUTE = 'Occidente';
// [sl, name, invoice status, amountCRC, usd, FE?]
const CASES = [
  ['SLG1', `CLIENTE GTI UNO ${t}`, 'paid', 16560, 36, false],
  ['SLG2', `CLIENTE GTI DOS ${t}`, 'paid', 7521, 16.35, false],
  ['SLG3', `CLIENTE GTI FE ${t}`, 'paid', 11040, 24, true],
  ['SLG4', `CLIENTE GTI SIN PAGAR ${t}`, 'sent', 5520, 12, false],
  ['SLG5', `CLIENTE GTI CON ELIMINADA ${t}`, 'paid', 9200, 20, false],
];

(async () => {
  await put(`routes/R-OCC-GTI`, { name: ROUTE, status: 'active', province: 'Alajuela' });
  await put(`manifests/${MAN}`, { manifestNumber: MAN, processedAt: new Date().toISOString(), status: 'processed', totalPackages: CASES.length });
  for (const [sl, name, st, crc, usd, fe] of CASES) {
    const tr = `GTIQA${t}${sl}`, invId = `INV-${MAN}-${sl}`;
    await put(`customers/${sl}${t}`, { slCode: `${sl}${t}`, fullName: name, email: `${sl.toLowerCase()}@prueba.local`, phone: '88880000', dni: fe ? '3101123456' : '112340000', electronicInvoiceRequired: fe, ruta: ROUTE });
    await put(`invoices/${invId}`, { invoiceNumber: `${sl}${t}-20260928101010000`, clientSlCode: `${sl}${t}`, slCode: `${sl}${t}`, clientName: name, status: st, manifestNumber: MAN, totalAmount: usd, amountCRC: crc, exchangeRate: 460, trackingNumbers: [tr], invoiceItems: [{ trackingNumber: tr, description: 'QA', price: usd }], createdAt: new Date().toISOString() });
    await put(`packages/${tr}`, { tracking: tr, trackingNumber: tr, slCode: `${sl}${t}`, customerName: name, manifestNumber: MAN, ruta: ROUTE, status: st === 'paid' ? 'on_route' : 'processed', invoiceId: invId, invoiceNumber: `${sl}${t}-20260928101010000`, weight: 1, createdAt: new Date().toISOString() });
  }
  // SLG5: a DELETED copy of its invoice with the same tracking; its id sorts after the live one, so the old code let
  // it win the tracking → invoice lookup and the customer dropped out of the file.
  { const sl = 'SLG5', tr = `GTIQA${t}${sl}`;
    await put(`invoices/INV-${MAN}-${sl}-Z-DELETED`, { invoiceNumber: `${sl}${t}-20260928090000000-C`, clientSlCode: `${sl}${t}`, slCode: `${sl}${t}`, clientName: CASES[4][1], status: 'deleted', manifestNumber: MAN, manifestNumbers: [MAN], totalAmount: 20, amountCRC: 9200, exchangeRate: 460, trackingNumbers: [tr], invoiceItems: [{ trackingNumber: tr, description: 'QA', price: 20 }], createdAt: new Date().toISOString() }); }
  // A GTI Manifiestos record as saved BEFORE the change (rows without invoiceId): one of these customers + another one.
  await fetch(`${DB1}/gti_manifests/${MAN}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { manifestNumber: enc(MAN), tc: enc(460), routeSuffix: enc(''), rowCount: enc(2), exportedBy: enc('legacy'), exportedByName: enc('legacy'),
    rows: enc([{ nombre: CASES[0][1], dni: '', email: '', phone: '', precioUSD: 36, descripcion: 'Flete Internacional', electronicInvoiceRequired: false, monto: 16560, flete: 13248, logistica: 2930.97 },
      { nombre: `CLIENTE OTRA RUTA ${t}`, dni: '', email: '', phone: '', precioUSD: 12, descripcion: 'Flete Internacional', electronicInvoiceRequired: false, monto: 5520, flete: 4416, logistica: 976.99 }]) } }) });
  await new Promise((r) => setTimeout(r, 4000));

  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(APP, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /google/i }).first().click()]);
  await popup.waitForLoadState('domcontentloaded');
  const existing = popup.getByText('admin@prueba.local');
  if (await existing.count()) await existing.first().click();
  else { await popup.getByText(/add new account/i).click(); await popup.locator('#email-input').fill('admin@prueba.local'); await popup.locator('#sign-in').click(); }
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${APP}/routes`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  await page.getByRole('combobox').filter({ hasText: /Seleccionar Manifiesto/ }).first().click(); await page.waitForTimeout(1200);
  await page.locator('[data-radix-popper-content-wrapper]').last().getByRole('button').filter({ hasText: MAN }).first().click(); await page.waitForTimeout(3000);
  await page.getByText(ROUTE, { exact: true }).first().click(); await page.waitForTimeout(3000);

  const download = async (mode) => {
    await page.getByRole('button', { name: /Descargar GTI|Descargar Manifiesto GTI/ }).first().click();
    await page.getByText(/Descargar GTI —/).first().waitFor({ timeout: 20000 });
    await page.getByText(mode === 'all' ? 'Todos los registros' : 'Solo nuevos', { exact: true }).first().click().catch(() => {});
    await page.screenshot({ path: path.join(OUT, `gti-dialog-${mode}.png`) });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: /^Descargar (Todos|Nuevos) \(XLSX\)/ }).click()]);
    const file = path.join(OUT, `gti-${mode}-${dl.suggestedFilename()}`); await dl.saveAs(file);
    await page.waitForTimeout(3000);
    return file;
  };
  const file = await download('all');
  await page.screenshot({ path: path.join(OUT, 'gti-after-download.png') });
  const toastTxt = await page.locator('[role="status"], li[data-sonner-toast], [data-radix-toast-viewport] li').allInnerTexts().catch(() => []);

  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  check('1a. Una hoja "Facturas" con las 58 columnas de la plantilla válida, en el mismo orden', wb.SheetNames.join() === 'Facturas' && JSON.stringify(rows[0]) === JSON.stringify(REF_HEADERS), `${wb.SheetNames} · ${rows[0].length} columnas`);
  const byName = Object.fromEntries(rows.slice(1).map((r) => [r[10], r]));
  check('1b. Una fila por factura PAGADA de la ruta, factura electrónica incluida (sin la no pagada)', rows.length - 1 === 4 && byName[CASES[0][1]] && byName[CASES[1][1]] && byName[CASES[2][1]] && !byName[CASES[3][1]], `filas=${rows.length - 1}`);
  check('7. Cliente con una factura ELIMINADA (mismo tracking) y su factura vigente pagada: sale en el archivo con la vigente', JSON.stringify(byName[CASES[4][1]]) === JSON.stringify(refRow(CASES[4][1], 7360, 1628.31)), JSON.stringify(byName[CASES[4][1]] ? 'en el archivo' : 'FALTA'));
  check('2. Cada fila igual a la plantilla válida, montos desde los colones de la factura', JSON.stringify(byName[CASES[0][1]]) === JSON.stringify(refRow(CASES[0][1], 13248, 2930.97)) && JSON.stringify(byName[CASES[1][1]]) === JSON.stringify(refRow(CASES[1][1], 6016.8, 1331.15)));
  // factura electrónica: tipo 1 + receptor (tipo de cédula 2 = jurídica, cédula, correo, teléfono); rest = tiquete
  const feExpected = refRow(CASES[2][1], 8832, 1953.98); feExpected[3] = '1'; feExpected[11] = '2'; feExpected[12] = '3101123456'; feExpected[19] = 'slg3@prueba.local'; feExpected[22] = '88880000';
  check('3. Factura electrónica EN el archivo: tipo 1 + tipo de cédula, cédula, correo y teléfono; lo demás igual al tiquete', JSON.stringify(byName[CASES[2][1]]) === JSON.stringify(feExpected), JSON.stringify((byName[CASES[2][1]] || []).slice(0, 23)).slice(0, 160));
  check('3b. El aviso al admin dice cuántas facturas electrónicas van y no reporta ninguna como excluida', /1 factura electrónica/.test(toastTxt.join(' ')) && !/NO incluidas|Revisar en GTI/.test(toastTxt.join(' ')), toastTxt.join(' | ').slice(0, 160));
  const cnt = async (sl) => v((await get(`invoices/INV-${MAN}-${sl}`))?.gtiDownloadCount);
  check('4. Las facturas del archivo (factura electrónica incluida) quedan marcadas como descargadas; la no pagada no', Number(await cnt('SLG1')) === 1 && Number(await cnt('SLG2')) === 1 && Number(await cnt('SLG3')) === 1 && !(await cnt('SLG4')), `${await cnt('SLG1')}/${await cnt('SLG2')}/${await cnt('SLG3')}/${await cnt('SLG4')}`);
  check('7b. Se marca la factura vigente, nunca la eliminada', Number(await cnt('SLG5')) === 1 && !(await cnt('SLG5-Z-DELETED')), `${await cnt('SLG5')}/${await cnt('SLG5-Z-DELETED')}`);
  await download('all');
  const man = await get(`gti_manifests/${MAN}`);
  const mRows = (man?.rows?.arrayValue?.values || []).map((x) => x.mapValue.fields);
  const ids = mRows.map((r) => v(r.invoiceId));
  const names = mRows.map((r) => v(r.nombre));
  check('5. GTI Manifiestos: el registro viejo (sin número de factura) no se duplica: mismo cliente reemplazado, otra ruta conservada; descargar otra vez no duplica',
    mRows.length === 5 && new Set(ids.filter(Boolean)).size === 4 && names.filter((x) => x === CASES[0][1]).length === 1 && names.includes(`CLIENTE OTRA RUTA ${t}`), `filas=${mRows.length} ${JSON.stringify(names)}`);
  // 6 — GTI Manifiestos page: its official export = the same file
  await page.goto(`${APP}/gti/manifests`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  const card = page.locator('div').filter({ hasText: MAN }).filter({ has: page.getByRole('button', { name: /Exportar/ }) }).last();
  await card.getByRole('button', { name: /Exportar/ }).first().click(); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'gti-page-export-menu.png') });
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('menuitem', { name: /Excel GTI \(plantilla oficial\)/ }).click()]);
  const f2 = path.join(OUT, `gti-page-${dl2.suggestedFilename()}`); await dl2.saveAs(f2);
  const wb2 = XLSX.readFile(f2);
  const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, defval: '' });
  // The page exports the WHOLE manifest record: this route's rows (identical to the Rutas file) + the other route's
  // historical row, also in the reference format.
  const expected = [rows[0], ...rows.slice(1), refRow(`CLIENTE OTRA RUTA ${t}`, 4416, 976.99)];
  const sortRows = (r) => JSON.stringify([r[0], ...r.slice(1).sort((a, b) => String(a[10]).localeCompare(String(b[10])))]);
  check('6. Página GTI → "Excel GTI (plantilla oficial)": mismas filas que Gestión de Rutas + la fila histórica de la otra ruta, todas en la plantilla válida', wb2.SheetNames.join() === 'Facturas' && sortRows(rows2) === sortRows(expected), `${rows2.length - 1} filas`);
  await b.close();
  console.log(`\n${ok}/${n}`);
  process.exit(ok === n ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
