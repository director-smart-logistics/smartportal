/**
 * slResolveRouteReview — Nova / SP1 "Revisar ruta" (2026-09-27): the admin decides the route of a customer whose
 * address changed. One transaction: customers/{sl} (ruta when it changes + routeReview) and the route_reviews log.
 * A new route goes to SP2 by the existing syncRutaToSp2 path (onCustomerWritten), which also updates Nova learning.
 *
 *   action 'decide'  : the review is pending → close it with `ruta` (the recommendation, another one or the current).
 *   action 'confirm' : it was decided in SP2 without the recommendation → an SP1 admin confirms (optionally changing ruta).
 * Staff only (same roles that may edit a customer).
 */
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { sp2ProjectId } from "../config/sp2-target";
import { canEditCustomerAddress } from "./label-address-sp2";
import { resolveReview, openPackagesOnOtherRoute, type RouteReview } from "./route-review";
import { sameRoute } from "./route-segmentation";

interface Request { slCode?: string; ruta?: string; action?: "decide" | "confirm" }

const ALLOWED = ["Retira", "Heredia", "Cartago 1", "San Jose Centro", "Encomiendas", "San Jose Escazu", "San Jose Coronado", "Alajuela", "Cartago 2", "Occidente"];

function sp2Db(): FirebaseFirestore.Firestore {
  const name = "smart-portal-2";
  const app = getApps().find((a) => a.name === name) || initializeApp({ projectId: sp2ProjectId() }, name);
  return getFirestore(app);
}

type Db = FirebaseFirestore.Firestore;

/** SP2 users/{uid}: route + review, same values as SP1 (never the encomienda of another route). */
async function writeRouteToSp2(slCode: string, review: RouteReview, by: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const q = await sp2Db().collection("users").where("slCode", "==", slCode).limit(2).get();
    if (q.size !== 1) return { ok: false, error: q.empty ? "No hay cuenta en SmartWeb para este SL" : "Hay más de una cuenta en SmartWeb con este SL" };
    const doc = q.docs[0]; const u = doc.data() || {};
    const ruta = review.finalRuta || u.ruta || null;
    const now = new Date().toISOString();
    await doc.ref.update({
      routeReview: review,
      ...(ruta && !sameRoute(u.ruta, ruta) ? {
        ruta, rutaUpdatedByAdmin: true, rutaSetByAdminAt: now, rutaLastUpdatedBy: by,
        routeHistory: [...(Array.isArray(u.routeHistory) ? u.routeHistory : []), { previousRuta: u.ruta || null, newRuta: ruta, changedAt: now, changedBy: by, source: "sp1_route_review", direction: "sp1_to_sp2" }],
        ...(ruta !== "Encomiendas" ? { encomiendaProvider: "", encomiendaServiceName: "" } : {}),
      } : {}),
    });
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

/** Where the customer's route stands in every place that uses it. `ok` = all the same and nothing left behind. */
export async function routeIntegrityCore(db: Db, sp2: Db, slCode: string, candidateRuta?: string | null) {
  const sl = String(slCode || "").trim().toUpperCase();
  const c = await db.collection("customers").doc(sl).get();
  if (!c.exists) throw new HttpsError("not-found", "Cliente no encontrado");
  const ruta = c.get("ruta") || null;
  const q = await sp2.collection("users").where("slCode", "==", sl).limit(2).get();
  const sp2Ruta = q.size === 1 ? (q.docs[0].get("ruta") || null) : null;
  const [fb, pat, bySl, byClient] = await Promise.all([
    db.collection("match_feedback").where("slCode", "==", sl).get(),
    db.collection("manifest_learning_patterns").where("slCode", "==", sl).get(),
    db.collection("packages").where("slCode", "==", sl).get(),
    db.collection("packages").where("clientSlCode", "==", sl).get(),
  ]);
  const learningOff = [...fb.docs, ...pat.docs].filter((d) => "ruta" in d.data() && d.get("ruta") && !sameRoute(d.get("ruta"), ruta)).length;
  const all = new Map<string, any>();
  for (const d of [...bySl.docs, ...byClient.docs]) all.set(d.id, { id: d.id, ...d.data() });
  const packagesOff = openPackagesOnOtherRoute([...all.values()], ruta);
  // Preview for a route about to be chosen (the dialog lists what would be left behind).
  const candidate = candidateRuta ? ALLOWED.find((r) => sameRoute(r, candidateRuta)) || null : null;
  const packagesOffCandidate = candidate ? openPackagesOnOtherRoute([...all.values()], candidate) : null;
  const review = c.get("routeReview") || null;
  const checks = {
    sp1: ruta,
    sp2: q.size === 1 ? sp2Ruta : (q.empty ? "(sin cuenta SmartWeb)" : "(varias cuentas)"),
    sp2Matches: q.size === 1 && sameRoute(sp2Ruta, ruta),
    learningEntriesOnOtherRoute: learningOff,
    openPackagesOnOtherRoute: packagesOff.length,
    reviewPending: review?.status === "pending",
  };
  return { ok: !!ruta && checks.sp2Matches && learningOff === 0 && packagesOff.length === 0 && !checks.reviewPending, ...checks, packages: packagesOff.slice(0, 50),
    ...(packagesOffCandidate ? { candidateRuta: candidate, packagesForCandidate: packagesOffCandidate.slice(0, 50) } : {}) };
}

export async function resolveRouteReviewCore(db: Db, input: Request, by: string, now = new Date().toISOString()): Promise<{ review: RouteReview; rutaChanged: boolean; uid: string | null }> {
  const slCode = String(input.slCode || "").trim().toUpperCase();
  const ruta = ALLOWED.find((r) => sameRoute(r, input.ruta)) || null;
  const action = input.action === "confirm" ? "confirm" : "decide";
  if (!slCode) throw new HttpsError("invalid-argument", "Falta el código SL");
  if (!ruta) throw new HttpsError("invalid-argument", "Ruta no válida");
  const ref = db.collection("customers").doc(slCode);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Cliente no encontrado");
    const c = snap.data() || {};
    const review = c.routeReview as RouteReview | undefined;
    if (!review) throw new HttpsError("failed-precondition", "Este cliente no tiene una revisión de ruta abierta");
    let next: RouteReview;
    if (action === "decide") {
      if (review.status !== "pending") throw new HttpsError("failed-precondition", "La revisión ya fue resuelta");
      next = resolveReview(review, ruta, by, "sp1", now);
    } else {
      if (review.status !== "resolved") throw new HttpsError("failed-precondition", "La revisión sigue pendiente: decide la ruta");
      next = { ...review, finalRuta: ruta, sp1ConfirmedAt: now, sp1ConfirmedBy: by };
    }
    const rutaChanged = !sameRoute(c.ruta, ruta);
    tx.update(ref, {
      routeReview: next,
      // SP2 is written directly below (and confirmed), not through syncRutaToSp2.
      ...(rutaChanged ? {
        ruta, rutaLastUpdatedBy: by, rutaSetByAdminAt: now, rutaUpdatedByAdmin: true,
      } : {}),
      updatedAt: now,
    });
    tx.set(db.collection("route_reviews").doc(), {
      slCode, event: action === "decide" ? "resolved_in_sp1" : "confirmed_in_sp1", at: now, by, reviewId: review.id,
      previousRuta: c.ruta ?? null, finalRuta: ruta, decision: next.decision ?? null, review: next, source: "slResolveRouteReview",
    });
    return { review: next, rutaChanged, uid: (c.uid as string) || null };
  });
}

export const slResolveRouteReview = onCall({ cors: true, invoker: "public" }, async (request: CallableRequest<Request>) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debe iniciar sesión");
  if (!canEditCustomerAddress(request.auth.token.role)) throw new HttpsError("permission-denied", "Solo personal autorizado puede decidir la ruta");
  const by = String(request.auth.token.email || request.auth.uid);
  const db = getFirestore(getApp(), "portal");
  const r = await resolveRouteReviewCore(db, request.data || {}, by);
  // SP2 at once: the route and the review (admin user card), confirmed before answering.
  const slCode = String(request.data?.slCode || "").trim().toUpperCase();
  const sp2 = await writeRouteToSp2(slCode, r.review, by);
  await db.collection("route_reviews").add({ slCode, event: sp2.ok ? "sp2_updated" : "sp2_not_updated", at: new Date().toISOString(), by, ruta: r.review.finalRuta, error: sp2.error, source: "slResolveRouteReview" });
  console.log(`[slResolveRouteReview] ${slCode} → ${r.review.finalRuta} (${r.review.decision}) by ${by}; SP2 ${sp2.ok ? "ok" : sp2.error}`);
  return { success: true, review: r.review, rutaChanged: r.rutaChanged, sp2Updated: sp2.ok, sp2Error: sp2.error };
});

/**
 * slMovePackagesToCustomerRoute — Nova: move the selected packages still in process to the customer's current
 * route (after a route decision). One transaction: each package (only if it is this customer's and still open),
 * the customer's packagesOnPreviousRoute list and the route_reviews log. The package trigger keeps the encomienda
 * manifest in step (a package leaving "Encomiendas" leaves manifest_encomiendas).
 */
export async function movePackagesCore(db: Db, input: { slCode?: string; packageIds?: string[] }, by: string, now = new Date().toISOString()) {
  const slCode = String(input.slCode || "").trim().toUpperCase();
  const ids = Array.from(new Set((input.packageIds || []).map(String))).slice(0, 50);
  if (!slCode || !ids.length) throw new HttpsError("invalid-argument", "Faltan el cliente o los paquetes");
  const cRef = db.collection("customers").doc(slCode);
  return db.runTransaction(async (tx) => {
    const c = await tx.get(cRef);
    if (!c.exists) throw new HttpsError("not-found", "Cliente no encontrado");
    const ruta = String(c.get("ruta") || "").trim();
    if (!ruta) throw new HttpsError("failed-precondition", "El cliente no tiene ruta asignada");
    const snaps = await Promise.all(ids.map((id) => tx.get(db.collection("packages").doc(id))));
    const moved: Array<{ id: string; from: string | null }> = []; const skipped: Array<{ id: string; why: string }> = [];
    for (const s of snaps) {
      const p = s.data();
      if (!s.exists || !p) { skipped.push({ id: s.id, why: "no existe" }); continue; }
      const owner = String(p.clientSlCode || p.slCode || "").trim().toUpperCase();
      if (owner !== slCode) { skipped.push({ id: s.id, why: "es de otro cliente" }); continue; }
      if (openPackagesOnOtherRoute([{ id: s.id, ...p }], ruta).length === 0) { skipped.push({ id: s.id, why: "ya está en la ruta o está cerrado" }); continue; }
      tx.update(s.ref, { ruta, rutaMovedFrom: p.ruta ?? null, rutaMovedAt: now, rutaMovedBy: by, updatedAt: now });
      moved.push({ id: s.id, from: p.ruta ?? null });
    }
    const list = c.get("packagesOnPreviousRoute");
    if (list?.items) {
      const left = (list.items as any[]).filter((i) => !moved.some((m) => m.id === i.id));
      tx.update(cRef, { packagesOnPreviousRoute: left.length ? { ...list, count: left.length, items: left } : null });
    }
    tx.set(db.collection("route_reviews").doc(), { slCode, event: "packages_moved", at: now, by, ruta, moved, skipped, source: "slMovePackagesToCustomerRoute" });
    return { ruta, moved, skipped };
  });
}

export const slMovePackagesToCustomerRoute = onCall({ cors: true, invoker: "public" }, async (request: CallableRequest<{ slCode?: string; packageIds?: string[] }>) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debe iniciar sesión");
  if (!canEditCustomerAddress(request.auth.token.role)) throw new HttpsError("permission-denied", "Solo personal autorizado");
  const by = String(request.auth.token.email || request.auth.uid);
  const r = await movePackagesCore(getFirestore(getApp(), "portal"), request.data || {}, by);
  console.log(`[slMovePackagesToCustomerRoute] ${request.data?.slCode}: ${r.moved.length} moved to ${r.ruta} by ${by}`);
  return { success: true, ...r };
});

export const slCheckRouteIntegrity = onCall({ cors: true, invoker: "public" }, async (request: CallableRequest<{ slCode?: string; ruta?: string }>) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debe iniciar sesión");
  if (!canEditCustomerAddress(request.auth.token.role)) throw new HttpsError("permission-denied", "Solo personal autorizado");
  return routeIntegrityCore(getFirestore(getApp(), "portal"), sp2Db(), String(request.data?.slCode || ""), request.data?.ruta || null);
});
