/**
 * Invoice Firestore triggers — SP1 → SP2 auto-sync safety net.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Historically, SP1 → SP2 invoice sync depended on every UI path remembering
 * to fire a `pushInvoiceStatusToSP2` / `syncInvoicesToSp2` call after each
 * mutation. Inevitably some paths (bulk merges, direct `firestoreApi.invoices
 * .update`, package-driven recalculations, etc.) forgot to do so, leaving
 * SP2 permanently desynced. Customer-facing data drifted.
 *
 * This trigger is the **canonical** propagation point: any write to
 * `invoices/{id}` on the `portal` database fires this function, which pushes
 * the current state of the doc to SP2 (idempotent — keyed by SP1 doc.id).
 *
 * ── ANTI-LOOP ────────────────────────────────────────────────────────────────
 * The sync is unidirectional: SP2 never writes back to SP1 invoices, so there
 * is no loop risk. We still skip writes that don't touch any SP2-relevant
 * field (e.g. internal-only flags) to avoid burning SP2 function quota.
 *
 * ── DRAFTS ──────────────────────────────────────────────────────────────────
 * Drafts are not pushed because SP2 customers should not see work-in-progress.
 * If a draft is later promoted to `sent`/`paid`/etc., this trigger will fire
 * again on the status change and push the now-syncable doc.
 *
 * @module functions/invoices/triggers
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";

// ── Config ──────────────────────────────────────────────────────────────────

const SP2_SYNC_URL =
  process.env.SP2_INVOICE_SYNC_URL ||
  "https://us-central1-smart-portal-2.cloudfunctions.net/slSyncInvoicesFromSp1";

// Fields whose value, if changed, must reach SP2 to keep the customer-facing
// invoice accurate. Keep this list aligned with the `buildPayload` mapping in
// `sync-invoices-service.ts` so we never miss a meaningful diff.
const SYNCED_FIELDS = [
  "status",
  "invoiceNumber",
  "totalAmount",
  "subtotalAmount",
  "taxAmount",
  "discountAmount",
  "discountPercentage",
  "currency",
  "exchangeRate",
  "amountCRC",
  "ivaEnabled",
  "ivaRate",
  "invoiceItems",
  "items",
  "trackingNumber",
  "trackingNumbers",
  "manifestNumber",
  "manifestNumbers",
  "packageCount",
  "totalWeight",
  "clientName",
  "clientEmail",
  "clientPhone",
  "clientDni",
  "clientSlCode",
  "slCode",
  "notes",
  "dueDate",
  "invoiceDate",
  "isConsolidation",
  "isMergedSingle",
] as const;

// Statuses that should be excluded from SP2 (customers must not see WIP or voided/cancelled documents).
const SP2_EXCLUDED_STATUSES = new Set(["draft", "annulled", "cancelled", "void", "deleted"]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function isTransitoria(pkg: any): boolean {
  if (!pkg) return false;
  const mId = String(pkg.manifestId || "").toLowerCase();
  const mNum = String(pkg.manifestNumber || "").toLowerCase();
  const uMf = String(pkg.updatedManifest || "").toLowerCase();
  return (
    mId === "consolidacion_transitoria" ||
    mNum === "consolidacion_transitoria" ||
    uMf === "consolidacion_transitoria"
  );
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function hasRelevantDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!before && after) return true;
  if (before && !after) return true;
  if (!before || !after) return false;
  for (const field of SYNCED_FIELDS) {
    if (!shallowEqual(before[field], after[field])) return true;
  }
  return false;
}

// ── Server-side self-heal of parallel field sets ────────────────────────────
//
// SP1 invoices historically carry two parallel sets of fields (SP1 vs Nova).
// Older code paths only update one set and forget the other, which then
// propagates to SP2 as wrong totals or phantom trackings.
//
// This helper computes the canonical values from `invoiceItems` (the single
// source of truth for what's in the invoice) and detects drift against the
// fields stored on the doc. It returns:
//   • a corrected snapshot suitable for the SP2 payload, AND
//   • an optional patch to write back to the SP1 doc so the local state
//     stays consistent for any future read.
//
// Anti-loop safety: the patch is only applied when at least one drift was
// detected (otherwise we'd retrigger ourselves on every read). The patch
// itself only touches Nova-style mirror fields + tracking metadata, never
// `invoiceItems` or `status`, so no other listeners get false positives.
interface LegacyDrift {
  corrected: Record<string, any>;
  patch:     Record<string, any> | null;
}

function normalizeInvoiceLegacyFields(data: Record<string, any>): LegacyDrift {
  const items: any[] = Array.isArray(data.invoiceItems) && data.invoiceItems.length > 0
    ? data.invoiceItems
    : Array.isArray(data.items) ? data.items : [];

  // Canonical totals derived from items. We DO NOT touch totalAmount /
  // subtotalAmount because those are computed by the callable that owns the
  // edit (it knows about discounts, IVA, CRC conversions, etc.). We only
  // mirror the canonical SP1 totals into the Nova-style mirror fields.
  const canonicalTotal    = Number(data.totalAmount    ?? data.amount    ?? 0);
  const canonicalSubtotal = Number(data.subtotalAmount ?? data.subtotal  ?? canonicalTotal);
  const canonicalIva      = Number(data.taxAmount      ?? data.iva       ?? 0);

  // Canonical tracking metadata derived strictly from items.
  const trackingsFromItems: string[] = Array.from(new Set(
    items
      .map((it) => it?.trackingNumber || it?.tracking)
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim()),
  ));
  const canonicalPackageCount = trackingsFromItems.length;
  const canonicalPrimaryTracking = trackingsFromItems.length === 1 ? trackingsFromItems[0] : null;

  const corrected: Record<string, any> = {
    ...data,
    amount:          canonicalTotal,
    subtotal:        canonicalSubtotal,
    iva:             canonicalIva,
    trackingNumbers: trackingsFromItems,
    trackingNumber:  canonicalPrimaryTracking,
    packageCount:    canonicalPackageCount,
  };

  // Detect drift to decide whether to write back. We only write back when
  // there's a real divergence so the trigger doesn't spam Firestore on
  // every benign update.
  const patch: Record<string, any> = {};
  if (Number(data.amount   ?? -1) !== canonicalTotal)    patch.amount   = canonicalTotal;
  if (Number(data.subtotal ?? -1) !== canonicalSubtotal) patch.subtotal = canonicalSubtotal;
  if (Number(data.iva      ?? -1) !== canonicalIva)      patch.iva      = canonicalIva;
  if (JSON.stringify(data.trackingNumbers ?? []) !== JSON.stringify(trackingsFromItems)) {
    patch.trackingNumbers = trackingsFromItems;
  }
  if ((data.trackingNumber ?? null) !== canonicalPrimaryTracking) {
    patch.trackingNumber = canonicalPrimaryTracking;
  }
  if (Number(data.packageCount ?? -1) !== canonicalPackageCount) {
    patch.packageCount = canonicalPackageCount;
  }

  return {
    corrected,
    patch: Object.keys(patch).length > 0 ? patch : null,
  };
}

function buildSp2Payload(
  data: Record<string, any>,
  invoiceId: string,
  overrideStatus?: string,
): Record<string, any> {
  const status = overrideStatus ?? data.status ?? "draft";
  return {
    id:              invoiceId,
    invoiceNumber:   data.invoiceNumber || invoiceId,
    slCode:          String(data.slCode || data.clientSlCode || data.customerId || "").trim(),
    clientName:      data.clientName  || "",
    clientEmail:     data.clientEmail || "",
    clientDni:       data.clientDni   || "",
    clientPhone:     data.clientPhone || "",
    status,
    amount:          data.amount        ?? data.totalAmount    ?? 0,
    subtotal:        data.subtotal      ?? data.subtotalAmount ?? 0,
    iva:             data.iva           ?? data.taxAmount      ?? 0,
    ivaRate:         data.ivaRate       ?? 0,
    ivaEnabled:      data.ivaEnabled    ?? false,
    currency:        data.currency      || "USD",
    exchangeRate:    data.exchangeRate  ?? null,
    amountCRC:       data.amountCRC     ?? null,
    discountAmount:      data.discountAmount      ?? 0,
    discountPercentage:  data.discountPercentage  ?? 0,
    trackingNumber:  data.trackingNumber  || null,
    trackingNumbers: data.trackingNumbers || null,
    isConsolidation: data.isConsolidation ?? false,
    isMergedSingle:  data.isMergedSingle  ?? false,
    manifestNumber:  data.manifestNumber  || null,
    manifestNumbers: data.manifestNumbers || null,
    invoiceItems:    data.invoiceItems    || data.items || [],
    packageCount:    data.packageCount    ?? null,
    totalWeight:     data.totalWeight     ?? null,
    invoiceDate:     data.invoiceDate     || null,
    dueDate:         data.dueDate         || null,
    notes:           data.notes           || null,
  };
}

async function pushToSp2(
  payload: Record<string, any>,
  contextLabel: string,
): Promise<void> {
  const secret = process.env.SP2_SYNC_SECRET || "";
  if (!secret) {
    logger.warn(`[invoice-trigger:${contextLabel}] SP2_SYNC_SECRET missing — skipping push`);
    return;
  }
  try {
    const res = await fetch(SP2_SYNC_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "x-sync-secret": secret,
      },
      body: JSON.stringify({ invoices: [payload] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(`[invoice-trigger:${contextLabel}] SP2 sync HTTP ${res.status}`, { body: body.slice(0, 300) });
      return;
    }
    const body = await res.json().catch(() => null) as any;
    const outcome = body?.results?.[0]?.outcome ?? "unknown";
    logger.info(`[invoice-trigger:${contextLabel}] SP2 sync ok`, {
      invoiceId: payload.id, outcome,
    });
  } catch (err: any) {
    logger.warn(`[invoice-trigger:${contextLabel}] SP2 sync error`, { error: err.message });
  }
}

// ── Package <-> Invoice link enforcement ────────────────────────────────────
//
// Business invariant (product-owner stated):
//
//   "Un paquete debe pertenecer a la factura activa más reciente que liste su
//    tracking. Si no hay activa, queda sin factura. Nunca huérfano cruzado.
//    Si admin lo movió de factura, la nueva debe ser la activa."
//
// The trigger keeps this invariant alive on every invoice write:
//   • When THIS invoice becomes/remains active and lists trackings:
//       for each tracked package owned by the same customer, point its
//       `invoiceId` / `invoiceNumber` to this invoice IF this invoice is the
//       most recent active one for that tracking (older active invoices, if
//       any, lose the link — they may need manual annulment but data stays
//       consistent in the meantime).
//   • When THIS invoice becomes inactive (annulled/cancelled/void) or the
//       trackings change:
//       any package still pointing to this invoice is re-linked to the next
//       most recent active invoice that lists its tracking, or cleared if
//       none exists.
//
// Idempotent: re-runs do nothing when the desired state is already in place.
// Anti-loop: only writes when the package's link actually needs to change.

const INACTIVE_INVOICE_STATUSES = new Set(["annulled", "cancelled", "void", "deleted"]);

interface InvoiceSummary {
  id: string;
  invoiceNumber: string | null;
  status: string;
  clientSlCode: string | null;
  createdAtMs: number;
}

function invSortKey(i: InvoiceSummary): number {
  return i.createdAtMs || 0;
}

function getStatusPriority(status: string): number {
  const STATUS_PRIORITIES: Record<string, number> = {
    paid: 3,
    sent: 2,
    overdue: 2,
    pending: 2,
    pending_payment: 2,
    draft: 1,
    annulled: 0,
    cancelled: 0,
    void: 0,
  };
  return STATUS_PRIORITIES[String(status).toLowerCase()] ?? 0;
}

async function findCandidateInvoicesForTracking(
  tracking: string,
  clientSlCode: string | null,
): Promise<InvoiceSummary[]> {
  const upper = tracking.toUpperCase();
  const results: InvoiceSummary[] = [];
  const seen = new Set<string>();

  // Use the canonical mirror array (kept in sync by self-heal) for an indexed
  // lookup. Fall back to the lower-case variant for legacy docs.
  // Important: we DO NOT filter by status here — the caller picks the
  // best candidate, preferring active but falling back to any status so a
  // package never stays orphaned just because its only invoice was annulled.
  const snaps = await Promise.all([
    db.collection("invoices").where("trackingNumbers", "array-contains", tracking).get(),
    upper !== tracking
      ? db.collection("invoices").where("trackingNumbers", "array-contains", upper).get()
      : Promise.resolve(null as unknown as FirebaseFirestore.QuerySnapshot),
  ]);

  for (const snap of snaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data();
      const status = String(data.status || "draft").toLowerCase();
      const invSl = String(data.clientSlCode || data.slCode || "").trim();
      if (clientSlCode && invSl && invSl !== clientSlCode) continue;
      const createdAt = data.createdAt;
      const createdAtMs = createdAt?.toMillis?.()
        ?? (typeof createdAt === "string" ? Date.parse(createdAt) : 0)
        ?? 0;
      results.push({
        id:            d.id,
        invoiceNumber: data.invoiceNumber || null,
        status,
        clientSlCode:  invSl || null,
        createdAtMs,
      });
    }
  }

  results.sort((a, b) => {
    const priorityA = getStatusPriority(a.status);
    const priorityB = getStatusPriority(b.status);
    if (priorityB !== priorityA) {
      return priorityB - priorityA;
    }
    return invSortKey(b) - invSortKey(a); // tie-breaker: newest first
  });
  return results;
}

function pickWinner(candidates: InvoiceSummary[]): InvoiceSummary | null {
  // Only prefer and return active invoices. If none are active, return null
  // so the package is correctly freed/unlinked from the dead invoice.
  const active = candidates.filter(c => !INACTIVE_INVOICE_STATUSES.has(c.status));
  return active[0] || null;
}

async function enforcePackageLinksForInvoice(
  invoiceId: string,
  invoiceData: Record<string, any>,
  beforeData: Record<string, any> | undefined,
): Promise<void> {
  const after = invoiceData;
  const status = String(after.status || "draft").toLowerCase();
  const afterTracks: string[] = Array.isArray(after.trackingNumbers) && after.trackingNumbers.length > 0
    ? after.trackingNumbers
    : (Array.isArray(after.invoiceItems)
       ? after.invoiceItems.map((it: { trackingNumber?: string; tracking?: string }) =>
           (it?.trackingNumber || it?.tracking || "")).filter((t: string) => !!t)
       : []);
  const beforeTracks: string[] = beforeData
    ? (Array.isArray(beforeData.trackingNumbers) && beforeData.trackingNumbers.length > 0
        ? beforeData.trackingNumbers
        : (Array.isArray(beforeData.invoiceItems)
           ? beforeData.invoiceItems.map((it: { trackingNumber?: string; tracking?: string }) =>
               (it?.trackingNumber || it?.tracking || "")).filter((t: string) => !!t)
           : []))
    : [];

  // Universe of trackings to reconcile: anything currently in the invoice,
  // plus anything that used to be there (so removed items get unlinked).
  const universe = new Set<string>();
  for (const t of [...afterTracks, ...beforeTracks]) {
    const norm = (t || "").trim();
    if (norm) universe.add(norm);
  }

  if (universe.size === 0) return;

  let linked = 0, relinked = 0, cleared = 0, skipped = 0;

  // Retrieve all matching packages in batches of up to 30 trackings (both raw and uppercase)
  const queryTerms = new Set<string>();
  for (const tracking of universe) {
    queryTerms.add(tracking);
    queryTerms.add(tracking.toUpperCase());
  }
  const queryTermsArray = Array.from(queryTerms);
  const chunks: string[][] = [];
  for (let i = 0; i < queryTermsArray.length; i += 30) {
    chunks.push(queryTermsArray.slice(i, i + 30));
  }

  const packagesDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const seenPkg = new Set<string>();
  const snaps = await Promise.all(
    chunks.map(chunk => db.collection("packages").where("trackingNumber", "in", chunk).get())
  );
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (!seenPkg.has(doc.id)) {
        seenPkg.add(doc.id);
        packagesDocs.push(doc);
      }
    }
  }

  // Index packages by tracking number (case-insensitive key)
  const packagesByTracking = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of packagesDocs) {
    const pkg = doc.data();
    const tNum = String(pkg.trackingNumber || "").trim();
    if (tNum) {
      const key = tNum.toUpperCase();
      if (!packagesByTracking.has(key)) {
        packagesByTracking.set(key, []);
      }
      packagesByTracking.get(key)!.push(doc);
    }
  }

  // Cache for candidate invoices query to avoid redundant fetches for same tracking/slCode
  const invoiceCandidatesCache = new Map<string, Promise<InvoiceSummary[]>>();
  const getInvoiceCandidates = (tracking: string, pkgSl: string | null) => {
    const cacheKey = `${tracking.toUpperCase()}:${pkgSl || ""}`;
    if (!invoiceCandidatesCache.has(cacheKey)) {
      invoiceCandidatesCache.set(cacheKey, findCandidateInvoicesForTracking(tracking, pkgSl));
    }
    return invoiceCandidatesCache.get(cacheKey)!;
  };

  for (const tracking of universe) {
    const key = tracking.toUpperCase();
    const pkgs = packagesByTracking.get(key) || [];
    if (pkgs.length === 0) continue;

    for (const pkgDoc of pkgs) {
      const pkg = pkgDoc.data();
      const pkgSl = String(pkg.clientSlCode || pkg.slCode || "").trim() || null;

      const isPkgTransitoria = isTransitoria(pkg);
      
      const currentInvId  = pkg.invoiceId     || null;
      const currentInvNum = pkg.invoiceNumber || null;
      const currentInvStatus = pkg.invoiceStatus || null;

      let winner: InvoiceSummary | null = null;

      // Atajo lógico: si el paquete ya estaba enlazado a esta factura, el estado de la factura
      // no cambió y el tracking sigue en la lista activa, esta factura sigue siendo el ganador.
      if (
        currentInvId === invoiceId &&
        beforeData?.status === after.status &&
        afterTracks.includes(tracking)
      ) {
        winner = {
          id: invoiceId,
          invoiceNumber: after.invoiceNumber || null,
          status: after.status,
          clientSlCode: pkgSl,
          createdAtMs: after.createdAt?.toMillis?.() ?? 0,
        };
      } else {
        const candidates = isPkgTransitoria ? [] : await getInvoiceCandidates(tracking, pkgSl);
        winner = isPkgTransitoria ? null : pickWinner(candidates);
      }

      let desiredInvId:  string | null = winner?.id            ?? null;
      let desiredInvNum: string | null = winner?.invoiceNumber ?? null;
      const desiredInvStatus = winner?.status || null;

      // If THIS invoice is active and the package belongs to its client and
      // it carries the tracking, the winner query already includes it. If
      // THIS invoice just became inactive, the winner query excludes it and
      // any older active sibling (if any) wins; otherwise winner=null and
      // the link clears.
      if (
        currentInvId === desiredInvId &&
        currentInvNum === desiredInvNum &&
        currentInvStatus === desiredInvStatus
      ) {
        skipped++;
        continue;
      }

      try {
        await pkgDoc.ref.update({
          invoiceId:     desiredInvId,
          invoiceNumber: desiredInvNum,
          invoiceStatus: winner?.status || null,
          invoiceLinkUpdatedAt: new Date().toISOString(),
          invoiceLinkSource:    `invoice-trigger:${invoiceId}`,
        });
        if (!currentInvId && desiredInvId) linked++;
        else if (currentInvId && desiredInvId && currentInvId !== desiredInvId) relinked++;
        else if (currentInvId && !desiredInvId) cleared++;
      } catch (err: any) {
        logger.warn("[invoice-trigger] package link patch failed", {
          pkgId: pkgDoc.id, tracking, error: err.message,
        });
      }
    }
  }

  if (linked || relinked || cleared) {
    logger.info("[invoice-trigger] package link enforcement", {
      invoiceId, status, linked, relinked, cleared, skipped,
    });
  }
}

// ── Trigger ─────────────────────────────────────────────────────────────────

/**
 * Auto-sync any change to an SP1 invoice into SP2.
 *
 * Behaviour matrix:
 *   • doc created with non-draft status → push as `created` to SP2
 *   • doc updated with relevant diff    → push as `updated` to SP2
 *   • doc deleted                       → push `deleted: true` to SP2 so it
 *                                          unlinks shipments + removes the doc
 *   • status flipped to 'draft'         → skipped (SP2 excludes drafts)
 *   • no relevant diff                  → skipped (saves SP2 quota)
 */
export const onInvoiceWritten = onDocumentWritten(
  {
    document: "invoices/{invoiceId}",
    database: "portal",
    region:   "us-central1",
    // Larger memory: SP2 endpoint can take ~5s under load. Default 256MB is
    // fine for the trigger itself; we keep the platform default to minimize
    // cold-start cost.
  },
  async (event) => {
    const invoiceId = event.params.invoiceId;
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();

    // ── Deletion ────────────────────────────────────────────────────────
    if (before && !after) {
      const invoiceNumber = String(before.invoiceNumber || invoiceId);
      logger.info("[invoice-trigger] Deletion detected", { invoiceId, invoiceNumber });
      await pushToSp2(
        {
          id:            invoiceId,
          invoiceNumber,
          slCode:        String(before.slCode || before.clientSlCode || "").trim(),
          clientName:    before.clientName || "",
          status:        "deleted",
          amount:        0,
          subtotal:      0,
          deleted:       true,
        },
        "delete",
      );
      // Re-link any package still pointing to this invoice to the next-best
      // active invoice (or clear) so the package never stays orphaned.
      await enforcePackageLinksForInvoice(invoiceId, { ...before, status: "deleted" }, before).catch((err) => {
        logger.warn("[invoice-trigger] post-delete package re-link failed", { invoiceId, error: err.message });
      });
      return;
    }

    if (!after) return;

    // ── Self-heal Nova-style parallel fields ────────────────────────────
    // Any write path that touched `invoiceItems` but forgot to also update
    // `amount` / `subtotal` / `iva` / `trackingNumbers` / `trackingNumber` /
    // `packageCount` is repaired here from the canonical totals + items
    // before the SP2 payload is built or check logic is run. The patch is
    // also written back to the SP1 doc so the next read sees consistent state.
    // Anti-loop: only writes when drift exists; only mutates mirror fields (never items).
    const { corrected, patch } = normalizeInvoiceLegacyFields(after);
    if (patch && event.data?.after?.ref) {
      try {
        await event.data.after.ref.update({
          ...patch,
          legacyFieldsHealedAt: new Date().toISOString(),
        });
        logger.info("[invoice-trigger] Auto-healed legacy fields", {
          invoiceId, fields: Object.keys(patch),
        });
      } catch (err: any) {
        logger.warn("[invoice-trigger] Auto-heal write failed", {
          invoiceId, error: err.message,
        });
      }
    }

    // ── Invoice client reassignment propagation ──────────────────────────
    const beforeSlCode = before ? String(before.slCode || before.clientSlCode || "").trim().toUpperCase() : "";
    const afterSlCode = String(corrected.slCode || corrected.clientSlCode || "").trim().toUpperCase();

    if (afterSlCode && beforeSlCode !== afterSlCode) {
      logger.info("[invoice-trigger] Invoice client reassignment detected", {
        invoiceId,
        fromSlCode: beforeSlCode,
        toSlCode: afterSlCode,
      });

      try {
        const customerDoc = await db.collection("customers").doc(afterSlCode).get();
        let custData = customerDoc.exists ? customerDoc.data() : null;
        let newCustomerId = customerDoc.exists ? customerDoc.id : null;

        if (!custData) {
          const fallbackSnap = await db.collection("customers").where("slCode", "==", afterSlCode).limit(1).get();
          if (!fallbackSnap.empty) {
            custData = fallbackSnap.docs[0].data();
            newCustomerId = fallbackSnap.docs[0].id;
          }
        }

        if (custData && newCustomerId) {
          const newCustomerName = String(custData.fullName || custData.name || "").trim() || afterSlCode;

          const trackings = Array.isArray(corrected.trackingNumbers) && corrected.trackingNumbers.length > 0
            ? corrected.trackingNumbers
            : (Array.isArray(corrected.invoiceItems)
               ? corrected.invoiceItems.map((it: { trackingNumber?: string; tracking?: string }) =>
                   (it?.trackingNumber || it?.tracking || "")).filter((t: string) => !!t)
               : []);

          if (trackings.length > 0) {
            const batch = db.batch();
            let pkgCount = 0;

            const pkgSnaps = await Promise.all(trackings.map(t =>
              db.collection("packages").where("trackingNumber", "==", t).get()
            ));

            for (const snap of pkgSnaps) {
              for (const doc of snap.docs) {
                const currentPkgData = doc.data();
                if (currentPkgData.slCode !== afterSlCode) {
                  batch.update(doc.ref, {
                    slCode: afterSlCode,
                    customerName: newCustomerName,
                    customerId: newCustomerId,
                    updatedAt: FieldValue.serverTimestamp(),
                  });
                  pkgCount++;
                }
              }
            }

            if (pkgCount > 0) {
              await batch.commit();
              logger.info(`[invoice-trigger] Reassigned ${pkgCount} packages in SP1 to target client ${afterSlCode}`, { invoiceId });
            }
          }
        }
      } catch (err: any) {
        logger.warn("[invoice-trigger] package reassignment failed", {
          invoiceId, error: err.message,
        });
      }
    }

    // ── Skip drafts/annulled (SP2 excludes them) ─────────────────────────
    const afterStatus = String(corrected.status ?? "draft");
    if (SP2_EXCLUDED_STATUSES.has(afterStatus)) {
      // If a previously-synced doc is downgraded/annulled, mark for delete
      // in SP2 so it disappears from the customer view. This is a rare path
      // (manual admin action) but consistent state matters.
      const wasActiveInSp2 = before && !SP2_EXCLUDED_STATUSES.has(String(before.status ?? "draft"));
      const isAnnulledOrDeleted = afterStatus !== "draft";

      if (wasActiveInSp2 || isAnnulledOrDeleted) {
        logger.info("[invoice-trigger] Annulled/cancelled/deleted or downgrade — propagating delete to SP2", { invoiceId, status: afterStatus });
        await pushToSp2(
          {
            id:            invoiceId,
            invoiceNumber: String(corrected.invoiceNumber || invoiceId),
            slCode:        String(corrected.slCode || corrected.clientSlCode || "").trim(),
            clientName:    corrected.clientName || "",
            status:        "deleted",
            amount:        0,
            subtotal:      0,
            deleted:       true,
          },
          "draft-downgrade-delete",
        );
      }
      // Re-link any package still pointing to this invoice to the next-best
      // active invoice (or clear) so the package never stays orphaned.
      await enforcePackageLinksForInvoice(invoiceId, corrected, before).catch((err) => {
        logger.warn("[invoice-trigger] post-exclusion package re-link failed", { invoiceId, error: err.message });
      });
      return;
    }

    // ── Skip writes with no SP2-relevant diff ───────────────────────────
    if (!hasRelevantDiff(before, corrected)) {
      return;
    }

    // ── Push ────────────────────────────────────────────────────────────
    const payload = buildSp2Payload(corrected, invoiceId);
    await pushToSp2(payload, before ? "update" : "create");

    // ── Enforce package <-> invoice link invariant ──────────────────────
    // Runs after the SP2 push so the customer-facing total is up to date by
    // the time the SP1 package metadata is patched. Fire-and-await: failure
    // is logged, not propagated, so a single bad package never blocks the
    // SP2 sync that already succeeded.
    await enforcePackageLinksForInvoice(invoiceId, corrected, before).catch((err) => {
      logger.warn("[invoice-trigger] package link enforcement failed", {
        invoiceId, error: err.message,
      });
    });
  },
);
