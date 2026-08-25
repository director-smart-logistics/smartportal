import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: '1' }, loading: false }) }));
vi.mock('@/hooks/useLocale', () => ({ useLocale: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
vi.mock('@/lib/context/SettingsContext', () => ({ useSettings: () => ({}) }));
vi.mock('@/components/layouts/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => children }));
vi.mock('@/lib/firebase/firestore-client', () => ({ firestoreApi: {} }));
vi.mock('@/components/settings/PricingManagementNew', () => ({ PricingManagementNew: () => null }));
vi.mock('@/pages/settings/ConsolidationRulesTab', () => ({ default: () => null }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

describe('Settings — module structure', () => {
  it('Settings exports a default function', async () => {
    const mod = await import('../Settings');
    expect(typeof mod.default).toBe('function');
  });

  it('ConsolidationRulesTab exports a default function', async () => {
    const mod = await import('../ConsolidationRulesTab');
    expect(typeof mod.default).toBe('function');
  });

  it('barrel index re-exports Settings and ConsolidationRulesTab', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.Settings).toBe('function');
    expect(typeof barrel.ConsolidationRulesTab).toBe('function');
  });
});
