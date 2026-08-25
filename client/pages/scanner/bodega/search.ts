import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, limit, doc, getDoc, orderBy, updateDoc } from 'firebase/firestore';
import { ScanResult, getAbbr, getGradient } from './types';
import { getCustomerBySlCode, findCustomerBySlCode } from '@/lib/services/matching';

export interface SearchOptions {
  recentDaysOnly?: boolean;
}

// ─── Input cleaner ───────────────────────────────────────────────────────────
// HID barcode scanners often emit non-printable control chars (STX, ETX) and
// optional AIM Symbology Identifiers (e.g. ]C1, ]d2). Strip them so we get a
// clean tracking number identical to what's stored in Firestore.
function cleanInput(raw: string): string {
  let cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim();
  if (cleaned.startsWith(']') && cleaned.length > 3) {
    cleaned = cleaned.substring(3);
  }
  // Also strip whitespace, dashes, and underscores that scanners sometimes
  // inject between segments — Nova / sea-manifest store the bare alphanumeric.
  cleaned = cleaned.replace(/[\s\-_]+/g, '');
  return cleaned;
}

// ─── Dedup cache — 5s TTL ────────────────────────────────────────────────────
const _cache = new Map<string, { result: ScanResult | null; ts: number }>();
const CACHE_TTL_MS = 5_000; // Reduced to 5s to prevent stale values on admin updates

function _cacheGet(key: string): ScanResult | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return undefined;
  }
  return entry.result;
}

// ─── Public Cloud Function callable ─────────────────────────────────────────
// `slScannerLookup` runs with Admin SDK privileges and accepts unauthenticated
// requests, so the public `/scanner/bodega` kiosk URL doesn't need Firebase
// Auth.  Server-side input is cleaned and only safe fields are returned.
interface ScannerLookupResponse {
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

const functions = getFunctions(app, 'us-central1');
const scannerLookupCallable = httpsCallable<{ tracking: string }, ScannerLookupResponse>(
  functions,
  'slScannerLookup',
);

export async function searchPackage(
  raw: string,
  options: SearchOptions = {},
): Promise<ScanResult | null> {
  const cleaned = cleanInput(raw);
  if (cleaned.length < 6) return null;

  const recentDaysOnly = !!options.recentDaysOnly;
  const cacheKey = `${cleaned.toUpperCase()}${recentDaysOnly ? '_5D' : ''}`;

  // Skip cache in DEV so each scan hits the function — easier debugging.
  if (!import.meta.env.DEV) {
    const cached = _cacheGet(cacheKey);
    if (cached !== undefined) return cached;
  }

  // 1. DIRECT FIRESTORE LOOKUP FOR MASTER PACKAGES AND LOCAL PACKAGES
  try {
    let docFound: any = null;
    let docSnap: any = null;

    // Prioritize direct getDoc lookup by tracking ID
    try {
      const docRef = doc(db, 'packages', cleaned.toUpperCase());
      docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        docFound = docSnap.data();
      }
    } catch (err) {
      console.warn('[scanner] Direct document getDoc failed:', err);
    }

    if (!docFound) {
      const packagesRef = collection(db, 'packages');
      const candidates = [cleaned.toUpperCase(), raw.trim().toUpperCase()];
      
      // Reconstruct dash format if it's a potential master package (e.g. SL6604-20260527193512)
      const masterMatch = cleaned.toUpperCase().match(/^(SL\d+)(\d{14})$/);
      if (masterMatch) {
        candidates.push(`${masterMatch[1]}-${masterMatch[2]}`);
      }

      // First try: query by trackingNumberCleaned for instant master package match (with or without dashes)
      const qClean = query(packagesRef, where('trackingNumberCleaned', '==', cleaned.toUpperCase()), limit(1));
      const snapClean = await getDocs(qClean);
      if (!snapClean.empty) {
        docFound = snapClean.docs[0].data();
      }

      if (!docFound) {
        for (const cand of candidates) {
          const q = query(packagesRef, where('trackingNumber', '==', cand), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            docFound = snap.docs[0].data();
            break;
          }
          
          // Fallback check on 'tracking' property
          const q2 = query(packagesRef, where('tracking', '==', cand), limit(1));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            docFound = snap2.docs[0].data();
            break;
          }
        }
      }
    }

    // ── 1.1 Suffix matching for trailing 6-8 digits ─────────────────────────
    if (!docFound && cleaned.length >= 6) {
      const candidateDocs: any[] = [];
      const cleanUpper = cleaned.toUpperCase();

      if (recentDaysOnly) {
        // Restricted Scope: Query manifests processed in the last 5 days
        try {
          const fiveDaysAgoMs = Date.now() - 5 * 24 * 60 * 60 * 1000;
          const fiveDaysAgoISO = new Date(fiveDaysAgoMs).toISOString();

          const recentManifestsSnap = await getDocs(
            query(collection(db, 'manifests'), where('processedAt', '>=', fiveDaysAgoISO), limit(30))
          );
          const manifestIds = recentManifestsSnap.docs.map(d => d.id);

          if (manifestIds.length > 0) {
            const pkgSnaps = await Promise.all(
              manifestIds.slice(0, 30).map(mId =>
                getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', mId), limit(150)))
              )
            );
            for (const snap of pkgSnaps) {
              snap.docs.forEach(d => candidateDocs.push(d.data()));
            }
          }
        } catch (err) {
          console.warn('[scanner] Recent manifest suffix lookup failed:', err);
        }
      } else {
        // Global Scope fallback: fetch recent packages
        try {
          const snapRecent = await getDocs(
            query(collection(db, 'packages'), orderBy('createdAt', 'desc'), limit(300))
          );
          snapRecent.docs.forEach(d => candidateDocs.push(d.data()));
        } catch {
          try {
            const snapRecent = await getDocs(query(collection(db, 'packages'), limit(300)));
            snapRecent.docs.forEach(d => candidateDocs.push(d.data()));
          } catch {}
        }
      }

      // Filter in memory by trailing suffix match
      const suffixMatches = candidateDocs.filter(d => {
        const tr = String(d.trackingNumber || d.tracking || '').toUpperCase();
        const trClean = tr.replace(/[\s\-_]+/g, '');
        return tr.endsWith(cleanUpper) || trClean.endsWith(cleanUpper);
      });

      if (suffixMatches.length > 0) {
        // Sort by timestamp descending (most recent first)
        suffixMatches.sort((a, b) => {
          const timeA = new Date(a.scannedAt || a.updatedAt || a.createdAt || a.processedAt || 0).getTime();
          const timeB = new Date(b.scannedAt || b.updatedAt || b.createdAt || b.processedAt || 0).getTime();
          return timeB - timeA;
        });
        docFound = suffixMatches[0];
      }
    }

    if (docFound) {
      const ruta = docFound.ruta || '';
      let customerName = docFound.customerName || docFound.nombreCliente || '';
      const slCode = docFound.slCode || '';

      if (customerName.toLowerCase().startsWith('cliente pre-alertado') && slCode) {
        const cachedCust = getCustomerBySlCode(slCode);
        if (cachedCust && cachedCust.fullName && !cachedCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
          customerName = cachedCust.fullName;
          const pkgId = docSnap?.id || docFound.id || docFound.trackingNumber;
          if (pkgId) {
            updateDoc(doc(db, 'packages', pkgId), { customerName: cachedCust.fullName, nombreCliente: cachedCust.fullName }).catch(() => {});
          }
        }
      }

      const result: ScanResult = {
        id: docSnap?.id || docFound.id || docFound.trackingNumber || cacheKey,
        tracking: docFound.trackingNumber || cacheKey,
        ruta,
        routeAbbr: ruta ? getAbbr(ruta) : '?',
        routeGradient: getGradient(ruta),
        customerName,
        slCode,
        status: docFound.status || 'received',
        requiresPermit: !!docFound.requiresPermit,
        consolidationEnabled: !!docFound.consolidationEnabled,
        pendingUserAssignment: !!docFound.pendingUserAssignment,
        weight: docFound.weight,
        manifestNumber: docFound.manifestNumber,
        
        // Master Package custom fields
        isMasterPackage: !!docFound.isMasterPackage,
        groupedTrackings: docFound.groupedTrackings || [],
        packageCount: docFound.packageCount,
        totalAmount: docFound.totalAmount,
        encomiendaServiceName: docFound.encomiendaServiceName,
      };
      
      _cache.set(cacheKey, { result, ts: Date.now() });
      
      if (import.meta.env.DEV) {
        console.info('[scanner] Package found in Firestore directly:', { tracking: result.tracking, isMaster: result.isMasterPackage });
      }
      return result;
    }
  } catch (dbErr) {
    console.warn('[scanner] Direct Firestore query failed, falling back to Cloud Function:', dbErr);
  }

  // 2. FALLBACK TO CLOUD FUNCTION LOOKUP
  try {
    const response = await scannerLookupCallable({ tracking: cleaned });
    const payload = response.data;

    if (!payload?.found || !payload.data) {
      if (import.meta.env.DEV) {
        console.warn('[scanner] Package not found:', { raw, cleaned });
      }
      _cache.set(cacheKey, { result: null, ts: Date.now() });
      return null;
    }

    const d = payload.data;
    const ruta = d.ruta || '';
    const result: ScanResult = {
      id: d.tracking || cacheKey,
      tracking: d.tracking || cacheKey,
      ruta,
      routeAbbr: ruta ? getAbbr(ruta) : '?',
      routeGradient: getGradient(ruta),
      customerName: d.customerName || '',
      slCode: d.slCode || '',
      status: d.status || 'received',
      requiresPermit: !!d.requiresPermit,
      consolidationEnabled: !!d.consolidationEnabled,
      pendingUserAssignment: !!d.pendingUserAssignment,
      weight: d.weight,
      manifestNumber: d.manifestNumber,
      isMasterPackage: !!(d as any).isMasterPackage,
      groupedTrackings: (d as any).groupedTrackings || [],
      packageCount: (d as any).packageCount,
      totalAmount: (d as any).totalAmount,
      encomiendaServiceName: (d as any).encomiendaServiceName,
    };
    _cache.set(cacheKey, { result, ts: Date.now() });

    if (import.meta.env.DEV) {
      console.info('[scanner] Package found via CF:', { tracking: result.tracking, ruta, slCode: result.slCode });
    }
    return result;
  } catch (err: any) {
    if (import.meta.env.DEV) {
      console.error('[scanner] slScannerLookup failed:', err);
    }
    _cache.set(cacheKey, { result: null, ts: Date.now() });
    return null;
  }
}
