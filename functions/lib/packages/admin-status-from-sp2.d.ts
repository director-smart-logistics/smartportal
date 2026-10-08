type Db = FirebaseFirestore.Firestore;
export type AdminTarget = "delivered" | "on_route";
/** The transition the owner allows from a current status, or null. */
export declare function allowedTarget(current: unknown): AdminTarget | null;
export interface AdminStatusInput {
    invoiceNumber: string;
    slCode: string;
    to: AdminTarget;
    reason: string;
    by: string;
    /** optional: only these trackings of the invoice */
    trackings?: string[];
}
export interface AdminStatusResult {
    invoiceNumber: string;
    to: AdminTarget;
    logId: string;
    changed: {
        id: string;
        tracking: string;
        from: string;
        to: AdminTarget;
    }[];
    skipped: {
        id: string;
        tracking: string;
        status: string;
        reason: string;
    }[];
}
export declare function setPackagesStatusFromSp2Core(db: Db, input: AdminStatusInput, now?: string): Promise<AdminStatusResult>;
export declare const slSetPackagesStatusFromSp2: import("firebase-functions/v2/https").HttpsFunction;
export {};
//# sourceMappingURL=admin-status-from-sp2.d.ts.map