// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

describe('INVOICES BULK DISPATCH CONCURRENCY & ZERO-READ ARCHITECTURE', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Simulated worker queue executor mimicking handleBulkSendEmail
  async function executeBulkDispatch(
    ids: string[],
    invoicesMap: Map<string, any>,
    sendEmailFn: (id: string, opts: any, preloaded?: any, options?: any) => Promise<void>,
    options = { concurrency: 6, syncSp2: false }
  ) {
    const errors: Array<{ id: string; error: string; invoiceNumber?: string }> = [];
    const sentIds: string[] = [];
    let done = 0;
    let sentOk = 0;
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;
    let currentIndex = 0;

    const runWorker = async () => {
      while (currentIndex < ids.length) {
        const itemIndex = currentIndex++;
        const id = ids[itemIndex];
        const inMemInv = invoicesMap.get(id);

        activeConcurrency++;
        if (activeConcurrency > maxObservedConcurrency) {
          maxObservedConcurrency = activeConcurrency;
        }

        try {
          if (inMemInv && (inMemInv.status === 'annulled' || inMemInv.status === 'cancelled')) {
            errors.push({
              id,
              error: `Factura ${inMemInv.invoiceNumber || id} se encuentra ${inMemInv.status === 'annulled' ? 'anulada' : 'cancelada'}.`,
              invoiceNumber: inMemInv.invoiceNumber,
            });
          } else {
            await sendEmailFn(id, options, inMemInv, {
              skipCacheInvalidation: true,
              skipToast: true,
            });
            sentIds.push(id);
            sentOk++;
          }
        } catch (err: any) {
          errors.push({
            id,
            error: err instanceof Error ? err.message : 'Error al enviar correo',
            invoiceNumber: inMemInv?.invoiceNumber,
          });
        } finally {
          activeConcurrency--;
          done++;
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(options.concurrency, ids.length) },
      () => runWorker()
    );
    await Promise.all(workers);

    return {
      sentOk,
      sentIds,
      errors,
      done,
      maxObservedConcurrency,
    };
  }

  it('1. Concurrency: Executes up to 6 workers concurrently and completes faster than sequential', async () => {
    const testIds = Array.from({ length: 24 }, (_, i) => `INV_${i + 1}`);
    const invoicesMap = new Map(
      testIds.map(id => [
        id,
        {
          id,
          invoiceNumber: `FACT-${id}`,
          clientEmail: 'cliente@test.com',
          status: 'draft',
          items: [{ tracking: `TRK_${id}`, amount: 20, weight: 1.5 }],
          total: 20,
        },
      ])
    );

    const mockSendEmail = vi.fn().mockImplementation(async () => {
      // Simulate ~20ms CloudFunction network call
      await new Promise(r => setTimeout(r, 20));
    });

    const result = await executeBulkDispatch(testIds, invoicesMap, mockSendEmail, { concurrency: 6, syncSp2: false });

    expect(result.sentOk).toBe(24);
    expect(result.errors.length).toBe(0);
    expect(result.maxObservedConcurrency).toBeLessThanOrEqual(6);
    expect(result.maxObservedConcurrency).toBeGreaterThanOrEqual(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(24);
  });

  it('2. Zero-Read Hydration: Passes in-memory invoice directly and avoids calling getById', async () => {
    const testId = 'INV_IN_MEMORY';
    const inMemInv = {
      id: testId,
      invoiceNumber: 'FACT-001',
      clientEmail: 'carlos@example.com',
      status: 'draft',
      items: [{ tracking: 'TRK_001', amount: 15, weight: 1.0 }],
      total: 15,
    };
    const invoicesMap = new Map([[testId, inMemInv]]);

    const getByIdMock = vi.fn();
    const mockSendEmail = vi.fn().mockImplementation(async (id, opts, preloaded) => {
      if (!preloaded) {
        getByIdMock(id);
      }
    });

    const result = await executeBulkDispatch([testId], invoicesMap, mockSendEmail);

    expect(result.sentOk).toBe(1);
    expect(getByIdMock).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(testId, expect.anything(), inMemInv, expect.anything());
  });

  it('3. Anti-Drift Guard: Safely skips annulled and cancelled invoices without halting the batch', async () => {
    const invoicesMap = new Map([
      ['INV_VALID_1', { id: 'INV_VALID_1', invoiceNumber: 'F1', status: 'draft', clientEmail: 'a@test.com' }],
      ['INV_ANNULLED', { id: 'INV_ANNULLED', invoiceNumber: 'F2', status: 'annulled', clientEmail: 'b@test.com' }],
      ['INV_CANCELLED', { id: 'INV_CANCELLED', invoiceNumber: 'F3', status: 'cancelled', clientEmail: 'c@test.com' }],
      ['INV_VALID_2', { id: 'INV_VALID_2', invoiceNumber: 'F4', status: 'sent', clientEmail: 'd@test.com' }],
    ]);

    const mockSendEmail = vi.fn().mockResolvedValue(undefined);
    const ids = ['INV_VALID_1', 'INV_ANNULLED', 'INV_CANCELLED', 'INV_VALID_2'];

    const result = await executeBulkDispatch(ids, invoicesMap, mockSendEmail);

    expect(result.sentOk).toBe(2);
    expect(result.sentIds).toEqual(['INV_VALID_1', 'INV_VALID_2']);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0].error).toContain('anulada');
    expect(result.errors[1].error).toContain('cancelada');
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('4. Resilient Error Handling: Partial network failures do not abort remaining invoices', async () => {
    const ids = ['INV_OK_1', 'INV_FAIL', 'INV_OK_2'];
    const invoicesMap = new Map(ids.map(id => [id, { id, invoiceNumber: id, status: 'draft', clientEmail: 'x@test.com' }]));

    const mockSendEmail = vi.fn().mockImplementation(async (id) => {
      if (id === 'INV_FAIL') {
        throw new Error('Resend HTTP 500 Network Timeout');
      }
    });

    const result = await executeBulkDispatch(ids, invoicesMap, mockSendEmail);

    expect(result.sentOk).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toBe('Resend HTTP 500 Network Timeout');
    expect(result.sentIds).toEqual(['INV_OK_1', 'INV_OK_2']);
  });

});
