import { cn } from "@/lib/utils";
import { BookOpen, Sparkles, CheckCircle2, User, Phone, Mail, FileText, Layers, ShieldCheck } from "lucide-react";
import type { CombinedResult } from "@/hooks/use-customer-search";
import { getRouteColor } from "@/lib/utils/route-colors";

export type ResultRowVariant = "regular" | "learning" | "suggested";

interface NovaCustomerResultRowProps {
  result: CombinedResult;
  variant?: ResultRowVariant;
  isActive?: boolean;
  onSelect: () => void;
}

export function NovaCustomerResultRow({
  result,
  variant = "regular",
  isActive = false,
  onSelect,
}: NovaCustomerResultRowProps) {
  const isLearning = variant === "learning";
  const isSuggested = variant === "suggested";
  const routeColor = result.ruta ? getRouteColor(result.ruta) : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`customer-result-row-${result.slCode}`}
      aria-label={[result.fullName, result.slCode, result.ruta]
        .filter(Boolean)
        .join(" — ")}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-4 py-3 transition-all text-left border-b border-border/50 last:border-b-0 group cursor-pointer select-none",
        isActive
          ? "bg-primary/10 ring-1 ring-primary/30"
          : isLearning
            ? "hover:bg-emerald-500/10 dark:hover:bg-emerald-950/30"
            : isSuggested
              ? "hover:bg-blue-500/10 dark:hover:bg-blue-950/30"
              : "hover:bg-accent/60",
      )}
    >
      {/* Left Column: SL Code & Customer Info */}
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {/* SL Code Badge */}
        <div className="flex flex-col items-center shrink-0 mt-0.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-foreground text-background border border-foreground/20 shadow-xs">
            {result.slCode}
          </span>
          {result.isTemp && (
            <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
              TEMPORAL
            </span>
          )}
        </div>

        {/* Name & Metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
              {result.fullName}
            </span>
            {result.ruta && (
              <span
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border",
                  routeColor?.bg,
                  routeColor?.text,
                  routeColor?.border,
                )}
              >
                {result.ruta}
              </span>
            )}
            {typeof result.consolidationEnabled === "boolean" && (
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 border",
                  result.consolidationEnabled
                    ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30"
                    : "bg-muted text-muted-foreground border-border/50",
                )}
              >
                <Layers className={cn("w-2.5 h-2.5", result.consolidationEnabled ? "text-cyan-500" : "text-muted-foreground")} />
                {result.consolidationEnabled ? "Consolidación" : "No consolidado"}
              </span>
            )}
          </div>

          {/* Contact Details / Secondary Row */}
          <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-muted-foreground">
            {result.dni && (
              <span className="flex items-center gap-1 font-mono">
                <FileText className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                {result.dni}
              </span>
            )}
            {result.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                {result.phone}
              </span>
            )}
            {result.email && (
              <span className="flex items-center gap-1 truncate max-w-[200px]">
                <Mail className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                {result.email}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Score / Origin Badge */}
      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
        {isLearning ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Aprobado {result.approvalCount ? `(${result.approvalCount})` : ""}</span>
          </span>
        ) : (
          <span
            aria-label={`${Math.round(result.score * 100)}% match`}
            className={cn(
              "text-[11px] font-bold px-2 py-0.5 rounded-lg border",
              result.score >= 0.85
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : result.score >= 0.70
                  ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
            )}
          >
            {Math.round(result.score * 100)}%
          </span>
        )}
      </div>
    </button>
  );
}
