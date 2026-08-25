/**
 * Nova Module — Customer Matching
 *
 * Fuzzy-match manifest names to CRM customers (slCode + ruta).
 * Includes algorithmic matching, AI-assisted disambiguation,
 * learned-match persistence and cross-portal (SP2) sync.
 *
 * Dependency order: match-learning ← customer-matcher ← customer-sync
 */

export {
  findCustomerMatch,
  batchFindCustomerMatches,
  batchFindCustomerMatchesWithAI,
  searchCustomersLocal,
  invalidateCustomerCache,
} from '@/lib/services/customer-matcher';

export type {
  CustomerData,
  CustomerMatchResponse,
  MatchResult,
} from '@/lib/services/customer-matcher';

export {
  saveMatchFeedback,
  loadLearnedMatches,
  lookupLearned,
  getLearnedCandidatesForAI,
} from '@/lib/services/match-learning';

export type {
  MatchFeedback,
  LearnedMatch,
} from '@/lib/services/match-learning';

export { updateCustomerRuta, updateCustomerConsolidation } from '@/lib/services/customer-sync';
