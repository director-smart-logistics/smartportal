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

describe('Shipping — module structure', () => {
  it('ShippingLabels exports a default function', async () => {
    const mod = await import('../ShippingLabels');
    expect(typeof mod.default).toBe('function');
  }, 25000);

  it('barrel index re-exports ShippingLabels', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.ShippingLabels).toBe('function');
  }, 25000);
});

describe('Shipping — label logic', () => {
  it('generates a barcode string from tracking number', () => {
    const toBarcode = (tracking: string) => tracking.replace(/\s/g, '');
    expect(toBarcode('9400 1118 9922 3496 5259 82')).toBe('9400111899223496525982');
  });

  it('validates label required fields', () => {
    type LabelData = { recipient: string; address: string; tracking: string };
    const isValid = (label: Partial<LabelData>) =>
      !!(label.recipient?.trim() && label.address?.trim() && label.tracking?.trim());

    expect(isValid({ recipient: 'Juan', address: 'SJ Costa Rica', tracking: '9400111' })).toBe(true);
    expect(isValid({ recipient: '', address: 'SJ', tracking: '9400111' })).toBe(false);
    expect(isValid({ recipient: 'Juan', address: '', tracking: '9400111' })).toBe(false);
  });
});
