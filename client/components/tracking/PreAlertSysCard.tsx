import { memo } from "react";
import {
  AlertTriangle,
  BellRing,
  CreditCard,
  FileText,
  Hash,
  Info,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  User,
  Weight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import type { PreAlertDoc } from "./types";
import { discClass, formatPreAlertTs } from "./types";
import type { DiscSet } from "./types";

// ── Label style shared across all tracking cards ──────────────────────────────
const DT_CLASS =
  "text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-0.5";

interface PreAlertSysCardProps {
  pa: PreAlertDoc;
  discrepancies?: DiscSet;
}

export const PreAlertSysCard = memo(function PreAlertSysCard({
  pa,
  discrepancies,
}: PreAlertSysCardProps) {
  const { t } = useLocale("tracking");
  const name =
    pa.displayName ?? `${pa.firstName ?? ""} ${pa.lastName ?? ""}`.trim();
  const disc = discrepancies ?? new Set<string>();
  const anyDisc = disc.size > 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl bg-white transition-all overflow-hidden border shadow-sm",
        anyDisc
          ? "border-red-200 hover:border-red-300"
          : "border-violet-200 hover:border-violet-300 hover:shadow-sm",
      )}
      aria-label={`Pre-alerta: ${pa.tracking}${name ? `, ${name}` : ""}`}
    >
      {/* ── Main fields — mirrors MLCargo dl grid ── */}
      <dl className="px-5 pt-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-4 text-xs">
        {/* Tracking + badges inline */}
        <div className="col-span-2">
          <dt className={DT_CLASS}>
            <Hash className="h-3 w-3" aria-hidden="true" />
            {t("fieldTracking")}
          </dt>
          <dd className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="font-mono font-bold text-gray-900 text-sm break-all leading-snug">
              {pa.tracking}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-violet-50 text-violet-700 border-violet-200 shrink-0">
              <BellRing className="h-3 w-3" aria-hidden="true" />
              {t("preAlertSP2")}
            </span>
            {anyDisc && (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-red-600 font-semibold shrink-0"
                role="alert"
                aria-live="polite"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t(`discrepancy_${disc.size === 1 ? "one" : "other"}`, {
                  count: disc.size,
                })}
              </span>
            )}
          </dd>
          {pa.canonicalTracking && pa.canonicalTracking !== pa.tracking && (
            <p className="font-mono text-[10px] text-gray-400 mt-0.5">
              {pa.canonicalTracking}
            </p>
          )}
        </div>

        {/* Cliente */}
        {name && (
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
              {name}
              {disc.has("customerName") && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
            {pa.userId && (
              <p className="text-[10px] text-gray-500 mt-0.5">
                ID de Usuario: <span className="font-mono font-medium">{pa.userId}</span>
              </p>
            )}
          </div>
        )}

        {/* Código SL | Origen */}
        {pa.slCode && (
          <div>
            <dt className={DT_CLASS}>
              <Hash className="h-3 w-3" aria-hidden="true" />
              {t("fieldSlCode")}
            </dt>
            <dd className="flex items-center gap-1">
              <span
                className={cn(
                  "font-mono font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1",
                  disc.has("slCode")
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-violet-50 text-violet-700",
                )}
              >
                {pa.slCode}
              </span>
              {disc.has("slCode") && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-red-400 shrink-0"
                  aria-label="Código SL no coincide con cliente en sistema"
                />
              )}
            </dd>
          </div>
        )}
        {pa.origin && (
          <div>
            <dt className={DT_CLASS}>
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t("fieldOrigin")}
            </dt>
            <dd className="font-semibold text-gray-800">{pa.origin}</dd>
          </div>
        )}

        {/* Peso | Permiso */}
        {(pa.weight ?? 0) > 0 && (
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
              {pa.weight} kg
              {disc.has("weight") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}
        <div>
          <dt className={DT_CLASS}>
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t("fieldPermit")}
          </dt>
          <dd className="flex items-center gap-1">
            {pa.requiresPermit ? (
              <>
                <ShieldAlert
                  className="h-3.5 w-3.5 text-orange-500"
                  aria-hidden="true"
                />
                <span className="text-orange-600 font-medium">
                  {t("requiresPermit")}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck
                  className="h-3.5 w-3.5 text-green-500"
                  aria-hidden="true"
                />
                <span className="text-green-600">{t("noPermit")}</span>
              </>
            )}
          </dd>
        </div>

        {/* Manifiesto */}
        {pa.manifestId && (
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
              {pa.manifestId}
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
        {pa.description && (
          <div className="col-span-2">
            <dt className={DT_CLASS}>
              <Info className="h-3 w-3" aria-hidden="true" />
              {t("fieldDescription")}
            </dt>
            <dd className={cn(discClass(disc.has("description")))}>
              {pa.description}
              {disc.has("description") && (
                <AlertTriangle
                  className="h-3 w-3 text-red-400 inline ml-1"
                  aria-label="Diferencia detectada"
                />
              )}
            </dd>
          </div>
        )}

        {/* ── Secondary info divider ── */}
        {(pa.email ?? pa.dni ?? pa.phone ?? pa.preAlertCreatedAt) && (
          <div className="col-span-2 border-t border-gray-50 pt-3 mt-1">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {pa.email && (
                <div className="col-span-2">
                  <dt className={DT_CLASS}>{t("fieldEmail")}</dt>
                  <dd className="flex items-center gap-1 text-blue-600">
                    <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <a
                      href={`mailto:${pa.email}`}
                      className="hover:underline truncate"
                    >
                      {pa.email}
                    </a>
                  </dd>
                </div>
              )}
              {pa.dni && (
                <div>
                  <dt className={DT_CLASS}>{t("fieldDni")}</dt>
                  <dd className="flex items-center gap-1 font-medium text-gray-900">
                    <CreditCard
                      className="h-3 w-3 text-gray-400"
                      aria-hidden="true"
                    />
                    {pa.dni}
                  </dd>
                </div>
              )}
              {pa.phone && (
                <div>
                  <dt className={DT_CLASS}>{t("fieldPhone")}</dt>
                  <dd className="flex items-center gap-1 font-medium text-gray-900">
                    <Phone
                      className="h-3 w-3 text-gray-400"
                      aria-hidden="true"
                    />
                    {pa.phone}
                  </dd>
                </div>
              )}
              {pa.preAlertCreatedAt && (
                <div className="col-span-2">
                  <dt className={DT_CLASS}>{t("fieldPreAlertDate")}</dt>
                  <dd className="text-gray-600">
                    {formatPreAlertTs(pa.preAlertCreatedAt)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </dl>
    </motion.article>
  );
});

PreAlertSysCard.displayName = "PreAlertSysCard";
