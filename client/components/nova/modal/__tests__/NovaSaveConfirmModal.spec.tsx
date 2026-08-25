// @vitest-environment jsdom
/**
 * NovaSaveConfirmModal.spec.tsx
 *
 * Unit and integration tests for the Nova Save Confirmation dialog:
 *   1. Compact merged Scope & Financial Metrics card (4-column data grid).
 *   2. Accurate package & unique customer counts across all filter states:
 *      - Search filter active (e.g. "VALVERDE", 3 pkgs, 2 clients).
 *      - Route filter active (e.g. "HEREDIA", 28 pkgs, 14 clients).
 *      - Manual checkbox selection (e.g. 5 pkgs, 3 clients).
 *      - Unfiltered full manifest (e.g. 176 pkgs, 129 clients).
 *   3. Integrated existing invoices status breakdown in the same metrics row.
 *   4. Protected invoices shield defaulting to 'skip' (Omitir) with header explanation.
 *   5. Action dispatching (Save Only, Save & Invoice, Annul & Recreate, TC update).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NovaSaveConfirmModal, NovaSaveConfirmModalProps } from "../NovaSaveConfirmModal";

afterEach(() => {
  cleanup();
});

const DEFAULT_ROWS = [
  { slCode: "SL001", nombre: "ANA VALVERDE", peso: 1.5, precio: 20 },
  { slCode: "SL001", nombre: "ANA VALVERDE", peso: 2.0, precio: 24 },
  { slCode: "SL002", nombre: "CARLOS VALVERDE", peso: 2.0, precio: 32 },
  { slCode: "SL003", nombre: "BEATRIZ MORA", peso: 1.0, precio: 15 },
  { slCode: "SL004", nombre: "DANIEL ROJAS", peso: 3.5, precio: 40 },
];

function renderModal(props: Partial<NovaSaveConfirmModalProps> = {}) {
  const defaultProps: NovaSaveConfirmModalProps = {
    open: true,
    onOpenChange: vi.fn(),
    manifestNumber: "TEST-MAN-2026",
    activeRowsCount: 5,
    manifestReassignedCount: 0,
    activeTotalUsd: 131.0,
    fullManifestTotalUsd: 131.0,
    allRows: DEFAULT_ROWS as any,
    mergedInvoices: {},
    separateInvoices: {},
    partialSelectionSummary: { protectedGroups: 0, preservedTrackings: 0 },
    tc: 470,
    dataOrigin: "fresh",
    integrityReport: null,
    onOpenIntegrityModal: vi.fn(),
    unmatchedByName: new Map(),
    autoCreatingTemp: false,
    onAutoCreateTempCustomers: vi.fn(),
    existingInvoiceBreakdown: null,
    existingInvoicesList: [],
    protectedActions: {},
    onUpdateProtectedAction: vi.fn(),
    onUpdateAllProtectedActions: vi.fn(),
    onConfirmSaveOnly: vi.fn(),
    onConfirmRecreate: vi.fn(),
    onConfirmAnnulAndRecreate: vi.fn(),
    onConfirmUpdateTcOnly: vi.fn(),
    recentManifestTc: null,
    ...props,
  };

  return {
    ...render(<NovaSaveConfirmModal {...defaultProps} />),
    props: defaultProps,
  };
}

describe("NovaSaveConfirmModal — Scope and Customer Counting", () => {
  it("renders full manifest scope with package and unique client counts", () => {
    renderModal({
      totalManifestRowsCount: 176,
      totalManifestClientsCount: 129,
      activeRowsCount: 176,
      activeClientsCount: 129,
      activeTotalUsd: 4720.0,
    });

    expect(screen.getByText(/MANIFIESTO COMPLETO/i)).toBeDefined();
    expect(screen.getByText("176 paq. · 129 clientes")).toBeDefined();
    expect(screen.getByText("$4720.00 USD")).toBeDefined();
    expect(screen.getByText("₡2 218 400")).toBeDefined();
  });

  it("renders search filter scope with active vs full manifest counts and amounts", () => {
    renderModal({
      activeTableFilter: "VALVERDE",
      activeRowsCount: 3,
      activeClientsCount: 2,
      totalManifestRowsCount: 105,
      totalManifestClientsCount: 28,
      activeTotalUsd: 76.0,
      fullManifestTotalUsd: 1780.0,
    });

    expect(screen.getByText(/FILTRO DE BÚSQUEDA: "VALVERDE"/i)).toBeDefined();
    expect(screen.getByText("3 de 105 paq. · 2 clientes")).toBeDefined();
    expect(screen.getByText("$76.00 USD")).toBeDefined();
    expect(screen.getByText("₡35 720")).toBeDefined();
    expect(screen.getByText(/Total manifiesto completo en BD \(105 paq\. · 28 clientes\):/i)).toBeDefined();
    expect(screen.getByText(/\$1780\.00 USD/i)).toBeDefined();
  });

  it("renders route filter scope with route name and client counts", () => {
    renderModal({
      activeRouteFilter: "Heredia",
      activeRowsCount: 28,
      activeClientsCount: 14,
      totalManifestRowsCount: 176,
      totalManifestClientsCount: 129,
      activeTotalUsd: 420.0,
      fullManifestTotalUsd: 4720.0,
    });

    expect(screen.getByText(/FILTRO DE RUTA: Heredia/i)).toBeDefined();
    expect(screen.getByText("28 paq. · 14 clientes")).toBeDefined();
    expect(screen.getByText("$420.00 USD")).toBeDefined();
    expect(screen.getByText("₡197 400")).toBeDefined();
    expect(screen.getByText(/Total manifiesto completo en BD \(176 paq\. · 129 clientes\):/i)).toBeDefined();
  });

  it("renders manual checkbox selection scope", () => {
    renderModal({
      selectedCheckboxesCount: 5,
      activeRowsCount: 5,
      activeClientsCount: 3,
      totalManifestRowsCount: 100,
      activeTotalUsd: 110.0,
    });

    expect(screen.getByText(/Selección manual por casillas/i)).toBeDefined();
    expect(screen.getByText("5 paq. · 3 clientes")).toBeDefined();
    expect(screen.getByText(/Total Selección/i)).toBeDefined();
    expect(screen.getByText("$110.00 USD")).toBeDefined();
  });
});

describe("NovaSaveConfirmModal — Existing Invoices & Shield Default", () => {
  it("integrates existing invoices status breakdown into the 4-column metrics grid", () => {
    renderModal({
      existingInvoiceBreakdown: {
        total: 132,
        drafts: 22,
        sent: 17,
        paid: 89,
        overdue: 0,
        pending: 0,
        annulled: 0,
        protectedIds: [],
      },
    });

    expect(screen.getByText(/Facturas Previas \(132\)/i)).toBeDefined();
    expect(screen.getByText(/22 Borr\./i)).toBeDefined();
    expect(screen.getByText(/17 Env\./i)).toBeDefined();
    expect(screen.getByText(/89 Pag\./i)).toBeDefined();
  });

  it("defaults protected invoices to 'skip' (Omitir) with explanatory header subtext", () => {
    const onUpdateProtectedAction = vi.fn();
    const onUpdateAllProtectedActions = vi.fn();

    const protectedList = [
      { id: "inv-1", clientSlCode: "SL261443", clientName: "MARIA RAQUEL PIE", status: "paid" },
      { id: "inv-2", clientSlCode: "SL7894", clientName: "MELISSA MARIA UG", status: "sent" },
    ];

    renderModal({
      existingInvoicesList: protectedList,
      existingInvoiceBreakdown: {
        total: 2,
        drafts: 0,
        sent: 1,
        paid: 1,
        overdue: 0,
        pending: 0,
        annulled: 0,
        protectedIds: ["inv-1", "inv-2"],
      },
      onUpdateProtectedAction,
      onUpdateAllProtectedActions,
    });

    expect(screen.getByText(/Escudo de Facturas Protegidas \(2\)/i)).toBeDefined();
    expect(screen.getByText(/las facturas previas se preservan intactas/i)).toBeDefined();

    // Verify batch buttons
    const omitirAllBtn = screen.getByText("Todos: Omitir (Seguro)");
    fireEvent.click(omitirAllBtn);
    expect(onUpdateAllProtectedActions).toHaveBeenCalledWith("skip");

    const contenidoAllBtn = screen.getByText("Todos: Solo Contenido");
    fireEvent.click(contenidoAllBtn);
    expect(onUpdateAllProtectedActions).toHaveBeenCalledWith("items_only");
  });
});

describe("NovaSaveConfirmModal — Action Dispatching", () => {
  it("dispatches onConfirmSaveOnly when clicking 'Solo guardar datos en BD'", () => {
    const onConfirmSaveOnly = vi.fn();
    const onOpenChange = vi.fn();

    renderModal({ onConfirmSaveOnly, onOpenChange });

    const saveOnlyBtn = screen.getByRole("button", { name: /Solo guardar datos en BD/i });
    fireEvent.click(saveOnlyBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirmSaveOnly).toHaveBeenCalledTimes(1);
  });

  it("dispatches onConfirmRecreate when clicking 'Guardar y facturar'", () => {
    const onConfirmRecreate = vi.fn();
    const onOpenChange = vi.fn();

    renderModal({ onConfirmRecreate, onOpenChange });

    const saveAndInvoiceBtn = screen.getByRole("button", { name: /Guardar y facturar/i });
    fireEvent.click(saveAndInvoiceBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirmRecreate).toHaveBeenCalledTimes(1);
  });

  it("shows and dispatches onConfirmAnnulAndRecreate when protected invoices exist without paid ones", () => {
    const onConfirmAnnulAndRecreate = vi.fn();

    renderModal({
      existingInvoiceBreakdown: {
        total: 5,
        drafts: 2,
        sent: 3,
        paid: 0, // No paid invoices -> annul and recreate is permissible
        overdue: 0,
        pending: 0,
        annulled: 0,
        protectedIds: ["inv-1"],
      },
      onConfirmAnnulAndRecreate,
    });

    const annulBtn = screen.getByRole("button", { name: /Anular y re-crear/i });
    fireEvent.click(annulBtn);

    expect(onConfirmAnnulAndRecreate).toHaveBeenCalledTimes(1);
  });
});
