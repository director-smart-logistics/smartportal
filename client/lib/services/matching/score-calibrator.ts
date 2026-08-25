/**
 * Matching Engine — Score Calibrator
 *
 * Adaptive weight selection based on input characteristics.
 * Replaces static weights in calculateCombinedScore with context-aware weighting.
 *
 * @module matching/score-calibrator
 */

/**
 * Algorithm scores used for calibration.
 */
export interface AlgorithmScores {
  levenshtein: number; // Keep for interface compatibility, mapped to Damerau-Levenshtein
  jaroWinkler: number; // Keep for compatibility
  tokenBased: number;  // Weighted token name score
  exact: boolean;
  normalized: boolean;
  damerauLevenshtein: number;
  doubleMetaphone: number;
  nicknameMatch?: boolean;
}

/**
 * Input characteristics for adaptive weighting.
 */
export interface InputProfile {
  searchTokenCount: number;
  customerTokenCount: number;
  searchLength: number;
  customerLength: number;
}

/**
 * Calculate a calibrated combined score using three primary signals:
 *   - tokenBased (weight 0.55)
 *   - damerauLevenshtein (weight 0.25)
 *   - doubleMetaphone (weight 0.20)
 *
 * Modifiers:
 *   - Nickname bonus: if nickname match detected, boost score by 10% (capped at 0.95 to force review)
 *   - Low token penalty: if token score is extremely low (<0.3), penalize score by 30%
 *
 * @param scores - Individual algorithm scores
 * @param _profile - Input profile (kept for signature compatibility)
 * @returns Calibrated combined score [0, 1]
 */
export function calibratedScore(scores: AlgorithmScores, _profile?: InputProfile): number {
  if (scores.exact) return 1.0;
  if (scores.normalized) return 0.98;

  // Simple, linear weighted formula of three signals
  let score = 0;
  if (scores.nicknameMatch) {
    // Nickname matches have low character-level similarity, so rely more on tokenBased score
    score =
      (scores.tokenBased * 0.80) +
      (scores.damerauLevenshtein * 0.10) +
      (scores.doubleMetaphone * 0.10);
  } else {
    score =
      (scores.tokenBased * 0.55) +
      (scores.damerauLevenshtein * 0.25) +
      (scores.doubleMetaphone * 0.20);
  }

  // Nickname bonus: if detected, boost by 10% (capped at 0.95 to prevent auto-accept without review)
  if (scores.nicknameMatch) {
    score = Math.min(score + 0.10, 0.95);
  }

  // Low token penalty (prevents fuzzy-only false positives)
  if (scores.tokenBased < 0.3) {
    score *= 0.7;
  }

  return Math.round(score * 100) / 100;
}
