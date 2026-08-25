import { memo } from "react";
import {
  AlertTriangle,
  Clock,
  FileText,
  Globe,
  Hash,
  Info,
  Truck,
} from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import type { ColombiaResult } from "@/lib/hooks/queries/useTrackingSearch";
import { getStatusColor, getStatusIcon } from "./status-helpers";

const DT_CLASS =
  "text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-0.5";

const SKELETON_WIDTHS = [24, 20, 28, 16];

interface ColombiaPanelProps {
  result: ColombiaResult | null | undefined;
  isLoading: boolean;
}

export const ColombiaPanel = memo(function ColombiaPanel({
  result,
  isLoading,
}: ColombiaPanelProps) {
  const { t } = useLocale("tracking");

  if (isLoading) {
    return (
      <div
        className="p-5 overflow-hidden relative bg-white"
        aria-busy="true"
        aria-label="Cargando datos Colombia"
      >
        <div
          className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent"
          aria-hidden="true"
        />
        <div className="mb-4">
          <div className="h-2.5 w-14 bg-gray-100 rounded mb-2" />
          <div className="h-5 w-40 bg-gray-200 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {SKELETON_WIDTHS.map((w, i) => (
            <div key={i}>
              <div className="h-2.5 w-12 bg-gray-100 rounded mb-2" />
              <div className={`h-3.5 w-${w} bg-gray-200 rounded`} />
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-4">
          <div className="h-2.5 w-16 bg-gray-100 rounded mb-3" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3 mb-3">
              <div className="h-2.5 w-2.5 rounded-full bg-gray-200 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 px-6">
        <Globe className="h-10 w-10 text-gray-300" aria-hidden="true" />
        <p className="text-xs font-semibold text-gray-500 text-center">
          {t("enterColombia")}
        </p>
      </div>
    );
  }

  if (result.error && !result.found) {
    return (
      <div
        className="flex items-start gap-2 m-4 p-3 text-amber-700 text-xs bg-amber-50 rounded-lg border border-amber-200"
        role="alert"
      >
        <AlertTriangle
          className="h-4 w-4 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <span>{result.error}</span>
      </div>
    );
  }

  if (!result.found) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 px-6">
        <Info className="h-8 w-8 text-gray-400" aria-hidden="true" />
        <p className="text-xs font-semibold text-gray-600 text-center">
          {t("noResultsColombia")}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      <dl className="px-5 pt-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
        {/* Guía */}
        <div className="col-span-2">
          <dt className={DT_CLASS}>
            <Hash className="h-3 w-3" aria-hidden="true" />
            {t("fieldGuide")}
          </dt>
          <dd className="font-mono font-bold text-gray-900 text-sm break-all leading-snug">
            {result.trackingNumber?.toUpperCase()}
          </dd>
        </div>

        {/* Estado */}
        {result.statusMessage && (
          <div className="col-span-2">
            <dt className={DT_CLASS}>
              <Truck className="h-3 w-3" aria-hidden="true" />
              {t("fieldStatus")}
            </dt>
            <dd>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
                  getStatusColor(result.statusCode ?? ""),
                )}
              >
                {getStatusIcon(result.statusCode ?? "")}
                {result.statusMessage}
              </span>
            </dd>
          </div>
        )}

        {/* Consolidado | Última actualización */}
        {result.manifestId && (
          <div>
            <dt className={DT_CLASS}>
              <FileText className="h-3 w-3" aria-hidden="true" />
              {t("fieldConsolidated")}
            </dt>
            <dd className="font-mono text-gray-800">{result.manifestId}</dd>
          </div>
        )}

        {result.lastUpdate && (
          <div>
            <dt className={DT_CLASS}>
              <Clock className="h-3 w-3" aria-hidden="true" />
              {t("fieldLastUpdate")}
            </dt>
            <dd className="text-gray-700">
              <time dateTime={result.lastUpdate}>
                {new Date(result.lastUpdate).toLocaleDateString("es-CR")}
              </time>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
});

ColombiaPanel.displayName = "ColombiaPanel";
