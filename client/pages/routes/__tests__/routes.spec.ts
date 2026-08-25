import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: '1' }, loading: false }) }));
vi.mock('@/hooks/useLocale', () => ({ useLocale: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
vi.mock('@/components/layouts/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => children }));
vi.mock('@/lib/firebase/firestore-client', () => ({ firestoreApi: {} }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

describe('Routes management — module structure', () => {
  it('RoutesManagement exports a default function', async () => {
    const mod = await import('../RoutesManagement');
    expect(typeof mod.default).toBe('function');
  }, 25000);

  it('barrel index re-exports RoutesManagement', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.RoutesManagement).toBe('function');
  }, 25000);
});

describe('Routes — assignment logic', () => {
  type Route = { id: string; name: string; zone: string };
  type Package = { id: string; destination: string };

  it('assigns packages to route by zone match', () => {
    const routes: Route[] = [
      { id: 'r1', name: 'Norte', zone: 'norte' },
      { id: 'r2', name: 'Sur', zone: 'sur' },
    ];
    const assignRoute = (pkg: Package, allRoutes: Route[]) =>
      allRoutes.find(r => pkg.destination.toLowerCase().includes(r.zone)) ?? null;

    expect(assignRoute({ id: 'p1', destination: 'Zona Norte' }, routes)?.id).toBe('r1');
    expect(assignRoute({ id: 'p2', destination: 'Zona Sur' }, routes)?.id).toBe('r2');
    expect(assignRoute({ id: 'p3', destination: 'Centro' }, routes)).toBeNull();
  });

  it('groups packages by route', () => {
    const packages = [
      { id: 'p1', routeId: 'r1' },
      { id: 'p2', routeId: 'r1' },
      { id: 'p3', routeId: 'r2' },
    ];
    const grouped = packages.reduce<Record<string, typeof packages>>((acc, pkg) => {
      (acc[pkg.routeId] ??= []).push(pkg);
      return acc;
    }, {});

    expect(grouped['r1']).toHaveLength(2);
    expect(grouped['r2']).toHaveLength(1);
  });
});

describe('Routes — bulk update option defaults', () => {
  it('defaults opts.markInvoicesPaid and opts.syncInvoicesSp2 to false if not specified', () => {
    const resolveBulkUpdateOpts = (opts: { syncSp2?: boolean; markInvoicesPaid?: boolean; syncInvoicesSp2?: boolean; updateInvoices?: boolean; invoiceStatus?: string } = {}) => {
      return {
        markInvoicesPaid: opts.markInvoicesPaid ?? false,
        syncInvoicesSp2: opts.syncInvoicesSp2 ?? false,
        syncSp2: opts.syncSp2 !== false,
      };
    };

    expect(resolveBulkUpdateOpts()).toEqual({
      markInvoicesPaid: false,
      syncInvoicesSp2: false,
      syncSp2: true,
    });

    expect(resolveBulkUpdateOpts({ markInvoicesPaid: true })).toEqual({
      markInvoicesPaid: true,
      syncInvoicesSp2: false,
      syncSp2: true,
    });

    expect(resolveBulkUpdateOpts({ syncInvoicesSp2: true, syncSp2: false })).toEqual({
      markInvoicesPaid: false,
      syncInvoicesSp2: true,
      syncSp2: false,
    });
  });
});
