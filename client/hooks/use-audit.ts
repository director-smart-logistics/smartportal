/**
 * useAudit
 *
 * React hook that provides a `log` helper pre-bound to the current user.
 * Call this once per component; the returned function is stable across renders.
 *
 * Usage:
 *   const { log } = useAudit();
 *   log({ action: 'tracking_search', category: 'tracking', resource: trackingNumber, result: 'success' });
 */

import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { AuthUser } from '@/lib/firebase/auth';
import {
  logAction,
  type AuditEntry,
  type AuditAction,
  type AuditCategory,
  type AuditResult,
} from '@/lib/services/audit-service';

export type { AuditAction, AuditCategory, AuditResult };

export interface UseAuditReturn {
  log: (
    entry: Omit<AuditEntry, 'userId' | 'userName' | 'userEmail' | 'userRole'>
  ) => void;
}

export function useAudit(): UseAuditReturn {
  const { user } = useAuth();

  const log = useCallback(
    (entry: Omit<AuditEntry, 'userId' | 'userName' | 'userEmail' | 'userRole'>) => {
      const u = user as AuthUser | null;
      logAction({
        ...entry,
        userId: u?.id ?? u?.email ?? 'anonymous',
        userName: u?.fullName ?? u?.email ?? '',
        userEmail: u?.email ?? '',
        userRole: u?.role ?? '',
      });
    },
    [user]
  );

  return { log };
}
