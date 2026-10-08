/**
 * The SP1 invoices of one customer (any status, incl. annulled / cancelled — soft-deleted ones are skipped by the
 * rule), only the fields the "Día 1" rule needs. Invoices carry the customer in `slCode` or `clientSlCode`.
 */
import type { Firestore } from "firebase-admin/firestore";

const FIELDS = ["invoiceNumber", "invoiceDate", "createdAt", "date", "invoiceItems", "items", "isDeleted", "status", "slCode", "clientSlCode"];

export async function loadCustomerInvoices(db: Firestore, slCode: string): Promise<any[]> {
  const sl = String(slCode || "").trim().toUpperCase();
  if (!sl) return [];
  const col = db.collection("invoices");
  const [a, b] = await Promise.all([
    col.where("slCode", "==", sl).select(...FIELDS).get(),
    col.where("clientSlCode", "==", sl).select(...FIELDS).get(),
  ]);
  const byId = new Map<string, any>();
  for (const d of [...a.docs, ...b.docs]) byId.set(d.id, { id: d.id, ...d.data() });
  return [...byId.values()];
}
