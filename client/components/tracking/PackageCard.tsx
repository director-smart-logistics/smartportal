import { memo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Hash,
  Info,
  MapPin,
  Pencil,
  Sparkles,
  User,
  Weight,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { TrackingSearchResult } from "@/lib/hooks/queries/useTrackingSearch";
import { CarrierBadge } from "./CarrierBadge";
import { getStatusColor, getStatusIcon } from "./status-helpers";
import type { DiscSet } from "./types";
import { discClass } from "./types";

const DT_CLASS =
  "text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-0.5";

interface PackageCardProps {
  pkg: TrackingSearchResult;
  editingSlId: string | null;
  tempSl: string;
  onEditSl: (id: string, current: string) => void;
  onSaveSl: (id: string) => void;
  onCancelSl: () => void;
  onSlChange: (v: string) => void;
  onCopy: (text: string) => void;
  discrepancies?: DiscSet;
}

export const PackageCard = memo(function PackageCard({
  pkg,
  editingSlId,
  tempSl,
  onEditSl,
  onSaveSl,
  onCancelSl,
  onSlChange,
  onCopy,
  discrepancies,
}: PackageCardProps) {
  const { t } = useLocale("tracking");
  const disc = discrepancies ?? new Set<string>();
  const anyDisc = disc.size > 0;
  const isNova = pkg.source === "manifest";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl bg-white transition-all overflow-hidden border shadow-sm",
        anyDisc
          ? "border-red-200 hover:border-red-300 hover:shadow-sm"
          : "border-gray-100 hover:border-gray-200 hover:shadow-sm",
      )}
      aria-label={`Paquete: ${pkg.trackingNumber}${pkg.customerName ? `, ${pkg.customerName}` : ""}`}
    >
      {/* ── Badge strip ── */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border",
              isNova
                ? "bg-sky-50 text-sky-700 border-sky-200"
                : "bg-gray-50 text-gray-500 border-gray-200",
            )}
          >
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
            {isNova ? t("sourceNova") : t("sourcePaquete")}
          </span>
          <Badge
            className={cn(
              "text-xs px-2 py-0.5 border flex items-center gap-1 shrink-0",
              getStatusColor(pkg.status),
            )}
          >
            {getStatusIcon(pkg.status)}
            {pkg.status}
          </Badge>
        </div>
        {anyDisc && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-red-600 font-semibold"
            role="alert"
            aria-live="polite"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {t(`discrepancy_${disc.size === 1 ? "one" : "other"}`, {
              count: disc.size,
            })}
          </span>
        )}
      </div>

      {/* ── Main dl grid — mirrors MLCargo layout ── */}
      <dl className="px-5 pt-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
        {/* Tracking */}
        <div className="col-span-2">
          <dt className={DT_CLASS}>
            <Hash className="h-3 w-3" aria-hidden="true" />
            {t("fieldTracking")}
          </dt>
          <dd className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-gray-900 text-sm break-all">
              {pkg.trackingNumber}
            </span>
            <CarrierBadge tracking={pkg.trackingNumber} />
            <button
              type="button"
              onClick={() => onCopy(pkg.trackingNumber)}
              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              aria-label={t("copyTracking")}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
            </button>
          </dd>
        </div>

        {/* Cliente */}
        {pkg.customerName && (
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
              {pkg.customerName}
              {disc.has("customerName") && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {/* Código SL | Registrado */}
        <div>
          <dt className={DT_CLASS}>
            <Hash className="h-3 w-3" aria-hidden="true" />
            {t("fieldSlCode")}
          </dt>
          <dd>
            {editingSlId === pkg.id ? (
              <div className="flex items-center gap-1">
                <Input
                  value={tempSl}
                  onChange={(e) => onSlChange(e.target.value)}
                  className="h-6 w-20 text-xs font-mono"
                  autoFocus
                  aria-label={t("fieldSlCode")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveSl(pkg.id);
                    if (e.key === "Escape") onCancelSl();
                  }}
                />
                <button
                  type="button"
                  onClick={() => onSaveSl(pkg.id)}
                  className="p-1 rounded bg-gray-900 text-white hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600"
                  aria-label={t("saveSlCode")}
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onCancelSl}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                  aria-label={t("cancelEdit")}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group/sl">
                {pkg.slCode ? (
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-900 font-semibold">
                    {pkg.slCode}
                  </span>
                ) : (
                  <span className="text-gray-300" aria-label="Sin código SL">
                    —
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onEditSl(pkg.id, pkg.slCode ?? "")}
                  className="opacity-0 group-hover/sl:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                  aria-label={t("editSlAccount")}
                >
                  <Pencil
                    className="h-3 w-3 text-gray-400"
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}
          </dd>
        </div>

        <div>
          <dt className={DT_CLASS}>{t("fieldRegistered")}</dt>
          <dd className="text-gray-800 font-medium">
            {new Date(pkg.createdAt).toLocaleDateString("es-CR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </dd>
        </div>

        {/* Peso | Ruta */}
        {pkg.weight > 0 && (
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
              {pkg.weight} kg
              {disc.has("weight") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {(pkg.origin ?? pkg.destination ?? pkg.ruta) && (
          <div>
            <dt className={DT_CLASS}>
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t("fieldRoute")}
            </dt>
            <dd className="text-gray-800 font-medium flex items-center gap-1 flex-wrap">
              {pkg.origin && <span>{pkg.origin}</span>}
              {pkg.origin && pkg.destination && (
                <span className="text-gray-400" aria-hidden="true">
                  →
                </span>
              )}
              {pkg.destination && <span>{pkg.destination}</span>}
              {pkg.ruta && (
                <>
                  <span className="text-gray-400" aria-hidden="true">
                    →
                  </span>
                  <span>{pkg.ruta}</span>
                </>
              )}
            </dd>
          </div>
        )}

        {/* Manifiesto */}
        {pkg.manifestNumber && (
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
              {pkg.manifestNumber}
              {disc.has("manifestId") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {/* Descripción */}
        {pkg.description && (
          <div className="col-span-2">
            <dt className={DT_CLASS}>
              <Info className="h-3 w-3" aria-hidden="true" />
              {t("fieldDescription")}
            </dt>
            <dd className={cn(discClass(disc.has("description")))}>
              {pkg.description}
              {disc.has("description") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}
      </dl>

      {/* ── Price box ── */}
      {(pkg.calculatedCost ?? pkg.costCRC) && (
        <div className="mx-5 mb-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">
            Precio estimado
          </p>
          <div className="flex items-baseline gap-2 flex-wrap">
            {pkg.calculatedCost && (
              <span className="text-base font-bold text-emerald-900">
                ${Number(pkg.calculatedCost).toFixed(2)}
                <span className="text-xs font-semibold text-emerald-700 ml-1">
                  USD
                </span>
              </span>
            )}
            {pkg.costCRC && (
              <span className="text-sm font-semibold text-emerald-700">
                ₡{Number(pkg.costCRC).toLocaleString("es-CR")}
                <span className="text-xs font-normal text-emerald-600 ml-1">
                  CRC
                </span>
              </span>
            )}
          </div>
          {pkg.exchangeRate && (
            <p className="text-[10px] text-emerald-600 mt-0.5">
              TC: ₡{Number(pkg.exchangeRate).toLocaleString("es-CR")}
            </p>
          )}
        </div>
      )}
    </motion.article>
  );
});

PackageCard.displayName = "PackageCard";
