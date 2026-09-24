// @vitest-environment jsdom
/**
 * useConsolidationData.spec.ts
 *
 * Regression coverage for the packages-listener coalescing fix
 * (AI GUARD: PERF-COALESCE-PKG-LISTENERS, 2026-09-23).
 *
 * ─── Context ─────────────────────────────────────────────────────────────
 * The hook opens 3 independent onSnapshot listeners on `packages`
 * (consolidacion==true / updatedManifest==transitoria / manifestNumber==
 * transitoria). A single write — e.g. carryOnPackages moving a package out
 * of consolidacion_transitoria — touches fields covered by 2-3 of those
 * queries at once, so Firestore fires 2-3 of their callbacks for the SAME
 * logical change. Before this fix, each callback directly called
 * mergeAndEmitPackages() -> setPackages(), triggering a full recompute of
 * customerSections/filteredSections per delivery — on real data this read
 * as sluggish/"not updating" reactivity for every viewer of
 * ConsolidationManifests (reported 2026-09-23: admin B's list didn't drop
 * a carried-on package immediately while admin A was moving it).
 *
 * This file verifies BOTH halves of the fix:
 *   1. Multiple snapshot deliveries in the same tick schedule exactly ONE
 *      pending timer (coalesced), not one per delivery.
 *   2. The eventual merged package list is still correct — coalescing must
 *      never drop or stale data, only batch the recompute.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

type SnapshotCb = (snap: { docs: Array<{ id: string; data: () => any }> }) => void;
interface Registration { col: string; wheres: string; cb: SnapshotCb; }

const registrations: Registration[] = [];

const firestoreFns = vi.hoisted(() => ({
  onSnapshotRegistrations: [] as Registration[],
}));

vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db: unknown, name: string) => ({ __col: name })),
    where: vi.fn((field: string, op: string, val: unknown) => ({ __where: `${field}:${op}:${JSON.stringify(val)}` })),
    query: vi.fn((colRef: { __col: string }, ...wheres: Array<{ __where: string }>) => ({
      __col: colRef.__col,
      __wheres: wheres.map(w => w.__where).join('&'),
    })),
    onSnapshot: vi.fn((q: { __col: string; __wheres: string }, onNext: SnapshotCb) => {
      const reg: Registration = { col: q.__col, wheres: q.__wheres, cb: onNext };
      firestoreFns.onSnapshotRegistrations.push(reg);
      return () => {
        const idx = firestoreFns.onSnapshotRegistrations.indexOf(reg);
        if (idx !== -1) firestoreFns.onSnapshotRegistrations.splice(idx, 1);
      };
    }),
  };
});
vi.mock('@/lib/firebase/config', () => ({ db: {} }));

import { useConsolidationData } from '../useConsolidationData';

function pkgDoc(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    data: () => ({
      trackingNumber: id,
      consolidacion: true,
      manifestNumber: 'consolidacion_transitoria',
      updatedManifest: 'consolidacion_transitoria',
      status: 'consolidated',
      slCode: 'SL1',
      ...overrides,
    }),
  };
}

/** The 3 package-collection listeners, in registration order (query 1/2/3). */
function getPackageRegistrations(): Registration[] {
  return firestoreFns.onSnapshotRegistrations.filter(r => r.col === 'packages');
}

beforeEach(() => {
  firestoreFns.onSnapshotRegistrations.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useConsolidationData — packages listener coalescing', () => {
  it('registers exactly 3 independent listeners on the packages collection', () => {
    renderHook(() => useConsolidationData());
    expect(getPackageRegistrations().length).toBe(3);
  });

  it('coalesces 2 near-simultaneous deliveries (same write, 2 matching queries) into exactly ONE pending timer', () => {
    vi.useFakeTimers();
    renderHook(() => useConsolidationData());
    const [q1, q2] = getPackageRegistrations();

    // Simulate a single carryOnPackages write hitting BOTH query 1
    // (consolidacion==true, still matches) and query 2
    // (updatedManifest==transitoria, still matches pre-move state here) —
    // Firestore delivers both callbacks back-to-back for the same change.
    act(() => {
      q1.cb({ docs: [pkgDoc('TRK-A')] });
      q2.cb({ docs: [pkgDoc('TRK-A')] });
    });

    // Exactly one coalesced timer should be pending — NOT two.
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does NOT drop the recompute — the merged package list is correct once the coalesced timer fires', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useConsolidationData());
    const [q1, q2, q3] = getPackageRegistrations();

    act(() => {
      q1.cb({ docs: [pkgDoc('TRK-A')] });
      q2.cb({ docs: [pkgDoc('TRK-A')] });
      q3.cb({ docs: [] });
    });

    act(() => { vi.advanceTimersByTime(60); });

    expect(result.current.allPackages.map(p => p.trackingNumber)).toEqual(['TRK-A']);
  });

  it('a SECOND write arriving after the coalescing window schedules its own new timer (does not get lost)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useConsolidationData());
    const [q1] = getPackageRegistrations();

    act(() => {
      q1.cb({ docs: [pkgDoc('TRK-A')] });
    });
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.allPackages.map(p => p.trackingNumber)).toEqual(['TRK-A']);

    // A later, independent write (well outside the 50ms coalescing window)
    act(() => {
      q1.cb({ docs: [pkgDoc('TRK-A'), pkgDoc('TRK-B')] });
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current.allPackages.map(p => p.trackingNumber).sort()).toEqual(['TRK-A', 'TRK-B']);
  });
});
