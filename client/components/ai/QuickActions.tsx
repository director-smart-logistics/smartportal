import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuickAction } from "@/lib/api/ai";
import { motion } from "framer-motion";
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
import { CheckCircle2, Package, Route, Edit } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

interface QuickActionsProps {
  actions: QuickAction[];
  onActionExecute: (action: QuickAction) => Promise<void>;
  isExecuting?: boolean;
}

export function QuickActions({
  actions,
  onActionExecute,
  isExecuting,
}: QuickActionsProps) {
  const { t } = useLocale(["ai", "common"]);
  const [confirmingAction, setConfirmingAction] = useState<QuickAction | null>(
    null,
  );
  const [executingActionId, setExecutingActionId] = useState<string | null>(
    null,
  );

  const getActionIcon = (type: QuickAction["type"]) => {
    switch (type) {
      case "update_status":
        return <CheckCircle2 className="h-3.5 w-3.5" />;
      case "create_package":
        return <Package className="h-3.5 w-3.5" />;
      case "assign_route":
        return <Route className="h-3.5 w-3.5" />;
      default:
        return <Edit className="h-3.5 w-3.5" />;
    }
  };

  const handleActionClick = (action: QuickAction) => {
    if (action.requiresConfirmation) {
      setConfirmingAction(action);
    } else {
      executeAction(action);
    }
  };

  const executeAction = async (action: QuickAction) => {
    setExecutingActionId(action.id);
    try {
      await onActionExecute(action);
    } finally {
      setExecutingActionId(null);
      setConfirmingAction(null);
    }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <motion.div
        className="flex flex-wrap gap-2 mt-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        {actions.map((action, index) => (
          <motion.div
            key={action.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              size="sm"
              variant={action.variant || "outline"}
              onClick={() => handleActionClick(action)}
              disabled={isExecuting || executingActionId !== null}
              className="gap-2"
            >
              {getActionIcon(action.type)}
              {action.label}
              {executingActionId === action.id && (
                <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
            </Button>
          </motion.div>
        ))}
      </motion.div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmingAction !== null}
        onOpenChange={(open) => !open && setConfirmingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ai.confirmAction")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmingAction?.confirmationMessage ||
                t("ai.confirmActionDefault")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmingAction && executeAction(confirmingAction)
              }
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
