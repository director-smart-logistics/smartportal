// @vitest-environment jsdom
/**
 * NovaDeleteInvoiceConfirmModal — interaction tests.
 *
 * Contract:
 *   1. Renders nothing when no invoice target is provided (defensive).
 *   2. Shows invoice identity card (number, customer, total, status).
 *   3. Draft invoices: confirm button enabled immediately.
 *   4. Protected invoices (sent/paid/overdue/pending): typed-confirmation
 *      gate — confirm button disabled until "ELIMINAR" is typed verbatim.
 *   5. Paid invoices show extra "anula instead" warning.
 *   6. onClose / onConfirm callbacks fire on respective buttons.
 *   7. Typed-confirmation field clears between target switches.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  NovaDeleteInvoiceConfirmModal,
  type DeleteInvoiceTarget,
} from ".././NovaDeleteInvoiceConfirmModal";

const DRAFT_INV: DeleteInvoiceTarget = {
  invoiceId: "inv-draft-1",
  invoiceNumber: "SL_X-202604280000",
  clientName: "X CUSTOMER",
  clientSlCode: "SL_X",
  status: "draft",
  totalAmount: 25,
};

const SENT_INV: DeleteInvoiceTarget = {
  ...DRAFT_INV,
  invoiceId: "inv-sent-1",
  invoiceNumber: "SL_X-202604280001",
  status: "sent",
};

const PAID_INV: DeleteInvoiceTarget = {
  ...DRAFT_INV,
  invoiceId: "inv-paid-1",
  invoiceNumber: "SL_X-202604280002",
  status: "paid",
  totalAmount: 100,
};

describe("NovaDeleteInvoiceConfirmModal", () => {
  afterEach(() => cleanup());

  it("renders nothing when invoice is null even if open=true", () => {
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={null}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByTestId("nova-delete-invoice-modal")).toBeNull();
  });

  it("renders the identity card with all key fields", () => {
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={DRAFT_INV}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const card = screen.getByTestId("nova-delete-invoice-target");
    expect(card.textContent).toMatch(/SL_X-202604280000/);
    expect(card.textContent).toMatch(/X CUSTOMER/);
    expect(card.textContent).toMatch(/SL_X/);
    expect(card.textContent).toMatch(/\$25\.00/);
  });

  it("enables Confirm immediately for DRAFT invoices (no typed gate)", () => {
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={DRAFT_INV}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const confirmBtn = screen.getByTestId(
      "nova-delete-invoice-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    expect(screen.queryByTestId("nova-delete-invoice-typed-gate")).toBeNull();
  });

  it("shows the typed-confirmation gate for SENT invoices and disables Confirm until typed", () => {
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={SENT_INV}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const confirmBtn = screen.getByTestId(
      "nova-delete-invoice-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    const input = screen.getByTestId(
      "nova-delete-invoice-typed-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "eliminar" } });
    expect(confirmBtn.disabled).toBe(false); // case-insensitive
  });

  it("shows the PAID warning + typed gate for PAID invoices", () => {
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={PAID_INV}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-delete-invoice-paid-warning")).toBeTruthy();
    expect(screen.getByTestId("nova-delete-invoice-typed-gate")).toBeTruthy();
    const confirmBtn = screen.getByTestId(
      "nova-delete-invoice-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("does NOT enable Confirm when the typed input is wrong", () => {
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={SENT_INV}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "nova-delete-invoice-typed-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "borrar" } });
    const confirmBtn = screen.getByTestId(
      "nova-delete-invoice-confirm",
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("calls onConfirm when Confirm is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={DRAFT_INV}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-delete-invoice-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={DRAFT_INV}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-delete-invoice-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clears the typed-confirmation field when the target invoice changes", () => {
    const { rerender } = render(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={SENT_INV}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "nova-delete-invoice-typed-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ELIMINAR" } });
    expect(input.value).toBe("ELIMINAR");

    rerender(
      <NovaDeleteInvoiceConfirmModal
        open
        invoice={{ ...SENT_INV, invoiceId: "inv-different" }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const newInput = screen.getByTestId(
      "nova-delete-invoice-typed-input",
    ) as HTMLInputElement;
    expect(newInput.value).toBe("");
  });
});
