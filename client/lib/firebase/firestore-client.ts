import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  DocumentData,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  getCountFromServer,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";
import { sanitizeDocument } from "../services/converters";

// Collection names matching backend
export const COLLECTIONS = {
  USERS: "users",
  CUSTOMERS: "customers",
  PACKAGES: "packages",
  DELIVERIES: "deliveries",
  ROUTES: "routes",
  INVOICES: "invoices",
  SETTINGS: "settings",
  PERMISSIONS: "permissions",
  AUDIT_LOGS: "auditLogs",
  SCANNER_HISTORY: "scannerHistory",
  QUOTES: "quotes",
  MANIFESTS: "manifests",
  DEPARTMENTS: "departments",
  EMPLOYEES: "employees",
  PRICING: "pricing",
  CONSOLIDATION_RULES: "consolidationRules",
  PAYROLL: "payroll",
  PAYROLL_SETTINGS: "payrollSettings",
  TIME_ENTRIES: "timeEntries",
  AI_MANIFEST_INTERACTIONS: "ai_manifest_interactions",
  AUDIT: "audit_logs",
  ENCOMIENDAS: "encomiendas",
  MANIFEST_ENCOMIENDAS: "manifest_encomiendas",
} as const;

// Helper to convert Firestore timestamps to ISO strings
const convertTimestamps = (data: DocumentData): DocumentData => {
  const result: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate().toISOString();
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = convertTimestamps(value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

// Generic list function with pagination
export async function listDocuments<T>(
  collectionName: string,
  options?: {
    page?: number;
    pageSize?: number;
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    filters?: Array<{ field: string; op: "==" | "!=" | "<" | "<=" | ">" | ">="; value: unknown }>;
    search?: string;
    searchField?: string;
  }
): Promise<{ data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
  const pageSize = options?.pageSize || 20;
  const page = options?.page || 1;
  
  const constraints: QueryConstraint[] = [];
  
  // Add filters
  if (options?.filters) {
    for (const filter of options.filters) {
      constraints.push(where(filter.field, filter.op, filter.value));
    }
  }
  
  // Add ordering (limit is NOT added here — applied below with optional cursor)
  if (options?.orderByField) {
    constraints.push(orderBy(options.orderByField, options.orderDirection || "desc"));
  } else {
    constraints.push(orderBy("createdAt", "desc"));
  }
  
  const collectionRef = collection(db, collectionName);

  // Build count query with only filter constraints (no orderBy / no limit)
  // getCountFromServer does not need ordering and adding it can trigger unnecessary index requirements
  const countConstraints: QueryConstraint[] = [];
  if (options?.filters) {
    for (const filter of options.filters) {
      countConstraints.push(where(filter.field, filter.op, filter.value));
    }
  }
  const countQ = countConstraints.length
    ? query(collectionRef, ...countConstraints)
    : collectionRef;
  const countSnapshot = await getCountFromServer(countQ);
  const total = countSnapshot.data().count;

  // For page > 1, simulate offset by fetching the cursor document (last doc of previous pages)
  let cursorDoc: QueryDocumentSnapshot<DocumentData> | undefined;
  if (page > 1) {
    const skipCount = (page - 1) * pageSize;
    const skipSnap = await getDocs(query(collectionRef, ...constraints, limit(skipCount)));
    if (!skipSnap.empty) cursorDoc = skipSnap.docs[skipSnap.docs.length - 1];
  }

  // Final query: filters + ordering + optional cursor + page limit
  const finalConstraints = [...constraints];
  if (cursorDoc) finalConstraints.push(startAfter(cursorDoc));
  finalConstraints.push(limit(pageSize));

  // Get documents
  const snapshot = await getDocs(query(collectionRef, ...finalConstraints));
  const data = snapshot.docs.map((doc) => {
    const rawData = { id: doc.id, ...convertTimestamps(doc.data()) };
    return sanitizeDocument(collectionName, rawData);
  }) as T[];
  
  return {
    data,
    pagination: {
      total,
      page,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor-based pagination — no offset reads, scales to 10k+ docs
// Uses Firestore DocumentSnapshot as cursor (startAfter) instead of skip.
// ─────────────────────────────────────────────────────────────────────────────
export interface CursorPage<T> {
  data: T[];
  /** Pass as `cursor` to fetch the next page. null if this is the last page. */
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function listDocumentsCursor<T>(
  collectionName: string,
  options?: {
    pageSize?: number;
    orderByField?: string;
    orderDirection?: "asc" | "desc";
    filters?: Array<{ field: string; op: "==" | "!=" | "<" | "<=" | ">" | ">="; value: unknown }>;
    cursor?: QueryDocumentSnapshot<DocumentData> | null;
  }
): Promise<CursorPage<T>> {
  const pageSize = options?.pageSize ?? 1000;
  const constraints: QueryConstraint[] = [];

  if (options?.filters) {
    for (const f of options.filters) {
      constraints.push(where(f.field, f.op, f.value));
    }
  }

  constraints.push(
    orderBy(options?.orderByField ?? "createdAt", options?.orderDirection ?? "desc")
  );

  if (options?.cursor) {
    constraints.push(startAfter(options.cursor));
  }

  constraints.push(limit(pageSize + 1)); // fetch one extra to detect hasMore

  const collectionRef = collection(db, collectionName);
  const snapshot = await getDocs(query(collectionRef, ...constraints));

  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  return {
    data: docs.map((d) => {
      const rawData = { id: d.id, ...convertTimestamps(d.data()) };
      return sanitizeDocument(collectionName, rawData);
    }) as T[],
    nextCursor: hasMore ? (docs[docs.length - 1] as QueryDocumentSnapshot<DocumentData>) : null,
    hasMore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Search token helpers
// Generates prefix tokens for a string to enable startsWith-style search in
// Firestore array-contains queries. Stored in a `searchTokens` field.
// Example: "Juan Pérez" → ["j","ju","jua","juan","p","pé","pér","pére","pérez",...]
// ─────────────────────────────────────────────────────────────────────────────
export function generateSearchTokens(input: string): string[] {
  const normalized = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .trim();

  const tokens = new Set<string>();
  const words = normalized.split(/\s+/).filter(Boolean);

  for (const word of words) {
    for (let i = 1; i <= word.length; i++) {
      tokens.add(word.slice(0, i));
    }
  }

  return Array.from(tokens);
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer search — fans out parallel queries, deduplicates by id.
// Requires Firestore composite indexes (see firestore.indexes.json):
//   customers: searchTokens (array-contains) + createdAt (desc)
//   customers: slCode (==) + createdAt (desc)
//   customers: email (==) + createdAt (desc)
//   customers: dni (==) + createdAt (desc)
// ─────────────────────────────────────────────────────────────────────────────
export interface CustomerSearchResult {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  slCode?: string;
  dni?: string;
  city?: string;
  country?: string;
  status: string;
  createdAt: string;
  memberSince?: string;
  [key: string]: unknown;
}

export async function searchCustomers(
  rawQuery: string,
  maxResults = 50
): Promise<CustomerSearchResult[]> {
  const safeQuery = rawQuery || "";
  const q = safeQuery
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!q) return [];

  const colRef = collection(db, COLLECTIONS.CUSTOMERS);
  const seen = new Set<string>();
  const results: CustomerSearchResult[] = [];

  const addDocs = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }) => {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      results.push({ id: d.id, ...convertTimestamps(d.data()) } as CustomerSearchResult);
    }
  };

  // For multi-word queries, pick the most specific individual token for array-contains.
  // The full phrase "sanchez campos" is never stored as a single searchToken — only individual words are.
  const qTokens = q.split(/\s+/).filter(t => t.length >= 2);
  const bestToken = qTokens.length > 0
    ? qTokens.sort((a, b) => b.length - a.length)[0]
    : q;

  // Fan-out: run all matching strategies in parallel
  const promises: Promise<void>[] = [
    // Prefix token match on fullName/slCode tokens (array-contains)
    // No orderBy here — orderBy(createdAt) would restrict to most-recent N docs only,
    // hiding older customers. Fetch a larger pool and sort client-side by relevance.
    getDocs(
      query(colRef, where("searchTokens", "array-contains", bestToken), limit(Math.max(maxResults * 3, 150)))
    ).then(addDocs),

    // slCode range match (prefix)
    getDocs(
      query(colRef, where("slCode", ">=", rawQuery.toUpperCase()), where("slCode", "<", rawQuery.toUpperCase() + "\uf8ff"), limit(20))
    ).then(addDocs),

    // email range match (prefix)
    getDocs(
      query(colRef, where("email", ">=", q), where("email", "<", q + "\uf8ff"), limit(20))
    ).then(addDocs),

    // DNI range match (prefix)
    getDocs(
      query(colRef, where("dni", ">=", q), where("dni", "<", q + "\uf8ff"), limit(20))
    ).then(addDocs),

    // Phone range match (prefix) — digits-only variant for robustness
    getDocs(
      query(colRef, where("phone", ">=", q), where("phone", "<", q + "\uf8ff"), limit(10))
    ).then(addDocs),
  ];

  await Promise.allSettled(promises); // allSettled: one index missing won't break others

  // Client-side relevance sort: exact-word match > prefix match > rest, then by fullName alpha
  const qLower = q.toLowerCase();
  results.sort((a, b) => {
    const aName = (a.fullName ?? "").toLowerCase();
    const bName = (b.fullName ?? "").toLowerCase();
    const aExact = aName.split(/\s+/).some(w => w === qLower) ? 0 : 1;
    const bExact = bName.split(/\s+/).some(w => w === qLower) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aStarts = aName.startsWith(qLower) ? 0 : 1;
    const bStarts = bName.startsWith(qLower) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return aName.localeCompare(bName);
  });

  return results.slice(0, maxResults);
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillSearchTokens — one-time migration: writes searchTokens to all
// existing customer docs that don't already have it.
// Call from an admin panel action, never on startup.
// ─────────────────────────────────────────────────────────────────────────────
export async function backfillSearchTokens(
  onProgress?: (done: number, total: number) => void
): Promise<{ updated: number; skipped: number }> {
  const colRef = collection(db, COLLECTIONS.CUSTOMERS);
  const snapshot = await getDocs(query(colRef, orderBy("createdAt", "desc")));
  const total = snapshot.docs.length;
  let updated = 0;
  let skipped = 0;

  const BATCH_SIZE = 400; // Firestore batch limit is 500
  let batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 0; i < snapshot.docs.length; i++) {
    const d = snapshot.docs[i];
    const data = d.data();

    // Skip if already has tokens and they're populated
    if (Array.isArray(data.searchTokens) && data.searchTokens.length > 0) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    const tokens = [
      ...generateSearchTokens(data.fullName || ""),
      ...generateSearchTokens(data.slCode || ""),
      ...generateSearchTokens(data.email || ""),
      ...generateSearchTokens(data.dni || ""),
      ...generateSearchTokens((data.phone || "").replace(/\D/g, "")),
    ];

    batch.update(d.ref, { searchTokens: [...new Set(tokens)] });
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }

    onProgress?.(i + 1, total);
  }

  if (batchCount > 0) await batch.commit();

  return { updated, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice search — smart router, zero full-collection scans.
// Query type detection:
//   slCode   (SL\d+)  → exact clientSlCode ==
//   numeric  (\d+)    → invoiceNumber range + clientSlCode range
//   text             → searchTokens array-contains + clientSlCode range
//
// Requires Firestore composite indexes (see firestore.indexes.json):
//   invoices: searchTokens (array-contains) + createdAt (desc)
//   invoices: invoiceNumber (asc)            + createdAt (desc)
//   invoices: clientSlCode (asc)             + status (asc) + createdAt (desc)
// ─────────────────────────────────────────────────────────────────────────────
export function generateInvoiceSearchTokens(
  clientName: string,
  clientSlCode?: string,
  invoiceNumber?: string
): string[] {
  const tokens = new Set<string>([
    ...generateSearchTokens(clientName),
    ...(clientSlCode ? generateSearchTokens(clientSlCode) : []),
    ...(invoiceNumber ? generateSearchTokens(invoiceNumber) : []),
  ]);
  return [...tokens];
}

export interface InvoiceSearchResult {
  id: string;
  invoiceNumber?: string;
  clientSlCode?: string;
  customerId?: string;
  status: string;
  invoiceDate?: string;
  createdAt: string;
  [key: string]: unknown;
}

export async function searchInvoices(
  rawQuery: string,
  maxResults = 50
): Promise<InvoiceSearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const qUpper = q.toUpperCase();
  const qCapitalized = q.charAt(0).toUpperCase() + q.slice(1);
  const qNorm = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const colRef = collection(db, COLLECTIONS.INVOICES);
  const seen = new Set<string>();
  const results: InvoiceSearchResult[] = [];

  const addSnap = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }) => {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const rawData = { id: d.id, ...convertTimestamps(d.data()) };
      results.push(sanitizeDocument(COLLECTIONS.INVOICES, rawData) as InvoiceSearchResult);
    }
  };

  const isSlCode = /^SL\d+$/i.test(q);
  const isNumeric = /^\d+$/.test(q);

  const promises: Promise<void>[] = [];

  if (isSlCode) {
    promises.push(
      getDocs(
        query(colRef, where("clientSlCode", "==", qUpper), orderBy("invoiceDate", "desc"), limit(maxResults))
      ).then(addSnap)
    );
  } else if (isNumeric) {
    promises.push(
      getDocs(
        query(colRef, where("invoiceNumber", ">=", q), where("invoiceNumber", "<", q + "\uf8ff"), orderBy("invoiceNumber", "asc"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("clientSlCode", ">=", qUpper), where("clientSlCode", "<", qUpper + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
  } else {
    promises.push(
      getDocs(
        query(colRef, where("searchTokens", "array-contains", qNorm), orderBy("createdAt", "desc"), limit(maxResults))
      ).then(addSnap)
    );
    // invoiceNumber prefix range fallback
    promises.push(
      getDocs(
        query(colRef, where("invoiceNumber", ">=", qUpper), where("invoiceNumber", "<", qUpper + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("invoiceNumber", ">=", q), where("invoiceNumber", "<", q + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("clientSlCode", ">=", qUpper), where("clientSlCode", "<", qUpper + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    // clientName prefix range fallback
    promises.push(
      getDocs(
        query(colRef, where("clientName", ">=", qUpper), where("clientName", "<", qUpper + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("clientName", ">=", qCapitalized), where("clientName", "<", qCapitalized + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("clientName", ">=", q), where("clientName", "<", q + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    // customerName prefix range fallback
    promises.push(
      getDocs(
        query(colRef, where("customerName", ">=", qUpper), where("customerName", "<", qUpper + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("customerName", ">=", qCapitalized), where("customerName", "<", qCapitalized + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where("customerName", ">=", q), where("customerName", "<", q + "\uf8ff"), limit(20))
      ).then(addSnap)
    );
  }

  await Promise.allSettled(promises);
  return results.slice(0, maxResults);
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillInvoiceSearchTokens — one-time migration:
// Writes searchTokens to all existing invoice docs that are missing it.
// Call from admin panel, never on startup.
// ─────────────────────────────────────────────────────────────────────────────
export async function backfillInvoiceSearchTokens(
  onProgress?: (done: number, total: number) => void
): Promise<{ updated: number; skipped: number }> {
  const colRef = collection(db, COLLECTIONS.INVOICES);
  const snapshot = await getDocs(query(colRef, orderBy("createdAt", "desc")));
  const total = snapshot.docs.length;
  let updated = 0;
  let skipped = 0;

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 0; i < snapshot.docs.length; i++) {
    const d = snapshot.docs[i];
    const data = d.data();

    if (Array.isArray(data.searchTokens) && data.searchTokens.length > 0) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    const tokens = generateInvoiceSearchTokens(
      data.clientName || data.customerName || "",
      data.clientSlCode || "",
      data.invoiceNumber || ""
    );

    batch.update(d.ref, { searchTokens: [...new Set(tokens)] });
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }

    onProgress?.(i + 1, total);
  }

  if (batchCount > 0) await batch.commit();
  return { updated, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest search — smart router, zero full-collection scans.
// Query type detection:
//   numeric  → manifestNumber range
//   text     → searchTokens array-contains + manifestNumber range
//
// Requires Firestore composite indexes (see firestore.indexes.json):
//   manifests: searchTokens  (array-contains) + createdAt (desc)
//   manifests: manifestNumber (asc)            + createdAt (desc)
// ─────────────────────────────────────────────────────────────────────────────
export function generateManifestSearchTokens(
  manifestNumber: string,
  fileName?: string
): string[] {
  const tokens = new Set<string>([
    ...generateSearchTokens(manifestNumber),
    ...(fileName ? generateSearchTokens(fileName.replace(/\.[^.]+$/, "")) : []),
  ]);
  return [...tokens];
}

export interface ManifestSearchResult {
  id: string;
  manifestNumber?: string;
  status: string;
  carrier?: string;
  createdAt: string;
  [key: string]: unknown;
}

export async function searchManifests(
  rawQuery: string,
  maxResults = 50
): Promise<ManifestSearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const qUpper = q.toUpperCase();
  const qNorm = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const colRef = collection(db, COLLECTIONS.MANIFESTS);
  const seen = new Set<string>();
  const results: ManifestSearchResult[] = [];

  const addSnap = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }) => {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      results.push({ id: d.id, ...convertTimestamps(d.data()) } as ManifestSearchResult);
    }
  };

  const promises: Promise<void>[] = [
    getDocs(
      query(colRef, where("manifestNumber", ">=", qUpper), where("manifestNumber", "<", qUpper + "\uf8ff"), orderBy("manifestNumber", "asc"), limit(20))
    ).then(addSnap),
    getDocs(
      query(colRef, where("searchTokens", "array-contains", qNorm), orderBy("createdAt", "desc"), limit(maxResults))
    ).then(addSnap),
  ];

  await Promise.allSettled(promises);
  return results.slice(0, maxResults);
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillManifestSearchTokens — one-time migration.
// Call from admin panel, never on startup.
// ─────────────────────────────────────────────────────────────────────────────
export async function backfillManifestSearchTokens(
  onProgress?: (done: number, total: number) => void
): Promise<{ updated: number; skipped: number }> {
  const colRef = collection(db, COLLECTIONS.MANIFESTS);
  const snapshot = await getDocs(query(colRef, orderBy("createdAt", "desc")));
  const total = snapshot.docs.length;
  let updated = 0;
  let skipped = 0;

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 0; i < snapshot.docs.length; i++) {
    const d = snapshot.docs[i];
    const data = d.data();

    if (Array.isArray(data.searchTokens) && data.searchTokens.length > 0) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    const tokens = generateManifestSearchTokens(
      data.manifestNumber || "",
      data.fileName || data.originalFileName || ""
    );

    batch.update(d.ref, { searchTokens: [...new Set(tokens)] });
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }

    onProgress?.(i + 1, total);
  }

  if (batchCount > 0) await batch.commit();
  return { updated, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Package search index helpers
// trackingSuffixes: suffix slices of trackingNumber for partial/barcode search.
// searchTokens:     prefix tokens of customerName + slCode for name search.
// ─────────────────────────────────────────────────────────────────────────────
export function generateTrackingSuffixes(trackingNumber: string): string[] {
  const upper = trackingNumber.trim().toUpperCase();
  const set = new Set<string>([upper]);

  // Suffix slices — every length from 4 to (trackingLength-1) so any partial
  // tail the user types is covered by array-contains lookup.
  for (let len = 4; len < upper.length; len++) {
    set.add(upper.slice(-len));
  }

  // Digit-only variant (strips carrier prefix letters e.g. TBA, 1Z…)
  const nums = upper.replace(/\D/g, '');
  if (nums.length >= 6) set.add(nums);

  // 420-prefix USPS postal barcodes: extract USPS payload starting with 9
  if (upper.startsWith('420') && upper.length >= 30) {
    for (const off of [8, 9, 10, 11, 12, 13, 14, 15]) {
      const s = upper.substring(off);
      if (/^9\d/.test(s)) set.add(s);
    }
  }

  return [...set].filter((s) => s.length >= 6);
}

export function generatePackageSearchTokens(
  customerName: string,
  slCode?: string
): string[] {
  const tokens = new Set<string>([
    ...generateSearchTokens(customerName),
    ...(slCode ? generateSearchTokens(slCode) : []),
  ]);
  return [...tokens];
}

export interface PackageSearchResult {
  id: string;
  trackingNumber: string;
  customerName: string;
  slCode?: string;
  status: string;
  type?: string;
  weight?: number;
  origin?: string;
  destination?: string;
  flagStatus?: string;
  createdAt?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// checkExistingTrackings — batch existence check for a list of tracking numbers.
// Strategy 1: Direct doc-ID getDoc (fast — Nova stores tracking as doc ID).
// Strategy 2: Chunked `trackingNumber in [...]` for any packages with a
//             different doc ID.
// Returns the Set of tracking strings (uppercased) that already exist.
// ─────────────────────────────────────────────────────────────────────────────
export async function checkExistingTrackings(trackings: string[]): Promise<Set<string>> {
  if (!trackings.length) return new Set();
  const upper = [...new Set(trackings.map(t => t.toUpperCase()))];
  const colRef = collection(db, COLLECTIONS.PACKAGES);
  const existing = new Set<string>();

  // Strategy 1: parallel doc-ID lookups (O(1) per tracking, most common path)
  const validDocKeys = upper.filter(t => !t.includes('/'));
  const docChecks = await Promise.allSettled(validDocKeys.map(t => getDoc(doc(colRef, t))));
  docChecks.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.exists()) existing.add(validDocKeys[i]);
  });

  // Strategy 2: trackingNumber field query for remaining items
  const remaining = upper.filter(t => !existing.has(t));
  if (remaining.length > 0) {
    const CHUNK = 30;
    for (let i = 0; i < remaining.length; i += CHUNK) {
      const chunk = remaining.slice(i, i + CHUNK);
      try {
        const snap = await getDocs(query(colRef, where('trackingNumber', 'in', chunk)));
        snap.docs.forEach(d => {
          const tn = ((d.data().trackingNumber as string) ?? '').toUpperCase();
          if (tn) existing.add(tn);
        });
      } catch { /* non-fatal — missing index or quota */ }
    }
  }

  return existing;
}

// ─────────────────────────────────────────────────────────────────────────────
// searchPackages — smart router, zero full-collection scans.
// Query type detection:
//   slCode   (SL\d+)   → exact slCode ==
//   tracking (alnum)   → doc ID + trackingSuffixes array-contains + trackingNumber range
//   name     (text)    → searchTokens array-contains + slCode range
//
// Requires Firestore composite indexes (see firestore.indexes.json):
//   packages: trackingSuffixes (array-contains) + createdAt (desc)
//   packages: searchTokens     (array-contains) + createdAt (desc)
//   packages: slCode (asc)     + createdAt (desc) — already present
// ─────────────────────────────────────────────────────────────────────────────
export async function searchPackages(
  rawQuery: string,
  maxResults = 50
): Promise<PackageSearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const qUpper = q.toUpperCase();
  const qCapitalized = q.charAt(0).toUpperCase() + q.slice(1);
  const qNorm = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const colRef = collection(db, COLLECTIONS.PACKAGES);
  const seen = new Set<string>();
  const results: PackageSearchResult[] = [];

  const addSnap = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }) => {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const rawData = { id: d.id, ...convertTimestamps(d.data()) };
      results.push(sanitizeDocument(COLLECTIONS.PACKAGES, rawData) as PackageSearchResult);
    }
  };

  // Tracking numbers contain at least one digit. Pure-alpha words are names, not trackings.
  const isSlCode     = /^SL\d+$/i.test(q);
  const hasDigit     = /\d/.test(q);
  const isTrackingLike = !isSlCode && hasDigit && /^[A-Z0-9]{4,}$/i.test(q.replace(/[-\s]/g, ''));
  const isPureText   = !hasDigit && q.length >= 2;

  const promises: Promise<void>[] = [];

  // ── 1. Direct doc ID lookup (Only for tracking-like or SL codes) ────────────
  if (isTrackingLike || isSlCode || q.length <= 4) {
    const validKeys = [qUpper, q, q.toLowerCase()].filter(v => !v.includes('/'));
    promises.push(
      Promise.allSettled(
        validKeys.map((v) => getDoc(doc(colRef, v)))
      ).then((settled) => {
        for (const r of settled) {
          if (r.status === 'fulfilled' && r.value.exists()) {
            const d = r.value as QueryDocumentSnapshot<DocumentData>;
            if (!seen.has(d.id)) {
              seen.add(d.id);
              results.push({ id: d.id, ...convertTimestamps(d.data()!) } as PackageSearchResult);
            }
          }
        }
      })
    );
  }

  // ── 2. slCode exact / range (highest priority when SL\d+ pattern) ──────────
  if (isSlCode) {
    promises.push(
      getDocs(
        query(colRef, where('slCode', '==', qUpper), orderBy('createdAt', 'desc'), limit(maxResults))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where('searchTokens', 'array-contains', qNorm), orderBy('createdAt', 'desc'), limit(maxResults))
      ).then(addSnap)
    );
  }

  // ── 3. Tracking-number fields (only when query contains digits) ─────────────
  if (isTrackingLike) {
    promises.push(
      getDocs(
        query(colRef, where('trackingSuffixes', 'array-contains', qUpper), orderBy('createdAt', 'desc'), limit(maxResults))
      ).then(addSnap)
    );
    promises.push(
      getDocs(query(colRef, where('trackingNumber', '==', qUpper), limit(20))).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where('trackingNumber', '>=', qUpper), where('trackingNumber', '<', qUpper + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(query(colRef, where('tracking', '==', qUpper), limit(20))).then(addSnap)
    );
  }

  // ── 4. Name / slCode / email (only when not purely tracking or when pure text) 
  if (isPureText || !isTrackingLike) {
    // searchTokens: prefix tokens built from customerName (needs backfill run once)
    promises.push(
      getDocs(
        query(colRef, where('searchTokens', 'array-contains', qNorm), orderBy('createdAt', 'desc'), limit(maxResults))
      ).then(addSnap)
    );
    // customerName prefix range (works without backfill)
    promises.push(
      getDocs(
        query(colRef, where('customerName', '>=', qUpper), where('customerName', '<', qUpper + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where('customerName', '>=', qCapitalized), where('customerName', '<', qCapitalized + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where('customerName', '>=', q), where('customerName', '<', q + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
    // slCode prefix range (catches partial SL inputs)
    promises.push(
      getDocs(
        query(colRef, where('slCode', '>=', qUpper), where('slCode', '<', qUpper + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
    // email fields
    promises.push(
      getDocs(
        query(colRef, where('customerEmail', '>=', q.toLowerCase()), where('customerEmail', '<', q.toLowerCase() + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
    promises.push(
      getDocs(
        query(colRef, where('email', '>=', q.toLowerCase()), where('email', '<', q.toLowerCase() + '\uf8ff'), limit(20))
      ).then(addSnap)
    );
  }

  await Promise.allSettled(promises);
  return results.slice(0, maxResults);
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillPackageSearchTokens — one-time migration:
// Writes searchTokens (name prefix tokens) + trackingSuffixes to all
// existing package docs that are missing either field.
// Call from admin panel, never on startup.
// ─────────────────────────────────────────────────────────────────────────────
export async function backfillPackageSearchTokens(
  onProgress?: (done: number, total: number) => void
): Promise<{ updated: number; skipped: number }> {
  const colRef = collection(db, COLLECTIONS.PACKAGES);
  const snapshot = await getDocs(query(colRef, orderBy('createdAt', 'desc')));
  const total = snapshot.docs.length;
  let updated = 0;
  let skipped = 0;

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let batchCount = 0;

  for (let i = 0; i < snapshot.docs.length; i++) {
    const d = snapshot.docs[i];
    const data = d.data();

    const hasTokens = Array.isArray(data.searchTokens) && data.searchTokens.length > 0;
    const hasSuffixes = Array.isArray(data.trackingSuffixes) && data.trackingSuffixes.length > 0;

    if (hasTokens && hasSuffixes) {
      skipped++;
      onProgress?.(i + 1, total);
      continue;
    }

    const update: Record<string, unknown> = {};

    if (!hasTokens) {
      update.searchTokens = [
        ...new Set(generatePackageSearchTokens(data.customerName || '', data.slCode)),
      ];
    }
    if (!hasSuffixes) {
      const tn = data.trackingNumber || data.tracking || data.trackingId || '';
      update.trackingSuffixes = tn ? generateTrackingSuffixes(tn) : [];
    }

    batch.update(d.ref, update);
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }

    onProgress?.(i + 1, total);
  }

  if (batchCount > 0) await batch.commit();
  return { updated, skipped };
}

// Get single document
export async function getDocument<T>(
  collectionName: string,
  documentId: string
): Promise<T | null> {
  const docRef = doc(db, collectionName, documentId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  const rawData = {
    id: docSnap.id,
    ...convertTimestamps(docSnap.data()),
  };
  return sanitizeDocument(collectionName, rawData) as T;
}

// Create document
export async function createDocument<T>(
  collectionName: string,
  data: Omit<T, "id" | "createdAt" | "updatedAt">
): Promise<T> {
  const collectionRef = collection(db, collectionName);
  const now = new Date().toISOString();
  const docData = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  const docRef = await addDoc(collectionRef, docData);
  
  return sanitizeDocument(collectionName, {
    id: docRef.id,
    ...data,
    createdAt: now,
    updatedAt: now,
  }) as T;
}

// Update document
export async function updateDocument<T>(
  collectionName: string,
  documentId: string,
  data: Partial<T>
): Promise<T | null> {
  const docRef = doc(db, collectionName, documentId);
  const now = new Date().toISOString();
  
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  
  return sanitizeDocument(collectionName, {
    id: documentId,
    ...data,
    updatedAt: now,
  }) as T;
}

// Soft-delete a customer — sets status='deleted' instead of removing the document
export async function softDeleteCustomer(customerId: string): Promise<void> {
  const docRef = doc(db, COLLECTIONS.CUSTOMERS, customerId);
  await updateDoc(docRef, {
    status: 'deleted',
    deletedAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

// Delete document
export async function deleteDocument(
  collectionName: string,
  documentId: string
): Promise<boolean> {
  const docRef = doc(db, collectionName, documentId);
  await deleteDoc(docRef);
  return true;
}

// ============================================
// Collection-specific API
// ============================================

/**
 * Server-side invoice lookup by tracking number or slCode.
 * - trackingNumber: checks scalar `trackingNumber` AND `trackingNumbers` array
 * - slCode: checks `slCode` (Nova) AND `clientSlCode` (SP1-style) fields
 * Returns full invoice documents.
 */
export async function getInvoiceByTracking(term: string): Promise<Record<string, unknown>[]> {
  if (!term.trim()) return [];
  const t = term.trim().toUpperCase();
  const colRef = collection(db, COLLECTIONS.INVOICES);
  const seen = new Set<string>();
  const results: Record<string, unknown>[] = [];
  const addSnap = (snap: { docs: QueryDocumentSnapshot<DocumentData>[] }) => {
    snap.docs.forEach(d => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      results.push({ id: d.id, ...convertTimestamps(d.data()) });
    });
  };

  const isSlCode = /^SL\d+$/i.test(t);
  if (isSlCode) {
    const [s1, s2] = await Promise.all([
      getDocs(query(colRef, where('slCode',     '==', t), limit(50))),
      getDocs(query(colRef, where('clientSlCode','==', t), limit(50))),
    ]);
    addSnap(s1); addSnap(s2);
  } else {
    const [s1, s2] = await Promise.all([
      getDocs(query(colRef, where('trackingNumber',    '==', t),              limit(10))),
      getDocs(query(colRef, where('trackingNumbers', 'array-contains', t),    limit(10))),
    ]);
    addSnap(s1); addSnap(s2);
  }
  return results;
}

export const firestoreApi = {
  // Customers
  customers: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.CUSTOMERS, options),
    get: (id: string) => getDocument(COLLECTIONS.CUSTOMERS, id),
    create: (data: any) => createDocument(COLLECTIONS.CUSTOMERS, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.CUSTOMERS, id, data),
    /**
     * Hard delete: removes the doc from the `customers` collection.
     * Use `softDeleteCustomer(id)` directly if you need to preserve history.
     */
    delete: (id: string) => deleteDocument(COLLECTIONS.CUSTOMERS, id),
    softDelete: (id: string) => softDeleteCustomer(id),
  },
  
  // Packages
  packages: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.PACKAGES, options),
    get: (id: string) => getDocument(COLLECTIONS.PACKAGES, id),
    create: (data: any) => {
      const tn = data.trackingNumber || data.tracking || data.trackingId || '';
      const enriched = {
        ...data,
        trackingSuffixes: tn ? generateTrackingSuffixes(tn) : [],
        searchTokens: [
          ...new Set(generatePackageSearchTokens(data.customerName || '', data.slCode)),
        ],
      };
      return createDocument(COLLECTIONS.PACKAGES, enriched);
    },
    update: async (id: string, data: any) => {
      const enriched: any = { ...data };
      if (data.trackingNumber || data.tracking || data.trackingId) {
        const tn = data.trackingNumber || data.tracking || data.trackingId;
        enriched.trackingSuffixes = generateTrackingSuffixes(tn);
      }
      if (data.customerName !== undefined && data.slCode !== undefined) {
        enriched.searchTokens = [
          ...new Set(generatePackageSearchTokens(data.customerName, data.slCode)),
        ];
      } else if (data.customerName !== undefined || data.slCode !== undefined) {
        // Re-index search tokens only when one of customer-related fields is partially provided
        try {
          const docRef = doc(db, COLLECTIONS.PACKAGES, id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const current = docSnap.data();
            const name = data.customerName !== undefined ? data.customerName : (current.customerName || "");
            const sl = data.slCode !== undefined ? data.slCode : (current.slCode || "");
            enriched.searchTokens = [
              ...new Set(generatePackageSearchTokens(name, sl)),
            ];
          }
        } catch (err) {
          console.warn("[firestore-client] package search index update failed:", err);
        }
      }
      return updateDocument(COLLECTIONS.PACKAGES, id, enriched);
    },
    delete: (id: string) => deleteDocument(COLLECTIONS.PACKAGES, id),
    search: (rawQuery: string, maxResults?: number) => searchPackages(rawQuery, maxResults),
  },
  
  // Invoices
  invoices: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.INVOICES, options),
    get: (id: string) => getDocument(COLLECTIONS.INVOICES, id),
    create: (data: any) => {
      const clientName = data.clientName || data.customerName || data.customer?.fullName || "";
      const clientSlCode = data.clientSlCode || data.slCode || data.customerId || "";
      const invoiceNumber = data.invoiceNumber || "";
      const tokens = generateInvoiceSearchTokens(clientName, clientSlCode, invoiceNumber);
      return createDocument(COLLECTIONS.INVOICES, {
        ...data,
        searchTokens: [...new Set(tokens)],
      });
    },
    update: async (id: string, data: any) => {
      const clientName = data.clientName || data.customerName || data.customer?.fullName;
      const clientSlCode = data.clientSlCode || data.slCode || data.customerId;
      const invoiceNumber = data.invoiceNumber;
      if (clientName !== undefined && clientSlCode !== undefined && invoiceNumber !== undefined) {
        const tokens = generateInvoiceSearchTokens(clientName, clientSlCode, invoiceNumber);
        return updateDocument(COLLECTIONS.INVOICES, id, {
          ...data,
          searchTokens: [...new Set(tokens)],
        });
      } else if (clientName !== undefined || clientSlCode !== undefined || invoiceNumber !== undefined) {
        try {
          const docRef = doc(db, COLLECTIONS.INVOICES, id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const current = docSnap.data();
            const finalClientName = clientName ?? current.clientName ?? current.customerName ?? current.customer?.fullName ?? "";
            const finalClientSlCode = clientSlCode ?? current.clientSlCode ?? current.slCode ?? current.customerId ?? "";
            const finalInvoiceNumber = invoiceNumber ?? current.invoiceNumber ?? "";
            const tokens = generateInvoiceSearchTokens(finalClientName, finalClientSlCode, finalInvoiceNumber);
            return updateDocument(COLLECTIONS.INVOICES, id, {
              ...data,
              searchTokens: [...new Set(tokens)],
            });
          }
        } catch (err) {
          console.warn("[firestore-client] invoice searchTokens update calculation failed:", err);
        }
      }
      return updateDocument(COLLECTIONS.INVOICES, id, data);
    },
    delete: (id: string) => deleteDocument(COLLECTIONS.INVOICES, id),
    search: (rawQuery: string, maxResults?: number) => searchInvoices(rawQuery, maxResults),
  },
  
  // Users
  users: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.USERS, options),
    get: (id: string) => getDocument(COLLECTIONS.USERS, id),
    create: (data: any) => createDocument(COLLECTIONS.USERS, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.USERS, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.USERS, id),
  },
  
  // Settings
  settings: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.SETTINGS, options),
    get: (id: string) => getDocument(COLLECTIONS.SETTINGS, id),
    create: (data: any) => createDocument(COLLECTIONS.SETTINGS, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.SETTINGS, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.SETTINGS, id),
  },
  
  // Routes
  routes: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.ROUTES, options),
    get: (id: string) => getDocument(COLLECTIONS.ROUTES, id),
    create: (data: any) => createDocument(COLLECTIONS.ROUTES, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.ROUTES, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.ROUTES, id),
  },

  // Manifests
  manifests: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.MANIFESTS, options),
    get: (id: string) => getDocument(COLLECTIONS.MANIFESTS, id),
    create: (data: any) => createDocument(COLLECTIONS.MANIFESTS, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.MANIFESTS, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.MANIFESTS, id),
    search: (rawQuery: string, maxResults?: number) => searchManifests(rawQuery, maxResults),
  },

  // Departments
  departments: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.DEPARTMENTS, options),
    get: (id: string) => getDocument(COLLECTIONS.DEPARTMENTS, id),
    create: (data: any) => createDocument(COLLECTIONS.DEPARTMENTS, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.DEPARTMENTS, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.DEPARTMENTS, id),
  },

  // Employees
  employees: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.EMPLOYEES, options),
    get: (id: string) => getDocument(COLLECTIONS.EMPLOYEES, id),
    create: (data: any) => createDocument(COLLECTIONS.EMPLOYEES, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.EMPLOYEES, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.EMPLOYEES, id),
  },

  // Pricing
  pricing: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.PRICING, options),
    get: (id: string) => getDocument(COLLECTIONS.PRICING, id),
    getConfig: async (branch: string, deliveryType: string) => {
      const result = await listDocuments(COLLECTIONS.PRICING, {
        filters: [
          { field: "branch", op: "==", value: branch },
          { field: "deliveryType", op: "==", value: deliveryType },
        ],
      });
      return result.data;
    },
    create: (data: any) => createDocument(COLLECTIONS.PRICING, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.PRICING, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.PRICING, id),
  },

  // Consolidation Rules
  consolidationRules: {
    list: async (options?: Parameters<typeof listDocuments>[1]) => {
      const result = await listDocuments(COLLECTIONS.CONSOLIDATION_RULES, options);
      return result.data;
    },
    get: (id: string) => getDocument(COLLECTIONS.CONSOLIDATION_RULES, id),
    create: (data: any) => createDocument(COLLECTIONS.CONSOLIDATION_RULES, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.CONSOLIDATION_RULES, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.CONSOLIDATION_RULES, id),
    toggleActive: async (id: string) => {
      const rule = await getDocument(COLLECTIONS.CONSOLIDATION_RULES, id) as { isActive?: boolean } | null;
      if (rule) {
        await updateDocument(COLLECTIONS.CONSOLIDATION_RULES, id, { isActive: !rule.isActive });
        return { ...rule, isActive: !rule.isActive };
      }
      throw new Error('Rule not found');
    },
  },

  // Payroll
  payroll: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.PAYROLL, options),
    get: (id: string) => getDocument(COLLECTIONS.PAYROLL, id),
    create: (data: any) => createDocument(COLLECTIONS.PAYROLL, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.PAYROLL, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.PAYROLL, id),
  },

  // Payroll Runs
  payrollRuns: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments("payroll_runs", options),
    get: (id: string) => getDocument("payroll_runs", id),
    create: (data: any) => createDocument("payroll_runs", data),
    update: (id: string, data: any) => updateDocument("payroll_runs", id, data),
    delete: (id: string) => deleteDocument("payroll_runs", id),
  },

  // Encomiendas
  encomiendas: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.ENCOMIENDAS, options),
    get: (id: string) => getDocument(COLLECTIONS.ENCOMIENDAS, id),
    create: (data: any) => createDocument(COLLECTIONS.ENCOMIENDAS, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.ENCOMIENDAS, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.ENCOMIENDAS, id),
  },

  // Time Entries
  timeEntries: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.TIME_ENTRIES, options),
    get: (id: string) => getDocument(COLLECTIONS.TIME_ENTRIES, id),
    create: (data: any) => createDocument(COLLECTIONS.TIME_ENTRIES, data),
    update: (id: string, data: any) => updateDocument(COLLECTIONS.TIME_ENTRIES, id, data),
    delete: (id: string) => deleteDocument(COLLECTIONS.TIME_ENTRIES, id),
  },

  // Payroll Settings (per country)
  payrollSettings: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.PAYROLL_SETTINGS, options),
    get: (countryCode: string) => getDocument(COLLECTIONS.PAYROLL_SETTINGS, countryCode),
    getByCountry: async (countryCode: string) => {
      const doc = await getDocument(COLLECTIONS.PAYROLL_SETTINGS, countryCode);
      if (doc) return doc;
      // Return defaults for Costa Rica if not found
      return {
        id: countryCode,
        countryCode,
        employerSocialSecurityRate: 0.2683,
        employeeSocialSecurityRate: 0.1083,
        overtimeRate: 1.5,
        standardWeeklyHours: 48,
        incomeTaxBrackets: [
          { upTo: 922000, rate: 0 },
          { upTo: 1352000, rate: 0.1 },
          { upTo: 2373000, rate: 0.15 },
          { upTo: 4745000, rate: 0.2 },
          { upTo: 999999999, rate: 0.25 },
        ],
      };
    },
    create: (data: any) => createDocument(COLLECTIONS.PAYROLL_SETTINGS, data),
    update: (countryCode: string, data: any) => updateDocument(COLLECTIONS.PAYROLL_SETTINGS, countryCode, data),
    delete: (countryCode: string) => deleteDocument(COLLECTIONS.PAYROLL_SETTINGS, countryCode),
  },

  // Analytics - computed from collections
  analytics: {
    /**
     * Retrieves aggregated KPI counters for the main dashboard.
     *
     * ARCHITECTURAL OPTIMIZATION (Single-Document Rollup & Zero Body Payload):
     * 1. Primary Strategy: Reads the pre-aggregated rollup document `metadata/dashboard_counters`
     *    updated asynchronously by Cloud Functions (cost = exactly 1 document read).
     * 2. Defensive Fallback: If uninitialized, falls back to `getCountFromServer` queries
     *    which aggregate in Firestore metadata with zero document payload transfer cost.
     *
     * @returns Object containing totalPackages, totalCustomers, totalInvoices, deliveredPackages, pendingPackages
     */
    getDashboardStats: async () => {
      try {
        const docRef = doc(db, "metadata", "dashboard_counters");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          return {
            totalPackages: data.totalPackages ?? 0,
            totalCustomers: data.totalCustomers ?? 0,
            totalInvoices: data.totalInvoices ?? 0,
            deliveredPackages: data.deliveredPackages ?? 0,
            pendingPackages: data.pendingPackages ?? 0,
          };
        }
      } catch (err) {
        console.warn("[firestore-client] Failed to get dashboard counters from doc, falling back to server counts:", err);
      }

      // Defensive Fallback: Server-side counts
      const packagesRef = collection(db, COLLECTIONS.PACKAGES);
      const customersRef = collection(db, COLLECTIONS.CUSTOMERS);
      const invoicesRef = collection(db, COLLECTIONS.INVOICES);
      
      const [packagesCount, customersCount, invoicesCount] = await Promise.all([
        getCountFromServer(packagesRef),
        getCountFromServer(customersRef),
        getCountFromServer(invoicesRef),
      ]);
      
      const deliveredQuery = query(packagesRef, where("status", "==", "delivered"));
      const deliveredCount = await getCountFromServer(deliveredQuery);
      
      const pendingQuery = query(packagesRef, where("status", "==", "pending"));
      const pendingCount = await getCountFromServer(pendingQuery);
      
      return {
        totalPackages: packagesCount.data().count,
        totalCustomers: customersCount.data().count,
        totalInvoices: invoicesCount.data().count,
        deliveredPackages: deliveredCount.data().count,
        pendingPackages: pendingCount.data().count,
      };
    },
    
    getPackagesByStatus: async () => {
      try {
        const docRef = doc(db, "metadata", "dashboard_counters");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.statusBreakdown) {
            return data.statusBreakdown as Record<string, number>;
          }
        }
      } catch (err) {
        console.warn("[firestore-client] Failed to get packages status breakdown from doc, falling back to server counts:", err);
      }

      // Defensive Fallback: Server-side counts
      const packagesRef = collection(db, COLLECTIONS.PACKAGES);
      const statuses = ["pending", "in_transit", "delivered", "returned", "cancelled"];

      const entries = await Promise.all(
        statuses.map(async (status) => {
          const snap = await getCountFromServer(query(packagesRef, where("status", "==", status)));
          return [status, snap.data().count] as const;
        })
      );

      return Object.fromEntries(entries) as Record<string, number>;
    },
  },
  
  // Permissions (RBAC)
  permissions: {
    list: (options?: Parameters<typeof listDocuments>[1]) =>
      listDocuments(COLLECTIONS.PERMISSIONS, options),
    get: (roleId: string) => getDocument(COLLECTIONS.PERMISSIONS, roleId),
    update: (roleId: string, data: any) => updateDocument(COLLECTIONS.PERMISSIONS, roleId, data),
    create: (data: any) => createDocument(COLLECTIONS.PERMISSIONS, data),
  },
};

export default firestoreApi;
