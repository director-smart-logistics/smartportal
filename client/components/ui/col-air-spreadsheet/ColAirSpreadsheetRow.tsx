import React, { memo } from "react";
import { FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { CustomerAutocomplete } from "@/components/customer/CustomerAutocomplete";
import { SpreadsheetCell } from "./ColAirSpreadsheetCell";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getRouteColors, shortenRouteName } from "./utils";
import { CalculatedColAirManifestRow } from "./useColAirCalculations";
import { gridTemplateCols } from "./ColAirSpreadsheetGrid";

interface ColAirSpreadsheetRowProps {
  row: CalculatedColAirManifestRow;
  rowIdx: number;
  rowCount: number;
  colCount: number;
  onChange: (
    id: string,
    field: keyof CalculatedColAirManifestRow,
    value: any,
  ) => void;
  onRowUpdate: (
    id: string,
    updates: Partial<CalculatedColAirManifestRow>,
  ) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>,
    rowIdx: number,
    field: string,
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

export const ColAirSpreadsheetRow = memo(function ColAirSpreadsheetRow({
  row,
  rowIdx,
  rowCount,
  colCount,
  onChange,
  onRowUpdate,
  onKeyDown,
  onPaste,
  onDelete,
  onPreviewInvoice,
  onPreviewRealInvoice,
  isSelected,
  onToggleSelect,
}: ColAirSpreadsheetRowProps) {
  const { t } = useTranslation("manifests");

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
        onKeyDown={(e) => onKeyDown(e as any, rowIdx, "slCode")}
      >
        <CustomerAutocomplete
          id={`input-${rowIdx}-slCode`}
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
        id={`input-${rowIdx}-warehouseId`}
        value={row.warehouseId}
        onChange={(v) => onChange(row.id, "warehouseId", v)}
        onKeyDown={(e) => onKeyDown(e as any, rowIdx, "warehouseId")}
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

      {/* Ruta (Read Only) */}
      <div
        className="border-r border-b border-border px-3 py-2 text-sm text-muted-foreground font-medium bg-muted/30 flex items-center w-full min-w-0 overflow-hidden"
        data-testid={`cell-${rowIdx}-ruta`}
      >
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
        ) : null}
      </div>

      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={2}
        id={`input-${rowIdx}-peso`}
        value={row.peso}
        onChange={(v) => onChange(row.id, "peso", v)}
        onKeyDown={(e) => onKeyDown(e as any, rowIdx, "peso")}
        onPaste={(e) => onPaste(e, rowIdx, 2)}
        placeholder="0.0"
        className="w-full min-w-0"
      />

      {/* Permisos */}
      <div className="border-r border-b border-border flex items-center justify-center w-full min-w-0 bg-background hover:bg-accent/10 transition-colors">
        <Checkbox
          id={`input-${rowIdx}-permisos`}
          data-testid={`cell-${rowIdx}-3`}
          aria-label="Requiere permisos"
          checked={row.permisos}
          onCheckedChange={(checked) => onChange(row.id, "permisos", !!checked)}
          onKeyDown={(e) => {
            // Si el usuario presiona Enter, alternamos el valor manualmente además de saltar
            if (e.key === "Enter") {
              e.preventDefault(); // prevenir doble toggle si radix lo hace
              onChange(row.id, "permisos", !row.permisos);
              // Llama al manejador global para saltar a la siguiente celda
              onKeyDown(e as any, rowIdx, "permisos");
            } else if (e.key === " ") {
              // Space maneja el toggle nativo, pero evitamos que la página haga scroll
              e.preventDefault();
              onChange(row.id, "permisos", !row.permisos);
            } else {
              onKeyDown(e as any, rowIdx, "permisos");
            }
          }}
        />
      </div>

      {/* Price Override Column */}
      <SpreadsheetCell
        rowIdx={rowIdx}
        colIdx={4}
        id={`input-${rowIdx}-priceOverride`}
        value={row.priceOverride || ""}
        onChange={(v) => onChange(row.id, "priceOverride", v)}
        onKeyDown={(e) => onKeyDown(e as any, rowIdx, "priceOverride")}
        onPaste={(e) => onPaste(e, rowIdx, 4)}
        placeholder={row.price > 0 ? row.price.toFixed(2) : "0.00"}
        className="w-full min-w-0 font-semibold text-[hsl(var(--manifest-brand))]"
        testId={`cell-${rowIdx}-price`}
        type="number"
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

            const BadgeEl = (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-medium whitespace-nowrap cursor-pointer",
                  badgeColors,
                )}
              >
                {row.invoiceNumber}
              </Badge>
            );

            if (isVoid) {
              return BadgeEl;
            }

            return (
              <div
                onClick={() => onPreviewRealInvoice?.(row.invoiceNumber!)}
                className="hover:opacity-80 cursor-pointer"
              >
                {BadgeEl}
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
      <div className="shrink-0 border-b border-border flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background">
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
