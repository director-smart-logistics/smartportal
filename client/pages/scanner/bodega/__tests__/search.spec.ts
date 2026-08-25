import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPackage } from '../search';
import { getDoc, getDocs } from 'firebase/firestore';

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { found: false } })),
}));

vi.mock('@/lib/firebase/config', () => ({
  app: {},
  db: {},
  dbSP2: {},
  sp2App: {},
  auth: {},
  storage: {},
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: vi.fn(() => ({ type: 'collection' })),
    query: vi.fn((col, ...args) => ({ type: 'query', col, args })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    limit: vi.fn((n) => ({ type: 'limit', limit: n })),
    doc: vi.fn(() => ({ type: 'doc' })),
    getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
    getDocs: vi.fn().mockResolvedValue({ docs: [], empty: true }),
  };
});

describe('searchPackage — Trailing 6-8 digits & Recent Days Scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds package by exact match first', async () => {
    const mockData = {
      trackingNumber: '1Z99999999987654321',
      ruta: 'San Jose Centro',
      customerName: 'Fabian Secades',
      slCode: 'SL2397',
      status: 'received',
    };

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => mockData,
      id: '1Z99999999987654321',
    } as any);

    const res = await searchPackage('1Z99999999987654321');
    expect(res).not.toBeNull();
    expect(res?.tracking).toBe('1Z99999999987654321');
    expect(res?.slCode).toBe('SL2397');
  });

  it('performs suffix matching on trailing 6-8 digits when exact match fails', async () => {
    const mockPackages = [
      {
        trackingNumber: '1Z99999999987654321',
        ruta: 'Heredia',
        customerName: 'Maria Perez',
        slCode: 'SL1001',
        createdAt: '2026-07-20T10:00:00Z',
      },
      {
        trackingNumber: '1Z11111111187654321',
        ruta: 'San Jose Centro',
        customerName: 'Juan Carlos',
        slCode: 'SL2002',
        createdAt: '2026-07-22T10:00:00Z', // Newest
      },
    ];

    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any);
    vi.mocked(getDocs).mockImplementation(async (q: any) => {
      // Candidate query has no 'where' clauses (e.g. orderBy + limit)
      const hasWhereClause = q?.args?.some((a: any) => a?.type === 'where');
      if (!hasWhereClause) {
        return {
          docs: mockPackages.map(p => ({ data: () => p })),
          empty: false,
        } as any;
      }
      return { docs: [], empty: true } as any;
    });

    // Search using trailing 8 digits "87654321"
    const res = await searchPackage('87654321');
    expect(res).not.toBeNull();
    // Must pick the newest package matching the suffix
    expect(res?.slCode).toBe('SL2002');
    expect(res?.customerName).toBe('Juan Carlos');
  });
});
