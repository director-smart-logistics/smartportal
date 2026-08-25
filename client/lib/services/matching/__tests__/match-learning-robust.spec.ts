// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Local Mock Firestore Database (Hoisted) ──────────────────────────────────
const {
  mockDb,
  mockPackageCounts,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  getCountFromServer,
  deleteDoc,
  writeBatch,
  documentId,
} = vi.hoisted(() => {
  const mockDb: Record<string, Map<string, any>> = {
    customers: new Map(),
    match_feedback: new Map(),
    manifest_learning_patterns: new Map(),
    unmatched_route_learning: new Map(),
    temp_customers: new Map(),
    users: new Map(),
    sl_counters: new Map(),
  };

  const mockPackageCounts: Record<string, number> = {};

  const doc = vi.fn((ref: any, colOrId?: string, id?: string) => {
    let col = '';
    let docId = '';
    if (typeof ref === 'string') {
      col = ref;
      docId = colOrId || 'auto';
    } else if (ref && ref.__col) {
      col = ref.__col;
      docId = colOrId || 'auto';
    } else if (typeof ref === 'object' && colOrId && id) {
      col = colOrId;
      docId = id;
    } else {
      col = ref?.col || 'auto';
      docId = ref?.__doc || 'auto';
    }
    return { __doc: docId, col };
  });

  const collection = vi.fn((_db: any, name: string) => {
    return { __col: name };
  });

  const getDoc = vi.fn(async (ref: any) => {
    const data = mockDb[ref.col]?.get(ref.__doc);
    return { exists: () => !!data, data: () => data };
  });

  const setDoc = vi.fn(async (ref: any, data: any, opts?: any) => {
    const col = mockDb[ref.col];
    if (col) {
      if (opts?.merge) {
        const existing = col.get(ref.__doc) || {};
        col.set(ref.__doc, { ...existing, ...data });
      } else {
        col.set(ref.__doc, data);
      }
    }
  });

  const updateDoc = vi.fn(async (ref: any, data: any) => {
    const col = mockDb[ref.col];
    if (col) {
      const existing = col.get(ref.__doc) || {};
      col.set(ref.__doc, { ...existing, ...data });
    }
  });

  const getDocs = vi.fn(async (q: any) => {
    const collectionName = q?.__col ?? q?.__queryCol ?? q?.col ?? '';
    const col = mockDb[collectionName];
    const docs = col ? Array.from(col.entries()).map(([id, data]) => {
      return {
        id,
        ref: { __doc: id, col: collectionName },
        data: () => data,
      };
    }) : [];

    let finalDocs = docs;
    if (collectionName === 'users' && q?.__whereFilters) {
      const slCodeFilter = q.__whereFilters.find((f: any) => f.field === 'slCode');
      if (slCodeFilter) {
        finalDocs = docs.filter(d => d.data().slCode === slCodeFilter.value);
      }
    }

    return {
      empty: finalDocs.length === 0,
      docs: finalDocs,
      forEach: (cb: any) => finalDocs.forEach(cb),
    };
  });

  const query = vi.fn((colRef: any, ...filters: any[]) => {
    return {
      __query: true,
      __col: colRef?.__col,
      __whereFilters: filters.filter(f => f && f.field && f.op),
    };
  });

  const where = vi.fn((field: string, op: string, value: unknown) => {
    return { field, op, value };
  });

  const runTransaction = vi.fn(async (db: any, callback: any) => {
    const transaction = {
      get: async (ref: any) => {
        const data = mockDb[ref.col]?.get(ref.__doc);
        return { exists: () => !!data, data: () => data };
      },
      update: (ref: any, data: any) => {
        const col = mockDb[ref.col];
        const existing = col.get(ref.__doc) || {};
        col.set(ref.__doc, { ...existing, ...data });
      },
      set: (ref: any, data: any) => {
        mockDb[ref.col]?.set(ref.__doc, data);
      }
    };
    return await callback(transaction);
  });

  const getCountFromServer = vi.fn(async (q: any) => {
    const slCodeFilter = q?.__whereFilters?.find((f: any) => f.field === 'slCode');
    const count = slCodeFilter ? (mockPackageCounts[slCodeFilter.value] ?? 0) : 0;
    return {
      data: () => ({ count }),
    };
  });

  const deleteDoc = vi.fn(async (ref: any) => {
    mockDb[ref.col]?.delete(ref.__doc);
  });

  const documentId = vi.fn(() => '__documentId__');

  const writeBatch = vi.fn(() => {
    const operations: Array<() => void> = [];
    return {
      set: (ref: any, data: any) => {
        operations.push(() => {
          mockDb[ref.col]?.set(ref.__doc, data);
        });
      },
      update: (ref: any, data: any) => {
        operations.push(() => {
          const col = mockDb[ref.col];
          const existing = col?.get(ref.__doc) || {};
          col?.set(ref.__doc, { ...existing, ...data });
        });
      },
      delete: (ref: any) => {
        operations.push(() => {
          mockDb[ref.col]?.delete(ref.__doc);
        });
      },
      commit: async () => {
        operations.forEach(op => op());
      }
    };
  });

  return {
    mockDb,
    mockPackageCounts,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    runTransaction,
    getCountFromServer,
    deleteDoc,
    writeBatch,
    documentId,
  };
});

function clearMockDb() {
  for (const map of Object.values(mockDb)) {
    map.clear();
  }
  for (const key of Object.keys(mockPackageCounts)) {
    delete mockPackageCounts[key];
  }
}

// Mock firebase firestore modules
vi.mock('firebase/firestore', () => ({
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  documentId,
  addDoc: vi.fn(async () => ({ id: 'mock-id' })),
  query,
  where,
  runTransaction,
  getCountFromServer,
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date() })),
  increment: vi.fn((n: number) => n),
  limit: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: { now: vi.fn(() => ({ toDate: () => new Date() })) },
}));

vi.mock('@/lib/firebase/config', () => ({
  db: { __db: 'sp1' },
  dbSP2: { __db: 'sp2' },
  app: {},
}));

vi.mock('../../firebase/config', () => ({
  db: { __db: 'sp1' },
  dbSP2: { __db: 'sp2' },
  app: {},
}));

vi.mock('../firebase/config', () => ({
  db: { __db: 'sp1' },
  dbSP2: { __db: 'sp2' },
  app: {},
}));

vi.mock('../firebase', () => ({
  db: { __db: 'sp1' },
  dbSP2: { __db: 'sp2' },
  app: {},
}));

// Mock Firebase Callables
vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(async () => {
        const listData = Array.from(mockDb.customers.values());
        return { success: true, data: { data: listData } };
      }),
    },
    routes: {
      list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
  },
}));

vi.mock('../../firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(async () => {
        const listData = Array.from(mockDb.customers.values());
        return { success: true, data: { data: listData } };
      }),
    },
    routes: {
      list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
  },
}));

// Mock external manifest APIs
vi.mock('../../gemini-client', () => ({
  validateManifestData: vi.fn().mockResolvedValue({
    isValid: true,
    issues: [],
    suggestions: [],
  }),
  aiSelectBestMatchBatch: vi.fn(async (items) => {
    return items.map((item: any) => ({
      index: item.index,
      slCode: item.candidates[0]?.customer?.slCode || 'SL999999',
      confidence: 99,
      rationale: 'Mock AI Selection',
    }));
  }),
  aiFindPotentialMatchesBatch: vi.fn(async (items) => {
    return items.map((item: any) => ({
      index: item.index,
      slCode: 'SL999999',
      confidence: 99,
      rationale: 'Mock AI Search',
    }));
  }),
}));

vi.mock('../../permit-detector', () => ({
  detectPermit: vi.fn().mockReturnValue({ requiresPermit: false }),
  detectPermitFromManifestId: vi.fn().mockReturnValue({ requiresPermit: false }),
  detectPermitFromDescription: vi.fn().mockReturnValue({ requiresPermit: false }),
}));

vi.mock('../../nova-tools', () => ({
  checkTrackingPreAlert: vi.fn().mockResolvedValue({ found: false }),
}));

describe('Nova Matcher — Robust Learning & Homonym Dominance Spec Suite', () => {
  beforeEach(async () => {
    vi.resetModules();
    clearMockDb();
    vi.clearAllMocks();
  });

  it('Garantiza la degradacion de score (cap a 0.92) para reglas provenientes de ia_auto', async () => {
    const { loadCustomers } = await import('../customer-loader');
    const { loadLearnedMatches } = await import('../../match-learning');
    const { batchFindCustomerMatchesWithAI } = await import('../batch-matcher');

    // 1. Crear el cliente
    const customer = {
      id: 'SL261150',
      slCode: 'SL261150',
      fullName: 'GABRIELA ALFARO CESPEDES',
      name: 'GABRIELA ALFARO CESPEDES',
      normalizedName: 'GABRIELA ALFARO CESPEDES',
      firstName: 'GABRIELA',
      lastName: 'ALFARO CESPEDES',
      ruta: 'METROPOLITANA',
      status: 'active',
    };
    mockDb.customers.set('SL261150', customer);

    // 2. Crear una regla aprendida de tipo ai_auto
    const learnedMatch = {
      id: 'GABRIELA_ALFARO_SL261150',
      manifestName: 'GABRIELA ALFARO',
      normalizedName: 'GABRIELA ALFARO',
      slCode: 'SL261150',
      fullName: 'GABRIELA ALFARO CESPEDES',
      ruta: 'METROPOLITANA',
      source: 'ai_auto',
      hitCount: 2,
      confirmedAt: new Date(),
    };
    mockDb.match_feedback.set('GABRIELA_ALFARO_SL261150', learnedMatch);

    // Cargar cache
    await loadCustomers();
    await loadLearnedMatches();

    // 3. Ejecutar el matcher batch
    const results = await batchFindCustomerMatchesWithAI([
      { index: 1, name: 'GABRIELA ALFARO' }
    ]);

    const result = results.get(1);
    expect(result).toBeDefined();
    expect(result?.slCode).toBe('SL261150');
    expect(result?.bestMatch?.score).toBe(0.92);
  });

  it('Resuelve correctamente homonimos conflictivos a favor del cliente dominante por historial real', async () => {
    const { loadCustomers } = await import('../customer-loader');
    const { loadLearnedMatches } = await import('../../match-learning');
    const { batchFindCustomerMatchesWithAI } = await import('../batch-matcher');

    // 1. Registrar ambos clientes homónimos
    const customerA = {
      id: 'SL261150',
      slCode: 'SL261150',
      fullName: 'GABRIELA ALFARO CESPEDES',
      name: 'GABRIELA ALFARO CESPEDES',
      normalizedName: 'GABRIELA ALFARO CESPEDES',
      firstName: 'GABRIELA',
      lastName: 'ALFARO CESPEDES',
      ruta: 'METROPOLITANA',
      status: 'active',
    };
    const customerB = {
      id: 'SL13',
      slCode: 'SL13',
      fullName: 'GABRIELA ALFARO VARGAS',
      name: 'GABRIELA ALFARO VARGAS',
      normalizedName: 'GABRIELA ALFARO VARGAS',
      firstName: 'GABRIELA',
      lastName: 'ALFARO VARGAS',
      ruta: 'SAN JOSE',
      status: 'active',
    };
    mockDb.customers.set('SL261150', customerA);
    mockDb.customers.set('SL13', customerB);

    // 2. Regla aprendida incorrecta (ai_auto) asignando a SL261150
    const incorrectLearned = {
      id: 'GABRIELA_ALFARO_SL261150',
      manifestName: 'GABRIELA ALFARO',
      normalizedName: 'GABRIELA ALFARO',
      slCode: 'SL261150',
      fullName: 'GABRIELA ALFARO CESPEDES',
      ruta: 'METROPOLITANA',
      source: 'ai_auto',
      hitCount: 1,
      confirmedAt: new Date(),
    };
    mockDb.match_feedback.set('GABRIELA_ALFARO_SL261150', incorrectLearned);

    // 3. Simular historiales reales abrumadoramente distintos
    mockPackageCounts['SL13'] = 29;      // Homónimo dominante real
    mockPackageCounts['SL261150'] = 0;   // Regla ai_auto incorrecta

    // Cargar caches
    await loadCustomers();
    await loadLearnedMatches();

    // 4. Ejecutar matcher
    const results = await batchFindCustomerMatchesWithAI([
      { index: 1, name: 'GABRIELA ALFARO' }
    ]);

    const result = results.get(1);
    expect(result).toBeDefined();
    expect(result?.slCode).toBe('SL13');
    expect(result?.bestMatch?.score).toBe(1.0);
    expect(result?.ruta).toBe('SAN JOSE');
  });

  it('Detecta colision activa y aborta el cortocircuito si los historiales no son abrumadoramente dominantes', async () => {
    const { loadCustomers } = await import('../customer-loader');
    const { loadLearnedMatches } = await import('../../match-learning');
    const { batchFindCustomerMatchesWithAI } = await import('../batch-matcher');
    const { matchName } = await import('../match-engine');

    const customerA = {
      id: 'SL261150',
      slCode: 'SL261150',
      fullName: 'GABRIELA ALFARO CESPEDES',
      name: 'GABRIELA ALFARO CESPEDES',
      normalizedName: 'GABRIELA ALFARO CESPEDES',
      firstName: 'GABRIELA',
      lastName: 'ALFARO CESPEDES',
      ruta: 'METROPOLITANA',
      status: 'active',
    };
    const customerB = {
      id: 'SL13',
      slCode: 'SL13',
      fullName: 'GABRIELA ALFARO VARGAS',
      name: 'GABRIELA ALFARO VARGAS',
      normalizedName: 'GABRIELA ALFARO VARGAS',
      firstName: 'GABRIELA',
      lastName: 'ALFARO VARGAS',
      ruta: 'SAN JOSE',
      status: 'active',
    };
    mockDb.customers.set('SL261150', customerA);
    mockDb.customers.set('SL13', customerB);

    // Regla aprendida incorrecta (ai_auto) asignando a SL261150
    const incorrectLearned = {
      id: 'GABRIELA_ALFARO_SL261150',
      manifestName: 'GABRIELA ALFARO',
      normalizedName: 'GABRIELA ALFARO',
      slCode: 'SL261150',
      fullName: 'GABRIELA ALFARO CESPEDES',
      ruta: 'METROPOLITANA',
      source: 'ai_auto',
      hitCount: 1,
      confirmedAt: new Date(),
    };
    mockDb.match_feedback.set('GABRIELA_ALFARO_SL261150', incorrectLearned);

    // Historiales no abrumadoramente distintos
    mockPackageCounts['SL13'] = 3;
    mockPackageCounts['SL261150'] = 2;

    const custs = await loadCustomers();
    await loadLearnedMatches();

    const rawMatches = matchName('GABRIELA ALFARO', custs);
    console.log('[DEBUG Test 3] Raw matchName results:', JSON.stringify(rawMatches, null, 2));

    const results = await batchFindCustomerMatchesWithAI([
      { index: 1, name: 'GABRIELA ALFARO' }
    ]);

    const result = results.get(1);
    console.log('[DEBUG Test 3] Result:', JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
    expect(result?.requiresUserChoice).toBe(true);
  });

  it('Mantiene admin_pick como prioritario sin degradar su score (1.0)', async () => {
    const { loadCustomers } = await import('../customer-loader');
    const { loadLearnedMatches } = await import('../../match-learning');
    const { batchFindCustomerMatchesWithAI } = await import('../batch-matcher');

    const customer = {
      id: 'SL001',
      slCode: 'SL001',
      fullName: 'JUAN ALBERTO PEREZ MORA',
      name: 'JUAN ALBERTO PEREZ MORA',
      normalizedName: 'JUAN ALBERTO PEREZ MORA',
      firstName: 'JUAN',
      lastName: 'PEREZ MORA',
      ruta: 'METROPOLITANA',
      status: 'active',
    };
    mockDb.customers.set('SL001', customer);

    const learnedMatch = {
      id: 'JUAN_PEREZ_SL001',
      manifestName: 'JUAN PEREZ APRENDIDO',
      normalizedName: 'JUAN PEREZ APRENDIDO',
      slCode: 'SL001',
      fullName: 'JUAN ALBERTO PEREZ MORA',
      ruta: 'METROPOLITANA',
      source: 'admin_pick', // Confirmado por humano
      hitCount: 4,
      confirmedAt: new Date(),
    };
    mockDb.match_feedback.set('JUAN_PEREZ_SL001', learnedMatch);

    await loadCustomers();
    const lMatches = await loadLearnedMatches();
    console.log('[DEBUG Test 4] Learned Matches:', JSON.stringify(lMatches, null, 2));

    const results = await batchFindCustomerMatchesWithAI([
      { index: 1, name: 'JUAN PEREZ APRENDIDO' }
    ]);

    const result = results.get(1);
    console.log('[DEBUG Test 4] Result:', JSON.stringify(result, null, 2));
    expect(result).toBeDefined();
    expect(result?.slCode).toBe('SL001');
    expect(result?.bestMatch?.score).toBe(1.0);
  });

  it('Garantiza que colisiones por homónimos NO se sobreescriban a ciegas por admin_pick', async () => {
    const { loadCustomers } = await import('../customer-loader');
    const { loadLearnedMatches } = await import('../../match-learning');
    const { batchFindCustomerMatchesWithAI } = await import('../batch-matcher');

    // Registramos 2 homónimos con nombres muy similares
    mockDb.customers.set('SL101', {
      id: 'SL101',
      slCode: 'SL101',
      fullName: 'MARIA RODRIGUEZ CORDERO',
      name: 'MARIA RODRIGUEZ CORDERO',
      normalizedName: 'MARIA RODRIGUEZ CORDERO',
      ruta: 'SAN JOSE CENTRO',
      status: 'active',
    });

    mockDb.customers.set('SL102', {
      id: 'SL102',
      slCode: 'SL102',
      fullName: 'MARIA RODRIGUEZ CASTRO',
      name: 'MARIA RODRIGUEZ CASTRO',
      normalizedName: 'MARIA RODRIGUEZ CASTRO',
      ruta: 'CARTAGO 1',
      status: 'active',
    });

    // Un admin_pick anterior para "MARIA RODRIGUEZ" -> SL101
    mockDb.match_feedback.set('MARIA_RODRIGUEZ_SL101', {
      id: 'MARIA_RODRIGUEZ_SL101',
      manifestName: 'MARIA RODRIGUEZ',
      normalizedName: 'MARIA RODRIGUEZ',
      slCode: 'SL101',
      fullName: 'MARIA RODRIGUEZ CORDERO',
      ruta: 'SAN JOSE CENTRO',
      source: 'admin_pick',
      hitCount: 2,
    });

    await loadCustomers();
    await loadLearnedMatches();

    const results = await batchFindCustomerMatchesWithAI([
      { index: 1, name: 'MARIA RODRIGUEZ' }
    ]);

    const result = results.get(1);
    // Dado que existen 2 homónimos (SL101 y SL102), el sistema aborta el corto circuito automático
    expect(result).toBeDefined();
    // No debe dar learned_exact con score 1.0 ciego
    expect((result as any)?.matchSource).not.toBe('learned_exact');
  });

  describe('Conflict Sweeper, Unlink, and Route learning active Sweeps', () => {
    beforeEach(() => {
      clearMockDb();
    });

    it('Conflict Sweeper: individual save should delete conflicting records from both collections', async () => {
      const { saveMatchFeedback } = await import('../../match-learning');

      // 1. Setup a legacy incorrect mapping in both collections
      mockDb.match_feedback.set('JOSE_BRENES_SL790', {
        id: 'JOSE_BRENES_SL790',
        manifestName: 'JOSE BRENES',
        normalizedName: 'JOSE BRENES',
        slCode: 'SL790',
        fullName: 'Jose Daniel Brenes Hidalgo',
        source: 'admin_manual',
      });

      mockDb.manifest_learning_patterns.set('JOSE_BRENES_SL790', {
        id: 'JOSE_BRENES_SL790',
        manifestName: 'JOSE BRENES',
        normalizedName: 'JOSE BRENES',
        slCode: 'SL790',
      });

      // 2. Save correct mapping for the same name to SL8888
      await saveMatchFeedback({
        manifestName: 'JOSE BRENES',
        slCode: 'SL8888',
        fullName: 'Jose Brenes Correct',
        source: 'admin_manual',
        consolidationEnabled: false,
      });

      // 3. Verify that SL790 record is deleted from both collections
      expect(mockDb.match_feedback.has('JOSE_BRENES_SL790')).toBe(false);
      expect(mockDb.manifest_learning_patterns.has('JOSE_BRENES_SL790')).toBe(false);

      // 4. Verify that the correct SL8888 record is saved
      expect(mockDb.match_feedback.has('JOSE_BRENES_SL8888')).toBe(true);
    });

    it('Conflict Sweeper: bulk save should batch delete conflicting records from both collections', async () => {
      const { saveMatchFeedbackBulk } = await import('../../match-learning');

      // 1. Setup legacy incorrect mappings
      mockDb.match_feedback.set('MARIA_GOMEZ_SL101', {
        id: 'MARIA_GOMEZ_SL101',
        manifestName: 'MARIA GOMEZ',
        normalizedName: 'MARIA GOMEZ',
        slCode: 'SL101',
        source: 'admin_pick',
      });
      mockDb.match_feedback.set('MARIA_GOMEZ_SL202', {
        id: 'MARIA_GOMEZ_SL202',
        manifestName: 'MARIA GOMEZ',
        normalizedName: 'MARIA GOMEZ',
        slCode: 'SL202',
        source: 'admin_pick',
      });

      mockDb.manifest_learning_patterns.set('MARIA_GOMEZ_SL101', {
        id: 'MARIA_GOMEZ_SL101',
        normalizedName: 'MARIA GOMEZ',
        slCode: 'SL101',
      });

      // 2. Run bulk save mapping MARIA GOMEZ to SL404
      await saveMatchFeedbackBulk([{
        manifestName: 'MARIA GOMEZ',
        slCode: 'SL404',
        fullName: 'Maria Gomez Correct',
        source: 'admin_manual',
        consolidationEnabled: false,
      }]);

      // 3. Verify all conflicts are deleted
      expect(mockDb.match_feedback.has('MARIA_GOMEZ_SL101')).toBe(false);
      expect(mockDb.match_feedback.has('MARIA_GOMEZ_SL202')).toBe(false);
      expect(mockDb.manifest_learning_patterns.has('MARIA_GOMEZ_SL101')).toBe(false);

      // 4. Verify new correct mapping exists
      expect(mockDb.match_feedback.has('MARIA_GOMEZ_SL404')).toBe(true);
    });

    it('forgetMatchFeedback: unlink should delete all records for that name in all learning databases', async () => {
      const { forgetMatchFeedback } = await import('../../match-learning');

      // 1. Setup existing matches and route learnings
      mockDb.match_feedback.set('JUAN_PEREZ_SL202', {
        id: 'JUAN_PEREZ_SL202',
        manifestName: 'JUAN PEREZ',
        normalizedName: 'JUAN PEREZ',
        slCode: 'SL202',
      });
      mockDb.manifest_learning_patterns.set('JUAN_PEREZ_SL202', {
        id: 'JUAN_PEREZ_SL202',
        normalizedName: 'JUAN PEREZ',
        slCode: 'SL202',
      });
      mockDb.unmatched_route_learning.set('unmatched_route_JUAN PEREZ', {
        id: 'unmatched_route_JUAN PEREZ',
        manifestName: 'JUAN PEREZ',
        ruta: 'Alajuela',
      });

      // 2. Call forget
      await forgetMatchFeedback('JUAN PEREZ');

      // 3. Verify everything is deleted
      expect(mockDb.match_feedback.has('JUAN_PEREZ_SL202')).toBe(false);
      expect(mockDb.manifest_learning_patterns.has('JUAN_PEREZ_SL202')).toBe(false);
      expect(mockDb.unmatched_route_learning.has('unmatched_route_JUAN PEREZ')).toBe(false);
    });
  });
});
