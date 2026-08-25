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

// import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, onRequest, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, Timestamp, FieldValue, FieldPath } from "firebase-admin/firestore";
import { initializeApp, getApps, getApp } from "firebase-admin/app";

// SP2 Firebase project configuration
const SP2_PROJECT_ID = "smart-portal-2";

// Initialize SP2 Firestore (secondary app)
let sp2Db: FirebaseFirestore.Firestore | null = null;

/**
 * Get SP2 Firestore instance
 * Uses service account for cross-project access
 */
function getSp2Firestore(): FirebaseFirestore.Firestore {
  if (sp2Db) return sp2Db;

  const sp2AppName = "smart-portal-2";
  const existingApp = getApps().find(app => app.name === sp2AppName);

  if (existingApp) {
    sp2Db = getFirestore(existingApp);
  } else {
    // Initialize SP2 app with service account
    // The service account JSON should be stored in environment or Secret Manager
    const sp2App = initializeApp({
      projectId: SP2_PROJECT_ID,
    }, sp2AppName);
    sp2Db = getFirestore(sp2App);
  }

  return sp2Db;
}

// SP1 Firestore — uses named database "portal" (not default)
const sp1Db = getFirestore(getApp(), "portal");

/**
 * SP2 Payment Method interface (from payment_methods collection)
 */
interface SP2PaymentMethod {
  id: string;
  userId?: string;
  type: 'card' | 'sinpe' | 'transfer' | 'paypal' | 'cash';
  label: string;
  cardLast4?: string;
  cardBrand?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';
  cardExpMonth?: number;
  cardExpYear?: number;
  sinpePhone?: string;
  bankName?: string;
  accountLast4?: string;
  isDefault?: boolean;
  isActive?: boolean;
  detail?: string;
  createdAt?: any;
  updatedAt?: any;
}

/**
 * SP2 Address interface (from addresses collection)
 */
interface SP2Address {
  id: string;
  userId: string;
  type?: 'residence' | 'work' | 'other';
  alias: string;
  country?: string;
  province?: string;
  canton?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  streetAddress?: string;
  detail?: string; // Legacy field
  details?: string;
  coordinates?: {
    lat: number;
    lng: number;
    validated?: boolean;
  };
  recipientName?: string;
  recipientPhone?: string;
  contactName?: string; // Legacy
  contactPhone?: string; // Legacy
  deliveryInstructions?: string;
  deliveryNotes?: string; // Legacy
  encomienda?: {
    id: string;
    name: string;
    phone?: string;
    pickupAddress?: string;
    schedule?: string;
  };
  requiresEncomienda?: boolean;
  status?: 'active' | 'inactive' | 'pending_confirmation' | 'escalated';
  isDefault?: boolean;
  isPrimary?: boolean; // Legacy
  isActive?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

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

  // Sincronización y Auditoría de Ruta
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

  // SP1 specific fields
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

  // ── SP1-only encomienda assignment (top-level mirror) ─────────────────────
  // Written by client-side `handleAssignEncomienda` in EncomiendaManifests.
  // The SP2 user profile does NOT carry these fields — they're managed
  // exclusively by SP1 admins. The scheduled sync MUST preserve them on
  // every update to avoid clobbering admin assignments. See the
  // explicit preservation block in performSync() below for enforcement.
  encomienda?: {
    id: string;
    name: string;
    phone?: string;
    pickupAddress?: string;
  } | null;
  encomiendaServiceName?: string | null;
  encomiendaProvider?: string | null;
  encomiendaUpdatedAt?: string | null;

  // Addresses (from SP2 addresses collection)
  addresses?: SP1CustomerAddress[] | null;
  defaultAddress?: SP1CustomerAddress | null;
  hasAddresses?: boolean;

  // Payment Methods (from SP2 payment_methods collection)
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
 * Transform SP2 Payment Method to SP1 Customer Payment Method
 */
function transformPaymentMethodToCustomerPaymentMethod(sp2PaymentMethod: SP2PaymentMethod): SP1CustomerPaymentMethod {
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
function preserveSp1AddressFields(
  sp2Addresses: SP1CustomerAddress[],
  existingAddresses?: SP1CustomerAddress[],
): SP1CustomerAddress[] {
  if (!existingAddresses || existingAddresses.length === 0) return sp2Addresses;

  const byId = new Map<string, SP1CustomerAddress>();
  const byShape = new Map<string, SP1CustomerAddress>();
  const shape = (a: SP1CustomerAddress): string => [
    (a.province || '').trim().toLowerCase(),
    (a.canton || '').trim().toLowerCase(),
    (a.district || '').trim().toLowerCase(),
    (a.streetAddress || '').trim().toLowerCase(),
  ].join('|');
  for (const ex of existingAddresses) {
    if (ex?.id) byId.set(ex.id, ex);
    byShape.set(shape(ex), ex);
  }

  return sp2Addresses.map(addr => {
    const existing = (addr.id && byId.get(addr.id)) || byShape.get(shape(addr));
    if (!existing) return addr;
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

function transformAddressToCustomerAddress(sp2Address: SP2Address): SP1CustomerAddress {
  const raw = sp2Address as any;
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
function toISOString(timestamp: any): string | null {
  if (!timestamp) return null;
  if (timestamp instanceof Timestamp) {
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
function transformUserToCustomer(
  sp2User: SP2UserProfile,
  existingCustomer?: SP1Customer,
  addresses?: SP1CustomerAddress[],
  defaultAddress?: SP1CustomerAddress | null,
  paymentMethods?: SP1CustomerPaymentMethod[],
  defaultPaymentMethod?: SP1CustomerPaymentMethod | null
): SP1Customer {
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
  const looksLikeHandle = (n: string): boolean => {
    const c = n.trim();
    if (!c) return false;
    if (/\d/.test(c)) return true;
    if (/[(){}\[\]<>@#$]/.test(c)) return true;
    const tokens = c.split(/\s+/).map(t => t.replace(/[()[\]{}<>]/g, ''));
    if (tokens.length === 2 && tokens[0].length > 0 &&
      tokens[0].toUpperCase() === tokens[1].toUpperCase()) return true;
    return false;
  };
  const computedName = `${(sp2User.firstName || '').trim()} ${(sp2User.lastName || '').trim()}`.trim();
  const display = (sp2User.displayName || '').trim();
  const computedTokens = computedName ? computedName.split(/\s+/).length : 0;
  const displayTokens = display ? display.split(/\s+/).length : 0;
  const fullName = (display && !looksLikeHandle(display) && displayTokens > computedTokens)
    ? display
    : (computedName || display || 'Usuario');


  const initialRouteHistory: any[] = [];
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
    location: sp2User.location || ((sp2User as any).provincia ? {
      province: (sp2User as any).provincia,
      canton: (sp2User as any).canton,
      district: (sp2User as any).distrito,
      city: (sp2User as any).direccionExacta || (sp2User as any).direccion,
      country: sp2User.country || 'Costa Rica',
    } : null),
    provincia: (sp2User as any).provincia || (sp2User.location as any)?.province || null,
    canton: (sp2User as any).canton || (sp2User.location as any)?.canton || null,
    distrito: (sp2User as any).distrito || (sp2User.location as any)?.district || null,
    direccionExacta: (sp2User as any).direccionExacta || (sp2User.location as any)?.addressDetail || (sp2User.location as any)?.detail || (sp2User as any).direccion || null,
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
  } as any as SP1Customer;
}

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
export const triggerCustomerSync = onCall({
  memory: "512MiB",
  timeoutSeconds: 540,
}, async (request) => {
  // Verify admin role
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const userRole = request.auth.token.role;
  if (userRole !== "ADMIN" && userRole !== "admin") {
    throw new HttpsError("permission-denied", "Admin access required");
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

function createEmptyAddressSchema(): SP1CustomerAddress {
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

function createEmptyPaymentMethodSchema(): SP1CustomerPaymentMethod {
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
function removeUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

/**
 * Extracted user processing logic to be shared between bulk sync and single-user force sync.
 */
async function processUserDoc(
  doc: FirebaseFirestore.DocumentSnapshot,
  sp2Firestore: FirebaseFirestore.Firestore,
  stats: SyncStats
): Promise<void> {
  const sp2User = doc.data() as SP2UserProfile;
  sp2User.uid = doc.id;

  if (!sp2User.email || !sp2User.slCode) {
    stats.skipped++;
    return;
  }

  // Transform addresses
  const addresses: SP1CustomerAddress[] = [];
  let defaultAddress: SP1CustomerAddress | null = null;

  const rawAddresses = (sp2User as any).addresses;
  if (Array.isArray(rawAddresses)) {
    for (const addrData of rawAddresses) {
      const addr = transformAddressToCustomerAddress(addrData as SP2Address);
      addresses.push(addr);
      stats.addressesTotal++;
      if (addr.isDefault && addr.isActive) defaultAddress = addr;
    }
  } else {
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
      const sp2Address = { ...addressDoc.data(), id: addressDoc.id } as SP2Address;
      const addr = transformAddressToCustomerAddress(sp2Address);
      addresses.push(addr);
      stats.addressesTotal++;
      if (addr.isDefault && addr.isActive) defaultAddress = addr;
    }
  }

  if (!defaultAddress && addresses.length > 0) {
    defaultAddress = addresses.find(a => a.isActive) || addresses[0];
  }

  // Transform payment methods
  const paymentMethods: SP1CustomerPaymentMethod[] = [];
  let defaultPaymentMethod: SP1CustomerPaymentMethod | null = null;

  const rawPaymentMethods = (sp2User as any).paymentMethods;
  if (Array.isArray(rawPaymentMethods)) {
    for (const pmData of rawPaymentMethods) {
      const pm = transformPaymentMethodToCustomerPaymentMethod(pmData as SP2PaymentMethod);
      paymentMethods.push(pm);
      stats.paymentMethodsTotal++;
      if (pm.isDefault && pm.isActive) defaultPaymentMethod = pm;
    }
  } else {
    const paymentMethodsSnapshot = await sp2Firestore
      .collection('payment_methods')
      .where('userId', '==', sp2User.uid)
      .get();

    for (const pmDoc of paymentMethodsSnapshot.docs) {
      const sp2PM = { ...pmDoc.data(), id: pmDoc.id } as SP2PaymentMethod;
      const pm = transformPaymentMethodToCustomerPaymentMethod(sp2PM);
      paymentMethods.push(pm);
      stats.paymentMethodsTotal++;
      if (pm.isDefault && pm.isActive) defaultPaymentMethod = pm;
    }
  }

  if (!defaultPaymentMethod && paymentMethods.length > 0) {
    defaultPaymentMethod = paymentMethods.find(pm => pm.isActive) || paymentMethods[0];
  }

  const customerRef = sp1Db.collection('customers').doc(sp2User.slCode);
  const existingDoc = await customerRef.get();
  const existingCustomer = existingDoc.exists ? existingDoc.data() as SP1Customer : undefined;

  // Preserve SP1-only address fields (encomienda, requiresEncomienda,
  // validated coordinates) BEFORE transforming — otherwise the scheduled
  // sync would wipe SP1 admin's encomienda assignment every 30 minutes.
  const mergedAddresses = preserveSp1AddressFields(addresses, existingCustomer?.addresses ?? undefined);
  const mergedDefaultAddress: SP1CustomerAddress | null = defaultAddress
    ? (mergedAddresses.find(a => a.id === defaultAddress!.id) ?? defaultAddress)
    : null;

  const customer = transformUserToCustomer(
    sp2User, existingCustomer,
    mergedAddresses.length > 0 ? mergedAddresses : [createEmptyAddressSchema()],
    mergedDefaultAddress || createEmptyAddressSchema(),
    paymentMethods.length > 0 ? paymentMethods : [createEmptyPaymentMethodSchema()],
    defaultPaymentMethod || createEmptyPaymentMethodSchema(),
  );

  const cleanCustomer = removeUndefined(customer as unknown as Record<string, any>);

  if (existingCustomer) {
    // Other contact fields: SP1 admin prevails if sp1AdminUpdatedAt > SP2 updatedAt
    const sp1AdminTs = existingCustomer.sp1AdminUpdatedAt
      ? new Date(existingCustomer.sp1AdminUpdatedAt).getTime()
      : 0;
    const sp2UpdatedTs = sp2User.updatedAt
      ? (sp2User.updatedAt instanceof Timestamp
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
      const sp2AdminTime = sp2User.rutaSetByAdminAt ? (sp2User.rutaSetByAdminAt instanceof Timestamp ? sp2User.rutaSetByAdminAt.toMillis() : new Date(sp2User.rutaSetByAdminAt).getTime()) : 0;

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
      if (JSON.stringify(existingCustomer[key as keyof SP1Customer]) !== JSON.stringify(val)) {
        hasDiff = true;
        break;
      }
    }

    if (hasDiff) {
      await customerRef.update(updatedData);
      stats.updated++;
    } else {
      stats.skipped++;
    }
  } else {
    await customerRef.set(cleanCustomer);
    stats.created++;
  }
}

/**
 * Perform the actual sync operation
 */
async function performSync(forceFullSync = false): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
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
    const lastSyncAt: string | null = (!forceFullSync && syncMeta.exists)
      ? (syncMeta.data()?.lastSyncAt || null)
      : null;

    console.log(`[CustomerSync] Last sync: ${lastSyncAt || 'Never — running full sync'}`);

    // ── Collect SP2 user IDs that need syncing ─────────────────────────────────
    let userDocs: FirebaseFirestore.DocumentSnapshot[] = [];

    if (lastSyncAt) {
      stats.mode = 'incremental';
      const since = Timestamp.fromDate(new Date(lastSyncAt));
      const userIdsToSync = new Set<string>();

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
        if (uid) userIdsToSync.add(uid);
      });
      console.log(`[CustomerSync] Addresses updated: ${updatedAddresses.size}`);

      // 3. Users with updated payment methods
      const updatedPM = await sp2Firestore.collection('payment_methods')
        .where('updatedAt', '>', since).get();
      updatedPM.forEach(d => {
        const uid = d.data().userId;
        if (uid) userIdsToSync.add(uid);
      });
      console.log(`[CustomerSync] Payment methods updated: ${updatedPM.size}`);

      // 4. Users with updated pre-alerts
      try {
        const updatedPrealerts = await sp2Firestore.collection('prealerts')
          .where('createdAt', '>', since).get();
        updatedPrealerts.forEach(d => {
          const uid = d.data().userId;
          if (uid) userIdsToSync.add(uid);
        });
        console.log(`[CustomerSync] Prealerts checked: ${updatedPrealerts.size}`);
      } catch (err) {
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
          .where(FieldPath.documentId(), 'in', batch)
          .get();
        userDocs.push(...snapshot.docs);
      }
    } else {
      // Full sync — paginate through all users
      stats.mode = 'full';
      const PAGE_SIZE = 500;
      let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      let hasMore = true;

      while (hasMore) {
        let q = sp2Firestore.collection('users').limit(PAGE_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc) as FirebaseFirestore.Query;
        const snapshot = await q.get();
        if (snapshot.empty) {
          hasMore = false;
        } else {
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
    const processUser = async (doc: FirebaseFirestore.DocumentSnapshot): Promise<void> => {
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
          const reason = (results[j] as PromiseRejectedResult).reason;
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
        console.log(
          `[CustomerSync] ${pct}% (${stats.totalProcessed}/${totalUsers}) | ` +
          `✅ ${stats.created} created | ♻️ ${stats.updated} updated | ` +
          `⏭️ ${stats.skipped} skipped | ETA: ${eta}s`
        );
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
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[CustomerSync] Sync metadata updated — next run will be incremental from: ${syncEndTime}`);

  } catch (error: any) {
    stats.errors++;
    stats.errorDetails.push(`Fatal: ${error.message}`);
    console.error('[CustomerSync] Fatal error:', error);
  }

  stats.completedAt = new Date().toISOString();
  stats.durationMs = Date.now() - startTime;

  return stats;
}

// ─── Nova: admin-side customer profile update (SP1 + SP2 via Admin SDK) ──────
//
// Client SDK cannot write to SP2 users — SP2 security rules block cross-project
// writes. This callable uses the Admin SDK for both databases, bypassing rules.

interface UpdateCustomerProfileRequest {
  slCode: string;
  fullName: string;
  email?: string;
  dni?: string | null;
  phone?: string | null;
  ruta?: string | null;
  syncRutaToSp2?: boolean;
}

export const slUpdateCustomerProfile = onCall(
  { cors: true },
  async (request: CallableRequest<UpdateCustomerProfileRequest>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const { slCode, fullName, email, dni, phone, ruta, syncRutaToSp2 } = request.data;
    if (!slCode) throw new HttpsError("invalid-argument", "slCode is required");
    if (!fullName) throw new HttpsError("invalid-argument", "fullName is required");

    const nameParts = fullName.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const now = FieldValue.serverTimestamp();
    const updatePayload: Record<string, unknown> = {
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
      } else {
        throw new HttpsError("not-found", `SP1: no customer with slCode="${slCode}"`);
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("internal", `SP1 update failed: ${(e as Error).message}`);
    }

    // ── SP2: users collection (admin SDK, default db) ─────────────────────────
    try {
      const sp2Firestore = getSp2Firestore();
      const sp2Snap = await sp2Firestore.collection("users")
        .where("slCode", "==", slCode).limit(1).get();
      if (!sp2Snap.empty) {
        const sp2Payload: Record<string, unknown> = {
          firstName,
          lastName,
          displayName: fullName.trim(),
          email: email?.trim() ?? null,
          dni: dni?.trim() || null,
          phone: phone?.trim() || null,
          updatedAt: FieldValue.serverTimestamp(),
          sp1LastPushAt: FieldValue.serverTimestamp(),
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
    } catch (e) {
      // SP2 is best-effort — SP1 already succeeded, log and continue
      console.warn(`[slUpdateCustomerProfile] SP2 update failed for ${slCode}:`, e);
    }

    return { success: true, sp1Updated, sp2Updated };
  }
);

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
export const slSyncCustomerFromSp2 = onRequest(
  { cors: false, invoker: 'public', memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
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

    const incomingSecret = req.headers['x-sync-secret'] as string | undefined;
    const expectedSecret = process.env.SP2_SYNC_SECRET;
    if (!expectedSecret || incomingSecret !== expectedSecret) {
      console.warn('[slSyncCustomerFromSp2] Unauthorized attempt', { ip: req.ip });
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    try {
      const sp2User = req.body?.user as SP2UserProfile | undefined;
      if (!sp2User?.slCode || !sp2User?.email) {
        res.status(400).json({ success: false, error: 'Missing required fields: slCode, email' });
        return;
      }

      if (!sp2User.uid) sp2User.uid = sp2User.slCode;

      const customerRef = sp1Db.collection('customers').doc(sp2User.slCode);
      const existingDoc = await customerRef.get();
      const existingCustomer = existingDoc.exists ? existingDoc.data() as SP1Customer : undefined;

      // Check if incoming user object contains denormalized addresses/payment methods
      let addresses: SP1CustomerAddress[] = [];
      const rawAddresses = (sp2User as any).addresses;
      if (Array.isArray(rawAddresses)) {
        for (const addrData of rawAddresses) {
          addresses.push(transformAddressToCustomerAddress(addrData as SP2Address));
        }
      } else {
        addresses = (existingCustomer?.addresses ?? []).filter((a: SP1CustomerAddress) => a.id);
      }

      let paymentMethods: SP1CustomerPaymentMethod[] = [];
      const rawPaymentMethods = (sp2User as any).paymentMethods;
      if (Array.isArray(rawPaymentMethods)) {
        for (const pmData of rawPaymentMethods) {
          paymentMethods.push(transformPaymentMethodToCustomerPaymentMethod(pmData as SP2PaymentMethod));
        }
      } else {
        paymentMethods = (existingCustomer?.paymentMethods ?? []).filter((p: SP1CustomerPaymentMethod) => p.id);
      }

      const defaultAddress = addresses.find((a: SP1CustomerAddress) => a.isDefault && a.isActive) ?? addresses[0] ?? createEmptyAddressSchema();
      const defaultPaymentMethod = paymentMethods.find((p: SP1CustomerPaymentMethod) => p.isDefault && p.isActive) ?? paymentMethods[0] ?? createEmptyPaymentMethodSchema();

      const customer = transformUserToCustomer(
        sp2User,
        existingCustomer,
        addresses.length ? addresses : [createEmptyAddressSchema()],
        defaultAddress,
        paymentMethods.length ? paymentMethods : [createEmptyPaymentMethodSchema()],
        defaultPaymentMethod,
      );

      const cleanCustomer = removeUndefined(customer as unknown as Record<string, any>);

      if (existingCustomer) {
        const sp1AdminTs = existingCustomer.sp1AdminUpdatedAt
          ? new Date(existingCustomer.sp1AdminUpdatedAt).getTime() : 0;
        const sp2UpdatedTs = sp2User.updatedAt
          ? (sp2User.updatedAt instanceof Timestamp
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
          const sp2AdminTime = sp2User.rutaSetByAdminAt ? (sp2User.rutaSetByAdminAt instanceof Timestamp ? sp2User.rutaSetByAdminAt.toMillis() : new Date(sp2User.rutaSetByAdminAt).getTime()) : 0;

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
          if (JSON.stringify(existingCustomer[key as keyof SP1Customer]) !== JSON.stringify(val)) {
            hasDiff = true;
            break;
          }
        }

        if (hasDiff) {
          await customerRef.update(updatedData);
          console.log(`[slSyncCustomerFromSp2] Updated: ${sp2User.slCode}`);
        } else {
          console.log(`[slSyncCustomerFromSp2] No changes detected for ${sp2User.slCode}. Skipping update.`);
        }
        res.status(200).json({ success: true, slCode: sp2User.slCode, action: 'updated' });
      } else {
        await customerRef.set(cleanCustomer);
        console.log(`[slSyncCustomerFromSp2] Created: ${sp2User.slCode}`);
        res.status(201).json({ success: true, slCode: sp2User.slCode, action: 'created' });
      }
    } catch (error: any) {
      console.error('[slSyncCustomerFromSp2] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

/**
 * Log sync results to Firestore for auditing
 */
async function logSyncResults(stats: SyncStats): Promise<void> {
  try {
    await sp1Db.collection('_sync_logs').add({
      type: 'customers',
      source: 'smart-portal-2',
      destination: 'smart-portal-1',
      ...stats,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("[CustomerSync] Failed to log sync results:", error);
  }
}

/**
 * Callable endpoint: Force sync a customer from SP2 to SP1 by slCode.
 * Re-uses the bulk sync's `processUserDoc` logic to perform an immediate,
 * exact-match sync, responding to frontend manual override requests.
 */
export const slForceSyncCustomerFromSP2 = onCall(
  { cors: true },
  async (request: CallableRequest<{ slCode: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const slCode = request.data.slCode;
    if (!slCode) {
      throw new HttpsError("invalid-argument", "slCode is required");
    }

    try {
      const sp2Firestore = getSp2Firestore();
      const sp2Snap = await sp2Firestore.collection("users").where("slCode", "==", slCode).limit(1).get();

      if (sp2Snap.empty) {
        throw new HttpsError("not-found", `No user found in SP2 with slCode ${slCode}`);
      }

      const doc = sp2Snap.docs[0];

      const stats: SyncStats = {
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
        throw new HttpsError("internal", "Customer sync completed but document not found in SP1");
      }

      const customerData = customerDoc.data()!;

      return {
        success: true,
        customer: {
          id: slCode,
          slCode: customerData.slCode,
          email: customerData.email,
          fullName: customerData.fullName,
        }
      };
    } catch (e: any) {
      console.error(`[slForceSyncCustomerFromSP2] Error syncing ${slCode}:`, e);
      if (e instanceof HttpsError) throw e;
      throw new HttpsError("internal", `Sync failed: ${e.message}`);
    }
  }
);
