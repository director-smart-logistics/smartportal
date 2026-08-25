/**
 * Tracking Variants Generator (server-side)
 * ─────────────────────────────────────────
 * Mirror of `client/lib/utils/tracking-variants.ts` for use in Cloud Functions
 * (manifest ingestion, scanner lookup, backfill). Keep in sync with the client
 * version — both must produce identical output for a given input so a package
 * created from either side is searchable by the same set of variants.
 *
 * Capped at 30 entries to fit Firestore's `array-contains-any` / `in` limit.
 */
export declare function buildTrackingVariants(raw: string): string[];
//# sourceMappingURL=tracking-variants.d.ts.map