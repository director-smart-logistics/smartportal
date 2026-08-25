// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healMegaManManifest, healAllMegaManManifests, rollbackMegaManFusion } from '.././megaManHealer';

// Mock Firestore Database & functions (hoisted)
const { mockDb, writeBatch } = vi.hoisted(() => {
  const mockDb = {
    manifests: new Map<string, any>(),
    packages: new Map<string, any>(),
    invoices: new Map<string, any>(),
  };

  const batchUpdate = vi.fn(function(this: any, ref: any, data: any) {
    const col = mockDb[ref.col as keyof typeof mockDb];
    if (col) {
      const existing = col.get(ref.id) || {};
      col.set(ref.id, { ...existing, ...data });
    }
    return this;
  });

  const batchCommit = vi.fn(async () => {});

  const writeBatch = vi.fn(() => ({
    update: batchUpdate,
    commit: batchCommit,
  }));

  return { mockDb, writeBatch };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name, id: name })),
  doc: vi.fn((_db, col, id) => ({ col, id, ref: { col, id } })),
  getDoc: vi.fn(async (ref: any) => {
    const data = mockDb[ref.col as keyof typeof mockDb]?.get(ref.id);
    return { exists: () => !!data, data: () => data, ref };
  }),
  getDocs: vi.fn(async (q: any) => {
    const collName = q.coll?.name || q.name;
    const list: any[] = [];

    if (collName === 'manifests') {
      mockDb.manifests.forEach((val, id) => {
        list.push({ id, data: () => val });
      });
    } else if (collName === 'packages') {
      const manifestNumberClause = q.clauses?.find((c: any) => c.field === 'manifestNumber');
      mockDb.packages.forEach((val, id) => {
        if (!manifestNumberClause || val.manifestNumber === manifestNumberClause.value) {
          list.push({ id, ref: { col: 'packages', id }, data: () => val });
        }
      });
    } else if (collName === 'invoices') {
      mockDb.invoices.forEach((val, id) => {
        list.push({ id, ref: { col: 'invoices', id }, data: () => val });
      });
    }

    return {
      empty: list.length === 0,
      docs: list,
      forEach: (cb: any) => list.forEach(cb),
    };
  }),
  query: vi.fn((colRef: any, ...clauses: any[]) => ({ ...colRef, clauses })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  writeBatch,
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('../../audit-service', () => ({
  logAction: vi.fn(),
}));

describe('healMegaManManifest', () => {
  beforeEach(() => {
    mockDb.manifests.clear();
    mockDb.packages.clear();
    mockDb.invoices.clear();
    vi.clearAllMocks();
  });

  it('should return warning message if mega-man manifest does not exist', async () => {
    const res = await healMegaManManifest('ENC-MEGA-NONEXIST');
    expect(res.packagesHealed).toBe(0);
    expect(res.details[0]).toContain('no existe');
  });

  it('should return warning if no packages or sources are registered', async () => {
    mockDb.manifests.set('MEGA-MAN-EMPTY', {
      packages: [],
      fusedFrom: [],
    });
    const res = await healMegaManManifest('MEGA-MAN-EMPTY');
    expect(res.details[0]).toContain('No hay paquetes ni fuentes registradas');
  });

  it('should heal package manifests correctly', async () => {
    mockDb.manifests.set('MEGA-MAN-123', {
      isMegaMan: true,
      fusedManifests: ['MAN-SOURCE-1'],
      packages: [
        { tracking: 'TRK1', slCode: 'SL1', weight: 5, price: 10, ruta: 'R1' },
      ],
    });

    mockDb.manifests.set('MAN-SOURCE-1', {
      packages: [
        { tracking: 'TRK1', slCode: 'SL1', weight: 5, price: 10, ruta: 'R1' },
        { tracking: 'TRK2', slCode: 'SL2', weight: 8, price: 15, ruta: 'R2' },
        { tracking: 'TRK3', slCode: 'SL2', weight: 1, price: 2, ruta: 'R2' }, // duplicate slCode to cover line 95
        { tracking: 'TRK4', weight: 1, price: 1 }, // empty slCode to cover line 93
      ],
    });

    mockDb.packages.set('TRK1', {
      manifestNumber: 'MAN-SOURCE-1',
    });

    const res = await healMegaManManifest('MEGA-MAN-123');

    // Source manifest should be cleaned (TRK1 removed)
    const srcDoc = mockDb.manifests.get('MAN-SOURCE-1');
    expect(srcDoc.packages.length).toBe(3);
    expect(srcDoc.packages[0].tracking).toBe('TRK2');

    expect(res.sourceManifestsCleaned).toBe(1);
    expect(res.packagesHealed).toBe(1);

    const pkgDoc = mockDb.packages.get('TRK1');
    expect(pkgDoc.manifestNumber).toBe('MEGA-MAN-123');
  });

  it('should handle ENC- prefix and heal invoices', async () => {
    mockDb.manifests.set('ENC-MEGA-MAN-99', {
      packages: [
        { tracking: 'TRK-ENC', slCode: 'SL-ENC', weight: 4, price: 8, ruta: 'Encomiendas' },
      ],
      fusedFrom: ['ENC-SOURCE-1'],
    });

    mockDb.manifests.set('ENC-SOURCE-1', {
      packages: [
        { tracking: 'TRK-ENC', slCode: 'SL-ENC', weight: 4, price: 8, ruta: 'Encomiendas' },
      ],
    });

    mockDb.packages.set('TRK-ENC', {
      manifestNumber: 'ENC-SOURCE-1',
      encomiendaManifestNumber: 'ENC-SOURCE-1',
    });

    mockDb.invoices.set('INV-1', {
      manifestNumber: 'ENC-SOURCE-1',
      trackingNumbers: ['TRK-ENC'],
    });

    const res = await healMegaManManifest('ENC-MEGA-MAN-99');
    expect(res.packagesHealed).toBe(1);
    expect(res.invoicesHealed).toBe(1);

    const pkgDoc = mockDb.packages.get('TRK-ENC');
    expect(pkgDoc.manifestNumber).toBe('ENC-MEGA-MAN-99');
    expect(pkgDoc.encomiendaManifestNumber).toBe('ENC-MEGA-MAN-99');

    const invDoc = mockDb.invoices.get('INV-1');
    expect(invDoc.manifestNumber).toBe('ENC-MEGA-MAN-99');
  });

  it('should heal all mega man manifests in the system', async () => {
    mockDb.manifests.set('MEGA-MAN-1', {
      isMegaMan: true,
      fusedManifests: [],
      packages: [],
    });

    const results = await healAllMegaManManifests();
    expect(results).toHaveLength(1);
    expect(results[0].megaManId).toBe('MEGA-MAN-1');
  });

  it('should rollback mega man fusions correctly', async () => {
    mockDb.packages.set('TRK-1', {
      manifestNumber: 'MEGA-MAN-123',
      originalManifest: 'SOURCE-1',
    });

    mockDb.invoices.set('INV-1', {
      manifestNumber: 'MEGA-MAN-123',
      originalManifest: 'SOURCE-1',
    });

    const res = await rollbackMegaManFusion('MEGA-MAN-123');
    expect(res.packagesReverted).toBe(1);
    expect(res.invoicesReverted).toBe(1);

    const pkgDoc = mockDb.packages.get('TRK-1');
    expect(pkgDoc.manifestNumber).toBe('SOURCE-1');

    const invDoc = mockDb.invoices.get('INV-1');
    expect(invDoc.manifestNumber).toBe('SOURCE-1');
  });
});
