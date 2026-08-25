/**
 * nova-invoice-grouping.spec.ts
 *
 * Unit tests for the Factura única (unified invoice) grouping utilities.
 * Guards the default-on behaviour, consolidation exclusion, and the mutual-
 * exclusion invariant between separateInvoices and mergedInvoices.
 *
 * ─── Contract index ───────────────────────────────────────────────────────────
 *
 * FUI-01  getGroupKey — linked row (has slCode) uses slCode as key.
 * FUI-02  getGroupKey — unmatched row (no slCode) uses '__unmatched__' prefix.
 * FUI-03  computeGroupKeyCounts — counts rows correctly per key.
 * FUI-04  computeConsolidationKeys — only marks groups with consolidacion=true AND ≥2 rows.
 * FUI-05  computeConsolidationKeys — single-row consolidacion group is NOT a consolidation key.
 * FUI-06  computeSeparateInvoiceDefaults — mirrors legacy initializer exactly.
 * FUI-07  computeMergedInvoiceDefaults — multi-row linked groups default to true.
 * FUI-08  computeMergedInvoiceDefaults — single-row linked groups are NOT in defaults.
 * FUI-09  computeMergedInvoiceDefaults — unmatched rows (no slCode) are NOT in defaults.
 * FUI-10  computeMergedInvoiceDefaults — consolidation groups are NOT in defaults (mutual exclusion).
 * FUI-11  computeMergedInvoiceDefaults — empty input produces empty object.
 * FUI-12  countActiveUnifiedGroups — counts groups where mergedInvoices=true AND separateInvoices=false.
 * FUI-13  countActiveUnifiedGroups — separateInvoices=true wins over mergedInvoices=true.
 * FUI-14  countActiveUnifiedGroups — each slCode counted only once even if multiple rows share it.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from 'vitest';
import {
  getGroupKey,
  computeGroupKeyCounts,
  computeConsolidationKeys,
  computeSeparateInvoiceDefaults,
  computeMergedInvoiceDefaults,
  countActiveUnifiedGroups,
  computeAutoConsolidationKeys,
  computeAutoFacturaUnicaKeys,
  computeProtectedGroupKeys,
  type InvoiceGroupingRow,
} from '.././nova-invoice-grouping';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function row(overrides: Partial<InvoiceGroupingRow> = {}): InvoiceGroupingRow {
  return { slCode: 'SL001', nombre: 'JUAN PEREZ', consolidacion: false, ...overrides };
}

// ── getGroupKey ───────────────────────────────────────────────────────────────

describe('getGroupKey', () => {
  it('FUI-01: linked row uses slCode', () => {
    expect(getGroupKey(row({ slCode: 'SL042' }))).toBe('SL042');
  });

  it('FUI-02: unmatched row uses __unmatched__ prefix', () => {
    expect(getGroupKey(row({ slCode: null, nombre: 'JOSE LOPEZ' }))).toBe('__unmatched__JOSE LOPEZ');
  });

  it('empty slCode and empty nombre falls back to __unmatched__', () => {
    expect(getGroupKey({ slCode: '', nombre: '' })).toBe('__unmatched__');
  });
});

// ── computeGroupKeyCounts ─────────────────────────────────────────────────────

describe('computeGroupKeyCounts', () => {
  it('FUI-03: counts rows per key', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL002' }),
      row({ slCode: null, nombre: 'JOSE' }),
    ];
    const counts = computeGroupKeyCounts(rows);
    expect(counts['SL001']).toBe(2);
    expect(counts['SL002']).toBe(1);
    expect(counts['__unmatched__JOSE']).toBe(1);
  });
});

// ── computeConsolidationKeys ──────────────────────────────────────────────────

describe('computeConsolidationKeys', () => {
  it('FUI-04: marks group with consolidacion=true and ≥2 rows', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001', consolidacion: true }),
      row({ slCode: 'SL001', consolidacion: false }),
    ];
    expect(computeConsolidationKeys(rows).has('SL001')).toBe(true);
  });

  it('FUI-05: single-row consolidacion group is NOT a consolidation key', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001', consolidacion: true }),
    ];
    expect(computeConsolidationKeys(rows).has('SL001')).toBe(false);
  });

  it('multi-row group without consolidacion=true is not a consolidation key', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001', consolidacion: false }),
      row({ slCode: 'SL001', consolidacion: false }),
    ];
    expect(computeConsolidationKeys(rows).has('SL001')).toBe(false);
  });
});

// ── computeSeparateInvoiceDefaults ────────────────────────────────────────────

describe('computeSeparateInvoiceDefaults', () => {
  it('FUI-06: returns true for consolidation groups, mirrors legacy init', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001', consolidacion: true }),
      row({ slCode: 'SL001', consolidacion: false }),
      row({ slCode: 'SL002', consolidacion: false }),
      row({ slCode: 'SL002', consolidacion: false }),
    ];
    const result = computeSeparateInvoiceDefaults(rows);
    expect(result['SL001']).toBe(true);
    expect(result['SL002']).toBeUndefined();
  });

  it('empty input produces empty object', () => {
    expect(computeSeparateInvoiceDefaults([])).toEqual({});
  });
});

// ── computeMergedInvoiceDefaults ──────────────────────────────────────────────

describe('computeMergedInvoiceDefaults', () => {
  it('FUI-07: multi-row linked group defaults to true', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
    ];
    expect(computeMergedInvoiceDefaults(rows)['SL001']).toBe(true);
  });

  it('FUI-08: single-row linked group is NOT in defaults', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
    ];
    expect(computeMergedInvoiceDefaults(rows)['SL001']).toBeUndefined();
  });

  it('FUI-09: unmatched rows (no slCode) are NOT in defaults', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: null, nombre: 'JOSE' }),
      row({ slCode: null, nombre: 'JOSE' }),
    ];
    const result = computeMergedInvoiceDefaults(rows);
    expect(result['__unmatched__JOSE']).toBeUndefined();
    expect(Object.keys(result).length).toBe(0);
  });

  it('FUI-10: consolidation groups are NOT in defaults (mutual exclusion)', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001', consolidacion: true }),
      row({ slCode: 'SL001', consolidacion: false }),
    ];
    expect(computeMergedInvoiceDefaults(rows)['SL001']).toBeUndefined();
  });

  it('FUI-11: empty input produces empty object', () => {
    expect(computeMergedInvoiceDefaults([])).toEqual({});
  });

  it('mixed manifest: consolidation group excluded, regular multi-row group included', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001', consolidacion: true }),
      row({ slCode: 'SL001', consolidacion: false }),
      row({ slCode: 'SL002', consolidacion: false }),
      row({ slCode: 'SL002', consolidacion: false }),
      row({ slCode: 'SL003', consolidacion: false }),
    ];
    const result = computeMergedInvoiceDefaults(rows);
    expect(result['SL001']).toBeUndefined();
    expect(result['SL002']).toBe(true);
    expect(result['SL003']).toBeUndefined();
  });

  it('each slCode key appears at most once in defaults', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
    ];
    const result = computeMergedInvoiceDefaults(rows);
    expect(Object.keys(result).filter(k => k === 'SL001').length).toBe(1);
    expect(result['SL001']).toBe(true);
  });
});

// ── countActiveUnifiedGroups ──────────────────────────────────────────────────

describe('countActiveUnifiedGroups', () => {
  it('FUI-12: counts groups where mergedInvoices=true AND separateInvoices=false', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL002' }),
      row({ slCode: 'SL002' }),
    ];
    const merged = { SL001: true, SL002: true };
    const separate = {};
    expect(countActiveUnifiedGroups(rows, merged, separate)).toBe(2);
  });

  it('FUI-13: separateInvoices=true wins over mergedInvoices=true', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
    ];
    const merged = { SL001: true };
    const separate = { SL001: true };
    expect(countActiveUnifiedGroups(rows, merged, separate)).toBe(0);
  });

  it('FUI-14: each slCode counted only once regardless of row count', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
    ];
    const merged = { SL001: true };
    const separate = {};
    expect(countActiveUnifiedGroups(rows, merged, separate)).toBe(1);
  });

  it('groups with mergedInvoices=false are not counted', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL001' }),
      row({ slCode: 'SL001' }),
    ];
    const merged = { SL001: false };
    const separate = {};
    expect(countActiveUnifiedGroups(rows, merged, separate)).toBe(0);
  });

  it('returns 0 for empty rows', () => {
    expect(countActiveUnifiedGroups([], {}, {})).toBe(0);
  });
});

// ── computeAutoConsolidationKeys ──────────────────────────────────────────────
//
// Regression: when the operator manually links a row to an existing slCode
// via the "Vincular cliente" dialog, consolidation must auto-activate once the
// effective group reaches ≥ 2 members — not only when the original row.slCode
// already matched. Previously the counting used row.slCode directly, so the
// operator's matchOverride never re-triggered consolidation and billing stayed
// individual even with the "C" badge visible on both rows.

describe('computeAutoConsolidationKeys', () => {
  const emptyInput = {
    slCodeOverrides: {},
    matchOverrides: {},
    unlinkedRows: new Set<number>(),
    operatorOverrideKeys: new Set<string>(),
    customerConsolidationEnabled: new Map<string, boolean>(),
  };

  it('activates consolidation when matchOverrides merges an unmatched row into a linked slCode', () => {
    // Initial: one linked row (LIDIA, slCode=SL66, consolidacion=true) + one
    // unmatched row (LIDOA, no slCode, consolidacion=true). Operator links
    // LIDOA → SL66 via matchOverrides.
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', nombre: 'LIDIA CANO CANO', consolidacion: true }),
      row({ slCode: null,   nombre: 'LIDOA CANO CANO', consolidacion: true }),
    ];
    const result = computeAutoConsolidationKeys({
      ...emptyInput,
      rows,
      matchOverrides: { 1: { slCode: 'SL66' } },
    });
    expect(result.has('SL66')).toBe(true);
  });

  it('does NOT activate consolidation without the override (single-member group)', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', nombre: 'LIDIA CANO CANO', consolidacion: true }),
      row({ slCode: null,   nombre: 'LIDOA CANO CANO', consolidacion: true }),
    ];
    const result = computeAutoConsolidationKeys({ ...emptyInput, rows });
    expect(result.has('SL66')).toBe(false);
  });

  it('activates when customer.consolidationEnabled is true (even if row.consolidacion is false)', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', consolidacion: false }),
      row({ slCode: 'SL66', consolidacion: false }),
    ];
    const result = computeAutoConsolidationKeys({
      ...emptyInput,
      rows,
      customerConsolidationEnabled: new Map([['SL66', true]]),
    });
    expect(result.has('SL66')).toBe(true);
  });

  it('respects operatorOverrideKeys — skips slCodes the operator manually toggled', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', consolidacion: true }),
      row({ slCode: 'SL66', consolidacion: true }),
    ];
    const result = computeAutoConsolidationKeys({
      ...emptyInput,
      rows,
      operatorOverrideKeys: new Set(['SL66']),
    });
    expect(result.has('SL66')).toBe(false);
  });

  it('ignores unlinkedRows when counting group members', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', consolidacion: true }),
      row({ slCode: 'SL66', consolidacion: true }),
    ];
    const result = computeAutoConsolidationKeys({
      ...emptyInput,
      rows,
      unlinkedRows: new Set([1]),
    });
    // Only 1 effective member → no consolidation
    expect(result.has('SL66')).toBe(false);
  });

  it('ignores permit rows when counting group members', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', consolidacion: true, permisos: true }),
      row({ slCode: 'SL66', consolidacion: true }),
    ];
    const result = computeAutoConsolidationKeys({ ...emptyInput, rows });
    // Only 1 non-permit member → no consolidation
    expect(result.has('SL66')).toBe(false);
  });

  it('slCodeOverrides takes priority over matchOverrides for effective slCode', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL66', consolidacion: true }),
      row({ slCode: null,   consolidacion: true }),
    ];
    const result = computeAutoConsolidationKeys({
      ...emptyInput,
      rows,
      slCodeOverrides: { 1: { slCode: 'SL66' } },
      matchOverrides:  { 1: { slCode: 'SL99' } },
    });
    expect(result.has('SL66')).toBe(true);
    expect(result.has('SL99')).toBe(false);
  });

  it('returns empty set for empty rows', () => {
    expect(computeAutoConsolidationKeys({ ...emptyInput, rows: [] }).size).toBe(0);
  });
});

// ── computeAutoFacturaUnicaKeys ──────────────────────────────────────────────
//
// Heuristic: temp customers (slCode prefix `SL-NAN-`) with 2+ rows should
// auto-default to Factura única. This prevents the operator-trap where
// linking 2 packages to a freshly-created temp customer silently produced
// 2 separate invoices with colliding invoiceNumbers (BUG-INV-COLLISION
// 2026-04-28). Real customers retain the manual opt-in toggle.

describe('computeAutoFacturaUnicaKeys', () => {
  const emptyInput = {
    slCodeOverrides: {} as Record<number, { slCode: string }>,
    matchOverrides:  {} as Record<number, { slCode: string }>,
    unlinkedRows: new Set<number>(),
    operatorOverrideKeys: new Set<string>(),
  };

  it('AFU-01: 2+ rows with same SL-NAN-* code → key returned', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL-NAN-00008' }),
      row({ slCode: 'SL-NAN-00008' }),
    ];
    const result = computeAutoFacturaUnicaKeys({ ...emptyInput, rows });
    expect(result.has('SL-NAN-00008')).toBe(true);
  });

  it('AFU-02: single SL-NAN-* row → NOT a key (avoids no-op merges)', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL-NAN-00009' }),
    ];
    const result = computeAutoFacturaUnicaKeys({ ...emptyInput, rows });
    expect(result.has('SL-NAN-00009')).toBe(false);
  });

  it('AFU-03: real customer (no SL-NAN- prefix) → NEVER auto-merged', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL3521' }),
      row({ slCode: 'SL3521' }),
    ];
    const result = computeAutoFacturaUnicaKeys({ ...emptyInput, rows });
    expect(result.has('SL3521')).toBe(false);
  });

  it('AFU-04: operator-toggled keys are never auto-flipped', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL-NAN-00008' }),
      row({ slCode: 'SL-NAN-00008' }),
    ];
    const result = computeAutoFacturaUnicaKeys({
      ...emptyInput,
      rows,
      operatorOverrideKeys: new Set(['SL-NAN-00008']),
    });
    expect(result.has('SL-NAN-00008')).toBe(false);
  });

  it('AFU-05: unlinked rows do not count toward the 2+ threshold', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL-NAN-00008' }),
      row({ slCode: 'SL-NAN-00008' }),
    ];
    const result = computeAutoFacturaUnicaKeys({
      ...emptyInput,
      rows,
      unlinkedRows: new Set([1]),
    });
    expect(result.has('SL-NAN-00008')).toBe(false);
  });

  it('AFU-06: permit rows are excluded from the count', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL-NAN-00008', permisos: true }),
      row({ slCode: 'SL-NAN-00008' }),
    ];
    const result = computeAutoFacturaUnicaKeys({ ...emptyInput, rows });
    // Only 1 non-permit row → does not qualify
    expect(result.has('SL-NAN-00008')).toBe(false);
  });

  it('AFU-07: matchOverrides reroute rows into a NAN group → key emitted', () => {
    // Operator linked unmatched rows to a temp customer via the dialog.
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: null, nombre: 'KAREN SUGEY' }),
      row({ slCode: null, nombre: 'KAREN SUGEY' }),
    ];
    const result = computeAutoFacturaUnicaKeys({
      ...emptyInput,
      rows,
      matchOverrides: {
        0: { slCode: 'SL-NAN-00020' },
        1: { slCode: 'SL-NAN-00020' },
      },
    });
    expect(result.has('SL-NAN-00020')).toBe(true);
  });

  it('AFU-08: slCodeOverrides take priority over matchOverrides for the effective slCode', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: null, nombre: 'X' }),
      row({ slCode: null, nombre: 'X' }),
    ];
    const result = computeAutoFacturaUnicaKeys({
      ...emptyInput,
      rows,
      slCodeOverrides: { 0: { slCode: 'SL-NAN-00010' }, 1: { slCode: 'SL-NAN-00010' } },
      matchOverrides:  { 0: { slCode: 'SL-NAN-99999' }, 1: { slCode: 'SL-NAN-99999' } },
    });
    expect(result.has('SL-NAN-00010')).toBe(true);
    expect(result.has('SL-NAN-99999')).toBe(false);
  });

  it('AFU-09: empty rows → empty set', () => {
    expect(computeAutoFacturaUnicaKeys({ ...emptyInput, rows: [] }).size).toBe(0);
  });

  it('AFU-10: mixed temp + real customers → only NAN groups returned', () => {
    const rows: InvoiceGroupingRow[] = [
      row({ slCode: 'SL3521' }),
      row({ slCode: 'SL3521' }),
      row({ slCode: 'SL-NAN-00008' }),
      row({ slCode: 'SL-NAN-00008' }),
    ];
    const result = computeAutoFacturaUnicaKeys({ ...emptyInput, rows });
    expect(result.has('SL3521')).toBe(false);
    expect(result.has('SL-NAN-00008')).toBe(true);
    expect(result.size).toBe(1);
  });
});

// ── computeProtectedGroupKeys ─────────────────────────────────────────────────
//
// BUG-PARTIAL-SELECTION 2026-04-28:
// When the operator saves a subset of rows (selection mode), any existing
// invoice whose tracking set extends BEYOND that subset must NOT be deleted
// — the unselected trackings represent rows the operator never intended to
// touch. This helper identifies those groups so the diff loop in
// handleIngestAndInvoice can skip them.

describe('computeProtectedGroupKeys', () => {
  function fp(trackings: string[]): { trackings: Set<string> } {
    return { trackings: new Set(trackings.map(t => t.toUpperCase())) };
  }

  it('PGK-01: selectedTrackings=null → no protection (whole-manifest save)', () => {
    const existing = new Map([['SL001', fp(['T1', 'T2', 'T3'])]]);
    const r = computeProtectedGroupKeys(existing, null);
    expect(r.protectedKeys.size).toBe(0);
    expect(r.preservedTrackings).toBe(0);
  });

  it('PGK-02: empty existing fingerprint → no protection', () => {
    const r = computeProtectedGroupKeys(new Map(), new Set(['T1']));
    expect(r.protectedKeys.size).toBe(0);
    expect(r.preservedTrackings).toBe(0);
  });

  it('PGK-03: selection covers all existing trackings of a group → NOT protected', () => {
    // Group fully selected — diff loop may legitimately recreate the invoice.
    const existing = new Map([['SL001', fp(['T1', 'T2', 'T3'])]]);
    const r = computeProtectedGroupKeys(existing, new Set(['T1', 'T2', 'T3']));
    expect(r.protectedKeys.has('SL001')).toBe(false);
    expect(r.preservedTrackings).toBe(0);
  });

  it('PGK-04: existing has extra trackings not in selection → group protected', () => {
    // Operator selected T1+T2 but the existing invoice has T1+T2+T3+T4+T5.
    // T3, T4, T5 represent rows the operator never touched; protect group.
    const existing = new Map([['SL001', fp(['T1', 'T2', 'T3', 'T4', 'T5'])]]);
    const r = computeProtectedGroupKeys(existing, new Set(['T1', 'T2']));
    expect(r.protectedKeys.has('SL001')).toBe(true);
    expect(r.preservedTrackings).toBe(3);
  });

  it('PGK-05: __unmatched__ keys are NEVER protected (no stable slCode)', () => {
    const existing = new Map([['__unmatched__JUAN', fp(['T1', 'T2'])]]);
    const r = computeProtectedGroupKeys(existing, new Set(['T1']));
    expect(r.protectedKeys.size).toBe(0);
  });

  it('PGK-06: mixed groups — only those with outside trackings are protected', () => {
    const existing = new Map([
      ['SL001', fp(['T1', 'T2', 'T3'])], // 1 outside (T3) → protect
      ['SL002', fp(['T4', 'T5'])],        // both selected → NOT protected
      ['SL003', fp(['T6'])],              // outside → protect (1 tracking)
    ]);
    const selected = new Set(['T1', 'T2', 'T4', 'T5']);
    const r = computeProtectedGroupKeys(existing, selected);
    expect(r.protectedKeys.has('SL001')).toBe(true);
    expect(r.protectedKeys.has('SL002')).toBe(false);
    expect(r.protectedKeys.has('SL003')).toBe(true);
    expect(r.preservedTrackings).toBe(2); // T3 + T6
  });

  it('PGK-07: tracking comparison is case-insensitive via uppercase normalization', () => {
    // existingGroupFP is built upstream via .toUpperCase(); the selection set
    // must mirror that contract. This test guards the convention.
    const existing = new Map([['SL001', fp(['T1', 'T2'])]]); // already uppercase
    // Caller already uppercased the selection; mismatch surfaces here:
    const r = computeProtectedGroupKeys(existing, new Set(['T1', 'T2']));
    expect(r.protectedKeys.size).toBe(0);
  });

  it('PGK-08: empty selection set + non-empty existing → all groups protected', () => {
    // Edge case: caller passes an empty Set (different from null which means
    // "no selection mode"). Every existing tracking is outside, so every
    // non-unmatched group gets protected. Defensive guard against operator
    // selecting then deselecting all rows before clicking save.
    const existing = new Map([
      ['SL001', fp(['T1', 'T2'])],
      ['SL002', fp(['T3'])],
    ]);
    const r = computeProtectedGroupKeys(existing, new Set());
    expect(r.protectedKeys.size).toBe(2);
    expect(r.preservedTrackings).toBe(3);
  });
});
