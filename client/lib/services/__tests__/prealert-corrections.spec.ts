import { describe, it, expect } from 'vitest';
import { planPreAlertCorrections } from '../prealert-corrections';

const profiles = new Map([
  ['SL90001', { slCode: 'SL90001', fullName: 'Cliente Uno', ruta: 'Escazu' }],
  ['SL90002', { slCode: 'SL90002', fullName: 'Cliente Dos', ruta: '' }],
]);
const map = new Map<string, any>([
  ['T1', { found: true, slCode: 'SL90001' }],
  ['T2', { found: true, slCode: 'SL90002' }],
  ['T3', { found: true, slCode: 'SL424242' }],                       // customer does not exist in SP1
  ['T4', { found: false, ambiguousSlCodes: ['SL90001', 'SL90002'] }],
]);
const ctx = (approved: number[] = [], preAlertAssigned: number[] = []) =>
  ({ preAlertMap: map, approved: new Set(approved), preAlertAssigned: new Set(preAlertAssigned), profiles });

describe('planPreAlertCorrections (N11)', () => {
  it('row matched by name to another customer → corrected to the pre-alert owner (unchanged behavior)', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 't1', currentSlCode: 'SL90002' }], ctx());
    expect(p.apply).toEqual([{ idx: 0, slCode: 'SL90001', fullName: 'Cliente Uno', ruta: 'Escazu' }]);
  });
  it('row without customer or with a temp SL-NAN → corrected', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 'T1', currentSlCode: '' }, { idx: 1, tracking: 'T2', currentSlCode: 'SL-NAN-7' }], ctx([1]));
    expect(p.apply.map(a => a.idx)).toEqual([0, 1]);
  });
  it('already right → nothing', () => {
    expect(planPreAlertCorrections([{ idx: 0, tracking: 'T1', currentSlCode: 'SL90001' }], ctx()).apply).toEqual([]);
  });
  it('OPERATOR chose another customer by hand → NOT overwritten, reported (before: overwritten)', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 'T1', currentSlCode: 'SL90002' }], ctx([0]));
    expect(p.apply).toEqual([]);
    expect(p.skippedManual).toEqual([0]);
  });
  it('approved only because a pre-alert assigned it earlier → still corrected (not an operator choice)', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 'T1', currentSlCode: 'SL90002' }], ctx([0], [0]));
    expect(p.apply.map(a => a.idx)).toEqual([0]);
  });
  it('pre-alert customer missing in SP1 → not applied, reported (before: invented "Cliente Pre-alertado")', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 'T3', currentSlCode: 'SL90001' }], ctx());
    expect(p.apply).toEqual([]);
    expect(p.missingCustomer).toEqual([0]);
  });
  it('2+ accounts → reported as ambiguous, never assigned', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 'T4', currentSlCode: 'SL90001' }], ctx());
    expect(p.apply).toEqual([]);
    expect(p.ambiguous).toEqual([0]);
  });
});

describe('planPreAlertCorrections — F1.6 repeated tracking', () => {
  it('tracking repeated in the manifest → reported, never assigned', () => {
    const p = planPreAlertCorrections(
      [{ idx: 0, tracking: 'T1', currentSlCode: '' }, { idx: 1, tracking: 'T1', currentSlCode: 'SL90002' }],
      { ...ctx(), repeated: new Set([0, 1]) },
    );
    expect(p.apply).toEqual([]);
    expect(p.repeated).toEqual([0, 1]);
  });
  it('several accounts wins over repeated (reported once, as ambiguous)', () => {
    const p = planPreAlertCorrections([{ idx: 0, tracking: 'T4', currentSlCode: '' }], { ...ctx(), repeated: new Set([0]) });
    expect(p.ambiguous).toEqual([0]);
    expect(p.repeated).toEqual([]);
  });
});

