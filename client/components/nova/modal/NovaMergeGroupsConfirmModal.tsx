/**
 * NovaMergeGroupsConfirmModal — visual confirmation of a one-click group
 * merge inside the Nova manifest table.
 *
 * ─── Why a dedicated modal instead of a generic confirm dialog ────────────
 *
 * The merge action mutates state with downstream consequences for the
 * eventual invoice creation. The operator must see, before committing:
 *
 *   1. WHAT they are merging — both groups side-by-side, with row count,
 *      total weight, and the candidate target's slCode/route.
 *   2. WHAT will happen to invoices — the merge itself does NOT touch
 *      Firestore invoices (per the data-integrity policy), but the next
 *      "Actualizar BD" pass will. We surface any pre-existing invoice on
 *      the target slCode so the operator knows it will be updated /
 *      annulled-and-recreated by the smart-diff.
 *
 * No mutation lives in here — the modal just shows the comparison and
 * delegates to `onConfirm`. The caller decides how to apply the merge
 * (typically by calling `applyNameAndMatch` for every row in the source
 * group with the target customer's data).
 */

import { Lock, Merge, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MergeGroupSummary {
  /** Display customer name shown in the table for this group. */
  customerName: string;
  /** Effective slCode — empty string for unmatched groups. */
  slCode: string;
  /** Number of manifest rows in the group. */
  rowCount: number;
  /** Sum of `peso` (kg) for the group, rounded to 2 decimals upstream. */
  totalWeight: number;
  /** Sum of `precio` (USD) for the group, rounded to 2 decimals upstream. */
  totalPrice: number;
  /** Effective route (may be empty for unmatched groups). */
  ruta: string;
}

export interface MergeInvoiceImpact {
  /** Invoice number as it appears in /invoices. */
  invoiceNumber: string;
  /** Lifecycle status — drives the warning copy. */
  status:
    | "draft"
    | "sent"
    | "paid"
    | "overdue"
    | "pending"
    | "annulled"
    | string;
  /** Total amount of the invoice in its native currency (USD). */
  totalAmount: number;
}

export interface NovaMergeGroupsConfirmModalProps {
  open: boolean;
  source: MergeGroupSummary;
  target: MergeGroupSummary;
  /**
   * Name-similarity confidence in [0..1] from `fuzzyNameSimilarity`. When
   * < 1, the modal surfaces a "coincidencia parcial" hint so the operator
   * sees that the system is making a fuzzy guess (e.g. one side dropped a
   * middle name).
   */
  confidence?: number;
  /** Optional invoice already attached to the target slCode. */
  invoiceImpact?: MergeInvoiceImpact;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Status copy for the invoice warning. Kept in a single place so the modal
 * doesn't drift from the rest of the invoice-recreate UX (NovaTable's
 * "Actualizar BD" dialog uses the same vocabulary).
 */
const STATUS_COPY: Record<string, { label: string; tone: "warning" | "info" }> =
  {
    draft: { label: "Borrador", tone: "info" },
    sent: { label: "Enviada", tone: "warning" },
    paid: { label: "Pagada", tone: "warning" },
    overdue: { label: "Vencida", tone: "warning" },
    pending: { label: "Pendiente de pago", tone: "warning" },
    annulled: { label: "Anulada", tone: "info" },
  };

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatKg(n: number): string {
  return `${n.toFixed(2)} kg`;
}

export function NovaMergeGroupsConfirmModal({
  open,
  source,
  target,
  confidence = 1,
  invoiceImpact,
  onClose,
  onConfirm,
}: NovaMergeGroupsConfirmModalProps) {
  const totalRows = source.rowCount + target.rowCount;
  const totalWeight = source.totalWeight + target.totalWeight;
  const totalPrice = source.totalPrice + target.totalPrice;
  const status = invoiceImpact?.status ?? "";
  const statusMeta = STATUS_COPY[status] ?? {
    label: status,
    tone: "info" as const,
  };
  // Confidence < 1 means the names didn't match exactly — surface a
  // "coincidencia parcial" hint so the operator can second-guess the
  // suggestion before committing.
  const isFuzzy = confidence > 0 && confidence < 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Merge className="h-4 w-4 text-primary" aria-hidden="true" />
            Fusionar grupos duplicados
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Detectamos que dos grupos del manifiesto representan al mismo
            cliente. Confirma que quieres mover los paquetes del grupo sin
            slCode al grupo registrado.
          </DialogDescription>
        </DialogHeader>

        <div
          className="grid grid-cols-2 gap-3"
          data-testid="nova-merge-side-by-side"
        >
          {/* ── Source ──────────────────────────────────────────────── */}
          <section
            data-testid="nova-merge-source"
            className={cn(
              "rounded-md border border-amber-300 dark:border-amber-700",
              "bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1",
            )}
          >
            <header className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Origen — sin slCode
            </header>
            <p className="text-sm font-semibold text-foreground">
              {source.customerName || "—"}
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5">
              <li>
                <strong>Paquetes:</strong> {source.rowCount}
              </li>
              <li>
                <strong>Peso:</strong> {formatKg(source.totalWeight)}
              </li>
              <li>
                <strong>Subtotal:</strong> {formatUsd(source.totalPrice)}
              </li>
              <li>
                <strong>Ruta:</strong> {source.ruta || "—"}
              </li>
            </ul>
          </section>

          {/* ── Target ──────────────────────────────────────────────── */}
          <section
            data-testid="nova-merge-target"
            className={cn(
              "rounded-md border border-emerald-300 dark:border-emerald-700",
              "bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-1",
            )}
          >
            <header className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Destino — {target.slCode || "—"}
            </header>
            <p className="text-sm font-semibold text-foreground">
              {target.customerName || "—"}
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5">
              <li>
                <strong>Paquetes:</strong> {target.rowCount}
              </li>
              <li>
                <strong>Peso:</strong> {formatKg(target.totalWeight)}
              </li>
              <li>
                <strong>Subtotal:</strong> {formatUsd(target.totalPrice)}
              </li>
              <li>
                <strong>Ruta:</strong> {target.ruta || "—"}
              </li>
            </ul>
          </section>
        </div>

        {/* ── Aggregate result preview ────────────────────────────────── */}
        <div
          data-testid="nova-merge-result"
          className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
        >
          <strong>Resultado:</strong> {totalRows} paquetes bajo{" "}
          <span className="font-mono">{target.slCode}</span> ·{" "}
          {formatKg(totalWeight)} · <strong>{formatUsd(totalPrice)}</strong>
        </div>

        {/* ── Invoice impact warning ─────────────────────────────────── */}
        {invoiceImpact && (
          <div
            data-testid="nova-merge-invoice-impact"
            className={cn(
              "rounded-md border px-3 py-2 text-xs flex items-start gap-2",
              statusMeta.tone === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                : "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
            )}
          >
            <AlertTriangle
              className="h-3.5 w-3.5 mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div className="space-y-0.5 leading-relaxed">
              <p>
                <strong>Factura activa:</strong>{" "}
                <span className="font-mono">{invoiceImpact.invoiceNumber}</span>{" "}
                ({statusMeta.label} · {formatUsd(invoiceImpact.totalAmount)})
              </p>
              <p className="text-[11px]">
                {statusMeta.tone === "warning" ? (
                  <>
                    Esta factura está protegida. Al hacer <em>Actualizar BD</em>{" "}
                    deberás usar <em>Anular y re-crear</em> para regenerarla con
                    los {totalRows} paquetes.
                  </>
                ) : (
                  <>
                    El próximo <em>Actualizar BD</em> actualizará
                    automáticamente esta factura con los {totalRows} paquetes.
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {!invoiceImpact && (
          <div
            data-testid="nova-merge-no-invoice"
            className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300"
          >
            Sin factura activa para este cliente. La factura se creará al hacer{" "}
            <em>Actualizar BD</em>.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            data-testid="nova-merge-cancel"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={onConfirm}
            data-testid="nova-merge-confirm"
            className="gap-1.5"
          >
            <Merge className="h-3.5 w-3.5" aria-hidden="true" />
            Fusionar {source.rowCount} paquete{source.rowCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
