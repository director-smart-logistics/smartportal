/**
 * gti-manifest-service.ts
 *
 * Firestore persistence layer for GTI tiquete exports.
 *
 * Collection: `gti_manifests`
 * Document ID: manifestNumber  (upsert — re-processing the same manifest overwrites)
 *
 * Each document stores the pre-calculated CRC amounts alongside the raw input
 * so the GTI Manifiestos module can display and re-export without recalculating.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { GTICalculatedRow, GTIExportOptions, GTIRowInput } from './gti-export';

// ── Types ─────────────────────────────────────────────────────────────────────────────────

export interface GTIManifestDoc {
  manifestNumber: string;
  exportedAt:     Timestamp | null;
  exportedBy:     string;
  exportedByName: string;
  tc:             number;
  routeSuffix:    string;
  rowCount:       number;
  rows:           GTICalculatedRow[];
}

/** Invoice entry used for per-invoice GTI export with download tracking */
export interface GTIInvoiceEntry {
  id:               string;
  clientSlCode:     string;
  clientName:       string;
  manifestNumber:   string;
  /** Invoice total in USD (as billed) */
  totalAmount:      number;
  /** Invoice total in CRC colones (as billed — used to derive precioUSD at
   *  the current printTc so GTI MONTO matches the actual invoice CRC total). */
  amountCRC:        number;
  trackingNumbers:  string[];
  /** How many times this invoice has been included in a GTI download */
  gtiDownloadCount: number;
  gtiDownloadedAt:  Timestamp | null;
  status:           string;
}

// ── Collection ────────────────────────────────────────────────────────────────

const COLLECTION = 'gti_manifests';

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upsert a GTI manifest export into Firestore.
 * Using the manifestNumber as the document ID guarantees that re-exporting
 * the same manifest updates the existing document instead of creating a duplicate.
 *
 * @param rows        Pre-calculated rows from buildGTICalculatedRows()
 * @param options     Export options (tc, manifestNumber, routeSuffix)
 * @param exportedBy  UID of the user who triggered the export
 * @param exportedByName  Display name / email of the exporter
 */
export async function saveGTIManifest(
  rows: GTICalculatedRow[],
  options: GTIExportOptions,
  exportedBy: string,
  exportedByName: string,
): Promise<void> {
  const manifestNumber = options.manifestNumber?.trim() || 'SIN_NUMERO';
  const docRef = doc(db, COLLECTION, manifestNumber);

  const data: Omit<GTIManifestDoc, 'exportedAt'> & { exportedAt: ReturnType<typeof serverTimestamp> } = {
    manifestNumber,
    exportedAt:     serverTimestamp(),
    exportedBy,
    exportedByName,
    tc:             options.tc,
    routeSuffix:    options.routeSuffix || '',
    rowCount:       rows.length,
    rows,
  };

  await setDoc(docRef, data, { merge: false });
}

// ── Read (real-time) ──────────────────────────────────────────────────────────

/**
 * Subscribe to all GTI manifests, ordered by most-recent export first.
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeGTIManifests(
  callback: (manifests: GTIManifestDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    orderBy('exportedAt', 'desc'),
  );

  return onSnapshot(
    q,
    snap => {
      const manifests: GTIManifestDoc[] = snap.docs.map(d => ({
        ...(d.data() as GTIManifestDoc),
        manifestNumber: d.id,
      }));
      callback(manifests);
    },
    _err => {
      callback([]);
    },
  );
}

// ── Invoice download tracking ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all invoices for a given manifest that belong to the supplied SL codes.
 * Queried in chunks of 30 to respect Firestore “in” operator limits.
 * Returns invoices with their GTI download counters so callers can split all/new.
 */
export async function fetchGTIInvoicesByManifest(
  manifestNumber: string,
  slCodes: string[],
): Promise<GTIInvoiceEntry[]> {
  if (!slCodes.length) return [];
  const results: GTIInvoiceEntry[] = [];
  
  // Resolve manifest search terms (ID + stored manifestNumber)
  const searchTerms = [manifestNumber];
  try {
    const mSnap = await getDoc(doc(db, 'manifests', manifestNumber));
    if (mSnap.exists()) {
      const data = mSnap.data();
      const mn = (data.manifestNumber || '').trim();
      if (mn && mn !== manifestNumber) {
        searchTerms.push(mn);
      }
    }
  } catch (err) {
    console.error("Error reading manifest for GTI search terms:", err);
  }

  const CHUNK = 30;
  const seenIds = new Set<string>();
  
  for (const term of searchTerms) {
    for (let i = 0; i < slCodes.length; i += CHUNK) {
      const chunk = slCodes.slice(i, i + CHUNK);
      const q = query(
        collection(db, 'invoices'),
        where('manifestNumber', '==', term),
        where('clientSlCode', 'in', chunk),
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        const data = d.data() as any;
        results.push({
          id:               d.id,
          clientSlCode:     data.clientSlCode || '',
          clientName:       data.clientName   || '',
          manifestNumber:   data.manifestNumber || term,
          totalAmount:      data.totalAmount ?? data.amount ?? 0,
          amountCRC:        data.amountCRC ?? 0,
          trackingNumbers:  data.trackingNumbers || [],
          gtiDownloadCount: data.gtiDownloadCount ?? 0,
          gtiDownloadedAt:  data.gtiDownloadedAt  ?? null,
          status:           data.status || 'draft',
        });
      });
    }
  }
  return results;
}

/**
 * Increment gtiDownloadCount and set gtiDownloadedAt on every invoice in the list.
 * Batched in chunks of 500 (Firestore write-batch limit).
 */
export async function markInvoicesAsGTIDownloaded(invoiceIds: string[]): Promise<void> {
  if (!invoiceIds.length) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
    const chunk = invoiceIds.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.update(doc(db, 'invoices', id), {
        gtiDownloadCount: increment(1),
        gtiDownloadedAt:  serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

/**
 * Return a map of `${clientSlCode}__${manifestNumber}` → gtiDownloadCount
 * for all invoices belonging to the given manifests.
 * Used by the dispatch table to render per-row GTI download badges.
 */
export async function getGTICountsByManifests(
  manifestNumbers: string[],
): Promise<Map<string, number>> {
  const countMap = new Map<string, number>();
  if (!manifestNumbers.length) return countMap;

  // Resolve all manifestNumber aliases for the input manifestNumbers
  const searchTerms = [...manifestNumbers];
  const manifestDataList: any[] = [];
  try {
    for (const mNum of manifestNumbers) {
      const mSnap = await getDoc(doc(db, 'manifests', mNum));
      if (mSnap.exists()) {
        const data = mSnap.data();
        manifestDataList.push({ id: mNum, data });
        const mn = (data.manifestNumber || '').trim();
        if (mn && !searchTerms.includes(mn)) {
          searchTerms.push(mn);
        }
      }
    }
  } catch (err) {
    console.error("Error reading manifests map for GTI counts:", err);
  }

  const CHUNK = 30;
  for (let i = 0; i < searchTerms.length; i += CHUNK) {
    const chunk = searchTerms.slice(i, i + CHUNK);
    try {
      const snap = await getDocs(
        query(collection(db, 'invoices'), where('manifestNumber', 'in', chunk)),
      );
      snap.docs.forEach(d => {
        const data = d.data() as any;
        if (data.clientSlCode && data.manifestNumber) {
          countMap.set(`${data.clientSlCode}__${data.manifestNumber}`, data.gtiDownloadCount ?? 0);
          
          // Also set the key mapped to the document ID if they differ
          const mappedManifest = manifestNumbers.find(mNum => {
            const mData = manifestDataList.find(x => x.id === mNum);
            return mData && (mData.data.manifestNumber || '').trim() === data.manifestNumber;
          });
          if (mappedManifest) {
            countMap.set(`${data.clientSlCode}__${mappedManifest}`, data.gtiDownloadCount ?? 0);
          }
        }
      });
    } catch { /* non-fatal */ }
  }
  return countMap;
}

// ── Row-level updates ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply field-level patches to one or more rows within a manifest document.
 * Recalculates monto/flete/logistica when precioUSD changes.
 *
 * @param manifestNumber  Document ID in `gti_manifests`
 * @param updates         Array of { rowIndex, fields } patches
 */
export async function updateGTIManifestRows(
  manifestNumber: string,
  updates: Array<{ rowIndex: number; fields: Partial<GTICalculatedRow> }>,
): Promise<void> {
  const FLETE_RATIO      = 0.80;
  const LOGISTICA_DIVISOR = 4.52;

  const docRef = doc(db, COLLECTION, manifestNumber);
  const snap   = await getDoc(docRef);
  if (!snap.exists()) throw new Error(`GTI manifest '${manifestNumber}' not found`);

  const data = snap.data() as GTIManifestDoc;
  const rows = data.rows.map(r => ({ ...r }));

  for (const { rowIndex, fields } of updates) {
    if (rowIndex < 0 || rowIndex >= rows.length) continue;
    Object.assign(rows[rowIndex], fields);

    // Re-derive amounts when precioUSD is patched
    if (fields.precioUSD !== undefined) {
      const tc = data.tc;
      const monto = tc > 0
        ? Math.round(fields.precioUSD * tc * 100) / 100
        : fields.precioUSD;
      const flete     = Math.round(monto * FLETE_RATIO * 100) / 100;
      const logistica = Math.floor(flete / LOGISTICA_DIVISOR * 100) / 100;
      Object.assign(rows[rowIndex], { monto, flete, logistica });
    }
  }

  await updateDoc(docRef, {
    rows,
    rowCount:  rows.length,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update the exchange rate (TC) for an entire GTI manifest document,
 * recalculating MONTO, FLETE, and LOGÍSTICA for all rows in the manifest.
 */
export async function updateGTIManifestTC(
  manifestNumber: string,
  newTC: number,
): Promise<void> {
  const FLETE_RATIO = 0.80;
  const LOGISTICA_IVA_RATE = 1.13;

  const docRef = doc(db, COLLECTION, manifestNumber);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error(`GTI manifest '${manifestNumber}' not found`);

  const data = snap.data() as GTIManifestDoc;
  const rows = data.rows.map(row => {
    const monto = newTC > 0 ? Math.round(row.precioUSD * newTC * 100) / 100 : row.precioUSD;
    const flete = Math.trunc(monto * FLETE_RATIO * 100) / 100;
    const logistica = Math.trunc((monto - flete) / LOGISTICA_IVA_RATE * 100) / 100;
    return { ...row, monto, flete, logistica };
  });

  await updateDoc(docRef, {
    tc: newTC,
    rows,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete one or more rows by their index from a GTI manifest document.
 */
export async function deleteGTIManifestRows(
  manifestNumber: string,
  rowIndicesToDelete: number[],
): Promise<void> {
  const docRef = doc(db, COLLECTION, manifestNumber);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error(`GTI manifest '${manifestNumber}' not found`);

  const data = snap.data() as GTIManifestDoc;
  const deleteSet = new Set(rowIndicesToDelete);
  const filteredRows = data.rows.filter((_, idx) => !deleteSet.has(idx));

  await updateDoc(docRef, {
    rows: filteredRows,
    rowCount: filteredRows.length,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Add a new custom row to a GTI manifest document.
 */
export async function addGTIManifestRow(
  manifestNumber: string,
  newRow: GTIRowInput,
): Promise<void> {
  const FLETE_RATIO = 0.80;
  const LOGISTICA_IVA_RATE = 1.13;

  const docRef = doc(db, COLLECTION, manifestNumber);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error(`GTI manifest '${manifestNumber}' not found`);

  const data = snap.data() as GTIManifestDoc;
  const tc = data.tc || 500;
  const monto = tc > 0 ? Math.round(newRow.precioUSD * tc * 100) / 100 : newRow.precioUSD;
  const flete = Math.trunc(monto * FLETE_RATIO * 100) / 100;
  const logistica = Math.trunc((monto - flete) / LOGISTICA_IVA_RATE * 100) / 100;

  const calculatedRow: GTICalculatedRow = {
    ...newRow,
    nombre: newRow.nombre.toUpperCase(),
    monto,
    flete,
    logistica,
  };

  const updatedRows = [...data.rows, calculatedRow];

  await updateDoc(docRef, {
    rows: updatedRows,
    rowCount: updatedRows.length,
    updatedAt: serverTimestamp(),
  });
}
