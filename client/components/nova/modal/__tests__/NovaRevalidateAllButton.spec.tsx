// @vitest-environment jsdom

/**
 * NovaRevalidateAllButton — interaction tests.
 *
 * Contract:
 *   1. Renders nothing for FRESH policy (auto-validation already runs).
 *   2. Renders the button + opens confirmation dialog on click for FIRESTORE.
 *   3. Confirmation modal mentions row count + warns about overwriting
 *      manual assignments.
 *   4. Cancel closes the dialog WITHOUT calling onConfirm (the destructive
 *      action must require explicit confirmation).
 *   5. Confirm calls onConfirm exactly once and closes the dialog.
 *   6. Button is disabled when rowCount === 0 (nothing to revalidate).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NovaRevalidateAllButton } from ".././NovaRevalidateAllButton";
import { FRESH_POLICY, FIRESTORE_POLICY } from "@/lib/nova/data-origin";

describe("NovaRevalidateAllButton", () => {
  afterEach(() => cleanup());

  it("renders the button for FRESH policy (BUG-VER-TABLA-FREEZE: manual redo escape hatch)", () => {
    render(
      <NovaRevalidateAllButton
        policy={FRESH_POLICY}
        rowCount={10}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-revalidate-all-button")).toBeTruthy();
  });

  it("renders the button for FIRESTORE policy", () => {
    render(
      <NovaRevalidateAllButton
        policy={FIRESTORE_POLICY}
        rowCount={10}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-revalidate-all-button")).toBeTruthy();
  });

  it("disables the button when rowCount === 0", () => {
    render(
      <NovaRevalidateAllButton
        policy={FIRESTORE_POLICY}
        rowCount={0}
        onConfirm={() => {}}
      />,
    );
    const btn = screen.getByTestId(
      "nova-revalidate-all-button",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("opens the confirmation dialog on click", () => {
    render(
      <NovaRevalidateAllButton
        policy={FIRESTORE_POLICY}
        rowCount={42}
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-revalidate-all-button"));
    expect(screen.getByTestId("nova-revalidate-all-confirm")).toBeTruthy();
  });

  it("mentions the row count + manual-override warning in the dialog copy", () => {
    render(
      <NovaRevalidateAllButton
        policy={FIRESTORE_POLICY}
        rowCount={42}
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-revalidate-all-button"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/42/);
    expect(dialog.textContent).toMatch(/sobreescrita/i);
  });

  it("does NOT call onConfirm when the operator clicks Cancel", () => {
    const onConfirm = vi.fn();
    render(
      <NovaRevalidateAllButton
        policy={FIRESTORE_POLICY}
        rowCount={5}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-revalidate-all-button"));
    fireEvent.click(screen.getByTestId("nova-revalidate-all-cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm exactly once when the operator clicks Confirm", () => {
    const onConfirm = vi.fn();
    render(
      <NovaRevalidateAllButton
        policy={FIRESTORE_POLICY}
        rowCount={5}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-revalidate-all-button"));
    fireEvent.click(screen.getByTestId("nova-revalidate-all-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
