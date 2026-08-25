/**
 * Advanced invoice filtering types
 * Supports multi-field search and complex filtering scenarios
 */

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled" | "annulled" | "deleted";

export type EmailStatus = "not_sent" | "sent" | "delivered" | "opened" | "bounced" | "failed";

export interface InvoiceFilterState {
  // Text search - searches across multiple fields
  searchTerm: string;
  searchFields: SearchField[];
  
  // Status filters
  status: "all" | InvoiceStatus;
  emailStatus: "all" | EmailStatus;
  
  // Route and manifest filters
  routes: string[];
  manifests: string[];
  
  // Date range filters
  dateFrom: string | null;
  dateTo: string | null;
  dateField: "invoiceDate" | "dueDate" | "createdAt" | "emailSentAt";
  
  // Customer filters
  customerIds: string[];
  
  // Amount filters
  amountMin: number | null;
  amountMax: number | null;
}

export type SearchField = 
  | "invoiceNumber"
  | "customerName"
  | "customerEmail"
  | "customerId" // cedula
  | "slCode"
  | "manifestNumber"
  | "trackingNumber";

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
  color?: string;
}

export interface InvoiceFilterProps {
  filters: InvoiceFilterState;
  onFiltersChange: (filters: Partial<InvoiceFilterState>) => void;
  onReset: () => void;
  availableRoutes?: FilterOption[];
  availableManifests?: FilterOption[];
  totalResults: number;
  isLoading?: boolean;
}

export const DEFAULT_INVOICE_FILTERS: InvoiceFilterState = {
  searchTerm: "",
  searchFields: ["invoiceNumber", "customerName", "customerEmail", "customerId", "slCode", "manifestNumber", "trackingNumber"],
  status: "all",
  emailStatus: "all",
  routes: [],
  manifests: [],
  dateFrom: null,
  dateTo: null,
  dateField: "invoiceDate",
  customerIds: [],
  amountMin: null,
  amountMax: null,
};

/**
 * Helper to check if any filters are active
 */
export function hasActiveFilters(filters: InvoiceFilterState): boolean {
  return (
    filters.searchTerm !== "" ||
    filters.status !== "all" ||
    filters.emailStatus !== "all" ||
    filters.routes.length > 0 ||
    filters.manifests.length > 0 ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.customerIds.length > 0 ||
    filters.amountMin !== null ||
    filters.amountMax !== null
  );
}

/**
 * Count active filters
 */
export function countActiveFilters(filters: InvoiceFilterState): number {
  let count = 0;
  if (filters.searchTerm) count++;
  if (filters.status !== "all") count++;
  if (filters.emailStatus !== "all") count++;
  if (filters.routes.length > 0) count++;
  if (filters.manifests.length > 0) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.customerIds.length > 0) count++;
  if (filters.amountMin !== null || filters.amountMax !== null) count++;
  return count;
}
