/**
 * AddToConsolidationDialog
 *
 * Searches for a package by tracking number (in the `packages` collection),
 * enriches it with invoice price data, and lets the user queue up multiple
 * items before committing them to the `manifest_consolidation` collection.
 */
import React, { useState, useCallback } from 'react';
import {
  Search,
  Loader2,
  Plus,
  Check,
  X,
  Package,
  Weight,
  FileText,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  lookupPackageForConsolidation,
  addItemsToConsolidation,
  type ManifestConsolidationItem,
} from '@/lib/services/manifest-consolidation-service';
import { PackageStatusBadge } from './PackageStatusBadge';

interface AddToConsolidationDialogProps {
  open: boolean;
  onClose: () => void;
  /** Set of tracking numbers already in manifest_consolidation — prevents duplicates */
  existingTrackings?: Set<string>;
}

export function AddToConsolidationDialog({
  open,
  onClose,
  existingTrackings = new Set(),
}: AddToConsolidationDialogProps) {
  const { toast } = useToast();
  const [queryVal, setQueryVal]   = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound]         = useState<ManifestConsolidationItem | null>(null);
  const [notFound, setNotFound]   = useState(false);
  const [pending, setPending]     = useState<ManifestConsolidationItem[]>([]);
  const [saving, setSaving]       = useState(false);

  const reset = useCallback(() => {
    setQueryVal('');
    setFound(null);
    setNotFound(false);
  }, []);

  const handleSearch = useCallback(async () => {
    const t = queryVal.trim().toUpperCase();
    if (!t) return;
    setSearching(true);
    setFound(null);
    setNotFound(false);
    try {
      const result = await lookupPackageForConsolidation(t);
      if (result) {
        setFound(result);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      toast({ title: 'Error de búsqueda', description: String(err), variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  }, [queryVal, toast]);

  const handleAddToPending = useCallback(() => {
    if (!found) return;
    if (
      pending.some(p => p.tracking === found.tracking) ||
      existingTrackings.has(found.tracking)
    ) {
      toast({
        title: 'Ya está en consolidación',
        description: `${found.tracking} ya fue agregado.`,
      });
      return;
    }
    setPending(prev => [...prev, found]);
    reset();
  }, [found, pending, existingTrackings, toast, reset]);

  const handleRemovePending = useCallback((tracking: string) => {
    setPending(prev => prev.filter(p => p.tracking !== tracking));
  }, []);

  const handleSave = useCallback(async () => {
    if (!pending.length) return;
    setSaving(true);
    try {
      await addItemsToConsolidation(pending);
      const n = pending.length;
      toast({
        title: 'Guardado',
        description: `${n} paquete${n !== 1 ? 's' : ''} agregado${n !== 1 ? 's' : ''} al manifiesto de consolidación.`,
      });
      setPending([]);
      reset();
      onClose();
    } catch (err) {
      toast({ title: 'Error al guardar', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [pending, toast, reset, onClose]);

  const handleClose = useCallback(() => {
    setPending([]);
    reset();
    onClose();
  }, [reset, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-consol-title"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" aria-hidden />
            <div>
              <h2 id="add-consol-title" className="text-sm font-bold text-foreground">
                Agregar a Manifiesto de Consolidación
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Busca por número de tracking para agregar paquetes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden />
              <Input
                value={queryVal}
                onChange={e => {
                  setQueryVal(e.target.value);
                  setFound(null);
                  setNotFound(false);
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Número de tracking…"
                className="pl-8 h-9 text-xs font-mono"
                aria-label="Tracking number"
                disabled={searching}
                autoFocus
              />
            </div>
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={searching || !queryVal.trim()}
              className="h-9 px-4 text-xs shrink-0"
            >
              {searching
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                : 'Buscar'}
            </Button>
          </div>

          {/* Not found notice */}
          {notFound && (
            <p className="text-xs text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">
              No se encontró ningún paquete con tracking{' '}
              <span className="font-mono font-semibold">{queryVal.trim().toUpperCase()}</span>
            </p>
          )}

          {/* Already-in-list duplicate notice */}
          {found && (
            existingTrackings.has(found.tracking) || pending.some(p => p.tracking === found.tracking)
          ) && (
            <p className="text-xs text-amber-700 dark:text-amber-400 text-center py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700/40">
              <strong>{found.tracking}</strong> ya está en el manifiesto de consolidación.
            </p>
          )}

          {/* Found result card */}
          {found &&
            !existingTrackings.has(found.tracking) &&
            !pending.some(p => p.tracking === found.tracking) && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                  <span className="font-mono text-xs font-bold text-foreground">
                    {found.tracking}
                  </span>
                  {found.status && (
                    <PackageStatusBadge 
                      status={found.status} 
                      className="shrink-0 text-[10px] px-2 py-0.5 rounded-full" 
                    />
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleAddToPending}
                  className="h-7 px-2.5 text-[11px] shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="h-3 w-3 mr-1" aria-hidden />
                  Agregar
                </Button>
              </div>

              <dl className="text-xs text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1">
                {found.customerName && (
                  <>
                    <dt className="font-medium text-foreground/70">Cliente</dt>
                    <dd>{found.customerName?.toUpperCase()}</dd>
                  </>
                )}
                {found.slCode && (
                  <>
                    <dt className="font-medium text-foreground/70">SmartID</dt>
                    <dd className="font-mono">{found.slCode}</dd>
                  </>
                )}
                {found.manifestNumber && (
                  <>
                    <dt className="font-medium text-foreground/70">Manifiesto</dt>
                    <dd className="font-mono">{found.manifestNumber}</dd>
                  </>
                )}
                {found.ruta && (
                  <>
                    <dt className="font-medium text-foreground/70">Ruta</dt>
                    <dd>{found.ruta}</dd>
                  </>
                )}
                {found.weight > 0 && (
                  <>
                    <dt className="font-medium text-foreground/70 flex items-center gap-1">
                      <Weight className="h-2.5 w-2.5" aria-hidden />Peso
                    </dt>
                    <dd>{found.weight.toFixed(2)} kg</dd>
                  </>
                )}
                {found.price > 0 && (
                  <>
                    <dt className="font-medium text-foreground/70">Precio</dt>
                    <dd className="font-semibold text-foreground">
                      {found.currency} {found.price.toFixed(2)}
                    </dd>
                  </>
                )}
                {found.invoiceNumber && (
                  <>
                    <dt className="font-medium text-foreground/70 flex items-center gap-1">
                      <FileText className="h-2.5 w-2.5" aria-hidden />Factura
                    </dt>
                    <dd className="font-mono">{found.invoiceNumber}</dd>
                  </>
                )}
                {found.description && (
                  <>
                    <dt className="font-medium text-foreground/70 col-span-2">Descripción</dt>
                    <dd className="col-span-2 truncate">{found.description}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Pending queue */}
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Para agregar ({pending.length})
              </p>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {pending.map(p => (
                  <div
                    key={p.tracking}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/60"
                  >
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" aria-hidden />
                    <span className="font-mono text-xs font-semibold text-foreground flex-1 truncate">
                      {p.tracking}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[130px] hidden sm:block">
                      {p.customerName?.toUpperCase()}
                    </span>
                    {p.price > 0 && (
                      <span className="text-xs tabular-nums font-medium text-foreground shrink-0">
                        ${p.price.toFixed(2)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemovePending(p.tracking)}
                      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Quitar ${p.tracking} de la lista`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-muted/20 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={saving}
            className="h-8 px-3 text-xs"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !pending.length}
            className={cn('h-8 px-4 text-xs gap-1.5', !pending.length && 'opacity-50')}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {saving ? 'Guardando…' : `Guardar${pending.length > 0 ? ` (${pending.length})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
