import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS, SUBCOLLECTIONS } from "../types/firestore";

// Use the named database "portal" as configured in firebase.json
export const db = getFirestore("portal");

// Collection references
export const usersRef = () => db.collection(COLLECTIONS.USERS);
export const customersRef = () => db.collection(COLLECTIONS.CUSTOMERS);
export const packagesRef = () => db.collection(COLLECTIONS.PACKAGES);
export const deliveriesRef = () => db.collection(COLLECTIONS.DELIVERIES);
export const routesRef = () => db.collection(COLLECTIONS.ROUTES);
export const invoicesRef = () => db.collection(COLLECTIONS.INVOICES);
export const settingsRef = () => db.collection(COLLECTIONS.SETTINGS);
export const permissionsRef = () => db.collection(COLLECTIONS.PERMISSIONS);
export const auditLogsRef = () => db.collection(COLLECTIONS.AUDIT_LOGS);
export const auditRef = () => db.collection("audit_logs");
export const scannerHistoryRef = () => db.collection(COLLECTIONS.SCANNER_HISTORY);
export const quotesRef = () => db.collection(COLLECTIONS.QUOTES);
export const manifestsRef = () => db.collection(COLLECTIONS.MANIFESTS);
export const departmentsRef = () => db.collection(COLLECTIONS.DEPARTMENTS);
export const employeesRef = () => db.collection(COLLECTIONS.EMPLOYEES);

// Subcollection references
export const userProfileRef = (userId: string) =>
  usersRef().doc(userId).collection(SUBCOLLECTIONS.PROFILE);

export const trackingHistoryRef = (packageId: string) =>
  packagesRef().doc(packageId).collection(SUBCOLLECTIONS.TRACKING_HISTORY);

export const invoiceItemsRef = (invoiceId: string) =>
  invoicesRef().doc(invoiceId).collection(SUBCOLLECTIONS.ITEMS);

export const quoteItemsRef = (quoteId: string) =>
  quotesRef().doc(quoteId).collection(SUBCOLLECTIONS.ITEMS);

export const routePackagesRef = (routeId: string) =>
  routesRef().doc(routeId).collection(SUBCOLLECTIONS.ROUTE_PACKAGES);

// Helper functions
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const toTimestamp = (date: Date) => Timestamp.fromDate(date);
export const fromTimestamp = (timestamp: Timestamp) => timestamp.toDate();

// Generic CRUD helpers
export async function getDocument<T>(
  collection: FirebaseFirestore.CollectionReference,
  id: string
): Promise<T | null> {
  const doc = await collection.doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as T;
}

export async function listDocuments<T>(
  collection: FirebaseFirestore.CollectionReference,
  options?: {
    limit?: number;
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    where?: Array<{ field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown }>;
  }
): Promise<T[]> {
  let query: FirebaseFirestore.Query = collection;

  if (options?.where) {
    for (const condition of options.where) {
      query = query.where(condition.field, condition.op, condition.value);
    }
  }

  if (options?.orderBy) {
    query = query.orderBy(options.orderBy, options.orderDirection || "desc");
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T));
}

export async function createDocument<T extends Record<string, unknown>>(
  collection: FirebaseFirestore.CollectionReference,
  data: Omit<T, "id" | "createdAt" | "updatedAt">,
  id?: string
): Promise<T> {
  const docData = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  let docRef: FirebaseFirestore.DocumentReference;
  if (id) {
    docRef = collection.doc(id);
    await docRef.set(docData);
  } else {
    docRef = await collection.add(docData);
  }

  const now = new Date().toISOString();
  return { id: docRef.id, ...data, createdAt: now, updatedAt: now } as unknown as T;
}

export async function updateDocument<T extends Record<string, unknown>>(
  collection: FirebaseFirestore.CollectionReference,
  id: string,
  data: Partial<Omit<T, "id" | "createdAt">>
): Promise<T | null> {
  const docRef = collection.doc(id);

  await docRef.update({
    ...data,
    updatedAt: serverTimestamp(),
  });

  const now = new Date().toISOString();
  return { id, ...data, updatedAt: now } as unknown as T;
}

export async function deleteDocument(
  collection: FirebaseFirestore.CollectionReference,
  id: string
): Promise<boolean> {
  const docRef = collection.doc(id);
  await docRef.delete();
  return true;
}

// Batch operations
export function createBatch() {
  return db.batch();
}

export async function runTransaction<T>(
  fn: (transaction: FirebaseFirestore.Transaction) => Promise<T>
): Promise<T> {
  return db.runTransaction(fn);
}
