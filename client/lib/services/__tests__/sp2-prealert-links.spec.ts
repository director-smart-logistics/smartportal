/**
 * F2.2b — manual invoice sync carries the confirmed pre-alert (twin of
 * functions/test/invoice-prealert-links.spec.ts — same cases).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ docs: {} as Record<string, any>, fail: false }));
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => {
    if (h.fail) throw new Error('offline');
    return { exists: () => !!h.docs[ref.id], data: () => h.docs[ref.id] };
  },
}));

import { invoiceTrackings, preAlertLinksFor, attachPreAlertLinks } from '../sp2-prealert-links';

const pkg = (extra: Record<string, unknown> = {}) => ({ slCode: 'SL90001', preAlertId: 'T1_SL90001', preAlertSlCode: 'SL90001', ...extra });
beforeEach(() => { h.docs = {}; h.fail = false; });

describe('invoiceTrackings', () => {
  it('trackingNumbers + trackingNumber + item trackings, upper case, unique, no manual lines', () => {
    expect(invoiceTrackings({ trackingNumbers: ['t1', 'T2'], trackingNumber: 't1', invoiceItems: [{ trackingNumber: 'T3' }, { trackingNumber: '' }, { description: 'x' }] }).sort())
      .toEqual(['T1', 'T2', 'T3']);
  });
});

describe('preAlertLinksFor — only links of the invoice customer travel', () => {
  it('package and pre-alert of the invoice customer → link', () => {
    expect(preAlertLinksFor('SL90001', new Map([['T1', pkg()]]))).toEqual([{ tracking: 'T1', preAlertId: 'T1_SL90001' }]);
  });
  it.each([
    ['pre-alert of another customer', pkg({ preAlertSlCode: 'SL90002' })],
    ['package of another customer', pkg({ slCode: 'SL90002' })],
    ['package without a link', pkg({ preAlertId: undefined })],
    ['package not saved in SP1', undefined],
  ])('%s → nothing', (_n, p) => {
    expect(preAlertLinksFor('SL90001', new Map([['T1', p as any]]))).toEqual([]);
  });
});

describe('attachPreAlertLinks — per invoice of a sync chunk', () => {
  it('adds only each invoice\'s own valid links', async () => {
    h.docs = { T1: pkg(), T2: pkg({ slCode: 'SL90002', preAlertSlCode: 'SL90002', preAlertId: 'T2_SL90002' }) };
    const payloads: any[] = [{ slCode: 'SL90001', trackingNumbers: ['T1'] }, { slCode: 'SL90002', trackingNumbers: ['T2'] }, { slCode: 'SL90001', trackingNumbers: ['T3'] }];
    await attachPreAlertLinks(payloads);
    expect(payloads[0].preAlertLinks).toEqual([{ tracking: 'T1', preAlertId: 'T1_SL90001' }]);
    expect(payloads[1].preAlertLinks).toEqual([{ tracking: 'T2', preAlertId: 'T2_SL90002' }]);
    expect(payloads[2].preAlertLinks).toBeUndefined();
  });
  it('a read failure never blocks the sync (payload goes as before)', async () => {
    h.fail = true;
    const payloads: any[] = [{ slCode: 'SL90001', trackingNumbers: ['T1'] }];
    await expect(attachPreAlertLinks(payloads)).resolves.toBeUndefined();
    expect(payloads[0].preAlertLinks).toBeUndefined();
  });
});
