// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInvoiceFilters } from "../useInvoiceFilters";

const mockInvoices = [
  {
    id: "inv-1",
    invoiceNumber: "INV-001",
    customerId: "123456789",
    status: "sent",
    totalAmount: 100.50,
    invoiceDate: "2024-01-15T10:00:00Z",
    dueDate: "2024-02-15T10:00:00Z",
    emailStatus: "delivered",
    clientName: "Juan Pérez",
    clientEmail: "juan@example.com",
    slCode: "SL25001",
    customer: {
      id: "123456789",
      fullName: "Juan Pérez",
      email: "juan@example.com",
      slCode: "SL25001",
    },
    invoiceItems: [
      {
        manifestNumber: "MAN-001",
        trackingNumber: "TRK-001",
        routeName: "San Jose Centro",
      },
    ],
    manifestNumbers: ["MAN-001"],
    routeNames: ["San Jose Centro"],
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-002",
    customerId: "987654321",
    status: "paid",
    totalAmount: 250.75,
    invoiceDate: "2024-01-20T10:00:00Z",
    emailStatus: "opened",
    clientName: "María González",
    clientEmail: "maria@example.com",
    slCode: "SL25002",
    customer: {
      id: "987654321",
      fullName: "María González",
      email: "maria@example.com",
      slCode: "SL25002",
    },
    invoiceItems: [
      {
        manifestNumber: "MAN-002",
        trackingNumber: "TRK-002",
        routeName: "Heredia",
      },
    ],
    manifestNumbers: ["MAN-002"],
    routeNames: ["Heredia"],
  },
  {
    id: "inv-3",
    invoiceNumber: "INV-003",
    customerId: "555555555",
    status: "draft",
    totalAmount: 75.00,
    invoiceDate: "2024-01-25T10:00:00Z",
    emailStatus: "not_sent",
    clientName: "Carlos Rodríguez",
    clientEmail: "carlos@example.com",
    slCode: "SL25003",
    customer: {
      id: "555555555",
      fullName: "Carlos Rodríguez",
      email: "carlos@example.com",
      slCode: "SL25003",
    },
    invoiceItems: [
      {
        manifestNumber: "MAN-001",
        trackingNumber: "TRK-003",
        routeName: "San Jose Centro",
      },
    ],
    manifestNumbers: ["MAN-001"],
    routeNames: ["San Jose Centro"],
  },
];

describe("useInvoiceFilters", () => {
  describe("initialization", () => {
    it("should initialize with default filters", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      expect(result.current.filters.searchTerm).toBe("");
      expect(result.current.filters.status).toBe("all");
      expect(result.current.filters.emailStatus).toBe("all");
      expect(result.current.filters.routes).toEqual([]);
      expect(result.current.filters.manifests).toEqual([]);
      expect(result.current.hasActiveFilters).toBe(false);
      expect(result.current.activeFilterCount).toBe(0);
    });

    it("should return all invoices when no filters are applied", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      expect(result.current.filteredInvoices).toHaveLength(3);
      expect(result.current.filteredInvoices).toEqual(mockInvoices);
    });
  });

  describe("search term filtering", () => {
    it("should filter by invoice number", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "INV-001" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].invoiceNumber).toBe("INV-001");
    });

    it("should filter by customer name (case insensitive)", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "maría" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].clientName).toBe("María González");
    });

    it("should filter by customer email", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "carlos@example.com" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].clientEmail).toBe("carlos@example.com");
    });

    it("should filter by customer ID (cedula)", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "123456789" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].customerId).toBe("123456789");
    });

    it("should filter by slCode", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "SL25002" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].slCode).toBe("SL25002");
    });

    it("should filter by manifest number", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "MAN-002" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].manifestNumbers).toContain("MAN-002");
    });

    it("should filter by tracking number", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ searchTerm: "TRK-003" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].invoiceItems?.[0].trackingNumber).toBe("TRK-003");
    });

    it("should respect search field selection", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          searchTerm: "INV-001",
          searchFields: ["customerName"], // Only search in customer name
        });
      });

      // Should not find anything since "INV-001" is not in customer names
      expect(result.current.filteredInvoices).toHaveLength(0);
    });
  });

  describe("status filtering", () => {
    it("should filter by invoice status", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ status: "paid" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].status).toBe("paid");
    });

    it("should filter by email status", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ emailStatus: "delivered" });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].emailStatus).toBe("delivered");
    });
  });

  describe("route and manifest filtering", () => {
    it("should filter by route", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ routes: ["Heredia"] });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].routeNames).toContain("Heredia");
    });

    it("should filter by multiple routes (OR logic)", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ routes: ["San Jose Centro", "Heredia"] });
      });

      expect(result.current.filteredInvoices).toHaveLength(3);
    });

    it("should filter by manifest", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ manifests: ["MAN-002"] });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].manifestNumbers).toContain("MAN-002");
    });

    it("should filter by multiple manifests (OR logic)", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ manifests: ["MAN-001", "MAN-002"] });
      });

      expect(result.current.filteredInvoices).toHaveLength(3);
    });
  });

  describe("date range filtering", () => {
    it("should filter by date from", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          dateFrom: "2024-01-20T00:00:00Z",
          dateField: "invoiceDate",
        });
      });

      expect(result.current.filteredInvoices).toHaveLength(2);
      expect(result.current.filteredInvoices.every(inv => 
        new Date(inv.invoiceDate) >= new Date("2024-01-20T00:00:00Z")
      )).toBe(true);
    });

    it("should filter by date to", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          dateTo: "2024-01-20T23:59:59Z",
          dateField: "invoiceDate",
        });
      });

      expect(result.current.filteredInvoices).toHaveLength(2);
      expect(result.current.filteredInvoices.every(inv =>
        new Date(inv.invoiceDate) <= new Date("2024-01-20T23:59:59Z")
      )).toBe(true);
    });

    it("should filter by date range", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          dateFrom: "2024-01-16T00:00:00Z",
          dateTo: "2024-01-24T00:00:00Z",
          dateField: "invoiceDate",
        });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].invoiceNumber).toBe("INV-002");
    });
  });

  describe("amount range filtering", () => {
    it("should filter by minimum amount", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ amountMin: 100 });
      });

      expect(result.current.filteredInvoices).toHaveLength(2);
      expect(result.current.filteredInvoices.every(inv => inv.totalAmount >= 100)).toBe(true);
    });

    it("should filter by maximum amount", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ amountMax: 200 });
      });

      expect(result.current.filteredInvoices).toHaveLength(2);
      expect(result.current.filteredInvoices.every(inv => inv.totalAmount <= 200)).toBe(true);
    });

    it("should filter by amount range", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ amountMin: 80, amountMax: 150 });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].totalAmount).toBe(100.50);
    });
  });

  describe("combined filtering", () => {
    it("should apply multiple filters (AND logic)", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          status: "sent",
          routes: ["San Jose Centro"],
          amountMin: 50,
        });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].invoiceNumber).toBe("INV-001");
    });

    it("should apply search term with other filters", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          searchTerm: "SL25003",
          status: "draft",
        });
      });

      expect(result.current.filteredInvoices).toHaveLength(1);
      expect(result.current.filteredInvoices[0].invoiceNumber).toBe("INV-003");
    });
  });

  describe("filter state management", () => {
    it("should update filters correctly", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({ status: "paid" });
      });

      expect(result.current.filters.status).toBe("paid");
      expect(result.current.hasActiveFilters).toBe(true);
      expect(result.current.activeFilterCount).toBe(1);
    });

    it("should reset filters", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          searchTerm: "test",
          status: "paid",
          routes: ["Heredia"],
        });
      });

      expect(result.current.hasActiveFilters).toBe(true);
      expect(result.current.activeFilterCount).toBe(3);

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.hasActiveFilters).toBe(false);
      expect(result.current.activeFilterCount).toBe(0);
      expect(result.current.filteredInvoices).toHaveLength(3);
    });

    it("should count active filters correctly", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          searchTerm: "test",
          status: "paid",
          routes: ["Heredia"],
          amountMin: 100,
        });
      });

      expect(result.current.activeFilterCount).toBe(4);
    });
  });

  describe("available options", () => {
    it("should extract available routes from invoices", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      expect(result.current.availableRoutes).toHaveLength(2);
      expect(result.current.availableRoutes.map(r => r.value)).toContain("San Jose Centro");
      expect(result.current.availableRoutes.map(r => r.value)).toContain("Heredia");
    });

    it("should extract available manifests from invoices", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      expect(result.current.availableManifests).toHaveLength(2);
      expect(result.current.availableManifests.map(m => m.value)).toContain("MAN-001");
      expect(result.current.availableManifests.map(m => m.value)).toContain("MAN-002");
    });

    it("should sort available options alphabetically", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      const routeValues = result.current.availableRoutes.map(r => r.value);
      const sortedRoutes = [...routeValues].sort();
      expect(routeValues).toEqual(sortedRoutes);

      const manifestValues = result.current.availableManifests.map(m => m.value);
      const sortedManifests = [...manifestValues].sort();
      expect(manifestValues).toEqual(sortedManifests);
    });
  });

  describe("edge cases", () => {
    it("should handle empty invoice list", () => {
      const { result } = renderHook(() => useInvoiceFilters([]));

      expect(result.current.filteredInvoices).toHaveLength(0);
      expect(result.current.availableRoutes).toHaveLength(0);
      expect(result.current.availableManifests).toHaveLength(0);
    });

    it("should handle invoices with missing optional fields", () => {
      const incompleteInvoices = [
        {
          id: "inv-incomplete",
          invoiceNumber: "INV-999",
          customerId: "999",
          status: "draft",
          totalAmount: 50,
          invoiceDate: "2024-01-01T10:00:00Z",
        },
      ];

      const { result } = renderHook(() => useInvoiceFilters(incompleteInvoices as any));

      act(() => {
        result.current.updateFilters({ searchTerm: "test" });
      });

      // Should not crash, just return no results
      expect(result.current.filteredInvoices).toHaveLength(0);
    });

    it("should handle null/undefined filter values", () => {
      const { result } = renderHook(() => useInvoiceFilters(mockInvoices));

      act(() => {
        result.current.updateFilters({
          dateFrom: null,
          dateTo: null,
          amountMin: null,
          amountMax: null,
        });
      });

      // Should return all invoices when filters are null
      expect(result.current.filteredInvoices).toHaveLength(3);
    });
  });
});
