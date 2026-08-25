/**
 * MoveManifestDialog
 *
 * Dialog for reassigning a package (and its related invoices) to a different
 * manifest number.  Performs an atomic writeBatch:
 *  – package:  manifestNumber + updatedManifest + manifestUpdatedAt
 *  – invoices: manifestNumber + manifestNumbers (arrayUnion)
 */
import React, { useState, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
  deleteField,
} from 'firebase/firestore';
import { moveConsolidationItem } from '@/lib/services/manifest-consolidation-service';
import { deleteInvoiceFromSp2 } from '@/lib/services/sync-invoices-service';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';
import { db } from '@/lib/firebase/config';
import { ArrowRightLeft, Loader2, X, Search, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { ConsolidationPackage } from './types';

interface MoveManifestDialogProps {
  pkg: ConsolidationPackage;
  allManifestNumbers: string[];
  onClose: () => void;
  onMoved: (newManifest: string) => void;
  /** When true, also updates the manifest_consolidation document */
  syncConsolidation?: boolean;
}

export function MoveManifestDialog({
  pkg,
  allManifestNumbers,
  onClose,
  onMoved,
  syncConsolidation = false,
}: MoveManifestDialogProps) {
  const { toast } = useToast();
  const currentManifest = pkg.updatedManifest || pkg.manifestNumber || '';
  const [newManifest, setNewManifest] = useState('');
  const [filterSuggestions, setFilterSuggestions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = newManifest;
  const isValid = !!target && target !== currentManifest;

  const isPkgPermiso = Boolean(
    pkg.permisos ||
    (pkg as any).isPermiso ||
    (pkg as any).requiresPermit ||
    currentManifest.toUpperCase().endsWith('DANP') ||
    currentManifest.toUpperCase().includes('PERMISO')
  );

  const suggestions = useMemo(() =>
    allManifestNumbers.filter(m => {
      if (m === currentManifest) return false;
      if (filterSuggestions && !m.toLowerCase().includes(filterSuggestions.toLowerCase())) return false;
      const targetIsPermiso = m.toUpperCase().endsWith('DANP') || m.toUpperCase().includes('PERMISO') || m.toUpperCase().includes('PERMIT');
      if (isPkgPermiso !== targetIsPermiso) return false;
      return true;
    }),
  [allManifestNumbers, currentManifest, filterSuggestions, isPkgPermiso]);

  const handleMove = async () => {
    if (!isValid || saving) return;
    setError(null);

    const targetIsPermiso = target.toUpperCase().endsWith('DANP') || target.toUpperCase().includes('PERMISO') || target.toUpperCase().includes('PERMIT');
    if (isPkgPermiso !== targetIsPermiso) {
      setError(
        isPkgPermiso
          ? 'Este paquete es de permisos y no puede trasladarse a un manifiesto regular.'
          : 'Este paquete es regular y no puede trasladarse a un manifiesto de permisos (DANP).'
      );
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);
      const seen = new Set<string>();
      let cancelledCount = 0;
      const cancelledInvoices: { id: string; num: string }[] = [];
      const pkgsToSync: any[] = [];

      // ── 1. Update the package document if it has no invoice ─────────────────────
      // When syncConsolidation, moveConsolidationItem queries the real doc and
      // updates it correctly. Skip here to avoid a failed update on a wrong ID.
      if (!syncConsolidation && !pkg.invoiceId) {
        batch.update(doc(db, 'packages', pkg.id), {
          manifestNumber:    target,
          manifestId:        target,
          updatedManifest:   target,
          manifestUpdatedAt: now,
          // ⚠️ CRITICAL: stamp consolidacion=true so the package appears in the
          // consolidation hook (which filters where('consolidacion','==',true)).
          consolidacion:     true,
          isReassigned:      true,

          // 🚨 PREVENTATIVE PRICING GUARD: Clear old manual adjustments, pricing overrides, and
          // rounding weights when reassigning manifest context. This ensures that the target manifest
          // group can dynamically and reactively recalculate clean standard pricing without stale leakage.
          ajustePrecio: deleteField(),
          precio: deleteField(),
          price: deleteField(),
          precioSinPermiso: deleteField(),
          precioConPermiso: deleteField(),
          pesoRedondeo: deleteField(),
          diferenciaRedondeo: deleteField(),
          pesoConsolidacion: deleteField(),
          cost: deleteField(),
          costCRC: deleteField(),
        });
      }

      // ── 1b. Direct invoice lookup if package has invoiceId ───────────────────
      if (pkg.invoiceId && !seen.has(pkg.invoiceId)) {
        try {
          const directInvSnap = await getDoc(doc(db, 'invoices', pkg.invoiceId));
          if (directInvSnap.exists()) {
            seen.add(directInvSnap.id);
            const data = directInvSnap.data();
            if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid') {
              batch.update(doc(db, 'invoices', directInvSnap.id), {
                status:       'annulled',
                annulledAt:   now,
                cancelReason: `Tracking ${pkg.trackingNumber || pkg.id} reasignado al manifiesto ${target}`,
                updatedAt:    now,
                statusHistory: arrayUnion({
                  status: 'annulled',
                  changedAt: now,
                  changedBy: 'invoice-annulled-manifest-move',
                  reason: `Tracking ${pkg.trackingNumber || pkg.id} reasignado al manifiesto ${target}`,
                }),
              });
              cancelledCount++;
              cancelledInvoices.push({ id: directInvSnap.id, num: data.invoiceNumber || directInvSnap.id });
            }
          }
        } catch (err) {
          console.warn('[MoveManifestDialog] Error checking direct pkg.invoiceId:', err);
        }
      }

      // ── 2. Find all invoices referencing this tracking ─────────────────────
      //    SOURCE manifest → cancel   |   DESTINATION manifest → update refs
      if (pkg.trackingNumber) {
        const [snapArr, snapSingle] = await Promise.all([
          getDocs(query(
            collection(db, 'invoices'),
            where('trackingNumbers', 'array-contains', pkg.trackingNumber),
          )),
          getDocs(query(
            collection(db, 'invoices'),
            where('trackingNumber', '==', pkg.trackingNumber),
          )),
        ]);

        for (const d of [...snapArr.docs, ...snapSingle.docs]) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          const data = d.data();
          const invManifest: string = (data.manifestNumber || '').toLowerCase().trim();
          const currManifestNorm: string = currentManifest.toLowerCase().trim();
          const isTransitoriaTarget = target.toLowerCase().includes('transitoria');
          const isSourceManifest = invManifest === currManifestNorm || isTransitoriaTarget || !invManifest;

          if (isSourceManifest) {
            // SOURCE invoice → annul
            if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid') {
              batch.update(doc(db, 'invoices', d.id), {
                status:       'annulled',
                annulledAt:   now,
                cancelReason: `Tracking ${pkg.trackingNumber} reasignado al manifiesto ${target}`,
                updatedAt:    now,
                statusHistory: arrayUnion({
                  status: 'annulled',
                  changedAt: now,
                  changedBy: 'invoice-annulled-manifest-move',
                  reason: `Tracking ${pkg.trackingNumber} reasignado al manifiesto ${target}`,
                }),
              });
              cancelledCount++;
              cancelledInvoices.push({ id: d.id, num: data.invoiceNumber || d.id });
            }

            // Query and update all packages belonging to that source invoice (even if invoice is already annulled)
            const pkgsQuery = query(
              collection(db, 'packages'),
              where('invoiceId', '==', d.id)
            );
            const pkgsSnap = await getDocs(pkgsQuery);

            pkgsSnap.forEach(pkgDoc => {
              const pkgData = pkgDoc.data();
              const currentMf = pkgData.manifestNumber || pkgData.manifiesto || '';
              const isCurrentPkg = pkgDoc.id === pkg.id;

              if (isCurrentPkg) {
                batch.update(doc(db, 'packages', pkgDoc.id), {
                  invoiceId: deleteField(),
                  invoiceNumber: deleteField(),
                  invoiceStatus: deleteField(),
                  status: 'consolidated',
                  manifestId: target,
                  manifestNumber: target,
                  updatedManifest: target,
                  manifestUpdatedAt: now,
                  consolidacion: true,
                  isReassigned: true,
                  smartwebSynced: false,

                  // 🚨 PREVENTATIVE PRICING GUARD: Clear old manual adjustments, pricing overrides, and
                  // rounding weights when reassigning manifest context. This ensures that the target manifest
                  // group can dynamically and reactively recalculate clean standard pricing without stale leakage.
                  ajustePrecio: deleteField(),
                  precio: deleteField(),
                  price: deleteField(),
                  precioSinPermiso: deleteField(),
                  precioConPermiso: deleteField(),
                  pesoRedondeo: deleteField(),
                  diferenciaRedondeo: deleteField(),
                  pesoConsolidacion: deleteField(),
                  cost: deleteField(),
                  costCRC: deleteField(),
                  statusHistory: arrayUnion({
                    status: 'consolidated',
                    changedAt: now,
                    changedBy: 'invoice-annulled-manifest-move',
                    note: `Factura ${data.invoiceNumber || d.id} anulada y paquete reasignado al manifiesto ${target}`,
                  }),
                });

                pkgsToSync.push({
                  id: pkgDoc.id,
                  trackingNumber: pkgData.trackingNumber || pkgData.tracking || pkgDoc.id,
                  slCode: pkgData.slCode || pkg.slCode || '',
                  customerName: pkgData.customerName || pkg.customerName || '',
                  status: 'consolidated',
                  manifestNumber: target,
                  forceSync: true,
                  allowCreate: true,
                });
              } else {
                batch.update(doc(db, 'packages', pkgDoc.id), {
                  invoiceId: deleteField(),
                  invoiceNumber: deleteField(),
                  invoiceStatus: deleteField(),
                  status: 'consolidated',
                  ...(!pkgData.originalManifestID && currentMf && currentMf !== 'consolidacion_transitoria'
                    ? { originalManifestID: currentMf }
                    : {}),
                  manifestId: 'consolidacion_transitoria',
                  manifestNumber: 'consolidacion_transitoria',
                  updatedManifest: 'consolidacion_transitoria',
                  manifestUpdatedAt: now,
                  consolidacion: true,
                  smartwebSynced: false,
                  statusHistory: arrayUnion({
                    status: 'consolidated',
                    changedAt: now,
                    changedBy: 'invoice-annulled-manifest-move',
                    note: `Factura ${data.invoiceNumber || d.id} anulada debido a reasignación de tracking ${pkg.trackingNumber} — paquete desvinculado y movido a consolidación transitoria`,
                  }),
                });

                pkgsToSync.push({
                  id: pkgDoc.id,
                  trackingNumber: pkgData.trackingNumber || pkgData.tracking || pkgDoc.id,
                  slCode: pkgData.slCode || pkg.slCode || '',
                  customerName: pkgData.customerName || pkg.customerName || '',
                  status: 'consolidated',
                  manifestNumber: 'consolidacion_transitoria',
                  forceSync: true,
                  allowCreate: true,
                });
              }
            });
          } else {
            // DESTINATION or other → update manifest reference
            batch.update(doc(db, 'invoices', d.id), {
              manifestNumber:  target,
              manifestNumbers: arrayUnion(target),
              updatedAt:       now,
            });
          }
        }
      }

      // ── 3. Catch invoices-by-slCode that store items only in invoiceItems[] ─
      if (pkg.slCode) {
        // Source manifest invoices (cancel)
        const [snapSource1, snapSource2] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('slCode', '==', pkg.slCode))),
          getDocs(query(collection(db, 'invoices'), where('clientSlCode', '==', pkg.slCode))),
        ]);
        const allSourceDocs = [...snapSource1.docs, ...snapSource2.docs];
        for (const d of allSourceDocs) {
          if (seen.has(d.id)) continue;
          const data = d.data();
          const invMf = (data.manifestNumber || '').toLowerCase().trim();
          const currMf = currentManifest.toLowerCase().trim();
          const isTransitoriaTarget = target.toLowerCase().includes('transitoria');
          if (invMf !== currMf && !isTransitoriaTarget && invMf) continue;

          const items: Array<{ trackingNumber?: string }> = data.invoiceItems || [];
          if (
            pkg.trackingNumber &&
            !items.some(i => i.trackingNumber === pkg.trackingNumber)
          ) continue;
          seen.add(d.id);
          if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid') {
            batch.update(doc(db, 'invoices', d.id), {
              status:       'annulled',
              annulledAt:   now,
              cancelReason: `Tracking ${pkg.trackingNumber} reasignado al manifiesto ${target}`,
              updatedAt:    now,
              statusHistory: arrayUnion({
                status: 'annulled',
                changedAt: now,
                changedBy: 'invoice-annulled-manifest-move',
                reason: `Tracking ${pkg.trackingNumber} reasignado al manifiesto ${target}`,
              }),
            });
            cancelledCount++;
            cancelledInvoices.push({ id: d.id, num: data.invoiceNumber || d.id });
          }

          // Query and update all packages belonging to that source invoice (even if invoice is already annulled)
          const pkgsQuery = query(
            collection(db, 'packages'),
            where('invoiceId', '==', d.id)
          );
          const pkgsSnap = await getDocs(pkgsQuery);

          pkgsSnap.forEach(pkgDoc => {
            const pkgData = pkgDoc.data();
            const currentMf = pkgData.manifestNumber || pkgData.manifiesto || '';
            const isCurrentPkg = pkgDoc.id === pkg.id;

            if (isCurrentPkg) {
              batch.update(doc(db, 'packages', pkgDoc.id), {
                invoiceId: deleteField(),
                invoiceNumber: deleteField(),
                invoiceStatus: deleteField(),
                status: 'consolidated',
                manifestId: target,
                manifestNumber: target,
                updatedManifest: target,
                manifestUpdatedAt: now,
                consolidacion: true,
                isReassigned: true,
                smartwebSynced: false,

                // 🚨 PREVENTATIVE PRICING GUARD: Clear old manual adjustments, pricing overrides, and
                // rounding weights when reassigning manifest context. This ensures that the target manifest
                // group can dynamically and reactively recalculate clean standard pricing without stale leakage.
                ajustePrecio: deleteField(),
                precio: deleteField(),
                price: deleteField(),
                precioSinPermiso: deleteField(),
                precioConPermiso: deleteField(),
                pesoRedondeo: deleteField(),
                diferenciaRedondeo: deleteField(),
                pesoConsolidacion: deleteField(),
                cost: deleteField(),
                costCRC: deleteField(),
                statusHistory: arrayUnion({
                  status: 'consolidated',
                  changedAt: now,
                  changedBy: 'invoice-annulled-manifest-move',
                  note: `Factura ${data.invoiceNumber || d.id} anulada y paquete reasignado al manifiesto ${target}`,
                }),
              });

              pkgsToSync.push({
                id: pkgDoc.id,
                trackingNumber: pkgData.trackingNumber || pkgData.tracking || pkgDoc.id,
                slCode: pkgData.slCode || pkg.slCode || '',
                customerName: pkgData.customerName || pkg.customerName || '',
                status: 'consolidated',
                manifestNumber: target,
                forceSync: true,
                allowCreate: true,
              });
            } else {
              batch.update(doc(db, 'packages', pkgDoc.id), {
                invoiceId: deleteField(),
                invoiceNumber: deleteField(),
                invoiceStatus: deleteField(),
                status: 'consolidated',
                ...(!pkgData.originalManifestID && currentMf && currentMf !== 'consolidacion_transitoria'
                  ? { originalManifestID: currentMf }
                  : {}),
                manifestId: 'consolidacion_transitoria',
                manifestNumber: 'consolidacion_transitoria',
                updatedManifest: 'consolidacion_transitoria',
                manifestUpdatedAt: now,
                consolidacion: true,
                smartwebSynced: false,
                statusHistory: arrayUnion({
                  status: 'consolidated',
                  changedAt: now,
                  changedBy: 'invoice-annulled-manifest-move',
                  note: `Factura ${data.invoiceNumber || d.id} anulada debido a reasignación de tracking ${pkg.trackingNumber} — paquete desvinculado y movido a consolidación transitoria`,
                }),
              });

              pkgsToSync.push({
                id: pkgDoc.id,
                trackingNumber: pkgData.trackingNumber || pkgData.tracking || pkgDoc.id,
                slCode: pkgData.slCode || pkg.slCode || '',
                customerName: pkgData.customerName || pkg.customerName || '',
                status: 'consolidated',
                manifestNumber: 'consolidacion_transitoria',
                forceSync: true,
                allowCreate: true,
              });
            }
          });
        }

        // Destination manifest invoices (ensure manifest refs are current)
        const snapDest = await getDocs(query(
          collection(db, 'invoices'),
          where('slCode', '==', pkg.slCode),
          where('isConsolidation', '==', true),
          where('manifestNumber', '==', target),
        ));
        for (const d of snapDest.docs) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          batch.update(doc(db, 'invoices', d.id), {
            manifestNumbers: arrayUnion(target),
            updatedAt:       now,
          });
        }
      }

      await batch.commit();

      // Delete annulled invoices from SP2 customer portal
      for (const inv of cancelledInvoices) {
        await deleteInvoiceFromSp2(inv.id, inv.num).catch(() => {});
      }

      // Sync updated packages to SP2 (SmartWeb)
      if (pkgsToSync.length > 0) {
        syncPackagesToSmartWeb(pkgsToSync).catch(err =>
          console.warn('[MoveManifest] SP2 package sync failed:', err)
        );
      }

      // Sync manifest_consolidation, update real packages doc, and link to
      // destination invoice when this package lives in the consolidation collection.
      if (syncConsolidation && pkg.trackingNumber) {
        await moveConsolidationItem(pkg.trackingNumber, target, {
          slCode:       pkg.slCode,
          customerName: pkg.customerName || '',
          weight:       pkg.weight        ?? 0,
          price:        pkg.price         ?? 0,
          currency:     pkg.currency      || 'USD',
          description:  pkg.description  || '',
          permisos:     pkg.requiresPermit ?? false,
        }, currentManifest || undefined);
      }

      const cancelNote = cancelledCount > 0
        ? ` · ${cancelledCount} factura${cancelledCount !== 1 ? 's' : ''} del manifiesto origen anulada${cancelledCount !== 1 ? 's' : ''}.`
        : '';
      toast({
        title: 'Paquete reasignado',
        description: `Movido a ${target}.${cancelNote}`,
      });

      onMoved(target);
    } catch (err) {
      console.error('[MoveManifestDialog] error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-manifest-title"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div>
            <h2 id="move-manifest-title" className="text-sm font-bold text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-blue-600" aria-hidden />
              Reasignar manifiesto
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {pkg.trackingNumber || pkg.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Current manifest info */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">Manifiesto actual: </span>
            <span className="font-mono font-semibold text-foreground">
              {currentManifest || '(sin manifiesto)'}
            </span>
          </div>

          {/* Package description */}
          {pkg.description && (
            <p className="text-xs text-muted-foreground truncate">
              {pkg.description}
            </p>
          )}

          {/* Manifest suggestions */}
          {allManifestNumbers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Manifiestos disponibles
              </p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" aria-hidden />
                <Input
                  value={filterSuggestions}
                  onChange={e => setFilterSuggestions(e.target.value)}
                  placeholder="Filtrar manifiestos…"
                  className="pl-7 h-7 text-xs"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
                {suggestions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">Sin resultados</p>
                ) : suggestions.map(mf => (
                  <button
                    key={mf}
                    type="button"
                    onClick={() => setNewManifest(mf)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs font-mono transition-colors hover:bg-accent',
                      newManifest === mf && 'bg-primary/5 text-primary font-semibold'
                    )}
                  >
                    {mf}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected target */}
          {target && (
            <div className={cn(
              'rounded-lg border px-3 py-2.5 text-xs',
              isValid
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400'
                : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/10 dark:text-amber-400'
            )}>
              {isValid
                ? <>Mover a: <span className="font-mono font-bold">{target}</span></>
                : 'El manifiesto destino debe ser diferente al actual.'}
            </div>
          )}

          {/* Invoice cancellation notice */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-400">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>
              Las facturas del manifiesto origen que incluyan este tracking serán
              <strong className="font-semibold"> anuladas</strong>. La factura del manifiesto destino prevalece.
            </span>
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-muted/20">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!isValid || saving}
            onClick={handleMove}
            className="gap-1.5"
          >
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Moviendo…</>
              : <><ArrowRightLeft className="h-3.5 w-3.5" />Reasignar</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
