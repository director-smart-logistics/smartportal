/**
 * StatusUpdateModal
 *
 * Quick-edit dialog that lets warehouse operators update:
 *   – Package status  (received → delivered, etc.)
 *   – Invoice status  (draft → paid, annulled, etc.)
 *
 * Triggered from a PackageRow / ConsolidationCustomerCard action button.
 * Writes directly to Firestore.
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Package,
  FileText,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  TriangleAlert,
  Info,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';
import { pushStatusToSp2 } from '@/lib/services/sync-invoices-service';
import type { ConsolidationPackage } from './types';

// ── Package statuses ──────────────────────────────────────────────────────────
interface StatusOption {
  value: string;
  label: string;
  color: string;
  group: 'active' | 'terminal';
}

const PACKAGE_STATUSES: StatusOption[] = [
  // Active / transitory
  { value: 'received',       label: 'Recibido en Miami',     color: 'bg-cyan-100 text-cyan-700',    group: 'active'   },
  { value: 'transit',        label: 'En Tránsito a CR',      color: 'bg-indigo-100 text-indigo-700', group: 'active'   },
  { value: 'customs',        label: 'Procesando en Aduana',  color: 'bg-amber-100 text-amber-700',   group: 'active'   },
  { value: 'held',           label: 'Retenido en Aduana',    color: 'bg-orange-100 text-orange-700', group: 'active'   },
  { value: 'consolidated',   label: 'Consolidado',           color: 'bg-purple-100 text-purple-700', group: 'active'   },
  { value: 'pre-alerted',    label: 'Pre-Alertado',          color: 'bg-gray-100 text-gray-600',     group: 'active'   },
  { value: 'route',          label: 'En Ruta',               color: 'bg-blue-100 text-blue-700',     group: 'active'   },
  { value: 'processed',      label: 'Facturado',             color: 'bg-sky-100 text-sky-700',       group: 'active'   },
  // Terminal
  { value: 'delivered',      label: 'Entregado',             color: 'bg-green-100 text-green-700',   group: 'terminal' },
  { value: 'pickup',         label: 'Retira en SL',          color: 'bg-teal-100 text-teal-700',     group: 'terminal' },
  { value: 'returned',       label: 'Devuelto',              color: 'bg-red-100 text-red-700',       group: 'terminal' },
];

const INVOICE_STATUSES: StatusOption[] = [
  { value: 'draft',      label: 'Borrador',   color: 'bg-gray-100 text-gray-600',       group: 'active'   },
  { value: 'pending',    label: 'Pendiente',  color: 'bg-amber-100 text-amber-700',     group: 'active'   },
  { value: 'sent',       label: 'Enviada',    color: 'bg-blue-100 text-blue-700',       group: 'active'   },
  { value: 'paid',       label: 'Pagada',     color: 'bg-emerald-100 text-emerald-700', group: 'terminal' },
  { value: 'overdue',    label: 'Vencida',    color: 'bg-red-100 text-red-700',         group: 'active'   },
  { value: 'annulled',   label: 'Anulada',    color: 'bg-gray-200 text-gray-500',       group: 'terminal' },
  { value: 'cancelled',  label: 'Cancelada',  color: 'bg-gray-200 text-gray-500',       group: 'terminal' },
];

// ── Props ─────────────────────────────────────────────────────────────────────
export interface StatusUpdateModalProps {
  open: boolean;
  onClose: () => void;
  pkg: ConsolidationPackage;
  /** Called after a successful update so the parent can refresh */
  onUpdated?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusPill({ value, options }: { value?: string; options: StatusOption[] }) {
  const opt = options.find(o => o.value === value);
  if (!opt) return <span className="text-xs text-muted-foreground italic">{value || '—'}</span>;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', opt.color)}>
      {opt.label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StatusUpdateModal({ open, onClose, pkg, onUpdated }: StatusUpdateModalProps) {
  const { toast } = useToast();

  const [pkgStatus,     setPkgStatus]     = useState(pkg.status || '');
  const [invoiceStatus, setInvoiceStatus] = useState(pkg.invoiceStatus || '');
  const [saving, setSaving] = useState(false);

  // Keep local state in sync when props change (e.g. same modal reused)
  React.useEffect(() => {
    setPkgStatus(pkg.status || '');
    setInvoiceStatus(pkg.invoiceStatus || '');
  }, [pkg.id, pkg.status, pkg.invoiceStatus]);

  const hasPackageChange = pkgStatus !== (pkg.status || '');
  const hasInvoiceChange = invoiceStatus !== (pkg.invoiceStatus || '') && !!pkg.invoiceId;
  const hasAnyChange     = hasPackageChange || hasInvoiceChange;

  const handleSave = useCallback(async () => {
    if (!hasAnyChange) { onClose(); return; }
    setSaving(true);
    try {
      const batch: Promise<void>[] = [];

      // ── Update package status ─────────────────────────────────────────────
      if (hasPackageChange) {
        const pkgRef = doc(db, 'packages', pkg.id);
        batch.push(updateDoc(pkgRef, {
          status:    pkgStatus,
          updatedAt: serverTimestamp(),
        }));
      }

      // ── Update invoice status ─────────────────────────────────────────────
      if (hasInvoiceChange && pkg.invoiceId) {
        const invRef = doc(db, 'invoices', pkg.invoiceId);
        batch.push(updateDoc(invRef, {
          status:    invoiceStatus,
          updatedAt: serverTimestamp(),
        }));
      }

      await Promise.all(batch);

      // ── SP2 fire-and-forget syncs ─────────────────────────────────────────
      // Package status → SP2 shipments (forceSync=true bypasses regression guard
      // since this is an explicit manual override by the operator)
      if (hasPackageChange) {
        syncPackagesToSmartWeb([{
            id:             pkg.id,
            trackingNumber: pkg.trackingNumber,
            slCode:         pkg.slCode,
            customerName:   pkg.customerName ?? '',
            status:         pkgStatus,
            weight:         pkg.weight,
            description:    pkg.description,
            ruta:           pkg.ruta ?? '',
            forceSync:      true,
          }]).catch(e => console.warn('[StatusUpdateModal] SP2 pkg sync failed:', e));
      }

      // Invoice status → SP2 invoices collection
      if (hasInvoiceChange && pkg.invoiceId && pkg.invoiceNumber) {
        pushStatusToSp2(pkg.invoiceId, pkg.invoiceNumber, invoiceStatus)
          .catch(e => console.warn('[StatusUpdateModal] SP2 invoice sync failed:', e));
      }

      toast({
        title: 'Estado actualizado',
        description: [
          hasPackageChange && `Paquete → ${PACKAGE_STATUSES.find(s => s.value === pkgStatus)?.label ?? pkgStatus}`,
          hasInvoiceChange && `Factura → ${INVOICE_STATUSES.find(s => s.value === invoiceStatus)?.label ?? invoiceStatus}`,
        ].filter(Boolean).join(' · '),
      });

      onUpdated?.();
      onClose();
    } catch (err) {
      toast({ title: 'Error al guardar', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [hasAnyChange, hasPackageChange, hasInvoiceChange, pkg.id, pkg.invoiceId, pkgStatus, invoiceStatus, toast, onUpdated, onClose]);

  // ── Warn about terminal statuses ──────────────────────────────────────────
  const pkgIsTerminal = PACKAGE_STATUSES.find(s => s.value === pkgStatus)?.group === 'terminal';
  const invIsTerminal = INVOICE_STATUSES.find(s => s.value === invoiceStatus)?.group === 'terminal';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" aria-hidden />
            Actualizar estado
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground font-mono">
            {pkg.trackingNumber}
            {pkg.invoiceNumber && (
              <span className="ml-2 opacity-70">· Factura {pkg.invoiceNumber}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── Package status ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-semibold">
              <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Estado del paquete
            </Label>
            <div className="flex items-center gap-3">
              <StatusPill value={pkg.status} options={PACKAGE_STATUSES} />
              <span className="text-muted-foreground text-xs">→</span>
              <StatusPill value={pkgStatus} options={PACKAGE_STATUSES} />
            </div>
            <Select value={pkgStatus} onValueChange={setPkgStatus}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Seleccionar estado…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="" disabled className="text-muted-foreground italic text-xs">
                  — Sin cambio —
                </SelectItem>
                <SelectItem value="received">Recibido en Miami</SelectItem>
                <SelectItem value="transit">En Tránsito a CR</SelectItem>
                <SelectItem value="customs">Procesando en Aduana</SelectItem>
                <SelectItem value="held">Retenido en Aduana</SelectItem>
                <SelectItem value="consolidated">Consolidado</SelectItem>
                <SelectItem value="pre-alerted">Pre-Alertado</SelectItem>
                <SelectItem value="route">En Ruta</SelectItem>
                <SelectItem value="processed">Facturado</SelectItem>
                <SelectItem value="delivered">Entregado ✔</SelectItem>
                <SelectItem value="pickup">Retira en SL ✔</SelectItem>
                <SelectItem value="returned">Devuelto ✔</SelectItem>
              </SelectContent>
            </Select>
            {pkgIsTerminal && (
              <p className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <TriangleAlert className="h-3 w-3 shrink-0" />
                Este estado es terminal. El paquete quedará fuera del flujo activo.
              </p>
            )}
          </div>

          <Separator />

          {/* ── Invoice status ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Estado de la factura
              {!pkg.invoiceId && (
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(sin factura vinculada)</span>
              )}
            </Label>
            {pkg.invoiceId ? (
              <>
                <div className="flex items-center gap-3">
                  <StatusPill value={pkg.invoiceStatus} options={INVOICE_STATUSES} />
                  <span className="text-muted-foreground text-xs">→</span>
                  <StatusPill value={invoiceStatus} options={INVOICE_STATUSES} />
                </div>
                <Select value={invoiceStatus} onValueChange={setInvoiceStatus} disabled={!pkg.invoiceId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Seleccionar estado…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="pending">Pendiente de pago</SelectItem>
                    <SelectItem value="sent">Enviada al cliente</SelectItem>
                    <SelectItem value="paid">Pagada ✔</SelectItem>
                    <SelectItem value="overdue">Vencida</SelectItem>
                    <SelectItem value="annulled">Anulada</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
                {invIsTerminal && (
                  <p className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <TriangleAlert className="h-3 w-3 shrink-0" />
                    Este estado cambiará la factura {pkg.invoiceNumber} para todos sus paquetes.
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded px-2.5 py-2 border border-border/50">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Este paquete aún no tiene factura asignada.
              </p>
            )}
          </div>

          {/* ── No changes notice ──────────────────────────────────────── */}
          {!hasAnyChange && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded px-2.5 py-1.5 border border-border/50">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              Sin cambios pendientes.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasAnyChange || saving}
            className="min-w-[110px]"
          >
            {saving ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Guardando…</>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
