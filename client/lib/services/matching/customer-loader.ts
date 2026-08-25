/**
 * Matching Engine — Customer Data Loader & Cache
 *
 * Manages the in-memory customer cache, pre-computed indexes, and all
 * cache mutation helpers (invalidate, patch ruta, by-slCode lookup).
 *
 * Data flow:
 *  1. `loadCustomers()` calls `slListCustomers` Firebase callable → SP1 customers
 *  2. Merges `temp_customers` Firestore collection for unregistered clients
 *  3. Builds `CustomerIndexes` for O(1) lookups used by `match-engine.ts`
 *
 * The cache has a 10-minute TTL — customers change infrequently.
 *
 * @module matching/customer-loader
 */

import type { CustomerData, CustomerIndexes, TokenizedCustomer } from './types';
import { normalize, meaningfulTokens, phoneticKey } from './normalize';
import { firebaseApi } from '../../firebase/callable';
import { collection, getDocs, doc, getDoc, query, where, limit } from 'firebase/firestore';
import { db, dbSP2 } from '../../firebase/config';
import { resolveCustomerFullName } from '@/lib/utils/customer-name';

// ─── Cache State ────────────────────────────────────────────────────────────────

let cachedCustomers: CustomerData[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour — on-demand customer cache; mutated via invalidateCustomerCache / patchCustomerRutaInCache

let cachedIndexes: CustomerIndexes | null = null;

// ─── Index Builder ──────────────────────────────────────────────────────────────

/**
 * Build pre-computed indexes for fast lookups.
 * Called once after each customer load. All indexes are derived from
 * `normalizedName` so they automatically handle accented characters.
 */
function buildIndexes(customers: CustomerData[]): CustomerIndexes {
  const indexes: CustomerIndexes = {
    bySlCode: new Map(),
    byName: new Map(),
    byNameReversed: new Map(),
    byFirstToken: new Map(),
    byLastToken: new Map(),
    tokenData: []
  };

  for (const customer of customers) {
    // Index by SL Code
    const slCode = (customer.slCode || '').toUpperCase().trim();
    if (slCode) {
      indexes.bySlCode.set(slCode, customer);
    }

    // Index by normalized name (accent-stripped) - key for matching
    const normalizedName = customer.normalizedName || normalize(customer.fullName || customer.name);
    if (normalizedName) {
      indexes.byName.set(normalizedName, customer);
    }

    // Get name parts from normalized name (so UMAÑA → UMANA is used)
    const nameParts = normalize(customer.fullName || customer.name).split(' ').filter(p => p.length > 0);
    const reversedParts = [...nameParts].reverse();
    
    // Index by reversed name
    if (nameParts.length >= 2) {
      const reversed = reversedParts.join(' ');
      indexes.byNameReversed.set(reversed, customer);
    }

    // Pre-compute token data
    const mTokens = meaningfulTokens(nameParts);
    const firstTokenRaw = mTokens[0] || '';
    const lastTokenRaw = mTokens[mTokens.length - 1] || '';
    const firstTokenKey = firstTokenRaw ? phoneticKey(firstTokenRaw) : '';
    const lastTokenKey = lastTokenRaw && lastTokenRaw !== firstTokenRaw ? phoneticKey(lastTokenRaw) : '';
    
    const td: TokenizedCustomer = {
      customer,
      parts: nameParts,
      reversedParts,
      meaningfulParts: mTokens,
      firstTokenKey,
      lastTokenKey,
    };
    indexes.tokenData.push(td);

    // Index by first phonetic token for pre-filtering
    if (firstTokenKey) {
      const bucket = indexes.byFirstToken.get(firstTokenKey);
      if (bucket) bucket.push(customer);
      else indexes.byFirstToken.set(firstTokenKey, [customer]);
    }

    // Index by last phonetic token (apellido) — catches reverse-order names
    if (lastTokenKey) {
      const bucket = indexes.byLastToken.get(lastTokenKey);
      if (bucket) bucket.push(customer);
      else indexes.byLastToken.set(lastTokenKey, [customer]);
    }
  }

  return indexes;
}

// ─── Customer Loader ────────────────────────────────────────────────────────────

/**
 * Load customers from Firebase with caching.
 *
 * Step 1: Loads all SP1 customers via `slListCustomers` callable.
 * Step 1.5: Merges `temp_customers` for unregistered clients.
 * Step 2: Builds indexes and logs result.
 */
export async function loadCustomers(): Promise<CustomerData[]> {
  const now = Date.now();
  
  if (cachedCustomers.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedCustomers;
  }

  // ── Step 1: Load ALL SP1 customers via callable function ─────────────────────
  try {
    console.log('[CustomerMatcher] Loading customers via slListCustomers callable...');
    const res = await firebaseApi.customers.list({ limit: 10000 });
    if (res.success && res.data) {
      const docs = (res.data as any).data ?? res.data ?? [];
      cachedCustomers = (Array.isArray(docs) ? docs : []).map((data: any) => {
        const fullName = (data.fullName || data.name || '').toUpperCase().trim();
        const firstName = (data.firstName || '').toUpperCase().trim();
        const lastName = (data.lastName || '').toUpperCase().trim();
        const name = (data.name || fullName).toUpperCase().trim();
        return {
          id: data.id,
          name,
          fullName,
          normalizedName: normalize(fullName || name),
          firstName,
          lastName,
          slCode: data.slCode || data.sl_code || '',
          ruta: data.ruta || data.route || data.defaultRoute || undefined,
          consolidationEnabled: data.consolidationEnabled === true,
          email: data.email || '',
          phone: data.phone || data.phoneNumber || '',
          dni: data.dni || data.cedula || data.document || '',
        };
      }).filter((c, idx) => {
        const raw = (Array.isArray(docs) ? docs : [])[idx] as any;
        return (c.fullName || c.name) && c.slCode && raw?.status !== 'deleted';
      });
      console.log(`[CustomerMatcher] SP1: ${cachedCustomers.length} customers loaded`);
    } else {
      console.error('[CustomerMatcher] slListCustomers failed:', res.error);
    }
  } catch (error) {
    console.error('[CustomerMatcher] Error loading SP1 customers:', error);
  }

  // ── Step 1.5: Merge temp customers so Nova can match them too ───────────────
  try {
    const tempSnap = await getDocs(collection(db, 'temp_customers'));
    const existingSlCodes = new Set(cachedCustomers.map(c => c.slCode.toUpperCase()));
    for (const d of tempSnap.docs) {
      if (d.id === '--meta--') continue;
      const data = d.data();
      const slCode: string = data.slCode || d.id;
      if (!slCode || existingSlCodes.has(slCode.toUpperCase())) continue;
      if (data.status === 'deleted') continue;
      const fullName = (data.name || '').toUpperCase().trim();
      if (!fullName) continue;
      cachedCustomers.push({
        id: slCode,
        name: fullName,
        fullName,
        normalizedName: normalize(fullName),
        firstName: fullName.split(' ')[0] || '',
        lastName: fullName.split(' ').slice(1).join(' ') || '',
        slCode,
        isTemp: true,
        ruta: data.ruta || undefined,
        consolidationEnabled: data.consolidationEnabled === true,
        email: data.email || '',
        phone: data.phone || '',
        dni: '',
      });
      existingSlCodes.add(slCode.toUpperCase());
    }
    const tempCount = tempSnap.docs.filter(d => d.id !== '--meta--').length;
    if (tempCount > 0) console.log(`[CustomerMatcher] Temp customers merged: ${tempCount}`);
  } catch (e) {
    console.warn('[CustomerMatcher] Failed to load temp_customers:', e);
  }

  // Only cache if we actually got data — prevents a failed/empty load from
  // being cached for 10 minutes and blocking all subsequent retries.
  if (cachedCustomers.length > 0) {
    cacheTimestamp = now;
  }
  cachedIndexes = buildIndexes(cachedCustomers);

  console.log(`[CustomerMatcher] Database: ${cachedCustomers.length} customers loaded from SP1`);
  console.log(`[CustomerMatcher] Indexes: ${cachedIndexes.byName.size} names, ${cachedIndexes.bySlCode.size} slCodes, ${cachedIndexes.byFirstToken.size} first-token buckets`);

  return cachedCustomers;
}

// ─── Index Access ───────────────────────────────────────────────────────────────

/**
 * Get the current cached indexes. Returns null if `loadCustomers()` hasn't been called.
 */
export function getCachedIndexes(): CustomerIndexes | null {
  return cachedIndexes;
}

/**
 * Get the raw cached customers array.
 */
export function getCachedCustomers(): CustomerData[] {
  return cachedCustomers;
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────────────

/**
 * Look up a single customer by their SL code using the warm in-memory index.
 * Call after `loadCustomers()` has already been called.
 * Returns null when the slCode is not found.
 */
export async function findCustomerBySlCode(slCode: string): Promise<CustomerData | null> {
  if (!slCode) return null;
  const upper = slCode.toUpperCase().trim();
  await loadCustomers();
  
  const existing = cachedIndexes?.bySlCode.get(upper);
  if (existing) return existing;

  // Resilient SP2 Fallback: If not found in SP1, query dbSP2 users collection
  try {
    if (dbSP2) {
      // 1. Direct doc get by slCode ID
      const userDocRef = doc(dbSP2, 'users', upper);
      let userSnap = await getDoc(userDocRef);
      let userData = userSnap.exists() ? userSnap.data() : null;

      // 2. Query fallback by slCode field (uppercase & lowercase)
      if (!userData) {
        const q = query(collection(dbSP2, 'users'), where('slCode', '==', upper), limit(1));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          userData = qSnap.docs[0].data();
        }
      }

      if (!userData) {
        const qLower = query(collection(dbSP2, 'users'), where('slCode', '==', upper.toLowerCase()), limit(1));
        const qSnapLower = await getDocs(qLower);
        if (!qSnapLower.empty) {
          userData = qSnapLower.docs[0].data();
        }
      }

      // 3. Query fallback by sl_code / casillero field
      if (!userData) {
        const q2 = query(collection(dbSP2, 'users'), where('sl_code', '==', upper), limit(1));
        const qSnap2 = await getDocs(q2);
        if (!qSnap2.empty) {
          userData = qSnap2.docs[0].data();
        }
      }

      if (!userData) {
        const q3 = query(collection(dbSP2, 'users'), where('casillero', '==', upper), limit(1));
        const qSnap3 = await getDocs(q3);
        if (!qSnap3.empty) {
          userData = qSnap3.docs[0].data();
        }
      }

      if (userData) {
        const rawName = userData.displayName || userData.fullName || userData.name || '';
        const fullName = (resolveCustomerFullName(userData.firstName, userData.lastName, rawName) || rawName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || upper).toUpperCase().trim();
        const firstName = (userData.firstName || fullName.split(' ')[0] || '').toUpperCase().trim();
        const lastName = (userData.lastName || fullName.split(' ').slice(1).join(' ') || '').toUpperCase().trim();
        const resolved: CustomerData = {
          id: upper,
          name: fullName,
          fullName,
          normalizedName: normalize(fullName),
          firstName,
          lastName,
          slCode: upper,
          ruta: userData.ruta || userData.route || userData.defaultRoute || undefined,
          consolidationEnabled: userData.consolidationEnabled === true,
          email: userData.email || '',
          phone: userData.phone || userData.phoneNumber || '',
          dni: userData.dni || userData.cedula || userData.document || '',
        };

        // Inject into warm in-memory cache for O(1) subsequent lookups (Zero-Overcost)
        injectCustomerIntoCache(resolved);
        return resolved;
      }
    }
  } catch (err) {
    console.warn(`[CustomerMatcher] SP2 fallback lookup failed for ${upper}:`, err);
  }

  return null;
}

/**
 * Look up a customer by SL code from the in-memory cache (O(1)).
 * Synchronous — returns undefined if the cache is empty or code not found.
 */
export function getCustomerBySlCode(slCode: string): CustomerData | undefined {
  return cachedIndexes?.bySlCode.get(slCode.toUpperCase());
}

// ─── Cache Mutation ─────────────────────────────────────────────────────────────

/**
 * Invalidate customer cache — forces a fresh load on next access.
 */
export function invalidateCustomerCache(): void {
  cachedCustomers = [];
  cachedIndexes = null;
  cacheTimestamp = 0;
}

/**
 * Patch a single customer's ruta in the in-memory cache immediately.
 * Called by `updateCustomerRuta` so the matcher reflects the new route
 * for subsequent manifest runs without waiting for the 10-min TTL.
 */
export function patchCustomerRutaInCache(slCode: string, ruta: string): void {
  const upper = slCode.toUpperCase();
  const entry = cachedIndexes?.bySlCode.get(upper);
  if (entry) {
    entry.ruta = ruta;
  }
  const idx = cachedCustomers.findIndex(c => c.slCode.toUpperCase() === upper);
  if (idx !== -1) {
    cachedCustomers[idx] = { ...cachedCustomers[idx], ruta };
  }
}

/**
 * Patch a single customer's consolidationEnabled status in the in-memory cache immediately.
 */
export function patchCustomerConsolidationInCache(slCode: string, consolidationEnabled: boolean): void {
  const upper = slCode.toUpperCase();
  const entry = cachedIndexes?.bySlCode.get(upper);
  if (entry) {
    entry.consolidationEnabled = consolidationEnabled;
  }
  const idx = cachedCustomers.findIndex(c => c.slCode.toUpperCase() === upper);
  if (idx !== -1) {
    cachedCustomers[idx] = { ...cachedCustomers[idx], consolidationEnabled };
  }
}

/**
 * Inject a synthetic customer into the live cache + indexes.
 * Used when a customer is discovered via SP2 fallback and needs to be
 * available for subsequent matching within the same batch run.
 */
export function injectCustomerIntoCache(customer: CustomerData): void {
  if (cachedCustomers.find(c => c.slCode === customer.slCode)) return;
  cachedCustomers.push(customer);
  if (cachedIndexes) {
    cachedIndexes.bySlCode.set(customer.slCode.toUpperCase(), customer);
    cachedIndexes.byName.set(customer.normalizedName, customer);
    const synthParts = customer.normalizedName.split(' ');
    const synthMTokens = meaningfulTokens(synthParts);
    const synthFirstRaw = synthMTokens[0] ?? '';
    const synthLastRaw = synthMTokens[synthMTokens.length - 1] ?? '';
    const td: TokenizedCustomer = {
      customer,
      parts: synthParts,
      reversedParts: synthParts.slice().reverse(),
      meaningfulParts: synthMTokens,
      firstTokenKey: synthFirstRaw ? phoneticKey(synthFirstRaw) : '',
      lastTokenKey: synthLastRaw && synthLastRaw !== synthFirstRaw ? phoneticKey(synthLastRaw) : '',
    };
    cachedIndexes.tokenData.push(td);
    if (td.firstTokenKey) {
      const bucket = cachedIndexes.byFirstToken.get(td.firstTokenKey);
      if (bucket) bucket.push(customer);
      else cachedIndexes.byFirstToken.set(td.firstTokenKey, [customer]);
    }
    if (td.lastTokenKey) {
      const bucket = cachedIndexes.byLastToken.get(td.lastTokenKey);
      if (bucket) bucket.push(customer);
      else cachedIndexes.byLastToken.set(td.lastTokenKey, [customer]);
    }
  }
}
