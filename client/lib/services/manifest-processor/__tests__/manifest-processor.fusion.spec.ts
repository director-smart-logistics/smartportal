import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreState = {
  setDocCalls: [] as Array<{ ref: any; data: any; merge?: boolean }>,
  deleteDocCalls: [] as Array<any>,
  batchUpdateCalls: [] as Array<{ ref: any; data: any }>,
  batchCommitCount: 0,
  manifestDocs: {} as Record<string, any>,
  packageDocs: {} as Record<string, any>,
  invoiceDocs: {} as Record<string, any>,
  consolidationDocs: {} as Record<string, any>,
  encomiendaDocs: {} as Record<string, any>,
  auditLogCalls: [] as Array<any>,
  shouldThrowError: false,
};

vi.mock('@/lib/firebase/config', () => ({ db: {}, app: {}, storage: {}, auth: {}, sp2App: {} }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(), ref: vi.fn() }));

// Mock the audit-service's logAction
vi.mock('../../audit-service', () => ({
  logAction: vi.fn((entry: any) => {
    firestoreState.auditLogCalls.push(entry);
  }),
  getManifestMoveHistory: vi.fn(() => []),
  saveManifestMergedLink: vi.fn(async (discardedId: string, mergedInto: string) => {
    if (firestoreState.manifestDocs[discardedId]) {
      firestoreState.manifestDocs[discardedId].mergedInto = mergedInto;
    }
  })
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
  getDoc: vi.fn(async (ref: any) => {
    if (ref.col === 'manifests') {
      const data = firestoreState.manifestDocs[ref.__doc];
      return data
        ? { exists: () => true, id: ref.__doc, data: () => data }
        : { exists: () => false, id: ref.__doc, data: () => null };
    }
    return { exists: () => false, data: () => null };
  }),
  getDocs: vi.fn(async (q: any) => {
    if (firestoreState.shouldThrowError && q.col === 'invoices') {
      firestoreState.shouldThrowError = false; // Reset so rollback actions succeed
      throw new Error('DELIBERATE_DATABASE_DISCONNECT');
    }
    if (q.col === 'packages') {
      // Find package docs queried
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const rutaConstraint = q.constraints?.find((c: any) => c.field === 'ruta');
      const rutaVal = rutaConstraint?.value;

      const docs = Object.entries(firestoreState.packageDocs)
        .filter(([_, data]) => {
          const matchManifest = data.manifestNumber === manifestVal;
          const matchRuta = !rutaVal || data.ruta === rutaVal;
          return matchManifest && matchRuta;
        })
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'packages' },
          data: () => data
        }));
      return { empty: docs.length === 0, docs };
    }
    if (q.col === 'invoices') {
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const docs = Object.entries(firestoreState.invoiceDocs)
        .filter(([_, data]) => data.manifestNumber === manifestVal)
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'invoices' },
          data: () => data
        }));
      return { empty: docs.length === 0, docs };
    }
    if (q.col === 'manifest_consolidation') {
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const docs = Object.entries(firestoreState.consolidationDocs)
        .filter(([_, data]) => data.manifestNumber === manifestVal)
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'manifest_consolidation' },
          data: () => data
        }));
      return { empty: docs.length === 0, docs };
    }
    if (q.col === 'manifest_encomiendas') {
      const manifestConstraint = q.constraints?.find((c: any) => c.field === 'manifestNumber');
      const manifestVal = manifestConstraint?.value;
      const docs = Object.entries(firestoreState.encomiendaDocs)
        .filter(([_, data]) => data.manifestNumber === manifestVal)
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'manifest_encomiendas' },
          data: () => data
        }));
      return { empty: docs.length === 0, docs };
    }
    if (q.col === 'manifests' || q.__col === 'manifests') {
      const docs = Object.entries(firestoreState.manifestDocs)
        .map(([id, data]) => ({
          id,
          ref: { __doc: id, col: 'manifests' },
          data: () => data
        }));
      return { empty: docs.length === 0, docs };
    }
    return { empty: true, docs: [] };
  }),
  setDoc: vi.fn(async (ref: any, data: any, opts?: any) => {
    firestoreState.setDocCalls.push({ ref, data, merge: opts?.merge });
    if (ref.col === 'manifests') {
      if (opts?.merge && firestoreState.manifestDocs[ref.__doc]) {
        firestoreState.manifestDocs[ref.__doc] = {
          ...firestoreState.manifestDocs[ref.__doc],
          ...data
        };
      } else {
        firestoreState.manifestDocs[ref.__doc] = data;
      }
    }
  }),
  deleteDoc: vi.fn(async (ref: any) => {
    firestoreState.deleteDocCalls.push(ref);
    if (ref.col === 'manifests') {
      delete firestoreState.manifestDocs[ref.__doc];
    }
  }),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => '__server_ts__'),
  deleteField: vi.fn(() => '__delete_field__'),
  writeBatch: vi.fn(() => ({
    set: (ref: any, data: any, opts?: any) => {
      if (ref.col === 'manifests') {
        firestoreState.manifestDocs[ref.__doc] = data;
      }
    },
    update: (ref: any, data: any) => {
      firestoreState.batchUpdateCalls.push({ ref, data });
      // Update mock states locally while handling deleteField() simulation
      const applyUpdate = (target: any) => {
        if (target) {
          Object.assign(target, data);
          Object.keys(data).forEach(key => {
            if (data[key] === '__delete_field__') {
              delete target[key];
            }
          });
        }
      };
      if (ref.col === 'packages') applyUpdate(firestoreState.packageDocs[ref.__doc]);
      if (ref.col === 'invoices') applyUpdate(firestoreState.invoiceDocs[ref.__doc]);
      if (ref.col === 'manifest_consolidation') applyUpdate(firestoreState.consolidationDocs[ref.__doc]);
      if (ref.col === 'manifest_encomiendas') applyUpdate(firestoreState.encomiendaDocs[ref.__doc]);
    },
    delete: (ref: any) => {
      if (ref.col === 'manifests') delete firestoreState.manifestDocs[ref.__doc];
    },
    commit: async () => {
      firestoreState.batchCommitCount++;
    },
  })),
  runTransaction: vi.fn(),
}));

import {
  fuseFirestoreManifests,
  mergeManifestIntoMegaMan,
  extractPackagesFromSourceManifests,
  loadMegaManFromFirestore
} from '../../manifest-processor';

describe('Encomiendas Mega-Man Fusion & Extraction Specs', () => {
  beforeEach(() => {
    firestoreState.setDocCalls = [];
    firestoreState.deleteDocCalls = [];
    firestoreState.batchUpdateCalls = [];
    firestoreState.batchCommitCount = 0;
    firestoreState.manifestDocs = {};
    firestoreState.packageDocs = {};
    firestoreState.invoiceDocs = {};
    firestoreState.consolidationDocs = {};
    firestoreState.encomiendaDocs = {};
    firestoreState.auditLogCalls = [];
    firestoreState.shouldThrowError = false;
  });

  it('fuseFirestoreManifests: extracts encomienda packages and recalculates totals', async () => {
    // 1. Set up mock source manifests
    // Manifest 1: Mixto
    firestoreState.manifestDocs['21-05-2026DAN'] = {
      manifestNumber: '21-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 2,
      totalWeight: 10,
      totalPrice: 100,
      packages: [
        { tracking: 'TRK-ENC-1', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 },
        { tracking: 'TRK-REG-1', slCode: 'SL-NAN-2', ruta: 'San Jose', weight: 6, price: 60 }
      ]
    };
    
    // Manifest 2: Puro (only encomiendas)
    firestoreState.manifestDocs['22-05-2026DAN'] = {
      manifestNumber: '22-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 1,
      totalWeight: 5,
      totalPrice: 50,
      packages: [
        { tracking: 'TRK-ENC-2', slCode: 'SL-NAN-3', ruta: 'Encomiendas', weight: 5, price: 50 }
      ]
    };

    // Load matching package documents in collection
    firestoreState.packageDocs['TRK-ENC-1'] = { tracking: 'TRK-ENC-1', manifestNumber: '21-05-2026DAN', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 };
    firestoreState.packageDocs['TRK-ENC-2'] = { tracking: 'TRK-ENC-2', manifestNumber: '22-05-2026DAN', slCode: 'SL-NAN-3', ruta: 'Encomiendas', weight: 5, price: 50 };
    firestoreState.packageDocs['TRK-REG-1'] = { tracking: 'TRK-REG-1', manifestNumber: '21-05-2026DAN', slCode: 'SL-NAN-2', ruta: 'San Jose', weight: 6, price: 60 };

    // Load matching invoice documents in collection
    firestoreState.invoiceDocs['INV-1'] = { invoiceNumber: 'INV-1', manifestNumber: '21-05-2026DAN', clientSlCode: 'SL-NAN-1' };
    firestoreState.invoiceDocs['INV-2'] = { invoiceNumber: 'INV-2', manifestNumber: '22-05-2026DAN', clientSlCode: 'SL-NAN-3' };
    firestoreState.invoiceDocs['INV-REG'] = { invoiceNumber: 'INV-REG', manifestNumber: '21-05-2026DAN', clientSlCode: 'SL-NAN-2' };

    // 2. Perform fusion
    const megaManId = await fuseFirestoreManifests(['21-05-2026DAN', '22-05-2026DAN'], undefined, 'ENC');
    
    // Assert derived ID
    expect(megaManId).toBe('ENC-MEGA-MAN-22-05-2026');

    // Verification
    const megaDoc = firestoreState.manifestDocs[megaManId];
    expect(megaDoc).toBeDefined();
    expect(megaDoc.totalPackages).toBe(2); // TRK-ENC-1 and TRK-ENC-2
    expect(megaDoc.totalWeight).toBe(9);
    expect(megaDoc.totalPrice).toBe(90);

    // Source 1 (Mixto) must be updated and recalculated, but NOT marked as merged
    const src1 = firestoreState.manifestDocs['21-05-2026DAN'];
    expect(src1.totalPackages).toBe(1);
    expect(src1.totalWeight).toBe(6);
    expect(src1.totalPrice).toBe(60);
    expect(src1.packages.length).toBe(1);
    expect(src1.packages[0].tracking).toBe('TRK-REG-1');
    expect(src1.mergedInto).toBeUndefined();

    // Source 2 (Puro) must be completely extracted, set to 0, and marked as mergedInto
    const src2 = firestoreState.manifestDocs['22-05-2026DAN'];
    expect(src2.totalPackages).toBe(0);
    expect(src2.packages.length).toBe(0);
    expect(src2.mergedInto).toBe(megaManId);

    // Verify Packages collection updates (encomiendaManifestNumber and originalManifest set)
    expect(firestoreState.packageDocs['TRK-ENC-1'].manifestNumber).toBe(megaManId);
    expect(firestoreState.packageDocs['TRK-ENC-1'].encomiendaManifestNumber).toBe(megaManId);
    expect(firestoreState.packageDocs['TRK-ENC-1'].originalManifest).toBe('21-05-2026DAN');
    expect(firestoreState.packageDocs['TRK-REG-1'].manifestNumber).toBe('21-05-2026DAN'); // regular unchanged

    // Verify Invoices updates
    expect(firestoreState.invoiceDocs['INV-1'].manifestNumber).toBe(megaManId);
    expect(firestoreState.invoiceDocs['INV-1'].originalManifest).toBe('21-05-2026DAN');
    expect(firestoreState.invoiceDocs['INV-REG'].manifestNumber).toBe('21-05-2026DAN'); // regular unchanged

    // Verify Audit Logs
    const stages = firestoreState.auditLogCalls.map(e => e.metadata?.stage);
    expect(stages).toContain('fusion_started');
    expect(stages).toContain('fusion_success');
  });

  it('fuseFirestoreManifests: rollback triggers and restores state if error occurs', async () => {
    // Setup initial source manifest state
    firestoreState.manifestDocs['21-05-2026DAN'] = {
      manifestNumber: '21-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 1,
      totalWeight: 4,
      totalPrice: 40,
      packages: [
        { tracking: 'TRK-ENC-1', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 }
      ]
    };
    firestoreState.manifestDocs['22-05-2026DAN'] = {
      manifestNumber: '22-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 1,
      totalWeight: 5,
      totalPrice: 50,
      packages: [
        { tracking: 'TRK-ENC-2', slCode: 'SL-NAN-3', ruta: 'Encomiendas', weight: 5, price: 50 }
      ]
    };

    firestoreState.packageDocs['TRK-ENC-1'] = { tracking: 'TRK-ENC-1', manifestNumber: '21-05-2026DAN', slCode: 'SL-NAN-1', ruta: 'Encomiendas' };
    firestoreState.packageDocs['TRK-ENC-2'] = { tracking: 'TRK-ENC-2', manifestNumber: '22-05-2026DAN', slCode: 'SL-NAN-3', ruta: 'Encomiendas' };
    
    firestoreState.invoiceDocs['INV-1'] = { invoiceNumber: 'INV-1', manifestNumber: '21-05-2026DAN', clientSlCode: 'SL-NAN-1' };
    firestoreState.invoiceDocs['INV-2'] = { invoiceNumber: 'INV-2', manifestNumber: '22-05-2026DAN', clientSlCode: 'SL-NAN-3' };

    // Toggle error injection inside Firestore query executions
    firestoreState.shouldThrowError = true;

    // Run fusion expecting it to throw and trigger rollback
    await expect(
      fuseFirestoreManifests(['21-05-2026DAN', '22-05-2026DAN'], undefined, 'ENC')
    ).rejects.toThrow('La fusión falló: DELIBERATE_DATABASE_DISCONNECT. La base de datos fue revertida automáticamente.');

    // Assert that source manifests are fully restored to their original snapshot states
    expect(firestoreState.manifestDocs['21-05-2026DAN'].totalPackages).toBe(1);
    expect(firestoreState.manifestDocs['21-05-2026DAN'].packages.length).toBe(1);
    expect(firestoreState.manifestDocs['21-05-2026DAN'].mergedInto).toBeUndefined();

    expect(firestoreState.manifestDocs['22-05-2026DAN'].totalPackages).toBe(1);
    expect(firestoreState.manifestDocs['22-05-2026DAN'].packages.length).toBe(1);
    expect(firestoreState.manifestDocs['22-05-2026DAN'].mergedInto).toBeUndefined();

    // Assert that packages in packages collection are restored
    expect(firestoreState.packageDocs['TRK-ENC-1'].manifestNumber).toBe('21-05-2026DAN');
    expect(firestoreState.packageDocs['TRK-ENC-1'].originalManifest).toBeUndefined();
    expect(firestoreState.packageDocs['TRK-ENC-2'].manifestNumber).toBe('22-05-2026DAN');

    // Assert that Mega-Man manifest doc was deleted
    expect(firestoreState.manifestDocs['ENC-MEGA-MAN-22-05-2026']).toBeUndefined();

    // Assert Audit logs recorded rollback progression
    const stages = firestoreState.auditLogCalls.map(e => e.metadata?.stage);
    expect(stages).toContain('fusion_started');
    expect(stages).toContain('rollback_started');
    expect(stages).toContain('rollback_success');
  });

  it('loadMegaManFromFirestore: filters out non-encomiendas packages for ENC mega manifests', async () => {
    // 1. Seed ENC-MEGA-MAN manifest doc
    firestoreState.manifestDocs['ENC-MEGA-MAN-22-05-2026'] = {
      manifestNumber: 'ENC-MEGA-MAN-22-05-2026',
      manifestType: 'usa_air',
      isMegaMan: true,
      fusedFrom: ['21-05-2026DAN'],
      packages: [
        { tracking: 'TRK-ENC-1', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 }
      ]
    };

    // 2. Seed packages collection
    // Encomienda package associated with Mega Manifest
    firestoreState.packageDocs['TRK-ENC-1'] = {
      tracking: 'TRK-ENC-1',
      manifestNumber: 'ENC-MEGA-MAN-22-05-2026',
      slCode: 'SL-NAN-1',
      ruta: 'Encomiendas',
      weight: 4,
      price: 40
    };
    // Regular package associated with source manifest (fusedFrom)
    firestoreState.packageDocs['TRK-REG-1'] = {
      tracking: 'TRK-REG-1',
      manifestNumber: '21-05-2026DAN',
      slCode: 'SL-NAN-2',
      ruta: 'San Jose',
      weight: 6,
      price: 60
    };

    // 3. Load the mega manifest
    const loaded = await loadMegaManFromFirestore('ENC-MEGA-MAN-22-05-2026');

    // 4. Assertions
    expect(loaded).toBeDefined();
    expect(loaded?.rows).toBeDefined();
    
    const trackings = loaded?.rows.map(r => r.tracking);
    // Should contain encomienda package
    expect(trackings).toContain('TRK-ENC-1');
    // Should NOT contain regular package
    expect(trackings).not.toContain('TRK-REG-1');
  });

  it('fuseFirestoreManifests: prevents unrelated customer invoices from being migrated', async () => {
    // 1. Seed mock source manifests
    firestoreState.manifestDocs['21-05-2026DAN'] = {
      manifestNumber: '21-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 2,
      totalWeight: 10,
      totalPrice: 100,
      packages: [
        { tracking: 'TRK-ENC-1', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 },
        { tracking: 'TRK-REG-1', slCode: 'SL-NAN-1', ruta: 'San Jose', weight: 6, price: 60 }
      ]
    };
    firestoreState.manifestDocs['22-05-2026DAN'] = {
      manifestNumber: '22-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 0,
      packages: []
    };

    // Packages collection
    firestoreState.packageDocs['TRK-ENC-1'] = { tracking: 'TRK-ENC-1', manifestNumber: '21-05-2026DAN', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 };
    firestoreState.packageDocs['TRK-REG-1'] = { tracking: 'TRK-REG-1', manifestNumber: '21-05-2026DAN', slCode: 'SL-NAN-1', ruta: 'San Jose', weight: 6, price: 60 };

    // Invoices collection
    // Invoice 1 covers only Encomienda tracking
    firestoreState.invoiceDocs['INV-ENC'] = { invoiceNumber: 'INV-ENC', manifestNumber: '21-05-2026DAN', clientSlCode: 'SL-NAN-1', trackingNumbers: ['TRK-ENC-1'] };
    // Invoice 2 covers only Regular tracking (even though it is the same customer SL-NAN-1)
    firestoreState.invoiceDocs['INV-REG'] = { invoiceNumber: 'INV-REG', manifestNumber: '21-05-2026DAN', clientSlCode: 'SL-NAN-1', trackingNumbers: ['TRK-REG-1'] };

    // 2. Perform fusion
    const megaManId = await fuseFirestoreManifests(['21-05-2026DAN', '22-05-2026DAN'], undefined, 'ENC');

    // 3. Assertions
    // Encomienda invoice should be migrated
    expect(firestoreState.invoiceDocs['INV-ENC'].manifestNumber).toBe(megaManId);
    // Regular invoice should REMAIN in the original source manifest
    expect(firestoreState.invoiceDocs['INV-REG'].manifestNumber).toBe('21-05-2026DAN');
  });

  it('fuseFirestoreManifests: supports custom target ID and merges under it', async () => {
    // Setup initial source manifest state
    firestoreState.manifestDocs['21-05-2026DAN'] = {
      manifestNumber: '21-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 1,
      totalWeight: 4,
      totalPrice: 40,
      packages: [
        { tracking: 'TRK-ENC-1', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 }
      ]
    };
    firestoreState.manifestDocs['22-05-2026DAN'] = {
      manifestNumber: '22-05-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 1,
      totalWeight: 5,
      totalPrice: 50,
      packages: [
        { tracking: 'TRK-ENC-2', slCode: 'SL-NAN-3', ruta: 'Encomiendas', weight: 5, price: 50 }
      ]
    };

    firestoreState.packageDocs['TRK-ENC-1'] = { tracking: 'TRK-ENC-1', manifestNumber: '21-05-2026DAN', slCode: 'SL-NAN-1', ruta: 'Encomiendas', weight: 4, price: 40 };
    firestoreState.packageDocs['TRK-ENC-2'] = { tracking: 'TRK-ENC-2', manifestNumber: '22-05-2026DAN', slCode: 'SL-NAN-3', ruta: 'Encomiendas', weight: 5, price: 50 };

    firestoreState.invoiceDocs['INV-1'] = { invoiceNumber: 'INV-1', manifestNumber: '21-05-2026DAN', clientSlCode: 'SL-NAN-1' };
    firestoreState.invoiceDocs['INV-2'] = { invoiceNumber: 'INV-2', manifestNumber: '22-05-2026DAN', clientSlCode: 'SL-NAN-3' };

    const customTargetId = 'MI-CUSTOM-FUSION-22-05-2026';
    const megaManId = await fuseFirestoreManifests(['21-05-2026DAN', '22-05-2026DAN'], undefined, 'ENC', customTargetId);

    expect(megaManId).toBe(customTargetId);

    const megaDoc = firestoreState.manifestDocs[customTargetId];
    expect(megaDoc).toBeDefined();
    expect(megaDoc.totalPackages).toBe(2);
    expect(megaDoc.totalWeight).toBe(9);
    expect(megaDoc.totalPrice).toBe(90);

    expect(firestoreState.packageDocs['TRK-ENC-1'].manifestNumber).toBe(customTargetId);
    expect(firestoreState.invoiceDocs['INV-1'].manifestNumber).toBe(customTargetId);
  });

  it('loadMegaManFromFirestore: handles source manifests with trailing spaces in fusedFrom and applies trimming', async () => {
    // Setup manifest document with trailing spaces in fusedFrom
    firestoreState.manifestDocs['MEGA-MAN-TEST-SPACES'] = {
      manifestNumber: 'MEGA-MAN-TEST-SPACES',
      manifestType: 'usa_air',
      totalPackages: 2,
      processedAt: '2026-06-30T12:00:00Z',
      fusedFrom: ['26-06-2026DAN      '], // trailing spaces!
      packages: [
        { tracking: 'TRK-SPACES-1', slCode: 'SL100', ruta: 'Heredia', weight: 1, price: 12 },
        { tracking: 'TRK-SPACES-2', slCode: 'SL200', ruta: 'San Jose', weight: 2, price: 24 }
      ]
    };

    // The package in the packages collection has manifestNumber WITHOUT spaces
    firestoreState.packageDocs['TRK-SPACES-1'] = {
      tracking: 'TRK-SPACES-1',
      manifestNumber: '26-06-2026DAN', // clean manifestNumber!
      slCode: 'SL100',
      ruta: 'Heredia',
      weight: 1,
      price: 12
    };

    // Perform load
    const result = await loadMegaManFromFirestore('MEGA-MAN-TEST-SPACES');

    // Assertions
    expect(result).toBeDefined();
    // TRK-SPACES-1 should be loaded from packages collection because ID was trimmed!
    const p1 = result.rows.find(r => r.tracking === 'TRK-SPACES-1');
    expect(p1).toBeDefined();
    expect(p1.slCode).toBe('SL100');

    // TRK-SPACES-2 should be loaded from the embedded array as fallback because it doesn't exist in packages collection
    const p2 = result.rows.find(r => r.tracking === 'TRK-SPACES-2');
    expect(p2).toBeDefined();
    expect(p2.slCode).toBe('SL200');
  });

  it('fuseFirestoreManifests: resolves trailing-space manifests and migrates their packages/invoices successfully', async () => {
    const paddedId = '26-06-2026DAN                      ';
    const trimmedId = '26-06-2026DAN';
    const docData = {
      manifestNumber: paddedId,
      manifestType: 'usa_air',
      totalPackages: 1,
      packages: [
        { tracking: 'TRK-ALIAS-1', slCode: 'SL100', ruta: 'Encomiendas', weight: 4, price: 40 }
      ]
    };
    firestoreState.manifestDocs[paddedId] = docData;
    firestoreState.manifestDocs[trimmedId] = docData;
    // Seed a second mock manifest to satisfy minimum manifest length constraint of 2
    firestoreState.manifestDocs['27-06-2026DAN'] = {
      manifestNumber: '27-06-2026DAN',
      manifestType: 'usa_air',
      totalPackages: 0,
      packages: []
    };

    // 2. Seed packages collection with padded manifestNumber
    firestoreState.packageDocs['TRK-ALIAS-1'] = {
      tracking: 'TRK-ALIAS-1',
      manifestNumber: paddedId,
      slCode: 'SL100',
      ruta: 'Encomiendas',
      weight: 4,
      price: 40
    };

    // 3. Seed invoices collection with padded manifestNumber
    firestoreState.invoiceDocs['INV-ALIAS-1'] = {
      invoiceNumber: 'INV-ALIAS-1',
      manifestNumber: paddedId,
      clientSlCode: 'SL100',
      clientRoute: 'Encomiendas',
      trackingNumbers: ['TRK-ALIAS-1']
    };

    // 4. Perform fusion using the TRIMMED ID
    const megaManId = await fuseFirestoreManifests(['26-06-2026DAN', '27-06-2026DAN'], undefined, 'ENC');

    // 5. Assertions
    expect(megaManId).toBeDefined();
    expect(megaManId.startsWith('ENC-MEGA-MAN-')).toBe(true);

    // Package manifestNumber should have been updated to the Mega-Man ID
    expect(firestoreState.packageDocs['TRK-ALIAS-1'].manifestNumber).toBe(megaManId);

    // Invoice manifestNumber should have been updated to the Mega-Man ID
    expect(firestoreState.invoiceDocs['INV-ALIAS-1'].manifestNumber).toBe(megaManId);

    // Source padded manifest document should have been updated with mergedInto link
    expect(firestoreState.manifestDocs[paddedId].mergedInto).toBe(megaManId);
  });
});
