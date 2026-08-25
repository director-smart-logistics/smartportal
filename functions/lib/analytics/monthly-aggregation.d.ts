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
export declare function aggregateMonthlyData(month: string, includeTrend?: boolean): Promise<MonthlyAnalyticsData>;
//# sourceMappingURL=monthly-aggregation.d.ts.map