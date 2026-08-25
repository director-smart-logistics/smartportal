/**
 * Centralized Matching Thresholds
 *
 * Every score boundary, confidence floor, and safety cap lives here.
 * This prevents "threshold drift" — the pattern where the same constant
 * is duplicated across customer-matcher.ts, gemini-client.ts, and
 * match-learning.ts with slightly different values.
 *
 * ──────────────────────────────────────────────────────────────────────
 * TUNING GUIDE — read before changing any value:
 *
 *  • AUTO_ACCEPT_MIN: Raising this sends more names to AI (safer but
 *    slower + costs more API calls).  Lowering lets partial matches
 *    slip through without AI verification.
 *
 *  • TOKEN_SUBSET_PARTIAL_CAP: This prevents "GARCIA MORA" →
 *    "JUAN GARCIA MORA" from auto-accepting.  Never set above
 *    AUTO_ACCEPT_MIN or the cap becomes useless.
 *
 *  • AI_ACCEPT_CONFIDENCE: Must stay ≥ 90 to match the prompt
 *    instructions in gemini-client.ts.  The AI is told "if < 90 use
 *    null", so accepting below 90 creates contradictions.
 *
 *  • AI_AUTO_SAVE_*: These control which matches become "learned" in
 *    Firestore match_feedback.  Setting too low poisons future runs
 *    with wrong matches that are hard to undo.
 * ──────────────────────────────────────────────────────────────────────
 */

export const MATCH_THRESHOLDS = {
  // ── Auto-accept (bypass AI entirely) ──────────────────────────────

  /**
   * Minimum algorithmic score to auto-accept without AI verification.
   * Only near-exact matches should bypass AI — surname-only or partial
   * name matches must go through AI disambiguation.
   *
   * Why 0.95: Raised to ensure we do not make false positive auto-associations.
   */
  AUTO_ACCEPT_MIN: 0.85,

  /**
   * Minimum meaningful token count in the search name to allow auto-accept.
   * Single-word names (just a surname) always go to AI regardless of score.
   *
   * Why 2: A name like "RODRIGUEZ" can match multiple people.
   * "JUAN RODRIGUEZ" is specific enough for algorithmic auto-accept.
   */
  AUTO_ACCEPT_MIN_TOKENS: 2,

  // ── AI routing ────────────────────────────────────────────────────

  /**
   * Minimum algorithmic score to queue for AI disambiguation.
   * Below this threshold → AI broad search instead.
   */
  AI_DISAMBIGUATE_MIN: 0.45,

  /**
   * Threshold for detecting "multiple high-confidence matches" — when
   * more than one candidate scores above this, we force requiresUserChoice
   * even if the top score exceeds AUTO_ACCEPT_MIN.
   */
  MULTIPLE_HIGH_CONFIDENCE: 0.85,

  /**
   * Proximity guard gap: if the top two candidates are closer than this
   * gap, we can't be sure which is correct — force AI disambiguation.
   */
  PROXIMITY_GAP: 0.08,

  // ── AI acceptance (from gemini-client responses) ──────────────────

  /**
   * Minimum AI confidence to accept a disambiguation result.
   * Aligned with the Gemini prompt instruction: "si confidence < 90 usa null".
   */
  AI_ACCEPT_CONFIDENCE: 98,

  /**
   * Minimum AI confidence to accept a broad-search result.
   * Aligned with gemini-client.ts post-filter (line 982: >= 90).
   */
  AI_SEARCH_ACCEPT_CONFIDENCE: 98,

  // ── AI auto-save to learned matches ───────────────────────────────

  /**
   * Minimum AI confidence to auto-save a disambiguation result to
   * match_feedback in Firestore.  Only unambiguous results should be
   * learned — a wrong auto-save poisons all future manifests.
   *
   * Why 98: Raised to 98 to avoid poisoning learned match database with homonyms.
   */
  AI_AUTO_SAVE_DISAMBIGUATE: 98,

  /**
   * Minimum AI confidence to auto-save a broad-search result.
   * Search results are inherently less certain than disambiguation
   * (no algorithmic pre-filter), so the threshold is slightly lower
   * than disambiguate but still strict.
   */
  AI_AUTO_SAVE_SEARCH: 98,

  // ── Score caps (prevent over-confident partial matches) ───────────

  /**
   * Maximum score for token-subset matches (Technique 5) when the
   * search has fewer tokens than the customer name.
   *
   * Example prevented: "GARCIA MORA" → "JUAN GARCIA MORA" was 0.93,
   * now capped at 0.82 → forces AI verification.
   *
   * INVARIANT: Must be < AUTO_ACCEPT_MIN, otherwise the cap is useless.
   */
  TOKEN_SUBSET_PARTIAL_CAP: 0.82,

  /**
   * Maximum score for apellido-anchor matches (Technique 6b) when the
   * search has ≤ 2 tokens.  Short searches don't have enough signal
   * to distinguish namesakes/homonyms.
   *
   * INVARIANT: Must be < AUTO_ACCEPT_MIN.
   */
  APELLIDO_SHORT_SEARCH_CAP: 0.82,

  // ── Learned matches ───────────────────────────────────────────────

  /**
   * Minimum learned match score to accept in Pass 0 (pre-algorithmic).
   * Currently guarded by hasLearnedCollision() which detects namesakes.
   */
  LEARNED_ACCEPT_MIN: 0.90,

  // ── Result filtering ──────────────────────────────────────────────

  /** Minimum score to include a candidate in the results array. */
  MIN_CANDIDATE_SCORE: 0.40,

  /**
   * Score threshold considered "medium confidence" for categorization.
   * Matches at or above this go to AI disambiguation; below goes to search.
   */
  MEDIUM_CONFIDENCE: 0.45,
} as const;

export type MatchThresholds = typeof MATCH_THRESHOLDS;

// ── Compile-time invariant checks ─────────────────────────────────────
// These type assertions ensure threshold relationships are never violated
// during development. If a future change breaks an invariant, TypeScript
// will surface a compile error here.

type AssertLessThan<A extends number, B extends number> =
  A extends B ? never : true;

// TOKEN_SUBSET_PARTIAL_CAP must be < AUTO_ACCEPT_MIN
const _checkSubsetCap: AssertLessThan<
  typeof MATCH_THRESHOLDS.TOKEN_SUBSET_PARTIAL_CAP,
  typeof MATCH_THRESHOLDS.AUTO_ACCEPT_MIN
> = true;

// APELLIDO_SHORT_SEARCH_CAP must be < AUTO_ACCEPT_MIN
const _checkApellidoCap: AssertLessThan<
  typeof MATCH_THRESHOLDS.APELLIDO_SHORT_SEARCH_CAP,
  typeof MATCH_THRESHOLDS.AUTO_ACCEPT_MIN
> = true;

// Suppress unused variable warnings — these exist only for type checking
void _checkSubsetCap;
void _checkApellidoCap;
