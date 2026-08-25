// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));

// Mock firestore
const onSnapshotMocks: any[] = [];
let getDocsMock = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, name) => ({ type: 'collection', name })),
  query: vi.fn((col, ...filters) => ({ type: 'query', col, filters })),
  where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
  getDocs: vi.fn((...args) => getDocsMock(...args)),
  onSnapshot: vi.fn((q, callback, errorCallback) => {
    onSnapshotMocks.push({ q, callback, errorCallback });
    return vi.fn(); // unsub
  }),
}));

import { useEncomiendaDispatchData } from '.././useEncomiendaDispatchData';

describe('useEncomiendaDispatchData', () => {
  beforeEach(() => {
    onSnapshotMocks.length = 0;
    vi.clearAllMocks();
    getDocsMock = vi.fn().mockResolvedValue({ docs: [] });
  });

  it('initializes in unloaded state', () => {
    const { result } = renderHook(() => useEncomiendaDispatchData({ hasLoaded: false }));
    expect(result.current.loading).toBe(false);
    expect(result.current.customerSections).toEqual([]);
    expect(result.current.allPackages).toEqual([]);
    expect(result.current.allInvoices).toEqual([]);
  });

  it('subscribes to manifests on mount and sorts them', () => {
    const { result } = renderHook(() => useEncomiendaDispatchData({ hasLoaded: false }));
    
    const manifestSub = onSnapshotMocks.find(m => m.q.col?.name === 'manifests');
    expect(manifestSub).toBeDefined();

    act(() => {
      manifestSub.callback({
        docs: [
          { id: '12-05-2026' },
          { id: '15-05-2026' },
        ],
      });
    });

    expect(result.current.allManifestNumbers).toEqual(['15-05-2026', '12-05-2026']);
  });

  it('does not subscribe to packages/invoices when hasLoaded is false', () => {
    renderHook(() => useEncomiendaDispatchData({ hasLoaded: false }));
    const packageSub = onSnapshotMocks.find(m => m.q?.col?.name === 'packages');
    const invoiceSub = onSnapshotMocks.find(m => m.q?.col?.name === 'invoices');
    expect(packageSub).toBeUndefined();
    expect(invoiceSub).toBeUndefined();
  });

  it('subscribes to packages/invoices when hasLoaded is true', () => {
    const { result } = renderHook(() => useEncomiendaDispatchData({ hasLoaded: true }));
    const packageSub = onSnapshotMocks.find(m => m.q?.col?.name === 'packages');
    const invoiceSub = onSnapshotMocks.find(m => m.q?.col?.name === 'invoices');
    expect(packageSub).toBeDefined();
    expect(invoiceSub).toBeDefined();
    expect(result.current.loading).toBe(true);
  });

  it('applies where(manifestNumber, in, ...) filter when manifests are selected', () => {
    const manifests = new Set(['M1', 'M2']);
    renderHook(() => useEncomiendaDispatchData({ hasLoaded: true, manifests }));
    
    const packageSub = onSnapshotMocks.find(m => 
      m.q?.col?.name === 'packages' && 
      m.q.filters.some((f: any) => f.field === 'manifestNumber')
    );
    expect(packageSub).toBeDefined();
    
    const manifestFilter = packageSub.q.filters.find((f: any) => f.field === 'manifestNumber');
    expect(manifestFilter).toBeDefined();
    expect(manifestFilter.op).toBe('in');
    expect(manifestFilter.val).toEqual(['M1', 'm1', 'M2', 'm2']);
  });

  it('fetches customer profiles by slCode chunks when packages are loaded', async () => {
    const mockCustomers = [
      { id: 'c1', data: () => ({ slCode: 'SL001', fullName: 'John Doe', ruta: 'Encomiendas' }) },
    ];
    getDocsMock.mockResolvedValue({ docs: mockCustomers });

    const { result } = renderHook(() => useEncomiendaDispatchData({ hasLoaded: true }));
    
    const packageSubs = onSnapshotMocks.filter(m => m.q?.col?.name === 'packages');
    expect(packageSubs.length).toBeGreaterThan(0);
    
    await act(async () => {
      packageSubs.forEach(sub => {
        sub.callback({
          docs: [
            {
              id: 'pkg1',
              data: () => ({
                trackingNumber: 'TR1',
                slCode: 'SL001',
                ruta: 'Encomiendas',
                status: 'arrived',
                manifestNumber: 'M1',
              }),
            },
          ],
        });
      });
    });

    await waitFor(() => {
      console.log('ALL PACKAGES IN HOOK:', result.current.allPackages);
      console.log('CUSTOMER SECTIONS IN HOOK:', result.current.customerSections);
      expect(getDocsMock).toHaveBeenCalled();
      expect(result.current.customerSections).toHaveLength(1);
      expect(result.current.customerSections[0].customer.fullName).toBe('John Doe');
      expect(result.current.customerSections[0].totalPackages).toBe(1);
    });
  });

  it('extracts and formats customer addresses correctly', async () => {
    const mockCustomers = [
      {
        id: 'c1',
        data: () => ({
          slCode: 'SL001',
          fullName: 'John Doe',
          ruta: 'Encomiendas',
          notes: 'Cliente VIP',
          defaultAddress: {
            streetAddress: '123 Main St',
            details: 'Apt 4B',
            city: 'San Jose',
            province: 'San Jose',
            country: 'Costa Rica',
            deliveryInstructions: 'Llamar antes',
            recipientName: 'Jane Doe',
            recipientPhone: '8888-8888',
          },
        }),
      },
    ];
    getDocsMock.mockResolvedValue({ docs: mockCustomers });

    const { result } = renderHook(() => useEncomiendaDispatchData({ hasLoaded: true }));
    
    const packageSubs = onSnapshotMocks.filter(m => m.q?.col?.name === 'packages');
    expect(packageSubs.length).toBeGreaterThan(0);
    
    await act(async () => {
      packageSubs.forEach(sub => {
        sub.callback({
          docs: [
            {
              id: 'pkg1',
              data: () => ({
                trackingNumber: 'TR1',
                slCode: 'SL001',
                ruta: 'Encomiendas',
                status: 'arrived',
                manifestNumber: 'M1',
              }),
            },
          ],
        });
      });
    });

    await waitFor(() => {
      expect(result.current.customerSections).toHaveLength(1);
      const cust = result.current.customerSections[0].customer;
      expect(cust.address).toBe(
        '123 Main St, Apt 4B, San Jose, San Jose, Costa Rica'
      );
      expect(cust.notes).toBe('Cliente VIP | Llamar antes');
      expect(cust.recipientName).toBe('Jane Doe');
      expect(cust.recipientPhone).toBe('8888-8888');
    });
  });
});
