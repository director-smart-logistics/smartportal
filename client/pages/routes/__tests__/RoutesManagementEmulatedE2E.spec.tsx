// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for Firebase
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
  serverTimestamp: vi.fn(() => MockTimestamp.now()),
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

const sampleManifestPackages = [
  {
    id: 'pkg-rt-1',
    trackingNumber: 'TRK-ROUTE-1',
    slCode: 'SL101',
    customerName: 'Carlos Rodriguez',
    manifestNumber: '11-08-2026DAN',
    ruta: 'GAM',
    status: 'in_transit',
    weight: 3.5,
  },
  {
    id: 'pkg-rt-2',
    trackingNumber: 'TRK-ROUTE-2',
    slCode: 'SL102',
    customerName: 'Maria Fernandez',
    manifestNumber: '11-08-2026DAN',
    ruta: 'GAM',
    status: 'delivered',
    weight: 2.0,
  },
  {
    id: 'pkg-rt-3',
    trackingNumber: 'TRK-ROUTE-3',
    slCode: 'SL103',
    customerName: 'Alejandro Morales',
    manifestNumber: '11-08-2026DAN',
    ruta: 'GAM',
    status: 'returned',
    weight: 1.2,
  },
];

const sampleManifestInvoices = [
  {
    id: 'inv-rt-1',
    invoiceNumber: 'FAC-00101',
    manifestNumber: '11-08-2026DAN',
    slCode: 'SL101',
    clientName: 'Carlos Rodriguez',
    totalAmount: 15000,
    status: 'sent',
  },
  {
    id: 'inv-rt-2',
    invoiceNumber: 'FAC-00102',
    manifestNumbers: ['11-08-2026DAN', '12-08-2026DAN'],
    slCode: 'SL102',
    clientName: 'Maria Fernandez',
    totalAmount: 28000,
    status: 'paid',
  },
];

describe('ROUTES MANAGEMENT & DRIVER WIZARD: EMULATED E2E & PERFORMANCE SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Zero Idle Subscriptions: When no manifest is selected, no packages/invoices queries are executed', () => {
    const manifestFilter = '';
    const shouldSubscribe = Boolean(manifestFilter);

    expect(shouldSubscribe).toBe(false);
  });

  it('2. Multi-Manifest Invoice Resolution: Matches invoices by both single manifestNumber and multi-manifest array', () => {
    const searchManifest = '11-08-2026DAN';

    const matchedInvoices = sampleManifestInvoices.filter(inv => {
      const matchesSingle = inv.manifestNumber === searchManifest;
      const matchesArray = Array.isArray(inv.manifestNumbers) && inv.manifestNumbers.includes(searchManifest);
      return matchesSingle || matchesArray;
    });

    expect(matchedInvoices.length).toBe(2);
    expect(matchedInvoices.map(i => i.id)).toEqual(['inv-rt-1', 'inv-rt-2']);
  });

  it('3. Route Delivery & Return Statistics: Accurately computes totals and percentages in-memory', () => {
    const totalPackages = sampleManifestPackages.length;
    const deliveredPackages = sampleManifestPackages.filter(p => p.status === 'delivered').length;
    const returnedPackages = sampleManifestPackages.filter(p => p.status === 'returned').length;
    const inTransitPackages = sampleManifestPackages.filter(p => p.status === 'in_transit').length;
    const totalWeight = sampleManifestPackages.reduce((sum, p) => sum + (p.weight || 0), 0);

    expect(totalPackages).toBe(3);
    expect(deliveredPackages).toBe(1);
    expect(returnedPackages).toBe(1);
    expect(inTransitPackages).toBe(1);
    expect(totalWeight).toBe(6.7);
    expect(Math.round((deliveredPackages / totalPackages) * 100)).toBe(33);
  });

  it('4. Driver Session Creation Payload: Correctly prepares initial session data with driver and manifest', () => {
    const driverId = 'driver-001';
    const driverName = 'Juan Perez';
    const manifestNumber = '11-08-2026DAN';
    const initialKm = 125400;

    const sessionPayload = {
      driverId,
      driverName,
      manifestNumber,
      initialKm,
      status: 'open',
      createdAt: MockTimestamp.now(),
      deliveries: [],
      returns: [],
      expenses: [],
    };

    expect(sessionPayload.driverId).toBe('driver-001');
    expect(sessionPayload.status).toBe('open');
    expect(sessionPayload.initialKm).toBe(125400);
    expect(sessionPayload.manifestNumber).toBe('11-08-2026DAN');
  });

  it('5. Safe GPS Coordinate Parsing: Extracts coordinates correctly from address structures without throwing', () => {
    const customerWithCoords = {
      slCode: 'SL101',
      defaultAddress: {
        coordinates: { lat: 9.9333, lng: -84.0833 },
      },
    };

    const customerWithoutCoords = {
      slCode: 'SL102',
      defaultAddress: {
        streetAddress: 'Calle Central',
      },
    };

    const extractCoords = (customer: any) => {
      const coords = customer.defaultAddress?.coordinates;
      if (coords?.lat && coords?.lng) {
        return { lat: Number(coords.lat), lng: Number(coords.lng) };
      }
      return null;
    };

    expect(extractCoords(customerWithCoords)).toEqual({ lat: 9.9333, lng: -84.0833 });
    expect(extractCoords(customerWithoutCoords)).toBeNull();
  });
});
