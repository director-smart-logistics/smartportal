import { memo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Globe,
  Hash,
  Info,
  Plane,
  Shield,
  User,
  UserCheck,
  Weight,
} from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/context/FirebaseAuthContext";
import type { MLCargoResult } from "@/lib/hooks/queries/useTrackingSearch";
import { CustomerMatchPanel } from "./CustomerMatchPanel";
import { PriceTag } from "./PriceTag";
import { discClass } from "./types";
import type { DiscSet } from "./types";

const DT_CLASS =
  "text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-0.5";

const SKELETON_WIDTHS = [24, 20, 28, 16];

interface MLCargoPanelProps {
  result: MLCargoResult | null | undefined;
  isLoading: boolean;
  discrepancies?: DiscSet;
  systemSlCode?: string;
}

export const MLCargoPanel = memo(function MLCargoPanel({
  result,
  isLoading,
  discrepancies,
  systemSlCode,
}: MLCargoPanelProps) {
  const { t } = useLocale("tracking");
  const { user } = useAuth();
  const userRole = user?.role;
  const disc = discrepancies ?? new Set<string>();

  if (isLoading) {
    return (
      <div
        className="p-5 overflow-hidden relative bg-white"
        aria-busy="true"
        aria-label="Cargando datos MLCargo"
      >
        <div
          className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent"
          aria-hidden="true"
        />
        <div className="mb-4">
          <div className="h-2.5 w-14 bg-gray-100 rounded mb-2" />
          <div className="h-5 w-48 bg-gray-200 rounded-md" />
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
          {t("enterTrackingMlcargo")}
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
          Sin resultados en MLCargo para este tracking
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {/* Alerts */}
      {(result.requiresPermit ?? result.missingDestination) && (
        <div className="px-5 pt-3 pb-2 flex flex-wrap gap-2">
          {result.requiresPermit && (
            <div
              className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5"
              role="alert"
            >
              <AlertTriangle
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="font-medium">Requiere Permiso</span>
            </div>
          )}
          {result.missingDestination && (
            <div
              className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"
              role="alert"
            >
              <AlertTriangle
                className="h-3.5 w-3.5 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="font-medium">Sin Destino</span>
            </div>
          )}
        </div>
      )}

      {/* Core fields */}
      <dl className="px-5 pt-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
        {/* Tracking */}
        <div className="col-span-2">
          <dt className={DT_CLASS}>
            <Hash className="h-3 w-3" aria-hidden="true" />
            {t("fieldTracking")}
          </dt>
          <dd className="font-mono font-bold text-gray-900 text-sm break-all leading-snug">
            {result.trackingNumber?.toUpperCase()}
          </dd>
        </div>

        {/* Cliente */}
        {result.customerName && (
          <div className="col-span-2">
            <dt className={DT_CLASS}>
              <User className="h-3 w-3" aria-hidden="true" />
              {t("fieldClient")}
            </dt>
            <dd
              className={cn(
                "font-bold text-sm",
                disc.has("customerName") ? "text-red-600" : "text-gray-900",
              )}
            >
              {result.customerName}
              {disc.has("customerName") && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {/* Código | Destino */}
        {result.customerCode && (
          <div>
            <dt className={DT_CLASS}>
              <Hash className="h-3 w-3" aria-hidden="true" />
              {t("fieldCode")}
            </dt>
            <dd className="font-mono font-semibold text-gray-800">
              {result.customerCode}
            </dd>
          </div>
        )}

        {/* Permit status — replaces destination slot */}
        <div>
          <dt className={DT_CLASS}>
            <Shield className="h-3 w-3" aria-hidden="true" />
            {t("fieldPermit")}
          </dt>
          <dd>
            {result.requiresPermit ? (
              <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t("requiresPermit")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {t("noPermit")}
              </span>
            )}
          </dd>
        </div>

        {/* Shipper | Peso */}
        {result.shipper && (
          <div>
            <dt className={DT_CLASS}>
              <Plane className="h-3 w-3" aria-hidden="true" />
              {t("fieldShipper")}
            </dt>
            <dd className="font-semibold text-gray-800">
              {result.shipperDescription ?? result.shipper}
            </dd>
          </div>
        )}
        {(result.weight ?? 0) > 0 && (
          <div>
            <dt className={DT_CLASS}>
              <Weight className="h-3 w-3" aria-hidden="true" />
              {t("fieldWeight")}
            </dt>
            <dd
              className={cn(
                "font-semibold flex items-center gap-1",
                discClass(disc.has("weight")),
              )}
            >
              {result.weight} kg
              {disc.has("weight") && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-red-400"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {/* Manifiesto | Precio Estimado */}
        {result.manifestId && (
          <div>
            <dt className={DT_CLASS}>
              <FileText className="h-3 w-3" aria-hidden="true" />
              {t("fieldManifest")}
            </dt>
            <dd
              className={cn(
                "font-mono font-semibold",
                discClass(disc.has("manifestId")),
              )}
            >
              {result.manifestId}
              {disc.has("manifestId") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {/* PriceTag — right column alongside manifest (or full-width if no manifest) */}
        {(result.weight ?? 0) > 0 && userRole !== "VIEWER" && (
          <div className={cn(!result.manifestId && "col-span-2")}>
            <PriceTag
              weightKg={result.weight!}
              requiresPermit={result.requiresPermit}
            />
          </div>
        )}

        {result.invoice && (
          <div>
            <dt className={DT_CLASS}>
              <FileText className="h-3 w-3" aria-hidden="true" />
              Factura
            </dt>
            <dd className="font-mono font-semibold text-gray-800">
              {result.invoice}
            </dd>
          </div>
        )}

        {/* Descripción */}
        {result.description && (
          <div className="col-span-2">
            <dt className={DT_CLASS}>
              <Info className="h-3 w-3" aria-hidden="true" />
              {t("fieldDescription")}
            </dt>
            <dd className={cn(discClass(disc.has("description")))}>
              {result.description}
              {disc.has("description") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {result.notes && (
          <div className="col-span-2">
            <dt className={DT_CLASS}>
              <Info className="h-3 w-3" aria-hidden="true" />
              Notas
            </dt>
            <dd className="text-gray-700 italic">{result.notes}</dd>
          </div>
        )}
      </dl>

      {/* Customer match — hidden for VIEWER */}
      {(result.customerCode ?? result.customerName) &&
        userRole !== "VIEWER" && (
          <div className="px-5 pt-4 pb-4">
            <p className="text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <UserCheck className="h-3 w-3" aria-hidden="true" />
              {t("coincidenceInSystem")}
            </p>
            <CustomerMatchPanel
              customerCode={result.customerCode}
              customerName={result.customerName}
              systemSlCode={systemSlCode}
            />
          </div>
        )}
    </div>
  );
});

MLCargoPanel.displayName = "MLCargoPanel";
