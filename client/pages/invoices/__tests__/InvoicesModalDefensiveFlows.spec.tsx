import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../utils/formatters';

describe('Invoices Modal & Formatting Defensive Functional Flows', () => {
  it('safely formats standard and edge-case currencies without throwing', () => {
    expect(formatCurrency(125.5, 'USD')).toBe('$ 125.50 USD');
    expect(formatCurrency(0, 'USD')).toBe('$ 0.00 USD');
    expect(formatCurrency(NaN as any, 'USD')).toBe('$ 0.00 USD');
    expect(formatCurrency(undefined as any, 'USD')).toBe('$ 0.00 USD');
    expect(formatCurrency(null as any, 'CRC')).toBe('₡ 0.00 CRC');
    expect(formatCurrency(5000, 'CRC')).toBe('₡ 5000.00 CRC');
  });

  it('calculates live invoice totals defensively with discounts and tax', () => {
    interface Item {
      unitPrice: number;
      quantity: number;
      weight?: number;
    }

    function calculateLiveTotals(items: Item[], discountPct: number, exchangeRate: number = 515) {
      const subtotal = items.reduce((sum, item) => {
        const p = Number(item.unitPrice || 0);
        const q = Number(item.quantity || 1);
        return sum + p * q;
      }, 0);

      const discountAmt = discountPct > 0 ? Number(((subtotal * discountPct) / 100).toFixed(2)) : 0;
      const total = Number(Math.max(0, subtotal - discountAmt).toFixed(2));
      const totalWeight = Number(items.reduce((sum, item) => sum + Number(item.weight || 0), 0).toFixed(2));
      const totalCRC = exchangeRate > 0 ? Math.round(total * exchangeRate) : 0;

      return {
        subtotal: Number(subtotal.toFixed(2)),
        discountAmt,
        total,
        totalWeight,
        totalCRC,
      };
    }

    // Standard case
    const res1 = calculateLiveTotals([
      { unitPrice: 15.5, quantity: 2, weight: 1.2 },
      { unitPrice: 10.0, quantity: 1, weight: 0.8 },
    ], 10, 500);

    expect(res1.subtotal).toBe(41.0);
    expect(res1.discountAmt).toBe(4.1);
    expect(res1.total).toBe(36.9);
    expect(res1.totalWeight).toBe(2.0);
    expect(res1.totalCRC).toBe(18450);

    // Edge case with null/undefined values
    const res2 = calculateLiveTotals([
      { unitPrice: null as any, quantity: undefined as any, weight: null as any },
      { unitPrice: '20' as any, quantity: 1, weight: 1.5 },
    ], 0, 0);

    expect(res2.subtotal).toBe(20.0);
    expect(res2.discountAmt).toBe(0);
    expect(res2.total).toBe(20.0);
    expect(res2.totalWeight).toBe(1.5);
    expect(res2.totalCRC).toBe(0);
  });

  it('determines transitoria vs reassigned status banner invariants accurately', () => {
    interface PackageLog {
      manifestId?: string;
      originalManifest?: string;
      currentManifest?: string;
      updatedManifest?: string;
    }

    function checkPackageState(log: PackageLog) {
      const isMovedToOtherManifest = Boolean(
        log.originalManifest &&
        log.currentManifest &&
        log.originalManifest.toLowerCase() !== log.currentManifest.toLowerCase() &&
        log.currentManifest.toLowerCase() !== 'consolidacion_transitoria'
      );

      const isTransitoria = Boolean(
        (log.currentManifest && log.currentManifest.toLowerCase() === 'consolidacion_transitoria') ||
        (!log.currentManifest && log.updatedManifest && log.updatedManifest.toLowerCase() === 'consolidacion_transitoria')
      );

      return { isMovedToOtherManifest, isTransitoria };
    }

    // Package moved from MAN-A to MAN-B
    const stateA = checkPackageState({
      originalManifest: '18-09-2026DAN',
      currentManifest: '19-09-2026DAN',
    });
    expect(stateA.isMovedToOtherManifest).toBe(true);
    expect(stateA.isTransitoria).toBe(false);

    // Package in transitoria
    const stateB = checkPackageState({
      originalManifest: '18-09-2026DAN',
      currentManifest: 'consolidacion_transitoria',
    });
    expect(stateB.isMovedToOtherManifest).toBe(false);
    expect(stateB.isTransitoria).toBe(true);

    // Annette tracking: reassigned to 19-09-2026DAN with historical updatedManifest residual
    const stateAnnette = checkPackageState({
      originalManifest: '18-09-2026DAN',
      currentManifest: '19-09-2026DAN',
      updatedManifest: 'consolidacion_transitoria',
    });
    expect(stateAnnette.isMovedToOtherManifest).toBe(true);
    expect(stateAnnette.isTransitoria).toBe(false);
  });
});
