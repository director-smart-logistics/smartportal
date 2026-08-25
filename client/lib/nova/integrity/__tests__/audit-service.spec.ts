// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditManifestIntegrity } from '.././audit-service';

// Mock Firestore Database
const mockDb = {
  manifests: new Map<string, any>(),
  packages: new Map<string, any[]>(),
  manifest_encomiendas: new Map<string, any[]>(),
  invoices: new Map<string, any[]>(),
};

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((collRef, id) => ({ col: collRef.name, id })),
  getDoc: vi.fn(async (ref: any) => {
    const data = mockDb.manifests.get(ref.id);
    return { exists: () => !!data, data: () => data };
  }),
  getDocs: vi.fn(async (q: any) => {
    const name = q.colName;
    const manifestId = q.manifestId;
    let list: any[] = [];
    if (name === 'packages') list = mockDb.packages.get(manifestId) || [];
    else if (name === 'manifest_encomiendas') list = mockDb.manifest_encomiendas.get(manifestId) || [];
    else if (name === 'invoices') list = mockDb.invoices.get(manifestId) || [];

    const docs = list.map(item => ({
      id: item.id || 'doc-id',
      data: () => item,
    }));
    return { docs, empty: docs.length === 0 };
  }),
  query: vi.fn((colRef, filter) => ({
    colName: colRef.name,
    manifestId: filter.value,
  })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('@/lib/services/invoice-service', () => ({
  isConsolidatedInvoice: vi.fn(() => false),
}));

describe('auditManifestIntegrity', () => {
  beforeEach(() => {
    mockDb.manifests.clear();
    mockDb.packages.clear();
    mockDb.manifest_encomiendas.clear();
    mockDb.invoices.clear();
  });

  it('should return empty report if manifestId is empty', async () => {
    const report = await auditManifestIntegrity('');
    expect(report.manifestId).toBe('');
    expect(report.issues).toEqual([]);
  });

  it('should perform parallel queries, map results correctly, and compute report', async () => {
    mockDb.manifests.set('MAN-123', {
      packages: [
        { tracking: 'TRK1', slCode: 'SL101', weight: 5, price: 10, ruta: 'Ruta 1' },
      ],
    });

    mockDb.packages.set('MAN-123', [
      { id: 'TRK1', tracking: 'TRK1', slCode: 'SL101', customerName: 'Juan Perez', ruta: 'Ruta 1' },
    ]);

    mockDb.manifest_encomiendas.set('MAN-123', [
      { id: 'ENC-1', tracking: 'TRK1', slCode: 'SL101', customerName: 'Juan Perez', ruta: 'Ruta 1' },
    ]);

    mockDb.invoices.set('MAN-123', [
      {
        id: 'INV-1',
        invoiceNumber: 'INV-1001',
        clientSlCode: 'SL101',
        status: 'paid',
        invoiceItems: [
          { trackingNumber: 'TRK1', unitPrice: 10, weight: 5 },
        ],
      },
    ]);

    const report = await auditManifestIntegrity('MAN-123');
    expect(report.manifestId).toBe('MAN-123');
    expect(report.totalRows).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it('should handle non-existent manifest doc by falling back to empty manifestPackages', async () => {
    const report = await auditManifestIntegrity('MAN-404');
    expect(report.manifestId).toBe('MAN-404');
    expect(report.totalRows).toBe(0);
  });

  it('should swallow errors during fetch and proceed with whatever is loaded', async () => {
    mockDb.manifests.set('MAN-123', {
      packages: [
        { tracking: 'TRK1', slCode: 'SL101', weight: 5, price: 10, ruta: 'Ruta 1' },
      ],
    });

    // Make getDocs reject temporarily to simulate database query failures
    const firestore = await import('firebase/firestore');
    vi.spyOn(firestore, 'getDocs').mockRejectedValueOnce(new Error('Query failed'));

    const report = await auditManifestIntegrity('MAN-123');
    expect(report.manifestId).toBe('MAN-123');
    expect(report.totalRows).toBe(1);
    expect(report.issues.length).toBeGreaterThan(0); // Should have orphan_tracking issue because invoices query failed
  });
});
