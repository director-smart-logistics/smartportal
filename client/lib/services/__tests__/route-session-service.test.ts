import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}` })),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn((...args) => args),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: { now: vi.fn(() => ({ toISOString: () => '2026-07-27T12:00:00.000Z' })) },
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  storage: {},
}));

// Import service after mocking
import {
  recordDeliveryEvent,
  recordBulkDeliveryEvent,
  recordFuelRefill,
  recordParkingPayment,
  recordTollPayment,
  closeRouteSession,
  revertPackageToRoute,
  sanitizeFirestoreData,
} from '../route-session-service';
import * as firestore from 'firebase/firestore';

describe('Route Session Service - Delivery, Return & Expenses Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches packages flexibly by tracking when packageId differs', async () => {
    const mockSession = {
      id: 'session-123',
      routeName: 'Ruta Alajuela',
      packages: [
        {
          id: 'pkg-doc-id-1',
          tracking: 'SL4830-20260724100550748',
          customerName: 'Juan Perez',
          deliveryStatus: 'pending',
        },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-123',
    } as any);

    const targetPkg = {
      packageId: 'different-id-or-empty',
      tracking: 'SL4830-20260724100550748',
    } as any;

    await recordDeliveryEvent('session-123', targetPkg, 'return', {
      reason: 'Cliente ausente',
      returnType: 'consolidacion',
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(firestore.updateDoc).mock.calls[0];
    const updateData = updateCall[1] as any;

    expect(updateData.packages[0].deliveryStatus).toBe('consolidado');
    expect(updateData.undeliveredCount).toBe(1);
  });

  it('records successful delivery event for single package correctly', async () => {
    const mockSession = {
      id: 'session-deliv-1',
      routeName: 'Ruta Heredia',
      packages: [
        { packageId: 'pkg-100', tracking: 'SL-DELIV-1', deliveryStatus: 'pending' },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-deliv-1',
    } as any);

    const targetPkg = { packageId: 'pkg-100', tracking: 'SL-DELIV-1' } as any;

    await recordDeliveryEvent('session-deliv-1', targetPkg, 'delivery', {
      signatureUrl: 'https://storage/sig.png',
      paymentMethod: 'efectivo',
      cashPaid: 5000,
      cashPaidCurrency: 'CRC',
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(firestore.updateDoc).mock.calls[0];
    const updateData = updateCall[1] as any;

    expect(updateData.packages[0].deliveryStatus).toBe('delivered');
    expect(updateData.deliveredCount).toBe(1);
    expect(updateData.undeliveredCount).toBe(0);

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-100' }),
      expect.objectContaining({ status: 'delivered' }),
      { merge: true }
    );
  });

  it('records fuel refill without note or photo without undefined Firestore crash', async () => {
    await recordFuelRefill('session-fuel-1', {
      kmAtRefill: 154000,
      amountPaid: 25000,
      currency: 'CRC',
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(firestore.updateDoc).mock.calls[0];
    const updateData = updateCall[1] as any;

    const fuelRefillObj = updateData.fuelRefills[0];
    const eventObj = updateData.events[0];

    expect(fuelRefillObj.amountPaid).toBe(25000);
    expect(fuelRefillObj.kmAtRefill).toBe(154000);
    expect(Object.values(fuelRefillObj).includes(undefined)).toBe(false);
    expect(Object.values(eventObj).includes(undefined)).toBe(false);
  });

  it('records parking payment and toll payment without undefined properties', async () => {
    await recordParkingPayment('session-park-1', {
      amountPaid: 1500,
      currency: 'CRC',
    });

    await recordTollPayment('session-toll-1', {
      amountPaid: 850,
      currency: 'CRC',
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(2);

    const parkCall = vi.mocked(firestore.updateDoc).mock.calls[0][1] as any;
    const tollCall = vi.mocked(firestore.updateDoc).mock.calls[1][1] as any;

    expect(Object.values(parkCall.parkingPayments[0]).includes(undefined)).toBe(false);
    expect(Object.values(parkCall.events[0]).includes(undefined)).toBe(false);

    expect(Object.values(tollCall.tollPayments[0]).includes(undefined)).toBe(false);
    expect(Object.values(tollCall.events[0]).includes(undefined)).toBe(false);
  });

  it('correctly sets canonical package fields for returned, retira_oficina, and consolidacion flows', async () => {
    const mockSession = {
      id: 'session-returns-1',
      routeName: 'Ruta Cartago',
      packages: [
        { packageId: 'pkg-c1', tracking: 'TRK-CONS-1', deliveryStatus: 'pending' },
        { packageId: 'pkg-r1', tracking: 'TRK-RET-1', deliveryStatus: 'pending' },
        { packageId: 'pkg-p1', tracking: 'TRK-PICK-1', deliveryStatus: 'pending' },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-returns-1',
    } as any);

    // 1. Consolidacion
    await recordDeliveryEvent('session-returns-1', { packageId: 'pkg-c1', tracking: 'TRK-CONS-1' } as any, 'return', {
      reason: 'Consolidar cliente',
      returnType: 'consolidacion',
    });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-c1' }),
      expect.objectContaining({
        status: 'consolidated',
        consolidacion: true,
        manifestNumber: 'consolidacion_transitoria',
        manifestId: 'consolidacion_transitoria',
      }),
      { merge: true }
    );

    // 2. Devolucion (Returned)
    await recordDeliveryEvent('session-returns-1', { packageId: 'pkg-r1', tracking: 'TRK-RET-1' } as any, 'return', {
      reason: 'Direccion errónea',
      returnType: 'returned',
    });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-r1' }),
      expect.objectContaining({
        status: 'returned',
        returnReason: 'Direccion errónea',
      }),
      { merge: true }
    );

    // 3. Retira en Oficina (Pickup)
    await recordDeliveryEvent('session-returns-1', { packageId: 'pkg-p1', tracking: 'TRK-PICK-1' } as any, 'return', {
      reason: 'Cliente retira en sucursal',
      returnType: 'retira_oficina',
    });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-p1' }),
      expect.objectContaining({
        status: 'pickup',
        returnReason: 'Cliente retira en sucursal',
      }),
      { merge: true }
    );
  });

  it('sanitizeFirestoreData strips undefined properties recursively', () => {
    const input = {
      validStr: 'hello',
      validNum: 123,
      undefVal: undefined,
      nested: {
        a: 'ok',
        b: undefined,
      },
      list: [{ x: 1, y: undefined }, { z: 2 }],
    };
    const cleaned = sanitizeFirestoreData(input);
    expect(cleaned).toEqual({
      validStr: 'hello',
      validNum: 123,
      nested: { a: 'ok' },
      list: [{ x: 1 }, { z: 2 }],
    });
    expect((cleaned as any).undefVal).toBeUndefined();
    expect(Object.keys(cleaned)).not.toContain('undefVal');
  });

  it('closeRouteSession sanitizes payload and updates without undefined errors', async () => {
    const mockSession = {
      id: 'session-close-1',
      startKm: 10000,
      packages: [
        { packageId: 'pkg-1', tracking: 'TRK-1', deliveryStatus: 'pending' },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-close-1',
    } as any);

    await closeRouteSession('session-close-1', {
      endKm: 10050,
      endKmAI: undefined,
      endPhotoUrl: undefined,
      undelivered: [
        { packageId: 'pkg-1', tracking: 'TRK-1', customerName: 'Juan', reason: 'cliente_ausente', note: undefined },
      ],
      deliveredCount: 0,
      undeliveredCount: 1,
    });

    expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(firestore.updateDoc).mock.calls[0];
    const payload = updateCall[1] as any;

    expect(payload.status).toBe('closed');
    expect(payload.kmDriven).toBe(50);
    expect(Object.keys(payload)).not.toContain('endKmAI');
    expect(Object.keys(payload)).not.toContain('endPhotoUrl');
  });

  it('revertPackageToRoute restores package status to pending, updates canonical doc, and logs audit event', async () => {
    const mockSession = {
      id: 'session-revert-1',
      manifestNumbers: ['22-07-2026DAN'],
      packages: [
        {
          packageId: 'pkg-rev-1',
          tracking: 'SL261216-1',
          customerName: 'JENNIFER LIGATOR',
          deliveryStatus: 'consolidado',
          manifestNumber: 'consolidacion_transitoria',
          originalManifestNumber: '22-07-2026DAN',
        },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-revert-1',
    } as any);

    vi.spyOn(firestore, 'getDocs').mockResolvedValue({
      docs: [
        {
          ref: { path: 'invoices/inv-1' },
          data: () => ({ status: 'annulled', invoiceNumber: 'SL261216-20260720' }),
        },
      ],
    } as any);

    await revertPackageToRoute('session-revert-1', {
      packageId: 'pkg-rev-1',
      tracking: 'SL261216-1',
      customerName: 'JENNIFER LIGATOR',
      deliveryStatus: 'consolidado',
      manifestNumber: 'consolidacion_transitoria',
    } as any, 'Admin User');

    // 1. Session doc update
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'route_sessions/session-revert-1' }),
      expect.objectContaining({
        deliveredCount: 0,
        undeliveredCount: 0,
        packages: [
          expect.objectContaining({
            packageId: 'pkg-rev-1',
            deliveryStatus: 'pending',
            manifestNumber: '22-07-2026DAN',
          }),
        ],
      })
    );

    // 2. Invoice de-annulment
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'invoices/inv-1' }),
      expect.objectContaining({ status: 'issued' })
    );

    // 3. Canonical package doc update
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-rev-1' }),
      expect.objectContaining({
        status: 'in_transit',
        consolidacion: false,
        isConsolidated: false,
        manifestNumber: '22-07-2026DAN',
      }),
      { merge: true }
    );
  });

  it('annuls associated invoices and writes mirror document on consolidation scan during route', async () => {
    const mockSession = {
      id: 'session-scan-consol-1',
      routeName: 'Ruta Cartago',
      packages: [
        {
          packageId: 'pkg-sc-1',
          tracking: 'SL-CONSOL-SCAN-1',
          customerName: 'Pedro Gomez',
          deliveryStatus: 'pending',
          manifestNumber: 'MF-SOURCE-1',
          slCode: 'SL999',
          weight: 4.5,
          cashAmount: 25.5,
          currency: 'USD',
          description: 'Package description',
          isPermiso: true,
        },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-scan-consol-1',
    } as any);

    vi.spyOn(firestore, 'getDocs').mockResolvedValue({
      docs: [
        {
          ref: { path: 'invoices/inv-sc-1' },
          data: () => ({ status: 'issued', invoiceNumber: 'INV-100', createdAt: '2026-07-20T10:00:00.000Z' }),
        },
      ],
    } as any);

    const targetPkg = {
      packageId: 'pkg-sc-1',
      tracking: 'SL-CONSOL-SCAN-1',
      manifestNumber: 'MF-SOURCE-1',
    } as any;

    await recordDeliveryEvent('session-scan-consol-1', targetPkg, 'return', {
      reason: 'consolidacion',
      returnType: 'consolidacion',
    });

    // 1. Session doc update
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'route_sessions/session-scan-consol-1' }),
      expect.any(Object)
    );

    // 2. Invoice annulment call
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'invoices/inv-sc-1' }),
      expect.objectContaining({
        status: 'annulled',
        annulledBy: 'driver_consolidation',
      })
    );

    // 3. Canonical package doc update with invoicedAt stamp
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-sc-1' }),
      expect.objectContaining({
        status: 'consolidated',
        consolidacion: true,
        manifestNumber: 'consolidacion_transitoria',
        manifestId: 'consolidacion_transitoria',
        invoicedAt: '2026-07-20T10:00:00.000Z',
      }),
      { merge: true }
    );

    // 4. Mirror write to manifest_consolidation containing invoicedAt
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'manifest_consolidation/SL-CONSOL-SCAN-1' }),
      expect.objectContaining({
        tracking: 'SL-CONSOL-SCAN-1',
        slCode: 'SL999',
        customerName: 'Pedro Gomez',
        weight: 4.5,
        price: 25.5,
        currency: 'USD',
        manifestNumber: 'MF-SOURCE-1',
        status: 'consolidated',
        invoicedAt: '2026-07-20T10:00:00.000Z',
      }),
      { merge: true }
    );
  });

  it('updates package docs to transitoria, annuls invoices, and mirrors on session close', async () => {
    const mockSession = {
      id: 'session-close-consol-1',
      routeName: 'Ruta Limon',
      startAt: '2026-07-27T10:00:00.000Z',
      packages: [
        {
          packageId: 'pkg-cc-1',
          tracking: 'SL-CONSOL-CLOSE-1',
          customerName: 'Marta Ruiz',
          deliveryStatus: 'pending',
          manifestNumber: 'MF-SOURCE-2',
          slCode: 'SL777',
          weight: 2.2,
          cashAmount: 15.0,
          currency: 'USD',
          description: 'Another package',
          isPermiso: false,
        },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-close-consol-1',
    } as any);

    vi.spyOn(firestore, 'getDocs').mockResolvedValue({
      docs: [
        {
          ref: { path: 'invoices/inv-cc-1' },
          data: () => ({ status: 'issued', invoiceNumber: 'INV-200', createdAt: '2026-07-15T08:00:00.000Z' }),
        },
      ],
    } as any);

    await closeRouteSession('session-close-consol-1', {
      endKm: 150,
      undelivered: [
        {
          packageId: 'pkg-cc-1',
          tracking: 'SL-CONSOL-CLOSE-1',
          reason: 'consolidacion',
        },
      ],
      deliveredCount: 0,
      undeliveredCount: 1,
    });

    // 1. Session doc update
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'route_sessions/session-close-consol-1' }),
      expect.any(Object)
    );

    // 2. Packages collection doc updated to transitoria with invoicedAt
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-cc-1' }),
      expect.objectContaining({
        consolidacion: true,
        manifestNumber: 'consolidacion_transitoria',
        manifestId: 'consolidacion_transitoria',
        status: 'consolidacion',
        invoicedAt: '2026-07-15T08:00:00.000Z',
      }),
      { merge: true }
    );

    // 3. Invoice annulment
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'invoices/inv-cc-1' }),
      expect.objectContaining({
        status: 'annulled',
        annulledBy: 'driver_consolidation',
      })
    );

    // 4. Mirror write to manifest_consolidation with invoicedAt
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'manifest_consolidation/SL-CONSOL-CLOSE-1' }),
      expect.objectContaining({
        tracking: 'SL-CONSOL-CLOSE-1',
        slCode: 'SL777',
        customerName: 'Marta Ruiz',
        weight: 2.2,
        price: 15.0,
        currency: 'USD',
        manifestNumber: 'MF-SOURCE-2',
        status: 'consolidated',
        invoicedAt: '2026-07-15T08:00:00.000Z',
      }),
      { merge: true }
    );
  });

  it('throws an error and blocks actions when navigator.onLine is false (no internet)', async () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
      configurable: true,
    });
    const originalWindow = global.window;
    global.window = {} as any;

    try {
      await expect(
        recordDeliveryEvent('session-123', { packageId: 'pkg-123' } as any, 'delivery')
      ).rejects.toThrow('No tienes conexión a internet o tu señal es muy inestable. Por favor, conéctate a una red estable e inténtalo de nuevo.');
    } finally {
      global.navigator = originalNavigator;
      global.window = originalWindow;
    }
  });

  it('safely handles consolidation scan when no associated invoice exists', async () => {
    const mockSession = {
      id: 'session-no-inv-1',
      routeName: 'Ruta Cartago',
      packages: [
        {
          packageId: 'pkg-ni-1',
          tracking: 'SL-NO-INV-1',
          customerName: 'Jose Segura',
          deliveryStatus: 'pending',
          manifestNumber: 'MF-SOURCE-1',
        },
      ],
    };

    vi.spyOn(firestore, 'getDoc').mockResolvedValue({
      exists: () => true,
      data: () => mockSession,
      id: 'session-no-inv-1',
    } as any);

    // Empty list of docs to simulate no invoices found
    vi.spyOn(firestore, 'getDocs').mockResolvedValue({
      docs: [],
    } as any);

    const targetPkg = {
      packageId: 'pkg-ni-1',
      tracking: 'SL-NO-INV-1',
      manifestNumber: 'MF-SOURCE-1',
    } as any;

    await recordDeliveryEvent('session-no-inv-1', targetPkg, 'return', {
      reason: 'consolidacion',
      returnType: 'consolidacion',
    });

    // Package doc should be updated to consolidated but without invoicedAt stamp
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'packages/pkg-ni-1' }),
      expect.objectContaining({
        status: 'consolidated',
        consolidacion: true,
        manifestNumber: 'consolidacion_transitoria',
        manifestId: 'consolidacion_transitoria',
      }),
      { merge: true }
    );

    // Check that invoicedAt property is NOT set in package update
    const setDocCall = vi.mocked(firestore.setDoc).mock.calls.find(
      call => call[0].path === 'packages/pkg-ni-1'
    );
    expect(setDocCall?.[1]).not.toHaveProperty('invoicedAt');
  });
});

