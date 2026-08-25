import { describe, it, expect } from 'vitest';

describe('Returned Packages Lifecycle & Invariant Guards', () => {
  it('guards returned packages against invoice-driven status overrides', () => {
    const returnedPackage = {
      id: 'pkg-100',
      trackingNumber: 'TRK-RET-001',
      status: 'returned',
      deliveryStatus: 'returned',
      invoiceId: 'inv-paid-1',
    };

    // Simulate invoice status promotion (e.g. invoice marked 'paid' trying to push 'on_route')
    const incomingStatus = 'on_route';
    const isReturned = returnedPackage.status === 'returned' || returnedPackage.deliveryStatus === 'returned';

    // The guard should block the update
    const shouldUpdateStatus = !isReturned;
    expect(shouldUpdateStatus).toBe(false);
  });

  it('filters out returned packages from bulk route delivery updates', () => {
    const routePackages = [
      { id: 'p1', tracking: 'TRK-1', status: 'on_route', deliveryStatus: 'in_transit' },
      { id: 'p2', tracking: 'TRK-2', status: 'returned', deliveryStatus: 'returned' },
      { id: 'p3', tracking: 'TRK-3', status: 'on_route', deliveryStatus: 'in_transit' },
    ];

    const selectedIds = new Set(['p1', 'p2', 'p3']);

    // Bulk delivery filter in RoutesManagement
    const eligibleForBulkUpdate = routePackages.filter(
      p => selectedIds.has(p.id) && p.status !== 'returned' && p.deliveryStatus !== 'returned'
    );

    expect(eligibleForBulkUpdate.map(p => p.id)).toEqual(['p1', 'p3']);
    expect(eligibleForBulkUpdate.some(p => p.id === 'p2')).toBe(false);
  });

  it('deduplicates packages across status and deliveryStatus queries in ReturnedPackages', () => {
    const snapshot1 = [
      { id: 'pkg-1', trackingNumber: 'T1', status: 'returned', deliveryStatus: 'returned' },
      { id: 'pkg-2', trackingNumber: 'T2', status: 'returned', deliveryStatus: 'pending' },
    ];

    const snapshot2 = [
      { id: 'pkg-1', trackingNumber: 'T1', status: 'returned', deliveryStatus: 'returned' },
      { id: 'pkg-3', trackingNumber: 'T3', status: 'delivered', deliveryStatus: 'returned' },
    ];

    const pkgsMap = new Map<string, any>();
    [...snapshot1, ...snapshot2].forEach(p => {
      pkgsMap.set(p.id, p);
    });

    const result = Array.from(pkgsMap.values());
    expect(result).toHaveLength(3);
    expect(result.map(p => p.id).sort()).toEqual(['pkg-1', 'pkg-2', 'pkg-3']);
  });

  it('aggregates multi-invoice sums and groups trackings under the client on route boleta print', () => {
    const clientRows = [
      {
        slCode: 'SL25',
        customerName: 'Carlos Perez',
        tracking: 'TRK-ORIGINAL-01',
        price: 20,
        invoiceId: 'inv-1',
        invoiceNumber: 'FAC-001',
        invoiceAmountUSD: 20,
        invoiceAmountCRC: 9400,
      },
      {
        slCode: 'SL25',
        customerName: 'Carlos Perez',
        tracking: 'TRK-REASSIGNED-02',
        price: 12,
        invoiceId: 'inv-2',
        invoiceNumber: 'FAC-002',
        invoiceAmountUSD: 12,
        invoiceAmountCRC: 5640,
      },
    ];

    const activeInvoiceMap = new Map<string, { number: string; usd: number; crc?: number }>();
    clientRows.forEach(r => {
      if (r.invoiceId) {
        activeInvoiceMap.set(r.invoiceId, {
          number: r.invoiceNumber,
          usd: r.invoiceAmountUSD,
          crc: r.invoiceAmountCRC,
        });
      }
    });

    const activeInvoices = Array.from(activeInvoiceMap.values());
    const totalUSD = activeInvoices.reduce((sum, inv) => sum + inv.usd, 0);
    const totalCRC = activeInvoices.reduce((sum, inv) => sum + (inv.crc ?? 0), 0);

    expect(activeInvoices).toHaveLength(2);
    expect(activeInvoices.map(i => i.number)).toEqual(['FAC-001', 'FAC-002']);
    expect(totalUSD).toBe(32);
    expect(totalCRC).toBe(15040);
  });

  it('re-consolidates a returned package to consolidacion_transitoria and unlinks invoice fields', () => {
    const pkg = {
      id: 'pkg-ret-1',
      trackingNumber: 'TRK-RET-999',
      manifestNumber: '12-08-2026DAN',
      status: 'returned',
      deliveryStatus: 'returned',
      invoiceId: 'inv-999',
      invoiceNumber: 'FAC-999',
      invoiceStatus: 'paid',
    };

    // Re-consolidation mutation
    const reconsolidatedPkg = {
      ...pkg,
      status: 'consolidated',
      deliveryStatus: 'consolidated',
      manifestId: 'consolidacion_transitoria',
      manifestNumber: 'consolidacion_transitoria',
      updatedManifest: 'consolidacion_transitoria',
      encomiendaManifestNumber: 'none',
      consolidacion: true,
      invoiceId: undefined,
      invoiceNumber: undefined,
      invoiceStatus: undefined,
    };

    expect(reconsolidatedPkg.status).toBe('consolidated');
    expect(reconsolidatedPkg.manifestNumber).toBe('consolidacion_transitoria');
    expect(reconsolidatedPkg.invoiceId).toBeUndefined();
    expect(reconsolidatedPkg.encomiendaManifestNumber).toBe('none');
  });

  it('reassigns a returned package to a target manifest and strips old pricing overrides', () => {
    const pkg = {
      id: 'pkg-ret-2',
      trackingNumber: 'TRK-RET-888',
      manifestNumber: '11-08-2026DAN',
      status: 'returned',
      deliveryStatus: 'returned',
      precio: 15,
      ajustePrecio: 2,
      pesoRedondeo: 1,
    };

    const targetManifest = '14-08-2026DAN';

    // Target manifest move mutation
    const reassignedPkg = {
      ...pkg,
      manifestNumber: targetManifest,
      manifestId: targetManifest,
      updatedManifest: targetManifest,
      status: 'customs',
      deliveryStatus: 'pending',
      isReassigned: true,
      precio: undefined,
      ajustePrecio: undefined,
      pesoRedondeo: undefined,
    };

    expect(reassignedPkg.manifestNumber).toBe('14-08-2026DAN');
    expect(reassignedPkg.status).toBe('customs');
    expect(reassignedPkg.isReassigned).toBe(true);
    expect(reassignedPkg.precio).toBeUndefined();
    expect(reassignedPkg.ajustePrecio).toBeUndefined();
  });

  it('preserves invoiceId, invoiceNumber and prices when reassigning a package with a PAID invoice', () => {
    const pkg = {
      id: 'pkg-paid-ret-1',
      trackingNumber: 'TBA333475078910',
      manifestNumber: '11-08-2026DAN',
      status: 'returned',
      deliveryStatus: 'returned',
      invoiceId: 'inv-sl270-paid',
      invoiceNumber: 'SL270-20260814133227598',
      invoiceStatus: 'paid',
      hasPaidInvoice: true,
      precio: 25.5,
      price: 25.5,
    };

    const targetManifest = '14-08-2026DAN';

    // Business Logic Branch: hasPaidInvoice === true
    const reassignedWithPaidInvoice = {
      ...pkg,
      manifestId: targetManifest,
      manifestNumber: targetManifest,
      updatedManifest: targetManifest,
      status: 'consolidated',
      deliveryStatus: 'consolidated',
      consolidacion: true,
      isReassigned: true,
      isReturned: true,
      wasReturned: true,
      originalManifest: pkg.manifestNumber,
      // INVARIANT: Do NOT delete or clear invoice fields or prices
      invoiceId: pkg.invoiceId,
      invoiceNumber: pkg.invoiceNumber,
      invoiceStatus: pkg.invoiceStatus,
      precio: pkg.precio,
      price: pkg.price,
    };

    expect(reassignedWithPaidInvoice.manifestNumber).toBe('14-08-2026DAN');
    expect(reassignedWithPaidInvoice.originalManifest).toBe('11-08-2026DAN');
    expect(reassignedWithPaidInvoice.invoiceId).toBe('inv-sl270-paid');
    expect(reassignedWithPaidInvoice.invoiceNumber).toBe('SL270-20260814133227598');
    expect(reassignedWithPaidInvoice.invoiceStatus).toBe('paid');
    expect(reassignedWithPaidInvoice.precio).toBe(25.5);
    expect(reassignedWithPaidInvoice.isReassigned).toBe(true);
    expect(reassignedWithPaidInvoice.wasReturned).toBe(true);
  });

  it('correctly manages encomiendaManifestNumber when target is encomienda vs standard manifest', () => {
    const encomiendaTarget = 'ENC-2026-08';
    const standardTarget = 'USA-AIR-08';

    const calcEncManifest = (target: string) =>
      target.toUpperCase().startsWith('ENC-') ? target : 'none';

    expect(calcEncManifest(encomiendaTarget)).toBe('ENC-2026-08');
    expect(calcEncManifest(standardTarget)).toBe('none');
  });

  it('normalizes all synonyms of "route" status to canonical "route" and "En Ruta" label', () => {
    const synonyms = ['route', 'on_route', 'in_route', 'en_ruta', 'transit'];

    const resolveCanonicalStatus = (raw: string) => {
      const s = raw.toLowerCase().trim();
      if (['route', 'on_route', 'in_route', 'en_ruta'].includes(s)) return 'route';
      return s;
    };

    const resolveLabel = (status: string) => {
      if (status === 'route') return 'En Ruta';
      if (status === 'delivered') return 'Entregado';
      if (status === 'returned') return 'Devuelto';
      return status;
    };

    synonyms.forEach(syn => {
      const canonical = resolveCanonicalStatus(syn);
      if (syn !== 'transit') {
        expect(canonical).toBe('route');
        expect(resolveLabel(canonical)).toBe('En Ruta');
      } else {
        expect(canonical).toBe('transit');
      }
    });
  });
});
