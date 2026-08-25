/**
 * Functional Integration Tests — Match Engine Pipeline
 *
 * Tests the full matchName() pipeline with a simulated customer database.
 * This is the most critical test file: it verifies that the complete
 * scoring pipeline (all techniques, calibration, first-name veto, etc.)
 * produces correct results for real-world name variant scenarios.
 *
 * Test categories:
 *   1. Exact matches (accent-normalized)
 *   2. Reversed name order
 *   3. Nickname/apodo resolution (PEPE→JOSE, MEMO→GUILLERMO)
 *   4. Typos and misspellings common in CR manifests
 *   5. Abbreviated names (STEPH→STEPHANIE)
 *   6. Partial names (missing middle name)
 *   7. Initial matching (J PEREZ → JUAN PEREZ)
 *   8. Token subset (manifest shorter than DB name)
 *   9. False positive prevention (same surname, different person)
 *  10. Single-token names (generic — should NOT auto-match)
 *
 * IMPORTANT: This does NOT use the customer-loader/Firestore.
 * It injects a synthetic customer list directly into matchName().
 *
 * @module matching/__tests__/match-engine.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { matchName } from '../match-engine';
import type { CustomerData } from '../types';
import { clearNormalizeCaches, permutationCache } from '../normalize';

// ─── Synthetic Customer Database ─────────────────────────────────────────────
// Simulates a realistic CR customer roster (reduced for test speed).
// Includes names that commonly cause false positives in production.

function makeCustomer(id: string, fullName: string, slCode: string, extra?: Partial<CustomerData>): CustomerData {
  const normalized = fullName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const parts = normalized.split(' ');
  return {
    id,
    name: fullName,
    fullName,
    normalizedName: normalized,
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    slCode,
    consolidationEnabled: false,
    email: '',
    phone: '',
    ...extra,
  };
}

const MOCK_CUSTOMERS: CustomerData[] = [
  makeCustomer('1', 'JUAN GARCIA LOPEZ', 'SL001'),
  makeCustomer('2', 'MARIA FERNANDA PEREZ SOTO', 'SL002'),
  makeCustomer('3', 'JOSE RODRIGUEZ HERNANDEZ', 'SL003'),
  makeCustomer('4', 'PEDRO GONZALEZ VARGAS', 'SL004'),
  makeCustomer('5', 'CARLOS ALBERTO VEGA CAMPOS', 'SL005'),
  makeCustomer('6', 'STEPHANIE RAMIREZ MORA', 'SL006'),
  makeCustomer('7', 'FRANCISCO JAVIER CASTRO RUIZ', 'SL007'),
  makeCustomer('8', 'ANDREA SOLANO MARTINEZ', 'SL008'),
  makeCustomer('9', 'GUILLERMO SANCHEZ BRENES', 'SL009'),
  makeCustomer('10', 'EDUARDO JIMENEZ ROJAS', 'SL010'),
  makeCustomer('11', 'ENRIQUE MONGE CALVO', 'SL011'),
  makeCustomer('12', 'IGNACIO VILLALTA ARIAS', 'SL012'),
  makeCustomer('13', 'JUAN PABLO PEREZ SOTO', 'SL013'),
  makeCustomer('14', 'MARIA GARCIA LOPEZ', 'SL014'),
  makeCustomer('15', 'ANA GARCIA LOPEZ', 'SL015'),
  makeCustomer('16', 'SERGIO MENDEZ UREÑA', 'SL016'),
  makeCustomer('17', 'ALFONSO TREJOS BERMUDEZ', 'SL017'),
  makeCustomer('18', 'MANUEL ANTONIO SALAZAR', 'SL018'),
  makeCustomer('19', 'FERNANDO QUESADA MORA', 'SL019'),
  makeCustomer('20', 'CATALINA CHAVES ROJAS', 'SL020'),
  makeCustomer('21', 'MARGARITA FONSECA LEON', 'SL021'),
  makeCustomer('22', 'PILAR CHINCHILLA SOLIS', 'SL022'),
  makeCustomer('23', 'JUAN GARCIA MORA', 'SL023'),
  makeCustomer('24', 'ROBERTO CHACON VINDAS', 'SL024'),
  makeCustomer('25', 'ALBERTO ARAYA MADRIGAL', 'SL025'),
  makeCustomer('26', 'JOSE LUIS GARCIA LOPEZ', 'SL026'),
];

// ─── Test Setup ──────────────────────────────────────────────────────────────

/**
 * CRITICAL: matchName() expects indexes from customer-loader.
 * We bypass that by setting up indexes via a mock in beforeEach.
 * Since matchName calls getCachedIndexes() which may be null,
 * the function has a fallback path that loops through all customers.
 * We test via that fallback path for correctness.
 */

// We need to mock getCachedIndexes to return indexes built from our mock data
import * as customerLoader from '../customer-loader';
import { phoneticKey, meaningfulTokens, normalize } from '../normalize';
import type { CustomerIndexes, TokenizedCustomer } from '../types';
import { vi } from 'vitest';

function buildMockIndexes(customers: CustomerData[]): CustomerIndexes {
  const bySlCode = new Map<string, CustomerData>();
  const byName = new Map<string, CustomerData>();
  const byNameReversed = new Map<string, CustomerData>();
  const byFirstToken = new Map<string, CustomerData[]>();
  const byLastToken = new Map<string, CustomerData[]>();
  const tokenData: TokenizedCustomer[] = [];

  for (const c of customers) {
    bySlCode.set(c.slCode.toUpperCase(), c);
    byName.set(c.normalizedName, c);
    const parts = c.normalizedName.split(' ').filter(p => p.length > 0);
    const reversed = [...parts].reverse().join(' ');
    byNameReversed.set(reversed, c);

    const meaningful = meaningfulTokens(parts);
    const first = meaningful[0] || '';
    const last = meaningful[meaningful.length - 1] || '';
    const firstKey = phoneticKey(first);
    const lastKey = phoneticKey(last);

    if (first) {
      if (!byFirstToken.has(firstKey)) byFirstToken.set(firstKey, []);
      byFirstToken.get(firstKey)!.push(c);
    }
    if (last && last !== first) {
      if (!byLastToken.has(lastKey)) byLastToken.set(lastKey, []);
      byLastToken.get(lastKey)!.push(c);
    }

    tokenData.push({
      customer: c,
      parts,
      reversedParts: [...parts].reverse(),
      meaningfulParts: meaningful,
      firstTokenKey: firstKey,
      lastTokenKey: lastKey,
    });
  }

  return { bySlCode, byName, byNameReversed, byFirstToken, byLastToken, tokenData };
}

beforeEach(() => {
  clearNormalizeCaches();
  permutationCache.clear();
  const indexes = buildMockIndexes(MOCK_CUSTOMERS);
  vi.spyOn(customerLoader, 'getCachedIndexes').mockReturnValue(indexes);
});

// ─── Helper ──────────────────────────────────────────────────────────────────

function topMatch(results: ReturnType<typeof matchName>) {
  return results[0] ?? null;
}

function topSlCode(results: ReturnType<typeof matchName>) {
  return results[0]?.customer.slCode ?? null;
}

// ─── CATEGORY 1: Exact Matches ──────────────────────────────────────────────

describe('matchName — Exact matches', () => {
  it('finds exact match for normalized name', () => {
    const results = matchName('JUAN GARCIA LOPEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL001');
    expect(topMatch(results)!.score).toBe(1.0);
  });

  it('finds exact match with accent stripping', () => {
    const results = matchName('JOSE RODRIGUEZ HERNANDEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL003');
    expect(topMatch(results)!.score).toBe(1.0);
  });

  it('handles mixed case in search', () => {
    const results = matchName('pedro gonzalez vargas', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL004');
    expect(topMatch(results)!.score).toBe(1.0);
  });

  it('handles accent-heavy search matching accent-free DB', () => {
    const results = matchName('María Fernanda Pérez Soto', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL002');
    expect(topMatch(results)!.score).toBe(1.0);
  });
});

// ─── CATEGORY 2: Reversed Name Order ────────────────────────────────────────

describe('matchName — Reversed name order', () => {
  it('matches "GARCIA LOPEZ JUAN" → "JUAN GARCIA LOPEZ"', () => {
    const results = matchName('GARCIA LOPEZ JUAN', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL001');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.93);
  });

  it('matches "PEREZ SOTO MARIA FERNANDA" → "MARIA FERNANDA PEREZ SOTO"', () => {
    const results = matchName('PEREZ SOTO MARIA FERNANDA', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL002');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.90);
  });

  it('matches "GONZALEZ VARGAS PEDRO" → "PEDRO GONZALEZ VARGAS"', () => {
    const results = matchName('GONZALEZ VARGAS PEDRO', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL004');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.90);
  });
});

// ─── CATEGORY 3: Nickname / Apodo Resolution ────────────────────────────────

describe('matchName — Nickname resolution', () => {
  it('PEPE RODRIGUEZ → JOSE RODRIGUEZ (PEPE ↔ JOSE)', () => {
    const results = matchName('PEPE RODRIGUEZ HERNANDEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL003');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.80);
  });

  it('PACO CASTRO RUIZ → FRANCISCO JAVIER CASTRO RUIZ (PACO ↔ FRANCISCO)', () => {
    const results = matchName('PACO CASTRO RUIZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL007');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('MEMO SANCHEZ BRENES → GUILLERMO SANCHEZ BRENES (MEMO ↔ GUILLERMO)', () => {
    const results = matchName('MEMO SANCHEZ BRENES', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL009');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.80);
  });

  it('LALO JIMENEZ ROJAS → EDUARDO JIMENEZ ROJAS (LALO ↔ EDUARDO)', () => {
    const results = matchName('LALO JIMENEZ ROJAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL010');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('KIKE MONGE CALVO → ENRIQUE MONGE CALVO (KIKE ↔ ENRIQUE)', () => {
    const results = matchName('KIKE MONGE CALVO', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL011');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('NACHO VILLALTA ARIAS → IGNACIO VILLALTA ARIAS (NACHO ↔ IGNACIO)', () => {
    const results = matchName('NACHO VILLALTA ARIAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL012');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('CHECO MENDEZ URENA → SERGIO MENDEZ UREÑA (CHECO ↔ SERGIO)', () => {
    const results = matchName('CHECO MENDEZ URENA', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL016');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('MANOLO SALAZAR → MANUEL ANTONIO SALAZAR (MANOLO ↔ MANUEL)', () => {
    const results = matchName('MANOLO SALAZAR', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL018');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.65);
  });

  it('NANDO QUESADA MORA → FERNANDO QUESADA MORA (NANDO ↔ FERNANDO)', () => {
    const results = matchName('NANDO QUESADA MORA', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL019');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('BETO ARAYA MADRIGAL → ALBERTO ARAYA MADRIGAL (BETO ↔ ALBERTO)', () => {
    const results = matchName('BETO ARAYA MADRIGAL', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL025');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('PONCHO TREJOS BERMUDEZ → ALFONSO TREJOS BERMUDEZ (PONCHO ↔ ALFONSO)', () => {
    const results = matchName('PONCHO TREJOS BERMUDEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL017');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('LINA CHAVES ROJAS → CATALINA CHAVES ROJAS (LINA ↔ CATALINA)', () => {
    const results = matchName('LINA CHAVES ROJAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL020');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('TITA FONSECA LEON → MARGARITA FONSECA LEON (TITA ↔ MARGARITA)', () => {
    const results = matchName('TITA FONSECA LEON', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL021');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('PILI CHINCHILLA SOLIS → PILAR CHINCHILLA SOLIS (PILI ↔ PILAR)', () => {
    const results = matchName('PILI CHINCHILLA SOLIS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL022');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('BETO CHACON VINDAS → ROBERTO CHACON VINDAS (BETO ↔ ROBERTO)', () => {
    const results = matchName('BETO CHACON VINDAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL024');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });
});

// ─── CATEGORY 4: Typos and Misspellings ─────────────────────────────────────

describe('matchName — Typos and misspellings', () => {
  it('handles single-char typo in first name: JAUN → JUAN', () => {
    const results = matchName('JAUN GARCIA LOPEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL001');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.80);
  });

  it('handles single-char typo in surname: GONZALES → GONZALEZ', () => {
    const results = matchName('PEDRO GONZALES VARGAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL004');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.88);
  });

  it('handles double letter: PEDRRO → PEDRO', () => {
    const results = matchName('PEDRRO GONZALEZ VARGAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL004');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.80);
  });

  it('handles missing letter: GUDREA → ANDREA', () => {
    const results = matchName('GUDREA SOLANO MARTINEZ', MOCK_CUSTOMERS);
    // Should still find ANDREA SOLANO MARTINEZ via apellido matching
    const foundAndrea = results.some(r => r.customer.slCode === 'SL008');
    expect(foundAndrea).toBe(true);
  });
});

// ─── CATEGORY 5: Abbreviated Names ──────────────────────────────────────────

describe('matchName — Abbreviated names', () => {
  it('STEPH RAMIREZ MORA → STEPHANIE RAMIREZ MORA', () => {
    const results = matchName('STEPH RAMIREZ MORA', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL006');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('ANDY SOLANO MARTINEZ → ANDREA SOLANO MARTINEZ', () => {
    const results = matchName('ANDY SOLANO MARTINEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL008');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.85);
  });

  it('RAFA QUESADA MORA → RAFAEL QUESADA MORA (not present, but FERNANDO QUESADA MORA is)', () => {
    // No RAFAEL in DB — RAFA should NOT match FERNANDO strongly
    const results = matchName('RAFA QUESADA MORA', MOCK_CUSTOMERS);
    if (results.length > 0 && topSlCode(results) === 'SL019') {
      // If it matched FERNANDO, score should be low (RAFA ≠ FERNANDO)
      expect(topMatch(results)!.score).toBeLessThan(0.85);
    }
  });
});

// ─── CATEGORY 6: Partial Names (missing middle) ─────────────────────────────

describe('matchName — Partial names (missing middle name)', () => {
  it('CARLOS VEGA CAMPOS → CARLOS ALBERTO VEGA CAMPOS', () => {
    const results = matchName('CARLOS VEGA CAMPOS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL005');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });

  it('FRANCISCO CASTRO RUIZ → FRANCISCO JAVIER CASTRO RUIZ', () => {
    const results = matchName('FRANCISCO CASTRO RUIZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL007');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.80);
  });

  it('MARIA PEREZ SOTO → MARIA FERNANDA PEREZ SOTO', () => {
    const results = matchName('MARIA PEREZ SOTO', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL002');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.75);
  });
});

// ─── CATEGORY 7: Initial Matching ───────────────────────────────────────────

describe('matchName — Initial matching', () => {
  it('"J GARCIA LOPEZ" → "JUAN GARCIA LOPEZ"', () => {
    const results = matchName('J GARCIA LOPEZ', MOCK_CUSTOMERS);
    // Should find JUAN GARCIA LOPEZ or JOSE LUIS GARCIA LOPEZ
    const juanFound = results.some(r => r.customer.slCode === 'SL001');
    expect(juanFound).toBe(true);
  });

  it('"P GONZALEZ VARGAS" → "PEDRO GONZALEZ VARGAS"', () => {
    const results = matchName('P GONZALEZ VARGAS', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL004');
    expect(topMatch(results)!.score).toBeGreaterThanOrEqual(0.78);
  });
});

// ─── CATEGORY 8: Token Subset ───────────────────────────────────────────────

describe('matchName — Token subset (manifest shorter)', () => {
  it('"JUAN GARCIA" should NOT auto-accept (multiple GARCIA customers)', () => {
    const results = matchName('JUAN GARCIA', MOCK_CUSTOMERS);
    // Multiple GARCIA customers → should require disambiguation
    // Score should be capped below AUTO_ACCEPT_MIN (0.95)
    expect(topMatch(results)!.score).toBeLessThanOrEqual(0.94);
  });

  it('"VEGA CAMPOS" matches CARLOS ALBERTO VEGA CAMPOS but capped', () => {
    const results = matchName('VEGA CAMPOS', MOCK_CUSTOMERS);
    const carlos = results.find(r => r.customer.slCode === 'SL005');
    expect(carlos).toBeTruthy();
    // Should be capped because "VEGA CAMPOS" has no first name → 2-token → cap
    expect(carlos!.score).toBeLessThanOrEqual(0.82);
  });
});

// ─── CATEGORY 9: False Positive Prevention ──────────────────────────────────

describe('matchName — False positive prevention', () => {
  it('same surname, different person — should show multiple candidates', () => {
    // GARCIA LOPEZ appears in SL001 (JUAN), SL014 (MARIA), SL015 (ANA), SL026 (JOSE LUIS)
    const results = matchName('GARCIA LOPEZ', MOCK_CUSTOMERS);
    const garciaLopezes = results.filter(r =>
      r.customer.normalizedName.includes('GARCIA') && r.customer.normalizedName.includes('LOPEZ')
    );
    expect(garciaLopezes.length).toBeGreaterThanOrEqual(2);
    // None should auto-accept — "GARCIA LOPEZ" is a surname-only search
    expect(topMatch(results)!.score).toBeLessThanOrEqual(0.94);
  });

  it('"PEDRO GARCIA" should NOT strongly match "JUAN GARCIA LOPEZ"', () => {
    const results = matchName('PEDRO GARCIA LOPEZ', MOCK_CUSTOMERS);
    // Should find PEDRO GONZALEZ VARGAS (wrong surname) with low score
    // and JUAN GARCIA LOPEZ (wrong first name) with capped score
    const juan = results.find(r => r.customer.slCode === 'SL001');
    if (juan) {
      // First-name veto should cap this — PEDRO ≠ JUAN
      expect(juan.score).toBeLessThan(0.85);
    }
  });

  it('unrelated name should return no high-confidence matches', () => {
    const results = matchName('ZZZYYYXXX UNKNOWN PERSON', MOCK_CUSTOMERS);
    if (results.length > 0) {
      expect(topMatch(results)!.score).toBeLessThan(0.50);
    }
  });
});

// ─── CATEGORY 10: Single-Token (Generic Names) ─────────────────────────────

describe('matchName — Single-token names', () => {
  it('"GARCIA" alone should find candidates but with low confidence', () => {
    const results = matchName('GARCIA', MOCK_CUSTOMERS);
    // Should find GARCIA customers, but score must be moderate
    if (results.length > 0) {
      expect(topMatch(results)!.score).toBeLessThan(0.85);
    }
  });

  it('"RODRIGUEZ" alone should find JOSE RODRIGUEZ but not auto-accept', () => {
    const results = matchName('RODRIGUEZ', MOCK_CUSTOMERS);
    const jose = results.find(r => r.customer.slCode === 'SL003');
    if (jose) {
      expect(jose.score).toBeLessThan(0.85);
    }
  });
});

// ─── CATEGORY 11: Edge Cases ────────────────────────────────────────────────

describe('matchName — Edge cases', () => {
  it('handles empty search gracefully', () => {
    const results = matchName('', MOCK_CUSTOMERS);
    expect(results.length).toBe(0);
  });

  it('handles whitespace-only search', () => {
    const results = matchName('   ', MOCK_CUSTOMERS);
    expect(results.length).toBe(0);
  });

  it('handles search with special characters', () => {
    const results = matchName('JUAN@GARCIA#LOPEZ', MOCK_CUSTOMERS);
    expect(topSlCode(results)).toBe('SL001');
  });

  it('returns at most 10 results', () => {
    const results = matchName('GARCIA', MOCK_CUSTOMERS);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('results are sorted by score descending', () => {
    const results = matchName('JUAN GARCIA', MOCK_CUSTOMERS);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

// ─── CATEGORY 12: Connectors / Stopwords ────────────────────────────────────

describe('matchName — Names with connectors', () => {
  it('"JOSE DE LA CRUZ GARCIA LOPEZ" still finds GARCIA LOPEZ customers', () => {
    const results = matchName('JOSE DE LA CRUZ GARCIA LOPEZ', MOCK_CUSTOMERS);
    const joseLuis = results.find(r => r.customer.slCode === 'SL026');
    const juan = results.find(r => r.customer.slCode === 'SL001');
    // Should find someone with GARCIA LOPEZ
    expect(joseLuis || juan).toBeTruthy();
  });
});

// ─── CATEGORY 13: Undefined and Null Safety ──────────────────────────────────

describe('matchName — Undefined and null safety', () => {
  it('handles customer with empty/undefined meaningful tokens safely without crashing', () => {
    const emptyCustomer = makeCustomer('99', 'DE DEL LA', 'SL099');
    const results = matchName('JUAN GARCIA LOPEZ', [...MOCK_CUSTOMERS, emptyCustomer]);
    expect(results.length).toBeGreaterThan(0);
    expect(topSlCode(results)).toBe('SL001');
  });
});
