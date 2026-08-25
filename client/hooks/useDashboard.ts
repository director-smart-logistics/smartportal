import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { firestoreApi } from '@/lib/firebase/firestore-client';
import { QUERY_DEFAULTS } from '@/lib/query-defaults';

interface DashboardQuery {
  timeRange?: '7d' | '1m' | '3m' | '6m' | '1y';
  startDate?: string;
  endDate?: string;
  userId?: string;
}

interface CompanyNewsResponse {
  headline: string;
  description: string;
  lastUpdated: string;
  category: string;
}

interface OpenPositionsResponse {
  totalPositions: number;
  positions: string[];
}

interface MonthlyDeliveriesResponse {
  totalDeliveries: number;
  growthPercentage: number;
  successRate: number;
  comparison: string;
}

interface MonthlyGoalResponse {
  progressPercentage: number;
  goalTarget: number;
  currentDeliveries: number;
  remaining: number;
  targetMonth: string;
}

interface DeliveryTrendDataPoint {
  month: string;
  delivered: number;
  pending: number;
  failed: number;
}

interface DeliveryTrendsResponse {
  data: DeliveryTrendDataPoint[];
  totalDeliveries: number;
  averageSuccessRate: number;
}

interface PackageStatusItem {
  name: string;
  value: number;
  percentage: number;
}

interface PackageStatusResponse {
  data: PackageStatusItem[];
  totalPackages: number;
}

// Company News Hook
export function useCompanyNews(
  query: DashboardQuery = {},
  options?: UseQueryOptions<CompanyNewsResponse>
) {
  return useQuery<CompanyNewsResponse>({
    queryKey: ['dashboard', 'company-news', query],
    queryFn: async () => {
      // Placeholder - company news not yet implemented in Firebase Functions
      return {
        headline: 'Welcome to SmartLogistics',
        description: 'Your logistics management platform',
        lastUpdated: new Date().toISOString(),
        category: 'general',
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

// Open Positions Hook
export function useOpenPositions(
  query: DashboardQuery = {},
  options?: UseQueryOptions<OpenPositionsResponse>
) {
  return useQuery<OpenPositionsResponse>({
    queryKey: ['dashboard', 'open-positions', query],
    queryFn: async () => {
      // Placeholder - open positions not yet implemented in Firebase Functions
      return {
        totalPositions: 0,
        positions: [],
      };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

// Monthly Deliveries Hook
export function useMonthlyDeliveries(
  query: DashboardQuery = {},
  options?: UseQueryOptions<MonthlyDeliveriesResponse>
) {
  return useQuery<MonthlyDeliveriesResponse>({
    queryKey: ['dashboard', 'monthly-deliveries', query],
    queryFn: async () => {
      // Get stats directly from Firestore (WebSocket, no HTTP)
      const stats = await firestoreApi.analytics.getDashboardStats();
      return {
        totalDeliveries: stats?.deliveredPackages || 0,
        growthPercentage: 0,
        successRate: stats?.deliveredPackages && stats?.totalPackages 
          ? Math.round((stats.deliveredPackages / stats.totalPackages) * 100) 
          : 0,
        comparison: 'vs last month',
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    ...options,
  });
}

// Monthly Goal Hook
export function useMonthlyGoal(
  query: DashboardQuery = {},
  options?: UseQueryOptions<MonthlyGoalResponse>
) {
  return useQuery<MonthlyGoalResponse>({
    queryKey: ['dashboard', 'monthly-goal', query],
    queryFn: async () => {
      // Get stats directly from Firestore (WebSocket, no HTTP)
      const stats = await firestoreApi.analytics.getDashboardStats();
      const goalTarget = 100; // Default goal
      const currentDeliveries = stats?.deliveredPackages || 0;
      return {
        progressPercentage: Math.min(Math.round((currentDeliveries / goalTarget) * 100), 100),
        goalTarget,
        currentDeliveries,
        remaining: Math.max(goalTarget - currentDeliveries, 0),
        targetMonth: new Date().toLocaleString('default', { month: 'long' }),
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    ...options,
  });
}

// Delivery Trends Hook
export function useDeliveryTrends(
  query: DashboardQuery = { timeRange: '6m' },
  options?: UseQueryOptions<DeliveryTrendsResponse>
) {
  return useQuery<DeliveryTrendsResponse>({
    queryKey: ['dashboard', 'delivery-trends', query],
    queryFn: async () => {
      // Placeholder - delivery trends not yet implemented in Firebase Functions
      return {
        data: [],
        totalDeliveries: 0,
        averageSuccessRate: 0,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    ...options,
  });
}

// Package Status Hook
export function usePackageStatus(
  query: DashboardQuery = { timeRange: '6m' },
  options?: UseQueryOptions<PackageStatusResponse>
) {
  return useQuery<PackageStatusResponse>({
    queryKey: ['dashboard', 'package-status', query],
    queryFn: async () => {
      // Get package status directly from Firestore (WebSocket, no HTTP)
      const statusData = await firestoreApi.analytics.getPackagesByStatus();
      const total = Object.values(statusData).reduce((sum, val) => sum + val, 0);
      const data = Object.entries(statusData).map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
      }));
      return { data, totalPackages: total };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    ...options,
  });
}

// ============ Simple GET Hooks (No body required) ============

// Company News - GET all
export function useCompanyNewsList(options?: UseQueryOptions<CompanyNewsResponse[]>) {
  return useQuery<CompanyNewsResponse[]>({
    queryKey: ['dashboard', 'company-news-list'],
    queryFn: async () => {
      // Placeholder - company news not yet implemented in Firebase Functions
      return [];
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// DEPRECATED: Use useMonthlyDeliveries() instead
// Kept for backward compatibility - will be removed in future version
export function useMonthlyDeliveriesSimple(options?: UseQueryOptions<MonthlyDeliveriesResponse>) {
  return useMonthlyDeliveries({}, options);
}

// DEPRECATED: Use useMonthlyGoal() instead
// Kept for backward compatibility - will be removed in future version
export function useMonthlyGoalSimple(options?: UseQueryOptions<MonthlyGoalResponse>) {
  return useMonthlyGoal({}, options);
}

// DEPRECATED: Use useDeliveryTrends() instead
// Kept for backward compatibility - will be removed in future version
export function useDeliveryTrendsSimple(options?: UseQueryOptions<DeliveryTrendsResponse>) {
  return useDeliveryTrends({ timeRange: '6m' }, options);
}

// DEPRECATED: Use usePackageStatus() instead
// Kept for backward compatibility - will be removed in future version
export function usePackageStatusSimple(options?: UseQueryOptions<PackageStatusResponse>) {
  return usePackageStatus({ timeRange: '6m' }, options);
}

// Open Positions - GET
export function useOpenPositionsList(options?: UseQueryOptions<OpenPositionsResponse>) {
  return useQuery<OpenPositionsResponse>({
    queryKey: ['dashboard', 'open-positions-list'],
    queryFn: async () => {
      // Placeholder - open positions not yet implemented in Firebase Functions
      return { totalPositions: 0, positions: [] };
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

// ============ Mutation Hooks for CRUD Operations ============

interface CreateNewsDto {
  headline: string;
  description: string;
  category?: string;
}

interface UpdateNewsDto {
  headline?: string;
  description?: string;
  category?: string;
}

interface CreateJobDto {
  title: string;
  description?: string;
  department?: string;
}

interface UpdateGoalDto {
  goalTarget: number;
  targetMonth?: string;
}

// Create Company News
export function useCreateCompanyNews() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateNewsDto) => {
      // Placeholder - company news not yet implemented in Firebase Functions
      console.warn('useCreateCompanyNews: Not implemented in Firebase Functions');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'company-news-list'] });
    },
  });
}

// Update Company News
export function useUpdateCompanyNews() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateNewsDto }) => {
      // Placeholder - company news not yet implemented in Firebase Functions
      console.warn('useUpdateCompanyNews: Not implemented in Firebase Functions');
      return { id, ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'company-news-list'] });
    },
  });
}

// Delete Company News
export function useDeleteCompanyNews() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Placeholder - company news not yet implemented in Firebase Functions
      console.warn('useDeleteCompanyNews: Not implemented in Firebase Functions');
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'company-news-list'] });
    },
  });
}

// Create Job Position
export function useCreateJobPosition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateJobDto) => {
      // Placeholder - job positions not yet implemented in Firebase Functions
      console.warn('useCreateJobPosition: Not implemented in Firebase Functions');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'open-positions-list'] });
    },
  });
}

// Delete Job Position
export function useDeleteJobPosition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Placeholder - job positions not yet implemented in Firebase Functions
      console.warn('useDeleteJobPosition: Not implemented in Firebase Functions');
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'open-positions-list'] });
    },
  });
}

// Update Monthly Goal
export function useUpdateMonthlyGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: UpdateGoalDto) => {
      // Placeholder - monthly goal settings not yet implemented in Firebase Functions
      console.warn('useUpdateMonthlyGoal: Not implemented in Firebase Functions');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'monthly-goal-simple'] });
    },
  });
}

// ============ BATCHED DASHBOARD (5+ calls → 1 call) ============

/**
 * Get ALL dashboard data in a single API call
 * This reduces 5+ separate API calls to just 1, dramatically reducing costs
 * and improving performance. Includes: company news, open positions, 
 * monthly deliveries, monthly goal, delivery trends, and package status.
 */
export function useDashboardBatch(query: DashboardQuery = {}) {
  return useQuery({
    queryKey: ['dashboard', 'batch', query.timeRange || '6m'],
    queryFn: async () => {
      // Get all dashboard data directly from Firestore (WebSocket, no HTTP)
      const [stats, statusData] = await Promise.all([
        firestoreApi.analytics.getDashboardStats(),
        firestoreApi.analytics.getPackagesByStatus(),
      ]);

      const total = Object.values(statusData).reduce((sum, val) => sum + val, 0);

      return {
        companyNews: {
          headline: 'Welcome to SmartLogistics',
          description: 'Your logistics management platform',
          lastUpdated: new Date().toISOString(),
          category: 'general',
        },
        openPositions: { totalPositions: 0, positions: [] },
        monthlyDeliveries: {
          totalDeliveries: stats?.deliveredPackages || 0,
          growthPercentage: 0,
          successRate: stats?.deliveredPackages && stats?.totalPackages
            ? Math.round((stats.deliveredPackages / stats.totalPackages) * 100)
            : 0,
          comparison: 'vs last month',
        },
        monthlyGoal: {
          progressPercentage: Math.min(Math.round(((stats?.deliveredPackages || 0) / 100) * 100), 100),
          goalTarget: 100,
          currentDeliveries: stats?.deliveredPackages || 0,
          remaining: Math.max(100 - (stats?.deliveredPackages || 0), 0),
          targetMonth: new Date().toLocaleString('default', { month: 'long' }),
        },
        deliveryTrends: { data: [], totalDeliveries: 0, averageSuccessRate: 0 },
        packageStatus: {
          data: Object.entries(statusData).map(([name, value]) => ({
            name,
            value,
            percentage: total > 0 ? Math.round((value / total) * 100) : 0,
          })),
          totalPackages: total,
        },
      };
    },
    ...QUERY_DEFAULTS,
  });
}
