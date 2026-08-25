import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { logAction } from '../audit-service';

export interface HealingResult {
  megaManId: string;
  packagesHealed: number;
  invoicesHealed: number;
  sourceManifestsCleaned: number;
  details: string[];
}

/**
 * Idempotent healing service for ENC-MEGA-MAN and MEGA-MAN manifests.
 * Scans Firestore for any packages/invoices belonging to fused MEGA-MAN manifests
 * whose `manifestNumber` in the packages collection was left pointing to source manifests.
 * Also cleans the embedded `packages` array inside source manifest documents.
 */
export async function healMegaManManifest(megaManId: string): Promise<HealingResult> {
  const result: HealingResult = {
    megaManId,
    packagesHealed: 0,
    invoicesHealed: 0,
    sourceManifestsCleaned: 0,
    details: [],
  };

  const megaRef = doc(db, 'manifests', megaManId);
  const megaSnap = await getDoc(megaRef);
  if (!megaSnap.exists()) {
    result.details.push(`Manifiesto ${megaManId} no existe.`);
    return result;
  }

  const megaData = megaSnap.data();
  const fusedFrom: string[] = [
    ...(Array.isArray(megaData.fusedFrom) ? megaData.fusedFrom : []),
    ...(Array.isArray(megaData.fusedManifests) ? megaData.fusedManifests : []),
  ].map(id => String(id || '').trim()).filter(Boolean);

  const embeddedPackages: any[] = Array.isArray(megaData.packages) ? megaData.packages : [];
  if (embeddedPackages.length === 0 && fusedFrom.length === 0) {
    result.details.push(`No hay paquetes ni fuentes registradas en ${megaManId}.`);
    return result;
  }

  const isEncMega = megaManId.toUpperCase().startsWith('ENC-');
  const now = new Date().toISOString();

  // 1. Build master tracking set belonging to the ENC-MEGA-MAN
  const megaTrackingSet = new Set<string>();
  embeddedPackages.forEach(p => {
    const trk = String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim();
    if (trk) megaTrackingSet.add(trk);
  });

  // 2. Clean embedded array and recalculate totals on each source manifest doc
  for (const srcId of fusedFrom) {
    if (!srcId || srcId === megaManId) continue;
    const srcRef = doc(db, 'manifests', srcId);
    const srcSnap = await getDoc(srcRef).catch(() => null);
    if (!srcSnap || !srcSnap.exists()) continue;

    const srcData = srcSnap.data();
    const currentPkgs: any[] = Array.isArray(srcData.packages) ? srcData.packages : [];

    // Filter out encomiendas or trackings that belong to megaTrackingSet
    const remainingPkgs = currentPkgs.filter(p => {
      const trk = String(p.tracking || p.guia || p.trackingNumber || '').toUpperCase().trim();
      if (isEncMega && (p.ruta === 'Encomiendas' || megaTrackingSet.has(trk))) {
        return false;
      }
      if (megaTrackingSet.has(trk)) return false;
      return true;
    });

    if (remainingPkgs.length !== currentPkgs.length) {
      const totalWeight = remainingPkgs.reduce((sum, p) => sum + (p.weight || p.peso || 0), 0);
      const totalPrice = remainingPkgs.reduce((sum, p) => sum + (p.price || p.precio || 0), 0);
      const routes = [...new Set(remainingPkgs.map(p => p.ruta).filter(Boolean))];

      const customersMap = new Map<string, { slCode: string; fullName: string; email: string; ruta: string; packageCount: number }>();
      remainingPkgs.forEach(p => {
        const sc = p.slCode || p.userId || '';
        if (!sc) return;
        const existing = customersMap.get(sc);
        if (existing) {
          existing.packageCount++;
        } else {
          customersMap.set(sc, {
            slCode: sc,
            fullName: p.customerName || p.nombre || '',
            email: p.customerEmail || '',
            ruta: p.ruta || '',
            packageCount: 1,
          });
        }
      });

      await writeBatch(db).update(srcRef, {
        totalPackages: remainingPkgs.length,
        totalWeight: Math.round(totalWeight * 100) / 100,
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalCustomers: customersMap.size,
        routes,
        packages: remainingPkgs,
        customers: Array.from(customersMap.values()),
        updatedAt: now,
        ...(remainingPkgs.length === 0 ? { mergedInto: megaManId, mergedAt: now } : {}),
      }).commit().catch(err => console.error(`Failed to clean source manifest ${srcId}:`, err));

      result.sourceManifestsCleaned++;
    }
  }

  // 3. Query packages collection for source manifests to find any remaining orphaned package docs
  for (const srcId of fusedFrom) {
    let q = query(collection(db, 'packages'), where('manifestNumber', '==', srcId));
    if (isEncMega) {
      q = query(collection(db, 'packages'), where('manifestNumber', '==', srcId), where('ruta', '==', 'Encomiendas'));
    }
    const srcSnap = await getDocs(q).catch(() => null);
    if (srcSnap && !srcSnap.empty) {
      srcSnap.docs.forEach(d => megaTrackingSet.add(d.id.toUpperCase().trim()));
    }
  }

  const allTrackings = Array.from(megaTrackingSet);
  if (allTrackings.length === 0) return result;

  // 4. Update package documents in packages collection (chunks of 450)
  const CHUNK_SIZE = 450;
  for (let i = 0; i < allTrackings.length; i += CHUNK_SIZE) {
    const chunk = allTrackings.slice(i, i + CHUNK_SIZE);
    
    const pkgSnaps = await Promise.all(
      chunk.map(t => getDoc(doc(db, 'packages', t)).catch(() => null))
    );

    const batch = writeBatch(db);
    let batchPkgCount = 0;

    pkgSnaps.forEach((snap, idx) => {
      if (!snap || !snap.exists()) return;
      const data = snap.data();
      const trk = chunk[idx];
      const currentMn = String(data.manifestNumber || '').trim();
      const currentEncMn = String(data.encomiendaManifestNumber || '').trim();

      const needsMnUpdate = currentMn !== megaManId;
      const needsEncUpdate = isEncMega && currentEncMn !== megaManId;

      if (needsMnUpdate || needsEncUpdate) {
        const originalManifest = data.originalManifest || currentMn || fusedFrom[0] || '';
        batch.update(snap.ref, {
          manifestNumber: megaManId,
          manifestId: megaManId,
          originalManifest,
          updatedAt: now,
          ...(isEncMega ? { encomiendaManifestNumber: megaManId } : {}),
        });
        batchPkgCount++;

        logAction({
          userId: 'system_healer',
          action: 'system_event',
          category: 'manifest',
          resource: 'packages',
          resourceId: trk,
          result: 'success',
          metadata: {
            stage: 'package_healed',
            previousManifest: currentMn,
            targetMegaMan: megaManId,
            originalManifest,
          },
        });
      }
    });

    if (batchPkgCount > 0) {
      await batch.commit();
      result.packagesHealed += batchPkgCount;
    }
  }

  // 5. Also heal invoices for the migrated trackings
  for (let i = 0; i < allTrackings.length; i += CHUNK_SIZE) {
    const chunk = allTrackings.slice(i, i + CHUNK_SIZE);
    const invSnap = await getDocs(
      query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains-any', chunk.slice(0, 10)))
    ).catch(() => null);

    if (invSnap && !invSnap.empty) {
      const invBatch = writeBatch(db);
      let batchInvCount = 0;

      invSnap.docs.forEach(d => {
        const invData = d.data();
        if (invData.manifestNumber !== megaManId) {
          invBatch.update(d.ref, {
            manifestNumber: megaManId,
            manifestId: megaManId,
            originalManifest: invData.originalManifest || invData.manifestNumber || '',
            updatedAt: now,
          });
          batchInvCount++;
        }
      });

      if (batchInvCount > 0) {
        await invBatch.commit();
        result.invoicesHealed += batchInvCount;
      }
    }
  }

  result.details.push(`Se limpiaron ${result.sourceManifestsCleaned} manifiestos origen, ${result.packagesHealed} paquetes y ${result.invoicesHealed} facturas en ${megaManId}.`);
  return result;
}

/**
 * Heals all active MEGA-MAN manifests in the system.
 */
export async function healAllMegaManManifests(): Promise<HealingResult[]> {
  const manifestsSnap = await getDocs(collection(db, 'manifests'));
  const results: HealingResult[] = [];

  const megaDocs = manifestsSnap.docs.filter(d => {
    const id = d.id.toUpperCase();
    const data = d.data();
    return data.isMegaMan === true || data.isFirestoreFusion === true || id.startsWith('ENC-MEGA-MAN-') || id.startsWith('MEGA-MAN-') || id.startsWith('SL-MEGA-MAN-');
  });

  for (const docSnap of megaDocs) {
    const res = await healMegaManManifest(docSnap.id);
    results.push(res);
  }

  return results;
}

/**
 * Atomic rollback tool to revert a MEGA-MAN fusion.
 * Reverts package and invoice manifestNumbers back to their originalManifest IDs.
 */
export async function rollbackMegaManFusion(megaManId: string): Promise<{ packagesReverted: number; invoicesReverted: number }> {
  const now = new Date().toISOString();
  let packagesReverted = 0;
  let invoicesReverted = 0;

  // 1. Revert packages in packages collection
  const pkgSnap = await getDocs(query(collection(db, 'packages'), where('manifestNumber', '==', megaManId)));
  if (!pkgSnap.empty) {
    const chunks = [];
    for (let i = 0; i < pkgSnap.docs.length; i += 450) {
      chunks.push(pkgSnap.docs.slice(i, i + 450));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach(d => {
        const data = d.data();
        const orig = data.originalManifest || data.manifestId || '';
        batch.update(d.ref, {
          manifestNumber: orig,
          manifestId: orig,
          encomiendaManifestNumber: null,
          updatedAt: now,
        });
        packagesReverted++;
      });
      await batch.commit();
    }
  }

  // 2. Revert invoices
  const invSnap = await getDocs(query(collection(db, 'invoices'), where('manifestNumber', '==', megaManId)));
  if (!invSnap.empty) {
    const batch = writeBatch(db);
    invSnap.docs.forEach(d => {
      const data = d.data();
      const orig = data.originalManifest || '';
      if (orig) {
        batch.update(d.ref, {
          manifestNumber: orig,
          manifestId: orig,
          updatedAt: now,
        });
        invoicesReverted++;
      }
    });
    await batch.commit();
  }

  logAction({
    userId: 'system_rollback',
    action: 'system_event',
    category: 'manifest',
    resource: 'manifests',
    resourceId: megaManId,
    result: 'success',
    metadata: {
      stage: 'fusion_rollback_completed',
      packagesReverted,
      invoicesReverted,
    },
  });

  return { packagesReverted, invoicesReverted };
}
