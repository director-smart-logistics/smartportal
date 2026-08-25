/**
 * Customer Matcher Service — Re-export Facade
 *
 * This file is a backward-compatible shim. All matching logic has been
 * decomposed into `matching/` sub-modules for maintainability:
 *
 *   matching/types.ts          — CustomerData, MatchResult, CustomerMatchResponse
 *   matching/thresholds.ts     — Centralized threshold constants
 *   matching/normalize.ts      — Text normalization, phonetic keys, abbreviations
 *   matching/algorithms.ts     — Levenshtein, Jaro-Winkler, N-gram, Soundex, token scoring
 *   matching/customer-loader.ts — Customer cache, index building, SL code lookups
 *   matching/match-engine.ts   — Core `matchName()` scoring pipeline
 *   matching/find-match.ts     — `findCustomerMatch()` single-name API
 *   matching/typeahead-search.ts — `searchCustomersLocal()` autocomplete
 *   matching/batch-matcher.ts  — Batch matching with AI disambiguation
 *   matching/index.ts          — Barrel re-exports
 *
 * All existing imports from '@/lib/services/customer-matcher' continue to work.
 * New code should import from '@/lib/services/matching' directly.
 */

// ── Types ───────────────────────────────────────────────────────────────────────
export type { CustomerData, CustomerMatchResponse, MatchResult } from './matching';

// ── Public API ──────────────────────────────────────────────────────────────────
export { findCustomerMatch } from './matching';
export { searchCustomersLocal } from './matching';
export { batchFindCustomerMatches, batchFindCustomerMatchesWithAI } from './matching';
export { findCustomerBySlCode, getCustomerBySlCode } from './matching';
export { invalidateCustomerCache, patchCustomerRutaInCache, patchCustomerConsolidationInCache } from './matching';
