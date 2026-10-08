import { describe, it, expect } from 'vitest';
import { mayFollowInvoiceReassignment } from '../src/invoices/reassign-rule';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const ago = (d: number) => new Date(NOW - d * 86400000).toISOString();
const ctx = { invoiceId: 'INV-7', beforeSlCode: 'SL90002', nowMs: NOW };

describe('N14 — which SP1 packages follow an invoice that changes customer', () => {
  it('package of THIS invoice → follows (even if old)', () =>
    expect(mayFollowInvoiceReassignment({ invoiceId: 'INV-7', slCode: 'SL5', status: 'delivered', createdAt: ago(300) }, ctx)).toBe(true));
  it('current package of the invoice\'s previous customer → follows (unchanged)', () =>
    expect(mayFollowInvoiceReassignment({ slCode: 'sl90002', status: 'customs', createdAt: ago(3) }, ctx)).toBe(true));
  it('ANOTHER customer\'s package with the same tracking → does not follow (before: moved)', () =>
    expect(mayFollowInvoiceReassignment({ slCode: 'SL90003', status: 'customs', createdAt: ago(3) }, ctx)).toBe(false));
  it('previous customer\'s package already delivered → does not follow (recycled number)', () =>
    expect(mayFollowInvoiceReassignment({ slCode: 'SL90002', status: 'delivered', createdAt: ago(3) }, ctx)).toBe(false));
  it('previous customer\'s package older than 90 days → does not follow', () =>
    expect(mayFollowInvoiceReassignment({ slCode: 'SL90002', status: 'customs', createdAt: ago(120) }, ctx)).toBe(false));
  it('Firestore Timestamp dates are read', () =>
    expect(mayFollowInvoiceReassignment({ slCode: 'SL90002', status: 'customs', createdAt: { toMillis: () => NOW - 5 * 86400000 } }, ctx)).toBe(true));
  it('no previous customer known → only this invoice\'s packages', () =>
    expect(mayFollowInvoiceReassignment({ slCode: '', status: 'customs', createdAt: ago(1) }, { ...ctx, beforeSlCode: '' })).toBe(false));
});

import { isSettledPackage } from '../src/invoices/reassign-rule';

describe('N16 — a closed or old package keeps its own invoice', () => {
  it.each([
    [{ status: 'delivered', createdAt: ago(3) }, true],
    [{ status: 'returned', createdAt: ago(3) }, true],
    [{ status: 'customs', createdAt: ago(120) }, true],
    [{ status: 'customs', createdAt: ago(3) }, false],
    [{ status: 'route' }, false],
  ])('%j → settled=%s', (pkg, expected) => expect(isSettledPackage(pkg, NOW)).toBe(expected));
});
