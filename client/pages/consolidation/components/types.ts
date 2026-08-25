/**
 * Shared types for the Consolidation Manifests module (v2 — Invoice-Centric).
 *
 * Data sources (all real-time via onSnapshot):
 *   1. customers where consolidationEnabled == true
 *   2. packages  where consolidacion == true
 *   3. invoices  where isConsolidation == true
 *
 * The old `manifest_consolidation` mirror collection is NOT used.
 */

import type { ComplianceResult } from '@/lib/services/consolidation-rules-service';

// ── Core entities ──────────────────────────────────────────────────────────────

export interface ConsolidationCustomer {
  id: string;
  slCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  ruta?: string;
  dni?: string;
  /** Courier/encomienda service name */
  courierService?: string;
}

/**
 * A Firestore package document with `consolidacion === true`.
 * Enriched with invoice data from the corresponding invoice item.
 */
export interface ConsolidationPackage {
  id: string;
  trackingNumber: string;
  description?: string;
  weight?: number;
  status: string;
  /** Original manifest this package arrived on */
  manifestNumber?: string;
  /** Manifest set after a manual reassignment — the "effective" manifest */
  updatedManifest?: string;
  manifestUpdatedAt?: string;
  slCode: string;
  customerName?: string;
  ruta?: string;
  origin?: string;
  destination?: string;
  requiresPermit?: boolean;
  createdAt?: string;
  savedAt?: string;
  /** True when the package has been manually moved to a different manifest */
  isReassigned?: boolean;
  /** True when the package is currently sitting in consolidacion_transitoria
   *  and is being displayed under its originalManifestID panel */
  isTransitoria?: boolean;
  /** The manifest the package was originally on before being moved to
   *  consolidacion_transitoria. Used as the grouping key in the manifest view. */
  originalManifestID?: string;
  /** Price from the matching invoiceItem (totalPrice or unitPrice) */
  price?: number;
  /** Currency of the price (e.g. 'USD') */
  currency?: string;
  /** Invoice number of the invoice that contains this tracking */
  invoiceNumber?: string;
  /** Status of the invoice that contains this tracking */
  invoiceStatus?: string;
  /** Firestore ID of the invoice that contains this tracking */
  invoiceId?: string;
  /** ISO Date string indicating when the package was first invoiced/put on route */
  invoicedAt?: string;
  /** The invoice number of the voided/annulled invoice before moving to transitoria */
  annulledInvoiceNumber?: string;
  /** The ID of the voided/annulled invoice before moving to transitoria */
  annulledInvoiceId?: string;
  /** ISO Date string indicating when the invoice was annulled */
  annulledAt?: string;
  /** Immutable ISO Date string indicating when the package first entered consolidation */
  firstConsolidatedAt?: string;
  /** Audit history of status changes */
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    changedBy?: string | null;
    note?: string | null;
    notes?: string | null;
  }>;
}

/**
 * A Firestore invoice document for a consolidation invoice.
 * `isConsolidation === true` in the `invoices` collection.
 */
export interface ConsolidationInvoice {
  id: string;
  invoiceNumber: string;
  slCode?: string;
  clientName?: string;
  manifestNumber?: string;
  manifestNumbers?: string[];
  totalAmount: number;
  currency: string;
  status: string;
  isConsolidation: boolean;
  createdAt?: string;
  updatedAt?: string;
  invoiceItems?: Array<{
    trackingNumber?: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    weight?: number;
    realWeight?: number;
  }>;
  /** Soft-delete: invoice moved to recycle bin, hidden from active view */
  isDeleted?: boolean;
  deletedAt?: string | null;
  statusHistory?: Array<{
    status: string;
    changedAt: string;
    changedBy?: string | null;
    reason?: string | null;
  }>;
}

// ── Grouped structures ─────────────────────────────────────────────────────────

/** One manifest group: manifest number → packages + invoices */
export interface ManifestGroup {
  manifestNumber: string;
  packages: ConsolidationPackage[];
  invoices: ConsolidationInvoice[];
  /** True when at least one package in this group is still physically in
   *  consolidacion_transitoria (shown here via originalManifestID) */
  hasTransitoriaPackages?: boolean;
}

/** One customer section: customer → manifest groups + compliance */
export interface CustomerSection {
  customer: ConsolidationCustomer;
  manifestGroups: ManifestGroup[];
  /**
   * ALL packages owned by this customer including terminal-status ones
   * (delivered/processed/returned/pickup). Used only by ConsolidationInvoiceRow
   * to resolve the package status badge for invoice items whose package has
   * been filtered out of the operational view. NEVER use for drag-drop or
   * uninvoiced diagnostics — use `manifestGroups[].packages` for those.
   */
  lookupPackages: ConsolidationPackage[];
  /** Total packages across all manifests */
  totalPackages: number;
  /** Total weight in kg across all packages */
  totalWeight: number;
  /** Total invoiced amount across all invoices */
  totalAmount: number;
  /** Number of manifests this customer has packages in (>1 = carry-on candidate) */
  manifestCount: number;
}

// ── Carry-on types ─────────────────────────────────────────────────────────────

/**
 * A suggestion to consolidate packages from multiple manifests into one.
 * Generated automatically when a customer has packages spread across
 * different manifests.
 */
export interface CarryOnSuggestion {
  slCode: string;
  customerName: string;
  /** Source manifests that have packages for this customer */
  sourceManifests: Array<{
    manifestNumber: string;
    packages: ConsolidationPackage[];
    invoiceId?: string;
    invoiceNumber?: string;
  }>;
  /** Recommended target manifest (the one with the most recent packages) */
  suggestedTarget: string;
  /** Pre-computed compliance check for the combined package set */
  compliance: ComplianceResult | null;
  /** Total packages if consolidated */
  combinedPackageCount: number;
  /** Total weight if consolidated */
  combinedWeight: number;
}

/**
 * Result of a carry-on operation.
 */
export interface CarryOnResult {
  success: boolean;
  /** Tracking numbers that were moved */
  movedTrackings: string[];
  /** Invoice that was annulled (if any) */
  annulledInvoiceId?: string;
  /** Manifest the packages were moved to */
  targetManifest: string;
  error?: string;
}

// ── Drag-and-drop types ────────────────────────────────────────────────────────

/**
 * Payload serialized into dataTransfer during HTML5 DnD.
 * Encodes the source package, manifest, and invoice context.
 */
export interface PackageDragPayload {
  packageId: string;
  trackingNumber: string;
  sourceManifest: string;
  slCode: string;
  customerName: string;
  /** Invoice ID the package belongs to (if any) */
  sourceInvoiceId?: string;
  /** Invoice status — used to prevent drops on protected invoices */
  invoiceStatus?: string;
  weight?: number;
  description?: string;
  /**
   * When true, this drag originated from an annulled invoice row for a tracking
   * that has no coverage in any active invoice.
   * The drop target (an active draft invoice) should ADD this item to its
   * invoiceItems array instead of performing a manifest-to-manifest move.
   */
  isRescue?: boolean;
  /** Price of the item in the source annulled invoice (for invoice regeneration) */
  itemPrice?: number;
  /** Raw invoice item data for re-adding to the target invoice */
  invoiceItem?: Record<string, unknown>;
}

export const PACKAGE_DND_TYPE = 'application/x-sl-consolidation-package';

/** Invoice statuses that lock a package from being dragged */
export const NON_DRAGGABLE_INVOICE_STATUSES = new Set(['sent', 'paid', 'overdue']);

/**
 * Determine if a package can be dragged based on its invoice status.
 *
 * Rules:
 *  - Packages in sent/paid/overdue invoices → NOT draggable
 *  - Packages in draft/annulled/cancelled invoices → draggable
 *  - Uninvoiced packages → draggable
 *  - Packages in protected statuses (delivered/processed/returned/pickup) → NOT draggable
 */
export function isPackageDraggable(pkg: ConsolidationPackage): boolean {
  const PROTECTED_STATUSES = new Set(['delivered', 'processed', 'returned', 'pickup']);
  const pkgStatus = (pkg.status || '').toLowerCase();
  if (PROTECTED_STATUSES.has(pkgStatus)) return false;

  // If the package is in a sent/paid invoice, it's locked
  const invStatus = (pkg.invoiceStatus || '').toLowerCase();
  if (NON_DRAGGABLE_INVOICE_STATUSES.has(invStatus)) return false;

  return true;
}

// ── Uninvoiced package diagnostics ──────────────────────────────────────────────

export type UninvoicedReason =
  | 'no_price'
  | 'grace_period'
  | 'annulled_invoice'
  | 'missing_customer_data'
  | 'pending_consolidation'
  | 'invoice_generation_skipped'
  | 'unknown';

export interface UninvoicedDiagnostic {
  reason: UninvoicedReason;
  label: string;
  detail: string;
  /** Suggested action the operator can take */
  action?: string;
}

/**
 * Diagnose why a package in an old manifest doesn't have an active invoice.
 * Checks are ordered from most specific → least specific.
 *
 * @param manifInvoices  - invoices of the current manifest group
 * @param allCustomerInvoices - ALL invoices for this customer across all manifests
 *   (optional but strongly recommended to avoid false-positive 'Pendiente de factura')
 */
export function diagnoseUninvoiced(
  pkg: ConsolidationPackage,
  manifInvoices: ConsolidationInvoice[],
  gracePeriodDays: number,
  allCustomerInvoices?: ConsolidationInvoice[],
): UninvoicedDiagnostic {
  const tn = pkg.trackingNumber.toUpperCase();

  // Build a de-duplicated search list:
  // always check at least manifInvoices; if allCustomerInvoices is given
  // union both so cross-manifest invoices are also found.
  const allInvoices: ConsolidationInvoice[] = allCustomerInvoices
    ? [
        ...allCustomerInvoices,
        // Include any manifest-local invoice not already in the customer list
        ...manifInvoices.filter(mi => !allCustomerInvoices.some(ai => ai.id === mi.id)),
      ]
    : manifInvoices;

  // 0. Most authoritative source: the invoiceId field written directly to
  //    the package document in Firestore. If present, the package IS invoiced.
  if (pkg.invoiceId) {
    const linked = allInvoices.find(inv => inv.id === pkg.invoiceId);
    const st = linked?.status ?? pkg.invoiceStatus ?? 'unknown';
    return {
      reason: 'invoice_generation_skipped',
      label: st === 'paid'
        ? 'Factura pagada'
        : st === 'sent'   ? 'Factura enviada'
        : st === 'overdue' ? 'Factura vencida'
        : st === 'annulled' || st === 'cancelled' ? 'Factura anulada'
        : 'Factura emitida',
      detail: linked
        ? `La factura ${linked.invoiceNumber} (${st}) contiene este paquete.`
        : `El paquete tiene invoiceId=${pkg.invoiceId} (factura no encontrada en la vista actual).`,
      action: st === 'annulled' || st === 'cancelled'
        ? 'Genera una nueva factura o mueve el paquete a otro manifiesto.'
        : 'El paquete permanecerá aquí hasta su entrega o cobro.',
    };
  }

  // 1. Scan ALL invoices (current manifest + all customer manifests) for the tracking.
  //    Group by status to give the most specific diagnostic.
  const DEAD = new Set(['annulled', 'cancelled']);
  const ALIVE = new Set(['paid', 'sent', 'pending', 'overdue', 'pending_payment', 'draft']);

  let foundPaid: ConsolidationInvoice | undefined;
  let foundActive: ConsolidationInvoice | undefined;
  let foundDead: ConsolidationInvoice | undefined;

  for (const inv of allInvoices) {
    const st = (inv.status || '').toLowerCase();
    const hasTracking = inv.invoiceItems?.some(
      it => (it.trackingNumber || '').toUpperCase() === tn
    );
    if (!hasTracking) continue;
    if (st === 'paid') { foundPaid = inv; break; }
    if (ALIVE.has(st) && !foundActive) foundActive = inv;
    if (DEAD.has(st) && !foundDead) foundDead = inv;
  }

  if (foundPaid) {
    return {
      reason: 'invoice_generation_skipped',
      label: 'Factura pagada',
      detail: `La factura ${foundPaid.invoiceNumber} ya fue pagada.`,
      action: 'El paquete permanecerá aquí hasta su entrega o movimiento.',
    };
  }

  if (foundActive) {
    const st = foundActive.status || '';
    return {
      reason: 'invoice_generation_skipped',
      label: st === 'draft' ? 'Factura borrador'
           : st === 'sent'  ? 'Factura enviada'
           : st === 'overdue' ? 'Factura vencida'
           : 'Factura emitida',
      detail: `La factura ${foundActive.invoiceNumber} (${st}) contiene este paquete.`,
      action: 'El paquete permanecerá aquí hasta su entrega o cobro.',
    };
  }

  if (foundDead) {
    return {
      reason: 'annulled_invoice',
      label: 'Factura anulada',
      detail: `La factura ${foundDead.invoiceNumber} fue anulada/cancelada y no se generó reemplazo.`,
      action: 'Genera una nueva factura o mueve el paquete a otro manifiesto.',
    };
  }

  // 2. Check missing customer data
  if (!pkg.slCode) {
    return {
      reason: 'missing_customer_data',
      label: 'Sin código de cliente',
      detail: 'El paquete no tiene slCode asignado y no pudo asociarse a un cliente.',
      action: 'Asigna un cliente al paquete desde el módulo de paquetes.',
    };
  }

  // 3. Check if it's within grace period
  const created = pkg.savedAt || pkg.createdAt;
  if (created) {
    const ageMs = Date.now() - new Date(created).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    if (ageDays <= gracePeriodDays) {
      return {
        reason: 'grace_period',
        label: 'En período de gracia',
        detail: `El paquete tiene ${ageDays} día(s); aún dentro del período de ${gracePeriodDays} días.`,
        action: 'Espera a que se cumplan las reglas de consolidación para facturar.',
      };
    }
  }

  // 4. Check if the package has no price at all (truly no price from any source)
  if (pkg.price == null || pkg.price <= 0) {
    return {
      reason: 'no_price',
      label: 'Sin precio',
      detail: 'El paquete no tiene precio asignado en Firestore (precio/precioSinPermiso/precioConPermiso).',
      action: 'Asigna un precio al paquete desde Nova o el editor de paquetes.',
    };
  }

  // 5. Package has a price but no invoice — likely pending consolidation
  return {
    reason: 'pending_consolidation',
    label: 'Pendiente de factura',
    detail: `Tiene precio ($${pkg.price.toFixed(2)}) pero aún no se ha generado factura. Puede estar esperando más paquetes para consolidar.`,
    action: 'Genera una factura manualmente o espera a la consolidación automática.',
  };
}
