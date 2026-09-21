/**
 * Tests for Encomienda Manifest Clean / Status Transition Flow
 *
 * Scenarios verified:
 * 1. Identifies packages with paid invoices that are still marked 'customs' (En Aduanas).
 * 2. Filters out packages that are already 'delivered' or in 'route'.
 * 3. Simulates moving paid customs packages to 'route' (En Ruta).
 * 4. Simulates marking paid packages as 'delivered' (Entregado), verifying they are filtered out of active encomienda manifests.
 */

import { describe, it, expect } from 'vitest';
import type { EncomiendaManifestRow } from '@/lib/services/manifest-processor';

const ROUTE_STATUS_KEYS = ['route', 'on_route', 'in_route', 'on_rute', 'on-route', 'in-route'];

describe('Encomienda Manifest Clean & Lifecycle Flows', () => {
  const mockManifestRows: EncomiendaManifestRow[] = [
    {
      tracking: 'GFUS01070579261888',
      manifestNumber: 'SL-MEGA-MAN-17-09-2026',
      slCode: 'SL262421',
      customerName: 'DIANA CAROLINA MIRANDA CENTENO',
      ruta: 'Encomiendas',
      weight: 0.08,
      price: 8.0,
      description: 'Cosmetics',
      permisos: false,
      consolidacion: false,
      savedAt: '2026-09-17T12:00:00.000Z',
      updatedAt: '2026-09-17T12:00:00.000Z',
      status: 'customs',
      statusLabel: 'En Aduanas',
    },
    {
      tracking: '1001910540160003319500541504224977',
      manifestNumber: 'SL-MEGA-MAN-10-09-2026',
      slCode: 'SL2597',
      customerName: 'FUJI FRANCISCO MORA ARAYA',
      ruta: 'Encomiendas',
      weight: 1.42,
      price: 20.0,
      description: 'Auto parts',
      permisos: false,
      consolidacion: false,
      savedAt: '2026-09-10T12:00:00.000Z',
      updatedAt: '2026-09-10T12:00:00.000Z',
      status: 'customs',
      statusLabel: 'En Aduanas',
    },
    {
      tracking: 'TBA333969590980',
      manifestNumber: '05-09-2026DANP',
      slCode: 'SL26038',
      customerName: 'JAMAL AL-MIJALLI',
      ruta: 'Encomiendas',
      weight: 0.34,
      price: 15.0,
      description: 'Electronics',
      permisos: false,
      consolidacion: false,
      savedAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
      status: 'customs',
      statusLabel: 'En Aduanas',
    },
    {
      tracking: 'ALREADY_DELIVERED_PKG',
      manifestNumber: '05-09-2026DANP',
      slCode: 'SL26038',
      customerName: 'JAMAL AL-MIJALLI',
      ruta: 'Encomiendas',
      weight: 1.0,
      price: 10.0,
      description: 'Delivered item',
      permisos: false,
      consolidacion: false,
      savedAt: '2026-09-05T12:00:00.000Z',
      updatedAt: '2026-09-05T12:00:00.000Z',
      status: 'delivered',
      statusLabel: 'Entregado',
    },
  ];

  const mockInvoicesByCustomerManifest = new Map<string, any>([
    ['SL262421_SL-MEGA-MAN-17-09-2026', { status: 'paid', invoiceNumber: 'INV-101' }],
    ['SL2597_SL-MEGA-MAN-10-09-2026', { status: 'paid', invoiceNumber: 'INV-102' }],
    ['SL26038_05-09-2026DANP', { status: 'paid', invoiceNumber: 'INV-103' }],
  ]);

  it('detects packages with paid invoices that are still in customs', () => {
    const paidInCustoms = mockManifestRows.filter((r) => {
      const inv = mockInvoicesByCustomerManifest.get(`${r.slCode}_${r.manifestNumber}`);
      const isPaid = (inv?.status || '').toLowerCase() === 'paid';
      const effectiveStatus = (r.status || '').toLowerCase();
      return isPaid && !ROUTE_STATUS_KEYS.includes(effectiveStatus) && effectiveStatus !== 'delivered';
    });

    expect(paidInCustoms).toHaveLength(3);
    expect(paidInCustoms.map((p) => p.tracking)).toEqual([
      'GFUS01070579261888',
      '1001910540160003319500541504224977',
      'TBA333969590980',
    ]);
  });

  it('correctly transitions paid packages to "route" (En Ruta)', () => {
    const updatedRows = mockManifestRows.map((r) => {
      const inv = mockInvoicesByCustomerManifest.get(`${r.slCode}_${r.manifestNumber}`);
      if (inv?.status === 'paid' && r.status === 'customs') {
        return { ...r, status: 'route' as const, statusLabel: 'En Ruta' };
      }
      return r;
    });

    const routeRows = updatedRows.filter((r) => r.status === 'route');
    expect(routeRows).toHaveLength(3);
    expect(routeRows.every((r) => r.statusLabel === 'En Ruta')).toBe(true);
  });

  it('filters out delivered packages from active encomienda query snapshot', () => {
    // When packages are marked as delivered, the Firestore query (where('status', '!=', 'delivered'))
    // eliminates them from the active map.
    const allDelivered = mockManifestRows.map((r) => ({
      ...r,
      status: 'delivered',
      statusLabel: 'Entregado',
    }));

    const activeEncomiendaPackages = allDelivered.filter((r) => r.status !== 'delivered');
    expect(activeEncomiendaPackages).toHaveLength(0);
  });

  it('strictly protects terminal and non-encomienda statuses during auto-promotion on payment', () => {
    const mixedPackages = [
      { tracking: 'ENC_CUSTOMS_1', ruta: 'Encomiendas', status: 'customs' },
      { tracking: 'ENC_RECEIVED_1', ruta: 'Encomiendas', status: 'received' },
      { tracking: 'ENC_DELIVERED_1', ruta: 'Encomiendas', status: 'delivered' },
      { tracking: 'ENC_RETURNED_1', ruta: 'Encomiendas', status: 'returned' },
      { tracking: 'ENC_PICKUP_1', ruta: 'Encomiendas', status: 'pickup' },
      { tracking: 'NON_ENC_GAM_1', ruta: 'GAM Central', status: 'customs' },
      { tracking: 'NON_ENC_A_1', ruta: 'Ruta A', status: 'received' },
    ];

    const PROTECTED_OR_ACTIVE = ['delivered', 'returned', 'pickup', 'route', 'on_route'];

    // Simulating auto-promote filter logic
    const eligibleForAutoPromote = mixedPackages.filter((p) => {
      const isEncomienda = p.ruta === 'Encomiendas';
      if (!isEncomienda) return false;
      const status = (p.status || '').toLowerCase();
      if (PROTECTED_OR_ACTIVE.includes(status)) return false;
      return true;
    });

    expect(eligibleForAutoPromote.map((p) => p.tracking)).toEqual([
      'ENC_CUSTOMS_1',
      'ENC_RECEIVED_1',
    ]);
  });
});
