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
export declare const INVOICE_REASSIGN_MAX_AGE_DAYS = 90;
/**
 * N16: a package that is already closed (delivered/returned) or older than the window belongs to
 * its OWN invoice. A newer invoice with the same tracking (recycled number, same customer) must not
 * take it over. Clearing the link (its invoice was annulled/deleted) is still allowed.
 */
export declare function isSettledPackage(pkg: {
    status?: unknown;
    createdAt?: unknown;
}, nowMs?: number): boolean;
export declare function mayFollowInvoiceReassignment(pkg: {
    invoiceId?: unknown;
    slCode?: unknown;
    status?: unknown;
    createdAt?: unknown;
}, ctx: {
    invoiceId: string;
    beforeSlCode: string;
    nowMs?: number;
}): boolean;
//# sourceMappingURL=reassign-rule.d.ts.map