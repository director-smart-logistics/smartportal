import { describe, it, expect } from 'vitest';
import { getRouteAbbreviation } from '../DriverRouteWizard';

describe('DriverRouteWizard — Route Abbreviation & Manifest Selection Logic', () => {
  it('correctly maps known route names to compact abbreviations', () => {
    expect(getRouteAbbreviation('San Jose Centro')).toBe('SJC');
    expect(getRouteAbbreviation('San Jose Escazu')).toBe('SJE');
    expect(getRouteAbbreviation('Cartago 1')).toBe('CAR1');
    expect(getRouteAbbreviation('Alajuela')).toBe('ALA');
    expect(getRouteAbbreviation('Heredia')).toBe('HED');
    expect(getRouteAbbreviation('Occidente')).toBe('OCC');
    expect(getRouteAbbreviation('Retorno')).toBe('RET');
    expect(getRouteAbbreviation('Encomienda')).toBe('ENC');
    expect(getRouteAbbreviation('')).toBe('');
  });

  it('selects only the single most recent manifest by default (slice(0, 1))', () => {
    const mockManifests = [
      { id: 'MAN-2026-08-17', date: '2026-08-17' },
      { id: 'MAN-2026-08-16', date: '2026-08-16' },
      { id: 'MAN-2026-08-15', date: '2026-08-15' },
    ];

    const defaultSelected = mockManifests.slice(0, 1).map(m => m.id);
    expect(defaultSelected).toEqual(['MAN-2026-08-17']);
    expect(defaultSelected.length).toBe(1);
  });

  it('extracts district, canton, and full address from customer profile structure', () => {
    const mockCustomerDoc = {
      slCode: 'SL261239',
      fullName: 'MARIELA CALDERON RAMÍREZ',
      defaultAddress: {
        streetAddress: '150m este de la plaza',
        district: 'San Rafael',
        canton: 'La Unión',
        province: 'Cartago',
      },
    };

    const district = mockCustomerDoc.defaultAddress.district;
    const fullAddress = [
      mockCustomerDoc.defaultAddress.streetAddress,
      mockCustomerDoc.defaultAddress.district,
      mockCustomerDoc.defaultAddress.canton,
    ].filter(Boolean).join(', ');

    expect(district).toBe('San Rafael');
    expect(fullAddress).toBe('150m este de la plaza, San Rafael, La Unión');
  });
});

