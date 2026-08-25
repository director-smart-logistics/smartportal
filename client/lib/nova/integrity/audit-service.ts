/**
 * Firestore-backed integrity audit — thin I/O wrapper around the pure
 * `computeIntegrityReport` engine.
 *
 * The wrapper:
 *   1. Loads the four authoritative sources for the manifest in parallel.
 *   2. Normalizes them into the `IntegrityAuditInputs` shape.
 *   3. Delegates to `computeIntegrityReport` for the comparison work.
 *
 * No comparison logic lives here — that belongs in `compute.ts` and is
 * tested with fixtures (no Firestore mocks needed).
 */

import { collection, getDoc, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { computeIntegrityReport } from './compute';
import { isConsolidatedInvoice } from '@/lib/services/invoice-service';
import type { IntegrityAuditInputs, IntegrityReport } from './types';

/**
 * Run the audit for a single manifest. Returns a deterministic report
 * (sorted issues, populated summary). Never throws — Firestore errors
 * are swallowed and the offending source falls back to an empty array
 * so the audit still emits useful results from whatever is reachable.
 */
export async function auditManifestIntegrity(manifestId: string): Promise<IntegrityReport> {
  if (!manifestId) {
    return {
      manifestId: '',
      scannedAt: new Date().toISOString(),
      totalRows: 0,
      issues: [],
      summary: {
        bySeverity: { high: 0, medium: 0, low: 0 },
        byKind: {},
        repairableManifestRows: 0,
        invoicesNeedingReview: 0,
      },
    };
  }

  // ── Parallel loads (independent reads) ──────────────────────────────────
  const [manifestSnap, packagesSnap, encomiendasSnap, invoicesSnap] = await Promise.all([
    getDoc(doc(collection(db, 'manifests'), manifestId)).catch(() => null),
    getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', manifestId))).catch(() => null),
    getDocs(query(collection(db, 'manifest_encomiendas'), where('manifestNumber', '==', manifestId))).catch(() => null),
    getDocs(query(collection(db, 'invoices'), where('manifestNumber', '==', manifestId))).catch(() => null),
  ]);

  // ── Manifest embedded packages array ──────────────────────────────────
  const manifestPackages: IntegrityAuditInputs['manifestPackages'] =
    manifestSnap?.exists()
      ? ((manifestSnap.data()?.packages as unknown[] | undefined) ?? [])
          .map(p => p as IntegrityAuditInputs['manifestPackages'][number])
      : [];

  // ── packages collection ───────────────────────────────────────────────
  const packagesCollection: IntegrityAuditInputs['packagesCollection'] =
    packagesSnap?.docs.map(d => {
      const data = d.data();
      return {
        docId: d.id,
        tracking: String(data.tracking ?? data.trackingNumber ?? d.id),
        slCode: data.slCode ?? data.userId ?? '',
        customerName: data.customerName ?? data.nombre ?? '',
        ruta: data.ruta ?? '',
      };
    }) ?? [];

  // ── manifest_encomiendas ──────────────────────────────────────────────
  const encomiendas: IntegrityAuditInputs['encomiendas'] =
    encomiendasSnap?.docs.map(d => {
      const data = d.data();
      return {
        docId: d.id,
        tracking: String(data.tracking ?? d.id),
        slCode: data.slCode ?? '',
        customerName: data.customerName ?? '',
        ruta: data.ruta ?? '',
      };
    }) ?? [];

  // ── invoices ──────────────────────────────────────────────────────────
  const invoices: IntegrityAuditInputs['invoices'] =
    invoicesSnap?.docs.map(d => {
      const data = d.data();
      // Trackings live in BOTH `trackingNumber`/`trackingNumbers` (Nova
      // shape) and `invoiceItems[].trackingNumber` (manual / SP1 shape).
      // We accept whichever is present.
      const fromArray = Array.isArray(data.trackingNumbers) ? (data.trackingNumbers as string[]) : [];
      const fromSingle = data.trackingNumber ? [String(data.trackingNumber)] : [];
      const fromItems = Array.isArray(data.invoiceItems)
        ? (data.invoiceItems as Array<{ trackingNumber?: string }>)
            .map(i => i.trackingNumber ?? '')
            .filter(Boolean) as string[]
        : [];
      const trackings = Array.from(new Set([...fromArray, ...fromSingle, ...fromItems].map(t => t.toUpperCase())));

      // Per-tracking item details — first match wins per tracking.
      const items = Array.isArray(data.invoiceItems)
        ? (data.invoiceItems as Array<{ trackingNumber?: string; unitPrice?: number; weight?: number }>)
            .filter(i => i.trackingNumber)
            .map(i => ({
              tracking: String(i.trackingNumber).toUpperCase(),
              unitPrice: Number(i.unitPrice ?? 0) || undefined,
              weight: Number(i.weight ?? 0) || undefined,
            }))
        : undefined;

      return {
        invoiceId: d.id,
        invoiceNumber: data.invoiceNumber ?? d.id,
        clientSlCode: data.clientSlCode ?? data.slCode ?? data.customerId ?? '',
        clientName: data.clientName ?? '',
        status: String(data.status ?? 'draft'),
        // Use the single source of truth so the audit matches exactly what
        // Facturas / Nova already treat as "consolidated".
        isConsolidation: isConsolidatedInvoice({
          isConsolidation: data.isConsolidation,
          invoiceNumber: data.invoiceNumber,
        }),
        trackings,
        items,
      };
    }) ?? [];

  return computeIntegrityReport({
    manifestId,
    manifestPackages,
    packagesCollection,
    encomiendas,
    invoices,
  });
}
