import { describe, it, expect } from 'vitest';
import { packageDayOne, customerDayOne, sortByDayOne, firstInvoiceFromInvoices } from '../day-one';

// Invoice numbers carry their emission date (SL123-YYYYMMDDhhmmss…-C), as in production.
const D = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T12:00:00-06:00`;
const INV = (ymd: string, n = '1') => `SL900-${ymd}10000${n}-C`;
const annulNote = (num: string, to = 'consolidación transitoria') => ({ status: 'consolidated', changedAt: '2026-01-01T00:00:00Z', changedBy: 'invoice-annulled', note: `Factura ${num} anulada — paquete desvinculado y movido a ${to}` });
/** What every annul/delete flow writes on the package (the LAST annulled invoice). */
const annulled = (ymd: string, n?: string) => ({ annulledInvoiceNumber: INV(ymd, n), annulledInvoiceDate: D(ymd), invoicedAt: D(ymd) });

describe('Día 1 = FIRST invoice (2026-09-28) — every scenario from the flows and the production logs', () => {
  it('S0 never invoiced → the day it entered consolidation', () => {
    expect(packageDayOne({ firstConsolidatedAt: '2026-09-01T10:00:00Z', createdAt: '2026-08-20T00:00:00Z' })).toMatchObject({ date: '2026-09-01T10:00:00Z', scenario: 'sin-factura' });
    expect(packageDayOne({ statusHistory: [{ status: 'customs', changedAt: '2026-08-01T00:00:00Z' }, { status: 'consolidated', changedAt: '2026-08-05T00:00:00Z' }] }).date).toBe('2026-08-05T00:00:00Z');
  });

  it('S1 invoice #1 annulled (moved to transitoria) → date of #1', () => {
    expect(packageDayOne({ ...annulled('20260702'), firstConsolidatedAt: D('20260702'), statusHistory: [annulNote(INV('20260702'))] }))
      .toMatchObject({ date: D('20260702'), scenario: 'primera-factura', invoiceNumber: INV('20260702') });
  });

  it('only invoicedAt (older packages) → that invoice date', () => {
    expect(packageDayOne({ invoicedAt: D('20260910'), firstConsolidatedAt: D('20260801') })).toMatchObject({ date: D('20260910'), scenario: 'primera-factura' });
  });

  it('S1b invoice deleted (no history note, only the fields) → date of that invoice', () => {
    expect(packageDayOne({ ...annulled('20260815') }).date).toBe(D('20260815'));
  });

  it('S2 #1 → #2 → #3 annulled / deleted → date of the FIRST one (#1), never a later one', () => {
    const pkg = { ...annulled('20260918', '3'), firstConsolidatedAt: D('20260702'),
      statusHistory: [annulNote(INV('20260702', '1')), annulNote(INV('20260801', '2'), '12-08-2026DAN'), annulNote(INV('20260918', '3'))] };
    expect(packageDayOne(pkg)).toMatchObject({ date: D('20260702'), invoiceNumber: INV('20260702', '1') });
  });

  it('S2b the first invoice lives only in the history notes (fields keep the LAST annulled) → the history one', () => {
    const pkg = { ...annulled('20260918', '3'), statusHistory: [annulNote(INV('20260702', '1'))] };
    expect(packageDayOne(pkg).date).toBe(D('20260702'));
  });

  it('S2c the fields hold the older invoice → the fields one', () => {
    const pkg = { ...annulled('20260801', '2'), statusHistory: [annulNote(INV('20260918', '3'))] };
    expect(packageDayOne(pkg).date).toBe(D('20260801'));
  });

  it('S3 now inside invoice #4 after #3 was annulled → still the first invoice (#3)', () => {
    const pkg = { ...annulled('20260918', '3'), invoiceId: 'x', invoiceNumber: INV('20260925', '4'), statusHistory: [annulNote(INV('20260918', '3'))] };
    expect(packageDayOne(pkg).date).toBe(D('20260918'));
  });

  it('S3b only its current invoice (never annulled) → that invoice date', () => {
    expect(packageDayOne({ invoiceId: 'x', invoiceNumber: INV('20260925', '4') }).date).toBe(D('20260925'));
  });

  it('the transitory block is not an invoice', () => {
    expect(packageDayOne({ invoiceNumber: 'consolidacion_transitoria', firstConsolidatedAt: '2026-09-01T00:00:00Z' }).scenario).toBe('sin-factura');
    expect(packageDayOne({ invoiceNumber: INV('20260925'), isTransitoria: true, firstConsolidatedAt: '2026-09-01T00:00:00Z' }).date).toBe('2026-09-01T00:00:00Z');
  });

  it('S4 moved between blocks / manifests / carry-on (no invoice) → unchanged', () => {
    const base = { ...annulled('20260801'), statusHistory: [annulNote(INV('20260801'))] };
    const moved = { ...base, manifestNumber: 'MEGA-MAN-18-09-2026', manifestUpdatedAt: '2026-09-18T00:00:00Z', carryOnHistory: [{ from: 'A', to: 'B', at: '2026-09-18' }],
      statusHistory: [...base.statusHistory, { status: 'consolidated', changedAt: '2026-09-18T00:00:00Z', note: 'Movido a MEGA-MAN-18-09-2026' }] };
    expect(packageDayOne(moved).date).toBe(packageDayOne(base).date);
  });

  it('firstConsolidatedAt (oldest by design) never wins over an invoice', () => {
    expect(packageDayOne({ ...annulled('20260918'), firstConsolidatedAt: D('20260101') }).date).toBe(D('20260918'));
  });

  it('no data → null', () => {
    expect(packageDayOne({})).toEqual({ date: null, scenario: 'sin-datos' });
    expect(packageDayOne(null)).toEqual({ date: null, scenario: 'sin-datos' });
  });
});

describe('customerDayOne — the customer counter follows the OLDEST "Día 1"', () => {
  it('A first #1 (Jul 2, re-invoiced later), B #1 (Jul 2), C never invoiced (Aug 20) → Jul 2', () => {
    const A = { id: 'A', ...annulled('20260918', '3'), statusHistory: [annulNote(INV('20260702', '1')), annulNote(INV('20260918', '3'))] };
    const B = { id: 'B', ...annulled('20260702', '1') };
    const C = { id: 'C', firstConsolidatedAt: D('20260820') };
    expect(customerDayOne([A, B, C]).date).toBe(D('20260702'));
    expect(customerDayOne([B, C]).packageId).toBe('B');
  });
  it('only never-invoiced packages → the oldest entry into consolidation', () => {
    expect(customerDayOne([{ id: '1', firstConsolidatedAt: D('20260910') }, { id: '2', firstConsolidatedAt: D('20260905') }]).packageId).toBe('2');
  });
  it('empty → null', () => {
    expect(customerDayOne([])).toEqual({ date: null });
  });
});

describe('F10 — the user\'s scenario (2026-09-26): invoices #1, #2, #3 of ONE customer, each with its own packages', () => {
  // #1 = Sep 1 (A, B) · #2 = Sep 5 (C) · #3 = Sep 10 (D). A is reassigned to a manifest and re-invoiced in #4 (Sep 20).
  const inInvoice = (id: string, ymd: string, n: string) => ({ id, invoiceId: `inv${n}`, invoiceNumber: INV(ymd, n) });
  const A = { ...inInvoice('A', '20260920', '4'), ...annulled('20260901', '1'), statusHistory: [annulNote(INV('20260901', '1'), 'MEGA-MAN-15-09-2026')] };
  const B = inInvoice('B', '20260901', '1');
  const C = inInvoice('C', '20260905', '2');
  const Dp = inInvoice('D', '20260910', '3');
  it('each package keeps the date of ITS invoice', () => {
    expect(packageDayOne(B).date).toBe(D('20260901'));
    expect(packageDayOne(C).date).toBe(D('20260905'));
    expect(packageDayOne(Dp).date).toBe(D('20260910'));
  });
  it('a package reassigned to a manifest and re-invoiced KEEPS the date of its first invoice (#1)', () => {
    expect(packageDayOne(A).date).toBe(D('20260901'));
  });
  it('the customer counter follows the oldest invoice (#1, Sep 1)', () => {
    expect(customerDayOne([A, B, C, Dp]).date).toBe(D('20260901'));
  });
});

describe('exact invoice date vs the day read from its number', () => {
  it('the exact date of the same invoice wins over "noon" read from its number (no day lost in the morning)', () => {
    // Invoice issued Aug 27 at 09:50 CR; its number only says "Aug 27" (read as noon).
    const pkg = { annulledInvoiceNumber: 'SL90050-202608270950040001-C', annulledInvoiceDate: '2026-08-27T15:50:10.842Z', invoicedAt: '2026-08-27T15:50:10.842Z' };
    expect(packageDayOne(pkg)).toEqual({ date: '2026-08-27T15:50:10.842Z', scenario: 'primera-factura', invoiceNumber: 'SL90050-202608270950040001-C' });
  });
  it('the number still counts for an invoice known only by its number (history note), and the first invoice wins', () => {
    const pkg = { annulledInvoiceNumber: 'SL1-202609110950040002-C', annulledInvoiceDate: '2026-09-11T15:50:10.842Z',
      statusHistory: [{ note: 'Factura SL1-202608270950040001-C anulada' }] };
    expect(packageDayOne(pkg).invoiceNumber).toBe('SL1-202608270950040001-C');
    expect(packageDayOne(pkg).date).toBe(D('20260827'));
  });
});

describe('Production case SL26254 (2026-09-28): first invoice annulled, carry-on, re-invoiced with another package, annulled again', () => {
  // A: first invoice 23/09 (annulled the same day → consolidation). On 25/09 carry-on to 24-09-2026DAN and re-invoiced
  // with B in …-C (25/09), annulled 26/09 → back to consolidation. The doc keeps only the 25/09 invoice in its fields;
  // the 23/09 one lives only in a history note.
  const A = {
    id: 'GFUS01072532552769', trackingNumber: 'GFUS01072532552769', slCode: 'SL26254', updatedManifest: 'consolidacion_transitoria', status: 'consolidated',
    annulledInvoiceNumber: 'SL26254-20260925152113250-C', invoicedAt: '2026-09-25T21:21:13.250Z', annulledAt: '2026-09-26T15:00:00.000Z',
    firstConsolidatedAt: '2026-09-23T20:27:42.000Z',
    statusHistory: [
      { status: 'consolidated', changedAt: '2026-09-23T20:27:42.000Z', note: 'Factura SL26254-20260923142742506 anulada desde panel de facturas' },
      { status: 'consolidated', changedAt: '2026-09-25T15:00:00.000Z', note: 'Carry-On: movido a 24-09-2026DAN' },
      { status: 'consolidated', changedAt: '2026-09-26T15:00:00.000Z', note: 'Factura SL26254-20260925152113250-C anulada desde panel de facturas' },
    ],
  };
  const B = {
    id: 'GFUS01072527880385', trackingNumber: 'GFUS01072527880385', slCode: 'SL26254', updatedManifest: 'consolidacion_transitoria', status: 'consolidated',
    annulledInvoiceNumber: 'SL26254-20260925152113250-C', invoicedAt: '2026-09-25T21:21:13.250Z', createdAt: '2026-09-25T10:00:00.000Z',
    statusHistory: [{ status: 'consolidated', changedAt: '2026-09-26T15:00:00.000Z', note: 'Factura SL26254-20260925152113250-C anulada desde panel de facturas' }],
  };
  it('A = 23/09 (its first invoice, only in the history), B = 25/09', () => {
    expect(packageDayOne(A)).toMatchObject({ scenario: 'primera-factura', invoiceNumber: 'SL26254-20260923142742506' });
    expect(packageDayOne(A).date?.slice(0, 10)).toBe('2026-09-23');
    expect(packageDayOne(B).date?.slice(0, 10)).toBe('2026-09-25');
  });
  it('customer counter ("Consolida desde" in the card header) = 23/09, from package A', () => {
    expect(customerDayOne([B, A])).toEqual({ date: packageDayOne(A).date, packageId: 'GFUS01072532552769' });
  });
});

describe('Order inside the customer block: Día 1 ascending by full timestamp (oldest first), ties by tracking', () => {
  it('SL26254: A (23/09) above B (25/09); undated last; same timestamp → by tracking', () => {
    const B = { trackingNumber: 'GFUS01072527880385', firstInvoiceDate: '2026-09-25T21:21:13.250Z' };
    const A = { trackingNumber: 'GFUS01072532552769', firstInvoiceDate: '2026-09-23T20:27:42.506Z' };
    const C = { trackingNumber: 'AAA1', firstInvoiceDate: '2026-09-25T21:21:13.250Z' };
    const X = { trackingNumber: 'ZZZ' };
    expect(sortByDayOne([X, B, C, A]).map((p) => p.trackingNumber)).toEqual(['GFUS01072532552769', 'AAA1', 'GFUS01072527880385', 'ZZZ']);
  });
  it('SL7511 shape: the two 21/09 first, then the 23/09 ones by time (13:09 before 14:29)', () => {
    const d = (n: string, iso: string) => ({ trackingNumber: n, firstInvoiceDate: iso });
    const list = [
      d('1Z215YE70310310687', '2026-09-23T20:29:53.769Z'), d('GFUS01072035895872', '2026-09-21T20:55:52.250Z'),
      d('GFUS01072167370240', '2026-09-21T20:55:52.250Z'), d('GFUS01072342717504', '2026-09-23T20:29:53.769Z'),
      d('GFUS01072352765185', '2026-09-23T20:29:53.769Z'), d('TBA334559460645', '2026-09-23T19:09:29.049Z'),
    ];
    expect(sortByDayOne(list).map((p) => p.trackingNumber)).toEqual(['GFUS01072035895872', 'GFUS01072167370240', 'TBA334559460645', '1Z215YE70310310687', 'GFUS01072342717504', 'GFUS01072352765185']);
  });
  it('same day, different time: the earlier invoice wins (full timestamp)', () => {
    const invs = [
      { invoiceNumber: 'SL7511-20260923142953769-C', createdAt: '2026-09-23T20:29:53.769Z', invoiceItems: [{ trackingNumber: 'TBA334559460645' }] },
      { invoiceNumber: 'SL7511-20260923130929049-C', createdAt: '2026-09-23T19:09:29.049Z', invoiceItems: [{ trackingNumber: 'TBA334559460645' }] },
    ];
    const first = firstInvoiceFromInvoices('TBA334559460645', invs)!;
    expect(first.invoiceNumber).toBe('SL7511-20260923130929049-C');
    expect(packageDayOne({ trackingNumber: 'TBA334559460645', invoiceHistoryFirst: first }).invoiceNumber).toBe('SL7511-20260923130929049-C');
  });
});
