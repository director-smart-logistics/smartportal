/**
 * The SP1 invoices of one customer (any status, incl. annulled / cancelled — soft-deleted ones are skipped by the
 * rule), only the fields the "Día 1" rule needs. Invoices carry the customer in `slCode` or `clientSlCode`.
 */
import type { Firestore } from "firebase-admin/firestore";
export declare function loadCustomerInvoices(db: Firestore, slCode: string): Promise<any[]>;
//# sourceMappingURL=customer-invoices.d.ts.map