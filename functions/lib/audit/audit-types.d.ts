/**
 * Audit System — Shared Types (server-side)
 *
 * Collection: audit_logs
 * Used by: logServerAuditEvent(), withAudit(), slGetAuditLogs, slGetAuditMetrics
 */
import { Timestamp, FieldValue } from "firebase-admin/firestore";
export type AuditCategory = "auth" | "customer" | "package" | "invoice" | "quote" | "manifest" | "route" | "delivery" | "shipping_label" | "pre_alerts" | "scanner" | "user_management" | "payroll" | "settings" | "nova" | "tracking" | "analytics" | "navigation" | "system";
export type AuditAction = "login" | "logout" | "session_expired" | "auth_error" | "password_reset" | "user_registered" | "user_deleted_auth" | "customer_created" | "customer_updated" | "customer_deleted" | "customer_viewed" | "customer_searched" | "customer_linked" | "customer_exported" | "package_created" | "package_updated" | "package_deleted" | "package_viewed" | "package_status_updated" | "package_slcode_updated" | "packages_bulk_updated" | "package_exported" | "package_consolidated" | "invoice_created" | "invoice_updated" | "invoice_deleted" | "invoice_viewed" | "invoice_sent" | "invoice_paid" | "invoice_exported" | "invoice_regenerated_paid" | "quote_created" | "quote_updated" | "quote_deleted" | "quote_viewed" | "quote_sent" | "quote_converted" | "manifest_uploaded" | "manifest_processed" | "manifest_viewed" | "manifest_exported" | "manifest_downloaded" | "route_created" | "route_updated" | "route_deleted" | "route_viewed" | "route_dispatched" | "route_completed" | "delivery_created" | "delivery_updated" | "delivery_assigned" | "delivery_completed" | "delivery_failed" | "delivery_photo_uploaded" | "label_generated" | "label_printed" | "label_cancelled" | "label_status_updated" | "pre_alert_viewed" | "pre_alert_synced" | "pre_alert_searched" | "scanner_scan" | "scanner_confirmed" | "scanner_batch_scan" | "user_created" | "user_updated" | "user_role_changed" | "user_suspended" | "user_activated" | "payroll_report_generated" | "payroll_employee_created" | "payroll_employee_updated" | "time_entry_created" | "time_entry_updated" | "settings_updated" | "config_changed" | "nova_query" | "nova_manifest_processed" | "nova_session_start" | "nova_session_end" | "nova_tool_used" | "tracking_search" | "tracking_viewed" | "tracking_status_updated" | "analytics_report_viewed" | "analytics_export" | "page_view" | "sync_triggered" | "function_call" | "error" | "system_event";
export type AuditResult = "success" | "error" | "pending";
export type AuditSource = "client" | "server";
export interface AuditLogDocument {
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    action: AuditAction;
    category: AuditCategory;
    resource?: string;
    resourceId?: string;
    result: AuditResult;
    errorMessage?: string;
    errorCode?: string;
    source: AuditSource;
    duration?: number;
    affectedCount?: number;
    metadata?: Record<string, unknown>;
    page?: string;
    userAgent?: string;
    platform?: string;
    language?: string;
    timezone?: string;
    screenSize?: string;
    sessionId?: string;
    timestamp: Timestamp | ReturnType<typeof FieldValue.serverTimestamp>;
    clientTimestamp?: string;
    appVersion?: string;
}
export interface AuditLogsQueryParams {
    userId?: string;
    action?: AuditAction;
    category?: AuditCategory;
    result?: AuditResult;
    source?: AuditSource;
    resource?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
}
export interface AuditMetricsParams {
    days?: number;
    userId?: string;
}
export interface AuditLogEntry {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    action: string;
    category: string;
    resource?: string;
    resourceId?: string;
    result: string;
    errorMessage?: string;
    source: string;
    duration?: number;
    affectedCount?: number;
    metadata?: Record<string, unknown>;
    page?: string;
    platform?: string;
    timezone?: string;
    timestamp: string;
    clientTimestamp?: string;
    appVersion?: string;
}
export interface AuditMetrics {
    period: {
        from: string;
        to: string;
        days: number;
    };
    totals: {
        events: number;
        uniqueUsers: number;
        errors: number;
        errorRate: number;
    };
    byCategory: Array<{
        category: string;
        count: number;
    }>;
    byAction: Array<{
        action: string;
        count: number;
    }>;
    byUser: Array<{
        userId: string;
        userName: string;
        userEmail: string;
        count: number;
    }>;
    byHour: Array<{
        hour: number;
        count: number;
    }>;
    byDay: Array<{
        date: string;
        count: number;
    }>;
    topResources: Array<{
        resource: string;
        count: number;
    }>;
}
//# sourceMappingURL=audit-types.d.ts.map