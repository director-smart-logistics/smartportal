import { describe, it, expect } from "vitest";
import { cn, safeFormatEmployeeDate } from ".././utils";
import { safeFormatDate } from ".././services/invoice-service";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("handles undefined inputs gracefully", () => {
    expect(cn("base", undefined, "extra")).toBe("base extra");
  });

  it("flattens nested arrays of class names", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c");
  });

  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("p-1 p-2 p-4")).toBe("p-4");
  });

  it("preserves non-conflicting tailwind classes", () => {
    const out = cn("text-red-500 font-bold", "px-2");
    expect(out).toContain("text-red-500");
    expect(out).toContain("font-bold");
    expect(out).toContain("px-2");
  });

  it("returns empty string for empty input", () => {
    expect(cn()).toBe("");
  });

  it("returns empty string when every input is falsy", () => {
    expect(cn(false, null, undefined, "")).toBe("");
  });

  it("merges arbitrary value combinations from clsx docs", () => {
    expect(cn("foo", { bar: true }, ["baz", { qux: true }])).toBe("foo bar baz qux");
  });

  it("treats numeric inputs as no-ops (clsx skips them)", () => {
    expect(cn("base", 0, "extra")).toBe("base extra");
  });

  it("handles long class strings without truncation", () => {
    const long = Array.from({ length: 20 }, (_, i) => `cls-${i}`).join(" ");
    expect(cn(long)).toBe(long);
  });

  it("user-provided className overrides default tailwind classes (CTA pattern)", () => {
    // Mirrors the cn() pattern used in shadcn components: defaults first,
    // user override last. Tailwind-merge keeps the override.
    const className = "bg-red-500";
    expect(cn("bg-blue-500 text-white", className)).toBe("text-white bg-red-500");
  });
});

describe("safeFormatDate function", () => {
  it("should return empty string for empty input", () => {
    expect(safeFormatDate(null)).toBe("");
    expect(safeFormatDate(undefined)).toBe("");
    expect(safeFormatDate("")).toBe("");
  });

  it("should preserve already formatted DD/MM/YYYY dates", () => {
    expect(safeFormatDate("13/07/2026")).toBe("13/07/2026");
    expect(safeFormatDate("13-07-2026")).toBe("13-07-2026");
    expect(safeFormatDate("1/1/2026")).toBe("1/1/2026");
  });

  it("should format ISO strings to Costa Rica locale date", () => {
    // 2026-07-14T00:20:23.367Z is July 13th in Costa Rica (UTC-6)
    expect(safeFormatDate("2026-07-14T00:20:23.367Z")).toBe("13/7/2026");
  });

  it("should format Firestore Timestamp objects", () => {
    const mockTimestamp = {
      seconds: 1783900800, // 2026-07-14 in UTC
      nanoseconds: 0,
      toDate: () => new Date(1783900800 * 1000),
    };
    // 1783900800 is 2026-07-13 00:00:00 UTC, which is 2026-07-12 18:00:00 in Costa Rica
    expect(safeFormatDate(mockTimestamp)).toBe("12/7/2026");
  });

  it("should fallback to string representation for invalid values", () => {
    expect(safeFormatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("safeFormatEmployeeDate function", () => {
  it("should return dash for empty/null inputs", () => {
    expect(safeFormatEmployeeDate(null)).toBe("—");
    expect(safeFormatEmployeeDate(undefined)).toBe("—");
    expect(safeFormatEmployeeDate("")).toBe("—");
  });

  it("should format YYYY-MM-DD correctly without timezone rollback (e.g. 2024-05-13 => 13/5/2024)", () => {
    expect(safeFormatEmployeeDate("2024-05-13")).toBe("13/5/2024");
    expect(safeFormatEmployeeDate("2026-04-05")).toBe("5/4/2026");
  });

  it("should format ISO strings with T00:00:00.000Z without timezone rollback", () => {
    expect(safeFormatEmployeeDate("2024-05-13T00:00:00.000Z")).toBe("13/5/2024");
  });

  it("should format ISO strings with T12:00:00.000Z correctly", () => {
    expect(safeFormatEmployeeDate("2024-05-13T12:00:00.000Z")).toBe("13/5/2024");
  });

  it("should preserve already formatted DD/MM/YYYY dates", () => {
    expect(safeFormatEmployeeDate("13/5/2024")).toBe("13/5/2024");
  });
});

