/**
 * KanbanBulkActions
 *
 * Floating action bar that appears when packages are selected in the Kanban board.
 * Provides bulk status update with clear labels explaining side-effects.
 *
 * ── Status Transitions ──────────────────────────────────────────────────────────
 *   received    → Package marked as received at Miami warehouse
 *   transit     → Package in transit to Costa Rica
 *   customs     → Package being processed at customs
 *   consolidated→ Package consolidated for final delivery
 *   route       → Package assigned to delivery route
 *   delivered   → Package delivered + related invoices marked as paid
 *   returned    → Package returned to sender
 *
 * ── Side-Effects ────────────────────────────────────────────────────────────────
 *   - Uses `slBulkUpdatePackageStatus` which triggers server-side SP2 sync
 *   - When status = 'delivered', associated invoices are also marked as 'paid'
 *   - All updates are real-time (Firestore onSnapshot will propagate changes)
 */

import React, { useState } from 'react';
import {
  Package,
  XCircle,
  Loader2,
  PackageCheck,
  Plane,
  Landmark,
  Layers,
  Truck,
  CheckCircle2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { firebaseApi } from '@/lib/firebase/callable';

/** Available statuses for bulk update in consolidation context — Lucide icons only */
const BULK_STATUS_OPTIONS = [
  { value: 'received',     label: 'Recibido',     Icon: PackageCheck,  color: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',       desc: 'Marcar como recibido en bodega' },
  { value: 'transit',      label: 'En Tránsito',  Icon: Plane,         color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800', desc: 'En camino a Costa Rica' },
  { value: 'customs',      label: 'Aduana',        Icon: Landmark,      color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',     desc: 'Procesando en aduana CR' },
  { value: 'consolidated', label: 'Consolidado',   Icon: Layers,        color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800', desc: 'Listo para consolidación' },
  { value: 'route',        label: 'En Ruta',       Icon: Truck,         color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',       desc: 'Asignado a ruta de entrega' },
  { value: 'delivered',    label: 'Entregado',     Icon: CheckCircle2,  color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',   desc: 'Entregado + factura → pagada' },
  { value: 'returned',     label: 'Devuelto',      Icon: Undo2,         color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',         desc: 'Devuelto al remitente' },
] as const;

interface KanbanBulkActionsProps {
  selectedPackageIds: Set<string>;
  /** Map of packageId → invoiceIds for marking invoices paid on delivery */
  packageInvoiceMap: Map<string, string[]>;
  onClearSelection: () => void;
  /** Called after a successful bulk update to refresh data */
  onUpdateComplete: () => void;
}

export function KanbanBulkActions({
  selectedPackageIds,
  packageInvoiceMap,
  onClearSelection,
  onUpdateComplete,
}: KanbanBulkActionsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const count = selectedPackageIds.size;
  if (count === 0) return null;

  const handleBulkUpdate = async (status: string) => {
    if (loading) return;
    setLoading(true);
    setSelectedStatus(status);

    try {
      const ids = Array.from(selectedPackageIds);

      // 1. Bulk update package statuses (triggers SP2 sync on server side)
      const result = await firebaseApi.packages.bulkUpdateStatus(ids, status);

      if (!result.success) {
        throw new Error(result.error || 'Error al actualizar paquetes');
      }

      // 2. If marking as delivered, also mark associated invoices as paid
      if (status === 'delivered') {
        const invoiceIdsToMark = new Set<string>();
        for (const pkgId of ids) {
          const invIds = packageInvoiceMap.get(pkgId) || [];
          invIds.forEach(id => invoiceIdsToMark.add(id));
        }

        if (invoiceIdsToMark.size > 0) {
          const invoiceResults = await Promise.allSettled(
            Array.from(invoiceIdsToMark).map(invId =>
              firebaseApi.invoices.markPaid(invId, 'consolidation_delivery')
            )
          );
          const invoiceFailed = invoiceResults.filter(r => r.status === 'rejected').length;
          if (invoiceFailed > 0) {
            toast({
              title: 'Advertencia',
              description: `${invoiceFailed} factura(s) no se pudieron marcar como pagadas`,
              variant: 'default',
            });
          }
        }
      }

      const statusLabel = BULK_STATUS_OPTIONS.find(o => o.value === status)?.label || status;
      toast({
        title: 'Actualización exitosa',
        description: `${result.data?.updated ?? ids.length} paquete(s) → ${statusLabel}`,
        variant: 'default',
      });

      onClearSelection();
      onUpdateComplete();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error al actualizar',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setSelectedStatus(null);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="bg-background/95 backdrop-blur-lg border border-border rounded-xl shadow-2xl px-4 py-3 max-w-[90vw]">
        {/* Header row */}
        <div className="flex items-center gap-3 mb-2.5">
          <div className="flex items-center gap-1.5">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">
              {count} paquete{count !== 1 ? 's' : ''} seleccionado{count !== 1 ? 's' : ''}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
            onClick={onClearSelection}
            disabled={loading}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Limpiar
          </Button>
        </div>

        {/* Status buttons — all Lucide icons, no emojis */}
        <div className="flex flex-wrap gap-1.5">
          {BULK_STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleBulkUpdate(opt.value)}
              disabled={loading}
              title={opt.desc}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all',
                'hover:scale-105 hover:shadow-md active:scale-95',
                opt.color,
                loading && selectedStatus === opt.value && 'opacity-60',
                loading && selectedStatus !== opt.value && 'opacity-40 cursor-not-allowed'
              )}
            >
              {loading && selectedStatus === opt.value ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <opt.Icon className="h-3 w-3" aria-hidden />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
