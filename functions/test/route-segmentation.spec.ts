import { describe, it, expect } from 'vitest';
import { suggestRoute, sameRoute, ROUTE_RULES, HISTORY_RULES, mapRequiresEncomienda } from '../src/customers/route-segmentation';

const S = (province: string, canton: string, district: string, requiresEncomienda?: boolean) =>
  suggestRoute({ province, canton, district, requiresEncomienda })?.route ?? null;

describe('route suggestion (SEGMENTACION RUTAS) — a recommendation only', () => {
  it('names repeated in the sheet resolve by province/canton/district', () => {
    expect(S('Cartago', 'Central', 'Guadalupe (Arenilla)')).toBe('Cartago 1');
    expect(S('San José', 'Goicoechea', 'Guadalupe')).toBe('San Jose Coronado');
    expect(S('Cartago', 'Central', 'Aguacaliente (San Francisco)')).toBe('Cartago 1');
    expect(S('Heredia', 'Central', 'San Francisco')).toBe('Heredia');
    expect(S('Cartago', 'El Guarco', 'San Isidro')).toBe('Cartago 1');
    expect(S('Heredia', 'San Isidro', 'San Isidro Centro')).toBe('San Jose Coronado');
  });
  it('district rules win over the canton rule', () => {
    expect(S('San José', 'Curridabat', 'Granadilla')).toBe('Cartago 2');
    expect(S('San José', 'Curridabat', 'Tirrases')).toBe('Cartago 1');
    expect(S('San José', 'Central', 'Zapote')).toBe('Cartago 1');
    expect(S('San José', 'Central', 'Pavas')).toBe('San Jose Centro');
    expect(S('Heredia', 'Santo Domingo', 'Santa Rosa')).toBe('Heredia');
    expect(S('Heredia', 'Santo Domingo', 'Santo Tomás')).toBe('San Jose Coronado');
    expect(S('Alajuela', 'Central', 'Garita')).toBe('Occidente');
    expect(S('Alajuela', 'Central', 'Alajuela Centro')).toBe('Alajuela');
  });
  it('every sheet column is covered', () => {
    expect(S('Cartago', 'Central', 'San Nicolás')).toBe('Cartago 2');       // Taras, Quircot
    expect(S('Cartago', 'La Unión', 'Tres Ríos')).toBe('Cartago 2');
    expect(S('Heredia', 'Barva', 'Barva Centro')).toBe('Heredia');
    expect(S('Heredia', 'Belén', 'San Antonio')).toBe('San Jose Escazu');
    expect(S('San José', 'Tibás', 'San Juan')).toBe('San Jose Coronado');
    expect(S('San José', 'Desamparados', 'San Miguel')).toBe('San Jose Centro');
    expect(S('Alajuela', 'Grecia', 'Tacares')).toBe('Occidente');
  });
  it('outside the routes → Encomiendas (encomienda zones); unknown zone → no suggestion (admin chooses)', () => {
    expect(S('Guanacaste', 'Liberia', 'Liberia Centro', true)).toBe('Encomiendas');
    expect(S('Guanacaste', 'Liberia', 'Liberia Centro')).toBe('Encomiendas');   // the province decides, not the flag
    expect(S('Alajuela', 'San Ramón', 'San Juan')).toBe('Encomiendas');
    expect(S('Limón', 'Siquirres', 'Siquirres')).toBe('Encomiendas');
    expect(S('San José', 'Pérez Zeledón', 'San Isidro de El General')).toBe('Encomiendas');
    expect(S('Alajuela', 'Atenas', 'Atenas')).toBeNull();                        // not in the map: admin chooses
    expect(S('Alajuela', 'Atenas', 'Atenas', true)).toBe('Encomiendas');          // … the flag is the fallback
    expect(suggestRoute(null)).toBeNull();
    expect(S('', '', '')).toBeNull();
  });
  it('tolerates legacy spellings (no accents, canton written as the province)', () => {
    expect(S('san jose', 'san jose', 'zapote')).toBe('Cartago 1');
    expect(S('Cartago', 'Cartago', 'arenilla')).toBe('Cartago 1');
    expect(suggestRoute({ province: 'San José', canton: 'Escazú', district: 'San Rafael' })!.basis).toBe('Cantón Escazú');
  });
  it('uses only existing SP1 route names; loose route comparison', () => {
    const names = new Set(ROUTE_RULES.map((r) => r[3]));
    for (const n of names) expect(['Cartago 1', 'Cartago 2', 'Heredia', 'San Jose Coronado', 'San Jose Escazu', 'San Jose Centro', 'Occidente', 'Alajuela']).toContain(n);
    expect(sameRoute('CARTAGO 2', 'Cartago 2')).toBe(true);
    expect(sameRoute('San José Escazú', 'San Jose Escazu')).toBe(true);
    expect(sameRoute('', '')).toBe(false);
  });

  it('the map wins over the stored flag and the street text (2026-09-29: Grecia is Occidente, not encomienda)', () => {
    expect(S('Alajuela', 'Grecia', 'Grecia', true)).toBe('Occidente');
    expect(mapRequiresEncomienda({ province: 'Alajuela', canton: 'Grecia', district: 'Tacares' })).toBe(false);
    expect(mapRequiresEncomienda({ province: 'Limón', canton: 'Siquirres', district: 'Siquirres' })).toBe(true);
    expect(mapRequiresEncomienda({ province: 'Alajuela', canton: 'Atenas', district: 'Atenas' })).toBeNull();
  });
  it('the sheet wins where history disagrees (owner decision 2026-09-29)', () => {
    expect(S('San José', 'Montes de Oca', 'San Pedro')).toBe('Cartago 2');
    expect(S('Cartago', 'La Unión', 'Tres Ríos')).toBe('Cartago 2');
    expect(S('Heredia', 'San Rafael', 'San Josecito')).toBe('San Jose Coronado');
    expect(S('Cartago', 'El Guarco', 'Tejar')).toBe('Cartago 1');
  });
  it('history fills zones the sheet does not name; a district rule beats a whole-canton rule', () => {
    expect(S('San José', 'Mora', 'Colón')).toBe('San Jose Escazu');
    expect(S('Alajuela', 'Central', 'Turrúcares')).toBe('Occidente');
    expect(S('Alajuela', 'Central', 'San José')).toBe('Alajuela');
    expect(S('Cartago', 'Oreamuno', 'Cot')).toBe('Cartago 2');
    expect(suggestRoute({ province: 'San José', canton: 'Mora', district: 'Colón' })!.basis).toMatch(/historial/);
    for (const [p, c] of HISTORY_RULES.filter(([, , d]) => d === '*')) expect(ROUTE_RULES.some(([rp, rc, rd]) => rp === p && rc === c && rd === '*')).toBe(false);
  });
  it('tolerates "Provincia de …" / "… Province" as SP1 legacy data writes them', () => {
    expect(S('Provincia de Alajuela', 'Grecia', '')).toBe('Occidente');
    expect(S('Heredia Province', 'Barva', '')).toBe('Heredia');
  });
});
