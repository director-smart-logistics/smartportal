/**
 * React Query Hooks for Packages API
 * Handles data fetching, caching, and mutations for packages
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Timestamp, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { firestoreApi, searchPackages } from '@/lib/firebase/firestore-client';

/**
 * Pagination metadata from server
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Paginated response from server
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Pagination parameters for queries
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  search?: string;
  destination?: string;
  ruta?: string;
  routeId?: string;
  flagStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  manifestNumber?: string;
  type?: string;
}

/**
 * Query Keys for packages
 */
export const packagesKeys = {
  all: ['packages'] as const,
  lists: () => [...packagesKeys.all, 'list'] as const,
  list: (params?: PaginationParams) => [...packagesKeys.lists(), params] as const,
  details: () => [...packagesKeys.all, 'detail'] as const,
  detail: (id: string) => [...packagesKeys.details(), id] as const,
  tracking: () => [...packagesKeys.all, 'tracking'] as const,
  track: (id: string) => [...packagesKeys.tracking(), id] as const,
};

/**
 * Build query string from pagination params
 */
function buildQueryString(params?: PaginationParams): string {
  if (!params) return '';
  
  const searchParams = new URLSearchParams();
  
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  if (params.destination) searchParams.set('destination', params.destination);
  if (params.routeId) searchParams.set('routeId', params.routeId);
  if (params.flagStatus) searchParams.set('flagStatus', params.flagStatus);
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.manifestNumber) searchParams.set('manifestNumber', params.manifestNumber);
  if (params.type) searchParams.set('type', params.type);
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Fetch packages with pagination support
 * Returns { data, meta } where data is the packages array and meta contains pagination info
 */
export function usePackagesPaginated(params?: PaginationParams, options?: any) {
  return useQuery<PaginatedResponse<any>>({
    queryKey: packagesKeys.list(params),
    queryFn: async () => {
      type Op = '==' | '!=' | '<' | '<=' | '>' | '>=';
      const filters: Array<{ field: string; op: Op; value: unknown }> = [];

      if (params?.status)         filters.push({ field: 'status',         op: '==', value: params.status });
      if (params?.type)           filters.push({ field: 'type',           op: '==', value: params.type });
      if (params?.routeId)        filters.push({ field: 'routeId',        op: '==', value: params.routeId });
      if (params?.destination)    filters.push({ field: 'destination',    op: '==', value: params.destination });
      if (params?.ruta)           filters.push({ field: 'ruta',           op: '==', value: params.ruta });
      if (params?.flagStatus)     filters.push({ field: 'flagStatus',     op: '==', value: params.flagStatus });
      if (params?.manifestNumber) filters.push({ field: 'manifestNumber', op: '==', value: params.manifestNumber });
      if (params?.dateFrom)       filters.push({ field: 'createdAt',      op: '>=', value: Timestamp.fromDate(new Date(params.dateFrom)) });
      if (params?.dateTo)         filters.push({ field: 'createdAt',      op: '<=', value: Timestamp.fromDate(new Date(params.dateTo)) });

      const result = await firestoreApi.packages.list({
        page: params?.page,
        pageSize: params?.limit,
        orderByField: 'createdAt',
        orderDirection: params?.sortOrder || 'desc',
        filters: filters.length ? filters : undefined,
      });
      return {
        data: result.data || [],
        meta: {
          total: result.pagination?.total || 0,
          page: result.pagination?.page || 1,
          limit: result.pagination?.limit || 20,
          totalPages: result.pagination?.totalPages || 1,
          hasNextPage: (result.pagination?.page || 1) < (result.pagination?.totalPages || 1),
          hasPrevPage: (result.pagination?.page || 1) > 1,
        }
      } as PaginatedResponse<any>;
    },
    staleTime: 1000 * 20,
    placeholderData: keepPreviousData,
    ...options,
  });
}

/**
 * Fetch all packages with optional filtering (backward compatible)
 */
export function usePackages(query?: string, options?: any) {
  return useQuery({
    queryKey: packagesKeys.list({ search: query } as PaginationParams),
    queryFn: async () => {
      const result = await firestoreApi.packages.list({});
      return result.data || [];
    },
    staleTime: 1000 * 20,
    ...options,
  });
}

/**
 * Fetch single package by ID
 */
export function usePackage(id: string, options?: any) {
  return useQuery({
    queryKey: packagesKeys.detail(id),
    queryFn: async () => {
      const result = await firestoreApi.packages.get(id);
      if (!result) throw new Error('Package not found');
      return result;
    },
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

/**
 * Fetch packages by customer
 */
export function usePackagesByCustomer(customerId: string, options?: any) {
  return useQuery({
    queryKey: [...packagesKeys.lists(), 'customer', customerId],
    queryFn: async () => {
      const result = await firestoreApi.packages.list({
        filters: [{ field: 'customerId', op: '==', value: customerId }],
      });
      return result.data || [];
    },
    enabled: !!customerId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

/**
 * Fetch packages by route
 */
export function usePackagesByRoute(routeId: string, options?: any) {
  return useQuery({
    queryKey: [...packagesKeys.lists(), 'route', routeId],
    queryFn: async () => {
      const result = await firestoreApi.packages.list({
        filters: [{ field: 'routeId', op: '==', value: routeId }],
      });
      return result.data || [];
    },
    enabled: !!routeId,
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

/**
 * Fetch all packages for a customer for invoice creation.
 * Runs parallel queries by customerId AND slCode (pageSize 1000 each)
 * so that packages linked by either field are all returned.
 * Results are deduplicated by id.
 */
export function usePackagesForInvoice(customerId: string, slCode?: string, options?: any) {
  return useQuery({
    queryKey: [...packagesKeys.lists(), 'invoice', customerId, slCode ?? ''],
    queryFn: async () => {
      const queries: Promise<any[]>[] = [];

      if (customerId) {
        queries.push(
          firestoreApi.packages.list({
            pageSize: 1000,
            filters: [{ field: 'customerId', op: '==', value: customerId }],
          }).then((r) => r.data || [])
        );
      }

      if (slCode) {
        queries.push(
          firestoreApi.packages.list({
            pageSize: 1000,
            filters: [{ field: 'slCode', op: '==', value: slCode }],
          }).then((r) => r.data || [])
        );
      }

      if (queries.length === 0) return [];

      const results = await Promise.all(queries);
      const seen = new Set<string>();
      return results.flat().filter((pkg) => {
        if (seen.has(pkg.id)) return false;
        seen.add(pkg.id);
        return true;
      });
    },
    enabled: !!(customerId || slCode),
    staleTime: 1000 * 60 * 2,
    ...options,
  });
}

/**
 * Fetch package tracking history
 */
export function usePackageTracking(packageId: string, options?: any) {
  return useQuery({
    queryKey: packagesKeys.track(packageId),
    queryFn: async () => {
      const result = await firestoreApi.packages.get(packageId);
      return (result as any)?.trackingHistory || [];
    },
    enabled: !!packageId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    ...options,
  });
}

/**
 * Create new package
 */
export function useCreatePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      return await firestoreApi.packages.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagesKeys.lists() });
    },
  });
}

/**
 * Update existing package
 */
export function useUpdatePackage(packageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      return await firestoreApi.packages.update(packageId, data);
    },
    onMutate: (data: any) => {
      // Optimistically patch the package in every cached list and detail query
      // so the table reflects the change immediately without waiting for Firestore.
      queryClient.setQueriesData({ queryKey: packagesKeys.lists() }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((p: any) => p.id === packageId ? { ...p, ...data } : p);
        }
        if (old?.data && Array.isArray(old.data)) {
          return { ...old, data: old.data.map((p: any) => p.id === packageId ? { ...p, ...data } : p) };
        }
        return old;
      });
      queryClient.setQueryData(packagesKeys.detail(packageId), (old: any) => {
        if (!old) return old;
        return { ...old, ...data };
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagesKeys.detail(packageId) });
      queryClient.invalidateQueries({ queryKey: packagesKeys.lists() });
    },
  });
}

/**
 * Delete package
 */
export function useDeletePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (packageId: string) => {
      return await firestoreApi.packages.delete(packageId);
    },
    onMutate: (packageId: string) => {
      // Optimistically remove from every cached paginated list so the row
      // disappears immediately without waiting for the server round-trip.
      queryClient.setQueriesData({ queryKey: packagesKeys.lists() }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.filter((p: any) => p.id !== packageId);
        if (old?.data && Array.isArray(old.data)) {
          return { ...old, data: old.data.filter((p: any) => p.id !== packageId) };
        }
        return old;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagesKeys.lists() });
    },
  });
}

/**
 * Add tracking entry to package
 */
export function useAddPackageTracking(packageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      // Update package with new status
      return await firestoreApi.packages.update(packageId, { status: data.status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagesKeys.track(packageId) });
    },
  });
}

/**
 * Server-side package search — debounced, never bulk-loads the collection.
 * Uses smart query routing:
 *   - trackingSuffixes array-contains for partial tracking number matches
 *   - searchTokens array-contains for customer name matches
 *   - exact slCode / trackingNumber field lookups
 *   - direct doc ID lookup (Nova stores tracking# as doc ID)
 *
 * Requires backfillPackageSearchTokens() to have been run once on existing data.
 */
export function usePackageSearch(
  rawQuery: string,
  debounceMs = 300,
  maxResults = 50
): { results: any[]; isLoading: boolean; isStale: boolean } {
  const [debouncedQuery, setDebouncedQuery] = useState(rawQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(rawQuery), debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [rawQuery, debounceMs]);

  const isStale = debouncedQuery !== rawQuery;

  const { data, isLoading } = useQuery({
    queryKey: ['packageSearch', debouncedQuery, maxResults],
    queryFn: () => searchPackages(debouncedQuery, maxResults),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 2,
    placeholderData: (prev: any) => prev,
  });

  return {
    results: data ?? [],
    isLoading: isLoading || isStale,
    isStale,
  };
}

/**
 * Bulk update package statuses
 */
export function useBulkUpdatePackageStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { packageIds: string[]; status: string }) => {
      const BATCH_SIZE = 400;
      for (let i = 0; i < data.packageIds.length; i += BATCH_SIZE) {
        const chunk = data.packageIds.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => {
          batch.update(doc(db, 'packages', id), {
            status: data.status,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      return data.packageIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagesKeys.all });
    },
  });
}
