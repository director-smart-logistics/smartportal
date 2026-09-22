import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  cascadeCustomerNameUpdateToLearning, 
} from '../../match-learning';
import * as firestore from 'firebase/firestore';

// Mock Firebase Firestore
const mockDb = {
  match_feedback: new Map<string, any>(),
  manifest_learning_patterns: new Map<string, any>(),
};

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof firestore>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn((_db, name) => ({ _colName: name })),
    doc: vi.fn((_db, col, id) => ({ _colName: col, id, _path: `${col}/${id}` })),
    query: vi.fn((colRef, ...conditions) => ({ _colRef: colRef, _conditions: conditions })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    limit: vi.fn((n) => ({ limit: n })),
    serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP'),
    getDocs: vi.fn(async (q: any) => {
      const colName = q._colRef?._colName || q._colName;
      const targetMap = colName === 'match_feedback' 
        ? mockDb.match_feedback 
        : colName === 'manifest_learning_patterns' 
          ? mockDb.manifest_learning_patterns 
          : new Map();

      let entries = Array.from(targetMap.entries()).map(([id, data]) => ({
        id,
        ref: { id, _colName: colName },
        data: () => data,
      }));

      // Apply where filters
      if (q._conditions) {
        for (const cond of q._conditions) {
          if (cond.field && cond.op === '==' && cond.val !== undefined) {
            entries = entries.filter(e => e.data()[cond.field] === cond.val);
          }
        }
      }

      return {
        docs: entries,
        empty: entries.length === 0,
        size: entries.length,
        forEach: (cb: (doc: any) => void) => entries.forEach(cb),
      };
    }),
    writeBatch: vi.fn(() => {
      const operations: Array<() => void> = [];
      return {
        update: vi.fn((ref: any, data: any) => {
          operations.push(() => {
            const colName = ref._colName;
            const targetMap = colName === 'match_feedback' 
              ? mockDb.match_feedback 
              : mockDb.manifest_learning_patterns;
            const current = targetMap.get(ref.id) || {};
            targetMap.set(ref.id, { ...current, ...data });
          });
        }),
        delete: vi.fn((ref: any) => {
          operations.push(() => {
            const colName = ref._colName;
            const targetMap = colName === 'match_feedback' 
              ? mockDb.match_feedback 
              : mockDb.manifest_learning_patterns;
            targetMap.delete(ref.id);
          });
        }),
        commit: vi.fn(async () => {
          operations.forEach(op => op());
        }),
      };
    }),
  };
});

describe('cascadeCustomerNameUpdateToLearning', () => {
  beforeEach(() => {
    mockDb.match_feedback.clear();
    mockDb.manifest_learning_patterns.clear();
    vi.clearAllMocks();
  });

  it('updates fullName in match_feedback documents for the given slCode', async () => {
    mockDb.match_feedback.set('fb_1', {
      slCode: 'SL2601002',
      manifestName: 'SHARLYNN DIAZ',
      normalizedName: 'SHARLYNN DIAZ',
      fullName: 'Sharlynn Diaz',
      hitCount: 5,
      source: 'admin_pick',
    });

    mockDb.match_feedback.set('fb_other', {
      slCode: 'SL9999',
      manifestName: 'OTHER USER',
      normalizedName: 'OTHER USER',
      fullName: 'Other User',
      hitCount: 2,
      source: 'admin_pick',
    });

    const result = await cascadeCustomerNameUpdateToLearning('SL2601002', 'Sharlynn Díaz Hernández');

    expect(result.updatedFeedback).toBe(1);
    expect(mockDb.match_feedback.get('fb_1').fullName).toBe('Sharlynn Díaz Hernández');
    // Normalized name, slCode, hitCount and other clients must remain completely untouched
    expect(mockDb.match_feedback.get('fb_1').normalizedName).toBe('SHARLYNN DIAZ');
    expect(mockDb.match_feedback.get('fb_1').hitCount).toBe(5);
    expect(mockDb.match_feedback.get('fb_other').fullName).toBe('Other User');
  });

  it('updates matchedName in manifest_learning_patterns documents for the given slCode', async () => {
    mockDb.manifest_learning_patterns.set('pat_1', {
      type: 'name_association',
      slCode: 'SL2601002',
      rawName: 'SHARLYNN DIAZ',
      normalizedName: 'SHARLYNN DIAZ',
      matchedName: 'Sharlynn Diaz',
      approvalCount: 3,
    });

    const result = await cascadeCustomerNameUpdateToLearning('SL2601002', 'Sharlynn Díaz Hernández');

    expect(result.updatedPatterns).toBe(1);
    expect(mockDb.manifest_learning_patterns.get('pat_1').matchedName).toBe('Sharlynn Díaz Hernández');
    expect(mockDb.manifest_learning_patterns.get('pat_1').approvalCount).toBe(3);
  });

  it('handles lowercase or unformatted slCode safely', async () => {
    mockDb.match_feedback.set('fb_1', {
      slCode: 'SL2601002',
      fullName: 'Old Name',
    });

    const result = await cascadeCustomerNameUpdateToLearning('  sl2601002  ', 'New Name');

    expect(result.updatedFeedback).toBe(1);
    expect(mockDb.match_feedback.get('fb_1').fullName).toBe('New Name');
  });

  it('returns 0 updates safely when slCode or newFullName is empty without throwing', async () => {
    const res1 = await cascadeCustomerNameUpdateToLearning('', 'New Name');
    expect(res1).toEqual({ updatedFeedback: 0, updatedPatterns: 0 });

    const res2 = await cascadeCustomerNameUpdateToLearning('SL123', '');
    expect(res2).toEqual({ updatedFeedback: 0, updatedPatterns: 0 });

    const res3 = await cascadeCustomerNameUpdateToLearning('SL123', '   ');
    expect(res3).toEqual({ updatedFeedback: 0, updatedPatterns: 0 });
  });

  it('does not trigger batch writes when documents already have the exact target name', async () => {
    mockDb.match_feedback.set('fb_1', {
      slCode: 'SL100',
      fullName: 'Exact Name',
    });

    const result = await cascadeCustomerNameUpdateToLearning('SL100', 'Exact Name');
    expect(result.updatedFeedback).toBe(0);
    expect(result.updatedPatterns).toBe(0);
  });
});

describe('deleteLearnedFeedbackForSlCode', () => {
  beforeEach(() => {
    mockDb.match_feedback.clear();
    mockDb.manifest_learning_patterns.clear();
    vi.clearAllMocks();
  });

  it('purges both match_feedback and manifest_learning_patterns for the targeted slCode', async () => {
    const { deleteLearnedFeedbackForSlCode } = await import('../../match-learning');

    mockDb.match_feedback.set('fb_del', {
      slCode: 'SL262130',
      manifestName: 'WARNER CHAVES',
      normalizedName: 'WARNER CHAVES',
      fullName: 'Warner Chaves',
    });
    mockDb.match_feedback.set('fb_keep', {
      slCode: 'SL2601002',
      manifestName: 'SHARLYNN DIAZ',
      normalizedName: 'SHARLYNN DIAZ',
      fullName: 'Sharlynn Diaz',
    });

    mockDb.manifest_learning_patterns.set('pat_del', {
      type: 'name_association',
      slCode: 'SL262130',
      rawName: 'WARNER CHAVES',
      normalizedName: 'WARNER CHAVES',
      matchedName: 'Warner Chaves',
    });
    mockDb.manifest_learning_patterns.set('pat_keep', {
      type: 'name_association',
      slCode: 'SL2601002',
      rawName: 'SHARLYNN DIAZ',
      normalizedName: 'SHARLYNN DIAZ',
      matchedName: 'Sharlynn Diaz',
    });

    const deleted = await deleteLearnedFeedbackForSlCode('SL262130');
    expect(deleted).toBeGreaterThanOrEqual(2);

    expect(mockDb.match_feedback.has('fb_del')).toBe(false);
    expect(mockDb.manifest_learning_patterns.has('pat_del')).toBe(false);

    // Unrelated customer must be completely preserved
    expect(mockDb.match_feedback.has('fb_keep')).toBe(true);
    expect(mockDb.manifest_learning_patterns.has('pat_keep')).toBe(true);
  });

  it('returns 0 when slCode is empty without error', async () => {
    const { deleteLearnedFeedbackForSlCode } = await import('../../match-learning');
    const res = await deleteLearnedFeedbackForSlCode('');
    expect(res).toBe(0);
  });
});

describe('patchCustomerFullNameInCache (customer-loader in-memory index updates)', () => {
  it('updates in-memory cache and evicts old normalizedName index entry to prevent stale matches', async () => {
    const { 
      patchCustomerFullNameInCache, 
      injectCustomerIntoCache, 
      getCachedIndexes, 
      getCachedCustomers,
      invalidateCustomerCache 
    } = await import('../customer-loader');

    invalidateCustomerCache();

    const mockCustomer = {
      id: 'cust-1',
      slCode: 'SL500',
      firstName: 'Nombre',
      lastName: 'Viejo',
      fullName: 'Nombre Viejo',
      name: 'Nombre Viejo',
      normalizedName: 'NOMBRE VIEJO',
      ruta: 'GAM',
      isRutaApproved: true,
      consolidationEnabled: false,
    };

    injectCustomerIntoCache(mockCustomer);

    const indexesBefore = getCachedIndexes();
    expect(indexesBefore?.bySlCode.get('SL500')?.fullName).toBe('Nombre Viejo');
    expect(indexesBefore?.byName.has('NOMBRE VIEJO')).toBe(true);

    patchCustomerFullNameInCache('SL500', 'Nombre Nuevo Actualizado');

    const indexesAfter = getCachedIndexes();
    expect(indexesAfter).not.toBeNull();

    // 1. bySlCode must point to updated customer
    const updated = indexesAfter?.bySlCode.get('SL500');
    expect(updated).toBeDefined();
    expect(updated?.fullName).toBe('Nombre Nuevo Actualizado');
    expect(updated?.name).toBe('Nombre Nuevo Actualizado');
    expect(updated?.normalizedName).toBe('NOMBRE NUEVO ACTUALIZADO');

    // 2. Old normalized name in byName must be evicted!
    expect(indexesAfter?.byName.has('NOMBRE VIEJO')).toBe(false);

    // 3. New normalized name in byName must exist and point to the updated customer
    expect(indexesAfter?.byName.get('NOMBRE NUEVO ACTUALIZADO')).toBe(updated);

    // 4. getCachedCustomers array entry must also be updated
    const customers = getCachedCustomers();
    expect(customers[0].fullName).toBe('Nombre Nuevo Actualizado');
  });
});

describe('ROUTING_PREFIXES invariant and hasRoutingPrefix behavior', () => {
  it('contains all required Costa Rican routing prefixes', async () => {
    const { ROUTING_PREFIXES } = await import('../thresholds');
    const expected = [
      'ALAJUELA', 'HEREDIA', 'CARTAGO', 'LIMON', 'PUNTARENAS',
      'GUANACASTE', 'LIBERIA', 'NICOYA', 'GRECIA', 'ATENAS',
      'DESAMPARADOS', 'BB', 'SAN JOSE', 'SANJOSE',
    ];
    for (const prefix of expected) {
      expect(ROUTING_PREFIXES.has(prefix)).toBe(true);
    }
  });

  it('correctly discriminates routing prefixes from genuine client names', async () => {
    const { hasRoutingPrefix } = await import('../../match-learning');

    // Positive cases (unregistered client with zone/city prefix)
    expect(hasRoutingPrefix('ALAJUELA FRANCISCO MEJIA')).toBe(true);
    expect(hasRoutingPrefix('Heredia Maria Solis')).toBe(true);
    expect(hasRoutingPrefix('CARTAGO JUAN PEREZ')).toBe(true);
    expect(hasRoutingPrefix('BB SONIA VALVERDE')).toBe(true);
    expect(hasRoutingPrefix('SANJOSE PEDRO ROJAS')).toBe(true);

    // Negative cases (genuine customer full names)
    expect(hasRoutingPrefix('FRANCISCO MEJIA ALAJUELA')).toBe(false);
    expect(hasRoutingPrefix('VALERIA BALMACEDA HERRERA')).toBe(false);
    expect(hasRoutingPrefix('CARLOS EDUARDO MORA')).toBe(false);
    expect(hasRoutingPrefix('SHARLYNN DIAZ')).toBe(false);
  });
});

