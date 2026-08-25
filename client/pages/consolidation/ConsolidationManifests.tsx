/**
 * ConsolidationManifests (v2 — Invoice-Centric)
 *
 * Main page for managing consolidation invoices. Sources data directly from:
 *   - invoices  where isConsolidation == true
 *   - packages  where consolidacion == true
 *   - customers where consolidationEnabled == true
 *
 * Features:
 *   - Real-time Firestore subscriptions (no mirror collection)
 *   - Grouping by customer or by manifest
 *   - Inline compliance badges from consolidation rules
 *   - Smart carry-on suggestions when packages span manifests
 *   - Carry-on dialog for cross-manifest package reassignment
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import {
  Layers,
  Archive,
  RefreshCw,
  AlertCircle,
  Package,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  LayoutGrid,
  AlertTriangle,
  X,
  Search,
  User,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ManifestPicker, type ManifestCategory } from '@/components/manifest/ManifestPicker';

// ── Data & services ────────────────────────────────────────────────────────────
import { useConsolidationData } from './components/useConsolidationData';
import { type GroupByMode } from './components/ConsolidationFilters';
import { ConsolidationCustomerCard } from './components/ConsolidationCustomerCard';
import { ConsolidationCarryOnDialog } from './components/ConsolidationCarryOnDialog';
import { KanbanBoard } from './components/KanbanBoard';
import { InvoiceAuditDialog } from './components/InvoiceAuditDialog';

import {
  checkConsolidationCompliance,
  loadActiveConsolidationRules,
  type ComplianceResult,
  type ConsolidationRule,
} from '@/lib/services/consolidation-rules-service';
import type {
  ConsolidationPackage,
  CustomerSection,
  PackageDragPayload,
} from './components/types';
import { PACKAGE_DND_TYPE } from './components/types';
import { areManifestsCompatible, isPermitManifest } from './components/manifest-utils';
import { TRANSITORIA_MANIFEST } from './components/normalize-manifest';

// ── Manifest-grouped view type ─────────────────────────────────────────────────
interface ManifestViewSection {
  manifestNumber: string;
  isPermit: boolean;
  customerSections: CustomerSection[];
  totalPackages: number;
  totalCustomers: number;
}

function classifyManifest(m: string): ManifestCategory {
  const upper = m.toUpperCase().trim();
  if (upper.includes('MEGA-MAN') || upper.includes('MEGA_MAN') || upper.startsWith('SL-MEGA-MAN')) return 'mega';
  if (isPermitManifest(m)) return 'permit';
  return 'regular';
}

export default function ConsolidationManifests() {
  const { customerSections, allManifestNumbers, allInvoices, allPackages, loading, error } =
    useConsolidationData();
  const { toast } = useToast();

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [search, setSearch]                         = useState('');
  const [selectedManifests, setSelectedManifests]   = useState<Set<string>>(new Set());

  const [groupBy, setGroupBy]                       = useState<GroupByMode>('customer');
  const [showAuditDialog, setShowAuditDialog]       = useState(false);
  // Track which manifest sections are EXPANDED (empty = all collapsed by default)
  const [expandedManifests, setExpandedManifests]    = useState<Set<string>>(new Set());
  // Track which manifests have stale-highlight mode active
  const [highlightedManifests, setHighlightedManifests] = useState<Set<string>>(new Set());
  // Track which manifest section the user is currently dragging over
  const [dragOverManifest, setDragOverManifest]       = useState<string | null>(null);
  // Track the payload of the package currently being dragged (null = no drag active)
  const [activeDragPayload, setActiveDragPayload]     = useState<import('./components/types').PackageDragPayload | null>(null);
  // Ref to signal that the current drag was cancelled — drop handler will skip processing
  const dragCancelledRef = useRef(false);

  // ── Global Search & Move to Consolidation ───────────────────────────────────
  const [globalSearching, setGlobalSearching] = useState(false);
  const [globalSearchResult, setGlobalSearchResult] = useState<import('@/lib/services/manifest-consolidation-service').ManifestConsolidationItem | null>(null);
  const [globalSearchResults, setGlobalSearchResults] = useState<import('@/lib/services/manifest-consolidation-service').ManifestConsolidationItem[]>([]);
  const [showGlobalConfirm, setShowGlobalConfirm] = useState(false);
  const [showGlobalSelection, setShowGlobalSelection] = useState(false);

  const handleGlobalSearch = useCallback(async () => {
    const q = search.trim().toUpperCase();
    if (!q) return;
    setGlobalSearching(true);
    setGlobalSearchResult(null);
    setGlobalSearchResults([]);
    try {
      const { lookupPackagesForConsolidation } = await import('@/lib/services/manifest-consolidation-service');
      const results = await lookupPackagesForConsolidation(q);
      if (results.length === 1) {
        setGlobalSearchResult(results[0]);
        setShowGlobalConfirm(true);
      } else if (results.length > 1) {
        setGlobalSearchResults(results);
        setShowGlobalSelection(true);
      } else {
        toast({
          title: 'No encontrado',
          description: `No se encontró ningún paquete con tracking "${q}" en el sistema.`,
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error de búsqueda',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setGlobalSearching(false);
    }
  }, [search, toast]);

  const processGlobalMoveToConsolidation = useCallback(async () => {
    if (!globalSearchResult) return;
    setGlobalSearching(true);
    try {
      const {
        doc,
        collection,
        query,
        where,
        getDocs,
        writeBatch,
        arrayUnion,
        deleteField,
      } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase/config');
      const { pushStatusToSp2 } = await import('@/lib/services/sync-invoices-service');

      const now = new Date().toISOString();
      const batch = writeBatch(db);

      const trackingId = globalSearchResult.tracking.toUpperCase();
      
      // 1. Find the real package document to update it
      const [snapT, snapTN] = await Promise.all([
        getDocs(query(collection(db, 'packages'), where('tracking',       '==', trackingId))),
        getDocs(query(collection(db, 'packages'), where('trackingNumber', '==', trackingId))),
      ]);
      const pkgDoc = !snapT.empty ? snapT.docs[0] : !snapTN.empty ? snapTN.docs[0] : null;

      if (!pkgDoc) {
        throw new Error('No se pudo encontrar el documento de paquete original.');
      }

      // 2. Annul invoice if active and requested
      const invoiceActive = globalSearchResult.invoiceId && 
        !['annulled', 'cancelled'].includes((globalSearchResult.invoiceStatus || '').toLowerCase());

      if (invoiceActive && globalSearchResult.invoiceId) {
        const invoiceRef = doc(db, 'invoices', globalSearchResult.invoiceId);
        batch.update(invoiceRef, {
          status: 'annulled',
          annulledAt: now,
          statusHistory: arrayUnion({
            status: 'annulled',
            changedAt: now,
            changedBy: 'consolidation-global-search-move',
          }),
        });

        // Query and release all other packages associated with this invoice
        const pkgsQuery = query(
          collection(db, 'packages'),
          where('invoiceId', '==', globalSearchResult.invoiceId)
        );
        const pkgsSnap = await getDocs(pkgsQuery);
        const TERMINAL_PKG_STATUSES = new Set(['delivered', 'processed', 'returned', 'pickup']);

        pkgsSnap.forEach((pDoc) => {
          const pData = pDoc.data();
          const pStatus = (pData.status || '').toLowerCase();
          if (!TERMINAL_PKG_STATUSES.has(pStatus)) {
            const currentMf = pData.manifestNumber || pData.manifiesto || '';
            if (pDoc.id !== pkgDoc.id) {
              batch.update(doc(db, 'packages', pDoc.id), {
                invoiceId: deleteField(),
                invoiceNumber: deleteField(),
                invoiceStatus: deleteField(),
                status: 'consolidated',
                ...(!pData.originalManifestID && currentMf
                  ? { originalManifestID: currentMf }
                  : {}),
                annulledInvoiceId: globalSearchResult.invoiceId,
                annulledInvoiceNumber: globalSearchResult.invoiceNumber || '',
                annulledAt: now,
                smartwebSynced: false,
                statusHistory: arrayUnion({
                  status: 'consolidated',
                  changedAt: now,
                  changedBy: 'invoice-annulled-by-global-search-move',
                  note: `Liberado de la factura anulada ${globalSearchResult.invoiceNumber}`,
                }),
              });
            }
          }
        });
      }

      // 3. Enable consolidation for customer if not enabled
      const isConsolidationCustomer = customerSections.some(s => s.customer.slCode === globalSearchResult.slCode);
      if (!isConsolidationCustomer && globalSearchResult.slCode) {
        // Query customer doc by slCode
        const custSnap = await getDocs(query(
          collection(db, 'customers'),
          where('slCode', '==', globalSearchResult.slCode)
        ));
        if (!custSnap.empty) {
          batch.update(doc(db, 'customers', custSnap.docs[0].id), {
            consolidationEnabled: true,
          });
        } else {
          // If customer doc doesn't exist, create it using slCode as doc ID
          batch.set(doc(db, 'customers', globalSearchResult.slCode), {
            slCode: globalSearchResult.slCode,
            fullName: globalSearchResult.customerName || globalSearchResult.slCode,
            consolidationEnabled: true,
            createdAt: now,
          }, { merge: true });
        }
      }

      // 4. Update the package document to move it to consolidation transitoria
      const originalMf = pkgDoc.data().manifestNumber || pkgDoc.data().manifiesto || '';
      batch.update(doc(db, 'packages', pkgDoc.id), {
        consolidacion: true,
        manifestNumber: 'consolidacion_transitoria',
        manifestId: 'consolidacion_transitoria',
        manifiesto: 'consolidacion_transitoria',
        updatedManifest: 'consolidacion_transitoria',
        status: 'consolidated',
        manifestUpdatedAt: now,
        invoiceId: deleteField(),
        invoiceNumber: deleteField(),
        invoiceStatus: deleteField(),
        ...(!pkgDoc.data().originalManifestID && originalMf
          ? { originalManifestID: originalMf }
          : {}),
        statusHistory: arrayUnion({
          status: 'consolidated',
          changedAt: now,
          changedBy: 'consolidation-global-search-move',
          note: 'Movido a Consolidación Transitoria mediante búsqueda global',
        }),
      });

      // 5. Commit all Firestore writes in a single atomic batch
      await batch.commit();

      // 6. SP2 synchronization (fire-and-forget)
      if (invoiceActive && globalSearchResult.invoiceId) {
        pushStatusToSp2(globalSearchResult.invoiceId, globalSearchResult.invoiceNumber || globalSearchResult.invoiceId, 'annulled')
          .catch((err) => console.warn('[GlobalSearchMove] SP2 status push failed:', err));
      }

      toast({
        title: 'Movimiento exitoso',
        description: `El paquete ${trackingId} fue trasladado a Consolidación Transitoria.`,
      });

      // Hide modal and clear states
      setShowGlobalConfirm(false);
      setGlobalSearchResult(null);
      setSearch(''); // Clear search input to show the client in the list!
    } catch (err) {
      toast({
        title: 'Error al procesar movimiento',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setGlobalSearching(false);
    }
  }, [globalSearchResult, customerSections, toast, setSearch]);

  // ── Expand/collapse ──────────────────────────────────────────────────────────
  const [forceOpen, setForceOpen]                   = useState<boolean | null>(null);
  const [isAllCollapsed, setIsAllCollapsed]         = useState(false);
  const forceOpenResetRef                           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerForce = useCallback((value: boolean) => {
    if (forceOpenResetRef.current) clearTimeout(forceOpenResetRef.current);
    setForceOpen(value);
    forceOpenResetRef.current = setTimeout(() => setForceOpen(null), 150);
  }, []);

  const toggleCollapseAll = useCallback(() => {
    setIsAllCollapsed(prev => {
      const next = !prev;
      triggerForce(!next);
      return next;
    });
  }, [triggerForce]);

  // ── Cancel active drag ──────────────────────────────────────────────────────
  const cancelActiveDrag = useCallback(() => {
    dragCancelledRef.current = true;
    setActiveDragPayload(null);
    setDragOverManifest(null);
  }, []);

  useEffect(() => () => {
    if (forceOpenResetRef.current) clearTimeout(forceOpenResetRef.current);
  }, []);

  // ── ESC to cancel drag ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeDragPayload) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelActiveDrag();
      }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [activeDragPayload, cancelActiveDrag]);

  // ── Carry-on dialog state ────────────────────────────────────────────────────
  const [carryOnOpen, setCarryOnOpen]                = useState(false);
  const [carryOnSource, setCarryOnSource]            = useState<{
    packages: ConsolidationPackage[];
    invoiceId?: string;
    manifest: string;
    slCode: string;
    customerName: string;
    /** Target manifest from drag-and-drop — auto-populates the dialog */
    targetManifest?: string;
  } | null>(null);

  // ── Consolidation rules ──────────────────────────────────────────────────────
  const [rules, setRules]                            = useState<ConsolidationRule[]>([]);
  const [complianceMap, setComplianceMap]             = useState<Map<string, ComplianceResult>>(new Map());

  // Load rules once
  useEffect(() => {
    loadActiveConsolidationRules().then(setRules).catch(() => {});
  }, []);

  // Grace period from rules
  const gracePeriodDays = useMemo(() => {
    const r = rules.find(r => r.ruleKey === 'grace_period_consolidation');
    return r?.valueNumber ?? 14;
  }, [rules]);

  // Storage charge from rules
  const dailyStorageCharge = useMemo(() => {
    const r = rules.find(r => r.ruleKey === 'storage_charge_daily');
    return r?.valueNumber ?? 1.00;
  }, [rules]);

  // ── Compute compliance for all customers ─────────────────────────────────────
  useEffect(() => {
    if (customerSections.length === 0 || rules.length === 0) return;

    const computeAll = async () => {
      const map = new Map<string, ComplianceResult>();
      for (const section of customerSections) {
        try {
          const result = await checkConsolidationCompliance({
            slCode: section.customer.slCode,
            packageCount: section.totalPackages,
            totalWeightKg: section.totalWeight,
            totalValueUSD: section.totalAmount,
          }, rules);
          map.set(section.customer.slCode, result);
        } catch {
          // skip
        }
      }
      setComplianceMap(map);
    };
    computeAll();
  }, [customerSections, rules]);



  // ── Filter sections ──────────────────────────────────────────────────────────
  /** Terminal statuses — customers with only these have nothing actionable */
  const TERMINAL_STATUSES = useMemo(() => new Set(['delivered', 'processed', 'returned', 'pickup']), []);

  const filteredSections = useMemo(() => {
    const q  = search.trim().toLowerCase();
    const mf = selectedManifests;

    return customerSections
      .map(section => {
        let groups = section.manifestGroups;

        // Manifest filter
        if (mf.size > 0) groups = groups.filter(g => mf.has(g.manifestNumber));

        // ── Exclude fully-resolved customers ───────────────────────────
        // A customer is "resolved" when they have nothing actionable:
        //   - Zero active packages (none at all, or all in terminal status)
        //   - AND no actionable invoices (unpaid AND with at least one active package)
        const allPkgs = groups.flatMap(g => g.packages);
        const allInvs = groups.flatMap(g => g.invoices);

        const activePkgSet = new Set(
          allPkgs
            .filter(p => !TERMINAL_STATUSES.has((p.status || '').toLowerCase()))
            .map(p => (p.trackingNumber || '').toUpperCase())
        );

        const hasActivePkg = activePkgSet.size > 0;

        // If no active packages, hide customer
        if (!hasActivePkg) return null;

        // Search filter
        if (q) {
          const customerMatch =
            section.customer.fullName.toLowerCase().includes(q) ||
            section.customer.slCode.toLowerCase().includes(q);

          if (!customerMatch) {
            groups = groups.map(g => {
              const pkgs = g.packages.filter(p =>
                p.trackingNumber.toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q) ||
                (p.customerName || '').toLowerCase().includes(q)
              );
              const invs = g.invoices.filter(inv =>
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.invoiceItems?.some(it =>
                  (it.trackingNumber || '').toLowerCase().includes(q) ||
                  (it.description || '').toLowerCase().includes(q)
                )
              );
              if (pkgs.length === 0 && invs.length === 0) return null;
              return { ...g, packages: pkgs, invoices: invs };
            }).filter((g): g is NonNullable<typeof g> => g !== null);

            if (groups.length === 0) return null;
          }
        }

        if (groups.length === 0) return null;

        // ── Strip terminal packages AND empty groups from displayed groups ──
        // 1. Filter each group's packages to active-only (non-terminal).
        // 2. Drop any group that has 0 active packages AND 0 actionable invoices
        //    (draft/sent with active or reassigned packages). This removes the
        //    "ANNETTE in 8 old manifests with 0 paq" scenario where packages
        //    were moved out and invoices were resolved.
        // 3. If the customer ends up with 0 visible groups → suppress the card.
        const displayGroups = groups
          .map(g => ({
            ...g,
            packages: g.packages.filter(
              p => !TERMINAL_STATUSES.has((p.status || '').toLowerCase())
            ),
          }))
          .filter(g => g.packages.length > 0);

        // If all groups were empty, the customer card should not render at all
        if (displayGroups.length === 0) return null;

        // Re-derive totals from the filtered view only
        const activePkgs = displayGroups.flatMap(g => g.packages);
        const activeInvs = displayGroups.flatMap(g =>
          g.invoices.filter(inv => {
            const st = (inv.status || '').toLowerCase();
            return st !== 'annulled' && st !== 'cancelled';
          })
        );

        const filteredTotalPackages = activePkgs.length;
        const filteredTotalWeight   = activePkgs.reduce((s, p) => s + (p.weight ?? 0), 0);
        const filteredTotalAmount   = activeInvs.reduce((s, inv) => s + (inv.totalAmount ?? 0), 0);

        return {
          ...section,
          manifestGroups: displayGroups,
          totalPackages:  filteredTotalPackages,
          totalWeight:    filteredTotalWeight,
          totalAmount:    filteredTotalAmount,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [customerSections, search, selectedManifests, TERMINAL_STATUSES]);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalPackages = useMemo(
    () => filteredSections.reduce((s, cs) => s + cs.totalPackages, 0),
    [filteredSections]
  );
  const totalInvoices = useMemo(
    () => filteredSections.reduce((s, cs) =>
      s + cs.manifestGroups.reduce((gs, g) => gs + g.invoices.length, 0), 0),
    [filteredSections]
  );

  /** Package count per manifest — used in the typeahead filter */
  const manifestPackageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const section of customerSections) {
      for (const group of section.manifestGroups) {
        map.set(group.manifestNumber, (map.get(group.manifestNumber) || 0) + group.packages.length);
      }
    }
    return map;
  }, [customerSections]);

  // ── Manifest-grouped view ─────────────────────────────────────────────────────
  const manifestViewSections = useMemo((): ManifestViewSection[] => {
    const map = new Map<string, ManifestViewSection>();
    for (const section of filteredSections) {
      for (const group of section.manifestGroups) {
        if (!map.has(group.manifestNumber)) {
          map.set(group.manifestNumber, {
            manifestNumber: group.manifestNumber,
            isPermit: isPermitManifest(group.manifestNumber),
            customerSections: [],
            totalPackages: 0,
            totalCustomers: 0,
          });
        }
        const ms = map.get(group.manifestNumber)!;
        // Re-derive stats for this specific manifest slice only.
        // The parent `section` totals span ALL manifests for the customer,
        // so we must recalculate for the single group we're rendering here.
        const groupTotalPackages = group.packages.length;
        const groupTotalWeight   = group.packages.reduce((s, p) => s + (p.weight ?? 0), 0);
        const groupTotalAmount   = group.invoices
          .filter(inv => {
            const st = (inv.status || '').toLowerCase();
            return st !== 'annulled' && st !== 'cancelled';
          })
          .reduce((s, inv) => s + (inv.totalAmount ?? 0), 0);

        ms.customerSections.push({
          ...section,
          manifestGroups: [group],
          totalPackages: groupTotalPackages,
          totalWeight:   groupTotalWeight,
          totalAmount:   groupTotalAmount,
          manifestCount: 1,
        });
        ms.totalPackages += group.packages.length;
        ms.totalCustomers += 1;
      }
    }
    // Sort: consolidacion_transitoria first, then newest-package-date first
    const sections = Array.from(map.values());

    // Extract DD-MM-YYYY date from ANYWHERE in the manifest name string
    // Handles: "13-05-2026DAN", "MEGA-MAN-14-05-2026", "01-04-2026DAN", etc.
    const dateFromManifestName = (name: string): number => {
      const match = name.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (!match) return 0;
      const [, dd, mm, yyyy] = match;
      return new Date(`${yyyy}-${mm}-${dd}`).getTime();
    };

    // Primary: newest actual package date; fallback: date parsed from manifest name
    const sortKey = (ms: ManifestViewSection): number => {
      let best = 0;
      for (const section of ms.customerSections) {
        for (const group of section.manifestGroups) {
          for (const pkg of group.packages) {
            const d = new Date(pkg.savedAt || pkg.createdAt || 0).getTime();
            if (d > best) best = d;
          }
        }
      }
      return best > 0 ? best : dateFromManifestName(ms.manifestNumber);
    };

    // This view is ONLY for CONSOLIDACION_TRANSITORIA — packages staged here
    // waiting to be reassigned to a final manifest. Regular manifests are
    // managed through the invoice/customer flow, not through this view.
    return sections.filter(ms => ms.manifestNumber === TRANSITORIA_MANIFEST);
  }, [filteredSections]);

  const toggleManifestExpanded = useCallback((manifestNumber: string) => {
    setExpandedManifests(prev => {
      const next = new Set(prev);
      if (next.has(manifestNumber)) next.delete(manifestNumber);
      else next.add(manifestNumber);
      return next;
    });
  }, []);


  // ── Carry-on handlers ────────────────────────────────────────────────────────
  const handleCarryOn = useCallback((invoiceId: string, trackings: string[], manifestNumber: string) => {
    // Find the customer section that owns this manifest
    const section = customerSections.find(s =>
      s.manifestGroups.some(g =>
        g.manifestNumber === manifestNumber &&
        g.invoices.some(inv => inv.id === invoiceId)
      )
    );
    if (!section) return;

    const group = section.manifestGroups.find(g => g.manifestNumber === manifestNumber);
    const packages = group?.packages.filter(p =>
      trackings.some(t => t.toUpperCase() === p.trackingNumber.toUpperCase())
    ) || [];

    setCarryOnSource({
      packages,
      invoiceId,
      manifest: manifestNumber,
      slCode: section.customer.slCode,
      customerName: section.customer.fullName,
    });
    setCarryOnOpen(true);
  }, [customerSections]);



  /** Handle HTML5 DnD: package dropped on a different manifest group */
  const handlePackageDrop = useCallback((payload: PackageDragPayload, targetManifest: string) => {
    // Block cross-type drops (normal ↔ permit)
    if (!areManifestsCompatible(payload.sourceManifest, targetManifest)) {
      toast({
        title: 'Incompatible',
        description: 'No se pueden mover paquetes entre manifiestos de permiso y normales.',
        variant: 'destructive',
      });
      return;
    }

    // Find the package in the data to pre-fill the dialog
    const section = customerSections.find(s => s.customer.slCode === payload.slCode);
    const sourceGroup = section?.manifestGroups.find(g => g.manifestNumber === payload.sourceManifest);
    const pkg = sourceGroup?.packages.find(p =>
      p.trackingNumber.toUpperCase() === payload.trackingNumber.toUpperCase()
    );

    const packages = pkg ? [pkg] : [{
      id: payload.packageId,
      trackingNumber: payload.trackingNumber,
      slCode: payload.slCode,
      status: '',
      weight: payload.weight,
      description: payload.description,
    } as ConsolidationPackage];

    setCarryOnSource({
      packages,
      invoiceId: payload.sourceInvoiceId,
      manifest: payload.sourceManifest,
      slCode: payload.slCode,
      customerName: payload.customerName,
      targetManifest,
    });
    setCarryOnOpen(true);

    toast({
      title: 'Carry-On',
      description: `Arrastraste ${payload.trackingNumber} → ${targetManifest}`,
    });
  }, [customerSections, toast]);

  // ── Manifest-level drag & drop handlers (defined after handlePackageDrop) ────────
  const handleManifestDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, manifestNumber: string) => {
    if (!e.dataTransfer.types.includes(PACKAGE_DND_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverManifest(manifestNumber);
  }, []);

  const handleManifestDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverManifest(null);
    }
  }, []);

  const handleManifestDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetManifest: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverManifest(null);
    // Drop was cancelled (ESC or cancel button) — ignore
    if (dragCancelledRef.current) {
      dragCancelledRef.current = false;
      return;
    }
    const raw = e.dataTransfer.getData(PACKAGE_DND_TYPE);
    if (!raw) return;
    try {
      const payload: PackageDragPayload = JSON.parse(raw);
      if (payload.sourceManifest === targetManifest) return;
      handlePackageDrop(payload, targetManifest);
    } catch { /* malformed payload */ }
  }, [handlePackageDrop]);

  /**
   * Carry-on de bloque completo: mueve TODOS los paquetes sin factura de un
   * manifest group al diálogo para que el operador elija el manifiesto destino.
   */
  const handleMoveBlockClick = useCallback((pkgs: ConsolidationPackage[], manifestNumber: string, slCode?: string) => {
    const section = slCode
      ? customerSections.find(s => s.customer.slCode === slCode)
      : customerSections.find(s =>
          s.manifestGroups.some(g => g.manifestNumber === manifestNumber)
        );
    if (!section || pkgs.length === 0) return;
    setCarryOnSource({
      packages: pkgs,
      manifest: manifestNumber,
      slCode: section.customer.slCode,
      customerName: section.customer.fullName,
    });
    setCarryOnOpen(true);
  }, [customerSections]);

  /**
   * Handle "Mover a..." button click on an uninvoiced / annulled package row.
   * Opens the carry-on dialog with the package pre-selected; user picks the target manifest.
   *
   * Search strategy:
   *  1. Fast path  — match by manifestNumber AND pkg.id
   *  2. Fallback   — match only by pkg.id across ALL manifest groups
   *     (handles normalization differences: CustomerCard may pass the raw
   *     Firestore value while the hook stores the normalizeManifest() form)
   */
  const handleMovePackageClick = useCallback((pkg: ConsolidationPackage, manifestNumber: string) => {
    // Fast path: exact manifestNumber match
    let foundSection = customerSections.find(s =>
      s.manifestGroups.some(g =>
        g.manifestNumber === manifestNumber &&
        g.packages.some(p => p.id === pkg.id)
      )
    );
    let resolvedManifest = manifestNumber;

    // Fallback: search by pkg.id across ALL groups (normalization-safe)
    if (!foundSection) {
      outer: for (const s of customerSections) {
        for (const g of s.manifestGroups) {
          if (g.packages.some(p => p.id === pkg.id)) {
            foundSection = s;
            resolvedManifest = g.manifestNumber;
            break outer;
          }
        }
      }
    }

    if (!foundSection) {
      console.warn(
        '[handleMovePackageClick] Package not found in any section:',
        pkg.id, pkg.trackingNumber, 'manifest:', manifestNumber
      );
      return;
    }

    // Only pass sourceInvoiceId when the invoice is ACTIVE (non-dead).
    // Passing a stale annulled invoiceId would show a misleading "will be annulled"
    // notice in the dialog — the service already guards against re-annulling, but
    // the UX message would be incorrect.
    const DEAD_STATUSES = new Set(['annulled', 'cancelled', 'void']);
    const isActiveInvoice = pkg.invoiceId &&
      pkg.invoiceStatus &&
      !DEAD_STATUSES.has((pkg.invoiceStatus || '').toLowerCase());

    setCarryOnSource({
      packages: [pkg],
      invoiceId: isActiveInvoice ? pkg.invoiceId : undefined,
      manifest: resolvedManifest,
      slCode: foundSection.customer.slCode,
      customerName: foundSection.customer.fullName,
      // no targetManifest — user selects from dialog
    });
    setCarryOnOpen(true);
  }, [customerSections]);


  /** Get target packages for a manifest + customer (for compliance preview) */
  const getTargetPackages = useCallback((manifest: string) => {
    if (!carryOnSource) return [];
    const section = customerSections.find(s => s.customer.slCode === carryOnSource.slCode);
    const group = section?.manifestGroups.find(g => g.manifestNumber === manifest);
    return group?.packages || [];
  }, [carryOnSource, customerSections]);

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="flex flex-col min-h-screen bg-background">
          {/* ── Page header ──────────────────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20 gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10 shadow-sm border border-primary/10 shrink-0">
                <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-foreground tracking-tight">Consolidación</h1>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    {loading ? (
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 animate-pulse"></span>
                    ) : (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </>
                    )}
                  </span>
                  {loading ? 'Cargando consolidación…' : 'Gestión de facturas consolidadas'}
                </p>
              </div>
            </div>

            {/* Actions & Inline Filters */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end shrink-0">
              {/* Search + Manifest picker aligned to the right inside header */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72 lg:w-96 sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="consolidation-search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar tracking, cliente, nombre…"
                    className="pl-10 pr-10 h-10 text-sm w-full bg-background border-border/80 shadow-sm focus-visible:ring-1"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {search.trim().length >= 4 && (
                  <button
                    type="button"
                    onClick={handleGlobalSearch}
                    disabled={globalSearching}
                    className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold shadow-sm transition-all shrink-0"
                    title="Buscar este tracking en todo el sistema"
                  >
                    {globalSearching ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Buscar Global</span>
                  </button>
                )}

                <div className="shrink-0">
                  <ManifestPicker
                    id="consolidation-manifest-filter"
                    allManifestNumbers={allManifestNumbers}
                    selectedManifests={selectedManifests}
                    onManifestsChange={setSelectedManifests}
                    manifestPackageCounts={manifestPackageCounts}
                    classifyManifest={classifyManifest}
                  />
                </div>

                <div className="shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleCollapseAll}
                    className="h-10 px-3.5 gap-2 text-xs font-semibold shrink-0 transition-all border-2 border-red-500 text-red-600 dark:text-red-400 bg-red-50/40 dark:bg-red-950/20 hover:bg-red-100/70 dark:hover:bg-red-900/40 shadow-sm animate-pulse"
                    title={isAllCollapsed ? "Expandir todos los clientes" : "Colapsar todos los clientes"}
                  >
                    {isAllCollapsed ? (
                      <>
                        <ChevronsUpDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="hidden sm:inline">Expandir Todo</span>
                      </>
                    ) : (
                      <>
                        <ChevronsDownUp className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="hidden sm:inline">Colapsar Todo</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* ── Cancel drag — visible whenever a drag is in progress ── */}
                {activeDragPayload && (
                  <button
                    type="button"
                    onClick={cancelActiveDrag}
                    title="Cancelar arrastre (ESC)"
                    className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2 sm:px-3 rounded-lg border-2 border-red-400 bg-red-50 text-red-600 text-xs font-semibold shadow-sm hover:bg-red-100 dark:bg-red-950/30 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950/60 transition-all animate-pulse"
                    aria-label="Cancelar arrastre activo"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    <span className="hidden sm:inline">Cancelar (ESC)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Error state ────────────────────────────────────────────── */}
          {error && (
            <div className="mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              {error}
            </div>
          )}

          {/* ── Loading ────────────────────────────────────────────────── */}
          {loading && !error && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-24 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" aria-hidden />
              <p className="text-sm">Cargando consolidación…</p>
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────────── */}
          {!loading && !error && filteredSections.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24 text-muted-foreground">
              <Package className="h-10 w-10 opacity-30" aria-hidden />
              <div className="text-center space-y-2 max-w-md px-4">
                <p className="text-sm font-medium text-foreground">
                  {search || selectedManifests.size > 0
                    ? 'Sin resultados para los filtros aplicados.'
                    : 'No hay facturas de consolidación activas.'}
                </p>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">
                  {search
                    ? `No se encontró ningún paquete o cliente con el criterio "${search}" en la vista local.`
                    : 'Las facturas consolidadas aparecen automáticamente cuando un cliente con consolidación habilitada recibe paquetes.'}
                </p>
                {search && search.trim().length >= 4 && (
                  <div className="pt-4">
                    <Button
                      size="sm"
                      onClick={handleGlobalSearch}
                      disabled={globalSearching}
                      className="gap-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 shadow-sm"
                    >
                      {globalSearching ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      Buscar "{search}" globalmente en el sistema
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Content: por cliente (solo paquetes en Transitoria) ─────── */}
          {!loading && filteredSections.length > 0 && groupBy === 'customer' && (() => {
            // Only show clients that have at least one package parked in Transitoria
            const transitoriaClients = filteredSections
              .map(section => {
                // Filter each customer's groups down to ONLY the Transitoria group
                const transitoriaGroups = section.manifestGroups.filter(
                  g => g.manifestNumber === TRANSITORIA_MANIFEST
                );
                if (transitoriaGroups.length === 0) return null;
                const activePkgs = transitoriaGroups.flatMap(g => g.packages);
                return {
                  ...section,
                  manifestGroups: transitoriaGroups,
                  totalPackages: activePkgs.length,
                  totalWeight: activePkgs.reduce((s, p) => s + (p.weight ?? 0), 0),
                };
              })
              .filter((s): s is NonNullable<typeof s> => s !== null);

            return (
              <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-3 sm:py-5 space-y-1">
                {transitoriaClients.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24 text-muted-foreground">
                    <Archive className="h-10 w-10 opacity-30" aria-hidden />
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium">No hay paquetes en Consolidación Transitoria.</p>
                      <p className="text-xs text-muted-foreground/70">
                        Los paquetes aparecen aquí cuando se mueven desde un manifiesto de origen
                        a esta área de espera antes de ser reasignados definitivamente.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {transitoriaClients.map(section => (
                      <ConsolidationCustomerCard
                        key={section.customer.slCode}
                        section={section}
                        compliance={complianceMap.get(section.customer.slCode)}
                        gracePeriodDays={gracePeriodDays}
                        dailyStorageCharge={dailyStorageCharge}
                        defaultOpen={true}
                        forceOpen={forceOpen}
                        onCarryOn={handleCarryOn}
                        onPackageDrop={handlePackageDrop}
                        onDragStarted={setActiveDragPayload}
                        onDragEnded={() => setActiveDragPayload(null)}
                        onMovePackage={handleMovePackageClick}
                        onMoveBlock={handleMoveBlockClick}
                        searchQuery={search}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}


          {/* ── Content: por manifiesto — solo CONSOLIDACION_TRANSITORIA ── */}
          {!loading && groupBy === 'manifest' && (() => {
            // manifestViewSections is already filtered to TRANSITORIA only.
            // Render customer cards flat — no collapsible accordion panel needed
            // since the entire view IS Transitoria; the wrapper would be redundant.
            const ms = manifestViewSections[0];

            if (!ms || ms.totalPackages === 0) {
              return (
                <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24 text-muted-foreground">
                  <Archive className="h-10 w-10 opacity-30" aria-hidden />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">No hay paquetes en Consolidación Transitoria.</p>
                    <p className="text-xs text-muted-foreground/70">
                      Los paquetes aparecen aquí cuando se mueven a esta área de espera
                      antes de ser reasignados a un manifiesto definitivo.
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                className={cn(
                  'flex-1 overflow-y-auto px-2 sm:px-6 py-3 sm:py-5 space-y-0',
                  dragOverManifest === ms.manifestNumber && 'bg-primary/5',
                )}
                onDragOver={(e) => handleManifestDragOver(e, ms.manifestNumber)}
                onDragLeave={handleManifestDragLeave}
                onDrop={(e) => handleManifestDrop(e, ms.manifestNumber)}
              >
                {dragOverManifest === ms.manifestNumber && (
                  <div className="flex justify-center py-2">
                    <Badge className="text-[10px] h-5 px-3 gap-1 bg-primary text-primary-foreground animate-pulse">
                      ↓ Soltar aquí
                    </Badge>
                  </div>
                )}
                {ms.customerSections.map(section => {
                  return (
                    <ConsolidationCustomerCard
                      key={section.customer.slCode}
                      section={section}
                      compliance={complianceMap.get(section.customer.slCode)}
                      gracePeriodDays={gracePeriodDays}
                      dailyStorageCharge={dailyStorageCharge}
                      defaultOpen={true}
                      forceOpen={forceOpen}
                      onCarryOn={handleCarryOn}
                      onPackageDrop={handlePackageDrop}
                      onDragStarted={setActiveDragPayload}
                      onDragEnded={() => setActiveDragPayload(null)}
                      onMovePackage={handleMovePackageClick}
                      onMoveBlock={handleMoveBlockClick}
                      hideManifestGroupHeader={true}
                      searchQuery={search}
                    />
                  );
                })}
              </div>
            );
          })()}

          {/* ── Content: Kanban DnD (multi-manifiesto) ──────────────────── */}
          {!loading && filteredSections.length > 0 && groupBy === 'kanban' && (
            <KanbanBoard
              customerSections={filteredSections}
              complianceMap={complianceMap}
              gracePeriodDays={gracePeriodDays}
              onPackageDrop={handlePackageDrop}
            />
          )}

          {/* ── Floating drag-cancel pill ────────────────────────────────── */}
          {activeDragPayload && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
                         px-4 py-2.5 rounded-full shadow-2xl border
                         bg-card/95 backdrop-blur-md border-border
                         animate-in slide-in-from-bottom-4 duration-200"
              role="status"
              aria-live="polite"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                <Package className="h-3.5 w-3.5 text-primary" aria-hidden />
              </span>
              <span className="text-xs font-medium text-foreground">
                Moviendo{' '}
                <code className="font-mono text-primary">
                  {activeDragPayload.trackingNumber}
                </code>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
                ESC
              </span>
              <button
                type="button"
                onClick={cancelActiveDrag}
                className="ml-1 flex items-center gap-1 text-xs font-medium text-destructive
                           hover:text-destructive/80 transition-colors px-2 py-1 rounded-full
                           hover:bg-destructive/10 border border-destructive/30 hover:border-destructive/60"
                aria-label="Cancelar arrastre"
              >
                <X className="h-3 w-3" aria-hidden />
                Cancelar
              </button>
            </div>
          )}

        </div>

        {/* ── Carry-on dialog ────────────────────────────────────────────── */}
        {carryOnSource && (
          <ConsolidationCarryOnDialog
            open={carryOnOpen}
            onClose={() => { setCarryOnOpen(false); setCarryOnSource(null); }}
            sourcePackages={carryOnSource.packages}
            sourceInvoiceId={carryOnSource.invoiceId}
            sourceManifest={carryOnSource.manifest}
            slCode={carryOnSource.slCode}
            customerName={carryOnSource.customerName}
            allManifestNumbers={allManifestNumbers}
            defaultTargetManifest={carryOnSource.targetManifest}
            getTargetPackages={getTargetPackages}
          />
        )}

        {/* ── Multiple Packages Selection Modal ─────────────────────────────── */}
        {showGlobalSelection && globalSearchResults.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
              {/* Header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary shrink-0" aria-hidden />
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Múltiples Paquetes Encontrados
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Se encontraron varios paquetes que coinciden con su búsqueda. Seleccione el correcto.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowGlobalSelection(false);
                    setGlobalSearchResults([]);
                  }}
                  className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Package List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[50vh]">
                {globalSearchResults.map((pkg) => (
                  <div
                    key={pkg.tracking}
                    onClick={() => {
                      setGlobalSearchResult(pkg);
                      setShowGlobalSelection(false);
                      setShowGlobalConfirm(true);
                    }}
                    className="group flex flex-col p-3.5 rounded-lg border border-border bg-card hover:bg-accent/40 hover:border-primary/50 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                            {pkg.tracking}
                          </span>
                          {pkg.slCode && (
                            <span className="text-[9px] bg-muted border border-border text-muted-foreground px-1.5 py-0.5 rounded font-mono font-medium">
                              {pkg.slCode}
                            </span>
                          )}
                          {pkg.ruta && (
                            <span className="text-[9px] bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900/50 px-1.5 py-0.5 rounded font-medium">
                              {pkg.ruta}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Cliente: <span className="text-foreground font-semibold">{pkg.customerName || '—'}</span>
                        </p>
                        {pkg.description && (
                          <p className="text-[10px] text-muted-foreground/80 line-clamp-1 italic">
                            {pkg.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <p className="text-xs font-bold text-foreground">
                          ${pkg.price.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {pkg.weight.toFixed(2)} kg
                        </p>
                        {pkg.status && (
                          <span className="inline-block text-[9px] font-medium bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.2 rounded mt-1 capitalize">
                            {pkg.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowGlobalSelection(false);
                    setGlobalSearchResults([]);
                  }}
                  className="h-8 px-3 text-xs"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Global Search Confirmation Modal ──────────────────────────────── */}
        {showGlobalConfirm && globalSearchResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
              {/* Header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary shrink-0" aria-hidden />
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      Mover Paquete a Consolidación Transitoria
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {globalSearchResult.tracking}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowGlobalConfirm(false);
                    setGlobalSearchResult(null);
                  }}
                  className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
                <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-2.5">
                  <p className="font-semibold text-foreground">Detalles del Paquete:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground/70">Tracking:</span>{' '}
                      <span className="font-mono text-foreground font-bold">{globalSearchResult.tracking}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/70">SmartID:</span>{' '}
                      <span className="font-mono text-foreground font-semibold">{globalSearchResult.slCode || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-foreground/70">Cliente:</span>{' '}
                      <span className="text-foreground">{globalSearchResult.customerName || '—'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/70">Peso:</span>{' '}
                      <span className="text-foreground">{globalSearchResult.weight.toFixed(2)} kg</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/70">Precio:</span>{' '}
                      <span className="text-foreground font-semibold text-foreground">${globalSearchResult.price.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/70">Ruta:</span>{' '}
                      <span className="text-foreground">{globalSearchResult.ruta || '—'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground/70">Estado Actual:</span>{' '}
                      <span className="text-foreground">{globalSearchResult.status || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-foreground/70">Descripción:</span>{' '}
                      <span className="text-foreground truncate block">{globalSearchResult.description || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Actions warning box */}
                {(() => {
                  const invoiceActive = globalSearchResult.invoiceId && 
                    !['annulled', 'cancelled'].includes((globalSearchResult.invoiceStatus || '').toLowerCase());
                  
                  return (
                    <div className="space-y-3">
                      {invoiceActive ? (
                        <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 text-red-800 dark:text-red-300 space-y-1">
                          <p className="font-bold flex items-center gap-1 text-[12px]">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                            Factura Vinculada Detectada
                          </p>
                          <p className="text-[11px] leading-relaxed">
                            Este paquete está asociado a la factura activa <strong>{globalSearchResult.invoiceNumber}</strong> (Estado: <em>{globalSearchResult.invoiceStatus}</em>).
                          </p>
                          <p className="text-[11px] font-semibold leading-relaxed">
                            Al continuar, se ANULARÁ de forma permanente esta factura y se liberarán todos los paquetes asociados a ella.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50 text-amber-800 dark:text-amber-300">
                          <p className="font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                            Sin factura activa
                          </p>
                          <p className="text-[11px] mt-1 leading-relaxed">
                            El paquete no cuenta con facturas activas. Será movido directamente a consolidación transitoria.
                          </p>
                        </div>
                      )}

                      {/* Customer Consolidation Check */}
                      {(() => {
                        const isConsolidationCustomer = customerSections.some(s => s.customer.slCode === globalSearchResult.slCode);
                        if (!isConsolidationCustomer) {
                          return (
                            <div className="p-3 rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-900/50 text-sky-800 dark:text-sky-300">
                              <p className="font-semibold flex items-center gap-1">
                                <User className="h-4 w-4 shrink-0 text-sky-500" />
                                Habilitar Consolidación de Cliente
                              </p>
                              <p className="text-[11px] mt-1 leading-relaxed">
                                El cliente <strong>{globalSearchResult.customerName || globalSearchResult.slCode}</strong> no tiene habilitado el flujo de consolidación. Se activará automáticamente al procesar el movimiento.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  );
                })()}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-muted/20 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowGlobalConfirm(false);
                    setGlobalSearchResult(null);
                  }}
                  disabled={globalSearching}
                  className="h-8 px-3 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={processGlobalMoveToConsolidation}
                  disabled={globalSearching}
                  className="h-8 px-4 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                >
                  {globalSearching && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Confirmar y Mover
                </Button>
              </div>
            </div>
          </div>
        )}

        <InvoiceAuditDialog
          open={showAuditDialog}
          onClose={() => setShowAuditDialog(false)}
          packages={allPackages}
          invoices={allInvoices}
        />
      </TooltipProvider>
    </DashboardLayout>
  );
}
