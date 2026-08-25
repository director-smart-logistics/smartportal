/**
 * Audit Callable Functions
 *
 * slGetAuditLogs    — Paginated log viewer (admin-only)
 * slGetAuditMetrics — Aggregated usage metrics (admin-only)
 * slGetAuditSummary — Quick dashboard stats (admin-only)
 */

import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/firestore";
import type {
  AuditLogsQueryParams,
  AuditMetricsParams,
  AuditLogEntry,
  AuditMetrics,
} from "./audit-types";

const COLLECTION = "audit_logs";
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];

function assertAdmin(request: CallableRequest<unknown>): void {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required");
  const role = (request.auth.token as Record<string, unknown>)?.role as string;
  if (!ADMIN_ROLES.includes(role)) {
    throw new HttpsError("permission-denied", "Admin role required to access audit logs");
  }
}

// ── slGetAuditLogs ────────────────────────────────────────────────────────────

export const slGetAuditLogs = onCall(
  { cors: true },
  async (request: CallableRequest<AuditLogsQueryParams>) => {
    assertAdmin(request);

    const {
      userId,
      action,
      category,
      result,
      source,
      resource,
      dateFrom,
      dateTo,
      page = 1,
      pageSize = 50,
    } = request.data || {};

    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (userId) query = query.where("userId", "==", userId);
    if (action) query = query.where("action", "==", action);
    if (category) query = query.where("category", "==", category);
    if (result) query = query.where("result", "==", result);
    if (source) query = query.where("source", "==", source);
    if (resource) query = query.where("resource", "==", resource);

    if (dateFrom) {
      query = query.where("timestamp", ">=", Timestamp.fromDate(new Date(dateFrom)));
    }
    if (dateTo) {
      query = query.where("timestamp", "<=", Timestamp.fromDate(new Date(dateTo)));
    }

    query = query.orderBy("timestamp", "desc");

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(200, Math.max(1, pageSize));

    const offset = (safePage - 1) * safePageSize;
    const snapshot = await query.limit(offset + safePageSize).get();
    const allDocs = snapshot.docs.slice(offset);

    const data: AuditLogEntry[] = allDocs.map((doc) => {
      const d = doc.data();
      const ts: Timestamp | null = d.timestamp instanceof Timestamp ? d.timestamp : null;
      return {
        id: doc.id,
        userId: d.userId ?? "",
        userName: d.userName ?? "",
        userEmail: d.userEmail ?? "",
        userRole: d.userRole ?? "",
        action: d.action ?? "",
        category: d.category ?? "",
        resource: d.resource,
        resourceId: d.resourceId,
        result: d.result ?? "",
        errorMessage: d.errorMessage,
        source: d.source ?? "client",
        duration: d.duration,
        affectedCount: d.affectedCount,
        metadata: d.metadata,
        page: d.page,
        platform: d.platform,
        timezone: d.timezone,
        timestamp: ts ? ts.toDate().toISOString() : (d.clientTimestamp ?? ""),
        clientTimestamp: d.clientTimestamp,
        appVersion: d.appVersion,
      };
    });

    return { success: true, data, pagination: { page: safePage, pageSize: safePageSize } };
  }
);

// ── slGetAuditMetrics ─────────────────────────────────────────────────────────

export const slGetAuditMetrics = onCall(
  { cors: true, timeoutSeconds: 60 },
  async (request: CallableRequest<AuditMetricsParams>) => {
    assertAdmin(request);

    const days = Math.min(90, Math.max(1, request.data?.days ?? 30));
    const filterUserId = request.data?.userId;

    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    let query: FirebaseFirestore.Query = db
      .collection(COLLECTION)
      .where("timestamp", ">=", Timestamp.fromDate(from))
      .orderBy("timestamp", "desc")
      .limit(5000);

    if (filterUserId) query = query.where("userId", "==", filterUserId);

    const snapshot = await query.get();
    const docs = snapshot.docs.map((d) => d.data());

    const uniqueUsers = new Set<string>();
    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const byUserMap: Record<string, { userName: string; userEmail: string; count: number }> = {};
    const byHour: Record<number, number> = {};
    const byDay: Record<string, number> = {};
    const byResource: Record<string, number> = {};
    let errors = 0;

    for (const d of docs) {
      uniqueUsers.add(d.userId ?? "");

      if (d.result === "error") errors++;

      if (d.category) byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
      if (d.action) byAction[d.action] = (byAction[d.action] ?? 0) + 1;
      if (d.resource) byResource[d.resource] = (byResource[d.resource] ?? 0) + 1;

      if (d.userId) {
        if (!byUserMap[d.userId]) {
          byUserMap[d.userId] = { userName: d.userName ?? "", userEmail: d.userEmail ?? "", count: 0 };
        }
        byUserMap[d.userId].count++;
      }

      const ts: Timestamp | null = d.timestamp instanceof Timestamp ? d.timestamp : null;
      if (ts) {
        const date = ts.toDate();
        byHour[date.getHours()] = (byHour[date.getHours()] ?? 0) + 1;
        const day = date.toISOString().split("T")[0];
        byDay[day] = (byDay[day] ?? 0) + 1;
      }
    }

    const total = docs.length;
    const metrics: AuditMetrics = {
      period: {
        from: from.toISOString(),
        to: new Date().toISOString(),
        days,
      },
      totals: {
        events: total,
        uniqueUsers: uniqueUsers.size,
        errors,
        errorRate: total > 0 ? Math.round((errors / total) * 10000) / 100 : 0,
      },
      byCategory: Object.entries(byCategory)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      byAction: Object.entries(byAction)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      byUser: Object.entries(byUserMap)
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      byHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: byHour[hour] ?? 0,
      })),
      byDay: Object.entries(byDay)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topResources: Object.entries(byResource)
        .map(([resource, count]) => ({ resource, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    };

    return { success: true, data: metrics };
  }
);

// ── slGetAuditSummary ─────────────────────────────────────────────────────────

export const slGetAuditSummary = onCall(
  { cors: true },
  async (request: CallableRequest<void>) => {
    assertAdmin(request);

    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [todaySnap, weekSnap, errorSnap, recentSnap] = await Promise.all([
      db.collection(COLLECTION)
        .where("timestamp", ">=", Timestamp.fromDate(todayStart))
        .count()
        .get(),
      db.collection(COLLECTION)
        .where("timestamp", ">=", Timestamp.fromDate(weekStart))
        .count()
        .get(),
      db.collection(COLLECTION)
        .where("result", "==", "error")
        .where("timestamp", ">=", Timestamp.fromDate(todayStart))
        .count()
        .get(),
      db.collection(COLLECTION)
        .orderBy("timestamp", "desc")
        .limit(10)
        .get(),
    ]);

    const recentEvents = recentSnap.docs.map((doc) => {
      const d = doc.data();
      const ts: Timestamp | null = d.timestamp instanceof Timestamp ? d.timestamp : null;
      return {
        id: doc.id,
        userId: d.userId ?? "",
        userName: d.userName ?? "",
        action: d.action ?? "",
        category: d.category ?? "",
        result: d.result ?? "",
        resource: d.resource ?? "",
        timestamp: ts ? ts.toDate().toISOString() : (d.clientTimestamp ?? ""),
      };
    });

    // Count unique active users today from recent snap (approximate — full count needs aggregation)
    const activeUsersToday = new Set(recentEvents.map((e) => e.userId)).size;

    return {
      success: true,
      data: {
        today: {
          events: todaySnap.data().count,
          errors: errorSnap.data().count,
          activeUsers: activeUsersToday,
        },
        week: {
          events: weekSnap.data().count,
        },
        recentEvents,
        generatedAt: new Date().toISOString(),
      },
    };
  }
);
