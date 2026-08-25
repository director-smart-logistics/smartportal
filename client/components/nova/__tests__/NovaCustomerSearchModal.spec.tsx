// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CustomerSearchModal } from "../NovaCustomerSearchModal";

// Mock useLocale
vi.mock("@/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
    language: "es",
  }),
}));

// Mock customer matcher and learning service
const mockSearchCustomersLocal = vi.fn();
const mockGetCustomerBySlCode = vi.fn();
const mockGetLearningAssociations = vi.fn();

vi.mock("@/lib/services/customer-matcher", () => ({
  searchCustomersLocal: (...args: any[]) => mockSearchCustomersLocal(...args),
  getCustomerBySlCode: (sl: string) => mockGetCustomerBySlCode(sl),
}));

vi.mock("@/lib/services/manifest-learning-service", () => ({
  getLearningAssociations: (...args: any[]) => mockGetLearningAssociations(...args),
}));

describe("CustomerSearchModal (Nova Customer Link/Reassign)", () => {
  const defaultProps = {
    nombre: "ADRIAN CORRALES PICADO",
    onClose: vi.fn(),
    onSelected: vi.fn(),
    onCreateNew: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockGetLearningAssociations.mockResolvedValue([]);
    mockSearchCustomersLocal.mockResolvedValue([]);
    mockGetCustomerBySlCode.mockReturnValue(undefined);
  });

  it("renders modal header, manifest name, and search input with zero AI references", async () => {
    render(<CustomerSearchModal {...defaultProps} />);

    expect(screen.getByText("Vincular o Reasignar Cliente")).toBeDefined();
    expect(screen.getByText("ADRIAN CORRALES PICADO")).toBeDefined();
    expect(screen.getByTestId("customer-search-input")).toBeDefined();

    // Verify AI spinner and section are completely absent
    expect(screen.queryByText(/Buscando sugerencias con IA/i)).toBeNull();
    expect(screen.queryByText(/SUGERENCIAS IA/i)).toBeNull();
  });

  it("displays Nova Learning associations when available", async () => {
    mockGetLearningAssociations.mockResolvedValueOnce([
      {
        slCode: "SL285",
        matchedName: "ADRIAN ALONSO CORRALES ALVARADO",
        matchScore: 0.98,
        approvalCount: 3,
      },
    ]);
    mockGetCustomerBySlCode.mockReturnValueOnce({
      slCode: "SL285",
      fullName: "ADRIAN ALONSO CORRALES ALVARADO",
      ruta: "HEREDIA",
      email: "adrian@example.com",
    });

    render(<CustomerSearchModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("learning-results-section")).toBeDefined();
      expect(screen.getByText("ADRIAN ALONSO CORRALES ALVARADO")).toBeDefined();
      expect(screen.getByText("SL285")).toBeDefined();
      expect(screen.getByText(/Aprobado \(3\)/i)).toBeDefined();
    });
  });

  it("displays suggested local matches immediately on mount without user typing", async () => {
    mockSearchCustomersLocal.mockImplementation((term) => {
      if (term === "ADRIAN CORRALES PICADO") {
        return Promise.resolve([
          {
            slCode: "SL1234",
            fullName: "ADRIAN CORRALES PICADO",
            ruta: "METROPOLITANA",
            score: 0.99,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<CustomerSearchModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("suggested-results-section")).toBeDefined();
      expect(screen.getByTestId("customer-result-row-SL1234")).toBeDefined();
      expect(screen.getByText("SL1234")).toBeDefined();
      expect(screen.getByText("99%")).toBeDefined();
    });
  });

  it("performs fast in-memory search when typing in search input", async () => {
    render(<CustomerSearchModal {...defaultProps} />);

    mockSearchCustomersLocal.mockResolvedValue([
      {
        slCode: "SL999",
        fullName: "MARIO VARGAS LLOSA",
        ruta: "RURAL",
        score: 0.95,
      },
    ]);

    const input = screen.getByTestId("customer-search-input");
    fireEvent.change(input, { target: { value: "MARIO" } });

    await waitFor(() => {
      expect(mockSearchCustomersLocal).toHaveBeenCalledWith("MARIO", {
        limit: 8,
        minScore: 0.6,
      });
      expect(screen.getByTestId("search-results-section")).toBeDefined();
      expect(screen.getByText("MARIO VARGAS LLOSA")).toBeDefined();
      expect(screen.getByText("SL999")).toBeDefined();
    });
  });

  it("triggers onSelected callback when a customer row is clicked", async () => {
    mockSearchCustomersLocal.mockImplementation((term) => {
      if (term === "ADRIAN CORRALES PICADO") {
        return Promise.resolve([
          {
            slCode: "SL1234",
            fullName: "ADRIAN CORRALES PICADO",
            ruta: "METROPOLITANA",
            score: 0.99,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    render(<CustomerSearchModal {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("customer-result-row-SL1234")).toBeDefined();
    });

    const row = screen.getByTestId("customer-result-row-SL1234");
    fireEvent.click(row);

    expect(defaultProps.onSelected).toHaveBeenCalledWith(
      "SL1234",
      "ADRIAN CORRALES PICADO",
      "METROPOLITANA"
    );
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("triggers onCreateNew when clicking 'Crear cliente temporal'", () => {
    render(<CustomerSearchModal {...defaultProps} />);

    const createBtns = screen.getAllByRole("button", { name: /crear cliente temporal/i });
    expect(createBtns.length).toBeGreaterThan(0);
    fireEvent.click(createBtns[0]);

    expect(defaultProps.onCreateNew).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("triggers onClose when clicking close icon or cancel button", () => {
    render(<CustomerSearchModal {...defaultProps} />);

    const closeBtn = screen.getByTestId("customer-search-close");
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();

    const cancelBtn = screen.getByTestId("cancel-button");
    fireEvent.click(cancelBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });

  it("supports keyboard navigation with Escape to close", () => {
    render(<CustomerSearchModal {...defaultProps} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
