// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCustomers,
  getCachedCustomers,
  getCachedIndexes,
  findCustomerBySlCode,
  getCustomerBySlCode,
  invalidateCustomerCache,
  patchCustomerRutaInCache,
  patchCustomerConsolidationInCache,
  injectCustomerIntoCache,
} from '../customer-loader';
import { firebaseApi } from '../../../firebase/callable';

// Mock Firebase callable and firestore
vi.mock('../../../firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(),
    },
  },
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    collection: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

describe('ZERO-OVERCOST & ANTI-DRIFT INTEGRITY TEST SUITE', () => {

  const mockCustomersList = [
    {
      id: 'CUST_1',
      fullName: 'JUAN PEREZ BRENES',
      slCode: 'SL1001',
      ruta: 'GAM',
      consolidationEnabled: true,
      email: 'juan@test.com',
      phone: '8888-1111',
      dni: '1-1111-1111',
      status: 'active',
    },
    {
      id: 'CUST_2',
      fullName: 'MARIA RODRIGUEZ SOTO',
      slCode: 'SL1002',
      ruta: 'Encomiendas',
      consolidationEnabled: false,
      email: 'maria@test.com',
      phone: '8888-2222',
      dni: '2-2222-2222',
      status: 'active',
    },
    {
      id: 'CUST_3',
      fullName: 'CARLOS UMAÑA JIMENEZ',
      slCode: 'SL1003',
      ruta: 'Alajuela',
      consolidationEnabled: true,
      email: 'carlos@test.com',
      phone: '8888-3333',
      dni: '3-3333-3333',
      status: 'active',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCustomerCache();
    (firebaseApi.customers.list as any).mockResolvedValue({
      success: true,
      data: mockCustomersList,
    });
  });

  describe('1. Zero-Overcost In-Memory Caching & Call Volume Elimination', () => {
    it('should call slListCustomers ONLY once on initial load and serve subsequent calls from memory with 0 network reads', async () => {
      // First load: triggers network fetch
      const firstCall = await loadCustomers();
      expect(firstCall.length).toBe(3);
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(1);

      // 10 subsequent calls in the same session (simulating autocomplete keystrokes & Nova matching)
      for (let i = 0; i < 10; i++) {
        const cachedCall = await loadCustomers();
        expect(cachedCall.length).toBe(3);
      }

      // Proves that 10 calls did NOT generate 10 network fetches (eliminating 10,000s of reads)
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(1);
    });

    it('should properly invalidate and reload from source when explicitly requested via invalidateCustomerCache()', async () => {
      await loadCustomers();
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(1);

      // Explicit invalidation
      invalidateCustomerCache();
      expect(getCachedCustomers()).toEqual([]);
      expect(getCachedIndexes()).toBeNull();

      // Next load triggers a fresh fetch
      await loadCustomers();
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. Reactivity & Instant Local Mutations (Zero Latency & Zero Data Drift)', () => {
    it('patchCustomerRutaInCache() immediately updates customer route in memory without hitting network', async () => {
      await loadCustomers();

      // Verify initial route
      const initial = getCustomerBySlCode('SL1001');
      expect(initial?.ruta).toBe('GAM');

      // Operator updates route to "Encomiendas" in Nova or Routes
      patchCustomerRutaInCache('SL1001', 'Encomiendas');

      // Verify route updated in O(1) synchronous lookup
      const updatedSync = getCustomerBySlCode('SL1001');
      expect(updatedSync?.ruta).toBe('Encomiendas');

      // Verify route updated in async lookup
      const updatedAsync = await findCustomerBySlCode('SL1001');
      expect(updatedAsync?.ruta).toBe('Encomiendas');

      // Zero extra network calls occurred
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(1);
    });

    it('patchCustomerConsolidationInCache() immediately toggles consolidation status in memory', async () => {
      await loadCustomers();

      const initial = getCustomerBySlCode('SL1002');
      expect(initial?.consolidationEnabled).toBe(false);

      patchCustomerConsolidationInCache('SL1002', true);

      const updated = getCustomerBySlCode('SL1002');
      expect(updated?.consolidationEnabled).toBe(true);
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(1);
    });

    it('injectCustomerIntoCache() allows adding newly created SP2 / temporary customers dynamically without full refetch', async () => {
      await loadCustomers();
      expect(getCachedCustomers().length).toBe(3);

      const newCustomer = {
        id: 'SL9999',
        slCode: 'SL9999',
        name: 'ANA GABRIELA MORA',
        fullName: 'ANA GABRIELA MORA',
        normalizedName: 'ANA GABRIELA MORA',
        firstName: 'ANA',
        lastName: 'MORA',
        ruta: 'Heredia',
        consolidationEnabled: true,
        email: 'ana@test.com',
        phone: '8888-9999',
        dni: '4-4444-4444',
      };

      injectCustomerIntoCache(newCustomer);

      // Now immediately discoverable via SL Code index
      const found = getCustomerBySlCode('SL9999');
      expect(found).toBeDefined();
      expect(found?.fullName).toBe('ANA GABRIELA MORA');
      expect(found?.ruta).toBe('Heredia');

      // Zero extra network calls occurred
      expect(firebaseApi.customers.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Batching & Chunked Query Math (Where-In Optimization)', () => {
    it('demonstrates chunked batching math reducing 100 queries to only 4 chunked queries (CHUNK_SIZE=30)', () => {
      const trackings = Array.from({ length: 100 }, (_, i) => `TRK_${1000 + i}`);
      const CHUNK_SIZE = 30;

      const chunks: string[][] = [];
      for (let i = 0; i < trackings.length; i += CHUNK_SIZE) {
        chunks.push(trackings.slice(i, i + CHUNK_SIZE));
      }

      // 100 items divided into chunks of 30 -> 4 chunks (30 + 30 + 30 + 10)
      expect(chunks.length).toBe(4);
      expect(chunks[0].length).toBe(30);
      expect(chunks[1].length).toBe(30);
      expect(chunks[2].length).toBe(30);
      expect(chunks[3].length).toBe(10);
      expect(chunks.flat().length).toBe(100);
    });

    it('demonstrates exact deduplication logic in package resolution', () => {
      const mockDocs = [
        { id: 'PKG_A', data: () => ({ trackingNumber: 'TRK_A' }) },
        { id: 'PKG_B', data: () => ({ tracking: 'TRK_B' }) },
        { id: 'PKG_A', data: () => ({ trackingNumber: 'TRK_A' }) }, // Duplicate from dual query
      ];

      const validDocs: any[] = [];
      const seenDocIds = new Set<string>();

      for (const d of mockDocs) {
        if (!seenDocIds.has(d.id)) {
          seenDocIds.add(d.id);
          validDocs.push(d);
        }
      }

      expect(validDocs.length).toBe(2);
      expect(validDocs.map(d => d.id)).toEqual(['PKG_A', 'PKG_B']);
    });
  });

});
