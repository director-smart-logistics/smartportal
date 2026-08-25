// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Local Mock Firestore Database (Hoisted) ──────────────────────────────────
const {
  mockDb,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
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

  return {
    mockDb,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    runTransaction,
  };
});

function clearMockDb() {
  for (const map of Object.values(mockDb)) {
    map.clear();
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
  addDoc: vi.fn(async () => ({ id: 'mock-id' })),
  query,
  where,
  runTransaction,
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
}));

vi.mock('../../permit-detector', () => ({
  detectPermit: vi.fn().mockReturnValue({ requiresPermit: false }),
  detectPermitFromManifestId: vi.fn().mockReturnValue({ requiresPermit: false }),
  detectPermitFromDescription: vi.fn().mockReturnValue({ requiresPermit: false }),
}));

vi.mock('../../nova-tools', () => ({
  checkTrackingPreAlert: vi.fn().mockResolvedValue({ found: false }),
}));

// Mock PapaParse for manifest processing
let mockCsvRows: any[] = [];
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((file, options) => {
      if (options.complete) {
        options.complete({ data: mockCsvRows });
      }
    }),
  },
}));

// ─── Import SUTs ─────────────────────────────────────────────────────────────
import { loadCustomers, invalidateCustomerCache, getCustomerBySlCode } from '../customer-loader';
import { loadLearnedMatches, getLearnedIndex } from '../../match-learning';
import { updateCustomerRuta } from '../../customer-sync';
import { processManifestFile } from '../../manifest-processor';

describe('Nova Matcher — Learning & Route Persistence Functional Integration Tests', () => {
  beforeEach(() => {
    clearMockDb();
    invalidateCustomerCache();
    mockCsvRows = [];
    vi.clearAllMocks();
  });

  it('Fase 3.1: asocia automáticamente a un cliente basándose en el historial de confirmación (match_feedback) incluso si falla fuzzy matching', async () => {
    // 1. Crear cliente en base de datos
    const targetCustomer = {
      id: 'SL001',
      slCode: 'SL001',
      fullName: 'JUAN ALBERTO PEREZ MORA',
      name: 'JUAN ALBERTO PEREZ MORA',
      normalizedName: 'JUAN ALBERTO PEREZ MORA',
      firstName: 'JUAN',
      lastName: 'PEREZ MORA',
      ruta: 'METROPOLITANA',
      consolidationEnabled: false,
      status: 'active',
    };
    mockDb.customers.set('SL001', targetCustomer);

    // 2. Crear una entrada de feedback de aprendizaje históricamente confirmada (admin_pick)
    // El nombre del manifiesto "JUAN PEREZ APRENDIDO" tiene pocas letras comunes para un fuzzy match clásico,
    // pero fue confirmado por un admin.
    const learnedMatchEntry = {
      id: 'JUAN_PEREZ_APRENDIDO_SL001',
      manifestName: 'JUAN PEREZ APRENDIDO',
      normalizedName: 'JUAN PEREZ APRENDIDO',
      slCode: 'SL001',
      fullName: 'JUAN ALBERTO PEREZ MORA',
      ruta: 'METROPOLITANA',
      consolidationEnabled: false,
      source: 'admin_pick',
      hitCount: 3,
      confirmedAt: new Date(),
    };
    mockDb.match_feedback.set('JUAN_PEREZ_APRENDIDO_SL001', learnedMatchEntry);

    // 3. Cargar datos en Nova
    await loadCustomers();
    await loadLearnedMatches();

    // 4. Preparar fila del manifiesto
    mockCsvRows.push(['tracking', 'nombre', 'peso', 'guia', 'descripcion']);
    mockCsvRows.push(['TRK-LEARN-1', 'JUAN PEREZ APRENDIDO', '2.5', 'GUIA-LEARN-1', 'ROPA']);

    // 5. Procesar manifiesto
    const file = new File([''], 'test-manifest-learning.csv', { type: 'text/csv' });
    const result = await processManifestFile(file, null);

    expect(result).not.toBeNull();
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Verificar que se haya asignado al cliente SL001 usando el aprendizaje (matchSource: 'name', slCode: 'SL001')
    expect(row.slCode).toBe('SL001');
    expect(row.nombreCliente).toBe('JUAN ALBERTO PEREZ MORA');
    expect(row.matchSource).toBe('name');
    // Para entradas confirmadas por admin en match_feedback, la puntuación es 1.0 (máxima confianza)
    expect(row.matchScore).toBe(1.0);
    expect(row.ruta).toBe('METROPOLITANA');
  });

  it('Fase 3.2: guarda correctamente el cambio de ruta de un cliente (SP1, SP2 y cache) y lo aplica automáticamente en las siguientes corridas de Nova', async () => {
    // 1. Crear cliente en base de datos
    const targetCustomer = {
      id: 'SL002',
      slCode: 'SL002',
      fullName: 'MARIA ELENA LOPEZ SANCHEZ',
      name: 'MARIA ELENA LOPEZ SANCHEZ',
      normalizedName: 'MARIA ELENA LOPEZ SANCHEZ',
      firstName: 'MARIA',
      lastName: 'LOPEZ SANCHEZ',
      ruta: 'METROPOLITANA', // Ruta inicial
      consolidationEnabled: false,
      status: 'active',
    };
    mockDb.customers.set('SL002', targetCustomer);

    // Espejo del usuario en SP2
    const sp2User = {
      uid: 'SL002',
      id: 'SL002',
      slCode: 'SL002',
      displayName: 'MARIA ELENA LOPEZ SANCHEZ',
      ruta: 'METROPOLITANA',
      status: 'active',
    };
    mockDb.users.set('SL002', sp2User);

    // Cargar caché inicial
    await loadCustomers();
    expect(getCustomerBySlCode('SL002')?.ruta).toBe('METROPOLITANA');

    // 2. Modificar la ruta del cliente a "RURAL" usando updateCustomerRuta
    await updateCustomerRuta('SL002', 'RURAL', false);

    // 3. Verificar persistencia en base de datos de SP1 y en caché de inmediato
    expect(mockDb.customers.get('SL002').ruta).toBe('RURAL');
    expect(getCustomerBySlCode('SL002')?.ruta).toBe('RURAL');

    // 4. Procesar un manifiesto para este cliente y validar que la ruta asignada sea "RURAL"
    mockCsvRows.push(['tracking', 'nombre', 'peso', 'guia', 'descripcion']);
    mockCsvRows.push(['TRK-PERSIST-1', 'MARIA ELENA LOPEZ SANCHEZ', '1.0', 'GUIA-PERSIST-1', 'VARIOS']);

    const file = new File([''], 'test-manifest-route.csv', { type: 'text/csv' });
    const result = await processManifestFile(file, null);

    expect(result).not.toBeNull();
    const row = result.rows[0];

    expect(row.slCode).toBe('SL002');
    expect(row.ruta).toBe('RURAL'); // ¡Ruta actualizada correctamente de forma automática!
  });

  it('Fase 3.3: no debe asociar una ruta aprendida como fallback para clientes no registrados (lookupLearnedRoute)', async () => {
    // 1. Crear una entrada de ruta aprendida en unmatched_route_learning
    // Si un nombre no tiene cliente registrado (slCode vacío), pero ya se le asignó la ruta "ENCOMIENDAS" anteriormente.
    const learnedRouteEntry = {
      manifestName: 'BB CLIENTE ANONIMO',
      normalizedName: 'BB CLIENTE ANONIMO',
      ruta: 'ENCOMIENDAS',
      source: 'admin_assign',
      hitCount: 2,
    };
    mockDb.unmatched_route_learning.set('BB CLIENTE ANONIMO', learnedRouteEntry);

    // Cargar caché
    await loadCustomers();
    // Cargar caché de rutas no emparejadas
    const { loadUnmatchedRouteCache } = await import('../../match-learning');
    await loadUnmatchedRouteCache();

    // 2. Fila con nombre no registrado
    mockCsvRows.push(['tracking', 'nombre', 'peso', 'guia', 'descripcion']);
    mockCsvRows.push(['TRK-ROUTE-FALLBACK', 'BB CLIENTE ANONIMO', '3.0', 'GUIA-ROUTE-1', 'ELECTRONICOS']);

    // 3. Procesar manifiesto
    const file = new File([''], 'test-manifest-fallback.csv', { type: 'text/csv' });
    const result = await processManifestFile(file, null);

    expect(result).not.toBeNull();
    const row = result.rows[0];

    expect(row.slCode).toBe(''); // Cliente no registrado
    expect(row.ruta).toBe(''); // No debe asignar ruta a un registro que no tiene slCode ni match
  });

  it('Fase 3.4: guarda correctamente el cambio de consolidación de un cliente (SP1, SP2 y cache) de forma inmediata', async () => {
    // 1. Crear cliente en base de datos
    const targetCustomer = {
      id: 'SL003',
      slCode: 'SL003',
      fullName: 'ROBERTO CARLOS MONGE',
      name: 'ROBERTO CARLOS MONGE',
      normalizedName: 'ROBERTO CARLOS MONGE',
      firstName: 'ROBERTO',
      lastName: 'CARLOS MONGE',
      ruta: 'METROPOLITANA',
      consolidationEnabled: false, // Consolidador inactivo inicialmente
      status: 'active',
    };
    mockDb.customers.set('SL003', targetCustomer);

    // Espejo del usuario en SP2
    const sp2User = {
      uid: 'SL003',
      id: 'SL003',
      slCode: 'SL003',
      displayName: 'ROBERTO CARLOS MONGE',
      consolidationEnabled: false,
      status: 'active',
    };
    mockDb.users.set('SL003', sp2User);

    // Cargar caché inicial
    await loadCustomers();
    expect(getCustomerBySlCode('SL003')?.consolidationEnabled).toBe(false);

    // 2. Modificar la consolidación a true usando updateCustomerConsolidation
    const { updateCustomerConsolidation } = await import('../../customer-sync');
    await updateCustomerConsolidation('SL003', true);

    // 3. Verificar persistencia en base de datos (SP1 y SP2) y en caché de inmediato
    expect(mockDb.customers.get('SL003').consolidationEnabled).toBe(true);
    expect(mockDb.users.get('SL003').consolidationEnabled).toBe(true);
    expect(getCustomerBySlCode('SL003')?.consolidationEnabled).toBe(true);
  });
});
