/**
 * normalizeManifest
 *
 * Canonical normalization for manifest identifiers.
 * Ensures consistent key derivation across:
 *   - package.manifestNumber / package.updatedManifest
 *   - invoice.manifestNumber / invoice.manifestNumbers[]
 *   - Kanban column keys
 *   - Carry-on dialog selectors
 *
 * ── Rules ────────────────────────────────────────────────────────────────────────
 *   1. Trim whitespace from both ends
 *   2. Uppercase the entire string (12-05-2026dan → 12-05-2026DAN)
 *   3. Collapse multiple internal spaces to a single space
 *   4. Empty/null/undefined → 'CONSOLIDACION_TRANSITORIA' (the only catch-all bucket)
 *
 * ── Why This Exists ─────────────────────────────────────────────────────────────
 *
 * Firestore data may contain manifest numbers with inconsistent casing or
 * trailing spaces (e.g., " 12-05-2026DAN " vs "12-05-2026DAN"). Without
 * normalization, these appear as duplicate columns in the Kanban board and
 * cause cross-manifest operations to silently fail.
 *
 * There is no "(SIN MANIFIESTO)" bucket — any item without a manifest number
 * is automatically routed to CONSOLIDACION_TRANSITORIA.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────────
 *
 * Import and apply in useConsolidationData.ts when reading manifest values
 * from packages and invoices. Also used in KanbanBoard column key derivation.
 */

/** The canonical name for the transitoria / catch-all manifest. */
export const TRANSITORIA_MANIFEST = 'CONSOLIDACION_TRANSITORIA';

/**
 * Normalize a manifest number for consistent key matching.
 * Empty / null / undefined values are routed to CONSOLIDACION_TRANSITORIA.
 * @param manifest - Raw manifest string from Firestore
 * @returns Canonical uppercase trimmed manifest string
 */
export function normalizeManifest(manifest: string | null | undefined): string {
  if (!manifest) return TRANSITORIA_MANIFEST;
  const normalized = manifest.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!normalized) return TRANSITORIA_MANIFEST;

  // Treat "no manifest" placeholder values as Transitoria.
  // These are legacy Firestore values meaning "not yet assigned".
  const NO_MANIFEST_PLACEHOLDERS = new Set([
    'SIN-ASIGNAR',
    'SIN ASIGNAR',
    'SINASIGNAR',
    'SIN_ASIGNAR',
    'N/A',
    'NONE',
    'NULL',
    'UNDEFINED',
    'NO ASIGNADO',
    'NO-ASIGNADO',
  ]);
  if (NO_MANIFEST_PLACEHOLDERS.has(normalized)) return TRANSITORIA_MANIFEST;

  return normalized;
}

/**
 * Check if a manifest value represents "no manifest assigned" (i.e. Transitoria).
 */
export function isEmptyManifest(manifest: string): boolean {
  return !manifest || manifest === TRANSITORIA_MANIFEST;
}

