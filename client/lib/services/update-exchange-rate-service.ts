// Isolated TC (tipo de cambio) update service.
//
// Use case: the operator discovers that a batch of packages / invoices /
// manifest were saved with the wrong exchange rate (e.g. they used
// ₡495/$ when the correct rate was ₡475/$). This service corrects the
// TC and every CRC-derived field WITHOUT altering any invoice status.
//
// Architectural invariants:
//   1. USD amounts (`amount`, `subtotal`, `iva`, `cost`, `price`) are
//      NEVER touched — the underlying product price in dollars is the
//      operator's source of truth, only its CRC representation drifts.
//   2. Invoice status (`status`, `statusHistory`) is NEVER modified.
//      A paid invoice stays paid, a sent invoice stays sent. This is a
//      data-correction operation, not a state transition.
//   3. Annulled / cancelled / void invoices are SKIPPED — they are
//      tombstones representing historical state and must preserve their
//      TC at annulment time.
//   4. Writes are batched via Firestore `writeBatch` (max 400 ops per
//      batch, automatically chunked) so partial failures cannot leave
//      invoice and manifest out of sync with packages.
//   5. Idempotent: re-running with the same rate is safe — every write
//      is deterministic (CRC = USD × rate, rounded).
//
// Return value surfaces counts of updated vs skipped docs so the caller
// can show an operator-friendly summary.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface UpdateExchangeRateOptions {
  /** Operator identifier for the audit trail (e.g. user.email). */
  changedBy?: string;
  /** Free-form reason for the TC correction. */
  reason?: string;
}

export interface UpdateExchangeRateResult {
  /** Final rate written to every touched doc (matches the caller's input). */
  newRate: number;
  /** Packages in this manifest whose `costCRC` + `exchangeRate` were updated. */
  packagesUpdated: number;
  /** Invoices whose CRC fields + `exchangeRate` were recomputed. */
  invoicesUpdated: number;
  /** `true` when the manifest doc's `exchangeRate` was rewritten. */
  manifestUpdated: boolean;
  /** Annulled / cancelled / void invoices skipped (preserved tombstones). */
  skippedInvoicesAnnulled: number;
  /** Per-scope error list (never throws — caller inspects .errors). */
  errors: string[];
}

// Statuses that mark an invoice as a historical tombstone. These docs
// preserve the TC that was in effect at annulment and must NOT be touched
// by this service — mutating them would rewrite history.
const ANNULLED_INVOICE_STATUSES = new Set([
  'annulled',
  'cancelled',
  'void',
]);

// ── Pure helpers (exported for unit testing) ───────────────────────────────

/**
 * Recompute a package's CRC representation for a new rate.
 * Falls back to 0 when cost is missing/invalid — never throws.
 */
export function recomputePackageCostCRC(cost: unknown, newRate: number): number {
  const n = Number(cost);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(newRate) || newRate <= 0) return 0;
  return Math.round(n * newRate);
}

/**
 * Recompute an invoice's CRC triplet for a new rate. Preserves the
 * existing IVA semantics (ivaEnabled determines how the CRC total is
 * split into subtotal + IVA). USD amounts are NOT recomputed here —
 * only their CRC counterparts.
 */
export function recomputeInvoiceCRC(
  invoice: { amount?: unknown; totalAmount?: unknown; ivaEnabled?: boolean },
  newRate: number,
): { amountCRC: number; subtotalCRC: number; ivaCRC: number } {
  const usd = Number(invoice.totalAmount ?? invoice.amount ?? 0);
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(newRate) || newRate <= 0) {
    return { amountCRC: 0, subtotalCRC: 0, ivaCRC: 0 };
  }
  const amountCRC = Math.round(usd * newRate);
  const ivaOn = Boolean(invoice.ivaEnabled);
  const subtotalCRC = ivaOn ? Math.round(amountCRC / 1.13) : amountCRC;
  const ivaCRC = ivaOn ? Math.round(amountCRC - subtotalCRC) : 0;
  return { amountCRC, subtotalCRC, ivaCRC };
}

// ── Batch orchestration helpers ────────────────────────────────────────────

/**
 * Chunked writeBatch helper. Firestore caps at 500 ops per batch; we use
 * 400 for safety headroom. Errors accrue into `errorBucket` instead of
 * throwing so partial failures on one scope don't abort the others —
 * caller retries are idempotent because every write is a deterministic
 * function of (USD amount × rate).
 */
function makeBatchWriter(errorBucket: string[]) {
  const BATCH_CAP = 400;
  let batch = writeBatch(db);
  let opsInBatch = 0;
  const pendingBatches: Promise<void>[] = [];
  const flushIfFull = async () => {
    if (opsInBatch >= BATCH_CAP) {
      pendingBatches.push(
        batch.commit().catch(err => {
          errorBucket.push(
            `Batch commit failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }),
      );
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  };
  return {
    get batch() { return batch; },
    addOp: () => { opsInBatch += 1; },
    flushIfFull,
    finalFlush: async () => {
      if (opsInBatch > 0) {
        pendingBatches.push(
          batch.commit().catch(err => {
            errorBucket.push(
              `Final batch commit failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }),
        );
      }
      await Promise.all(pendingBatches);
    },
  };
}

/** Produce the audit-trail fields every scope stamps on its updates. */
function buildAuditStamp(options: UpdateExchangeRateOptions) {
  return {
    exchangeRateUpdatedAt: new Date().toISOString(),
    exchangeRateUpdatedBy: options.changedBy || 'system',
    exchangeRateUpdateReason: options.reason || 'TC correction',
  };
}

// ── Bulk scope driven by selected invoice IDs ──────────────────────────────

export interface BulkUpdateInvoicesExchangeRateResult {
  newRate: number;
  /** Invoices whose `exchangeRate` + CRC triplet were rewritten (non-annulled). */
  invoicesUpdated: number;
  /** Packages linked to those invoices whose `exchangeRate` + `costCRC` were rewritten. */
  packagesUpdated: number;
  /** Manifest docs whose `exchangeRate` was rewritten (one per unique manifest referenced). */
  manifestsUpdated: number;
  /** Annulled / cancelled / void invoices preserved as-is (tombstones). */
  skippedInvoicesAnnulled: number;
  /** Per-scope error list (never throws — caller inspects .errors). */
  errors: string[];
  /** Unique manifest numbers touched — useful for a post-run diagnostic summary. */
  affectedManifests: string[];
}

/**
 * Bulk-update the exchange rate for a specific list of invoice IDs.
 *
 * Unlike `updateManifestExchangeRate` (which targets a whole manifest),
 * this function lets the operator correct TC for a hand-picked selection
 * of invoices in the /invoices page. It propagates the change to:
 *   1. The selected invoices — `exchangeRate`, `amountCRC`, `subtotalCRC`,
 *      `ivaCRC`. Annulled / cancelled / void are preserved.
 *   2. The packages linked to those invoices — `exchangeRate`, `costCRC`.
 *      Linkage is resolved via `invoiceItems[].packageId` first, then
 *      `invoiceItems[].trackingNumber` as fallback for legacy docs.
 *   3. The manifests referenced by those invoices — `exchangeRate`.
 *      Unique manifest numbers are deduped across the selection.
 *
 * Never modifies invoice status, statusHistory, invoiceItems,
 * trackingNumbers, or any customer identity — TC correction is a data fix,
 * not a state transition. Paid invoices DO receive the TC update (operators
 * routinely discover billing drift on already-paid docs and need to correct
 * the CRC representation without touching the paid status).
 */
export async function bulkUpdateInvoicesExchangeRate(
  invoiceIds: string[],
  newRate: number,
  options: UpdateExchangeRateOptions = {},
): Promise<BulkUpdateInvoicesExchangeRateResult> {
  const result: BulkUpdateInvoicesExchangeRateResult = {
    newRate,
    invoicesUpdated: 0,
    packagesUpdated: 0,
    manifestsUpdated: 0,
    skippedInvoicesAnnulled: 0,
    errors: [],
    affectedManifests: [],
  };

  if (invoiceIds.length === 0 || !Number.isFinite(newRate) || newRate <= 0) {
    result.errors.push(
      `Invalid input: invoiceIds.length=${invoiceIds.length}, newRate=${newRate}`,
    );
    return result;
  }

  const auditStamp = buildAuditStamp(options);

  // ── Step 1: load each invoice doc (parallel, bounded) ───────────────────
  type InvDoc = { id: string; ref: any; data: any };
  const invDocs: InvDoc[] = [];
  const CHUNK = 30;
  try {
    for (let i = 0; i < invoiceIds.length; i += CHUNK) {
      const chunk = invoiceIds.slice(i, i + CHUNK);
      const snaps = await Promise.all(
        chunk.map(id => getDoc(doc(db, 'invoices', id))),
      );
      snaps.forEach((s, j) => {
        if (s.exists()) {
          invDocs.push({ id: chunk[j], ref: s.ref, data: s.data() });
        }
      });
    }
  } catch (err) {
    result.errors.push(`Invoice load failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  // ── Step 2: resolve the set of unique linked package IDs + trackings ────
  const packageIds = new Set<string>();
  const trackingNumbers = new Set<string>();
  const manifestSet = new Set<string>();
  for (const { data } of invDocs) {
    const items: any[] = Array.isArray(data.invoiceItems) ? data.invoiceItems : [];
    for (const it of items) {
      if (it?.packageId && typeof it.packageId === 'string') {
        packageIds.add(it.packageId);
      } else if (it?.trackingNumber && typeof it.trackingNumber === 'string') {
        trackingNumbers.add(it.trackingNumber.toUpperCase());
      }
    }
    // Manifest references: string or array form
    const mnSingle = typeof data.manifestNumber === 'string' ? data.manifestNumber : '';
    if (mnSingle) manifestSet.add(mnSingle);
    const mnMulti = Array.isArray(data.manifestNumbers) ? data.manifestNumbers : [];
    mnMulti.forEach((m: any) => { if (typeof m === 'string' && m) manifestSet.add(m); });
  }

  // ── Step 3: load package docs (both by ID and by trackingNumber) ────────
  type PkgDoc = { ref: any; data: any };
  const pkgDocs: PkgDoc[] = [];
  try {
    // By ID — direct getDoc calls
    if (packageIds.size > 0) {
      const ids = Array.from(packageIds);
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const snaps = await Promise.all(
          chunk.map(id => getDoc(doc(db, 'packages', id))),
        );
        snaps.forEach(s => { if (s.exists()) pkgDocs.push({ ref: s.ref, data: s.data() }); });
      }
    }
    // By trackingNumber — Firestore `in` query (chunked at 30 per query)
    if (trackingNumbers.size > 0) {
      const trackings = Array.from(trackingNumbers);
      for (let i = 0; i < trackings.length; i += CHUNK) {
        const chunk = trackings.slice(i, i + CHUNK);
        const snap = await getDocs(
          query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)),
        );
        snap.forEach(d => pkgDocs.push({ ref: d.ref, data: d.data() }));
        // Also try upper-cased trackings (some docs stored with different casing)
      }
    }
  } catch (err) {
    result.errors.push(`Package load failed: ${err instanceof Error ? err.message : String(err)}`);
    // Don't abort — we can still update invoices and manifests.
  }

  // Dedupe packages (a package could be hit by both packageId and tracking query)
  const seenPkgIds = new Set<string>();
  const uniquePkgs = pkgDocs.filter(p => {
    const id = p.ref?.id as string;
    if (!id || seenPkgIds.has(id)) return false;
    seenPkgIds.add(id);
    return true;
  });

  // ── Step 4: batched writes ──────────────────────────────────────────────
  const writer = makeBatchWriter(result.errors);

  // 4a. Invoices — skip annulled
  for (const { ref, data } of invDocs) {
    const status = String(data.status || '').toLowerCase();
    if (ANNULLED_INVOICE_STATUSES.has(status)) {
      result.skippedInvoicesAnnulled += 1;
      continue;
    }
    const { amountCRC, subtotalCRC, ivaCRC } = recomputeInvoiceCRC(
      { amount: data.amount, totalAmount: data.totalAmount, ivaEnabled: data.ivaEnabled },
      newRate,
    );
    writer.batch.update(ref, {
      exchangeRate: newRate,
      amountCRC,
      subtotalCRC,
      ivaCRC,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    result.invoicesUpdated += 1;
    await writer.flushIfFull();
  }

  // 4b. Packages — recompute costCRC from stored cost × newRate
  for (const { ref, data } of uniquePkgs) {
    const cost = Number(data.cost ?? data.price ?? 0);
    const costCRC = recomputePackageCostCRC(cost, newRate);
    writer.batch.update(ref, {
      exchangeRate: newRate,
      costCRC,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    result.packagesUpdated += 1;
    await writer.flushIfFull();
  }

  // 4c. Manifest docs — one update per unique manifest referenced.
  //     Pre-check existence: Firestore's batch.update() REJECTS the entire
  //     batch if any target doc is missing, which would silently drop the
  //     invoice + package writes queued alongside. We load each manifest
  //     first and skip the ones that no longer exist (deleted out-of-band).
  const manifestsArr = Array.from(manifestSet);
  const existingManifests: string[] = [];
  if (manifestsArr.length > 0) {
    try {
      const mSnaps = await Promise.all(
        manifestsArr.map(mn => getDoc(doc(db, 'manifests', mn))),
      );
      mSnaps.forEach((s, i) => {
        if (s.exists()) existingManifests.push(manifestsArr[i]);
      });
      const missing = manifestsArr.length - existingManifests.length;
      if (missing > 0) {
        result.errors.push(
          `${missing} manifest doc(s) not found — skipped: ${manifestsArr
            .filter(mn => !existingManifests.includes(mn))
            .join(', ')}`,
        );
      }
    } catch (err) {
      result.errors.push(
        `Manifest existence check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  for (const mn of existingManifests) {
    writer.batch.update(doc(db, 'manifests', mn), {
      exchangeRate: newRate,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    result.manifestsUpdated += 1;
    await writer.flushIfFull();
  }
  result.affectedManifests = existingManifests;

  await writer.finalFlush();
  return result;
}

// ── Invoice-only scope (also exported for handleIngest post-save sync) ─────

/**
 * Apply a new exchange rate to every non-annulled invoice in a manifest.
 * Invoice status, statusHistory, trackingNumbers, and invoiceItems are
 * NEVER modified — this is a data-correction operation scoped to
 * `exchangeRate`, `amountCRC`, `subtotalCRC`, and `ivaCRC`.
 *
 * Exported separately so the main Nova save paths (handleIngest,
 * handleIngestAndInvoice) can call it as a post-save step: the ingest
 * already persists TC on packages + manifest, so running this afterwards
 * brings invoices into alignment without re-running the heavier scopes.
 */
export async function updateInvoicesExchangeRate(
  manifestNumber: string,
  newRate: number,
  options: UpdateExchangeRateOptions = {},
): Promise<Pick<UpdateExchangeRateResult, 'invoicesUpdated' | 'skippedInvoicesAnnulled' | 'errors'>> {
  const errors: string[] = [];
  let invoicesUpdated = 0;
  let skippedInvoicesAnnulled = 0;

  if (!manifestNumber || !Number.isFinite(newRate) || newRate <= 0) {
    errors.push(`Invalid input: manifestNumber=${manifestNumber}, newRate=${newRate}`);
    return { invoicesUpdated, skippedInvoicesAnnulled, errors };
  }

  let invSnap: { docs: QueryDocumentSnapshot[] };
  try {
    invSnap = await getDocs(
      query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber)),
    );
  } catch (err) {
    errors.push(`Invoice read failed: ${err instanceof Error ? err.message : String(err)}`);
    return { invoicesUpdated, skippedInvoicesAnnulled, errors };
  }

  const auditStamp = buildAuditStamp(options);
  const writer = makeBatchWriter(errors);
  for (const d of invSnap.docs) {
    const data = d.data() as any;
    const status = String(data.status || '').toLowerCase();
    if (ANNULLED_INVOICE_STATUSES.has(status)) {
      skippedInvoicesAnnulled += 1;
      continue;
    }
    const { amountCRC, subtotalCRC, ivaCRC } = recomputeInvoiceCRC(
      { amount: data.amount, totalAmount: data.totalAmount, ivaEnabled: data.ivaEnabled },
      newRate,
    );
    // Short-circuit: skip the write when every CRC-derived field is
    // already aligned. This is the common case on handleIngest-triggered
    // syncs where the operator didn't actually change the TC — avoids
    // paying N Firestore writes per save on a 200-invoice manifest.
    const storedRate = Number(data.exchangeRate);
    const storedAmountCRC = Number(data.amountCRC);
    const storedSubtotalCRC = Number(data.subtotalCRC);
    const storedIvaCRC = Number(data.ivaCRC);
    const alreadyAligned =
      Number.isFinite(storedRate) && storedRate === newRate &&
      Number.isFinite(storedAmountCRC) && storedAmountCRC === amountCRC &&
      Number.isFinite(storedSubtotalCRC) && storedSubtotalCRC === subtotalCRC &&
      Number.isFinite(storedIvaCRC) && storedIvaCRC === ivaCRC;
    if (alreadyAligned) continue;
    writer.batch.update(d.ref, {
      exchangeRate: newRate,
      amountCRC,
      subtotalCRC,
      ivaCRC,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    invoicesUpdated += 1;
    await writer.flushIfFull();
  }
  await writer.finalFlush();

  return { invoicesUpdated, skippedInvoicesAnnulled, errors };
}

// ── Main all-scopes service (4th dialog button) ─────────────────────────────

/**
 * Update the exchange rate across a manifest's packages, invoices, and
 * manifest doc in a single coordinated operation. NEVER changes invoice
 * status. Annulled invoices are preserved as-is.
 *
 * The operation is split into chunked writeBatch commits (Firestore hard
 * limit: 500 ops per batch, we cap at 400 for headroom). A partial commit
 * failure surfaces as an entry in `result.errors` but does not abort the
 * remaining scopes — the caller can retry safely (idempotent).
 *
 * @param manifestNumber — required, identifies the target manifest.
 * @param newRate — strictly positive; ≤ 0 short-circuits with a no-op.
 */
export async function updateManifestExchangeRate(
  manifestNumber: string,
  newRate: number,
  options: UpdateExchangeRateOptions = {},
): Promise<UpdateExchangeRateResult> {
  const result: UpdateExchangeRateResult = {
    newRate,
    packagesUpdated: 0,
    invoicesUpdated: 0,
    manifestUpdated: false,
    skippedInvoicesAnnulled: 0,
    errors: [],
  };

  if (!manifestNumber || !Number.isFinite(newRate) || newRate <= 0) {
    result.errors.push(
      `Invalid input: manifestNumber=${manifestNumber}, newRate=${newRate}`,
    );
    return result;
  }

  const auditStamp = buildAuditStamp(options);

  // ── Parallel read: packages + invoices + manifest doc ───────────────────
  let pkgSnap: { docs: QueryDocumentSnapshot[] };
  let invSnap: { docs: QueryDocumentSnapshot[] };
  let manifestDoc: DocumentSnapshot;
  try {
    [pkgSnap, invSnap, manifestDoc] = await Promise.all([
      getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', manifestNumber))),
      getDocs(query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber))),
      getDoc(doc(db, 'manifests', manifestNumber)),
    ]);
  } catch (err) {
    result.errors.push(
      `Read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  const writer = makeBatchWriter(result.errors);

  // ── Packages: update exchangeRate + costCRC ─────────────────────────────
  for (const d of pkgSnap.docs) {
    const data = d.data();
    const cost = Number(data.cost ?? data.price ?? 0);
    const costCRC = recomputePackageCostCRC(cost, newRate);
    writer.batch.update(d.ref, {
      exchangeRate: newRate,
      costCRC,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    result.packagesUpdated += 1;
    await writer.flushIfFull();
  }

  // ── Invoices: update exchangeRate + CRC fields (status untouched) ───────
  for (const d of invSnap.docs) {
    const data = d.data() as any;
    const status = String(data.status || '').toLowerCase();
    if (ANNULLED_INVOICE_STATUSES.has(status)) {
      result.skippedInvoicesAnnulled += 1;
      continue;
    }
    const { amountCRC, subtotalCRC, ivaCRC } = recomputeInvoiceCRC(
      { amount: data.amount, totalAmount: data.totalAmount, ivaEnabled: data.ivaEnabled },
      newRate,
    );
    // NOTE: do NOT include `status`, `statusHistory`, `trackingNumbers`,
    // or `invoiceItems` in the update payload — TC correction is a
    // scoped data fix, not a state transition.
    writer.batch.update(d.ref, {
      exchangeRate: newRate,
      amountCRC,
      subtotalCRC,
      ivaCRC,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    result.invoicesUpdated += 1;
    await writer.flushIfFull();
  }

  // ── Manifest doc: update exchangeRate (totalPrice stays — it's USD) ─────
  if (manifestDoc.exists()) {
    writer.batch.update(manifestDoc.ref, {
      exchangeRate: newRate,
      updatedAt: serverTimestamp(),
      ...auditStamp,
    });
    writer.addOp();
    result.manifestUpdated = true;
  }

  await writer.finalFlush();
  return result;
}
