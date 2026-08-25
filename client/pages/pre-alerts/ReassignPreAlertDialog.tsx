/**
 * ReassignPreAlertDialog
 *
 * Admin tool to move a pre-alert from one customer (`slCode`) to another.
 *
 * Use case: the original customer account was a duplicate that got purged,
 * or the registration was done on the wrong account. The pre-alert (and
 * its mirrored SP2 shipment) needs to be re-bound to the canonical
 * customer without losing the tracking, middleware enrichment, or status
 * history.
 *
 * Flow:
 *   1. Admin types/searches the destination customer (autocomplete uses
 *      the same server-side search the Customers page already exposes).
 *   2. Confirms the move; the dialog calls `firebaseApi.prealerts.reassign`
 *      which updates SP1 + pushes the change to SP2.
 *   3. Result toast shows the new owner and SP2 sync outcome.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRight, Search, AlertTriangle, User, CheckCircle2 } from 'lucide-react';
import { useCustomerSearch } from '@/lib/hooks/queries/useCustomers';
import { firebaseApi } from '@/lib/firebase/callable';
import { useToast } from '@/hooks/use-toast';
import { useAudit } from '@/hooks/use-audit';
import { cn } from '@/lib/utils';

export interface PreAlertTarget {
  id: string;
  tracking: string;
  slCode?: string;
  displayName?: string;
  email?: string;
}

interface ReassignPreAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Either a single pre-alert (singular reassign) or an array (bulk).
   * Pass `null` to indicate the dialog is not active.
   */
  preAlert: PreAlertTarget | PreAlertTarget[] | null;
  onSuccess?: () => void;
}

interface CustomerHit {
  id: string;
  slCode?: string;
  fullName?: string;
  email?: string;
  dni?: string;
}

export function ReassignPreAlertDialog({
  open,
  onOpenChange,
  preAlert,
  onSuccess,
}: ReassignPreAlertDialogProps) {
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CustomerHit | null>(null);
  const [reason, setReason] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const { results, isLoading } = useCustomerSearch(query, 300, 25);

  // Reset state when the modal closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(null);
      setReason('');
    }
  }, [open]);

  // Normalize the input to an array so the rest of the component has a
  // single code path (Array.isArray check happens once).
  const targets: PreAlertTarget[] = useMemo(() => {
    if (!preAlert) return [];
    return Array.isArray(preAlert) ? preAlert : [preAlert];
  }, [preAlert]);
  const isBulk = targets.length > 1;
  const sourceSlCodes = useMemo(
    () => new Set(targets.map(t => t.slCode).filter(Boolean) as string[]),
    [targets],
  );

  const filteredResults = useMemo(
    () => results.filter(r => !sourceSlCodes.has((r as CustomerHit).slCode || '')),
    [results, sourceSlCodes],
  );

  const handleConfirm = useCallback(async () => {
    if (targets.length === 0 || !selected?.slCode) return;
    setReassigning(true);
    try {
      if (targets.length === 1) {
        const res = await firebaseApi.prealerts.reassign({
          preAlertId: targets[0].id,
          newSlCode: selected.slCode,
          reason: reason.trim() || undefined,
        });
        if (!res.success || !res.data) {
          auditLog({
            action: 'customer_linked',
            category: 'customer',
            result: 'error',
            resource: targets[0].tracking,
            resourceId: targets[0].id,
            errorMessage: res.error || 'Respuesta vacía del servidor.',
            metadata: {
              action: 'pre_alert_reassigned',
              oldSlCode: targets[0].slCode,
              newSlCode: selected.slCode,
              reason: reason.trim() || undefined
            }
          });
          toast({
            title: 'No se pudo reasignar',
            description: res.error || 'Respuesta vacía del servidor.',
            variant: 'destructive',
          });
          return;
        }
        const { to, sp2 } = res.data;
        auditLog({
          action: 'customer_linked',
          category: 'customer',
          result: 'success',
          resource: targets[0].tracking,
          resourceId: targets[0].id,
          metadata: {
            action: 'pre_alert_reassigned',
            oldSlCode: targets[0].slCode,
            newSlCode: selected.slCode,
            reason: reason.trim() || undefined,
            sp2Pushed: sp2.pushed
          }
        });
        toast({
          title: 'Pre-alerta reasignada',
          description: sp2.pushed
            ? `Vinculada a ${to.displayName} (${to.slCode}). SP2 actualizado.`
            : `Vinculada a ${to.displayName} (${to.slCode}). SP2 push falló: ${sp2.error || 'desconocido'} (se resincronizará).`,
        });
      } else {
        const res = await firebaseApi.prealerts.reassignBulk({
          preAlertIds: targets.map(t => t.id),
          newSlCode: selected.slCode,
          reason: reason.trim() || undefined,
        });
        if (!res.success || !res.data) {
          auditLog({
            action: 'customer_linked',
            category: 'customer',
            result: 'error',
            resource: `bulk_reassign_${selected.slCode}`,
            errorMessage: res.error || 'Respuesta vacía del servidor.',
            metadata: {
              action: 'pre_alerts_bulk_reassigned',
              count: targets.length,
              preAlertIds: targets.map(t => t.id),
              trackings: targets.map(t => t.tracking),
              newSlCode: selected.slCode,
              reason: reason.trim() || undefined
            }
          });
          toast({
            title: 'No se pudo reasignar',
            description: res.error || 'Respuesta vacía del servidor.',
            variant: 'destructive',
          });
          return;
        }
        const { target, succeeded, failed, sp2Pushed, total } = res.data;
        const sp2Note = sp2Pushed === succeeded
          ? 'SP2 actualizado.'
          : `SP2 propagado en ${sp2Pushed}/${succeeded} (los restantes se resincronizarán).`;
        
        auditLog({
          action: 'customer_linked',
          category: 'customer',
          result: failed === 0 ? 'success' : 'error',
          resource: `bulk_reassign_${selected.slCode}`,
          errorMessage: failed > 0 ? `${failed} fallas registradas en lote` : undefined,
          metadata: {
            action: 'pre_alerts_bulk_reassigned',
            count: targets.length,
            preAlertIds: targets.map(t => t.id),
            trackings: targets.map(t => t.tracking),
            newSlCode: selected.slCode,
            reason: reason.trim() || undefined,
            succeededCount: succeeded,
            failedCount: failed,
            sp2PushedCount: sp2Pushed
          }
        });
        
        toast({
          title: failed === 0
            ? `${succeeded} pre-alertas reasignadas a ${target.slCode}`
            : `${succeeded} OK · ${failed} fallaron (${target.slCode})`,
          description: `${total} procesadas → ${target.displayName}. ${sp2Note}`,
          variant: failed === 0 ? 'default' : 'destructive',
        });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      auditLog({
        action: 'customer_linked',
        category: 'customer',
        result: 'error',
        resource: isBulk ? `bulk_reassign_${selected?.slCode || 'unknown'}` : (targets[0]?.tracking || 'unknown'),
        errorMessage: (err as Error).message,
        metadata: {
          action: 'pre_alert_reassign_catch',
          count: targets.length,
          newSlCode: selected?.slCode,
          reason: reason.trim() || undefined
        }
      });
      toast({
        title: 'Error al reasignar',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setReassigning(false);
    }
  }, [targets, selected, reason, toast, onSuccess, onOpenChange, auditLog]);

  if (targets.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" aria-hidden />
            {isBulk ? `Reasignar ${targets.length} pre-alertas` : 'Reasignar pre-alerta'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isBulk
              ? `Mueve estas ${targets.length} pre-alertas a un mismo cliente y sincroniza con SP2.`
              : 'Mueve esta pre-alerta a otro cliente y sincroniza con SP2. Útil cuando la cuenta original era duplicada o se eliminó por error.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current owner(s) */}
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-3 w-3" aria-hidden />
              <span className="font-semibold uppercase tracking-wide">
                {isBulk ? `Pre-alertas seleccionadas (${targets.length})` : 'Cliente actual'}
              </span>
            </div>
            {isBulk ? (
              <ul className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {targets.map(t => (
                  <li key={t.id} className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] truncate max-w-[260px]">{t.tracking}</span>
                    {t.slCode && <Badge variant="outline" className="font-mono text-[9px] h-4">{t.slCode}</Badge>}
                    {t.displayName && (
                      <span className="text-muted-foreground text-[10px] truncate">{t.displayName}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm">{targets[0].tracking}</span>
                <Badge variant="outline" className="font-mono">{targets[0].slCode || '—'}</Badge>
                <span className="text-muted-foreground">{targets[0].displayName || '(sin nombre)'}</span>
                {targets[0].email && (
                  <span className="text-muted-foreground">· {targets[0].email}</span>
                )}
              </div>
            )}
          </div>

          {/* Customer picker */}
          <div className="space-y-2">
            <label htmlFor="reassign-target" className="text-xs font-medium">
              Buscar cliente destino (SL Code, nombre, correo o cédula)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="reassign-target"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Ej. SL26742 o juan@…"
                className="pl-9 font-mono text-sm"
                autoComplete="off"
                disabled={reassigning}
              />
              {isLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
              )}
            </div>

            {/* Results list */}
            {query.trim() && (
              <div className="border rounded-md max-h-52 overflow-y-auto">
                {filteredResults.length === 0 && !isLoading && (
                  <p className="text-xs text-muted-foreground italic px-3 py-3">
                    Sin coincidencias. El cliente destino debe existir previamente en SP1.
                  </p>
                )}
                {filteredResults.map((c) => {
                  const isSelected = selected?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c as CustomerHit)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs border-b last:border-0 transition-colors',
                        isSelected
                          ? 'bg-primary/10 border-primary/30'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {(c as CustomerHit).slCode || '—'}
                        </Badge>
                        <span className="font-semibold">{(c as CustomerHit).fullName || '(sin nombre)'}</span>
                        {isSelected && <CheckCircle2 className="h-3 w-3 text-primary ml-auto" aria-hidden />}
                      </div>
                      {(c as CustomerHit).email && (
                        <p className="text-muted-foreground mt-0.5">{(c as CustomerHit).email}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selection summary */}
          {selected && selected.slCode && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <ArrowRight className="h-3 w-3" aria-hidden />
                <span className="font-semibold uppercase tracking-wide">Cliente destino</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="font-mono">{selected.slCode}</Badge>
                <span className="font-semibold text-foreground">{selected.fullName || '(sin nombre)'}</span>
                {selected.email && <span className="text-muted-foreground">· {selected.email}</span>}
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <label htmlFor="reassign-reason" className="text-xs font-medium">
              Motivo (opcional, queda en el audit log)
            </label>
            <Input
              id="reassign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='Ej: "Cuenta duplicada eliminada por error, recuperando pre-alerta"'
              disabled={reassigning}
            />
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-200 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1">
              <p className="font-semibold">Esto actualiza ambos sistemas.</p>
              <p>
                En SP1 se reescriben los datos denormalizados (nombre, correo, DNI, SL Code) del
                pre-alerta. En SP2 se re-vincula el shipment al <span className="font-mono">userId</span> del
                cliente destino (creando el doc si fue borrado). El tracking y el historial de
                estado se preservan.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reassigning}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected?.slCode || reassigning}
          >
            {reassigning
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden /> Reasignando…</>
              : <><ArrowRight className="h-3.5 w-3.5 mr-1.5" aria-hidden /> Reasignar y sincronizar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
