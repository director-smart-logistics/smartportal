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
export declare const slScannerLookup: import("firebase-functions/v2/https").CallableFunction<ScannerLookupRequest, Promise<ScannerLookupResult>, unknown>;
export {};
//# sourceMappingURL=scanner-lookup.d.ts.map