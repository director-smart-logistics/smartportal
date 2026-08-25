import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSpreadsheet,
  User,
  Check,
  Loader2,
  ChevronDown,
  Receipt,
  ShieldCheck,
  Package,
  Scale,
} from "lucide-react";
import { useState, useMemo, memo } from "react";
import type {
  NovaMessage as NovaMessageType,
  ProcessingStep,
} from "@/hooks/use-nova-chat";
import { calculatePrice } from "@/lib/utils/pricing";
import { ResultSummary } from "./NovaTableModal";
export { ResultSummary } from "./NovaTableModal";

interface NovaMessageProps {
  message: NovaMessageType;
  onDownload?: () => void;
  onDownloadXLSX?: () => void;
  onSelectCustomerMatch?: (
    rowIndex: number,
    slCode: string,
    ruta: string,
    consolidacion: boolean,
    fullName?: string,
  ) => void;
  isLatest?: boolean;
  initialExchangeRate?: string;
  onShowRecentManifests?: () => void;
}

function ProcessingStepsThinking({
  steps,
  resultData,
}: {
  steps: ProcessingStep[];
  resultData?: NovaMessageType["resultData"];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const currentStep = useMemo(
    () => steps.find((s) => s.status === "processing"),
    [steps],
  );

  const completedSteps = useMemo(
    () => steps.filter((s) => s.status === "completed"),
    [steps],
  );

  const allCompleted = useMemo(
    () => steps.every((s) => s.status === "completed"),
    [steps],
  );

  return (
    <div className="space-y-2">
      {/* Current Thinking Step - Only show while processing */}
      <AnimatePresence mode="wait">
        {currentStep && !allCompleted && (
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border">
              <div className="relative flex-shrink-0">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {currentStep.step}
                </p>
              </div>

              <span className="text-xs text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full">
                {completedSteps.length + 1}/{steps.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completed State - Collapsible Panel with Stats */}
      {allCompleted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-xl bg-gradient-to-r from-green-500/5 to-green-500/10 border border-green-500/20 overflow-hidden"
        >
          {/* Header - Clickable to expand */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center gap-3 p-3 hover:bg-green-500/5 transition-colors"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0"
            >
              <Check className="h-3 w-3 text-green-600" />
            </motion.div>

            {/* Compact summary in header */}
            <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-left">
              <span className="text-sm font-medium text-green-600">
                Completado
              </span>
              {resultData && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {resultData.summary.totalRows} filas
                  </span>
                  <span className="text-xs font-medium text-green-600">
                    ${resultData.summary.totalPrice.toFixed(2)}
                  </span>
                  {resultData.manifestNumber && (
                    <span className="text-xs text-muted-foreground">
                      {resultData.manifestNumber}
                    </span>
                  )}
                </>
              )}
            </div>

            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          </button>

          {/* Expandable Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 pt-2 border-t border-green-500/10 space-y-3">
                  {/* Stats inside collapse */}
                  {resultData && (
                    <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                      <div className="px-2 py-1 rounded bg-background/50 text-center">
                        <div className="text-muted-foreground">Filas</div>
                        <div className="font-medium">
                          {resultData.summary.totalRows}
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded bg-background/50 text-center">
                        <div className="text-muted-foreground">Clientes</div>
                        <div className="font-medium">
                          {resultData.summary.customersMatched || 0}
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded bg-background/50 text-center">
                        <div className="text-muted-foreground">
                          Correcciones
                        </div>
                        <div className="font-medium">
                          {resultData.summary.namesCorrections || 0}
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded bg-background/50 text-center">
                        <div className="text-muted-foreground">Total</div>
                        <div className="font-medium text-green-600">
                          ${resultData.summary.totalPrice.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Steps list */}
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {completedSteps.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-2 py-0.5 text-[11px]"
                      >
                        <Check className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                        <span className="text-muted-foreground truncate">
                          {step.step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

const WeightPriceBreakdown = memo(function WeightPriceBreakdown({
  resultData,
}: {
  resultData: NonNullable<NovaMessageType["resultData"]>;
}) {
  const rows = resultData.rows;
  if (!rows || rows.length === 0) return null;

  const hasPermit = useMemo(() => rows.some((r) => r.permisos), [rows]);
  const hasConsol = useMemo(() => rows.some((r) => r.consolidacion), [rows]);

  const [mCountry, mShipping] = useMemo(() => {
    const parts = ((resultData.manifestType as string) ?? "usa_air").split("_");
    return [parts[0] ?? "usa", parts[1] ?? "air"] as const;
  }, [resultData.manifestType]);

  const totalFinal = useMemo(
    () =>
      rows.reduce((s, r) => {
        const result = calculatePrice(
          r.peso,
          mCountry as any,
          mShipping as any,
          "regular",
          r.permisos,
        );
        return (
          s + (result.quoteRequired ? 0 : Math.round(result.price * 100) / 100)
        );
      }, 0),
    [rows, mCountry, mShipping],
  );

  const permitRows = useMemo(() => rows.filter((r) => r.permisos), [rows]);
  const rowsConPermiso = permitRows.length;

  const gananciaPermiso = rowsConPermiso * 3;

  const gananciaRedondeoPermiso = useMemo(
    () =>
      permitRows.reduce((sum, r) => {
        const orig = r.peso ?? 0;
        const diff = Math.ceil(orig) - orig;
        return sum + Math.round(diff * 12 * 100) / 100;
      }, 0),
    [permitRows],
  );

  const totalRedondKg = useMemo(
    () => rows.reduce((s, r) => s + (r.diferenciaRedondeo ?? 0), 0),
    [rows],
  );
  const rowsWithRound = useMemo(
    () => rows.filter((r) => (r.diferenciaRedondeo ?? 0) > 0).length,
    [rows],
  );

  const pesoOriginalTotal = useMemo(
    () => rows.reduce((s, r) => s + (r.peso ?? 0), 0),
    [rows],
  );
  const pesoCobradoTotal = useMemo(
    () => rows.reduce((s, r) => s + (r.pesoRedondeo ?? r.peso ?? 0), 0),
    [rows],
  );

  const consolRows = useMemo(
    () => rows.filter((r) => r.consolidacion && !r.permisos),
    [rows],
  );
  const rowsConConsol = consolRows.length;
  const consolPesoTotal = useMemo(
    () => consolRows.reduce((s, r) => s + (r.pesoRedondeo ?? r.peso ?? 0), 0),
    [consolRows],
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-b border-border">
        <Receipt className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">
          Detalle de Precios y Pesos
        </span>
      </div>
      <div className="p-3 space-y-3">
        {/* ── Price final summary ── */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="px-2.5 py-2 rounded-lg bg-background border border-border text-center">
            <div className="text-muted-foreground mb-0.5">Peso original</div>
            <div className="font-semibold text-foreground font-mono">
              {pesoOriginalTotal.toFixed(3)} kg
            </div>
          </div>
          <div className="px-2.5 py-2 rounded-lg bg-primary/5 border border-primary/20 text-center">
            <div className="text-muted-foreground mb-0.5">Total cobrado</div>
            <div className="font-semibold text-primary">
              ${totalFinal.toFixed(2)}
            </div>
          </div>
        </div>

        {/* ── Permisos breakdown ── */}
        {hasPermit && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-amber-500/15">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                Permisos — {rowsConPermiso} fila
                {rowsConPermiso !== 1 ? "s" : ""}
              </span>
              <span className="ml-auto text-[10px] text-amber-500/70 font-medium">
                sin consolidación
              </span>
            </div>
            <div className="px-2.5 py-2 space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Recargo $3 × {rowsConPermiso}
                </span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  +${gananciaPermiso.toFixed(2)}
                </span>
              </div>
              {gananciaRedondeoPermiso > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Redondeo kg × $12
                  </span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    +${gananciaRedondeoPermiso.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-amber-500/15 pt-1 mt-1">
                <span className="font-medium text-foreground">
                  Extra por permisos
                </span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  +${(gananciaPermiso + gananciaRedondeoPermiso).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Redondeo de peso (non-permit rows) ── */}
        {rowsWithRound > 0 && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <Scale className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] space-y-0.5 flex-1 min-w-0">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                {rowsWithRound} fila{rowsWithRound !== 1 ? "s" : ""} con
                redondeo de peso
              </p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {pesoOriginalTotal.toFixed(3)} kg →{" "}
                  {pesoCobradoTotal.toFixed(3)} kg cobrado
                </span>
                <span className="font-medium text-blue-600 dark:text-blue-400 tabular-nums">
                  +{totalRedondKg.toFixed(3)} kg
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Consolidación ── */}
        {hasConsol && (
          <div
            className={cn(
              "rounded-lg border overflow-hidden",
              hasPermit
                ? "border-muted bg-muted/30"
                : "border-blue-500/25 bg-blue-500/5",
            )}
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/50">
              <Package className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Consolidación — {rowsConConsol} fila
                {rowsConConsol !== 1 ? "s" : ""}
              </span>
              {hasPermit && (
                <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                  excluye permisos
                </span>
              )}
            </div>
            <div className="px-2.5 py-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Peso en consolidación
                </span>
                <span className="font-semibold text-foreground font-mono">
                  {consolPesoTotal.toFixed(3)} kg
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export const NovaMessage = memo(function NovaMessage({
  message,
  onDownload,
  onDownloadXLSX,
  onSelectCustomerMatch,
  isLatest,
  initialExchangeRate,
  onShowRecentManifests,
}: NovaMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const hasResult = isAssistant && !!message.resultData;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 w-full"
    >
      {/* ── Bubble row (avatar + text/files/processing) ── */}
      <div className={cn("flex gap-3", isUser && "justify-end")}>
        {/* Avatar for Assistant */}
        {isAssistant && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <img
              src="/logo.svg"
              alt="Nova"
              className="h-5 w-5 object-contain"
            />
          </div>
        )}

        {/* Narrow bubble — text + files only */}
        <div
          className={cn("max-w-[85%] md:max-w-[75%]", isUser && "order-first")}
        >
          {/* Show bubble when: no result data  OR  has result but no processing steps (e.g. MegaMan Firestore reload — content is the only context) */}
          {(!hasResult ||
            (hasResult &&
              message.content &&
              (!message.processingSteps ||
                message.processingSteps.length === 0))) && (
            <div
              className={cn(
                "rounded-2xl px-4 py-3",
                isUser && "bg-primary text-primary-foreground",
                isAssistant && "bg-card border border-border",
                isAssistant &&
                  message.processingSteps &&
                  message.processingSteps.length > 0 &&
                  "hidden",
              )}
            >
              <p
                className={cn(
                  "text-sm",
                  isUser && "text-primary-foreground",
                  isAssistant && "text-foreground",
                )}
              >
                {message.content}
              </p>

              {/* Files (for user messages) */}
              {message.files && message.files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.files.map((file) => (
                    <div
                      key={file.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg",
                        isUser ? "bg-primary-foreground/10" : "bg-muted",
                      )}
                    >
                      <FileSpreadsheet
                        className={cn(
                          "h-4 w-4",
                          isUser ? "text-primary-foreground" : "text-primary",
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs truncate",
                          isUser
                            ? "text-primary-foreground"
                            : "text-foreground",
                        )}
                      >
                        {file.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Processing Steps */}
          {isAssistant &&
            message.processingSteps &&
            message.processingSteps.length > 0 && (
              <ProcessingStepsThinking
                steps={message.processingSteps}
                resultData={message.resultData}
              />
            )}
        </div>

        {/* Avatar for User */}
        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </div>

      {/* ── Full-width result card (outside bubble constraint) ── */}
      {hasResult && (
        <ResultSummary
          resultData={message.resultData!}
          onDownload={onDownload}
          onDownloadXLSX={onDownloadXLSX}
          onSelectMatch={onSelectCustomerMatch}
          initialExchangeRate={initialExchangeRate}
          onShowRecentManifests={onShowRecentManifests}
        />
      )}

      {/* Timestamp */}
      <p
        className={cn(
          "text-xs",
          isUser ? "text-right text-muted-foreground" : "text-muted-foreground",
        )}
      >
        {new Date(message.timestamp).toLocaleTimeString("es", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </motion.div>
  );
});
