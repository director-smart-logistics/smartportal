/**
 * Match Learning Service — Unit Tests
 *
 * Tests learned-match lookup logic (pure functions, no Firebase needed).
 * Firestore functions are mocked for the persistence-layer tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase/config', () => ({ db: {}, sp2App: {} }));

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => 'col-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'feedback-id' }),
  doc:             vi.fn(() => 'doc-ref'),
  getDoc:          vi.fn().mockResolvedValue({ exists: () => false }),
  setDoc:          vi.fn().mockResolvedValue(undefined),
  updateDoc:       vi.fn().mockResolvedValue(undefined),
  getDocs:         vi.fn().mockResolvedValue({ docs: [] }),
  query:           vi.fn(),
  where:           vi.fn(),
  orderBy:         vi.fn(),
  limit:           vi.fn(),
  serverTimestamp: vi.fn(() => 'mock-ts'),
  increment:       vi.fn((n: number) => n),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

import type { LearnedMatch } from '.././match-learning';

function makeLearnedMatch(overrides: Partial<LearnedMatch> = {}): LearnedMatch {
  return {
    manifestName:         'JUAN PEREZ',
    normalizedName:       'JUAN PEREZ',
    slCode:               'SL-001',
    fullName:             'JUAN ALBERTO PEREZ MORA',
    ruta:                 'RUTA-A',
    consolidationEnabled: false,
    hitCount:             5,
    score:                1.0,
    ...overrides,
  };
}

// ── lookupLearned ─────────────────────────────────────────────────────────────

describe('lookupLearned', () => {
  it('returns null for empty learned array', async () => {
    const { lookupLearned } = await import('.././match-learning');
    expect(lookupLearned('JUAN PEREZ', [])).toBeNull();
  });

  it('returns exact match when name matches exactly', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({ manifestName: 'JUAN PEREZ' })];
    const result = lookupLearned('JUAN PEREZ', learned);
    expect(result).not.toBeNull();
    expect(result?.slCode).toBe('SL-001');
  });

  it('is case-insensitive', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({ manifestName: 'JUAN PEREZ', normalizedName: 'JUAN PEREZ' })];
    const result = lookupLearned('juan perez', learned);
    expect(result).not.toBeNull();
  });

  it('returns null when no learned match exists for given name', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({ manifestName: 'MARIA GONZALEZ' })];
    const result = lookupLearned('PEDRO ALVARADO', learned);
    expect(result).toBeNull();
  });

  it('returns token-based match when all tokens present in both directions', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({ manifestName: 'PEREZ JUAN', normalizedName: 'PEREZ JUAN' })];
    // Token match: both 'PEREZ' and 'JUAN' are present in 'JUAN PEREZ'
    const result = lookupLearned('JUAN PEREZ', learned);
    expect(result).not.toBeNull();
  });

  // BUG-ML5 regression — city/routing-prefix guard
  it('BUG-ML5: does NOT match "ALAJUELA FRANCISCO MEJIA" against learned "FRANCISCO MEJIA"', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({
      manifestName: 'FRANCISCO MEJIA',
      normalizedName: 'FRANCISCO MEJIA',
      slCode: 'SL-999',
    })];
    // "ALAJUELA" is a routing prefix — allHayInNeedle would fire without the guard
    const result = lookupLearned('ALAJUELA FRANCISCO MEJIA', learned);
    expect(result).toBeNull();
  });

  it('BUG-ML5: does NOT match "HEREDIA SONIA VALVERDE" against learned "SONIA VALVERDE"', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({
      manifestName: 'SONIA VALVERDE',
      normalizedName: 'SONIA VALVERDE',
      slCode: 'SL-888',
    })];
    const result = lookupLearned('HEREDIA SONIA VALVERDE', learned);
    expect(result).toBeNull();
  });

  it('BUG-ML5: does NOT match "BB PEDRO LOPEZ" against learned "PEDRO LOPEZ"', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({
      manifestName: 'PEDRO LOPEZ',
      normalizedName: 'PEDRO LOPEZ',
      slCode: 'SL-777',
    })];
    const result = lookupLearned('BB PEDRO LOPEZ', learned);
    expect(result).toBeNull();
  });

  it('BUG-ML5: still matches exact same name without routing prefix', async () => {
    const { lookupLearned } = await import('.././match-learning');
    const learned = [makeLearnedMatch({
      manifestName: 'FRANCISCO MEJIA',
      normalizedName: 'FRANCISCO MEJIA',
      slCode: 'SL-999',
    })];
    // Same name without prefix — must still match
    const result = lookupLearned('FRANCISCO MEJIA', learned);
    expect(result).not.toBeNull();
    expect(result?.slCode).toBe('SL-999');
  });
});

// ── hasRoutingPrefix ──────────────────────────────────────────────────────────

describe('hasRoutingPrefix', () => {
  it('returns true for known CR city prefixes', async () => {
    const { hasRoutingPrefix } = await import('.././match-learning');
    expect(hasRoutingPrefix('ALAJUELA FRANCISCO MEJIA')).toBe(true);
    expect(hasRoutingPrefix('HEREDIA DAYRA CHAVEZ')).toBe(true);
    expect(hasRoutingPrefix('CARTAGO JOSE SALAS')).toBe(true);
    expect(hasRoutingPrefix('BB SONIA VEGA')).toBe(true);
  });

  it('returns false for regular customer names', async () => {
    const { hasRoutingPrefix } = await import('.././match-learning');
    expect(hasRoutingPrefix('FRANCISCO MEJIA ZUNIGA')).toBe(false);
    expect(hasRoutingPrefix('MARIA LOPEZ')).toBe(false);
    expect(hasRoutingPrefix('SL1234 JUAN PEREZ')).toBe(false);
  });
});

// ── getLearnedCandidatesForAI ─────────────────────────────────────────────────

describe('getLearnedCandidatesForAI', () => {
  it('returns empty array for empty learned list', async () => {
    const { getLearnedCandidatesForAI } = await import('.././match-learning');
    expect(getLearnedCandidatesForAI('JUAN PEREZ', [])).toHaveLength(0);
  });

  it('returns all matching candidates (preserves input order, no sort)', async () => {
    const { getLearnedCandidatesForAI } = await import('.././match-learning');
    const learned = [
      makeLearnedMatch({ manifestName: 'JUAN P',   normalizedName: 'JUAN P',   slCode: 'SL-001', hitCount: 2 }),
      makeLearnedMatch({ manifestName: 'JUAN PE',  normalizedName: 'JUAN PE',  slCode: 'SL-002', hitCount: 10 }),
      makeLearnedMatch({ manifestName: 'JUAN PER', normalizedName: 'JUAN PER', slCode: 'SL-003', hitCount: 5 }),
    ];
    const results = getLearnedCandidatesForAI('JUAN', learned, 10);
    // All three share 'JUAN' token — all should be included
    expect(results.length).toBe(3);
    // Each result must have the mapped shape
    results.forEach(r => {
      expect(r).toHaveProperty('manifestName');
      expect(r).toHaveProperty('slCode');
      expect(r).toHaveProperty('confirmedTimes');
    });
  });

  it('respects topN limit', async () => {
    const { getLearnedCandidatesForAI } = await import('.././match-learning');
    const learned = Array.from({ length: 10 }, (_, i) =>
      makeLearnedMatch({ manifestName: `JUAN ${i}`, normalizedName: `JUAN ${i}`, slCode: `SL-00${i}`, hitCount: i })
    );
    const results = getLearnedCandidatesForAI('JUAN', learned, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ── saveMatchFeedback ─────────────────────────────────────────────────────────

describe('saveMatchFeedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls Firestore without throwing', async () => {
    const { saveMatchFeedback } = await import('.././match-learning');
    await expect(
      saveMatchFeedback({
        manifestName:         'JUAN PEREZ',
        slCode:               'SL-001',
        fullName:             'JUAN ALBERTO PEREZ',
        ruta:                 'RUTA-A',
        consolidationEnabled: false,
        source:               'admin_pick',
      })
    ).resolves.not.toThrow();
  });
});
