// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ConsolidationCarryOnDialog } from '../ConsolidationCarryOnDialog';
import type { ConsolidationPackage } from '../types';
import { carryOnPackages, checkCarryOnCompliance } from '@/lib/services/consolidation-carry-on-service';

// Mock Lucide icons
vi.mock('lucide-react', () => {
  const IconMock = (name: string) => (props: any) => <span>{name}</span>;
  return {
    ArrowRightLeft: IconMock('ArrowRightLeft'),
    Package: IconMock('Package'),
    Scale: IconMock('Scale'),
    AlertTriangle: IconMock('AlertTriangle'),
    CheckCircle: IconMock('CheckCircle'),
    XCircle: IconMock('XCircle'),
    Loader2: IconMock('Loader2'),
    Info: IconMock('Info'),
    FileText: IconMock('FileText'),
    Layers: IconMock('Layers'),
    Shield: IconMock('Shield'),
    Search: IconMock('Search'),
    X: IconMock('X'),
    ChevronDown: IconMock('ChevronDown'),
    FileSpreadsheet: IconMock('FileSpreadsheet'),
    Ship: IconMock('Ship'),
    User: IconMock('User'),
    ChevronRight: IconMock('ChevronRight'),
    DollarSign: IconMock('DollarSign'),
    Clock: IconMock('Clock'),
    GripVertical: IconMock('GripVertical'),
    Lock: IconMock('Lock'),
    MapPin: IconMock('MapPin'),
    Truck: IconMock('Truck'),
    Calendar: IconMock('Calendar'),
  };
});

// Mock hooks
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'test-admin@smartlogistics.com' } }),
}));

// Mock ManifestPicker simply as a standard select to avoid Radix UI Popover / JSDom hanging
vi.mock('@/components/manifest/ManifestPicker', () => ({
  ManifestPicker: ({ allManifestNumbers, selectedManifests, onManifestsChange, allLabel, id }: {
    allManifestNumbers: string[];
    selectedManifests: Set<string>;
    onManifestsChange: (v: Set<string>) => void;
    allLabel?: string;
    id?: string;
  }) => {
    return (
      <select
        id={id}
        data-testid="select-target"
        value={Array.from(selectedManifests)[0] || ''}
        onChange={(e) => onManifestsChange(new Set([e.target.value]))}
      >
        <option value="">{allLabel}</option>
        {allManifestNumbers.map((m: string) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    );
  }
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock Services
vi.mock('@/lib/services/consolidation-carry-on-service', () => ({
  carryOnPackages: vi.fn().mockResolvedValue({ success: true, movedTrackings: ['TRACK-1', 'TRACK-2'] }),
  checkCarryOnCompliance: vi.fn().mockResolvedValue({ violations: [], warnings: [] }),
}));

vi.mock('@/lib/services/consolidation-rules-service', () => ({
  subscribeToConsolidationRules: vi.fn((cb) => vi.fn()),
}));

// Mock Dialog UI Radix Components simply
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select data-testid="select-target" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Seleccionar manifest...</option>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      data-testid="checkbox-pkg"
      checked={!!checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}));

const mockSourcePackages: ConsolidationPackage[] = [
  {
    id: 'pkg-1',
    trackingNumber: 'TRACK-1',
    description: 'COSMETICOS',
    weight: 0.30,
    status: 'consolidated',
    slCode: 'SL100',
    manifestNumber: 'CONSOLIDACION_TRANSITORIA',
    isTransitoria: true,
    originalManifestID: '28-04-2026DAN',
    annulledInvoiceNumber: 'INV-9827072',
    annulledInvoiceId: 'inv-9827072',
  } as any,
  {
    id: 'pkg-2',
    trackingNumber: 'TRACK-2',
    description: 'ZAPATOS',
    weight: 1.50,
    status: 'consolidated',
    slCode: 'SL100',
    manifestNumber: 'CONSOLIDACION_TRANSITORIA',
    isTransitoria: true,
    originalManifestID: '15-05-2026ABC',
    annulledInvoiceNumber: 'INV-1234567',
    annulledInvoiceId: 'inv-1234567',
  } as any,
];

const mockAllManifestNumbers = [
  'CONSOLIDACION_TRANSITORIA',
  '28-04-2026DAN',
  '15-05-2026ABC',
  '10-06-2026XYZ',
];

describe('ConsolidationCarryOnDialog — Metadata badges & re-assignment flows', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders correctly and displays the package description, weight, and origin metadata badges', () => {
    const handleClose = vi.fn();

    render(
      <ConsolidationCarryOnDialog
        open={true}
        onClose={handleClose}
        sourcePackages={mockSourcePackages}
        sourceManifest="CONSOLIDACION_TRANSITORIA"
        slCode="SL100"
        customerName="Jeremy Jarquin"
        allManifestNumbers={mockAllManifestNumbers}
      />
    );

    // Verify dialog basics
    expect(screen.getByText('Carry-On — Mover paquetes')).toBeTruthy();
    expect(screen.getByText(/Mover paquetes de/i)).toBeTruthy();

    // Verify packages description and tracking are rendered
    expect(screen.getByText('TRACK-1')).toBeTruthy();
    expect(screen.getByText('COSMETICOS')).toBeTruthy();
    expect(screen.getByText('(0.30 kg)')).toBeTruthy();

    expect(screen.getByText('TRACK-2')).toBeTruthy();
    expect(screen.getByText('ZAPATOS')).toBeTruthy();
    expect(screen.getByText('(1.50 kg)')).toBeTruthy();

    // Verify the metadata badges for previous manifest and annulled invoice are shown
    expect(screen.getAllByText('28-04-2026DAN').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('INV-9827072')).toBeTruthy();
    
    expect(screen.getAllByText('15-05-2026ABC').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('INV-1234567')).toBeTruthy();
  });

  it('allows individual package checkboxes to be toggled, updating the selection summary', () => {
    render(
      <ConsolidationCarryOnDialog
        open={true}
        onClose={vi.fn()}
        sourcePackages={mockSourcePackages}
        sourceManifest="CONSOLIDACION_TRANSITORIA"
        slCode="SL100"
        customerName="Jeremy Jarquin"
        allManifestNumbers={mockAllManifestNumbers}
      />
    );

    // Initial state: pre-selected all packages (2/2)
    expect(screen.getByText('Paquetes a mover (2/2)')).toBeTruthy();
    expect(screen.getByText('2 seleccionado(s)')).toBeTruthy();

    const checkboxes = screen.getAllByTestId('checkbox-pkg');
    expect(checkboxes).toHaveLength(2);

    // Click first checkbox to deselect
    fireEvent.click(checkboxes[0]);

    // Selection should decrease to 1/2
    expect(screen.getByText('Paquetes a mover (1/2)')).toBeTruthy();
    expect(screen.getByText('1 seleccionado(s)')).toBeTruthy();
  });

  it('toggles all packages when the Deseleccionar/Seleccionar button is clicked', () => {
    render(
      <ConsolidationCarryOnDialog
        open={true}
        onClose={vi.fn()}
        sourcePackages={mockSourcePackages}
        sourceManifest="CONSOLIDACION_TRANSITORIA"
        slCode="SL100"
        customerName="Jeremy Jarquin"
        allManifestNumbers={mockAllManifestNumbers}
      />
    );

    expect(screen.getByText('Paquetes a mover (2/2)')).toBeTruthy();
    const toggleBtn = screen.getByRole('button', { name: /Deseleccionar todo/i });

    // Deselect all
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Paquetes a mover (0/2)')).toBeTruthy();

    // Select all back
    const selectAllBtn = screen.getByRole('button', { name: /Seleccionar todo/i });
    fireEvent.click(selectAllBtn);
    expect(screen.getByText('Paquetes a mover (2/2)')).toBeTruthy();
  });

  it('triggers carryOnPackages service with correct fields on confirmation', async () => {
    const handleClose = vi.fn();
    render(
      <ConsolidationCarryOnDialog
        open={true}
        onClose={handleClose}
        sourcePackages={mockSourcePackages}
        sourceManifest="CONSOLIDACION_TRANSITORIA"
        slCode="SL100"
        customerName="Jeremy Jarquin"
        allManifestNumbers={mockAllManifestNumbers}
      />
    );

    // Select target manifest
    const select = screen.getByTestId('select-target');
    fireEvent.change(select, { target: { value: '10-06-2026XYZ' } });

    // Fill optional reason
    const reasonInput = screen.getByPlaceholderText(/Ej: Cliente solicitó juntar paquetes/i);
    fireEvent.change(reasonInput, { target: { value: 'Consolidación manual de transitoria' } });

    // Confirm button should be enabled now
    const moveBtn = screen.getByRole('button', { name: /Mover 2 paquete\(s\)/i });
    expect(moveBtn.getAttribute('disabled')).toBeNull();

    // Trigger confirmation
    fireEvent.click(moveBtn);

    await waitFor(() => {
      expect(carryOnPackages).toHaveBeenCalledWith({
        packageIds: ['pkg-1', 'pkg-2'],
        sourceManifest: 'CONSOLIDACION_TRANSITORIA',
        targetManifest: '10-06-2026XYZ',
        sourceInvoiceId: undefined,
        slCode: 'SL100',
        customerName: 'Jeremy Jarquin',
        performedBy: 'test-admin@smartlogistics.com',
        reason: 'Consolidación manual de transitoria',
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Carry-On completado',
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
