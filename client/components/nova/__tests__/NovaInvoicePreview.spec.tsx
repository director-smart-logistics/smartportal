/**
 * NovaInvoicePreview.spec.tsx
 *
 * Locks the contract of `formatInvoiceItemCaption` — the helper that
 * decides what shows under "Servicios Logísticos" in BOTH the on-screen
 * invoice preview and the email HTML.
 *
 * Regression context (BUG-INV-CAPTION 2026-05-05):
 *   Commit 53d8cd3f4 (2026-04-13) deliberately removed the package
 *   description from the invoice line caption — it was confusing customers
 *   into thinking the description WAS the line item. Commit a77fccf38
 *   shortly after, titled "invoice item description uppercase + nav
 *   dropdown sticky fix", silently re-introduced the description fallback
 *   while adding `.toUpperCase()`. From that point on, every invoice email
 *   shipped with the package description shown beneath
 *   "Servicios Logísticos" instead of the tracking number.
 *
 * The 2026-05-05 follow-up clarification from the operator added two
 * legitimate cases where description SHOULD appear:
 *   1. MANUAL items (`isManual=true`)  → description only
 *   2. MARITIME invoices (`source='maritime'`) → tracking + description
 *
 * If you are reading this because the test failed, do NOT loosen the
 * contract without first checking commits 53d8cd3f4 and a77fccf38.
 */

import { describe, it, expect } from "vitest";
import { formatInvoiceItemCaption } from "../NovaInvoicePreview";
import { resolveEffectiveCustomerName } from "@/lib/utils/customer-name";

describe("formatInvoiceItemCaption — REGULAR items (air manifest / encomiendas)", () => {
  it("returns the tracking number uppercased when present", () => {
    expect(formatInvoiceItemCaption({ tracking: "abc123" })).toBe("ABC123");
  });

  it("preserves an already-uppercase tracking number unchanged", () => {
    expect(formatInvoiceItemCaption({ tracking: "TRK-2026-0815" })).toBe(
      "TRK-2026-0815",
    );
  });

  it("returns the em-dash placeholder when tracking is missing", () => {
    expect(formatInvoiceItemCaption({})).toBe("—");
  });

  it("returns the em-dash placeholder when tracking is the empty string", () => {
    expect(formatInvoiceItemCaption({ tracking: "" })).toBe("—");
  });

  it("returns the em-dash placeholder when tracking is null", () => {
    expect(formatInvoiceItemCaption({ tracking: null })).toBe("—");
  });

  it("NEVER falls back to item.description for regular items (BUG-INV-CAPTION)", () => {
    // The whole regression sneaked in via this very fallback. The test
    // name calls it out so a future search for "BUG-INV-CAPTION" lands here.
    const item = {
      tracking: "TRK-001",
      description: "A box of expensive things",
    };
    expect(formatInvoiceItemCaption(item)).toBe("TRK-001");
  });

  it("returns em-dash for regular items with only description (no silent fallback)", () => {
    const item = { description: "A box of expensive things" };
    expect(formatInvoiceItemCaption(item)).toBe("—");
  });

  it("preserves hyphens, slashes and underscores within tracking", () => {
    expect(formatInvoiceItemCaption({ tracking: "usps-9400/abc_01" })).toBe(
      "USPS-9400/ABC_01",
    );
  });

  it("uppercases mixed-case tracking numbers (a77fccf38 intent kept)", () => {
    expect(formatInvoiceItemCaption({ tracking: "mAnIfest-5" })).toBe(
      "MANIFEST-5",
    );
  });

  it("ignores ctx when source is air or undefined", () => {
    expect(
      formatInvoiceItemCaption({ tracking: "trk-1" }, { source: "nova" }),
    ).toBe("TRK-1");
    expect(formatInvoiceItemCaption({ tracking: "trk-2" })).toBe("TRK-2");
  });
});

describe("formatInvoiceItemCaption — MANUAL items (Servicio de Terceros)", () => {
  it("returns the description uppercased when isManual=true", () => {
    const item = { isManual: true, description: "Trámite de aduana" };
    expect(formatInvoiceItemCaption(item)).toBe("TRÁMITE DE ADUANA");
  });

  it("manual items NEVER show the tracking, even when present", () => {
    // Manual line items represent ad-hoc charges that may share the
    // tracking of a related package (`trackingRef`) but the caption
    // must show the description, not the tracking.
    const item = {
      isManual: true,
      tracking: "TRK-001",
      description: "Cargo extra",
    };
    expect(formatInvoiceItemCaption(item)).toBe("CARGO EXTRA");
  });

  it("manual items with empty description fall back to em-dash", () => {
    expect(formatInvoiceItemCaption({ isManual: true, description: "" })).toBe(
      "—",
    );
    expect(formatInvoiceItemCaption({ isManual: true })).toBe("—");
  });

  it("manual flag overrides maritime context", () => {
    const item = { isManual: true, tracking: "WR-1", description: "Manejo" };
    expect(formatInvoiceItemCaption(item, { source: "maritime" })).toBe(
      "MANEJO",
    );
  });

  it("trims whitespace from manual descriptions before uppercasing", () => {
    const item = { isManual: true, description: "   spaced description   " };
    expect(formatInvoiceItemCaption(item)).toBe("SPACED DESCRIPTION");
  });
});

describe("formatInvoiceItemCaption — MARITIME items", () => {
  it('returns "TRACKING — DESCRIPTION" when both are present', () => {
    const item = { tracking: "WR-2026-001", description: "DIM: 60x40x40 cm" };
    expect(formatInvoiceItemCaption(item, { source: "maritime" })).toBe(
      "WR-2026-001 — DIM: 60X40X40 CM",
    );
  });

  it("returns only the tracking when description is missing on maritime", () => {
    expect(
      formatInvoiceItemCaption({ tracking: "WR-1" }, { source: "maritime" }),
    ).toBe("WR-1");
  });

  it("returns only the description when tracking is missing on maritime", () => {
    const item = { description: "Carga sin WR" };
    expect(formatInvoiceItemCaption(item, { source: "maritime" })).toBe(
      "CARGA SIN WR",
    );
  });

  it("returns em-dash when both tracking and description are missing on maritime", () => {
    expect(formatInvoiceItemCaption({}, { source: "maritime" })).toBe("—");
  });

  it("maritime branch is case-insensitive on source", () => {
    const item = { tracking: "WR-X", description: "DIM" };
    expect(formatInvoiceItemCaption(item, { source: "MARITIME" })).toBe(
      "WR-X — DIM",
    );
    expect(formatInvoiceItemCaption(item, { source: "Maritime" })).toBe(
      "WR-X — DIM",
    );
  });
});

describe("formatInvoiceItemCaption — regression: tracked package without packageId (BUG-INV-CAPTION 2026-05-05)", () => {
  // The post-deploy regression of v0.0.634: handlePreviewInvoice in
  // InvoiceGeneration.tsx used to derive isManual via the heuristic
  // `!item.packageId && !!item.description`, falsely marking regular
  // tracked packages as manual whenever packageId was empty (which is the
  // common shape for Nova / encomienda items). The helper then correctly
  // returned description for that "manual" item — but the input itself
  // was already mis-classified. The fix moves the truth to the explicit
  // `isManual` boolean (canonically set by every invoice creator). These
  // tests lock the helper's behaviour for the shape that was misrendered.
  it("renders the tracking when isManual is missing/false even if description is present", () => {
    // Shape from `inspect-invoice-items.mjs`:
    //   trk="WR4066" desc="PARTE PARA VEHICULO" pkgId="" isManual=false
    const item = { tracking: "WR4066", description: "PARTE PARA VEHICULO" };
    expect(formatInvoiceItemCaption(item)).toBe("WR4066");
  });

  it("renders the tracking when isManual is explicitly false", () => {
    const item = {
      tracking: "TBA330375810593",
      description: "EXTENSION DE CABELLO",
      isManual: false,
    };
    expect(formatInvoiceItemCaption(item)).toBe("TBA330375810593");
  });

  it("does NOT mistakenly classify tracked items as manual just because description is present", () => {
    // The whole regression. A tracked package always has a description
    // (operator-curated package category) AND a tracking number. The
    // helper must show ONLY the tracking — the description belongs to
    // the operator-facing list view, not the customer-facing caption.
    const item = {
      tracking: "GFUS01047553858817",
      description: "ROPA, ACCESORIOS Y ARTICULOS VARIOS",
    };
    expect(formatInvoiceItemCaption(item)).toBe("GFUS01047553858817");
  });
});

describe("formatInvoiceItemCaption — invariants", () => {
  it("does not mutate the input object", () => {
    const item = {
      tracking: "trk-1",
      description: "unchanged",
      isManual: false,
    };
    formatInvoiceItemCaption(item, { source: "maritime" });
    expect(item).toEqual({
      tracking: "trk-1",
      description: "unchanged",
      isManual: false,
    });
  });

  it("does not mutate the ctx object", () => {
    const ctx = { source: "maritime" };
    formatInvoiceItemCaption({ tracking: "WR-1" }, ctx);
    expect(ctx).toEqual({ source: "maritime" });
  });

  it("always returns a non-empty string", () => {
    // For every combination of empty/missing inputs, we never emit ''.
    expect(formatInvoiceItemCaption({})).not.toBe("");
    expect(formatInvoiceItemCaption({ isManual: true })).not.toBe("");
    expect(formatInvoiceItemCaption({}, { source: "maritime" })).not.toBe("");
  });
});

describe("NovaInvoicePreview — Clean Customer Name Resolution Invariant", () => {
  it("cleans synthetic pre-alert string and uses official customer name", () => {
    const name = resolveEffectiveCustomerName({
      savedCustomerName: "Cliente Pre-alertado (SL262179)",
      contactName: "DAYANA MARIA JIMENEZ ESQUIVEL",
      slCode: "SL262179",
    });
    expect(name).toBe("DAYANA MARIA JIMENEZ ESQUIVEL");
    expect(name).not.toContain("Cliente Pre-alertado");
  });
});

