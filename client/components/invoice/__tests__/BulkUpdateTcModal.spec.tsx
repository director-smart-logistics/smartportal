// @vitest-environment jsdom
/**
 * BulkUpdateTcModal — interaction tests.
 *
 * Contract guarded:
 *   1. Suggested rate defaults to the average of `currentTcs` (rounded to
 *      2 decimals). Protects against drift where the default silently
 *      diverges from the operator's intuition for a "mixed selection".
 *   2. Confirm button is disabled when:
 *        • rate is 0 / negative / NaN, OR
 *        • every selected invoice is annulled (nothing to apply to), OR
 *        • the modal is in `isSubmitting` state.
 *   3. When the selection contains multiple TCs, a unification warning
 *      surfaces. When they're all the same, NO warning shows.
 *   4. `onConfirm` fires with the numeric-parsed rate (not the raw string).
 *   5. The modal shows an annulled-count note when some but not all of the
 *      selected invoices are tombstones.
 *   6. Empty selection still renders (button disabled, no crash).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  BulkUpdateTcModal,
  type BulkUpdateTcSelectionSummary,
} from ".././BulkUpdateTcModal";

function makeSummary(
  overrides: Partial<BulkUpdateTcSelectionSummary> = {},
): BulkUpdateTcSelectionSummary {
  return {
    invoicesCount: overrides.invoicesCount ?? 3,
    annulledInvoicesCount: overrides.annulledInvoicesCount ?? 0,
    packagesCount: overrides.packagesCount ?? 7,
    manifestsCount: overrides.manifestsCount ?? 1,
    currentTcs: overrides.currentTcs ?? [475],
  };
}

describe("BulkUpdateTcModal", () => {
  afterEach(() => cleanup());

  it("prefills the TC input with the average of the current TCs", () => {
    // avg(475, 485) = 480
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475, 485] })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    const input = screen.getByTestId("bulk-tc-input") as HTMLInputElement;
    expect(input.value).toBe("480");
  });

  it("rounds the suggested rate to 2 decimals (no floating-point noise)", () => {
    // (475 + 476 + 477) / 3 = 476 exactly, but we want to make sure
    // non-integer averages are trimmed cleanly.
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475.33, 476.66] })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    const input = screen.getByTestId("bulk-tc-input") as HTMLInputElement;
    // (475.33 + 476.66) / 2 = 475.995 → rounded to 476
    expect(Number(input.value)).toBeCloseTo(476, 1);
  });

  it("disables the confirm button when rate is 0 / negative / NaN", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475] })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    const input = screen.getByTestId("bulk-tc-input") as HTMLInputElement;
    const button = screen.getByTestId("bulk-tc-confirm") as HTMLButtonElement;

    fireEvent.change(input, { target: { value: "0" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "-1" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "abc" } });
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "500" } });
    expect(button.disabled).toBe(false);
  });

  it("disables the confirm button when every selected invoice is annulled", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({
          invoicesCount: 2,
          annulledInvoicesCount: 2,
          currentTcs: [475],
        })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    const button = screen.getByTestId("bulk-tc-confirm") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("disables the confirm button while isSubmitting is true", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475] })}
        isSubmitting={true}
        onConfirm={() => {}}
      />,
    );
    const button = screen.getByTestId("bulk-tc-confirm") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // Shows the "Actualizando…" spinner state.
    expect(button.textContent).toMatch(/Actualizando/i);
  });

  it("shows the unification warning when the selection has multiple TCs", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475, 485, 495] })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText(/múltiples tipos de cambio/i)).toBeTruthy();
  });

  it("does NOT show the unification warning when all TCs are the same", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475] })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText(/múltiples tipos de cambio/i)).toBeNull();
  });

  it("calls onConfirm with the numeric-parsed rate (not the raw string)", () => {
    const onConfirm = vi.fn();
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({ currentTcs: [475] })}
        isSubmitting={false}
        onConfirm={onConfirm}
      />,
    );
    const input = screen.getByTestId("bulk-tc-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "507.50" } });

    const button = screen.getByTestId("bulk-tc-confirm") as HTMLButtonElement;
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledWith(507.5);
  });

  it("renders the annulled-count note when a subset is annulled", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({
          invoicesCount: 5,
          annulledInvoicesCount: 2,
          currentTcs: [475],
        })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByText(/2 anuladas se omitirán/i)).toBeTruthy();
  });

  it("handles empty selection without throwing (defensive)", () => {
    render(
      <BulkUpdateTcModal
        open
        onOpenChange={() => {}}
        summary={makeSummary({
          invoicesCount: 0,
          annulledInvoicesCount: 0,
          packagesCount: 0,
          manifestsCount: 0,
          currentTcs: [],
        })}
        isSubmitting={false}
        onConfirm={() => {}}
      />,
    );
    const button = screen.getByTestId("bulk-tc-confirm") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
