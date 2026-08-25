/**
 * Unit tests for Double Metaphone phonetic algorithm.
 *
 * Validates Spanish-specific rules: silent H, V=B, Z=S, GE/GI→J, Ñ→N.
 */
import { describe, it, expect } from 'vitest';
import { doubleMetaphone, doubleMetaphoneMatch, doubleMetaphoneScore } from '../double-metaphone';

describe('doubleMetaphone', () => {
  it('returns empty codes for empty string', () => {
    expect(doubleMetaphone('')).toEqual(['', '']);
  });

  it('generates codes for simple names', () => {
    const [primary] = doubleMetaphone('PEDRO');
    expect(primary.length).toBeGreaterThan(0);
  });

  // Spanish silent H
  it('handles silent H (HUERTAS vs UERTAS)', () => {
    const [p1] = doubleMetaphone('HUERTAS');
    const [p2] = doubleMetaphone('UERTAS');
    // Both should start with A (vowel)
    expect(p1[0]).toBe('A');
    expect(p2[0]).toBe('A');
  });

  // Spanish Ñ → N
  it('maps Ñ to N', () => {
    const [p1] = doubleMetaphone('NUNEZ');
    const [p2] = doubleMetaphone('NUÑEZ');
    expect(p1).toBe(p2);
  });

  // Spanish Z = S
  it('maps Z to S (zapato sound)', () => {
    const [p1] = doubleMetaphone('GARZA');
    const [p2] = doubleMetaphone('GARSA');
    expect(p1).toBe(p2);
  });

  // Spanish V = B in alternate code
  it('handles V/B equivalence', () => {
    const [, a1] = doubleMetaphone('VEGA');
    const [, a2] = doubleMetaphone('BEGA');
    // Alternate codes should match (V→P and B→P)
    expect(a1).toBe(a2);
  });

  // CH → X
  it('handles CH digraph', () => {
    const [p] = doubleMetaphone('CHAVES');
    expect(p.startsWith('X')).toBe(true);
  });

  // GE/GI → J (primary) or K (alternate)
  it('handles soft G before E/I', () => {
    const [primary, alternate] = doubleMetaphone('GIMENEZ');
    // Primary: J sound, Alternate: K sound
    expect(primary[0]).not.toBe(alternate[0]);
  });
});

describe('doubleMetaphoneMatch', () => {
  it('returns true for identical strings', () => {
    expect(doubleMetaphoneMatch('GARCIA', 'GARCIA')).toBe(true);
  });

  it('matches GARCIA and GARSIA (C→S before I)', () => {
    expect(doubleMetaphoneMatch('GARCIA', 'GARSIA')).toBe(true);
  });

  it('matches GARCIA and GARZIA (C→S, Z→S)', () => {
    expect(doubleMetaphoneMatch('GARCIA', 'GARZIA')).toBe(true);
  });

  it('matches JIMENEZ and GIMENEZ (J/G equivalence)', () => {
    expect(doubleMetaphoneMatch('JIMENEZ', 'GIMENEZ')).toBe(true);
  });

  it('does NOT match completely different names', () => {
    expect(doubleMetaphoneMatch('GARCIA', 'LOPEZ')).toBe(false);
  });

  it('matches RODRIGUEZ and RODRIGUES', () => {
    expect(doubleMetaphoneMatch('RODRIGUEZ', 'RODRIGUES')).toBe(true);
  });
});

describe('doubleMetaphoneScore', () => {
  it('returns 1.0 for identical strings', () => {
    expect(doubleMetaphoneScore('GARCIA', 'GARCIA')).toBe(1);
  });

  it('returns 1.0 for phonetically identical strings', () => {
    expect(doubleMetaphoneScore('GARCIA', 'GARSIA')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(doubleMetaphoneScore('GARCIA', 'LOPEZ')).toBe(0);
  });

  it('returns partial or zero score for phonetically different strings', () => {
    const score = doubleMetaphoneScore('PEDRO', 'PABLO');
    expect(score).toBeLessThan(1);
  });
});
