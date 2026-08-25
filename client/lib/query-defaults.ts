/**
 * Standardized React Query Configuration
 * 
 * Provides consistent query behavior across the entire application
 * for optimal performance and user experience.
 * 
 * Benefits:
 * - Consistent caching behavior
 * - Reduced unnecessary refetches
 * - Better cache utilization
 * - Lower API call volume
 */

export const QUERY_DEFAULTS = {
  // Cache Configuration
  staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
  gcTime: 10 * 60 * 1000, // 10 minutes - cache garbage collection (formerly cacheTime)
  
  // Refetch Behavior
  refetchOnWindowFocus: false, // Do not refetch all queries on tab switch
  refetchOnMount: true, // Refetch when component mounts
  refetchInterval: false, // Disable automatic polling
  refetchOnReconnect: true, // Refetch when network reconnects
  
  // Retry Configuration
  retry: 1, // Only retry once on failure
  retryDelay: 1000, // 1 second delay between retries
  
  // Network Configuration
  networkMode: 'online' as const, // Only fetch when online
} as const;

/**
 * Query defaults for real-time data that needs more frequent updates
 * Use sparingly - only for truly time-sensitive data
 */
export const REALTIME_QUERY_DEFAULTS = {
  ...QUERY_DEFAULTS,
  staleTime: 30 * 1000, // 30 seconds
  refetchInterval: 60 * 1000, // Refetch every minute (instead of every 5 seconds)
} as const;

/**
 * Query defaults for static/rarely changing data
 * Use for reference data, settings, etc.
 */
export const STATIC_QUERY_DEFAULTS = {
  ...QUERY_DEFAULTS,
  staleTime: 30 * 60 * 1000, // 30 minutes
  gcTime: 60 * 60 * 1000, // 1 hour
  refetchOnWindowFocus: false, // Don't refetch static data
  refetchOnMount: false, // Don't refetch on mount
} as const;

/**
 * Mutation defaults for consistent mutation behavior
 */
export const MUTATION_DEFAULTS = {
  retry: 0, // Don't retry mutations automatically
  networkMode: 'online' as const,
} as const;
