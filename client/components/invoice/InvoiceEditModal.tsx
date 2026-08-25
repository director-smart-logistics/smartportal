import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Package as PackageIcon,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";

interface InvoiceItem {
  id?: string;
  packageId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight?: number;
  trackingNumber?: string;
  isManual?: boolean;
}

interface InvoiceEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    subtotalAmount?: number;
    discountPercentage?: number;
    discountAmount?: number;
    taxAmount?: number;
    totalAmount: number;
    currency: string;
    notes?: string;
    invoiceItems?: InvoiceItem[];
  };
  onSave: (data: {
    items: InvoiceItem[];
    notes?: string;
    discountPercentage?: number;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function InvoiceEditModal({
  open,
  onOpenChange,
  invoice,
  onSave,
  isLoading = false,
}: InvoiceEditModalProps) {
  const { t } = useLocale(["invoices", "common"]);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notes, setNotes] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null,
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Check if invoice can be edited
  const canEdit = !["sent", "paid", "annulled"].includes(invoice.status);

  useEffect(() => {
    if (open) {
      setItems(invoice.invoiceItems || []);
      setNotes(invoice.notes || "");
      setDiscountPercentage(invoice.discountPercentage || 0);
      setHasChanges(false);
    }
  }, [open, invoice]);

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const discountAmount = (subtotal * discountPercentage) / 100;
    const afterDiscount = subtotal - discountAmount;
    const tax = afterDiscount * 0.13; // 13% IVA
    const total = afterDiscount + tax;

    return { subtotal, discountAmount, tax, total };
  };

  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      id: `temp-${Date.now()}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      isManual: true,
    };
    setItems([...items, newItem]);
    setHasChanges(true);
  };

  const handleUpdateItem = (
    index: number,
    field: keyof InvoiceItem,
    value: any,
  ) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };

    // Recalculate total price
    if (field === "quantity" || field === "unitPrice") {
      updatedItems[index].totalPrice =
        updatedItems[index].quantity * updatedItems[index].unitPrice;
    }

    setItems(updatedItems);
    setHasChanges(true);
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    setHasChanges(true);
    setShowDeleteConfirm(null);
  };

  const handleSave = async () => {
    await onSave({
      items,
      notes: notes || undefined,
      discountPercentage: discountPercentage || undefined,
    });
  };

  const totals = calculateTotals();

  if (!canEdit) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              {t("invoices.edit.cannotEditSent")}
            </DialogTitle>
            <DialogDescription>
              {invoice.status === "sent" && t("invoices.edit.cannotEditSent")}
              {invoice.status === "paid" && t("invoices.edit.cannotEditPaid")}
              {invoice.status === "annulled" &&
                t("invoices.edit.cannotEditAnnulled")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              {t("invoices.edit.editInvoice")} - {invoice.invoiceNumber}
            </DialogTitle>
            <DialogDescription>
              Modifique los items y detalles de la factura
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Items de la factura
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t("invoices.addItem")}
                </Button>
              </div>

              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {items.map((item, index) => (
                    <motion.div
                      key={item.id || index}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="rounded-lg border border-border p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PackageIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Item {index + 1}
                          </span>
                          {item.isManual && (
                            <Badge variant="outline" className="text-xs">
                              Manual
                            </Badge>
                          )}
                          {item.trackingNumber && (
                            <Badge
                              variant="secondary"
                              className="text-xs font-mono"
                            >
                              {item.trackingNumber}
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setShowDeleteConfirm(item.id || `${index}`)
                          }
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor={`item-desc-${index}`}>
                            Descripción
                          </Label>
                          <Input
                            id={`item-desc-${index}`}
                            value={item.description}
                            onChange={(e) =>
                              handleUpdateItem(
                                index,
                                "description",
                                e.target.value,
                              )
                            }
                            placeholder="Descripción del item"
                            disabled={!item.isManual}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`item-qty-${index}`}>Cantidad</Label>
                          <Input
                            id={`item-qty-${index}`}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleUpdateItem(
                                index,
                                "quantity",
                                parseInt(e.target.value) || 1,
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`item-price-${index}`}>
                            Precio unitario ({invoice.currency})
                          </Label>
                          <Input
                            id={`item-price-${index}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleUpdateItem(
                                index,
                                "unitPrice",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </div>

                        <div className="md:col-span-2 flex items-center justify-between p-3 bg-muted/30 rounded">
                          <span className="text-sm font-medium text-muted-foreground">
                            Total del item:
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {invoice.currency} ${item.totalPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {items.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <PackageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay items en esta factura</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddItem}
                      className="mt-4 gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar primer item
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Discount Section */}
            <div className="space-y-2">
              <Label htmlFor="discount">Descuento (%)</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discountPercentage}
                onChange={(e) => {
                  setDiscountPercentage(parseFloat(e.target.value) || 0);
                  setHasChanges(true);
                }}
              />
            </div>

            {/* Notes Section */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t("invoices.notes")}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setHasChanges(true);
                }}
                placeholder="Notas adicionales para la factura..."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {notes.length}/500 caracteres
              </p>
            </div>

            <Separator />

            {/* Totals Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">
                  {invoice.currency} ${totals.subtotal.toFixed(2)}
                </span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Descuento ({discountPercentage}%):
                  </span>
                  <span className="font-medium text-orange-600">
                    -{invoice.currency} ${totals.discountAmount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">IVA (13%):</span>
                <span className="font-medium">
                  {invoice.currency} ${totals.tax.toFixed(2)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Total:</span>
                <span className="text-xl font-bold text-primary">
                  {invoice.currency} ${totals.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isLoading || !hasChanges || items.length === 0}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("invoices.edit.editing")}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t("invoices.edit.saveChanges")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <AlertDialog
        open={showDeleteConfirm !== null}
        onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.edit.removeItem")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.edit.confirmRemoveItem")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const index = items.findIndex(
                  (item) =>
                    (item.id || `${items.indexOf(item)}`) === showDeleteConfirm,
                );
                if (index !== -1) {
                  handleRemoveItem(index);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
