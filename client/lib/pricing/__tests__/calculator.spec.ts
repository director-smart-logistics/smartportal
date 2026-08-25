/**
 * Low-level pricing calculator — TDD spec
 *
 * Covers the individual building-block functions in calculator.ts:
 *   - calculateTieredPrice      (USA Air tiered logic)
 *   - calculatePerKgPrice       (Mexico/China/Colombia per-kg)
 *   - calculatePerCubicFootPrice (USA Sea per-cubic-foot)
 *   - applyPermitSurcharge      ($3 add-on)
 *   - calculateCategoryPrice    (dispatcher + permit integration)
 *
 * If a test fails, fix the IMPLEMENTATION — never weaken these tests.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTieredPrice,
  calculatePerKgPrice,
  calculatePerCubicFootPrice,
  applyPermitSurcharge,
  calculateCategoryPrice,
  PERMIT_SURCHARGE,
} from '.././calculator';
import type { CategoryPricing } from '.././types';

// ─── PERMIT_SURCHARGE ─────────────────────────────────────────────────────────

describe('PERMIT_SURCHARGE', () => {
  it('equals $3', () => {
    expect(PERMIT_SURCHARGE).toBe(3);
  });
});

// ─── calculateTieredPrice — Regular mode ─────────────────────────────────────

describe('calculateTieredPrice — regular (no permit)', () => {
  const tiers = []; // tiers array is unused by the function; thresholds are hardcoded

  // Tier 1: 0-499g = $8
  it('0.10kg → $8', () => expect(calculateTieredPrice(0.10, tiers, false).price).toBe(8));
  it('0.23kg → $8', () => expect(calculateTieredPrice(0.23, tiers, false).price).toBe(8));
  it('0.499kg → $8  (upper boundary of tier 1)', () => expect(calculateTieredPrice(0.499, tiers, false).price).toBe(8));

  // Tier 2: 500g-1kg = $12
  it('0.5kg  → $12  (lower boundary of tier 2)', () => expect(calculateTieredPrice(0.5, tiers, false).price).toBe(12));
  it('0.89kg → $12', () => expect(calculateTieredPrice(0.89, tiers, false).price).toBe(12));
  it('1.0kg  → $12  (upper boundary of tier 2)', () => expect(calculateTieredPrice(1.0, tiers, false).price).toBe(12));

  // >1kg: $12 first kg + $12/kg full + fraction
  it('1.30kg → $20  (first kg $12 + 300g fraction $8)', () => expect(calculateTieredPrice(1.30, tiers, false).price).toBe(20));
  it('1.50kg → $24  (first kg $12 + 500g fraction $12)', () => expect(calculateTieredPrice(1.50, tiers, false).price).toBe(24));
  it('2.12kg → $32  (first kg $12 + 1 full kg $12 + 120g fraction $8)', () => expect(calculateTieredPrice(2.12, tiers, false).price).toBe(32));
  it('2.56kg → $36  (first kg $12 + 1 full kg $12 + 560g fraction $12)', () => expect(calculateTieredPrice(2.56, tiers, false).price).toBe(36));
  it('3.50kg → $48  (first kg $12 + 2 full kg $24 + 500g fraction $12)', () => expect(calculateTieredPrice(3.50, tiers, false).price).toBe(48));
  it('4.00kg → $48  (first kg $12 + 3 full kg $36, no fraction)', () => expect(calculateTieredPrice(4.00, tiers, false).price).toBe(48));
  it('5.00kg → $60  (first kg $12 + 4 full kg $48, no fraction)', () => expect(calculateTieredPrice(5.00, tiers, false).price).toBe(60));

  // Fraction boundary: exactly 499g extra
  it('1.499kg → $20  (first kg $12 + 499g fraction $8)', () => expect(calculateTieredPrice(1.499, tiers, false).price).toBe(20));
  // Fraction boundary: exactly 500g extra
  it('1.500kg → $24  (first kg $12 + 500g fraction $12)', () => expect(calculateTieredPrice(1.500, tiers, false).price).toBe(24));

  // Breakdown strings
  it('breakdown contains weight and tier info', () => {
    const r = calculateTieredPrice(1.30, tiers, false);
    expect(r.breakdown).toContain('$12');
    expect(r.breakdown).toContain('300g');
  });

  it('breakdown for tier 1 mentions 0-499g range', () => {
    const r = calculateTieredPrice(0.23, tiers, false);
    expect(r.breakdown).toContain('0-499g');
  });
});

// ─── calculateTieredPrice — Permit mode ──────────────────────────────────────

describe('calculateTieredPrice — permit (ceil × $12, NO $3 surcharge here)', () => {
  // Note: $3 is added by applyPermitSurcharge separately, not here
  const tiers: any[] = [];

  it('0.10kg → $12  ceil(0.10)=1 × $12', () => expect(calculateTieredPrice(0.10, tiers, true).price).toBe(12));
  it('0.84kg → $12  ceil(0.84)=1 × $12', () => expect(calculateTieredPrice(0.84, tiers, true).price).toBe(12));
  it('1.00kg → $12  ceil(1.00)=1 × $12 (exact integer)', () => expect(calculateTieredPrice(1.00, tiers, true).price).toBe(12));
  it('1.01kg → $24  ceil(1.01)=2 × $12', () => expect(calculateTieredPrice(1.01, tiers, true).price).toBe(24));
  it('1.14kg → $24  ceil(1.14)=2 × $12', () => expect(calculateTieredPrice(1.14, tiers, true).price).toBe(24));
  it('1.56kg → $24  ceil(1.56)=2 × $12', () => expect(calculateTieredPrice(1.56, tiers, true).price).toBe(24));
  it('2.00kg → $24  ceil(2.00)=2 × $12', () => expect(calculateTieredPrice(2.00, tiers, true).price).toBe(24));
  it('2.01kg → $36  ceil(2.01)=3 × $12', () => expect(calculateTieredPrice(2.01, tiers, true).price).toBe(36));
  it('3.00kg → $36  ceil(3.00)=3 × $12', () => expect(calculateTieredPrice(3.00, tiers, true).price).toBe(36));

  it('breakdown contains the rounded kg value', () => {
    const r = calculateTieredPrice(1.14, tiers, true);
    expect(r.breakdown).toContain('2kg');
    expect(r.breakdown).toContain('$12');
  });

  it('permit base price (before surcharge) is always divisible by $12', () => {
    [0.1, 0.5, 1.0, 1.5, 2.0, 3.7].forEach(kg => {
      const { price } = calculateTieredPrice(kg, tiers, true);
      expect(price % 12).toBe(0);
    });
  });
});

// ─── calculatePerKgPrice ──────────────────────────────────────────────────────

describe('calculatePerKgPrice', () => {
  it('1kg × $16 = $16  (Mexico air regular)', () => {
    expect(calculatePerKgPrice(1, 16).price).toBeCloseTo(16, 2);
  });
  it('2kg × $16 = $32', () => {
    expect(calculatePerKgPrice(2, 16).price).toBeCloseTo(32, 2);
  });
  it('0.5kg × $20 = $10  (China air)', () => {
    expect(calculatePerKgPrice(0.5, 20).price).toBeCloseTo(10, 2);
  });
  it('scales linearly', () => {
    const single = calculatePerKgPrice(1, 12).price;
    expect(calculatePerKgPrice(3, 12).price).toBeCloseTo(single * 3, 2);
  });
  it('result is rounded to 2 decimal places', () => {
    const r = calculatePerKgPrice(0.333, 12);
    const decimals = (r.price.toString().split('.')[1] || '').length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
  it('breakdown contains weight and rate', () => {
    const r = calculatePerKgPrice(2, 16);
    expect(r.breakdown).toContain('2.00kg');
    expect(r.breakdown).toContain('$16');
  });
  it('0kg → $0', () => {
    expect(calculatePerKgPrice(0, 16).price).toBe(0);
  });
});

// ─── calculatePerCubicFootPrice ───────────────────────────────────────────────

describe('calculatePerCubicFootPrice', () => {
  it('28kg (=1 cubic foot) × $30 = $30  (USA Sea default divisor)', () => {
    expect(calculatePerCubicFootPrice(28, 30).price).toBeCloseTo(30, 2);
  });
  it('14kg (=0.5 cubic feet) × $30 = $15', () => {
    expect(calculatePerCubicFootPrice(14, 30).price).toBeCloseTo(15, 2);
  });
  it('56kg (=2 cubic feet) × $30 = $60', () => {
    expect(calculatePerCubicFootPrice(56, 30).price).toBeCloseTo(60, 2);
  });
  it('28kg × $45 = $45  (China Sea)', () => {
    expect(calculatePerCubicFootPrice(28, 45).price).toBeCloseTo(45, 2);
  });
  it('result is rounded to 2 decimal places', () => {
    const r = calculatePerCubicFootPrice(10, 30);
    const decimals = (r.price.toString().split('.')[1] || '').length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
  it('breakdown contains pies³ unit', () => {
    expect(calculatePerCubicFootPrice(28, 30).breakdown).toContain('pies³');
  });
  it('custom kgPerCubicFoot divisor is respected', () => {
    // 14kg / 14kgPerCubicFoot = 1 cubic foot × $30 = $30
    expect(calculatePerCubicFootPrice(14, 30, 14).price).toBeCloseTo(30, 2);
  });
});

// ─── applyPermitSurcharge ─────────────────────────────────────────────────────

describe('applyPermitSurcharge', () => {
  it('adds $3 when requiresPermit=true', () => {
    const r = applyPermitSurcharge(12, '1kg = $12', true);
    expect(r.price).toBe(15);
  });
  it('adds nothing when requiresPermit=false', () => {
    const r = applyPermitSurcharge(12, '1kg = $12', false);
    expect(r.price).toBe(12);
  });
  it('appends surcharge text to breakdown when permit=true', () => {
    const r = applyPermitSurcharge(24, 'base', true);
    expect(r.breakdown).toContain('Permiso');
    expect(r.breakdown).toContain('$3');
  });
  it('does not modify breakdown when permit=false', () => {
    const r = applyPermitSurcharge(12, 'base breakdown', false);
    expect(r.breakdown).toBe('base breakdown');
  });
  it('custom surcharge amount is respected', () => {
    const r = applyPermitSurcharge(12, 'base', true, 5);
    expect(r.price).toBe(17);
  });
  it('default surcharge equals PERMIT_SURCHARGE constant', () => {
    const r = applyPermitSurcharge(0, '', true);
    expect(r.price).toBe(PERMIT_SURCHARGE);
  });
});

// ─── calculateCategoryPrice — tiered mode ────────────────────────────────────

describe('calculateCategoryPrice — pricingMode: tiered (USA Air)', () => {
  const tieredConfig: CategoryPricing = {
    description: 'Regular items',
    pricingMode: 'tiered',
    tiers: [],
    permitSurcharge: 3,
  };

  it('0.23kg, no permit → $8', () => {
    expect(calculateCategoryPrice(0.23, tieredConfig, false, 'USD').price).toBe(8);
  });
  it('0.89kg, no permit → $12', () => {
    expect(calculateCategoryPrice(0.89, tieredConfig, false, 'USD').price).toBe(12);
  });
  it('1.30kg, no permit → $20', () => {
    expect(calculateCategoryPrice(1.30, tieredConfig, false, 'USD').price).toBe(20);
  });
  it('2.12kg, no permit → $32', () => {
    expect(calculateCategoryPrice(2.12, tieredConfig, false, 'USD').price).toBe(32);
  });
  it('2.56kg, no permit → $36', () => {
    expect(calculateCategoryPrice(2.56, tieredConfig, false, 'USD').price).toBe(36);
  });
  it('3.50kg, no permit → $48', () => {
    expect(calculateCategoryPrice(3.50, tieredConfig, false, 'USD').price).toBe(48);
  });

  // Permit: ceil × $12 + $3 surcharge
  it('0.84kg, permit → $15  (ceil=1×$12 + $3)', () => {
    expect(calculateCategoryPrice(0.84, tieredConfig, true, 'USD').price).toBe(15);
  });
  it('1.14kg, permit → $27  (ceil=2×$24 + $3)', () => {
    expect(calculateCategoryPrice(1.14, tieredConfig, true, 'USD').price).toBe(27);
  });
  it('1.56kg, permit → $27  (ceil=2×$24 + $3)', () => {
    expect(calculateCategoryPrice(1.56, tieredConfig, true, 'USD').price).toBe(27);
  });
  it('2.01kg, permit → $39  (ceil=3×$36 + $3)', () => {
    expect(calculateCategoryPrice(2.01, tieredConfig, true, 'USD').price).toBe(39);
  });

  it('currency is passed through', () => {
    expect(calculateCategoryPrice(1.0, tieredConfig, false, 'USD').currency).toBe('USD');
  });
  it('quoteRequired is false for tiered', () => {
    expect(calculateCategoryPrice(1.0, tieredConfig, false, 'USD').quoteRequired).toBe(false);
  });
  it('price is rounded to 2 decimal places', () => {
    const r = calculateCategoryPrice(1.333, tieredConfig, false, 'USD');
    const d = (r.price.toString().split('.')[1] || '').length;
    expect(d).toBeLessThanOrEqual(2);
  });
});

// ─── calculateCategoryPrice — per_kg mode ────────────────────────────────────

describe('calculateCategoryPrice — pricingMode: per_kg', () => {
  const perKgConfig: CategoryPricing = {
    description: 'Mexico regular',
    pricingMode: 'per_kg',
    pricePerKg: 16,
  };

  it('1kg → $16', () => expect(calculateCategoryPrice(1, perKgConfig, false, 'USD').price).toBeCloseTo(16, 2));
  it('2kg → $32', () => expect(calculateCategoryPrice(2, perKgConfig, false, 'USD').price).toBeCloseTo(32, 2));
  it('permit adds $3 on top', () => {
    const withPermit = calculateCategoryPrice(1, { ...perKgConfig, permitSurcharge: 3 }, true, 'USD').price;
    const noPermit = calculateCategoryPrice(1, perKgConfig, false, 'USD').price;
    expect(withPermit).toBe(noPermit + 3);
  });
  it('quoteRequired is false', () => {
    expect(calculateCategoryPrice(1, perKgConfig, false, 'USD').quoteRequired).toBe(false);
  });
});

// ─── calculateCategoryPrice — per_cubic_foot mode ────────────────────────────

describe('calculateCategoryPrice — pricingMode: per_cubic_foot', () => {
  const cubicConfig: CategoryPricing = {
    description: 'USA Sea regular',
    pricingMode: 'per_cubic_foot',
    pricePerCubicFoot: 30,
  };

  it('28kg (1 cu ft) → $30', () => {
    expect(calculateCategoryPrice(28, cubicConfig, false, 'USD').price).toBeCloseTo(30, 1);
  });
  it('14kg (0.5 cu ft) → $15', () => {
    expect(calculateCategoryPrice(14, cubicConfig, false, 'USD').price).toBeCloseTo(15, 1);
  });
  it('quoteRequired is false', () => {
    expect(calculateCategoryPrice(10, cubicConfig, false, 'USD').quoteRequired).toBe(false);
  });
  it('REGRESSION: per_cubic_foot is ONLY used for sea, not air', () => {
    // 2kg via cubic formula = (2/28)*30 = ~2.14 — this must NEVER appear for USA air
    const cubicResult = calculateCategoryPrice(2, cubicConfig, false, 'USD').price;
    expect(cubicResult).toBeCloseTo(2.14, 1);  // confirm what cubic gives
    // USA Air tiered must give something completely different
    const tieredConfig: CategoryPricing = { description: '', pricingMode: 'tiered', tiers: [] };
    const tieredResult = calculateCategoryPrice(2, tieredConfig, false, 'USD').price;
    expect(tieredResult).not.toBeCloseTo(2.14, 1);
    // 2.00kg tiered: first 1kg=$12 + 1 full extra kg=$12 + no fraction = $24
    expect(tieredResult).toBe(24);
  });
});

// ─── calculateCategoryPrice — quote mode ─────────────────────────────────────

describe('calculateCategoryPrice — pricingMode: quote', () => {
  const quoteConfig: CategoryPricing = {
    description: 'Electronics',
    pricingMode: 'quote',
  };

  it('returns quoteRequired=true', () => {
    expect(calculateCategoryPrice(1, quoteConfig, false, 'USD').quoteRequired).toBe(true);
  });
  it('returns price=0', () => {
    expect(calculateCategoryPrice(1, quoteConfig, false, 'USD').price).toBe(0);
  });
  it('quoteRequired=true even with permit flag', () => {
    expect(calculateCategoryPrice(1, quoteConfig, true, 'USD').quoteRequired).toBe(true);
  });
  it('returns breakdown text explaining why', () => {
    const r = calculateCategoryPrice(1, quoteConfig, false, 'USD');
    expect(r.breakdown.length).toBeGreaterThan(0);
  });
});
