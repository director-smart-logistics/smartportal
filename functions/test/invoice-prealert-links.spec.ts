/**
 * F2.2 — the invoice sync hands SP2 the CONFIRMED pre-alert of each tracking, by id
 * (functions/src/invoices/prealert-links.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import { invoiceTrackings, preAlertLinksFor, loadPreAlertLinks } from '../src/invoices/prealert-links';

const pkg = (extra: Record<string, unknown> = {}) => ({ slCode: 'SL90001', preAlertId: 'T1_SL90001', preAlertSlCode: 'SL90001', ...extra });

describe('invoiceTrackings', () => {
  it('trackingNumbers + trackingNumber + item trackings, upper case, unique, no manual lines', () => {
    expect(invoiceTrackings({
      trackingNumbers: ['t1', 'T2'], trackingNumber: 't1',
      invoiceItems: [{ trackingNumber: 'T3' }, { trackingNumber: '' }, { description: 'Servicio' }],
    }).sort()).toEqual(['T1', 'T2', 'T3']);
  });
});

describe('preAlertLinksFor — only links of the invoice customer travel', () => {
  it('package and pre-alert of the invoice customer → link', () => {
    expect(preAlertLinksFor('SL90001', new Map([['T1', pkg()]]))).toEqual([{ tracking: 'T1', preAlertId: 'T1_SL90001' }]);
  });
  it('slCode formats are normalized', () => {
    expect(preAlertLinksFor('90001', new Map([['T1', pkg({ slCode: 'sl90001' })]]))).toHaveLength(1);
  });
  it.each([
    ['pre-alert of another customer', pkg({ preAlertSlCode: 'SL90002' })],
    ['package of another customer (invoice customer changed)', pkg({ slCode: 'SL90002' })],
    ['package without a link', pkg({ preAlertId: undefined })],
    ['package not saved in SP1', undefined],
  ])('%s → nothing', (_n, p) => {
    expect(preAlertLinksFor('SL90001', new Map([['T1', p as any]]))).toEqual([]);
  });
  it('invoice without a valid slCode → nothing', () => {
    expect(preAlertLinksFor('', new Map([['T1', pkg()]]))).toEqual([]);
  });
});

describe('loadPreAlertLinks — one batched read of packages/{tracking}', () => {
  it('reads the invoice trackings and returns the valid links', async () => {
    const docs: Record<string, any> = { T1: pkg(), T2: pkg({ preAlertSlCode: 'SL90002' }) };
    const getAll = vi.fn(async (...refs: any[]) => refs.map((r) => ({ exists: !!docs[r.id], data: () => docs[r.id] })));
    const db: any = { collection: () => ({ doc: (id: string) => ({ id }) }), getAll };
    const links = await loadPreAlertLinks(db, { slCode: 'SL90001', trackingNumbers: ['T1', 'T2', 'T3'] });
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(links).toEqual([{ tracking: 'T1', preAlertId: 'T1_SL90001' }]);
  });
  it('invoice without trackings → no read', async () => {
    const getAll = vi.fn();
    expect(await loadPreAlertLinks({ getAll, collection: vi.fn() } as any, { slCode: 'SL90001' })).toEqual([]);
    expect(getAll).not.toHaveBeenCalled();
  });
});
