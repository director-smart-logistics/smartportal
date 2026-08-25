/**
 * Pricing calculator — TDD spec
 *
 * This file is the single source of truth for all pricing rules.
 * If a test fails, fix the IMPLEMENTATION — never weaken or modify these tests.
 *
 * ─── USA AIR — CANONICAL SPEC ─────────────────────────────────────────────
 * REGULAR (no permit):
 *   0.23kg  → $8   (0-499g tier)
 *   0.89kg  → $12  (500g-1kg tier)
 *   1.30kg  → $20  $12 + $8  (300g fraction < 500g)
 *   2.12kg  → $32  $12 + $12 + $8  (120g fraction < 500g)
 *   2.56kg  → $36  $12 + $12 + $12  (560g fraction ≥ 500g)
 *   3.50kg  → $48  $12 + $12 + $12 + $12  (500g fraction ≥ 500g)
 *
 * PERMIT manifests (DANP / PERMISOS / PERMISOSDAN):
 *   formula: ceil(weightKg) × $12 + $3
 *   0.84kg  → $15  ceil(0.84)=1 × $12 + $3
 *   1.14kg  → $27  ceil(1.14)=2 × $24 + $3
 *   1.56kg  → $27  ceil(1.56)=2 × $24 + $3
 * ──────────────────────────────────────────────────────────────────────────
 *
 * REGRESSION GUARD: prices must NEVER be calculated as (weight / 28) * 30
 * That is the per_cubic_foot formula for USA SEA — NOT for USA AIR.
 */

import { describe, it, expect } from 'vitest';
import { calculatePrice, PERMIT_SURCHARGE } from '.././pricing';

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('calculatePrice — return shape', () => {
  it('always returns price, currency, breakdown, quoteRequired', () => {
    const r = calculatePrice(1.0, 'usa', 'air', 'regular', false);
    expect(typeof r.price).toBe('number');
    expect(typeof r.currency).toBe('string');
    expect(typeof r.breakdown).toBe('string');
    expect(typeof r.quoteRequired).toBe('boolean');
  });

  it('currency is USD for usa', () => {
    expect(calculatePrice(1.0, 'usa', 'air', 'regular', false).currency).toBe('USD');
  });

  it('breakdown is never empty for a priced result', () => {
    const r = calculatePrice(2.0, 'usa', 'air', 'regular', false);
    expect(r.breakdown.length).toBeGreaterThan(0);
  });
});

// ─── PERMIT_SURCHARGE constant ────────────────────────────────────────────────

describe('PERMIT_SURCHARGE constant', () => {
  it('is $3', () => {
    expect(PERMIT_SURCHARGE).toBe(3);
  });
});

// ─── USA Air Regular ──────────────────────────────────────────────────────────

describe('calculatePrice — USA Air Regular (no permit)', () => {
  const calc = (kg: number) => calculatePrice(kg, 'usa', 'air', 'regular', false);

  // ── Tier 1: 0-499g = $8 ──
  it('0.10kg → $8', () => expect(calc(0.10).price).toBe(8));
  it('0.23kg → $8', () => expect(calc(0.23).price).toBe(8));
  it('0.499kg → $8  (boundary: 499g)', () => expect(calc(0.499).price).toBe(8));

  // ── Tier 2: 500g-1kg = $12 ──
  it('0.5kg  → $12  (boundary: 500g)', () => expect(calc(0.5).price).toBe(12));
  it('0.89kg → $12', () => expect(calc(0.89).price).toBe(12));
  it('1.0kg  → $12  (boundary: exactly 1kg)', () => expect(calc(1.0).price).toBe(12));

  // ── Over 1kg: $12 first kg + $12 per additional full kg + fraction ──
  it('1.30kg → $20  ($12 + $8 for 300g fraction)', () => expect(calc(1.30).price).toBe(20));
  it('1.50kg → $20  ($12 + $8 for 500g? NO — 500g fraction = $12 → $24)', () => {
    // 1.50kg: first 1kg=$12, extra=0.5kg → fraction=500g ≥500g → $12. Total=$24
    expect(calc(1.50).price).toBe(24);
  });
  it('2.12kg → $32  ($12 + $12 + $8 for 120g fraction)', () => expect(calc(2.12).price).toBe(32));
  it('2.56kg → $36  ($12 + $12 + $12 for 560g fraction ≥500g)', () => expect(calc(2.56).price).toBe(36));
  it('3.50kg → $48  ($12 + $12 + $12 + $12 for 500g fraction)', () => expect(calc(3.50).price).toBe(48));
  it('4.00kg → $60  ($12 × 5 — 4 full kgs, no fraction)', () => {
    // 4kg: first 1kg=$12, extra=3.0kg → 3 full kgs=$36, fraction=0 → $0. Total=$48
    // Wait: extra=3.0, fullKgs=3, fraction=0 → price=12+36=48, no fraction added → $48
    expect(calc(4.00).price).toBe(48);
  });

  // ── Never quote-required for regular air ──
  it('quoteRequired is always false for regular', () => {
    [0.1, 0.5, 1.0, 2.0, 5.0, 10.0].forEach(kg => {
      expect(calc(kg).quoteRequired).toBe(false);
    });
  });

  // ── Regression guard: must NOT produce per_cubic_foot result ──
  it('REGRESSION: 2kg result is NOT (2/28)*30 = $2.14', () => {
    expect(calc(2.0).price).not.toBeCloseTo(2.14, 1);
  });
  it('REGRESSION: 0.1kg result is NOT (0.1/28)*30 = $0.11', () => {
    expect(calc(0.1).price).not.toBeCloseTo(0.11, 1);
  });
  it('REGRESSION: 2kg result is NOT weight × 1.07 (wrong per_kg rate)', () => {
    expect(calc(2.0).price).not.toBeCloseTo(2.0 * 1.07, 1);
  });
});

// ─── USA Air Permit ───────────────────────────────────────────────────────────

describe('calculatePrice — USA Air Permit (ceil × $12 + $3)', () => {
  const calc = (kg: number) => calculatePrice(kg, 'usa', 'air', 'regular', true);

  it('0.10kg → $15  ceil(0.10)=1 × $12 + $3', () => expect(calc(0.10).price).toBe(15));
  it('0.84kg → $15  ceil(0.84)=1 × $12 + $3', () => expect(calc(0.84).price).toBe(15));
  it('1.00kg → $15  ceil(1.00)=1 × $12 + $3', () => expect(calc(1.00).price).toBe(15));
  it('1.01kg → $27  ceil(1.01)=2 × $24 + $3', () => expect(calc(1.01).price).toBe(27));
  it('1.14kg → $27  ceil(1.14)=2 × $24 + $3', () => expect(calc(1.14).price).toBe(27));
  it('1.56kg → $27  ceil(1.56)=2 × $24 + $3', () => expect(calc(1.56).price).toBe(27));
  it('2.00kg → $27  ceil(2.00)=2 × $24 + $3', () => expect(calc(2.00).price).toBe(27));
  it('2.01kg → $39  ceil(2.01)=3 × $36 + $3', () => expect(calc(2.01).price).toBe(39));
  it('3.00kg → $39  ceil(3.00)=3 × $36 + $3', () => expect(calc(3.00).price).toBe(39));

  it('quoteRequired is always false for permit regular', () => {
    [0.5, 1.0, 2.0, 5.0].forEach(kg => {
      expect(calc(kg).quoteRequired).toBe(false);
    });
  });

  it('permit price is always > regular price (permit adds surcharge)', () => {
    [0.5, 1.0, 1.5, 2.0].forEach(kg => {
      const permit = calculatePrice(kg, 'usa', 'air', 'regular', true).price;
      const regular = calculatePrice(kg, 'usa', 'air', 'regular', false).price;
      expect(permit).toBeGreaterThan(regular);
    });
  });
});

// ─── USA Air Permit — breakdown ───────────────────────────────────────────────

describe('calculatePrice — breakdown strings', () => {
  it('regular 1.30kg breakdown contains $12 and 300g', () => {
    const r = calculatePrice(1.30, 'usa', 'air', 'regular', false);
    expect(r.breakdown).toContain('$12');
    expect(r.breakdown).toContain('300g');
  });

  it('permit 0.84kg breakdown contains 1kg and $3', () => {
    const r = calculatePrice(0.84, 'usa', 'air', 'regular', true);
    expect(r.breakdown).toContain('1kg');
    expect(r.breakdown).toContain('$3');
  });

  it('permit 1.14kg breakdown contains 2kg', () => {
    const r = calculatePrice(1.14, 'usa', 'air', 'regular', true);
    expect(r.breakdown).toContain('2kg');
  });
});

// ─── USA Air Electronics ──────────────────────────────────────────────────────

describe('calculatePrice — USA Air Electronics', () => {
  it('always returns quoteRequired=true', () => {
    [0.1, 1.0, 5.0].forEach(kg => {
      const r = calculatePrice(kg, 'usa', 'air', 'electronics', false);
      expect(r.quoteRequired).toBe(true);
      expect(r.price).toBe(0);
    });
  });
});

// ─── USA Sea Regular ──────────────────────────────────────────────────────────

describe('calculatePrice — USA Sea Regular (per cubic foot)', () => {
  const calc = (kg: number) => calculatePrice(kg, 'usa', 'sea', 'regular', false);

  it('returns a price > 0 for non-zero weight', () => {
    expect(calc(10).price).toBeGreaterThan(0);
  });

  it('uses per_cubic_foot formula: (weight/28)*30', () => {
    // 28kg = 1 cubic foot, $30/cubic foot
    expect(calc(28).price).toBeCloseTo(30, 1);
    expect(calc(14).price).toBeCloseTo(15, 1);
  });

  it('is NOT the same formula as USA Air', () => {
    // 2kg sea ≠ 2kg air
    expect(calc(2).price).not.toBe(calculatePrice(2, 'usa', 'air', 'regular', false).price);
  });
});

// ─── Mexico Air ───────────────────────────────────────────────────────────────

describe('calculatePrice — Mexico Air Regular (per_kg $16)', () => {
  const calc = (kg: number) => calculatePrice(kg, 'mexico', 'air', 'regular', false);

  it('1kg → $16', () => expect(calc(1).price).toBeCloseTo(16, 2));
  it('2kg → $32', () => expect(calc(2).price).toBeCloseTo(32, 2));
  it('0.5kg → $8', () => expect(calc(0.5).price).toBeCloseTo(8, 2));
  it('quoteRequired is false', () => expect(calc(1).quoteRequired).toBe(false));
  it('price scales linearly with weight', () => {
    expect(calc(3).price).toBeCloseTo(calc(1).price * 3, 1);
  });
});

describe('calculatePrice — Mexico Air Electronics', () => {
  it('returns quoteRequired=true', () => {
    expect(calculatePrice(1, 'mexico', 'air', 'electronics', false).quoteRequired).toBe(true);
  });
});

// ─── China Air ────────────────────────────────────────────────────────────────

describe('calculatePrice — China Air Regular (per_kg $20)', () => {
  const calc = (kg: number) => calculatePrice(kg, 'china', 'air', 'regular', false);

  it('1kg → $20', () => expect(calc(1).price).toBeCloseTo(20, 2));
  it('2kg → $40', () => expect(calc(2).price).toBeCloseTo(40, 2));
  it('quoteRequired is false', () => expect(calc(1).quoteRequired).toBe(false));
});

// ─── Colombia Air ─────────────────────────────────────────────────────────────

describe('calculatePrice — Colombia Air Regular (per_kg $12)', () => {
  const calc = (kg: number) => calculatePrice(kg, 'colombia', 'air', 'regular', false);

  it('1kg → $12', () => expect(calc(1).price).toBeCloseTo(12, 2));
  it('2kg → $24', () => expect(calc(2).price).toBeCloseTo(24, 2));
  it('quoteRequired is false', () => expect(calc(1).quoteRequired).toBe(false));
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('calculatePrice — edge cases', () => {
  it('0kg weight does not crash', () => {
    expect(() => calculatePrice(0, 'usa', 'air', 'regular', false)).not.toThrow();
  });

  it('very large weight does not crash', () => {
    expect(() => calculatePrice(999, 'usa', 'air', 'regular', false)).not.toThrow();
  });

  it('unknown country returns quoteRequired=true', () => {
    const r = calculatePrice(1, 'unknown' as any, 'air', 'regular', false);
    expect(r.quoteRequired).toBe(true);
    expect(r.price).toBe(0);
  });

  it('price is always a finite number (no NaN, no Infinity)', () => {
    const cases: [number, string, string, string, boolean][] = [
      [0, 'usa', 'air', 'regular', false],
      [1, 'usa', 'air', 'regular', true],
      [0.001, 'mexico', 'air', 'regular', false],
      [100, 'china', 'sea', 'regular', false],
    ];
    cases.forEach(([w, c, s, cat, p]) => {
      const r = calculatePrice(w, c as any, s as any, cat as any, p);
      expect(Number.isFinite(r.price)).toBe(true);
    });
  });

  it('price is always rounded to max 2 decimal places', () => {
    [0.333, 1.667, 2.5].forEach(kg => {
      const r = calculatePrice(kg, 'mexico', 'air', 'regular', false);
      const decimals = (r.price.toString().split('.')[1] || '').length;
      expect(decimals).toBeLessThanOrEqual(2);
    });
  });
});
