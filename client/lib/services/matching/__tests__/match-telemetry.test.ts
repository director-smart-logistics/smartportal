/**
 * Unit tests for Match Telemetry.
 *
 * Tests session lifecycle, decision recording, and report aggregation.
 * Firestore flush is NOT tested (requires integration test).
 */
import { describe, it, expect } from 'vitest';
import { createTelemetrySession, recordMatchDecision, aggregateReports, type TelemetryReport, type TelemetrySession } from '../match-telemetry';

describe('createTelemetrySession', () => {
  it('creates a session with empty decisions', () => {
    const session = createTelemetrySession('manifest-123');
    expect(session.manifestId).toBe('manifest-123');
    expect(session.decisions).toHaveLength(0);
    expect(session.startedAt).toBeGreaterThan(0);
  });
});

describe('recordMatchDecision', () => {
  it('adds a decision to the session', () => {
    const session = createTelemetrySession('test-manifest');
    recordMatchDecision(session, 'JUAN GARCIA', 'auto-accept', 0.95, 5);
    expect(session.decisions).toHaveLength(1);
    expect(session.decisions[0].manifestName).toBe('JUAN GARCIA');
    expect(session.decisions[0].decisionPath).toBe('auto-accept');
    expect(session.decisions[0].confidence).toBe(0.95);
    expect(session.decisions[0].candidateCount).toBe(5);
    expect(session.decisions[0].wasOverridden).toBe(false);
  });

  it('records override flag', () => {
    const session = createTelemetrySession('test-manifest');
    recordMatchDecision(session, 'PEPE GARCIA', 'ai-disambiguate', 0.75, 3, true);
    expect(session.decisions[0].wasOverridden).toBe(true);
  });

  it('accumulates multiple decisions', () => {
    const session = createTelemetrySession('test-manifest');
    recordMatchDecision(session, 'NAME1', 'auto-accept', 0.95, 5);
    recordMatchDecision(session, 'NAME2', 'learned', 0.98, 1);
    recordMatchDecision(session, 'NAME3', 'unmatched', 0.20, 0);
    expect(session.decisions).toHaveLength(3);
  });

  it('rounds confidence to 2 decimal places', () => {
    const session = createTelemetrySession('test-manifest');
    recordMatchDecision(session, 'TEST', 'auto-accept', 0.957382, 1);
    expect(session.decisions[0].confidence).toBe(0.96);
  });
});

describe('aggregateReports', () => {
  const makeReport = (overrides: Partial<TelemetryReport>): TelemetryReport => ({
    manifestId: 'test',
    timestamp: null as any,
    totalNames: 10,
    exactCustomerMatches: 0,
    autoAccepted: 5,
    learnedMatches: 2,
    aiResolved: 1,
    aiSearched: 1,
    manual: 1,
    unmatched: 0,
    avgConfidence: 0.85,
    overrideRate: 0.10,
    autoRate: 0.80,
    durationMs: 5000,
    lowestConfidenceNames: [],
    ...overrides,
  });

  it('returns zero metrics for empty array', () => {
    const result = aggregateReports([]);
    expect(result.totalManifests).toBe(0);
    expect(result.totalNames).toBe(0);
    expect(result.avgAutoRate).toBe(0);
  });

  it('aggregates single report correctly', () => {
    const result = aggregateReports([makeReport({})]);
    expect(result.totalManifests).toBe(1);
    expect(result.totalNames).toBe(10);
    expect(result.avgAutoRate).toBe(0.80);
    expect(result.avgConfidence).toBe(0.85);
  });

  it('averages rates across multiple reports', () => {
    const reports = [
      makeReport({ autoRate: 0.80, avgConfidence: 0.90 }),
      makeReport({ autoRate: 0.60, avgConfidence: 0.70 }),
    ];
    const result = aggregateReports(reports);
    expect(result.totalManifests).toBe(2);
    expect(result.avgAutoRate).toBe(0.70); // (0.80 + 0.60) / 2
    expect(result.avgConfidence).toBe(0.80); // (0.90 + 0.70) / 2
  });

  it('sums path distribution across reports', () => {
    const reports = [
      makeReport({ autoAccepted: 5, learnedMatches: 2, manual: 1 }),
      makeReport({ autoAccepted: 3, learnedMatches: 4, manual: 2 }),
    ];
    const result = aggregateReports(reports);
    expect(result.pathDistribution['auto-accept']).toBe(8);
    expect(result.pathDistribution['learned']).toBe(6);
    expect(result.pathDistribution['manual']).toBe(3);
  });
});
