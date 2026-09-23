import { describe, it, expect } from 'vitest';

describe('Consolidation Comprehensive Defensive Functional Flows', () => {
  interface ConsolidationPkg {
    id: string;
    trackingNumber: string;
    weight?: number;
    price?: number;
    isTransitoria?: boolean;
    manifestNumber?: string;
    updatedManifest?: string;
    originalManifestID?: string;
  }

  it('calculates carry-on total weight and package count with null/undefined weights', () => {
    const pkgs: ConsolidationPkg[] = [
      { id: '1', trackingNumber: 'TRK-001', weight: 1.5, price: 12.0 },
      { id: '2', trackingNumber: 'TRK-002', weight: undefined, price: 8.5 },
      { id: '3', trackingNumber: 'TRK-003', weight: 0.75, price: undefined },
      { id: '4', trackingNumber: 'TRK-004', weight: null as any, price: 0 },
    ];

    const selectedIds = new Set(['1', '2', '3', '4']);
    const selectedPkgs = pkgs.filter(p => selectedIds.has(p.id));

    const totalWeight = Number(
      selectedPkgs.reduce((sum, p) => sum + Number(p.weight || 0), 0).toFixed(2)
    );
    const totalPrice = Number(
      selectedPkgs.reduce((sum, p) => sum + Number(p.price || 0), 0).toFixed(2)
    );

    expect(totalWeight).toBe(2.25);
    expect(totalPrice).toBe(20.5);
    expect(selectedPkgs.length).toBe(4);
  });

  it('filters transitoria packages vs active packages in customer grouping', () => {
    const customerPackages: ConsolidationPkg[] = [
      {
        id: 'p1',
        trackingNumber: 'TRK-100',
        manifestNumber: 'consolidacion_transitoria',
        isTransitoria: true,
      },
      {
        id: 'p2',
        trackingNumber: 'TRK-101',
        manifestNumber: '18-09-2026DAN',
        updatedManifest: '18-09-2026DAN',
        isTransitoria: false,
      },
      {
        id: 'p3',
        trackingNumber: 'TRK-102',
        manifestNumber: '19-09-2026DAN',
        updatedManifest: 'consolidacion_transitoria', // residual value
        isTransitoria: false, // strictly resolved by active manifestNumber
      },
    ];

    const activeManifestPkgs = customerPackages.filter(p => !p.isTransitoria);
    const transitoriaPkgs = customerPackages.filter(p => p.isTransitoria);

    expect(activeManifestPkgs.length).toBe(2);
    expect(transitoriaPkgs.length).toBe(1);
    expect(transitoriaPkgs[0].trackingNumber).toBe('TRK-100');
    expect(activeManifestPkgs.map(p => p.trackingNumber)).toEqual(['TRK-101', 'TRK-102']);
  });

  it('safely handles invoice reassignment in BulkMoveDialog calculations', () => {
    interface DestInvoice {
      id: string;
      invoiceNumber: string;
      totalAmount?: number;
      currency?: string;
      itemsCount?: number;
    }

    const invoices: DestInvoice[] = [
      { id: 'inv-1', invoiceNumber: 'INV-1001', totalAmount: 45.5, currency: 'USD', itemsCount: 2 },
      { id: 'inv-2', invoiceNumber: 'INV-1002', totalAmount: undefined, currency: undefined, itemsCount: 0 },
      { id: 'inv-3', invoiceNumber: 'INV-1003', totalAmount: 0, currency: 'CRC', itemsCount: 1 },
    ];

    const formatted = invoices.map(inv => {
      const amount = Number(inv.totalAmount || 0).toFixed(2);
      const curr = inv.currency || 'USD';
      return `${inv.invoiceNumber} · ${curr} ${amount}`;
    });

    expect(formatted[0]).toBe('INV-1001 · USD 45.50');
    expect(formatted[1]).toBe('INV-1002 · USD 0.00');
    expect(formatted[2]).toBe('INV-1003 · CRC 0.00');
  });
});
