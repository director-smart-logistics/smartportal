/**
 * useNovaIntegrityAudit — orchestration hook for the Nova manifest
 * integrity audit.
 *
 * ─── What it does ─────────────────────────────────────────────────────────
 *
 * Wraps the auditManifestIntegrity Firestore call with React state so
 * `NovaTableModal` can:
 *
 *   1. Auto-run the audit ONCE when a Firestore-loaded manifest is opened
 *      (only — fresh-parse manifests are skipped because the audit needs
 *      stable Firestore data to compare against).
 *   2. Re-run the audit on demand (after a repair, or when the operator
 *      hits "Re-auditar" in the modal).
 *   3. Expose `loading`, `report`, and `error` so the UI can render a
 *      spinner / clean-state / issue-count badge without each consumer
 *      duplicating that boilerplate.
 *
 * ─── Why a dedicated hook ─────────────────────────────────────────────────
 *
 * Putting the orchestration here keeps NovaTableModal lean — the
 * component already crosses 4500 lines, and embedding the audit lifecycle
 * inline would tangle effects with all the existing auto-rematch +
 * pre-alert + invoice subscription logic. The hook returns a stable
 * surface that's easy to reason about + unit-test in isolation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { auditManifestIntegrity, type IntegrityReport } from '@/lib/nova/integrity';

export interface UseNovaIntegrityAuditOptions {
  /** Manifest doc ID — empty / null disables auto-trigger. */
  manifestId: string | null | undefined;
  /**
   * Whether the manifest came from Firestore. Fresh-parse manifests
   * (MLcargo Excel) are NOT auto-audited because the audit compares
   * Firestore-saved state — there's nothing to compare against on a
   * fresh parse.
   */
  isFromFirestore: boolean;
  /** When false, the hook does nothing (modal closed, manifest list, etc.). */
  enabled: boolean;
}

export interface UseNovaIntegrityAuditState {
  report: IntegrityReport | null;
  loading: boolean;
  /** Last error message (Firestore failure). Null on success / never-run. */
  error: string | null;
  /** Runs the audit. Use to re-audit after a repair or via "Re-auditar" UX. */
  runAudit: () => Promise<void>;
  /** Convenience flag: true when the most recent report has any issues. */
  hasIssues: boolean;
}

export function useNovaIntegrityAudit({
  manifestId,
  isFromFirestore,
  enabled,
}: UseNovaIntegrityAuditOptions): UseNovaIntegrityAuditState {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const runAudit = useCallback(async () => {
    if (!manifestId) return;
    if (inFlightRef.current) return; // de-dup: one audit at a time
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await auditManifestIntegrity(manifestId);
      setReport(r);
    } catch (err) {
      setError((err as Error).message ?? 'Audit failed');
      // Keep the previous report visible — don't clear on error.
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [manifestId]);

  // Auto-trigger when a fresh Firestore-loaded manifest is opened. We do
  // NOT re-trigger on manifestId equality (would re-run on every parent
  // re-render); the effect only fires when manifestId actually changes
  // OR when isFromFirestore flips on.
  useEffect(() => {
    if (!enabled) return;
    if (!manifestId) return;
    if (!isFromFirestore) return;
    runAudit();
  }, [enabled, manifestId, isFromFirestore, runAudit]);

  return {
    report,
    loading,
    error,
    runAudit,
    hasIssues: !!report && report.issues.length > 0,
  };
}
