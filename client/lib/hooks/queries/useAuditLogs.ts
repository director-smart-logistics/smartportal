import { useQuery } from '@tanstack/react-query';
import { getAuditLogs, type AuditLogsFilter, type AuditLogDoc } from '@/lib/services/audit-service';

export function useAuditLogs(filters?: AuditLogsFilter) {
  return useQuery<AuditLogDoc[]>({
    queryKey: ['auditLogs', filters],
    queryFn: () => getAuditLogs(filters ?? {}),
    staleTime: 30_000,
  });
}