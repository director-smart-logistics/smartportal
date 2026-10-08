// @vitest-environment jsdom
/**
 * N15 (docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md): an assignment that comes from a
 * PRE-ALERT identifies ONE package. It must not spread to other rows with the same manifest name
 * and must never be learned as "manifest name → customer". Operator (admin) assignments keep the
 * previous behavior exactly (twins + learning).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ saveMatchFeedback: vi.fn(async () => undefined) }));

vi.mock('@/lib/services/customer-matcher', () => ({
  searchCustomersLocal: vi.fn(async () => []),
  findCustomerMatch: vi.fn(async () => ({ exactMatch: false, candidates: [] })),
  getCustomerBySlCode: vi.fn(() => undefined),
}));
vi.mock('@/lib/services/manifest-processor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/manifest-processor')>();
  return { ...actual, createOrGetTempCustomer: vi.fn(async () => ({})) };
});
vi.mock('@/lib/services/match-learning', () => ({
  lookupLearnedRoute: vi.fn(() => null),
  loadLearnedMatches: vi.fn(async () => []),
  reloadLearnedMatches: vi.fn(async () => []),
  lookupLearned: vi.fn(() => null),
  hasLearnedCollision: vi.fn(() => false),
  isDominantCollisionWinner: vi.fn(() => false),
  forgetMatchFeedback: vi.fn(async () => undefined),
  saveMatchFeedback: h.saveMatchFeedback,
}));
vi.mock('@/lib/services/temp-customers-service', () => ({ deleteTempCustomer: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/customer-sync', () => ({ updateCustomerRuta: vi.fn(async () => undefined) }));

import { useNovaCustomerAssignment } from '../use-nova-customer-assignment';
import type { ManifestRow } from '@/lib/services/manifest-processor';

const row = (tracking: string, nombre: string, slCode: string): ManifestRow => ({
  tracking, nombre, guia: tracking, manifiesto: 'MAN-QA', peso: 1, precio: 10, slCode, nombreCliente: nombre,
  ruta: '', consolidacion: false, descripcion: '', permisos: false, pesoRedondeo: 0, diferenciaRedondeo: 0,
  pesoConsolidacion: 0, precioSinPermiso: 10, precioConPermiso: 10, matchScore: 1, originalData: {},
} as ManifestRow);

// Two packages with the SAME manifest name ("JIMENA") — two different people in the real case.
const rows = [row('1Z1R054E0343790488', 'JIMENA', 'SL261320'), row('TBA330000000777', 'JIMENA', 'SL261320')];
const setup = () => renderHook(() => useNovaCustomerAssignment({
  showTable: true, resultDataRows: rows, setRutaOverrides: vi.fn(), skipAutoValidation: true,
}));

beforeEach(() => { h.saveMatchFeedback.mockClear(); });

describe('applyExplicitMatch — source pre_alert (N15)', () => {
  it('changes ONLY that row (no same-name spread), learns nothing, marks it as pre-alert assigned', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.applyExplicitMatch([0], { slCode: 'SL162', fullName: 'JIMENA GAMBOA ABARCA' }, { source: 'pre_alert' });
    });
    expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL162');
    expect(result.current.slCodeOverrides[1]).toBeUndefined();          // the other JIMENA is untouched
    expect(h.saveMatchFeedback).not.toHaveBeenCalled();                  // nothing learned
    expect([...result.current.preAlertAssignedRows]).toEqual([0]);
  });
});

describe('applyExplicitMatch — operator (admin) assignment keeps the previous behavior', () => {
  it('spreads to same-name rows and learns the mapping (unchanged)', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.applyExplicitMatch([0], { slCode: 'SL162', fullName: 'JIMENA GAMBOA ABARCA' });
    });
    expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL162');
    expect(result.current.slCodeOverrides[1]?.slCode).toBe('SL162');
    expect(h.saveMatchFeedback).toHaveBeenCalledWith(expect.objectContaining({ manifestName: 'JIMENA', slCode: 'SL162', source: 'admin_pick' }));
    expect(result.current.preAlertAssignedRows.size).toBe(0);
  });

  it('an operator decision after a pre-alert assignment clears the pre-alert mark (then it may be learned)', async () => {
    const { result } = setup();
    await act(async () => {
      result.current.applyExplicitMatch([0], { slCode: 'SL162', fullName: 'JIMENA GAMBOA ABARCA' }, { source: 'pre_alert' });
    });
    expect(result.current.preAlertAssignedRows.has(0)).toBe(true);
    await act(async () => {
      result.current.applyExplicitMatch([0], { slCode: 'SL261320', fullName: 'JIMENA CERDAS' });
    });
    expect(result.current.preAlertAssignedRows.has(0)).toBe(false);
  });
});

describe('handleUnlinkAndRematch (auto-validation) — rows kept on their pre-alert are marked (N15)', () => {
  it('the row kept on the pre-alert is marked; a row re-matched by name is not', async () => {
    const rws = [row('TBA333615177697', 'PERSONA NUEVA', ''), row('TBA330000000888', 'OTRA PERSONA', '')];
    const preAlertsMap = new Map([['TBA333615177697', { found: true, slCode: 'SL26356', clientName: 'Gino Marozzi' }]]);
    const { result } = renderHook(() => useNovaCustomerAssignment({
      showTable: true, resultDataRows: rws, setRutaOverrides: vi.fn(), skipAutoValidation: true, preAlertsMap,
    }));
    await act(async () => {
      await result.current.handleUnlinkAndRematch([0, 1], (i) => rws[i]?.nombre || '', undefined, { preAlertsMap });
    });
    expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL26356');   // unchanged behavior: pre-alert kept
    expect(result.current.preAlertAssignedRows.has(0)).toBe(true);         // …and now marked: never learned
    expect(result.current.preAlertAssignedRows.has(1)).toBe(false);
    expect(h.saveMatchFeedback).not.toHaveBeenCalled();
  });
});
