import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NovaTerceroRow {
  id: string;
  manifestNumber: string;
  slCode: string;
  customerName: string;
  description: string;
  amount: number;
  savedAt: string;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Builds a deterministic Firestore document ID for a tercero row.
 * Format: {safeManifest}_{SLCODE}
 */
export function buildTerceroId(manifestNumber: string, slCode: string): string {
  const safeManifest = manifestNumber.replace(/[^a-zA-Z0-9]/g, '_');
  return `${safeManifest}_${slCode.toUpperCase()}`;
}

// ── Write operations ───────────────────────────────────────────────────────────

/**
 * Creates an empty Servicio de Terceros row for a customer group.
 * Uses merge:true so re-clicking "Agregar" does NOT reset existing saved values.
 */
export async function createTerceroRow(opts: {
  manifestNumber: string;
  slCode: string;
  customerName: string;
}): Promise<void> {
  const id = buildTerceroId(opts.manifestNumber, opts.slCode);
  const now = new Date().toISOString();
  await setDoc(
    doc(db, 'nova_terceros', id),
    {
      id,
      manifestNumber: opts.manifestNumber,
      slCode: opts.slCode.toUpperCase(),
      customerName: opts.customerName,
      description: '',
      amount: 0,
      savedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

/**
 * Updates description and amount on an existing tercero row.
 * Preserves savedAt, manifestNumber, slCode and all other fields via merge:true.
 */
export async function updateTerceroRow(opts: {
  id: string;
  description: string;
  amount: number;
}): Promise<void> {
  await setDoc(
    doc(db, 'nova_terceros', opts.id),
    {
      description: opts.description,
      amount: opts.amount,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Deletes a Servicio de Terceros row from Firestore.
 */
export async function deleteTerceroRow(id: string): Promise<void> {
  await deleteDoc(doc(db, 'nova_terceros', id));
}

// ── Real-time subscription ─────────────────────────────────────────────────────

/**
 * Subscribes to all Servicio de Terceros rows for a manifest.
 * Returns a Map keyed by UPPERCASE slCode.
 * Returns an unsubscribe function for useEffect cleanup.
 */
export function subscribeManifestTerceros(
  manifestNumber: string,
  callback: (rows: Map<string, NovaTerceroRow>) => void,
): () => void {
  if (!manifestNumber) {
    callback(new Map());
    return () => {};
  }
  const q = query(
    collection(db, 'nova_terceros'),
    where('manifestNumber', '==', manifestNumber),
  );
  return onSnapshot(
    q,
    snap => {
      const map = new Map<string, NovaTerceroRow>();
      snap.forEach(d => {
        const row = d.data() as NovaTerceroRow;
        if (row.slCode) map.set(row.slCode.toUpperCase(), row);
      });
      callback(map);
    },
    () => {},
  );
}
