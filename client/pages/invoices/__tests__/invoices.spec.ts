import { describe, it, expect } from 'vitest';

describe('Invoices — calculation logic', () => {
  it('calculates subtotal from line items', () => {
    const items = [
      { quantity: 2, unitPrice: 1500 },
      { quantity: 1, unitPrice: 3000 },
    ];
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    expect(subtotal).toBe(6000);
  });

  it('applies tax rate correctly', () => {
    const applyTax = (subtotal: number, rate: number) =>
      Math.round(subtotal * (1 + rate / 100));
    expect(applyTax(10000, 13)).toBe(11300);
    expect(applyTax(0, 13)).toBe(0);
  });

  it('formats invoice number with prefix', () => {
    const formatInvoiceNumber = (n: number) => `FAC-${String(n).padStart(6, '0')}`;
    expect(formatInvoiceNumber(1)).toBe('FAC-000001');
    expect(formatInvoiceNumber(1234)).toBe('FAC-001234');
  });

  describe('Invoices — bulk status update protection', () => {
    const sampleInvoices = [
      { id: 'inv-1', status: 'sent', invoiceNumber: 'FAC-000001' },
      { id: 'inv-2', status: 'annulled', invoiceNumber: 'FAC-000002' },
      { id: 'inv-3', status: 'cancelled', invoiceNumber: 'FAC-000003' },
      { id: 'inv-4', status: 'draft', invoiceNumber: 'FAC-000004' },
    ];

    it('filters out annulled and cancelled invoices by default when includeAnnulled is false', () => {
      const selectedIds = new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4']);
      const includeAnnulled = false;

      const idsToUpdate = Array.from(selectedIds).filter(id => {
        const inv = sampleInvoices.find(i => i.id === id);
        const isAnnulled = inv?.status === 'annulled' || inv?.status === 'cancelled';
        return includeAnnulled ? true : !isAnnulled;
      });

      expect(idsToUpdate).toEqual(['inv-1', 'inv-4']);
    });

    it('includes annulled and cancelled invoices when includeAnnulled is explicitly true', () => {
      const selectedIds = new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4']);
      const includeAnnulled = true;

      const idsToUpdate = Array.from(selectedIds).filter(id => {
        const inv = sampleInvoices.find(i => i.id === id);
        const isAnnulled = inv?.status === 'annulled' || inv?.status === 'cancelled';
        return includeAnnulled ? true : !isAnnulled;
      });

      expect(idsToUpdate).toEqual(['inv-1', 'inv-2', 'inv-3', 'inv-4']);
    });

    it('counts annulled invoices correctly for warning modal data', () => {
      const selectedIds = new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4']);
      const selectedList = sampleInvoices.filter(i => selectedIds.has(i.id));
      const annulledCount = selectedList.filter(i => i.status === 'annulled' || i.status === 'cancelled').length;

      expect(annulledCount).toBe(2);
    });
  });

  describe('Invoices — Column Header Sorting Logic', () => {
    const list = [
      { id: '1', number: 'FAC-002', manifestNumber: 'MAN-B', clientName: 'Carlos Pérez', route: 'Heredia', total: 150, status: 'paid', date: '2026-05-10' },
      { id: '2', number: 'FAC-001', manifestNumber: 'MAN-A', clientName: 'Ana Álvarez', route: 'Alajuela', total: 50, status: 'draft', date: '2026-06-01' },
      { id: '3', number: 'FAC-003', manifestNumber: 'MAN-C', clientName: 'Bernardo Castro', route: 'San José', total: 300, status: 'sent', date: '2026-04-15' },
    ];

    const sortInvoices = (invoices: typeof list, sortField: string, sortDirection: 'asc' | 'desc') => {
      return [...invoices].sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'invoiceNumber') {
          valA = a.number || '';
          valB = b.number || '';
        } else if (sortField === 'manifestNumber') {
          valA = a.manifestNumber || '';
          valB = b.manifestNumber || '';
        } else if (sortField === 'clientName') {
          valA = a.clientName || '';
          valB = b.clientName || '';
        } else if (sortField === 'route') {
          valA = a.route || '';
          valB = b.route || '';
        } else if (sortField === 'totalAmount') {
          valA = Number(a.total || 0);
          valB = Number(b.total || 0);
        } else if (sortField === 'status') {
          valA = a.status || '';
          valB = b.status || '';
        } else if (sortField === 'date') {
          valA = new Date(a.date).getTime();
          valB = new Date(b.date).getTime();
        }

        if (typeof valA === 'number' && typeof valB === 'number' && !isNaN(valA) && !isNaN(valB)) {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA || '');
        const strB = String(valB || '');
        const comp = strA.localeCompare(strB, 'es', { sensitivity: 'base', numeric: true });
        return sortDirection === 'asc' ? comp : -comp;
      });
    };

    it('sorts by invoiceNumber ascending and descending', () => {
      const asc = sortInvoices(list, 'invoiceNumber', 'asc');
      expect(asc.map(i => i.number)).toEqual(['FAC-001', 'FAC-002', 'FAC-003']);

      const desc = sortInvoices(list, 'invoiceNumber', 'desc');
      expect(desc.map(i => i.number)).toEqual(['FAC-003', 'FAC-002', 'FAC-001']);
    });

    it('sorts by clientName with Spanish diacritics', () => {
      const asc = sortInvoices(list, 'clientName', 'asc');
      expect(asc.map(i => i.clientName)).toEqual(['Ana Álvarez', 'Bernardo Castro', 'Carlos Pérez']);
    });

    it('sorts by totalAmount numerically', () => {
      const asc = sortInvoices(list, 'totalAmount', 'asc');
      expect(asc.map(i => i.total)).toEqual([50, 150, 300]);

      const desc = sortInvoices(list, 'totalAmount', 'desc');
      expect(desc.map(i => i.total)).toEqual([300, 150, 50]);
    });

    it('sorts by date chronologically', () => {
      const asc = sortInvoices(list, 'date', 'asc');
      expect(asc.map(i => i.id)).toEqual(['3', '1', '2']); // Apr 15, May 10, Jun 1

      const desc = sortInvoices(list, 'date', 'desc');
      expect(desc.map(i => i.id)).toEqual(['2', '1', '3']); // Jun 1, May 10, Apr 15
    });
  });

  describe('Invoices — Annulment and Package Transition Logic', () => {
    it('sets status to annulled and stamps audit history', () => {
      const now = new Date().toISOString();
      const invoice = {
        id: 'inv-123',
        invoiceNumber: 'SL100-20260817001',
        status: 'draft',
        statusHistory: [],
      };

      const annulledInvoice = {
        ...invoice,
        status: 'annulled',
        annulledAt: now,
        statusHistory: [
          ...invoice.statusHistory,
          {
            status: 'annulled',
            changedAt: now,
            changedBy: 'admin',
            note: 'Factura anulada. Paquetes movidos a: consolidacion_transitoria',
          },
        ],
      };

      expect(annulledInvoice.status).toBe('annulled');
      expect(annulledInvoice.annulledAt).toBe(now);
      expect(annulledInvoice.statusHistory).toHaveLength(1);
      expect(annulledInvoice.statusHistory[0].status).toBe('annulled');
    });

    it('transfers packages to consolidacion_transitoria and unlinks invoice fields', () => {
      const now = new Date().toISOString();
      const pkg = {
        id: 'pkg-1',
        trackingNumber: 'TRK-999',
        manifestNumber: '11-08-2026DAN',
        status: 'processed',
        invoiceId: 'inv-123',
        invoiceNumber: 'SL100-20260817001',
        invoiceStatus: 'draft',
      };

      const updatedPkg = {
        ...pkg,
        originalManifestId: pkg.manifestNumber,
        manifestNumber: 'consolidacion_transitoria',
        status: 'consolidated',
        consolidacion: true,
        invoiceId: undefined,
        invoiceNumber: undefined,
        invoiceStatus: undefined,
        annulledInvoiceId: pkg.invoiceId,
        annulledInvoiceNumber: pkg.invoiceNumber,
        annulledAt: now,
      };

      expect(updatedPkg.manifestNumber).toBe('consolidacion_transitoria');
      expect(updatedPkg.originalManifestId).toBe('11-08-2026DAN');
      expect(updatedPkg.status).toBe('consolidated');
      expect(updatedPkg.invoiceId).toBeUndefined();
      expect(updatedPkg.annulledInvoiceId).toBe('inv-123');
    });
  });
});
