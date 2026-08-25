// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findCustomerMatch } from '../find-match';
import { batchFindCustomerMatchesWithAI } from '../batch-matcher';
import { invalidateCustomerCache } from '../customer-loader';
import { isDivergentMatch } from '../../manifest-processor/parser';

// Local Mock Database
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
  getDocs: vi.fn(async (q: any) => {
    return {
      empty: mockDb.packages.length === 0,
      docs: mockDb.packages.map(p => ({
        data: () => p,
        id: p.id || 'pkg-1',
      })),
    };
  }),
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

vi.mock('@/lib/services/gemini-client', () => ({
  aiSelectBestMatchBatch: vi.fn(async (items: any[]) => {
    return items.map(item => {
      // Simulate AI trying to hallucinate PIERO JOSE UMAÑA MARIN for MARIA JOSE
      if (item.searchName === 'MARIA JOSE') {
        return { id: item.id, slCode: 'SL_PIERO', confidence: 95 };
      }
      return { id: item.id, slCode: '', confidence: 0 };
    });
  }),
  aiFindPotentialMatchesBatch: vi.fn(async (items: any[]) => {
    const res = new Map();
    items.forEach(item => {
      if (item.searchName === 'MARIA JOSE') {
        res.set(item.id, [{ slCode: 'SL_PIERO', confidence: 95 }]);
      }
    });
    return res;
  }),
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
}));

describe('Incident Regressions Protection Suite (Daniel/Daniela, Victor single-token, Maria Jose learnings/AI)', () => {
  beforeEach(() => {
    mockDb.customers.clear();
    mockDb.packages = [];
    mockDb.learned = [];
    invalidateCustomerCache();

    // Populate Daniela
    mockDb.customers.set('c_daniela', {
      id: 'c_daniela',
      slCode: 'SL502',
      fullName: 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES',
      normalizedName: 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES',
      name: 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES',
      ruta: 'SJ Escazu',
      consolidationEnabled: true,
    });

    // Populate Victor Barquero
    mockDb.customers.set('c_victor', {
      id: 'c_victor',
      slCode: 'SL_VICTOR_BARQUERO',
      fullName: 'VICTOR BARQUERO MIRANDA',
      normalizedName: 'VICTOR BARQUERO MIRANDA',
      name: 'VICTOR BARQUERO MIRANDA',
      ruta: 'Alajuela',
      consolidationEnabled: false,
    });

    // Populate Piero Jose (hallucination candidate)
    mockDb.customers.set('c_piero', {
      id: 'c_piero',
      slCode: 'SL_PIERO',
      fullName: 'PIERO JOSE UMAÑA MARIN',
      normalizedName: 'PIERO JOSE UMANA MARIN',
      name: 'PIERO JOSE UMAÑA MARIN',
      ruta: 'Desconocida',
      consolidationEnabled: false,
    });

    // Populate Real Maria Jose customer
    mockDb.customers.set('c_mariajose', {
      id: 'c_mariajose',
      slCode: 'SL26116',
      fullName: 'MARIA JOSE PICON CHAVES',
      normalizedName: 'MARIA JOSE PICON CHAVES',
      name: 'MARIA JOSE PICON CHAVES',
      ruta: 'San Jose',
      consolidationEnabled: false,
    });

    // Populate Brayan Conejo Solis
    mockDb.customers.set('c_brayan_conejo', {
      id: 'c_brayan_conejo',
      slCode: 'SL_BRAYAN_CONEJO',
      fullName: 'BRAYAN ROLANDO CONEJO SOLIS',
      normalizedName: 'BRAYAN ROLANDO CONEJO SOLIS',
      name: 'BRAYAN ROLANDO CONEJO SOLIS',
      ruta: 'Desconocida',
      consolidationEnabled: false,
    });
  });

  describe('Scenario 1: DANIEL RODRIGUEZ vs DANIELA RODRIGUEZ FUENTES (SL502)', () => {
    it('does NOT auto-match DANIEL RODRIGUEZ to DANIELA DE LOS ANGELES RODRIGUEZ FUENTES (SL502)', async () => {
      const matchRes = await findCustomerMatch('DANIEL RODRIGUEZ');
      
      // Must NOT be an exact match to Daniela SL502
      expect(matchRes.exactMatch).toBe(false);
      expect(matchRes.slCode).toBeUndefined();
      
      // Even if Daniela is in candidates, score must be capped and divergent
      const danielaCand = matchRes.candidates.find(c => c.customer.slCode === 'SL502');
      if (danielaCand) {
        expect(danielaCand.score).toBeLessThan(0.85); // Cannot reach auto-accept threshold
      }
      expect(isDivergentMatch('DANIEL RODRIGUEZ', 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES')).toBe(true);
    });

    it('batchFindCustomerMatchesWithAI does NOT assign SL502 to DANIEL RODRIGUEZ', async () => {
      const batchRes = await batchFindCustomerMatchesWithAI([{ index: 0, name: 'DANIEL RODRIGUEZ' }], false);
      const res = batchRes.get(0);
      expect(res?.slCode).toBeUndefined();
    });
  });

  describe('Scenario 2: Single-Token VICTOR in Pass 1.5 Historical Packages', () => {
    it('does NOT auto-promote single-token VICTOR to 0.99 from historical packages', async () => {
      // Put a historical package for "VICTOR" -> "SL_VICTOR_BARQUERO"
      mockDb.packages = [{
        nombre: 'VICTOR',
        slCode: 'SL_VICTOR_BARQUERO',
        ruta: 'Alajuela',
        createdAt: { toMillis: () => Date.now() },
      }];

      const batchRes = await batchFindCustomerMatchesWithAI([{ index: 0, name: 'VICTOR' }], false);
      const res = batchRes.get(0);

      // Must NOT be an exact match with 0.99
      expect(res?.exactMatch).toBe(false);
      expect(res?.slCode).toBeUndefined();
    });
  });

  describe('Scenario 3: MARIA JOSE Admin Learning & AI Divergence Protection', () => {
    it('applies admin learning for MARIA JOSE when present in learned records', async () => {
      mockDb.learned = [{
        manifestName: 'MARIA JOSE',
        normalizedName: 'MARIA JOSE',
        slCode: 'SL26116',
        fullName: 'MARIA JOSE PICON CHAVES',
        ruta: 'San Jose',
        consolidationEnabled: false,
        hitCount: 1,
        score: 1.0,
        source: 'admin_pick',
      }];

      const batchRes = await batchFindCustomerMatchesWithAI([{ index: 0, name: 'MARIA JOSE' }], false);
      const res = batchRes.get(0);

      expect(res?.slCode).toBe('SL26116');
      expect(res?.bestMatch?.customer.fullName).toBe('MARIA JOSE PICON CHAVES');
    });

    it('rejects AI hallucination (PIERO JOSE UMAÑA MARIN) for MARIA JOSE when divergent', async () => {
      // Unregistered customer: No learned rule and no real matching Maria Jose in DB
      mockDb.learned = [];
      mockDb.customers.delete('c_mariajose');
      invalidateCustomerCache();

      const batchRes = await batchFindCustomerMatchesWithAI([{ index: 0, name: 'MARIA JOSE' }], true);
      const res = batchRes.get(0);

      // Must NOT accept PIERO JOSE UMAÑA MARIN (slCode must be undefined, requiring user choice)
      expect(res?.slCode).toBeUndefined();
      expect(res?.exactMatch).toBe(false);
      expect(res?.requiresUserChoice).toBe(true);
      expect(isDivergentMatch('MARIA JOSE', 'PIERO JOSE UMAÑA MARIN')).toBe(true);
    });
  });

  describe('Scenario 4: BRYAN SOLIS SOLIS vs BRAYAN ROLANDO CONEJO SOLIS', () => {
    it('does NOT auto-match BRYAN SOLIS SOLIS to BRAYAN ROLANDO CONEJO SOLIS', async () => {
      const matchRes = await findCustomerMatch('BRYAN SOLIS SOLIS');

      expect(matchRes.exactMatch).toBe(false);
      expect(matchRes.slCode).toBeUndefined();

      const brayanCand = matchRes.candidates.find(c => c.customer.slCode === 'SL_BRAYAN_CONEJO');
      if (brayanCand) {
        expect(brayanCand.score).toBeLessThan(0.85); // Cannot reach auto-accept threshold (0.85)
      }
      expect(isDivergentMatch('BRYAN SOLIS SOLIS', 'BRAYAN ROLANDO CONEJO SOLIS')).toBe(true);
    });

    it('batchFindCustomerMatchesWithAI keeps BRYAN SOLIS SOLIS unlinked without SL_BRAYAN_CONEJO', async () => {
      const batchRes = await batchFindCustomerMatchesWithAI([{ index: 0, name: 'BRYAN SOLIS SOLIS' }], false);
      const res = batchRes.get(0);
      expect(res?.slCode).toBeUndefined();
      expect(res?.exactMatch).toBe(false);
    });
  });
});
