/**
 * Backfill Tracking Variants
 * ──────────────────────────
 * One-shot admin utility that walks the `packages` collection in batches and
 * computes/persists `trackingVariants: string[]` for every document that does
 * not yet have it. Run iteratively from the SP1 admin UI (or via the Firebase
 * console) until `done === true`.
 *
 * Designed to be safe to interrupt and resume — uses `__name__` as the cursor
 * and only updates `trackingVariants` (no other field changes), so re-running
 * the same batch is idempotent.
 *
 * Restricted to SUPER_ADMIN / ADMIN custom claims.
 */

import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { buildTrackingVariants } from "../lib/tracking-variants";

interface BackfillRequest {
  /** Number of docs to process per call. Default 200, max 500. */
  batchSize?: number;
  /** docId to resume after — pass the `nextCursor` from the previous call. */
  startAfter?: string;
  /** When true, recompute variants even if the field already exists. */
  force?: boolean;
}

interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  done: boolean;
  /** Pass to the next call as `startAfter` to resume. */
  nextCursor?: string;
  /** Sample of updated docIds for verification (max 5). */
  sampleUpdated?: string[];
}

const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);

export const slBackfillTrackingVariants = onCall<BackfillRequest, Promise<BackfillResult>>(
  { cors: true, timeoutSeconds: 540, memory: "512MiB" },
  async (request: CallableRequest<BackfillRequest>) => {
    const role = (request.auth?.token as Record<string, unknown> | undefined)?.role;
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      throw new HttpsError(
        "permission-denied",
        "slBackfillTrackingVariants requires SUPER_ADMIN or ADMIN role",
      );
    }

    const batchSize = Math.min(Math.max(request.data?.batchSize ?? 200, 1), 500);
    const startAfter = request.data?.startAfter;
    const force = request.data?.force === true;

    let q = db
      .collection("packages")
      .orderBy("__name__")
      .limit(batchSize);
    if (startAfter) {
      q = q.startAfter(startAfter);
    }

    const snapshot = await q.get();
    if (snapshot.empty) {
      return { scanned: 0, updated: 0, skipped: 0, errors: 0, done: true };
    }

    const batch = db.batch();
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const sampleUpdated: string[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      const existing = data.trackingVariants;
      if (!force && Array.isArray(existing) && existing.length > 0) {
        skipped++;
        continue;
      }

      const trackingSource =
        (typeof data.tracking === "string" && data.tracking) ||
        (typeof data.trackingNumber === "string" && data.trackingNumber) ||
        docSnap.id;

      try {
        const variants = buildTrackingVariants(String(trackingSource));
        if (variants.length === 0) {
          skipped++;
          continue;
        }
        batch.update(docSnap.ref, { trackingVariants: variants });
        updated++;
        if (sampleUpdated.length < 5) sampleUpdated.push(docSnap.id);
      } catch (err) {
        logger.warn("[slBackfillTrackingVariants] doc failed", {
          id: docSnap.id,
          err,
        });
        errors++;
      }
    }

    try {
      if (updated > 0) {
        await batch.commit();
      }
    } catch (err) {
      logger.error("[slBackfillTrackingVariants] commit failed", { err });
      throw new HttpsError("internal", "Batch commit failed");
    }

    const lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
    const done = snapshot.size < batchSize;

    logger.info("[slBackfillTrackingVariants] batch done", {
      scanned: snapshot.size,
      updated,
      skipped,
      errors,
      done,
      lastDocId,
    });

    return {
      scanned: snapshot.size,
      updated,
      skipped,
      errors,
      done,
      nextCursor: done ? undefined : lastDocId,
      sampleUpdated,
    };
  },
);
