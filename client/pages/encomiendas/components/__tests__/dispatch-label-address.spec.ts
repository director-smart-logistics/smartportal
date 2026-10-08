import { describe, it, expect } from 'vitest';
import { dispatchLabelAddress } from '../useEncomiendaDispatchData';
import { buildShippingLabelsHTML } from '../encomienda-shipping-label';

// F11 — the "Salida" shipping label prints the same address every label prints.
const principal = { streetAddress: 'Avenida Principal 500', details: 'Porton negro', district: 'Carmen', canton: 'San José', province: 'San José', isActive: true, updatedAt: '2026-09-01T00:00:00.000Z' };

describe('dispatchLabelAddress (Salida labels)', () => {
  it('prints street, otras señas and district / canton / province of the principal address', () => {
    expect(dispatchLabelAddress({ defaultAddress: principal })).toEqual({ streetAddress: 'Avenida Principal 500', details: 'Porton negro', geo: 'Carmen, San José, San José' });
  });

  it('never uses an inactive address', () => {
    const c = { addresses: [{ streetAddress: 'Calle Inactiva 1', province: 'San José', isActive: false, isDefault: true }, { ...principal }] };
    expect(dispatchLabelAddress(c).streetAddress).toBe('Avenida Principal 500');
  });

  it('the admin correction NEWER than the customer address wins (street / details left empty so the label prints it)', () => {
    const c = { defaultAddress: principal, adminAddressOverride: { deliveryAddress: 'Correccion admin 77', savedAt: '2026-09-20T00:00:00.000Z' } };
    expect(dispatchLabelAddress(c)).toEqual({ streetAddress: '', details: '', geo: '' });
  });

  it('an admin correction OLDER than the customer address does not apply', () => {
    const c = { defaultAddress: principal, adminAddressOverride: { deliveryAddress: 'Direccion vieja', savedAt: '2026-01-01T00:00:00.000Z' } };
    expect(dispatchLabelAddress(c).streetAddress).toBe('Avenida Principal 500');
  });

  it('no address → empty (the label shows "Consultar en oficina")', () => {
    expect(dispatchLabelAddress({})).toEqual({ streetAddress: '', details: '', geo: '' });
  });
});

describe('Salida label HTML', () => {
  const base = { customerName: 'Cliente', slCode: 'SL1', invoiceNumber: 'F1', items: [] } as any;
  it('prints district / canton / province under the street', () => {
    const html = buildShippingLabelsHTML([{ ...base, streetAddress: 'Avenida Principal 500', details: 'Porton negro', geo: 'Carmen, San José, San José' }]);
    expect(html).toContain('Avenida Principal 500');
    expect(html).toContain('Porton negro');
    expect(html).toContain('Carmen, San José, San José');
  });
  it('with the admin correction it prints the correction text', () => {
    const html = buildShippingLabelsHTML([{ ...base, address: 'Correccion admin 77' }]);
    expect(html).toContain('Correccion admin 77');
  });
});
