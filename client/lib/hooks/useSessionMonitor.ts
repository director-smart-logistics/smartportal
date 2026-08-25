import { useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

/**
 * Monitor user session and automatically logout if token expires or becomes invalid.
 * Uses Firebase Auth token refresh — no HTTP /api/auth/me endpoint needed.
 */
export function useSessionMonitor() {
  const { logout, isAuthenticated } = useAuth();

  const checkSession = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const firebaseAuth = getAuth(app);
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        console.warn('[SessionMonitor] No Firebase user — logging out');
        await logout().catch(() => {});
        return;
      }
      // Use cached token if valid (expires in 1hr), refresh only if expired
      await currentUser.getIdToken(false);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // Only logout on explicit terminal auth errors, ignoring transient network failures (like auth/network-request-failed)
      const terminalAuthErrors = [
        'auth/user-token-expired',
        'auth/user-not-found',
        'auth/user-disabled',
        'auth/invalid-user-token'
      ];
      if (code && terminalAuthErrors.includes(code)) {
        console.warn('[SessionMonitor] Firebase session invalid, logging out:', code);
        await logout().catch(() => {});
      }
    }
  }, [isAuthenticated, logout]);

  // Check session every 5 minutes
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      checkSession();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, checkSession]);

  // Check session on visibility change (when user returns to tab)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, checkSession]);

  return { checkSession };
}
