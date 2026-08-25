/**
 * NovaDeleteInvoiceConfirmModal — destructive-action gate for the
 * per-invoice "X" button rendered next to invoice badges in the Nova
 * manifest table.
 *
 * ─── Why this exists ──────────────────────────────────────────────────────
 *
 * Some manifests carry invoices that are genuinely corrupt (wrong
 * customer, duplicate billing, stale draft from a regression). The
 * operator needs an explicit way to drop them so the next "Actualizar BD"
 * pass can regenerate the correct invoice from the (already corrected)
 * manifest data.
 *
 * Hard-deleting an invoice is destructive and can erase audit trail. To
 * make sure the operator never deletes the wrong document by accident,
 * this modal:
 *
 *   1. Shows the invoice's identifying fields (number, customer, total,
 *      status) so they can confirm it matches the doc they intended.
 *   2. For non-draft invoices (sent / paid / overdue / pending), gates
 *      the destructive button behind a typed-confirmation field. The
 *      operator must type "ELIMINAR" verbatim before the button enables.
 *   3. Surfaces a recommended alternative (annul instead of hard-delete)
 *      whenever the invoice has billing-relevant statuses.
 *
 * The actual delete is performed by `deleteInvoiceById` from the
 * invoice-service (already exists). This modal only collects intent.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DeleteInvoiceTarget {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  clientSlCode: string;
  status: string;
  totalAmount: number;
  /** Optional — when present we surface "Manifiesto: …" as additional context. */
  manifestNumber?: string;
}

export interface NovaDeleteInvoiceConfirmModalProps {
  open: boolean;
  invoice: DeleteInvoiceTarget | null;
  onClose: () => void;
  /** Called only AFTER the typed-confirmation gate clears (when applicable). */
  onConfirm: () => void;
}

const PROTECTED_STATUSES = new Set([
  "sent",
  "paid",
  "overdue",
  "pending",
  "pending_payment",
]);
const REQUIRED_TYPED_CONFIRM = "ELIMINAR";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  paid: "Pagada",
  overdue: "Vencida",
  pending: "Pendiente",
  pending_payment: "Pendiente de pago",
  annulled: "Anulada",
  cancelled: "Cancelada",
  void: "Vacía",
};

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function NovaDeleteInvoiceConfirmModal({
  open,
  invoice,
  onClose,
  onConfirm,
}: NovaDeleteInvoiceConfirmModalProps) {
  // The typed-confirmation field is only required for protected statuses.
  // We reset it whenever the modal target changes so the operator never
  // sees stale text from a previous open.
  const [typedConfirm, setTypedConfirm] = useState("");
  useEffect(() => {
    setTypedConfirm("");
  }, [invoice?.invoiceId]);

  if (!invoice) {
    // Render nothing when there's no target — the parent always renders
    // this component, gating with `open` AND a non-null invoice would be
    // redundant. Keeping a `null` early-return makes the prop contract
    // explicit and avoids reading `.status` off undefined below.
    return (
      <Dialog open={false} onOpenChange={() => onClose()}>
        <DialogContent className="hidden" />
      </Dialog>
    );
  }

  const status = invoice.status.toLowerCase();
  const statusLabel = STATUS_LABEL[status] ?? invoice.status;
  const isProtected = PROTECTED_STATUSES.has(status);
  const isPaid = status === "paid";

  // Confirm button activation rule:
  //   • Draft / annulled / cancelled / void → enabled immediately.
  //   • Protected (sent/paid/overdue/pending) → require typed "ELIMINAR".
  const confirmEnabled =
    !isProtected ||
    typedConfirm.trim().toUpperCase() === REQUIRED_TYPED_CONFIRM;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg"
        data-testid="nova-delete-invoice-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
            Eliminar factura corrupta
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Esta acción borra el documento de la colección <code>invoices</code>{" "}
            de Firestore. Es destructiva y no preserva audit trail. Úsala solo
            cuando la factura está corrupta y debe regenerarse desde cero.
          </DialogDescription>
        </DialogHeader>

        {/* ── Invoice identity card ─────────────────────────────────────── */}
        <section
          data-testid="nova-delete-invoice-target"
          className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-1"
        >
          <div className="flex items-center gap-1.5">
            <FileText
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-mono text-xs font-semibold text-foreground">
              {invoice.invoiceNumber || invoice.invoiceId}
            </span>
            <span
              className={cn(
                "ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                isPaid &&
                  "bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-400",
                isProtected &&
                  !isPaid &&
                  "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400",
                !isProtected && "bg-muted border-border text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <strong>Cliente:</strong> {invoice.clientName || "—"}{" "}
            <span className="text-muted-foreground/60">
              ({invoice.clientSlCode || "—"})
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            <strong>Total:</strong> {formatUsd(invoice.totalAmount)}
          </p>
          {invoice.manifestNumber && (
            <p className="text-[11px] text-muted-foreground">
              <strong>Manifiesto:</strong>{" "}
              <span className="font-mono">{invoice.manifestNumber}</span>
            </p>
          )}
        </section>

        {/* ── Status-aware warning ──────────────────────────────────────── */}
        {isPaid && (
          <div
            data-testid="nova-delete-invoice-paid-warning"
            className="rounded-md border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40 px-3 py-2 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-2"
          >
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5 leading-relaxed">
              <p>
                <strong>Factura PAGADA</strong> — había dinero recibido en este
                documento.
              </p>
              <p>
                Considera <em>anular</em> la factura desde{" "}
                <code>/invoices</code> en lugar de borrarla. La anulación
                preserva el audit trail (quién pagó, cuándo, recibo enviado,
                etc.).
              </p>
            </div>
          </div>
        )}

        {isProtected && !isPaid && (
          <div
            data-testid="nova-delete-invoice-protected-warning"
            className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2"
          >
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5 leading-relaxed">
              <p>
                Esta factura está en estado <strong>{statusLabel}</strong> —
                protegida del flujo de re-creación automática.
              </p>
              <p>
                Si la fuiste a la enviada al cliente, lo recomendable es{" "}
                <em>anular</em> antes de borrar. Borrar pierde la trazabilidad
                de envíos previos.
              </p>
            </div>
          </div>
        )}

        {/* ── Typed-confirmation gate ───────────────────────────────────── */}
        {isProtected && (
          <div
            className="space-y-1.5"
            data-testid="nova-delete-invoice-typed-gate"
          >
            <label
              className="text-[11px] font-semibold text-muted-foreground"
              htmlFor="nova-delete-confirm-input"
            >
              Escribe <code>{REQUIRED_TYPED_CONFIRM}</code> para confirmar
            </label>
            <Input
              id="nova-delete-confirm-input"
              data-testid="nova-delete-invoice-typed-input"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder={REQUIRED_TYPED_CONFIRM}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            data-testid="nova-delete-invoice-cancel"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={onConfirm}
            disabled={!confirmEnabled}
            data-testid="nova-delete-invoice-confirm"
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Eliminar factura
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
