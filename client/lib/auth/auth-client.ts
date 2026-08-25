/**
 * better-auth Client Setup
 * Handles authentication with the NestJS backend
 * 
 * NOTE: This client is currently not actively used - the app uses custom fetch calls.
 * Keeping it for potential future use, but it requires an absolute URL.
 */

import { createAuthClient } from 'better-auth/react';

// BetterAuth requires an absolute URL, so we use the full backend URL
// In dev: use direct backend URL (Vite proxy handles /api requests)
// In prod: use VITE_API_URL if set, otherwise construct from current origin
const getBetterAuthBaseURL = () => {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  // If VITE_API_URL is absolute (starts with http), use it directly
  if (apiUrl && (apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
    return apiUrl;
  }
  
  // If VITE_API_URL is relative or not set, construct absolute URL
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

  if (import.meta.env.DEV) {
    return `${origin}/api`;
  }
  
  // In production, construct from current origin
  return `${origin}${apiUrl || '/api'}`;
};

/**
 * Initialize better-auth client
 * Note: Currently not used - app uses custom fetch calls to NestJS
 */
export const authClient = createAuthClient({
  baseURL: getBetterAuthBaseURL(),
  appName: 'Smart Portal',
});

/**
 * Get auth token from localStorage
 * Used for cross-domain authentication via Authorization header
 */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('authToken');
  } catch {
    return null;
  }
}

/**
 * Set auth token in localStorage
 * Used for cross-domain authentication
 */
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem('authToken', token);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get API base URL - uses relative URL in dev (Vite proxy) or absolute from env
 */
function getApiBaseURL(): string {
  return import.meta.env.VITE_API_URL || '/api';
}

/**
 * Clear auth token - call logout endpoint to clear cookie
 */
export async function clearAuthToken(): Promise<void> {
  // Call logout endpoint to clear HttpOnly cookie
  try {
    await fetch(`${getApiBaseURL()}/auth/logout`, {
      method: 'POST',
      credentials: 'include', // ✅ Important: Send cookies
    });
  } catch {
    // Ignore errors (might fail if already logged out)
  }
  
  // ⚠️ Legacy: Clear localStorage if exists (migration cleanup)
  try {
    localStorage.removeItem('authToken');
  } catch {
    // Ignore errors
  }
}

/**
 * Check if user is authenticated
 * Note: With HttpOnly cookies, we can't check token existence client-side
 * This now relies on API calls to /auth/me to verify authentication
 */
export function isAuthenticated(): boolean {
  // ⚠️ Legacy: Check localStorage (will be removed after migration)
  try {
    return !!localStorage.getItem('authToken');
  } catch {
    return false;
  }
  // ✅ New: Authentication status is verified via /auth/me endpoint
  // Cookies are automatically sent, so we rely on server response
}
