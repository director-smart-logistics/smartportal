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
import { preAlertMatchKeys, repeatedTrackingIndices } from './prealert-match-keys';
export { preAlertMatchKeys, repeatedTrackingIndices };

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
  /**
   * N2: the tracking is pre-alerted by 2+ different accounts. found is false (no P, no automatic
   * assignment) and these are the slCodes in conflict, so the operator can decide.
   */
  ambiguousSlCodes?: string[];
  /**
   * Saved with the manifest: the tracking appeared 2+ times in it when the admin saved (RED "P").
   * The packages collection keeps one package per tracking, so a re-opened manifest can no longer
   * see the repetition — this flag keeps the RED "P" faithful to what was saved.
   */
  repeatedInManifest?: boolean;
}

/**
 * The only source of pre-alerts: SP2 `pre_alerts` (Phase 1). There is no fallback to SP1's
 * database — its `pre_alerts` copy produced ghost matches (N3).
 *
 * @returns {Firestore} The Firestore instance pointing to SP2 pre-alerts
 */
export function getPreAlertsDatabase(): Firestore {
  return dbSP2;
}

/**
 * Owner of a resolved pre-alert: only the slCode stored on the pre-alert (N1). Never derived
 * from the document id or anything else. null when not found.
 */
export function preAlertInfoOwner(info: PreAlertInfo | undefined | null): string | null {
  if (!info?.found || !info.slCode) return null;
  return storedPreAlertSlCode({ slCode: info.slCode });
}

/** What a live result says about one tracking: one owner, several accounts, or nothing. */
function livePreAlertSignature(info: PreAlertInfo | undefined): string {
  if (info?.found) return `P:${preAlertInfoOwner(info) ?? ''}`;
  if (info?.ambiguousSlCodes?.length) return `S:${[...info.ambiguousSlCodes].sort().join(',')}`;
  return '-';
}

/**
 * F1.3 — compares a new live result with the previous one (and updates `lastSeen`):
 * - changed:   normalized trackings whose pre-alert result changed (the first result: all);
 * - withdrawn: trackings that HAD one owner and no longer do (cancelled, changed, now several
 *              accounts) — the admin must be told; nothing is reverted automatically.
 */
export function diffLivePreAlerts(
  lastSeen: Map<string, string>,
  map: Map<string, PreAlertInfo>,
): { changed: Set<string>; withdrawn: string[] } {
  const changed = new Set<string>();
  const withdrawn: string[] = [];
  map.forEach((info, t) => {
    const key = t.toUpperCase().trim();
    const sig = livePreAlertSignature(info);
    const before = lastSeen.get(key);
    if (before !== sig) {
      changed.add(key);
      if (before?.startsWith('P:') && !sig.startsWith('P:')) withdrawn.push(t);
    }
    lastSeen.set(key, sig);
  });
  return { changed, withdrawn };
}

/**
 * Validates whether a Firestore pre-alert document is active, non-terminal,
 * unconsumed by previous manifests/invoices, not delivered, and within the temporal window (PREALERT_MATCH_WINDOW_DAYS).
 *
 * @param {any} data The raw Firestore document data
 * @param {string} [currentManifestNumber] Optional manifest number currently being edited/re-verified
 * @returns {boolean} True if the pre-alert is eligible to match incoming manifests
 */
/**
 * How long a pre-alert can match a manifest row (decision 2026-09-25: 90 days, same in SP2).
 * Real gap pre-alert → manifest (audit 2026-09-24): median 12 days, p99 42, max 86.
 */
export const PREALERT_MATCH_WINDOW_DAYS = 90;

export function isEligiblePreAlert(data: any, currentManifestNumber?: string): boolean {
  if (!data) return false;
  if (data.active === false) return false;

  // N6: SP2 flags a pre-alert it could not tie to a valid account (invalid slCode, slCode of
  // another account...). Such a pre-alert must never decide Nova's customer.
  if (data.needsReview === true) return false;

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
  // N4: a consumed pre-alert (manifested/processed) only counts again inside ITS OWN manifest
  // (re-verifying that manifest). Before, any manifest number was enough: re-verifying
  // manifest B reassigned a pre-alert already used in manifest A.
  if (status === 'manifested' || status === 'processed') {
    const ownManifest = String(data.manifestNumber || data.manifestId || '').trim();
    if (!currentManifestNumber || !ownManifest || ownManifest !== String(currentManifestNumber).trim()) return false;
  }

  // 5. Temporal window (N5): only pre-alerts declared in the last PREALERT_MATCH_WINDOW_DAYS.
  //    A pre-alert WITHOUT a readable date is not eligible: before, it matched forever and a
  //    recycled carrier number could be assigned to a customer from seasons ago.
  const dateField = data.preAlertDate || data.createdAt || data.submittedAt;
  let dateObj: Date | null = null;
  if (dateField && typeof dateField.toDate === 'function') {
    dateObj = dateField.toDate();
  } else if (typeof dateField === 'string' || typeof dateField === 'number') {
    dateObj = new Date(dateField);
  }
  if (!dateObj || isNaN(dateObj.getTime())) return false;
  const ageDays = (Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > PREALERT_MATCH_WINDOW_DAYS) return false;

  return true;
}

/**
 * Owner of a pre-alert FOR MATCHING (Nova's P badge and automatic customer assignment):
 * ONLY the slCode stored on the pre-alert itself ('SL' + digits; digits alone are accepted as
 * 'SL' + digits). Never derived from userId or from the document id: users/2429 is SL1854 and
 * SL2429 is another person. No valid stored slCode → the pre-alert cannot assign a customer.
 */
export function storedPreAlertSlCode(data: any): string | null {
  const raw = String(data?.slCode ?? '').toUpperCase().replace(/\s+/g, '');
  const sl = /^\d+$/.test(raw) ? `SL${raw}` : raw;
  return /^SL\d+$/.test(sl) ? sl : null;
}

/**
 * N2 — the pre-alerts matching ONE tracking must belong to ONE account.
 * - 2+ different stored slCodes → no document, and those slCodes (ambiguous: nobody is guessed).
 * - one slCode (possibly several documents of the same account) → the one with a customer name
 *   first, as before.
 * - no stored slCode at all → the first candidate; the caller rejects it (N1: no owner, no P).
 */
export function pickSingleOwner(candidates: any[]): { doc: any | null; ambiguousSlCodes?: string[] } {
  const owned = candidates.filter((d) => storedPreAlertSlCode(d));
  const owners = [...new Set(owned.map((d) => storedPreAlertSlCode(d) as string))].sort();
  if (owners.length > 1) return { doc: null, ambiguousSlCodes: owners };
  if (owned.length === 0) return { doc: candidates[0] ?? null };
  const byName = [...owned].sort((a, b) => (b.displayName ? 1 : 0) - (a.displayName ? 1 : 0));
  return { doc: byName[0] };
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

/** Fields of `pre_alerts` that hold the tracking. Every path (load, live, button) queries all three. */
export const PREALERT_TRACKING_FIELDS = ['tracking', 'canonicalTracking', 'trackingNumber'] as const;

/** Whether a pre-alert document is stored under one of the keys of this manifest tracking. */
export function preAlertDocMatches(docData: any, analysis: CanonicalTrackingResult, keys = preAlertMatchKeys(analysis)): boolean {
  const fields = PREALERT_TRACKING_FIELDS.map((f) => String(docData?.[f] || '').toUpperCase().trim());
  if (fields.some((v) => v && keys.has(v))) return true;
  const docId = String(docData?._id || '').toUpperCase().trim();
  return !!analysis.canonicalTracking && docId.startsWith(`${analysis.canonicalTracking.toUpperCase()}_`);
}

function preAlertInfoFromDoc(raw: string, matchedDoc: any, slCode: string): PreAlertInfo {
  return {
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
  };
}

/**
 * THE match rule (Phase 1, F1.2), shared by the manifest load, the live listener and the
 * "Corregir por Pre-Alertas" button so they can never disagree:
 * - a document counts only if it is eligible (isEligiblePreAlert, with the current manifest) and
 *   has a stored owner (slCode);
 * - candidates come from ALL keys at once (exact + reverse variants): owner A exact and owner B
 *   by the end of the barcode is "several matches", never A silently;
 * - 2+ owners → not found + ambiguousSlCodes; one owner → that pre-alert.
 */
export function resolvePreAlertMatches(
  analyses: Map<string, CanonicalTrackingResult>,
  docs: Iterable<any>,
  currentManifestNumber?: string,
): Map<string, PreAlertInfo> {
  const owned = [...docs].filter((d) => isEligiblePreAlert(d, currentManifestNumber) && storedPreAlertSlCode(d));
  const result = new Map<string, PreAlertInfo>();
  for (const [raw, analysis] of analyses.entries()) {
    const keys = preAlertMatchKeys(analysis);
    const candidates = owned.filter((d) => preAlertDocMatches(d, analysis, keys));
    if (candidates.length === 0) {
      result.set(raw, { found: false, tracking: raw });
      continue;
    }
    const { doc, ambiguousSlCodes } = pickSingleOwner(candidates);
    if (ambiguousSlCodes) {
      console.warn(`[pre-alerts] ${raw} is pre-alerted by several accounts (${ambiguousSlCodes.join(', ')}). No automatic assignment.`);
      result.set(raw, { found: false, tracking: raw, ambiguousSlCodes });
      continue;
    }
    result.set(raw, preAlertInfoFromDoc(raw, doc, storedPreAlertSlCode(doc) as string));
  }
  return result;
}

/** Canonical analysis of each manifest tracking + every key to query. */
function analyzeTrackings(trackingNumbers: string[]): { analyses: Map<string, CanonicalTrackingResult>; tokens: string[] } {
  const analyses = new Map<string, CanonicalTrackingResult>();
  const tokens = new Set<string>();
  for (const raw of trackingNumbers) {
    const analysis = canonicalizeTracking(raw);
    if (!analysis.normalized) continue;
    analyses.set(raw, analysis);
    preAlertMatchKeys(analysis).forEach((k) => tokens.add(k));
  }
  return { analyses, tokens: [...tokens] };
}

const PREALERT_QUERY_CHUNK = 10;

/**
 * Resolves pre-alerts for the manifest trackings (one read of SP2 `pre_alerts`).
 * Same rule as the live listener: resolvePreAlertMatches.
 *
 * @param {string[]} trackingNumbers Array of tracking numbers to resolve
 * @returns {Promise<Map<string, PreAlertInfo>>} Map from queried tracking to resolved PreAlertInfo
 */
export async function batchResolvePreAlerts(
  trackingNumbers: string[],
  currentManifestNumber?: string,
  /** A query failed: the result may be incomplete — the caller must say so (E6). */
  onError?: (err: unknown) => void,
): Promise<Map<string, PreAlertInfo>> {
  if (!trackingNumbers || trackingNumbers.length === 0) return new Map();
  const { analyses, tokens } = analyzeTrackings(trackingNumbers);
  if (analyses.size === 0) return new Map();

  const preAlertsRef = collection(getPreAlertsDatabase(), 'pre_alerts');
  const docsById = new Map<string, any>();
  const queries: Promise<void>[] = [];
  for (let i = 0; i < tokens.length; i += PREALERT_QUERY_CHUNK) {
    const chunk = tokens.slice(i, i + PREALERT_QUERY_CHUNK);
    for (const field of PREALERT_TRACKING_FIELDS) {
      queries.push(
        getDocs(query(preAlertsRef, where(field, 'in', chunk)))
          .then((snap) => { snap.docs.forEach((d) => docsById.set(d.id, { ...d.data(), _id: d.id })); })
          .catch((err) => { console.warn(`[batchResolvePreAlerts] ${field} in query failed:`, err); onError?.(err); }),
      );
    }
  }
  await Promise.all(queries);
  return resolvePreAlertMatches(analyses, docsById.values(), currentManifestNumber);
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
 * Real-time listener on SP2 `pre_alerts` for the manifest trackings. Same rule as
 * batchResolvePreAlerts (resolvePreAlertMatches, with the current manifest). Each query keeps its
 * own set of documents, so a pre-alert that stops matching (tracking changed, deleted) is dropped.
 *
 * @param {string[]} trackingNumbers List of trackings to monitor
 * @param {(map: Map<string, PreAlertInfo>) => void} onChange Callback invoked with latest matches
 * @param {string} currentManifestNumber Manifest being reviewed (a pre-alert consumed by it still counts)
 * @param {(err: unknown) => void} onError A listener failed (SP2 unreachable, permissions): the
 *   result may be incomplete — the caller must say so, never stay silent (E6)
 * @returns {() => void} Unsubscribe cleanup function
 *
 * F1.3: the first onChange comes only once EVERY query delivered its first snapshot (never a
 * partial result); afterwards each snapshot calls onChange with the full, current result.
 */
export function watchPreAlerts(
  trackingNumbers: string[],
  onChange: (map: Map<string, PreAlertInfo>) => void,
  currentManifestNumber?: string,
  onError?: (err: unknown) => void,
): () => void {
  const { analyses, tokens } = analyzeTrackings(trackingNumbers || []);
  if (analyses.size === 0) {
    onChange(new Map());
    return () => {};
  }

  const preAlertsRef = collection(getPreAlertsDatabase(), 'pre_alerts');
  const docsByQuery = new Map<string, Map<string, any>>();
  const totalQueries = Math.ceil(tokens.length / PREALERT_QUERY_CHUNK) * PREALERT_TRACKING_FIELDS.length;
  const flush = () => {
    if (docsByQuery.size < totalQueries) return;   // F1.3: act only on the complete first result
    const docsById = new Map<string, any>();
    docsByQuery.forEach((docs) => docs.forEach((d, id) => docsById.set(id, d)));
    onChange(resolvePreAlertMatches(analyses, docsById.values(), currentManifestNumber));
  };

  const unsubs: (() => void)[] = [];
  for (let i = 0; i < tokens.length; i += PREALERT_QUERY_CHUNK) {
    const chunk = tokens.slice(i, i + PREALERT_QUERY_CHUNK);
    for (const field of PREALERT_TRACKING_FIELDS) {
      const key = `${field}:${i}`;
      unsubs.push(onSnapshot(
        query(preAlertsRef, where(field, 'in', chunk)),
        (snap) => {
          docsByQuery.set(key, new Map(snap.docs.map((d) => [d.id, { ...d.data(), _id: d.id }])));
          flush();
        },
        (err) => {
          console.warn(`[watchPreAlerts] ${field} listener failed:`, err);
          onError?.(err);
        },
      ));
    }
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

/**
 * Consumes (manifests/invoices) one or more pre-alerts in SP2 Firestore.
 * NOTE (2026-09-25): not called anywhere today. Kept safe (N9): only the billed customer's own
 * pre-alert is consumed, never another account's pre-alert of the same tracking.
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

      // N9: consume ONLY the pre-alert of the customer being billed. Before, every pre-alert with
      // this tracking was marked manifested/invoiced — including other customers' legitimate ones.
      // Without a valid slCode on the item nothing is consumed.
      const ownerSl = storedPreAlertSlCode({ slCode: item.slCode });
      if (!ownerSl) continue;
      const seenDocIds = new Set<string>();
      const allMatchingDocs = [...snapTracking.docs, ...snapCanonical.docs, ...snapLegacy.docs].filter((d) => {
        if (seenDocIds.has(d.id)) return false;
        seenDocIds.add(d.id);
        return storedPreAlertSlCode(d.data()) === ownerSl;
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
