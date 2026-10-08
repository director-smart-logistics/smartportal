"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotOf = snapshotOf;
exports.addressMovedForRoute = addressMovedForRoute;
exports.encomiendaConflictOf = encomiendaConflictOf;
exports.previousRutaOf = previousRutaOf;
exports.reviewSummary = reviewSummary;
exports.computeRouteReview = computeRouteReview;
exports.resolveReview = resolveReview;
exports.needsSp1Review = needsSp1Review;
exports.nextRouteReviewState = nextRouteReviewState;
exports.resolveOnSp1RouteEdit = resolveOnSp1RouteEdit;
exports.openPackagesOnOtherRoute = openPackagesOnOtherRoute;
exports.routeAttentionOf = routeAttentionOf;
/**
 * "Revisar ruta" (2026-09-27): when a customer's delivery address changes, their logistics route may no longer
 * match where they live. SP1 marks the customer (customers/{sl}.routeReview) in the same write that saves the
 * new address, mirrors it to SP2 (users/{uid}.routeReview) and logs every step in route_reviews. Nothing is
 * assigned by itself: the suggestion (route-segmentation.ts) is a recommendation. The admin decides in SP2 or in
 * SP1/Nova: accept the recommendation, choose another route or keep the current one.
 *
 * Nova keeps a visible "Revisar ruta" badge while `needsSp1Review(review)`:
 *   - the review is pending, or
 *   - it was resolved in SP2 WITHOUT accepting the recommendation and no SP1 admin has confirmed it yet.
 * Pure; tested in test/route-review.spec.ts.
 */
const route_segmentation_1 = require("./route-segmentation");
const clean = (v) => String(v ?? '').trim();
const key = (v) => clean(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
function snapshotOf(a) {
    if (!a)
        return null;
    const text = [clean(a.streetAddress), clean(a.details), [a.district, a.canton, a.province].map(clean).filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    if (!text)
        return null;
    return {
        text,
        province: clean(a.province) || null, canton: clean(a.canton) || null, district: clean(a.district) || null,
        requiresEncomienda: typeof a.requiresEncomienda === 'boolean' ? a.requiresEncomienda : null,
    };
}
/** Did the part of the address that decides the route change? (street, zone, encomienda need) */
function addressMovedForRoute(prev, next) {
    const f = (a) => a ? [a.streetAddress, a.province, a.canton, a.district].map(key).join('|') + `|${a.requiresEncomienda === true}` : '';
    return f(prev) !== f(next);
}
/** The route map decides (province/canton/district); the stored flag only for zones the map does not know. */
function encomiendaConflictOf(ruta, next) {
    if (!next)
        return null;
    const byMap = (0, route_segmentation_1.mapRequiresEncomienda)(next);
    const requires = byMap ?? (typeof next.requiresEncomienda === 'boolean' ? next.requiresEncomienda : null);
    if (requires === null)
        return null;
    const isEnc = (0, route_segmentation_1.sameRoute)(ruta, 'Encomiendas');
    if (isEnc && requires === false)
        return 'La ruta es Encomiendas pero la dirección nueva está en el área metropolitana';
    if (!isEnc && requires === true)
        return 'La dirección nueva está fuera del área metropolitana (requiere encomienda) y la ruta no es Encomiendas';
    return null;
}
/**
 * The review to open when the principal address changed, else null. A still-open review is replaced by the new
 * one (the latest address is what matters); the log keeps both.
 */
/** The route before the current one, from the customer's routeHistory (latest change into the current route). */
function previousRutaOf(currentRuta, history) {
    if (!Array.isArray(history))
        return null;
    for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i] || {};
        if ((0, route_segmentation_1.sameRoute)(h.newRuta, currentRuta) && clean(h.previousRuta) && !(0, route_segmentation_1.sameRoute)(h.previousRuta, currentRuta))
            return clean(h.previousRuta);
    }
    return null;
}
const zoneOf = (a) => a ? [a.district, a.canton, a.province].filter(Boolean).join(', ') || a.text : '';
/** One plain paragraph: what happened, what the route is, what is recommended, that nothing changed by itself. */
function reviewSummary(r) {
    const who = r.changedBy === 'client' ? 'El cliente' : 'Un administrador';
    const moved = r.previousAddress ? `${who} cambió la dirección de entrega de ${zoneOf(r.previousAddress)} a ${zoneOf(r.newAddress)}` : `${who} registró su primera dirección de entrega (${zoneOf(r.newAddress)})`;
    const current = r.currentRuta ? `Ruta actual: ${r.currentRuta}${r.previousRuta ? ` (antes era ${r.previousRuta})` : ''}` : 'El cliente no tiene ruta asignada';
    const rec = r.suggestedRuta ? `Ruta recomendada según la segmentación: ${r.suggestedRuta}${r.matchesSuggestion ? ' (coincide con la actual)' : ''}` : 'No hay recomendación para esta zona: elige la ruta';
    return `${moved}. ${current}. ${rec}.${r.encomiendaConflict ? ` ATENCIÓN: ${r.encomiendaConflict}.` : ''} No es un error del sistema: la ruta no se cambia sola, un administrador debe revisarla y confirmarla.`;
}
function computeRouteReview(prev, next, currentRuta, meta) {
    const nextSnap = snapshotOf(next);
    if (!nextSnap)
        return null;
    const prevSnap = snapshotOf(prev);
    if (prevSnap && !addressMovedForRoute(prev, next))
        return null;
    const suggestion = (0, route_segmentation_1.suggestRoute)(next);
    const ruta = clean(currentRuta) || null;
    const base = {
        id: `rr_${meta.now.replace(/[^0-9]/g, '').slice(0, 17)}`,
        status: 'pending',
        reason: prevSnap ? 'address_changed' : 'first_address',
        createdAt: meta.now,
        changedBy: meta.changedBy || 'client',
        previousAddress: prevSnap,
        newAddress: nextSnap,
        currentRuta: ruta,
        suggestedRuta: suggestion?.route ?? null,
        suggestionBasis: suggestion?.basis ?? null,
        matchesSuggestion: !!suggestion && (0, route_segmentation_1.sameRoute)(ruta, suggestion.route),
        encomiendaConflict: encomiendaConflictOf(ruta, next),
        previousRuta: previousRutaOf(ruta, meta.routeHistory),
    };
    return { ...base, summary: reviewSummary(base) };
}
/** The review closed by an admin decision (SP1 or SP2). */
function resolveReview(review, finalRuta, by, where, now) {
    const decision = review.suggestedRuta && (0, route_segmentation_1.sameRoute)(finalRuta, review.suggestedRuta) ? 'accepted_suggestion'
        : (0, route_segmentation_1.sameRoute)(finalRuta, review.currentRuta) ? 'kept_current' : 'chose_other';
    return {
        ...review, status: 'resolved', resolvedAt: now, resolvedBy: by, resolvedIn: where, decision, finalRuta,
        // Decided in SP1 = already confirmed in SP1.
        sp1ConfirmedAt: where === 'sp1' ? now : (review.sp1ConfirmedAt ?? null),
        sp1ConfirmedBy: where === 'sp1' ? by : (review.sp1ConfirmedBy ?? null),
    };
}
/** Nova shows the "Revisar ruta" badge while this is true. */
function needsSp1Review(review) {
    if (!review)
        return false;
    if (review.status === 'pending')
        return true;
    return review.decision !== 'accepted_suggestion' && !review.sp1ConfirmedAt;
}
/**
 * The customer's routeReview after an SP2 → SP1 sync, and what to log:
 *   - the principal address moved → a new pending review (an open one is replaced — the latest address counts);
 *   - SP2 sent the admin's decision for the open review (same id) → resolved in SP2.
 * `events` empty = nothing changes.
 */
function nextRouteReviewState(args) {
    const events = [];
    let review = args.existing ?? null;
    const opened = computeRouteReview(args.prevAddress, args.nextAddress, args.ruta, { now: args.now, changedBy: args.changedBy, routeHistory: args.routeHistory });
    if (opened) {
        events.push({ event: review?.status === 'pending' ? 'replaced' : 'created', review: opened, previous: review });
        review = opened;
    }
    const inc = args.incomingSp2;
    if (review && review.status === 'pending' && inc && inc.status === 'resolved' && inc.id === review.id && inc.finalRuta) {
        review = {
            ...review, status: 'resolved', resolvedAt: inc.resolvedAt ?? args.now, resolvedBy: inc.resolvedBy ?? 'sp2_admin', resolvedIn: 'sp2',
            decision: inc.decision ?? null, finalRuta: inc.finalRuta, sp1ConfirmedAt: null, sp1ConfirmedBy: null,
        };
        events.push({ event: 'resolved_in_sp2', review });
    }
    const set = args.sp2RouteSet;
    const setMs = set ? Date.parse(String(set.at ?? '')) : NaN;
    if (!opened && review && review.status === 'pending' && set && clean(set.ruta) && Number.isFinite(setMs) && setMs >= Date.parse(review.createdAt)) {
        review = { ...resolveReview(review, clean(set.ruta), clean(set.by) || 'sp2_admin', 'sp2', args.now), sp1ConfirmedAt: null, sp1ConfirmedBy: null };
        events.push({ event: 'resolved_in_sp2', review });
    }
    return { review, events };
}
/** An SP1 admin changed the route directly (customer edit) while a review was open → that is the decision. */
function resolveOnSp1RouteEdit(review, newRuta, by, now) {
    if (!review || review.status !== 'pending' || !clean(newRuta))
        return null;
    return resolveReview(review, clean(newRuta), by, 'sp1', now);
}
// ── Packages still in process on the previous route ────────────────────────────────────────────────
const FINAL_STATUS = new Set(['delivered', 'returned', 'cancelled', 'canceled', 'annulled']);
/** Open packages of the customer (not delivered/returned/cancelled) whose route is not the customer's new route. */
function openPackagesOnOtherRoute(pkgs, newRuta) {
    return pkgs
        .filter((p) => !FINAL_STATUS.has(String(p.status || '').toLowerCase()) && !/^entregad/i.test(String(p.statusLabel || '')))
        .filter((p) => !(0, route_segmentation_1.sameRoute)(p.ruta, newRuta))
        .map((p) => ({ id: p.id, tracking: String(p.trackingNumber || p.tracking || p.id), ruta: p.ruta ?? null, status: p.status ?? null, statusLabel: p.statusLabel ?? null }));
}
/** The flag Nova listens to: something about this customer's route needs an admin. */
function routeAttentionOf(review, packagesOnPreviousRoute) {
    return needsSp1Review(review) || Number(packagesOnPreviousRoute?.count || 0) > 0;
}
//# sourceMappingURL=route-review.js.map