/**
 * ConsolidationInvoiceRow
 *
 * Renders a single consolidation invoice with its items inline.
 * Supports:
 *   - Invoice status badge (draft, sent, paid, annulled)
 *   - Expandable invoice items list with tracking + status + weight + price
 *   - Draggable items (HTML5 DnD) -- only for items NOT in sent/paid invoices
 *   - Action buttons: carry-on, edit, send email
 *   - ⚡ "Marcar entregados + Sync SP2" button when packages have non-terminal status
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  Package,
  Scale,
  DollarSign,
  GripVertical,
  Lock,
  Search,
  CheckCheck,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Ban,
  MoveRight,
  Trash2,
  RotateCcw,
  X,
  Undo2,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useFeatureFlag } from '@/lib/context/FeatureFlagsContext';
import { CopyButton } from '@/components/ui/copy-button';
import { PackageStatusBadge } from './PackageStatusBadge';
import { PackageTraceDialog } from '@/components/packages/PackageTraceDialog';
import type { ConsolidationInvoice, ConsolidationPackage, PackageDragPayload } from './types';
import { PACKAGE_DND_TYPE, NON_DRAGGABLE_INVOICE_STATUSES } from './types';
import { firebaseApi } from '@/lib/firebase/callable';
import { db } from '@/lib/firebase/index';
import { doc, writeBatch, deleteField } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';
import { pushStatusToSp2, deleteInvoiceFromSp2 } from '@/lib/services/sync-invoices-service';

/** Returns true if the package (or invoice) is older than maxDays */
function isOlderThanDays(invoice: { createdAt?: string; invoiceDate?: string }, maxDays: number): boolean {
  const raw = invoice.createdAt || invoice.invoiceDate;
  if (!raw) return false;
  const diff = (Date.now() - new Date(raw).getTime()) / (1000 * 60 * 60 * 24);
  return diff > maxDays;
}

interface ConsolidationInvoiceRowProps {
  invoice: ConsolidationInvoice;
  /** Packages from the same manifest/customer that this invoice covers */
  matchedPackages: ConsolidationPackage[];
  /** Called when the user wants to carry-on packages from this invoice */
  onCarryOn?: (invoiceId: string, trackings: string[]) => void;
  /** DnD: callback to start dragging (unused, handled internally now) */
  onDragStart?: (pkg: ConsolidationPackage) => void;
  /** Context for DnD payloads */
  manifestNumber?: string;
  customerSlCode?: string;
  customerName?: string;
  /** Called after a bulk deliver+sync so the parent can refetch */
  onReconciled?: () => void;
  /** Called after packages are moved to transitoria */
  onMovedToTransitoria?: () => void;
  /**
   * Current search/filter query from the parent filter bar.
   * When a tracking number matches, it is highlighted in red so the operator
   * can immediately spot it in a long list.
   */
  searchQuery?: string;
  /**
   * Set of tracking numbers already covered by at least one ACTIVE (non-annulled)
   * invoice for this customer.
   * Passed only to annulled/read-only invoice rows so they can identify which
   * of their items are orphaned (not in any active invoice) and therefore
   * eligible to be rescued by drag-and-drop into an active draft invoice.
   */
  activeTrackings?: Set<string>;
  /**
   * Called when the user drops a rescue item (isRescue=true payload) onto this
   * ACTIVE invoice row. The parent is responsible for adding the item to the
   * invoice and updating the package's invoiceId in Firestore.
   */
  onRescueItemDrop?: (invoiceId: string, payload: PackageDragPayload) => void;
  /**
   * When provided, overrides the internal expanded/collapsed state.
   * true  → force open
   * false → force close
   * undefined → leave the local state in control (no override)
   */
  forceExpanded?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Borrador',  className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent:      { label: 'Enviada',   className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  paid:      { label: 'Pagada',    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  overdue:   { label: 'Vencida',   className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  annulled:  { label: 'Anulada',   className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  void:      { label: 'Void',      className: 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const PROTECTED_STATUSES   = new Set(['paid', 'cancelled', 'annulled', 'void']);
const TERMINAL_PKG_STATUSES = new Set(['delivered', 'processed', 'returned', 'pickup']);

export function ConsolidationInvoiceRow({
  invoice,
  matchedPackages,
  onCarryOn,
  manifestNumber,
  customerSlCode,
  customerName,
  onReconciled,
  onMovedToTransitoria,
  searchQuery = '',
  activeTrackings,
  onRescueItemDrop,
  forceExpanded,
}: ConsolidationInvoiceRowProps) {
  /** Normalised query — used for red-pill highlight */
  const highlightQuery = searchQuery.trim().toLowerCase();
  const { toast } = useToast();
  const routeReturnsEnabled = useFeatureFlag('routeReturnsModule');
  const [expanded, setExpanded] = useState(false);
  const [traceTracking, setTraceTracking] = useState<string | null>(null);

  // Sync with parent expand/collapse-all control
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setExpanded(forceExpanded);
    }
  }, [forceExpanded]);
  const [delivering, setDelivering] = useState(false);
  const [annulling, setAnnulling] = useState(false);
  const [deletingSoft, setDeletingSoft] = useState(false);
  const [returningPkgs, setReturningPkgs] = useState(false);
  /** True once the invoice has been soft-deleted — hides it from the UI immediately */
  const [softDeleted, setSoftDeleted] = useState(false);
  const [selectedTrackings, setSelectedTrackings] = useState<Set<string>>(new Set());
  const [movingToTransitoria, setMovingToTransitoria] = useState(false);
  /** True when the admin has acknowledged the multi-manifest risk warning */
  const [confirmedReassigned, setConfirmedReassigned] = useState(false);
  /** True when a rescue item is being dragged over this active invoice */
  const [dragOverRescue, setDragOverRescue] = useState(false);

  const items = invoice.invoiceItems || [];
  const statusInfo = STATUS_LABELS[invoice.status?.toLowerCase() || 'draft'] || STATUS_LABELS.draft;
  const isProtected = PROTECTED_STATUSES.has(invoice.status?.toLowerCase() || '');
  const invStatus = (invoice.status || 'draft').toLowerCase();

  /** Reassigned packages visible in this invoice (for header badge — visible while collapsed) */
  const reassignedPackagesCount = matchedPackages.filter(
    p => p.isReassigned &&
      items.some(it => (it.trackingNumber || '').toUpperCase() === p.trackingNumber.toUpperCase())
  ).length;

  /**
   * Annul a draft invoice and reset its packages so they can be re-invoiced.
   *
   * Atomic batch:
   *   1. Invoice → status: annulled
   *   2. Each package in the invoice →
   *      - invoiceId cleared (null) so it shows as "sin factura"
   *      - status reset to 'consolidated' (ready to re-invoice)
   *      - originalManifestId preserved for audit (does NOT overwrite if already set)
   *      - manifestNumber / manifestId unchanged (package stays in its current manifest)
   *      - statusHistory entry added
   */
  const handleReturnPackages = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (returningPkgs || (invStatus !== 'draft' && invStatus !== 'sent')) return;
    
    // Confirm with the user
    if (!window.confirm(`¿Estás seguro de mover todos los paquetes de la factura ${invoice.invoiceNumber || invoice.id} al estado "Devuelto" (returned)? La factura NO se anulará.`)) {
      return;
    }

    // Prompt for destination manifest number
    const targetMf = window.prompt(
      "Ingrese el número de manifiesto de destino para reasignar los paquetes y la factura (deje en blanco para mantener el actual):",
      invoice.manifestNumber || ""
    );
    if (targetMf === null) return; // Abort if cancelled

    const mf = targetMf.trim().toUpperCase() || invoice.manifestNumber || '';

    setReturningPkgs(true);
    try {
      const {
        doc: fsDoc,
        writeBatch: fsWriteBatch,
        arrayUnion,
      } = await import('firebase/firestore');
      const { db: fsDb } = await import('@/lib/firebase/index');
      const { syncPackagesToSmartWeb } = await import('@/lib/services/sync-smartweb-service');

      const now = new Date().toISOString();
      const batch = fsWriteBatch(fsDb);

      // Add a status history entry to the invoice to record this return
      const invoiceUpdates: Record<string, any> = {
        statusHistory: arrayUnion({
          status: invoice.status,
          changedAt: now,
          changedBy: 'consolidation-manifests-manual',
          note: mf !== invoice.manifestNumber
            ? `Paquetes devueltos y re-asignados al manifiesto ${mf}.`
            : 'Paquetes movidos a estado devuelto por administración.',
        }),
      };

      if (mf) {
        invoiceUpdates.manifestNumber = mf;
        invoiceUpdates.manifestNumbers = [mf];
      }

      batch.update(fsDoc(fsDb, 'invoices', invoice.id), invoiceUpdates);

      // Find packages linked to this invoice
      const invoiceTrackings = new Set(
        items.map(it => (it.trackingNumber || '').toUpperCase()).filter(Boolean)
      );
      const pkgsToReturn = matchedPackages.filter(
        p => invoiceTrackings.has(p.trackingNumber.toUpperCase())
      );

      for (const pkg of pkgsToReturn) {
        batch.update(fsDoc(fsDb, 'packages', pkg.id), {
          status: 'returned',
          deliveryStatus: 'returned',
          returnedAt: now,
          returnReason: 'Devolución manual por administración',
          manifestId: mf,
          manifestNumber: mf,
          updatedManifest: mf,
          statusHistory: arrayUnion({
            status: 'returned',
            changedAt: now,
            changedBy: 'invoice-manual-return',
            note: mf !== invoice.manifestNumber
              ? `Paquete movido a devuelto y re-asignado al manifiesto ${mf} mediante acción en factura ${invoice.invoiceNumber || invoice.id}`
              : `Paquete movido a devuelto mediante acción en factura ${invoice.invoiceNumber || invoice.id}`,
          }),
        });
      }

      await batch.commit();

      // Sync updated packages to SmartWeb
      const sp2Pkgs = pkgsToReturn
        .filter(p => p.trackingNumber)
        .map(p => ({
          id:             p.id,
          trackingNumber: p.trackingNumber,
          slCode:         p.slCode || customerSlCode || '',
          customerName:   p.customerName ?? customerName ?? '',
          status:         'returned',
          weight:         p.weight,
          description:    p.description,
          ruta:           p.ruta ?? '',
          manifestNumber: mf,
          forceSync:      true,
          allowCreate:    true,
        }));
      if (sp2Pkgs.length > 0) {
        syncPackagesToSmartWeb(sp2Pkgs).catch(err =>
          console.warn('[handleReturnPackages] SP2 package sync failed:', err)
        );
      }

      toast({
        title: 'Paquetes devueltos',
        description: `Los ${pkgsToReturn.length} paquetes de la factura ${invoice.invoiceNumber || invoice.id} fueron marcados como "Devueltos".`,
      });
      onReconciled?.();
    } catch (err) {
      toast({
        title: 'Error al devolver paquetes',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setReturningPkgs(false);
    }
  }, [returningPkgs, invStatus, invoice, items, matchedPackages, customerSlCode, customerName, toast, onReconciled]);

  const handleAnnulDraft = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (annulling || invStatus !== 'draft') return;
    setAnnulling(true);
    try {
      const {
        doc: fsDoc,
        writeBatch: fsWriteBatch,
        arrayUnion,
        deleteField,
      } = await import('firebase/firestore');
      const { db: fsDb } = await import('@/lib/firebase/index');

      const now = new Date().toISOString();
      const batch = fsWriteBatch(fsDb);

      // 1. Mark invoice as annulled
      batch.update(fsDoc(fsDb, 'invoices', invoice.id), {
        status: 'annulled',
        annulledAt: now,
        statusHistory: arrayUnion({
          status: 'annulled',
          changedAt: now,
          changedBy: 'consolidation-manifests-manual',
        }),
      });

      // 2. Reset each package that belongs to this invoice and move it to transitory consolidation
      const invoiceTrackings = new Set(
        items.map(it => (it.trackingNumber || '').toUpperCase()).filter(Boolean)
      );
      const pkgsToReset = matchedPackages.filter(
        p => invoiceTrackings.has(p.trackingNumber.toUpperCase())
      );

      const TRANSITORIA = 'consolidacion_transitoria';

      for (const pkg of pkgsToReset) {
        const currentManifest = (pkg as any).manifestNumber || (pkg as any).manifiesto || '';
        batch.update(fsDoc(fsDb, 'packages', pkg.id), {
          // Clear invoice links — package is now "uninvoiced" again
          invoiceId: deleteField(),
          invoiceNumber: deleteField(),
          invoiceStatus: deleteField(),
          // Reset to consolidated so it appears in the uninvoiced pool
          status: 'consolidated',
          // Preserve original manifest for audit trail (never overwrite)
          ...(!pkg.originalManifestID && currentManifest && currentManifest !== TRANSITORIA
            ? { originalManifestId: currentManifest, originalManifestID: currentManifest }
            : {}),
          // Move to transitory consolidation manifest automatically
          manifestId:        TRANSITORIA,
          manifestNumber:    TRANSITORIA,
          updatedManifest:   TRANSITORIA,
          manifestUpdatedAt: now,
          consolidacion:     true,
          smartwebSyncSource: 'transitoria',
          // Flag: this package came from an annulled invoice
          annulledInvoiceId: invoice.id,
          annulledInvoiceNumber: invoice.invoiceNumber,
          annulledAt: now,
          ...(!pkg.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
          smartwebSynced: false,
          statusHistory: arrayUnion({
            status: 'consolidated',
            changedAt: now,
            changedBy: 'invoice-annulled',
            note: `Factura ${invoice.invoiceNumber} anulada — paquete desvinculado y movido a consolidación transitoria`,
          }),
        });
      }

      await batch.commit();

      // Fire-and-forget SP2 invoice deletion
      deleteInvoiceFromSp2(invoice.id, invoice.invoiceNumber).catch(err =>
        console.warn('[handleAnnulDraft] SP2 deletion failed:', err)
      );

      // Sync updated packages to SP2 (SmartWeb)
      const sp2Pkgs = pkgsToReset
        .filter(p => p.trackingNumber)
        .map(p => ({
          id:             p.id,
          trackingNumber: p.trackingNumber,
          slCode:         p.slCode || customerSlCode || '',
          customerName:   p.customerName ?? customerName ?? '',
          status:         'consolidated',
          weight:         p.weight,
          description:    p.description,
          ruta:           p.ruta ?? '',
          manifestNumber: TRANSITORIA,
          forceSync:      true,
          allowCreate:    true,
        }));
      if (sp2Pkgs.length > 0) {
        syncPackagesToSmartWeb(sp2Pkgs).catch(err =>
          console.warn('[handleAnnulDraft] SP2 package sync failed:', err)
        );
      }

      toast({
        title: 'Factura anulada',
        description: `${invoice.invoiceNumber} anulada · ${pkgsToReset.length} paquete(s) movidos a Consolidación Transitoria.`,
      });
      onReconciled?.();
    } catch (err) {
      toast({
        title: 'Error al anular',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setAnnulling(false);
    }
  }, [annulling, invStatus, invoice.id, invoice.invoiceNumber, items, matchedPackages, customerSlCode, customerName, toast, onReconciled]);
  const isAnnulledOrCancelled = invStatus === 'annulled' || invStatus === 'cancelled' || invStatus === 'void';
  const isOld = isOlderThanDays(invoice as any, 30);
  /**
   * Read-only mode: annulled/cancelled invoices OR invoices older than 30 days.
   * In this mode only the soft-delete (recycle bin) action is available.
   * All bulk actions, checkboxes, carry-on, and status-change buttons are hidden.
   */
  const isReadOnlyMode = isAnnulledOrCancelled || isOld;
  /** Items draggable only for active, non-protected invoices (NOT for read-only/annulled) */
  const itemsDraggable = !NON_DRAGGABLE_INVOICE_STATUSES.has(invStatus) && !isProtected && !isReadOnlyMode;

  /**
   * Trackings in this annulled invoice that have NO coverage in any active invoice.
   * These are the items eligible for rescue-drag to a draft invoice.
   */
  const rescuableTrackings = isReadOnlyMode
    ? new Set(
        items
          .map(i => i.trackingNumber?.toUpperCase())
          .filter((tn): tn is string => Boolean(tn) && !activeTrackings?.has(tn))
      )
    : new Set<string>();
  const hasRescuable = rescuableTrackings.size > 0;

  const totalWeight = items.reduce((s, it) => s + (it.weight || it.realWeight || 0), 0);
  const trackings = items.map(it => it.trackingNumber).filter(Boolean) as string[];

  /**
   * Packages linked to this invoice that are NOT yet in a terminal status —
   * these are "stuck" and can be bulk-delivered.
   */
  /** Soft-delete: mark the invoice as deleted (recycle bin) without hard-deleting it. */
  const handleSoftDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingSoft || !invoice.id) return;
    setDeletingSoft(true);
    try {
      const { doc: fsDoc, updateDoc: fsUpdate } = await import('firebase/firestore');
      const { db: fsDb } = await import('@/lib/firebase/index');
      await fsUpdate(fsDoc(fsDb, 'invoices', invoice.id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: 'consolidation-admin',
      });
      setSoftDeleted(true);
      toast({
        title: 'Factura eliminada',
        description: `${invoice.invoiceNumber} movida al basurero de reciclaje.`,
      });
    } catch (err) {
      toast({
        title: 'Error al eliminar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setDeletingSoft(false);
    }
  }, [deletingSoft, invoice.id, invoice.invoiceNumber, toast]);

  // ── Des-anular (Reactivar) ────────────────────────────────────────────
  const [reactivating, setReactivating] = useState(false);

  const handleReactivate = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (reactivating || !invoice.id) return;
    setReactivating(true);
    try {
      const { doc: fsDoc, updateDoc: fsUpdate, arrayUnion } = await import('firebase/firestore');
      const { db: fsDb } = await import('@/lib/firebase/index');
      await fsUpdate(fsDoc(fsDb, 'invoices', invoice.id), {
        status: 'draft',
        reactivatedAt: new Date().toISOString(),
        reactivatedBy: 'consolidation-admin',
        statusHistory: arrayUnion({
          status: 'draft',
          changedAt: new Date().toISOString(),
          changedBy: 'consolidation-admin',
          note: `Reactivada desde estado: ${invoice.status}`,
        }),
      });
      toast({
        title: 'Factura reactivada',
        description: `${invoice.invoiceNumber} restaurada a Borrador. Puedes editarla nuevamente.`,
      });
      onReconciled?.();
    } catch (err) {
      toast({
        title: 'Error al reactivar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setReactivating(false);
    }
  }, [reactivating, invoice.id, invoice.invoiceNumber, invoice.status, toast, onReconciled]);

  const stalePackages = matchedPackages.filter(
    p => items.some(it => (it.trackingNumber || '').toUpperCase() === p.trackingNumber.toUpperCase())
      && !TERMINAL_PKG_STATUSES.has((p.status || '').toLowerCase()),
  );

  /**
   * Stale packages that have been manually moved between manifests.
   * These require explicit admin confirmation before bulk-delivering.
   */
  const reassignedStalePackages = stalePackages.filter(p => p.isReassigned);
  const hasReassignedStale = reassignedStalePackages.length > 0;

  // "Entregado + Paid" is only relevant for active invoices (not read-only/annulled/old).
  const hasStale = stalePackages.length > 0 && !isReadOnlyMode;

  // ── Checkbox helpers — disabled in read-only mode ──────────────────────────
  // Bulk-select is only available for active invoices with non-read-only status.
  // For annulled/old invoices the checkboxes and bulk-move UI are hidden entirely.
  const annulledItemTrackings: string[] = []; // always empty → checkboxes never render

  const toggleItemSelect = (tracking: string) => {
    setSelectedTrackings(prev => {
      const next = new Set(prev);
      next.has(tracking) ? next.delete(tracking) : next.add(tracking);
      return next;
    });
  };

  const allSelected = annulledItemTrackings.length > 0 &&
    annulledItemTrackings.every(t => selectedTrackings.has(t));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedTrackings(new Set());
    } else {
      setSelectedTrackings(new Set(annulledItemTrackings));
    }
  };

  /** Move selected (or all) packages from this annulled invoice to consolidacion_transitoria */
  const handleMoveSelectedToTransitoria = useCallback(async () => {
    const trackingsToMove = Array.from(selectedTrackings).filter(Boolean);
    if (!trackingsToMove.length || movingToTransitoria) return;

    const pkgsToMove = matchedPackages.filter(p =>
      trackingsToMove.some(t => t.toUpperCase() === p.trackingNumber.toUpperCase()),
    );

    setMovingToTransitoria(true);
    try {
      const now = new Date().toISOString();
      const TRANSITORIA = 'consolidacion_transitoria';
      const batch = writeBatch(db);
      pkgsToMove.forEach(p => {
        const currentMf = (p as any).manifestNumber || (p as any).manifiesto || '';
        batch.update(doc(db, 'packages', p.id), {
          // GAP-1 FIX: was `!p.id` (always false). Correctly guard originalManifestID
          // so we only stamp it once — never overwrite if the package already has one.
          ...(!((p as any).originalManifestID) && currentMf && currentMf !== TRANSITORIA
            ? { originalManifestId: currentMf, originalManifestID: currentMf }
            : {}),
          manifestId:        TRANSITORIA,
          manifestNumber:    TRANSITORIA,
          updatedManifest:   TRANSITORIA,
          manifestUpdatedAt: now,
          consolidacion:     true,
          status:            'consolidated',
           // GAP-2 FIX: clear stale invoiceId, invoiceNumber, and invoiceStatus so the package
           // correctly appears as un-invoiced in transitoria. Without this the package
           // remains locked / invisible to the active invoice pool.
           invoiceId:         deleteField(),
           invoiceNumber:     deleteField(),
           invoiceStatus:     deleteField(),
           smartwebSynced:    false,
           smartwebSyncSource: 'transitoria',
        });
      });
      await batch.commit();

      // Fire-and-forget SP2 sync
      const sp2Pkgs = pkgsToMove
        .filter(p => p.trackingNumber)
        .map(p => ({
          id:             p.id,
          trackingNumber: p.trackingNumber,
          slCode:         p.slCode || customerSlCode || '',
          customerName:   p.customerName ?? customerName ?? '',
          status:         'consolidated',
          weight:         p.weight,
          description:    p.description,
          ruta:           p.ruta ?? '',
          manifestNumber: TRANSITORIA,
          forceSync:      true,
          allowCreate:    true,
        }));
      if (sp2Pkgs.length > 0) {
        syncPackagesToSmartWeb(sp2Pkgs).catch(err =>
          console.warn('[InvoiceRow] transitoria SP2 sync failed:', err),
        );
      }

      toast({
        title: 'Movidos a Consolidación Transitoria',
        description: `${pkgsToMove.length} paquete(s) transferidos correctamente.`,
      });
      setSelectedTrackings(new Set());
      onMovedToTransitoria?.();
      onReconciled?.();
    } catch (err) {
      toast({
        title: 'Error al mover',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setMovingToTransitoria(false);
    }
  }, [selectedTrackings, movingToTransitoria, matchedPackages, customerSlCode, customerName, toast, onMovedToTransitoria, onReconciled]);

  // -- Item drag handler --
  const handleItemDragStart = useCallback((e: React.DragEvent, item: typeof items[0]) => {
    if (!itemsDraggable || !manifestNumber || !customerSlCode) return;

    const pkg = matchedPackages.find(
      p => p.trackingNumber.toUpperCase() === (item.trackingNumber || '').toUpperCase()
    );

    const payload: PackageDragPayload = {
      packageId: pkg?.id || item.trackingNumber || '',
      trackingNumber: item.trackingNumber || '',
      sourceManifest: manifestNumber,
      slCode: customerSlCode,
      customerName: customerName || customerSlCode,
      sourceInvoiceId: invoice.id,
      invoiceStatus: invoice.status,
      weight: item.weight || item.realWeight,
      description: item.description,
    };

    e.dataTransfer.setData(PACKAGE_DND_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  }, [itemsDraggable, manifestNumber, customerSlCode, customerName, invoice, matchedPackages]);

  // ── Rescue drag: orphaned items in annulled invoice ───────────────────────────
  const handleRescueDragStart = useCallback((e: React.DragEvent, item: typeof items[0]) => {
    if (!item.trackingNumber || !manifestNumber || !customerSlCode) return;
    const pkg = matchedPackages.find(
      p => p.trackingNumber.toUpperCase() === (item.trackingNumber || '').toUpperCase()
    );
    const payload: PackageDragPayload = {
      packageId: pkg?.id || item.trackingNumber || '',
      trackingNumber: item.trackingNumber || '',
      sourceManifest: manifestNumber,
      slCode: customerSlCode,
      customerName: customerName || customerSlCode,
      sourceInvoiceId: invoice.id,
      invoiceStatus: invoice.status,
      weight: item.weight || item.realWeight,
      description: item.description,
      isRescue: true,
      itemPrice: item.totalPrice,
      invoiceItem: item as Record<string, unknown>,
    };
    e.dataTransfer.setData(PACKAGE_DND_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  }, [manifestNumber, customerSlCode, customerName, invoice, matchedPackages]);

  // ── Rescue drop zone handlers (active invoice rows only) ─────────────────────
  const handleRescueDragOver = useCallback((e: React.DragEvent) => {
    if (!onRescueItemDrop || isReadOnlyMode) return;
    if (e.dataTransfer.types.includes(PACKAGE_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragOverRescue(true);
    }
  }, [onRescueItemDrop, isReadOnlyMode]);

  const handleRescueDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOverRescue(false);
    }
  }, []);

  const handleRescueDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRescue(false);
    if (!onRescueItemDrop || isReadOnlyMode) return;
    const raw = e.dataTransfer.getData(PACKAGE_DND_TYPE);
    if (!raw) return;
    try {
      const payload: PackageDragPayload = JSON.parse(raw);
      if (!payload.isRescue) return; // only handle rescue drags
      onRescueItemDrop(invoice.id, payload);
    } catch { /* ignore malformed payload */ }
  }, [onRescueItemDrop, isReadOnlyMode, invoice.id]);

  /** Bulk mark all stale packages as delivered + fire SP2 sync */
  const handleBulkDeliver = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasStale || delivering) return;

    // ── Safety guard: packages moved across manifests ─────────────────────────
    // If any stale package has been reassigned, require explicit confirmation
    // before proceeding. This prevents accidental state changes when the admin
    // is unsure whether the package was actually delivered or just moved.
    if (hasReassignedStale && !confirmedReassigned) {
      setConfirmedReassigned(true); // show the confirmation UI — second click confirms
      toast({
        title: '⚠ Paquetes movidos entre manifiestos',
        description:
          `${reassignedStalePackages.length} paquete(s) fueron reasignados entre manifiestos. ` +
          'Verifica que realmente fueron entregados antes de continuar. Haz clic de nuevo para confirmar.',
        variant: 'destructive',
      });
      return;
    }

    setDelivering(true);
    try {
      const ids = stalePackages.map(p => p.id);

      // 1. Mark packages as delivered in Firestore
      await firebaseApi.packages.bulkUpdateStatus(ids, 'delivered', {
        notes: `Marcado como entregado desde factura ${invoice.invoiceNumber} — reconciliacion manual`,
      });

      // 2. Mark invoice as paid in Firestore (if not already)
      if (invoice.id && invStatus !== 'paid') {
        const { doc: fsDoc, updateDoc: fsUpdate, arrayUnion } = await import('firebase/firestore');
        const { db: fsDb } = await import('@/lib/firebase/index');
        await fsUpdate(fsDoc(fsDb, 'invoices', invoice.id), {
          status: 'paid',
          paidAt: new Date().toISOString(),
          statusHistory: arrayUnion({
            status: 'paid',
            changedAt: new Date().toISOString(),
            changedBy: 'consolidation-reconciliation',
          }),
        });
      }

      // 3. Fire-and-forget: sync packages to SP2
      syncPackagesToSmartWeb(
        stalePackages.map(p => ({
          id:             p.id,
          trackingNumber: p.trackingNumber,
          slCode:         p.slCode,
          customerName:   p.customerName ?? customerName ?? '',
          status:         'delivered',
          weight:         p.weight,
          description:    p.description,
          ruta:           p.ruta ?? '',
          forceSync:      true,
        })),
      ).catch(err => console.warn('[InvoiceRow] SP2 pkg sync failed:', err));

      // 4. Push invoice status 'paid' to SP2
      if (invoice.id && invoice.invoiceNumber) {
        pushStatusToSp2(invoice.id, invoice.invoiceNumber, 'paid')
          .catch(err => console.warn('[InvoiceRow] SP2 invoice sync failed:', err));
      }

      toast({
        title: 'Entregado y Pagado',
        description: `${ids.length} paquete(s) → entregados · Factura → pagada · Sync SP2 en progreso`,
      });

      setConfirmedReassigned(false); // reset confirmation state
      onReconciled?.();
    } catch (err) {
      toast({
        title: 'Error al actualizar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setDelivering(false);
    }
  }, [hasStale, delivering, stalePackages, invoice, invStatus, customerName, toast, onReconciled]);

  // Hide immediately after soft-delete — Firestore will remove it on next snapshot anyway
  if (softDeleted) return null;

  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        isProtected ? 'border-border/50 bg-muted/30' : 'border-border bg-card',
        // Rescue drop zone highlight — only when a rescue drag is hovering over an active invoice
        dragOverRescue && 'ring-2 ring-emerald-400/70 border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20',
      )}
      onDragOver={!isReadOnlyMode ? handleRescueDragOver : undefined}
      onDragLeave={!isReadOnlyMode ? handleRescueDragLeave : undefined}
      onDrop={!isReadOnlyMode ? handleRescueDrop : undefined}
    >
      {/* Header row */}
      {/* Header — div[role=button] so action chips (span[role=button]) inside don't
           trigger the nested-<button> DOM violation. flex-wrap lets chips move to
           a second line on narrow / mobile screens instead of overlapping. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded(!expanded)}
        className="w-full flex flex-wrap items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors rounded-lg cursor-pointer select-none"
        aria-expanded={expanded}
        aria-label={`Factura ${invoice.invoiceNumber}`}
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
        }

        <FileText className="h-3.5 w-3.5 text-primary/60 shrink-0" aria-hidden />

        <span className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
          {invoice.invoiceNumber || 'Sin numero'}
          {invoice.invoiceNumber && <CopyButton value={invoice.invoiceNumber} label="Copiar factura" />}
        </span>

        <Badge className={cn('text-[10px] h-5 px-1.5 shrink-0', statusInfo.className)}>
          {statusInfo.label}
        </Badge>

        {/* Lock indicator for non-draggable invoices */}
        {NON_DRAGGABLE_INVOICE_STATUSES.has(invStatus) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" aria-hidden />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
            >
              <p className="text-xs text-slate-700 dark:text-slate-300">Factura {statusInfo.label.toLowerCase()} - paquetes bloqueados</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── "Paquetes movidos" summary badge (visible while collapsed) ── */}
        {reassignedPackagesCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold border border-amber-400 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded shrink-0 cursor-help">
                <MoveRight className="h-2.5 w-2.5" aria-hidden />
                {reassignedPackagesCount} movido{reassignedPackagesCount > 1 ? 's' : ''}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Paquetes reasignados entre manifiestos</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                {reassignedPackagesCount} paquete(s) de esta factura fueron movidos a otro manifiesto.
                Expande para ver el detalle y destino de cada uno.
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Anular borrador — only for ACTIVE draft invoices ── */}
        {invStatus === 'draft' && !isReadOnlyMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-disabled={annulling}
                onClick={handleAnnulDraft}
                onKeyDown={(e) => !annulling && e.key === 'Enter' && handleAnnulDraft(e as any)}
                aria-label={`Anular factura borrador ${invoice.invoiceNumber}`}
                className={cn(
                  'inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-semibold',
                  'border transition-colors cursor-pointer select-none shrink-0',
                  'border-red-300 text-red-600 bg-red-50 hover:bg-red-100',
                  'dark:bg-red-950/20 dark:border-red-700/60 dark:text-red-400 dark:hover:bg-red-950/40',
                  annulling && 'opacity-50 pointer-events-none',
                )}
              >
                {annulling
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  : <Ban className="h-2.5 w-2.5" aria-hidden />
                }
                {annulling ? 'Anulando...' : 'Anular'}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Anular factura borrador</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Marca la factura como anulada y libera los paquetes para re-facturar.
                El manifiesto original se conserva para auditoría.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        {/* ── Devolver Paquetes — only for active draft or sent invoices ── */}
        {routeReturnsEnabled && (invStatus === 'draft' || invStatus === 'sent') && !isReadOnlyMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-disabled={returningPkgs}
                onClick={handleReturnPackages}
                onKeyDown={(e) => !returningPkgs && e.key === 'Enter' && handleReturnPackages(e as any)}
                aria-label={`Devolver paquetes de factura ${invoice.invoiceNumber}`}
                className={cn(
                  'inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-semibold',
                  'border transition-colors cursor-pointer select-none shrink-0',
                  'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100',
                  'dark:bg-amber-950/20 dark:border-amber-700/60 dark:text-amber-400 dark:hover:bg-amber-950/40',
                  returningPkgs && 'opacity-50 pointer-events-none',
                )}
              >
                {returningPkgs
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  : <Undo2 className="h-2.5 w-2.5" aria-hidden />
                }
                {returningPkgs ? 'Devolviendo...' : 'Devolver Paquetes'}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Devolver Paquetes</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Marca todos los paquetes de esta factura como "Devueltos" (returned) sin anular la factura.
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Des-anular: only for facturas genuinely annulled/cancelled, NOT just old ── */}
        {isAnnulledOrCancelled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-disabled={reactivating}
                onClick={handleReactivate}
                onKeyDown={(e) => !reactivating && e.key === 'Enter' && handleReactivate(e as any)}
                aria-label={`Reactivar factura ${invoice.invoiceNumber}`}
                className={cn(
                  'inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-semibold',
                  'border transition-colors cursor-pointer select-none shrink-0',
                  'border-emerald-500/50 text-emerald-700 bg-emerald-50 hover:bg-emerald-100',
                  'dark:bg-emerald-950/20 dark:border-emerald-600/40 dark:text-emerald-400 dark:hover:bg-emerald-950/40',
                  reactivating && 'opacity-50 pointer-events-none',
                )}
              >
                {reactivating
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  : <RotateCcw className="h-2.5 w-2.5" aria-hidden />
                }
                {reactivating ? 'Reactivando...' : 'Des-anular'}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Reactivar como Borrador</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                Restaura la factura al estado <strong>Borrador</strong> para editarla nuevamente.
                El historial de cambios queda registrado.
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Soft-delete: shown for read-only invoices (annulled/cancelled/void or >30 days) ── */}
        {isReadOnlyMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-disabled={deletingSoft}
                onClick={handleSoftDelete}
                onKeyDown={(e) => !deletingSoft && e.key === 'Enter' && handleSoftDelete(e as any)}
                aria-label={`Eliminar factura ${invoice.invoiceNumber}`}
                className={cn(
                  'inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-semibold',
                  'border transition-colors cursor-pointer select-none shrink-0',
                  'border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/10',
                  'dark:bg-destructive/10 dark:border-destructive/40 dark:hover:bg-destructive/20',
                  deletingSoft && 'opacity-50 pointer-events-none',
                )}
              >
                {deletingSoft
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  : <Trash2 className="h-2.5 w-2.5" aria-hidden />
                }
                {deletingSoft ? 'Eliminando...' : 'Eliminar'}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
            >
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Enviar al basurero de reciclaje</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                La factura anulada se marca como eliminada y desaparece de la vista.
                Puedes recuperarla desde el historial de facturas.
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Bulk deliver + mark paid button ─────────────────────────── */}
        {hasStale && (
          <div onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleBulkDeliver}
                  onKeyDown={(e) => e.key === 'Enter' && handleBulkDeliver(e as any)}
                  aria-label="Marcar paquetes como entregados y factura como pagada"
                  className={cn(
                    'inline-flex items-center gap-1 h-5 px-2 rounded text-[10px] font-semibold',
                    'border transition-colors cursor-pointer select-none',
                    confirmedReassigned && hasReassignedStale
                      ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/20 dark:border-red-600 dark:text-red-400 animate-pulse'
                      : delivering
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400 pointer-events-none'
                        : 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-700/60 dark:text-emerald-400 dark:hover:bg-emerald-950/40',
                  )}
                >
                  {delivering
                    ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    : confirmedReassigned && hasReassignedStale
                      ? <ShieldAlert className="h-3 w-3" aria-hidden />
                      : <CheckCheck className="h-3 w-3" aria-hidden />
                  }
                  {delivering
                    ? 'Procesando...'
                    : confirmedReassigned && hasReassignedStale
                      ? '⚠ Confirmar Entregado'
                      : 'Entregado + Paid'
                  }
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
              >
                <p className="text-xs font-semibold mb-1 text-slate-900 dark:text-slate-100">
                  {confirmedReassigned && hasReassignedStale
                    ? '⚠ Segunda confirmación requerida'
                    : 'Marcar entregado y factura pagada'
                  }
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {stalePackages.length} paquete(s) → <strong>entregados</strong> · Factura → <strong>paid</strong> · Sync SP2 automático.
                </p>
                {hasReassignedStale && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    ⚠ {reassignedStalePackages.length} paquete(s) fueron reasignados entre manifiestos.
                    Verifica que realmente fueron entregados antes de confirmar.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Package className="h-3 w-3" aria-hidden />
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Scale className="h-3 w-3" aria-hidden />
            {totalWeight.toFixed(2)} kg
          </span>
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <DollarSign className="h-3 w-3" aria-hidden />
            {invoice.totalAmount.toFixed(2)} {invoice.currency}
          </span>
        </div>
      </div>

      {/* ── Reassigned packages warning strip — below header, above table ── */}
      {hasStale && hasReassignedStale && !confirmedReassigned && (
        <div className="flex items-center gap-1.5 px-4 py-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20 border-t border-amber-200/60 dark:border-amber-800/30">
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          <span>
            {reassignedStalePackages.length} paquete(s) movido(s) entre manifiestos — verifica antes de confirmar entrega.
          </span>
        </div>
      )}

      {/* ── Reassigned confirmation strip — shown after first click ── */}
      {hasStale && hasReassignedStale && confirmedReassigned && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-800/40">
          <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
          <span className="flex-1">
            <strong>Confirmar:</strong>{' '}
            {reassignedStalePackages.length} paquete(s) se movieron entre manifiestos:{' '}
            <span className="font-mono">
              {reassignedStalePackages.map(p =>
                p.updatedManifest
                  ? `${p.trackingNumber} (→ ${p.updatedManifest === 'consolidacion_transitoria' ? 'Transitoria' : p.updatedManifest})`
                  : p.trackingNumber
              ).join(', ')}
            </span>
            {' '}¿Confirmas que están entregados?
          </span>
          {/* Cancel — resets the two-step confirmation so the operator can bail out */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirmedReassigned(false); }}
            className="ml-auto shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:bg-red-950/30 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
            aria-label="Cancelar confirmación de entregado"
          >
            <X className="h-2.5 w-2.5" />
            Cancelar
          </button>
        </div>
      )}


      {/* Expanded: items table */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border/50">
                    {itemsDraggable && <th className="w-6" aria-hidden />}
                    {isAnnulledOrCancelled && (
                      <th className="w-6 py-1.5 pl-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Seleccionar todos"
                          className="h-3.5 w-3.5"
                        />
                      </th>
                    )}
                    <th className="text-left py-1.5 px-2 font-medium">Tracking</th>
                    <th className="text-left py-1.5 px-2 font-medium">Estado</th>
                    <th className="text-left py-1.5 px-2 font-medium">Descripcion</th>
                    <th className="text-right py-1.5 px-2 font-medium">Peso</th>
                    <th className="text-right py-1.5 px-2 font-medium">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const pkg = matchedPackages.find(
                      p => p.trackingNumber.toUpperCase() === (item.trackingNumber || '').toUpperCase()
                    );
                    const isStale = pkg && !TERMINAL_PKG_STATUSES.has((pkg.status || '').toLowerCase());
                    const tn = (item.trackingNumber || '').toUpperCase();
                    const isRescuable = rescuableTrackings.has(tn);
                    const isDraggableRow = itemsDraggable || isRescuable;
                    return (
                      <tr
                        key={idx}
                        draggable={isDraggableRow}
                        onDragStart={
                          itemsDraggable
                            ? (e) => handleItemDragStart(e, item)
                            : isRescuable
                              ? (e) => handleRescueDragStart(e, item)
                              : undefined
                        }
                        className={cn(
                          'border-b border-border/30 last:border-0 transition-all',
                          itemsDraggable
                            ? 'hover:bg-primary/5 cursor-grab active:cursor-grabbing'
                            : isRescuable
                              ? 'hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 cursor-grab active:cursor-grabbing'
                              : 'hover:bg-muted/20',
                          isStale && 'bg-orange-50/40 dark:bg-orange-950/10',
                          isRescuable && 'bg-emerald-50/30 dark:bg-emerald-950/10',
                          isAnnulledOrCancelled && item.trackingNumber && selectedTrackings.has(item.trackingNumber)
                            && 'bg-primary/5 ring-1 ring-primary/20',
                        )}
                      >
                        {itemsDraggable && (
                          <td className="py-1.5 pl-1">
                            <GripVertical className="h-3 w-3 text-muted-foreground/30" aria-hidden />
                          </td>
                        )}
                        {isAnnulledOrCancelled && (
                          <td className="py-1.5 pl-2" onClick={e => e.stopPropagation()}>
                            {item.trackingNumber ? (
                              <Checkbox
                                checked={selectedTrackings.has(item.trackingNumber)}
                                onCheckedChange={() => toggleItemSelect(item.trackingNumber!)}
                                aria-label={`Seleccionar ${item.trackingNumber}`}
                                className="h-3.5 w-3.5"
                              />
                            ) : null}
                          </td>
                        )}
                        <td className="py-1.5 px-2 font-mono text-[11px]">
                          {/* ── Tracking number — red pill when it matches the search query ── */}
                          {(() => {
                            const tn = item.trackingNumber || '';
                            const isMatch =
                              highlightQuery.length > 0 &&
                              tn.toLowerCase().includes(highlightQuery);
                            return (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded px-1',
                                  isMatch &&
                                    'bg-red-500 text-white font-bold ring-2 ring-red-400 animate-pulse',
                                )}
                                title={isMatch ? `Tracking encontrado: ${tn}` : undefined}
                              >
                                {tn || '—'}
                                {tn && <CopyButton value={tn} label="Copiar tracking" />}
                                {tn && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTraceTracking(tn || null);
                                        }}
                                        className={cn(
                                          'inline-flex items-center justify-center h-4 w-4 rounded transition-colors',
                                          isMatch
                                            ? 'text-white/80 hover:text-white hover:bg-red-400/30'
                                            : 'text-muted-foreground/60 hover:text-primary hover:bg-primary/10',
                                          !pkg && !isMatch && 'text-amber-600',
                                        )}
                                        aria-label="Trace del paquete"
                                      >
                                        <Search className="h-2.5 w-2.5" aria-hidden />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="text-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
                                    >
                                      {isMatch
                                        ? '🔴 Tracking encontrado por búsqueda — Trace: ver historial completo'
                                        : 'Trace: ver historial completo del paquete'}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            );
                          })()}

                          {/* ── "Movido" badge with destination manifest ── */}
                          {pkg?.isReassigned && (() => {
                            const dest = pkg.updatedManifest || pkg.manifestNumber || null;
                            const isTransit = dest === 'consolidacion_transitoria';
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'ml-1.5 text-[9px] h-4 px-1 cursor-help',
                                      isTransit
                                        ? 'border-purple-400 text-purple-600 dark:text-purple-400'
                                        : 'border-amber-400 text-amber-600 dark:text-amber-400',
                                    )}
                                  >
                                    ↗ Movido
                                    {dest && (
                                      <span className="ml-0.5 opacity-80">
                                        → {isTransit ? 'Transitoria' : dest}
                                      </span>
                                    )}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="text-xs max-w-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
                                >
                                  <p className="font-semibold text-slate-900 dark:text-slate-100">Paquete reasignado manualmente</p>
                                  {dest && (
                                    <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                                      Destino actual:{' '}
                                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                        {isTransit ? 'Consolidación Transitoria' : dest}
                                      </span>
                                    </p>
                                  )}
                                  {pkg.manifestUpdatedAt && (
                                    <p className="mt-0.5 text-slate-500 dark:text-slate-500">
                                      Movido el {new Date(pkg.manifestUpdatedAt).toLocaleDateString('es-CR', {
                                        day: '2-digit', month: 'short', year: 'numeric',
                                        timeZone: 'America/Costa_Rica'
                                      })}
                                    </p>
                                  )}
                                  <p className="mt-1 text-amber-600 dark:text-amber-400 font-medium">
                                    ⚠ Verifica si la factura aún corresponde a este paquete.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 px-2">
                         {pkg ? (
                            <PackageStatusBadge status={pkg.status || ''} />
                          ) : (() => {
                            // No package doc found – derive status from invoice item or invoice
                            const derivedStatus =
                              (item as any).status ||
                              (invoice.status?.toLowerCase() === 'annulled'  ? 'annulled'  :
                               invoice.status?.toLowerCase() === 'paid'      ? 'delivered' :
                               invoice.status?.toLowerCase() === 'sent'      ? 'in_transit':
                               invoice.status?.toLowerCase() === 'draft'     ? 'pending'   : null);

                            return derivedStatus ? (
                              <PackageStatusBadge status={derivedStatus} />
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none whitespace-nowrap bg-slate-100 text-slate-500 border border-slate-200 cursor-help">
                                    Sin reg.
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="max-w-xs text-xs bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
                                >
                                  Este tracking no tiene documento de paquete asociado — puede haber sido reasignado o eliminado.
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[200px]">
                          {item.description || pkg?.description || '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {(item.realWeight ?? item.weight ?? 0).toFixed(2)} kg
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                          ${(item.totalPrice || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">
              Sin items en esta factura.
            </p>
          )}

          {/* Actions row: carry-on — only for active (non-read-only) invoices */}
          {!isProtected && !isReadOnlyMode && trackings.length > 0 && onCarryOn && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/30">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCarryOn(invoice.id, trackings);
                    }}
                  >
                    <ArrowRightLeft className="h-3 w-3" aria-hidden />
                    Carry-On
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-white text-slate-900 border border-slate-200 shadow-md dark:bg-slate-950 dark:text-slate-50 dark:border-slate-800"
                >
                  <p className="text-xs">Mover paquetes a otro manifiesto</p>
                </TooltipContent>
              </Tooltip>

              {itemsDraggable && (
                <span className="text-[9px] text-muted-foreground/60 ml-1">
                  o arrastra items individuales
                </span>
              )}
            </div>
          )}

        </div>
      )}

      <PackageTraceDialog
        open={!!traceTracking}
        onOpenChange={(o) => { if (!o) setTraceTracking(null); }}
        tracking={traceTracking}
      />
    </div>
  );
}
