// @vitest-environment jsdom
/**
 * useNovaIntegrityAudit — orchestration tests.
 *
 * Contract:
 *   1. The audit ONLY auto-runs for Firestore-loaded manifests when
 *      enabled is true.
 *   2. Fresh-parse manifests don't trigger an audit (auditManifestIntegrity
 *      is never called).
 *   3. `runAudit` can be called manually and updates `report` / `loading`.
 *   4. Errors set `error` but DON'T wipe the previous report.
 *   5. Concurrent `runAudit()` calls de-dup (in-flight guard).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

const auditMock = vi.fn();

vi.mock('@/lib/nova/integrity', () => ({
  auditManifestIntegrity: (id: string) => auditMock(id),
}));

import { useNovaIntegrityAudit } from '.././use-nova-integrity-audit';

const REPORT = {
  manifestId: 'M-1',
  scannedAt: '2026-04-29T00:00:00Z',
  totalRows: 2,
  issues: [],
  summary: {
    bySeverity: { high: 0, medium: 0, low: 0 },
    byKind: {},
    repairableManifestRows: 0,
    invoicesNeedingReview: 0,
  },
};

beforeEach(() => {
  auditMock.mockReset();
});

afterEach(() => cleanup());

describe('useNovaIntegrityAudit', () => {
  it('auto-runs the audit for a Firestore-loaded manifest when enabled', async () => {
    auditMock.mockResolvedValue(REPORT);
    const { result } = renderHook(() =>
      useNovaIntegrityAudit({ manifestId: 'M-1', isFromFirestore: true, enabled: true }),
    );
    await waitFor(() => {
      expect(auditMock).toHaveBeenCalledWith('M-1');
      expect(result.current.report).toEqual(REPORT);
      expect(result.current.loading).toBe(false);
    });
  });

  it('does NOT auto-run for fresh-parse manifests', async () => {
    auditMock.mockResolvedValue(REPORT);
    renderHook(() =>
      useNovaIntegrityAudit({ manifestId: 'M-1', isFromFirestore: false, enabled: true }),
    );
    // Wait a tick — should NOT call.
    await new Promise(r => setTimeout(r, 10));
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('does NOT auto-run when enabled is false', async () => {
    auditMock.mockResolvedValue(REPORT);
    renderHook(() =>
      useNovaIntegrityAudit({ manifestId: 'M-1', isFromFirestore: true, enabled: false }),
    );
    await new Promise(r => setTimeout(r, 10));
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('runAudit() can be called manually and updates the report', async () => {
    auditMock.mockResolvedValue(REPORT);
    const { result } = renderHook(() =>
      useNovaIntegrityAudit({ manifestId: 'M-1', isFromFirestore: false, enabled: true }),
    );
    await act(async () => { await result.current.runAudit(); });
    expect(result.current.report).toEqual(REPORT);
  });

  it('keeps the previous report visible when a follow-up audit fails', async () => {
    auditMock
      .mockResolvedValueOnce(REPORT)
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useNovaIntegrityAudit({ manifestId: 'M-1', isFromFirestore: true, enabled: true }),
    );
    await waitFor(() => expect(result.current.report).toEqual(REPORT));
    await act(async () => { await result.current.runAudit(); });
    expect(result.current.error).toMatch(/boom/);
    expect(result.current.report).toEqual(REPORT); // preserved
  });

  it('exposes hasIssues true when report.issues is non-empty', async () => {
    auditMock.mockResolvedValue({
      ...REPORT,
      issues: [{ kind: 'slcode_mismatch', severity: 'high' } as any],
    });
    const { result } = renderHook(() =>
      useNovaIntegrityAudit({ manifestId: 'M-1', isFromFirestore: true, enabled: true }),
    );
    await waitFor(() => expect(result.current.hasIssues).toBe(true));
  });
});
