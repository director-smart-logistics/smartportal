// @vitest-environment jsdom
/**
 * use-nova-resolved-rows.spec.ts
 *
 * Round-trip persistence tests for the Nova override-resolution pipeline.
 *
 * ─── Why these tests exist ────────────────────────────────────────────────────
 *  `buildResolvedRows` is the single source of truth for what gets persisted
 *  to Firestore when the operator clicks "Guardar en BD" inside NovaTableModal:
 *
 *      raw rows + UI overrides ──► buildResolvedRows ──► resolvedRows
 *                                                          │
 *                                  ┌───────────────────────┼───────────────────────┐
 *                                  ▼                       ▼                       ▼
 *                       ingestManifestToPackages   saveManifestRecord   saveEncomiendaManifestRows
 *                       (collection: packages)     (collection: manifests)  (collection: manifest_encomiendas)
 *
 *  All three persistence functions read `row.slCode`, `row.nombreCliente`,
 *  `row.ruta`, `row.precio`, `row.peso` — so if any override is dropped or
 *  mis-prioritised here, the operator's manual reassignments are silently
 *  lost across save/reload cycles.
 *
 *  This file freezes the contract:
 *    - `matchOverrides` and `slCodeOverrides` MUST surface as `row.slCode`
 *    - `matchOverrides.fullName` and `nameOverrides` MUST surface as `row.nombreCliente`
 *    - `slCodeOverrides.ruta` / `matchOverrides.ruta` / `rutaOverrides[slCode]` MUST surface as `row.ruta`
 *    - `priceOverrides.precio` and `pesoOverrides[idx]` MUST surface as `row.precio` / `row.peso`
 *    - `unlinkedRows` must drop the slCode (the row falls into the group-by-route bucket)
 *    - precedence order MUST be the documented one
 *
 *  Reproducer for the historical bug: operator linked "PAULA UMANA" → "ANA
 *  PAULA FONSECA QUADROS" (matchOverrides), saved, reloaded — the assignment
 *  was lost. Two distinct issues caused it:
 *    1. Reactive auto-rematch on load (fixed: skipAutoValidation flag).
 *    2. buildResolvedRows must reliably bake every override into the row that
 *       persistence sees. These tests prevent (2) from regressing.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// `calculatePrice` is imported by the hook for consolidated-billing math.
// We stub it so tests are deterministic and do not need full pricing tables.
vi.mock('@/lib/utils/pricing', () => ({
  calculatePrice: vi.fn(() => ({ price: 0, quoteRequired: true })),
}));

vi.mock('@/lib/services/match-learning', () => ({
  saveUnmatchedRouteLearning: vi.fn(async () => undefined),
}));

import { useNovaResolvedRows } from '.././use-nova-resolved-rows';
import type { ManifestRow, AjustePrecio } from '@/lib/services/manifest-processor';

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    tracking:           '1Z000000',
    nombre:             'PAULA UMANA',
    guia:               '1Z000000',
    manifiesto:         'MEGA-MAN-24-04-2026',
    peso:               1.5,
    precio:             18,
    slCode:             '',
    nombreCliente:      '',
    ruta:               '',
    consolidacion:      false,
    descripcion:        'ROPA',
    permisos:           false,
    pesoRedondeo:       0,
    diferenciaRedondeo: 0,
    pesoConsolidacion:  0,
    precioSinPermiso:   18,
    precioConPermiso:   18,
    matchScore:         0,
    originalData:       {},
    ...overrides,
  } as ManifestRow;
}

function buildResolved(
  rows: ManifestRow[],
  params: {
    unlinkedRows?:    Set<number>;
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }>;
    matchOverrides?:  Record<number, { slCode: string; fullName: string; ruta: string }>;
    rutaOverrides?:   Record<string, string>;
    nameOverrides?:   Record<number, string>;
    priceOverrides?:  Record<string, { precio: number; pesoRedondeo: number }>;
    pesoOverrides?:   Record<number, number>;
    computedPrices?:  number[];
    separateInvoices?: Record<string, boolean>;
    priceAdjustments?: Record<string, AjustePrecio>;
    customerContactMap?: Map<string, any>;
    preAlertsMap?: Map<string, any>;
  } = {},
) {
  const { result } = renderHook(() =>
    useNovaResolvedRows({
      resultDataRows:   rows,
      unlinkedRows:     params.unlinkedRows     ?? new Set(),
      slCodeOverrides:  params.slCodeOverrides  ?? {},
      matchOverrides:   params.matchOverrides   ?? {},
      rutaOverrides:    params.rutaOverrides    ?? {},
      nameOverrides:    params.nameOverrides    ?? {},
      priceOverrides:   params.priceOverrides   ?? {},
      pesoOverrides:    params.pesoOverrides    ?? {},
      computedPrices:   params.computedPrices   ?? [],
      separateInvoices: params.separateInvoices ?? {},
      manifestCountry:  'usa',
      manifestShipping: 'air',
      priceAdjustments:  params.priceAdjustments  ?? {},
      customerContactMap: params.customerContactMap,
      preAlertsMap:       params.preAlertsMap,
    })
  );
  return result.current.buildResolvedRows(rows);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('useNovaResolvedRows — slCode persistence (override → resolved row)', () => {
  it('bakes matchOverrides.slCode into row.slCode (no slCodeOverrides)', () => {
    const rows = [makeRow({ tracking: 'T1', nombre: 'PAULA UMANA' })];
    const matchOverrides = { 0: { slCode: 'SL3521', fullName: 'ANA PAULA FONSECA QUADROS', ruta: 'San Jose Centro' } };
    const out = buildResolved(rows, { matchOverrides });
    expect(out[0].slCode).toBe('SL3521');
    expect(out[0].nombreCliente).toBe('ANA PAULA FONSECA QUADROS');
    expect(out[0].ruta).toBe('San Jose Centro');
  });

  it('slCodeOverrides take precedence over matchOverrides for slCode', () => {
    const rows = [makeRow({ tracking: 'T1' })];
    const out = buildResolved(rows, {
      slCodeOverrides: { 0: { slCode: 'SL-NEW', ruta: 'San Jose Escazu' } },
      matchOverrides:  { 0: { slCode: 'SL-OLD', fullName: 'OLD NAME', ruta: 'San Jose Centro' } },
    });
    expect(out[0].slCode).toBe('SL-NEW');
    // nombreCliente still comes from matchOverrides.fullName when present
    expect(out[0].nombreCliente).toBe('OLD NAME');
  });

  it('falls back to row.slCode when no overrides are set', () => {
    const rows = [makeRow({ tracking: 'T1', slCode: 'SL-RAW', nombreCliente: 'RAW NAME' })];
    const out = buildResolved(rows, {});
    expect(out[0].slCode).toBe('SL-RAW');
    expect(out[0].nombreCliente).toBe('RAW NAME');
  });

  it('preserves SL-NAN-* (temp customer) slCodes through resolution', () => {
    // Reproduces the screenshot scenario: temp customer assigned via Acciones.
    const rows = [
      makeRow({ tracking: 'T1', nombre: 'KAREN CEDENO DURAN' }),
      makeRow({ tracking: 'T2', nombre: 'KAREN SUGEY MORA CHAVARRIA' }),
      makeRow({ tracking: 'T3', nombre: 'KAREN SUGEY MORA CHAVARRIA' }),
    ];
    const matchOverrides = {
      0: { slCode: 'SL-NAN-00009', fullName: 'KAREN CEDENO DURAN',         ruta: 'Encomiendas' },
      1: { slCode: 'SL-NAN-00020', fullName: 'KAREN SUGEY MORA CHAVARRIA', ruta: 'Encomiendas' },
      2: { slCode: 'SL-NAN-00020', fullName: 'KAREN SUGEY MORA CHAVARRIA', ruta: 'Encomiendas' },
    };
    const out = buildResolved(rows, { matchOverrides });
    expect(out[0].slCode).toBe('SL-NAN-00009');
    expect(out[1].slCode).toBe('SL-NAN-00020');
    expect(out[2].slCode).toBe('SL-NAN-00020');
    expect(out[0].nombreCliente).toBe('KAREN CEDENO DURAN');
    expect(out[1].nombreCliente).toBe('KAREN SUGEY MORA CHAVARRIA');
    expect(out[2].nombreCliente).toBe('KAREN SUGEY MORA CHAVARRIA');
  });
});

describe('useNovaResolvedRows — name resolution', () => {
  it('matchOverrides.fullName takes precedence over nameOverrides', () => {
    const rows = [makeRow({ tracking: 'T1' })];
    const out = buildResolved(rows, {
      matchOverrides: { 0: { slCode: 'SL1', fullName: 'FROM MATCH',  ruta: '' } },
      nameOverrides:  { 0: 'FROM NAME OVERRIDE' },
    });
    expect(out[0].nombreCliente).toBe('FROM MATCH');
  });

  it('nameOverrides used when no matchOverrides present', () => {
    const rows = [makeRow({ tracking: 'T1', slCode: 'SL1' })];
    const out = buildResolved(rows, {
      nameOverrides: { 0: 'FROM NAME OVERRIDE' },
    });
    expect(out[0].nombreCliente).toBe('FROM NAME OVERRIDE');
  });

  it('falls back to row.nombreCliente, then row.nombre', () => {
    const a = buildResolved([makeRow({ tracking: 'T1', nombreCliente: 'FROM ROW' })], {});
    expect(a[0].nombreCliente).toBe('FROM ROW');

    const b = buildResolved([makeRow({ tracking: 'T2', nombre: 'FROM RAW NAME', nombreCliente: '' })], {});
    expect(b[0].nombreCliente).toBe('FROM RAW NAME');
  });

  it('rejects "Cliente Pre-alertado" placeholder and resolves official registered name from customerContactMap', () => {
    const contactMap = new Map([
      ['SL262179', { slCode: 'SL262179', fullName: 'DAYANA MARIA JIMENEZ ESQUIVEL', email: 'daya@test.com', dni: '113260072' } as any]
    ]);
    const out = buildResolved(
      [makeRow({ tracking: 'TBA123', slCode: 'SL262179', nombreCliente: 'Cliente Pre-alertado (SL262179)', nombre: 'DAYANA JIMENEZ' })],
      { customerContactMap: contactMap }
    );
    expect(out[0].nombreCliente).toBe('DAYANA MARIA JIMENEZ ESQUIVEL');
    expect(out[0].nombreCliente).not.toContain('Cliente Pre-alertado');
  });

  it('rejects "Cliente Pre-alertado" placeholder and falls back to pre-alert declared name', () => {
    const preAlertsMap = new Map([
      ['TBA123', { found: true, displayName: 'Dayana Jimenez Esquivel', slCode: 'SL262179' }]
    ]);
    const out = buildResolved(
      [makeRow({ tracking: 'TBA123', slCode: 'SL262179', nombreCliente: 'Cliente Pre-alertado (SL262179)', nombre: 'DAYANA JIMENEZ' })],
      { preAlertsMap }
    );
    expect(out[0].nombreCliente).toBe('Dayana Jimenez Esquivel');
  });

  it('rejects "Cliente Pre-alertado" placeholder and falls back to manifest raw name if contact is not found', () => {
    const out = buildResolved(
      [makeRow({ tracking: 'TBA123', slCode: 'SL262179', nombreCliente: 'Cliente Pre-alertado (SL262179)', nombre: 'DAYANA JIMENEZ ESQUIVEL' })],
      {}
    );
    expect(out[0].nombreCliente).toBe('DAYANA JIMENEZ ESQUIVEL');
    expect(out[0].nombreCliente).not.toContain('Cliente Pre-alertado');
  });
});

describe('useNovaResolvedRows — route resolution', () => {
  it('rutaOverrides[slCode] (effective slCode) takes top priority', () => {
    const rows = [makeRow({ tracking: 'T1' })];
    const out = buildResolved(rows, {
      matchOverrides: { 0: { slCode: 'SL1', fullName: 'X', ruta: 'San Jose Centro' } },
      rutaOverrides:  { 'SL1': 'Encomiendas' },
    });
    expect(out[0].slCode).toBe('SL1');
    expect(out[0].ruta).toBe('Encomiendas');
  });

  it('falls through to slCodeOverrides.ruta then matchOverrides.ruta then row.ruta', () => {
    const rows = [makeRow({ tracking: 'T1', ruta: 'San Jose Centro' })];
    const out = buildResolved(rows, {
      slCodeOverrides: { 0: { slCode: 'SL-NEW', ruta: 'Heredia' } },
    });
    expect(out[0].ruta).toBe('Heredia');
  });
});

describe('useNovaResolvedRows — price/peso baked overrides', () => {
  it('priceOverrides.precio overrides computedPrices and row.precio', () => {
    const rows = [makeRow({ tracking: 'T1', precio: 10 })];
    const out = buildResolved(rows, {
      priceOverrides: { 'T1': { precio: 99.5, pesoRedondeo: 1 } },
      computedPrices: [55],
    });
    expect(out[0].precio).toBe(99.5);
    expect(out[0].pesoRedondeo).toBe(1);
  });

  it('priceOverrides.precio falls back to computedPrices then row.precio', () => {
    const rows = [makeRow({ tracking: 'T1', precio: 10 })];
    const a = buildResolved(rows, { computedPrices: [55] });
    expect(a[0].precio).toBe(55);

    const b = buildResolved(rows, {});
    expect(b[0].precio).toBe(10);
  });

  it('pesoOverrides applies the corrected raw peso when a price override is present', () => {
    const rows = [makeRow({ tracking: 'T1', peso: 0 })];
    const out = buildResolved(rows, {
      priceOverrides: { 'T1': { precio: 12, pesoRedondeo: 1 } },
      pesoOverrides:  { 0: 0.74 },
    });
    expect(out[0].peso).toBe(0.74);
  });

  it('pesoOverrides only applies when there is a price override (rule)', () => {
    // Without priceOverrides, raw peso is preserved verbatim — this matches
    // the documented behaviour in use-nova-resolved-rows.ts.
    const rows = [makeRow({ tracking: 'T1', peso: 1.5 })];
    const out = buildResolved(rows, { pesoOverrides: { 0: 0.74 } });
    expect(out[0].peso).toBe(1.5);
  });
});

describe('useNovaResolvedRows — unlinkedRows behavior', () => {
  it('drops slCode when row is unlinked, falling back to route as group key', () => {
    // Operator unlinked the row — base slCode becomes ''. The function then
    // falls back to the effective route as a group key, so an unlinked row
    // does not silently re-attach to its previous slCode on save.
    const rows = [makeRow({ tracking: 'T1', slCode: 'SL-OLD', nombreCliente: 'OLD' })];
    const out = buildResolved(rows, {
      unlinkedRows: new Set([0]),
    });
    expect(out[0].slCode).not.toBe('SL-OLD');
  });

  it('unlinkedRows wins even when matchOverrides is set (defensive precedence)', () => {
    const rows = [makeRow({ tracking: 'T1' })];
    const out = buildResolved(rows, {
      unlinkedRows:   new Set([0]),
      matchOverrides: { 0: { slCode: 'SL1', fullName: 'X', ruta: 'San Jose' } },
    });
    expect(out[0].slCode).not.toBe('SL1');
  });
});

describe('useNovaResolvedRows — round-trip stability', () => {
  it('running buildResolvedRows twice on already-resolved rows is a no-op', () => {
    // Simulates load-from-Firestore: the row already has slCode/ruta/nombreCliente
    // populated. Building resolved rows again (with no UI overrides) must
    // surface the same values verbatim — otherwise a reload would mutate
    // saved state.
    const saved = [makeRow({
      tracking:      'T1',
      slCode:        'SL3521',
      nombreCliente: 'ANA PAULA FONSECA QUADROS',
      ruta:          'San Jose Centro',
      nombre:        'PAULA UMANA',
      peso:          0.92,
      precio:        12,
    })];
    const out = buildResolved(saved, {});
    expect(out[0].slCode).toBe('SL3521');
    expect(out[0].nombreCliente).toBe('ANA PAULA FONSECA QUADROS');
    expect(out[0].ruta).toBe('San Jose Centro');
    expect(out[0].peso).toBe(0.92);
    expect(out[0].precio).toBe(12);
  });

  it('round-trip preserves all fields through override → save → reload simulation', () => {
    // Pass 1: operator applies matchOverrides + nameOverrides + rutaOverrides
    const raw = [makeRow({ tracking: 'T1', nombre: 'PAULA UMANA' })];
    const passOne = buildResolved(raw, {
      matchOverrides: { 0: { slCode: 'SL3521', fullName: 'ANA PAULA FONSECA QUADROS', ruta: 'San Jose Centro' } },
    });

    // Save → simulated by treating resolvedRows as persisted state. The next
    // load-from-Firestore would produce rows shaped like `passOne`.
    const reloaded = passOne.map(r => makeRow({
      tracking:      r.tracking,
      slCode:        r.slCode,
      nombreCliente: r.nombreCliente,
      ruta:          r.ruta,
      nombre:        r.nombre,
      peso:          r.peso,
      precio:        r.precio,
    }));

    // Pass 2: re-run buildResolvedRows on reloaded rows with NO overrides
    // (the auto-validation rematch is suppressed via skipAutoValidation now,
    // so the empty override state on reload is the realistic scenario).
    const passTwo = buildResolved(reloaded, {});

    expect(passTwo[0].slCode).toBe('SL3521');
    expect(passTwo[0].nombreCliente).toBe('ANA PAULA FONSECA QUADROS');
    expect(passTwo[0].ruta).toBe('San Jose Centro');
  });
});

describe('useNovaResolvedRows — priceAdjustments persistence', () => {
  it('bakes priceAdjustments into resolved row.ajustePrecio', () => {
    const rows = [makeRow({ tracking: 'T1' })];
    const adjustment: AjustePrecio = {
      precioAjustado: 8.5,
      precioCalculado: 10,
      breakdownCalculo: '1kg = $10',
      justificacion: 'Volumen',
      ajustadoPor: 'Dirección Tecnológica',
      ajustadoPorEmail: 'admin@smartlogistics.com',
      fechaAjuste: '2026-08-10T00:00:00Z',
      tipo: 'inferior',
    };
    const out = buildResolved(rows, {
      priceAdjustments: {
        'T1': adjustment,
      },
    });
    expect(out[0].ajustePrecio).toEqual(adjustment);
  });

  it('falls back to row.ajustePrecio when no overriding adjustment exists', () => {
    const adjustment: AjustePrecio = {
      precioAjustado: 13,
      precioCalculado: 15,
      breakdownCalculo: '2kg = $15',
      justificacion: 'Descuento',
      ajustadoPor: 'Juan',
      ajustadoPorEmail: 'juan@smartlogistics.com',
      fechaAjuste: '2026-08-10T00:00:00Z',
      tipo: 'inferior',
    };
    const rows = [makeRow({ tracking: 'T1', ajustePrecio: adjustment })];
    const out = buildResolved(rows, {});
    expect(out[0].ajustePrecio).toEqual(adjustment);
  });
});

describe('useNovaResolvedRows — preAlert propagation', () => {
  it('bakes live preAlert from preAlertsMap into resolved row.preAlert', () => {
    const rows = [makeRow({ tracking: '1Z9999' })];
    const preAlertInfo = {
      found: true,
      tracking: '1Z9999',
      slCode: 'SL4461',
      clientName: 'JIMENA CERDAS',
      description: 'ZAPATOS Y ROPA',
      declaredValue: 120,
      courier: 'UPS',
      hasInvoice: true,
    };
    const map = new Map<string, any>([['1Z9999', preAlertInfo]]);

    const { result } = renderHook(() =>
      useNovaResolvedRows({
        resultDataRows: rows,
        unlinkedRows: new Set(),
        slCodeOverrides: {},
        matchOverrides: {},
        rutaOverrides: {},
        nameOverrides: {},
        priceOverrides: {},
        computedPrices: [18],
        separateInvoices: {},
        manifestCountry: 'usa',
        manifestShipping: 'air',
        preAlertsMap: map,
      })
    );

    const out = result.current.buildResolvedRows(rows);
    expect(out[0].preAlert).toEqual(preAlertInfo);
  });

  it('preserves existing row.preAlert if preAlertsMap has no entry', () => {
    const existingPreAlert = {
      found: true,
      tracking: '1Z8888',
      slCode: 'SL3231',
      clientName: 'CARLOS GOMEZ',
      description: 'ELECTRONICOS',
      declaredValue: 250,
    };
    const rows = [makeRow({ tracking: '1Z8888', preAlert: existingPreAlert })];

    const { result } = renderHook(() =>
      useNovaResolvedRows({
        resultDataRows: rows,
        unlinkedRows: new Set(),
        slCodeOverrides: {},
        matchOverrides: {},
        rutaOverrides: {},
        nameOverrides: {},
        priceOverrides: {},
        computedPrices: [18],
        separateInvoices: {},
        manifestCountry: 'usa',
        manifestShipping: 'air',
      })
    );

    const out = result.current.buildResolvedRows(rows);
    expect(out[0].preAlert).toEqual(existingPreAlert);
  });
});
