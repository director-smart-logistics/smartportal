/**
 * SP2 "En Consolidación" tab (2026-09-28) — pure rules shared by the SP1 trigger (consolidation-to-sp2.ts) and the
 * backfill script. No Firebase imports: tested from client/lib/consolidation/__tests__/consolidation-start.spec.ts.
 *
 *  - isInConsolidation: EXACTLY what SP1's Consolidation Manifest page lists (useConsolidationData +
 *    isPackageTransitoria): a non-terminal package parked in CONSOLIDACION_TRANSITORIA. packages.status alone is not
 *    used — it is stale on packages that already left consolidation.
 *  - consolidationStart: "Día 1" — reads the package's stored firstInvoiceNumber/firstInvoiceDate first; otherwise
 *    `invoiceHistoryFirst` (earliest SP1 invoice listing the tracking, attached by the caller from the customer's
 *    invoices) and the package fields/history. "Día 1" = the date of the FIRST invoice the package was ever invoiced in — the EARLIEST
 *    invoice date among all its invoices (current, annulled / deleted, and every invoice named in its history), whether
 *    or not that first one was annulled (user decision 2026-09-28). Moves between manifests / blocks do not change it.
 *    SP2 stores it once per customer + tracking and never overwrites it (a package that re-enters keeps its date).
 *    Never invoiced → firstConsolidatedAt, else the first 'consolidated' history event, else created.
 *  It is the SAME rule as client/lib/consolidation/day-one.ts (SP1 Consolidation page): a parity test runs both on
 *  the same fixtures (client/lib/consolidation/__tests__/consolidation-start.spec.ts). Change both together.
 */
export declare const TRANSITORIA = "consolidacion_transitoria";
export declare const normTracking: (t: unknown) => string;
export declare const normSl: (s: unknown) => string;
/** Same predicate as client/pages/consolidation/components/normalize-manifest.ts isPackageTransitoria. */
export declare function isPackageTransitoria(pkg: any): boolean;
/** In the customer's "En Consolidación" list (and on SP1's consolidation page). */
export declare function isInConsolidation(pkg: any): boolean;
/** Key of a list entry: customer + tracking. null when the package has no customer or tracking. */
export declare function membershipKey(pkg: any): {
    slCode: string;
    tracking: string;
} | null;
export declare function asIso(v: any): string | null;
/** Date carried by an invoice number (SLxxx-YYYYMMDDhhmmss…): the day, at noon Costa Rica. */
export declare function dateFromInvoiceNumber(num?: string | null): string | null;
export interface ConsolidationStart {
    date: string | null;
    invoiceNumber: string | null;
    scenario: "primera-factura" | "sin-factura" | "sin-datos";
}
/** Mirror of the client's extractInvoiceEmissionDate (date-utils.ts): invoiceDate → createdAt → date → invoicedAt → number. */
export declare function invoiceEmissionDate(inv: any): string | null;
/** Mirror of the client's firstInvoiceFromInvoices (day-one.ts): the EARLIEST invoice (any status) listing the tracking. */
export declare function firstInvoiceFromInvoices(tracking: string, invoices: any[]): {
    invoiceNumber: string;
    date: string;
} | null;
/** "Día 1" of the package (see header). */
export declare function consolidationStart(pkg: any): ConsolidationStart;
export type ConsolidationOp = {
    op: "add" | "remove" | "repair_since";
    slCode: string;
    tracking: string;
    sp1PackageId: string;
    since?: string | null;
    sourceInvoiceNumber?: string | null;
    reason: string;
    eventId?: string;
    eventAt?: string;
};
/** The list operations one package write implies (enter → add, leave → remove, customer/tracking change → remove + add). */
export declare function consolidationOps(pkgId: string, before: any, after: any): ConsolidationOp[];
//# sourceMappingURL=consolidation-start.d.ts.map