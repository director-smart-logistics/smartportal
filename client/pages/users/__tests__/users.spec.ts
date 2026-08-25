import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: '1', role: 'ADMIN' }, loading: false }) }));
vi.mock('@/hooks/useLocale', () => ({ useLocale: () => ({ t: (k: string) => k }) }));
vi.mock('@/lib/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));
vi.mock('@/components/layouts/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => children }));
vi.mock('@/lib/firebase/firestore-client', () => ({ firestoreApi: {} }));
vi.mock('@/lib/firebase/callable', () => ({ firebaseApi: {} }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isLoading: false }),
  useMutation: () => ({ mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'user-1' }),
}));

describe('Users — module structure', () => {
  it('Users exports a default React component', async () => {
    const mod = await import('../Users');
    expect(typeof mod.default).toMatch(/^(function|object)$/);
  });

  it('UserCreate exports a default function', async () => {
    const mod = await import('../UserCreate');
    expect(typeof mod.default).toBe('function');
  });

  it('UserEdit exports a default function', async () => {
    const mod = await import('../UserEdit');
    expect(typeof mod.default).toBe('function');
  });

  it('barrel index re-exports all user pages', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.Users).toMatch(/^(function|object)$/);
    expect(typeof barrel.UserCreate).toMatch(/^(function|object)$/);
    expect(typeof barrel.UserEdit).toMatch(/^(function|object)$/);
  });
});

describe('Users — role logic', () => {
  type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'AGENT' | 'DELIVERY' | 'CUSTOMER';

  const ROLE_HIERARCHY: Record<Role, number> = {
    ADMIN: 6, MANAGER: 5, STAFF: 4, AGENT: 3, DELIVERY: 2, CUSTOMER: 1,
  };

  it('determines if a role has sufficient permissions', () => {
    const hasPermission = (userRole: Role, requiredRole: Role) =>
      ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];

    expect(hasPermission('ADMIN', 'MANAGER')).toBe(true);
    expect(hasPermission('CUSTOMER', 'STAFF')).toBe(false);
    expect(hasPermission('MANAGER', 'MANAGER')).toBe(true);
  });

  it('filters users by role', () => {
    const users = [
      { id: '1', role: 'ADMIN' as Role },
      { id: '2', role: 'STAFF' as Role },
      { id: '3', role: 'ADMIN' as Role },
    ];
    const byRole = (list: typeof users, role: Role) => list.filter(u => u.role === role);
    expect(byRole(users, 'ADMIN')).toHaveLength(2);
    expect(byRole(users, 'STAFF')).toHaveLength(1);
  });
});
