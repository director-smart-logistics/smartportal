import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { useState, useMemo } from "react";
import type { ManifestRow } from "@/lib/services/manifest-processor";
import { calculatePrice } from "@/lib/utils/pricing";

export interface AjustePrecioLog {
  precioAjustado: number;
  precioCalculado: number;
  justificacion: string;
  ajustadoPor: string;
  ajustadoPorEmail: string;
  fechaAjuste: string;
}

export interface AjustePrecio {
  precioAjustado: number;
  precioCalculado: number;
  breakdownCalculo: string;
  justificacion: string;
  ajustadoPor: string;
  ajustadoPorEmail: string;
  fechaAjuste: string;
  tipo: "superior" | "inferior" | "igual";
  historial?: AjustePrecioLog[];
}

export function PriceAdjustmentModal({
  customerName,
  rowIndices,
  rows,
  computedPrices,
  priceOverrides,
  manifestCountry,
  manifestShipping,
  existingAdjustments,
  currentUser,
  onClose,
  onConfirm,
}: {
  customerName: string;
  rowIndices: number[];
  rows: ManifestRow[];
  computedPrices: number[];
  priceOverrides: Record<string, { precio: number; pesoRedondeo: number }>;
  manifestCountry: string;
  manifestShipping: string;
  existingAdjustments: Record<string, AjustePrecio>;
  currentUser: { fullName?: string | null; email?: string | null } | null;
  onClose: () => void;
  onConfirm: (adjustments: Record<string, AjustePrecio>) => void;
}) {
  const [localPrices, setLocalPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    rowIndices.forEach((idx) => {
      const row = rows[idx];
      if (!row) return;
      const tracking = row.tracking.toUpperCase();
      const existing = existingAdjustments[tracking];
      init[tracking] = String(
        existing?.precioAjustado ??
          priceOverrides[tracking]?.precio ??
          computedPrices[idx] ??
          0,
      );
    });
    return init;
  });
  const [justificacion, setJustificacion] = useState(() => {
    const firstIdx = rowIndices.find((idx) => {
      const row = rows[idx];
      return row && existingAdjustments[row.tracking.toUpperCase()]?.justificacion;
    });
    if (firstIdx !== undefined) {
      const row = rows[firstIdx];
      return existingAdjustments[row.tracking.toUpperCase()].justificacion;
    }
    return "";
  });

  const previewRows = useMemo(
    () =>
      rowIndices
        .map((idx) => {
          const row = rows[idx];
          if (!row) return null;
          const tracking = row.tracking.toUpperCase();
          const peso =
            priceOverrides[tracking]?.pesoRedondeo ?? row.pesoRedondeo ?? row.peso;
          const calcResult = calculatePrice(
            peso,
            manifestCountry as any,
            manifestShipping as any,
            "regular",
            row.permisos,
          );
          const formulaCalculada = calcResult.price;
          const precioActual =
            existingAdjustments[tracking]?.precioAjustado ??
            priceOverrides[tracking]?.precio ??
            row.precio ??
            calcResult.price;
          const precioAjustado =
            parseFloat(localPrices[tracking] ?? "") || precioActual;
          const delta = precioAjustado - precioActual;
          return {
            idx,
            row,
            peso,
            formulaCalculada,
            precioActual,
            precioAjustado,
            delta,
            breakdown: calcResult.breakdown,
          };
        })
        .filter(Boolean) as {
        idx: number;
        row: ManifestRow;
        peso: number;
        formulaCalculada: number;
        precioActual: number;
        precioAjustado: number;
        delta: number;
        breakdown: string;
      }[],
    [
      rowIndices,
      rows,
      priceOverrides,
      existingAdjustments,
      localPrices,
      manifestCountry,
      manifestShipping,
    ],
  );

  const totalDelta = previewRows.reduce((s, r) => s + r.delta, 0);
  const hasChange = previewRows.some(
    (r) => r.precioAjustado !== r.precioActual,
  );
  const canConfirm = justificacion.trim().length > 0;

  const handleConfirm = () => {
    const now = new Date().toISOString();
    const ajustadoPor =
      currentUser?.fullName ?? currentUser?.email ?? "Sistema";
    const ajustadoPorEmail = currentUser?.email ?? "";
    const result: Record<string, AjustePrecio> = {};
    previewRows.forEach(
      ({ row, precioAjustado, formulaCalculada, precioActual, breakdown }) => {
        const tracking = row.tracking.toUpperCase();
        
        // Append previous state to history logs
        const existing = existingAdjustments[tracking];
        const newHistorial = existing ? [...(existing.historial || [])] : [];
        if (existing && existing.precioAjustado !== precioAjustado) {
          const lastLog = newHistorial[newHistorial.length - 1];
          if (!lastLog || lastLog.precioAjustado !== existing.precioAjustado || lastLog.fechaAjuste !== existing.fechaAjuste) {
            newHistorial.push({
              precioAjustado: existing.precioAjustado,
              precioCalculado: existing.precioCalculado,
              justificacion: existing.justificacion,
              ajustadoPor: existing.ajustadoPor,
              ajustadoPorEmail: existing.ajustadoPorEmail,
              fechaAjuste: existing.fechaAjuste,
            });
          }
        }

        result[tracking] = {
          precioAjustado,
          precioCalculado: formulaCalculada,
          breakdownCalculo: breakdown,
          justificacion: justificacion.trim(),
          ajustadoPor,
          ajustadoPorEmail,
          fechaAjuste: now,
          tipo:
            precioAjustado > formulaCalculada
              ? "superior"
              : precioAjustado < formulaCalculada
                ? "inferior"
                : "igual",
          historial: newHistorial,
        };
      },
    );
    onConfirm(result);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-6xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              Ajuste de precio
            </p>
            <p className="text-xs text-muted-foreground">
              Cliente:{" "}
              <span className="font-medium text-foreground">
                {customerName}
              </span>{" "}
              · {rowIndices.length} paquete{rowIndices.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  #
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  Tracking
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                  Peso
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  Regla de cálculo
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                  Precio calculado
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                  Precio actual
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28 whitespace-nowrap">
                  Precio nuevo
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">
                  Diferencia
                </th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map(
                ({
                  idx,
                  row,
                  peso,
                  formulaCalculada,
                  precioActual,
                  precioAjustado,
                  delta,
                  breakdown,
                }) => {
                  const tracking = row.tracking.toUpperCase();
                  return (
                    <tr
                      key={idx}
                      className={cn(
                        "border-t border-border",
                        delta !== 0 ? "bg-primary/5" : "",
                      )}
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-foreground max-w-[200px]">
                        <div className="font-mono text-[10px] font-semibold">{row.tracking}</div>
                        {(() => {
                          const existing = existingAdjustments[tracking];
                          const logs = [...(existing?.historial || [])];
                          if (existing && !logs.some((l) => l.fechaAjuste === existing.fechaAjuste)) {
                            logs.push({
                              precioAjustado: existing.precioAjustado,
                              precioCalculado: existing.precioCalculado,
                              justificacion: existing.justificacion,
                              ajustadoPor: existing.ajustadoPor,
                              ajustadoPorEmail: existing.ajustadoPorEmail,
                              fechaAjuste: existing.fechaAjuste,
                            });
                          }
                          if (logs.length === 0) return null;
                          return (
                            <div className="mt-1 pl-1.5 border-l-2 border-purple-400 dark:border-purple-600 text-[9px] text-muted-foreground space-y-0.5 max-w-[180px]">
                              <span className="font-semibold text-purple-600 dark:text-purple-400">Historial:</span>
                              {logs.map((log, hIdx) => (
                                <div key={hIdx} className="leading-tight">
                                  <strong>${log.precioAjustado.toFixed(2)}</strong> por {(log.ajustadoPor || "Sistema").split(" ")[0]} ({log.justificacion})
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {peso} kg
                      </td>
                      <td
                        className="px-3 py-2 text-muted-foreground max-w-[160px] truncate"
                        title={breakdown}
                      >
                        {breakdown}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                        ${formulaCalculada.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground whitespace-nowrap">
                        ${precioActual.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={localPrices[tracking] ?? ""}
                          onChange={(e) =>
                            setLocalPrices((prev) => ({
                              ...prev,
                              [tracking]: e.target.value,
                            }))
                          }
                          className={cn(
                            "w-24 px-2 py-0.5 text-xs text-right rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums",
                            delta > 0
                              ? "border-amber-400 text-amber-700 dark:text-amber-400"
                              : delta < 0
                                ? "border-green-400 text-green-700 dark:text-green-400"
                                : "border-border text-foreground",
                          )}
                        />
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap",
                          delta > 0
                            ? "text-amber-600"
                            : delta < 0
                              ? "text-green-600"
                              : "text-muted-foreground",
                        )}
                      >
                        {delta === 0
                          ? "—"
                          : `${delta > 0 ? "+" : ""}$${delta.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>

        {/* Summary + Justification */}
        <div className="px-4 py-3 border-t border-border bg-card/50 shrink-0 space-y-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Total ajuste:</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                totalDelta > 0
                  ? "text-amber-600"
                  : totalDelta < 0
                    ? "text-green-600"
                    : "text-muted-foreground",
              )}
            >
              {totalDelta === 0
                ? "Sin variación"
                : `${totalDelta > 0 ? "+" : ""}$${totalDelta.toFixed(2)}`}
            </span>
            {currentUser && (
              <span className="ml-auto text-muted-foreground">
                Ajustado por:{" "}
                <span className="font-medium text-foreground">
                  {currentUser.fullName ?? currentUser.email}
                </span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <label className="text-xs font-medium text-foreground">
                Justificación del ajuste <span className="text-destructive">*</span>
              </label>
              <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                {["Precio mayorista", "Descuento por volumen", "Error de pesaje", "Acuerdo comercial"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setJustificacion(opt)}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground border border-border transition-colors cursor-pointer"
                  >
                    {opt}
                  </button>
                ))}
                <span className="text-[9px] text-muted-foreground font-normal ml-1">(Haz clic en alguna para autocompletado rápido)</span>
              </div>
            </div>
            <textarea
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Ej: Descuento por volumen, error de pesaje, acuerdo comercial…"
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className={cn(
                "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all",
                canConfirm
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {hasChange ? "Aplicar ajuste" : "Confirmar sin cambio"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
