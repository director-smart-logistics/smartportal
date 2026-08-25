/**
 * route-colors.spec.ts
 *
 * Locks the route-color contract that drives table row colours, badges, and
 * the Nova legend. Adding a new route to `ROUTE_COLORS` MUST come with a
 * matching test in `invoice-reassign.spec.ts` (`ALL_SYSTEM_ROUTES`) — these
 * suites are intentionally redundant so a route can never be added in one
 * place and forgotten in the other.
 */

import { describe, it, expect } from 'vitest';
import { ROUTE_COLORS, getRouteColor } from '.././route-colors';

describe('ROUTE_COLORS map', () => {
  it('exposes every documented route name as a key', () => {
    const expected = [
      'San Jose Centro', 'San Jose Escazu', 'San Jose Coronado',
      'Cartago 1', 'Cartago 2', 'Encomiendas', 'Occidente',
      'Alajuela', 'Heredia', 'Retira', 'Desconocida',
    ];
    for (const name of expected) {
      expect(ROUTE_COLORS, `missing route ${name}`).toHaveProperty(name);
    }
  });

  it('every entry has the full RouteColorSet shape', () => {
    for (const [name, set] of Object.entries(ROUTE_COLORS)) {
      expect(set, `route ${name}`).toEqual(expect.objectContaining({
        bg: expect.any(String),
        border: expect.any(String),
        text: expect.any(String),
        gradient: expect.any(String),
        swatch: expect.any(String),
      }));
    }
  });

  it('every swatch is a valid 7-char hex colour', () => {
    for (const [name, set] of Object.entries(ROUTE_COLORS)) {
      expect(set.swatch, `route ${name} swatch`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('every gradient uses the from-…-to-… shape Tailwind expects', () => {
    for (const [name, set] of Object.entries(ROUTE_COLORS)) {
      expect(set.gradient, `route ${name} gradient`).toMatch(/^from-\S+ to-\S+$/);
    }
  });

  it('every bg utility includes a dark variant', () => {
    for (const [name, set] of Object.entries(ROUTE_COLORS)) {
      expect(set.bg, `route ${name} bg dark variant`).toMatch(/dark:bg-/);
    }
  });

  it('every border utility includes a dark variant', () => {
    for (const [name, set] of Object.entries(ROUTE_COLORS)) {
      expect(set.border, `route ${name} border dark variant`).toMatch(/dark:border-/);
    }
  });

  it('every text utility includes a dark variant', () => {
    for (const [name, set] of Object.entries(ROUTE_COLORS)) {
      expect(set.text, `route ${name} text dark variant`).toMatch(/dark:text-/);
    }
  });

  it('all swatches are unique (no two routes share a brand colour)', () => {
    const swatches = Object.values(ROUTE_COLORS).map(s => s.swatch);
    expect(new Set(swatches).size).toBe(swatches.length);
  });
});

describe('getRouteColor', () => {
  it('returns the matching set for a known route', () => {
    const set = getRouteColor('Alajuela');
    expect(set.swatch).toBe('#dc2626');
    expect(set.bg).toContain('red');
  });

  it('returns the fallback set for an unknown route', () => {
    const set = getRouteColor('Marte');
    expect(set.swatch).toBe('#6b7280');
    expect(set.bg).toBe('bg-muted/30');
  });

  it('returns the fallback set for empty / whitespace input', () => {
    expect(getRouteColor('').swatch).toBe('#6b7280');
    expect(getRouteColor('   ').swatch).toBe('#6b7280');
  });

  it('is case-sensitive (intentional — names are operator-curated)', () => {
    // Lowercase variant is treated as unknown: the legend uses the canonical
    // capitalisation everywhere and we don't want silent typo recovery.
    expect(getRouteColor('alajuela').swatch).toBe('#6b7280');
    expect(getRouteColor('ALAJUELA').swatch).toBe('#6b7280');
  });

  it('does not mutate the underlying ROUTE_COLORS map', () => {
    const before = JSON.stringify(ROUTE_COLORS);
    getRouteColor('Cartago 1');
    getRouteColor('Marte');
    expect(JSON.stringify(ROUTE_COLORS)).toBe(before);
  });

  it('San Jose Centro maps to purple', () => {
    expect(getRouteColor('San Jose Centro').swatch).toBe('#9333ea');
  });

  it('San Jose Escazu maps to fuchsia', () => {
    expect(getRouteColor('San Jose Escazu').swatch).toBe('#d946ef');
  });

  it('San Jose Coronado maps to pink', () => {
    expect(getRouteColor('San Jose Coronado').swatch).toBe('#ec4899');
  });

  it('Cartago 1 maps to cyan', () => {
    expect(getRouteColor('Cartago 1').swatch).toBe('#06b6d4');
  });

  it('Cartago 2 maps to blue', () => {
    expect(getRouteColor('Cartago 2').swatch).toBe('#2563eb');
  });

  it('Encomiendas maps to emerald', () => {
    expect(getRouteColor('Encomiendas').swatch).toBe('#059669');
  });

  it('Occidente maps to orange', () => {
    expect(getRouteColor('Occidente').swatch).toBe('#f97316');
  });

  it('Alajuela maps to red', () => {
    expect(getRouteColor('Alajuela').swatch).toBe('#dc2626');
  });

  it('Heredia maps to yellow', () => {
    expect(getRouteColor('Heredia').swatch).toBe('#eab308');
  });



  it('Retira maps to teal', () => {
    expect(getRouteColor('Retira').swatch).toBe('#0d9488');
  });

  it('Desconocida maps to zinc', () => {
    expect(getRouteColor('Desconocida').swatch).toBe('#71717a');
  });
});
