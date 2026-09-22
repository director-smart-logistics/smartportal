// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNovaResolvedRows } from '@/hooks/use-nova-resolved-rows';
import { generateInvoiceNumber, type InvoiceRecord } from '@/lib/services/invoice-service';
import type { ManifestRow } from '@/lib/services/manifest-processor';

describe('NOVA INVOICE GENERATION & REVALIDATION MATRIX', () => {
  const createRow = (overrides: Partial<ManifestRow> = {}): ManifestRow => ({
    tracking: 'TRK_' + Math.random().toString(36).substring(7).toUpperCase(),
    nombre: 'TEST CLIENT',
    peso: 1.0,
    precio: 8.0,
    slCode: 'SL100',
    nombreCliente: 'TEST CLIENT',
    ruta: 'GAM',
    consolidacion: false,
    descripcion: 'Artículos generales',
    permisos: false,
    ...overrides,
  } as unknown as ManifestRow);

  // Helper emulating Nova buildOne invoice builder
  const buildOneInvoice = (
    rowList: ManifestRow[],
    effectiveSlCode: string,
    customerContactMap: Map<string, { fullName?: string; consolidationEnabled?: boolean; dni?: string; email?: string }>,
    separateInvoices: Record<string, boolean>,
    resolvedRows: any[],
    allRows: ManifestRow[],
    priceOverrides: Record<string, { precio?: number; pesoRedondeo?: number }> = {},
    forceIndividualPricing = false
  ): InvoiceRecord => {
    const isCustomerConsolDisabled =
      customerContactMap.has(effectiveSlCode) &&
      customerContactMap.get(effectiveSlCode)?.consolidationEnabled === false;
    
    const isConsolidation =
      !forceIndividualPricing &&
      rowList.length > 1 &&
      !rowList.some((r) => r.permisos) &&
      Boolean(separateInvoices[effectiveSlCode]) &&
      !isCustomerConsolDisabled;

    const invoiceNumber = generateInvoiceNumber(effectiveSlCode, isConsolidation);

    const getItemBilling = (r: ManifestRow) => {
      const rIdx = allRows.indexOf(r);
      const tracking = String(r.tracking || '').toUpperCase();
      const resolvedRow = resolvedRows[rIdx];
      if (!resolvedRow) {
        return { billPeso: r.peso ?? 0, billPrice: 0 };
      }
      const hasOverride = priceOverrides[tracking]?.precio != null;
      const billPeso = (isConsolidation || r.permisos || hasOverride)
        ? resolvedRow.pesoRedondeo
        : resolvedRow.peso;

      return {
        billPeso,
        billPrice: resolvedRow.precio,
      };
    };

    const totalUSD = rowList.reduce((s, r) => {
      const rIdx = allRows.indexOf(r);
      return s + (resolvedRows[rIdx]?.precio ?? 0);
    }, 0);

    const isMergedSingle = rowList.length > 1 && !isConsolidation;

    return {
      id: invoiceNumber,
      userId: effectiveSlCode,
      clientId: effectiveSlCode,
      clientName: customerContactMap.get(effectiveSlCode)?.fullName || rowList[0].nombreCliente || rowList[0].nombre,
      clientDni: customerContactMap.get(effectiveSlCode)?.dni || '',
      clientEmail: customerContactMap.get(effectiveSlCode)?.email || '',
      clientRoute: 'San José, Costa Rica',
      slCode: effectiveSlCode,
      invoiceNumber,
      isConsolidation,
      isMergedSingle,
      ivaEnabled: false,
      subtotal: totalUSD,
      subtotalCRC: totalUSD * 500,
      iva: 0,
      ivaCRC: 0,
      ivaRate: 0,
      amount: totalUSD,
      currency: 'USD',
      amountCRC: totalUSD * 500,
      exchangeRate: 500,
      status: 'pending',
      items: rowList.map(r => {
        const { billPeso, billPrice } = getItemBilling(r);
        return {
          tracking: r.tracking,
          description: r.tracking || '',
          weight: billPeso,
          realWeight: r.peso ?? 0,
          subtotal: billPrice,
          iva: 0,
          amount: billPrice,
          currency: 'USD',
        };
      }),
      packageCount: rowList.length,
      totalWeight: rowList.reduce((s, r) => s + getItemBilling(r).billPeso, 0),
      notes: isConsolidation
        ? `Consolidada — ${rowList.length} paquetes`
        : rowList.length > 1
          ? `Factura única — ${rowList.length} paquetes`
          : `Paquete ${rowList[0].tracking}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. FACTURA ÚNICA VS CONSOLIDACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  describe('Non-Consolidated Multi-Package Customer (Factura Única)', () => {
    it('generates Factura Única with real unrounded weights and individual rates when customer has consolidationEnabled: false', () => {
      const rows = [
        createRow({ tracking: 'ALBERTO_1', slCode: 'SL7189', nombreCliente: 'ALBERTO FLORES', peso: 0.36, precio: 8 }),
        createRow({ tracking: 'ALBERTO_2', slCode: 'SL7189', nombreCliente: 'ALBERTO FLORES', peso: 0.84, precio: 8 }),
      ];

      const customerContactMap = new Map([
        ['SL7189', { fullName: 'ALBERTO FLORES', consolidationEnabled: false, dni: '1-2345-6789', email: 'alberto@example.com' }]
      ]);

      const separateInvoices = { SL7189: false };

      const { result: resolvedRowsHook } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: rows,
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: {},
          computedPrices: [8, 8],
          separateInvoices,
          manifestCountry: 'CR',
          manifestShipping: 'air',
          loadedFromFirestore: true,
          customerContactMap,
        })
      );

      const resolved = resolvedRowsHook.current.buildResolvedRows(rows);

      // 1. Rows in table resolve to individual prices and real weights
      expect(resolved[0].peso).toBe(0.36);
      expect(resolved[0].precio).toBe(8);
      expect(resolved[1].peso).toBe(0.84);
      expect(resolved[1].precio).toBe(8);

      // 2. Invoice buildOne
      const invoice = buildOneInvoice(rows, 'SL7189', customerContactMap, separateInvoices, resolved, rows);

      // MUST NOT be marked as consolidation
      expect(invoice.isConsolidation).toBe(false);
      expect(invoice.isMergedSingle).toBe(true);
      expect(invoice.invoiceNumber).not.toContain('-C-');
      expect(invoice.notes).toBe('Factura única — 2 paquetes');

      // Total must be exact sum of individual prices ($8 + $8 = $16)
      expect(invoice.amount).toBe(16);

      // Item weights in invoice must be real unrounded package weights (0.36kg, 0.84kg)
      expect(invoice.items[0].weight).toBe(0.36);
      expect(invoice.items[0].amount).toBe(8);
      expect(invoice.items[1].weight).toBe(0.84);
      expect(invoice.items[1].amount).toBe(8);
      expect(invoice.totalWeight).toBe(1.20);
    });

    it('generates Consolidated Invoice with ceiling weight when customer has consolidationEnabled: true and separateInvoices: true', () => {
      const rows = [
        createRow({ tracking: 'CONSOL_1', slCode: 'SL5893', nombreCliente: 'MARIA CONSOL', peso: 0.40, precio: 12 }),
        createRow({ tracking: 'CONSOL_2', slCode: 'SL5893', nombreCliente: 'MARIA CONSOL', peso: 1.68, precio: 24 }),
      ];

      const customerContactMap = new Map([
        ['SL5893', { fullName: 'MARIA CONSOL', consolidationEnabled: true, dni: '2-3456-7890', email: 'maria@example.com' }]
      ]);

      const separateInvoices = { SL5893: true };

      const { result: resolvedRowsHook } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: rows,
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: {},
          computedPrices: [12, 24],
          separateInvoices,
          manifestCountry: 'CR',
          manifestShipping: 'air',
          loadedFromFirestore: true,
          customerContactMap,
        })
      );

      const resolved = resolvedRowsHook.current.buildResolvedRows(rows);
      const invoice = buildOneInvoice(rows, 'SL5893', customerContactMap, separateInvoices, resolved, rows);

      expect(invoice.isConsolidation).toBe(true);
      expect(invoice.isMergedSingle).toBe(false);
      expect(invoice.invoiceNumber).toMatch(/-C$/);
      expect(invoice.notes).toBe('Consolidada — 2 paquetes');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. REVALIDACIÓN DE GRUPO Y REVALIDACIÓN DE TABLA COMPLETA
  // ──────────────────────────────────────────────────────────────────────────
  describe('Group and Table Revalidation Flows', () => {
    it('preserves Factura Única rules across group revalidation cycle without reverting to ceiling weight', () => {
      const rows = [
        createRow({ tracking: 'GABRIELA_1', slCode: 'SL261072', nombreCliente: 'GABRIELA NAVARRO', peso: 0.50, precio: 8 }),
        createRow({ tracking: 'GABRIELA_2', slCode: 'SL261072', nombreCliente: 'GABRIELA NAVARRO', peso: 1.10, precio: 16 }),
      ];

      const customerContactMap = new Map([
        ['SL261072', { fullName: 'GABRIELA NAVARRO', consolidationEnabled: false }]
      ]);

      const separateInvoices = { SL261072: false };
      const priceOverrides = {};

      const { result: resolvedRowsHook, rerender } = renderHook(
        (props) => useNovaResolvedRows(props),
        {
          initialProps: {
            resultDataRows: rows,
            unlinkedRows: new Set<number>(),
            slCodeOverrides: {},
            matchOverrides: {},
            rutaOverrides: {},
            nameOverrides: {},
            priceOverrides,
            computedPrices: [8, 16],
            separateInvoices,
            manifestCountry: 'CR',
            manifestShipping: 'air',
            loadedFromFirestore: true,
            customerContactMap,
          },
        }
      );

      let resolved = resolvedRowsHook.current.buildResolvedRows(rows);
      expect(resolved[0].precio).toBe(8);
      expect(resolved[1].precio).toBe(16);

      // Simulate revalidation trigger
      rerender({
        resultDataRows: rows,
        unlinkedRows: new Set<number>(),
        slCodeOverrides: {},
        matchOverrides: {},
        rutaOverrides: {},
        nameOverrides: {},
        priceOverrides: {},
        computedPrices: [8, 16],
        separateInvoices: { SL261072: false },
        manifestCountry: 'CR',
        manifestShipping: 'air',
        loadedFromFirestore: true,
        customerContactMap,
      });

      resolved = resolvedRowsHook.current.buildResolvedRows(rows);
      const postRevalidationInvoice = buildOneInvoice(rows, 'SL261072', customerContactMap, { SL261072: false }, resolved, rows);

      expect(postRevalidationInvoice.isConsolidation).toBe(false);
      expect(postRevalidationInvoice.isMergedSingle).toBe(true);
      expect(postRevalidationInvoice.amount).toBe(24);
      expect(postRevalidationInvoice.items[0].weight).toBe(0.50);
      expect(postRevalidationInvoice.items[1].weight).toBe(1.10);
      expect(postRevalidationInvoice.totalWeight).toBe(1.60);
    });

    it('processes mixed table revalidation with both consolidated and non-consolidated customers with zero cross-talk', () => {
      const allRows = [
        createRow({ tracking: 'ALBERTO_1', slCode: 'SL7189', nombreCliente: 'ALBERTO FLORES', peso: 0.40, precio: 8 }),
        createRow({ tracking: 'ALBERTO_2', slCode: 'SL7189', nombreCliente: 'ALBERTO FLORES', peso: 0.60, precio: 8 }),
        createRow({ tracking: 'MARIA_1', slCode: 'SL5893', nombreCliente: 'MARIA CONSOL', peso: 1.20, precio: 12 }),
        createRow({ tracking: 'MARIA_2', slCode: 'SL5893', nombreCliente: 'MARIA CONSOL', peso: 0.88, precio: 24 }),
      ];

      const customerContactMap = new Map([
        ['SL7189', { fullName: 'ALBERTO FLORES', consolidationEnabled: false }],
        ['SL5893', { fullName: 'MARIA CONSOL', consolidationEnabled: true }],
      ]);

      const separateInvoices = {
        SL7189: false,
        SL5893: true,
      };

      const { result: resolvedRowsHook } = renderHook(() =>
        useNovaResolvedRows({
          resultDataRows: allRows,
          unlinkedRows: new Set(),
          slCodeOverrides: {},
          matchOverrides: {},
          rutaOverrides: {},
          nameOverrides: {},
          priceOverrides: {},
          computedPrices: [8, 8, 12, 24],
          separateInvoices,
          manifestCountry: 'CR',
          manifestShipping: 'air',
          loadedFromFirestore: true,
          customerContactMap,
        })
      );

      const resolved = resolvedRowsHook.current.buildResolvedRows(allRows);

      const albertoInvoice = buildOneInvoice(allRows.slice(0, 2), 'SL7189', customerContactMap, separateInvoices, resolved, allRows);
      const mariaInvoice = buildOneInvoice(allRows.slice(2, 4), 'SL5893', customerContactMap, separateInvoices, resolved, allRows);

      // Alberto (Non-consolidated)
      expect(albertoInvoice.isConsolidation).toBe(false);
      expect(albertoInvoice.isMergedSingle).toBe(true);
      expect(albertoInvoice.amount).toBe(16);
      expect(albertoInvoice.items[0].weight).toBe(0.40);
      expect(albertoInvoice.items[1].weight).toBe(0.60);

      // Maria (Consolidated)
      expect(mariaInvoice.isConsolidation).toBe(true);
      expect(mariaInvoice.isMergedSingle).toBe(false);
      expect(mariaInvoice.invoiceNumber).toMatch(/-C$/);
    });
  });
});
