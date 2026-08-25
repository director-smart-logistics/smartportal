import { describe, it, expect } from 'vitest';

describe('Manifests — data logic', () => {
  it('parses manifest type from string', () => {
    type ManifestType = 'air' | 'sea' | 'freight' | 'local';
    const parseType = (raw: string): ManifestType => {
      const map: Record<string, ManifestType> = { air: 'air', sea: 'sea', freight: 'freight', local: 'local' };
      return map[raw.toLowerCase()] ?? 'freight';
    };
    expect(parseType('AIR')).toBe('air');
    expect(parseType('sea')).toBe('sea');
    expect(parseType('unknown')).toBe('freight');
  });

  it('formats manifest number with leading zeros', () => {
    const fmt = (n: number) => `MAN-${String(n).padStart(6, '0')}`;
    expect(fmt(1)).toBe('MAN-000001');
    expect(fmt(99999)).toBe('MAN-099999');
  });
});
