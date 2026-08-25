// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchCustomersLocal } from '../typeahead-search';
import { invalidateCustomerCache } from '../customer-loader';

// Local Mock Database
const mockDb = {
  customers: new Map<string, any>(),
};

// Mock Firebase Callable
vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(async () => {
        const listData = Array.from(mockDb.customers.values());
        return { success: true, data: { data: listData } };
      }),
    },
  },
}));

// Mock Firestore configuration
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  dbSP2: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
}));

describe('searchCustomersLocal (Typeahead)', () => {
  beforeEach(() => {
    mockDb.customers.clear();
    invalidateCustomerCache();
  });

  it('should return empty list if query is empty', async () => {
    const hits = await searchCustomersLocal('');
    expect(hits).toEqual([]);
  });

  it('should support email lookup bypass', async () => {
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL1001',
      fullName: 'JUAN ALBERTO PEREZ',
      email: 'juan@test.com',
    });
    mockDb.customers.set('c2', {
      id: 'c2',
      slCode: 'SL1002',
      fullName: 'MARIO PEREZ',
      email: 'mario@test.com',
    });

    const hits = await searchCustomersLocal('mario@test.com');
    expect(hits.length).toBe(1);
    expect(hits[0].slCode).toBe('SL1002');
  });

  it('should support pure digits lookup (DNI / Phone / SL)', async () => {
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL1001',
      fullName: 'JUAN ALBERTO PEREZ',
      dni: '1-1234-5678',
      phone: '8888-8888',
    });

    const hitsDni = await searchCustomersLocal('112345678');
    expect(hitsDni.length).toBe(1);
    expect(hitsDni[0].slCode).toBe('SL1001');

    const hitsPhone = await searchCustomersLocal('88888888');
    expect(hitsPhone.length).toBe(1);
    expect(hitsPhone[0].slCode).toBe('SL1001');

    const hitsSlNum = await searchCustomersLocal('1001');
    expect(hitsSlNum.length).toBe(1);
    expect(hitsSlNum[0].slCode).toBe('SL1001');
  });

  it('should support SL code prefix lookup', async () => {
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL1234',
      fullName: 'JUAN ALBERTO PEREZ',
    });

    const hitsExact = await searchCustomersLocal('SL-1234');
    expect(hitsExact.length).toBe(1);
    expect(hitsExact[0].slCode).toBe('SL1234');

    const hitsLower = await searchCustomersLocal('sl 1234');
    expect(hitsLower.length).toBe(1);
    expect(hitsLower[0].slCode).toBe('SL1234');
  });

  it('should perform token and fuzzy matching on names', async () => {
    mockDb.customers.set('c1', {
      id: 'c1',
      slCode: 'SL1001',
      fullName: 'JUAN ALBERTO PEREZ MORA',
      normalizedName: 'JUAN ALBERTO PEREZ MORA',
    });

    // Exact full name match
    const hitsExact = await searchCustomersLocal('JUAN ALBERTO PEREZ MORA');
    expect(hitsExact.length).toBe(1);

    // Partial starts-with match
    const hitsPartial = await searchCustomersLocal('JUAN ALB');
    expect(hitsPartial.length).toBe(1);
  });
});
