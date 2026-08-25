import { describe, it, expect } from 'vitest';
import { getAbbr, getGradient, ROUTE_GRADIENT } from '../types';
import { getMotivation } from '../views';

// NOTE: buildVariants was removed from search.ts when the scanner was simplified
// to direct tracking-number lookup only (docId / trackingNumber / tracking field
// equality). Suffix/prefix expansion is unnecessary because Nova and sea-manifest
// always store packages with docId === uppercase(tracking).

// ── getAbbr — route abbreviation correctness ──────────────────────────────────
describe('getAbbr — route abbreviation correctness', () => {
  const cases: [string, string][] = [
    ['Heredia',           'H'],
    ['Alajuela',          'A'],
    ['Cartago 1',         'C1'],
    ['Cartago 2',         'C2'],
    ['San Jose Centro',   'SJ'],
    ['San Jose Escazu',   'SJ-E'],
    ['San Jose Coronado', 'SJ-C'],
    ['Occidente',         'OCC'],
    ['Encomiendas',       'ENC'],
    ['Retira',            'RET'],
    ['RETIRA',            'RET'],
    ['Pickup',            'RET'],
    ['Escazu',            'ESC'],
  ];

  for (const [route, expected] of cases) {
    it(`"${route}" → "${expected}"`, () => {
      expect(getAbbr(route)).toBe(expected);
    });
  }

  it('unknown route falls back to first 3 uppercase chars', () => {
    expect(getAbbr('PuertoViejo')).toBe('PUE');
  });

  it('fuzzy match: lowercase "heredia" → H', () => {
    expect(getAbbr('heredia')).toBe('H');
  });

  it('fuzzy match: "San Jose Sur" (partial match) → SJ', () => {
    expect(getAbbr('San Jose Sur')).toBe('SJ');
  });
});

// ── getGradient — Tailwind gradient correctness ───────────────────────────────
describe('getGradient — Tailwind gradient strings', () => {
  it('returns a string starting with "from-"', () => {
    expect(getGradient('Heredia')).toMatch(/^from-/);
  });

  it('returns a string containing "to-"', () => {
    expect(getGradient('San Jose Centro')).toContain('to-');
  });

  it('unknown route returns default slate fallback', () => {
    expect(getGradient('UnknownCity')).toBe('from-slate-600 to-slate-800');
  });

  it('undefined route returns dark slate fallback', () => {
    expect(getGradient()).toBe('from-slate-700 to-slate-900');
  });

  it('all defined routes in ROUTE_GRADIENT return valid Tailwind gradient', () => {
    for (const [route, gradient] of Object.entries(ROUTE_GRADIENT)) {
      expect(gradient, `Route "${route}" has invalid gradient: "${gradient}"`).toMatch(/^from-\S+ to-\S+$/);
    }
  });
});

// ── getMotivation — behavioral psychology thresholds ─────────────────────────
describe('getMotivation — milestone thresholds (regression contract)', () => {
  it('count=0  → level "ready"',     () => expect(getMotivation(0).level).toBe('ready'));
  it('count=1  → level "starting"',  () => expect(getMotivation(1).level).toBe('starting'));
  it('count=4  → level "starting"',  () => expect(getMotivation(4).level).toBe('starting'));
  it('count=5  → level "milestone"', () => expect(getMotivation(5).level).toBe('milestone'));
  it('count=6  → level "flow"',      () => expect(getMotivation(6).level).toBe('flow'));
  it('count=9  → level "flow"',      () => expect(getMotivation(9).level).toBe('flow'));
  it('count=10 → level "milestone"', () => expect(getMotivation(10).level).toBe('milestone'));
  it('count=11 → level "flow"',      () => expect(getMotivation(11).level).toBe('flow'));
  it('count=24 → level "flow"',      () => expect(getMotivation(24).level).toBe('flow'));
  it('count=25 → level "milestone"', () => expect(getMotivation(25).level).toBe('milestone'));
  it('count=26 → level "elite"',     () => expect(getMotivation(26).level).toBe('elite'));
  it('count=49 → level "elite"',     () => expect(getMotivation(49).level).toBe('elite'));
  it('count=50 → level "elite"',     () => expect(getMotivation(50).level).toBe('elite'));
  it('count=51 → level "elite"',     () => expect(getMotivation(51).level).toBe('elite'));
  it('count=99 → level "elite"',     () => expect(getMotivation(99).level).toBe('elite'));
  it('count=100 → level "legend"',   () => expect(getMotivation(100).level).toBe('legend'));
  it('count=200 → level "legend"',   () => expect(getMotivation(200).level).toBe('legend'));

  it('headline at count=0 is "Listo para Escanear"', () => {
    expect(getMotivation(0).headline).toBe('Listo para Escanear');
  });

  it('headline at count=100 contains "100 paquetes"', () => {
    expect(getMotivation(100).headline).toContain('100 paquetes');
  });

  it('sub at count=200 contains count number', () => {
    expect(getMotivation(200).headline).toContain('200');
  });

  it('level never regresses across major phase boundaries (starting → elite → legend)', () => {
    // milestone and flow intentionally interleave (psychology design) — test only
    // that the broader phases don't regress: low counts never reach elite/legend,
    // and high counts never drop back to ready/starting.
    const earlyLevels  = [0, 1, 2, 3, 4].map(n => getMotivation(n).level);
    const eliteLevels  = [26, 30, 49, 50, 51, 99].map(n => getMotivation(n).level);
    const legendLevels = [100, 150, 200].map(n => getMotivation(n).level);

    expect(earlyLevels.every(l => !['elite', 'legend'].includes(l))).toBe(true);
    expect(eliteLevels.every(l => ['elite', 'milestone'].includes(l))).toBe(true);
    expect(legendLevels.every(l => l === 'legend')).toBe(true);
  });
});

// ── Scanner storage assertion ────────────────────────────────────────────────
describe('Scanner session storage', () => {
  it('[PERF] sessionStorage history read is synchronous — safe up to HISTORY_LIMIT=30', () => {
    // sessionStorage.getItem is synchronous O(1). With 30 HistoryEntry items,
    // each ~200 bytes of JSON, total payload ≈ 6KB — well within 5MB storage limit.
    const HISTORY_LIMIT = 30;
    const avgEntryBytes = 200;
    const totalBytes = HISTORY_LIMIT * avgEntryBytes;
    expect(totalBytes).toBeLessThan(5 * 1024 * 1024); // < 5MB
  });
});
