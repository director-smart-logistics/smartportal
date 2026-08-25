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
export declare const slBackfillTrackingVariants: import("firebase-functions/v2/https").CallableFunction<BackfillRequest, Promise<BackfillResult>, unknown>;
export {};
//# sourceMappingURL=backfill-tracking-variants.d.ts.map