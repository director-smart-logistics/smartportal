import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Cloud Function endpoint (SP2) ────────────────────────────────────────────
const SP2_SHIPMENT_SYNC_URL =
  import.meta.env.VITE_SP2_SHIPMENT_SYNC_URL ??
  'https://us-central1-smart-portal-2.cloudfunctions.net/slSyncShipmentsFromSp1';

// Reuse the same shared secret as encomienda-sync
const SP2_SYNC_SECRET = import.meta.env.VITE_SP2_SYNC_SECRET ?? '';

// ─── Double-confirmation layer 1: SP1-side status rank guard ────────────────
//
// Mirrors the STATUS_RANK table in sp1-shipment-sync.ts (SP2).
// Before any package is pushed, SP1 validates the status is mapped and known.
// Unknown statuses would fall through to SP2's default ('customs') — we catch
// them here first so they never reach the network call.
//
// SP2 applies the same rank check on receipt (layer 2).
// Together they form the double-confirmation: both portals must agree the
// status change is valid before it is committed.

const SP1_STATUS_RANK: Record<string, number> = {
  'pre_alerted': 0, 'pre-alerted': 0,
  'received':    1,
  'in_transit':  2, 'transit':     2,
  'customs':     3, 'retained':    3, 'held':        3,
  'consolidated':4, 'consolidacion': 4, // SP1 uses Spanish form internally
  'processed':   5,
  'on_route':    6, 'route':       6, 'pickup':      6,
  'delivered':   7, 'returned':    7,
};

/**
 * Returns true when the SP1 status value is a known, mappable status.
 * Packages with unknown statuses are filtered out before the HTTP call.
 */
function isKnownSp1Status(status: string): boolean {
  return Object.prototype.hasOwnProperty.call(SP1_STATUS_RANK, status);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SP1PackageForSync {
  id: string;
  trackingNumber: string;
  slCode?: string;
  customerName?: string;
  status: string;
  weight?: number;
  description?: string;
  origin?: string;
  destination?: string;
  ruta?: string;
  manifestNumber?: string;
  requiresPermit?: boolean;
  cost?: number;
  calculatedCost?: number;
  currency?: string;
  /**
   * When true, the SP2 Cloud Function will:
   *  1. Bypass the regression guard (SP1 admin status always wins).
   *  2. Replace all previous `sp1_sync` history entries with a single new one
   *     (ML/carrier events are preserved).
   * Use ONLY for explicit admin-triggered syncs — NOT for automatic background syncs.
   */
  forceSync?: boolean;
  /**
   * When true, allows SP2 to create the shipment if it does not already exist.
   * Used exclusively for pushing orphaned or reassigned packages that are missing in SP2.
   */
  allowCreate?: boolean;
  // Invoice linkage fields (propagated from SP1 packages collection)
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
}

export interface SyncSmartWebResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  details: SyncSmartWebDetail[];
}

export interface SyncSmartWebDetail {
  trackingNumber: string;
  slCode?: string;
  outcome: 'created' | 'updated' | 'skipped' | 'error';
  reason?: string;
}

// ─── HTTP caller ──────────────────────────────────────────────────────────────

async function callSyncFunction(
  packages: SP1PackageForSync[],
): Promise<{ ok: boolean; summary: { total: number; created: number; updated: number; skipped: number; errors: number }; results: Array<{ tracking: string; slCode: string; outcome: string; reason?: string }> }> {
  if (!SP2_SYNC_SECRET) {
    throw new Error('SP2 sync secret is not configured (VITE_SP2_SYNC_SECRET missing).');
  }

  const payload = {
    packages: packages.map(p => ({
      trackingNumber: p.trackingNumber,
      slCode:         p.slCode || 'PENDIENTE',
      status:         p.status,
      weight:         p.weight,
      description:    p.description,
      origin:         p.origin,
      ruta:           p.ruta,
      manifestNumber: p.manifestNumber,
      requiresPermit: p.requiresPermit,
      cost:           p.calculatedCost ?? p.cost,
      currency:       p.currency,
      customerName:   p.customerName || 'Cliente Desconocido',
      forceSync:      p.forceSync,
      allowCreate:    p.allowCreate,
      invoiceId:      p.invoiceId,
      invoiceNumber:  p.invoiceNumber,
      invoiceStatus:  p.invoiceStatus,
    })),
  };

  const res = await fetch(SP2_SHIPMENT_SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-sync-secret': SP2_SYNC_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Sync function error ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Main export — batch sync in chunks of 100 ───────────────────────────────

const BATCH_SIZE = 100;

export async function syncPackagesToSmartWeb(
  packages: SP1PackageForSync[],
  options?: {
    onProgress?: (current: number, total: number, tracking: string) => void;
  },
): Promise<SyncSmartWebResult> {
  const result: SyncSmartWebResult = {
    total:   packages.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors:  0,
    details: [],
  };

  if (packages.length === 0) return result;

  // ── Layer 1: filter out packages with unknown or invalid status values ────
  const validPackages: SP1PackageForSync[] = [];
  for (const pkg of packages) {
    if (!isKnownSp1Status(pkg.status)) {
      console.warn(
        `[sync-smartweb] Skipping ${pkg.trackingNumber}: unknown SP1 status "${pkg.status}" — not in STATUS_RANK map`,
      );
      result.skipped += 1;
      result.details.push({
        trackingNumber: pkg.trackingNumber,
        slCode:         pkg.slCode,
        outcome:        'skipped',
        reason:         `Unknown SP1 status: ${pkg.status}`,
      });
    } else {
      validPackages.push(pkg);
    }
  }
  if (validPackages.length === 0) return result;

  // Enrich validPackages with invoiceId / invoiceNumber / invoiceStatus from SP1 Firestore
  const trackingMap = new Map<string, { invoiceId: string | null; invoiceNumber: string | null; invoiceStatus: string | null }>();
  const trackingsToFetch = validPackages
    .filter(p => p.invoiceId === undefined)
    .map(p => p.trackingNumber.toUpperCase().trim());

  if (trackingsToFetch.length > 0) {
    const colRef = collection(db, 'packages');
    for (let i = 0; i < trackingsToFetch.length; i += 30) {
      const chunk = trackingsToFetch.slice(i, i + 30);
      try {
        const snap = await getDocs(query(colRef, where('trackingNumber', 'in', chunk)));
        snap.docs.forEach(d => {
          const data = d.data();
          const trk = String(data.trackingNumber || '').toUpperCase().trim();
          if (trk) {
            trackingMap.set(trk, {
              invoiceId: data.invoiceId || null,
              invoiceNumber: data.invoiceNumber || null,
              invoiceStatus: data.invoiceStatus || null,
            });
          }
        });
      } catch (err) {
        console.warn('[syncPackagesToSmartWeb] Enrichment query failed:', err);
      }
    }

    // Apply enriched fields to validPackages
    for (const p of validPackages) {
      if (p.invoiceId === undefined) {
        const key = p.trackingNumber.toUpperCase().trim();
        const cached = trackingMap.get(key);
        if (cached) {
          p.invoiceId = cached.invoiceId;
          p.invoiceNumber = cached.invoiceNumber;
          p.invoiceStatus = cached.invoiceStatus;
        } else {
          p.invoiceId = null;
          p.invoiceNumber = null;
          p.invoiceStatus = null;
        }
      }
    }
  }

  if (!SP2_SYNC_SECRET) {
    return {
      ...result,
      errors:  packages.length,
      details: [{ trackingNumber: '—', outcome: 'error', reason: 'VITE_SP2_SYNC_SECRET not configured' }],
    };
  }

  // Split into chunks to respect the Cloud Function's 200-package limit
  const chunks: SP1PackageForSync[][] = [];
  for (let i = 0; i < validPackages.length; i += BATCH_SIZE) {
    chunks.push(validPackages.slice(i, i + BATCH_SIZE));
  }

  let processed = 0;

  for (const chunk of chunks) {
    // Report progress at the start of each chunk
    if (options?.onProgress && chunk.length > 0) {
      options.onProgress(processed + 1, packages.length, chunk[0].trackingNumber);
    }

    try {
      const data = await callSyncFunction(chunk);

      result.created += data.summary.created;
      result.updated += data.summary.updated;
      result.skipped += data.summary.skipped;
      result.errors  += data.summary.errors;

      for (const r of data.results) {
        result.details.push({
          trackingNumber: r.tracking,
          slCode:         r.slCode,
          outcome:        r.outcome as SyncSmartWebDetail['outcome'],
          reason:         r.reason,
        });
        processed++;
        options?.onProgress?.(processed, packages.length, r.tracking);
      }
    } catch (err: any) {
      // Whole chunk failed — mark every package in it as error
      for (const pkg of chunk) {
        result.errors++;
        result.details.push({
          trackingNumber: pkg.trackingNumber.toUpperCase().trim(),
          slCode:         pkg.slCode,
          outcome:        'error',
          reason:         err?.message ?? 'Network/function error',
        });
        processed++;
        options?.onProgress?.(processed, packages.length, pkg.trackingNumber);
      }
    }
  }

  return result;
}

// ─── Preview (client-side only — no writes) ───────────────────────────────────
//
// Because the actual lookup now happens server-side (Cloud Function), the preview
// is a lightweight client-side categorisation: it groups packages by whether they
// have a valid slCode, without making any SP2 Firestore queries.
//
// A full server-side dry-run would double the function invocations and Firestore
// reads. The modal instead shows the optimistic breakdown and lets the server
// return the definitive per-package outcomes after the real sync.

export function previewSyncPackages(packages: SP1PackageForSync[]): Promise<{
  withSlCode: SP1PackageForSync[];
  noSlCode:   SP1PackageForSync[];
}> {
  const withSlCode = packages.filter(p => !!p.slCode?.trim());
  const noSlCode   = packages.filter(p => !p.slCode?.trim());
  return Promise.resolve({ withSlCode, noSlCode });
}

// ─── Orphan Sync ─────────────────────────────────────────────────────────────

export async function syncOrphanPackagesToSmartWeb(
  packages: SP1PackageForSync[],
  options?: {
    onProgress?: (current: number, total: number, tracking: string) => void;
  },
): Promise<SyncSmartWebResult> {
  const mappedPackages = packages.map(p => ({
    ...p,
    slCode: p.slCode?.trim() && p.slCode !== "0" && p.slCode !== "N/A" && !p.slCode.startsWith("T") ? p.slCode : "PENDIENTE",
    customerName: p.customerName || "Cliente Desconocido",
    forceSync: true, // Bypass regressions
    allowCreate: true, // Force create in SP2 if missing
  }));

  return syncPackagesToSmartWeb(mappedPackages, options);
}

/**
 * Sync packages to SmartWeb with a maximum network timeout guard.
 * Ideal for mobile/driver connections with poor or variable cellular coverage.
 */
export async function syncPackagesToSmartWebWithTimeout(
  packages: SP1PackageForSync[],
  timeoutMs = 4000,
  options?: {
    onProgress?: (current: number, total: number, tracking: string) => void;
  },
): Promise<SyncSmartWebResult> {
  let timerId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error('TIMEOUT_SP2_SYNC')), timeoutMs);
  });

  try {
    const res = await Promise.race([
      syncPackagesToSmartWeb(packages, options),
      timeoutPromise,
    ]);
    clearTimeout(timerId);
    return res;
  } catch (err: any) {
    clearTimeout(timerId);
    if (err?.message === 'TIMEOUT_SP2_SYNC') {
      console.warn(`[syncPackagesToSmartWebWithTimeout] Sincronización a SP2 diferida por timeout (${timeoutMs}ms) en red móvil.`);
      return {
        total: packages.length,
        created: 0,
        updated: 0,
        skipped: packages.length,
        errors: 0,
        details: packages.map(p => ({
          trackingNumber: p.trackingNumber,
          slCode: p.slCode,
          outcome: 'skipped',
          reason: 'Network timeout (SP2 sync deferred)',
        })),
      };
    }
    throw err;
  }
}

