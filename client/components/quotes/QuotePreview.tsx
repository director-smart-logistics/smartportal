import { useLocale } from "@/hooks/useLocale";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { FileText, Printer, X } from "lucide-react";

interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  slCode?: string;
  address?: string;
}

interface LeadInfo {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  country?: string;
  taxId?: string;
}

interface QuoteItem {
  id: string;
  description: string;
  itemType?: string;
  quantity: number;
  unitPrice: number;
  weight?: number;
  dimensions?: string;
  origin?: string;
  destination?: string;
}

interface QuotePreviewProps {
  customer?: Customer | null;
  leadInfo?: LeadInfo | null;
  isNewLead?: boolean;
  items: QuoteItem[];
  subtotal: number;
  taxAmount: number;
  discountPercentage?: number;
  discountAmount?: number;
  total: number;
  currency: string;
  quoteNumber?: string;
  quoteDate?: string;
  validUntil?: string;
  notes?: string;
  onClose?: () => void;
}

// Currency formatting utility
const formatCurrency = (amount: number, currency: string): string => {
  const currencySymbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CRC: "₡",
    MXN: "$",
    CAD: "C$",
    AUD: "A$",
  };

  const symbol = currencySymbols[currency] || currency + " ";
  return `${symbol}${amount.toFixed(2)}`;
};

export function QuotePreview({
  customer,
  leadInfo,
  isNewLead = false,
  items,
  subtotal,
  taxAmount,
  discountPercentage = 0,
  discountAmount = 0,
  total,
  currency = "USD",
  quoteNumber,
  quoteDate,
  validUntil,
  notes,
  onClose,
}: QuotePreviewProps) {
  const { t } = useLocale(["quotes", "common"]);

  const handlePrint = () => {
    window.print();
  };

  const recipient = isNewLead ? leadInfo : customer;
  const recipientName = isNewLead ? leadInfo?.name : customer?.fullName;

  if (!recipient && !isNewLead) {
    return (
      <Card
        className="p-6 text-center border-gray-300"
        data-testid="quote-preview-empty"
      >
        <FileText
          className="h-10 w-10 mx-auto mb-2 text-gray-400"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-600">{t("selectACustomer")}</p>
      </Card>
    );
  }

  return (
    <Card
      className="p-4 border-gray-300 bg-white text-gray-900 relative"
      data-testid="quote-preview"
      role="article"
      aria-label={t("quotePreview")}
    >
      {/* Close Button (if onClose provided) */}
      {onClose && (
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0 print:hidden"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

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
          <h2 className="text-xl font-bold text-gray-900">{t("quote")}</h2>
          {quoteNumber && (
            <p className="text-sm text-gray-600">
              {t("quoteNumber")}:{" "}
              <span className="font-mono font-semibold">{quoteNumber}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <Badge variant="outline" className="mb-2 border-gray-300">
            {t("statusesDraft")}
          </Badge>
          {quoteDate && (
            <p className="text-sm text-gray-600">
              {t("quoteDate")}: {new Date(quoteDate).toLocaleDateString()}
            </p>
          )}
          {validUntil && (
            <p className="text-sm text-gray-600">
              {t("validUntil")}: {new Date(validUntil).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      <Separator className="bg-gray-200 mb-4" />

      {/* Prepared For Section */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {t("preparedFor")}
        </h3>
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <p className="font-semibold text-gray-900 text-sm">
            {recipientName || "N/A"}
          </p>
          {isNewLead && leadInfo ? (
            <>
              {leadInfo.company && (
                <p className="text-xs text-gray-600">{leadInfo.company}</p>
              )}
              {leadInfo.email && (
                <p className="text-xs text-gray-600">{leadInfo.email}</p>
              )}
              {leadInfo.phone && (
                <p className="text-xs text-gray-600">{leadInfo.phone}</p>
              )}
              {leadInfo.address && (
                <p className="text-xs text-gray-600">{leadInfo.address}</p>
              )}
              {(leadInfo.city || leadInfo.country) && (
                <p className="text-xs text-gray-600">
                  {[leadInfo.city, leadInfo.country].filter(Boolean).join(", ")}
                </p>
              )}
              {leadInfo.taxId && (
                <p className="text-xs text-gray-600">
                  {t("leadInfoTaxId")}: {leadInfo.taxId}
                </p>
              )}
            </>
          ) : customer ? (
            <>
              {customer.slCode && (
                <p className="text-xs text-gray-600">
                  {t("slCode")}: {customer.slCode}
                </p>
              )}
              <p className="text-xs text-gray-600">{customer.email}</p>
              {customer.phone && (
                <p className="text-xs text-gray-600">{customer.phone}</p>
              )}
              {customer.address && (
                <p className="text-xs text-gray-600">{customer.address}</p>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {t("items")}
        </h3>

        {items.length === 0 ? (
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center">
            <p className="text-sm text-gray-600">{t("noItemsSelected")}</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm" data-testid="quote-items-table">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">
                    {t("description")}
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">
                    {t("quantity")}
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    {t("unitPrice")}
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">
                    {t("total")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    data-testid={`quote-item-${item.id}`}
                  >
                    <td className="py-3 px-4 text-gray-900">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        {item.itemType && item.itemType !== "shipping" && (
                          <p className="text-xs text-gray-500">
                            {(() => {
                              const itemTypeMap: Record<string, string> = {
                                shipping: "itemTypesShipping",
                                handling: "itemTypesHandling",
                                insurance: "itemTypesInsurance",
                                customs: "itemTypesCustoms",
                                other: "itemTypesOther",
                              };
                              return t(
                                itemTypeMap[item.itemType] ||
                                  "itemTypesShipping",
                              );
                            })()}
                          </p>
                        )}
                        {(item.origin || item.destination) && (
                          <p className="text-xs text-gray-500">
                            {item.origin} → {item.destination}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-700">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-700">
                      {formatCurrency(item.unitPrice, currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900">
                      {formatCurrency(item.unitPrice * item.quantity, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-4">
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("subtotal")}:</span>
            <span
              className="font-semibold text-gray-900"
              data-testid="quote-subtotal"
            >
              {formatCurrency(subtotal, currency)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("tax")} (13%):</span>
            <span
              className="font-semibold text-gray-900"
              data-testid="quote-tax"
            >
              {formatCurrency(taxAmount, currency)}
            </span>
          </div>
          {discountPercentage > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>
                {t("discountAmount")} ({discountPercentage.toFixed(1)}%):
              </span>
              <span className="font-semibold" data-testid="quote-discount">
                -{formatCurrency(discountAmount, currency)}
              </span>
            </div>
          )}
          <Separator className="bg-gray-200" />
          <div className="flex justify-between text-base">
            <span className="font-bold text-gray-900">
              {t("total")} ({currency}):
            </span>
            <span
              className="font-bold text-gray-900 text-lg"
              data-testid="quote-total"
            >
              {formatCurrency(total, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("notes")}
          </h3>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
        <p>
          {t("validUntil")}:{" "}
          {validUntil ? new Date(validUntil).toLocaleDateString() : "N/A"}
        </p>
        <p className="mt-1">Thank you for your business!</p>
      </div>
    </Card>
  );
}

export default QuotePreview;
