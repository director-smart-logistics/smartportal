/**
 * NovaAutoSaveIndicator — compact status pill for the Nova table toolbar.
 *
 * Shows the operator at a glance whether their edits have been auto-saved.
 * Mirrors the convention used by Google Docs / Notion: a tiny, unobtrusive
 * badge that only escalates visually when there's an error or a save in
 * flight.
 *
 * States:
 *   - idle        — hidden (nothing to report)
 *   - dirty       — "Cambios sin guardar…" (amber)
 *   - saving      — "Guardando…" with spinner (slate)
 *   - saved       — "Guardado · hace 5s" (emerald, fades)
 *   - error       — "Error al guardar — reintentando" (red, persistent)
 *
 * The component is read-only and side-effect-free — it never triggers a
 * save by itself. The host component owns the auto-save lifecycle.
 */

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutoSaveStatus } from "@/hooks/use-nova-auto-save";

export interface NovaAutoSaveIndicatorProps {
  status: AutoSaveStatus;
  lastSavedAt: number | null;
  errorMessage?: string | null;
  className?: string;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "ahora";
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hours = Math.floor(min / 60);
  return `hace ${hours}h`;
}

export function NovaAutoSaveIndicator({
  status,
  lastSavedAt,
  errorMessage,
  className,
}: NovaAutoSaveIndicatorProps) {
  // Tick every 15s so "hace Xs" stays fresh while idle on the saved state.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved" || !lastSavedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [status, lastSavedAt]);

  if (status === "idle") return null;

  const base =
    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium leading-tight transition-colors";

  if (status === "saving") {
    return (
      <span
        role="status"
        aria-live="polite"
        data-testid="nova-autosave-saving"
        className={cn(
          base,
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Guardando…
      </span>
    );
  }

  if (status === "dirty") {
    return (
      <span
        role="status"
        aria-live="polite"
        data-testid="nova-autosave-dirty"
        className={cn(
          base,
          "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50",
          className,
        )}
      >
        <CloudOff className="h-3 w-3" aria-hidden="true" />
        Cambios sin guardar…
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        role="status"
        aria-live="assertive"
        data-testid="nova-autosave-error"
        title={errorMessage ?? undefined}
        className={cn(
          base,
          "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50",
          className,
        )}
      >
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Error al guardar
      </span>
    );
  }

  // status === 'saved'
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="nova-autosave-saved"
      className={cn(
        base,
        "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50",
        className,
      )}
    >
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      <span className="hidden sm:inline">Guardado</span>
      {lastSavedAt && (
        <span className="text-[10px] opacity-80 hidden md:inline">
          · {formatRelative(lastSavedAt)}
        </span>
      )}
      <Cloud className="h-3 w-3 sm:hidden" aria-hidden="true" />
    </span>
  );
}
