import { useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface AssignSlCodeModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (slCode: string) => Promise<void>;
  customerName: string;
  loading?: boolean;
}

export function AssignSlCodeModal({
  open,
  onClose,
  onAssign,
  customerName,
  loading = false,
}: AssignSlCodeModalProps) {
  const { t } = useLocale(["invoices", "common"]);
  const [slCode, setSlCode] = useState("");
  const [error, setError] = useState("");

  const handleAssign = async () => {
    if (!slCode.trim()) {
      setError(t("common.required"));
      return;
    }

    try {
      await onAssign(slCode.trim());
      setSlCode("");
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("invoices.failedAssignSlCode"),
      );
    }
  };

  const handleClose = () => {
    setSlCode("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md bg-white"
        data-testid="assign-sl-code-modal"
        aria-describedby="assign-sl-code-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <div className="p-2 bg-gray-100 rounded-full">
              <AlertCircle
                className="h-5 w-5 text-gray-700"
                aria-hidden="true"
              />
            </div>
            {t("invoices.slCodeRequired")}
          </DialogTitle>
          <DialogDescription
            id="assign-sl-code-description"
            className="text-gray-600"
          >
            {t("invoices.slCodeRequiredMessage")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer Name */}
          <div className="space-y-2">
            <Label
              htmlFor="customer-name"
              className="text-sm font-medium text-gray-700"
            >
              {t("invoices.customer")}
            </Label>
            <Input
              id="customer-name"
              value={customerName}
              disabled
              className="bg-gray-50 border-gray-300"
              data-testid="customer-name-display"
            />
          </div>

          {/* SL Code Input */}
          <div className="space-y-2">
            <Label
              htmlFor="sl-code"
              className="text-sm font-medium text-gray-700"
            >
              {t("invoices.enterSlCode")}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="sl-code"
              value={slCode}
              onChange={(e) => {
                setSlCode(e.target.value);
                setError("");
              }}
              placeholder={t("invoices.slCodePlaceholder")}
              className="border-gray-300"
              disabled={loading}
              autoFocus
              data-testid="sl-code-input"
              aria-label={t("invoices.enterSlCode")}
              aria-invalid={!!error}
              aria-describedby={error ? "sl-code-error" : undefined}
            />
            {error && (
              <p
                id="sl-code-error"
                className="text-sm text-red-600"
                role="alert"
                data-testid="sl-code-error"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="border-gray-300 text-gray-700 hover:bg-gray-100"
            data-testid="cancel-assign-btn"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={loading || !slCode.trim()}
            className="bg-gray-900 hover:bg-gray-800 text-white"
            data-testid="confirm-assign-btn"
          >
            {loading ? t("common.loading") : t("invoices.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
