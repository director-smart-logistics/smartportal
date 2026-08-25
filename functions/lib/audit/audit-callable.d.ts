/**
 * Audit Callable Functions
 *
 * slGetAuditLogs    — Paginated log viewer (admin-only)
 * slGetAuditMetrics — Aggregated usage metrics (admin-only)
 * slGetAuditSummary — Quick dashboard stats (admin-only)
 */
import type { AuditLogsQueryParams, AuditMetricsParams, AuditLogEntry, AuditMetrics } from "./audit-types";
export declare const slGetAuditLogs: import("firebase-functions/v2/https").CallableFunction<AuditLogsQueryParams, Promise<{
    success: boolean;
    data: AuditLogEntry[];
    pagination: {
        page: number;
        pageSize: number;
    };
}>, unknown>;
export declare const slGetAuditMetrics: import("firebase-functions/v2/https").CallableFunction<AuditMetricsParams, Promise<{
    success: boolean;
    data: AuditMetrics;
}>, unknown>;
export declare const slGetAuditSummary: import("firebase-functions/v2/https").CallableFunction<void, Promise<{
    success: boolean;
    data: {
        today: {
            events: number;
            errors: number;
            activeUsers: number;
        };
        week: {
            events: number;
        };
        recentEvents: {
            id: string;
            userId: any;
            userName: any;
            action: any;
            category: any;
            result: any;
            resource: any;
            timestamp: any;
        }[];
        generatedAt: string;
    };
}>, unknown>;
//# sourceMappingURL=audit-callable.d.ts.map