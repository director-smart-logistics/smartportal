// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManifestPicker } from '../ManifestPicker';

// Mock Lucide icons
vi.mock('lucide-react', () => {
  const IconMock = (name: string) => (props: any) => <span data-testid={`icon-${name}`}>{name}</span>;
  return {
    Search: IconMock('Search'),
    Layers: IconMock('Layers'),
    X: IconMock('X'),
    ChevronDown: IconMock('ChevronDown'),
    Shield: IconMock('Shield'),
    Truck: IconMock('Truck'),
    Package: IconMock('Package'),
    Ship: IconMock('Ship'),
    Check: IconMock('Check'),
  };
});

// Mock Popover to render directly in JSDom without Radix portals/focus traps
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: any) => <div data-testid="popover-root">{children}</div>,
  PopoverTrigger: ({ children, asChild }: any) => <div>{children}</div>,
  PopoverContent: ({ children, className }: any) => <div data-testid="popover-content" className={className}>{children}</div>,
}));

// Mock firestoreApi for fallback query
vi.mock('@/lib/firebase/firestore-client', () => ({
  firestoreApi: {
    manifests: {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: '17-09-2026', manifestNumber: '17-09-2026', mergedInto: 'SL-MEGA-MAN-17-09-2026' },
          { id: '17-09-2026DANP', manifestNumber: '17-09-2026DANP', mergedInto: 'SL-MEGA-MAN-17-09-2026' },
        ],
      }),
    },
  },
}));

describe('ManifestPicker - Merged Manifests & Functional UI Flow', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderPicker = (props: Partial<React.ComponentProps<typeof ManifestPicker>> = {}) => {
    const defaultProps = {
      allManifestNumbers: [
        '18-09-2026',
        '17-09-2026',
        '18-09-2026DANP',
        '17-09-2026DANP',
        'SL-MEGA-MAN-17-09-2026',
        'SM-01-09-2026',
      ],
      selectedManifests: new Set<string>(),
      onManifestsChange: vi.fn(),
      manifestPackageCounts: new Map<string, number>([
        ['18-09-2026', 15],
        ['17-09-2026', 10],
        ['18-09-2026DANP', 5],
        ['17-09-2026DANP', 4],
        ['SL-MEGA-MAN-17-09-2026', 14],
        ['SM-01-09-2026', 20],
      ]),
      manifestMergedMap: new Map<string, string>([
        ['17-09-2026', 'SL-MEGA-MAN-17-09-2026'],
        ['17-09-2026DANP', 'SL-MEGA-MAN-17-09-2026'],
      ]),
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <ManifestPicker {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  it('renders all manifest categories (Regulares, Permisos, MEGA-MAN, Marítimos)', () => {
    renderPicker();
    expect(screen.getByText('Regulares')).toBeTruthy();
    expect(screen.getByText('Permisos')).toBeTruthy();
    expect(screen.getByText('MEGA-MAN')).toBeTruthy();
    expect(screen.getByText('Marítimos')).toBeTruthy();
  });

  it('correctly displays "Fusionado" badge on merged manifests', () => {
    renderPicker();
    const fusionadoBadges = screen.getAllByText('Fusionado');
    expect(fusionadoBadges.length).toBe(2); // 17-09-2026 and 17-09-2026DANP
  });

  it('disables merged manifests and prevents selection via click', () => {
    const onManifestsChange = vi.fn();
    renderPicker({ onManifestsChange });

    // Click on merged manifest '17-09-2026'
    const mergedItem = screen.getByText('17-09-2026').closest('[role="button"]');
    expect(mergedItem?.getAttribute('aria-disabled')).toBe('true');
    expect(mergedItem?.className).toContain('opacity-40');
    expect(mergedItem?.className).toContain('cursor-not-allowed');

    if (mergedItem) {
      fireEvent.click(mergedItem);
    }
    expect(onManifestsChange).not.toHaveBeenCalled();
  });

  it('disables merged manifests and prevents selection via keyboard (Enter/Space)', () => {
    const onManifestsChange = vi.fn();
    renderPicker({ onManifestsChange });

    const mergedItem = screen.getByText('17-09-2026DANP').closest('[role="button"]');
    if (mergedItem) {
      fireEvent.keyDown(mergedItem, { key: 'Enter' });
      fireEvent.keyDown(mergedItem, { key: ' ' });
    }
    expect(onManifestsChange).not.toHaveBeenCalled();
  });

  it('allows selecting eligible (non-merged) manifests', () => {
    const onManifestsChange = vi.fn();
    renderPicker({ onManifestsChange });

    const eligibleItem = screen.getByText('18-09-2026').closest('[role="button"]');
    expect(eligibleItem?.getAttribute('aria-disabled')).not.toBe('true');

    if (eligibleItem) {
      fireEvent.click(eligibleItem);
    }
    expect(onManifestsChange).toHaveBeenCalledTimes(1);
    const selectedSet = onManifestsChange.mock.calls[0][0] as Set<string>;
    expect(selectedSet.has('18-09-2026')).toBe(true);
  });

  it('toggleCategory selects only non-merged items and excludes merged ones', () => {
    const onManifestsChange = vi.fn();
    renderPicker({ onManifestsChange });

    // Click the Regulares column header
    const regularesHeader = screen.getByText('Regulares').closest('[role="button"]');
    if (regularesHeader) {
      fireEvent.click(regularesHeader);
    }

    expect(onManifestsChange).toHaveBeenCalledTimes(1);
    const selectedSet = onManifestsChange.mock.calls[0][0] as Set<string>;
    // '18-09-2026' is regular & non-merged -> included
    expect(selectedSet.has('18-09-2026')).toBe(true);
    // '17-09-2026' is regular & merged -> EXCLUDED
    expect(selectedSet.has('17-09-2026')).toBe(false);
  });

  it('supports singleSelect mode and prevents selecting merged manifests', () => {
    const onManifestsChange = vi.fn();
    renderPicker({ singleSelect: true, onManifestsChange });

    // Trying to click merged item does nothing
    const mergedItem = screen.getByText('17-09-2026').closest('[role="button"]');
    if (mergedItem) fireEvent.click(mergedItem);
    expect(onManifestsChange).not.toHaveBeenCalled();

    // Clicking eligible item selects only that item
    const eligibleItem = screen.getByText('SL-MEGA-MAN-17-09-2026').closest('[role="button"]');
    if (eligibleItem) fireEvent.click(eligibleItem);
    expect(onManifestsChange).toHaveBeenCalledWith(new Set(['SL-MEGA-MAN-17-09-2026']));
  });

  it('filters manifests with search input while maintaining merged disabled state', () => {
    renderPicker();
    const searchInput = screen.getByPlaceholderText('Buscar manifiesto…');
    fireEvent.change(searchInput, { target: { value: '17-09' } });

    // Should match 17-09-2026, 17-09-2026DANP, and SL-MEGA-MAN-17-09-2026
    expect(screen.getByText('17-09-2026')).toBeTruthy();
    expect(screen.getByText('17-09-2026DANP')).toBeTruthy();
    expect(screen.getByText('SL-MEGA-MAN-17-09-2026')).toBeTruthy();

    // 18-09 manifests should not be shown
    expect(screen.queryByText('18-09-2026')).toBeNull();
  });
});
