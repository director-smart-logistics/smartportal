/**
 * Matching Engine — Single-Name Match
 *
 * `findCustomerMatch()` is the primary public API used by Nova, the bulk
 * modal, and manual search flows to match a single manifest name against
 * the customer database.
 *
 * Flow:
 *  1. Load customers (cache-backed)
 *  2. Run `matchName()` scoring pipeline
 *  3. Classify result: exact match vs candidates for AI/user choice
 *
 * @module matching/find-match
 */

import type { CustomerMatchResponse } from './types';
import { loadCustomers } from './customer-loader';
import { matchName } from './match-engine';
import { normalize, meaningfulTokens } from './normalize';
import { MATCH_THRESHOLDS } from './thresholds';

/**
 * Find customer match for a name.
 * Returns exact match or candidates for AI prediction.
 *
 * @param name - Raw manifest name string
 * @returns Response with best match, candidates, and metadata
 */
export async function findCustomerMatch(name: string): Promise<CustomerMatchResponse> {
  const customers = await loadCustomers();
  const searchName = name.toUpperCase().trim();
  
  if (!searchName) {
    return {
      exactMatch: false,
      candidates: [],
      slCode: undefined,
      ruta: undefined,
      consolidationEnabled: undefined,
      searchedName: name,
      totalCustomers: customers.length,
      multipleMatches: false,
      requiresUserChoice: false,
    };
  }
  
  const matches = matchName(searchName, customers);
  const searchMeaningfulTokens = meaningfulTokens(normalize(searchName).split(' '));
  const isGenericSingleToken = searchMeaningfulTokens.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS;
  
  // Check for exact match (score >= AUTO_ACCEPT_MIN) — prefer non-temp customers first.
  // For single-token search names (e.g. just "VALVERDE"), only allow exact match if the customer's normalized name is also an exact 1:1 match.
  const exactMatch = matches.find(m => {
    if (m.score < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN) return false;
    if (isGenericSingleToken && normalize(m.customer.fullName || m.customer.name) !== normalize(searchName)) {
      return false;
    }
    return !m.customer.isTemp;
  }) ?? matches.find(m => {
    if (m.score < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN) return false;
    if (isGenericSingleToken && normalize(m.customer.fullName || m.customer.name) !== normalize(searchName)) {
      return false;
    }
    return true;
  });
  
  // Check for multiple high-confidence matches (requires user choice)
  const highConfidenceMatches = matches.filter(m => m.score >= MATCH_THRESHOLDS.MULTIPLE_HIGH_CONFIDENCE);
  const hasMultipleMatches = highConfidenceMatches.length > 1;
  const topScore = matches[0]?.score || 0;
  const secondScore = matches[1]?.score || 0;
  const requiresUserChoice = hasMultipleMatches && (topScore - secondScore) < 0.1;
  
  if (exactMatch) {
    return {
      exactMatch: true,
      bestMatch: exactMatch,
      candidates: matches.slice(0, 5),
      slCode: exactMatch.customer.slCode || undefined,
      ruta: exactMatch.customer.ruta || undefined,
      consolidationEnabled: exactMatch.customer.consolidationEnabled,
      searchedName: name,
      totalCustomers: customers.length,
      multipleMatches: hasMultipleMatches,
      requiresUserChoice: false,
    };
  }
  
  // Return top candidates for AI prediction / user choice without forcing an auto-assignment
  const topCandidates = matches.slice(0, 10);
  const bestMatch = topCandidates[0];
  
  return {
    exactMatch: false,
    bestMatch,
    candidates: topCandidates,
    slCode: undefined,
    ruta: undefined,
    consolidationEnabled: bestMatch?.customer.consolidationEnabled,
    searchedName: name,
    totalCustomers: customers.length,
    multipleMatches: hasMultipleMatches,
    requiresUserChoice: true,
  };
}
