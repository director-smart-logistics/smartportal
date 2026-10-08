import { describe, it, expect } from 'vitest';
import { preAlertBadgeFor, namesLookAlike } from '../prealert-badge';

describe('preAlertBadgeFor (N10 + decision a)', () => {
  it('no pre-alert → none', () => {
    expect(preAlertBadgeFor({ info: null })).toEqual({ kind: 'none' });
    expect(preAlertBadgeFor({ info: { found: false } })).toEqual({ kind: 'none' });
  });
  it('pre-alert WITHOUT stored owner → none (never the row\'s own customer)', () => {
    expect(preAlertBadgeFor({ info: { found: true }, manifestName: 'JUAN PEREZ', customerName: 'JUAN PEREZ' })).toEqual({ kind: 'none' });
    expect(preAlertBadgeFor({ info: { found: true, slCode: 'PENDIENTE' } })).toEqual({ kind: 'none' });
  });
  it('stored owner on the row (saved manifest) is accepted', () => {
    expect(preAlertBadgeFor({ info: { found: true }, rowPreAlertSlCode: 'sl162' })).toEqual({ kind: 'match', slCode: 'SL162', nameMismatch: false });
  });
  it('2+ accounts → several (RED P, F1.6) with both slCodes', () => {
    expect(preAlertBadgeFor({ info: { found: false, ambiguousSlCodes: ['SL90001', 'SL90002'] } })).toEqual({ kind: 'several', reason: 'accounts', slCodes: ['SL90001', 'SL90002'] });
  });
  it('owner whose name resembles the manifest name → match without warning', () => {
    expect(preAlertBadgeFor({ info: { found: true, slCode: 'SL162' }, manifestName: 'JIMENA', customerName: 'Jimena Gamboa Abarca' }))
      .toEqual({ kind: 'match', slCode: 'SL162', nameMismatch: false });
  });
  it('owner with a different name → match WITH warning (decision a: pre-alert wins, operator is told)', () => {
    expect(preAlertBadgeFor({ info: { found: true, slCode: 'SL90002' }, manifestName: 'PERSONA NUEVA', customerName: 'Cliente Dos' }))
      .toEqual({ kind: 'match', slCode: 'SL90002', nameMismatch: true });
  });
});

describe('namesLookAlike', () => {
  it.each([
    ['JIMENA', 'Jimena Gamboa Abarca', true],
    ['JOSÉ PÉREZ', 'Jose Perez Mora', true],
    ['GILBERTO JIMENEZ ESPINOZA', 'GILBERTO JIMENEZ ESPINOZA', true],
    ['PERSONA NUEVA', 'Cliente Dos', false],
    ['', 'Cliente Dos', true],                 // nothing to compare → no warning
    ['AB', 'Cliente Dos', true],               // only short tokens → no warning
  ])('%j vs %j → %s', (a, b, expected) => expect(namesLookAlike(a, b)).toBe(expected));
});

describe('F1.6 — tracking repeated in the manifest → several (RED P), never a green P', () => {
  it('one owner but the tracking appears twice in the manifest → several / repeated', () => {
    expect(preAlertBadgeFor({ info: { found: true, slCode: 'SL90001' }, repeatedInManifest: true }))
      .toEqual({ kind: 'several', reason: 'repeated', slCodes: ['SL90001'] });
  });
  it('2+ accounts AND repeated → several / accounts (the stronger reason)', () => {
    expect(preAlertBadgeFor({ info: { found: false, ambiguousSlCodes: ['SL1', 'SL2'] }, repeatedInManifest: true }))
      .toEqual({ kind: 'several', reason: 'accounts', slCodes: ['SL1', 'SL2'] });
  });
  it('repeated but no pre-alert → no P (the P is only about pre-alerts)', () => {
    expect(preAlertBadgeFor({ info: { found: false }, repeatedInManifest: true })).toEqual({ kind: 'none' });
    expect(preAlertBadgeFor({ info: null, repeatedInManifest: true })).toEqual({ kind: 'none' });
  });
  it('not repeated → unchanged (green match)', () => {
    expect(preAlertBadgeFor({ info: { found: true, slCode: 'SL90001' }, repeatedInManifest: false }))
      .toEqual({ kind: 'match', slCode: 'SL90001', nameMismatch: false });
  });
});
