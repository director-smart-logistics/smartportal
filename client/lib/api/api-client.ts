/**
 * API Client for Firebase Functions Backend
 * Handles all HTTP requests to the backend API with Firebase Auth token injection
 */

import { getIdToken, signOut } from '@/lib/firebase/auth';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000');

interface RequestOptions extends RequestInit {
  timeout?: number;
  suppressAuthRedirect?: boolean;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
}

/**
 * Make HTTP request with automatic Firebase Auth token injection
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = `${API_URL}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Get Firebase Auth token
  const token = await getIdToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || API_TIMEOUT,
  );

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // ✅ CRITICAL: Send/receive cookies
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Parse response
    const isJson = response.headers
      .get('content-type')
      ?.includes('application/json');
    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      // Handle specific status codes
      if (response.status === 401) {
        // Allow callers to suppress global redirect (e.g., background settings load)
        if (!options.suppressAuthRedirect) {
          // Sign out from Firebase Auth
          await signOut();
          window.location.href = '/login';
        }
        return { error: 'Session expired. Please login again.' };
      }

      if (response.status === 403) {
        return { error: 'You do not have permission to access this resource.' };
      }

      if (response.status === 404) {
        return { error: 'Resource not found.' };
      }

      return {
        error: body.message || body.error || 'Request failed',
        statusCode: response.status,
      };
    }

    return { data: body };
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof DOMException && error.name === 'AbortError') {
      return { error: 'Request timeout. Please try again.' };
    }

    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      return { error: 'Network error. Please check your connection.' };
    }

    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * HTTP method helpers
 */
const methods = {
  GET: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  POST: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  PATCH: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  PUT: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  DELETE: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};

/**
 * API Client - Organized by resource
 */
export const apiClient = {
  // Raw methods (backwards compatibility for hooks calling apiClient.get/post/...)
  get: <T>(endpoint: string, options?: RequestOptions) => methods.GET<T>(endpoint, options),
  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) => methods.POST<T>(endpoint, body, options),
  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) => methods.PATCH<T>(endpoint, body, options),
  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) => methods.PUT<T>(endpoint, body, options),
  delete: <T>(endpoint: string, options?: RequestOptions) => methods.DELETE<T>(endpoint, options),
  // ============================================
  // Authentication
  // ============================================
  auth: {
    login: (email: string, password: string) =>
      methods.POST('/auth/login', { email, password }),

    signup: (email: string, password: string, fullName: string) =>
      methods.POST('/auth/signup', { email, password, fullName }),

    logout: () => methods.POST('/auth/logout'),

    refresh: (refreshToken: string) =>
      methods.POST('/auth/refresh', { refreshToken }),

    getMe: () => methods.GET('/auth/me'),
  },

  // ============================================
  // Packages
  // ============================================
  packages: {
    list: (query?: string) => methods.GET(`/packages${query ? `?${query}` : ''}`),

    create: (data: unknown) => methods.POST('/packages', data),

    getById: (id: string) => methods.GET(`/packages/${id}`),

    getByCustomer: (customerId: string) =>
      methods.GET(`/packages/customer/${customerId}`),

    getByRoute: (routeId: string) =>
      methods.GET(`/packages/route/${routeId}`),

    update: (id: string, data: unknown) =>
      methods.PATCH(`/packages/${id}`, data),

    delete: (id: string) => methods.DELETE(`/packages/${id}`),

    // Tracking
    getTracking: (id: string) =>
      methods.GET(`/packages/${id}/tracking`),

    addTracking: (id: string, data: unknown) =>
      methods.POST(`/packages/${id}/tracking`, data),

    // Bulk operations
    bulkUpdateStatus: (data: unknown) =>
      methods.POST('/packages/bulk/status', data),
  },

  // ============================================
  // Customers
  // ============================================
  customers: {
    list: (query?: string) =>
      methods.GET(`/customers${query ? `?${query}` : ''}`),

    create: (data: unknown) => methods.POST('/customers', data),

    getById: (id: string) => methods.GET(`/customers/${id}`),

    getPackages: (id: string) =>
      methods.GET(`/customers/${id}/packages`),

    getInvoices: (id: string) =>
      methods.GET(`/customers/${id}/invoices`),

    update: (id: string, data: unknown) =>
      methods.PATCH(`/customers/${id}`, data),

    delete: (id: string) => methods.DELETE(`/customers/${id}`),
  },

  // ============================================
  // Deliveries
  // ============================================
  deliveries: {
    list: (query?: string) =>
      methods.GET(`/deliveries${query ? `?${query}` : ''}`),

    create: (data: unknown) => methods.POST('/deliveries', data),

    getById: (id: string) => methods.GET(`/deliveries/${id}`),

    update: (id: string, data: unknown) =>
      methods.PATCH(`/deliveries/${id}`, data),

    delete: (id: string) => methods.DELETE(`/deliveries/${id}`),
  },

  // ============================================
  // Routes
  // ============================================
  routes: {
    list: (query?: string) =>
      methods.GET(`/routes${query ? `?${query}` : ''}`),

    create: (data: unknown) => methods.POST('/routes', data),

    getById: (id: string) => methods.GET(`/routes/${id}`),

    update: (id: string, data: unknown) =>
      methods.PATCH(`/routes/${id}`, data),

    delete: (id: string) => methods.DELETE(`/routes/${id}`),
  },

  // ============================================
  // Invoices
  // ============================================
  invoices: {
    list: (query?: string) =>
      methods.GET(`/invoices${query ? `?${query}` : ''}`),

    create: (data: unknown) => methods.POST('/invoices', data),

    getById: (id: string) => methods.GET(`/invoices/${id}`),

    update: (id: string, data: unknown) =>
      methods.PATCH(`/invoices/${id}`, data),

    delete: (id: string) => methods.DELETE(`/invoices/${id}`),

    // Extensions
    addItem: (id: string, item: unknown) => methods.POST(`/invoices/${id}/items`, item),
    removeItem: (itemId: string) => methods.DELETE(`/invoices/items/${itemId}`),
    markSent: (id: string) => methods.POST(`/invoices/${id}/mark-sent`, {}),
    markPaid: (id: string) => methods.POST(`/invoices/${id}/mark-paid`, {}),
    generatePdf: (id: string) => methods.POST(`/invoices/${id}/generate-pdf`, {}),
    sendEmail: (id: string, data: unknown) => methods.POST(`/invoices/${id}/send-email`, data),
    sendSms: (id: string, data: unknown) => methods.POST(`/invoices/${id}/send-sms`, data),
  },

  // ============================================
  // Settings
  // ============================================
  settings: {
    list: (options?: RequestOptions) => methods.GET('/settings', options),
    getByKey: (key: string) => methods.GET(`/settings/key/${key}`),
    create: (data: unknown) => methods.POST('/settings', data),
    update: (key: string, data: { value: string }) => 
      methods.PATCH(`/settings/key/${key}/value`, data),
  },

  // ============================================
  // Users
  // ============================================
  users: {
    list: (query?: string) =>
      methods.GET(`/users${query ? `?${query}` : ''}`),

    getById: (id: string) => methods.GET(`/users/${id}`),

    create: (data: unknown) => methods.POST('/users', data),

    update: (id: string, data: unknown) =>
      methods.PATCH(`/users/${id}`, data),

    delete: (id: string) => methods.DELETE(`/users/${id}`),
  },

  // ============================================
  // Distribution (Delivery Routes)
  // ============================================
  distribution: {
    getMyRoute: (userId?: string) => 
      methods.POST('/deliveries/my-route', userId ? { userId } : {}),
    
    updatePackageStatus: (packageId: string, data: { 
      status: 'delivered' | 'failed'; 
      failureReason?: string;
      notes?: string;
    }) => methods.PATCH(`/deliveries/packages/${packageId}/status`, data),
  },

  // ============================================
  // Analytics
  // ============================================
  analytics: {
    getOverview: (timeRange?: string) => 
      methods.GET(`/analytics/overview${timeRange ? `?timeRange=${timeRange}` : ''}`),
    getTopMetrics: (timeRange?: string) => 
      methods.GET(`/analytics/metrics${timeRange ? `?timeRange=${timeRange}` : ''}`),
    getRevenueTrend: (timeRange?: string) => 
      methods.GET(`/analytics/revenue-trend${timeRange ? `?timeRange=${timeRange}` : ''}`),
    getDeliveryTrend: (timeRange?: string) => 
      methods.GET(`/analytics/delivery-trend${timeRange ? `?timeRange=${timeRange}` : ''}`),
    getRegionalPerformance: (timeRange?: string) => 
      methods.GET(`/analytics/regional-performance${timeRange ? `?timeRange=${timeRange}` : ''}`),
    getRegionalDistribution: (timeRange?: string) => 
      methods.GET(`/analytics/regional-distribution${timeRange ? `?timeRange=${timeRange}` : ''}`),
    getPerformanceMetrics: (timeRange?: string) => 
      methods.GET(`/analytics/performance-metrics${timeRange ? `?timeRange=${timeRange}` : ''}`),
  },

  // ============================================
  // Health Check
  // ============================================
  health: {
    check: () => methods.GET('/health'),
  },

  // ============================================
  // Data Synchronization
  // ============================================
  sync: {
    customers: () => methods.POST('/sync/customers', {}, { timeout: 300000 }), // 5 minutes timeout
  },
};

export type ApiClient = typeof apiClient;
