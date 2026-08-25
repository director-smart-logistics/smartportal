/**
 * SyncInvoicesModal
 *
 * Double-confirmation modal for syncing selected SP1 invoices → SP2 (SmartWeb)
 * customer dashboards. After sync, SP2 customers can view/pay their invoices and
 * the invoice icon on their package cards becomes active.
 *
 * Flow:
 *   Step 1 — Preview   : eligible vs. no-slCode breakdown
 *   Step 2 — Confirm   : first confirmation
 *   Step 3 — Verify    : type "SYNC" as second gate
 *   Step 4 — Processing: calling Cloud Function
 *   Step 5 — Results   : final summary
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Lock,
  XCircle,
  FileText,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvoiceRecord } from "@/lib/services/invoice-service";
import {
  previewSyncInvoices,
  syncInvoicesToSp2,
  type SyncInvoicesResponse,
  type SyncPreview,
} from "@/lib/services/sync-invoices-service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  invoices: InvoiceRecord[];
  onClose: () => void;
  onDone?: (result: SyncInvoicesResponse) => void;
}

type Step = "preview" | "confirm" | "verify" | "processing" | "results";

const CONFIRM_KEYWORD = "SYNC";

// ─── Component ────────────────────────────────────────────────────────────────

export function SyncInvoicesModal({ open, invoices, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>("preview");
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<SyncInvoicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState(
    "Sincronizando facturas con SmartWeb…",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute preview whenever the invoice list changes
  useEffect(() => {
    if (open && invoices.length > 0) {
      setPreview(previewSyncInvoices(invoices));
    }
  }, [open, invoices]);

  // Focus keyword input when on verify step
  useEffect(() => {
    if (step === "verify") {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [step]);

  // Reset all state when the modal opens/closes
  useEffect(() => {
    if (!open) {
      setStep("preview");
      setKeyword("");
      setResult(null);
      setError(null);
      setProgress(0);
    }
  }, [open]);

  const keywordValid = keyword.trim().toUpperCase() === CONFIRM_KEYWORD;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handleClose() {
    if (step === "processing") return;
    onClose();
  }

  async function handleSync() {
    if (!keywordValid) return;
    setStep("processing");
    setError(null);
    setProgress(0);
    setProgressLabel("Sincronizando facturas con SmartWeb…");

    try {
      // IMPORTANT: never include `nonSyncable` (drafts) here — the sync guard
      // would drop them silently and the result would falsely show 0/0/0.
      const toSync = preview
        ? preview.eligible.concat(preview.noSlCode)
        : invoices;
      const res = await syncInvoicesToSp2(toSync, {
        onProgress: (pct, label) => {
          setProgress(pct);
          setProgressLabel(label);
        },
      });
      setProgress(100);
      setResult(res);
      setStep("results");
      onDone?.(res);
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
      setStep("verify");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full h-[100dvh] sm:h-auto sm:max-w-[520px] left-0 top-0 sm:left-[50%] sm:top-[50%] translate-x-0 translate-y-0 sm:translate-x-[-50%] sm:translate-y-[-50%] rounded-none sm:rounded-xl p-4 sm:p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-indigo-500" />
            Sincronizar Facturas → SmartWeb
          </DialogTitle>
          <DialogDescription>
            Crea o actualiza las facturas en las cuentas de los clientes en
            SmartPortal. También activa el ícono de factura en los paquetes
            correspondientes.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Preview ─────────────────────────────────────────────── */}
        {step === "preview" && preview && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Con código SL
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {preview.eligible.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Facturas elegibles
                </p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  preview.noSlCode.length > 0
                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
                    : "bg-muted/40 border-border",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium mb-1 flex items-center gap-1.5",
                    preview.noSlCode.length > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Sin código SL
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    preview.noSlCode.length > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground",
                  )}
                >
                  {preview.noSlCode.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sin vínculo a usuario
                </p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  preview.nonSyncable.length > 0
                    ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800"
                    : "bg-muted/40 border-border",
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium mb-1 flex items-center gap-1.5",
                    preview.nonSyncable.length > 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-muted-foreground",
                  )}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  En borrador
                </p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    preview.nonSyncable.length > 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-muted-foreground",
                  )}
                >
                  {preview.nonSyncable.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  No se sincronizan
                </p>
              </div>
            </div>

            {preview.eligible.length > 0 && (
              <ScrollArea className="h-40 rounded-md border">
                <div className="p-2 space-y-1">
                  {preview.eligible.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono font-medium">
                          {inv.invoiceNumber}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[140px]">
                          {inv.clientName}
                        </span>
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 font-mono"
                      >
                        {(inv as any).slCode ||
                          (inv as any).clientSlCode ||
                          "—"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {preview.noSlCode.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Las facturas sin código SL se crearán en SP2 pero no estarán
                vinculadas a ningún usuario hasta que se asigne el código.
              </div>
            )}

            {preview.nonSyncable.length > 0 && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {preview.nonSyncable.length === 1
                    ? "1 factura está en estado Borrador y no se sincronizará. Cambia su estado a Enviada/Pagada antes de sincronizar."
                    : `${preview.nonSyncable.length} facturas están en estado Borrador y no se sincronizarán. Cambia su estado a Enviada/Pagada antes de sincronizar.`}
                </span>
              </div>
            )}

            {invoices.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No hay facturas seleccionadas.
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                disabled={
                  invoices.length === 0 ||
                  preview.eligible.length + preview.noSlCode.length === 0
                }
                onClick={() => setStep("confirm")}
                className="gap-2"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 2: Confirm ──────────────────────────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 p-4">
              <p className="font-medium text-sm text-indigo-800 dark:text-indigo-200 mb-2">
                {(() => {
                  // Count is the actual number that will hit the CF — drafts are
                  // excluded by syncInvoicesToSp2's guard, so we never claim to
                  // sync them in the confirmation copy.
                  const syncCount = preview
                    ? preview.eligible.length + preview.noSlCode.length
                    : invoices.length;
                  return `¿Sincronizar ${syncCount} factura${syncCount !== 1 ? "s" : ""} a SmartWeb?`;
                })()}
              </p>
              <ul className="text-xs text-indigo-700 dark:text-indigo-300 space-y-1 list-disc list-inside">
                <li>Se crearán o actualizarán las facturas en SP2</li>
                <li>
                  Los paquetes correspondientes activarán el ícono de factura
                </li>
                <li>
                  Esta operación es idempotente — puedes repetirla sin
                  duplicados
                </li>
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("preview")}>
                Atrás
              </Button>
              <Button onClick={() => setStep("verify")} className="gap-2">
                <Lock className="h-4 w-4" />
                Confirmar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Verify ───────────────────────────────────────────────── */}
        {step === "verify" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Escribe{" "}
                <span className="font-mono font-semibold text-foreground">
                  {CONFIRM_KEYWORD}
                </span>{" "}
                para confirmar la sincronización.
              </p>
              <Input
                ref={inputRef}
                placeholder={CONFIRM_KEYWORD}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && keywordValid && handleSync()
                }
                className={cn(
                  "font-mono uppercase tracking-widest",
                  keyword &&
                    !keywordValid &&
                    "border-destructive focus-visible:ring-destructive",
                  keywordValid &&
                    "border-emerald-500 focus-visible:ring-emerald-500",
                )}
              />
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("confirm")}>
                Atrás
              </Button>
              <Button
                disabled={!keywordValid}
                onClick={handleSync}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Sincronizar ahora
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 4: Processing ───────────────────────────────────────────── */}
        {step === "processing" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">{progressLabel}</p>
            <div className="w-full max-w-xs">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{progress}%</p>
            </div>
          </div>
        )}

        {/* ── Step 5: Results ──────────────────────────────────────────────── */}
        {step === "results" && result && (
          <div className="space-y-4 py-2">
            <div
              className={cn(
                "rounded-lg border p-4",
                result.ok
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
              )}
            >
              <p
                className={cn(
                  "font-semibold text-sm mb-3 flex items-center gap-2",
                  result.ok
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-700 dark:text-amber-300",
                )}
              >
                {result.ok ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Sincronización
                    completada
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" /> Completado con errores
                  </>
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Total procesadas:</span>
                <span className="font-medium">{result.summary.total}</span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  Creadas:
                </span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  {result.summary.created}
                </span>
                <span className="text-indigo-700 dark:text-indigo-300">
                  Actualizadas:
                </span>
                <span className="font-medium text-indigo-700 dark:text-indigo-300">
                  {result.summary.updated}
                </span>
                {result.summary.skipped > 0 && (
                  <>
                    <span className="text-muted-foreground">Omitidas:</span>
                    <span className="font-medium">
                      {result.summary.skipped}
                    </span>
                  </>
                )}
                {result.summary.errors > 0 && (
                  <>
                    <span className="text-destructive">Errores:</span>
                    <span className="font-medium text-destructive">
                      {result.summary.errors}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Per-invoice result list */}
            {result.results.length > 0 && (
              <ScrollArea className="h-48 rounded-md border">
                <div className="p-2 space-y-1">
                  {result.results.map((r) => (
                    <div
                      key={r.invoiceId}
                      className="flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {r.outcome === "created" && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        )}
                        {r.outcome === "updated" && (
                          <RefreshCw className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        )}
                        {r.outcome === "skipped" && (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        {r.outcome === "error" && (
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        )}
                        <span className="font-mono truncate">
                          {r.invoiceNumber}
                        </span>
                        {r.reason && (
                          <span className="text-muted-foreground truncate max-w-[120px]">
                            {r.reason}
                          </span>
                        )}
                      </span>
                      {r.shipmentLinks > 0 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 gap-1 shrink-0"
                        >
                          <Link2 className="h-2.5 w-2.5" />
                          {r.shipmentLinks}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button onClick={handleClose} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Listo
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
