// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processManifestFile, isDivergentMatch } from '../parser';
import { invalidateCustomerCache } from '../../matching/customer-loader';

// Local Mock Database for the Simulation
const mockDb = {
  customers: new Map<string, any>(),
  packages: [] as any[],
  learned: [] as any[],
};

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
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs: vi.fn(async () => ({
    empty: mockDb.packages.length === 0,
    docs: mockDb.packages.map(p => ({
      data: () => p,
      id: p.id || 'pkg-1',
    })),
  })),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  serverTimestamp: vi.fn(() => null),
  increment: vi.fn((n) => n),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
  deleteDoc: vi.fn(async () => {}),
  addDoc: vi.fn(async () => {}),
  documentId: vi.fn(),
}));

vi.mock('@/lib/services/match-learning', () => ({
  lookupLearnedRoute: vi.fn(() => null),
  saveMatchFeedback: vi.fn(async () => {}),
  saveAIAutoMatchFeedback: vi.fn(async () => {}),
  loadLearnedMatches: vi.fn(async () => mockDb.learned),
  reloadLearnedMatches: vi.fn(async () => mockDb.learned),
  lookupLearned: vi.fn((name: string) => {
    const norm = name.toUpperCase().trim();
    return mockDb.learned.find((l: any) => l.normalizedName === norm || l.manifestName === norm) || null;
  }),
  getLearnedCandidatesForAI: vi.fn(() => []),
  hasLearnedCollision: vi.fn(() => false),
  hasRoutingPrefix: vi.fn(() => false),
  getLearnedIndex: vi.fn(() => new Map()),
  isDominantCollisionWinner: vi.fn(() => false),
  loadUnmatchedRouteCache: vi.fn(async () => new Map()),
  findMatchingCustomerLearned: vi.fn(() => null),
}));

describe('Manifest 18-08-2026DAN Full Ingestion Simulation & Regression Guard', () => {
  beforeEach(() => {
    mockDb.customers.clear();
    mockDb.packages = [];
    mockDb.learned = [];
    invalidateCustomerCache();

    // 1. Registered Customer: Daniela Rodriguez Fuentes (SL502)
    mockDb.customers.set('c_daniela', {
      id: 'c_daniela',
      slCode: 'SL502',
      fullName: 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES',
      normalizedName: 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES',
      name: 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES',
      ruta: 'SJ Escazu',
      consolidationEnabled: true,
    });

    // 2. Registered Customer: Victor Barquero Miranda (SL_VICTOR)
    mockDb.customers.set('c_victor', {
      id: 'c_victor',
      slCode: 'SL_VICTOR',
      fullName: 'VICTOR BARQUERO MIRANDA',
      normalizedName: 'VICTOR BARQUERO MIRANDA',
      name: 'VICTOR BARQUERO MIRANDA',
      ruta: 'Alajuela',
      consolidationEnabled: false,
    });

    // 3. Registered Customer: Piero Jose Umaña Marin (SL_PIERO)
    mockDb.customers.set('c_piero', {
      id: 'c_piero',
      slCode: 'SL_PIERO',
      fullName: 'PIERO JOSE UMAÑA MARIN',
      normalizedName: 'PIERO JOSE UMANA MARIN',
      name: 'PIERO JOSE UMAÑA MARIN',
      ruta: 'Heredia',
      consolidationEnabled: false,
    });

    // 4. Registered Customer: Maria Jose Leandro (SL_MARIAJOSE)
    mockDb.customers.set('c_mariajose', {
      id: 'c_mariajose',
      slCode: 'SL26116',
      fullName: 'MARIA JOSE PICON CHAVES',
      normalizedName: 'MARIA JOSE PICON CHAVES',
      name: 'MARIA JOSE PICON CHAVES',
      ruta: 'San Jose',
      consolidationEnabled: false,
    });

    // 5. Standard Registered Customer: Allan Valverde
    mockDb.customers.set('c_allan', {
      id: 'c_allan',
      slCode: 'SL101',
      fullName: 'ALLAN VALVERDE MENDEZ',
      normalizedName: 'ALLAN VALVERDE MENDEZ',
      name: 'ALLAN VALVERDE MENDEZ',
      ruta: 'Cartago',
      consolidationEnabled: false,
    });

    // 6. Registered Customer: Brayan Rolando Conejo Solis
    mockDb.customers.set('c_brayan_conejo', {
      id: 'c_brayan_conejo',
      slCode: 'SL_BRAYAN_CONEJO',
      fullName: 'BRAYAN ROLANDO CONEJO SOLIS',
      normalizedName: 'BRAYAN ROLANDO CONEJO SOLIS',
      name: 'BRAYAN ROLANDO CONEJO SOLIS',
      ruta: 'Desconocida',
      consolidationEnabled: false,
    });

    // Historical package mock for "VICTOR" -> "SL_VICTOR"
    mockDb.packages.push({
      nombre: 'VICTOR',
      slCode: 'SL_VICTOR',
      ruta: 'Alajuela',
      createdAt: { toMillis: () => Date.now() },
    });

    // Operator learned rule for "MARIA JOSE" -> SL26116
    mockDb.learned.push({
      manifestName: 'MARIA JOSE',
      normalizedName: 'MARIA JOSE',
      slCode: 'SL26116',
      fullName: 'MARIA JOSE PICON CHAVES',
      ruta: 'San Jose',
      consolidationEnabled: false,
      hitCount: 1,
      score: 1.0,
      source: 'admin_pick',
    });
  });

  it('processes manifest 18-08-2026DAN without grouping Daniel Rodriguez under Daniela Rodriguez Fuentes', async () => {
    const csvContent = [
      'TRACKING,CONSIGNEE,WEIGHT,VALUE,DESCRIPTION',
      'SWX549400000128335538,DANIEL RODRIGUEZ,0.28,15.54,TIGHTS',
      'SWX549400000999999999,DANIELA DE LOS ANGELES RODRIGUEZ FUENTES,1.50,45.00,CLOTHES',
      'SWX549400000222222222,VICTOR,2.10,30.00,SHOES',
      'SWX549400000333333333,MARIA JOSE,0.80,22.00,MAKEUP',
      'SWX549400000444444444,ALLAN VALVERDE,3.50,80.00,ELECTRONICS',
      'SWX549400000555555555,BRYAN SOLIS SOLIS,1.20,50.00,WATCH',
    ].join('\n');

    const file = new File([csvContent], '18-08-2026DAN.csv', { type: 'text/csv' });
    const result = await processManifestFile(file, null);

    expect(result.rows).toHaveLength(6);

    const danielRow = result.rows[0];
    const danielaRow = result.rows[1];
    const victorRow = result.rows[2];
    const mariaJoseRow = result.rows[3];
    const allanRow = result.rows[4];
    const bryanRow = result.rows[5];

    // Assert Scenario 1: DANIEL RODRIGUEZ must NOT be assigned to SL502
    expect(danielRow.nombre).toBe('DANIEL RODRIGUEZ');
    expect(danielRow.slCode).toBe(''); // Must be unassigned / pending review
    expect(danielRow.nombreCliente).toBe(''); // No customer linked
    expect(danielRow.slCode).not.toBe('SL502');

    // Daniela row must be correctly assigned to SL502
    expect(danielaRow.nombre).toBe('DANIELA DE LOS ANGELES RODRIGUEZ FUENTES');
    expect(danielaRow.slCode).toBe('SL502');
    expect(danielaRow.nombreCliente).toBe('DANIELA DE LOS ANGELES RODRIGUEZ FUENTES');

    // Assert Scenario 2: VICTOR (single-token) must NOT be auto-assigned to Victor Barquero
    expect(victorRow.nombre).toBe('VICTOR');
    expect(victorRow.slCode).toBe(''); // Must be unassigned / pending review
    expect(victorRow.nombreCliente).toBe(''); // No customer linked

    // Assert Scenario 3: MARIA JOSE must be assigned to SL26116 (Learned match) and NOT Piero Jose
    expect(mariaJoseRow.nombre).toBe('MARIA JOSE');
    expect(mariaJoseRow.slCode).toBe('SL26116');
    expect(mariaJoseRow.nombreCliente).toBe('MARIA JOSE PICON CHAVES');
    expect(mariaJoseRow.slCode).not.toBe('SL_PIERO');

    // Assert Standard matching is preserved: ALLAN VALVERDE -> SL101
    expect(allanRow.nombre).toBe('ALLAN VALVERDE');
    expect(allanRow.slCode).toBe('SL101');
    expect(allanRow.nombreCliente).toBe('ALLAN VALVERDE MENDEZ');

    // Assert Scenario 4: BRYAN SOLIS SOLIS must NOT be auto-assigned to Brayan Conejo Solis
    expect(bryanRow.nombre).toBe('BRYAN SOLIS SOLIS');
    expect(bryanRow.slCode).toBe('');
    expect(bryanRow.nombreCliente).toBe('');
    expect(bryanRow.slCode).not.toBe('SL_BRAYAN_CONEJO');
  });

  it('guarantees that Daniel Rodriguez is flagged as divergent from Daniela Rodriguez Fuentes in table grouping', () => {
    const isDivergent = isDivergentMatch('DANIEL RODRIGUEZ', 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES');
    expect(isDivergent).toBe(true);
  });

  it('guarantees that Bryan Solis Solis is flagged as divergent from Brayan Rolando Conejo Solis in table grouping', () => {
    const isDivergent = isDivergentMatch('BRYAN SOLIS SOLIS', 'BRAYAN ROLANDO CONEJO SOLIS');
    expect(isDivergent).toBe(true);
  });
});
