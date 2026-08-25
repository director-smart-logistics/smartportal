import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PesoEditConfirmState {
  idx: number;
  oldPeso: number;
  newPeso: number;
  newPrice: number;
}

interface Props {
  state: PesoEditConfirmState | null;
  tc: number;
  onConfirm: (idx: number, newPeso: number, newPrice: number) => void;
  onClose: () => void;
}

export function NovaPesoEditConfirmModal({
  state,
  tc,
  onConfirm,
  onClose,
}: Props) {
  if (!state) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="peso-edit-confirm-title"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
            <Pencil className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex flex-col gap-1">
            <p
              id="peso-edit-confirm-title"
              className="text-sm font-semibold text-foreground"
            >
              Confirmar cambio de peso
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground line-through">
                {state.oldPeso.toFixed(2)} kg
              </span>
              <span className="text-foreground font-bold">
                → {state.newPeso.toFixed(2)} kg
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nuevo precio calculado:{" "}
              <span className="font-bold text-foreground">
                ${state.newPrice.toFixed(2)}
              </span>
              {tc > 0 && (
                <span className="ml-1 text-muted-foreground">
                  / ₡{Math.round(state.newPrice * tc).toLocaleString("es-CR")}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              onConfirm(state.idx, state.newPeso, state.newPrice);
              onClose();
            }}
          >
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
