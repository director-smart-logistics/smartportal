/**
 * PackageTraceDialog
 *
 * Reusable diagnostic dialog that fetches the lifecycle of a tracking
 * number (`firebaseApi.packages.trace`) and renders it as three sections:
 *
 *   1. Current package state (or "no package found")
 *   2. Every invoice that lists the tracking, ordered newest first
 *   3. Audit log entries touching the tracking (best-effort)
 *
 * The dialog also surfaces an `ownershipMismatch` banner when the
 * package's current owner does not match an active invoice's customer,
 * which is the exact "huérfano" scenario the consolidation view warns
 * about.
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertTriangle, Package, FileText, History, ExternalLink, Search, Wand2, ArrowRight, CheckCircle2, ListChecks } from 'lucide-react';
import { firebaseApi } from '@/lib/firebase/callable';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PackageTraceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tracking: string | null;
}

interface ResolutionPlanItem {
  pkgId: string;
  pkgSlCode: string | null;
  pkgCustomerName: string | null;
  tracking: string;
  currentInvoiceId: string | null;
  currentInvoiceNumber: string | null;
  currentInvoiceStatus: string | null;
  targetInvoiceId: string | null;
  targetInvoiceNumber: string | null;
  targetInvoiceStatus: string | null;
  reason: string;
  willChange: boolean;
}

interface TraceResult {
  tracking: string;
  packages: Array<Record<string, any>>;
  invoices: Array<Record<string, any>>;
  audits: Array<Record<string, any>>;
  ownershipMismatch: boolean;
  mismatchDetail: string | null;
  resolutionPlan: ResolutionPlanItem[];
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return iso; }
};

const STATUS_COLOR: Record<string, string> = {
  paid:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  sent:      'bg-blue-100 text-blue-700 border-blue-200',
  draft:     'bg-slate-100 text-slate-700 border-slate-200',
  overdue:   'bg-amber-100 text-amber-700 border-amber-200',
  annulled:  'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
  void:      'bg-gray-200 text-gray-500 border-gray-300',
};

export function PackageTraceDialog({ open, onOpenChange, tracking }: PackageTraceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [data, setData] = useState<TraceResult | null>(null);
  const { toast } = useToast();

  const loadTrace = React.useCallback(async (track: string) => {
    setLoading(true);
    try {
      const res = await firebaseApi.packages.trace(track);
      if (!res.success || !res.data) {
        toast({ title: 'No se pudo obtener el trace', description: res.error || 'Respuesta vacía', variant: 'destructive' });
        return;
      }
      setData(res.data as unknown as TraceResult);
    } catch (err) {
      toast({ title: 'No se pudo obtener el trace', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open || !tracking) { setData(null); return; }
    let cancelled = false;
    (async () => { if (!cancelled) await loadTrace(tracking); })();
    return () => { cancelled = true; };
  }, [open, tracking, loadTrace]);

  const handleResolve = async () => {
    if (!tracking) return;
    setResolving(true);
    try {
      const res = await firebaseApi.packages.resolveLinks(tracking);
      if (!res.success || !res.data) {
        toast({ title: 'No se pudo resolver', description: res.error || 'Respuesta vacía', variant: 'destructive' });
        return;
      }
      const { changed, skipped } = res.data;
      toast({
        title: changed.length > 0 ? `Re-vinculado: ${changed.length} paquete(s)` : 'Sin cambios necesarios',
        description: changed.length > 0
          ? `Cada paquete ahora apunta a la factura activa más reciente. (${skipped} ya estaba(n) correcto(s))`
          : 'Los paquetes ya estaban vinculados a la factura correcta.',
      });
      await loadTrace(tracking);
    } catch (err) {
      toast({ title: 'No se pudo resolver', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" aria-hidden />
            Trace del paquete
            {tracking && (
              <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{tracking}</code>
            )}
          </DialogTitle>
          <DialogDescription>
            Historial completo del tracking en paquetes, facturas y bitácora de auditoría.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}

        {!loading && data && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5 pb-2">
              {/* Resolution plan: what 'Resolver automáticamente' will do */}
              {data.resolutionPlan.length > 0 && (() => {
                const planChanges = data.resolutionPlan.filter(p => p.willChange);
                const planNoOps   = data.resolutionPlan.filter(p => !p.willChange);
                const headerCls = planChanges.length > 0
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/50';
                return (
                  <section className={cn('rounded-lg border p-3', headerCls)}>
                    <div className="flex items-center gap-2 mb-2">
                      <ListChecks className="h-4 w-4 text-primary" aria-hidden />
                      <h3 className="text-xs font-semibold uppercase tracking-wider">
                        Plan de resolución
                      </h3>
                      {planChanges.length > 0 ? (
                        <Badge className="text-[10px]">{planChanges.length} cambio(s)</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-1" aria-hidden /> Todo correcto
                        </Badge>
                      )}
                    </div>

                    {planChanges.length === 0 ? (
                      <p className="text-xs text-emerald-800 dark:text-emerald-300">
                        Cada paquete ya está vinculado a la factura correcta. No hay nada que cambiar.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {planChanges.map((p) => (
                          <li
                            key={p.pkgId}
                            className="rounded-md bg-card border border-border/60 px-3 py-2 text-xs space-y-1.5"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <Package className="h-3 w-3 text-muted-foreground" aria-hidden />
                              <span className="font-semibold truncate">{p.pkgCustomerName || '(sin cliente)'}</span>
                              <Badge variant="outline" className="font-mono text-[10px]">{p.pkgSlCode || '—'}</Badge>
                              <code className="text-[10px] text-muted-foreground/70 font-mono ml-auto truncate">{p.pkgId}</code>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[11px]">
                              {/* FROM */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">De:</span>
                                {p.currentInvoiceId ? (
                                  <>
                                    <span className="font-mono">{p.currentInvoiceNumber || p.currentInvoiceId.slice(0, 8)}</span>
                                    {p.currentInvoiceStatus && (
                                      <Badge variant="outline" className={cn('text-[9px]', STATUS_COLOR[p.currentInvoiceStatus.toLowerCase()] || 'bg-muted text-muted-foreground')}>
                                        {p.currentInvoiceStatus}
                                      </Badge>
                                    )}
                                  </>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                                    sin factura
                                  </Badge>
                                )}
                              </div>
                              {/* ARROW */}
                              <ArrowRight className="h-3 w-3 text-primary" aria-hidden />
                              {/* TO */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">A:</span>
                                {p.targetInvoiceId ? (
                                  <>
                                    <span className="font-mono font-semibold">{p.targetInvoiceNumber || p.targetInvoiceId.slice(0, 8)}</span>
                                    {p.targetInvoiceStatus && (
                                      <Badge variant="outline" className={cn('text-[9px]', STATUS_COLOR[p.targetInvoiceStatus.toLowerCase()] || 'bg-muted text-muted-foreground')}>
                                        {p.targetInvoiceStatus}
                                      </Badge>
                                    )}
                                  </>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">
                                    sin factura disponible
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">
                              Motivo: {p.reason}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}

                    {planNoOps.length > 0 && planChanges.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        + {planNoOps.length} paquete(s) ya están correctamente vinculados.
                      </p>
                    )}
                  </section>
                );
              })()}

              {/* Mismatch banner */}
              {data.ownershipMismatch && (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-700/50">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <p className="font-semibold mb-1">Inconsistencia detectada</p>
                    <p>{data.mismatchDetail}</p>
                  </div>
                </div>
              )}

              {/* Packages */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" aria-hidden />
                  Paquetes ({data.packages.length})
                </h3>
                {data.packages.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-3 rounded border border-dashed">
                    No existe ningún paquete con este tracking.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.packages.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-md border border-border/60 px-3 py-2 text-xs space-y-1 bg-card"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold">{p.customerName || p.slCode || '(sin cliente)'}</span>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {p.slCode || '—'}
                          </Badge>
                          {p.status && <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>}
                        </div>
                        <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Manifiesto: <span className="font-mono">{p.manifestNumber || '—'}</span></span>
                          <span>Ruta: {p.ruta || '—'}</span>
                          <span>Peso: {p.weight ?? '—'} kg</span>
                          <span>Costo: {p.cost != null ? `$${p.cost.toFixed(2)}` : '—'}</span>
                          <span>Creado: {fmtDate(p.createdAt)}</span>
                          <span>Actualizado: {fmtDate(p.updatedAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Invoices */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Facturas ({data.invoices.length})
                </h3>
                {data.invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-3 rounded border border-dashed">
                    Ninguna factura lista este tracking.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {[...data.invoices]
                      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                      .map((inv) => (
                      <li
                        key={inv.id}
                        className="rounded-md border border-border/60 px-3 py-2 text-xs space-y-1 bg-card"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono font-semibold">{inv.invoiceNumber || inv.id}</span>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]', STATUS_COLOR[(inv.status || '').toLowerCase()] || 'bg-muted text-muted-foreground')}
                          >
                            {inv.status || 'sin estado'}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-[10px]">{inv.slCode || '—'}</Badge>
                          <a
                            href={`/invoices/${inv.id}`}
                            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline text-[10px]"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                          </a>
                        </div>
                        <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5">
                          <span>Cliente: {inv.customerName || '—'}</span>
                          <span>Total: {inv.totalAmount != null ? `$${Number(inv.totalAmount).toFixed(2)}` : '—'}</span>
                          <span>Manifiesto: <span className="font-mono">{inv.manifestNumber || '—'}</span></span>
                          <span>Item: {inv.itemPrice != null ? `$${Number(inv.itemPrice).toFixed(2)}` : '—'}</span>
                          <span className="col-span-2 truncate">Desc.: {inv.itemDescription || '—'}</span>
                          <span>Creada: {fmtDate(inv.createdAt)}</span>
                          <span>Actualizada: {fmtDate(inv.updatedAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Audit logs */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Bitácora ({data.audits.length})
                </h3>
                {data.audits.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2 py-3 rounded border border-dashed">
                    Sin entradas de auditoría para este tracking.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.audits.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-md border border-border/40 px-3 py-1.5 text-[11px] flex items-center gap-2 flex-wrap bg-card"
                      >
                        <Badge variant="outline" className="text-[9px]">{a.action}</Badge>
                        <span className="text-muted-foreground">{a.entity}</span>
                        {a.entityId && <code className="text-[9px] text-muted-foreground/70 font-mono">{a.entityId}</code>}
                        <span className="ml-auto text-muted-foreground">{fmtDate(a.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <p className="text-[10px] text-muted-foreground hidden sm:block">
            Reglas: cada paquete apunta a la factura activa más reciente del cliente. Las anuladas son solo historial.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            {(() => {
              const pendingChanges = data?.resolutionPlan?.filter(p => p.willChange).length ?? 0;
              return (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleResolve}
                  disabled={resolving || loading || !tracking || pendingChanges === 0}
                >
                  {resolving ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden /> Resolviendo…</>
                  ) : pendingChanges > 0 ? (
                    <><Wand2 className="h-3.5 w-3.5 mr-1.5" aria-hidden /> Aplicar {pendingChanges} cambio(s)</>
                  ) : (
                    <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" aria-hidden /> Todo correcto</>
                  )}
                </Button>
              );
            })()}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
