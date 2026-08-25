/**
 * Consolidation Carry-On Service
 *
 * Handles the cross-manifest package reassignment flow ("carry-on"):
 *
 *   1. Admin selects packages from a source manifest
 *   2. System validates compliance with consolidation rules
 *   3. Source invoice is annulled (if it becomes empty / partial)
 *   4. Package manifest references are updated
 *   5. Target invoice is updated or a new consolidation invoice is created
 *
 * Also provides a "suggestion" engine that detects when a customer has
 * packages spread across multiple manifests and recommends consolidation.
 *
 * ── PERSISTENCE CONTRACT (AI GUARD — DO NOT VIOLATE) ──────────────────────────
 *
 *   - NEVER delete packages in PROTECTED_PKG_STATUSES (delivered, processed,
 *     returned, pickup).
 *   - Only annul non-paid, non-protected invoices. PAID invoices are NEVER touched.
 *   - Package documents are NEVER deleted — only their manifestNumber is updated.
 *   - All state transitions use atomic batches where possible.
 *
 */

import {
  doc,
  writeBatch,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  deleteField,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  checkConsolidationCompliance,
  loadActiveConsolidationRules,
  type ComplianceInput,
  type ComplianceResult,
} from './consolidation-rules-service';
import {
  generateInvoiceNumber,
} from './invoice-service';
import { getManifestType, areManifestsCompatible } from '@/pages/consolidation/components/manifest-utils';
import { normalizeOriginCountry as normalizeOriginToCountry } from '@/pages/consolidation/components/normalize-origin';

import type {
  ConsolidationPackage,
  ConsolidationInvoice,
  CarryOnSuggestion,
  CarryOnResult,
  CustomerSection,
} from '@/pages/consolidation/components/types';

// ── Protected statuses (mirrored from invoice-service.ts) ─────────────────────
const PROTECTED_PKG_STATUSES = new Set([
  'delivered',
  'processed',
  'returned',
  'pickup',
]);

const PROTECTED_INVOICE_STATUSES = new Set([
  'paid',
  'cancelled',
  'annulled',
  'void',
]);

// ── Carry-on parameters ────────────────────────────────────────────────────────

export interface CarryOnParams {
  /** Package document IDs to move */
  packageIds: string[];
  /** Source manifest number */
  sourceManifest: string;
  /** Target manifest number */
  targetManifest: string;
  /** Invoice ID to annul (if source packages belong to an invoice) */
  sourceInvoiceId?: string;
  /** Customer slCode */
  slCode: string;
  /** Customer name for the new invoice */
  customerName?: string;
  /** Admin user who initiated the carry-on */
  performedBy: string;
  /** Reason for the carry-on */
  reason?: string;
}

// ── Core: carry-on packages between manifests ─────────────────────────────────

/**
 * Moves packages from one manifest to another, handling invoice state:
 *
 *   1. Validate: ensure packages exist and are movable (not protected)
 *   2. Update packages: set manifestNumber + updatedManifest
 *   3. Annul source invoice (if provided and not protected)
 *   4. Append packages to target invoice OR create new consolidation invoice
 *
 * All writes use a single writeBatch for atomicity.
 */
export async function carryOnPackages(params: CarryOnParams): Promise<CarryOnResult> {
  const {
    packageIds,
    sourceManifest,
    targetManifest,
    sourceInvoiceId,
    slCode,
    customerName,
    performedBy,
    reason,
  } = params;

  if (!packageIds.length || !targetManifest || !slCode) {
    return { success: false, movedTrackings: [], targetManifest: '', error: 'Parámetros incompletos.' };
  }

  if (sourceManifest === targetManifest) {
    return { success: false, movedTrackings: [], targetManifest, error: 'El manifiesto origen y destino son el mismo.' };
  }

  // ── Guard: CONSOLIDACION_TRANSITORIA is a "parking lot", not a real manifest.
  // Packages moved there must NOT generate invoices — the admin will later
  // reassign them to a real manifest and invoice them there.
  const isTargetTransitoria =
    targetManifest.toUpperCase() === 'CONSOLIDACION_TRANSITORIA' ||
    targetManifest.toLowerCase() === 'consolidacion_transitoria';

  // ── Block cross-type transfers (normal ↔ permit) ──────────────────────────
  if (!areManifestsCompatible(sourceManifest, targetManifest)) {
    return {
      success: false,
      movedTrackings: [],
      targetManifest,
      error: 'No se pueden mover paquetes entre manifiestos de permiso y manifiestos normales.',
    };
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  const movedTrackings: string[] = [];

  try {
    // ── Step 1: Validate and collect package data ────────────────────────────
    // Strategy: attempt getDoc by Firestore doc ID first (the canonical path).
    // Fall back to a trackingNumber (or legacy `tracking`) query only when the
    // doc ID lookup fails — handles callers that pass tracking numbers instead
    // of Firestore doc IDs, and packages that predate the trackingNumber field.
    const { getDoc } = await import('firebase/firestore');
    const packageDocs: Array<{ id: string; data: any }> = [];
    for (const pkgId of packageIds) {
      // Primary: look up by Firestore document ID
      const ref = doc(db, 'packages', pkgId);
      const d = await getDoc(ref);
      if (d.exists()) {
        packageDocs.push({ id: d.id, data: d.data() });
        continue;
      }
      // Fallback A: search by `trackingNumber` field (modern field name)
      const snap = await getDocs(
        query(collection(db, 'packages'), where('trackingNumber', '==', pkgId))
      );
      if (!snap.empty) {
        snap.docs.forEach(sd => packageDocs.push({ id: sd.id, data: sd.data() }));
        continue;
      }
      // Fallback B: search by legacy `tracking` field
      const snapLegacy = await getDocs(
        query(collection(db, 'packages'), where('tracking', '==', pkgId))
      );
      if (!snapLegacy.empty) {
        snapLegacy.docs.forEach(sd => packageDocs.push({ id: sd.id, data: sd.data() }));
      }
    }

    if (packageDocs.length === 0) {
      return { success: false, movedTrackings: [], targetManifest, error: 'No se encontraron paquetes para mover.' };
    }

    // Filter out protected packages
    const movable = packageDocs.filter(p => {
      const status = ((p.data.status as string) || '').toLowerCase();
      return !PROTECTED_PKG_STATUSES.has(status);
    });

    if (movable.length === 0) {
      return {
        success: false,
        movedTrackings: [],
        targetManifest,
        error: 'Todos los paquetes seleccionados están en estado protegido y no pueden moverse.',
      };
    }

    // ── Step 2: Update package manifest references ──────────────────────────
    const TRANSITORIA_KEY = 'consolidacion_transitoria';
    for (const pkg of movable) {
      const ref = doc(db, 'packages', pkg.id);

      // Resolve the package's CURRENT origin manifest before overwriting it.
      // Priority: already-stamped originalManifestID > manifestNumber (if not transitoria)
      // > legacy `manifiesto` field > sourceManifest param passed by caller.
      const pkgData = pkg.data;
      const existingOriginalMfId =
        pkgData.originalManifestID ||
        pkgData.originalManifestId ||
        '';
      const currentMfNumber: string =
        pkgData.manifestNumber || pkgData.manifiesto || '';
      const resolvedOrigin: string =
        existingOriginalMfId ||
        (currentMfNumber && currentMfNumber.toLowerCase() !== TRANSITORIA_KEY
          ? currentMfNumber
          : '') ||
        sourceManifest;

      const pkgUpdate: Record<string, any> = {
        // Primary manifest field — must match so all data sources agree
        manifestNumber: targetManifest,
        // Also update legacy fields so they don't cause the package to be wrongly grouped (e.g. as transitoria)
        manifestId: targetManifest,
        manifiesto: targetManifest,
        // Audit trail: tracks the last manual reassignment
        updatedManifest: targetManifest,
        manifestUpdatedAt: now,
        updatedAt: now,
        isReassigned: true,
        // ⚠️ CRITICAL: always stamp consolidacion=true so the package appears
        // in the consolidation hook (which filters where('consolidacion','==',true)).
        // Without this flag, packages that didn't already have it — e.g. a freshly
        // scanned USPS parcel moved to Transitoria — become invisible to the entire
        // consolidation module after the move, making it impossible to re-assign them.
        consolidacion: true,
        ...(!pkgData.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
        status: isTargetTransitoria ? 'consolidated' : 'customs',
        encomiendaManifestNumber: targetManifest.toUpperCase().startsWith('ENC-') ? targetManifest : 'none',
        statusHistory: arrayUnion({
          status: isTargetTransitoria ? 'consolidated' : 'customs',
          changedAt: now,
          changedBy: performedBy,
          note: `Paquete movido de manifiesto ${sourceManifest} a manifiesto ${targetManifest} mediante Carry-On. Razón: ${reason || 'Consolidación manual'}`,
        }),
        carryOnHistory: arrayUnion({
          from: sourceManifest,
          to: targetManifest,
          movedAt: now,
          movedBy: performedBy,
          reason: reason || 'Carry-on consolidación',
        }),

        // 🚨 PREVENTATIVE PRICING GUARD: Clear old manual adjustments, pricing overrides, and
        // rounding weights computed under the source manifest's specific context. This prevents
        // stale pricing/weight data (e.g., $100.00 wholesale pricing overrides or old adjustments)
        // from leaking into the target manifest and corrupting new consolidation calculations.
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
      };

      // When moving to transitoria:
      //  1. Clear invoiceId so the package is uninvoiced and available for re-assignment.
      //  2. STAMP originalManifestID — critical so the data hook can group this package
      //     under its source manifest panel (not under 'sin-asignar').
      if (isTargetTransitoria) {
        pkgUpdate.invoiceId = null;
        pkgUpdate.invoiceNumber = null;
        // Only write originalManifestID if not already set — preserve existing value.
        if (!existingOriginalMfId) {
          pkgUpdate.originalManifestID = resolvedOrigin;
        }
      }

      batch.update(ref, pkgUpdate);
      movedTrackings.push(pkgData.trackingNumber || pkgData.tracking || pkg.id);
    }

    // ── Step 3: Annul source invoice (if applicable) ────────────────────────
    let annulledInvoiceId: string | undefined;
    if (sourceInvoiceId) {
      const invRef = doc(db, 'invoices', sourceInvoiceId);
      try {
        const { getDoc } = await import('firebase/firestore');
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          const invData = invSnap.data();
          const status = ((invData.status as string) || 'draft').toLowerCase();

          if (!PROTECTED_INVOICE_STATUSES.has(status)) {
            batch.update(invRef, {
              status: 'annulled',
              annulledAt: now,
              annulledBy: performedBy,
              annulledReason: reason || `Carry-on: paquetes movidos al manifiesto ${targetManifest}`,
              updatedAt: now,
              statusHistory: arrayUnion({
                status: 'annulled',
                changedAt: now,
                changedBy: performedBy,
                reason: `Carry-on → ${targetManifest}`,
              }),
            });
            annulledInvoiceId = sourceInvoiceId;
          }
        }
      } catch (err) {
        console.warn('[carryOnPackages] Could not annul source invoice:', err);
      }
    }

    // ── Step 4: Ensure packages exist in target invoice ─────────────────────
    // ⚠️ GUARD: CONSOLIDACION_TRANSITORIA is a parking-lot bucket.
    // Packages moved there are intentionally "un-invoiced" so the admin can
    // re-assign them to a real manifest later. Skip all invoice logic.
    if (!isTargetTransitoria) {
      // Helper: resolve a package price using the full fallback chain that
      // mirrors the data hook's normalization (precio → price → precioSinPermiso
      // → precioConPermiso → totalAmount → 0).
      const resolvePrice = (d: any): number => {
        // If there is a manual price adjustment, it is stale because the package
        // is changing manifest context. Ignore it and fall back to the standard calculated price.
        if (d.ajustePrecio) {
          const standardPrice = d.permisos ? d.precioConPermiso : d.precioSinPermiso;
          if (typeof standardPrice === 'number' && standardPrice > 0) {
            return standardPrice;
          }
          const weight = typeof d.weight === 'number' ? d.weight : (d.peso || 0);
          return Math.max(8, Math.ceil(weight) * 12);
        }

        const candidates = [
          d.precio,
          d.price,
          d.precioSinPermiso,
          d.precioConPermiso,
          d.totalAmount,
        ];
        for (const v of candidates) {
          if (typeof v === 'number' && v > 0) return v;
        }
        return 0;
      };

      // Look for an existing non-protected consolidation invoice for this customer
      // in the target manifest
      const targetInvQuery = query(
        collection(db, 'invoices'),
        where('slCode', '==', slCode),
        where('manifestNumber', '==', targetManifest),
        where('isConsolidation', '==', true),
      );
      const targetInvSnap = await getDocs(targetInvQuery);
      const activeTargetInv = targetInvSnap.docs.find(d => {
        const s = ((d.data().status as string) || 'draft').toLowerCase();
        return !PROTECTED_INVOICE_STATUSES.has(s) && s !== 'annulled';
      });

      if (activeTargetInv) {
        // Append items to existing invoice
        const existingItems = activeTargetInv.data().invoiceItems || [];
        const existingTrackings = new Set(
          existingItems.map((it: any) => ((it.trackingNumber || '') as string).toUpperCase())
        );

        const newItems = movable
          .filter(p => !existingTrackings.has(((p.data.trackingNumber || p.data.tracking || '') as string).toUpperCase()))
          .map(p => {
            const unitPrice = resolvePrice(p.data);
            return {
              trackingNumber: p.data.trackingNumber || p.data.tracking || '',
              description: p.data.description || p.data.descripcion || '',
              quantity: 1,
              unitPrice,
              totalPrice: unitPrice,
              weight: typeof p.data.weight === 'number' ? p.data.weight : (p.data.peso || 0),
              realWeight: typeof p.data.weight === 'number' ? p.data.weight : (p.data.peso || 0),
            };
          });

        if (newItems.length > 0) {
          const allItems = [...existingItems, ...newItems];
          const newTotal = allItems.reduce((s: number, it: any) => s + (it.totalPrice || 0), 0);
          batch.update(doc(db, 'invoices', activeTargetInv.id), {
            invoiceItems: allItems,
            totalAmount: newTotal,
            updatedAt: now,
            manifestNumbers: arrayUnion(sourceManifest),
          });

          // ── GAP-9 fix: write the resolved invoiceId back to each package doc ──
          for (const pkg of movable) {
            batch.update(doc(db, 'packages', pkg.id), {
              invoiceId: activeTargetInv.id,
              invoiceNumber: activeTargetInv.data().invoiceNumber || '',
            });
          }
        }
        // Create a new consolidation invoice in the target manifest
        const invoiceNumber = generateInvoiceNumber(slCode, true);
        const items = movable.map(p => {
          const unitPrice = resolvePrice(p.data);
          return {
            trackingNumber: p.data.trackingNumber || p.data.tracking || '',
            description: p.data.description || p.data.descripcion || '',
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
            weight: typeof p.data.weight === 'number' ? p.data.weight : (p.data.peso || 0),
            realWeight: typeof p.data.weight === 'number' ? p.data.weight : (p.data.peso || 0),
          };
        });
        const totalAmount = items.reduce((s, it) => s + it.totalPrice, 0);

        let clientEmail = '';
        let clientDni = '';
        let clientRoute = '';
        let customerData: any = null;

        try {
          const customerSnap = await getDoc(doc(db, 'customers', slCode.toUpperCase().trim()));
          if (customerSnap.exists()) {
            const cData = customerSnap.data();
            clientEmail = cData.email || '';
            clientDni = cData.dni || '';
            clientRoute = cData.ruta || '';
            customerData = {
              id: slCode,
              fullName: cData.fullName || customerName || slCode,
              email: clientEmail,
              slCode,
              ruta: clientRoute || null,
            };
          }
        } catch (err) {
          console.warn('[carryOnPackages] Could not fetch customer info:', err);
        }

        if (!customerData) {
          customerData = {
            id: slCode,
            fullName: customerName || slCode,
            email: '',
            slCode,
            ruta: null,
          };
        }

        const newInvRef = doc(collection(db, 'invoices'));
        batch.set(newInvRef, {
          invoiceNumber,
          slCode,
          clientSlCode: slCode,
          clientName: customerData.fullName,
          clientEmail,
          clientDni,
          clientRoute,
          manifestNumber: targetManifest,
          manifestNumbers: [sourceManifest, targetManifest],
          totalAmount,
          currency: 'USD',
          status: 'draft',
          isConsolidation: true,
          invoiceItems: items,
          createdAt: now,
          updatedAt: now,
          createdBy: performedBy,
          carryOnSource: {
            sourceManifest,
            sourceInvoiceId: sourceInvoiceId || null,
            movedTrackings,
            movedAt: now,
          },
          customer: customerData,
        });

        // ── GAP-9 fix: write the new invoiceId back to each package doc ──
        for (const pkg of movable) {
          batch.update(doc(db, 'packages', pkg.id), {
            invoiceId: newInvRef.id,
            invoiceNumber,
          });
        }
      }
    }

    // ── Commit ──────────────────────────────────────────────────────────────
    await batch.commit();

    return {
      success: true,
      movedTrackings,
      targetManifest,
      annulledInvoiceId,
    };
  } catch (err: any) {
    console.error('[carryOnPackages] Error:', err);
    return {
      success: false,
      movedTrackings: [],
      targetManifest,
      error: err?.message || 'Error desconocido al mover paquetes.',
    };
  }
}

// ── Carry-on compliance preview ───────────────────────────────────────────────

/**
 * Pre-checks whether the combined set of packages at the target manifest
 * would pass consolidation compliance rules.
 *
 * This is a dry-run: it reads data but writes nothing.
 */
export async function checkCarryOnCompliance(params: {
  /** Packages being moved */
  movingPackages: ConsolidationPackage[];
  /** Packages already in the target manifest for this customer */
  targetExistingPackages: ConsolidationPackage[];
  slCode: string;
}): Promise<ComplianceResult> {
  const { movingPackages, targetExistingPackages, slCode } = params;
  const combined = [...targetExistingPackages, ...movingPackages];

  const totalWeight = combined.reduce((s, p) => s + (p.weight || 0), 0);
  const totalValue = combined.reduce((s, p) => s + (p.price || 0), 0);
  const origins = new Set(combined.map(p => normalizeOriginToCountry(p.origin || 'USA')));
  const categories = combined
    .map(p => p.description || '')
    .filter(Boolean);

  // Derive a single originCountry. Since we already normalized all origins,
  // we just take the first one if there's only one unique canonical origin.
  let resolvedOrigin: string | undefined;
  if (origins.size === 1) {
    resolvedOrigin = origins.values().next().value;
  }

  const input: ComplianceInput = {
    slCode,
    packageCount: combined.length,
    totalWeightKg: totalWeight,
    totalValueUSD: totalValue,
    mixedOrigins: origins.size > 1,
    originCountry: resolvedOrigin,
    hasSpecialPermit: combined.some(p => p.requiresPermit),
    categories,
  };

  return checkConsolidationCompliance(input);
}

// ── Smart suggestions ─────────────────────────────────────────────────────────

/**
 * Generates carry-on suggestions for customers with packages spread
 * across multiple manifests.
 *
 * Logic:
 *   1. For each customer section with manifestCount > 1
 *   2. Determine the "target" manifest (most recent or most packages)
 *   3. Run compliance check on the combined set
 *   4. Return suggestion with pre-computed compliance result
 *
 * The UI can display these as banners: "Este cliente tiene paquetes en
 * 2 manifiestos — sugerimos consolidarlos."
 */
export async function generateCarryOnSuggestions(
  customerSections: CustomerSection[],
): Promise<CarryOnSuggestion[]> {
  const multiManifestSections = customerSections.filter(s => s.manifestCount > 1);
  if (multiManifestSections.length === 0) return [];

  // Pre-load rules once for all checks
  const rules = await loadActiveConsolidationRules();
  const suggestions: CarryOnSuggestion[] = [];

  for (const section of multiManifestSections) {
    const { customer, manifestGroups } = section;

    // Only consider groups with non-protected, non-delivered packages
    const activeGroups = manifestGroups.filter(g =>
      g.packages.some(p => !PROTECTED_PKG_STATUSES.has((p.status || '').toLowerCase()))
    );

    if (activeGroups.length <= 1) continue;

    // ── Group compatible manifests ──────────────────────────────────────────
    // Build suggestion groups per manifest type (normal, permit)
    // Only suggest carry-on within the same type
    const groupsByType = new Map<string, typeof activeGroups>();
    for (const g of activeGroups) {
      const mType = getManifestType(g.manifestNumber);
      const arr = groupsByType.get(mType) || [];
      arr.push(g);
      groupsByType.set(mType, arr);
    }

    // Only process types that have 2+ manifests
    for (const [, compatibleGroups] of groupsByType) {
      if (compatibleGroups.length <= 1) continue;

    // Determine target: the manifest with the most packages (or most recent)
    const sorted = [...compatibleGroups].sort((a, b) => {
      // Primary: package count (more packages = likely the "main" manifest)
      const countDiff = b.packages.length - a.packages.length;
      if (countDiff !== 0) return countDiff;
      // Tiebreak: alphabetical (higher manifest number usually = more recent)
      return b.manifestNumber.localeCompare(a.manifestNumber);
    });
    const target = sorted[0];
    const sources = sorted.slice(1);

    // Build source manifest info
    const sourceManifests = sources.map(g => {
      const activeInvoice = g.invoices.find(inv =>
        !PROTECTED_INVOICE_STATUSES.has(inv.status?.toLowerCase() || '') &&
        inv.status?.toLowerCase() !== 'annulled'
      );
      return {
        manifestNumber: g.manifestNumber,
        packages: g.packages.filter(p => !PROTECTED_PKG_STATUSES.has((p.status || '').toLowerCase())),
        invoiceId: activeInvoice?.id,
        invoiceNumber: activeInvoice?.invoiceNumber,
      };
    }).filter(s => s.packages.length > 0);

    if (sourceManifests.length === 0) continue;

    // Compliance check
    const allSourcePkgs = sourceManifests.flatMap(s => s.packages);
    const targetPkgs = target.packages.filter(p =>
      !PROTECTED_PKG_STATUSES.has((p.status || '').toLowerCase())
    );
    const combinedCount = allSourcePkgs.length + targetPkgs.length;
    const combinedWeight = [...allSourcePkgs, ...targetPkgs].reduce(
      (s, p) => s + (p.weight || 0), 0
    );

    let compliance: ComplianceResult | null = null;
    try {
      compliance = await checkCarryOnCompliance({
        movingPackages: allSourcePkgs,
        targetExistingPackages: targetPkgs,
        slCode: customer.slCode,
      });
    } catch {
      // Compliance check failed; still show suggestion without compliance
    }

    suggestions.push({
      slCode: customer.slCode,
      customerName: customer.fullName,
      sourceManifests,
      suggestedTarget: target.manifestNumber,
      compliance,
      combinedPackageCount: combinedCount,
      combinedWeight,
    });

    } // end for-of groupsByType
  }

  return suggestions;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Computes days elapsed since a given date string.
 * Returns -1 if the date is invalid or missing.
 */
export function daysSince(dateStr?: string | null): number {
  if (!dateStr) return -1;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return -1;
    return Math.floor((Date.now() - d.getTime()) / (86_400_000));
  } catch {
    return -1;
  }
}

/**
 * Returns the oldest savedAt/createdAt among a set of packages.
 * Used to compute grace period countdowns.
 */
export function oldestPackageDate(packages: ConsolidationPackage[]): string | null {
  let oldest: string | null = null;
  for (const pkg of packages) {
    const d = pkg.savedAt || pkg.createdAt;
    if (!d) continue;
    if (!oldest || d < oldest) oldest = d;
  }
  return oldest;
}
