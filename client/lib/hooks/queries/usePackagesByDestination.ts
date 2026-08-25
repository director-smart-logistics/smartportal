import { useQuery } from '@tanstack/react-query';
import { firebaseApi } from '@/lib/firebase/callable';

/**
 * Fetch packages by destination for delivery routes
 * @param destination - Destination code or route name (e.g., "CRC", "SAN JOSE")
 * @param options - React Query options
 */
export function usePackagesByDestination(destination: string | null, options?: any) {
  return useQuery({
    queryKey: ['packages-by-destination', destination],
    queryFn: async () => {
      if (!destination) return [];
      // Search packages by destination using Firebase callable functions
      const result = await firebaseApi.packages.list({ q: destination });
      if (!result.success) return [];
      return ((result.data as any)?.data || []);
    },
    enabled: !!destination,
    ...options,
  });
}
