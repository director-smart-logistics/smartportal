import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  GTI_HEADERS, GTI_SHEET_NAME, buildGTIRow, computeGTIAmounts, prepareGTIRows, buildGTIWorkbook, buildGTITiquetesCSV,
  buildGTICalculatedRows, isLiveInvoice, tipoCedulaOf, gtiCode,
} from '../gti-export';

/**
 * Golden test against the file the customer uploads successfully to GTI ("GTI que si sirve 28-09 -1.xlsx",
 * 2026-09-28): header row and one data row copied cell by cell (receiver name replaced — no personal data in git),
 * plus the amounts of 7 real rows. If this test fails, the file no longer matches what GTI / Hacienda accepts.
 */
const REF_HEADERS: string[] = ["Cuenta de GTI","Codigo actividad economica","Numero Interno","Tipo de documento","Condicion de venta","Plazo de credito","Medio de pago","Nombre Medio de Pago","Moneda","Tipo de cambio","Nombre receptor","Tipo de cedula","Cedula","Actividad Economica Receptor","Provincia","Canton","Distrito","Barrio","Direccion","Correo","Copias","Area","Telefono","Cantidad","Codigo del producto","Codigo Cabys","Unidad de medida","Precio","Detalle de linea","Monto descuento","Tipo descuento","Nombre Otro Descuento","Partida arancelaria","Codigo del impuesto","Porcentaje de impuesto","Codigo de la tarifa","Monto exportacion","Cantidad","Codigo del producto","Codigo Cabys","Unidad de medida","Precio","Detalle de linea","Monto descuento","Tipo descuento","Nombre Otro Descuento","Partida arancelaria","Codigo del impuesto","Porcentaje de impuesto","Codigo de la tarifa","Monto exportacion","Comentarios","Consecutivo de referencia","Tipo de accion de referencia","Nombre otra accion referencia","Tipo de documento de referencia","Nombre documento referencia","Razon de la nota"];
const REF_ROW: (string | number)[] = ["224916","5229.0","","4","1","","6","","1","","CLIENTE DE PRUEBA","","","","","","","","","","","","","1","01","6531100000000","24",6016.8,"Flete Internacional","","","","",1,0,1,"","1","02","6791000000000","24",1331.15,"Logistica de Importación","","","","","1","13","8","","","","","","","",""];
/** [monto, flete, logistica] of real reference rows. */
const REF_AMOUNTS: [number, number, number][] = [[16560,13248,2930.97],[7521,6016.8,1331.15],[66240,52992,11723.89],[5681,4544.8,1005.48],[5520,4416,976.99],[11040,8832,1953.98],[25760,20608,4559.29]];

describe('GTI export — exact reference template (58 columns)', () => {
  it('headers: same 58 columns, same order', () => {
    expect(REF_HEADERS.length).toBe(58);
    expect([...GTI_HEADERS]).toEqual(REF_HEADERS);
  });

  it('a row: every cell equal to the reference (value AND type), name and prices apart', () => {
    const row = buildGTIRow('Cliente de prueba', REF_ROW[27] as number, REF_ROW[41] as number);
    expect(row.length).toBe(58);
    row.forEach((cell, i) => {
      expect({ col: i + 1, header: REF_HEADERS[i], cell }).toEqual({ col: i + 1, header: REF_HEADERS[i], cell: REF_ROW[i] });
    });
  });

  it('amounts: FLETE = TRUNC(MONTO×0.8), LOGÍSTICA = TRUNC((MONTO−FLETE)/1.13) — 7 real rows', () => {
    for (const [monto, flete, logistica] of REF_AMOUNTS) {
      expect(computeGTIAmounts(monto)).toEqual({ monto, flete, logistica });
    }
  });

  it('the invoice colones are THE amount (no CRC→USD→CRC round trip)', () => {
    const res = prepareGTIRows([{ nombre: 'a', dni: '', email: '', phone: '', precioUSD: 36.0017, montoCRC: 16560 }], { tc: 999 });
    expect(res.included[0]).toMatchObject({ monto: 16560, flete: 13248, logistica: 2930.97 });
  });

  it('without colones: USD × TC', () => {
    const res = prepareGTIRows([{ nombre: 'a', dni: '', email: '', phone: '', precioUSD: 36 }], { tc: 460 });
    expect(res.included[0]).toMatchObject({ monto: 16560, flete: 13248, logistica: 2930.97 });
  });

  it('factura electrónica rows ARE written (2026-10-05) with the receptor data GTI needs; tiquetes unchanged', () => {
    const res = prepareGTIRows([
      { nombre: 'tiquete', dni: '112340000', email: 't@y.com', phone: '88880000', precioUSD: 0, montoCRC: 1000 },
      { nombre: 'fe', dni: '3-101-123456', email: 'x@empresa.cr', phone: '+506 8888-7777', precioUSD: 0, montoCRC: 1000, electronicInvoiceRequired: true },
      { nombre: 'fe2', dni: '206660063', email: '', phone: '', precioUSD: 0, montoCRC: 1000, tipoDocumento: '01' },
    ], { tc: 500 });
    expect(res.included.map((r) => r.nombre)).toEqual(['TIQUETE', 'FE', 'FE2']);
    expect(res.excludedFE).toEqual([]);
    expect(res.feIncomplete.map((x) => [x.row.nombre, x.missing])).toEqual([['fe2', ['correo']]]);
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(buildGTIWorkbook(res.included).Sheets[GTI_SHEET_NAME], { header: 1, defval: '' });
    const pick = (r: (string | number)[]) => ['Tipo de documento', 'Tipo de cedula', 'Cedula', 'Correo', 'Telefono'].map((h) => r[REF_HEADERS.indexOf(h)]);
    expect(pick(rows[1])).toEqual(['4', '', '', '', '']);                                   // tiquete = reference
    expect(pick(rows[2])).toEqual(['1', '2', '3101123456', 'x@empresa.cr', '+506 8888-7777']);  // jurídica
    expect(pick(rows[3])).toEqual(['1', '1', '206660063', '', '']);                        // física, sin correo (reportada)
  });

  it('a factura-electrónica row differs from the reference ONLY in the receptor columns', () => {
    const fe = buildGTIRow('Cliente de prueba', REF_ROW[27] as number, REF_ROW[41] as number, { tipoCedula: '1', cedula: '206660063', correo: 'a@b.cr', telefono: '88881111' });
    const diff = fe.map((c, i) => (c === REF_ROW[i] ? null : REF_HEADERS[i])).filter(Boolean);
    expect(diff).toEqual(['Tipo de documento', 'Tipo de cedula', 'Cedula', 'Correo', 'Telefono']);
    expect(fe).toHaveLength(58);
  });

  it('tipo de cédula from the number (Hacienda): física 9 · jurídica 10 con 3 · DIMEX 11-12 · NITE 10', () => {
    expect(['206660063', '3101123456', '155812345678', '15581234567', '4000123456', '12345', ''].map(tipoCedulaOf)).toEqual(['1', '2', '3', '3', '4', '', '']);
  });

  it('condición de venta / medio de pago per row (GTI Manifiestos "01"/"06"…) without leading zero; default = reference', () => {
    expect([gtiCode('01', '1'), gtiCode('02', '1'), gtiCode('06', '6'), gtiCode('3', '6'), gtiCode('', '6'), gtiCode('xx', '6'), gtiCode('00', '1')]).toEqual(['1', '2', '6', '3', '6', '6', '1']);
    const row = buildGTIRow('a', 1, 1, undefined, { condicionVenta: '02', medioPago: '03' });
    expect([row[REF_HEADERS.indexOf('Condicion de venta')], row[REF_HEADERS.indexOf('Medio de pago')]]).toEqual(['2', '3']);
    const def = buildGTIRow('a', 1, 1);
    expect([def[REF_HEADERS.indexOf('Condicion de venta')], def[REF_HEADERS.indexOf('Medio de pago')]]).toEqual(['1', '6']);
  });

  it('rows without amount are left out and reported', () => {
    const res = prepareGTIRows([{ nombre: 'cero', dni: '', email: '', phone: '', precioUSD: 0 }], { tc: 0 });
    expect(res.included).toHaveLength(0);
    expect(res.excludedNoAmount).toHaveLength(1);
  });

  it('workbook: one sheet "Facturas", header + one row per invoice, read back equal to the reference', () => {
    const { included } = prepareGTIRows([{ nombre: 'Cliente de prueba', dni: '', email: '', phone: '', precioUSD: 0, montoCRC: 7521 }], { tc: 0 });
    const wb = buildGTIWorkbook(included);
    expect(wb.SheetNames).toEqual([GTI_SHEET_NAME]);
    const back = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(back.Sheets[GTI_SHEET_NAME], { header: 1, defval: '' }) as (string | number)[][];
    expect(rows[0]).toEqual(REF_HEADERS);
    expect(rows[1]).toEqual(REF_ROW);
  });

  it('CSV: same 58 columns, plain numbers (no thousands separators)', () => {
    const csv = buildGTITiquetesCSV([{ nombre: 'Cliente de prueba', dni: '', email: '', phone: '', precioUSD: 0, montoCRC: 66240 }], { tc: 0 });
    const [head, line] = csv.replace('﻿', '').split('\r\n');
    expect(head.split(',')).toEqual(REF_HEADERS);
    const cells = line.split(',');
    expect(cells).toHaveLength(58);
    expect(cells[27]).toBe('52992');
    expect(cells[41]).toBe('11723.89');
  });

  it('persistence rows keep the invoice id and the same amounts', () => {
    const [r] = buildGTICalculatedRows([{ nombre: 'x', dni: '', email: '', phone: '', precioUSD: 0, montoCRC: 5681, invoiceId: 'INV1' }], { tc: 0 });
    expect(r).toMatchObject({ invoiceId: 'INV1', monto: 5681, flete: 4544.8, logistica: 1005.48 });
  });
});

// 2026-10-05 — SL1954 on SL-MEGA-MAN-29-09-2026: a deleted copy of a paid invoice (same trackings) could replace the
// live one in Gestión de Rutas and drop the customer from the GTI file. Only live invoices may be picked.
describe('isLiveInvoice — only live invoices stand for a package', () => {
  it('deleted / cancelled / annulled are never live (any case, spaces)', () => {
    for (const s of ['deleted', 'cancelled', 'annulled', 'DELETED', ' Cancelled ', 'Annulled']) expect(isLiveInvoice(s)).toBe(false);
  });
  it('every other status is live (paid, sent, draft, overdue, pending, missing)', () => {
    for (const s of ['paid', 'sent', 'draft', 'overdue', 'pending', 'consolidated', '', undefined, null]) expect(isLiveInvoice(s)).toBe(true);
  });
  it('a tracking listed by a deleted copy AND the live invoice resolves to the live one, whatever the order', () => {
    const live = { id: 'TcjcM', status: 'paid', trackingNumbers: ['GFUS01'] };
    const dead = { id: '9dJG3', status: 'deleted', trackingNumbers: ['GFUS01'] };
    for (const order of [[live, dead], [dead, live]]) {
      const map = new Map<string, any>();
      for (const inv of order) if (isLiveInvoice(inv.status)) for (const t of inv.trackingNumbers) map.set(t, inv);
      expect(map.get('GFUS01')?.id).toBe('TcjcM');
    }
  });
});
