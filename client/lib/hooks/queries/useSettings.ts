import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { firestoreApi } from '@/lib/firebase/firestore-client';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const result = await firestoreApi.settings.list();
      return { data: result.data };
    },
  });
}

export function useSetting(key?: string) {
  return useQuery({
    enabled: !!key,
    queryKey: ['setting', key],
    queryFn: async () => {
      const result = await firestoreApi.settings.get(key!);
      return { data: result };
    },
  });
}

export function useUpdateSetting(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settingValue: any) => {
      const result = await firestoreApi.settings.update(key, { value: String(settingValue) });
      return { data: result };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['setting', key] });
    }
  });
}

export function useCreateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { settingKey: string; settingValue: any; description?: string; dataType?: string }) => {
      const result = await firestoreApi.settings.create({
        key: payload.settingKey,
        value: String(payload.settingValue),
        type: payload.dataType,
        description: payload.description,
      });
      return { data: result };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] })
  });
}

// Specialized hook to get the app name with fallback
export function useAppName() {
  return useQuery({
    queryKey: ['setting', 'app_name'],
    queryFn: async () => {
      try {
        const result = await firestoreApi.settings.get('app_name');
        return (result as any)?.value || 'FUSELOGISTIC';
      } catch (error) {
        console.warn('Failed to fetch app name, using fallback:', error);
        return 'FUSELOGISTIC';
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}