/**
 * Public Scanner Lookup
 * ─────────────────────
 * Read-only package lookup by tracking number for the public `/scanner/bodega`
 * kiosk URL.  Does NOT require Firebase Auth — the function only returns the
 * minimum fields the scanner UI needs to render (tracking, ruta, slCode,
 * customerName, status, weight, requiresPermit, consolidacion).  All
 * financial / customer-contact fields are intentionally omitted.
 *
 * Lookup strategy (in priority order):
 *   1. Direct doc-ID match across all carrier-specific variants.
 *   2. `array-contains-any` on the persisted `trackingVariants` field — this
 *      catches partial scans (e.g. only the visible USPS portion of a 420-
 *      prefixed composite) for any package that has been ingested with the
 *      variants index. Backfilled packages are matchable too.
 *   3. Legacy `where('trackingNumber' / 'tracking', 'in', variants)` fallback
 *      for packages predating the variants index.
 *
 * Anonymous calls accepted via `invoker: 'public'`; rate-limit responsibility
 * lies with the Cloud Functions platform default quotas.
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { buildTrackingVariants } from "../lib/tracking-variants";

interface ScannerLookupRequest {
  tracking: string;
}

interface ScannerLookupResult {
  found: boolean;
  data?: {
    tracking: string;
    ruta: string;
    customerName: string;
    slCode: string;
    status: string;
    requiresPermit: boolean;
    consolidationEnabled: boolean;
    pendingUserAssignment: boolean;
    weight?: number;
    manifestNumber?: string;
  };
}

export const slScannerLookup = onCall<ScannerLookupRequest, Promise<ScannerLookupResult>>(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<ScannerLookupRequest>) => {
    const raw = request.data?.tracking;
    if (!raw || typeof raw !== "string") {
      throw new HttpsError("invalid-argument", "tracking is required");
    }

    const variants = buildTrackingVariants(raw);
    if (variants.length === 0) {
      throw new HttpsError("invalid-argument", "tracking too short");
    }

    const upper = variants[0];
    logger.info("[slScannerLookup] lookup", {
      raw,
      variantCount: variants.length,
      variants: variants.slice(0, 10),
    });

    const pkgRef = db.collection("packages");
    let docData: FirebaseFirestore.DocumentData | null = null;
    let matchedDocRef: FirebaseFirestore.DocumentReference | null = null;
    let matchedBy = "";

    // ── 1. Parallel doc-ID lookup across all variants ──────────────────────
    const docResults = await Promise.allSettled(
      variants.map((id: string) => pkgRef.doc(id).get()),
    );
    for (let i = 0; i < docResults.length; i++) {
      const r = docResults[i];
      if (r.status === "fulfilled" && r.value.exists) {
        docData = r.value.data() || null;
        matchedDocRef = r.value.ref;
        matchedBy = `docId=${variants[i]}`;
        break;
      }
    }

    // ── 2. array-contains-any against persisted trackingVariants ──────────
    if (!docData) {
      try {
        const snap = await pkgRef
          .where("trackingVariants", "array-contains-any", variants.slice(0, 30))
          .limit(1)
          .get();
        if (!snap.empty) {
          docData = snap.docs[0].data();
          matchedDocRef = snap.docs[0].ref;
          matchedBy = `trackingVariants array-contains-any`;
        }
      } catch (err) {
        logger.warn("[slScannerLookup] array-contains-any failed", { err });
      }
    }

    // ── 3. Legacy field-equality fallback ─────────────────────────────────
    if (!docData) {
      const inResults = await Promise.allSettled([
        pkgRef.where("trackingNumber", "in", variants).limit(1).get(),
        pkgRef.where("tracking", "in", variants).limit(1).get(),
      ]);
      const fields = ["trackingNumber", "tracking"];
      for (let i = 0; i < inResults.length; i++) {
        const r = inResults[i];
        if (r.status === "fulfilled" && !r.value.empty) {
          docData = r.value.docs[0].data();
          matchedDocRef = r.value.docs[0].ref;
          matchedBy = `${fields[i]} in [...]`;
          break;
        } else if (r.status === "rejected") {
          logger.warn("[slScannerLookup] field-in query failed", {
            field: fields[i],
            err: r.reason,
          });
        }
      }
    }

    if (!docData) {
      logger.info("[slScannerLookup] not found", { upper, variants });
      return { found: false };
    }

    logger.info("[slScannerLookup] match", { upper, matchedBy });

    // Securely update package status to 'received' and scannedAt directly inside Cloud Function
    if (matchedDocRef) {
      try {
        const currentStatus = String(docData.status || "");
        const protectedStatuses = ["delivered", "processed", "returned", "pickup"];
        if (!protectedStatuses.includes(currentStatus)) {
          await matchedDocRef.update({
            status: "received",
            scannedAt: Date.now(),
            updatedAt: new Date().toISOString(),
          });
          logger.info("[slScannerLookup] successfully updated status to received", { path: matchedDocRef.path });
          // Mutate local data so returned payload has the updated received state
          docData.status = "received";
          docData.scannedAt = Date.now();
        } else {
          logger.info("[slScannerLookup] package status is protected, skipping received update", { path: matchedDocRef.path, status: currentStatus });
        }
      } catch (err) {
        logger.error("[slScannerLookup] failed to update package status in firestore", { path: matchedDocRef.path, err });
      }
    }

    const ruta = docData.ruta || docData.pendingRoute || docData.pendingZona || "";

    return {
      found: true,
      data: {
        tracking: String(docData.tracking || docData.trackingNumber || upper),
        ruta: String(ruta),
        customerName: String(docData.customerName || docData.pendingCustomerName || ""),
        slCode: String(docData.slCode || ""),
        status: String(docData.status || "received"),
        requiresPermit: Boolean(docData.requiresPermit),
        consolidationEnabled: Boolean(docData.consolidacion || docData.consolidationEnabled),
        pendingUserAssignment: Boolean(docData.pendingUserAssignment),
        weight: typeof docData.weight === "number" ? docData.weight : undefined,
        manifestNumber: docData.manifestNumber ? String(docData.manifestNumber) : undefined,
      },
    };
  },
);
