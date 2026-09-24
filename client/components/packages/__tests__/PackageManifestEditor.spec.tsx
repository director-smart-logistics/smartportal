// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PackageManifestEditor } from '../PackageManifestEditor';

// Mock Lucide icons
vi.mock('lucide-react', () => {
  const IconMock = (name: string) => (props: any) => <span data-testid={`icon-${name}`}>{name}</span>;
  return {
    Check: IconMock('Check'),
    CheckCircle2: IconMock('CheckCircle2'),
    Edit2: IconMock('Edit2'),
    FileText: IconMock('FileText'),
    AlertTriangle: IconMock('AlertTriangle'),
    Loader2: IconMock('Loader2'),
    ArrowRightLeft: IconMock('ArrowRightLeft'),
    Layers: IconMock('Layers'),
  };
});

// Mock Popover to render directly in JSDom without Radix portals
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div data-testid="popover-root">{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children, className }: any) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
}));

// Mock AlertDialog
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid="alert-dialog-cancel">
      {children}
    </button>
  ),
  AlertDialogAction: ({ children, onClick, disabled, className }: any) => (
    <button onClick={onClick} disabled={disabled} className={className} data-testid="alert-dialog-action">
      {children}
    </button>
  ),
}));

// Mock Command primitives
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: any) => <div>{children}</div>,
  CommandInput: ({ value, onValueChange, placeholder }: any) => (
    <input
      data-testid="command-input"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
  CommandList: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandItem: ({ children, onSelect, className, value }: any) => (
    <div
      data-testid={`command-item-${value}`}
      className={className}
      onClick={() => onSelect && onSelect(value)}
    >
      {children}
    </div>
  ),
}));

// Mock services
const mockMoveInvoiceToTransitoria = vi.fn();
const mockMoveUnlinkedPackageToTransitoria = vi.fn();
// Default: invoice not found / no linked packages — individual tests override this
// per-case, mirroring exactly what previewPackagesLinkedToInvoice would resolve to
// so these UI tests stay coupled to the REAL contract of the shared preview helper.
const mockPreviewPackagesLinkedToInvoice = vi.fn().mockResolvedValue({
  invoiceExists: false,
  invoiceNumber: '',
  status: '',
  invoiceAlreadyAnnulled: false,
  invoicePaid: false,
  packages: [],
});

vi.mock('@/lib/services/invoice-service', () => ({
  moveInvoiceToTransitoria: (...args: any[]) => mockMoveInvoiceToTransitoria(...args),
  moveUnlinkedPackageToTransitoria: (...args: any[]) => mockMoveUnlinkedPackageToTransitoria(...args),
  previewPackagesLinkedToInvoice: (...args: any[]) => mockPreviewPackagesLinkedToInvoice(...args),
}));

const mockFirestoreApiUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/firebase/firestore-client', () => ({
  firestoreApi: {
    packages: {
      update: (...args: any[]) => mockFirestoreApiUpdate(...args),
    },
  },
}));

const mockMoveBetweenManifests = vi.fn().mockResolvedValue(undefined);
const mockBatchUpdateConsolidation = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/services/manifest-consolidation-service', () => ({
  movePackagesBetweenManifestDocs: (...args: any[]) => mockMoveBetweenManifests(...args),
  batchUpdateConsolidationManifest: (...args: any[]) => mockBatchUpdateConsolidation(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'operator@smartlogistics.com', id: 'op-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock firebase — the component itself only calls doc()/getDoc() directly (the
// one-off annulled-invoice-number fallback lookup); every other Firestore write
// lives behind invoice-service.ts, which is separately mocked above.
const mockGetDoc = vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) });
vi.mock('@/lib/firebase', () => ({ db: {}, app: {} }));
vi.mock('@/lib/firebase/config', () => ({ db: {}, app: {} }));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  deleteField: vi.fn(),
  arrayUnion: vi.fn(),
}));

describe('PackageManifestEditor - Consolidación Transitoria & Existing Flows', () => {
  let queryClient: QueryClient;

  const defaultProps = {
    packageId: 'pkg-123',
    trackingNumber: 'TRK-12345',
    currentManifest: 'MAN-2026-SEP',
    slCode: 'SL-001',
    customerName: 'Juan Perez',
    weight: 2,
    price: 15,
    description: 'Ropa',
    permisos: false,
    manifests: [
      { id: 'MAN-2026-OCT', manifestNumber: 'MAN-2026-OCT' },
      { id: 'MAN-2026-NOV', manifestNumber: 'MAN-2026-NOV' },
    ],
    open: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ── Positive Tests ─────────────────────────────────────────────────────────

  it('renders synthetic option "Consolidación Transitoria" with Virtual badge when not currently in transitoria', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('command-item-consolidacion_transitoria')).toBeDefined();
    expect(screen.getByText('Consolidación Transitoria')).toBeDefined();
    expect(screen.getByText('Virtual')).toBeDefined();
  });

  it('shows "Consolidación Transitoria" labeled as Actual when package is already in consolidacion_transitoria', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor
          {...defaultProps}
          currentManifest="consolidacion_transitoria"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('command-item-consolidacion_transitoria')).toBeDefined();
    expect(screen.getByText('Actual')).toBeDefined();
  });

  it('matches searches with underscore like consolidacion_', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor
          {...defaultProps}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByTestId('command-input'), { target: { value: 'consolidacion_' } });
    expect(screen.getByTestId('command-item-consolidacion_transitoria')).toBeDefined();
  });

  it('moves unlinked package (no invoiceId) directly on confirm without modal', async () => {
    mockMoveUnlinkedPackageToTransitoria.mockResolvedValueOnce(undefined);

    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} invoiceId="" />
      </QueryClientProvider>,
    );

    // Select Consolidación Transitoria
    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    expect(screen.getByText('Paquete sin factura')).toBeDefined();
    expect(screen.getByText(/Será trasladado individualmente/)).toBeDefined();

    // Confirm button
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockMoveUnlinkedPackageToTransitoria).toHaveBeenCalledWith('pkg-123');
    });
    expect(mockMoveInvoiceToTransitoria).not.toHaveBeenCalled();
  });

  it('acknowledges already annulled invoice (annulledInvoiceNumber) instead of claiming package has no invoice', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor
          {...defaultProps}
          invoiceId=""
          annulledInvoiceNumber="SL3506_20260922164239"
          currentManifest="consolidacion_transitoria"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    await waitFor(() => {
      expect(screen.getByText(/SL3506_20260922164239/)).toBeDefined();
      expect(screen.getByText(/ya se encuentra anulada/)).toBeDefined();
      // Must NOT state "Paquete sin factura"
      expect(screen.queryByText(/Paquete sin factura/)).toBeNull();
    });
  });

  it('detects 0 sibling packages for active invoice: shows single package card and confirms directly', async () => {
    mockPreviewPackagesLinkedToInvoice.mockResolvedValueOnce({
      invoiceExists: true,
      invoiceNumber: 'FAC-456',
      status: 'pending',
      invoiceAlreadyAnnulled: false,
      invoicePaid: false,
      packages: [{ id: 'pkg-123', trackingNumber: 'TRK-12345' }],
    });
    mockMoveInvoiceToTransitoria.mockResolvedValueOnce({
      success: true,
      invoiceId: 'inv-456',
      invoiceNumber: 'FAC-456',
      movedTrackings: ['TRK-12345'],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} invoiceId="inv-456" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    await waitFor(() => {
      expect(screen.getByText('Factura con 1 único paquete')).toBeDefined();
      expect(screen.getByText(/su factura asociada será anulada/)).toBeDefined();
    });

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockMoveInvoiceToTransitoria).toHaveBeenCalledWith('inv-456', {
        annulledBy: 'operator@smartlogistics.com',
        reason: 'Movido a Consolidación Transitoria desde celda de Paquetes',
      });
    });
    expect(screen.queryByTestId('alert-dialog')).toBeNull();
  });

  it('detects sibling packages for active invoice: shows multi-package card, opens AlertDialog and requires explicit confirmation', async () => {
    mockPreviewPackagesLinkedToInvoice.mockResolvedValueOnce({
      invoiceExists: true,
      invoiceNumber: 'FAC-456',
      status: 'pending',
      invoiceAlreadyAnnulled: false,
      invoicePaid: false,
      packages: [
        { id: 'pkg-123', trackingNumber: 'TRK-12345' },
        { id: 'pkg-456', trackingNumber: 'TRK-67890' },
        { id: 'pkg-789', trackingNumber: 'TRK-99999' },
      ],
    });
    mockMoveInvoiceToTransitoria.mockResolvedValueOnce({
      success: true,
      invoiceId: 'inv-456',
      invoiceNumber: 'FAC-456',
      movedTrackings: ['TRK-12345', 'TRK-67890', 'TRK-99999'],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} invoiceId="inv-456" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    await waitFor(() => {
      expect(screen.getByText(/Factura multi-paquete \(3 paquetes\)/)).toBeDefined();
      expect(screen.getByText(/\+2 vinculados/)).toBeDefined();
    });

    // Clicking Confirmar in the popover opens the AlertDialog
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId('alert-dialog')).toBeDefined();
    expect(screen.getByText('Mover factura completa a Consolidación Transitoria')).toBeDefined();
    expect(screen.getByText(/• TRK-67890/)).toBeDefined();
    expect(screen.getByText(/• TRK-99999/)).toBeDefined();

    // Confirm in modal
    const modalActionBtn = screen.getByTestId('alert-dialog-action');
    fireEvent.click(modalActionBtn);

    await waitFor(() => {
      expect(mockMoveInvoiceToTransitoria).toHaveBeenCalledWith('inv-456', {
        annulledBy: 'operator@smartlogistics.com',
        reason: 'Movido a Consolidación Transitoria desde celda de Paquetes',
      });
    });
  });

  // ── Negative / Guard Tests ─────────────────────────────────────────────────

  it('cancelling the AlertDialog does NOT call moveInvoiceToTransitoria', async () => {
    mockPreviewPackagesLinkedToInvoice.mockResolvedValueOnce({
      invoiceExists: true,
      invoiceNumber: 'FAC-456',
      status: 'pending',
      invoiceAlreadyAnnulled: false,
      invoicePaid: false,
      packages: [
        { id: 'pkg-123', trackingNumber: 'TRK-12345' },
        { id: 'pkg-456', trackingNumber: 'TRK-67890' },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} invoiceId="inv-456" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    await waitFor(() => {
      expect(screen.getByText(/Factura multi-paquete \(2 paquetes\)/)).toBeDefined();
      expect(screen.getByText(/\+1 vinculados/)).toBeDefined();
    });

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    expect(screen.getByTestId('alert-dialog')).toBeDefined();

    // Cancel in modal
    const cancelBtn = screen.getByTestId('alert-dialog-cancel');
    fireEvent.click(cancelBtn);

    expect(mockMoveInvoiceToTransitoria).not.toHaveBeenCalled();
  });

  // ── Regression Guard: packageId not among the invoice's linked packages ────
  // (this is the real shape of the Invoices-page call site, where this editor is
  // rendered per-INVOICE and `packageId` is the invoice's own doc id, not a real
  // package id — see InvoicesSpreadsheetRow.tsx). The UI must not fabricate a
  // "(this package)" entry that doesn't actually exist among the linked packages,
  // and must count the total from the real linked list, not linkedList.length + 1.

  it('when packageId does not match any linked package, shows the real total without an artificial "this package" line', async () => {
    mockPreviewPackagesLinkedToInvoice.mockResolvedValueOnce({
      invoiceExists: true,
      invoiceNumber: 'FAC-INV-ROW',
      status: 'pending',
      invoiceAlreadyAnnulled: false,
      invoicePaid: false,
      // Neither of these ids equals defaultProps.packageId ("pkg-123") — mirrors
      // the Invoices-page usage where packageId is really the invoice's own id.
      packages: [
        { id: 'real-pkg-A', trackingNumber: 'TRK-AAA' },
        { id: 'real-pkg-B', trackingNumber: 'TRK-BBB' },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} invoiceId="inv-row-999" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    await waitFor(() => {
      // Correct total: 2 real packages, NOT 2 siblings + 1 fabricated "this" entry (=3).
      expect(screen.getByText(/Factura multi-paquete \(2 paquetes\)/)).toBeDefined();
    });

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    // Must NOT show a "(este paquete)" line — packageId isn't really one of the linked packages.
    expect(screen.queryByText(/\(este paquete\)/)).toBeNull();
    expect(screen.getByText(/• TRK-AAA/)).toBeDefined();
    expect(screen.getByText(/• TRK-BBB/)).toBeDefined();
    expect(screen.getByText(/Confirmar y mover todos \(2\)/)).toBeDefined();
  });

  // ── Regression Guard: Already-Annulled Invoice With Orphaned Package ───────
  // This is the exact production incident this feature exists to fix: an invoice
  // gets annulled, but its package's invoiceId link is never cleaned up, so the
  // package never actually reaches consolidacion_transitoria. Re-running the move
  // MUST still relocate the orphaned package — not silently no-op just because the
  // invoice itself is already annulled.

  it('still moves the package when the invoice is ALREADY annulled (orphaned-package recovery)', async () => {
    mockPreviewPackagesLinkedToInvoice.mockResolvedValueOnce({
      invoiceExists: true,
      invoiceNumber: 'FAC-ORPHAN-001',
      status: 'annulled',
      invoiceAlreadyAnnulled: true,
      invoicePaid: false,
      packages: [{ id: 'pkg-123', trackingNumber: 'TRK-12345' }],
    });
    mockMoveInvoiceToTransitoria.mockResolvedValueOnce({
      success: true,
      invoiceId: 'inv-orphan',
      invoiceNumber: 'FAC-ORPHAN-001',
      movedTrackings: ['TRK-12345'],
      invoiceAlreadyAnnulled: true,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} invoiceId="inv-orphan" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('command-item-consolidacion_transitoria'));

    // Wait for the sibling-detection preview to settle before confirming — the
    // Confirmar button stays disabled while loadingSiblings is true.
    await waitFor(() => {
      expect(screen.getByText('Factura con 1 único paquete')).toBeDefined();
    });

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    // Must still call moveInvoiceToTransitoria — an already-annulled invoice is
    // NOT treated as "nothing to do".
    await waitFor(() => {
      expect(mockMoveInvoiceToTransitoria).toHaveBeenCalledWith('inv-orphan', {
        annulledBy: 'operator@smartlogistics.com',
        reason: 'Movido a Consolidación Transitoria desde celda de Paquetes',
      });
    });
  });

  // ── Regression Guard: Existing Regular Manifest Move Flow ──────────────────

  it('preserves existing regular manifest move flow when selecting a standard manifest', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PackageManifestEditor {...defaultProps} />
      </QueryClientProvider>,
    );

    // Select standard manifest MAN-2026-OCT
    fireEvent.click(screen.getByTestId('command-item-MAN-2026-OCT'));

    expect(screen.getByText(/Destino:/)).toBeDefined();
    expect(screen.getAllByText('MAN-2026-OCT').length).toBeGreaterThanOrEqual(1);

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      // Must call regular package update on Firestore
      expect(mockFirestoreApiUpdate).toHaveBeenCalledWith(
        'pkg-123',
        expect.objectContaining({
          manifestNumber: 'MAN-2026-OCT',
          manifestId: 'MAN-2026-OCT',
          updatedManifest: 'MAN-2026-OCT',
        }),
      );
      // Must call regular move between manifest docs
      expect(mockMoveBetweenManifests).toHaveBeenCalledWith(
        ['TRK-12345'],
        'MAN-2026-SEP',
        'MAN-2026-OCT',
      );
      // Must call consolidation manifest batch update
      expect(mockBatchUpdateConsolidation).toHaveBeenCalledWith(
        ['TRK-12345'],
        'MAN-2026-OCT',
      );
    });

    // Must NOT call transitoria functions
    expect(mockMoveInvoiceToTransitoria).not.toHaveBeenCalled();
    expect(mockMoveUnlinkedPackageToTransitoria).not.toHaveBeenCalled();
  });
});
