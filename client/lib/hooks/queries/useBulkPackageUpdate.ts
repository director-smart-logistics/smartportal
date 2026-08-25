import { useMutation, useQueryClient } from '@tanstack/react-query';
import { firebaseApi } from '@/lib/firebase/callable';

interface BulkUpdatePackageStatusInput {
  packageIds: string[];
  status: 'delivered' | 'failed' | 'in_transit' | 'pending';
  failureReason?: string;
  notes?: string;
}

export function useBulkUpdatePackageStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BulkUpdatePackageStatusInput) => {
      // Update packages using Firebase callable functions
      const updatePromises = input.packageIds.map(packageId =>
        firebaseApi.packages.updateStatus(
          packageId,
          input.status,
          undefined,
          input.notes || input.failureReason
        )
      );

      const results = await Promise.allSettled(updatePromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return { successful, failed, total: input.packageIds.length };
    },
    onSuccess: () => {
      // Invalidate packages queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      queryClient.invalidateQueries({ queryKey: ['packagesByDestination'] });
    },
  });
}

export function useUpdateSinglePackageStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      packageId,
      status,
      failureReason,
      notes,
    }: {
      packageId: string;
      status: 'delivered' | 'failed' | 'in_transit' | 'pending';
      failureReason?: string;
      notes?: string;
    }) => {
      const result = await firebaseApi.packages.updateStatus(
        packageId,
        status,
        undefined,
        notes || failureReason
      );
      if (!result.success || result.error) throw new Error(result.error || 'Failed to update status');
      return result.data;
    },
    onSuccess: () => {
      // Invalidate packages queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      queryClient.invalidateQueries({ queryKey: ['packagesByDestination'] });
    },
  });
}
