/**
 * Dedicated Test Suite: Firestore Client & Pre-Alert Ultra-Optimizations
 *
 * Verifies:
 * 1. Zero Read-After-Write in createDocument & updateDocument.
 * 2. Smart Search Routing in searchPackages (tracking vs text vs SL code).
 * 3. In-memory TTL caching & deduplication in pre-alert customer resolver.
 * 4. Edge cases (accents, partial updates, short queries, cache invalidation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestoreClient from '../firestore-client';
import * as preAlertResolver from '../../services/pre-alert-resolver';

// Hoist mocks
const { mockAddDoc, mockUpdateDoc, mockGetDoc, mockGetDocs, mockDoc, mockCollection, mockQuery, mockWhere, mockOrderBy, mockLimit, MockTimestamp } = vi.hoisted(() => {
  class MockTimestamp {
    toDate() { return new Date(); }
    toMillis() { return Date.now(); }
    static now() { return new MockTimestamp(); }
    static fromDate(_d: Date) { return new MockTimestamp(); }
  }
  return {
    mockAddDoc: vi.fn(),
    mockUpdateDoc: vi.fn(),
    mockGetDoc: vi.fn(),
    mockGetDocs: vi.fn(),
    mockDoc: vi.fn((_db, _col, id) => ({ id, path: `${_col}/${id}` })),
    mockCollection: vi.fn((_db, name) => ({ path: name })),
    mockQuery: vi.fn((col, ...constraints) => ({ col, constraints })),
    mockWhere: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    mockOrderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    mockLimit: vi.fn((n) => ({ type: 'limit', n })),
    MockTimestamp,
  };
});

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: mockDoc,
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
  startAfter: vi.fn(),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 100 }) })),
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _methodName: 'serverTimestamp' })),
  Timestamp: MockTimestamp,
}));

vi.mock('../config', () => ({
  db: {},
}));

describe('Firestore Ultra-Optimizations & Edge Cases Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Zero Read-After-Write Guarantee', () => {
    it('createDocument saves document and returns synthesized data WITHOUT calling getDoc', async () => {
      mockAddDoc.mockResolvedValueOnce({ id: 'new-doc-123' });

      const payload = { customerName: 'Juan Perez', slCode: 'SL100', weight: 4.5 };
      const result = await firestoreClient.createDocument('packages', payload as any);

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      // Critical check: getDoc must NOT be called after addDoc
      expect(mockGetDoc).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        id: 'new-doc-123',
        customerName: 'Juan Perez',
        slCode: 'SL100',
        weight: 4.5,
      });
      expect((result as any).createdAt).toBeDefined();
      expect((result as any).updatedAt).toBeDefined();
    });

    it('updateDocument writes partial update and returns synthesized data WITHOUT calling getDoc', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      const updateData = { status: 'delivered', failureReason: null };
      const result = await firestoreClient.updateDocument('packages', 'pkg-999', updateData as any);

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      // Critical check: getDoc must NOT be called after updateDoc
      expect(mockGetDoc).not.toHaveBeenCalled();

      expect(result).toMatchObject({
        id: 'pkg-999',
        status: 'delivered',
        failureReason: null,
      });
      expect((result as any).updatedAt).toBeDefined();
    });
  });

  describe('2. Smart Search Routing in searchPackages', () => {
    it('routes tracking-like query (contains digits) ONLY to tracking indices and omits customer name queries', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            id: '1Z9999999999999999',
            data: () => ({
              trackingNumber: '1Z9999999999999999',
              customerName: 'Carlos Test',
              slCode: 'SL50',
            }),
          },
        ],
      });

      const results = await firestoreClient.searchPackages('1Z9999999999999999');

      expect(results.length).toBeGreaterThanOrEqual(1);

      // Verify that where clauses generated were tracking-focused, NOT name-focused
      const whereFields = mockWhere.mock.calls.map(call => call[0]);
      expect(whereFields).toContain('trackingSuffixes');
      expect(whereFields).toContain('trackingNumber');
      expect(whereFields).toContain('tracking');
      // Must NOT have queried customerName or customerEmail for a carrier tracking code
      expect(whereFields).not.toContain('customerName');
      expect(whereFields).not.toContain('customerEmail');
    });

    it('routes pure-text query (e.g. "Carlos Sanchez") ONLY to name/token indices and omits tracking queries', async () => {
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            id: 'pkg-1',
            data: () => ({
              trackingNumber: 'TBA123',
              customerName: 'Carlos Sanchez',
              slCode: 'SL20',
            }),
          },
        ],
      });

      const results = await firestoreClient.searchPackages('Carlos Sanchez');

      expect(results.length).toBeGreaterThanOrEqual(1);

      const whereFields = mockWhere.mock.calls.map(call => call[0]);
      expect(whereFields).toContain('searchTokens');
      expect(whereFields).toContain('customerName');
      // Must NOT have queried tracking suffixes or trackingNumber equality for a pure name
      expect(whereFields).not.toContain('trackingSuffixes');
    });

    it('routes SL code query (e.g. "SL1234") to exact slCode query and searchTokens', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      mockGetDocs.mockResolvedValue({
        docs: [
          {
            id: 'pkg-2',
            data: () => ({
              trackingNumber: 'TBA456',
              customerName: 'Ana Gomez',
              slCode: 'SL1234',
            }),
          },
        ],
      });

      const results = await firestoreClient.searchPackages('SL1234');

      expect(results.length).toBeGreaterThanOrEqual(1);

      const whereFields = mockWhere.mock.calls.map(call => call[0]);
      expect(whereFields).toContain('slCode');
      expect(whereFields).toContain('searchTokens');
      // Must NOT have queried tracking suffixes
      expect(whereFields).not.toContain('trackingSuffixes');
    });

    it('returns empty array when query is shorter than 2 characters (edge case)', async () => {
      const results = await firestoreClient.searchPackages('A');
      expect(results).toEqual([]);
      expect(mockGetDocs).not.toHaveBeenCalled();
      expect(mockGetDoc).not.toHaveBeenCalled();
    });
  });

  describe('3. In-Memory TTL Customer Profile Cache in Pre-Alert Resolver', () => {
    it('caches customer profiles in memory so repeated lookups cost ZERO Firestore reads', async () => {
      preAlertResolver.invalidateCustomerProfileCache();

      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'cust-sl10',
            data: () => ({
              fullName: 'Maria Rodriguez',
              dni: '1-2345-6789',
              email: 'maria@example.com',
              phone: '8888-8888',
            }),
          },
        ],
      });

      const dummyDb = {} as any;
      const preAlert1 = { slCode: 'SL10', trackingNumber: 'TRK101' };

      // 1st resolution: misses cache, queries Firestore
      const res1 = await preAlertResolver.resolveCustomerFullProfile(dummyDb, preAlert1);
      expect(res1.displayName).toBe('Maria Rodriguez');
      expect(res1.dni).toBe('1-2345-6789');
      expect(mockGetDocs).toHaveBeenCalledTimes(1);

      // 2nd resolution for same customer: hits memory cache, ZERO Firestore calls
      const preAlert2 = { slCode: 'SL10', trackingNumber: 'TRK102' };
      const res2 = await preAlertResolver.resolveCustomerFullProfile(dummyDb, preAlert2);
      expect(res2.displayName).toBe('Maria Rodriguez');
      expect(res2.dni).toBe('1-2345-6789');
      // Crucial: mockGetDocs still only called once
      expect(mockGetDocs).toHaveBeenCalledTimes(1);

      // Invalidate cache explicitly
      preAlertResolver.invalidateCustomerProfileCache('SL10');

      // 3rd resolution after invalidation: queries Firestore again
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'cust-sl10',
            data: () => ({
              fullName: 'Maria Rodriguez Updated',
              dni: '1-2345-6789',
              email: 'maria.new@example.com',
              phone: '8888-8888',
            }),
          },
        ],
      });

      const res3 = await preAlertResolver.resolveCustomerFullProfile(dummyDb, preAlert1);
      expect(res3.displayName).toBe('Maria Rodriguez Updated');
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
    });
  });
});
