/**
 * "Revisar ruta" in SP1 / Nova (2026-09-27): a LIVE list of the customers whose route needs an admin
 * (customers.routeAttention, kept by the onCustomerWritten trigger — see functions/src/customers/route-review.ts).
 * One Firestore listener for the whole app: the badge appears and disappears by itself as soon as a review is
 * opened, decided in SP2, confirmed here or the packages are moved. No 10-minute customer cache involved.
 *
 * Also a tiny store to open the decision dialog from anywhere (Nova row badge, Nova route dropdown, Clientes).
 */
import { useSyncExternalStore } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";

export interface RouteReviewInfo {
  id: string;
  status: "pending" | "resolved";
  reason: string;
  createdAt: string;
  changedBy: string;
  previousAddress: { text: string; province?: string | null; canton?: string | null; district?: string | null } | null;
  newAddress: { text: string; province?: string | null; canton?: string | null; district?: string | null; requiresEncomienda?: boolean | null };
  currentRuta: string | null;
  previousRuta?: string | null;
  suggestedRuta: string | null;
  suggestionBasis: string | null;
  matchesSuggestion: boolean;
  encomiendaConflict: string | null;
  summary?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedIn?: "sp1" | "sp2" | null;
  decision?: "accepted_suggestion" | "chose_other" | "kept_current" | null;
  finalRuta?: string | null;
  sp1ConfirmedAt?: string | null;
}

export interface RouteAttention {
  slCode: string;
  fullName: string;
  ruta: string | null;
  review: RouteReviewInfo | null;
  packagesOnPreviousRoute: { count: number; items: Array<{ id: string; tracking: string; ruta: string | null; status: string | null; statusLabel: string | null }>; previousRuta: string | null; newRuta: string | null } | null;
}

type Snapshot = ReadonlyMap<string, RouteAttention>;
let current: Snapshot = new Map();
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

let authWatch: (() => void) | null = null;

function listen() {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(
    query(collection(db, "customers"), where("routeAttention", "==", true)),
    (snap) => {
      const next = new Map<string, RouteAttention>();
      snap.forEach((d) => {
        const x = d.data() as any;
        const sl = String(x.slCode || d.id).toUpperCase();
        next.set(sl, { slCode: sl, fullName: x.fullName || sl, ruta: x.ruta ?? null, review: x.routeReview ?? null, packagesOnPreviousRoute: x.packagesOnPreviousRoute ?? null });
      });
      current = next;
      listeners.forEach((l) => l());
    },
    (err) => { console.warn("[route-attention] listener failed", err); unsubscribe = null; },
  );
}

/** Listen only while someone is signed in (the login page has no access to customers). */
function start() {
  if (authWatch) return;
  try {
    authWatch = onAuthStateChanged(auth, (user) => {
      if (user) listen();
      else { unsubscribe?.(); unsubscribe = null; current = new Map(); listeners.forEach((l) => l()); }
    });
  } catch (err) {
    console.warn("[route-attention] could not start", err);
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => { listeners.delete(l); };
}

/** Live map slCode → what needs attention. */
export function useRouteAttentionMap(): Snapshot {
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** Live info for one customer (null = nothing to review). */
export function useRouteAttention(slCode: string | null | undefined): RouteAttention | null {
  const map = useRouteAttentionMap();
  return slCode ? map.get(String(slCode).toUpperCase()) ?? null : null;
}

/** Non-hook read (e.g. inside a click handler). */
export function getRouteAttention(slCode: string | null | undefined): RouteAttention | null {
  return slCode ? current.get(String(slCode).toUpperCase()) ?? null : null;
}

// ── Decision dialog store ──────────────────────────────────────────────────────
export interface RouteDialogRequest { slCode: string; preselect?: string | null; onApplied?: (ruta: string) => void }
let dialog: RouteDialogRequest | null = null;
const dialogListeners = new Set<() => void>();
export function openRouteReviewDialog(req: RouteDialogRequest) { dialog = req; dialogListeners.forEach((l) => l()); }
export function closeRouteReviewDialog() { dialog = null; dialogListeners.forEach((l) => l()); }
export function useRouteReviewDialog(): RouteDialogRequest | null {
  return useSyncExternalStore((l) => { dialogListeners.add(l); return () => { dialogListeners.delete(l); }; }, () => dialog, () => dialog);
}

/** Plain Spanish labels. */
export const DECISION_LABEL: Record<string, string> = {
  accepted_suggestion: "aceptó la ruta recomendada",
  chose_other: "eligió otra ruta (no la recomendada)",
  kept_current: "mantuvo la ruta actual (no la recomendada)",
};
