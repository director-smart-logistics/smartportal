/**
 * What Nova's "P" (pre-alert) badge must show for a manifest row — pure decision, no UI.
 * docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md (N10, decision D-N1 = (a)).
 *
 * - none:      no pre-alert, or a pre-alert WITHOUT a stored owner. Never fall back to the row's
 *              own customer (before: "Pre-alerta Verificada" with whoever the row had).
 * - several:   MORE THAN ONE MATCH → RED "P", nobody is assigned automatically (F1.6):
 *              reason 'accounts' = the tracking is pre-alerted by 2+ accounts (N2, B1–B3);
 *              reason 'repeated' = the tracking appears 2+ times in this manifest (B7).
 * - match:     one owner. The pre-alert decides the customer (decision a); if the manifest name
 *              does not resemble that customer, nameMismatch=true → amber "P" + warning.
 * The letter is always "P" (= pre-alerta); only its color and tooltip change.
 * docs/NOVA_PREALERT_MATCH_SCENARIOS.md (rule 4).
 */
export type PreAlertBadge =
  | { kind: 'none' }
  | { kind: 'several'; reason: 'accounts' | 'repeated'; slCodes: string[] }
  | { kind: 'match'; slCode: string; nameMismatch: boolean };

const SL_RE = /^SL\d+$/;

function normalizeSl(value: unknown): string {
  const raw = String(value ?? '').toUpperCase().replace(/\s+/g, '');
  const sl = /^\d+$/.test(raw) ? `SL${raw}` : raw;
  return SL_RE.test(sl) ? sl : '';
}

/** Name words of 3+ letters, without accents, upper case. */
export function nameTokens(name: unknown): Set<string> {
  const plain = String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return new Set(plain.split(/[^A-Z]+/).filter((t) => t.length >= 3));
}

/** True when the two names share at least one word (first name or a last name). */
export function namesLookAlike(a: unknown, b: unknown): boolean {
  const ta = nameTokens(a);
  if (ta.size === 0) return true;          // nothing to compare → do not warn
  const tb = nameTokens(b);
  if (tb.size === 0) return true;
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

export function preAlertBadgeFor(input: {
  info: { found?: boolean; slCode?: string; ambiguousSlCodes?: string[] } | null | undefined;
  /** slCode the processor stored on the row when the pre-alert assigned it (row.preAlertSlCode). */
  rowPreAlertSlCode?: string;
  /** Name as it comes in the manifest (row.nombre). */
  manifestName?: string;
  /** Name of the pre-alert's customer. */
  customerName?: string;
  /** The row's tracking appears 2+ times in this manifest (repeatedTrackingIndices). */
  repeatedInManifest?: boolean;
}): PreAlertBadge {
  const { info } = input;
  if (info && !info.found && (info.ambiguousSlCodes?.length ?? 0) > 1) {
    return { kind: 'several', reason: 'accounts', slCodes: [...info.ambiguousSlCodes!] };
  }
  if (!info || !info.found) return { kind: 'none' };
  const slCode = normalizeSl(info.slCode) || normalizeSl(input.rowPreAlertSlCode);
  if (!slCode) return { kind: 'none' };
  if (input.repeatedInManifest) return { kind: 'several', reason: 'repeated', slCodes: [slCode] };
  const nameMismatch = !namesLookAlike(input.manifestName, input.customerName);
  return { kind: 'match', slCode, nameMismatch };
}
