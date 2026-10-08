import { describe, it, expect } from 'vitest';
import { computeRouteReview, resolveReview, needsSp1Review, encomiendaConflictOf } from '../src/customers/route-review';

const NOW = '2026-09-27T20:00:00.000Z';
const GUANA = { streetAddress: 'Frente a la iglesia', province: 'Guanacaste', canton: 'Liberia', district: 'Liberia Centro', requiresEncomienda: true };
const ALAJ = { streetAddress: 'Del parque 100 m norte', province: 'Alajuela', canton: 'Central', district: 'Alajuela Centro', requiresEncomienda: false };

describe('Revisar ruta — opened when the address changes', () => {
  it('Guanacaste → Alajuela with ruta Encomiendas: pending, suggests Alajuela, flags the encomienda conflict', () => {
    const r = computeRouteReview(GUANA, ALAJ, 'Encomiendas', { now: NOW, changedBy: 'client' })!;
    expect(r).toMatchObject({ status: 'pending', reason: 'address_changed', currentRuta: 'Encomiendas', suggestedRuta: 'Alajuela', matchesSuggestion: false, changedBy: 'client' });
    expect(r.encomiendaConflict).toMatch(/Encomiendas.*área metropolitana/);
    expect(r.previousAddress!.province).toBe('Guanacaste');
    expect(r.newAddress.text).toContain('Alajuela Centro');
  });
  it('Alajuela → Guanacaste with a city route: suggests Encomiendas and flags it', () => {
    const r = computeRouteReview(ALAJ, GUANA, 'Alajuela', { now: NOW, changedBy: 'admin' })!;
    expect(r.suggestedRuta).toBe('Encomiendas');
    expect(r.encomiendaConflict).toMatch(/fuera del área metropolitana/);
  });
  it('a change that keeps the route still opens a review (the admin confirms), marked as matching', () => {
    const r = computeRouteReview(ALAJ, { ...ALAJ, streetAddress: 'Del parque 300 m sur' }, 'Alajuela', { now: NOW, changedBy: 'client' })!;
    expect(r).toMatchObject({ status: 'pending', matchesSuggestion: true, encomiendaConflict: null });
  });
  it('first address → review "first_address"; same address (only instructions/recipient) → none', () => {
    expect(computeRouteReview(null, ALAJ, null, { now: NOW, changedBy: 'client' })!.reason).toBe('first_address');
    expect(computeRouteReview(ALAJ, { ...ALAJ, deliveryInstructions: 'Llamar', recipientName: 'Ana' }, 'Alajuela', { now: NOW, changedBy: 'client' })).toBeNull();
    expect(computeRouteReview(ALAJ, null, 'Alajuela', { now: NOW, changedBy: 'client' })).toBeNull();
  });
});

describe('decision and the Nova badge', () => {
  const r = computeRouteReview(GUANA, ALAJ, 'Encomiendas', { now: NOW, changedBy: 'client' })!;
  it('pending → Nova shows the badge', () => expect(needsSp1Review(r)).toBe(true));
  it('SP2 accepts the recommendation → no badge in Nova', () => {
    const x = resolveReview(r, 'Alajuela', 'gerencia@x', 'sp2', NOW);
    expect(x).toMatchObject({ status: 'resolved', decision: 'accepted_suggestion', finalRuta: 'Alajuela', resolvedIn: 'sp2' });
    expect(needsSp1Review(x)).toBe(false);
  });
  it('SP2 keeps / chooses another route → Nova KEEPS the badge until an SP1 admin confirms', () => {
    const kept = resolveReview(r, 'Encomiendas', 'gerencia@x', 'sp2', NOW);
    expect(kept.decision).toBe('kept_current');
    expect(needsSp1Review(kept)).toBe(true);
    const other = resolveReview(r, 'Heredia', 'gerencia@x', 'sp2', NOW);
    expect(other.decision).toBe('chose_other');
    expect(needsSp1Review(other)).toBe(true);
    expect(needsSp1Review({ ...other, sp1ConfirmedAt: NOW, sp1ConfirmedBy: 'ops@x' })).toBe(false);
  });
  it('decided in SP1 → confirmed, no badge', () => {
    expect(needsSp1Review(resolveReview(r, 'Heredia', 'ops@x', 'sp1', NOW))).toBe(false);
  });
  it('no review → no badge; legacy address (no requiresEncomienda) → no conflict claimed', () => {
    expect(needsSp1Review(null)).toBe(false);
    expect(encomiendaConflictOf('Encomiendas', { province: 'Alajuela' })).toBeNull();
  });
});

import { nextRouteReviewState } from '../src/customers/route-review';
describe('nextRouteReviewState — what the SP2 → SP1 sync writes', () => {
  const base = { prevAddress: GUANA, nextAddress: ALAJ, ruta: 'Encomiendas', incomingSp2: null, changedBy: 'client', now: NOW };
  it('address moved → created; nothing moved → no events', () => {
    const a = nextRouteReviewState({ ...base, existing: null });
    expect(a.events.map((e) => e.event)).toEqual(['created']);
    const b = nextRouteReviewState({ ...base, existing: a.review, prevAddress: ALAJ });
    expect(b.events).toEqual([]);
    expect(b.review).toBe(a.review);
  });
  it('a newer move replaces the open review (latest address counts)', () => {
    const a = nextRouteReviewState({ ...base, existing: null });
    const b = nextRouteReviewState({ ...base, existing: a.review, prevAddress: ALAJ, nextAddress: { ...ALAJ, district: 'Garita' }, now: '2026-09-28T10:00:00.000Z' });
    expect(b.events[0].event).toBe('replaced');
    expect(b.review!.suggestedRuta).toBe('Occidente');
  });
  it("SP2's decision for the SAME review closes it; another id is ignored", () => {
    const a = nextRouteReviewState({ ...base, existing: null });
    const ok = nextRouteReviewState({ ...base, existing: a.review, prevAddress: ALAJ, incomingSp2: { id: a.review!.id, status: 'resolved', finalRuta: 'Heredia', decision: 'chose_other', resolvedBy: 'gerencia@x' } });
    expect(ok.review).toMatchObject({ status: 'resolved', resolvedIn: 'sp2', decision: 'chose_other', finalRuta: 'Heredia' });
    expect(ok.events.map((e) => e.event)).toEqual(['resolved_in_sp2']);
    const other = nextRouteReviewState({ ...base, existing: a.review, prevAddress: ALAJ, incomingSp2: { id: 'rr_old', status: 'resolved', finalRuta: 'Heredia' } });
    expect(other.events).toEqual([]);
  });
});

import { resolveOnSp1RouteEdit } from '../src/customers/route-review';
describe('route set directly (not from the review) closes the open review', () => {
  const base = { prevAddress: GUANA, nextAddress: ALAJ, ruta: 'Encomiendas', incomingSp2: null, changedBy: 'client', now: NOW };
  const open = nextRouteReviewState({ ...base, existing: null }).review!;
  it('SP2 admin set the route AFTER the review opened → resolved in SP2', () => {
    const r = nextRouteReviewState({ ...base, existing: open, prevAddress: ALAJ, sp2RouteSet: { ruta: 'Alajuela', at: '2026-09-27T21:00:00.000Z', by: 'gerencia@x' } });
    expect(r.review).toMatchObject({ status: 'resolved', resolvedIn: 'sp2', decision: 'accepted_suggestion', finalRuta: 'Alajuela' });
  });
  it('an OLD SP2 route setting (before the review) does not close it', () => {
    const r = nextRouteReviewState({ ...base, existing: open, prevAddress: ALAJ, sp2RouteSet: { ruta: 'Encomiendas', at: '2026-01-01T00:00:00.000Z', by: 'x' } });
    expect(r.events).toEqual([]);
    expect(r.review!.status).toBe('pending');
  });
  it('SP1 admin edits the route while open → resolved in SP1 (confirmed); nothing open → null', () => {
    expect(resolveOnSp1RouteEdit(open, 'Heredia', 'ops@x', NOW)).toMatchObject({ status: 'resolved', resolvedIn: 'sp1', decision: 'chose_other', sp1ConfirmedBy: 'ops@x' });
    expect(resolveOnSp1RouteEdit(null, 'Heredia', 'ops@x', NOW)).toBeNull();
  });
});

describe('the review explains itself (no "system error" doubt)', () => {
  it('Encomiendas → shows the route before it and a plain summary', () => {
    const history = [{ previousRuta: 'Alajuela', newRuta: 'Encomiendas', changedAt: '2026-05-01' }];
    const r = computeRouteReview(GUANA, ALAJ, 'Encomiendas', { now: NOW, changedBy: 'client', routeHistory: history })!;
    expect(r.previousRuta).toBe('Alajuela');
    expect(r.summary).toContain('El cliente cambió la dirección de entrega de Liberia Centro, Liberia, Guanacaste a Alajuela Centro, Central, Alajuela');
    expect(r.summary).toContain('Ruta actual: Encomiendas (antes era Alajuela)');
    expect(r.summary).toContain('Ruta recomendada según la segmentación: Alajuela');
    expect(r.summary).toContain('No es un error del sistema');
  });
  it('no history → no previous route; no route → says so', () => {
    expect(computeRouteReview(GUANA, ALAJ, 'Encomiendas', { now: NOW, changedBy: 'admin' })!.previousRuta).toBeNull();
    expect(computeRouteReview(null, ALAJ, null, { now: NOW, changedBy: 'client' })!.summary).toContain('no tiene ruta asignada');
  });
});

import { openPackagesOnOtherRoute } from '../src/customers/route-review';
describe('packages in process left on the previous route', () => {
  it('lists open packages whose route differs; delivered / returned / "Entregado" are ignored', () => {
    const pk = [
      { id: 'a', trackingNumber: 'T1', ruta: 'Encomiendas', status: 'processed', statusLabel: 'Facturado' },
      { id: 'b', trackingNumber: 'T2', ruta: 'Alajuela', status: 'on_route', statusLabel: 'En Aduanas' },
      { id: 'c', trackingNumber: 'T3', ruta: 'Encomiendas', status: 'delivered', statusLabel: 'Entregado' },
      { id: 'd', trackingNumber: 'T4', ruta: 'Encomiendas', status: 'on_route', statusLabel: 'Entregado' },
      { id: 'e', trackingNumber: 'T5', ruta: 'Encomiendas', status: 'returned' },
    ];
    expect(openPackagesOnOtherRoute(pk, 'Alajuela').map((p) => p.tracking)).toEqual(['T1']);
  });
});

import { routeAttentionOf } from '../src/customers/route-review';
describe('routeAttention (the live Nova flag)', () => {
  const r = computeRouteReview(GUANA, ALAJ, 'Encomiendas', { now: NOW, changedBy: 'client' })!;
  it('on while the review needs SP1 or packages are left on the previous route; off otherwise', () => {
    expect(routeAttentionOf(r, null)).toBe(true);
    expect(routeAttentionOf(resolveReview(r, 'Alajuela', 'x', 'sp2', NOW), null)).toBe(false);
    expect(routeAttentionOf(resolveReview(r, 'Alajuela', 'x', 'sp2', NOW), { count: 2 })).toBe(true);
    expect(routeAttentionOf(null, { count: 0 })).toBe(false);
  });
});
