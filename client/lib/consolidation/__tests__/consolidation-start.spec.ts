import { describe, it, expect } from 'vitest';
import { packageDayOne, firstInvoiceFromInvoices } from '../day-one';
import {
  consolidationStart, consolidationOps, isInConsolidation, isPackageTransitoria,
  firstInvoiceFromInvoices as firstInvoiceFromInvoicesFn,
} from '../../../../functions/src/consolidation/consolidation-start';

const T = 'consolidacion_transitoria';

describe('SP2 "En Consolidación" — membership (same as the SP1 consolidation page)', () => {
  it('transitoria + non-terminal is in; terminal or another manifest is out', () => {
    expect(isInConsolidation({ updatedManifest: T, status: 'consolidated' })).toBe(true);
    expect(isInConsolidation({ manifestNumber: 'CONSOLIDACION_TRANSITORIA', status: 'customs' })).toBe(true);
    expect(isInConsolidation({ updatedManifest: T, status: 'delivered' })).toBe(false);
    expect(isInConsolidation({ updatedManifest: T, status: 'processed' })).toBe(false);
    expect(isInConsolidation({ manifestNumber: 'MEGA-MAN-01-09-2026', status: 'consolidated' })).toBe(false);
  });
  it('updatedManifest wins over manifestNumber (moved out of transitoria)', () => {
    expect(isPackageTransitoria({ updatedManifest: '18-09-2026DAN', manifestNumber: T })).toBe(false);
    expect(isPackageTransitoria({ updatedManifest: T, manifestNumber: '18-09-2026DAN' })).toBe(true);
  });
});

describe('SP2 "En Consolidación" — Día 1 (first invoice)', () => {
  it('invoice #1 annulled, then #2 annulled: the FIRST invoice date (history), not the last', () => {
    const s = consolidationStart({
      annulledInvoiceNumber: 'SL43-20260905101010101', annulledInvoiceDate: '2026-09-05T16:10:10.000Z',
      statusHistory: [
        { status: 'consolidated', note: 'Factura SL43-20260810143738820 anulada. Paquetes movidos a: consolidacion_transitoria' },
        { status: 'consolidated', note: 'Factura SL43-20260905101010101 anulada.' },
      ],
    });
    expect(s.scenario).toBe('primera-factura');
    expect(s.invoiceNumber).toBe('SL43-20260810143738820');
    expect(s.date?.slice(0, 10)).toBe('2026-08-10');
  });
  it('one annulled invoice with its exact date: the exact date', () => {
    const s = consolidationStart({ annulledInvoiceNumber: 'SL9-20260801090000000', annulledInvoiceDate: '2026-08-01T15:00:00.000Z' });
    expect(s.date).toBe('2026-08-01T15:00:00.000Z');
  });
  it('moves between manifests do not change it', () => {
    const base = { annulledInvoiceNumber: 'SL9-20260801090000000', annulledInvoiceDate: '2026-08-01T15:00:00.000Z' };
    const moved = { ...base, statusHistory: [{ status: 'consolidated', note: 'Movido a manifiesto 18-09-2026DAN' }], updatedManifest: T };
    expect(consolidationStart(moved).date).toBe(consolidationStart(base).date);
  });
  it('never invoiced: firstConsolidatedAt, else first consolidated event, else createdAt', () => {
    expect(consolidationStart({ firstConsolidatedAt: '2026-07-01T10:00:00.000Z', createdAt: '2026-06-01T10:00:00.000Z' }).date).toBe('2026-07-01T10:00:00.000Z');
    expect(consolidationStart({ statusHistory: [{ status: 'consolidated', changedAt: '2026-07-03T10:00:00.000Z' }, { status: 'consolidated', changedAt: '2026-07-02T10:00:00.000Z' }] }).date).toBe('2026-07-02T10:00:00.000Z');
    expect(consolidationStart({ createdAt: '2026-06-01T10:00:00.000Z' }).scenario).toBe('sin-factura');
    expect(consolidationStart({}).scenario).toBe('sin-datos');
  });
});

describe('SP2 "En Consolidación" — list operations per package write', () => {
  const pkg = (o: any) => ({ trackingNumber: 'TBA1', slCode: 'SL1', status: 'consolidated', updatedManifest: T, ...o });
  it('enters → add with the start date; leaves to a manifest → remove', () => {
    const add = consolidationOps('P1', pkg({ updatedManifest: 'M1', status: 'processed' }), pkg({ annulledInvoiceNumber: 'SL1-20260801090000000' }));
    expect(add).toHaveLength(1); expect(add[0].op).toBe('add'); expect(add[0].since?.slice(0, 10)).toBe('2026-08-01');
    const rm = consolidationOps('P1', pkg({}), pkg({ updatedManifest: '18-09-2026DAN' }));
    expect(rm).toEqual([expect.objectContaining({ op: 'remove', reason: 'movido de consolidación a un manifiesto' })]);
  });
  it('stays inside (any other field change) → nothing', () => {
    expect(consolidationOps('P1', pkg({}), pkg({ weight: 3 }))).toEqual([]);
  });
  it('customer reassigned while in consolidation → remove old, add new', () => {
    const ops = consolidationOps('P1', pkg({}), pkg({ slCode: 'SL2' }));
    expect(ops.map((o) => `${o.op}:${o.slCode}`)).toEqual(['remove:SL1', 'add:SL2']);
  });
  it('deleted while in consolidation → remove', () => {
    expect(consolidationOps('P1', pkg({}), undefined)[0]).toEqual(expect.objectContaining({ op: 'remove', reason: 'paquete eliminado en SP1' }));
  });
});

describe('ONE rule: the SP1 page (client day-one) and SP2 since (functions) agree on every fixture', () => {
  const fx: any[] = [
    {},
    { firstConsolidatedAt: '2026-07-01T10:00:00.000Z' },
    { statusHistory: [{ status: 'consolidated', changedAt: '2026-07-03T10:00:00.000Z' }] },
    { createdAt: '2026-06-01T10:00:00.000Z' },
    { annulledInvoiceNumber: 'SL1-20260905101010101', annulledInvoiceDate: '2026-09-05T16:10:10.000Z', statusHistory: [{ note: 'Factura SL1-20260810143738820 anulada' }] },
    { annulledInvoiceNumber: 'SL1-20260801090000000', annulledInvoiceDate: '2026-08-01T15:00:00.000Z', invoicedAt: '2026-08-01T15:00:00.000Z' },
    { invoiceId: 'x', invoiceNumber: 'SL1-20260925100001-C' },
    { invoiceId: 'x', invoiceNumber: 'SL1-20260925100001-C', invoiceDate: '2026-09-25' },
    { invoiceId: 'x', invoiceNumber: 'SL1-20260925100001-C', annulledInvoiceNumber: 'SL1-20260918100001-C', annulledInvoiceDate: '2026-09-18T12:00:00-06:00' },
    { invoiceNumber: 'consolidacion_transitoria', firstConsolidatedAt: '2026-09-01T00:00:00Z' },
    { invoiceNumber: 'SL1-20260925100001-C', isTransitoria: true, firstConsolidatedAt: '2026-09-01T00:00:00Z' },
    { invoicedAt: '2026-09-10T12:00:00-06:00', firstConsolidatedAt: '2026-08-01T12:00:00-06:00' },
    // production case SL26254 package A (first invoice only in the history) and B
    { annulledInvoiceNumber: 'SL26254-20260925152113250-C', invoicedAt: '2026-09-25T21:21:13.250Z', firstConsolidatedAt: '2026-09-23T20:27:42.000Z',
      statusHistory: [{ note: 'Factura SL26254-20260923142742506 anulada desde panel de facturas' }, { note: 'Factura SL26254-20260925152113250-C anulada desde panel de facturas' }] },
    { annulledInvoiceNumber: 'SL26254-20260925152113250-C', invoicedAt: '2026-09-25T21:21:13.250Z', statusHistory: [{ note: 'Factura SL26254-20260925152113250-C anulada' }] },
  ];
  fx.forEach((pkg, i) => it(`fixture ${i}`, () => {
    const a = packageDayOne(pkg), b = consolidationStart(pkg);
    expect(b.date).toBe(a.date);
    expect(b.scenario).toBe(a.scenario);
    expect(b.invoiceNumber ?? undefined).toBe(a.invoiceNumber ?? undefined);
  }));
});

// The 6 production packages (read-only audit 2026-09-28) whose "Día 1" was the LAST invoice instead of the FIRST.
// Each package doc keeps only its LAST annulled invoice; the first one is found in the customer's SP1 invoices.
const PROD6 = [
  {
    "sl": "SL185",
    "tracking": "TBA334694917044",
    "expected": "2026-09-24",
    "first": "SL185-20260924140825864",
    "today": "2026-09-25",
    "invoices": [
      {
        "invoiceNumber": "SL185-20260924140825864",
        "date": "2026-09-24"
      },
      {
        "invoiceNumber": "SL185-20260925162956646-C",
        "date": "2026-09-25"
      }
    ],
    "last": "SL185-20260925162956646-C"
  },
  {
    "sl": "SL26254",
    "tracking": "GFUS01072532552769",
    "expected": "2026-09-23",
    "first": "SL26254-20260923142742506",
    "today": "2026-09-25",
    "invoices": [
      {
        "invoiceNumber": "SL26254-20260923142742506",
        "date": "2026-09-23"
      },
      {
        "invoiceNumber": "SL26254-20260925152113250-C",
        "date": "2026-09-25"
      }
    ],
    "last": "SL26254-20260925152113250-C"
  },
  {
    "sl": "SL286",
    "tracking": "GFUS01071646667905",
    "expected": "2026-09-21",
    "first": "SL286-20260921145220850",
    "today": "2026-09-25",
    "invoices": [
      {
        "invoiceNumber": "SL286-20260921145220850",
        "date": "2026-09-21"
      },
      {
        "invoiceNumber": "SL286-20260925162954181-C",
        "date": "2026-09-25"
      }
    ],
    "last": "SL286-20260925162954181-C"
  },
  {
    "sl": "SL66",
    "tracking": "GFUS01073330845188",
    "expected": "2026-09-24",
    "first": "SL66-20260924135751568",
    "today": "2026-09-25",
    "invoices": [
      {
        "invoiceNumber": "SL66-20260924135751568",
        "date": "2026-09-24"
      },
      {
        "invoiceNumber": "SL66-20260925162653008-C",
        "date": "2026-09-25"
      }
    ],
    "last": "SL66-20260925162653008-C"
  },
  {
    "sl": "SL7511",
    "tracking": "GFUS01072167370240",
    "expected": "2026-09-21",
    "first": "SL7511-20260921145552250-C",
    "today": "2026-09-23",
    "invoices": [
      {
        "invoiceNumber": "SL7511-20260921145552250-C",
        "date": "2026-09-21"
      },
      {
        "invoiceNumber": "SL7511-20260923142953769-C",
        "date": "2026-09-23"
      },
      {
        "invoiceNumber": "SL7511-20260923130929049-C",
        "date": "2026-09-23"
      }
    ],
    "last": "SL7511-20260923142953769-C"
  },
  {
    "sl": "SL7511",
    "tracking": "GFUS01072035895872",
    "expected": "2026-09-21",
    "first": "SL7511-20260921145552250-C",
    "today": "2026-09-23",
    "invoices": [
      {
        "invoiceNumber": "SL7511-20260921145552250-C",
        "date": "2026-09-21"
      },
      {
        "invoiceNumber": "SL7511-20260923142953769-C",
        "date": "2026-09-23"
      },
      {
        "invoiceNumber": "SL7511-20260923130929049-C",
        "date": "2026-09-23"
      }
    ],
    "last": "SL7511-20260923142953769-C"
  }
] as const;
const invDoc = (i: { invoiceNumber: string; date: string }, tracking: string, status = 'annulled') =>
  ({ invoiceNumber: i.invoiceNumber, invoiceDate: i.date, status, invoiceItems: [{ trackingNumber: tracking }, { trackingNumber: 'OTRO123' }] });

describe('Production cases: the first invoice comes from the customer\'s SP1 invoices (any status)', () => {
  PROD6.forEach((c) => it(`${c.sl} ${c.tracking}: ${c.today} → ${c.expected}`, () => {
    const invoices = [...c.invoices].reverse().map((i) => invDoc(i, c.tracking));
    invoices.push({ invoiceNumber: `${c.sl}-20260101000000000`, invoiceDate: '2026-01-01', status: 'annulled', invoiceItems: [{ trackingNumber: 'NO-ES-ESTE' }] });
    const lastDate = c.invoices.find((i) => i.invoiceNumber === c.last)!.date;
    // the package doc as production has it: only the LAST annulled invoice
    const doc: any = { trackingNumber: c.tracking, slCode: c.sl, annulledInvoiceNumber: c.last, invoicedAt: `${lastDate}T12:00:00-06:00` };
    expect(packageDayOne(doc).date?.slice(0, 10)).toBe(c.today);                       // the old bug, reproduced
    const hist = firstInvoiceFromInvoices(c.tracking, invoices)!;
    expect(hist.invoiceNumber).toBe(c.first);
    expect(firstInvoiceFromInvoicesFn(c.tracking, invoices)).toEqual(hist);            // same in functions
    const withHist = { ...doc, invoiceHistoryFirst: hist };
    expect(packageDayOne(withHist).date?.slice(0, 10)).toBe(c.expected);
    expect(packageDayOne(withHist).invoiceNumber).toBe(c.first);
    expect(consolidationStart(withHist).date).toBe(packageDayOne(withHist).date);
    // once stored on the package, the attribute wins everywhere
    const stored = { ...doc, firstInvoiceNumber: c.first, firstInvoiceDate: hist.date };
    expect(packageDayOne(stored).date).toBe(hist.date);
    expect(consolidationStart(stored)).toEqual({ date: hist.date, invoiceNumber: c.first, scenario: 'primera-factura' });
  }));
  it('soft-deleted invoices and invoices without the tracking are ignored', () => {
    expect(firstInvoiceFromInvoices('ABC1', [{ invoiceNumber: 'SL1-20260101000000000', isDeleted: true, invoiceItems: [{ trackingNumber: 'ABC1' }] }])).toBeNull();
    expect(firstInvoiceFromInvoices('ABC1', [{ invoiceNumber: 'SL1-20260101000000000', items: [{ tracking: 'abc-1' }] }])?.invoiceNumber).toBe('SL1-20260101000000000');
  });
});

describe('the invoice doc\'s exact date beats the "noon" read from the same invoice number', () => {
  it('package linked to an invoice (no invoiceDate on the package) → the exact date of the invoice doc', () => {
    const inv = { invoiceNumber: 'SL90001-202609081230560001-C', invoiceDate: '2026-09-08T18:31:05.583Z', items: [{ trackingNumber: 'ABC1' }] };
    const pkg: any = { trackingNumber: 'ABC1', invoiceId: 'x', invoiceNumber: inv.invoiceNumber };
    const hist = firstInvoiceFromInvoices('ABC1', [inv])!;
    expect(packageDayOne({ ...pkg, invoiceHistoryFirst: hist }).date).toBe('2026-09-08T18:31:05.583Z');
    expect(consolidationStart({ ...pkg, invoiceHistoryFirst: hist }).date).toBe('2026-09-08T18:31:05.583Z');
    // without any exact source, the number's noon is still used
    expect(consolidationStart(pkg).date).toBe('2026-09-08T12:00:00-06:00');
    expect(packageDayOne(pkg).date).toBe('2026-09-08T12:00:00-06:00');
  });
});
