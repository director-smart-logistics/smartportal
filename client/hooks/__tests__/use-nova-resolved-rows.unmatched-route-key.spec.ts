// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/lib/utils/pricing', () => ({ calculatePrice: vi.fn(() => ({ price: 0, quoteRequired: true })) }));
vi.mock('@/lib/services/match-learning', () => ({ saveUnmatchedRouteLearning: vi.fn(async () => undefined) }));
import { useNovaResolvedRows } from '../use-nova-resolved-rows';

const base = { guia: '', manifiesto: '26-09-2026DANP', precio: 39, consolidacion: false, descripcion: '', permisos: true,
  pesoRedondeo: 3, diferenciaRedondeo: 0, pesoConsolidacion: 0, precioSinPermiso: 32, precioConPermiso: 39, matchScore: 0, originalData: {} };

function run(row2: any, nameOverride: string) {
  const rows: any[] = [
    { ...base, tracking: '1Z2357X30225317353', nombre: 'JOSE BRENES', nombreCliente: 'Jose Brenes', slCode: 'SL26519', ruta: 'San Jose Escazu', peso: 0.92 },
    { ...base, tracking: 'TBA334656337839', slCode: '', ruta: '', peso: 2.18, ...row2 },
  ];
  // UI group key for an unlinked row = `__unmatched__${nameOverrides[idx] ?? row.nombre}`
  const rutaOverrides = { [`__unmatched__${nameOverride}`]: 'San Jose Escazu' };
  const { result } = renderHook(() => useNovaResolvedRows({
    resultDataRows: rows, unlinkedRows: new Set([1]), slCodeOverrides: {}, matchOverrides: {}, rutaOverrides,
    nameOverrides: { 1: nameOverride }, priceOverrides: {}, computedPrices: [], separateInvoices: {},
    manifestCountry: 'USA', manifestShipping: 'air', loadedFromFirestore: true,
  }));
  return result.current.buildResolvedRows(rows)[1].ruta;
}

describe('BUG-UNMATCHED-ROUTE-KEY — route picked on an unmatched group persists on save (26-09-2026DANP, TBA334656337839)', () => {
  it('persists when row.nombre matches the group name', () => { expect(run({ nombre: 'JOSE BRENES', nombreCliente: 'JOSE BRENES' }, 'JOSE BRENES')).toBe('San Jose Escazu'); });
  it('persists when row.nombre differs from the group name (case/spacing)', () => { expect(run({ nombre: 'Jose Brenes ', nombreCliente: 'JOSE BRENES' }, 'JOSE BRENES')).toBe('San Jose Escazu'); });
});

describe('BUG-TWIN-GROUP-NOT-PERSISTED — row shown inside a same-name SL group is saved with that SL', () => {
  const rows: any[] = [
    { ...base, tracking: '1Z2357X30225317353', nombre: 'JOSE BRENES', nombreCliente: 'Jose Brenes', slCode: 'SL26519', ruta: 'San Jose Centro', peso: 0.92 },
    { ...base, tracking: 'TBA334656337839', nombre: 'JOSE BRENES', nombreCliente: 'JOSE BRENES', slCode: '', ruta: '', peso: 2.18 },
    { ...base, tracking: 'OTHER1', nombre: 'MARIA PEREZ', nombreCliente: '', slCode: '', ruta: '', peso: 1 },
  ];
  const resolve = (opts: { unlinked?: number[]; rutaOverrides?: Record<string, string>; loadedFromFirestore?: boolean }) => {
    const { result } = renderHook(() => useNovaResolvedRows({
      resultDataRows: rows, unlinkedRows: new Set(opts.unlinked ?? []), slCodeOverrides: {}, matchOverrides: {},
      rutaOverrides: opts.rutaOverrides ?? {}, nameOverrides: {}, priceOverrides: {}, computedPrices: [], separateInvoices: {},
      manifestCountry: 'USA', manifestShipping: 'air', loadedFromFirestore: opts.loadedFromFirestore ?? false,
    }));
    return result.current.buildResolvedRows(rows);
  };

  it('twin row inherits SL26519 and the group route picked on screen (incident 26-09-2026DANP)', () => {
    const out = resolve({ rutaOverrides: { SL26519: 'San Jose Escazu' } });
    expect(out[1].slCode).toBe('SL26519');
    expect(out[1].ruta).toBe('San Jose Escazu');
    expect(out[0].ruta).toBe('San Jose Escazu');
  });

  it('twin row inherits the sibling saved route on a reopened manifest', () => {
    const out = resolve({ loadedFromFirestore: true });
    expect(out[1].slCode).toBe('SL26519');
    expect(out[1].ruta).toBe('San Jose Centro');
  });

  it('an explicitly unlinked row stays unmatched (shown as its own "sin registro" group)', () => {
    const out = resolve({ unlinked: [1], rutaOverrides: { SL26519: 'San Jose Escazu' } });
    expect(out[1].slCode).toBe('');
    expect(out[1].ruta).toBe('');
  });

  it('a row with no same-name SL sibling stays unmatched', () => {
    expect(resolve({})[2].slCode).toBe('');
  });
});

describe('BUG-TWIN-GROUP-NOT-PERSISTED — filters and deleted rows', () => {
  const rows: any[] = [
    { ...base, tracking: '1Z2357X30225317353', nombre: 'JOSE BRENES', nombreCliente: 'Jose Brenes', slCode: 'SL26519', ruta: 'San Jose Escazu', peso: 0.92 },
    { ...base, tracking: 'TBA334656337839', nombre: 'JOSE BRENES', nombreCliente: 'JOSE BRENES', slCode: '', ruta: '', peso: 2.18 },
  ];
  const build = (deletedIndices?: Set<number>) => renderHook(() => useNovaResolvedRows({
    resultDataRows: rows, unlinkedRows: new Set(), slCodeOverrides: {}, matchOverrides: {}, rutaOverrides: {},
    nameOverrides: {}, priceOverrides: {}, computedPrices: [], separateInvoices: {},
    manifestCountry: 'USA', manifestShipping: 'air', deletedIndices,
  })).result.current.buildResolvedRows;

  it('resolving only the row a filter shows still links it (save is never scoped by the view)', () => {
    const out = build()([rows[1]]);
    expect(out[0].slCode).toBe('SL26519');
    expect(out[0].ruta).toBe('San Jose Escazu');
  });

  it('a deleted sibling is not used as twin', () => {
    const out = build(new Set([0]))(rows);
    expect(out[1].slCode).toBe('');
  });
});
