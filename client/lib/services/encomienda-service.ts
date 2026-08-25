/**
 * Encomienda Service — SP1
 *
 * CRUD + real-time Firestore listeners for the `encomiendas` collection.
 * Bidirectional sync with SP2's `encomiendas` collection via the secondary
 * `dbSP2` Firestore instance already configured in firebase/config.ts.
 *
 * Sync strategy
 * ─────────────
 * - SP1 is the authoritative write source (admin panel lives here).
 * - SP2 is kept in sync via `syncToSP2` after every mutating operation.
 * - SP2→SP1 backfill: `importFromSP2` fetches SP2's snapshot and upserts
 *   into SP1 (used once on first load if SP1 collection is empty).
 * - Real-time: `subscribeEncomiendas` listens to SP1; SP2 writes are
 *   fire-and-forget (cross-project write, no auth guard issues since the
 *   secondary app uses the SP2 API key from the env).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
} from "firebase/firestore";
import { db, dbSP2 } from "@/lib/firebase/config";
import { COLLECTIONS } from "@/lib/firebase/firestore-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Encomienda {
  id: string;
  name: string;
  description: string;
  phone: string;
  email?: string;
  zones: string[];
  pickupAddress: string;
  schedule: string;
  estimatedDays: string;
  cost: number | null;
  costDisplay: string;
  active: boolean;
  website?: string;
  facebookUrl?: string;
  reviewStatus: "seeded" | "pending" | "approved" | "rejected";
  isUserSubmitted: boolean;
  submittedBy?: string;
  submittedByEmail?: string;
  detectedCanton?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EncomiendaFormData {
  name: string;
  description: string;
  phone: string;
  email: string;
  zonesRaw: string;
  pickupAddress: string;
  schedule: string;
  estimatedDays: string;
  cost: string;
  costDisplay: string;
  active: boolean;
  website: string;
  facebookUrl: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toEncomienda = (id: string, data: DocumentData): Encomienda => ({
  id,
  name: data.name ?? "",
  description: data.description ?? "",
  phone: data.phone ?? "",
  email: data.email,
  zones: Array.isArray(data.zones) ? data.zones : [],
  pickupAddress: data.pickupAddress ?? "",
  schedule: data.schedule ?? "",
  estimatedDays: data.estimatedDays ?? "",
  cost: data.cost ?? null,
  costDisplay: data.costDisplay ?? "",
  active: data.active ?? true,
  website: data.website,
  facebookUrl: data.facebookUrl,
  reviewStatus: data.reviewStatus ?? "seeded",
  isUserSubmitted: data.isUserSubmitted ?? false,
  submittedBy: data.submittedBy,
  submittedByEmail: data.submittedByEmail,
  detectedCanton: data.detectedCanton,
  createdAt:
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate().toISOString()
      : data.createdAt ?? new Date().toISOString(),
  updatedAt:
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate().toISOString()
      : data.updatedAt ?? new Date().toISOString(),
});

const formToPayload = (form: EncomiendaFormData) => ({
  name: form.name.trim(),
  description: form.description.trim(),
  phone: form.phone.trim(),
  ...(form.email.trim() ? { email: form.email.trim() } : {}),
  zones: form.zonesRaw
    .split(",")
    .map((z) => z.trim())
    .filter(Boolean),
  pickupAddress: form.pickupAddress.trim(),
  schedule: form.schedule.trim(),
  estimatedDays: form.estimatedDays.trim(),
  cost: form.cost ? parseFloat(form.cost) : null,
  costDisplay: form.costDisplay.trim(),
  active: form.active,
  ...(form.website.trim() ? { website: form.website.trim() } : {}),
  ...(form.facebookUrl.trim() ? { facebookUrl: form.facebookUrl.trim() } : {}),
});

// ─── SP2 bidirectional sync ───────────────────────────────────────────────────
// SP1→SP2: every admin write calls slEncomiendaSync Cloud Function (Admin SDK).
// SP2→SP1: subscribeSP2Changes() listens to SP2 collection in real-time.
// Loop prevention: SP1-originated writes are tracked in recentSP1Writes Map;
// the SP2 listener skips any change whose ID is in that map.

const SP2_COL = "encomiendas"; // SP2 collection name

const SP2_SYNC_URL =
  import.meta.env.VITE_SP2_SYNC_URL ??
  'https://us-central1-smart-portal-2.cloudfunctions.net/slEncomiendaSync';

const SP2_SYNC_SECRET = import.meta.env.VITE_SP2_SYNC_SECRET ?? '';

// TTL map: tracks IDs recently written by SP1 to avoid echo-back loops
const recentSP1Writes = new Map<string, number>(); // id → expiry timestamp
const SP1_WRITE_TTL = 20_000; // 20 s — enough for Cloud Function round-trip

function markSP1Write(id: string): void {
  recentSP1Writes.set(id, Date.now() + SP1_WRITE_TTL);
  setTimeout(() => recentSP1Writes.delete(id), SP1_WRITE_TTL + 200);
}

function isRecentSP1Write(id: string): boolean {
  const expiry = recentSP1Writes.get(id);
  return expiry !== undefined && Date.now() < expiry;
}

async function callSP2Sync(body: Record<string, unknown>): Promise<void> {
  if (!SP2_SYNC_SECRET) return;
  try {
    await fetch(SP2_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sync-secret': SP2_SYNC_SECRET,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort — never block SP1 operations
  }
}

async function syncToSP2(
  id: string,
  payload: Record<string, unknown>
): Promise<void> {
  markSP1Write(id); // mark BEFORE sending to avoid echo-back
  await callSP2Sync({ action: 'upsert', id, data: payload });
}

async function deleteFromSP2(id: string): Promise<void> {
  markSP1Write(id);
  await callSP2Sync({ action: 'delete', id });
}

// ─── Real-time SP2 → SP1 listener ────────────────────────────────────────────
// Subscribes to SP2's public encomiendas collection. Any change NOT originated
// by SP1 is immediately applied to SP1's Firestore (direct write, no re-sync).
// Skips the initial snapshot to avoid overwriting SP1 on mount.

export function subscribeSP2Changes(
  onSynced?: (count: number) => void
): Unsubscribe {
  const sp1Ref = collection(db, COLLECTIONS.ENCOMIENDAS);
  const sp2Ref = collection(dbSP2, SP2_COL);
  let initialized = false;

  return onSnapshot(sp2Ref, { includeMetadataChanges: false }, (snap) => {
    if (!initialized) {
      initialized = true;
      return; // skip initial full-load snapshot
    }

    const changes = snap.docChanges();
    if (changes.length === 0) return;

    const batch = writeBatch(db);
    let count = 0;

    for (const change of changes) {
      const id = change.doc.id;
      if (isRecentSP1Write(id)) continue; // SP1 originated — skip to avoid loop

      if (change.type === 'added' || change.type === 'modified') {
        batch.set(doc(sp1Ref, id), change.doc.data(), { merge: true });
        count++;
      } else if (change.type === 'removed') {
        batch.delete(doc(sp1Ref, id));
        count++;
      }
    }

    if (count > 0) {
      batch.commit().catch(console.error);
      onSynced?.(count);
    }
  });
}

// ─── SP2 → SP1 sync ──────────────────────────────────────────────────────────
// Manual admin action: always applies SP2 data to SP1.
// - New SP2 docs → added to SP1.
// - Existing docs → merged (SP2 wins). SP2's original updatedAt is preserved
//   so that future automated comparisons remain accurate.
// No timestamp gate: the button is intentional, always sync.

export async function importFromSP2(): Promise<{
  imported: number;
  updated: number;
  skipped: number;
}> {
  const sp1Ref = collection(db, COLLECTIONS.ENCOMIENDAS);
  const [sp2Snap, sp1Snap] = await Promise.all([
    getDocs(collection(dbSP2, SP2_COL)),
    getDocs(sp1Ref),
  ]);

  const sp1Ids = new Set(sp1Snap.docs.map((d) => d.id));

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let count = 0;
  let imported = 0;
  let updated = 0;

  const flush = async () => {
    if (count > 0) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  };

  for (const d of sp2Snap.docs) {
    const sp2Data = d.data();
    const isNew = !sp1Ids.has(d.id);

    batch.set(doc(sp1Ref, d.id), sp2Data, { merge: true });
    isNew ? imported++ : updated++;
    count++;

    if (count >= BATCH_SIZE) await flush();
  }

  await flush();
  return { imported, updated, skipped: 0 };
}

// ─── Real-time subscription ───────────────────────────────────────────────────

export function subscribeEncomiendas(
  onData: (items: Encomienda[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTIONS.ENCOMIENDAS),
    orderBy("name", "asc")
  );

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => toEncomienda(d.id, d.data()));
      onData(items);
    },
    (err) => onError?.(err as Error)
  );
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createEncomienda(
  form: EncomiendaFormData
): Promise<Encomienda> {
  const id = form.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const payload = {
    ...formToPayload(form),
    reviewStatus: "approved" as const,
    isUserSubmitted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ref = doc(db, COLLECTIONS.ENCOMIENDAS, id);
  const existing = await getDoc(ref);
  const finalId = existing.exists() ? `${id}_${Date.now()}` : id;
  const finalRef = existing.exists()
    ? doc(db, COLLECTIONS.ENCOMIENDAS, finalId)
    : ref;

  await setDoc(finalRef, { ...payload, id: finalId });
  await syncToSP2(finalId, { ...payload, id: finalId });

  const snap = await getDoc(finalRef);
  return toEncomienda(finalId, snap.data()!);
}

export async function updateEncomienda(
  id: string,
  form: EncomiendaFormData
): Promise<Encomienda> {
  const payload = {
    ...formToPayload(form),
    updatedAt: new Date().toISOString(),
  };

  const ref = doc(db, COLLECTIONS.ENCOMIENDAS, id);
  await updateDoc(ref, payload);
  await syncToSP2(id, payload);

  const snap = await getDoc(ref);
  return toEncomienda(id, snap.data()!);
}

export async function patchEncomienda(
  id: string,
  patch: Partial<Pick<Encomienda, "active" | "reviewStatus">>
): Promise<void> {
  const payload = { ...patch, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, COLLECTIONS.ENCOMIENDAS, id), payload);
  await syncToSP2(id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function deleteEncomienda(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.ENCOMIENDAS, id));
  await deleteFromSP2(id);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getAllEncomiendas(): Promise<Encomienda[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.ENCOMIENDAS),
      orderBy("name", "asc")
    )
  );
  return snap.docs.map((d) => toEncomienda(d.id, d.data()));
}

export async function getActiveEncomiendas(): Promise<Encomienda[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.ENCOMIENDAS),
      where("active", "==", true),
      orderBy("name", "asc")
    )
  );
  return snap.docs.map((d) => toEncomienda(d.id, d.data()));
}

export const EMPTY_FORM: EncomiendaFormData = {
  name: "",
  description: "",
  phone: "",
  email: "",
  zonesRaw: "",
  pickupAddress: "",
  schedule: "",
  estimatedDays: "",
  cost: "",
  costDisplay: "",
  active: true,
  website: "",
  facebookUrl: "",
};

export const encomiendaToForm = (e: Encomienda): EncomiendaFormData => ({
  name: e.name,
  description: e.description,
  phone: e.phone,
  email: e.email ?? "",
  zonesRaw: (e.zones ?? []).join(", "),
  pickupAddress: e.pickupAddress,
  schedule: e.schedule,
  estimatedDays: e.estimatedDays,
  cost: e.cost != null ? String(e.cost) : "",
  costDisplay: e.costDisplay,
  active: e.active,
  website: e.website ?? "",
  facebookUrl: e.facebookUrl ?? "",
});
