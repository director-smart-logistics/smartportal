"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVOICE_REASSIGN_MAX_AGE_DAYS = void 0;
exports.isSettledPackage = isSettledPackage;
exports.mayFollowInvoiceReassignment = mayFollowInvoiceReassignment;
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
exports.INVOICE_REASSIGN_MAX_AGE_DAYS = 90;
const FINISHED = new Set(['delivered', 'returned', 'entregado', 'devuelto']);
function toMs(value) {
    if (!value)
        return 0;
    if (typeof value.toMillis === 'function')
        return value.toMillis();
    if (typeof value.toDate === 'function')
        return value.toDate().getTime();
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}
/**
 * N16: a package that is already closed (delivered/returned) or older than the window belongs to
 * its OWN invoice. A newer invoice with the same tracking (recycled number, same customer) must not
 * take it over. Clearing the link (its invoice was annulled/deleted) is still allowed.
 */
function isSettledPackage(pkg, nowMs = Date.now()) {
    if (FINISHED.has(String(pkg.status ?? '').toLowerCase()))
        return true;
    const created = toMs(pkg.createdAt);
    return created > 0 && nowMs - created > exports.INVOICE_REASSIGN_MAX_AGE_DAYS * 86400000;
}
function mayFollowInvoiceReassignment(pkg, ctx) {
    if (pkg.invoiceId && String(pkg.invoiceId) === ctx.invoiceId)
        return true;
    const pkgSl = String(pkg.slCode ?? '').trim().toUpperCase();
    const before = ctx.beforeSlCode.trim().toUpperCase();
    if (!before || pkgSl !== before)
        return false; // another customer's package
    if (FINISHED.has(String(pkg.status ?? '').toLowerCase()))
        return false;
    const created = toMs(pkg.createdAt);
    const now = ctx.nowMs ?? Date.now();
    if (created > 0 && now - created > exports.INVOICE_REASSIGN_MAX_AGE_DAYS * 86400000)
        return false;
    return true;
}
//# sourceMappingURL=reassign-rule.js.map