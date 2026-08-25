import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NameEditConfirmState {
  idx: number;
  newName: string;
  groupIdxs: number[];
}

interface Props {
  state: NameEditConfirmState | null;
  onConfirmSingle: (idx: number, newName: string) => void;
  onConfirmGroup: (groupIdxs: number[], newName: string) => void;
  onClose: () => void;
}

export function NovaNameEditConfirmModal({
  state,
  onConfirmSingle,
  onConfirmGroup,
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
        aria-labelledby="name-edit-confirm-title"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Pencil className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <p
              id="name-edit-confirm-title"
              className="text-sm font-semibold text-foreground"
            >
              Actualizar nombre
            </p>
            <p className="text-xs text-muted-foreground">Nuevo nombre:</p>
            <p className="text-xs font-mono font-bold text-foreground mt-0.5 break-all">
              {state.newName}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          ¿Actualizar solo este paquete o todos los paquetes del grupo? Se
          ejecutará el match de Nova para enlazar al cliente correcto.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              onConfirmSingle(state.idx, state.newName);
              onClose();
            }}
          >
            Solo este paquete
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              onConfirmGroup(state.groupIdxs, state.newName);
              onClose();
            }}
          >
            Todos del grupo ({state.groupIdxs.length} paquetes)
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
