/**
 * Pre-Alert Sync Functions
 *
 * Syncs pre-alerts from smart-portal-2 (shipments where source='prealert')
 * to smart-portal-1 pre_alerts collection (portal database).
 *
 * Enrichment flow per tracking:
 *   1. Mayorista portal SearchByNumber (variants) → portalTracking (from JSON)
 *   2. Mayorista portal DetailByNumber  → extract canonicalTracking from HTML
 *      (30-digit 420XXXXX... form that api.milocker.net resolves)
 *   3. MLCargo API /Tracking/Get with canonicalTracking → weight, manifest, description
 *   4. MLCargo API /Tracking/GetTrackingRecordsLike   → status history events
 *
 * Stores both:
 *   - tracking         → original tracking entered by user in SP2
 *   - canonicalTracking → resolved 30-digit USPS canonical (for MLCargo lookup)
 *
 * Schedule: 4x/day — 00:00, 06:00, 12:00, 18:00 Costa Rica time
 * Key: SP2 shipment doc ID (stable: {trackingNorm}_{userId8})
 *
 * @module functions/prealerts/sync
 */
interface SyncStats {
    created: number;
    updated: number;
    skipped: number;
    enriched: number;
    errors: number;
    errorDetails: string[];
    mode: "full" | "incremental";
    startedAt: string;
    completedAt: string;
    durationMs: number;
}
/**
 * Scheduled function: Sync pre-alerts 4 times per day
 * 00:00, 06:00, 12:00, 18:00 Costa Rica time
 */
export declare const syncPreAlertsFromSP2: import("firebase-functions/v2/scheduler").ScheduleFunction;
/**
 * Callable function: Manual pre-alert sync trigger
 * Supports: { force: true } for full sync
 */
export declare const triggerPreAlertSync: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    stats: SyncStats;
}>, unknown>;
export {};
//# sourceMappingURL=sync.d.ts.map