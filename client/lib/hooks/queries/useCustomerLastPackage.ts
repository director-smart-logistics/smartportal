import { useQuery } from '@tanstack/react-query';
import { firebaseApi } from '@/lib/firebase/callable';

export interface LastPackageInfo {
  id: string;
  trackingNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  origin: string;
  destination: string;
}

export function useCustomerLastPackage(customerId: string | null) {
  return useQuery<LastPackageInfo | null>({
    queryKey: ['customer-last-package', customerId],
    queryFn: async (): Promise<LastPackageInfo | null> => {
      if (!customerId) return null;
      
      // Search packages by customer ID and get the most recent one
      const result = await firebaseApi.packages.list({ q: customerId, limit: 1 });
      if (!result.success) return null;
      
      const packages = ((result.data as any)?.data || []) as any[];
      if (packages.length === 0) return null;
      
      const pkg = packages[0];
      return {
        id: pkg.id,
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
        origin: pkg.origin || '',
        destination: pkg.destination || '',
      };
    },
    enabled: !!customerId,
    staleTime: 60000, // Cache for 1 minute
  });
}
