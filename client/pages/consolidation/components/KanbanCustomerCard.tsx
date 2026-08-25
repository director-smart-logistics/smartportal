/**
 * KanbanCustomerCard
 *
 * A customer group card within a Kanban manifest column.
 * Shows customer info (name, slCode, route, courier service),
 * invoice groups, and draggable package items.
 *
 * ── Layout ──────────────────────────────────────────────────────────────────────
 *   [☐ Customer Name]          [pkg count badge]
 *     SL1234 · Route Badge · Courier Badge
 *   ─────────────────────────────────────────
 *   📄 INV-2026-001  ● $47.00
 *     [☐] [grip] TBA123456  Recibido  0.45kg $10.00
 *     [☐] [grip] TBA789012  Tránsito  1.12kg $37.00
 *   ─────────────────────────────────────────
 *   📄 Sin factura (1)
 *     [☐] [grip] TBA456789  Consolidado  0.68kg
 *
 * ── Selection Model ─────────────────────────────────────────────────────────────
 *   - Customer header checkbox toggles ALL packages in this card
 *   - Individual package checkboxes toggle one package
 *   - Selection state is managed by the parent KanbanBoard via props
 *   - Selected packages enable the floating KanbanBulkActions bar
 */

import React, { useMemo, useCallback } from 'react';
import {
  MapPin,
  Truck,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getRouteColor } from '@/lib/utils/route-colors';
import { InvoiceStatusDot } from './InvoiceStatusDot';
import { KanbanPackageItem } from './KanbanPackageItem';
import {
  isPackageDraggable,
  PACKAGE_DND_TYPE,
  type ConsolidationPackage,
  type ConsolidationInvoice,
  type CustomerSection,
  type PackageDragPayload,
} from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KanbanCustomerGroup {
  customer: CustomerSection['customer'];
  packages: ConsolidationPackage[];
  invoices: ConsolidationInvoice[];
}

interface KanbanCustomerCardProps {
  group: KanbanCustomerGroup;
  manifestNumber: string;
  /** Set of selected package IDs (managed by parent) */
  selectedPackageIds: Set<string>;
  /** Toggle selection for one package */
  onTogglePackage: (packageId: string) => void;
  /** Toggle selection for all packages in this card */
  onToggleAllInCard: (packageIds: string[], selected: boolean) => void;
  /** Whether this card is expanded */
  expanded: boolean;
  /** Toggle expanded state */
  onToggleExpanded: () => void;
  onDragStart: (
    e: React.DragEvent,
    pkg: ConsolidationPackage,
    group: KanbanCustomerGroup,
    manifestNumber: string
  ) => void;
  onDragEnd: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KanbanCustomerCard({
  group,
  manifestNumber,
  selectedPackageIds,
  onTogglePackage,
  onToggleAllInCard,
  expanded,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
}: KanbanCustomerCardProps) {
  const { customer, packages, invoices } = group;

  // All draggable package IDs in this card
  const draggableIds = useMemo(
    () => packages.filter(isPackageDraggable).map(p => p.id),
    [packages]
  );

  // Selection state for header checkbox
  const selectedInCard = useMemo(
    () => draggableIds.filter(id => selectedPackageIds.has(id)).length,
    [draggableIds, selectedPackageIds]
  );
  const allSelected = draggableIds.length > 0 && selectedInCard === draggableIds.length;
  const someSelected = selectedInCard > 0 && !allSelected;

  /**
   * Group packages by their parent invoice.
   * Uninvoiced packages are collected into a separate "null invoice" group.
   */
  const invoiceGroups = useMemo(() => {
    const groups: Array<{
      invoice: ConsolidationInvoice | null;
      packages: ConsolidationPackage[];
    }> = [];

    // Build tracking → invoice lookup
    const trackingToInvoice = new Map<string, ConsolidationInvoice>();
    for (const inv of invoices) {
      for (const item of inv.invoiceItems || []) {
        if (item.trackingNumber) {
          trackingToInvoice.set(item.trackingNumber.toUpperCase(), inv);
        }
      }
    }

    // Partition packages by invoice
    const invoiceMap = new Map<string, ConsolidationPackage[]>();
    const uninvoiced: ConsolidationPackage[] = [];

    for (const pkg of packages) {
      const inv = trackingToInvoice.get(pkg.trackingNumber.toUpperCase());
      if (inv) {
        const arr = invoiceMap.get(inv.id) || [];
        arr.push(pkg);
        invoiceMap.set(inv.id, arr);
      } else {
        uninvoiced.push(pkg);
      }
    }

    for (const [invId, pkgs] of invoiceMap) {
      const inv = invoices.find(i => i.id === invId) || null;
      groups.push({ invoice: inv, packages: pkgs });
    }

    if (uninvoiced.length > 0) {
      groups.push({ invoice: null, packages: uninvoiced });
    }

    return groups;
  }, [packages, invoices]);

  const handlePkgDragStart = useCallback(
    (e: React.DragEvent, pkg: ConsolidationPackage) => {
      onDragStart(e, pkg, group, manifestNumber);
    },
    [onDragStart, group, manifestNumber]
  );

  const handleHeaderCheckboxChange = useCallback(() => {
    onToggleAllInCard(draggableIds, !allSelected);
  }, [draggableIds, allSelected, onToggleAllInCard]);

  return (
    <div className={cn(
      'rounded-lg border bg-card shadow-sm transition-all',
      selectedInCard > 0 && 'ring-1 ring-primary/30 border-primary/20'
    )}>
      {/* ── Customer header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        {/* Selection checkbox — replaces the old avatar icon */}
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={handleHeaderCheckboxChange}
          className="shrink-0"
          aria-label={`Seleccionar todos los paquetes de ${customer.fullName}`}
        />
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex-1 flex items-center gap-1.5 min-w-0 text-left hover:bg-muted/30 transition-colors rounded px-1 py-0.5"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold truncate">{customer.fullName}</div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-0.5 flex-wrap">
              <span className="font-mono">{customer.slCode}</span>
              {customer.ruta && (() => {
                const rc = getRouteColor(customer.ruta);
                return (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[8px] font-semibold border',
                      rc.bg, rc.border, rc.text
                    )}
                  >
                    <MapPin className="h-2 w-2 shrink-0" aria-hidden />
                    {customer.ruta}
                  </span>
                );
              })()}
              {customer.courierService && (() => {
                const rc = getRouteColor('Encomiendas');
                return (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[8px] font-semibold border',
                      rc.bg, rc.border, rc.text
                    )}
                  >
                    <Truck className="h-2 w-2 shrink-0" aria-hidden />
                    {customer.courierService}
                  </span>
                );
              })()}
            </div>
          </div>
        </button>
        <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">
          {packages.length}
        </Badge>
      </div>

      {/* ── Expanded: invoice groups + packages ────────────────────────── */}
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {invoiceGroups.map((ig, idx) => (
            <div key={ig.invoice?.id || `uninv-${idx}`} className="space-y-1">
              {/* Invoice label */}
              {ig.invoice ? (
                <div className="flex items-center gap-1.5 px-1 py-0.5">
                  <FileText className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />
                  <span className="text-[9px] font-medium text-muted-foreground truncate">
                    {ig.invoice.invoiceNumber}
                  </span>
                  <InvoiceStatusDot status={ig.invoice.status} size="xs" />
                  <span className="text-[9px] text-muted-foreground ml-auto">
                    ${ig.invoice.totalAmount.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-1 py-0.5">
                  <FileText className="h-2.5 w-2.5 text-amber-500" aria-hidden />
                  <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">
                    Sin factura ({ig.packages.length})
                  </span>
                </div>
              )}

              {/* Package items with checkboxes */}
              {ig.packages.map(pkg => {
                const isDraggable = isPackageDraggable(pkg);
                const isSelected = selectedPackageIds.has(pkg.id);

                return (
                  <div key={pkg.id} className="flex items-center gap-1">
                    {isDraggable && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onTogglePackage(pkg.id)}
                        className="shrink-0 h-3 w-3"
                        aria-label={`Seleccionar ${pkg.trackingNumber}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <KanbanPackageItem
                        pkg={pkg}
                        manifestNumber={manifestNumber}
                        customerName={customer.fullName}
                        onDragStart={e => handlePkgDragStart(e, pkg)}
                        onDragEnd={onDragEnd}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
