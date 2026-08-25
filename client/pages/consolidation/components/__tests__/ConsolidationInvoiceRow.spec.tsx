// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsolidationInvoiceRow } from '../ConsolidationInvoiceRow';
import type { ConsolidationInvoice, ConsolidationPackage } from '../types';
import { writeBatch } from 'firebase/firestore';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';

// Mock Lucide icons using a flat mocked object to avoid proxy recursion
vi.mock('lucide-react', () => {
  const IconMock = (name: string) => (props: any) => <span>{name}</span>;
  return {
    FileText: IconMock('FileText'),
    ChevronRight: IconMock('ChevronRight'),
    ChevronDown: IconMock('ChevronDown'),
    Lock: IconMock('Lock'),
    Loader2: IconMock('Loader2'),
    Undo2: IconMock('Undo2'),
    Trash2: IconMock('Trash2'),
    RotateCcw: IconMock('RotateCcw'),
    X: IconMock('X'),
    AlertCircle: IconMock('AlertCircle'),
    Building: IconMock('Building'),
    CheckCircle: IconMock('CheckCircle'),
    ExternalLink: IconMock('ExternalLink'),
    ShieldAlert: IconMock('ShieldAlert'),
    CheckCheck: IconMock('CheckCheck'),
    CheckCircle2: IconMock('CheckCircle2'),
    MoveRight: IconMock('MoveRight'),
    Scale: IconMock('Scale'),
    DollarSign: IconMock('DollarSign'),
    GripVertical: IconMock('GripVertical'),
    AlertTriangle: IconMock('AlertTriangle'),
    Ban: IconMock('Ban'),
    Package: IconMock('Package'),
    ArrowRightLeft: IconMock('ArrowRightLeft'),
  };
});

// Mock Tooltip components to render children simply without Radix portals
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

// Mock FeatureFlagsContext
vi.mock('@/lib/context/FeatureFlagsContext', () => ({
  useFeatureFlag: vi.fn((flag) => flag === 'routeReturnsModule'),
}));

// Mock toast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock firebase firestore
const mockUpdate = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = {
  update: mockUpdate,
  commit: mockCommit,
};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, col, id) => ({ __doc: id, col })),
  writeBatch: vi.fn(() => mockBatch),
  arrayUnion: vi.fn((...args) => args),
  deleteField: vi.fn(() => 'MOCK_DELETE_FIELD'),
}));

// Mock firebase functions and config
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('@/lib/firebase/index', () => ({
  db: {},
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  app: {},
  sp2App: null,
}));

vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {},
}));

// Mock services to isolate the component under test
vi.mock('@/lib/services/sync-invoices-service', () => ({
  pushStatusToSp2: vi.fn(),
  deleteInvoiceFromSp2: vi.fn(),
}));

vi.mock('@/lib/services/sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/components/packages/PackageTraceDialog', () => ({
  PackageTraceDialog: () => <div data-testid="package-trace-dialog" />,
}));

const mockInvoice: ConsolidationInvoice = {
  id: 'inv-123',
  invoiceNumber: 'INV-123',
  totalAmount: 100,
  currency: 'USD',
  status: 'draft',
  isConsolidation: true,
  manifestNumber: 'MF-29-06',
  invoiceItems: [
    { trackingNumber: 'TRACK-1', quantity: 1, unitPrice: 100, totalPrice: 100 }
  ],
};

const mockMatchedPackages: ConsolidationPackage[] = [
  {
    id: 'pkg-1',
    trackingNumber: 'TRACK-1',
    status: 'consolidated',
    weight: 2.5,
    description: 'Test Package',
    ruta: 'Ruta 1',
    manifestNumber: 'MF-29-06',
    invoiceId: 'inv-123',
    invoiceNumber: 'INV-123',
    invoiceStatus: 'draft',
  } as any
];

describe('ConsolidationInvoiceRow — Return Packages and Reassign Manifest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Devolver Paquetes option and executes correct updates when manifest is reassigned', async () => {
    // Mock user confirmation and manifest input prompt
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('MF-30-06');

    render(
      <ConsolidationInvoiceRow
        invoice={mockInvoice}
        matchedPackages={mockMatchedPackages}
        manifestNumber="MF-29-06"
        customerSlCode="SL123"
        customerName="Client Name"
      />
    );

    // Locate the return packages button
    const returnBtn = screen.getByRole('button', { name: /Devolver paquetes de factura/i });
    expect(returnBtn).toBeTruthy();

    // Trigger the click event
    fireEvent.click(returnBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(promptSpy).toHaveBeenCalledWith(
      expect.stringContaining('manifiesto de destino'),
      'MF-29-06'
    );

    await waitFor(() => {
      // Assert that Firestore updates are called in batch
      expect(mockUpdate).toHaveBeenCalled();
    });

    // Check invoice updates
    const invoiceUpdateCall = mockUpdate.mock.calls.find(
      (call) => call[0].col === 'invoices' && call[0].__doc === 'inv-123'
    );
    expect(invoiceUpdateCall).toBeDefined();
    expect(invoiceUpdateCall[1]).toMatchObject({
      manifestNumber: 'MF-30-06',
      manifestNumbers: ['MF-30-06'],
    });

    // Check package updates (re-assigned manifest, kept invoiceId, set returned)
    const packageUpdateCall = mockUpdate.mock.calls.find(
      (call) => call[0].col === 'packages' && call[0].__doc === 'pkg-1'
    );
    expect(packageUpdateCall).toBeDefined();
    expect(packageUpdateCall[1]).toMatchObject({
      status: 'returned',
      deliveryStatus: 'returned',
      manifestNumber: 'MF-30-06',
      manifestId: 'MF-30-06',
      updatedManifest: 'MF-30-06',
    });

    // Verify invoice fields are preserved and NOT deleted
    const keys = Object.keys(packageUpdateCall[1]);
    expect(keys).not.toContain('invoiceId');
    expect(keys).not.toContain('invoiceNumber');
    expect(keys).not.toContain('invoiceStatus');

    // Verify synchronization to SmartWeb/SP2 is called with the target manifest
    expect(syncPackagesToSmartWeb).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pkg-1',
          trackingNumber: 'TRACK-1',
          status: 'returned',
          manifestNumber: 'MF-30-06',
        })
      ])
    );
  });
});
