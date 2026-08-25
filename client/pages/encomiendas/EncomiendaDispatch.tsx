import React, { useCallback, useMemo, useState } from 'react';
import { Package, Printer, CheckSquare, Square, Sparkles, CheckCircle, Loader2, Box, AlertTriangle } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useEncomiendaDispatchData } from './components/useEncomiendaDispatchData';
import { EncomiendaFilters, type GroupByMode } from './components/EncomiendaFilters';
import { EncomiendaCustomerCard } from './components/EncomiendaCustomerCard';
import { printEncomiendaBoleta, type EncomiendaBoleta } from './components/encomienda-print';
import { printShippingLabels, type ShippingLabelData } from './components/encomienda-shipping-label';
import { doc, setDoc, writeBatch, arrayUnion, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { syncInvoicePackagesToSp2 } from '@/lib/services/sync-invoices-service';
import { subscribeEncomiendas, type Encomienda } from '@/lib/services/encomienda-service';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ── Invoice status label map ───────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  draft:     'Borrador',
  paid:      'Pagada',
  pending:   'Pendiente',
  sent:      'Enviada',
  overdue:   'Vencida',
  cancelled: 'Cancelada',
  annulled:  'Anulada',
};

// Status display order
const STATUS_ORDER = ['paid', 'pending', 'sent', 'overdue', 'draft', 'cancelled', 'annulled'];

function statusLabel(s: string) {
  return STATUS_LABEL[s?.toLowerCase()] ?? s?.toUpperCase() ?? '—';
}

function invStatusCls(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'paid')      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (s === 'pending')   return 'bg-amber-100   text-amber-700  dark:bg-amber-900/40  dark:text-amber-300';
  if (s === 'sent')      return 'bg-sky-100      text-sky-700    dark:bg-sky-900/40    dark:text-sky-300';
  if (s === 'overdue')   return 'bg-rose-100     text-rose-700   dark:bg-rose-900/40   dark:text-rose-300';
  if (s === 'draft')     return 'bg-zinc-100     text-zinc-600   dark:bg-zinc-800      dark:text-zinc-300';
  if (s === 'cancelled' || s === 'annulled') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  return 'bg-muted text-muted-foreground';
}

export default function EncomiendaDispatch() {
  const { t } = useLocale('common');
  const { toast } = useToast();
  const { user } = useAuth();
  const [hasLoaded, setHasLoaded] = useState(false);
  const [search, setSearch]                 = useState('');
  const [selectedManifests, setSelectedManifests] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy]               = useState<GroupByMode>('service');
  const [selectedInvoiceStatuses, setSelectedInvoiceStatuses] = useState<Set<string>>(new Set(['paid']));
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [highlightManifests, setHighlightManifests] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching]       = useState(false);

  const [showLabelTrackingWarningModal, setShowLabelTrackingWarningModal] = useState(false);
  const [invoicesMissingTracking, setInvoicesMissingTracking] = useState<Array<{ invoice: any; customer: any }>>([]);
  const [generateForPaid, setGenerateForPaid] = useState(false);
  const [generateForUnpaid, setGenerateForUnpaid] = useState(false);
  const [isGeneratingTrackings, setIsGeneratingTrackings] = useState(false);

  const paidInvoicesMissing = useMemo(() => {
    return invoicesMissingTracking.filter(item => (item.invoice.status || '').toLowerCase() === 'paid');
  }, [invoicesMissingTracking]);

  const unpaidInvoicesMissing = useMemo(() => {
    return invoicesMissingTracking.filter(item => (item.invoice.status || '').toLowerCase() !== 'paid');
  }, [invoicesMissingTracking]);

  // Debounce search text changes
  useEffect(() => {
    if (search === debouncedSearch) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const { customerSections, allManifestNumbers, allPackages, manifestPackageCounts, loading, error } = useEncomiendaDispatchData({
    manifests: selectedManifests,
    hasLoaded,
  });

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setIsSearching(false);
    setSelectedManifests(new Set());
    setSelectedInvoiceStatuses(new Set(['paid']));
    setGroupBy('service');
    setHasLoaded(false);
    setHighlightManifests(false);
  }, []);

  const handleLoadClick = useCallback(() => {
    if (selectedManifests.size === 0) {
      setShowWarningModal(true);
    } else {
      if (hasLoaded) {
        setHasLoaded(false);
        setTimeout(() => setHasLoaded(true), 50);
      } else {
        setHasLoaded(true);
      }
    }
  }, [selectedManifests, hasLoaded]);

  const handleConfirmLoadAll = useCallback(() => {
    setShowWarningModal(false);
    if (hasLoaded) {
      setHasLoaded(false);
      setTimeout(() => setHasLoaded(true), 50);
    } else {
      setHasLoaded(true);
    }
  }, [hasLoaded]);

  const handleSelectManifestWarning = useCallback(() => {
    setShowWarningModal(false);
    setHighlightManifests(true);
    // Remove the highlight after 6 seconds of pulsing
    setTimeout(() => {
      setHighlightManifests(false);
    }, 6000);
  }, []);

  const readyInternalTrackings = useMemo(() => {
    if (!allPackages) return [];
    return allPackages.filter(
      pkg => pkg.isMasterPackage && (pkg.status || '').toLowerCase() === 'ready'
    );
  }, [allPackages]);

  const [updatingReadyTrackings, setUpdatingReadyTrackings] = useState(false);

  const handleDeliverReadyTrackings = useCallback(async () => {
    if (readyInternalTrackings.length === 0) return;
    setUpdatingReadyTrackings(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      readyInternalTrackings.forEach(pkg => {
        const docRef = doc(db, 'packages', pkg.id);
        batch.update(docRef, {
          status: 'delivered',
          updatedAt: now,
          statusHistory: arrayUnion({
            status: 'delivered',
            changedAt: now,
            changedBy: user?.id || 'admin',
            email: user?.email || 'admin',
            note: 'Tracking maestro marcado como entregado vía banner de detección en tiempo real.',
            timestamp: now,
            location: 'Despacho Encomiendas',
          }),
        });
      });

      await batch.commit();

      toast({
        title: 'Entregas procesadas',
        description: `Se marcaron exitosamente ${readyInternalTrackings.length} tracking(s) internos como entregados.`,
      });
    } catch (err: any) {
      console.error('[EncomiendaDispatch] Error updating ready trackings:', err);
      toast({
        title: 'Error al actualizar',
        description: err.message || 'Ocurrió un error al procesar las entregas en lote.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingReadyTrackings(false);
    }
  }, [readyInternalTrackings, user, toast]);

  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);
  useEffect(() => {
    return subscribeEncomiendas((items) => {
      setEncomiendas(items.filter(i => i.active));
    });
  }, []);




  // ── Invoice selection for printing ────────────────────────────────────────
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  const toggleInvoice = useCallback((invoiceId: string) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      next.has(invoiceId) ? next.delete(invoiceId) : next.add(invoiceId);
      return next;
    });
  }, []);

  const toggleCustomer = useCallback(
    (_customerId: string, allInvoiceIds: string[], value: boolean) => {
      setSelectedInvoiceIds(prev => {
        const next = new Set(prev);
        if (value) {
          allInvoiceIds.forEach(id => next.add(id));
        } else {
          allInvoiceIds.forEach(id => next.delete(id));
        }
        return next;
      });
    },
    []
  );

  // ── Filter sections ───────────────────────────────────────────────────────
  const filteredSections = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const mf = selectedManifests;

    return customerSections
      .map(section => {
        let groups = section.manifestGroups;
        if (mf.size > 0) groups = groups.filter(g => mf.has(g.manifestNumber));

        // Filter by invoice status
        if ((selectedInvoiceStatuses?.size ?? 0) > 0) {
          groups = groups.map(g => ({
            ...g,
            invoices: g.invoices.filter(inv =>
              selectedInvoiceStatuses.has((inv.status || 'draft').toLowerCase())
            ),
          })).filter(g => g.invoices.length > 0);
        }



        if (q) {
          const customerMatch =
            section.customer.fullName.toLowerCase().includes(q) ||
            section.customer.slCode.toLowerCase().includes(q);

          if (!customerMatch) {
            groups = groups.map(g => {
              const pkgs = g.packages.filter(p =>
                p.trackingNumber.toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q)
              );
              const invs = g.invoices.filter(inv =>
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.invoiceItems?.some((it: any) =>
                  (it.trackingNumber || '').toLowerCase().includes(q)
                )
              );
              if (pkgs.length === 0 && invs.length === 0) return null;
              return { ...g, packages: pkgs, invoices: invs };
            }).filter((g): g is NonNullable<typeof g> => g !== null);

            if (groups.length === 0) return null;
          }
        }

        if (groups.length === 0) return null;

        const computedTotalPackages = groups.reduce((s, g) => {
          if (g.invoices.length > 0) {
            return s + g.invoices.reduce((sum, inv) => {
              const count = inv.invoiceItems && inv.invoiceItems.length > 0 ? inv.invoiceItems.length : 1;
              return sum + count;
            }, 0);
          }
          return s + g.packages.length;
        }, 0);

        const computedTotalAmount = groups.reduce((sum, g) => {
          const activeInvs = g.invoices.filter(inv => inv.status !== 'cancelled' && inv.status !== 'annulled');
          return sum + activeInvs.reduce((ss, inv) => ss + (inv.totalAmount || 0), 0);
        }, 0);

        return {
          ...section,
          manifestGroups: groups,
          totalPackages: computedTotalPackages,
          totalAmount: computedTotalAmount,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [customerSections, debouncedSearch, selectedManifests, selectedInvoiceStatuses]);

  // ── Visible invoice ids ────────────────────────────────────────────────────
  const visibleInvoiceIds = useMemo(
    () => filteredSections.flatMap(s => s.manifestGroups.flatMap(g => g.invoices.map(inv => inv.id))),
    [filteredSections]
  );

  const allVisibleSelected =
    visibleInvoiceIds.length > 0 && visibleInvoiceIds.every(id => selectedInvoiceIds.has(id));

  function toggleSelectAll() {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleInvoiceIds.forEach(id => next.delete(id));
      } else {
        visibleInvoiceIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalPackages = useMemo(
    () => filteredSections.reduce((s, cs) => s + cs.totalPackages, 0),
    [filteredSections]
  );
  const totalInvoices = useMemo(
    () => filteredSections.reduce((s, cs) =>
      s + cs.manifestGroups.reduce((gs, g) => gs + g.invoices.length, 0), 0),
    [filteredSections]
  );


  // ── Grouped display ────────────────────────────────────────────────────────
  // Returns an array of { groupLabel, sections[] } for rendering
  const displayGroups = useMemo((): Array<{ label: string; sections: typeof filteredSections }> => {
    if (groupBy === 'customer') {
      // No grouping header — just one flat list
      return [{ label: '', sections: filteredSections }];
    }

    if (groupBy === 'service') {
      const map = new Map<string, typeof filteredSections>();
      for (const s of filteredSections) {
        const key = s.customer.encomiendaServiceName?.trim() || 'Sin servicio';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, sections]) => ({ label, sections }));
    }

    if (groupBy === 'invoiceStatus') {
      // Group customer sections by the dominant invoice status
      // (most common non-cancelled status across all their invoices)
      const getStatus = (s: typeof filteredSections[0]): string => {
        const counts = new Map<string, number>();
        for (const g of s.manifestGroups) {
          for (const inv of g.invoices) {
            const st = (inv.status || 'draft').toLowerCase();
            counts.set(st, (counts.get(st) || 0) + 1);
          }
        }
        if (counts.size === 0) return 'draft';
        // Pick by STATUS_ORDER priority
        for (const st of STATUS_ORDER) {
          if (counts.has(st)) return st;
        }
        return counts.keys().next().value ?? 'draft';
      };

      const map = new Map<string, typeof filteredSections>();
      for (const s of filteredSections) {
        const key = getStatus(s);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
      }
      return STATUS_ORDER
        .filter(st => map.has(st))
        .map(st => ({ label: statusLabel(st), sections: map.get(st)! }));
    }

    return [{ label: '', sections: filteredSections }];
  }, [filteredSections, groupBy]);

  // ── Customs Anomaly Detection ──────────────────────────────────────────────
  const customsAnomalyInvoices = useMemo(() => {
    if (!hasLoaded || (loading || isSearching) || !filteredSections) return [];

    const list: Array<{ invoice: any; packages: any[]; customerName: string; slCode: string }> = [];

    for (const section of filteredSections) {
      if (!section.lookupPackages) continue;
      
      const trackingToPkg = new Map<string, any>();
      for (const pkg of section.lookupPackages) {
        if (pkg.trackingNumber) {
          trackingToPkg.set(pkg.trackingNumber.toUpperCase(), pkg);
        }
      }

      const allInvs = section.manifestGroups?.flatMap(g => g.invoices || []) || [];
      for (const inv of allInvs) {
        if ((inv.status || '').toLowerCase() === 'paid') {
          const trackings: string[] = (inv.invoiceItems || [])
            .map((it: any) => it.trackingNumber || it.tracking)
            .filter(Boolean)
            .map((t: string) => t.toUpperCase());

          const customsPkgs = trackings
            .map(t => trackingToPkg.get(t))
            .filter((p): p is any => !!p && (p.status || '').toLowerCase() === 'customs');

          if (customsPkgs.length > 0) {
            list.push({
              invoice: inv,
              packages: customsPkgs,
              customerName: section.customer.fullName,
              slCode: section.customer.slCode,
            });
          }
        }
      }
    }
    return list;
  }, [filteredSections, hasLoaded, loading]);

  const [correctingAnomaly, setCorrectingAnomaly] = useState(false);

  const handleCorrectCustomsAnomaly = useCallback(async () => {
    if (customsAnomalyInvoices.length === 0) return;
    setCorrectingAnomaly(true);
    try {
      let correctedCount = 0;
      for (const item of customsAnomalyInvoices) {
        await syncInvoicePackagesToSp2(item.invoice, 'on_route', { updateSp1: true, syncSp2: true, forceSync: true });
        correctedCount += item.packages.length;
      }

      toast({
        title: 'Anomalías Corregidas',
        description: `Se actualizaron y sincronizaron con éxito ${correctedCount} paquete(s) a "En Ruta" (on_route).`,
      });
    } catch (err: any) {
      console.error('[EncomiendaDispatch] Error correcting customs anomaly:', err);
      toast({
        title: 'Error al corregir',
        description: err.message || 'Ocurrió un error al actualizar los estados de aduana.',
        variant: 'destructive',
      });
    } finally {
      setCorrectingAnomaly(false);
    }
  }, [customsAnomalyInvoices, toast]);


  // ── Print boleta de ruta (summary) ────────────────────────────────────────
  const handlePrint = useCallback(() => {
    if (selectedInvoiceIds.size === 0) return;

    const boletas: EncomiendaBoleta[] = [];

    for (const section of filteredSections) {
      const allInvs = section.manifestGroups.flatMap(g => g.invoices);
      const selectedInvs = allInvs.filter(inv => selectedInvoiceIds.has(inv.id));
      if (selectedInvs.length === 0) continue;

      boletas.push({
        customerName: section.customer.fullName,
        slCode: section.customer.slCode,
        phone: section.customer.phone,
        encomiendaService: section.customer.encomiendaServiceName,
        invoices: selectedInvs.map(inv => ({
          invoiceNumber: inv.invoiceNumber || inv.id.slice(-6),
          status: inv.status,
          totalAmount: inv.totalAmount,
          currency: inv.currency,
          items: (inv.invoiceItems || []).map((it: any) => ({
            trackingNumber: it.trackingNumber,
            description: it.description,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          })),
        })),
      });
    }

    if (boletas.length === 0) return;
    printEncomiendaBoleta(boletas, groupBy);
  }, [selectedInvoiceIds, filteredSections, groupBy]);

  // ── Print shipping labels (one per page) ──────────────────────────────────
  const executePrintLabels = useCallback(() => {
    if (selectedInvoiceIds.size === 0) return;

    const labels: ShippingLabelData[] = [];

    for (const section of filteredSections) {
      const allInvs = section.manifestGroups.flatMap(g => g.invoices);
      const selectedInvs = allInvs.filter(inv => selectedInvoiceIds.has(inv.id));
      if (selectedInvs.length === 0) continue;

      let address = (section.customer.address || '').trim();
      if (!address) {
        // Build a delivery address hint from available customer + package data
        const pkgDestinations = section.lookupPackages
          .filter(p => p.destination && p.destination.toLowerCase() !== 'cr' && p.destination.toLowerCase() !== 'costa rica')
          .map(p => p.destination);
        const uniqueDestinations = [...new Set(pkgDestinations)].slice(0, 2).join(' / ');

        const addressParts: string[] = [];
        if (section.customer.ruta && section.customer.ruta !== 'Encomiendas') {
          addressParts.push(section.customer.ruta);
        }
        if (uniqueDestinations) addressParts.push(uniqueDestinations);
        if (section.customer.encomiendaServiceName) {
          addressParts.push(`Vía ${section.customer.encomiendaServiceName}`);
        }
        address = addressParts.join(' · ');
      }

      for (const inv of selectedInvs) {
        labels.push({
          customerName: section.customer.recipientName || section.customer.fullName,
          slCode: section.customer.slCode,
          phone: section.customer.recipientPhone || section.customer.phone,
          dni: section.customer.dni,
          address: address || undefined,
          notes: section.customer.notes || undefined,
          encomiendaService: section.customer.encomiendaServiceName,
          invoiceNumber: inv.invoiceNumber || inv.id.slice(-6),
          manifestNumber: inv.manifestNumber || undefined,
          invoiceStatus: inv.status,
          totalAmount: inv.totalAmount,
          currency: inv.currency,
          items: (inv.invoiceItems || [])
            .filter((it: any) => it.trackingNumber && it.trackingNumber.trim())
            .map((it: any) => ({
              trackingNumber: it.trackingNumber.trim(),
              description: it.description,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
            })),
          streetAddress: section.customer.streetAddress || undefined,
          details: section.customer.details || undefined,
          deliveryInstructions: section.customer.deliveryInstructions || undefined,
        });
      }
    }

    if (labels.length === 0) return;
    printShippingLabels(labels);
  }, [selectedInvoiceIds, filteredSections]);

  const handlePrintLabels = useCallback(() => {
    if (selectedInvoiceIds.size === 0) return;

    const missing: Array<{ invoice: any; customer: any }> = [];

    for (const section of filteredSections) {
      const allInvs = section.manifestGroups.flatMap(g => g.invoices);
      const selectedInvs = allInvs.filter(inv => selectedInvoiceIds.has(inv.id));
      if (selectedInvs.length === 0) continue;

      const trackingToPkg = new Map<string, any>();
      for (const pkg of (section.lookupPackages || [])) {
        if (pkg.trackingNumber) {
          trackingToPkg.set(pkg.trackingNumber.toUpperCase(), pkg);
        }
      }

      for (const inv of selectedInvs) {
        const cleanInvNo = (inv.invoiceNumber || inv.id).replace(/[\s\-_]+/g, '').toUpperCase();
        const hasMasterPkg = trackingToPkg.has(inv.invoiceNumber?.toUpperCase() || '') || trackingToPkg.has(cleanInvNo);
        if (!hasMasterPkg) {
          missing.push({ invoice: inv, customer: section.customer });
        }
      }
    }

    if (missing.length > 0) {
      setInvoicesMissingTracking(missing);
      
      const hasPaid = missing.some(item => (item.invoice.status || '').toLowerCase() === 'paid');
      const hasUnpaid = missing.some(item => (item.invoice.status || '').toLowerCase() !== 'paid');
      setGenerateForPaid(hasPaid);
      setGenerateForUnpaid(hasUnpaid);
      
      setShowLabelTrackingWarningModal(true);
    } else {
      executePrintLabels();
    }
  }, [selectedInvoiceIds, filteredSections, executePrintLabels]);

  const handleGenerateAndPrintLabels = useCallback(async () => {
    const idsToGenerate = new Set<string>();
    if (generateForPaid) {
      paidInvoicesMissing.forEach(item => idsToGenerate.add(item.invoice.id));
    }
    if (generateForUnpaid) {
      unpaidInvoicesMissing.forEach(item => idsToGenerate.add(item.invoice.id));
    }

    if (idsToGenerate.size === 0) {
      setShowLabelTrackingWarningModal(false);
      executePrintLabels();
      return;
    }

    setIsGeneratingTrackings(true);
    try {
      let generatedCount = 0;
      let updatedCount = 0;

      for (const section of filteredSections) {
        const allInvs = section.manifestGroups.flatMap(g => g.invoices);
        const selectedInvs = allInvs.filter(inv => idsToGenerate.has(inv.id));
        if (selectedInvs.length === 0) continue;

        for (const inv of selectedInvs) {
          const trackings = (inv.invoiceItems || [])
            .map((it: any) => it.trackingNumber)
            .filter(Boolean);

          if (trackings.length === 0) continue;

          const uniqueTrackings = [...new Set(trackings)];
          
          const trackingNumber = (inv.invoiceNumber || inv.id).trim();
          const trackingNumberCleaned = trackingNumber.replace(/[\s\-_]+/g, '').toUpperCase();

          const docRef = doc(db, 'packages', trackingNumberCleaned);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const existing = docSnap.data();
            
            const existingGrouped = Array.isArray(existing.groupedTrackings) ? existing.groupedTrackings : [];
            const isGroupedTrackingsEqual = 
              existingGrouped.length === uniqueTrackings.length &&
              existingGrouped.every((t: string) => uniqueTrackings.includes(t));
              
            const existingManifestNumbers = Array.isArray(existing.manifestNumbers) ? existing.manifestNumbers : [];
            const isManifestNumbersEqual = 
              existingManifestNumbers.length === 0;

            const hasChanges = 
              !isGroupedTrackingsEqual ||
              !isManifestNumbersEqual ||
              existing.totalAmount !== (inv.totalAmount || 0) ||
              existing.encomiendaServiceName !== (section.customer.encomiendaServiceName || 'Sin servicio') ||
              existing.customerName !== section.customer.fullName ||
              existing.slCode !== section.customer.slCode ||
              existing.manifestNumber !== '' ||
              existing.manifiesto !== '';

            if (hasChanges) {
              await updateDoc(docRef, {
                groupedTrackings: uniqueTrackings,
                packageCount: uniqueTrackings.length,
                totalAmount: inv.totalAmount || 0,
                encomiendaServiceName: section.customer.encomiendaServiceName || 'Sin servicio',
                customerName: section.customer.fullName,
                slCode: section.customer.slCode,
                manifestNumber: '',
                manifiesto: '',
                manifestNumbers: [],
              });
              updatedCount++;
            }
          } else {
            await setDoc(docRef, {
              id: trackingNumberCleaned,
              trackingNumber: trackingNumber,
              trackingNumberCleaned: trackingNumberCleaned,
              isMasterPackage: true,
              groupedTrackings: uniqueTrackings,
              packageCount: uniqueTrackings.length,
              totalAmount: inv.totalAmount || 0,
              encomiendaServiceName: section.customer.encomiendaServiceName || 'Sin servicio',
              ruta: 'Encomiendas',
              status: 'ready',
              customerName: section.customer.fullName,
              slCode: section.customer.slCode,
              manifestNumber: '',
              manifiesto: '',
              manifestNumbers: [],
              createdAt: new Date().toISOString(),
              scannedAt: null,
            });
            generatedCount++;
          }
        }
      }

      if (generatedCount > 0 || updatedCount > 0) {
        toast({
          title: 'Tracking Interno Procesado',
          description: `Se crearon ${generatedCount} y se actualizaron ${updatedCount} trackings internos para bodega.`,
        });
      } else {
        toast({
          title: 'Sin Cambios',
          description: 'Todos los trackings internos ya existen y están al día.',
        });
      }

      setShowLabelTrackingWarningModal(false);
      executePrintLabels();
    } catch (err: any) {
      console.error('[EncomiendaDispatch] Error generating master package:', err);
      toast({
        title: 'Error de generación',
        description: err.message || 'Ocurrió un error inesperado al guardar en Firestore.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingTrackings(false);
    }
  }, [generateForPaid, generateForUnpaid, paidInvoicesMissing, unpaidInvoicesMissing, filteredSections, executePrintLabels, toast]);

  const handlePrintAnyway = useCallback(() => {
    setShowLabelTrackingWarningModal(false);
    executePrintLabels();
  }, [executePrintLabels]);

  // ── Has any paid invoices selected ─────────────────────────────────────────
  const hasPaidSelected = useMemo(() => {
    for (const section of filteredSections) {
      const allInvs = section.manifestGroups.flatMap(g => g.invoices);
      const selectedInvs = allInvs.filter(inv => selectedInvoiceIds.has(inv.id));
      if (selectedInvs.some(inv => (inv.status || '').toLowerCase() === 'paid')) {
        return true;
      }
    }
    return false;
  }, [filteredSections, selectedInvoiceIds]);

  // ── Generate Internal Tracking (Master Package) ────────────────────────────
  const handleGenerateInternalTracking = useCallback(async () => {
    if (selectedInvoiceIds.size === 0) return;

    try {
      let generatedCount = 0;
      let updatedCount = 0;
      let hadPaidSelected = false;

      for (const section of filteredSections) {
        for (const group of section.manifestGroups) {
          const selectedPaidInvs = group.invoices.filter(inv => 
            selectedInvoiceIds.has(inv.id) && (inv.status || '').toLowerCase() === 'paid'
          );

          if (selectedPaidInvs.length > 0) {
            hadPaidSelected = true;
          }

          // Generate one Master Package per paid invoice
          for (const inv of selectedPaidInvs) {
            const trackings = (inv.invoiceItems || [])
              .map((it: any) => it.trackingNumber)
              .filter(Boolean);

            if (trackings.length === 0) continue;

            const uniqueTrackings = [...new Set(trackings)];
            
            // Use exact invoice number as the tracking number, and clean version for ID
            const trackingNumber = (inv.invoiceNumber || inv.id).trim();
            const trackingNumberCleaned = trackingNumber.replace(/[\s\-_]+/g, '').toUpperCase();

            // Set manifest from the group or invoice
            const docRef = doc(db, 'packages', trackingNumberCleaned);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
              const existing = docSnap.data();
              
              const existingGrouped = Array.isArray(existing.groupedTrackings) ? existing.groupedTrackings : [];
              const isGroupedTrackingsEqual = 
                existingGrouped.length === uniqueTrackings.length &&
                existingGrouped.every((t: string) => uniqueTrackings.includes(t));
                
              const existingManifestNumbers = Array.isArray(existing.manifestNumbers) ? existing.manifestNumbers : [];
              const isManifestNumbersEqual = 
                existingManifestNumbers.length === 0;

              const hasChanges = 
                !isGroupedTrackingsEqual ||
                !isManifestNumbersEqual ||
                existing.totalAmount !== (inv.totalAmount || 0) ||
                existing.encomiendaServiceName !== (section.customer.encomiendaServiceName || 'Sin servicio') ||
                existing.customerName !== section.customer.fullName ||
                existing.slCode !== section.customer.slCode ||
                existing.manifestNumber !== '' ||
                existing.manifiesto !== '';

              if (hasChanges) {
                await updateDoc(docRef, {
                  groupedTrackings: uniqueTrackings,
                  packageCount: uniqueTrackings.length,
                  totalAmount: inv.totalAmount || 0,
                  encomiendaServiceName: section.customer.encomiendaServiceName || 'Sin servicio',
                  customerName: section.customer.fullName,
                  slCode: section.customer.slCode,
                  manifestNumber: '',
                  manifiesto: '',
                  manifestNumbers: [],
                });
                updatedCount++;
              }
            } else {
              await setDoc(docRef, {
                id: trackingNumberCleaned,
                trackingNumber: trackingNumber,
                trackingNumberCleaned: trackingNumberCleaned,
                isMasterPackage: true,
                groupedTrackings: uniqueTrackings,
                packageCount: uniqueTrackings.length,
                totalAmount: inv.totalAmount || 0,
                encomiendaServiceName: section.customer.encomiendaServiceName || 'Sin servicio',
                ruta: 'Encomiendas',
                status: 'ready',
                customerName: section.customer.fullName,
                slCode: section.customer.slCode,
                manifestNumber: '',
                manifiesto: '',
                manifestNumbers: [],
                createdAt: new Date().toISOString(),
                scannedAt: null,
              });
              generatedCount++;
            }
          }
        }
      }

      if (!hadPaidSelected) {
        toast({
          title: 'Sin facturas pagadas',
          description: 'No se encontraron facturas con estado "Pagada" en la selección.',
          variant: 'destructive',
        });
        setSelectedInvoiceIds(new Set());
      } else if (generatedCount > 0 || updatedCount > 0) {
        toast({
          title: 'Tracking Interno Procesado',
          description: `Se crearon ${generatedCount} y se actualizaron ${updatedCount} trackings internos para bodega.`,
        });
        setSelectedInvoiceIds(new Set());
      } else {
        toast({
          title: 'Sin Cambios',
          description: 'Todos los trackings internos ya existen y están al día.',
        });
        setSelectedInvoiceIds(new Set());
      }
    } catch (err: any) {
      console.error('[EncomiendaDispatch] Error generating master package:', err);
      toast({
        title: 'Error de generación',
        description: err.message || 'Ocurrió un error inesperado al guardar en Firestore.',
        variant: 'destructive',
      });
    }
  }, [selectedInvoiceIds, filteredSections, toast]);


  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex-1 p-8 text-center text-red-500">
          <p>Error cargando datos: {error}</p>
        </div>
      </DashboardLayout>
    );
  }

  const selectedCount = selectedInvoiceIds.size;

  return (
    <DashboardLayout>
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Top header ────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 shadow-sm border border-primary/10">
            <Package className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {t('menu.encomiendaDispatch')}
            </h1>
             <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                {(loading || isSearching) ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 animate-pulse" />
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </>
                )}
              </span>
              {(loading || isSearching) ? (loading ? 'Cargando datos…' : 'Buscando…') : t('menu.encomiendaDispatchDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <EncomiendaFilters
        search={search}
        onSearchChange={setSearch}
        selectedManifests={selectedManifests}
        onManifestsChange={(manifests) => {
          setSelectedManifests(manifests);
          setHighlightManifests(false);
        }}
        allManifestNumbers={allManifestNumbers}
        manifestPackageCounts={manifestPackageCounts}
        totalCustomers={filteredSections.length}
        totalPackages={totalPackages}
        totalInvoices={totalInvoices}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        selectedInvoiceStatuses={selectedInvoiceStatuses}
        onInvoiceStatusesChange={setSelectedInvoiceStatuses}
        hasLoaded={hasLoaded}
        loading={loading || isSearching}
        onLoadClick={handleLoadClick}
        onClearAll={handleClearFilters}
        highlightManifests={highlightManifests}
        onManifestClick={() => setHighlightManifests(false)}
      />

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* ── Action bar ────────────────────────────────────────────── */}
        {hasLoaded && !(loading || isSearching) && filteredSections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 max-w-6xl mx-auto mb-6 pb-4 border-b border-border animate-in fade-in duration-300">
            {/* Select all toggle */}
            {visibleInvoiceIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={toggleSelectAll}
              >
                {allVisibleSelected
                  ? <CheckSquare className="h-4 w-4 text-primary" />
                  : <Square className="h-4 w-4" />}
                {allVisibleSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </Button>
            )}

            {/* Print boleta de ruta */}
            <Button
              id="btn-print-boleta"
              size="sm"
              variant="outline"
              className="h-8 gap-2 text-xs"
              disabled={selectedCount === 0}
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4" />
              Boleta de ruta
              {selectedCount > 0 && (
                <Badge className="h-4 px-1 text-[9px] bg-muted text-foreground">
                  {selectedCount}
                </Badge>
              )}
            </Button>

            {/* Print shipping labels (one per page) */}
            <Button
              id="btn-print-shipping-labels"
              size="sm"
              className="h-8 gap-2 text-xs"
              disabled={selectedCount === 0}
              onClick={handlePrintLabels}
            >
              <Printer className="h-4 w-4" />
              Etiquetas de envío
              {selectedCount > 0 && (
                <Badge className="h-4 px-1 text-[9px] bg-primary-foreground text-primary">
                  {selectedCount}
                </Badge>
              )}
            </Button>

            {/* Generate Internal Tracking Button */}
            {hasPaidSelected && (
              <Button
                id="btn-generate-internal-tracking"
                size="sm"
                variant="default"
                className="h-8 gap-2 text-xs bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-sm transition-all"
                disabled={selectedCount === 0}
                onClick={handleGenerateInternalTracking}
              >
                <Package className="h-4 w-4" />
                Generar Tracking Interno
                {selectedCount > 0 && (
                  <Badge className="h-4 px-1 text-[9px] bg-violet-800 text-white border-none">
                    {selectedCount}
                  </Badge>
                )}
              </Button>
            )}

          </div>
        )}

        {/* Banner de anomalías de aduana */}
        {customsAnomalyInvoices.length > 0 && !(loading || isSearching) && (
          <div className="mb-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 dark:border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent p-5 backdrop-blur-md shadow-[0_8px_32px_rgba(245,158,11,0.08)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="absolute inset-0 -z-10 opacity-10 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px]" />
              <div className="absolute -left-16 -top-16 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 mt-0.5 shadow-inner">
                  <AlertTriangle className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-tight">
                    {customsAnomalyInvoices.length === 1
                      ? 'Se detectó 1 factura pagada con paquetes retenidos en Aduana'
                      : `Se detectaron ${customsAnomalyInvoices.length} facturas pagadas con paquetes retenidos en Aduana`}
                  </h3>
                  <p className="text-xs text-amber-600/90 dark:text-amber-400/90 mt-1 max-w-xl leading-relaxed">
                    Hay paquetes asociados a facturas pagadas que aún tienen el estado <strong className="font-semibold underline">Aduana</strong>. Presione el botón para corregir su estado a <strong className="font-semibold underline">En Ruta (on_route)</strong> y sincronizarlos inmediatamente con SP2.
                  </p>
                </div>
              </div>

              <div className="flex items-center shrink-0 self-end md:self-center">
                <Button
                  onClick={handleCorrectCustomsAnomaly}
                  disabled={correctingAnomaly}
                  className="bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white shadow-[0_4px_12px_rgba(245,158,11,0.2)] dark:shadow-[0_4px_12px_rgba(245,158,11,0.1)] border border-amber-500/30 transition-all gap-2 h-9 px-4 rounded-xl font-medium text-xs"
                >
                  {correctingAnomaly ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  {correctingAnomaly ? 'Corrigiendo...' : 'Corregir y Sincronizar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Banner de Trackings Internos listos para entregar */}
        {readyInternalTrackings.length > 0 && !(loading || isSearching) && (
          <div className="mb-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-5 backdrop-blur-md shadow-[0_8px_32px_rgba(16,185,129,0.08)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Decorative gradient overlay */}
              <div className="absolute inset-0 -z-10 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px]" />
              <div className="absolute -left-16 -top-16 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 mt-0.5 shadow-inner">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 leading-tight">
                    {readyInternalTrackings.length === 1
                      ? 'Se detectó 1 tracking interno listo para entregar'
                      : `Se detectaron ${readyInternalTrackings.length} trackings internos listos para entregar`}
                  </h3>
                  <p className="text-xs text-emerald-600/90 dark:text-emerald-400/90 mt-1 max-w-xl leading-relaxed">
                    Estos paquetes ya fueron procesados físicamente en bodega y se encuentran en estado <strong className="font-semibold underline">Listo (Ready)</strong>. Presione el botón para registrarlos como entregados de forma masiva y quitarlos de la vista activa de salida.
                  </p>
                </div>
              </div>

              <div className="flex items-center shrink-0 self-end md:self-center">
                <Button
                  onClick={handleDeliverReadyTrackings}
                  disabled={updatingReadyTrackings}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-[0_4px_12px_rgba(16,185,129,0.2)] dark:shadow-[0_4px_12px_rgba(16,185,129,0.1)] border border-emerald-500/30 transition-all gap-2 h-9 px-4 rounded-xl font-medium text-xs"
                >
                  {updatingReadyTrackings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  {updatingReadyTrackings ? 'Actualizando...' : 'Marcar como Entregados'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!hasLoaded ? (
          <div className="max-w-md mx-auto my-16 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 shadow-inner text-emerald-600 dark:text-emerald-400">
              <Box className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-bold text-foreground tracking-tight mb-2">
              Consulta de Encomiendas
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Para comenzar a gestionar despachos, aplique los filtros correspondientes (por ejemplo, seleccionando un manifiesto) y haga clic en el botón <strong className="text-emerald-600 dark:text-emerald-400">Cargar Datos</strong> en la barra superior.
            </p>
          </div>
        ) : (loading || isSearching) ? (
          <div className="space-y-4 max-w-6xl mx-auto">
            {[1, 2, 3].map((cardIdx) => (
              <div key={cardIdx} className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
                {/* Header Skeleton */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border/60">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Checkbox outline */}
                    <div className="h-4 w-4 rounded border border-muted-foreground/20 bg-muted/30 shrink-0" />
                    {/* Avatar */}
                    <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                    {/* slCode badge */}
                    <Skeleton className="h-4 w-12 shrink-0" />
                    {/* Name */}
                    <Skeleton className="h-4 w-40 shrink-0" />
                    {/* Service pill */}
                    <Skeleton className="h-5 w-24 rounded-full shrink-0" />
                  </div>
                  {/* Summary counts */}
                  <div className="hidden sm:flex items-center gap-4 shrink-0">
                    <div className="space-y-1 text-right">
                      <Skeleton className="h-3 w-12 ml-auto" />
                      <Skeleton className="h-4 w-6 ml-auto" />
                    </div>
                    <div className="space-y-1 text-right">
                      <Skeleton className="h-3 w-10 ml-auto" />
                      <Skeleton className="h-4 w-12 ml-auto" />
                    </div>
                  </div>
                </div>

                {/* Rows Skeletons */}
                <div className="divide-y divide-border/20">
                  {[1, 2].map((rowIdx) => (
                    <div key={rowIdx} className="flex items-start gap-3 px-4 py-3 border-l-4 border-l-transparent">
                      {/* Checkbox outline */}
                      <div className="h-3.5 w-3.5 rounded border border-muted-foreground/20 bg-muted/30 mt-0.5 shrink-0" />
                      {/* Content block */}
                      <div className="flex-1 space-y-2.5">
                        {/* Line 1 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Invoice # */}
                          <Skeleton className="h-4 w-16" />
                          {/* Invoice status badge */}
                          <Skeleton className="h-4 w-12 rounded-full" />
                          {/* Internal tracking status badge */}
                          <Skeleton className="h-4 w-28 rounded-full" />
                          {/* Package status badge */}
                          <Skeleton className="h-4 w-16 rounded-full" />
                          {/* Amount (right-aligned) */}
                          <Skeleton className="h-4 w-14 ml-auto" />
                        </div>
                        {/* Line 2 */}
                        <div className="flex items-center gap-1.5 flex-wrap pl-1 border-l-2 border-border/40">
                          <Skeleton className="h-5 w-24" />
                          <Skeleton className="h-5 w-28" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border border-dashed rounded-lg">
            <Package className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No se encontraron registros de encomiendas.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-6xl mx-auto">
            {displayGroups.map(({ label, sections }, gi) => (
              <div key={gi} className="space-y-1">
                {/* Group separator — only shown when grouping is active */}
                {label && (
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-muted border border-border text-foreground tracking-wide uppercase">
                      {label}
                      <span className="ml-2 text-muted-foreground font-normal">
                        ({sections.length})
                      </span>
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}

                {sections.map(section => (
                  <EncomiendaCustomerCard
                    key={section.customer.id}
                    section={section}
                    selectedInvoiceIds={selectedInvoiceIds}
                    onToggleInvoice={toggleInvoice}
                    onToggleCustomer={toggleCustomer}
                    encomiendas={encomiendas}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

    <AlertDialog open={showWarningModal} onOpenChange={setShowWarningModal}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            Carga Completa sin Manifiesto
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed mt-2">
            Cargar los registros de encomiendas de forma global sin seleccionar un manifiesto implica obtener miles de documentos en tiempo real de la base de datos, lo cual incrementa el **costo operativo**.
            <br /><br />
            ¿Desea continuar con la carga global de todas formas o prefiere seleccionar un manifiesto específico?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:space-x-3 mt-4">
          <AlertDialogCancel
            onClick={handleSelectManifestWarning}
            className="text-xs h-9 font-medium border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Seleccionar Manifiesto
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmLoadAll}
            className="text-xs h-9 font-medium bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white shadow-sm border border-amber-500/20 transition-all"
          >
            Cargar de todas formas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showLabelTrackingWarningModal} onOpenChange={(open) => {
      if (!isGeneratingTrackings) setShowLabelTrackingWarningModal(open);
    }}>
      <AlertDialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-8 overflow-hidden">
        <AlertDialogHeader className="pb-2">
          <AlertDialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            Atención: Paquetes sin Tracking Interno
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground leading-relaxed mt-2 space-y-3">
              <p className="text-sm">
                Has seleccionado imprimir etiquetas de envío para paquetes o facturas que no tienen tracking interno generado.
              </p>
              <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
                <span className="font-bold text-sm block mb-1">⚠️ INSTRUCCIÓN CRÍTICA:</span>
                <span className="text-sm font-semibold leading-relaxed">
                  Los paquetes que no tengan tracking interno NO serán detectados por el sistema al momento del escaneo físico en bodega. Por ende, no saldrán como aprobados.
                </span>
              </div>
              <p className="text-xs font-medium text-foreground/80">
                Selecciona a continuación las categorías de facturas a las cuales deseas generarles tracking interno antes de imprimir:
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Grouped check options by status category */}
        <div className="my-4 border border-border rounded-xl divide-y divide-border/60 bg-muted/20 overflow-hidden">
          {paidInvoicesMissing.length > 0 && (
            <div 
              onClick={() => {
                if (isGeneratingTrackings) return;
                setGenerateForPaid(prev => !prev);
              }}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 text-xs transition-colors cursor-pointer",
                generateForPaid ? "bg-primary/5" : "hover:bg-accent/40"
              )}
            >
              <Checkbox
                checked={generateForPaid}
                onCheckedChange={() => {}}
                disabled={isGeneratingTrackings}
                className="h-4 w-4 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">
                  Facturas Pagadas sin tracking
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Generar tracking interno para {paidInvoicesMissing.length} factura(s) pagada(s).
                </div>
              </div>
            </div>
          )}

          {unpaidInvoicesMissing.length > 0 && (
            <div 
              onClick={() => {
                if (isGeneratingTrackings) return;
                setGenerateForUnpaid(prev => !prev);
              }}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 text-xs transition-colors cursor-pointer",
                generateForUnpaid ? "bg-primary/5" : "hover:bg-accent/40"
              )}
            >
              <Checkbox
                checked={generateForUnpaid}
                onCheckedChange={() => {}}
                disabled={isGeneratingTrackings}
                className="h-4 w-4 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">
                  Facturas No Pagadas (Pendiente, Enviada, etc.) sin tracking
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Generar tracking interno para {unpaidInvoicesMissing.length} factura(s) no pagada(s).
                </div>
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="pt-4 sm:space-x-3 gap-2 flex-wrap sm:flex-nowrap">
          <AlertDialogCancel
            disabled={isGeneratingTrackings}
            onClick={() => setShowLabelTrackingWarningModal(false)}
            className="text-sm h-11 px-5 font-semibold bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700 hover:text-slate-900 transition-colors rounded-xl flex-1 sm:flex-none"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={isGeneratingTrackings}
            onClick={handlePrintAnyway}
            className="text-sm h-11 px-5 font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 dark:border-amber-900 dark:text-amber-400 transition-colors rounded-xl flex-1 sm:flex-none"
          >
            Imprimir sin Tracking
          </Button>
          <Button
            type="button"
            disabled={isGeneratingTrackings}
            onClick={handleGenerateAndPrintLabels}
            className="text-sm h-11 px-6 font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-md border border-emerald-500/20 transition-all gap-2 rounded-xl flex-1 sm:flex-none"
          >
            {isGeneratingTrackings ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Generar y Continuar (
                {(generateForPaid ? paidInvoicesMissing.length : 0) + (generateForUnpaid ? unpaidInvoicesMissing.length : 0)}
                )
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </DashboardLayout>
  );
}
