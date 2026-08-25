/**
 * Unit tests for Damerau-Levenshtein distance algorithm.
 *
 * Validates transposition detection — the key advantage over standard Levenshtein.
 */
import { describe, it, expect } from 'vitest';
import { damerauLevenshteinDistance, damerauLevenshteinSimilarity } from '../damerau-levenshtein';

describe('damerauLevenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(damerauLevenshteinDistance('JOHN', 'JOHN')).toBe(0);
  });

  it('returns string length for empty vs non-empty', () => {
    expect(damerauLevenshteinDistance('', 'ABC')).toBe(3);
    expect(damerauLevenshteinDistance('ABC', '')).toBe(3);
  });

  it('returns 0 for two empty strings', () => {
    expect(damerauLevenshteinDistance('', '')).toBe(0);
  });

  // THE KEY TEST: transpositions should cost 1, not 2
  it('counts adjacent transposition as 1 edit (JHON → JOHN)', () => {
    expect(damerauLevenshteinDistance('JHON', 'JOHN')).toBe(1);
  });

  it('counts adjacent transposition as 1 edit (AB → BA)', () => {
    expect(damerauLevenshteinDistance('AB', 'BA')).toBe(1);
  });

  it('counts single substitution as 1 edit', () => {
    expect(damerauLevenshteinDistance('GARCIA', 'GARZIA')).toBe(1);
  });

  it('counts single insertion as 1 edit', () => {
    expect(damerauLevenshteinDistance('LOPEZ', 'LOPES')).toBe(1);
  });

  it('handles multiple edits correctly', () => {
    expect(damerauLevenshteinDistance('KITTEN', 'SITTING')).toBe(3);
  });

  it('respects maxEdits early-exit', () => {
    const result = damerauLevenshteinDistance('ABC', 'XYZ', 1);
    expect(result).toBeGreaterThan(1);
  });

  it('handles length-difference guard with maxEdits', () => {
    expect(damerauLevenshteinDistance('A', 'ABCDE', 2)).toBe(3); // exceeds maxEdits
  });

  // Real-world Costa Rican name typos
  it('handles PEDRRO → PEDRO (double letter)', () => {
    expect(damerauLevenshteinDistance('PEDRRO', 'PEDRO')).toBe(1);
  });

  it('handles MAIRTA → MARTA (single deletion of I)', () => {
    // MAIRTA → MARTA = delete 'I' = 1 edit
    expect(damerauLevenshteinDistance('MAIRTA', 'MARTA')).toBe(1);
  });
});

describe('damerauLevenshteinSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(damerauLevenshteinSimilarity('GARCIA', 'GARCIA')).toBe(1);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(damerauLevenshteinSimilarity('', '')).toBe(1);
  });

  it('returns high similarity for transposed adjacent chars', () => {
    const sim = damerauLevenshteinSimilarity('JHON', 'JOHN');
    expect(sim).toBe(0.75); // 1 - (1/4)
  });

  it('returns 0 for completely different strings of same length', () => {
    const sim = damerauLevenshteinSimilarity('ABCD', 'WXYZ');
    expect(sim).toBe(0); // 1 - (4/4) = 0
  });

  it('returns reasonable similarity for real names', () => {
    const sim = damerauLevenshteinSimilarity('RODRIGUEZ', 'RODRIGUES');
    expect(sim).toBeGreaterThan(0.8);
  });
});
