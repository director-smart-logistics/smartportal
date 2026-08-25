import React, { memo } from "react";
import { FileText, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { CustomerAutocomplete } from "@/components/customer/CustomerAutocomplete";
import { SpreadsheetCell } from "./SpreadsheetCell";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouteOptions } from "@/components/nova/nova-route-options";
import { updateCustomerRuta } from "@/lib/services/customer-sync";
import { toast } from "sonner";
import { getRouteColors, shortenRouteName } from "./utils";
import { CalculatedSeaManifestRow } from "./useSpreadsheetCalculations";
import { gridTemplateCols } from "./SpreadsheetGrid";

interface SpreadsheetRowProps {
  row: CalculatedSeaManifestRow;
  rowIdx: number;
  rowCount: number;
  colCount: number;
  globalPrice?: number;
  onChange: (
    id: string,
    field: keyof CalculatedSeaManifestRow,
    value: string,
  ) => void;
  onRowUpdate: (id: string, updates: Partial<CalculatedSeaManifestRow>) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
    rowCount: number,
    colCount: number,
  ) => void;
  onPaste: (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
  ) => void;
  onDelete?: (id: string) => void;
  onPreviewInvoice?: (id: string) => void;
  onPreviewRealInvoice?: (invoiceNumber: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export const SpreadsheetRow = memo(function SpreadsheetRow({
  row,
  rowIdx,
  rowCount,
  colCount,
  globalPrice = 30,
  onChange,
  onRowUpdate,
  onKeyDown,
  onPaste,
  onDelete,
  onPreviewInvoice,
  onPreviewRealInvoice,
  isSelected,
  onToggleSelect,
}: SpreadsheetRowProps) {
  const { t } = useTranslation("manifests");
  const routeOptions = useRouteOptions();

  return (
    <div
      className={cn(
        "grid w-full group relative transition-colors",
        isSelected ? "bg-primary/5" : "",
      )}
      style={{ gridTemplateColumns: gridTemplateCols }}
    >
      {/* Checkbox Column */}
      <div className="shrink-0 border-r border-b border-border flex items-center justify-center bg-muted/20">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect?.(row.id)}
          disabled={!row.isValid}
        />
      </div>

      {/* Row Number Indicator */}
      <div className="shrink-0 border-r border-b border-border bg-muted/50 flex items-center justify-center text-xs text-muted-foreground select-none">
        {rowIdx + 1}
      </div>

      {/* Smart ID (Autocompletado) */}
      <div
        className="relative border-r border-b border-border w-full h-full min-w-0"
        data-row={rowIdx}
        data-col={0}
        onKeyDown={(e) => onKeyDown(e as any, rowIdx, 0, rowCount, colCount)}
      >
        <CustomerAutocomplete
          data-row={rowIdx}
          data-col={0}
          value={row.slCode}
          onChange={(id, name) => {
            /* Ignorado temporalmente si no se necesita id */
          }}
          onCustomerSelect={(c) =>
            onRowUpdate(row.id, {
              slCode: c.slCode,
              customerName: c.fullName,
              customerEmail: c.email || "",
              ruta: c.ruta || "",
            })
          }
          onInputChange={(val) => onChange(row.id, "slCode", val)}
          placeholder={t("spreadsheet.smartId", "Smart ID")}
          displayValue="slCode"
          className={cn(
            "w-full h-full px-3 py-2 text-sm outline-none transition-colors border-0 rounded-none shadow-none",
            "focus-visible:ring-2 focus-visible:ring-[hsl(var(--manifest-brand))] focus-visible:z-10 relative bg-transparent",
            "hover:bg-accent/10 focus-visible:ring-offset-0 truncate",
          )}
        />
      </div>

      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={1}
        value={row.warehouseId}
        onChange={(v) => onChange(row.id, "warehouseId", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 1, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 1)}
        placeholder={t("spreadsheet.warehouseId", "Warehouse ID")}
        className="w-full min-w-0"
      />

      {/* Customer Name (Read Only) */}
      <div
        className="border-r border-b border-border px-3 py-2 text-sm text-muted-foreground font-medium bg-muted/30 flex items-center overflow-hidden w-full min-w-0"
        data-testid={`cell-${rowIdx}-customerName`}
        title={row.customerName || ""}
      >
        <span className="truncate w-full">{row.customerName || ""}</span>
      </div>

      {/* Ruta (Editable via Dropdown) */}
      <div
        className="border-r border-b border-border px-3 py-2 text-sm text-muted-foreground font-medium bg-muted/30 flex items-center w-full min-w-0 overflow-hidden"
        data-testid={`cell-${rowIdx}-ruta`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full text-left truncate flex items-center hover:opacity-80 transition-opacity focus:outline-none">
              {row.ruta ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] font-medium whitespace-nowrap truncate",
                    getRouteColors(row.ruta).bg,
                    getRouteColors(row.ruta).text,
                  )}
                >
                  {shortenRouteName(row.ruta)}
                </Badge>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border-dashed border shrink-0 border-muted-foreground/40 text-muted-foreground/60 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer">
                  sin ruta
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44 z-[70]">
            {routeOptions.map((r) => (
              <DropdownMenuItem
                key={r.name}
                onClick={async () => {
                  try {
                    // Update in spreadsheet context (so it's saved to the manifest)
                    onChange(row.id, "ruta", r.name);

                    // Update in Firestore user profile if valid SL code
                    if (row.slCode) {
                      await updateCustomerRuta(row.slCode, r.name, false, 'spreadsheet');
                      toast.success(
                        `Ruta actualizada a ${r.name} para ${row.slCode}`,
                      );
                      window.dispatchEvent(
                        new CustomEvent("customer-ruta-updated", {
                          detail: { slCode: row.slCode, ruta: r.name },
                        }),
                      );
                    }
                  } catch (err) {
                    console.error("Error updating customer route:", err);
                    toast.error(
                      "Error actualizando la ruta del cliente en la base de datos",
                    );
                  }
                }}
                className={cn("gap-2", row.ruta === r.name && "font-semibold")}
              >
                <div className={cn("w-2 h-2 rounded-full bg-current", r.text)} />
                {r.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={2}
        value={row.length}
        onChange={(v) => onChange(row.id, "length", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 2, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 2)}
        placeholder="0.0"
        className="w-full min-w-0"
      />
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={3}
        value={row.width}
        onChange={(v) => onChange(row.id, "width", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 3, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 3)}
        placeholder="0.0"
        className="w-full min-w-0"
      />
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={4}
        value={row.height}
        onChange={(v) => onChange(row.id, "height", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 4, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 4)}
        placeholder="0.0"
        className="w-full min-w-0"
      />

      {/* Multiplier / Quantity */}
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={5}
        value={row.multiplier || ""}
        onChange={(v) => onChange(row.id, "multiplier", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 5, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 5)}
        placeholder="1"
        className="w-full min-w-0 bg-blue-50/20"
        type="number"
      />

      {/* Calculated Columns / Overrides */}
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={6}
        value={row.cubicFeetOverride || ""}
        onChange={(v) => onChange(row.id, "cubicFeetOverride", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 6, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 6)}
        placeholder={row.cubicFeet > 0 ? row.cubicFeet.toFixed(2) : ""}
        className="w-full min-w-0"
        testId={`cell-${rowIdx}-cubicFeet`}
        type="number"
      />
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={7}
        value={row.roundedVolumeOverride || ""}
        onChange={(v) => onChange(row.id, "roundedVolumeOverride", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 7, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 7)}
        placeholder={row.roundedVolume > 0 ? row.roundedVolume.toString() : ""}
        className="w-full min-w-0"
        testId={`cell-${rowIdx}-roundedVolume`}
        type="number"
      />

      {/* Price Override Column (Precio/ft³) */}
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={8}
        value={row.priceOverride || ""}
        onChange={(v) => onChange(row.id, "priceOverride", v)}
        onKeyDown={(e) => onKeyDown(e, rowIdx, 8, rowCount, colCount)}
        onPaste={(e) => onPaste(e, rowIdx, 8)}
        placeholder={globalPrice.toFixed(2)}
        className="w-full min-w-0 font-semibold text-[hsl(var(--manifest-brand))]"
        testId={`cell-${rowIdx}-priceOverride`}
        type="number"
      />

      {/* Price USD Column (Read Only) */}
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={-1}
        value={
          row.price > 0
            ? `$ ${row.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : ""
        }
        readOnly
        className="w-full min-w-0 font-medium text-muted-foreground bg-muted/10"
        testId={`cell-${rowIdx}-price`}
      />

      {/* Price CRC Column (Read Only) */}
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={-1}
        value={
          row.priceCRC > 0
            ? `₡ ${row.priceCRC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : ""
        }
        readOnly
        className="w-full min-w-0 font-medium text-muted-foreground bg-muted/10"
        testId={`cell-${rowIdx}-priceCRC`}
      />

      {/* Invoice Link Column (Read Only) */}
      <div className="border-r border-b border-border px-3 py-2 text-sm text-muted-foreground font-medium bg-muted/30 flex items-center justify-center overflow-hidden w-full min-w-0">
        {row.invoiceNumber ? (
          (() => {
            const s = (row.invoiceStatus || "draft").toLowerCase();
            const isVoid = [
              "annulled",
              "void",
              "cancelled",
              "deleted",
            ].includes(s);
            const isSent = s === "sent";
            const isPaid = s === "paid";

            let badgeColors = "bg-slate-100 text-slate-700 border-slate-200"; // default draft
            if (isVoid)
              badgeColors =
                "bg-red-50 text-red-500 border-red-200 line-through opacity-60";
            else if (isPaid)
              badgeColors = "bg-green-50 text-green-700 border-green-200";
            else if (isSent)
              badgeColors = "bg-blue-50 text-blue-700 border-blue-200";

            const shortInvoiceNumber = row.invoiceNumber.length > 8 
              ? row.invoiceNumber.slice(0, 8) + "..." 
              : row.invoiceNumber;

            const BadgeEl = (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap cursor-pointer",
                  badgeColors,
                )}
                title={row.invoiceNumber}
              >
                {shortInvoiceNumber}
              </Badge>
            );

            if (isVoid) {
              return BadgeEl;
            }

            return (
              <div className="flex items-center justify-center gap-1.5 w-full min-w-0">
                <div
                  onClick={() => onPreviewRealInvoice?.(row.invoiceNumber!)}
                  className="hover:opacity-80 cursor-pointer overflow-hidden truncate"
                >
                  {BadgeEl}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(row.invoiceNumber!);
                    toast.success("Factura copiada");
                  }}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-slate-200 active:bg-slate-300 transition-colors shrink-0"
                  title="Copiar factura"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()
        ) : row.warehouseId || row.slCode ? (
          <Badge
            variant="outline"
            className="text-[10px] font-medium whitespace-nowrap cursor-pointer bg-blue-50/50 text-blue-600/70 border-blue-200/50 hover:bg-blue-100 hover:text-blue-700 transition-colors"
            onClick={() => onPreviewInvoice?.(row.id)}
          >
            TEMP_PREVIEW
          </Badge>
        ) : null}
      </div>

      {/* Actions (visible on hover) */}
      <div className="shrink-0 border-b border-border flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className={cn(
            "p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors",
            row.invoiceNumber
              ? "text-blue-600 hover:text-blue-700 bg-blue-50"
              : "hover:bg-accent",
          )}
          onClick={() =>
            row.invoiceNumber
              ? onPreviewRealInvoice?.(row.invoiceNumber)
              : onPreviewInvoice?.(row.id)
          }
          title="Vista Previa"
          aria-label="Vista Previa de Factura"
          data-testid={`btn-preview-${rowIdx}`}
        >
          <FileText className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
          onClick={() => onDelete?.(row.id)}
          title="Eliminar fila"
          aria-label="Eliminar fila"
          data-testid={`btn-delete-${rowIdx}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});
