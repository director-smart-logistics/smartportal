// Bulk Exchange Rate (TC) update modal for the /invoices page.
//
// Scope: the operator selects N invoices, clicks "Actualizar TC", and this
// modal collects the new rate + shows an impact summary (invoices +
// estimated packages + unique manifests). On confirm, the parent calls
// `bulkUpdateInvoicesExchangeRate` from update-exchange-rate-service.ts.
//
// Invariants mirrored from the service:
//   • Invoice status is NEVER modified (paid stays paid, sent stays sent).
//   • Annulled / cancelled / void invoices are SKIPPED.
//   • USD amounts are NEVER touched — only CRC fields + exchangeRate.
//   • Idempotent — re-running with the same rate is a no-op.
//
// UI ergonomics:
//   • Pre-fills the input with the average current TC across the selection
//     (median when rates vary, so outliers don't skew the default).
//   • Shows a staleness warning when the selection spans mixed TCs (drift
//     diagnostic — the operator almost always wants them aligned).
//   • Requires explicit confirm click; typed-in rate is the source of truth.

import { useMemo, useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BulkUpdateTcSelectionSummary {
  /** Number of invoices the operator has selected. */
  invoicesCount: number;
  /** Annulled / cancelled / void invoices inside the selection (will be skipped). */
  annulledInvoicesCount: number;
  /** Unique package identities (IDs or tracking numbers) in the selection. */
  packagesCount: number;
  /** Unique manifest numbers referenced by the selected invoices. */
  manifestsCount: number;
  /** Distinct TC values present across the selection (sorted ascending). */
  currentTcs: number[];
}

export interface BulkUpdateTcModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: BulkUpdateTcSelectionSummary;
  isSubmitting: boolean;
  onConfirm: (newRate: number) => Promise<void> | void;
}

export function BulkUpdateTcModal({
  open,
  onOpenChange,
  summary,
  isSubmitting,
  onConfirm,
}: BulkUpdateTcModalProps) {
  /** Suggested default: average of the current TCs in the selection.
   *  Fallback to 0 when the selection has no TC — operator must type one. */
  const suggestedRate = useMemo(() => {
    if (!summary.currentTcs.length) return 0;
    const sum = summary.currentTcs.reduce((a, b) => a + b, 0);
    return Math.round((sum / summary.currentTcs.length) * 100) / 100;
  }, [summary.currentTcs]);

  const [newRate, setNewRate] = useState<string>(
    suggestedRate > 0 ? String(suggestedRate) : "",
  );

  // Reset the input when the dialog re-opens for a new selection.
  useEffect(() => {
    if (open) {
      setNewRate(suggestedRate > 0 ? String(suggestedRate) : "");
    }
  }, [open, suggestedRate]);

  const parsedRate = Number(newRate);
  const isRateValid = Number.isFinite(parsedRate) && parsedRate > 0;
  const hasMultipleTcs = summary.currentTcs.length > 1;
  const nonAnnulledInvoices =
    summary.invoicesCount - summary.annulledInvoicesCount;

  const handleSubmit = async () => {
    if (!isRateValid || isSubmitting) return;
    await onConfirm(parsedRate);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => !isSubmitting && onOpenChange(o)}
    >
      <AlertDialogContent className="w-full h-[100dvh] sm:h-auto sm:max-w-md left-0 top-0 sm:left-[50%] sm:top-[50%] translate-x-0 translate-y-0 sm:translate-x-[-50%] sm:translate-y-[-50%] rounded-none sm:rounded-xl p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600 shrink-0" />
            Actualizar tipo de cambio
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-xs">
              <p>
                Escribe el <strong>nuevo TC</strong> (colones por dólar). Se
                aplicará a cada factura seleccionada y a sus paquetes y
                manifiestos relacionados.
              </p>
              <p className="text-muted-foreground">
                Los estados de las facturas se preservan. Las anuladas se omiten
                automáticamente.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* ── Selection summary ─────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-muted/40 divide-y divide-border text-xs">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-muted-foreground">
              Facturas seleccionadas
            </span>
            <span className="font-semibold">
              {summary.invoicesCount}
              {summary.annulledInvoicesCount > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  ({summary.annulledInvoicesCount} anulada
                  {summary.annulledInvoicesCount !== 1 ? "s" : ""} se omitirá
                  {summary.annulledInvoicesCount !== 1 ? "n" : ""})
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-muted-foreground">Paquetes vinculados</span>
            <span className="font-semibold">≈ {summary.packagesCount}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-muted-foreground">Manifiestos afectados</span>
            <span className="font-semibold">{summary.manifestsCount}</span>
          </div>
          {summary.currentTcs.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-muted-foreground">TC actual</span>
              <span
                className={cn(
                  "font-semibold font-mono",
                  hasMultipleTcs && "text-amber-600",
                )}
              >
                {summary.currentTcs.length === 1
                  ? `₡${summary.currentTcs[0].toLocaleString("es-CR")}`
                  : `${summary.currentTcs.length} valores (₡${summary.currentTcs[0]} – ₡${summary.currentTcs[summary.currentTcs.length - 1]})`}
              </span>
            </div>
          )}
        </div>

        {hasMultipleTcs && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            La selección contiene múltiples tipos de cambio. Aplicar un solo TC
            los unificará en{" "}
            <strong>
              ₡{isRateValid ? parsedRate.toLocaleString("es-CR") : "—"}
            </strong>
            .
          </p>
        )}

        {/* ── New TC input ──────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <label htmlFor="bulk-tc-input" className="text-xs font-semibold">
            Nuevo TC (₡ / $)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-amber-400">
              <span className="text-sm font-semibold text-muted-foreground">
                ₡
              </span>
              <input
                id="bulk-tc-input"
                type="number"
                step="0.01"
                min="0"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                disabled={isSubmitting}
                autoFocus
                placeholder={
                  suggestedRate > 0 ? String(suggestedRate) : "487.00"
                }
                className="flex-1 bg-transparent outline-none text-sm font-mono font-semibold"
                data-testid="bulk-tc-input"
              />
              <span className="text-sm text-muted-foreground">/ $</span>
            </div>
          </div>
          {!isRateValid && newRate.length > 0 && (
            <p className="text-[11px] text-red-600">Ingresa un TC mayor a 0.</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              onClick={handleSubmit}
              disabled={
                !isRateValid || isSubmitting || nonAnnulledInvoices === 0
              }
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="bulk-tc-confirm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Actualizando…
                </>
              ) : (
                <>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Aplicar TC a {nonAnnulledInvoices} factura
                  {nonAnnulledInvoices !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
