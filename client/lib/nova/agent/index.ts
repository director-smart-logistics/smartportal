/**
 * Nova Module — Agent Engine
 *
 * Multi-turn Gemini reasoning loop with tool orchestration.
 * Nova is SmartLogistics' AI administrative assistant with:
 *  - Full access to live Firestore data via tool calls
 *  - Awareness of the current manifest being processed
 *  - Long-term memory via the learning/ submodule
 *  - Proactive insight surfacing
 *
 * Reasoning loop: build context → call Gemini → execute tools → repeat (max 6) → respond
 */

export {
  askNova,
  quickNovaQuery,
} from '@/lib/services/nova-agent-engine';

export type {
  NovaResponse,
  NovaContext,
} from '@/lib/services/nova-agent-engine';

export {
  executeNovaTool,
  getNovaToolDeclarations,
  invalidateNovaCache,
  NOVA_TOOLS,
} from '@/lib/services/nova-tools';

export type {
  NovaTool,
  NovaToolResult,
  CurrentManifestData,
} from '@/lib/services/nova-tools';
