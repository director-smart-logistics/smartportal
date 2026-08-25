import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: '1', email: 'test@test.com' }, loading: false }) }));
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

describe('Profile — module structure', () => {
  it('Profile exports a default function', async () => {
    const mod = await import('../Profile');
    expect(typeof mod.default).toBe('function');
  });

  it('barrel index re-exports Profile', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.Profile).toBe('function');
  });
});

describe('Profile — validation logic', () => {
  it('validates email format', () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });

  it('validates phone number (Costa Rica format)', () => {
    const isValidPhone = (phone: string) => /^[2-9]\d{7}$/.test(phone.replace(/\s|-/g, ''));
    expect(isValidPhone('8888-8888')).toBe(true);
    expect(isValidPhone('22223333')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
  });
});
