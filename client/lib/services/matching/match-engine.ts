/**
 * Matching Engine — Core Scoring Pipeline
 *
 * `matchName()` is the heart of the customer matching system. It scores a
 * single search name against all customers using multiple techniques, each
 * optimized for a different failure mode of Latin American name matching.
 *
 * Performance strategy:
 *  - Fast paths 1 & 2: O(1) Map lookups for exact/reversed names.
 *  - Pre-filter: phonetic first/last token index narrows ~8k → ~100-300 candidates.
 *  - Fallback: if pre-filter yields < 5 candidates, full scan (handles first-name typos).
 *  - Expensive metrics (Levenshtein/Jaro/nGram) only computed on the final top-10.
 *
 * Techniques (in order of priority):
 *  1. Exact normalized match           → 1.00
 *  2. Reversed name match              → 0.97
 *  3. Token permutations match         → 0.97
 *  4. Abbreviated first name           → 0.88–0.90
 *  5. Initials match                   → 0.85–0.88
 *  6. Substring/contains match         → 0.75–0.90
 *  7. Token subset (DB has extra names)→ 0.75–0.93
 *  8. Token score with phonetics/fuzzy → 0.40–0.64
 *
 * @module matching/match-engine
 */

import type { CustomerData, MatchResult } from './types';
import { MATCH_THRESHOLDS } from './thresholds';
import { getCachedIndexes } from './customer-loader';
import {
  normalize,
  meaningfulTokens,
  phoneticKey,
  getNameParts,
  isAbbreviationOf,
  tokenPermutations,
  permutationCache,
} from './normalize';
import {
  jaroWinklerSimilarity,
  tokensMatch,
  tokenNameScore,
} from './algorithms';
import { damerauLevenshteinDistance, damerauLevenshteinSimilarity } from './damerau-levenshtein';
import { doubleMetaphoneMatch, doubleMetaphoneScore } from './double-metaphone';
import { areNicknameEquivalent } from './nickname-resolver';
import { calibratedScore } from './score-calibrator';

/**
 * Match a single name against all customers using comprehensive multi-technique scoring.
 *
 * @param searchName - The manifest/input name to search for (raw, will be normalized)
 * @param customers  - The full customer list (used only as fallback; indexes preferred)
 * @returns Top 10 candidates sorted by score descending, with expensive metrics filled
 */
export function matchName(searchName: string, customers: CustomerData[]): MatchResult[] {
  const normalizedSearch = normalize(searchName);
  const searchParts = getNameParts(searchName);
  const searchMTokens = meaningfulTokens(searchParts.parts);
  const searchFirstRaw = searchMTokens[0] || '';
  const results: MatchResult[] = [];
  const cachedIndexes = getCachedIndexes();

  // === FAST PATH 1: Exact normalized name match ===
  if (cachedIndexes) {
    const exactMatch = cachedIndexes.byName.get(normalizedSearch);
    if (exactMatch) {
      return [{
        customer: exactMatch,
        score: 1.0,
        matchType: 'exact',
        matchedField: 'fullName',
        algorithms: { exact: true, normalized: true, levenshtein: 1, jaroWinkler: 1, tokenBased: 1, firstNameMatch: 1, lastNameMatch: 1, doubleMetaphone: 1 }
      }];
    }

    // === FAST PATH 2: Reversed name match ===
    if (searchParts.parts.length >= 2) {
      const reversed = [...searchParts.parts].reverse().join(' ');
      const reversedMatch = cachedIndexes.byNameReversed.get(reversed) || cachedIndexes.byName.get(reversed);
      if (reversedMatch) {
        return [{
          customer: reversedMatch,
          score: 0.97,
          matchType: 'normalized',
          matchedField: 'fullName',
          algorithms: { exact: false, normalized: true, levenshtein: 0.97, jaroWinkler: 0.97, tokenBased: 0.97, firstNameMatch: 0.97, lastNameMatch: 0.97, doubleMetaphone: 0.97 }
        }];
      }
    }
  }

  // Search last meaningful token for apellido-based pre-filtering
  const searchLastRaw = searchMTokens[searchMTokens.length - 1] || '';
  const searchLastKey = searchLastRaw && searchLastRaw !== searchFirstRaw ? phoneticKey(searchLastRaw) : '';

  // === PRE-FILTER: Use phonetic first-token AND last-token index to narrow candidates ===
  let candidateTokenData = cachedIndexes?.tokenData ?? [];
  if (cachedIndexes && searchFirstRaw.length >= 2) {
    const searchFirstKey = phoneticKey(searchFirstRaw);
    const seen2 = new Set<string>();
    const filtered: typeof candidateTokenData = [];

    for (const td of cachedIndexes.tokenData) {
      if (seen2.has(td.customer.slCode)) continue;
      let include = false;

      // First-token phonetic match
      if (td.firstTokenKey === searchFirstKey) include = true;

      if (!include) {
        const custFirst = td.meaningfulParts[0] ?? '';
        const minLen = Math.min(searchFirstRaw.length, custFirst.length);
        // Prefix match (first 3 chars)
        if (minLen >= 3 && searchFirstRaw.slice(0, 3) === custFirst.slice(0, 3)) include = true;
        // Abbreviation
        if (!include && (isAbbreviationOf(searchFirstRaw, custFirst) || isAbbreviationOf(custFirst, searchFirstRaw))) include = true;
        // Initial match
        if (!include && searchFirstRaw.length === 1 && custFirst.startsWith(searchFirstRaw)) include = true;
      }

      // Last-token (apellido) phonetic match — any search token matches any customer token
      if (!include && searchLastKey && searchMTokens.length >= 2) {
        if (td.lastTokenKey === searchLastKey) include = true;
        if (!include) {
          for (const st of searchMTokens) {
            if (st.length < 3) continue;
            const stKey = phoneticKey(st);
            if (td.firstTokenKey === stKey || td.lastTokenKey === stKey) { include = true; break; }
            for (const ct of td.meaningfulParts) {
              const ml = Math.min(st.length, ct.length);
              if (ml >= 4 && st.slice(0, 4) === ct.slice(0, 4)) { include = true; break; }
            }
            if (include) break;
          }
        }
      }

      if (include) {
        seen2.add(td.customer.slCode);
        filtered.push(td);
      }
    }

    // Use filtered set if meaningful; fall back to full scan if too few results
    if (filtered.length >= 3) {
      candidateTokenData = filtered;
    }
  }

  // Cache permutations for this search term (reused across customers in same batch)
  let searchPerms: string[][] | null = null;
  if (searchMTokens.length >= 2 && searchMTokens.length <= 4) {
    const permKey = searchMTokens.join('|');
    if (!permutationCache.has(permKey)) {
      permutationCache.set(permKey, tokenPermutations(searchMTokens));
    }
    searchPerms = permutationCache.get(permKey)!;
  }

  const seen = new Set<string>();

  for (const td of candidateTokenData) {
    const { customer, meaningfulParts: customerMTokens } = td;
    const normalizedCustomer = customer.normalizedName;

    if (normalizedSearch === normalizedCustomer) continue;
    if (seen.has(customer.slCode)) continue;

    // === FIRST-NAME VETO pre-check ===
    // Now enhanced with bidirectional nickname resolution:
    // PEPE GARCIA should match JOSE GARCIA (PEPE ↔ JOSE)
    let firstNameVetoCap = 1.0;
    if (searchMTokens.length >= 2 && searchFirstRaw.length >= 3) {
      const firstFoundAnywhere = customerMTokens.some(ct =>
        tokensMatch(searchFirstRaw, ct) ||
        isAbbreviationOf(searchFirstRaw, ct) ||
        isAbbreviationOf(ct, searchFirstRaw) ||
        areNicknameEquivalent(searchFirstRaw, ct) ||
        (searchFirstRaw.length >= 4 && ct.length >= 4 && phoneticKey(searchFirstRaw) === phoneticKey(ct)) ||
        (searchFirstRaw.length >= 4 && ct.length >= 4 && doubleMetaphoneMatch(searchFirstRaw, ct))
      );
      if (!firstFoundAnywhere && customerMTokens.length > 0) {
        const anySearchMatchesCustFirst = searchMTokens.some(st =>
          tokensMatch(st, customerMTokens[0]) ||
          isAbbreviationOf(st, customerMTokens[0]) ||
          isAbbreviationOf(customerMTokens[0], st) ||
          areNicknameEquivalent(st, customerMTokens[0])
        );
        firstNameVetoCap = anySearchMatchesCustFirst ? 0.80 : 0.62;
      } else if (!firstFoundAnywhere) {
        firstNameVetoCap = 0.62;
      }
    }

    let bestScore = 0;

    // === TECHNIQUE 1: Token permutations ===
    if (searchPerms) {
      const custJoined = customerMTokens.join(' ');
      for (const perm of searchPerms) {
        if (perm.join(' ') === custJoined || perm.join(' ') === normalizedCustomer) {
          bestScore = 0.97;
          break;
        }
      }
    }

    if (bestScore >= 0.97) {
      seen.add(customer.slCode);
      results.push({ customer, score: 0.97, matchType: 'normalized', matchedField: 'fullName', algorithms: { exact: false, normalized: true, levenshtein: 0.97, jaroWinkler: 0.97, tokenBased: 0.97, firstNameMatch: 0.97, lastNameMatch: 0.97, doubleMetaphone: 0.97 } });
      continue;
    }

    // === TECHNIQUE 2: Abbreviated first name (STEPH→STEPHANIE) ===
    if (searchFirstRaw.length >= 3 && customerMTokens.length > 0) {
      const custFirst = customerMTokens[0];
      if (isAbbreviationOf(searchFirstRaw, custFirst)) {
        const restSearch = searchMTokens.slice(1);
        const restCustomer = customerMTokens.slice(1);
        if (restSearch.length === 0 || restSearch.every(t => restCustomer.some(ct => tokensMatch(t, ct)))) {
          const score = restSearch.length === 0 ? 0.72 : 0.90;
          if (score > bestScore) bestScore = score;
        }
      }
      if (isAbbreviationOf(custFirst, searchFirstRaw)) {
        const restSearch = searchMTokens.slice(1);
        const restCustomer = customerMTokens.slice(1);
        if (restSearch.length === 0 || restSearch.every(t => restCustomer.some(ct => tokensMatch(t, ct)))) {
          const score = restSearch.length === 0 ? 0.72 : 0.88;
          if (score > bestScore) bestScore = score;
        }
      }
    }

    // === TECHNIQUE 3: Initials matching ("J PEREZ" → "JUAN PEREZ") ===
    if (searchMTokens.length >= 2 && customerMTokens.length >= 2) {
      const sFirst = searchMTokens[0];
      const cFirst = customerMTokens[0];
      if (sFirst.length === 1 && cFirst.startsWith(sFirst)) {
        const rs = searchMTokens.slice(1).join(' ');
        const rc = customerMTokens.slice(1).join(' ');
        if (rs === rc || damerauLevenshteinDistance(rs, rc, 1) <= 1) {
          if (0.88 > bestScore) bestScore = 0.88;
        }
      }
      if (cFirst.length === 1 && sFirst.startsWith(cFirst)) {
        const rs = searchMTokens.slice(1).join(' ');
        const rc = customerMTokens.slice(1).join(' ');
        if (rs === rc || damerauLevenshteinDistance(rs, rc, 1) <= 1) {
          if (0.85 > bestScore) bestScore = 0.85;
        }
      }
    }

    // === TECHNIQUE 4: Substring/Contains matching ===
    if (bestScore < 0.90 && searchMTokens.length >= 2 &&
        (normalizedCustomer.includes(normalizedSearch) || normalizedSearch.includes(normalizedCustomer))) {
      const ratio = Math.min(normalizedSearch.length, normalizedCustomer.length) / Math.max(normalizedSearch.length, normalizedCustomer.length);
      if (ratio >= 0.5) {
        const score = 0.75 + (ratio * 0.15);
        if (score > bestScore) bestScore = score;
      }
    }

    // === TECHNIQUE 5: Token subset (DB has extra names) ===
    if (bestScore < 0.90 && searchMTokens.length >= 2 && customerMTokens.length >= searchMTokens.length) {
      let allFound = true;
      let firstTokenMatchesFirst = false;
      const availableCustTokens = [...customerMTokens];

      for (let si = 0; si < searchMTokens.length; si++) {
        const sTok = searchMTokens[si];
        const matchIdx = availableCustTokens.findIndex(ct =>
          tokensMatch(sTok, ct) ||
          isAbbreviationOf(sTok, ct) ||
          isAbbreviationOf(ct, sTok)
        );
        if (matchIdx === -1) {
          allFound = false;
          break;
        }
        if (si === 0 && matchIdx === 0) firstTokenMatchesFirst = true;
        availableCustTokens.splice(matchIdx, 1);
      }
      if (allFound) {
        const extraTokens = customerMTokens.length - searchMTokens.length;
        let score = extraTokens === 0 ? 0.97 : extraTokens === 1 ? 0.88 : extraTokens === 2 ? 0.82 : 0.75;
        if (firstTokenMatchesFirst && extraTokens > 0) score = Math.min(score + 0.05, 0.97);
        // Stronger penalty when first token doesn't anchor to position 0
        if (!firstTokenMatchesFirst) score = Math.max(score - 0.12, 0.40);
        // ── Partial-match cap ──
        // When search has fewer tokens than customer (e.g., "GARCIA MORA" → "JUAN GARCIA MORA"),
        // cap the score to force AI verification. Prevents surname-only auto-accepts.
        if (extraTokens > 0) score = Math.min(score, MATCH_THRESHOLDS.TOKEN_SUBSET_PARTIAL_CAP);
        if (score > bestScore) bestScore = score;
      }
    }

    // === TECHNIQUE 6b: Apellido-anchor — non-first search tokens all match in customer ===
    // Handles: "MARIO VEGA CAMPOS" in DB vs "VEGA CAMPOS MARIO" in manifest
    if (bestScore < 0.85 && searchMTokens.length >= 2 && customerMTokens.length >= 2) {
      const searchApellidos = searchMTokens.slice(1);
      if (searchApellidos.length > 0) {
        const custCopy2 = [...customerMTokens];
        let matchedApellidos = 0;
        for (const sa of searchApellidos) {
          const idx = custCopy2.findIndex(ct =>
            tokensMatch(sa, ct) ||
            isAbbreviationOf(sa, ct) ||
            isAbbreviationOf(ct, sa) ||
            (sa.length >= 4 && ct.length >= 4 && phoneticKey(sa) === phoneticKey(ct))
          );
          if (idx !== -1) { matchedApellidos++; custCopy2.splice(idx, 1); }
        }
        const apellidoRatio = matchedApellidos / searchApellidos.length;
        if (apellidoRatio >= 0.5) {
          const searchFirstRaw2 = searchMTokens[0];
          const givenNameFoundAnywhere = custCopy2.some(ct =>
            tokensMatch(searchFirstRaw2, ct) ||
            isAbbreviationOf(searchFirstRaw2, ct) ||
            isAbbreviationOf(ct, searchFirstRaw2) ||
            (searchFirstRaw2.length >= 4 && ct.length >= 4 && phoneticKey(searchFirstRaw2) === phoneticKey(ct))
          );
          let score = apellidoRatio >= 1.0
            ? (givenNameFoundAnywhere ? 0.93 : 0.78)
            : (givenNameFoundAnywhere ? 0.82 : 0.68);
          const extraInCust = custCopy2.length;
          if (extraInCust >= 2) score = Math.max(score - 0.05, 0.55);
          // When search has 2+ surnames and customer has 2+ surnames, but only 1 surname matched (e.g. SOLIS SOLIS vs CONEJO SOLIS),
          // check if the primary (paternal) surname mismatched
          if (searchApellidos.length >= 2 && customerMTokens.length >= 3 && apellidoRatio < 1.0) {
            const searchPaternal = searchApellidos[0];
            const custPaternal = customerMTokens[customerMTokens.length - 2];
            if (!tokensMatch(searchPaternal, custPaternal) && !isAbbreviationOf(searchPaternal, custPaternal) && !isAbbreviationOf(custPaternal, searchPaternal)) {
              score = Math.min(score, 0.60);
            }
          }
          // ── Short-search cap ──
          // When search has ≤ 2 tokens (e.g., "GARCIA MORA"), the first token might be
          // a surname mistaken for a given name. Cap to force AI verification.
          if (searchMTokens.length <= 2) score = Math.min(score, MATCH_THRESHOLDS.APELLIDO_SHORT_SEARCH_CAP);
          if (score > bestScore) bestScore = score;
        }
      }
    }

    // === TECHNIQUE 6: Token score with phonetics/fuzzy — only when needed ===
    if (bestScore < 0.65) {
      const scoreForward = tokenNameScore(searchMTokens, customerMTokens);
      const scoreReversed = scoreForward < 60 ? tokenNameScore([...searchMTokens].reverse(), customerMTokens) : scoreForward;
      const rawScore = Math.max(scoreForward, scoreReversed);
      if (rawScore >= 40) {
        const firstTokenFoundAnywhere = searchFirstRaw.length > 0 && customerMTokens.some(ct =>
          tokensMatch(searchFirstRaw, ct) || isAbbreviationOf(searchFirstRaw, ct) || isAbbreviationOf(ct, searchFirstRaw)
        );
        let confidence = rawScore / 100;
        // Tighter cap when first name has no relation — push these to AI review only
        if (!firstTokenFoundAnywhere && searchMTokens.length >= 2) confidence = Math.min(confidence, 0.48);
        if (confidence > bestScore) bestScore = confidence;
      }
    }

    // Apply first-name veto cap
    bestScore = Math.min(bestScore, firstNameVetoCap);

    // Add to results — defer expensive metrics to final result set only
    if (bestScore >= 0.40) {
      seen.add(customer.slCode);
      results.push({
        customer,
        score: Math.round(bestScore * 100) / 100,
        matchType: bestScore >= 0.92 ? 'exact' : bestScore >= 0.80 ? 'normalized' : bestScore >= 0.65 ? 'partial' : 'fuzzy',
        matchedField: 'fullName',
        algorithms: {
          exact: false,
          normalized: false,
          levenshtein: 0, // filled below for top results only
          jaroWinkler: 0,
          tokenBased: bestScore,
          firstNameMatch: (customerMTokens.length > 0 && searchFirstRaw.length > 0 &&
            (tokensMatch(searchFirstRaw, customerMTokens[0]) || isAbbreviationOf(searchFirstRaw, customerMTokens[0]))) ? bestScore : 0,
          lastNameMatch: bestScore,
          doubleMetaphone: 0,
        }
      });
    }
  }

  // Sort by score descending; real customers (non-temp) win ties
  results.sort((a, b) => (b.score - a.score) || ((a.customer.isTemp ? 1 : 0) - (b.customer.isTemp ? 1 : 0)));
  const top = results.slice(0, 10);

  // Fill in expensive metrics only for the top 10 results
  for (const r of top) {
    const nc = r.customer.normalizedName;
    const damerau = damerauLevenshteinSimilarity(normalizedSearch, nc);
    r.algorithms.levenshtein = damerau;
    r.algorithms.jaroWinkler = jaroWinklerSimilarity(normalizedSearch, nc);

    // Enhanced metrics for calibrated scoring
    const dmScore = doubleMetaphoneScore(normalizedSearch, nc);
    r.algorithms.doubleMetaphone = dmScore;
    const hasNickname = searchMTokens.some(st =>
      (r.customer.normalizedName?.split(' ') ?? []).some(ct => areNicknameEquivalent(st, ct))
    );

    // Recalculate final score using calibrated weights
    const calibrated = calibratedScore(
      {
        ...r.algorithms,
        damerauLevenshtein: damerau,
        doubleMetaphone: dmScore,
        nicknameMatch: hasNickname,
      },
      {
        searchTokenCount: searchMTokens.length,
        customerTokenCount: meaningfulTokens(nc.split(' ')).length,
        searchLength: normalizedSearch.length,
        customerLength: nc.length,
      }
    );

    // Update the score to the AI-calibrated score, allowing it to both 
    // upgrade strong fuzzy matches and downgrade false positives.
    // (exact and normalized matches are protected inside calibratedScore)
    r.score = calibrated;
    
    // Update matchType based on the new score
    if (r.score >= 0.92) {
      r.matchType = 'exact';
    } else if (r.score >= 0.80) {
      r.matchType = 'normalized';
    } else if (r.score >= 0.65) {
      r.matchType = 'partial';
    } else {
      r.matchType = 'fuzzy';
    }
  }

  // Re-sort after calibration (scores may have shifted)
  top.sort((a, b) => (b.score - a.score) || ((a.customer.isTemp ? 1 : 0) - (b.customer.isTemp ? 1 : 0)));

  return top;
}
