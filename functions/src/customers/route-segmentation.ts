/**
 * Route SUGGESTION from the customer's address (2026-09-27) — source: docs/operations/SEGMENTACION RUTAS.xlsx
 * (SP2 repo; same file as SEGMENTACION RUTAS.pdf). It is ONLY a recommendation shown to the admin: it is never
 * assigned by itself. The admin accepts it, chooses another route or keeps the current one.
 *
 * The sheet lists zone names per route; several names repeat between routes (Guadalupe: Cartago / Goicoechea,
 * San Francisco: Cartago / Heredia, San Isidro, Centro…), so the rule works on province + canton + district
 * (the CR catalog SP2's LocationSelector writes). District rules win over canton rules. Zones of the sheet that
 * are neighbourhoods, not districts (Linda Vista, Bermejo, Ochomogo, Los Diques, San Blas, Caballo Blanco,
 * Guararí, Paseo Colón, Barrio Cuba…) fall inside a district/canton rule below.
 * Route names are the ones in SP1 `routes`: Cartago 1, Cartago 2, Heredia, San Jose Coronado, San Jose Escazu,
 * San Jose Centro, Occidente, Alajuela, Encomiendas, Retira.
 *
 * 2026-09-29 — ONE route map for SP1 and SP2 (owner's decision: the sheet rules; history only fills gaps):
 *   1. SHEET rules (ROUTE_RULES) always win.
 *   2. HISTORY rules: zones the sheet does not name, taken from how the routes have really been assigned in SP1
 *      (customers.ruta by province/canton/district, read 2026-09-29). Only consistent zones were added.
 *   3. ENCOMIENDA zones: cantons that have always gone by encomienda + the provinces outside the routes.
 *   The street text never decides the route or the encomienda (it used to: "Grecia" in the text → encomienda,
 *   although Grecia is Occidente). The stored requiresEncomienda flag is only a fallback for zones the map
 *   does not know.
 *   SP2 uses a GENERATED copy of this file (scripts/route-map/export-to-sp2.sh; a test checks they are equal).
 * Pure; tested in test/route-segmentation.spec.ts.
 */

export type RouteName =
  | 'Cartago 1' | 'Cartago 2' | 'Heredia' | 'San Jose Coronado' | 'San Jose Escazu'
  | 'San Jose Centro' | 'Occidente' | 'Alajuela' | 'Encomiendas';

/** [province, canton, district | '*' (the whole canton), route] */
type Rule = [string, string, string, RouteName];

export const ROUTE_RULES: Rule[] = [
  // CARTAGO 1
  ['San José', 'Central', 'Zapote', 'Cartago 1'],
  ['San José', 'Curridabat', '*', 'Cartago 1'],
  ['Cartago', 'El Guarco', '*', 'Cartago 1'],              // Tobosi, San Isidro, El Tejar
  ['Cartago', 'Central', 'Oriental', 'Cartago 1'],
  ['Cartago', 'Central', 'Occidental', 'Cartago 1'],        // "Centro"
  ['Cartago', 'Central', 'Guadalupe (Arenilla)', 'Cartago 1'],
  ['Cartago', 'Central', 'Dulce Nombre', 'Cartago 1'],
  ['Cartago', 'Central', 'Aguacaliente (San Francisco)', 'Cartago 1'],
  ['Cartago', 'Central', 'Quebradilla', 'Cartago 1'],
  // CARTAGO 2
  ['San José', 'Montes de Oca', 'San Pedro', 'Cartago 2'],
  ['San José', 'Curridabat', 'Granadilla', 'Cartago 2'],
  ['Cartago', 'La Unión', '*', 'Cartago 2'],                // Tres Ríos, La Unión
  ['Cartago', 'Central', 'Carmen', 'Cartago 2'],            // El Carmen, San Blas
  ['Cartago', 'Central', 'San Nicolás', 'Cartago 2'],       // Taras, Quircot, Los Diques
  ['Cartago', 'Oreamuno', 'San Rafael', 'Cartago 2'],
  ['Cartago', 'Paraíso', '*', 'Cartago 2'],
  // HEREDIA
  ['Heredia', 'Central', '*', 'Heredia'],                   // San Francisco (Guararí), Mercedes, Ulloa / La Aurora
  ['Heredia', 'Santo Domingo', 'Santa Rosa', 'Heredia'],
  ['Heredia', 'Santa Bárbara', '*', 'Heredia'],             // San Juan
  ['Heredia', 'Flores', '*', 'Heredia'],                    // San Joaquín, San Lorenzo
  ['Heredia', 'Barva', '*', 'Heredia'],
  // CORONADO
  ['Heredia', 'Santo Domingo', '*', 'San Jose Coronado'],
  ['Heredia', 'San Rafael', '*', 'San Jose Coronado'],
  ['Heredia', 'San Isidro', '*', 'San Jose Coronado'],
  ['Heredia', 'San Pablo', '*', 'San Jose Coronado'],
  ['San José', 'Moravia', '*', 'San Jose Coronado'],
  ['San José', 'Goicoechea', '*', 'San Jose Coronado'],      // Guadalupe
  ['San José', 'Tibás', '*', 'San Jose Coronado'],
  ['San José', 'Vázquez de Coronado', '*', 'San Jose Coronado'],
  // ESCAZU
  ['Heredia', 'Belén', '*', 'San Jose Escazu'],
  ['San José', 'Santa Ana', '*', 'San Jose Escazu'],
  ['San José', 'Escazú', '*', 'San Jose Escazu'],
  ['San José', 'Alajuelita', '*', 'San Jose Escazu'],
  // CENTRO
  ['San José', 'Central', '*', 'San Jose Centro'],          // Hatillo, Pavas, La Carpio, Sabana, Paseo Colón, B° México, B° Cuba, San Sebastián, Paso Ancho
  ['San José', 'Desamparados', '*', 'San Jose Centro'],
  ['San José', 'Aserrí', '*', 'San Jose Centro'],
  // OCCIDENTE
  ['Alajuela', 'Grecia', '*', 'Occidente'],
  ['Alajuela', 'Central', 'Garita', 'Occidente'],
  ['Alajuela', 'Poás', '*', 'Occidente'],
  // ALAJUELA (route in SP1, not in the sheet): the Alajuela canton
  ['Alajuela', 'Central', '*', 'Alajuela'],
];

/** Zones the sheet does not name, from SP1's real route history (2026-09-29). The sheet wins over these. */
export const HISTORY_RULES: Rule[] = [
  ['San José', 'Mora', '*', 'San Jose Escazu'],             // 2/2
  ['Alajuela', 'Central', 'Turrúcares', 'Occidente'],       // 2/2
  ['Cartago', 'Oreamuno', '*', 'Cartago 2'],                // 3/3 (the sheet only names San Rafael de Oreamuno)
];

/** Always Encomiendas: cantons outside every route (history: always Encomiendas) and the provinces outside. */
export const ENCOMIENDA_RULES: Rule[] = [
  ['Guanacaste', '*', '*', 'Encomiendas'],
  ['Puntarenas', '*', '*', 'Encomiendas'],
  ['Limón', '*', '*', 'Encomiendas'],
  ['San José', 'Pérez Zeledón', '*', 'Encomiendas'],
  ['San José', 'Tarrazú', '*', 'Encomiendas'],
  ['San José', 'Puriscal', '*', 'Encomiendas'],
  ['San José', 'Turrubares', '*', 'Encomiendas'],
  ['San José', 'Acosta', '*', 'Encomiendas'],
  ['San José', 'Dota', '*', 'Encomiendas'],
  ['San José', 'León Cortés Castro', '*', 'Encomiendas'],
  ['Alajuela', 'San Ramón', '*', 'Encomiendas'],
  ['Alajuela', 'Naranjo', '*', 'Encomiendas'],
  ['Alajuela', 'Palmares', '*', 'Encomiendas'],
  ['Alajuela', 'San Carlos', '*', 'Encomiendas'],
  ['Alajuela', 'Orotina', '*', 'Encomiendas'],
  ['Alajuela', 'Upala', '*', 'Encomiendas'],
  ['Alajuela', 'Los Chiles', '*', 'Encomiendas'],
  ['Alajuela', 'Guatuso', '*', 'Encomiendas'],
  ['Alajuela', 'Río Cuarto', '*', 'Encomiendas'],
  ['Alajuela', 'Zarcero', '*', 'Encomiendas'],
  ['Alajuela', 'San Mateo', '*', 'Encomiendas'],
  ['Heredia', 'Sarapiquí', '*', 'Encomiendas'],
  ['Cartago', 'Turrialba', '*', 'Encomiendas'],
];

const norm = (s: unknown) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** "Central" canton is also written as the province name (e.g. canton "San José" / "Cartago"). */
const cantonKey = (province: unknown, canton: unknown) => {
  const c = norm(canton);
  return c === norm(province) || c === 'central' || c === 'centro' ? 'central' : c;
};
/** District as the catalog writes it, its name without "(…)", or the name in parentheses (legacy text). */
const districtMatches = (ruleDistrict: string, district: unknown) => {
  const d = norm(district);
  if (!d) return false;
  const inParens = (ruleDistrict.match(/\((.*?)\)/) || [])[1];
  return d === norm(ruleDistrict) || d === norm(ruleDistrict.replace(/[()]/g, ' ')) || (!!inParens && d === norm(inParens));
};

export interface RouteSuggestion {
  route: RouteName;
  /** Why: which rule matched (shown to the admin). */
  basis: string;
}

export interface AddressForSuggestion {
  province?: unknown; canton?: unknown; district?: unknown; requiresEncomienda?: unknown;
}

/** "Provincia de Alajuela", "Alajuela Province" → "alajuela". */
const provinceKey = (province: unknown) => norm(province).replace(/^provincia de /, '').replace(/ province$/, '');

type Tagged = { rule: Rule; tag: string };
const TAGGED: Tagged[] = [
  ...ROUTE_RULES.map((rule) => ({ rule, tag: '' })),
  ...HISTORY_RULES.map((rule) => ({ rule, tag: ' (historial de rutas)' })),
  ...ENCOMIENDA_RULES.map((rule) => ({ rule, tag: ' (zona de encomienda)' })),
];

/**
 * Most specific first: a district rule, then a whole-canton rule, then a whole-province rule. At the same level
 * the sheet comes before history and history before the encomienda zones (the sheet wins).
 */
function ruleFor(p: string, c: string, district: unknown): Tagged | null {
  const inProvince = TAGGED.filter(({ rule: [rp] }) => norm(rp) === p);
  const inCanton = c ? inProvince.filter(({ rule: [rp, rc] }) => rc !== '*' && cantonKey(rp, rc) === c) : [];
  return inCanton.find(({ rule: [, , rd] }) => rd !== '*' && districtMatches(rd, district))
    || inCanton.find(({ rule: [, , rd] }) => rd === '*')
    || inProvince.find(({ rule: [, rc] }) => rc === '*')
    || null;
}

/**
 * The route for an address from the route map (sheet → history → encomienda zones), or null when the map does
 * not know the zone (admin chooses). Only province/canton/district count; the street text never does.
 * requiresEncomienda is a fallback for unknown zones only.
 */
export function suggestRoute(a: AddressForSuggestion | null | undefined): RouteSuggestion | null {
  if (!a) return null;
  const p = provinceKey(a.province); const c = cantonKey(p, a.canton);
  const hit = p ? ruleFor(p, c, a.district) : null;
  if (hit) {
    const [rp, rc, rd, route] = hit.rule;
    const where = rc === '*' ? `Provincia ${rp}` : rd === '*' ? `Cantón ${rc === 'Central' ? `Central (${rp})` : rc}` : `Distrito ${rd}, ${rc === 'Central' ? `Central (${rp})` : rc}`;
    return { route, basis: where + hit.tag };
  }
  if (a.requiresEncomienda === true) return { route: 'Encomiendas', basis: 'Zona sin regla en el mapa; la dirección está marcada como encomienda' };
  return null;
}

/** Whether the address goes by encomienda according to the map; null when the map does not know the zone. */
export function mapRequiresEncomienda(a: AddressForSuggestion | null | undefined): boolean | null {
  const s = suggestRoute(a ? { province: a.province, canton: a.canton, district: a.district } : null);
  return s ? s.route === 'Encomiendas' : null;
}

/** Route names compared loosely ("CARTAGO 2" = "Cartago 2", "San José Escazú" = "San Jose Escazu"). */
export const sameRoute = (a: unknown, b: unknown) => !!norm(a) && norm(a) === norm(b);
