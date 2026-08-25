// Pure-helper tests for the TC update service.
//
// The service's Firestore orchestration path is exercised by integration
// tests (it batches writes against a live emulator). Here we lock down
// the math helpers that drive the whole thing — if these drift, every
// invoice CRC in the database goes wrong the next time the operator
// clicks "Actualizar tipo de cambio".

import { describe, expect, it } from 'vitest';
import {
  recomputeInvoiceCRC,
  recomputePackageCostCRC,
} from '../update-exchange-rate-service';

describe('recomputePackageCostCRC', () => {
  it('returns rounded cost * rate for positive numeric inputs', () => {
    expect(recomputePackageCostCRC(10, 475)).toBe(4750);
    expect(recomputePackageCostCRC(12.5, 475)).toBe(5938); // 5937.5 → 5938 (half-away-from-zero via Math.round)
    expect(recomputePackageCostCRC(1.33, 487)).toBe(648); // 647.71 → 648
  });

  it('returns 0 for non-numeric / non-positive cost', () => {
    expect(recomputePackageCostCRC(0, 475)).toBe(0);
    expect(recomputePackageCostCRC(-5, 475)).toBe(0);
    expect(recomputePackageCostCRC(null, 475)).toBe(0);
    expect(recomputePackageCostCRC(undefined, 475)).toBe(0);
    expect(recomputePackageCostCRC('abc', 475)).toBe(0);
    expect(recomputePackageCostCRC(Number.NaN, 475)).toBe(0);
  });

  it('returns 0 for non-positive rate (safety against bad input)', () => {
    expect(recomputePackageCostCRC(10, 0)).toBe(0);
    expect(recomputePackageCostCRC(10, -475)).toBe(0);
    expect(recomputePackageCostCRC(10, Number.NaN)).toBe(0);
  });

  it('coerces numeric strings (legacy docs sometimes stringify prices)', () => {
    expect(recomputePackageCostCRC('10', 475)).toBe(4750);
    expect(recomputePackageCostCRC('12.5', 475)).toBe(5938);
  });
});

describe('recomputeInvoiceCRC', () => {
  it('no-IVA: amountCRC = round(usd * rate), subtotalCRC = amountCRC, ivaCRC = 0', () => {
    const out = recomputeInvoiceCRC({ amount: 100, ivaEnabled: false }, 475);
    expect(out).toEqual({ amountCRC: 47500, subtotalCRC: 47500, ivaCRC: 0 });
  });

  it('with-IVA: splits amountCRC into subtotal (÷1.13) and tax', () => {
    const out = recomputeInvoiceCRC({ amount: 100, ivaEnabled: true }, 475);
    // 100 * 475 = 47500 ; 47500 / 1.13 = 42035.4 → 42035 ; iva = 47500-42035 = 5465
    expect(out).toEqual({ amountCRC: 47500, subtotalCRC: 42035, ivaCRC: 5465 });
    // Invariant: subtotal + iva must equal total (no IEEE-754 gap)
    expect(out.subtotalCRC + out.ivaCRC).toBe(out.amountCRC);
  });

  it('prefers totalAmount over amount when both are present', () => {
    const out = recomputeInvoiceCRC(
      { amount: 50, totalAmount: 100, ivaEnabled: false },
      475,
    );
    expect(out.amountCRC).toBe(47500);
  });

  it('returns zeros when the invoice has no usable USD value', () => {
    const zero = { amountCRC: 0, subtotalCRC: 0, ivaCRC: 0 };
    expect(recomputeInvoiceCRC({}, 475)).toEqual(zero);
    expect(recomputeInvoiceCRC({ amount: 0 }, 475)).toEqual(zero);
    expect(recomputeInvoiceCRC({ amount: -5 }, 475)).toEqual(zero);
    expect(recomputeInvoiceCRC({ amount: Number.NaN }, 475)).toEqual(zero);
  });

  it('returns zeros when the rate is non-positive', () => {
    const zero = { amountCRC: 0, subtotalCRC: 0, ivaCRC: 0 };
    expect(recomputeInvoiceCRC({ amount: 100 }, 0)).toEqual(zero);
    expect(recomputeInvoiceCRC({ amount: 100 }, -475)).toEqual(zero);
    expect(recomputeInvoiceCRC({ amount: 100 }, Number.NaN)).toEqual(zero);
  });

  it('is idempotent: applying the same rate twice returns the same CRC triplet', () => {
    const inv = { amount: 123.45, ivaEnabled: true };
    const first = recomputeInvoiceCRC(inv, 475);
    // Simulate "re-running" after the first update — the USD amount did
    // NOT change, only the CRC representation. Re-running with the same
    // rate should produce identical numbers.
    const second = recomputeInvoiceCRC(inv, 475);
    expect(first).toEqual(second);
  });

  it('handles the realistic TC correction case: ₡495 → ₡475 drop', () => {
    const inv = { amount: 200, ivaEnabled: false };
    const before = recomputeInvoiceCRC(inv, 495);
    const after = recomputeInvoiceCRC(inv, 475);
    expect(before.amountCRC).toBe(99000);
    expect(after.amountCRC).toBe(95000);
    // Delta: 4000 colones less per $200 at the corrected rate — this is
    // exactly what the operator expects to see propagate on every doc.
    expect(before.amountCRC - after.amountCRC).toBe(4000);
  });
});
