interface TraceRequest {
    tracking: string;
}
interface PackageHit {
    id: string;
    trackingNumber: string;
    slCode: string | null;
    customerName: string | null;
    status: string | null;
    manifestNumber: string | null;
    ruta: string | null;
    description: string | null;
    weight: number | null;
    cost: number | null;
    createdAt: string | null;
    updatedAt: string | null;
}
interface InvoiceHit {
    id: string;
    invoiceNumber: string | null;
    slCode: string | null;
    customerName: string | null;
    status: string | null;
    totalAmount: number | null;
    manifestNumber: string | null;
    itemDescription: string | null;
    itemPrice: number | null;
    createdAt: string | null;
    updatedAt: string | null;
}
interface AuditHit {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    userId: string | null;
    timestamp: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
}
interface ResolutionPlanItem {
    pkgId: string;
    pkgSlCode: string | null;
    pkgCustomerName: string | null;
    tracking: string;
    currentInvoiceId: string | null;
    currentInvoiceNumber: string | null;
    currentInvoiceStatus: string | null;
    targetInvoiceId: string | null;
    targetInvoiceNumber: string | null;
    targetInvoiceStatus: string | null;
    /** Why the target was chosen — human-readable for the UI tooltip */
    reason: string;
    /** True when the patch actually changes something */
    willChange: boolean;
}
interface TracePayload {
    tracking: string;
    packages: PackageHit[];
    invoices: InvoiceHit[];
    audits: AuditHit[];
    ownershipMismatch: boolean;
    mismatchDetail: string | null;
    /** What `slResolveTrackingLinks` would change if the admin clicks Resolver */
    resolutionPlan: ResolutionPlanItem[];
}
interface TraceResponse {
    success: true;
    data: TracePayload;
}
export declare const slTraceTracking: import("firebase-functions/v2/https").CallableFunction<TraceRequest, Promise<TraceResponse>, unknown>;
/**
 * slResolveTrackingLinks
 *
 * On-demand enforcement of the package <-> invoice invariant for a single
 * tracking. Powers the "Resolver automáticamente" button on the trace
 * dialog so dispatchers don't need to wait for the next trigger fire.
 *
 * For every package with the given tracking we recompute the winner
 * invoice (most recent ACTIVE invoice that lists the tracking under the
 * package's customer) and update the package fields if they drifted.
 *
 * Returns the per-package outcome so the UI can show "1 paquete re-vinculado".
 */
export declare const slResolveTrackingLinks: import("firebase-functions/v2/https").CallableFunction<TraceRequest, Promise<{
    success: true;
    data: {
        tracking: string;
        changed: Array<{
            pkgId: string;
            from: string | null;
            to: string | null;
            toNumber: string | null;
        }>;
        skipped: number;
    };
}>, unknown>;
export {};
//# sourceMappingURL=trace.d.ts.map