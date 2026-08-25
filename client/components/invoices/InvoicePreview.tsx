import { useLocale } from "@/hooks/useLocale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { FileText, Printer } from "lucide-react";
import { parseInvoiceCreationDate } from "@/components/nova/NovaInvoicePreview";

interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  slCode?: string;
  address?: string;
}

interface InvoiceItem {
  id: string;
  trackingNumber?: string;
  description?: string;
  weight: number;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  isManual?: boolean;
}

interface InvoicePreviewProps {
  customer: Customer | null;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  totalWeight: number;
  isConsolidation?: boolean;
  discountPercentage?: number;
  discountAmount?: number;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  ivaEnabled?: boolean;
}

export function InvoicePreview({
  customer,
  items,
  subtotal,
  tax,
  total,
  totalWeight,
  isConsolidation = false,
  discountPercentage = 0,
  discountAmount = 0,
  invoiceNumber,
  invoiceDate,
  dueDate,
  notes,
  ivaEnabled = false,
}: InvoicePreviewProps) {
  const { t } = useLocale(["invoices", "common"]);

  // Determine if we have manual items, package items, or both
  const hasManualItems = items.some((item) => item.isManual);
  const hasPackageItems = items.some((item) => !item.isManual);
  const isMixedItems = hasManualItems && hasPackageItems;

  const handlePrint = () => {
    window.print();
  };

  if (!customer) {
    return (
      <Card
        className="p-6 text-center border-gray-300"
        data-testid="invoice-preview-empty"
      >
        <FileText
          className="h-10 w-10 mx-auto mb-2 text-gray-400"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-600">{t("invoices.selectACustomer")}</p>
      </Card>
    );
  }

  return (
    <Card
      className="p-4 border-gray-300 bg-white"
      data-testid="invoice-preview"
      role="article"
      aria-label={t("invoices.invoicePreview")}
    >
      {/* Print Button */}
      <div className="flex justify-end mb-3 print:hidden">
        <Button
          onClick={handlePrint}
          variant="outline"
          size="sm"
          className="gap-2 border-gray-300 hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" />
          {t("common.print")}
        </Button>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <Logo size="md" className="mb-2" />
          <h2 className="text-xl font-bold text-gray-900">
            {t("invoices.invoice")}
          </h2>
          {invoiceNumber && (
            <p className="text-sm text-gray-600">
              {t("invoices.invoiceNumber")}:{" "}
              <span className="font-mono font-semibold">{invoiceNumber}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <Badge variant="outline" className="mb-2 border-gray-300">
            {t("invoices.draft")}
          </Badge>
          {invoiceDate && (
            <p className="text-sm text-gray-600">
              {t("invoices.invoiceDate")}:{" "}
              {parseInvoiceCreationDate(invoiceDate, invoiceNumber).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })}
            </p>
          )}
          <p className="text-sm text-gray-600">Pago: DE CONTADO</p>
        </div>
      </div>

      <Separator className="bg-gray-200 mb-4" />

      {/* Bill To Section */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {t("invoices.billTo")}
        </h3>
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <p className="font-semibold text-gray-900 text-sm">
            {customer.fullName}
          </p>
          {customer.slCode && (
            <p className="text-xs text-gray-600">
              {t("invoices.slCode")}: {customer.slCode}
            </p>
          )}
          <p className="text-xs text-gray-600">{customer.email}</p>
          {customer.phone && (
            <p className="text-xs text-gray-600">{customer.phone}</p>
          )}
          {customer.address && (
            <p className="text-xs text-gray-600">{customer.address}</p>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {t("invoices.items")}
        </h3>

        {items.length === 0 ? (
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              {t("invoices.noPackagesSelected")}
            </p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm" data-testid="invoice-items-table">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    {isMixedItems
                      ? t("invoices.items")
                      : hasManualItems
                        ? t("invoices.description")
                        : t("invoices.trackingNumber")}
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    {t("invoices.weight")}
                  </th>
                  {!isConsolidation && (
                    <>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        {t("invoices.unitPrice")}
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        {t("invoices.quantity")}
                      </th>
                    </>
                  )}
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    {t("invoices.total")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    data-testid={`invoice-item-${item.id}`}
                  >
                    <td className="py-3 px-4 text-gray-900">
                      {item.isManual ? (
                        <span className="text-sm">{item.description}</span>
                      ) : (
                        <span className="font-mono">{item.trackingNumber}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {item.isManual
                        ? "—"
                        : ((item as any).realWeight ?? item.weight)
                          ? `${Number((item as any).realWeight ?? item.weight).toFixed(2)} kg`
                          : "—"}
                    </td>
                    {!isConsolidation && (
                      <>
                        <td className="py-3 px-4 text-right text-gray-700">
                          ${item.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700">
                          {item.quantity}
                        </td>
                      </>
                    )}
                    <td className="py-3 px-4 text-right font-semibold text-gray-900">
                      ${item.totalPrice.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("invoices.subtotal")}:</span>
            <span
              className="font-semibold text-gray-900"
              data-testid="invoice-subtotal"
            >
              ${subtotal.toFixed(2)}
            </span>
          </div>
          {ivaEnabled && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t("invoices.tax")} (13%):</span>
              <span
                className="font-semibold text-gray-900"
                data-testid="invoice-tax"
              >
                ${tax.toFixed(2)}
              </span>
            </div>
          )}
          {discountPercentage > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {t("invoices.discountAmount")} ({discountPercentage.toFixed(2)}
                %):
              </span>
              <span
                className="font-semibold text-gray-900"
                data-testid="invoice-discount"
              >
                -${discountAmount.toFixed(2)}
              </span>
            </div>
          )}
          {isConsolidation && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {t("invoices.totalWeight")}:
              </span>
              <span
                className="font-semibold text-gray-900"
                data-testid="invoice-weight"
              >
                {totalWeight.toFixed(2)} kg
              </span>
            </div>
          )}
          <Separator className="bg-gray-200" />
          <div className="flex justify-between text-base">
            <span className="font-bold text-gray-900">
              {t("invoices.total")}:
            </span>
            <span
              className="font-bold text-gray-900 text-lg"
              data-testid="invoice-total"
            >
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t("invoices.notes")}
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
