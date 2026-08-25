/**
 * ConsolidationCustomerCard
 *
 * Invoice-centric card for a single consolidation customer.
 * Groups data by manifest, showing invoices + uninvoiced packages.
 *
 * Features:
 *   - HTML5 Drag & Drop: packages can be dragged between manifest groups
 *   - Protected packages (sent/paid invoices, terminal statuses) are NOT draggable
 *   - Compliance status badge (✅ / ⚠️ / ❌)
 *   - Grace period countdown
 *   - Carry-on suggestion banner
 *   - Uninvoiced package diagnostics (explains WHY a package isn't invoiced)
 *   - Expandable manifest groups with inline invoice rows
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
import {
  User,
  ChevronDown,
  ChevronRight,
  Layers,
  Package,
  Scale,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRightLeft,
  Clock,
  GripVertical,
  Lock,
  MapPin,
  Truck,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import type { CustomerSection, ManifestGroup, PackageDragPayload, ConsolidationPackage } from './types';
import { PACKAGE_DND_TYPE, isPackageDraggable } from './types';
import type { ComplianceResult } from '@/lib/services/consolidation-rules-service';
import { daysSince, oldestPackageDate } from '@/lib/services/consolidation-carry-on-service';
import { getRouteColor } from '@/lib/utils/route-colors';
import { CopyButton } from '@/components/ui/copy-button';
import { firebaseApi } from '@/lib/firebase/callable';
import { useToast } from '@/hooks/use-toast';
import { PackageStatusBadge } from './PackageStatusBadge';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';
import { pushStatusToSp2 } from '@/lib/services/sync-invoices-service';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface ConsolidationCustomerCardProps {
  section: CustomerSection;
  compliance?: ComplianceResult | null;
  /** Grace period in days from consolidation rules */
  gracePeriodDays?: number;
  /** Daily storage charge in USD from rules */
  dailyStorageCharge?: number;
  defaultOpen?: boolean;
  forceOpen?: boolean | null;
  onCarryOn?: (invoiceId: string, trackings: string[], manifestNumber: string) => void;
  /** Called when a package is dropped on a different manifest (DnD) */
  onPackageDrop?: (payload: PackageDragPayload, targetManifest: string) => void;
  /** Called when a drag starts — lets the parent show a cancel button */
  onDragStarted?: (payload: PackageDragPayload) => void;
  /** Called when a drag ends (dropped, cancelled, or ESC) */
  onDragEnded?: () => void;
  /** Callback after bulk reconciliation completes to refresh data */
  onReconciled?: () => void;
  /** Called when user clicks "Mover a..." button on an uninvoiced package */
  onMovePackage?: (pkg: ConsolidationPackage, manifestNumber: string) => void;
  /** Called when user clicks "Mover todos" on the uninvoiced block header */
  onMoveBlock?: (pkgs: ConsolidationPackage[], manifestNumber: string, slCode?: string) => void;
  /**
   * When true the per-manifest sub-header (name + count badges) inside the
   * expanded card is hidden. Use this when the card is already rendered inside
   * a manifest group header so the information isn't duplicated.
   */
  hideManifestGroupHeader?: boolean;
  /**
   * When true AND the customer has stale packages (paid invoice + packages
   * that are not in a terminal status), the card row is highlighted in red
   * so the operator can immediately see who needs reconciliation.
   */
  highlightStale?: boolean;
  /**
   * The current search query from the parent filter bar.
   * Forwarded to ConsolidationInvoiceRow so matching tracking numbers are
   * highlighted with a red pill for quick visual identification.
   */
  searchQuery?: string;
}



/** Human-readable lock reason per package status */
const LOCK_REASONS: Record<string, string> = {
  delivered: 'Paquete entregado — ya no se puede mover.',
  processed: 'Paquete procesado — ya no se puede mover.',
  returned: 'Paquete devuelto — ya no se puede mover.',
  pickup: 'Paquete en proceso de pickup — no se puede mover.',
  sent: 'La factura fue enviada al cliente — paquete bloqueado.',
  paid: 'La factura fue pagada — paquete bloqueado.',
  overdue: 'La factura está vencida — paquete bloqueado.',
};

/**
 * Calculates the exact, isolated consolidation start date ("Día 0 / Día 1") for an individual package.
 *
 * Priority Rules:
 *   1. Immutable `firstConsolidatedAt` timestamp (prevents any subsequent delivery
 *      attempts, invoice cancellations, or batch movements from resetting the package clock).
 *   2. Chronological scan of `statusHistory` to find the EARLIEST consolidation or invoice-annulment event
 *      specific to this package (extracts date from the earliest annulled invoice or the changedAt timestamp).
 *   3. Package-level `annulledAt` timestamp.
 *   4. Date encoded in `pkg.annulledInvoiceNumber`.
 *   5. Active invoice date (only when package is in an active non-transitoria invoice).
 *   6. Fallbacks: `invoicedAt`, `manifestUpdatedAt`, `createdAt`, `savedAt`.
 */
export function getConsolidationStartDate(pkg: any): string | null {
  if (!pkg) return null;

  // 1. Immutable first consolidation timestamp if present
  if (pkg.firstConsolidatedAt) {
    return pkg.firstConsolidatedAt;
  }

  // 2. Earliest consolidation / annulment event from statusHistory
  if (pkg.statusHistory && Array.isArray(pkg.statusHistory) && pkg.statusHistory.length > 0) {
    // Sort chronological ascending (oldest first)
    const sortedHistory = [...pkg.statusHistory].sort((a, b) => {
      const timeA = new Date(a.changedAt || a.timestamp || 0).getTime() || 0;
      const timeB = new Date(b.changedAt || b.timestamp || 0).getTime() || 0;
      return timeA - timeB;
    });

    const invRegex = /Factura\s+([A-Z0-9-]{6,}\d{14,}(?:-C)?)/i;

    for (const h of sortedHistory) {
      const status = (h.status || '').toLowerCase();
      const note = h.note || h.notes || '';
      const changedBy = (h.changedBy || '').toLowerCase();

      const isConsolidationEvent =
        status === 'consolidated' ||
        changedBy.includes('annulled') ||
        changedBy.includes('unlocked') ||
        note.toLowerCase().includes('anulada') ||
        note.toLowerCase().includes('consolidac');

      if (isConsolidationEvent) {
        // If note includes an invoice number with date, parse the date from that invoice
        const match = note.match(invRegex);
        if (match) {
          const invMatch = match[1].match(/-(\d{4})(\d{2})(\d{2})/);
          if (invMatch) {
            const [, yyyy, mm, dd] = invMatch;
            return `${yyyy}-${mm}-${dd}T12:00:00-06:00`;
          }
        }
        if (h.changedAt || h.timestamp) {
          return h.changedAt || h.timestamp;
        }
      }
    }
  }

  // 3. Package-level annulledAt timestamp
  if (pkg.annulledAt) {
    return pkg.annulledAt;
  }

  // 4. Date encoded in pkg.annulledInvoiceNumber
  if (pkg.annulledInvoiceNumber) {
    const match = pkg.annulledInvoiceNumber.match(/-(\d{4})(\d{2})(\d{2})/);
    if (match) {
      const [, yyyy, mm, dd] = match;
      return `${yyyy}-${mm}-${dd}T12:00:00-06:00`;
    }
  }

  // 5. Active invoice date (only when package is in an active non-transitoria invoice)
  if (pkg.invoiceNumber && !pkg.isTransitoria) {
    const match = pkg.invoiceNumber.match(/-(\d{4})(\d{2})(\d{2})/);
    if (match) {
      const [, yyyy, mm, dd] = match;
      return `${yyyy}-${mm}-${dd}T12:00:00-06:00`;
    }
  }

  // 6. InvoicedAt field
  if (pkg.invoicedAt) {
    return pkg.invoicedAt;
  }

  // 7. Fallbacks: manifestUpdatedAt / createdAt / savedAt
  return pkg.manifestUpdatedAt || pkg.createdAt || pkg.savedAt || null;
}

export function ConsolidationCustomerCard({
  section,
  compliance,
  gracePeriodDays = 14,
  dailyStorageCharge = 1.00,
  defaultOpen = false,
  forceOpen,
  onCarryOn,
  onPackageDrop,
  onDragStarted,
  onDragEnded,
  onReconciled,
  onMovePackage,
  onMoveBlock,
  hideManifestGroupHeader = false,
  highlightStale = false,
  searchQuery = '',
}: ConsolidationCustomerCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen ?? open;

  useEffect(() => {
    if (forceOpen !== null && forceOpen !== undefined) {
      setOpen(forceOpen);
    }
  }, [forceOpen]);



  // DnD state
  const [dragOverManifest, setDragOverManifest] = useState<string | null>(null);
  const [unlockingPkgId, setUnlockingPkgId] = useState<string | null>(null);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [pkgToUnlock, setPkgToUnlock] = useState<ConsolidationPackage | null>(null);

  // Bulk move/unlock state
  const [blockToMove, setBlockToMove] = useState<{ pkgs: ConsolidationPackage[]; manifestNumber: string } | null>(null);
  const [bulkUnlockConfirmOpen, setBulkUnlockConfirmOpen] = useState(false);
  const [bulkUnlocking, setBulkUnlocking] = useState(false);

  const { customer, manifestGroups, totalPackages, totalWeight, totalAmount, manifestCount } = section;
  // Destructure the new prop (default false = show the header as before)

  // User profiles cache for statusHistory audit mapping
  const [resolvedUsers, setResolvedUsers] = useState<Record<string, string>>({});

  useEffect(() => {
    // Helper to collect all unique changedBy values
    const collectUids = () => {
      const uids = new Set<string>();
      for (const group of manifestGroups) {
        for (const inv of group.invoices) {
          if (inv.statusHistory) {
            for (const h of inv.statusHistory) {
              if (h.changedBy && h.changedBy.length > 5 && !h.changedBy.includes('@')) {
                uids.add(h.changedBy);
              }
            }
          }
        }
      }
      return Array.from(uids);
    };

    const uids = collectUids();
    const missing = uids.filter(uid => !resolvedUsers[uid]);
    if (missing.length === 0) return;

    let active = true;
    const fetchUsers = async () => {
      const newMappings: Record<string, string> = {};
      for (const uid of missing) {
        try {
          const userSnap = await getDoc(doc(db, 'users', uid));
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const identifier = userData?.email || userData?.fullName || `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() || uid;
            newMappings[uid] = identifier;
          } else {
            const custSnap = await getDoc(doc(db, 'customers', uid));
            if (custSnap.exists()) {
              const custData = custSnap.data();
              newMappings[uid] = custData?.email || custData?.fullName || uid;
            } else {
              newMappings[uid] = uid;
            }
          }
        } catch (err) {
          console.warn('Error fetching user profile for uid:', uid, err);
          newMappings[uid] = uid;
        }
      }
      if (active) {
        setResolvedUsers(prev => ({ ...prev, ...newMappings }));
      }
    };

    fetchUsers();
    return () => {
      active = false;
    };
  }, [manifestGroups, resolvedUsers]);

  // ── Grace period computation ───────────────────────────────────────────────
  const allPackages = useMemo(
    () => manifestGroups.flatMap(g => g.packages),
    [manifestGroups]
  );
  const oldest = useMemo(() => oldestPackageDate(allPackages), [allPackages]);
  const daysInStorage = daysSince(oldest);
  const daysRemaining = gracePeriodDays - daysInStorage;
  const graceExpired = daysInStorage >= 0 && daysRemaining <= 0;
  const graceWarning = daysInStorage >= 0 && daysRemaining > 0 && daysRemaining <= 3;

  // ── "Consolida desde" badge ───────────────────────────────────────────────
  /** Format the oldest-package date as a short locale string */
  const consolidaSinceLabel = useMemo(() => {
    if (!oldest) return null;
    const d = new Date(oldest);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'America/Costa_Rica' });
  }, [oldest]);

  const consolidaBadgeClass = useMemo(() => {
    if (daysInStorage < 0) return null; // no date
    if (daysInStorage < 7)
      return 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700/50 dark:text-emerald-400';
    if (daysInStorage < 14)
      return 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-400';
    if (daysInStorage < 30)
      return 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-700/50 dark:text-orange-400';
    return 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/30 dark:border-red-700/50 dark:text-red-400';
  }, [daysInStorage]);

  // ── Compliance summary ─────────────────────────────────────────────────────
  const complianceIcon = useMemo(() => {
    if (!compliance) return null;
    if (compliance.violations.length > 0) {
      return <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />;
    }
    if (compliance.warnings.length > 0) {
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />;
    }
    return <CheckCircle className="h-3.5 w-3.5 text-emerald-500" aria-hidden />;
  }, [compliance]);

  // -- Detect paid invoices with non-delivered packages (stale > 5 days) --
  const TERMINAL_STATUSES = useMemo(() => new Set(['delivered', 'processed', 'returned', 'pickup']), []);
  const PAID_STALE_DAYS = 5;

  const staleDeliveryPackages = useMemo(() => {
    const result: { pkg: ConsolidationPackage; invoice: { id: string; invoiceNumber: string; updatedAt?: string; createdAt?: string } }[] = [];
    for (const group of manifestGroups) {
      for (const inv of group.invoices) {
        if ((inv.status || '').toLowerCase() !== 'paid') continue;
        const invDate = (inv as any).updatedAt || inv.createdAt || '';
        if (!invDate) continue;
        const ageMs = Date.now() - new Date(invDate).getTime();
        const ageDays = Math.floor(ageMs / 86_400_000);
        if (ageDays < PAID_STALE_DAYS) continue;
        for (const item of (inv.invoiceItems || [])) {
          if (!item.trackingNumber) continue;
          const pkg = group.packages.find(
            p => p.trackingNumber.toUpperCase() === item.trackingNumber!.toUpperCase()
          );
          if (pkg && !TERMINAL_STATUSES.has((pkg.status || '').toLowerCase())) {
            result.push({ pkg, invoice: { id: inv.id, invoiceNumber: inv.invoiceNumber, updatedAt: (inv as any).updatedAt, createdAt: inv.createdAt } });
          }
        }
      }
    }
    return result;
  }, [manifestGroups, TERMINAL_STATUSES]);

  /** Quick lookup: which package IDs are "stale" (paid invoice > 5 days, not delivered) */
  const stalePackageIds = useMemo(
    () => new Set(staleDeliveryPackages.map(s => s.pkg.id)),
    [staleDeliveryPackages]
  );

  const [reconciling, setReconciling] = useState(false);



  const getUninvoicedPackages = useCallback((group: ManifestGroup) => {
    return group.packages;
  }, []);

  const handleCarryOn = useCallback((invoiceId: string, trackings: string[], manifestNumber: string) => {
    onCarryOn?.(invoiceId, trackings, manifestNumber);
  }, [onCarryOn]);

  const handleUnlockPackage = useCallback((pkg: ConsolidationPackage) => {
    if (!pkg.invoiceId) return;
    setPkgToUnlock(pkg);
    setUnlockConfirmOpen(true);
  }, []);

  const executeUnlockPackage = useCallback(async () => {
    if (!pkgToUnlock) return;
    const pkg = pkgToUnlock;
    setPkgToUnlock(null);
    setUnlockConfirmOpen(false);

    setUnlockingPkgId(pkg.id);
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
      const { db } = await import('@/lib/firebase/index');

      const now = new Date().toISOString();
      const batch = writeBatch(db);

      // 1. Mark the invoice as annulled
      const invoiceRef = doc(db, 'invoices', pkg.invoiceId);
      batch.update(invoiceRef, {
        status: 'annulled',
        annulledAt: now,
        statusHistory: arrayUnion({
          status: 'annulled',
          changedAt: now,
          changedBy: 'consolidation-manifests-manual-unlock',
        }),
      });

      // 2. Query and update all packages belonging to that invoice
      const pkgsQuery = query(
        collection(db, 'packages'),
        where('invoiceId', '==', pkg.invoiceId)
      );
      const pkgsSnap = await getDocs(pkgsQuery);
      let releasedCount = 0;

      pkgsSnap.forEach((pkgDoc) => {
        const data = pkgDoc.data();
        const currentManifest = data.manifestNumber || data.manifiesto || '';
        
        batch.update(doc(db, 'packages', pkgDoc.id), {
          invoiceId: deleteField(),
          invoiceNumber: deleteField(),
          invoiceStatus: deleteField(),
          status: 'consolidated',
          ...(!data.originalManifestID && currentManifest
            ? { originalManifestID: currentManifest }
            : {}),
          manifestId:        'consolidacion_transitoria',
          manifestNumber:    'consolidacion_transitoria',
          updatedManifest:   'consolidacion_transitoria',
          manifestUpdatedAt: now,
          consolidacion:     true,
          annulledInvoiceId: pkg.invoiceId,
          annulledInvoiceNumber: pkg.invoiceNumber || '',
          annulledAt: now,
          ...(!data.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
          smartwebSynced: false,
          statusHistory: arrayUnion({
            status: 'consolidated',
            changedAt: now,
            changedBy: 'invoice-unlocked-annulled',
            note: `Factura ${pkg.invoiceNumber || pkg.invoiceId} anulada vía desbloqueo — paquete desvinculado y movido a consolidación transitoria`,
          }),
        });
        releasedCount++;
      });

      await batch.commit();

      // 3. Call pushStatusToSp2 (fire-and-forget)
      pushStatusToSp2(pkg.invoiceId, pkg.invoiceNumber || pkg.invoiceId, 'annulled')
        .catch((err) => console.warn('[UnlockPackage] SP2 status push failed:', err));

      // Sync updated packages to SP2 (SmartWeb)
      const sp2Pkgs = pkgsSnap.docs
        .map(d => {
          const data = d.data();
          return {
            id:             d.id,
            trackingNumber: data.trackingNumber || '',
            slCode:         data.slCode || pkg.slCode || '',
            customerName:   data.customerName || pkg.customerName || '',
            status:         'consolidated',
            weight:         data.weight || 0,
            description:    data.description || '',
            ruta:           data.ruta || '',
            manifestNumber: 'consolidacion_transitoria',
            forceSync:      true,
            allowCreate:    true,
          };
        })
        .filter(p => p.trackingNumber);

      if (sp2Pkgs.length > 0) {
        syncPackagesToSmartWeb(sp2Pkgs).catch(err =>
          console.warn('[UnlockPackage] SP2 package sync failed:', err)
        );
      }

      toast({
        title: 'Paquete desbloqueado',
        description: `Factura ${pkg.invoiceNumber || pkg.invoiceId} anulada y ${releasedCount} paquete(s) liberados.`,
      });

      onReconciled?.();
    } catch (err) {
      toast({
        title: 'Error al desbloquear paquete',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setUnlockingPkgId(null);
    }
  }, [pkgToUnlock, toast, onReconciled]);

  const executeBulkUnlockAndMove = useCallback(async () => {
    if (!blockToMove) return;
    const { pkgs: combinedPkgs, manifestNumber } = blockToMove;
    setBulkUnlocking(true);

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
      const { db } = await import('@/lib/firebase/index');

      const now = new Date().toISOString();
      const batch = writeBatch(db);

      // Filter to find all packages that are locked by active invoices
      const unlockablePkgs = combinedPkgs.filter(
        p => !isPackageDraggable(p) && p.invoiceId && ['sent', 'paid', 'overdue'].includes((p.invoiceStatus || '').toLowerCase())
      );

      // Find unique active invoices to annul
      const invoiceMap = new Map<string, string>(); // invoiceId -> invoiceNumber
      unlockablePkgs.forEach(p => {
        if (p.invoiceId) {
          invoiceMap.set(p.invoiceId, p.invoiceNumber || p.invoiceId);
        }
      });

      // 1. Mark each invoice as annulled
      for (const [invoiceId, invoiceNumber] of invoiceMap.entries()) {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        batch.update(invoiceRef, {
          status: 'annulled',
          annulledAt: now,
          statusHistory: arrayUnion({
            status: 'annulled',
            changedAt: now,
            changedBy: 'consolidation-manifests-bulk-unlock',
            note: `Anulada por movimiento de bloque en consolidación transitoria`,
          }),
        });
      }

      // 2. Query and update all packages belonging to these invoices
      const allSp2Pkgs: any[] = [];
      let totalReleasedCount = 0;

      for (const invoiceId of invoiceMap.keys()) {
        const invoiceNumber = invoiceMap.get(invoiceId) || '';
        const pkgsQuery = query(
          collection(db, 'packages'),
          where('invoiceId', '==', invoiceId)
        );
        const pkgsSnap = await getDocs(pkgsQuery);

        pkgsSnap.forEach((pkgDoc) => {
          const data = pkgDoc.data();
          const currentManifest = data.manifestNumber || data.manifiesto || '';

          batch.update(doc(db, 'packages', pkgDoc.id), {
            invoiceId: deleteField(),
            invoiceNumber: deleteField(),
            invoiceStatus: deleteField(),
            status: 'consolidated',
            ...(!data.originalManifestID && currentManifest
              ? { originalManifestID: currentManifest }
              : {}),
            manifestId:        'consolidacion_transitoria',
            manifestNumber:    'consolidacion_transitoria',
            updatedManifest:   'consolidacion_transitoria',
            manifestUpdatedAt: now,
            consolidacion:     true,
            annulledInvoiceId: invoiceId,
            annulledInvoiceNumber: invoiceNumber,
            annulledAt: now,
            ...(!data.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
            smartwebSynced: false,
            statusHistory: arrayUnion({
              status: 'consolidated',
              changedAt: now,
              changedBy: 'invoice-unlocked-annulled-bulk',
              note: `Factura ${invoiceNumber} anulada vía desbloqueo de bloque — paquete desvinculado`,
            }),
          });
          totalReleasedCount++;

          if (data.trackingNumber || data.tracking) {
            allSp2Pkgs.push({
              id:             pkgDoc.id,
              trackingNumber: data.trackingNumber || data.tracking || '',
              slCode:         data.slCode || customer.slCode,
              customerName:   data.customerName || customer.fullName,
              status:         'consolidated',
              weight:         data.weight || 0,
              description:    data.description || '',
              ruta:           data.ruta || '',
              manifestNumber: 'consolidacion_transitoria',
              forceSync:      true,
              allowCreate:    true,
            });
          }
        });
      }

      await batch.commit();

      // 3. Call pushStatusToSp2 for each annulled invoice (fire-and-forget)
      for (const [invoiceId, invoiceNumber] of invoiceMap.entries()) {
        pushStatusToSp2(invoiceId, invoiceNumber, 'annulled')
          .catch((err) => console.warn(`[BulkUnlock] SP2 status push failed for ${invoiceNumber}:`, err));
      }

      // Sync updated packages to SP2 (SmartWeb)
      if (allSp2Pkgs.length > 0) {
        syncPackagesToSmartWeb(allSp2Pkgs).catch(err =>
          console.warn('[BulkUnlock] SP2 package sync failed:', err)
        );
      }

      toast({
        title: 'Bloque desbloqueado',
        description: `${invoiceMap.size} factura(s) anulada(s) y ${totalReleasedCount} paquete(s) desbloqueados.`,
      });

      // Refresh data
      onReconciled?.();

      // Proceed to the carry-on dialog via onMoveBlock
      onMoveBlock?.(combinedPkgs, manifestNumber, customer.slCode);

      setBulkUnlockConfirmOpen(false);
      setBlockToMove(null);
    } catch (err) {
      toast({
        title: 'Error al desbloquear bloque',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setBulkUnlocking(false);
    }
  }, [blockToMove, customer, onMoveBlock, onReconciled, toast]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = useCallback((
    e: React.DragEvent,
    pkg: ConsolidationPackage,
    manifestNumber: string,
    invoiceId?: string,
  ) => {
    const payload: PackageDragPayload = {
      packageId: pkg.id,
      trackingNumber: pkg.trackingNumber,
      sourceManifest: manifestNumber,
      slCode: customer.slCode,
      customerName: customer.fullName,
      sourceInvoiceId: invoiceId || pkg.invoiceId,
      invoiceStatus: pkg.invoiceStatus,
      weight: pkg.weight,
      description: pkg.description,
    };

    e.dataTransfer.setData(PACKAGE_DND_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';

    // Notify parent that a drag is in progress (for cancel UI / ESC)
    onDragStarted?.(payload);

    // Custom drag image hint
    if (e.dataTransfer.setDragImage) {
      const el = e.currentTarget as HTMLElement;
      e.dataTransfer.setDragImage(el, 12, 12);
    }
  }, [customer, onDragStarted]);

  const handleDragOver = useCallback((e: React.DragEvent, manifestNumber: string) => {
    // Only accept our custom type
    if (e.dataTransfer.types.includes(PACKAGE_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverManifest(manifestNumber);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we actually left (not entering a child)
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOverManifest(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetManifest: string) => {
    e.preventDefault();
    setDragOverManifest(null);

    const raw = e.dataTransfer.getData(PACKAGE_DND_TYPE);
    if (!raw) return;

    try {
      const payload: PackageDragPayload = JSON.parse(raw);
      // Allow dropping to 'uninvoiced' sentinel from ANY source invoice.
      // For regular manifest-to-manifest drops, skip if same manifest.
      const isUninvoicedTarget = targetManifest === 'uninvoiced';
      if (!isUninvoicedTarget && payload.sourceManifest === targetManifest) return;
      onPackageDrop?.(payload, targetManifest);
    } catch {
      // invalid payload
    }
  }, [onPackageDrop]);

  // True when this card should be highlighted (stale + operator toggled highlight)
  const isStaleHighlighted = highlightStale && staleDeliveryPackages.length > 0;

  return (
    <div className={cn(
      'flex flex-col border-b transition-colors',
      graceExpired ? 'border-b-red-300/50 dark:border-b-red-700/40' : 'border-b-border',
      isStaleHighlighted && 'border-l-2 border-l-red-500 dark:border-l-red-600',
    )}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1.5 sm:px-3.5 py-2 bg-muted/20 hover:bg-muted/40 transition-colors gap-3">
        {/* Toggle + Route + SLCode + Name */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity flex-1 min-w-0"
          aria-expanded={isOpen}
          title={isOpen ? "Colapsar cliente" : "Expandir cliente"}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}

          {/* Route or Courier Service Badge */}
          {customer.courierService ? (() => {
            const rc = getRouteColor('Encomiendas');
            return (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0',
                  rc.bg, rc.border, rc.text
                )}
                title={`Courier: ${customer.courierService}`}
              >
                <Truck className="h-3 w-3 shrink-0" aria-hidden />
                <span>{customer.courierService}</span>
              </span>
            );
          })() : customer.ruta ? (() => {
            const rc = getRouteColor(customer.ruta);
            return (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0',
                  rc.bg, rc.border, rc.text
                )}
                title={`Ruta: ${customer.ruta}`}
              >
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span>{customer.ruta}</span>
              </span>
            );
          })() : null}

          <span className="text-[10px] font-mono text-muted-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded shrink-0">
            {customer.slCode || "\u2014"}
          </span>
          <span className="text-sm font-semibold text-foreground truncate flex-1">
            {customer.fullName?.toUpperCase()}
          </span>
        </button>

        {/* Right side: Age + Grace remaining + Compliance icon */}
        <div className="flex items-center gap-2 shrink-0">
          {/* "Consolida desde" age badge */}
          {consolidaSinceLabel && consolidaBadgeClass && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 shrink-0 text-[10px] font-medium',
                    'border rounded px-1.5 py-0.5 leading-none whitespace-nowrap',
                    consolidaBadgeClass,
                  )}
                  aria-label={`Consolida desde ${consolidaSinceLabel}`}
                >
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  {consolidaSinceLabel}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
              >
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Consolida desde {consolidaSinceLabel}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  {daysInStorage >= 0 ? `${daysInStorage} día(s) acumulando paquetes` : 'Sin paquetes datados'}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Grace period badge */}
          {daysInStorage >= 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0',
                graceExpired
                  ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700'
                  : graceWarning
                    ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700'
                    : 'bg-background/80 text-muted-foreground border-border/50'
              )}
            >
              <Clock className="h-3 w-3" aria-hidden />
              {graceExpired ? 'Gracia vencida' : `${daysRemaining}d`}
            </span>
          )}

          {/* Compliance icon */}
          {complianceIcon && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">{complianceIcon}</span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
              >
                <p className="text-xs font-medium mb-1 text-slate-900 dark:text-slate-100">
                  {compliance?.compliant ? 'Cumple reglas' : 'Tiene observaciones'}
                </p>
                {compliance?.violations.map((v, i) => (
                  <p key={i} className="text-[11px] text-red-600 dark:text-red-400">❌ {v.detail}</p>
                ))}
                {compliance?.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-amber-600 dark:text-amber-400">⚠️ {w.detail}</p>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>




      {/* ── Manifest groups ─────────────────────────────────────────────── */}
      {isOpen && (
        <div className="px-4 py-3 space-y-4">
          {manifestGroups.map(group => {
            const uninvoiced = getUninvoicedPackages(group);
            const isDragOver = dragOverManifest === group.manifestNumber;

            return (
              <div
                key={group.manifestNumber}
                className={cn(
                  'space-y-2 rounded-lg transition-all duration-150',
                  isDragOver ? 'ring-2 ring-primary/50 bg-primary/5 p-2 -m-2' : '',
                )}
                onDragOver={(e) => handleDragOver(e, group.manifestNumber)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, group.manifestNumber)}
              >
                {/* Manifest header — hidden for CONSOLIDACION_TRANSITORIA or when nested inside a manifest group header */}
                {!hideManifestGroupHeader && group.manifestNumber.toUpperCase() !== 'CONSOLIDACION_TRANSITORIA' && (
                  <div className={cn(
                    'flex items-center gap-2 py-1 px-1 rounded transition-colors',
                    isDragOver ? 'bg-primary/10' : '',
                  )}>
                    <Layers className="h-3 w-3 text-primary/50" aria-hidden />
                    <span className="text-xs font-semibold text-foreground">
                      {group.manifestNumber}
                    </span>
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">
                      {group.packages.length} paq
                    </Badge>
                    {group.invoices.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1">
                        {group.invoices.length} fact
                      </Badge>
                    )}
                    {isDragOver && (
                      <Badge className="text-[9px] h-4 px-1.5 bg-primary/20 text-primary border-primary/30 ml-auto animate-pulse">
                        Soltar aquí
                      </Badge>
                    )}
                  </div>
                )}

                {/* Invoices hidden — this view is for package reassignment only */}
                <div className={cn("space-y-1.5", group.manifestNumber.toUpperCase() !== 'CONSOLIDACION_TRANSITORIA' ? "ml-5" : "")}>
                  {/* ── Uninvoiced packages with diagnostics ───────────────── */}
                  {uninvoiced.length > 0 && (
                    <div
                      className={cn(
                        'border border-dashed rounded-lg px-3 py-2 transition-all duration-150',
                        dragOverManifest === `${group.manifestNumber}__uninvoiced`
                          ? 'border-primary/70 bg-primary/10 ring-2 ring-primary/30 scale-[1.01]'
                          : 'border-border bg-muted/30 dark:bg-muted/10',
                      )}
                      onDragOver={(e) => handleDragOver(e, `${group.manifestNumber}__uninvoiced`)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, 'uninvoiced')}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <Package className="h-3 w-3 text-muted-foreground" aria-hidden />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {uninvoiced.length} paquete(s) para reasignar
                        </span>
                        <div className="flex items-center gap-1.5 ml-auto">
                          {onMoveBlock && (
                            <button
                              type="button"
                              onClick={() => {
                                const movable = uninvoiced.filter(p => isPackageDraggable(p));
                                const unlockable = uninvoiced.filter(
                                  p => !isPackageDraggable(p) && p.invoiceId && ['sent', 'paid', 'overdue'].includes((p.invoiceStatus || '').toLowerCase())
                                );
                                
                                if (movable.length === 0 && unlockable.length === 0) {
                                  toast({
                                    title: 'Sin paquetes',
                                    description: 'No hay paquetes disponibles para mover en este bloque.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }

                                if (unlockable.length > 0) {
                                  setBlockToMove({
                                    pkgs: [...movable, ...unlockable],
                                    manifestNumber: group.manifestNumber,
                                  });
                                  setBulkUnlockConfirmOpen(true);
                                } else {
                                  onMoveBlock(movable, group.manifestNumber, customer.slCode);
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
                              title="Mover todos los paquetes del bloque a otro manifiesto"
                            >
                              <ArrowRightLeft className="h-3 w-3" />
                              Mover bloque
                            </button>
                          )}
                          <span className="text-[9px] text-muted-foreground hidden sm:inline">
                            Arrastra a otro manifiesto para mover
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {uninvoiced.map(pkg => {
                          const draggable = isPackageDraggable(pkg);

                          // Isolated per-package consolidation start date ("Día 0 / Día 1")
                          const startConsolDate = getConsolidationStartDate(pkg);

                          let formattedStartConsolDate = '';
                          let daysInConsolidation = 0;

                          if (startConsolDate) {
                            const parsedDate = new Date(startConsolDate);
                            const time = parsedDate.getTime();
                            if (!isNaN(time)) {
                              formattedStartConsolDate = parsedDate.toLocaleDateString('es-CR', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                timeZone: 'America/Costa_Rica'
                              });
                              const elapsedMs = Date.now() - time;
                              daysInConsolidation = Math.max(0, Math.floor(elapsedMs / 86_400_000));
                            }
                          }

                          const gp = gracePeriodDays ?? 14;
                          const dsc = dailyStorageCharge ?? 1.00;
                          const daysRemaining = gp - daysInConsolidation;
                          const accumulatedCharge = daysRemaining <= 0 ? Math.abs(daysRemaining) * dsc : 0;

                          // Dynamic color warning logic for Días badge based on gracePeriodDays (gp):
                          // Partition the grace period into 3 equal ranges:
                          const greenLimit = Math.floor(gp / 3);
                          const yellowLimit = Math.floor((2 * gp) / 3);

                          let daysBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50 hover:bg-emerald-50'; // Green (Safe)
                          if (daysInConsolidation > yellowLimit) {
                            daysBadgeColor = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50 hover:bg-red-50'; // Red (Alert)
                          } else if (daysInConsolidation > greenLimit) {
                            daysBadgeColor = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50 hover:bg-amber-50'; // Yellow (Warning)
                          }

                          // Try to build a very descriptive audit-based reason
                          const linkedInvoice = section.manifestGroups
                            .flatMap(g => g.invoices)
                            .find(inv => inv.id === pkg.invoiceId);

                          let detailedReason = '';
                          if (linkedInvoice && linkedInvoice.statusHistory) {
                            const currentStatus = (linkedInvoice.status || '').toLowerCase();
                            const matches = [...linkedInvoice.statusHistory]
                              .filter(h => (h.status || '').toLowerCase() === currentStatus)
                              .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
                            
                            if (matches.length > 0) {
                              const match = matches[0];
                              const changer = match.changedBy ? (resolvedUsers[match.changedBy] || match.changedBy) : 'sistema';
                              const date = new Date(match.changedAt);
                              
                              const formattedDate = date.toLocaleDateString('es-CR', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                timeZone: 'America/Costa_Rica'
                              });
                              const formattedTime = date.toLocaleTimeString('es-CR', {
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                                timeZone: 'America/Costa_Rica'
                              });
                              
                              let statusAction = '';
                              if (currentStatus === 'paid') {
                                statusAction = 'promovida a pagada';
                              } else if (currentStatus === 'sent') {
                                statusAction = 'enviada al cliente';
                              } else if (currentStatus === 'overdue') {
                                statusAction = 'marcada como vencida';
                              } else {
                                statusAction = `cambiada al estado "${currentStatus}"`;
                              }
                              
                              const sourceFlow = match.reason || 'proceso manual';
                              detailedReason = `La factura fue ${statusAction} por ${changer} el ${formattedDate} a las ${formattedTime} (${sourceFlow}) — por eso el paquete está bloqueado.`;
                            }
                          }

                          const lockReason = !draggable ? (
                            detailedReason
                            || LOCK_REASONS[(pkg.invoiceStatus || '').toLowerCase()]
                            || LOCK_REASONS[(pkg.status || '').toLowerCase()]
                            || `Estado: ${pkg.invoiceStatus || pkg.status} — no se puede mover.`
                          ) : '';

                          const rowContent = (
                            <div
                              key={pkg.id}
                              draggable={draggable}
                              onDragStart={draggable ? (e) => handleDragStart(e, pkg, group.manifestNumber) : undefined}
                              onDragEnd={draggable ? () => onDragEnded?.() : undefined}
                              className={cn(
                                'flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] rounded px-2 py-1.5 border transition-all w-full',
                                'bg-muted/20 border-border',
                                draggable
                                  ? 'cursor-grab active:cursor-grabbing hover:shadow-sm hover:scale-[1.01]'
                                  : 'cursor-not-allowed opacity-70',
                              )}
                            >
                              {/* Drag handle or lock icon */}
                              {draggable ? (
                                <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0" aria-hidden />
                              ) : (
                                <span className="shrink-0 flex items-center">
                                  <Lock className="h-3 w-3 text-red-400" aria-hidden />
                                </span>
                              )}

                              <span className="font-mono font-bold text-[13px] text-foreground min-w-0 inline-flex items-center gap-0.5">
                                <span className="truncate">{pkg.trackingNumber}</span>
                                <CopyButton value={pkg.trackingNumber} label="Copiar tracking" iconSize="h-2.5 w-2.5" />
                              </span>

                              <span className="shrink-0">
                                <PackageStatusBadge status={pkg.status || ''} />
                              </span>

                              {/* Stale delivery indicator — paid invoice > 5 days, not delivered */}
                              {stalePackageIds.has(pkg.id) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="shrink-0 flex items-center">
                                      <Truck className="h-3 w-3 text-sky-500" aria-hidden />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
                                  >
                                    <p className="text-xs font-semibold text-sky-600 mb-0.5">📦 Entrega pendiente</p>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                      Factura pagada hace más de 5 días pero el paquete
                                      aún no está marcado como entregado.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* Weight */}
                              {pkg.weight != null && pkg.weight > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                                  <Scale className="h-2.5 w-2.5" aria-hidden />
                                  {pkg.weight.toFixed(2)} kg
                                </span>
                              )}

                              {/* Price */}
                              {pkg.price != null && pkg.price > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                                  <DollarSign className="h-2.5 w-2.5" aria-hidden />
                                  {pkg.price.toFixed(2)}
                                </span>
                              )}

                              {/* Consolidation timing & storage info */}
                              {formattedStartConsolDate && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4.5 px-1.5 gap-0.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50 shrink-0 hover:bg-blue-50"
                                  title="Fecha en que se facturó / inició consolidación"
                                >
                                  <Calendar className="h-2.5 w-2.5 text-blue-500/70" aria-hidden />
                                  Día 1: {formattedStartConsolDate}
                                </Badge>
                              )}

                              <Badge
                                variant="outline"
                                className={cn("text-[9px] h-4.5 px-1.5 gap-0.5 shrink-0 transition-colors", daysBadgeColor)}
                                title="Días transcurridos en consolidación"
                              >
                                <Clock className="h-2.5 w-2.5 opacity-70" aria-hidden />
                                Días: {daysInConsolidation}
                              </Badge>

                              {daysRemaining > 0 ? (
                                <Badge variant="outline" className="text-[9px] h-4.5 px-1.5 bg-sky-50/50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900/50 shrink-0">
                                  Gracia: {daysRemaining} d restantes
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] h-4.5 px-1.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50 shrink-0 font-semibold animate-pulse">
                                  Bodegaje: +${accumulatedCharge.toFixed(2)} ({Math.abs(daysRemaining)} d vencidos)
                                </Badge>
                              )}

                              {/* Move button — button alternative to drag-and-drop */}
                              {draggable && onMovePackage && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1 shrink-0 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary ml-auto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMovePackage(pkg, group.manifestNumber);
                                  }}
                                  aria-label={`Mover ${pkg.trackingNumber} a otro manifiesto`}
                                >
                                  <ArrowRightLeft className="h-3 w-3" aria-hidden />
                                  <span className="hidden sm:inline">Mover manifiesto</span>
                                </Button>
                              )}

                              {/* Unlock button — displayed when package is locked by an active invoice */}
                              {!draggable && pkg.invoiceId && ['sent', 'paid', 'overdue'].includes((pkg.invoiceStatus || '').toLowerCase()) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1 shrink-0 text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-950 dark:hover:bg-red-950/30 ml-auto"
                                  disabled={unlockingPkgId !== null}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnlockPackage(pkg);
                                  }}
                                  aria-label={`Desbloquear paquete ${pkg.trackingNumber} anulando factura ${pkg.invoiceNumber}`}
                                >
                                  {unlockingPkgId === pkg.id ? 'Procesando...' : 'Desbloquear'}
                                </Button>
                              )}
                            </div>
                          );

                          if (draggable) {
                            return <React.Fragment key={pkg.id}>{rowContent}</React.Fragment>;
                          }

                          return (
                            <Tooltip key={pkg.id}>
                              <TooltipTrigger asChild>
                                {rowContent}
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
                              >
                                <p className="text-xs font-semibold text-red-500 mb-1">🔒 Paquete bloqueado</p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">{lockReason}</p>
                                {pkg.invoiceNumber && (
                                  <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-1">
                                    Factura: {pkg.invoiceNumber}
                                  </p>
                                )}
                                {pkg.invoiceId && ['sent', 'paid', 'overdue'].includes((pkg.invoiceStatus || '').toLowerCase()) && (
                                  <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold mt-1">
                                    Se puede desbloquear usando el botón lateral (anulará la factura).
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty manifest — no invoices and no packages */}
                  {group.invoices.length === 0 && group.packages.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/50 italic ml-1">
                      Sin datos en este manifiesto.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal confirmation for unlocking package */}
      <AlertDialog open={unlockConfirmOpen} onOpenChange={setUnlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Lock className="h-4 w-4" />
              ¿Desbloquear paquete?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[13px] text-muted-foreground pt-2">
              <p>
                ¿Está seguro de que desea desbloquear este paquete? Esta acción <strong>ANULARÁ de forma permanente</strong> la factura asociada{' '}
                <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded border">
                  {pkgToUnlock?.invoiceNumber || pkgToUnlock?.invoiceId}
                </span>{' '}
                y liberará todos los paquetes vinculados a ella para que puedan ser re-facturados.
              </p>
              <p className="font-medium text-destructive pt-1">
                ¿Desea continuar?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeUnlockPackage}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Desbloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal confirmation for bulk unlocking and moving */}
      <AlertDialog open={bulkUnlockConfirmOpen} onOpenChange={setBulkUnlockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Lock className="h-4 w-4" />
              ¿Desbloquear y mover bloque de paquetes?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[13px] text-muted-foreground pt-2">
              <p>
                El bloque que intenta mover contiene paquetes que están bloqueados por factura(s) activa(s). 
                Para poder moverlos, se procederá a desbloquearlos primero, lo cual <strong>ANULARÁ de forma permanente</strong> la(s) factura(s) asociada(s):
              </p>
              <div className="flex flex-wrap gap-1.5 my-2">
                {(() => {
                  const invoiceNumbers = Array.from(new Set(
                    blockToMove?.pkgs
                      .filter(p => !isPackageDraggable(p) && p.invoiceId)
                      .map(p => p.invoiceNumber || p.invoiceId)
                      .filter(Boolean)
                  ));
                  return invoiceNumbers.map(num => (
                    <span key={num} className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded border text-[11px]">
                      {num}
                    </span>
                  ));
                })()}
              </div>
              <p>
                Todos los paquetes vinculados a esta(s) factura(s) serán liberados y agregados al bloque para que puedan ser movidos y re-facturados.
              </p>
              <p className="font-medium text-destructive pt-1">
                ¿Desea continuar con el desbloqueo y proceder a mover el bloque?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUnlocking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                executeBulkUnlockAndMove();
              }}
              disabled={bulkUnlocking}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground min-w-[100px]"
            >
              {bulkUnlocking ? 'Procesando...' : 'Desbloquear y Continuar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
