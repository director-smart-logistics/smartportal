/**
 * nova-invoice-grouping.ts
 *
 * Pure utility functions for computing per-group invoice mode defaults
 * from raw manifest rows. Extracted from NovaTableModal so the same
 * logic can be unit-tested in isolation and reused elsewhere.
 *
 * ─── Definitions ──────────────────────────────────────────────────────────────
 *
 *  groupKey   The key used to identify a row's customer group in the UI.
 *             = row.slCode  (if the row has a linked customer)
 *             = '__unmatched__' + row.nombre  (if unmatched)
 *
 *  separateInvoices[key] = true  → Consolidation mode ON for that group.
 *                                  Price is recalculated as ceil(sumPeso) × rate.
 *                                  Only active when rows have consolidacion=true.
 *
 *  mergedInvoices[key]   = true  → Factura única mode ON for that group.
 *                                  All items share ONE invoice but each row keeps
 *                                  its own individual price — NO consolidation math.
 *                                  Active by default for every multi-row linked group
 *                                  that is NOT already in consolidation mode.
 *
 *  The two modes are mutually exclusive: turning one ON always turns the other OFF.
 *
 * ─── AI GUARD ─────────────────────────────────────────────────────────────────
 *  NEVER apply consolidation rounding/recalculation to mergedInvoices groups.
 *  NEVER merge groups that have no slCode (unmatched rows cannot be unified).
 *  NEVER initialize mergedInvoices[key]=true for a key that is already a
 *  consolidation key (separateInvoices[key]=true). The two modes are mutually
 *  exclusive at all times.
 * ──────────────────────────────────────────────────────────────────────────────
 */

/** Minimal row shape required by the grouping utilities. */
export interface InvoiceGroupingRow {
  slCode?: string | null;
  nombre?: string | null;
  consolidacion?: boolean | null;
  permisos?: boolean | null;
}

/**
 * Compute the set of groupKeys where EVERY row in the group has permisos=true
 * and the group has 2 or more rows. These groups skip consolidation and default
 * to Factura única regardless of the consolidacion flag.
 */
export function computeAllPermisosKeys(rows: InvoiceGroupingRow[]): Set<string> {
  const counts = computeGroupKeyCounts(rows);
  const nonPermiso = new Set<string>();
  for (const row of rows) {
    if (!row.permisos) nonPermiso.add(getGroupKey(row));
  }
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.slCode) continue;
    const key = getGroupKey(row);
    if (nonPermiso.has(key)) continue;
    if ((counts[key] ?? 0) >= 2) keys.add(key);
  }
  return keys;
}

/**
 * Compute the canonical groupKey for a single row.
 * Mirrors the key formula used in NovaTableModal's sortedGroups memoization
 * and the state initializers for separateInvoices / mergedInvoices.
 *
 * @param row - A manifest row (original data, no overrides applied).
 * @returns The group key string.
 */
export function getGroupKey(row: InvoiceGroupingRow): string {
  return row.slCode || `__unmatched__${row.nombre ?? ''}`;
}

/**
 * Count the number of rows per groupKey.
 *
 * @param rows - Array of manifest rows.
 * @returns A record mapping groupKey → row count.
 */
export function computeGroupKeyCounts(rows: InvoiceGroupingRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = getGroupKey(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Compute the set of groupKeys that qualify for consolidation mode.
 *
 * A group qualifies when:
 *  1. At least one row in the group has `consolidacion === true`.
 *  2. The group has 2 or more rows (single-row groups are never consolidated).
 *
 * @param rows - Array of manifest rows.
 * @returns Set of groupKeys that should enter consolidation mode by default.
 */
export function computeConsolidationKeys(rows: InvoiceGroupingRow[]): Set<string> {
  const counts = computeGroupKeyCounts(rows);
  const allPermisosKeys = computeAllPermisosKeys(rows);
  const keys = new Set<string>();
  for (const row of rows) {
    if (!row.consolidacion) continue;
    const key = getGroupKey(row);
    if ((counts[key] ?? 0) >= 2 && !allPermisosKeys.has(key)) keys.add(key);
  }
  return keys;
}

/**
 * Compute the default `separateInvoices` state from manifest rows.
 *
 * Mirrors the existing inline initializer in NovaTableModal so the same
 * behaviour is preserved after extracting to this utility.
 *
 * A key is set to `true` when the group has `consolidacion=true` on at
 * least one row AND has 2 or more rows.
 *
 * @param rows - Array of manifest rows.
 * @returns Initial separateInvoices record (key → boolean).
 */
export function computeSeparateInvoiceDefaults(
  rows: InvoiceGroupingRow[],
): Record<string, boolean> {
  const init: Record<string, boolean> = {};
  const consolidationKeys = computeConsolidationKeys(rows);
  for (const key of consolidationKeys) {
    init[key] = true;
  }
  return init;
}

/**
 * Compute the default `mergedInvoices` state from manifest rows.
 *
 * Factura única is enabled by default for every group that:
 *  1. Has a valid slCode (unmatched rows cannot be unified into one invoice).
 *  2. Has 2 or more rows.
 *  3. Is NOT already a consolidation group (the two modes are mutually exclusive).
 *
 * The operator can manually disable Factura única per group via the Acciones
 * dropdown. Consolidation groups are excluded because enabling both at the same
 * time would produce conflicting invoice strategies.
 *
 * @param rows - Array of manifest rows.
 * @returns Initial mergedInvoices record (key → boolean).
 */
export function computeMergedInvoiceDefaults(
  rows: InvoiceGroupingRow[],
): Record<string, boolean> {
  const init: Record<string, boolean> = {};
  const counts = computeGroupKeyCounts(rows);
  const consolidationKeys = computeConsolidationKeys(rows);
  const allPermisosKeys = computeAllPermisosKeys(rows);

  for (const row of rows) {
    if (!row.slCode) continue;
    const key = getGroupKey(row);
    if (key in init) continue;
    if ((counts[key] ?? 0) < 2) continue;
    if (consolidationKeys.has(key)) continue;
    init[key] = true;
  }

  for (const key of allPermisosKeys) {
    init[key] = true;
  }

  return init;
}

/**
 * Inputs needed to decide which slCodes should auto-activate consolidation
 * based on operator override state + customer flags. Kept deliberately small
 * so this function can be unit-tested without pulling in React.
 */
export interface AutoConsolidationInput {
  /** Original manifest rows (unresolved). */
  rows: InvoiceGroupingRow[];
  /** Per-row slCode overrides (explicit reassignment). */
  slCodeOverrides: Record<number, { slCode: string }>;
  /** Per-row match overrides (from the "Vincular cliente" dialog). */
  matchOverrides: Record<number, { slCode: string }>;
  /** Row indices the operator has explicitly marked as unlinked. */
  unlinkedRows: Set<number>;
  /** slCodes the operator manually toggled this session (skip auto-apply). */
  operatorOverrideKeys: Set<string>;
  /** slCode → customer record (only `consolidationEnabled` is used here). */
  customerConsolidationEnabled: Map<string, boolean>;
}

/**
 * Compute the set of slCodes whose consolidation mode should auto-activate
 * given the current overrides + customer flags.
 *
 * A slCode qualifies when ALL of the following hold:
 *  1. It is not in `operatorOverrideKeys` (operator manually toggled mode).
 *  2. Counting non-permit, non-unlinked rows using the EFFECTIVE slCode
 *     (slCodeOverrides > matchOverrides > row.slCode) yields ≥ 2 members.
 *  3. Either the linked customer has `consolidationEnabled=true` OR at least
 *     one row in the effective group carries `row.consolidacion=true` (the
 *     "C" badge). This dual trigger ensures Firestore-loaded manifests and
 *     newly-linked rows converge on consolidation as soon as the group hits
 *     two members — matching the badge operators already see in the UI.
 *
 * @returns Set of slCodes that should have `separateInvoices[slCode]=true`.
 */
export function computeAutoConsolidationKeys(input: AutoConsolidationInput): Set<string> {
  const {
    rows, slCodeOverrides, matchOverrides, unlinkedRows,
    operatorOverrideKeys, customerConsolidationEnabled,
  } = input;
  const counts            = new Map<string, number>();
  const hasConsolidacion  = new Map<string, boolean>();
  rows.forEach((row, idx) => {
    if (row.permisos) return;
    if (unlinkedRows.has(idx)) return;
    const effSlCode = slCodeOverrides[idx]?.slCode
      ?? matchOverrides[idx]?.slCode
      ?? row.slCode
      ?? '';
    if (!effSlCode) return;
    counts.set(effSlCode, (counts.get(effSlCode) ?? 0) + 1);
    if (row.consolidacion) hasConsolidacion.set(effSlCode, true);
  });
  const out = new Set<string>();
  counts.forEach((count, slCode) => {
    if (operatorOverrideKeys.has(slCode)) return;
    if (count < 2) return;
    const customerConsol = customerConsolidationEnabled.get(slCode) ?? false;
    const rowConsol      = hasConsolidacion.get(slCode) ?? false;
    if (!customerConsol && !rowConsol) return;
    out.add(slCode);
  });
  return out;
}

/**
 * Compute the set of slCodes whose **Factura única** mode should auto-activate.
 *
 * Heuristic: when the operator manually links 2+ rows to the SAME temp
 * customer (slCode prefix `SL-NAN-`), the natural expectation is a single
 * invoice that bills both packages individually — NOT two separate invoices
 * with identical timestamps (which collide on `generateInvoiceNumber` and
 * render with visually-identical badges, confusing operators into thinking
 * the merge already happened — see UX bug screenshotted on 2026-04-28).
 *
 * Real customers (non-NAN slCodes) keep the existing behaviour: Factura única
 * stays opt-in via the dropdown toggle, because real customers may legitimately
 * want one invoice per package.
 *
 * Skip semantics mirror `computeAutoConsolidationKeys`:
 *  - Operator-toggled keys (`operatorOverrideKeys`) are never auto-flipped.
 *  - Existing Firestore invoices (handled upstream in the reactive effect)
 *    take priority — this helper only fires when no invoice yet exists for
 *    the slCode, so it cannot fight a deliberate non-merged save.
 *
 * @returns Set of slCodes that should have `mergedInvoices[slCode]=true` AND
 *          `separateInvoices[slCode]=false` (Factura única is mutually
 *          exclusive with consolidation).
 */
export function computeAutoFacturaUnicaKeys(input: {
  rows: InvoiceGroupingRow[];
  slCodeOverrides: Record<number, { slCode: string }>;
  matchOverrides: Record<number, { slCode: string }>;
  unlinkedRows: Set<number>;
  operatorOverrideKeys: Set<string>;
}): Set<string> {
  const { rows, slCodeOverrides, matchOverrides, unlinkedRows, operatorOverrideKeys } = input;
  const counts = new Map<string, number>();
  rows.forEach((row, idx) => {
    if (row.permisos) return;
    if (unlinkedRows.has(idx)) return;
    const effSlCode = slCodeOverrides[idx]?.slCode
      ?? matchOverrides[idx]?.slCode
      ?? row.slCode
      ?? '';
    if (!effSlCode) return;
    if (!effSlCode.startsWith('SL-NAN-')) return;
    counts.set(effSlCode, (counts.get(effSlCode) ?? 0) + 1);
  });
  const out = new Set<string>();
  counts.forEach((count, slCode) => {
    if (operatorOverrideKeys.has(slCode)) return;
    if (count < 2) return;
    out.add(slCode);
  });
  return out;
}

/**
 * Identify groups whose existing invoices contain trackings OUTSIDE the
 * current operator selection. These groups must be **protected** from the
 * destructive delete-and-recreate path during a partial save.
 *
 * Background (BUG-PARTIAL-SELECTION 2026-04-28):
 * `handleIngestAndInvoice` builds two fingerprints — `resolvedGroupFP` (from
 * the operator's current state, scoped to selected rows in selection mode)
 * and `existingGroupFP` (from Firestore invoices for this manifest). The
 * diff at step 2c marks a group as "changed" when their tracking sets or
 * totals differ. Without this protection, partial selections (e.g. 2 of 5
 * rows from a consolidated invoice) would trigger a tracking-size mismatch,
 * call `deleteInvoicesForTrackings` on the partial set, and silently delete
 * the existing invoice that contains the 3 unselected rows — destroying
 * data the operator never intended to touch.
 *
 * Rules:
 *   - Unmatched groups (`__unmatched__*` prefix) cannot collide with
 *     persisted invoices (they have no stable slCode), so they are always
 *     out of scope here. Their normal "always-process" behaviour is kept
 *     by the upstream diff loop.
 *   - A group is protected ONLY when at least one tracking in its existing
 *     Firestore invoice is NOT in the operator's `selectedTrackings`.
 *     Groups whose existing invoices are fully covered by the selection
 *     remain in the normal diff path (they may legitimately need a recreate).
 *
 * @param existingGroupFP   - Per-slCode tracking fingerprint of existing
 *                            Firestore invoices (mirrors the inline map in
 *                            `handleIngestAndInvoice` step 2b).
 * @param selectedTrackings - Uppercase tracking numbers the operator chose
 *                            to save this session. When `null`, no selection
 *                            is active and no group is protected (whole-
 *                            manifest save behaves as before).
 * @returns                 The set of protected group keys (slCode in upper
 *                          case) and the count of trackings preserved by
 *                          the protection — used by the UI to inform the
 *                          operator how many invoice rows will stay intact.
 */
export function computeProtectedGroupKeys(
  existingGroupFP: Map<string, { trackings: Set<string> }>,
  selectedTrackings: Set<string> | null,
): { protectedKeys: Set<string>; preservedTrackings: number } {
  const protectedKeys = new Set<string>();
  let preservedTrackings = 0;
  if (!selectedTrackings) return { protectedKeys, preservedTrackings };
  for (const [key, fp] of existingGroupFP) {
    if (key.startsWith('__unmatched__')) continue;
    let outsideCount = 0;
    fp.trackings.forEach(t => { if (!selectedTrackings.has(t)) outsideCount++; });
    if (outsideCount > 0) {
      protectedKeys.add(key);
      preservedTrackings += outsideCount;
    }
  }
  return { protectedKeys, preservedTrackings };
}

/**
 * Count the number of active Factura única groups given the current state.
 *
 * Used by the save-confirmation dialog to inform the operator how many
 * unified invoices will be generated.
 *
 * @param rows              - Array of manifest rows.
 * @param mergedInvoices    - Current mergedInvoices state.
 * @param separateInvoices  - Current separateInvoices state (consolidated groups are excluded).
 * @returns Number of unique group keys with Factura única enabled.
 */
export function countActiveUnifiedGroups(
  rows: InvoiceGroupingRow[],
  mergedInvoices: Record<string, boolean>,
  separateInvoices: Record<string, boolean>,
): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = getGroupKey(row);
    if (mergedInvoices[key] && !separateInvoices[key]) seen.add(key);
  }
  return seen.size;
}
