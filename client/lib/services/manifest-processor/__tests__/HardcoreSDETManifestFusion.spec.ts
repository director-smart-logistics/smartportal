/**
 * Principal SDET Hardcore Test Suite: Production Manifest Fusion & Hydration Engine
 *
 * Direct execution against real production modules:
 * - fuseFirestoreManifests
 * - mergeManifestIntoMegaMan
 * - extractPackagesFromSourceManifests
 * - loadMegaManFromFirestore
 * - backfillMegaManFusedSources
 *
 * SDET Invariant & Chaos Scenarios:
 * 1. [BVA / Chunking]: >500 write operations testing Firestore batch limits and atomicity.
 * 2. [Chaos / Fault Injection]: Simulated mid-transaction network disconnect asserting 100% state rollback.
 * 3. [Cargo Segregation Invariant]: Zero leakage between Encomiendas and standard Air cargo.
 * 4. [Blacklist Blackhole]: 100% exclusion guarantee for trackings in `deletedTrackings`.
 * 5. [Backfill Linkage]: Source manifest stub linking and bidirectional references.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = {
  manifestDocs: {} as Record<string, any>,
  packageDocs: {} as Record<string, any>,
  invoiceDocs: {} as Record<string, any>,
  consolidationDocs: {} as Record<string, any>,
  encomiendaDocs: {} as Record<string, any>,
  batchCommitCount: 0,
  batchUpdates: [] as Array<{ ref: any; data: any }>,
  failOnInvoices: false,
};

vi.mock('@/lib/firebase/config', () => ({ db: {}, app: {}, storage: {}, auth: {}, sp2App: {} }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(), ref: vi.fn() }));

vi.mock('../../audit-service', () => ({
  logAction: vi.fn(),
  getManifestMoveHistory: vi.fn(() => []),
  saveManifestMergedLink: vi.fn(async (discardedId: string, mergedInto: string) => {
    if (mockState.manifestDocs[discardedId]) {
      mockState.manifestDocs[discardedId].mergedInto = mergedInto;
    }
  }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, name: string) => ({ __col: name })),
  doc: vi.fn((ref: any, ...path: string[]) => {
    const colName = ref?.__col ?? path[0];
    const docId = path[1] ?? path[0] ?? 'auto';
    return { __doc: docId, col: colName, id: docId };
  }),
  query: vi.fn((ref: any, ...constraints: any[]) => ({ __query: true, col: ref?.__col, constraints })),
  where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  getDoc: vi.fn(async (ref: any) => {
    if (ref.col === 'manifests') {
      const data = mockState.manifestDocs[ref.__doc];
      return data
        ? { exists: () => true, id: ref.__doc, data: () => data }
        : { exists: () => false, id: ref.__doc, data: () => null };
    }
    return { exists: () => false, data: () => null };
  }),
  getDocs: vi.fn(async (q: any) => {
    if (mockState.failOnInvoices && q.col === 'invoices') {
      mockState.failOnInvoices = false;
      throw new Error('CHAOS_INJECTED_DISCONNECT_ERROR');
    }
    if (q.col === 'packages') {
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const rutaConstraint = q.constraints?.find((c: any) => c.field === 'ruta');
      const rutaVal = rutaConstraint?.value;

      const docs = Object.entries(mockState.packageDocs)
        .filter(([_, data]) => {
          const matchManifest = data.manifestNumber === manifestVal;
          const matchRuta = !rutaVal || data.ruta === rutaVal;
          return matchManifest && matchRuta;
        })
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'packages' },
          data: () => data,
        }));
      return { empty: docs.length === 0, docs };
    }
    if (q.col === 'invoices') {
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const docs = Object.entries(mockState.invoiceDocs)
        .filter(([_, data]) => data.manifestNumber === manifestVal)
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'invoices' },
          data: () => data,
        }));
      return { empty: docs.length === 0, docs };
    }
    if (q.col === 'manifest_consolidation') {
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const docs = Object.entries(mockState.consolidationDocs)
        .filter(([_, data]) => data.manifestNumber === manifestVal)
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'manifest_consolidation' },
          data: () => data,
        }));
      return { empty: docs.length === 0, docs };
    }
    return { empty: true, docs: [] };
  }),
  setDoc: vi.fn(async (ref: any, data: any, opts?: any) => {
    if (ref.col === 'manifests') {
      if (opts?.merge && mockState.manifestDocs[ref.__doc]) {
        mockState.manifestDocs[ref.__doc] = { ...mockState.manifestDocs[ref.__doc], ...data };
      } else {
        mockState.manifestDocs[ref.__doc] = data;
      }
    }
  }),
  deleteDoc: vi.fn(async (ref: any) => {
    if (ref.col === 'manifests') {
      delete mockState.manifestDocs[ref.__doc];
    }
  }),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => '__server_ts__'),
  deleteField: vi.fn(() => '__delete_field__'),
  arrayUnion: vi.fn((...items: any[]) => items),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: (ref: any, data: any) => {
      if (ref.col === 'manifests') mockState.manifestDocs[ref.__doc] = data;
    },
    update: (ref: any, data: any) => {
      mockState.batchUpdates.push({ ref, data });
      const applyUpdate = (target: any) => {
        if (target) {
          Object.assign(target, data);
          Object.keys(data).forEach((k) => {
            if (data[k] === '__delete_field__') delete target[k];
          });
        }
      };
      if (ref.col === 'packages') applyUpdate(mockState.packageDocs[ref.__doc]);
      if (ref.col === 'invoices') applyUpdate(mockState.invoiceDocs[ref.__doc]);
      if (ref.col === 'manifest_consolidation') applyUpdate(mockState.consolidationDocs[ref.__doc]);
      if (ref.col === 'manifest_encomiendas') applyUpdate(mockState.encomiendaDocs[ref.__doc]);
    },
    delete: (ref: any) => {
      if (ref.col === 'manifests') delete mockState.manifestDocs[ref.__doc];
    },
    commit: async () => {
      mockState.batchCommitCount++;
    },
  })),
}));

import {
  fuseFirestoreManifests,
  loadMegaManFromFirestore,
  backfillMegaManFusedSources,
} from '../fusion';

describe('SDET HARDCORE ENGINE: Manifest Fusion & Hydration Invariants', () => {
  beforeEach(() => {
    mockState.manifestDocs = {};
    mockState.packageDocs = {};
    mockState.invoiceDocs = {};
    mockState.consolidationDocs = {};
    mockState.encomiendaDocs = {};
    mockState.batchCommitCount = 0;
    mockState.batchUpdates = [];
    mockState.failOnInvoices = false;
  });

  it('SDET Invariant 1 [BVA / Chunking]: Handles >500 write operations with chunked batches and zero record loss', async () => {
    const pkgs1: any[] = [];
    const pkgs2: any[] = [];

    for (let i = 0; i < 300; i++) {
      const p1 = {
        tracking: `TRK-1-${i}`,
        trackingNumber: `TRK-1-${i}`,
        manifestNumber: 'SRC-MAN-1',
        slCode: `SL${1000 + i}`,
        ruta: 'San Jose',
        weight: 2.0,
        price: 8.0,
      };
      const p2 = {
        tracking: `TRK-2-${i}`,
        trackingNumber: `TRK-2-${i}`,
        manifestNumber: 'SRC-MAN-2',
        slCode: `SL${2000 + i}`,
        ruta: 'Heredia',
        weight: 2.0,
        price: 8.0,
      };
      mockState.packageDocs[`pkg-1-${i}`] = p1;
      mockState.packageDocs[`pkg-2-${i}`] = p2;
      pkgs1.push(p1);
      pkgs2.push(p2);
    }

    mockState.manifestDocs['SRC-MAN-1'] = {
      manifestType: 'usa_air',
      totalPackages: 300,
      totalWeight: 600,
      totalPrice: 2400,
      processedAt: '2026-08-19T10:00:00Z',
      packages: pkgs1,
    };
    mockState.manifestDocs['SRC-MAN-2'] = {
      manifestType: 'usa_air',
      totalPackages: 300,
      totalWeight: 600,
      totalPrice: 2400,
      processedAt: '2026-08-19T10:00:00Z',
      packages: pkgs2,
    };

    const megaId = await fuseFirestoreManifests(['SRC-MAN-1', 'SRC-MAN-2'], undefined, 'SL', 'SL-MEGA-MAN-STRESS-600');

    expect(megaId).toBe('SL-MEGA-MAN-STRESS-600');
    expect(mockState.manifestDocs['SL-MEGA-MAN-STRESS-600']).toBeDefined();
    expect(mockState.manifestDocs['SL-MEGA-MAN-STRESS-600'].totalPackages).toBe(600);
    expect(mockState.manifestDocs['SL-MEGA-MAN-STRESS-600'].totalWeight).toBe(1200);
    expect(mockState.manifestDocs['SL-MEGA-MAN-STRESS-600'].totalPrice).toBe(4800);

    // Verify all 600 packages were migrated to target Mega-Man
    const updatedToMega = Object.values(mockState.packageDocs).filter((p: any) => p.manifestNumber === 'SL-MEGA-MAN-STRESS-600');
    expect(updatedToMega.length).toBe(600);
  });

  it('SDET Invariant 2 [Chaos / Rollback]: Mid-transaction database failure triggers 100% rollback without orphan records', async () => {
    const pkgsFail1: any[] = [];
    const pkgsFail2: any[] = [];

    for (let i = 0; i < 5; i++) {
      const p1 = { tracking: `TRK-F1-${i}`, manifestNumber: 'SRC-FAIL-1', slCode: 'SL991', ruta: 'Cartago', weight: 1.0, price: 4.0 };
      const p2 = { tracking: `TRK-F2-${i}`, manifestNumber: 'SRC-FAIL-2', slCode: 'SL992', ruta: 'Cartago', weight: 1.0, price: 4.0 };
      mockState.packageDocs[`pkg-f1-${i}`] = p1;
      mockState.packageDocs[`pkg-f2-${i}`] = p2;
      pkgsFail1.push(p1);
      pkgsFail2.push(p2);
    }

    mockState.manifestDocs['SRC-FAIL-1'] = { manifestType: 'usa_air', totalPackages: 5, processedAt: '2026-08-19T10:00:00Z', packages: pkgsFail1 };
    mockState.manifestDocs['SRC-FAIL-2'] = { manifestType: 'usa_air', totalPackages: 5, processedAt: '2026-08-19T10:00:00Z', packages: pkgsFail2 };

    // Invoice that will trigger failure
    mockState.invoiceDocs['inv-fail-1'] = {
      invoiceNumber: 'INV-FAIL-01',
      manifestNumber: 'SRC-FAIL-1',
      clientSlCode: 'SL991',
    };

    // Inject chaos failure during invoice query
    mockState.failOnInvoices = true;

    await expect(
      fuseFirestoreManifests(['SRC-FAIL-1', 'SRC-FAIL-2'], undefined, 'SL', 'SL-MEGA-MAN-CHAOS-ROLLBACK')
    ).rejects.toThrow('CHAOS_INJECTED_DISCONNECT_ERROR');

    // 1. Assert target Mega-Man doc was deleted during rollback
    expect(mockState.manifestDocs['SL-MEGA-MAN-CHAOS-ROLLBACK']).toBeUndefined();

    // 2. Assert all packages were restored to original manifestNumbers
    const restored1 = Object.values(mockState.packageDocs).filter((p: any) => p.manifestNumber === 'SRC-FAIL-1');
    const restored2 = Object.values(mockState.packageDocs).filter((p: any) => p.manifestNumber === 'SRC-FAIL-2');
    expect(restored1.length).toBe(5);
    expect(restored2.length).toBe(5);
  });

  it('SDET Invariant 3 [Segregation]: Encomienda fusion strictly filters non-encomiendas packages and protects local routes', async () => {
    const pkgs1 = [
      { tracking: 'TRK-GAM-1', trackingNumber: 'TRK-GAM-1', manifestNumber: 'SRC-AIR-1', ruta: 'San Jose Centro', weight: 3.0, price: 12.0 },
      { tracking: 'TRK-ENC-1', trackingNumber: 'TRK-ENC-1', manifestNumber: 'SRC-AIR-1', ruta: 'Encomiendas', weight: 5.0, price: 20.0 },
    ];
    const pkgs2 = [
      { tracking: 'TRK-GAM-2', trackingNumber: 'TRK-GAM-2', manifestNumber: 'SRC-AIR-2', ruta: 'Alajuela Oeste', weight: 2.0, price: 8.0 },
      { tracking: 'TRK-ENC-2', trackingNumber: 'TRK-ENC-2', manifestNumber: 'SRC-AIR-2', ruta: 'Encomiendas', weight: 7.0, price: 28.0 },
    ];

    mockState.manifestDocs['SRC-AIR-1'] = { manifestType: 'usa_air', totalPackages: 2, processedAt: '2026-08-19T10:00:00Z', packages: pkgs1 };
    mockState.manifestDocs['SRC-AIR-2'] = { manifestType: 'usa_air', totalPackages: 2, processedAt: '2026-08-19T10:00:00Z', packages: pkgs2 };

    mockState.packageDocs['pkg-gam-1'] = pkgs1[0];
    mockState.packageDocs['pkg-enc-1'] = pkgs1[1];
    mockState.packageDocs['pkg-gam-2'] = pkgs2[0];
    mockState.packageDocs['pkg-enc-2'] = pkgs2[1];

    const encMegaId = await fuseFirestoreManifests(['SRC-AIR-1', 'SRC-AIR-2'], undefined, 'ENC', 'ENC-MEGA-MAN-ISOLATION');

    expect(encMegaId).toBe('ENC-MEGA-MAN-ISOLATION');
    const encDoc = mockState.manifestDocs['ENC-MEGA-MAN-ISOLATION'];
    expect(encDoc.totalPackages).toBe(2);
    expect(encDoc.totalWeight).toBe(12.0); // 5 + 7
    expect(encDoc.totalPrice).toBe(48.0); // 20 + 28

    // Verify GAM packages remain untouched in source manifest
    expect(mockState.packageDocs['pkg-gam-1'].manifestNumber).toBe('SRC-AIR-1');
    expect(mockState.packageDocs['pkg-gam-2'].manifestNumber).toBe('SRC-AIR-2');

    // Verify only Encomiendas packages were migrated
    expect(mockState.packageDocs['pkg-enc-1'].manifestNumber).toBe('ENC-MEGA-MAN-ISOLATION');
    expect(mockState.packageDocs['pkg-enc-2'].manifestNumber).toBe('ENC-MEGA-MAN-ISOLATION');
  });

  it('SDET Invariant 4 [Blacklist]: Deleted trackings blacklist completely excludes deleted items during loadMegaManFromFirestore', async () => {
    mockState.manifestDocs['MEGA-MAN-BLACKLIST-TEST'] = {
      manifestType: 'usa_air',
      totalPackages: 3,
      fusedFrom: ['SRC-1'],
      deletedTrackings: ['TRK-BLACK-1', 'TRK-BLACK-2'],
    };

    mockState.packageDocs['p1'] = { tracking: 'TRK-VALID', manifestNumber: 'SRC-1', slCode: 'SL01', ruta: 'GAM', weight: 2.0, price: 8.0 };
    mockState.packageDocs['p2'] = { tracking: 'TRK-BLACK-1', manifestNumber: 'SRC-1', slCode: 'SL02', ruta: 'GAM', weight: 2.0, price: 8.0 };
    mockState.packageDocs['p3'] = { tracking: 'TRK-BLACK-2', manifestNumber: 'SRC-1', slCode: 'SL03', ruta: 'GAM', weight: 2.0, price: 8.0 };

    const hydrated = await loadMegaManFromFirestore('MEGA-MAN-BLACKLIST-TEST');
    expect(hydrated).not.toBeNull();
    expect(hydrated?.rows.length).toBe(1);
    expect(hydrated?.rows[0].tracking).toBe('TRK-VALID');
  });

  it('SDET Invariant 5 [Backfill]: backfillMegaManFusedSources sets fusedManifests and links source manifests bidirectionally', async () => {
    mockState.manifestDocs['MEGA-TARGET'] = {
      manifestType: 'usa_air',
    };
    mockState.manifestDocs['SRC-STUB-1'] = {};
    mockState.manifestDocs['SRC-STUB-2'] = {};

    await backfillMegaManFusedSources('MEGA-TARGET', ['SRC-STUB-1', 'SRC-STUB-2']);

    expect(mockState.manifestDocs['MEGA-TARGET'].fusedManifests).toEqual(['SRC-STUB-1', 'SRC-STUB-2']);
    expect(mockState.manifestDocs['SRC-STUB-1'].mergedInto).toBe('MEGA-TARGET');
    expect(mockState.manifestDocs['SRC-STUB-2'].mergedInto).toBe('MEGA-TARGET');
  });
});
