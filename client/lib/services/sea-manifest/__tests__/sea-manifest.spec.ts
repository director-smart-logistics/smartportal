// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

type ProcessingResult = any;

// ── Mock Dependencies ────────────────────────────────────────────────────────
vi.mock('xlsx', () => ({
  read: vi.fn(() => ({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
  })),
  utils: {
    sheet_to_json: vi.fn(() => []),
  },
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn(async () => ({ data: { success: true } }))),
}));

const mockDb = {
  packages: new Map<string, any>(),
  invoices: new Map<string, any>(),
  manifests: new Map<string, any>(),
};

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  app: {},
  sp2App: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ id: name })),
  doc: vi.fn((...args) => {
    let collectionName = '';
    let docId = '';
    if (args.length === 2) {
      collectionName = args[0].id || '';
      docId = args[1];
    } else {
      collectionName = args[1];
      docId = args[2];
    }
    const path = `${collectionName}/${docId}`;
    return { id: path, path };
  }),
  query: vi.fn((coll, ...clauses) => ({ coll, clauses })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: vi.fn(async (q) => {
    const list: any[] = [];
    if (q.coll.id === 'packages') {
      mockDb.packages.forEach((val, id) => {
        list.push({ id, data: () => val });
      });
    } else if (q.coll.id === 'invoices') {
      mockDb.invoices.forEach((val, id) => {
        list.push({ id, data: () => val });
      });
    }
    return { docs: list };
  }),
  getDoc: vi.fn(async () => ({
    exists: () => false,
    data: () => null,
  })),
  deleteDoc: vi.fn(async (d) => {
    const parts = d.path.split('/');
    if (parts[0] === 'packages') {
      mockDb.packages.delete(parts[1]);
    } else if (parts[0] === 'invoices') {
      mockDb.invoices.delete(parts[1]);
    }
  }),
  setDoc: vi.fn(async (d, data, options) => {
    const parts = d.path.split('/');
    if (parts[0] === 'packages') {
      mockDb.packages.set(parts[1], data);
    }
  }),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
}));

// This variable starts with "mock" so Vitest allows referencing it inside vi.mock callbacks
const mockCustomers = new Map<string, any>();

vi.mock('../../invoice-service', () => ({
  getCustomersBySlCodes: vi.fn(async (slCodes) => {
    const map = new Map();
    slCodes.forEach((code: string) => {
      const cust = mockCustomers.get(code);
      if (cust) map.set(code, cust);
    });
    return map;
  }),
  createInvoicesFromRows: vi.fn(async (rows, options) => {
    return { success: true, count: rows.length };
  }),
}));

vi.mock('../../manifest-processor', () => ({
  saveManifestRecord: vi.fn(async (rows, num, meta) => {
    mockDb.manifests.set(num, { rows, meta });
  }),
}));

const deleteInvoiceFromSp2Mock = vi.fn(async (id, num) => {});
vi.mock('../../sync-invoices-service', () => ({
  deleteInvoiceFromSp2: (id: string, num: string) => deleteInvoiceFromSp2Mock(id, num),
}));

// ── Imports under test ───────────────────────────────────────────────────────
import { parseExcelToSpreadsheetRows } from '../excel-parser';
import { processManualSeaManifest, saveSeaManifestData } from '../sea-manifest-processor';

describe('Sea Manifest — Excel Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves empty array if file has fewer than 2 rows', async () => {
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce([
      ['Headers Only']
    ]);

    const fakeFile = new File([''], 'test.xlsx');
    const result = await parseExcelToSpreadsheetRows(fakeFile);
    expect(result).toEqual([]);
  });

  it('parses basic Excel rows and normalizes headers and SL Codes', async () => {
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce([
      ['Warehouse ID', 'Cliente Cuenta', 'Largo', 'Ancho', 'Alto'],
      ['WRH101', '12345', '10', '12', '15'],
      ['WRH102', 'SL543', '8', '8', '8'],
      ['', '', '', '', ''],
    ]);

    const fakeFile = new File([''], 'test.xlsx');
    const result = await parseExcelToSpreadsheetRows(fakeFile);

    expect(result).toHaveLength(2);
    expect(result[0].warehouseId).toBe('WRH101');
    expect(result[0].slCode).toBe('SL12345');
    expect(result[0].length).toBe('10');
    expect(result[1].warehouseId).toBe('WRH102');
    expect(result[1].slCode).toBe('SL543');
  });

  it('rejects if FileReader throws an error', async () => {
    const fakeFile = new File([''], 'test.xlsx');
    const originalFileReader = global.FileReader;
    const mockFileReaderInstance = {
      readAsBinaryString: vi.fn(),
      onload: null as any,
      onerror: null as any,
    };
    vi.spyOn(global, 'FileReader').mockImplementation(() => mockFileReaderInstance as any);

    const promise = parseExcelToSpreadsheetRows(fakeFile);
    mockFileReaderInstance.onerror(new Error('Read failed'));

    await expect(promise).rejects.toThrow('Read failed');
    global.FileReader = originalFileReader;
  });

  it('rejects if sheet extraction fails inside onload', async () => {
    vi.mocked(XLSX.read).mockImplementationOnce(() => {
      throw new Error('Parse error');
    });

    const fakeFile = new File([''], 'test.xlsx');
    const originalFileReader = global.FileReader;
    const mockFileReaderInstance = {
      readAsBinaryString: function(file: File) {
        if (this.onload) {
          this.onload({ target: { result: 'binary_data' } } as any);
        }
      },
      onload: null as any,
      onerror: null as any,
    };
    vi.spyOn(global, 'FileReader').mockImplementation(() => mockFileReaderInstance as any);

    const promise = parseExcelToSpreadsheetRows(fakeFile);
    await expect(promise).rejects.toThrow('Parse error');

    global.FileReader = originalFileReader;
  });
});

describe('Sea Manifest — Sea Manifest Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.packages.clear();
    mockDb.invoices.clear();
    mockDb.manifests.clear();
    mockCustomers.clear();
  });

  describe('processManualSeaManifest', () => {
    it('processes rows correctly and matches customer data', async () => {
      mockCustomers.set('SL1001', {
        fullName: 'John Doe',
        ruta: 'Ruta Sur',
        consolidationEnabled: true,
      });

      const rows: any[] = [
        {
          warehouseId: 'WR-1',
          slCode: 'SL1001',
          customerName: '',
          ruta: '',
          length: '10',
          width: '10',
          height: '10',
          roundedVolume: 6,
          price: 30,
          multiplier: 1,
        },
        {
          warehouseId: 'WR-2',
          slCode: 'SL1002',
          customerName: 'Guest Customer',
          ruta: 'Ruta Central',
          length: '12',
          width: '12',
          height: '12',
          roundedVolume: 8,
          price: 40,
          multiplier: 2,
        },
        {
          warehouseId: '',
          slCode: '',
        }
      ];

      const result = await processManualSeaManifest(rows, 'MANIFEST-SEA-12');

      expect(result.summary.totalRows).toBe(3);
      expect(result.summary.processedRows).toBe(2);
      expect(result.summary.errors).toBe(1);
      expect(result.rows).toHaveLength(2);

      const johnRow = result.rows[0];
      expect(johnRow.tracking).toBe('WR-1');
      expect(johnRow.nombre).toBe('John Doe');
      expect(johnRow.ruta).toBe('Ruta Sur');
      expect(johnRow.consolidacion).toBe(true);
      expect(johnRow.matchScore).toBe(1);
      expect(johnRow.descripcion).toContain('DIM: 10x10x10 in');

      const guestRow = result.rows[1];
      expect(guestRow.tracking).toBe('WR-2');
      expect(guestRow.nombre).toBe('Guest Customer');
      expect(guestRow.ruta).toBe('Ruta Central');
      expect(guestRow.consolidacion).toBe(false);
      expect(guestRow.matchScore).toBe(0);
      expect(guestRow.descripcion).toContain('WR-2 X2');
    });

    it('gracefully handles database errors when fetching customers', async () => {
      const { getCustomersBySlCodes } = await import('../../invoice-service');
      vi.mocked(getCustomersBySlCodes).mockRejectedValueOnce(new Error('Network offline'));

      const rows: any[] = [
        {
          warehouseId: 'WR-1',
          slCode: 'SL1001',
          roundedVolume: 5,
          price: 30,
        }
      ];

      const result = await processManualSeaManifest(rows, 'MANIFEST-SEA-12');
      expect(result.rows[0].nombre).toBe('');
      expect(result.rows[0].matchScore).toBe(0);
    });
  });

  describe('saveSeaManifestData', () => {
    it('deletes stale packages and invoices correctly', async () => {
      mockDb.packages.set('WR-STALE', {
        trackingNumber: 'WR-STALE',
        manifest: 'MANIFEST-SEA-12',
        status: 'pending',
      });
      mockDb.packages.set('WR-PROTECTED', {
        trackingNumber: 'WR-PROTECTED',
        manifest: 'MANIFEST-SEA-12',
        status: 'delivered',
      });
      mockDb.packages.set('WR-ACTIVE', {
        trackingNumber: 'WR-ACTIVE',
        manifest: 'MANIFEST-SEA-12',
        status: 'pending',
      });

      mockDb.invoices.set('INV-STALE', {
        invoiceNumber: 'INV-1001',
        manifestNumber: 'MANIFEST-SEA-12',
        status: 'draft',
        clientSlCode: 'SL-STALE',
      });
      mockDb.invoices.set('INV-PAID', {
        invoiceNumber: 'INV-1002',
        manifestNumber: 'MANIFEST-SEA-12',
        status: 'paid',
        clientSlCode: 'SL-STALE',
      });

      const processedData: ProcessingResult = {
        rows: [
          {
            tracking: 'WR-ACTIVE',
            nombre: 'Active Client',
            guia: '',
            manifiesto: 'MANIFEST-SEA-12',
            peso: 10,
            precio: 50,
            slCode: 'SL-ACTIVE',
            nombreCliente: 'Active Client',
            ruta: 'Ruta Central',
            consolidacion: false,
            descripcion: '',
            permisos: false,
            pesoRedondeo: 10,
            diferenciaRedondeo: 0,
            pesoConsolidacion: 10,
            precioSinPermiso: 50,
            precioConPermiso: 50,
            matchScore: 1,
            matchSource: 'name',
          }
        ],
        summary: {
          totalRows: 1,
          processedRows: 1,
          errors: 0,
          totalPrice: 50,
          customersMatched: 1,
          namesCorrections: 0,
          weightCorrections: 0,
        },
        manifestNumber: 'MANIFEST-SEA-12',
        manifestType: 'usa_sea',
        corrections: [],
        validation: { isValid: true, issues: [], suggestions: [] },
        multiMatchRows: [],
        requiresUserChoice: false,
      };

      await saveSeaManifestData(processedData, false, 550);

      expect(mockDb.packages.has('WR-STALE')).toBe(false);
      expect(mockDb.packages.has('WR-PROTECTED')).toBe(true);
      expect(mockDb.packages.has('WR-ACTIVE')).toBe(true);

      expect(mockDb.invoices.has('INV-STALE')).toBe(false);
      expect(mockDb.invoices.has('INV-PAID')).toBe(true);
      expect(deleteInvoiceFromSp2Mock).toHaveBeenCalledWith('INV-STALE', 'INV-1001');

      const savedActive = mockDb.packages.get('WR-ACTIVE');
      expect(savedActive.trackingNumber).toBe('WR-ACTIVE');
      expect(savedActive.isSeaFreight).toBe(true);

      expect(mockDb.manifests.has('MANIFEST-SEA-12')).toBe(true);
    });

    it('generates draft invoices with options (IVA, bodegaje, and permisos)', async () => {
      const processedData: ProcessingResult = {
        rows: [
          {
            tracking: 'WR-1',
            nombre: 'Client 1',
            guia: '',
            manifiesto: 'MAN-99',
            peso: 8,
            precio: 40,
            slCode: 'SL-C1',
            nombreCliente: 'Client 1',
            ruta: 'Ruta Central',
            consolidacion: false,
            descripcion: '',
            permisos: false,
            pesoRedondeo: 8,
            diferenciaRedondeo: 0,
            pesoConsolidacion: 8,
            precioSinPermiso: 40,
            precioConPermiso: 40,
            matchScore: 1,
            matchSource: 'name',
          }
        ],
        summary: {
          totalRows: 1,
          processedRows: 1,
          errors: 0,
          totalPrice: 40,
          customersMatched: 1,
          namesCorrections: 0,
          weightCorrections: 0,
        },
        manifestNumber: 'MAN-99',
        manifestType: 'usa_sea',
        corrections: [],
        validation: { isValid: true, issues: [], suggestions: [] },
        multiMatchRows: [],
        requiresUserChoice: false,
      };

      const { createInvoicesFromRows } = await import('../../invoice-service');
      const invoiceSpy = vi.mocked(createInvoicesFromRows);

      await saveSeaManifestData(processedData, true, 550, {
        ivaEnabled: true,
        bodegajeCost: 5,
        permisoCost: 10,
        mergeInvoices: true,
      });

      expect(invoiceSpy).toHaveBeenCalled();
      const calledArgs = invoiceSpy.mock.calls[0][1];
      expect(calledArgs.exchangeRate).toBe(550);
      expect(calledArgs.ivaEnabled).toBe(true);
      expect(calledArgs.terceroItems.get('SL-C1')).toEqual({
        amount: 15,
        description: 'Bodegaje: $5 | Permisos: $10',
      });
      expect(calledArgs.mergedSlCodes.has('SL-C1')).toBe(true);
    });

    it('handles sync invoice deletion errors gracefully without crashing', async () => {
      mockDb.invoices.set('INV-STALE', {
        invoiceNumber: 'INV-1001',
        manifestNumber: 'MANIFEST-SEA-12',
        status: 'draft',
        clientSlCode: 'SL-STALE',
      });

      deleteInvoiceFromSp2Mock.mockRejectedValueOnce(new Error('SP2 connection timed out'));

      const processedData: ProcessingResult = {
        rows: [],
        summary: { totalRows: 0, processedRows: 0, errors: 0, totalPrice: 0, customersMatched: 0, namesCorrections: 0, weightCorrections: 0 },
        manifestNumber: 'MANIFEST-SEA-12',
        manifestType: 'usa_sea',
        corrections: [],
        validation: { isValid: true, issues: [], suggestions: [] },
        multiMatchRows: [],
        requiresUserChoice: false,
      };

      await saveSeaManifestData(processedData, false, 550);
      expect(mockDb.invoices.has('INV-STALE')).toBe(false);
    });

    it('generates draft invoices without merge option', async () => {
      const processedData: ProcessingResult = {
        rows: [
          {
            tracking: 'WR-1',
            nombre: 'Client 1',
            guia: '',
            manifiesto: 'MAN-99',
            peso: 8,
            precio: 40,
            slCode: 'SL-C1',
            nombreCliente: 'Client 1',
            ruta: 'Ruta Central',
            consolidacion: false,
            descripcion: '',
            permisos: false,
            pesoRedondeo: 8,
            diferenciaRedondeo: 0,
            pesoConsolidacion: 8,
            precioSinPermiso: 40,
            precioConPermiso: 40,
            matchScore: 1,
            matchSource: 'name',
          }
        ],
        summary: { totalRows: 1, processedRows: 1, errors: 0, totalPrice: 40, customersMatched: 1, namesCorrections: 0, weightCorrections: 0 },
        manifestNumber: 'MAN-99',
        manifestType: 'usa_sea',
        corrections: [],
        validation: { isValid: true, issues: [], suggestions: [] },
        multiMatchRows: [],
        requiresUserChoice: false,
      };

      const { createInvoicesFromRows } = await import('../../invoice-service');
      const invoiceSpy = vi.mocked(createInvoicesFromRows);

      await saveSeaManifestData(processedData, true, 550);

      expect(invoiceSpy).toHaveBeenCalled();
      const calledArgs = invoiceSpy.mock.calls[0][1];
      expect(calledArgs.mergedSlCodes).toBeUndefined();
    });

    it('catches and logs cleanup failures gracefully without crashing save execution', async () => {
      const { getDocs } = await import('firebase/firestore');
      vi.mocked(getDocs).mockRejectedValueOnce(new Error('Firestore offline'));

      const processedData: ProcessingResult = {
        rows: [],
        summary: {
          totalRows: 0,
          processedRows: 0,
          errors: 0,
          totalPrice: 0,
          customersMatched: 0,
          namesCorrections: 0,
          weightCorrections: 0,
        },
        manifestNumber: 'MAN-101',
        manifestType: 'usa_sea',
        corrections: [],
        validation: { isValid: true, issues: [], suggestions: [] },
        multiMatchRows: [],
        requiresUserChoice: false,
      };

      const result = await saveSeaManifestData(processedData, false, 550);
      expect(result).toBeNull();
    });
  });
});
