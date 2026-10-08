/**
 * F2.1 — the pre-alert a saved package is CONFIRMED to belong to. Stored on SP1's
 * packages/{tracking} (preAlertId, preAlertSlCode) so the invoice sync can hand SP2 the pre-alert
 * by id: SP2 then links pre-alert ↔ shipment without searching by tracking.
 *
 * Only a certain link is stored — any doubt means none:
 * - the row's saved pre-alert was FOUND (one owner) and not repeated in the manifest (RED "P");
 * - its owner is the row's customer (if the admin gave the package to someone else, the
 *   pre-alert does not follow);
 * - it has an id.
 */
const SL_RE = /^SL\d+$/;

function normalizeSl(value: unknown): string {
  const raw = String(value ?? '').toUpperCase().replace(/\s+/g, '');
  const sl = /^\d+$/.test(raw) ? `SL${raw}` : raw;
  return SL_RE.test(sl) ? sl : '';
}

export interface PreAlertLinkRow {
  preAlert?: { found?: boolean; slCode?: string; sp2PreAlertId?: string; repeatedInManifest?: boolean } | null;
  preAlertSlCode?: string;
  preAlertId?: string;
  preAlertKey?: string;
}

export function confirmedPreAlertLink(
  row: PreAlertLinkRow,
  effectiveSlCode: string | null | undefined,
): { preAlertId: string; preAlertSlCode: string } | null {
  const p = row.preAlert;
  if (!p || p.found !== true || p.repeatedInManifest === true) return null;
  const owner = normalizeSl(p.slCode) || normalizeSl(row.preAlertSlCode);
  if (!owner || owner !== normalizeSl(effectiveSlCode)) return null;
  const id = String(p.sp2PreAlertId || row.preAlertId || row.preAlertKey || '').trim();
  if (!id) return null;
  return { preAlertId: id, preAlertSlCode: owner };
}
