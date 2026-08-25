/**
 * Nova Module — Public API
 *
 * Single entry point for the entire Nova AI manifest-processing feature.
 *
 * Submodule topology (dependency order, innermost first):
 *
 *   types/    — shared interfaces (no runtime code)
 *   core/     — manifest-processor, permit-detector, pricing-service
 *   ai/       — gemini-client (name verification, validation)
 *   matching/ — customer-matcher, match-learning, customer-sync
 *   learning/ — ai-manifest-service, manifest-learning-service
 *   agent/    — nova-agent-engine, nova-tools
 *
 * Consumers should import from this barrel or from a specific submodule:
 *
 *   import { processManifestFile } from '@/lib/nova';
 *   import { askNova }             from '@/lib/nova/agent';
 *   import type { ManifestRow }    from '@/lib/nova/types';
 */

export * from './types';
export * from './core';
export * from './ai';
export * from './matching';
export * from './learning';
export * from './agent';
