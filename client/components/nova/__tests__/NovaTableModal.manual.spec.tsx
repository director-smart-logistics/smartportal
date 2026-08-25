// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import React from "react";

// Mock framer-motion to avoid animation issues in JSDOM
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} {...props} data-testid={props["data-testid"]}>
        {children}
      </div>
    ),
    button: ({ children, className, ...props }: any) => (
      <button className={className} {...props}>
        {children}
      </button>
    ),
    span: ({ children, className, ...props }: any) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock Firebase auth hooks
vi.mock("@/lib/context/FirebaseAuthContext", () => ({
  useFirebaseAuth: () => ({ user: { email: "admin@smartlogistics.com" } }),
  useAuth: () => ({ user: { email: "admin@smartlogistics.com" } }),
}));

// Mock useToast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Define shared variables for mocking hook calls
const useNovaAutoSaveSpy = vi.fn();
const autoSaveFlushMock = vi.fn();
const autoSaveMarkSavedMock = vi.fn();
vi.mock("@/hooks/use-nova-auto-save", () => ({
  useNovaAutoSave: (params: any) => {
    useNovaAutoSaveSpy(params);
    return {
      status: "idle",
      lastSavedAt: null,
      errorMessage: null,
      flush: autoSaveFlushMock,
      markSaved: autoSaveMarkSavedMock,
    };
  },
}));

const handleUnlinkAndRematchMock = vi.fn();
const useNovaCustomerAssignmentSpy = vi.fn();
const applyNameAndMatchMock = vi.fn();
const applyExplicitMatchMock = vi.fn();
const handleUnlinkOnlyMock = vi.fn();
const handleUnlinkRowMock = vi.fn();

vi.mock("@/hooks/use-nova-customer-assignment", () => {
  const { useState } = require("react");
  return {
    useNovaCustomerAssignment: (params: any) => {
      useNovaCustomerAssignmentSpy(params);
      const [unlinkedRows, setUnlinkedRows] = useState(() => new Set<number>());
      const [slCodeOverrides, setSlCodeOverrides] = useState(() => ({}));
      const [matchOverrides, setMatchOverrides] = useState(() => ({}));
      const [nameOverrides, setNameOverrides] = useState(() => ({}));
      const [approvedMatches, setApprovedMatches] = useState(() => new Set<number>());
      const [recentlyUnlinked, setRecentlyUnlinked] = useState(() => new Set<number>());

      return {
        unlinkedRows,
        setUnlinkedRows,
        slCodeOverrides,
        setSlCodeOverrides,
        matchOverrides,
        setMatchOverrides,
        nameOverrides,
        setNameOverrides,
        approvedMatches,
        setApprovedMatches,
        recentlyUnlinked,
        applyNameAndMatch: applyNameAndMatchMock,
        applyExplicitMatch: applyExplicitMatchMock,
        handleUnlinkOnly: handleUnlinkOnlyMock,
        handleUnlinkRow: handleUnlinkRowMock,
        handleUnlinkAndRematch: handleUnlinkAndRematchMock,
      };
    },
  };
});

const packagesWatchAcknowledgeMock = vi.fn();
vi.mock("@/hooks/use-nova-packages-watch", () => {
  const { useState } = require("react");
  return {
    useNovaPackagesWatch: () => {
      const [addedTrackings] = useState(() => new Set());
      const [removedTrackings] = useState(() => new Set());
      return {
        addedTrackings,
        removedTrackings,
        staleCount: 0,
        acknowledge: packagesWatchAcknowledgeMock,
      };
    },
  };
});

const integrityAuditRunMock = vi.fn();
vi.mock("@/hooks/use-nova-integrity-audit", () => ({
  useNovaIntegrityAudit: () => ({
    report: null,
    loading: false,
    error: null,
    runAudit: integrityAuditRunMock,
    hasIssues: false,
  }),
}));

// Mock out services to prevent actual firestore/network queries
vi.mock("@/lib/services/manifest-processor", () => ({
  ingestManifestToPackages: vi.fn(async () => ({ inserted: 1, updated: 0, errors: 0 })),
  saveManifestRecord: vi.fn(async () => {}),
  saveEncomiendaManifestRows: vi.fn(async () => {}),
  getRecentManifests: vi.fn(async () => []),
  isDivergentMatch: vi.fn(() => false),
  loadManifestFromFirestore: vi.fn(),
  createOrGetTempCustomer: vi.fn(async () => ({})),
}));

vi.mock("@/lib/services/customer-sync", () => ({
  updateCustomerRuta: vi.fn(),
}));

vi.mock("@/lib/services/match-learning", () => ({
  loadUnmatchedRouteCache: vi.fn(async () => ({})),
  lookupLearnedRoute: vi.fn(() => null),
  saveUnmatchedRouteLearning: vi.fn(),
  saveMatchFeedback: vi.fn(async () => {}),
  saveMatchFeedbackBulk: vi.fn(async () => {}),
  reloadLearnedMatches: vi.fn(async () => []),
}));

vi.mock("@/lib/firebase/firestore-client", () => ({
  searchCustomers: vi.fn(async () => []),
  getCustomersBySlCodes: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/firebase/config", () => ({
  app: {},
  auth: {},
  db: {},
  storage: {},
  dbSP2: {},
  sp2App: {},
}));

vi.mock("@/lib/firebase/callable", () => ({
  firebaseApi: {
    routes: {
      list: vi.fn(async () => ({ success: true, data: { data: [] } })),
    },
    customers: {
      getBySlCode: vi.fn(),
    },
    packages: {
      list: vi.fn(),
      bulkUpdateStatus: vi.fn(),
    },
  },
}));

vi.mock("firebase/firestore", () => ({
  writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  doc: vi.fn(),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [], forEach: () => {} })),
  where: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => new Date()),
}));

vi.mock("@/lib/services/invoice-service", () => ({
  createInvoicesFromRows: vi.fn(),
  deleteInvoicesByManifest: vi.fn(),
  deleteInvoicesForTrackings: vi.fn(),
  getInvoiceBreakdownByManifest: vi.fn(async () => ({})),
  annulInvoicesByTrackingsAndManifest: vi.fn(),
  getInvoicesByManifest: vi.fn(async () => []),
  subscribeInvoicesByManifest: vi.fn(() => () => {}),
  deletePackagesByTrackings: vi.fn(),
  sendInvoiceEmails: vi.fn(),
  sendTestInvoiceEmail: vi.fn(),
  groupRowsForInvoicing: vi.fn(() => ({})),
  getCustomersBySlCodes: vi.fn(async () => new Map()),
  subscribeCustomersBySlCodes: vi.fn(() => () => {}),
  generateInvoiceNumber: vi.fn(),
  isConsolidatedInvoice: vi.fn(() => false),
  deleteInvoiceById: vi.fn(),
  subscribeManifestTerceros: vi.fn((manifest, cb) => {
    cb?.(new Map());
    return () => {};
  }),
}));

vi.mock("@/lib/services/nova-terceros-service", () => ({
  subscribeManifestTerceros: vi.fn((manifest, cb) => {
    cb?.(new Map());
    return () => {};
  }),
  createTerceroRow: vi.fn(),
  updateTerceroRow: vi.fn(),
  deleteTerceroRow: vi.fn(),
}));

vi.mock("@/lib/services/nova-tools", () => ({
  batchCheckTrackingPreAlerts: vi.fn(async () => ({})),
  watchTrackingPreAlerts: vi.fn((trackings, onChange) => {
    // Return a pre-alert matching tracking '1Z0000' but registered to client 'SL1111'
    const map = new Map();
    map.set("1Z0000", {
      found: true,
      tracking: "1Z0000",
      slCode: "SL1111",
    });
    onChange(map);
    return () => {};
  }),
}));

vi.mock("@/lib/services/update-exchange-rate-service", () => ({
  updateManifestExchangeRate: vi.fn(),
  updateInvoicesExchangeRate: vi.fn(async () => ({ invoicesUpdated: 1, skippedInvoicesAnnulled: 0, errors: [] })),
}));

// Mock UI modals to avoid nesting complex components
vi.mock("@/components/nova/NovaInvoicePreview", () => ({
  NovaInvoicePreview: () => null,
}));
vi.mock("@/components/nova/NovaEditCustomerModal", () => ({
  NovaEditCustomerModal: () => null,
}));
vi.mock("@/components/nova/NovaCustomerQuickViewModal", () => ({
  NovaCustomerQuickViewModal: () => null,
}));
vi.mock("@/components/nova/NovaShippingLabelModal", () => ({
  NovaShippingLabelModal: () => null,
}));
vi.mock(".././NovaUnlinkActionModal", () => ({
  NovaUnlinkActionModal: () => null,
}));
vi.mock(".././NovaNameEditConfirmModal", () => ({
  NovaNameEditConfirmModal: () => null,
}));
vi.mock(".././NovaPesoEditConfirmModal", () => ({
  NovaPesoEditConfirmModal: () => null,
}));
vi.mock(".././NovaPriceAdjustmentModal", () => ({
  PriceAdjustmentModal: () => null,
}));
vi.mock(".././NovaCustomerSearchModal", () => ({
  CustomerSearchModal: ({ onSelected, onClose }: any) => (
    <div data-testid="mock-customer-search-modal">
      <button data-testid="mock-select-customer-btn" onClick={() => onSelected("SL9999", "NEW CLIENT", "Ruta A")}>
        Select Customer
      </button>
      <button data-testid="mock-close-search-btn" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));
vi.mock(".././NovaCreateCustomerModal", () => ({
  CreateCustomerModal: ({ onCreated, onClose }: any) => (
    <div data-testid="mock-create-customer-modal">
      <button data-testid="mock-create-customer-confirm-btn" onClick={() => onCreated("SL9999", "Ruta A")}>
        Confirm Create
      </button>
      <button data-testid="mock-close-create-btn" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));
vi.mock(".././NovaRoutePickerModal", () => ({
  RoutePickerModal: () => null,
}));
vi.mock("@/components/nova/modal/NovaMergeGroupsConfirmModal", () => ({
  NovaMergeGroupsConfirmModal: () => null,
}));
vi.mock("@/components/nova/modal/NovaDeleteInvoiceConfirmModal", () => ({
  NovaDeleteInvoiceConfirmModal: () => null,
}));
vi.mock("@/components/nova/modal/NovaSaveConfirmModal", () => ({
  NovaSaveConfirmModal: ({ open, onConfirmSaveOnly }: any) => {
    if (!open) return null;
    return (
      <div data-testid="nova-save-confirm-modal">
        <button
          data-testid="confirm-save-only-btn"
          onClick={onConfirmSaveOnly}
        >
          Confirmar Guardar
        </button>
      </div>
    );
  },
}));
vi.mock("@/components/nova/modal/NovaIntegrityModal", () => ({
  NovaIntegrityModal: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => {
  const React = require("react");
  return {
    DropdownMenu: ({ children }: any) => React.createElement("div", null, children),
    DropdownMenuTrigger: ({ children, asChild, ...props }: any) => {
      if (asChild) {
        return React.cloneElement(children, props);
      }
      return React.createElement("button", props, children);
    },
    DropdownMenuContent: ({ children }: any) => React.createElement("div", null, children),
    DropdownMenuItem: ({ children, onClick, className, ...props }: any) => 
      React.createElement("button", { onClick, className, ...props }, children),
    DropdownMenuCheckboxItem: ({ children, onClick, checked, className, ...props }: any) => 
      React.createElement("button", { onClick, className, "data-checked": checked, ...props }, children),
    DropdownMenuLabel: ({ children, className }: any) => React.createElement("div", { className }, children),
    DropdownMenuSeparator: () => React.createElement("hr", null),
    DropdownMenuGroup: ({ children }: any) => React.createElement("div", null, children),
    DropdownMenuPortal: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

vi.mock("@/components/ui/dialog", () => {
  const React = require("react");
  return {
    Dialog: ({ children, open }: any) => open ? React.createElement("div", { "data-testid": "dialog-root" }, children) : null,
    DialogTrigger: ({ children }: any) => children,
    DialogPortal: ({ children }: any) => children,
    DialogOverlay: ({ children }: any) => children,
    DialogClose: ({ children }: any) => children,
    DialogContent: ({ children, className }: any) => React.createElement("div", { className }, children),
    DialogHeader: ({ children }: any) => React.createElement("div", null, children),
    DialogFooter: ({ children, className }: any) => React.createElement("div", { className }, children),
    DialogTitle: ({ children }: any) => React.createElement("h2", null, children),
    DialogDescription: ({ children, className }: any) => React.createElement("div", { className }, children),
  };
});

vi.mock(".././nova-route-options", () => {
  const ROUTE_OPTIONS_MOCK = [
    { name: "San Jose Centro" },
    { name: "San Jose Escazu" },
    { name: "Cartago 1" },
    { name: "Encomiendas" },
    { name: "Desconocida" },
  ];
  return {
    useRouteOptions: () => ROUTE_OPTIONS_MOCK,
    ROUTE_OPTIONS: ROUTE_OPTIONS_MOCK,
    buildRouteOption: (name: string) => ({
      name,
      bg: "bg-zinc-200/40 dark:bg-zinc-700/15",
      bgFaint: "bg-zinc-200/30 dark:bg-zinc-700/10",
      text: "text-zinc-600 dark:text-zinc-400",
      border: "border-zinc-300 dark:border-zinc-600",
      borderL: "border-l-zinc-400 dark:border-l-zinc-500",
      borderT: "border-t-zinc-400 dark:border-t-zinc-500",
      borderB: "border-b-zinc-400 dark:border-b-zinc-500",
      borderTFaint: "border-t-zinc-400/30 dark:border-t-zinc-500/20",
      ring: "ring-zinc-400",
    }),
    abbrevRoute: (name: string) => name,
  };
});

import { ResultSummary } from ".././NovaTableModal";
import type { NovaMessage } from "@/hooks/use-nova-chat";
import type { ManifestRow } from "@/lib/services/manifest-processor";

function makeRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    tracking: "1Z0000",
    nombre: "PAULA UMANA",
    guia: "1Z0000",
    manifiesto: "MEGA-MAN-24-04-2026",
    peso: 1,
    precio: 10,
    slCode: "SL3521",
    nombreCliente: "ANA PAULA FONSECA QUADROS",
    ruta: "San Jose Centro",
    consolidacion: false,
    descripcion: "RELOJES",
    permisos: false,
    pesoRedondeo: 0,
    diferenciaRedondeo: 0,
    pesoConsolidacion: 0,
    precioSinPermiso: 10,
    precioConPermiso: 10,
    matchScore: 1,
    originalData: {},
    ...overrides,
  } as ManifestRow;
}

const defaultResultData: NonNullable<NovaMessage["resultData"]> = {
  manifestNumber: "MAN-123",
  manifestType: "usa_air",
  rows: [makeRow()],
  summary: {
    totalRows: 1,
    processedRows: 1,
    errors: 0,
    totalPrice: 10,
    customersMatched: 1,
    namesCorrections: 0,
    weightCorrections: 0,
  },
  corrections: [],
  validation: {
    isValid: true,
    issues: [],
    suggestions: [],
  },
  multiMatchRows: [],
  requiresUserChoice: false,
  loadedFromFirestore: false,
};

describe("NovaTableModal - Manual Validation and Interactive UI Specs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Direct Firestore Load
  it("initializes showTable to true directly when loadedFromFirestore is present", () => {
    const firestoreResultData = {
      ...defaultResultData,
      loadedFromFirestore: true,
    };

    render(
      <ResultSummary
        resultData={firestoreResultData}
        embedMode={false}
      />
    );

    // Verify modal is immediately visible (we shouldn't find the "Ver tabla" button,
    // and instead the table toolbar and actions button should be present)
    expect(screen.queryByText("Ver tabla")).toBeNull();
    expect(screen.getByTestId("nova-toolbar-actions")).toBeTruthy();
  });

  it("initializes showTable to false when loadedFromFirestore is false", () => {
    const freshResultData = {
      ...defaultResultData,
      loadedFromFirestore: false,
    };

    render(
      <ResultSummary
        resultData={freshResultData}
        embedMode={false}
      />
    );

    // Since showTable is false, the modal is closed and we see the "Ver tabla" button trigger
    expect(screen.getByText("Ver tabla")).toBeTruthy();
  });

  // 2. Manual Action Validation & Blur & Fade Out
  it("displays the progress overlay and applies blur on table wrapper during manual validations, then fades out", async () => {
    console.log("TEST3: Start");

    // Mock handleUnlinkAndRematch to trigger progress events and then yield control via setTimeout
    handleUnlinkAndRematchMock.mockImplementation(
      async (indices: number[], getNombre: any, onProgress: any) => {
        console.log("TEST3: handleUnlinkAndRematchMock mock implementation called");
        if (onProgress) {
          console.log("TEST3: Calling onProgress(1, 2)");
          onProgress(1, 2);
        }
        // Yield execution to allow testing intermediate state
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (onProgress) {
          console.log("TEST3: Calling onProgress(2, 2)");
          onProgress(2, 2);
        }
      }
    );

    const firestoreResultData = {
      ...defaultResultData,
      loadedFromFirestore: true,
    };

    console.log("TEST3: Rendering ResultSummary");
    render(
      <ResultSummary
        resultData={firestoreResultData}
        embedMode={false}
      />
    );

    // Open Actions dropdown
    console.log("TEST3: Clicking toolbar-actions");
    const toolbarActions = screen.getByTestId("nova-toolbar-actions");
    fireEvent.click(toolbarActions);

    // Click "Re-validar todo" dropdown item
    console.log("TEST3: Clicking revalidate-all-button");
    const revalidateBtn = screen.getByTestId("nova-revalidate-all-button");
    fireEvent.click(revalidateBtn);

    // Click confirm in the revalidate all dialog
    console.log("TEST3: Clicking revalidate-all-confirm");
    const confirmBtn = screen.getByTestId("nova-revalidate-all-confirm");
    act(() => {
      fireEvent.click(confirmBtn);
    });

    console.log("TEST3: Checking overlay existence");
    // Check validation progress overlay is active
    const overlay = document.getElementById("validation-progress-overlay");
    expect(overlay).toBeTruthy();
    expect(overlay!.className).toContain("opacity-100");
    expect(overlay!.textContent).toContain("Progreso: 50%");

    console.log("TEST3: Checking table blur");
    // Verify table wrapper has the blur-[3px] class
    // The table wrapper is the div with class containing flex-1 overflow-auto
    const tableElement = screen.getByRole("table");
    const tableWrapper = tableElement.closest("div");
    expect(tableWrapper?.className).toContain("blur-[3px]");

    console.log("TEST3: Waiting for handleUnlinkAndRematchMock mock implementation to finish progress steps");
    // Wait for the mock's setTimeout (100ms) to fire and complete the promise
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    console.log("TEST3: Checking opacity-0");
    // Once completed, it sets isFadingOut: true
    expect(overlay!.className).toContain("opacity-0");

    console.log("TEST3: Waiting for fade out (600ms)");
    // Wait for the fade-out timeout (500ms + some buffer) using real timers
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    console.log("TEST3: Checking overlay is null");
    expect(document.getElementById("validation-progress-overlay")).toBeNull();
    expect(tableWrapper?.className).not.toContain("blur-[3px]");
    console.log("TEST3: Done");
  });

  // 3. Pause Auto-save
  it("disables auto-save during manual validations, and resumes auto-save when explicit save actions are invoked", async () => {
    console.log("TEST4: Start");
    handleUnlinkAndRematchMock.mockImplementation(
      async (indices: number[], getNombre: any, onProgress: any) => {
        console.log("TEST4: handleUnlinkAndRematchMock called");
        if (onProgress) {
          onProgress(1, 1);
        }
      }
    );

    const firestoreResultData = {
      ...defaultResultData,
      loadedFromFirestore: true,
    };

    console.log("TEST4: Rendering ResultSummary");
    const { rerender } = render(
      <ResultSummary
        resultData={firestoreResultData}
        embedMode={false}
      />
    );

    // Verify useNovaAutoSave was called initially with enabled: false
    // (since it is loaded from firestore, auto-save is disabled by dataOriginPolicy)
    expect(useNovaAutoSaveSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    );

    // Open Actions dropdown
    console.log("TEST4: Clicking toolbar-actions");
    const toolbarActions = screen.getByTestId("nova-toolbar-actions");
    fireEvent.click(toolbarActions);

    // Click "Re-validar todo" dropdown item
    console.log("TEST4: Clicking revalidate-all-button");
    const revalidateBtn = screen.getByTestId("nova-revalidate-all-button");
    fireEvent.click(revalidateBtn);

    // Click confirm in the revalidate all dialog
    console.log("TEST4: Clicking revalidate-all-confirm");
    const confirmBtn = screen.getByTestId("nova-revalidate-all-confirm");
    act(() => {
      fireEvent.click(confirmBtn);
    });

    // Now auto-save must be paused (enabled: false)
    expect(useNovaAutoSaveSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    );

    console.log("TEST4: Awaiting handleUnlinkAndRematchMock result value");
    // Wait for handleUnlinkAndRematch to resolve
    await act(async () => {
      await handleUnlinkAndRematchMock.mock.results[0].value;
    });

    console.log("TEST4: Waiting 600ms");
    // Wait for the re-validation to finish and fade out to resolve using real setTimeout
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    // Verify it is still paused after validation completes because only explicit save resumes it
    expect(useNovaAutoSaveSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    );

    // Open the save confirm modal by clicking "Guardar en BD" / "Actualizar BD" button
    console.log("TEST4: Clicking save-btn");
    const saveBtn = screen.getByRole("button", {
      name: /Actualizar BD|Guardar en BD/,
    });
    fireEvent.click(saveBtn);

    // Click confirm save button inside the modal
    console.log("TEST4: Clicking confirm-save-only-btn");
    const confirmSaveOnly = screen.getByTestId("confirm-save-only-btn");
    fireEvent.click(confirmSaveOnly);

    // Verify auto-save remains disabled (enabled: false) for firestore origin manifest
    expect(useNovaAutoSaveSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false })
    );
    console.log("TEST4: Done");
  });

  // 4. Skeleton Loader
  it("renders 5 skeleton rows in tbody when isFiltering is active, then replaces them with normal rows once debounced", async () => {
    const firestoreResultData = {
      ...defaultResultData,
      loadedFromFirestore: true,
    };

    render(
      <ResultSummary
        resultData={firestoreResultData}
        embedMode={false}
      />
    );

    // Locate the search input filter
    const filterInput = screen.getByPlaceholderText(
      "Filtrar por tracking, nombre, cliente, ruta..."
    );

    // Simulate typing a filter
    fireEvent.change(filterInput, { target: { value: "PAULA" } });

    // Since the input filter changed but debounce hasn't completed, isFiltering is true.
    // Verify 5 skeleton rows are rendered.
    const tbody = screen.getByRole("table").querySelector("tbody");
    expect(tbody).toBeTruthy();
    const skeletonRows = tbody?.querySelectorAll("tr.animate-pulse");
    expect(skeletonRows?.length).toBe(5);

    // Wait 350ms to resolve debounce using real timers
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // Skeletons should be gone and normal rows matching the filter should be displayed.
    const rowsAfterDebounce = tbody?.querySelectorAll("tr");
    expect(tbody?.querySelector("tr.animate-pulse")).toBeNull();
    expect(rowsAfterDebounce?.length).toBeGreaterThan(0);
  });

  // 5. Pre-Alert Mismatch Warning Dialog Flow
  it("shows the reassign mismatch warning dialog when reassigning a package with a pre-alert to a different customer", async () => {
    const firestoreResultData = {
      ...defaultResultData,
      loadedFromFirestore: true,
      rows: [
        makeRow({
          tracking: "1Z0000",
          nombre: "PAULA UMANA",
          slCode: "SL3521",
          nombreCliente: "ANA PAULA FONSECA QUADROS",
        })
      ],
    };

    render(
      <ResultSummary
        resultData={firestoreResultData}
        embedMode={false}
      />
    );

    // 1. Open row Actions dropdown
    const rowActionsBtn = screen.getAllByRole("button", { name: /Acciones/ })[1];
    expect(rowActionsBtn).toBeTruthy();
    fireEvent.click(rowActionsBtn);

    // 2. Click "Vincular a otro cliente" dropdown item
    const linkOtherBtn = screen.getByRole("button", { name: /Vincular a otro cliente/ });
    expect(linkOtherBtn).toBeTruthy();
    fireEvent.click(linkOtherBtn);

    // 3. Confirm that the CustomerSearchModal is rendered as mock
    const mockModal = screen.getByTestId("mock-customer-search-modal");
    expect(mockModal).toBeTruthy();

    // 4. Click "Select Customer" to choose "SL9999", which differs from the pre-alert client "SL1111"
    const selectCustomerBtn = screen.getByTestId("mock-select-customer-btn");
    fireEvent.click(selectCustomerBtn);

    // 5. Verify the CustomerSearchModal is closed
    expect(screen.queryByTestId("mock-customer-search-modal")).toBeNull();

    // 6. Verify the Reassign Pre-Alert Mismatch Warning AlertDialog is now visible
    expect(screen.getByText("Advertencia de Re-asignación de Pre-alerta")).toBeTruthy();
    expect(screen.getAllByText("1Z0000").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("SL1111")).toBeTruthy();
    expect(screen.getByText(/SL9999/)).toBeTruthy();

    // 7. Click "Confirmar reasignación" button to proceed
    const confirmReassignBtn = screen.getByRole("button", { name: "Confirmar reasignación" });
    expect(confirmReassignBtn).toBeTruthy();
    
    act(() => {
      fireEvent.click(confirmReassignBtn);
    });

    // 8. Verify the AlertDialog has closed
    expect(screen.queryByText("Advertencia de Re-asignación de Pre-alerta")).toBeNull();
  });
});
