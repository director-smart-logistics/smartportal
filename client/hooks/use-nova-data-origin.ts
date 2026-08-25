/**
 * useNovaDataOrigin — derive the active DataOriginPolicy for a given
 * NovaTableModal payload.
 *
 * Single hook every consumer goes through. Memoizes on the canonical
 * `loadedFromFirestore` field so React-tree updates do not thrash the
 * downstream `useEffect` deps that read `policy.allowAuto…`.
 *
 * ─── EXAMPLE USAGE ─────────────────────────────────────────────────────────
 *
 * ```tsx
 * const policy = useNovaDataOrigin(resultData);
 *
 * useEffect(() => {
 *   if (!policy.allowAutoPreAlertAssign) return; // FIRESTORE — skip
 *   runPreAlertAutoAssign(...);
 * }, [policy, ...]);
 * ```
 *
 * Importantly, the consumer does NOT branch on the origin string — it
 * branches on the *behavior flag*. Adding a new origin (e.g. `sp2-import`)
 * with its own policy is a non-event for every call-site that reads
 * `policy.allowAutoPreAlertAssign`.
 */

import { useMemo } from 'react';
import {
  policyFromResultData,
  type DataOriginPolicy,
} from '@/lib/nova/data-origin';

/**
 * Minimal subset of `ProcessedNovaData` that the policy factory inspects.
 * We accept this shape (instead of the full type) so the hook can be used
 * in tests / Storybook / partial mocks without dragging in the entire
 * Nova chat surface.
 */
export interface DataOriginInput {
  loadedFromFirestore?: boolean | null | undefined;
}

export function useNovaDataOrigin(
  resultData: DataOriginInput | null | undefined,
): DataOriginPolicy {
  // Memo dep is the canonical boolean — flipping it (very rare in practice,
  // happens only when the operator switches between fresh/saved manifests
  // without unmounting the modal) returns the *other* shared frozen
  // instance, so referential equality is preserved across re-renders for
  // every downstream `useEffect`.
  return useMemo(
    () => policyFromResultData(resultData ?? undefined),
    [resultData?.loadedFromFirestore],
  );
}
