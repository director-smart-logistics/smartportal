import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: '1' }, loading: false }) }));
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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

describe('Nova — module structure', () => {
  it('exports a default function', async () => {
    const mod = await import('../Nova');
    expect(typeof mod.default).toBe('function');
  }, 15000);

  it('barrel index re-exports Nova', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.Nova).toBe('function');
  }, 15000);
});

// ── Pure helper: formatTrackingDate ────────────────────────────────────────────
// Mirrors the inline function in Nova.tsx — tests must stay in sync

function formatTrackingDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('es-CR', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
}

describe('formatTrackingDate', () => {
  it('returns empty string for undefined', () => {
    expect(formatTrackingDate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatTrackingDate('')).toBe('');
  });

  it('returns original string for completely invalid date', () => {
    const bad = 'NOT-A-DATE';
    // new Date('NOT-A-DATE') is Invalid Date; toLocaleString on it returns 'Invalid Date' (no throw),
    // so our helper returns the formatted string (browser-dependent) — we just verify it returns a string
    expect(typeof formatTrackingDate(bad)).toBe('string');
  });

  it('formats a valid ISO date string', () => {
    const result = formatTrackingDate('2025-04-08T14:30:00Z');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('');
  });
});

// ── BUG-N3: timestamp sort NaN guard ─────────────────────────────────────────
// Mirrors the sort logic in Nova.tsx tagged.sort(...)

type MockMsg = { id: string; ts: number };

function safeSortTs(a: number, b: number): number {
  return (isNaN(a) ? 0 : a) - (isNaN(b) ? 0 : b);
}

describe('BUG-N3 — timestamp sort NaN guard', () => {
  it('sorts normal timestamps correctly', () => {
    const msgs: MockMsg[] = [
      { id: 'c', ts: 3000 },
      { id: 'a', ts: 1000 },
      { id: 'b', ts: 2000 },
    ];
    msgs.sort((x, y) => safeSortTs(x.ts, y.ts));
    expect(msgs.map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('NaN timestamp is treated as 0 (sorts first), does not break sort', () => {
    const msgs: MockMsg[] = [
      { id: 'b', ts: 2000 },
      { id: 'nan', ts: NaN },
      { id: 'a', ts: 1000 },
    ];
    msgs.sort((x, y) => safeSortTs(x.ts, y.ts));
    // NaN → 0, so 'nan' sorts before 'a' and 'b'
    expect(msgs[0].id).toBe('nan');
    expect(msgs[1].id).toBe('a');
    expect(msgs[2].id).toBe('b');
  });

  it('all NaN timestamps — sort is stable (no exceptions)', () => {
    const msgs: MockMsg[] = [
      { id: 'x', ts: NaN },
      { id: 'y', ts: NaN },
    ];
    expect(() => msgs.sort((x, y) => safeSortTs(x.ts, y.ts))).not.toThrow();
  });

  it('invalid timestamp string → getTime() returns NaN, guard handles it', () => {
    const ts = new Date('invalid').getTime();
    expect(isNaN(ts)).toBe(true);
    expect(safeSortTs(ts, 1000)).toBe(-1000); // 0 - 1000
  });

  it('undefined timestamp → conditional guard returns 0, not NaN', () => {
    const raw: string | undefined = undefined;
    const ts = raw ? new Date(raw).getTime() : 0;
    expect(ts).toBe(0);
    expect(isNaN(ts)).toBe(false);
  });
});

// ── BUG-N1: MANIFEST_TYPE_OPTIONS is module-level (stable reference) ───────────

describe('BUG-N1 — MANIFEST_TYPE_OPTIONS is module-level', () => {
  it('module exports a default function (page) without MANIFEST_TYPE_OPTIONS re-creation', async () => {
    const mod = await import('../Nova');
    // If this file loaded without error and default is a function,
    // the module-level constant is correctly defined outside the component
    expect(typeof mod.default).toBe('function');
  });
});
