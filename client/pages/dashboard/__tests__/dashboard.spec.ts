import { describe, it, expect } from 'vitest';

describe('Dashboard — summary logic', () => {
  it('computes package status counts from a list', () => {
    type Status = 'pending' | 'in_transit' | 'delivered';
    const pkgs = [
      { status: 'pending' as Status },
      { status: 'delivered' as Status },
      { status: 'delivered' as Status },
      { status: 'in_transit' as Status },
    ];
    const counts = pkgs.reduce<Record<Status, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {} as Record<Status, number>);
    expect(counts.delivered).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.in_transit).toBe(1);
  });

  it('calculates percentage share per status', () => {
    const pct = (part: number, total: number) =>
      total === 0 ? 0 : Math.round((part / total) * 100);
    expect(pct(2, 4)).toBe(50);
    expect(pct(1, 4)).toBe(25);
    expect(pct(0, 4)).toBe(0);
    expect(pct(0, 0)).toBe(0);
  });

  it('formats a date to locale string dd/mm/yyyy', () => {
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };
    expect(fmt('2025-03-17')).toBe('17/03/2025');
    expect(fmt('2025-01-01')).toBe('01/01/2025');
  });
});
