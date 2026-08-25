// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.unmock('xlsx');
import * as XLSX from 'xlsx';
import {
  sortRowsBySlCode,
  generateCSV,
  generateXLSX,
  downloadCSV,
  downloadXLSX,
  generateMultiMatchCSV,
  downloadMultiMatchCSV,
} from '../exporter';
import { type ProcessingResult, type MultiMatchRow, type ManifestRow } from '../types';

describe('exporter.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global URL APIs
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-uuid');
    global.URL.revokeObjectURL = vi.fn();

    // Mock HTMLAnchorElement click
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  const sampleResult: ProcessingResult = {
    manifestNumber: 'MAN-100',
    manifestType: 'usa_air',
    rows: [
      {
        tracking: 'TRK-1',
        nombre: 'paula umana',
        guia: 'GUIA-1',
        manifiesto: 'MAN-100',
        peso: 2.5,
        pesoRedondeo: 3,
        diferenciaRedondeo: 0.5,
        pesoConsolidacion: 2.5,
        precioSinPermiso: 15,
        precioConPermiso: 15,
        precio: 15,
        slCode: 'SL245',
        nombreCliente: 'Paula Fonseca',
        ruta: 'Ruta A',
        consolidacion: false,
        permisos: false,
        descripcion: 'normal item, clean',
        matchScore: 1,
        matchSource: 'name',
        originalData: {},
      },
      {
        tracking: 'TRK-2',
        nombre: 'unmatched customer',
        guia: 'GUIA-2',
        manifiesto: 'MAN-100',
        peso: 1.0,
        pesoRedondeo: 1,
        diferenciaRedondeo: 0,
        pesoConsolidacion: 1.0,
        precioSinPermiso: 10,
        precioConPermiso: 10,
        precio: 10,
        slCode: 'N/A', // unmatched
        nombreCliente: '',
        ruta: 'Ruta B',
        consolidacion: true,
        permisos: true,
        descripcion: 'requires permit and "special" handling',
        matchScore: 0,
        matchSource: 'name',
        originalData: {},
      },
      {
        tracking: 'TRK-3',
        nombre: 'pending customer',
        guia: 'GUIA-3',
        manifiesto: 'MAN-100',
        peso: 5.234,
        pesoRedondeo: 6,
        diferenciaRedondeo: 0.766,
        pesoConsolidacion: 5.234,
        precioSinPermiso: 25,
        precioConPermiso: 25,
        precio: 25,
        slCode: 'SL888',
        nombreCliente: 'Pending One',
        ruta: 'Ruta C',
        consolidacion: false,
        permisos: false,
        descripcion: 'needs comma, inline\nnewline and "quotes"',
        matchScore: 0.8,
        matchSource: 'name',
        originalData: {},
      },
    ],
    summary: {
      totalRows: 3,
      processedRows: 3,
      errors: 0,
      totalPrice: 50,
      customersMatched: 2,
      namesCorrections: 0,
      weightCorrections: 0,
    },
    corrections: [],
    validation: { isValid: true, issues: [], suggestions: [] },
    multiMatchRows: [
      {
        rowIndex: 3,
        tracking: 'TRK-3',
        nombre: 'pending customer',
        candidates: [
          { slCode: 'SL888', fullName: 'Pending One', score: 0.8, consolidation: false, ruta: 'Ruta C' },
        ],
      },
    ],
    requiresUserChoice: false,
  };

  describe('sortRowsBySlCode', () => {
    it('sorts matched items alphabetically and puts unmatched items at the end', () => {
      const rows: any[] = [
        { slCode: 'SL999' },
        { slCode: '' },
        { slCode: 'SL001' },
        { slCode: 'N/A' },
        { slCode: 'SL555' },
      ];

      const sorted = sortRowsBySlCode(rows);
      expect(sorted[0].slCode).toBe('SL001');
      expect(sorted[1].slCode).toBe('SL555');
      expect(sorted[2].slCode).toBe('SL999');
      // Unmatched ones at the end
      expect(sorted[3].slCode).toBe('');
      expect(sorted[4].slCode).toBe('N/A');
    });
  });

  describe('generateCSV', () => {
    it('generates a clean comma-separated string, converting text to uppercase and escaping columns', () => {
      const csv = generateCSV(sampleResult);

      expect(csv).toContain('TRACKING,NOMBRE,GUIA');
      expect(csv).toContain('TRK-1,PAULA UMANA,GUIA-1'); // uppercase conversion
      expect(csv).toContain('SL245');
      expect(csv).toContain('5.234'); // numeric format
      // Escaping of comma, quotes, and newlines
      expect(csv).toContain('"NEEDS COMMA, INLINE\nNEWLINE AND ""QUOTES"""');
    });
  });

  describe('generateXLSX', () => {
    it('generates a robust Uint8Array spreadsheet with styles and summary sheets', () => {
      const originalAoa = XLSX.utils.aoa_to_sheet;
      vi.spyOn(XLSX.utils, 'aoa_to_sheet').mockImplementationOnce((data) => {
        const sheet = originalAoa(data);
        delete sheet['B2']; // delete cell B2 to test safeguard fallback
        return sheet;
      });

      const array = generateXLSX(sampleResult);
      expect(array).toBeDefined();
      expect(array.length || (array as any).byteLength).toBeGreaterThan(0);
    });
  });

  describe('downloadCSV and downloadXLSX', () => {
    it('creates anchor tags, initiates downloads, and cleans up document', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      downloadCSV(sampleResult);
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();

      downloadXLSX(sampleResult);
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  describe('generateMultiMatchCSV and downloadMultiMatchCSV', () => {
    it('generates multi match CSV correctly with candidates', () => {
      const rows: MultiMatchRow[] = [
        {
          rowIndex: 2,
          tracking: 'TRK-2',
          nombre: 'Juan Perez',
          candidates: [
            { slCode: 'SL101', fullName: 'Juan Perez', score: 0.95, consolidation: true, ruta: 'Sur' },
            { slCode: 'SL102', fullName: 'Juan Perez Silva', score: 0.70, consolidation: false, ruta: 'Norte' },
          ],
        },
      ];

      const csv = generateMultiMatchCSV(rows, 'MAN-99');
      expect(csv).toContain('Juan Perez');
      expect(csv).toContain('SL101');
      expect(csv).toContain('95%');
      expect(csv).toContain('SL102');
      expect(csv).toContain('70%');
    });

    it('downloads multi match CSV successfully', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      downloadMultiMatchCSV([], 'MAN-99');
      expect(appendSpy).toHaveBeenCalled();
    });
  });
});
