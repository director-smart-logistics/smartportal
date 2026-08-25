import { describe, it, expect } from 'vitest';

describe('Scanner — barcode logic', () => {
  it('validates tracking number format (non-empty string)', () => {
    const isValidTracking = (code: string) => typeof code === 'string' && code.trim().length > 0;
    expect(isValidTracking('9400111899223496525982')).toBe(true);
    expect(isValidTracking('')).toBe(false);
    expect(isValidTracking('  ')).toBe(false);
  });

  it('normalizes scanned code by trimming whitespace', () => {
    const normalize = (raw: string) => raw.trim().toUpperCase();
    expect(normalize('  abc123  ')).toBe('ABC123');
    expect(normalize('TRK-001')).toBe('TRK-001');
  });
});
