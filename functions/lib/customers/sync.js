"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.slForceSyncCustomerFromSP2 = exports.slSyncCustomerFromSp2 = exports.slUpdateCustomerProfile = exports.triggerCustomerSync = void 0;
// import { onSchedule } from "firebase-functions/v2/scheduler";
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
// SP2 Firebase project configuration
const SP2_PROJECT_ID = "smart-portal-2";
// Initialize SP2 Firestore (secondary app)
let sp2Db = null;
/**
 * Get SP2 Firestore instance
 * Uses service account for cross-project access
 */
function getSp2Firestore() {
    if (sp2Db)
        return sp2Db;
    const sp2AppName = "smart-portal-2";
    const existingApp = (0, app_1.getApps)().find(app => app.name === sp2AppName);
    if (existingApp) {
        sp2Db = (0, firestore_1.getFirestore)(existingApp);
    }
    else {
        // Initialize SP2 app with service account
        // The service account JSON should be stored in environment or Secret Manager
        const sp2App = (0, app_1.initializeApp)({
            projectId: SP2_PROJECT_ID,
        }, sp2AppName);
        sp2Db = (0, firestore_1.getFirestore)(sp2App);
    }
    return sp2Db;
}
// SP1 Firestore — uses named database "portal" (not default)
const sp1Db = (0, firestore_1.getFirestore)((0, app_1.getApp)(), "portal");
/**
 * Transform SP2 Payment Method to SP1 Customer Payment Method
 */
function transformPaymentMethodToCustomerPaymentMethod(sp2PaymentMethod) {
    return {
        id: sp2PaymentMethod.id,
        userId: sp2PaymentMethod.userId,
        type: sp2PaymentMethod.type || 'cash',
        label: sp2PaymentMethod.label || 'Método de pago',
        cardLast4: sp2PaymentMethod.cardLast4 || null,
        cardBrand: sp2PaymentMethod.cardBrand || null,
        cardExpMonth: sp2PaymentMethod.cardExpMonth || null,
        cardExpYear: sp2PaymentMethod.cardExpYear || null,
        sinpePhone: sp2PaymentMethod.sinpePhone || null,
        bankName: sp2PaymentMethod.bankName || null,
        accountLast4: sp2PaymentMethod.accountLast4 || null,
        isDefault: sp2PaymentMethod.isDefault || false,
        isActive: sp2PaymentMethod.isActive !== false,
        detail: sp2PaymentMethod.detail || null,
        createdAt: toISOString(sp2PaymentMethod.createdAt),
        updatedAt: toISOString(sp2PaymentMethod.updatedAt),
    };
}
/**
 * Transform SP2 Address to SP1 Customer Address
 */
/**
 * Merge SP2-derived addresses with the existing SP1 customer addresses,
 * preserving SP1-only fields that the SP2 schema doesn't track.
 *
 * BUG FIX (2026-05-04): the scheduled `syncCustomersFromSP2` was wiping
 * `addresses[].encomienda` and `addresses[].requiresEncomienda` on every run
 * because SP2's address documents don't carry those fields — they're managed
 * exclusively by SP1 admins (e.g. when assigning a courier service to a
 * customer in the EncomiendaManifests view). Without this merge, every 30
 * minutes the cron would overwrite the SP1-set encomienda with `null`.
 *
 * Match strategy: by `id` first (stable across syncs), then by a normalised
 * (province|canton|district|streetAddress) tuple as a fallback for legacy
 * addresses without ids.
 */
function preserveSp1AddressFields(sp2Addresses, existingAddresses) {
    if (!existingAddresses || existingAddresses.length === 0)
        return sp2Addresses;
    const byId = new Map();
    const byShape = new Map();
    const shape = (a) => [
        (a.province || '').trim().toLowerCase(),
        (a.canton || '').trim().toLowerCase(),
        (a.district || '').trim().toLowerCase(),
        (a.streetAddress || '').trim().toLowerCase(),
    ].join('|');
    for (const ex of existingAddresses) {
        if (ex?.id)
            byId.set(ex.id, ex);
        byShape.set(shape(ex), ex);
    }
    return sp2Addresses.map(addr => {
        const existing = (addr.id && byId.get(addr.id)) || byShape.get(shape(addr));
        if (!existing)
            return addr;
        return {
            ...addr,
            // Preserve SP1-managed encomienda when SP2 has none
            encomienda: addr.encomienda ?? existing.encomienda ?? null,
            requiresEncomienda: addr.requiresEncomienda || existing.requiresEncomienda || false,
            // Preserve SP1-validated coordinates when SP2 hasn't validated them
            coordinates: addr.coordinates?.validated
                ? addr.coordinates
                : (existing.coordinates?.validated ? existing.coordinates : addr.coordinates),
        };
    });
}
function transformAddressToCustomerAddress(sp2Address) {
    const raw = sp2Address;
    return {
        id: sp2Address.id,
        userId: sp2Address.userId,
        type: sp2Address.type || 'residence',
        alias: sp2Address.alias || 'Dirección',
        country: sp2Address.country || 'Costa Rica',
        province: sp2Address.province || raw.provincia || null,
        canton: sp2Address.canton || raw.canton || null,
        district: sp2Address.district || raw.distrito || null,
        city: sp2Address.city || raw.ciudad || null,
        postalCode: sp2Address.postalCode || null,
        streetAddress: sp2Address.streetAddress || sp2Address.detail || raw.addressDetail || raw.direccionExacta || raw.direccion || '',
        details: sp2Address.details || raw.addressDetail || null,
        coordinates: sp2Address.coordinates || null,
        recipientName: sp2Address.recipientName || sp2Address.contactName || null,
        recipientPhone: sp2Address.recipientPhone || sp2Address.contactPhone || null,
        deliveryInstructions: sp2Address.deliveryInstructions || sp2Address.deliveryNotes || null,
        encomienda: sp2Address.encomienda || null,
        requiresEncomienda: sp2Address.requiresEncomienda || false,
        status: sp2Address.status || 'active',
        isDefault: sp2Address.isDefault ?? sp2Address.isPrimary ?? false,
        isActive: sp2Address.isActive !== false,
        createdAt: toISOString(sp2Address.createdAt),
        updatedAt: toISOString(sp2Address.updatedAt),
    };
}
/**
 * Convert Firestore Timestamp to ISO string
 */
function toISOString(timestamp) {
    if (!timestamp)
        return null;
    if (timestamp instanceof firestore_1.Timestamp) {
        return timestamp.toDate().toISOString();
    }
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toISOString();
    }
    if (typeof timestamp === 'object' && timestamp !== null) {
        const sec = timestamp.seconds ?? timestamp._seconds;
        if (typeof sec === 'number') {
            return new Date(sec * 1000).toISOString();
        }
    }
    if (typeof timestamp === 'string') {
        return timestamp;
    }
    if (timestamp instanceof Date) {
        return timestamp.toISOString();
    }
    return null;
}
/**
 * Transform SP2 User to SP1 Customer
 * Uses slCode as document ID (unique identifier)
 */
function transformUserToCustomer(sp2User, existingCustomer, addresses, defaultAddress, paymentMethods, defaultPaymentMethod) {
    const now = new Date().toISOString();
    // BUG-NAME-FROM-DISPLAYNAME evolution (Rule C, 2026-04-28):
    // - Rule A (legacy): displayName || firstName+lastName — broke for SP2
    //   handles like "Fran92MJ (Fran92MJ)" overwriting "Francisco Mejia".
    // - Rule B (0.0.591): firstName+lastName || displayName — broke for SP1
    //   customers with empty lastName: "Jesus" + "" + "JESUS ARRIETA CLAVERIA"
    //   produced fullName="Jesus", destroying Nova name-based matching at scale.
    // - Rule C (this fix): prefer displayName ONLY when it has strictly MORE
    //   name tokens than firstName+lastName AND does NOT look like a handle
    //   (no digits, no special chars, no repeated tokens). Otherwise use the
    //   structured form. This is the SINGLE SOURCE OF TRUTH for fullName
    //   resolution — mirrored verbatim in:
    //     - client/lib/utils/customer-name.ts (tested in customer-name.spec.ts)
    //     - functions/scripts/run-customer-sync.ts
    //   Any rule change here MUST be ported to those copies and the tests.
    const looksLikeHandle = (n) => {
        const c = n.trim();
        if (!c)
            return false;
        if (/\d/.test(c))
            return true;
        if (/[(){}\[\]<>@#$]/.test(c))
            return true;
        const tokens = c.split(/\s+/).map(t => t.replace(/[()[\]{}<>]/g, ''));
        if (tokens.length === 2 && tokens[0].length > 0 &&
            tokens[0].toUpperCase() === tokens[1].toUpperCase())
            return true;
        return false;
    };
    const computedName = `${(sp2User.firstName || '').trim()} ${(sp2User.lastName || '').trim()}`.trim();
    const display = (sp2User.displayName || '').trim();
    const computedTokens = computedName ? computedName.split(/\s+/).length : 0;
    const displayTokens = display ? display.split(/\s+/).length : 0;
    const fullName = (display && !looksLikeHandle(display) && displayTokens > computedTokens)
        ? display
        : (computedName || display || 'Usuario');
    const initialRouteHistory = [];
    if (!existingCustomer && sp2User.ruta) {
        initialRouteHistory.push({
            previousRuta: null,
            newRuta: sp2User.ruta,
            changedAt: now,
            changedBy: sp2User.rutaLastUpdatedBy || 'system',
            source: sp2User.rutaUpdatedByAdmin ? 'sp2_admin' : 'sp2_auto',
            direction: 'sp2_to_sp1'
        });
    }
    return {
        id: sp2User.slCode, // Use slCode as document ID (unique, no duplicates)
        firebaseUid: sp2User.uid,
        slCode: sp2User.slCode || '',
        firstName: sp2User.firstName || '',
        lastName: sp2User.lastName || '',
        fullName,
        email: sp2User.email || '',
        phone: sp2User.phone || null,
        photoURL: sp2User.photoURL || null,
        dni: sp2User.dni || null,
        location: sp2User.location || (sp2User.provincia ? {
            province: sp2User.provincia,
            canton: sp2User.canton,
            district: sp2User.distrito,
            city: sp2User.direccionExacta || sp2User.direccion,
            country: sp2User.country || 'Costa Rica',
        } : null),
        provincia: sp2User.provincia || sp2User.location?.province || null,
        canton: sp2User.canton || sp2User.location?.canton || null,
        distrito: sp2User.distrito || sp2User.location?.district || null,
        direccionExacta: sp2User.direccionExacta || sp2User.location?.addressDetail || sp2User.location?.detail || sp2User.direccion || null,
        country: sp2User.country || sp2User.location?.country || 'Costa Rica',
        timezone: sp2User.timezone || null,
        ruta: sp2User.ruta || null,
        isRutaAdminLocked: existingCustomer?.isRutaAdminLocked ?? (sp2User.rutaUpdatedByAdmin ? true : false),
        rutaSetByAdminAt: existingCustomer?.rutaSetByAdminAt ?? toISOString(sp2User.rutaSetByAdminAt) ?? null,
        rutaLastUpdatedBy: existingCustomer?.rutaLastUpdatedBy ?? sp2User.rutaLastUpdatedBy ?? null,
        routeHistory: existingCustomer?.routeHistory ?? initialRouteHistory,
        tier: sp2User.tier || sp2User.membershipTier || 'basic',
        membershipTier: sp2User.membershipTier || sp2User.tier || 'basic',
        memberSince: sp2User.memberSince || null,
        membershipExpires: sp2User.membershipExpires || null,
        role: sp2User.role || 'customer',
        totalShipments: sp2User.totalShipments || 0,
        pendingShipments: sp2User.pendingShipments || 0,
        status: sp2User.status || 'active',
        isVerified: sp2User.isVerified || false,
        isActive: sp2User.isActive !== false,
        emailVerified: sp2User.emailVerified || false,
        verifiedDni: sp2User.verifiedDni || null,
        verifiedEmail: sp2User.verifiedEmail || null,
        verifiedPhone: sp2User.verifiedPhone || null,
        verificationSource: sp2User.verificationSource || null,
        dateOfVerification: toISOString(sp2User.dateOfVerification),
        birthDate: sp2User.birthDate || sp2User.dateOfBirth || null,
        nationality: sp2User.nationality || null,
        encomiendaProvider: sp2User.encomiendaProvider || null,
        encomiendaServiceName: sp2User.encomiendaProvider || null,
        acceptMarketing: sp2User.acceptMarketing ?? false,
        preferredLanguage: sp2User.preferredLanguage || 'es',
        consolidationEnabled: sp2User.consolidationEnabled || false,
        consolidationEnabledAt: toISOString(sp2User.consolidationEnabledAt) || null,
        consolidationDisabledAt: toISOString(sp2User.consolidationDisabledAt) || null,
        electronicInvoiceRequired: sp2User.electronicInvoiceRequired || false,
        migratedFromWordPress: sp2User.migratedFromWordPress || false,
        wpUserId: sp2User.wpUserId || null,
        // Addresses from SP2
        addresses: addresses || [],
        defaultAddress: defaultAddress || null,
        hasAddresses: (addresses?.length ?? 0) > 0 && addresses?.[0]?.id !== '',
        // Payment Methods from SP2
        paymentMethods: paymentMethods || [],
        defaultPaymentMethod: defaultPaymentMethod || null,
        hasPaymentMethods: (paymentMethods?.length ?? 0) > 0 && paymentMethods?.[0]?.id !== '',
        isSynced: true,
        lastSyncAt: now,
        syncSource: 'smart-portal-2',
        syncVersion: (existingCustomer?.syncVersion || 0) + 1,
        createdAt: existingCustomer?.createdAt || toISOString(sp2User.createdAt) || now,
        updatedAt: now,
        lastLoginAt: toISOString(sp2User.lastLoginAt),
        sp2CreatedAt: existingCustomer?.sp2CreatedAt || toISOString(sp2User.createdAt) || now,
        sp2UpdatedAt: toISOString(sp2User.updatedAt),
    };
}
/**
 * Scheduled function: Sync customers hourly
 * Schedule: every 1 hour to reduce operational read costs on Firestore
 */
// export const syncCustomersFromSP2 = onSchedule({
//   schedule: "0 * * * *", // Every hour
//   timeZone: "America/Costa_Rica",
//   memory: "512MiB",
//   timeoutSeconds: 540, // 9 minutes max
//   retryCount: 3,
// }, async (event) => {
//   console.log("[CustomerSync] Starting scheduled sync...");
//   
//   const stats = await performSync();
// 
//   await logSyncResults(stats);
// 
//   console.log(
//     `[CustomerSync] Completed [${stats.mode}]: ` +
//     `${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ` +
//     `${stats.errors} errors | ` +
//     `${stats.addressesTotal} addresses, ${stats.paymentMethodsTotal} payment methods | ` +
//     `${(stats.durationMs / 1000).toFixed(1)}s`
//   );
// });
/**
 * Callable function: Manual sync trigger
 * Allows admins to trigger sync manually
 */
exports.triggerCustomerSync = (0, https_1.onCall)({
    memory: "512MiB",
    timeoutSeconds: 540,
}, async (request) => {
    // Verify admin role
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Authentication required");
    }
    const userRole = request.auth.token.role;
    if (userRole !== "ADMIN" && userRole !== "admin") {
        throw new https_1.HttpsError("permission-denied", "Admin access required");
    }
    console.log(`[CustomerSync] Manual sync triggered by ${request.auth.uid}`);
    const isFullSync = request.data?.full === true;
    const stats = await performSync(isFullSync);
    await logSyncResults(stats);
    return {
        success: true,
        stats,
    };
});
// ── Schema templates — ensure all fields visible in Firestore even when empty ─
function createEmptyAddressSchema() {
    return {
        id: '',
        userId: '',
        type: '',
        alias: '',
        country: '',
        province: null,
        canton: null,
        district: null,
        city: null,
        postalCode: null,
        streetAddress: '',
        details: null,
        coordinates: null,
        recipientName: null,
        recipientPhone: null,
        deliveryInstructions: null,
        encomienda: null,
        requiresEncomienda: false,
        status: '',
        isDefault: false,
        isActive: false,
        createdAt: null,
        updatedAt: null,
    };
}
function createEmptyPaymentMethodSchema() {
    return {
        id: '',
        userId: '',
        type: '',
        label: '',
        cardLast4: null,
        cardBrand: null,
        cardExpMonth: null,
        cardExpYear: null,
        sinpePhone: null,
        bankName: null,
        accountLast4: null,
        isDefault: false,
        isActive: false,
        detail: null,
        createdAt: null,
        updatedAt: null,
    };
}
/**
 * Remove undefined values — Firestore does not accept undefined fields
 */
function removeUndefined(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
/**
 * Extracted user processing logic to be shared between bulk sync and single-user force sync.
 */
async function processUserDoc(doc, sp2Firestore, stats) {
    const sp2User = doc.data();
    sp2User.uid = doc.id;
    if (!sp2User.email || !sp2User.slCode) {
        stats.skipped++;
        return;
    }
    // Transform addresses
    const addresses = [];
    let defaultAddress = null;
    const rawAddresses = sp2User.addresses;
    if (Array.isArray(rawAddresses)) {
        for (const addrData of rawAddresses) {
            const addr = transformAddressToCustomerAddress(addrData);
            addresses.push(addr);
            stats.addressesTotal++;
            if (addr.isDefault && addr.isActive)
                defaultAddress = addr;
        }
    }
    else {
        // Fetch addresses — with legacy fallback
        let addressesSnapshot = await sp2Firestore
            .collection('addresses')
            .where('userId', '==', sp2User.uid)
            .get();
        if (addressesSnapshot.empty) {
            const legacyPattern = `legacy_${sp2User.slCode}_`;
            addressesSnapshot = await sp2Firestore
                .collection('addresses')
                .where('userId', '>=', legacyPattern)
                .where('userId', '<', legacyPattern + '\uf8ff')
                .get();
        }
        for (const addressDoc of addressesSnapshot.docs) {
            const sp2Address = { ...addressDoc.data(), id: addressDoc.id };
            const addr = transformAddressToCustomerAddress(sp2Address);
            addresses.push(addr);
            stats.addressesTotal++;
            if (addr.isDefault && addr.isActive)
                defaultAddress = addr;
        }
    }
    if (!defaultAddress && addresses.length > 0) {
        defaultAddress = addresses.find(a => a.isActive) || addresses[0];
    }
    // Transform payment methods
    const paymentMethods = [];
    let defaultPaymentMethod = null;
    const rawPaymentMethods = sp2User.paymentMethods;
    if (Array.isArray(rawPaymentMethods)) {
        for (const pmData of rawPaymentMethods) {
            const pm = transformPaymentMethodToCustomerPaymentMethod(pmData);
            paymentMethods.push(pm);
            stats.paymentMethodsTotal++;
            if (pm.isDefault && pm.isActive)
                defaultPaymentMethod = pm;
        }
    }
    else {
        const paymentMethodsSnapshot = await sp2Firestore
            .collection('payment_methods')
            .where('userId', '==', sp2User.uid)
            .get();
        for (const pmDoc of paymentMethodsSnapshot.docs) {
            const sp2PM = { ...pmDoc.data(), id: pmDoc.id };
            const pm = transformPaymentMethodToCustomerPaymentMethod(sp2PM);
            paymentMethods.push(pm);
            stats.paymentMethodsTotal++;
            if (pm.isDefault && pm.isActive)
                defaultPaymentMethod = pm;
        }
    }
    if (!defaultPaymentMethod && paymentMethods.length > 0) {
        defaultPaymentMethod = paymentMethods.find(pm => pm.isActive) || paymentMethods[0];
    }
    const customerRef = sp1Db.collection('customers').doc(sp2User.slCode);
    const existingDoc = await customerRef.get();
    const existingCustomer = existingDoc.exists ? existingDoc.data() : undefined;
    // Preserve SP1-only address fields (encomienda, requiresEncomienda,
    // validated coordinates) BEFORE transforming — otherwise the scheduled
    // sync would wipe SP1 admin's encomienda assignment every 30 minutes.
    const mergedAddresses = preserveSp1AddressFields(addresses, existingCustomer?.addresses ?? undefined);
    const mergedDefaultAddress = defaultAddress
        ? (mergedAddresses.find(a => a.id === defaultAddress.id) ?? defaultAddress)
        : null;
    const customer = transformUserToCustomer(sp2User, existingCustomer, mergedAddresses.length > 0 ? mergedAddresses : [createEmptyAddressSchema()], mergedDefaultAddress || createEmptyAddressSchema(), paymentMethods.length > 0 ? paymentMethods : [createEmptyPaymentMethodSchema()], defaultPaymentMethod || createEmptyPaymentMethodSchema());
    const cleanCustomer = removeUndefined(customer);
    if (existingCustomer) {
        // Other contact fields: SP1 admin prevails if sp1AdminUpdatedAt > SP2 updatedAt
        const sp1AdminTs = existingCustomer.sp1AdminUpdatedAt
            ? new Date(existingCustomer.sp1AdminUpdatedAt).getTime()
            : 0;
        const sp2UpdatedTs = sp2User.updatedAt
            ? (sp2User.updatedAt instanceof firestore_1.Timestamp
                ? sp2User.updatedAt.toMillis()
                : new Date(sp2User.updatedAt).getTime())
            : 0;
        const sp1IsNewer = sp1AdminTs > 0 && sp1AdminTs >= sp2UpdatedTs;
        // ── Priority rules ────────────────────────────────────────────────────
        // SP1 MANDATE: SP1 customer `ruta` is master logistics data managed by operators in SP1.
        // By default, SP2 sync does NOT update ruta in SP1 unless explicitly authorized by the SP2 Admin.
        let rutaToUse = existingCustomer.ruta || null;
        let isRutaAdminLocked = existingCustomer.isRutaAdminLocked || false;
        let rutaSetByAdminAt = existingCustomer.rutaSetByAdminAt || null;
        let rutaLastUpdatedBy = existingCustomer.rutaLastUpdatedBy || null;
        let updatedRouteHistory = Array.isArray(existingCustomer.routeHistory) ? [...existingCustomer.routeHistory] : [];
        if (sp2User.syncRutaToSp1 === true && sp2User.ruta) {
            const sp1AdminTime = existingCustomer.rutaSetByAdminAt ? new Date(existingCustomer.rutaSetByAdminAt).getTime() : 0;
            const sp2AdminTime = sp2User.rutaSetByAdminAt ? (sp2User.rutaSetByAdminAt instanceof firestore_1.Timestamp ? sp2User.rutaSetByAdminAt.toMillis() : new Date(sp2User.rutaSetByAdminAt).getTime()) : 0;
            if (sp2AdminTime >= sp1AdminTime) {
                rutaToUse = sp2User.ruta;
                isRutaAdminLocked = true;
                rutaSetByAdminAt = toISOString(sp2User.rutaSetByAdminAt);
                rutaLastUpdatedBy = sp2User.rutaLastUpdatedBy || 'sp2_admin';
                if (existingCustomer.ruta !== rutaToUse) {
                    updatedRouteHistory.push({
                        previousRuta: existingCustomer.ruta || null,
                        newRuta: rutaToUse,
                        changedAt: new Date().toISOString(),
                        changedBy: rutaLastUpdatedBy,
                        source: 'sp2_admin',
                        direction: 'sp2_to_sp1'
                    });
                }
            }
        }
        const emailToUse = sp1IsNewer ? (existingCustomer.email || sp2User.email || '') : (sp2User.email || existingCustomer.email || '');
        const dniToUse = sp1IsNewer ? (existingCustomer.dni || sp2User.dni || null) : (sp2User.dni || existingCustomer.dni || null);
        const phoneToUse = sp1IsNewer ? (existingCustomer.phone || sp2User.phone || null) : (sp2User.phone || existingCustomer.phone || null);
        const fullNameToUse = sp1IsNewer ? existingCustomer.fullName : cleanCustomer.fullName;
        const firstToUse = sp1IsNewer ? existingCustomer.firstName : cleanCustomer.firstName;
        const lastToUse = sp1IsNewer ? existingCustomer.lastName : cleanCustomer.lastName;
        const updatedData = removeUndefined({
            ...cleanCustomer,
            ruta: rutaToUse,
            isRutaAdminLocked: isRutaAdminLocked,
            rutaSetByAdminAt: rutaSetByAdminAt,
            rutaLastUpdatedBy: rutaLastUpdatedBy,
            routeHistory: updatedRouteHistory,
            email: emailToUse,
            dni: dniToUse,
            phone: phoneToUse,
            fullName: fullNameToUse,
            firstName: firstToUse,
            lastName: lastToUse,
            // Preserve SP1 admin marker
            sp1AdminUpdatedAt: existingCustomer.sp1AdminUpdatedAt ?? null,
            // Always preserve SP1-only fields
            notes: existingCustomer.notes ?? null,
            preferredRouteId: existingCustomer.preferredRouteId ?? null,
            preferredRoute: existingCustomer.preferredRoute ?? null,
            createdBy: existingCustomer.createdBy ?? null,
            userCreatedBy: existingCustomer.userCreatedBy ?? null,
            // ── SP1-only encomienda top-level mirror (defensive preservation) ──
            encomienda: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomienda || existingCustomer.encomienda || null) : null,
            encomiendaServiceName: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaServiceName || existingCustomer.encomiendaServiceName || null) : null,
            encomiendaProvider: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaProvider || existingCustomer.encomiendaProvider || null) : null,
            encomiendaUpdatedAt: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaUpdatedAt || existingCustomer.encomiendaUpdatedAt || null) : null,
        });
        // Diff check to avoid loop triggers and save writes
        let hasDiff = false;
        for (const [key, val] of Object.entries(updatedData)) {
            if (JSON.stringify(existingCustomer[key]) !== JSON.stringify(val)) {
                hasDiff = true;
                break;
            }
        }
        if (hasDiff) {
            await customerRef.update(updatedData);
            stats.updated++;
        }
        else {
            stats.skipped++;
        }
    }
    else {
        await customerRef.set(cleanCustomer);
        stats.created++;
    }
}
/**
 * Perform the actual sync operation
 */
async function performSync(forceFullSync = false) {
    const startTime = Date.now();
    const stats = {
        totalProcessed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
        addressesTotal: 0,
        paymentMethodsTotal: 0,
        mode: 'full',
        startedAt: new Date().toISOString(),
        completedAt: '',
        durationMs: 0,
    };
    try {
        const sp2Firestore = getSp2Firestore();
        // ── Determine sync window ──────────────────────────────────────────────────
        const syncMetaRef = sp1Db.collection('_sync_metadata').doc('customers');
        const syncMeta = await syncMetaRef.get();
        const lastSyncAt = (!forceFullSync && syncMeta.exists)
            ? (syncMeta.data()?.lastSyncAt || null)
            : null;
        console.log(`[CustomerSync] Last sync: ${lastSyncAt || 'Never — running full sync'}`);
        // ── Collect SP2 user IDs that need syncing ─────────────────────────────────
        let userDocs = [];
        if (lastSyncAt) {
            stats.mode = 'incremental';
            const since = firestore_1.Timestamp.fromDate(new Date(lastSyncAt));
            const userIdsToSync = new Set();
            // 1. Users with updated profile
            const updatedUsers = await sp2Firestore.collection('users')
                .where('updatedAt', '>', since).get();
            updatedUsers.forEach(d => userIdsToSync.add(d.id));
            console.log(`[CustomerSync] Users with profile changes: ${updatedUsers.size}`);
            // 1b. BUG-S3: defensive fallback — also check createdAt > since to catch new users
            // whose updatedAt was stored as {} (empty map) instead of a Timestamp due to
            // JSON.stringify stripping serverTimestamp() sentinels in SP2's user-service.ts.
            // Without this, new registrations are invisible to the incremental sync indefinitely.
            const newUsers = await sp2Firestore.collection('users')
                .where('createdAt', '>', since).get();
            newUsers.forEach(d => userIdsToSync.add(d.id));
            console.log(`[CustomerSync] New users (createdAt fallback): ${newUsers.size}`);
            // 2. Users with updated addresses
            const updatedAddresses = await sp2Firestore.collection('addresses')
                .where('updatedAt', '>', since).get();
            updatedAddresses.forEach(d => {
                const uid = d.data().userId;
                if (uid)
                    userIdsToSync.add(uid);
            });
            console.log(`[CustomerSync] Addresses updated: ${updatedAddresses.size}`);
            // 3. Users with updated payment methods
            const updatedPM = await sp2Firestore.collection('payment_methods')
                .where('updatedAt', '>', since).get();
            updatedPM.forEach(d => {
                const uid = d.data().userId;
                if (uid)
                    userIdsToSync.add(uid);
            });
            console.log(`[CustomerSync] Payment methods updated: ${updatedPM.size}`);
            // 4. Users with updated pre-alerts
            try {
                const updatedPrealerts = await sp2Firestore.collection('prealerts')
                    .where('createdAt', '>', since).get();
                updatedPrealerts.forEach(d => {
                    const uid = d.data().userId;
                    if (uid)
                        userIdsToSync.add(uid);
                });
                console.log(`[CustomerSync] Prealerts checked: ${updatedPrealerts.size}`);
            }
            catch (err) {
                console.warn('[CustomerSync] Error checking prealerts:', err);
            }
            console.log(`[CustomerSync] Total unique users to sync: ${userIdsToSync.size}`);
            if (userIdsToSync.size === 0) {
                console.log('[CustomerSync] No changes detected since last sync. Done.');
                stats.completedAt = new Date().toISOString();
                stats.durationMs = Date.now() - startTime;
                return stats;
            }
            // Fetch those specific user docs (whereIn in batches of 10)
            const userIdArray = Array.from(userIdsToSync);
            for (let i = 0; i < userIdArray.length; i += 10) {
                const batch = userIdArray.slice(i, i + 10);
                const snapshot = await sp2Firestore
                    .collection('users')
                    .where(firestore_1.FieldPath.documentId(), 'in', batch)
                    .get();
                userDocs.push(...snapshot.docs);
            }
        }
        else {
            // Full sync — paginate through all users
            stats.mode = 'full';
            const PAGE_SIZE = 500;
            let lastDoc = null;
            let hasMore = true;
            while (hasMore) {
                let q = sp2Firestore.collection('users').limit(PAGE_SIZE);
                if (lastDoc)
                    q = q.startAfter(lastDoc);
                const snapshot = await q.get();
                if (snapshot.empty) {
                    hasMore = false;
                }
                else {
                    userDocs.push(...snapshot.docs);
                    lastDoc = snapshot.docs[snapshot.docs.length - 1];
                    hasMore = snapshot.docs.length === PAGE_SIZE;
                }
            }
            console.log(`[CustomerSync] Full sync — found ${userDocs.length} total users`);
        }
        const totalUsers = userDocs.length;
        const CONCURRENT = 20;
        // ── Process a single user ──────────────────────────────────────────────────
        const processUser = async (doc) => {
            await processUserDoc(doc, sp2Firestore, stats);
        };
        // ── Parallel batch processing (CONCURRENT users at a time) ─────────────────
        for (let i = 0; i < userDocs.length; i += CONCURRENT) {
            const batch = userDocs.slice(i, i + CONCURRENT);
            const results = await Promise.allSettled(batch.map(d => processUser(d)));
            for (let j = 0; j < results.length; j++) {
                stats.totalProcessed++;
                if (results[j].status === 'rejected') {
                    stats.errors++;
                    const reason = results[j].reason;
                    stats.errorDetails.push(`${batch[j].id}: ${reason?.message ?? reason}`);
                    if (stats.errors <= 5) {
                        console.error(`[CustomerSync] Error ${batch[j].id}:`, reason?.message ?? reason);
                    }
                }
            }
            if (stats.totalProcessed % 100 === 0 || stats.totalProcessed === totalUsers) {
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = stats.totalProcessed / elapsed;
                const remaining = totalUsers - stats.totalProcessed;
                const eta = rate > 0 ? Math.round(remaining / rate) : 0;
                const pct = ((stats.totalProcessed / totalUsers) * 100).toFixed(1);
                console.log(`[CustomerSync] ${pct}% (${stats.totalProcessed}/${totalUsers}) | ` +
                    `✅ ${stats.created} created | ♻️ ${stats.updated} updated | ` +
                    `⏭️ ${stats.skipped} skipped | ETA: ${eta}s`);
            }
        }
        // ── Update sync metadata ───────────────────────────────────────────────────
        const syncEndTime = new Date().toISOString();
        await syncMetaRef.set({
            lastSyncAt: syncEndTime,
            lastSyncStats: {
                created: stats.created,
                updated: stats.updated,
                skipped: stats.skipped,
                errors: stats.errors,
                addressesTotal: stats.addressesTotal,
                paymentMethodsTotal: stats.paymentMethodsTotal,
                mode: stats.mode,
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[CustomerSync] Sync metadata updated — next run will be incremental from: ${syncEndTime}`);
    }
    catch (error) {
        stats.errors++;
        stats.errorDetails.push(`Fatal: ${error.message}`);
        console.error('[CustomerSync] Fatal error:', error);
    }
    stats.completedAt = new Date().toISOString();
    stats.durationMs = Date.now() - startTime;
    return stats;
}
exports.slUpdateCustomerProfile = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { slCode, fullName, email, dni, phone, ruta, syncRutaToSp2 } = request.data;
    if (!slCode)
        throw new https_1.HttpsError("invalid-argument", "slCode is required");
    if (!fullName)
        throw new https_1.HttpsError("invalid-argument", "fullName is required");
    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const now = firestore_1.FieldValue.serverTimestamp();
    const updatePayload = {
        fullName: fullName.trim(),
        firstName,
        lastName,
        email: email?.trim() ?? null,
        dni: dni?.trim() || null,
        phone: phone?.trim() || null,
        ruta: ruta?.trim() || null,
        updatedAt: now,
        sp1AdminUpdatedAt: now,
    };
    let sp1Updated = false;
    let sp2Updated = false;
    // ── SP1: customers collection (admin SDK, "portal" db) ────────────────────
    try {
        const sp1Snap = await sp1Db.collection("customers")
            .where("slCode", "==", slCode).limit(1).get();
        if (!sp1Snap.empty) {
            await sp1Snap.docs[0].ref.update(updatePayload);
            sp1Updated = true;
        }
        else {
            throw new https_1.HttpsError("not-found", `SP1: no customer with slCode="${slCode}"`);
        }
    }
    catch (e) {
        if (e instanceof https_1.HttpsError)
            throw e;
        throw new https_1.HttpsError("internal", `SP1 update failed: ${e.message}`);
    }
    // ── SP2: users collection (admin SDK, default db) ─────────────────────────
    try {
        const sp2Firestore = getSp2Firestore();
        const sp2Snap = await sp2Firestore.collection("users")
            .where("slCode", "==", slCode).limit(1).get();
        if (!sp2Snap.empty) {
            const sp2Payload = {
                firstName,
                lastName,
                displayName: fullName.trim(),
                email: email?.trim() ?? null,
                dni: dni?.trim() || null,
                phone: phone?.trim() || null,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                sp1LastPushAt: firestore_1.FieldValue.serverTimestamp(),
                profileLastUpdatedBy: request.auth?.token?.email || request.auth?.uid || "SP1",
            };
            // SP1 MANDATE: Only update SP2's ruta if explicitly opted-in by admin (syncRutaToSp2 === true)
            if (syncRutaToSp2) {
                sp2Payload.ruta = ruta?.trim() || null;
                sp2Payload.rutaLastUpdatedBy = request.auth?.token?.email || request.auth?.uid || "SP1";
            }
            await sp2Snap.docs[0].ref.update(sp2Payload);
            sp2Updated = true;
        }
    }
    catch (e) {
        // SP2 is best-effort — SP1 already succeeded, log and continue
        console.warn(`[slUpdateCustomerProfile] SP2 update failed for ${slCode}:`, e);
    }
    return { success: true, sp1Updated, sp2Updated };
});
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
exports.slSyncCustomerFromSp2 = (0, https_1.onRequest)({ cors: false, invoker: 'public', memory: '256MiB', timeoutSeconds: 30 }, async (req, res) => {
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-sync-secret');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ success: false, error: 'Method not allowed' });
        return;
    }
    const incomingSecret = req.headers['x-sync-secret'];
    const expectedSecret = process.env.SP2_SYNC_SECRET;
    if (!expectedSecret || incomingSecret !== expectedSecret) {
        console.warn('[slSyncCustomerFromSp2] Unauthorized attempt', { ip: req.ip });
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
    }
    try {
        const sp2User = req.body?.user;
        if (!sp2User?.slCode || !sp2User?.email) {
            res.status(400).json({ success: false, error: 'Missing required fields: slCode, email' });
            return;
        }
        if (!sp2User.uid)
            sp2User.uid = sp2User.slCode;
        const customerRef = sp1Db.collection('customers').doc(sp2User.slCode);
        const existingDoc = await customerRef.get();
        const existingCustomer = existingDoc.exists ? existingDoc.data() : undefined;
        // Check if incoming user object contains denormalized addresses/payment methods
        let addresses = [];
        const rawAddresses = sp2User.addresses;
        if (Array.isArray(rawAddresses)) {
            for (const addrData of rawAddresses) {
                addresses.push(transformAddressToCustomerAddress(addrData));
            }
        }
        else {
            addresses = (existingCustomer?.addresses ?? []).filter((a) => a.id);
        }
        let paymentMethods = [];
        const rawPaymentMethods = sp2User.paymentMethods;
        if (Array.isArray(rawPaymentMethods)) {
            for (const pmData of rawPaymentMethods) {
                paymentMethods.push(transformPaymentMethodToCustomerPaymentMethod(pmData));
            }
        }
        else {
            paymentMethods = (existingCustomer?.paymentMethods ?? []).filter((p) => p.id);
        }
        const defaultAddress = addresses.find((a) => a.isDefault && a.isActive) ?? addresses[0] ?? createEmptyAddressSchema();
        const defaultPaymentMethod = paymentMethods.find((p) => p.isDefault && p.isActive) ?? paymentMethods[0] ?? createEmptyPaymentMethodSchema();
        const customer = transformUserToCustomer(sp2User, existingCustomer, addresses.length ? addresses : [createEmptyAddressSchema()], defaultAddress, paymentMethods.length ? paymentMethods : [createEmptyPaymentMethodSchema()], defaultPaymentMethod);
        const cleanCustomer = removeUndefined(customer);
        if (existingCustomer) {
            const sp1AdminTs = existingCustomer.sp1AdminUpdatedAt
                ? new Date(existingCustomer.sp1AdminUpdatedAt).getTime() : 0;
            const sp2UpdatedTs = sp2User.updatedAt
                ? (sp2User.updatedAt instanceof firestore_1.Timestamp
                    ? sp2User.updatedAt.toMillis()
                    : new Date(String(sp2User.updatedAt)).getTime())
                : 0;
            const sp1IsNewer = sp1AdminTs > 0 && sp1AdminTs >= sp2UpdatedTs;
            // ── Priority rules ────────────────────────────────────────────────────
            // SP1 MANDATE: SP1 customer `ruta` is master logistics data managed by operators in SP1.
            // By default, SP2 sync does NOT update ruta in SP1 unless explicitly authorized by the SP2 Admin.
            let rutaToUse = existingCustomer.ruta || null;
            let isRutaAdminLocked = existingCustomer.isRutaAdminLocked || false;
            let rutaSetByAdminAt = existingCustomer.rutaSetByAdminAt || null;
            let rutaLastUpdatedBy = existingCustomer.rutaLastUpdatedBy || null;
            let updatedRouteHistory = Array.isArray(existingCustomer.routeHistory) ? [...existingCustomer.routeHistory] : [];
            if (sp2User.syncRutaToSp1 === true && sp2User.ruta) {
                const sp1AdminTime = existingCustomer.rutaSetByAdminAt ? new Date(existingCustomer.rutaSetByAdminAt).getTime() : 0;
                const sp2AdminTime = sp2User.rutaSetByAdminAt ? (sp2User.rutaSetByAdminAt instanceof firestore_1.Timestamp ? sp2User.rutaSetByAdminAt.toMillis() : new Date(sp2User.rutaSetByAdminAt).getTime()) : 0;
                if (sp2AdminTime >= sp1AdminTime) {
                    rutaToUse = sp2User.ruta;
                    isRutaAdminLocked = true;
                    rutaSetByAdminAt = toISOString(sp2User.rutaSetByAdminAt);
                    rutaLastUpdatedBy = sp2User.rutaLastUpdatedBy || 'sp2_admin';
                    if (existingCustomer.ruta !== rutaToUse) {
                        updatedRouteHistory.push({
                            previousRuta: existingCustomer.ruta || null,
                            newRuta: rutaToUse,
                            changedAt: new Date().toISOString(),
                            changedBy: rutaLastUpdatedBy,
                            source: 'sp2_admin',
                            direction: 'sp2_to_sp1'
                        });
                    }
                }
            }
            const updatedData = removeUndefined({
                ...cleanCustomer,
                ruta: rutaToUse,
                isRutaAdminLocked: isRutaAdminLocked,
                rutaSetByAdminAt: rutaSetByAdminAt,
                rutaLastUpdatedBy: rutaLastUpdatedBy,
                routeHistory: updatedRouteHistory,
                email: sp1IsNewer ? (existingCustomer.email || sp2User.email || '') : (sp2User.email || existingCustomer.email || ''),
                dni: sp1IsNewer ? (existingCustomer.dni || sp2User.dni || null) : (sp2User.dni || existingCustomer.dni || null),
                phone: sp1IsNewer ? (existingCustomer.phone || sp2User.phone || null) : (sp2User.phone || existingCustomer.phone || null),
                fullName: sp1IsNewer ? existingCustomer.fullName : cleanCustomer.fullName,
                firstName: sp1IsNewer ? existingCustomer.firstName : cleanCustomer.firstName,
                lastName: sp1IsNewer ? existingCustomer.lastName : cleanCustomer.lastName,
                notes: existingCustomer.notes ?? null,
                preferredRouteId: existingCustomer.preferredRouteId ?? null,
                preferredRoute: existingCustomer.preferredRoute ?? null,
                createdBy: existingCustomer.createdBy ?? null,
                userCreatedBy: existingCustomer.userCreatedBy ?? null,
                sp1AdminUpdatedAt: existingCustomer.sp1AdminUpdatedAt ?? null,
                // ── Encomienda sync rule ────────────────────────────────────────────────
                encomienda: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomienda || existingCustomer.encomienda || null) : null,
                encomiendaServiceName: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaServiceName || existingCustomer.encomiendaServiceName || null) : null,
                encomiendaProvider: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaProvider || existingCustomer.encomiendaProvider || null) : null,
                encomiendaUpdatedAt: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaUpdatedAt || existingCustomer.encomiendaUpdatedAt || null) : null,
            });
            // Diff check to avoid loop triggers and save writes
            let hasDiff = false;
            for (const [key, val] of Object.entries(updatedData)) {
                if (JSON.stringify(existingCustomer[key]) !== JSON.stringify(val)) {
                    hasDiff = true;
                    break;
                }
            }
            if (hasDiff) {
                await customerRef.update(updatedData);
                console.log(`[slSyncCustomerFromSp2] Updated: ${sp2User.slCode}`);
            }
            else {
                console.log(`[slSyncCustomerFromSp2] No changes detected for ${sp2User.slCode}. Skipping update.`);
            }
            res.status(200).json({ success: true, slCode: sp2User.slCode, action: 'updated' });
        }
        else {
            await customerRef.set(cleanCustomer);
            console.log(`[slSyncCustomerFromSp2] Created: ${sp2User.slCode}`);
            res.status(201).json({ success: true, slCode: sp2User.slCode, action: 'created' });
        }
    }
    catch (error) {
        console.error('[slSyncCustomerFromSp2] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * Log sync results to Firestore for auditing
 */
async function logSyncResults(stats) {
    try {
        await sp1Db.collection('_sync_logs').add({
            type: 'customers',
            source: 'smart-portal-2',
            destination: 'smart-portal-1',
            ...stats,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        console.error("[CustomerSync] Failed to log sync results:", error);
    }
}
/**
 * Callable endpoint: Force sync a customer from SP2 to SP1 by slCode.
 * Re-uses the bulk sync's `processUserDoc` logic to perform an immediate,
 * exact-match sync, responding to frontend manual override requests.
 */
exports.slForceSyncCustomerFromSP2 = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const slCode = request.data.slCode;
    if (!slCode) {
        throw new https_1.HttpsError("invalid-argument", "slCode is required");
    }
    try {
        const sp2Firestore = getSp2Firestore();
        const sp2Snap = await sp2Firestore.collection("users").where("slCode", "==", slCode).limit(1).get();
        if (sp2Snap.empty) {
            throw new https_1.HttpsError("not-found", `No user found in SP2 with slCode ${slCode}`);
        }
        const doc = sp2Snap.docs[0];
        const stats = {
            totalProcessed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            errorDetails: [],
            addressesTotal: 0,
            paymentMethodsTotal: 0,
            mode: 'full',
            startedAt: new Date().toISOString(),
            completedAt: '',
            durationMs: 0,
        };
        await processUserDoc(doc, sp2Firestore, stats);
        const customerDoc = await sp1Db.collection('customers').doc(slCode).get();
        if (!customerDoc.exists) {
            throw new https_1.HttpsError("internal", "Customer sync completed but document not found in SP1");
        }
        const customerData = customerDoc.data();
        return {
            success: true,
            customer: {
                id: slCode,
                slCode: customerData.slCode,
                email: customerData.email,
                fullName: customerData.fullName,
            }
        };
    }
    catch (e) {
        console.error(`[slForceSyncCustomerFromSP2] Error syncing ${slCode}:`, e);
        if (e instanceof https_1.HttpsError)
            throw e;
        throw new https_1.HttpsError("internal", `Sync failed: ${e.message}`);
    }
});
//# sourceMappingURL=sync.js.map