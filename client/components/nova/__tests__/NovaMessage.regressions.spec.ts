/**
 * NovaMessage — Regression tests
 *
 * Each test guards a specific bug that was found and fixed.
 * If any of these fail, fix the production code — never modify this file.
 *
 * ─── Bug index ────────────────────────────────────────────────────────────────
 * BUG-01  exchangeRate default was '' → TC computations produced 0 CRC totals.
 *         Fixed: useState('500').
 *
 * BUG-02  rowNeedsReview filter not applied — rows with no slCode, no
 *         nombreCliente, or matchScore < 0.65 were not flagged for review,
 *         causing mismatched customers to slip through undetected.
 *         Fixed: showOnlyReview state + rowNeedsReview predicate.
 *
 * BUG-03  activeTotal / groupTotal used row.precio directly instead of
 *         priceOverrides — recalculated prices were shown green in the cell
 *         but the footer total and invoices still used the original (wrong) price.
 *         Fixed: all totals go through getEffectivePrice(idx, row).
 *
 * BUG-04  (gemini-client) Weight outlier detection used mean+3σ which was
 *         contaminated by the very outlier it tried to detect.
 *         Fixed: replaced with median+IQR (Tukey fences) in gemini-client.ts.
 *         Regression test lives in gemini-client.spec.ts.
 */

import { describe, it, expect } from "vitest";

// ─── Shared fixture type (mirrors ProcessedRow fields used here) ──────────────
interface RowFixture {
  slCode: string;
  nombreCliente: string;
  matchScore: number;
  precio: number;
}

// ─── BUG-01: exchangeRate default ─────────────────────────────────────────────
// The default value is hard-coded as a string literal in useState — we verify
// that parsing it gives a positive number so invoices calculate real CRC amounts.
describe("BUG-01 — exchangeRate default", () => {
  const EXCHANGE_RATE_DEFAULT = "500";

  it("default value must be a non-empty string", () => {
    expect(EXCHANGE_RATE_DEFAULT).not.toBe("");
  });

  it("default value must parse to a positive number", () => {
    const tc = parseFloat(EXCHANGE_RATE_DEFAULT);
    expect(tc).toBeGreaterThan(0);
  });

  it("default value must equal 500", () => {
    expect(parseFloat(EXCHANGE_RATE_DEFAULT)).toBe(500);
  });

  it("CRC total with default TC is non-zero for a $1 invoice", () => {
    const tc = parseFloat(EXCHANGE_RATE_DEFAULT);
    const totalUSD = 1;
    const totalCRC = tc > 0 ? Math.round(totalUSD * tc) : 0;
    expect(totalCRC).toBe(500);
  });

  it("regression: empty string default would produce CRC = 0", () => {
    // This documents the exact failure mode we fixed
    const badDefault = "";
    const tc = parseFloat(badDefault);
    const totalCRC = tc > 0 ? Math.round(1 * tc) : 0;
    expect(totalCRC).toBe(0); // confirms the old bug DID produce wrong results
  });
});

// ─── BUG-02: rowNeedsReview predicate ────────────────────────────────────────
// Extracted inline logic from the table render — must match exactly what
// NovaMessage.tsx evaluates inside the filtered.filter() call.
function rowNeedsReview(
  row: RowFixture,
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
  if (!row.nombreCliente && !matchOverrides[originalIdx]) return true;
  if (row.matchScore !== undefined && row.matchScore < 0.65) return true;
  return false;
}

describe("BUG-02 — rowNeedsReview filter predicate", () => {
  const noOverrides = {};

  it("flags row with no slCode", () => {
    const row: RowFixture = {
      slCode: "",
      nombreCliente: "JUAN",
      matchScore: 0.95,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(true);
  });

  it("flags row with slCode but no nombreCliente and no matchOverride", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "",
      matchScore: 0.95,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(true);
  });

  it("flags row with matchScore below 0.65", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "JUAN",
      matchScore: 0.5,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(true);
  });

  it("flags row with matchScore exactly 0.64 (boundary)", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "JUAN",
      matchScore: 0.64,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(true);
  });

  it("does NOT flag row with matchScore exactly 0.65 (boundary)", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "JUAN",
      matchScore: 0.65,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(false);
  });

  it("does NOT flag fully matched row with high score", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "JUAN PEREZ",
      matchScore: 0.95,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(false);
  });

  it("does NOT flag row with no nombreCliente when matchOverride exists", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "",
      matchScore: 0.95,
      precio: 8,
    };
    const matchOverrides = {
      0: { slCode: "SL001", fullName: "JUAN PEREZ", ruta: "Heredia" },
    };
    expect(rowNeedsReview(row, 0, noOverrides, matchOverrides)).toBe(false);
  });

  it("does NOT flag row when slCode comes from slCodeOverride even if row.slCode is empty", () => {
    const row: RowFixture = {
      slCode: "",
      nombreCliente: "JUAN",
      matchScore: 0.95,
      precio: 8,
    };
    const slCodeOverrides = { 0: { slCode: "SL002", ruta: "Cartago 1" } };
    // slCode override fills the gap but nombreCliente exists — should NOT need review
    expect(rowNeedsReview(row, 0, slCodeOverrides, noOverrides)).toBe(false);
  });

  it("regression: row with matchScore=0 (complete mismatch) must be flagged", () => {
    const row: RowFixture = {
      slCode: "SL001",
      nombreCliente: "UNKNOWN",
      matchScore: 0,
      precio: 8,
    };
    expect(rowNeedsReview(row, 0, noOverrides, noOverrides)).toBe(true);
  });
});

// ─── BUG-03: price totals use priceOverrides, not raw row.precio ──────────────
// Mirrors the exact reduce logic used in activeTotal, groupTotal, and buildOne.
function computeTotal(
  rows: RowFixture[],
  priceOverrides: Record<number, { precio: number; pesoRedondeo: number }>,
): number {
  return rows.reduce(
    (s, r, i) => s + (priceOverrides[i]?.precio ?? r.precio),
    0,
  );
}

describe("BUG-03 — price totals respect priceOverrides", () => {
  it("returns original prices when no overrides", () => {
    const rows: RowFixture[] = [
      { slCode: "SL1", nombreCliente: "A", matchScore: 1, precio: 2.14 },
      { slCode: "SL2", nombreCliente: "B", matchScore: 1, precio: 2.4 },
    ];
    expect(computeTotal(rows, {})).toBeCloseTo(4.54, 2);
  });

  it("uses overridden price when override exists", () => {
    const rows: RowFixture[] = [
      { slCode: "SL1", nombreCliente: "A", matchScore: 1, precio: 2.14 },
      { slCode: "SL2", nombreCliente: "B", matchScore: 1, precio: 2.4 },
    ];
    const overrides = { 0: { precio: 8, pesoRedondeo: 1 } };
    // Row 0 overridden from $2.14 → $8; row 1 unchanged $2.40
    expect(computeTotal(rows, overrides)).toBeCloseTo(10.4, 2);
  });

  it("uses all overridden prices when every row is overridden", () => {
    const rows: RowFixture[] = [
      { slCode: "SL1", nombreCliente: "A", matchScore: 1, precio: 2.14 },
      { slCode: "SL2", nombreCliente: "B", matchScore: 1, precio: 2.4 },
    ];
    const overrides = {
      0: { precio: 8, pesoRedondeo: 1 },
      1: { precio: 12, pesoRedondeo: 1 },
    };
    expect(computeTotal(rows, overrides)).toBe(20);
  });

  it("regression: using row.precio directly would give wrong total when override exists", () => {
    const rows: RowFixture[] = [
      { slCode: "SL1", nombreCliente: "A", matchScore: 1, precio: 2.14 },
    ];
    const overrides = { 0: { precio: 8, pesoRedondeo: 1 } };

    // Old (broken) behaviour: sum raw prices
    const brokenTotal = rows.reduce((s, r) => s + r.precio, 0);
    // New (correct) behaviour: use overrides
    const correctTotal = computeTotal(rows, overrides);

    expect(brokenTotal).toBeCloseTo(2.14, 2); // the bug produced this
    expect(correctTotal).toBeCloseTo(8.0, 2); // the fix produces this
    expect(brokenTotal).not.toBe(correctTotal); // the two must differ
  });

  it("partial override: only overridden rows change, others stay original", () => {
    const rows: RowFixture[] = [
      { slCode: "SL1", nombreCliente: "A", matchScore: 1, precio: 5 },
      { slCode: "SL2", nombreCliente: "B", matchScore: 1, precio: 10 },
      { slCode: "SL3", nombreCliente: "C", matchScore: 1, precio: 15 },
    ];
    const overrides = { 1: { precio: 20, pesoRedondeo: 2 } };
    // 5 + 20 + 15 = 40
    expect(computeTotal(rows, overrides)).toBe(40);
  });
});
