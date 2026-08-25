import React, { useState } from "react";
import {
  Copy,
  Flag,
  AlertTriangle,
  Wifi,
  Loader2,
  Globe2,
  Package as PackageIcon,
  Info,
  Trash2,
  UserCog,
  FileEdit,
  RefreshCw,
  Eye,
  FileText,
} from "lucide-react";
import { cn, isCustomerConsolidating } from "@/lib/utils";
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
import { RouteInlineCell, packagesGridTemplateCols } from "./PackagesDataTable";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";

export interface PackagesSpreadsheetRowProps {
  pkg: any;
  virtualRow: any;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onShowDetails: (id: string) => void;
  onCopyTracking: (text: string) => void;
  onSaveField: (id: string, field: string, value: any, oldValue: any) => void;
  routes: any[];
  canUpdate: (permission: string) => boolean;
  canManage: (permission: string) => boolean;
  statusOptions: any[];
  statusColors: Record<string, string>;
  syncingPkgId: string | null;
  onForceSync: (pkg: any) => Promise<void>;
  onReassignCustomer: (pkgId: string, currentId: string | null, currentName: string | null, currentslCode: string | null) => void;
  manifests: any[];
  t: any;
  pkgInvoices?: any[] | "loading";
  onOpenInvoicesModal: (pkg: any) => void;
  onDelete?: (id: string, trackingNumber: string) => void;
  customerMap?: Map<string, any> | Record<string, any> | null;
}

export const PackagesSpreadsheetRow = React.memo(function PackagesSpreadsheetRow({
  pkg,
  virtualRow,
  isSelected,
  onToggleSelection,
  onShowDetails,
  onCopyTracking,
  onSaveField,
  routes,
  canUpdate,
  canManage,
  statusOptions,
  statusColors,
  syncingPkgId,
  onForceSync,
  onReassignCustomer,
  manifests,
  t,
  pkgInvoices,
  onOpenInvoicesModal,
  onDelete,
  customerMap,
}: PackagesSpreadsheetRowProps) {
  const [isManifestOpen, setIsManifestOpen] = useState(false);
  const tooltipSide = virtualRow && virtualRow.index < 2 ? "bottom" : "top";
  const tooltipAlign = virtualRow && virtualRow.index < 2 ? "end" : "center";

  const getMostRecentInvoiceNumber = () => {
    if (!pkgInvoices || pkgInvoices === "loading" || pkgInvoices.length === 0) return null;
    const activeInv = pkgInvoices.find(
      (inv: any) => inv.status && !["cancelled", "annulled", "deleted"].includes(inv.status)
    );
    const displayInv = activeInv || pkgInvoices[0];
    return displayInv?.invoiceNumber || displayInv?.id || null;
  };
  const recentInvoiceNumber = getMostRecentInvoiceNumber();

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
      // HIGH PERFORMANCE / MEMORY OPTIMIZATION: Row styling
      // Uses lightweight CSS class composition. Warns users when packages have unknown clients
      // with a light amber background warning without triggering expensive layout shifts.
      className={cn(
        "flex flex-col border-b border-border transition-colors group bg-background",
        isSelected
          ? "bg-slate-50 dark:bg-slate-900/40"
          : (!pkg.slCode || !pkg.customerName || pkg.customerName.toLowerCase().includes("desconocido"))
            ? "bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
            : "hover:bg-accent/5"
      )}
    >
      {/* Grid columns row */}
      <div
        className="grid w-full h-10 items-stretch text-xs"
        style={{ gridTemplateColumns: packagesGridTemplateCols }}
      >
        {/* 1. Checkbox */}
        <div className="border-r border-border flex items-center justify-center bg-muted/10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(pkg.id)}
            className="h-4 w-4 rounded border-gray-400 text-gray-900 focus:ring-gray-500 focus:ring-offset-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
            data-testid={`package-checkbox-${pkg.id}`}
            aria-label={`${t("packages.selectPackage")} ${pkg.trackingNumber}`}
          />
        </div>

        {/* 2. Details button */}
        <div className="border-r border-border flex items-center justify-center bg-muted/5 text-muted-foreground select-none">
          <button
            onClick={() => onShowDetails(pkg.id)}
            className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-background hover:bg-muted transition-colors shadow-sm"
            title="Ver Detalles"
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* 3. Tracking Number */}
        <div className="border-r border-border flex flex-col justify-center px-3 py-1 font-mono text-xs select-text min-w-0">
          <div className="flex items-center gap-1 group/tracking">
            <span className="font-semibold text-gray-900 truncate">
              {pkg.trackingNumber || (pkg as any).tracking || pkg.id}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyTracking(pkg.trackingNumber || (pkg as any).tracking || pkg.id);
              }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover/tracking:opacity-100 transition-opacity"
              title={t("packages.copyTracking")}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>

        </div>

        {/* 4. Manifiesto */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          <PackageManifestEditor
            packageId={pkg.id}
            trackingNumber={pkg.trackingNumber || pkg.tracking || ""}
            currentManifest={(pkg as any).manifestNumber || (pkg as any).manifiesto || ""}
            slCode={pkg.slCode || ""}
            customerName={pkg.customerName || ""}
            weight={pkg.weight || 0}
            price={pkg.calculatedCost || (pkg as any).price || (pkg as any).cost || 0}
            description={(pkg as any).description || (pkg as any).descripcion || ""}
            permisos={(pkg as any).requiresPermit || (pkg as any).permisos || false}
            manifests={manifests}
            open={isManifestOpen}
            onOpenChange={setIsManifestOpen}
            triggerClassName="w-full h-full px-3 py-2 text-xs font-mono text-gray-700 bg-transparent hover:bg-gray-100/60 focus:z-10 focus:ring-1 focus:ring-blue-500 rounded-none shadow-none text-left truncate cursor-pointer flex items-center justify-start transition-colors"
          />
        </div>

        {/* 5. SmartID / Customer Name */}
        <div
          onClick={() =>
            onReassignCustomer(
              pkg.id,
              pkg.customerId || null,
              pkg.customerName || null,
              (pkg as any).slCode || null
            )
          }
          className="border-r border-border flex items-center gap-1.5 px-3 py-1 min-w-0 select-text cursor-pointer hover:bg-gray-100/60 transition-colors"
          title="Reasignar Cliente"
        >
          {/* ANTI-REGRESSION WARNING: Clicking the slCode badge MUST only trigger copying (stopPropagation).
              It must NOT propagate to parent's onClick cell handler which opens the customer reassignment modal. */}
          {(pkg as any).slCode ? (
            <Badge
              variant="outline"
              className="font-mono text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200 px-1.5 py-0.5 rounded shrink-0 font-medium cursor-copy transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCopyTracking((pkg as any).slCode);
              }}
              title="Copiar SmartID / slCode"
            >
              {(pkg as any).slCode}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-xs bg-red-50 hover:bg-red-50 text-red-600 border-red-200 px-1.5 py-0.5 rounded shrink-0 font-medium">
              SIN ID
            </Badge>
          )}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="font-bold text-gray-900 truncate uppercase text-xs leading-tight">
              {pkg.customerName || "—"}
            </span>
            {isCustomerConsolidating(pkg, customerMap) && (
              <Badge
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200 px-1.5 py-0 rounded text-[9px] font-extrabold shrink-0"
                title="Cliente Consolida"
              >
                C
              </Badge>
            )}
          </div>
        </div>

        {/* 6. Factura */}
        <div className="border-r border-border flex items-center px-3 py-1 min-w-0 select-text">
          {pkgInvoices === "loading" ? (
            <div className="flex items-center gap-1.5 text-muted-foreground w-full justify-between">
              {pkg.invoiceNumber ? (
                <button
                  type="button"
                  onClick={() => onOpenInvoicesModal(pkg)}
                  className="font-mono text-xs text-gray-900 hover:underline text-left truncate flex-1 font-medium"
                >
                  {pkg.invoiceNumber}
                </button>
              ) : (
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              )}
              <Loader2 className="h-3 w-3 animate-spin shrink-0 text-muted-foreground/60" />
            </div>
          ) : !pkgInvoices || pkgInvoices.length === 0 ? (
            <span className="text-gray-400 font-mono text-xs">Sin Factura</span>
          ) : (() => {
            const activeInv = pkgInvoices.find(
              (inv: any) => inv.status && !["cancelled", "annulled", "deleted"].includes(inv.status)
            );
            
            const displayInv = activeInv || pkgInvoices[0];
            const isMultiple = pkgInvoices.length > 1;
            
            const invNumber = displayInv?.invoiceNumber || displayInv?.id || "—";
            const invStatus = displayInv?.status || "draft";
            const isAnnulled = ["cancelled", "annulled", "deleted"].includes(invStatus);
            
            return (
              <div className="flex items-center gap-1.5 min-w-0 w-full justify-between">
                <button
                  type="button"
                  onClick={() => onOpenInvoicesModal(pkg)}
                  className={cn(
                    "font-mono text-xs hover:underline text-left truncate flex-1 font-medium",
                    isAnnulled ? "line-through text-muted-foreground" : "text-gray-900"
                  )}
                  title={`Ver detalle de factura ${invNumber}`}
                >
                  {invNumber}
                </button>
                {isMultiple && (
                  <button
                    type="button"
                    onClick={() => onOpenInvoicesModal(pkg)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-bold px-1.5 py-0.5 rounded hover:bg-blue-50 shrink-0 transition-colors"
                  >
                    + más
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* 6. Route */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          <RouteInlineCell
            value={(pkg as any).ruta || pkg.route?.name || ""}
            routes={routes}
            onSave={(name) =>
              onSaveField(
                pkg.id,
                "ruta",
                name,
                (pkg as any).ruta || pkg.route?.name || ""
              )
            }
          />
        </div>

        {/* 7. Weight */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          <InlineEditCell
            value={pkg.weight}
            onSave={(newValue) =>
              onSaveField(
                pkg.id,
                "weight",
                newValue,
                pkg.weight
              )
            }
            type="number"
            disabled={!canUpdate("packages")}
            hideButtons={true}
            saveOnBlur={true}
          />
        </div>

        {/* 8. Estado */}
        <div className="border-r border-border flex items-stretch min-w-0 h-full w-full">
          <StatusPopoverEditor
            currentStatus={pkg.status}
            statusOptions={statusOptions}
            statusColors={statusColors}
            onSave={(newValue) =>
              onSaveField(
                pkg.id,
                "status",
                newValue,
                pkg.status
              )
            }
            disabled={!canUpdate("packages")}
          />
        </div>

        {/* 9. Sync Status (smartweb/SP2) */}
        <div className="flex items-center justify-center px-1.5 py-1 gap-3 w-full">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-lg border transition-colors shadow-sm cursor-help",
                  pkg.smartwebSynced
                    ? "border-violet-200 bg-violet-50/50 text-violet-600 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-400"
                    : "border-gray-200 bg-background text-muted-foreground/45 dark:border-gray-800"
                )}>
                  <Globe2 className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide} align={tooltipAlign} className="bg-gray-900 text-white text-xs max-w-[200px]">
                <p className={pkg.smartwebSynced ? "font-semibold text-violet-400" : "font-semibold"}>
                  {pkg.smartwebSynced ? "Sincronizado" : "No sincronizado"}
                </p>
                {pkg.smartwebSynced && pkg.smartwebSyncedAt && (
                  <p className="text-gray-400 text-[10px] mt-0.5">
                    {new Date(pkg.smartwebSyncedAt).toLocaleString("es-CR")}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>

            <PermissionTooltip allowed={canManage("packages")} side={tooltipSide} align={tooltipAlign}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onForceSync(pkg);
                    }}
                    disabled={syncingPkgId === pkg.id}
                    className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-background hover:bg-muted text-muted-foreground hover:text-violet-600 dark:hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-500"
                    aria-label="Force Sync to SP2"
                  >
                    {syncingPkgId === pkg.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Wifi className="h-4 w-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side={tooltipSide} align={tooltipAlign} className="text-xs">
                  Forzar Sincronización SP2
                </TooltipContent>
              </Tooltip>
            </PermissionTooltip>
          </div>
        </div>
      </div>
    </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56 text-xs">
        {/* Row identifier header */}
        <div className="px-2 py-1.5 border-b border-border mb-1">
          <p className="font-semibold text-[11px] text-foreground truncate">{pkg.trackingNumber || (pkg as any).tracking || pkg.id}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {(pkg as any).slCode || '—'} · {pkg.customerName || '—'}
          </p>
        </div>

        {/* View Details */}
        <ContextMenuItem
          onClick={() => onShowDetails(pkg.id)}
          className="cursor-pointer gap-2"
        >
          <Eye className="h-3.5 w-3.5" />
          Ver Detalles
        </ContextMenuItem>

        {/* Reasignar Cliente */}
        <ContextMenuItem
          onClick={() => onReassignCustomer(pkg.id, pkg.customerId || null, pkg.customerName || null, (pkg as any).slCode || null)}
          className="cursor-pointer text-violet-600 gap-2"
        >
          <UserCog className="h-3.5 w-3.5" />
          Reasignar Cliente
        </ContextMenuItem>

        {/* Cambiar Manifiesto */}
        <ContextMenuItem
          onClick={() => setIsManifestOpen(true)}
          className="cursor-pointer text-blue-600 gap-2"
        >
          <FileEdit className="h-3.5 w-3.5" />
          Cambiar Manifiesto
        </ContextMenuItem>

        {/* Actualizar Estado */}
        {canUpdate("packages") && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="cursor-pointer gap-2 text-slate-700">
              <PackageIcon className="h-3.5 w-3.5 text-slate-500" />
              Actualizar Estado
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48 text-xs">
              {statusOptions.map((opt) => (
                <ContextMenuItem
                  key={opt.value}
                  onClick={() => onSaveField(pkg.id, "status", opt.value, pkg.status)}
                  className="cursor-pointer flex items-center justify-between py-1.5"
                >
                  <span className={cn(pkg.status === opt.value ? "font-semibold text-primary" : "")}>
                    {opt.label}
                  </span>
                  {pkg.status === opt.value && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {/* Sync SP2 */}
        {canManage("packages") && (
          <ContextMenuItem
            onClick={() => onForceSync(pkg)}
            className="cursor-pointer text-amber-700 gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sincronizar SP2
          </ContextMenuItem>
        )}

        {/* Copiar Tracking */}
        <ContextMenuItem
          onClick={() => onCopyTracking(pkg.trackingNumber || (pkg as any).tracking || pkg.id)}
          className="cursor-pointer gap-2"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar Tracking
        </ContextMenuItem>

        {/* Copiar Factura Más Reciente */}
        {recentInvoiceNumber && (
          <ContextMenuItem
            onClick={() => onCopyTracking(recentInvoiceNumber)}
            className="cursor-pointer text-sky-600 gap-2"
          >
            <FileText className="h-3.5 w-3.5" />
            Copiar Factura ({recentInvoiceNumber})
          </ContextMenuItem>
        )}

        {onDelete && canManage("packages") && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDelete(pkg.id, pkg.trackingNumber || (pkg as any).tracking || pkg.id)}
              className="cursor-pointer text-red-600 gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar Paquete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
