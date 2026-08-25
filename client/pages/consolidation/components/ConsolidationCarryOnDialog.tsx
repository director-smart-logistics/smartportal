/**
 * ConsolidationCarryOnDialog
 *
 * Modal dialog for the carry-on flow: moving packages between manifests
 * with compliance validation and invoice state management.
 *
 * Workflow:
 *  1. Shows packages to be moved with checkboxes
 *  2. Select target manifest from dropdown
 *  3. Live compliance preview
 *  4. Confirm → carryOnPackages() atomic batch
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ArrowRightLeft,
  Package,
  Scale,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Info,
  FileText,
  Layers,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ManifestPicker } from '@/components/manifest/ManifestPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  carryOnPackages,
  checkCarryOnCompliance,
} from '@/lib/services/consolidation-carry-on-service';
import type {
  ConsolidationPackage,
  CarryOnSuggestion,
} from './types';
import type { ComplianceResult } from '@/lib/services/consolidation-rules-service';
import { subscribeToConsolidationRules } from '@/lib/services/consolidation-rules-service';
import { areManifestsCompatible, isPermitManifest, manifestTypeLabel, getManifestType } from './manifest-utils';
import { TRANSITORIA_MANIFEST } from './normalize-manifest';

interface ConsolidationCarryOnDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected packages from the source invoice/manifest */
  sourcePackages: ConsolidationPackage[];
  /** Source invoice ID (will be annulled if all packages move) */
  sourceInvoiceId?: string;
  /** Source manifest number */
  sourceManifest: string;
  /** Customer slCode */
  slCode: string;
  customerName: string;
  /** All manifest numbers available as targets */
  allManifestNumbers: string[];
  /** Pre-filled suggestion (if triggered from suggestion banner) */
  suggestion?: CarryOnSuggestion | null;
  /** Pre-selected target manifest (from drag-and-drop) */
  defaultTargetManifest?: string;
  /** Packages already in the target manifest for this customer (for compliance) */
  getTargetPackages?: (manifest: string) => ConsolidationPackage[];
}

export function ConsolidationCarryOnDialog({
  open,
  onClose,
  sourcePackages,
  sourceInvoiceId,
  sourceManifest,
  slCode,
  customerName,
  allManifestNumbers,
  suggestion,
  defaultTargetManifest,
  getTargetPackages,
}: ConsolidationCarryOnDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetManifest, setTargetManifest] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  // Pre-select all packages on open.
  // Guard: never pre-select CONSOLIDACION_TRANSITORIA as the target —
  // it is a staging area and must not be a carry-on destination.
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(sourcePackages.map(p => p.id)));
      const suggested = suggestion?.suggestedTarget;
      const initial =
        (suggested && suggested !== TRANSITORIA_MANIFEST ? suggested : null) ||
        (defaultTargetManifest && defaultTargetManifest !== TRANSITORIA_MANIFEST ? defaultTargetManifest : null) ||
        '';
      setTargetManifest(initial);
      setReason('');
      setCompliance(suggestion?.compliance || null);
    }
  }, [open, sourcePackages, suggestion, defaultTargetManifest]);

  // Available target manifests:
  //   • Exclude the source manifest itself
  //   • Filter by manifest type compatibility (normal ↔ normal, permit ↔ permit)
  //   • CONSOLIDACION_TRANSITORIA is a valid destination — admins can park
  //     packages there to stage them before assigning to a real manifest.
  //     It is always compatible with any source manifest type.
  const targetOptions = useMemo(
    () => allManifestNumbers.filter(m =>
      m !== sourceManifest &&
      (m === TRANSITORIA_MANIFEST || areManifestsCompatible(sourceManifest, m))
    ),
    [allManifestNumbers, sourceManifest]
  );

  const sourceIsPermit = isPermitManifest(sourceManifest);

  // Selected packages
  const selectedPackages = useMemo(
    () => sourcePackages.filter(p => selectedIds.has(p.id)),
    [sourcePackages, selectedIds]
  );

  const totalWeight = useMemo(
    () => selectedPackages.reduce((s, p) => s + (p.weight || 0), 0),
    [selectedPackages]
  );

  // ── Rules subscription for reactivity ────────────────────────────────────
  const [rulesUpdateTick, setRulesUpdateTick] = useState(0);
  useEffect(() => {
    return subscribeToConsolidationRules(() => {
      setRulesUpdateTick(t => t + 1);
    });
  }, []);

  // ── Live compliance check ────────────────────────────────────────────────
  useEffect(() => {
    if (!targetManifest || selectedPackages.length === 0) {
      setCompliance(null);
      return;
    }

    const check = async () => {
      setCheckingCompliance(true);
      try {
        const targetPkgs = getTargetPackages?.(targetManifest) || [];
        const result = await checkCarryOnCompliance({
          movingPackages: selectedPackages,
          targetExistingPackages: targetPkgs,
          slCode,
        });
        setCompliance(result);
      } catch {
        setCompliance(null);
      } finally {
        setCheckingCompliance(false);
      }
    };

    const timeout = setTimeout(check, 300); // debounce
    return () => clearTimeout(timeout);
  }, [targetManifest, selectedPackages, slCode, getTargetPackages, rulesUpdateTick]);

  // ── Toggle package selection ──────────────────────────────────────────────
  const togglePackage = useCallback((pkgId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(pkgId)) next.delete(pkgId);
      else next.add(pkgId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === sourcePackages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sourcePackages.map(p => p.id)));
    }
  }, [selectedIds.size, sourcePackages]);

  // ── Execute carry-on ──────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!targetManifest || selectedPackages.length === 0) return;

    setLoading(true);
    try {
      const result = await carryOnPackages({
        packageIds: selectedPackages.map(p => p.id),
        sourceManifest,
        targetManifest,
        sourceInvoiceId,
        slCode,
        customerName,
        performedBy: user?.email || user?.fullName || user?.id || 'admin',
        reason: reason || undefined,
      });

      if (result.success) {
        toast({
          title: 'Carry-On completado',
          description: `${result.movedTrackings.length} paquete(s) movido(s) al manifiesto ${targetManifest}.`,
        });
        onClose();
      } else {
        toast({
          title: 'Error en carry-on',
          description: result.error || 'Error desconocido.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Error inesperado.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [targetManifest, selectedPackages, sourceManifest, sourceInvoiceId, slCode, customerName, user, reason, toast, onClose]);

  const hasViolations = compliance?.violations && compliance.violations.length > 0;
  const hasWarnings = compliance?.warnings && compliance.warnings.length > 0;
  const canConfirm = targetManifest && selectedPackages.length > 0 && !loading && !hasViolations;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" aria-describedby="carry-on-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden />
            Carry-On — Mover paquetes
          </DialogTitle>
          <DialogDescription id="carry-on-description" className="text-xs">
            Mover paquetes de <strong>{sourceManifest}</strong> a otro manifiesto
            para el cliente <strong>{customerName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── Target manifest selector ─────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="carry-on-target" className="text-xs font-medium">
              Manifiesto destino
            </Label>
            <ManifestPicker
              allManifestNumbers={targetOptions}
              selectedManifests={new Set(targetManifest ? [targetManifest] : [])}
              onManifestsChange={(set) => {
                const first = Array.from(set)[0] || '';
                setTargetManifest(first);
              }}
              singleSelect={true}
              allLabel="Seleccionar manifiesto destino…"
              align="start"
              triggerClassName="w-full justify-between border border-input bg-background text-foreground font-normal hover:bg-accent shadow-sm"
              id="carry-on-target"
            />
            {sourceIsPermit && (
              <p className="text-[10px] text-orange-500 dark:text-orange-400 flex items-center gap-1 mt-1">
                <Info className="h-3 w-3 shrink-0" aria-hidden />
                Manifiesto de permisos — solo se muestran manifiestos compatibles.
              </p>
            )}
            {targetOptions.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                No hay manifiestos compatibles ({manifestTypeLabel(getManifestType(sourceManifest))}) disponibles.
              </p>
            )}
          </div>

          {/* ── Package selection ────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                Paquetes a mover ({selectedIds.size}/{sourcePackages.length})
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-1.5"
                onClick={toggleAll}
              >
                {selectedIds.size === sourcePackages.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </Button>
            </div>

            <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
              {sourcePackages.map(pkg => (
                <label
                  key={pkg.id}
                  className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.has(pkg.id)}
                    onCheckedChange={() => togglePackage(pkg.id)}
                    className="shrink-0 mt-0.5"
                  />
                  <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold truncate">
                        {pkg.trackingNumber}
                      </span>
                      {pkg.weight != null && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          ({pkg.weight.toFixed(2)} kg)
                        </span>
                      )}
                    </div>
                    {pkg.description && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {pkg.description}
                      </div>
                    )}
                    
                    {/* Visual badges for packages coming from transitoria (original manifest & annulled invoice) */}
                    {(pkg.originalManifestID || pkg.annulledInvoiceNumber || pkg.invoiceNumber) && (
                      <div className="flex flex-wrap gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                        {pkg.originalManifestID && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground leading-none">
                            <Layers className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />
                            Previo: <span className="font-semibold text-foreground">{pkg.originalManifestID}</span>
                          </span>
                        )}
                        {pkg.annulledInvoiceNumber && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800/40 leading-none">
                            <FileText className="h-2.5 w-2.5 text-red-500" aria-hidden />
                            Factura anulada: <span className="font-mono font-semibold">{pkg.annulledInvoiceNumber}</span>
                          </span>
                        )}
                        {pkg.invoiceNumber && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40 leading-none">
                            <FileText className="h-2.5 w-2.5 text-emerald-500" aria-hidden />
                            Factura activa: <span className="font-mono font-semibold">{pkg.invoiceNumber}</span> <span className="text-[8px] opacity-75">({pkg.invoiceStatus})</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Total summary */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" aria-hidden />
                {selectedPackages.length} seleccionado(s)
              </span>
              <span className="flex items-center gap-1">
                <Scale className="h-3 w-3" aria-hidden />
                {totalWeight.toFixed(2)} kg
              </span>
            </div>
          </div>

          {/* ── Compliance preview ───────────────────────────────────────── */}
          {targetManifest && (
            <div className={cn(
              'rounded-lg border px-3 py-2 text-xs space-y-1',
              checkingCompliance ? 'border-border bg-muted/30' :
                hasViolations ? 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800/40' :
                  hasWarnings ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40' :
                    'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40',
            )}>
              {checkingCompliance ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  <span>Verificando reglas…</span>
                </div>
              ) : compliance ? (
                <>
                  <div className="flex items-center gap-1.5 font-medium">
                    {hasViolations ? (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />
                        <span className="text-red-700 dark:text-red-400">No cumple reglas de consolidación</span>
                      </>
                    ) : hasWarnings ? (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                        <span className="text-amber-700 dark:text-amber-400">Cumple con advertencias</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                        <span className="text-emerald-700 dark:text-emerald-400">Cumple todas las reglas</span>
                      </>
                    )}
                  </div>
                  {compliance.violations.map((v, i) => (
                    <p key={`v-${i}`} className="text-[11px] text-red-600 dark:text-red-400 ml-5">
                      ❌ {v.detail}
                    </p>
                  ))}
                  {compliance.warnings.map((w, i) => (
                    <p key={`w-${i}`} className="text-[11px] text-amber-600 dark:text-amber-400 ml-5">
                      ⚠️ {w.detail}
                    </p>
                  ))}
                </>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="h-3 w-3" aria-hidden />
                  <span>Seleccione paquetes para verificar compliance.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Reason (optional) ────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="carry-on-reason" className="text-xs font-medium">
              Razón <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="carry-on-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej: Cliente solicitó juntar paquetes"
              className="h-8 text-xs"
            />
          </div>

          {/* ── Source invoice notice ──────────────────────────────────────── */}
          {sourceInvoiceId && (
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded px-3 py-2">
              <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
              <span>
                La factura de origen será <strong>anulada</strong> automáticamente
                si se mueven todos los paquetes asociados.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Moviendo…
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                Mover {selectedPackages.length} paquete(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
