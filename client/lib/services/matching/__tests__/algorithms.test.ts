/**
 * Functional Integration Tests — Core Algorithms
 *
 * Tests damerauLevenshtein, jaroWinkler, tokensMatch, and tokenNameScore
 * with realistic Costa Rican customer name scenarios.
 *
 * @module matching/__tests__/algorithms.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  jaroSimilarity,
  jaroWinklerSimilarity,
  tokensMatch,
  tokenNameScore,
} from '../algorithms';
import {
  damerauLevenshteinDistance,
  damerauLevenshteinSimilarity,
} from '../damerau-levenshtein';

// ─── Damerau-Levenshtein ────────────────────────────────────────────────────────

describe('damerauLevenshteinDistance', () => {
  it('handles identical strings', () => {
    expect(damerauLevenshteinDistance('GARCIA', 'GARCIA')).toBe(0);
  });

  it('handles single typos (real manifest errors)', () => {
    expect(damerauLevenshteinDistance('GONZALES', 'GONZALEZ')).toBe(1); // S/Z swap
    expect(damerauLevenshteinDistance('RODRIGEZ', 'RODRIGUEZ')).toBe(1); // missing U
    expect(damerauLevenshteinDistance('HERNANDES', 'HERNANDEZ')).toBe(1); // S/Z swap
    expect(damerauLevenshteinDistance('VASQUES', 'VASQUEZ')).toBe(1); // S/Z
  });

  it('handles transpositions (common handwriting errors)', () => {
    expect(damerauLevenshteinDistance('JHON', 'JOHN')).toBe(1); // transposition in Damerau-Levenshtein is 1
    expect(damerauLevenshteinDistance('PEDRRO', 'PEDRO')).toBe(1); // double R
  });

  it('respects maxEdits early-exit', () => {
    const dist = damerauLevenshteinDistance('TOTALLY', 'DIFFERENT', 3);
    expect(dist).toBeGreaterThan(3);
  });

  it('handles empty strings', () => {
    expect(damerauLevenshteinDistance('', 'ABC')).toBe(3);
    expect(damerauLevenshteinDistance('ABC', '')).toBe(3);
    expect(damerauLevenshteinDistance('', '')).toBe(0);
  });
});

describe('damerauLevenshteinSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(damerauLevenshteinSimilarity('GARCIA', 'GARCIA')).toBe(1);
  });

  it('returns high similarity for 1-edit distance', () => {
    const sim = damerauLevenshteinSimilarity('GONZALES', 'GONZALEZ');
    expect(sim).toBeGreaterThanOrEqual(0.85);
  });

  it('returns 0 similarity for completely different strings', () => {
    const sim = damerauLevenshteinSimilarity('AAAA', 'ZZZZ');
    expect(sim).toBe(0);
  });
});

// ─── Jaro / Jaro-Winkler ────────────────────────────────────────────────────

describe('jaroWinklerSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroWinklerSimilarity('JUAN PEREZ', 'JUAN PEREZ')).toBe(1);
  });

  it('gives high scores for similar names with shared prefix', () => {
    const sim = jaroWinklerSimilarity('RODRIGUEZA', 'RODRIGUEZ');
    expect(sim).toBeGreaterThan(0.90);
  });

  it('handles completely different names', () => {
    const sim = jaroWinklerSimilarity('AAAAAA', 'ZZZZZZ');
    expect(sim).toBeLessThan(0.3);
  });

  it('handles real CR manifest typos', () => {
    // GONZALES vs GONZALEZ
    expect(jaroWinklerSimilarity('GONZALES', 'GONZALEZ')).toBeGreaterThan(0.90);
    // HERNANDES vs HERNANDEZ
    expect(jaroWinklerSimilarity('HERNANDES', 'HERNANDEZ')).toBeGreaterThan(0.90);
  });

  it('handles empty strings', () => {
    expect(jaroSimilarity('', 'ABC')).toBe(0);
    expect(jaroSimilarity('ABC', '')).toBe(0);
    expect(jaroSimilarity('', '')).toBe(1);
  });
});

// ─── tokensMatch ─────────────────────────────────────────────────────────────

describe('tokensMatch (enhanced)', () => {
  it('matches identical tokens', () => {
    expect(tokensMatch('GARCIA', 'GARCIA')).toBe(true);
  });

  it('matches within 1 edit for long tokens', () => {
    expect(tokensMatch('GONZALES', 'GONZALEZ')).toBe(true);
    expect(tokensMatch('RODRIGEZ', 'RODRIGUEZ')).toBe(true);
  });

  it('matches nickname equivalents (PEPE ↔ JOSE)', () => {
    expect(tokensMatch('PEPE', 'JOSE')).toBe(true);
    expect(tokensMatch('PACO', 'FRANCISCO')).toBe(true);
    expect(tokensMatch('MEMO', 'GUILLERMO')).toBe(true);
    expect(tokensMatch('KIKE', 'ENRIQUE')).toBe(true);
    expect(tokensMatch('NACHO', 'IGNACIO')).toBe(true);
    expect(tokensMatch('LALO', 'EDUARDO')).toBe(true);
  });

  it('matches phonetic equivalents via phoneticKey', () => {
    expect(tokensMatch('VASQUEZ', 'BASQUES')).toBe(true);
    expect(tokensMatch('CASTILLO', 'CASTIYO')).toBe(true);
  });

  it('rejects short tokens with length diff > 2', () => {
    expect(tokensMatch('AB', 'ABCDEF')).toBe(false);
    expect(tokensMatch('JU', 'JUAN')).toBe(false);
  });

  it('rejects unrelated tokens', () => {
    expect(tokensMatch('GARCIA', 'PEREZ')).toBe(false);
    expect(tokensMatch('MARIA', 'PEDRO')).toBe(false);
  });
});

// ─── tokenNameScore ──────────────────────────────────────────────────────────

describe('tokenNameScore (weighted)', () => {
  it('gives 100 for identical token lists', () => {
    expect(tokenNameScore(['JUAN', 'GARCIA'], ['JUAN', 'GARCIA'])).toBe(100);
  });

  it('gives high score when first name matches (3x weight)', () => {
    const score = tokenNameScore(['JUAN', 'GARCIA'], ['JUAN', 'GARCIA', 'LOPEZ']);
    expect(score).toBeGreaterThan(80);
  });

  it('gives lower score when first name does not match', () => {
    const firstMissing = tokenNameScore(['CARLOS', 'GARCIA'], ['JUAN', 'GARCIA', 'LOPEZ']);
    const firstPresent = tokenNameScore(['JUAN', 'GARCIA'], ['JUAN', 'GARCIA', 'LOPEZ']);
    expect(firstPresent).toBeGreaterThan(firstMissing);
  });

  it('handles nickname resolution in scoring', () => {
    // PEPE should match JOSE via tokensMatch
    const score = tokenNameScore(['PEPE', 'GARCIA'], ['JOSE', 'GARCIA']);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('handles extra customer tokens with small penalty', () => {
    const full = tokenNameScore(['JUAN', 'GARCIA'], ['JUAN', 'GARCIA']);
    const extra = tokenNameScore(['JUAN', 'GARCIA'], ['JUAN', 'CARLOS', 'GARCIA', 'LOPEZ']);
    expect(full).toBe(100);
    expect(extra).toBeLessThan(full);
    expect(extra).toBeGreaterThan(60); // small penalty, not devastating
  });

  it('returns 0 for completely different names', () => {
    expect(tokenNameScore(['AAA', 'BBB'], ['CCC', 'DDD'])).toBe(0);
  });

  it('handles real scenario: manifest short vs DB full', () => {
    // Manifest has "GARCIA MORA", DB has "JUAN GARCIA MORA"
    const score = tokenNameScore(['GARCIA', 'MORA'], ['JUAN', 'GARCIA', 'MORA']);
    expect(score).toBeGreaterThanOrEqual(90);
  });
});
