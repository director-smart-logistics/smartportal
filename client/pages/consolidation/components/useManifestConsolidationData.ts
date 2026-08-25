/**
 * useManifestConsolidationData
 *
 * Real-time hook for the Consolidation Manifests module.
 *
 * Reads exclusively from the `manifest_consolidation` Firestore collection —
 * a dedicated, initially-empty store that only receives items when a user
 * explicitly moves a package / invoice item into it.
 *
 * Returns data in the same shape as useConsolidationData so the existing
 * CustomerCard / ManifestGroup / PackageRow UI components work without changes.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  subscribeConsolidationItems,
  type ManifestConsolidationItem,
} from '@/lib/services/manifest-consolidation-service';
import type {
  ConsolidationCustomer,
  ConsolidationPackage,
  CustomerSection,
  ManifestGroup,
} from './types';

export interface UseManifestConsolidationResult {
  customerSections: CustomerSection[];
  allManifestNumbers: string[];
  /** Raw flat list — useful for duplicate-checking in the add dialog */
  rawItems: ManifestConsolidationItem[];
  loading: boolean;
  error: string | null;
}

export function useManifestConsolidationData(): UseManifestConsolidationResult {
  const [items, setItems]     = useState<ManifestConsolidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [dbManifestIds, setDbManifestIds] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribeConsolidationItems(
      newItems => { setItems(newItems); setLoading(false); },
      err => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, []);

  // Real-time subscription to the `manifests` collection so the
  // MoveManifestDialog always includes newly-processed individual manifests.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'manifests'),
      snap => {
        setDbManifestIds(snap.docs.map(d => d.id));
      },
    );
    return unsub;
  }, []);

  // ── Build CustomerSection[] from flat list ───────────────────────────────
  const customerSections = useMemo((): CustomerSection[] => {
    const bySlCode = new Map<string, ManifestConsolidationItem[]>();
    for (const item of items) {
      const key = item.slCode || '__nocode__';
      if (!bySlCode.has(key)) bySlCode.set(key, []);
      bySlCode.get(key)!.push(item);
    }

    return Array.from(bySlCode.entries())
      .map(([slCode, slItems]) => {
        const first = slItems[0];
        const customer: ConsolidationCustomer = {
          id:       slCode,
          slCode,
          fullName: first.customerName || slCode,
          ruta:     first.ruta,
        };

        // Group by manifestNumber within each customer
        const byManifest = new Map<string, ManifestConsolidationItem[]>();
        for (const item of slItems) {
          const mf = item.manifestNumber || '(sin manifiesto)';
          if (!byManifest.has(mf)) byManifest.set(mf, []);
          byManifest.get(mf)!.push(item);
        }

        const manifestGroups: ManifestGroup[] = Array.from(byManifest.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([mf, mfItems]) => ({
            manifestNumber: mf,
            packages: mfItems.map((i): ConsolidationPackage => ({
              id:              i.tracking,
              trackingNumber:  i.tracking,
              description:     i.description,
              weight:          i.weight,
              status:          i.status || '',
              manifestNumber:  i.manifestNumber,
              slCode:          i.slCode,
              customerName:    i.customerName,
              ruta:            i.ruta,
              origin:          i.origin,
              requiresPermit:  i.permisos,
              createdAt:       i.movedAt,
              price:           i.price,
              currency:        i.currency,
              invoiceNumber:   i.invoiceNumber,
              invoiceStatus:   i.invoiceStatus,
              invoiceId:       i.invoiceId,
            })),
            invoices: [],
          }));

        const totalWeight = slItems.reduce((s, i) => s + (i.weight || 0), 0);
        const totalAmount = slItems.reduce((s, i) => s + (i.price || 0), 0);

        return {
          customer,
          manifestGroups,
          lookupPackages: manifestGroups.flatMap(g => g.packages),
          totalPackages: slItems.length,
          totalWeight,
          totalAmount,
          manifestCount: manifestGroups.length,
        };
      })
      .sort((a, b) => a.customer.fullName.localeCompare(b.customer.fullName));
  }, [items]);

  // Merge manifest numbers from consolidation items + all docs in `manifests`
  // collection so the MoveManifestDialog shows newly processed manifests.
  const allManifestNumbers = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.manifestNumber) set.add(i.manifestNumber); });
    dbManifestIds.forEach(id => set.add(id));
    return Array.from(set).sort();
  }, [items, dbManifestIds]);

  return { customerSections, allManifestNumbers, rawItems: items, loading, error };
}
