import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Hash,
  Package,
  MapPin,
  Users,
  AlertCircle,
  AlertTriangle,
  Search,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  CheckSquare,
  Square,
  Minus,
  Scale,
  DollarSign,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MultiMatchRowData } from "@/hooks/use-nova-chat";
import { Button } from "@/components/ui/button";
import firestoreApi from "@/lib/firebase/firestore-client";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import {
  searchUnified,
  searchAndSyncFromSP2,
  type UnifiedSearchResult,
} from "@/lib/services/customer-sync";
import { saveMatchFeedback } from "@/lib/services/match-learning";


interface RouteOption {
  id: string;
  name: string;
}

interface NovaRowModalProps {
  rows: MultiMatchRowData[];
  isOpen: boolean;
  selectedMatches: Record<number, string>;
  onSelect: (
    rowIndex: number,
    slCode: string,
    ruta: string,
    consolidacion: boolean,
    fullName?: string,
  ) => void;
  onClose: () => void;
}

// ── Route color map (matches SP2) ─────────────────────────────────────────────
const ROUTE_COLOR_MAP: Record<
  string,
  { bg: string; bgSel: string; text: string; textSel: string; border: string }
> = {
  "San Jose Centro": {
    bg: "bg-purple-50",
    bgSel: "bg-purple-700",
    text: "text-purple-700",
    textSel: "text-white",
    border: "border-purple-700",
  },
  "San Jose Escazu": {
    bg: "bg-fuchsia-50",
    bgSel: "bg-fuchsia-500",
    text: "text-fuchsia-700",
    textSel: "text-white",
    border: "border-fuchsia-500",
  },
  "San Jose Coronado": {
    bg: "bg-pink-50",
    bgSel: "bg-pink-400",
    text: "text-pink-700",
    textSel: "text-white",
    border: "border-pink-400",
  },
  "Cartago 1": {
    bg: "bg-cyan-50",
    bgSel: "bg-cyan-500",
    text: "text-cyan-700",
    textSel: "text-white",
    border: "border-cyan-500",
  },
  "Cartago 2": {
    bg: "bg-blue-50",
    bgSel: "bg-blue-600",
    text: "text-blue-700",
    textSel: "text-white",
    border: "border-blue-600",
  },
  Encomiendas: {
    bg: "bg-emerald-50",
    bgSel: "bg-emerald-600",
    text: "text-emerald-700",
    textSel: "text-white",
    border: "border-emerald-600",
  },
  Occidente: {
    bg: "bg-orange-50",
    bgSel: "bg-orange-600",
    text: "text-orange-700",
    textSel: "text-white",
    border: "border-orange-600",
  },
  Alajuela: {
    bg: "bg-red-50",
    bgSel: "bg-red-600",
    text: "text-red-700",
    textSel: "text-white",
    border: "border-red-600",
  },
  Heredia: {
    bg: "bg-yellow-50",
    bgSel: "bg-yellow-500",
    text: "text-yellow-800",
    textSel: "text-white",
    border: "border-yellow-500",
  },
  BB: {
    bg: "bg-slate-100",
    bgSel: "bg-slate-900",
    text: "text-slate-800",
    textSel: "text-white",
    border: "border-slate-900",
  },
  Mayorista: {
    bg: "bg-indigo-50",
    bgSel: "bg-indigo-600",
    text: "text-indigo-700",
    textSel: "text-white",
    border: "border-indigo-600",
  },
  Retira: {
    bg: "bg-teal-50",
    bgSel: "bg-teal-600",
    text: "text-teal-700",
    textSel: "text-white",
    border: "border-teal-600",
  },
};
const getRouteColors = (name: string) =>
  ROUTE_COLOR_MAP[name] ?? {
    bg: "bg-slate-50",
    bgSel: "bg-slate-600",
    text: "text-slate-700",
    textSel: "text-white",
    border: "border-slate-400",
  };

// ── Route Radio Grid ───────────────────────────────────────────────────────────
function RouteRadioGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    firestoreApi.routes
      .list({ orderByField: "name", orderDirection: "asc" })
      .then((res) => {
        if (cancelled) return;
        const docs = res.data as any[];
        const filteredDocs = docs.filter(
          (d) =>
            d.name !== "BB" &&
            d.name !== "Mayorista" &&
            d.name !== "Mayoristas",
        );
        setRoutes(filteredDocs.map((d) => ({ id: d.id, name: d.name || d.id })));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Seleccionar ruta"
    >
      {routes.map((opt) => {
        const c = getRouteColors(opt.name);
        const selected = value === opt.name;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? "" : opt.name)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              selected
                ? cn(c.bgSel, c.textSel, c.border)
                : cn(c.bg, c.text, c.border, "hover:opacity-80"),
            )}
          >
            <span
              className={cn(
                "w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all",
                selected
                  ? cn("border-white", c.bgSel)
                  : cn("border-current bg-transparent"),
              )}
            >
              {selected && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </span>
            {opt.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Typeahead Route Search (used in manual/quick tabs only) ────────────────────
function RouteTypeahead({
  value,
  onChange,
  placeholder = "Buscar ruta...",
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [filtered, setFiltered] = useState<RouteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const openDropdown = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    firestoreApi.routes
      .list({ orderByField: "name", orderDirection: "asc" })
      .then((res) => {
        if (cancelled) return;
        const docs = res.data as any[];
        const filteredDocs = docs.filter(
          (d) =>
            d.name !== "BB" &&
            d.name !== "Mayorista" &&
            d.name !== "Mayoristas",
        );
        const opts: RouteOption[] = filteredDocs.map((d) => ({
          id: d.id,
          name: d.name || d.id,
        }));
        setRoutes(opts);
        setFiltered(opts);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(routes);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(
      routes.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
      ),
    );
  }, [query, routes]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (opt: RouteOption) => {
    setQuery(opt.name);
    onChange(opt.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            openDropdown();
          }}
          onFocus={openDropdown}
          placeholder={placeholder}
          className="w-full h-8 pl-8 pr-8 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 h-3.5 w-3.5 text-muted-foreground animate-spin pointer-events-none" />
        ) : (
          <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        )}
      </div>
      {open &&
        filtered.length > 0 &&
        rect &&
        (() => {
          const spaceBelow = window.innerHeight - rect.bottom;
          const goUp = spaceBelow < 180;
          const dropdownStyle: React.CSSProperties = goUp
            ? {
                position: "fixed",
                bottom: window.innerHeight - rect.top + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 200,
              }
            : {
                position: "fixed",
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 200,
              };
          return (
            <AnimatePresence>
              <motion.ul
                key="route-dropdown"
                ref={listRef}
                initial={{ opacity: 0, y: goUp ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: goUp ? 4 : -4 }}
                transition={{ duration: 0.12 }}
                style={dropdownStyle}
                className="bg-card border border-border rounded-xl shadow-lg overflow-y-auto max-h-44 text-xs"
              >
                {filtered.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onMouseDown={() => select(opt)}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2",
                        query === opt.name &&
                          "bg-primary/5 text-primary font-medium",
                      )}
                    >
                      <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      {opt.name}
                    </button>
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>
          );
        })()}
    </div>
  );
}

// ── Row Detail Panel ───────────────────────────────────────────────────────────
function RowDetailPanel({
  row,
  selectedSlCode,
  onSelect,
}: {
  row: MultiMatchRowData;
  selectedSlCode?: string;
  onSelect: (
    rowIndex: number,
    slCode: string,
    ruta: string,
    consolidacion: boolean,
    fullName?: string,
  ) => void;
}) {
  const [nameQuery, setNameQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sp2Searching, setSp2Searching] = useState(false);
  const [sp2Status, setSp2Status] = useState<"idle" | "found" | "notfound">(
    "idle",
  );
  const [manualSlCode, setManualSlCode] = useState("");
  const [manualRuta, setManualRuta] = useState("");
  const [pickConfirm, setPickConfirm] = useState<{
    slCode: string;
    fullName: string;
    ruta?: string;
    consolidation: boolean;
    source?: string;
  } | null>(null);
  const [pickConfirmRoute, setPickConfirmRoute] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset panel state when row changes and auto-focus search
  useEffect(() => {
    setNameQuery("");
    setSearchResults([]);
    setSearching(false);
    setSearched(false);
    setSp2Searching(false);
    setSp2Status("idle");
    setManualSlCode("");
    setManualRuta("");
    setPickConfirm(null);
    setPickConfirmRoute("");
    // Small delay to let the panel re-render before focusing
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [row.rowIndex]);

  // Debounced search using the powerful local matcher (same as SP2 UsersManagement)
  useEffect(() => {
    if (nameQuery.trim().length < 2) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      // 150ms debounce
      setSearching(true);
      try {
        const results = await searchUnified(nameQuery.trim());
        setSearchResults(results);
        setSearched(true);
      } catch {
        setSearchResults([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 150);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [nameQuery]);

  const handlePickResult = useCallback((r: UnifiedSearchResult) => {
    setPickConfirm({
      slCode: r.slCode,
      fullName: (r as any).fullName || r.slCode,
      ruta: r.ruta,
      consolidation: r.consolidationEnabled,
      source: r.source,
    });
    setPickConfirmRoute(r.ruta || "");
  }, []);

  const confirmPick = useCallback(() => {
    if (!pickConfirm) return;
    const ruta = pickConfirmRoute.trim() || pickConfirm.ruta || manualRuta;
    onSelect(
      row.rowIndex,
      pickConfirm.slCode,
      ruta,
      pickConfirm.consolidation,
      pickConfirm.fullName,
    );
    saveMatchFeedback({
      manifestName: row.nombre,
      slCode: pickConfirm.slCode,
      fullName: pickConfirm.fullName,
      ruta: pickConfirm.ruta ?? null,
      consolidationEnabled: pickConfirm.consolidation,
      source: pickConfirm.source === "sp2" ? "admin_sp2" : "admin_pick",
    });
    setPickConfirm(null);
    setPickConfirmRoute("");
  }, [
    pickConfirm,
    pickConfirmRoute,
    row.rowIndex,
    row.nombre,
    manualRuta,
    onSelect,
  ]);

  const handleSP2Search = useCallback(async () => {
    setSp2Searching(true);
    setSp2Status("idle");
    try {
      const result = await searchAndSyncFromSP2(nameQuery.trim() || row.nombre);
      if (result) {
        setSp2Status("found");
        setSearchResults((prev) => {
          const already = prev.some((r) => r.slCode === result.slCode);
          if (already) return prev;
          return [{ ...result, source: "sp2" as const }, ...prev];
        });
        if (result.ruta) setManualRuta(result.ruta);
        saveMatchFeedback({
          manifestName: row.nombre,
          slCode: result.slCode,
          fullName: result.fullName,
          ruta: result.ruta ?? null,
          consolidationEnabled: result.consolidationEnabled,
          source: "admin_sp2",
        });
      } else {
        setSp2Status("notfound");
      }
    } catch {
      setSp2Status("notfound");
    } finally {
      setSp2Searching(false);
    }
  }, [nameQuery, row.nombre]);

  const handleConfirmManual = useCallback(() => {
    if (!manualSlCode.trim()) return;
    const slCode = manualSlCode.trim().toUpperCase();
    onSelect(row.rowIndex, slCode, manualRuta, false, undefined);
    saveMatchFeedback({
      manifestName: row.nombre,
      slCode,
      fullName: slCode,
      ruta: manualRuta || null,
      consolidationEnabled: false,
      source: "admin_manual",
    });
  }, [row.rowIndex, row.nombre, manualSlCode, manualRuta, onSelect]);

  const scoreColor = (score: number) => {
    if (score >= 0.9)
      return "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20";
    if (score >= 0.75)
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20";
    return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20";
  };

  // Which list to show: search results when query active, else auto-candidates
  const showSearchResults = nameQuery.trim().length >= 2;
  const listItems: Array<{
    key: string;
    slCode: string;
    fullName: string;
    ruta?: string;
    consolidation: boolean;
    score?: number;
    source?: string;
  }> = showSearchResults
    ? searchResults.map((r) => ({
        key: r.slCode,
        slCode: r.slCode,
        fullName: r.fullName,
        ruta: r.ruta,
        consolidation: r.consolidationEnabled,
        source: r.source,
      }))
    : row.candidates.map((c) => ({
        key: `${row.rowIndex}-${c.slCode}`,
        slCode: c.slCode,
        fullName: c.fullName,
        ruta: c.ruta,
        consolidation: c.consolidation,
        score: c.score,
      }));

  return (
    <div className="flex h-full min-h-0">
      {/* ══ LEFT COLUMN — context & info ══ */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col overflow-y-auto bg-muted/20">
        {/* Section: Identity */}
        <div className="px-4 pt-4 pb-3 border-b border-border/60 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Destinatario
          </p>
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {row.nombre}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Fila {row.rowIndex}
              </p>
            </div>
          </div>
          {row.tracking && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background border border-border">
              <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground font-mono truncate">
                {row.tracking}
              </span>
            </div>
          )}
        </div>

        {/* Section: Peso & Precio */}
        {row.peso !== undefined && row.peso > 0 && (
          <div className="px-4 py-3 border-b border-border/60 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Carga
            </p>
            <div className="space-y-1.5">
              {/* Weight */}
              <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                <Scale className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] min-w-0">
                  <p className="font-medium text-blue-600 dark:text-blue-400 mb-0.5">
                    Peso
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {row.peso.toFixed(3)} kg
                    </span>
                    {row.diferenciaRedondeo !== undefined &&
                      row.diferenciaRedondeo > 0 && (
                        <span className="ml-1 text-blue-500">
                          → {row.pesoRedondeo} kg{" "}
                          <span className="text-muted-foreground/70">
                            (+{row.diferenciaRedondeo.toFixed(3)})
                          </span>
                        </span>
                      )}
                  </p>
                </div>
              </div>
              {/* Price */}
              <div
                className={cn(
                  "flex items-start gap-2 px-2.5 py-2 rounded-lg border",
                  row.permisos
                    ? "bg-amber-500/5 border-amber-500/15"
                    : "bg-green-500/5 border-green-500/15",
                )}
              >
                <DollarSign
                  className={cn(
                    "h-3.5 w-3.5 flex-shrink-0 mt-0.5",
                    row.permisos ? "text-amber-500" : "text-green-500",
                  )}
                />
                <div className="text-[11px] min-w-0 space-y-0.5">
                  <p
                    className={cn(
                      "font-medium",
                      row.permisos
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-green-600 dark:text-green-400",
                    )}
                  >
                    Precio
                  </p>
                  {row.permisos ? (
                    <>
                      {row.precioSinPermiso !== undefined && (
                        <p className="text-muted-foreground">
                          Sin permiso:{" "}
                          <span className="font-semibold text-foreground">
                            ${row.precioSinPermiso.toFixed(2)}
                          </span>
                        </p>
                      )}
                      {row.precioConPermiso !== undefined && (
                        <p className="text-muted-foreground">
                          Con permiso:{" "}
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            ${row.precioConPermiso.toFixed(2)}
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    row.precioSinPermiso !== undefined && (
                      <p className="text-muted-foreground">
                        Precio final:{" "}
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          ${row.precioSinPermiso.toFixed(2)}
                        </span>
                      </p>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section: Review reason */}
        {(row.needsReview === "por_definir" ||
          row.needsReview === "low_score") && (
          <div className="px-4 py-3 border-b border-border/60 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Motivo de revisión
            </p>
            {row.needsReview === "por_definir" && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/8 border border-orange-400/20">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                    Ruta por definir
                  </p>
                  {row.matchedName && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Asignado a{" "}
                      <span className="font-medium">{row.matchedName}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
            {row.needsReview === "low_score" && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-400/20">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                    Match dudoso{" "}
                    {row.matchScore !== undefined
                      ? `(${Math.round(row.matchScore * 100)}%)`
                      : ""}
                  </p>
                  {row.matchedName && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Sugerido:{" "}
                      <span className="font-medium">{row.matchedName}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spacer to push content up */}
        <div className="flex-1" />
      </div>

      {/* ══ RIGHT COLUMN — search & assign ══ */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Search bar header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/60 space-y-2 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Buscar cliente
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Nombre, SL code, email, teléfono, cédula..."
                className="w-full h-9 pl-9 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none" />
              )}
            </div>
            <button
              type="button"
              onClick={handleSP2Search}
              disabled={sp2Searching}
              title="Buscar en Portal Clientes (SP2)"
              className="flex-shrink-0 h-9 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {sp2Searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              SP2
            </button>
          </div>
          {sp2Status === "found" && (
            <p className="text-xs text-blue-500 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" /> Encontrado en SP2 —
              sincronizado
            </p>
          )}
          {sp2Status === "notfound" && (
            <p className="text-xs text-muted-foreground">
              No encontrado en SP2
            </p>
          )}
          {showSearchResults && !searching && (
            <p className="text-[11px] text-muted-foreground">
              {searchResults.length === 0
                ? "Sin resultados — intenta SP2 o asignación manual"
                : `${searchResults.length} resultado${searchResults.length !== 1 ? "s" : ""}`}
            </p>
          )}
          {!showSearchResults && row.candidates.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {row.candidates.length} candidato
              {row.candidates.length !== 1 ? "s" : ""} automático
              {row.candidates.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* ── Candidate / search result list ── */}
        <div className="overflow-y-auto flex-1 divide-y divide-border/60">
          {showSearchResults &&
            !searching &&
            searched &&
            searchResults.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 px-6 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">
                  Sin resultados en SP1
                </p>
                <p className="text-xs text-muted-foreground">
                  Prueba con SP2 o asigna manualmente abajo
                </p>
              </div>
            )}

          {!showSearchResults && row.candidates.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 px-6 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">
                Sin coincidencias automáticas
              </p>
              <p className="text-xs text-muted-foreground">
                Busca por nombre arriba o asigna manualmente
              </p>
            </div>
          )}

          {(() => {
            const renderItem = (item: {
              key: string;
              slCode: string;
              fullName: string;
              ruta?: string;
              consolidation: boolean;
              score?: number;
              source?: string;
            }) => {
              const isItemSelected = selectedSlCode === item.slCode;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    handlePickResult({
                      slCode: item.slCode,
                      fullName: item.fullName,
                      ruta: item.ruta,
                      consolidationEnabled: item.consolidation,
                      source: (item.source as any) ?? "sp1",
                    })
                  }
                  aria-pressed={pickConfirm?.slCode === item.slCode}
                  className={cn(
                    "w-full text-left px-5 py-3 transition-colors hover:bg-accent/60",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                    isItemSelected
                      ? "bg-green-500/5 border-l-2 border-l-green-500"
                      : pickConfirm?.slCode === item.slCode
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "border-l-2 border-l-transparent",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p
                          className={cn(
                            "text-sm font-semibold truncate",
                            isItemSelected
                              ? "text-green-600 dark:text-green-400"
                              : "text-foreground",
                          )}
                        >
                          {item.fullName}
                        </p>
                        {item.source === "sp2" && (
                          <span className="flex-shrink-0 text-[11px] text-blue-500 flex items-center gap-0.5 font-medium">
                            <Database className="h-3 w-3" />
                            SP2
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-xs font-bold font-mono px-1.5 py-0.5 rounded",
                            isItemSelected
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          {item.slCode}
                        </span>
                        {item.score !== undefined && (
                          <span
                            className={cn(
                              "text-[11px] font-semibold px-1.5 py-0.5 rounded",
                              scoreColor(item.score),
                            )}
                          >
                            {Math.round(item.score * 100)}%
                          </span>
                        )}
                        {item.ruta && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {item.ruta}
                          </span>
                        )}
                        {item.consolidation && (
                          <span className="flex items-center gap-1 text-[11px] text-blue-500">
                            <Package className="h-3 w-3 flex-shrink-0" />
                            Consolidación
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isItemSelected ? (
                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </div>
                      ) : pickConfirm?.slCode === item.slCode ? (
                        <div className="w-6 h-6 rounded-full bg-primary border-2 border-primary flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-primary-foreground" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-border hover:border-primary/50 transition-colors" />
                      )}
                    </div>
                  </div>
                </button>
              );
            };

            const hasScores = listItems.some((i) => i.score !== undefined);
            if (!hasScores)
              return <>{listItems.map((item) => renderItem(item))}</>;

            const high = listItems.filter((i) => (i.score ?? 0) >= 0.9);
            const medium = listItems.filter(
              (i) => (i.score ?? 0) >= 0.7 && (i.score ?? 0) < 0.9,
            );
            const low = listItems.filter((i) => (i.score ?? 0) < 0.7);
            const GroupLabel = ({
              label,
              count,
            }: {
              label: string;
              count: number;
            }) => (
              <div className="px-5 py-1.5 bg-muted/40 border-b border-border/60 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {count}
                </span>
              </div>
            );
            return (
              <>
                {high.length > 0 && (
                  <>
                    <GroupLabel label="Alta confianza" count={high.length} />
                    {high.map((i) => renderItem(i))}
                  </>
                )}
                {medium.length > 0 && (
                  <>
                    <GroupLabel label="Media confianza" count={medium.length} />
                    {medium.map((i) => renderItem(i))}
                  </>
                )}
                {low.length > 0 && (
                  <>
                    <GroupLabel label="Baja confianza" count={low.length} />
                    {low.map((i) => renderItem(i))}
                  </>
                )}
              </>
            );
          })()}
        </div>

        {/* ── Route assignment box (por_definir) OR simple pick confirmation bar ── */}
        {row.needsReview === "por_definir" ? (
          <div className="px-4 py-3 border-t border-orange-400/30 bg-orange-500/5 flex-shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex-1 min-w-0">
                {pickConfirm ? (
                  <>
                    <span className="font-bold font-mono">
                      {pickConfirm.slCode}
                    </span>{" "}
                    · {pickConfirm.fullName}
                  </>
                ) : (
                  "Selecciona el cliente de arriba, luego elige la ruta"
                )}
              </p>
              {pickConfirm && (
                <button
                  type="button"
                  onClick={() => {
                    setPickConfirm(null);
                    setPickConfirmRoute("");
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  Cambiar
                </button>
              )}
            </div>
            <RouteRadioGrid
              value={pickConfirmRoute}
              onChange={setPickConfirmRoute}
            />
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={confirmPick}
              disabled={!pickConfirm || !pickConfirmRoute.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              {pickConfirm
                ? `Asignar ${pickConfirm.slCode} con ruta seleccionada`
                : "Selecciona cliente y ruta"}
            </Button>
          </div>
        ) : (
          <AnimatePresence>
            {pickConfirm && (
              <motion.div
                key="pick-confirm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-t border-primary/20 flex-shrink-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {pickConfirm.fullName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-bold font-mono text-primary">
                      {pickConfirm.slCode}
                    </span>
                    {pickConfirm.ruta && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {pickConfirm.ruta}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPickConfirm(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded flex-shrink-0"
                >
                  Cancelar
                </button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 px-3 flex-shrink-0"
                  onClick={confirmPick}
                >
                  <Check className="h-3 w-3" />
                  Confirmar
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ── Assignment panel ── */}
        <div className="border-t border-border flex-shrink-0 bg-muted/20">
          <div className="px-5 py-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={manualSlCode}
                onChange={(e) =>
                  setManualSlCode(e.target.value.toUpperCase())
                }
                placeholder="Código SL"
                className="w-full h-8 px-3 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary font-mono uppercase"
              />
              <RouteTypeahead
                value={manualRuta}
                onChange={setManualRuta}
                placeholder="Ruta..."
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="w-full h-8 text-xs gap-1.5"
              onClick={handleConfirmManual}
              disabled={!manualSlCode.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              Confirmar manual
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar Grouped List ───────────────────────────────────────────────────────
interface SidebarGroupedListProps {
  rows: MultiMatchRowData[];
  filteredRows: MultiMatchRowData[];
  activeIdx: number;
  selectedMatches: Record<number, string>;
  bulkSelected: Set<number>;
  onActivate: (idx: number) => void;
  onToggleBulk: (rowIndex: number, e: React.MouseEvent) => void;
}

function SidebarGroupedList({
  rows,
  filteredRows,
  activeIdx,
  selectedMatches,
  bulkSelected,
  onActivate,
  onToggleBulk,
}: SidebarGroupedListProps) {
  // Build ordered groups: rows sharing the same matchedSlCode are grouped together.
  // Rows with no matchedSlCode form an "unmatched" group at the bottom.
  const groups: Array<{
    slCode: string | null;
    label: string;
    rowList: MultiMatchRowData[];
  }> = [];
  const seenSlCodes = new Map<string, MultiMatchRowData[]>();

  for (const row of filteredRows) {
    const key = row.matchedSlCode || "";
    if (key) {
      if (!seenSlCodes.has(key)) seenSlCodes.set(key, []);
      seenSlCodes.get(key)!.push(row);
    }
  }
  // Maintain insertion order (first appearance in filteredRows)
  const seen = new Set<string>();
  for (const row of filteredRows) {
    const key = row.matchedSlCode || "";
    if (key && !seen.has(key)) {
      seen.add(key);
      const matchedName = seenSlCodes.get(key)![0].matchedName || key;
      groups.push({
        slCode: key,
        label: `${key} · ${matchedName}`,
        rowList: seenSlCodes.get(key)!,
      });
    }
  }
  // Unmatched at bottom
  const unmatched = filteredRows.filter((r) => !r.matchedSlCode);
  if (unmatched.length > 0) {
    groups.push({ slCode: null, label: "Sin match", rowList: unmatched });
  }

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderRow = (row: MultiMatchRowData) => {
    const idx = rows.indexOf(row);
    const resolved = !!selectedMatches[row.rowIndex];
    const isActive = idx === activeIdx;
    const isBulkChecked = bulkSelected.has(row.rowIndex);
    const isNoMatch = !row.matchedSlCode;

    return (
      <button
        key={row.rowIndex}
        type="button"
        onClick={() => onActivate(idx)}
        className={cn(
          "w-full text-left px-3 py-2 border-b border-border/40 transition-colors",
          isActive
            ? "bg-primary/5 border-l-2 border-l-primary"
            : isNoMatch && !resolved
              ? "hover:bg-red-50 dark:hover:bg-red-950/20 border-l-2 border-l-red-400/60"
              : "hover:bg-accent/50 border-l-2 border-l-transparent",
          isBulkChecked && !isActive && "bg-primary/[0.03]",
        )}
      >
        <div className="flex items-start gap-2">
          {!resolved && (
            <button
              type="button"
              onClick={(e) => onToggleBulk(row.rowIndex, e)}
              className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
              aria-label={isBulkChecked ? "Deseleccionar" : "Seleccionar"}
            >
              {isBulkChecked ? (
                <CheckSquare className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {resolved && <div className="w-3.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[11px] text-muted-foreground font-mono">
                #{row.rowIndex}
              </span>
              {resolved ? (
                <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
              ) : isNoMatch ? (
                <span
                  className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0"
                  title="Sin match"
                />
              ) : row.needsReview === "por_definir" ? (
                <span className="h-2 w-2 rounded-full bg-orange-400 flex-shrink-0" />
              ) : row.needsReview === "low_score" ? (
                <span className="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
              )}
            </div>
            <p
              className={cn(
                "text-xs font-medium leading-snug truncate",
                isActive ? "text-foreground" : "text-muted-foreground",
                resolved && "line-clamp-1",
              )}
            >
              {row.nombre}
            </p>
            {!resolved && isNoMatch && (
              <p className="text-[10px] text-red-500 mt-0.5 truncate font-medium">
                Sin match
              </p>
            )}
            {!resolved && !isNoMatch && row.needsReview === "por_definir" && (
              <p className="text-[10px] text-orange-500 mt-0.5 truncate">
                Sin ruta
              </p>
            )}
            {!resolved &&
              !isNoMatch &&
              row.needsReview === "low_score" &&
              row.matchScore !== undefined && (
                <p className="text-[10px] text-red-500 mt-0.5 truncate">
                  {Math.round(row.matchScore * 100)}% match dudoso
                </p>
              )}
            {resolved && (
              <p className="text-[11px] font-bold text-green-600 dark:text-green-400 font-mono mt-0.5">
                ✓ {selectedMatches[row.rowIndex]}
              </p>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="overflow-y-auto flex-1">
      {groups.map((group) => {
        const groupKey = group.slCode ?? "__unmatched__";
        const isCollapsed = collapsedGroups.has(groupKey);
        const resolvedInGroup = group.rowList.filter(
          (r) => !!selectedMatches[r.rowIndex],
        ).length;
        const allResolved = resolvedInGroup === group.rowList.length;
        const isNoMatchGroup = group.slCode === null;

        return (
          <div key={groupKey}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(groupKey)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b border-border/60 transition-colors sticky top-0 z-10",
                isNoMatchGroup
                  ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50"
                  : "bg-muted/80 text-muted-foreground hover:bg-muted",
              )}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-3 w-3 flex-shrink-0" />
              )}
              <span className="flex-1 truncate text-left">{group.label}</span>
              <span
                className={cn(
                  "flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                  allResolved
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : isNoMatchGroup
                      ? "bg-red-500/20 text-red-600 dark:text-red-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                )}
              >
                {resolvedInGroup}/{group.rowList.length}
              </span>
            </button>

            {/* Group rows */}
            {!isCollapsed && group.rowList.map(renderRow)}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export function NovaRowModal({
  rows,
  isOpen,
  selectedMatches,
  onSelect,
  onClose,
}: NovaRowModalProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState<
    "all" | "por_definir" | "low_score" | "user_choice"
  >("all");
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{
    slCode: string;
    fullName: string;
    ruta: string;
    consolidacion: boolean;
  } | null>(null);

  const reviewFilteredRows =
    reviewFilter === "all"
      ? rows
      : rows.filter((r) => r.needsReview === reviewFilter);

  const filteredRows = reviewFilteredRows.filter(
    (row) =>
      !sidebarFilter.trim() ||
      row.nombre.toLowerCase().includes(sidebarFilter.toLowerCase()),
  );

  const countByReason = {
    por_definir: rows.filter((r) => r.needsReview === "por_definir").length,
    low_score: rows.filter((r) => r.needsReview === "low_score").length,
    user_choice: rows.filter((r) => r.needsReview === "user_choice").length,
  };
  const unresolvedFiltered = filteredRows.filter(
    (r) => !selectedMatches[r.rowIndex],
  );
  const allFilteredSelected =
    unresolvedFiltered.length > 0 &&
    unresolvedFiltered.every((r) => bulkSelected.has(r.rowIndex));
  const someFilteredSelected = unresolvedFiltered.some((r) =>
    bulkSelected.has(r.rowIndex),
  );

  const toggleBulk = (rowIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setBulkSelected((prev) => {
        const next = new Set(prev);
        unresolvedFiltered.forEach((r) => next.delete(r.rowIndex));
        return next;
      });
    } else {
      setBulkSelected((prev) => {
        const next = new Set(prev);
        unresolvedFiltered.forEach((r) => next.add(r.rowIndex));
        return next;
      });
    }
  };

  const handleBulkApply = () => {
    if (!bulkConfirm) return;
    bulkSelected.forEach((rowIndex) => {
      onSelect(
        rowIndex,
        bulkConfirm.slCode,
        bulkConfirm.ruta,
        bulkConfirm.consolidacion,
      );
    });
    setBulkSelected(new Set());
    setBulkConfirm(null);
  };

  // When opened or rows change, jump to first unresolved row
  useEffect(() => {
    if (!isOpen || rows.length === 0) return;
    const firstUnresolved = rows.findIndex((r) => !selectedMatches[r.rowIndex]);
    setActiveIdx(firstUnresolved >= 0 ? firstUnresolved : 0);
  }, [isOpen, rows.length]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const activeRow = rows[activeIdx] ?? null;
  const resolvedCount = rows.filter(
    (r) => !!selectedMatches[r.rowIndex],
  ).length;

  const handleSelectAndAdvance = useCallback(
    (
      rowIndex: number,
      slCode: string,
      ruta: string,
      consolidacion: boolean,
      fullName = "",
    ) => {
      if (bulkSelected.size > 0) {
        // Include the current row in the bulk set and show confirmation
        setBulkSelected((prev) => {
          const n = new Set(prev);
          n.add(rowIndex);
          return n;
        });
        setBulkConfirm({ slCode, fullName, ruta, consolidacion });
        return;
      }
      onSelect(rowIndex, slCode, ruta, consolidacion);
      // Auto-advance to next unresolved row
      const nextUnresolved = rows.findIndex(
        (r, i) =>
          i > activeIdx &&
          !selectedMatches[r.rowIndex] &&
          r.rowIndex !== rowIndex,
      );
      if (nextUnresolved >= 0) setActiveIdx(nextUnresolved);
    },
    [rows, activeIdx, selectedMatches, onSelect, bulkSelected.size],
  );

  if (rows.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal — wider to fit sidebar + detail */}
          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Verificar clientes del nova"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="relative pointer-events-auto w-full max-w-7xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
              {/* ── Modal Header ── */}
              <div className="flex-shrink-0 border-b border-border">
                <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold text-foreground">
                      Verificar clientes
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        resolvedCount === rows.length
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {resolvedCount}/{rows.length} resueltos
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                      disabled={activeIdx === 0}
                      className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 transition-colors text-muted-foreground"
                      aria-label="Anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-center">
                      {activeIdx + 1}/{rows.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveIdx((i) => Math.min(rows.length - 1, i + 1))
                      }
                      disabled={activeIdx === rows.length - 1}
                      className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 transition-colors text-muted-foreground"
                      aria-label="Siguiente"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={onClose}
                      className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground ml-1"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* ── Bulk action bar — visible when rows are checked ── */}
                {bulkSelected.size > 0 && (
                  <div className="flex items-center gap-3 px-5 py-2.5 bg-primary/5 border-t border-primary/10">
                    <CheckSquare className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-xs font-semibold text-primary flex-1">
                      {bulkSelected.size} fila
                      {bulkSelected.size !== 1 ? "s" : ""} seleccionada
                      {bulkSelected.size !== 1 ? "s" : ""}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Selecciona un cliente en el panel derecho para asignar a
                      todas
                    </p>
                    <button
                      type="button"
                      onClick={() => setBulkSelected(new Set())}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors flex-shrink-0"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>

              {/* ── Body: sidebar + detail ── */}
              <div className="flex flex-1 min-h-0">
                {/* Left sidebar — row list */}
                <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
                  {/* Review filter tabs */}
                  <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
                    {(
                      [
                        "all",
                        "por_definir",
                        "low_score",
                        "user_choice",
                      ] as const
                    ).map((tab) => {
                      const labels: Record<typeof tab, string> = {
                        all: "Todo",
                        por_definir: "Sin ruta",
                        low_score: "Match dudoso",
                        user_choice: "Múltiple",
                      };
                      const counts: Record<typeof tab, number> = {
                        all: rows.length,
                        ...countByReason,
                      };
                      const dotColors: Record<typeof tab, string> = {
                        all: "bg-amber-400",
                        por_definir: "bg-orange-400",
                        low_score: "bg-red-400",
                        user_choice: "bg-blue-400",
                      };
                      const isActive = reviewFilter === tab;
                      if (tab !== "all" && counts[tab] === 0) return null;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setReviewFilter(tab)}
                          className={cn(
                            "flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold transition-colors border-b-2",
                            isActive
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {tab !== "all" && (
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                dotColors[tab],
                              )}
                            />
                          )}
                          {labels[tab]}
                          <span
                            className={cn(
                              "text-[9px] px-1 py-0.5 rounded-full font-bold",
                              isActive
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {counts[tab]}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sidebar filter + select-all */}
                  <div className="px-2.5 py-2 border-b border-border flex-shrink-0 space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={sidebarFilter}
                        onChange={(e) => setSidebarFilter(e.target.value)}
                        placeholder="Filtrar nombres..."
                        className="w-full h-7 pl-7 pr-2 text-xs bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                      />
                    </div>
                    {/* Select-all row */}
                    {unresolvedFiltered.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2 w-full px-0.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {allFilteredSelected ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        ) : someFilteredSelected ? (
                          <Minus className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        ) : (
                          <Square className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {allFilteredSelected
                            ? "Deseleccionar todo"
                            : `Seleccionar ${unresolvedFiltered.length} pendiente${unresolvedFiltered.length !== 1 ? "s" : ""}`}
                        </span>
                      </button>
                    )}
                  </div>

                  <SidebarGroupedList
                    rows={rows}
                    filteredRows={filteredRows}
                    activeIdx={activeIdx}
                    selectedMatches={selectedMatches}
                    bulkSelected={bulkSelected}
                    onActivate={(idx) => setActiveIdx(idx)}
                    onToggleBulk={toggleBulk}
                  />
                </div>

                {/* Right detail panel */}
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                  {activeRow ? (
                    <RowDetailPanel
                      key={activeRow.rowIndex}
                      row={activeRow}
                      selectedSlCode={selectedMatches[activeRow.rowIndex]}
                      onSelect={handleSelectAndAdvance}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Selecciona una fila
                    </div>
                  )}
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border flex-shrink-0 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  {rows.length - resolvedCount > 0
                    ? `${rows.length - resolvedCount} fila${rows.length - resolvedCount !== 1 ? "s" : ""} pendiente${rows.length - resolvedCount !== 1 ? "s" : ""}`
                    : "✓ Todas las filas resueltas"}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 text-xs"
                >
                  Cerrar
                </Button>
              </div>

              {/* ── Bulk confirmation dialog ── */}
              <AnimatePresence>
                {bulkConfirm && (
                  <motion.div
                    key="bulk-confirm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl"
                  >
                    <motion.div
                      initial={{ scale: 0.93, y: 8 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0.93, y: 8 }}
                      className="bg-card border border-border rounded-xl shadow-xl w-80 p-5 space-y-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <CheckSquare className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Confirmar asignación masiva
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            ¿Asignar{" "}
                            <span className="font-bold text-foreground font-mono">
                              {bulkConfirm.slCode || "el cliente seleccionado"}
                            </span>{" "}
                            a las{" "}
                            <span className="font-bold text-foreground">
                              {bulkSelected.size}
                            </span>{" "}
                            filas marcadas?
                          </p>
                          {bulkConfirm.ruta && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Ruta:{" "}
                              <span className="font-medium text-foreground">
                                {bulkConfirm.ruta}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => setBulkConfirm(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1.5"
                          onClick={handleBulkApply}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Aplicar a {bulkSelected.size} fila
                          {bulkSelected.size !== 1 ? "s" : ""}
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
