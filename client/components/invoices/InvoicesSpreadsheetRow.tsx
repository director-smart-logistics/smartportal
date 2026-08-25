import React from "react";
import {
  Copy,
  Wifi,
  Loader2,
  Globe2,
  Info,
  Mail,
  MessageSquare,
  MoreVertical,
  Sparkles,
  UserCog,
  FileEdit,
  RefreshCw,
  CheckCircle,
  X,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Eye,
  Send,
  Undo2,
} from "lucide-react";
import { cn, isCustomerConsolidating } from "@/lib/utils";
import { useFeatureFlag } from "@/lib/context/FeatureFlagsContext";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { InlineEditCell } from "@/components/data-grid/InlineEditCell";
import { PackageManifestEditor } from "@/components/packages/PackageManifestEditor";
import { StatusPopoverEditor } from "@/components/data-grid/StatusPopoverEditor";
import { RoutePicker } from "./RoutePicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useUsers } from "@/lib/hooks/queries/useUsers";

function formatRowDate(raw: any, includeTime = false): string {
  if (!raw) return "";
  try {
    let d: Date;
    if (raw instanceof Date) {
      d = raw;
    } else if (typeof raw === "object" && raw !== null) {
      if (typeof raw.toDate === "function") {
        d = raw.toDate();
      } else {
        const seconds = raw._seconds ?? raw.seconds;
        if (typeof seconds === "number") {
          d = new Date(seconds * 1000);
        } else {
          return "";
        }
      }
    } else {
      d = new Date(raw);
    }
    
    if (isNaN(d.getTime())) return "";
    return includeTime 
      ? d.toLocaleString("es-CR") 
      : d.toLocaleDateString("es-CR");
  } catch {
    return "";
  }
}

export const invoicesGridTemplateCols =
  "40px 40px minmax(130px, 1.1fr) minmax(115px, 0.9fr) minmax(210px, 2fr) minmax(110px, 0.9fr) minmax(120px, 1fr) minmax(95px, 0.8fr) 170px";

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700",
  sent:      "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
  paid:      "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700",
  overdue:   "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700",
  cancelled: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-700",
  annulled:  "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800/60 dark:text-slate-500 dark:border-slate-700 line-through",
  deleted:   "bg-red-100 text-red-800 border-red-400 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
};

export interface InvoicesSpreadsheetRowProps {
  invoice: any;
  virtualRow: any;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onShowDetails: (invoice: any) => void;
  onCopyText: (text: string) => void;
  onSaveField: (id: string, field: string, value: any, oldValue: any) => void;
  routes: any[];
  canUpdate: (permission: string) => boolean;
  canManage: (permission: string) => boolean;
  statusOptions: any[];
  statusColors: Record<string, string>;
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
  isDark?: boolean;
  onPreview?: (invoiceId: string) => void;
  onSendEmail?: (invoiceId: string) => void;
  sendingEmailId?: string | null;
  customerMap?: Map<string, any>;
  onReturnPackages?: (invoice: any) => void;
}

export const InvoicesSpreadsheetRow = React.memo(function InvoicesSpreadsheetRow({
  invoice,
  virtualRow,
  isSelected,
  onToggleSelection,
  onShowDetails,
  onCopyText,
  onSaveField,
  routes,
  canUpdate,
  canManage,
  statusOptions,
  statusColors,
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
  isDark,
  onPreview,
  onSendEmail,
  sendingEmailId,
  customerMap,
  onReturnPackages,
}: InvoicesSpreadsheetRowProps) {
  const { data: users } = useUsers();
  const routeReturnsEnabled = useFeatureFlag("routeReturnsModule");
  const isAnnulled = ["cancelled", "annulled", "deleted"].includes(invoice.status);
  const isDraft = invoice.status === "draft";
  const isTemporary = invoice.clientSlCode && invoice.clientSlCode.startsWith("SL-NAN-");
  const isSynced = !!invoice.smartwebSynced;
  const isSyncingThis = syncingInvoiceId === invoice.id;
  const hasPermits = !!(
    (invoice.manifestNumber && invoice.manifestNumber.toUpperCase().includes("DANP")) ||
    invoice.hasPermitItems ||
    invoice.requiresPermit ||
    (invoice.invoiceItems && invoice.invoiceItems.some((item: any) => item.requiresPermit || item.isPermiso || item.permisos || item.permiso)) ||
    (invoice.items && invoice.items.some((item: any) => item.requiresPermit || item.isPermiso || item.permisos || item.permiso))
  );
  const tooltipSide = virtualRow && virtualRow.index < 2 ? "bottom" : "top";
  const tooltipAlign = virtualRow && virtualRow.index < 2 ? "end" : "center";

  const annulledInfo = React.useMemo(() => {
    if (invoice.status !== "annulled") return null;
    const entry = Array.isArray(invoice.statusHistory)
      ? [...invoice.statusHistory].reverse().find((h: any) => h.status === "annulled")
      : null;
    const byRaw = entry?.changedBy || null;
    let byResolved = byRaw || "Administrador";
    if (byRaw && !byRaw.includes("@")) {
      const userMatch = users?.find((u: any) => u.id === byRaw);
      if (userMatch) {
        byResolved = `${userMatch.fullName} (${userMatch.email})`;
      }
    }
    return {
      date: entry?.changedAt ? formatRowDate(entry.changedAt, true) : null,
      by: byResolved,
    };
  }, [invoice.status, invoice.statusHistory, users]);


  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div
      ref={virtualRow.measureElement}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${virtualRow.start}px)`,
      }}
      className={cn(
        "flex flex-col border-b border-border transition-colors group bg-background",
        isSelected
          ? "bg-slate-50 dark:bg-slate-900/40"
          : isTemporary
            ? "bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
            : isAnnulled
              ? "opacity-60 bg-gray-50/50 hover:bg-gray-100/50 dark:bg-gray-900/20"
              : "hover:bg-accent/5"
      )}
    >
      <div
        className="grid w-full h-10 items-stretch text-xs"
        style={{ gridTemplateColumns: invoicesGridTemplateCols }}
      >
        {/* 1. Checkbox */}
        <div className="border-r border-border flex items-center justify-center bg-muted/10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(invoice.id)}
            className="h-4 w-4 rounded border-gray-400 text-gray-900 focus:ring-gray-500 focus:ring-offset-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
            data-testid={`invoice-checkbox-${invoice.id}`}
            aria-label={`Select invoice ${invoice.invoiceNumber}`}
          />
        </div>

        {/* 2. Details Button */}
        <div className="border-r border-border flex items-center justify-center bg-muted/5 text-muted-foreground select-none">
          <button
            onClick={() => onShowDetails(invoice)}
            className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-background hover:bg-muted transition-colors shadow-sm"
            title="Ver Detalles/Editar"
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* 3. Invoice Number */}
        <div className="border-r border-border flex flex-col justify-center px-3 py-1 font-mono text-xs select-text min-w-0">
          <div className="flex items-center gap-1 group/inv">
            <span className={cn(
              "font-semibold truncate",
              isAnnulled ? "line-through text-muted-foreground" : "text-gray-900 dark:text-gray-100"
            )}>
              {invoice.invoiceNumber || "Sin Número"}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyText(invoice.invoiceNumber || "");
              }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/inv:opacity-100 transition-opacity"
              title="Copiar N° Factura"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          {(invoice.createdAt || invoice.invoiceDate) && (
            <span className="text-[10px] text-muted-foreground font-sans">
              {formatRowDate(invoice.createdAt || invoice.invoiceDate)}
            </span>
          )}
        </div>

        {/* 4. Manifiesto — inline editor like Packages */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          <PackageManifestEditor
            packageId={invoice.id}
            trackingNumber={invoice.invoiceNumber || ""}
            currentManifest={invoice.manifestNumber || ""}
            slCode={invoice.clientSlCode || ""}
            customerName={invoice.clientName || ""}
            weight={invoice.totalWeight || 0}
            price={invoice.totalAmount || 0}
            description={""}
            permisos={hasPermits}
            manifests={manifests}
            triggerClassName="w-full h-full px-3 py-2 text-xs font-mono text-gray-700 bg-transparent hover:bg-gray-100/60 focus:z-10 focus:ring-1 focus:ring-blue-500 rounded-none shadow-none text-left truncate cursor-pointer flex items-center justify-start transition-colors"
          />
        </div>

        {/* 5. Cliente — click → ReassignCustomerModal */}
        <div
          onClick={() =>
            onReassignCustomer(
              invoice.id,
              invoice.customerId || null,
              invoice.clientName || null,
              invoice.clientSlCode || null
            )
          }
          className="border-r border-border flex items-center gap-2 px-3 py-1 min-w-0 select-text cursor-pointer hover:bg-gray-100/60 dark:hover:bg-slate-800/40 transition-colors"
          title="Reasignar Cliente"
        >
          {invoice.clientSlCode ? (
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-xs border px-1.5 py-0.5 rounded shrink-0 font-semibold cursor-copy transition-colors",
                isTemporary
                  ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onCopyText(invoice.clientSlCode);
              }}
              title="Copiar SmartID (slCode)"
            >
              {invoice.clientSlCode}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-xs bg-red-50 hover:bg-red-100 text-red-600 border-red-200 px-1.5 py-0.5 rounded shrink-0 font-medium">
              SIN ID
            </Badge>
          )}

          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-1">
              {isTemporary && (
                <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" />
              )}
              <span className="font-bold text-gray-900 dark:text-gray-100 truncate uppercase text-xs leading-none">
                {invoice.clientName || "Cliente Desconocido"}
              </span>
              {isCustomerConsolidating(invoice, customerMap) && (
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 px-1.5 py-0 rounded text-[9px] font-extrabold shrink-0"
                  title="Cliente Consolida"
                >
                  C
                </Badge>
              )}
            </div>
            {/* Communication micro-badges */}
            {invoice.smsSent && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-600 font-semibold">
                  <MessageSquare className="h-2.5 w-2.5" /> SMS
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 6. Ruta — RouteInlineCell like Packages */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          <RoutePicker
            value={invoice.clientRoute || invoice.route?.name || invoice.route || invoice.customer?.ruta || ""}
            onChange={(name) =>
              onSaveField(
                invoice.id,
                "route",
                name,
                invoice.clientRoute || invoice.route?.name || invoice.route || ""
              )
            }
            routes={routes}
            isEncomienda={(invoice.clientRoute || invoice.route?.name || invoice.route || invoice.customer?.ruta) === "Encomiendas"}
            encomiendaName={
              (invoice.clientRoute || invoice.route?.name || invoice.route || invoice.customer?.ruta) === "Encomiendas"
                ? (invoice.encomiendaServiceName || invoice.encomiendaService || invoice.courierService || invoice.customer?.encomienda?.name || "")
                : undefined
            }
            variant="pill"
          />
        </div>

        {/* 7. Total + TC inline */}
        <div
          onClick={() => onShowDetails(invoice)}
          className="border-r border-border flex flex-col justify-center px-3 py-1 font-mono text-xs select-text min-w-0 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-slate-800/40 transition-colors"
          title="Ver detalle / Editar ítems"
        >
          <span className="font-bold text-gray-900 dark:text-gray-100">
            ${Number(invoice.totalAmount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {invoice.exchangeRate > 0 && (
            <span className="text-[10px] text-muted-foreground leading-none flex items-center gap-0.5 mt-0.5 font-sans">
              <span>₡{Math.round((invoice.totalAmount || 0) * invoice.exchangeRate).toLocaleString("es-CR").replace(/\s/g, ".")}</span>
              <span className="text-muted-foreground/30 select-none">·</span>
              <span className="text-muted-foreground/70">TC {Number(invoice.exchangeRate).toLocaleString("es-CR", { maximumFractionDigits: 0 })}</span>
            </span>
          )}
        </div>

        {/* 9. Estado — vibrant pill badge + inline edit */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          {annulledInfo ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full h-full flex items-stretch">
                  <StatusPopoverEditor
                    currentStatus={invoice.status}
                    statusOptions={statusOptions}
                    statusColors={STATUS_STYLES}
                    onSave={(newValue) =>
                      onSaveField(invoice.id, "status", newValue, invoice.status)
                    }
                    disabled={!canUpdate("invoices")}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side={tooltipSide}
                align={tooltipAlign}
                className="p-3 text-xs space-y-1 bg-gray-900 text-white dark:bg-gray-800 rounded-lg shadow-md border-0 select-none z-[400] max-w-[280px]"
              >
                <div className="font-semibold text-red-400">Detalles de Anulación</div>
                <div className="text-gray-300">
                  <span className="font-medium text-gray-400">Fecha/Hora:</span> {annulledInfo.date || "No registrada"}
                </div>
                <div className="text-gray-300">
                  <span className="font-medium text-gray-400">Usuario:</span> {annulledInfo.by || "Administrador"}
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <StatusPopoverEditor
              currentStatus={invoice.status}
              statusOptions={statusOptions}
              statusColors={STATUS_STYLES}
              onSave={(newValue) =>
                onSaveField(invoice.id, "status", newValue, invoice.status)
              }
              disabled={!canUpdate("invoices")}
            />
          )}
        </div>

        {/* 10. Sync column — icons + preview + actions dropdown */}
        <div className="flex items-center justify-center gap-3 px-1.5 w-full">
          {/* Invoice Preview icon */}
          {onPreview && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onPreview(invoice.id); }}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-background hover:bg-muted text-muted-foreground hover:text-blue-600 dark:hover:bg-gray-800 transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Vista previa factura"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide} align={tooltipAlign} className="text-xs">Vista previa</TooltipContent>
            </Tooltip>
          )}

          {/* SP2 sync status icon */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onForceSync) {
                    onForceSync(invoice);
                  }
                }}
                disabled={isSyncingThis}
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-lg border transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500",
                  isSynced
                    ? "border-emerald-200 bg-emerald-50/50 text-emerald-600 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-450 hover:bg-emerald-100/50"
                    : "border-gray-200 bg-background text-muted-foreground hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/20 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer"
                )}
                aria-label="Sincronizar con SP2"
              >
                {isSyncingThis ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Globe2 className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide} align={tooltipAlign} className="text-xs">
              {isSynced ? (
                <>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">Sincronizado con SP2</p>
                  {invoice.smartwebSyncedAt && (
                    <p className="text-gray-400 text-[10px] mt-0.5">
                      {formatRowDate(invoice.smartwebSyncedAt, true)}
                    </p>
                  )}
                  <p className="text-gray-500 text-[9px] mt-1">Haz clic para volver a sincronizar</p>
                </>
              ) : isSyncingThis ? (
                "Sincronizando..."
              ) : (
                "Sincronizar con SP2"
              )}
            </TooltipContent>
          </Tooltip>

          {onSendEmail && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAnnulled) {
                      onSendEmail(invoice.id);
                    }
                  }}
                  disabled={sendingEmailId === invoice.id || isAnnulled}
                  className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-lg border transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500",
                    invoice.emailSent
                      ? "border-sky-200 bg-sky-50/50 text-sky-600 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-400 hover:bg-sky-100/50"
                      : "border-gray-200 bg-background text-muted-foreground hover:text-sky-600 hover:border-sky-200 hover:bg-sky-50/20 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer",
                    isAnnulled && "opacity-40 cursor-not-allowed"
                  )}
                  aria-label="Enviar correo"
                >
                  {sendingEmailId === invoice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide} align={tooltipAlign} className="text-xs">
                {invoice.emailSent ? (
                  <>
                    <p className="font-semibold text-sky-600 dark:text-sky-450">Correo enviado ✓</p>
                    <p className="text-gray-500 text-[9px] mt-0.5">Haz clic para reenviar</p>
                  </>
                ) : (
                  "Enviar correo"
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={(e) => e.stopPropagation()}
                aria-label="Acciones de factura"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="md:w-[480px] w-56 text-xs p-3" side="left">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wide py-1 border-b pb-1.5 mb-2">
                Acciones de Factura
              </DropdownMenuLabel>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Column 1: Datos y Asignación */}
                <div className="space-y-1">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase px-2 py-0.5 mb-1 tracking-wider">
                    Asignación y Datos
                  </div>
                  {/* AI Suggest */}
                  {onSuggestAI && (
                    <DropdownMenuItem
                      disabled={isAnnulled || suggestingAIId === invoice.id}
                      onClick={(e) => { e.stopPropagation(); onSuggestAI(invoice); }}
                      className="cursor-pointer text-fuchsia-600 focus:bg-fuchsia-50 dark:focus:bg-fuchsia-950/30 gap-2 rounded-md"
                    >
                      {suggestingAIId === invoice.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Sparkles className="h-3.5 w-3.5" />}
                      AI Sugerir
                    </DropdownMenuItem>
                  )}
                  {/* Reasignar Cliente */}
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onReassignCustomer(invoice.id, invoice.customerId || null, invoice.clientName || null, invoice.clientSlCode || null); }}
                    className="cursor-pointer text-violet-600 focus:bg-violet-50 dark:focus:bg-violet-950/30 gap-2 rounded-md"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    Reasignar Cliente
                  </DropdownMenuItem>
                  {/* Corregir Manifiesto */}
                  <DropdownMenuItem
                    onClick={(e) => { e.stopPropagation(); onReassignManifest(invoice); }}
                    className="cursor-pointer text-blue-600 focus:bg-blue-50 dark:focus:bg-blue-950/30 gap-2 rounded-md"
                  >
                    <FileEdit className="h-3.5 w-3.5" />
                    Corregir Manifiesto
                  </DropdownMenuItem>
                </div>

                {/* Column 2: Envío y Sincronización */}
                <div className="space-y-1">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase px-2 py-0.5 mb-1 tracking-wider">
                    Sincronización y Envío
                  </div>
                  {/* Sync SmartWeb */}
                  <DropdownMenuItem
                    disabled={isAnnulled || isSyncingThis}
                    onClick={(e) => { e.stopPropagation(); onForceSync(invoice); }}
                    className={cn(
                      "cursor-pointer gap-2 rounded-md",
                      isSynced
                        ? "text-amber-700 focus:bg-amber-50 dark:focus:bg-amber-950/30"
                        : "text-emerald-600 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                    )}
                  >
                    {isSyncingThis
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : isSynced
                        ? <RefreshCw className="h-3.5 w-3.5" />
                        : <CheckCircle className="h-3.5 w-3.5" />}
                    {isSynced ? "Re-sync SP2" : "Sync SmartWeb"}
                  </DropdownMenuItem>
                  {/* Vista previa */}
                  {onPreview && (
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onPreview(invoice.id); }}
                      className="cursor-pointer text-blue-600 focus:bg-blue-50 dark:focus:bg-blue-950/30 gap-2 rounded-md"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Vista Previa
                    </DropdownMenuItem>
                  )}
                  {/* Enviar Correo */}
                  {onSendEmail && (
                    <DropdownMenuItem
                      disabled={isAnnulled || sendingEmailId === invoice.id}
                      onClick={(e) => { e.stopPropagation(); onSendEmail(invoice.id); }}
                      className="cursor-pointer text-sky-600 focus:bg-sky-50 dark:focus:bg-sky-950/30 gap-2 rounded-md"
                    >
                      {sendingEmailId === invoice.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Send className="h-3.5 w-3.5" />}
                      {invoice.emailSent ? "Reenviar Correo" : "Enviar Correo"}
                    </DropdownMenuItem>
                  )}
                </div>

                {/* Column 3 (Span full): Gestión Crítica y Devoluciones */}
                <div className="col-span-1 md:col-span-2 border-t pt-2 mt-1 space-y-1">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase px-2 py-0.5 mb-1 tracking-wider">
                    Gestión de Paquetes y Estado
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* Devolver Paquetes */}
                    {routeReturnsEnabled && !isAnnulled && onReturnPackages && (
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); onReturnPackages(invoice); }}
                        className="cursor-pointer text-amber-600 focus:bg-amber-50 dark:focus:bg-amber-950/30 gap-2 rounded-md animate-pulse"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Devolver Paquetes
                      </DropdownMenuItem>
                    )}

                    {/* Anular / Restaurar */}
                    {!isAnnulled ? (
                      onAnnul && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onAnnul(invoice.id, invoice.invoiceNumber, invoice.manifestNumber); }}
                          className="cursor-pointer text-amber-600 focus:bg-amber-50 dark:focus:bg-amber-950/30 gap-2 rounded-md"
                        >
                          <X className="h-3.5 w-3.5" />
                          Anular Factura
                        </DropdownMenuItem>
                      )
                    ) : (
                      onRestore && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onRestore(invoice.id); }}
                          className="cursor-pointer text-emerald-700 focus:bg-emerald-50 dark:focus:bg-emerald-950/30 gap-2 rounded-md"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          De-anular
                        </DropdownMenuItem>
                      )
                    )}

                    {/* Enviar a Papelera / Eliminar */}
                    {onDelete && (
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); onDelete(invoice.id, invoice.invoiceNumber); }}
                        className="cursor-pointer text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30 gap-2 rounded-md"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar Factura
                      </DropdownMenuItem>
                    )}
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 text-xs">
        {/* Row identifier header */}
        <div className="px-2 py-1.5 border-b border-border mb-1">
          <p className="font-semibold text-[11px] text-foreground truncate">{invoice.invoiceNumber || 'Sin número'}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {invoice.clientSlCode || invoice.slCode || '—'} · {invoice.clientName || '—'}
          </p>
        </div>

        {/* View Details */}
        <ContextMenuItem
          onClick={() => onShowDetails(invoice)}
          className="cursor-pointer gap-2"
        >
          <Info className="h-3.5 w-3.5" />
          Ver Detalles
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* AI Suggest */}
        {onSuggestAI && (
          <ContextMenuItem
            disabled={isAnnulled || suggestingAIId === invoice.id}
            onClick={() => onSuggestAI(invoice)}
            className="cursor-pointer text-fuchsia-600 gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Sugerir
          </ContextMenuItem>
        )}

        {/* Reasignar Cliente */}
        <ContextMenuItem
          onClick={() => onReassignCustomer(invoice.id, invoice.customerId || null, invoice.clientName || null, invoice.clientSlCode || null)}
          className="cursor-pointer text-violet-600 gap-2"
        >
          <UserCog className="h-3.5 w-3.5" />
          Reasignar Cliente
        </ContextMenuItem>

        {/* Corregir Manifiesto */}
        <ContextMenuItem
          onClick={() => onReassignManifest(invoice)}
          className="cursor-pointer text-blue-600 gap-2"
        >
          <FileEdit className="h-3.5 w-3.5" />
          Corregir Manifiesto
        </ContextMenuItem>

        {/* Sync */}
        <ContextMenuItem
          disabled={isAnnulled || isSyncingThis}
          onClick={() => onForceSync(invoice)}
          className={cn("cursor-pointer gap-2", isSynced ? "text-amber-700" : "text-emerald-600")}
        >
          {isSynced ? <RefreshCw className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
          {isSynced ? "Re-sync SP2" : "Sync SmartWeb"}
        </ContextMenuItem>

        {/* Vista previa */}
        {onPreview && (
          <ContextMenuItem
            onClick={() => onPreview(invoice.id)}
            className="cursor-pointer text-blue-600 gap-2"
          >
            <Eye className="h-3.5 w-3.5" />
            Vista Previa
          </ContextMenuItem>
        )}

        {/* Enviar Correo */}
        {onSendEmail && (
          <ContextMenuItem
            disabled={isAnnulled || sendingEmailId === invoice.id}
            onClick={() => onSendEmail(invoice.id)}
            className="cursor-pointer text-sky-600 gap-2"
          >
            <Send className="h-3.5 w-3.5" />
            {invoice.emailSent ? "Reenviar Correo" : "Enviar Correo"}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {/* Anular / Restaurar */}
        {!isAnnulled ? (
          onAnnul && (
            <ContextMenuItem
              onClick={() => onAnnul(invoice.id, invoice.invoiceNumber, invoice.manifestNumber)}
              className="cursor-pointer text-amber-600 gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Anular Factura
            </ContextMenuItem>
          )
        ) : (
          onRestore && (
            <ContextMenuItem
              onClick={() => onRestore(invoice.id)}
              className="cursor-pointer text-emerald-700 gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              De-anular
            </ContextMenuItem>
          )
        )}

        {/* Eliminar */}
        {onDelete && (
          <ContextMenuItem
            onClick={() => onDelete(invoice.id, invoice.invoiceNumber)}
            className="cursor-pointer text-red-600 gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar Factura
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
