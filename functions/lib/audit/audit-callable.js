"use strict";
/**
 * Audit Callable Functions
 *
 * slGetAuditLogs    — Paginated log viewer (admin-only)
 * slGetAuditMetrics — Aggregated usage metrics (admin-only)
 * slGetAuditSummary — Quick dashboard stats (admin-only)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.slGetAuditSummary = exports.slGetAuditMetrics = exports.slGetAuditLogs = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("../lib/firestore");
const COLLECTION = "audit_logs";
const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"];
function assertAdmin(request) {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Authentication required");
    const role = request.auth.token?.role;
    if (!ADMIN_ROLES.includes(role)) {
        throw new https_1.HttpsError("permission-denied", "Admin role required to access audit logs");
    }
}
// ── slGetAuditLogs ────────────────────────────────────────────────────────────
exports.slGetAuditLogs = (0, https_1.onCall)({ cors: true }, async (request) => {
    assertAdmin(request);
    const { userId, action, category, result, source, resource, dateFrom, dateTo, page = 1, pageSize = 50, } = request.data || {};
    let query = firestore_2.db.collection(COLLECTION);
    if (userId)
        query = query.where("userId", "==", userId);
    if (action)
        query = query.where("action", "==", action);
    if (category)
        query = query.where("category", "==", category);
    if (result)
        query = query.where("result", "==", result);
    if (source)
        query = query.where("source", "==", source);
    if (resource)
        query = query.where("resource", "==", resource);
    if (dateFrom) {
        query = query.where("timestamp", ">=", firestore_1.Timestamp.fromDate(new Date(dateFrom)));
    }
    if (dateTo) {
        query = query.where("timestamp", "<=", firestore_1.Timestamp.fromDate(new Date(dateTo)));
    }
    query = query.orderBy("timestamp", "desc");
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(200, Math.max(1, pageSize));
    const offset = (safePage - 1) * safePageSize;
    const snapshot = await query.limit(offset + safePageSize).get();
    const allDocs = snapshot.docs.slice(offset);
    const data = allDocs.map((doc) => {
        const d = doc.data();
        const ts = d.timestamp instanceof firestore_1.Timestamp ? d.timestamp : null;
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
});
// ── slGetAuditMetrics ─────────────────────────────────────────────────────────
exports.slGetAuditMetrics = (0, https_1.onCall)({ cors: true, timeoutSeconds: 60 }, async (request) => {
    assertAdmin(request);
    const days = Math.min(90, Math.max(1, request.data?.days ?? 30));
    const filterUserId = request.data?.userId;
    const from = new Date();
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);
    let query = firestore_2.db
        .collection(COLLECTION)
        .where("timestamp", ">=", firestore_1.Timestamp.fromDate(from))
        .orderBy("timestamp", "desc")
        .limit(5000);
    if (filterUserId)
        query = query.where("userId", "==", filterUserId);
    const snapshot = await query.get();
    const docs = snapshot.docs.map((d) => d.data());
    const uniqueUsers = new Set();
    const byCategory = {};
    const byAction = {};
    const byUserMap = {};
    const byHour = {};
    const byDay = {};
    const byResource = {};
    let errors = 0;
    for (const d of docs) {
        uniqueUsers.add(d.userId ?? "");
        if (d.result === "error")
            errors++;
        if (d.category)
            byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
        if (d.action)
            byAction[d.action] = (byAction[d.action] ?? 0) + 1;
        if (d.resource)
            byResource[d.resource] = (byResource[d.resource] ?? 0) + 1;
        if (d.userId) {
            if (!byUserMap[d.userId]) {
                byUserMap[d.userId] = { userName: d.userName ?? "", userEmail: d.userEmail ?? "", count: 0 };
            }
            byUserMap[d.userId].count++;
        }
        const ts = d.timestamp instanceof firestore_1.Timestamp ? d.timestamp : null;
        if (ts) {
            const date = ts.toDate();
            byHour[date.getHours()] = (byHour[date.getHours()] ?? 0) + 1;
            const day = date.toISOString().split("T")[0];
            byDay[day] = (byDay[day] ?? 0) + 1;
        }
    }
    const total = docs.length;
    const metrics = {
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
});
// ── slGetAuditSummary ─────────────────────────────────────────────────────────
exports.slGetAuditSummary = (0, https_1.onCall)({ cors: true }, async (request) => {
    assertAdmin(request);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    const [todaySnap, weekSnap, errorSnap, recentSnap] = await Promise.all([
        firestore_2.db.collection(COLLECTION)
            .where("timestamp", ">=", firestore_1.Timestamp.fromDate(todayStart))
            .count()
            .get(),
        firestore_2.db.collection(COLLECTION)
            .where("timestamp", ">=", firestore_1.Timestamp.fromDate(weekStart))
            .count()
            .get(),
        firestore_2.db.collection(COLLECTION)
            .where("result", "==", "error")
            .where("timestamp", ">=", firestore_1.Timestamp.fromDate(todayStart))
            .count()
            .get(),
        firestore_2.db.collection(COLLECTION)
            .orderBy("timestamp", "desc")
            .limit(10)
            .get(),
    ]);
    const recentEvents = recentSnap.docs.map((doc) => {
        const d = doc.data();
        const ts = d.timestamp instanceof firestore_1.Timestamp ? d.timestamp : null;
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
});
//# sourceMappingURL=audit-callable.js.map