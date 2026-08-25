import { describe, it, expect } from 'vitest';

describe('Tracking — number validation logic', () => {
  const USPS_PATTERN = /^\d{20,22}$/;
  const MLCARGO_PATTERN = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

  it('validates USPS tracking numbers (20-22 digits)', () => {
    expect(USPS_PATTERN.test('9400111899223496525982')).toBe(true);
    expect(USPS_PATTERN.test('94001118992234965259')).toBe(true);
    expect(USPS_PATTERN.test('12345')).toBe(false);
  });

  it('validates MLCargo tracking format (2 letters + 9 digits + 2 letters)', () => {
    expect(MLCARGO_PATTERN.test('AB123456789CD')).toBe(true);
    expect(MLCARGO_PATTERN.test('AB12345CD')).toBe(false);
    expect(MLCARGO_PATTERN.test('12345678901')).toBe(false);
  });

  it('normalizes tracking number by removing spaces and uppercasing', () => {
    const normalize = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();
    expect(normalize('  9400 1118 9922  ')).toBe('940011189922');
    expect(normalize('ab 123456789 cd')).toBe('AB123456789CD');
  });
});
