export declare const slGetDashboardStats: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: {
        totalPackages: number;
        totalCustomers: number;
        totalInvoices: number;
        pendingPackages: number;
        deliveredPackages: number;
        unpaidInvoices: number;
        totalRevenue: number;
        currency: string;
    };
}>, unknown>;
export declare const slGetPackagesByStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: Record<string, number>;
}>, unknown>;
export declare const slGetInvoicesByStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: Record<string, number>;
}>, unknown>;
export declare const slGetRecentActivity: import("firebase-functions/v2/https").CallableFunction<{
    limit?: number;
}, Promise<{
    success: boolean;
    data: {
        type: string;
        id: string;
        description: string;
        createdAt: any;
    }[];
}>, unknown>;
export declare const slGetMonthlyAnalytics: import("firebase-functions/v2/https").CallableFunction<{
    month: string;
}, Promise<{
    success: boolean;
    data: import("./monthly-aggregation").MonthlyAnalyticsData;
}>, unknown>;
export declare const slInitializeDashboardCounters: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    data: {
        totalPackages: number;
        totalCustomers: number;
        totalInvoices: number;
        deliveredPackages: number;
        pendingPackages: number;
        statusBreakdown: Record<string, number>;
        lastInitializedAt: string;
    };
}>, unknown>;
//# sourceMappingURL=callable.d.ts.map