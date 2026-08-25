/**
 * useNovaAutoSave — debounced auto-save for Nova manifest overrides.
 *
 * ─── Why a separate auto-save path ──────────────────────────────────────────
 *
 * The manual "Guardar en BD" / "Actualizar BD" buttons run a heavy pipeline:
 *
 *   1. ingestManifestToPackages      → packages collection upserts
 *   2. saveManifestRecord            → manifests/{mn} doc (lightweight)
 *   3. saveEncomiendaManifestRows    → manifest_encomiendas mirror
 *   4. createInvoicesFromRows        → invoices collection (heavy)
 *   5. sendInvoiceEmails             → email side-effects
 *
 * Auto-saving every keystroke through that pipeline would be reckless —
 * invoice writes are observable by clients, billing-grade, and require
 * explicit operator intent. So this hook does ONLY step 2 (the cheapest
 * write that fully captures every override) and defers everything else
 * to the explicit buttons.
 *
 * ─── What gets persisted ────────────────────────────────────────────────────
 *
 * `saveManifestRecord` rewrites `manifests/{manifestNumber}` with the
 * resolved-row snapshot. The embedded `packages` array carries every
 * effective slCode / matched name / route / price — exactly the state
 * the operator just edited. On reload, `loadMegaManFromFirestore` rehydrates
 * a 100% identical table, so no edit is ever lost to a refresh / tab close.
 *
 * Packages and invoices in their own collections are NOT touched —
 * they reflect the LAST explicit "Actualizar BD". This is a deliberate
 * trade-off: between manual saves the table state lives in `manifests/{mn}`
 * (lossless) while billing artefacts stay frozen until the operator
 * confirms the heavy pipeline.
 *
 * ─── Debounce + dedup ───────────────────────────────────────────────────────
 *
 *   - After every dependency change, the next save is scheduled `delayMs`
 *     into the future. A new change resets the timer (classic trailing
 *     debounce).
 *   - One save runs at a time. If a save is already in flight when the
 *     timer fires again, the next save is queued via `pendingRef` and
 *     kicks off as soon as the current one resolves.
 *   - The very first render NEVER auto-saves — initial mount populates
 *     state from props, which we must not echo back to Firestore.
 *
 * ─── Status reporting ───────────────────────────────────────────────────────
 *
 * Exposes a small state machine so the toolbar can render a compact
 * "saving / saved / error" indicator without having to re-derive it from
 * timers:
 *
 *   - 'idle'   — no edits since last successful save (or initial state)
 *   - 'dirty'  — edits queued, save scheduled
 *   - 'saving' — write in flight
 *   - 'saved'  — last write succeeded, no pending edits
 *   - 'error'  — last write failed (the timer keeps retrying on next edit)
 *
 * ─── Resilience to refresh / tab-close ──────────────────────
 *
 * BUG-AUTOSAVE-LOST-MOVE 2026-04-29: Previously the operator could move a
 * row to another group, see the local UI update, and refresh within 1.5s
 * — losing the edit because the debounce timer was killed before its save
 * fired. We now combine three guards:
 *
 *   1. **Short debounce (800ms default)** — discrete clicks (move-to-
 *      group, unlink, assign) typically save within a second of the
 *      action, shrinking the loss window dramatically.
 *   2. **Imperative `flush()`** — exposed to callers so critical actions
 *      (move, unlink, customer-assign) can bypass the debounce entirely.
 *      The debounce stays for noisy inputs (price/peso typing).
 *   3. **`beforeunload` guard** — when state is `dirty` or `saving` we
 *      ask the browser to confirm with the operator before navigating
 *      away. The native dialog gives any in-flight writes time to finish
 *      and warns about pending edits if the timer hasn't fired yet.
 *   4. **Dirty-ref unmount flush** — the unmount cleanup reads a ref
 *      (`dirtyRef`) instead of the timer, so it still flushes correctly
 *      even when React happens to run the sibling debounce-cleanup first.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  saveManifestRecord,
  upsertManifestPackageOverrides,
  type ManifestRow,
} from '@/lib/services/manifest-processor';
import type { CustomerContactInfo } from '@/lib/services/invoice-service';

export type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface UseNovaAutoSaveParams {
  /** Manifest number — auto-save is gated on this being non-empty. */
  manifestNumber: string;
  /** Manifest type passed straight to saveManifestRecord. */
  manifestType: string;
  /** Pre-built customer contact map (already resolved by the caller). */
  customerContacts: Map<string, { slCode: string; email: string; dni: string; fullName: string }> | Map<string, CustomerContactInfo>;
  /** USD↔CRC exchange rate for the manifest doc. */
  exchangeRate: number;
  /** Price adjustments state (Record<string, any>) */
  priceAdjustments?: Record<string, any>;
  /** Price overrides state (Record<string, any>) */
  priceOverrides?: Record<string, any>;
  preAlertsMap?: Map<string, any>;
  dataOriginPolicy?: { origin: string; [key: string]: any };
  /**
   * Resolved row builder. Returning the rows lazily avoids paying the
   * cost on every override change — it is only invoked when the debounce
   * fires. Caller MUST return a fresh array (never mutate in-place).
   */
  buildResolvedRows: () => ManifestRow[];
  /**
   * Master switch. Set to false on fresh-parse manifests (operator hasn't
   * committed an explicit save yet) so we don't write a half-formed doc
   * to Firestore prematurely.
   */
  enabled: boolean;
  /**
   * Override-state fingerprint. Auto-save reschedules whenever this value
   * changes by reference. Caller passes the actual override objects so React
   * dependency-tracking does the diffing for free.
   */
  changeKey: unknown[];
  /** Debounce delay in ms (default 800). */
  delayMs?: number;
}

export interface UseNovaAutoSaveResult {
  status: AutoSaveStatus;
  /** Timestamp (ms) of the last successful write. null if none yet. */
  lastSavedAt: number | null;
  /** Last error message (or null when no error). Cleared on next save success. */
  errorMessage: string | null;
  /**
   * Forces an immediate save — bypasses the debounce. Returns when settled.
   * Callers MUST `await` this when they need persistence guaranteed (e.g.
   * before launching a heavy pipeline that depends on the saved state, or
   * after a discrete operator decision like "move to group" that should
   * not race with refresh).
   */
  flush: () => Promise<void>;
  /**
   * Notifies the hook that an external save was successful (e.g. when the
   * caller manually invokes `saveManifestRecord`). Updates status to 'saved'
   * and clears the dirty flag so the beforeunload guard allows navigation.
   */
  markSaved: () => void;
}

export function useNovaAutoSave(params: UseNovaAutoSaveParams): UseNovaAutoSaveResult {
  const {
    manifestNumber,
    manifestType,
    customerContacts,
    exchangeRate,
    priceAdjustments,
    priceOverrides,
    buildResolvedRows,
    enabled,
    changeKey,
    delayMs = 800,
    preAlertsMap,
    dataOriginPolicy,
  } = params;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Skip the very first effect tick — it fires on mount with props-derived
  // override state, which is identical to what's already in Firestore.
  const initialMountRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  // Tracks whether there are unflushed edits. Set by the dep-change effect,
  // cleared after a successful save. Used by the unmount cleanup to decide
  // whether to fire a final save (so we don't echo state on plain re-renders)
  // AND read by the beforeunload guard so it can warn the operator about
  // pending edits even before the debounce timer expires.
  const dirtyRef = useRef(false);
  // Mirrors the live status into a ref so the beforeunload listener (a
  // window-level handler that captures values once) can read fresh state.
  const statusRef = useRef<AutoSaveStatus>('idle');

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Pin the latest builder + options in refs so the save closure always
  // sees fresh values without forcing the effect to re-run.
  const buildRowsRef = useRef(buildResolvedRows);
  const optsRef = useRef({ manifestType, customerContacts, exchangeRate, priceAdjustments, priceOverrides, preAlertsMap, dataOriginPolicy });
  useEffect(() => { buildRowsRef.current = buildResolvedRows; }, [buildResolvedRows]);
  useEffect(() => {
    optsRef.current = { manifestType, customerContacts, exchangeRate, priceAdjustments, priceOverrides, preAlertsMap, dataOriginPolicy };
  }, [manifestType, customerContacts, exchangeRate, priceAdjustments, priceOverrides, preAlertsMap, dataOriginPolicy]);
  useEffect(() => { statusRef.current = status; }, [status]);

  const performSave = useCallback(async () => {
    if (!manifestNumber) return;
    if (!enabledRef.current) return; // Hard safety switch
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setStatus('saving');
    try {
      const rows = buildRowsRef.current();
      if (rows.length === 0) {
        // Nothing to save — treat as a no-op success.
        dirtyRef.current = false;
        setStatus('saved');
        return;
      }
      // Save BOTH the manifest summary doc AND the per-package docs in
      // parallel. The manifest doc is authoritative for the operator's
      // override state; the packages collection is the architectural
      // source of truth per tracking. Keeping both in sync on every
      // autosave closes the refresh-gap where an edit saved to one
      // collection could drift from the other (BUG-AUTOSAVE-PARTIAL).
      const contacts = optsRef.current.customerContacts as Map<string, {
        slCode: string; email: string; dni: string; fullName: string;
      }>;

      const priceAdjustmentsByTracking = optsRef.current.priceAdjustments || {};
      const priceOverridesByTracking = optsRef.current.priceOverrides || {};

      const [_, pkgResult] = await Promise.all([
        saveManifestRecord(rows, manifestNumber, {
          manifestType: optsRef.current.manifestType,
          customerContacts: contacts,
          exchangeRate: optsRef.current.exchangeRate,
          priceAdjustments: priceAdjustmentsByTracking,
          priceOverrides: priceOverridesByTracking,
        }),
        upsertManifestPackageOverrides(rows, manifestNumber, {
          manifestType: optsRef.current.manifestType,
          customerContacts: contacts,
          exchangeRate: optsRef.current.exchangeRate,
          priceAdjustments: priceAdjustmentsByTracking,
          priceOverrides: priceOverridesByTracking,
          preAlertsMap: optsRef.current.preAlertsMap,
          dataOriginPolicy: optsRef.current.dataOriginPolicy,
        }),
      ]);
      if (pkgResult.errors > 0) {
        console.warn(
          `[Nova][autosave] packages sync had ${pkgResult.errors} error(s); manifest doc saved OK.`,
        );
      }
      dirtyRef.current = false;
      setLastSavedAt(Date.now());
      setErrorMessage(null);
      setStatus('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Nova] auto-save failed:', msg);
      setErrorMessage(msg);
      setStatus('error');
      // dirtyRef stays true so we retry on the next edit / unmount.
    } finally {
      inFlightRef.current = false;
      // Drain queued change that arrived during the in-flight save.
      if (pendingRef.current) {
        pendingRef.current = false;
        // Schedule the next save without waiting another full delay —
        // the operator already paid the debounce window once.
        void performSave();
      }
    }
  }, [manifestNumber]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
  }, [performSave]);

  // Schedule a debounced save whenever the change-key shifts.
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (!enabled || !manifestNumber) return;

    dirtyRef.current = true;
    setStatus('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave();
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  // changeKey is an array of override values — we WANT this to retrigger
  // every time those references change. eslint-disable for the spread
  // is acceptable here because the caller passes the canonical fingerprint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, manifestNumber, delayMs, performSave, ...changeKey]);

  // Best-effort flush on unmount so closing the modal doesn't drop pending
  // edits. Reads `dirtyRef` (not the timer) so we still flush even if the
  // sibling debounce-effect cleanup already cleared the timer earlier in
  // the cleanup phase. The Promise is intentionally floated — React doesn't
  // await cleanup, but the saveManifestRecord call itself runs to completion
  // regardless of whether anyone is listening.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && enabled && manifestNumber) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        void performSave();
      }
    };
  }, [enabled, manifestNumber, performSave]);

  // beforeunload guard — warn the operator before they navigate away while
  // there are unflushed edits. The native browser dialog also gives any
  // in-flight save time to complete (the browser does not kill outstanding
  // fetches until the user confirms navigation).
  //
  // ⚠️ NOTE: Modern browsers do NOT show our custom message text — only a
  // generic "Changes you made may not be saved" prompt. We still set
  // returnValue because some browsers require it to actually trigger the
  // dialog at all.
  useEffect(() => {
    if (!enabled || !manifestNumber) return;
    const handler = (e: BeforeUnloadEvent) => {
      const s = statusRef.current;
      if (s === 'dirty' || s === 'saving' || dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
      return undefined;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled, manifestNumber]);

  // External notification that a save happened outside the hook (e.g. caller
  // invoked saveManifestRecord directly). Clears dirty state and updates UI.
  const markSaved = useCallback(() => {
    dirtyRef.current = false;
    setLastSavedAt(Date.now());
    setErrorMessage(null);
    setStatus('saved');
  }, []);

  return { status, lastSavedAt, errorMessage, flush, markSaved };
}
