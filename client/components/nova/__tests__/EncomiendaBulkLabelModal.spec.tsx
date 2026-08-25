// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { resolveAddress, EncomiendaBulkLabelModal } from ".././EncomiendaBulkLabelModal";
import type { CustomerInfo } from ".././NovaShippingLabelModal";
import { registerEncomiendaForTest } from "@/lib/services/encomienda-lookup";
import { firebaseApi } from "@/lib/firebase/callable";

// Mock Lucide icons
vi.mock("lucide-react", () => {
  const IconMock = (name: string) => (props: any) => <span>{name}</span>;
  return {
    X: IconMock("X"),
    Printer: IconMock("Printer"),
    Loader2: IconMock("Loader2"),
    AlertTriangle: IconMock("AlertTriangle"),
    Tag: IconMock("Tag"),
  };
});

// Mock Framer Motion to render immediately without animations
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, id }: any) => <div className={className} id={id}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock firebase api callable
vi.mock("@/lib/firebase/callable", () => ({
  firebaseApi: {
    customers: {
      getBySlCode: vi.fn(),
    },
  },
}));

// Mock print HTML utility
vi.mock("@/lib/utils/nova-print", () => ({
  buildShippingLabelHTML: vi.fn(() => "<html>MOCK_PRINT_HTML</html>"),
}));

// Mock encomienda lookup service
vi.mock("@/lib/services/encomienda-lookup", async () => {
  const actual = await vi.importActual<any>("@/lib/services/encomienda-lookup");
  return {
    ...actual,
    initializeEncomiendaLookup: vi.fn().mockResolvedValue(undefined),
    resolveEncomiendaName: vi.fn((name) => name),
  };
});

// Mock ShippingLabelPrint component from NovaShippingLabelModal
vi.mock("@/components/nova/NovaShippingLabelModal", () => ({
  ShippingLabelPrint: ({ parcel }: any) => (
    <div data-testid="shipping-label-card">
      <div>Label: {parcel.recipientName}</div>
      <div>Address: {parcel.deliveryAddress}</div>
      <div>Service: {parcel.courierService}</div>
      <div>Code: {parcel.slCode}</div>
    </div>
  ),
}));

describe("Encomienda Bulk Label - resolveAddress", () => {
  it("should prioritize default/principal address over secondary addresses", () => {
    const customer: CustomerInfo = {
      slCode: "SL2363",
      fullName: "Jesenia Cubero Gonzalez",
      addresses: [
        {
          streetAddress: "Calle Secundaria",
          encomienda: { id: "bava", name: "Transportes Bava" },
          isDefault: false,
          isActive: true,
        },
        {
          streetAddress: "Calle Principal Pérez Zeledón",
          encomienda: { id: "musoc", name: "Musoc" },
          isDefault: true,
          isActive: true,
        },
      ],
      defaultAddress: {
        streetAddress: "Calle Principal Pérez Zeledón",
        encomienda: { id: "musoc", name: "Musoc" },
        isDefault: true,
        isActive: true,
      },
    };

    const { deliveryAddress, courierService } = resolveAddress(customer);
    expect(courierService).toBe("Musoc");
    expect(deliveryAddress).toContain("Calle Principal Pérez Zeledón");
  });

  it("should fall back to first address if no default address is specified", () => {
    const customer: CustomerInfo = {
      slCode: "SL111",
      fullName: "Test Client",
      addresses: [
        {
          streetAddress: "Calle 1",
          encomienda: { id: "bava", name: "Transportes Bava" },
          isActive: true,
        },
        {
          streetAddress: "Calle 2",
          encomienda: { id: "musoc", name: "Musoc" },
          isActive: true,
        },
      ],
    };

    const { deliveryAddress, courierService } = resolveAddress(customer);
    expect(courierService).toBe("Transportes Bava");
    expect(deliveryAddress).toBe("Calle 1");
  });
});

describe("EncomiendaBulkLabelModal - Component Verification", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders shipping labels for valid customers and builds fallback previews for failed ones, listing them in the warning box", async () => {
    // Mock customer 1 resolution (successful)
    const mockCustInfo: CustomerInfo = {
      slCode: "SL123",
      fullName: "Juan Perez",
      defaultAddress: {
        streetAddress: "Calle Flores, Heredia",
        encomienda: { id: "bava", name: "Transportes Bava" },
        isDefault: true,
        isActive: true,
      },
    };
    vi.mocked(firebaseApi.customers.getBySlCode).mockImplementation(async (code) => {
      if (code === "SL123") {
        return { success: true, data: mockCustInfo } as any;
      }
      return { success: false, error: "Cliente no encontrado" } as any;
    });

    const mockQueue = [
      {
        slCode: "SL123",
        clientName: "Juan Perez",
        encomiendaName: "Transportes Bava",
        trackings: ["TRK-1", "TRK-2"],
        ruta: "Heredia",
      },
      {
        slCode: "SL456", // unregistered
        clientName: "Marta Gomez",
        encomiendaName: "Musoc",
        trackings: ["TRK-3"],
        ruta: "Perez Zeledon",
      },
    ];

    render(<EncomiendaBulkLabelModal queue={mockQueue} onClose={vi.fn()} />);

    // Wait for the customer lookup promises to resolve
    await waitFor(() => {
      expect(screen.queryByText(/Generando/i)).toBeNull();
    });

    // Verify warnings display for the failed SL456 client
    expect(screen.getByText("1 sin datos")).toBeTruthy();
    expect(screen.getByText(/Atención: 1 etiqueta se generarán con campos en blanco/i)).toBeTruthy();
    expect(screen.getAllByText(/Marta Gomez/i).length).toBeGreaterThanOrEqual(2);

    // Verify both shipping label cards are rendered on screen (no crash, fallback works!)
    const labelCards = screen.getAllByTestId("shipping-label-card");
    expect(labelCards.length).toBe(2);

    // Verify first label content (registered)
    expect(screen.getByText("Label: Juan Perez")).toBeTruthy();
    expect(screen.getByText("Address: Calle Flores, Heredia")).toBeTruthy();
    expect(screen.getByText("Service: Transportes Bava")).toBeTruthy();

    // Verify second label content (unregistered fallback)
    expect(screen.getByText("Label: Marta Gomez")).toBeTruthy();
    expect(screen.getByText("Code: SL456")).toBeTruthy();
    expect(screen.getByText("Service: Musoc")).toBeTruthy();
  });
});
