/**
 * Matching Engine — Similarity Algorithms
 *
 * Pure string similarity functions used by `match-engine.ts`.
 *
 * @module matching/algorithms
 */

import {
  meaningfulTokens,
  phoneticKey,
  isAbbreviationOf,
} from './normalize';
import { areNicknameEquivalent } from './nickname-resolver';
import { doubleMetaphoneMatch } from './double-metaphone';
import { damerauLevenshteinDistance } from './damerau-levenshtein';

// ─── Jaro / Jaro-Winkler ───────────────────────────────────────────────────────

/**
 * Jaro Similarity — character-level matching with transposition awareness.
 */
export function jaroSimilarity(s1: string, s2: string): number {
  if (typeof s1 !== 'string' || typeof s2 !== 'string') return 0;
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Jaro-Winkler Similarity — bonus for shared prefixes (better for names).
 */
export function jaroWinklerSimilarity(s1: string, s2: string, p = 0.1): number {
  const jaro = jaroSimilarity(s1, s2);
  
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }
  
  return jaro + prefix * p * (1 - jaro);
}

import { areDistinctGivenNames } from './gender-name-guard';

// ─── Token Match (single-token fuzzy equality) ─────────────────────────────────

/**
 * Check if two tokens are phonetically, fuzzily, or nickname-equivalent.
 * Enhanced with bidirectional nickname resolution and Double Metaphone.
 * Fast path: length difference > 2 → skip without full computation.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  if (a === b) return true;
  // Distinct given name veto (DANIEL vs DANIELA, VICTOR vs VICTORIA, etc.)
  if (areDistinctGivenNames(a, b)) return false;
  // Nickname check first (PEPE↔JOSE) — different lengths are expected
  if (a.length >= 3 && b.length >= 3 && areNicknameEquivalent(a, b)) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  const maxEdits = a.length >= 5 ? 1 : 0;
  if (maxEdits > 0 && damerauLevenshteinDistance(a, b, maxEdits) <= maxEdits) return true;
  if (a.length >= 4 && b.length >= 4 && phoneticKey(a) === phoneticKey(b)) return true;
  // Double Metaphone fallback for Spanish phonetic equivalences (García↔Garsia)
  if (a.length >= 4 && b.length >= 4 && doubleMetaphoneMatch(a, b)) return true;
  return false;
}

// ─── Weighted Token Name Score ──────────────────────────────────────────────────

/**
 * Token-based name similarity score (0–100) — ADVANCED VERSION.
 *
 * Scoring logic:
 *  - First name token (position 0) is weighted 3× — it's the most discriminating
 *  - Each subsequent token is weighted 1×
 *  - A token "matches" if exact, within 1 Levenshtein edit, or phonetically equivalent
 *  - Extra customer tokens only apply a small penalty (0.3/token)
 *    because customers in DB often have full middle names not in manifest
 */
export function tokenNameScore(searchParts: string[], customerParts: string[]): number {
  if (!Array.isArray(searchParts) || !Array.isArray(customerParts)) return 0;
  const sParts = meaningfulTokens(searchParts);
  const cParts = meaningfulTokens(customerParts);
  if (sParts.length === 0 || cParts.length === 0) return 0;

  // Build weighted matched count
  const cMatched = new Array(cParts.length).fill(false);
  let matchedWeight = 0;
  let totalWeight = 0;

  for (let si = 0; si < sParts.length; si++) {
    const weight = si === 0 ? 3 : 1; // first name 3x weight
    totalWeight += weight;
    // Find best matching customer token (search anywhere in customer parts)
    for (let ci = 0; ci < cParts.length; ci++) {
      if (!cMatched[ci] && tokensMatch(sParts[si], cParts[ci])) {
        cMatched[ci] = true;
        matchedWeight += weight;
        break;
      }
    }
  }

  // Extra customer tokens (DB has longer name) = reduced penalty (0.3 per token)
  // Rationale: manifests often use shorter versions of customer names
  const unmatchedCustomerTokens = cMatched.filter(m => !m).length;
  const customerExtraPenalty = unmatchedCustomerTokens * 0.3;

  // Total unique token weight = search tokens weight + reduced customer penalty
  const totalUniqueWeight = totalWeight + customerExtraPenalty;
  if (totalUniqueWeight === 0) return 0;

  return Math.round((matchedWeight / totalUniqueWeight) * 100);
}
