import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  signInWithGoogle,
  signInWithGoogleRedirect,
  signOut,
  onAuthChange,
  mapFirebaseUserToAuthUser,
  getIdToken,
  getGoogleRedirectResult,
  type AuthUser,
  type FirebaseUser,
} from "../firebase";
import { logAction, flushAuditQueue } from "@/lib/services/audit-service";
import { NotRegisteredScreen } from "@/components/NotRegisteredScreen";
import { firebaseApi } from "@/lib/firebase/callable";

const IS_DEVELOPMENT = import.meta.env.DEV;

interface AuthContextType {
  user: AuthUser | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track whether the backend sync has already been done this page session
  const hasSyncedThisSession = useRef(false);

  // Helper: detect if an error means the user is not authorized
  const isAuthRejectionError = (err: any): boolean => {
    const code: string = err?.code ?? '';
    const msg: string = err?.message ?? '';
    return (
      code === 'functions/permission-denied' ||
      code === 'permission-denied' ||
      code === 'auth/user-token-expired' ||
      msg.includes('no está registrado') ||
      msg.includes('permission-denied') ||
      msg.includes('NOT_REGISTERED')
    );
  };

  // Listen for auth state changes — also emit audit events
  useEffect(() => {
    // Playwright E2E testing hook
    if (typeof window !== "undefined" && (window as any).__playwright_mock_auth__) {
      setUser({
        id: "mock-admin-id",
        email: "admin@smartlogistics.cr",
        fullName: "Test Admin",
        role: "ADMIN",
        permisos: ["all"],
      } as any);
      setFirebaseUser({
        uid: "mock-admin-id",
        email: "admin@smartlogistics.cr",
        displayName: "Test Admin",
        emailVerified: true,
        getIdToken: async () => "mock-token",
      } as any);
      setIsLoading(false);
      return;
    }

    let previousUserId: string | null = null;

    const unsubscribe = onAuthChange(async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Always sync once per page session — slSyncGoogleUser is idempotent:
        // it updates lastLogin for existing users and handles pending_registration
        // cleanup + correct role assignment for newly invited users.
        // This eliminates the race where onUserCreate sets VIEWER before we check hasRole.
        
        let isRejected = false;
        
        if (!hasSyncedThisSession.current) {
          try {
            await firebaseApi.auth.syncGoogleUser();
            await fbUser.getIdToken(true);
            // Only mark as synced on SUCCESS
            hasSyncedThisSession.current = true;
          } catch (syncErr: any) {
            console.warn('[Auth] slSyncGoogleUser failed:', syncErr?.code, syncErr?.message);
            // Firebase callable errors arrive as 'functions/permission-denied'
            if (isAuthRejectionError(syncErr)) {
              setError('REGISTERED_DENIED');
              isRejected = true;
            } else {
              // Transient errors (network, timeout, 500): allow access this session.
              // Firestore security rules are the backend defense for data access.
              // Do NOT deny here — that would break existing users on network blips.
              console.warn('[Auth] Transient sync error, allowing session:', syncErr?.code);
              hasSyncedThisSession.current = true;
            }
          }
        }
        
        // CRITICAL: If rejected, do NOT set user state - this blocks dashboard access
        if (isRejected) {
          console.error('[Auth] USER REJECTED - Signing out. Code may be functions/permission-denied');
          // Force sign out to clear Firebase Auth state
          await signOut().catch(() => {});
          hasSyncedThisSession.current = false;
          setFirebaseUser(null);
          setIsLoading(false);
          return; // Exit early - no user state set
        }
        
        // Only set user if sync succeeded (or already synced)
        const authUser = await mapFirebaseUserToAuthUser(fbUser);
        setUser(authUser);
        
        // Dynamically import and trigger FCM registration to optimize bundle size
        if (typeof window !== "undefined" && !window.location.search.includes("__playwright_mock_auth__")) {
          import("@/lib/firebase/messaging")
            .then(({ requestAndRegisterFCMToken }) => {
              if (authUser.id) {
                requestAndRegisterFCMToken(authUser.id);
              }
            })
            .catch((err) => {
              console.warn("[Auth] Failed to load FCM registration module:", err);
            });
        }

        // Only log login when the user was previously signed out (not on page refresh)
        if (!previousUserId) {
          logAction({
            userId: authUser.id ?? authUser.email ?? 'anonymous',
            userName: authUser.fullName ?? authUser.email ?? '',
            userEmail: authUser.email ?? '',
            userRole: authUser.role ?? '',
            action: 'login',
            category: 'auth',
            resource: 'google_oauth',
            result: 'success',
            metadata: { provider: 'google', emailVerified: fbUser.emailVerified },
          });
        }
        previousUserId = authUser.id ?? authUser.email ?? null;
      } else {
        if (previousUserId) {
          logAction({
            userId: previousUserId,
            action: 'logout',
            category: 'auth',
            resource: 'session',
            result: 'success',
          });
          flushAuditQueue().catch(() => {});
        }
        setUser(null);
        previousUserId = null;
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Use Firebase Auth Popups on both desktop and mobile to bypass modern mobile browser
      // third-party cookie/iframe restrictions which block redirect callback authentication.
      console.log("[Auth] Initiating Google Sign-In Popup flow...");
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      console.error("[loginWithGoogle] Error:", message, err);
      setError(message);
      setIsLoading(false);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await signOut();
      setUser(null);
      setFirebaseUser(null);

      localStorage.removeItem("authToken");
      localStorage.removeItem("isAuthenticated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Logout failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getToken = useCallback(async () => {
    if (typeof window !== "undefined" && (window as any).__playwright_mock_auth__) {
      return "mock-token";
    }
    return getIdToken();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      firebaseUser,
      isLoading,
      isAuthenticated: !!user,
      error,
      loginWithGoogle,
      logout,
      getToken,
      clearError,
    }),
    [user, firebaseUser, isLoading, error, loginWithGoogle, logout, getToken, clearError]
  );

  // Show 403 screen if user was rejected (not registered)
  if (error === 'REGISTERED_DENIED') {
    return <NotRegisteredScreen />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useFirebaseAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useFirebaseAuth must be used within a FirebaseAuthProvider");
  }
  return context;
}

export function useAuth() {
  return useFirebaseAuth();
}
