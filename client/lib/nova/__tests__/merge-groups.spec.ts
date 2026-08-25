/**
 * Tests for `merge-groups` — pure detection logic that decides when to
 * surface a one-click "Fusionar grupos" affordance in the table.
 *
 * The contract this suite freezes:
 *   1. `normalizeNameForMerge` produces stable keys for duplicate detection.
 *   2. `buildGroupFingerprint` honours the same override priority order as
 *      NovaTableModal's render-time math (matchOverrides → slCodeOverrides
 *      → row.slCode → unmatched), with `unlinkedRows` always winning.
 *   3. `findMergeTarget` only suggests a merge when there is EXACTLY ONE
 *      unambiguous matched twin sharing the normalized customer name.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeNameForMerge,
  fuzzyNameSimilarity,
  MERGE_CONFIDENCE_THRESHOLD,
  buildGroupFingerprint,
  findMergeTarget,
  findGroupSiblings,
  type EffectiveGroupFingerprint,
  type MergeGroupEntry,
  type MergeGroupOverrides,
} from '.././merge-groups';

// ── Helpers ───────────────────────────────────────────────────────────────

function entry(
  originalIdx: number,
  nombre: string,
  slCode = '',
  nombreCliente = '',
): MergeGroupEntry {
  return { originalIdx, row: { nombre, slCode, nombreCliente } };
}

function fp(partial: Partial<EffectiveGroupFingerprint> & { groupKey: string }): EffectiveGroupFingerprint {
  return {
    anchorIdx: 0,
    effectiveSlCode: '',
    effectiveCustomerName: '',
    effectiveRuta: '',
    normalizedName: '',
    rowIndices: [0],
    rowCount: 1,
    ...partial,
  };
}

// ── normalizeNameForMerge ─────────────────────────────────────────────────

describe('normalizeNameForMerge', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeNameForMerge('')).toBe('');
    // Exercising defensive branch — runtime callers may pass null when a
    // row has no parsed customer name.
    expect(normalizeNameForMerge(null as unknown as string)).toBe('');
  });

  it('uppercases and trims', () => {
    expect(normalizeNameForMerge('  Indira Lizeth  ')).toBe('INDIRA LIZETH');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeNameForMerge('Indira    Lizeth\tTenorio')).toBe('INDIRA LIZETH TENORIO');
  });

  it('strips diacritics so accented variants compare equal', () => {
    expect(normalizeNameForMerge('María José'))
      .toBe(normalizeNameForMerge('MARIA JOSE'));
    expect(normalizeNameForMerge('Núñez Peña'))
      .toBe(normalizeNameForMerge('Nunez Pena'));
  });

  it('produces equal keys for two operator-typed variants of the same name', () => {
    const a = normalizeNameForMerge('  INDIRA LIZETH TENORIO QUESADA');
    const b = normalizeNameForMerge('Indira Lizeth Tenorio Quesada');
    expect(a).toBe(b);
  });
});

// ── buildGroupFingerprint ─────────────────────────────────────────────────

describe('buildGroupFingerprint', () => {
  it('uses the row.slCode when no overrides are present', () => {
    const result = buildGroupFingerprint('SL13897', [
      entry(7, 'INDIRA LIZETH TENORIO QUESADA', 'SL13897', 'INDIRA LIZETH TENORIO QUESADA'),
    ]);
    expect(result.effectiveSlCode).toBe('SL13897');
    expect(result.effectiveCustomerName).toBe('INDIRA LIZETH TENORIO QUESADA');
    expect(result.normalizedName).toBe('INDIRA LIZETH TENORIO QUESADA');
    expect(result.rowIndices).toEqual([7]);
    expect(result.rowCount).toBe(1);
  });

  it('prefers matchOverrides over row.slCode', () => {
    const overrides: MergeGroupOverrides = {
      matchOverrides: { 7: { slCode: 'SL99999', fullName: 'NEW NAME', ruta: 'METROPOLITANA' } },
    };
    const result = buildGroupFingerprint('__ignored__', [
      entry(7, 'OLD NOMBRE', 'SL13897', 'OLD CLIENT'),
    ], overrides);
    expect(result.effectiveSlCode).toBe('SL99999');
    expect(result.effectiveCustomerName).toBe('NEW NAME');
    expect(result.effectiveRuta).toBe('METROPOLITANA');
  });

  it('honours slCodeOverrides when matchOverrides is absent', () => {
    const overrides: MergeGroupOverrides = {
      slCodeOverrides: { 7: { slCode: 'SL55555', ruta: 'HEREDIA' } },
    };
    const result = buildGroupFingerprint('SL13897', [
      entry(7, 'INDIRA LIZETH', 'SL13897', 'INDIRA LIZETH'),
    ], overrides);
    expect(result.effectiveSlCode).toBe('SL55555');
    expect(result.effectiveRuta).toBe('HEREDIA');
  });

  it('treats `unlinkedRows` membership as winning — drops the slCode', () => {
    const overrides: MergeGroupOverrides = {
      unlinkedRows: new Set([7]),
      matchOverrides: { 7: { slCode: 'SL99999', fullName: 'WHATEVER' } },
    };
    const result = buildGroupFingerprint('__unmatched__OLD NOMBRE', [
      entry(7, 'OLD NOMBRE', 'SL13897', 'OLD NOMBRE'),
    ], overrides);
    expect(result.effectiveSlCode).toBe('');
  });

  it('falls back to nombre when nombreCliente is missing', () => {
    const result = buildGroupFingerprint('__unmatched__INDIRA', [
      entry(3, 'INDIRA', '', ''),
    ]);
    expect(result.effectiveCustomerName).toBe('INDIRA');
    expect(result.normalizedName).toBe('INDIRA');
  });

  it('aggregates rowIndices across all entries', () => {
    const result = buildGroupFingerprint('SL13897', [
      entry(2, 'X', 'SL13897'),
      entry(5, 'X', 'SL13897'),
      entry(9, 'X', 'SL13897'),
    ]);
    expect(result.rowIndices).toEqual([2, 5, 9]);
    expect(result.rowCount).toBe(3);
    expect(result.anchorIdx).toBe(2);
  });
});

// ── findMergeTarget ───────────────────────────────────────────────────────

describe('findMergeTarget', () => {
  it('returns null when the source already has an effective slCode', () => {
    const source = fp({
      groupKey: 'SL13897',
      effectiveSlCode: 'SL13897',
      effectiveCustomerName: 'INDIRA LIZETH TENORIO QUESADA',
      normalizedName: 'INDIRA LIZETH TENORIO QUESADA',
    });
    expect(findMergeTarget(source, [source])).toBeNull();
  });

  it('returns null when no matched twin shares the normalized name', () => {
    const source = fp({
      groupKey: '__unmatched__JUAN',
      effectiveSlCode: '',
      effectiveCustomerName: 'JUAN',
      normalizedName: 'JUAN',
    });
    const other = fp({
      groupKey: 'SL01',
      effectiveSlCode: 'SL01',
      effectiveCustomerName: 'PEDRO',
      normalizedName: 'PEDRO',
    });
    expect(findMergeTarget(source, [source, other])).toBeNull();
  });

  it('returns the matched twin when EXACTLY ONE candidate exists (the exact-match happy path)', () => {
    const source = fp({
      groupKey: '__unmatched__INDIRA LIZETH TENORIO QUESADA',
      effectiveSlCode: '',
      effectiveCustomerName: 'INDIRA LIZETH TENORIO QUESADA',
      normalizedName: 'INDIRA LIZETH TENORIO QUESADA',
    });
    const matched = fp({
      groupKey: 'SL13897',
      effectiveSlCode: 'SL13897',
      effectiveCustomerName: 'INDIRA LIZETH TENORIO QUESADA',
      effectiveRuta: 'METROPOLITANA',
      normalizedName: 'INDIRA LIZETH TENORIO QUESADA',
      rowCount: 1,
    });
    const target = findMergeTarget(source, [source, matched]);
    expect(target).toEqual({
      slCode: 'SL13897',
      customerName: 'INDIRA LIZETH TENORIO QUESADA',
      ruta: 'METROPOLITANA',
      rowCount: 1,
      groupKey: 'SL13897',
      confidence: 1.0,
    });
  });

  it('returns null when two matched twins TIE at the same confidence (ambiguous)', () => {
    const source = fp({
      groupKey: '__unmatched__INDIRA TENORIO QUESADA',
      effectiveSlCode: '',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    // Two matched groups with IDENTICAL names — operator must disambiguate.
    const m1 = fp({
      groupKey: 'SL01',
      effectiveSlCode: 'SL01',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    const m2 = fp({
      groupKey: 'SL02',
      effectiveSlCode: 'SL02',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    expect(findMergeTarget(source, [source, m1, m2])).toBeNull();
  });

  it('still returns the higher-scoring twin when scores DIFFER', () => {
    const source = fp({
      groupKey: '__unmatched__INDIRA TENORIO QUESADA',
      effectiveSlCode: '',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
    });
    const exact = fp({
      groupKey: 'SL13897',
      effectiveSlCode: 'SL13897',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA', // 1.0 confidence
    });
    const fuzzy = fp({
      groupKey: 'SL99999',
      effectiveSlCode: 'SL99999',
      effectiveCustomerName: 'INDIRA LIZETH TENORIO QUESADA', // 1.0 too
    });
    // Both score 1.0 → tie → null
    expect(findMergeTarget(source, [source, exact, fuzzy])).toBeNull();
  });

  it('ignores other unmatched groups when looking for a target', () => {
    // Two unmatched groups with the same name → still no merge target. We
    // never propose merging two unmatched groups; that requires the
    // operator's intent.
    const source = fp({
      groupKey: '__unmatched__INDIRA TENORIO QUESADA-A',
      effectiveSlCode: '',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    const otherUnmatched = fp({
      groupKey: '__unmatched__INDIRA TENORIO QUESADA-B',
      effectiveSlCode: '',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    expect(findMergeTarget(source, [source, otherUnmatched])).toBeNull();
  });

  it('returns null when the source has an empty normalizedName (defensive)', () => {
    const source = fp({
      groupKey: '__unmatched__',
      effectiveSlCode: '',
      effectiveCustomerName: '',
      normalizedName: '',
    });
    const matched = fp({
      groupKey: 'SL01',
      effectiveSlCode: 'SL01',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    expect(findMergeTarget(source, [source, matched])).toBeNull();
  });

  // ── Fuzzy-match scenarios — the regression the user spotted ────────────

  it('finds the matched twin when manifest abbreviates a middle name (INDIRA case)', () => {
    // Reproducer for the screenshot:
    //   sin slCode → "INDIRA TENORIO QUESADA"
    //   SL13897    → "INDIRA LIZETH TENORIO QUESADA"
    // Surnames identical, manifest dropped the middle name. The exact-
    // match detector silently skipped this; the fuzzy detector catches it
    // at confidence 1.0 because the first-name token "INDIRA" overlaps.
    const source = fp({
      groupKey: '__unmatched__INDIRA TENORIO QUESADA',
      effectiveSlCode: '',
      effectiveCustomerName: 'INDIRA TENORIO QUESADA',
      normalizedName: 'INDIRA TENORIO QUESADA',
    });
    const matched = fp({
      groupKey: 'SL13897',
      effectiveSlCode: 'SL13897',
      effectiveCustomerName: 'INDIRA LIZETH TENORIO QUESADA',
      effectiveRuta: 'METROPOLITANA',
      normalizedName: 'INDIRA LIZETH TENORIO QUESADA',
      rowCount: 1,
    });
    const target = findMergeTarget(source, [source, matched]);
    expect(target?.slCode).toBe('SL13897');
    expect(target?.confidence).toBe(1.0);
  });

  it('finds the matched twin when both share surnames but no first-name (ALL of shorter in longer)', () => {
    // "ANA LOPEZ" (2 tokens) vs "ANA MARIA LOPEZ" (3 tokens) → confidence 0.85
    const source = fp({
      groupKey: '__unmatched__ANA LOPEZ',
      effectiveSlCode: '',
      effectiveCustomerName: 'ANA LOPEZ',
    });
    const matched = fp({
      groupKey: 'SL_AL',
      effectiveSlCode: 'SL_AL',
      effectiveCustomerName: 'ANA MARIA LOPEZ',
    });
    const target = findMergeTarget(source, [source, matched]);
    expect(target?.slCode).toBe('SL_AL');
    expect(target?.confidence).toBeCloseTo(0.85);
  });

  it('does NOT propose merge when last names DIFFER (different surnames)', () => {
    const source = fp({
      groupKey: '__unmatched__JUAN PEREZ',
      effectiveSlCode: '',
      effectiveCustomerName: 'JUAN PEREZ',
    });
    const matched = fp({
      groupKey: 'SL_JG',
      effectiveSlCode: 'SL_JG',
      effectiveCustomerName: 'JUAN GARCIA', // same first name only
    });
    expect(findMergeTarget(source, [source, matched])).toBeNull();
  });

  it('does NOT propose merge when only first names overlap and surnames differ', () => {
    const source = fp({
      groupKey: '__unmatched__MARIA CAMILA',
      effectiveSlCode: '',
      effectiveCustomerName: 'MARIA CAMILA',
    });
    const matched = fp({
      groupKey: 'SL_CM',
      effectiveSlCode: 'SL_CM',
      effectiveCustomerName: 'CAMILA MARTINEZ',
    });
    expect(findMergeTarget(source, [source, matched])).toBeNull();
  });
});

// ── fuzzyNameSimilarity ───────────────────────────────────────────────────

describe('fuzzyNameSimilarity', () => {
  it('returns 1.0 for identical normalized names', () => {
    expect(fuzzyNameSimilarity('INDIRA TENORIO', 'indira tenorio')).toBe(1);
  });

  it('returns 1.0 for the INDIRA case (overlapping first name + identical surnames)', () => {
    expect(
      fuzzyNameSimilarity('INDIRA TENORIO QUESADA', 'INDIRA LIZETH TENORIO QUESADA'),
    ).toBe(1);
  });

  it('returns 0.85 when one side has no first name (ANA LOPEZ vs ANA MARIA LOPEZ)', () => {
    expect(fuzzyNameSimilarity('ANA LOPEZ', 'ANA MARIA LOPEZ')).toBeCloseTo(0.85);
  });

  it('returns 0.85 when last2 surnames identical but only one side has a first name (GUZMAN FLORES case)', () => {
    expect(
      fuzzyNameSimilarity('GUZMAN FLORES', 'JOSE GUZMAN FLORES'),
    ).toBeCloseTo(0.85);
  });

  it('returns 0.6 when surnames identical but first names DO NOT overlap', () => {
    expect(
      fuzzyNameSimilarity('JUAN GARCIA LOPEZ', 'PEDRO GARCIA LOPEZ'),
    ).toBeCloseTo(0.6);
  });

  it('returns 0 when surnames differ entirely', () => {
    expect(fuzzyNameSimilarity('JUAN PEREZ', 'JUAN GARCIA')).toBe(0);
  });

  it('returns 0 for empty / whitespace input', () => {
    expect(fuzzyNameSimilarity('', 'INDIRA TENORIO')).toBe(0);
    expect(fuzzyNameSimilarity('   ', 'INDIRA TENORIO')).toBe(0);
  });

  it('honours the merge threshold for the documented INDIRA case', () => {
    expect(
      fuzzyNameSimilarity('INDIRA TENORIO QUESADA', 'INDIRA LIZETH TENORIO QUESADA'),
    ).toBeGreaterThanOrEqual(MERGE_CONFIDENCE_THRESHOLD);
  });

  it('treats diacritics + casing as equivalent', () => {
    expect(
      fuzzyNameSimilarity('María José Núñez Peña', 'MARIA JOSE NUNEZ PENA'),
    ).toBe(1);
  });
});

// ── findGroupSiblings — match-status-agnostic sibling discovery ─────────────
//
// The "Revalidar grupo" UI affordance uses this to surface ALL groups that
// look like the same customer as the source — including matched-vs-matched
// duplicates that `findMergeTarget` deliberately ignores. Tests freeze:
//
//   1. Empty source name → empty result.
//   2. Self-reference is excluded.
//   3. Below-threshold similarity is excluded.
//   4. Multiple siblings → sorted by confidence DESC, then rowCount DESC.
//   5. Both matched + unmatched siblings are returned (status-agnostic).

describe('findGroupSiblings', () => {
  function fp(
    groupKey: string,
    name: string,
    slCode: string,
    rowCount = 1,
  ): EffectiveGroupFingerprint {
    return {
      groupKey,
      anchorIdx: parseInt(groupKey, 10) || 0,
      effectiveSlCode: slCode,
      effectiveCustomerName: name,
      effectiveRuta: '',
      normalizedName: normalizeNameForMerge(name),
      rowIndices: Array.from({ length: rowCount }, (_, i) => i),
      rowCount,
    };
  }

  it('returns empty when source has no name', () => {
    const source = fp('1', '', '');
    expect(findGroupSiblings(source, [source, fp('2', 'JOHN DOE', 'SL1')])).toEqual([]);
  });

  it('excludes the source itself from siblings', () => {
    const source = fp('1', 'YORLENI MAIRENA GUTIERREZ', 'SL1');
    const all = [source, fp('2', 'YORLENI MAIRENA GUTIERREZ', 'SL2'), fp('3', 'OTRO CLIENTE', 'SL3')];
    const siblings = findGroupSiblings(source, all);
    expect(siblings).toHaveLength(1);
    expect(siblings[0].fingerprint.groupKey).toBe('2');
  });

  it('drops siblings below the merge threshold', () => {
    const source = fp('1', 'JUAN PEREZ', 'SL1');
    const siblings = findGroupSiblings(source, [
      source,
      fp('2', 'PEDRO RAMIREZ', 'SL2'), // unrelated
    ]);
    expect(siblings).toEqual([]);
  });

  it('returns multiple matched siblings — the BUG-REVALIDAR-GRUPO case', () => {
    const source = fp('1', 'YORLENI MAIRENA GUTIERREZ', 'SL1');
    const all = [
      source,
      fp('2', 'YORLENI MAIRENA GUTIERREZ', 'SL2'),
      fp('3', 'YORLENI MAIRENA GUTIERREZ', 'SL3'),
    ];
    const siblings = findGroupSiblings(source, all);
    expect(siblings).toHaveLength(2);
    expect(siblings.map(s => s.fingerprint.groupKey).sort()).toEqual(['2', '3']);
    expect(siblings.every(s => s.confidence === 1)).toBe(true);
  });

  it('returns unmatched siblings as well — status-agnostic', () => {
    const source = fp('1', 'INDIRA TENORIO QUESADA', 'SL1');
    const all = [
      source,
      // unmatched sibling — different fuzzy name, same person
      fp('2', 'INDIRA LIZETH TENORIO QUESADA', ''),
    ];
    const siblings = findGroupSiblings(source, all);
    expect(siblings).toHaveLength(1);
    expect(siblings[0].fingerprint.effectiveSlCode).toBe('');
    expect(siblings[0].confidence).toBeGreaterThanOrEqual(MERGE_CONFIDENCE_THRESHOLD);
  });

  it('sorts by confidence DESC then rowCount DESC', () => {
    const source = fp('1', 'JOSE PEREZ', 'SL1');
    const all = [
      source,
      // exact match (1.0), 1 row
      fp('exact', 'JOSE PEREZ', 'SL2', 1),
      // exact match (1.0), 5 rows  → should sort first among the two 1.0s
      fp('exactBig', 'JOSE PEREZ', 'SL3', 5),
      // fuzzy match (0.85), 10 rows → still sorts after the 1.0 group
      fp('fuzzy', 'JOSE LUIS PEREZ', 'SL4', 10),
    ];
    const siblings = findGroupSiblings(source, all);
    expect(siblings.map(s => s.fingerprint.groupKey)).toEqual(['exactBig', 'exact', 'fuzzy']);
  });
});
