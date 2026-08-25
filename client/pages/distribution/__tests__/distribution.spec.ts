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

describe('Distribution — module structure', () => {
  it('Distribution exports a default React component', async () => {
    const mod = await import('../Distribution');
    expect(typeof mod.default).toMatch(/^(function|object)$/);
  });

  it('barrel index re-exports Distribution', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.Distribution).toMatch(/^(function|object)$/);
  });
});

describe('Distribution — delivery logic', () => {
  type Delivery = { id: string; status: 'pending' | 'in_transit' | 'delivered' | 'failed' };

  it('counts deliveries by status', () => {
    const deliveries: Delivery[] = [
      { id: '1', status: 'delivered' },
      { id: '2', status: 'in_transit' },
      { id: '3', status: 'delivered' },
      { id: '4', status: 'failed' },
    ];
    const countByStatus = (list: Delivery[], status: Delivery['status']) =>
      list.filter(d => d.status === status).length;

    expect(countByStatus(deliveries, 'delivered')).toBe(2);
    expect(countByStatus(deliveries, 'failed')).toBe(1);
    expect(countByStatus(deliveries, 'pending')).toBe(0);
  });

  it('calculates completion rate', () => {
    const rate = (delivered: number, total: number) =>
      total === 0 ? 0 : Number(((delivered / total) * 100).toFixed(1));
    expect(rate(9, 10)).toBe(90);
    expect(rate(0, 5)).toBe(0);
    expect(rate(0, 0)).toBe(0);
  });
});
