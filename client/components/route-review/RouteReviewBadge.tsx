/**
 * "Revisar ruta" badge (2026-09-27): shown next to a customer's name (Nova rows, Clientes) while the customer's
 * route needs an admin. Live (route-attention.ts): it disappears by itself once the route is decided/confirmed.
 * Click → the decision dialog.
 */
import React from "react";
import { AlertTriangle, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouteAttention, openRouteReviewDialog } from "@/lib/route-review/route-attention";

export function RouteReviewBadge({ slCode, className, compact }: { slCode: string | null | undefined; className?: string; compact?: boolean }) {
  const a = useRouteAttention(slCode);
  if (!a) return null;
  const r = a.review;
  const pending = r?.status === "pending";
  const conflict = !!r?.encomiendaConflict && pending;
  const pk = a.packagesOnPreviousRoute?.count || 0;
  const label = pending ? (conflict ? "Revisar ruta · encomienda" : "Revisar ruta · cambió dirección")
    : r && r.status === "resolved" && r.decision !== "accepted_suggestion" && !r.sp1ConfirmedAt ? "Revisar ruta · confirmar"
      : pk ? `${pk} paquete${pk === 1 ? "" : "s"} en ruta anterior` : "Revisar ruta";
  const title = r?.summary || (pk ? `Hay ${pk} paquete(s) en proceso con la ruta anterior (${a.packagesOnPreviousRoute?.previousRuta || "—"}).` : "Revisar la ruta del cliente");
  return (
    <button
      type="button"
      data-testid="route-review-badge"
      title={title}
      onClick={(e) => { e.stopPropagation(); openRouteReviewDialog({ slCode: a.slCode }); }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border-2 px-1.5 py-0.5 font-extrabold uppercase tracking-wide shadow-sm",
        compact ? "text-[9px]" : "text-[10px]",
        conflict ? "border-red-600 bg-red-600 text-white animate-pulse" : "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
        className,
      )}
    >
      {conflict ? <AlertTriangle className="h-3 w-3" /> : <MapPinned className="h-3 w-3" />}
      {label}
    </button>
  );
}
