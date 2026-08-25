import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB Store ────────────────────────────────────────────────────────────
const mockDb = {
  manifests: new Map<string, any>(),
  packages: new Map<string, any>(),
  manifest_consolidation: new Map<string, any>(),
  manifest_consolidations: new Map<string, any>(),
  manifest_encomiendas: new Map<string, any>(),
};

// Global mocks control to force errors in individual functions
let forceGetDocsError = false;
let forceGetDocError = false;
let forceGetCountError = false;

// ── Mock Dependencies ────────────────────────────────────────────────────────
vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('../audit-service', () => ({
  getManifestMoveHistory: vi.fn(async (id: string) => {
    if (id === 'ERROR-MANIFEST') throw new Error('Audit offline');
    return [{ id: 'evt-1', manifestId: id, status: 'moved', timestamp: '2026-08-11T00:00:00Z' }];
  }),
}));

vi.mock('firebase/firestore', () => {
  const queryMock = vi.fn((coll, ...clauses) => ({ coll, clauses }));
  const whereMock = vi.fn((field, op, value) => ({ field, op, value }));
  const orderByMock = vi.fn((field, dir) => ({ field, dir }));
  const limitMock = vi.fn((num) => ({ limit: num }));
  const startAfterMock = vi.fn((doc) => ({ startAfter: doc }));

  return {
    collection: vi.fn((db, name) => ({ id: name })),
    query: queryMock,
    where: whereMock,
    orderBy: orderByMock,
    limit: limitMock,
    startAfter: startAfterMock,
    documentId: vi.fn(() => 'documentId'),
    doc: vi.fn((db, name, id) => {
      let collectionName = '';
      let docId = '';
      if (!id) {
        collectionName = (db as any).id || '';
        docId = name;
      } else {
        collectionName = name;
        docId = id;
      }
      return { id: docId, path: `${collectionName}/${docId}` };
    }),
    getDocs: vi.fn(async (q: any) => {
      const collId = q.coll?.id || q.id;

      if (forceGetDocsError || (forceTier2Error && q.clauses?.find((c: any) => c.field === 'manifestId')) ||
          (q.clauses?.find((c: any) => c.field === 'mergedInto' && c.value === 'MEGA-MAN-ERR'))) {
        throw new Error('Force getDocs error');
      }

      const list: any[] = [];

      if (collId === 'manifests') {
        const mergedIntoClause = q.clauses?.find((c: any) => c.field === 'mergedInto');
        const documentIdClauseMin = q.clauses?.find((c: any) => c.field === 'documentId' && c.op === '>=');
        
        mockDb.manifests.forEach((val, id) => {
          if (mergedIntoClause && val.mergedInto !== mergedIntoClause.value) return;
          if (documentIdClauseMin && !id.startsWith('MEGA-MAN-')) return;
          list.push({ id, data: () => val });
        });
      } else if (collId === 'packages') {
        const manifestNumberClause = q.clauses?.find((c: any) => c.field === 'manifestNumber');
        const rutaClause = q.clauses?.find((c: any) => c.field === 'ruta');
        
        mockDb.packages.forEach((val, id) => {
          if (manifestNumberClause && val.manifestNumber !== manifestNumberClause.value) return;
          if (rutaClause && val.ruta !== rutaClause.value) return;
          list.push({ id, data: () => val });
        });
      } else if (collId === 'manifest_consolidation') {
        mockDb.manifest_consolidation.forEach((val, id) => {
          list.push({ id, data: () => val });
        });
      } else if (collId === 'manifest_consolidations') {
        mockDb.manifest_consolidations.forEach((val, id) => {
          list.push({ id, data: () => val });
        });
      }
      return { docs: list, empty: list.length === 0, forEach: (cb: any) => list.forEach(cb) };
    }),
    getDoc: vi.fn(async (d: any) => {
      if (forceGetDocError || d.id === 'ERROR-SRC') throw new Error('Force getDoc error');

      const parts = d.path ? d.path.split('/') : ['manifests', d.id];
      const coll = parts[0];
      const id = parts[1];
      
      let data = null;
      if (coll === 'manifests') {
        data = mockDb.manifests.get(id) || null;
      } else if (coll === 'packages') {
        data = mockDb.packages.get(id) || null;
      }

      return {
        exists: () => data !== null,
        data: () => data,
      };
    }),
    setDoc: vi.fn(async (d: any, data: any, options: any) => {
      const parts = d.path ? d.path.split('/') : ['manifests', d.id];
      const coll = parts[0];
      const id = parts[1];

      if (coll === 'manifests') {
        const existing = mockDb.manifests.get(id) || {};
        mockDb.manifests.set(id, { ...existing, ...data });
      }
    }),
    getCountFromServer: vi.fn(async (q: any) => {
      if (forceGetCountError) throw new Error('Force getCount error');

      const collId = q.coll?.id;
      let count = 0;

      if (collId === 'packages') {
        const manifestNumberClause = q.clauses?.find((c: any) => c.field === 'manifestNumber');
        mockDb.packages.forEach((val) => {
          if (!manifestNumberClause || val.manifestNumber === manifestNumberClause.value) {
            count++;
          }
        });
      }
      return {
        data: () => ({ count }),
      };
    }),
    onSnapshot: vi.fn((q: any, callback: any, onError?: any) => {
      if (forceTier2Error && q.clauses?.find((c: any) => c.field === 'manifestId')) {
        throw new Error('Tier 2 snapshot error');
      }
      const list: any[] = [];
      const collId = q.coll ? q.coll.id : q.id;

      if (collId === 'manifests') {
        mockDb.manifests.forEach((val, id) => {
          list.push({ id, data: () => val });
        });
        callback({ docs: list });
      } else if (collId === 'packages') {
        mockDb.packages.forEach((val, id) => {
          list.push({ id, data: () => val });
        });
        callback({ docs: list });
      } else if (collId === 'manifest_encomiendas') {
        mockDb.manifest_encomiendas.forEach((val, id) => {
          list.push({ id, data: () => val });
        });
        callback({ docs: list });
      } else if (collId === 'manifest_consolidations') {
        mockDb.manifest_consolidations.forEach((val, id) => {
          list.push({ id, data: () => val });
        });
        callback({ docs: list });
      } else if (q.path) {
        const parts = q.path.split('/');
        const id = parts[1];
        const data = mockDb.manifests.get(id);
        callback({
          exists: () => !!data,
          data: () => data,
        });
      }
      return () => {};
    }),
  };
});

let forceTier2Error = false;

// ── Imports under test ───────────────────────────────────────────────────────
import {
  getRecentManifests,
  getRecentManifestsPaginated,
  subscribeRecentManifests,
  getMegaManManifests,
  subscribeMegaManManifests,
  getManifestProcessedStatus,
  subscribeManifestProcessedStatus,
  subscribePackagesByManifest,
  subscribeEncomiendaManifestRows,
  subscribeAllEncomiendaManifests,
  subscribeConsolidationManifestRows,
  subscribeAllConsolidationManifests,
} from '../queries';

describe('queries.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.manifests.clear();
    mockDb.packages.clear();
    mockDb.manifest_consolidation.clear();
    mockDb.manifest_consolidations.clear();
    mockDb.manifest_encomiendas.clear();

    forceGetDocsError = false;
    forceGetDocError = false;
    forceGetCountError = false;
    forceTier2Error = false;
  });

  describe('getRecentManifests', () => {
    it('returns recent manifests and skips link stubs', async () => {
      mockDb.manifests.set('MAN-1', { manifestType: 'usa_air', totalPackages: 5, totalPrice: 100, processedAt: '2026-08-11T00:00:00Z' });
      mockDb.manifests.set('MAN-STUB', { source: 'nova_mlocker', totalPackages: 0 });
      mockDb.manifests.set('MAN-STUB-2', { source: 'nova_fusion', packages: [] });
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 2, processedAt: '2026-08-11T00:00:00Z' });

      mockDb.packages.set('PKG-1', { manifestNumber: 'MAN-1' });

      const results = await getRecentManifests();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('MAN-1');
      expect(results[1].id).toBe('MEGA-MAN-1');
      expect(results[1].isMegaMan).toBe(true);
    });

    it('recovers fusedFrom list on mega man manifests', async () => {
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 2, processedAt: '2026-08-11T00:00:00Z' });
      mockDb.manifests.set('MAN-SOURCE', { mergedInto: 'MEGA-MAN-1' });

      const results = await getRecentManifests();
      expect(results[0].fusedFrom).toContain('MAN-SOURCE');
    });

    it('returns empty array when getDocs fails', async () => {
      forceGetDocsError = true;
      const results = await getRecentManifests();
      expect(results).toEqual([]);
    });

    it('returns manifests when megaMans.length is 0', async () => {
      mockDb.manifests.set('MAN-1', { manifestType: 'usa_air', totalPackages: 2, processedAt: '2026-08-11T00:00:00Z' });
      const results = await getRecentManifests();
      expect(results).toHaveLength(1);
      expect(results[0].isMegaMan).toBeUndefined();
    });
  });

  describe('getRecentManifestsPaginated', () => {
    it('fetches paginated manifests correctly with lastDocSnapshot and link stubs filter', async () => {
      mockDb.manifests.set('MAN-1', { totalPackages: 3, processedAt: '2026-08-11T00:00:00Z' });
      mockDb.manifests.set('STUB-FUS', { source: 'nova_fusion', packages: [] }); // hit line 129
      const results = await getRecentManifestsPaginated(5, { id: 'MAN-0' });
      expect(results.manifests).toHaveLength(1);
      expect(results.hasMore).toBe(false);
    });

    it('filters out pending review candidates and handles different fusedFrom formats', async () => {
      mockDb.manifests.set('MEGA-MAN-1', {
        totalPackages: 1,
        processedAt: '2026-08-11T00:00:00Z',
        packages: [{ tracking: 'TRK-1' }],
        fusedFrom: ['SRC-1'],
      });

      mockDb.manifests.set('MEGA-MAN-2', {
        totalPackages: 1,
        processedAt: '2026-08-11T00:00:00Z',
        packages: [{ tracking: 'TRK-2' }],
        fusedManifests: ['SRC-2'],
      });

      mockDb.manifests.set('MEGA-MAN-3', {
        totalPackages: 1,
        processedAt: '2026-08-11T00:00:00Z',
        packages: [{ tracking: 'TRK-3' }],
      });

      mockDb.manifests.set('SRC-1', { totalPackages: 5 });
      mockDb.manifests.set('SRC-2', {});

      mockDb.packages.set('PKG-1', { manifestNumber: 'SRC-2' });

      const results = await getRecentManifestsPaginated(3);
      expect(results.manifests).toHaveLength(3);
      expect(results.manifests[0].fusedFromCounts).toEqual({ 'SRC-1': 5 });
    });

    it('recovers count for untrimmed src names or queries, triggering fallbacks and catch blocks', async () => {
      mockDb.manifests.set('MEGA-MAN-1', {
        totalPackages: 1,
        processedAt: '2026-08-11T00:00:00Z',
        packages: [],
        fusedFrom: ['SRC-SPACED '],
      });
      mockDb.manifests.set('SRC-SPACED', { totalPackages: 0 }); // stored count is 0
      mockDb.packages.set('PKG-1', { manifestNumber: 'SRC-SPACED ' }); // trailing space matches untrimmed

      const results = await getRecentManifestsPaginated(1);
      expect(results.manifests[0].fusedFromCounts).toEqual({ 'SRC-SPACED ': 1 });
    });

    it('triggers catch blocks in fused counts helper on getDoc error', async () => {
      mockDb.manifests.set('MEGA-MAN-1', {
        totalPackages: 1,
        processedAt: '2026-08-11T00:00:00Z',
        packages: [],
        fusedFrom: ['SRC-ERR'],
      });
      forceGetDocError = true;
      const results = await getRecentManifestsPaginated(1);
      expect(results.manifests[0].fusedFromCounts).toEqual({ 'SRC-ERR': 0 });
    });

    it('handles query failure gracefully', async () => {
      forceGetDocsError = true;
      const results = await getRecentManifestsPaginated(5);
      expect(results.manifests).toEqual([]);
      expect(results.hasMore).toBe(false);
    });
  });

  describe('subscribeRecentManifests', () => {
    it('subscribes and callbacks recent manifests, utilizing cache and processing fused counts', async () => {
      mockDb.manifests.set('MAN-1', { totalPackages: 2, processedAt: '2026-08-11T00:00:00Z' });
      
      // MEGA-MAN-1 has fusedFrom as an array to trigger line 335
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 2, processedAt: '2026-08-11T00:00:00Z', packages: [], fusedFrom: ['MAN-SRC-1', 'ERROR-SRC'] });
      mockDb.manifests.set('MAN-SRC-1', { totalPackages: 0 }); // triggers getCountFromServer fallback
      mockDb.packages.set('PKG-1', { manifestNumber: 'MAN-SRC-1' }); // live count is 1

      // MEGA-MAN-2 has fusedManifests as an array to trigger line 337
      mockDb.manifests.set('MEGA-MAN-2', { totalPackages: 1, processedAt: '2026-08-11T00:00:00Z', packages: [], fusedManifests: ['MAN-SRC-2'] });
      mockDb.manifests.set('MAN-SRC-2', { totalPackages: 4 });

      // MEGA-MAN-3 has neither to trigger line 338 and 389-392
      mockDb.manifests.set('MEGA-MAN-3', { totalPackages: 2, processedAt: '2026-08-11T00:00:00Z', packages: [] });

      // MEGA-MAN-ERR triggers getDocs query error catch block inside history resolver
      mockDb.manifests.set('MEGA-MAN-ERR', { totalPackages: 2, processedAt: '2026-08-11T00:00:00Z', packages: [] });

      // Add consolidation document to cover lines 373-375
      mockDb.manifest_consolidation.set('CONSOL-1', { manifestNumber: 'MEGA-MAN-1', tracking: 'TRK-CONSOL' });

      mockDb.manifests.set('MAN-SEA', { manifestType: 'usa_sea', totalPackages: 1 }); // skipped manifestType
      mockDb.manifests.set('STUB-FUS', { source: 'nova_fusion', packages: [] }); // skipped link stub
      mockDb.manifests.set('STUB-FUS-2', { source: 'nova_fusion', packages: undefined }); // cover line 310 packages undefined

      const callback = vi.fn();
      
      // First call (cache miss) - use fetch limit 20 to avoid loops breaking early
      let unsub = subscribeRecentManifests(20, callback);
      await new Promise(res => setTimeout(res, 20));
      expect(callback).toHaveBeenCalled();
      unsub();

      // Second call (cache hit)
      callback.mockClear();
      unsub = subscribeRecentManifests(20, callback);
      await new Promise(res => setTimeout(res, 10));
      expect(callback).toHaveBeenCalled();
      unsub();
    });
  });

  describe('getMegaManManifests', () => {
    it('queries and returns mega man manifests with packages count fallback', async () => {
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 10, processedAt: '2026-08-11T00:00:00Z', fusedFrom: ['SRC-1'] });
      mockDb.manifests.set('MEGA-MAN-2', { totalPackages: 0, processedAt: '2026-08-11T00:00:00Z', fusedManifests: ['SRC-2'] }); // cover line 464
      mockDb.manifests.set('MEGA-MAN-3', { totalPackages: 5, processedAt: '2026-08-11T00:00:00Z' }); // cover line 466

      const results = await getMegaManManifests();
      expect(results).toHaveLength(3);
    });

    it('returns empty array on failure', async () => {
      forceGetDocsError = true;
      const results = await getMegaManManifests();
      expect(results).toEqual([]);
    });
  });

  describe('subscribeMegaManManifests', () => {
    it('listens and callbacks mega man manifests with fusedManifests check', async () => {
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 5, isMegaMan: true });
      mockDb.manifests.set('MEGA-MAN-2', { totalPackages: 0, packages: [{ tracking: 'T1' }], isMegaMan: true, fusedManifests: ['SRC-2'] });
      mockDb.manifests.set('MEGA-MAN-3', { totalPackages: 2, isMegaMan: true, fusedFrom: ['SRC-3'] }); // hit lines 464-466
      
      const cb = vi.fn();
      const unsub = subscribeMegaManManifests(cb);
      await new Promise(res => setTimeout(res, 10));
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });

  describe('getManifestProcessedStatus', () => {
    it('returns processed status correctly, using Tier 2 and Tier 3 resolution', async () => {
      // Tier 1 direct hit with fallback packages length
      mockDb.manifests.set('MAN-1', { totalPackages: 0, packages: [{ tracking: 'T1' }], processedAt: '2026-08-11T00:00:00Z' });
      // Tier 2 query hit (triggering fallback packages length by omitting totalPackages)
      mockDb.manifests.set('DOC-AUTO-ID', { manifestId: 'MAN-2', packages: [{ tracking: 'T2' }], processedAt: '2026-08-11T00:00:00Z' });
      // Tier 3 stub recovery (and cover line 637 by pointing manifestNumber to MEGA-MAN-1)
      mockDb.manifests.set('STUB-1', { totalPackages: 0, mergedInto: 'MEGA-MAN-1', manifestNumber: 'MEGA-MAN-1' });
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 12 });

      // Tier 3 stub recovery fallback (line 598 false branch: packages is undefined)
      mockDb.manifests.set('STUB-2', { totalPackages: 0, mergedInto: 'MEGA-MAN-1', manifestNumber: 'REAL-MAN-2' });
      mockDb.manifests.set('REAL-MAN-2', { totalPackages: 0, packages: undefined, processedAt: '2026-08-11T00:00:00Z' });

      const status = await getManifestProcessedStatus(['MAN-1', 'MAN-2', 'STUB-1', 'STUB-2']);
      expect(status['MAN-1']).toBeDefined();
      expect(status['MAN-1'].totalPackages).toBe(1);
      expect(status['MAN-2']).toBeDefined();
      expect(status['MAN-2'].totalPackages).toBe(1);
      expect(status['STUB-1']).toBeDefined();
      expect(status['STUB-1'].totalPackages).toBe(12);
      expect(status['STUB-2']).toBeDefined();
      expect(status['STUB-2'].totalPackages).toBe(0);
    });

    it('triggers Tier 2 catch block on query error', async () => {
      forceTier2Error = true;
      const status = await getManifestProcessedStatus(['MISSING-MAN']);
      expect(status['MISSING-MAN']).toBeUndefined();
    });
  });

  describe('subscribeManifestProcessedStatus', () => {
    it('handles empty ids gracefully', () => {
      const cb = vi.fn();
      const unsub = subscribeManifestProcessedStatus([], cb);
      expect(cb).toHaveBeenCalledWith({});
      unsub();
    });

    it('triggers Tier 2 snapshot catch block on query error', () => {
      forceTier2Error = true;
      const cb = vi.fn();
      const unsub = subscribeManifestProcessedStatus(['MISSING-MAN'], cb);
      expect(cb).toHaveBeenCalled();
      unsub();
    });

    it('subscribes and updates reactive counts using Tiers 2 and 3 and package fallbacks', async () => {
      mockDb.manifests.set('MAN-1', { totalPackages: 0, processedAt: '2026-08-11', mergedInto: 'MEGA-MAN-1', manifestNumber: 'REAL-MAN-1' });
      mockDb.manifests.set('REAL-MAN-1', { totalPackages: 0, packages: [{ tracking: 'T1' }], processedAt: '2026-08-11' });

      // Tier 2 query hit (triggering fallback packages length by setting totalPackages to 0)
      mockDb.manifests.set('DOC-AUTO-ID', { manifestId: 'MAN-2', packages: [{ tracking: 'T2' }], processedAt: '2026-08-11' });

      // Set STUB-1 to cover line 637 inside subscribeManifestProcessedStatus listener (true branch of startsWith / isLinkedToMegaMan)
      mockDb.manifests.set('STUB-1', { totalPackages: 0, mergedInto: 'MEGA-MAN-1', manifestNumber: 'MEGA-MAN-1' });
      mockDb.manifests.set('MEGA-MAN-1', { totalPackages: 12 });

      // Set STUB-2 to cover packages undefined fallback inside Tier 3 recovery (line 598 false branch)
      mockDb.manifests.set('STUB-2', { totalPackages: 0, mergedInto: 'MEGA-MAN-1', manifestNumber: 'REAL-MAN-2' });
      mockDb.manifests.set('REAL-MAN-2', { totalPackages: 0, packages: undefined, processedAt: '2026-08-11' });

      // Set DOC-AUTO-ID-2 to cover packages undefined fallback inside Tier 2 loop (line 682 false branch)
      mockDb.manifests.set('DOC-AUTO-ID-2', { manifestId: 'MAN-4', packages: undefined, processedAt: '2026-08-11' });

      const cb = vi.fn();
      const unsub = subscribeManifestProcessedStatus(['MAN-1', 'MAN-2', 'STUB-1', 'STUB-2', 'MAN-4'], cb);
      await new Promise(res => setTimeout(res, 20));
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribePackagesByManifest', () => {
    it('returns unsubscriber and handles empty string', () => {
      const cb = vi.fn();
      const unsub = subscribePackagesByManifest('', cb);
      expect(cb).not.toHaveBeenCalled();
      unsub();
    });

    it('handles snapshot callbacks', () => {
      mockDb.packages.set('PKG-1', { trackingNumber: 'TRK1', manifestNumber: 'MAN-1' });
      const cb = vi.fn();
      const unsub = subscribePackagesByManifest('MAN-1', cb);
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribeEncomiendaManifestRows', () => {
    it('subscribes successfully', () => {
      const cb = vi.fn();
      const unsub = subscribeEncomiendaManifestRows('MAN-1', cb);
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribeAllEncomiendaManifests', () => {
    it('maps packages and notifies subscribers with custom createdAt formats', () => {
      mockDb.packages.set('PKG-1', {
        trackingNumber: 'TRK1',
        manifestNumber: 'MAN-ENC',
        ruta: 'Encomiendas',
        status: 'pending',
        createdAt: '2026-08-11T00:00:00Z',
        updatedAt: '2026-08-11T00:00:00Z',
      });
      mockDb.packages.set('PKG-2', {
        trackingNumber: 'TRK2',
        manifestNumber: 'MAN-ENC',
        ruta: 'Encomiendas',
        status: 'pending',
        createdAt: { seconds: 1785938123 },
        updatedAt: { seconds: 1785938123 },
      });
      mockDb.packages.set('PKG-3', {
        trackingNumber: 'TRK3',
        manifestNumber: 'MAN-ENC',
        ruta: 'Encomiendas',
        status: 'pending',
      });

      const cb = vi.fn();
      const unsub = subscribeAllEncomiendaManifests(cb);
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribeConsolidationManifestRows', () => {
    it('subscribes successfully', () => {
      const cb = vi.fn();
      const unsub = subscribeConsolidationManifestRows('MAN-1', cb);
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });

  describe('subscribeAllConsolidationManifests', () => {
    it('subscribes successfully mapping consolidation entries', () => {
      mockDb.manifest_consolidations.set('ROW-1', {
        manifestNumber: 'MAN-1',
        customerName: 'Alice',
        updatedManifest: 'MEGA-MAN-1',
      });
      const cb = vi.fn();
      const unsub = subscribeAllConsolidationManifests(cb);
      expect(cb).toHaveBeenCalled();
      unsub();
    });
  });
});
