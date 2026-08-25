// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConsolidationCustomerCard } from '../ConsolidationCustomerCard';
import type { CustomerSection } from '../types';

// Mock Lucide icons
vi.mock('lucide-react', () => {
  const IconMock = (name: string) => (props: any) => <span>{name}</span>;
  return {
    ArrowRightLeft: IconMock('ArrowRightLeft'),
    Package: IconMock('Package'),
    Scale: IconMock('Scale'),
    AlertTriangle: IconMock('AlertTriangle'),
    CheckCircle: IconMock('CheckCircle'),
    XCircle: IconMock('XCircle'),
    Loader2: IconMock('Loader2'),
    Info: IconMock('Info'),
    FileText: IconMock('FileText'),
    Layers: IconMock('Layers'),
    Shield: IconMock('Shield'),
    Search: IconMock('Search'),
    X: IconMock('X'),
    ChevronDown: IconMock('ChevronDown'),
    FileSpreadsheet: IconMock('FileSpreadsheet'),
    Ship: IconMock('Ship'),
    User: IconMock('User'),
    ChevronRight: IconMock('ChevronRight'),
    DollarSign: IconMock('DollarSign'),
    Clock: IconMock('Clock'),
    GripVertical: IconMock('GripVertical'),
    Lock: IconMock('Lock'),
    MapPin: IconMock('MapPin'),
    Truck: IconMock('Truck'),
    Calendar: IconMock('Calendar'),
  };
});

// Mock Tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

// Mock CopyButton
vi.mock('@/components/ui/copy-button', () => ({
  CopyButton: () => <span>CopyButton</span>,
}));

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock ManifestPicker simply as a standard select to avoid Radix UI Popover / JSDom hanging
vi.mock('@/components/manifest/ManifestPicker', () => ({
  ManifestPicker: ({ allManifestNumbers, selectedManifests, onManifestsChange, allLabel, id }: {
    allManifestNumbers: string[];
    selectedManifests: Set<string>;
    onManifestsChange: (v: Set<string>) => void;
    allLabel?: string;
    id?: string;
  }) => {
    return (
      <select
        id={id}
        value={Array.from(selectedManifests)[0] || ''}
        onChange={(e) => onManifestsChange(new Set([e.target.value]))}
      >
        <option value="">{allLabel}</option>
        {allManifestNumbers.map((m: string) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    );
  }
}));

// Mock firebase firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ __doc: id, col })),
  getDoc: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {},
}));

// Mock services
vi.mock('@/lib/services/sync-invoices-service', () => ({
  pushStatusToSp2: vi.fn(),
}));
vi.mock('@/lib/services/sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn(),
}));

const mockCustomerSection: CustomerSection = {
  customer: {
    id: 'cust-100',
    slCode: 'SL100',
    fullName: 'Juan Lopez',
    ruta: 'Alajuela',
    email: 'juan@lopez.com',
  },
  lookupPackages: [
    {
      id: 'pkg-active-1',
      trackingNumber: 'SL-ACTIVE-1',
      status: 'consolidated',
      weight: 5.0,
      price: 15.0,
      invoicedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    } as any,
    {
      id: 'pkg-warning-3',
      trackingNumber: 'SL-WARNING-3',
      status: 'consolidated',
      weight: 4.0,
      price: 12.0,
      invoicedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    } as any,
    {
      id: 'pkg-expired-2',
      trackingNumber: 'SL-EXPIRED-2',
      status: 'consolidated',
      weight: 3.5,
      price: 10.0,
      invoicedAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString(),
    } as any,
  ],
  manifestGroups: [
    {
      manifestNumber: 'consolidacion_transitoria',
      packages: [
        {
          id: 'pkg-active-1',
          trackingNumber: 'SL-ACTIVE-1',
          status: 'consolidated',
          weight: 5.0,
          price: 15.0,
          invoicedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        } as any,
        {
          id: 'pkg-warning-3',
          trackingNumber: 'SL-WARNING-3',
          status: 'consolidated',
          weight: 4.0,
          price: 12.0,
          invoicedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        } as any,
        {
          id: 'pkg-expired-2',
          trackingNumber: 'SL-EXPIRED-2',
          status: 'consolidated',
          weight: 3.5,
          price: 10.0,
          invoicedAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString(),
        } as any,
      ],
      invoices: [],
    },
  ],
  totalPackages: 3,
  totalWeight: 12.5,
  totalAmount: 37.0,
  manifestCount: 1,
};

describe('ConsolidationCustomerCard — Timing and Storage Charges', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders package row details with correct grace periods, storage charges, and dynamic colors', () => {
    render(
      <ConsolidationCustomerCard
        section={mockCustomerSection}
        gracePeriodDays={14}
        dailyStorageCharge={1.50}
        defaultOpen={true}
      />
    );

    // Verify package SL-ACTIVE-1 (3 days -> Green)
    expect(screen.getByText(/SL-ACTIVE-1/i)).toBeTruthy();
    const activeDaysBadge = screen.getByText('Días: 3').closest('div, span');
    expect(activeDaysBadge?.className).toContain('bg-emerald-50');

    // Verify package SL-WARNING-3 (7 days -> Yellow)
    expect(screen.getByText(/SL-WARNING-3/i)).toBeTruthy();
    const warningDaysBadge = screen.getByText('Días: 7').closest('div, span');
    expect(warningDaysBadge?.className).toContain('bg-amber-50');

    // Verify package SL-EXPIRED-2 (17 days -> Red)
    expect(screen.getByText(/SL-EXPIRED-2/i)).toBeTruthy();
    const expiredDaysBadge = screen.getByText('Días: 17').closest('div, span');
    expect(expiredDaysBadge?.className).toContain('bg-red-50');
    expect(screen.getByText(/Bodegaje: \+\$4\.50 \(3 d vencidos\)/i)).toBeTruthy();
  });

  it('adjusts ranges dynamically when gracePeriodDays is short (e.g., 3 days)', () => {
    render(
      <ConsolidationCustomerCard
        section={mockCustomerSection}
        gracePeriodDays={3}
        dailyStorageCharge={2.00}
        defaultOpen={true}
      />
    );

    // gp = 3, greenLimit = 1, yellowLimit = 2
    // pkg-active-1 (3 days in consolidation) -> days (3) > yellowLimit (2) -> Red
    const activeDaysBadge = screen.getByText('Días: 3').closest('div, span');
    expect(activeDaysBadge?.className).toContain('bg-red-50');
  });

  it('handles dailyStorageCharge = 0 (free storage) correctly', () => {
    render(
      <ConsolidationCustomerCard
        section={mockCustomerSection}
        gracePeriodDays={10}
        dailyStorageCharge={0}
        defaultOpen={true}
      />
    );

    // SL-EXPIRED-2 has 17 days -> 7 days expired. But dsc is 0, so charge must be $0.00
    expect(screen.getByText(/Bodegaje: \+\$0\.00 \(7 d vencidos\)/i)).toBeTruthy();
  });

  it('does not crash and executes fallback if date fields are missing/empty', () => {
    const sectionWithMissingDates: CustomerSection = {
      ...mockCustomerSection,
      lookupPackages: [
        {
          id: 'pkg-no-date',
          trackingNumber: 'SL-NO-DATE',
          status: 'consolidated',
          weight: 1.0,
          price: 5.0,
        } as any,
      ],
      manifestGroups: [
        {
          manifestNumber: 'consolidacion_transitoria',
          packages: [
            {
              id: 'pkg-no-date',
              trackingNumber: 'SL-NO-DATE',
              status: 'consolidated',
              weight: 1.0,
              price: 5.0,
            } as any,
          ],
          invoices: [],
        },
      ],
      totalPackages: 1,
      totalWeight: 1.0,
      totalAmount: 5.0,
      manifestCount: 1,
    };

    render(
      <ConsolidationCustomerCard
        section={sectionWithMissingDates}
        gracePeriodDays={14}
        dailyStorageCharge={1.50}
        defaultOpen={true}
      />
    );

    expect(screen.getByText(/SL-NO-DATE/i)).toBeTruthy();
    expect(screen.getByText('Días: 0')).toBeTruthy();
  });

  it('extracts the original invoice date from the invoice number if available', () => {
    const sectionWithInvoiceNumber: CustomerSection = {
      ...mockCustomerSection,
      lookupPackages: [
        {
          id: 'pkg-with-inv-num',
          trackingNumber: 'GFUS01063074222530',
          status: 'consolidated',
          weight: 0.26,
          price: 5.20,
          annulledInvoiceNumber: 'SL26649-20260803205954201-C',
        } as any,
      ],
      manifestGroups: [
        {
          manifestNumber: 'consolidacion_transitoria',
          packages: [
            {
              id: 'pkg-with-inv-num',
              trackingNumber: 'GFUS01063074222530',
              status: 'consolidated',
              weight: 0.26,
              price: 5.20,
              annulledInvoiceNumber: 'SL26649-20260803205954201-C',
            } as any,
          ],
          invoices: [],
        },
      ],
      totalPackages: 1,
      totalWeight: 0.26,
      totalAmount: 5.20,
      manifestCount: 1,
    };

    render(
      <ConsolidationCustomerCard
        section={sectionWithInvoiceNumber}
        gracePeriodDays={14}
        dailyStorageCharge={1.50}
        defaultOpen={true}
      />
    );

    // Verify package GFUS01063074222530 renders the correct parsed invoice date "03/08/2026"
    expect(screen.getByText(/GFUS01063074222530/i)).toBeTruthy();
    expect(screen.getByText(/Día 1: 03\/08\/2026/i)).toBeTruthy();
  });

  it('renders isolated and independent Day 0/1 dates for multiple packages in the same customer card', () => {
    const multiPackageSection: CustomerSection = {
      ...mockCustomerSection,
      lookupPackages: [
        {
          id: 'pkg-1-early',
          trackingNumber: 'GFUS01065414791748',
          status: 'consolidated',
          weight: 0.11,
          price: 2.22,
          firstConsolidatedAt: '2026-08-11T12:00:00-06:00',
          manifestUpdatedAt: '2026-08-19T12:54:37.093Z',
        } as any,
        {
          id: 'pkg-2-late',
          trackingNumber: 'GFUS01065680788992',
          status: 'consolidated',
          weight: 1.05,
          price: 21.78,
          firstConsolidatedAt: '2026-08-19T12:00:00-06:00',
          manifestUpdatedAt: '2026-08-19T12:54:37.093Z',
        } as any,
      ],
      manifestGroups: [
        {
          manifestNumber: 'consolidacion_transitoria',
          packages: [
            {
              id: 'pkg-1-early',
              trackingNumber: 'GFUS01065414791748',
              status: 'consolidated',
              weight: 0.11,
              price: 2.22,
              firstConsolidatedAt: '2026-08-11T12:00:00-06:00',
              manifestUpdatedAt: '2026-08-19T12:54:37.093Z',
            } as any,
            {
              id: 'pkg-2-late',
              trackingNumber: 'GFUS01065680788992',
              status: 'consolidated',
              weight: 1.05,
              price: 21.78,
              firstConsolidatedAt: '2026-08-19T12:00:00-06:00',
              manifestUpdatedAt: '2026-08-19T12:54:37.093Z',
            } as any,
          ],
          invoices: [],
        },
      ],
      totalPackages: 2,
      totalWeight: 1.16,
      totalAmount: 24.00,
      manifestCount: 1,
    };

    render(
      <ConsolidationCustomerCard
        section={multiPackageSection}
        gracePeriodDays={14}
        dailyStorageCharge={1.50}
        defaultOpen={true}
      />
    );

    // Both trackings must be present
    expect(screen.getByText(/GFUS01065414791748/i)).toBeTruthy();
    expect(screen.getByText(/GFUS01065680788992/i)).toBeTruthy();

    // Package 1 must preserve its 11/08/2026 date
    expect(screen.getByText(/Día 1: 11\/08\/2026/i)).toBeTruthy();
    // Package 2 must preserve its 19/08/2026 date
    expect(screen.getByText(/Día 1: 19\/08\/2026/i)).toBeTruthy();
  });

  it('correctly extracts earliest consolidation date from statusHistory audit trail', () => {
    const sectionWithAuditTrail: CustomerSection = {
      ...mockCustomerSection,
      lookupPackages: [
        {
          id: 'pkg-with-history',
          trackingNumber: 'GFUS01069999999999',
          status: 'consolidated',
          weight: 0.5,
          price: 10.00,
          manifestUpdatedAt: '2026-08-19T12:54:37.093Z',
          statusHistory: [
            {
              status: 'customs',
              changedAt: '2026-08-05T10:00:00Z',
              note: 'Paquete en aduanas',
            },
            {
              status: 'consolidated',
              changedAt: '2026-08-08T15:00:00Z',
              note: 'Factura SL26559-20260808120000000-C anulada — movido a consolidación',
            },
            {
              status: 'consolidated',
              changedAt: '2026-08-19T12:54:37Z',
              note: 'Factura SL26559-20260819120000000-C anulada desde panel de facturas',
            },
          ],
        } as any,
      ],
      manifestGroups: [
        {
          manifestNumber: 'consolidacion_transitoria',
          packages: [
            {
              id: 'pkg-with-history',
              trackingNumber: 'GFUS01069999999999',
              status: 'consolidated',
              weight: 0.5,
              price: 10.00,
              manifestUpdatedAt: '2026-08-19T12:54:37.093Z',
              statusHistory: [
                {
                  status: 'customs',
                  changedAt: '2026-08-05T10:00:00Z',
                  note: 'Paquete en aduanas',
                },
                {
                  status: 'consolidated',
                  changedAt: '2026-08-08T15:00:00Z',
                  note: 'Factura SL26559-20260808120000000-C anulada — movido a consolidación',
                },
                {
                  status: 'consolidated',
                  changedAt: '2026-08-19T12:54:37Z',
                  note: 'Factura SL26559-20260819120000000-C anulada desde panel de facturas',
                },
              ],
            } as any,
          ],
          invoices: [],
        },
      ],
      totalPackages: 1,
      totalWeight: 0.5,
      totalAmount: 10.00,
      manifestCount: 1,
    };

    render(
      <ConsolidationCustomerCard
        section={sectionWithAuditTrail}
        gracePeriodDays={14}
        dailyStorageCharge={1.50}
        defaultOpen={true}
      />
    );

    // Verify it extracted the earliest annulled invoice date 08/08/2026, NOT the latest 19/08/2026
    expect(screen.getByText(/GFUS01069999999999/i)).toBeTruthy();
    expect(screen.getByText(/Día 1: 08\/08\/2026/i)).toBeTruthy();
  });

  it('renders package from an annulled invoice as unblocked and movable', () => {
    const sectionWithAnnulled: CustomerSection = {
      customer: {
        id: 'cust-sl2565',
        name: 'WILSON JOSUE GONZALEZ AGUIRRE',
        slCode: 'SL2565',
        email: 'wilson@example.com',
        phone: '12345678',
        destination: 'San Jose Centro',
        consolidationEnabled: true,
      },
      lookupPackages: [],
      manifestGroups: [
        {
          manifestNumber: 'CONSOLIDACION_TRANSITORIA',
          packages: [
            {
              id: 'pkg-gfwo',
              trackingNumber: 'GFUS01067392160197',
              status: 'consolidated',
              weight: 0.46,
              price: 8.00,
              annulledInvoiceNumber: 'SL2565-20260821191605309',
              // Notice invoiceId and invoiceStatus are undefined because the invoice was annulled
            } as any,
          ],
          invoices: [],
        },
      ],
      totalPackages: 1,
      totalWeight: 0.46,
      totalAmount: 8.00,
      manifestCount: 1,
    };

    render(
      <ConsolidationCustomerCard
        section={sectionWithAnnulled}
        defaultOpen={true}
        onMovePackage={vi.fn()}
      />
    );

    expect(screen.getByText(/GFUS01067392160197/i)).toBeTruthy();
    // Should NOT show "Desbloquear" or lock icon
    expect(screen.queryByText(/Desbloquear/i)).toBeNull();
    // Should show "Mover manifiesto" button
    expect(screen.getByText(/Mover manifiesto/i)).toBeTruthy();
  });
});

