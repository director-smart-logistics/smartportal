// @vitest-environment jsdom
/**
 * use-nova-price-calcs.spec.ts
 *
 * Unit tests for the useNovaPriceCalcs hook.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Stub calculatePrice so we do not need full pricing tables
vi.mock('@/lib/utils/pricing', () => ({
  calculatePrice: vi.fn((peso) => ({ price: peso * 10, quoteRequired: false })),
}));

import { useNovaPriceCalcs } from '.././use-nova-price-calcs';
import type { ManifestRow } from '@/lib/services/manifest-processor';

function makeRow(tracking: string, peso: number): ManifestRow {
  return {
    tracking,
    peso,
    pesoRedondeo: peso,
    precio: peso * 10,
    permisos: false,
  } as ManifestRow;
}

describe('useNovaPriceCalcs', () => {
  it('applies recalculated prices and keys overrides by tracking number string', () => {
    const rows = [
      makeRow('TRACK-A', 1.5),
      makeRow('TRACK-B', 2.0),
    ];
    let priceOverrides: Record<string, { precio: number; pesoRedondeo: number }> = {};
    const setPriceOverrides = vi.fn((updater) => {
      priceOverrides = typeof updater === 'function' ? updater(priceOverrides) : updater;
    });

    const { result } = renderHook(() =>
      useNovaPriceCalcs({
        resultDataRows: rows,
        manifestCountry: 'usa',
        manifestShipping: 'air',
        exchangeRate: '480',
        priceOverrides,
        setPriceOverrides,
      })
    );

    // Initial getEffectivePrice checks computedPrices
    expect(result.current.getEffectivePrice(0, rows[0])).toBe(15);
    expect(result.current.getEffectivePrice(1, rows[1])).toBe(20);

    // Call applyRecalc to round TRACK-A to granularity of 1.0 (ceil to 2.0)
    act(() => {
      result.current.applyRecalc([0], 1.0);
    });

    // Verify it called setPriceOverrides and stored it by tracking number string
    expect(setPriceOverrides).toHaveBeenCalled();
    expect(priceOverrides['TRACK-A']).toEqual({
      precio: 20, // calculatePrice for Math.ceil(1.5) = 2.0 -> 2.0 * 10 = 20
      pesoRedondeo: 2,
    });
    expect(priceOverrides['TRACK-B']).toBeUndefined();
  });
});
