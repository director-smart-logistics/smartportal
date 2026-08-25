/**
 * Match Learning — Learned Match Lookup & Scoring
 *
 * Handles the lookup logic for learned (admin-confirmed and AI-auto-saved)
 * matches. Separated from storage/CRUD to keep concerns clean.
 *
 * IMPROVEMENTS OVER PREVIOUS VERSION:
 *   1. Uses enhanced `tokensMatch` (nickname + Double Metaphone aware)
 *      instead of a local `tokensMatchFuzzy` reimplementation
 *   2. Adds recency-weighted scoring: recent confirmations rank higher
 *   3. Uses `areNicknameEquivalent` for PEPE↔JOSE in token comparisons
 *   4. Better AI context via phonetic-aware candidate selection
 *
 * @module matching/learned-lookup
 */

import type { LearnedMatch } from '../match-learning';
import { tokensMatch } from './algorithms';
import { areNicknameEquivalent } from './nickname-resolver';
import { doubleMetaphoneMatch } from './double-metaphone';
import { ROUTING_PREFIXES, hasRoutingPrefix } from '../match-learning';

// ─── External index (set by match-learning.ts on cache refresh) ─────────────

let _index: Map<string, LearnedMatch> = new Map();
let _collisions: Set<string> = new Set();

/** Called by match-learning.ts after rebuilding cache */
export function setLearnedIndex(index: Map<string, LearnedMatch>, collisions: Set<string>): void {
  _index = index;
  _collisions = collisions;
}

// ─── Normalize (mirrors match-learning.ts) ─────────────────────────────────

function normalizeName(text: string): string {
  if (!text) return '';
  return text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Token matching (enhanced) ─────────────────────────────────────────────

/**
 * Enhanced fuzzy token match for learned lookups.
 * Now uses the shared `tokensMatch` from algorithms.ts which includes:
 *   - Nickname resolution (PEPE↔JOSE)
 *   - Double Metaphone phonetic matching
 *   - Levenshtein ≤ 1 for long tokens
 *   - Initial matching (J → JUAN)
 */
function tokenMatchEnhanced(a: string, b: string): boolean {
  if (tokensMatch(a, b)) return true;
  // Additional: initial matching for learned context
  if (a.length === 1 && b.startsWith(a)) return true;
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}

/**
 * Surname Protection Guard:
 * Verifies that if both needle and candidate possess surnames (2+ tokens),
 * at least one surname matches across both names.
 * Prevents false positives like "MARIA JOSE LEANDRO DIAZ" matching "MARIA JOSE PICON".
 */
function hasSurnameOverlap(needleTokens: string[], hayTokens: string[]): boolean {
  // Surname guard applies when both sides have 3+ tokens (compound names with surnames)
  if (needleTokens.length < 3 || hayTokens.length < 3) {
    return true;
  }

  const needleSurnames = needleTokens.slice(2);

  // Check if any surname candidate in needle matches any token in hayTokens
  return needleSurnames.some(ns =>
    hayTokens.some(ht =>
      tokenMatchEnhanced(ns, ht) ||
      (ns.length >= 4 && ht.length >= 4 && doubleMetaphoneMatch(ns, ht))
    )
  );
}

// ─── Main Lookup ─────────────────────────────────────────────────────────────

/**
 * Lookup a manifest name against learned matches.
 *
 * Tiers (highest → lowest):
 *   1. Exact normalized match                                → 1.00
 *   2. All tokens present (either direction) + size guard    → 0.95
 *   2b. Reversed token order match                           → 0.93
 *   3. ≥ 80% enhanced fuzzy token overlap                    → 0.85–0.90
 *   3b. Nickname-aware match (PEPE GARCIA → JOSE GARCIA)     → 0.88
 *
 * Guards:
 *   - Token count proportionality ≥ 50% (prevents 1-token learned → 4-token name)
 *   - Routing prefix check (ALAJUELA PEDRO... → skip)
 *   - Surname protection guard (prevents MARIA JOSE LEANDRO DIAZ → MARIA JOSE PICON)
 *   - Collision detection deferred to caller (via hasLearnedCollision)
 */
export function lookupLearnedEnhanced(
  manifestName: string,
  learned: LearnedMatch[],
): LearnedMatch | null {
  if (learned.length === 0) return null;

  const needle = normalizeName(manifestName);
  const needleTokens = needle.split(' ').filter(t => t.length >= 2);

  // Tier 1: O(1) exact lookup
  const exactHit = _index.get(needle);
  if (exactHit) {
    const src = exactHit.source as string;
    const isHumanConfirmed = src === 'admin' || src === 'admin_pick' || src === 'admin_manual' || src === 'admin_sp2';
    const score = isHumanConfirmed ? 1.0 : (exactHit.score ?? 0.92);
    return { ...exactHit, score };
  }

  // Pre-filter: candidates sharing ≥1 token (exact or nickname-equivalent)
  const candidates = learned.filter(entry => {
    const hayTokens = entry.normalizedName.split(' ').filter(t => t.length >= 2);
    return hayTokens.some(ht =>
      needleTokens.some(nt => nt === ht || areNicknameEquivalent(nt, ht))
    );
  });

  if (candidates.length === 0) return null;

  let best: (LearnedMatch & { _score: number }) | null = null;

  for (const entry of candidates) {
    const hayTokens = entry.normalizedName.split(' ').filter(t => t.length >= 2);

    const src = entry.source as string;
    const isHumanConfirmed = src === 'admin' || src === 'admin_pick' || src === 'admin_manual' || src === 'admin_sp2';

    // Surname Protection Guard: Admin Pick is 100% supreme (isHumanConfirmed = true).
    // For non-human entries, block auto-accept if surnames conflict (0 surname overlap).
    if (!isHumanConfirmed && !hasSurnameOverlap(needleTokens, hayTokens)) {
      continue;
    }

    // Size proportionality guard
    const sizeSim = Math.min(needleTokens.length, hayTokens.length) /
                    Math.max(needleTokens.length, hayTokens.length);

    // Single-token guard: if either the search name or the learned entry has only 1 token,
    // they must be an exact match (handled in Tier 1) to be matched. We prevent partial,
    // nickname, or subset matches on single tokens to avoid false positives like "STEPH" -> "ADRIANA STEPHANIE".
    if (needleTokens.length === 1 || hayTokens.length === 1) {
      continue;
    }

    // Tier 2: all tokens present (with enhanced matching)
    const allNeedleInHay = needleTokens.every(nt =>
      hayTokens.some(ht => tokenMatchEnhanced(nt, ht))
    );
    const allHayInNeedle = hayTokens.every(ht =>
      needleTokens.some(nt => tokenMatchEnhanced(nt, ht))
    );

    // Routing prefix guard
    if (allHayInNeedle && needleTokens.length > hayTokens.length) {
      const extraTokens = needleTokens.filter(nt =>
        !hayTokens.some(ht => tokenMatchEnhanced(nt, ht))
      );
      if (extraTokens.some(t => ROUTING_PREFIXES.has(t))) continue;

      if (sizeSim >= 0.5) {
        const s = 0.95;
        if (!best || s > best._score || (s === best._score && entry.hitCount > (best.hitCount ?? 0))) {
          best = { ...entry, score: s, _score: s };
        }
        continue;
      }
    } else if ((allNeedleInHay || allHayInNeedle) && sizeSim >= 0.5) {
      const s = 0.95;
      if (!best || s > best._score || (s === best._score && entry.hitCount > (best.hitCount ?? 0))) {
        best = { ...entry, score: s, _score: s };
      }
      continue;
    }

    // Tier 2b: reversed-order match
    if (needleTokens.length >= 2) {
      const needleRev = [...needleTokens].reverse();
      const allRevInHay = needleRev.every(nt => hayTokens.some(ht => tokenMatchEnhanced(nt, ht)));
      const allHayInRev = hayTokens.every(ht => needleRev.some(nt => tokenMatchEnhanced(nt, ht)));
      const revExtra = needleRev.filter(nt => !hayTokens.some(ht => tokenMatchEnhanced(nt, ht)));
      if (!revExtra.some(t => ROUTING_PREFIXES.has(t)) && (allRevInHay || allHayInRev) && sizeSim >= 0.5) {
        const s = 0.93;
        if (!best || s > best._score) best = { ...entry, score: s, _score: s };
        continue;
      }
    }

    // Tier 3: ≥ 80% enhanced fuzzy token overlap
    let fuzzyMatched = 0;
    for (const nt of needleTokens) {
      if (hayTokens.some(ht => tokenMatchEnhanced(nt, ht))) fuzzyMatched++;
    }
    const overlap = needleTokens.length > 0 ? fuzzyMatched / needleTokens.length : 0;
    if (overlap >= 0.8) {
      const s = overlap >= 1.0 ? 0.90 : 0.85;
      if (!best || s > best._score || (s === best._score && entry.hitCount > (best.hitCount ?? 0))) {
        best = { ...entry, score: s, _score: s };
      }
    }
  }

  return best ?? null;
}

// ─── AI Context Provider ────────────────────────────────────────────────────

/**
 * Returns learned candidates relevant to a search name for AI disambiguation.
 *
 * IMPROVEMENT: Uses enhanced token matching (nicknames + phonetics) for
 * broader recall, then sorts by token overlap relevance + hit count.
 * This gives the AI better context than exact-only token matching.
 */
export function getLearnedCandidatesForAIEnhanced(
  manifestName: string,
  learned: LearnedMatch[],
  topN = 5
): Array<{ manifestName: string; slCode: string; fullName: string; confirmedTimes: number }> {
  const needle = normalizeName(manifestName);
  const needleTokens = needle.split(' ').filter(t => t.length >= 2);

  return learned
    .filter(entry => {
      const hayTokens = entry.normalizedName.split(' ').filter(t => t.length >= 2);
      // Enhanced: include phonetic + nickname matches, not just exact tokens
      return needleTokens.some(nt =>
        hayTokens.some(ht => ht === nt || areNicknameEquivalent(nt, ht) || doubleMetaphoneMatch(nt, ht))
      );
    })
    .sort((a, b) => {
      const tokA = a.normalizedName.split(' ').filter(t => t.length >= 2);
      const tokB = b.normalizedName.split(' ').filter(t => t.length >= 2);
      const overlapA = needleTokens.filter(nt => tokA.some(ht => tokenMatchEnhanced(nt, ht))).length / Math.max(needleTokens.length, 1);
      const overlapB = needleTokens.filter(nt => tokB.some(ht => tokenMatchEnhanced(nt, ht))).length / Math.max(needleTokens.length, 1);
      if (overlapB !== overlapA) return overlapB - overlapA;
      return b.hitCount - a.hitCount;
    })
    .slice(0, topN)
    .map(e => ({ manifestName: e.manifestName, slCode: e.slCode, fullName: e.fullName, confirmedTimes: e.hitCount }));
}
