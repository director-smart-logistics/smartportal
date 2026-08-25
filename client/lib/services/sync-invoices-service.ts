/**
 * SP1 → SP2 Invoice Sync Service
 *
 * Calls the `slSyncInvoicesFromSp1` Cloud Function to push SP1 invoices
 * into SP2's `invoices` collection so customers can view and pay them on
 * their dashboards. Also links the invoices to matching `shipments` docs
 * so the invoice icon lights up on SP2 package cards.
 *
 * Authentication: shared ENCOMIENDA_SYNC_SECRET header.
 *
 * ── SYNC ARCHITECTURE (DO NOT MODIFY WITHOUT REVIEWING THIS ENTIRE SECTION) ─
 *
 * This service is part of a multi-layer sync system. Understanding the
 * data flow is critical before making any changes:
 *
 *  SP1 → SP2 PATHS:
 *  1. syncPackagesToSmartWeb  (sync-smartweb-service.ts)
 *     Entry: admin bulk-update, per-row Force Sync button, routes mark-delivered.
 *     Target: SP2 `shipments` collection via `slSyncShipmentsFromSp1` CF.
 *     forceSync=true  → bypasses SP2 regression guard + replaces sp1_sync history.
 *     forceSync=false → respects SP2 regression guard (auto-syncs only).
 *
 *  2. syncInvoicesToSp2  (this file)
 *     Entry: SyncInvoicesModal, full invoice push.
 *     Target: SP2 `invoices` collection via `slSyncInvoicesFromSp1` CF.
 *     Also writes { invoiceId, invoiceNumber, invoiceReady } to matching shipments.
 *
 *  3. pushStatusToSp2  (this file)
 *     Entry: any invoice status change (paid, annulled, draft, etc.).
 *     Target: SP2 `invoices` collection only — NOT shipments. Fire-and-forget.
 *
 *  4. syncInvoicePackagesToSp2  (this file)
 *     Entry: invoice email sent → 'processed'; invoice paid → 'on_route'.
 *     Target: SP1 `packages` (status stamp) + SP2 `shipments` via path #1.
 *     INTENTIONALLY uses forceSync=false — invoice-driven status pushes are
 *     auto-syncs and MUST respect SP2's regression guard. Example: if SP2
 *     already shows 'delivered', an invoice payment should NOT regress it to
 *     'on_route'. SP1's own package docs are also guarded (see Issue #2 fix
 *     below) against SP1-side regression from the same invoice action.
 *
 *  SP2 → SP1 PATH:
 *  5. onPackageUpdated / onPackageCreated  (package-sync.ts in SP2)
 *     Entry: customer creates/updates their `packages` doc in SP2.
 *     Target: SP1 PostgreSQL via `/api/packages/sync-from-firebase`.
 *     Anti-loop: bails out if afterData.syncedFromSp1 || afterData.createdFromSp1.
 *     NOTE: writes `sp1-shipment-sync.ts` to `shipments` (not `packages`) →
 *     these Firestore triggers are NOT fired by SP1 shipment syncs.
 *
 * ── LOCK FLAGS ────────────────────────────────────────────────────────────────
 *  Any SP1-origin write to SP2 shipments sets:
 *    syncedFromSp1: true   — audit marker, also used as anti-loop flag
 *    manuallyUpdated: true — prevents middleware from overwriting the status
 *    statusLockedAt: now   — (invoice-sync only) hard lock for middleware
 *  Once set, these flags are NEVER cleared automatically. If a shipment needs
 *  to accept middleware updates again, a manual reset is required.
 *
 * Authentication: shared ENCOMIENDA_SYNC_SECRET header.
 */

import type { InvoiceRecord } from '@/lib/services/invoice-service';
import { firestoreApi } from '@/lib/firebase/firestore-client';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';
import { arrayUnion, doc, updateDoc, getDoc, getDocs, query, collection, where, deleteField } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Config ───────────────────────────────────────────────────────────────────

const INVOICE_SYNC_URL =
  import.meta.env.VITE_SP2_INVOICE_SYNC_URL as string | undefined;

const SYNC_SECRET =
  import.meta.env.VITE_SP2_SYNC_SECRET as string | undefined;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncInvoiceResult {
  invoiceId:     string;
  invoiceNumber: string;
  outcome:       'created' | 'updated' | 'skipped' | 'error';
  reason?:       string;
  shipmentLinks: number;
}

export interface SyncInvoicesResponse {
  ok:      boolean;
  summary: { total: number; created: number; updated: number; skipped: number; errors: number };
  results: SyncInvoiceResult[];
}

export interface SyncPreview {
  eligible:    InvoiceRecord[];
  noSlCode:    InvoiceRecord[];
  /**
   * Invoices the sync guard will silently drop (currently: drafts).
   * Surfaced in the preview so operators are not misled into thinking the
   * sync will run on these. See guard in `syncInvoicesToSp2`.
   */
  nonSyncable: InvoiceRecord[];
}

// ─── Preview helper ───────────────────────────────────────────────────────────

/**
 * Categorise invoices before syncing:
 * - `eligible`     — have slCode AND status !== 'draft' (will sync to a SP2 user)
 * - `noSlCode`     — missing slCode (will sync but user link may fail)
 * - `nonSyncable`  — drafts; the sync guard drops these silently. Operators
 *                   need to know upfront so they don't get a misleading 0/0/0
 *                   "Sincronización completada" toast.
 */
export function previewSyncInvoices(invoices: InvoiceRecord[]): SyncPreview {
  const eligible:    InvoiceRecord[] = [];
  const noSlCode:    InvoiceRecord[] = [];
  const nonSyncable: InvoiceRecord[] = [];

  const EXCLUDED_STATUSES = new Set(['draft', 'annulled', 'cancelled', 'void']);

  for (const inv of invoices) {
    const status = String((inv as any).status ?? 'draft').toLowerCase();
    if (EXCLUDED_STATUSES.has(status)) {
      nonSyncable.push(inv);
      continue;
    }
    const code = ((inv as any).slCode || (inv as any).clientSlCode || '').trim();
    if (code) {
      eligible.push(inv);
    } else {
      noSlCode.push(inv);
    }
  }

  return { eligible, noSlCode, nonSyncable };
}

// ─── Payload builder ──────────────────────────────────────────────────────────

function buildPayload(inv: InvoiceRecord): Record<string, any> {
  const a = inv as any;

  // ── Field-name normalisation ──────────────────────────────────────────────
  // SP1 has two naming conventions depending on invoice origin:
  //   Nova / invoice-service.ts   → amount, subtotal, iva, ivaRate
  //   InvoiceGeneration.tsx       → totalAmount, subtotalAmount, taxAmount
  // Always prefer the Nova names; fall back to the SP1 counterparts.
  const amount    = inv.amount   ?? a.totalAmount    ?? 0;
  const subtotal  = inv.subtotal ?? a.subtotalAmount ?? amount;
  const iva       = inv.iva      ?? a.taxAmount      ?? 0;
  const ivaRate   = inv.ivaRate  ?? (inv.ivaEnabled ? 0.13 : 0);

  // Discount: prefer computed discountAmount; derive from percentage if missing
  const discountPct    = a.discountPercentage ?? 0;
  const discountAmount = a.discountAmount ?? (discountPct > 0 ? Math.round(subtotal * discountPct / 100 * 100) / 100 : 0);

  // Resolve nested customer object — SP2 uses customer.email as intermediate fallback
  const customer = a.customer && typeof a.customer === 'object' ? {
    fullName: a.customer.fullName ?? inv.clientName ?? '',
    slCode:   a.customer.slCode   ?? a.slCode ?? a.clientSlCode ?? '',
    email:    a.customer.email    ?? inv.clientEmail ?? '',
    phone:    a.customer.phone    ?? a.clientPhone ?? '',
  } : undefined;

  const base: Record<string, any> = {
    id:                  inv.id,
    invoiceNumber:       inv.invoiceNumber || inv.id || 'N/A',
    slCode:              a.slCode || a.clientSlCode || '',
    clientName:          inv.clientName   ?? '',
    clientEmail:         inv.clientEmail  ?? '',
    clientDni:           inv.clientDni    ?? '',
    clientPhone:         a.clientPhone    ?? '',
    status:              a.status ?? 'draft',
    amount,
    subtotal,
    iva,
    ivaRate,
    ivaEnabled:          inv.ivaEnabled ?? false,
    exchangeRate:        inv.exchangeRate,
    amountCRC:           inv.amountCRC,
    currency:            inv.currency ?? 'USD',
    discountAmount,
    discountPercentage:  discountPct,
    notes:               inv.notes,
    invoiceDate:         a.invoiceDate,
    dueDate:             a.dueDate,
    createdAt:           inv.createdAt,
    trackingNumber:      inv.trackingNumber,
    trackingNumbers:     inv.trackingNumbers,
    isConsolidation:     inv.isConsolidation,
    isMergedSingle:      a.isMergedSingle,
    manifestNumber:      a.manifestNumber,
    manifestNumbers:     a.manifestNumbers,
    packageCount:        inv.packageCount,
    totalWeight:         inv.totalWeight,
    customer,
    invoiceItems:        a.invoiceItems ?? inv.items?.map((i: any) => ({
      description:    i.description,
      trackingNumber: i.tracking,
      tracking:       i.tracking,
      quantity:       1,
      unitPrice:      i.amount,
      amount:         i.amount,
      weight:         i.weight,
      isPermiso:      i.isPermiso,
    })),
  };

  // Strip only undefined/null on non-contact structural fields.
  // Contact strings (clientEmail, clientDni, clientPhone) are kept even when
  // empty so SP2's fallback chain can evaluate them and fill from user profile.
  return Object.fromEntries(
    Object.entries(base).filter(([, v]) => v !== undefined && v !== null),
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Silently push a single status change to SP2.
 *
 * Uses `statusOnly: true` — the CF will:
 *   - UPDATE status if the invoice already exists in SP2
 *   - SKIP (return 'skipped') if the invoice was never synced → no creation
 *
 * This is fire-and-forget: call it after any SP1 status change succeeds.
 * Never throws — errors are silently logged so SP1 UX is unaffected.
 */
export async function pushStatusToSp2(
  invoiceId:     string,
  invoiceNumber: string,
  newStatus:     string,
): Promise<void> {
  if (!INVOICE_SYNC_URL || !SYNC_SECRET) return;

  const status = String(newStatus || 'draft').toLowerCase();
  const isExcluded = ['draft', 'annulled', 'cancelled', 'void'].includes(status);

  const syncedAt = new Date().toISOString();
  let outcome: 'updated' | 'skipped' | 'error' = 'updated';
  let errorMsg: string | null = null;
  try {
    const invoicePayload = isExcluded ? {
      id:          invoiceId,
      invoiceNumber,
      slCode:      '',
      clientName:  '',
      status:      'deleted',
      amount:      0,
      subtotal:    0,
      deleted:     true,
    } : {
      id:          invoiceId,
      invoiceNumber,
      slCode:      '',
      clientName:  '',
      status:      newStatus,
      amount:      0,
      subtotal:    0,
      statusOnly:  true,
    };

    const res = await fetch(INVOICE_SYNC_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-sync-secret': SYNC_SECRET,
      },
      body: JSON.stringify({
        invoices: [invoicePayload],
      }),
    });
    if (!res.ok) {
      outcome = 'error';
      errorMsg = `HTTP ${res.status}`;
    } else {
      const body = await res.json().catch(() => null) as any;
      // The CF returns { results: [{ outcome: 'updated' | 'skipped' | 'deleted' | ... }] }
      const r = body?.results?.[0]?.outcome;
      if (r === 'error') outcome = 'error';
      else if (r === 'skipped') outcome = 'skipped';
      else if (r === 'deleted') outcome = 'updated'; // Treat 'deleted' as a successful update of SP2 state
      else outcome = 'updated';
    }
  } catch (err) {
    outcome = 'error';
    errorMsg = err instanceof Error ? err.message : String(err);
    // Silent — SP1 UX must never be blocked by SP2 sync failures
  }

  // Always append a history entry so the invoice panel reflects every push,
  // whether the sync succeeded, was skipped (invoice never created in SP2)
  // or failed. Fire-and-forget — a Firestore write failure must not crash
  // the caller that already moved on.
  try {
    await updateDoc(doc(db, 'invoices', invoiceId), {
      sp2SyncHistory: arrayUnion({
        syncedAt,
        outcome,
        invoiceNumber,
        kind: 'status-push',
        status: newStatus,
        ...(errorMsg ? { error: errorMsg } : {}),
      }),
      ...(outcome === 'updated' ? { smartwebSynced: true, smartwebSyncedAt: syncedAt } : {}),
      lastSp2SyncAt: syncedAt,
      lastSp2SyncOutcome: outcome,
    });
  } catch (err) {
    console.warn(`[pushStatusToSp2] Failed to write sp2SyncHistory for ${invoiceId}:`, err);
  }
}

/**
 * Explicitly delete an invoice from SP2.
 * This is used when SP1 permanently deletes an invoice (e.g. replacing it during consolidation or manual deletion).
 */
export async function deleteInvoiceFromSp2(
  invoiceId:     string,
  invoiceNumber: string,
): Promise<void> {
  if (!INVOICE_SYNC_URL || !SYNC_SECRET) return;

  try {
    const res = await fetch(INVOICE_SYNC_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-sync-secret': SYNC_SECRET,
      },
      body: JSON.stringify({
        invoices: [{
          id:          invoiceId,
          invoiceNumber,
          slCode:      '',
          clientName:  '',
          status:      'deleted',
          amount:      0,
          subtotal:    0,
          deleted:     true,
        }],
      }),
    });
    if (!res.ok) {
      console.warn(`[deleteInvoiceFromSp2] HTTP ${res.status} when deleting ${invoiceId}`);
    } else {
      const body = await res.json().catch(() => null) as any;
      const r = body?.results?.[0]?.outcome;
      if (r === 'deleted' || r === 'skipped') {
         console.log(`[deleteInvoiceFromSp2] Successfully requested deletion for ${invoiceId} (outcome: ${r})`);
      }
    }
  } catch (err) {
    console.warn(`[deleteInvoiceFromSp2] Network error when deleting ${invoiceId}:`, err);
  }
}

/**
 * Sync one or more SP1 invoices to SP2.
 * Uses SP1's invoice `id` as the SP2 document ID → fully idempotent.
 *
 * @throws Error if the Cloud Function returns a non-2xx response.
 */
const INVOICE_SYNC_CHUNK = 300;

async function syncInvoicesChunk(chunk: InvoiceRecord[], maxRetries = 3): Promise<SyncInvoicesResponse> {
  const payload = chunk.map(buildPayload);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(INVOICE_SYNC_URL!, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-sync-secret': SYNC_SECRET,
        },
        body: JSON.stringify({ invoices: payload }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as any;
        throw new Error(err?.error ?? `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json() as SyncInvoicesResponse;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        console.warn(`[syncInvoicesChunk] Attempt ${attempt} failed, retrying in ${attempt * 2}s...`, err.message);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  }
  throw lastError ?? new Error('Failed to sync invoices chunk after multiple attempts');
}

export async function syncInvoicesToSp2(
  invoices: InvoiceRecord[],
  options?: { onProgress?: (pct: number, label: string) => void },
): Promise<SyncInvoicesResponse> {
  if (!INVOICE_SYNC_URL) {
    throw new Error('VITE_SP2_INVOICE_SYNC_URL is not configured');
  }
  if (!SYNC_SECRET) {
    throw new Error('VITE_SP2_SYNC_SECRET is not configured');
  }

  // ── GUARD: never push draft, annulled, cancelled, or void invoices to SP2 ──
  // Exclude drafts, annulled, cancelled, and void invoices from customer portal (SP2).
  const EXCLUDED_STATUSES = new Set(['draft', 'annulled', 'cancelled', 'void']);
  const syncable = invoices.filter(inv => !EXCLUDED_STATUSES.has(String((inv as any).status ?? 'draft').toLowerCase()));
  if (syncable.length === 0) {
    return { ok: true, summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 }, results: [] };
  }
  invoices = syncable;

  // Split into chunks and merge responses
  const chunks: InvoiceRecord[][] = [];
  for (let i = 0; i < invoices.length; i += INVOICE_SYNC_CHUNK) {
    chunks.push(invoices.slice(i, i + INVOICE_SYNC_CHUNK));
  }

  // Sequential chunk processing — reports real progress per chunk (0→50%)
  const chunkResults: SyncInvoicesResponse[] = [];
  options?.onProgress?.(5, 'Preparando envío de facturas…');
  for (let i = 0; i < chunks.length; i++) {
    const startPct = 5 + Math.round((i / chunks.length) * 45);
    options?.onProgress?.(startPct, `Enviando facturas a SmartWeb (lote ${i + 1} de ${chunks.length})…`);
    chunkResults.push(await syncInvoicesChunk(chunks[i]));
    const endPct = 5 + Math.round(((i + 1) / chunks.length) * 45);
    options?.onProgress?.(endPct, `Lote ${i + 1} completado.`);
  }

  const result: SyncInvoicesResponse = chunkResults.reduce((acc, r) => ({
    ok:      acc.ok && r.ok,
    summary: {
      total:   acc.summary.total   + r.summary.total,
      created: acc.summary.created + r.summary.created,
      updated: acc.summary.updated + r.summary.updated,
      skipped: acc.summary.skipped + r.summary.skipped,
      errors:  acc.summary.errors  + r.summary.errors,
    },
    results: [...acc.results, ...r.results],
  }), { ok: true, summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 }, results: [] } as SyncInvoicesResponse);

  // Stamp each successfully synced invoice in SP1 Firestore so the UI can
  // display a "synced" badge without waiting for the next full data reload.
  if (result.ok || result.summary.created + result.summary.updated > 0) {
    const syncedAt = new Date().toISOString();
    const succeededIds = new Set(
      result.results
        .filter(r => r.outcome === 'created' || r.outcome === 'updated')
        .map(r => r.invoiceId),
    );

    const succeededInvoices = invoices.filter(inv => inv.id && succeededIds.has(inv.id));

    // ── 1. Mark invoices + append sync event to sp2SyncHistory ─────────────
    options?.onProgress?.(60, 'Marcando facturas sincronizadas…');
    await Promise.allSettled(
      succeededInvoices.map(inv => {
        const invResult = result.results.find(r => r.invoiceId === inv.id);
        return updateDoc(doc(db, 'invoices', inv.id!), {
          smartwebSynced:   true,
          smartwebSyncedAt: syncedAt,
          sp2SyncHistory: arrayUnion({
            syncedAt,
            outcome:       invResult?.outcome ?? 'updated',
            invoiceNumber: inv.invoiceNumber,
          }),
        });
      }),
    );

    // ── 2. Update SP1 package status + sync to SP2 ───────────────────────────
    // For sent invoices  → promote linked packages to 'processed' (Facturado).
    // For paid invoices  → promote to 'on_route'.
    // Both paths use syncInvoicePackagesToSp2 which:
    //   a) applies the SP1-side regression guard (never downgrades higher statuses)
    //   b) pushes the new status to SP2 shipments via syncPackagesToSmartWeb
    // Invoices without a target status (draft, annulled, etc.) fall through to
    // the stamp-only path below.
    const INV_STATUS_TO_PKG: Record<string, string> = {
      sent: 'processed',
      paid: 'on_route',
    };
    const withTargetStatus  = succeededInvoices.filter((inv: any) => INV_STATUS_TO_PKG[(inv as any).status ?? '']);
    const withoutTargetStatus = succeededInvoices.filter((inv: any) => !INV_STATUS_TO_PKG[(inv as any).status ?? '']);

    if (withTargetStatus.length > 0) {
      options?.onProgress?.(75, 'Actualizando estado de paquetes…');
      let pkgDone = 0;
      await Promise.allSettled(
        withTargetStatus.map(async (inv: any) => {
          await syncInvoicePackagesToSp2(inv, INV_STATUS_TO_PKG[(inv as any).status]);
          pkgDone++;
          const pct = 75 + Math.round((pkgDone / withTargetStatus.length) * 20);
          options?.onProgress?.(Math.min(pct, 95), 'Actualizando estado de paquetes…');
        }),
      );
    }

    // Stamp-only for invoices whose status doesn't trigger a package promotion
    if (withoutTargetStatus.length > 0 && withTargetStatus.length === 0) {
      options?.onProgress?.(80, 'Marcando paquetes…');
    }
    if (withoutTargetStatus.length > 0) {
      const stampTrackings = new Set<string>();
      for (const inv of withoutTargetStatus) {
        const items: any[] = (inv as any).invoiceItems ?? (inv as any).items ?? [];
        for (const item of items) {
          const t = item.trackingNumber || item.tracking;
          if (t) stampTrackings.add(String(t).toUpperCase());
        }
      }
      
      if (stampTrackings.size > 0) {
        const trackingsArray = [...stampTrackings];
        const stampIds = new Set<string>();
        for (let i = 0; i < trackingsArray.length; i += 30) {
          const chunk = trackingsArray.slice(i, i + 30);
          try {
            const q = query(collection(db, 'packages'), where('trackingNumber', 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => stampIds.add(d.id));
          } catch { /* non-fatal */ }
        }

        if (stampIds.size > 0) {
          options?.onProgress?.(85, 'Marcando paquetes sincronizados…');
          const idsArray = [...stampIds];
          let stamped = 0;
          await Promise.allSettled(
            idsArray.map(async pkgId => {
              await firestoreApi.packages.update(pkgId, {
                smartwebSynced:     true,
                smartwebSyncedAt:   syncedAt,
                smartwebSyncSource: 'invoice',
              } as any);
              stamped++;
              options?.onProgress?.(85 + Math.round((stamped / idsArray.length) * 10), 'Marcando paquetes sincronizados…');
            })
          );
        }
      }
    }
  }

  options?.onProgress?.(100, 'Completado');
  return result;
}

// ─── Invoice-driven package status sync ──────────────────────────────────────
//
// Called by InvoiceGeneration.tsx on two lifecycle events:
//  • Email sent  → sp1Status = 'processed'  (Facturado)
//  • Marked paid → sp1Status = 'on_route'   (En Ruta)
//
// Workflow:
//  1. Extract packageIds / tracking numbers from the invoice's line items.
//  2. Write the new status + smartwebSynced stamp to each SP1 package doc.
//  3. Call syncPackagesToSmartWeb so SP2 reflects the change immediately.
//
// All Firestore/network work is fire-and-forget from the caller's perspective
// (errors are returned so callers can log them, but they never block the UI).

// ─── SP1-side status rank (mirrors SP1_STATUS_RANK in sync-smartweb-service.ts) ─
// Used to guard SP1 package doc writes from invoice-triggered regressions.
// NEVER remove — this prevents paid/delivered packages from regressing to
// on_route / processed when an invoice action fires after delivery.
const INVOICE_PKG_RANK: Record<string, number> = {
  'pre_alerted': 0, 'pre-alerted': 0,
  'received':    1,
  'in_transit':  2, 'transit': 2,
  'customs':     3, 'retained': 3, 'held': 3,
  'consolidated': 4,
  'processed':   5,
  'on_route':    6, 'route': 6, 'pickup': 6,
  'delivered':   7, 'returned': 7,
};

export async function syncInvoicePackagesToSp2(
  invoice: any,
  sp1Status: string,
  opts: { updateSp1?: boolean; syncSp2?: boolean; forceSync?: boolean } = {},
): Promise<void> {
  const { updateSp1 = true, syncSp2 = true, forceSync = false } = opts;
  if (!updateSp1 && !syncSp2) return;
  const items: any[] = invoice.invoiceItems ?? invoice.items ?? [];
  if (items.length === 0) return;

  const syncedAt   = new Date().toISOString();
  const slCode     = invoice.slCode || invoice.clientSlCode || '';
  const customerName = invoice.clientName || invoice.customerName || '';
  const incomingRank = INVOICE_PKG_RANK[sp1Status] ?? -1;

  // ── Resolve missing packageIds via trackingNumber ──────────────────────────
  const trackings: string[] = items
    .map((i: any) => i.trackingNumber || i.tracking)
    .filter(Boolean)
    .map(t => String(t).toUpperCase());

  if (trackings.length === 0) return;

  const packageDocs: Array<{ id: string; trackingNumber: string; currentRank: number; invoiceId?: string }> = [];
  for (let i = 0; i < trackings.length; i += 30) {
    const chunk = trackings.slice(i, i + 30);
    try {
      const q = query(collection(db, 'packages'), where('trackingNumber', 'in', chunk));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const current = (d.data().status as string | undefined) ?? '';
        packageDocs.push({
          id: d.id,
          trackingNumber: (d.data().trackingNumber as string).toUpperCase(),
          currentRank: INVOICE_PKG_RANK[current] ?? -1,
          invoiceId: d.data().invoiceId ?? undefined,
        });
      });
    } catch { /* ignore */ }
  }

  const trackToPkgId = new Map<string, string>();
  for (const p of packageDocs) {
    trackToPkgId.set(p.trackingNumber, p.id);
  }

  const eligiblePkgIds: string[] = [];

  // ── 1. Stamp every linked package doc in SP1 (with regression guard) ────────
  if (updateSp1 && packageDocs.length > 0) {
    const toUpdate: string[] = [];
    for (const r of packageDocs) {
      // ── CRITICAL SECURITY / REGRESSION GUARD: SP1 ADMIN ALWAYS COMMANDS ───────
      // We must NEVER promote or sync a package that is not currently linked to 
      // the active invoice we are processing. If an admin has unlinked or annulled
      // a package (e.g., moving it to 'consolidacion_transitoria'), that admin
      // decision in SP1 MUST be respected. Automatic background synchronization
      // processes from invoice events must NOT override the admin's manual action.
      // Therefore, if the package's invoiceId does not match the active invoice.id,
      // we abort the status sync.
      if (!invoice.id || r.invoiceId !== invoice.id) {
        continue;
      }

      if (forceSync || incomingRank > r.currentRank) {
        toUpdate.push(r.id);
        eligiblePkgIds.push(r.id);
      } else if (incomingRank === r.currentRank) {
        eligiblePkgIds.push(r.id); // same rank: stamp sync metadata but don't change status
      }
    }
    
    if (toUpdate.length > 0) {
      const isReverting = sp1Status === 'consolidated';

      await Promise.allSettled(
        toUpdate.map(async (pkgId: string) => {
          const pkgRef = doc(db, 'packages', pkgId);
          const pkgSnap = await getDoc(pkgRef);
          const pkgData = pkgSnap.exists() ? pkgSnap.data() as any : {};
          
          // ── RETURNED STATUS LOCK GUARD ──────────────────────────────────────────
          // If a package is marked as returned (status or deliveryStatus === 'returned'),
          // it resides in the Devoluciones / Warehouse domain. Automatic invoice status
          // pushes (e.g. email sent -> processed, paid -> on_route) MUST NEVER override
          // the returned status of the physical package.
          if (pkgData.status === 'returned' || pkgData.deliveryStatus === 'returned') {
            return;
          }

          const isEncomienda = (pkgData.manifestNumber || '').toUpperCase().startsWith('ENC-') || pkgData.ruta === 'Encomiendas';
          const targetStatus = sp1Status;

          const updateFields: any = {
            status:             targetStatus,
            smartwebSynced:     true,
            smartwebSyncedAt:   syncedAt,
            smartwebSyncSource: 'invoice',
            statusHistory:      arrayUnion({
              status:    targetStatus,
              changedAt: syncedAt,
              changedBy: 'system',
              note:      `Paquete actualizado a ${targetStatus} por sincronización/anulación de factura ${invoice.invoiceNumber || invoice.id}.`,
              timestamp: syncedAt,
              updatedBy: 'system',
              notes:     `Paquete actualizado a ${targetStatus} por sincronización/anulación de factura ${invoice.invoiceNumber || invoice.id}.`,
              location:  targetStatus === 'processed' ? 'Costa Rica' : (targetStatus === 'consolidated' ? 'Miami, FL' : 'En Ruta'),
            }),
          };

          if (isReverting) {
            updateFields.manifestId = 'consolidacion_transitoria';
            updateFields.manifestNumber = 'consolidacion_transitoria';
            updateFields.updatedManifest = 'consolidacion_transitoria';
            updateFields.consolidacion = true;
            updateFields.invoiceId = deleteField();
            updateFields.invoiceNumber = deleteField();
            updateFields.invoiceStatus = deleteField();
          }

          await updateDoc(pkgRef, updateFields);
        })
      );
    }
    
    // Stamp sync metadata on same-rank packages without changing status
    const sameRankIds = eligiblePkgIds.filter(id => !toUpdate.includes(id));
    if (sameRankIds.length > 0) {
      await Promise.allSettled(
        sameRankIds.map((pkgId: string) =>
          firestoreApi.packages.update(pkgId, {
            smartwebSynced:     true,
            smartwebSyncedAt:   syncedAt,
            smartwebSyncSource: 'invoice',
          } as any),
        ),
      );
    }
  }

  // ── 2. Push to SP2 (normal sync — forceSync intentionally absent) ────────────
  if (syncSp2) {
    const eligibleSet = updateSp1
      ? new Set(eligiblePkgIds)
      : new Set(packageDocs.map(p => p.id));
      
    const pkgsToSync = items
      .map((i: any) => {
        const tr = (i.trackingNumber || i.tracking || '').toUpperCase();
        const pkgId = trackToPkgId.get(tr);
        return { item: i, pkgId };
      })
      .filter(x => x.pkgId && eligibleSet.has(x.pkgId))
      .map(x => ({
        id:             x.pkgId as string,
        trackingNumber: (x.item.trackingNumber || x.item.tracking || '') as string,
        slCode,
        customerName,
        status:         sp1Status,
        weight:         x.item.weight,
        description:    x.item.description,
        ruta:           '',
        forceSync,
      }));

    if (pkgsToSync.length > 0) {
      await syncPackagesToSmartWeb(pkgsToSync);
    }
  }
}
