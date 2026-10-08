/**
 * N14 (docs/audits/NOVA_PREALERT_MATCH_AUDIT_2026-09-25.md): when an SP1 invoice changes customer,
 * which SP1 packages with the invoice's trackings may follow it.
 *
 * Before: EVERY package with that trackingNumber was moved to the new customer — including
 * another customer's package and an old package with a recycled number.
 * Now only:
 *   - packages of THIS invoice (invoiceId equal), or
 *   - packages of the invoice's PREVIOUS customer that are still current
 *     (not delivered/returned and not older than the 90-day window).
 */
export const INVOICE_REASSIGN_MAX_AGE_DAYS = 90;
const FINISHED = new Set(['delivered', 'returned', 'entregado', 'devuelto']);

function toMs(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') return (value as { toDate: () => Date }).toDate().getTime();
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * N16: a package that is already closed (delivered/returned) or older than the window belongs to
 * its OWN invoice. A newer invoice with the same tracking (recycled number, same customer) must not
 * take it over. Clearing the link (its invoice was annulled/deleted) is still allowed.
 */
export function isSettledPackage(pkg: { status?: unknown; createdAt?: unknown }, nowMs: number = Date.now()): boolean {
  if (FINISHED.has(String(pkg.status ?? '').toLowerCase())) return true;
  const created = toMs(pkg.createdAt);
  return created > 0 && nowMs - created > INVOICE_REASSIGN_MAX_AGE_DAYS * 86400000;
}

export function mayFollowInvoiceReassignment(
  pkg: { invoiceId?: unknown; slCode?: unknown; status?: unknown; createdAt?: unknown },
  ctx: { invoiceId: string; beforeSlCode: string; nowMs?: number },
): boolean {
  if (pkg.invoiceId && String(pkg.invoiceId) === ctx.invoiceId) return true;
  const pkgSl = String(pkg.slCode ?? '').trim().toUpperCase();
  const before = ctx.beforeSlCode.trim().toUpperCase();
  if (!before || pkgSl !== before) return false;                       // another customer's package
  if (FINISHED.has(String(pkg.status ?? '').toLowerCase())) return false;
  const created = toMs(pkg.createdAt);
  const now = ctx.nowMs ?? Date.now();
  if (created > 0 && now - created > INVOICE_REASSIGN_MAX_AGE_DAYS * 86400000) return false;
  return true;
}
