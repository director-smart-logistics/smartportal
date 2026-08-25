// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNovaPriceCalcs } from '@/hooks/use-nova-price-calcs';
import { useNovaResolvedRows } from '@/hooks/use-nova-resolved-rows';
import { buildInvoiceData } from '@/lib/services/invoice-service';
import type { ManifestRow } from '@/lib/services/manifest-processor';

describe('NOVA RIGID GROUP CALCULATIONS, TABLE DATA & PRICE ADJUSTMENT MATRIX', () => {

  const createRow = (overrides: Partial<ManifestRow> = {}): ManifestRow => ({
    tracking: 'TRK_' + Math.random().toString(36).substring(7).toUpperCase(),
    nombre: 'TEST CLIENT',
    peso: 1.0,
    precio: 0,
    slCode: 'SL100',
    nombreCliente: 'TEST CLIENT',
    ruta: 'GAM',
    consolidacion: false,
    descripcion: 'Artículos generales',
    permisos: false,
    ...overrides,
  } as unknown as ManifestRow);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CÁLCULO DE GRUPOS SIMPLES Y MÚLTIPLES (TOTALES PESO, USD Y CRC)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Group Aggregations (Weight, USD, CRC)', () => {
    it('calculates single-package group metrics with exact exchange rate conversion', () => {
      const row = createRow({ tracking: 'TRK_SINGLE', peso: 1.5, precio: 0 });
      const exchangeRate = '500';

      const { result: priceCalcs } = renderHook(() =>
        useNovaPriceCalcs({
          resultDataRows: [row],
          manifestCountry: 'usa',
          manifestShipping: 'air',
          exchangeRate,
          priceOverrides: {},
          setPriceOverrides: vi.fn(),
          loadedFromFirestore: true,
        })
      );

      const resolvedPrice = priceCalcs.current.getEffectivePrice(0, row);
      const totalUSD = resolvedPrice;
      const totalCRC = totalUSD * (parseFloat(exchangeRate) || 0);

      expect(row.peso).toBe(1.5);
      expect(resolvedPrice).toBe(24); // 1.5kg USA Air = $24
      expect(totalUSD).toBe(24);
      expect(totalCRC).toBe(12000); // $24 * ₡500 = ₡12,000
    });

    it('calculates multi-package group metrics (3 packages) with exact sum and CRC conversion', () => {
      const rows = [
        createRow({ tracking: 'TRK_1', slCode: 'SL200', peso: 0.46, precio: 0 }),
        createRow({ tracking: 'TRK_2', slCode: 'SL200', peso: 1.20, precio: 0 }),
        createRow({ tracking: 'TRK_3', slCode: 'SL200', peso: 2.50, precio: 0 }),
      ];
      const exchangeRate = '520';

      const { result: priceCalcs } = renderHook(() =>
        useNovaPriceCalcs({
          resultDataRows: rows,
          manifestCountry: 'usa',
          manifestShipping: 'air',
          exchangeRate,
          priceOverrides: {},
          setPriceOverrides: vi.fn(),
          loadedFromFirestore: true,
        })
      );

      const p1 = priceCalcs.current.getEffectivePrice(0, rows[0]);
      const p2 = priceCalcs.current.getEffectivePrice(1, rows[1]);
      const p3 = priceCalcs.current.getEffectivePrice(2, rows[2]);

      expect(p1).toBe(8);   // 0.46kg -> $8
      expect(p2).toBe(20);  // 1.20kg -> $20
      expect(p3).toBe(36);  // 2.50kg -> $36

      const totalWeight = Math.round((rows[0].peso + rows[1].peso + rows[2].peso) * 100) / 100;
      const totalUSD = p1 + p2 + p3;
      const totalCRC = totalUSD * 520;

      expect(totalWeight).toBe(4.16);
      expect(totalUSD).toBe(64); // 8 + 20 + 36 = 64
      expect(totalCRC).toBe(33280); // $64 * ₡520 = ₡33,280
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. AJUSTE MANUAL DE PRECIOS Y DESCUENTOS (priceOverrides & ajustePrecio)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Price Adjustment Flows (Manual Overrides & Structured Adjustments)', () => {
    it('honors fixed manual price override and updates group metrics accordingly', () => {
      const rowA = createRow({ tracking: 'TRK_OVERRIDE_A', peso: 2.0, precio: 0 });
      const rowB = createRow({ tracking: 'TRK_OVERRIDE_B', peso: 1.0, precio: 0 });
      const rows = [rowA, rowB];

      // Operator sets custom price of $15.00 for Row A (normally $24)
      const priceOverrides = {
        TRK_OVERRIDE_A: { precio: 15.0, pesoRedondeo: 2.0 },
      };

      const { result: priceCalcs } = renderHook(() =>
        useNovaPriceCalcs({
          resultDataRows: rows,
          manifestCountry: 'usa',
          manifestShipping: 'air',
          exchangeRate: '500',
          priceOverrides,
          setPriceOverrides: vi.fn(),
          loadedFromFirestore: true,
        })
      );

      const pA = priceCalcs.current.getEffectivePrice(0, rowA);
      const pB = priceCalcs.current.getEffectivePrice(1, rowB);

      expect(pA).toBe(15.0); // Manual override respected
      expect(pB).toBe(12.0); // Normal calculated rate
      expect(pA + pB).toBe(27.0); // Total USD: 15 + 12 = 27
    });

    it('honors percentage discount adjustment (ajustePrecio) and preserves metadata', () => {
      const row = createRow({
        tracking: 'TRK_DISCOUNT',
        peso: 2.0, // Normal price = $24
        precio: 0,
        ajustePrecio: {
          precioAjustado: 12,
          precioCalculado: 24,
          breakdownCalculo: '50% desc',
          justificacion: 'Demora en aduana',
          ajustadoPor: 'supervisor',
          ajustadoPorEmail: 'supervisor@smartlogistics.com',
          fechaAjuste: '2026-08-19T08:00:00Z',
          tipo: 'inferior',
        },
      });

      const { result: resolvedRows } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: [row],
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: { TRK_DISCOUNT: { precio: 12, pesoRedondeo: 2 } },
          computedPrices: [24],
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          loadedFromFirestore: true,
          priceAdjustments: { TRK_DISCOUNT: row.ajustePrecio! },
        })
      );

      const resolved = resolvedRows.current.buildResolvedRows([row]);
      expect(resolved[0].precio).toBe(12);
      expect(resolved[0].ajustePrecio?.justificacion).toBe('Demora en aduana');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. RECUPERACIÓN Y RESOLUCIÓN DE DATOS EN TABLA (POISONED FIRESTORE ROWS)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Table Display Resolution for Poisoned Firestore Rows', () => {
    it('guarantees that 4 poisoned rows with precio: 0 display correct non-zero prices in table', () => {
      const poisonedRows = [
        createRow({ tracking: 'KENYI_1', slCode: 'SL301', nombreCliente: 'Kenyi Cantillo', peso: 0.85, precio: 0 }),
        createRow({ tracking: 'KENYI_2', slCode: 'SL301', nombreCliente: 'Kenyi Cantillo', peso: 1.40, precio: 0 }),
        createRow({ tracking: 'MILENA_1', slCode: 'SL302', nombreCliente: 'Milena Torres', peso: 2.00, precio: 0 }),
        createRow({ tracking: 'MILENA_2', slCode: 'SL302', nombreCliente: 'Milena Torres', peso: 3.10, precio: 0 }),
      ];

      const { result: resolvedRows } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: poisonedRows,
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: {},
          computedPrices: [12, 20, 24, 36],
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          loadedFromFirestore: true,
        })
      );

      const tableRows = resolvedRows.current.buildResolvedRows(poisonedRows);

      // Verify each table row data
      expect(tableRows[0].precio).toBe(12); // 0.85kg -> $12
      expect(tableRows[1].precio).toBe(20); // 1.40kg -> $20
      expect(tableRows[2].precio).toBe(24); // 2.00kg -> $24
      expect(tableRows[3].precio).toBe(36); // 3.10kg -> $36

      // Verify client assignments
      expect(tableRows[0].slCode).toBe('SL301');
      expect(tableRows[1].slCode).toBe('SL301');
      expect(tableRows[2].slCode).toBe('SL302');
      expect(tableRows[3].slCode).toBe('SL302');

      // Verify total table amount
      const tableTotalUSD = tableRows.reduce((sum, r) => sum + (r.precio || 0), 0);
      expect(tableTotalUSD).toBe(92); // 12 + 20 + 24 + 36 = $92
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. SEPARACIÓN DE FACTURAS (SEPARATE INVOICES TOGGLE)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Separate Invoices Toggle Flow', () => {
    it('isolates separate invoice package into its own invoice data structure', () => {
      const row1 = createRow({ tracking: 'TRK_NORMAL', slCode: 'SL500', peso: 1.0, precio: 0 });
      const row2 = createRow({ tracking: 'TRK_SEPARATE', slCode: 'SL500', peso: 2.0, precio: 0 });

      // Group for normal row
      const normalGroup = {
        slCode: 'SL500',
        userId: 'SL500',
        clientName: 'SEPARATE TEST',
        clientEmail: 'sep@example.com',
        clientDni: '123',
        clientRoute: 'GAM',
        isMergedSingle: false,
        rows: [row1],
      };

      // Group for separate row
      const separateGroup = {
        slCode: 'SL500',
        userId: 'SL500',
        clientName: 'SEPARATE TEST',
        clientEmail: 'sep@example.com',
        clientDni: '123',
        clientRoute: 'GAM',
        isMergedSingle: false,
        rows: [row2],
      };

      const invoiceNormal = buildInvoiceData(normalGroup as any, false, 500, 'MAN-TEST');
      const invoiceSeparate = buildInvoiceData(separateGroup as any, false, 500, 'MAN-TEST');

      expect(invoiceNormal.items.length).toBe(1);
      expect(invoiceNormal.amount).toBe(12); // 1.0kg -> $12
      expect(invoiceNormal.amountCRC).toBe(6000);

      expect(invoiceSeparate.items.length).toBe(1);
      expect(invoiceSeparate.amount).toBe(24); // 2.0kg -> $24
      expect(invoiceSeparate.amountCRC).toBe(12000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. TIPO DE CAMBIO DINÁMICO (₡470, ₡500, ₡515, ₡530)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Dynamic Exchange Rate Conversions', () => {
    const exchangeRates = [470, 500, 515, 530];

    exchangeRates.forEach(rate => {
      it(`calculates exact CRC total for exchange rate ₡${rate}`, () => {
        const group = {
          slCode: 'SL600',
          userId: 'SL600',
          clientName: 'EXCHANGE TEST',
          clientEmail: 'ex@example.com',
          clientDni: '123',
          clientRoute: 'GAM',
          isMergedSingle: true,
          rows: [
            createRow({ tracking: 'TRK_EX_1', peso: 1.0, precio: 0 }), // $12
            createRow({ tracking: 'TRK_EX_2', peso: 2.0, precio: 0 }), // $24
          ],
        };

        const invoice = buildInvoiceData(group as any, false, rate, 'MAN-RATE-TEST');
        const expectedUSD = 36;
        const expectedCRC = 36 * rate;

        expect(invoice.amount).toBe(expectedUSD);
        expect(invoice.amountCRC).toBe(expectedCRC);
      });
    });
  });

});
