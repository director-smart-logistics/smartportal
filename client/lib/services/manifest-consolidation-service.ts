/**
 * manifest-consolidation-service
 *
 * CRUD and real-time subscriptions for the `manifest_consolidation` collection.
 *
 * This collection is the single source of truth for the Consolidation Manifests
 * view.  It starts EMPTY and only receives items when a user explicitly moves
 * a package / invoice item into it via the UI.
 *
 * Document ID = tracking number (uppercased).
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  deleteDoc,
  deleteField,
  onSnapshot,
  getDocs,
  query,
  where,
  arrayUnion,
  increment,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { annulInvoicesByTrackingsAndManifest } from './invoice-service';
import { deleteInvoiceFromSp2 } from './sync-invoices-service';

const COL = 'manifest_consolidation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManifestConsolidationItem {
  tracking: string;
  slCode: string;
  customerName: string;
  ruta: string;
  weight: number;
  price: number;
  currency: string;
  description: string;
  permisos: boolean;
  origin: string;
  /** Original manifest the package came from */
  manifestNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  /** Mirrored from the packages collection */
  status: string;
  movedAt: string;
}

// ─── Write helpers ────────────────────────────────────────────────────────────

const BATCH_SIZE = 490;

/**
 * Upserts one or more items into manifest_consolidation.
 * Document ID is the tracking number (uppercased).
 */
export async function addItemsToConsolidation(
  items: ManifestConsolidationItem[],
): Promise<void> {
  if (!items.length) return;
  const colRef = collection(db, COL);
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      const id = item.tracking.toUpperCase();
      batch.set(doc(colRef, id), { ...item, tracking: id }, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Removes a single item from manifest_consolidation (hard delete).
 */
export async function removeFromConsolidation(tracking: string): Promise<void> {
  await deleteDoc(doc(db, COL, tracking.toUpperCase()));
}

/**
 * Removes multiple items from manifest_consolidation in a single batch.
 */
export async function removeManyFromConsolidation(trackings: string[]): Promise<void> {
  if (!trackings.length) return;
  for (let i = 0; i < trackings.length; i += BATCH_SIZE) {
    const chunk = trackings.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const t of chunk) {
      batch.delete(doc(db, COL, t.toUpperCase()));
    }
    await batch.commit();
  }
}

/**
 * Migrates the embedded packages[] array inside the `manifests` collection docs
 * so that Nova reflects the correct manifest groupings after a consolidation move.
 *
 * Only updates docs that already exist — never creates new manifests docs.
 */
export async function movePackagesBetweenManifestDocs(
  trackings: string[],
  sourceManifest: string,
  newManifest: string,
  excludeInvoiceIds?: string[],
): Promise<void> {
  if (!trackings.length || !sourceManifest || !newManifest || sourceManifest === newManifest) return;
  const trackingSet = new Set(trackings.map(t => t.toUpperCase()));

  // Annul old invoices in source manifest for moved trackings
  await annulInvoicesByTrackingsAndManifest(trackings, sourceManifest, {
    annulledBy: 'system-move',
    reason: `Anulada por movimiento de paquetes a manifiesto ${newManifest}`,
    excludeInvoiceIds,
  }).catch((err) => {
    console.warn('[movePackagesBetweenManifestDocs] Failed to annul source invoices:', err);
  });

  const [srcSnap, destSnap] = await Promise.all([
    getDoc(doc(db, 'manifests', sourceManifest)),
    getDoc(doc(db, 'manifests', newManifest)),
  ]);

  if (!srcSnap.exists()) return;

  const srcPkgs: any[] = srcSnap.data().packages ?? [];
  const movedObjs    = srcPkgs.filter(p =>  trackingSet.has((p.tracking || '').toUpperCase()));
  const updatedSrc   = srcPkgs.filter(p => !trackingSet.has((p.tracking || '').toUpperCase()));

  if (movedObjs.length === 0) return;

  const srcWeight = updatedSrc.reduce((sum, p) => sum + (p.weight || 0), 0);
  const srcPrice = updatedSrc.reduce((sum, p) => sum + (p.price || 0), 0);
  const roundedSrcWeight = Math.round(srcWeight * 100) / 100;
  const roundedSrcPrice = Math.round(srcPrice * 100) / 100;

  const now   = new Date().toISOString();
  const batch = writeBatch(db);

  batch.update(doc(db, 'manifests', sourceManifest), {
    packages:      updatedSrc,
    totalPackages: updatedSrc.length,
    totalWeight:   roundedSrcWeight,
    totalPrice:    roundedSrcPrice,
    updatedAt:     now,
  });

  if (destSnap.exists()) {
    const destPkgs: any[] = destSnap.data().packages ?? [];
    const destSet = new Set(destPkgs.map(p => (p.tracking || '').toUpperCase()));
    const toAdd   = movedObjs.filter(p => !destSet.has((p.tracking || '').toUpperCase()));
    if (toAdd.length > 0) {
      const finalDestPkgs = [...destPkgs, ...toAdd];
      const destWeight = finalDestPkgs.reduce((sum, p) => sum + (p.weight || 0), 0);
      const destPrice = finalDestPkgs.reduce((sum, p) => sum + (p.price || 0), 0);
      const roundedDestWeight = Math.round(destWeight * 100) / 100;
      const roundedDestPrice = Math.round(destPrice * 100) / 100;

      batch.update(doc(db, 'manifests', newManifest), {
        packages:      finalDestPkgs,
        totalPackages: finalDestPkgs.length,
        totalWeight:   roundedDestWeight,
        totalPrice:    roundedDestPrice,
        updatedAt:     now,
      });
    }
  }

  await batch.commit();
}

/**
 * Comprehensive move for consolidation context:
 * 1. Finds the real `packages` doc by tracking field query → updates manifestNumber.
 * 2. Finds the destination manifest's active invoice for the same slCode → adds the item.
 * 3. Updates `manifest_consolidation` with new manifestNumber + destination invoice ref.
 *
 * Use this instead of updateConsolidationItemManifest when syncConsolidation = true.
 */
export async function moveConsolidationItem(
  tracking: string,
  newManifest: string,
  item: Pick<ManifestConsolidationItem, 'slCode' | 'customerName' | 'weight' | 'price' | 'currency' | 'description' | 'permisos'>,
  sourceManifest?: string,
): Promise<void> {
  const id  = tracking.toUpperCase();
  const now = new Date().toISOString();

  // ── 1. Find real package doc (tracking may not be Firestore doc ID) ────────
  const [snapT, snapTN] = await Promise.all([
    getDocs(query(collection(db, 'packages'), where('tracking',       '==', id))),
    getDocs(query(collection(db, 'packages'), where('trackingNumber', '==', id))),
  ]);
  const pkgDoc = !snapT.empty ? snapT.docs[0] : !snapTN.empty ? snapTN.docs[0] : null;

  // ── 2. Find active destination invoice (same slCode + new manifest) ─────────
  const [destSnap1, destSnap2] = await Promise.all([
    getDocs(query(
      collection(db, 'invoices'),
      where('slCode',         '==', item.slCode),
      where('manifestNumber', '==', newManifest),
    )),
    getDocs(query(
      collection(db, 'invoices'),
      where('clientSlCode',   '==', item.slCode),
      where('manifestNumber', '==', newManifest),
    )),
  ]);
  const destInvoiceDoc = [...destSnap1.docs, ...destSnap2.docs].find(d => {
    const s = d.data().status as string;
    return s !== 'annulled' && s !== 'cancelled';
  }) ?? null;

  const destInvData  = destInvoiceDoc ? destInvoiceDoc.data() as any : null;

  // ── 2b. Find active SOURCE invoice to annul ──────────────────────────────────
  const sourceInvoicesToAnnul: Array<{ id: string; num: string }> = [];
  const srcSeen = new Set<string>();

  // Check direct pkg.invoiceId
  const pkgData = pkgDoc?.data() as any;
  if (pkgData?.invoiceId) {
    try {
      const snapDirect = await getDoc(doc(db, 'invoices', pkgData.invoiceId));
      if (snapDirect.exists()) {
        const sData = snapDirect.data();
        if (sData.status !== 'annulled' && sData.status !== 'cancelled' && (sData.status || '').toLowerCase() !== 'paid') {
          srcSeen.add(snapDirect.id);
          sourceInvoicesToAnnul.push({ id: snapDirect.id, num: sData.invoiceNumber || snapDirect.id });
        }
      }
    } catch (err) {
      console.warn('[moveConsolidationItem] Error querying direct invoiceId:', err);
    }
  }

  // Check tracking queries
  try {
    const [snapTArr, snapTSingle] = await Promise.all([
      getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains', id))),
      getDocs(query(collection(db, 'invoices'), where('trackingNumber', '==', id))),
    ]);
    for (const d of [...snapTArr.docs, ...snapTSingle.docs]) {
      if (srcSeen.has(d.id)) continue;
      const sData = d.data();
      if (sData.status !== 'annulled' && sData.status !== 'cancelled' && (sData.status || '').toLowerCase() !== 'paid') {
        srcSeen.add(d.id);
        sourceInvoicesToAnnul.push({ id: d.id, num: sData.invoiceNumber || d.id });
      }
    }
  } catch (err) {
    console.warn('[moveConsolidationItem] Error querying invoices by tracking:', err);
  }

  // ── 3. Build batch ───────────────────────────────────────────────────────────
  const batch = writeBatch(db);

  // manifest_consolidation — use update() so deleteField() is fully supported
  // and onSnapshot listeners are reliably triggered.
  batch.update(doc(db, COL, id), {
    manifestNumber: newManifest,
    movedAt:        now,
    invoiceId:      deleteField(),
    invoiceNumber:  deleteField(),
    invoiceStatus:  deleteField(),
  });

  // packages — update manifestNumber on the REAL doc (found by query)
  if (pkgDoc) {
    batch.update(doc(db, 'packages', pkgDoc.id), {
      manifestNumber:    newManifest,
      manifestId:        newManifest,
      updatedManifest:   newManifest,
      manifestUpdatedAt: now,

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

  // source invoices — annul to prevent stale/phantom active billing!
  for (const srcInv of sourceInvoicesToAnnul) {
    batch.update(doc(db, 'invoices', srcInv.id), {
      status: 'annulled',
      annulledAt: now,
      annulledBy: 'system-move',
      annulledReason: `Paquete ${id} movido al manifiesto ${newManifest}`,
      updatedAt: now,
    });
  }

  // destination invoice — annul if present to force a fresh consolidated invoice for the new package group!
  if (destInvoiceDoc && !srcSeen.has(destInvoiceDoc.id)) {
    batch.update(doc(db, 'invoices', destInvoiceDoc.id), {
      status: 'annulled',
      annulledAt: now,
      annulledBy: 'system-move',
      annulledReason: 'Anulada por movimiento de paquetes — grupo de paquetes actualizado',
      updatedAt: now,
    });
  }

  await batch.commit();

  // Delete from SP2 portal for parity
  for (const srcInv of sourceInvoicesToAnnul) {
    try {
      await deleteInvoiceFromSp2(srcInv.id, srcInv.num);
    } catch (err) {
      console.warn('[moveConsolidationItem] failed to delete source invoice from SP2:', err);
    }
  }

  if (destInvoiceDoc && destInvData?.invoiceNumber && !srcSeen.has(destInvoiceDoc.id)) {
    try {
      await deleteInvoiceFromSp2(destInvoiceDoc.id, destInvData.invoiceNumber);
    } catch (err) {
      console.warn('[moveConsolidationItem] failed to delete destination invoice from SP2:', err);
    }
  }

  if (sourceManifest) {
    await movePackagesBetweenManifestDocs([tracking], sourceManifest, newManifest);
  }
}

type BulkMoveItem = Pick<
  ManifestConsolidationItem,
  'tracking' | 'slCode' | 'customerName' | 'weight' | 'price' | 'currency' | 'description' | 'permisos'
>;

/**
 * Bulk version of moveConsolidationItem.
 * Queries real package docs and destination invoices once per slCode, then
 * commits all manifest_consolidation + packages + invoice updates in chunks.
 */
export async function bulkMoveConsolidationItems(
  items: BulkMoveItem[],
  newManifest: string,
  sourceManifest?: string,
): Promise<void> {
  if (!items.length) return;
  const now = new Date().toISOString();

  // ── 1. Resolve real package docs (batch querying in chunks of 30) ───────────
  const allTrackingIds = [...new Set(items.map(item => item.tracking.toUpperCase()))];
  const CHUNK_SIZE = 30;
  const trackingChunks: string[][] = [];
  for (let i = 0; i < allTrackingIds.length; i += CHUNK_SIZE) {
    trackingChunks.push(allTrackingIds.slice(i, i + CHUNK_SIZE));
  }

  const pkgDocsByTracking = new Map<string, any>();
  for (const chunk of trackingChunks) {
    const [snapT, snapTN] = await Promise.all([
      getDocs(query(collection(db, 'packages'), where('tracking', 'in', chunk))),
      getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk))),
    ]);
    for (const d of [...snapT.docs, ...snapTN.docs]) {
      const data = d.data() as any;
      const t1 = String(data.tracking || '').toUpperCase().trim();
      const t2 = String(data.trackingNumber || '').toUpperCase().trim();
      if (t1 && !pkgDocsByTracking.has(t1)) pkgDocsByTracking.set(t1, d);
      if (t2 && !pkgDocsByTracking.has(t2)) pkgDocsByTracking.set(t2, d);
    }
  }

  const pkgResolutions = items.map(item => {
    const id = item.tracking.toUpperCase();
    return { id, pkgDoc: pkgDocsByTracking.get(id) || null };
  });

  // ── 2. Destination invoices — one query per unique slCode ──────────────────
  const slCodes = [...new Set(items.map(i => i.slCode).filter(Boolean))];
  const destInvoicesBySlCode = new Map<string, { id: string; data: any } | null>();
  await Promise.all(slCodes.map(async slCode => {
    const [snap1, snap2] = await Promise.all([
      getDocs(query(
        collection(db, 'invoices'),
        where('slCode',         '==', slCode),
        where('manifestNumber', '==', newManifest),
      )),
      getDocs(query(
        collection(db, 'invoices'),
        where('clientSlCode',   '==', slCode),
        where('manifestNumber', '==', newManifest),
      )),
    ]);
    const found = [...snap1.docs, ...snap2.docs].find(d => {
      const s = d.data().status as string;
      return s !== 'annulled' && s !== 'cancelled';
    }) ?? null;
    destInvoicesBySlCode.set(slCode, found ? { id: found.id, data: found.data() } : null);
  }));

  // ── 2b. Source invoices to annul ───────────────────────────────────────────
  const sourceInvoicesToAnnul = new Map<string, { id: string; num: string }>();
  const srcSeen = new Set<string>();

  // Check direct package invoiceIds
  const directInvIds = [...new Set(
    Array.from(pkgDocsByTracking.values())
      .map(d => (d.data() as any)?.invoiceId)
      .filter(Boolean)
  )];
  for (const invId of directInvIds) {
    try {
      const snapDirect = await getDoc(doc(db, 'invoices', invId));
      if (snapDirect.exists()) {
        const sData = snapDirect.data();
        if (sData.status !== 'annulled' && sData.status !== 'cancelled' && (sData.status || '').toLowerCase() !== 'paid') {
          srcSeen.add(snapDirect.id);
          sourceInvoicesToAnnul.set(snapDirect.id, { id: snapDirect.id, num: sData.invoiceNumber || snapDirect.id });
        }
      }
    } catch (err) {
      console.warn('[bulkMoveConsolidationItems] Error querying direct invoiceId:', err);
    }
  }

  // Check tracking queries in chunks
  for (const chunk of trackingChunks) {
    try {
      const [snapArr, snapSingle] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains-any', chunk.slice(0, 10)))),
        getDocs(query(collection(db, 'invoices'), where('trackingNumber', 'in', chunk.slice(0, 10)))),
      ]);
      for (const d of [...snapArr.docs, ...snapSingle.docs]) {
        if (srcSeen.has(d.id)) continue;
        const sData = d.data();
        if (sData.status !== 'annulled' && sData.status !== 'cancelled' && (sData.status || '').toLowerCase() !== 'paid') {
          srcSeen.add(d.id);
          sourceInvoicesToAnnul.set(d.id, { id: d.id, num: sData.invoiceNumber || d.id });
        }
      }
    } catch (err) {
      console.warn('[bulkMoveConsolidationItems] Error querying invoices by tracking chunk:', err);
    }
  }

  // ── 3. Build ops list ──────────────────────────────────────────────────────
  type Op = { ref: ReturnType<typeof doc>; data: Record<string, unknown>; isSet?: boolean };
  const ops: Op[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const { id, pkgDoc } = pkgResolutions[idx];
    const destInv = destInvoicesBySlCode.get(item.slCode) ?? null;

    // manifest_consolidation update
    ops.push({
      ref: doc(db, COL, id),
      data: {
        manifestNumber: newManifest,
        movedAt:        now,
        invoiceId:      destInv ? destInv.id                   : deleteField(),
        invoiceNumber:  destInv ? destInv.data.invoiceNumber    : deleteField(),
        invoiceStatus:  destInv ? destInv.data.status           : deleteField(),
      },
    });

    // real packages update
    if (pkgDoc) {
      ops.push({
        ref: doc(db, 'packages', pkgDoc.id),
        data: {
          manifestNumber: newManifest,
          manifestId: newManifest,
          updatedManifest: newManifest,
          manifestUpdatedAt: now,
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
        },
      });
    }
  }

  // Add annul operations for any found source invoices
  for (const [invId, invMeta] of sourceInvoicesToAnnul) {
    ops.push({
      ref: doc(db, 'invoices', invId),
      data: {
        status: 'annulled',
        annulledAt: now,
        annulledBy: 'system-move',
        annulledReason: `Paquetes movidos al manifiesto ${newManifest}`,
        updatedAt: now,
      },
    });
    // Delete from SP2 in background
    deleteInvoiceFromSp2(invId, invMeta.num).catch(() => {});
  }

  // Add annul operations for any found destination invoices to force fresh billing
  for (const slCode of slCodes) {
    const destInv = destInvoicesBySlCode.get(slCode) ?? null;
    if (destInv && !sourceInvoicesToAnnul.has(destInv.id)) {
      ops.push({
        ref: doc(db, 'invoices', destInv.id),
        data: {
          status: 'annulled',
          annulledAt: now,
          annulledBy: 'system-move',
          annulledReason: 'Anulada por movimiento masivo de paquetes — grupo de paquetes actualizado',
          updatedAt: now,
        },
      });
      // Delete from SP2 in background
      deleteInvoiceFromSp2(destInv.id, destInv.data.invoiceNumber || destInv.id).catch(() => {});
    }
  }

  // ── 4. Commit in chunks of BATCH_SIZE ──────────────────────────────────────
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const { ref, data } of chunk) {
      batch.update(ref, data);
    }
    await batch.commit();
  }

  // ── 5. Migrate embedded packages[] in manifests docs so Nova reflects the move
  if (sourceManifest) {
    await movePackagesBetweenManifestDocs(
      items.map(i => i.tracking.toUpperCase()),
      sourceManifest,
      newManifest,
    );
  }

  // ── 6. For MEGA-MAN destinations: guarantee items appear in the embedded array
  //    Packages moved from manifest_consolidation may not exist in any source
  //    manifest's embedded packages[] (step 5 would skip them). This ensures
  //    Nova's "Cargar" always loads the complete set. Idempotent.
  const upperManifest = newManifest.toUpperCase();
  if (upperManifest.startsWith('MEGA-MAN-') || upperManifest.startsWith('SL-MEGA-MAN-')) {
    await syncConsolidationGroupToManifest(newManifest, items.map(i => ({
      tracking:     i.tracking,
      slCode:       i.slCode,
      customerName: i.customerName || '',
      weight:       i.weight ?? 0,
      price:        i.price ?? 0,
      description:  i.description || '',
      permisos:     i.permisos ?? false,
    }))).catch(() => {});
  }
}

/**
 * Repair helper: adds any consolidation items that are missing from the
 * `manifests/[manifestNumber].packages[]` array so Nova reflects them.
 *
 * Safe to call multiple times — idempotent (only adds what is absent).
 * Returns the number of packages actually added.
 */
export async function syncConsolidationGroupToManifest(
  manifestNumber: string,
  items: Pick<ManifestConsolidationItem, 'tracking' | 'slCode' | 'customerName' | 'weight' | 'price' | 'description' | 'permisos'>[],
): Promise<number> {
  if (!items.length || !manifestNumber) return 0;

  const manifestSnap = await getDoc(doc(db, 'manifests', manifestNumber));
  if (!manifestSnap.exists()) return 0;

  const existingPkgs: any[] = manifestSnap.data().packages ?? [];
  const existingSet = new Set(existingPkgs.map((p: any) => (p.tracking || '').toUpperCase()));

  const toAdd = items
    .filter(i => !existingSet.has(i.tracking.toUpperCase()))
    .map(i => ({
      tracking:       i.tracking.toUpperCase(),
      slCode:         i.slCode,
      customerName:   i.customerName,
      customerEmail:  '',
      ruta:           (i as any).ruta || '',
      weight:         i.weight,
      price:          i.price,
      isConsolidated: false,
      requiresPermit: i.permisos,
      description:    i.description,
    }));

  if (toAdd.length === 0) return 0;

  const updatedPkgs = [...existingPkgs, ...toAdd];
  const batch = writeBatch(db);
  batch.update(doc(db, 'manifests', manifestNumber), {
    packages:      updatedPkgs,
    totalPackages: updatedPkgs.length,
    updatedAt:     new Date().toISOString(),
  });
  await batch.commit();
  return toAdd.length;
}

/**
 * Upserts packages from the `packages` collection into the
 * `manifests/[manifestNumber]` doc so Nova reflects them.
 *
 * Creates the manifest doc if it does not yet exist.
 * Idempotent: skips packages already present by tracking number.
 */
export async function upsertPackagesToManifestDoc(
  manifestNumber: string,
  pkgs: Array<{
    tracking: string;
    slCode?: string;
    customerName?: string;
    customerEmail?: string;
    ruta?: string;
    weight?: number;
    price?: number;
    description?: string;
    permisos?: boolean;
  }>,
): Promise<number> {
  if (!pkgs.length || !manifestNumber) return 0;
  const now = new Date().toISOString();
  const manifestRef = doc(db, 'manifests', manifestNumber);
  const manifestSnap = await getDoc(manifestRef);

  // Only update if the manifest doc already exists — never create orphan manifest docs.
  if (!manifestSnap.exists()) return 0;

  const existing: any[] = manifestSnap.data().packages ?? [];
  const existingMap = new Map<string, any>(
    existing.map((p: any) => [(p.tracking || '').toUpperCase(), p])
  );

  let addedCount = 0;
  for (const p of pkgs) {
    if (!p.tracking) continue;
    const trackingId = p.tracking.toUpperCase();
    const incoming = {
      tracking:       trackingId,
      slCode:         p.slCode        ?? '',
      customerName:   p.customerName  ?? '',
      customerEmail:  p.customerEmail ?? '',
      ruta:           p.ruta          ?? '',
      weight:         p.weight        ?? 0,
      price:          p.price         ?? 0,
      isConsolidated: false,
      requiresPermit: p.permisos      ?? false,
      description:    p.description   ?? '',
    };
    if (!existingMap.has(trackingId)) {
      addedCount++;
    }
    // Upsert: overwrite existing entry with fresh data OR add new
    existingMap.set(trackingId, incoming);
  }

  const updatedPkgs = Array.from(existingMap.values());
  await setDoc(manifestRef, {
    packages:      updatedPkgs,
    totalPackages: updatedPkgs.length,
    updatedAt:     now,
  }, { merge: true });
  return addedCount;
}

/**
 * Copies the embedded packages[] from `sourceManifestId` into
 * `targetManifestId` (update-only — both docs must exist).
 * Used after a Nova manifest fusion so that the target portal doc
 * shows ALL packages from every merged source.
 * Returns the number of packages added (0 if nothing new).
 */
export async function mergeManifestDocs(
  sourceManifestId: string,
  targetManifestId: string,
): Promise<number> {
  if (!sourceManifestId || !targetManifestId || sourceManifestId === targetManifestId) return 0;
  const [srcSnap, destSnap] = await Promise.all([
    getDoc(doc(db, 'manifests', sourceManifestId)),
    getDoc(doc(db, 'manifests', targetManifestId)),
  ]);
  if (!srcSnap.exists() || !destSnap.exists()) return 0;
  const srcPkgs: any[] = srcSnap.data().packages ?? [];
  if (srcPkgs.length === 0) return 0;
  const destPkgs: any[] = destSnap.data().packages ?? [];
  const destSet = new Set(destPkgs.map((p: any) => (p.tracking || '').toUpperCase()));
  const toAdd = srcPkgs.filter(p => !destSet.has((p.tracking || '').toUpperCase()));
  if (toAdd.length === 0) return 0;
  const merged = [...destPkgs, ...toAdd];
  const now = new Date().toISOString();
  await setDoc(doc(db, 'manifests', targetManifestId), {
    packages:      merged,
    totalPackages: merged.length,
    updatedAt:     now,
  }, { merge: true });
  return toAdd.length;
}

/**
 * Updates `manifestNumber` on existing `manifest_consolidation` docs for the
 * given trackings.  Only touches docs that already exist — never creates new
 * ones.  Safe to call from bulk-update flows on Firestore-native packages.
 */
export async function batchUpdateConsolidationManifest(
  trackings: string[],
  newManifest: string,
): Promise<void> {
  if (!trackings.length || !newManifest) return;
  const now = new Date().toISOString();
  const BATCH_SIZE = 490;
  // Check existence in parallel first, then batch-write only those that exist
  const snaps = await Promise.all(
    trackings.map(t => getDoc(doc(db, COL, t.toUpperCase())))
  );
  const existing = snaps.filter(s => s.exists());
  if (existing.length === 0) return;
  for (let i = 0; i < existing.length; i += BATCH_SIZE) {
    const chunk = existing.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(s => {
      batch.update(doc(db, COL, s.id), {
        manifestNumber: newManifest,
        movedAt:        now,
      });
    });
    await batch.commit();
  }
}

export async function updateConsolidationItemManifest(
  tracking: string,
  newManifest: string,
): Promise<void> {
  const id = tracking.toUpperCase();
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  // Clear old invoice ref — item gets a fresh invoice when the new manifest is billed.
  batch.update(doc(db, COL, id), {
    manifestNumber: newManifest,
    movedAt:        now,
    invoiceId:      deleteField(),
    invoiceNumber:  deleteField(),
    invoiceStatus:  deleteField(),
  });
  batch.set(doc(db, 'packages', id), {
    updatedManifest: newManifest,
    manifestUpdatedAt: now,

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
  }, { merge: true });
  await batch.commit();
}

// ─── Real-time subscription ───────────────────────────────────────────────────

/**
 * Subscribe to all documents in manifest_consolidation.
 * Returns an unsubscribe function.
 */
export function subscribeConsolidationItems(
  onChange: (items: ManifestConsolidationItem[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, COL),
    snap => onChange(snap.docs.map(d => d.data() as ManifestConsolidationItem)),
    err => onError?.(err as Error),
  );
}

// ─── Package lookup ───────────────────────────────────────────────────────────

/**
 * Looks up packages by tracking number or suffix/substring in the `packages` collection and
 * enriches them with price data from any linked invoice.
 */
export async function lookupPackagesForConsolidation(
  tracking: string,
): Promise<ManifestConsolidationItem[]> {
  const id = tracking.toUpperCase().trim();
  if (!id) return [];

  const colRef = collection(db, 'packages');
  const seen = new Set<string>();
  const matchingDocs: any[] = [];

  const addDocs = (snap: any) => {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      matchingDocs.push(d);
    }
  };

  // 1. Try exact matches first
  const promises: Promise<any>[] = [
    getDocs(query(colRef, where('tracking', '==', id))),
    getDocs(query(colRef, where('trackingNumber', '==', id))),
  ];
  if (id.toUpperCase().startsWith('SL') && id.length >= 3) {
    promises.push(
      getDocs(
        query(
          colRef,
          where('slCode', '==', id),
          where('manifestId', '==', 'consolidacion_transitoria')
        )
      )
    );
  }
  const results = await Promise.all(promises);
  addDocs(results[0]);
  addDocs(results[1]);
  if (results[2]) {
    addDocs(results[2]);
  }

  // 2. Try suffix match if query is length >= 4
  if (id.length >= 4) {
    const snapSuffix = await getDocs(query(colRef, where('trackingSuffixes', 'array-contains', id)));
    addDocs(snapSuffix);
  }

  // 3. Fallback: query recent packages and search in-memory for substring or suffix matches
  // This ensures that even if suffixes are not backfilled or query is short, we find recent matches.
  if (matchingDocs.length === 0) {
    const recentSnap = await getDocs(
      query(colRef, orderBy('createdAt', 'desc'), limit(1500))
    );
    const matches = recentSnap.docs.filter((d) => {
      const data = d.data() as any;
      const t = (data.tracking || data.trackingNumber || '').toUpperCase();
      return t.endsWith(id) || t.includes(id);
    });
    for (const d of matches) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      matchingDocs.push(d);
    }
  }

  if (matchingDocs.length === 0) return [];

  // For all matched package documents, enrich them with invoice details in parallel
  const enrichPromises = matchingDocs.map(async (pkgDoc) => {
    const data = pkgDoc.data() as any;
    const pkgTracking = (data.tracking || data.trackingNumber || pkgDoc.id).toUpperCase();
    
    let price: number = data.price ?? data.precio ?? 0;
    let invoiceId: string | undefined;
    let invoiceNumber: string | undefined;
    let invoiceStatus: string | undefined;

    const [snapArr, snapSingle] = await Promise.all([
      getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains', pkgTracking))),
      getDocs(query(collection(db, 'invoices'), where('trackingNumber', '==', pkgTracking))),
    ]);
    const invDoc =
      !snapArr.empty ? snapArr.docs[0] : !snapSingle.empty ? snapSingle.docs[0] : null;

    if (invDoc) {
      const inv = invDoc.data() as any;
      invoiceId     = invDoc.id;
      invoiceNumber = inv.invoiceNumber;
      invoiceStatus = inv.status;
      const invItem = (inv.invoiceItems || []).find(
        (i: any) => (i.trackingNumber || '').toUpperCase() === pkgTracking,
      );
      if (invItem) {
        price = invItem.totalPrice ?? invItem.unitPrice ?? price;
      } else if (inv.totalAmount > 0) {
        price = inv.totalAmount;
      }
    }

    return {
      tracking:      pkgTracking,
      slCode:        data.slCode || data.userId || '',
      customerName:  data.customerName || data.nombreCliente || data.nombre || '',
      ruta:          data.ruta || '',
      weight:        typeof data.weight === 'number' ? data.weight : (data.peso ?? 0),
      price,
      currency:      'USD',
      description:   data.description || data.descripcion || '',
      permisos:      !!(data.requiresPermit || data.permisos),
      origin:        data.origin || data.origen || 'Miami, FL',
      manifestNumber: data.manifestNumber || data.manifiesto || '',
      invoiceId,
      invoiceNumber,
      invoiceStatus,
      status:        data.status || '',
      movedAt:       new Date().toISOString(),
    };
  });

  return Promise.all(enrichPromises);
}

/**
 * Looks up a package by tracking number in the `packages` collection and
 * enriches it with price data from any linked invoice.
 *
 * Returns null when the tracking is not found.
 */
export async function lookupPackageForConsolidation(
  tracking: string,
): Promise<ManifestConsolidationItem | null> {
  const results = await lookupPackagesForConsolidation(tracking);
  return results.length > 0 ? results[0] : null;
}
