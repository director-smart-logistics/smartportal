// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNovaPriceCalcs } from '@/hooks/use-nova-price-calcs';
import { useNovaResolvedRows } from '@/hooks/use-nova-resolved-rows';
import { buildInvoiceData } from '@/lib/services/invoice-service';
import { calculatePrice } from '@/lib/utils/pricing';
import type { ManifestRow } from '@/lib/services/manifest-processor';

describe('NOVA END-TO-END PRICING MATRIX & BUSINESS INVARIANT RIGIDITY', () => {

  const createRow = (overrides: Partial<ManifestRow> = {}): ManifestRow => ({
    tracking: 'TRK_' + Math.random().toString(36).substring(7).toUpperCase(),
    nombre: 'CLIENTE PRUEBA',
    guia: 'G-100',
    manifiesto: 'MAN-2026-TEST',
    peso: 1.0,
    precio: 0,
    slCode: 'SL100',
    nombreCliente: 'CLIENTE PRUEBA',
    ruta: 'GAM',
    consolidacion: false,
    descripcion: 'Artículos generales',
    permisos: false,
    pesoRedondeo: 1,
    diferenciaRedondeo: 0,
    pesoConsolidacion: 1,
    precioSinPermiso: 12,
    precioConPermiso: 15,
    matchScore: 1,
    originalData: {},
    ...overrides,
  } as ManifestRow);

  // ──────────────────────────────────────────────────────────────────────────
  // ESCENARIO 1: GRUPO MIXTO (DUA + PAQUETE PEQUEÑO + PAQUETE GRANDE)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Escenario 1: Grupo Mixto con DUA y Paquetes Cobrables', () => {
    const duaRow = createRow({
      tracking: 'TRK_DUA_001',
      slCode: 'SL2045',
      nombreCliente: 'Marta Fernández',
      peso: 0.0,
      precio: 0,
      descripcion: 'Retenido en aduana - DUA pendiente',
    });

    const smallRow = createRow({
      tracking: 'TRK_SMALL_002',
      slCode: 'SL2045',
      nombreCliente: 'Marta Fernández',
      peso: 0.45,
      precio: 0,
      descripcion: 'Blusa de seda',
    });

    const mediumRow = createRow({
      tracking: 'TRK_MED_003',
      slCode: 'SL2045',
      nombreCliente: 'Marta Fernández',
      peso: 1.55,
      precio: 0,
      descripcion: 'Zapatos de cuero',
    });

    const mixedRows = [duaRow, smallRow, mediumRow];

    it('A. Facturación Individual: DUA es $0.00, pequeño es $8.00 y mediano es $24.00 (Total $32.00 = ₡16,000)', () => {
      const exchangeRate = '500';

      const { result: priceCalcs } = renderHook(() =>
        useNovaPriceCalcs({
          resultDataRows: mixedRows,
          manifestCountry: 'usa',
          manifestShipping: 'air',
          exchangeRate,
          priceOverrides: {},
          setPriceOverrides: vi.fn(),
          loadedFromFirestore: true,
        })
      );

      const p1 = priceCalcs.current.getEffectivePrice(0, duaRow);
      const p2 = priceCalcs.current.getEffectivePrice(1, smallRow);
      const p3 = priceCalcs.current.getEffectivePrice(2, mediumRow);

      expect(p1).toBe(0);   // DUA stays $0.00
      expect(p2).toBe(8);   // 0.45kg -> $8.00
      expect(p3).toBe(24);  // 1.55kg -> $24.00 (1kg $12 + 550g $12)

      const totalUSD = p1 + p2 + p3;
      expect(totalUSD).toBe(32);

      // Invoice generation for this individual group
      const groupData = {
        slCode: 'SL2045',
        userId: 'SL2045',
        clientName: 'Marta Fernández',
        clientEmail: 'marta@example.com',
        clientDni: '1-1111-2222',
        clientRoute: 'GAM',
        isMergedSingle: true,
        rows: mixedRows,
      };

      const invoice = buildInvoiceData(groupData as any, false, 500, 'MAN-2026-TEST');
      expect(invoice.items.length).toBe(3);
      expect(invoice.items[0].amount).toBe(0); // DUA
      expect(invoice.items[1].amount).toBe(8); // Small
      expect(invoice.items[2].amount).toBe(24); // Med
      expect(invoice.amount).toBe(32);
      expect(invoice.amountCRC).toBe(16000);
    });

    it('B. DUA con tarifa manual de desalmacenaje: El operador asigna $40.00 y se suma con precisión', () => {
      const priceOverrides = {
        TRK_DUA_001: { precio: 40.0, pesoRedondeo: 0 },
      };

      const { result: priceCalcs } = renderHook(() =>
        useNovaPriceCalcs({
          resultDataRows: mixedRows,
          manifestCountry: 'usa',
          manifestShipping: 'air',
          exchangeRate: '500',
          priceOverrides,
          setPriceOverrides: vi.fn(),
          loadedFromFirestore: true,
        })
      );

      const p1 = priceCalcs.current.getEffectivePrice(0, duaRow);
      const p2 = priceCalcs.current.getEffectivePrice(1, smallRow);
      const p3 = priceCalcs.current.getEffectivePrice(2, mediumRow);

      expect(p1).toBe(40); // Manual DUA fee
      expect(p2).toBe(8);
      expect(p3).toBe(24);
      expect(p1 + p2 + p3).toBe(72); // 40 + 8 + 24 = $72.00
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ESCENARIO 2: AJUSTE DE PRECIO PORCENTUAL Y FIJO (SUPERVISOR / OPERADOR)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Escenario 2: Ajuste de Precios y Descuentos Preservados', () => {
    it('aplica 50% de descuento sobre paquete de 3.5kg ($48 -> $24) y preserva justificación', () => {
      const row = createRow({
        tracking: 'TRK_DISCOUNT_50',
        peso: 3.5, // 3.5kg USA Air regular = $48.00
        precio: 0,
        ajustePrecio: {
          precioAjustado: 24,
          precioCalculado: 48,
          breakdownCalculo: '50% por reclamo de daño menor',
          justificacion: 'Reclamo aprobado por gerencia',
          ajustadoPor: 'supervisor',
          ajustadoPorEmail: 'supervisor@smartlogistics.com',
          fechaAjuste: '2026-08-19T10:00:00Z',
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
          priceOverrides: { TRK_DISCOUNT_50: { precio: 24, pesoRedondeo: 3.5 } },
          computedPrices: [48],
          separateInvoices: {},
          manifestCountry: 'usa',
          manifestShipping: 'air',
          loadedFromFirestore: true,
          priceAdjustments: { TRK_DISCOUNT_50: row.ajustePrecio! },
        })
      );

      const tableRows = resolvedRows.current.buildResolvedRows([row]);
      expect(tableRows[0].precio).toBe(24);
      expect(tableRows[0].ajustePrecio?.justificacion).toBe('Reclamo aprobado por gerencia');
      expect(tableRows[0].ajustePrecio?.precioCalculado).toBe(48);
      expect(tableRows[0].ajustePrecio?.precioAjustado).toBe(24);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ESCENARIO 3: CONSOLIDACIÓN DE PESO (CEILING) VS FACTURA ÚNICA (SUM OF ROWS)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Escenario 3: Consolidación vs Factura Única (Merged Single)', () => {
    // 3 paquetes: 0.3kg ($8 individual), 0.4kg ($8 individual), 0.5kg ($12 individual)
    const pA = createRow({ tracking: 'P_A', slCode: 'SL990', peso: 0.3, precio: 0 });
    const pB = createRow({ tracking: 'P_B', slCode: 'SL990', peso: 0.4, precio: 0 });
    const pC = createRow({ tracking: 'P_C', slCode: 'SL990', peso: 0.5, precio: 0 });
    const clientRows = [pA, pB, pC];

    it('Factura Única (isMergedSingle=true): Suma tarifas individuales ($8 + $8 + $12 = $28.00)', () => {
      const groupData = {
        slCode: 'SL990',
        userId: 'SL990',
        clientName: 'Consolidated Test Client',
        clientEmail: 'test@example.com',
        clientDni: '1-1111-3333',
        clientRoute: 'Central',
        isMergedSingle: true,
        rows: clientRows,
      };

      const invoice = buildInvoiceData(groupData as any, false, 500, 'MAN-2026-TEST');
      expect(invoice.items.length).toBe(3);
      expect(invoice.items[0].amount).toBe(8);
      expect(invoice.items[1].amount).toBe(8);
      expect(invoice.items[2].amount).toBe(12);
      expect(invoice.amount).toBe(28); // 8 + 8 + 12 = $28.00
      expect(invoice.amountCRC).toBe(14000);
    });

    it('Consolidación Real: Suma pesos (0.3 + 0.4 + 0.5 = 1.2kg), aplica ceil (2.0kg) -> Tarifa $24.00', () => {
      const sumWeight = 0.3 + 0.4 + 0.5; // 1.2kg
      const consolidatedWeight = Math.ceil(sumWeight); // 2.0kg
      const consolidatedCost = calculatePrice(consolidatedWeight, 'usa', 'air').price;

      expect(sumWeight).toBe(1.2);
      expect(consolidatedWeight).toBe(2);
      expect(consolidatedCost).toBe(24); // 2kg USA Air = $24.00

      // Proportional distribution across packages:
      const shareA = Math.round((0.3 / sumWeight) * consolidatedCost * 100) / 100; // 6.00
      const shareB = Math.round((0.4 / sumWeight) * consolidatedCost * 100) / 100; // 8.00
      const shareC = Math.round((0.5 / sumWeight) * consolidatedCost * 100) / 100; // 10.00

      expect(shareA).toBe(6);
      expect(shareB).toBe(8);
      expect(shareC).toBe(10);
      expect(shareA + shareB + shareC).toBe(24);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ESCENARIO 4: ARTÍCULOS CON PERMISO DE SALUD ($12/kg entero + $3 cargo)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Escenario 4: Artículos con Permiso de Salud', () => {
    it('calcula tarifa de permiso: ceil(peso) × $12 + $3 fee para medicamentos y cosméticos', () => {
      const permitRow = createRow({
        tracking: 'TRK_PERMIT_MEDS',
        peso: 1.20, // ceil(1.2) = 2kg × $12 = $24 + $3 fee = $27.00
        precio: 0,
        permisos: true,
        descripcion: 'Suplementos vitamínicos y cremas',
      });

      const res = calculatePrice(permitRow.peso, 'usa', 'air', 'regular', true);
      expect(res.price).toBe(27); // $24 + $3 = $27.00
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ESCENARIO 5: MULTI-ORIGEN (USA, CHINA, COLOMBIA, MÉXICO)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Escenario 5: Multi-Origen de Paquetería', () => {
    it('China Aéreo: Aplica $20/kg exacto sin redondeo arbitrario', () => {
      const p1 = calculatePrice(0.8, 'china', 'air').price;
      const p2 = calculatePrice(2.5, 'china', 'air').price;

      expect(p1).toBe(16); // 0.8 * 20 = $16.00
      expect(p2).toBe(50); // 2.5 * 20 = $50.00
    });

    it('Colombia Aéreo: Aplica $12/kg exacto', () => {
      const p = calculatePrice(3.2, 'colombia', 'air').price;
      expect(p).toBe(38.4); // 3.2 * 12 = $38.40
    });

    it('México Aéreo: Aplica $16/kg exacto', () => {
      const p = calculatePrice(1.5, 'mexico', 'air').price;
      expect(p).toBe(24); // 1.5 * 16 = $24.00
    });
  });

});
