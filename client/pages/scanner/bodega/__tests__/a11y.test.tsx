// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { IdleView, FoundView, NotFoundView, ErrorView } from '../views';
import { HistoryCard } from '../HistoryCard';
import type { ScanResult, HistoryEntry } from '../types';

// ── Framer Motion mock (async factory avoids vi.mock hoisting issue) ───────────
vi.mock('framer-motion', async () => {
  const { default: React } = await import('react');
  const passthrough = (tag: string) => {
    return ({ children, initial, animate, exit, transition, whileHover, whileTap, layout, ...rest }: any) =>
      React.createElement(tag, rest, children);
  };
  const motionProxy = new Proxy({}, {
    get: (target, prop) => {
      if (typeof prop === 'string') {
        return passthrough(prop);
      }
      return undefined;
    }
  });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

// ── Cleanup DOM between tests — required when globals:true is not set ─────────
afterEach(cleanup);

// ── Test fixtures ─────────────────────────────────────────────────────────────
const mockResult: ScanResult = {
  tracking:              'TBA329546534426',
  ruta:                  'San Jose Centro',
  routeAbbr:             'SJ',
  routeGradient:         'from-purple-600 to-purple-800',
  customerName:          'Fabian Patricio Secades Mendez',
  slCode:                'SL2397',
  status:                'received',
  requiresPermit:        false,
  consolidationEnabled:  false,
  pendingUserAssignment: false,
};

const mockHistoryEntry: HistoryEntry = {
  ...mockResult,
  scannedAt: Date.now() - 5000,
};

// ── IdleView ──────────────────────────────────────────────────────────────────
describe('IdleView — accessibility', () => {
  it('renders children correctly', () => {
    render(
      <IdleView scanCount={0}>
        <div data-testid="test-child">Scanner Input</div>
      </IdleView>
    );
    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('uses select-none to prevent accidental text selection on warehouse touch', () => {
    const { container } = render(<IdleView scanCount={0} />);
    const root = container.firstChild as HTMLElement;
    expect(root?.className).toContain('select-none');
  });

  it('gracefully accepts milestone and legend counts without crashing', () => {
    const { rerender } = render(<IdleView scanCount={10} />);
    expect(screen.queryByTestId('test-child')).toBeNull();

    rerender(<IdleView scanCount={100} />);
    expect(screen.queryByTestId('test-child')).toBeNull();
  });
});

// ── HistoryCard ───────────────────────────────────────────────────────────────
describe('HistoryCard — accessibility', () => {
  it('renders full tracking number visible (not truncated)', () => {
    render(<HistoryCard entry={mockHistoryEntry} highlight={false} />);
    expect(screen.getByText('TBA329546534426')).toBeTruthy();
  });

  it('renders customer name in full', () => {
    render(<HistoryCard entry={mockHistoryEntry} highlight={false} />);
    expect(screen.getByText(/Fabian Patricio Secades Mendez/i)).toBeTruthy();
  });

  it('renders route abbreviation stamp in right panel', () => {
    render(<HistoryCard entry={mockHistoryEntry} highlight={false} />);
    expect(screen.getByText('SJ')).toBeTruthy();
  });

  it('renders slCode in high-contrast badge', () => {
    render(<HistoryCard entry={mockHistoryEntry} highlight={false} />);
    const slEl = screen.getByText('SL2397');
    expect(slEl).toBeTruthy();
    expect(slEl.className).toContain('text-slate-900');
    expect(slEl.className).toContain('bg-white');
  });

  it('renders elapsed time label', () => {
    render(<HistoryCard entry={mockHistoryEntry} highlight={false} />);
    const timeEls = screen.getAllByText(/^\d+(s|m)$/);
    expect(timeEls.length).toBeGreaterThan(0);
  });

  it('applies ring highlight class when highlight=true', () => {
    const { container } = render(<HistoryCard entry={mockHistoryEntry} highlight={true} />);
    expect(container.innerHTML).toContain('ring-2');
  });

  it('renders PERMISO badge in 20% footer when requiresPermit=true', () => {
    const permitEntry = { ...mockHistoryEntry, requiresPermit: true };
    render(<HistoryCard entry={permitEntry} highlight={false} />);
    const permitEl = screen.getByText('PERMISO');
    expect(permitEl).toBeTruthy();
    expect(permitEl.className).toContain('bg-amber-500');
    expect(permitEl.className).toContain('text-white');
  });

  it('renders CONSOLIDA badge in 20% footer when consolidationEnabled=true', () => {
    const consolidationEntry = { ...mockHistoryEntry, consolidationEnabled: true };
    render(<HistoryCard entry={consolidationEntry} highlight={false} />);
    const consolidationEl = screen.getByText('CONSOLIDA');
    expect(consolidationEl).toBeTruthy();
    expect(consolidationEl.className).toContain('bg-blue-600');
    expect(consolidationEl.className).toContain('text-white');
  });
});

// ── FoundView ─────────────────────────────────────────────────────────────────
describe('FoundView — accessibility', () => {
  it('renders route name prominently', () => {
    render(<FoundView result={mockResult} />);
    const els = screen.getAllByText('San Jose Centro');
    expect(els.length).toBeGreaterThanOrEqual(1);
  });

  it('renders tracking number', () => {
    render(<FoundView result={mockResult} />);
    expect(screen.getByText('TBA329546534426')).toBeTruthy();
  });

  it('renders customer name', () => {
    render(<FoundView result={mockResult} />);
    expect(screen.getByText(/Fabian Patricio Secades Mendez/i)).toBeTruthy();
  });

  it('does NOT render permit badge when requiresPermit=false', () => {
    render(<FoundView result={mockResult} />);
    expect(screen.queryByText(/PERMISO/i)).toBeNull();
  });

  it('renders permit badge when requiresPermit=true', () => {
    render(<FoundView result={{ ...mockResult, requiresPermit: true }} />);
    expect(screen.getByText(/PERMISO/i)).toBeTruthy();
  });

  it('renders consolidation badge when consolidationEnabled=true', () => {
    render(<FoundView result={{ ...mockResult, consolidationEnabled: true }} />);
    expect(screen.getByText(/CONSOLIDA/i)).toBeTruthy();
  });



  it('renders routeAbbr fallback when ruta is empty', () => {
    render(<FoundView result={{ ...mockResult, ruta: '', routeAbbr: '?' }} />);
    expect(screen.getByText('?')).toBeTruthy();
  });
});

// ── NotFoundView ──────────────────────────────────────────────────────────────
describe('NotFoundView — accessibility', () => {
  it('renders scanned tracking number', () => {
    render(<NotFoundView tracking="UNKNOWN123456" />);
    expect(screen.getByText('UNKNOWN123456')).toBeTruthy();
  });

  it('renders not-found message', () => {
    render(<NotFoundView tracking="TRK001" />);
    expect(screen.getByText(/no encontrado/i)).toBeTruthy();
  });

  it('renders tracking interno no autorizado message when scanning an internal tracking number', () => {
    render(<NotFoundView tracking="SL3465-20260527185339990" />);
    expect(screen.getByText(/TRACKING INTERNO NO AUTORIZADO/i)).toBeTruthy();
  });
});

// ── ErrorView ─────────────────────────────────────────────────────────────────
describe('ErrorView — accessibility', () => {
  it('renders connection error headline', () => {
    render(<ErrorView />);
    expect(screen.getByText(/sin conexi/i)).toBeTruthy();
  });
});

// ── Scan result panel ARIA contract ──────────────────────────────────────────
describe('Scan result panel — ARIA contract (regression guard)', () => {
  it('views export correct named components (no barrel rename regressions)', () => {
    expect(IdleView).toBeTruthy();
    expect(FoundView).toBeTruthy();
    expect(NotFoundView).toBeTruthy();
    expect(ErrorView).toBeTruthy();
  });
});
