/**
 * Rules for Nova's pre-alert match (P badge + automatic customer assignment).
 * docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md — one describe per finding.
 */
import { describe, it, expect } from 'vitest';
import { storedPreAlertSlCode } from '../pre-alert-resolver';

describe('N1 — the owner is ONLY the slCode stored on the pre-alert', () => {
  it.each([
    [{ slCode: 'SL90001' }, 'SL90001'],
    [{ slCode: 'sl90001' }, 'SL90001'],
    [{ slCode: ' SL 90001 ' }, 'SL90001'],
    [{ slCode: '90001' }, 'SL90001'],          // digits alone = the same account number
  ])('%j → %s', (doc, expected) => {
    expect(storedPreAlertSlCode(doc)).toBe(expected);
  });

  it.each([
    [{}],
    [{ slCode: '' }],
    [{ slCode: null }],
    [{ slCode: 'SL' }],
    [{ slCode: 'SL-90001' }],
    [{ slCode: 'PENDIENTE' }],
    [{ userId: '2429' }],                                // users/2429 is SL1854, never "SL2429"
    [{ _id: 'TBA330000000002_2429' }],                   // SP2 shipment key, not an account
    [{ _id: 'TBA330000000002_SL2429' }],                 // the id is not the owner either
    [{ userId: '1796', displayName: 'Alguien' }],
  ])('%j → no owner (no P, no automatic assignment)', (doc) => {
    expect(storedPreAlertSlCode(doc)).toBeNull();
  });
});

import { pickSingleOwner } from '../pre-alert-resolver';

describe('N2 — one tracking, one account: 2+ accounts means nobody is guessed', () => {
  const a = (sl: string, extra: Record<string, unknown> = {}) => ({ slCode: sl, ...extra });

  it('two different accounts → no document, both slCodes reported', () => {
    expect(pickSingleOwner([a('SL90001'), a('SL90002', { displayName: 'Otra' })])).toEqual({ doc: null, ambiguousSlCodes: ['SL90001', 'SL90002'] });
  });
  it('same account written two ways (SL90001 / 90001) is ONE account → assigned', () => {
    const r = pickSingleOwner([a('SL90001'), a('90001', { displayName: 'Cliente Uno' })]);
    expect(r.ambiguousSlCodes).toBeUndefined();
    expect(r.doc.displayName).toBe('Cliente Uno');      // same preference as before: with a name first
  });
  it('an ownerless twin does not create ambiguity and is never chosen over the owner', () => {
    const owner = a('SL90001');
    expect(pickSingleOwner([{ userId: '2429' }, owner])).toEqual({ doc: owner });
  });
  it('only ownerless candidates → first returned so the caller rejects it (N1)', () => {
    const r = pickSingleOwner([{ userId: '2429' }]);
    expect(r.ambiguousSlCodes).toBeUndefined();
  });
  it('single candidate → itself', () => {
    const only = a('SL90002');
    expect(pickSingleOwner([only])).toEqual({ doc: only });
  });
});

import { isEligiblePreAlert } from '../pre-alert-resolver';

describe('N6 — a pre-alert SP2 flagged for review never decides the customer', () => {
  const recent = { active: true, status: 'pending', slCode: 'SL90001', createdAt: new Date().toISOString() };
  it('needsReview: true → not eligible', () => {
    expect(isEligiblePreAlert({ ...recent, needsReview: true, reviewReason: 'slcode_user_mismatch' })).toBe(false);
  });
  it('needsReview false / absent → unchanged (eligible)', () => {
    expect(isEligiblePreAlert({ ...recent, needsReview: false })).toBe(true);
    expect(isEligiblePreAlert(recent)).toBe(true);
  });
});

import { PREALERT_MATCH_WINDOW_DAYS } from '../pre-alert-resolver';

describe('N5 — only dated pre-alerts from the last 90 days', () => {
  const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  const base = { active: true, status: 'pending', slCode: 'SL90001' };
  it('window is 90 days', () => expect(PREALERT_MATCH_WINDOW_DAYS).toBe(90));
  it.each([1, 60, 65, 86, 89])('%i days → eligible', (d) => expect(isEligiblePreAlert({ ...base, createdAt: ago(d) })).toBe(true));
  it.each([91, 120, 200])('%i days → not eligible', (d) => expect(isEligiblePreAlert({ ...base, createdAt: ago(d) })).toBe(false));
  it('no date at all → not eligible (before: valid forever)', () => expect(isEligiblePreAlert(base)).toBe(false));
  it('unreadable date → not eligible', () => expect(isEligiblePreAlert({ ...base, createdAt: 'no-es-fecha' })).toBe(false));
  it('preAlertDate / submittedAt / Firestore Timestamp are read too', () => {
    expect(isEligiblePreAlert({ ...base, preAlertDate: ago(3) })).toBe(true);
    expect(isEligiblePreAlert({ ...base, submittedAt: ago(3) })).toBe(true);
    expect(isEligiblePreAlert({ ...base, createdAt: { toDate: () => new Date(Date.now() - 3 * 86400000) } })).toBe(true);
  });
});

describe('N4 — a consumed pre-alert only counts inside its own manifest', () => {
  const consumed = { active: true, slCode: 'SL90002', status: 'manifested', manifestNumber: 'MAN-A', createdAt: new Date().toISOString() };
  it('re-verifying the SAME manifest → eligible', () => expect(isEligiblePreAlert(consumed, 'MAN-A')).toBe(true));
  it('another manifest → not eligible (before: eligible)', () => expect(isEligiblePreAlert(consumed, 'MAN-B')).toBe(false));
  it('no current manifest → not eligible (unchanged)', () => expect(isEligiblePreAlert(consumed)).toBe(false));
  it('manifestId is accepted as its manifest too; processed behaves the same', () => {
    expect(isEligiblePreAlert({ ...consumed, manifestNumber: undefined, manifestId: 'MAN-A', status: 'processed' }, 'MAN-A')).toBe(true);
    expect(isEligiblePreAlert({ ...consumed, manifestNumber: undefined, manifestId: 'MAN-A', status: 'processed' }, 'MAN-B')).toBe(false);
  });
  it('consumed without any manifest reference → not eligible', () => {
    expect(isEligiblePreAlert({ ...consumed, manifestNumber: undefined }, 'MAN-A')).toBe(false);
  });
  it('pending pre-alert with a draft manifest reference is NOT affected', () => {
    expect(isEligiblePreAlert({ ...consumed, status: 'pending' }, 'MAN-B')).toBe(true);
  });
});

import { canonicalizeTracking } from '../../utils/tracking-canonicalizer';

describe('N7 — FedEx 34-digit barcode also finds the 12-digit tracking (read from the end)', () => {
  it.each([
    ['9632001960806794376300877098560696', '877098560696'],
    ['9622080430009957513300541441998502', '541441998502'],
  ])('%s → extra key %s; canonical and carrier unchanged', (barcode, last12) => {
    const a = canonicalizeTracking(barcode);
    expect(a.trackingVariants).toEqual([barcode, last12]);
    expect(a.canonicalTracking).toBe(barcode);
  });
  it.each([
    '420331661234940011189922319742849000',  // not 34 / not 96
    '4203316612349400111899223197428490',    // USPS 420 (34 digits) keeps its own rule
    '9532001960806794376300877098560696',    // 34 digits but not "96"
    '963200196080679437630087709856069',     // 33 digits
  ])('%s → no extra 12-digit key', (value) => {
    expect(canonicalizeTracking(value).trackingVariants).not.toContain(value.slice(-12));
  });
});

describe('N8 — USPS 420 fallback reads the tracking from the END of the barcode', () => {
  it('non-standard ZIP part → the 22-digit IMpb at the end (before: a middle slice)', () => {
    const a = canonicalizeTracking('4203319519400111899223197428490');
    expect(a.canonicalTracking).toBe('9400111899223197428490');
    expect(a.trackingVariants).toContain('9400111899223197428490');
  });
  it('standard ZIP5 / ZIP+4 barcodes are unchanged', () => {
    expect(canonicalizeTracking('420331959405511899223197428491').canonicalTracking).toBe('9405511899223197428491');
    expect(canonicalizeTracking('4203316612349400111899223197428490').canonicalTracking).toBe('9400111899223197428490');
  });
});
