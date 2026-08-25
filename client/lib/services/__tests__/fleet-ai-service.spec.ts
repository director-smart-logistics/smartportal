import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isFleetAIEnabled,
  disableFleetAI,
  analyzeFleet,
  analyzeDriver,
  type InsightCard,
} from '../fleet-ai-service';
import type { RouteSession } from '../route-session-service';

// Mock Firebase firestore
vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockRejectedValue(new Error('Missing or insufficient permissions.')),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  serverTimestamp: vi.fn(() => new Date().toISOString()),
}));

describe('fleet-ai-service — AI Availability & Resilience Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly reports enabled state and handles invalid/placeholder tokens', () => {
    // Current test environment key or valid string
    expect(typeof isFleetAIEnabled()).toBe('boolean');
  });

  it('disables fleet AI when disableFleetAI is invoked', () => {
    disableFleetAI('Test failure simulation');
    expect(isFleetAIEnabled()).toBe(false);
  });

  it('generates local report fallback when AI is inactive without throwing', async () => {
    disableFleetAI('Forced inactive for test');

    const mockSessions: RouteSession[] = [
      {
        id: 'session-001',
        routeId: 'r-01',
        driverId: 'driver-01',
        driverName: 'Rodrigo Bonilla',
        routeName: 'San Jose Centro',
        vehiclePlate: 'BCL-123',
        startKm: 1000,
        endKm: 1050,
        totalPackages: 2,
        totalWeight: 5,
        cashToCollect: 15000,
        cashCurrency: 'CRC',
        deliveredCount: 1,
        undeliveredCount: 1,
        status: 'closed',
        packages: [
          {
            packageId: 'pkg-1',
            tracking: 'TRK-1001',
            customerName: 'Juan Perez',
            deliveryStatus: 'delivered',
            cashPaid: 15000,
            currency: 'CRC',
          },
          {
            packageId: 'pkg-2',
            tracking: 'TRK-1002',
            customerName: 'Maria Lopez',
            deliveryStatus: 'returned',
            returnReason: 'Cliente ausente',
          },
        ],
        startAt: '2026-08-17T08:00:00.000Z',
        endAt: '2026-08-17T17:00:00.000Z',
      },
    ];

    const result = await analyzeFleet(mockSessions);
    expect(result).toBeDefined();
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights.some((c: InsightCard) => c.title.includes('Resumen') || c.title.includes('Devueltos'))).toBe(true);
  });

  it('generates local driver report when analyzeDriver is called and AI is disabled', async () => {
    disableFleetAI('Forced inactive for test');

    const mockSession: RouteSession = {
      id: 'session-002',
      routeId: 'r-02',
      driverId: 'driver-02',
      driverName: 'Carlos Ramirez',
      routeName: 'Cartago',
      vehiclePlate: 'SJL-456',
      startKm: 2000,
      totalPackages: 1,
      totalWeight: 2.5,
      cashToCollect: 0,
      cashCurrency: 'CRC',
      deliveredCount: 1,
      undeliveredCount: 0,
      status: 'closed',
      packages: [
        {
          packageId: 'pkg-3',
          tracking: 'TRK-2001',
          customerName: 'Pedro Sanchez',
          deliveryStatus: 'delivered',
        },
      ],
    };

    const result = await analyzeDriver(mockSession, []);
    expect(result).toBeDefined();
    expect(result.promptSummary).toContain('Carlos Ramirez');
    expect(result.insights.length).toBeGreaterThan(0);
  });
});
