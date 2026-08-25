"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slInitializeDashboardCounters = exports.slGetMonthlyAnalytics = exports.slGetRecentActivity = exports.slGetInvoicesByStatus = exports.slGetPackagesByStatus = exports.slGetDashboardStats = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_1 = require("../config/firebase");
exports.slGetDashboardStats = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const [packagesSnapshot, customersSnapshot, invoicesSnapshot, pendingPackagesSnapshot, deliveredPackagesSnapshot, unpaidInvoicesSnapshot,] = await Promise.all([
        firebase_1.db.collection("packages").count().get(),
        firebase_1.db.collection("customers").where("status", "==", "active").count().get(),
        firebase_1.db.collection("invoices").count().get(),
        firebase_1.db.collection("packages").where("status", "==", "pending").count().get(),
        firebase_1.db.collection("packages").where("status", "==", "delivered").count().get(),
        firebase_1.db.collection("invoices").where("status", "in", ["draft", "sent"]).count().get(),
    ]);
    const paidInvoicesSnapshot = await firebase_1.db.collection("invoices")
        .where("status", "==", "paid")
        .get();
    let totalRevenue = 0;
    paidInvoicesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalRevenue += data.totalAmount || 0;
    });
    return {
        success: true,
        data: {
            totalPackages: packagesSnapshot.data().count,
            totalCustomers: customersSnapshot.data().count,
            totalInvoices: invoicesSnapshot.data().count,
            pendingPackages: pendingPackagesSnapshot.data().count,
            deliveredPackages: deliveredPackagesSnapshot.data().count,
            unpaidInvoices: unpaidInvoicesSnapshot.data().count,
            totalRevenue,
            currency: "USD",
        },
    };
});
exports.slGetPackagesByStatus = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const statuses = [
        "pending",
        "in_transit",
        "in_warehouse",
        "ready_for_delivery",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
    ];
    const counts = await Promise.all(statuses.map(async (status) => {
        const snapshot = await firebase_1.db.collection("packages")
            .where("status", "==", status)
            .count()
            .get();
        return { status, count: snapshot.data().count };
    }));
    const data = counts.reduce((acc, { status, count }) => {
        acc[status] = count;
        return acc;
    }, {});
    return { success: true, data };
});
exports.slGetInvoicesByStatus = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const statuses = ["draft", "sent", "paid", "overdue", "cancelled"];
    const counts = await Promise.all(statuses.map(async (status) => {
        const snapshot = await firebase_1.db.collection("invoices")
            .where("status", "==", status)
            .count()
            .get();
        return { status, count: snapshot.data().count };
    }));
    const data = counts.reduce((acc, { status, count }) => {
        acc[status] = count;
        return acc;
    }, {});
    return { success: true, data };
});
exports.slGetRecentActivity = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const activityLimit = request.data?.limit || 10;
    const [recentPackages, recentInvoices, recentCustomers] = await Promise.all([
        firebase_1.db.collection("packages")
            .orderBy("createdAt", "desc")
            .limit(activityLimit)
            .get(),
        firebase_1.db.collection("invoices")
            .orderBy("createdAt", "desc")
            .limit(activityLimit)
            .get(),
        firebase_1.db.collection("customers")
            .orderBy("createdAt", "desc")
            .limit(activityLimit)
            .get(),
    ]);
    const activity = [
        ...recentPackages.docs.map((doc) => {
            const data = doc.data();
            return {
                type: "package",
                id: doc.id,
                description: `Package ${data.trackingNumber} - ${data.status}`,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            };
        }),
        ...recentInvoices.docs.map((doc) => {
            const data = doc.data();
            return {
                type: "invoice",
                id: doc.id,
                description: `Invoice ${data.invoiceNumber} - ${data.status}`,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            };
        }),
        ...recentCustomers.docs.map((doc) => {
            const data = doc.data();
            return {
                type: "customer",
                id: doc.id,
                description: `Customer ${data.fullName} registered`,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            };
        }),
    ].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    }).slice(0, activityLimit);
    return { success: true, data: activity };
});
const monthly_aggregation_1 = require("./monthly-aggregation");
exports.slGetMonthlyAnalytics = (0, https_1.onCall)({ cors: true, invoker: "public", memory: "1GiB" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const month = request.data?.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        throw new https_1.HttpsError("invalid-argument", "Month parameter must be YYYY-MM");
    }
    const docRef = firebase_1.db.collection("monthly_analytics").doc(month);
    // Recalculate every time the page is entered, updating the database record
    try {
        const computed = await (0, monthly_aggregation_1.aggregateMonthlyData)(month);
        await docRef.set(computed);
        return { success: true, data: computed };
    }
    catch (err) {
        console.error(`Error aggregating monthly analytics for ${month}:`, err);
        throw new https_1.HttpsError("internal", err.message || "Failed to calculate analytics data");
    }
});
exports.slInitializeDashboardCounters = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const [packagesCount, customersCount, invoicesCount, deliveredCount, pendingCount,] = await Promise.all([
        firebase_1.db.collection("packages").count().get(),
        firebase_1.db.collection("customers").count().get(),
        firebase_1.db.collection("invoices").count().get(),
        firebase_1.db.collection("packages").where("status", "==", "delivered").count().get(),
        firebase_1.db.collection("packages").where("status", "==", "pending").count().get(),
    ]);
    const statuses = ["pending", "in_transit", "delivered", "returned", "cancelled"];
    const statusCounts = await Promise.all(statuses.map(async (status) => {
        const snap = await firebase_1.db.collection("packages").where("status", "==", status).count().get();
        return [status, snap.data().count];
    }));
    const statusBreakdown = {};
    for (const [status, count] of statusCounts) {
        statusBreakdown[status] = count;
    }
    const counters = {
        totalPackages: packagesCount.data().count,
        totalCustomers: customersCount.data().count,
        totalInvoices: invoicesCount.data().count,
        deliveredPackages: deliveredCount.data().count,
        pendingPackages: pendingCount.data().count,
        statusBreakdown,
        lastInitializedAt: new Date().toISOString(),
    };
    await firebase_1.db.collection("metadata").doc("dashboard_counters").set(counters);
    return {
        success: true,
        data: counters,
    };
});
//# sourceMappingURL=callable.js.map