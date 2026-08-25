/**
 * sync-invoices-service.spec.ts
 *
 * Regression tests for the SP1 → SP2 invoice sync preview/categorisation.
 *
 * ─── Why these tests exist ────────────────────────────────────────────────────
 *  Bug: operators selected invoices in `Borrador` (draft) status and clicked
 *  "Sincronizar". The modal said "Sincronización completada" with 0/0/0
 *  because the sync guard inside `syncInvoicesToSp2` silently filters drafts,
 *  but the preview classified them as eligible and the modal advanced through
 *  the confirm/verify steps.
 *
 *  Fix: `previewSyncInvoices` now returns a third bucket — `nonSyncable` —
 *  that surfaces drafts upfront so the modal can warn and disable the action.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { previewSyncInvoices, syncInvoicePackagesToSp2 } from '.././sync-invoices-service';
import type { InvoiceRecord } from '@/lib/services/invoice-service';

// ── Firebase mocks (must be declared before any service import) ────────────────
vi.mock('@/lib/firebase', () => ({ db: {}, app: {} }));
vi.mock('../../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  getFirestore:    vi.fn(() => ({})),
  collection:      vi.fn(() => 'col-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'inv-doc-id' }),
  getDocs:         vi.fn(),
  getDoc:          vi.fn(),
  query:           vi.fn(() => 'query-ref'),
  where:           vi.fn(),
  serverTimestamp: vi.fn(() => 'mock-ts'),
  deleteDoc:       vi.fn().mockResolvedValue(undefined),
  updateDoc:       vi.fn().mockResolvedValue(undefined),
  deleteField:     vi.fn(() => 'mock-delete-field'),
  arrayUnion:      vi.fn((...args) => args),
  writeBatch:      vi.fn(() => ({ commit: vi.fn().mockResolvedValue(undefined) })),
  doc:             vi.fn(() => 'doc-ref'),
}));

vi.mock('.././sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn().mockResolvedValue({ success: true }),
}));

import { getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { syncPackagesToSmartWeb } from '.././sync-smartweb-service';

function inv(overrides: Partial<InvoiceRecord> & Record<string, any> = {}): InvoiceRecord {
  return {
    id:            overrides.id            ?? 'inv-1',
    invoiceNumber: overrides.invoiceNumber ?? 'INV-001',
    clientName:    overrides.clientName    ?? 'JUAN PEREZ',
    clientEmail:   '',
    amount:        100,
    subtotal:      100,
    iva:           0,
    ivaRate:       0,
    ivaEnabled:    false,
    currency:      'USD',
    status:        overrides.status ?? 'sent',
    items:         [],
    createdAt:     new Date().toISOString(),
    ...overrides,
  } as unknown as InvoiceRecord;
}

describe('previewSyncInvoices — bucketing', () => {
  it('classifies draft invoices as nonSyncable, never eligible', () => {
    const invoices = [
      inv({ id: 'a', status: 'draft', slCode: 'SL66' } as any),
      inv({ id: 'b', status: 'draft' } as any),
    ];
    const out = previewSyncInvoices(invoices);
    expect(out.nonSyncable).toHaveLength(2);
    expect(out.eligible).toHaveLength(0);
    expect(out.noSlCode).toHaveLength(0);
  });

  it('classifies non-draft with slCode as eligible', () => {
    const invoices = [inv({ id: 'a', status: 'sent', slCode: 'SL66' } as any)];
    const out = previewSyncInvoices(invoices);
    expect(out.eligible).toHaveLength(1);
    expect(out.noSlCode).toHaveLength(0);
    expect(out.nonSyncable).toHaveLength(0);
  });

  it('classifies non-draft without slCode as noSlCode', () => {
    const invoices = [inv({ id: 'a', status: 'sent' } as any)];
    const out = previewSyncInvoices(invoices);
    expect(out.noSlCode).toHaveLength(1);
    expect(out.eligible).toHaveLength(0);
    expect(out.nonSyncable).toHaveLength(0);
  });

  it('falls back to clientSlCode when slCode is absent', () => {
    const invoices = [inv({ id: 'a', status: 'paid', clientSlCode: 'SL77' } as any)];
    const out = previewSyncInvoices(invoices);
    expect(out.eligible).toHaveLength(1);
    expect(out.noSlCode).toHaveLength(0);
  });

  it('treats whitespace-only slCode as missing', () => {
    const invoices = [inv({ id: 'a', status: 'sent', slCode: '   ' } as any)];
    const out = previewSyncInvoices(invoices);
    expect(out.noSlCode).toHaveLength(1);
    expect(out.eligible).toHaveLength(0);
  });

  it('handles a mixed batch correctly', () => {
    const invoices = [
      inv({ id: 'a', status: 'draft', slCode: 'SL1' } as any),  // nonSyncable (draft beats slCode)
      inv({ id: 'b', status: 'sent',  slCode: 'SL2' } as any),  // eligible
      inv({ id: 'c', status: 'paid'  } as any),                 // noSlCode
      inv({ id: 'd', status: 'draft' } as any),                 // nonSyncable
      inv({ id: 'e', status: 'paid', clientSlCode: 'SL3' } as any), // eligible (via clientSlCode)
      inv({ id: 'f', status: 'annulled', clientSlCode: 'SL4' } as any), // nonSyncable (annulled beats clientSlCode)
    ];
    const out = previewSyncInvoices(invoices);
    expect(out.nonSyncable.map(i => i.id)).toEqual(['a', 'd', 'f']);
    expect(out.eligible.map(i => i.id)).toEqual(['b', 'e']);
    expect(out.noSlCode.map(i => i.id)).toEqual(['c']);
  });

  it('returns three empty arrays for an empty input', () => {
    const out = previewSyncInvoices([]);
    expect(out.eligible).toEqual([]);
    expect(out.noSlCode).toEqual([]);
    expect(out.nonSyncable).toEqual([]);
  });
});

describe('syncInvoicePackagesToSp2 — regression guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only updates and syncs packages whose invoiceId matches the invoice.id', async () => {
    const mockPackagesDocs = [
      {
        id: 'pkg-matched',
        data: () => ({
          trackingNumber: 'TRK-MATCHED',
          status: 'consolidated',
          invoiceId: 'target-inv-id',
        }),
      },
      {
        id: 'pkg-mismatch',
        data: () => ({
          trackingNumber: 'TRK-MISMATCH',
          status: 'consolidated',
          invoiceId: 'different-inv-id',
        }),
      },
      {
        id: 'pkg-unlinked',
        data: () => ({
          trackingNumber: 'TRK-UNLINKED',
          status: 'consolidated',
          invoiceId: null,
        }),
      },
    ];

    vi.mocked(getDocs).mockResolvedValue({
      forEach: (callback: any) => mockPackagesDocs.forEach(callback),
      docs: mockPackagesDocs,
    } as any);

    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        manifestNumber: 'M-123',
        ruta: 'Retira',
      }),
    } as any);

    const testInvoice = {
      id: 'target-inv-id',
      invoiceNumber: 'INV-123',
      slCode: 'SL-XYZ',
      clientName: 'Test Client',
      items: [
        { tracking: 'TRK-MATCHED' },
        { tracking: 'TRK-MISMATCH' },
        { tracking: 'TRK-UNLINKED' },
      ],
    };

    await syncInvoicePackagesToSp2(testInvoice, 'on_route');

    // Should only call updateDoc for pkg-matched, since the others do not match target-inv-id
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith('doc-ref', expect.objectContaining({
      status: 'on_route',
    }));

    // Should only call syncPackagesToSmartWeb for pkg-matched
    expect(syncPackagesToSmartWeb).toHaveBeenCalledTimes(1);
    expect(syncPackagesToSmartWeb).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'pkg-matched',
        trackingNumber: 'TRK-MATCHED',
        status: 'on_route',
      }),
    ]);
  });
});
