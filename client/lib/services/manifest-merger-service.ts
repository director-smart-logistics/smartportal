/**
 * smart-mega-man — Manifest Fusion Service
 *
 * Downloads multiple MLocker manifests (by portal ID), merges their raw Excel
 * data into a single sheet, and processes the result through the standard
 * processManifestFile pipeline so Nova gets one unified ProcessedNovaData with
 * proper AI matching across all rows.
 *
 * The merged manifest name is derived from the most-recent source manifest ID
 * (DD-MM-YYYY date prefix parsed for correct chronological ordering).
 */

import * as XLSX from 'xlsx';
import { downloadManifestExcel } from './mlocker-service';
import { processManifestFile } from './manifest-processor';
import type { ProcessingResult } from './manifest-processor';

export interface FusionManifestOpts {
  /** Auth token forwarded to processManifestFile */
  token: string | null;
  /** Manifest type hint forwarded to processManifestFile */
  manifestType?: import('./manifest-processor').ManifestType;
  /** Progress callback — called with human-readable status string */
  onProgress?: (step: string) => void;
}

export interface FusionManifestResult extends ProcessingResult {
  /** IDs of source manifests that were merged */
  sourceManifestIds: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parses the DD-MM-YYYY date prefix of a MLocker manifest ID into a comparable
 * timestamp (ms).  Returns 0 when the format is not recognised.
 */
function parseManifestDate(manifestId: string): number {
  const m = manifestId.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return 0;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
}

/**
 * Returns the manifest ID with the most-recent date among the given IDs.
 * Ties are broken by lexicographic order (last wins).
 */
function mostRecentManifestId(ids: string[]): string {
  return ids.reduce((best, curr) => {
    const tb = parseManifestDate(best);
    const tc = parseManifestDate(curr);
    return tc >= tb ? curr : best;
  });
}

/**
 * Converts a base64 string into a Uint8Array (browser-safe, no Node Buffer).
 */
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Core fusion logic ──────────────────────────────────────────────────────────

/**
 * Reads the raw header row + data rows from an Excel Uint8Array.
 * Searches the first 10 rows for a row that looks like a manifest header.
 */
function extractSheetRows(bytes: Uint8Array): { headers: unknown[]; dataRows: unknown[][] } {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, all.length); i++) {
    const row = all[i] as unknown[];
    if (!row || row.length <= 3) continue;
    const lower = row.map(c => String(c ?? '').toLowerCase()).join(' ');
    if (
      lower.includes('cliente') || lower.includes('nombre') ||
      lower.includes('tracking') || lower.includes('peso') ||
      lower.includes('weight') || lower.includes('lbs') ||
      lower.includes('guia') || lower.includes('codigo')
    ) {
      headerIndex = i;
      break;
    }
  }

  const headers = all[headerIndex] as unknown[] ?? [];
  const dataRows = (all.slice(headerIndex + 1) as unknown[][]).filter(
    row => Array.isArray(row) && row.some(c => c !== null && c !== undefined && c !== '')
  );
  return { headers, dataRows };
}

/**
 * Re-maps `rows` whose columns follow `sourceHeaders` order to match the
 * `targetHeaders` column order.  Columns not found in source are filled with
 * an empty string.  Normalizes header names (lowercase + trim) for matching,
 * which makes the alignment robust against minor capitalisation differences.
 *
 * Example:
 *   source  = ["Nombre", "Tracking", "Peso"]
 *   target  = ["Tracking", "Nombre", "Descripcion", "Peso"]
 *   row     = ["JOHN DOE", "1Z12345", "2.5"]
 *   result  = ["1Z12345", "JOHN DOE", "", "2.5"]
 */
function alignRowsToHeaders(
  sourceHeaders: unknown[],
  rows: unknown[][],
  targetHeaders: unknown[]
): unknown[][] {
  const norm = (h: unknown) => String(h ?? '').toLowerCase().trim();
  const srcNorm = sourceHeaders.map(norm);
  // Pre-compute: for each target column, which source column index to read (-1 = not present)
  const colMap = targetHeaders.map(th => srcNorm.indexOf(norm(th)));

  return rows.map(row =>
    colMap.map(srcIdx => (srcIdx >= 0 && srcIdx < row.length ? (row[srcIdx] ?? '') : ''))
  );
}

/**
 * Returns the index of a "tracking"-like column in a header array.
 */
function findTrackingColIdx(headers: unknown[]): number {
  const keywords = ['tracking', 'guia', 'guide', 'hawb', 'awb', 'number', 'numero'];
  return headers.findIndex(h => {
    const hn = String(h ?? '').toLowerCase().trim();
    return keywords.some(k => hn.includes(k));
  });
}

/**
 * Returns the index of a "description"-like column in a header array.
 */
function findDescriptionColIdx(headers: unknown[]): number {
  const keywords = ['descripcion', 'descripción', 'description', 'desc', 'detalle', 'producto', 'item', 'contenido'];
  return headers.findIndex(h => {
    const hn = String(h ?? '').toLowerCase().trim();
    return keywords.some(k => hn.includes(k));
  });
}

/**
 * Returns the index of a "weight"-like column in a header array.
 */
function findWeightColIdx(headers: unknown[]): number {
  const keywords = ['peso', 'weight', 'lbs', 'kg', 'libras', 'kilos'];
  return headers.findIndex(h => {
    const hn = String(h ?? '').toLowerCase().trim();
    return keywords.some(k => hn.includes(k));
  });
}

/**
 * TRUE duplicate removal: removes rows where TRACKING + DESCRIPTION + WEIGHT
 * all match a previously-seen row (keeps the first occurrence).
 *
 * Rows where only the tracking matches but description or weight differ are
 * kept as-is and surfaced in `conflictTrackings` so the caller can warn.
 *
 * @returns
 *  - `deduped`          — rows with true duplicates removed
 *  - `removedCount`     — number of rows that were dropped
 *  - `conflictTrackings` — trackings still duplicated after dedup (same tracking,
 *                          different data — suspicious but intentionally kept)
 */
function deduplicateRows(
  rows: unknown[][],
  trackingColIdx: number,
  descriptionColIdx: number,
  weightColIdx: number
): { deduped: unknown[][]; removedCount: number; conflictTrackings: string[] } {
  if (trackingColIdx < 0) {
    return { deduped: rows, removedCount: 0, conflictTrackings: [] };
  }

  const seenKeys = new Set<string>();         // composite key → first-occurrence guard
  const trackingSeen = new Set<string>();      // tracking → appeared at least once
  const conflictSet = new Set<string>();       // tracking still duplicated after dedup
  const deduped: unknown[][] = [];
  let removedCount = 0;

  for (const row of rows) {
    const tracking = String(row[trackingColIdx] ?? '').trim().toUpperCase();
    if (!tracking) {
      deduped.push(row);
      continue;
    }

    const desc = descriptionColIdx >= 0
      ? String(row[descriptionColIdx] ?? '').trim().toLowerCase()
      : '';
    // Normalise weight: strip units, trim, keep 2 decimal precision for comparison
    const rawW = String(row[weightColIdx] ?? '').trim().replace(/[^0-9.]/g, '');
    const weight = weightColIdx >= 0 && rawW ? parseFloat(rawW).toFixed(2) : '';

    // Composite key — all three fields must match to be a true duplicate
    const compositeKey = `${tracking}|||${desc}|||${weight}`;

    if (seenKeys.has(compositeKey)) {
      removedCount++;
      // Do NOT push — duplicate row is dropped
    } else {
      seenKeys.add(compositeKey);
      // Track whether this tracking appeared before (different data → conflict)
      if (trackingSeen.has(tracking)) {
        conflictSet.add(tracking);
      } else {
        trackingSeen.add(tracking);
      }
      deduped.push(row);
    }
  }

  return { deduped, removedCount, conflictTrackings: Array.from(conflictSet) };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Downloads the Excel files for `manifestIds`, merges all data rows into a
 * single XLSX sheet (using the most-recent manifest's header/name), and
 * returns a synthetic `File` ready to be passed to `processFiles` from
 * `useNovaChat` — which handles the Nova UI steps animation.
 *
 * Progress callback reports download / merge status to the caller.
 */
export async function createMergedManifestFile(
  manifestIds: string[],
  onProgress?: (step: string) => void
): Promise<{
  file: File;
  primaryId: string;
  /** MEGA-MAN-DD-MM-YYYY — the canonical Firestore document ID for this fusion */
  megaManifestId: string;
  /** Total rows AFTER deduplication — what Nova will actually process */
  totalRows: number;
  /** Raw row count per source manifest BEFORE dedup (same order as manifestIds) */
  perManifestRowCounts: number[];
  /** Number of rows silently dropped because they were exact duplicates */
  removedDuplicates: number;
  /**
   * Trackings that still appear more than once after dedup — same tracking but
   * different description or weight.  These are kept but flagged for review.
   */
  conflictTrackings: string[];
}> {
  if (manifestIds.length < 2) {
    throw new Error('Se necesitan al menos 2 manifiestos para hacer fusión.');
  }

  // ── Step 1: Download all Excel files in parallel ───────────────────────────
  onProgress?.(`Descargando ${manifestIds.length} manifiestos...`);
  const excelResults = await Promise.all(
    manifestIds.map(id => downloadManifestExcel(id))
  );

  // ── Step 2: Parse raw rows from each file ─────────────────────────────────
  onProgress?.('Leyendo hojas de cálculo...');
  const parsedSheets = excelResults.map((result, i) => {
    if (!result.base64) {
      throw new Error(`No se obtuvo el archivo Excel del manifiesto ${manifestIds[i]}.`);
    }
    return extractSheetRows(base64ToUint8Array(result.base64));
  });

  // ── Step 3: Determine most-recent manifest as the "primary" ───────────────
  // Tie-break: if two manifests share the same date, the one appearing LAST in
  // manifestIds wins (preserves deterministic order).
  const primaryId = mostRecentManifestId(manifestIds);
  const primaryIdx = manifestIds.indexOf(primaryId);
  const primaryHeaders = parsedSheets[primaryIdx].headers;

  // ── Step 4: Merge with column-safe alignment ───────────────────────────────
  // Each secondary sheet's rows are re-mapped to the primary column order so
  // that mismatched column positions don't corrupt values (CRITICAL BUG FIX).
  onProgress?.('Alineando columnas y fusionando filas...');
  const perManifestRowCounts = parsedSheets.map(s => s.dataRows.length);
  const mergedDataRows: unknown[][] = parsedSheets.flatMap((sheet, i) =>
    i === primaryIdx
      ? sheet.dataRows
      : alignRowsToHeaders(sheet.headers, sheet.dataRows, primaryHeaders)
  );

  // ── Step 5: Deduplicate rows (tracking + description + weight must all match) ─
  onProgress?.('Eliminando filas duplicadas exactas...');
  const trackingColIdx    = findTrackingColIdx(primaryHeaders);
  const descriptionColIdx = findDescriptionColIdx(primaryHeaders);
  const weightColIdx      = findWeightColIdx(primaryHeaders);

  const { deduped: dedupedRows, removedCount, conflictTrackings } = deduplicateRows(
    mergedDataRows,
    trackingColIdx,
    descriptionColIdx,
    weightColIdx
  );

  if (removedCount > 0) {
    onProgress?.(
      `🧹 ${removedCount} fila(s) duplicada(s) exactas eliminadas (mismo tracking, descripción y peso).`
    );
  }
  if (conflictTrackings.length > 0) {
    onProgress?.(
      `⚠️ ${conflictTrackings.length} tracking(s) con datos distintos entre manifiestos — se conservaron todas sus filas para revisión.`
    );
  }

  const totalRows = dedupedRows.length;

  // ── Step 6: Build a synthetic XLSX file ───────────────────────────────────
  const mergedRows: unknown[][] = [primaryHeaders, ...dedupedRows];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(mergedRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manifiesto');
  const xlsxRaw = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as number[];
  const xlsxBytes = new Uint8Array(xlsxRaw) as Uint8Array<ArrayBuffer>;

  const datePart = primaryId.match(/^(\d{2}-\d{2}-\d{4})/)?.[1] ?? primaryId;
  const megaManifestId = `MEGA-MAN-${datePart}`;
  const mergedFilename = `${megaManifestId}.xlsx`;
  const blob = new Blob([xlsxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const file = new File([blob], mergedFilename, { type: blob.type });

  return { file, primaryId, megaManifestId, totalRows, perManifestRowCounts, removedDuplicates: removedCount, conflictTrackings };
}

/**
 * Full pipeline: merges manifests AND runs the standard processManifestFile
 * AI pipeline.  Useful when calling outside of the Nova chat UI.
 *
 * For the Nova page, prefer `createMergedManifestFile` + `processFiles` so
 * the user sees the native processing-steps animation.
 */
export async function fusionManifests(
  manifestIds: string[],
  opts: FusionManifestOpts
): Promise<FusionManifestResult> {
  const { token, manifestType, onProgress } = opts;

  const { file, primaryId } = await createMergedManifestFile(manifestIds, onProgress);

  onProgress?.(`Procesando con IA...`);
  const result = await processManifestFile(file, token, undefined, manifestType);

  const datePart = primaryId.match(/^(\d{2}-\d{2}-\d{4})/)?.[1] ?? primaryId;
  const megaNumber = `MEGA-MAN-${datePart}`;

  return {
    ...result,
    manifestNumber: megaNumber,
    sourceManifestIds: manifestIds,
  };
}
