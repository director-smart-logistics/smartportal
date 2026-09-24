/**
 * returned-packages-mutations.ts
 *
 * Pure payload-construction logic for ReturnedPackages.tsx's two admin
 * actions on returned packages: re-consolidate (send back to
 * consolidacion_transitoria) and reassign (send to a specific target
 * manifest). Both actions branch on whether the package has a PAID
 * invoice — a paid invoice's linkage and pricing must be preserved, never
 * silently cleared, while an unpaid one is cleared for a clean re-invoice
 * in the new manifest.
 *
 * AUDIT NOTE (2026-09-23): these payloads were built inline inside two
 * ~70-line event handlers directly on the batch.update() call, with no
 * possible way to unit-test them — returned-packages-lifecycle.spec.ts
 * asserted against its own hand-typed copy of the expected output instead
 * of the real logic (tautological, could never catch a real regression).
 * Extracted here as the single source of truth; ReturnedPackages.tsx and
 * the test now both call these functions.
 */

import { arrayUnion, deleteField } from 'firebase/firestore';

export interface ReturnedPkgLike {
  invoiceStatus?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  firstConsolidatedAt?: string;
  manifestNumber?: string;
  manifiesto?: string;
  originalManifest?: string;
}

/**
 * A package "has a paid invoice" when its own invoiceStatus says so, OR
 * its invoiceId is present in the caller's pre-fetched set of invoice IDs
 * currently in `paid` status (covers the case where the package doc's own
 * invoiceStatus field is stale relative to the invoice document).
 */
export function pkgHasPaidInvoice(pkg: ReturnedPkgLike, paidInvoiceIds: Set<string>): boolean {
  return pkg.invoiceStatus === 'paid' || !!(pkg.invoiceId && paidInvoiceIds.has(pkg.invoiceId));
}

/** Batch.update() payload for "Re-consolidar" — moves a returned package to consolidacion_transitoria. */
export function buildReconsolidatePayload(
  pkg: ReturnedPkgLike,
  now: string,
  isPaid: boolean,
): Record<string, any> {
  const base: Record<string, any> = {
    status: 'consolidated',
    deliveryStatus: 'consolidated',
    manifestId: 'consolidacion_transitoria',
    manifestNumber: 'consolidacion_transitoria',
    updatedManifest: 'consolidacion_transitoria',
    encomiendaManifestNumber: 'none',
    manifestUpdatedAt: now,
    consolidacion: true,
    ...(!pkg.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
    smartwebSyncSource: 'transitoria',
    smartwebSynced: false,
  };

  if (isPaid) {
    // INVARIANT: a paid invoice's linkage and pricing are NEVER cleared.
    return {
      ...base,
      statusHistory: arrayUnion({
        status: 'consolidated',
        changedAt: now,
        changedBy: 'returns-management-manual',
        note: `Paquete devuelto re-consolidado a Consolidación Transitoria (conservando factura pagada ${pkg.invoiceNumber || ''})`,
      }),
    };
  }

  return {
    ...base,
    invoiceId: deleteField(),
    invoiceNumber: deleteField(),
    invoiceStatus: deleteField(),
    ajustePrecio: deleteField(),
    precio: deleteField(),
    price: deleteField(),
    precioSinPermiso: deleteField(),
    precioConPermiso: deleteField(),
    pesoRedondeo: deleteField(),
    diferenciaRedondeo: deleteField(),
    pesoConsolidacion: deleteField(),
    cost: deleteField(),
    costCRC: deleteField(),
    statusHistory: arrayUnion({
      status: 'consolidated',
      changedAt: now,
      changedBy: 'returns-management-manual',
      note: 'Paquete devuelto re-consolidado (movido a Consolidación Transitoria) por administración',
    }),
  };
}

/** Batch.update() payload for "Reasignar" — moves a returned package to a specific target manifest. */
export function buildReassignPayload(
  pkg: ReturnedPkgLike,
  now: string,
  targetManifest: string,
  isPaid: boolean,
): Record<string, any> {
  const base: Record<string, any> = {
    status: 'consolidated',
    deliveryStatus: 'consolidated',
    manifestId: targetManifest,
    manifestNumber: targetManifest,
    updatedManifest: targetManifest,
    encomiendaManifestNumber: targetManifest.toUpperCase().startsWith('ENC-') ? targetManifest : 'none',
    manifestUpdatedAt: now,
    consolidacion: true,
    isReassigned: true,
    isReturned: true,
    wasReturned: true,
    originalManifest: pkg.originalManifest || pkg.manifestNumber || pkg.manifiesto || targetManifest,
    smartwebSyncSource: 'reassign',
    smartwebSynced: false,
  };

  if (isPaid) {
    // INVARIANT: a paid invoice's linkage and pricing are NEVER cleared.
    return {
      ...base,
      statusHistory: arrayUnion({
        status: 'consolidated',
        changedAt: now,
        changedBy: 'returns-management-manual',
        note: `Paquete devuelto re-asignado al manifiesto ${targetManifest} (conservando factura pagada ${pkg.invoiceNumber || ''})`,
      }),
    };
  }

  return {
    ...base,
    invoiceId: deleteField(),
    invoiceNumber: deleteField(),
    invoiceStatus: deleteField(),
    ajustePrecio: deleteField(),
    precio: deleteField(),
    price: deleteField(),
    precioSinPermiso: deleteField(),
    precioConPermiso: deleteField(),
    pesoRedondeo: deleteField(),
    diferenciaRedondeo: deleteField(),
    pesoConsolidacion: deleteField(),
    cost: deleteField(),
    costCRC: deleteField(),
    statusHistory: arrayUnion({
      status: 'consolidated',
      changedAt: now,
      changedBy: 'returns-management-manual',
      note: `Paquete devuelto re-asignado al manifiesto ${targetManifest} por administración`,
    }),
  };
}
