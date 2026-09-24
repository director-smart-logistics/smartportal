/**
 * consolidation-carry-on-service.spec.ts
 *
 * Regression coverage for carryOnPackages(), the function behind the
 * "mover en bulk" flow in ConsolidationManifests / ConsolidationCarryOnDialog.
 * Two separate bugs motivated this file:
 *
 *   1. WRITEBATCH LIMIT (2026-09-23): no upper bound on selection size. The
 *      function performs ≈2 writes per package (manifest reassignment +
 *      the "GAP-9 fix" invoiceId back-write) inside a SINGLE writeBatch,
 *      which Firestore caps at 500 mutations — a large customer's full
 *      package set could blow past the limit, causing a slow
 *      `batch.commit()` that ultimately throws (the "se queda pegado el
 *      modal en Moviendo…" symptom reported in production). Fixed with a
 *      fail-fast cap (200 packages) BEFORE any Firestore call — deliberately
 *      NOT chunked into multiple batches, because Step 4 aggregates every
 *      moved package into one consolidation invoice with a single computed
 *      total; a partially-applied multi-batch move would desync the invoice
 *      from the actual set of reassigned packages.
 *
 *   2. DUPLICATE INVOICE (found during this review, already fixed in the
 *      working tree but previously UNTESTED — this is the test that would
 *      have caught it): Step 4's "create a new consolidation invoice"
 *      branch used to run unconditionally after the "append to existing
 *      invoice" branch, instead of in an `else`. Every carry-on to a
 *      manifest that already had an active consolidation invoice created a
 *      SECOND, duplicate invoice for the same packages — a real billing
 *      data-corruption bug, silent and cumulative. These tests assert BOTH
 *      directions of that branch explicitly (positive: creates one invoice
 *      when none exists; negative: creates ZERO new invoices — only
 *      appends — when one already exists) so this specific regression
 *      cannot reappear uncaught.
 *
 * Per review feedback: don't just test the happy path — every guard here
 * has a paired positive/negative pair so a change that quietly disables the
 * guard (returns early too often, or never) fails a test either way.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firestore mock harness ──────────────────────────────────────────────────
// `doc()` tags refs with { __col, __id } so getDoc/batch assertions below can
// tell which collection a call targeted without a real Firestore SDK.

const firestoreFns = vi.hoisted(() => {
  let autoId = 0;
  // Supports both call shapes used by the service:
  //   doc(db, 'collection', id)      — reference to a known document
  //   doc(collection(db, 'coll'))    — new auto-ID doc ref (newInvRef pattern)
  const makeRef = (a: any, b?: string, c?: string) => {
    if (typeof b === 'string') return { __col: b, __id: c };
    return { __col: a?.__col, __id: `auto-${++autoId}` };
  };
  return {
    doc:             vi.fn(makeRef),
    writeBatch:      vi.fn(),
    collection:      vi.fn((_db: unknown, col: string) => ({ __col: col })),
    getDocs:         vi.fn(),
    getDoc:          vi.fn(),
    query:           vi.fn((...args: unknown[]) => args),
    where:           vi.fn((field: string, op: string, val: unknown) => ({ field, op, val })),
    addDoc:          vi.fn(),
    updateDoc:       vi.fn(),
    serverTimestamp: vi.fn(() => 'server-ts'),
    arrayUnion:      vi.fn((...args: unknown[]) => ({ arrayUnion: args })),
    deleteField:     vi.fn(() => 'DELETE_FIELD'),
  };
});

vi.mock('firebase/firestore', () => firestoreFns);
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('../consolidation-rules-service', () => ({
  checkConsolidationCompliance: vi.fn(),
  loadActiveConsolidationRules: vi.fn(),
}));
vi.mock('../invoice-service', () => ({
  generateInvoiceNumber: vi.fn(() => 'INV-NEW-001'),
}));
vi.mock('@/pages/consolidation/components/manifest-utils', () => ({
  getManifestType: vi.fn(() => 'normal'),
  areManifestsCompatible: vi.fn(() => true),
}));
vi.mock('@/pages/consolidation/components/normalize-origin', () => ({
  normalizeOriginCountry: vi.fn((v: string) => v),
}));
vi.mock('@/lib/utils/date-utils', () => ({
  extractInvoiceEmissionDate: vi.fn(),
  extractDateIsoFromInvoiceNumber: vi.fn(),
}));

import { carryOnPackages } from '../consolidation-carry-on-service';

function baseParams(overrides: Partial<Parameters<typeof carryOnPackages>[0]> = {}) {
  return {
    packageIds: ['pkg-1'],
    sourceManifest: 'MAN-SOURCE',
    targetManifest: 'MAN-TARGET',
    slCode: 'SL1',
    customerName: 'Cliente X',
    performedBy: 'admin@test.com',
    ...overrides,
  };
}

/** A movable (non-protected) package doc, as returned by getDoc().data(). */
function packageFixture(overrides: Record<string, any> = {}) {
  return {
    trackingNumber: 'TRK-1',
    status: 'in_transit',
    manifestNumber: 'MAN-SOURCE',
    precio: 25,
    peso: 2,
    description: 'Ropa',
    ...overrides,
  };
}

describe('carryOnPackages — writeBatch limit guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a selection over the cap (200) with a clear, actionable error — BEFORE touching Firestore', async () => {
    const oversized = Array.from({ length: 201 }, (_, i) => `pkg-${i}`);
    const result = await carryOnPackages(baseParams({ packageIds: oversized }));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no.*mover.*200/i);
    expect(firestoreFns.doc).not.toHaveBeenCalled();
    expect(firestoreFns.writeBatch).not.toHaveBeenCalled();
    expect(firestoreFns.getDoc).not.toHaveBeenCalled();
    expect(firestoreFns.getDocs).not.toHaveBeenCalled();
  });

  it('does NOT reject a selection at or under the cap (200) — the guard only fires above it', async () => {
    firestoreFns.writeBatch.mockReturnValue({ update: vi.fn(), set: vi.fn(), commit: vi.fn() });
    firestoreFns.getDoc.mockImplementation(() => { throw new Error('reached getDoc — guard correctly let it through'); });
    const inBounds = Array.from({ length: 200 }, (_, i) => `pkg-${i}`);
    const result = await carryOnPackages(baseParams({ packageIds: inBounds }));

    // The size guard's specific error message must NOT be present — any
    // other failure past this point is expected (Firestore is stubbed to
    // throw deliberately) and is not what this test is checking.
    expect(result.error).not.toMatch(/no.*mover.*200/i);
  });

  it('rejects incomplete params before the size guard even runs (existing behavior, unaffected)', async () => {
    const result = await carryOnPackages(baseParams({ packageIds: [] }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('Parámetros incompletos.');
  });
});

describe('carryOnPackages — duplicate-invoice regression (Step 4 else branch)', () => {
  let batchUpdate: ReturnType<typeof vi.fn>;
  let batchSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    batchUpdate = vi.fn();
    batchSet = vi.fn();
    firestoreFns.writeBatch.mockReturnValue({ update: batchUpdate, set: batchSet, commit: vi.fn(async () => undefined) });

    // Step 1: package lookup — always resolves to one movable package.
    firestoreFns.getDoc.mockImplementation((ref: { __col: string; __id: string }) => {
      if (ref.__col === 'packages') {
        return Promise.resolve({ exists: () => true, id: ref.__id, data: () => packageFixture() });
      }
      // customers lookup in the "create new invoice" branch — not exercised here.
      return Promise.resolve({ exists: () => false, data: () => ({}) });
    });
  });

  it('NEGATIVE — an active consolidation invoice already exists at target: appends items, creates ZERO new invoices', async () => {
    firestoreFns.getDocs.mockResolvedValue({
      docs: [{
        id: 'inv-existing',
        data: () => ({
          status: 'draft',
          isConsolidation: true,
          invoiceItems: [],
          manifestNumber: 'MAN-TARGET',
        }),
      }],
    });

    const result = await carryOnPackages(baseParams());

    expect(result.success).toBe(true);
    // The fix: `set` (new-invoice creation) must NEVER be called when an
    // active target invoice was found — only `update` (append).
    expect(batchSet).not.toHaveBeenCalled();
    const invoiceUpdateCalls = batchUpdate.mock.calls.filter(([ref]) => ref.__col === 'invoices');
    expect(invoiceUpdateCalls.length).toBe(1);
    expect(invoiceUpdateCalls[0][0].__id).toBe('inv-existing');
  });

  it('POSITIVE — no active consolidation invoice at target: creates exactly ONE new invoice', async () => {
    firestoreFns.getDocs.mockResolvedValue({ docs: [] });

    const result = await carryOnPackages(baseParams());

    expect(result.success).toBe(true);
    expect(batchSet).toHaveBeenCalledTimes(1);
    const [ref, payload] = batchSet.mock.calls[0];
    expect(ref.__col).toBe('invoices');
    expect(payload.isConsolidation).toBe(true);
    expect(payload.manifestNumber).toBe('MAN-TARGET');
  });

  it('an existing target invoice that is PROTECTED (e.g. paid) is treated as absent — a new invoice is created instead of mutating a paid invoice', async () => {
    // The targetInvQuery filters isConsolidation===true but does NOT filter
    // status server-side; activeTargetInv is resolved client-side by
    // excluding PROTECTED_INVOICE_STATUSES + annulled. A paid invoice must
    // never receive appended items.
    firestoreFns.getDocs.mockResolvedValue({
      docs: [{
        id: 'inv-paid',
        data: () => ({ status: 'paid', isConsolidation: true, invoiceItems: [], manifestNumber: 'MAN-TARGET' }),
      }],
    });

    await carryOnPackages(baseParams());

    const invoiceUpdateCalls = batchUpdate.mock.calls.filter(([ref]) => ref.__col === 'invoices');
    expect(invoiceUpdateCalls.length).toBe(0); // never mutated the paid invoice
    expect(batchSet).toHaveBeenCalledTimes(1);  // fell through to creating a new one instead
  });
});
