/**
 * Route decision dialog (2026-09-27) — mounted once (RouteReviewDialogHost), opened from the "Revisar ruta" badge,
 * from Nova's route dropdown (customer with an open review) or from Clientes.
 *
 * 1. Explains what happened in plain words (the server-made summary), previous → new address, current route
 *    (and the route before it), the RECOMMENDATION (never applied by itself) and any encomienda conflict.
 * 2. The admin picks: accept the recommendation, another route, or keep the current one.
 * 3. Confirmation step: "this updates SP1 (Clientes/Nova), SmartWeb (SP2) and Nova learning".
 * 4. Applies (slResolveRouteReview), optionally moves packages in process (slMovePackagesToCustomerRoute),
 *    then verifies the route is the same everywhere (slCheckRouteIntegrity) and shows each check.
 */
import React, { useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, ArrowRight, MapPinned, Package } from "lucide-react";
import { app } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { patchCustomerRutaInCache } from "@/lib/services/customer-matcher";
import { updateCustomerRuta } from "@/lib/services/customer-sync";
import {
  useRouteReviewDialog, closeRouteReviewDialog, getRouteAttention, useRouteAttention, DECISION_LABEL,
} from "@/lib/route-review/route-attention";

const ROUTES = ["Alajuela", "Cartago 1", "Cartago 2", "Encomiendas", "Heredia", "Occidente", "Retira", "San Jose Centro", "San Jose Coronado", "San Jose Escazu"];
const fns = () => getFunctions(app, "us-central1");

/** Everything verified. Without a review (only packages on the previous route) SP2 is not part of it: a Nova route edit stays in SP1. */
const allOk = (res: { ruta: string; viaReview: boolean; integrity: Integrity | null }) => {
  const i = res.integrity;
  if (!i) return false;
  if (res.viaReview) return i.ok;
  return i.sp1 === res.ruta && i.learningEntriesOnOtherRoute === 0 && i.openPackagesOnOtherRoute === 0 && !i.reviewPending;
};

interface Integrity { ok: boolean; sp1: string | null; sp2: string | null; sp2Matches: boolean; learningEntriesOnOtherRoute: number; openPackagesOnOtherRoute: number; reviewPending: boolean }

export function RouteReviewDialogHost() {
  const req = useRouteReviewDialog();
  const live = useRouteAttention(req?.slCode);
  // Keep showing what was opened even after the live flag goes off (the result screen).
  const [snapshot, setSnapshot] = useState(() => (req ? getRouteAttention(req.slCode) : null));
  const [choice, setChoice] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "confirm" | "done">("choose");
  const [movePkgs, setMovePkgs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ruta: string; sp2Updated: boolean; sp2Error: string | null; moved: number; integrity: Integrity | null; viaReview: boolean } | null>(null);

  useEffect(() => {
    if (!req) return;
    setSnapshot(getRouteAttention(req.slCode));
    setChoice(req.preselect || null);
    setStep(req.preselect ? "confirm" : "choose");
    setMovePkgs(true); setBusy(false); setError(null); setResult(null);
  }, [req]);
  useEffect(() => { if (live && step !== "done") setSnapshot(live); }, [live, step]);

  const a = snapshot;
  const r = a?.review ?? null;
  const pending = r?.status === "pending";
  const needsConfirm = !!r && r.status === "resolved" && r.decision !== "accepted_suggestion" && !r.sp1ConfirmedAt;
  // Packages in process that would be left on another route with the chosen one (asked to the server when
  // the admin picks a route); before a choice, the list the trigger flagged.
  const [candidatePkgs, setCandidatePkgs] = useState<Array<{ id: string; tracking: string; ruta: string | null; status: string | null; statusLabel: string | null }> | null>(null);
  useEffect(() => {
    let alive = true;
    setCandidatePkgs(null);
    if (!req || !choice) return;
    httpsCallable(fns(), "slCheckRouteIntegrity")({ slCode: req.slCode, ruta: choice })
      .then((res: any) => { if (alive) setCandidatePkgs(res?.data?.packagesForCandidate ?? []); })
      .catch(() => { if (alive) setCandidatePkgs(null); });
    return () => { alive = false; };
  }, [req, choice]);
  const pkgs = candidatePkgs ?? a?.packagesOnPreviousRoute?.items ?? [];
  const title = useMemo(() => (step === "done" ? "Ruta confirmada" : pending ? "Revisar ruta: el cliente cambió su dirección" : needsConfirm ? "Confirmar la ruta decidida en SmartWeb" : "Paquetes en la ruta anterior"), [step, pending, needsConfirm]);

  if (!req || !a) return null;

  const apply = async () => {
    if (!choice) return;
    setBusy(true); setError(null);
    try {
      let sp2Updated = true; let sp2Error: string | null = null;
      if (r && (pending || needsConfirm)) {
        const res: any = (await httpsCallable(fns(), "slResolveRouteReview")({ slCode: a.slCode, ruta: choice, action: pending ? "decide" : "confirm" })).data;
        sp2Updated = !!res?.sp2Updated; sp2Error = res?.sp2Error ?? null;
      } else {
        // Only packages on the previous route (no review to decide): the chosen route is saved on the customer FIRST —
        // same as any Nova route edit (SP1; the Nova route stays in SP1) — so the packages move to the NEW route.
        // Before, the move ran against the customer's old route (or none: "El cliente no tiene ruta asignada").
        await updateCustomerRuta(a.slCode, choice, false, "nova_route_picker");
      }
      let moved = 0;
      if (movePkgs && pkgs.length) {
        const mv: any = (await httpsCallable(fns(), "slMovePackagesToCustomerRoute")({ slCode: a.slCode, packageIds: pkgs.map((p) => p.id) })).data;
        moved = mv?.moved?.length || 0;
      }
      patchCustomerRutaInCache(a.slCode, choice);
      window.dispatchEvent(new CustomEvent("customer-ruta-updated", { detail: { slCode: a.slCode, ruta: choice } }));
      req.onApplied?.(choice);
      // The learning update runs in the SP1 trigger: give it a moment, then verify everything.
      let integrity: Integrity | null = null;
      for (let i = 0; i < 4; i++) {
        await new Promise((ok) => setTimeout(ok, i === 0 ? 1500 : 2000));
        integrity = (await httpsCallable(fns(), "slCheckRouteIntegrity")({ slCode: a.slCode })).data as Integrity;
        if (integrity.ok) break;
      }
      setResult({ ruta: choice, sp2Updated, sp2Error, moved, integrity, viaReview: !!(r && (pending || needsConfirm)) });
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "No se pudo aplicar la ruta");
    } finally {
      setBusy(false);
    }
  };

  const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}<span>{children}</span></li>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) closeRouteReviewDialog(); }}>
      <DialogContent data-testid="route-review-dialog" className="max-w-2xl">
        <DialogTitle className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-amber-600" />{title}</DialogTitle>
        <DialogDescription className="font-mono text-xs">{a.fullName} · {a.slCode}</DialogDescription>

        {step !== "done" && (
          <div className="space-y-3 text-sm">
            {r?.summary && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" data-testid="route-review-summary">{r.summary}</p>}
            {r?.encomiendaConflict && (
              <p className="flex items-start gap-2 rounded-lg border-2 border-red-500 bg-red-50 p-2 font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{r.encomiendaConflict}
              </p>
            )}
            {r && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                <div className="rounded-md border p-2"><div className="font-bold text-muted-foreground">Dirección anterior</div>{r.previousAddress?.text || "—"}</div>
                <div className="rounded-md border p-2"><div className="font-bold text-muted-foreground">Dirección nueva</div>{r.newAddress?.text}</div>
                <div className="rounded-md border p-2"><div className="font-bold text-muted-foreground">Ruta actual</div>{a.ruta || "Sin ruta"}{r.previousRuta ? <span className="text-muted-foreground"> (antes era {r.previousRuta})</span> : null}</div>
                <div className="rounded-md border border-emerald-400 bg-emerald-50 p-2 dark:bg-emerald-950/30"><div className="font-bold text-emerald-800 dark:text-emerald-200">Recomendada (no se asigna sola)</div>{r.suggestedRuta || "Sin recomendación para esta zona"}{r.suggestionBasis ? <div className="text-[11px] text-muted-foreground">{r.suggestionBasis}</div> : null}</div>
              </div>
            )}
            {needsConfirm && r && (
              <p className="text-xs">En SmartWeb, {r.resolvedBy} {DECISION_LABEL[r.decision || ""] || "decidió"}: <b>{r.finalRuta}</b>. Confírmala o elige la correcta.</p>
            )}
            {pkgs.length > 0 && (
              <div className="rounded-md border p-2 text-xs">
                <div className="mb-1 flex items-center gap-1 font-bold"><Package className="h-3.5 w-3.5" />{pkgs.length} paquete(s) en proceso con otra ruta</div>
                <ul className="max-h-24 overflow-y-auto font-mono">{pkgs.map((p) => <li key={p.id}>{p.tracking} — {p.ruta || "sin ruta"} · {p.statusLabel || p.status}</li>)}</ul>
                <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={movePkgs} onChange={(e) => setMovePkgs(e.target.checked)} data-testid="route-review-move" />Moverlos a la ruta elegida</label>
              </div>
            )}

            {step === "choose" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {r?.suggestedRuta && <Button size="sm" data-testid="route-review-accept" onClick={() => { setChoice(r.suggestedRuta!); setStep("confirm"); }} className="bg-emerald-600 text-white hover:bg-emerald-700">Aceptar recomendación: {r.suggestedRuta}</Button>}
                  {(needsConfirm && r?.finalRuta) && <Button size="sm" variant="outline" data-testid="route-review-keep-sp2" onClick={() => { setChoice(r.finalRuta!); setStep("confirm"); }}>Confirmar {r.finalRuta}</Button>}
                  {a.ruta && <Button size="sm" variant="outline" data-testid="route-review-keep" onClick={() => { setChoice(a.ruta!); setStep("confirm"); }}>Mantener {a.ruta}</Button>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span>Otra ruta:</span>
                  <select data-testid="route-review-select" className="rounded border px-2 py-1" value="" onChange={(e) => { if (e.target.value) { setChoice(e.target.value); setStep("confirm"); } }}>
                    <option value="">Elegir…</option>
                    {ROUTES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
              </div>
            )}

            {step === "confirm" && choice && (
              <div className="rounded-lg border-2 border-slate-800 p-3" data-testid="route-review-confirm">
                <p className="flex items-center gap-2 font-bold">{a.ruta || "Sin ruta"} <ArrowRight className="h-4 w-4" /> {choice}{r?.suggestedRuta && choice !== r.suggestedRuta ? <span className="rounded bg-amber-200 px-1 text-[10px] font-bold text-amber-900">no es la recomendada</span> : null}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r && (pending || needsConfirm) ? "Se actualiza en SP1 (Clientes y Nova), en SmartWeb (SP2) y en el aprendizaje de Nova" : "Se actualiza en SP1 (Clientes y Nova) y en el aprendizaje de Nova"}{movePkgs && pkgs.length ? `, y se mueven ${pkgs.length} paquete(s)` : ""}. Queda registrado con tu usuario.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setStep("choose")}>Atrás</Button>
                  <Button size="sm" disabled={busy} data-testid="route-review-apply" onClick={apply} className="bg-slate-900 text-white">{busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Aplicando y verificando…</> : `Confirmar ruta ${choice}`}</Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-red-600" data-testid="route-review-error">{error}</p>}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-2 text-sm" data-testid="route-review-done">
            <p className={cn("font-bold", allOk(result) ? "text-emerald-700" : "text-amber-700")}>
              {allOk(result) ? (result.viaReview ? `Ruta ${result.ruta} aplicada y verificada en todos lados.` : `Ruta ${result.ruta} aplicada y verificada.`) : `Ruta ${result.ruta} aplicada. Revisa los puntos en rojo.`}
            </p>
            <ul className="space-y-1 text-xs" data-testid="route-review-integrity">
              <Check ok={result.integrity?.sp1 === result.ruta}>SP1 (Clientes / Nova): {result.integrity?.sp1 || "—"}</Check>
              {result.viaReview
                ? <Check ok={!!result.integrity?.sp2Matches}>SmartWeb (SP2): {result.integrity?.sp2 || "—"}{result.sp2Error ? ` — ${result.sp2Error}` : ""}</Check>
                : <li className="text-muted-foreground" data-testid="route-review-sp2-unchanged">SmartWeb (SP2): no cambia desde Nova ({result.integrity?.sp2 || "—"})</li>}
              <Check ok={(result.integrity?.learningEntriesOnOtherRoute ?? 1) === 0}>Aprendizaje de Nova: {result.integrity?.learningEntriesOnOtherRoute ? `${result.integrity.learningEntriesOnOtherRoute} registro(s) con otra ruta` : "al día"}</Check>
              <Check ok={(result.integrity?.openPackagesOnOtherRoute ?? 1) === 0}>Paquetes en proceso: {result.integrity?.openPackagesOnOtherRoute ? `${result.integrity.openPackagesOnOtherRoute} con otra ruta` : `todos en ${result.ruta}`}{result.moved ? ` (${result.moved} movidos)` : ""}</Check>
              <Check ok={!result.integrity?.reviewPending}>Revisión cerrada</Check>
            </ul>
            <Button size="sm" onClick={closeRouteReviewDialog} data-testid="route-review-close">Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
