/**
 * Pure keys of Nova's pre-alert match (no Firestore) — shared by the manifest processor, the
 * table and pre-alert-resolver. docs/NOVA_PREALERT_MATCH_SCENARIOS.md (rule 3, B7).
 */
import { canonicalizeTracking, type CanonicalTrackingResult } from '../utils/tracking-canonicalizer';

/**
 * All exact keys under which a manifest tracking may have been pre-alerted: the normalized value,
 * the canonical one and the carrier variants read from the END of the barcode (reverse lookup:
 * FedEx 34 → last 12, USPS 420+ZIP → 20/22). Exact equality only — never "similar" trackings.
 */
export function preAlertMatchKeys(analysis: CanonicalTrackingResult): Set<string> {
  return new Set(
    [analysis.normalized, analysis.canonicalTracking, ...analysis.trackingVariants]
      .map((k) => String(k || '').toUpperCase().trim())
      .filter(Boolean),
  );
}

/**
 * Rows whose tracking appears 2+ times in the same manifest (F1.6, scenario B7): the same package
 * twice (also the long and short forms of one number, e.g. FedEx 34 and its last 12). A pre-alert
 * never assigns such rows automatically — RED "P", the admin decides.
 *
 * @param trackings manifest trackings by row index
 * @param skip row indices to ignore (deleted rows)
 */
export function repeatedTrackingIndices(trackings: Array<string | null | undefined>, skip?: Set<number>): Set<number> {
  const firstByKey = new Map<string, number>();
  const repeated = new Set<number>();
  trackings.forEach((raw, idx) => {
    if (skip?.has(idx) || !raw) return;
    const analysis = canonicalizeTracking(raw);
    if (!analysis.normalized) return;
    for (const key of preAlertMatchKeys(analysis)) {
      const first = firstByKey.get(key);
      if (first === undefined) firstByKey.set(key, idx);
      else if (first !== idx) { repeated.add(first); repeated.add(idx); }
    }
  });
  return repeated;
}
