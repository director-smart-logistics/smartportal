// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InvoiceConfirmationDialog } from "../InvoiceConfirmationDialog";

// Mock Lucide icons
vi.mock("lucide-react", () => {
  const IconMock = (name: string) => (props: any) => <span>{name}</span>;
  return {
    AlertTriangle: IconMock("AlertTriangle"),
    Check: IconMock("Check"),
    Copy: IconMock("Copy"),
    X: IconMock("X"),
    Search: IconMock("Search"),
    Loader2: IconMock("Loader2"),
    Route: IconMock("Route"),
    Layers: IconMock("Layers"),
    Package: IconMock("Package"),
    Info: IconMock("Info"),
    ArrowRightLeft: IconMock("ArrowRightLeft"),
  };
});

// Mock Radix Alert Dialog
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  AlertDialogContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  AlertDialogAction: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
}));

// Mock useLocale
vi.mock("@/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
      if (key === "common.confirm") return "Confirmar";
      if (key === "common.cancel") return "Cancelar";
      return opts?.defaultValue || key;
    },
    language: "es",
  }),
}));

// Mock ManifestPicker as a standard select for testing
vi.mock("@/components/manifest/ManifestPicker", () => ({
  ManifestPicker: ({
    allManifestNumbers,
    selectedManifests,
    onManifestsChange,
    allLabel,
  }: {
    allManifestNumbers: string[];
    selectedManifests: Set<string>;
    onManifestsChange: (v: Set<string>) => void;
    allLabel?: string;
  }) => (
    <div data-testid="mock-manifest-picker">
      <select
        data-testid="mock-manifest-select"
        value={Array.from(selectedManifests)[0] || ""}
        onChange={(e) => {
          const val = e.target.value;
          onManifestsChange(val ? new Set([val]) : new Set());
        }}
      >
        <option value="">{allLabel || "Seleccione..."}</option>
        {allManifestNumbers.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  ),
}));

describe("InvoiceConfirmationDialog", () => {
  const defaultProps = {
    isOpen: true,
    confirmAction: {
      type: "annul",
      invoiceId: "inv-123",
      invoiceNumber: "SL72-20260819095601820-C",
      show: true,
      data: { manifestNumber: "17-08-2026DAN" },
    },
    onClose: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    annulMode: "consolidation" as const,
    setAnnulMode: vi.fn(),
    annulSelectedManifest: null,
    setAnnulSelectedManifest: vi.fn(),
    allManifestNumbers: ["19-08-2026DAN", "18-08-2026DAN", "17-08-2026DAN"],
    manifestPackageCounts: new Map([
      ["19-08-2026DAN", 10],
      ["18-08-2026DAN", 5],
    ]),
    deleteConfirmText: "",
    setDeleteConfirmText: vi.fn(),
    copiedInvoiceNumber: false,
    setCopiedInvoiceNumber: vi.fn(),
    bulkActionConfirmed: false,
    setBulkActionConfirmed: vi.fn(),
    emailSendOptions: { sendEmail: true, updatePackages: true, syncSp2: true },
    setEmailSendOptions: vi.fn(),
    statusChangeOptions: { syncInvoice: true, updatePackages: true, syncSp2: true },
    setStatusChangeOptions: vi.fn(),
    bulkStatusOptions: { syncSp2: true, updatePackages: true },
    setBulkStatusOptions: vi.fn(),
    customerConsolidationEnabledSP1: true,
    customerConsolidationEnabledSP2: true,
    autoEnableConsolidation: true,
    setAutoEnableConsolidation: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the annulment title, invoice number and 2 symmetrical option cards", () => {
    render(<InvoiceConfirmationDialog {...defaultProps} />);

    expect(screen.getByText("Anular Factura")).toBeDefined();
    expect(screen.getByText("SL72-20260819095601820-C")).toBeDefined();
    expect(screen.getByText("Mover a Consolidación")).toBeDefined();
    expect(screen.getByText("Asignar a otro Manifiesto")).toBeDefined();
  });

  it("allows switching to manifest assignment mode", () => {
    render(<InvoiceConfirmationDialog {...defaultProps} />);

    const manifestBtn = screen.getByTestId("annul-mode-manifest-btn");
    fireEvent.click(manifestBtn);

    expect(defaultProps.setAnnulMode).toHaveBeenCalledWith("manifest");
  });

  it("renders ManifestPicker and filters out current manifest", () => {
    render(
      <InvoiceConfirmationDialog
        {...defaultProps}
        annulMode="manifest"
      />
    );

    expect(screen.getByTestId("mock-manifest-picker")).toBeDefined();
    expect(screen.getByText("Manifiesto Origen:")).toBeDefined();
    expect(screen.getByText("17-08-2026DAN")).toBeDefined();

    const select = screen.getByTestId("mock-manifest-select");
    fireEvent.change(select, { target: { value: "19-08-2026DAN" } });

    expect(defaultProps.setAnnulSelectedManifest).toHaveBeenCalledWith({
      docId: "19-08-2026DAN",
      manifestNumber: "19-08-2026DAN",
    });
  });

  it("shows auto-enable consolidation warning when consolidation is disabled in SP1 or SP2", () => {
    render(
      <InvoiceConfirmationDialog
        {...defaultProps}
        customerConsolidationEnabledSP1={false}
      />
    );

    expect(screen.getByText("Consolidación inactiva para este cliente")).toBeDefined();
    expect(
      screen.getByText("Activar la consolidación automáticamente para este cliente en ambos portales.")
    ).toBeDefined();
  });

  it("triggers onConfirm when clicking confirm button", () => {
    render(<InvoiceConfirmationDialog {...defaultProps} />);

    const confirmBtn = screen.getByTestId("confirmation-confirm-btn");
    fireEvent.click(confirmBtn);

    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it("triggers onClose when clicking cancel button", () => {
    render(<InvoiceConfirmationDialog {...defaultProps} />);

    const cancelBtn = screen.getByTestId("confirmation-cancel-btn");
    fireEvent.click(cancelBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
