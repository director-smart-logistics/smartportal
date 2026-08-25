import * as XLSX from 'xlsx';

/**
 * gti-export.ts
 *
 * Pure, standalone GTI tiquetes CSV / XLSX generator.
 * Matches PLANTILLA_UPLOAD_TIQUETES.csv exactly (52 columns).
 *
 * ── FORMULA (verified against PLANTILLA_TIQUETES CALC.xlsx) ─────────────────
 *
 *   MONTO     = precioUSD × TC              (IVA-inclusive total in CRC)
 *   FLETE     = TRUNC(MONTO × 0.8,  2)     (col G — 0 % IVA, exento)
 *   Resta     = MONTO − FLETE              (= MONTO × 0.2)
 *   LOGÍSTICA = TRUNC(Resta / 1.13, 2)     (col H — base net of 13 % IVA)
 *
 * GTI applies 13 % IVA to LOGÍSTICA internally when they import the file, so:
 *   FLETE + LOGÍSTICA × 1.13  ≈  MONTO   (difference ≤ 1 CRC due to TRUNC)
 *
 * ⚠  REGRESSION GUARD — DO NOT CHANGE WITHOUT READING THIS:
 *   - Flete uses TRUNC (not ROUND) to match the Excel template exactly.
 *   - Logística uses Resta / 1.13 (not flete / 4.52) — same result mathematically
 *     (0.8/4.52 = 0.2/1.13 because 0.8×1.13 = 4.52×0.2 = 0.904) but the
 *     template formula is the canonical reference.
 *   - NEVER add IVA to the logística amount before writing to the file.
 *     GTI handles it; adding it would double-charge the customer.
 *   - This service is intentionally decoupled from React state. Call it with
 *     fully-resolved rows (overrides, consolidation, permit rounding applied).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface GTIRowInput {
  nombre: string;
  dni: string;
  email: string;
  phone: string;
  /** Effective price in USD (post-consolidation / post-permit resolution) */
  precioUSD: number;
  /** Product description from manifest row — becomes Line 1 Detalle de linea.
   *  Falls back to 'Flete Internacional' when absent. */
  descripcion?: string;
  electronicInvoiceRequired?: boolean;
  /** Ministerio de Hacienda tax fields */
  tipoDocumento?: string; // '01' | '04'
  condicionVenta?: string; // '01' | '02'
  medioPago?: string; // '01' | '03' | '06'
}

export interface GTIExportOptions {
  tc: number;
  manifestNumber?: string;
  routeSuffix?: string;
}

/** Pre-calculated amounts per row — used for both CSV generation and Firestore persistence. */
export interface GTICalculatedRow extends GTIRowInput {
  monto:     number; // precioUSD × TC  (IVA-inclusive, what customer pays)
  flete:     number; // monto × 0.80
  logistica: number; // floor(flete / 4.52 × 100) / 100
}

// ── Constants ────────────────────────────────────────────────────────────────

const GTI_ACCOUNT   = '224916';
const ACTIVIDAD_ECO = '5229.0';
const TIPO_DOC      = '4';   // Tiquete Electrónico
const COND_VENTA    = '1';
const MEDIO_PAGO    = '6';
const MONEDA        = '1';   // CRC — colones

// Line item 1 — Flete internacional (0% IVA)
const FLETE_COD_PROD = '1';
const FLETE_CABYS    = '6531100000000';
const FLETE_UNIDAD   = '24';
const FLETE_DETALLE  = 'Flete internacional';
const FLETE_IMP_COD  = '1';
const FLETE_IMP_PCT  = '0';
const FLETE_IMP_TAR  = '1';

// Line item 2 — Logistica de Importación (13% IVA)
const LOGISTICA_COD_PROD = '2';
const LOGISTICA_CABYS    = '6791000000000';
const LOGISTICA_UNIDAD   = '24';
const LOGISTICA_DETALLE  = 'Logistica de Importaci\u00f3n';
const LOGISTICA_IMP_COD  = '1';
const LOGISTICA_IMP_PCT  = '13';
const LOGISTICA_IMP_TAR  = '8';

// MONTO = precioUSD × TC  (IVA-inclusive, what the customer pays)
// FLETE     = TRUNC(MONTO × FLETE_RATIO, 2)     — 0 % IVA line
// LOGÍSTICA = TRUNC((MONTO − FLETE) / LOGISTICA_IVA_RATE, 2)  — 13 % IVA applied by GTI
//
// Equivalence note: (MONTO−FLETE)/1.13 = FLETE/4.52  because 0.8/4.52 == 0.2/1.13
// The Resta/1.13 form is used here — it is the canonical template formula.
const FLETE_RATIO        = 0.80;
const LOGISTICA_IVA_RATE = 1.13;

// ── Helpers (public) ─────────────────────────────────────────────────────────────

/**
 * Compute the CRC amounts for every input row without building the CSV.
 * Use this to persist calculated data to Firestore before (or after) CSV export.
 */
export function buildGTICalculatedRows(
  rows: GTIRowInput[],
  options: GTIExportOptions,
): GTICalculatedRow[] {
  const { tc } = options;
  return rows.map(row => {
    // MONTO = precioUSD × TC — IVA-inclusive CRC total (what the customer pays)
    const monto     = tc > 0 ? Math.round(row.precioUSD * tc * 100) / 100 : row.precioUSD;
    // FLETE = TRUNC(MONTO × 0.8, 2)  — 0% IVA line (exento)
    const flete     = Math.trunc(monto * FLETE_RATIO * 100) / 100;
    // LOGÍSTICA = TRUNC((MONTO − FLETE) / 1.13, 2)  — net of 13% IVA; GTI adds IVA on import
    const logistica = Math.trunc((monto - flete) / LOGISTICA_IVA_RATE * 100) / 100;
    return { ...row, nombre: row.nombre.toUpperCase(), monto, flete, logistica };
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────────

// 52-column header — must match the template file exactly
const HEADERS = [
  'Cuenta de GTI', 'Codigo actividad economica', 'Numero Interno',
  'Tipo de documento', 'Condicion de venta', 'Plazo de credito',
  'Medio de pago', 'Moneda', 'Tipo de cambio', 'Nombre receptor',
  'Tipo de cedula', 'Cedula', 'Provincia', 'Canton', 'Distrito',
  'Barrio', 'Direccion', 'Correo', 'Copias', 'Area', 'Telefono',
  // Line 1
  'Cantidad', 'Codigo del producto', 'Codigo Cabys', 'Unidad de medida',
  'Precio', 'Detalle de linea', 'Monto descuento', 'Motivo de descuento',
  'Partida arancelaria', 'Codigo del impuesto', 'Porcentaje de impuesto',
  'Codigo de la tarifa', 'Monto exportacion',
  // Line 2
  'Cantidad', 'Codigo del producto', 'Codigo Cabys', 'Unidad de medida',
  'Precio', 'Detalle de linea', 'Monto descuento', 'Motivo de descuento',
  'Partida arancelaria', 'Codigo del impuesto', 'Porcentaje de impuesto',
  'Codigo de la tarifa', 'Monto exportacion',
  // Footer
  'Comentarios', 'Consecutivo de referencia', 'Tipo de accion de referencia',
  'Tipo de documento de referencia', 'Razon de la nota',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Escape a CSV field — quotes if it contains a comma, quote char, or newline. */
function esc(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Format a CRC (colones) amount with thousands-comma separator.
 * esc() will auto-quote values ≥ 1 000 because they contain a comma.
 * e.g. 4560.00 → "4,560.00"  |  672.56 → 672.56
 */
function fmtAmt(n: number): string {
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a GTI tiquetes CSV string from an array of already-resolved rows.
 *
 * The caller is responsible for resolving all overrides (name, SL code, price,
 * consolidation distribution, permit rounding) before passing rows here.
 * This function is a pure transformation — no component state dependencies.
 *
 * @returns UTF-8 CSV string with BOM (ready for Blob download).
 */
export function buildGTITiquetesCSV(
  rows: GTIRowInput[],
  options: GTIExportOptions,
): string {
  const { tc } = options;
  const lines: string[] = [HEADERS.join(',')];

  for (const row of rows) {
    // MONTO = what the customer pays (IVA-inclusive CRC amount)
    // Flete = 80% of MONTO (exento, GTI Line 1)
    // Logística = floor(Flete / 4.52, 2) — GTI calculates 13% IVA internally on this
    const monto        = tc > 0 ? Math.round(row.precioUSD * tc * 100) / 100 : row.precioUSD;
    // FLETE = TRUNC(MONTO × 0.8, 2)  |  LOGÍSTICA = TRUNC((MONTO−FLETE) / 1.13, 2)
    const fleteAmt     = Math.trunc(monto * FLETE_RATIO * 100) / 100;
    const logisticaAmt = Math.trunc((monto - fleteAmt) / LOGISTICA_IVA_RATE * 100) / 100;

    const detalle = row.descripcion?.trim() || FLETE_DETALLE;

    const isFE = !!row.electronicInvoiceRequired || row.tipoDocumento === '01' || row.tipoDocumento === '1';
    const docType = isFE ? '1' : (row.tipoDocumento || TIPO_DOC);
    const condVenta = row.condicionVenta || COND_VENTA;
    const medioPago = row.medioPago || MEDIO_PAGO;

    lines.push([
      // Cols 1-9: GTI account + document metadata
      GTI_ACCOUNT, ACTIVIDAD_ECO, '',
      docType, condVenta, '', medioPago, MONEDA, '',
      // Cols 10-21: Customer info
      esc(row.nombre.toUpperCase()),
      '', esc(isFE ? row.dni : ''),
      '', '', '', '', '',
      esc(row.email),
      '', '',
      esc(isFE ? row.phone : ''),
      // Cols 22-34: Line item 1 — Flete internacional (0% IVA)
      '1', FLETE_COD_PROD, FLETE_CABYS, FLETE_UNIDAD,
      esc(fmtAmt(fleteAmt)), esc(detalle),
      '', '', '',
      FLETE_IMP_COD, FLETE_IMP_PCT, FLETE_IMP_TAR, '',
      // Cols 35-47: Line item 2 — Logistica de Importación (13% IVA)
      '1', LOGISTICA_COD_PROD, LOGISTICA_CABYS, LOGISTICA_UNIDAD,
      esc(fmtAmt(logisticaAmt)), LOGISTICA_DETALLE,
      '', '', '',
      LOGISTICA_IMP_COD, LOGISTICA_IMP_PCT, LOGISTICA_IMP_TAR, '',
      // Cols 48-52: Footer (empty)
      '', '', '', '', '',
    ].join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Trigger a browser file download of the GTI tiquetes CSV.
 * Same as buildGTITiquetesCSV but also initiates the download.
 */
export function downloadGTITiquetes(
  rows: GTIRowInput[],
  options: GTIExportOptions,
): void {
  const csv  = buildGTITiquetesCSV(rows, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const suffix = options.routeSuffix ? `_${options.routeSuffix}` : '';
  a.download = `GTI_${options.manifestNumber || 'manifiesto'}${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a browser file download of the GTI tiquetes in XLSX format.
 * Same 52-column structure as the CSV template. Email column is left empty.
 */
export function downloadGTITiquetesXLSX(
  rows: GTIRowInput[],
  options: GTIExportOptions,
): void {
  const { tc } = options;
  const dataRows: (string | number)[][] = [];

  for (const row of rows) {
    const monto        = tc > 0 ? Math.round(row.precioUSD * tc * 100) / 100 : row.precioUSD;
    // FLETE = TRUNC(MONTO × 0.8, 2)  |  LOGÍSTICA = TRUNC((MONTO−FLETE) / 1.13, 2)
    const fleteAmt     = Math.trunc(monto * FLETE_RATIO * 100) / 100;
    const logisticaAmt = Math.trunc((monto - fleteAmt) / LOGISTICA_IVA_RATE * 100) / 100;
    const detalle      = row.descripcion?.trim() || FLETE_DETALLE;

    const isFE = !!row.electronicInvoiceRequired || row.tipoDocumento === '01' || row.tipoDocumento === '1';
    const docType = isFE ? '1' : (row.tipoDocumento || TIPO_DOC);
    const condVenta = row.condicionVenta || COND_VENTA;
    const medioPago = row.medioPago || MEDIO_PAGO;

    dataRows.push([
      GTI_ACCOUNT, ACTIVIDAD_ECO, '',
      docType, condVenta, '', medioPago, MONEDA, '',
      row.nombre.toUpperCase(),
      '', isFE ? row.dni : '',
      '', '', '', '', '',
      '',          // email — intentionally empty per GTI Excel spec
      '', '',
      isFE ? row.phone : '',
      1, FLETE_COD_PROD, FLETE_CABYS, FLETE_UNIDAD,
      fleteAmt, detalle,
      '', '', '',
      FLETE_IMP_COD, FLETE_IMP_PCT, FLETE_IMP_TAR, '',
      1, LOGISTICA_COD_PROD, LOGISTICA_CABYS, LOGISTICA_UNIDAD,
      logisticaAmt, LOGISTICA_DETALLE,
      '', '', '',
      LOGISTICA_IMP_COD, LOGISTICA_IMP_PCT, LOGISTICA_IMP_TAR, '',
      '', '', '', '', '',
    ]);
  }

  const wsData = [HEADERS, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 10 }, { wch: 14 }, { wch: 10 },
    { wch: 6  }, { wch: 6  }, { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  },
    { wch: 32 }, { wch: 6  }, { wch: 14 },
    { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 20 },
    { wch: 28 }, { wch: 6  }, { wch: 6  }, { wch: 14 },
    { wch: 6  }, { wch: 8  }, { wch: 16 }, { wch: 8  },
    { wch: 12 }, { wch: 28 }, { wch: 8  }, { wch: 8  }, { wch: 8  },
    { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  },
    { wch: 6  }, { wch: 8  }, { wch: 16 }, { wch: 8  },
    { wch: 12 }, { wch: 28 }, { wch: 8  }, { wch: 8  }, { wch: 8  },
    { wch: 8  }, { wch: 8  }, { wch: 8  }, { wch: 8  },
    { wch: 12 }, { wch: 12 }, { wch: 8  }, { wch: 8  }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GTI');

  const suffix = options.routeSuffix ? `_${options.routeSuffix}` : '';
  XLSX.writeFile(wb, `GTI_${options.manifestNumber || 'manifiesto'}${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
