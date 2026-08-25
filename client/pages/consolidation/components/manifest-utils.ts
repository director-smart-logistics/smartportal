/**
 * Manifest Type Utilities
 *
 * Detects whether a manifest is a permit (DANP) or normal (DAN) manifest
 * and enforces compatibility rules for cross-manifest operations.
 *
 * ── Business Rules ──────────────────────────────────────────────────────────────
 *
 *   - DANP suffix        → permit manifest (P = Permisos)
 *   - PERMISOS anywhere  → permit manifest
 *   - PERMISOSDAN        → permit manifest
 *   - Everything else    → normal manifest
 *
 *   Packages may ONLY move between manifests of the SAME type.
 *   Normal ↔ Normal: ✅    Permit ↔ Permit: ✅
 *   Normal ↔ Permit: ❌    Permit ↔ Normal: ❌
 *
 * ── Why? ──────────────────────────────────────────────────────────────────────
 *
 *   Permit manifests (DANP) use different pricing tiers (precioConPermiso)
 *   and require special customs documentation. Mixing them with normal
 *   manifests corrupts invoice pricing and regulatory compliance.
 */

export type ManifestType = 'normal' | 'permit';

/**
 * Patterns that identify a permit manifest.
 * Ordered from most specific → least specific.
 */
const PERMIT_PATTERNS: RegExp[] = [
  /DANP$/i,        // "28-02-2026DANP" — standard DANP suffix
  /DANP[^A-Z]/i,   // "28-02-2026DANP_v2" — DANP followed by non-alpha
  /PERMISOS/i,     // "PERMISOS", "PERMISOSDAN", etc.
  /PERMIT/i,       // English variant
];

/**
 * Determines the type of a manifest based on its number/ID.
 *
 * @param manifestNumber - e.g. "22-04-2026DAN" or "25-04-2026DANP"
 * @returns 'permit' if the manifest requires permits, 'normal' otherwise
 */
export function getManifestType(manifestNumber: string): ManifestType {
  if (!manifestNumber) return 'normal';
  const upper = manifestNumber.toUpperCase().trim();

  for (const pattern of PERMIT_PATTERNS) {
    if (pattern.test(upper)) return 'permit';
  }

  return 'normal';
}

/**
 * Shorthand: true if the manifest is a DANP / PERMISOS manifest.
 */
export function isPermitManifest(manifestNumber: string): boolean {
  return getManifestType(manifestNumber) === 'permit';
}

/**
 * Checks whether two manifests are compatible for carry-on operations.
 *
 * @returns true if both manifests are the same type (normal↔normal or permit↔permit)
 */
export function areManifestsCompatible(source: string, target: string): boolean {
  return getManifestType(source) === getManifestType(target);
}

/**
 * Returns a human-readable label for a manifest type (Spanish).
 */
export function manifestTypeLabel(type: ManifestType): string {
  return type === 'permit' ? 'Permiso' : 'Normal';
}
