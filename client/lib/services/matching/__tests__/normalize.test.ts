/**
 * Functional Integration Tests — Normalization & Token Utilities
 *
 * Tests normalize(), phoneticKey(), meaningfulTokens(), getNameParts(),
 * isAbbreviationOf(), and tokenPermutations() with realistic CR name data.
 *
 * @module matching/__tests__/normalize.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  normalize,
  meaningfulTokens,
  phoneticKey,
  getNameParts,
  isAbbreviationOf,
  NAME_STOPWORDS,
  tokenPermutations,
} from '../normalize';

// ─── normalize ────────────────────────────────────────────────────────────────

describe('normalize', () => {
  it('uppercases and strips accents from Spanish names', () => {
    expect(normalize('María García López')).toBe('MARIA GARCIA LOPEZ');
    expect(normalize('josé Pérez Gutiérrez')).toBe('JOSE PEREZ GUTIERREZ');
    expect(normalize('Ángel Ramírez Ñoño')).toBe('ANGEL RAMIREZ NONO');
  });

  it('handles special characters and punctuation', () => {
    expect(normalize("O'Brien McDonald")).toBe('OBRIEN MCDONALD');
    expect(normalize('López-Martínez')).toBe('LOPEZMARTINEZ');
    expect(normalize('Sr. Juan Carlos')).toBe('SR JUAN CARLOS');
  });

  it('collapses multiple whitespace', () => {
    expect(normalize('  JUAN   PEREZ   GARCIA  ')).toBe('JUAN PEREZ GARCIA');
    expect(normalize('MARIA\t\nLOPEZ')).toBe('MARIA LOPEZ');
  });

  it('handles empty/whitespace-only input', () => {
    expect(normalize('')).toBe('');
    expect(normalize('   ')).toBe('');
  });

  it('handles real manifest format quirks', () => {
    expect(normalize('RODRIGUEZ,JUAN')).toBe('RODRIGUEZJUAN');
    expect(normalize('PÉREZ  DE   LA   CRUZ')).toBe('PEREZ DE LA CRUZ');
  });
});

// ─── meaningfulTokens ─────────────────────────────────────────────────────────

describe('meaningfulTokens', () => {
  it('filters stopwords from tokenized names', () => {
    const parts = 'MARIA DE LOS ANGELES PEREZ'.split(' ');
    const meaningful = meaningfulTokens(parts);
    expect(meaningful).toEqual(['MARIA', 'ANGELES', 'PEREZ']);
    expect(meaningful).not.toContain('DE');
    expect(meaningful).not.toContain('LOS');
  });

  it('filters single-character tokens', () => {
    const parts = 'J PEREZ GARCIA'.split(' ');
    const meaningful = meaningfulTokens(parts);
    expect(meaningful).toEqual(['PEREZ', 'GARCIA']);
  });

  it('preserves all meaningful tokens in a long name', () => {
    const parts = 'JUAN CARLOS DE LA VEGA HERNANDEZ'.split(' ');
    expect(meaningfulTokens(parts)).toEqual(['JUAN', 'CARLOS', 'VEGA', 'HERNANDEZ']);
  });

  it('handles names with "DEL" and "EL"', () => {
    const parts = 'MARIO DEL CAMPO EL GRANDE'.split(' ');
    expect(meaningfulTokens(parts)).toEqual(['MARIO', 'CAMPO', 'GRANDE']);
  });
});

// ─── phoneticKey ──────────────────────────────────────────────────────────────

describe('phoneticKey', () => {
  it('maps QU → C', () => {
    expect(phoneticKey('QUIJADA')).toBe(phoneticKey('CIJADA'));
  });

  it('maps V → B', () => {
    expect(phoneticKey('VEGA')).toBe(phoneticKey('BEGA'));
    expect(phoneticKey('VALVERDE')).toBe(phoneticKey('BALBERDE'));
  });

  it('maps Z → S', () => {
    expect(phoneticKey('ZAPATA')).toBe(phoneticKey('SAPATA'));
    expect(phoneticKey('GONZALEZ')).toBe(phoneticKey('GONSALES'));
  });

  it('maps LL → Y', () => {
    expect(phoneticKey('MURILLO')).toBe(phoneticKey('MURIYO'));
    expect(phoneticKey('CASTILLO')).toBe(phoneticKey('CASTIYO'));
  });

  it('removes H', () => {
    expect(phoneticKey('HERRERA')).toBe(phoneticKey('ERRERA'));
    expect(phoneticKey('HERNANDEZ')).toBe(phoneticKey('ERNANDEZ'));
  });

  it('collapses repeated consonants', () => {
    expect(phoneticKey('LLANOS')).toBe(phoneticKey('YANOS'));
  });

  it('handles real CR surname pairs that should match', () => {
    // These are common phonetic equivalences in Costa Rica
    expect(phoneticKey('GONZALEZ')).toBe(phoneticKey('GONSALES'));
    expect(phoneticKey('VASQUEZ')).toBe(phoneticKey('BASQUES'));
  });
});

// ─── getNameParts ─────────────────────────────────────────────────────────────

describe('getNameParts', () => {
  it('splits a two-part name', () => {
    const parts = getNameParts('Juan García');
    expect(parts.firstName).toBe('JUAN');
    expect(parts.lastName).toBe('GARCIA');
    expect(parts.parts).toEqual(['JUAN', 'GARCIA']);
  });

  it('splits a three-part name', () => {
    const parts = getNameParts('María Fernanda López');
    expect(parts.firstName).toBe('MARIA');
    expect(parts.lastName).toBe('FERNANDA LOPEZ');
    expect(parts.parts).toEqual(['MARIA', 'FERNANDA', 'LOPEZ']);
  });

  it('handles single name', () => {
    const parts = getNameParts('Rodriguez');
    expect(parts.firstName).toBe('RODRIGUEZ');
    expect(parts.lastName).toBe('');
  });

  it('handles name with accents and connectors', () => {
    const parts = getNameParts('José de la Cruz Hernández');
    expect(parts.firstName).toBe('JOSE');
    expect(parts.parts).toEqual(['JOSE', 'DE', 'LA', 'CRUZ', 'HERNANDEZ']);
  });
});

// ─── isAbbreviationOf ─────────────────────────────────────────────────────────

describe('isAbbreviationOf', () => {
  // Prefix-based abbreviations
  it('matches prefix abbreviations', () => {
    expect(isAbbreviationOf('ALEX', 'ALEXANDER')).toBe(true);
    expect(isAbbreviationOf('STEPH', 'STEPHANIE')).toBe(true);
    expect(isAbbreviationOf('CRIS', 'CRISTINA')).toBe(true);
    expect(isAbbreviationOf('DANI', 'DANIELA')).toBe(true);
  });

  // CR apodo dictionary entries
  it('matches CR apodos (not prefix-based)', () => {
    expect(isAbbreviationOf('PEPE', 'JOSE')).toBe(true);
    expect(isAbbreviationOf('PACO', 'FRANCISCO')).toBe(true);
    expect(isAbbreviationOf('PANCHO', 'FRANCISCO')).toBe(true);
    expect(isAbbreviationOf('NACHO', 'IGNACIO')).toBe(true);
    expect(isAbbreviationOf('MEMO', 'GUILLERMO')).toBe(true);
    expect(isAbbreviationOf('KIKE', 'ENRIQUE')).toBe(true);
    expect(isAbbreviationOf('LALO', 'EDUARDO')).toBe(true);
    expect(isAbbreviationOf('CHECO', 'SERGIO')).toBe(true);
    expect(isAbbreviationOf('MANOLO', 'MANUEL')).toBe(true);
  });

  // Negative cases
  it('rejects unrelated names', () => {
    expect(isAbbreviationOf('MARIA', 'JOSE')).toBe(false);
    expect(isAbbreviationOf('PEDRO', 'GONZALEZ')).toBe(false);
    expect(isAbbreviationOf('AB', 'ABCDEF')).toBe(false); // too short
  });

  it('does not match same-length words as abbreviations', () => {
    expect(isAbbreviationOf('JUAN', 'JUAN')).toBe(false);
  });
});

// ─── tokenPermutations ───────────────────────────────────────────────────────

describe('tokenPermutations', () => {
  it('returns single element for 1-token name', () => {
    expect(tokenPermutations(['RODRIGUEZ'])).toEqual([['RODRIGUEZ']]);
  });

  it('returns 2 permutations for 2-token name', () => {
    const perms = tokenPermutations(['JUAN', 'PEREZ']);
    expect(perms).toHaveLength(2);
    expect(perms).toContainEqual(['JUAN', 'PEREZ']);
    expect(perms).toContainEqual(['PEREZ', 'JUAN']);
  });

  it('returns 6 permutations for 3-token name', () => {
    const perms = tokenPermutations(['JUAN', 'PEREZ', 'GARCIA']);
    expect(perms).toHaveLength(6);
  });

  it('returns 24 permutations for 4-token name', () => {
    const perms = tokenPermutations(['JUAN', 'CARLOS', 'PEREZ', 'GARCIA']);
    expect(perms).toHaveLength(24);
  });

  it('caps 5+ token names to [original, reversed] only', () => {
    const perms = tokenPermutations(['A', 'B', 'C', 'D', 'E']);
    expect(perms).toHaveLength(2);
    expect(perms[0]).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(perms[1]).toEqual(['E', 'D', 'C', 'B', 'A']);
  });
});
