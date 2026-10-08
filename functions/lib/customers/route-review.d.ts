type Addr = Record<string, any> | null | undefined;
export type RouteDecision = 'accepted_suggestion' | 'chose_other' | 'kept_current';
export interface AddressSnapshot {
    text: string;
    province: string | null;
    canton: string | null;
    district: string | null;
    requiresEncomienda: boolean | null;
}
export interface RouteReview {
    id: string;
    status: 'pending' | 'resolved';
    reason: 'address_changed' | 'first_address';
    createdAt: string;
    /** Who changed the address: 'client' | 'admin' | an e-mail. */
    changedBy: string;
    previousAddress: AddressSnapshot | null;
    newAddress: AddressSnapshot;
    currentRuta: string | null;
    suggestedRuta: string | null;
    suggestionBasis: string | null;
    matchesSuggestion: boolean;
    /** Encomienda route vs address zone disagree (the most dangerous case). */
    encomiendaConflict: string | null;
    /** The route the customer had before the current one (from routeHistory) — e.g. before "Encomiendas". */
    previousRuta?: string | null;
    /** Plain explanation shown everywhere (Nova, SP2, e-mail) so nobody reads it as a system error. */
    summary?: string;
    resolvedAt?: string | null;
    resolvedBy?: string | null;
    resolvedIn?: 'sp1' | 'sp2' | null;
    decision?: RouteDecision | null;
    finalRuta?: string | null;
    /** An SP1 admin confirmed the route after an SP2 decision that did not accept the recommendation. */
    sp1ConfirmedAt?: string | null;
    sp1ConfirmedBy?: string | null;
}
export declare function snapshotOf(a: Addr): AddressSnapshot | null;
/** Did the part of the address that decides the route change? (street, zone, encomienda need) */
export declare function addressMovedForRoute(prev: Addr, next: Addr): boolean;
/** The route map decides (province/canton/district); the stored flag only for zones the map does not know. */
export declare function encomiendaConflictOf(ruta: unknown, next: Addr): string | null;
/**
 * The review to open when the principal address changed, else null. A still-open review is replaced by the new
 * one (the latest address is what matters); the log keeps both.
 */
/** The route before the current one, from the customer's routeHistory (latest change into the current route). */
export declare function previousRutaOf(currentRuta: unknown, history: unknown): string | null;
/** One plain paragraph: what happened, what the route is, what is recommended, that nothing changed by itself. */
export declare function reviewSummary(r: Omit<RouteReview, 'summary'>): string;
export declare function computeRouteReview(prev: Addr, next: Addr, currentRuta: unknown, meta: {
    now: string;
    changedBy: string;
    routeHistory?: unknown;
}): RouteReview | null;
/** The review closed by an admin decision (SP1 or SP2). */
export declare function resolveReview(review: RouteReview, finalRuta: string, by: string, where: 'sp1' | 'sp2', now: string): RouteReview;
/** Nova shows the "Revisar ruta" badge while this is true. */
export declare function needsSp1Review(review: RouteReview | null | undefined): boolean;
export interface RouteReviewEvent {
    event: 'created' | 'replaced' | 'resolved_in_sp2' | 'resolved_in_sp1';
    review: RouteReview;
    previous?: RouteReview | null;
}
/**
 * The customer's routeReview after an SP2 → SP1 sync, and what to log:
 *   - the principal address moved → a new pending review (an open one is replaced — the latest address counts);
 *   - SP2 sent the admin's decision for the open review (same id) → resolved in SP2.
 * `events` empty = nothing changes.
 */
export declare function nextRouteReviewState(args: {
    existing: RouteReview | null | undefined;
    prevAddress: Addr;
    nextAddress: Addr;
    ruta: unknown;
    incomingSp2: Partial<RouteReview> | null | undefined;
    changedBy: string;
    now: string;
    routeHistory?: unknown;
    /** An SP2 admin set the route directly (UserModal "Ruta", syncRutaToSp1) — counts as the decision when later than the review. */
    sp2RouteSet?: {
        ruta: unknown;
        at: unknown;
        by: unknown;
    } | null;
}): {
    review: RouteReview | null;
    events: RouteReviewEvent[];
};
/** An SP1 admin changed the route directly (customer edit) while a review was open → that is the decision. */
export declare function resolveOnSp1RouteEdit(review: RouteReview | null | undefined, newRuta: unknown, by: string, now: string): RouteReview | null;
export interface OpenPackageOnRoute {
    id: string;
    tracking: string;
    ruta: string | null;
    status: string | null;
    statusLabel: string | null;
}
/** Open packages of the customer (not delivered/returned/cancelled) whose route is not the customer's new route. */
export declare function openPackagesOnOtherRoute(pkgs: Array<{
    id: string;
} & Record<string, any>>, newRuta: unknown): OpenPackageOnRoute[];
/** The flag Nova listens to: something about this customer's route needs an admin. */
export declare function routeAttentionOf(review: RouteReview | null | undefined, packagesOnPreviousRoute: {
    count?: number;
} | null | undefined): boolean;
export {};
//# sourceMappingURL=route-review.d.ts.map