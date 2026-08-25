/**
 * useConsolidationData (v2 — Invoice-Centric)
 *
 * Real-time Firestore hook for the Consolidation Manifests module.
 *
 * Three onSnapshot subscriptions:
 *  1. customers  where consolidationEnabled == true
 *  2. packages   where consolidacion == true
 *  3. invoices   where isConsolidation == true
 *
 * Returns data grouped as CustomerSection[] for the page to render,
 * enriched with compliance-relevant metrics (totalWeight, totalAmount,
 * manifestCount) for inline rule evaluation.
 *
 * The old `manifest_consolidation` mirror collection is NOT used.
 */

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type {
  ConsolidationCustomer,
  ConsolidationInvoice,
  ConsolidationPackage,
  CustomerSection,
  ManifestGroup,
} from './types';
import { normalizeManifest, TRANSITORIA_MANIFEST } from './normalize-manifest';

const CUSTOMERS_COLLECTION = 'customers';
const PACKAGES_COLLECTION  = 'packages';
const INVOICES_COLLECTION  = 'invoices';

export interface UseConsolidationDataResult {
  customerSections: CustomerSection[];
  allManifestNumbers: string[];
  /** Flat list of all consolidation invoices */
  allInvoices: ConsolidationInvoice[];
  /** Flat list of all consolidation packages */
  allPackages: ConsolidationPackage[];
  loading: boolean;
  error: string | null;
}

export function useConsolidationData(): UseConsolidationDataResult {
  const [customers, setCustomers] = useState<ConsolidationCustomer[]>([]);
  const [packages,  setPackages]  = useState<ConsolidationPackage[]>([]);
  const [invoices,  setInvoices]  = useState<ConsolidationInvoice[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingPackages,  setLoadingPackages]  = useState(true);
  const [loadingInvoices,  setLoadingInvoices]  = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // ── 1. Consolidation customers ───────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, CUSTOMERS_COLLECTION),
      where('consolidationEnabled', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!mounted.current) return;
        const list: ConsolidationCustomer[] = snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            slCode:   data.slCode   || d.id,
            fullName: data.fullName || data.name || data.slCode || d.id,
            email:    data.email,
            phone:    data.phone || data.phoneNumber,
            ruta:     data.ruta,
            dni:      data.verifiedDni || data.dni,
            courierService: data.courierService,
          };
        });
        setCustomers(list);
        setLoadingCustomers(false);
      },
      (err) => {
        if (!mounted.current) return;
        console.error('[ConsolidationData] customers error:', err);
        setError('Error al cargar clientes de consolidación.');
        setLoadingCustomers(false);
      }
    );
    return unsub;
  }, []);

  // ── 2. Consolidated packages ─────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, PACKAGES_COLLECTION),
      where('consolidacion', '==', true),
      where('status', 'not-in', ['delivered', 'processed', 'returned', 'pickup'])
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!mounted.current) return;
        const TRANSITORIA = 'consolidacion_transitoria';
        const list: ConsolidationPackage[] = snap.docs
          .map(d => {
          const data = d.data() as any;
          const original  = data.manifestNumber  || data.manifiesto || '';
          const updated   = data.updatedManifest  || '';
          // For packages moved to transitoria by the old handler, `originalManifestID`
          // was never saved. However, the old handler ONLY updated `manifestId` and
          // `manifestNumber` — it never touched the legacy `manifiesto` field.
          // That field still holds the real origin manifest number, so we use it
          // as a fallback to recover the correct grouping key.
          const origMfId  = data.originalManifestID || data.originalManifestId
            || (data.manifiesto && (data.manifiesto || '').toLowerCase() !== TRANSITORIA ? data.manifiesto : '')
            || '';
          // Detect whether this package is currently in the transitoria bucket
          const isTransitoria =
            (data.manifestId || '').toLowerCase() === TRANSITORIA ||
            (original || '').toLowerCase()        === TRANSITORIA ||
            (data.manifiesto || '').toLowerCase() === TRANSITORIA ||
            (updated || '').toLowerCase()         === TRANSITORIA;
          // Map the package's OWN price (set during Nova processing)
          const nativePrice =
            typeof data.precio === 'number' ? data.precio
            : typeof data.price === 'number' ? data.price
            : typeof data.precioSinPermiso === 'number' ? data.precioSinPermiso
            : typeof data.precioConPermiso === 'number' ? data.precioConPermiso
            : undefined;

          return {
            id:               d.id,
            trackingNumber:   data.trackingNumber || data.tracking  || '',
            description:      data.description   || data.descripcion || '',
            weight:           typeof data.weight === 'number' ? data.weight
                              : (typeof data.peso === 'number' ? data.peso : undefined),
            status:           data.status || '',
            manifestNumber:   original,
            updatedManifest:  updated,
            manifestUpdatedAt: data.manifestUpdatedAt,
            slCode:           data.slCode || '',
            customerName:     data.customerName || data.nombreCliente || '',
            ruta:             data.ruta || '',
            origin:           data.origin || data.origen || 'USA',
            destination:      data.destination || data.destino || 'CR',
            requiresPermit:   data.requiresPermit || data.permisos || false,
            createdAt:        data.createdAt || data.savedAt || '',
            savedAt:          data.savedAt || '',
            isReassigned:     !!updated && updated !== original,
            isTransitoria,
            originalManifestID: origMfId,
            price:            nativePrice,
            currency:         data.currency || (nativePrice != null ? 'USD' : undefined),
            invoicedAt:       data.invoicedAt || '',
            annulledInvoiceId: data.annulledInvoiceId || '',
            annulledInvoiceNumber: data.annulledInvoiceNumber || '',
            annulledAt:       data.annulledAt || '',
            firstConsolidatedAt: data.firstConsolidatedAt || '',
            statusHistory:    data.statusHistory || [],
          };
        });
        setPackages(list);
        setLoadingPackages(false);
      },
      (err) => {
        if (!mounted.current) return;
        console.error('[ConsolidationData] packages error:', err);
        setError('Error al cargar paquetes de consolidación.');
        setLoadingPackages(false);
      }
    );
    return unsub;
  }, []);

  // ── 3. Consolidation invoices ─────────────────────────────────────────────
  // DUAL-QUERY STRATEGY to handle historical invoices where isConsolidation was
  // incorrectly set to false (e.g. single-package invoices created for consolidation
  // customers, where buildInvoiceData set isConsolidation = rows.length > 1 = false).
  //
  // Query A: isConsolidation == true  — all properly flagged invoices (new invoices)
  // Query B: slCode in [consolidation customer slCodes] — catches invoices that belong
  //           to consolidation customers regardless of the isConsolidation flag value.
  //           This is the safety net for the historical data bug.
  //
  // Both result sets are merged and deduplicated by document ID.
  const queryAMapRef = useRef(new Map<string, ConsolidationInvoice>());
  const queryBMapRef = useRef(new Map<string, ConsolidationInvoice>());

  const parseInvoiceDoc = (d: any): ConsolidationInvoice => {
    const data = d.data() as any;
    return {
      id:              d.id,
      invoiceNumber:   data.invoiceNumber || '',
      slCode:          data.slCode || data.customerId || data.clientSlCode || '',
      clientName:      data.clientName || '',
      manifestNumber:  data.manifestNumber || '',
      manifestNumbers: data.manifestNumbers || [],
      totalAmount:     data.totalAmount ?? data.amount ?? 0,
      currency:        data.currency || 'USD',
      status:          data.status || 'draft',
      isConsolidation: true,
      createdAt:       data.createdAt || '',
      updatedAt:       data.updatedAt || '',
      invoiceItems:    data.invoiceItems || [],
      // Soft-delete support
      isDeleted:       data.isDeleted === true,
      deletedAt:       data.deletedAt || null,
      statusHistory:   data.statusHistory || [],
    };
  };

  const flushInvoices = useCallback(() => {
    if (!mounted.current) return;
    const merged = new Map<string, ConsolidationInvoice>();
    for (const [id, inv] of queryAMapRef.current.entries()) {
      merged.set(id, inv);
    }
    for (const [id, inv] of queryBMapRef.current.entries()) {
      merged.set(id, inv);
    }
    // Exclude soft-deleted invoices from the live view (they go to the recycle bin)
    const active = Array.from(merged.values()).filter(inv => !inv.isDeleted);
    setInvoices(active);
    setLoadingInvoices(false);
  }, []);

  // Query A — isConsolidation == true
  useEffect(() => {
    const q = query(
      collection(db, INVOICES_COLLECTION),
      where('isConsolidation', '==', true)
    );
    return onSnapshot(q, (snap) => {
      if (!mounted.current) return;
      const nextMap = new Map<string, ConsolidationInvoice>();
      snap.docs.forEach(d => {
        nextMap.set(d.id, parseInvoiceDoc(d));
      });
      queryAMapRef.current = nextMap;
      flushInvoices();
    }, (err) => {
      console.error('[ConsolidationData] invoices (Query A) error:', err);
      flushInvoices();
    });
  }, [flushInvoices]);

  // Query B — by slCode for all customers with consolidation enabled.
  useEffect(() => {
    const slCodes = customers.map(c => c.slCode).filter(Boolean);
    if (!slCodes.length) {
      queryBMapRef.current.clear();
      flushInvoices();
      return;
    }

    const CHUNK = 30;
    const unsubs: (() => void)[] = [];
    const chunkMaps: Map<string, ConsolidationInvoice>[] = [];

    for (let i = 0; i < slCodes.length; i += CHUNK) {
      const chunk = slCodes.slice(i, i + CHUNK);
      const chunkIndex = chunkMaps.length;
      chunkMaps.push(new Map());

      const q = query(
        collection(db, INVOICES_COLLECTION),
        where('slCode', 'in', chunk)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!mounted.current) return;
        const currentChunkMap = new Map<string, ConsolidationInvoice>();
        snap.docs.forEach(d => {
          currentChunkMap.set(d.id, parseInvoiceDoc(d));
        });
        chunkMaps[chunkIndex] = currentChunkMap;

        const allB = new Map<string, ConsolidationInvoice>();
        for (const cm of chunkMaps) {
          for (const [id, inv] of cm.entries()) {
            allB.set(id, inv);
          }
        }
        queryBMapRef.current = allB;
        flushInvoices();
      }, (err) => {
        console.warn('[ConsolidationData] invoices (Query B chunk) error:', err);
      });
      unsubs.push(unsub);
    }

    return () => unsubs.forEach(u => u());
  }, [customers, flushInvoices]);


  // ── Derived indexes ──────────────────────────────────────────────────────
  const customerSlCodes = useMemo(
    () => new Set(customers.map(c => c.slCode)),
    [customers]
  );

  /** Terminal statuses — packages that have completed their lifecycle */
  const EXCLUDED_PKG_STATUSES = useMemo(
    () => new Set(['delivered', 'processed', 'returned', 'pickup']),
    []
  );

  /** Packages keyed by slCode (only those matching known consolidation customers).
   *  Excludes terminal-status packages (delivered/processed/returned/pickup). */
  const packagesBySlCode = useMemo(() => {
    const map = new Map<string, ConsolidationPackage[]>();
    for (const pkg of packages) {
      if (!pkg.slCode || !customerSlCodes.has(pkg.slCode)) continue;
      // Skip packages that have completed their lifecycle
      const status = (pkg.status || '').toLowerCase();
      if (EXCLUDED_PKG_STATUSES.has(status)) continue;
      if (!map.has(pkg.slCode)) map.set(pkg.slCode, []);
      map.get(pkg.slCode)!.push(pkg);
    }
    return map;
  }, [packages, customerSlCodes, EXCLUDED_PKG_STATUSES]);

  /** Same as `packagesBySlCode` but INCLUDES terminal-status packages.
   *  Used only for invoice-item status lookup so the consolidation invoice
   *  row can still render the package status (Entregado, etc.) even after
   *  the operational view filters the package out. */
  const allPackagesBySlCode = useMemo(() => {
    const map = new Map<string, ConsolidationPackage[]>();
    for (const pkg of packages) {
      if (!pkg.slCode || !customerSlCodes.has(pkg.slCode)) continue;
      if (!map.has(pkg.slCode)) map.set(pkg.slCode, []);
      map.get(pkg.slCode)!.push(pkg);
    }
    return map;
  }, [packages, customerSlCodes]);

  /** Invoices keyed by slCode */
  const invoicesBySlCode = useMemo(() => {
    const map = new Map<string, ConsolidationInvoice[]>();
    for (const inv of invoices) {
      const key = inv.slCode || '';
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    }
    return map;
  }, [invoices]);


  // ── Build CustomerSection[] ──────────────────────────────────────────────
  const customerSections = useMemo((): CustomerSection[] => {
    return customers
      .map(customer => {
        const pkgs   = packagesBySlCode.get(customer.slCode) || [];
        const allPkgs = allPackagesBySlCode.get(customer.slCode) || [];
        const allInvs = invoicesBySlCode.get(customer.slCode) || [];

        // ── Filter out fully resolved invoices ──────────────────────────────
        // Rules per invoice status:
        //  ACTIVE (draft/pending/sent/overdue)  → always keep, no matter what
        //  PAID                                 → keep if any package is non-terminal OR
        //                                         package not found in allPkgs (may be missing
        //                                         consolidacion flag — we need to enrich the
        //                                         tracking so invoiceId gets set on the pkg)
        //  CANCELLED / ANNULLED                 → only keep if a confirmed non-terminal package
        //                                         exists; "package not found" does NOT keep it
        //                                         (dead invoices without active packages = clutter)
        const ACTIVE_INVOICE_STATUSES = new Set(['draft', 'pending', 'sent', 'overdue', 'pending_payment']);
        const DEAD_INVOICE_STATUSES   = new Set(['cancelled', 'annulled']);
        const invs = allInvs.filter(inv => {
          const status = (inv.status || '').toLowerCase();

          // Always keep active billing states
          if (ACTIVE_INVOICE_STATUSES.has(status)) return true;

          // No items → nothing to check → hide
          if (!inv.invoiceItems || inv.invoiceItems.length === 0) return false;

          const isDead = DEAD_INVOICE_STATUSES.has(status);

          return inv.invoiceItems.some(item => {
            const tn = (item.trackingNumber || '').toUpperCase();
            if (!tn) return false;
            const pkg = allPkgs.find(p => (p.trackingNumber || '').toUpperCase() === tn);

            if (!pkg) {
              // Package not in allPkgs:
              //  - Paid invoice  → keep (the package may lack the consolidacion flag; we still
              //                    need to show the invoice so trackingInvMap is built and
              //                    invoiceId can be resolved on the package side)
              //  - Dead invoice  → do NOT keep (annulled/cancelled with no traceable package
              //                    is just clutter — it won't help the admin take any action)
              return !isDead;
            }

            // Package found — keep the invoice only if the package is still active
            return !EXCLUDED_PKG_STATUSES.has((pkg.status || '').toLowerCase());
          });
        });

        // ── Build tracking → best invoice item map ──────────────────────────
        type InvItemEntry = {
          price: number;
          invoiceNumber: string;
          invoiceStatus: string;
          invoiceId: string;
          currency: string;
        };
        const isDeadInvoice = (status?: string) => {
          const s = (status || '').toLowerCase();
          return s === 'cancelled' || s === 'annulled' || s === 'void' || s === 'deleted';
        };

        const trackingInvMap = new Map<string, InvItemEntry>();
        for (const inv of invs) {
          for (const item of (inv.invoiceItems || [])) {
            const tn = (item.trackingNumber || '').toUpperCase();
            if (!tn) continue;
            const candidate: InvItemEntry = {
              price:         item.totalPrice ?? item.unitPrice ?? 0,
              invoiceNumber: inv.invoiceNumber,
              invoiceStatus: inv.status,
              invoiceId:     inv.id,
              currency:      inv.currency || 'USD',
            };
            const existing = trackingInvMap.get(tn);
            const existingDead = isDeadInvoice(existing?.invoiceStatus);
            const candidateDead = isDeadInvoice(candidate.invoiceStatus);
            if (
              !existing ||
              (existingDead && !candidateDead) ||
              (!existingDead && !candidateDead && candidate.price > existing.price) ||
              (existingDead && candidateDead && candidate.price > existing.price)
            ) {
              trackingInvMap.set(tn, candidate);
            }
          }
        }

        // ── Enrich packages with price + invoice data ───────────────────────
        const enrichedPkgs: ConsolidationPackage[] = pkgs.map(pkg => {
          const tn    = (pkg.trackingNumber || '').toUpperCase();
          const entry = trackingInvMap.get(tn);
          if (!entry) return pkg;

          const entryIsDead = isDeadInvoice(entry.invoiceStatus);

          if (entryIsDead) {
            // Matched invoice is annulled/cancelled/void — package is NOT active in this invoice.
            // Retain price/currency for display/billing calculation, but clear active invoice links
            // so the package is draggable and not displayed with a lock icon.
            return {
              ...pkg,
              price: pkg.price ?? entry.price,
              currency: pkg.currency ?? entry.currency,
              invoiceNumber: undefined,
              invoiceStatus: undefined,
              invoiceId: undefined,
              annulledInvoiceNumber: pkg.annulledInvoiceNumber || entry.invoiceNumber,
            };
          }

          return {
            ...pkg,
            price: entry.price,
            currency: entry.currency,
            invoiceNumber: entry.invoiceNumber,
            invoiceStatus: entry.invoiceStatus,
            invoiceId: entry.invoiceId,
          };
        });

        /** Group packages by their effective manifest.
         *
         *  KEY RULE: packages in CONSOLIDACION_TRANSITORIA always go into the
         *  CONSOLIDACION_TRANSITORIA bucket — NOT under their originalManifestID.
         *  The annulled source invoice (which still lists them in invoiceItems) is
         *  what keeps the orange block visible in the source manifest.
         *  Grouping the PACKAGE under the source manifest was causing a double-show:
         *  the package appeared stuck in the orange block even after being moved.
         *
         *  For non-Transitoria packages: updatedManifest takes priority over
         *  manifestNumber (handles manual reassignments that don't clear the original).
         *
         *  Manifest keys are normalized to prevent duplicate groups from
         *  casing/whitespace differences in Firestore data. */
        const manifestPkgMap = new Map<string, ConsolidationPackage[]>();
        for (const pkg of enrichedPkgs) {
          let mf: string;
          if (pkg.isTransitoria) {
            // Package is parked in Transitoria — always place it there.
            // The orange block in the source manifest comes from the INVOICE,
            // not from the package being in that bucket.
            mf = TRANSITORIA_MANIFEST;
          } else {
            mf = normalizeManifest(pkg.updatedManifest || pkg.manifestNumber);
          }
          if (!manifestPkgMap.has(mf)) manifestPkgMap.set(mf, []);
          manifestPkgMap.get(mf)!.push(pkg);
        }

        /** Group invoices by manifestNumber (normalized).
         *  An invoice can belong to multiple manifest groups when:
         *   (a) inv.manifestNumbers[] lists multiple manifests (cross-manifest invoice)
         *   (b) inv.manifestNumber doesn't match the package's actual manifest
         *       (e.g. created under a different manifest than the package currently lives in)
         *  Strategy: index by all known manifest numbers, THEN do a second pass
         *  to catch invoices whose items match packages in a specific manifest group. */
        const manifestInvMap = new Map<string, ConsolidationInvoice[]>();

        const addToManifestInvMap = (mf: string, inv: ConsolidationInvoice) => {
          const normalized = normalizeManifest(mf);
          if (!normalized) return;
          if (!manifestInvMap.has(normalized)) manifestInvMap.set(normalized, []);
          const existing = manifestInvMap.get(normalized)!;
          if (!existing.some(e => e.id === inv.id)) existing.push(inv);
        };

        for (const inv of invs) {
          // Index by primary manifestNumber
          addToManifestInvMap(inv.manifestNumber, inv);
          // Also index by each entry in the manifestNumbers[] array (multi-manifest invoices)
          for (const mf of (inv.manifestNumbers || [])) {
            addToManifestInvMap(mf, inv);
          }
        }

        // Second pass: for any invoice whose tracking number matches a package in a
        // manifest group NOT yet covered, add the invoice to that group as well.
        // This catches the case where inv.manifestNumber is empty or wrong but the
        // package clearly lives in a specific manifest.
        for (const inv of invs) {
          for (const item of (inv.invoiceItems || [])) {
            const tn = (item.trackingNumber || '').toUpperCase();
            if (!tn) continue;
            for (const [mfKey, pkgsInGroup] of manifestPkgMap) {
              if (pkgsInGroup.some(p => (p.trackingNumber || '').toUpperCase() === tn)) {
                addToManifestInvMap(mfKey, inv);
              }
            }
          }
        }

        /** Union of manifest numbers from both packages and invoices */
        const allMf = new Set([...manifestPkgMap.keys(), ...manifestInvMap.keys()]);

        const manifestGroups: ManifestGroup[] = Array.from(allMf)
          .sort()
          .map(mf => ({
            manifestNumber:        mf,
            packages:              manifestPkgMap.get(mf) || [],
            invoices:              manifestInvMap.get(mf) || [],
            hasTransitoriaPackages: (manifestPkgMap.get(mf) || []).some(p => p.isTransitoria),
          }));

        // ── Compute aggregates ──────────────────────────────────────────────
        const totalWeight = enrichedPkgs.reduce((sum, p) => sum + (p.weight || 0), 0);
        const totalAmount = invs
          .filter(inv => inv.status !== 'cancelled' && inv.status !== 'annulled')
          .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

        // Enrich the lookup-only list with price+invoice metadata so the
        // invoice-row badge still shows the right state, even for delivered
        // packages that don't appear in any manifest group.
        const enrichedLookup: ConsolidationPackage[] = allPkgs.map(pkg => {
          const tn    = (pkg.trackingNumber || '').toUpperCase();
          const entry = trackingInvMap.get(tn);
          return entry
            ? { ...pkg, price: entry.price, currency: entry.currency, invoiceNumber: entry.invoiceNumber, invoiceStatus: entry.invoiceStatus, invoiceId: entry.invoiceId }
            : pkg;
        });

        return {
          customer,
          manifestGroups,
          /** All customer packages (including terminal-status) for badge lookup only */
          lookupPackages: enrichedLookup,
          totalPackages: allPkgs.length,
          totalWeight,
          totalAmount,
          manifestCount: allMf.size,
        };
      })
      // Only include customers who have actual displayable content:
      // (a) at least one manifest group with packages (non-terminal), OR
      // (b) at least one manifest group with active invoices, OR
      // (c) at least one invoice in an active billing state with live items.
      // Customers whose every package is terminal AND every invoice is paid/annulled
      // are fully resolved and should not appear in the operational view.
      .filter(s => {
        // Check for actual content in manifest groups
        const hasPackagesInGroups = s.manifestGroups.some(g => g.packages.length > 0);
        if (hasPackagesInGroups) return true;

        // Check for active invoices in manifest groups
        const hasActiveInvoices = s.manifestGroups.some(g =>
          g.invoices.some(inv => {
            const st = (inv.status || '').toLowerCase();
            return st !== 'paid' && st !== 'annulled' && st !== 'cancelled';
          })
        );
        if (hasActiveInvoices) return true;

        // Check for actionable invoices with live package references
        const allCustomerPkgs = s.lookupPackages;
        const pkgByTn = new Map(
          allCustomerPkgs.map(p => [(p.trackingNumber || '').toUpperCase(), p])
        );
        return s.manifestGroups.some(g =>
          g.invoices.some(inv => {
            const st = (inv.status || '').toLowerCase();
            if (st === 'paid' || st === 'annulled' || st === 'cancelled') return false;
            if (!inv.invoiceItems || inv.invoiceItems.length === 0) return false;
            return inv.invoiceItems.some(item => {
              const tn = (item.trackingNumber || '').toUpperCase();
              if (!tn) return false;
              const pkg = pkgByTn.get(tn);
              if (pkg && !EXCLUDED_PKG_STATUSES.has((pkg.status || '').toLowerCase())) return true;
              return false;
            });
          })
        );
      })
      .sort((a, b) => a.customer.fullName.localeCompare(b.customer.fullName));
  }, [customers, packagesBySlCode, allPackagesBySlCode, invoicesBySlCode]);

  /** Flat sorted list of all known manifest numbers (normalized) */
  const allManifestNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const pkg of packages) {
      if (pkg.manifestNumber)  set.add(normalizeManifest(pkg.manifestNumber));
      if (pkg.updatedManifest) set.add(normalizeManifest(pkg.updatedManifest));
    }
    for (const inv of invoices) {
      if (inv.manifestNumber) set.add(normalizeManifest(inv.manifestNumber));
      (inv.manifestNumbers || []).forEach(m => set.add(normalizeManifest(m)));
    }

    /**
     * Sort newest → oldest by extracting DD-MM-YYYY from the manifest number.
     * Supports formats:
     *   "28-04-2026DAN"       → 2026-04-28
     *   "MEGA-MAN-09-04-2026" → 2026-04-09
     * Falls back to reverse-alphabetical when date is unparseable.
     * CONSOLIDACION_TRANSITORIA is always pinned to the end of the list.
     */
    const parseManifestDate = (m: string): number => {
      // Match DD-MM-YYYY anywhere in the string
      const match = m.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (match) {
        const [, dd, mm, yyyy] = match;
        return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
      }
      return 0; // unparseable → sort to end
    };

    // Remove Transitoria from set so we can pin it at the very end.
    set.delete(TRANSITORIA_MANIFEST);

    const sorted = Array.from(set).sort((a, b) => {
      const da = parseManifestDate(a);
      const db = parseManifestDate(b);
      if (da !== db) return db - da; // descending (newest first)
      return b.localeCompare(a);     // fallback: reverse alpha
    });

    // Always include CONSOLIDACION_TRANSITORIA as last option.
    sorted.push(TRANSITORIA_MANIFEST);

    return sorted;
  }, [packages, invoices]);

  const loading = loadingCustomers || loadingPackages || loadingInvoices;

  return { customerSections, allManifestNumbers, allInvoices: invoices, allPackages: packages, loading, error };
}
