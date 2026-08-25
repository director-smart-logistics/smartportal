import { 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  doc, 
  documentId, 
  getCountFromServer, 
  getDoc,
  setDoc,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getManifestMoveHistory, type ManifestMoveEvent } from '../audit-service';
import {
  type ManifestRecord,
  type MegaManRecord,
  type EncomiendaManifestRow,
  type ConsolidationManifestRow,
  type ManifestProcessedStatus
} from './types';

interface CachedManifestData {
  processedAt: string;
  totalPackages: number;
  consolidationCount?: number;
  moveHistory: ManifestMoveEvent[];
  fusedFromCounts?: Record<string, number>;
}
const manifestMetadataCache = new Map<string, CachedManifestData>();

export async function getRecentManifests(limitN = 10): Promise<ManifestRecord[]> {
  try {
    const ref = collection(db, 'manifests');
    const q = query(ref, orderBy('processedAt', 'desc'), limit(limitN * 6));
    const snap = await getDocs(q);
    const seen = new Set<string>();
    const results: ManifestRecord[] = [];
    for (const d of snap.docs) {
      if (results.length >= limitN) break;
      if (seen.has(d.id)) continue;
      const data = d.data();
      const src = data.source as string | undefined;
      // Skip link-only stub docs (no real package data):
      // - nova_mlocker: MLocker portal link markers (saveManifestMLockerLink)
      // - nova_fusion:  discarded-manifest merge stubs (saveManifestMergedLink)
      //   BUT NOT real MEGA-MAN fusion results which previously used nova_fusion
      //   by mistake — those have a non-empty packages array, so we keep them.
      const isLinkOnlyStub = (src === 'nova_mlocker') ||
        (src === 'nova_fusion' && (
          !Array.isArray(data.packages) || (data.packages as any[]).length === 0
        ));
      if (isLinkOnlyStub) continue;
      seen.add(d.id);
      results.push({
        id:            d.id,
        manifestType:  (data.manifestType  as string)   ?? 'usa_air',
        totalPackages: (data.totalPackages as number)   ?? 0,
        totalPrice:    (data.totalPrice    as number)   ?? 0,
        totalWeight:   (data.totalWeight   as number)   ?? 0,
        exchangeRate:  (data.exchangeRate  as number)   > 0 ? (data.exchangeRate as number) : undefined,
        routes:        (data.routes        as string[]) ?? [],
        processedAt:   (data.processedAt   as string)   ?? '',
        isMegaMan:     (d.id.toUpperCase().startsWith('MEGA-MAN-') || d.id.toUpperCase().startsWith('SL-MEGA-MAN-') || d.id.toUpperCase().startsWith('ENC-MEGA-MAN-')) || undefined,
        isEncomienda:  data.isEncomienda === true || d.id.toUpperCase().startsWith('ENC-') || undefined,
        isFirestoreFusion: data.isFirestoreFusion || undefined,
        mergedInto:    data.mergedInto as string | undefined,
      });
    }
    // Replace cached totalPackages with real counts from the packages collection.
    // Uses getCountFromServer (1 Firestore read per manifest — no doc data transferred)
    // so counts always reflect the actual state after bulk moves or re-assignments.
    const realCounts = await Promise.all(
      results.map(r =>
        getCountFromServer(query(collection(db, 'packages'), where('manifestNumber', '==', r.id)))
          .then(snap => ({ id: r.id, count: snap.data().count }))
          .catch(() => ({ id: r.id, count: r.totalPackages }))
      )
    );
    const countMap = new Map(realCounts.map(c => [c.id, c.count]));
    const withCounts = results.map(r => ({ ...r, totalPackages: countMap.get(r.id) || r.totalPackages }));

    // For MEGA-MAN entries, fetch which source manifests are fused inside them
    const megaMans = withCounts.filter(r => r.isMegaMan);
    if (megaMans.length > 0) {
      const fusedEntries = await Promise.all(
        megaMans.map(r =>
          getDocs(query(collection(db, 'manifests'), where('mergedInto', '==', r.id)))
            .then(snap => ({ id: r.id, sources: snap.docs.map(d => d.id).sort() }))
            .catch(() => ({ id: r.id, sources: [] }))
        )
      );
      const fusedMap = new Map(fusedEntries.map(e => [e.id, e.sources]));
      return withCounts.map(r => ({ ...r, fusedFrom: fusedMap.get(r.id) ?? r.fusedFrom }));
    }
    return withCounts;
  } catch {
    return [];
  }
}

export async function getRecentManifestsPaginated(
  pageSize: number,
  lastDocSnapshot: any | null = null,
): Promise<{ manifests: ManifestRecord[]; lastDoc: any; hasMore: boolean }> {
  try {
    const ref = collection(db, 'manifests');
    // Fetch more documents than pageSize because we might filter out link-only stubs
    const fetchLimit = pageSize * 4;
    let q = query(ref, orderBy('processedAt', 'desc'), limit(fetchLimit));
    if (lastDocSnapshot) {
      q = query(ref, orderBy('processedAt', 'desc'), startAfter(lastDocSnapshot), limit(fetchLimit));
    }
    const snap = await getDocs(q);
    const seen = new Set<string>();
    const results: ManifestRecord[] = [];
    let lastProcessedDoc: any = null;

    for (const d of snap.docs) {
      if (results.length >= pageSize) break;
      if (seen.has(d.id)) continue;
      const data = d.data();
      const src = data.source as string | undefined;
      const isLinkOnlyStub = (src === 'nova_mlocker') ||
        (src === 'nova_fusion' && (
          !Array.isArray(data.packages) || (data.packages as any[]).length === 0
        ));
      if (isLinkOnlyStub) continue;
      
      const mergedInto = data.mergedInto as string | undefined;
      const upperMergedInto = mergedInto?.toUpperCase();
      if (upperMergedInto && (upperMergedInto.startsWith('MEGA-MAN-') || upperMergedInto.startsWith('SL-MEGA-MAN-') || upperMergedInto.startsWith('ENC-MEGA-MAN-'))) continue;
      
      seen.add(d.id);
      
      const upperId = d.id.toUpperCase();
      const isMM = upperId.startsWith('MEGA-MAN-') || upperId.startsWith('SL-MEGA-MAN-') || upperId.startsWith('ENC-MEGA-MAN-');
      
      results.push({
        id:            d.id,
        manifestType:  (data.manifestType  as string)   ?? 'usa_air',
        totalPackages: (data.totalPackages  as number)  ?? 0,
        totalPrice:    (data.totalPrice     as number)  ?? 0,
        totalWeight:   (data.totalWeight    as number)  ?? 0,
        exchangeRate:  (data.exchangeRate   as number)  > 0 ? (data.exchangeRate as number) : undefined,
        routes:        (data.routes         as string[]) ?? [],
        processedAt:   (data.processedAt    as string)  ?? '',
        isMegaMan:     isMM || undefined,
        isFirestoreFusion: data.isFirestoreFusion || undefined,
        mergedInto:    data.mergedInto as string | undefined,
        packages:      isMM ? (data.packages as Array<{ tracking: string; [key: string]: unknown }> | undefined) : undefined,
        fusedFrom:     isMM
          ? (
              Array.isArray(data.fusedFrom)
                ? (data.fusedFrom as string[]).sort()
                : Array.isArray(data.fusedManifests)
                  ? (data.fusedManifests as string[]).sort()
                  : undefined
            )
          : undefined,
      });

      if (results.length === pageSize) {
        lastProcessedDoc = d;
      }
    }

    if (!lastProcessedDoc && snap.docs.length > 0 && results.length > 0) {
      const lastResult = results[results.length - 1];
      lastProcessedDoc = snap.docs.find(d => d.id === lastResult.id) || snap.docs[snap.docs.length - 1];
    }

    // Now compute live package counts for only the selected page results (max 7 items)
    const realCounts = await Promise.all(
      results.map(async r => {
        if (r.isMegaMan) {
          const embedded: any[] = Array.isArray((r as any).packages) ? (r as any).packages : [];
          const embeddedSet = new Set(embedded.map((p: any) => (p.tracking || '').toUpperCase()));
          const consolSnap = await getDocs(
            query(collection(db, 'manifest_consolidation'), where('manifestNumber', '==', r.id))
          ).catch(() => ({ docs: [] as any[] }));
          const consolDocs = (consolSnap as any).docs || [];
          const consolNotInEmbedded = consolDocs.filter(
            (d: any) => !embeddedSet.has(((d.data().tracking as string) || d.id).toUpperCase())
          );
          const trueTotal    = embedded.length + consolNotInEmbedded.length;
          const consolCount  = consolDocs.length;
          return { id: r.id, count: trueTotal, consolCount };
        }
        const pkgCount = await getCountFromServer(
          query(collection(db, 'packages'), where('manifestNumber', '==', r.id))
        ).then(s => s.data().count).catch(() => r.totalPackages);
        return { id: r.id, count: pkgCount, consolCount: 0 };
      })
    );

    const countMap   = new Map(realCounts.map(c => [c.id, c.count]));
    const consolMap  = new Map(realCounts.map(c => [c.id, c.consolCount]));
    const withCounts = results.map(r => ({
      ...r,
      totalPackages:      countMap.get(r.id) ?? r.totalPackages,
      consolidationCount: (consolMap.get(r.id) ?? 0) > 0 ? consolMap.get(r.id) : undefined,
    }));

    // Fetch histories
    const historyEntries = await Promise.all(
      withCounts.map(r =>
        getManifestMoveHistory(r.id)
          .then(h => ({ id: r.id, history: h }))
          .catch(() => ({ id: r.id, history: [] as ManifestMoveEvent[] }))
      )
    );
    const historyMap = new Map(historyEntries.map(e => [e.id, e.history]));

    // Fetch fusedFrom
    const megaMans = withCounts.filter(r => r.isMegaMan);
    const fusedEntries = await Promise.all(
      megaMans.map(async r => {
        let sources = r.fusedFrom;
        if (!sources) {
          sources = await getDocs(query(collection(db, 'manifests'), where('mergedInto', '==', r.id)))
            .then(snap => snap.docs.map(d => d.id).sort())
            .catch(() => [] as string[]);
        }
        return { id: r.id, sources };
      })
    );
    const fusedMap = new Map(fusedEntries.map(e => [e.id, e.sources]));

    const allFusedSources = Array.from(fusedMap.entries())
      .filter(([, srcs]) => Array.isArray(srcs) && srcs.length > 0)
      .flatMap(([megaManId, srcs]) => srcs.map(src => ({ megaManId, src })));

    const fusedFromCountsMap = new Map<string, Record<string, number>>();
    if (allFusedSources.length > 0) {
      const srcCounts = await Promise.all(
        allFusedSources.map(async ({ megaManId, src }) => {
          try {
            let d = await getDoc(doc(db, 'manifests', src));
            if (!d.exists()) {
              d = await getDoc(doc(db, 'manifests', src.trim()));
            }
            const storedCount = d.exists() ? ((d.data()?.totalPackages as number) ?? 0) : 0;
            if (storedCount > 0) return { megaManId, src, count: storedCount };
            let liveCount = await getCountFromServer(
              query(collection(db, 'packages'), where('manifestNumber', '==', src.trim()))
            ).then(s => s.data().count).catch(() => 0);
            if (liveCount === 0) {
              liveCount = await getCountFromServer(
                query(collection(db, 'packages'), where('manifestNumber', '==', src))
              ).then(s => s.data().count).catch(() => 0);
            }
            return { megaManId, src, count: liveCount };
          } catch {
            return { megaManId, src, count: 0 };
          }
        })
      );
      for (const { megaManId, src, count } of srcCounts) {
        if (!fusedFromCountsMap.has(megaManId)) fusedFromCountsMap.set(megaManId, {});
        fusedFromCountsMap.get(megaManId)![src] = count;
      }
    }

    const finalManifests = withCounts.map(r => ({
      ...r,
      fusedFrom:      r.fusedFrom ?? fusedMap.get(r.id),
      fusedFromCounts: fusedFromCountsMap.get(r.id),
      moveHistory:    historyMap.get(r.id) ?? [],
    }));

    const hasMore = snap.docs.length === fetchLimit;

    return {
      manifests: finalManifests,
      lastDoc: lastProcessedDoc,
      hasMore,
    };
  } catch (err) {
    console.error('[getRecentManifestsPaginated] Error fetching paginated manifests:', err);
    return { manifests: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Real-time fast-path subscription for recent manifests in Nova Chat and Manifest Pickers.
 *
 * Performance Architecture:
 * - Emits parsed cached documents synchronously (0ms latency) upon Firestore snapshot arrival.
 * - Dispatches secondary count/metadata resolutions asynchronously in the background.
 * - Prevents UI stalling by eliminating blocking sequential Firestore lookups on the main thread.
 *
 * @param limitN - Maximum number of unique manifests to deliver to the subscriber
 * @param callback - Consumer function invoked synchronously with the latest manifest records
 * @returns Unsubscribe function to release the Firestore listener
 */
export function subscribeRecentManifests(
  limitN: number,
  callback: (records: ManifestRecord[]) => void,
): () => void {
  const ref = collection(db, 'manifests');
  const q = query(ref, orderBy('processedAt', 'desc'), limit(limitN * 6));

  const unsub = onSnapshot(q, async snap => {
    const seen = new Set<string>();
    const results: ManifestRecord[] = [];
    for (const d of snap.docs) {
      if (results.length >= limitN) break;
      if (seen.has(d.id)) continue;
      const data = d.data();

      // Filter out USA Sea and Colombia manifests
      const manifestType = (data.manifestType as string) ?? 'usa_air';
      if (manifestType === 'usa_sea' || manifestType === 'colombia_air') continue;

      const src = data.source as string | undefined;
      const isLinkOnlyStub = (src === 'nova_mlocker') ||
        (src === 'nova_fusion' && (
          !Array.isArray(data.packages) || (data.packages as any[]).length === 0
        ));
      if (isLinkOnlyStub) continue;
      const mergedInto = data.mergedInto as string | undefined;
      const upperMergedInto = mergedInto?.toUpperCase();
      if (upperMergedInto && (upperMergedInto.startsWith('MEGA-MAN-') || upperMergedInto.startsWith('SL-MEGA-MAN-') || upperMergedInto.startsWith('ENC-MEGA-MAN-'))) continue;
      seen.add(d.id);
      const upperId = d.id.toUpperCase();
      const isMM = upperId.startsWith('MEGA-MAN-') || upperId.startsWith('SL-MEGA-MAN-') || upperId.startsWith('ENC-MEGA-MAN-');
      results.push({
        id:            d.id,
        manifestType,
        totalPackages: (data.totalPackages  as number)  ?? 0,
        totalPrice:    (data.totalPrice     as number)  ?? 0,
        totalWeight:   (data.totalWeight    as number)  ?? 0,
        exchangeRate:  (data.exchangeRate   as number)  > 0 ? (data.exchangeRate as number) : undefined,
        routes:        (data.routes         as string[]) ?? [],
        processedAt:   (data.processedAt    as string)  ?? '',
        isMegaMan:     isMM || undefined,
        isFirestoreFusion: data.isFirestoreFusion || undefined,
        mergedInto:    data.mergedInto as string | undefined,
        packages:      isMM ? (data.packages as Array<{ tracking: string; [key: string]: unknown }> | undefined) : undefined,
        fusedFrom:     isMM
          ? (
              Array.isArray(data.fusedFrom)
                ? (data.fusedFrom as string[]).sort()
                : Array.isArray(data.fusedManifests)
                  ? (data.fusedManifests as string[]).sort()
                  : undefined
            )
          : undefined,
      });
    }

    // 1. Build immediate manifests synchronously from Firestore document payload and memory cache
    const immediateManifests: ManifestRecord[] = results.map(r => {
      const cached = manifestMetadataCache.get(r.id);
      return {
        ...r,
        totalPackages: cached?.totalPackages ?? r.totalPackages,
        consolidationCount: cached?.consolidationCount ?? r.consolidationCount,
        moveHistory: cached?.moveHistory ?? r.moveHistory ?? [],
        fusedFromCounts: cached?.fusedFromCounts ?? r.fusedFromCounts,
      };
    });

    // 2. Emit immediately to UI so user sees manifests in 0ms without waiting
    callback(immediateManifests);

    // 3. Background asynchronous enrichment only for items missing counts/fused metadata
    const needsEnrichment = results.some(r => {
      const cached = manifestMetadataCache.get(r.id);
      return !cached || (r.isMegaMan && (!cached.fusedFromCounts && r.fusedFrom && r.fusedFrom.length > 0));
    });

    if (needsEnrichment) {
      Promise.all(
        results.map(async r => {
          const cached = manifestMetadataCache.get(r.id);
          if (cached && cached.processedAt === r.processedAt) {
            return {
              ...r,
              totalPackages: cached.totalPackages,
              consolidationCount: cached.consolidationCount,
              moveHistory: cached.moveHistory,
              fusedFromCounts: cached.fusedFromCounts,
            };
          }

          let totalPackages = r.totalPackages;
          let consolidationCount = r.consolidationCount;
          let fusedFromCounts = r.fusedFromCounts;
          let sources = r.fusedFrom;

          if (r.isMegaMan) {
            const embedded: any[] = Array.isArray((r as any).packages) ? (r as any).packages : [];
            if (embedded.length > 0) {
              totalPackages = embedded.length;
            }
            if (sources && sources.length > 0 && !fusedFromCounts) {
              fusedFromCounts = {};
              for (const src of sources) {
                const srcCached = manifestMetadataCache.get(src);
                if (srcCached && srcCached.totalPackages > 0) {
                  fusedFromCounts[src] = srcCached.totalPackages;
                }
              }
            }
          }

          manifestMetadataCache.set(r.id, {
            processedAt: r.processedAt,
            totalPackages,
            consolidationCount,
            moveHistory: r.moveHistory ?? [],
            fusedFromCounts,
          });

          return {
            ...r,
            totalPackages,
            consolidationCount,
            fusedFromCounts,
          };
        })
      ).then(enriched => {
        callback(enriched);
      }).catch(err => {
        console.warn('[subscribeRecentManifests] Background enrichment warning:', err);
      });
    }
  });

  return unsub;
}

export async function getMegaManManifests(): Promise<MegaManRecord[]> {
  try {
    const ref = collection(db, 'manifests');
    const q = query(
      ref,
      where(documentId(), '>=', 'MEGA-MAN-'),
      where(documentId(), '<', 'MEGA-MAN~'),
      orderBy(documentId(), 'desc'),
      limit(10),
    );
    const snap = await getDocs(q);
    const records: MegaManRecord[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id:            d.id,
        totalPackages: (data.totalPackages as number) ?? 0,
        totalPrice:    (data.totalPrice    as number) ?? 0,
        exchangeRate:  (data.exchangeRate  as number) ?? 0,
        routes:        (data.routes        as string[]) ?? [],
        processedAt:   (data.processedAt   as string) ?? '',
        fusedFrom: Array.isArray(data.fusedFrom)
          ? (data.fusedFrom as string[]).sort()
          : Array.isArray(data.fusedManifests)
            ? (data.fusedManifests as string[]).sort()
            : undefined,
      };
    });
    // Fetch real package counts from the packages collection in parallel
    const realCounts = await Promise.all(
      records.map(r =>
        getCountFromServer(query(collection(db, 'packages'), where('manifestNumber', '==', r.id)))
          .then(snap => ({ id: r.id, count: snap.data().count }))
          .catch(() => ({ id: r.id, count: r.totalPackages }))
      )
    );
    const countMap = new Map(realCounts.map(c => [c.id, c.count]));
    return records.map(r => ({ ...r, totalPackages: countMap.get(r.id) || r.totalPackages }));
  } catch {
    return [];
  }
}

export function subscribeMegaManManifests(
  callback: (records: MegaManRecord[]) => void,
): () => void {
  const ref = collection(db, 'manifests');
  const q = query(
    ref,
    where(documentId(), '>=', 'MEGA-MAN-'),
    where(documentId(), '<', 'MEGA-MAN~'),
    orderBy(documentId(), 'desc'),
    limit(10),
  );

  const unsub = onSnapshot(q, async snap => {
    const records: MegaManRecord[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id:            d.id,
        totalPackages: (data.totalPackages as number) ?? 0,
        totalPrice:    (data.totalPrice    as number) ?? 0,
        exchangeRate:  (data.exchangeRate  as number) ?? 0,
        routes:        (data.routes        as string[]) ?? [],
        processedAt:   (data.processedAt   as string) ?? '',
      };
    });
    const realCounts = await Promise.all(
      records.map(r =>
        getCountFromServer(query(collection(db, 'packages'), where('manifestNumber', '==', r.id)))
          .then(s => ({ id: r.id, count: s.data().count }))
          .catch(() => ({ id: r.id, count: r.totalPackages }))
      )
    );
    const countMap = new Map(realCounts.map(c => [c.id, c.count]));
    callback(records.map(r => ({ ...r, totalPackages: countMap.get(r.id) || r.totalPackages })));
  });

  return unsub;
}

export async function getManifestProcessedStatus(
  manifestIds: string[]
): Promise<Record<string, ManifestProcessedStatus>> {
  if (!manifestIds.length) return {};
  const ids = manifestIds.filter(Boolean);
  const manifestsRef = collection(db, 'manifests');
  const out: Record<string, ManifestProcessedStatus> = {};

  // Tier 1: direct doc lookup — SP1 Nova saves with doc ID = manifestNumber
  const directSnaps = await Promise.all(
    ids.map(id => getDoc(doc(manifestsRef, id)).catch(() => null))
  );
  const missingIds: string[] = [];
  // Map from portal-ID → linked Excel manifest number for Tier 3 recovery
  const linkedManifestNumbers: Map<string, string> = new Map();
  for (let i = 0; i < ids.length; i++) {
    const snap = directSnaps[i];
    if (snap?.exists()) {
      const d = snap.data();
      const pkgCount =
        (d.totalPackages as number) ||
        (Array.isArray(d.packages) ? (d.packages as unknown[]).length : 0);
      out[ids[i]] = {
        totalPackages: pkgCount,
        processedAt:   (d.processedAt  as string)  ?? '',
        ...(d.mergedInto ? { mergedInto: d.mergedInto as string } : {}),
      };
      // Tier 3 candidate: fused stub whose count was cleared — store the linked Excel number
      const linkedNum = d.manifestNumber as string | undefined;
      if (pkgCount === 0 && d.mergedInto && linkedNum && linkedNum !== ids[i]) {
        linkedManifestNumbers.set(ids[i], linkedNum);
      }
    } else {
      missingIds.push(ids[i]);
    }
  }

  // Tier 2: query by manifestId field — SP2 imports use auto-generated doc IDs
  if (missingIds.length > 0) {
    for (let i = 0; i < missingIds.length; i += 30) {
      const chunk = missingIds.slice(i, i + 30);
      try {
        const q = query(manifestsRef, where('manifestId', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const mid = (d.manifestId as string) ?? '';
          if (mid && !out[mid]) {
            out[mid] = {
              totalPackages: (d.totalPackages as number)
                ?? (Array.isArray(d.packages) ? (d.packages as unknown[]).length : 0),
              processedAt: (d.processedAt as string) ?? (d.importedAt as string) ?? '',
              ...(d.mergedInto ? { mergedInto: d.mergedInto as string } : {}),
            };
          }
        });
      } catch {
        // Non-fatal: graceful degradation
      }
    }
  }

  // Tier 3: recover original count for fused mlocker stubs where totalPackages was
  // overwritten to 0 by the old saveManifestMergedLink logic.
  // Each entry in linkedManifestNumbers maps portalId → Excel manifestNumber.
  if (linkedManifestNumbers.size > 0) {
    const linkedEntries = Array.from(linkedManifestNumbers.entries());
    const linkedSnaps = await Promise.all(
      linkedEntries.map(([, num]) => getDoc(doc(manifestsRef, num)).catch(() => null))
    );
    linkedEntries.forEach(([portalId], idx) => {
      const snap = linkedSnaps[idx];
      if (!snap?.exists()) return;
      const d = snap.data();
      const recovered =
        (d.totalPackages as number) ||
        (Array.isArray(d.packages) ? (d.packages as unknown[]).length : 0);
      if (recovered > 0 && out[portalId]) {
        out[portalId].totalPackages = recovered;
        // Self-heal: write the recovered count back to the stub doc so future
        // reads don't need a secondary lookup (one-time repair, merge-safe).
        setDoc(doc(manifestsRef, portalId), { totalPackages: recovered }, { merge: true }).catch(() => {});
      }
    });
  }

  return out;
}

export function subscribeManifestProcessedStatus(
  manifestIds: string[],
  onChange: (status: Record<string, ManifestProcessedStatus>) => void,
): () => void {
  const ids = manifestIds.filter(Boolean);
  if (!ids.length) { onChange({}); return () => {}; }

  const manifestsRef = collection(db, 'manifests');
  const accumulated: Record<string, ManifestProcessedStatus> = {};
  const unsubscribers: Array<() => void> = [];

  const emit = () => onChange({ ...accumulated });

  // Tier 1: one listener per manifest ID (direct doc)
  ids.forEach(id => {
    const unsub = onSnapshot(doc(manifestsRef, id), snap => {
      if (snap.exists()) {
        const d = snap.data();
        const pkgCount =
          (d.totalPackages as number) ||
          (Array.isArray(d.packages) ? (d.packages as unknown[]).length : 0);
        const linkedNum = d.manifestNumber as string | undefined;
        const isLinkedToMegaMan = linkedNum && (
          linkedNum.startsWith('MEGA-MAN-') ||
          linkedNum.startsWith('SL-MEGA-MAN-') ||
          linkedNum.startsWith('ENC-MEGA-MAN-')
        ) && linkedNum !== id;
        accumulated[id] = {
          totalPackages: pkgCount,
          processedAt:   (d.processedAt as string) ?? '',
          mergedInto:    (d.mergedInto as string) || (isLinkedToMegaMan ? linkedNum : undefined),
        };
        // Tier 3: fused mlocker stub with cleared count — async-recover from linked Excel doc.
        // Emits a second time once the real count is available (reactive update).
        if (pkgCount === 0 && d.mergedInto && linkedNum && linkedNum !== id) {
          getDoc(doc(manifestsRef, linkedNum)).then(linkedSnap => {
            if (!linkedSnap.exists()) return;
            const ld = linkedSnap.data();
            const recovered =
              (ld.totalPackages as number) ||
              (Array.isArray(ld.packages) ? (ld.packages as unknown[]).length : 0);
            if (recovered > 0 && accumulated[id]) {
              accumulated[id] = { ...accumulated[id], totalPackages: recovered };
              emit();
              // Self-heal: write the recovered count back to the stub doc so future
              // reads skip Tier 3 entirely (one-time repair, merge-safe).
              setDoc(doc(manifestsRef, id), { totalPackages: recovered }, { merge: true }).catch(() => {});
            }
          }).catch(() => {});
        }
      } else {
        delete accumulated[id];
      }
      emit();
    }, () => {});
    unsubscribers.push(unsub);
  });

  // Tier 2: query by manifestId field in chunks of 10 (Firestore `in` limit)
  const CHUNK = 10;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const q = query(manifestsRef, where('manifestId', 'in', chunk));
      const unsub = onSnapshot(q, snap => {
        snap.docs.forEach(docSnap => {
          const d = docSnap.data();
          const mid = (d.manifestId as string) ?? '';
          if (mid && ids.includes(mid) && !accumulated[mid]) {
            accumulated[mid] = {
              totalPackages: (d.totalPackages as number)
                ?? (Array.isArray(d.packages) ? (d.packages as unknown[]).length : 0),
              processedAt: (d.processedAt as string) ?? (d.importedAt as string) ?? '',
              ...(d.mergedInto ? { mergedInto: d.mergedInto as string } : {}),
            };
          }
        });
        emit();
      }, () => {});
      unsubscribers.push(unsub);
    } catch {
      // Non-fatal
    }
  }

  return () => unsubscribers.forEach(u => u());
}

export function subscribePackagesByManifest(
  manifestNumber: string,
  onChange: (trackings: Set<string>) => void,
): () => void {
  if (!manifestNumber) return () => {};

  let isCleanedUp = false;
  const unsubs: Array<() => void> = [];
  const trackingSets = new Map<string, Set<string>>();

  const emitCombined = () => {
    if (isCleanedUp) return;
    const combined = new Set<string>();
    for (const s of trackingSets.values()) {
      for (const t of s) combined.add(t);
    }
    onChange(combined);
  };

  const setupListener = (id: string, key: string, isConsolidation = false) => {
    if (!id || isCleanedUp) return;
    const colName = isConsolidation ? 'manifest_consolidation' : 'packages';
    const q = query(collection(db, colName), where('manifestNumber', '==', id));
    const unsub = onSnapshot(
      q,
      snap => {
        const set = new Set<string>();
        snap.docs.forEach(d => {
          const data = d.data();
          const tracking = String(data.tracking ?? data.trackingNumber ?? d.id ?? '').toUpperCase();
          if (tracking) set.add(tracking);
        });
        trackingSets.set(key, set);
        emitCombined();
      },
      () => { /* non-fatal */ }
    );
    unsubs.push(unsub);
  };

  // 1. Direct listeners on the primary manifestNumber (both packages and manifest_consolidation)
  setupListener(manifestNumber, `pkg:${manifestNumber}`);
  setupListener(manifestNumber, `cons:${manifestNumber}`, true);

  // 2. Asynchronously resolve fusedManifests / fusedFrom in case of MEGA-MAN or fusion manifests
  (async () => {
    try {
      const snap = await getDoc(doc(collection(db, 'manifests'), manifestNumber));
      if (isCleanedUp || !snap.exists()) return;
      const data = snap.data();
      const fused = [
        ...(Array.isArray(data?.fusedFrom) ? data.fusedFrom : []),
        ...(Array.isArray(data?.fusedManifests) ? data.fusedManifests : []),
      ]
        .map((id: any) => String(id || '').trim())
        .filter((v: string, i: number, a: string[]) => Boolean(v) && a.indexOf(v) === i && v !== manifestNumber);

      for (const subId of fused) {
        setupListener(subId, `pkg:${subId}`);
        setupListener(subId, `cons:${subId}`, true);
      }
    } catch {
      // Non-fatal: direct listener is already active
    }
  })();

  return () => {
    isCleanedUp = true;
    unsubs.forEach(u => u());
  };
}

export function subscribeEncomiendaManifestRows(
  manifestNumber: string,
  onChange: (rows: EncomiendaManifestRow[]) => void,
): () => void {
  const colRef = collection(db, 'manifest_encomiendas');
  const q = query(colRef, where('manifestNumber', '==', manifestNumber));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => d.data() as EncomiendaManifestRow));
  });
}

export function subscribeAllEncomiendaManifests(
  onChange: (manifests: Map<string, EncomiendaManifestRow[]>) => void,
): () => void {
  // Read natively from the packages collection, eliminating the need for a separate mirror collection
  const colRef = collection(db, 'packages');
  const q = query(colRef, where('ruta', '==', 'Encomiendas'), where('status', '!=', 'delivered'));
  return onSnapshot(q, snap => {
    const map = new Map<string, EncomiendaManifestRow[]>();
    snap.docs.forEach(d => {
      const p = d.data();
      const manifestNumber = p.manifestNumber || '';
      if (!manifestNumber) return;
      
      const row: EncomiendaManifestRow = {
        tracking: (p.trackingNumber || p.tracking || d.id).toUpperCase(),
        manifestNumber: manifestNumber,
        slCode: p.slCode || p.userId || '',
        customerName: p.customerName || p.nombre || '',
        ruta: p.ruta || 'Encomiendas',
        weight: Number(p.weight ?? p.peso ?? 0),
        price: Number(p.price ?? p.cost ?? p.precio ?? 0),
        description: p.description || p.descripcion || '',
        permisos: p.permisos ?? p.requiresPermit ?? false,
        consolidacion: p.consolidacion ?? p.isConsolidated ?? false,
        savedAt: typeof p.createdAt === 'object' && p.createdAt?.seconds 
          ? new Date(p.createdAt.seconds * 1000).toISOString() 
          : (p.createdAt || new Date().toISOString()),
        updatedAt: typeof p.updatedAt === 'object' && p.updatedAt?.seconds 
          ? new Date(p.updatedAt.seconds * 1000).toISOString() 
          : (p.updatedAt || new Date().toISOString()),
        status: p.status,
        statusLabel: p.statusLabel,
        // Invoice-related fields will be populated live by EncomiendaManifests.tsx
        thirdPartyCost: p.thirdPartyCost ?? 0,
        thirdPartyCostDescription: p.thirdPartyCostDescription ?? '',
        invoiceNumber: p.invoiceNumber ?? '',
        invoiceUpdated: p.invoiceUpdated ?? false,
      };
      
      if (!map.has(manifestNumber)) map.set(manifestNumber, []);
      map.get(manifestNumber)!.push(row);
    });
    map.forEach(rows => rows.sort((a, b) => a.customerName.localeCompare(b.customerName)));
    onChange(map);
  });
}

export function subscribeConsolidationManifestRows(
  manifestNumber: string,
  onChange: (rows: ConsolidationManifestRow[]) => void,
): () => void {
  const colRef = collection(db, 'manifest_consolidations');
  const q = query(colRef, where('manifestNumber', '==', manifestNumber));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => d.data() as ConsolidationManifestRow));
  });
}

export function subscribeAllConsolidationManifests(
  onChange: (manifests: Map<string, ConsolidationManifestRow[]>) => void,
): () => void {
  const colRef = collection(db, 'manifest_consolidations');
  return onSnapshot(colRef, snap => {
    const map = new Map<string, ConsolidationManifestRow[]>();
    snap.docs.forEach(d => {
      const row = d.data() as ConsolidationManifestRow;
      const key = row.updatedManifest || row.manifestNumber;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    map.forEach(rows => rows.sort((a, b) => a.customerName.localeCompare(b.customerName)));
    onChange(map);
  });
}

