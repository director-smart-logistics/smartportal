// @vitest-environment jsdom
/**
 * use-nova-customer-assignment.spec.ts
 *
 * Regression tests for the auto-validation behaviour of the Nova customer
 * assignment hook.
 *
 * ─── Why these tests exist ────────────────────────────────────────────────────
 *  Bug: when an operator opened a previously-saved manifest from Firestore
 *  (via "Cargar datos"), the one-shot auto-validation effect detected rows
 *  whose `nombre` (manifest text) diverged from the stored `nombreCliente`
 *  (assigned customer) and silently called `handleUnlinkAndRematch`,
 *  destroying manual links such as "PAULA UMANA" → "ANA PAULA FONSECA QUADROS".
 *
 *  Fix: a new `skipAutoValidation` parameter (set to true by the data-load
 *  pipeline through the `loadedFromFirestore` payload flag) short-circuits the
 *  effect so saved assignments are kept verbatim. Re-linking is now an
 *  explicit user action via the Acciones menu.
 *
 *  These tests freeze that contract:
 *    1. With `skipAutoValidation: true`, the effect MUST NOT touch state even
 *       if divergent rows are present.
 *    2. With `skipAutoValidation: false` (default), the effect MUST detect the
 *       divergent rows and populate `unlinkedRows` synchronously (the first
 *       step of `handleUnlinkAndRematch` runs before any async work).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/services/customer-matcher', () => ({
  searchCustomersLocal: vi.fn(async () => []),
  findCustomerMatch: vi.fn(async () => ({ exactMatch: false, candidates: [] })),
  getCustomerBySlCode: vi.fn((sl: string) => undefined),
}));

vi.mock('@/lib/services/manifest-processor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/manifest-processor')>();
  return {
    ...actual,
    createOrGetTempCustomer: vi.fn(async () => ({})),
  };
});

vi.mock('@/lib/services/match-learning', () => ({
  lookupLearnedRoute: vi.fn(() => null),
  loadLearnedMatches: vi.fn(async () => []),
  reloadLearnedMatches: vi.fn(async () => []),
  lookupLearned: vi.fn(() => null),
  hasLearnedCollision: vi.fn(() => false),
  isDominantCollisionWinner: vi.fn(() => false),
}));

import { useNovaCustomerAssignment } from '.././use-nova-customer-assignment';
import { findCustomerMatch, getCustomerBySlCode } from '@/lib/services/customer-matcher';
import type { ManifestRow } from '@/lib/services/manifest-processor';

function makeRow(overrides: Partial<ManifestRow>): ManifestRow {
  return {
    tracking:           '1Z0000',
    nombre:             'PAULA UMANA',
    guia:               '1Z0000',
    manifiesto:         'MEGA-MAN-24-04-2026',
    peso:               1,
    precio:             10,
    slCode:             'SL3521',
    nombreCliente:      'ANA PAULA FONSECA QUADROS',
    ruta:               'San Jose Centro',
    consolidacion:      false,
    descripcion:        'RELOJES',
    permisos:           false,
    pesoRedondeo:       0,
    diferenciaRedondeo: 0,
    pesoConsolidacion:  0,
    precioSinPermiso:   10,
    precioConPermiso:   10,
    matchScore:         1,
    originalData:       {},
    ...overrides,
  } as ManifestRow;
}

describe('useNovaCustomerAssignment — auto-validation toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips auto-revalidation when skipAutoValidation is true (Firestore-loaded data)', async () => {
    // Diverging row: nombre vs nombreCliente differ — would normally trigger
    // unlink + rematch. With skipAutoValidation=true it must remain untouched.
    const rows = [makeRow({})];
    const setRutaOverrides = vi.fn();

    const { result } = renderHook(() =>
      useNovaCustomerAssignment({
        showTable:          true,
        resultDataRows:     rows,
        setRutaOverrides,
        skipAutoValidation: true,
      })
    );

    // Allow any pending microtasks (effect + downstream handlers) to flush.
    await act(async () => { await Promise.resolve(); });

    expect(result.current.unlinkedRows.size).toBe(0);
    expect(Object.keys(result.current.slCodeOverrides)).toHaveLength(0);
    expect(Object.keys(result.current.matchOverrides)).toHaveLength(0);
  });

  // BUG-UNMATCHED-RELOAD-GROUPING-TEST 2026-08-07: Verify that route-based placeholder codes
  // and empty slCodes are correctly hydrated as unlinkedRows and nameOverrides on load when
  // skipAutoValidation is true, while real client codes remain matched.
  it('hydrates unlinkedRows and nameOverrides for unmatched/placeholder codes when skipAutoValidation is true', async () => {
    // 1st row has route-based slCode "Alajuela" (unmatched placeholder)
    // 2nd row has empty slCode "" (unmatched placeholder)
    // 3rd row has real client slCode "SL3521" (matched/linked)
    const rows = [
      makeRow({ slCode: 'Alajuela', nombreCliente: 'KEYLA MCDONALD' }),
      makeRow({ slCode: '', nombreCliente: 'MARIA PUERTO', tracking: '1Z0002' }),
      makeRow({ slCode: 'SL3521', nombreCliente: 'ANA PAULA', tracking: '1Z0003' }),
    ];
    const setRutaOverrides = vi.fn();

    const { result } = renderHook(() =>
      useNovaCustomerAssignment({
        showTable:          true,
        resultDataRows:     rows,
        setRutaOverrides,
        skipAutoValidation: true,
      })
    );

    await act(async () => { await Promise.resolve(); });

    // 1st and 2nd rows should be added to unlinkedRows
    expect(result.current.unlinkedRows.size).toBe(2);
    expect(result.current.unlinkedRows.has(0)).toBe(true);
    expect(result.current.unlinkedRows.has(1)).toBe(true);
    expect(result.current.unlinkedRows.has(2)).toBe(false);

    // nameOverrides should be populated with the saved names in uppercase
    expect(result.current.nameOverrides[0]).toBe('KEYLA MCDONALD');
    expect(result.current.nameOverrides[1]).toBe('MARIA PUERTO');
    expect(result.current.nameOverrides[2]).toBeUndefined();
  });

  it('runs auto-revalidation by default (fresh Excel parse)', async () => {
    const rows = [makeRow({ nombre: 'TOTALMENTE DIFERENTE 1' }), makeRow({ tracking: '1Z0001', nombre: 'OTRO NOMBRE' })];
    const setRutaOverrides = vi.fn();

    const { result } = renderHook(() =>
      useNovaCustomerAssignment({
        showTable:      true,
        resultDataRows: rows,
        setRutaOverrides,
      })
    );

    // BUG-VER-TABLA-FREEZE 2026-05-26: the rematch loop is now deferred via
    // requestIdleCallback (or setTimeout(0) in jsdom) so the table can paint
    // first. Wait one macrotask so the scheduled callback fires before we
    // assert on the resulting state.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    expect(result.current.unlinkedRows.size).toBe(2);
    expect(result.current.unlinkedRows.has(0)).toBe(true);
    expect(result.current.unlinkedRows.has(1)).toBe(true);
  });

  it('does not run auto-revalidation when showTable is false', async () => {
    const rows = [makeRow({})];
    const setRutaOverrides = vi.fn();

    const { result } = renderHook(() =>
      useNovaCustomerAssignment({
        showTable:      false,
        resultDataRows: rows,
        setRutaOverrides,
      })
    );

    await act(async () => { await Promise.resolve(); });

    expect(result.current.unlinkedRows.size).toBe(0);
  });

  it('does not run auto-revalidation when resultDataRows is empty', async () => {
    const setRutaOverrides = vi.fn();

    const { result } = renderHook(() =>
      useNovaCustomerAssignment({
        showTable:      true,
        resultDataRows: [],
        setRutaOverrides,
      })
    );

    await act(async () => { await Promise.resolve(); });

    expect(result.current.unlinkedRows.size).toBe(0);
  });

  it('does not target rows missing slCode/nombreCliente/nombre', async () => {
    const rows = [
      makeRow({ slCode: '' }),                                  // no slCode → ignored
      makeRow({ nombreCliente: '', tracking: '1Z0002' }),        // no nombreCliente → ignored
      makeRow({ nombre: '', tracking: '1Z0003' }),               // no nombre → ignored
      makeRow({ tracking: '1Z0004', nombre: 'TOTALMENTE DIFERENTE' }), // divergent → targeted
    ];
    const setRutaOverrides = vi.fn();

    const { result } = renderHook(() =>
      useNovaCustomerAssignment({
        showTable:      true,
        resultDataRows: rows,
        setRutaOverrides,
      })
    );

    // BUG-VER-TABLA-FREEZE 2026-05-26: wait for the deferred rematch tick.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    // Only the 4th row (index 3) should be flagged.
    expect(result.current.unlinkedRows.size).toBe(1);
    expect(result.current.unlinkedRows.has(3)).toBe(true);
  });

  describe('handleUnlinkAndRematch', () => {
    it('prioritizes Pre-alerts as SSOT and does not unlink verified pre-alerts', async () => {
      const rows = [
        makeRow({
          tracking: 'TBA333615177697',
          nombre: 'GIO MAROZZI',
          slCode: '',
          nombreCliente: '',
        }),
      ];
      const preAlertsMap = new Map([
        ['TBA333615177697', { found: true, slCode: 'SL26356', clientName: 'Gino Marozzi', ruta: 'Alajuela' }],
      ]);
      const setRutaOverrides = vi.fn();

      const { result } = renderHook(() =>
        useNovaCustomerAssignment({
          showTable: true,
          resultDataRows: rows,
          setRutaOverrides,
          skipAutoValidation: true,
          preAlertsMap,
        })
      );

      await act(async () => {
        await result.current.handleUnlinkAndRematch(
          [0],
          (i) => rows[i]?.nombre || '',
          undefined,
          { preAlertsMap }
        );
      });

      expect(result.current.unlinkedRows.has(0)).toBe(false);
      expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL26356');
      expect(result.current.matchOverrides[0]?.fullName).toBe('Gino Marozzi');
    });

    it('matches customer using findCustomerMatch when prefix or subset matches (e.g. Ivannia Oviedo Chavarria -> Ivannia Oviedo)', async () => {
      const rows = [
        makeRow({
          tracking: 'GFUS01065889160450',
          nombre: 'IVANNIA OVIEDO CHAVARRIA',
          slCode: '',
          nombreCliente: '',
        }),
      ];
      (findCustomerMatch as any).mockResolvedValueOnce({
        exactMatch: true,
        candidates: [{ customer: { slCode: 'SL261562', fullName: 'IVANNIA OVIEDO', ruta: 'Heredia' }, score: 0.91 }],
      });
      const setRutaOverrides = vi.fn();

      const { result } = renderHook(() =>
        useNovaCustomerAssignment({
          showTable: true,
          resultDataRows: rows,
          setRutaOverrides,
          skipAutoValidation: true,
        })
      );

      await act(async () => {
        await result.current.handleUnlinkAndRematch([0], (i) => rows[i]?.nombre || '');
      });

      expect(result.current.unlinkedRows.has(0)).toBe(false);
      expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL261562');
      expect(result.current.matchOverrides[0]?.fullName).toBe('IVANNIA OVIEDO');
    });

    it('preserves confident previous manifest match (score >= 0.85) when no other match found', async () => {
      const rows = [
        makeRow({
          tracking: '1Z52159RYW05455626',
          nombre: 'VALVERDE',
          slCode: 'SL1234',
          nombreCliente: 'VALVERDE',
          matchScore: 0.99,
          ruta: 'Cartago',
        }),
      ];
      (findCustomerMatch as any).mockResolvedValueOnce({
        exactMatch: false,
        candidates: [],
      });
      const setRutaOverrides = vi.fn();

      const { result } = renderHook(() =>
        useNovaCustomerAssignment({
          showTable: true,
          resultDataRows: rows,
          setRutaOverrides,
          skipAutoValidation: true,
        })
      );

      await act(async () => {
        await result.current.handleUnlinkAndRematch([0], (i) => rows[i]?.nombre || '');
      });

      expect(result.current.unlinkedRows.has(0)).toBe(false);
      expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL1234');
    });
  });
});
