// @vitest-environment jsdom
/**
 * useNovaPackagesWatch — diff-detection tests.
 *
 * Contract:
 *   1. When the live snapshot equals the baseline → staleCount === 0.
 *   2. New tracking in live snapshot → goes into addedTrackings.
 *   3. Tracking removed from live snapshot → goes into removedTrackings.
 *   4. acknowledge() rebases the baseline; subsequent identical snapshots
 *      no longer flag the rebased trackings.
 *   5. Disabled flag suppresses the subscription.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// Capture-style mock so we can drive the subscription callback manually
// from the tests.
let lastCb: ((set: Set<string>) => void) | null = null;
const subscribeMock = vi.fn((_id: string, cb: (set: Set<string>) => void) => {
  lastCb = cb;
  return () => { lastCb = null; };
});

vi.mock('@/lib/services/manifest-processor', () => ({
  subscribePackagesByManifest: (id: string, cb: (set: Set<string>) => void) =>
    subscribeMock(id, cb),
}));

import { useNovaPackagesWatch } from '.././use-nova-packages-watch';

beforeEach(() => {
  subscribeMock.mockClear();
  lastCb = null;
});

afterEach(() => cleanup());

describe('useNovaPackagesWatch', () => {
  it('does NOT subscribe when disabled', () => {
    renderHook(() =>
      useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: ['A'], enabled: false }),
    );
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('does NOT subscribe when manifestId is empty', () => {
    renderHook(() =>
      useNovaPackagesWatch({ manifestId: '', expectedTrackings: ['A'], enabled: true }),
    );
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('reports zero drift when live equals baseline', () => {
    const { result } = renderHook(() =>
      useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: ['A', 'B'], enabled: true }),
    );
    act(() => { lastCb!(new Set(['A', 'B'])); });
    expect(result.current.staleCount).toBe(0);
    expect(result.current.addedTrackings.size).toBe(0);
    expect(result.current.removedTrackings.size).toBe(0);
  });

  it('flags addedTrackings when a new tracking shows up live', () => {
    const { result } = renderHook(() =>
      useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: ['A'], enabled: true }),
    );
    act(() => { lastCb!(new Set(['A', 'NEW'])); });
    expect(result.current.staleCount).toBe(1);
    expect(result.current.addedTrackings.has('NEW')).toBe(true);
  });

  it('flags removedTrackings when a baseline tracking is missing live', () => {
    const { result } = renderHook(() =>
      useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: ['A', 'GONE'], enabled: true }),
    );
    act(() => { lastCb!(new Set(['A'])); });
    expect(result.current.staleCount).toBe(1);
    expect(result.current.removedTrackings.has('GONE')).toBe(true);
  });

  it('acknowledge() rebases the baseline so subsequent ticks are clean', () => {
    const { result } = renderHook(() =>
      useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: ['A'], enabled: true }),
    );
    act(() => { lastCb!(new Set(['A', 'NEW'])); });
    expect(result.current.staleCount).toBe(1);
    act(() => { result.current.acknowledge(); });
    expect(result.current.staleCount).toBe(0);
    // Now NEW is part of baseline — sending the same set should be clean.
    act(() => { lastCb!(new Set(['A', 'NEW'])); });
    expect(result.current.staleCount).toBe(0);
  });

  it('rebases automatically when expectedTrackings changes', () => {
    const { result, rerender } = renderHook(
      ({ trackings }: { trackings: string[] }) =>
        useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: trackings, enabled: true }),
      { initialProps: { trackings: ['A'] } },
    );
    act(() => { lastCb!(new Set(['A', 'NEW'])); });
    expect(result.current.staleCount).toBe(1);
    rerender({ trackings: ['A', 'NEW'] });
    expect(result.current.staleCount).toBe(0);
  });

  it('does NOT rebase or reset stale count when expectedTrackings changes only in order', () => {
    const { result, rerender } = renderHook(
      ({ trackings }: { trackings: string[] }) =>
        useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: trackings, enabled: true }),
      { initialProps: { trackings: ['A', 'B'] } },
    );
    act(() => { lastCb!(new Set(['A', 'B', 'NEW'])); });
    expect(result.current.staleCount).toBe(1);
    rerender({ trackings: ['B', 'A'] });
    expect(result.current.staleCount).toBe(1);
  });

  it('case-insensitive tracking comparison', () => {
    const { result } = renderHook(() =>
      useNovaPackagesWatch({ manifestId: 'M', expectedTrackings: ['abc'], enabled: true }),
    );
    act(() => { lastCb!(new Set(['ABC'])); });
    expect(result.current.staleCount).toBe(0);
  });
});
