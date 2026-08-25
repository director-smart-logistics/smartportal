// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock dependecies
vi.mock('.././useLocale', () => ({
  useLocale: vi.fn(() => ({ language: 'es' })),
}));

vi.mock('@/lib/auth/auth-client', () => ({
  getAuthToken: vi.fn(async () => 'mock-token'),
}));

vi.mock('@/lib/services/manifest-learning-service', () => ({
  recordManifestLearning: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/manifest-processor', () => ({
  processManifestFile: vi.fn(async () => ({})),
  saveManifestRecord: vi.fn(async () => ({})),
  loadManifestFromFirestore: vi.fn(async () => ({})),
  downloadCSV: vi.fn(),
  downloadXLSX: vi.fn(),
}));

vi.mock('@/lib/services/customer-sync', () => ({
  updateCustomerRuta: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/match-learning', () => ({
  warmLearnedCache: vi.fn(async () => {}),
}));

import { useNovaChat } from '.././use-nova-chat';

describe('useNovaChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useNovaChat());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.currentStep).toBe('');
    expect(result.current.processedData).toBeNull();
  });

  it('should clear messages and inject manual data correctly', () => {
    const { result } = renderHook(() => useNovaChat());

    const mockData = {
      rows: [],
      summary: {
        totalRows: 0,
        processedRows: 0,
        errors: 0,
        totalPrice: 0,
        customersMatched: 0,
        namesCorrections: 0,
        weightCorrections: 0,
      },
      manifestNumber: 'MAN-100',
      corrections: [],
    } as any;

    act(() => {
      result.current.injectManualData(mockData);
    });

    expect(result.current.processedData).toEqual(mockData);

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.processedData).toBeNull();
  });
});
