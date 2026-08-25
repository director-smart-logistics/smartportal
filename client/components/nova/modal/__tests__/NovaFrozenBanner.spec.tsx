// @vitest-environment jsdom
/**
 * NovaFrozenBanner — visibility / accessibility regression tests.
 *
 * Contract:
 *   1. Renders nothing when `policy.showFrozenBanner === false` (fresh parse).
 *   2. Renders the banner with role="status" + aria-live="polite" when the
 *      flag is true (Firestore-loaded). Screen readers announce the change
 *      so non-sighted operators know automation is off.
 *   3. Banner copy mentions both Acciones and Re-validar so the operator
 *      knows what their alternatives are.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NovaFrozenBanner } from ".././NovaFrozenBanner";
import { FRESH_POLICY, FIRESTORE_POLICY } from "@/lib/nova/data-origin";

describe("NovaFrozenBanner", () => {
  afterEach(() => cleanup());

  it("renders nothing for the FRESH policy", () => {
    const { container } = render(<NovaFrozenBanner policy={FRESH_POLICY} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the banner for the FIRESTORE policy", () => {
    render(<NovaFrozenBanner policy={FIRESTORE_POLICY} />);
    expect(screen.getByTestId("nova-frozen-banner")).toBeTruthy();
  });

  it('uses role="status" + aria-live="polite" for screen-reader announcements', () => {
    render(<NovaFrozenBanner policy={FIRESTORE_POLICY} />);
    const banner = screen.getByTestId("nova-frozen-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
  });

  it("mentions both escape hatches (Acciones + Re-validar) in the copy", () => {
    render(<NovaFrozenBanner policy={FIRESTORE_POLICY} />);
    const banner = screen.getByTestId("nova-frozen-banner");
    expect(banner.textContent).toMatch(/Acciones/i);
    expect(banner.textContent).toMatch(/Re-validar/i);
  });

  it("honours an external className without dropping its own classes", () => {
    render(
      <NovaFrozenBanner policy={FIRESTORE_POLICY} className="my-custom-cls" />,
    );
    const banner = screen.getByTestId("nova-frozen-banner");
    expect(banner.classList.contains("my-custom-cls")).toBe(true);
    expect(banner.className).toMatch(/border-emerald-300/);
  });
});
