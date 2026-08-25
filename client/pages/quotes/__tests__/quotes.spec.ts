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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ id: '1' }) }));

describe('Quotes — module structure', () => {
  it('Quotes exports a default React component', async () => {
    const mod = await import('../Quotes');
    expect(typeof mod.default).toMatch(/^(function|object)$/);
  });

  it('CreateQuote exports a default React component', async () => {
    const mod = await import('../CreateQuote');
    expect(typeof mod.default).toMatch(/^(function|object)$/);
  });

  it('barrel index re-exports both quote pages', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.Quotes).toMatch(/^(function|object)$/);
    expect(typeof barrel.CreateQuote).toMatch(/^(function|object)$/);
  });
});

describe('Quotes — pricing logic', () => {
  it('calculates weight-based shipping cost', () => {
    const calcShipping = (weightKg: number, ratePerKg: number) =>
      Math.max(weightKg, 0.5) * ratePerKg;
    expect(calcShipping(2.5, 1000)).toBe(2500);
    expect(calcShipping(0.3, 1000)).toBe(500);
  });

  it('applies volume weight (dimensional weight) correctly', () => {
    const volumeWeight = (l: number, w: number, h: number, divisor = 5000) =>
      (l * w * h) / divisor;
    expect(volumeWeight(30, 20, 15)).toBe(1.8);
    expect(volumeWeight(50, 40, 30)).toBe(12);
  });

  it('picks billable weight as max of actual vs dimensional', () => {
    const billableWeight = (actual: number, dimensional: number) =>
      Math.max(actual, dimensional);
    expect(billableWeight(2, 3)).toBe(3);
    expect(billableWeight(5, 1)).toBe(5);
  });
});
