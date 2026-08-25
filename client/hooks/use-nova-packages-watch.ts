/**
 * useNovaPackagesWatch — track external mutations to the manifest's
 * package set while the operator has it open in NovaTableModal.
 *
 * ─── What it does ─────────────────────────────────────────────────────────
 *
 * Subscribes to `packages` where `manifestNumber === manifestId` via
 * `onSnapshot`. Computes the diff between the live tracking set and a
 * baseline `expectedTrackings` (typically derived from
 * `resultData.rows.map(r => r.tracking)`). Returns:
 *
 *   • `addedTrackings`    — packages now in the manifest but not in baseline
 *                            (someone moved a package IN externally).
 *   • `removedTrackings`  — packages in baseline but not in live snapshot
 *                            (someone moved a package OUT, or deleted it).
 *   • `staleCount`        — added.size + removed.size, used to render
 *                            the toolbar pill.
 *   • `acknowledge()`     — operator action: rebases the baseline so the
 *                            stale state clears (typically called after a
 *                            full reload via `loadMegaManFromFirestore`).
 *
 * ─── Why a hook + not a direct subscription in the component ──────────────
 *
 * NovaTableModal is already past 4500 lines. Encapsulating the diff logic
 * here keeps the component lean and lets us unit-test the diff math
 * without rendering the whole modal.
 *
 * ─── Important: the hook NEVER auto-reloads ──────────────────────────────
 *
 * It only EXPOSES the diff. The operator decides when to reload — the UI
 * surfaces a banner with a button. This is intentional: a silent reload
 * could overwrite in-flight edits the operator hasn't saved yet.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribePackagesByManifest } from '@/lib/services/manifest-processor';

export interface UseNovaPackagesWatchOptions {
  manifestId: string | null | undefined;
  /** Trackings present at the moment the operator opened the manifest. */
  expectedTrackings: ReadonlyArray<string>;
  /** When false, the hook is dormant (manifest list, modal closed, etc.). */
  enabled: boolean;
}

export interface UseNovaPackagesWatchState {
  /** Trackings now in the manifest but missing from baseline. */
  addedTrackings: ReadonlySet<string>;
  /** Trackings missing from the live snapshot vs baseline. */
  removedTrackings: ReadonlySet<string>;
  /** Total drift. UI uses this to drive the banner visibility. */
  staleCount: number;
  /** Re-baseline so the stale indicators clear. */
  acknowledge: () => void;
}

function upper(t: string): string { return t.trim().toUpperCase(); }

export function useNovaPackagesWatch({
  manifestId,
  expectedTrackings,
  enabled,
}: UseNovaPackagesWatchOptions): UseNovaPackagesWatchState {
  // The baseline is the tracking set the consumer considers "current". We
  // track it in a ref so the operator can `acknowledge()` and effectively
  // rebase without triggering a re-subscribe.
  const baselineRef = useRef<Set<string>>(new Set(expectedTrackings.map(upper)));

  // Track the LAST `expectedTrackings` we observed so we can detect prop
  // changes without comparing against `baselineRef.current` (which the
  // operator's `acknowledge()` action legitimately mutates between
  // renders — comparing against it would undo the rebase).
  const lastExpectedRef = useRef<string[]>(expectedTrackings.map(upper));

  // Keep baselineRef in sync when `expectedTrackings` changes (new manifest
  // loaded, or post-reload). We compare against the previous prop value
  // so a re-render with the same content does not undo `acknowledge()`.
  useEffect(() => {
    const next = expectedTrackings.map(upper);
    const prev = lastExpectedRef.current;
    const nextSet = new Set(next);
    const prevSet = new Set(prev);
    if (nextSet.size === prevSet.size && [...nextSet].every(t => prevSet.has(t))) return;
    lastExpectedRef.current = next;
    baselineRef.current = nextSet;
    // Reset stale state to match the new baseline.
    setAdded(new Set());
    setRemoved(new Set());
  }, [expectedTrackings]);

  const [added, setAdded] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !manifestId) return;
    const unsubscribe = subscribePackagesByManifest(manifestId, (live) => {
      const baseline = baselineRef.current;
      const newAdded = new Set<string>();
      const newRemoved = new Set<string>();
      live.forEach(t => { if (!baseline.has(t)) newAdded.add(t); });
      baseline.forEach(t => { if (!live.has(t)) newRemoved.add(t); });
      setAdded(newAdded);
      setRemoved(newRemoved);
    });
    return () => { unsubscribe(); };
  }, [enabled, manifestId]);

  const acknowledge = useCallback(() => {
    // Rebase: fold any current diff into the baseline so the next live
    // tick produces a clean (empty) state until the next external change.
    const next = new Set(baselineRef.current);
    added.forEach(t => next.add(t));
    removed.forEach(t => next.delete(t));
    baselineRef.current = next;
    setAdded(new Set());
    setRemoved(new Set());
  }, [added, removed]);

  return {
    addedTrackings: added,
    removedTrackings: removed,
    staleCount: added.size + removed.size,
    acknowledge,
  };
}
