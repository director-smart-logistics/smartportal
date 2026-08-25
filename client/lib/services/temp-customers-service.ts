/**
 * Temp Customers CRUD Service
 *
 * Manages the `temp_customers` collection in Firestore. Temp customers are
 * created automatically when Nova encounters unmatched names that need a
 * billable record. They use SL-NAN-NNNNN slCode prefixes and act as
 * placeholders until promoted to a real SP1/SP2 customer.
 *
 * ─── Why a dedicated CRUD service ──────────────────────────────────────────
 *
 * The bulk of temp customer writes are *automatic* (via
 * `createOrGetTempCustomer` in manifest-processor). This service exposes
 * the inverse: explicit operator-driven list / update / delete operations
 * for the admin UI at /temp-customers. Keeping these in a dedicated file
 * (instead of bolting them onto manifest-processor) makes the intent
 * obvious — admin CRUD is a separate concern from the auto-creation path.
 *
 * ─── Sentinel handling ──────────────────────────────────────────────────────
 *
 * The collection has a special `--meta--` document holding the SL-NAN
 * counter. ALL list / read / delete operations in this service skip it
 * explicitly. Bulk-deletes never touch it; resetting the counter is a
 * separate manual operation (see `scripts/clean-temp-customers.mjs`).
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { TempCustomerRecord } from '@/lib/services/manifest-processor';

const TEMP_CUSTOMERS_COLLECTION = 'temp_customers';
const META_DOC_ID = '--meta--';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TempCustomerListItem extends TempCustomerRecord {
  /** Firestore document id (typically equals slCode). */
  id: string;
}

export interface TempCustomerUpdatePatch {
  name?: string;
  ruta?: string;
  email?: string;
  phone?: string;
  consolidationEnabled?: boolean;
  deliveryAddress?: string;
  courierService?: string;
}

// ── Read operations ────────────────────────────────────────────────────────────

/**
 * Lists every temp customer (one-shot read). Skips the `--meta--` sentinel.
 * Sorted by createdAt descending (newest first) when available.
 */
export async function listTempCustomers(): Promise<TempCustomerListItem[]> {
  const snap = await getDocs(collection(db, TEMP_CUSTOMERS_COLLECTION));
  const out: TempCustomerListItem[] = [];
  snap.forEach(d => {
    if (d.id === META_DOC_ID) return;
    const data = d.data() as TempCustomerRecord;
    out.push({ ...data, id: d.id });
  });
  // Newest first; fall back to alphabetical when createdAt is missing
  out.sort((a, b) => {
    const ta = a.createdAt ?? '';
    const tb = b.createdAt ?? '';
    if (ta && tb) return tb.localeCompare(ta);
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
  return out;
}

/**
 * Real-time subscription. Useful for the admin page so concurrent
 * Nova-driven creations show up immediately.
 */
export function subscribeTempCustomers(
  callback: (items: TempCustomerListItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, TEMP_CUSTOMERS_COLLECTION),
    snap => {
      const out: TempCustomerListItem[] = [];
      snap.forEach(d => {
        if (d.id === META_DOC_ID) return;
        const data = d.data() as TempCustomerRecord;
        out.push({ ...data, id: d.id });
      });
      out.sort((a, b) => {
        const ta = a.createdAt ?? '';
        const tb = b.createdAt ?? '';
        if (ta && tb) return tb.localeCompare(ta);
        return (a.name ?? '').localeCompare(b.name ?? '');
      });
      callback(out);
    },
    err => {
      console.warn('[TempCustomers] subscription error:', err);
      onError?.(err as Error);
    },
  );
}

/**
 * Fetches a single temp customer by document id (slCode).
 */
export async function getTempCustomer(id: string): Promise<TempCustomerListItem | null> {
  if (id === META_DOC_ID) return null;
  const ref = doc(db, TEMP_CUSTOMERS_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as TempCustomerRecord;
  return { ...data, id: snap.id };
}

// ── Write operations ───────────────────────────────────────────────────────────

/**
 * Updates an existing temp customer record. Uses merge:true so untouched
 * fields are preserved. Refuses to mutate the `--meta--` sentinel.
 *
 * Returns the patched record for the caller to update its UI without
 * waiting for the snapshot tick.
 */
export async function updateTempCustomer(
  id: string,
  patch: TempCustomerUpdatePatch,
): Promise<TempCustomerListItem | null> {
  if (id === META_DOC_ID) {
    throw new Error('Cannot mutate the temp_customers --meta-- sentinel');
  }
  const ref = doc(db, TEMP_CUSTOMERS_COLLECTION, id);
  const existing = await getDoc(ref);
  if (!existing.exists()) return null;

  const current = existing.data() as TempCustomerRecord;
  const cleanPatch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  // Only include fields that actually changed and are non-empty.
  if (patch.name !== undefined && patch.name.trim() !== current.name) {
    cleanPatch.name = patch.name.trim();
    cleanPatch.nameFolded = patch.name.trim().toUpperCase();
  }
  if (patch.ruta !== undefined && patch.ruta !== current.ruta) {
    cleanPatch.ruta = patch.ruta;
  }
  if (patch.email !== undefined && patch.email !== current.email) {
    cleanPatch.email = patch.email;
  }
  if (patch.phone !== undefined && patch.phone !== current.phone) {
    cleanPatch.phone = patch.phone;
  }
  if (
    patch.consolidationEnabled !== undefined &&
    patch.consolidationEnabled !== current.consolidationEnabled
  ) {
    cleanPatch.consolidationEnabled = patch.consolidationEnabled;
  }
  if (
    patch.deliveryAddress !== undefined &&
    patch.deliveryAddress !== current.deliveryAddress
  ) {
    cleanPatch.deliveryAddress = patch.deliveryAddress;
  }
  if (
    patch.courierService !== undefined &&
    patch.courierService !== current.courierService
  ) {
    cleanPatch.courierService = patch.courierService;
  }

  await setDoc(ref, cleanPatch, { merge: true });
  return { ...current, ...cleanPatch, id } as TempCustomerListItem;
}

/**
 * Deletes a single temp customer. Refuses to delete the `--meta--`
 * sentinel — that requires the dedicated cleanup script.
 */
export async function deleteTempCustomer(id: string): Promise<void> {
  if (id === META_DOC_ID) {
    throw new Error('Cannot delete the temp_customers --meta-- sentinel');
  }
  await deleteDoc(doc(db, TEMP_CUSTOMERS_COLLECTION, id));
}

/**
 * Bulk delete. Skips the meta sentinel automatically. The caller is
 * responsible for confirming the action with the operator first.
 */
export async function deleteTempCustomers(ids: ReadonlyArray<string>): Promise<{
  deleted: number;
  skipped: number;
}> {
  let deleted = 0;
  let skipped = 0;
  await Promise.all(
    ids.map(async id => {
      if (id === META_DOC_ID) {
        skipped++;
        return;
      }
      try {
        await deleteDoc(doc(db, TEMP_CUSTOMERS_COLLECTION, id));
        deleted++;
      } catch (err) {
        console.warn('[TempCustomers] delete failed for', id, err);
        skipped++;
      }
    }),
  );
  return { deleted, skipped };
}

/**
 * Audit dependencies. Checks if the given slCodes have associated packages or invoices.
 * Helpful for identifying "orphan" temp customers that can be safely deleted.
 */
export async function checkTempCustomerDependencies(slCodes: string[]): Promise<Record<string, { hasPackages: boolean; hasInvoices: boolean }>> {
  const result: Record<string, { hasPackages: boolean; hasInvoices: boolean }> = {};
  
  for (const code of slCodes) {
    result[code] = { hasPackages: false, hasInvoices: false };
  }

  if (slCodes.length === 0) return result;

  // Chunk by 30 to respect Firestore 'in' limit
  for (let i = 0; i < slCodes.length; i += 30) {
    const chunk = slCodes.slice(i, i + 30);
    
    // Check packages
    const pkgSnap = await getDocs(query(collection(db, 'packages'), where('slCode', 'in', chunk)));
    pkgSnap.forEach(d => {
      const data = d.data();
      if (data.slCode && result[data.slCode]) {
        result[data.slCode].hasPackages = true;
      }
    });

    // Check invoices
    const invSnap = await getDocs(query(collection(db, 'invoices'), where('customer.slCode', 'in', chunk)));
    invSnap.forEach(d => {
      const data = d.data();
      if (data.customer?.slCode && result[data.customer.slCode]) {
        result[data.customer.slCode].hasInvoices = true;
      }
    });
  }

  return result;
}

