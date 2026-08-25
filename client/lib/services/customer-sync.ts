/**
 * Customer Sync Service
 *
 * SP2 fallback for customer lookup:
 * When a name is NOT found in SP1's `customers` collection (after algorithmic +
 * AI matching), this service searches SP2's `users` collection by name.
 * If found it:
 *   1. Returns the match immediately so the manifest can proceed.
 *   2. Writes the full customer document to SP1 `customers` in the background
 *      so future matches hit SP1 directly without going to SP2.
 *
 * SP1 is ALWAYS searched first — SP2 is strictly a last-resort fallback.
 * Field mapping mirrors functions/src/customers/sync.ts (transformUserToCustomer).
 */

import { db, dbSP2 } from '../firebase';
import { searchCustomersLocal, patchCustomerRutaInCache, patchCustomerConsolidationInCache } from './customer-matcher';
import { updateTempCustomer } from './temp-customers-service';
import { logAction } from './audit-service';
import { getAuth } from 'firebase/auth';

/** Where the route change originated — recorded in audit_logs.metadata.source */
export type RouteChangeSource =
  | 'edit_customer_modal'   // Admin edited customer directly via EditCustomerModal
  | 'nova_assignment'       // Admin assigned/reassigned a customer row in Nova table
  | 'nova_route_picker'     // Admin changed route via inline Nova route picker
  | 'nova_chat'             // Admin confirmed match from Nova AI chat
  | 'nova_learning'         // Admin approved correction in NovaLearning
  | 'spreadsheet'           // Admin changed route in SEA spreadsheet row
  | 'sync_sp2'              // Automatic SP2→SP1 sync (new customer without route)
  | 'script'                // One-off admin script
  | 'unknown';              // Fallback
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  getDoc,
  doc,
  serverTimestamp,
  runTransaction,
  limit as firestoreLimit,
  Timestamp,
  orderBy,
} from 'firebase/firestore';

// ─── SP2 source interfaces ────────────────────────────────────────────────────

interface SP2UserProfile {
  uid: string;
  slCode: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  phone?: string;
  photoURL?: string | null;
  dni?: string;
  location?: {
    province?: string;
    canton?: string;
    district?: string;
    city?: string;
    country?: string;
  };
  country?: string;
  timezone?: string;
  ruta?: string;
  tier?: string;
  membershipTier?: string;
  memberSince?: string;
  membershipExpires?: string | null;
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
  /** Date of birth sourced from TSE (e.g. "27/09/1987") */
  birthDate?: string;
  /** Nationality sourced from TSE (e.g. "Costarricense") */
  nationality?: string;
  acceptMarketing?: boolean;
  preferredLanguage?: string;
  consolidationEnabled?: boolean;
  electronicInvoiceRequired?: boolean;
  migratedFromWordPress?: boolean;
  wpUserId?: number;
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
}

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
  detail?: string;
  details?: string;
  coordinates?: { lat: number; lng: number; validated?: boolean } | null;
  recipientName?: string;
  contactName?: string;
  recipientPhone?: string;
  contactPhone?: string;
  deliveryInstructions?: string;
  deliveryNotes?: string;
  encomienda?: {
    id: string;
    name: string;
    phone?: string;
    pickupAddress?: string;
    schedule?: string;
  } | null;
  requiresEncomienda?: boolean;
  status?: string;
  isDefault?: boolean;
  isPrimary?: boolean;
  isActive?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

interface SP2PaymentMethod {
  id: string;
  userId?: string;
  type: string;
  label?: string;
  cardLast4?: string;
  cardBrand?: string;
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

// ─── SP1 destination interfaces ───────────────────────────────────────────────

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
  coordinates?: { lat: number; lng: number; validated?: boolean } | null;
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
    country?: string;
  } | null;
  country: string;
  timezone?: string | null;
  ruta?: string | null;
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
  /** Date of birth sourced from TSE */
  birthDate?: string | null;
  /** Nationality sourced from TSE */
  nationality?: string | null;
  acceptMarketing: boolean;
  preferredLanguage: string;
  consolidationEnabled: boolean;
  electronicInvoiceRequired: boolean;
  migratedFromWordPress?: boolean;
  wpUserId?: number | null;
  notes?: string | null;
  preferredRouteId?: string | null;
  addresses: SP1CustomerAddress[];
  defaultAddress?: SP1CustomerAddress | null;
  paymentMethods: SP1CustomerPaymentMethod[];
  defaultPaymentMethod?: SP1CustomerPaymentMethod | null;
  isSynced: boolean;
  lastSyncAt: string;
  syncSource: string;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  sp2CreatedAt?: string | null;
  sp2UpdatedAt?: string | null;
}

// Return type for the matcher (subset of SP1Customer used by matching)
export interface SP2SyncResult {
  slCode: string;
  fullName: string;
  ruta?: string;
  consolidationEnabled: boolean;
  electronicInvoiceRequired: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISOString(value: any): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'object' && value !== null) {
    const sec = value.seconds ?? value._seconds;
    if (typeof sec === 'number') {
      return new Date(sec * 1000).toISOString();
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function normalizeName(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function nameMatchScore(searchName: string, candidateName: string): number {
  const searchTokens = normalizeName(searchName).split(' ').filter(t => t.length >= 2);
  const candidateTokens = normalizeName(candidateName).split(' ').filter(t => t.length >= 2);
  if (searchTokens.length === 0 || candidateTokens.length === 0) return 0;

  let matched = 0;
  const remaining = [...candidateTokens];
  for (const st of searchTokens) {
    const idx = remaining.findIndex(ct => ct === st || ct.startsWith(st) || st.startsWith(ct));
    if (idx !== -1) {
      matched++;
      remaining.splice(idx, 1);
    }
  }
  if (matched < searchTokens.length) return 0;
  const extra = candidateTokens.length - searchTokens.length;
  return extra === 0 ? 1.0 : extra === 1 ? 0.88 : extra === 2 ? 0.80 : 0.72;
}

// ─── Transform helpers ────────────────────────────────────────────────────────

function transformAddress(addr: SP2Address): SP1CustomerAddress {
  return {
    id: addr.id,
    userId: addr.userId,
    type: addr.type || 'residence',
    alias: addr.alias || 'Dirección',
    country: addr.country || 'Costa Rica',
    province: addr.province || null,
    canton: addr.canton || null,
    district: addr.district || null,
    city: addr.city || null,
    postalCode: addr.postalCode || null,
    streetAddress: addr.streetAddress || addr.detail || '',
    details: addr.details || null,
    coordinates: addr.coordinates || null,
    recipientName: addr.recipientName || addr.contactName || null,
    recipientPhone: addr.recipientPhone || addr.contactPhone || null,
    deliveryInstructions: addr.deliveryInstructions || addr.deliveryNotes || null,
    encomienda: addr.encomienda || null,
    requiresEncomienda: addr.requiresEncomienda || false,
    status: addr.status || 'active',
    isDefault: addr.isDefault ?? addr.isPrimary ?? false,
    isActive: addr.isActive !== false,
    createdAt: toISOString(addr.createdAt),
    updatedAt: toISOString(addr.updatedAt),
  };
}

function transformPaymentMethod(pm: SP2PaymentMethod): SP1CustomerPaymentMethod {
  return {
    id: pm.id,
    userId: pm.userId,
    type: pm.type || 'cash',
    label: pm.label || 'Método de pago',
    cardLast4: pm.cardLast4 || null,
    cardBrand: pm.cardBrand || null,
    cardExpMonth: pm.cardExpMonth || null,
    cardExpYear: pm.cardExpYear || null,
    sinpePhone: pm.sinpePhone || null,
    bankName: pm.bankName || null,
    accountLast4: pm.accountLast4 || null,
    isDefault: pm.isDefault || false,
    isActive: pm.isActive !== false,
    detail: pm.detail || null,
    createdAt: toISOString(pm.createdAt),
    updatedAt: toISOString(pm.updatedAt),
  };
}

function buildSP1Customer(
  sp2User: SP2UserProfile,
  addresses: SP1CustomerAddress[],
  paymentMethods: SP1CustomerPaymentMethod[],
  existingSyncVersion = 0
): SP1Customer {
  const now = new Date().toISOString();
  const fullName = sp2User.displayName || `${sp2User.firstName || ''} ${sp2User.lastName || ''}`.trim() || 'Usuario';
  const defaultAddress = addresses.find(a => a.isDefault) || addresses[0] || null;
  const defaultPaymentMethod = paymentMethods.find(p => p.isDefault) || paymentMethods[0] || null;

  return {
    id: sp2User.slCode,
    firebaseUid: sp2User.uid,
    slCode: sp2User.slCode || '',
    firstName: sp2User.firstName || '',
    lastName: sp2User.lastName || '',
    fullName,
    email: sp2User.email || '',
    phone: sp2User.phone || null,
    photoURL: sp2User.photoURL || null,
    dni: sp2User.dni || null,
    location: sp2User.location || null,
    country: sp2User.country || sp2User.location?.country || 'Costa Rica',
    timezone: sp2User.timezone || null,
    ruta: sp2User.ruta || null,
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
    birthDate: sp2User.birthDate || null,
    nationality: sp2User.nationality || null,
    acceptMarketing: sp2User.acceptMarketing || false,
    preferredLanguage: sp2User.preferredLanguage || 'es',
    consolidationEnabled: sp2User.consolidationEnabled || false,
    consolidationEnabledAt: toISOString((sp2User as any).consolidationEnabledAt) || null,
    consolidationDisabledAt: toISOString((sp2User as any).consolidationDisabledAt) || null,
    electronicInvoiceRequired: sp2User.electronicInvoiceRequired || false,
    migratedFromWordPress: sp2User.migratedFromWordPress || false,
    wpUserId: sp2User.wpUserId || null,
    notes: null,
    preferredRouteId: null,
    addresses,
    defaultAddress,
    paymentMethods,
    defaultPaymentMethod,
    isSynced: true,
    lastSyncAt: now,
    syncSource: 'smart-portal-2',
    syncVersion: existingSyncVersion + 1,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: toISOString(sp2User.lastLoginAt),
    sp2CreatedAt: toISOString(sp2User.createdAt),
    sp2UpdatedAt: toISOString(sp2User.updatedAt),
  } as any;
}

// ─── SP2 Firestore queries (read-only) ────────────────────────────────────────

async function fetchSP2Addresses(userId: string): Promise<SP1CustomerAddress[]> {
  try {
    const q = query(
      collection(dbSP2, 'addresses'),
      where('userId', '==', userId),
      firestoreLimit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => transformAddress({ id: d.id, ...d.data() } as SP2Address));
  } catch {
    return [];
  }
}

async function fetchSP2PaymentMethods(userId: string): Promise<SP1CustomerPaymentMethod[]> {
  try {
    const q = query(
      collection(dbSP2, 'payment_methods'),
      where('userId', '==', userId),
      firestoreLimit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => transformPaymentMethod({ id: d.id, ...d.data() } as SP2PaymentMethod));
  } catch {
    return [];
  }
}

// ─── SP2 name search via local cache (no blocked Firestore where-query) ────────
// SP2 security rules deny client-side where-clause queries on the users collection.
// Instead we rely on the bulk-loaded cache in customer-matcher (which already
// contains SP2 users) and then fetch addresses/payments by doc ID after matching.

async function searchSP2UserByName(manifestName: string): Promise<{
  sp2User: SP2UserProfile;
  addresses: SP1CustomerAddress[];
  paymentMethods: SP1CustomerPaymentMethod[];
} | null> {
  try {
    // Use local cache search — no Firestore query, no permission error.
    const results = await searchCustomersLocal(manifestName, { limit: 5, minScore: 0.60 });
    if (results.length === 0) {
      console.log(`[CustomerSync] SP2 cache search "${manifestName}": no results above threshold`);
      return null;
    }

    const best = results[0];
    console.log(`[CustomerSync] ✅ SP2 cache match "${manifestName}" → "${best.fullName}" (${best.slCode}) ${(best.score * 100).toFixed(0)}%`);

    // Build a minimal SP2UserProfile from cached data so syncCustomerToSP1 can write it.
    // The cache CustomerData.id is the SP2 doc ID — use it to fetch addresses/payments.
    const sp2User: SP2UserProfile = {
      uid: best.slCode,
      slCode: best.slCode,
      firstName: best.fullName.split(' ')[0] || '',
      lastName: best.fullName.split(' ').slice(1).join(' ') || '',
      displayName: best.fullName,
      email: '',
      ruta: best.ruta,
      consolidationEnabled: best.consolidationEnabled,
    };

    const [addresses, paymentMethods] = await Promise.all([
      fetchSP2Addresses(best.slCode),
      fetchSP2PaymentMethods(best.slCode),
    ]);

    return { sp2User, addresses, paymentMethods };
  } catch (error) {
    console.error('[CustomerSync] Error searching SP2 users:', error);
    return null;
  }
}

// ─── SP1 write ────────────────────────────────────────────────────────────────

async function syncCustomerToSP1(
  sp2User: SP2UserProfile,
  addresses: SP1CustomerAddress[],
  paymentMethods: SP1CustomerPaymentMethod[]
): Promise<void> {
  try {
    const docId = sp2User.slCode || sp2User.uid;
    if (!docId) throw new Error('No slCode or uid to use as document ID');

    const customerRef = doc(db, 'customers', docId);
    const existingSnap = await getDoc(customerRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const existingSyncVersion = existingData?.syncVersion || 0;
    const initialRegDate = toISOString(sp2User.createdAt) || toISOString(sp2User.memberSince) || new Date().toISOString();

    const customer = buildSP1Customer(sp2User, addresses, paymentMethods, existingSyncVersion);
    customer.createdAt = existingData?.createdAt || initialRegDate;
    customer.memberSince = existingData?.memberSince || customer.memberSince || initialRegDate;
    customer.sp2CreatedAt = existingData?.sp2CreatedAt || customer.sp2CreatedAt || initialRegDate;

    // SP1 MANDATE: SP1 customer `ruta` is master logistics data managed by operators in SP1.
    // An existing SP1 `ruta` MUST ALWAYS be preserved and NEVER overwritten by SP2 sync.
    if (existingData?.isRutaAdminLocked || existingData?.ruta) {
      customer.ruta = existingData.ruta;
      (customer as any).isRutaAdminLocked = true;
    }

    const clean = JSON.parse(JSON.stringify(customer, (_key, val) => val === undefined ? null : val));
    await setDoc(customerRef, { ...clean, updatedAt: serverTimestamp() }, { merge: true });

    console.log(`[CustomerSync] ✅ Synced "${customer.fullName}" (${customer.slCode}) to SP1 — v${customer.syncVersion}`);
  } catch (error) {
    console.error('[CustomerSync] Error writing to SP1:', error);
    throw error;
  }
}

// ─── SP1 name search (for modal unified search) ───────────────────────────────

export interface SP1SearchResult {
  slCode: string;
  fullName: string;
  ruta?: string;
  consolidationEnabled: boolean;
  source: 'sp1';
}

export interface SP2SearchResult extends SP2SyncResult {
  source: 'sp2';
}

export type UnifiedSearchResult = SP1SearchResult | SP2SearchResult;

/**
 * Search SP1 customers collection by name — returns up to 10 matches.
 * Uses the same token-prefix strategy as SP2 search.
 */
export async function searchSP1CustomersByName(searchName: string): Promise<SP1SearchResult[]> {
  try {
    const normalized = normalizeName(searchName);
    const tokens = normalized.split(' ').filter(t => t.length >= 2);
    if (tokens.length === 0) return [];

    const customersRef = collection(db, 'customers');
    const seen = new Set<string>();
    const results: Array<{ doc: any; score: number }> = [];

    // Search by fullName prefix using first token
    const firstToken = tokens[0];
    const variants = [
      firstToken,
      firstToken[0] + firstToken.slice(1).toLowerCase(),
    ];

    for (const variant of variants) {
      const q = query(
        customersRef,
        where('fullName', '>=', variant),
        where('fullName', '<=', variant + '\uf8ff'),
        firestoreLimit(40)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const data = d.data();
        const score = nameMatchScore(searchName, data.fullName || '');
        if (score >= 0.50) results.push({ doc: data, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(r => ({
        slCode: r.doc.slCode || '',
        fullName: r.doc.fullName || '',
        ruta: r.doc.ruta || undefined,
        consolidationEnabled: r.doc.consolidationEnabled || false,
        source: 'sp1' as const,
      }));
  } catch (error) {
    console.error('[CustomerSync] Error searching SP1 customers:', error);
    return [];
  }
}

/**
 * Live typeahead search — SP1 customers only.
 * Uses searchCustomersLocal which reuses the already-cached 1092 customers + full
 * token/phonetic/fuzzy matchName algorithm (same pattern as SP2 UsersManagement).
 * Far more powerful than the old Firestore prefix-range query.
 */
export async function searchUnified(searchName: string): Promise<UnifiedSearchResult[]> {
  const results = await searchCustomersLocal(searchName, { limit: 15 });
  return results.map(r => ({
    slCode: r.slCode,
    fullName: r.fullName,
    ruta: r.ruta,
    consolidationEnabled: r.consolidationEnabled,
    source: 'sp1' as const,
  }));
}

// ─── Ruta update (SP1 + SP2) ──────────────────────────────────────────────────

/**
 * When a ruta is assigned or changed in the modal:
 *  1. Update SP1 customers/{slCode}.ruta
 *  2. Find the matching SP2 users doc by slCode and patch ruta there too.
 * Both writes are fire-and-forget safe — errors are logged but not thrown.
 *
 * @param source - Where this route change originated (for audit_logs traceability)
 */
export async function updateCustomerRuta(
  rawSlCode: string,
  ruta: string,
  syncToSp2: boolean = false,
  source: RouteChangeSource = 'unknown'
): Promise<void> {
  if (!rawSlCode || !ruta) return;
  const slCode = rawSlCode.trim().toUpperCase();

  const now = new Date().toISOString();

  // ── Temp Customer check ─────────────────────────────────────────────────────
  if (slCode.startsWith('SL-NAN-')) {
    try {
      await updateTempCustomer(slCode, { ruta });
      console.log(`[CustomerSync] ✅ SP1 temp_customers/${slCode}.ruta → "${ruta}"`);
      patchCustomerRutaInCache(slCode, ruta);
      window.dispatchEvent(new CustomEvent('customer-ruta-updated', { detail: { slCode, ruta } }));
    } catch (err) {
      console.error(`[CustomerSync] temp_customers ruta update failed for ${slCode}:`, err);
    }
    return; // Stop here, don't update regular collections
  }

  // ── SP1 update ──────────────────────────────────────────────────────────────
  try {
    const sp1Ref = doc(db, 'customers', slCode);

    // Read previous ruta before overwriting (for audit trail)
    const prevSnap = await getDoc(sp1Ref);
    const previousRuta: string | null = prevSnap.exists() ? (prevSnap.data()?.ruta ?? null) : null;
    const customerName: string = prevSnap.exists() ? (prevSnap.data()?.fullName ?? slCode) : slCode;

    // Skip write + log if route is already the same (no-op)
    if (previousRuta === ruta) {
      console.log(`[RouteHistory] ${slCode}: ruta ya es "${ruta}" — sin cambio.`);
      patchCustomerRutaInCache(slCode, ruta);
      return;
    }

    // Resolved actor identity
    let changedBy = 'system';
    let changedByUid = 'system';
    try {
      const authUser = getAuth().currentUser;
      if (authUser) {
        changedBy = authUser.email ?? authUser.uid ?? 'system';
        changedByUid = authUser.uid ?? 'system';
      }
    } catch {
      // Auth app not initialized in test/server context
    }

    await setDoc(sp1Ref, { 
      ruta, 
      updatedAt: serverTimestamp(), 
      sp1AdminUpdatedAt: serverTimestamp(),
      rutaLastUpdatedBy: changedBy
    }, { merge: true });

    console.log(
      `[RouteHistory] ${slCode} "${customerName}": "${previousRuta ?? '(sin ruta)'}" → "${ruta}"\n` +
      `               vía ${source} | por ${changedBy}`
    );

    patchCustomerRutaInCache(slCode, ruta);
    window.dispatchEvent(new CustomEvent('customer-ruta-updated', { detail: { slCode, ruta } }));

    // Write enriched audit log entry
    logAction({
      userId: changedByUid,
      action: 'customer_ruta_changed',
      category: 'customer',
      resourceId: slCode,
      result: 'success',
      metadata: {
        field:        'ruta',
        previousRuta: previousRuta ?? null,
        newRuta:      ruta,
        customerName,
        slCode,
        source,
        changedBy,
        updatedAt: now,
      }
    });
  } catch (err) {
    console.error(`[CustomerSync] SP1 ruta update failed for ${slCode}:`, err);
  }

  // ── SP2 update (Opt-in only: syncToSp2 === true) ───────────────────────────
  if (syncToSp2) {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { app } = await import('@/lib/firebase/config');
      const functionsInstance = getFunctions(app, 'us-central1');
      const updateProfileCallable = httpsCallable(functionsInstance, 'slUpdateCustomerProfile');

      const sp1Snap = await getDoc(doc(db, 'customers', slCode));
      const custData = sp1Snap.data();
      const fullName = custData?.fullName || custData?.customerName || slCode;

      await updateProfileCallable({
        slCode,
        fullName,
        email: custData?.email || null,
        dni: custData?.dni || null,
        phone: custData?.phone || null,
        ruta,
        syncRutaToSp2: true,
      });
      console.log(`[CustomerSync] ✅ SP2 users/${slCode}.ruta → "${ruta}" (pushed via Admin SDK Cloud Function)`);
    } catch (e) {
      console.error(`[CustomerSync] SP2 ruta update via Cloud Function failed for ${slCode}:`, e);
    }
  }
}

/**
 * Update consolidationEnabled status (SP1 + SP2)
 */
export async function updateCustomerConsolidation(slCode: string, consolidationEnabled: boolean): Promise<void> {
  if (!slCode) return;

  const now = new Date().toISOString();

  // ── Temp Customer check ─────────────────────────────────────────────────────
  if (slCode.toUpperCase().startsWith('SL-NAN-')) {
    try {
      await updateTempCustomer(slCode, {
        consolidationEnabled,
        consolidationEnabledAt: consolidationEnabled ? now : null,
        consolidationDisabledAt: consolidationEnabled ? null : now,
      } as any);
      console.log(`[CustomerSync] ✅ SP1 temp_customers/${slCode}.consolidationEnabled → ${consolidationEnabled}`);
      patchCustomerConsolidationInCache(slCode, consolidationEnabled);
      window.dispatchEvent(new CustomEvent('customer-consolidation-updated', { detail: { slCode, consolidationEnabled } }));
    } catch (err) {
      console.error(`[CustomerSync] temp_customers consolidation update failed for ${slCode}:`, err);
    }
    return;
  }

  // ── SP1 update ──────────────────────────────────────────────────────────────
  try {
    const sp1Ref = doc(db, 'customers', slCode);
    const sp1Payload = {
      consolidationEnabled,
      consolidationEnabledAt: consolidationEnabled ? now : null,
      consolidationDisabledAt: consolidationEnabled ? null : now,
      updatedAt: serverTimestamp(),
      sp1AdminUpdatedAt: serverTimestamp(),
    };
    await setDoc(sp1Ref, sp1Payload, { merge: true });
    console.log(`[CustomerSync] ✅ SP1 customers/${slCode}.consolidationEnabled → ${consolidationEnabled}`);
    patchCustomerConsolidationInCache(slCode, consolidationEnabled);
    window.dispatchEvent(new CustomEvent('customer-consolidation-updated', { detail: { slCode, consolidationEnabled } }));
  } catch (err) {
    console.error(`[CustomerSync] SP1 consolidation update failed for ${slCode}:`, err);
  }

  // ── SP2 update ──────────────────────────────────────────────────────────────
  try {
    const usersRef = collection(dbSP2, 'users');
    const q = query(usersRef, where('slCode', '==', slCode), firestoreLimit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const sp2Ref = snap.docs[0].ref;
      const sp2Payload = {
        consolidationEnabled,
        consolidationEnabledAt: consolidationEnabled ? now : null,
        consolidationDisabledAt: consolidationEnabled ? null : now,
        updatedAt: now,
        sp1LastPushAt: now,
      };
      await setDoc(sp2Ref, sp2Payload, { merge: true });
      console.log(`[CustomerSync] ✅ SP2 users/${snap.docs[0].id}.consolidationEnabled → ${consolidationEnabled}`);
    } else {
      console.warn(`[CustomerSync] SP2 user with slCode="${slCode}" not found — skipping SP2 consolidation update`);
    }
  } catch {
    // Best-effort write
  }
}

/**
 * Update encomiendaServiceName status (SP1 + SP2)
 */
export async function updateCustomerEncomiendaService(slCode: string, encomiendaServiceName: string): Promise<void> {
  if (!slCode) return;

  const now = new Date().toISOString();

  // ── Temp Customer check ─────────────────────────────────────────────────────
  if (slCode.toUpperCase().startsWith('SL-NAN-')) {
    try {
      await updateTempCustomer(slCode, { courierService: encomiendaServiceName });
      console.log(`[CustomerSync] ✅ SP1 temp_customers/${slCode}.encomiendaServiceName → "${encomiendaServiceName}"`);
      window.dispatchEvent(new CustomEvent('customer-encomienda-updated', { detail: { slCode, encomiendaServiceName } }));
    } catch (err) {
      console.error(`[CustomerSync] temp_customers encomienda update failed for ${slCode}:`, err);
    }
    return;
  }

  // ── SP1 update ──────────────────────────────────────────────────────────────
  try {
    const sp1Ref = doc(db, 'customers', slCode);
    const snap = await getDoc(sp1Ref);
    const existingData = snap.exists() ? snap.data() : null;

    const encomiendaObj = encomiendaServiceName ? { name: encomiendaServiceName } : null;

    let updatedAddresses = existingData?.addresses;
    if (Array.isArray(updatedAddresses) && updatedAddresses.length > 0) {
      updatedAddresses = updatedAddresses.map((a: any) => ({
        ...a,
        encomienda: encomiendaObj,
        courierService: encomiendaServiceName || null,
        requiresEncomienda: !!encomiendaServiceName,
      }));
    }

    let updatedDefaultAddress = existingData?.defaultAddress;
    if (updatedDefaultAddress) {
      updatedDefaultAddress = {
        ...updatedDefaultAddress,
        encomienda: encomiendaObj,
        courierService: encomiendaServiceName || null,
        requiresEncomienda: !!encomiendaServiceName,
      };
    }

    const sp1Payload: Record<string, any> = {
      encomiendaServiceName: encomiendaServiceName || null,
      encomiendaProvider: encomiendaServiceName || null,
      encomienda: encomiendaObj,
      encomiendaUpdatedAt: now,
      updatedAt: serverTimestamp(),
      sp1AdminUpdatedAt: serverTimestamp(),
    };

    if (updatedAddresses) sp1Payload.addresses = updatedAddresses;
    if (updatedDefaultAddress) sp1Payload.defaultAddress = updatedDefaultAddress;

    await setDoc(sp1Ref, sp1Payload, { merge: true });
    console.log(`[CustomerSync] ✅ SP1 customers/${slCode}.encomiendaServiceName → "${encomiendaServiceName}"`);
    window.dispatchEvent(new CustomEvent('customer-encomienda-updated', { detail: { slCode, encomiendaServiceName } }));
  } catch (err) {
    console.error(`[CustomerSync] SP1 encomienda update failed for ${slCode}:`, err);
  }

  // ── SP2 update ──────────────────────────────────────────────────────────────
  try {
    const usersRef = collection(dbSP2, 'users');
    const q = query(usersRef, where('slCode', '==', slCode), firestoreLimit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const sp2Ref = snap.docs[0].ref;
      const sp2UserData = snap.docs[0].data();
      const encomiendaObj = encomiendaServiceName ? { name: encomiendaServiceName } : null;

      let sp2Addresses = sp2UserData.addresses;
      if (Array.isArray(sp2Addresses) && sp2Addresses.length > 0) {
        sp2Addresses = sp2Addresses.map((a: any) => ({
          ...a,
          encomienda: encomiendaObj,
          courierService: encomiendaServiceName || null,
          requiresEncomienda: !!encomiendaServiceName,
        }));
      }

      let sp2DefaultAddress = sp2UserData.defaultAddress;
      if (sp2DefaultAddress) {
        sp2DefaultAddress = {
          ...sp2DefaultAddress,
          encomienda: encomiendaObj,
          courierService: encomiendaServiceName || null,
          requiresEncomienda: !!encomiendaServiceName,
        };
      }

      const sp2Payload: Record<string, any> = {
        encomiendaServiceName: encomiendaServiceName || null,
        courierService: encomiendaServiceName || null,
        encomiendaProvider: encomiendaServiceName || null,
        encomienda: encomiendaObj,
        updatedAt: now,
        sp1LastPushAt: now,
      };

      if (sp2Addresses) sp2Payload.addresses = sp2Addresses;
      if (sp2DefaultAddress) sp2Payload.defaultAddress = sp2DefaultAddress;

      await setDoc(sp2Ref, sp2Payload, { merge: true });
      console.log(`[CustomerSync] ✅ SP2 users/${snap.docs[0].id}.encomiendaServiceName/courierService → "${encomiendaServiceName}"`);
    } else {
      console.warn(`[CustomerSync] SP2 user with slCode="${slCode}" not found — skipping SP2 encomienda update`);
    }
  } catch {
    // Best-effort write
  }
}


// ─── Create customer from manifest (Nova) ─────────────────────────────────────

/**
 * Generates the next safe SL code using an atomic Firestore transaction
 * against SP1's sl_counters collection (allow write: if isAgent()).
 *
 * Format: SL{YY}{NNN} — e.g. SL26001
 * Cross-validates: max(SP1 customers, counter doc) + 1, then updates counter.
 *
 * NOTE: Previously used SP2 counters but SP2 security rules block client writes.
 * SP1 sl_counters already grants read+write to agents.
 */
async function generateNextSlCode(): Promise<string> {
  const yearPrefix = new Date().getFullYear().toString().slice(-2);
  const prefix = `SL${yearPrefix}`;
  const counterDocId = `sl_counter_${yearPrefix}`;
  const counterRef = doc(db, 'sl_counters', counterDocId);

  // 1. Find the highest existing slCode from SP1 customers for this year
  const customersRef = collection(db, 'customers');
  const customersSnap = await getDocs(
    query(
      customersRef,
      where('slCode', '>=', prefix),
      where('slCode', '<', `SL${parseInt(yearPrefix) + 1}`),
      orderBy('slCode', 'desc'),
      firestoreLimit(1)
    )
  );
  let highestFromCustomers = 0;
  if (!customersSnap.empty) {
    const lastCode = customersSnap.docs[0].data().slCode as string;
    const num = parseInt(lastCode.slice(4), 10); // skip "SL26"
    if (!isNaN(num)) highestFromCustomers = num;
  }

  // 2. Atomic transaction on SP1 sl_counters: take max(customers, counter) + 1
  const slCode = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const highestFromCounter = counterSnap.exists() ? ((counterSnap.data().lastNumber as number) || 0) : 0;
    const nextNumber = Math.max(highestFromCustomers, highestFromCounter) + 1;

    if (counterSnap.exists()) {
      tx.update(counterRef, { lastNumber: nextNumber, updatedAt: serverTimestamp() });
    } else {
      tx.set(counterRef, { year: yearPrefix, lastNumber: nextNumber, updatedAt: serverTimestamp() });
    }

    const seq = nextNumber <= 999 ? nextNumber.toString().padStart(3, '0') : nextNumber.toString();
    return `${prefix}${seq}`;
  });

  console.log(`[CustomerSync] 🔢 Generated SL code: ${slCode} (year=${yearPrefix})`);
  return slCode;
}

/**
 * Creates a customer from the Nova manifest modal:
 *  1. Generates a safe SL code via SP2 counters transaction (no collisions).
 *  2. Writes a full customer doc to SP1 `customers/{slCode}`.
 *  3. Mirrors a matching user doc to SP2 `users/{slCode}` for bidirectional consistency.
 */
export async function createCustomerFromManifest(params: {
  fullName: string;
  ruta: string;
  consolidationEnabled: boolean;
  electronicInvoiceRequired?: boolean;
  email?: string;
  phone?: string;
}): Promise<{ slCode: string }> {
  const now = new Date().toISOString();
  const { fullName, ruta, consolidationEnabled, electronicInvoiceRequired = false, email = '', phone = '' } = params;

  // ── Step 1: Get safe SL code from SP2 counters ──────────────────────────────
  const slCode = await generateNextSlCode();

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const normalizedName = normalizeName(fullName);

  // ── Step 2: Write to SP1 customers/{slCode} ──────────────────────────────────
  const sp1Doc = {
    id: slCode,
    firebaseUid: '',
    slCode,
    firstName,
    lastName,
    fullName,
    normalizedName,
    email,
    phone: phone || null,
    photoURL: null,
    dni: null,
    location: null,
    country: 'Costa Rica',
    timezone: 'America/Costa_Rica',
    ruta: ruta || null,
    tier: 'basic',
    membershipTier: 'basic',
    memberSince: now,
    membershipExpires: null,
    role: 'customer',
    totalShipments: 0,
    pendingShipments: 0,
    status: 'active',
    isVerified: false,
    isActive: true,
    emailVerified: false,
    verifiedDni: null,
    verifiedEmail: null,
    verifiedPhone: null,
    verificationSource: null,
    dateOfVerification: null,
    acceptMarketing: false,
    preferredLanguage: 'es',
    consolidationEnabled,
    electronicInvoiceRequired,
    migratedFromWordPress: false,
    wpUserId: null,
    notes: 'Creado desde Nova',
    preferredRouteId: null,
    addresses: [],
    defaultAddress: null,
    paymentMethods: [],
    defaultPaymentMethod: null,
    isSynced: true,
    lastSyncAt: now,
    syncSource: 'nova_manual',
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'customers', slCode), sp1Doc);
  console.log(`[CustomerSync] ✅ SP1 customers/${slCode} created for "${fullName}"`);

  // ── Step 3: Mirror to SP2 users/{slCode} ────────────────────────────────────
  if (dbSP2) {
    try {
      const sp2Doc = {
        // Use slCode as doc ID — matches how SP2 sync reads it by slCode field
        uid: slCode,
        id: slCode,
        slCode,
        firstName,
        lastName,
        displayName: fullName,
        email,
        phone: phone || '',
        photoURL: null,
        dni: null,
        location: {
          province: '',
          canton: '',
          district: '',
          city: '',
          country: 'Costa Rica',
        },
        country: 'Costa Rica',
        timezone: 'America/Costa_Rica',
        ruta: ruta || null,
        tier: 'basic',
        membershipTier: 'basic',
        memberSince: now,
        membershipExpires: null,
        role: 'customer',
        totalShipments: 0,
        pendingShipments: 0,
        status: 'active',
        isVerified: false,
        isActive: true,
        emailVerified: false,
        acceptMarketing: false,
        preferredLanguage: 'es',
        consolidationEnabled,
        electronicInvoiceRequired,
        showPromoBanner: false,
        showVisitGuide: false,
        showVerificationModal: false,
        providerId: 'password',
        migratedFromWordPress: false,
        // Sync origin flags so SP2 knows this was created from Nova
        syncSource: 'nova_manual',
        createdAt: now,
        updatedAt: now,
      };
      // Store under slCode as doc ID so SP2 can find it via slCode field query
      await setDoc(doc(dbSP2, 'users', slCode), sp2Doc);
      console.log(`[CustomerSync] ✅ SP2 users/${slCode} mirrored for "${fullName}"`);
    } catch (err) {
      // SP2 mirror is best-effort — SP1 record is authoritative
      console.warn(`[CustomerSync] SP2 mirror failed for ${slCode}:`, err);
    }
  }

  return { slCode };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Manual / modal trigger: search SP2 by name, AWAIT the SP1 write, return result.
 * Use this when the admin explicitly requests a SP2 lookup from the modal.
 */
export async function searchAndSyncFromSP2(manifestName: string): Promise<SP2SyncResult | null> {
  const found = await searchSP2UserByName(manifestName);
  if (!found) return null;

  const { sp2User, addresses, paymentMethods } = found;
  // Await write so SP1 is updated before returning to caller
  await syncCustomerToSP1(sp2User, addresses, paymentMethods);

  return {
    slCode: sp2User.slCode || '',
    fullName: sp2User.displayName || `${sp2User.firstName} ${sp2User.lastName}`.trim(),
    ruta: sp2User.ruta || undefined,
    consolidationEnabled: sp2User.consolidationEnabled || false,
    electronicInvoiceRequired: sp2User.electronicInvoiceRequired || false,
  };
}

/**
 * Fallback: search SP2 `users` by name when not found in SP1.
 * Syncs the found customer to SP1 in the background so future lookups hit SP1.
 * Returns null if not found in SP2.
 */
export async function findAndSyncCustomerFromSP2(manifestName: string): Promise<SP2SyncResult | null> {
  const found = await searchSP2UserByName(manifestName);
  if (!found) return null;

  const { sp2User, addresses, paymentMethods } = found;

  // Write to SP1 in the background — don't block manifest processing
  syncCustomerToSP1(sp2User, addresses, paymentMethods).catch(err => {
    console.warn(`[CustomerSync] Background sync failed for "${sp2User.firstName} ${sp2User.lastName}":`, err);
  });

  return {
    slCode: sp2User.slCode || '',
    fullName: sp2User.displayName || `${sp2User.firstName} ${sp2User.lastName}`.trim(),
    ruta: sp2User.ruta || undefined,
    consolidationEnabled: sp2User.consolidationEnabled || false,
    electronicInvoiceRequired: sp2User.electronicInvoiceRequired || false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// saveDeliveryCoordinates
// Called right after a successful delivery. Captures the GPS coordinate where
// the package was handed off and persists it to the customer's default address
// in Firestore SP1. On the next optimizer run that customer will be treated as
// having a precise GPS pin instead of a text-only address.
// ─────────────────────────────────────────────────────────────────────────────
export async function saveDeliveryCoordinates(
  slCode: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (!slCode || !lat || !lng) return;

  try {
    // 1. Find the SP1 customer document by slCode
    const customersRef = collection(db, 'customers');
    const snap = await getDocs(
      query(customersRef, where('slCode', '==', slCode), firestoreLimit(1))
    );
    if (snap.empty) {
      console.warn(`[DeliveryGPS] No SP1 customer found for slCode=${slCode}`);
      return;
    }

    const customerDoc = snap.docs[0];
    const customerId = customerDoc.id;

    // 2. Find the default (or first) address sub-document
    const addressesRef = collection(db, 'customers', customerId, 'addresses');
    const addrSnap = await getDocs(
      query(addressesRef, where('isDefault', '==', true), firestoreLimit(1))
    );
    const addrDocs = addrSnap.empty
      ? (await getDocs(query(addressesRef, firestoreLimit(1)))).docs
      : addrSnap.docs;

    const coordinates = { lat, lng };
    const coordinatesSource = 'driver-delivery';
    const coordinatesUpdatedAt = serverTimestamp();

    if (addrDocs.length > 0) {
      // 3a. Update the address sub-document with captured coordinates
      const addrRef = doc(db, 'customers', customerId, 'addresses', addrDocs[0].id);
      await setDoc(addrRef, { coordinates, coordinatesSource, coordinatesUpdatedAt }, { merge: true });
    }

    // 3b. Also cache coordinates at the root customer doc for fast optimizer reads
    await setDoc(
      doc(db, 'customers', customerId),
      { coordinates, coordinatesSource, coordinatesUpdatedAt, updatedAt: serverTimestamp() },
      { merge: true }
    );

    console.info(`[DeliveryGPS] Saved ${lat},${lng} for customer ${slCode} (${customerId})`);
  } catch (err) {
    // Non-fatal — log and swallow so delivery flow is never interrupted
    console.warn('[DeliveryGPS] Failed to save delivery coordinates:', err);
  }
}

/**
 * Ensures that the customer (and SP2 user) has a delivery address.
 * If the customer document does not have any default/valid address,
 * it updates SP1 (customers collection + subcollection) and SP2 (addresses collection).
 */
export async function ensureCustomerDeliveryAddress(params: {
  slCode?: string;
  resolvedAddress?: string;
  lat?: number;
  lng?: number;
  packageAddress?: string;
}): Promise<void> {
  const { slCode, resolvedAddress, lat, lng, packageAddress } = params;
  if (!slCode) return;

  const targetAddress = (resolvedAddress || packageAddress || '').trim();
  if (!targetAddress) return;
  if (slCode.toUpperCase().startsWith('SL-NAN-')) return; // Skip temp customers

  try {
    const customersRef = collection(db, 'customers');
    const snap = await getDocs(
      query(customersRef, where('slCode', '==', slCode), firestoreLimit(1))
    );
    if (snap.empty) {
      console.warn(`[AddressSync] No SP1 customer found for slCode=${slCode}`);
      return;
    }

    const customerDoc = snap.docs[0];
    const customerId = customerDoc.id;
    const data = customerDoc.data();

    const addrs = Array.isArray(data.addresses) ? data.addresses : [];
    const hasDefault = !!(data.defaultAddress?.streetAddress || addrs.some((a: any) => a.isDefault || a.streetAddress));

    if (!hasDefault) {
      console.log(`[AddressSync] Customer ${slCode} has no default address. Resolving: "${targetAddress}"`);

      const addressId = Math.random().toString(36).substring(2, 15);
      const userId = data.firebaseUid || customerId;
      const newAddress = {
        id: addressId,
        userId: userId,
        type: 'residence',
        alias: 'Dirección de Entrega',
        country: 'Costa Rica',
        province: data.location?.province || null,
        canton: data.location?.canton || null,
        district: data.location?.district || null,
        city: data.location?.city || null,
        streetAddress: targetAddress,
        coordinates: lat && lng ? { lat, lng } : null,
        isDefault: true,
        isActive: true,
      };

      // 1. Write to SP1 subcollection customers/{customerId}/addresses/{addressId}
      const sp1AddrRef = doc(db, 'customers', customerId, 'addresses', addressId);
      await setDoc(sp1AddrRef, {
        ...newAddress,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Update SP1 root customer doc
      await setDoc(customerDoc.ref, {
        addresses: [newAddress],
        defaultAddress: newAddress,
        hasAddresses: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log(`[AddressSync] ✅ Successfully saved default address to SP1 customers/${slCode}`);

      // 3. Sync to SP2 addresses collection
      if (dbSP2) {
        try {
          const usersRef = collection(dbSP2, 'users');
          const q = query(usersRef, where('slCode', '==', slCode), firestoreLimit(1));
          const sp2Snap = await getDocs(q);
          if (!sp2Snap.empty) {
            const sp2UserDoc = sp2Snap.docs[0];
            const sp2AddressRef = doc(dbSP2, 'addresses', addressId);
            await setDoc(sp2AddressRef, {
              ...newAddress,
              userId: sp2UserDoc.id, // SP2 uses the uid (e.g. 1911) as userId!
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            console.log(`[AddressSync] ✅ Successfully synced address to SP2 addresses collection for user ${slCode}`);
          } else {
            console.warn(`[AddressSync] Matching user for slCode "${slCode}" not found in SP2. Skipping SP2 address sync.`);
          }
        } catch (sp2Err) {
          console.error('[AddressSync] Failed to sync address to SP2:', sp2Err);
        }
      }
    }
  } catch (err) {
    console.error('[AddressSync] Error in ensureCustomerDeliveryAddress:', err);
  }
}

/**
 * Updates or creates the default delivery address of a customer in both SP1 and SP2.
 */
export async function updateCustomerDeliveryAddress(
  slCode: string,
  newStreetAddress: string
): Promise<void> {
  if (!slCode) return;
  const targetAddress = newStreetAddress.trim();
  if (!targetAddress) return;
  if (slCode.toUpperCase().startsWith('SL-NAN-')) return; // Skip temp customers

  try {
    // 1. Find the SP1 customer document by slCode
    const customersRef = collection(db, 'customers');
    const snap = await getDocs(
      query(customersRef, where('slCode', '==', slCode), firestoreLimit(1))
    );
    if (snap.empty) {
      console.warn(`[AddressSync] No SP1 customer found for slCode=${slCode}`);
      return;
    }

    const customerDoc = snap.docs[0];
    const customerId = customerDoc.id;
    const data = customerDoc.data();

    // Find if there is an existing default/primary address in SP1
    const addrs = Array.isArray(data.addresses) ? data.addresses : [];
    const existingDefault = addrs.find((a: any) => a.isDefault) || addrs[0];

    const addressId = existingDefault?.id || Math.random().toString(36).substring(2, 15);
    const userId = data.firebaseUid || customerId;

    const newAddress = {
      id: addressId,
      userId: userId,
      type: 'residence',
      alias: existingDefault?.alias || 'Dirección de Entrega',
      country: 'Costa Rica',
      province: data.location?.province || null,
      canton: data.location?.canton || null,
      district: data.location?.district || null,
      city: data.location?.city || null,
      streetAddress: targetAddress,
      coordinates: existingDefault?.coordinates || null,
      isDefault: true,
      isActive: true,
    };

    // Update SP1:
    // 1. Write/update to SP1 subcollection customers/{customerId}/addresses/{addressId}
    const sp1AddrRef = doc(db, 'customers', customerId, 'addresses', addressId);
    await setDoc(sp1AddrRef, {
      ...newAddress,
      updatedAt: serverTimestamp(),
      ...(existingDefault ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });

    // 2. Update SP1 root customer doc's addresses list and defaultAddress
    let updatedList = [...addrs];
    const idx = updatedList.findIndex((a: any) => a.id === addressId);
    if (idx > -1) {
      updatedList[idx] = { ...updatedList[idx], ...newAddress };
    } else {
      updatedList.push(newAddress);
    }

    // Ensure all other addresses are not marked as default
    updatedList = updatedList.map((a: any) => ({
      ...a,
      isDefault: a.id === addressId,
    }));

    await setDoc(customerDoc.ref, {
      addresses: updatedList,
      defaultAddress: newAddress,
      hasAddresses: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log(`[AddressSync] ✅ Successfully updated default address in SP1 customers/${slCode}`);

    // 3. Sync to SP2 addresses collection and users/{userId}.addresses list
    if (dbSP2) {
      try {
        const usersRef = collection(dbSP2, 'users');
        const q = query(usersRef, where('slCode', '==', slCode), firestoreLimit(1));
        const sp2Snap = await getDocs(q);
        if (!sp2Snap.empty) {
          const sp2UserDoc = sp2Snap.docs[0];
          const sp2UserData = sp2UserDoc.data();
          const sp2AddressRef = doc(dbSP2, 'addresses', addressId);
          
          // Write/update address subcollection doc in SP2
          await setDoc(sp2AddressRef, {
            ...newAddress,
            userId: sp2UserDoc.id, // SP2 uses the uid (e.g. 1911) as userId!
            profileLastUpdatedBy: 'admin',
            updatedAt: new Date().toISOString(),
            ...(existingDefault ? {} : { createdAt: new Date().toISOString() }),
          }, { merge: true });

          // Update embedded addresses list in SP2 users/{userId} doc
          const currentSp2Addresses = Array.isArray(sp2UserData.addresses) ? sp2UserData.addresses : [];
          let updatedSp2List = [...currentSp2Addresses];
          const sp2Idx = updatedSp2List.findIndex((a: any) => a.id === addressId);
          if (sp2Idx > -1) {
            updatedSp2List[sp2Idx] = { ...updatedSp2List[sp2Idx], ...newAddress, userId: sp2UserDoc.id };
          } else {
            updatedSp2List.push({ ...newAddress, userId: sp2UserDoc.id });
          }

          updatedSp2List = updatedSp2List.map((a: any) => ({
            ...a,
            isDefault: a.id === addressId,
            isPrimary: a.id === addressId || a.isPrimary,
          }));

          await setDoc(sp2UserDoc.ref, {
            addresses: updatedSp2List,
            profileLastUpdatedBy: 'admin',
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          console.log(`[AddressSync] ✅ Successfully synced updated address to SP2 addresses collection and user doc for user ${slCode}`);
        } else {
          console.warn(`[AddressSync] Matching user for slCode "${slCode}" not found in SP2. Skipping SP2 address sync.`);
        }
      } catch (sp2Err) {
        console.error('[AddressSync] Failed to sync address to SP2:', sp2Err);
      }
    }
  } catch (err) {
    console.error('[AddressSync] Error in updateCustomerDeliveryAddress:', err);
  }
}

