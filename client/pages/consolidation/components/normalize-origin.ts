/**
 * normalizeOriginCountry
 *
 * Maps raw origin strings from Firestore package data to canonical country codes.
 * The `origin` field in packages can contain:
 *   - Country codes: 'USA', 'US', 'CO', 'CN', 'MX'
 *   - City/state combos: 'MIAMI, FL', 'Miami, Florida', 'Bogotá, Colombia'
 *   - Full country names: 'United States', 'Colombia', 'China', 'México'
 *
 * ── Usage ────────────────────────────────────────────────────────────────────────
 * Used by consolidation-rules-service.ts and consolidation-carry-on-service.ts
 * before passing `originCountry` to the compliance engine.
 *
 * ── Return Values ───────────────────────────────────────────────────────────────
 *   'USA' | 'CO' | 'CN' | 'MX' | original (uppercased if unknown)
 */

/**
 * US states and major city patterns for origin detection.
 * Matches "MIAMI, FL", "LOS ANGELES, CA", etc.
 */
const US_STATE_ABBREVS = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR',
]);

/** Known US cities that appear in origin fields */
const US_CITIES = new Set([
  'MIAMI', 'NEW YORK', 'LOS ANGELES', 'HOUSTON', 'CHICAGO',
  'ORLANDO', 'TAMPA', 'JACKSONVILLE', 'ATLANTA', 'DALLAS',
  'FORT LAUDERDALE', 'HIALEAH', 'DORAL', 'MEDLEY',
]);

/** Known non-US origin patterns → canonical code */
const NON_US_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\b(COLOMBIA|BOGOT[AÁ]|MEDELL[IÍ]N|CALI|BARRANQUILLA)\b/i, code: 'CO' },
  { pattern: /\b(CHINA|GUANGZHOU|SHENZHEN|SHANGHAI|BEIJING|YIWU)\b/i,    code: 'CN' },
  { pattern: /\b(M[EÉ]XICO|CDMX|GUADALAJARA|MONTERREY|TIJUANA)\b/i,     code: 'MX' },
];

/**
 * Normalize a raw origin string into a canonical country code.
 *
 * @param origin - Raw origin value from Firestore (e.g. 'MIAMI, FL', 'USA', 'Colombia')
 * @returns Canonical country code: 'USA', 'CO', 'CN', 'MX', or original uppercased
 */
export function normalizeOriginCountry(origin: string | null | undefined): string {
  if (!origin) return 'USA'; // Default: warehouse is in USA

  const trimmed = origin.trim().toUpperCase();
  if (!trimmed) return 'USA';

  // Direct code matches
  if (trimmed === 'US' || trimmed === 'USA' || trimmed === 'UNITED STATES') return 'USA';
  if (trimmed === 'CO') return 'CO';
  if (trimmed === 'CN') return 'CN';
  if (trimmed === 'MX') return 'MX';

  // Check for US city/state pattern: "CITY, STATE_ABBREV"
  const commaIdx = trimmed.lastIndexOf(',');
  if (commaIdx > 0) {
    const possibleState = trimmed.slice(commaIdx + 1).trim();
    if (US_STATE_ABBREVS.has(possibleState)) return 'USA';
  }

  // Check for known US city names
  for (const city of US_CITIES) {
    if (trimmed.includes(city)) return 'USA';
  }

  // Check non-US patterns
  for (const { pattern, code } of NON_US_PATTERNS) {
    if (pattern.test(trimmed)) return code;
  }

  // Unknown — return as-is
  return trimmed;
}

/**
 * Check if a normalized origin represents a USA origin.
 */
export function isUSAOrigin(originCountry: string): boolean {
  return normalizeOriginCountry(originCountry) === 'USA';
}
