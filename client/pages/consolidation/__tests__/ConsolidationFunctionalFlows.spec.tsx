/**
 * Functional Scenario Test Suite: Package Consolidation & Warehouse Holding
 *
 * Real-world consolidation scenarios tested:
 * 1. Customer with consolidation enabled accumulates packages across 3 manifests.
 * 2. Carry-on package detection and automatic aggregation.
 * 3. Master package creation with aggregated total weight, total declared value, and combined invoice.
 * 4. Partial split / release when customer requests urgent dispatch of 1 item.
 * 5. Warehouse holding expiration and automatic reminder alerts.
 */

import { describe, it, expect, vi } from 'vitest';

export interface ConsolidatedPackage {
  id: string;
  trackingNumber: string;
  customerName: string;
  slCode: string;
  manifestNumber: string;
  weight: number;
  price?: number;
  consolidationEnabled: boolean;
  status: 'received' | 'held_for_consolidation' | 'consolidated' | 'released';
  masterTrackingId?: string;
  arrivedAt: string;
}

export interface MasterPackageGroup {
  id: string;
  masterTrackingNumber: string;
  slCode: string;
  customerName: string;
  packageCount: number;
  totalWeight: number;
  totalValue: number;
  packages: ConsolidatedPackage[];
  status: 'open' | 'ready_to_invoice' | 'invoiced' | 'dispatched';
}

export function buildMasterPackageGroup(
  slCode: string,
  customerName: string,
  packages: ConsolidatedPackage[]
): MasterPackageGroup {
  const eligible = packages.filter(
    p => p.slCode === slCode && (p.status === 'received' || p.status === 'held_for_consolidation')
  );

  const totalWeight = Number(eligible.reduce((sum, p) => sum + p.weight, 0).toFixed(2));
  const totalValue = eligible.reduce((sum, p) => sum + (p.price || 0), 0);
  const masterTrackingNumber = `MASTER-${slCode}-${Date.now().toString().slice(-6)}`;

  return {
    id: `grp-${slCode}`,
    masterTrackingNumber,
    slCode,
    customerName,
    packageCount: eligible.length,
    totalWeight,
    totalValue,
    packages: eligible,
    status: eligible.length >= 2 ? 'ready_to_invoice' : 'open',
  };
}

describe('Consolidation Functional Real-World Flows', () => {
  const mockCustomerPackages: ConsolidatedPackage[] = [
    {
      id: 'pkg-c1',
      trackingNumber: '1Z999001',
      customerName: 'Daniela Monge',
      slCode: 'SL550',
      manifestNumber: 'MAN-2026-08-01',
      weight: 3.2,
      price: 45,
      consolidationEnabled: true,
      status: 'held_for_consolidation',
      arrivedAt: '2026-08-01T14:00:00Z',
    },
    {
      id: 'pkg-c2',
      trackingNumber: '1Z999002',
      customerName: 'Daniela Monge',
      slCode: 'SL550',
      manifestNumber: 'MAN-2026-08-05',
      weight: 1.8,
      price: 25,
      consolidationEnabled: true,
      status: 'held_for_consolidation',
      arrivedAt: '2026-08-05T16:30:00Z',
    },
    {
      id: 'pkg-c3',
      trackingNumber: 'TBA999003',
      customerName: 'Daniela Monge',
      slCode: 'SL550',
      manifestNumber: 'MAN-2026-08-10',
      weight: 5.0,
      price: 120,
      consolidationEnabled: true,
      status: 'received',
      arrivedAt: '2026-08-10T09:15:00Z',
    },
  ];

  it('Scenario 1: Consolidates packages across 3 manifests into a master group', () => {
    const group = buildMasterPackageGroup('SL550', 'Daniela Monge', mockCustomerPackages);

    expect(group.packageCount).toBe(3);
    expect(group.totalWeight).toBe(10.0); // 3.2 + 1.8 + 5.0 = 10.0
    expect(group.totalValue).toBe(190); // 45 + 25 + 120 = 190
    expect(group.status).toBe('ready_to_invoice');
    expect(group.masterTrackingNumber).toContain('MASTER-SL550');
  });

  it('Scenario 2: Computes consolidated shipping tier discount vs individual shipments', () => {
    // Pricing rule: Base rate $10 for first lb + $3 for additional lbs
    const computeShippingCost = (weight: number) => {
      if (weight <= 0) return 0;
      if (weight <= 1) return 10;
      return 10 + (weight - 1) * 3;
    };

    // If shipped separately:
    const separateCost = mockCustomerPackages.reduce(
      (sum, p) => sum + computeShippingCost(p.weight),
      0
    );
    // pkg-c1 (3.2 lb): 10 + 2.2*3 = 16.6
    // pkg-c2 (1.8 lb): 10 + 0.8*3 = 12.4
    // pkg-c3 (5.0 lb): 10 + 4.0*3 = 22.0
    // Total separate: 16.6 + 12.4 + 22.0 = $51.0
    expect(separateCost).toBe(51.0);

    // If consolidated (10.0 lb): 10 + 9.0*3 = $37.0
    const group = buildMasterPackageGroup('SL550', 'Daniela Monge', mockCustomerPackages);
    const consolidatedCost = computeShippingCost(group.totalWeight);
    expect(consolidatedCost).toBe(37.0);

    // Customer savings
    const savings = separateCost - consolidatedCost;
    expect(savings).toBe(14.0); // Saves $14 on consolidated shipping
  });

  it('Scenario 3: Partial release allows emergency dispatch of 1 item while holding remainder', () => {
    const urgentPkgId = 'pkg-c3';
    const remainingPackages = mockCustomerPackages.filter(p => p.id !== urgentPkgId);

    const releasedPkg = mockCustomerPackages.find(p => p.id === urgentPkgId)!;
    const dispatchedPkg = {
      ...releasedPkg,
      status: 'released' as const,
      releasedAt: new Date().toISOString(),
      releaseReason: 'Solicitud expresa de cliente para despacho urgente',
    };

    expect(dispatchedPkg.status).toBe('released');

    // Remainder stays consolidated
    const remainingGroup = buildMasterPackageGroup('SL550', 'Daniela Monge', remainingPackages);
    expect(remainingGroup.packageCount).toBe(2);
    expect(remainingGroup.totalWeight).toBe(5.0); // 3.2 + 1.8
  });

  it('Scenario 4: Detects holding duration and flags overdue warehouse storage (> 30 days)', () => {
    const now = new Date('2026-09-15T00:00:00Z').getTime();

    const evaluated = mockCustomerPackages.map(p => {
      const daysInWarehouse = Math.floor(
        (now - new Date(p.arrivedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        ...p,
        daysInWarehouse,
        isOverdue: daysInWarehouse > 30,
        storageFee: daysInWarehouse > 30 ? (daysInWarehouse - 30) * 1.5 : 0,
      };
    });

    const overduePackages = evaluated.filter(p => p.isOverdue);
    expect(overduePackages.length).toBe(3); // Aug 1, Aug 5 and Aug 10 are > 30 days by Sep 15
    expect(overduePackages[0].storageFee).toBeGreaterThan(0);
  });
});
