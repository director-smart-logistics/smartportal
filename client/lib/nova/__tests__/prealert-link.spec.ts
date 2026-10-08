/**
 * F2.1 — only a CERTAIN pre-alert link is stored on the SP1 package (client/lib/nova/prealert-link.ts).
 */
import { describe, it, expect } from 'vitest';
import { confirmedPreAlertLink } from '../prealert-link';

const found = (extra: Record<string, unknown> = {}) => ({ found: true, slCode: 'SL90001', sp2PreAlertId: 'T1_SL90001', ...extra });

describe('confirmedPreAlertLink', () => {
  it('confirmed pre-alert of the row customer → link', () => {
    expect(confirmedPreAlertLink({ preAlert: found() }, 'SL90001')).toEqual({ preAlertId: 'T1_SL90001', preAlertSlCode: 'SL90001' });
  });
  it('slCode formats are normalized', () => {
    expect(confirmedPreAlertLink({ preAlert: found({ slCode: 'sl90001' }) }, '90001')).toEqual({ preAlertId: 'T1_SL90001', preAlertSlCode: 'SL90001' });
  });
  it('id from the processor fields when the pre-alert object has none', () => {
    expect(confirmedPreAlertLink({ preAlert: found({ sp2PreAlertId: undefined }), preAlertId: 'P-1' }, 'SL90001')?.preAlertId).toBe('P-1');
  });
  it.each([
    ['admin gave the package to ANOTHER customer', { preAlert: found() }, 'SL90002'],
    ['row without customer', { preAlert: found() }, ''],
    ['several accounts (RED P)', { preAlert: { found: false, ambiguousSlCodes: ['SL1', 'SL2'] } as any }, 'SL90001'],
    ['tracking repeated in the manifest (RED P)', { preAlert: found({ repeatedInManifest: true }) }, 'SL90001'],
    ['no pre-alert', {}, 'SL90001'],
    ['pre-alert without an id', { preAlert: found({ sp2PreAlertId: undefined }) }, 'SL90001'],
    ['pre-alert without an owner', { preAlert: { found: true, sp2PreAlertId: 'X' } }, 'SL90001'],
  ])('%s → no link', (_name, row, sl) => {
    expect(confirmedPreAlertLink(row as any, sl)).toBeNull();
  });
});
