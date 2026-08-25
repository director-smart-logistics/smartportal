/**
 * NovaRevalidateAllButton — explicit opt-in to re-run match validation on
 * Firestore-loaded data.
 *
 * Auto-validators are disabled for Firestore manifests (their job is to
 * help the operator review fresh AI matches, not silently rewrite curated
 * state). When the operator deliberately wants to re-validate — e.g. after
 * a bulk customer rename, or because the original match used a stale
 * customer-matcher cache — they click this button. A confirmation modal
 * surfaces what's about to happen ("re-correr matching para N filas;
 * sobreescribirá asignaciones manuales"), and only after explicit consent
 * does the rematcher run.
 *
 * Visibility is gated by `policy.showRevalidateAllButton`. The component
 * renders nothing when the flag is false so it can be unconditionally
 * mounted in the toolbar.
 */

import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import type { DataOriginPolicy } from "@/lib/nova/data-origin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface NovaRevalidateAllButtonProps {
  policy: DataOriginPolicy;
  /** Number of rows that would be re-validated. Drives the confirmation copy. */
  rowCount: number;
  /**
   * Triggered after the operator confirms in the modal. The caller is
   * responsible for actually unlinking + rematching every row (typically
   * by calling `handleUnlinkAndRematch` from useNovaCustomerAssignment).
   */
  onConfirm: () => void;
  /** Optional class for the wrapper button (sizing / spacing tweaks). */
  className?: string;
  /**
   * Optional external `open` state for the confirmation modal. When
   * provided the component renders the modal in a controlled manner so
   * the trigger button can be hosted elsewhere (e.g. inside the toolbar's
   * Acciones DropdownMenu — BUG-TOOLBAR-CROWDED 2026-04-29). When
   * undefined the component falls back to internal state and renders its
   * own trigger as before.
   */
  externalOpen?: boolean;
  /** Companion to `externalOpen` — fired when the modal requests a state change. */
  onExternalOpenChange?: (open: boolean) => void;
  /**
   * Hide the inline trigger button entirely. Callers using `externalOpen`
   * typically pair this with their own trigger rendered upstream.
   */
  hideTrigger?: boolean;
}

export function NovaRevalidateAllButton({
  policy,
  rowCount,
  onConfirm,
  className,
  externalOpen,
  onExternalOpenChange,
  hideTrigger = false,
}: NovaRevalidateAllButtonProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  // Controlled-vs-uncontrolled bridge: when the caller supplies
  // `externalOpen`, that wins. Otherwise the internal state drives the
  // dialog open/close.
  const isControlled = externalOpen !== undefined;
  const confirmOpen = isControlled ? externalOpen : internalOpen;
  const setConfirmOpen = (open: boolean) => {
    if (isControlled) onExternalOpenChange?.(open);
    else setInternalOpen(open);
  };

  if (!policy.showRevalidateAllButton) return null;

  return (
    <>
      {!hideTrigger && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          data-testid="nova-revalidate-all-button"
          onClick={() => setConfirmOpen(true)}
          className={className}
          disabled={rowCount === 0}
        >
          <RefreshCcw className="h-3 w-3 mr-1" aria-hidden="true" />
          Re-validar todo
        </Button>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-validar matching de clientes</DialogTitle>
            <DialogDescription className="space-y-2 text-xs leading-relaxed">
              <span className="block">
                Vas a re-correr el matching automático para{" "}
                <strong>{rowCount}</strong> fila{rowCount !== 1 ? "s" : ""} de
                este manifiesto.
              </span>
              <span className="block">
                Cualquier asignación manual previa (customer fullName, ruta o
                slCode editados desde <em>Acciones</em>) será{" "}
                <strong className="text-amber-700 dark:text-amber-400">
                  sobreescrita
                </strong>{" "}
                por el resultado del matching.
              </span>
              <span className="block">¿Continuar?</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setConfirmOpen(false)}
              data-testid="nova-revalidate-all-cancel"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              type="button"
              data-testid="nova-revalidate-all-confirm"
              onClick={() => {
                setConfirmOpen(false);
                onConfirm();
              }}
            >
              <RefreshCcw className="h-3 w-3 mr-1" aria-hidden="true" />
              Re-validar {rowCount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
