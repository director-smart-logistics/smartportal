/**
 * BulkMoveDialog
 *
 * Moves multiple packages (and their invoices) to a new manifest atomically.
 * Uses chunked writeBatches (≤ 450 ops each) to stay within Firestore limits.
 *
 * Per package:
 *  – package doc:     manifestNumber + updatedManifest + manifestUpdatedAt
 *  – source invoices: status → 'cancelled'
 *  – dest invoices:   manifestNumbers → arrayUnion(target)
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
  orderBy,
  limit,
} from 'firebase/firestore';
import { bulkMoveConsolidationItems } from '@/lib/services/manifest-consolidation-service';
import { deleteInvoiceFromSp2 } from '@/lib/services/sync-invoices-service';
import { db } from '@/lib/firebase/config';
import {
  ArrowRightLeft, Loader2, X, Search,
  Info, Package, CheckCircle2, User, FileText, AlertTriangle, Calendar,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { ConsolidationPackage } from './types';

interface BulkMoveDialogProps {
  packages: ConsolidationPackage[];
  /** The source manifest (all selected packages share it in a group) */
  currentManifest: string;
  /** Only this customer's manifest numbers */
  availableManifestNumbers: string[];
  onClose: () => void;
  onMoved: (newManifest: string) => void;
}

const BATCH_CHUNK = 450;

/** Parse the DD-MM-YYYY prefix from manifest IDs such as "10-04-2026DAN" */
function parseManifestDate(id: string): Date | null {
  const m = id.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

type PendingUpdate = { col: string; id: string; data: Record<string, unknown> };

/** Commit an array of updates split into chunks ≤ BATCH_CHUNK */
async function commitInChunks(updates: PendingUpdate[]): Promise<void> {
  for (let i = 0; i < updates.length; i += BATCH_CHUNK) {
    const chunk = updates.slice(i, i + BATCH_CHUNK);
    const batch = writeBatch(db);
    for (const { col, id, data } of chunk) {
      batch.update(doc(db, col, id), data);
    }
    await batch.commit();
  }
}

export function BulkMoveDialog({
  packages,
  currentManifest,
  availableManifestNumbers,
  onClose,
  onMoved,
}: BulkMoveDialogProps) {
  const { toast } = useToast();
  const customerName = packages[0]?.customerName || '';
  const customerSlCode = packages[0]?.slCode || '';
  const [target, setTarget]                   = useState('');
  const [filterSuggestions, setFilterSuggestions] = useState('');
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [destInvoice, setDestInvoice] = useState<{ id: string; invoiceNumber: string; status: string; totalAmount: number } | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  type ValidManifest = { id: string; processedAt: string; hasSentInvoice: boolean };
  const [validManifests, setValidManifests]     = useState<ValidManifest[]>([]);
  const [loadingManifests, setLoadingManifests] = useState(false);
  const [voidDestInvoice, setVoidDestInvoice]   = useState(false);

  // ── Load valid Nova manifests from `manifests` collection ────────────────────
  useEffect(() => {
    if (!customerSlCode) { setValidManifests([]); return; }
    setLoadingManifests(true);
    const LINK_SOURCES = new Set(['nova_mlocker', 'nova_fusion']);
    Promise.all([
      getDocs(query(collection(db, 'manifests'), orderBy('processedAt', 'desc'), limit(100))),
      getDocs(query(collection(db, 'invoices'), where('slCode', '==', customerSlCode))),
    ]).then(([manifestsSnap, invoicesSnap]) => {
      const sentByManifest = new Set<string>();
      invoicesSnap.docs.forEach(d => {
        const s = d.data().status as string;
        if (s === 'sent' || s === 'paid') {
          const mn = d.data().manifestNumber as string;
          if (mn) sentByManifest.add(mn);
        }
      });
      const isPermisoBatch = packages.some(
        p => p.requiresPermit || p.permisos || (p as any).isPermiso || currentManifest.toUpperCase().endsWith('DANP') || currentManifest.toUpperCase().includes('PERMISO')
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const results: ValidManifest[] = [];
      for (const d of manifestsSnap.docs) {
        const id = d.id;
        if (id === currentManifest) continue;
        if (id.toUpperCase().startsWith('MEGA-MAN-') || id.toUpperCase().startsWith('SL-MEGA-MAN-')) continue;
        if (LINK_SOURCES.has(d.data().source as string)) continue;

        // Strict category guard: regular packages cannot move to permit manifest, and permit packages cannot move to regular manifest
        const targetIsPermiso = id.toUpperCase().endsWith('DANP') || id.toUpperCase().includes('PERMISO') || id.toUpperCase().includes('PERMIT');
        if (isPermisoBatch !== targetIsPermiso) continue;

        const hasSentInvoice = sentByManifest.has(id);
        const manifestDate  = parseManifestDate(id);
        const isFutureOrToday = manifestDate ? manifestDate >= today : false;
        if (isFutureOrToday || !hasSentInvoice) {
          results.push({ id, processedAt: (d.data().processedAt as string) ?? '', hasSentInvoice });
        }
      }
      setValidManifests(results);
    }).catch(() => {}).finally(() => setLoadingManifests(false));
  }, [customerSlCode, currentManifest, packages]);

  // ── Reset invoice-void choice when target changes ────────────────────────────
  useEffect(() => { setVoidDestInvoice(false); }, [target]);

  useEffect(() => {
    if (!target || !customerSlCode) { setDestInvoice(null); return; }
    setLoadingInvoice(true);
    getDocs(query(
      collection(db, 'invoices'),
      where('slCode', '==', customerSlCode),
      where('manifestNumber', '==', target),
    )).then(snap => {
      const found = snap.docs.find(d => {
        const s = d.data().status as string;
        return s !== 'annulled' && s !== 'cancelled';
      });
      setDestInvoice(found ? {
        id:            found.id,
        invoiceNumber: found.data().invoiceNumber || found.id,
        status:        found.data().status || 'draft',
        totalAmount:   found.data().totalAmount ?? 0,
      } : null);
    }).catch(() => setDestInvoice(null))
      .finally(() => setLoadingInvoice(false));
  }, [target, customerSlCode]);

  const isValid = !!target && target !== currentManifest;

  /** Whether the selected target manifest already has a sent/paid invoice */
  const targetHasSentInvoice = useMemo(
    () => target ? (validManifests.find(m => m.id === target)?.hasSentInvoice ?? false) : false,
    [target, validManifests],
  );

  const suggestions = useMemo(() => {
    const q = filterSuggestions.toLowerCase();
    const fromConsolidation = new Set(
      availableManifestNumbers.filter(m => m !== currentManifest),
    );
    const novaIds = validManifests.map(m => m.id).filter(id => !fromConsolidation.has(id));
    return [...fromConsolidation, ...novaIds]
      .filter(id => id.toLowerCase().includes(q))
      .sort((a, b) => b.localeCompare(a)); // newest first
  }, [availableManifestNumbers, validManifests, currentManifest, filterSuggestions]);

  const handleBulkMove = async () => {
    if (!isValid || saving || packages.length === 0) return;
    setError(null);
    setSaving(true);

    try {
      const now     = new Date().toISOString();
      const updates: PendingUpdate[] = [];
      const seen    = new Set<string>();
      let cancelledCount = 0;
      const cancelledInvoices: { id: string; num: string }[] = [];

      // ── 1b. Direct invoice lookup for all packages with invoiceId (Chunked Batches) ─
      const directInvoiceIds = [...new Set(packages.map(p => p.invoiceId).filter(Boolean))] as string[];
      const CHUNK_SIZE = 30;
      const invIdChunks: string[][] = [];
      for (let i = 0; i < directInvoiceIds.length; i += CHUNK_SIZE) {
        invIdChunks.push(directInvoiceIds.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(invIdChunks.map(async chunk => {
        try {
          const directSnaps = await Promise.all(chunk.map(id => getDoc(doc(db, 'invoices', id))));
          for (const directSnap of directSnaps) {
            if (directSnap.exists() && !seen.has(directSnap.id)) {
              seen.add(directSnap.id);
              const data = directSnap.data();
              if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid') {
                updates.push({
                  col:  'invoices',
                  id:   directSnap.id,
                  data: {
                    status:       'annulled',
                    annulledAt:   now,
                    cancelReason: `${packages.length} paquete${packages.length !== 1 ? 's' : ''} reasignado${packages.length !== 1 ? 's' : ''} al manifiesto ${target}`,
                    updatedAt:    now,
                  },
                });
                cancelledCount++;
                cancelledInvoices.push({ id: directSnap.id, num: (data.invoiceNumber as string) || directSnap.id });
              }
            }
          }
        } catch (err) {
          console.warn('[BulkMoveDialog] Error checking direct package invoiceId:', err);
        }
      }));

      // ── 2. Source invoices by slCode + currentManifest (bulk-friendly) ─────
      const slCodes = [...new Set(packages.map(p => p.slCode).filter(Boolean))];
      const trackingNumbers = packages.map(p => p.trackingNumber).filter(Boolean);
      const movingSet = new Set(trackingNumbers);

      /** Returns true only when every tracking referenced by the invoice is in movingSet.
       *  An invoice with remaining (non-moving) trackings must NOT be cancelled. */
      const allInvoiceTrackingsMoving = (data: Record<string, unknown>): boolean => {
        const invTrackings = new Set<string>();
        if (data.trackingNumber) invTrackings.add(data.trackingNumber as string);
        ((data.trackingNumbers as string[]) || []).forEach((t: string) => invTrackings.add(t));
        ((data.invoiceItems as Array<{ trackingNumber?: string }>) || [])
          .forEach(i => { if (i.trackingNumber) invTrackings.add(i.trackingNumber); });
        if (invTrackings.size === 0) return true; // If no trackings stored, moving the customer annuls the invoice
        return [...invTrackings].every(t => movingSet.has(t));
      };

      const slChunks: string[][] = [];
      for (let i = 0; i < slCodes.length; i += CHUNK_SIZE) {
        slChunks.push(slCodes.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(slChunks.map(async chunk => {
        const [snapSource1, snapSource2] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('slCode', 'in', chunk))),
          getDocs(query(collection(db, 'invoices'), where('clientSlCode', 'in', chunk))),
        ]);
        const allDocs = [...snapSource1.docs, ...snapSource2.docs];
        for (const d of allDocs) {
          if (seen.has(d.id)) continue;
          const data = d.data();
          const invMf = (data.manifestNumber || '').toLowerCase().trim();
          const currMf = currentManifest.toLowerCase().trim();
          const isTransitoriaTarget = target.toLowerCase().includes('transitoria');
          if (invMf !== currMf && !isTransitoriaTarget && invMf) continue;

          const items: Array<{ trackingNumber?: string }> = data.invoiceItems || [];
          const invTrackings: string[] = data.trackingNumbers || [];
          const hasAny = trackingNumbers.some(tn =>
            data.trackingNumber === tn ||
            invTrackings.includes(tn) ||
            items.some(i => i.trackingNumber === tn)
          );
          if (!hasAny && trackingNumbers.length > 0) continue;
          seen.add(d.id);
          // Only cancel when ALL trackings on this invoice are being moved (or moving to transitoria).
          if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid' && (isTransitoriaTarget || allInvoiceTrackingsMoving(data))) {
            updates.push({
              col:  'invoices',
              id:   d.id,
              data: {
                status:       'annulled',
                annulledAt:   now,
                cancelReason: `${packages.length} tracking${packages.length !== 1 ? 's' : ''} reasignado${packages.length !== 1 ? 's' : ''} al manifiesto ${target}`,
                updatedAt:    now,
              },
            });
            cancelledCount++;
            cancelledInvoices.push({ id: d.id, num: (data.invoiceNumber as string) || d.id });
          }
        }
      }));

      // ── 3. Fallback: source invoices by individual trackingNumber fields (Chunked) ───
      const tnChunks: string[][] = [];
      for (let i = 0; i < trackingNumbers.length; i += CHUNK_SIZE) {
        tnChunks.push(trackingNumbers.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(tnChunks.map(async chunk => {
        const [snapArr, snapSingle] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains-any', chunk.slice(0, 10)))),
          getDocs(query(collection(db, 'invoices'), where('trackingNumber', 'in', chunk))),
        ]);
        for (const d of [...snapArr.docs, ...snapSingle.docs]) {
          if (seen.has(d.id)) continue;
          const data = d.data();
          const invMf = (data.manifestNumber || '').toLowerCase().trim();
          const currMf = currentManifest.toLowerCase().trim();
          const isTransitoriaTarget = target.toLowerCase().includes('transitoria');
          if (invMf !== currMf && !isTransitoriaTarget && invMf) continue;
          seen.add(d.id);
          // Same guard: only annul when ALL invoice trackings are moving (or moving to transitoria).
          if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid' && (isTransitoriaTarget || allInvoiceTrackingsMoving(data))) {
            updates.push({
              col:  'invoices',
              id:   d.id,
              data: {
                status:       'annulled',
                annulledAt:   now,
                cancelReason: `Tracking reasignado al manifiesto ${target}`,
                updatedAt:    now,
              },
            });
            cancelledCount++;
            cancelledInvoices.push({ id: d.id, num: (data.invoiceNumber as string) || d.id });
          }
        }
      }));

      // ── 4. Destination invoices — update manifest refs (Chunked) ───────────
      await Promise.all(slChunks.map(async chunk => {
        const [snapDest1, snapDest2] = await Promise.all([
          getDocs(query(
            collection(db, 'invoices'),
            where('slCode', 'in', chunk),
            where('manifestNumber', '==', target),
          )),
          getDocs(query(
            collection(db, 'invoices'),
            where('clientSlCode', 'in', chunk),
            where('manifestNumber', '==', target),
          )),
        ]);
        for (const d of [...snapDest1.docs, ...snapDest2.docs]) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          updates.push({
            col:  'invoices',
            id:   d.id,
            data: { manifestNumbers: arrayUnion(target), updatedAt: now },
          });
        }
      }));

      // ── 4b. Optionally void the destination invoice if user requested ─────────
      if (voidDestInvoice && destInvoice && !seen.has(destInvoice.id)) {
        seen.add(destInvoice.id);
        updates.push({
          col:  'invoices',
          id:   destInvoice.id,
          data: {
            status:       'annulled',
            annulledAt:   now,
            cancelReason: `Factura anulada al reasignar ${packages.length} paquete${packages.length !== 1 ? 's' : ''} al manifiesto ${target}`,
            updatedAt:    now,
          },
        });
        cancelledCount++;
        cancelledInvoices.push({ id: destInvoice.id, num: destInvoice.invoiceNumber || destInvoice.id });
      }

      // ── 5. Commit invoice updates in chunks ────────────────────────────────────────
      await commitInChunks(updates);

      // Delete annulled invoices from SP2 customer portal
      for (const inv of cancelledInvoices) {
        await deleteInvoiceFromSp2(inv.id, inv.num).catch(() => {});
      }

      // ── 6. Update manifest_consolidation + real packages + destination invoice items
      await bulkMoveConsolidationItems(
        packages.map(pkg => ({
          tracking:     pkg.trackingNumber || pkg.id,
          slCode:       pkg.slCode,
          customerName: pkg.customerName || '',
          weight:       pkg.weight       ?? 0,
          price:        pkg.price        ?? 0,
          currency:     pkg.currency     || 'USD',
          description:  pkg.description  || '',
          permisos:     pkg.requiresPermit ?? false,
        })),
        target,
        currentManifest || undefined,
      );

      const cancelNote = cancelledCount > 0
        ? ` · ${cancelledCount} factura${cancelledCount !== 1 ? 's' : ''} anulada${cancelledCount !== 1 ? 's' : ''}.`
        : '';
      toast({
        title: 'Reasignación masiva completada',
        description: `${packages.length} paquete${packages.length !== 1 ? 's' : ''} movido${packages.length !== 1 ? 's' : ''} a ${target}.${cancelNote}`,
      });

      onMoved(target);
    } catch (err) {
      console.error('[BulkMoveDialog] error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-move-title"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div>
            <h2 id="bulk-move-title" className="text-sm font-bold text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-blue-600" aria-hidden />
              Reasignación masiva
            </h2>
            {(customerName || customerSlCode) && (
              <div className="flex items-center gap-1.5 mt-1">
                <User className="h-3 w-3 text-primary shrink-0" aria-hidden />
                {customerName && (
                  <span className="text-[11px] font-semibold text-foreground truncate max-w-[200px]">
                    {customerName?.toUpperCase()}
                  </span>
                )}
                {customerSlCode && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {customerSlCode}
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Package className="h-3 w-3" aria-hidden />
              {packages.length} paquete{packages.length !== 1 ? 's' : ''} seleccionado{packages.length !== 1 ? 's' : ''}
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

        <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Current manifest */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs">
            <span className="text-muted-foreground">Manifiesto origen: </span>
            <span className="font-mono font-semibold text-foreground">{currentManifest || '(sin manifiesto)'}</span>
          </div>

          {/* Selected packages list */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Paquetes a mover
            </p>
            <div className="max-h-28 overflow-y-auto rounded-lg border border-border divide-y divide-border/50 bg-muted/10">
              {packages.map(pkg => (
                <div key={pkg.id} className="flex items-center gap-2 px-3 py-1.5">
                  <CheckCircle2 className="h-3 w-3 text-primary shrink-0" aria-hidden />
                  <span className="font-mono text-[11px] text-foreground truncate">{pkg.trackingNumber}</span>
                  {pkg.description && (
                    <span className="text-[10px] text-muted-foreground truncate">{pkg.description}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Target manifest picker */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3 w-3" aria-hidden />
              Manifiesto destino
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
              {loadingManifests ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Cargando manifiestos…
                </div>
              ) : suggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground italic">
                  {filterSuggestions ? 'Sin resultados para este filtro.' : 'No hay manifiestos abiertos disponibles.'}
                </p>
              ) : suggestions.map(mf => {
                const hasSent = validManifests.find(m => m.id === mf)?.hasSentInvoice ?? false;
                return (
                  <button
                    key={mf}
                    type="button"
                    onClick={() => setTarget(mf)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs font-mono transition-colors hover:bg-accent flex items-center justify-between gap-2',
                      target === mf && 'bg-primary/5 text-primary font-semibold'
                    )}
                  >
                    <span>{mf}</span>
                    {hasSent && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-semibold shrink-0">
                        Factura enviada
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected target confirmation + destination invoice */}
          {target && (
            <div className="space-y-2">
              <div className={cn(
                'rounded-lg border px-3 py-2.5 text-xs',
                isValid
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400'
                  : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/10 dark:text-amber-400'
              )}>
                {isValid
                  ? <>Mover {packages.length} paquete{packages.length !== 1 ? 's' : ''} a: <span className="font-mono font-bold">{target}</span></>
                  : 'El manifiesto destino debe ser diferente al origen.'}
              </div>
              {isValid && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <FileText className="h-3 w-3" aria-hidden />
                    Factura destino
                  </p>
                  {loadingInvoice ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando factura…
                    </span>
                  ) : destInvoice ? (
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-foreground">{destInvoice.invoiceNumber}</span>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium border',
                        destInvoice.status === 'draft' ? 'bg-muted text-muted-foreground border-border' :
                        destInvoice.status === 'sent'  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400' :
                        destInvoice.status === 'paid'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400' :
                        'bg-muted text-muted-foreground border-border'
                      )}>
                        {destInvoice.status === 'draft' ? 'Borrador' :
                         destInvoice.status === 'sent'  ? 'Enviado' :
                         destInvoice.status === 'paid'  ? 'Pagado' : destInvoice.status}
                      </span>
                      <span className="text-muted-foreground">· USD {destInvoice.totalAmount.toFixed(2)}</span>
                      <span className="text-emerald-600 font-medium">+{packages.length} item{packages.length !== 1 ? 's' : ''}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">
                      Sin factura activa para este manifiesto. Los items se moverán sin asignar a una factura.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Destination invoice void/keep toggle */}
          {isValid && targetHasSentInvoice && destInvoice && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10 px-3 py-3 space-y-2.5">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                El manifiesto destino ya tiene una factura {destInvoice.status === 'paid' ? 'pagada' : 'enviada'} ({destInvoice.invoiceNumber})
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">¿Qué desea hacer con esa factura?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVoidDestInvoice(false)}
                  className={cn(
                    'flex-1 px-3 py-2 text-[11px] rounded-md border font-medium transition-colors',
                    !voidDestInvoice
                      ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300'
                      : 'bg-white dark:bg-card border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  Mantener factura
                </button>
                <button
                  type="button"
                  onClick={() => setVoidDestInvoice(true)}
                  className={cn(
                    'flex-1 px-3 py-2 text-[11px] rounded-md border font-medium transition-colors',
                    voidDestInvoice
                      ? 'bg-red-50 border-red-400 text-red-700 dark:bg-red-900/20 dark:border-red-600 dark:text-red-400'
                      : 'bg-white dark:bg-card border-border text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  Anular factura
                </button>
              </div>
            </div>
          )}

          {/* Invoice cancellation notice */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/10 dark:text-amber-400">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>
              Solo se anulan las facturas cuyo <strong className="font-semibold">todos</strong> los trackings estén siendo movidos.
              Las facturas que aún tengan trackings en el manifiesto origen <strong className="font-semibold">no serán anuladas</strong>.
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
            onClick={handleBulkMove}
            className="gap-1.5"
          >
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Moviendo…</>
              : <><ArrowRightLeft className="h-3.5 w-3.5" />Reasignar {packages.length} paquete{packages.length !== 1 ? 's' : ''}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
