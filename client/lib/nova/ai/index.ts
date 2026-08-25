/**
 * Nova Module — AI Layer
 *
 * Gemini API integration for:
 * - Name verification & spelling correction
 * - Weight anomaly detection
 * - Data validation
 *
 * IMPORTANT: Pricing is NEVER calculated here — use @/lib/pricing instead.
 * These functions call Gemini API and should be batched to minimise cost.
 */

export {
  validateManifestData,
  verifyNames,
  matchCustomerNames,
  correctWeights,
  aiSelectBestMatch,
  aiFindPotentialMatches,
  clearNameCache,
  getCacheStats,
} from '@/lib/services/gemini-client';

export type {
  AIMatchCandidate,
  AIMatchResult,
} from '@/lib/services/gemini-client';
