import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  type ProcessingResult,
  type MultiMatchRow,
  type ManifestRow
} from './types';

// Canonical column definitions (single source of truth for both CSV and XLSX)
export const MANIFEST_COLUMNS: Array<{ header: string; key: keyof ManifestRow; numeric?: boolean }> = [
  { header: 'TRACKING',            key: 'tracking' },
  { header: 'NOMBRE',              key: 'nombre' },
  { header: 'GUIA',                key: 'guia' },
  { header: 'MANIFIESTO',          key: 'manifiesto' },
  { header: 'PESO (KG)',           key: 'peso',               numeric: true },
  { header: 'PESO REDONDEO (KG)',  key: 'pesoRedondeo',       numeric: true },
  { header: 'DIFERENCIA REDONDEO',key: 'diferenciaRedondeo', numeric: true },
  { header: 'PESO CONSOLIDACION', key: 'pesoConsolidacion',  numeric: true },
  { header: 'PRECIO SIN PERMISO', key: 'precioSinPermiso',   numeric: true },
  { header: 'PRECIO CON PERMISO', key: 'precioConPermiso',   numeric: true },
  { header: 'PRECIO FINAL',        key: 'precio',             numeric: true },
  { header: 'SLCODE',              key: 'slCode' },
  { header: 'NOMBRECLIENTE',       key: 'nombreCliente' },
  { header: 'RUTA',                key: 'ruta' },
  { header: 'CONSOLIDACION',       key: 'consolidacion' },
  { header: 'PERMISOS',            key: 'permisos' },
  { header: 'DESCRIPCION',         key: 'descripcion' },
];

export function sortRowsBySlCode(rows: ManifestRow[]): ManifestRow[] {
  const matched   = rows.filter(r => r.slCode && r.slCode !== 'N/A' && r.slCode !== '');
  const unmatched = rows.filter(r => !r.slCode || r.slCode === 'N/A' || r.slCode === '');
  matched.sort((a, b) => a.slCode.localeCompare(b.slCode));
  return [...matched, ...unmatched];
}

export function generateCSV(result: ProcessingResult): string {
  const sortedRows = sortRowsBySlCode(result.rows);
  const csvContent = [
    MANIFEST_COLUMNS.map(c => c.header).join(','),
    ...sortedRows.map(row =>
      MANIFEST_COLUMNS.map(col => {
        const value = row[col.key];
        let stringValue: string;
        if (col.numeric && typeof value === 'number') {
          stringValue = value.toFixed(3).replace(/\.?0+$/, '') || '0';
        } else {
          stringValue = String(value ?? '');
          // Only uppercase non-numeric text fields
          if (!col.numeric) stringValue = stringValue.toUpperCase();
        }
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    ),
  ].join('\n');

  return csvContent;
}

export function generateXLSX(result: ProcessingResult): Uint8Array {
  const headers = MANIFEST_COLUMNS.map(c => c.header);

  // Sort rows before export — same grouping as CSV
  const sortedRows = sortRowsBySlCode(result.rows);

  // Build a Set of unresolved slCodes for quick lookup (rows in multiMatchRows that are
  // still pending — i.e. needsReview and NOT yet confirmed by user)
  const pendingTrackings = new Set(
    (result.multiMatchRows ?? []).map(m => m.tracking).filter(Boolean)
  );

  const dataRows = sortedRows.map(row =>
    MANIFEST_COLUMNS.map(col => {
      const value = row[col.key];
      if (col.numeric && typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 'SI' : 'NO';
      return String(value ?? '');
    })
  );

  const worksheetData = [headers, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Column widths
  // Use reduce + direct column index — avoids O(n²) indexOf and large array spreads
  worksheet['!cols'] = MANIFEST_COLUMNS.map((col, colIdx) => {
    const maxLen = dataRows.reduce(
      (max, r) => Math.max(max, String(r[colIdx] ?? '').length),
      col.header.length
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });

  // Header row style — bold + colored background
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E40AF' } },
        alignment: { horizontal: 'center' },
      };
    }
  }

  // Highlight permit-related numeric columns (amber) — applied BEFORE row highlights
  // so row-level fills override per-cell fills on highlighted rows
  const permitCols = ['PESO REDONDEO (KG)', 'DIFERENCIA REDONDEO', 'PRECIO SIN PERMISO', 'PRECIO CON PERMISO', 'PRECIO FINAL'];
  const permitColIndexes = MANIFEST_COLUMNS
    .map((c, i) => permitCols.includes(c.header) ? i : -1)
    .filter(i => i >= 0);

  for (let r = 1; r <= dataRows.length; r++) {
    for (const c of permitColIndexes) {
      const cellAddr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellAddr];
      if (cell) {
        cell.s = {
          ...cell.s,
          fill: { fgColor: { rgb: 'FFF7ED' } },
          alignment: { horizontal: 'right' },
        };
      }
    }
  }

  // ── Row-level highlights ────────────────────────────────────────────────────
  // RED   (FFCDD2) : no slCode match at all — row completely unresolved
  // YELLOW (FFF9C4) : slCode present but row is still pending review (multiMatchRows)
  // Stripe matched groups lightly to aid readability
  const colCount = MANIFEST_COLUMNS.length;
  let lastSlCode = '';
  let stripeToggle = false;

  for (let r = 1; r <= sortedRows.length; r++) {
    const row = sortedRows[r - 1];
    const isUnmatched = !row.slCode || row.slCode === '' || row.slCode === 'N/A';
    const isPending   = !isUnmatched && pendingTrackings.has(row.tracking);

    let rowFill: string | null = null;
    if (isUnmatched) {
      rowFill = 'FFCDD2'; // red — no match
    } else if (isPending) {
      rowFill = 'FFF9C4'; // yellow — pending review
    } else {
      // Alternating light stripe per slCode group
      if (row.slCode !== lastSlCode) {
        lastSlCode = row.slCode;
        stripeToggle = !stripeToggle;
      }
      rowFill = stripeToggle ? 'F0F4FF' : null; // subtle blue tint / white
    }

    if (rowFill) {
      for (let c = 0; c < colCount; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        // Ensure cell exists (aoa_to_sheet may skip empty cells)
        if (!worksheet[cellAddr]) {
          worksheet[cellAddr] = { t: 's', v: '' };
        }
        const cell = worksheet[cellAddr];
        cell.s = {
          ...(cell.s ?? {}),
          fill: { fgColor: { rgb: rowFill } },
        };
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manifiesto');

  // Summary sheet
  const summaryData = [
    ['RESUMEN', ''],
    ['Manifiesto', result.manifestNumber],
    ['Tipo', result.manifestType],
    ['Total Filas', result.summary.totalRows],
    ['Filas Procesadas', result.summary.processedRows],
    ['Clientes Emparejados', result.summary.customersMatched],
    ['Total Precio Final', result.summary.totalPrice],
    ['Total Precio Sin Permiso', result.rows.reduce((s, r) => s + r.precioSinPermiso, 0)],
    ['Total Precio Con Permiso', result.rows.reduce((s, r) => s + r.precioConPermiso, 0)],
    ['Filas Con Permiso', result.rows.filter(r => r.permisos).length],
    ['Filas Con Consolidación', result.rows.filter(r => r.consolidacion).length],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
}

export function downloadCSV(result: ProcessingResult): void {
  const csvContent = generateCSV(result);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `manifiesto_${result.manifestNumber}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadXLSX(result: ProcessingResult): void {
  const data = generateXLSX(result);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `manifiesto_${result.manifestNumber}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function generateMultiMatchCSV(multiMatchRows: MultiMatchRow[], manifestNumber: string): string {
  const headers = ['FILA', 'TRACKING', 'NOMBRE_MANIFIESTO', 'SUGERENCIA_1_SLCODE', 'SUGERENCIA_1_NOMBRE', 'SUGERENCIA_1_RUTA', 'SUGERENCIA_1_CONSOLIDACION', 'SUGERENCIA_1_SCORE', 'SUGERENCIA_2_SLCODE', 'SUGERENCIA_2_NOMBRE', 'SUGERENCIA_2_RUTA', 'SUGERENCIA_2_CONSOLIDACION', 'SUGERENCIA_2_SCORE', 'SUGERENCIA_3_SLCODE', 'SUGERENCIA_3_NOMBRE', 'SUGERENCIA_3_RUTA', 'SUGERENCIA_3_CONSOLIDACION', 'SUGERENCIA_3_SCORE', 'SLCODE_ELEGIDO'];
  
  const csvContent = [
    headers.join(','),
    ...multiMatchRows.map(row => {
      const values: string[] = [
        String(row.rowIndex),
        row.tracking,
        `"${row.nombre.replace(/"/g, '""')}"`,
      ];
      
      // Add up to 3 suggestions
      for (let i = 0; i < 3; i++) {
        const candidate = row.candidates[i];
        if (candidate) {
          values.push(
            candidate.slCode,
            `"${candidate.fullName.replace(/"/g, '""')}"`,
            candidate.ruta || '',
            String(candidate.consolidation),
            String(Math.round(candidate.score * 100)) + '%'
          );
        } else {
          values.push('', '', '', '', '');
        }
      }
      
      // Empty column for user to fill in chosen slCode
      values.push('');
      
      return values.join(',');
    }),
  ].join('\n');
  
  return csvContent;
}

export function downloadMultiMatchCSV(multiMatchRows: MultiMatchRow[], manifestNumber: string): void {
  const csvContent = generateMultiMatchCSV(multiMatchRows, manifestNumber);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `manifiesto_${manifestNumber}_revisiones_pendientes.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

