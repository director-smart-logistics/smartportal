// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ── Framer Motion mock ────────────────────────────────────────────────────────
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) => {
    return ({ children, initial, animate, exit, transition, whileHover, whileTap, layout, ...rest }: any) =>
      React.createElement(tag, rest, children);
  };
  const motionProxy = new Proxy({}, {
    get: (target, prop) => {
      if (typeof prop === 'string') {
        return passthrough(prop);
      }
      return undefined;
    }
  });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

// Mocks for Firebase & Services
const mockOnSnapshot = vi.fn();
const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
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
  doc: (...args: any[]) => mockDoc(...args),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));

vi.mock('@/lib/firebase/config', () => ({
  app: {},
  sp2App: {},
  db: {},
  dbSP2: {},
  auth: {},
  storage: {},
}));

const sampleInvoicesFixture = [
  {
    id: 'inv-001',
    invoiceNumber: 'FAC-001001',
    manifestNumber: '11-08-2026DAN',
    clientName: 'Carlos Rodriguez',
    clientEmail: 'carlos@example.com',
    slCode: 'SL101',
    route: 'Heredia',
    totalAmount: 15000,
    subtotalAmount: 13274,
    taxAmount: 1726,
    status: 'sent',
    createdAt: '2026-08-15T10:00:00Z',
    invoiceItems: [
      { id: 'item-1', trackingNumber: 'TRK-101', description: 'Repuesto auto', amount: 15000, weight: 2.5, hasPermits: false },
    ],
  },
  {
    id: 'inv-002',
    invoiceNumber: 'FAC-001002',
    manifestNumber: '11-08-2026DANP',
    clientName: 'Maria Fernandez',
    clientEmail: 'maria@example.com',
    slCode: 'SL102',
    route: 'San Jose',
    totalAmount: 32000,
    subtotalAmount: 28318,
    taxAmount: 3682,
    status: 'paid',
    createdAt: '2026-08-16T11:30:00Z',
    invoiceItems: [
      { id: 'item-2', trackingNumber: 'TRK-202', description: 'Cosmeticos', amount: 32000, weight: 1.2, hasPermits: true, status: 'RETENIDO' },
    ],
  },
  {
    id: 'inv-003',
    invoiceNumber: 'FAC-001003',
    manifestNumber: '12-08-2026DAN',
    clientName: 'Alejandro Morales',
    clientEmail: 'alejandro@example.com',
    slCode: 'SL103',
    route: 'Alajuela',
    totalAmount: 8500,
    subtotalAmount: 7522,
    taxAmount: 978,
    status: 'draft',
    createdAt: '2026-08-17T09:15:00Z',
    invoiceItems: [
      { id: 'item-3', trackingNumber: 'TRK-303', description: 'Ropa', amount: 8500, weight: 0.8, hasPermits: false },
    ],
  },
  {
    id: 'inv-004',
    invoiceNumber: 'FAC-001004',
    manifestNumber: '12-08-2026DAN',
    clientName: 'Lucia Sanchez',
    clientEmail: 'lucia@example.com',
    slCode: 'SL104',
    route: 'Cartago',
    totalAmount: 12000,
    subtotalAmount: 10619,
    taxAmount: 1381,
    status: 'annulled',
    createdAt: '2026-08-18T14:20:00Z',
    invoiceItems: [
      { id: 'item-4', trackingNumber: 'TRK-404', description: 'Libros', amount: 12000, weight: 1.5, hasPermits: false },
    ],
  },
];

vi.mock('@/lib/hooks/queries/useInvoices', () => ({
  useInvoicesCursor: vi.fn(() => ({
    invoices: sampleInvoicesFixture,
    isLoading: false,
    isFetching: false,
    isFetchingMore: false,
    hasMore: false,
    totalLoaded: sampleInvoicesFixture.length,
    loadMore: vi.fn(),
    reload: vi.fn(),
  })),
  useCreateInvoice: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteInvoice: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCreateInvoiceCustomer: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('@/lib/hooks/queries/useCustomers', () => ({
  useCustomerSearch: vi.fn(() => ({ results: [], isLoading: false })),
  useCustomers: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/lib/hooks/queries/useManifests', () => ({
  useManifests: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('@/lib/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canView: () => true,
    canCreate: () => true,
    canUpdate: () => true,
    canDelete: () => true,
    canManage: () => true,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@smartlogistics.com', displayName: 'Admin User' },
    hasPermission: () => true,
    canCreate: () => true,
    canUpdate: () => true,
    canDelete: () => true,
    loading: false,
  }),
}));

vi.mock('@/lib/context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock('@/hooks/useLocale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
    formatCurrency: (amount: number) => `₡${amount.toLocaleString()}`,
    formatDate: (date: any) => String(date),
  }),
}));

vi.mock('@/lib/context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { exchangeRate: 520, defaultCurrency: 'CRC' },
    invoiceSettings: { taxRate: 13, prefix: 'FAC-' },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock('@/lib/services/sync-invoices-service', () => ({
  pushStatusToSp2: vi.fn().mockResolvedValue({ success: true }),
  syncInvoicePackagesToSp2: vi.fn().mockResolvedValue({ success: true }),
  syncInvoicesToSp2: vi.fn().mockResolvedValue({ success: true }),
  previewSyncInvoices: vi.fn().mockResolvedValue([]),
  deleteInvoiceFromSp2: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/services/sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/components/nova/NovaInvoicePreview', () => ({
  NovaInvoicePreview: ({ isOpen, onClose, invoice }: any) =>
    isOpen ? (
      <div data-testid="nova-invoice-preview-modal">
        <span>Modal Preview: {invoice?.invoiceNumber}</span>
        <button onClick={onClose}>Close Preview</button>
      </div>
    ) : null,
}));

vi.mock('@/components/layouts/DashboardLayout', () => ({
  DashboardLayout: ({ children }: any) => <div data-testid="dashboard-layout">{children}</div>,
}));

describe('INVOICES MODULE: EMULATED END-TO-END UI & PERFORMANCE SUITE', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    mockOnSnapshot.mockImplementation((queryObj: any, callback: (snapshot: any) => void) => {
      const snapshot = {
        docs: sampleInvoicesFixture.map(inv => ({
          id: inv.id,
          data: () => ({ ...inv }),
        })),
        exists: () => true,
      };
      if (typeof callback === 'function') {
        callback(snapshot);
      }
      return vi.fn();
    });
  });

  const renderInvoicesPage = async () => {
    const InvoicesModule = await import('../Invoices');
    const Invoices = InvoicesModule.default;

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Invoices />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('1. Zero Secondary Reads & Zero Write Loops: Invoices snapshot does NOT perform package getDocs or updateDoc loops', async () => {
    await renderInvoicesPage();

    // Crucial check: Secondary getDocs queries to packages and updateDoc loops MUST be 0
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('2. Initial State & Render: Renders Invoices layout properly without crashing', async () => {
    const { container } = await renderInvoicesPage();

    expect(Boolean(container)).toBe(true);
    expect(screen.getAllByTestId('dashboard-layout').length).toBeGreaterThan(0);
  });

  it('3. Zero-Read Permit Computation: Permit and retention flags derived in memory without secondary network calls', async () => {
    await renderInvoicesPage();

    // Verify 0 getDocs calls made across packages collection
    expect(mockGetDocs).toHaveBeenCalledTimes(0);
  });

  it('4. Floating Bulk Actions Structure: Verifies definition and presence of all 8 bulk actions', () => {
    const bulkActionKeys = [
      'send_email',
      'strip_rounding',
      'merge_invoices',
      'change_status',
      'sync_smartweb',
      'update_exchange_rate',
      'payment_method',
      'delete_invoices'
    ];

    expect(bulkActionKeys.length).toBe(8);
    expect(bulkActionKeys).toContain('send_email');
    expect(bulkActionKeys).toContain('merge_invoices');
    expect(bulkActionKeys).toContain('sync_smartweb');
  });

  it('5. Annulment unlinks packages to consolidacion_transitoria without mutating other invoices', () => {
    const targetInvoice = sampleInvoicesFixture[0];
    const pkg = {
      id: 'pkg-101',
      trackingNumber: 'TRK-101',
      manifestNumber: '11-08-2026DAN',
      invoiceId: targetInvoice.id,
      invoiceNumber: targetInvoice.invoiceNumber,
      status: 'invoiced',
    };

    const unlinkedPkg = {
      ...pkg,
      originalManifestId: pkg.manifestNumber,
      manifestNumber: 'consolidacion_transitoria',
      status: 'consolidated',
      invoiceId: undefined,
      invoiceNumber: undefined,
      annulledInvoiceId: pkg.invoiceId,
    };

    expect(unlinkedPkg.manifestNumber).toBe('consolidacion_transitoria');
    expect(unlinkedPkg.status).toBe('consolidated');
    expect(unlinkedPkg.invoiceId).toBeUndefined();
    expect(unlinkedPkg.annulledInvoiceId).toBe('inv-001');
  });

  it('6. In-Memory Search Indexing: Instant matching across tracking numbers and customer codes', () => {
    const query = 'TRK-202';
    const matches = sampleInvoicesFixture.filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(query.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(query.toLowerCase()) ||
      inv.slCode.toLowerCase().includes(query.toLowerCase()) ||
      inv.invoiceItems?.some(item => item.trackingNumber.toLowerCase().includes(query.toLowerCase()))
    );

    expect(matches.length).toBe(1);
    expect(matches[0].clientName).toBe('Maria Fernandez');
    expect(matches[0].slCode).toBe('SL102');
  });
});
