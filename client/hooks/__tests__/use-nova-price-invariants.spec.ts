// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNovaPriceCalcs } from '../use-nova-price-calcs';
import { useNovaResolvedRows } from '../use-nova-resolved-rows';
import { buildInvoiceData } from '@/lib/services/invoice-service';
import { calculatePrice } from '@/lib/utils/pricing';
import type { ManifestRow } from '@/lib/services/manifest-processor';

describe('EXHAUSTIVE PRICE INVARIANTS & MATHEMATICAL ZERO-PRICE LOCK', () => {

  const createRow = (overrides: Partial<ManifestRow> = {}): ManifestRow => ({
    tracking: 'TRACK_' + Math.random().toString(36).substring(7),
    nombre: 'TEST CLIENT',
    peso: 1.0,
    precio: 0, // Poisoned 0 in Firestore
    slCode: 'SL100',
    nombreCliente: 'TEST CLIENT',
    ruta: 'Central',
    consolidacion: false,
    descripcion: 'General Goods',
    permisos: false,
    ...overrides,
  } as unknown as ManifestRow);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. MATHEMATICAL TIER TESTS: USA AIR EXACT TIERS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Mathematical Tier Calculations (USA Air)', () => {
    const testCases: Array<{ weight: number; expected: number; label: string }> = [
      { weight: 0.01, expected: 8, label: '0.01kg -> minimum tier 0-499g = $8' },
      { weight: 0.25, expected: 8, label: '0.25kg (250g) -> 0-499g = $8' },
      { weight: 0.499, expected: 8, label: '0.499kg (499g threshold) -> $8' },
      { weight: 0.50, expected: 12, label: '0.50kg (500g threshold) -> 500g-1kg = $12' },
      { weight: 0.75, expected: 12, label: '0.75kg (750g) -> 500g-1kg = $12' },
      { weight: 0.999, expected: 12, label: '0.999kg -> 500g-1kg = $12' },
      { weight: 1.00, expected: 12, label: '1.00kg -> 500g-1kg = $12' },
      { weight: 1.01, expected: 20, label: '1.01kg (1kg + 10g fraction) -> 12 + 8 = $20' },
      { weight: 1.30, expected: 20, label: '1.30kg (1kg + 300g fraction) -> 12 + 8 = $20' },
      { weight: 1.49, expected: 20, label: '1.49kg (1kg + 490g fraction) -> 12 + 8 = $20' },
      { weight: 1.50, expected: 24, label: '1.50kg (1kg + 500g fraction) -> 12 + 12 = $24' },
      { weight: 1.75, expected: 24, label: '1.75kg (1kg + 750g fraction) -> 12 + 12 = $24' },
      { weight: 2.00, expected: 24, label: '2.00kg -> 2kg × 12 = $24' },
      { weight: 2.12, expected: 32, label: '2.12kg (2kg + 120g fraction) -> 24 + 8 = $32' },
      { weight: 2.50, expected: 36, label: '2.50kg (2kg + 500g fraction) -> 24 + 12 = $36' },
      { weight: 3.00, expected: 36, label: '3.00kg -> 3kg × 12 = $36' },
      { weight: 3.50, expected: 48, label: '3.50kg (3kg + 500g fraction) -> 36 + 12 = $48' },
      { weight: 5.00, expected: 60, label: '5.00kg -> 5kg × 12 = $60' },
      { weight: 10.00, expected: 120, label: '10.00kg -> 10kg × 12 = $120' },
      { weight: 50.00, expected: 600, label: '50.00kg -> 50kg × 12 = $600' },
    ];

    testCases.forEach(({ weight, expected, label }) => {
      it(`calculates exact penny-for-penny price for ${label}`, () => {
        const row = createRow({ peso: weight, precio: 0 });
        const { result } = renderHook(() =>
          useNovaPriceCalcs({
            resultDataRows: [row],
            manifestCountry: 'usa',
            manifestShipping: 'air',
            exchangeRate: '500',
            priceOverrides: {},
            setPriceOverrides: vi.fn(),
            loadedFromFirestore: true,
          })
        );

        const price = result.current.getEffectivePrice(0, row);
        expect(price).toBe(expected);
        expect(price).toBeGreaterThan(0);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MULTI-COUNTRY & SHIPPING MODALITIES MATHEMATICAL VALIDATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('Multi-Country Mathematical Validation', () => {
    it('China Air: $20/kg exact calculation', () => {
      const row1 = createRow({ peso: 0.8, precio: 0 }); // 0.8kg * 20 = $16
      const row2 = createRow({ peso: 2.3, precio: 0 }); // 2.3kg * 20 = $46

      const price1 = calculatePrice(row1.peso, 'china', 'air').price;
      const price2 = calculatePrice(row2.peso, 'china', 'air').price;

      expect(price1).toBe(16);
      expect(price2).toBe(46);
    });

    it('Mexico Air: $16/kg exact calculation', () => {
      const row1 = createRow({ peso: 0.5, precio: 0 }); // 0.5kg * 16 = $8
      const row2 = createRow({ peso: 3.1, precio: 0 }); // 3.1kg * 16 = $49.60

      const price1 = calculatePrice(row1.peso, 'mexico', 'air').price;
      const price2 = calculatePrice(row2.peso, 'mexico', 'air').price;

      expect(price1).toBe(8);
      expect(price2).toBe(49.6);
    });

    it('Colombia Air: $12/kg exact calculation', () => {
      const row1 = createRow({ peso: 0.9, precio: 0 }); // 0.9kg * 12 = $10.80
      const row2 = createRow({ peso: 4.2, precio: 0 }); // 4.2kg * 12 = $50.40

      const price1 = calculatePrice(row1.peso, 'colombia', 'air').price;
      const price2 = calculatePrice(row2.peso, 'colombia', 'air').price;

      expect(price1).toBe(10.8);
      expect(price2).toBe(50.4);
    });

    it('Permits: USA Air with permit rounds up to whole kg × $12 plus $3 fee', () => {
      // USA Air with permit: 1.4kg -> ceil(1.4) = 2kg × $12 = $24 + $3 permit surcharge = $27
      const res = calculatePrice(1.4, 'usa', 'air', 'regular', true);
      expect(res.price).toBe(27);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CORRUPT / POISONED VALUES MATRIX LOCK
  // ──────────────────────────────────────────────────────────────────────────
  describe('Corrupt Values Matrix Lock (Zero-Price Invariant)', () => {
    const poisonedValues = [
      { val: 0, desc: 'numeric 0' },
      { val: -1, desc: 'negative -1' },
      { val: -100, desc: 'negative -100' },
      { val: null as any, desc: 'null' },
      { val: undefined as any, desc: 'undefined' },
      { val: NaN as any, desc: 'NaN' },
      { val: '' as any, desc: 'empty string' },
    ];

    poisonedValues.forEach(({ val, desc }) => {
      it(`never resolves to <= 0 when precio is poisoned with ${desc}`, () => {
        const row = createRow({ peso: 1.5, precio: val });

        const { result } = renderHook(() =>
          useNovaPriceCalcs({
            resultDataRows: [row],
            manifestCountry: 'usa',
            manifestShipping: 'air',
            exchangeRate: '500',
            priceOverrides: {},
            setPriceOverrides: vi.fn(),
            loadedFromFirestore: true,
          })
        );

        const price = result.current.getEffectivePrice(0, row);
        expect(price).toBe(24);
        expect(price).toBeGreaterThan(0);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CONSOLIDATION MATHEMATICAL INVARIANTS IN INVOICING
  // ──────────────────────────────────────────────────────────────────────────
  describe('Consolidation Mathematical Invariants', () => {
    it('under consolidation, builds grouped invoices with exact proportional items summing to total', () => {
      // 3 packages for the same client: 0.3kg, 0.4kg, 0.5kg -> Sum = 1.2kg
      // Total grouped cost: 0.46kg -> $8, 0.85kg -> $12, 1.50kg -> $24, 2.10kg -> $32
      const group = {
        slCode: 'SL777',
        userId: 'SL777',
        clientName: 'CONSOLIDATED CLIENT',
        clientEmail: 'client@example.com',
        clientDni: '1-1111-1111',
        clientRoute: 'Central',
        isMergedSingle: false,
        rows: [
          createRow({ tracking: 'T1', slCode: 'SL777', peso: 0.46, precio: 0 }),
          createRow({ tracking: 'T2', slCode: 'SL777', peso: 1.50, precio: 0 }),
          createRow({ tracking: 'T3', slCode: 'SL777', peso: 2.10, precio: 0 }),
        ],
      };

      const invoice = buildInvoiceData(group as any, false, 500, 'ENC-MEGA-MAN-17-08-2026');

      expect(invoice.items.length).toBe(3);
      expect(invoice.items[0].amount).toBe(8);
      expect(invoice.items[1].amount).toBe(24);
      expect(invoice.items[2].amount).toBe(32);

      // Invariant: sum of item amounts MUST equal exact total amount $64.00
      expect(invoice.amount).toBe(64);
      expect(invoice.amountCRC).toBe(32000);

      // Invariant: NO item can be 0
      invoice.items.forEach(item => {
        expect(item.amount).toBeGreaterThan(0);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. OPERATOR OVERRIDES AND ADJUSTMENTS PRESERVATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('Operator Overrides and Adjustments Preservation', () => {
    it('preserves operator manual price overrides with highest priority', () => {
      const row = createRow({ tracking: 'CUSTOM_TRK', peso: 5.0, precio: 0 });

      const { result } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: [row],
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: { CUSTOM_TRK: { precio: 15.50, pesoRedondeo: 5 } },
          computedPrices: [60],
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          loadedFromFirestore: true,
        })
      );

      const resolved = result.current.buildResolvedRows([row]);
      expect(resolved[0].precio).toBe(15.50);
      expect(resolved[0].pesoRedondeo).toBe(5);
    });

    it('preserves structured price adjustments (ajustePrecio)', () => {
      const row = createRow({
        tracking: 'DISCOUNT_TRK',
        peso: 2.0,
        precio: 0,
        ajustePrecio: {
          precioAjustado: 12,
          precioCalculado: 24,
          breakdownCalculo: '50% desc',
          justificacion: 'Promo Navidad',
          ajustadoPor: 'supervisor',
          ajustadoPorEmail: 'admin@smartlogistics.com',
          fechaAjuste: '2026-08-19T00:00:00Z',
          tipo: 'inferior',
        },
      });

      const { result } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: [row],
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: { DISCOUNT_TRK: { precio: 12, pesoRedondeo: 2 } },
          computedPrices: [24],
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          loadedFromFirestore: true,
          priceAdjustments: { DISCOUNT_TRK: row.ajustePrecio! },
        })
      );

      const resolved = result.current.buildResolvedRows([row]);
      expect(resolved[0].precio).toBe(12);
      expect(resolved[0].ajustePrecio?.justificacion).toBe('Promo Navidad');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. INVOICE GENERATION STRICT MATHEMATICAL AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  describe('Invoice Service Strict Mathematical Audit', () => {
    it('buildInvoiceData calculates all items with exact non-zero prices, USD total, and CRC conversion', () => {
      const group = {
        slCode: 'SL999',
        userId: 'SL999',
        clientName: 'VIP CLIENT',
        clientEmail: 'vip@example.com',
        clientDni: '1-2345-6789',
        clientRoute: 'San Jose',
        isMergedSingle: true,
        rows: [
          createRow({ tracking: 'TRK_A', peso: 0.46, precio: 0 }), // 0.46kg -> $8
          createRow({ tracking: 'TRK_B', peso: 0.85, precio: 0 }), // 0.85kg -> $12
          createRow({ tracking: 'TRK_C', peso: 1.50, precio: 0 }), // 1.50kg -> $24
          createRow({ tracking: 'TRK_D', peso: 2.10, precio: 0 }), // 2.10kg -> $32
        ],
      };

      const exchangeRate = 515; // ₡515 per USD
      const invoice = buildInvoiceData(group as any, false, exchangeRate, 'ENC-MEGA-MAN-17-08-2026');

      expect(invoice.items.length).toBe(4);

      // Verify each individual item amount
      expect(invoice.items[0].amount).toBe(8);
      expect(invoice.items[1].amount).toBe(12);
      expect(invoice.items[2].amount).toBe(24);
      expect(invoice.items[3].amount).toBe(32);

      // Strict Mathematical Subtotal: 8 + 12 + 24 + 32 = $76.00
      expect(invoice.amount).toBe(76);

      // Strict Mathematical CRC Total: $76 * 515 = ₡39,140
      expect(invoice.amountCRC).toBe(39140);

      // Verify no item has amount <= 0
      invoice.items.forEach((item, idx) => {
        expect(item.amount).toBeGreaterThan(0);
        expect(typeof item.amount).toBe('number');
        expect(isNaN(item.amount)).toBe(false);
      });
    });
  });

});
