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
import { suggestRoute, sameRoute, mapRequiresEncomienda } from './route-segmentation';

type Addr = Record<string, any> | null | undefined;

export type RouteDecision = 'accepted_suggestion' | 'chose_other' | 'kept_current';

export interface AddressSnapshot {
  text: string;
  province: string | null; canton: string | null; district: string | null;
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

const clean = (v: unknown) => String(v ?? '').trim();
const key = (v: unknown) => clean(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

export function snapshotOf(a: Addr): AddressSnapshot | null {
  if (!a) return null;
  const text = [clean(a.streetAddress), clean(a.details), [a.district, a.canton, a.province].map(clean).filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  if (!text) return null;
  return {
    text,
    province: clean(a.province) || null, canton: clean(a.canton) || null, district: clean(a.district) || null,
    requiresEncomienda: typeof a.requiresEncomienda === 'boolean' ? a.requiresEncomienda : null,
  };
}

/** Did the part of the address that decides the route change? (street, zone, encomienda need) */
export function addressMovedForRoute(prev: Addr, next: Addr): boolean {
  const f = (a: Addr) => a ? [a.streetAddress, a.province, a.canton, a.district].map(key).join('|') + `|${a.requiresEncomienda === true}` : '';
  return f(prev) !== f(next);
}

/** The route map decides (province/canton/district); the stored flag only for zones the map does not know. */
export function encomiendaConflictOf(ruta: unknown, next: Addr): string | null {
  if (!next) return null;
  const byMap = mapRequiresEncomienda(next);
  const requires = byMap ?? (typeof next.requiresEncomienda === 'boolean' ? next.requiresEncomienda : null);
  if (requires === null) return null;
  const isEnc = sameRoute(ruta, 'Encomiendas');
  if (isEnc && requires === false) return 'La ruta es Encomiendas pero la dirección nueva está en el área metropolitana';
  if (!isEnc && requires === true) return 'La dirección nueva está fuera del área metropolitana (requiere encomienda) y la ruta no es Encomiendas';
  return null;
}

/**
 * The review to open when the principal address changed, else null. A still-open review is replaced by the new
 * one (the latest address is what matters); the log keeps both.
 */
/** The route before the current one, from the customer's routeHistory (latest change into the current route). */
export function previousRutaOf(currentRuta: unknown, history: unknown): string | null {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i] || {};
    if (sameRoute(h.newRuta, currentRuta) && clean(h.previousRuta) && !sameRoute(h.previousRuta, currentRuta)) return clean(h.previousRuta);
  }
  return null;
}

const zoneOf = (a: AddressSnapshot | null) => a ? [a.district, a.canton, a.province].filter(Boolean).join(', ') || a.text : '';

/** One plain paragraph: what happened, what the route is, what is recommended, that nothing changed by itself. */
export function reviewSummary(r: Omit<RouteReview, 'summary'>): string {
  const who = r.changedBy === 'client' ? 'El cliente' : 'Un administrador';
  const moved = r.previousAddress ? `${who} cambió la dirección de entrega de ${zoneOf(r.previousAddress)} a ${zoneOf(r.newAddress)}` : `${who} registró su primera dirección de entrega (${zoneOf(r.newAddress)})`;
  const current = r.currentRuta ? `Ruta actual: ${r.currentRuta}${r.previousRuta ? ` (antes era ${r.previousRuta})` : ''}` : 'El cliente no tiene ruta asignada';
  const rec = r.suggestedRuta ? `Ruta recomendada según la segmentación: ${r.suggestedRuta}${r.matchesSuggestion ? ' (coincide con la actual)' : ''}` : 'No hay recomendación para esta zona: elige la ruta';
  return `${moved}. ${current}. ${rec}.${r.encomiendaConflict ? ` ATENCIÓN: ${r.encomiendaConflict}.` : ''} No es un error del sistema: la ruta no se cambia sola, un administrador debe revisarla y confirmarla.`;
}

export function computeRouteReview(prev: Addr, next: Addr, currentRuta: unknown, meta: { now: string; changedBy: string; routeHistory?: unknown }): RouteReview | null {
  const nextSnap = snapshotOf(next);
  if (!nextSnap) return null;
  const prevSnap = snapshotOf(prev);
  if (prevSnap && !addressMovedForRoute(prev, next)) return null;
  const suggestion = suggestRoute(next);
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
    matchesSuggestion: !!suggestion && sameRoute(ruta, suggestion.route),
    encomiendaConflict: encomiendaConflictOf(ruta, next),
    previousRuta: previousRutaOf(ruta, meta.routeHistory),
  } as Omit<RouteReview, 'summary'>;
  return { ...base, summary: reviewSummary(base) };
}

/** The review closed by an admin decision (SP1 or SP2). */
export function resolveReview(review: RouteReview, finalRuta: string, by: string, where: 'sp1' | 'sp2', now: string): RouteReview {
  const decision: RouteDecision = review.suggestedRuta && sameRoute(finalRuta, review.suggestedRuta) ? 'accepted_suggestion'
    : sameRoute(finalRuta, review.currentRuta) ? 'kept_current' : 'chose_other';
  return {
    ...review, status: 'resolved', resolvedAt: now, resolvedBy: by, resolvedIn: where, decision, finalRuta,
    // Decided in SP1 = already confirmed in SP1.
    sp1ConfirmedAt: where === 'sp1' ? now : (review.sp1ConfirmedAt ?? null),
    sp1ConfirmedBy: where === 'sp1' ? by : (review.sp1ConfirmedBy ?? null),
  };
}

/** Nova shows the "Revisar ruta" badge while this is true. */
export function needsSp1Review(review: RouteReview | null | undefined): boolean {
  if (!review) return false;
  if (review.status === 'pending') return true;
  return review.decision !== 'accepted_suggestion' && !review.sp1ConfirmedAt;
}

export interface RouteReviewEvent { event: 'created' | 'replaced' | 'resolved_in_sp2' | 'resolved_in_sp1'; review: RouteReview; previous?: RouteReview | null }

/**
 * The customer's routeReview after an SP2 → SP1 sync, and what to log:
 *   - the principal address moved → a new pending review (an open one is replaced — the latest address counts);
 *   - SP2 sent the admin's decision for the open review (same id) → resolved in SP2.
 * `events` empty = nothing changes.
 */
export function nextRouteReviewState(args: {
  existing: RouteReview | null | undefined;
  prevAddress: Addr; nextAddress: Addr; ruta: unknown;
  incomingSp2: Partial<RouteReview> | null | undefined;
  changedBy: string; now: string;
  routeHistory?: unknown;
  /** An SP2 admin set the route directly (UserModal "Ruta", syncRutaToSp1) — counts as the decision when later than the review. */
  sp2RouteSet?: { ruta: unknown; at: unknown; by: unknown } | null;
}): { review: RouteReview | null; events: RouteReviewEvent[] } {
  const events: RouteReviewEvent[] = [];
  let review: RouteReview | null = args.existing ?? null;
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
export function resolveOnSp1RouteEdit(review: RouteReview | null | undefined, newRuta: unknown, by: string, now: string): RouteReview | null {
  if (!review || review.status !== 'pending' || !clean(newRuta)) return null;
  return resolveReview(review, clean(newRuta), by, 'sp1', now);
}

// ── Packages still in process on the previous route ────────────────────────────────────────────────
const FINAL_STATUS = new Set(['delivered', 'returned', 'cancelled', 'canceled', 'annulled']);
export interface OpenPackageOnRoute { id: string; tracking: string; ruta: string | null; status: string | null; statusLabel: string | null }

/** Open packages of the customer (not delivered/returned/cancelled) whose route is not the customer's new route. */
export function openPackagesOnOtherRoute(pkgs: Array<{ id: string } & Record<string, any>>, newRuta: unknown): OpenPackageOnRoute[] {
  return pkgs
    .filter((p) => !FINAL_STATUS.has(String(p.status || '').toLowerCase()) && !/^entregad/i.test(String(p.statusLabel || '')))
    .filter((p) => !sameRoute(p.ruta, newRuta))
    .map((p) => ({ id: p.id, tracking: String(p.trackingNumber || p.tracking || p.id), ruta: p.ruta ?? null, status: p.status ?? null, statusLabel: p.statusLabel ?? null }));
}

/** The flag Nova listens to: something about this customer's route needs an admin. */
export function routeAttentionOf(review: RouteReview | null | undefined, packagesOnPreviousRoute: { count?: number } | null | undefined): boolean {
  return needsSp1Review(review) || Number(packagesOnPreviousRoute?.count || 0) > 0;
}
