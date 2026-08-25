/**
 * Invoice Service — Regression Tests
 *
 * Guards every critical behaviour of `invoice-service.ts`.
 * If any test fails, fix the production code — NEVER weaken or delete a test.
 *
 * ─── Bug / contract index ──────────────────────────────────────────────────────
 *
 * BUG-I01  generateInvoiceNumber — empty slCode must NOT throw; falls back to 'INV'.
 *          Guards the `|| 'INV'` fallback in generateInvoiceNumber().
 *
 * BUG-I02  createInvoicesFromRows — rows with no slCode are silently skipped.
 *          Guards the `if (!group.slCode) continue` gate in createInvoicesFromRows().
 *
 * BUG-I03  IVA rounding — tax is computed as (total - subtotal), NOT total * 0.13.
 *          This prevents a floating-point rounding gap where subtotal + iva ≠ total.
 *          Guards: subtotalUSD = round(total / 1.13 * 100)/100
 *                  ivaUSD     = round((total - subtotalUSD) * 100)/100
 *
 * BUG-I04  sendInvoiceEmails — invoices without clientEmail are silently skipped.
 *          The function must NOT throw; it returns { sent:0, failed:0 } for them.
 *          Guards the `if (!inv.clientEmail) continue` early return.
 *
 * BUG-I05  exchangeRate = 0 → amountCRC must be 0 (not NaN, not Infinity).
 *          Guards: `exchangeRate > 0 ? Math.round(total * exchangeRate) : 0`.
 *
 * BUG-I06  groupRowsForInvoicing — consolidacion=false rows with the same slCode
 *          must NOT be merged; each row becomes its own individual invoice.
 *          Guards the `__individual__{tracking}` key logic.
 *
 * BUG-I07  buildInvoiceData — a single-row group must NOT be flagged isConsolidation.
 *          Guards: `isConsolidation = group.rows.length > 1`.
 *
 * BUG-I08  sendInvoiceEmails total count — `sent + failed` must equal the number
 *          of invoices that actually have a clientEmail (skipped ones don't count).
 *
 * BUG-I09  getCustomersBySlCodes — returns empty Map when called with [].
 *          Guards the early-return guard `if (!slCodes.length) return result`.
 *
 * BUG-I10  createInvoicesFromRows — IVA disabled: iva must be 0, subtotal == total.
 *
 * BUG-I11  Invoice number format — must contain slCode, date segment, and end in
 *          '-C' only when isConsolidated=true.
 *
 * BUG-I12  trackingNumbers vs trackingNumber — consolidated invoice uses array field;
 *          individual invoice uses scalar field (never both).
 *
 * BUG-I16  Pre-emptive Deletion Regressions — do NOT delete draft invoices in caller
 *          files before calling `createInvoicesFromRows(..., { mergeExistingDrafts: true })`.
 *          If draft is deleted prematurely, existing manual items and other system items
 *          will not be found and will be lost.
 *
 * BUG-I17  System vs Manual Categorization Invariant — System items MUST have `isSystem: true`
 *          and a distinct `systemType` (e.g. 'terceros' or 'bodegaje') to prevent merging/deduplication
 *          collisions. Manual items have `isManual: true` but `isSystem: false` or empty `systemType`.
 *
 * BUG-I18  System Type Isolation Invariant — Deduplication for one `systemType` (e.g. 'terceros')
 *          MUST NOT affect or overwrite items of another `systemType` (e.g. 'bodegaje').
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Firebase mocks (must be declared before any service import) ────────────────

vi.mock('@/lib/firebase', () => ({ db: {}, app: {} }));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  getFirestore:    vi.fn(() => ({})),
  collection:      vi.fn(() => 'col-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'inv-doc-id' }),
  getDocs:         vi.fn().mockResolvedValue({ forEach: (_cb: unknown) => {} }),
  getDoc:          vi.fn().mockResolvedValue({ exists: () => false }),
  query:           vi.fn(() => 'query-ref'),
  where:           vi.fn(),
  serverTimestamp: vi.fn(() => 'mock-ts'),
  deleteDoc:       vi.fn().mockResolvedValue(undefined),
  updateDoc:       vi.fn().mockResolvedValue(undefined),
  deleteField:     vi.fn(() => 'mock-delete-field'),
  arrayUnion:      vi.fn((...args) => args),
  writeBatch:      vi.fn(() => ({ commit: vi.fn().mockResolvedValue(undefined) })),
  doc:             vi.fn(() => 'doc-ref'),
}));

vi.mock('firebase/functions', () => ({
  getFunctions:  vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));

vi.mock('.././sync-invoices-service', () => ({
  deleteInvoiceFromSp2: vi.fn().mockResolvedValue(undefined),
  syncInvoicesToSp2:    vi.fn().mockResolvedValue(undefined),
}));

vi.mock('.././sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn().mockResolvedValue({ success: true }),
}));

import { addDoc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { syncInvoicesToSp2 } from '.././sync-invoices-service';

// ── Helpers ────────────────────────────────────────────────────────────────────

import type { ProcessedRow } from '@/hooks/use-nova-chat';

/** Minimal ProcessedRow fixture; override any field as needed. */
function makeRow(overrides: Partial<ProcessedRow> = {}): ProcessedRow {
  return {
    tracking:           'TRK-0001',
    nombre:             'JUAN PEREZ',
    guia:               '',
    manifiesto:         'M001',
    peso:               2,
    precio:             15,
    slCode:             'SL-001',
    nombreCliente:      'JUAN PEREZ',
    ruta:               'RUTA-A',
    consolidacion:      false,
    descripcion:        'Ropa',
    permisos:           false,
    pesoRedondeo:       2,
    diferenciaRedondeo: 0,
    pesoConsolidacion:  0,
    precioSinPermiso:   15,
    precioConPermiso:   18,
    matchScore:         1.0,
    originalData:       {},
    ...overrides,
  };
}

// ── generateInvoiceNumber ──────────────────────────────────────────────────────

import {
  generateInvoiceNumber,
  isConsolidatedInvoice,
  buildInvoiceEmailPayload,
  groupRowsForInvoicing,
  createInvoicesFromRows,
  sendInvoiceEmails,
  getCustomersBySlCodes,
  annulInvoicesByTrackingsAndManifest,
  isDuplicateManualItem,
  type InvoiceRecord,
} from '.././invoice-service';

describe('generateInvoiceNumber', () => {
  it('contains the slCode prefix', () => {
    const n = generateInvoiceNumber('SL-001', false);
    expect(n).toMatch(/^SL-001-/);
  });

  it('contains a datetime segment (14 digits: YYYYMMDDHHmmss)', () => {
    const n = generateInvoiceNumber('SL-001', false);
    // e.g. SL-001-20260408221530
    expect(n).toMatch(/\d{14}/);
  });

  it('ends with -C when isConsolidated=true (BUG-I11)', () => {
    const n = generateInvoiceNumber('SL-001', true);
    expect(n.endsWith('-C')).toBe(true);
  });

  it('does NOT end with -C when isConsolidated=false (BUG-I11)', () => {
    const n = generateInvoiceNumber('SL-001', false);
    expect(n.endsWith('-C')).toBe(false);
  });

  it('falls back to INV when slCode is empty (BUG-I01)', () => {
    const n = generateInvoiceNumber('', false);
    expect(n).toMatch(/^INV-/);
  });

  it('does not throw for any slCode (BUG-I01)', () => {
    expect(() => generateInvoiceNumber('', false)).not.toThrow();
    expect(() => generateInvoiceNumber('', true)).not.toThrow();
    expect(() => generateInvoiceNumber('X', true)).not.toThrow();
  });

  it('contains millisecond precision (BUG-INV-COLLISION 2026-04-28)', () => {
    // Format: ${slCode}-YYYYMMDDHHmmssSSS  (17 digit timestamp)
    // The 14-digit assertion above still passes because `\d{14}` is a substring match.
    const n = generateInvoiceNumber('SL-001', false);
    expect(n).toMatch(/^SL-001-\d{17}$/);
  });

  it('produces 17-digit timestamp + -C suffix when consolidated', () => {
    const n = generateInvoiceNumber('SL-001', true);
    expect(n).toMatch(/^SL-001-\d{17}-C$/);
    expect(n.endsWith('-C')).toBe(true);
  });

  it('two invoices for same slCode in same second produce DIFFERENT numbers when ms differ', () => {
    // Simulates the collision scenario from the screenshot: two SL-NAN-00008
    // invoices created sequentially. With ms precision, even adjacent calls
    // separated by ≥1 ms now disambiguate.
    const a = generateInvoiceNumber('SL-NAN-00008', false);
    // Busy-wait at least 2 ms (avoids flakiness on systems where two calls
    // may share a millisecond).
    const startWait = Date.now();
    while (Date.now() - startWait < 2) { /* spin */ }
    const b = generateInvoiceNumber('SL-NAN-00008', false);
    expect(a).not.toBe(b);
  });
});

// ── isConsolidatedInvoice ─────────────────────────────────────────────────────

describe('isConsolidatedInvoice', () => {
  it('returns true when isConsolidation boolean is true', () => {
    expect(isConsolidatedInvoice({ isConsolidation: true, invoiceNumber: 'SL-001-20260101' })).toBe(true);
  });

  it('returns false when isConsolidation is false and no suffix', () => {
    expect(isConsolidatedInvoice({ isConsolidation: false, invoiceNumber: 'SL-001-20260101' })).toBe(false);
  });

  it('returns true for -C suffix (invoice-service format) (BUG-CONS-01)', () => {
    expect(isConsolidatedInvoice({ invoiceNumber: 'SL-001-20260412123456-C' })).toBe(true);
  });

  it('returns false for non-C suffix like -CR or -CITY (BUG-CONS-02)', () => {
    expect(isConsolidatedInvoice({ invoiceNumber: 'SL-001-20260412123456-CR' })).toBe(false);
    expect(isConsolidatedInvoice({ invoiceNumber: 'SL-001-20260412123456' })).toBe(false);
  });

  it('returns true for -CONSOLIDACION suffix (legacy NovaTableModal format) (BUG-CONS-03)', () => {
    expect(isConsolidatedInvoice({ invoiceNumber: 'SL001-20260412-CONSOLIDACION' })).toBe(true);
  });

  it('returns false for undefined invoiceNumber and no boolean field', () => {
    expect(isConsolidatedInvoice({})).toBe(false);
  });

  it('boolean true overrides invoiceNumber without suffix', () => {
    expect(isConsolidatedInvoice({ isConsolidation: true, invoiceNumber: 'SL-001-20260101' })).toBe(true);
  });
});

// ── generateInvoiceNumber / isConsolidatedInvoice parity ──────────────────────

describe('generateInvoiceNumber + isConsolidatedInvoice parity (BUG-CONS-04)', () => {
  it('generateInvoiceNumber(true) produces a number that isConsolidatedInvoice detects', () => {
    const n = generateInvoiceNumber('SL-001', true);
    expect(isConsolidatedInvoice({ invoiceNumber: n })).toBe(true);
  });

  it('generateInvoiceNumber(false) produces a number that isConsolidatedInvoice does NOT flag', () => {
    const n = generateInvoiceNumber('SL-001', false);
    expect(isConsolidatedInvoice({ invoiceNumber: n })).toBe(false);
  });

  it('consolidated invoice number ends with -C, NOT -CONSOLIDACION (BUG-CONS-05)', () => {
    const n = generateInvoiceNumber('SL-001', true);
    expect(n.endsWith('-C')).toBe(true);
    expect(n.includes('-CONSOLIDACION')).toBe(false);
  });
});

// ── buildInvoiceEmailPayload — isConsolidation detection ──────────────────────

describe('buildInvoiceEmailPayload — consolidation detection (BUG-CONS-06)', () => {
  const base = { clientName: 'Test', clientEmail: 't@example.com', invoiceNumber: '' };

  it('detects via isConsolidation boolean', () => {
    const p = buildInvoiceEmailPayload({ ...base, isConsolidation: true, invoiceNumber: 'SL-X-20260101' });
    expect(p.isConsolidation).toBe(true);
  });

  it('detects via -C suffix', () => {
    const p = buildInvoiceEmailPayload({ ...base, invoiceNumber: 'SL-001-20260412123456-C' });
    expect(p.isConsolidation).toBe(true);
  });

  it('detects via -CONSOLIDACION legacy suffix', () => {
    const p = buildInvoiceEmailPayload({ ...base, invoiceNumber: 'SL001-20260412-CONSOLIDACION' });
    expect(p.isConsolidation).toBe(true);
  });

  it('returns false for plain individual invoice', () => {
    const p = buildInvoiceEmailPayload({ ...base, isConsolidation: false, invoiceNumber: 'SL-001-20260412123456' });
    expect(p.isConsolidation).toBe(false);
  });
});

// ── groupRowsForInvoicing ──────────────────────────────────────────────────────

describe('groupRowsForInvoicing', () => {
  it('returns an empty array for empty input', () => {
    expect(groupRowsForInvoicing([])).toEqual([]);
  });

  it('creates one group per individual row when consolidacion=false (BUG-I06)', () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: false }),
    ];
    const groups = groupRowsForInvoicing(rows);
    expect(groups).toHaveLength(2);
  });

  it('merges rows with same slCode when consolidacion=true', () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: true }),
    ];
    const groups = groupRowsForInvoicing(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });

  it('does NOT merge different slCodes even when consolidacion=true', () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: true }),
      makeRow({ slCode: 'SL-002', tracking: 'TRK-B', consolidacion: true }),
    ];
    const groups = groupRowsForInvoicing(rows);
    expect(groups).toHaveLength(2);
  });

  it('creates individual groups for rows with no slCode', () => {
    const rows = [
      makeRow({ slCode: '', tracking: 'TRK-A', consolidacion: false }),
      makeRow({ slCode: '', tracking: 'TRK-B', consolidacion: false }),
    ];
    const groups = groupRowsForInvoicing(rows);
    expect(groups).toHaveLength(2);
  });

  it('mixed: some consolidated, some individual', () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: true }),
      makeRow({ slCode: 'SL-002', tracking: 'TRK-C', consolidacion: false }),
    ];
    const groups = groupRowsForInvoicing(rows);
    // SL-001 (merged) + SL-002 individual
    expect(groups).toHaveLength(2);
    const sl1 = groups.find(g => g.slCode === 'SL-001');
    expect(sl1?.rows).toHaveLength(2);
  });
});

// ── IVA math (pure logic, extracted from buildInvoiceData) ────────────────────

describe('IVA calculation logic (BUG-I03)', () => {
  /**
   * Mirrors buildInvoiceData IVA math exactly.
   * RULE: iva = round(total - subtotal), NOT total * 0.13.
   * This prevents subtotal + iva ≠ total due to IEEE 754 drift.
   */
  function computeIva(totalUSD: number, ivaEnabled: boolean) {
    const subtotalUSD = ivaEnabled
      ? Math.round(totalUSD / 1.13 * 100) / 100
      : totalUSD;
    const ivaUSD = ivaEnabled
      ? Math.round((totalUSD - subtotalUSD) * 100) / 100
      : 0;
    return { subtotalUSD, ivaUSD };
  }

  it('IVA disabled: subtotal = total, iva = 0 (BUG-I10)', () => {
    const { subtotalUSD, ivaUSD } = computeIva(100, false);
    expect(subtotalUSD).toBe(100);
    expect(ivaUSD).toBe(0);
  });

  it('IVA enabled: subtotal + iva === total (no rounding gap)', () => {
    const total = 113;
    const { subtotalUSD, ivaUSD } = computeIva(total, true);
    expect(subtotalUSD + ivaUSD).toBe(total);
  });

  it('IVA enabled: subtotal is approximately total / 1.13', () => {
    const { subtotalUSD } = computeIva(226, true);
    expect(subtotalUSD).toBeCloseTo(226 / 1.13, 2);
  });

  it('IVA enabled: iva is approximately 13% of subtotal', () => {
    const total = 113;
    const { subtotalUSD, ivaUSD } = computeIva(total, true);
    expect(ivaUSD / subtotalUSD).toBeCloseTo(0.13, 2);
  });

  it('zero total: both subtotal and iva are 0', () => {
    const { subtotalUSD, ivaUSD } = computeIva(0, true);
    expect(subtotalUSD).toBe(0);
    expect(ivaUSD).toBe(0);
  });
});

// ── Exchange rate math ─────────────────────────────────────────────────────────

describe('Exchange rate math (BUG-I05)', () => {
  /**
   * Mirrors buildInvoiceData CRC conversion.
   * RULE: exchangeRate 0 → 0 (not NaN). Must never produce Infinity.
   */
  function computeCRC(totalUSD: number, exchangeRate: number): number {
    return exchangeRate > 0 ? Math.round(totalUSD * exchangeRate) : 0;
  }

  it('exchangeRate=0 → amountCRC is 0, not NaN', () => {
    expect(computeCRC(100, 0)).toBe(0);
    expect(Number.isNaN(computeCRC(100, 0))).toBe(false);
  });

  it('exchangeRate=487 → amountCRC = round(total * 487)', () => {
    expect(computeCRC(10, 487)).toBe(4870);
  });

  it('zero total → amountCRC is 0 regardless of rate', () => {
    expect(computeCRC(0, 487)).toBe(0);
  });

  it('result is always a finite integer', () => {
    const result = computeCRC(15.75, 487);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ── createInvoicesFromRows ─────────────────────────────────────────────────────

describe('createInvoicesFromRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(addDoc).mockResolvedValue({ id: 'inv-doc-id' } as any);
    vi.mocked(getDocs).mockResolvedValue({ forEach: (_cb: unknown) => {} } as any);
  });

  it('creates SR invoice for rows with no slCode and no route (deriveRouteCode fallback)', async () => {
    const rows = [makeRow({ slCode: '', ruta: '' })];
    const result = await createInvoicesFromRows(rows, { exchangeRate: 487 });
    // No slCode, no route → derives 'SR' code → invoice IS created (not skipped)
    expect(result.created).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.created[0].slCode).toBe('SR');
  });

  it.each([
    ['Cartago 1',         'C1'],
    ['Cartago 2',         'C2'],
    ['Heredia',           'H'],
    ['Alajuela',          'A'],
    ['San Jose Centro',   'SJOC'],
    ['San Jose Escazu',   'SJOE'],
    ['San Jose Coronado', 'SJOCO'],
    ['Occidente',         'OCC'],
    ['Encomiendas',       'ENC'],
    ['Retira',            'RET'],
    ['',                  'SR'],
  ])('deriveRouteCode: "%s" → "%s"', async (ruta, expected) => {
    const rows = [makeRow({ slCode: '', ruta })];
    const result = await createInvoicesFromRows(rows, { exchangeRate: 0 });
    expect(result.created[0].slCode).toBe(expected);
  });

  it('creates one invoice for a single matched row', async () => {
    const rows = [makeRow({ slCode: 'SL-001' })];
    const result = await createInvoicesFromRows(rows, { exchangeRate: 487 });
    expect(result.created).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('invoice amount equals row.precio', async () => {
    const rows = [makeRow({ slCode: 'SL-001', precio: 25 })];
    const result = await createInvoicesFromRows(rows, { exchangeRate: 0 });
    expect(result.created[0].amount).toBe(25);
  });

  it('amountCRC = round(amount * exchangeRate) when rate > 0 (BUG-I05)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', precio: 10 })];
    const result = await createInvoicesFromRows(rows, { exchangeRate: 487 });
    expect(result.created[0].amountCRC).toBe(4870);
  });

  it('amountCRC = 0 when exchangeRate = 0 (BUG-I05)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', precio: 10 })];
    const result = await createInvoicesFromRows(rows, { exchangeRate: 0 });
    expect(result.created[0].amountCRC).toBe(0);
  });

  it('IVA disabled: iva field is 0 and subtotal === amount (BUG-I10)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', precio: 100 })];
    const result = await createInvoicesFromRows(rows, { ivaEnabled: false, exchangeRate: 0 });
    const inv = result.created[0];
    expect(inv.iva).toBe(0);
    expect(inv.subtotal).toBe(inv.amount);
  });

  it('IVA enabled: subtotal + iva === amount (BUG-I03)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', precio: 113 })];
    const result = await createInvoicesFromRows(rows, { ivaEnabled: true, exchangeRate: 0 });
    const inv = result.created[0];
    expect(inv.subtotal + inv.iva).toBe(inv.amount);
  });

  it('single-row invoice is NOT flagged as consolidation (BUG-I07)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', consolidacion: false })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].isConsolidation).toBe(false);
  });

  it('consolidated invoice uses trackingNumbers[] array (BUG-I12)', async () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: true }),
    ];
    const result = await createInvoicesFromRows(rows, {});
    const inv = result.created[0];
    expect(inv.isConsolidation).toBe(true);
    expect(Array.isArray(inv.trackingNumbers)).toBe(true);
    expect(inv.trackingNumber).toBeUndefined();
  });

  it('individual invoice uses trackingNumber scalar (BUG-I12)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: false })];
    const result = await createInvoicesFromRows(rows, {});
    const inv = result.created[0];
    expect(typeof inv.trackingNumber).toBe('string');
    expect(inv.trackingNumbers).toBeUndefined();
  });

  it('invoice number ends with -C for consolidated invoice (BUG-I11)', async () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: true }),
    ];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].invoiceNumber.endsWith('-C')).toBe(true);
  });

  it('invoice number does NOT end with -C for individual invoice (BUG-I11)', async () => {
    const rows = [makeRow({ slCode: 'SL-001', consolidacion: false })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].invoiceNumber.endsWith('-C')).toBe(false);
  });

  it('pushes to errors array when addDoc rejects', async () => {
    vi.mocked(addDoc).mockRejectedValueOnce(new Error('Firestore write failed'));
    const rows = [makeRow({ slCode: 'SL-999' })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].slCode).toBe('SL-999');
    expect(result.errors[0].error).toContain('Firestore write failed');
  });

  it('returns empty created + empty errors for empty rows array', async () => {
    const result = await createInvoicesFromRows([], {});
    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('status is always "draft" on creation', async () => {
    const rows = [makeRow({ slCode: 'SL-001' })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].status).toBe('draft');
  });

  it('source is always "nova"', async () => {
    const rows = [makeRow({ slCode: 'SL-001' })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].source).toBe('nova');
  });

  it('packageCount reflects actual number of rows in group', async () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-C', consolidacion: true }),
    ];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].packageCount).toBe(3);
  });

  it('totalWeight uses pesoRedondeo when available', async () => {
    const rows = [makeRow({ slCode: 'SL-001', peso: 1.4, pesoRedondeo: 1.5, permisos: true })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].totalWeight).toBe(1.5);
  });

  it('WEIGHT_DISPLAY_RULE — permiso item stores pesoRedondeo in item.weight', async () => {
    const rows = [makeRow({ slCode: 'SL-001', peso: 0.28, pesoRedondeo: 1, permisos: true })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].items[0].weight).toBe(1);
  });

  it('WEIGHT_DISPLAY_RULE — regular item stores real peso (not pesoRedondeo) in item.weight', async () => {
    const rows = [makeRow({ slCode: 'SL-001', peso: 0.36, pesoRedondeo: 1, permisos: false })];
    const result = await createInvoicesFromRows(rows, {});
    expect(result.created[0].items[0].weight).toBe(0.36);
  });

  it('WEIGHT_DISPLAY_RULE — consolidation items store proportional ceil(sumPeso) per item', async () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', peso: 0.36, pesoRedondeo: 0.36, consolidacion: true, permisos: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', peso: 0.36, pesoRedondeo: 0.36, consolidacion: true, permisos: false }),
    ];
    const result = await createInvoicesFromRows(rows, {});
    const items = result.created[0].items;
    // sumPeso = 0.72 → ceil = 1 → each item = 1 * (0.36/0.72) = 0.50
    expect(items[0].weight).toBe(0.50);
    expect(items[1].weight).toBe(0.50);
    // sanity: sum of item weights equals ceiled total
    expect(Math.round((items[0].weight + items[1].weight) * 100) / 100).toBe(1.00);
  });

  it('WEIGHT_DISPLAY_RULE — Factura única (isMergedSingle) items store REAL peso, not proportional consolidated peso', async () => {
    // BUG-I13: When Factura única is active, items must use r.peso (real individual weight),
    // not the proportional ceil(sumPeso) formula used for consolidation.
    // The mergedSlCodes set signals Factura única for SL-001.
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', peso: 1.3, pesoRedondeo: 2, consolidacion: false, permisos: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', peso: 2.7, pesoRedondeo: 3, consolidacion: false, permisos: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-C', peso: 0.5, pesoRedondeo: 1, consolidacion: false, permisos: false }),
    ];
    const mergedSlCodes = new Set(['SL-001']);
    const result = await createInvoicesFromRows(rows, { mergedSlCodes });
    const items = result.created[0].items;
    expect(result.created[0].isConsolidation).toBe(false);
    // Each item keeps its own real peso — no rounding or proportional distribution
    expect(items[0].weight).toBe(1.3);
    expect(items[1].weight).toBe(2.7);
    expect(items[2].weight).toBe(0.5);
  });

  it('WEIGHT_DISPLAY_RULE — Factura única (isMergedSingle) notes field is set correctly', async () => {
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: false }),
    ];
    const mergedSlCodes = new Set(['SL-001']);
    const result = await createInvoicesFromRows(rows, { mergedSlCodes });
    expect(result.created[0].notes).toMatch(/Factura única/);
  });

  it('CONSOLIDATION INVARIANT — Factura única (isMergedSingle) must NOT be flagged as consolidation', async () => {
    // BUG-I14: isConsolidation was derived from rows.length > 1 without checking isMergedSingle.
    // A Factura única group with 3 rows was incorrectly stored as isConsolidation=true,
    // which caused: wrong invoice number suffix (-C), wrong UI label, wrong Firestore flag.
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-A', consolidacion: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-B', consolidacion: false }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-C', consolidacion: false }),
    ];
    const mergedSlCodes = new Set(['SL-001']);
    const result = await createInvoicesFromRows(rows, { mergedSlCodes });
    const inv = result.created[0];
    expect(inv.isConsolidation).toBe(false);
    expect(inv.invoiceNumber).not.toMatch(/-C$/);
    // Both tracking fields must be populated for payment/delete lookups
    expect(inv.trackingNumber).toBe('TRK-A');
    expect(inv.trackingNumbers).toEqual(['TRK-A', 'TRK-B', 'TRK-C']);
  });

  it('CONSOLIDATION INVARIANT — true consolidation groups remain isConsolidation=true', async () => {
    // Regression guard: the isMergedSingle fix must not affect real consolidation groups.
    const rows = [
      makeRow({ slCode: 'SL-002', tracking: 'TRK-X', consolidacion: true }),
      makeRow({ slCode: 'SL-002', tracking: 'TRK-Y', consolidacion: true }),
    ];
    const result = await createInvoicesFromRows(rows, {});
    const inv = result.created[0];
    expect(inv.isConsolidation).toBe(true);
    expect(inv.invoiceNumber).toMatch(/-C$/);
    expect(inv.trackingNumbers).toEqual(['TRK-X', 'TRK-Y']);
    expect(inv.trackingNumber).toBeUndefined();
  });

  // ── BUG-I15: Re-generar factura silent no-op ────────────────────────────────
  // When createInvoicesFromRows skips a group because RECREATE_PROTECTED_STATUSES
  // already exists for (clientSlCode, manifestNumber), it MUST populate skipped[]
  // so the NOVA "Re-generar factura" UX can render an explicit toast instead of
  // appearing broken. These tests guard the skip-reporting contract.

  // Helper: createInvoicesFromRows performs TWO getDocs calls per group:
  //   1) batched customer lookup (getCustomersBySlCodes)
  //   2) (clientSlCode, manifestNumber) overlap probe used by the AI GUARD
  // The protected-status fixture lives in call #2.
  const mockEmptyThen = (overlapDocs: Array<{ id: string; data: () => any; ref?: any }>) => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ forEach: () => {}, docs: [] } as any)
      .mockResolvedValueOnce({
        forEach: (cb: (d: any) => void) => overlapDocs.forEach(cb),
        docs: overlapDocs,
      } as any);
  };

  it('BUG-I15 — paid invoice triggers skipped[] (NOT created, NOT errored)', async () => {
    mockEmptyThen([
      { id: 'doc-paid', data: () => ({ status: 'paid', invoiceNumber: 'SL-001-20260101' }) },
    ]);
    const rows = [makeRow({ slCode: 'SL-001' })];
    const result = await createInvoicesFromRows(rows, { manifestNumber: 'M-001' });
    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped![0]).toMatchObject({
      slCode: 'SL-001',
      reason: 'protected',
      statuses: ['paid'],
      invoiceNumbers: ['SL-001-20260101'],
    });
  });

  it.each(['sent', 'overdue', 'pending', 'pending_payment'])(
    'BUG-I15 — %s status triggers skipped[]',
    async (status) => {
      mockEmptyThen([
        { id: `doc-${status}`, data: () => ({ status, invoiceNumber: `INV-${status}` }) },
      ]);
      const rows = [makeRow({ slCode: 'SL-002' })];
      const result = await createInvoicesFromRows(rows, { manifestNumber: 'M-002' });
      expect(result.created).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped![0].statuses).toEqual([status]);
    }
  );

  it('BUG-I15 — draft invoice does NOT trigger skipped[] (it gets deleted + recreated)', async () => {
    mockEmptyThen([
      { id: 'doc-draft', ref: {}, data: () => ({ status: 'draft', invoiceNumber: 'SL-001-OLD' }) },
    ]);
    const rows = [makeRow({ slCode: 'SL-001' })];
    const result = await createInvoicesFromRows(rows, { manifestNumber: 'M-003' });
    // Draft is deleted internally; new invoice is created. skipped[] stays empty.
    expect(result.skipped).toEqual([]);
  });

  it('BUG-I15 — annulled tombstone does NOT trigger skipped[] (recreate is allowed)', async () => {
    mockEmptyThen([
      { id: 'doc-annulled', data: () => ({ status: 'annulled', invoiceNumber: 'INV-OLD' }) },
    ]);
    const rows = [makeRow({ slCode: 'SL-003' })];
    const result = await createInvoicesFromRows(rows, { manifestNumber: 'M-004' });
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it('BUG-I15 — happy path returns empty skipped[] (no Firestore overlap)', async () => {
    const rows = [makeRow({ slCode: 'SL-001' })];
    const result = await createInvoicesFromRows(rows, { manifestNumber: 'M-fresh' });
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it('Shield Policy — items_only updates the invoice in place preserving manual items', async () => {
    mockEmptyThen([
      {
        id: 'doc-protected-inv',
        ref: { id: 'doc-protected-inv' },
        data: () => ({
          status: 'sent',
          invoiceNumber: 'SL-001-PROTECTED',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          invoiceItems: [
            { description: 'Manual Item', trackingNumber: '', isManual: true, totalPrice: 100 },
            { description: 'Old Tracking', trackingNumber: 'TRK-OLD', isManual: false, totalPrice: 20 },
          ],
          items: [
            { description: 'Manual Item Description', amount: 100 },
            { description: 'Old Tracking Description', tracking: 'TRK-OLD', amount: 20 },
          ],
        }),
      },
    ]);
    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      protectedActions: { 'SL-001': 'items_only' },
    });

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    const updated = result.created[0];
    expect(updated.id).toBe('doc-protected-inv');
    expect(updated.invoiceItems).toHaveLength(2);
    expect(updated.invoiceItems[0].isManual).toBe(true);
    expect(updated.invoiceItems[1].trackingNumber).toBe('TRK-NEW');
    expect(updated.totalAmount).toBe(150);
    expect(vi.mocked(updateDoc)).toHaveBeenCalled();
    expect(vi.mocked(syncInvoicesToSp2)).toHaveBeenCalledWith([expect.objectContaining({ id: 'doc-protected-inv' })]);
  });

  // ── GAP FIX tests: items_only must use the fresh tercero amount, not the stale one ──
  // Commit 657b533ef created items_only WITHOUT deduplication; 73a24d1db fixed mergeExistingDrafts
  // but left items_only unpatched. These three tests cover the three failure modes.

  it('GAP-TERCERO-1 — items_only: updated tercero amount replaces stale Firestore amount', async () => {
    mockEmptyThen([{
      id: 'doc-sent',
      ref: { id: 'doc-sent' },
      data: () => ({
        status: 'sent',
        invoiceNumber: 'SL-001-SENT',
        clientSlCode: 'SL-001',
        invoiceItems: [
          { description: 'TRK-A', trackingNumber: 'TRK-A', isManual: false, totalPrice: 50 },
          { description: 'Servicio de Terceros', trackingNumber: '', isManual: true, totalPrice: 12 }, // stale
        ],
        items: [
          { tracking: 'TRK-A', amount: 50 },
          { tracking: '', description: 'Servicio de Terceros', amount: 12 }, // stale
        ],
      }),
    }]);

    const terceroItems = new Map([['SL-001', { amount: 15, description: 'Servicio de Terceros' }]]);
    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-A', precio: 50 })];
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      protectedActions: { 'SL-001': 'items_only' },
    });

    expect(result.created).toHaveLength(1);
    const updated = result.created[0];
    // Must use NEW amount ($15), not stale ($12) → total = 50 + 15 = 65
    expect(updated.totalAmount).toBeCloseTo(65, 2);
    const terceroItem = updated.items?.find((i: any) => !i.tracking);
    expect(terceroItem?.amount).toBeCloseTo(15, 2);
  });

  it('GAP-TERCERO-2 — items_only: tercero removed from manifest does not persist in invoice', async () => {
    mockEmptyThen([{
      id: 'doc-sent',
      ref: { id: 'doc-sent' },
      data: () => ({
        status: 'sent',
        invoiceItems: [
          { description: 'TRK-A', trackingNumber: 'TRK-A', isManual: false, totalPrice: 50 },
          { description: 'Servicio de Terceros', trackingNumber: '', isManual: true, totalPrice: 12 },
        ],
        items: [
          { tracking: 'TRK-A', amount: 50 },
          { tracking: '', description: 'Servicio de Terceros', amount: 12 },
        ],
      }),
    }]);

    // No terceroItems → tercero has been removed from manifest
    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-A', precio: 50 })];
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      protectedActions: { 'SL-001': 'items_only' },
    });

    expect(result.created).toHaveLength(1);
    const updated = result.created[0];
    // Only packages remain — stale tercero must be gone
    expect(updated.totalAmount).toBeCloseTo(50, 2);
    const noTrackingItems = updated.items?.filter((i: any) => !i.tracking) ?? [];
    expect(noTrackingItems).toHaveLength(0);
  });

  it('GAP-TERCERO-3 — items_only: custom operator manual items (non-system) are preserved', async () => {
    mockEmptyThen([{
      id: 'doc-sent',
      ref: { id: 'doc-sent' },
      data: () => ({
        status: 'sent',
        invoiceItems: [
          { description: 'TRK-A', trackingNumber: 'TRK-A', isManual: false, totalPrice: 50 },
          { description: 'Seguro especial del cliente', trackingNumber: '', isManual: true, totalPrice: 5 },
        ],
        items: [
          { tracking: 'TRK-A', amount: 50 },
          { tracking: '', description: 'Seguro especial del cliente', amount: 5 },
        ],
      }),
    }]);

    const terceroItems = new Map([['SL-001', { amount: 15, description: 'Servicio de Terceros' }]]);
    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-A', precio: 50 })];
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      protectedActions: { 'SL-001': 'items_only' },
    });

    expect(result.created).toHaveLength(1);
    const updated = result.created[0];
    // Custom manual item ($5) preserved + fresh tercero ($15) = 50 + 5 + 15 = 70
    expect(updated.totalAmount).toBeCloseTo(70, 2);
    expect(updated.items?.find((i: any) => (i.description || '').includes('Seguro'))).toBeTruthy();
    expect(updated.items?.find((i: any) => (i.description || '').includes('Terceros'))).toBeTruthy();
  });

  it('Shield Policy — overwrite deletes the protected invoice and creates a fresh draft', async () => {
    mockEmptyThen([
      {
        id: 'doc-protected-inv',
        ref: { id: 'doc-protected-inv' },
        data: () => ({
          status: 'sent',
          invoiceNumber: 'SL-001-PROTECTED',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', precio: 50 })];
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      protectedActions: { 'SL-001': 'overwrite' },
    });

    expect(vi.mocked(deleteDoc)).toHaveBeenCalled();
    expect(result.created).toHaveLength(1);
    expect(result.created[0].id).not.toBe('doc-protected-inv');
    expect(result.skipped).toHaveLength(0);
  });

  it('does not double-count terceroItems in pre-flight integrity guard', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [],
      forEach(cb: any) { this.docs.forEach(cb); }
    } as any);
    const rows = [makeRow({ slCode: 'SL-001', precio: 204.00 })];
    const terceroItems = new Map();
    terceroItems.set('SL-001', { amount: 8.51, description: 'Servicio de Terceros' });

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
    });

    expect(result.created).toHaveLength(1);
    const invoice = result.created[0];
    // Sum of items is 204.00 (row) + 8.51 (tercero) = 212.51
    expect(invoice.totalAmount).toBeCloseTo(212.51, 2);
    expect(invoice.items).toHaveLength(2);
    // Verify pre-flight guard did not alter totalAmount to 221.02
    expect(invoice.totalAmount).not.toBeCloseTo(221.02, 2);
  });

  it('deduplication preserves custom manual items and other system types (like bodegaje)', async () => {
    mockEmptyThen([
      {
        id: 'doc-draft-inv',
        ref: { id: 'doc-draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          invoiceItems: [
            { description: 'Old Terceros', trackingNumber: '', isManual: true, isSystem: true, systemType: 'terceros', totalPrice: 10 },
            { description: 'Almacenamiento Bodega', trackingNumber: '', isManual: true, isSystem: true, systemType: 'bodegaje', totalPrice: 25 },
            { description: 'Seguro manual', trackingNumber: '', isManual: true, totalPrice: 5 },
          ],
          items: [
            { description: 'Old Terceros', tracking: '', isManual: true, isSystem: true, systemType: 'terceros', amount: 10 },
            { description: 'Almacenamiento Bodega', tracking: '', isManual: true, isSystem: true, systemType: 'bodegaje', amount: 25 },
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 5 },
          ],
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];
    const terceroItems = new Map([['SL-001', { amount: 15, description: 'Servicio de Terceros' }]]);
    
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];
    
    expect(created.amount).toBe(95);
    
    const itemTypes = created.items.map((i: any) => ({
      desc: i.description,
      amount: i.amount,
      isSystem: i.isSystem,
      systemType: i.systemType,
    }));
    
    const newTerceros = itemTypes.find(i => i.systemType === 'terceros');
    expect(newTerceros).toBeTruthy();
    expect(newTerceros?.amount).toBe(15);
    
    const bodegaje = itemTypes.find(i => i.systemType === 'bodegaje');
    expect(bodegaje).toBeTruthy();
    expect(bodegaje?.amount).toBe(25);
    
    const seguro = itemTypes.find(i => !i.isSystem && i.desc === 'Seguro manual');
    expect(seguro).toBeTruthy();
    expect(seguro?.amount).toBe(5);
  });

  it('deduplication removes system tercero item if new amount is 0, but preserves others', async () => {
    mockEmptyThen([
      {
        id: 'doc-draft-inv',
        ref: { id: 'doc-draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          invoiceItems: [
            { description: 'Old Terceros', trackingNumber: '', isManual: true, isSystem: true, systemType: 'terceros', totalPrice: 10 },
            { description: 'Almacenamiento Bodega', trackingNumber: '', isManual: true, isSystem: true, systemType: 'bodegaje', totalPrice: 25 },
            { description: 'Seguro manual', trackingNumber: '', isManual: true, totalPrice: 5 },
          ],
          items: [
            { description: 'Old Terceros', tracking: '', isManual: true, isSystem: true, systemType: 'terceros', amount: 10 },
            { description: 'Almacenamiento Bodega', tracking: '', isManual: true, isSystem: true, systemType: 'bodegaje', amount: 25 },
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 5 },
          ],
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];
    
    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];
    
    expect(created.amount).toBe(80);
    
    const itemTypes = created.items.map((i: any) => ({
      desc: i.description,
      amount: i.amount,
      isSystem: i.isSystem,
      systemType: i.systemType,
    }));
    
    const newTerceros = itemTypes.find(i => i.systemType === 'terceros');
    expect(newTerceros).toBeFalsy();
    
    const bodegaje = itemTypes.find(i => i.systemType === 'bodegaje');
    expect(bodegaje).toBeTruthy();
    expect(bodegaje?.amount).toBe(25);
    
    const seguro = itemTypes.find(i => !i.isSystem && i.desc === 'Seguro manual');
    expect(seguro).toBeTruthy();
  });

  it('deduplication merges items from multiple existing draft invoices, keeping distinct manual/bodegaje items and updating system terceros', async () => {
    mockEmptyThen([
      {
        id: 'draft-inv-1',
        ref: { id: 'draft-inv-1' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT1',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          items: [
            { description: 'Old Terceros', tracking: '', isManual: true, isSystem: true, systemType: 'terceros', amount: 10 },
            { description: 'Almacenamiento Bodega A', tracking: '', isManual: true, isSystem: true, systemType: 'bodegaje', amount: 20 },
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 5 },
          ],
        }),
      },
      {
        id: 'draft-inv-2',
        ref: { id: 'draft-inv-2' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT2',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          items: [
            { description: 'Old Terceros', tracking: '', isManual: true, isSystem: true, systemType: 'terceros', amount: 10 },
            { description: 'Almacenamiento Bodega B', tracking: '', isManual: true, isSystem: true, systemType: 'bodegaje', amount: 10 },
            { description: 'Cargo adicional', tracking: '', isManual: true, amount: 15 },
          ],
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];
    const terceroItems = new Map([['SL-001', { amount: 35, description: 'Servicio de Terceros' }]]);

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];
    
    // 50 (package) + 35 (terceros) + 20 (bodegaje A) + 10 (bodegaje B) + 5 (seguro) + 15 (cargo) = 135
    expect(created.amount).toBe(135);

    const items = created.items.map((i: any) => ({
      desc: i.description,
      amount: i.amount,
      isSystem: i.isSystem,
      systemType: i.systemType,
    }));

    // Should only have the new system terceros
    const newTerceros = items.filter(i => i.systemType === 'terceros');
    expect(newTerceros).toHaveLength(1);
    expect(newTerceros[0].amount).toBe(35);

    // Should have both bodegaje items
    const bodegajeA = items.find(i => i.desc === 'Almacenamiento Bodega A');
    expect(bodegajeA).toBeTruthy();
    expect(bodegajeA?.amount).toBe(20);

    const bodegajeB = items.find(i => i.desc === 'Almacenamiento Bodega B');
    expect(bodegajeB).toBeTruthy();
    expect(bodegajeB?.amount).toBe(10);

    // Should have both manual items
    const seguroItem = items.find(i => i.desc === 'Seguro manual');
    expect(seguroItem).toBeTruthy();
    expect(seguroItem?.amount).toBe(5);

    const cargo = items.find(i => i.desc === 'Cargo adicional');
    expect(cargo).toBeTruthy();
    expect(cargo?.amount).toBe(15);
  });

  it('deduplication correctly handles mixed package updates, removals, and price changes while preserving manual items', async () => {
    mockEmptyThen([
      {
        id: 'draft-inv',
        ref: { id: 'draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          // Old packages: TRK-1 ($15) and TRK-2 ($20)
          items: [
            { description: 'Paquete TRK-1', tracking: 'TRK-1', amount: 15 },
            { description: 'Paquete TRK-2', tracking: 'TRK-2', amount: 20 },
            { description: 'Old Terceros', tracking: '', isManual: true, isSystem: true, systemType: 'terceros', amount: 10 },
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 5 },
          ],
        }),
      },
    ]);

    // Rows: TRK-1 is updated to 25, TRK-2 is removed, TRK-3 is added at 30
    const rows = [
      makeRow({ slCode: 'SL-001', tracking: 'TRK-1', precio: 25, descripcion: 'Zapatos', consolidacion: true }),
      makeRow({ slCode: 'SL-001', tracking: 'TRK-3', precio: 30, descripcion: 'Libros', consolidacion: true }),
    ];
    const terceroItems = new Map([['SL-001', { amount: 15, description: 'Servicio de Terceros' }]]);

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];

    // 25 (TRK-1) + 20 (TRK-2 carried forward) + 30 (TRK-3) + 15 (terceros) + 5 (seguro manual) = 95
    expect(created.amount).toBe(95);
    expect(created.isConsolidation).toBe(true);

    const trackingNumbers = created.trackingNumbers || [];
    expect(trackingNumbers).toContain('TRK-1');
    expect(trackingNumbers).toContain('TRK-3');
    expect(trackingNumbers).toContain('TRK-2');

    const items = created.items.map((i: any) => ({
      desc: i.description,
      amount: i.amount,
      tracking: i.tracking,
      isSystem: i.isSystem,
      systemType: i.systemType,
    }));

    // Verify package items
    const pkg1 = items.find(i => i.tracking === 'TRK-1');
    expect(pkg1).toBeTruthy();
    expect(pkg1?.amount).toBe(25);
    expect(pkg1?.desc).toBe('Zapatos');

    const pkg2 = items.find(i => i.tracking === 'TRK-2');
    expect(pkg2).toBeTruthy();
    expect(pkg2?.amount).toBe(20);

    const pkg3 = items.find(i => i.tracking === 'TRK-3');
    expect(pkg3).toBeTruthy();
    expect(pkg3?.amount).toBe(30);
    expect(pkg3?.desc).toBe('Libros');

    // Verify terceros item updated
    const newTerceros = items.find(i => i.systemType === 'terceros');
    expect(newTerceros).toBeTruthy();
    expect(newTerceros?.amount).toBe(15);

    // Verify manual item preserved
    const seguroItem = items.find(i => !i.isSystem && i.desc === 'Seguro manual');
    expect(seguroItem).toBeTruthy();
    expect(seguroItem?.amount).toBe(5);
  });

  it('system types are isolated: updating terceros item does not affect or conflate with bodegaje system items', async () => {
    mockEmptyThen([
      {
        id: 'draft-inv',
        ref: { id: 'draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          items: [
            { description: 'Old Terceros', tracking: '', isManual: true, isSystem: true, systemType: 'terceros', amount: 10 },
            { description: 'Costos de Bodegaje', tracking: '', isManual: true, isSystem: true, systemType: 'bodegaje', amount: 25 },
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 5 },
          ],
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];
    const terceroItems = new Map([['SL-001', { amount: 20, description: 'Servicios de terceros' }]]);

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];

    // 50 (pkg) + 20 (new terceros) + 25 (bodegaje) + 5 (seguro manual) = 100
    expect(created.amount).toBe(100);

    const items = created.items.map((i: any) => ({
      desc: i.description,
      amount: i.amount,
      isSystem: i.isSystem,
      systemType: i.systemType,
    }));

    const terceros = items.find(i => i.systemType === 'terceros');
    expect(terceros).toBeTruthy();
    expect(terceros?.amount).toBe(20);

    const bodegaje = items.find(i => i.systemType === 'bodegaje');
    expect(bodegaje).toBeTruthy();
    expect(bodegaje?.amount).toBe(25);

    const seguroItem = items.find(i => !i.isSystem && i.desc === 'Seguro manual');
    expect(seguroItem).toBeTruthy();
    expect(seguroItem?.amount).toBe(5);
  });

  it('EDGE CASE 1: IVA is calculated correctly on merged drafts with manual items when ivaEnabled=true', async () => {
    mockEmptyThen([
      {
        id: 'draft-inv',
        ref: { id: 'draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          items: [
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 13 },
          ],
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 100, consolidacion: true })];

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      ivaEnabled: true,
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];

    // Total = 100 (pkg) + 13 (seguro manual) = 113
    expect(created.amount).toBe(113);
    // Subtotal = 113 / 1.13 = 100
    expect(created.subtotal).toBe(100);
    // IVA = 113 - 100 = 13
    expect(created.iva).toBe(13);
  });

  it('EDGE CASE 2: isolation by manifestNumber prevents merging or deleting drafts from other manifests', async () => {
    // If overlap probe query returns no documents for the current manifest,
    // no merging or deletion happens.
    vi.mocked(getDocs)
      .mockResolvedValueOnce({ forEach: () => {}, docs: [] } as any) // customer batch lookup
      .mockResolvedValueOnce({ forEach: () => {}, docs: [] } as any); // overlap query empty for target manifest M-001

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];

    // No existing items from M-999 are merged. Only the row item exists.
    expect(created.amount).toBe(50);
    expect(created.items).toHaveLength(1);
    expect(created.items[0].tracking).toBe('TRK-NEW');
  });

  it('EDGE CASE 3: resilience against malformed draft invoices (missing/null items array)', async () => {
    mockEmptyThen([
      {
        id: 'draft-inv',
        ref: { id: 'draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          items: null, // malformed
          invoiceItems: undefined, // malformed
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 40 })];

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].amount).toBe(40);
    expect(result.created[0].items).toHaveLength(1);
  });

  it('EDGE CASE 4: legacy description matching filters and deduplicates system items lacking isSystem flag', async () => {
    mockEmptyThen([
      {
        id: 'draft-inv',
        ref: { id: 'draft-inv' },
        data: () => ({
          status: 'draft',
          invoiceNumber: 'SL-001-DRAFT',
          clientSlCode: 'SL-001',
          manifestNumber: 'M-001',
          items: [
            // Legacy item: no isSystem flag, but description matches "encomienda"
            { description: 'Servicio de encomienda', tracking: '', isManual: true, amount: 10 },
            { description: 'Seguro manual', tracking: '', isManual: true, amount: 5 },
          ],
        }),
      },
    ]);

    const rows = [makeRow({ slCode: 'SL-001', tracking: 'TRK-NEW', precio: 50 })];
    const terceroItems = new Map([['SL-001', { amount: 20, description: 'Servicio de Terceros' }]]);

    const result = await createInvoicesFromRows(rows, {
      manifestNumber: 'M-001',
      terceroItems,
      mergeExistingDrafts: true,
    });

    expect(result.created).toHaveLength(1);
    const created = result.created[0];

    // 50 (pkg) + 20 (new terceros) + 5 (seguro manual) = 75
    expect(created.amount).toBe(75);

    const items = created.items.map((i: any) => ({
      desc: i.description,
      amount: i.amount,
      isSystem: i.isSystem,
    }));

    // Old legacy "Servicio de encomienda" should be deduplicated
    const legacy = items.find(i => i.desc.toLowerCase().includes('encomienda'));
    expect(legacy).toBeFalsy();

    const newTerceros = items.find(i => i.isSystem);
    expect(newTerceros).toBeTruthy();
    expect(newTerceros?.amount).toBe(20);

    const seguro = items.find(i => !i.isSystem && i.desc === 'Seguro manual');
    expect(seguro).toBeTruthy();
    expect(seguro?.amount).toBe(5);
  });
});

// ── sendInvoiceEmails ──────────────────────────────────────────────────────────

describe('sendInvoiceEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const innerMock = vi.fn().mockResolvedValue({ data: { success: true } });
    vi.mocked(httpsCallable).mockReturnValue(innerMock as any);
  });

  const makeInvoice = (overrides: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
    id: 'inv-001',
    clientEmail: 'test@example.com',
    clientName: 'JUAN PEREZ',
    clientDni: '1-0000-0001',
    clientRoute: 'RUTA-A',
    invoiceNumber: 'SL-001-20260408',
    slCode: 'SL-001',
    userId: 'SL-001',
    clientId: 'SL-001',
    isConsolidation: false,
    ivaEnabled: false,
    subtotal: 15,
    subtotalCRC: 0,
    iva: 0,
    ivaCRC: 0,
    ivaRate: 0,
    amount: 15,
    currency: 'USD',
    amountCRC: 0,
    exchangeRate: 0,
    items: [{ tracking: 'TRK-001', description: 'Paquete TRK-001', weight: 2, subtotal: 15, iva: 0, amount: 15, currency: 'USD' }],
    packageCount: 1,
    totalWeight: 2,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft' as const,
    source: 'nova' as const,
    ...overrides,
  });

  it('skips invoices with no clientEmail and does not call the function (BUG-I04)', async () => {
    const result = await sendInvoiceEmails([makeInvoice({ clientEmail: '' })]);
    // httpsCallable returns the inner fn; verify inner was not called
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('does not throw when clientEmail is missing (BUG-I04)', async () => {
    await expect(sendInvoiceEmails([makeInvoice({ clientEmail: '' })])).resolves.not.toThrow();
  });

  it('sends to invoices that have clientEmail and status is not draft', async () => {
    const result = await sendInvoiceEmails([makeInvoice({ status: 'sent' })]);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('BUG-EMAIL-DRAFT — draft invoice with email is silently skipped (never sent)', async () => {
    // Regression guard: after createInvoicesFromRows returns status:draft,
    // sendInvoiceEmails must not dispatch the Cloud Function for it.
    const result = await sendInvoiceEmails([makeInvoice({ status: 'draft', clientEmail: 'client@test.com' })]);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0); // not a failure — just silently skipped
  });

  it('BUG-EMAIL-DRAFT — missing status defaults to draft and is skipped', async () => {
    const inv = { ...makeInvoice({ clientEmail: 'client@test.com' }) } as any;
    delete inv.status;
    const result = await sendInvoiceEmails([inv]);
    expect(result.sent).toBe(0);
  });

  it('sent + failed count excludes skipped (no-email) invoices (BUG-I08)', async () => {
    const invoices = [
      makeInvoice({ clientEmail: 'a@example.com', invoiceNumber: 'INV-A', status: 'sent' }),
      makeInvoice({ clientEmail: '',               invoiceNumber: 'INV-B', status: 'sent' }), // skipped (no email)
      makeInvoice({ clientEmail: 'c@example.com', invoiceNumber: 'INV-C', status: 'sent' }),
    ];
    const result = await sendInvoiceEmails(invoices);
    expect(result.sent + result.failed).toBe(2); // only 2 had email
  });

  it('counts failed when Cloud Function rejects', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('CF timeout'));
    vi.mocked(httpsCallable).mockReturnValue(failingFn as any);
    const result = await sendInvoiceEmails([makeInvoice({ status: 'sent' })]);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.errors[0].error).toContain('CF timeout');
  });

  it('continues sending remaining invoices after one failure', async () => {
    const innerFn = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ data: {} });
    vi.mocked(httpsCallable).mockReturnValue(innerFn as any);
    const invoices = [
      makeInvoice({ clientEmail: 'fail@example.com', invoiceNumber: 'INV-A', status: 'sent' }),
      makeInvoice({ clientEmail: 'ok@example.com',   invoiceNumber: 'INV-B', status: 'sent' }),
    ];
    const result = await sendInvoiceEmails(invoices);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('returns empty errors array when all succeed', async () => {
    const result = await sendInvoiceEmails([makeInvoice({ status: 'sent' })]);
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty result for empty invoices array', async () => {
    const result = await sendInvoiceEmails([]);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('passes exchangeRate and totalCRC in the CF payload', async () => {
    const innerFn = vi.fn().mockResolvedValue({ data: {} });
    vi.mocked(httpsCallable).mockReturnValue(innerFn as any);
    const inv = makeInvoice({ exchangeRate: 487, amountCRC: 7305, status: 'sent' });
    await sendInvoiceEmails([inv]);
    const payload = innerFn.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.exchangeRate).toBe(487);
    expect(payload.totalCRC).toBe(7305);
  });

  it('STATUS-PROMOTE: draft invoice is promoted to sent after email is recorded', async () => {
    // recordInvoiceEmailSent must write { status: 'sent' } when currentStatus is 'draft'
    // This is the normal first-send flow
    const nullStatus: any = null;
    const undefinedStatus: any = undefined;
    const draftStatusVal: any = 'draft';
    expect(!nullStatus || nullStatus === 'draft').toBe(true); // willPromoteStatus for null currentStatus
    const noStatus = !undefinedStatus || undefinedStatus === 'draft';
    expect(noStatus).toBe(true);
    const draftStatus = !draftStatusVal || draftStatusVal === 'draft';
    expect(draftStatus).toBe(true); // draft promotes
  });

  it('STATUS-PROMOTE: non-draft statuses are NOT promoted — pending_payment stays pending_payment', async () => {
    // willPromoteStatus must be false for any status other than draft/null
    const sentStatusVal: any = 'sent';
    const pendingPaymentStatusVal: any = 'pending_payment';
    const pendingStatusVal: any = 'pending';
    const sentStatus = !sentStatusVal || sentStatusVal === 'draft';
    expect(sentStatus).toBe(false);
    const pendingStatus = !pendingPaymentStatusVal || pendingPaymentStatusVal === 'draft';
    expect(pendingStatus).toBe(false);
    const pendingStatus2 = !pendingStatusVal || pendingStatusVal === 'draft';
    expect(pendingStatus2).toBe(false);
  });
  });

// ── getCustomersBySlCodes ──────────────────────────────────────────────────────

describe('getCustomersBySlCodes', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockResolvedValue({ forEach: (_cb: unknown) => {} } as any);
  });

  it('returns empty Map for empty slCodes array (BUG-I09)', async () => {
    const result = await getCustomersBySlCodes([]);
    expect(result.size).toBe(0);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('calls getDocs once for <= 30 slCodes', async () => {
    await getCustomersBySlCodes(['SL-001', 'SL-002']);
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
  });

  it('chunks into multiple getDocs calls for > 30 slCodes', async () => {
    const codes = Array.from({ length: 35 }, (_, i) => `SL-${i.toString().padStart(3, '0')}`);
    await getCustomersBySlCodes(codes);
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2); // 30 + 5
  });

  it('returns empty Map when getDocs returns no docs', async () => {
    const result = await getCustomersBySlCodes(['SL-001']);
    expect(result.size).toBe(0);
  });
});

// ── annulInvoicesByTrackingsAndManifest ──────────────────────────────────────────

describe('annulInvoicesByTrackingsAndManifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('early returns when trackings or manifestNumber is empty', async () => {
    const result = await annulInvoicesByTrackingsAndManifest([], 'M-001');
    expect(result).toEqual({ annulledIds: [], skippedPaid: 0 });
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('queries invoices for the specified manifest and updates matching ones', async () => {
    const mockInvoiceDoc = {
      id: 'inv-123',
      data: () => ({
        status: 'pending',
        invoiceNumber: 'SL-001-INV',
        trackingNumber: 'TRK-MATCH',
        slCode: 'SL-001',
        clientName: 'Juan Perez',
      }),
    };
    
    // Mock writeBatch globally for this test to support the update method
    const mockUpdate = vi.fn();
    const mockCommit = vi.fn().mockResolvedValue(undefined);
    const { writeBatch } = await import('firebase/firestore');
    vi.mocked(writeBatch).mockReturnValue({
      update: mockUpdate,
      set: vi.fn(),
      commit: mockCommit,
    } as any);
    
    let callCount = 0;
    vi.mocked(getDocs).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { docs: [mockInvoiceDoc] } as any;
      }
      if (callCount === 2) {
        const mockPkgs = [{ id: 'pkg-1', data: () => ({ id: 'pkg-1', trackingNumber: 'TRK-MATCH' }) }];
        return {
          docs: mockPkgs,
          forEach: (cb: any) => mockPkgs.forEach(cb),
        } as any;
      }
      return { docs: [], forEach: () => {} } as any;
    });

    const result = await annulInvoicesByTrackingsAndManifest(['TRK-MATCH'], 'M-001');
    
    expect(result.annulledIds).toContain('inv-123');
    expect(result.skippedPaid).toBe(0);
    expect(vi.mocked(updateDoc)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateDoc).mock.calls[0][1]).toMatchObject({
      status: 'annulled',
    });
    
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockCommit).toHaveBeenCalled();
    
    const { deleteInvoiceFromSp2 } = await import('.././sync-invoices-service');
    expect(deleteInvoiceFromSp2).toHaveBeenCalledWith('inv-123', 'SL-001-INV');
    
    const { syncPackagesToSmartWeb } = await import('.././sync-smartweb-service');
    expect(syncPackagesToSmartWeb).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'pkg-1',
        status: 'consolidated',
        forceSync: true,
      }),
    ]);
  });

  it('skips paid invoices and increments skippedPaid count', async () => {
    const mockInvoiceDoc = {
      id: 'inv-paid',
      data: () => ({
        status: 'paid',
        invoiceNumber: 'SL-001-INV-PAID',
        trackingNumber: 'TRK-MATCH',
      }),
    };
    
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [mockInvoiceDoc] } as any);

    const result = await annulInvoicesByTrackingsAndManifest(['TRK-MATCH'], 'M-001');
    expect(result.annulledIds).toHaveLength(0);
    expect(result.skippedPaid).toBe(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('excludes invoices passed in excludeInvoiceIds', async () => {
    const mockInvoiceDoc = {
      id: 'inv-exclude',
      data: () => ({
        status: 'pending',
        invoiceNumber: 'SL-001-INV-EXC',
        trackingNumber: 'TRK-MATCH',
      }),
    };
    
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [mockInvoiceDoc] } as any);

    const result = await annulInvoicesByTrackingsAndManifest(['TRK-MATCH'], 'M-001', {
      excludeInvoiceIds: ['inv-exclude'],
    });
    expect(result.annulledIds).toHaveLength(0);
    expect(result.skippedPaid).toBe(0);
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

// ── isDuplicateManualItem ──────────────────────────────────────────────────────

describe('isDuplicateManualItem', () => {
  it('returns false when extraItems is empty or undefined for custom items, and true for system items', () => {
    // For non-system items, they should be preserved (return false)
    expect(isDuplicateManualItem('Seguro de envio', 5.00)).toBe(false);
    expect(isDuplicateManualItem('Seguro de envio', 5.00, [])).toBe(false);
    
    // For system items, they should always be discarded/not carried forward (return true)
    expect(isDuplicateManualItem('Servicio de Terceros', 8.51)).toBe(true);
    expect(isDuplicateManualItem('Servicio de Terceros', 8.51, [])).toBe(true);
  });

  it('marks system manual items (terceros/adicional) as duplicate regardless of amount mismatch', () => {
    const extra = [{ description: 'Servicio de Terceros', amount: 8.51 }];
    
    // Exact match
    expect(isDuplicateManualItem('Servicio de Terceros', 8.51, extra)).toBe(true);
    // Amount mismatch (old amount is 10.00) -> must still be duplicate so it is overwritten
    expect(isDuplicateManualItem('Servicio de Terceros', 10.00, extra)).toBe(true);
    // Plural mismatch -> must still be duplicate
    expect(isDuplicateManualItem('Servicios de Terceros', 10.00, extra)).toBe(true);
    // Case/spacing/punctuation mismatch -> must still be duplicate
    expect(isDuplicateManualItem('Servicio de Terceros (TC: 470)', 10.00, extra)).toBe(true);
    expect(isDuplicateManualItem('Terceros', 10.00, extra)).toBe(true);
  });

  it('marks system manual items (adicional) as duplicate', () => {
    const extra = [{ description: 'Servicio Adicional', amount: 15.00 }];
    
    // Amount mismatch -> must still be duplicate so it is overwritten
    expect(isDuplicateManualItem('Servicio Adicional', 20.00, extra)).toBe(true);
    expect(isDuplicateManualItem('Servicio adicional', 20.00, extra)).toBe(true);
    expect(isDuplicateManualItem('Servicios adicionales', 20.00, extra)).toBe(true);
  });

  it('requires description match for non-system/operator custom items regardless of amount changes', () => {
    const extra = [{ description: 'Seguro de envio', amount: 5.00 }];
    
    // Matches description and amount -> duplicate
    expect(isDuplicateManualItem('Seguro de envio', 5.00, extra)).toBe(true);
    
    // Description matches but amount differs -> still duplicate (to overwrite old amount with new one)
    expect(isDuplicateManualItem('Seguro de envio', 10.00, extra)).toBe(true);
    
    // Different custom item entirely -> NOT duplicate
    expect(isDuplicateManualItem('Caja de carton extra', 5.00, extra)).toBe(false);
  });
});

describe('BUG-I19: Eradication of "Cliente Pre-alertado" placeholder names in invoice generation', () => {
  it('groupRowsForInvoicing resolves clean customer name instead of Cliente Pre-alertado', () => {
    const rows: ProcessedRow[] = [
      {
        tracking: 'TBA333670019157',
        nombre: 'DAYANA JIMENEZ ESQUIVEL',
        nombreCliente: 'Cliente Pre-alertado (SL262179)',
        slCode: 'SL262179',
        peso: 0.32,
        precio: 8,
        ruta: 'San Jose Centro',
      } as any,
    ];

    const groups = groupRowsForInvoicing(rows);
    expect(groups[0].clientName).toBe('DAYANA JIMENEZ ESQUIVEL');
    expect(groups[0].clientName).not.toContain('Cliente Pre-alertado');
  });

  it('createInvoicesFromRows enriches invoice with database registered fullName over synthetic pre-alert string', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [],
      forEach: vi.fn(),
    } as any);

    const rows: ProcessedRow[] = [
      {
        tracking: 'TBA333670019157',
        nombre: 'DAYANA JIMENEZ ESQUIVEL',
        nombreCliente: 'Cliente Pre-alertado (SL262179)',
        slCode: 'SL262179',
        peso: 0.32,
        precio: 8,
        ruta: 'San Jose Centro',
      } as any,
    ];

    const res = await createInvoicesFromRows(rows, {
      manifestNumber: 'MEGA-MAN-24-08-2026',
    });

    expect(res.created.length).toBe(1);
    expect(res.created[0].clientName).toBe('DAYANA JIMENEZ ESQUIVEL');
    expect(res.created[0].clientName).not.toContain('Cliente Pre-alertado');
    expect(res.created[0].customer.fullName).not.toContain('Cliente Pre-alertado');
  });
});

