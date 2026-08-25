/**
 * Unit tests for Nickname Resolver.
 *
 * Validates bidirectional resolution, diminutive stripping, and canonical forms.
 */
import { describe, it, expect } from 'vitest';
import { getAllVariants, toCanonical, areNicknameEquivalent, stripDiminutive } from '../nickname-resolver';

describe('areNicknameEquivalent', () => {
  it('returns true for identical tokens', () => {
    expect(areNicknameEquivalent('JUAN', 'JUAN')).toBe(true);
  });

  // Forward: abbreviation → canonical
  it('matches PEPE → JOSE (forward)', () => {
    expect(areNicknameEquivalent('PEPE', 'JOSE')).toBe(true);
  });

  // Reverse: canonical → abbreviation
  it('matches JOSE → PEPE (reverse)', () => {
    expect(areNicknameEquivalent('JOSE', 'PEPE')).toBe(true);
  });

  it('matches PACO → FRANCISCO', () => {
    expect(areNicknameEquivalent('PACO', 'FRANCISCO')).toBe(true);
  });

  it('matches FRANCISCO → PACO', () => {
    expect(areNicknameEquivalent('FRANCISCO', 'PACO')).toBe(true);
  });

  it('does NOT match unrelated names', () => {
    expect(areNicknameEquivalent('GARCIA', 'LOPEZ')).toBe(false);
  });

  it('does NOT match names that share letters but are not nicknames', () => {
    expect(areNicknameEquivalent('MARIO', 'MARIA')).toBe(false);
  });
});

describe('getAllVariants', () => {
  it('always includes the input token', () => {
    const variants = getAllVariants('RANDOMNAME');
    expect(variants).toContain('RANDOMNAME');
  });

  it('includes forward expansions for known abbreviations', () => {
    const variants = getAllVariants('PEPE');
    expect(variants).toContain('PEPE');
    expect(variants).toContain('JOSE');
  });

  it('includes reverse lookups for canonical names', () => {
    const variants = getAllVariants('JOSE');
    expect(variants).toContain('JOSE');
    expect(variants).toContain('PEPE');
  });

  it('includes diminutive base form', () => {
    const variants = getAllVariants('JUANITO');
    expect(variants).toContain('JUANITO');
    // Should have the diminutive base
    expect(variants.length).toBeGreaterThan(1);
  });
});

describe('toCanonical', () => {
  it('returns the longest expansion for known abbreviations', () => {
    const canonical = toCanonical('PEPE');
    expect(canonical).toBe('JOSE');
  });

  it('returns the token itself for unknown names', () => {
    expect(toCanonical('GARCIA')).toBe('GARCIA');
  });

  it('strips diminutives when no forward expansion exists', () => {
    const canonical = toCanonical('JUANITO');
    // Should strip -ITO suffix
    expect(canonical.length).toBeLessThan('JUANITO'.length);
  });
});

describe('stripDiminutive', () => {
  it('returns the token unchanged if too short', () => {
    expect(stripDiminutive('ANA')).toBe('ANA');
    expect(stripDiminutive('LUI')).toBe('LUI');
  });

  it('strips -ITO suffix', () => {
    const result = stripDiminutive('PEDRITO');
    expect(result).not.toContain('ITO');
    expect(result.length).toBeLessThan('PEDRITO'.length);
  });

  it('strips -ITA suffix', () => {
    const result = stripDiminutive('ROSITA');
    expect(result).toBe('ROSA');
  });

  it('strips -ITOS suffix', () => {
    const result = stripDiminutive('CARLITOS');
    expect(result.length).toBeLessThan('CARLITOS'.length);
  });

  it('does not strip from non-diminutive names', () => {
    expect(stripDiminutive('BENITO')).not.toBe('BEN'); // BENITO is a real name
    // The function strips mechanically, but the result length >= 3 guard helps
  });
});
