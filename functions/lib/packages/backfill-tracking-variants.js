"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.slBackfillTrackingVariants = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firebase_1 = require("../config/firebase");
const tracking_variants_1 = require("../lib/tracking-variants");
const ALLOWED_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
exports.slBackfillTrackingVariants = (0, https_1.onCall)({ cors: true, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    const role = request.auth?.token?.role;
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
        throw new https_1.HttpsError("permission-denied", "slBackfillTrackingVariants requires SUPER_ADMIN or ADMIN role");
    }
    const batchSize = Math.min(Math.max(request.data?.batchSize ?? 200, 1), 500);
    const startAfter = request.data?.startAfter;
    const force = request.data?.force === true;
    let q = firebase_1.db
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
    const batch = firebase_1.db.batch();
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const sampleUpdated = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data() || {};
        const existing = data.trackingVariants;
        if (!force && Array.isArray(existing) && existing.length > 0) {
            skipped++;
            continue;
        }
        const trackingSource = (typeof data.tracking === "string" && data.tracking) ||
            (typeof data.trackingNumber === "string" && data.trackingNumber) ||
            docSnap.id;
        try {
            const variants = (0, tracking_variants_1.buildTrackingVariants)(String(trackingSource));
            if (variants.length === 0) {
                skipped++;
                continue;
            }
            batch.update(docSnap.ref, { trackingVariants: variants });
            updated++;
            if (sampleUpdated.length < 5)
                sampleUpdated.push(docSnap.id);
        }
        catch (err) {
            v2_1.logger.warn("[slBackfillTrackingVariants] doc failed", {
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
    }
    catch (err) {
        v2_1.logger.error("[slBackfillTrackingVariants] commit failed", { err });
        throw new https_1.HttpsError("internal", "Batch commit failed");
    }
    const lastDocId = snapshot.docs[snapshot.docs.length - 1].id;
    const done = snapshot.size < batchSize;
    v2_1.logger.info("[slBackfillTrackingVariants] batch done", {
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
});
//# sourceMappingURL=backfill-tracking-variants.js.map