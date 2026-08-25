// @vitest-environment node
/**
 * applyIntegrityRepairs — repair-service spec.
 *
 * ─── Contract under test ───────────────────────────────────────────────────
 *
 * The repair flow updates THREE Firestore collections so the next
 * integrity audit doesn't keep firing on the same rows after every
 * apply. This spec locks down the per-collection write semantics:
 *
 *   1. `manifests/{mn}.packages` — full array re-write, ONCE per call
 *      (chunk 0 only).
 *   2. `packages/{trackingId}` — one update per repair, but ONLY when
 *      the doc already exists; missing trackings collected in
 *      `result.missingPackageDocs` (no upsert / phantom-doc creation).
 *   3. `manifest_encomiendas/{trackingId}` — one update per repair,
 *      ONLY when the doc already exists. Encomiendas docs are created
 *      by routing ingest, not by repairs — repairing into a brand-new
 *      encomienda doc would lose the routing fields the audit doesn't
 *      know about. (BUG-INTEGRITY-AUDIT-LOOP 2026-05-02)
 *
 * Why this matters: a manifest with stale `manifest_encomiendas/{id}.slCode`
 * would re-fire `slcode_mismatch` on every audit cycle even after the
 * operator successfully applied repairs to manifest+packages. The fix
 * is to bring encomiendas into the repair scope — this spec guards that
 * extension and prevents future refactors from silently dropping it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Firestore mock ────────────────────────────────────────────────────────
//
// Each `getDoc(ref)` consults `firestoreState.docs[ref.col][ref.id]`.
// A missing entry → exists: false. Each `batch.update(ref, data)` is
// captured into `firestoreState.batchUpdates` for assertion.
const firestoreState: {
  docs: Record<string, Record<string, Record<string, unknown> | undefined>>;
  batchUpdates: Array<{ col: string; id: string; data: Record<string, unknown> }>;
  batchCommitError: Error | null;
} = {
  docs: {},
  batchUpdates: [],
  batchCommitError: null,
};

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  doc:        vi.fn((ref: any, id?: string) => ({ __col: ref?.__col, __id: id ?? 'auto' })),
  getDoc:     vi.fn(async (ref: { __col: string; __id: string }) => {
    const colDocs = firestoreState.docs[ref.__col] ?? {};
    const data = colDocs[ref.__id];
    return {
      exists: () => data !== undefined,
      data:   () => data,
    };
  }),
  getDocs:    vi.fn(async () => ({ docs: [], empty: true })),
  query:      vi.fn(() => ({})),
  where:      vi.fn(() => ({})),
  arrayUnion: vi.fn((val) => val),
  writeBatch: vi.fn(() => ({
    update: (ref: { __col: string; __id: string }, data: Record<string, unknown>) => {
      firestoreState.batchUpdates.push({ col: ref.__col, id: ref.__id, data });
    },
    set:    (ref: { __col: string; __id: string }, data: Record<string, unknown>) => {
      firestoreState.batchUpdates.push({ col: ref.__col, id: ref.__id, data: { ...data, _type: 'set' } });
    },
    delete: () => {},
    commit: async () => {
      if (firestoreState.batchCommitError) throw firestoreState.batchCommitError;
    },
  })),
}));

vi.mock('@/lib/services/temp-customers-service', () => ({
  deleteTempCustomer: vi.fn(async () => {}),
}));

// Import AFTER mocks so the SUT picks them up.
import { applyIntegrityRepairs, type IntegrityRepair } from '.././repair-service';
import { deleteTempCustomer } from '@/lib/services/temp-customers-service';

// ── Helpers ───────────────────────────────────────────────────────────────

const MANIFEST_ID = 'MEGA-MAN-X';
const REPAIR: IntegrityRepair = {
  rowIndex: 0,
  tracking: 'TRK-1',
  slCode: 'SL488',
  customerName: 'ARELIS V QUESADA',
  ruta: 'METROPOLITANA',
};

function seedManifest(packages: Array<Record<string, unknown>> = [{ tracking: 'TRK-1', slCode: 'SL_OLD' }]) {
  firestoreState.docs.manifests = {
    [MANIFEST_ID]: { packages },
  };
}

function seedPackage(tracking: string, doc: Record<string, unknown> = { slCode: 'SL_OLD' }) {
  firestoreState.docs.packages = firestoreState.docs.packages ?? {};
  firestoreState.docs.packages[tracking] = doc;
}

function seedEncomienda(tracking: string, doc: Record<string, unknown> = { slCode: 'SL_OLD', ruta: 'Encomiendas' }) {
  firestoreState.docs.manifest_encomiendas = firestoreState.docs.manifest_encomiendas ?? {};
  firestoreState.docs.manifest_encomiendas[tracking] = doc;
}

beforeEach(() => {
  firestoreState.docs = {};
  firestoreState.batchUpdates = [];
  firestoreState.batchCommitError = null;
});

afterEach(() => vi.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────

describe('applyIntegrityRepairs — manifest + packages (existing scope)', () => {
  it('updates manifests/{mn}.packages with the post-repair array', async () => {
    seedManifest([{ tracking: 'TRK-1', slCode: 'SL_OLD' }]);
    seedPackage('TRK-1');

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);

    expect(result.ok).toBe(true);
    expect(result.manifestRowsUpdated).toBe(1);
    const manifestUpdate = firestoreState.batchUpdates.find(u => u.col === 'manifests');
    expect(manifestUpdate).toBeTruthy();
    const newPkgs = (manifestUpdate!.data.packages as Array<{ slCode: string }>);
    expect(newPkgs[0].slCode).toBe('SL488');
  });

  it('updates packages/{trackingId} with new slCode + SP1 aliases', async () => {
    seedManifest();
    seedPackage('TRK-1');

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);

    expect(result.packagesDocsUpdated).toBe(1);
    const pkgUpdate = firestoreState.batchUpdates.find(u => u.col === 'packages');
    expect(pkgUpdate).toBeTruthy();
    expect(pkgUpdate!.data.slCode).toBe('SL488');
    expect(pkgUpdate!.data.userId).toBe('SL488');     // SP1 alias
    expect(pkgUpdate!.data.customerId).toBe('SL488'); // SP1 alias
    expect(pkgUpdate!.data.customerName).toBe('ARELIS V QUESADA');
    expect(pkgUpdate!.data.ruta).toBe('METROPOLITANA');
  });

  it('records missing package docs and skips their write', async () => {
    seedManifest();
    // No seed for TRK-1 in packages.

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);

    expect(result.ok).toBe(true);
    expect(result.packagesDocsUpdated).toBe(0);
    expect(result.missingPackageDocs).toEqual(['TRK-1']);
    // Manifest array still updated despite the missing pkg doc.
    expect(result.manifestRowsUpdated).toBe(1);
  });
});

describe('applyIntegrityRepairs — manifest_encomiendas mirror (BUG-INTEGRITY-AUDIT-LOOP)', () => {
  it('REGRESSION: updates manifest_encomiendas/{tracking} when the doc exists', async () => {
    seedManifest();
    seedPackage('TRK-1');
    seedEncomienda('TRK-1', { slCode: 'SL_OLD', customerName: 'OLD NAME', ruta: 'Encomiendas' });

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);

    expect(result.encomiendaDocsUpdated).toBe(1);
    const encUpdate = firestoreState.batchUpdates.find(u => u.col === 'manifest_encomiendas');
    expect(encUpdate).toBeTruthy();
    expect(encUpdate!.id).toBe('TRK-1');
    expect(encUpdate!.data.slCode).toBe('SL488');
    expect(encUpdate!.data.customerName).toBe('ARELIS V QUESADA');
    expect(encUpdate!.data.ruta).toBe('METROPOLITANA');
    expect(encUpdate!.data.updatedAt).toBeTruthy();
  });

  it('REGRESSION: does NOT create a new manifest_encomiendas doc when one is missing', async () => {
    // The encomiendas collection is keyed by ruta='Encomiendas' rows
    // only — repairs must never inadvertently spawn a new encomienda
    // entry for a non-encomienda tracking.
    seedManifest();
    seedPackage('TRK-1');
    // No encomienda seed.

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);

    expect((result as any).encomiendaendaDocsUpdated).toBeUndefined(); // we check encomiendaDocsUpdated count
    expect(result.encomiendaDocsUpdated).toBe(0);
    const encUpdate = firestoreState.batchUpdates.find(u => u.col === 'manifest_encomiendas');
    expect(encUpdate).toBeUndefined();
    // Packages still updated.
    expect(result.packagesDocsUpdated).toBe(1);
  });

  it('REGRESSION: ok=true even when no encomienda doc exists for any tracking', async () => {
    seedManifest([
      { tracking: 'TRK-1', slCode: 'SL_OLD' },
      { tracking: 'TRK-2', slCode: 'SL_OLD' },
    ]);
    seedPackage('TRK-1');
    seedPackage('TRK-2');

    const repairs: IntegrityRepair[] = [
      REPAIR,
      { ...REPAIR, rowIndex: 1, tracking: 'TRK-2' },
    ];
    const result = await applyIntegrityRepairs(MANIFEST_ID, repairs);

    expect(result.ok).toBe(true);
    expect(result.encomiendaDocsUpdated).toBe(0);
    expect(result.packagesDocsUpdated).toBe(2);
  });

  it('REGRESSION: only updates encomiendas for the trackings whose doc exists (mixed)', async () => {
    seedManifest([
      { tracking: 'TRK-1', slCode: 'SL_OLD' }, // has encomienda doc
      { tracking: 'TRK-2', slCode: 'SL_OLD' }, // no encomienda doc
    ]);
    seedPackage('TRK-1');
    seedPackage('TRK-2');
    seedEncomienda('TRK-1');

    const result = await applyIntegrityRepairs(MANIFEST_ID, [
      REPAIR,
      { ...REPAIR, rowIndex: 1, tracking: 'TRK-2' },
    ]);

    expect(result.encomiendaDocsUpdated).toBe(1);
    const encUpdates = firestoreState.batchUpdates.filter(u => u.col === 'manifest_encomiendas');
    expect(encUpdates).toHaveLength(1);
    expect(encUpdates[0].id).toBe('TRK-1');
  });

  it('uppercases the tracking before looking up the encomienda doc', async () => {
    seedManifest([{ tracking: 'trk-lower', slCode: 'SL_OLD' }]);
    seedPackage('TRK-LOWER');
    seedEncomienda('TRK-LOWER');

    const result = await applyIntegrityRepairs(MANIFEST_ID, [
      { ...REPAIR, tracking: 'trk-lower' },
    ]);

    // Confirms the encomienda doc lookup happened with the uppercased tracking.
    expect(result.encomiendaDocsUpdated).toBe(1);
    const encUpdate = firestoreState.batchUpdates.find(u => u.col === 'manifest_encomiendas');
    expect(encUpdate!.id).toBe('TRK-LOWER');
  });
});

describe('applyIntegrityRepairs — invoices and temp customers', () => {
  it('updates invoice owner data and rewrites draft invoice number prefix', async () => {
    seedManifest();
    seedPackage('TRK-1');

    const repairs: IntegrityRepair[] = [{
      ...REPAIR,
      invoice: {
        invoiceId: 'INV-A',
        invoiceNumber: 'SL-NAN-00010-20260428120000000',
        isProtected: false,
      },
    }];

    const result = await applyIntegrityRepairs(MANIFEST_ID, repairs);
    expect(result.ok).toBe(true);
    expect(result.invoicesDocsUpdated).toBe(1);
    expect(result.invoiceNumberRewrites).toEqual([{
      invoiceId: 'INV-A',
      before: 'SL-NAN-00010-20260428120000000',
      after: 'SL488-20260428120000000',
    }]);

    const invUpdate = firestoreState.batchUpdates.find(u => u.col === 'invoices');
    expect(invUpdate).toBeTruthy();
    expect(invUpdate!.data.slCode).toBe('SL488');
    expect(invUpdate!.data.invoiceNumber).toBe('SL488-20260428120000000');
  });

  it('updates invoice owner data and always rewrites protected invoice number prefix', async () => {
    seedManifest();
    seedPackage('TRK-1');

    const repairs: IntegrityRepair[] = [{
      ...REPAIR,
      invoice: {
        invoiceId: 'INV-A',
        invoiceNumber: 'SL-NAN-00010-20260428120000000',
        isProtected: true, // Protected invoice (e.g. paid)
      },
    }];

    const result = await applyIntegrityRepairs(MANIFEST_ID, repairs);
    expect(result.ok).toBe(true);
    expect(result.invoicesDocsUpdated).toBe(1);
    expect(result.invoiceNumberRewrites).toEqual([{
      invoiceId: 'INV-A',
      before: 'SL-NAN-00010-20260428120000000',
      after: 'SL488-20260428120000000',
    }]);

    const invUpdate = firestoreState.batchUpdates.find(u => u.col === 'invoices');
    expect(invUpdate).toBeTruthy();
    expect(invUpdate!.data.slCode).toBe('SL488');
    expect(invUpdate!.data.invoiceNumber).toBe('SL488-20260428120000000');
  });

  it('triggers temp customer delete post-commit if previousSlCode is orphaned', async () => {
    seedManifest();
    seedPackage('TRK-1');

    const repairs: IntegrityRepair[] = [{
      ...REPAIR,
      invoice: {
        invoiceId: 'INV-A',
        invoiceNumber: 'SL-NAN-00010-20260428120000000',
        isProtected: false,
        previousSlCode: 'SL-NAN-00010',
      },
    }];

    const result = await applyIntegrityRepairs(MANIFEST_ID, repairs);
    expect(result.ok).toBe(true);
    expect(deleteTempCustomer).toHaveBeenCalledWith('SL-NAN-00010');
    expect(result.tempCustomersDeleted).toEqual(['SL-NAN-00010']);
  });

  it('sets temp customer doc in batch when target slCode is temp', async () => {
    seedManifest();
    seedPackage('TRK-1');

    const repairs: IntegrityRepair[] = [{
      ...REPAIR,
      slCode: 'SL-NAN-999',
    }];

    const result = await applyIntegrityRepairs(MANIFEST_ID, repairs);
    expect(result.ok).toBe(true);
    const tempCustSet = firestoreState.batchUpdates.find(u => u.col === 'temp_customers');
    expect(tempCustSet).toBeTruthy();
  });
});

describe('applyIntegrityRepairs — failure modes', () => {
  it('returns ok:false when the batch commit throws, with context', async () => {
    seedManifest();
    seedPackage('TRK-1');
    firestoreState.batchCommitError = new Error('quota exceeded');

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Batch 0 commit failed/);
    expect(result.error).toMatch(/quota exceeded/);
  });

  it('returns the empty-success shape on no-op input', async () => {
    const result = await applyIntegrityRepairs('', []);
    expect(result.ok).toBe(true);
    expect(result.manifestRowsUpdated).toBe(0);
    expect(result.packagesDocsUpdated).toBe(0);
    expect(result.encomiendaDocsUpdated).toBe(0);
    expect(result.missingPackageDocs).toEqual([]);
  });

  it('returns ok:false when manifest fails to read', async () => {
    const firestore = await import('firebase/firestore');
    vi.spyOn(firestore, 'getDoc').mockRejectedValueOnce(new Error('Read timeout'));

    const result = await applyIntegrityRepairs(MANIFEST_ID, [REPAIR]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Manifest read failed');
  });

  it('returns ok:false when manifest doc does not exist', async () => {
    const result = await applyIntegrityRepairs('MISSING-MANIFEST', [REPAIR]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });
});

