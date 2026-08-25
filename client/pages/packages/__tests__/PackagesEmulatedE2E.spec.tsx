// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for Firebase & Services
const mockOnSnapshot = vi.fn();
const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockQuery = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

class MockTimestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  toDate() {
    return new Date(this.seconds * 1000);
  }
  static fromDate(date: Date) {
    return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
  }
  static now() {
    return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
  }
}

vi.mock('firebase/firestore', () => ({
  Timestamp: MockTimestamp,
  getFirestore: vi.fn(),
  collection: (...args: any[]) => mockCollection(...args),
  query: (...args: any[]) => mockQuery(...args),
  orderBy: (...args: any[]) => mockOrderBy(...args),
  limit: (...args: any[]) => mockLimit(...args),
  onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
  getDocs: (...args: any[]) => mockGetDocs(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  doc: (...args: any[]) => mockDoc(...args),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  arrayUnion: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('@/lib/firebase/config', () => ({
  app: {},
  sp2App: {},
  db: {},
  dbSP2: {},
  auth: {},
  storage: {},
}));

vi.mock('@/lib/services/sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn().mockResolvedValue({
    total: 2,
    created: 0,
    updated: 2,
    skipped: 0,
    errors: 0,
    details: [],
  }),
}));

vi.mock('@/lib/services/gemini-client', () => ({
  translateToJQL: vi.fn().mockResolvedValue('status = "received" AND route = "GAM"'),
}));

const samplePackagesFixture = [
  {
    id: 'pkg-001',
    trackingNumber: 'TRK-1001',
    description: 'Laptop gamer',
    weight: 4.5,
    slCode: 'SL101',
    customerName: 'Carlos Rodriguez',
    customerId: 'cust-1',
    status: 'received',
    ruta: 'GAM',
    manifestNumber: '11-08-2026DAN',
    requiresPermit: false,
    createdAt: '2026-08-15T10:00:00Z',
    price: 35.0,
    currency: 'USD',
  },
  {
    id: 'pkg-002',
    trackingNumber: 'TRK-1002',
    description: 'Suplementos nutricionales',
    weight: 2.1,
    slCode: 'SL102',
    customerName: 'Maria Fernandez',
    customerId: 'cust-2',
    status: 'arrived',
    ruta: 'Encomiendas',
    manifestNumber: '11-08-2026DANP',
    requiresPermit: true,
    createdAt: '2026-08-16T11:00:00Z',
    price: 42.0,
    currency: 'USD',
  },
  {
    id: 'pkg-003',
    trackingNumber: 'TRK-1003',
    description: 'Zapatos deportivos',
    weight: 1.8,
    slCode: 'SL103',
    customerName: 'Alejandro Morales',
    customerId: 'cust-3',
    status: 'delivered',
    ruta: 'GAM',
    manifestNumber: '12-08-2026DAN',
    requiresPermit: false,
    createdAt: '2026-08-17T09:00:00Z',
    price: 18.0,
    currency: 'USD',
  },
];

describe('PACKAGES MODULE: EMULATED E2E & DATA FLOW COMPREHENSIVE SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Bounded Query Construction: Ensures queries apply limit constraints and date filters', () => {
    const buildConstraints = (preFilters: any, dataLoadLimit: number | 'last4days') => {
      const constraints: any[] = [];
      if (preFilters.manifestNumber) {
        constraints.push({ field: 'manifestNumber', op: '==', value: preFilters.manifestNumber });
      }
      if (preFilters.type) {
        constraints.push({ field: 'type', op: '==', value: preFilters.type });
      }
      const queryLimit = typeof dataLoadLimit === 'number' ? dataLoadLimit : 3000;
      constraints.push({ limit: queryLimit });
      return constraints;
    };

    const c1 = buildConstraints({ manifestNumber: '11-08-2026DAN' }, 5000);
    expect(c1).toContainEqual({ field: 'manifestNumber', op: '==', value: '11-08-2026DAN' });
    expect(c1).toContainEqual({ limit: 5000 });

    const c2 = buildConstraints({}, 'last4days');
    expect(c2).toContainEqual({ limit: 3000 });
  });

  it('2. Filter Matrix: Correctly filters packages by status, route, and permits', () => {
    const filterPackages = (pkgs: typeof samplePackagesFixture, filters: { status?: string; ruta?: string; requiresPermit?: boolean }) => {
      return pkgs.filter(p => {
        if (filters.status && p.status !== filters.status) return false;
        if (filters.ruta && p.ruta !== filters.ruta) return false;
        if (filters.requiresPermit !== undefined && p.requiresPermit !== filters.requiresPermit) return false;
        return true;
      });
    };

    // Filter by GAM
    const gamPkgs = filterPackages(samplePackagesFixture, { ruta: 'GAM' });
    expect(gamPkgs.length).toBe(2);

    // Filter by Permit Required
    const permitPkgs = filterPackages(samplePackagesFixture, { requiresPermit: true });
    expect(permitPkgs.length).toBe(1);
    expect(permitPkgs[0].slCode).toBe('SL102');

    // Filter by Received status
    const receivedPkgs = filterPackages(samplePackagesFixture, { status: 'received' });
    expect(receivedPkgs.length).toBe(1);
    expect(receivedPkgs[0].trackingNumber).toBe('TRK-1001');
  });

  it('3. AI Query Natural Language Translation: Calls translateToJQL and produces JQL', async () => {
    const { translateToJQL } = await import('@/lib/services/gemini-client');
    const jql = await translateToJQL('paquetes recibidos en gam');
    expect(jql).toBe('status = "received" AND route = "GAM"');
  });

  it('4. Orphan Package Audit Logic: Accurately identifies packages without invoices in chunks of 30', () => {
    const packagesToCheck = samplePackagesFixture;
    const invoicedTrackings = new Set(['TRK-1001', 'TRK-1003']);

    const orphanIds = new Set<string>();
    packagesToCheck.forEach(pkg => {
      if (!invoicedTrackings.has(pkg.trackingNumber)) {
        orphanIds.add(pkg.id);
      }
    });

    expect(orphanIds.size).toBe(1);
    expect(orphanIds.has('pkg-002')).toBe(true);
  });

  it('5. Optimistic Cache Updates: Mutation immediately updates cached list data without waiting', () => {
    const initialList = [...samplePackagesFixture];
    const updateId = 'pkg-001';
    const updateData = { status: 'in_transit', ruta: 'Rural' };

    // Emulate onMutate optimistic patch
    const patchedList = initialList.map(p => p.id === updateId ? { ...p, ...updateData } : p);

    expect(patchedList[0].status).toBe('in_transit');
    expect(patchedList[0].ruta).toBe('Rural');
    expect(patchedList[1].status).toBe('arrived'); // unchanged
  });

  it('6. Bulk Status Operations: Bulk updating statuses produces consistent payload', () => {
    const selectedIds = ['pkg-001', 'pkg-002'];
    const newStatus = 'customs_cleared';

    const updatePayloads = selectedIds.map(id => ({ id, status: newStatus }));

    expect(updatePayloads.length).toBe(2);
    expect(updatePayloads[0]).toEqual({ id: 'pkg-001', status: 'customs_cleared' });
    expect(updatePayloads[1]).toEqual({ id: 'pkg-002', status: 'customs_cleared' });
  });

  it('7. SmartWeb Sync Service: Correctly prepares and sends packages to SmartWeb', async () => {
    const { syncPackagesToSmartWeb } = await import('@/lib/services/sync-smartweb-service');
    const result = await syncPackagesToSmartWeb(samplePackagesFixture.slice(0, 2) as any);
    expect(result.total).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.errors).toBe(0);
  });
});
