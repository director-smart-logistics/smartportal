/**
 * Server-side Audit Service
 *
 * logServerAuditEvent() — fire-and-forget Firestore write to audit_logs.
 *                         Never throws; audit must never break the caller.
 * withAudit()           — Higher-order function that wraps a callable handler
 *                         and auto-logs invocation + duration + result.
 */

import { FieldValue } from "firebase-admin/firestore";
import { CallableRequest } from "firebase-functions/v2/https";
import { db } from "../lib/firestore";
import type { AuditAction, AuditCategory, AuditLogDocument, AuditSource } from "./audit-types";

const COLLECTION = "audit_logs";

// ── Core write helper ─────────────────────────────────────────────────────────

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
export function logServerAuditEvent(payload: ServerAuditPayload): void {
  const doc: Omit<AuditLogDocument, "timestamp"> & { timestamp: ReturnType<typeof FieldValue.serverTimestamp> } = {
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
    timestamp: FieldValue.serverTimestamp(),
  };

  // Remove undefined keys to keep Firestore clean
  (Object.keys(doc) as (keyof typeof doc)[]).forEach((k) => {
    if (doc[k] === undefined) delete doc[k];
  });

  void db.collection(COLLECTION).add(doc).catch(() => {});
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
export function withAudit<TData, TResult>(
  category: AuditCategory,
  action: AuditAction,
  handler: (request: CallableRequest<TData>) => Promise<TResult>,
  options?: {
    resourceIdFn?: (req: CallableRequest<TData>, result: TResult) => string | undefined;
    metadataFn?: (req: CallableRequest<TData>) => Record<string, unknown>;
  }
): (request: CallableRequest<TData>) => Promise<TResult> {
  return async (request: CallableRequest<TData>): Promise<TResult> => {
    const start = Date.now();
    const userId = request.auth?.uid ?? "anonymous";
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const userName = (token?.name as string) ?? (token?.email as string) ?? "";
    const userEmail = (token?.email as string) ?? "";
    const userRole = (token?.role as string) ?? "";

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
    } catch (err: unknown) {
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
export async function logAuthAuditEvent(
  userId: string,
  action: AuditAction,
  metadata?: Record<string, unknown>
): Promise<void> {
  const doc = {
    userId,
    userName: metadata?.displayName ?? "",
    userEmail: metadata?.email ?? "",
    userRole: metadata?.role ?? "",
    action,
    category: "auth" as AuditCategory,
    resource: "auth",
    result: "success" as const,
    source: "server" as AuditSource,
    metadata,
    timestamp: FieldValue.serverTimestamp(),
  };

  await db.collection(COLLECTION).add(doc).catch(() => {});
}
