import { useQuery, useQueries } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { firebaseApi } from '@/lib/firebase/callable';
import { firestoreApi, listDocuments } from '@/lib/firebase/firestore-client';
import { QUERY_DEFAULTS } from '@/lib/query-defaults';
import { getCountFromServer, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// Types for analytics data
export interface TopMetric {
  value: number;
  change: number;
  positive: boolean;
}

export interface TopMetrics {
  totalRevenue: TopMetric;
  avgOrderValue: TopMetric;
  deliverySuccess: TopMetric;
  profitMargin: TopMetric;
}

export interface RevenueTrendDataPoint {
  period: string;
  revenue: number;
}

export interface DeliveryTrendDataPoint {
  period: string;
  delivered: number;
  failed: number;
  pending: number;
}

export interface RegionalPerformance {
  region: string;
  packages: number;
  revenue: number;
  cost: number;
  margin: string;
}

export interface RegionalDistribution {
  name: string;
  value: number;
  count: number;
}

export interface PerformanceMetric {
  period: string;
  efficiency: number;
  onTime: number;
}

export interface AnalyticsOverview {
  topMetrics: TopMetrics;
  revenueTrend: RevenueTrendDataPoint[];
  deliveryTrend: DeliveryTrendDataPoint[];
  regionalPerformance: RegionalPerformance[];
  regionalDistribution: RegionalDistribution[];
  performanceMetrics: PerformanceMetric[];
  generatedAt: string;
  timeRange: string;
}

/**
 * Hook to fetch comprehensive analytics dashboard overview
 * @param timeRange Time range for analytics (7d, 1m, 3m, 6m, 1y)
 * @param options Query options including refetchInterval for real-time updates
 */
export function useAnalyticsOverview(
  timeRange: string = '6m',
  options?: {
    enabled?: boolean;
    refetchInterval?: number; // in milliseconds
  }
) {
  return useQuery<AnalyticsOverview>({
    queryKey: ['analytics', 'overview', timeRange],
    queryFn: async () => {
      // Get dashboard stats from Firebase callable functions
      const result = await firebaseApi.analytics.getDashboardStats();
      if (!result.success || result.error) throw new Error(result.error || 'Failed to fetch analytics');
      return result.data as AnalyticsOverview;
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

/**
 * Hook to fetch top-level KPI metrics
 */
export function useTopMetrics(
  timeRange: string = '6m',
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<TopMetrics>({
    queryKey: ['analytics', 'metrics', timeRange],
    queryFn: async () => {
      const result = await firebaseApi.analytics.getDashboardStats();
      if (!result.success || result.error) throw new Error(result.error || 'Failed to fetch metrics');
      // Map dashboard stats to TopMetrics format
      const stats = result.data as any;
      return {
        totalRevenue: { value: stats?.totalRevenue || 0, change: 0, positive: true },
        avgOrderValue: { value: 0, change: 0, positive: true },
        deliverySuccess: { value: stats?.deliveredPackages || 0, change: 0, positive: true },
        profitMargin: { value: 0, change: 0, positive: true },
      } as TopMetrics;
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

/**
 * Hook to fetch revenue trend over time
 */
export function useRevenueTrend(
  timeRange: string = '6m',
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<RevenueTrendDataPoint[]>({
    queryKey: ['analytics', 'revenue-trend', timeRange],
    queryFn: async () => {
      // Revenue trend data would need a dedicated function - return empty for now
      return [] as RevenueTrendDataPoint[];
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

/**
 * Hook to fetch delivery performance trend
 */
export function useDeliveryTrend(
  timeRange: string = '7d',
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<DeliveryTrendDataPoint[]>({
    queryKey: ['analytics', 'delivery-trend', timeRange],
    queryFn: async () => {
      // Delivery trend data would need a dedicated function - return empty for now
      return [] as DeliveryTrendDataPoint[];
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

/**
 * Hook to fetch regional performance breakdown
 */
export function useRegionalPerformance(
  timeRange: string = '6m',
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<RegionalPerformance[]>({
    queryKey: ['analytics', 'regional-performance', timeRange],
    queryFn: async () => {
      // Regional performance data would need a dedicated function - return empty for now
      return [] as RegionalPerformance[];
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

/**
 * Hook to fetch regional distribution for pie chart
 */
export function useRegionalDistribution(
  timeRange: string = '6m',
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<RegionalDistribution[]>({
    queryKey: ['analytics', 'regional-distribution', timeRange],
    queryFn: async () => {
      // Regional distribution data would need a dedicated function - return empty for now
      return [] as RegionalDistribution[];
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

/**
 * Hook to fetch operational efficiency metrics
 */
export function usePerformanceMetrics(
  timeRange: string = '6m',
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  return useQuery<PerformanceMetric[]>({
    queryKey: ['analytics', 'performance-metrics', timeRange],
    queryFn: async () => {
      return [] as PerformanceMetric[];
    },
    ...QUERY_DEFAULTS,
    refetchInterval: options?.refetchInterval || false,
    enabled: options?.enabled !== false,
  });
}

// ─── Courier Analytics (real Firestore data) ─────────────────────────────────

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
  packagesByStatus: Array<{ status: string; count: number; pct: number }>;
  packagesByRoute: Array<{ route: string; count: number }>;
  invoicesByStatus: Array<{ status: string; count: number; amount: number }>;
  invoicesByRoute: Array<{ route: string; count: number; amount: number; paidCount: number; paidAmount: number; pctPaid: number }>;
  packagesByShipper: Array<{ name: string; count: number; pct: number }>;
  packagesByEncomienda: Array<{ name: string; count: number; pct: number }>;
  topByRevenue: Array<{ slCode: string; name: string; revenue: number; count: number }>;
  topByVolume: Array<{ slCode: string; name: string; count: number }>;
  revenueTrend?: Array<{
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
    packagesByRoute?: Array<{ route: string; count: number }>;
    packagesByShipper?: Array<{ name: string; count: number }>;
    packagesByEncomienda?: Array<{ name: string; count: number }>;
  }>;
  demographics: {
    totalCustomers: number;
    withBirthDate: number;
    withNationality: number;
    tseDataPct: number;
    avgAge: number | null;
    ageGroups: AgeGroupRow[];
    nationalities: Array<{ name: string; count: number; pct: number }>;
    tiers: Array<{ tier: string; label: string; count: number; pct: number }>;
    statusDist: Array<{ status: string; label: string; count: number; pct: number }>;
    verifiedPct: number;
    topNationality: string | null;
    topTier: string | null;
  };
}

export interface CourierMetrics extends MonthlyAnalyticsData {
  revenueMoM: number | null;
  packagesMoM: number | null;
  newCustomersMoM: number | null;
  preAlertsMoM: number | null;
  weightMoM: number | null;
  shipperMoM: Array<{ name: string; currentCount: number; prevCount: number; change: number | null }>;
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
    packagesByRoute?: Array<{ route: string; count: number }>;
    packagesByShipper?: Array<{ name: string; count: number }>;
    packagesByEncomienda?: Array<{ name: string; count: number }>;
  }>;

  // Enriched isolated executive fields
  execNewCustomersCount: number;
  execPrevNewCustomersCount: number;
  execNewCustomersMoM: number | null;
  execPaidRevenue: number;
  execPrevPaidRevenue: number;
  execRegularPaidRevenue: number;
  execPrevRegularPaidRevenue: number;
  execPermitPaidRevenue: number;
  execPrevPermitPaidRevenue: number;
  execPendingRevenue: number;
  execOverdueRevenue: number;
  execTotalRevenue: number;
  execPaidInvoices: number;
  execPendingInvoices: number;
  execOverdueInvoices: number;
  execTotalInvoices: number;
  execCollectionRate: number;
  execOverdueRate: number;
  execTotalPackages: number;
  execPrevTotalPackages: number;
  execRegularPackages: number;
  execPrevRegularPackages: number;
  execPermitPackages: number;
  execPrevPermitPackages: number;
  execTotalWeight: number;
  execPrevTotalWeight: number;
  execRegularWeight: number;
  execPrevRegularWeight: number;
  execPermitWeight: number;
  execPrevPermitWeight: number;
  execWeightMoM: number | null;
  execPreAlertsCount: number;
  execPrevPreAlertsCount: number;
  execRegularPreAlerts: number;
  execPrevRegularPreAlerts: number;
  execPermitPreAlerts: number;
  execPrevPermitPreAlerts: number;
  execPreAlertsMoM: number | null;
  execPackagesByShipper: Array<{ name: string; count: number; pct: number }>;
  execPackagesByEncomienda: Array<{ name: string; count: number; pct: number }>;
  execShipperMoM: Array<{ name: string; currentCount: number; prevCount: number; change: number | null }>;
  execInvoicesByRoute: Array<{ route: string; count: number; amount: number; paidCount: number; paidAmount: number; pctPaid: number }>;
  execPrevInvoicesByRoute: Array<{ route: string; count: number; amount: number; paidCount: number; paidAmount: number; pctPaid: number }>;
}

export function useMonthlyAnalytics(
  month: string,
  options?: { enabled?: boolean }
) {
  return useQuery<MonthlyAnalyticsData>({
    queryKey: ['monthly-analytics', month],
    enabled: options?.enabled !== false && !!month && /^\d{4}-\d{2}$/.test(month),
    queryFn: async () => {
      const result = await firebaseApi.analytics.getMonthlyAnalytics(month);
      if (!result.success || !result.data) {
        throw new Error(result.error || `Failed to fetch analytics for ${month}`);
      }
      return result.data as MonthlyAnalyticsData;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCourierAnalytics(
  monthA: string,
  monthB: string,
  options?: {
    enabled?: boolean;
  }
) {
  // Fetch Month A
  const queryA = useQuery<MonthlyAnalyticsData>({
    queryKey: ['monthly-analytics-comp', monthA],
    enabled: options?.enabled !== false && !!monthA && /^\d{4}-\d{2}$/.test(monthA),
    queryFn: async () => {
      const result = await firebaseApi.analytics.getMonthlyAnalytics(monthA);
      if (!result.success || !result.data) {
        throw new Error(result.error || `Failed to fetch analytics for ${monthA}`);
      }
      return result.data as MonthlyAnalyticsData;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch Month B
  const queryB = useQuery<MonthlyAnalyticsData>({
    queryKey: ['monthly-analytics-comp', monthB],
    enabled: options?.enabled !== false && !!monthB && /^\d{4}-\d{2}$/.test(monthB),
    queryFn: async () => {
      const result = await firebaseApi.analytics.getMonthlyAnalytics(monthB);
      if (!result.success || !result.data) {
        throw new Error(result.error || `Failed to fetch analytics for ${monthB}`);
      }
      return result.data as MonthlyAnalyticsData;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isFetching = queryA.isFetching || queryB.isFetching;
  const isLoading = queryA.isLoading || queryB.isLoading;
  const error = queryA.error || queryB.error;

  const refetch = useCallback(() => {
    queryA.refetch();
    queryB.refetch();
  }, [queryA, queryB]);

  const dataA = queryA.data;
  const dataB = queryB.data;

  let metrics: CourierMetrics | undefined = undefined;

  if (dataA) {
    const paidRevenue = dataA.paidRevenue;
    const prevPaidRevenue = dataB?.paidRevenue ?? 0;
    const revenueMoM = prevPaidRevenue > 0 ? Math.round(((paidRevenue - prevPaidRevenue) / prevPaidRevenue) * 1000) / 10 : null;

    const totalPackages = dataA.totalPackages;
    const prevTotalPackages = dataB?.totalPackages ?? 0;
    const packagesMoM = prevTotalPackages > 0 ? Math.round(((totalPackages - prevTotalPackages) / prevTotalPackages) * 100) / 10 : null;

    const totalWeight = dataA.totalWeight ?? 0;
    const prevTotalWeight = dataB?.totalWeight ?? 0;
    const weightMoM = prevTotalWeight > 0 ? Math.round(((totalWeight - prevTotalWeight) / prevTotalWeight) * 1000) / 10 : null;

    const newCustomersCount = dataA.newCustomersCount;
    const prevNewCustomersCount = dataB?.newCustomersCount ?? 0;
    const newCustomersMoM = prevNewCustomersCount > 0 ? Math.round(((newCustomersCount - prevNewCustomersCount) / prevNewCustomersCount) * 1000) / 10 : null;

    const preAlertsCount = dataA.preAlertsCount;
    const prevPreAlertsCount = dataB?.preAlertsCount ?? 0;
    const preAlertsMoM = prevPreAlertsCount > 0 ? Math.round(((preAlertsCount - prevPreAlertsCount) / prevPreAlertsCount) * 1000) / 10 : null;

    // shipperMoM comparison (Logistics Couriers: Amazon, SPX, DHL, USPS, UPS, FedEx, Shein, Temu, LaserShip, Otros)
    const courierNames = ['Amazon', 'SPX', 'DHL', 'USPS', 'UPS', 'FedEx', 'Shein', 'Temu', 'LaserShip', 'Otros'];
    const shipperMoM = courierNames.map(name => {
      const cur = dataA.packagesByShipper.find(s => s.name === name)?.count ?? 0;
      const prev = dataB?.packagesByShipper.find(s => s.name === name)?.count ?? 0;
      const change = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
      return { name, currentCount: cur, prevCount: prev, change };
    }).sort((a, b) => b.currentCount - a.currentCount);

    metrics = {
      ...dataA,
      revenueMoM,
      packagesMoM,
      newCustomersMoM,
      preAlertsMoM,
      weightMoM,
      shipperMoM,
      revenueTrend: dataA.revenueTrend || [],

      // Enriched isolated executive fields
      execNewCustomersCount: newCustomersCount,
      execPrevNewCustomersCount: prevNewCustomersCount,
      execNewCustomersMoM: newCustomersMoM,
      execPaidRevenue: paidRevenue,
      execPrevPaidRevenue: prevPaidRevenue,
      execRegularPaidRevenue: dataA.regularPaidRevenue ?? 0,
      execPrevRegularPaidRevenue: dataB?.regularPaidRevenue ?? 0,
      execPermitPaidRevenue: dataA.permitPaidRevenue ?? 0,
      execPrevPermitPaidRevenue: dataB?.permitPaidRevenue ?? 0,
      execPendingRevenue: dataA.pendingRevenue,
      execOverdueRevenue: dataA.overdueRevenue,
      execTotalRevenue: dataA.totalRevenue,
      execPaidInvoices: dataA.paidInvoices,
      execPendingInvoices: dataA.pendingInvoices,
      execOverdueInvoices: dataA.overdueInvoices,
      execTotalInvoices: dataA.totalInvoices,
      execCollectionRate: dataA.totalRevenue > 0 ? Math.round((paidRevenue / dataA.totalRevenue) * 100) : 0,
      execOverdueRate: dataA.totalRevenue > 0 ? Math.round((dataA.overdueRevenue / dataA.totalRevenue) * 100) : 0,
      execTotalPackages: totalPackages,
      execPrevTotalPackages: prevTotalPackages,
      execRegularPackages: dataA.regularPackages ?? 0,
      execPrevRegularPackages: dataB?.regularPackages ?? 0,
      execPermitPackages: dataA.permitPackages ?? 0,
      execPrevPermitPackages: dataB?.permitPackages ?? 0,
      execTotalWeight: totalWeight,
      execPrevTotalWeight: prevTotalWeight,
      execRegularWeight: dataA.regularWeight ?? 0,
      execPrevRegularWeight: dataB?.regularWeight ?? 0,
      execPermitWeight: dataA.permitWeight ?? 0,
      execPrevPermitWeight: dataB?.permitWeight ?? 0,
      execWeightMoM: weightMoM,
      execPreAlertsCount: preAlertsCount,
      execPrevPreAlertsCount: prevPreAlertsCount,
      execRegularPreAlerts: dataA.regularPreAlerts ?? 0,
      execPrevRegularPreAlerts: dataB?.regularPreAlerts ?? 0,
      execPermitPreAlerts: dataA.permitPreAlerts ?? 0,
      execPrevPermitPreAlerts: dataB?.permitPreAlerts ?? 0,
      execPreAlertsMoM: preAlertsMoM,
      execPackagesByShipper: dataA.packagesByShipper,
      execPackagesByEncomienda: dataA.packagesByEncomienda || [],
      execShipperMoM: shipperMoM,
      execInvoicesByRoute: dataA.invoicesByRoute || [],
      execPrevInvoicesByRoute: dataB?.invoicesByRoute || [],
    };
  }

  return {
    data: metrics,
    isLoading,
    error,
    refetch,
    isFetching,
  };
}

// ─── AI Insights (Gemini) ─────────────────────────────────────────────────────

export interface AIInsights {
  revenueInsights: string[];
  operationalInsights: string[];
  marketingOpportunities: string[];
  newServiceOpportunities: string[];
  strategicPriorities: string[];
  summary: string;
}

export function useAIInsights() {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (metrics: CourierMetrics) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) { setError('El Asistente de Inteligencia Financiera está temporalmente inactivo.'); return; }
    setIsLoading(true);
    setError(null);

    // Build compact context — no decoration, just the numbers Gemini needs
    const totalRev     = metrics.paidRevenue + metrics.pendingRevenue + metrics.overdueRevenue;
    const collectionRate = totalRev > 0 ? Math.round((metrics.paidRevenue / totalRev) * 100) : 0;
    const overdueRate  = totalRev > 0 ? Math.round((metrics.overdueRevenue / totalRev) * 100) : 0;
    const topRoute     = metrics.packagesByRoute[0]?.route ?? 'N/A';
    const topCust      = metrics.topByRevenue[0] ? `${metrics.topByRevenue[0].name || metrics.topByRevenue[0].slCode} ($${metrics.topByRevenue[0].revenue.toFixed(0)})` : 'N/A';
    const concentration = metrics.topByRevenue.length > 0
      ? Math.round((metrics.topByRevenue.slice(0, 3).reduce((s, c) => s + c.revenue, 0) / (metrics.paidRevenue || 1)) * 100)
      : 0;

    const prompt = `Eres un CFO y COO experto en operaciones de courier en Costa Rica / Latinoamérica.
Analiza los siguientes datos REALES de la empresa y genera recomendaciones accionables y específicas.

=== DATOS DEL PERÍODO ===
Ingresos cobrados: $${metrics.paidRevenue.toFixed(0)} USD | Tasa de cobro: ${collectionRate}%
Ingresos pendientes: $${metrics.pendingRevenue.toFixed(0)} USD | Cartera vencida: $${metrics.overdueRevenue.toFixed(0)} USD (${overdueRate}% del total)
Crecimiento MoM ingresos: ${metrics.revenueMoM !== null ? (metrics.revenueMoM > 0 ? '+' : '') + metrics.revenueMoM + '%' : 'sin período anterior'}
Valor promedio factura pagada: $${metrics.avgInvoiceValue} USD

Paquetes en período: ${metrics.totalPackages} | Entregados: ${metrics.deliveredPackages} (${metrics.deliveryRate}%) | En tránsito: ${metrics.inTransitPackages}
Crecimiento MoM paquetes: ${metrics.packagesMoM !== null ? (metrics.packagesMoM > 0 ? '+' : '') + metrics.packagesMoM + '%' : 'sin período anterior'}

Clientes activos: ${metrics.activeCustomers} | Top cliente: ${topCust} | Concentración top-3: ${concentration}% de ingresos
Ruta principal: ${topRoute} (${metrics.packagesByRoute[0]?.count ?? 0} paquetes)
Rutas activas: ${metrics.packagesByRoute.slice(0, 5).map(r => `${r.route}:${r.count}`).join(', ')}

Estados paquetes: ${metrics.packagesByStatus.slice(0, 6).map(s => `${s.status}:${s.count}(${s.pct}%)`).join(', ')}
Facturas: ${metrics.paidInvoices} pagadas / ${metrics.pendingInvoices} pendientes / ${metrics.overdueInvoices} vencidas

Genera exactamente este JSON con insights concretos y específicos a estos números (NO genéricos):
{
  "summary": "2-3 oraciones ejecutivas con los hallazgos más críticos y una acción inmediata",
  "revenueInsights": ["hallazgo financiero concreto con número 1","hallazgo 2","acción de cobro inmediata con número"],
  "operationalInsights": ["hallazgo operacional con datos 1","hallazgo 2","mejora específica con métrica"],
  "marketingOpportunities": ["oportunidad de mercadeo específica 1","oportunidad 2","campaña concreta con segmento"],
  "newServiceOpportunities": ["nuevo servicio con mercado potencial 1","nuevo servicio 2"],
  "strategicPriorities": ["prioridad #1 con métrica objetivo","prioridad #2","prioridad #3"]
}`;

    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (!response.ok) {
        throw new Error('El Asistente de Inteligencia Financiera está temporalmente inactivo. Por favor, intenta de nuevo más tarde.');
      }
      const data = await response.json();
      // When responseMimeType is application/json Gemini returns clean JSON directly
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      setInsights(JSON.parse(cleaned) as AIInsights);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('Inact') ? err.message : 'El Asistente de Inteligencia Financiera está temporalmente inactivo. Por favor, intenta de nuevo más tarde.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { insights, isLoading, error, generate };
}



