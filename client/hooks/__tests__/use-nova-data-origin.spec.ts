// @vitest-environment jsdom
/**
 * useNovaDataOrigin — hook integration tests.
 *
 * Verifies that the hook:
 *   1. Returns the correct frozen policy instance for each origin.
 *   2. Memoizes by `loadedFromFirestore` only — re-renders with the same
 *      flag value MUST NOT produce a new policy reference (downstream
 *      useEffects depend on this for stable deps).
 *   3. Returns the FRESH policy for null/undefined inputs (defensive
 *      degradation; never destructive).
 *
 * These contracts protect every downstream effect that uses `policy` as a
 * dependency: if the hook returned a fresh object reference on each render,
 * effects would re-fire endlessly and silently corrupt state.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNovaDataOrigin } from '.././use-nova-data-origin';
import { FIRESTORE_POLICY, FRESH_POLICY } from '@/lib/nova/data-origin';

describe('useNovaDataOrigin', () => {
  it('returns FRESH_POLICY when loadedFromFirestore is omitted (legacy / fresh upload)', () => {
    const { result } = renderHook(() => useNovaDataOrigin({}));
    expect(result.current).toBe(FRESH_POLICY);
  });

  it('returns FIRESTORE_POLICY when loadedFromFirestore is exactly true', () => {
    const { result } = renderHook(() =>
      useNovaDataOrigin({ loadedFromFirestore: true }),
    );
    expect(result.current).toBe(FIRESTORE_POLICY);
  });

  it('returns FRESH_POLICY when loadedFromFirestore is false', () => {
    const { result } = renderHook(() =>
      useNovaDataOrigin({ loadedFromFirestore: false }),
    );
    expect(result.current).toBe(FRESH_POLICY);
  });

  it('returns FRESH_POLICY when input is null (never crashes)', () => {
    const { result } = renderHook(() => useNovaDataOrigin(null));
    expect(result.current).toBe(FRESH_POLICY);
  });

  it('returns FRESH_POLICY when input is undefined (never crashes)', () => {
    const { result } = renderHook(() => useNovaDataOrigin(undefined));
    expect(result.current).toBe(FRESH_POLICY);
  });

  it('returns the SAME reference across re-renders when the flag does not change', () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: { loadedFromFirestore: boolean } }) =>
        useNovaDataOrigin(data),
      { initialProps: { data: { loadedFromFirestore: true } } },
    );
    const first = result.current;
    rerender({ data: { loadedFromFirestore: true } });
    expect(result.current).toBe(first); // referential stability for useEffect deps
  });

  it('returns a different reference when the flag flips', () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: { loadedFromFirestore: boolean } }) =>
        useNovaDataOrigin(data),
      { initialProps: { data: { loadedFromFirestore: false } } },
    );
    expect(result.current).toBe(FRESH_POLICY);
    rerender({ data: { loadedFromFirestore: true } });
    expect(result.current).toBe(FIRESTORE_POLICY);
  });
});
