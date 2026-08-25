import { describe, it, expect } from 'vitest';
import { extractDistrictFromAddress } from '../location-utils';

describe('extractDistrictFromAddress', () => {
  it('extracts Concepción from Google geocoded plus-code string', () => {
    const addr = 'W293+G4R, Provincia de Cartago, Concepción, Costa Rica';
    expect(extractDistrictFromAddress(addr)).toBe('Concepción');
  });

  it('extracts Guadalupe (Arenilla) from structured Cartago address', () => {
    const addr = 'Cartago, Guadalupe (Arenilla), Central';
    expect(extractDistrictFromAddress(addr)).toBe('Guadalupe (Arenilla)');
  });

  it('extracts San Rafael from long descriptive address text', () => {
    const addr = 'De la iglesia católica de caballo blanco 25 m este 300 m norte 125 m.este casa de 2 plantas color beige portón café a mano derecha, San Rafael';
    expect(extractDistrictFromAddress(addr)).toBe('San Rafael');
  });

  it('extracts San Rafael from standard Costa Rica 3-part address', () => {
    const addr = '150m este de la plaza, San Rafael, La Unión';
    expect(extractDistrictFromAddress(addr)).toBe('San Rafael');
  });

  it('extracts Curridabat from address mentioning Curridabat', () => {
    const addr = 'Curridabat, San José, 200m sur de Pops';
    expect(extractDistrictFromAddress(addr)).toBe('Curridabat');
  });

  it('extracts San Pedro from address mentioning San Pedro', () => {
    const addr = 'San Pedro, Montes de Oca, Barrio Dent';
    expect(extractDistrictFromAddress(addr)).toBe('San Pedro');
  });

  it('extracts Sabanilla from San José plus code address (Kenisha Mc Dougal)', () => {
    const addr = 'WXV9+WG4, San José, Sabanilla, Costa Rica';
    expect(extractDistrictFromAddress(addr)).toBe('Sabanilla');
  });

  it('extracts Carmen from Central Cartago address (Jonathan Andres Aguirre Mata)', () => {
    const addr = 'Del Campo Santo San Blas, 100 Norte y 200 Oeste Urb. La Esperanza, Carmen, Central';
    expect(extractDistrictFromAddress(addr)).toBe('Carmen');
  });

  it('extracts Curridabat from geocoded address with neighborhood (Ana Elena Moraga Lopez)', () => {
    const addr = 'WW7X+PXC, San José, Curridabat, Maria Auxiliadora, Costa Rica';
    expect(extractDistrictFromAddress(addr)).toBe('Curridabat');
  });

  it('handles empty, null or undefined gracefully', () => {
    expect(extractDistrictFromAddress('')).toBeNull();
    expect(extractDistrictFromAddress(null)).toBeNull();
    expect(extractDistrictFromAddress(undefined)).toBeNull();
  });
});
