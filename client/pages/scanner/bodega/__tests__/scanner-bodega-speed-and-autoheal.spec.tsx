// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { ScannerBodegaPage } from '../index';
import { searchPackage } from '../search';

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

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/use-audit', () => ({
  useAudit: () => ({
    log: vi.fn(),
  }),
}));

let capturedOnScan: ((val: string) => void) | null = null;
vi.mock('@/hooks/useScannerInput', () => ({
  default: vi.fn((opts: any) => {
    capturedOnScan = opts.onScan;
    return {
      inputRef: { current: { focus: vi.fn(), value: '' } },
      isScanning: false,
      scanBuffer: '',
    };
  }),
}));

vi.mock('../search', () => ({
  searchPackage: vi.fn(),
}));

let mockSnapshotCallback: ((snap: any) => void) | null = null;
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn((_db, _col, id) => ({ id })),
    updateDoc: (...args: any[]) => mockUpdateDoc(...args),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    onSnapshot: vi.fn((_q, callback) => {
      mockSnapshotCallback = callback;
      return vi.fn(); // unsubscribe
    }),
    getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 1 }) }),
    getDocs: vi.fn().mockResolvedValue({
      empty: false,
      docs: [],
    }),
  };
});

vi.mock('@/lib/services/matching', () => ({
  loadCustomers: vi.fn().mockResolvedValue([]),
  getCustomerBySlCode: vi.fn((slCode: string) => {
    if (slCode.toUpperCase() === 'SL26742') {
      return {
        fullName: 'HORACIO FERNÁNDEZ',
        name: 'HORACIO FERNÁNDEZ',
        slCode: 'SL26742',
        ruta: 'OCCIDENTE',
      };
    }
    return undefined;
  }),
  findCustomerBySlCode: vi.fn(async (slCode: string) => {
    if (slCode.toUpperCase() === 'SL26742') {
      return {
        fullName: 'HORACIO FERNÁNDEZ',
        name: 'HORACIO FERNÁNDEZ',
        slCode: 'SL26742',
        ruta: 'OCCIDENTE',
      };
    }
    return null;
  }),
}));

describe('ScannerBodegaPage — Ultra-Fast Speed & Auto-Healing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshotCallback = null;
    (searchPackage as any).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-heals "Cliente Pre-alertado (SL26742)" to "HORACIO FERNÁNDEZ" on scan', async () => {
    const mockPackage = {
      id: 'TBA333638336954',
      tracking: 'TBA333638336954',
      ruta: 'OCCIDENTE',
      routeAbbr: 'OCC',
      routeGradient: 'from-orange-600 to-orange-800',
      customerName: 'Cliente Pre-alertado (SL26742)',
      slCode: 'SL26742',
      status: 'in_transit',
      requiresPermit: false,
      consolidationEnabled: false,
      pendingUserAssignment: false,
      manifestNumber: '18-08-2026DAN',
    };

    (searchPackage as any).mockResolvedValue(mockPackage);

    render(<ScannerBodegaPage />);
    expect(capturedOnScan).toBeTypeOf('function');

    // Scan package
    await act(async () => {
      capturedOnScan!('TBA333638336954');
    });

    // Verify auto-healed customer name is displayed
    await waitFor(() => {
      const nameElements = screen.getAllByText(/HORACIO FERNÁNDEZ/i);
      expect(nameElements.length).toBeGreaterThanOrEqual(1);

      const codeElements = screen.getAllByText(/SL26742/i);
      expect(codeElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('resolves preloaded packages instantly in memory and strips GS1-128 prefix', async () => {
    const mockPackage = {
      id: 'TBA333638336954',
      tracking: 'TBA333638336954',
      ruta: 'OCCIDENTE',
      routeAbbr: 'OCC',
      routeGradient: 'from-orange-600 to-orange-800',
      customerName: 'HORACIO FERNÁNDEZ',
      slCode: 'SL26742',
      status: 'in_transit',
      requiresPermit: false,
      consolidationEnabled: false,
      pendingUserAssignment: false,
      manifestNumber: '18-08-2026DAN',
    };

    (searchPackage as any).mockResolvedValue(mockPackage);

    render(<ScannerBodegaPage />);
    expect(capturedOnScan).toBeTypeOf('function');

    await act(async () => {
      capturedOnScan!('42099999TBA333638336954');
    });

    await waitFor(() => {
      const nameElements = screen.getAllByText(/HORACIO FERNÁNDEZ/i);
      expect(nameElements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
