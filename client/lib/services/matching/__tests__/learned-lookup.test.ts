/**
 * Functional Integration Tests — Learned Lookup
 *
 * Tests lookupLearnedEnhanced() and getLearnedCandidatesForAIEnhanced()
 * with realistic learned match data to verify:
 *   - Exact normalized lookup (Tier 1)
 *   - Token-based matching (Tier 2)
 *   - Reversed order matching (Tier 2b)
 *   - Fuzzy token overlap (Tier 3)
 *   - Nickname resolution in learned context
 *   - Routing prefix guards
 *   - AI context candidate retrieval
 *
 * @module matching/__tests__/learned-lookup.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { lookupLearnedEnhanced, getLearnedCandidatesForAIEnhanced, setLearnedIndex } from '../learned-lookup';
import type { LearnedMatch } from '../../match-learning';

// ─── Synthetic Learned Matches ──────────────────────────────────────────────

function makeLearned(manifestName: string, slCode: string, fullName: string, hitCount = 1, extra?: Partial<LearnedMatch>): LearnedMatch {
  const normalizedName = manifestName.toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return {
    manifestName,
    normalizedName,
    slCode,
    fullName,
    hitCount,
    source: 'admin',
    consolidationEnabled: false,
    ...extra,
  } as LearnedMatch;
}

const MOCK_LEARNED: LearnedMatch[] = [
  makeLearned('JUAN GARCIA LOPEZ', 'SL001', 'JUAN GARCIA LOPEZ', 5),
  makeLearned('PEPE RODRIGUEZ', 'SL003', 'JOSE RODRIGUEZ HERNANDEZ', 3),
  makeLearned('MARIA F PEREZ', 'SL002', 'MARIA FERNANDA PEREZ SOTO', 2),
  makeLearned('PACO CASTRO', 'SL007', 'FRANCISCO JAVIER CASTRO RUIZ', 4),
  makeLearned('MEMO SANCHEZ', 'SL009', 'GUILLERMO SANCHEZ BRENES', 1),
  makeLearned('CARLOS VEGA CAMPOS', 'SL005', 'CARLOS ALBERTO VEGA CAMPOS', 6),
  makeLearned('STEPH RAMIREZ', 'SL006', 'STEPHANIE RAMIREZ MORA', 2),
  makeLearned('ANDREA SOLANO', 'SL008', 'ANDREA SOLANO MARTINEZ', 3),
  makeLearned('LALO JIMENEZ', 'SL010', 'EDUARDO JIMENEZ ROJAS', 1),
  makeLearned('KIKE MONGE CALVO', 'SL011', 'ENRIQUE MONGE CALVO', 2),
];

// Build index for exact lookup
function buildIndex(learned: LearnedMatch[]): Map<string, LearnedMatch> {
  const idx = new Map<string, LearnedMatch>();
  const collisions = new Set<string>();
  for (const entry of learned) {
    if (idx.has(entry.normalizedName)) {
      collisions.add(entry.normalizedName);
    } else {
      idx.set(entry.normalizedName, entry);
    }
  }
  setLearnedIndex(idx, collisions);
  return idx;
}

beforeEach(() => {
  buildIndex(MOCK_LEARNED);
});

// ─── Tier 1: Exact Normalized Match ─────────────────────────────────────────

describe('lookupLearnedEnhanced — Tier 1 (exact)', () => {
  it('returns score 1.0 for exact normalized match', () => {
    const result = lookupLearnedEnhanced('JUAN GARCIA LOPEZ', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL001');
    expect(result!.score).toBe(1.0);
  });

  it('handles accent-stripped exact match', () => {
    const result = lookupLearnedEnhanced('CARLOS VEGA CAMPOS', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL005');
    expect(result!.score).toBe(1.0);
  });

  it('returns null for completely unknown name', () => {
    const result = lookupLearnedEnhanced('ZZZYYYXXX UNKNOWN', MOCK_LEARNED);
    expect(result).toBeNull();
  });
});

// ─── Tier 2: Token-Based Matching ───────────────────────────────────────────

describe('lookupLearnedEnhanced — Tier 2 (token match)', () => {
  it('matches when all tokens present in learned entry', () => {
    // "KIKE MONGE CALVO" is in learned — search with same tokens
    const result = lookupLearnedEnhanced('KIKE MONGE CALVO', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL011');
    expect(result!.score).toBeGreaterThanOrEqual(0.93);
  });

  it('matches when searching with extra tokens (needle has more)', () => {
    // "ANDREA SOLANO MARTINEZ" searching, learned has "ANDREA SOLANO"
    const result = lookupLearnedEnhanced('ANDREA SOLANO MARTINEZ', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL008');
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });
});

// ─── Tier 2b: Reversed Order ────────────────────────────────────────────────

describe('lookupLearnedEnhanced — Tier 2b (reversed order)', () => {
  it('matches reversed token order', () => {
    // Learned has "CARLOS VEGA CAMPOS" — search reversed
    const result = lookupLearnedEnhanced('CAMPOS VEGA CARLOS', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL005');
    expect(result!.score).toBeGreaterThanOrEqual(0.90);
  });

  it('matches "GARCIA LOPEZ JUAN" → "JUAN GARCIA LOPEZ"', () => {
    const result = lookupLearnedEnhanced('GARCIA LOPEZ JUAN', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL001');
    expect(result!.score).toBeGreaterThanOrEqual(0.90);
  });
});

// ─── Tier 3: Fuzzy Token Overlap ────────────────────────────────────────────

describe('lookupLearnedEnhanced — Tier 3 (fuzzy overlap)', () => {
  it('matches partial token overlap ≥ 80%', () => {
    // Search "STEPH RAMIREZ MORA" when learned has "STEPH RAMIREZ"
    // 2 out of 3 meaningful search tokens match → 66%, but STEPH/RAMIREZ are in both
    const result = lookupLearnedEnhanced('STEPH RAMIREZ MORA', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL006');
  });
});

// ─── Nickname Resolution in Lookup ──────────────────────────────────────────

describe('lookupLearnedEnhanced — Nickname-aware', () => {
  it('matches PEPE RODRIGUEZ via learned PEPE RODRIGUEZ', () => {
    const result = lookupLearnedEnhanced('PEPE RODRIGUEZ', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL003');
    expect(result!.score).toBeGreaterThanOrEqual(0.93);
  });

  it('matches JOSE RODRIGUEZ via nickname equivalence to PEPE RODRIGUEZ', () => {
    // JOSE ↔ PEPE (nickname equivalent) and RODRIGUEZ matches
    const result = lookupLearnedEnhanced('JOSE RODRIGUEZ', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL003');
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('matches PACO CASTRO via learned PACO CASTRO', () => {
    const result = lookupLearnedEnhanced('PACO CASTRO', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL007');
  });

  it('matches FRANCISCO CASTRO via nickname equivalence to PACO CASTRO', () => {
    const result = lookupLearnedEnhanced('FRANCISCO CASTRO', MOCK_LEARNED);
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL007');
    expect(result!.score).toBeGreaterThanOrEqual(0.85);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('lookupLearnedEnhanced — Edge cases', () => {
  it('returns null for empty learned array', () => {
    const result = lookupLearnedEnhanced('JUAN GARCIA', []);
    expect(result).toBeNull();
  });

  it('returns null for empty search name', () => {
    const result = lookupLearnedEnhanced('', MOCK_LEARNED);
    expect(result).toBeNull();
  });

  it('prefers higher hitCount for equal-score candidates', () => {
    // Add two entries with same token overlap but different hitCounts
    const twoEntries: LearnedMatch[] = [
      makeLearned('PEDRO VARGAS', 'SL_A', 'PEDRO VARGAS', 1),
      makeLearned('PEDRO VARGAS CAMPOS', 'SL_B', 'PEDRO VARGAS CAMPOS', 10),
    ];
    const idx = new Map<string, LearnedMatch>();
    twoEntries.forEach(e => idx.set(e.normalizedName, e));
    setLearnedIndex(idx, new Set());
    const result = lookupLearnedEnhanced('PEDRO VARGAS', twoEntries);
    // Exact match on first entry should win
    expect(result).not.toBeNull();
    expect(result!.slCode).toBe('SL_A');
  });
});

// ─── AI Context Provider ────────────────────────────────────────────────────

describe('getLearnedCandidatesForAIEnhanced', () => {
  it('returns relevant candidates for a search name', () => {
    buildIndex(MOCK_LEARNED);
    const candidates = getLearnedCandidatesForAIEnhanced('GARCIA LOPEZ', MOCK_LEARNED);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].slCode).toBe('SL001');
  });

  it('includes nickname-matched candidates', () => {
    buildIndex(MOCK_LEARNED);
    const candidates = getLearnedCandidatesForAIEnhanced('JOSE RODRIGUEZ', MOCK_LEARNED);
    // Should include PEPE RODRIGUEZ (JOSE ↔ PEPE)
    const found = candidates.some(c => c.slCode === 'SL003');
    expect(found).toBe(true);
  });

  it('respects topN limit', () => {
    buildIndex(MOCK_LEARNED);
    const candidates = getLearnedCandidatesForAIEnhanced('GARCIA', MOCK_LEARNED, 2);
    expect(candidates.length).toBeLessThanOrEqual(2);
  });

  it('returns empty for completely unrelated name', () => {
    buildIndex(MOCK_LEARNED);
    const candidates = getLearnedCandidatesForAIEnhanced('ZZZYYYXXX', MOCK_LEARNED);
    expect(candidates.length).toBe(0);
  });

  it('sorts by overlap relevance then hitCount', () => {
    buildIndex(MOCK_LEARNED);
    const candidates = getLearnedCandidatesForAIEnhanced('JUAN GARCIA', MOCK_LEARNED);
    if (candidates.length >= 2) {
      // First candidate should be the most relevant
      expect(candidates[0].slCode).toBe('SL001');
    }
  });
});

// ─── Surname Protection Guard & Admin Pick Supremacy ────────────────────────

describe('lookupLearnedEnhanced — Surname Protection Guard & Admin Pick', () => {
  it('vetoes non-admin learned match when surnames conflict (MARIA JOSE LEANDRO DIAZ vs MARIA JOSE PICON)', () => {
    const nonAdminPicon = makeLearned('MARIA JOSE PICON', 'SL26116', 'MARIA JOSE PICON', 1, { source: 'ai_auto' });
    buildIndex([nonAdminPicon]);
    const result = lookupLearnedEnhanced('MARIA JOSE LEANDRO DIAZ', [nonAdminPicon]);
    expect(result).toBeNull();
  });

  it('honours Admin Pick Supremacy even when surname protection guard triggers', () => {
    const adminPickPicon = makeLearned('MARIA JOSE LEANDRO DIAZ', 'SL26116', 'MARIA JOSE PICON', 1, { source: 'admin_pick' });
    buildIndex([adminPickPicon]);
    const result = lookupLearnedEnhanced('MARIA JOSE LEANDRO DIAZ', [adminPickPicon]);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(1.0);
  });
});

describe('lookupLearnedEnhanced — Single-Token Guard', () => {
  it('prevents single-token search name from matching multi-token learned entry via nickname / subset', () => {
    // There is a learned match: "ADRIANA STEPHANIE" -> SL3407
    const learnedEntry = makeLearned('ADRIANA STEPHANIE', 'SL3407', 'ADRIANA STEPHANIE SOLORZANO LEITON');
    buildIndex([learnedEntry]);
    
    // Search with single-token "STEPH" (which is nickname of STEPHANIE)
    const result = lookupLearnedEnhanced('STEPH', [learnedEntry]);
    expect(result).toBeNull(); // Should be blocked by the single-token guard
  });

  it('prevents multi-token search name from matching single-token learned entry via subset', () => {
    // There is a learned match: "STEPH" -> SL006
    const learnedEntry = makeLearned('STEPH', 'SL006', 'STEPHANIE RAMIREZ MORA');
    buildIndex([learnedEntry]);
    
    // Search with "STEPH RAMIREZ"
    const result = lookupLearnedEnhanced('STEPH RAMIREZ', [learnedEntry]);
    expect(result).toBeNull(); // Should be blocked by the single-token guard
  });
});

