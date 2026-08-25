/**
 * NovaTableModal — Active Invoices & Returns Integration Tests
 *
 * Unit tests verifying:
 * 1. Rows with active invoices (from returned package reassignments or prior billing)
 *    are excluded from creating duplicate invoices in createInvoicesFromRows.
 * 2. Annulling an active invoice releases the lock, allowing the liberated packages
 *    to be re-calculated and re-invoiced.
 */

import { describe, it, expect, vi } from 'vitest';
import { createInvoicesFromRows } from '@/lib/services/invoice-service';
import type { ProcessedRow } from '@/hooks/use-nova-chat';

// Mock Firestore calls for createInvoicesFromRows
vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: vi.fn(() => ({ type: 'collection' })),
    query: vi.fn((col, ...args) => ({ type: 'query', col, args })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    getDocs: vi.fn(),
    addDoc: vi.fn().mockResolvedValue({ id: 'inv-new-999' }),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    doc: vi.fn(() => ({ type: 'doc' })),
    arrayUnion: vi.fn((...items) => items),
  };
});

vi.mock('@/lib/services/customer-sync', () => ({
  getCustomersBySlCodes: vi.fn().mockResolvedValue(new Map()),
}));

import { getDocs } from 'firebase/firestore';

describe('NovaTable — Active Invoices & Returns Integration', () => {
  it('skips duplicate invoice creation when an active invoice exists for the manifest', async () => {
    const rows = [
      {
        tracking: 'TRACK-RET-001',
        slCode: 'SL1001',
        nombreCliente: 'JUAN CARLOS',
        nombre: 'JUAN CARLOS',
        precio: 20,
        peso: 2,
        ruta: 'San Jose',
        invoiceId: 'inv-active-100',
        invoiceStatus: 'sent',
      },
    ] as unknown as ProcessedRow[];

    // Mock Firestore getDocs to return an existing active invoice (status: sent)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          id: 'inv-active-100',
          data: () => ({
            invoiceNumber: '10045',
            status: 'sent',
            clientSlCode: 'SL1001',
            manifestNumber: 'MAN-TARGET-01',
            totalAmountUSD: 20,
          }),
        },
      ],
      empty: false,
      forEach: function (cb: any) { this.docs.forEach(cb); },
    } as any);

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'MAN-TARGET-01',
      exchangeRate: 500,
    });

    // Should create 0 new invoices and list SL1001 under skipped
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].slCode).toBe('SL1001');
    expect(result.skipped[0].reason).toBe('protected');
  });

  it('allows new invoice creation after active invoice is annulled', async () => {
    const rows = [
      {
        tracking: 'TRACK-RET-001',
        slCode: 'SL1001',
        nombreCliente: 'JUAN CARLOS',
        nombre: 'JUAN CARLOS',
        precio: 20,
        peso: 2,
        ruta: 'San Jose',
      },
    ] as unknown as ProcessedRow[];

    // Mock Firestore getDocs returning NO active protected invoices (only annulled)
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        {
          id: 'inv-annulled-100',
          data: () => ({
            invoiceNumber: '10045',
            status: 'annulled',
            clientSlCode: 'SL1001',
            manifestNumber: 'MAN-TARGET-01',
          }),
        },
      ],
      empty: false,
      forEach: function (cb: any) { this.docs.forEach(cb); },
    } as any);

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'MAN-TARGET-01',
      exchangeRate: 500,
    });

    // Should successfully create 1 new invoice for SL1001
    expect(result.created).toHaveLength(1);
    expect(result.created[0].clientSlCode).toBe('SL1001');
    expect(result.skipped).toHaveLength(0);
  });
});
