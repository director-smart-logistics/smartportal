/**
 * Pre-Alert Resolution Engine (Single Source of Truth Gateway)
 * ─────────────────────────────────────────────────────────────
 * High-Integrity, Cross-Project Logistics Resolution Service.
 *
 * Architecture & Design Rationale:
 * 1. Single Source of Truth (SSOT):
 *    - Directly queries the live `pre_alerts` collection in SmartWeb (SP2 Firestore via `dbSP2`).
 *    - Eliminates intermediate sync cron jobs, latency gaps, and tombstone/ghost record accumulation.
 *    - SP1 acts as a pure consumer (read-only for matching, write-only for lifecycle state transitions).
 *
 * 2. Strict Carrier Taxonomy (GS1 / UPU S10):
 *    - DISCRETE_ALPHANUMERIC (SpeedLogistics GFUS/GSU, UPS 1Z, Amazon TBA,
 *      YunExpress YT, Cainiao LP, DHL): Atomic keys. NO numeric slicing or
 *      suffix probing is ever permitted, preventing accidental collisions
 *      (e.g. GFUS01065635648649 colliding with unrelated numeric runs).
 *    - POSTAL_COMPOSITE (USPS IMpb, FedEx GS1): Extracts 20/22-digit core
 *      by stripping `(420)` routing prefixes and evaluates canonical variants.
 *
 * 3. Consumable Entity Gate:
 *    - Rejects `active === false` (user/admin cancelled pre-alerts).
 *    - Rejects terminal/manifested states (`manifested`, `delivered`, `returned`,
 *      `cancelled`, `annulled`, `void`, `invoiced`) ensuring a pre-alert is single-use.
 *
 * 4. Temporal Sliding Window:
 *    - Excludes declarations older than 60 days to prevent false matches
 *      against recycled courier tracking numbers from past seasons.
 *
 * 5. Composite Natural Key:
 *    - Pre-alerts are deterministically keyed as `${canonicalTracking}_${slCode}`.
 *
 * @module services/pre-alert-resolver
 */

import {
  collection,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  limit as fsLimit,
  onSnapshot,
  type Firestore,
} from 'firebase/firestore';
import { db, dbSP2 } from '@/lib/firebase/config';
import { canonicalizeTracking, type CanonicalTrackingResult } from '@/lib/utils/tracking-canonicalizer';

/**
 * Resolved pre-alert matching entity.
 */
export interface PreAlertInfo {
  /** True if a valid active pre-alert was found */
  found: boolean;
  /** Original tracking string queried */
  tracking: string;
  /** Canonical tracking extracted according to carrier rules */
  canonicalTracking?: string;
  /** Customer casillero code (e.g. 'SL13') */
  slCode?: string;
  /** Customer display or full name declared on pre-alert */
  clientName?: string;
  /** Item description / contents declared by customer */
  description?: string;
  /** Declared value in USD */
  declaredValue?: number;
  /** Courier / carrier declared or detected (e.g. USPS, UPS, Amazon) */
  courier?: string;
  /** Whether an invoice file was uploaded with the pre-alert */
  hasInvoice?: boolean;
  /** Invoice download or storage URL */
  invoiceUrl?: string;
  /** Customer phone number */
  phone?: string;
  /** Firebase Auth User ID of customer who created the pre-alert */
  userId?: string;
  /** Customer email address */
  email?: string;
  /** Current pre-alert status ('pending', 'manifested', 'invoiced', etc.) */
  status?: string;
  /** Date timestamp when pre-alert was declared */
  preAlertCreatedAt?: any;
  /** Last sync timestamp */
  syncedAt?: any;
  /** Underlying SP2 document ID */
  sp2PreAlertId?: string;
}

/**
 * Returns the authoritative Firestore database instance for pre-alerts (SP2 SSOT).
 * Falls back to local db if dbSP2 is not initialized.
 *
 * @returns {Firestore} The Firestore instance pointing to SP2 pre-alerts
 */
export function getPreAlertsDatabase(): Firestore {
  return dbSP2 || db;
}

/**
 * Validates whether a Firestore pre-alert document is active, non-terminal,
 * unconsumed by previous manifests/invoices, not delivered, and within the valid temporal window (<= 60 days).
 *
 * @param {any} data The raw Firestore document data
 * @param {string} [currentManifestNumber] Optional manifest number currently being edited/re-verified
 * @returns {boolean} True if the pre-alert is eligible to match incoming manifests
 */
export function isEligiblePreAlert(data: any, currentManifestNumber?: string): boolean {
  if (!data) return false;
  if (data.active === false) return false;

  // 1. Invoices and Payments are strictly immutable / terminal
  if (
    data.invoiceId ||
    data.invoiceNumber ||
    data.invoiced === true ||
    data.paid === true ||
    data.isPaid === true ||
    data.paymentStatus === 'paid' ||
    data.settled === true
  ) {
    return false;
  }

  // 2. Package delivery confirmation & historical normalization flags
  if (
    data.delivered === true ||
    data.deliveredAt ||
    data.packageStatus === 'delivered' ||
    data.deliveryStatus === 'delivered' ||
    data.isHistoricalNormalization === true ||
    data.isHistorical === true
  ) {
    return false;
  }

  // 3. Terminal statuses
  const status = String(data.status || '').toLowerCase().trim();
  const terminalStatuses = [
    'delivered',
    'returned',
    'cancelled',
    'annulled',
    'void',
    'invoiced',
    'paid',
    'closed',
    'completed',
  ];
  if (terminalStatuses.includes(status)) {
    return false;
  }

  // If status is 'manifested' or 'processed', only allow if currentManifestNumber matches
  if (status === 'manifested' || status === 'processed') {
    if (!currentManifestNumber) return false;
  }

  // 5. Temporal window: discard declarations older than 60 days
  const dateField = data.preAlertDate || data.createdAt || data.submittedAt;
  if (dateField) {
    let dateObj: Date | null = null;
    if (typeof dateField.toDate === 'function') {
      dateObj = dateField.toDate();
    } else if (typeof dateField === 'string' || typeof dateField === 'number') {
      dateObj = new Date(dateField);
    }
    if (dateObj && !isNaN(dateObj.getTime())) {
      const ageDays = (Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > 60) return false;
    }
  }

  return true;
}

/**
 * In-memory LRU cache to resolve customer SL codes from `users/{userId}`.
 */
const userSlCodeMemoryCache = new Map<string, string>();

interface CachedCustomerProfile {
  data: CustomerProfileInfo;
  expiresAt: number;
}
const customerProfileMemoryCache = new Map<string, CachedCustomerProfile>();
const CUSTOMER_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function invalidateCustomerProfileCache(slCode?: string) {
  if (slCode) {
    customerProfileMemoryCache.delete(slCode.toUpperCase().trim());
  } else {
    customerProfileMemoryCache.clear();
  }
}

/**
 * Resolves customer SL code from user document if missing on pre-alert document.
 *
 * @param {Firestore} targetDb The SP2 Firestore instance
 * @param {any} docData Pre-alert document data
 * @returns {Promise<string | undefined>} The normalized SL Code (e.g. 'SL13') or undefined
 */
export async function resolveCustomerSlCode(
  targetDb: Firestore,
  docData: any
): Promise<string | undefined> {
  if (docData.slCode) {
    let sl = String(docData.slCode).toUpperCase().trim();
    if (!sl.startsWith('SL')) sl = `SL${sl}`;
    return sl;
  }

  // Check composite doc ID pattern e.g. '1Z1R054E0343790488_SL261320' or 'SL261320-...'
  if (docData._id) {
    const idStr = String(docData._id);
    const m = idStr.match(/_(SL\d+)$/i) || idStr.match(/^(SL\d+)-/i) || idStr.match(/_(\d{3,7})$/);
    if (m) {
      let sl = m[1].toUpperCase();
      if (!sl.startsWith('SL')) sl = `SL${sl}`;
      return sl;
    }
  }

  if (docData.userId) {
    const userIdStr = String(docData.userId);
    if (userSlCodeMemoryCache.has(userIdStr)) {
      return userSlCodeMemoryCache.get(userIdStr);
    }
    try {
      const userSnap = await getDoc(doc(targetDb, 'users', userIdStr));
      if (userSnap.exists()) {
        let sl = userSnap.data()?.slCode;
        if (sl) {
          sl = String(sl).toUpperCase().trim();
          if (!sl.startsWith('SL')) sl = `SL${sl}`;
          userSlCodeMemoryCache.set(userIdStr, sl);
          return sl;
        }
      }
      // Also check customers collection in targetDb
      const custSnap = await getDoc(doc(targetDb, 'customers', userIdStr));
      if (custSnap.exists()) {
        let sl = custSnap.data()?.slCode;
        if (sl) {
          sl = String(sl).toUpperCase().trim();
          if (!sl.startsWith('SL')) sl = `SL${sl}`;
          userSlCodeMemoryCache.set(userIdStr, sl);
          return sl;
        }
      }
    } catch {
      // If targetDb user lookup failed (e.g. SP2 auth boundary), fallback to SP1 db
    }

    if (targetDb !== db) {
      try {
        const localUserSnap = await getDoc(doc(db, 'users', userIdStr));
        if (localUserSnap.exists()) {
          let sl = localUserSnap.data()?.slCode;
          if (sl) {
            sl = String(sl).toUpperCase().trim();
            if (!sl.startsWith('SL')) sl = `SL${sl}`;
            userSlCodeMemoryCache.set(userIdStr, sl);
            return sl;
          }
        }
        const localCustSnap = await getDoc(doc(db, 'customers', userIdStr));
        if (localCustSnap.exists()) {
          let sl = localCustSnap.data()?.slCode;
          if (sl) {
            sl = String(sl).toUpperCase().trim();
            if (!sl.startsWith('SL')) sl = `SL${sl}`;
            userSlCodeMemoryCache.set(userIdStr, sl);
            return sl;
          }
        }
      } catch (localErr) {
        console.warn('[PreAlertResolver] Local user resolution failed for userId:', userIdStr, localErr);
      }
    }

    // 4. If userId is pure numeric digits (e.g. '1796'), it represents legacy SL1796
    if (/^\d+$/.test(userIdStr)) {
      const numericSl = `SL${userIdStr}`;
      userSlCodeMemoryCache.set(userIdStr, numericSl);
      return numericSl;
    }
  }

  return undefined;
}

export interface CustomerProfileInfo {
  slCode?: string;
  displayName?: string;
  dni?: string;
  email?: string;
  phone?: string;
}

/**
 * Resolves full customer details (SL code, name, DNI, email, phone) for a pre-alert document,
 * enriching legacy or denormalized records on the fly with in-memory caching to eliminate redundant reads.
 */
export async function resolveCustomerFullProfile(
  targetDb: Firestore,
  preAlertData: any
): Promise<CustomerProfileInfo> {
  const info: CustomerProfileInfo = {
    slCode: preAlertData.slCode || '',
    displayName: preAlertData.displayName || preAlertData.fullName || '',
    dni: preAlertData.dni || preAlertData.cedula || '',
    email: preAlertData.email || '',
    phone: preAlertData.phone || '',
  };

  if (!info.slCode) {
    info.slCode = (await resolveCustomerSlCode(targetDb, preAlertData)) || '';
  }

  const normalizedSl = info.slCode ? info.slCode.toUpperCase().trim() : '';

  // Check in-memory profile cache first
  if (normalizedSl && customerProfileMemoryCache.has(normalizedSl)) {
    const cached = customerProfileMemoryCache.get(normalizedSl)!;
    if (Date.now() < cached.expiresAt) {
      if (!info.displayName) info.displayName = cached.data.displayName || '';
      if (!info.dni) info.dni = cached.data.dni || '';
      if (!info.email) info.email = cached.data.email || '';
      if (!info.phone) info.phone = cached.data.phone || '';
      return info;
    } else {
      customerProfileMemoryCache.delete(normalizedSl);
    }
  }

  // If slCode is known but contact details are missing, query customers collection in SP1
  if (normalizedSl && (!info.displayName || !info.dni || !info.email)) {
    try {
      const q = query(collection(db, 'customers'), where('slCode', '==', normalizedSl), fsLimit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const cData = snap.docs[0].data();
        if (!info.displayName) info.displayName = cData.fullName || cData.name || '';
        if (!info.dni) info.dni = cData.dni || cData.cedula || '';
        if (!info.email) info.email = cData.email || '';
        if (!info.phone) info.phone = cData.phone || '';
      }
    } catch {
      // ignore
    }
  }

  // Cache the resolved profile
  if (normalizedSl) {
    customerProfileMemoryCache.set(normalizedSl, {
      data: { ...info },
      expiresAt: Date.now() + CUSTOMER_PROFILE_CACHE_TTL_MS,
    });
  }

  return info;
}

/**
 * Batch resolves pre-alerts for an array of tracking numbers in real-time.
 * Uses canonical carrier analysis and deterministic matching to prevent ghost collisions.
 *
 * @param {string[]} trackingNumbers Array of tracking numbers to resolve
 * @returns {Promise<Map<string, PreAlertInfo>>} Map from queried tracking to resolved PreAlertInfo
 */
export async function batchResolvePreAlerts(
  trackingNumbers: string[],
  currentManifestNumber?: string
): Promise<Map<string, PreAlertInfo>> {
  const result = new Map<string, PreAlertInfo>();
  if (!trackingNumbers || trackingNumbers.length === 0) return result;

  const targetDb = getPreAlertsDatabase();
  const preAlertsRef = collection(targetDb, 'pre_alerts');
  const CHUNK_SIZE = 10;

  // 1. Analyze and canonicalize all input trackings
  const analyses = new Map<string, CanonicalTrackingResult>();
  const searchTokens = new Set<string>();

  for (const raw of trackingNumbers) {
    const analysis = canonicalizeTracking(raw);
    if (!analysis.normalized) continue;
    analyses.set(raw, analysis);
    analysis.trackingVariants.forEach((t) => searchTokens.add(t));
    if (analysis.canonicalTracking) searchTokens.add(analysis.canonicalTracking);
  }

  if (analyses.size === 0) return result;

  const tokensList = Array.from(searchTokens);
  const matchedDocsMap = new Map<string, any>();

  // 2. Fetch pre-alerts matching canonical tokens
  const queryPromises: Promise<void>[] = [];

  for (let i = 0; i < tokensList.length; i += CHUNK_SIZE) {
    const chunk = tokensList.slice(i, i + CHUNK_SIZE);

    // Search by 'tracking'
    queryPromises.push(
      getDocs(query(preAlertsRef, where('tracking', 'in', chunk)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            const data = d.data();
            if (isEligiblePreAlert(data, currentManifestNumber)) {
              matchedDocsMap.set(d.id, { ...data, _id: d.id });
            }
          });
        })
        .catch((err) => {
          console.warn('[batchResolvePreAlerts] tracking in query failed:', err);
        })
    );

    // Search by 'canonicalTracking'
    queryPromises.push(
      getDocs(query(preAlertsRef, where('canonicalTracking', 'in', chunk)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            const data = d.data();
            if (isEligiblePreAlert(data, currentManifestNumber)) {
              matchedDocsMap.set(d.id, { ...data, _id: d.id });
            }
          });
        })
        .catch((err) => {
          console.warn('[batchResolvePreAlerts] canonicalTracking in query failed:', err);
        })
    );

    // Search by legacy 'trackingNumber'
    queryPromises.push(
      getDocs(query(preAlertsRef, where('trackingNumber', 'in', chunk)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            const data = d.data();
            if (isEligiblePreAlert(data, currentManifestNumber)) {
              matchedDocsMap.set(d.id, { ...data, _id: d.id });
            }
          });
        })
        .catch((err) => {
          console.warn('[batchResolvePreAlerts] trackingNumber in query failed:', err);
        })
    );
  }

  await Promise.all(queryPromises);

  // Resilient fallback: if targetDb was dbSP2 and returned 0 matches, query db
  if (matchedDocsMap.size === 0 && targetDb !== db) {
    const localRef = collection(db, 'pre_alerts');
    const fallbackPromises: Promise<void>[] = [];
    for (let i = 0; i < tokensList.length; i += CHUNK_SIZE) {
      const chunk = tokensList.slice(i, i + CHUNK_SIZE);
      fallbackPromises.push(
        getDocs(query(localRef, where('tracking', 'in', chunk)))
          .then((snap) => {
            snap.docs.forEach((d) => {
              const data = d.data();
              if (isEligiblePreAlert(data, currentManifestNumber)) {
                matchedDocsMap.set(d.id, { ...data, _id: d.id });
              }
            });
          })
          .catch(() => {}),
        getDocs(query(localRef, where('canonicalTracking', 'in', chunk)))
          .then((snap) => {
            snap.docs.forEach((d) => {
              const data = d.data();
              if (isEligiblePreAlert(data, currentManifestNumber)) {
                matchedDocsMap.set(d.id, { ...data, _id: d.id });
              }
            });
          })
          .catch(() => {}),
        getDocs(query(localRef, where('trackingNumber', 'in', chunk)))
          .then((snap) => {
            snap.docs.forEach((d) => {
              const data = d.data();
              if (isEligiblePreAlert(data, currentManifestNumber)) {
                matchedDocsMap.set(d.id, { ...data, _id: d.id });
              }
            });
          })
          .catch(() => {})
      );
    }
    await Promise.all(fallbackPromises);
  }

  // 3. Match each input tracking deterministically
  for (const [raw, analysis] of analyses.entries()) {
    let matchedDoc: any = null;

    // Direct Exact match on canonicalTracking or composite docId
    const candidates: any[] = [];
    for (const docData of matchedDocsMap.values()) {
      const docT = (docData.tracking || docData.trackingNumber || '').toUpperCase().trim();
      const docC = (docData.canonicalTracking || '').toUpperCase().trim();
      const docId = String(docData._id || '').toUpperCase().trim();

      if (
        docT === analysis.canonicalTracking ||
        docC === analysis.canonicalTracking ||
        docT === analysis.normalized ||
        docId.startsWith(`${analysis.canonicalTracking}_`)
      ) {
        candidates.push(docData);
      }
    }

    if (candidates.length > 0) {
      // Prioritize candidate with explicit slCode and full customer profile
      candidates.sort((a, b) => {
        const scoreA = (a.slCode ? 2 : 0) + (a.displayName ? 1 : 0);
        const scoreB = (b.slCode ? 2 : 0) + (b.displayName ? 1 : 0);
        return scoreB - scoreA;
      });
      matchedDoc = candidates[0];
    }

    // Postal composite fallback (USPS / FedEx only)
    if (!matchedDoc && analysis.carrierType === 'POSTAL_COMPOSITE') {
      const postalCandidates: any[] = [];
      for (const docData of matchedDocsMap.values()) {
        const docT = (docData.tracking || docData.trackingNumber || '').toUpperCase().trim();
        const docC = (docData.canonicalTracking || '').toUpperCase().trim();
        if (analysis.trackingVariants.includes(docT) || analysis.trackingVariants.includes(docC)) {
          postalCandidates.push(docData);
        }
      }
      if (postalCandidates.length > 0) {
        postalCandidates.sort((a, b) => {
          const scoreA = (a.slCode ? 2 : 0) + (a.displayName ? 1 : 0);
          const scoreB = (b.slCode ? 2 : 0) + (b.displayName ? 1 : 0);
          return scoreB - scoreA;
        });
        matchedDoc = postalCandidates[0];
      }
    }

    if (matchedDoc) {
      const slCode = await resolveCustomerSlCode(targetDb, matchedDoc);
      // AI-GUARD: A pre-alert without a valid SL code (e.g. unverified/orphan user)
      // must NEVER hijack a manifest row or overwrite a customer match.
      if (!slCode || !slCode.startsWith('SL') || slCode.length < 3) {
        console.warn(
          `[batchResolvePreAlerts] Ineligible pre-alert: missing valid slCode for tracking ${raw} (userId: ${matchedDoc.userId}). Skipping auto-association.`
        );
        result.set(raw, { found: false, tracking: raw });
      } else {
        result.set(raw, {
          found: true,
          tracking: raw,
          canonicalTracking: matchedDoc.canonicalTracking || matchedDoc.tracking || undefined,
          slCode,
          clientName: matchedDoc.displayName || matchedDoc.fullName || matchedDoc.name || undefined,
          userId: matchedDoc.userId ?? undefined,
          email: matchedDoc.email ?? undefined,
          phone: matchedDoc.phone ?? undefined,
          status: matchedDoc.status ?? undefined,
          description: matchedDoc.description || matchedDoc.notes || matchedDoc.itemDescription || matchedDoc.declaracion || undefined,
          declaredValue: typeof matchedDoc.declaredValue === 'number' ? matchedDoc.declaredValue : (typeof matchedDoc.value === 'number' ? matchedDoc.value : (matchedDoc.monto ? Number(matchedDoc.monto) : undefined)),
          courier: matchedDoc.courier || matchedDoc.carrier || undefined,
          hasInvoice: !!(matchedDoc.invoiceUrl || matchedDoc.hasInvoice || matchedDoc.invoiceUploaded || matchedDoc.invoiceName),
          invoiceUrl: matchedDoc.invoiceUrl || undefined,
          preAlertCreatedAt: matchedDoc.preAlertDate || matchedDoc.createdAt || undefined,
          syncedAt: matchedDoc.updatedAt || undefined,
          sp2PreAlertId: matchedDoc._id ?? undefined,
        });
      }
    } else {
      result.set(raw, { found: false, tracking: raw });
    }
  }

  return result;
}

/**
 * Resolves a single tracking number against SP2 pre-alerts.
 *
 * @param {string} trackingNumber The tracking number to query
 * @returns {Promise<PreAlertInfo>} The resolution result
 */
export async function resolvePreAlert(trackingNumber: string): Promise<PreAlertInfo> {
  const analysis = canonicalizeTracking(trackingNumber);
  if (!analysis.normalized) {
    return { found: false, tracking: trackingNumber };
  }

  const map = await batchResolvePreAlerts([trackingNumber]);
  return map.get(trackingNumber) || { found: false, tracking: trackingNumber };
}

/**
 * Real-time reactive listener for pre-alerts on an array of tracking numbers.
 * Establishes chunked `onSnapshot` listeners to SP2 `pre_alerts`.
 *
 * @param {string[]} trackingNumbers List of trackings to monitor
 * @param {(map: Map<string, PreAlertInfo>) => void} onChange Callback invoked with latest matches
 * @returns {() => void} Unsubscribe cleanup function
 */
export function watchPreAlerts(
  trackingNumbers: string[],
  onChange: (map: Map<string, PreAlertInfo>) => void
): () => void {
  const CHUNK_SIZE = 10;
  const targetDb = getPreAlertsDatabase();
  const preAlertsRef = collection(targetDb, 'pre_alerts');

  const analyses = new Map<string, CanonicalTrackingResult>();
  const searchTokens = new Set<string>();

  for (const raw of trackingNumbers) {
    const analysis = canonicalizeTracking(raw);
    if (!analysis.normalized) continue;
    analyses.set(raw, analysis);
    analysis.trackingVariants.forEach((t) => searchTokens.add(t));
    if (analysis.canonicalTracking) searchTokens.add(analysis.canonicalTracking);
  }

  if (analyses.size === 0) {
    onChange(new Map());
    return () => {};
  }

  const tokensList = Array.from(searchTokens);
  const liveDocsMap = new Map<string, any>();
  const unsubs: (() => void)[] = [];

  const triggerFlush = () => {
    const result = new Map<string, PreAlertInfo>();

    for (const [raw, analysis] of analyses.entries()) {
      let matchedDoc: any = null;

      for (const docData of liveDocsMap.values()) {
        const docT = (docData.tracking || docData.trackingNumber || '').toUpperCase().trim();
        const docC = (docData.canonicalTracking || '').toUpperCase().trim();
        const docId = String(docData._id || '').toUpperCase().trim();

        if (
          docT === analysis.canonicalTracking ||
          docC === analysis.canonicalTracking ||
          docT === analysis.normalized ||
          docId.startsWith(`${analysis.canonicalTracking}_`)
        ) {
          matchedDoc = docData;
          break;
        }
      }

      if (!matchedDoc && analysis.carrierType === 'POSTAL_COMPOSITE') {
        for (const docData of liveDocsMap.values()) {
          const docT = (docData.tracking || docData.trackingNumber || '').toUpperCase().trim();
          const docC = (docData.canonicalTracking || '').toUpperCase().trim();
          if (analysis.trackingVariants.includes(docT) || analysis.trackingVariants.includes(docC)) {
            matchedDoc = docData;
            break;
          }
        }
      }

      if (matchedDoc) {
        result.set(raw, {
          found: true,
          tracking: raw,
          canonicalTracking: matchedDoc.canonicalTracking || matchedDoc.tracking || undefined,
          slCode: matchedDoc.slCode ? (matchedDoc.slCode.startsWith('SL') ? matchedDoc.slCode : `SL${matchedDoc.slCode}`) : undefined,
          clientName: matchedDoc.displayName || matchedDoc.fullName || matchedDoc.name || undefined,
          userId: matchedDoc.userId ?? undefined,
          email: matchedDoc.email ?? undefined,
          phone: matchedDoc.phone ?? undefined,
          status: matchedDoc.status ?? undefined,
          description: matchedDoc.description || matchedDoc.notes || matchedDoc.itemDescription || matchedDoc.declaracion || undefined,
          declaredValue: typeof matchedDoc.declaredValue === 'number' ? matchedDoc.declaredValue : (typeof matchedDoc.value === 'number' ? matchedDoc.value : (matchedDoc.monto ? Number(matchedDoc.monto) : undefined)),
          courier: matchedDoc.courier || matchedDoc.carrier || undefined,
          hasInvoice: !!(matchedDoc.invoiceUrl || matchedDoc.hasInvoice || matchedDoc.invoiceUploaded || matchedDoc.invoiceName),
          invoiceUrl: matchedDoc.invoiceUrl || undefined,
          preAlertCreatedAt: matchedDoc.preAlertDate || matchedDoc.createdAt || undefined,
          syncedAt: matchedDoc.updatedAt || undefined,
          sp2PreAlertId: matchedDoc._id ?? undefined,
        });
      } else {
        result.set(raw, { found: false, tracking: raw });
      }
    }

    onChange(result);
  };

  for (let i = 0; i < tokensList.length; i += CHUNK_SIZE) {
    const chunk = tokensList.slice(i, i + CHUNK_SIZE);

    const unsubTracking = onSnapshot(
      query(preAlertsRef, where('tracking', 'in', chunk)),
      (snap) => {
        snap.docs.forEach((d) => {
          const data = d.data();
          if (isEligiblePreAlert(data)) {
            liveDocsMap.set(d.id, { ...data, _id: d.id });
          } else {
            liveDocsMap.delete(d.id);
          }
        });
        triggerFlush();
      },
      () => {}
    );
    unsubs.push(unsubTracking);

    const unsubCanonical = onSnapshot(
      query(preAlertsRef, where('canonicalTracking', 'in', chunk)),
      (snap) => {
        snap.docs.forEach((d) => {
          const data = d.data();
          if (isEligiblePreAlert(data)) {
            liveDocsMap.set(d.id, { ...data, _id: d.id });
          } else {
            liveDocsMap.delete(d.id);
          }
        });
        triggerFlush();
      },
      () => {}
    );
    unsubs.push(unsubCanonical);
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

/**
 * Consumes (manifests/invoices) one or more pre-alerts in SP2 Firestore.
 * Updates status to 'manifested' or 'invoiced', sets manifestId, invoiceNumber,
 * and sets manifestedAt / invoicedAt timestamps.
 *
 * This guarantees the pre-alert is permanently consumed and excluded from future matching.
 *
 * @param {Array<{ tracking: string; slCode?: string; manifestNumber: string; invoiceNumber?: string }>} items Items to consume
 * @returns {Promise<void>}
 */
export async function batchConsumePreAlerts(
  items: Array<{
    tracking: string;
    slCode?: string;
    manifestNumber: string;
    invoiceNumber?: string;
  }>
): Promise<void> {
  if (!items || items.length === 0) return;
  const targetDb = getPreAlertsDatabase();
  const preAlertsRef = collection(targetDb, 'pre_alerts');

  for (const item of items) {
    try {
      const canonical = canonicalizeTracking(item.tracking);
      const searchTerms = new Set<string>();
      searchTerms.add(item.tracking.toUpperCase().trim());
      if (canonical.canonicalTracking) searchTerms.add(canonical.canonicalTracking);
      if (canonical.normalized) searchTerms.add(canonical.normalized);

      const tokensArray = Array.from(searchTerms).slice(0, 10);
      
      const [snapTracking, snapCanonical, snapLegacy] = await Promise.all([
        getDocs(query(preAlertsRef, where('tracking', 'in', tokensArray), fsLimit(5))),
        getDocs(query(preAlertsRef, where('canonicalTracking', 'in', tokensArray), fsLimit(5))),
        getDocs(query(preAlertsRef, where('trackingNumber', 'in', tokensArray), fsLimit(5))),
      ]);

      const seenDocIds = new Set<string>();
      const allMatchingDocs = [...snapTracking.docs, ...snapCanonical.docs, ...snapLegacy.docs].filter((d) => {
        if (seenDocIds.has(d.id)) return false;
        seenDocIds.add(d.id);
        return true;
      });

      const updatePromises = allMatchingDocs.map(async (docSnap) => {
        const updatePayload: Record<string, any> = {
          status: item.invoiceNumber ? 'invoiced' : 'manifested',
          manifestId: item.manifestNumber,
          manifestNumber: item.manifestNumber,
          manifestedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (item.invoiceNumber) {
          updatePayload.invoiceNumber = item.invoiceNumber;
          updatePayload.invoiceId = item.invoiceNumber;
          updatePayload.invoicedAt = new Date().toISOString();
        }
        await updateDoc(doc(targetDb, 'pre_alerts', docSnap.id), updatePayload);
      });

      await Promise.all(updatePromises);
    } catch (err) {
      console.warn('[PreAlertResolver] Failed to consume pre-alert for tracking:', item.tracking, err);
    }
  }
}
