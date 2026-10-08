import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  CANONICAL_KEYS, LABEL_FIELDS, canonicalAddress, principalOf, currentSp2Principal,
  parseLabelAddressText, principalFromLabelText, canEditCustomerAddress,
} from '../src/customers/label-address-sp2';

const shared = createRequire(import.meta.url)('../../scripts/audit/address-principal.cjs');
const META = { userId: 'u1', updatedAt: '2026-09-25T12:00:00.000Z', updatedBy: 'admin@x' };
const P = { id: 'a1', streetAddress: 'Del Palí 200 m norte', details: 'Casa verde', deliveryInstructions: 'Llamar antes',
  province: 'San José', canton: 'Escazú', district: 'San Rafael', recipientName: 'Ana', encomienda: { name: 'Correos de Costa Rica' },
  userId: 'u1', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', isDefault: true };

describe('F11.2 same rule as F12 (scripts/audit/address-principal.cjs)', () => {
  it('same keys and label fields', () => {
    expect(CANONICAL_KEYS).toEqual(shared.CANONICAL_KEYS);
    expect(LABEL_FIELDS).toEqual(shared.LABEL_FIELDS);
  });
  it('same block and same principal', () => {
    const legacy = { id: 'x', direccionExacta: 'Calle 1', contactName: 'Ana', province: 'Cartago', foo: 1 };
    expect(canonicalAddress(legacy, 'u')).toEqual(shared.canonicalAddress(legacy, 'u'));
    const list = [{ ...P, id: 'b', isDefault: false }, { ...P, id: 'c', isPrimary: true, updatedAt: '2026-01-01' }, P];
    expect(principalOf(list, [], null).principal?.id).toBe(shared.principalOf(list, [], null).principal.id);
  });
});

describe('F11.2 parseLabelAddressText (inverse of the Nova label textarea)', () => {
  it('first line street, middle lines details, "Instrucciones:" line instructions', () => {
    expect(parseLabelAddressText('Calle 5\nCasa 3\nPortón negro\nInstrucciones: tocar timbre')).toEqual({ streetAddress: 'Calle 5', details: 'Casa 3\nPortón negro', deliveryInstructions: 'tocar timbre' });
  });
  it('no instructions line → undefined (keep the customer\'s)', () => {
    expect(parseLabelAddressText('  Calle 5 \n\n').deliveryInstructions).toBeUndefined();
    expect(parseLabelAddressText('Calle 5').details).toBe('');
  });
});

describe('F11.2 principalFromLabelText', () => {
  it('the text the modal shows unchanged → nothing to write', () => {
    expect(principalFromLabelText(P, 'Del Palí 200 m norte\nCasa verde\nInstrucciones: Llamar antes', META)).toBeNull();
  });
  it('instructions omitted by the modal (repeated) are kept, not erased', () => {
    expect(principalFromLabelText(P, 'Del Palí 200 m norte\nCasa verde', META)).toBeNull();
  });
  it('a corrected street keeps province/canton/district, recipient and encomienda', () => {
    const b = principalFromLabelText(P, 'Del Palí 300 m norte\nCasa verde\nInstrucciones: Llamar antes', META)!;
    expect(b).toMatchObject({ id: 'a1', streetAddress: 'Del Palí 300 m norte', details: 'Casa verde', deliveryInstructions: 'Llamar antes',
      province: 'San José', canton: 'Escazú', district: 'San Rafael', recipientName: 'Ana', encomienda: { name: 'Correos de Costa Rica' },
      createdAt: P.createdAt, updatedAt: META.updatedAt, updatedBy: 'admin@x', isDefault: true, isPrimary: true, isActive: true, status: 'active' });
  });
  it('NOTHING IS ERASED: no details line / empty "Instrucciones:" keep the customer\'s otras señas and notes', () => {
    const b = principalFromLabelText(P, 'Del Palí 300 m norte\nInstrucciones:', META)!;
    expect(b.streetAddress).toBe('Del Palí 300 m norte');
    expect(b.details).toBe('Casa verde');
    expect(b.deliveryInstructions).toBe('Llamar antes');
    expect(principalFromLabelText(P, 'Del Palí 200 m norte\nInstrucciones:', META)).toBeNull();
  });
  it('legacy field names are normalized and their values kept', () => {
    const legacy = { id: 'l', direccionExacta: 'Viejo', addressDetail: 'Detalle viejo', province: 'Heredia' };
    const b = principalFromLabelText(legacy, 'Nuevo', META)!;
    expect(b.streetAddress).toBe('Nuevo');
    expect(b.details).toBe('Detalle viejo');
    expect(Object.keys(b).some((k) => ['direccionExacta', 'addressDetail'].includes(k))).toBe(false);
  });
});

describe('F11.2 currentSp2Principal', () => {
  it('single-v1: the users doc block', () => {
    expect(currentSp2Principal({ addressModel: 'single-v1', defaultAddress: P }, [{ ...P, id: 'old' }], null).principal?.id).toBe('a1');
  });
  it('single-v1 without address → none (never invent one)', () => {
    expect(currentSp2Principal({ addressModel: 'single-v1', defaultAddress: null }, [], null).principal).toBeNull();
  });
  it('legacy: the collection, ambiguous when several are marked', () => {
    const r = currentSp2Principal({}, [{ ...P, id: 'x' }, { ...P, id: 'y' }], null);
    expect(r.ambiguous).toBe(true);
    expect(currentSp2Principal({}, [{ ...P, id: 'x', isDefault: false }], null)).toMatchObject({ ambiguous: false, principal: { id: 'x' } });
  });
});

it('F11.2 only staff roles may change a customer address', () => {
  for (const r of ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'AGENT', 'STAFF', 'admin']) expect(canEditCustomerAddress(r)).toBe(true);
  for (const r of ['DELIVERY', 'CUSTOMER', '', undefined]) expect(canEditCustomerAddress(r)).toBe(false);
});

describe('2026-09-27: labels print "Distrito, Cantón, Provincia" — never taken as street/details', () => {
  it('the full label text unchanged (with the location line) → nothing to write', () => {
    expect(principalFromLabelText(P, 'Del Palí 200 m norte\nCasa verde\nSan Rafael, Escazú, San José\nInstrucciones: Llamar antes', META)).toBeNull();
  });
  it('a corrected street with the location line → only the street changes; details stay "Casa verde"', () => {
    const b = principalFromLabelText(P, 'Del Palí 400 m norte\nCasa verde\nSan Rafael, Escazú, San José\nInstrucciones: Llamar antes', META)!;
    expect(b).toMatchObject({ streetAddress: 'Del Palí 400 m norte', details: 'Casa verde', province: 'San José', canton: 'Escazú', district: 'San Rafael' });
  });
  it('accents / order / partial location lines are recognised too', () => {
    expect(parseLabelAddressText('Calle 1\nsan jose, escazu\nCasa verde', P)).toEqual({ streetAddress: 'Calle 1', details: 'Casa verde', deliveryInstructions: undefined });
  });
  it('a line with other words is NOT a location line (kept as details)', () => {
    expect(parseLabelAddressText('Calle 1\nFrente a la iglesia de Escazú', P).details).toBe('Frente a la iglesia de Escazú');
  });
  it('without the current address the parser works as before', () => {
    expect(parseLabelAddressText('Calle 1\nSan Rafael, Escazú, San José').details).toBe('San Rafael, Escazú, San José');
  });
});
