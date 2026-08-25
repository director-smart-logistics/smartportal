import { 
  collection, 
  doc, 
  writeBatch, 
  setDoc, 
  getDoc, 
  updateDoc,
  query, 
  where, 
  getDocs, 
  runTransaction,
  documentId,
  getCountFromServer,
  serverTimestamp,
  deleteField,
  deleteDoc,
  arrayUnion,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { logAction, getManifestMoveHistory, type ManifestMoveEvent } from '../audit-service';
import {
  type ProcessingResult,
  type ManifestRecord,
  type ConsolidationManifestRow,
  type MegaManRecord,
  type ManifestRow,
  type ManifestType
} from './types';
import { formatTracking, formatName } from './parser';
import { saveManifestMergedLink } from './ingestion';
import { calculatePrice } from '@/lib/utils/pricing';

export async function backfillMegaManFusedSources(
  megaManId: string,
  sourceIds: string[],
): Promise<void> {
  if (!megaManId || sourceIds.length === 0) return;
  try {
    const megaRef = doc(collection(db, 'manifests'), megaManId);
    const snap    = await getDoc(megaRef);
    if (!snap.exists()) return;
    const existing = snap.data();
    // Skip if already backfilled with the same sources
    const current = existing.fusedManifests as string[] | undefined;
    if (Array.isArray(current) && current.length >= sourceIds.length) return;

    // Write fusedManifests on the MEGA-MAN doc
    await setDoc(megaRef, { fusedManifests: sourceIds }, { merge: true });

    // Fix each source stub: ensure mergedInto points to the MEGA-MAN ID
    await Promise.all(
      sourceIds.map(srcId =>
        setDoc(doc(collection(db, 'manifests'), srcId), {
          mergedInto: megaManId,
          source:     'nova_fusion',
        }, { merge: true }).catch(() => {})
      )
    );
  } catch {
    // Non-fatal — backfill is best-effort
  }
}

/**
 * Main manifest hydrator for Nova Table and Firestore read paths.
 * 
 * CRITICAL ARCHITECTURE RULE (AGENTS.md Rule 7):
 * When `megaManId` is a regular source manifest (e.g. `23-07-2026DAN`), this function MUST:
 * 1. Filter the `packages` collection direct query results.
 * 2. Filter the `embeddedSupplement` array (stored inside `manifests/{id}.packages`).
 * 
 * ANY package with `ruta === 'Encomiendas'` or `encomiendaManifestNumber.startsWith('ENC-MEGA-MAN-')`
 * MUST BE EXCLUDED when loading regular non-ENC manifests.
 * DO NOT REMOVE THIS EXCLUSION GUARD — IT PREVENTS ENCOMIENDA PACKAGES FROM RE-APPEARING IN AIR CARGO VIEWS.
 */
export async function loadMegaManFromFirestore(megaManId: string): Promise<ProcessingResult | null> {
  try {
    // ── 1. Manifest metadata (manifestType, shippingType, etc.) ──────────────
    const manifestSnap = await getDoc(doc(collection(db, 'manifests'), megaManId));
    const manifestData = manifestSnap.exists() ? manifestSnap.data() : null;

    const deletedTrackingsSet = new Set<string>(
      (Array.isArray(manifestData?.deletedTrackings) ? manifestData.deletedTrackings : [])
        .map((t: string) => String(t || '').toUpperCase().trim())
        .filter(Boolean)
    );

    // ── 2. Resolve source manifest IDs for rich package data ────────────────────
    // Fusion does NOT migrate package docs — they keep their source manifestNumber.
    // We must query those source manifests to get live data (status, invoiceNumber, etc.).
    const fusedFrom: string[] = [
      ...(Array.isArray(manifestData?.fusedFrom)       ? (manifestData.fusedFrom       as string[]) : []),
      ...(Array.isArray(manifestData?.fusedManifests)  ? (manifestData.fusedManifests  as string[]) : []),
    ].map(id => id.trim()).filter((v, i, a) => Boolean(v) && a.indexOf(v) === i); // unique, non-empty

    const searchTerms = await resolveManifestAliases(fusedFrom);

    // ── 3. Parallel fetch: packages (direct + source manifests) + manifest_consolidation + invoices ──
    // BUG-LOST-PER-ROW-SLCODE 2026-04-29: We also fetch invoices for the
    // manifest so the hydrator can SELF-HEAL when the embedded packages
    // array drifted out of sync with reality. Active invoices are the
    // operator's last explicit billing decision — if an invoice ties
    // tracking T to slCode SL-NAN-X, we trust that over a (potentially
    // corrupted) embedded array entry that maps the same T to a different
    // slCode. This restores correct grouping after history-corrupting
    // events like a fresh-parse of the same Excel overwriting a curated
    // save with stale data.
    const [pkgsDirectSnap, consolidationSnap, invoicesSnap, ...sourceSnaps] = await Promise.all([
      getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', megaManId))),
      getDocs(query(collection(db, 'manifest_consolidation'), where('manifestNumber', '==', megaManId))),
      getDocs(query(collection(db, 'invoices'), where('manifestNumber', '==', megaManId)))
        .catch(() => ({ docs: [] as any[] })),
      ...searchTerms.map(srcId =>
        getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', srcId)))
          .catch(() => ({ docs: [] as any[] }))
      ),
    ]);

    // Embedded array — build a lookup map for supplementary fields (ruta, description, etc.)
    // that may not be present in the packages collection docs.
    const embedded: any[] = (manifestData && Array.isArray(manifestData.packages))
      ? manifestData.packages
      : [];
    const embeddedMap = new Map<string, any>(
      embedded.map(p => [String(p.tracking || '').toUpperCase(), p])
    );

    // ── Invoice-derived slCode map (self-healing source of truth) ────────
    // For each tracking covered by an ACTIVE (non-annulled) invoice, record
    // the invoice's clientSlCode + customerName + ruta. This map is queried
    // BELOW when assembling each package's row so per-package billing
    // identity survives even when the embedded array got overwritten.
    //
    // Conflict resolution: if two active invoices reference the same
    // tracking (rare but possible after a "Re-crear factura" cycle), the
    // first one wins — they should agree on slCode anyway. Annulled /
    // cancelled / void invoices are ignored: they're tombstones, not
    // current truth.
    const trackingToInvoiceMeta = new Map<string, { slCode: string; customerName: string; ruta: string; invoiceNumber: string }>();
    (invoicesSnap.docs as any[]).forEach((d: any) => {
      const inv = d.data();
      const status = String(inv.status || '').toLowerCase();
      if (status === 'annulled' || status === 'cancelled' || status === 'void') return;
      const slCode = String(inv.clientSlCode || inv.slCode || '').trim();
      if (!slCode) return;
      const trackings: string[] = [
        ...(Array.isArray(inv.trackingNumbers) ? inv.trackingNumbers : []),
        ...(inv.trackingNumber ? [inv.trackingNumber] : []),
      ].map(t => String(t || '').toUpperCase().trim()).filter(Boolean);
      const meta = {
        slCode,
        customerName: String(inv.clientName || inv.customerName || '').trim(),
        ruta: String(inv.clientRoute || inv.ruta || '').trim(),
        invoiceNumber: String(inv.invoiceNumber || ''),
      };
      trackings.forEach(t => {
        if (!trackingToInvoiceMeta.has(t)) trackingToInvoiceMeta.set(t, meta);
      });
    });

    let sourcePackages: any[];
    // Priority order:
    //  1. packages collection — direct (manifestNumber == MEGA-MAN, rare after fusion)
    //  2. packages collection — source manifests (fusedFrom), rich live data;
    //     merged with embedded array for supplementary fields (ruta, description, etc.)
    //  3. manifest_consolidation — items moved from consolidation view (pkgDoc was null)
    //  4. embedded array — fallback for anything not covered above
    // BUG-DIRECT-PKGS-NO-EMBED-MERGE 2026-04-29: Previously these packages were
    // returned as-is from the packages collection without merging with the
    // embedded array in the manifest doc. Only sourcePkgs (from fusedFrom source
    // manifests) applied the embeddedMap merge. This meant that manual overrides
    // saved via saveManifestRecord (slCode, customerName, ruta, etc.) were
    // ignored on reload for non-fused manifests — the packages collection value
    // (pre-override, e.g. slCode: '') always won. Apply the same merge here.
    const pkgsDirectFromCollection = pkgsDirectSnap.docs.map(d => {
      const p: any = { id: d.id, ...d.data() };
      const tracking = String(p.tracking || p.trackingNumber || '').toUpperCase();
      const ed = (embeddedMap.get(tracking) ?? {}) as any;
      // BUG-LOST-PER-ROW-SLCODE 2026-04-29: packages collection is the
      // architectural source of truth per-tracking (set by
      // ingestManifestToPackages on every "Guardar en BD"). Priority:
      //   1. packages.slCode — primary source of truth.
      //   2. invoice.slCode — fallback when packages has no record yet
      //      (e.g. row was invoiced but never ingested in this manifest).
      //   3. embedded.slCode — final fallback (legacy / autosave-only).
      // The `??` chain preserves empty strings: when the operator unlinks
      // and ingests, packages.slCode = '' wins over any (now-stale)
      // invoice reference. Same applies to customerName + ruta.
      const inv = trackingToInvoiceMeta.get(tracking);
      return {
        ...p,
        customerName:       ed?.customerName ?? p.customerName ?? inv?.customerName ?? '',
        slCode:             ed?.slCode       ?? p.slCode       ?? inv?.slCode       ?? '',
        ruta:               ed?.ruta         ?? p.ruta         ?? inv?.ruta         ?? '',
        description:        p.description        ?? ed?.description   ?? '',
        matchSource:        p.matchSource        ?? ed?.matchSource   ?? '',
        matchScore:         p.matchScore         ?? ed?.matchScore,
        precioSinPermiso:   p.precioSinPermiso   ?? ed?.precioSinPermiso,
        precioConPermiso:   p.precioConPermiso   ?? ed?.precioConPermiso,
        pesoRedondeo:       p.pesoRedondeo       ?? ed?.pesoRedondeo,
        diferenciaRedondeo: p.diferenciaRedondeo ?? ed?.diferenciaRedondeo,
        pesoConsolidacion:  p.pesoConsolidacion  ?? ed?.pesoConsolidacion,
        ajustePrecio:       p.ajustePrecio       ?? ed?.ajustePrecio       ?? null,
        precioAjustado:     p.ajustePrecio?.precioAjustado ?? ed?.ajustePrecio?.precioAjustado ?? null,
      };
    }).filter((p: any) => {
      const tracking = String(p.tracking || p.trackingNumber || '').toUpperCase().trim();
      if (deletedTrackingsSet.has(tracking)) return false;

      const upperMegaId = megaManId.toUpperCase();
      const currentMn = String(p.manifestNumber || '').toUpperCase();
      const currentEncMn = String(p.encomiendaManifestNumber || '').toUpperCase();

      // EXCLUSION GUARD: If loading a regular source manifest, exclude any package moved to an ENC-MEGA-MAN
      const isMegaContainer = upperMegaId.startsWith('ENC-MEGA-MAN-') || upperMegaId.startsWith('SL-MEGA-MAN-') || upperMegaId.startsWith('MEGA-MAN-');
      if (!isMegaContainer) {
        if (currentMn.startsWith('ENC-MEGA-MAN-') || currentEncMn.startsWith('ENC-MEGA-MAN-')) {
          return false;
        }
      }

      if (!upperMegaId.startsWith('ENC-')) return true;
      const hasTrc = embeddedMap.has(tracking);
      const isEncManifest = currentEncMn === upperMegaId;
      return p.ruta === 'Encomiendas' || isEncManifest || hasTrc;
    });
    const directTrackingSet = new Set(
      pkgsDirectFromCollection.map((p: any) => String(p.tracking || p.trackingNumber || '').toUpperCase())
    );

    // Source manifest packages: merge packages collection data (primary) with
    // embedded array data (supplementary). Embedded fills missing fields like ruta.
    const sourcePkgsRaw = (sourceSnaps as any[]).flatMap((snap: any) =>
      snap.docs
        .map((d: any) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => {
          const tracking = String(p.tracking || p.trackingNumber || '').toUpperCase().trim();
          if (deletedTrackingsSet.has(tracking)) return false;

          const upperMegaId = megaManId.toUpperCase();
          const currentMn = String(p.manifestNumber || '').toUpperCase();
          const currentEncMn = String(p.encomiendaManifestNumber || '').toUpperCase();

          const isMegaContainer = upperMegaId.startsWith('ENC-MEGA-MAN-') || upperMegaId.startsWith('SL-MEGA-MAN-') || upperMegaId.startsWith('MEGA-MAN-');
          if (!isMegaContainer) {
            if (currentMn.startsWith('ENC-MEGA-MAN-') || currentEncMn.startsWith('ENC-MEGA-MAN-')) {
              return false;
            }
          }

          if (!upperMegaId.startsWith('ENC-')) return true;
          const hasTrc = embeddedMap.has(tracking);
          const isEncManifest = currentEncMn === upperMegaId;
          return p.ruta === 'Encomiendas' || isEncManifest || hasTrc;
        })
    );
    const sourcePkgs = sourcePkgsRaw
      .filter((p: any) => !directTrackingSet.has(String(p.tracking || p.trackingNumber || '').toUpperCase()))
      .map((p: any) => {
        const tracking = String(p.tracking || p.trackingNumber || '').toUpperCase();
        const embeddedData = embeddedMap.get(tracking) ?? {};
        // Merge strategy:
        //  1. packages collection is the base (has status, invoiceNumber, weight, price — live data)
        //  2. embedded array overrides identity fields (customerName, slCode, ruta, description)
        //     because the embedded array is written by saveManifestRecord from Nova's AI matching
        //     during fusion, which is more recent and accurate than the pre-fusion source manifest
        //     processing stored in the packages collection.
        // This ensures that after fusion, the correct customer associations from Nova are displayed
        // regardless of whether linkPackagesToMegaMan has finished its background update yet.
        // ── Round-trip fidelity (BUG-CURATED-DESTROYED 2026-04-29) ───────────
        // The embedded array now stores `matchSource`, `matchScore`,
        // `precioSinPermiso`, `precioConPermiso`, plus the rounded-weight
        // breakdown. Pull those forward when present so the table reflects
        // the exact state at save time. Falsy fields fall back to the
        // packages-collection doc, then to the legacy reconstruction in the
        // hydrator below — old manifests keep working unchanged.
        // BUG-FIX-UNLINKED-EMPTY-STRING 2026-04-29: Use nullish coalescing (??)
        // instead of logical OR (||) for string fields where empty string is a
        // valid value (e.g., slCode after unlink). The ?? operator only falls
        // back when the value is null/undefined, not when it's '' (empty).
        // Without this fix, an unlinked row saved with slCode: '' would be
        // overwritten by the packages-collection value on reload.
        const ed = embeddedData as any;
        // BUG-LOST-PER-ROW-SLCODE 2026-04-29: packages > invoice > embedded
        // priority (same as direct path) so fused manifests self-heal too.
        const inv = trackingToInvoiceMeta.get(tracking);
        return {
          ...p,
          customerName:        ed?.customerName ?? p.customerName ?? inv?.customerName ?? '',
          slCode:              ed?.slCode       ?? p.slCode       ?? inv?.slCode       ?? '',
          ruta:                ed?.ruta         ?? p.ruta         ?? inv?.ruta         ?? '',
          description:         p.description        ?? ed?.description ?? '',
          matchSource:         p.matchSource        ?? ed?.matchSource ?? '',
          matchScore:          p.matchScore         ?? ed?.matchScore,
          precioSinPermiso:    p.precioSinPermiso   ?? ed?.precioSinPermiso,
          precioConPermiso:    p.precioConPermiso   ?? ed?.precioConPermiso,
          pesoRedondeo:        p.pesoRedondeo       ?? ed?.pesoRedondeo,
          diferenciaRedondeo:  p.diferenciaRedondeo ?? ed?.diferenciaRedondeo,
          pesoConsolidacion:   p.pesoConsolidacion  ?? ed?.pesoConsolidacion,
          ajustePrecio:        p.ajustePrecio       ?? ed?.ajustePrecio       ?? null,
          precioAjustado:      p.ajustePrecio?.precioAjustado ?? ed?.ajustePrecio?.precioAjustado ?? null,
        };
      });

    // Identify trackings that belong to active invoices but were NOT loaded via direct or source pkgs
    const loadedTrackingSet = new Set([
      ...directTrackingSet,
      ...sourcePkgs.map((p: any) => String(p.tracking || p.trackingNumber || '').toUpperCase())
    ]);
    const missingInvoiceTrackings = Array.from(trackingToInvoiceMeta.keys()).filter(
      t => !loadedTrackingSet.has(t) && !deletedTrackingsSet.has(t)
    );

    let missingPkgsFromCollection: any[] = [];
    if (missingInvoiceTrackings.length > 0) {
      const missingSnaps = await Promise.all(
        missingInvoiceTrackings.map(t => getDoc(doc(db, 'packages', t)).catch(() => null))
      );
      missingSnaps.forEach((snap) => {
        if (snap && snap.exists()) {
          const p = { id: snap.id, ...snap.data() };
          const tracking = snap.id.toUpperCase();
          const ed = (embeddedMap.get(tracking) ?? {}) as any;
          const inv = trackingToInvoiceMeta.get(tracking);
          
          missingPkgsFromCollection.push({
            ...p,
            customerName:       ed?.customerName ?? p.customerName ?? inv?.customerName ?? '',
            slCode:             ed?.slCode       ?? p.slCode       ?? inv?.slCode       ?? '',
            ruta:               ed?.ruta         ?? p.ruta         ?? inv?.ruta         ?? '',
            description:        p.description        ?? ed?.description   ?? '',
            matchSource:        p.matchSource        ?? ed?.matchSource   ?? '',
            matchScore:         p.matchScore         ?? ed?.matchScore,
            precioSinPermiso:   p.precioSinPermiso   ?? ed?.precioSinPermiso,
            precioConPermiso:   p.precioConPermiso   ?? ed?.precioConPermiso,
            pesoRedondeo:       p.pesoRedondeo       ?? ed?.pesoRedondeo,
            diferenciaRedondeo: p.diferenciaRedondeo ?? ed?.diferenciaRedondeo,
            pesoConsolidacion:  p.pesoConsolidacion  ?? ed?.pesoConsolidacion,
          });
        }
      });
    }

    const pkgsFromCollection = [...pkgsDirectFromCollection, ...sourcePkgs, ...missingPkgsFromCollection];
    const collectionTrackingSet = new Set(
      pkgsFromCollection.map((p: any) => String(p.tracking || p.trackingNumber || '').toUpperCase())
    );

    const isMegaContainer = megaManId.toUpperCase().startsWith('ENC-MEGA-MAN-') ||
                            megaManId.toUpperCase().startsWith('SL-MEGA-MAN-') ||
                            megaManId.toUpperCase().startsWith('MEGA-MAN-') ||
                            manifestData?.isMegaMan === true ||
                            manifestData?.isFirestoreFusion === true;

    // Diagnóstico en memoria exclusivo para manifiestos Mega-Man (fusión)
    const ghostTrackings: string[] = [];
    if (isMegaContainer && embedded.length > 0) {
      const embeddedTrackings = embedded.map(p => String(p.tracking || p.trackingNumber || '').toUpperCase()).filter(Boolean);
      if (embeddedTrackings.length > 0) {
        const trackingChunks = [];
        for (let i = 0; i < embeddedTrackings.length; i += 30) {
          trackingChunks.push(embeddedTrackings.slice(i, i + 30));
        }
        const collectionPkgsSnaps = await Promise.all(
          trackingChunks.map(chunk =>
            getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)))
          )
        );
        const foundTrackings = new Set<string>();
        collectionPkgsSnaps.flatMap(snap => snap.docs).forEach(d => {
          const data = d.data();
          const currentMn = String(data.manifestNumber || '').trim();
          const tracking = String(data.trackingNumber || d.id).toUpperCase().trim();
          foundTrackings.add(tracking);
          if (currentMn && currentMn !== megaManId) {
            ghostTrackings.push(tracking);
          }
        });
        if (foundTrackings.size > 0) {
          embeddedTrackings.forEach(trk => {
            if (!foundTrackings.has(trk)) {
              ghostTrackings.push(trk);
            }
          });
        }
      }
    }
    const ghostSet = new Set(ghostTrackings.map(t => t.toUpperCase()));

    const consolidationItems = consolidationSnap.docs.map(d => ({
      ...d.data(),
      tracking:       d.data().tracking || d.id,
      trackingNumber: d.data().tracking || d.id,
      weight:         d.data().weight ?? 0,
      price:          d.data().price ?? 0,
      customerName:   d.data().customerName || '',
      slCode:         d.data().slCode || '',
      ruta:           d.data().ruta || '',
      description:    d.data().description || '',
      requiresPermit: d.data().permisos ?? false,
    }));
    const consolidationSupplement = consolidationItems.filter(
      p => !collectionTrackingSet.has(String(p.tracking || '').toUpperCase())
    );
    const mergedTrackingSet = new Set([
      ...collectionTrackingSet,
      ...consolidationSupplement.map(p => String(p.tracking || '').toUpperCase()),
    ]);

    const candidates = embedded.filter(p => {
      const trk = String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim();
      if (deletedTrackingsSet.has(trk)) return false;
      if (mergedTrackingSet.has(trk)) return false;
      // If loading a regular source manifest, exclude any package with ruta='Encomiendas' or assigned to an ENC-MEGA-MAN
      if (!isMegaContainer) {
        const pRuta = String(p.ruta || '').trim();
        const pEncMn = String(p.encomiendaManifestNumber || '').toUpperCase();
        if (pRuta === 'Encomiendas' || pEncMn.startsWith('ENC-MEGA-MAN-')) {
          return false;
        }
      }
      return true;
    });

    let embeddedSupplement: any[] = [];
    if (candidates.length > 0) {
      const candidateTrackings = candidates.map(p => String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim()).filter(Boolean);
      const trackingChunks = [];
      for (let i = 0; i < candidateTrackings.length; i += 30) {
        trackingChunks.push(candidateTrackings.slice(i, i + 30));
      }
      
      const collectionPkgsSnaps = await Promise.all(
        trackingChunks.map(chunk =>
          getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)))
        )
      );

      const trackingToManifestMap = new Map<string, string>();
      collectionPkgsSnaps.flatMap(snap => snap.docs).forEach(d => {
        const data = d.data();
        const trk = String(data.trackingNumber || d.id).toUpperCase().trim();
        const mn = String(data.manifestNumber || '').trim().toUpperCase();
        const encMn = String(data.encomiendaManifestNumber || '').trim().toUpperCase();
        trackingToManifestMap.set(trk, mn);
        trackingToManifestMap.set(trk + '_ENC', encMn);
      });

      const targetMnSet = new Set([
        megaManId.toUpperCase(),
        ...searchTerms.map(s => s.toUpperCase())
      ]);

      const isEncomiendaMn = megaManId.toUpperCase().startsWith('ENC-');

      // Safeguard inline comment: Filters candidate supplements. If a package has a document in packages
      // collection, its manifestNumber (or encomiendaManifestNumber for ENC manifests) must match the loaded
      // manifest or its sources (targetMnSet). Otherwise, it was moved to transitoria or another manifest and should be excluded.
      embeddedSupplement = candidates.filter(p => {
        const trk = String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim();
        if (!trackingToManifestMap.has(trk)) return true;
        
        const currentMn = (trackingToManifestMap.get(trk) || '').toUpperCase();
        if (currentMn === 'CONSOLIDACION_TRANSITORIA') return false;
        
        if (isEncomiendaMn) {
          const currentEncMn = (trackingToManifestMap.get(trk + '_ENC') || '').toUpperCase();
          return currentEncMn === megaManId.toUpperCase();
        } else {
          return targetMnSet.has(currentMn);
        }
      });
    }


    if (pkgsFromCollection.length > 0 || consolidationSupplement.length > 0 || embeddedSupplement.length > 0) {
      // Consolidation + embedded supplements have NO packages collection
      // record (they live only in manifest_consolidation or the embedded
      // packages[] array). For those, invoice is the highest authority
      // because packages can't speak. Falls back to the supplement's own
      // values when no invoice references the tracking.
      const applyInvoiceOverride = (p: any) => {
        const tracking = String(p.tracking || p.trackingNumber || '').toUpperCase();
        const inv = trackingToInvoiceMeta.get(tracking);
        if (!inv) return p;
        return {
          ...p,
          customerName: inv.customerName ?? p.customerName ?? '',
          slCode:       inv.slCode       ?? p.slCode       ?? '',
          ruta:         inv.ruta         ?? p.ruta         ?? '',
        };
      };
      sourcePackages = [
        ...pkgsFromCollection,
        ...consolidationSupplement.map(applyInvoiceOverride),
        ...embeddedSupplement.map(applyInvoiceOverride),
      ];

      // ── Invoice cross-validation diagnostic ─────────────────────────────
      // Check every tracking that exists in BOTH packages and invoices.
      // When the slCodes disagree (both non-empty but different), surface
      // a per-tracking warning so the operator can investigate via the
      // /invoices page or "Re-generar factura" action. This does NOT
      // change the loaded value — packages still wins per the user's
      // architectural spec — it's a pure diagnostic signal.
      const crossValidationDiscrepancies: Array<{ tracking: string; packagesSlCode: string; invoiceSlCode: string; invoiceNumber: string }> = [];
      for (const p of pkgsFromCollection) {
        const tracking = String((p as any).tracking || (p as any).trackingNumber || '').toUpperCase();
        if (!tracking) continue;
        const inv = trackingToInvoiceMeta.get(tracking);
        if (!inv) continue;
        const pkgSl = String((p as any).slCode || '').trim();
        const invSl = inv.slCode;
        // Both present and disagree → operator-visible discrepancy
        if (pkgSl && invSl && pkgSl !== invSl) {
          crossValidationDiscrepancies.push({
            tracking,
            packagesSlCode: pkgSl,
            invoiceSlCode: invSl,
            invoiceNumber: inv.invoiceNumber,
          });
        }
      }
      if (crossValidationDiscrepancies.length > 0) {
        console.warn(
          `[Nova][loadMegaManFromFirestore] ${crossValidationDiscrepancies.length} tracking(s) have packages.slCode ≠ invoice.clientSlCode for ${megaManId}:`,
          crossValidationDiscrepancies,
        );
      }
      // BUG-PERSIST-LOST-OVERRIDES 2026-04-29: pair this with the
      // [handleIngest] persisting log so any divergence between save and
      // load is immediately visible in the console. `unmatched` counts rows
      // missing slCode (will display "sin registro"); `unrouted` counts
      // matched rows with no route (blocks the green "Guardar" CTA).
      const unmatched = sourcePackages.filter(p => !p.slCode).length;
      const unrouted  = sourcePackages.filter(p => p.slCode && !p.ruta).length;
      const invoiceRecovered = sourcePackages.filter(p => {
        const t = String(p.tracking || p.trackingNumber || '').toUpperCase();
        return trackingToInvoiceMeta.has(t);
      }).length;
      console.info('[Nova][loadMegaManFromFirestore] hydrated:', {
        manifest: megaManId,
        total: sourcePackages.length,
        fromCollection: pkgsFromCollection.length,
        fromConsolidation: consolidationSupplement.length,
        fromEmbedded: embeddedSupplement.length,
        unmatched,
        unrouted,
        embeddedArrayLen: embedded.length,
        activeInvoices: trackingToInvoiceMeta.size,
        invoiceRecovered, // packages whose identity was tied to an active invoice
        sample: sourcePackages.slice(0, 3).map(p => ({
          tracking: p.tracking,
          slCode: p.slCode,
          ruta: p.ruta,
          customerName: p.customerName,
        })),
      });
    } else {
      // Nothing found at all
      if (!manifestSnap.exists()) return null;
      sourcePackages = [];
      console.log(`[Nova] loadMegaManFromFirestore: no packages found for ${megaManId}`);
    }

    // Self-heal — fire-and-forget, non-blocking.
    if (manifestSnap.exists() && sourcePackages.length > 0) {
      const storedTotal = (manifestData?.totalPackages as number) ?? 0;

      // Repair embedded array: consolidation items that are genuinely new
      // (tracking not already in the embedded array) must be written back so
      // the next "Cargar" finds them without re-querying manifest_consolidation.
      const consolNotInEmbedded = consolidationSupplement.filter(
        p => !embedded.some(e =>
          (e.tracking || '').toUpperCase() === (p.tracking || '').toUpperCase()
        )
      );

      if (consolNotInEmbedded.length > 0) {
        const toAdd = consolNotInEmbedded.map(p => ({
          tracking:       String(p.tracking || p.trackingNumber || '').toUpperCase(),
          slCode:         String(p.slCode || ''),
          customerName:   String(p.customerName || ''),
          customerEmail:  '',
          ruta:           String(p.ruta || ''),
          weight:         Number(p.weight) || 0,
          price:          Number(p.price) || 0,
          isConsolidated: false,
          requiresPermit: Boolean(p.requiresPermit),
          description:    String(p.description || ''),
        }));
        updateDoc(doc(collection(db, 'manifests'), megaManId), {
          packages:      [...embedded, ...toAdd],
          totalPackages: embedded.length + toAdd.length,
          // Must be a Firestore Timestamp (not ISO string) — saveManifestRecord
          // uses serverTimestamp() and orderBy('updatedAt') breaks if the field
          // has mixed types across docs in the manifests collection.
          updatedAt:     serverTimestamp(),
        }).catch(() => { /* non-critical */ });
      } else if (storedTotal !== sourcePackages.length) {
        updateDoc(doc(collection(db, 'manifests'), megaManId), {
          totalPackages: sourcePackages.length,
          updatedAt:     serverTimestamp(),
        }).catch(() => { /* non-critical */ });
      }
    }

    // ── Derive shipping type reliably ─────────────────────────────────────────
    // Priority:
    //  1. DAN / DANP suffix in manifest number → always air (naming convention)
    //  2. Majority `type` field across the loaded packages
    //  3. Stored manifestType in the manifests doc
    //  4. Default 'usa_air'
    const storedManifestType = (manifestData?.manifestType || 'usa_air') as string;
    const storedCountry = storedManifestType.split('_')[0] ?? 'usa';

    const isDanManifest = /DAN[P]?$/i.test(megaManId);
    let resolvedShipping: string;
    if (isDanManifest) {
      resolvedShipping = 'air';
    } else {
      // Majority vote from packages `type` field (set at ingest time)
      const pkgTypes = sourcePackages.map((p: any) => String(p.type || '')).filter(Boolean);
      const airCount = pkgTypes.filter(t => t === 'air').length;
      const seaCount = pkgTypes.filter(t => t === 'sea').length;
      if (pkgTypes.length > 0) {
        resolvedShipping = airCount >= seaCount ? 'air' : 'sea';
      } else {
        resolvedShipping = storedManifestType.split('_')[1] ?? 'air';
      }
    }
    const manifestType = `${storedCountry}_${resolvedShipping}` as ManifestType;

    const rows: ManifestRow[] = sourcePackages.map(p => {
      // `packages` collection uses weight/cost/price; embedded array uses weight/price
      const peso      = Number(p.weight) || 0;
      let precio      = Number(p.cost ?? p.price) || 0;
      const permisos  = Boolean(p.requiresPermit ?? p.permisos);
      const consol    = Boolean(p.isConsolidated ?? p.consolidacion);

      // INVARIANT: An item with weight > 0 must NEVER have a price of 0.
      if (precio === 0 && peso > 0) {
        const calcRes = calculatePrice(peso, storedCountry as any, resolvedShipping as any, 'regular', permisos);
        if (!calcRes.quoteRequired) {
          precio = Math.round(calcRes.price * 100) / 100;
        }
      }

      // ── Round-trip hydration ──────────────────────────────────────────────
      // Prefer persisted values over reconstructions. The merge above
      // (sourcePkgs map) already promoted the embedded-array values onto
      // `p` when present. We fall back to legacy reconstructions only when
      // the persisted field is missing entirely (manifests saved before
      // BUG-CURATED-DESTROYED 2026-04-29).
      const storedPesoRedondeo       = p.pesoRedondeo       != null ? Number(p.pesoRedondeo)       : (permisos ? Math.ceil(peso) : 0);
      const storedDiferencia         = p.diferenciaRedondeo != null ? Number(p.diferenciaRedondeo) : (permisos ? Math.ceil(peso) - peso : 0);
      const storedPesoConsolidacion  = p.pesoConsolidacion  != null ? Number(p.pesoConsolidacion)  : (consol   ? Math.ceil(peso) : 0);
      const storedPrecioSinPermiso   = Number.isFinite(p.precioSinPermiso) && Number(p.precioSinPermiso) > 0 ? Number(p.precioSinPermiso) : (permisos ? Math.max(0, precio - 3) : precio);
      const storedPrecioConPermiso   = Number.isFinite(p.precioConPermiso) && Number(p.precioConPermiso) > 0 ? Number(p.precioConPermiso) : precio;
      const storedMatchScore         = Number.isFinite(p.matchScore)       ? Number(p.matchScore)       : (p.slCode ? 1 : 0);
      const storedMatchSource: 'pre_alert' | 'name' | undefined =
        p.matchSource === 'pre_alert' || p.matchSource === 'name' ? p.matchSource : undefined;
      return {
        tracking:           String(p.tracking || p.trackingNumber || ''),
        nombre:             String(p.nombre ?? p.customerName ?? ''),
        guia:               String(p.guia || p.tracking || p.trackingNumber || ''),
        manifiesto:         megaManId,
        peso,
        precio,
        slCode:             String(p.slCode || ''),
        nombreCliente:      String(p.customerName || p.nombre || ''),
        ruta:               String(p.ruta || ''),
        consolidacion:      consol,
        descripcion:        String(p.description || p.descripcion || ''),
        permisos,
        pesoRedondeo:       storedPesoRedondeo,
        diferenciaRedondeo: storedDiferencia,
        pesoConsolidacion:  storedPesoConsolidacion,
        precioSinPermiso:   storedPrecioSinPermiso,
        precioConPermiso:   storedPrecioConPermiso,
        matchScore:         storedMatchScore,
        status:             String(p.status || ''),
        ...(storedMatchSource ? { matchSource: storedMatchSource } : {}),
        originalData:       { ...p },
        ...(p.preAlert ? { preAlert: p.preAlert } : {}),
        ...(p.preAlertInfo ? { preAlert: p.preAlertInfo } : {}),
        ...(p.hasPreAlert ? { hasPreAlert: p.hasPreAlert } : {}),
        ...(p.preAlertSlCode ? { preAlertSlCode: p.preAlertSlCode } : {}),
        ...(p.preAlertCreatedAt ? { preAlertCreatedAt: p.preAlertCreatedAt } : {}),
        ...(p.preAlertKey ? { preAlertKey: p.preAlertKey } : {}),
        ...(p.preAlertId ? { preAlertId: p.preAlertId } : {}),
        ...(p.ajustePrecio ? { ajustePrecio: p.ajustePrecio } : {}),
      };
    });

    const totalPrice       = rows.reduce((s, r) => s + r.precio, 0);
    const customersMatched = rows.filter(r => r.slCode).length;

    // ── Exchange rate: manifest doc takes priority; fallback to first package ──
    const storedTc = Number(manifestData?.exchangeRate ?? 0);
    const pkgTc    = storedTc > 0 ? storedTc : Number(sourcePackages.find(p => Number(p.exchangeRate) > 0)?.exchangeRate ?? 0);
    const resolvedTc = pkgTc > 0 ? pkgTc : undefined;

    return {
      rows,
      summary: { totalRows: rows.length, processedRows: rows.length, errors: 0, totalPrice, customersMatched, namesCorrections: 0, weightCorrections: 0 },
      manifestNumber: megaManId,
      manifestType,
      corrections:    [],
      validation:     { isValid: true, issues: [], suggestions: [] },
      multiMatchRows: [],
      requiresUserChoice: false,
      isMegaMan:      isMegaContainer,
      ghostTrackings,
      loadedFromFirestore: true,
      ...(resolvedTc ? { exchangeRate: resolvedTc } : {}),
    };
  } catch (err) {
    console.error('[Nova] loadMegaManFromFirestore error:', err);
    return null;
  }
}

export async function loadManifestFromFirestore(manifestId: string): Promise<ProcessingResult | null> {
  const cleanId = (manifestId || '').trim();
  if (!cleanId) return null;

  // 1. Direct match
  const exactRef = doc(collection(db, 'manifests'), cleanId);
  const exactSnap = await getDoc(exactRef);
  if (exactSnap.exists()) {
    return loadMegaManFromFirestore(cleanId);
  }

  // 2. Case-insensitive direct ID match
  const upperId = cleanId.toUpperCase();
  if (upperId !== cleanId) {
    const upperSnap = await getDoc(doc(collection(db, 'manifests'), upperId));
    if (upperSnap.exists()) {
      return loadMegaManFromFirestore(upperId);
    }
  }

  // 3. Try appending current year if it ends with DD-MM or MM-DD
  const currentYear = new Date().getFullYear();
  if (/-\d{2}-\d{2}$/.test(cleanId)) {
    const withYear = `${cleanId}-${currentYear}`;
    const withYearSnap = await getDoc(doc(collection(db, 'manifests'), withYear));
    if (withYearSnap.exists()) {
      return loadMegaManFromFirestore(withYear);
    }
  }

  // 4. Perform a fast targeted search on recent manifests instead of scanning all database documents
  try {
    const recentQuery = query(
      collection(db, 'manifests'),
      orderBy('processedAt', 'desc'),
      limit(50)
    );
    const manifestsSnap = await getDocs(recentQuery);
    for (const d of manifestsSnap.docs) {
      const id = d.id.toUpperCase().trim();
      const mNum = String(d.data().manifestNumber || '').toUpperCase().trim();
      if (
        id === upperId ||
        mNum === upperId ||
        id.includes(upperId) ||
        upperId.includes(id) ||
        mNum.includes(upperId) ||
        upperId.includes(mNum)
      ) {
        console.info(`[Nova] Resolved alias load for "${cleanId}" -> "${d.id}"`);
        return loadMegaManFromFirestore(d.id);
      }
    }
  } catch (err) {
    console.error('[loadManifestFromFirestore] Failed to run flexible search:', err);
  }

  return loadMegaManFromFirestore(cleanId);
}

export async function bulkUpdateManifestNumber(
  collectionName: string,
  sourceIds: string[],
  megaManId: string,
  allowedSlCodes?: Set<string>,
  allowedTrackings?: Set<string>
): Promise<number> {
  const BATCH_SIZE = 450;
  let totalUpdated = 0;

  const searchTerms = await resolveManifestAliases(sourceIds);

  // Retrieve documents for each search term in parallel
  const snaps = await Promise.all(
    searchTerms.map(term =>
      getDocs(query(collection(db, collectionName), where('manifestNumber', '==', term)))
    )
  );

  const allDocs = snaps.flatMap(snap => snap.docs);
  if (allDocs.length === 0) return 0;

  // Split operations into chunks below the 500 limits
  const chunks = [];
  for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    chunks.push(allDocs.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    let batchUpdated = 0;
    for (const d of chunk) {
      const data = d.data();
      
      // If allowedTrackings is provided, check tracking intersections when trackings are present
      let hasTrackingsListed = false;
      const trackingsList: string[] = [];

      if (data.tracking) {
        trackingsList.push(data.tracking);
        hasTrackingsListed = true;
      }
      if (data.trackingNumber) {
        trackingsList.push(data.trackingNumber);
        hasTrackingsListed = true;
      }
      if (Array.isArray(data.trackingNumbers)) {
        trackingsList.push(...data.trackingNumbers);
        hasTrackingsListed = true;
      }
      if (Array.isArray(data.trackings)) {
        trackingsList.push(...data.trackings);
        hasTrackingsListed = true;
      }

      if (collectionName === 'manifest_encomiendas' || collectionName === 'manifest_consolidation') {
        trackingsList.push(d.id);
        hasTrackingsListed = true;
      }

      const docTrackings = trackingsList.map(t => String(t || '').toUpperCase().trim()).filter(Boolean);

      if (allowedTrackings && allowedTrackings.size > 0 && hasTrackingsListed) {
        const hasIntersection = docTrackings.some(t => allowedTrackings.has(t));
        if (!hasIntersection) {
          continue; // Skip migrating this record
        }
      } else if (allowedSlCodes) {
        // Fallback to customer SL code filtering if no trackings are explicitly listed
        const sc = String(data.clientSlCode || data.slCode || '').toUpperCase().trim();
        if (!allowedSlCodes.has(sc)) continue;
      }

      batch.update(d.ref, {
        manifestNumber:   megaManId,
        manifestId:       megaManId,
        originalManifest: data.manifestNumber || '',
        updatedAt:        new Date().toISOString(),
      });
      batchUpdated += 1;
    }
    if (batchUpdated > 0) {
      await batch.commit();
      totalUpdated += batchUpdated;
    }
  }

  return totalUpdated;
}

function statusRank(s: string): number {
  const ranks: Record<string, number> = {
    'pre-alerted': 0, 'pre_alerted': 0,
    'received': 1,
    'transit': 2, 'in_transit': 2,
    'customs': 3, 'retained': 3, 'held': 3,
    'consolidated': 4,
    'processed': 5,
    'route': 6, 'on_route': 6, 'pickup': 6,
    'delivered': 7, 'returned': 7,
  };
  return ranks[String(s || '').toLowerCase()] ?? -1;
}

export async function linkPackagesToMegaMan(
  sourceManifestIds: string[],
  megaManId: string,
  embeddedRows?: Array<{ tracking?: string; slCode?: string; customerName?: string; ruta?: string; description?: string; }>,
): Promise<number> {
  if (!sourceManifestIds.length || !megaManId) return 0;
  const BATCH_SIZE = 490;
  const now = new Date().toISOString();
  let total = 0;

  // Build a lookup map from Nova's re-processed rows (post-fusion AI matching).
  // These are more accurate than the pre-fusion source manifest data in the packages collection.
  const embeddedMap = new Map<string, { slCode?: string; customerName?: string; ruta?: string; description?: string; }>(
    (embeddedRows ?? [])
      .filter(r => r.tracking)
      .map(r => [String(r.tracking).toUpperCase(), {
        slCode:       r.slCode,
        customerName: r.customerName,
        ruta:         r.ruta,
        description:  r.description,
      }])
  );

  const isEncomiendaMegaMan = megaManId.toUpperCase().startsWith('ENC-');

  const searchTerms = await resolveManifestAliases(sourceManifestIds);

  for (const srcId of searchTerms) {
    const trimmedSrcId = String(srcId || '').trim();
    if (!trimmedSrcId || trimmedSrcId === megaManId) continue;
    let snap;
    try {
      let q = query(collection(db, 'packages'), where('manifestNumber', '==', srcId));
      if (isEncomiendaMegaMan) {
        q = query(collection(db, 'packages'), where('manifestNumber', '==', srcId), where('ruta', '==', 'Encomiendas'));
      }
      snap = await getDocs(q);
    } catch {
      continue;
    }
    if (snap.empty) continue;

    const chunks: typeof snap.docs[number][][] = [];
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      chunks.push(snap.docs.slice(i, i + BATCH_SIZE));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const d of chunk) {
        const existing = d.data();
        const trackingKey = String(existing.tracking || d.id).toUpperCase();
        const nova = embeddedMap.get(trackingKey);
        
        let targetStatus = existing.status || 'customs';
        let statusHistoryUpdate = {};
        
        if (isEncomiendaMegaMan && (statusRank(targetStatus) < statusRank('customs') || targetStatus === 'consolidated')) {
          targetStatus = 'customs';
          statusHistoryUpdate = {
            status: 'customs',
            statusLabel: 'En Aduanas',
            statusUpdatedAt: now,
            statusHistory: arrayUnion({
              status:    'customs',
              changedAt: now,
              changedBy: 'nova_mega_man',
              note:      `Paquete asignado a manifiesto de encomiendas ${megaManId}. Estado actualizado a Aduanas.`,
              // legacy compatibility:
              timestamp: now,
              location:  'Aduana CR',
              notes:     `Paquete asignado a manifiesto de encomiendas ${megaManId}. Estado actualizado a Aduanas.`,
              updatedBy: 'nova_mega_man',
            })
          };
        }

        batch.update(d.ref, {
          manifestNumber:   megaManId,
          manifestId:       megaManId,
          originalManifest: existing.originalManifest ?? srcId,
          updatedAt:        now,
          // Actualización de encomiendaManifestNumber para sincronización bidireccional
          ...(megaManId.toUpperCase().startsWith('ENC-') ? { encomiendaManifestNumber: megaManId } : {}),
          // Overwrite identity fields with Nova's post-fusion AI matching when available.
          // This corrects any pre-fusion incorrect customer associations in the packages collection.
          ...(nova?.customerName ? { customerName: nova.customerName } : {}),
          ...(nova?.slCode       ? { slCode:       nova.slCode       } : {}),
          ...(nova?.ruta         ? { ruta:         nova.ruta         } : {}),
          ...(nova?.description  ? { description:  nova.description  } : {}),
          ...statusHistoryUpdate
        });
      }
      await batch.commit();
      total += chunk.length;
    }
  }

  console.log(`[Nova] linkPackagesToMegaMan: linked ${total} packages → ${megaManId}`);
  return total;
}

/**
 * Fuses multiple Firestore manifests into a consolidated MEGA-MAN manifest.
 * Supports split fusions where Encomienda packages are extracted into an ENC-MEGA-MAN,
 * and Miami cargo is consolidated into an SL-MEGA-MAN.
 * 
 * 🚨 CRITICAL RULE FOR AI DEVELOPERS:
 * - Miami air cargo suffixes ('DAN' and 'DANP') are regular Miami manifests, NOT Encomiendas.
 * - Under NO circumstances should 'DAN' or 'DANP' manifests trigger automatic Encomienda classification.
 * - Only manifests containing "ENC-" or "ENCOMIENDA" in their ID, or documents with `isEncomienda: true` 
 *   should be classified as Encomiendas.
 * 
 * Flow & Resilience:
 * 1. Takes restore snapshots of all source manifests for automatic transaction rollback.
 * 2. Deduplicates packages chronologically (most-recent manifest takes priority for exchange rate and settings).
 * 3. Batches updates in Firestore (packages, invoices, consolidations, encomiendas) to minimize GCP costs.
 * 4. Extracts/removes packages cleanly based on the fusion route ('Encomiendas' vs. regular).
 * 5. Marks source manifests as merged using saveManifestMergedLink, ensuring that in split fusions
 *    the mergedInto link is preserved and not overwritten.
 */
export async function fuseFirestoreManifests(
  sourceIdsRaw: string[],
  onProgress?: (msg: string) => void,
  prefix: string = 'SL',
  customTargetId?: string
): Promise<string> {
  const sourceIds = await resolveManifestAliases(sourceIdsRaw);
  if (sourceIds.length < 2) {
    throw new Error('Se necesitan al menos 2 manifiestos para hacer la fusión.');
  }

  // 🚨 BUSINESS RULE: Los MEGA-MAN y ENC-MEGA-MAN son EXCLUSIVAMENTE para manifiestos regulares.
  // Los manifiestos de permisos (DANP / PERMISOS) NUNCA pueden ser incluidos en una fusión MEGA-MAN.
  const permitSources = sourceIds.filter(id => {
    const u = id.toUpperCase().trim();
    return u.endsWith('DANP') || u.includes('PERMISO') || u.includes('PERMIT');
  });
  if (permitSources.length > 0) {
    throw new Error(
      `No está permitido incluir manifiestos de permisos (${permitSources.join(', ')}) en un MEGA-MAN. Los MEGA-MAN son exclusivamente para unir manifiestos regulares.`
    );
  }

  const startTime = Date.now();

  // 1. Guardar snapshots iniciales de los manifiestos de origen para rollback
  onProgress?.('Creando puntos de restauración...');
  const manifestRefs = sourceIds.map(id => doc(db, 'manifests', id));
  const initialSnaps = await Promise.all(manifestRefs.map(ref => getDoc(ref)));
  const originalManifestsData = initialSnaps.map(snap => ({
    id: snap.id,
    exists: snap.exists(),
    data: snap.exists() ? snap.data() : null
  }));

  // 🚨 AI GUARD: Only classify as Encomiendas if explicitly marked or ID contains ENC/ENCOMIENDA.
  // DO NOT use idUpper.endsWith('DAN') or endsWith('DANP') as those belong to Miami Air manifests.
  const hasEncomiendaSource = initialSnaps.some(snap => {
    if (!snap.exists()) return false;
    const data = snap.data();
    const idUpper = snap.id.toUpperCase();
    return data?.isEncomienda === true || idUpper.includes('ENC-') || idUpper.includes('ENCOMIENDA');
  });

  // Step 1.5: Chronological sorting to find the primary (most-recent) manifest
  const parseDate = (id: string) => {
    const m = id.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (!m) return 0;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
  };

  const sortedIds = [...sourceIds].sort((a, b) => {
    const da = parseDate(a);
    const db = parseDate(b);
    if (da !== db) return da - db; // oldest first
    return a.localeCompare(b);
  });

  const primaryId = sortedIds[sortedIds.length - 1]; // most recent
  const datePart = primaryId.match(/^(\d{2}-\d{2}-\d{4})/)?.[1] ?? primaryId;

  // Auto-detect prefix 'ENC' if prefix is 'SL' but any source manifest ID is an encomienda manifest
  let resolvedPrefix = prefix;
  if (prefix === 'SL' && hasEncomiendaSource) {
    resolvedPrefix = 'ENC';
  }
  const megaManId = (customTargetId || `${resolvedPrefix}-MEGA-MAN-${datePart}`).trim();

  // LOG: Inicio de Fusión
  logAction({
    userId: 'nova',
    action: 'system_event',
    category: 'system',
    resource: 'manifests',
    resourceId: megaManId,
    result: 'pending',
    metadata: { stage: 'fusion_started', sourceIds, targetMegaId: megaManId }
  });

  const validSnaps = initialSnaps.filter(s => s.exists());
  if (validSnaps.length < sourceIds.length) {
    throw new Error('No se pudieron cargar todos los manifiestos de origen de Firestore.');
  }

  try {
    // Cruce de datos: Consultar cuáles trackings están asignados activamente a cada manifiesto origen en la colección packages
    const activePkgsSnaps = await Promise.all(
      sourceIds.map(srcId => getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', srcId))))
    );
    const activeTrackingSet = new Set(
      activePkgsSnaps.flatMap(snap => snap.docs.map(d => String(d.data().trackingNumber || d.id).toUpperCase().trim()))
    );

    // Step 3: Combine and deduplicate packages
    onProgress?.('Combinando y deduplicando paquetes...');
    const allEmbeddedPkgs: any[] = [];
    let primaryType = 'usa_air';
    let primaryRate = 0;

    validSnaps.forEach(snap => {
      const data = snap.data();
      if (!data) return;
      if (snap.id === primaryId) {
        primaryType = data.manifestType ?? 'usa_air';
        primaryRate = data.exchangeRate ?? 0;
      }
      if (Array.isArray(data.packages)) {
        // Filtrar paquetes fantasmas (que ya se trasladaron a otro manifiesto o transitoria)
        const activeSrcPkgs = data.packages.filter((p: any) => {
          const trk = String(p.tracking || p.trackingNumber || '').toUpperCase().trim();
          return activeTrackingSet.has(trk);
        });

        if (resolvedPrefix === 'ENC') {
          allEmbeddedPkgs.push(...activeSrcPkgs.filter((p: any) => p.ruta === 'Encomiendas'));
        } else {
          allEmbeddedPkgs.push(...activeSrcPkgs);
        }
      }
    });

    const mergedMap = new Map<string, any>();
    allEmbeddedPkgs.forEach(pkg => {
      const tracking = String(pkg.tracking || pkg.trackingNumber || '').trim().toUpperCase();
      if (tracking) {
        mergedMap.set(tracking, {
          ...pkg,
          tracking,
        });
      }
    });
    const mergedPackages = Array.from(mergedMap.values());

    // Recalculate totals
    const totalWeight = mergedPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
    const totalPrice = mergedPackages.reduce((sum, p) => sum + (p.price || 0), 0);
    const routes = [...new Set(mergedPackages.map(p => p.ruta).filter(Boolean))];

    // Recalculate customers
    const customersMap = new Map<string, { slCode: string; fullName: string; email: string; ruta: string; packageCount: number }>();
    mergedPackages.forEach(p => {
      if (!p.slCode) return;
      const existing = customersMap.get(p.slCode);
      if (existing) {
        existing.packageCount++;
      } else {
        customersMap.set(p.slCode, {
          slCode: p.slCode,
          fullName: p.customerName || p.nombre || '',
          email: p.customerEmail || '',
          ruta: p.ruta || '',
          packageCount: 1,
        });
      }
    });

    // Step 4: Write MEGA-MAN record to Firestore
    onProgress?.(`Creando manifiesto ${megaManId}...`);
    const parts = primaryType.split('_');
    const country = parts[0] ?? 'usa';
    const shippingType = parts[1] ?? 'air';

    // Preserve existing deletedTrackings if re-fusing
    const targetRef = doc(db, 'manifests', megaManId);
    const targetSnap = await getDoc(targetRef).catch(() => null);
    const existingDeleted = targetSnap?.exists() ? (targetSnap.data()?.deletedTrackings || []) : [];

    const megaDoc = {
      manifestNumber: megaManId,
      manifestType: primaryType,
      country,
      shippingType,
      totalPackages: mergedPackages.length,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalPrice: Math.round(totalPrice * 100) / 100,
      totalCustomers: customersMap.size,
      exchangeRate: primaryRate,
      routes,
      packages: mergedPackages,
      customers: Array.from(customersMap.values()),
      processedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      source: 'nova_mega_man',
      isMegaMan: true,
      isFirestoreFusion: true,
      fusedFrom: sourceIds,
      fusedManifests: sourceIds,
      deletedTrackings: existingDeleted,
      ...(resolvedPrefix === 'ENC' || megaManId.toUpperCase().startsWith('ENC-') || hasEncomiendaSource ? { isEncomienda: true } : {}),
    };

    await setDoc(targetRef, megaDoc);

    const allowedSlCodes = resolvedPrefix === 'ENC'
      ? new Set(mergedPackages.map(p => String(p.slCode || '').toUpperCase().trim()).filter(Boolean))
      : undefined;

    const migratedTrackings = resolvedPrefix === 'ENC'
      ? new Set(mergedPackages.map(p => String(p.tracking || p.trackingNumber || '').toUpperCase().trim()).filter(Boolean))
      : undefined;

    // Step 5: Background bulk update of packages collection
    onProgress?.('Actualizando paquetes en Firestore...');
    const pkgsLinked = await linkPackagesToMegaMan(sourceIds, megaManId, mergedPackages);

    // Step 6: Background bulk update of invoices collection
    onProgress?.('Actualizando facturas asociadas...');
    const invoicesUpdated = await bulkUpdateManifestNumber('invoices', sourceIds, megaManId, allowedSlCodes, migratedTrackings);

    // Step 7: Background bulk update of manifest_consolidation collection
    onProgress?.('Actualizando consolidaciones asociadas...');
    await bulkUpdateManifestNumber('manifest_consolidation', sourceIds, megaManId, allowedSlCodes, migratedTrackings);

    // Step 7.5: Background bulk update of manifest_encomiendas collection
    onProgress?.('Actualizando encomiendas asociadas...');
    await bulkUpdateManifestNumber('manifest_encomiendas', sourceIds, megaManId, allowedSlCodes, migratedTrackings);

    // Step 8: Real package extraction from source manifest stubs and recalculating totals
    let sourceManifestsDeactivated = 0;
    if (resolvedPrefix === 'ENC') {
      onProgress?.('Extrayendo paquetes de encomiendas de manifiestos origen...');
      await extractPackagesFromSourceManifests(sourceIds, megaManId, (p) => p.ruta === 'Encomiendas');
      
      // Marcar como mergedInto los manifiestos que quedaron totalmente vacíos
      for (const snap of initialSnaps) {
        if (!snap.exists()) continue;
        const refreDoc = await getDoc(doc(db, 'manifests', snap.id));
        const currentPkgs = refreDoc.data()?.packages || [];
        if (currentPkgs.length === 0) {
          await saveManifestMergedLink(snap.id, megaManId);
          sourceManifestsDeactivated++;
        }
      }
    } else {
      // Fusión normal: marcar todos los de origen como fusionados
      for (const snap of initialSnaps) {
        if (snap.exists() && snap.id !== megaManId) {
          const data = snap.data();
          // GAP FIX: Do not overwrite mergedInto link if the manifest was already merged
          // (e.g. it was empty and merged into ENC-MEGA-MAN in the previous step of a split fusion).
          if (data && data.mergedInto) {
            continue;
          }
          await saveManifestMergedLink(snap.id, megaManId);
          sourceManifestsDeactivated++;
        }
      }
    }

    // LOG: Éxito en Fusión
    logAction({
      userId: 'nova',
      action: 'nova_manifest_processed',
      category: 'manifest',
      resource: 'manifests',
      resourceId: megaManId,
      result: 'success',
      metadata: {
        stage: 'fusion_success',
        targetMegaId: megaManId,
        sourceIds,
        packagesLinked: pkgsLinked,
        invoicesUpdated,
        sourceManifestsDeactivated,
        elapsedMs: Date.now() - startTime
      }
    });

    return megaManId;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Nova][Rollback] Fusión falló. Iniciando rollback automático para ${megaManId}:`, error);
    onProgress?.('Error detectado. Revirtiendo cambios...');
    
    // LOG: Error e Inicio de Rollback
    logAction({
      userId: 'nova',
      action: 'error',
      category: 'system',
      resource: 'manifests',
      resourceId: megaManId,
      result: 'pending',
      errorMessage: errorMsg,
      metadata: { stage: 'rollback_started', targetMegaId: megaManId, sourceIds, reason: errorMsg }
    });

    try {
      let packagesRestored = 0;
      let documentsRestored = 0;
      let collectionsRestored = 0;
      let megaManDeleted = false;

      // 1. Revertir paquetes
      try {
        const pSnap = await getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', megaManId)));
        const pBatch = writeBatch(db);
        pSnap.docs.forEach(d => {
          const orig = d.data().originalManifest;
          if (orig) {
            pBatch.update(d.ref, {
              manifestNumber: orig,
              manifestId: orig,
              originalManifest: deleteField(),
              ...(megaManId.toUpperCase().startsWith('ENC-') ? { encomiendaManifestNumber: deleteField() } : {}),
              updatedAt: new Date().toISOString()
            });
            packagesRestored++;
          }
        });
        await pBatch.commit();
      } catch (pkgErr) {
        console.error('[Nova][Rollback] Error al revertir paquetes:', pkgErr);
      }

      // 2. Revertir colecciones secundarias (invoices, consolidaciones, encomiendas)
      const collectionsToRevert = ['invoices', 'manifest_consolidation', 'manifest_encomiendas'];
      for (const colName of collectionsToRevert) {
        try {
          const snap = await getDocs(query(collection(db, colName), where('manifestNumber', '==', megaManId)));
          const batch = writeBatch(db);
          snap.docs.forEach(d => {
            const orig = d.data().originalManifest;
            if (orig) {
              batch.update(d.ref, {
                manifestNumber: orig,
                manifestId: orig,
                originalManifest: deleteField(),
                updatedAt: new Date().toISOString()
              });
            }
          });
          await batch.commit();
          collectionsRestored++;
        } catch (colErr) {
          console.error(`[Nova][Rollback] Error al revertir colección secundaria ${colName}:`, colErr);
        }
      }

      // 3. Restaurar stubs de origen
      for (const origManifest of originalManifestsData) {
        try {
          if (origManifest.exists && origManifest.data) {
            await setDoc(doc(db, 'manifests', origManifest.id), origManifest.data);
            documentsRestored++;
          }
        } catch (docErr) {
          console.error(`[Nova][Rollback] Error al restaurar manifiesto de origen ${origManifest.id}:`, docErr);
        }
      }

      // 4. Eliminar el Mega-Man fallido
      try {
        await deleteDoc(doc(db, 'manifests', megaManId));
        megaManDeleted = true;
      } catch (delErr) {
        console.error(`[Nova][Rollback] Error al eliminar manifiesto fallido ${megaManId}:`, delErr);
      }
      
      console.log(`[Nova][Rollback] Base de datos restaurada con éxito para ${megaManId}.`);

      // LOG: Rollback completado con éxito
      logAction({
        userId: 'nova',
        action: 'system_event',
        category: 'system',
        resource: 'manifests',
        resourceId: megaManId,
        result: 'success',
        metadata: {
          stage: 'rollback_success',
          targetMegaId: megaManId,
          sourceIds,
          packagesRestored,
          documentsRestored,
          collectionsRestored,
          megaManDeleted
        }
      });

    } catch (rollbackError) {
      const rollbackErrorMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      console.error('[Nova][Rollback] ERROR CRÍTICO durante el proceso de reversión:', rollbackError);
      
      // LOG: Fallo crítico de Rollback
      logAction({
        userId: 'nova',
        action: 'error',
        category: 'system',
        resource: 'manifests',
        resourceId: megaManId,
        result: 'error',
        errorMessage: rollbackErrorMsg,
        metadata: { stage: 'rollback_failed', targetMegaId: megaManId, sourceIds, error: rollbackErrorMsg }
      });
    }

    throw new Error(`La fusión falló: ${errorMsg}. La base de datos fue revertida automáticamente.`);
  }
}

export async function mergeManifestIntoMegaMan(
  sourceIdRaw: string,
  targetMegaIdRaw: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const sourceId = (sourceIdRaw || '').trim();
  const targetMegaId = (targetMegaIdRaw || '').trim();
  if (!sourceId || !targetMegaId) {
    throw new Error('Debe especificar tanto el manifiesto de origen como el de destino.');
  }
  if (sourceId === targetMegaId) {
    throw new Error('El manifiesto de origen y destino no pueden ser el mismo.');
  }

  // 🚨 BUSINESS RULE: Los MEGA-MAN y ENC-MEGA-MAN son EXCLUSIVAMENTE para manifiestos regulares.
  // Los manifiestos de permisos (DANP / PERMISOS) NUNCA pueden ser fusionados ni añadidos a un MEGA-MAN.
  const isSourcePermit = sourceId.toUpperCase().endsWith('DANP') || sourceId.toUpperCase().includes('PERMISO') || sourceId.toUpperCase().includes('PERMIT');
  if (isSourcePermit) {
    throw new Error(`El manifiesto ${sourceId} es de permisos y no puede ser añadido a un MEGA-MAN. Los MEGA-MAN son exclusivamente para unir manifiestos regulares.`);
  }

  const startTime = Date.now();

  // 1. Fetch both manifest documents (restore points)
  onProgress?.('Verificando manifiestos en Firestore...');
  const targetRef = doc(db, 'manifests', targetMegaId);
  const sourceRef = doc(db, 'manifests', sourceId);

  const [targetSnap, sourceSnap] = await Promise.all([
    getDoc(targetRef),
    getDoc(sourceRef)
  ]);

  if (!targetSnap.exists()) {
    throw new Error(`El manifiesto de destino ${targetMegaId} no existe.`);
  }
  if (!sourceSnap.exists()) {
    throw new Error(`El manifiesto de origen ${sourceId} no existe.`);
  }

  const targetData = targetSnap.data();
  const sourceData = sourceSnap.data();

  // 2. Validations
  const upperTargetId = targetMegaId.toUpperCase();
  const isTargetMM = targetData.isMegaMan || upperTargetId.startsWith('MEGA-MAN-') || upperTargetId.startsWith('SL-MEGA-MAN-') || upperTargetId.startsWith('ENC-MEGA-MAN-');
  if (!isTargetMM) {
    throw new Error(`El manifiesto de destino ${targetMegaId} no es un MEGA-MAN.`);
  }

  const upperSourceId = sourceId.toUpperCase();
  const isSourceMM = sourceData.isMegaMan || upperSourceId.startsWith('MEGA-MAN-') || upperSourceId.startsWith('SL-MEGA-MAN-') || upperSourceId.startsWith('ENC-MEGA-MAN-');
  if (isSourceMM) {
    throw new Error(`No se puede fusionar un MEGA-MAN (${sourceId}) en otro.`);
  }

  if (sourceData.mergedInto) {
    throw new Error(`El manifiesto de origen ${sourceId} ya ha sido fusionado anteriormente en ${sourceData.mergedInto}.`);
  }
  const currentFusedFrom = Array.isArray(targetData.fusedFrom) 
    ? targetData.fusedFrom 
    : Array.isArray(targetData.fusedManifests) 
      ? targetData.fusedManifests 
      : [];
  if (currentFusedFrom.map((id: string) => id.toUpperCase()).includes(sourceId.toUpperCase())) {
    throw new Error(`El manifiesto de origen ${sourceId} ya forma parte del MEGA-MAN ${targetMegaId}.`);
  }

  // LOG: Inicio de Adición
  logAction({
    userId: 'nova',
    action: 'system_event',
    category: 'system',
    resource: 'manifests',
    resourceId: targetMegaId,
    result: 'pending',
    metadata: { stage: 'merge_into_started', sourceId, targetMegaId }
  });

  try {
    // 3. Combine and deduplicate packages
    onProgress?.('Combinando y deduplicando paquetes...');
    const targetPkgs = Array.isArray(targetData.packages) ? targetData.packages : [];
    let sourcePkgs = Array.isArray(sourceData.packages) ? sourceData.packages : [];
    if (upperTargetId.startsWith('ENC-')) {
      sourcePkgs = sourcePkgs.filter((p: any) => p.ruta === 'Encomiendas');
    }

    const mergedMap = new Map<string, any>();
    // Seed with target packages
    targetPkgs.forEach((p: any) => {
      const tracking = String(p.tracking || '').trim().toUpperCase();
      if (tracking) mergedMap.set(tracking, { ...p, tracking });
    });
    // Overwrite/add source packages
    sourcePkgs.forEach((p: any) => {
      const tracking = String(p.tracking || '').trim().toUpperCase();
      if (tracking) mergedMap.set(tracking, { ...p, tracking });
    });

    const mergedPackages = Array.from(mergedMap.values());

    // 4. Recalculate totals
    const totalWeight = mergedPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
    const totalPrice = mergedPackages.reduce((sum, p) => sum + (p.price || 0), 0);
    const routes = [...new Set(mergedPackages.map(p => p.ruta).filter(Boolean))];

    const customersMap = new Map<string, { slCode: string; fullName: string; email: string; ruta: string; packageCount: number }>();
    mergedPackages.forEach(p => {
      if (!p.slCode) return;
      const existing = customersMap.get(p.slCode);
      if (existing) {
        existing.packageCount++;
      } else {
        customersMap.set(p.slCode, {
          slCode: p.slCode,
          fullName: p.customerName || p.nombre || '',
          email: p.customerEmail || '',
          ruta: p.ruta || '',
          packageCount: 1,
        });
      }
    });

    // Calculate fusedFrom source arrays
    const newFusedFrom = [...new Set([...currentFusedFrom, sourceId])].sort();

    const allowedSlCodes = upperTargetId.startsWith('ENC-')
      ? new Set(mergedPackages.map(p => String(p.slCode || '').toUpperCase().trim()).filter(Boolean))
      : undefined;

    const migratedTrackings = upperTargetId.startsWith('ENC-')
      ? new Set(sourcePkgs.map(p => String(p.tracking || p.trackingNumber || '').toUpperCase().trim()).filter(Boolean))
      : undefined;

    // 5. Background bulk update of packages collection
    onProgress?.('Re-vinculando paquetes en Firestore...');
    const pkgsLinked = await linkPackagesToMegaMan([sourceId], targetMegaId, mergedPackages);

    // 6. Background bulk update of invoices collection
    onProgress?.('Actualizando facturas asociadas...');
    const invoicesUpdated = await bulkUpdateManifestNumber('invoices', [sourceId], targetMegaId, allowedSlCodes, migratedTrackings);

    // 7. Background bulk update of manifest_consolidation collection
    onProgress?.('Actualizando consolidaciones asociadas...');
    await bulkUpdateManifestNumber('manifest_consolidation', [sourceId], targetMegaId, allowedSlCodes, migratedTrackings);

    // 7.5 Background bulk update of manifest_encomiendas collection
    onProgress?.('Actualizando encomiendas asociadas...');
    await bulkUpdateManifestNumber('manifest_encomiendas', [sourceId], targetMegaId, allowedSlCodes, migratedTrackings);

    // 8. Update target MEGA-MAN doc
    onProgress?.(`Actualizando manifiesto consolidado ${targetMegaId}...`);
    await setDoc(targetRef, {
      totalPackages: mergedPackages.length,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalPrice: Math.round(totalPrice * 100) / 100,
      totalCustomers: customersMap.size,
      routes,
      packages: mergedPackages,
      customers: Array.from(customersMap.values()),
      fusedFrom: newFusedFrom,
      fusedManifests: newFusedFrom,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // 9. Real package extraction from source manifest stubs and recalculating totals
    let sourceDeactivated = false;
    if (upperTargetId.startsWith('ENC-')) {
      onProgress?.('Extrayendo paquetes de encomiendas del manifiesto origen...');
      await extractPackagesFromSourceManifests([sourceId], targetMegaId, (p) => p.ruta === 'Encomiendas');
      
      const refreDoc = await getDoc(sourceRef);
      const currentPkgs = refreDoc.data()?.packages || [];
      if (currentPkgs.length === 0) {
        await saveManifestMergedLink(sourceId, targetMegaId);
        sourceDeactivated = true;
      }
    } else {
      // Fusión normal
      await saveManifestMergedLink(sourceId, targetMegaId);
      sourceDeactivated = true;
    }

    // LOG: Éxito en Fusión individual
    logAction({
      userId: 'nova',
      action: 'nova_manifest_processed',
      category: 'manifest',
      resource: 'manifests',
      resourceId: targetMegaId,
      result: 'success',
      metadata: {
        stage: 'merge_into_success',
        targetMegaId,
        sourceId,
        packagesLinked: pkgsLinked,
        invoicesUpdated,
        sourceDeactivated,
        elapsedMs: Date.now() - startTime
      }
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Nova][Rollback] Fusión individual falló. Iniciando rollback automático para ${targetMegaId} ➔ ${sourceId}:`, error);
    onProgress?.('Error detectado. Revirtiendo cambios...');
    
    // LOG: Error e Inicio de Rollback
    logAction({
      userId: 'nova',
      action: 'error',
      category: 'system',
      resource: 'manifests',
      resourceId: targetMegaId,
      result: 'pending',
      errorMessage: errorMsg,
      metadata: { stage: 'rollback_started', targetMegaId, sourceId, reason: errorMsg }
    });

    try {
      let packagesRestored = 0;
      let documentsRestored = 0;
      let collectionsRestored = 0;

      // 1. Revertir paquetes que apuntan a targetMegaId y tienen originalManifest == sourceId
      try {
        const pSnap = await getDocs(query(
          collection(db, 'packages'), 
          where('manifestNumber', '==', targetMegaId),
          where('originalManifest', '==', sourceId)
        ));
        const pBatch = writeBatch(db);
        pSnap.docs.forEach(d => {
          pBatch.update(d.ref, {
            manifestNumber: sourceId,
            manifestId: sourceId,
            originalManifest: deleteField(),
            ...(targetMegaId.toUpperCase().startsWith('ENC-') ? { encomiendaManifestNumber: deleteField() } : {}),
            updatedAt: new Date().toISOString()
          });
          packagesRestored++;
        });
        await pBatch.commit();
      } catch (pkgErr) {
        console.error('[Nova][Rollback] Error al revertir paquetes:', pkgErr);
      }

      // 2. Revertir colecciones secundarias que apuntan a targetMegaId y tienen originalManifest == sourceId
      const collectionsToRevert = ['invoices', 'manifest_consolidation', 'manifest_encomiendas'];
      for (const colName of collectionsToRevert) {
        try {
          const snap = await getDocs(query(
            collection(db, colName), 
            where('manifestNumber', '==', targetMegaId),
            where('originalManifest', '==', sourceId)
          ));
          const batch = writeBatch(db);
          snap.docs.forEach(d => {
            batch.update(d.ref, {
              manifestNumber: sourceId,
              manifestId: sourceId,
              originalManifest: deleteField(),
              updatedAt: new Date().toISOString()
            });
          });
          await batch.commit();
          collectionsRestored++;
        } catch (colErr) {
          console.error(`[Nova][Rollback] Error al revertir colección secundaria ${colName}:`, colErr);
        }
      }

      // 3. Restaurar stub de origen y stub de destino
      try {
        await setDoc(sourceRef, sourceSnap.data()!);
        await setDoc(targetRef, targetData!);
        documentsRestored = 2;
      } catch (docErr) {
        console.error('[Nova][Rollback] Error al restaurar stubs de origen/destino:', docErr);
      }

      console.log(`[Nova][Rollback] Base de datos restaurada con éxito para ${targetMegaId} ➔ ${sourceId}.`);

      // LOG: Rollback completado con éxito
      logAction({
        userId: 'nova',
        action: 'system_event',
        category: 'system',
        resource: 'manifests',
        resourceId: targetMegaId,
        result: 'success',
        metadata: {
          stage: 'rollback_success',
          targetMegaId,
          sourceId,
          packagesRestored,
          documentsRestored,
          collectionsRestored
        }
      });

    } catch (rollbackError) {
      const rollbackErrorMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      console.error('[Nova][Rollback] ERROR CRÍTICO durante el proceso de reversión:', rollbackError);
      
      // LOG: Fallo crítico de Rollback
      logAction({
        userId: 'nova',
        action: 'error',
        category: 'system',
        resource: 'manifests',
        resourceId: targetMegaId,
        result: 'error',
        errorMessage: rollbackErrorMsg,
        metadata: { stage: 'rollback_failed', targetMegaId, sourceId, error: rollbackErrorMsg }
      });
    }

    throw new Error(`La fusión individual falló: ${errorMsg}. La base de datos fue revertida automáticamente.`);
  }
}

export async function extractPackagesFromSourceManifests(
  sourceIds: string[],
  targetMegaId: string,
  filterFn: (pkg: any) => boolean
): Promise<void> {
  const searchTerms = await resolveManifestAliases(sourceIds);
  for (const srcId of searchTerms) {
    if (!srcId || srcId === targetMegaId) continue;
    const docRef = doc(db, 'manifests', srcId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) continue;

    const data = snap.data();
    const currentPackages = Array.isArray(data.packages) ? data.packages : [];
    const remainingPackages = currentPackages.filter(p => !filterFn(p));

    if (remainingPackages.length === 0) {
      await setDoc(docRef, {
        totalPackages: 0,
        totalWeight: 0,
        totalPrice: 0,
        totalCustomers: 0,
        routes: [],
        packages: [],
        customers: [],
        mergedInto: targetMegaId,
        mergedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } else {
      const totalWeight = remainingPackages.reduce((sum, p) => sum + (p.weight || 0), 0);
      const totalPrice = remainingPackages.reduce((sum, p) => sum + (p.price || 0), 0);
      const routes = [...new Set(remainingPackages.map(p => p.ruta).filter(Boolean))];

      const customersMap = new Map<string, { slCode: string; fullName: string; email: string; ruta: string; packageCount: number }>();
      remainingPackages.forEach(p => {
        if (!p.slCode) return;
        const existing = customersMap.get(p.slCode);
        if (existing) {
          existing.packageCount++;
        } else {
          customersMap.set(p.slCode, {
            slCode: p.slCode,
            fullName: p.customerName || p.nombre || '',
            email: p.customerEmail || '',
            ruta: p.ruta || '',
            packageCount: 1,
          });
        }
      });

      await setDoc(docRef, {
        totalPackages: remainingPackages.length,
        totalWeight: Math.round(totalWeight * 100) / 100,
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalCustomers: customersMap.size,
        routes,
        packages: remainingPackages,
        customers: Array.from(customersMap.values()),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }
}

export async function resolveManifestAliases(sourceIds: string[]): Promise<string[]> {
  const allMatchingSrcIds = new Set<string>();
  try {
    const manifestsSnap = await getDocs(collection(db, 'manifests'));
    manifestsSnap.docs.forEach(doc => {
      const id = doc.id;
      const mData = doc.data();
      const mNum = (mData.manifestNumber || '').trim();
      sourceIds.forEach(srcId => {
        const trimmed = srcId.trim();
        if (id.trim() === trimmed || mNum === trimmed || srcId === id) {
          allMatchingSrcIds.add(id);
          allMatchingSrcIds.add(id.trim());
          if (mData.manifestNumber) {
            allMatchingSrcIds.add(mData.manifestNumber);
            allMatchingSrcIds.add(mData.manifestNumber.trim());
          }
        }
      });
    });
  } catch (err) {
    console.error('[resolveManifestAliases] Failed to resolve manifest aliases:', err);
  }
  if (allMatchingSrcIds.size === 0) {
    sourceIds.forEach(id => {
      allMatchingSrcIds.add(id);
      allMatchingSrcIds.add(id.trim());
    });
  }
  return Array.from(allMatchingSrcIds);
}

