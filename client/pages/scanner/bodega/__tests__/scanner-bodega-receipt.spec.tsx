// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ScannerBodegaPage } from '../index';
import { searchPackage } from '../search';
import { updateDoc } from 'firebase/firestore';

// ── Framer Motion mock ────────────────────────────────────────────────────────
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

// ── react-router-dom mock ─────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ── use-audit mock ────────────────────────────────────────────────────────────
const mockAuditLog = vi.fn();
vi.mock('@/hooks/use-audit', () => ({
  useAudit: () => ({
    log: mockAuditLog,
  }),
}));

// ── useScannerInput mock ───────────────────────────────────────────────────────
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

// ── searchPackage mock ─────────────────────────────────────────────────────────
vi.mock('../search', () => ({
  searchPackage: vi.fn(),
}));

// ── Speech API mock ───────────────────────────────────────────────────────────
const mockSpeak = vi.fn();
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: mockSpeak,
      getVoices: vi.fn(() => []),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    },
    writable: true,
  });
}

// ── Firestore Mocking ─────────────────────────────────────────────────────────
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    where: vi.fn(() => ({})),
    orderBy: vi.fn(() => ({})),
    limit: vi.fn(() => ({})),
    doc: vi.fn((_db, col, id) => ({ __doc: id, col })),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    getDocs: vi.fn(async () => ({ docs: [] })),
    getCountFromServer: vi.fn(async () => ({
      data: () => ({ count: 0 }),
    })),
    onSnapshot: vi.fn(() => () => {}),
  };
});

describe('ScannerBodegaPage — Physical Receipt Regression Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnScan = null;
  });

  afterEach(cleanup);

  it('evita la regresion de estado: escanear un paquete fisico NO cambia su estado a received ni escribe en history', async () => {
    const mockPackage = {
      id: 'PKG-001',
      tracking: 'TBA329546534426',
      ruta: 'San Jose Centro',
      routeAbbr: 'SJ',
      routeGradient: 'from-purple-600 to-purple-800',
      customerName: 'Fabian Patricio Secades Mendez',
      slCode: 'SL2397',
      status: 'ready', // Initial state (rank < 5)
      requiresPermit: false,
      consolidationEnabled: false,
      pendingUserAssignment: false,
      manifestNumber: 'MANIFEST-123',
    };
    
    // Mock the search to resolve to our mock package
    vi.mocked(searchPackage).mockResolvedValue(mockPackage);

    // 1. Renderizar la página de bodega
    render(<ScannerBodegaPage />);

    // 2. Garantizar que capturedOnScan se haya registrado
    expect(capturedOnScan).toBeTypeOf('function');

    // 3. Simular el escaneo del código de barras a través de useScannerInput callback
    capturedOnScan!('TBA329546534426');

    // 4. Esperar a que se procese y muestre la vista de paquete encontrado, usando getAllByText para evitar error de duplicados
    await waitFor(() => {
      const nameElements = screen.getAllByText(/Fabian Patricio/i);
      expect(nameElements.length).toBeGreaterThanOrEqual(1);
      
      const codeElements = screen.getAllByText(/SL2397/i);
      expect(codeElements.length).toBeGreaterThanOrEqual(1);
    });

    // 5. Verificar que se llamó a updateDoc para actualizar scannedAt y updatedAt en Firestore
    expect(updateDoc).toHaveBeenCalled();

    // Obtener los argumentos pasados a updateDoc
    const updateDocCalls = vi.mocked(updateDoc).mock.calls;
    expect(updateDocCalls.length).toBeGreaterThanOrEqual(1);

    // El último argumento debe ser el payload de actualización
    const lastCallPayload = updateDocCalls[updateDocCalls.length - 1][1] as any;

    console.log('[TEST LOG] Payload enviado a updateDoc:', JSON.stringify(lastCallPayload, null, 2));

    // 6. Aserciones críticas anti-regresión:
    // Debe registrar scannedAt y updatedAt
    expect(lastCallPayload.scannedAt).toBeDefined();
    expect(lastCallPayload.updatedAt).toBeDefined();

    // ¡NO DEBE CONTENER 'status' ni 'statusHistory' bajo ninguna circunstancia!
    expect(lastCallPayload.status).toBeUndefined();
    expect(lastCallPayload.statusHistory).toBeUndefined();
    expect(lastCallPayload.notes).toBeUndefined();
    expect(lastCallPayload.note).toBeUndefined();
  });
});
