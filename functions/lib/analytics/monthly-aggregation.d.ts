export interface AgeGroupRow {
    group: string;
    count: number;
    pct: number;
    packages: number;
    revenue: number;
}
export interface MonthlyAnalyticsData {
    month: string;
    generatedAt: string;
    updatedAt: string;
    totalRevenue: number;
    paidRevenue: number;
    regularPaidRevenue: number;
    permitPaidRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    totalPackages: number;
    totalWeight: number;
    regularPackages: number;
    permitPackages: number;
    regularWeight: number;
    permitWeight: number;
    regularPreAlerts: number;
    permitPreAlerts: number;
    deliveredPackages: number;
    inTransitPackages: number;
    deliveryRate: number;
    avgInvoiceValue: number;
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    overdueInvoices: number;
    activeCustomers: number;
    newCustomersCount: number;
    preAlertsCount: number;
    recentCustomersCount: number;
    legacyCustomersCount: number;
    packagesByStatus: Array<{
        status: string;
        count: number;
        pct: number;
    }>;
    packagesByRoute: Array<{
        route: string;
        count: number;
    }>;
    invoicesByStatus: Array<{
        status: string;
        count: number;
        amount: number;
    }>;
    invoicesByRoute: Array<{
        route: string;
        count: number;
        amount: number;
        paidCount: number;
        paidAmount: number;
        pctPaid: number;
    }>;
    packagesByShipper: Array<{
        name: string;
        count: number;
        pct: number;
    }>;
    packagesByEncomienda: Array<{
        name: string;
        count: number;
        pct: number;
    }>;
    topByRevenue: Array<{
        slCode: string;
        name: string;
        revenue: number;
        count: number;
    }>;
    topByVolume: Array<{
        slCode: string;
        name: string;
        count: number;
    }>;
    revenueTrend: Array<{
        period: string;
        revenue: number;
        regularPaidRevenue?: number;
        permitPaidRevenue?: number;
        packages: number;
        newCustomers: number;
        totalWeight?: number;
        regularPackages?: number;
        permitPackages?: number;
        regularWeight?: number;
        permitWeight?: number;
        regularPreAlerts?: number;
        permitPreAlerts?: number;
        packagesByRoute?: Array<{
            route: string;
            count: number;
        }>;
        packagesByShipper?: Array<{
            name: string;
            count: number;
        }>;
        packagesByEncomienda?: Array<{
            name: string;
            count: number;
        }>;
    }>;
    demographics: {
        totalCustomers: number;
        withBirthDate: number;
        withNationality: number;
        tseDataPct: number;
        avgAge: number | null;
        ageGroups: AgeGroupRow[];
        nationalities: Array<{
            name: string;
            count: number;
            pct: number;
        }>;
        tiers: Array<{
            tier: string;
            label: string;
            count: number;
            pct: number;
        }>;
        statusDist: Array<{
            status: string;
            label: string;
            count: number;
            pct: number;
        }>;
        verifiedPct: number;
        topNationality: string | null;
        topTier: string | null;
    };
}
/**
 * Aggregates monthly analytics data from packages, invoices, customers, and pre-alerts.
 *
 * Performance notes:
 * - Uses field-level selects to minimize Firestore read bandwidth.
 * - Trend months are resolved sequentially (not concurrently) to cap peak memory at ~1×
 *   instead of ~6× when multiple months lack cache.
 * - The full-collection packages scan (formerly used to build a "customersWithPackages" Set)
 *   was removed as dead code — the Set was never consumed downstream.
 *
 * @param month  - Target month in "YYYY-MM" format.
 * @param includeTrend - When true, resolves 6-month trend (current + 5 prior months).
 *                       Set to false for recursive trend sub-calls to avoid infinite recursion.
 */
export declare function aggregateMonthlyData(month: string, includeTrend?: boolean): Promise<MonthlyAnalyticsData>;
//# sourceMappingURL=monthly-aggregation.d.ts.map