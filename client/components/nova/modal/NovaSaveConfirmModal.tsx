// Pre-save confirmation modal for Nova table saves.
//
// Extracted from NovaTableModal to keep that file focused on the table
// surface itself. The modal's internals are intentionally presentational
// — every piece of business state flows in as props so the component
// can be unit-tested and reused by integrity-sensitive tests without
// spinning up the full Nova table.
//
// Ownership:
//   • State (exchangeRate, overrides, audit reports, invoice breakdown…)
//     lives in the parent NovaTableModal.
//   • This component's only responsibility is rendering that state and
//     delegating operator actions through the supplied callbacks.
//
// Scope of the 4 actions exposed, in order:
//   1. "Solo guardar datos" — packages + manifest doc, never invoices.
//   2. "Re-crear facturas"  — ingest + smart invoice diff.
//   3. "Anular y re-crear"  — opt-in destructive path for protected invoices.
//   4. "Actualizar tipo de cambio" — TC-only correction (shown when the
//      operator's input TC differs from the persisted manifest TC).

import {
  AlertTriangle,
  DatabaseZap,
  FileText,
  GitMerge,
  Loader2,
  ShieldCheck,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { countActiveUnifiedGroups } from "@/lib/utils/nova-invoice-grouping";
import { RECREATE_PROTECTED_STATUSES } from "@/lib/services/invoice-service";
import type { InvoiceManifestBreakdown } from "@/lib/services/invoice-service";

// ── Prop types ──────────────────────────────────────────────────────────────

/** Subset of the Nova row shape this modal reads (only to compute unified-group count). */
export interface SaveConfirmModalRow {
  tracking?: string;
  slCode?: string;
  nombre?: string;
  nombreCliente?: string;
}

export interface SaveConfirmIntegrityReport {
  issues: Array<unknown>;
  summary: {
    repairableManifestRows: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface SaveConfirmPartialSelectionSummary {
  protectedGroups: number;
  preservedTrackings: number;
}

export interface NovaSaveConfirmModalProps {
  /** Controls the dialog visibility. */
  open: boolean;
  /** Close handler — typically setShowSaveConfirm(false) in the parent. */
  onOpenChange: (open: boolean) => void;

  /** Manifest identity + scope summary. */
  /** Manifest identity + scope summary. */
  manifestNumber: string | null;
  activeRowsCount: number;
  manifestReassignedCount: number;
  activeTotalUsd: number;
  fullManifestTotalUsd?: number;
  allRows: SaveConfirmModalRow[];
  mergedInvoices: Record<string, boolean>;
  separateInvoices: Record<string, boolean>;
  partialSelectionSummary: SaveConfirmPartialSelectionSummary;

  /** Exchange-rate context. `tc` is the numeric value currently in the input. */
  tc: number;
  /** Loaded TC from Firestore (undefined/empty for fresh-parse manifests). */
  persistedTc?: string;
  recentManifestTc: { tc: number; daysSince: number } | null;

  /** Origin of the loaded data — drives whether the integrity audit UI shows. */
  dataOrigin: "fresh" | "firestore" | "mega_man";
  integrityReport: SaveConfirmIntegrityReport | null;
  onOpenIntegrityModal: () => void;

  /** Auto-create temp customers affordance. */
  unmatchedByName: Map<string, number[]>;
  autoCreatingTemp: boolean;
  onAutoCreateTempCustomers: () => void;

  /** Invoice-status breakdown; `null` while loading. */
  existingInvoiceBreakdown: InvoiceManifestBreakdown | null;

  /** New props for the Invoice Regeneration Shield */
  existingInvoicesList?: any[];
  protectedActions?: Record<string, 'items_only' | 'overwrite' | 'skip'>;
  onUpdateProtectedAction?: (slCode: string, action: 'items_only' | 'overwrite' | 'skip') => void;
  onUpdateAllProtectedActions?: (action: 'items_only' | 'overwrite' | 'skip') => void;

  activeRouteFilter?: string;
  activeTableFilter?: string;
  totalManifestRowsCount?: number;
  activeClientsCount?: number;
  totalManifestClientsCount?: number;
  selectedCheckboxesCount?: number;

  /** Action callbacks — the modal closes itself first, then delegates. */
  onConfirmSaveOnly: () => void;
  onConfirmRecreate: () => void;
  onConfirmAnnulAndRecreate: () => void;
  onConfirmUpdateTcOnly: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function NovaSaveConfirmModal({
  open,
  onOpenChange,
  manifestNumber,
  activeRowsCount,
  manifestReassignedCount,
  activeTotalUsd,
  fullManifestTotalUsd,
  allRows,
  mergedInvoices,
  separateInvoices,
  partialSelectionSummary,
  tc,
  persistedTc,
  recentManifestTc,
  dataOrigin,
  integrityReport,
  onOpenIntegrityModal,
  unmatchedByName,
  autoCreatingTemp,
  onAutoCreateTempCustomers,
  existingInvoiceBreakdown,
  existingInvoicesList = [],
  protectedActions = {},
  onUpdateProtectedAction,
  onUpdateAllProtectedActions,
  activeRouteFilter,
  activeTableFilter,
  totalManifestRowsCount,
  activeClientsCount,
  totalManifestClientsCount,
  selectedCheckboxesCount = 0,
  onConfirmSaveOnly,
  onConfirmRecreate,
  onConfirmAnnulAndRecreate,
  onConfirmUpdateTcOnly,
}: NovaSaveConfirmModalProps) {
  const close = () => onOpenChange(false);

  // Persisted TC (from Firestore) vs. current operator input. The TC-only
  // action is only meaningful when they diverge.
  const persistedTcNumber = Number(persistedTc || 0);
  const tcDiffers =
    persistedTcNumber > 0 && tc > 0 && Math.abs(tc - persistedTcNumber) >= 0.01;

  const isCheckboxesActive = (selectedCheckboxesCount ?? 0) > 0;
  const isRouteFilterActive = !!activeRouteFilter && activeRouteFilter !== "";
  const isSearchFilterActive = !!activeTableFilter && activeTableFilter.trim() !== "";
  const totalCount = totalManifestRowsCount ?? allRows?.length ?? activeRowsCount;
  const isFilteredView = isSearchFilterActive || isRouteFilterActive;

  // Fallback client count if not explicitly provided
  const resolvedActiveClients = activeClientsCount ?? (
    new Set(allRows.map(r => r.slCode || r.nombre || "").filter(Boolean)).size
  );
  const resolvedTotalClients = totalManifestClientsCount ?? resolvedActiveClients;

  const protectedInvoices = existingInvoicesList.filter((inv) => {
    const s = String(inv.status || "").toLowerCase();
    return RECREATE_PROTECTED_STATUSES.has(s);
  });
  const hasProtected = protectedInvoices.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent
        className="w-full h-[100dvh] left-0 top-0 translate-x-0 translate-y-0 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:bottom-auto sm:right-auto sm:w-[95vw] sm:max-w-3xl lg:max-w-4xl sm:h-auto sm:max-h-[88vh] p-6 sm:p-7 flex flex-col overflow-hidden rounded-none sm:rounded-xl border-none sm:border border-border shadow-2xl bg-background z-[75]"
        data-testid="nova-save-confirm-modal"
      >
        <DialogHeader className="space-y-1 shrink-0 pb-2 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <DatabaseZap className="h-5 w-5 text-primary shrink-0" />
            Confirmar Guardado en Base de Datos
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Manifiesto: <span className="font-mono font-bold text-foreground">{manifestNumber || "—"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
          {/* ── 1. Resumen de Ámbito, Métricas Financieras y Facturas Existentes (Merged Compact Card) ── */}
          {(() => {
            let scopeTitle = "Manifiesto Completo";
            let scopeDesc = `Se guardarán los ${totalCount} paquetes (${resolvedTotalClients} clientes) cargados en el manifiesto actual.`;
            let badgeText = `${totalCount} paq. · ${resolvedTotalClients} ${resolvedTotalClients === 1 ? "cliente" : "clientes"}`;
            let themeBg = "bg-slate-500/10 text-slate-700 dark:text-slate-300";
            let badgeStyle = "bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300/60 dark:border-slate-700";

            if (isCheckboxesActive) {
              scopeTitle = "Selección manual por casillas";
              scopeDesc = `Aplicando cambios únicamente a los ${activeRowsCount} paquetes (${resolvedActiveClients} ${resolvedActiveClients === 1 ? "cliente" : "clientes"}) marcados en la tabla.`;
              badgeText = `${activeRowsCount} paq. · ${resolvedActiveClients} ${resolvedActiveClients === 1 ? "cliente" : "clientes"}`;
              themeBg = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";
              badgeStyle = "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800";
            } else if (isSearchFilterActive) {
              scopeTitle = `Filtro de búsqueda: "${activeTableFilter}"`;
              scopeDesc = `Visualizando ${activeRowsCount} filas (${resolvedActiveClients} ${resolvedActiveClients === 1 ? "cliente" : "clientes"}). Al guardar, se sincroniza el manifiesto completo (${totalCount} paq. · ${resolvedTotalClients} clis.) en BD.`;
              badgeText = `${activeRowsCount} de ${totalCount} paq. · ${resolvedActiveClients} ${resolvedActiveClients === 1 ? "cliente" : "clientes"}`;
              themeBg = "bg-amber-500/15 text-amber-700 dark:text-amber-400";
              badgeStyle = "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-300/60 dark:border-amber-700";
            } else if (isRouteFilterActive) {
              const friendlyRoute = activeRouteFilter === "__sin_ruta__" ? "Sin Ruta" : activeRouteFilter;
              scopeTitle = `Filtro de ruta: ${friendlyRoute}`;
              scopeDesc = `Visualizando los ${activeRowsCount} paquetes (${resolvedActiveClients} ${resolvedActiveClients === 1 ? "cliente" : "clientes"}) de ${friendlyRoute}. Se preservan las demás rutas en el manifiesto completo.`;
              badgeText = `${activeRowsCount} paq. · ${resolvedActiveClients} ${resolvedActiveClients === 1 ? "cliente" : "clientes"}`;
              themeBg = "bg-violet-500/10 text-violet-600 dark:text-violet-400";
              badgeStyle = "bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-800";
            }

            return (
              <div className="rounded-lg border border-border bg-card p-3.5 space-y-3 shadow-2xs">
                {/* Header: Scope Identity */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={cn("p-1.5 rounded-md shrink-0 mt-0.5", themeBg)}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
                        {scopeTitle}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {scopeDesc}
                      </p>
                    </div>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border shrink-0", badgeStyle)}>
                    {badgeText}
                  </span>
                </div>

                {/* Metrics & Existing Invoices integrated in the same row */}
                {isFilteredView ? (
                  <div className="space-y-2 pt-1 border-t border-border/60">
                    <div className={cn(
                      "grid gap-3 text-xs bg-amber-500/10 dark:bg-amber-950/30 p-2.5 rounded-md border border-amber-300/50 dark:border-amber-800/50",
                      existingInvoiceBreakdown !== null && existingInvoiceBreakdown.total > 0
                        ? "grid-cols-2 sm:grid-cols-4"
                        : "grid-cols-2 sm:grid-cols-3"
                    )}>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                          Total Vista Actual
                        </span>
                        <p className="text-sm font-bold text-foreground">
                          ${activeTotalUsd.toFixed(2)} USD
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">Tipo de Cambio</span>
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                          ₡{tc > 0 ? tc.toLocaleString("es-CR") : "—"}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">Colones (Vista)</span>
                        <p className="text-sm font-bold text-foreground">
                          ₡{Math.round(activeTotalUsd * tc).toLocaleString("es-CR")}
                        </p>
                      </div>
                      {existingInvoiceBreakdown !== null && existingInvoiceBreakdown.total > 0 && (
                        <div className="space-y-0.5 col-span-2 sm:col-span-1">
                          <span className="text-[10px] text-muted-foreground">
                            Facturas Previas ({existingInvoiceBreakdown.total})
                          </span>
                          <div className="flex items-center gap-1 flex-wrap pt-0.5">
                            {existingInvoiceBreakdown.drafts > 0 && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-muted text-muted-foreground border">
                                {existingInvoiceBreakdown.drafts} Borr.
                              </span>
                            )}
                            {existingInvoiceBreakdown.sent > 0 && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-300/50">
                                {existingInvoiceBreakdown.sent} Env.
                              </span>
                            )}
                            {existingInvoiceBreakdown.paid > 0 && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/50 font-semibold">
                                {existingInvoiceBreakdown.paid} Pag.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] px-1 text-muted-foreground">
                      <span>Total manifiesto completo en BD ({totalCount} paq. · {resolvedTotalClients} clientes):</span>
                      <span className="font-semibold text-foreground">
                        ${(fullManifestTotalUsd ?? activeTotalUsd).toFixed(2)} USD
                        {tc > 0 && (
                          <span className="font-normal text-muted-foreground ml-1">
                            (₡{Math.round((fullManifestTotalUsd ?? activeTotalUsd) * tc).toLocaleString("es-CR")})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    "grid gap-3 text-xs pt-1 border-t border-border/60",
                    existingInvoiceBreakdown !== null && existingInvoiceBreakdown.total > 0
                      ? "grid-cols-2 sm:grid-cols-4"
                      : "grid-cols-2 sm:grid-cols-3"
                  )}>
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {isCheckboxesActive ? "Total Selección" : "Total Manifiesto"}
                      </span>
                      <p className="text-sm font-bold text-foreground">
                        ${activeTotalUsd.toFixed(2)} USD
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground">Tipo de Cambio</span>
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                        ₡{tc > 0 ? tc.toLocaleString("es-CR") : "—"} / $
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground">Total Colones</span>
                      <p className="text-sm font-bold text-foreground">
                        ₡{Math.round(activeTotalUsd * tc).toLocaleString("es-CR")}
                      </p>
                    </div>
                    {existingInvoiceBreakdown !== null && existingInvoiceBreakdown.total > 0 && (
                      <div className="space-y-0.5 col-span-2 sm:col-span-1">
                        <span className="text-[11px] text-muted-foreground">
                          Facturas Previas ({existingInvoiceBreakdown.total})
                        </span>
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          {existingInvoiceBreakdown.drafts > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground border">
                              {existingInvoiceBreakdown.drafts} Borr.
                            </span>
                          )}
                          {existingInvoiceBreakdown.sent > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-300/50">
                              {existingInvoiceBreakdown.sent} Env.
                            </span>
                          )}
                          {existingInvoiceBreakdown.paid > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/50 font-semibold">
                              {existingInvoiceBreakdown.paid} Pag.
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 2. Advertencias Contextuales (si aplican) ─────────────────── */}
          {unmatchedByName.size > 0 && (
            <div
              data-testid="nova-save-unmatched-temp"
              className="rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 px-3 py-2.5 space-y-2"
            >
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {unmatchedByName.size} cliente{unmatchedByName.size !== 1 ? "s" : ""} sin casillero asignado
              </p>
              <p className="text-[11px] text-orange-700/90 dark:text-orange-300/90 leading-relaxed">
                Estos paquetes no generarán factura a menos que tengan cliente. Puedes auto-crear códigos temporales (SL-NAN) o dejarlos como pendientes.
              </p>
              <button
                type="button"
                onClick={onAutoCreateTempCustomers}
                disabled={autoCreatingTemp}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border border-orange-400/60 bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                data-testid="nova-save-auto-temp-button"
              >
                {autoCreatingTemp ? (
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                Auto-crear {unmatchedByName.size} cliente{unmatchedByName.size !== 1 ? "s" : ""} temporal{unmatchedByName.size !== 1 ? "es" : ""}
              </button>
            </div>
          )}

          {/* 🛡️ Interactive Shield Panel for Protected Invoices */}
          {hasProtected && (
            <div className="rounded-lg border border-primary/20 bg-background/50 p-3 space-y-2 shadow-2xs">
              <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <DatabaseZap className="h-3.5 w-3.5 text-primary shrink-0" />
                    <h4 className="text-xs font-bold text-foreground">
                      Escudo de Facturas Protegidas ({protectedInvoices.length})
                    </h4>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    En <strong>Omitir (por defecto)</strong>, las facturas previas se preservan intactas sin alterar montos ni estados.
                  </p>
                </div>
                {onUpdateAllProtectedActions && (
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-5 px-2 text-[10px] font-medium"
                      onClick={() => onUpdateAllProtectedActions("skip")}
                    >
                      Todos: Omitir (Seguro)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-5 px-2 text-[10px] font-medium"
                      onClick={() => onUpdateAllProtectedActions("items_only")}
                    >
                      Todos: Solo Contenido
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {protectedInvoices.map((inv: any) => {
                        const slCode = String(inv.clientSlCode || inv.slCode || "").toUpperCase();
                        const action = protectedActions[slCode] || "skip";
                        const status = String(inv.status || "").toLowerCase();

                        return (
                          <div
                            key={inv.id || slCode}
                            className="flex items-center justify-between p-1.5 rounded border border-border/60 bg-muted/20 text-xs gap-2"
                          >
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className="font-semibold text-foreground truncate max-w-[130px]">
                                {inv.clientName || inv.slCode}
                              </span>
                              <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground border">
                                {slCode}
                              </span>
                            </div>

                            {onUpdateProtectedAction && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  className={cn(
                                    "px-2 py-0.5 text-[10px] font-semibold border rounded-l transition-all",
                                    action === "skip"
                                      ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                      : "bg-background text-foreground border-border hover:bg-muted/50",
                                  )}
                                  onClick={() => onUpdateProtectedAction(slCode, "skip")}
                                  title="Omitir: No modifica la factura (Seguro)."
                                >
                                  Omitir
                                </button>
                                <button
                                  type="button"
                                  className={cn(
                                    "px-2 py-0.5 text-[10px] font-semibold border-t border-b border-r transition-all",
                                    action === "items_only"
                                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                      : "bg-background text-foreground border-border hover:bg-muted/50",
                                  )}
                                  onClick={() => onUpdateProtectedAction(slCode, "items_only")}
                                  title="Actualizar solo items y pesos (conserva estado de pago/envío)"
                                >
                                  Contenido
                                </button>
                                <button
                                  type="button"
                                  disabled={status === "paid"}
                                  className={cn(
                                    "px-2 py-0.5 text-[10px] font-semibold border-t border-b border-r rounded-r transition-all",
                                    action === "overwrite"
                                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                      : "bg-background text-foreground border-border hover:bg-muted/50 disabled:opacity-40",
                                  )}
                                  onClick={() => onUpdateProtectedAction(slCode, "overwrite")}
                                  title={status === "paid" ? "Facturas pagadas no se resetean" : "Reset a Borrador"}
                                >
                                  Reset
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

          {/* ── TC Divergence Guard (standalone action) ─────────────────── */}
          {tcDiffers && (
            <div
              data-testid="nova-save-tc-card"
              className="rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground text-[11px]">TC en base de datos</span>
                <span className="font-mono text-muted-foreground line-through">
                  ₡{persistedTcNumber.toLocaleString("es-CR")}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-800 dark:text-amber-300 font-semibold text-[11px]">
                  Nuevo TC
                </span>
                <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                  ₡{tc.toLocaleString("es-CR")}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-auto py-1.5 px-2 text-xs flex items-center justify-center gap-1.5 border-amber-400/60 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                onClick={() => {
                  close();
                  onConfirmUpdateTcOnly();
                }}
                data-testid="nova-save-tc-update"
              >
                <TrendingUp className="h-3 w-3 shrink-0" />
                Actualizar solo tipo de cambio (₡{tc})
              </Button>
            </div>
          )}
        </div>

        {/* ── 4. Botones de Acción Claros ─────────────────────────────────── */}
        {(() => {
          const b = existingInvoiceBreakdown;
          const protectedCount = b ? b.sent + b.overdue + b.pending : 0;
          const showAnnulButton = !!b && protectedCount > 0 && b.paid === 0;

          return (
            <div className="space-y-2 shrink-0 pt-3 border-t border-border mt-auto">
              <div
                className={cn(
                  "grid gap-2.5",
                  showAnnulButton
                    ? "grid-cols-1 sm:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2",
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto gap-1 py-2.5 px-3 flex-col items-start text-left whitespace-normal border-primary/30 hover:border-primary/60 hover:bg-primary/5 cursor-pointer"
                  onClick={() => {
                    close();
                    onConfirmSaveOnly();
                  }}
                  title="Solo escribe paquetes y manifiesto. No toca facturas."
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <DatabaseZap className="h-3.5 w-3.5 text-primary shrink-0" />
                    Solo guardar datos en BD
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-snug">
                    Actualiza paquetes y manifiesto. <strong>No modifica ni crea facturas.</strong>
                  </span>
                </Button>

                <Button
                  size="sm"
                  variant={showAnnulButton ? "outline" : "default"}
                  className="h-auto gap-1 py-2.5 px-3 flex-col items-start text-left whitespace-normal cursor-pointer"
                  onClick={() => {
                    close();
                    onConfirmRecreate();
                  }}
                  title="Guarda los datos y genera/actualiza las facturas correspondientes."
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    Guardar y facturar
                  </span>
                  <span className="text-[10px] opacity-90 leading-snug">
                    Guarda los datos en base de datos y genera/actualiza las facturas de cobro.
                  </span>
                </Button>

                {showAnnulButton && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-auto gap-1 py-2.5 px-3 flex-col items-start text-left whitespace-normal cursor-pointer"
                    onClick={() => {
                      close();
                      onConfirmAnnulAndRecreate();
                    }}
                    title={`Anula ${protectedCount} factura(s) protegida(s) y luego regenera todas.`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Anular y re-crear
                    </span>
                    <span className="text-[10px] opacity-90 leading-snug">
                      Anula {protectedCount} factura{protectedCount !== 1 ? "s" : ""} previa{protectedCount !== 1 ? "s" : ""} y regenera desde cero.
                    </span>
                  </Button>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  onClick={close}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
