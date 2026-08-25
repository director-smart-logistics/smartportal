/**
 * Group-merge detection — pure logic that decides when two groups in a
 * Nova manifest table represent the same customer and should be offered
 * up for a merge.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────
 *
 * After the data-origin separation work (BUG-CURATED-DESTROYED 2026-04-29)
 * the table no longer auto-rematches Firestore-loaded rows, which is the
 * right behavior because it preserves curated assignments. But it leaves a
 * common UX gap visible: when a manifest has TWO groups for the same
 * person — typically one matched (`SL13897 — INDIRA LIZETH TENORIO
 * QUESADA`) and one unmatched (`__unmatched__INDIRA LIZETH TENORIO QUESADA`,
 * shown as "sin registro") — the operator currently has to manually link
 * each row of the unmatched group via "Vincular cliente" + customer
 * search. That's friction-heavy when the answer is staring them in the
 * face: the matched group is right next to the unmatched one.
 *
 * `findMergeTarget` looks at every group key in the manifest and decides:
 *   "Does the unmatched group have a single, unambiguous matched twin?"
 *
 * If yes, the UI surfaces a one-click "Fusionar con SL13897" affordance
 * that applies the matched customer's slCode/fullName/ruta to every row
 * in the unmatched group. The downstream save flow handles the invoice
 * via the same smart-diff that runs for any other operator-driven match.
 *
 * ─── Strictness ───────────────────────────────────────────────────────────
 *
 * We err on the side of NOT suggesting a merge:
 *   • Only proposed when names match after normalization (uppercase,
 *     diacritics stripped, double-spaces collapsed).
 *   • Only proposed when EXACTLY ONE matched twin exists. If two matched
 *     groups carry the same name (e.g. multiple slCodes for the same
 *     person — possible after a rename), we suppress the suggestion so
 *     the operator must decide explicitly.
 *   • Only proposed when the candidate twin still has its assignment
 *     intact (i.e. its slCode is not currently overridden away).
 *
 * False positives here are corrosive — they lead operators to
 * fast-confirm a wrong merge that then silently propagates into invoices.
 * Skipping a legitimate merge just means the operator falls back to the
 * existing "Vincular cliente" flow, which still works.
 */

/** Minimal row shape used by the detection logic. */
export interface MergeGroupRow {
  /** Raw manifest customer name as parsed from the source (Excel / pre-alert). */
  nombre: string;
  /** Optional pre-existing slCode from the manifest itself. */
  slCode?: string;
  /** Customer fullName, when known (post-AI matching). */
  nombreCliente?: string;
}

/** A single group in the table — same shape used by `sortedGroups`. */
export interface MergeGroupEntry {
  row: MergeGroupRow;
  originalIdx: number;
}

/**
 * Optional per-row overrides. We accept them as plain records keyed by
 * originalIdx so the caller can pass the live state objects directly
 * without reshaping.
 */
export interface MergeGroupOverrides {
  /** matchOverrides[originalIdx] — when present, defines the row's effective slCode/customerName. */
  matchOverrides?: Record<number, { slCode?: string; fullName?: string; ruta?: string } | undefined>;
  /** slCodeOverrides[originalIdx] — older flow that only carries slCode/ruta. */
  slCodeOverrides?: Record<number, { slCode?: string; ruta?: string } | undefined>;
  /** unlinkedRows — when an originalIdx is in this set, the row is treated as unmatched. */
  unlinkedRows?: Set<number>;
}

/**
 * Effective group fingerprint AFTER all overrides have been applied.
 * Used for both detection and rendering — keeping the shape minimal makes
 * the contract easy to test and reason about.
 */
export interface EffectiveGroupFingerprint {
  groupKey: string;
  /** First entry's originalIdx — used as anchor for actions. */
  anchorIdx: number;
  /** Effective slCode after overrides. Empty string for unmatched. */
  effectiveSlCode: string;
  /** Effective customer name after overrides. */
  effectiveCustomerName: string;
  /** Effective route after overrides. */
  effectiveRuta: string;
  /** Normalized version of the customer name (used for duplicate detection). */
  normalizedName: string;
  /** All originalIdx values in the group. */
  rowIndices: number[];
  /** Total row count in the group (cached). */
  rowCount: number;
}

/**
 * Return value of `findMergeTarget` — the matched twin we suggest the
 * unmatched group be merged into.
 */
export interface MergeTarget {
  slCode: string;
  customerName: string;
  ruta: string;
  rowCount: number;
  groupKey: string;
  /**
   * Name-similarity score in [0..1] used by the UI to colour the action
   * (1.0 = exact match, 0.85 = strong-but-fuzzy match like
   * "INDIRA TENORIO QUESADA" ↔ "INDIRA LIZETH TENORIO QUESADA").
   */
  confidence: number;
}

/**
 * Strip diacritics, collapse whitespace, uppercase. Used as the FIRST
 * pass before any token-aware comparison.
 *
 * Examples:
 *   "INDIRA LIZETH TENORIO QUESADA"   → "INDIRA LIZETH TENORIO QUESADA"
 *   "  Indira Lizeth  Tenorio Quesada" → "INDIRA LIZETH TENORIO QUESADA"
 *   "MARÍA JOSÉ"                       → "MARIA JOSE"
 */
export function normalizeNameForMerge(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')               // split base char + accents
    .replace(/[\u0300-\u036f]/g, '') // drop diacritics
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim()
    .toUpperCase();
}

/** Internal: tokenize a normalized name into uppercase word tokens. */
function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

/**
 * Fuzzy customer-name similarity score in the [0..1] range.
 *
 * ─── Why not exact match? ─────────────────────────────────────────────────
 *
 * The Excel/SP1 manifest names are often abbreviated relative to the
 * `customers` doc. Operators see this constantly:
 *
 *   manifest:   "INDIRA TENORIO QUESADA"
 *   customer:   "INDIRA LIZETH TENORIO QUESADA"
 *
 * Both surnames (`TENORIO QUESADA`) match identically; the manifest
 * dropped the middle name `LIZETH`. The operator's mental model is
 * "obviously the same person" — and the merge-detection should say so
 * too. Strict-equality detection (the original implementation) would
 * silently miss every case where the source carries fewer tokens.
 *
 * ─── Algorithm ────────────────────────────────────────────────────────────
 *
 * After diacritic-stripping + uppercasing both inputs:
 *
 *   1. If both names have ≥2 tokens AND `last2(a) === last2(b)`
 *      (full Latin-American surname agreement), AND there's at least one
 *      first-name token in common, → confidence 1.0.
 *      Same-surnames but no first-name overlap → 0.6 (rejected by default).
 *      Same-surnames but one side has no first-name (single-token
 *      `surname` paired with `firstname surname`) → 0.85.
 *
 *   2. If `last1(a) === last1(b)` (the trailing token matches) AND every
 *      token of the shorter name appears in the longer name → 0.85.
 *      This catches "ANA LOPEZ" vs "ANA MARIA LOPEZ".
 *
 *   3. Otherwise → 0.0.
 *
 * The bar for "merge candidate" is 0.85 (`MERGE_CONFIDENCE_THRESHOLD`).
 * Lower scores are treated as no-match so the operator never sees a
 * suggestion that's likely to be wrong.
 */
export function fuzzyNameSimilarity(a: string, b: string): number {
  const na = normalizeNameForMerge(a);
  const nb = normalizeNameForMerge(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokenize(na);
  const tb = tokenize(nb);
  if (!ta.length || !tb.length) return 0;

  const last = (arr: string[], n: number): string[] =>
    arr.slice(-Math.min(n, arr.length));
  const last2A = last(ta, 2).join(' ');
  const last2B = last(tb, 2).join(' ');

  // Step 1 — full last-name agreement. Both names need ≥2 tokens.
  if (ta.length >= 2 && tb.length >= 2 && last2A === last2B) {
    const firstA = ta.slice(0, -2);
    const firstB = tb.slice(0, -2);
    if (firstA.length === 0 || firstB.length === 0) return 0.85;
    const overlap = firstA.some(t => firstB.includes(t));
    return overlap ? 1.0 : 0.6;
  }

  // Step 2 — single trailing-token agreement, with subset containment.
  const shorter = ta.length <= tb.length ? ta : tb;
  const longer  = ta.length <= tb.length ? tb : ta;
  const last1Short = shorter[shorter.length - 1];
  const last1Long  = longer[longer.length - 1];
  if (last1Short && last1Short === last1Long) {
    const allContained = shorter.every(t => longer.includes(t));
    if (allContained) return 0.85;
  }

  return 0;
}

/** Confidence threshold above which we present a merge suggestion. */
export const MERGE_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Build the effective fingerprint for a single group given its raw entries
 * + the live override state. This mirrors the math NovaTableModal already
 * does inline when rendering the group header.
 */
export function buildGroupFingerprint(
  groupKey: string,
  entries: ReadonlyArray<MergeGroupEntry>,
  overrides: MergeGroupOverrides = {},
): EffectiveGroupFingerprint {
  const anchor = entries[0];
  const oIdx = anchor.originalIdx;
  const isUnlinked = overrides.unlinkedRows?.has(oIdx) ?? false;

  // Match the priority order used by NovaTableModal for effective slCode.
  const slCodeOverride = overrides.slCodeOverrides?.[oIdx]?.slCode;
  const matchOverride = overrides.matchOverrides?.[oIdx];
  const effectiveSlCode = isUnlinked
    ? ''
    : (slCodeOverride || matchOverride?.slCode || anchor.row.slCode || '');

  const effectiveCustomerName =
    matchOverride?.fullName || anchor.row.nombreCliente || anchor.row.nombre || '';

  const effectiveRuta =
    overrides.slCodeOverrides?.[oIdx]?.ruta
    || matchOverride?.ruta
    || '';

  const normalizedName = normalizeNameForMerge(effectiveCustomerName || anchor.row.nombre);

  return {
    groupKey,
    anchorIdx: oIdx,
    effectiveSlCode,
    effectiveCustomerName,
    effectiveRuta,
    normalizedName,
    rowIndices: entries.map(e => e.originalIdx),
    rowCount: entries.length,
  };
}

/**
 * Decide whether an unmatched group (caller-provided fingerprint) has a
 * single unambiguous matched twin among the rest of the manifest's groups.
 *
 * Returns the merge target when found, or `null` when:
 *   • The source is not actually unmatched.
 *   • No matched group reaches the `MERGE_CONFIDENCE_THRESHOLD`
 *     similarity score with the source.
 *   • Two or more matched groups tie at the highest score (ambiguous —
 *     we refuse so the operator must pick explicitly).
 *
 * This is a pure function — call it inside a `useMemo` keyed on the same
 * deps as `sortedGroups` to keep render cost bounded.
 */
export function findMergeTarget(
  source: EffectiveGroupFingerprint,
  allGroups: ReadonlyArray<EffectiveGroupFingerprint>,
): MergeTarget | null {
  // Source must be a TRULY unmatched group — has no effective slCode —
  // and must have a name to compare. We use `effectiveCustomerName`
  // (post-overrides) because that's the value `fuzzyNameSimilarity`
  // operates on; `normalizedName` is kept on the fingerprint for legacy
  // exact-equality consumers but is no longer the primary key here.
  if (source.effectiveSlCode) return null;
  if (!source.effectiveCustomerName.trim()) return null;

  // Score every matched group against the source. We use the EFFECTIVE
  // customer name (post-overrides) so renamed customers are still
  // detected correctly.
  const scored = allGroups
    .filter(g => g.groupKey !== source.groupKey && g.effectiveSlCode)
    .map(g => ({
      group: g,
      confidence: fuzzyNameSimilarity(source.effectiveCustomerName, g.effectiveCustomerName),
    }))
    .filter(s => s.confidence >= MERGE_CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence);

  if (scored.length === 0) return null;

  // Tie at the top? Refuse to suggest — the operator must pick.
  if (scored.length > 1 && scored[0].confidence === scored[1].confidence) {
    return null;
  }

  const { group: target, confidence } = scored[0];
  return {
    slCode: target.effectiveSlCode,
    customerName: target.effectiveCustomerName,
    ruta: target.effectiveRuta,
    rowCount: target.rowCount,
    groupKey: target.groupKey,
    confidence,
  };
}

/**
 * Find ALL groups that look like the same customer as `source` —
 * regardless of whether the source is matched or unmatched.
 *
 * ─── Why this exists (separate from `findMergeTarget`) ──────────────────
 *
 * `findMergeTarget` is intentionally conservative: it only proposes a
 * merge when the source is unmatched and exactly ONE matched twin exists.
 * That covers the common case of a sin-registro group sitting next to its
 * matched counterpart.
 *
 * But operators also hit a different scenario where after a save/reload
 * cycle, ONE customer ends up split across MULTIPLE matched groups
 * (different slCodes for the same person). The dataset shown in the
 * BUG-REVALIDAR-GRUPO 2026-04-29 case had three "YORLENI MAIRENA
 * GUTIERREZ" groups all with their own slCode — the merge-target check
 * silently bailed because the source was matched.
 *
 * `findGroupSiblings` answers the broader question:
 *
 *   "Which OTHER groups in this manifest share my customer name (above
 *    the merge-confidence threshold)?"
 *
 * It returns the full list, sorted by confidence DESC then by rowCount
 * DESC. The caller (typically the "Revalidar grupo" action) decides what
 * to do with the result — show a picker if multiple, auto-merge if just
 * one, or warn if none.
 *
 * The source group itself is excluded from the result.
 */
export interface GroupSibling {
  /** The sibling fingerprint — used by the UI to show context. */
  fingerprint: EffectiveGroupFingerprint;
  /** Name-similarity score [0..1] vs the source. */
  confidence: number;
  /** Row count in this sibling group (mirror of fingerprint.rowCount, hoisted for sort convenience). */
  rowCount: number;
}

export function findGroupSiblings(
  source: EffectiveGroupFingerprint,
  allGroups: ReadonlyArray<EffectiveGroupFingerprint>,
): GroupSibling[] {
  const sourceName = source.effectiveCustomerName.trim();
  if (!sourceName) return [];

  return allGroups
    .filter(g => g.groupKey !== source.groupKey)
    .map(g => ({
      fingerprint: g,
      confidence: fuzzyNameSimilarity(sourceName, g.effectiveCustomerName),
      rowCount: g.rowCount,
    }))
    .filter(s => s.confidence >= MERGE_CONFIDENCE_THRESHOLD)
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.rowCount - a.rowCount;
    });
}
