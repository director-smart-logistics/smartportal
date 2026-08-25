/**
 * Tracking Variants Generator
 * ───────────────────────────
 * Given a raw tracking number (typically the visible value printed on the
 * customer's label OR the full barcode payload from a manifest), produce a
 * canonical, deduplicated array of look-up variants covering every common
 * carrier format (UPS 1Z, FedEx 96/00-prefix, USPS 9-prefix, USPS Express,
 * USPS 420-prefix with ZIP5 / ZIP+4, GS1 composites and generic suffix slices).
 *
 * The output is intended to be persisted as a `trackingVariants: string[]`
 * field on every `packages/{id}` document so the scanner can match a partial
 * scan against the stored package using Firestore's `array-contains-any`.
 *
 * Capped at 30 entries to fit within the Firestore `array-contains-any` /
 * `in` query limit (max 30 values per query as of SDK v9+).
 */

import { canonicalizeTracking } from './tracking-canonicalizer';

export function buildTrackingVariants(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];

  const canonicalRes = canonicalizeTracking(raw);
  if (!canonicalRes.normalized) return [];

  // For discrete alphanumeric identifiers (GFUS, 1Z, TBA, YT, LP, DHL),
  // NEVER strip letters or perform numeric suffix slicing.
  if (canonicalRes.carrierType === 'DISCRETE_ALPHANUMERIC') {
    const set = new Set<string>();
    set.add(canonicalRes.normalized);
    set.add(canonicalRes.normalized.toLowerCase());
    return Array.from(set);
  }

  // For postal composites (USPS, FedEx GS1), return the standard variants
  return canonicalRes.trackingVariants.slice(0, 30);
}

