/**
 * Server-side Audit Service
 *
 * logServerAuditEvent() — fire-and-forget Firestore write to audit_logs.
 *                         Never throws; audit must never break the caller.
 * withAudit()           — Higher-order function that wraps a callable handler
 *                         and auto-logs invocation + duration + result.
 */
import { CallableRequest } from "firebase-functions/v2/https";
import type { AuditAction, AuditCategory, AuditSource } from "./audit-types";
export interface ServerAuditPayload {
    userId: string;
    userName?: string;
    userEmail?: string;
    userRole?: string;
    action: AuditAction;
    category: AuditCategory;
    resource?: string;
    resourceId?: string;
    result: "success" | "error";
    errorMessage?: string;
    errorCode?: string;
    duration?: number;
    affectedCount?: number;
    metadata?: Record<string, unknown>;
    source?: AuditSource;
}
/**
 * Write one audit event to Firestore — completely fire-and-forget.
 * Safe to call without await; failures are silently swallowed so they
 * never propagate to the calling Cloud Function.
 */
export declare function logServerAuditEvent(payload: ServerAuditPayload): void;
/**
 * Wraps a callable handler with automatic audit logging.
 *
 * Usage:
 *   export const slCreateCustomer = onCall({ cors: true },
 *     withAudit('customer', 'customer_created', async (request) => {
 *       // ... handler logic
 *     })
 *   );
 */
export declare function withAudit<TData, TResult>(category: AuditCategory, action: AuditAction, handler: (request: CallableRequest<TData>) => Promise<TResult>, options?: {
    resourceIdFn?: (req: CallableRequest<TData>, result: TResult) => string | undefined;
    metadataFn?: (req: CallableRequest<TData>) => Record<string, unknown>;
}): (request: CallableRequest<TData>) => Promise<TResult>;
/**
 * Log an auth event (login, logout, user created, etc.)
 * Called from auth triggers which don't have a callable context.
 */
export declare function logAuthAuditEvent(userId: string, action: AuditAction, metadata?: Record<string, unknown>): Promise<void>;
//# sourceMappingURL=audit-service.d.ts.map