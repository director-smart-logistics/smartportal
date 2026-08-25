"use strict";
/**
 * Server-side Audit Service
 *
 * logServerAuditEvent() — fire-and-forget Firestore write to audit_logs.
 *                         Never throws; audit must never break the caller.
 * withAudit()           — Higher-order function that wraps a callable handler
 *                         and auto-logs invocation + duration + result.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logServerAuditEvent = logServerAuditEvent;
exports.withAudit = withAudit;
exports.logAuthAuditEvent = logAuthAuditEvent;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("../lib/firestore");
const COLLECTION = "audit_logs";
/**
 * Write one audit event to Firestore — completely fire-and-forget.
 * Safe to call without await; failures are silently swallowed so they
 * never propagate to the calling Cloud Function.
 */
function logServerAuditEvent(payload) {
    const doc = {
        userId: payload.userId,
        userName: payload.userName ?? "",
        userEmail: payload.userEmail ?? "",
        userRole: payload.userRole ?? "",
        action: payload.action,
        category: payload.category,
        resource: payload.resource,
        resourceId: payload.resourceId,
        result: payload.result,
        errorMessage: payload.errorMessage,
        errorCode: payload.errorCode,
        source: payload.source ?? "server",
        duration: payload.duration,
        affectedCount: payload.affectedCount,
        metadata: payload.metadata,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    };
    // Remove undefined keys to keep Firestore clean
    Object.keys(doc).forEach((k) => {
        if (doc[k] === undefined)
            delete doc[k];
    });
    void firestore_2.db.collection(COLLECTION).add(doc).catch(() => { });
}
// ── withAudit Higher-Order Function ──────────────────────────────────────────
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
function withAudit(category, action, handler, options) {
    return async (request) => {
        const start = Date.now();
        const userId = request.auth?.uid ?? "anonymous";
        const token = request.auth?.token;
        const userName = token?.name ?? token?.email ?? "";
        const userEmail = token?.email ?? "";
        const userRole = token?.role ?? "";
        try {
            const result = await handler(request);
            const duration = Date.now() - start;
            logServerAuditEvent({
                userId,
                userName,
                userEmail,
                userRole,
                action,
                category,
                resource: category,
                resourceId: options?.resourceIdFn?.(request, result),
                result: "success",
                duration,
                metadata: options?.metadataFn?.(request),
                source: "server",
            });
            return result;
        }
        catch (err) {
            const duration = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);
            logServerAuditEvent({
                userId,
                userName,
                userEmail,
                userRole,
                action,
                category,
                resource: category,
                result: "error",
                errorMessage: message,
                duration,
                metadata: options?.metadataFn?.(request),
                source: "server",
            });
            throw err;
        }
    };
}
// ── Auth trigger helper ───────────────────────────────────────────────────────
/**
 * Log an auth event (login, logout, user created, etc.)
 * Called from auth triggers which don't have a callable context.
 */
async function logAuthAuditEvent(userId, action, metadata) {
    const doc = {
        userId,
        userName: metadata?.displayName ?? "",
        userEmail: metadata?.email ?? "",
        userRole: metadata?.role ?? "",
        action,
        category: "auth",
        resource: "auth",
        result: "success",
        source: "server",
        metadata,
        timestamp: firestore_1.FieldValue.serverTimestamp(),
    };
    await firestore_2.db.collection(COLLECTION).add(doc).catch(() => { });
}
//# sourceMappingURL=audit-service.js.map