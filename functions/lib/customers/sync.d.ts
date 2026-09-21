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
 * SP2 User Profile interface (source)
 */
interface SP2UserProfile {
    uid: string;
    slCode: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    email: string;
    phone?: string;
    photoURL?: string;
    dni?: string;
    location?: {
        province?: string;
        canton?: string;
        district?: string;
        city?: string;
        country: string;
    };
    country?: string;
    timezone?: string;
    ruta?: string;
    tier?: string;
    membershipTier?: string;
    memberSince?: string;
    membershipExpires?: string;
    role?: string;
    totalShipments?: number;
    pendingShipments?: number;
    status?: string;
    isVerified?: boolean;
    isActive?: boolean;
    emailVerified?: boolean;
    verifiedDni?: string;
    verifiedEmail?: string;
    verifiedPhone?: string;
    verificationSource?: string;
    dateOfVerification?: any;
    dateOfBirth?: string;
    birthDate?: string;
    nationality?: string;
    encomiendaProvider?: string;
    acceptMarketing?: boolean;
    preferredLanguage?: string;
    consolidationEnabled?: boolean;
    consolidationEnabledAt?: any;
    consolidationDisabledAt?: any;
    electronicInvoiceRequired?: boolean;
    migratedFromWordPress?: boolean;
    wpUserId?: number;
    createdAt: any;
    updatedAt: any;
    lastLoginAt?: any;
    syncRutaToSp1?: boolean;
    rutaUpdatedByAdmin?: boolean;
    rutaSetByAdminAt?: any;
    rutaLastUpdatedBy?: string;
    routeHistory?: any[];
}
/**
 * SP1 Customer interface (destination)
 */
interface SP1Customer {
    id: string;
    firebaseUid: string;
    slCode: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone?: string | null;
    photoURL?: string | null;
    dni?: string | null;
    location?: {
        province?: string;
        canton?: string;
        district?: string;
        city?: string;
        country: string;
    } | null;
    country: string;
    timezone?: string | null;
    ruta?: string | null;
    isRutaAdminLocked?: boolean | null;
    rutaSetByAdminAt?: string | null;
    rutaLastUpdatedBy?: string | null;
    routeHistory?: any[] | null;
    tier: string;
    membershipTier: string;
    memberSince?: string | null;
    membershipExpires?: string | null;
    role: string;
    totalShipments: number;
    pendingShipments: number;
    status: string;
    isVerified: boolean;
    isActive: boolean;
    emailVerified: boolean;
    verifiedDni?: string | null;
    verifiedEmail?: string | null;
    verifiedPhone?: string | null;
    verificationSource?: string | null;
    dateOfVerification?: string | null;
    birthDate?: string | null;
    nationality?: string | null;
    acceptMarketing: boolean;
    preferredLanguage: string;
    consolidationEnabled: boolean;
    consolidationEnabledAt?: string | null;
    consolidationDisabledAt?: string | null;
    electronicInvoiceRequired: boolean;
    migratedFromWordPress?: boolean;
    wpUserId?: number | null;
    isSynced: boolean;
    lastSyncAt: string;
    syncSource: string;
    syncVersion: number;
    sp1AdminUpdatedAt?: string | null;
    notes?: string | null;
    preferredRouteId?: string | null;
    preferredRoute?: {
        id: string;
        name: string;
        status: string;
    } | null;
    createdBy?: string | null;
    userCreatedBy?: {
        id: string;
        fullName: string;
        email: string;
    } | null;
    encomienda?: {
        id: string;
        name: string;
        phone?: string;
        pickupAddress?: string;
    } | null;
    encomiendaServiceName?: string | null;
    encomiendaProvider?: string | null;
    encomiendaUpdatedAt?: string | null;
    addresses?: SP1CustomerAddress[] | null;
    defaultAddress?: SP1CustomerAddress | null;
    hasAddresses?: boolean;
    paymentMethods?: SP1CustomerPaymentMethod[] | null;
    defaultPaymentMethod?: SP1CustomerPaymentMethod | null;
    hasPaymentMethods?: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt?: string | null;
    sp2CreatedAt?: string | null;
    sp2UpdatedAt?: string | null;
}
/**
 * SP1 Customer Payment Method interface
 */
interface SP1CustomerPaymentMethod {
    id: string;
    userId?: string;
    type: string;
    label: string;
    cardLast4?: string | null;
    cardBrand?: string | null;
    cardExpMonth?: number | null;
    cardExpYear?: number | null;
    sinpePhone?: string | null;
    bankName?: string | null;
    accountLast4?: string | null;
    isDefault: boolean;
    isActive: boolean;
    detail?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}
/**
 * SP1 Customer Address interface
 */
interface SP1CustomerAddress {
    id: string;
    userId: string;
    type: string;
    alias: string;
    country: string;
    province?: string | null;
    canton?: string | null;
    district?: string | null;
    city?: string | null;
    postalCode?: string | null;
    streetAddress: string;
    details?: string | null;
    coordinates?: {
        lat: number;
        lng: number;
        validated?: boolean;
    } | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    deliveryInstructions?: string | null;
    encomienda?: {
        id: string;
        name: string;
        phone?: string;
        pickupAddress?: string;
        schedule?: string;
    } | null;
    requiresEncomienda: boolean;
    status: string;
    isDefault: boolean;
    isActive: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
}
/**
 * Helper to resolve customer full name
 */
export declare function resolveCustomerFullNameHelper(firstName?: string | null, lastName?: string | null, displayName?: string | null): string;
/**
 * Transform SP2 User to SP1 Customer
 * Uses slCode as document ID (unique identifier)
 */
export declare function transformUserToCustomer(sp2User: SP2UserProfile, existingCustomer?: SP1Customer, addresses?: SP1CustomerAddress[], defaultAddress?: SP1CustomerAddress | null, paymentMethods?: SP1CustomerPaymentMethod[], defaultPaymentMethod?: SP1CustomerPaymentMethod | null): SP1Customer;
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
        fullName: string;
    };
}>, unknown>;
export {};
//# sourceMappingURL=sync.d.ts.map