/**
 * Round-trip fidelity tests for `saveManifestRecord` ↔ `loadMegaManFromFirestore`.
 *
 * ─── BUG GUARDED AGAINST ──────────────────────────────────────────────────
 *
 * Until BUG-CURATED-DESTROYED 2026-04-29, the embedded `packages[]` array in
 * `manifests/{mn}` only persisted bare-minimum identity + billing fields:
 * `tracking, slCode, customerName, ruta, weight, price, isConsolidated,
 * requiresPermit, description`. Anything else — `matchSource`, `matchScore`,
 * `precioSinPermiso`, `precioConPermiso`, `pesoRedondeo`,
 * `diferenciaRedondeo`, `pesoConsolidacion` — was silently discarded on save
 * and reconstructed on load with destructive defaults:
 *
 *   - `precioSinPermiso = precioConPermiso = price` → table prices visibly
 *     "collapsed" on every reload, prompting operators to re-validate.
 *   - `matchScore = slCode ? 1 : 0` → AI confidence (0..1) was bucketed
 *     into binary, so the "low_score" review filter became unreliable.
 *   - `matchSource` was lost → pre-alert vs name-matched provenance was
 *     erased, breaking the "Pre-alertados" filter on Firestore-loaded data.
 *
 * The fix persists every field needed to rebuild a `ManifestRow` exactly
 * the way Nova originally produced it. These tests freeze that contract.
 *
 * ─── TESTING APPROACH ─────────────────────────────────────────────────────
 *
 * Both `saveManifestRecord` and `loadMegaManFromFirestore` are I/O-heavy
 * (firebase/firestore is mocked) but the actual round-trip logic lives in
 * pure projection code on each side. We:
 *
 *   1. Stub `setDoc` to capture the embedded `packages[]` array written.
 *   2. Stub `getDoc` / `getDocs` / `query` so the loader sees that exact
 *      array on the read path.
 *   3. Assert the reconstructed `ManifestRow` deep-equals the source row
 *      for every round-trip-fidelity field listed above.
 *
 * If a future change drops a field from the save path or rehydrates with a
 * destructive default, this suite fails before the regression ships.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────
//
// Capture-style mocks: each call records what would have hit Firestore.
// The loader reads from the same mock store, simulating a real round-trip.

const firestoreState = {
  setDocCalls:  [] as Array<{ ref: unknown; data: any; merge?: boolean }>,
  manifestDoc:  null as null | { exists: () => boolean; data: () => any },
  packagesQuerySnap: { docs: [] as Array<{ id: string; data: () => any }> },
  invoicesQuerySnap: { docs: [] as Array<{ id: string; data: () => any }> },
  consolidationSnap: { docs: [] as Array<{ id: string; data: () => any }> },
  /** Captures every batch.set() call so ingestManifestToPackages tests can
   *  inspect the per-tracking documents written to the packages collection. */
  batchSetCalls: [] as Array<{ ref: unknown; data: any; merge?: boolean }>,
  packageDocExists: false,
};

vi.mock('@/lib/firebase/config', () => ({ db: {}, app: {}, storage: {}, auth: {}, sp2App: {} }));

vi.mock('firebase/functions', () => ({
  getFunctions:  vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { success: true } })),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref:        vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn((_db: unknown, name: string) => ({ __col: name })),
  doc:             vi.fn((ref: any, id?: string) => ({ __doc: id ?? 'auto', col: ref?.__col })),
  query:           vi.fn((ref: any, ..._args: unknown[]) => ({ __query: true, col: ref?.col || ref?.__col })),
  where:           vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  orderBy:         vi.fn(),
  limit:           vi.fn(),
  getDoc:          vi.fn(async (ref: { __doc: string; col: string }) => {
    if (ref.col === 'manifests') {
      return firestoreState.manifestDoc ?? { exists: () => false, data: () => null };
    }
    if (ref.col === 'packages') {
      return firestoreState.packageDocExists
        ? { exists: () => true, data: () => ({ manifestNumber: 'MEGA-MAN-TEST' }) }
        : { exists: () => false, data: () => null };
    }
    return { exists: () => false, data: () => null };
  }),
  getDocs:         vi.fn(async (q: any) => {
    const colName = q?.col;
    if (colName === 'packages') {
      return firestoreState.packagesQuerySnap;
    }
    if (colName === 'invoices') {
      return firestoreState.invoicesQuerySnap ?? { docs: [] };
    }
    return firestoreState.consolidationSnap;
  }),
  setDoc:          vi.fn(async (ref: unknown, data: any, opts?: { merge?: boolean }) => {
    firestoreState.setDocCalls.push({ ref, data, merge: opts?.merge });
  }),
  updateDoc:       vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => '__server_ts__'),
  deleteField:     vi.fn(() => '__delete_field__'),
  /** writeBatch returns an object that records every set() call into
   *  `firestoreState.batchSetCalls` and exposes a no-op commit(). */
  writeBatch:      vi.fn(() => ({
    set:    (ref: unknown, data: any, opts?: { merge?: boolean }) => {
      firestoreState.batchSetCalls.push({ ref, data, merge: opts?.merge });
    },
    update: () => {},
    delete: () => {},
    commit: async () => {},
  })),
  runTransaction:  vi.fn(async (_db: unknown, _fn: any) => undefined),
}));

// Import AFTER mocks so the SUT picks them up.
import {
  saveManifestRecord,
  loadMegaManFromFirestore,
  ingestManifestToPackages,
  upsertManifestPackageOverrides,
  type ManifestRow,
} from '../../manifest-processor';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    tracking:           'TRK-1',
    nombre:             'PAULA UMANA',
    guia:               'GUIA-1',
    manifiesto:         'MEGA-MAN-TEST',
    peso:               2.45,
    precio:             18.47,
    slCode:             'SL245',
    nombreCliente:      'ANA PAULA FONSECA QUADROS', // ← intentionally divergent
    ruta:               'METROPOLITANA',
    consolidacion:      false,
    descripcion:        'CARGA AEREA',
    permisos:           false,
    pesoRedondeo:       3,
    diferenciaRedondeo: 0.55,
    pesoConsolidacion:  0,
    precioSinPermiso:   18.47,
    precioConPermiso:   21.47,
    matchScore:         0.92,        // ← AI confidence; must survive
    matchSource:        'name',      // ← provenance; must survive
    originalData:       { _excelRow: 17 },
    ...overrides,
  };
}

beforeEach(() => {
  firestoreState.setDocCalls = [];
  firestoreState.batchSetCalls = [];
  firestoreState.manifestDoc = null;
  firestoreState.packagesQuerySnap = { docs: [] };
  firestoreState.consolidationSnap = { docs: [] };
  firestoreState.packageDocExists = false;
});

// ── Save: embedded array contains every round-trip field ──────────────────

describe('saveManifestRecord — embedded packages[] persistence', () => {
  it('persists matchScore, matchSource, precioSin/ConPermiso and the rounded-weight breakdown', async () => {
    await saveManifestRecord([makeRow()], 'MEGA-MAN-TEST', { manifestType: 'usa_air' });

    expect(firestoreState.setDocCalls).toHaveLength(1);
    const written = firestoreState.setDocCalls[0].data;
    expect(written.packages).toHaveLength(1);

    const pkg = written.packages[0];
    expect(pkg.matchScore).toBe(0.92);
    expect(pkg.matchSource).toBe('name');
    expect(pkg.precioSinPermiso).toBe(18.47);
    expect(pkg.precioConPermiso).toBe(21.47);
    expect(pkg.pesoRedondeo).toBe(3);
    expect(pkg.diferenciaRedondeo).toBe(0.55);
    expect(pkg.pesoConsolidacion).toBe(0);
  });

  it('serializes undefined matchSource as "" (Firestore-safe, hydrator-compatible)', async () => {
    const row = makeRow({ matchSource: undefined });
    await saveManifestRecord([row], 'MEGA-MAN-TEST');

    const pkg = firestoreState.setDocCalls[0].data.packages[0];
    expect(pkg.matchSource).toBe('');
  });

  it('falls back to deterministic defaults for legacy rows missing round-trip fields', async () => {
    const legacyRow = makeRow({
      matchScore:        undefined as unknown as number,
      precioSinPermiso:  undefined as unknown as number,
      precioConPermiso:  undefined as unknown as number,
      pesoRedondeo:      undefined as unknown as number,
      diferenciaRedondeo:undefined as unknown as number,
      pesoConsolidacion: undefined as unknown as number,
    });
    await saveManifestRecord([legacyRow], 'MEGA-MAN-TEST');

    const pkg = firestoreState.setDocCalls[0].data.packages[0];
    // matchScore reconstructed from slCode presence (1 because 'SL245' is set)
    expect(pkg.matchScore).toBe(1);
    // precio fallback uses the row.precio value
    expect(pkg.precioSinPermiso).toBe(18.47);
    expect(pkg.precioConPermiso).toBe(18.47);
    // peso rounding recomputed on the fly
    expect(pkg.pesoRedondeo).toBe(3);
    expect(pkg.diferenciaRedondeo).toBeCloseTo(0.55, 2);
    expect(pkg.pesoConsolidacion).toBe(0);
  });
});

// ── Load: hydrator reads back without destructive defaults ────────────────

describe('loadMegaManFromFirestore — hydration fidelity', () => {
  it('reads back the EXACT round-trip fields written by saveManifestRecord', async () => {
    const original = makeRow();

    // 1. Save — capture the embedded packages array.
    await saveManifestRecord([original], 'MEGA-MAN-TEST', { manifestType: 'usa_air' });
    const savedDoc = { ...firestoreState.setDocCalls[0].data };
    delete savedDoc.processedAt;

    // 2. Wire the saved doc as the manifest snapshot for the loader.
    firestoreState.manifestDoc = {
      exists: () => true,
      data:   () => savedDoc,
    };
    // No direct packages-collection docs nor consolidation — loader will
    // fall back to the embedded array (covered branch).
    firestoreState.packagesQuerySnap  = { docs: [] };
    firestoreState.consolidationSnap  = { docs: [] };

    // 3. Load.
    const loaded = await loadMegaManFromFirestore('MEGA-MAN-TEST');
    expect(loaded).not.toBeNull();
    expect(loaded?.rows).toHaveLength(1);
    const reconstructed = loaded!.rows[0];

    // 4. Round-trip identity for every fidelity field.
    expect(reconstructed.matchScore).toBe(original.matchScore);
    expect(reconstructed.matchSource).toBe(original.matchSource);
    expect(reconstructed.precioSinPermiso).toBe(original.precioSinPermiso);
    expect(reconstructed.precioConPermiso).toBe(original.precioConPermiso);
    expect(reconstructed.pesoRedondeo).toBe(original.pesoRedondeo);
    expect(reconstructed.diferenciaRedondeo).toBeCloseTo(original.diferenciaRedondeo, 5);
    expect(reconstructed.pesoConsolidacion).toBe(original.pesoConsolidacion);

    // Identity fields too (the historical regression source).
    expect(reconstructed.slCode).toBe(original.slCode);
    expect(reconstructed.nombreCliente).toBe(original.nombreCliente);
    expect(reconstructed.ruta).toBe(original.ruta);
    expect(reconstructed.consolidacion).toBe(original.consolidacion);
    expect(reconstructed.permisos).toBe(original.permisos);
    expect(reconstructed.precio).toBeCloseTo(original.precio, 2);
    expect(loaded?.loadedFromFirestore).toBe(true);
  });

  it('does NOT collapse precioSinPermiso/precioConPermiso to `precio` on reload', async () => {
    // Reproducer for the visible bug: a manifest saved with sin=$18.47 and
    // con=$21.47 used to surface as sin=con=$21.47 the moment it reloaded,
    // because the hydrator defaulted both to `precio` (the with-permit
    // value). Operators perceived this as "the table is recomputing" and
    // rerunning matching, regressing curated assignments.
    const original = makeRow({
      precio:           21.47,
      precioSinPermiso: 18.47,
      precioConPermiso: 21.47,
      permisos:         true,
    });
    await saveManifestRecord([original], 'MEGA-MAN-TEST');
    const savedDoc = { ...firestoreState.setDocCalls[0].data };
    delete savedDoc.processedAt;
    firestoreState.manifestDoc = {
      exists: () => true,
      data:   () => savedDoc,
    };

    const loaded = await loadMegaManFromFirestore('MEGA-MAN-TEST');
    const r = loaded!.rows[0];
    expect(r.precioSinPermiso).toBe(18.47);
    expect(r.precioConPermiso).toBe(21.47);
    expect(r.precioSinPermiso).not.toBe(r.precioConPermiso);
  });

  it('does NOT downgrade matchScore from a fractional confidence to a binary 0/1', async () => {
    // Reproducer for the silent precision loss: matchScore=0.74 ("low
    // score" — needs review) used to be persisted, then on reload was
    // reconstructed as `slCode ? 1 : 0`, hiding the row from the
    // low-score review filter and creating false confidence in the data.
    const original = makeRow({ matchScore: 0.74 });
    await saveManifestRecord([original], 'MEGA-MAN-TEST');
    const savedDoc = { ...firestoreState.setDocCalls[0].data };
    delete savedDoc.processedAt;
    firestoreState.manifestDoc = {
      exists: () => true,
      data:   () => savedDoc,
    };

    const loaded = await loadMegaManFromFirestore('MEGA-MAN-TEST');
    expect(loaded!.rows[0].matchScore).toBe(0.74);
  });

  it('preserves empty string slCode (unlinked row) from embedded array even if active invoice exists', async () => {
    // Setup embedded array with an unlinked package (slCode: '')
    const savedDoc = {
      manifestNumber: 'MEGA-MAN-TEST',
      packages: [{
        tracking: 'TRK-UNLINKED',
        slCode: '',
        customerName: '',
        ruta: ''
      }]
    };
    firestoreState.manifestDoc = {
      exists: () => true,
      data: () => savedDoc,
    };

    // Mock active invoice mapping TRK-UNLINKED to SL26740 (LUIS ALVARADO)
    firestoreState.invoicesQuerySnap = {
      docs: [{
        id: 'INV-1',
        data: () => ({
          manifestNumber: 'MEGA-MAN-TEST',
          invoiceNumber: 'SL-INV-123',
          clientSlCode: 'SL26740',
          clientName: 'LUIS ALVARADO',
          clientRoute: 'San Jose',
          trackingNumbers: ['TRK-UNLINKED'],
          status: 'pending'
        })
      }]
    };

    // Mock packages collection having a different record
    firestoreState.packagesQuerySnap = {
      docs: [{
        id: 'TRK-UNLINKED',
        data: () => ({
          manifestNumber: 'MEGA-MAN-TEST',
          tracking: 'TRK-UNLINKED',
          slCode: 'SL999',
          customerName: 'SOME OTHER CLIENT'
        })
      }]
    };

    const loaded = await loadMegaManFromFirestore('MEGA-MAN-TEST');
    expect(loaded).not.toBeNull();
    expect(loaded?.rows).toHaveLength(1);
    
    // Verification: Embedded curation (slCode: '') must win over invoice and packages collection!
    const row = loaded!.rows[0];
    expect(row.slCode).toBe('');
    expect(row.nombreCliente).toBe('');
  });

  it('prioritizes embedded curation slCode over packages collection and active invoice', async () => {
    // Setup embedded array with curated package (slCode: 'SL222')
    const savedDoc = {
      manifestNumber: 'MEGA-MAN-TEST',
      packages: [{
        tracking: 'TRK-CURATED',
        slCode: 'SL222',
        customerName: 'CURATED CLIENT',
        ruta: 'Cartago'
      }]
    };
    firestoreState.manifestDoc = {
      exists: () => true,
      data: () => savedDoc,
    };

    // Mock active invoice mapping TRK-CURATED to SL26740 (LUIS ALVARADO)
    firestoreState.invoicesQuerySnap = {
      docs: [{
        id: 'INV-1',
        data: () => ({
          manifestNumber: 'MEGA-MAN-TEST',
          invoiceNumber: 'SL-INV-123',
          clientSlCode: 'SL26740',
          clientName: 'LUIS ALVARADO',
          clientRoute: 'San Jose',
          trackingNumbers: ['TRK-CURATED'],
          status: 'pending'
        })
      }]
    };

    // Mock packages collection having a different record
    firestoreState.packagesQuerySnap = {
      docs: [{
        id: 'TRK-CURATED',
        data: () => ({
          manifestNumber: 'MEGA-MAN-TEST',
          tracking: 'TRK-CURATED',
          slCode: 'SL999',
          customerName: 'SOME OTHER CLIENT'
        })
      }]
    };

    const loaded = await loadMegaManFromFirestore('MEGA-MAN-TEST');
    expect(loaded).not.toBeNull();
    expect(loaded?.rows).toHaveLength(1);
    
    // Verification: Embedded curation (SL222) must win!
    const row = loaded!.rows[0];
    expect(row.slCode).toBe('SL222');
    expect(row.nombreCliente).toBe('CURATED CLIENT');
  });

  it('propagates package status from Firestore packages collection to the ManifestRow root', async () => {
    // Setup manifest doc with package
    firestoreState.manifestDoc = {
      exists: () => true,
      data: () => ({
        manifestNumber: 'MEGA-MAN-TEST',
        packages: [{
          tracking: 'TRK-STATUS-PROPAGATION',
          slCode: 'SL999',
          customerName: 'SOME CLIENT'
        }]
      }),
    };

    // Setup packages collection doc with status 'delivered'
    firestoreState.packagesQuerySnap = {
      docs: [{
        id: 'TRK-STATUS-PROPAGATION',
        data: () => ({
          manifestNumber: 'MEGA-MAN-TEST',
          tracking: 'TRK-STATUS-PROPAGATION',
          slCode: 'SL999',
          customerName: 'SOME CLIENT',
          status: 'delivered'
        })
      }]
    };

    const loaded = await loadMegaManFromFirestore('MEGA-MAN-TEST');
    expect(loaded).not.toBeNull();
    expect(loaded?.rows).toHaveLength(1);
    
    const row = loaded!.rows[0];
    expect(row.status).toBe('delivered');
  });
});

// ── ingestManifestToPackages — round-trip into the packages collection ───
//
// Cross-manifest moves (operator uses "Cambiar manifiesto" → row N goes to
// MEGA-MAN-Y) write the row's package doc into `packages/{tracking}` with
// `manifestNumber = MEGA-MAN-Y`. When the operator opens MEGA-MAN-Y next
// time, `loadMegaManFromFirestore` reads via the packages collection
// because Y's embedded array doesn't have the row yet. So the packages
// collection MUST carry the same round-trip fidelity as the embedded
// array — otherwise matchScore / matchSource / per-permit prices /
// consolidation rounding are lost across the move.

describe('ingestManifestToPackages — packages collection persistence', () => {
  it('persists matchScore, matchSource, precioSin/ConPermiso and consolidation rounding fields', async () => {
    await ingestManifestToPackages([makeRow()], 'MEGA-MAN-TEST', {
      manifestType:    'usa_air',
      exchangeRate:    540,
    });

    expect(firestoreState.batchSetCalls.length).toBe(1);
    const data = firestoreState.batchSetCalls[0].data;
    expect(data.matchScore).toBe(0.92);
    expect(data.matchSource).toBe('name');
    expect(data.precioSinPermiso).toBe(18.47);
    expect(data.precioConPermiso).toBe(21.47);
    expect(data.diferenciaRedondeo).toBe(0.55);
    expect(data.pesoConsolidacion).toBe(0);
  });

  it('routes the package to the override manifest when rowManifestOverrides is set, preserving fidelity', async () => {
    await ingestManifestToPackages([makeRow()], 'MEGA-MAN-SOURCE', {
      manifestType:        'usa_air',
      rowManifestOverrides: { 'TRK-1': 'MEGA-MAN-TARGET' },
    });

    const data = firestoreState.batchSetCalls[0].data;
    expect(data.manifestNumber).toBe('MEGA-MAN-TARGET');
    expect(data.manifestId).toBe('MEGA-MAN-TARGET');
    // Fidelity fields still present so the target manifest's load via the
    // packages collection (NO embedded backstop) reconstructs correctly.
    expect(data.matchScore).toBe(0.92);
    expect(data.matchSource).toBe('name');
    expect(data.precioSinPermiso).toBe(18.47);
    expect(data.precioConPermiso).toBe(21.47);
  });

  it('serializes undefined matchSource as "" for Firestore strict typing', async () => {
    const row = makeRow({ matchSource: undefined });
    await ingestManifestToPackages([row], 'MEGA-MAN-TEST');

    const data = firestoreState.batchSetCalls[0].data;
    expect(data.matchSource).toBe('');
  });

  it('falls back to deterministic defaults for legacy rows missing fidelity fields', async () => {
    const legacyRow = makeRow({
      matchScore:         undefined as unknown as number,
      precioSinPermiso:   undefined as unknown as number,
      precioConPermiso:   undefined as unknown as number,
      diferenciaRedondeo: undefined as unknown as number,
      pesoConsolidacion:  undefined as unknown as number,
    });
    await ingestManifestToPackages([legacyRow], 'MEGA-MAN-TEST');

    const data = firestoreState.batchSetCalls[0].data;
    // matchScore reconstructed from slCode presence (1 because 'SL245' is set)
    expect(data.matchScore).toBe(1);
    // precio fallback uses the row.precio value
    expect(data.precioSinPermiso).toBe(18.47);
    expect(data.precioConPermiso).toBe(18.47);
  });

  // BUG-DATA-INTEGRITY-UNMATCHED-SLCODE-TEST 2026-08-07: Verify that ingestManifestToPackages,
  // saveManifestRecord and upsertManifestPackageOverrides do not save route-based placeholder codes
  // (not starting with 'SL') as slCode/userId/customerId in Firestore, but instead clear them.
  it('clears slCode, userId, customerId when row slCode is a route placeholder in ingestion', async () => {
    const row = makeRow({
      slCode: 'Alajuela',
      ruta: 'Alajuela',
      nombreCliente: 'KEYLA MCDONALD',
    });
    await ingestManifestToPackages([row], 'MEGA-MAN-TEST');

    expect(firestoreState.batchSetCalls.length).toBe(1);
    const data = firestoreState.batchSetCalls[0].data;
    expect(data.slCode).toBe('');
    expect(data.userId).toBe('');
    expect(data.customerId).toBe('');
    // Route is still correctly preserved in ruta field
    expect(data.ruta).toBe('Alajuela');
  });

  it('clears slCode in saveManifestRecord when row slCode is a route placeholder', async () => {
    const row = makeRow({
      slCode: 'Alajuela',
      ruta: 'Alajuela',
      nombreCliente: 'KEYLA MCDONALD',
    });
    await saveManifestRecord([row], 'MEGA-MAN-TEST');

    expect(firestoreState.setDocCalls.length).toBe(1);
    const data = firestoreState.setDocCalls[0].data;
    expect(data.packages[0].slCode).toBe('');
    expect(data.packages[0].ruta).toBe('Alajuela');
  });

  it('clears slCode, userId, customerId in upsertManifestPackageOverrides when row slCode is a route placeholder', async () => {
    firestoreState.packageDocExists = true;
    const row = makeRow({
      slCode: 'Alajuela',
      ruta: 'Alajuela',
      nombreCliente: 'KEYLA MCDONALD',
    });
    await upsertManifestPackageOverrides([row], 'MEGA-MAN-TEST');

    expect(firestoreState.batchSetCalls.length).toBe(1);
    const data = firestoreState.batchSetCalls[0].data;
    expect(data.slCode).toBe('');
    expect(data.userId).toBe('');
    expect(data.customerId).toBe('');
    expect(data.ruta).toBe('Alajuela');
  });
});

describe('saveManifestRecord & loadMegaManFromFirestore — preAlert round-trip fidelity', () => {
  it('persists and hydrates rich preAlert metadata, hasPreAlert, and preAlertSlCode', async () => {
    const preAlertData = {
      found: true,
      tracking: '1Z1R054E0343790488',
      slCode: 'SL261320',
      clientName: 'GABRIELA ALFARO',
      description: 'COSMETICOS Y ROPA',
      declaredValue: 85.5,
      courier: 'UPS',
      hasInvoice: true,
      preAlertCreatedAt: '2026-08-18T12:00:00Z',
      sp2PreAlertId: '1Z1R054E0343790488_SL261320',
    };

    const row = makeRow({
      tracking: '1Z1R054E0343790488',
      slCode: 'SL261320',
      nombreCliente: 'GABRIELA ALFARO',
      hasPreAlert: true,
      preAlertSlCode: 'SL261320',
      preAlertCreatedAt: '2026-08-18T12:00:00Z',
      preAlertKey: '1Z1R054E0343790488_SL261320',
      preAlertId: '1Z1R054E0343790488_SL261320',
      preAlert: preAlertData,
    });

    // 1. Save
    await saveManifestRecord([row], 'MEGA-MAN-PREALERT-TEST');
    expect(firestoreState.setDocCalls.length).toBe(1);
    const savedDoc = firestoreState.setDocCalls[0].data;
    expect(savedDoc.packages[0].preAlert).toEqual(preAlertData);
    expect(savedDoc.packages[0].hasPreAlert).toBe(true);
    expect(savedDoc.packages[0].preAlertSlCode).toBe('SL261320');

    // 2. Load
    firestoreState.manifestDoc = {
      exists: () => true,
      data: () => savedDoc,
    };
    firestoreState.packagesQuerySnap = { docs: [] };
    firestoreState.consolidationSnap = { docs: [] };

    const loaded = await loadMegaManFromFirestore('MEGA-MAN-PREALERT-TEST');
    expect(loaded).not.toBeNull();
    const hydratedRow = loaded!.rows[0];
    expect(hydratedRow.preAlert).toEqual(preAlertData);
    expect(hydratedRow.hasPreAlert).toBe(true);
    expect(hydratedRow.preAlertSlCode).toBe('SL261320');
    expect(hydratedRow.preAlertKey).toBe('1Z1R054E0343790488_SL261320');
  });
});
