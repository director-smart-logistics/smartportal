// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findCustomerMatch } from '../find-match';
import { invalidateCustomerCache } from '../customer-loader';
import { MATCH_THRESHOLDS } from '../thresholds';

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

// Mock Firestore configuration
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  dbSP2: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
}));

describe('findCustomerMatch', () => {
  let originalMin: number;
  let originalMultiple: number;

  beforeEach(() => {
    mockDb.customers.clear();
    invalidateCustomerCache();
    originalMin = MATCH_THRESHOLDS.AUTO_ACCEPT_MIN;
    originalMultiple = MATCH_THRESHOLDS.MULTIPLE_HIGH_CONFIDENCE;
  });

  afterEach(() => {
    (MATCH_THRESHOLDS as any).AUTO_ACCEPT_MIN = originalMin;
    (MATCH_THRESHOLDS as any).MULTIPLE_HIGH_CONFIDENCE = originalMultiple;
  });

  it('should return empty result if name is empty', async () => {
    const res = await findCustomerMatch('   ');
    expect(res.exactMatch).toBe(false);
    expect(res.candidates).toEqual([]);
    expect(res.slCode).toBeUndefined();
  });

  it('should find exact match when score is high', async () => {
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL1001',
      fullName: 'JUAN ALBERTO PEREZ MORA',
      normalizedName: 'JUAN ALBERTO PEREZ MORA',
      ruta: 'San Jose Centro',
      consolidationEnabled: true,
    });

    const res = await findCustomerMatch('JUAN ALBERTO PEREZ MORA');
    expect(res.exactMatch).toBe(true);
    expect(res.slCode).toBe('SL1001');
    expect(res.ruta).toBe('San Jose Centro');
    expect(res.consolidationEnabled).toBe(true);
    expect(res.candidates.length).toBeGreaterThan(0);
  });

  it('should return candidates and require user choice on ambiguous match', async () => {
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL1001',
      fullName: 'JUAN PEREZ MORA',
      normalizedName: 'JUAN PEREZ MORA',
      ruta: 'San Jose Centro',
    });
    mockDb.customers.set('c2', {
      id: 'c2',
      slCode: 'SL1002',
      fullName: 'JOSE PEREZ SANCHEZ',
      normalizedName: 'JOSE PEREZ SANCHEZ',
      ruta: 'Heredia Centro',
    });

    (MATCH_THRESHOLDS as any).AUTO_ACCEPT_MIN = 0.95;
    (MATCH_THRESHOLDS as any).MULTIPLE_HIGH_CONFIDENCE = 0.70;

    const res = await findCustomerMatch('J PEREZ');
    expect(res.exactMatch).toBe(false);
    expect(res.requiresUserChoice).toBe(true);
    expect(res.candidates.length).toBe(2);
  });
});
