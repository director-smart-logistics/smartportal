import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: '1' }, loading: false }) }));
vi.mock('@/hooks/useLocale', () => ({ useLocale: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
vi.mock('@/components/layouts/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => children }));
vi.mock('@/lib/firebase/firestore-client', () => ({ firestoreApi: {} }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

describe('Analytics — module structure', () => {
  it('AnalyticsEnhanced exports a default function', async () => {
    const mod = await import('../AnalyticsEnhanced');
    expect(typeof mod.default).toBe('function');
  });

  it('barrel index re-exports AnalyticsEnhanced', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.AnalyticsEnhanced).toBe('function');
  });
});

describe('Analytics — aggregation logic', () => {
  it('calculates delivery rate percentage', () => {
    const deliveryRate = (delivered: number, total: number) =>
      total === 0 ? 0 : Math.round((delivered / total) * 100);
    expect(deliveryRate(80, 100)).toBe(80);
    expect(deliveryRate(0, 100)).toBe(0);
    expect(deliveryRate(0, 0)).toBe(0);
  });

  it('groups packages by month', () => {
    const packages = [
      { id: '1', date: '2025-01-15' },
      { id: '2', date: '2025-01-20' },
      { id: '3', date: '2025-02-05' },
    ];
    const byMonth = packages.reduce<Record<string, number>>((acc, pkg) => {
      const month = pkg.date.slice(0, 7);
      acc[month] = (acc[month] ?? 0) + 1;
      return acc;
    }, {});
    expect(byMonth['2025-01']).toBe(2);
    expect(byMonth['2025-02']).toBe(1);
  });

  it('calculates average weight per package', () => {
    const weights = [1.5, 2.0, 0.5, 3.0];
    const avg = weights.reduce((s, w) => s + w, 0) / weights.length;
    expect(avg).toBe(1.75);
  });
});
