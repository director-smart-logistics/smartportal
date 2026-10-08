import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const { classify, textForSp2 } = createRequire(import.meta.url)('../cleanup-admin-overrides.cjs');

const P = { streetAddress: 'Del parque 100 m sur', details: 'Casa azul', deliveryInstructions: 'Llamar', district: 'San Pedro', canton: 'Barva', province: 'Heredia',
  isDefault: true, updatedAt: '2026-03-01T00:00:00.000Z', encomienda: { name: 'Correos de Costa Rica' } };
const C = (text: string, extra: Record<string, unknown> = {}, o: Record<string, unknown> = {}) => ({ defaultAddress: P, adminAddressOverride: { deliveryAddress: text, courierService: 'Correos de Costa Rica', ...o }, ...extra });

describe('F11.3 classify — by CONTENT (every word and number), never by dates; nothing is lost', () => {
  it('same content, other format / accents / case / line breaks → IGUAL', () => {
    expect(classify(C('del parque 100 m sur, casa azul\nInstrucciones: LLAMAR')).kind).toBe('IGUAL');
    expect(classify(C('Del parque 100 m sur\nCasa azul\nSan Pedro, Barva, Heredia\nInstrucciones: Llamar')).kind).toBe('IGUAL');   // geography is not new
  });
  it('the admin ADDED information and lacks nothing → A_SP2', () => {
    const r = classify(C('Del parque 100 m sur\nCasa azul, portón negro\nInstrucciones: Llamar, dejar en sucursal 12'));
    expect(r.kind).toBe('A_SP2');
    expect(r.adminOnly).toEqual(expect.arrayContaining(['porton', 'negro', 'dejar', 'sucursal', '12']));
  });
  it('numbers always count: 100 m vs 300 m is different information', () => {
    expect(classify(C('Del parque 300 m sur\nCasa azul\nInstrucciones: Llamar')).kind).toBe('REVISAR');
  });
  it('the customer has something the admin text lacks → REVISAR (not touched)', () => {
    expect(classify(C('Del parque 100 m sur\nInstrucciones: Llamar')).why).toMatch(/la del cliente trae/);
  });
  it('both have their own information → REVISAR', () => {
    expect(classify(C('Del parque 100 m sur\nCasa roja\nInstrucciones: Llamar')).why).toMatch(/las dos/);
  });
  it('other encomienda service, no customer address, no street → REVISAR; dated → YA_FECHADA; empty → VACIO', () => {
    expect(classify(C('Del parque 100 m sur\nCasa azul\nInstrucciones: Llamar', {}, { courierService: 'Tracopa' })).kind).toBe('REVISAR');
    expect(classify(C('X', { defaultAddress: null })).kind).toBe('REVISAR');
    expect(classify(C('Instrucciones: algo')).kind).toBe('REVISAR');
    expect(classify(C('Del parque 300 m sur', {}, { savedAt: '2026-09-25' })).kind).toBe('YA_FECHADA');
    expect(classify(C('  ')).kind).toBe('VACIO');
  });
});

describe('F11.3 textForSp2', () => {
  it('drops only lines that repeat the customer geography; keeps every other line', () => {
    expect(textForSp2('Calle 1\nSan Pedro, Barva, Heredia\nPortón negro\nInstrucciones: Llamar', P)).toBe('Calle 1\nPortón negro\nInstrucciones: Llamar');
    expect(textForSp2('Calle 1\nSan Pedro de Montes de Oca', P)).toBe('Calle 1\nSan Pedro de Montes de Oca');   // another place = information, kept
  });
});
