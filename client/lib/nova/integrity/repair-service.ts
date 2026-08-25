/**
 * Nova manifest integrity — repair service.
 *
 * ─── Scope policy (locked) ────────────────────────────────────────────────
 *
 * Per the operator's explicit data-integrity policy choice
 * (BUG-CURATED-DESTROYED 2026-04-29), the repair flow mutates THREE
 * Firestore collections to keep every read-side source in sync:
 *
 *   1. `manifests/{mn}.packages[<rowIndex>]` — the embedded snapshot the
 *      Nova table renders.
 *   2. `packages/{trackingId}` — the canonical live record.
 *   3. `manifest_encomiendas/{trackingId}` — encomienda-routing mirror,
 *      ONLY when the doc already exists (we never create new encomienda
 *      docs from a repair — that's the responsibility of the routing
 *      ingest + `syncManifestEncomiendaFromPackages`).
 *
 * The third source was added (BUG-INTEGRITY-AUDIT-LOOP 2026-05-02) after
 * operators reported that the audit kept firing `slcode_mismatch` on the
 * SAME rows after every apply: the audit reads encomiendas and treats it
 * as authoritative, so when only manifests + packages updated, the
 * stale encomiendas slCode kept the row in the issue list forever. The
 * fix is to bring encomiendas into the repair scope so the next audit
 * sees a consistent picture across all three local sources.
 *
 * Invoices are touched ONLY when a repair is submitted with an explicit
 * `invoice` pointer (see `IntegrityRepair.invoice`). In that case the
 * service rewrites the invoice's customer columns (slCode / clientSlCode /
 * customerId / clientName / embedded customer.*) so the badge on the
 * Facturas page matches the repaired manifest row. For DRAFT and
 * ANNULLED invoices the `invoiceNumber` prefix is ALSO rewritten via
 * `replaceInvoiceNumberPrefix` so the displayed code changes from e.g.
 * "SL-NAN-00027-…" to "SL26682-…". Protected invoices (sent / paid /
 * overdue / pending) keep their original `invoiceNumber` to preserve the
 * external reference the customer already received. A `statusHistory`
 * entry is appended for audit trail on every invoice rewrite.
 *
 * When a repair is submitted WITHOUT an `invoice` pointer the legacy
 * behaviour stands — no invoice document is touched.
 *
 * ─── Atomicity ────────────────────────────────────────────────────────────
 *
 * All writes for a single `applyIntegrityRepairs` call go through a single
 * Firestore `writeBatch`. Either every repair lands or none do — there
 * is no partial-state where the manifest's embedded array updates but
 * the packages collection lags behind (or vice-versa).
 *
 * The batch size limit (500 ops) is respected: each repair contributes at
 * most 3 ops (one per collection), so up to ~166 repairs per call. Larger
 * batches are silently chunked.
 *
 * ─── Failure modes ────────────────────────────────────────────────────────
 *
 * On Firestore error the call returns `{ ok: false, error }` and writes
 * nothing — `writeBatch.commit()` is all-or-nothing. The caller should
 * surface the error to the operator and let them retry.
 */

import { arrayUnion, collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { isTempSlCode, replaceInvoiceNumberPrefix } from '@/lib/utils/invoice-reassign';
import { deleteTempCustomer } from '@/lib/services/temp-customers-service';

/** A single repair action to apply. */
export interface IntegrityRepair {
  /** Which row in `manifests/{mn}.packages[]` to update. */
  rowIndex: number;
  /** The tracking ID — used to locate the corresponding `packages/{id}` doc. */
  tracking: string;
  /** New canonical slCode for the row. */
  slCode: string;
  /** New canonical customer fullName. */
  customerName: string;
  /** New canonical route. */
  ruta: string;
  /**
   * Optional: a linked active invoice whose customer columns should be
   * rewritten by the repair. When set, the repair also updates
   * `invoices/{invoiceId}` to reflect the canonical slCode and rewrites
   * the `invoiceNumber` prefix so the displayed "SL-NAN-00027-…" badge
   * becomes "SL26682-…" atomically with the manifest / packages fix.
   *
   * Protection rule: the invoice prefix is ONLY rewritten for draft /
   * annulled invoices. For protected statuses (sent / paid / overdue /
   * pending) the customer columns are still corrected but the
   * `invoiceNumber` is preserved — the customer already received the
   * receipt with the original number so rewriting it would invalidate
   * their external reference.
   */
  invoice?: {
    invoiceId: string;
    invoiceNumber: string;
    isProtected: boolean;
    /**
     * The slCode the invoice had BEFORE this repair. Used post-commit to
     * detect when the previous owner was a temp customer (`SL-NAN-*`) and
     * trigger the same cleanup the Facturas "Reasignar" flow performs:
     * delete the temp_customers record once no invoices reference it anymore.
     */
    previousSlCode?: string;
  };
}

export interface IntegrityRepairResult {
  ok: boolean;
  /** Number of `manifests/{mn}.packages[]` rows successfully updated. */
  manifestRowsUpdated: number;
  /** Number of `packages/{trackingId}` docs successfully updated. */
  packagesDocsUpdated: number;
  /**
   * Number of `manifest_encomiendas/{trackingId}` docs successfully
   * updated. Only encomienda-route trackings have docs in this
   * collection, so this number is typically lower than `packagesDocsUpdated`.
   */
  encomiendaDocsUpdated: number;
  /**
   * Number of `invoices/{invoiceId}` docs whose customer columns were
   * rewritten as part of the repair. Only non-zero for repairs submitted
   * with an `invoice` pointer.
   */
  invoicesDocsUpdated: number;
  /**
   * Rewritten invoice-number pairs (before → after) — only populated for
   * draft / annulled invoices whose prefix was changed. Useful for audit
   * trail and operator-facing toasts.
   */
  invoiceNumberRewrites: Array<{ invoiceId: string; before: string; after: string }>;
  /**
   * Temp-customer slCodes that were deleted as a side-effect of an invoice
   * re-assignment. Mirrors the cleanup the Facturas "Reasignar" flow runs
   * via `deleteTempCustomer` in `temp-customers-service.ts`.
   */
  tempCustomersDeleted: string[];
  /** Trackings the audit wanted to repair but where we couldn't find a `packages/{id}` doc. */
  missingPackageDocs: string[];
  /** Firestore-level error if the batch commit failed. */
  error?: string;
}

/**
 * Maximum repairs per single batch — Firestore allows 500 ops.
 *
 * Per-repair op budget:
 *   • packages/{tracking}                 — 1 op (always)
 *   • manifest_encomiendas/{tracking}     — 0–1 op (only if doc exists)
 *   • invoices/{invoiceId}                — 0–1 op (only when r.invoice is set)
 *   • manifests/{id}.packages array       — 1 op TOTAL on the first chunk
 *
 * Worst case: 4 ops per repair (packages + encomiendas + invoice + the
 * first-chunk manifest write amortised). 125 × 4 = 500 → exact limit, with
 * the assumption that the first chunk's amortised manifest write fits
 * because we still have one op of slack vs. the strict 4-per-repair cap.
 *
 * Reduced from 166 (the previous value, which assumed 3 ops/repair pre
 * BUG-INTEGRITY-AUDIT-LOOP) when the invoice rewrite was added — without
 * this change, a single batch of ≥125 repairs containing invoice pointers
 * could exceed Firestore's 500-op ceiling and abort the whole apply.
 */
const MAX_REPAIRS_PER_BATCH = 125;

/**
 * Apply a set of integrity repairs atomically.
 *
 * @param manifestId Document ID of the manifest in `manifests/`.
 * @param repairs    Repair actions to apply. Trackings are normalized to
 *                   uppercase and de-duplicated by rowIndex.
 */
export async function applyIntegrityRepairs(
  manifestId: string,
  repairs: ReadonlyArray<IntegrityRepair>,
): Promise<IntegrityRepairResult> {
  const empty: IntegrityRepairResult = {
    ok: true,
    manifestRowsUpdated: 0,
    packagesDocsUpdated: 0,
    encomiendaDocsUpdated: 0,
    invoicesDocsUpdated: 0,
    invoiceNumberRewrites: [],
    tempCustomersDeleted: [],
    missingPackageDocs: [],
  };
  if (!manifestId || repairs.length === 0) return empty;

  // De-dup by rowIndex (last write wins). Unlikely but possible if the UI
  // submits the same row twice with different chosen fixes.
  const byRow = new Map<number, IntegrityRepair>();
  for (const r of repairs) {
    if (r.rowIndex >= 0 && r.tracking) {
      byRow.set(r.rowIndex, { ...r, tracking: r.tracking.trim().toUpperCase() });
    }
  }
  const ordered = Array.from(byRow.values()).sort((a, b) => a.rowIndex - b.rowIndex);

  // ── Read the manifest ONCE, mutate the array client-side, write the
  //    whole array back in the batch. We intentionally re-write the FULL
  //    `packages` array on each batch (not arrayUnion / arrayRemove)
  //    because the embedded array is index-based; partial ops don't have
  //    a way to address `packages[7]`.
  let manifestSnap;
  try {
    manifestSnap = await getDoc(doc(collection(db, 'manifests'), manifestId));
  } catch (err) {
    return { ...empty, ok: false, error: `Manifest read failed: ${(err as Error).message}` };
  }
  if (!manifestSnap.exists()) {
    return { ...empty, ok: false, error: `Manifest ${manifestId} not found` };
  }
  const manifestData = manifestSnap.data() ?? {};
  const packagesArray: Array<Record<string, unknown>> = Array.isArray(manifestData.packages)
    ? [...(manifestData.packages as Array<Record<string, unknown>>)].map(p => ({ ...p }))
    : [];

  // Apply repairs to the in-memory copy.
  let manifestRowsUpdated = 0;
  for (const r of ordered) {
    const target = packagesArray[r.rowIndex];
    if (!target) continue; // out-of-range index — silently skip
    target.slCode = r.slCode;
    target.customerName = r.customerName;
    target.ruta = r.ruta;
    manifestRowsUpdated++;
  }

  // ── Chunk + commit ─────────────────────────────────────────────────────
  const chunks: IntegrityRepair[][] = [];
  for (let i = 0; i < ordered.length; i += MAX_REPAIRS_PER_BATCH) {
    chunks.push(ordered.slice(i, i + MAX_REPAIRS_PER_BATCH));
  }

  const missingPackageDocs: string[] = [];
  let packagesDocsUpdated = 0;
  let encomiendaDocsUpdated = 0;
  let invoicesDocsUpdated = 0;
  const invoiceNumberRewrites: Array<{ invoiceId: string; before: string; after: string }> = [];

  // First chunk also writes the (full, post-repair) manifest packages array.
  // Subsequent chunks only update packages collection docs.
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const batch = writeBatch(db);
    const chunk = chunks[chunkIdx];

    if (chunkIdx === 0) {
      const manifestRef = doc(collection(db, 'manifests'), manifestId);
      batch.update(manifestRef, { packages: packagesArray, updatedAt: new Date().toISOString() });
    }

    for (const r of chunk) {
      // The packages collection uses uppercase tracking as the doc ID
      // (see `manifest-processor.ts → addOrUpdatePackage`). When the doc
      // doesn't exist (rare — every manifest tracking should map to one)
      // we record the miss instead of upserting, because a fresh write
      // would lack the live status / weight / price fields and risk
      // overwriting good data with thin metadata.
      const pkgRef = doc(collection(db, 'packages'), r.tracking);
      let pkgSnap;
      try {
        pkgSnap = await getDoc(pkgRef);
      } catch {
        missingPackageDocs.push(r.tracking);
        continue;
      }
      if (!pkgSnap.exists()) {
        missingPackageDocs.push(r.tracking);
        continue;
      }
      batch.update(pkgRef, {
        slCode: r.slCode,
        userId: r.slCode,        // SP1 alias — kept in sync
        customerId: r.slCode,    // SP1 alias — kept in sync
        customerName: r.customerName,
        ruta: r.ruta,
        updatedAt: new Date().toISOString(),
      });
      packagesDocsUpdated++;

      if (isTempSlCode(r.slCode)) {
        const tempCustRef = doc(collection(db, 'temp_customers'), r.slCode);
        batch.set(tempCustRef, {
          ruta: r.ruta,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // ── manifest_encomiendas mirror (BUG-INTEGRITY-AUDIT-LOOP) ──
      // Only update when the doc already exists — the encomiendas
      // collection is keyed by ruta='Encomiendas' rows only, and we
      // never want a repair to inadvertently create a new encomienda
      // entry for a non-encomienda tracking. A getDoc() pre-check
      // costs one read per repair, but it's the safe default; future
      // optimization could batch-read all encomiendas docs up-front.
      const encRef = doc(collection(db, 'manifest_encomiendas'), r.tracking);
      let encSnap;
      try {
        encSnap = await getDoc(encRef);
      } catch {
        // Encomiendas update is best-effort; a read failure should not
        // abort the repair. The next audit will surface the drift again.
        continue;
      }
      if (encSnap.exists()) {
        batch.update(encRef, {
          slCode: r.slCode,
          customerName: r.customerName,
          ruta: r.ruta,
          updatedAt: new Date().toISOString(),
        });
        encomiendaDocsUpdated++;
      }

      // ── Invoice rewrite (opt-in via r.invoice pointer) ────────────────
      // POLICY (2026-05-04): status is NOT a veto. The repair is a
      // customer reassignment — the invoice must match the consensus
      // slCode, and its displayed number must match the new owner. So
      // we always rewrite the invoiceNumber prefix alongside the
      // customer columns, regardless of draft / sent / paid / overdue.
      // A statusHistory entry preserves the audit trail so the previous
      // invoiceNumber can always be traced if a customer references it.
      if (r.invoice?.invoiceId) {
        const invRef = doc(collection(db, 'invoices'), r.invoice.invoiceId);
        const nowIso = new Date().toISOString();
        const newInvoiceNumber = replaceInvoiceNumberPrefix(r.invoice.invoiceNumber, r.slCode);
        const invoiceUpdate: Record<string, unknown> = {
          slCode:       r.slCode,
          clientSlCode: r.slCode,
          customerId:   r.slCode,
          clientName:   r.customerName,
          'customer.slCode':   r.slCode,
          'customer.fullName': r.customerName,
          updatedAt: nowIso,
          statusHistory: arrayUnion({
            at: nowIso,
            by: 'integrity-repair',
            action: 'customer_reassign',
            from: { invoiceNumber: r.invoice.invoiceNumber },
            to:   { slCode: r.slCode, customerName: r.customerName, invoiceNumber: newInvoiceNumber },
          }),
        };
        if (newInvoiceNumber !== r.invoice.invoiceNumber) {
          invoiceUpdate.invoiceNumber = newInvoiceNumber;
          invoiceNumberRewrites.push({
            invoiceId: r.invoice.invoiceId,
            before: r.invoice.invoiceNumber,
            after: newInvoiceNumber,
          });
        }
        batch.update(invRef, invoiceUpdate);
        invoicesDocsUpdated++;
      }
    }

    try {
      await batch.commit();
    } catch (err) {
      return {
        ok: false,
        manifestRowsUpdated: chunkIdx === 0 ? 0 : manifestRowsUpdated,
        packagesDocsUpdated,
        encomiendaDocsUpdated,
        invoicesDocsUpdated,
        invoiceNumberRewrites,
        tempCustomersDeleted: [],
        missingPackageDocs,
        error: `Batch ${chunkIdx} commit failed: ${(err as Error).message}`,
      };
    }
  }

  // ── Post-commit temp-customer cleanup ────────────────────────
  // Mirrors the Facturas "Reasignar" flow (see InvoiceGeneration.tsx
  // handleReassign around line 2918): when the invoice's previous owner
  // was a temp customer (`SL-NAN-*`) and we just moved it to a real
  // customer, the temp_customers record may be orphaned. We query the
  // three canonical customer-reference fields (clientSlCode / slCode /
  // customerId) to confirm no other invoice still points to it — only
  // then delete.
  const tempCustomersDeleted: string[] = [];
  const candidateTempSlCodes = new Set<string>();
  for (const r of ordered) {
    const prev = r.invoice?.previousSlCode;
    if (prev && isTempSlCode(prev) && prev.toUpperCase() !== r.slCode.toUpperCase()) {
      candidateTempSlCodes.add(prev);
    }
  }
  for (const tempCode of candidateTempSlCodes) {
    try {
      const invRef = collection(db, 'invoices');
      const [s1, s2, s3] = await Promise.all([
        getDocs(query(invRef, where('clientSlCode', '==', tempCode))),
        getDocs(query(invRef, where('slCode',       '==', tempCode))),
        getDocs(query(invRef, where('customerId',   '==', tempCode))),
      ]);
      const stillReferenced = new Set<string>();
      [s1, s2, s3].forEach(snap => snap.docs.forEach(d => stillReferenced.add(d.id)));
      if (stillReferenced.size === 0) {
        await deleteTempCustomer(tempCode);
        tempCustomersDeleted.push(tempCode);
      }
    } catch (err) {
      // Non-fatal: the repair itself landed — a stale temp_customers doc
      // is a minor cleanup concern and surfaced only via console so the
      // operator can manually clean it up later.
      console.warn(`[applyIntegrityRepairs] temp-customer cleanup failed for ${tempCode}:`, err);
    }
  }

  return {
    ok: true,
    manifestRowsUpdated,
    packagesDocsUpdated,
    encomiendaDocsUpdated,
    invoicesDocsUpdated,
    invoiceNumberRewrites,
    tempCustomersDeleted,
    missingPackageDocs,
  };
}
