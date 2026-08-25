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
import { AlertTriangle, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PermanentDeleteInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invoice metadata surfaced to the operator for visual confirmation. */
  invoice: {
    id: string;
    invoiceNumber?: string;
    clientName?: string;
    /** The code the operator MUST type verbatim to unlock the destructive action. */
    slCode?: string;
  };
  /** Invoked only after both confirmations pass (checkbox + slCode match). */
  onConfirm: () => Promise<void> | void;
  isLoading?: boolean;
}

/**
 * Two-factor destructive confirmation for hard-deleting an invoice from the
 * recovery trash:
 *
 *   1. The operator must actively acknowledge the action is irreversible
 *      (checkbox — prevents muscle-memory accidental confirms).
 *   2. They must type the invoice's slCode verbatim (case-sensitive) into
 *      a text input — the primary button stays disabled until an exact
 *      match is detected.
 *
 * Both controls reset every time the dialog opens to prevent stale state
 * from a previous invocation leaking into a new delete.
 */
export function PermanentDeleteInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onConfirm,
  isLoading = false,
}: PermanentDeleteInvoiceDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [typedCode, setTypedCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Confirmation code: prefer the customer slCode, fall back to the
   * invoice number so orphan/route-prefixed invoices (e.g. `Cartago 1`)
   * still have something unique to type. If both are empty we fall back
   * to the Firestore document id — never blank (which would trivially
   * unlock the button via empty-string match).
   */
  const requiredCode = (
    invoice.slCode ||
    invoice.invoiceNumber ||
    invoice.id
  ).trim();
  const codeMatches = typedCode.trim() === requiredCode;
  const canConfirm = acknowledged && codeMatches && !isLoading;

  useEffect(() => {
    if (open) {
      setAcknowledged(false);
      setTypedCode("");
      // Delay focus until the dialog has fully mounted so the focus trap
      // doesn't steal the caret back to the close button.
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            Eliminar permanentemente
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Esta acción es{" "}
            <strong className="font-semibold text-destructive">
              irreversible
            </strong>
            . El documento de la factura se borra de Firestore y no podrá
            restaurarse desde la papelera.
          </DialogDescription>
        </DialogHeader>

        {/* Invoice summary — lets the operator double-check the target */}
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 dark:bg-destructive/10 px-3 py-2.5 text-sm space-y-1"
          aria-label="Factura a eliminar"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Factura
            </span>
            <code className="font-mono text-xs font-semibold text-foreground break-all text-right">
              {invoice.invoiceNumber || invoice.id}
            </code>
          </div>
          {invoice.clientName && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                Cliente
              </span>
              <span className="text-xs text-foreground text-right truncate">
                {invoice.clientName}
              </span>
            </div>
          )}
          {invoice.slCode && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                SL Code
              </span>
              <code className="font-mono text-xs text-foreground">
                {invoice.slCode}
              </code>
            </div>
          )}
        </div>

        {/* Step 1 — acknowledgement */}
        <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={isLoading}
            className="mt-0.5 h-4 w-4 rounded border-border accent-destructive cursor-pointer"
            aria-describedby="permanent-delete-ack-desc"
          />
          <span id="permanent-delete-ack-desc" className="flex-1 leading-snug">
            Entiendo que esta operación <strong>no se puede deshacer</strong> y
            que la factura se borrará definitivamente.
          </span>
        </label>

        {/* Step 2 — type the slCode to confirm */}
        <div className="space-y-1.5">
          <label
            htmlFor="permanent-delete-code-input"
            className="text-xs font-medium text-foreground flex items-center gap-1.5"
          >
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Escribe{" "}
            <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border border-border select-all">
              {requiredCode}
            </code>{" "}
            para confirmar
          </label>
          <Input
            id="permanent-delete-code-input"
            ref={inputRef}
            value={typedCode}
            onChange={(e) => setTypedCode(e.target.value)}
            placeholder={requiredCode}
            disabled={!acknowledged || isLoading}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              "font-mono text-sm h-9",
              codeMatches &&
                "border-destructive/60 focus-visible:ring-destructive/30 text-destructive",
            )}
            aria-invalid={typedCode.length > 0 && !codeMatches}
          />
          {typedCode.length > 0 && !codeMatches && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              El código no coincide — se distinguen mayúsculas y minúsculas.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="gap-1.5"
            data-testid="permanent-delete-confirm-btn"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Eliminar permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
