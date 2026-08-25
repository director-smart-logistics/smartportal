import React from "react";
import { Mail } from "lucide-react";
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

export interface ReassignResendPrompt {
  invoiceId: string;
  invoiceNumber: string;
  fullName: string;
  email: string;
}

interface ReassignResendPromptDialogProps {
  prompt: ReassignResendPrompt | null;
  onClose: () => void;
  onConfirm: (invoiceId: string) => Promise<void>;
}

export const ReassignResendPromptDialog = React.memo(function ReassignResendPromptDialog({
  prompt,
  onClose,
  onConfirm,
}: ReassignResendPromptDialogProps) {
  return (
    <AlertDialog
      open={!!prompt}
      onOpenChange={(open) => { if (!open) onClose(); }}
    >
      <AlertDialogContent data-testid="reassign-resend-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-indigo-500" />
            Reenviar factura al nuevo cliente
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block text-sm text-muted-foreground">
              La factura <strong className="text-foreground font-mono">{prompt?.invoiceNumber}</strong> fue reasignada a{" "}
              <strong className="text-foreground">{prompt?.fullName}</strong>.
            </span>
            <span className="block mt-3 text-sm">
              ¿Quieres reenviar la factura al correo{" "}
              <strong className="text-foreground">{prompt?.email}</strong>?
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            No, gracias
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={async () => {
              if (!prompt) return;
              await onConfirm(prompt.invoiceId);
            }}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Enviar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
