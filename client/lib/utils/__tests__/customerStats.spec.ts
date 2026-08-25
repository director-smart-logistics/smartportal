/**
 * customerStats.spec.ts
 *
 * Locks the math behind the customer-detail header KPIs (`Active`,
 * `Delivered`, `Total weight`, `Avg weight`, `Days as customer`) plus the
 * generic `formatRelativeTime` helper used in tooltips and audit logs.
 *
 * The math is straightforward but it sits on the customer-facing summary
 * card, so any drift produces visibly wrong KPIs in production. The tests
 * below cover the documented status buckets, the typeof-string defensive
 * parsing path, and the relative-time fallback chain.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateCustomerStats, formatRelativeTime } from '.././customerStats';
import type { Package } from '@/types';

// ── Test fixture builder ──────────────────────────────────────────────────────

const ISO_NOW = '2026-05-05T12:00:00.000Z';
const FAKE_NOW = new Date(ISO_NOW).getTime();

function makePkg(overrides: Partial<Package> = {}): Package {
  return {
    id: overrides.id ?? `pkg-${Math.random().toString(36).slice(2)}`,
    trackingNumber: overrides.trackingNumber ?? 'TRK-1',
    customerId: overrides.customerId ?? 'C-1',
    customerName: overrides.customerName ?? 'Test',
    status: overrides.status ?? 'pending',
    weight: overrides.weight ?? 1,
    origin: overrides.origin ?? 'USA',
    destination: overrides.destination ?? 'CR',
    createdAt: overrides.createdAt ?? '2026-04-01T12:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-01T12:00:00.000Z',
    ...overrides,
  } as Package;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FAKE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
//  calculateCustomerStats
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateCustomerStats — counters', () => {
  it('returns 0s for an empty package list', () => {
    const s = calculateCustomerStats([], '2026-01-01T00:00:00.000Z');
    expect(s.totalPackages).toBe(0);
    expect(s.activePackages).toBe(0);
    expect(s.deliveredPackages).toBe(0);
    expect(s.totalWeight).toBe(0);
    expect(s.totalValue).toBe(0);
    expect(s.averagePackageWeight).toBe(0);
    expect(s.lastActivityDate).toBeNull();
  });

  it('counts every "active" status (pending/intake/in_transit/custom_released)', () => {
    const pkgs: Package[] = [
      makePkg({ status: 'pending' }),
      makePkg({ status: 'intake' }),
      makePkg({ status: 'in_transit' }),
      makePkg({ status: 'custom_released' }),
    ];
    const s = calculateCustomerStats(pkgs, '2026-01-01');
    expect(s.activePackages).toBe(4);
  });

  it('does NOT count delivered or failed as active', () => {
    const pkgs: Package[] = [
      makePkg({ status: 'delivered' }),
      makePkg({ status: 'failed' }),
    ];
    const s = calculateCustomerStats(pkgs, '2026-01-01');
    expect(s.activePackages).toBe(0);
  });

  it('counts delivered packages independently of active', () => {
    const pkgs: Package[] = [
      makePkg({ status: 'delivered' }),
      makePkg({ status: 'delivered' }),
      makePkg({ status: 'pending' }),
    ];
    const s = calculateCustomerStats(pkgs, '2026-01-01');
    expect(s.deliveredPackages).toBe(2);
    expect(s.activePackages).toBe(1);
  });

  it('totalPackages reflects the raw input length', () => {
    const pkgs: Package[] = [makePkg(), makePkg(), makePkg()];
    expect(calculateCustomerStats(pkgs, '2026-01-01').totalPackages).toBe(3);
  });
});

describe('calculateCustomerStats — weight & value math', () => {
  it('sums numeric weights', () => {
    const pkgs: Package[] = [
      makePkg({ weight: 1.5 }),
      makePkg({ weight: 2.5 }),
    ];
    expect(calculateCustomerStats(pkgs, '2026-01-01').totalWeight).toBe(4);
  });

  it('parses string weights defensively (legacy data)', () => {
    const pkgs = [
      { ...makePkg(), weight: '2.5' as unknown as number },
      { ...makePkg(), weight: '3.5' as unknown as number },
    ];
    expect(calculateCustomerStats(pkgs as Package[], '2026-01-01').totalWeight).toBe(6);
  });

  it('treats unparseable weights as 0', () => {
    const pkgs = [
      { ...makePkg(), weight: 'abc' as unknown as number },
      { ...makePkg(), weight: 5 },
    ];
    expect(calculateCustomerStats(pkgs as Package[], '2026-01-01').totalWeight).toBe(5);
  });

  it('averagePackageWeight = total / count', () => {
    const pkgs: Package[] = [
      makePkg({ weight: 2 }),
      makePkg({ weight: 4 }),
      makePkg({ weight: 6 }),
    ];
    expect(calculateCustomerStats(pkgs, '2026-01-01').averagePackageWeight).toBe(4);
  });

  it('averagePackageWeight is 0 when there are no packages (no division by zero)', () => {
    expect(calculateCustomerStats([], '2026-01-01').averagePackageWeight).toBe(0);
  });

  it('sums calculatedCost into totalValue', () => {
    const pkgs: Package[] = [
      makePkg({ calculatedCost: 10 }),
      makePkg({ calculatedCost: 25 }),
    ];
    expect(calculateCustomerStats(pkgs, '2026-01-01').totalValue).toBe(35);
  });

  it('parses string calculatedCost defensively', () => {
    const pkgs = [
      { ...makePkg(), calculatedCost: '12.5' as unknown as number },
      { ...makePkg(), calculatedCost: 7.5 },
    ];
    expect(calculateCustomerStats(pkgs as Package[], '2026-01-01').totalValue).toBe(20);
  });

  it('treats missing calculatedCost as 0', () => {
    const pkgs: Package[] = [makePkg({ calculatedCost: undefined }), makePkg({ calculatedCost: 10 })];
    expect(calculateCustomerStats(pkgs, '2026-01-01').totalValue).toBe(10);
  });
});

describe('calculateCustomerStats — daysAsCustomer', () => {
  it('floor((now - createdAt) / day)', () => {
    // 30 days before NOW
    const created = new Date(FAKE_NOW - 30 * 86400_000).toISOString();
    expect(calculateCustomerStats([], created).daysAsCustomer).toBe(30);
  });

  it('returns 0 when createdAt is in the future (clamped)', () => {
    const future = new Date(FAKE_NOW + 86400_000).toISOString();
    expect(calculateCustomerStats([], future).daysAsCustomer).toBe(0);
  });

  it('returns 0 for the same day', () => {
    expect(calculateCustomerStats([], ISO_NOW).daysAsCustomer).toBe(0);
  });

  it('handles 365 days (a year)', () => {
    const created = new Date(FAKE_NOW - 365 * 86400_000).toISOString();
    expect(calculateCustomerStats([], created).daysAsCustomer).toBe(365);
  });
});

describe('calculateCustomerStats — lastActivityDate', () => {
  it('picks the most recent updatedAt', () => {
    const pkgs: Package[] = [
      makePkg({ updatedAt: '2026-04-01T00:00:00.000Z' }),
      makePkg({ updatedAt: '2026-04-15T00:00:00.000Z' }),
      makePkg({ updatedAt: '2026-04-10T00:00:00.000Z' }),
    ];
    const s = calculateCustomerStats(pkgs, '2026-01-01');
    expect(s.lastActivityDate).toBe('2026-04-15T00:00:00.000Z');
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    const pkgs = [
      { ...makePkg({ createdAt: '2026-04-01T00:00:00.000Z' }), updatedAt: undefined as unknown as string },
    ];
    const s = calculateCustomerStats(pkgs as Package[], '2026-01-01');
    expect(s.lastActivityDate).toBe('2026-04-01T00:00:00.000Z');
  });

  it('returns null when there are no packages', () => {
    expect(calculateCustomerStats([], '2026-01-01').lastActivityDate).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  formatRelativeTime
// ─────────────────────────────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns a year-scale label when diff > 365 days', () => {
    const past = new Date(FAKE_NOW - 400 * 86400_000);
    const out = formatRelativeTime(past);
    expect(out).toMatch(/year|yr/i);
  });

  it('returns a month-scale label between ~30 and ~364 days', () => {
    const past = new Date(FAKE_NOW - 60 * 86400_000);
    expect(formatRelativeTime(past)).toMatch(/month/i);
  });

  it('returns a week-scale label between ~7 and ~29 days', () => {
    const past = new Date(FAKE_NOW - 14 * 86400_000);
    expect(formatRelativeTime(past)).toMatch(/week/i);
  });

  it('returns a day-scale label between 1 and 6 days', () => {
    const past = new Date(FAKE_NOW - 3 * 86400_000);
    expect(formatRelativeTime(past)).toMatch(/day/i);
  });

  it('returns an hour-scale label when diff is < 24h', () => {
    const past = new Date(FAKE_NOW - 5 * 3600_000);
    expect(formatRelativeTime(past)).toMatch(/hour|hr/i);
  });

  it('returns a minute-scale label when diff is < 1h', () => {
    const past = new Date(FAKE_NOW - 5 * 60_000);
    expect(formatRelativeTime(past)).toMatch(/min/i);
  });

  it('returns a second-scale label when diff is < 1min', () => {
    const past = new Date(FAKE_NOW - 5_000);
    expect(formatRelativeTime(past)).toMatch(/sec|now/i);
  });

  it('accepts an ISO string input', () => {
    const iso = new Date(FAKE_NOW - 2 * 3600_000).toISOString();
    expect(formatRelativeTime(iso)).toMatch(/hour|hr/i);
  });

  it('does not throw for very old dates', () => {
    expect(() => formatRelativeTime(new Date('1990-01-01'))).not.toThrow();
  });

  it('respects the locale parameter', () => {
    const past = new Date(FAKE_NOW - 3 * 86400_000);
    // Spanish day label
    expect(formatRelativeTime(past, 'es')).toMatch(/d[ií]a/);
  });
});
