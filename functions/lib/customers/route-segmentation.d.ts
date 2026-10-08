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
export type RouteName = 'Cartago 1' | 'Cartago 2' | 'Heredia' | 'San Jose Coronado' | 'San Jose Escazu' | 'San Jose Centro' | 'Occidente' | 'Alajuela' | 'Encomiendas';
/** [province, canton, district | '*' (the whole canton), route] */
type Rule = [string, string, string, RouteName];
export declare const ROUTE_RULES: Rule[];
/** Zones the sheet does not name, from SP1's real route history (2026-09-29). The sheet wins over these. */
export declare const HISTORY_RULES: Rule[];
/** Always Encomiendas: cantons outside every route (history: always Encomiendas) and the provinces outside. */
export declare const ENCOMIENDA_RULES: Rule[];
export interface RouteSuggestion {
    route: RouteName;
    /** Why: which rule matched (shown to the admin). */
    basis: string;
}
export interface AddressForSuggestion {
    province?: unknown;
    canton?: unknown;
    district?: unknown;
    requiresEncomienda?: unknown;
}
/**
 * The route for an address from the route map (sheet → history → encomienda zones), or null when the map does
 * not know the zone (admin chooses). Only province/canton/district count; the street text never does.
 * requiresEncomienda is a fallback for unknown zones only.
 */
export declare function suggestRoute(a: AddressForSuggestion | null | undefined): RouteSuggestion | null;
/** Whether the address goes by encomienda according to the map; null when the map does not know the zone. */
export declare function mapRequiresEncomienda(a: AddressForSuggestion | null | undefined): boolean | null;
/** Route names compared loosely ("CARTAGO 2" = "Cartago 2", "San José Escazú" = "San Jose Escazu"). */
export declare const sameRoute: (a: unknown, b: unknown) => boolean;
export {};
//# sourceMappingURL=route-segmentation.d.ts.map