/**
 * NovaFrozenBanner — informational pill shown above the table toolbar when
 * the manifest was loaded from Firestore (operator-curated, frozen state).
 *
 * Tells the operator that:
 *   1. Auto-validators (divergent rematcher, pre-alert auto-assign,
 *      learned-route applier) are OFF — saved assignments will not be
 *      silently rewritten by the table.
 *   2. The visible badges they normally use to drive review (X diferentes,
 *      "Divergentes" filter) are intentionally hidden — those signals
 *      relate to fresh AI-driven matches, not curated state.
 *   3. To re-run matching they have an explicit, confirmation-gated
 *      "Re-validar todo" button at their disposal (rendered by the
 *      toolbar — this banner is informational only).
 *
 * Visibility is gated by `DataOriginPolicy.showFrozenBanner` — this
 * component renders nothing for fresh-parse data so it can be unconditionally
 * mounted.
 */

import { useState } from "react";
import { Lock, X } from "lucide-react";
import type { DataOriginPolicy } from "@/lib/nova/data-origin";
import { cn } from "@/lib/utils";

export interface NovaFrozenBannerProps {
  policy: DataOriginPolicy;
  /** Optional class for the wrapper — used to integrate with parent toolbar layout. */
  className?: string;
}

export function NovaFrozenBanner({ policy, className }: NovaFrozenBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (!policy.showFrozenBanner || dismissed) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="nova-frozen-banner"
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md",
        "bg-emerald-50 dark:bg-emerald-950/30",
        "border border-emerald-300 dark:border-emerald-700",
        "text-[11px] text-emerald-700 dark:text-emerald-300",
        className,
      )}
    >
      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="leading-tight flex-1">
        <strong>Datos guardados</strong> — sin auto-validación. Los cambios
        requieren acción explícita vía el menú <em>Acciones</em> o el botón
        <em> Re-validar todo</em>.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso"
        data-testid="nova-frozen-banner-close"
        className={cn(
          "shrink-0 p-0.5 rounded-sm transition-colors",
          "hover:bg-emerald-200/60 dark:hover:bg-emerald-800/40",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500",
        )}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
