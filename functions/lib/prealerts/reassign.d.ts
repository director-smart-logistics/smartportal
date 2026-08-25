interface ReassignRequest {
    preAlertId: string;
    newSlCode: string;
    /** Optional human-readable note saved in the audit trail */
    reason?: string;
}
interface ReassignOutcome {
    preAlertId: string;
    tracking: string | null;
    ok: boolean;
    fromSlCode: string | null;
    toSlCode: string | null;
    sp2: {
        pushed: boolean;
        outcome?: string;
        error?: string;
    };
    error?: string;
}
export declare const slReassignPreAlert: import("firebase-functions/v2/https").CallableFunction<ReassignRequest, Promise<{
    success: true;
    preAlertId: string;
    from: {
        slCode: string;
        displayName: string;
    };
    to: {
        slCode: string;
        displayName: string;
        userId: string | null;
    };
    sp2: {
        pushed: boolean;
        outcome?: string;
        error?: string;
    };
}>, unknown>;
/**
 * slReassignPreAlertsBulk
 *
 * Move many pre-alerts to the same destination customer in one call. The
 * target customer + SP2 userId are looked up ONCE and reused across every
 * pre-alert. Per-item failures don't abort the batch — each result is
 * returned so the UI can show which items succeeded and which need a
 * retry.
 */
interface BulkReassignRequest {
    preAlertIds: string[];
    newSlCode: string;
    reason?: string;
}
export declare const slReassignPreAlertsBulk: import("firebase-functions/v2/https").CallableFunction<BulkReassignRequest, Promise<{
    success: true;
    target: {
        slCode: string;
        displayName: string;
        userId: string | null;
    };
    total: number;
    succeeded: number;
    failed: number;
    sp2Pushed: number;
    results: ReassignOutcome[];
}>, unknown>;
export {};
//# sourceMappingURL=reassign.d.ts.map