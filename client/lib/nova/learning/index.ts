/**
 * Nova Module — Learning & Memory
 *
 * Two responsibilities:
 *  1. ai-manifest-service  — Firestore persistence of sessions, manifest records,
 *                            and agent context snapshots (long-term memory).
 *  2. manifest-learning-service — Post-processing analysis: bug detection,
 *                                 improvement suggestions, Resend email report.
 *
 * Together these enable Nova to improve over time and alert the director
 * automatically after every manifest is processed.
 */

export {
  createSession,
  appendSessionMessages,
  getRecentSession,
  saveManifestRecord,
  getRecentManifests,
  getManifestsThisMonth,
  getAgentContext,
  updateAgentContext,
  invalidateAgentContextCache,
  saveConversationTurn,
  getRecentConversationTurns,
} from '@/lib/services/ai-manifest-service';

export type {
  AgentMessage,
  ManifestSession,
  ProcessedManifestRecord,
  AgentContext,
  ConversationTurn,
} from '@/lib/services/ai-manifest-service';

export { recordManifestLearning } from '@/lib/services/manifest-learning-service';

export type {
  BugReport,
  BugSeverity,
  ImprovementSuggestion,
  LearningRecord,
} from '@/lib/services/manifest-learning-service';
