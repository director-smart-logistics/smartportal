import { memo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Route,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import { findCustomerMatch } from "@/lib/services/customer-matcher";
import { searchCustomers } from "@/lib/firebase/firestore-client";

// ── Customer match query ──────────────────────────────────────────────────────

function useCustomerMatch(customerCode?: string, customerName?: string) {
  const searchKey = customerName ?? customerCode ?? "";
  return useQuery({
    queryKey: ["customer-match", searchKey],
    queryFn: async () => {
      if (!searchKey) return null;

      if (customerName) {
        const normName = customerName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();
        const words = normName.split(/\s+/).filter((w) => w.length >= 3);
        const token =
          words.sort((a, b) => b.length - a.length)[0] ?? normName.slice(0, 10);

        try {
          const candidates = await searchCustomers(token, 20);
          if (candidates.length > 0) {
            const norm = (s: string) =>
              s
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();
            const needle = norm(customerName);
            const needleTokens = new Set(needle.split(/\s+/));
            let bestScore = 0;
            let bestMatch: (typeof candidates)[0] | null = null;

            for (const c of candidates) {
              const hayTokens = norm(c.fullName).split(/\s+/);
              const hits = hayTokens.filter((t) => needleTokens.has(t)).length;
              const score =
                hits / Math.max(needleTokens.size, hayTokens.length);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = c;
              }
            }
            if (bestMatch && bestScore >= 0.5) return bestMatch as any;
          }
        } catch {
          /* fall through */
        }

        try {
          const matchResult = await findCustomerMatch(customerName);
          if (matchResult.bestMatch && matchResult.bestMatch.score >= 0.65) {
            return matchResult.bestMatch.customer as any;
          }
        } catch (err) {
          console.warn("[CustomerMatchPanel] match error:", err);
        }
      }
      return null;
    },
    enabled: !!searchKey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// ── No-match sub-panel ────────────────────────────────────────────────────────

type NovaStatus = "idle" | "loading" | "found" | "notfound";

const NoMatchPanel = memo(function NoMatchPanel({
  customerName,
}: {
  customerName?: string;
}) {
  const { t } = useLocale("tracking");
  const [status, setStatus] = useState<NovaStatus>("idle");
  const [novaResult, setNovaResult] = useState<any>(null);

  const handleNovaMatch = async () => {
    if (!customerName) return;
    setStatus("loading");
    try {
      const res = await findCustomerMatch(customerName);
      if (res.bestMatch) {
        setNovaResult(res.bestMatch.customer);
        setStatus("found");
      } else setStatus("notfound");
    } catch {
      setStatus("notfound");
    }
  };

  if (status === "loading") {
    return (
      <div
        className="flex items-center gap-2.5 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-xs text-purple-700"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className="h-4 w-4 animate-spin flex-shrink-0"
          aria-hidden="true"
        />
        <span className="font-medium">{t("searchingWithNova")}</span>
      </div>
    );
  }

  if (status === "found" && novaResult) {
    return (
      <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />{" "}
              {t("foundByNova")}
            </p>
            <p className="text-sm font-bold text-gray-900 truncate">
              {novaResult.fullName ?? novaResult.name}
            </p>
          </div>
          {novaResult.slCode && (
            <span className="font-mono text-xs bg-purple-100 text-purple-800 border border-purple-200 rounded px-1.5 py-0.5 font-semibold shrink-0">
              {novaResult.slCode}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
          {novaResult.phone && (
            <div className="flex items-center gap-1.5">
              <Phone
                className="h-3 w-3 text-purple-400 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-gray-800 font-medium">
                {novaResult.phone}
              </span>
            </div>
          )}
          {novaResult.email && (
            <div className="flex items-center gap-1.5">
              <Mail
                className="h-3 w-3 text-purple-400 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-gray-700 truncate">{novaResult.email}</span>
            </div>
          )}
          {(novaResult.ruta ?? novaResult.route) && (
            <div className="flex items-center gap-1.5">
              <Route
                className="h-3 w-3 text-purple-400 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="font-semibold text-gray-900">
                Ruta:{" "}
                <span className="font-mono bg-purple-100 text-purple-800 rounded px-1">
                  {novaResult.ruta ?? novaResult.route}
                </span>
              </span>
            </div>
          )}
        </dl>
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500">
        <UserCheck
          className="h-4 w-4 text-gray-300 flex-shrink-0"
          aria-hidden="true"
        />
        <span className="font-medium">{t("noMatchByNova")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2.5 text-xs text-gray-500 min-w-0">
        <UserCheck
          className="h-4 w-4 text-gray-300 flex-shrink-0"
          aria-hidden="true"
        />
        <span className="font-medium truncate">{t("noMatchFound")}</span>
      </div>
      {customerName && (
        <button
          type="button"
          onClick={handleNovaMatch}
          className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("searchWithNova")}
        </button>
      )}
    </div>
  );
});

NoMatchPanel.displayName = "NoMatchPanel";

// ── CustomerMatchPanel ────────────────────────────────────────────────────────

interface CustomerMatchPanelProps {
  customerCode?: string;
  customerName?: string;
  systemSlCode?: string;
}

export const CustomerMatchPanel = memo(function CustomerMatchPanel({
  customerCode,
  customerName,
  systemSlCode,
}: CustomerMatchPanelProps) {
  const { data: customer, isLoading } = useCustomerMatch(
    customerCode,
    customerName,
  );

  if (isLoading) {
    return (
      <div
        className="relative overflow-hidden rounded-lg border border-gray-200 p-3 bg-white"
        aria-busy="true"
        aria-label="Cargando coincidencia de cliente"
      >
        <div
          className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent"
          aria-hidden="true"
        />
        <div className="h-2.5 w-24 bg-gray-100 rounded mb-2" />
        <div className="h-4 w-40 bg-gray-200 rounded mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-3 w-full bg-gray-100 rounded" />
          <div className="h-3 w-full bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (!customer) return <NoMatchPanel customerName={customerName} />;

  const slMismatch =
    !!systemSlCode &&
    !!customer?.slCode &&
    customer.slCode.toUpperCase() !== systemSlCode.toUpperCase();

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        slMismatch
          ? "border-orange-200 bg-orange-50/50"
          : "border-blue-100 bg-blue-50/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-0.5 flex items-center gap-1">
            <UserCheck className="h-3 w-3" aria-hidden="true" /> Cliente en
            Sistema
          </p>
          <p className="text-sm font-bold text-gray-900 truncate">
            {customer.fullName ?? customer.name ?? customer.firstName}
          </p>
        </div>
        {customer.slCode && (
          <div className="flex items-center gap-1 shrink-0">
            <span
              className={cn(
                "font-mono text-xs border rounded px-1.5 py-0.5 font-semibold",
                slMismatch
                  ? "bg-red-50 text-red-700 border-red-300"
                  : "bg-blue-100 text-blue-800 border-blue-200",
              )}
            >
              {customer.slCode}
            </span>
            {slMismatch && (
              <AlertTriangle
                className="h-3.5 w-3.5 text-red-400"
                aria-label="Código SL diferente al registrado en el pre-alerta"
              />
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
        {customer.phone && (
          <div className="flex items-center gap-1.5">
            <Phone
              className="h-3 w-3 text-blue-400 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-gray-800 font-medium">{customer.phone}</span>
          </div>
        )}
        {customer.email && (
          <div className="flex items-center gap-1.5">
            <Mail
              className="h-3 w-3 text-blue-400 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-gray-700 truncate">{customer.email}</span>
          </div>
        )}
        {(customer.city ?? customer.address) && (
          <div className="flex items-start gap-1.5">
            <MapPin
              className="h-3 w-3 text-blue-400 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="text-gray-700">
              {[customer.address, customer.city].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
        {customer.route && (
          <div className="flex items-center gap-1.5">
            <Route
              className="h-3 w-3 text-blue-400 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="font-semibold text-gray-900">
              Ruta:{" "}
              <span className="font-mono bg-blue-100 text-blue-800 rounded px-1">
                {customer.route}
              </span>
            </span>
          </div>
        )}
        {customer.zone && (
          <div className="flex items-center gap-1.5">
            <MapPin
              className="h-3 w-3 text-blue-400 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-gray-700">
              Zona:{" "}
              <span className="font-semibold text-gray-900">
                {customer.zone}
              </span>
            </span>
          </div>
        )}
      </dl>
    </div>
  );
});

CustomerMatchPanel.displayName = "CustomerMatchPanel";
