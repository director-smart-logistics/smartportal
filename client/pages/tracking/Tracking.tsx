import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import {
  collection,
  query as fsQuery,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Clipboard,
  Database,
  Globe,
  History,
  Loader2,
  Search as SearchIcon,
  X,
} from "lucide-react";
import {
  useTrackingSearch,
  MLCargoEvent,
  TrackingSearchResult,
  isColombiaTracking,
} from "@/lib/hooks/queries/useTrackingSearch";
import {
  CarrierBadge,
  ColombiaPanel,
  EventTimeline,
  MLCargoPanel,
  PackageCard,
  PackageHistory,
  PreAlertSysCard,
  computeDiscrepancies,
} from "@/components/tracking";
import type { DiscKey, DiscSet, PreAlertDoc } from "@/components/tracking";
import { apiClient } from "@/lib/api/api-client";
import { cn } from "@/lib/utils";
import { getPreAlertsDatabase } from "@/lib/services/pre-alert-resolver";

// ── Recent searches ────────────────────────────────────────────────────────────

const RECENT_SEARCHES_KEY = "sl_portal_tracking_recent";
const MAX_RECENT = 6;

function getRecentSearches(): string[] {
  try {
    const s = localStorage.getItem(RECENT_SEARCHES_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(value: string): void {
  try {
    const list = getRecentSearches().filter((v) => v !== value);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify([value, ...list].slice(0, MAX_RECENT))
    );
  } catch {
    /* noop */
  }
}

function generateSearchVariants(tracking: string): string[] {
  const cleaned = tracking.trim().toUpperCase();
  const variants: string[] = [cleaned];
  const add = (v: string) => {
    if (v && v.length >= 6 && !variants.includes(v)) variants.push(v);
  };

  // LaserShip prefix auto-swap (0 <-> O typo reconciliation)
  if (cleaned.startsWith("1LSCX")) {
    if (cleaned.startsWith("1LSCX0")) {
      add(cleaned.replace("1LSCX0", "1LSCXO"));
    } else if (cleaned.startsWith("1LSCXO")) {
      add(cleaned.replace("1LSCXO", "1LSCX0"));
    }
  }

  if (cleaned.includes("[)>") || cleaned.includes("12Z") || cleaned.includes("31Z")) {
    const m12 = cleaned.match(/12Z(\d{12,15})/);
    if (m12) add(m12[1]);
    const m31 = cleaned.match(/31Z(\d{20,40})/);
    if (m31) {
      add(m31[1]);
      const u = m31[1].match(/(9\d{15,21})/);
      if (u) add(u[1]);
    }
    (cleaned.match(/\d{12,22}/g) || []).forEach(add);
  }

  if (/^\d{30,40}$/.test(cleaned)) {
    const u9 = cleaned.match(/(9\d{15,21})/);
    if (u9) add(u9[1]);
    for (let s = 0; s <= 22; s++) {
      const seg = cleaned.substring(s);
      if (seg.length >= 12 && seg.length <= 22) add(seg);
    }
  }

  const usspPfx = ["9400", "9405", "9200", "9300", "9205", "9208", "9270", "9274", "9261", "9407", "9449"];
  if (cleaned.length > 22) {
    for (const pfx of usspPfx) {
      const idx = cleaned.indexOf(pfx);
      if (idx >= 0 && idx < 20) {
        const strip = cleaned.substring(idx);
        if (strip.length >= 20 && strip.length <= 34) add(strip);
      }
    }
  }

  if (cleaned.startsWith("420") && cleaned.length >= 30) {
    for (const pl of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      if (cleaned.length > pl + 18) {
        const strip = cleaned.substring(pl);
        if (/^9\d/.test(strip)) add(strip);
      }
    }
  }

  if ((cleaned.startsWith("96") || cleaned.startsWith("98")) && cleaned.length > 25) {
    const strip = cleaned.substring(6);
    if (/^\d/.test(strip) && strip.length >= 12) add(strip);
  }

  if (cleaned.length > 6) {
    for (const len of [22, 20, 18, 15, 12, 21, 19, 17, 16, 14, 13, 11, 10, 8, 6]) {
      if (cleaned.length > len) add(cleaned.slice(-len));
    }
  }

  return [...new Set(variants)].filter((v) => v.length >= 6).sort((a, b) => b.length - a.length);
}

/** Normalise scanner / barcode input; for plain tracking numbers returns the input as-is. */
function resolveSearchQuery(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  const variants = generateSearchVariants(cleaned);
  return variants[0] || cleaned;
}

// ── Main Component ─────────────────────────────────────────────────────────────

const AUTO_SEARCH_DELAY = 3000;

const Tracking = memo(function Tracking() {
  const { t } = useLocale(["tracking", "packages", "common", "reconciliation"]);
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const queryClient = useQueryClient();

  const [input, setInput] = useState("");
  const [committed, setCommitted] = useState("");
  const [editingSlId, setEditingSlId] = useState<string | null>(null);
  const [tempSl, setTempSl] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [autoSearchCountdown, setAutoSearchCountdown] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resolve effective query (with AI prefix completion)
  const effectiveQuery = useMemo(
    () => (committed ? resolveSearchQuery(committed) : ""),
    [committed]
  );

  const { data, isLoading } = useTrackingSearch(
    effectiveQuery ? { query: effectiveQuery } : undefined
  );

  const packages = useMemo(() => data?.data ?? [], [data]);
  const mlcargo = data?.mlcargo ?? null;
  const colombia = data?.colombia ?? null;

  // ── Pre-alert lookup (runs in parallel with package search) ──────────────
  const { data: preAlert, isLoading: preAlertLoading } = useQuery<PreAlertDoc | null>({
    queryKey: ['pre-alert-tracking', effectiveQuery],
    queryFn: async () => {
      if (!effectiveQuery) return null;
      const normalised = effectiveQuery.toUpperCase().trim();
      const targetDb = getPreAlertsDatabase();
      const ref = collection(targetDb, 'pre_alerts');
      const snap = await getDocs(fsQuery(ref, where('tracking', '==', normalised), limit(1)));
      let doc = snap.docs[0];
      if (!doc) {
        const snap2 = await getDocs(fsQuery(ref, where('canonicalTracking', '==', normalised), limit(1)));
        doc = snap2.docs[0];
      }
      return doc ? ({ id: doc.id, ...doc.data() } as PreAlertDoc) : null;
    },
    enabled: !!effectiveQuery,
    staleTime: 5 * 60_000,
  });

  // Clear auto-search timers
  const clearAutoSearch = useCallback(() => {
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    autoSearchTimer.current = null;
    countdownTimer.current = null;
    setAutoSearchCountdown(null);
  }, []);

  const commitSearch = useCallback(
    (value: string) => {
      const val = value.trim();
      if (!val) return;
      clearAutoSearch();
      setCommitted(val);
      setShowRecent(false);
      saveRecentSearch(val);
      setRecentSearches(getRecentSearches());
      auditLog({ action: 'tracking_search', category: 'tracking', result: 'success', resource: val });
    },
    [clearAutoSearch, auditLog]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase().replace(/\s+/g, "");
      setInput(val);
      clearAutoSearch();

      if (val.length >= 4) {
        // Start 3s countdown auto-search
        let remaining = AUTO_SEARCH_DELAY / 1000;
        setAutoSearchCountdown(remaining);
        countdownTimer.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(countdownTimer.current!);
            countdownTimer.current = null;
            setAutoSearchCountdown(null);
          } else {
            setAutoSearchCountdown(remaining);
          }
        }, 1000);

        autoSearchTimer.current = setTimeout(() => {
          commitSearch(val);
        }, AUTO_SEARCH_DELAY);
      }
    },
    [clearAutoSearch, commitSearch]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      commitSearch(input);
    },
    [input, commitSearch]
  );

  const handleClear = useCallback(() => {
    setInput("");
    setCommitted("");
    clearAutoSearch();
    setEditingSlId(null);
    inputRef.current?.focus();
  }, [clearAutoSearch]);

  const handleSelectRecent = useCallback(
    (value: string) => {
      setInput(value);
      setShowRecent(false);
      commitSearch(value);
    },
    [commitSearch]
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const cleaned = text.trim().toUpperCase().replace(/\s+/g, "");
        setInput(cleaned);
        commitSearch(cleaned);
      }
    } catch {
      /* noop */
    }
  }, [commitSearch]);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copiado", description: text });
      } catch {
        toast({ title: "Error al copiar", variant: "destructive" });
      }
    },
    [toast]
  );

  const handleEditSl = useCallback((id: string, current: string) => {
    setEditingSlId(id);
    setTempSl(current);
  }, []);

  const handleCancelSl = useCallback(() => {
    setEditingSlId(null);
    setTempSl("");
  }, []);

  const handleSaveSl = useCallback(
    async (packageId: string) => {
      const queryKey = ["tracking-search", { query: effectiveQuery }];
      const prev = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) =>
        old
          ? {
              ...old,
              data: old.data?.map((p: any) =>
                p.id === packageId ? { ...p, slCode: tempSl } : p
              ),
            }
          : old
      );
      setEditingSlId(null);
      setTempSl("");
      try {
        await apiClient.patch(`/packages/${packageId}/bulk`, { slCode: tempSl });
        queryClient.invalidateQueries({ queryKey });
      } catch {
        queryClient.setQueryData(queryKey, prev);
        toast({ title: "Error al guardar", variant: "destructive" });
      }
    },
    [queryClient, effectiveQuery, tempSl, toast]
  );

  // Cleanup on unmount
  useEffect(() => () => clearAutoSearch(), [clearAutoSearch]);

  const hasResults = packages.length > 0 || (mlcargo?.found ?? false) || !!preAlert;

  const systemSlCode =
    preAlert?.slCode ?? (packages[0] as any)?.slCode ?? undefined;

  const customerMatchKey = mlcargo?.customerName ?? mlcargo?.customerCode ?? "";
  const { data: cachedCustomerMatch } = useQuery<any>({
    queryKey: ["customer-match", customerMatchKey],
    queryFn: async () => null,
    enabled: false,
  });
  const matchedSlCode: string | undefined = cachedCustomerMatch?.slCode;

  const externalRef = mlcargo?.found ? mlcargo : null;
  const pkgDiscrepancies = (pkg: TrackingSearchResult): DiscSet => {
    if (!externalRef) return new Set<DiscKey>();
    const d = computeDiscrepancies(
      { customerName: pkg.customerName, weight: pkg.weight, manifestId: pkg.manifestId ?? pkg.manifestNumber, description: pkg.description },
      { customerName: externalRef.customerName, weight: externalRef.weight, manifestId: externalRef.manifestId, description: externalRef.description }
    );
    const sl = (pkg as any).slCode;
    if (sl && matchedSlCode && sl.toUpperCase() !== matchedSlCode.toUpperCase()) d.add("slCode");
    return d;
  };
  const preAlertDiscs: DiscSet = (() => {
    const d =
      preAlert && externalRef
        ? computeDiscrepancies(
            { customerName: preAlert.displayName, weight: preAlert.weight, manifestId: preAlert.manifestId, description: preAlert.description },
            { customerName: externalRef.customerName, weight: externalRef.weight, manifestId: externalRef.manifestId, description: externalRef.description }
          )
        : new Set<DiscKey>();
    if (preAlert?.slCode && matchedSlCode &&
        preAlert.slCode.toUpperCase() !== matchedSlCode.toUpperCase()) {
      d.add("slCode");
    }
    return d;
  })();
  const mlcargoDiscs: DiscSet = preAlertDiscs.size > 0 ? preAlertDiscs :
    packages.length > 0 ? pkgDiscrepancies(packages[0]) : new Set<DiscKey>();

  const externalEvents: MLCargoEvent[] =
    (mlcargo?.events?.length ?? 0) > 0
      ? (mlcargo!.events as MLCargoEvent[])
      : ((colombia?.events ?? []) as unknown as MLCargoEvent[]);
  const pkgHistory: any[] = packages.flatMap((p) => (p as any).history ?? []);
  const totalHistoryCount = externalEvents.length + pkgHistory.length;

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-4rem)] flex flex-col pt-[6vh]">
        {/* ── Hero search section ── */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "flex flex-col items-center px-4",
            hasResults || isLoading
              ? "pt-8 pb-4"
              : "pt-4 pb-10"
          )}
        >
          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="w-full max-w-2xl"
            ref={dropdownRef}
          >
            <form
              onSubmit={handleSubmit}
              className="relative"
              role="search"
              aria-label="Buscar tracking"
            >
              {/* Single unified input with everything inside */}
              <div className="relative">
                {/* Left: search icon / spinner */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                  ) : (
                    <SearchIcon className="h-4 w-4 text-gray-400" />
                  )}
                </div>

                <Input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onFocus={() => {
                    if (recentSearches.length > 0 && !input) setShowRecent(true);
                  }}
                  placeholder="Ingresa un tracking"
                  className={cn(
                    "pl-10 pr-36 h-12 text-sm rounded-xl border-gray-200 bg-white shadow-sm",
                    "focus-visible:ring-0 focus-visible:border-gray-400 focus-visible:shadow-md transition-shadow",
                    "font-mono placeholder:font-sans placeholder:text-gray-400"
                  )}
                  aria-label="Número de tracking, nombre de cliente o código SL"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />

                {/* Right side controls inside input */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {/* Countdown */}
                  {autoSearchCountdown !== null && (
                    <span className="text-[10px] text-gray-400 tabular-nums w-5 text-center mr-0.5">
                      {autoSearchCountdown}s
                    </span>
                  )}
                  {/* Paste (only when empty) */}
                  {!input && (
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Pegar desde portapapeles"
                      title="Pegar"
                    >
                      <Clipboard className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Clear (only when has value) */}
                  {input && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Divider */}
                  <span className="w-px h-4 bg-gray-200 mx-1" aria-hidden="true" />
                  {/* Buscar pill button */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className={cn(
                      "flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold transition-all",
                      "bg-gray-800 text-white hover:bg-gray-900",
                      "disabled:bg-gray-400 disabled:cursor-not-allowed"
                    )}
                    aria-label="Buscar"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                    ) : (
                      <SearchIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    )}
                    <span className="overflow-hidden inline-flex" style={{ height: "1rem" }}>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={isLoading ? "buscando" : input.trim() ? "rastrear" : "buscar"}
                          initial={{ y: "100%", opacity: 0 }}
                          animate={{ y: "0%", opacity: 1 }}
                          exit={{ y: "-100%", opacity: 0 }}
                          transition={{ duration: 0.15, ease: "easeInOut" }}
                          className="inline-flex items-center whitespace-nowrap leading-none"
                        >
                          {isLoading ? "Buscando" : input.trim() ? "Rastrear" : "Buscar"}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </button>
                </div>
              </div>

              {/* Recent searches dropdown */}
              <AnimatePresence>
                {showRecent && recentSearches.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                    role="listbox"
                    aria-label="Búsquedas recientes"
                  >
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <History className="h-3 w-3" /> Recientes
                      </p>
                    </div>
                    {recentSearches.map((search) => (
                      <button
                        key={search}
                        type="button"
                        role="option"
                        onClick={() => handleSelectRecent(search)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors group"
                      >
                        <Clock className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                        <span className="font-mono text-sm text-gray-700 flex-1 truncate">
                          {search}
                        </span>
                        <CarrierBadge tracking={search} />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </form>

            {/* Carrier hint + search summary */}
            <AnimatePresence mode="wait">
              {input && !committed && autoSearchCountdown !== null && (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-gray-400 mt-2 text-center"
                >
                  Buscando automáticamente en {autoSearchCountdown}s · Presiona Enter para buscar ya
                </motion.p>
              )}
              {committed && !isLoading && (
                <motion.div
                  key="summary"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-400"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    <span className="font-mono text-gray-600 font-medium">&quot;{committed}&quot;</span>
                    {effectiveQuery !== committed && (
                      <span className="text-gray-400 ml-1">
                        → buscando{" "}
                        <span className="font-mono text-[11px]">
                          {effectiveQuery.slice(0, 12)}…
                        </span>
                        <span className="ml-1 text-[10px] bg-purple-50 text-purple-600 border border-purple-200 rounded px-1">
                          AI completado
                        </span>
                      </span>
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    {packages.length + (preAlert ? 1 : 0)} en sistema
                    {mlcargo?.found ? " · 1 MLCargo" : ""}
                    {colombia?.found ? " · 1 Colombia" : ""}
                  </span>
                  <button
                    onClick={handleClear}
                    className="underline hover:text-gray-600 transition-colors"
                  >
                    Limpiar
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* ── Results ── */}
        <div className="flex-1 px-4 md:px-6 pb-10 max-w-[90rem] mx-auto w-full">
          <AnimatePresence mode="wait">
            {!committed && !isLoading ? (
              /* Empty state */
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 gap-3 text-gray-300"
                role="status"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <SearchIcon className="h-14 w-14" />
                </motion.div>
                <p className="text-sm font-medium text-gray-400">
                  Ingresa un número de rastreo, nombre de cliente o código de cuenta
                </p>
                {recentSearches.length > 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {recentSearches.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSelectRecent(s)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-100 hover:border-gray-300 transition-all font-mono"
                      >
                        <Clock className="h-3 w-3 text-gray-400" />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              /* Three-panel results */
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start"
              >
                {/* ─ Left: Sistema (Firestore) ─ */}
                <section aria-label="Resultados del sistema">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Database className="h-3.5 w-3.5" />
                      Sistema
                      {!isLoading && !preAlertLoading && (
                        <span className="inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold px-1">
                          {packages.length + (preAlert ? 1 : 0)}
                        </span>
                      )}
                    </h2>
                  </div>

                  {isLoading || (preAlertLoading && packages.length === 0) ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div
                          key={i}
                          className="border border-gray-200 rounded-xl p-4 overflow-hidden relative bg-white"
                        >
                          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                          <div className="h-4 w-52 bg-gray-200 rounded-md mb-2" />
                          <div className="h-3 w-36 bg-gray-100 rounded-md mb-4" />
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="h-2.5 w-14 bg-gray-100 rounded mb-1.5" />
                              <div className="h-3.5 w-20 bg-gray-200 rounded" />
                            </div>
                            <div>
                              <div className="h-2.5 w-14 bg-gray-100 rounded mb-1.5" />
                              <div className="h-3.5 w-24 bg-gray-200 rounded" />
                            </div>
                            <div>
                              <div className="h-2.5 w-10 bg-gray-100 rounded mb-1.5" />
                              <div className="h-3.5 w-16 bg-gray-200 rounded" />
                            </div>
                            <div>
                              <div className="h-2.5 w-16 bg-gray-100 rounded mb-1.5" />
                              <div className="h-5 w-20 bg-gray-200 rounded-full" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : packages.length === 0 && !preAlert ? (
                    <div className="border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-3 py-16 bg-gray-50/60">
                      <Database className="h-8 w-8 text-gray-400" />
                      <p className="text-sm font-semibold text-gray-700">
                        Sin resultados en el sistema
                      </p>
                      <p className="text-xs text-gray-500">
                        No hay paquetes que coincidan con{" "}
                        <span className="font-mono font-semibold text-gray-700">&quot;{committed}&quot;</span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {packages.map((pkg) => (
                        <PackageCard
                          key={pkg.id}
                          pkg={pkg}
                          editingSlId={editingSlId}
                          tempSl={tempSl}
                          onEditSl={handleEditSl}
                          onSaveSl={handleSaveSl}
                          onCancelSl={handleCancelSl}
                          onSlChange={setTempSl}
                          onCopy={copyToClipboard}
                          discrepancies={pkgDiscrepancies(pkg)}
                        />
                      ))}
                      {preAlert && <PreAlertSysCard pa={preAlert} discrepancies={preAlertDiscs} />}
                    </div>
                  )}
                </section>

                {/* ─ Col 2: Adaptive provider panel (USA / Colombia) ─ */}
                {(() => {
                  const isColom = (colombia?.found === true) ||
                    (isLoading && isColombiaTracking(effectiveQuery));
                  const providerLabel = isColom ? "Colombia" : "USA";
                  const providerFound = isColom ? colombia?.found : mlcargo?.found;
                  return (
                    <section aria-label={`Proveedor ${providerLabel}`}>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5" />
                          Proveedor
                          <span className="text-gray-400 font-medium normal-case tracking-normal">·</span>
                          {providerLabel}
                          {!isLoading && providerFound && (
                            <span className="inline-flex items-center justify-center h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2">
                              Encontrado
                            </span>
                          )}
                        </h2>
                      </div>
                      <Card className="bg-white border-gray-100 overflow-hidden rounded-xl shadow-sm sticky top-4">
                        {isColom ? (
                          <ColombiaPanel result={colombia} isLoading={isLoading} />
                        ) : (
                          <MLCargoPanel result={mlcargo} isLoading={isLoading} discrepancies={mlcargoDiscs} systemSlCode={systemSlCode} />
                        )}
                      </Card>
                    </section>
                  );
                })()}

                {/* ─ Col 3: Historial ─ */}
                <section aria-label="Historial del paquete">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <History className="h-3.5 w-3.5" />
                      Historial
                      {!isLoading && totalHistoryCount > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold px-1">
                          {totalHistoryCount}
                        </span>
                      )}
                    </h2>
                  </div>

                  {isLoading ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-gray-200 mt-0.5 shrink-0" />
                            {i < 3 && <div className="w-px flex-1 bg-gray-100 mt-1 min-h-[28px]" />}
                          </div>
                          <div className="pb-3 flex-1">
                            <div className="h-3 w-48 bg-gray-200 rounded mb-1.5 animate-pulse" />
                            <div className="h-2.5 w-24 bg-gray-100 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : totalHistoryCount === 0 ? (
                    <div className="border border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-3 py-16 bg-gray-50/60">
                      <History className="h-8 w-8 text-gray-300" />
                      <p className="text-sm font-semibold text-gray-700">Sin historial</p>
                      <p className="text-xs text-gray-500 text-center">
                        No hay eventos de rastreo disponibles
                      </p>
                    </div>
                  ) : (
                    <Card className="bg-white border-gray-100 overflow-hidden rounded-xl shadow-sm">
                      <div className="px-4 pt-4 pb-4 space-y-5">
                        {externalEvents.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                              <Globe className="h-3 w-3" />
                              {(mlcargo?.events?.length ?? 0) > 0 ? 'MLCargo' : 'Colombia'}
                            </p>
                            <EventTimeline events={externalEvents} />
                          </div>
                        )}
                        {packages.map((pkg) => {
                          const h: any[] = (pkg as any).history ?? [];
                          if (!h.length) return null;
                          return (
                            <div key={pkg.id}>
                              {externalEvents.length > 0 && <div className="border-t border-gray-50 mb-4" />}
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                <Database className="h-3 w-3" />
                                Sistema
                              </p>
                              <PackageHistory pkg={pkg as any} />
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
});

export default Tracking;
