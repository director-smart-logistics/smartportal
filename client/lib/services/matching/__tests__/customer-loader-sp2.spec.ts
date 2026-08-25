// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findCustomerBySlCode,
  getCustomerBySlCode,
  invalidateCustomerCache,
} from '../customer-loader';
import { firebaseApi } from '../../../firebase/callable';

vi.mock('../../../firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(),
    },
  },
}));

vi.mock('../../../firebase/config', () => ({
  db: {},
  dbSP2: { __mockDb: 'sp2' },
  app: {},
  sp2App: {},
}));

const mockSp2DocData = vi.fn();
const mockSp2DocExists = vi.fn();

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    collection: vi.fn(),
    doc: vi.fn((_db, col, id) => ({ _col: col, _id: id })),
    getDoc: vi.fn(async (docRef) => ({
      exists: () => mockSp2DocExists(docRef),
      data: () => mockSp2DocData(docRef),
    })),
    getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
  };
});

describe('CustomerLoader SP2 Resilient Resolution Suite', () => {
  beforeEach(() => {
    invalidateCustomerCache();
    vi.clearAllMocks();
    (firebaseApi.customers.list as any).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'SP1_1',
          fullName: 'ALLAN VALVERDE',
          slCode: 'SL101',
          ruta: 'GAM',
          status: 'active',
        },
      ],
    });
  });

  it('resolves SP1 customer directly from cache', async () => {
    const cust = await findCustomerBySlCode('SL101');
    expect(cust).toBeDefined();
    expect(cust?.fullName).toBe('ALLAN VALVERDE');
    expect(cust?.ruta).toBe('GAM');
  });

  it('resiliently falls back to SP2 (dbSP2) when customer is not in SP1', async () => {
    mockSp2DocExists.mockImplementation((docRef: any) => docRef._id === 'SL26742');
    mockSp2DocData.mockImplementation((docRef: any) => {
      if (docRef._id === 'SL26742') {
        return {
          fullName: 'HORACIO FERNÁNDEZ',
          ruta: 'OCCIDENTE',
          slCode: 'SL26742',
          consolidationEnabled: true,
          email: 'accacomputo@gmail.com',
          phone: '105460706',
        };
      }
      return null;
    });

    const cust = await findCustomerBySlCode('SL26742');
    expect(cust).toBeDefined();
    expect(cust?.fullName).toBe('HORACIO FERNÁNDEZ');
    expect(cust?.ruta).toBe('OCCIDENTE');
    expect(cust?.slCode).toBe('SL26742');

    // Subsequent synchronous lookup is warm in memory (0ms / 0-cost)
    const syncCust = getCustomerBySlCode('SL26742');
    expect(syncCust?.fullName).toBe('HORACIO FERNÁNDEZ');
  });
});
