import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collection, getDocs, query, limit, startAfter, getCountFromServer } from 'firebase/firestore';

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  app: {},
  sp2App: {},
}));

vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn().mockResolvedValue({ success: true, data: [] }),
      getBySlCode: vi.fn().mockResolvedValue({ success: false }),
    },
    routes: {
      list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
  },
}));

vi.mock('@/lib/firebase/firestore-client', () => ({
  firestoreApi: {
    customers: {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } }),
    },
    pricing: {
      getConfig: vi.fn().mockResolvedValue([]),
    },
  },
  COLLECTIONS: {
    CUSTOMERS: 'customers',
    PRICING: 'pricing',
  },
}));

// Mock audit-service to prevent actual filesystem/firestore logs during testing
vi.mock('../audit-service', () => ({
  getManifestMoveHistory: vi.fn().mockResolvedValue([]),
  logAction: vi.fn().mockResolvedValue({}),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => name),
  getDocs: vi.fn(),
  query: vi.fn((...args) => args),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  limit: vi.fn((val) => ({ limit: val })),
  startAfter: vi.fn((val) => ({ startAfter: val })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn((db, col, id) => ({ col, id })),
}));

import { getRecentManifestsPaginated } from '../manifest-processor';

describe('getRecentManifestsPaginated Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the first page of manifests and filters out link-only stubs', async () => {
    const mockManifestsDocs = [
      {
        id: 'M-1',
        data: () => ({
          processedAt: '2026-06-03T12:00:00Z',
          manifestType: 'usa_air',
          totalPackages: 10,
          totalPrice: 120,
          source: 'excel',
        }),
      },
      {
        id: 'M-2',
        data: () => ({
          processedAt: '2026-06-03T11:00:00Z',
          manifestType: 'usa_sea',
          totalPackages: 5,
          totalPrice: 400,
          source: 'nova_mlocker', // Should be skipped (link-only stub)
        }),
      },
      {
        id: 'M-3',
        data: () => ({
          processedAt: '2026-06-03T10:00:00Z',
          manifestType: 'usa_air',
          totalPackages: 3,
          totalPrice: 35,
          source: 'nova_fusion', // Should be skipped because packages array is missing or empty
        }),
      },
      {
        id: 'M-4',
        data: () => ({
          processedAt: '2026-06-03T09:00:00Z',
          manifestType: 'usa_air',
          totalPackages: 8,
          totalPrice: 96,
          source: 'nova_fusion',
          packages: [{ tracking: 'TRACK-1' }], // Should NOT be skipped (packages present)
        }),
      },
      {
        id: 'M-5',
        data: () => ({
          processedAt: '2026-06-03T08:00:00Z',
          manifestType: 'usa_air',
          totalPackages: 15,
          totalPrice: 180,
          mergedInto: 'MEGA-MAN-1', // Should be skipped (merged into another manifest)
        }),
      },
      {
        id: 'M-6',
        data: () => ({
          processedAt: '2026-06-03T07:00:00Z',
          manifestType: 'usa_air',
          totalPackages: 4,
          totalPrice: 48,
          source: 'excel',
        }),
      },
    ];

    vi.mocked(getDocs).mockImplementation((q) => {
      // Return first page of query mock results
      return Promise.resolve({
        docs: mockManifestsDocs,
      } as any);
    });

    // Mock count resolver: return mock counts for each non-skipped manifest (M-1, M-4, M-6)
    vi.mocked(getCountFromServer).mockResolvedValue({
      data: () => ({ count: 12 }),
    } as any);

    const pageSize = 3;
    const result = await getRecentManifestsPaginated(pageSize);

    // M-1, M-4, M-6 are the valid results (M-2, M-3, M-5 are skipped)
    expect(result.manifests).toHaveLength(3);
    expect(result.manifests[0].id).toBe('M-1');
    expect(result.manifests[1].id).toBe('M-4');
    expect(result.manifests[2].id).toBe('M-6');

    // Counts should be resolved live
    expect(result.manifests[0].totalPackages).toBe(12);

    // Verify limit constraint was called with fetchLimit (pageSize * 4)
    const limitCall = vi.mocked(query).mock.calls[0].find(arg => arg && (arg as any).limit === pageSize * 4);
    expect(limitCall).toBeDefined();

    expect(result.hasMore).toBe(false);
  });

  it('uses startAfter when a page cursor snapshot is provided', async () => {
    const fakeCursor = { id: 'CURSOR-DOC' };

    vi.mocked(getDocs).mockResolvedValue({
      docs: [],
    } as any);

    await getRecentManifestsPaginated(3, fakeCursor);

    // Verify that startAfter was included in one of the query calls
    const startAfterCall = vi.mocked(query).mock.calls.flatMap(c => c).find(arg => arg && (arg as any).startAfter === fakeCursor);
    expect(startAfterCall).toBeDefined();
  });
});
