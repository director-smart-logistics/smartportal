// @vitest-environment jsdom
/**
 * NovaMergeGroupsConfirmModal — render & interaction tests.
 *
 * Contract:
 *   1. Renders nothing when `open === false`.
 *   2. Side-by-side panes show source + target customer/slCode/row count.
 *   3. Aggregate result preview sums weight + price.
 *   4. Invoice impact section copy adapts to the status (sent → warning,
 *      draft → info, no invoice → "se creará").
 *   5. Cancel + Confirm buttons fire their respective callbacks exactly
 *      once and wire to the right test ids.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  NovaMergeGroupsConfirmModal,
  type MergeGroupSummary,
  type MergeInvoiceImpact,
} from ".././NovaMergeGroupsConfirmModal";

const SOURCE: MergeGroupSummary = {
  customerName: "INDIRA LIZETH TENORIO QUESADA",
  slCode: "",
  rowCount: 1,
  totalWeight: 0.92,
  totalPrice: 12,
  ruta: "",
};

const TARGET: MergeGroupSummary = {
  customerName: "INDIRA LIZETH TENORIO QUESADA",
  slCode: "SL13897",
  rowCount: 1,
  totalWeight: 3.52,
  totalPrice: 48,
  ruta: "METROPOLITANA",
};

const SENT_INVOICE: MergeInvoiceImpact = {
  invoiceNumber: "SL13897-20260428000000-C",
  status: "sent",
  totalAmount: 48,
};

describe("NovaMergeGroupsConfirmModal", () => {
  afterEach(() => cleanup());

  it("renders nothing when closed", () => {
    render(
      <NovaMergeGroupsConfirmModal
        open={false}
        source={SOURCE}
        target={TARGET}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByTestId("nova-merge-side-by-side")).toBeNull();
  });

  it("renders both panes side-by-side when open", () => {
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-merge-side-by-side")).toBeTruthy();
    const sourcePane = screen.getByTestId("nova-merge-source");
    const targetPane = screen.getByTestId("nova-merge-target");
    expect(sourcePane.textContent).toMatch(/sin slCode/i);
    expect(sourcePane.textContent).toMatch(/INDIRA LIZETH TENORIO QUESADA/);
    expect(targetPane.textContent).toMatch(/SL13897/);
    expect(targetPane.textContent).toMatch(/METROPOLITANA/);
  });

  it("aggregates the result preview with summed weight + price", () => {
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const result = screen.getByTestId("nova-merge-result");
    expect(result.textContent).toMatch(/2 paquetes/);
    expect(result.textContent).toMatch(/SL13897/);
    expect(result.textContent).toMatch(/4\.44 kg/);
    expect(result.textContent).toMatch(/\$60\.00/);
  });

  it('shows the warning copy for a "sent" invoice impact', () => {
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        invoiceImpact={SENT_INVOICE}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const impact = screen.getByTestId("nova-merge-invoice-impact");
    expect(impact.textContent).toMatch(/SL13897-20260428000000-C/);
    expect(impact.textContent).toMatch(/Enviada/);
    expect(impact.textContent).toMatch(/Anular y re-crear/i);
  });

  it('shows the auto-update copy for a "draft" invoice impact', () => {
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        invoiceImpact={{ ...SENT_INVOICE, status: "draft" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const impact = screen.getByTestId("nova-merge-invoice-impact");
    expect(impact.textContent).toMatch(/Borrador/);
    expect(impact.textContent).toMatch(/actualizar/i);
  });

  it('shows the "no invoice" hint when no impact is provided', () => {
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-merge-no-invoice")).toBeTruthy();
    expect(screen.queryByTestId("nova-merge-invoice-impact")).toBeNull();
  });

  it("calls onClose when Cancel is clicked, NOT onConfirm", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-merge-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm exactly once when Confirm is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={SOURCE}
        target={TARGET}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-merge-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("pluralizes the confirm button copy when source has >1 row", () => {
    render(
      <NovaMergeGroupsConfirmModal
        open
        source={{ ...SOURCE, rowCount: 3 }}
        target={TARGET}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const confirm = screen.getByTestId("nova-merge-confirm");
    expect(confirm.textContent).toMatch(/Fusionar 3 paquetes/);
  });
});
