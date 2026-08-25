import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, FileText, Package, ArrowRightLeft, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { removeManyFromConsolidation, syncConsolidationGroupToManifest } from '@/lib/services/manifest-consolidation-service';
import { useToast } from '@/hooks/use-toast';
import { ManifestBadge } from './ManifestBadge';
import { PackageRow } from './PackageRow';
import { BulkMoveDialog } from './BulkMoveDialog';
import type { ManifestGroup as ManifestGroupType, ConsolidationInvoice } from './types';

interface InvoiceChipProps {
  invoice: ConsolidationInvoice;
}
function InvoiceChip({ invoice }: InvoiceChipProps) {
  const statusColors: Record<string, string> = {
    draft:    'bg-muted text-muted-foreground border-border',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    sent:     'bg-blue-50 text-blue-700 border-blue-200',
    paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    overdue:  'bg-red-50 text-red-700 border-red-200',
    cancelled:'bg-muted text-muted-foreground/60 border-border line-through',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border',
      statusColors[invoice.status] ?? 'bg-muted text-muted-foreground border-border'
    )}>
      <FileText className="h-3 w-3" aria-hidden />
      <span className="font-mono">{invoice.invoiceNumber}</span>
      <span className="opacity-60">·</span>
      <span className="tabular-nums">${invoice.totalAmount.toFixed(2)}</span>
    </span>
  );
}

interface ManifestGroupProps {
  group: ManifestGroupType;
  allManifestNumbers: string[];
  defaultOpen?: boolean;
  onPackageMoved: (pkgId: string, newManifest: string) => void;
  onPackageRemoved?: (pkgId: string) => void;
}

export function ManifestGroup({
  group,
  allManifestNumbers,
  defaultOpen = true,
  onPackageMoved,
  onPackageRemoved,
}: ManifestGroupProps) {
  const { toast } = useToast();
  const [open, setOpen]                 = useState(defaultOpen);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [completing, setCompleting]     = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [syncing, setSyncing]           = useState(false);

  const handleSyncNova = useCallback(async () => {
    setSyncing(true);
    try {
      const added = await syncConsolidationGroupToManifest(
        group.manifestNumber,
        group.packages.map(p => ({
          tracking:    p.trackingNumber || p.id,
          slCode:      p.slCode,
          customerName: p.customerName || '',
          weight:      p.weight      ?? 0,
          price:       p.price       ?? 0,
          description: p.description || '',
          permisos:    p.requiresPermit ?? false,
        })),
      );
      if (added > 0) {
        toast({
          title: 'Sincronizado con Nova',
          description: `${added} paquete${added !== 1 ? 's' : ''} añadido${added !== 1 ? 's' : ''} al manifiesto ${group.manifestNumber} en Nova.`,
        });
      } else {
        toast({ title: 'Nova ya está actualizado', description: 'No hay paquetes pendientes de sincronizar.' });
      }
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [group.manifestNumber, group.packages, toast]);

  const handleComplete = useCallback(async () => {
    if (!confirmComplete) { setConfirmComplete(true); return; }
    setCompleting(true);
    try {
      const trackings = group.packages.map(p => p.trackingNumber || p.id).filter(Boolean);
      await removeManyFromConsolidation(trackings);
      toast({
        title: 'Manifiesto completado',
        description: `${trackings.length} paquete${trackings.length !== 1 ? 's' : ''} eliminado${trackings.length !== 1 ? 's' : ''} del manifiesto de consolidación.`,
      });
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setCompleting(false);
      setConfirmComplete(false);
    }
  }, [group.packages, confirmComplete, toast]);

  const togglePackage = useCallback((pkgId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(pkgId) ? next.delete(pkgId) : next.add(pkgId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev =>
      prev.size === group.packages.length
        ? new Set()
        : new Set(group.packages.map(p => p.id))
    );
  }, [group.packages]);

  const selectedPackages = group.packages.filter(p => selectedIds.has(p.id));
  const allSelected = group.packages.length > 0 && selectedIds.size === group.packages.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const reassignedCount  = group.packages.filter(p => p.isReassigned).length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Manifest header */}
      {/* Header row: select-all checkbox + expand toggle */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-3',
        'bg-muted/30 border-b border-border'
      )}>
        {/* Select-all checkbox */}
        {group.packages.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            aria-label={allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            aria-pressed={allSelected}
            className={cn(
              'shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
              allSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : someSelected
                  ? 'border-primary/60 bg-primary/20'
                  : 'border-muted-foreground/40 bg-background hover:border-primary/60'
            )}
          >
            {allSelected && (
              <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current" aria-hidden>
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {someSelected && !allSelected && (
              <span className="block h-0.5 w-2 bg-primary rounded" aria-hidden />
            )}
          </button>
        )}

        {/* Sincronizar con Nova */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleSyncNova(); }}
          disabled={syncing || group.packages.length === 0}
          title="Sincronizar paquetes con el manifiesto en Nova"
          aria-label="Sincronizar paquetes con Nova"
          className={cn(
            'shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors',
            'bg-sky-50 text-sky-700 border border-sky-300 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-700',
            (syncing || group.packages.length === 0) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {syncing
            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            : <RefreshCw className="h-3 w-3" aria-hidden />}
          <span className="hidden sm:inline">Sync Nova</span>
        </button>

        {/* Completado button — outside the expand toggle */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleComplete(); }}
          onBlur={() => setConfirmComplete(false)}
          disabled={completing || group.packages.length === 0}
          aria-label={confirmComplete ? 'Confirmar completado' : 'Marcar manifiesto como completado'}
          className={cn(
            'shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors',
            confirmComplete
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700',
            (completing || group.packages.length === 0) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {completing
            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            : <CheckCheck className="h-3 w-3" aria-hidden />}
          {confirmComplete ? '¿Confirmar?' : 'Completado'}
        </button>

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-3 text-left transition-colors hover:opacity-80"
          aria-expanded={open}
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          }

          <ManifestBadge manifestNumber={group.manifestNumber} />

          {/* Package count */}
          {group.packages.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Package className="h-3 w-3" aria-hidden />
              {group.packages.length} paquete{group.packages.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Invoice count */}
          {group.invoices.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <FileText className="h-3 w-3" aria-hidden />
              {group.invoices.length} factura{group.invoices.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Reassigned indicator */}
          {reassignedCount > 0 && (
            <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700">
              {reassignedCount} reasignado{reassignedCount !== 1 ? 's' : ''}
            </span>
          )}
        </button>
      </div>

      {/* Body */}
      {open && (
        <div className="px-4 py-3 space-y-3 bg-background">
          {/* Invoices row */}
          {group.invoices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {group.invoices.map(inv => (
                <InvoiceChip key={inv.id} invoice={inv} />
              ))}
            </div>
          )}

          {/* Bulk action toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-1 py-1.5 rounded-lg border border-primary/30 bg-primary/5">
              <span className="text-[11px] font-medium text-primary pl-1">
                {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => setBulkDialogOpen(true)}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <ArrowRightLeft className="h-3 w-3" aria-hidden />
                Mover seleccionados
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 rounded transition-colors"
                aria-label="Limpiar selección"
              >
                Limpiar
              </button>
            </div>
          )}

          {/* Package rows */}
          {group.packages.length > 0 ? (
            <div className="space-y-1.5" role="table" aria-label={`Paquetes del manifiesto ${group.manifestNumber}`}>
              {group.packages.map(pkg => (
                <PackageRow
                  key={pkg.id}
                  pkg={pkg}
                  allManifestNumbers={allManifestNumbers}
                  onMoved={onPackageMoved}
                  selected={selectedIds.has(pkg.id)}
                  onToggleSelect={togglePackage}
                  onRemove={onPackageRemoved}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Sin paquetes en este manifiesto.</p>
          )}

          {/* Bulk Move Dialog */}
          {bulkDialogOpen && selectedPackages.length > 0 && (
            <BulkMoveDialog
              packages={selectedPackages}
              currentManifest={group.manifestNumber}
              availableManifestNumbers={allManifestNumbers}
              onClose={() => setBulkDialogOpen(false)}
              onMoved={(newMf) => {
                setBulkDialogOpen(false);
                setSelectedIds(new Set());
                selectedPackages.forEach(p => onPackageMoved(p.id, newMf));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
