import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronUp, ChevronDown, ChevronsUpDown, HelpCircle, Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  InvoicesSpreadsheetRow,
  invoicesGridTemplateCols,
} from "./InvoicesSpreadsheetRow";
import { subscribeCustomersBySlCodes } from "@/lib/services/invoice-service";

export interface InvoicesDataTableProps {
  invoices: any[];
  routes: any[];
  loading?: boolean;
  selectedInvoices: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectAll: () => void;
  onShowDetails: (invoice: any) => void;
  onSaveField: (id: string, field: string, value: any, oldValue: any) => void;
  canUpdate: (permission: string) => boolean;
  canManage: (permission: string) => boolean;
  syncingInvoiceId: string | null;
  onForceSync: (invoice: any) => Promise<void>;
  onReassignCustomer: (
    invoiceId: string,
    currentId: string | null,
    currentName: string | null,
    currentslCode: string | null
  ) => void;
  onReassignManifest: (invoice: any) => void;
  manifests?: any[];
  onSuggestAI?: (invoice: any) => void;
  onAnnul?: (invoiceId: string, invoiceNumber: string, manifestNumber?: string) => void;
  onRestore?: (invoiceId: string) => void;
  onDelete?: (invoiceId: string, invoiceNumber: string) => void;
  suggestingAIId?: string | null;
  t: any;
  sortField: string;
  sortDirection: "asc" | "desc";
  onSort: (field: string) => void;
  onPreview?: (invoiceId: string) => void;
  onSendEmail?: (invoiceId: string) => void;
  sendingEmailId?: string | null;
  onReturnPackages?: (invoice: any) => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-850 dark:text-gray-300 dark:border-gray-700",
  sent: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  paid: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
  annulled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
};

export function InvoicesDataTable({
  invoices,
  routes,
  loading = false,
  selectedInvoices,
  onToggleSelection,
  onToggleSelectAll,
  onShowDetails,
  onSaveField,
  canUpdate,
  canManage,
  syncingInvoiceId,
  onForceSync,
  onReassignCustomer,
  onReassignManifest,
  manifests = [],
  onSuggestAI,
  onAnnul,
  onRestore,
  onDelete,
  suggestingAIId,
  t,
  sortField,
  sortDirection,
  onSort,
  onPreview,
  onSendEmail,
  sendingEmailId,
  onReturnPackages,
}: InvoicesDataTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [customerMap, setCustomerMap] = React.useState<Map<string, any>>(new Map());

  React.useEffect(() => {
    const slCodes = new Set<string>();
    invoices.forEach((inv) => {
      const code = inv.slCode || inv.clientSlCode || inv.customer?.slCode;
      if (code) slCodes.add(code);
    });
    const uniqueCodes = Array.from(slCodes).sort();
    if (!uniqueCodes.length) {
      setCustomerMap(new Map());
      return;
    }
    const unsub = subscribeCustomersBySlCodes(uniqueCodes, (map) => {
      setCustomerMap(map);
    });
    return unsub;
  }, [invoices]);

  const rowVirtualizer = useVirtualizer({
    count: invoices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: React.useCallback(() => 42, []),
    overscan: 12,
  });

  const handleCopyText = React.useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const renderSortHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1.5 hover:text-foreground text-left w-full h-full justify-between font-semibold group/header text-xs text-muted-foreground transition-colors uppercase tracking-wider select-none"
      >
        <span>{label}</span>
        <span className="shrink-0 text-muted-foreground/60 group-hover/header:text-foreground transition-colors">
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5 text-primary animate-in fade-in zoom-in-75 duration-250" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-primary animate-in fade-in zoom-in-75 duration-250" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 hover:opacity-100 transition-opacity" />
          )}
        </span>
      </button>
    );
  };

  const statusOptions = [
    { value: "draft", label: t("invoices.statuses.draft") || t("invoices.draft") || "Borrador" },
    { value: "sent", label: t("invoices.statuses.sent") || t("invoices.sent") || "Enviado" },
    { value: "paid", label: t("invoices.statuses.paid") || t("invoices.paid") || "Pagado" },
    { value: "annulled", label: t("invoices.statuses.annulled") || t("invoices.annulled") || "Anulada" },
  ];

  if (loading) {
    return (
      <div className="flex flex-col h-full border border-border rounded-xl overflow-hidden bg-background">
        <div className="min-w-[950px] lg:min-w-[1100px] flex flex-col">
          {/* Skeleton Header */}
          <div
            className="grid w-full bg-background border-b border-border sticky top-0 z-20 shadow-sm text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ gridTemplateColumns: invoicesGridTemplateCols }}
          >
            <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9">
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9 text-xs font-semibold">
              Det.
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Factura
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Manifiesto
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              SmartID / Cliente
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Ruta
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Total
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Estado
            </div>
            <div className="px-3 py-2 border-border bg-muted/50 h-9 flex items-center justify-center">
              Sync
            </div>
          </div>

          {/* Skeleton Rows */}
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="grid w-full h-10 items-center text-xs border-b border-border"
              style={{ gridTemplateColumns: invoicesGridTemplateCols }}
            >
              <div className="border-r border-border h-full flex items-center justify-center bg-muted/10">
                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="border-r border-border h-full flex items-center justify-center bg-muted/10">
                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3.5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3.5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3.5 w-44 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3.5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3.5 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="h-full flex items-center justify-center bg-muted/5">
                <div className="h-4.5 w-4.5 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-col flex-1 min-h-0 bg-background border border-border rounded-xl overflow-hidden shadow-sm"
        data-testid="invoices-table-container"
      >
        <div
          ref={parentRef}
          className="flex-1 overflow-auto bg-background relative max-h-[calc(100vh-350px)] min-h-[300px]"
          tabIndex={0}
        >
          <div className="min-w-[950px] lg:min-w-[1100px] flex flex-col pb-4">
            {/* Header Row */}
            <div
              className="grid w-full bg-background border-b border-border sticky top-0 z-20 shadow-sm text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              style={{ gridTemplateColumns: invoicesGridTemplateCols }}
            >
              <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9">
                <input
                  type="checkbox"
                  checked={
                    invoices.length > 0 &&
                    invoices.every((inv) => selectedInvoices.has(inv.id))
                  }
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-400 text-gray-900 focus:ring-gray-500 focus:ring-offset-0 cursor-pointer"
                  data-testid="select-all-invoices"
                  title="Seleccionar todo en esta página"
                />
              </div>
              <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9 text-xs font-semibold">
                Det.
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Factura", "invoiceNumber")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Manifiesto", "manifestNumber")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Cliente", "clientName")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Ruta", "route")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Total", "totalAmount")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Estado", "status")}
              </div>
              <div className="px-3 py-2 border-border bg-muted/50 h-9 flex items-center justify-center">
                Sync
              </div>
            </div>

            {/* Virtualized Rows Container */}
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-muted/5">
                <HelpCircle className="h-8 w-8 text-muted-foreground/55 mb-2" />
                <p className="text-sm font-semibold">No se encontraron facturas</p>
                <p className="text-xs text-muted-foreground/70">
                  Prueba ajustando los filtros o la búsqueda.
                </p>
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const invoice = invoices[virtualRow.index];
                  if (!invoice) return null;
                  return (
                    <InvoicesSpreadsheetRow
                      key={invoice.id}
                      invoice={invoice}
                      virtualRow={virtualRow}
                      isSelected={selectedInvoices.has(invoice.id)}
                      customerMap={customerMap}
                      onToggleSelection={onToggleSelection}
                      onShowDetails={onShowDetails}
                      onCopyText={handleCopyText}
                      onSaveField={onSaveField}
                      routes={routes}
                      canUpdate={canUpdate}
                      canManage={canManage}
                      statusOptions={statusOptions}
                      statusColors={STATUS_COLORS}
                      syncingInvoiceId={syncingInvoiceId}
                      onForceSync={onForceSync}
                      onReassignCustomer={onReassignCustomer}
                      onReassignManifest={onReassignManifest}
                      manifests={manifests}
                      onSuggestAI={onSuggestAI}
                      onAnnul={onAnnul}
                      onRestore={onRestore}
                      onDelete={onDelete}
                      suggestingAIId={suggestingAIId}
                      t={t}
                      onPreview={onPreview}
                      onSendEmail={onSendEmail}
                      sendingEmailId={sendingEmailId}
                      onReturnPackages={onReturnPackages}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
