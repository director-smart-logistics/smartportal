/**
 * What "Acciones → Corregir por Pre-Alertas" may change in Nova's table — pure decision, no UI.
 * docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md (N11).
 *
 * - A row whose customer the OPERATOR chose by hand (approved, not assigned by a pre-alert) is
 *   never overwritten: it is only reported (skippedManual). Before, the button overwrote it.
 * - A pre-alert whose customer does not exist in SP1 is not applied (missingCustomer). Before,
 *   the slCode was assigned anyway with an invented name "Cliente Pre-alertado (SLxxxx)".
 * - Trackings pre-alerted by 2+ accounts are reported (ambiguous), never assigned.
 * - Trackings that appear 2+ times in the manifest are reported (repeated), never assigned (F1.6).
 */
export interface CorrectionRowInput {
  idx: number;
  tracking: string;
  /** Effective slCode of the row right now (override or processor). */
  currentSlCode: string;
}

export interface CorrectionPlan {
  apply: Array<{ idx: number; slCode: string; fullName: string; ruta: string }>;
  skippedManual: number[];
  missingCustomer: number[];
  ambiguous: number[];
  repeated: number[];
}

export function planPreAlertCorrections(
  rows: CorrectionRowInput[],
  ctx: {
    preAlertMap: Map<string, { found?: boolean; slCode?: string; ambiguousSlCodes?: string[] }>;
    /** Rows the operator approved/assigned (approvedMatches). */
    approved: Set<number>;
    /** Rows whose customer came from a pre-alert (preAlertAssignedRows) — not operator choices. */
    preAlertAssigned: Set<number>;
    profiles: Map<string, { slCode: string; fullName: string; ruta?: string }>;
    /** Rows whose tracking appears 2+ times in the manifest (repeatedTrackingIndices). */
    repeated?: Set<number>;
  },
): CorrectionPlan {
  const plan: CorrectionPlan = { apply: [], skippedManual: [], missingCustomer: [], ambiguous: [], repeated: [] };
  for (const { idx, tracking, currentSlCode } of rows) {
    const info = ctx.preAlertMap.get(tracking.toUpperCase().trim());
    if (!info) continue;
    if (!info.found) {
      if ((info.ambiguousSlCodes?.length ?? 0) > 1) plan.ambiguous.push(idx);
      continue;
    }
    if (ctx.repeated?.has(idx)) { plan.repeated.push(idx); continue; }
    const preAlertSl = String(info.slCode || '').toUpperCase().trim();
    if (!preAlertSl) continue;
    const current = currentSlCode.toUpperCase().trim();
    if (current && !current.startsWith('SL-NAN-') && current === preAlertSl) continue;   // already right
    const operatorChoice = ctx.approved.has(idx) && !ctx.preAlertAssigned.has(idx);
    if (operatorChoice && current && !current.startsWith('SL-NAN-')) { plan.skippedManual.push(idx); continue; }
    const profile = ctx.profiles.get(preAlertSl);
    if (!profile) { plan.missingCustomer.push(idx); continue; }
    plan.apply.push({ idx, slCode: profile.slCode, fullName: profile.fullName, ruta: profile.ruta || '' });
  }
  return plan;
}
