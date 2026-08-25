import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { db } from "../config/firebase";

export const slGetDashboardStats = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const [
      packagesSnapshot,
      customersSnapshot,
      invoicesSnapshot,
      pendingPackagesSnapshot,
      deliveredPackagesSnapshot,
      unpaidInvoicesSnapshot,
    ] = await Promise.all([
      db.collection("packages").count().get(),
      db.collection("customers").where("status", "==", "active").count().get(),
      db.collection("invoices").count().get(),
      db.collection("packages").where("status", "==", "pending").count().get(),
      db.collection("packages").where("status", "==", "delivered").count().get(),
      db.collection("invoices").where("status", "in", ["draft", "sent"]).count().get(),
    ]);

    const paidInvoicesSnapshot = await db.collection("invoices")
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
  }
);

export const slGetPackagesByStatus = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
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

    const counts = await Promise.all(
      statuses.map(async (status) => {
        const snapshot = await db.collection("packages")
          .where("status", "==", status)
          .count()
          .get();
        return { status, count: snapshot.data().count };
      })
    );

    const data = counts.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);

    return { success: true, data };
  }
);

export const slGetInvoicesByStatus = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const statuses = ["draft", "sent", "paid", "overdue", "cancelled"];

    const counts = await Promise.all(
      statuses.map(async (status) => {
        const snapshot = await db.collection("invoices")
          .where("status", "==", status)
          .count()
          .get();
        return { status, count: snapshot.data().count };
      })
    );

    const data = counts.reduce((acc, { status, count }) => {
      acc[status] = count;
      return acc;
    }, {} as Record<string, number>);

    return { success: true, data };
  }
);

export const slGetRecentActivity = onCall(
  { cors: true },
  async (request: CallableRequest<{ limit?: number }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const activityLimit = request.data?.limit || 10;

    const [recentPackages, recentInvoices, recentCustomers] = await Promise.all([
      db.collection("packages")
        .orderBy("createdAt", "desc")
        .limit(activityLimit)
        .get(),
      db.collection("invoices")
        .orderBy("createdAt", "desc")
        .limit(activityLimit)
        .get(),
      db.collection("customers")
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
  }
);

import { aggregateMonthlyData } from "./monthly-aggregation";

export const slGetMonthlyAnalytics = onCall(
  { cors: true, invoker: "public", memory: "1GiB" },
  async (request: CallableRequest<{ month: string }>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const month = request.data?.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpsError("invalid-argument", "Month parameter must be YYYY-MM");
    }

    const docRef = db.collection("monthly_analytics").doc(month);

    // Recalculate every time the page is entered, updating the database record
    try {
      const computed = await aggregateMonthlyData(month);
      await docRef.set(computed);
      return { success: true, data: computed };
    } catch (err: any) {
      console.error(`Error aggregating monthly analytics for ${month}:`, err);
      throw new HttpsError("internal", err.message || "Failed to calculate analytics data");
    }
  }
);

export const slInitializeDashboardCounters = onCall(
  { cors: true },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const [
      packagesCount,
      customersCount,
      invoicesCount,
      deliveredCount,
      pendingCount,
    ] = await Promise.all([
      db.collection("packages").count().get(),
      db.collection("customers").count().get(),
      db.collection("invoices").count().get(),
      db.collection("packages").where("status", "==", "delivered").count().get(),
      db.collection("packages").where("status", "==", "pending").count().get(),
    ]);

    const statuses = ["pending", "in_transit", "delivered", "returned", "cancelled"];
    const statusCounts = await Promise.all(
      statuses.map(async (status) => {
        const snap = await db.collection("packages").where("status", "==", status).count().get();
        return [status, snap.data().count] as const;
      })
    );

    const statusBreakdown: Record<string, number> = {};
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

    await db.collection("metadata").doc("dashboard_counters").set(counters);

    return {
      success: true,
      data: counters,
    };
  }
);


