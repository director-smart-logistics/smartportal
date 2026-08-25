/**
 * Nova Module — Shared Types
 *
 * Single source of truth for all interfaces used across the Nova module.
 * Re-exports from manifest-processor (the canonical source of ManifestRow,
 * ProcessingResult, ManifestConfig, etc.) so consumers can import from
 * @/lib/nova/types instead of reaching into the implementation file.
 */

export type {
  ManifestRow,
  ProcessingResult,
  ManifestConfig,
  ManifestType,
  ProcessingStep,
} from '@/lib/services/manifest-processor';

export type {
  BugReport,
  BugSeverity,
  ImprovementSuggestion,
  LearningRecord,
} from '@/lib/services/manifest-learning-service';

export type {
  AgentMessage,
  ManifestSession,
  ProcessedManifestRecord,
  AgentContext,
} from '@/lib/services/ai-manifest-service';

export type {
  CustomerData,
  CustomerMatchResponse,
  MatchResult,
} from '@/lib/services/customer-matcher';

export type {
  NovaResponse,
  NovaContext,
} from '@/lib/services/nova-agent-engine';

export type {
  NovaTool,
  NovaToolResult,
} from '@/lib/services/nova-tools';

export type { CurrentManifestData } from '@/lib/services/nova-tools';
