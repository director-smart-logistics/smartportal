/**
 * Nova — move packages to another manifest ("Reasignar Encomiendas" / bulk move) in ONE atomic commit.
 *
 * Admin rule (2026-09-27): the move is atomic and immediate — no multi-step writes, no queues where data
 * can cross. Before, it was three separate writes (delete drafts → annul invoices one by one → move the
 * packages); the SP1 invoice triggers ran in between, and a failure half-way left packages without their
 * invoice link (the rollback did not restore it).
 *
 * In ONE commit (all or nothing):
 *   - draft invoices of these trackings in the source manifest are deleted;
 *   - active, non-paid invoices of these trackings are annulled (paid invoices are never touched);
 *   - every package linked to a deleted / annulled invoice loses that link (it stays where it is unless moved);
 *   - the moved packages and their manifest_encomiendas rows get the target manifest.
 * Nothing goes to consolidation (Nova only annuls — rule 2026-09-26).
 * SP2 (the customer portal copy) is told right after the commit.
 *
 * undoMoveTrackingsAtomic restores everything (invoices, package links, manifests) in ONE commit too, and — as
 * before — never deletes a document (a package the move created only goes back to its manifest).
 */
import { collection, doc, documentId, getDocs, query, where, writeBatch, deleteField, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { findPackagesLinkedToInvoice } from './invoice-service';
import { deleteInvoiceFromSp2 } from './sync-invoices-service';
import { syncPackagesToSmartWeb } from './sync-smartweb-service';

/** Firestore allows 500 writes per commit. */
export const MAX_ATOMIC_WRITES = 495;

export interface PackageBackup {
  id: string;
  existed: boolean;
  manifestNumber?: string | null;
  encomiendaManifestNumber?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
}

export interface MoveBackup {
  invoices: { id: string; data: Record<string, unknown> }[];
  packages: PackageBackup[];
  encomiendas: { id: string; existed: boolean; manifestNumber?: string | null }[];
}

export interface MoveResult {
  deletedDrafts: number;
  annulledIds: string[];
  skippedPaid: number;
  backup: MoveBackup;
}

type InvoiceLike = { id: string; data: Record<string, any> };

/** Which invoices of the source manifest a move touches, and how (pure). */
export function classifyInvoicesForMove(invoices: InvoiceLike[], trackings: string[]) {
  const set = new Set(trackings.map((t) => t.toUpperCase()));
  const drafts: InvoiceLike[] = [], toAnnul: InvoiceLike[] = [];
  let skippedPaid = 0;
  for (const inv of invoices) {
    const all = [inv.data.trackingNumber, ...(Array.isArray(inv.data.trackingNumbers) ? inv.data.trackingNumbers : [])]
      .map((t) => String(t || '').toUpperCase()).filter(Boolean);
    if (!all.some((t) => set.has(t))) continue;
    const status = String(inv.data.status || 'draft').toLowerCase();
    if (status === 'annulled' || status === 'cancelled' || status === 'void') continue;
    if (status === 'paid') { skippedPaid++; continue; }       // real money received: never touched
    (status === 'draft' ? drafts : toAnnul).push(inv);
  }
  return { drafts, toAnnul, skippedPaid };
}

export async function moveTrackingsToManifestAtomic(
  trackings: string[],
  sourceManifest: string,
  targetManifest: string,
  opts: { movedBy: string; reason?: string },
): Promise<MoveResult> {
  const moved = [...new Set(trackings.map((t) => t.toUpperCase()).filter(Boolean))];
  if (!moved.length || !targetManifest) throw new Error('No hay paquetes o manifiesto de destino.');
  const now = new Date().toISOString();
  const reason = opts.reason ?? `Traslado a manifiesto ${targetManifest}`;

  // ── Reads (nothing is written until the single commit) ──────────────────────────────────────────
  const invSnap = await getDocs(query(collection(db, 'invoices'), where('manifestNumber', '==', sourceManifest)));
  const { drafts, toAnnul, skippedPaid } = classifyInvoicesForMove(invSnap.docs.map((d) => ({ id: d.id, data: d.data() })), moved);
  const touched = [...drafts, ...toAnnul];
  const linked = new Map<string, any>();   // package id → snapshot (packages of deleted / annulled invoices)
  for (const inv of touched) {
    for (const p of await findPackagesLinkedToInvoice(inv.id, inv.data.invoiceNumber || undefined)) linked.set(p.id, p);
  }
  const movedSnaps = new Map<string, any>();
  const encSnaps = new Map<string, any>();
  for (let i = 0; i < moved.length; i += 30) {
    const chunk = moved.slice(i, i + 30);
    const [ps, es] = await Promise.all([
      getDocs(query(collection(db, 'packages'), where(documentId(), 'in', chunk))),
      getDocs(query(collection(db, 'manifest_encomiendas'), where(documentId(), 'in', chunk))),
    ]);
    ps.docs.forEach((d) => movedSnaps.set(d.id, d));
    es.docs.forEach((d) => encSnaps.set(d.id, d));
  }

  const pkgIds = [...new Set([...moved, ...linked.keys()])];
  const writes = touched.length + pkgIds.length + moved.length;
  if (writes > MAX_ATOMIC_WRITES) {
    throw new Error(`El traslado necesita ${writes} escrituras (máximo ${MAX_ATOMIC_WRITES} en una sola operación). No se modificó nada: seleccione menos paquetes.`);
  }

  // ── Backup (for "Deshacer") ────────────────────────────────────────────────────────────────────────
  const touchedIds = new Set(touched.map((i) => i.id));
  const backup: MoveBackup = {
    invoices: touched.map((i) => ({ id: i.id, data: i.data })),
    packages: pkgIds.map((id) => {
      const d = movedSnaps.get(id) ?? linked.get(id);
      const x = d?.data?.() ?? {};
      return { id, existed: !!d, manifestNumber: x.manifestNumber ?? null, encomiendaManifestNumber: x.encomiendaManifestNumber ?? null,
        invoiceId: x.invoiceId ?? null, invoiceNumber: x.invoiceNumber ?? null, invoiceStatus: x.invoiceStatus ?? null };
    }),
    encomiendas: moved.map((id) => ({ id, existed: encSnaps.has(id), manifestNumber: encSnaps.get(id)?.data()?.manifestNumber ?? null })),
  };

  // ── ONE commit ────────────────────────────────────────────────────────────────────────────────────
  const batch = writeBatch(db);
  for (const inv of drafts) batch.delete(doc(db, 'invoices', inv.id));
  for (const inv of toAnnul) {
    batch.update(doc(db, 'invoices', inv.id), {
      status: 'annulled', annulledAt: now, annulledBy: opts.movedBy, annulledReason: reason, updatedAt: now,
      statusHistory: arrayUnion({ status: 'annulled', changedAt: now, changedBy: opts.movedBy, reason }),
    });
  }
  const movedSet = new Set(moved);
  for (const id of pkgIds) {
    const x = (movedSnaps.get(id) ?? linked.get(id))?.data?.() ?? {};
    const unlink = !!x.invoiceId && touchedIds.has(x.invoiceId) || (!!x.invoiceNumber && touched.some((i) => i.data.invoiceNumber === x.invoiceNumber));
    const fields: Record<string, unknown> = { updatedAt: now };
    if (unlink) {
      fields.invoiceId = deleteField(); fields.invoiceNumber = deleteField(); fields.invoiceStatus = deleteField();
      fields.statusHistory = arrayUnion({ status: x.status || '', changedAt: now, changedBy: opts.movedBy,
        note: `Factura ${x.invoiceNumber || x.invoiceId} ${drafts.some((d) => d.id === x.invoiceId) ? 'borrador eliminada' : 'anulada'} por traslado a ${targetManifest} desde Nova.` });
    }
    if (movedSet.has(id)) {
      fields.manifestNumber = targetManifest;
      if (targetManifest.startsWith('ENC-')) fields.encomiendaManifestNumber = targetManifest;
    }
    batch.set(doc(db, 'packages', id), fields, { merge: true });
  }
  for (const id of moved) batch.set(doc(db, 'manifest_encomiendas', id), { manifestNumber: targetManifest, updatedAt: now }, { merge: true });
  await batch.commit();

  // ── After the commit: tell SP2 (the portal copy). SP1 is already consistent. ─────────────────────
  for (const inv of touched) {
    deleteInvoiceFromSp2(inv.id, inv.data.invoiceNumber || inv.id).catch((e) => console.warn('[moveTrackingsToManifestAtomic] SP2 invoice delete failed:', e));
  }
  const toSync = pkgIds.map((id) => {
    const x = (movedSnaps.get(id) ?? linked.get(id))?.data?.() ?? {};
    return { id, trackingNumber: x.trackingNumber || x.tracking || id, slCode: x.slCode || '', customerName: x.customerName || '', status: x.status,
      manifestNumber: movedSet.has(id) ? targetManifest : (x.manifestNumber || sourceManifest), forceSync: true };
  }).filter((p) => p.slCode);
  if (toSync.length) syncPackagesToSmartWeb(toSync).catch((e) => console.warn('[moveTrackingsToManifestAtomic] SP2 packages sync failed:', e));

  return { deletedDrafts: drafts.length, annulledIds: toAnnul.map((i) => i.id), skippedPaid, backup };
}

/** "Deshacer": invoices, package links and manifests back as they were — ONE commit. */
export async function undoMoveTrackingsAtomic(backup: MoveBackup, sourceManifest: string, opts: { undoneBy: string }): Promise<void> {
  const now = new Date().toISOString();
  const writes = backup.invoices.length + backup.packages.length + backup.encomiendas.length;
  if (writes > MAX_ATOMIC_WRITES) throw new Error(`Deshacer necesita ${writes} escrituras (máximo ${MAX_ATOMIC_WRITES}). No se modificó nada.`);
  const batch = writeBatch(db);
  for (const inv of backup.invoices) batch.set(doc(db, 'invoices', inv.id), inv.data);
  const opt = (v: unknown) => (v === null || v === undefined ? deleteField() : v);
  for (const p of backup.packages) {
    // A package document the move created is NOT deleted (same as before): it only goes back to its manifest.
    if (!p.existed) { batch.set(doc(db, 'packages', p.id), { manifestNumber: sourceManifest, encomiendaManifestNumber: deleteField(), updatedAt: now }, { merge: true }); continue; }
    batch.set(doc(db, 'packages', p.id), {
      manifestNumber: p.manifestNumber ?? sourceManifest, encomiendaManifestNumber: opt(p.encomiendaManifestNumber),
      invoiceId: opt(p.invoiceId), invoiceNumber: opt(p.invoiceNumber), invoiceStatus: opt(p.invoiceStatus), updatedAt: now,
      statusHistory: arrayUnion({ status: '', changedAt: now, changedBy: opts.undoneBy, note: 'Traslado deshecho desde Nova — paquete y factura restaurados.' }),
    }, { merge: true });
  }
  for (const e of backup.encomiendas) {
    batch.set(doc(db, 'manifest_encomiendas', e.id), { manifestNumber: e.manifestNumber ?? sourceManifest, updatedAt: now }, { merge: true });
  }
  await batch.commit();
}
