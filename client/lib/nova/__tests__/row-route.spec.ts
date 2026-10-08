/**
 * R1 — the route of a Nova row is the route of its CURRENT customer (client/lib/nova/row-route.ts).
 */
import { describe, it, expect } from 'vitest';
import { effectiveRowRuta } from '../row-route';

const base = { rutaOverrides: {} as Record<string, string> };

describe('R1 — row WITH a customer', () => {
  it('the route chosen this session for that customer wins', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL2', rowRuta: 'A', rutaOverrides: { SL2: 'Escazu' } })).toBe('Escazu');
  });
  it('a route learned for the manifest NAME never applies to a row with a customer', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: '', rowRuta: '', unmatchedNames: ['JUAN'],
      rutaOverrides: { __unmatched__JUAN: 'Cartago' }, customerRoute: 'Heredia' })).toBe('Heredia');
  });
  it('same customer as the processor, nothing chosen → customer route, else the processor route', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL2', rowRuta: 'A', customerRoute: 'B' })).toBe('B');
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL2', rowRuta: 'A' })).toBe('A');
  });
});

describe('R1 — customer CHANGED (pre-alert, admin, move to group)', () => {
  it("never the previous customer's route override", () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL1', rowRuta: 'A', rutaOverrides: { SL1: 'Ruta de SL1' }, customerRoute: 'Ruta de SL2' })).toBe('Ruta de SL2');
  });
  it("never the route the processor gave for the previous customer", () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL1', rowRuta: 'Ruta de SL1' })).toBe('');
  });
  it('the route that came with the reassignment (slCodeOverrides / matchOverrides)', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL1', rowRuta: 'Ruta de SL1', slCodeOverrideRuta: 'Ruta de SL2' })).toBe('Ruta de SL2');
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL1', rowRuta: 'Ruta de SL1', matchOverrideRuta: 'Ruta de SL2' })).toBe('Ruta de SL2');
  });
  it('the customer profile route wins over the one copied at reassignment (same as saving)', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'SL1', customerRoute: 'Actual', slCodeOverrideRuta: 'Copiada' })).toBe('Actual');
  });
  it('slCode case does not matter', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: 'SL2', rowSlCode: 'sl2', rowRuta: 'A' })).toBe('A');
  });
});

describe('Row WITHOUT a customer — unchanged behavior (not part of R1)', () => {
  it('the route of its unmatched group', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: '', rowSlCode: '', unmatchedNames: ['ANA', 'ANA R'], rutaOverrides: { '__unmatched__ANA R': 'Limon' } })).toBe('Limon');
  });
  it('never matched → the processor route (learned route for the name)', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: '', rowSlCode: '', rowRuta: 'Guanacaste' })).toBe('Guanacaste');
  });
  it('unlinked keeps the route it had (design of c17de000)', () => {
    expect(effectiveRowRuta({ ...base, effSlCode: '', rowSlCode: 'SL1', rowRuta: 'GAM Alajuela' })).toBe('GAM Alajuela');
  });
});
