"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCustomerInvoices = loadCustomerInvoices;
const FIELDS = ["invoiceNumber", "invoiceDate", "createdAt", "date", "invoiceItems", "items", "isDeleted", "status", "slCode", "clientSlCode"];
async function loadCustomerInvoices(db, slCode) {
    const sl = String(slCode || "").trim().toUpperCase();
    if (!sl)
        return [];
    const col = db.collection("invoices");
    const [a, b] = await Promise.all([
        col.where("slCode", "==", sl).select(...FIELDS).get(),
        col.where("clientSlCode", "==", sl).select(...FIELDS).get(),
    ]);
    const byId = new Map();
    for (const d of [...a.docs, ...b.docs])
        byId.set(d.id, { id: d.id, ...d.data() });
    return [...byId.values()];
}
//# sourceMappingURL=customer-invoices.js.map