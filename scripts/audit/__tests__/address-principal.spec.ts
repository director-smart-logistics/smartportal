import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const { principalOf, canonicalAddress, sameAddress, labelFingerprint, CANONICAL_KEYS } = createRequire(import.meta.url)('../address-principal.cjs');

const A = (id: string, extra: Record<string, unknown> = {}) => ({ id, streetAddress: `Calle ${id}`, province: 'San José', canton: 'Escazú', district: 'San Rafael', ...extra });

describe('F12 principalOf (shared by audit and migration)', () => {
  it('the marked one; the collection wins over the embedded copy', () => {
    const p = principalOf([A('a'), A('b', { isPrimary: true })], [A('x', { isDefault: true })], null);
    expect(p).toMatchObject({ source: 'collection', active: 2, ambiguous: false }); expect(p.principal.id).toBe('b');
  });
  it('inactive addresses never count', () => {
    expect(principalOf([A('a', { isPrimary: true, isActive: false }), A('b')], [], null).principal.id).toBe('b');
    expect(principalOf([A('a', { status: 'inactive', isPrimary: true })], [], null)).toMatchObject({ principal: null, source: 'none' });
  });
  it('no collection documents → the embedded ones', () => {
    expect(principalOf([], [A('e', { isDefault: true })], null)).toMatchObject({ source: 'embedded' });
  });
  it('several marked (ambiguous) → the one SP1 prints today', () => {
    const p = principalOf([A('a', { isPrimary: true, updatedAt: '2026-09-01' }), A('b', { isPrimary: true, updatedAt: '2026-01-01' })], [], A('b'));
    expect(p).toMatchObject({ ambiguous: true }); expect(p.principal.id).toBe('b');
  });
  it('none marked → the oldest active one', () => {
    expect(principalOf([A('n', { createdAt: '2026-05-01' }), A('o', { createdAt: '2026-01-01' })], [], null).principal.id).toBe('o');
  });
});

describe('F12 canonicalAddress — clean block, SAME values', () => {
  const src = { ...A('a', { deliveryInstructions: '  Portón  negro ', coordinates: { lat: 1, lng: 2 }, alias: 'Casa', isPrimary: false, mergedFrom: 'x', junk: 1, details: '', encomienda: null }), userId: 'u1' };
  const c = canonicalAddress(src, 'u1');
  it('never rewrites the address text (only structure)', () => {
    expect(c.deliveryInstructions).toBe('  Portón  negro ');
    expect(sameAddress(c, src)).toBe(true);
    expect(labelFingerprint(c)).toBe(labelFingerprint(src));
  });
  it('fixed key set: unknown/empty keys dropped, principal flags set', () => {
    expect(Object.keys(c).every((k) => [...CANONICAL_KEYS, 'isDefault', 'isPrimary', 'isActive', 'status'].includes(k))).toBe(true);
    expect(c).not.toHaveProperty('junk'); expect(c).not.toHaveProperty('mergedFrom'); expect(c).not.toHaveProperty('details'); expect(c).not.toHaveProperty('encomienda');
    expect(c).toMatchObject({ isDefault: true, isPrimary: true, isActive: true, status: 'active', userId: 'u1', id: 'a' });
  });
});

describe('F12 legacy field names (same mapping SP1 applies on receive)', () => {
  const legacy = { id: 'L', detail: 'Barrio X casa 5', contactName: 'Ana', contactPhone: '8888-8888', deliveryNotes: 'Portón', label: 'Casa', province: 'Heredia' };
  it('the text moves to the standard field; nothing is lost', () => {
    expect(canonicalAddress(legacy, 'u')).toMatchObject({ streetAddress: 'Barrio X casa 5', recipientName: 'Ana', recipientPhone: '8888-8888', deliveryInstructions: 'Portón', alias: 'Casa' });
  });
  it('a label prints the same thing before and after', () => {
    expect(labelFingerprint(canonicalAddress(legacy, 'u'))).toBe(labelFingerprint(legacy));
    expect(sameAddress(canonicalAddress(legacy, 'u'), { streetAddress: 'Barrio X casa 5', recipientName: 'Ana', recipientPhone: '8888-8888', deliveryInstructions: 'Portón', province: 'Heredia' })).toBe(true);
  });
  it('the standard field wins over the legacy one when both exist', () => {
    expect(canonicalAddress({ streetAddress: 'Nueva', detail: 'Vieja' }, 'u').streetAddress).toBe('Nueva');
  });
});
