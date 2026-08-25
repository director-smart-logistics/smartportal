import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Layers, Package,
  User, FileText, ArrowRightLeft, CheckCheck, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { removeManyFromConsolidation } from '@/lib/services/manifest-consolidation-service';
import { useToast } from '@/hooks/use-toast';
import { ManifestBadge } from './ManifestBadge';
import { PackageRow } from './PackageRow';
import { BulkMoveDialog } from './BulkMoveDialog';
import type {
  ConsolidationCustomer,
  ConsolidationInvoice,
  ConsolidationPackage,
} from './types';

export interface ManifestCustomerGroup {
  customer: ConsolidationCustomer;
  packages: ConsolidationPackage[];
  invoices: ConsolidationInvoice[];
  /** All manifest numbers for this customer — limits the move-dialog list */
  customerManifestNumbers: string[];
}

interface InvoiceChipProps { invoice: ConsolidationInvoice }
function InvoiceChip({ invoice }: InvoiceChipProps) {
  const colors: Record<string, string> = {
    draft:    'bg-muted text-muted-foreground border-border',
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    sent:     'bg-blue-50 text-blue-700 border-blue-200',
    paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    overdue:  'bg-red-50 text-red-700 border-red-200',
    cancelled:'bg-muted text-muted-foreground/50 border-border line-through',
  };
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border',
      colors[invoice.status] ?? 'bg-muted text-muted-foreground border-border'
    )}>
      <FileText className="h-2.5 w-2.5 shrink-0" aria-hidden />
      <span className="font-mono">{invoice.invoiceNumber}</span>
      <span className="opacity-60">·</span>
      <span className="tabular-nums">${invoice.totalAmount.toFixed(2)}</span>
    </span>
  );
}

interface CustomerSubRowProps {
  group: ManifestCustomerGroup;
  manifestNumber: string;
  allManifestNumbers: string[];
  onPackageMoved: (pkgId: string, newManifest: string) => void;
  onPackageRemoved?: (pkgId: string) => void;
}
function CustomerSubRow({ group, manifestNumber, allManifestNumbers, onPackageMoved, onPackageRemoved }: CustomerSubRowProps) {
  const [open, setOpen]               = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen]       = useState(false);
  const { customer, packages, invoices } = group;

  const togglePackage = useCallback((pkgId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(pkgId) ? next.delete(pkgId) : next.add(pkgId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev =>
      prev.size === packages.length
        ? new Set()
        : new Set(packages.map(p => p.id))
    );
  }, [packages]);

  const selectedPackages = packages.filter(p => selectedIds.has(p.id));
  const allSelected = packages.length > 0 && selectedIds.size === packages.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className={cn(
        'flex items-center gap-2 px-3 py-2',
        'bg-muted/20',
        open && 'border-b border-border'
      )}>
        {/* Select-all checkbox */}
        {packages.length > 0 && (
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
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 text-left transition-colors hover:opacity-80"
          aria-expanded={open}
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          }
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          <span className="font-semibold text-xs text-foreground truncate flex-1">
            {customer.fullName?.toUpperCase()}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {customer.slCode}
          </span>
          {customer.ruta && (
            <span className="text-[10px] text-muted-foreground shrink-0">· {customer.ruta}</span>
          )}
          <span className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <Package className="h-3 w-3" aria-hidden />
            {packages.length}
          </span>
        </button>
      </div>

      {open && (
        <div className="px-3 py-2.5 space-y-2 bg-background">
          {invoices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {invoices.map(inv => <InvoiceChip key={inv.id} invoice={inv} />)}
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
                onClick={() => setBulkOpen(true)}
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

          {packages.length > 0 ? (
            <div className="space-y-1.5" role="table">
              {packages.map(pkg => (
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
            <p className="text-xs text-muted-foreground italic">Sin paquetes.</p>
          )}

          {bulkOpen && selectedPackages.length > 0 && (
            <BulkMoveDialog
              packages={selectedPackages}
              currentManifest={manifestNumber}
              availableManifestNumbers={allManifestNumbers}
              onClose={() => setBulkOpen(false)}
              onMoved={(newMf) => {
                setBulkOpen(false);
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

interface ManifestSectionCardProps {
  manifestNumber: string;
  customerGroups: ManifestCustomerGroup[];
  totalPackages: number;
  allManifestNumbers: string[];
  forceOpen?: boolean | null;
  onPackageMoved: (pkgId: string, newManifest: string) => void;
  onPackageRemoved?: (pkgId: string) => void;
}

export function ManifestSectionCard({
  manifestNumber,
  customerGroups,
  totalPackages,
  allManifestNumbers,
  forceOpen = null,
  onPackageMoved,
  onPackageRemoved,
}: ManifestSectionCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(true);
  const [completing, setCompleting]         = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  useEffect(() => {
    if (forceOpen !== null) setOpen(forceOpen);
  }, [forceOpen]);

  const handleComplete = useCallback(async () => {
    if (!confirmComplete) { setConfirmComplete(true); return; }
    setCompleting(true);
    try {
      const trackings = customerGroups
        .flatMap(g => g.packages.map(p => p.trackingNumber || p.id))
        .filter(Boolean);
      await removeManyFromConsolidation(trackings);
      toast({
        title: 'Manifiesto completado',
        description: `${trackings.length} paquete${trackings.length !== 1 ? 's' : ''} eliminado${trackings.length !== 1 ? 's' : ''} de consolidación.`,
      });
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setCompleting(false);
      setConfirmComplete(false);
    }
  }, [customerGroups, confirmComplete, toast]);

  const totalInvoices = customerGroups.reduce((s, g) => s + g.invoices.length, 0);

  return (
    <div className="rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Manifest header */}
      <div className={cn(
        'flex items-center gap-2 px-5 py-4',
        'bg-card',
        open && 'border-b border-border'
      )}>
        {/* Completado */}
        <button
          type="button"
          onClick={handleComplete}
          onBlur={() => setConfirmComplete(false)}
          disabled={completing || totalPackages === 0}
          aria-label={confirmComplete ? 'Confirmar completado' : 'Marcar manifiesto como completado'}
          className={cn(
            'shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors',
            confirmComplete
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700',
            (completing || totalPackages === 0) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {completing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <CheckCheck className="h-3 w-3" aria-hidden />}
          {confirmComplete ? '¿Confirmar?' : 'Completado'}
        </button>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-3 text-left transition-colors hover:opacity-80"
          aria-expanded={open}
        >
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        }
        <Layers className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        <ManifestBadge manifestNumber={manifestNumber} />

        <div className="flex items-center gap-3 ml-auto shrink-0">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="h-3 w-3" aria-hidden />
            {customerGroups.length} cliente{customerGroups.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Package className="h-3 w-3" aria-hidden />
            {totalPackages} paquete{totalPackages !== 1 ? 's' : ''}
          </span>
          {totalInvoices > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {totalInvoices} factura{totalInvoices !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        </button>
      </div>

      {open && (
        <div className="px-5 py-4 space-y-3 bg-muted/10">
          {customerGroups.map(g => (
            <CustomerSubRow
              key={g.customer.slCode}
              group={g}
              manifestNumber={manifestNumber}
              allManifestNumbers={allManifestNumbers}
              onPackageMoved={onPackageMoved}
              onPackageRemoved={onPackageRemoved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
