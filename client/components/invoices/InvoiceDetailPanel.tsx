import { memo, useState } from "react";
import {
  User,
  FileText,
  Globe2,
  Clock,
  Mail,
  CheckCircle,
  Eye,
  MousePointerClick,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isOrphanSlCode } from "@/lib/utils/invoice-reassign";

export interface InvoiceDetailPanelProps {
  invoice: any;
  liveInv: any;
  expandedPackageItems: Set<string>;
  setExpandedPackageItems: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedEmailLogs: Set<string>;
  setExpandedEmailLogs: React.Dispatch<React.SetStateAction<Set<string>>>;
  refreshingEmailId: string | null;
  onRefreshEmailStatus: (id: string) => void;
  actions: React.ReactNode;
}

export const InvoiceDetailPanel = memo(function InvoiceDetailPanel({
  invoice,
  liveInv,
  expandedPackageItems,
  setExpandedPackageItems,
  expandedEmailLogs,
  setExpandedEmailLogs,
  refreshingEmailId,
  onRefreshEmailStatus,
  actions,
}: InvoiceDetailPanelProps) {
  const synced = liveInv.smartwebSynced ?? invoice.smartwebSynced;
  const syncedAt = liveInv.smartwebSyncedAt ?? invoice.smartwebSyncedAt;

  const emailSent = liveInv.emailSent ?? invoice.emailSent;
  const emailSentAt = liveInv.emailSentAt ?? invoice.emailSentAt;
  const emailStatus = liveInv.emailStatus ?? invoice.emailStatus;
  const emailStatusUpdatedAt =
    liveInv.emailStatusUpdatedAt ?? invoice.emailStatusUpdatedAt;
  const emailStatusLogs = liveInv.emailStatusLogs ?? invoice.emailStatusLogs;
  const emailSendLogs = liveInv.emailSendLogs ?? invoice.emailSendLogs;

  const STATUS_CONFIG: Record<
    string,
    { icon: React.ReactNode; label: string; cls: string }
  > = {
    sent: {
      icon: <Mail className="h-3 w-3 shrink-0" />,
      label: "Enviado",
      cls: "text-blue-600 dark:text-blue-400",
    },
    delivered: {
      icon: <CheckCircle className="h-3 w-3 shrink-0" />,
      label: "Entregado",
      cls: "text-emerald-600 dark:text-emerald-400",
    },
    opened: {
      icon: <Eye className="h-3 w-3 shrink-0" />,
      label: "Abierto",
      cls: "text-violet-600 dark:text-violet-400",
    },
    clicked: {
      icon: <MousePointerClick className="h-3 w-3 shrink-0" />,
      label: "Clic",
      cls: "text-purple-600 dark:text-purple-400",
    },
    bounced: {
      icon: <XCircle className="h-3 w-3 shrink-0" />,
      label: "Rebotado",
      cls: "text-red-600 dark:text-red-400",
    },
    complained: {
      icon: <AlertTriangle className="h-3 w-3 shrink-0" />,
      label: "Spam",
      cls: "text-orange-600 dark:text-orange-400",
    },
    failed: {
      icon: <XCircle className="h-3 w-3 shrink-0" />,
      label: "Fallido",
      cls: "text-red-600 dark:text-red-400",
    },
  };

  const currentEmailStatus = emailStatus ? STATUS_CONFIG[emailStatus] : null;

  // Invoice calculations
  const invTotal = Number(liveInv.totalAmount || 0);
  const invItems: any[] = liveInv.invoiceItems || [];
  const itemWithRate = invItems.find(
    (i: any) => (i.package?.exchangeRate || i.exchangeRate || 0) > 0,
  );
  const tc =
    liveInv.exchangeRate ||
    itemWithRate?.package?.exchangeRate ||
    itemWithRate?.exchangeRate ||
    0;
  const totalCRC = tc > 0 ? Math.round(invTotal * tc) : 0;

  const spItems = liveInv.invoiceItems || [];
  const novaItems: any[] = liveInv.items ?? [];
  const displayItems =
    spItems.length > 0
      ? spItems
      : novaItems.map((n: any) => ({
          trackingNumber: n.tracking,
          description: n.description,
          weight: n.weight,
          requiresPermit: n.requiresPermit || n.isPermitRequired,
          totalPrice: n.totalPrice,
          unitPrice: n.unitPrice,
        }));

  const syncHistoryContent = (
    <div className="text-[9px] space-y-1">
      <div className="font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 pb-0.5 mb-1">
        Historial de Sincronización
      </div>
      {syncedAt ? (
        <div className="flex items-center gap-1.5">
          <Globe2 className="h-2.5 w-2.5 text-violet-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {new Date(syncedAt).toLocaleString("es-CR")}
          </span>
        </div>
      ) : (
        <div className="text-slate-500">Sin registros</div>
      )}
    </div>
  );

  const emailHistoryContent = (
    <div className="text-[9px] space-y-2">
      <div className="font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 pb-0.5">
        Historial de Email
      </div>

      {/* Envíos */}
      {emailSendLogs && emailSendLogs.length > 0 ? (
        <div className="space-y-1">
          <div className="font-medium text-slate-500">Envíos:</div>
          {emailSendLogs.map((log: any, idx: number) => (
            <div
              key={idx}
              className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded border border-slate-100 dark:border-slate-800"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-medium break-all">
                  {log.sentTo}
                </span>
                <span className="text-slate-400 whitespace-nowrap">
                  {new Date(log.sentAt).toLocaleString("es-CR")}
                </span>
              </div>
              {log.sentBy && (
                <span className="text-slate-500">Por: {log.sentBy}</span>
              )}
            </div>
          ))}
        </div>
      ) : emailSentAt ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Mail className="h-2.5 w-2.5 text-blue-500" />
            <span className="text-slate-600 dark:text-slate-400">
              Enviado: {new Date(emailSentAt).toLocaleString("es-CR")}
            </span>
          </div>
        </div>
      ) : null}

      {/* Estados (Resend) */}
      {emailStatusLogs && emailStatusLogs.length > 0 && (
        <div className="space-y-1 mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <div className="font-medium text-slate-500">Eventos de entrega:</div>
          {emailStatusLogs.map((log: any, idx: number) => {
            const sc = STATUS_CONFIG[log.status] || {
              icon: <Clock className="h-2.5 w-2.5" />,
              label: log.status,
              cls: "text-slate-500",
            };
            return (
              <div
                key={idx}
                className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded border border-slate-100 dark:border-slate-800"
              >
                <span
                  className={cn("flex items-center gap-1 font-medium", sc.cls)}
                >
                  {sc.icon} {sc.label}
                </span>
                <span className="text-slate-400">
                  {new Date(log.timestamp).toLocaleString("es-CR")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!emailSendLogs?.length && !emailSentAt && !emailStatusLogs?.length && (
        <div className="text-slate-500">Sin historial</div>
      )}
    </div>
  );

  return (
    <div
      className="py-2 bg-slate-50/30 dark:bg-slate-900/10"
      data-testid={`invoice-detail-panel-${invoice.id}`}
    >
      {/* Header - Electronic Ticket Style */}
      <div className="px-1 sm:px-2 py-2 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-800 dark:text-slate-200" />
            <span
              className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight"
              data-testid={`detail-invoice-number-${invoice.id}`}
            >
              {liveInv.invoiceNumber}
            </span>
          </div>

          <span
            data-testid={`detail-invoice-status-${invoice.id}`}
            className={cn(
              "inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
              liveInv.status === "paid"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                : liveInv.status === "overdue"
                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  : liveInv.status === "sent"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                    : liveInv.status === "annulled" ||
                        liveInv.status === "cancelled"
                      ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
            )}
          >
            {liveInv.status === "paid"
              ? "Pagado"
              : liveInv.status === "overdue"
                ? "Vencido"
                : liveInv.status === "sent"
                  ? "Enviado"
                  : liveInv.status === "annulled"
                    ? "Anulado"
                    : liveInv.status === "cancelled"
                      ? "Cancelado"
                      : liveInv.status === "draft"
                        ? "Borrador"
                        : "Pendiente"}
          </span>

          {liveInv.source === "nova" && (
            <span
              data-testid={`detail-source-nova-${invoice.id}`}
              className="inline-block px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wider"
            >
              Nova
            </span>
          )}
          {liveInv.source === "maritime" && (
            <span
              data-testid={`detail-source-maritime-${invoice.id}`}
              className="inline-block px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300 text-[9px] font-bold uppercase tracking-wider"
            >
              Marítimo
            </span>
          )}

          <span
            data-testid={`detail-invoice-date-${invoice.id}`}
            className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
          >
            {new Date(liveInv.invoiceDate).toLocaleDateString("es-CR")}
          </span>

          <div className="flex items-center gap-2 ml-auto">
            {/* Sync Status */}
            <div className="relative group/sync">
              {synced ? (
                <span
                  data-testid={`detail-sync-status-synced-${invoice.id}`}
                  className="inline-flex items-center gap-1 text-[9px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded cursor-default"
                >
                  <Globe2 className="h-3 w-3" /> Sync
                </span>
              ) : (
                <span
                  data-testid={`detail-sync-status-nosync-${invoice.id}`}
                  className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded cursor-default"
                >
                  <Clock className="h-3 w-3" /> No Sync
                </span>
              )}
              <div className="hidden md:group-hover/sync:block md:group-focus/sync:block absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-md p-2 z-50">
                {syncHistoryContent}
              </div>
            </div>

            {/* Email Status */}
            <div className="relative group/email flex items-center gap-1">
              {emailSent ? (
                <div
                  className="flex items-center gap-1"
                  data-testid={`detail-email-status-sent-${invoice.id}`}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded cursor-default",
                      currentEmailStatus
                        ? currentEmailStatus.cls +
                            " bg-slate-100 dark:bg-slate-800"
                        : "text-blue-600 bg-blue-50 dark:bg-blue-900/30",
                    )}
                  >
                    {currentEmailStatus ? (
                      currentEmailStatus.icon
                    ) : (
                      <Mail className="h-3 w-3" />
                    )}
                    {currentEmailStatus ? currentEmailStatus.label : "Enviado"}
                  </span>
                  <button
                    type="button"
                    data-testid={`detail-refresh-email-btn-${invoice.id}`}
                    title="Sincronizar estado desde Resend"
                    disabled={refreshingEmailId === invoice.id}
                    onClick={() => onRefreshEmailStatus(invoice.id)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw
                      className={cn(
                        "h-2.5 w-2.5",
                        refreshingEmailId === invoice.id && "animate-spin",
                      )}
                    />
                  </button>
                </div>
              ) : (
                <span
                  data-testid={`detail-email-status-noemail-${invoice.id}`}
                  className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded cursor-default"
                >
                  <Clock className="h-3 w-3" /> No Email
                </span>
              )}
              {(emailSent ||
                emailStatusLogs?.length > 0 ||
                emailSendLogs?.length > 0) && (
                <div className="hidden md:group-hover/email:block md:group-focus/email:block absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-md p-2 z-50">
                  {emailHistoryContent}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile History Panel (Visible only on smaller screens) */}
      {(synced ||
        emailSent ||
        emailStatusLogs?.length > 0 ||
        emailSendLogs?.length > 0) && (
        <div className="block md:hidden px-2 py-2 border-b border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
          {synced && (
            <div className="border border-slate-200/50 dark:border-slate-700/50 rounded p-1.5 bg-white dark:bg-slate-900">
              {syncHistoryContent}
            </div>
          )}
          {(emailSent ||
            emailStatusLogs?.length > 0 ||
            emailSendLogs?.length > 0) && (
            <div className="border border-slate-200/50 dark:border-slate-700/50 rounded p-1.5 bg-white dark:bg-slate-900">
              {emailHistoryContent}
            </div>
          )}
        </div>
      )}

      {/* Items Table */}
      <div className="px-1 sm:px-2 py-2">
        <table
          className="w-full text-left border-collapse"
          data-testid={`detail-items-table-${invoice.id}`}
        >
          <thead>
            <tr>
              <th className="pb-2 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200/50 dark:border-slate-800/50">
                Descripción
              </th>
              <th className="pb-2 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200/50 dark:border-slate-800/50 text-center">
                {liveInv.source === "maritime" ? "Volumen" : "Peso"}
              </th>
              <th className="pb-2 text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200/50 dark:border-slate-800/50 text-right">
                Precio
              </th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {(() => {
              const isPkgExpanded = expandedPackageItems.has(invoice.id);
              const visibleItems = isPkgExpanded
                ? displayItems
                : displayItems.slice(0, 5);

              return (
                <>
                  {visibleItems.map((item: any, i: number) => {
                    const nv = novaItems.find(
                      (n: any) =>
                        (n.tracking ?? "") === (item.trackingNumber ?? ""),
                    );
                    const w = item.realWeight ?? item.weight ?? nv?.weight;
                    return (
                      <tr
                        key={i}
                        className="border-b border-slate-100/50 dark:border-slate-800/30 last:border-0"
                        data-testid={`detail-item-row-${invoice.id}-${i}`}
                      >
                        <td className="py-2 pr-2 align-top">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              Servicios Logísticos
                            </span>
                            {item.requiresPermit && (
                              <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded border border-orange-200 dark:border-orange-800 uppercase tracking-wider">
                                ⚠ Permisos
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[9px] text-slate-500 dark:text-slate-400 flex flex-col">
                            <span>
                              {liveInv.source === "maritime"
                                ? `WR ${item.trackingNumber || ""}`
                                : item.trackingNumber || `Item ${i + 1}`}
                            </span>
                            {item.description &&
                              item.description !== item.trackingNumber &&
                              item.description !==
                                `DIM: 0x0x0 in (0.00 ft³)` && (
                                <span className="font-sans text-[9px] mt-0.5">
                                  {item.description}
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top text-center font-medium text-slate-600 dark:text-slate-300">
                          {w != null
                            ? `${Number(w).toFixed(2)} ${liveInv.source === "maritime" ? "FT³" : "kg"}`
                            : "—"}
                        </td>
                        <td className="py-2 pl-2 align-top text-right font-bold text-slate-900 dark:text-white">
                          $
                          {Number(
                            item.totalPrice ?? item.unitPrice ?? 0,
                          ).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  {displayItems.length > 5 && (
                    <tr>
                      <td colSpan={3} className="py-1.5">
                        <button
                          type="button"
                          data-testid={`detail-expand-items-btn-${invoice.id}`}
                          onClick={() =>
                            setExpandedPackageItems((prev) => {
                              const next = new Set(prev);
                              isPkgExpanded
                                ? next.delete(invoice.id)
                                : next.add(invoice.id);
                              return next;
                            })
                          }
                          className="text-[10px] text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
                        >
                          {isPkgExpanded
                            ? "▲ Ver menos"
                            : `+ ${displayItems.length - 5} paquetes más...`}
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              );
            })()}
          </tbody>
        </table>

        {liveInv.notes && (
          <p
            data-testid={`detail-notes-${invoice.id}`}
            className="mt-2 text-[10px] text-slate-500 italic bg-white dark:bg-slate-950 p-2 rounded border border-slate-100 dark:border-slate-800"
          >
            {liveInv.notes}
          </p>
        )}
      </div>

      {/* Totals Section */}
      <div className="px-1 sm:px-2 py-2 flex justify-end">
        <div className="w-full sm:w-56 space-y-1.5 text-xs">
          <div
            className="flex justify-between text-slate-600 dark:text-slate-400"
            data-testid={`detail-subtotal-${invoice.id}`}
          >
            <span>Subtotal:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              ${Number(liveInv.subtotalAmount || 0).toFixed(2)}
            </span>
          </div>
          {Number(liveInv.discountAmount || 0) > 0 && (
            <div
              className="flex justify-between text-red-600 dark:text-red-400"
              data-testid={`detail-discount-${invoice.id}`}
            >
              <span>
                Descuento ({Number(liveInv.discountPercentage || 0).toFixed(1)}
                %):
              </span>
              <span className="font-bold">
                -${Number(liveInv.discountAmount || 0).toFixed(2)}
              </span>
            </div>
          )}
          <div
            className="flex justify-between text-slate-600 dark:text-slate-400"
            data-testid={`detail-tax-${invoice.id}`}
          >
            <span>IVA (13%):</span>
            <span className="font-bold text-slate-900 dark:text-white">
              ${Number(liveInv.taxAmount || 0).toFixed(2)}
            </span>
          </div>

          <div className="pt-2 mt-1 border-t border-slate-200/50 dark:border-slate-800/50">
            <div
              className="flex justify-between items-center text-slate-900 dark:text-white rounded-lg py-1"
              data-testid={`detail-total-usd-${invoice.id}`}
            >
              <span className="font-bold tracking-wider text-[11px]">
                TOTAL:
              </span>
              <span className="font-bold text-sm">
                ${invTotal.toFixed(2)} USD
              </span>
            </div>
          </div>

          {tc > 0 && (
            <div className="space-y-0.5">
              <div
                className="flex justify-between text-[10px] text-slate-500"
                data-testid={`detail-tc-${invoice.id}`}
              >
                <span>TC:</span>
                <span className="font-mono font-bold">₡{tc.toFixed(2)}</span>
              </div>
              <div
                className="flex justify-between text-xs text-slate-900 dark:text-white"
                data-testid={`detail-total-crc-${invoice.id}`}
              >
                <span className="font-bold">Total CRC:</span>
                <span className="font-mono font-extrabold">
                  ₡{totalCRC.toLocaleString("es-CR")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div
        className="mt-2 px-1 sm:px-2 flex flex-wrap items-center justify-end gap-1.5"
        data-testid={`detail-action-bar-${invoice.id}`}
      >
        {actions}
      </div>
    </div>
  );
});

InvoiceDetailPanel.displayName = "InvoiceDetailPanel";
