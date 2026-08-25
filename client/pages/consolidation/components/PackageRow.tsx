import React, { useState } from 'react';
import { ArrowRightLeft, Package, Weight, AlertTriangle, CheckCircle2, FileText, FilePlus, Trash2, RotateCcw, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { cn } from '@/lib/utils';
import { ManifestBadge } from './ManifestBadge';
import { MoveManifestDialog } from './MoveManifestDialog';
import { PackageStatusBadge } from './PackageStatusBadge';
import type { ConsolidationPackage } from './types';
import { StatusUpdateModal } from './StatusUpdateModal';

const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft:     'bg-muted/60 text-muted-foreground border-border',
  pending:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400',
  sent:      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400',
  overdue:   'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400',
  cancelled: 'bg-muted/40 text-muted-foreground/50 border-border line-through',
};
function invoiceStatusStyle(s: string) {
  return INVOICE_STATUS_STYLES[s] ?? 'bg-muted text-muted-foreground border-border';
}

interface PackageRowProps {
  pkg: ConsolidationPackage;
  allManifestNumbers: string[];
  onMoved: (pkgId: string, newManifest: string) => void;
  selected?: boolean;
  onToggleSelect?: (pkgId: string) => void;
  /** When provided, renders a remove-from-consolidation button */
  onRemove?: (pkgId: string) => void;
}

export function PackageRow({ pkg, allManifestNumbers, onMoved, selected = false, onToggleSelect, onRemove }: PackageRowProps) {
  const [dialogOpen, setDialogOpen]         = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [restoringInv, setRestoringInv]      = useState(false);
  const navigate = useNavigate();

  const handleRestoreInvoice = async () => {
    if (!pkg.invoiceId || restoringInv) return;
    setRestoringInv(true);
    try {
      const batch = writeBatch(db);
      // Restore the invoice to draft
      batch.update(doc(db, 'invoices', pkg.invoiceId), { status: 'draft', annulledAt: null });
      // Sync invoiceStatus in manifest_consolidation so the real-time listener picks it up
      batch.set(doc(db, 'manifest_consolidation', pkg.id), { invoiceStatus: 'draft' }, { merge: true });
      await batch.commit();
    } catch (e) {
      console.error('[PackageRow] restore invoice failed', e);
    } finally {
      setRestoringInv(false);
    }
  };

  const effectiveManifest = pkg.updatedManifest || pkg.manifestNumber || '';

  return (
    <>
      <div
        className={cn(
          'flex flex-row items-center justify-between gap-3 py-2 px-1 sm:px-2 transition-colors group border-b border-border/40 last:border-0',
          selected
            ? 'bg-primary/5'
            : 'hover:bg-muted/40',
          !selected && pkg.isReassigned ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
        )}
        role="row"
      >
        {/* Left side: content */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {/* Top row: Tracking + Checkbox + Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {onToggleSelect && (
              <button
                type="button"
                onClick={() => onToggleSelect(pkg.id)}
                aria-pressed={selected}
                aria-label={selected ? 'Deseleccionar paquete' : 'Seleccionar paquete'}
                className={cn(
                  'shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background hover:border-primary/60'
                )}
              >
                {selected && (
                  <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current" aria-hidden>
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )}
            
            <span className="text-sm font-mono font-bold text-foreground">
              {pkg.trackingNumber || pkg.id}
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              <PackageStatusBadge 
                status={pkg.status || ''} 
                className="shrink-0 text-[10px] px-2 py-0.5 rounded-full" 
              />
              
              {pkg.requiresPermit && (
                <span className="shrink-0 inline-flex" title="Requiere permiso">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Requiere permiso" />
                </span>
              )}

              {pkg.isReassigned && (
                <ManifestBadge
                  manifestNumber={effectiveManifest}
                  isReassigned
                />
              )}

              {pkg.invoiceNumber && (
                <span className="shrink-0 inline-flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pkg.invoiceStatus === 'annulled'}
                    onClick={() => navigate(`/invoices?highlight=${pkg.invoiceId}`)}
                    title={pkg.invoiceStatus === 'annulled' ? 'Factura anulada — sin efecto' : 'Ver factura'}
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors',
                      invoiceStatusStyle(pkg.invoiceStatus || ''),
                      pkg.invoiceStatus !== 'annulled' && 'hover:opacity-80 cursor-pointer',
                      pkg.invoiceStatus === 'annulled' && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <FileText className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    <span className="font-mono">{pkg.invoiceNumber}</span>
                    {pkg.invoiceStatus !== 'annulled' && <ExternalLink className="h-2 w-2" aria-hidden />}
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Bottom row: Description + Weight */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
            {pkg.weight != null && pkg.weight > 0 && (
              <span className="flex items-center gap-1.5 shrink-0" title="Peso (kg)">
                <Weight className="h-3 w-3" aria-hidden />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {pkg.weight.toFixed(2)} kg
                </span>
              </span>
            )}
            
            <span className="truncate min-w-0" title={pkg.description}>
              {pkg.description || 'Sin descripción'}
            </span>
          </div>
        </div>

        {/* Right side: Price & Actions */}
        <div className="flex items-center shrink-0 gap-2">
          {pkg.price != null && pkg.price > 0 && (
            <div className="w-[60px] text-right">
              <span className="font-semibold text-sm text-foreground tabular-nums">
                ${pkg.price.toFixed(2)}
              </span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            {/* Incluir en factura — shown prominently when the linked invoice is annulled */}
            {pkg.invoiceStatus === 'annulled' && pkg.invoiceId && (
              <button
                type="button"
                onClick={handleRestoreInvoice}
                disabled={restoringInv}
                title="Incluir este paquete en la factura del cliente para este manifiesto"
                aria-label={`Incluir ${pkg.trackingNumber} en factura`}
                className={cn(
                  'shrink-0 inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-semibold',
                  'border-2 border-primary text-primary bg-transparent',
                  'hover:bg-primary hover:text-primary-foreground',
                  'transition-all duration-150 shadow-sm',
                  restoringInv && 'opacity-60 cursor-not-allowed'
                )}
              >
                {restoringInv
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  : <FilePlus className="h-3.5 w-3.5" aria-hidden />}
                Incluir en factura
              </button>
            )}

            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={cn(
                'shrink-0 flex items-center justify-center h-7 w-7 rounded-md',
                'border border-border/50 bg-background hover:bg-muted/80',
                'text-muted-foreground hover:text-foreground transition-colors'
              )}
              title="Reasignar manifiesto"
              aria-label={`Reasignar manifiesto del paquete ${pkg.trackingNumber}`}
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
            </button>

            {/* Actualizar estado */}
            <button
              type="button"
              onClick={() => setStatusModalOpen(true)}
              className={cn(
                'shrink-0 flex items-center justify-center h-7 w-7 rounded-md',
                'border border-border/50 bg-background hover:bg-amber-50 dark:hover:bg-amber-950/30',
                'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors'
              )}
              title="Actualizar estado de paquete y factura"
              aria-label={`Actualizar estado del paquete ${pkg.trackingNumber}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>

            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(pkg.id)}
                className={cn(
                  'shrink-0 flex items-center justify-center h-7 w-7 rounded-md',
                  'border border-border/50 bg-background hover:bg-destructive/10',
                  'text-muted-foreground hover:text-destructive transition-colors border-destructive/20'
                )}
                title="Quitar de consolidación"
                aria-label={`Quitar ${pkg.trackingNumber} del manifiesto de consolidación`}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      {dialogOpen && (
        <MoveManifestDialog
          pkg={pkg}
          allManifestNumbers={allManifestNumbers}
          syncConsolidation
          onClose={() => setDialogOpen(false)}
          onMoved={(newMf) => {
            setDialogOpen(false);
            onMoved(pkg.id, newMf);
          }}
        />
      )}

      {statusModalOpen && (
        <StatusUpdateModal
          open={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          pkg={pkg}
        />
      )}
    </>
  );
}
