// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { findCustomerMatch } from '../find-match';
import { invalidateCustomerCache } from '../customer-loader';
import { useNovaCustomerAssignment } from '@/hooks/use-nova-customer-assignment';
import type { ManifestRow } from '@/lib/services/manifest-processor';

// Local Mock Database
const mockDb = {
  customers: new Map<string, any>(),
};

// Mock Firebase Callable
vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(async () => {
        const listData = Array.from(mockDb.customers.values());
        return { success: true, data: { data: listData } };
      }),
    },
  },
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  dbSP2: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
}));

vi.mock('@/lib/services/match-learning', () => ({
  lookupLearnedRoute: vi.fn(() => null),
  saveMatchFeedback: vi.fn(async () => {}),
  loadLearnedMatches: vi.fn(async () => []),
  reloadLearnedMatches: vi.fn(async () => []),
  lookupLearned: vi.fn(() => null),
  hasLearnedCollision: vi.fn(() => false),
  isDominantCollisionWinner: vi.fn(() => false),
}));

function makeRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    tracking: '1Z000000',
    nombre: 'VALVERDE',
    guia: '1Z000000',
    manifiesto: 'MAN-TEST',
    peso: 1.0,
    precio: 10,
    slCode: '',
    nombreCliente: '',
    ruta: '',
    consolidacion: false,
    descripcion: '',
    permisos: false,
    pesoRedondeo: 1,
    diferenciaRedondeo: 0,
    pesoConsolidacion: 0,
    precioSinPermiso: 10,
    precioConPermiso: 10,
    matchScore: 0,
    originalData: {},
    ...overrides,
  } as ManifestRow;
}

describe('Single-Token Generic Surname Protection Suite (VALVERDE, RODRIGUEZ, PEREZ)', () => {
  beforeEach(() => {
    mockDb.customers.clear();
    invalidateCustomerCache();

    // Populate mock DB with typical Latin American homonyms / same surnames
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL26082',
      fullName: 'ALLAN VALVERDE',
      normalizedName: 'ALLAN VALVERDE',
      name: 'ALLAN VALVERDE',
      ruta: 'San Jose Centro',
      consolidationEnabled: false,
    });
    mockDb.customers.set('c2', {
      id: 'c2',
      slCode: 'SL5001',
      fullName: 'MARIA VALVERDE ROJAS',
      normalizedName: 'MARIA VALVERDE ROJAS',
      name: 'MARIA VALVERDE ROJAS',
      ruta: 'Cartago',
      consolidationEnabled: false,
    });
    mockDb.customers.set('c3', {
      id: 'c3',
      slCode: 'SL5002',
      fullName: 'JUAN RODRIGUEZ HERRERA',
      normalizedName: 'JUAN RODRIGUEZ HERRERA',
      name: 'JUAN RODRIGUEZ HERRERA',
      ruta: 'Alajuela',
      consolidationEnabled: false,
    });
  });

  describe('findCustomerMatch — single token safety gate', () => {
    it('does NOT auto-assign an isolated single-token surname ("VALVERDE") to ALLAN VALVERDE', async () => {
      const res = await findCustomerMatch('VALVERDE');
      
      // Must NOT be considered an exact match
      expect(res.exactMatch).toBe(false);
      // slCode MUST be undefined to prevent automatic forced association
      expect(res.slCode).toBeUndefined();
      expect(res.ruta).toBeUndefined();
      // Must require user choice / manual operator inspection
      expect(res.requiresUserChoice).toBe(true);
      // Candidates are still available for manual selection
      expect(res.candidates.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT auto-assign "RODRIGUEZ" to JUAN RODRIGUEZ HERRERA', async () => {
      const res = await findCustomerMatch('RODRIGUEZ');
      expect(res.exactMatch).toBe(false);
      expect(res.slCode).toBeUndefined();
      expect(res.requiresUserChoice).toBe(true);
    });

    it('DOES auto-assign when full name with 2+ tokens is provided ("ALLAN VALVERDE")', async () => {
      const res = await findCustomerMatch('ALLAN VALVERDE');
      expect(res.exactMatch).toBe(true);
      expect(res.slCode).toBe('SL26082');
      expect(res.ruta).toBe('San Jose Centro');
      expect(res.requiresUserChoice).toBe(false);
    });
  });

  describe('useNovaCustomerAssignment — handleUnlinkAndRematch & applyNameAndMatch with single tokens', () => {
    it('leaves single-token surname ("VALVERDE") unlinked (slCode: "") when revalidating', async () => {
      const rows = [makeRow({ nombre: 'VALVERDE', tracking: 'TRK-VALVERDE-1' })];
      const setRutaOverrides = vi.fn();

      const { result } = renderHook(() =>
        useNovaCustomerAssignment({
          showTable: true,
          resultDataRows: rows,
          setRutaOverrides,
          skipAutoValidation: true,
        })
      );

      // Trigger rematch for row 0 with generic single surname "VALVERDE"
      await act(async () => {
        await result.current.handleUnlinkAndRematch([0], () => 'VALVERDE');
      });

      // Row MUST remain in unlinkedRows (section Sin Cliente)
      expect(result.current.unlinkedRows.has(0)).toBe(true);
      // Must NOT have assigned slCodeOverrides
      expect(result.current.slCodeOverrides[0]).toBeUndefined();
      expect(result.current.matchOverrides[0]).toBeUndefined();
    });

    it('successfully rematches full 2+ token name ("ALLAN VALVERDE") to SL26082 and clears unlinked status', async () => {
      const rows = [makeRow({ nombre: 'ALLAN VALVERDE', tracking: 'TRK-VALVERDE-2' })];
      const setRutaOverrides = vi.fn();

      const { result } = renderHook(() =>
        useNovaCustomerAssignment({
          showTable: true,
          resultDataRows: rows,
          setRutaOverrides,
          skipAutoValidation: true,
        })
      );

      // Trigger rematch for row 0 with full name "ALLAN VALVERDE"
      await act(async () => {
        await result.current.handleUnlinkAndRematch([0], () => 'ALLAN VALVERDE');
      });

      // Row MUST NOT be in unlinkedRows because confident match was found
      expect(result.current.unlinkedRows.has(0)).toBe(false);
      // Must have assigned SL26082
      expect(result.current.slCodeOverrides[0]?.slCode).toBe('SL26082');
      expect(result.current.matchOverrides[0]?.slCode).toBe('SL26082');
    });

    it('does NOT auto-match when renamed to an isolated surname via applyNameAndMatch', async () => {
      const rows = [makeRow({ nombre: 'UNKNOWN-NAME', tracking: 'TRK-VALVERDE-3' })];
      const setRutaOverrides = vi.fn();

      const { result } = renderHook(() =>
        useNovaCustomerAssignment({
          showTable: true,
          resultDataRows: rows,
          setRutaOverrides,
          skipAutoValidation: true,
        })
      );

      // Operator renames to single surname "VALVERDE"
      await act(async () => {
        await result.current.applyNameAndMatch([0], 'VALVERDE');
      });

      // Must NOT auto-assign SL26082
      expect(result.current.slCodeOverrides[0]).toBeUndefined();
      expect(result.current.matchOverrides[0]).toBeUndefined();
    });
  });
});
