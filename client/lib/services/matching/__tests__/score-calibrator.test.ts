/**
 * Unit tests for Score Calibrator.
 *
 * Validates 3-signal linear formula, nickname bonus, and low token penalty.
 */
import { describe, it, expect } from 'vitest';
import { calibratedScore, type AlgorithmScores, type InputProfile } from '../score-calibrator';

const baseScores: AlgorithmScores = {
  levenshtein: 0.80,
  jaroWinkler: 0.85,
  tokenBased: 0.90,
  exact: false,
  normalized: false,
  damerauLevenshtein: 0.80,
  doubleMetaphone: 0.85,
};

const mediumProfile: InputProfile = {
  searchTokenCount: 2,
  customerTokenCount: 3,
  searchLength: 15,
  customerLength: 20,
};

describe('calibratedScore', () => {
  it('returns 1.0 for exact match', () => {
    expect(calibratedScore({ ...baseScores, exact: true }, mediumProfile)).toBe(1.0);
  });

  it('returns 0.98 for normalized match', () => {
    expect(calibratedScore({ ...baseScores, normalized: true }, mediumProfile)).toBe(0.98);
  });

  it('returns a value between 0 and 1 for normal scores based on 3-signal formula', () => {
    // Formula: (tokenBased * 0.55) + (damerauLevenshtein * 0.25) + (doubleMetaphone * 0.20)
    // = (0.90 * 0.55) + (0.80 * 0.25) + (0.85 * 0.20)
    // = 0.495 + 0.20 + 0.17 = 0.865
    // Rounded: 0.87
    const score = calibratedScore(baseScores, mediumProfile);
    expect(score).toBeCloseTo(0.87, 2);
  });

  it('applies nickname bonus (capped at 0.95)', () => {
    const withoutNick = calibratedScore(baseScores, mediumProfile);
    const withNick = calibratedScore({ ...baseScores, nicknameMatch: true }, mediumProfile);
    expect(withNick).toBeGreaterThan(withoutNick);
    // 0.87 + 0.10 = 0.97, capped at 0.95
    expect(withNick).toBe(0.95);
  });

  it('applies low-token penalty when tokenBased < 0.3', () => {
    const lowTokenScores: AlgorithmScores = {
      ...baseScores,
      tokenBased: 0.2,
    };
    // Formula: (0.2 * 0.55) + (0.80 * 0.25) + (0.85 * 0.20) = 0.11 + 0.20 + 0.17 = 0.48
    // Penalty: 0.48 * 0.7 = 0.336 (rounded to 0.34)
    const score = calibratedScore(lowTokenScores, mediumProfile);
    expect(score).toBeCloseTo(0.34, 2);
  });
});
