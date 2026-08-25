/**
 * slAuditSp2Package
 *
 * Perform a server-side audit of a package and its associated invoices
 * in the secondary Firebase database (smart-portal-2 / SP2).
 *
 * Querying server-side using the Firebase Admin SDK avoids client-side CORS issues,
 * permissions limitations, and resource-exhausted errors due to excessive queued queries.
 */
interface AuditInvoiceItem {
    id: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
}
interface AuditPackageItem {
    id: string;
    trackingNumber: string;
    status: string;
}
interface AuditRequest {
    trackingNumber: string;
    invoicesList: AuditInvoiceItem[];
    packagesList?: AuditPackageItem[];
}
export declare const slAuditSp2Package: import("firebase-functions/v2/https").CallableFunction<AuditRequest, Promise<any>, unknown>;
export declare const slDeleteSp2Shipment: import("firebase-functions/v2/https").CallableFunction<{
    shipmentId: string;
}, Promise<any>, unknown>;
export {};
//# sourceMappingURL=audit-sp2.d.ts.map