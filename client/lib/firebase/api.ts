import { getIdToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getIdToken();
  if (!token) {
    return {
      "Content-Type": "application/json",
    };
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  const { requireAuth = true, ...fetchOptions } = options;

  const headers = requireAuth
    ? await getAuthHeaders()
    : { "Content-Type": "application/json" };

  const url = endpoint.startsWith("/") ? `${API_BASE_URL}${endpoint}` : `${API_BASE_URL}/${endpoint}`;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...headers,
        ...fetchOptions.headers,
      },
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || `Request failed with status ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error("API request failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

export async function apiGet<T = unknown>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { ...options, method: "GET" });
}

export async function apiPost<T = unknown>(
  endpoint: string,
  body: unknown,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiPut<T = unknown>(
  endpoint: string,
  body: unknown,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiPatch<T = unknown>(
  endpoint: string,
  body: unknown,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T = unknown>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { ...options, method: "DELETE" });
}

export async function apiPaginated<T = unknown>(
  endpoint: string,
  params: { page?: number; limit?: number; [key: string]: unknown } = {},
  options: ApiOptions = {}
): Promise<PaginatedResponse<T>> {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;

  const response = await apiGet<T[]>(url, options);

  return {
    ...response,
    total: (response as PaginatedResponse<T>).total || 0,
    page: (response as PaginatedResponse<T>).page || params.page || 1,
    limit: (response as PaginatedResponse<T>).limit || params.limit || 20,
    totalPages: (response as PaginatedResponse<T>).totalPages || 0,
  };
}
