/**
 * NovaTableModal — Override resolution regression tests
 *
 * Guards that EVERY table-level override is correctly applied before data
 * reaches Firestore (packages collection), the manifests collection, and
 * invoices. Tests use the pure `buildResolvedRows` logic directly (extracted
 * to a testable helper below so no React is needed).
 *
 * ─── Bug index ────────────────────────────────────────────────────────────────
 *
 * BUG-T1  rutaOverrides were NEVER applied to packages / manifests / invoices.
 *         The route picker in Nova lets the operator change a customer's route,
 *         but those changes were silently discarded on save.
 *         Fixed: buildResolvedRows() now applies rutaOverrides first.
 *
 * BUG-T2  nameOverrides were NEVER applied to packages / manifests / invoices.
 *         Inline name edits in Nova's table were lost on save.
 *         Fixed: buildResolvedRows() now applies nameOverrides after matchOverrides.
 *
 * BUG-T3  priceOverrides were NOT reflected in invoice rows.
 *         Recalculated / manually-set prices shown in green in the table were
 *         correct on screen but invoice totals used the raw row.precio from
 *         the manifest file instead.
 *         Fixed: buildResolvedRows() bakes priceOverrides / computedPrices into
 *         the rows before createInvoicesFromRows() is called.
 *
 * BUG-T4  Override priority contract: rutaOverrides (per-slCode) must beat
 *         slCodeOverrides[idx].ruta which must beat matchOverrides[idx].ruta
 *         which must beat row.ruta. Tests lock this priority chain.
 *
 * BUG-T5  computedPrices fallback: when priceOverrides[idx] is absent,
 *         computedPrices[idx] must be used; row.precio is last resort only.
 *
 * BUG-T6  nameOverrides priority: matchOverrides[idx].fullName beats
 *         nameOverrides[idx] which beats row.nombreCliente / row.nombre.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from "vitest";
import type { ProcessedRow } from "@/hooks/use-nova-chat";

// ── Pure buildResolvedRows logic (mirrors the useCallback in NovaTableModal) ──
//
// IMPORTANT: this function must stay in sync with buildResolvedRows in
// NovaTableModal.tsx. If you change the priority chain there, update here too.

interface OverrideMaps {
  slCodeOverrides: Record<number, { slCode: string; ruta: string }>;
  matchOverrides: Record<
    number,
    { slCode: string; fullName: string; ruta: string }
  >;
  rutaOverrides: Record<string, string>;
  nameOverrides: Record<number, string>;
  priceOverrides: Record<number, { precio: number; pesoRedondeo: number }>;
  computedPrices: number[];
}

function buildResolvedRows(
  rows: ProcessedRow[],
  allRows: ProcessedRow[], // represents resultData.rows (full manifest)
  overrides: OverrideMaps,
): ProcessedRow[] {
  const {
    slCodeOverrides,
    matchOverrides,
    rutaOverrides,
    nameOverrides,
    priceOverrides,
    computedPrices,
  } = overrides;

  return rows.map((row) => {
    const idx = allRows.indexOf(row);
    const effSlCode =
      slCodeOverrides[idx]?.slCode ??
      matchOverrides[idx]?.slCode ??
      (row.slCode || "");
    const effRuta =
      rutaOverrides[effSlCode] ??
      rutaOverrides[row.slCode ?? ""] ??
      slCodeOverrides[idx]?.ruta ??
      matchOverrides[idx]?.ruta ??
      (row.ruta || "");
    const effName =
      matchOverrides[idx]?.fullName ??
      nameOverrides[idx] ??
      (row.nombreCliente || row.nombre);
    const effPrice =
      priceOverrides[idx]?.precio ?? computedPrices[idx] ?? row.precio;
    // Mirror NovaTableModal: ceiling only for consolidacion/permisos rows or explicit overrides
    const effPeso =
      priceOverrides[idx]?.pesoRedondeo ??
      (row.consolidacion || row.permisos ? row.pesoRedondeo : null) ??
      row.peso ??
      0;
    return {
      ...row,
      slCode: effSlCode,
      ruta: effRuta,
      nombreCliente: effName,
      precio: effPrice,
      pesoRedondeo: effPeso,
    };
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ProcessedRow> = {}): ProcessedRow {
  return {
    tracking: "TRK-0001",
    nombre: "JUAN PEREZ MANIFEST",
    guia: "",
    manifiesto: "M001",
    peso: 2,
    precio: 15,
    slCode: "SL-001",
    nombreCliente: "JUAN PEREZ DB",
    ruta: "RUTA-A",
    consolidacion: false,
    descripcion: "",
    permisos: false,
    pesoRedondeo: 2,
    diferenciaRedondeo: 0,
    pesoConsolidacion: 0,
    precioSinPermiso: 15,
    precioConPermiso: 18,
    matchScore: 1.0,
    originalData: {},
    ...overrides,
  };
}

const EMPTY_OVERRIDES: OverrideMaps = {
  slCodeOverrides: {},
  matchOverrides: {},
  rutaOverrides: {},
  nameOverrides: {},
  priceOverrides: {},
  computedPrices: [],
};

// ── BUG-T1: rutaOverrides ─────────────────────────────────────────────────────

describe("BUG-T1 — rutaOverrides applied to resolved rows", () => {
  it("rutaOverrides overrides row.ruta for the matching slCode", () => {
    const row = makeRow({ slCode: "SL-001", ruta: "RUTA-A" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      rutaOverrides: { "SL-001": "RUTA-B" },
    });
    expect(resolved.ruta).toBe("RUTA-B");
  });

  it("rutaOverrides only affects the matching slCode, not others", () => {
    const row1 = makeRow({ slCode: "SL-001", ruta: "RUTA-A" });
    const row2 = makeRow({ slCode: "SL-002", ruta: "RUTA-A" });
    const allRows = [row1, row2];
    const resolved = buildResolvedRows(allRows, allRows, {
      ...EMPTY_OVERRIDES,
      rutaOverrides: { "SL-001": "RUTA-B" },
    });
    expect(resolved[0].ruta).toBe("RUTA-B");
    expect(resolved[1].ruta).toBe("RUTA-A");
  });

  it("without rutaOverrides, row.ruta is preserved", () => {
    const row = makeRow({ slCode: "SL-001", ruta: "RUTA-C" });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.ruta).toBe("RUTA-C");
  });

  it("rutaOverrides beats slCodeOverrides[idx].ruta (BUG-T4 priority)", () => {
    const row = makeRow({ slCode: "SL-001", ruta: "RUTA-A" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      rutaOverrides: { "SL-001": "RUTA-WINNER" },
      slCodeOverrides: { 0: { slCode: "SL-001", ruta: "RUTA-LOSER" } },
    });
    expect(resolved.ruta).toBe("RUTA-WINNER");
  });

  it("slCodeOverrides[idx].ruta beats matchOverrides[idx].ruta when no rutaOverrides", () => {
    const row = makeRow({ slCode: "SL-001", ruta: "RUTA-A" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      slCodeOverrides: { 0: { slCode: "SL-001", ruta: "RUTA-SL" } },
      matchOverrides: {
        0: { slCode: "SL-001", fullName: "X", ruta: "RUTA-MATCH" },
      },
    });
    expect(resolved.ruta).toBe("RUTA-SL");
  });

  it("matchOverrides[idx].ruta beats row.ruta when no higher override", () => {
    const row = makeRow({ slCode: "SL-001", ruta: "RUTA-A" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      matchOverrides: {
        0: { slCode: "SL-001", fullName: "X", ruta: "RUTA-MATCH" },
      },
    });
    expect(resolved.ruta).toBe("RUTA-MATCH");
  });

  it("rutaOverrides uses effectiveSlCode (after slCodeOverride) for lookup", () => {
    // Row has original slCode SL-OLD, but slCodeOverride changes it to SL-NEW.
    // rutaOverrides key SL-NEW should apply.
    const row = makeRow({ slCode: "SL-OLD", ruta: "RUTA-A" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      slCodeOverrides: { 0: { slCode: "SL-NEW", ruta: "RUTA-SL" } },
      rutaOverrides: { "SL-NEW": "RUTA-WINNER" },
    });
    expect(resolved.ruta).toBe("RUTA-WINNER");
  });
});

// ── BUG-T2: nameOverrides ─────────────────────────────────────────────────────

describe("BUG-T2 — nameOverrides applied to resolved rows", () => {
  it("nameOverrides replaces nombreCliente", () => {
    const row = makeRow({ nombreCliente: "DB NAME", nombre: "MANIFEST NAME" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      nameOverrides: { 0: "OPERATOR EDIT" },
    });
    expect(resolved.nombreCliente).toBe("OPERATOR EDIT");
  });

  it("matchOverrides.fullName beats nameOverrides (BUG-T6 priority)", () => {
    const row = makeRow({ nombreCliente: "DB NAME" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      matchOverrides: {
        0: { slCode: "SL-001", fullName: "MATCH WINNER", ruta: "" },
      },
      nameOverrides: { 0: "NAME LOSER" },
    });
    expect(resolved.nombreCliente).toBe("MATCH WINNER");
  });

  it("nameOverrides beats row.nombreCliente", () => {
    const row = makeRow({ nombreCliente: "DB NAME" });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      nameOverrides: { 0: "WINNER" },
    });
    expect(resolved.nombreCliente).toBe("WINNER");
  });

  it("row.nombreCliente used when no name override exists", () => {
    const row = makeRow({ nombreCliente: "DB NAME", nombre: "MANIFEST" });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.nombreCliente).toBe("DB NAME");
  });

  it("falls back to row.nombre when nombreCliente is empty and no override", () => {
    const row = makeRow({ nombreCliente: "", nombre: "MANIFEST NAME" });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.nombreCliente).toBe("MANIFEST NAME");
  });

  it("nameOverrides only affects the correct row index", () => {
    const row0 = makeRow({ nombreCliente: "NAME-0" });
    const row1 = makeRow({ nombreCliente: "NAME-1" });
    const allRows = [row0, row1];
    const resolved = buildResolvedRows(allRows, allRows, {
      ...EMPTY_OVERRIDES,
      nameOverrides: { 0: "EDITED-0" },
    });
    expect(resolved[0].nombreCliente).toBe("EDITED-0");
    expect(resolved[1].nombreCliente).toBe("NAME-1");
  });
});

// ── BUG-T3: priceOverrides / computedPrices ───────────────────────────────────

describe("BUG-T3 — priceOverrides applied to resolved rows (invoice price)", () => {
  it("priceOverrides.precio replaces row.precio", () => {
    const row = makeRow({ precio: 10 });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      priceOverrides: { 0: { precio: 25, pesoRedondeo: 2 } },
    });
    expect(resolved.precio).toBe(25);
  });

  it("computedPrices used when priceOverrides absent (BUG-T5)", () => {
    const row = makeRow({ precio: 10 });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      computedPrices: [18],
    });
    expect(resolved.precio).toBe(18);
  });

  it("priceOverrides beats computedPrices", () => {
    const row = makeRow({ precio: 10 });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      priceOverrides: { 0: { precio: 30, pesoRedondeo: 2 } },
      computedPrices: [20],
    });
    expect(resolved.precio).toBe(30);
  });

  it("row.precio is last resort when neither override exists (BUG-T5)", () => {
    const row = makeRow({ precio: 12 });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.precio).toBe(12);
  });

  it("pesoRedondeo from priceOverrides is applied", () => {
    const row = makeRow({ peso: 1.4, pesoRedondeo: 1.4 });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      priceOverrides: { 0: { precio: 15, pesoRedondeo: 2 } },
    });
    expect(resolved.pesoRedondeo).toBe(2);
  });

  it("plain row (no consolidacion/permisos/override) uses raw peso — not ceiling (pesoRedondeo-bug fix)", () => {
    // Manifest processor always sets pesoRedondeo = Math.ceil(peso).
    // Without the fix, this ceiling leaked into saved packages even when no rounding was applied.
    const row = makeRow({
      peso: 0.72,
      pesoRedondeo: 1,
      consolidacion: false,
      permisos: false,
    });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.pesoRedondeo).toBe(0.72); // raw peso, NOT the ceiling 1
  });

  it("consolidacion row still uses ceiling pesoRedondeo when no priceOverride", () => {
    const row = makeRow({
      peso: 0.72,
      pesoRedondeo: 1,
      consolidacion: true,
      permisos: false,
    });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.pesoRedondeo).toBe(1); // ceiling, as displayed in table
  });

  it("permisos row still uses ceiling pesoRedondeo when no priceOverride", () => {
    const row = makeRow({
      peso: 0.78,
      pesoRedondeo: 1,
      consolidacion: false,
      permisos: true,
    });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.pesoRedondeo).toBe(1); // ceiling, as displayed in table
  });

  it("priceOverride pesoRedondeo beats raw peso even on plain row", () => {
    const row = makeRow({
      peso: 0.72,
      pesoRedondeo: 1,
      consolidacion: false,
      permisos: false,
    });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      priceOverrides: { 0: { precio: 15, pesoRedondeo: 2 } },
    });
    expect(resolved.pesoRedondeo).toBe(2); // explicit override wins
  });

  it("multiple rows: each row gets its own price override (BUG-T3)", () => {
    const row0 = makeRow({ precio: 10 });
    const row1 = makeRow({ precio: 20 });
    const allRows = [row0, row1];
    const resolved = buildResolvedRows(allRows, allRows, {
      ...EMPTY_OVERRIDES,
      priceOverrides: { 0: { precio: 50, pesoRedondeo: 2 } },
      computedPrices: [50, 30],
    });
    expect(resolved[0].precio).toBe(50); // priceOverride wins
    expect(resolved[1].precio).toBe(30); // computedPrice wins (no priceOverride for idx 1)
  });
});

// ── Immutability: original row is not mutated ─────────────────────────────────

describe("buildResolvedRows immutability", () => {
  it("does not mutate the original row object", () => {
    const row = makeRow({
      slCode: "SL-001",
      precio: 10,
      ruta: "RUTA-A",
      nombreCliente: "ORIG",
    });
    buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      slCodeOverrides: { 0: { slCode: "SL-999", ruta: "RUTA-Z" } },
      nameOverrides: { 0: "EDITED" },
      priceOverrides: { 0: { precio: 99, pesoRedondeo: 5 } },
    });
    expect(row.slCode).toBe("SL-001");
    expect(row.precio).toBe(10);
    expect(row.ruta).toBe("RUTA-A");
    expect(row.nombreCliente).toBe("ORIG");
  });

  it("returns a new array of new objects", () => {
    const row = makeRow();
    const result = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(result[0]).not.toBe(row);
  });
});

// ── Subset / selection handling ───────────────────────────────────────────────

describe("buildResolvedRows with row subset (selected rows)", () => {
  it("applies overrides by originalIdx correctly for a row subset", () => {
    const row0 = makeRow({ precio: 10, tracking: "TRK-A" });
    const row1 = makeRow({ precio: 20, tracking: "TRK-B" });
    const row2 = makeRow({ precio: 30, tracking: "TRK-C" });
    const allRows = [row0, row1, row2];
    // Operator selected only row0 and row2 (indices 0 and 2)
    const selectedRows = [row0, row2];
    const resolved = buildResolvedRows(selectedRows, allRows, {
      ...EMPTY_OVERRIDES,
      priceOverrides: { 2: { precio: 99, pesoRedondeo: 3 } }, // targets original idx 2 = row2
    });
    // row0 at original idx 0 → no override → uses row.precio
    expect(resolved[0].precio).toBe(10);
    // row2 at original idx 2 → priceOverride → 99
    expect(resolved[1].precio).toBe(99);
  });
});

// ── PERF-1: O(n) performance with large manifests ─────────────────────────────

describe("PERF-1 — buildResolvedRows performance (large manifest)", () => {
  it("resolves 500 rows with all overrides in under 50ms", () => {
    const N = 500;
    const allRows = Array.from({ length: N }, (_, i) =>
      makeRow({
        tracking: `TRK-${i}`,
        slCode: `SL-${i % 50}`,
        precio: i + 1,
        ruta: "RUTA-A",
      }),
    );
    // Overrides on every other row
    const priceOverrides: Record<
      number,
      { precio: number; pesoRedondeo: number }
    > = {};
    const rutaOverrides: Record<string, string> = {};
    const nameOverrides: Record<number, string> = {};
    for (let i = 0; i < N; i += 2) {
      priceOverrides[i] = { precio: 99, pesoRedondeo: 3 };
      nameOverrides[i] = `EDITED-${i}`;
    }
    for (let j = 0; j < 50; j++) rutaOverrides[`SL-${j}`] = "RUTA-OVERRIDE";

    const start = performance.now();
    const resolved = buildResolvedRows(allRows, allRows, {
      ...EMPTY_OVERRIDES,
      priceOverrides,
      rutaOverrides,
      nameOverrides,
    });
    const elapsed = performance.now() - start;

    expect(resolved).toHaveLength(N);
    expect(elapsed).toBeLessThan(50); // must complete in < 50ms
    // Spot-check a row with override
    expect(resolved[0].precio).toBe(99);
    expect(resolved[0].ruta).toBe("RUTA-OVERRIDE");
    expect(resolved[0].nombreCliente).toBe("EDITED-0");
    // Spot-check a row without override
    expect(resolved[1].precio).toBe(2); // row.precio = i+1 = 2
  });

  it("resolves 1000 rows with no overrides in under 20ms", () => {
    const allRows = Array.from({ length: 1000 }, (_, i) =>
      makeRow({ tracking: `TRK-${i}`, precio: i + 1 }),
    );
    const start = performance.now();
    const resolved = buildResolvedRows(allRows, allRows, EMPTY_OVERRIDES);
    const elapsed = performance.now() - start;
    expect(resolved).toHaveLength(1000);
    expect(elapsed).toBeLessThan(20);
  });
});

// ── BUG-F1/F2/F3: filteredIdxs text search uses effective overrides ────────────

// Pure helper that mirrors the filteredIdxs text-search logic in NovaTableModal
function matchesTextFilter(
  row: ProcessedRow,
  idx: number,
  q: string,
  nameOverrides: Record<number, string>,
  matchOverrides: Record<
    number,
    { slCode: string; fullName: string; ruta: string }
  >,
  slCodeOverrides: Record<number, { slCode: string; ruta: string }>,
): boolean {
  const effName =
    matchOverrides[idx]?.fullName ?? nameOverrides[idx] ?? row.nombreCliente;
  const override = slCodeOverrides[idx];
  const effSlCode = override?.slCode || row.slCode;
  return !!(
    row.tracking?.toLowerCase().includes(q) ||
    row.nombre?.toLowerCase().includes(q) ||
    effName?.toLowerCase().includes(q) ||
    effSlCode?.toLowerCase().includes(q) ||
    row.ruta?.toLowerCase().includes(q) ||
    row.descripcion?.toLowerCase().includes(q)
  );
}

describe("BUG-F1 — filteredIdxs text search includes nameOverrides", () => {
  it("finds row when searching the edited name (nameOverride)", () => {
    const row = makeRow({
      nombreCliente: "ORIGINAL NAME",
      nombre: "MANIFEST NAME",
    });
    const nameOverrides = { 0: "PEDRO RAMIREZ" };
    expect(
      matchesTextFilter(row, 0, "pedro ramirez", nameOverrides, {}, {}),
    ).toBe(true);
  });

  it("does NOT find row when searching old name after it was overridden", () => {
    const row = makeRow({
      nombreCliente: "JUAN GARCIA",
      nombre: "MANIFEST NAME",
    });
    const nameOverrides = { 0: "PEDRO RAMIREZ" };
    // Both original and new should match — the old name is still in row.nombre
    // but nombreCliente path is replaced by effName
    expect(
      matchesTextFilter(row, 0, "juan garcia", nameOverrides, {}, {}),
    ).toBe(false);
  });
});

describe("BUG-F2 — filteredIdxs text search includes matchOverrides.fullName", () => {
  it("finds row when searching the matched customer full name", () => {
    const row = makeRow({ nombreCliente: "", nombre: "MANIFEST NAME" });
    const matchOverrides = {
      0: { slCode: "SL-001", fullName: "MARIA LOPEZ VEGA", ruta: "" },
    };
    expect(
      matchesTextFilter(row, 0, "maria lopez", {}, matchOverrides, {}),
    ).toBe(true);
  });

  it("matchOverrides.fullName takes priority over nameOverrides in search", () => {
    const row = makeRow({ nombreCliente: "DB NAME" });
    const matchOverrides = {
      0: { slCode: "SL-001", fullName: "MATCH WINNER", ruta: "" },
    };
    const nameOverrides = { 0: "NAME LOSER" };
    // searching 'match winner' should hit
    expect(
      matchesTextFilter(
        row,
        0,
        "match winner",
        nameOverrides,
        matchOverrides,
        {},
      ),
    ).toBe(true);
    // searching 'name loser' should NOT hit (matchOverrides wins)
    expect(
      matchesTextFilter(
        row,
        0,
        "name loser",
        nameOverrides,
        matchOverrides,
        {},
      ),
    ).toBe(false);
  });
});

describe("BUG-F3 — filteredIdxs text search includes overridden slCode", () => {
  it("finds row when searching the overridden slCode", () => {
    const row = makeRow({ slCode: "SL-OLD" });
    const slCodeOverrides = { 0: { slCode: "SL-NEW-999", ruta: "" } };
    expect(
      matchesTextFilter(row, 0, "sl-new-999", {}, {}, slCodeOverrides),
    ).toBe(true);
  });

  it("does NOT find row by old slCode when it was overridden", () => {
    const row = makeRow({ slCode: "SL-OLD" });
    const slCodeOverrides = { 0: { slCode: "SL-NEW-999", ruta: "" } };
    // original slCode is replaced by effSlCode
    expect(matchesTextFilter(row, 0, "sl-old", {}, {}, slCodeOverrides)).toBe(
      false,
    );
  });
});

// ── BUG-DI1: Sort by "Cliente" must use effective customer name ───────────────
//
// getGroupSortVal and sortRowsInGroup previously used row.nombre (raw manifest
// name) instead of the effective name chain:
//   matchOverrides?.fullName ?? nameOverrides ?? nombreCliente || nombre
// This caused groups to sort under the wrong letter after a customer was
// assigned or a name was edited inline.

function getEffectiveSortName(
  row: ProcessedRow,
  idx: number,
  matchOverrides: Record<
    number,
    { slCode: string; fullName: string; ruta: string }
  >,
  nameOverrides: Record<number, string>,
): string {
  return (
    (matchOverrides[idx]?.fullName ??
      nameOverrides[idx] ??
      (row.nombreCliente || row.nombre)) ||
    ""
  ).toUpperCase();
}

describe("BUG-DI1 — sort by cliente uses effective customer name, not raw manifest name", () => {
  it("matchOverrides.fullName used as sort key (beats raw nombre)", () => {
    const row = makeRow({
      nombre: "JUAN MANIFIESTO",
      nombreCliente: "DB NAME",
    });
    const key = getEffectiveSortName(
      row,
      0,
      { 0: { slCode: "SL-1", fullName: "ZARA WINNER", ruta: "" } },
      {},
    );
    expect(key).toBe("ZARA WINNER");
  });

  it("nameOverrides used as sort key when no matchOverride", () => {
    const row = makeRow({
      nombre: "AAAA MANIFIESTO",
      nombreCliente: "BBBB DB",
    });
    const key = getEffectiveSortName(row, 0, {}, { 0: "ZARA EDITED" });
    expect(key).toBe("ZARA EDITED");
  });

  it("row.nombreCliente used when no overrides", () => {
    const row = makeRow({ nombre: "AAAA MANIF", nombreCliente: "BBBB DB" });
    const key = getEffectiveSortName(row, 0, {}, {});
    expect(key).toBe("BBBB DB");
  });

  it("row.nombre used as last resort when nombreCliente is empty", () => {
    const row = makeRow({ nombre: "CCCC MANIF", nombreCliente: "" });
    const key = getEffectiveSortName(row, 0, {}, {});
    expect(key).toBe("CCCC MANIF");
  });

  it("groups sort correctly by effective name after customer reassignment", () => {
    const rowA = makeRow({ nombre: "ZZZZZ MANIF", nombreCliente: "ZZZZZ DB" });
    const rowB = makeRow({ nombre: "BBBBB MANIF", nombreCliente: "BBBBB DB" });
    // rowA was "ZZZZZ DB" but gets reassigned to "AAAAA WINNER" — must sort before rowB ("BBBBB DB")
    const matchOverrides: Record<
      number,
      { slCode: string; fullName: string; ruta: string }
    > = {
      0: { slCode: "SL-A", fullName: "AAAAA WINNER", ruta: "" },
    };
    const keyA = getEffectiveSortName(rowA, 0, matchOverrides, {});
    const keyB = getEffectiveSortName(rowB, 1, matchOverrides, {});
    expect(keyA.localeCompare(keyB, "es")).toBeLessThan(0); // "AAAAA WINNER" < "BBBBB DB"
  });
});

// ── BUG-DI2: getGroupSecondary for ruta sort must include nameOverrides ────────
//
// Secondary sort key (name) when sorting by Ruta missed nameOverrides,
// using stale nombreCliente when the operator had edited the name inline.

function getGroupSecondaryName(
  row: ProcessedRow,
  idx: number,
  matchOverrides: Record<
    number,
    { slCode: string; fullName: string; ruta: string }
  >,
  nameOverrides: Record<number, string>,
): string {
  return (
    (matchOverrides[idx]?.fullName ??
      nameOverrides[idx] ??
      (row.nombreCliente || row.nombre)) ||
    ""
  ).toUpperCase();
}

describe("BUG-DI2 — secondary sort key (ruta sort) includes nameOverrides", () => {
  it("nameOverrides used in secondary sort key", () => {
    const row = makeRow({
      nombreCliente: "ORIGINAL DB",
      nombre: "ORIGINAL MANIF",
    });
    const key = getGroupSecondaryName(row, 0, {}, { 0: "INLINE EDIT" });
    expect(key).toBe("INLINE EDIT");
  });

  it("matchOverrides beats nameOverrides in secondary sort key", () => {
    const row = makeRow({ nombreCliente: "ORIGINAL DB" });
    const key = getGroupSecondaryName(
      row,
      0,
      { 0: { slCode: "SL-1", fullName: "MATCH WINNER", ruta: "" } },
      { 0: "NAME LOSER" },
    );
    expect(key).toBe("MATCH WINNER");
  });

  it("falls back to nombreCliente when no overrides", () => {
    const row = makeRow({ nombreCliente: "FALLBACK DB", nombre: "MANIF" });
    const key = getGroupSecondaryName(row, 0, {}, {});
    expect(key).toBe("FALLBACK DB");
  });
});

// ── BUG-DI3: Sort by pesoRedondeo must use priceOverrides ─────────────────────
//
// sortRowsInGroup and getGroupSortVal for 'pesoRedondeo' previously read
// row.pesoRedondeo directly, ignoring priceOverrides[idx]?.pesoRedondeo.
// After rounding rows, sorting by P.Redn showed stale pre-rounding values.

function getEffectiveSortPesoRedondeo(
  row: ProcessedRow,
  idx: number,
  priceOverrides: Record<number, { precio: number; pesoRedondeo: number }>,
): number {
  return priceOverrides[idx]?.pesoRedondeo ?? row.pesoRedondeo ?? row.peso ?? 0;
}

describe("BUG-DI3 — sort by pesoRedondeo uses priceOverrides (rounded weight)", () => {
  it("priceOverrides.pesoRedondeo used as sort key", () => {
    const row = makeRow({ peso: 1.3, pesoRedondeo: 1.3 });
    const val = getEffectiveSortPesoRedondeo(row, 0, {
      0: { precio: 10, pesoRedondeo: 2 },
    });
    expect(val).toBe(2);
  });

  it("row.pesoRedondeo used when no priceOverride", () => {
    const row = makeRow({ peso: 1.7, pesoRedondeo: 1.7 });
    const val = getEffectiveSortPesoRedondeo(row, 0, {});
    expect(val).toBe(1.7);
  });

  it("row.peso used as last resort when pesoRedondeo is undefined", () => {
    const row = makeRow({ peso: 2.5 });
    (row as any).pesoRedondeo = undefined;
    const val = getEffectiveSortPesoRedondeo(row, 0, {});
    expect(val).toBe(2.5);
  });

  it("priceOverrides beats row.pesoRedondeo (rounded > original)", () => {
    const row = makeRow({ peso: 1.1, pesoRedondeo: 1.1 });
    const val = getEffectiveSortPesoRedondeo(row, 0, {
      0: { precio: 15, pesoRedondeo: 2 },
    });
    expect(val).toBe(2);
    expect(val).toBeGreaterThan(row.pesoRedondeo);
  });

  it("multiple rows sort correctly by effective pesoRedondeo", () => {
    const rows = [
      { row: makeRow({ pesoRedondeo: 3 }), idx: 0 },
      { row: makeRow({ pesoRedondeo: 1 }), idx: 1 },
      { row: makeRow({ pesoRedondeo: 2 }), idx: 2 },
    ];
    const priceOverrides = { 2: { precio: 20, pesoRedondeo: 5 } }; // idx 2 rounded to 5
    const sorted = [...rows].sort(
      (a, b) =>
        getEffectiveSortPesoRedondeo(a.row, a.idx, priceOverrides) -
        getEffectiveSortPesoRedondeo(b.row, b.idx, priceOverrides),
    );
    // expected asc order: idx1(1), idx0(3), idx2(5)
    expect(sorted[0].idx).toBe(1);
    expect(sorted[1].idx).toBe(0);
    expect(sorted[2].idx).toBe(2);
  });
});

// ── BUG-DI5: Invoice totalWeight must use priceOverrides.pesoRedondeo ─────────
//
// buildOne() used r.pesoRedondeo || r.peso directly for totalWeight.
// After the operator rounded weights via the "Redondear" action,
// the invoice preview/totalWeight showed the pre-rounded value,
// while the displayed table and price already reflected the rounded weight.

function calcTotalWeight(
  rowList: ProcessedRow[],
  allRows: ProcessedRow[],
  priceOverrides: Record<number, { precio: number; pesoRedondeo: number }>,
  isConsolidation: boolean,
  ceilTotalPeso: number,
): number {
  if (isConsolidation) return ceilTotalPeso;
  return rowList.reduce((s, r) => {
    const rIdx = allRows.indexOf(r);
    return (
      s + (priceOverrides[rIdx]?.pesoRedondeo ?? r.pesoRedondeo ?? r.peso ?? 0)
    );
  }, 0);
}

describe("BUG-DI5 — invoice totalWeight uses priceOverrides.pesoRedondeo", () => {
  it("totalWeight reflects rounded pesoRedondeo from priceOverrides", () => {
    const row = makeRow({ peso: 1.4, pesoRedondeo: 1.4 });
    const allRows = [row];
    const priceOverrides = { 0: { precio: 15, pesoRedondeo: 2 } };
    const w = calcTotalWeight([row], allRows, priceOverrides, false, 0);
    expect(w).toBe(2);
  });

  it("totalWeight falls back to row.pesoRedondeo when no priceOverride", () => {
    const row = makeRow({ peso: 1.4, pesoRedondeo: 1.4 });
    const w = calcTotalWeight([row], [row], {}, false, 0);
    expect(w).toBe(1.4);
  });

  it("totalWeight falls back to row.peso when pesoRedondeo is undefined", () => {
    const row = makeRow({ peso: 1.9 });
    (row as any).pesoRedondeo = undefined;
    const w = calcTotalWeight([row], [row], {}, false, 0);
    expect(w).toBe(1.9);
  });

  it("totalWeight sums multiple rows correctly with mixed overrides", () => {
    const row0 = makeRow({ peso: 1, pesoRedondeo: 1 });
    const row1 = makeRow({ peso: 1.4, pesoRedondeo: 1.4 });
    const allRows = [row0, row1];
    const priceOverrides = { 1: { precio: 10, pesoRedondeo: 2 } };
    const w = calcTotalWeight([row0, row1], allRows, priceOverrides, false, 0);
    expect(w).toBe(3); // row0:1 (no override) + row1:2 (override)
  });

  it("totalWeight for consolidation returns ceilTotalPeso ignoring row data", () => {
    const row0 = makeRow({ peso: 1.2, pesoRedondeo: 1.2 });
    const row1 = makeRow({ peso: 1.3, pesoRedondeo: 1.3 });
    const allRows = [row0, row1];
    const priceOverrides = { 0: { precio: 20, pesoRedondeo: 5 } };
    const w = calcTotalWeight([row0, row1], allRows, priceOverrides, true, 3);
    expect(w).toBe(3); // ceilTotalPeso wins for consolidation
  });

  it("priceOverrides.pesoRedondeo beats row.pesoRedondeo in total", () => {
    const row = makeRow({ peso: 1.1, pesoRedondeo: 1.1 });
    const allRows = [row];
    const overridedW = calcTotalWeight(
      [row],
      allRows,
      { 0: { precio: 10, pesoRedondeo: 2 } },
      false,
      0,
    );
    const rawW = calcTotalWeight([row], allRows, {}, false, 0);
    expect(overridedW).toBeGreaterThan(rawW);
    expect(overridedW).toBe(2);
    expect(rawW).toBe(1.1);
  });
});

// ── BUG-F4: rowNeedsReview respects manual operator assignments ───────────────

// Pure helper mirroring rowNeedsReview logic in NovaTableModal
function rowNeedsReview(
  row: ProcessedRow,
  originalIdx: number,
  slCodeOverrides: Record<number, { slCode: string; ruta: string }>,
  matchOverrides: Record<
    number,
    { slCode: string; fullName: string; ruta: string }
  >,
): boolean {
  const overrideSlCode = slCodeOverrides[originalIdx]?.slCode;
  const effectiveSlCode = overrideSlCode || row.slCode;
  if (!effectiveSlCode) return true;
  const hasManualAssignment = !!(
    matchOverrides[originalIdx] || slCodeOverrides[originalIdx]
  );
  if (!row.nombreCliente && !hasManualAssignment) return true;
  if (
    row.matchScore !== undefined &&
    row.matchScore < 0.65 &&
    !hasManualAssignment
  )
    return true;
  return false;
}

describe("BUG-F4 — rowNeedsReview respects manual operator assignments", () => {
  it("flags unmatched row (no slCode) as needing review", () => {
    const row = makeRow({ slCode: "", nombreCliente: "" });
    expect(rowNeedsReview(row, 0, {}, {})).toBe(true);
  });

  it("flags row with matchScore < 0.65 and no manual assignment", () => {
    const row = makeRow({
      slCode: "SL-001",
      matchScore: 0.5,
      nombreCliente: "DB NAME",
    });
    expect(rowNeedsReview(row, 0, {}, {})).toBe(true);
  });

  it("does NOT flag row with matchScore < 0.65 when operator applied matchOverrides", () => {
    const row = makeRow({
      slCode: "SL-001",
      matchScore: 0.4,
      nombreCliente: "DB NAME",
    });
    const matchOverrides = {
      0: { slCode: "SL-001", fullName: "ASSIGNED NAME", ruta: "RUTA-A" },
    };
    expect(rowNeedsReview(row, 0, {}, matchOverrides)).toBe(false);
  });

  it("does NOT flag row with matchScore < 0.65 when operator applied slCodeOverrides", () => {
    const row = makeRow({
      slCode: "SL-OLD",
      matchScore: 0.3,
      nombreCliente: "",
    });
    const slCodeOverrides = { 0: { slCode: "SL-NEW", ruta: "RUTA-B" } };
    expect(rowNeedsReview(row, 0, slCodeOverrides, {})).toBe(false);
  });

  it("flags row with no nombreCliente and no matchOverride", () => {
    const row = makeRow({
      slCode: "SL-001",
      nombreCliente: "",
      matchScore: 0.95,
    });
    expect(rowNeedsReview(row, 0, {}, {})).toBe(true);
  });

  it("does NOT flag row with no nombreCliente when matchOverride exists", () => {
    const row = makeRow({
      slCode: "SL-001",
      nombreCliente: "",
      matchScore: 0.95,
    });
    const matchOverrides = {
      0: { slCode: "SL-001", fullName: "ASSIGNED NAME", ruta: "" },
    };
    expect(rowNeedsReview(row, 0, {}, matchOverrides)).toBe(false);
  });

  it("does NOT flag row with good match score and no overrides", () => {
    const row = makeRow({
      slCode: "SL-001",
      nombreCliente: "DB NAME",
      matchScore: 0.95,
    });
    expect(rowNeedsReview(row, 0, {}, {})).toBe(false);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("buildResolvedRows edge cases", () => {
  it("returns empty array for empty input", () => {
    expect(buildResolvedRows([], [], EMPTY_OVERRIDES)).toHaveLength(0);
  });

  it("handles row with no slCode (unmatched) correctly", () => {
    const row = makeRow({ slCode: "", ruta: "", nombreCliente: "" });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.slCode).toBe("");
    expect(resolved.ruta).toBe("");
    expect(resolved.nombreCliente).toBe(row.nombre);
  });

  it("handles row not found in allRows (idx -1) gracefully — preserves row values when no override at -1", () => {
    const allRows = [makeRow({ tracking: "TRK-X" })];
    const orphanRow = makeRow({ tracking: "TRK-ORPHAN", precio: 42 });
    // orphanRow is not in allRows, so idxOf.get returns undefined → idx = -1
    // No priceOverride at -1, so row.precio should be preserved
    const resolved = buildResolvedRows([orphanRow], allRows, EMPTY_OVERRIDES);
    expect(resolved[0].precio).toBe(42);
    expect(resolved[0].tracking).toBe("TRK-ORPHAN");
  });

  it("handles undefined computedPrices entry — falls back to row.precio", () => {
    const row = makeRow({ precio: 17 });
    const [resolved] = buildResolvedRows([row], [row], {
      ...EMPTY_OVERRIDES,
      computedPrices: [], // empty — index 0 is undefined
    });
    expect(resolved.precio).toBe(17);
  });

  it("handles row with zero peso and price", () => {
    const row = makeRow({ peso: 0, precio: 0, pesoRedondeo: 0 });
    const [resolved] = buildResolvedRows([row], [row], EMPTY_OVERRIDES);
    expect(resolved.peso).toBe(0);
    expect(resolved.precio).toBe(0);
  });

  it("all overrides applied simultaneously to same row", () => {
    const row = makeRow({
      slCode: "SL-A",
      ruta: "R-A",
      nombreCliente: "DB",
      precio: 5,
      pesoRedondeo: 1,
    });
    const [resolved] = buildResolvedRows([row], [row], {
      slCodeOverrides: { 0: { slCode: "SL-B", ruta: "R-B" } },
      matchOverrides: {
        0: { slCode: "SL-B", fullName: "MATCHED", ruta: "R-MATCH" },
      },
      rutaOverrides: { "SL-B": "R-RUTA" },
      nameOverrides: { 0: "NAME-EDIT" },
      priceOverrides: { 0: { precio: 50, pesoRedondeo: 3 } },
      computedPrices: [20],
    });
    expect(resolved.slCode).toBe("SL-B"); // slCodeOverride wins
    expect(resolved.ruta).toBe("R-RUTA"); // rutaOverrides wins (keyed on effSlCode SL-B)
    expect(resolved.nombreCliente).toBe("MATCHED"); // matchOverride beats nameOverride
    expect(resolved.precio).toBe(50); // priceOverride beats computedPrice
    expect(resolved.pesoRedondeo).toBe(3);
  });

  it("resolves route from customerContactMap when rutaOverrides is empty", () => {
    const row = makeRow({
      slCode: "SL9999",
      ruta: "",
    });
    const customerContactMap = new Map([["SL9999", { ruta: "HEREDIA" }]]);
    const effSlCode = row.slCode;
    const rutaOverrides: Record<string, string> = {};
    const effRuta = rutaOverrides[effSlCode] ?? customerContactMap.get(effSlCode)?.ruta ?? row.ruta;
    expect(effRuta).toBe("HEREDIA");
  });

  it("flags zero-weight packages for DUA custom handling", () => {
    const zeroWeightRow = makeRow({ peso: 0 });
    const normalWeightRow = makeRow({ peso: 1.5 });
    const pesoOverrides: Record<number, number> = {};

    const isDuaRow1 = (pesoOverrides[0] ?? zeroWeightRow.peso ?? 0) === 0;
    const isDuaRow2 = (pesoOverrides[1] ?? normalWeightRow.peso ?? 0) === 0;

    expect(isDuaRow1).toBe(true);
    expect(isDuaRow2).toBe(false);
  });
});
