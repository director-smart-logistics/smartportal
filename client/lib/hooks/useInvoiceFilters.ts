import { useState, useMemo, useCallback } from "react";
import {
  InvoiceFilterState,
  DEFAULT_INVOICE_FILTERS,
  SearchField,
  hasActiveFilters,
  countActiveFilters,
} from "@/lib/types/invoice-filters";

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  status: string;
  totalAmount: number;
  invoiceDate: string;
  dueDate?: string;
  createdAt?: string;
  emailSentAt?: string;
  emailStatus?: string;
  clientName?: string;
  clientEmail?: string;
  slCode?: string;
  customer?: {
    id: string;
    fullName: string;
    email: string;
    slCode?: string;
  };
  invoiceItems?: Array<{
    manifestNumber?: string;
    trackingNumber?: string;
    routeName?: string;
  }>;
  manifestNumbers?: string[];
  routeNames?: string[];
}

/**
 * Advanced invoice filtering hook with multi-field search
 * Provides optimized filtering logic for large invoice datasets
 */
export function useInvoiceFilters(invoices: Invoice[]) {
  const [filters, setFilters] = useState<InvoiceFilterState>(DEFAULT_INVOICE_FILTERS);

  // Update filters
  const updateFilters = useCallback((updates: Partial<InvoiceFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_INVOICE_FILTERS);
  }, []);

  // Multi-field search helper
  const matchesSearchTerm = useCallback(
    (invoice: Invoice, term: string, fields: SearchField[]): boolean => {
      if (!term) return true;
      
      const lowerTerm = term.toLowerCase();
      
      return fields.some((field) => {
        switch (field) {
          case "invoiceNumber":
            return invoice.invoiceNumber?.toLowerCase().includes(lowerTerm);
          
          case "customerName":
            return (
              invoice.clientName?.toLowerCase().includes(lowerTerm) ||
              invoice.customer?.fullName?.toLowerCase().includes(lowerTerm)
            );
          
          case "customerEmail":
            return (
              invoice.clientEmail?.toLowerCase().includes(lowerTerm) ||
              invoice.customer?.email?.toLowerCase().includes(lowerTerm)
            );
          
          case "customerId":
            // Search by cedula (customer ID)
            return invoice.customerId?.toLowerCase().includes(lowerTerm);
          
          case "slCode":
            return (
              invoice.slCode?.toLowerCase().includes(lowerTerm) ||
              invoice.customer?.slCode?.toLowerCase().includes(lowerTerm)
            );
          
          case "manifestNumber":
            return (
              invoice.manifestNumbers?.some((m) => m.toLowerCase().includes(lowerTerm)) ||
              invoice.invoiceItems?.some((item) =>
                item.manifestNumber?.toLowerCase().includes(lowerTerm)
              )
            );
          
          case "trackingNumber":
            return invoice.invoiceItems?.some((item) =>
              item.trackingNumber?.toLowerCase().includes(lowerTerm)
            );
          
          default:
            return false;
        }
      });
    },
    []
  );

  // Date range filter helper
  const matchesDateRange = useCallback(
    (invoice: Invoice, dateFrom: string | null, dateTo: string | null, dateField: string): boolean => {
      if (!dateFrom && !dateTo) return true;
      
      let dateValue: string | undefined;
      switch (dateField) {
        case "invoiceDate":
          dateValue = invoice.invoiceDate;
          break;
        case "dueDate":
          dateValue = invoice.dueDate;
          break;
        case "createdAt":
          dateValue = invoice.createdAt;
          break;
        case "emailSentAt":
          dateValue = invoice.emailSentAt;
          break;
        default:
          dateValue = invoice.invoiceDate;
      }
      
      if (!dateValue) return false;
      
      const date = new Date(dateValue);
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;
      
      if (from && date < from) return false;
      if (to && date > to) return false;
      
      return true;
    },
    []
  );

  // Main filtering logic
  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      // Search term filter
      if (!matchesSearchTerm(invoice, filters.searchTerm, filters.searchFields)) {
        return false;
      }

      // Status filter
      if (filters.status !== "all" && invoice.status !== filters.status) {
        return false;
      }

      // Email status filter
      if (filters.emailStatus !== "all" && invoice.emailStatus !== filters.emailStatus) {
        return false;
      }

      // Route filter
      if (filters.routes.length > 0) {
        const invoiceRoutes = invoice.routeNames || 
          invoice.invoiceItems?.map((item) => item.routeName).filter(Boolean) || [];
        
        if (!filters.routes.some((route) => invoiceRoutes.includes(route))) {
          return false;
        }
      }

      // Manifest filter
      if (filters.manifests.length > 0) {
        const invoiceManifests = invoice.manifestNumbers ||
          invoice.invoiceItems?.map((item) => item.manifestNumber).filter(Boolean) || [];
        
        if (!filters.manifests.some((manifest) => invoiceManifests.includes(manifest))) {
          return false;
        }
      }

      // Date range filter
      if (!matchesDateRange(invoice, filters.dateFrom, filters.dateTo, filters.dateField)) {
        return false;
      }

      // Customer filter
      if (filters.customerIds.length > 0 && !filters.customerIds.includes(invoice.customerId)) {
        return false;
      }

      // Amount range filter
      if (filters.amountMin !== null && invoice.totalAmount < filters.amountMin) {
        return false;
      }
      if (filters.amountMax !== null && invoice.totalAmount > filters.amountMax) {
        return false;
      }

      return true;
    });
  }, [invoices, filters, matchesSearchTerm, matchesDateRange]);

  // Extract available filter options from data
  const availableRoutes = useMemo(() => {
    const routeSet = new Set<string>();
    invoices.forEach((invoice) => {
      const routes = invoice.routeNames || 
        invoice.invoiceItems?.map((item) => item.routeName).filter(Boolean) || [];
      routes.forEach((route) => routeSet.add(route));
    });
    return Array.from(routeSet).sort().map((route) => ({
      label: route,
      value: route,
    }));
  }, [invoices]);

  const availableManifests = useMemo(() => {
    const manifestSet = new Set<string>();
    invoices.forEach((invoice) => {
      const manifests = invoice.manifestNumbers ||
        invoice.invoiceItems?.map((item) => item.manifestNumber).filter(Boolean) || [];
      manifests.forEach((manifest) => manifestSet.add(manifest));
    });
    return Array.from(manifestSet).sort().map((manifest) => ({
      label: manifest,
      value: manifest,
    }));
  }, [invoices]);

  return {
    filters,
    updateFilters,
    resetFilters,
    filteredInvoices,
    availableRoutes,
    availableManifests,
    hasActiveFilters: hasActiveFilters(filters),
    activeFilterCount: countActiveFilters(filters),
  };
}
