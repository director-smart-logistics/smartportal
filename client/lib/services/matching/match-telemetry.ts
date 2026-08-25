/**
 * Match Telemetry — Performance Tracking for Matching Pipeline
 *
 * Records per-manifest matching statistics to Firestore for measuring
 * the real impact of algorithm improvements and identifying problem areas.
 *
 * WHY THIS EXISTS:
 *   Without data, we cannot confirm that algorithmic improvements actually
 *   reduce manual operator intervention. This module tracks:
 *     - What percentage of names are auto-accepted vs manual
 *     - Which decision paths are used most (learned, AI, algorithmic)
 *     - Average confidence scores per manifest
 *     - Which names consistently fail matching (for targeted improvements)
 *
 * USAGE:
 *   1. Call `createTelemetrySession(manifestId)` at batch start
 *   2. Call `recordMatchDecision(session, ...)` for each name
 *   3. Call `flushTelemetry(session)` at batch end
 *
 * STORAGE:
 *   Collection: `match_telemetry`
 *   TTL: 90 days (auto-cleanup via Firestore TTL policy)
 *
 * @module matching/match-telemetry
 */

import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Decision paths tracked by telemetry */
export type MatchDecisionPath =
  | 'exact-customer'     // Algorithmic exact match against primary database
  | 'auto-accept'        // Algorithmic match above threshold
  | 'learned'            // Matched via learned (historical feedback) cache
  | 'ai-disambiguate'    // AI resolved ambiguous candidates
  | 'ai-search'          // AI searched for customer (no algorithmic candidates)
  | 'manual'             // Operator chose manually
  | 'unmatched';         // No match found, skipped

/** A single match decision record */
interface MatchDecisionRecord {
  manifestName: string;
  decisionPath: MatchDecisionPath;
  confidence: number;       // 0-1 score
  candidateCount: number;   // How many candidates were evaluated
  wasOverridden: boolean;   // Operator changed AI/algorithm suggestion
}

/** Active telemetry session for a manifest batch */
export interface TelemetrySession {
  manifestId: string;
  startedAt: number;
  decisions: MatchDecisionRecord[];
}

/** Aggregated stats written to Firestore */
export interface TelemetryReport {
  manifestId: string;
  timestamp: ReturnType<typeof serverTimestamp>;
  totalNames: number;
  // Decision path counts
  exactCustomerMatches: number;
  autoAccepted: number;
  learnedMatches: number;
  aiResolved: number;
  aiSearched: number;
  manual: number;
  unmatched: number;
  // Quality metrics
  avgConfidence: number;
  overrideRate: number;      // % of AI/algo matches that were overridden
  // Efficiency metrics
  autoRate: number;          // % resolved without human intervention
  durationMs: number;        // Total time from session start to flush
  // Problem names (top 5 lowest-confidence matches for debugging)
  lowestConfidenceNames: Array<{ name: string; score: number; path: string }>;
}

// ─── Session Lifecycle ──────────────────────────────────────────────────────────

/**
 * Create a new telemetry session for a manifest batch.
 * Call at the start of batch matching.
 */
export function createTelemetrySession(manifestId: string): TelemetrySession {
  return {
    manifestId,
    startedAt: Date.now(),
    decisions: [],
  };
}

/**
 * Record a single match decision in the active session.
 * Call after each name is resolved (matched, AI'd, or skipped).
 */
export function recordMatchDecision(
  session: TelemetrySession,
  manifestName: string,
  decisionPath: MatchDecisionPath,
  confidence: number,
  candidateCount: number,
  wasOverridden = false,
): void {
  session.decisions.push({
    manifestName,
    decisionPath,
    confidence: Math.round(confidence * 100) / 100,
    candidateCount,
    wasOverridden,
  });
}

/**
 * Flush telemetry session to Firestore.
 * Aggregates all decisions into a compact report document.
 *
 * Call at the end of batch matching (after all names processed).
 * Errors are caught and logged — telemetry should never break the main flow.
 */
export async function flushTelemetry(session: TelemetrySession): Promise<void> {
  try {
    const { decisions, manifestId, startedAt } = session;
    if (decisions.length === 0) return;

    const counts = {
      exactCustomerMatches: 0,
      autoAccepted: 0,
      learnedMatches: 0,
      aiResolved: 0,
      aiSearched: 0,
      manual: 0,
      unmatched: 0,
    };

    let totalConfidence = 0;
    let overrideCount = 0;
    let autoCount = 0;

    for (const d of decisions) {
      totalConfidence += d.confidence;
      if (d.wasOverridden) overrideCount++;

      switch (d.decisionPath) {
        case 'exact-customer': counts.exactCustomerMatches++; autoCount++; break;
        case 'auto-accept': counts.autoAccepted++; autoCount++; break;
        case 'learned': counts.learnedMatches++; autoCount++; break;
        case 'ai-disambiguate': counts.aiResolved++; autoCount++; break;
        case 'ai-search': counts.aiSearched++; break;
        case 'manual': counts.manual++; break;
        case 'unmatched': counts.unmatched++; break;
      }
    }

    // Top 5 lowest-confidence for debugging
    const lowestConfidence = [...decisions]
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, 5)
      .map(d => ({ name: d.manifestName, score: d.confidence, path: d.decisionPath }));

    const report: TelemetryReport = {
      manifestId,
      timestamp: serverTimestamp(),
      totalNames: decisions.length,
      ...counts,
      avgConfidence: Math.round((totalConfidence / decisions.length) * 100) / 100,
      overrideRate: decisions.length > 0
        ? Math.round((overrideCount / decisions.length) * 100) / 100
        : 0,
      autoRate: decisions.length > 0
        ? Math.round((autoCount / decisions.length) * 100) / 100
        : 0,
      durationMs: Date.now() - startedAt,
      lowestConfidenceNames: lowestConfidence,
    };

    await addDoc(collection(db, 'match_telemetry'), report);
    console.log(`[MatchTelemetry] Flushed: ${decisions.length} decisions for ${manifestId} (auto: ${(report.autoRate * 100).toFixed(0)}%)`);
  } catch (error) {
    // Never let telemetry break the main flow
    console.warn('[MatchTelemetry] Flush failed (non-blocking):', error);
  }
}

// ─── Query Helpers (for admin dashboard) ────────────────────────────────────

/**
 * Summarize a batch of telemetry reports into aggregate metrics.
 * Useful for admin dashboards showing weekly/monthly trends.
 */
export function aggregateReports(reports: TelemetryReport[]): {
  totalManifests: number;
  totalNames: number;
  avgAutoRate: number;
  avgConfidence: number;
  avgOverrideRate: number;
  pathDistribution: Record<string, number>;
} {
  if (reports.length === 0) {
    return { totalManifests: 0, totalNames: 0, avgAutoRate: 0, avgConfidence: 0, avgOverrideRate: 0, pathDistribution: {} };
  }

  let totalNames = 0;
  let sumAutoRate = 0;
  let sumConfidence = 0;
  let sumOverride = 0;
  const dist: Record<string, number> = {};

  for (const r of reports) {
    totalNames += r.totalNames;
    sumAutoRate += r.autoRate;
    sumConfidence += r.avgConfidence;
    sumOverride += r.overrideRate;
    dist['exact-customer'] = (dist['exact-customer'] ?? 0) + r.exactCustomerMatches;
    dist['auto-accept'] = (dist['auto-accept'] ?? 0) + r.autoAccepted;
    dist['learned'] = (dist['learned'] ?? 0) + r.learnedMatches;
    dist['ai-disambiguate'] = (dist['ai-disambiguate'] ?? 0) + r.aiResolved;
    dist['ai-search'] = (dist['ai-search'] ?? 0) + r.aiSearched;
    dist['manual'] = (dist['manual'] ?? 0) + r.manual;
    dist['unmatched'] = (dist['unmatched'] ?? 0) + r.unmatched;
  }

  return {
    totalManifests: reports.length,
    totalNames,
    avgAutoRate: Math.round((sumAutoRate / reports.length) * 100) / 100,
    avgConfidence: Math.round((sumConfidence / reports.length) * 100) / 100,
    avgOverrideRate: Math.round((sumOverride / reports.length) * 100) / 100,
    pathDistribution: dist,
  };
}
