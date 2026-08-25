/**
 * Matching Engine — Public API Barrel
 *
 * Single import point for all matching functionality.
 * The old monolithic `customer-matcher.ts` re-exports from here
 * so all existing imports remain backward-compatible.
 *
 * @module matching/index
 */

// ── Types ───────────────────────────────────────────────────────────────────────
export type { CustomerData, CustomerMatchResponse, MatchResult, CustomerIndexes, TokenizedCustomer } from './types';

// ── Thresholds ──────────────────────────────────────────────────────────────────
export { MATCH_THRESHOLDS } from './thresholds';

// ── Normalization & Token Utilities ─────────────────────────────────────────────
export { normalize, meaningfulTokens, phoneticKey, getNameParts, isAbbreviationOf, NAME_STOPWORDS, NAME_ABBREVIATIONS, tokenPermutations, permutationCache, clearNormalizeCaches } from './normalize';

// ── Algorithms ──────────────────────────────────────────────────────────────────
export { jaroSimilarity, jaroWinklerSimilarity, tokensMatch, tokenNameScore } from './algorithms';
export { areDistinctGivenNames } from './gender-name-guard';

// ── Customer Loader & Cache ─────────────────────────────────────────────────────
export { loadCustomers, getCachedIndexes, getCachedCustomers, findCustomerBySlCode, getCustomerBySlCode, invalidateCustomerCache, patchCustomerRutaInCache, patchCustomerConsolidationInCache, injectCustomerIntoCache } from './customer-loader';

// ── Core Match Engine ───────────────────────────────────────────────────────────
export { matchName } from './match-engine';

// ── Single-Name Match ───────────────────────────────────────────────────────────
export { findCustomerMatch } from './find-match';

// ── Typeahead Search ────────────────────────────────────────────────────────────
export { searchCustomersLocal } from './typeahead-search';

// ── Batch Matcher ───────────────────────────────────────────────────────────────
export { batchFindCustomerMatches, batchFindCustomerMatchesWithAI } from './batch-matcher';

// ── Enhanced Algorithms (additive — do not replace existing) ────────────────────
export { damerauLevenshteinDistance, damerauLevenshteinSimilarity } from './damerau-levenshtein';
export { doubleMetaphone, doubleMetaphoneMatch, doubleMetaphoneScore } from './double-metaphone';

// ── Nickname Resolution ─────────────────────────────────────────────────────────
export { getAllVariants, toCanonical, areNicknameEquivalent, stripDiminutive } from './nickname-resolver';

// ── Score Calibration ───────────────────────────────────────────────────────────
export { calibratedScore } from './score-calibrator';
export type { AlgorithmScores, InputProfile } from './score-calibrator';


// ── Enhanced Learned Match Lookup ───────────────────────────────────────────────
export { lookupLearnedEnhanced, getLearnedCandidatesForAIEnhanced, setLearnedIndex } from './learned-lookup';

// ── Match Telemetry ─────────────────────────────────────────────────────────────
export { createTelemetrySession, recordMatchDecision, flushTelemetry, aggregateReports } from './match-telemetry';
export type { TelemetrySession, TelemetryReport, MatchDecisionPath } from './match-telemetry';

