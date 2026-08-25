/**
 * Data-origin policy contract — regression tests.
 *
 * These tests freeze the behavior contract that every consumer of the
 * data-origin module relies on. The intent is to make accidental drift
 * impossible: if a future change flips a flag in FIRESTORE_POLICY without
 * updating the test, CI fails before the regression hits production.
 *
 * Coverage target: every policy flag is asserted in BOTH directions
 * (fresh: enabled / disabled per its semantic; firestore: opposite).
 *
 * Reproducer for the historical bug:
 *   - Operator linked "PAULA UMANA" → "ANA PAULA FONSECA QUADROS" via
 *     Acciones, saved the manifest, re-loaded it later.
 *   - The auto-divergent-rematcher silently ran (gate was a hand-rolled
 *     `loadedFromFirestore` cast missed in one site) and rewrote the link
 *     back to a name-based match.
 *   - These tests + the policy module guarantee the gate is consistent
 *     across every consumer.
 */

import { describe, it, expect } from 'vitest';
import {
  FRESH_POLICY,
  FIRESTORE_POLICY,
  policyForOrigin,
  policyFromResultData,
  type DataOrigin,
  type DataOriginPolicy,
} from '.././types';

// ── Static contract ──────────────────────────────────────────────────────────

describe('FRESH_POLICY', () => {
  it('has origin === "fresh"', () => {
    expect(FRESH_POLICY.origin).toBe<DataOrigin>('fresh');
  });

  it('enables every auto-validator (review aid for the operator)', () => {
    expect(FRESH_POLICY.allowAutoDivergentRematch).toBe(true);
    expect(FRESH_POLICY.allowAutoPreAlertAssign).toBe(true);
    expect(FRESH_POLICY.allowAutoLearnedRoute).toBe(true);
  });

  it('shows divergent UI nags (badges + filter) so the operator can drill into matches', () => {
    expect(FRESH_POLICY.showDivergentBadges).toBe(true);
    expect(FRESH_POLICY.showDivergentFilter).toBe(true);
  });

  it('hides the Firestore-only frozen banner', () => {
    expect(FRESH_POLICY.showFrozenBanner).toBe(false);
  });

  it('exposes "Re-validar todo" so operators can recover from partial auto-validation', () => {
    // BUG-VER-TABLA-FREEZE 2026-05-26: previously hidden for fresh parses.
    // Now surfaced in both policies as a deterministic manual redo path.
    expect(FRESH_POLICY.showRevalidateAllButton).toBe(true);
  });

  it('is frozen — call-sites must never mutate the shared instance', () => {
    expect(Object.isFrozen(FRESH_POLICY)).toBe(true);
    expect(() => {
      // @ts-expect-error — runtime check that frozen blocks writes
      FRESH_POLICY.allowAutoDivergentRematch = false;
    }).toThrow();
  });
});

describe('FIRESTORE_POLICY', () => {
  it('has origin === "firestore"', () => {
    expect(FIRESTORE_POLICY.origin).toBe<DataOrigin>('firestore');
  });

  it('disables every auto-validator (preserves operator-curated state)', () => {
    expect(FIRESTORE_POLICY.allowAutoDivergentRematch).toBe(false);
    expect(FIRESTORE_POLICY.allowAutoPreAlertAssign).toBe(false);
    expect(FIRESTORE_POLICY.allowAutoLearnedRoute).toBe(false);
  });

  it('hides divergent UI nags (badges + filter would invite operator to undo their own work)', () => {
    expect(FIRESTORE_POLICY.showDivergentBadges).toBe(false);
    expect(FIRESTORE_POLICY.showDivergentFilter).toBe(false);
  });

  it('shows Firestore-only affordances (frozen banner + Re-validar all opt-in button)', () => {
    expect(FIRESTORE_POLICY.showFrozenBanner).toBe(true);
    expect(FIRESTORE_POLICY.showRevalidateAllButton).toBe(true);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FIRESTORE_POLICY)).toBe(true);
  });

  it('is the strict logical inverse of FRESH_POLICY for every gating flag', () => {
    // If a future flag is added that does NOT have a clean inverse, this
    // test must be updated explicitly — a flag-by-flag review is required.
    // showRevalidateAllButton intentionally OMITTED — since
    // BUG-VER-TABLA-FREEZE 2026-05-26 it is `true` in both policies so
    // operators always have a manual rematch escape hatch. Asserting that
    // separately above.
    const invertedFlags: Array<keyof DataOriginPolicy> = [
      'allowAutoDivergentRematch',
      'allowAutoPreAlertAssign',
      'allowAutoLearnedRoute',
      'showDivergentBadges',
      'showDivergentFilter',
      'showFrozenBanner',
    ];
    invertedFlags.forEach(flag => {
      expect(FRESH_POLICY[flag]).not.toBe(FIRESTORE_POLICY[flag]);
    });
  });
});

// ── Factories ────────────────────────────────────────────────────────────────

describe('policyForOrigin', () => {
  it('returns FRESH_POLICY for "fresh" origin', () => {
    expect(policyForOrigin('fresh')).toBe(FRESH_POLICY);
  });

  it('returns FIRESTORE_POLICY for "firestore" origin', () => {
    expect(policyForOrigin('firestore')).toBe(FIRESTORE_POLICY);
  });

  it('returns the SAME instance every call — safe to use as a useMemo dep', () => {
    expect(policyForOrigin('fresh')).toBe(policyForOrigin('fresh'));
    expect(policyForOrigin('firestore')).toBe(policyForOrigin('firestore'));
  });
});

describe('policyFromResultData', () => {
  it('treats { loadedFromFirestore: true } as Firestore origin', () => {
    expect(policyFromResultData({ loadedFromFirestore: true })).toBe(FIRESTORE_POLICY);
  });

  it('treats { loadedFromFirestore: false } as fresh origin', () => {
    expect(policyFromResultData({ loadedFromFirestore: false })).toBe(FRESH_POLICY);
  });

  it('treats { loadedFromFirestore: undefined } (omitted) as fresh origin (legacy default)', () => {
    expect(policyFromResultData({})).toBe(FRESH_POLICY);
  });

  it('treats { loadedFromFirestore: null } as fresh origin (defensive — Firestore docs sometimes serialize null)', () => {
    expect(policyFromResultData({ loadedFromFirestore: null })).toBe(FRESH_POLICY);
  });

  it('treats null/undefined data as fresh (defensive — should never happen but never crashes)', () => {
    expect(policyFromResultData(null)).toBe(FRESH_POLICY);
    expect(policyFromResultData(undefined)).toBe(FRESH_POLICY);
  });

  it('only matches the EXACT boolean true (other truthy values fall back to fresh)', () => {
    // The Firestore loader sets the flag to a literal `true`; any other
    // truthy stand-in (numbers, strings, objects) is a bug elsewhere — we
    // refuse to silently route those into the destructive Firestore branch.
    expect(policyFromResultData({ loadedFromFirestore: 1 as unknown as boolean })).toBe(FRESH_POLICY);
    expect(policyFromResultData({ loadedFromFirestore: 'true' as unknown as boolean })).toBe(FRESH_POLICY);
    expect(policyFromResultData({ loadedFromFirestore: {} as unknown as boolean })).toBe(FRESH_POLICY);
  });
});

// ── Type-level safety ────────────────────────────────────────────────────────

describe('DataOriginPolicy shape', () => {
  it('exposes the same flag set on FRESH and FIRESTORE policies', () => {
    expect(Object.keys(FRESH_POLICY).sort())
      .toEqual(Object.keys(FIRESTORE_POLICY).sort());
  });
});
