import { createContext, useCallback, useEffect, useState } from "react";
import { AuthContextType, User, UserRole } from "@/types";
import { getAuthToken, clearAuthToken } from "@/lib/auth/auth-client";
import { auditService } from "@/lib/services/auditService";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

// Schema to validate /api/auth/me response
const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string().nullable().optional(),
  role: z.string().optional().nullable(),
  createdAt: z.string().nullable().optional(),
});

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
}

// Helper: Fetch profile from NestJS auth endpoint
// NOTE: This is DISABLED when using Firebase Auth. Returns null to skip HTTP calls.
// The app should use FirebaseAuthContext for authentication instead.
async function fetchProfile(): Promise<User | null> {
  // Skip HTTP auth calls - use Firebase Auth instead
  // This prevents ECONNREFUSED errors when the HTTP server is not running
  const useFirebaseAuth = true; // Set to false to enable legacy HTTP auth
  
  if (useFirebaseAuth) {
    return null;
  }
  
  try {
    const legacyToken = getAuthToken();
    const headers: HeadersInit = {};
    
    if (legacyToken) {
      headers['Authorization'] = `Bearer ${legacyToken}`;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/me`, {
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        return null;
      }
      
      const data = await res.json();
      const parsed = UserProfileSchema.safeParse(data);
      if (!parsed.success) return null;
      
      return {
        id: parsed.data.id,
        email: parsed.data.email,
        fullName: parsed.data.fullName || parsed.data.email,
        role: (parsed.data.role || 'AGENT') as UserRole,
        createdAt: parsed.data.createdAt || new Date().toISOString(),
      };
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Initial load: Check localStorage for auth state (no API call)
  useEffect(() => {
    // Check if user was previously authenticated (stored in localStorage)
    const wasAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    
    if (wasAuthenticated) {
      // User was authenticated before - verify session silently in background
      fetchProfile().then(profile => {
        if (profile) {
          setUser(profile);
        } else {
          // Session expired - clear auth state
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('authToken');
        }
        setIsLoading(false);
      }).catch(() => {
        // Session invalid - clear auth state
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('authToken');
        setIsLoading(false);
      });
    } else {
      // User was not authenticated - skip API call
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Clear any previous session data before login
      queryClient.clear();
      
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Invalid credentials');
      }
      const data = await res.json();
      // ✅ Use user data from login response (no need for separate /auth/me call)
      if (!data?.user) {
        throw new Error('Failed to load user data');
      }
      
      // ✅ Store access token for cross-domain authentication
      if (data.accessToken) {
        localStorage.setItem('authToken', data.accessToken);
      }
      
      // ✅ Set authenticated flag in localStorage
      localStorage.setItem('isAuthenticated', 'true');
      
      // Map login response to User type
      const user: User = {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName || data.user.email,
        role: (data.user.role || 'AGENT') as UserRole,
        createdAt: data.user.createdAt || new Date().toISOString(),
      };
      
      setUser(user);
      auditService.logLogin(user.id).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Registration failed');
      }
      const data = await res.json();
      // ✅ Use user data from signup response (no need for separate /auth/me call)
      if (!data?.user) {
        throw new Error('Failed to load user data');
      }
      
      // Map signup response to User type
      const user: User = {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.fullName || data.user.email,
        role: (data.user.role || 'AGENT') as UserRole,
        createdAt: data.user.createdAt || new Date().toISOString(),
      };
      
      setUser(user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (user) {
        auditService.logLogout(user.id).catch(() => {});
      }
      try {
        // ✅ Call logout endpoint to clear HttpOnly cookie
        await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/logout`, {
          method: 'POST',
          // ⚠️ Legacy: Add Authorization header if legacy token exists
          headers: (() => {
            const legacyToken = getAuthToken();
            return legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {};
          })(),
          credentials: 'include', // ✅ CRITICAL: Send cookies
        });
      } catch {}
      
      // ✅ Clear auth token (calls logout endpoint to clear cookie)
      await clearAuthToken();
      
      // Clear all stored data to ensure clean session for next login
      // ⚠️ Note: Don't clear localStorage/sessionStorage completely as it may contain
      // user preferences (theme, language, etc.) - only clear auth-related data
      try {
        localStorage.removeItem('authToken');
        localStorage.removeItem('isAuthenticated');
        // Clear other sensitive data if needed
      } catch {}
      
      // Clear React Query cache to prevent stale data
      queryClient.clear();
      
      setUser(null);
      navigate('/login');
    } finally {
      setIsLoading(false);
    }
  }, [user, navigate, queryClient]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
