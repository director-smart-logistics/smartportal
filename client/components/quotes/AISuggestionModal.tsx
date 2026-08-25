import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuoteItemInput } from "@/lib/hooks/queries/useQuotes";

interface AISuggestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestion?: string;
  initialData?: QuoteItemInput;
  onConfirm: (data: QuoteItemInput) => Promise<void>;
  isLoading?: boolean;
}

export function AISuggestionModal({
  open,
  onOpenChange,
  suggestion,
  initialData,
  onConfirm,
  isLoading,
}: AISuggestionModalProps) {
  const { t } = useTranslation(["quotes", "common"]);

  // Parse suggestion to try to pre-fill fields if possible (simple heuristic)
  // For now, we just use the suggestion as description
  const [formData, setFormData] = useState<QuoteItemInput>({
    description: "",
    itemType: "other",
    quantity: 1,
    unitPrice: 0,
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setFormData({
          description: initialData.description || "",
          itemType: initialData.itemType || "other",
          quantity: initialData.quantity || 1,
          unitPrice: initialData.unitPrice || 0,
          weight: initialData.weight,
          origin: initialData.origin,
          destination: initialData.destination,
          dimensions: initialData.dimensions,
        });
      } else if (suggestion) {
        setFormData({
          description: suggestion,
          itemType: "other",
          quantity: 1,
          unitPrice: 0,
          weight: undefined,
          origin: undefined,
          destination: undefined,
          dimensions: undefined,
        });
      }
    }
  }, [open, suggestion, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("addAiSuggestion", "Add AI Suggestion")}</DialogTitle>
          <DialogDescription>
            {t(
              "configureAiSuggestion",
              "Configure the item details before adding to the quote.",
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              {t("description", "Description")}
            </Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemType">{t("itemType", "Type")}</Label>
              <Select
                value={formData.itemType}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, itemType: value })
                }
              >
                <SelectTrigger id="itemType">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipping">
                    {t("types.shipping", "Shipping")}
                  </SelectItem>
                  <SelectItem value="handling">
                    {t("types.handling", "Handling")}
                  </SelectItem>
                  <SelectItem value="insurance">
                    {t("types.insurance", "Insurance")}
                  </SelectItem>
                  <SelectItem value="customs">
                    {t("types.customs", "Customs")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("types.other", "Other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">{t("quantity", "Quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                step="1"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: Number(e.target.value) })
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitPrice">{t("unitPrice", "Unit Price")}</Label>
            <Input
              id="unitPrice"
              type="number"
              min="0"
              step="0.01"
              value={formData.unitPrice}
              onChange={(e) =>
                setFormData({ ...formData, unitPrice: Number(e.target.value) })
              }
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="origin">{t("origin", "Origin")}</Label>
              <Input
                id="origin"
                value={formData.origin || ""}
                onChange={(e) =>
                  setFormData({ ...formData, origin: e.target.value })
                }
                placeholder={t("optional", "Optional")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destination">
                {t("destination", "Destination")}
              </Label>
              <Input
                id="destination"
                value={formData.destination || ""}
                onChange={(e) =>
                  setFormData({ ...formData, destination: e.target.value })
                }
                placeholder={t("optional", "Optional")}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? t("common.saving", "Saving...")
                : t("common.add", "Add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
