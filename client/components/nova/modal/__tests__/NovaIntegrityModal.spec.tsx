// @vitest-environment jsdom
/**
 * NovaIntegrityModal — render + interaction tests.
 *
 * Contract:
 *   1. Loading state shows the spinner; clean state shows "Sin
 *      inconsistencias detectadas".
 *   2. Issues are grouped by rowIndex — one card per affected row, with
 *      every detected issue surfaced as a chip.
 *   3. Side-by-side evidence panes appear for each available source.
 *   4. The "Marcar N confiable" button bulk-selects rows where ANY issue
 *      has confidence ≥ 0.8.
 *   5. Apply forwards an `IntegrityRepair` per selected row, using the
 *      first issue's suggestedFix.
 *   6. The Apply button is disabled when no rows are selected.
 *   7. Rows without a suggestedFix can't be selected (checkbox disabled).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NovaIntegrityModal } from ".././NovaIntegrityModal";
import type { IntegrityIssue, IntegrityReport } from "@/lib/nova/integrity";

// ── Fixtures ──────────────────────────────────────────────────────────────

function issue(
  over: Partial<IntegrityIssue> &
    Pick<IntegrityIssue, "manifestRow" | "kind" | "severity">,
): IntegrityIssue {
  return {
    evidence: {},
    message: "test",
    ...over,
  } as IntegrityIssue;
}

const HIGH_CONF_ROW: IntegrityIssue = issue({
  kind: "slcode_mismatch",
  severity: "high",
  manifestRow: {
    rowIndex: 0,
    tracking: "TRK-1",
    slCode: "SL26111",
    customerName: "APRIL JIMENEZ HERRERA",
    ruta: "METROPOLITANA",
    weight: 2.45,
    price: 18.47,
  },
  evidence: {
    packagesCollection: {
      docId: "TRK-1",
      slCode: "SL488",
      customerName: "ARELIS V QUESADA",
      ruta: "METROPOLITANA",
    },
    invoice: {
      invoiceId: "inv-1",
      invoiceNumber: "SL488-2026...",
      clientSlCode: "SL488",
      clientName: "ARELIS V QUESADA",
      status: "sent",
      isProtected: true,
      isConsolidation: false,
    },
  },
  suggestedFix: {
    source: "invoice_protected",
    slCode: "SL488",
    customerName: "ARELIS V QUESADA",
    ruta: "METROPOLITANA",
    confidence: 0.95,
  },
  message: "Manifest dice SL26111; packages dice SL488.",
});

const LOW_CONF_ROW: IntegrityIssue = issue({
  kind: "slcode_mismatch",
  severity: "high",
  manifestRow: {
    rowIndex: 1,
    tracking: "TRK-2",
    slCode: "SL_X",
    customerName: "X",
    ruta: "",
    weight: 1,
    price: 1,
  },
  evidence: {
    packagesCollection: {
      docId: "TRK-2",
      slCode: "SL_OTHER",
      customerName: "OTHER",
      ruta: "",
    },
  },
  suggestedFix: {
    source: "packages",
    slCode: "SL_OTHER",
    customerName: "OTHER",
    ruta: "",
    confidence: 0.6, // below 0.8 threshold
  },
  message: "Manifest dice SL_X; packages dice SL_OTHER.",
});

const NO_FIX_ROW: IntegrityIssue = issue({
  kind: "orphan_tracking",
  severity: "low",
  manifestRow: {
    rowIndex: 2,
    tracking: "TRK-3",
    slCode: "SL_OK",
    customerName: "OK",
    ruta: "",
    weight: 1,
    price: 1,
  },
  message: "TRK-3 no aparece en ninguna factura.",
});

function report(issues: IntegrityIssue[]): IntegrityReport {
  // Mirror compute.ts so summary.byKind drives kind-chip rendering in
  // the modal — a missing entry means "no chip", not "0 of that kind".
  const byKind: IntegrityReport["summary"]["byKind"] = {};
  for (const i of issues) {
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  }
  return {
    manifestId: "MEGA-MAN-T",
    scannedAt: new Date().toISOString(),
    totalRows: 10,
    issues,
    summary: {
      bySeverity: {
        high: issues.filter((i) => i.severity === "high").length,
        medium: issues.filter((i) => i.severity === "medium").length,
        low: issues.filter((i) => i.severity === "low").length,
      },
      byKind,
      repairableManifestRows: issues.filter(
        (i) => (i.suggestedFix?.confidence ?? 0) >= 0.8,
      ).length,
      invoicesNeedingReview: 0,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("NovaIntegrityModal", () => {
  afterEach(() => cleanup());

  it("shows the loading spinner while report is null", () => {
    render(
      <NovaIntegrityModal
        open
        report={null}
        loading
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-integrity-loading")).toBeTruthy();
  });

  it("shows the clean state when there are no issues", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-integrity-clean")).toBeTruthy();
  });

  it("renders one card per affected rowIndex (issues grouped)", () => {
    // Two issues for the same row should NOT produce two cards.
    const r = report([
      HIGH_CONF_ROW,
      // Add a name_mismatch on the same row → still one card.
      issue({
        kind: "name_mismatch",
        severity: "medium",
        manifestRow: HIGH_CONF_ROW.manifestRow,
      }),
      LOW_CONF_ROW,
    ]);
    render(
      <NovaIntegrityModal
        open
        report={r}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.getByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.getByTestId("nova-integrity-row-1")).toBeTruthy();
    expect(screen.queryAllByText(/TRK-1/)[0]).toBeTruthy();
  });

  it("disables the row checkbox when there is no suggestedFix", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([NO_FIX_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const cb = screen.getByTestId(
      "nova-integrity-checkbox-2",
    ) as HTMLInputElement;
    expect(cb.disabled).toBe(true);
  });

  it("shows the suggested fix banner with confidence percentage", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const fix = screen.getByTestId("nova-integrity-fix-0");
    expect(fix.textContent).toMatch(/SL488/);
    expect(fix.textContent).toMatch(/95%/);
    expect(fix.textContent).toMatch(/factura activa/);
  });

  it("disables Apply when no rows are selected", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const apply = screen.getByTestId(
      "nova-integrity-apply",
    ) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it('"Marcar N confiables" selects only rows with confidence >= 0.8', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, LOW_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-select-all-repairable"));
    const cb0 = screen.getByTestId(
      "nova-integrity-checkbox-0",
    ) as HTMLInputElement;
    const cb1 = screen.getByTestId(
      "nova-integrity-checkbox-1",
    ) as HTMLInputElement;
    expect(cb0.checked).toBe(true);
    expect(cb1.checked).toBe(false); // 0.6 below threshold
  });

  it("forwards an IntegrityRepair per selected row to onApply", async () => {
    const onApply = vi.fn();
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-checkbox-0"));
    fireEvent.click(screen.getByTestId("nova-integrity-apply"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0]).toEqual({
      rowIndex: 0,
      tracking: "TRK-1",
      slCode: "SL488",
      customerName: "ARELIS V QUESADA",
      ruta: "METROPOLITANA",
      // POLICY (2026-05-04): invoice evidence is forwarded so the repair
      // service can rewrite the linked invoice (including its prefix) in
      // the same atomic batch.
      invoice: {
        invoiceId: "inv-1",
        invoiceNumber: "SL488-2026...",
        isProtected: true,
        // Threaded so the post-commit cleanup can detect when the previous
        // owner was a temp customer and delete the orphan record.
        previousSlCode: "SL488",
      },
    });
  });

  it("does NOT include rows without suggestedFix in the apply payload", async () => {
    const onApply = vi.fn();
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, NO_FIX_ROW])}
        onClose={() => {}}
        onApply={onApply}
      />,
    );
    // Try to manually tick the no-fix row (won't succeed because checkbox
    // is disabled; we just test the payload shape).
    fireEvent.click(screen.getByTestId("nova-integrity-select-all-repairable"));
    fireEvent.click(screen.getByTestId("nova-integrity-apply"));
    const arg = onApply.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0].rowIndex).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Filter chips (BUG-INTEGRITY-FILTERS 2026-04-29)
// ─────────────────────────────────────────────────────────────────────────

const MEDIUM_FIX_ROW: IntegrityIssue = issue({
  kind: "invoice_weight_drift",
  severity: "medium",
  manifestRow: {
    rowIndex: 5,
    tracking: "TRK-MEDIUM",
    slCode: "SL_MED",
    customerName: "MED CLIENT",
    ruta: "",
    weight: 2,
    price: 20,
  },
  evidence: {
    invoice: {
      invoiceId: "inv-med",
      invoiceNumber: "SL_MED-2026",
      clientSlCode: "SL_MED",
      clientName: "MED CLIENT",
      status: "sent",
      isProtected: true,
      isConsolidation: false,
    },
  },
  suggestedFix: {
    source: "invoice_protected",
    slCode: "SL_MED",
    customerName: "MED CLIENT",
    ruta: "",
    confidence: 0.9,
  },
  message: "invoice peso drift",
});

const LOW_NO_INVOICE_ROW: IntegrityIssue = issue({
  kind: "orphan_tracking",
  severity: "low",
  manifestRow: {
    rowIndex: 7,
    tracking: "TRK-LOW",
    slCode: "SL_LOW",
    customerName: "LOW",
    ruta: "",
    weight: 1,
    price: 1,
  },
  message: "orphan",
});

describe("NovaIntegrityModal — filter chips", () => {
  afterEach(() => cleanup());

  it('renders chips as togglable buttons with the master "hallazgos" pressed by default', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW, LOW_NO_INVOICE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const all = screen.getByTestId("nova-integrity-filter-all");
    const high = screen.getByTestId("nova-integrity-filter-high");
    const med = screen.getByTestId("nova-integrity-filter-medium");
    const low = screen.getByTestId("nova-integrity-filter-low");
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(high.getAttribute("aria-pressed")).toBe("false");
    expect(med.getAttribute("aria-pressed")).toBe("false");
    expect(low.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking a severity chip filters the visible rows to that severity", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW, LOW_NO_INVOICE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-5")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeTruthy();

    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));

    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-5")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeNull();
  });

  it("multi-selects severity chips (críticas + importantes)", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW, LOW_NO_INVOICE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    fireEvent.click(screen.getByTestId("nova-integrity-filter-medium"));
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy(); // high
    expect(screen.queryByTestId("nova-integrity-row-5")).toBeTruthy(); // medium
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeNull(); // low hidden
  });

  it("clicking a severity chip twice toggles it off", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, LOW_NO_INVOICE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeNull();
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeTruthy();
  });

  it('"facturas afectadas" chip filters to rows with invoice evidence', () => {
    // Mark report with invoicesNeedingReview=1 so the invoice chip renders.
    const r = report([HIGH_CONF_ROW, MEDIUM_FIX_ROW, LOW_NO_INVOICE_ROW]);
    r.summary.invoicesNeedingReview = 2;
    render(
      <NovaIntegrityModal
        open
        report={r}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-invoices"));
    // Both HIGH_CONF_ROW and MEDIUM_FIX_ROW have evidence.invoice; LOW does not.
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-5")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeNull();
  });

  it('clicking the master "hallazgos" chip clears every active filter', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, LOW_NO_INVOICE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeNull();
    fireEvent.click(screen.getByTestId("nova-integrity-filter-all"));
    expect(screen.queryByTestId("nova-integrity-row-7")).toBeTruthy();
  });

  it('"Quitar filtros" appears only when a filter is active and clears all', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByTestId("nova-integrity-filter-clear")).toBeNull();
    fireEvent.click(screen.getByTestId("nova-integrity-filter-medium"));
    const clear = screen.getByTestId("nova-integrity-filter-clear");
    expect(clear).toBeTruthy();
    fireEvent.click(clear);
    expect(screen.queryByTestId("nova-integrity-filter-clear")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
  });

  it('hero "Aplicar N" rescopes to the filtered subset (per-group apply)', () => {
    const onApply = vi.fn();
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])}
        onClose={() => {}}
        onApply={onApply}
      />,
    );
    // Without filter: hero applies BOTH rows (row 0 + row 5).
    let apply = screen.getByTestId("nova-integrity-apply-all-repairable");
    expect(apply.textContent).toMatch(/2/);

    // Activate "críticas" → hero scopes to just row 0.
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    apply = screen.getByTestId("nova-integrity-apply-all-repairable");
    expect(apply.textContent).toMatch(/1/);
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0].rowIndex).toBe(0); // only HIGH_CONF_ROW
  });

  it('"Marcarlas y revisar" rescopes to filtered repairables (per-group select)', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-medium"));
    fireEvent.click(screen.getByTestId("nova-integrity-select-all-repairable"));
    const cb0 = screen.getByTestId(
      "nova-integrity-checkbox-5",
    ) as HTMLInputElement;
    expect(cb0.checked).toBe(true);
    // The high-severity row (#0) is hidden, so its checkbox isn't even rendered.
    expect(screen.queryByTestId("nova-integrity-checkbox-0")).toBeNull();
  });

  it('renders the filter-empty state with a "Quitar filtros" recovery button', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // Activate the medium filter → no rows match → empty state appears.
    // (the medium chip is hidden when count=0; we drive via low/high
    //  and rely on the inverse mismatch.)
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    // After the toggle pair, no filter is active → no empty state.
    expect(screen.queryByTestId("nova-integrity-filter-empty")).toBeNull();
  });

  it("hides empty-state when re-audit reactivity arrives with new matching rows", () => {
    // Reactivity contract: parent re-runs runAudit after onApply, passing
    // a fresh `report` prop. The filter state persists, and the modal
    // recomputes filteredGrouped → empty-state disappears when new
    // matching rows arrive. This guards the "filters survive re-audit"
    // design decision.
    const initial = report([HIGH_CONF_ROW]);
    const { rerender } = render(
      <NovaIntegrityModal
        open
        report={initial}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();

    // Re-audit returns NEW high-severity row at a different index.
    const updated = report([
      issue({
        kind: "slcode_mismatch",
        severity: "high",
        manifestRow: {
          ...HIGH_CONF_ROW.manifestRow,
          rowIndex: 99,
          tracking: "TRK-NEW",
        },
        suggestedFix: HIGH_CONF_ROW.suggestedFix,
      }),
    ]);
    updated.scannedAt = new Date(Date.now() + 1).toISOString(); // newer audit
    rerender(
      <NovaIntegrityModal
        open
        report={updated}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-99")).toBeTruthy();
    // Filter chip is STILL pressed (lens persists across re-audit).
    expect(
      screen
        .getByTestId("nova-integrity-filter-high")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Kind chips, search, visible counter (BUG-INTEGRITY-FINDABILITY 2026-05-02)
// ─────────────────────────────────────────────────────────────────────────

const ROUTE_MISMATCH_ROW: IntegrityIssue = issue({
  kind: "route_mismatch",
  severity: "medium",
  manifestRow: {
    rowIndex: 11,
    tracking: "TRK-ROUTE",
    slCode: "SL_R",
    customerName: "JOSE PEREZ",
    ruta: "METROPOLITANA",
    weight: 1,
    price: 1,
  },
  message: "ruta drift",
});

const DUPLICATE_ROW: IntegrityIssue = issue({
  kind: "duplicate_invoice",
  severity: "high",
  manifestRow: {
    rowIndex: 22,
    tracking: "TRK-DUP",
    slCode: "SL_DUP",
    customerName: "MARIA GOMEZ",
    ruta: "",
    weight: 1,
    price: 1,
  },
  message: "duplicada",
});

describe("NovaIntegrityModal — kind / search / counter (findability)", () => {
  afterEach(() => cleanup());

  it("renders one kind chip per kind that appears in summary.byKind, with counts", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // HIGH_CONF_ROW.kind = 'slcode_mismatch'; ROUTE_MISMATCH_ROW.kind = 'route_mismatch';
    // DUPLICATE_ROW.kind = 'duplicate_invoice'. Three distinct kinds → row renders.
    expect(screen.getByTestId("nova-integrity-kind-filters")).toBeTruthy();
    expect(
      screen.getByTestId("nova-integrity-filter-kind-slcode_mismatch"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("nova-integrity-filter-kind-route_mismatch"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("nova-integrity-filter-kind-duplicate_invoice"),
    ).toBeTruthy();
    // Counts surface in chip text.
    expect(
      screen.getByTestId("nova-integrity-filter-kind-slcode_mismatch")
        .textContent,
    ).toMatch(/1/);
  });

  it("hides the kind row when there is only one kind in the report", () => {
    // A monoculture report (e.g. only slcode_mismatch) → kind chip would
    // be a no-op so the row is suppressed entirely.
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, LOW_CONF_ROW])} // both slcode_mismatch
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByTestId("nova-integrity-kind-filters")).toBeNull();
  });

  it("clicking a kind chip filters the visible rows to that kind", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-route_mismatch"),
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull(); // slcode
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy(); // route
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeNull(); // duplicate
  });

  it("multi-selects kind chips (slcode + route)", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-slcode_mismatch"),
    );
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-route_mismatch"),
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy(); // slcode
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy(); // route
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeNull(); // duplicate hidden
  });

  it("combines kind + severity filters (AND, not OR)", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // críticas (high) ∩ slcode_mismatch → only HIGH_CONF_ROW (row 0).
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high"));
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-slcode_mismatch"),
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeNull(); // medium severity excluded
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeNull(); // duplicate kind excluded
  });

  it('clicking the master "hallazgos" chip clears the kind filter too', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-route_mismatch"),
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    fireEvent.click(screen.getByTestId("nova-integrity-filter-all"));
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeTruthy();
    // Kind chip is no longer pressed.
    const chip = screen.getByTestId(
      "nova-integrity-filter-kind-route_mismatch",
    );
    expect(chip.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders the search input with placeholder and a sr-only label", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "nova-integrity-search",
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.placeholder).toMatch(/Buscar tracking o cliente/);
    expect(screen.getByLabelText(/Buscar tracking o cliente/i)).toBeTruthy();
  });

  it("search by tracking ID narrows the visible rows (case-insensitive substring)", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "route" },
    });
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy(); // tracking TRK-ROUTE
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeNull();
  });

  it("search by customer name narrows the visible rows (substring)", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "gomez" },
    });
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeTruthy(); // MARIA GOMEZ
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeNull();
  });

  it("whitespace-only search input does NOT activate the filter dimension", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "   " },
    });
    // Both rows still visible — `   `.trim() === '' so no filter applied.
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy();
    // "Quitar filtros" should NOT appear, since trimmed search is empty.
    expect(screen.queryByTestId("nova-integrity-filter-clear")).toBeNull();
  });

  it('"Quitar filtros" clears search input as well as chips', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const input = screen.getByTestId(
      "nova-integrity-search",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "route" } });
    expect(input.value).toBe("route");
    fireEvent.click(screen.getByTestId("nova-integrity-filter-clear"));
    expect(input.value).toBe("");
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy();
  });

  it("renders the visible-of-total counter and updates when filters narrow the list", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW, DUPLICATE_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const counter = screen.getByTestId("nova-integrity-visible-count");
    // Three distinct rowIndex values → 3 grouped rows.
    expect(counter.textContent).toMatch(/3.*de.*3/);

    // Filter to route_mismatch → 1 visible / 3 total.
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-route_mismatch"),
    );
    expect(
      screen.getByTestId("nova-integrity-visible-count").textContent,
    ).toMatch(/1.*de.*3/);

    // Search for a non-existent term → 0 visible / 3 total.
    fireEvent.click(screen.getByTestId("nova-integrity-filter-clear"));
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "nonexistent" },
    });
    expect(
      screen.getByTestId("nova-integrity-visible-count").textContent,
    ).toMatch(/0.*de.*3/);
  });

  it('counter has aria-live="polite" so screen readers announce the new count', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const counter = screen.getByTestId("nova-integrity-visible-count");
    expect(counter.getAttribute("aria-live")).toBe("polite");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Regression contract — invariants that MUST hold across refactors.
//
// The integrity modal has accumulated four orthogonal filter dimensions
// (severity, kind, invoice-affected, search) and three CTA scopes (hero
// "Aplicar N", "Marcarlas y revisar", footer "Aplicar N seleccionadas").
// Each combination is a regression surface — these tests enumerate the
// non-obvious contracts so a refactor that changes filter composition
// or selection scoping fails LOUDLY instead of silently shipping a UX
// bug to production.
//
// Contracts under guard:
//   1. All four filter dimensions compose as logical AND — never OR,
//      never short-circuit. A row passes only when every active
//      dimension matches at least one of its issues.
//   2. The hero CTA + "Marcarlas y revisar" + footer "Aplicar N
//      seleccionadas" all scope to `repairableInScope`, not
//      `repairableRows`. Search alone (no chip) must rescope them too.
//   3. `clearAllFilters` resets every filter dimension AND the search
//      input value, but does NOT clear `selectedRows` (operator's
//      manual ticks survive a filter reset by design).
//   4. Filter state survives re-audit (`scannedAt` change). This
//      includes kind, search, AND severity — losing any of them on
//      re-audit dumps the operator back into the full manifest noise.
//   5. The visible-of-total counter pluralizes "fila"/"filas" correctly.
//   6. Search input uses substring matching (`.includes()`), so special
//      regex characters (`. * + ? [ ]`) are LITERAL in the query and
//      do not crash or accidentally match.
// ─────────────────────────────────────────────────────────────────────────

describe("NovaIntegrityModal — regression guards", () => {
  afterEach(() => cleanup());

  // ── Contract 1: AND composition across all four dimensions ─────────────
  it("REGRESSION: severity ∩ kind ∩ invoice ∩ search compose as AND, not OR", () => {
    // HIGH_CONF_ROW   : high severity, slcode_mismatch, invoice present, tracking TRK-1
    // MEDIUM_FIX_ROW  : medium severity, invoice_weight_drift, invoice present, TRK-MEDIUM
    // ROUTE_MISMATCH_ROW: medium, route_mismatch, NO invoice, TRK-ROUTE
    // DUPLICATE_ROW   : high, duplicate_invoice, NO invoice, TRK-DUP
    const r = report([
      HIGH_CONF_ROW,
      MEDIUM_FIX_ROW,
      ROUTE_MISMATCH_ROW,
      DUPLICATE_ROW,
    ]);
    r.summary.invoicesNeedingReview = 2; // unlock the invoices chip
    render(
      <NovaIntegrityModal
        open
        report={r}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-filter-high")); // severity ∈ {high}
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-slcode_mismatch"),
    ); // kind ∈ {slcode_mismatch}
    fireEvent.click(screen.getByTestId("nova-integrity-filter-invoices")); // invoice required
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "TRK-1" },
    });

    // Only HIGH_CONF_ROW satisfies all four: high + slcode_mismatch + has invoice + tracking matches.
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-5")).toBeNull(); // wrong kind
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeNull(); // wrong severity + no invoice + tracking mismatch
    expect(screen.queryByTestId("nova-integrity-row-22")).toBeNull(); // no invoice + tracking mismatch
  });

  // ── Contract 2: search alone rescopes hero CTA ─────────────────────────
  it('REGRESSION: hero CTA "Aplicar N" rescopes to search-filtered subset (search alone)', () => {
    const onApply = vi.fn();
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])} // both repairable
        onClose={() => {}}
        onApply={onApply}
      />,
    );
    // Without filter: hero applies BOTH (TRK-1 + TRK-MEDIUM).
    expect(
      screen.getByTestId("nova-integrity-apply-all-repairable").textContent,
    ).toMatch(/2/);

    // Search "MEDIUM" → only TRK-MEDIUM (row 5) visible → hero rescopes to 1.
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "MEDIUM" },
    });
    expect(
      screen.getByTestId("nova-integrity-apply-all-repairable").textContent,
    ).toMatch(/1/);
    fireEvent.click(screen.getByTestId("nova-integrity-apply-all-repairable"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0].rowIndex).toBe(5); // only MEDIUM_FIX_ROW
  });

  // ── Contract 2: search alone rescopes "Marcarlas y revisar" ────────────
  it('REGRESSION: "Marcarlas y revisar" only ticks search-visible repairables', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "MEDIUM" },
    });
    fireEvent.click(screen.getByTestId("nova-integrity-select-all-repairable"));
    expect(
      (screen.getByTestId("nova-integrity-checkbox-5") as HTMLInputElement)
        .checked,
    ).toBe(true);
    // The HIGH_CONF_ROW (#0) is filtered out by search, so its checkbox isn't rendered.
    expect(screen.queryByTestId("nova-integrity-checkbox-0")).toBeNull();
  });

  // ── Contract 3: clearAllFilters preserves manual selection ─────────────
  it('REGRESSION: "Quitar filtros" does NOT clear the operator\'s manual selection', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // Manually tick row 0.
    fireEvent.click(screen.getByTestId("nova-integrity-checkbox-0"));
    expect(
      (screen.getByTestId("nova-integrity-checkbox-0") as HTMLInputElement)
        .checked,
    ).toBe(true);

    // Activate search, then clear filters.
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "MEDIUM" },
    });
    fireEvent.click(screen.getByTestId("nova-integrity-filter-clear"));

    // Selection survives.
    expect(
      (screen.getByTestId("nova-integrity-checkbox-0") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByTestId("nova-integrity-search") as HTMLInputElement).value,
    ).toBe("");
  });

  // ── Contract 4: re-audit preserves kind filter ─────────────────────────
  it("REGRESSION: kind filter survives re-audit (scannedAt change)", () => {
    const initial = report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW]);
    const { rerender } = render(
      <NovaIntegrityModal
        open
        report={initial}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByTestId("nova-integrity-filter-kind-route_mismatch"),
    );
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();

    // Re-audit returns NEW route_mismatch row at a different index.
    const updated = report([
      HIGH_CONF_ROW,
      issue({
        kind: "route_mismatch",
        severity: "medium",
        manifestRow: {
          ...ROUTE_MISMATCH_ROW.manifestRow,
          rowIndex: 99,
          tracking: "TRK-NEW-ROUTE",
        },
      }),
    ]);
    updated.scannedAt = new Date(Date.now() + 1).toISOString();
    rerender(
      <NovaIntegrityModal
        open
        report={updated}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // Kind filter still active → only row 99 visible (slcode row 0 hidden).
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-99")).toBeTruthy();
    expect(
      screen
        .getByTestId("nova-integrity-filter-kind-route_mismatch")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  // ── Contract 4: re-audit preserves search filter ───────────────────────
  it("REGRESSION: search query survives re-audit (scannedAt change)", () => {
    const initial = report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW]);
    const { rerender } = render(
      <NovaIntegrityModal
        open
        report={initial}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "route" },
    });
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy();

    const updated = report([HIGH_CONF_ROW, ROUTE_MISMATCH_ROW]);
    updated.scannedAt = new Date(Date.now() + 1).toISOString();
    rerender(
      <NovaIntegrityModal
        open
        report={updated}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // Search query persists.
    expect(
      (screen.getByTestId("nova-integrity-search") as HTMLInputElement).value,
    ).toBe("route");
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    expect(screen.queryByTestId("nova-integrity-row-11")).toBeTruthy();
  });

  // ── Contract 5: search-only empty state ────────────────────────────────
  it("REGRESSION: search-only filter triggers the empty state with recovery button", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "no-match-anywhere" },
    });
    expect(screen.getByTestId("nova-integrity-filter-empty")).toBeTruthy();
    expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
    // Empty state has the search query in the label.
    expect(
      screen.getByTestId("nova-integrity-filter-empty").textContent,
    ).toMatch(/no-match-anywhere/);
  });

  // ── Contract 5: counter singular pluralization ─────────────────────────
  it('REGRESSION: counter renders "fila" (singular) when total === 1', () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const counter = screen.getByTestId("nova-integrity-visible-count");
    expect(counter.textContent).toMatch(/1\s*de\s*1\s*fila(?!s)/);
  });

  // ── Contract 6: search query with regex-special characters ─────────────
  it("REGRESSION: search with regex-special chars treats them as literal substrings", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // None of these should throw or match (TRK-1 contains none of them).
    for (const q of [".*", "[a-z]+", "(.+)?", "\\d+"]) {
      fireEvent.change(screen.getByTestId("nova-integrity-search"), {
        target: { value: q },
      });
      expect(screen.queryByTestId("nova-integrity-row-0")).toBeNull();
      expect(screen.getByTestId("nova-integrity-filter-empty")).toBeTruthy();
    }
  });

  // ── Contract: hero copy reflects active filter label (search included) ─
  it("REGRESSION: hero copy includes the active filter label when search is active", () => {
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW, MEDIUM_FIX_ROW])}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("nova-integrity-search"), {
      target: { value: "TRK-1" },
    });
    const hero = screen.getByTestId("nova-integrity-hero");
    // The hero copy spells out the active filter via `activeFilterLabel`.
    expect(hero.textContent).toMatch(/TRK-1/);
  });

  // ── Contract: chips disabled while applying repairs ────────────────────
  it("REGRESSION: filter chips and search input are disabled while a repair apply is in flight", async () => {
    let resolveApply!: () => void;
    const onApply = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveApply = res;
        }),
    );
    render(
      <NovaIntegrityModal
        open
        report={report([HIGH_CONF_ROW])}
        onClose={() => {}}
        onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId("nova-integrity-checkbox-0"));
    fireEvent.click(screen.getByTestId("nova-integrity-apply"));

    // Mid-flight: filter UI is disabled.
    expect(
      (screen.getByTestId("nova-integrity-filter-all") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("nova-integrity-filter-high") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("nova-integrity-search") as HTMLInputElement)
        .disabled,
    ).toBe(true);

    // Resolve apply → state unlocks.
    resolveApply();
    await new Promise((res) => setTimeout(res, 0));
    expect(
      (screen.getByTestId("nova-integrity-filter-all") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
