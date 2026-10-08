import * as XLSX from 'xlsx';

/**
 * gti-export.ts — the ONE GTI tiquetes generator (Gestión de Rutas + GTI Manifiestos).
 *
 * REFERENCE (2026-09-28): the file the customer uploads successfully to GTI — "GTI que si sirve 28-09 -1.xlsx":
 * one sheet "Facturas", 58 columns in the order of GTI_HEADERS, one row per invoice, two lines per row.
 * Every column except the receiver's name and the two prices is identical in all its 127 rows; the values below
 * are copied from it cell by cell (tested in __tests__/gti-export.spec.ts). The previous 52-column template put
 * everything from column H one or more places to the right — do not reintroduce it.
 *
 * ── AMOUNTS (verified on the 127 reference rows) ─────────────────────────────
 *   MONTO     = the invoice total in colones (as billed — never re-derived through USD)
 *   FLETE     = TRUNC(MONTO × 0.8, 2)          line 01 · CABYS 6531100000000 · 0 % IVA
 *   LOGÍSTICA = TRUNC((MONTO − FLETE) / 1.13, 2) line 02 · CABYS 6791000000000 · 13 % IVA added by GTI
 *   NEVER add IVA to LOGÍSTICA before writing it: GTI adds it (adding it here would double-charge).
 *
 * ── DOCUMENT TYPE ────────────────────────────────────────────────────────────
 *   Tiquete Electrónico rows = the reference, cell by cell (tipo 4, no receiver data).
 *   FACTURA ELECTRÓNICA rows (customer `electronicInvoiceRequired`; 2026-10-05, owner: they MUST be in the file so
 *   GTI issues the factura). Same row as a tiquete (lines, CABYS, amounts) plus the receiver data GTI needs to issue
 *   a factura electrónica (Hacienda: receptor = tipo + número de identificación, validated by GTI; correo = where the
 *   factura is delivered; actividad económica del receptor optional on sales):
 *     Tipo de documento  1                         (as the generator wrote before 2026-09-28, git 0e75668d → c139153d)
 *     Tipo de cedula     from the number: 9 digits → 1 física · 10 starting 3 → 2 jurídica · 11–12 → 3 DIMEX ·
 *                        other 10 → 4 NITE · anything else → empty (reported)
 *     Cedula             digits only (no dashes/spaces)
 *     Correo             the customer's e-mail
 *     Telefono           as stored (like the factura row of the 2026-05-20 file, Claudia Jiménez: "+506…")
 *   Codes without leading zero, like every other code of the reference ("4" tiquete, "1" moneda, "6" medio de pago).
 *   Condición de venta / medio de pago: the row's choice in GTI Manifiestos when there is one (as before 2026-09-28),
 *   else the reference defaults 1 / 6 — for tiquetes and facturas alike.
 *   A customer missing cédula or correo is STILL written (owner) and reported in `feIncomplete` to complete in GTI.
 *   Between 2026-09-28 and 2026-10-05 these rows were left out of the file (`excludedFE`, now always empty).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GTIRowInput {
  nombre: string;
  dni: string;
  email: string;
  phone: string;
  /** Invoice total in CRC as billed. When present it is THE amount (preferred). */
  montoCRC?: number;
  /** Invoice total in USD — only used when montoCRC is missing (× options.tc). */
  precioUSD: number;
  /** Kept for the stored manifest rows; the file always writes 'Flete Internacional'. */
  descripcion?: string;
  electronicInvoiceRequired?: boolean;
  tipoDocumento?: string;
  condicionVenta?: string;
  medioPago?: string;
  /** SP1 invoice id — used to merge downloads of the same manifest without duplicates. */
  invoiceId?: string;
  invoiceNumber?: string;
}

export interface GTIExportOptions {
  tc: number;
  manifestNumber?: string;
  routeSuffix?: string;
}

/** Pre-calculated amounts per row — used for the file and for Firestore persistence. */
export interface GTICalculatedRow extends GTIRowInput {
  monto: number;
  flete: number;
  logistica: number;
}

export interface GTIExportResult {
  /** Rows written to the file. */
  included: GTICalculatedRow[];
  /** Kept for callers; always empty since 2026-10-05 (factura electrónica rows are written — see header). */
  excludedFE: GTIRowInput[];
  /** Factura-electrónica rows written but missing receptor data (tipo de cédula / cédula / correo) — to check in GTI. */
  feIncomplete: { row: GTIRowInput; missing: string[] }[];
  /** Rows left out because their amount is 0 or missing. */
  excludedNoAmount: GTIRowInput[];
}

// ── Template (copied from the reference file) ───────────────────────────────

export const GTI_SHEET_NAME = 'Facturas';

export const GTI_HEADERS: readonly string[] = [
  'Cuenta de GTI', 'Codigo actividad economica', 'Numero Interno', 'Tipo de documento', 'Condicion de venta',
  'Plazo de credito', 'Medio de pago', 'Nombre Medio de Pago', 'Moneda', 'Tipo de cambio', 'Nombre receptor',
  'Tipo de cedula', 'Cedula', 'Actividad Economica Receptor', 'Provincia', 'Canton', 'Distrito', 'Barrio',
  'Direccion', 'Correo', 'Copias', 'Area', 'Telefono',
  // line 01
  'Cantidad', 'Codigo del producto', 'Codigo Cabys', 'Unidad de medida', 'Precio', 'Detalle de linea',
  'Monto descuento', 'Tipo descuento', 'Nombre Otro Descuento', 'Partida arancelaria', 'Codigo del impuesto',
  'Porcentaje de impuesto', 'Codigo de la tarifa', 'Monto exportacion',
  // line 02
  'Cantidad', 'Codigo del producto', 'Codigo Cabys', 'Unidad de medida', 'Precio', 'Detalle de linea',
  'Monto descuento', 'Tipo descuento', 'Nombre Otro Descuento', 'Partida arancelaria', 'Codigo del impuesto',
  'Porcentaje de impuesto', 'Codigo de la tarifa', 'Monto exportacion',
  // footer
  'Comentarios', 'Consecutivo de referencia', 'Tipo de accion de referencia', 'Nombre otra accion referencia',
  'Tipo de documento de referencia', 'Nombre documento referencia', 'Razon de la nota',
];

/** Column widths of the reference file (Excel "wch"). */
const GTI_COL_WIDTHS = [17.5, 32.36, 19.64, 22.93, 22.5, 18.79, 17.21, 27.79, 9.79, 18.07, 45.07, 17.21, 13.79, 30.36,
  10.93, 9.07, 9.36, 7.93, 11.79, 21.64, 8.36, 6.36, 10.93, 10.79, 24.07, 24.07, 21.21, 14.36, 18.21, 20.36, 20.36,
  24.36, 21.5, 23.93, 27.36, 21.36, 22.5, 15.21, 30.21, 32.93, 32.93, 38.64, 33.36, 19.21, 12, 23.79, 18.5, 26.21,
  23.07, 18.07, 18.93, 12, 12, 12, 12, 12, 15.21, 17.36];

const FLETE_RATIO = 0.8;
const LOGISTICA_IVA_RATE = 1.13;

/** The ONE amount rule (also used by the GTI Manifiestos edits). */
export function computeGTIAmounts(montoCRC: number): { monto: number; flete: number; logistica: number } {
  const monto = Math.round(Number(montoCRC || 0) * 100) / 100;
  const flete = Math.trunc(monto * FLETE_RATIO * 100) / 100;
  const logistica = Math.trunc(((monto - flete) / LOGISTICA_IVA_RATE) * 100) / 100;
  return { monto, flete, logistica };
}

/**
 * LIVE INVOICES ONLY (2026-10-05). A soft-deleted invoice (status 'deleted') keeps its trackings, so two invoices can
 * claim the same package; whichever Firestore returned last used to win. SL1954 on SL-MEGA-MAN-29-09-2026 had a
 * deleted copy and a paid one → depending on order the customer dropped out of the GTI file and the route table
 * showed the deleted copy. Every tracking → invoice lookup of Gestión de Rutas and the GTI download-count badge use
 * this rule: deleted / cancelled / annulled never stand in for the live invoice. Tested in gti-export.spec.ts and
 * scripts/qa-emulator/e2e/sp1-gti-download.cjs (check 7).
 */
const DEAD_INVOICE_STATUSES = new Set(['deleted', 'cancelled', 'annulled']);
export const isLiveInvoice = (status: unknown): boolean => !DEAD_INVOICE_STATUSES.has(String(status ?? '').trim().toLowerCase());

export const isFE = (r: GTIRowInput) => !!r.electronicInvoiceRequired || r.tipoDocumento === '01' || r.tipoDocumento === '1';

/** Receptor data of a factura-electrónica row (see header). */
export interface GTIFacturaData { tipoCedula: string; cedula: string; correo: string; telefono: string }

/** Hacienda identification type from the number (digits only); '' when it cannot be told. */
export function tipoCedulaOf(cedula: string): string {
  const d = String(cedula || '').replace(/\D/g, '');
  if (d.length === 9) return '1';
  if (d.length === 10) return d.startsWith('3') ? '2' : '4';
  if (d.length === 11 || d.length === 12) return '3';
  return '';
}

/** Receptor data for GTI from the customer as stored (cédula digits only, e-mail, phone as stored). */
export function facturaDataOf(r: Pick<GTIRowInput, 'dni' | 'email' | 'phone'>): GTIFacturaData {
  const cedula = String(r.dni || '').replace(/\D/g, '');
  // teléfono as stored — like the factura row of the 2026-05-20 file (Claudia Jiménez: "+506…")
  return { tipoCedula: tipoCedulaOf(cedula), cedula, correo: String(r.email || '').trim(), telefono: String(r.phone || '').trim() };
}

/**
 * Condición de venta / medio de pago chosen per row in GTI Manifiestos (stored as Hacienda codes "01", "06"…), as the
 * generator used them before 2026-09-28. Written without the leading zero like the reference ("1", "6"); empty or
 * invalid → the reference default. Tiquete rows with no choice stay identical to the reference.
 */
export function gtiCode(code: unknown, fallback: string): string {
  const d = String(code ?? '').trim();
  return /^\d{1,2}$/.test(d) && Number(d) > 0 ? String(Number(d)) : fallback;
}

/** The file row of a prepared invoice (tiquete, or factura electrónica with its receptor data). */
const fileRow = (r: GTICalculatedRow) => buildGTIRow(r.nombre, r.flete, r.logistica, isFE(r) ? facturaDataOf(r) : undefined,
  { condicionVenta: r.condicionVenta, medioPago: r.medioPago });

function montoOf(r: GTIRowInput, tc: number): number {
  if (Number(r.montoCRC) > 0) return Number(r.montoCRC);
  return tc > 0 ? Math.round(Number(r.precioUSD || 0) * tc * 100) / 100 : 0;
}

/**
 * One reference row: 58 cells, same values and types as the reference (name and the two prices vary).
 * With `fe` (factura electrónica): Tipo de documento 1 + Tipo de cedula, Cedula, Correo, Telefono — nothing else.
 */
export function buildGTIRow(
  nombre: string, flete: number, logistica: number, fe?: GTIFacturaData,
  venta?: { condicionVenta?: string; medioPago?: string },
): (string | number)[] {
  return [
    '224916', '5229.0', '', fe ? '1' : '4', gtiCode(venta?.condicionVenta, '1'), '', gtiCode(venta?.medioPago, '6'), '', '1', '',
    nombre.toUpperCase(),
    fe ? fe.tipoCedula : '', fe ? fe.cedula : '', '', '', '', '', '', '', fe ? fe.correo : '', '', '', fe ? fe.telefono : '',
    // line 01 — Flete Internacional, 0 % IVA
    '1', '01', '6531100000000', '24', flete, 'Flete Internacional', '', '', '', '', 1, 0, 1, '',
    // line 02 — Logística de Importación, 13 % IVA (added by GTI)
    '1', '02', '6791000000000', '24', logistica, 'Logistica de Importación', '', '', '', '', '1', '13', '8', '',
    // footer
    '', '', '', '', '', '', '',
  ];
}

/** Split and compute: what goes to the file and what is left out (and why). */
export function prepareGTIRows(rows: GTIRowInput[], options: GTIExportOptions): GTIExportResult {
  const out: GTIExportResult = { included: [], excludedFE: [], excludedNoAmount: [], feIncomplete: [] };
  for (const r of rows) {
    const monto = montoOf(r, options.tc);
    if (!(monto > 0)) { out.excludedNoAmount.push(r); continue; }
    out.included.push({ ...r, nombre: String(r.nombre || '').toUpperCase(), ...computeGTIAmounts(monto) });
    if (isFE(r)) {
      const fe = facturaDataOf(r);
      const missing = [!fe.tipoCedula && 'tipo de cédula', !fe.cedula && 'cédula', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fe.correo) && 'correo'].filter(Boolean) as string[];
      if (missing.length) out.feIncomplete.push({ row: r, missing });
    }
  }
  return out;
}

/** Amounts for persistence (all rows with an amount, FE included — the stored manifest keeps them). */
export function buildGTICalculatedRows(rows: GTIRowInput[], options: GTIExportOptions): GTICalculatedRow[] {
  return rows.map((r) => ({ ...r, nombre: String(r.nombre || '').toUpperCase(), ...computeGTIAmounts(montoOf(r, options.tc)) }));
}

export function buildGTIWorkbook(included: GTICalculatedRow[]): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet([GTI_HEADERS as string[], ...included.map(fileRow)]);
  ws['!cols'] = GTI_COL_WIDTHS.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, GTI_SHEET_NAME);
  return wb;
}

function fileName(options: GTIExportOptions, ext: string) {
  const suffix = options.routeSuffix ? `_${options.routeSuffix}` : '';
  return `GTI_${options.manifestNumber || 'manifiesto'}${suffix}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** CSV with the same 58 columns; plain numbers (no thousands separators). */
export function buildGTITiquetesCSV(rows: GTIRowInput[], options: GTIExportOptions): string {
  const { included } = prepareGTIRows(rows, options);
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [GTI_HEADERS.map(esc).join(','), ...included.map((r) => fileRow(r).map(esc).join(','))];
  return '﻿' + lines.join('\r\n');
}

/** Excel download (the reference format). Returns what was written and what was left out. */
export function downloadGTITiquetesXLSX(rows: GTIRowInput[], options: GTIExportOptions): GTIExportResult {
  const res = prepareGTIRows(rows, options);
  if (res.included.length) XLSX.writeFile(buildGTIWorkbook(res.included), fileName(options, 'xlsx'));
  return res;
}

/** CSV download, same 58 columns. Returns what was written and what was left out. */
export function downloadGTITiquetes(rows: GTIRowInput[], options: GTIExportOptions): GTIExportResult {
  const res = prepareGTIRows(rows, options);
  if (res.included.length) {
    const blob = new Blob([buildGTITiquetesCSV(rows, options)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName(options, 'csv'); a.click();
    URL.revokeObjectURL(url);
  }
  return res;
}
