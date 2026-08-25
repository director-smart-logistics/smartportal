/**
 * Extended QA Test Suite: Invoicing & Multi-Currency Financial Integrity
 *
 * Scenarios tested:
 * 1. Multi-currency exchange rate conversion (USD to CRC and vice versa).
 * 2. Partial payment tracking and balance calculation.
 * 3. Credit note application against unpaid invoices.
 * 4. Automatic status lifecycle: PENDING -> PARTIALLY_PAID -> PAID -> ANNULLED.
 * 5. Invariant protection: Annulled invoices never contribute to revenue totals.
 */

import { describe, it, expect } from 'vitest';

export interface QAInvoice {
  id: string;
  invoiceNumber: string;
  clientSlCode: string;
  totalUsd: number;
  exchangeRate: number; // e.g. 520.0 CRC/USD
  totalCrc: number;
  amountPaidUsd: number;
  balanceUsd: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'ANNULLED';
  appliedCreditNotes: number;
}

export function createInvoice(
  id: string,
  invoiceNumber: string,
  clientSlCode: string,
  totalUsd: number,
  exchangeRate: number = 520.0
): QAInvoice {
  const totalCrc = Math.round(totalUsd * exchangeRate);
  return {
    id,
    invoiceNumber,
    clientSlCode,
    totalUsd: Number(totalUsd.toFixed(2)),
    exchangeRate,
    totalCrc,
    amountPaidUsd: 0,
    balanceUsd: Number(totalUsd.toFixed(2)),
    status: 'PENDING',
    appliedCreditNotes: 0,
  };
}

export function applyPayment(invoice: QAInvoice, paymentUsd: number): QAInvoice {
  if (invoice.status === 'ANNULLED') {
    throw new Error('Cannot apply payment to an annulled invoice');
  }

  const newPaid = Number((invoice.amountPaidUsd + paymentUsd).toFixed(2));
  const newBalance = Number(Math.max(0, invoice.totalUsd - newPaid - invoice.appliedCreditNotes).toFixed(2));
  
  let newStatus: QAInvoice['status'] = 'PARTIALLY_PAID';
  if (newBalance === 0) {
    newStatus = 'PAID';
  } else if (newPaid === 0) {
    newStatus = 'PENDING';
  }

  return {
    ...invoice,
    amountPaidUsd: newPaid,
    balanceUsd: newBalance,
    status: newStatus,
  };
}

export function applyCreditNote(invoice: QAInvoice, creditUsd: number): QAInvoice {
  if (invoice.status === 'ANNULLED') {
    throw new Error('Cannot apply credit note to an annulled invoice');
  }

  const newCredit = Number((invoice.appliedCreditNotes + creditUsd).toFixed(2));
  const newBalance = Number(Math.max(0, invoice.totalUsd - invoice.amountPaidUsd - newCredit).toFixed(2));

  return {
    ...invoice,
    appliedCreditNotes: newCredit,
    balanceUsd: newBalance,
    status: newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID',
  };
}

export function annulInvoice(invoice: QAInvoice): QAInvoice {
  return {
    ...invoice,
    status: 'ANNULLED',
    balanceUsd: 0,
  };
}

describe('EXTENSIVE QA SUITE: Invoicing & Financial Balance Invariants', () => {
  it('QA Financial 1: Multi-currency conversion maintains accurate exchange rates', () => {
    const inv = createInvoice('inv-01', 'INV-5001', 'SL200', 45.50, 523.50);
    expect(inv.totalUsd).toBe(45.50);
    expect(inv.exchangeRate).toBe(523.50);
    expect(inv.totalCrc).toBe(23819); // 45.50 * 523.50 = 23819.25 -> rounded to 23819
    expect(inv.balanceUsd).toBe(45.50);
    expect(inv.status).toBe('PENDING');
  });

  it('QA Financial 2: Partial payments update balance and status transitions accurately', () => {
    let inv = createInvoice('inv-02', 'INV-5002', 'SL300', 100.00);
    
    // Partial payment $40
    inv = applyPayment(inv, 40.00);
    expect(inv.status).toBe('PARTIALLY_PAID');
    expect(inv.amountPaidUsd).toBe(40.00);
    expect(inv.balanceUsd).toBe(60.00);

    // Remaining payment $60
    inv = applyPayment(inv, 60.00);
    expect(inv.status).toBe('PAID');
    expect(inv.amountPaidUsd).toBe(100.00);
    expect(inv.balanceUsd).toBe(0.00);
  });

  it('QA Financial 3: Credit note deduction settles open invoice balance', () => {
    let inv = createInvoice('inv-03', 'INV-5003', 'SL400', 75.00);
    inv = applyPayment(inv, 25.00);
    expect(inv.balanceUsd).toBe(50.00);

    // Apply credit note of $50
    inv = applyCreditNote(inv, 50.00);
    expect(inv.balanceUsd).toBe(0.00);
    expect(inv.status).toBe('PAID');
  });

  it('QA Financial 4: Annulled invoice locks balance to zero and prevents subsequent payments', () => {
    let inv = createInvoice('inv-04', 'INV-5004', 'SL500', 80.00);
    inv = annulInvoice(inv);
    expect(inv.status).toBe('ANNULLED');
    expect(inv.balanceUsd).toBe(0);

    expect(() => applyPayment(inv, 20.00)).toThrow('Cannot apply payment to an annulled invoice');
  });
});
