/**
 * Orchestration regression tests for the TC (exchange rate) update service.
 *
 * The pure math helpers (`recomputePackageCostCRC`, `recomputeInvoiceCRC`)
 * have their own suite in `update-exchange-rate-service.test.ts`. This file
 * guards the Firestore orchestration layer — the part that actually
 * persists TC changes across invoices, packages, and manifest docs.
 *
 * ─── INVARIANTS GUARDED ────────────────────────────────────────────────────
 *
 * BUG-TC01  Invoice status is NEVER modified by any TC update path.
 *           A paid invoice stays paid, a sent invoice stays sent. If this
 *           test fails, the production code is silently rewriting status
 *           alongside CRC — which is a state-transition bug with auditing
 *           implications.
 *
 * BUG-TC02  Annulled / cancelled / void invoices are skipped and counted
 *           into `skippedInvoicesAnnulled`. They must NEVER appear in the
 *           batched write operations — their TC represents the rate at
 *           annulment and is historical.
 *
 * BUG-TC03  `updateInvoicesExchangeRate` short-circuits when every CRC
 *           field is already aligned with the target rate. This matters
 *           because handleIngest calls it on EVERY save; without the
 *           short-circuit, a 200-invoice manifest pays 200 writes per
 *           save even when nothing changed.
 *
 * BUG-TC04  `bulkUpdateInvoicesExchangeRate` pre-checks manifest existence.
 *           Firestore's batch.update() rejects the entire batch if any
 *           target doc is missing. If an out-of-band delete removed a
 *           manifest referenced by a selected invoice, the bulk op would
 *           silently drop the invoice + package writes queued alongside.
 *
 * BUG-TC05  `bulkUpdateInvoicesExchangeRate` deduplicates packages that
 *           are referenced via BOTH packageId and trackingNumber across
 *           the selected invoices — each package gets exactly one write.
 *
 * BUG-TC06  USD fields (`amount`, `totalAmount`, `subtotalAmount`, `cost`,
 *           `price`) are NEVER touched by any TC update path. The USD
 *           price is the source of truth; only its CRC representation
 *           drifts with the rate.
 *
 * ──────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Capture-style Firestore mocks (records every write for assertion) ──────

const state = {
  /** Every batch.update() call captured, across all commits. */
  batchUpdateCalls: [] as Array<{ ref: unknown; data: any }>,
  /** Per-commit op count — flushes when commit() fires. */
  batchCommits: 0,
  /** Fixture: invoice docs returned by `getDocs(query(invoices, where mn))`. */
  invoicesByManifest: new Map<string, Array<{ id: string; data: any }>>(),
  /** Fixture: package docs returned by `getDocs(query(packages, where mn))`. */
  packagesByManifest: new Map<string, Array<{ id: string; data: any }>>(),
  /** Fixture: packages by trackingNumber `where in` query. */
  packagesByTracking: new Map<string, Array<{ id: string; data: any }>>(),
  /** Fixture: invoices returned for `documentId in [...ids]` query. */
  invoicesById: new Map<string, any>(),
  /** Fixture: packages returned for direct `getDoc(packages/{id})`. */
  packagesById: new Map<string, any>(),
  /** Fixture: manifests returned for direct `getDoc(manifests/{id})`. */
  manifestsById: new Map<string, any>(),
};

function resetState() {
  state.batchUpdateCalls = [];
  state.batchCommits = 0;
  state.invoicesByManifest.clear();
  state.packagesByManifest.clear();
  state.packagesByTracking.clear();
  state.invoicesById.clear();
  state.packagesById.clear();
  state.manifestsById.clear();
}

/** Build a fake QueryDocumentSnapshot for the loaders. */
function docSnap(id: string, data: any) {
  return {
    id,
    ref: { __pkgRef: true, id, col: data.__col },
    exists: () => true,
    data: () => data,
  };
}

vi.mock('@/lib/firebase/config', () => ({ db: {}, sp2App: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
  // Supports both `doc(collectionRef, id)` (2-arg) and
  // `doc(db, collectionPath, id)` (3-arg) signatures — both are used in
  // the TC service (bulk uses the 3-arg form for direct invoice/manifest
  // lookups, the collection-based scopes use the query form).
  doc: vi.fn((arg1: any, arg2?: string, arg3?: string) => {
    if (arg3 !== undefined) {
      // doc(db, 'invoices', 'inv-A')
      return { __doc: arg3, col: arg2, id: arg3 };
    }
    if (typeof arg2 === 'string' && arg1 && typeof arg1 === 'object' && (arg1 as any).__col) {
      // doc(collectionRef, 'id')
      return { __doc: arg2, col: (arg1 as any).__col, id: arg2 };
    }
    if (typeof arg1 === 'object' && arg1 !== null && (arg1 as any).__col) {
      // doc(collectionRef) — auto id
      return { __doc: 'auto', col: (arg1 as any).__col, id: 'auto' };
    }
    return { __doc: arg2 ?? 'auto', col: typeof arg1 === 'string' ? arg1 : undefined, id: arg2 ?? 'auto' };
  }),
  query: vi.fn((col: any, ...clauses: any[]) => ({
    __col: col?.__col,
    __clauses: clauses,
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    __where: true,
    field,
    op,
    value,
  })),
  serverTimestamp: vi.fn(() => '__server_ts__'),
  getDoc: vi.fn(async (ref: any) => {
    if (ref.col === 'invoices' && state.invoicesById.has(ref.id)) {
      const data = state.invoicesById.get(ref.id);
      return {
        id:     ref.id,
        ref:    { __invRef: true, id: ref.id },
        exists: () => true,
        data:   () => data,
      };
    }
    if (ref.col === 'packages' && state.packagesById.has(ref.id)) {
      const data = state.packagesById.get(ref.id);
      return {
        id:     ref.id,
        ref:    { __pkgRef: true, id: ref.id, col: 'packages' },
        exists: () => true,
        data:   () => data,
      };
    }
    if (ref.col === 'manifests' && state.manifestsById.has(ref.id)) {
      const data = state.manifestsById.get(ref.id);
      return {
        id:     ref.id,
        ref:    { __manifestRef: true, id: ref.id, col: 'manifests' },
        exists: () => true,
        data:   () => data,
      };
    }
    return { exists: () => false, data: () => null };
  }),
  getDocs: vi.fn(async (q: any) => {
    const col = q.__col;
    const clauses = (q.__clauses ?? []) as Array<{ field: string; op: string; value: any }>;
    // Route by (collection, clause.field, clause.op) signature.
    if (col === 'invoices') {
      const mnClause = clauses.find(c => c.field === 'manifestNumber');
      if (mnClause && mnClause.op === '==') {
        const docs = state.invoicesByManifest.get(String(mnClause.value)) ?? [];
        return { docs: docs.map(d => docSnap(d.id, { ...d.data, __col: 'invoices' })) };
      }
    }
    if (col === 'packages') {
      const mnClause = clauses.find(c => c.field === 'manifestNumber');
      if (mnClause && mnClause.op === '==') {
        const docs = state.packagesByManifest.get(String(mnClause.value)) ?? [];
        return { docs: docs.map(d => docSnap(d.id, { ...d.data, __col: 'packages' })) };
      }
      const trkClause = clauses.find(c => c.field === 'trackingNumber');
      if (trkClause && trkClause.op === 'in') {
        const trks = Array.isArray(trkClause.value) ? trkClause.value : [];
        const docs: Array<{ id: string; data: any }> = [];
        for (const t of trks) {
          const found = state.packagesByTracking.get(String(t));
          if (found) docs.push(...found);
        }
        return { docs: docs.map(d => docSnap(d.id, { ...d.data, __col: 'packages' })) };
      }
    }
    return { docs: [] };
  }),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: (ref: unknown, data: any) => {
      state.batchUpdateCalls.push({ ref, data });
    },
    delete: vi.fn(),
    commit: async () => {
      state.batchCommits += 1;
    },
  })),
}));

// Import AFTER mocks.
import {
  updateInvoicesExchangeRate,
  bulkUpdateInvoicesExchangeRate,
  updateManifestExchangeRate,
} from '../update-exchange-rate-service';

// ── Helpers ────────────────────────────────────────────────────────────────

function invoiceDoc(overrides: Partial<Record<string, any>> = {}) {
  return {
    id:             overrides.id ?? 'inv-1',
    manifestNumber: overrides.manifestNumber ?? 'MEGA-TEST',
    exchangeRate:   overrides.exchangeRate ?? 475,
    amount:         overrides.amount ?? 100,
    totalAmount:    overrides.totalAmount ?? 100,
    amountCRC:      overrides.amountCRC ?? 47500,
    subtotalCRC:    overrides.subtotalCRC ?? 47500,
    ivaCRC:         overrides.ivaCRC ?? 0,
    ivaEnabled:     overrides.ivaEnabled ?? false,
    status:         overrides.status ?? 'draft',
    invoiceItems:   overrides.invoiceItems ?? [],
  };
}

function seedInvoice(opts: Partial<Record<string, any>> & { id: string }) {
  const doc = invoiceDoc(opts);
  const mn = doc.manifestNumber;
  if (!state.invoicesByManifest.has(mn)) state.invoicesByManifest.set(mn, []);
  state.invoicesByManifest.get(mn)!.push({ id: doc.id, data: doc });
  state.invoicesById.set(doc.id, doc);
  return doc;
}

function seedPackage(opts: { id: string; tracking?: string; manifestNumber?: string; cost?: number }) {
  const pkg = {
    id:             opts.id,
    trackingNumber: opts.tracking ?? opts.id,
    manifestNumber: opts.manifestNumber ?? 'MEGA-TEST',
    cost:           opts.cost ?? 10,
  };
  state.packagesById.set(pkg.id, pkg);
  if (pkg.manifestNumber) {
    if (!state.packagesByManifest.has(pkg.manifestNumber)) state.packagesByManifest.set(pkg.manifestNumber, []);
    state.packagesByManifest.get(pkg.manifestNumber)!.push({ id: pkg.id, data: pkg });
  }
  if (pkg.trackingNumber) {
    if (!state.packagesByTracking.has(pkg.trackingNumber)) state.packagesByTracking.set(pkg.trackingNumber, []);
    state.packagesByTracking.get(pkg.trackingNumber)!.push({ id: pkg.id, data: pkg });
  }
  return pkg;
}

function seedManifest(id: string) {
  state.manifestsById.set(id, { id, exchangeRate: 475 });
}

// ──────────────────────────────────────────────────────────────────────────
// Suite 1: updateInvoicesExchangeRate — handleIngest post-save sync
// ──────────────────────────────────────────────────────────────────────────

describe('updateInvoicesExchangeRate', () => {
  beforeEach(resetState);

  it('BUG-TC03: short-circuits when every CRC field is already aligned', async () => {
    seedInvoice({
      id:           'inv-aligned',
      exchangeRate: 500,
      totalAmount:  100,
      amountCRC:    50000,
      subtotalCRC:  50000,
      ivaCRC:       0,
      ivaEnabled:   false,
    });
    const result = await updateInvoicesExchangeRate('MEGA-TEST', 500);
    expect(result.invoicesUpdated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(state.batchUpdateCalls).toHaveLength(0);
  });

  it('writes when TC matches but amountCRC has drifted', async () => {
    seedInvoice({
      id:           'inv-drift',
      exchangeRate: 500,
      totalAmount:  100,
      amountCRC:    49500, // stale — should be 50000
      subtotalCRC:  49500,
      ivaCRC:       0,
      ivaEnabled:   false,
    });
    const result = await updateInvoicesExchangeRate('MEGA-TEST', 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(state.batchUpdateCalls).toHaveLength(1);
    expect(state.batchUpdateCalls[0].data).toMatchObject({
      exchangeRate: 500,
      amountCRC:    50000,
      subtotalCRC:  50000,
      ivaCRC:       0,
    });
  });

  it('BUG-TC02: skips annulled and counts them', async () => {
    seedInvoice({ id: 'inv-live',     status: 'draft',     exchangeRate: 475 });
    seedInvoice({ id: 'inv-annulled', status: 'annulled',  exchangeRate: 475 });
    seedInvoice({ id: 'inv-cancel',   status: 'cancelled', exchangeRate: 475 });
    seedInvoice({ id: 'inv-void',     status: 'void',      exchangeRate: 475 });
    const result = await updateInvoicesExchangeRate('MEGA-TEST', 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(result.skippedInvoicesAnnulled).toBe(3);
    expect(state.batchUpdateCalls).toHaveLength(1);
  });

  it('BUG-TC01: write payload never contains status or statusHistory', async () => {
    seedInvoice({ id: 'inv-status-guard', exchangeRate: 475, status: 'paid' });
    await updateInvoicesExchangeRate('MEGA-TEST', 500);
    expect(state.batchUpdateCalls).toHaveLength(1);
    expect(state.batchUpdateCalls[0].data).not.toHaveProperty('status');
    expect(state.batchUpdateCalls[0].data).not.toHaveProperty('statusHistory');
  });

  it('BUG-TC06: write payload never contains USD fields', async () => {
    seedInvoice({ id: 'inv-usd-guard', exchangeRate: 475 });
    await updateInvoicesExchangeRate('MEGA-TEST', 500);
    expect(state.batchUpdateCalls).toHaveLength(1);
    const payload = state.batchUpdateCalls[0].data;
    expect(payload).not.toHaveProperty('amount');
    expect(payload).not.toHaveProperty('totalAmount');
    expect(payload).not.toHaveProperty('subtotalAmount');
  });

  it('returns errors when input is invalid (no throw)', async () => {
    const noMn     = await updateInvoicesExchangeRate('', 500);
    const zeroRate = await updateInvoicesExchangeRate('MEGA', 0);
    const negRate  = await updateInvoicesExchangeRate('MEGA', -1);
    for (const r of [noMn, zeroRate, negRate]) {
      expect(r.invoicesUpdated).toBe(0);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Suite 2: bulkUpdateInvoicesExchangeRate — /invoices bulk action
// ──────────────────────────────────────────────────────────────────────────

describe('bulkUpdateInvoicesExchangeRate', () => {
  beforeEach(resetState);

  it('updates invoices + linked packages + referenced manifests', async () => {
    seedInvoice({
      id:             'inv-A',
      manifestNumber: 'M-100',
      exchangeRate:   475,
      invoiceItems:   [{ packageId: 'pkg-1', trackingNumber: 'TRK-1' }],
    });
    seedPackage({ id: 'pkg-1', tracking: 'TRK-1', manifestNumber: 'M-100' });
    seedManifest('M-100');

    const result = await bulkUpdateInvoicesExchangeRate(['inv-A'], 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(result.packagesUpdated).toBe(1);
    expect(result.manifestsUpdated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(state.batchUpdateCalls).toHaveLength(3);
  });

  it('BUG-TC05: deduplicates packages referenced by both id AND tracking', async () => {
    // Invoice A references pkg by packageId.
    seedInvoice({
      id:             'inv-A',
      manifestNumber: 'M-200',
      invoiceItems:   [{ packageId: 'pkg-shared', trackingNumber: 'TRK-X' }],
    });
    // Invoice B references the SAME pkg by trackingNumber only.
    seedInvoice({
      id:             'inv-B',
      manifestNumber: 'M-200',
      invoiceItems:   [{ trackingNumber: 'TRK-X' }],
    });
    seedPackage({ id: 'pkg-shared', tracking: 'TRK-X', manifestNumber: 'M-200' });
    seedManifest('M-200');

    const result = await bulkUpdateInvoicesExchangeRate(['inv-A', 'inv-B'], 500);
    expect(result.packagesUpdated).toBe(1); // NOT 2 — deduplicated
    // The package ref should appear exactly once in batch writes.
    const pkgWrites = state.batchUpdateCalls.filter(c =>
      (c.ref as any)?.col === 'packages' || (c.ref as any)?.id === 'pkg-shared',
    );
    expect(pkgWrites.length).toBeLessThanOrEqual(1);
  });

  it('BUG-TC04: missing manifest is skipped with error, invoices + packages still written', async () => {
    seedInvoice({
      id:             'inv-orphan',
      manifestNumber: 'M-DELETED',
      invoiceItems:   [{ packageId: 'pkg-orphan', trackingNumber: 'TRK-O' }],
    });
    seedPackage({ id: 'pkg-orphan', tracking: 'TRK-O', manifestNumber: 'M-DELETED' });
    // Note: state.manifestsById does NOT have 'M-DELETED' → simulates deleted.

    const result = await bulkUpdateInvoicesExchangeRate(['inv-orphan'], 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(result.packagesUpdated).toBe(1);
    expect(result.manifestsUpdated).toBe(0);
    expect(result.errors.some(e => e.includes('not found'))).toBe(true);
    expect(result.affectedManifests).toEqual([]);
  });

  it('BUG-TC02: annulled invoices are skipped and counted', async () => {
    seedInvoice({ id: 'inv-ok',    status: 'sent',     manifestNumber: 'M-ANN' });
    seedInvoice({ id: 'inv-dead', status: 'annulled', manifestNumber: 'M-ANN' });
    seedManifest('M-ANN');

    const result = await bulkUpdateInvoicesExchangeRate(['inv-ok', 'inv-dead'], 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(result.skippedInvoicesAnnulled).toBe(1);
  });

  it('BUG-TC01: write payload never contains status or statusHistory on bulk path', async () => {
    seedInvoice({ id: 'inv-status', manifestNumber: 'M-ST', status: 'paid' });
    seedManifest('M-ST');
    await bulkUpdateInvoicesExchangeRate(['inv-status'], 500);
    const invoiceWrites = state.batchUpdateCalls.filter(c =>
      'exchangeRate' in c.data && 'amountCRC' in c.data,
    );
    for (const w of invoiceWrites) {
      expect(w.data).not.toHaveProperty('status');
      expect(w.data).not.toHaveProperty('statusHistory');
    }
  });

  it('returns zeroed result on empty input (no-op, no throw)', async () => {
    const result = await bulkUpdateInvoicesExchangeRate([], 500);
    expect(result.invoicesUpdated).toBe(0);
    expect(result.packagesUpdated).toBe(0);
    expect(result.manifestsUpdated).toBe(0);
    expect(state.batchUpdateCalls).toHaveLength(0);
  });

  it('returns errors on invalid rate (no throw)', async () => {
    const result = await bulkUpdateInvoicesExchangeRate(['inv-X'], 0);
    expect(result.invoicesUpdated).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Suite 3: updateManifestExchangeRate — Nova 4th button
// ──────────────────────────────────────────────────────────────────────────

describe('updateManifestExchangeRate', () => {
  beforeEach(resetState);

  it('coordinates packages + invoices + manifest in one operation', async () => {
    seedInvoice({ id: 'inv-1', manifestNumber: 'M-4BTN' });
    seedPackage({ id: 'pkg-1', tracking: 'TRK-1', manifestNumber: 'M-4BTN', cost: 20 });
    seedManifest('M-4BTN');

    const result = await updateManifestExchangeRate('M-4BTN', 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(result.packagesUpdated).toBe(1);
    expect(result.manifestUpdated).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('BUG-TC02: skips annulled invoices in the manifest-wide path', async () => {
    seedInvoice({ id: 'inv-live', status: 'draft',    manifestNumber: 'M-4BTN-A' });
    seedInvoice({ id: 'inv-ann',  status: 'annulled', manifestNumber: 'M-4BTN-A' });
    seedManifest('M-4BTN-A');
    const result = await updateManifestExchangeRate('M-4BTN-A', 500);
    expect(result.invoicesUpdated).toBe(1);
    expect(result.skippedInvoicesAnnulled).toBe(1);
  });

  it('returns errors on invalid input (no throw)', async () => {
    const r1 = await updateManifestExchangeRate('', 500);
    const r2 = await updateManifestExchangeRate('M', 0);
    expect(r1.errors.length).toBeGreaterThan(0);
    expect(r2.errors.length).toBeGreaterThan(0);
  });
});
