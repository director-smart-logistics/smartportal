// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockDb,
} = vi.hoisted(() => {
  const mockDb: Record<string, Map<string, any>> = {
    customers: new Map(),
    match_feedback: new Map(),
    manifest_learning_patterns: new Map(),
    packages: new Map(),
  };

  return { mockDb };
});

vi.mock('../../../firebase', () => ({ db: {} }));
vi.mock('../../../firebase/config', () => ({ db: {} }));
vi.mock('../../../firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(async () => ({
        success: true,
        data: Array.from(mockDb.customers.values()),
      })),
    },
  },
}));

vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(),
  isSupported: vi.fn().mockResolvedValue(false),
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  getFirestore: () => ({}),
  collection: (db: any, colName: string) => ({ __col: colName }),
  doc: (ref: any, colOrId?: string) => ({ __col: typeof ref === 'string' ? ref : ref.__col, __id: colOrId || 'auto' }),
  getDoc: async (ref: any) => {
    const map = mockDb[ref.__col];
    const data = map ? map.get(ref.__id) : null;
    return { exists: () => !!data, data: () => data, id: ref.__id };
  },
  getDocs: async (queryRef: any) => {
    const col = typeof queryRef === 'string' ? queryRef : queryRef.__col;
    const map = mockDb[col];
    if (!map) return { docs: [], size: 0, empty: true };
    const docs = Array.from(map.entries()).map(([id, data]) => ({
      id,
      data: () => data,
      exists: () => true,
    }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  },
  setDoc: async (ref: any, data: any) => {
    if (!mockDb[ref.__col]) mockDb[ref.__col] = new Map();
    mockDb[ref.__col].set(ref.__id, data);
  },
  updateDoc: async (ref: any, data: any) => {
    if (mockDb[ref.__col] && mockDb[ref.__col].has(ref.__id)) {
      const existing = mockDb[ref.__col].get(ref.__id);
      mockDb[ref.__col].set(ref.__id, { ...existing, ...data });
    }
  },
  query: (colRef: any) => ({ __col: typeof colRef === 'string' ? colRef : colRef.__col }),
  where: () => ({}),
  getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
  limit: () => ({}),
  serverTimestamp: () => new Date(),
  increment: (n: number) => n,
  writeBatch: () => ({ set: () => {}, commit: async () => {} }),
}));

vi.mock('../../nova-tools', () => ({
  checkTrackingPreAlert: vi.fn().mockResolvedValue({ found: false }),
}));

function clearMockDb() {
  for (const key of Object.keys(mockDb)) {
    mockDb[key].clear();
  }
}

describe('Admin Pick Priority Law Unit Tests', () => {
  beforeEach(() => {
    vi.resetModules();
    clearMockDb();
    vi.clearAllMocks();
  });

  it('garantiza que una regla admin_pick (Carlos López → Alejandro Ulate) prevalezca como LEY ABSOLUTA sobre homónimos algorítmicos', async () => {
    // 1. Cliente 1: Carlos López (SL_CARLOS)
    mockDb.customers.set('SL_CARLOS', {
      id: 'SL_CARLOS',
      slCode: 'SL_CARLOS',
      fullName: 'CARLOS LOPEZ',
      name: 'CARLOS LOPEZ',
      normalizedName: 'CARLOS LOPEZ',
      ruta: 'Heredia',
      status: 'active',
    });

    // 2. Cliente 2: Alejandro Ulate (SL_ALEJANDRO)
    mockDb.customers.set('SL_ALEJANDRO', {
      id: 'SL_ALEJANDRO',
      slCode: 'SL_ALEJANDRO',
      fullName: 'ALEJANDRO ULATE',
      name: 'ALEJANDRO ULATE',
      normalizedName: 'ALEJANDRO ULATE',
      ruta: 'San Jose Centro',
      status: 'active',
    });

    // 3. Regla admin_pick: "CARLOS LOPEZ" → Alejandro Ulate (SL_ALEJANDRO)
    mockDb.match_feedback.set('CARLOS_LOPEZ_SL_ALEJANDRO', {
      id: 'CARLOS_LOPEZ_SL_ALEJANDRO',
      manifestName: 'CARLOS LOPEZ',
      normalizedName: 'CARLOS LOPEZ',
      slCode: 'SL_ALEJANDRO',
      fullName: 'ALEJANDRO ULATE',
      hitCount: 5,
      source: 'admin_pick',
      score: 1.0,
    });

    const { loadCustomers } = await import('../customer-loader');
    const { reloadLearnedMatches } = await import('../../match-learning');
    const { batchFindCustomerMatchesWithAI } = await import('../batch-matcher');

    await loadCustomers();
    await reloadLearnedMatches();

    const input = [{ index: 0, name: 'CARLOS LOPEZ' }];
    const results = await batchFindCustomerMatchesWithAI(input, false);

    const match = results.get(0);
    expect(match).toBeDefined();
    expect(match?.bestMatch?.customer.slCode).toBe('SL_ALEJANDRO');
    expect(match?.requiresUserChoice).toBe(false);
  });
});
