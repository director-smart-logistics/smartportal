/**
 * Manifest Learning Service — Unit Tests
 *
 * Tests bug detection, improvement suggestion logic, and Firestore persistence.
 * All Firebase and Cloud Function calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase/config', () => ({ db: {}, sp2App: {} }));

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => 'col-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'learning-record-id' }),
  doc:             vi.fn(() => 'doc-ref'),
  getDoc:          vi.fn().mockResolvedValue({ exists: () => false }),
  setDoc:          vi.fn().mockResolvedValue(undefined),
  increment:       vi.fn((n: number) => n),
  serverTimestamp: vi.fn(() => 'mock-ts'),
}));

vi.mock('firebase/functions', () => ({
  getFunctions:    vi.fn(() => ({})),
  httpsCallable:   vi.fn(() => vi.fn().mockResolvedValue({ data: { success: true } })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import type { ProcessingResult } from '.././manifest-processor';
import type { ManifestRow } from '.././manifest-processor';

function makeRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    tracking:           'TRK-001',
    nombre:             'JUAN PEREZ',
    guia:               '',
    manifiesto:         'M001',
    peso:               1.5,
    precio:             12,
    precioSinPermiso:   12,
    precioConPermiso:   15,
    slCode:             'SL-001',
    nombreCliente:      'JUAN PEREZ',
    ruta:               'RUTA-A',
    consolidacion:      false,
    descripcion:        '',
    permisos:           false,
    pesoRedondeo:       2,
    diferenciaRedondeo: 0.5,
    pesoConsolidacion:  0,
    matchScore:         0,
    originalData:       {},
    ...overrides,
  };
}

function makeResult(overrides: Partial<ProcessingResult> = {}): ProcessingResult {
  return {
    rows:              [makeRow()],
    summary:           { totalRows: 1, processedRows: 1, errors: 0, totalPrice: 12, customersMatched: 1, namesCorrections: 0, weightCorrections: 0 },
    manifestNumber:    'M001',
    manifestType:      'usa_air',
    corrections:       [],
    validation:        { isValid: true, issues: [], suggestions: [] },
    multiMatchRows:    [],
    requiresUserChoice: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('recordManifestLearning', () => {
  beforeEach(() => vi.clearAllMocks());

  it('completes without throwing on a clean result', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    await expect(recordManifestLearning(makeResult(), 'user-1')).resolves.not.toThrow();
  });

  it('persists to Firestore (addDoc called)', async () => {
    const { addDoc } = await import('firebase/firestore') as any;
    const { recordManifestLearning } = await import('.././manifest-learning-service');

    await recordManifestLearning(makeResult(), 'user-1');
    expect(addDoc).toHaveBeenCalled();
  });

  it('calls httpsCallable to fire the email function', async () => {
    const functionsModule = await import('firebase/functions') as any;
    const { recordManifestLearning } = await import('.././manifest-learning-service');

    await recordManifestLearning(makeResult(), 'user-1');
    expect(functionsModule.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'slManifestReport');
  });
});

// ── Bug detection ──────────────────────────────────────────────────────────────

describe('Bug detection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('B001 — detects unmatched rows when slCode is empty', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [makeRow({ slCode: '' }), makeRow({ slCode: '' }), makeRow({ slCode: 'SL-001' })],
      summary: { totalRows: 3, processedRows: 3, errors: 0, totalPrice: 36, customersMatched: 1, namesCorrections: 0, weightCorrections: 0 },
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    const unmatchedBug = savedRecord.bugs.find((b: any) => b.id === 'B001');
    expect(unmatchedBug).toBeDefined();
    expect(unmatchedBug.affectedRows).toBe(2);
  });

  it('B003 — detects zero-price rows with non-zero weight', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [makeRow({ precio: 0, peso: 1.5 })],
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    const priceBug = savedRecord.bugs.find((b: any) => b.id === 'B003');
    expect(priceBug).toBeDefined();
    expect(priceBug.severity).toBe('critical');
  });

  it('B004 — detects duplicate names', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [
        makeRow({ nombre: 'MARIA GONZALEZ', tracking: 'TRK-001' }),
        makeRow({ nombre: 'MARIA GONZALEZ', tracking: 'TRK-002' }),
        makeRow({ nombre: 'PEDRO ALVARADO', tracking: 'TRK-003' }),
      ],
      summary: { totalRows: 3, processedRows: 3, errors: 0, totalPrice: 36, customersMatched: 3, namesCorrections: 0, weightCorrections: 0 },
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    const dupBug = savedRecord.bugs.find((b: any) => b.id === 'B004');
    expect(dupBug).toBeDefined();
    expect(dupBug.examples).toContain('MARIA GONZALEZ (×2)');
  });

  it('B005 — detects matched customers without route (por_definir)', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [makeRow({ slCode: 'SL-001', ruta: 'Por definir' })],
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    const routeBug = savedRecord.bugs.find((b: any) => b.id === 'B005');
    expect(routeBug).toBeDefined();
  });

  it('no bugs when all rows are clean', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    await recordManifestLearning(makeResult(), 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    const criticalBugs = savedRecord.bugs.filter((b: any) => b.severity === 'critical');
    expect(criticalBugs.length).toBe(0);
  });
});

// ── Stats calculation ──────────────────────────────────────────────────────────

describe('Stats calculation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculates matchRate correctly', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [
        makeRow({ slCode: 'SL-001' }),
        makeRow({ slCode: 'SL-002' }),
        makeRow({ slCode: '' }),
        makeRow({ slCode: '' }),
      ],
      summary: { totalRows: 4, processedRows: 4, errors: 0, totalPrice: 48, customersMatched: 2, namesCorrections: 0, weightCorrections: 0 },
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    expect(savedRecord.matchRate).toBe(50);
  });

  it('calculates avgPricePerRow correctly', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [makeRow({ precio: 12 }), makeRow({ precio: 24 })],
      summary: { totalRows: 2, processedRows: 2, errors: 0, totalPrice: 36, customersMatched: 2, namesCorrections: 0, weightCorrections: 0 },
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    expect(savedRecord.avgPricePerRow).toBe(18);
  });
});

// ── Improvement suggestions ────────────────────────────────────────────────────

describe('Improvement suggestions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('I001 — suggests adding unmatched customers when match rate < 100%', async () => {
    const { recordManifestLearning } = await import('.././manifest-learning-service');
    const { addDoc } = await import('firebase/firestore') as any;

    const result = makeResult({
      rows: [makeRow({ slCode: '' })],
      summary: { totalRows: 1, processedRows: 1, errors: 0, totalPrice: 0, customersMatched: 0, namesCorrections: 0, weightCorrections: 0 },
    });

    await recordManifestLearning(result, 'user-1');

    const savedRecord = addDoc.mock.calls[0][1];
    const improvement = savedRecord.improvements.find((i: any) => i.id === 'I001');
    expect(improvement).toBeDefined();
    expect(improvement.impact).toBe('high');
  });
});
