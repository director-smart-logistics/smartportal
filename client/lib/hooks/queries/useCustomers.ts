/**
 * React Query Hooks for Customers API
 * Uses Direct Firestore SDK (WebSocket connections, no HTTP calls)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { firestoreApi, searchCustomers, type CustomerSearchResult } from '@/lib/firebase/firestore-client';
import { firebaseApi } from '@/lib/firebase/callable';
import type { Customer } from '@/types';

/**
 * Query Keys for customers
 */
export const customersKeys = {
  all: ['customers'] as const,
  lists: () => [...customersKeys.all, 'list'] as const,
  list: (params?: any) => [...customersKeys.lists(), params] as const,
  details: () => [...customersKeys.all, 'detail'] as const,
  detail: (id: string) => [...customersKeys.details(), id] as const,
};

/**
 * Fetch all customers
 */
export function useCustomers(params?: { page?: number; limit?: number; q?: string; status?: string }, options?: any) {
  return useQuery({
    queryKey: customersKeys.list(params),
    queryFn: async () => {
      const filters = params?.status ? [{ field: 'status', op: '==' as const, value: params.status }] : undefined;
      const result = await firestoreApi.customers.list({
        page: params?.page,
        pageSize: params?.limit,
        filters,
      });
      return result;
    },
    staleTime: 0, // always fetch fresh — route data must never be stale
    ...options,
  });
}

/**
 * Fetch single customer
 */
export function useCustomer(id: string, options?: any) {
  return useQuery<Customer>({
    queryKey: customersKeys.detail(id),
    queryFn: async () => {
      const result = await firestoreApi.customers.get(id);
      if (!result) throw new Error('Customer not found');
      return result as Customer;
    },
    enabled: !!id,
    staleTime: 0, // always fetch fresh — route data must never be stale
    ...options,
  });
}

/**
 * Create new customer
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      return await firestoreApi.customers.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
    },
  });
}

/**
 * Update customer
 */
export function useUpdateCustomer(customerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      return await firestoreApi.customers.update(customerId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customersKeys.detail(customerId) });
      queryClient.invalidateQueries({ queryKey: customersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
    },
  });
}

/**
 * Delete customer
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId: string) => {
      return await firestoreApi.customers.delete(customerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
    },
  });
}

/**
 * Server-side customer search — debounced, never bulk-loads the collection.
 * Uses Firestore array-contains on searchTokens + range queries on slCode/email/dni.
 * Requires backfillSearchTokens() to have been run once on existing data.
 *
 * @param rawQuery  — live search string from the input
 * @param debounceMs — debounce delay in ms (default 280)
 * @param maxResults — max Firestore results per fan-out branch (default 50)
 */
export function useCustomerSearch(
  rawQuery: string = '',
  debounceMs = 280,
  maxResults = 50
): { results: CustomerSearchResult[]; isLoading: boolean; isStale: boolean } {
  const safeQuery = rawQuery || '';
  const [debouncedQuery, setDebouncedQuery] = useState(safeQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(safeQuery), debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [safeQuery, debounceMs]);

  const isStale = debouncedQuery !== safeQuery;

  const { data, isLoading } = useQuery({
    queryKey: ['customerSearch', debouncedQuery, maxResults],
    queryFn: () => searchCustomers(debouncedQuery, maxResults),
    enabled: (debouncedQuery || '').trim().length >= 2,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 2,
    placeholderData: (prev) => prev,
  });

  return {
    results: data ?? [],
    isLoading: isLoading || isStale,
    isStale,
  };
}

/**
 * Trigger a manual SP2→SP1 customer sync via Cloud Function (admin only).
 *
 * The `full` parameter can be supplied at call time (per-mutation) so the
 * same hook instance covers both modes:
 *   - full=false (default) → incremental sync (only users whose updatedAt
 *     is newer than the last sync timestamp; fast, ~seconds)
 *   - full=true → full re-sync of every SP2 user (slower, used to repair
 *     all customer docs after a sync-rule change such as the BUG-NAME-FROM-
 *     DISPLAYNAME Rule C fix where the new logic must be re-applied to
 *     historically corrupted fullName fields).
 *
 * The hook-level `full` argument is preserved as a default for backwards
 * compatibility with callers that pass it once at hook-construction time.
 */
export function useSyncCustomers(defaultFull = false) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (full?: boolean) => firebaseApi.customers.sync(full ?? defaultFull),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
    },
  });
}
