/**
 * KanbanBoard — Manifest-Based Drag & Drop Board
 *
 * Jira-style Kanban board where:
 *   - Each COLUMN = a manifest (ordered newest → oldest)
 *   - Within each column = customer groups with their packages/invoices
 *   - Drag packages between columns to trigger carry-on operations
 *
 * ── Data Integrity Rules ────────────────────────────────────────────────────────
 *
 *   - Only packages with isPackageDraggable() === true can be dragged
 *   - Cross-type drops (DANP ↔ normal) are blocked at validation time
 *   - Drop triggers the CarryOnDialog for confirmation — no silent writes
 *   - Package state is NEVER modified directly — always via the carry-on service
 *
 * ── Layout ──────────────────────────────────────────────────────────────────────
 *
 *   Desktop/iPad: Horizontal scrollable columns (min-width: 320px each)
 *   Mobile: Stacked vertical via overflow-x-auto
 *
 * ── File Structure ──────────────────────────────────────────────────────────────
 *
 *   KanbanBoard.tsx          ← this file (board layout + DnD orchestration)
 *   KanbanCustomerCard.tsx   ← customer card within a column
 *   KanbanPackageItem.tsx    ← individual draggable package row
 *   InvoiceStatusDot.tsx     ← shared invoice status indicator
 *   manifest-utils.ts        ← manifest type detection + compatibility
 */

import React, { useMemo, useCallback, useState } from 'react';
import { Archive, Layers, Shield } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  isPermitManifest,
  areManifestsCompatible,
} from './manifest-utils';
import { TRANSITORIA_MANIFEST } from './normalize-manifest';
import { KanbanCustomerCard, type KanbanCustomerGroup } from './KanbanCustomerCard';
import { KanbanBulkActions } from './KanbanBulkActions';
import {
  isPackageDraggable,
  PACKAGE_DND_TYPE,
  type ConsolidationPackage,
  type ConsolidationInvoice,
  type CustomerSection,
  type PackageDragPayload,
} from './types';
import type { ComplianceResult } from '@/lib/services/consolidation-rules-service';

// ── Column type ───────────────────────────────────────────────────────────────

export interface KanbanColumn {
  manifestNumber: string;
  isPermit: boolean;
  customerGroups: KanbanCustomerGroup[];
  totalPackages: number;
  totalInvoices: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  /** Filtered customer sections from the parent */
  customerSections: CustomerSection[];
  /** Compliance results by slCode */
  complianceMap: Map<string, ComplianceResult>;
  /** Grace period days for uninvoiced diagnostics */
  gracePeriodDays: number;
  /** Handler when a package is dropped on a different manifest column */
  onPackageDrop: (payload: PackageDragPayload, targetManifest: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract date from manifest number for sorting (newest first) */
function parseManifestDate(manifest: string): number {
  const match = manifest.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return 0;
  const [, dd, mm, yyyy] = match;
  return new Date(`${yyyy}-${mm}-${dd}`).getTime();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KanbanBoard({
  customerSections,
  complianceMap,
  gracePeriodDays,
  onPackageDrop,
}: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [dragOverManifest, setDragOverManifest] = useState<string | null>(null);
  const [dragSourceManifest, setDragSourceManifest] = useState<string | null>(null);

  // ── Package selection state (for bulk updates) ────────────────────────────
  const [selectedPackageIds, setSelectedPackageIds] = useState<Set<string>>(new Set());
  // ── Card expansion state ──────────────────────────────────────────────────
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(['__all__']));

  const togglePackage = useCallback((packageId: string) => {
    setSelectedPackageIds(prev => {
      const next = new Set(prev);
      if (next.has(packageId)) next.delete(packageId);
      else next.add(packageId);
      return next;
    });
  }, []);

  const toggleAllInCard = useCallback((packageIds: string[], selected: boolean) => {
    setSelectedPackageIds(prev => {
      const next = new Set(prev);
      for (const id of packageIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPackageIds(new Set());
  }, []);

  const handleBulkUpdateComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['packages'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  }, [queryClient]);

  /** Build a map: packageId → [invoiceIds] for marking invoices paid on delivery */
  const packageInvoiceMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const section of customerSections) {
      for (const group of section.manifestGroups) {
        for (const inv of group.invoices) {
          for (const item of inv.invoiceItems || []) {
            if (item.trackingNumber) {
              // Find the package with this tracking
              const pkg = group.packages.find(
                p => p.trackingNumber.toUpperCase() === item.trackingNumber.toUpperCase()
              );
              if (pkg) {
                const arr = map.get(pkg.id) || [];
                arr.push(inv.id);
                map.set(pkg.id, arr);
              }
            }
          }
        }
      }
    }
    return map;
  }, [customerSections]);

  // ── Card expansion helpers ─────────────────────────────────────────────────
  const isCardExpanded = useCallback((key: string) => {
    return expandedCards.has('__all__') || expandedCards.has(key);
  }, [expandedCards]);

  const toggleCardExpanded = useCallback((key: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      // If __all__ is set, switch to per-card mode
      if (next.has('__all__')) {
        next.delete('__all__');
        // Expand all existing cards except the toggled one
        // (we don't enumerate all here — we default to expanded)
        next.add(key); // toggle it back off below
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Build columns ──────────────────────────────────────────────────────────
  //
  // Cognitive load optimization:
  //   1. Exclude terminal packages (delivered/processed/returned/pickup)
  //      and paid/sent invoices — they're locked and not actionable
  //   2. Only include customers who have actionable packages across 2+ manifests
  //   3. Omit customer cards and columns with 0 actionable packages
  //
  const columns = useMemo((): KanbanColumn[] => {
    /** Terminal package statuses — not draggable */
    const TERMINAL_STATUSES = new Set(['delivered', 'processed', 'returned', 'pickup']);
    /** Invoice statuses that lock packages */
    const LOCKED_INVOICE_STATUSES = new Set(['sent', 'paid', 'overdue']);

    /** Filter packages to only actionable ones */
    const filterActionable = (packages: ConsolidationPackage[]) =>
      packages.filter(p => {
        const status = (p.status || '').toLowerCase();
        if (TERMINAL_STATUSES.has(status)) return false;
        const invStatus = (p.invoiceStatus || '').toLowerCase();
        if (LOCKED_INVOICE_STATUSES.has(invStatus)) return false;
        return true;
      });

    /** Filter invoices to only non-paid/non-sent */
    const filterActionableInvoices = (invoices: ConsolidationInvoice[]) =>
      invoices.filter(inv => {
        const status = (inv.status || '').toLowerCase();
        return !LOCKED_INVOICE_STATUSES.has(status);
      });

    // ── Step 1: Always build the Transitoria column ───────────────────────────
    // All customers in Transitoria are shown regardless of multi-manifest rule.
    const transitoriaCol: KanbanColumn = {
      manifestNumber: TRANSITORIA_MANIFEST,
      isPermit: false,
      customerGroups: [],
      totalPackages: 0,
      totalInvoices: 0,
    };

    for (const section of customerSections) {
      for (const group of section.manifestGroups) {
        if (group.manifestNumber !== TRANSITORIA_MANIFEST) continue;
        const actionablePackages = filterActionable(group.packages);
        const actionableInvoices = filterActionableInvoices(group.invoices);
        if (actionablePackages.length === 0 && actionableInvoices.length === 0) continue;
        transitoriaCol.customerGroups.push({
          customer: section.customer,
          packages: actionablePackages,
          invoices: actionableInvoices,
        });
        transitoriaCol.totalPackages += actionablePackages.length;
        transitoriaCol.totalInvoices += actionableInvoices.length;
      }
    }

    // ── Step 2: Build regular manifest columns (multi-manifest filter applies) ─
    const customerManifestCount = new Map<string, Set<string>>();
    for (const section of customerSections) {
      const manifestsWithPkgs = section.manifestGroups
        .filter(g => g.manifestNumber !== TRANSITORIA_MANIFEST && filterActionable(g.packages).length > 0)
        .map(g => g.manifestNumber);
      if (manifestsWithPkgs.length > 0) {
        customerManifestCount.set(section.customer.slCode, new Set(manifestsWithPkgs));
      }
    }

    const multiManifestCustomers = new Set(
      [...customerManifestCount.entries()]
        .filter(([, manifests]) => manifests.size >= 2)
        .map(([slCode]) => slCode)
    );

    const regularColMap = new Map<string, KanbanColumn>();

    for (const section of customerSections) {
      if (!multiManifestCustomers.has(section.customer.slCode)) continue;
      for (const group of section.manifestGroups) {
        if (group.manifestNumber === TRANSITORIA_MANIFEST) continue;
        const actionablePackages = filterActionable(group.packages);
        const actionableInvoices = filterActionableInvoices(group.invoices);
        if (actionablePackages.length === 0) continue;

        if (!regularColMap.has(group.manifestNumber)) {
          regularColMap.set(group.manifestNumber, {
            manifestNumber: group.manifestNumber,
            isPermit: isPermitManifest(group.manifestNumber),
            customerGroups: [],
            totalPackages: 0,
            totalInvoices: 0,
          });
        }
        const col = regularColMap.get(group.manifestNumber)!;
        col.customerGroups.push({
          customer: section.customer,
          packages: actionablePackages,
          invoices: actionableInvoices,
        });
        col.totalPackages += actionablePackages.length;
        col.totalInvoices += actionableInvoices.length;
      }
    }

    // Step 3: Keep only the 3 most recent regular manifests
    const top3Regular = Array.from(regularColMap.values())
      .filter(col => col.totalPackages > 0)
      .sort((a, b) => {
        const dateA = parseManifestDate(a.manifestNumber);
        const dateB = parseManifestDate(b.manifestNumber);
        if (dateB !== dateA) return dateB - dateA;
        return b.manifestNumber.localeCompare(a.manifestNumber);
      })
      .slice(0, 3);

    // Step 4: Transitoria always first, then regular columns
    return [transitoriaCol, ...top3Regular];
  }, [customerSections]);

  // ── DnD: drag start ────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (
      e: React.DragEvent,
      pkg: ConsolidationPackage,
      group: KanbanCustomerGroup,
      manifestNumber: string
    ) => {
      const payload: PackageDragPayload = {
        packageId: pkg.id,
        trackingNumber: pkg.trackingNumber,
        sourceManifest: manifestNumber,
        slCode: pkg.slCode,
        customerName: group.customer.fullName,
        sourceInvoiceId: pkg.invoiceId,
        invoiceStatus: pkg.invoiceStatus,
        weight: pkg.weight,
        description: pkg.description,
      };
      e.dataTransfer.setData(PACKAGE_DND_TYPE, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
      setDragSourceManifest(manifestNumber);
    },
    []
  );

  // ── DnD: column drag over ──────────────────────────────────────────────────
  const handleColumnDragOver = useCallback(
    (e: React.DragEvent, manifestNumber: string) => {
      if (dragSourceManifest && !areManifestsCompatible(dragSourceManifest, manifestNumber)) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      if (dragSourceManifest === manifestNumber) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverManifest(manifestNumber);
    },
    [dragSourceManifest]
  );

  const handleColumnDragLeave = useCallback(() => {
    setDragOverManifest(null);
  }, []);

  // ── DnD: column drop ──────────────────────────────────────────────────────
  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetManifest: string) => {
      e.preventDefault();
      setDragOverManifest(null);
      setDragSourceManifest(null);

      const raw = e.dataTransfer.getData(PACKAGE_DND_TYPE);
      if (!raw) return;

      try {
        const payload: PackageDragPayload = JSON.parse(raw);
        if (payload.sourceManifest === targetManifest) return;
        if (!areManifestsCompatible(payload.sourceManifest, targetManifest)) return;
        onPackageDrop(payload, targetManifest);
      } catch {
        // Invalid payload — ignore
      }
    },
    [onPackageDrop]
  );

  const handleDragEnd = useCallback(() => {
    setDragOverManifest(null);
    setDragSourceManifest(null);
  }, []);

  // columns always has at least the Transitoria column — no empty-state needed here

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className="flex gap-4 p-4 h-full min-w-min"
          style={{ minHeight: 'calc(100vh - 220px)' }}
        >
          {columns.map(col => {
            const isDropTarget = dragOverManifest === col.manifestNumber;
            const isSource = dragSourceManifest === col.manifestNumber;
            const isCompatible = dragSourceManifest
              ? areManifestsCompatible(dragSourceManifest, col.manifestNumber) && !isSource
              : false;

            return (
              <div
                key={col.manifestNumber}
                className={cn(
                  'flex flex-col rounded-xl border transition-all duration-200',
                  'w-[340px] min-w-[340px] max-w-[340px] shrink-0',
                  col.manifestNumber === TRANSITORIA_MANIFEST
                    ? 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-700/60 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.10),0_8px_32px_rgba(0,0,0,0.07)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3),0_4px_16px_rgba(0,0,0,0.25)]'
                    : 'bg-card/50',
                  isDropTarget && 'ring-2 ring-primary/60 bg-primary/5 border-primary/40',
                  isSource && 'opacity-60',
                  isCompatible && !isDropTarget && 'border-dashed border-primary/30',
                  !isCompatible && dragSourceManifest && !isSource && 'opacity-40 pointer-events-none',
                )}
                onDragOver={e => handleColumnDragOver(e, col.manifestNumber)}
                onDragLeave={handleColumnDragLeave}
                onDrop={e => handleColumnDrop(e, col.manifestNumber)}
              >
                {/* ── Column header ──────────────────────────────────────── */}
                <div
                  className={cn(
                    'px-3 py-2.5 border-b shrink-0 rounded-t-xl',
                    col.manifestNumber === TRANSITORIA_MANIFEST
                      ? 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-700/60 border-l-[3px] border-l-red-700 dark:border-l-red-600'
                      : col.isPermit
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40'
                        : 'bg-muted/30 border-border'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {(() => {
                        const colDraggableIds = col.customerGroups.flatMap(g =>
                          g.packages.filter(isPackageDraggable).map(p => p.id)
                        );
                        const colSelectedCount = colDraggableIds.filter(id => selectedPackageIds.has(id)).length;
                        const allColSelected = colDraggableIds.length > 0 && colSelectedCount === colDraggableIds.length;
                        const someColSelected = colSelectedCount > 0 && !allColSelected;
                        return (
                          <Checkbox
                            checked={allColSelected ? true : someColSelected ? 'indeterminate' : false}
                            onCheckedChange={() => toggleAllInCard(colDraggableIds, !allColSelected)}
                            className="shrink-0"
                            aria-label={`Seleccionar todos en ${col.manifestNumber}`}
                          />
                        );
                      })()}
                      {col.manifestNumber === TRANSITORIA_MANIFEST ? (
                        <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-700/25 dark:bg-red-500/30" />
                          <Archive className="h-3.5 w-3.5 text-red-700 dark:text-red-500 relative" aria-hidden />
                        </span>
                      ) : (
                        <Layers className="h-3.5 w-3.5 text-primary/70 shrink-0" aria-hidden />
                      )}
                      <span className={cn(
                        'text-xs font-bold truncate',
                        col.manifestNumber === TRANSITORIA_MANIFEST
                          ? 'text-red-700 dark:text-red-500 tracking-wide uppercase text-[10px]'
                          : 'font-mono'
                      )}>
                        {col.manifestNumber === TRANSITORIA_MANIFEST ? 'Consolidación Transitoria' : col.manifestNumber}
                      </span>
                      {col.isPermit && (
                        <Badge
                          variant="outline"
                          className="text-[8px] h-3.5 px-1 border-orange-300 text-orange-600 dark:text-orange-400 shrink-0"
                        >
                          <Shield className="h-2 w-2 mr-0.5" aria-hidden />
                          Permiso
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[9px] h-4 px-1.5 font-normal',
                          col.manifestNumber === TRANSITORIA_MANIFEST && col.totalPackages > 0
                            && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        )}
                      >
                        {col.totalPackages} paq
                      </Badge>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">
                        {col.customerGroups.length} cli
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* ── Column content (scrollable) ──────────────────────── */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {col.customerGroups.length === 0 && col.manifestNumber === TRANSITORIA_MANIFEST ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50">
                      <Archive className="h-7 w-7 opacity-30 text-red-700/40 dark:text-red-500/30" aria-hidden />
                      <p className="text-[11px] text-center leading-relaxed max-w-[200px]">
                        Sin paquetes en tránsito.<br />
                        Los paquetes sin manifiesto asignado aparecen aquí.
                      </p>
                    </div>
                  ) : (
                    col.customerGroups.map(group => {
                      const cardKey = `${col.manifestNumber}::${group.customer.slCode}`;
                      return (
                        <KanbanCustomerCard
                          key={group.customer.slCode}
                          group={group}
                          manifestNumber={col.manifestNumber}
                          selectedPackageIds={selectedPackageIds}
                          onTogglePackage={togglePackage}
                          onToggleAllInCard={toggleAllInCard}
                          expanded={isCardExpanded(cardKey)}
                          onToggleExpanded={() => toggleCardExpanded(cardKey)}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Floating bulk action bar ──────────────────────────────────── */}
      <KanbanBulkActions
        selectedPackageIds={selectedPackageIds}
        packageInvoiceMap={packageInvoiceMap}
        onClearSelection={clearSelection}
        onUpdateComplete={handleBulkUpdateComplete}
      />
    </div>
  );
}
