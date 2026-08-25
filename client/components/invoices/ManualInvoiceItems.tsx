import { useState, useCallback, useMemo } from "react";
import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Package } from "lucide-react";

export interface ManualInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  origin?: string;
  destination?: string;
}

interface ManualInvoiceItemsProps {
  items: ManualInvoiceItem[];
  onItemsChange: (items: ManualInvoiceItem[]) => void;
  disabled?: boolean;
}

export function ManualInvoiceItems({
  items,
  onItemsChange,
  disabled = false,
}: ManualInvoiceItemsProps) {
  const { t } = useLocale(["invoices", "common"]);

  const handleAddItem = useCallback(() => {
    const newItem: ManualInvoiceItem = {
      id: `manual-${Date.now()}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
      weight: undefined,
      length: undefined,
      width: undefined,
      height: undefined,
      origin: undefined,
      destination: undefined,
    };
    onItemsChange([...items, newItem]);
  }, [items, onItemsChange]);

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      onItemsChange(items.filter((item) => item.id !== itemId));
    },
    [items, onItemsChange],
  );

  const handleItemChange = useCallback(
    (itemId: string, field: keyof ManualInvoiceItem, value: any) => {
      onItemsChange(
        items.map((item) =>
          item.id === itemId ? { ...item, [field]: value } : item,
        ),
      );
    },
    [items, onItemsChange],
  );

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.unitPrice || 0);
    }, 0);
  }, [items]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="space-y-3" data-testid="manual-invoice-items">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {t("invoices.manualItems") || "Manual Items"}
          </h3>
          <p className="text-xs text-gray-600">
            {t("invoices.manualItemsDescription") || "Add custom invoice items"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleAddItem}
          disabled={disabled}
          className="bg-gray-900 text-white hover:bg-gray-800"
          data-testid="add-manual-item-btn"
          aria-label="Add manual item"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("invoices.addItem") || "Add Item"}
        </Button>
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <Card className="p-8 text-center border-gray-300 border-dashed">
          <Package className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-600 mb-3">
            {t("invoices.noManualItems") || "No manual items added yet"}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddItem}
            disabled={disabled}
            className="border-gray-300"
            data-testid="add-first-manual-item-btn"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("invoices.addFirstItem") || "Add First Item"}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <Card
              key={item.id}
              className="p-4 border-gray-300"
              data-testid={`manual-item-${index}`}
            >
              <div className="grid grid-cols-12 gap-3">
                {/* Description */}
                <div className="col-span-12 md:col-span-5">
                  <Label
                    htmlFor={`item-desc-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.description")}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={`item-desc-${item.id}`}
                    type="text"
                    value={item.description}
                    onChange={(e) =>
                      handleItemChange(item.id, "description", e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const qtyInput = document.getElementById(
                          `item-qty-${item.id}`,
                        ) as HTMLInputElement;
                        qtyInput?.focus();
                      }
                    }}
                    placeholder={
                      t("invoices.itemDescriptionPlaceholder") ||
                      "Enter item description"
                    }
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    aria-required="true"
                    data-testid={`manual-item-description-${index}`}
                  />
                </div>

                {/* Quantity */}
                <div className="col-span-4 md:col-span-2">
                  <Label
                    htmlFor={`item-qty-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.quantity")}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={`item-qty-${item.id}`}
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "quantity",
                        parseInt(e.target.value) || 1,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const priceInput = document.getElementById(
                          `item-price-${item.id}`,
                        ) as HTMLInputElement;
                        priceInput?.focus();
                      }
                    }}
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    aria-required="true"
                    data-testid={`manual-item-quantity-${index}`}
                  />
                </div>

                {/* Unit Price */}
                <div className="col-span-4 md:col-span-2">
                  <Label
                    htmlFor={`item-price-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.unitPrice")}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id={`item-price-${item.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "unitPrice",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (index === items.length - 1) {
                          // Last item - add new and focus on its description
                          handleAddItem();
                          // Focus on the new item's description after it's added
                          setTimeout(() => {
                            const newItemDesc = document.querySelector(
                              '[data-testid^="manual-item-description-"]:last-of-type input',
                            ) as HTMLInputElement;
                            newItemDesc?.focus();
                          }, 50);
                        } else {
                          // Focus next item description
                          const nextItem = items[index + 1];
                          const nextInput = document.getElementById(
                            `item-desc-${nextItem.id}`,
                          ) as HTMLInputElement;
                          nextInput?.focus();
                        }
                      }
                    }}
                    placeholder="0.00"
                    className="mt-1 bg-white border-gray-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    disabled={disabled}
                    aria-required="true"
                    data-testid={`manual-item-unitPrice-${index}`}
                  />
                </div>

                {/* Total */}
                <div className="col-span-4 md:col-span-2">
                  <Label className="text-xs text-gray-600">
                    {t("invoices.total")}
                  </Label>
                  <div className="mt-1 p-2 rounded border bg-gray-50 border-gray-200 font-semibold text-sm text-gray-900">
                    {formatCurrency(
                      (item.unitPrice || 0) * (item.quantity || 0),
                    )}
                  </div>
                </div>

                {/* Delete Button */}
                <div className="col-span-12 md:col-span-1 flex items-end md:items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={disabled}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 w-full md:w-auto"
                    aria-label={`Remove item ${index + 1}`}
                    data-testid={`remove-manual-item-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Optional Fields - Expanded Section */}
              <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-200">
                {/* Weight */}
                <div>
                  <Label
                    htmlFor={`item-weight-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.weight")} (kg)
                  </Label>
                  <Input
                    id={`item-weight-${item.id}`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.weight || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "weight",
                        parseFloat(e.target.value) || undefined,
                      )
                    }
                    placeholder="0.0"
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    data-testid={`manual-item-weight-${index}`}
                  />
                </div>

                {/* Length */}
                <div>
                  <Label
                    htmlFor={`item-length-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.length")} (cm)
                  </Label>
                  <Input
                    id={`item-length-${item.id}`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.length || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "length",
                        parseFloat(e.target.value) || undefined,
                      )
                    }
                    placeholder="0.0"
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    data-testid={`manual-item-length-${index}`}
                  />
                </div>

                {/* Width */}
                <div>
                  <Label
                    htmlFor={`item-width-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.width")} (cm)
                  </Label>
                  <Input
                    id={`item-width-${item.id}`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.width || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "width",
                        parseFloat(e.target.value) || undefined,
                      )
                    }
                    placeholder="0.0"
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    data-testid={`manual-item-width-${index}`}
                  />
                </div>

                {/* Height */}
                <div>
                  <Label
                    htmlFor={`item-height-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.height")} (cm)
                  </Label>
                  <Input
                    id={`item-height-${item.id}`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.height || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "height",
                        parseFloat(e.target.value) || undefined,
                      )
                    }
                    placeholder="0.0"
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    data-testid={`manual-item-height-${index}`}
                  />
                </div>

                {/* Origin */}
                <div className="col-span-2">
                  <Label
                    htmlFor={`item-origin-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.origin")}
                  </Label>
                  <Input
                    id={`item-origin-${item.id}`}
                    type="text"
                    value={item.origin || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "origin",
                        e.target.value || undefined,
                      )
                    }
                    placeholder={
                      t("invoices.originPlaceholder") || "Origin location"
                    }
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    data-testid={`manual-item-origin-${index}`}
                  />
                </div>

                {/* Destination */}
                <div className="col-span-2">
                  <Label
                    htmlFor={`item-destination-${item.id}`}
                    className="text-xs text-gray-600"
                  >
                    {t("invoices.destination")}
                  </Label>
                  <Input
                    id={`item-destination-${item.id}`}
                    type="text"
                    value={item.destination || ""}
                    onChange={(e) =>
                      handleItemChange(
                        item.id,
                        "destination",
                        e.target.value || undefined,
                      )
                    }
                    placeholder={
                      t("invoices.destinationPlaceholder") ||
                      "Destination location"
                    }
                    className="mt-1 bg-white border-gray-300"
                    disabled={disabled}
                    data-testid={`manual-item-destination-${index}`}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Subtotal */}
      {items.length > 0 && (
        <div className="flex justify-end pt-3 border-t border-gray-200">
          <div className="text-right">
            <p className="text-xs text-gray-600">{t("invoices.subtotal")}</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(subtotal)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
