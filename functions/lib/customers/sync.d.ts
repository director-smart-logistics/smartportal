/**
 * Customer Sync Functions
 *
 * Syncs customers from smart-portal-2 users collection to smart-portal-1 customers collection.
 * Runs every 3 hours via Cloud Scheduler.
 *
 * Features:
 * - Initial full sync of all users
 * - Incremental sync of new/updated users based on updatedAt
 * - No duplicate data - uses slCode as primary key
 * - Tracks sync version for conflict resolution
 * - Legacy address fallback (legacy_{slCode}_ pattern)
 * - Parallel batch processing (20 concurrent users)
 * - Schema templates for empty addresses/payment methods
 * - Auditable sync logs in _sync_logs collection
 *
 * @module functions/customers/sync
 */
/**
 * Sync stats interface
 */
interface SyncStats {
    totalProcessed: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    errorDetails: string[];
    addressesTotal: number;
    paymentMethodsTotal: number;
    mode: 'full' | 'incremental';
    startedAt: string;
    completedAt: string;
    durationMs: number;
}
/**
 * Scheduled function: Sync customers hourly
 * Schedule: every 1 hour to reduce operational read costs on Firestore
 */
/**
 * Callable function: Manual sync trigger
 * Allows admins to trigger sync manually
 */
export declare const triggerCustomerSync: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    stats: SyncStats;
}>, unknown>;
interface UpdateCustomerProfileRequest {
    slCode: string;
    fullName: string;
    email?: string;
    dni?: string | null;
    phone?: string | null;
    ruta?: string | null;
    syncRutaToSp2?: boolean;
}
export declare const slUpdateCustomerProfile: import("firebase-functions/v2/https").CallableFunction<UpdateCustomerProfileRequest, Promise<{
    success: boolean;
    sp1Updated: boolean;
    sp2Updated: boolean;
}>, unknown>;
/**
 * HTTP endpoint: Real-time customer upsert pushed from SP2 on user registration.
 *
 * SP2 calls this immediately when a new user document is created (via the
 * slUserProfileCreated Firestore trigger and slRegisterAccount HTTP endpoint),
 * eliminating the up-to-6-hour gap of the scheduled incremental poll.
 *
 * Auth:   x-sync-secret header must match SP2_SYNC_SECRET env var.
 * Body:   { user: SP2UserProfile }
 * Method: POST
 */
export declare const slSyncCustomerFromSp2: import("firebase-functions/v2/https").HttpsFunction;
/**
 * Callable endpoint: Force sync a customer from SP2 to SP1 by slCode.
 * Re-uses the bulk sync's `processUserDoc` logic to perform an immediate,
 * exact-match sync, responding to frontend manual override requests.
 */
export declare const slForceSyncCustomerFromSP2: import("firebase-functions/v2/https").CallableFunction<{
    slCode: string;
}, Promise<{
    success: boolean;
    customer: {
        id: string;
        slCode: any;
        email: any;
        fullName: any;
    };
}>, unknown>;
export {};
//# sourceMappingURL=sync.d.ts.map