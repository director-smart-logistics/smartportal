/**
 * Data-origin module — single source of truth for "where did this data come from?"
 *
 * ─── PROBLEM THIS SOLVES ──────────────────────────────────────────────────────
 * `NovaTableModal` accepts a `ProcessedNovaData` payload that may come from
 * two very different pipelines:
 *
 *   1. FRESH    — Excel file just parsed by `processManifestFile`. AI matching
 *                  ran moments ago; the operator is *actively reviewing* the
 *                  matches. Auto-validators (divergent rematcher, pre-alert
 *                  auto-assign, learned-route applier) ARE the assistants here:
 *                  they cleanse the data so the operator only adjusts edge
 *                  cases. Visual nags (divergent badges, "needs review"
 *                  filters) are signals to drive that review.
 *
 *   2. FIRESTORE — A previously-saved manifest re-loaded via
 *                  `loadMegaManFromFirestore`. The operator already curated
 *                  assignments before saving (manual links such as "PAULA
 *                  UMANA" → "ANA PAULA FONSECA QUADROS"). Auto-validators MUST
 *                  NOT run — they would silently rewrite the curated state.
 *                  Visual nags MUST NOT appear — they invite the operator to
 *                  destroy their own work. Mutations require explicit operator
 *                  action via the Acciones menu or the "Re-validar todo"
 *                  button.
 *
 * Historically the table conflated these two flows: a `loadedFromFirestore`
 * boolean was scattered across 8+ call-sites with hand-rolled casts, each
 * gating one effect. New behaviors that needed the same gate kept missing
 * sites, leading to the BUG-PREALERT-OVERWRITE / BUG-AUTO-REMATCH regressions.
 *
 * ─── SOLUTION ─────────────────────────────────────────────────────────────────
 * Centralize the gate in a `DataOriginPolicy` object. Each behavior toggle is
 * a literal boolean field. Adding a new origin-aware behavior means:
 *   1. Add a flag to `DataOriginPolicy`.
 *   2. Set it in the two policy constants below.
 *   3. Read `policy.<flag>` at the call-site.
 *
 * No more "is loadedFromFirestore truthy?" checks; no more drift between the
 * fresh and Firestore branches; the contract is tested in `policy.spec.ts`.
 *
 * ─── EXTENSION POINTS ─────────────────────────────────────────────────────────
 * If a third origin appears (e.g. an SP2 import API, a manual paste, a fusion
 * recovery flow), add another `DataOrigin` literal and a new policy constant.
 * The factory `policyForOrigin` is the single dispatch point — every consumer
 * receives the right policy without changing its code.
 */

/**
 * Symbolic origin of the data displayed in NovaTableModal.
 *
 * - `fresh`     → Excel file just parsed; operator reviewing AI matches.
 * - `firestore` → Saved manifest re-loaded; operator-curated, frozen by default.
 *
 * Add a new variant only when the lifecycle differs materially (e.g. data
 * loaded from a third-party API that needs partial auto-validation).
 */
export type DataOrigin = 'fresh' | 'firestore';

/**
 * The behavior contract that the data-origin module hands to every consumer.
 *
 * Each flag is a literal boolean with a single semantic responsibility, so
 * the table modal, the customer-assignment hook, the pre-alert effect and
 * the toolbar can be coded against `policy.<flag>` rather than re-deriving
 * the rule from the raw origin. Tests freeze the contract; UI never branches
 * on the origin string directly.
 */
export interface DataOriginPolicy {
  /** Symbolic origin (for logging / telemetry / diagnostics only — never branch on this in UI). */
  readonly origin: DataOrigin;

  // ── Auto-mutation gates ───────────────────────────────────────────────────
  /**
   * Whether `useNovaCustomerAssignment` may run its one-shot auto-rematch
   * effect that detects rows where `nombre` (manifest) and `nombreCliente`
   * (customer) diverge and silently re-runs `searchCustomersLocal`.
   *
   * `true` for fresh parses (review aid). `false` for Firestore (would
   * destroy curated manual links).
   */
  readonly allowAutoDivergentRematch: boolean;

  /**
   * Whether the NovaTableModal pre-alert effect may auto-assign `slCode` to
   * rows that lack a confident match but have a pre-alert in `pre_alerts`.
   *
   * `true` for fresh parses. `false` for Firestore (visible "P" badge still
   * renders — the data is informational, not actionable).
   */
  readonly allowAutoPreAlertAssign: boolean;

  /**
   * Whether unmatched rows may have their `ruta` rewritten by
   * `lookupLearnedRoute` after data origin.
   *
   * `true` for fresh parses. `false` for Firestore.
   */
  readonly allowAutoLearnedRoute: boolean;

  // ── UI nags ───────────────────────────────────────────────────────────────
  /**
   * Whether the per-group "X diferentes" amber badge renders next to the
   * group header. The badge is a clickable shortcut to unlink+rematch — its
   * very existence invites the operator to undo curated assignments.
   *
   * `true` for fresh. `false` for Firestore.
   */
  readonly showDivergentBadges: boolean;

  /**
   * Whether the "Divergentes (N)" filter pill renders in the toolbar.
   *
   * `true` for fresh. `false` for Firestore.
   */
  readonly showDivergentFilter: boolean;

  // ── UI affordances unique to Firestore ────────────────────────────────────
  /**
   * Whether the persistent "modo solo lectura" banner renders below the
   * toolbar. Tells the operator that auto-validators are off and that
   * re-validation requires an explicit click.
   *
   * `false` for fresh. `true` for Firestore.
   */
  readonly showFrozenBanner: boolean;

  /**
   * Whether the "Re-validar todo" button renders in the toolbar. Provides
   * an explicit, confirmation-gated escape hatch so the operator can re-run
   * the matcher on demand.
   *
   * `true` for both origins. For Firestore it is the only way to rematch
   * (auto-validators are off). For fresh Excel parses it was previously
   * hidden — but BUG-VER-TABLA-FREEZE 2026-05-26 showed the auto-validation
   * pass can stall mid-loop on large manifests (≈200 rows / 47 divergent),
   * leaving rows with stale matches and no manual recovery path. Surfacing
   * the button always gives the operator a deterministic redo without
   * forcing a full table reload.
   */
  readonly showRevalidateAllButton: boolean;
}

/**
 * Policy for fresh Excel parses. Auto-validators ON, nags ON, banner OFF.
 * "Re-validar todo" is also exposed as an explicit redo so the operator
 * can recover after a stalled or partial auto-validation pass.
 */
export const FRESH_POLICY: DataOriginPolicy = Object.freeze({
  origin:                    'fresh',
  allowAutoDivergentRematch: true,
  allowAutoPreAlertAssign:   true,
  allowAutoLearnedRoute:     true,
  showDivergentBadges:       true,
  showDivergentFilter:       true,
  showFrozenBanner:          false,
  showRevalidateAllButton:   true,
});

/**
 * Policy for Firestore-loaded manifests. Auto-validators OFF, nags OFF,
 * banner ON, Re-validar button ON (explicit opt-in escape hatch).
 */
export const FIRESTORE_POLICY: DataOriginPolicy = Object.freeze({
  origin:                    'firestore',
  allowAutoDivergentRematch: false,
  allowAutoPreAlertAssign:   false,
  allowAutoLearnedRoute:     false,
  showDivergentBadges:       false,
  showDivergentFilter:       false,
  showFrozenBanner:          true,
  showRevalidateAllButton:   true,
});

/**
 * Map a symbolic origin to its policy. Single dispatch point — every
 * consumer goes through this, so adding a new origin is one new branch
 * here plus a new `_POLICY` constant above.
 */
export function policyForOrigin(origin: DataOrigin): DataOriginPolicy {
  switch (origin) {
    case 'firestore': return FIRESTORE_POLICY;
    case 'fresh':     return FRESH_POLICY;
  }
}

/**
 * Convenience adapter — derive the policy from the raw `ProcessedNovaData`
 * shape. The `loadedFromFirestore` flag is the canonical persistence signal
 * (set by `loadManifestFromDB` in `use-nova-chat`); anything else is
 * implicitly `fresh`. Future origins may extend this discriminator without
 * changing call-sites — only this function needs to grow new branches.
 */
export function policyFromResultData(
  data: { loadedFromFirestore?: boolean | null | undefined } | null | undefined,
): DataOriginPolicy {
  if (data && data.loadedFromFirestore === true) return FIRESTORE_POLICY;
  return FRESH_POLICY;
}
