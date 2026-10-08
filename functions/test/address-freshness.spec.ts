import { describe, it, expect } from 'vitest';
import { pickSp2Addresses, isOlderAddressSnapshot } from '../src/customers/address-freshness';

describe('F8.1 pickSp2Addresses', () => {
  it('SP2 address documents win over the pushed snapshot', () => {
    expect(pickSp2Addresses([{ id: 'a', street: 'NEW' }], [{ id: 'a', street: 'OLD' }])).toEqual({ addresses: [{ id: 'a', street: 'NEW' }], source: 'sp2-collection' });
  });
  it('no documents (legacy embedded addresses, or the read failed) → what the push carried', () => {
    expect(pickSp2Addresses([], [{ id: 'x' }])).toEqual({ addresses: [{ id: 'x' }], source: 'payload' });
    expect(pickSp2Addresses(null, [{ id: 'x' }])).toEqual({ addresses: [{ id: 'x' }], source: 'payload' });
  });
  it('nothing anywhere → null (keep what SP1 has)', () => {
    expect(pickSp2Addresses(null, undefined)).toEqual({ addresses: null, source: 'payload' });
  });
});

describe('F8.1 isOlderAddressSnapshot', () => {
  it('an older read never overwrites a newer one', () => {
    expect(isOlderAddressSnapshot(2000, 1000)).toBe(true);
    expect(isOlderAddressSnapshot(new Date(2000).toISOString(), 1000)).toBe(true);
  });
  it('same time or newer → write', () => {
    expect(isOlderAddressSnapshot(1000, 1000)).toBe(false);
    expect(isOlderAddressSnapshot(1000, 2000)).toBe(false);
  });
  it('nothing saved yet → write', () => {
    expect(isOlderAddressSnapshot(undefined, 1000)).toBe(false);
    expect(isOlderAddressSnapshot(null, 1000)).toBe(false);
  });
});
