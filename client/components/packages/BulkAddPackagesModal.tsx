import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle2,
  ChevronRight,
  Users,
  ClipboardList,
  PackageCheck,
  AlertTriangle,
  Trash2,
  UserCheck,
  UserX,
  ArrowRight,
  Scale,
  MapPin,
  Tag,
  RotateCcw,
  Pencil,
  X,
  Check,
} from "lucide-react";
import {
  CustomerAutocomplete,
  type AutocompleteCustomer,
} from "@/components/customer/CustomerAutocomplete";
import { firebaseApi } from "@/lib/firebase/callable";
import { useCreatePackage } from "@/lib/hooks/queries/usePackages";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/context/ThemeContext";
import { cn } from "@/lib/utils";
import {
  calculatePrice,
  type Country,
  type ShippingType,
  type ItemCategory,
} from "@/lib/utils/pricing";
import {
  findCustomerBySlCode,
  findCustomerMatch,
  type CustomerData,
} from "@/lib/services/customer-matcher";
import {
  searchManifests,
  checkExistingTrackings,
} from "@/lib/firebase/firestore-client";
import { upsertPackagesToManifestDoc } from "@/lib/services/manifest-consolidation-service";
import { ManifestAutocomplete } from "@/components/manifest/ManifestAutocomplete";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BulkStep = "input" | "match" | "confirm";
type FetchStatus =
  | "idle"
  | "loading"
  | "found_ml"
  | "found_col"
  | "not_found"
  | "error"
  | "exists";
type MatchStatus = "idle" | "matching" | "done" | "skipped";
type MatchSource = "slcode" | "name" | "manual" | null;

interface BulkRow {
  id: string;
  trackingNumber: string;
  customer: AutocompleteCustomer | null;
  matchSource: MatchSource;
  weight: number;
  description: string;
  origin: string;
  destination: string;
  manifestType: string;
  permisos: boolean;
  fetchStatus: FetchStatus;
  matchStatus: MatchStatus;
  existsInDb?: boolean;
  mlSlCode?: string;
  mlCustomerName?: string;
  manifestId?: string;
  manifestNumber?: string;
}

// ─── MatchStep component ────────────────────────────────────────────────────────

function MatchStep({
  rows,
  isFetching,
  isDark,
  onRemove,
  onCustomerSelect,
  onRetryRow,
  onSlCodeLookup,
  onNext,
  onBack,
}: {
  rows: BulkRow[];
  isFetching: boolean;
  isDark: boolean;
  onRemove: (id: string) => void;
  onCustomerSelect: (rowId: string, customer: AutocompleteCustomer) => void;
  onRetryRow: (rowId: string, newTracking: string) => Promise<void>;
  onSlCodeLookup: (rowId: string, slCode: string) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [editMode, setEditMode] = useState<Record<string, string | undefined>>(
    {},
  );
  const slTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const startEdit = (rowId: string, current: string) =>
    setEditMode((prev) => ({ ...prev, [rowId]: current }));

  const cancelEdit = (rowId: string) =>
    setEditMode((prev) => {
      const n = { ...prev };
      delete n[rowId];
      return n;
    });

  const confirmEdit = (rowId: string) => {
    const draft = editMode[rowId];
    if (draft !== undefined && draft.trim()) {
      onRetryRow(rowId, draft.trim());
    }
    cancelEdit(rowId);
  };

  const handleSlInput = (rowId: string, value: string) => {
    clearTimeout(slTimers.current[rowId]);
    if (value.trim()) {
      slTimers.current[rowId] = setTimeout(() => {
        onSlCodeLookup(rowId, value.trim());
      }, 3000);
    }
  };

  const matchingRow = rows.find((r) => r.matchStatus === "matching");
  const matchDone = rows.every(
    (r) => r.matchStatus === "done" || r.matchStatus === "skipped",
  );
  const allDone = !isFetching && matchDone;
  const fetched = rows.filter(
    (r) => r.fetchStatus !== "loading" && r.fetchStatus !== "exists",
  ).length;
  const newRowsCount = rows.filter((r) => !r.existsInDb).length;
  const matched = rows.filter(
    (r) => r.matchStatus === "done" || r.matchStatus === "skipped",
  ).length;
  const existingCount = rows.filter((r) => r.existsInDb).length;

  return (
    <div className="space-y-3">
      {/* Existing packages warning banner */}
      {existingCount > 0 && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            isDark
              ? "bg-amber-900/20 border-amber-700 text-amber-300"
              : "bg-amber-50 border-amber-200 text-amber-700",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>
              {existingCount} tracking{existingCount !== 1 ? "s" : ""}
            </strong>{" "}
            ya exist{existingCount !== 1 ? "en" : "e"} en la base de datos y{" "}
            {existingCount !== 1 ? "serán omitidos" : "será omitido"} al
            guardar.
            {newRowsCount > 0 && (
              <>
                {" "}
                Solo se crearán <strong>{newRowsCount}</strong> nuevo
                {newRowsCount !== 1 ? "s" : ""}.
              </>
            )}
          </span>
        </div>
      )}
      {/* Phase progress banner */}
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs",
          isFetching
            ? isDark
              ? "bg-blue-900/20 border-blue-700 text-blue-300"
              : "bg-blue-50 border-blue-200 text-blue-700"
            : !matchDone
              ? isDark
                ? "bg-violet-900/20 border-violet-700 text-violet-300"
                : "bg-violet-50 border-violet-200 text-violet-700"
              : isDark
                ? "bg-emerald-900/20 border-emerald-700 text-emerald-400"
                : "bg-emerald-50 border-emerald-200 text-emerald-700",
        )}
      >
        {!allDone ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="font-medium">
          {isFetching
            ? `Fase 1 — Consultando ML Cargo y Colombia (${fetched}/${newRowsCount})…`
            : !matchDone
              ? `Fase 2 — Matching Nova: ${matchingRow ? matchingRow.trackingNumber : "…"} (${matched}/${newRowsCount})`
              : `Completado — ${rows.filter((r) => r.customer && !r.existsInDb).length}/${newRowsCount} clientes asociados`}
        </span>
      </div>

      <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-1">
        {rows.map((row) => {
          const isLoading = row.fetchStatus === "loading";
          const isFoundML = row.fetchStatus === "found_ml";
          const isFoundCol = row.fetchStatus === "found_col";
          const isNotFound =
            row.fetchStatus === "not_found" || row.fetchStatus === "error";
          const isExistsInDb = row.fetchStatus === "exists";
          const isMatching = row.matchStatus === "matching";
          const isMatchDone =
            row.matchStatus === "done" || row.matchStatus === "skipped";
          const hasCustomer = !!row.customer;

          return (
            <div
              key={row.id}
              className={cn(
                "rounded-xl border transition-all duration-500 overflow-hidden",
                isExistsInDb
                  ? isDark
                    ? "bg-gray-800/50 border-gray-700 opacity-60"
                    : "bg-gray-50/80 border-gray-300 opacity-70"
                  : isLoading
                    ? isDark
                      ? "bg-gray-800 border-gray-600"
                      : "bg-gray-50 border-gray-200"
                    : isFoundML && !isMatchDone
                      ? isDark
                        ? "bg-emerald-950/20 border-emerald-700/50"
                        : "bg-emerald-50/60 border-emerald-200"
                      : isFoundCol && !isMatchDone
                        ? isDark
                          ? "bg-blue-950/20 border-blue-700/50"
                          : "bg-blue-50/60 border-blue-200"
                        : isMatching
                          ? isDark
                            ? "bg-violet-950/20 border-violet-600"
                            : "bg-violet-50/60 border-violet-300"
                          : isMatchDone && hasCustomer
                            ? isDark
                              ? "bg-emerald-950/30 border-emerald-600"
                              : "bg-emerald-50 border-emerald-300"
                            : isMatchDone && !hasCustomer
                              ? isDark
                                ? "bg-amber-950/20 border-amber-700/60"
                                : "bg-amber-50/60 border-amber-300"
                              : isNotFound
                                ? isDark
                                  ? "bg-red-950/20 border-red-700/50"
                                  : "bg-red-50/40 border-red-200"
                                : isDark
                                  ? "bg-gray-800 border-gray-600"
                                  : "bg-white border-gray-200",
              )}
            >
              {/* ── Header row: tracking + source badge + remove ── */}
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                {editMode[row.id] !== undefined ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      value={editMode[row.id] ?? ""}
                      onChange={(e) =>
                        setEditMode((prev) => ({
                          ...prev,
                          [row.id]: e.target.value.toUpperCase(),
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit(row.id);
                        if (e.key === "Escape") cancelEdit(row.id);
                      }}
                      className={cn(
                        "font-mono text-xs h-6 px-2 rounded border w-52 focus:outline-none focus:ring-1 focus:ring-primary",
                        isDark
                          ? "bg-gray-700 border-gray-500 text-white"
                          : "bg-white border-gray-300",
                      )}
                      autoFocus
                      aria-label="Editar tracking"
                    />
                    <button
                      type="button"
                      onClick={() => confirmEdit(row.id)}
                      className="text-emerald-500 hover:text-emerald-600 transition-colors"
                      title="Confirmar y re-consultar"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelEdit(row.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Cancelar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <code
                      className={cn(
                        "text-xs font-mono font-semibold break-all",
                        isDark ? "text-gray-200" : "text-gray-800",
                      )}
                    >
                      {row.trackingNumber}
                    </code>
                    <button
                      type="button"
                      onClick={() => startEdit(row.id, row.trackingNumber)}
                      className="shrink-0 text-muted-foreground/40 hover:text-primary transition-colors"
                      title="Editar tracking y re-consultar"
                      aria-label="Editar tracking"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                  {/* Phase 1 source badge */}
                  {isLoading && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-muted-foreground border-muted-foreground/30 gap-1"
                    >
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> ML Cargo…
                    </Badge>
                  )}
                  {isFoundML && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-700 border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                    >
                      ML Cargo ✓
                    </Badge>
                  )}
                  {isFoundCol && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-blue-700 border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                    >
                      Colombia ✓
                    </Badge>
                  )}
                  {isExistsInDb && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-gray-500 border-gray-400 bg-gray-100 dark:bg-gray-800"
                    >
                      Ya existe · omitido
                    </Badge>
                  )}
                  {row.fetchStatus === "not_found" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-700 border-amber-400"
                    >
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> No
                      encontrado
                    </Badge>
                  )}
                  {row.fetchStatus === "error" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-red-700 border-red-400"
                    >
                      Error
                    </Badge>
                  )}
                  {/* Phase 2 match badge */}
                  {isMatching && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-violet-700 border-violet-400 gap-1"
                    >
                      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Buscando
                      cliente…
                    </Badge>
                  )}
                  {isMatchDone && hasCustomer && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] gap-0.5",
                        row.matchSource === "slcode"
                          ? "text-emerald-700 border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                          : row.matchSource === "name"
                            ? "text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                            : "text-gray-600 border-gray-400",
                      )}
                    >
                      {row.matchSource === "slcode" ? (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      ) : row.matchSource === "name" ? (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      ) : (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      )}
                      {row.matchSource === "slcode"
                        ? "SL code"
                        : row.matchSource === "name"
                          ? "Nombre"
                          : "Manual"}
                    </Badge>
                  )}
                </div>
                {(isNotFound || row.fetchStatus === "error") &&
                  editMode[row.id] === undefined && (
                    <button
                      type="button"
                      onClick={() => onRetryRow(row.id, row.trackingNumber)}
                      className="shrink-0 text-muted-foreground hover:text-blue-500 transition-colors"
                      title="Reintentar consulta"
                      aria-label="Reintentar consulta"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  title="Eliminar"
                  aria-label="Eliminar tracking"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* ── Fields grid: auto-populates as data arrives ── */}
              <div
                className={cn(
                  "grid grid-cols-3 gap-0 border-t text-[11px] transition-all duration-300",
                  isDark ? "border-gray-700" : "border-gray-200",
                )}
              >
                {/* Peso */}
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 border-r",
                    isDark ? "border-gray-700" : "border-gray-200",
                  )}
                >
                  <Scale
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isLoading
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground",
                    )}
                  />
                  {isLoading ? (
                    <span className="h-2.5 w-10 rounded bg-muted-foreground/20 animate-pulse inline-block" />
                  ) : (
                    <span
                      className={cn(
                        "font-semibold transition-all duration-300",
                        row.weight > 0
                          ? isDark
                            ? "text-emerald-300"
                            : "text-emerald-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.weight > 0 ? `${row.weight} kg` : "—"}
                    </span>
                  )}
                </div>

                {/* Origen → Destino */}
                <div
                  className={cn(
                    "flex items-center gap-1 px-3 py-2 border-r",
                    isDark ? "border-gray-700" : "border-gray-200",
                  )}
                >
                  <MapPin
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isLoading
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground",
                    )}
                  />
                  {isLoading ? (
                    <span className="h-2.5 w-16 rounded bg-muted-foreground/20 animate-pulse inline-block" />
                  ) : (
                    <>
                      <span
                        className={cn(
                          "font-medium transition-all duration-300",
                          isLoading
                            ? "text-muted-foreground/40"
                            : isDark
                              ? "text-gray-300"
                              : "text-gray-700",
                        )}
                      >
                        {row.origin || "—"}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                      <span
                        className={cn(
                          "font-medium transition-all duration-300",
                          isLoading
                            ? "text-muted-foreground/40"
                            : isDark
                              ? "text-gray-300"
                              : "text-gray-700",
                        )}
                      >
                        {row.destination || "—"}
                      </span>
                    </>
                  )}
                </div>

                {/* Tipo de manifiesto */}
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <Tag
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isLoading
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground",
                    )}
                  />
                  {isLoading ? (
                    <span className="h-2.5 w-14 rounded bg-muted-foreground/20 animate-pulse inline-block" />
                  ) : (
                    <span
                      className={cn(
                        "transition-all duration-300",
                        isLoading
                          ? "text-muted-foreground/40"
                          : isDark
                            ? "text-gray-300"
                            : "text-gray-600",
                      )}
                    >
                      {row.manifestType === "usa_air"
                        ? "USA Aéreo"
                        : row.manifestType === "usa_sea"
                          ? "USA Marítimo"
                          : row.manifestType === "colombia_air"
                            ? "COL Aéreo"
                            : row.manifestType === "colombia_sea"
                              ? "COL Marítimo"
                              : row.manifestType || "—"}
                    </span>
                  )}
                </div>
              </div>

              {/* Descripción */}
              {(row.description || isLoading) && (
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 border-t text-[11px]",
                    isDark ? "border-gray-700" : "border-gray-200",
                  )}
                >
                  <PackageCheck
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isLoading
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground",
                    )}
                  />
                  {isLoading ? (
                    <span className="h-2.5 w-32 rounded bg-muted-foreground/20 animate-pulse inline-block" />
                  ) : (
                    <span
                      className={cn(
                        "truncate transition-all duration-300",
                        isDark ? "text-gray-300" : "text-gray-600",
                      )}
                    >
                      {row.description || "—"}
                    </span>
                  )}
                </div>
              )}

              {/* ── Customer section ── */}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 border-t",
                  isDark ? "border-gray-700" : "border-gray-200",
                )}
              >
                {isLoading ||
                (row.fetchStatus !== "not_found" &&
                  row.fetchStatus !== "error" &&
                  row.matchStatus === "idle" &&
                  !isFoundML &&
                  !isFoundCol) ? null : row.fetchStatus === "not_found" ||
                  row.fetchStatus === "error" ? (
                  <span className="text-[11px] text-muted-foreground">
                    Sin datos de middleware — asigna cliente manualmente
                  </span>
                ) : null}
                {isExistsInDb && (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 border-t text-[11px] text-muted-foreground",
                      isDark ? "border-gray-700" : "border-gray-200",
                    )}
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Este tracking ya está registrado en el sistema y será
                    omitido.
                  </div>
                )}
                {!isExistsInDb &&
                  (isFoundML || isFoundCol || isMatching || isMatchDone) && (
                    <>
                      {isMatching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500 shrink-0" />
                      ) : hasCustomer ? (
                        <UserCheck
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            row.matchSource === "slcode"
                              ? "text-emerald-500"
                              : "text-blue-500",
                          )}
                        />
                      ) : (
                        <UserX className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      )}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <CustomerAutocomplete
                          value={row.customer?.fullName ?? ""}
                          onChange={() => {}}
                          onCustomerSelect={(c) => onCustomerSelect(row.id, c)}
                          onInputChange={(v) => handleSlInput(row.id, v)}
                          placeholder={
                            isMatching
                              ? "Buscando en Nova…"
                              : "Sin cliente — buscar… o escribe código SL"
                          }
                          className={cn(
                            "text-xs h-7",
                            isDark
                              ? "bg-gray-700 border-gray-600 text-white"
                              : "",
                            isMatching ? "animate-pulse" : "",
                            isMatchDone &&
                              hasCustomer &&
                              row.matchSource === "name"
                              ? "border-amber-400 ring-1 ring-amber-300/50 dark:border-amber-600"
                              : "",
                          )}
                        />
                        {isMatchDone &&
                          hasCustomer &&
                          row.matchSource === "name" && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-0.5">
                              Sugerencia AI · verifica o cambia el cliente
                            </p>
                          )}
                        <p className="text-[10px] text-muted-foreground/60 pl-0.5 leading-none">
                          Escribe un código SL (ej: SL1234) — se asignará en 3 s
                        </p>
                      </div>
                      {hasCustomer && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] shrink-0 font-mono",
                            row.matchSource === "slcode"
                              ? "text-emerald-700 border-emerald-400"
                              : row.matchSource === "name"
                                ? "text-amber-700 border-amber-400"
                                : "text-gray-600 border-gray-400",
                          )}
                        >
                          {row.customer?.slCode}
                        </Badge>
                      )}
                    </>
                  )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="outline" onClick={onBack} disabled={!allDone}>
          Atrás
        </Button>
        <Button onClick={onNext} disabled={!allDone || rows.length === 0}>
          Revisar y confirmar
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

interface BulkAddPackagesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (savedCount: number) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MANIFEST_OPTIONS = [
  { value: "usa_air", label: "USA Aéreo", country: "usa", shipping: "air" },
  { value: "usa_sea", label: "USA Marítimo", country: "usa", shipping: "sea" },
  {
    value: "colombia_air",
    label: "Colombia Aéreo",
    country: "colombia",
    shipping: "air",
  },
  {
    value: "colombia_sea",
    label: "Colombia Marítimo",
    country: "colombia",
    shipping: "sea",
  },
];

const STEPS: { id: BulkStep; label: string; icon: React.ReactNode }[] = [
  {
    id: "input",
    label: "Trackings",
    icon: <ClipboardList className="h-3.5 w-3.5" />,
  },
  { id: "match", label: "Clientes", icon: <Users className="h-3.5 w-3.5" /> },
  {
    id: "confirm",
    label: "Confirmar",
    icon: <PackageCheck className="h-3.5 w-3.5" />,
  },
];

// ─── Helper: CustomerData → AutocompleteCustomer ──────────────────────────────

function toAutocomplete(c: CustomerData): AutocompleteCustomer {
  return {
    id: c.id,
    fullName: c.fullName || c.name,
    slCode: c.slCode,
    email: c.email ?? "",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BulkAddPackagesModal({
  open,
  onOpenChange,
  onComplete,
}: BulkAddPackagesModalProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { toast } = useToast();
  const createPackageMutation = useCreatePackage();

  const [step, setStep] = useState<BulkStep>("input");
  const [trackingInput, setTrackingInput] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [bulkManifest, setBulkManifest] = useState<{
    id: string;
    number: string;
  } | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const handleReset = () => {
    setStep("input");
    setTrackingInput("");
    setRows([]);
    setIsSaving(false);
    setIsFetching(false);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleCustomerSelect = (
    rowId: string,
    customer: AutocompleteCustomer,
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, customer, matchSource: "manual" } : r,
      ),
    );
  };

  // ── Retry: re-fetch + re-match a single row (optionally with a new tracking) ─

  const handleRetryRow = async (rowId: string, newTracking: string) => {
    const upper = newTracking.trim().toUpperCase();
    if (!upper) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              trackingNumber: upper,
              fetchStatus: "loading",
              matchStatus: "idle",
              customer: null,
              matchSource: null,
              weight: 0,
              description: "",
              origin: "MIAMI",
              destination: "CR",
              manifestType: "usa_air",
              permisos: false,
              mlSlCode: undefined,
              mlCustomerName: undefined,
              existsInDb: false,
            }
          : r,
      ),
    );
    try {
      const [mlResult, colResult] = await Promise.allSettled([
        firebaseApi.mlocker.trackPackage(upper),
        firebaseApi.colombia.track(upper),
      ]);
      const mlRaw =
        mlResult.status === "fulfilled"
          ? ((mlResult.value as any)?.data ?? mlResult.value)
          : null;
      const colRaw =
        colResult.status === "fulfilled"
          ? ((colResult.value as any)?.data ?? colResult.value)
          : null;

      let mlSlCode: string | undefined;
      let mlCustomerName: string | undefined;

      if (mlRaw?.found) {
        const dest = mlRaw.destination
          ? String(mlRaw.destination).toUpperCase()
          : mlRaw.destinationFull
            ? String(mlRaw.destinationFull).toUpperCase()
            : "CR";
        mlSlCode = mlRaw.customerCode ? String(mlRaw.customerCode) : undefined;
        mlCustomerName = mlRaw.customerName
          ? String(mlRaw.customerName)
          : undefined;
        let retryManifestId: string | undefined;
        let retryManifestNumber: string | undefined;
        if (mlRaw.manifestId) {
          const mn = String(mlRaw.manifestId).trim();
          const mFound = await searchManifests(mn, 1).catch(() => []);
          retryManifestId = mFound[0]?.id;
          retryManifestNumber = mFound[0]?.manifestNumber ?? mn;
        }
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  trackingNumber: mlRaw.trackingNumber
                    ? String(mlRaw.trackingNumber).toUpperCase()
                    : upper,
                  weight: Number(mlRaw.weight) > 0 ? Number(mlRaw.weight) : 0,
                  description: mlRaw.description
                    ? String(mlRaw.description).toUpperCase()
                    : "",
                  destination: dest,
                  origin: "MIAMI",
                  manifestType: "usa_air",
                  permisos: !!mlRaw.requiresPermit,
                  fetchStatus: "found_ml",
                  matchStatus: "idle",
                  mlSlCode,
                  mlCustomerName,
                  manifestId: retryManifestId,
                  manifestNumber: retryManifestNumber,
                }
              : r,
          ),
        );
      } else if (colRaw?.found) {
        mlSlCode = colRaw.customerCode
          ? String(colRaw.customerCode)
          : undefined;
        mlCustomerName = colRaw.customerName
          ? String(colRaw.customerName)
          : undefined;
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  trackingNumber: colRaw.trackingNumber
                    ? String(colRaw.trackingNumber).toUpperCase()
                    : upper,
                  origin: "BOGOTA",
                  manifestType: "colombia_air",
                  fetchStatus: "found_col",
                  matchStatus: "idle",
                  mlSlCode,
                  mlCustomerName,
                }
              : r,
          ),
        );
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? { ...r, fetchStatus: "not_found", matchStatus: "skipped" }
              : r,
          ),
        );
        return;
      }

      // Phase 2: match customer
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId ? { ...r, matchStatus: "matching" } : r,
        ),
      );
      let matchedCustomer: AutocompleteCustomer | null = null;
      let matchSource: MatchSource = null;
      try {
        if (mlSlCode) {
          const byCode = await findCustomerBySlCode(mlSlCode);
          if (byCode) {
            matchedCustomer = toAutocomplete(byCode);
            matchSource = "slcode";
          }
        }
        if (!matchedCustomer && mlCustomerName) {
          const byName = await findCustomerMatch(mlCustomerName);
          if (byName.bestMatch && byName.bestMatch.score >= 0.65) {
            matchedCustomer = toAutocomplete(byName.bestMatch.customer);
            matchSource = "name";
          }
        }
      } catch {
        /* matching error */
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                customer: matchedCustomer,
                matchSource,
                matchStatus: "done",
              }
            : r,
        ),
      );
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, fetchStatus: "error", matchStatus: "skipped" }
            : r,
        ),
      );
    }
  };

  // ── SL Code auto-assign (3 s debounce from customer input) ──────────────

  const handleSlCodeLookup = async (rowId: string, slCode: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, matchStatus: "matching" } : r)),
    );
    try {
      const found = await findCustomerBySlCode(slCode.trim().toUpperCase());
      if (found) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  customer: toAutocomplete(found),
                  matchSource: "slcode",
                  matchStatus: "done",
                }
              : r,
          ),
        );
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  matchStatus:
                    r.matchStatus === "matching" ? "done" : r.matchStatus,
                }
              : r,
          ),
        );
        toast({
          title: "No encontrado",
          description: `Sin cliente con código ${slCode}`,
          variant: "destructive",
        });
      }
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, matchStatus: "done" } : r)),
      );
    }
  };

  // ── Keep a ref to latest rows to avoid stale closures ───────────────────
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // ── Step 1 — Parse → immediately start fetch+match ─────────────────────

  const handleParseAndFetch = async () => {
    const lines = trackingInput
      .split(/[\n,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const unique = [...new Set(lines)];
    if (!unique.length) return;

    // ── Pre-check: which trackings already exist in the packages collection
    // Run BEFORE going to match step so rows are pre-marked on first render.
    setIsChecking(true);
    const existingSet = await checkExistingTrackings(unique).finally(() =>
      setIsChecking(false),
    );

    const initial: BulkRow[] = unique.map((tn) => {
      const alreadyExists = existingSet.has(tn.toUpperCase());
      return {
        id: tn,
        trackingNumber: tn,
        customer: null,
        matchSource: null,
        weight: 0,
        description: "",
        origin: "MIAMI",
        destination: "CR",
        manifestType: "usa_air",
        permisos: false,
        fetchStatus: alreadyExists ? "exists" : "loading",
        matchStatus: alreadyExists ? "skipped" : "idle",
        existsInDb: alreadyExists,
      };
    });

    setRows(initial);
    setStep("match");
    setIsFetching(true);

    // ── Phase 1: Parallel middleware fetch ──────────────────────────────────
    // Fetch all trackings from ML Cargo + Colombia simultaneously.
    // Store raw slCode/customerName so Phase 2 can run matching.
    await Promise.allSettled(
      initial.map(async (row) => {
        try {
          const [mlResult, colResult] = await Promise.allSettled([
            firebaseApi.mlocker.trackPackage(row.trackingNumber),
            firebaseApi.colombia.track(row.trackingNumber),
          ]);

          const mlRaw =
            mlResult.status === "fulfilled"
              ? ((mlResult.value as any)?.data ?? mlResult.value)
              : null;
          const colRaw =
            colResult.status === "fulfilled"
              ? ((colResult.value as any)?.data ?? colResult.value)
              : null;

          if (mlRaw?.found) {
            const dest = mlRaw.destination
              ? String(mlRaw.destination).toUpperCase()
              : mlRaw.destinationFull
                ? String(mlRaw.destinationFull).toUpperCase()
                : row.destination;

            // Pre-populate manifest from ML data
            let mlManifestId: string | undefined;
            let mlManifestNumber: string | undefined;
            if (mlRaw.manifestId) {
              const mn = String(mlRaw.manifestId).trim();
              const mFound = await searchManifests(mn, 1).catch(() => []);
              mlManifestId = mFound[0]?.id;
              mlManifestNumber = mFound[0]?.manifestNumber ?? mn;
            }

            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      trackingNumber: mlRaw.trackingNumber
                        ? String(mlRaw.trackingNumber).toUpperCase()
                        : r.trackingNumber,
                      weight:
                        Number(mlRaw.weight) > 0 ? Number(mlRaw.weight) : 0,
                      description: mlRaw.description
                        ? String(mlRaw.description).toUpperCase()
                        : "",
                      destination: dest,
                      origin: "MIAMI",
                      manifestType: "usa_air",
                      permisos: !!mlRaw.requiresPermit,
                      fetchStatus: "found_ml",
                      matchStatus: "idle",
                      mlSlCode: mlRaw.customerCode
                        ? String(mlRaw.customerCode)
                        : undefined,
                      mlCustomerName: mlRaw.customerName
                        ? String(mlRaw.customerName)
                        : undefined,
                      manifestId: mlManifestId,
                      manifestNumber: mlManifestNumber,
                    }
                  : r,
              ),
            );
          } else if (colRaw?.found) {
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      trackingNumber: colRaw.trackingNumber
                        ? String(colRaw.trackingNumber).toUpperCase()
                        : r.trackingNumber,
                      origin: "BOGOTA",
                      manifestType: "colombia_air",
                      fetchStatus: "found_col",
                      matchStatus: "idle",
                      mlSlCode: colRaw.customerCode
                        ? String(colRaw.customerCode)
                        : undefined,
                      mlCustomerName: colRaw.customerName
                        ? String(colRaw.customerName)
                        : undefined,
                    }
                  : r,
              ),
            );
          } else {
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? { ...r, fetchStatus: "not_found", matchStatus: "skipped" }
                  : r,
              ),
            );
          }
        } catch {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, fetchStatus: "error", matchStatus: "skipped" }
                : r,
            ),
          );
        }
      }),
    );

    setIsFetching(false);

    // ── Phase 2: Sequential Nova customer matching ──────────────────────────
    // After all middleware data is visible, match customers one by one.
    const snapshot = rowsRef.current;
    for (const row of snapshot) {
      if (row.matchStatus === "skipped" || row.existsInDb) continue;
      if (!row.mlSlCode && !row.mlCustomerName) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, matchStatus: "skipped" } : r,
          ),
        );
        continue;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, matchStatus: "matching" } : r,
        ),
      );

      let matchedCustomer: AutocompleteCustomer | null = null;
      let matchSource: MatchSource = null;

      try {
        if (row.mlSlCode) {
          const byCode = await findCustomerBySlCode(row.mlSlCode);
          if (byCode) {
            matchedCustomer = toAutocomplete(byCode);
            matchSource = "slcode";
          }
        }
        if (!matchedCustomer && row.mlCustomerName) {
          const byName = await findCustomerMatch(row.mlCustomerName);
          if (byName.bestMatch && byName.bestMatch.score >= 0.65) {
            matchedCustomer = toAutocomplete(byName.bestMatch.customer);
            matchSource = "name";
          }
        }
      } catch {
        /* matching error — leave customer null */
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                customer: matchedCustomer,
                matchSource,
                matchStatus: "done",
              }
            : r,
        ),
      );
    }
  };

  // ── Inline edit helper ───────────────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // ── Confirm & save ───────────────────────────────────────────────────────

  const handleConfirm = async () => {
    const toCreate = rows.filter((r) => r.customer && !r.existsInDb);
    if (!toCreate.length) {
      toast({
        title: "Sin clientes asignados",
        description: "Asigna al menos un cliente antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    let saved = 0;
    let failed = 0;

    for (const row of toCreate) {
      try {
        const option = MANIFEST_OPTIONS.find(
          (o) => o.value === row.manifestType,
        );
        const computedPrice =
          option && row.weight > 0
            ? calculatePrice(
                row.weight,
                option.country as Country,
                option.shipping as ShippingType,
                "regular" as ItemCategory,
                row.permisos,
              )
            : null;

        await createPackageMutation.mutateAsync({
          trackingNumber: row.trackingNumber,
          type: row.manifestType.includes("sea") ? "sea" : "air",
          category: "regular",
          customerName: row.customer!.fullName,
          customerId: row.customer!.id,
          slCode: row.customer!.slCode ?? "",
          weight: row.weight,
          status: "customs" as any,
          flagStatus: "normal",
          origin: row.origin,
          destination: row.destination,
          routeId: "",
          ruta: row.customer!.ruta ?? "",
          description: row.description,
          manifestType: row.manifestType,
          permisos: row.permisos,
          ...(computedPrice && !computedPrice.quoteRequired
            ? { calculatedCost: computedPrice.price }
            : {}),
          ...(row.manifestNumber ? { manifestNumber: row.manifestNumber } : {}),
        } as any);
        saved++;
      } catch {
        failed++;
      }
    }

    // ── Update manifest docs with newly created packages ────────────────────
    const byManifest = new Map<string, typeof toCreate>();
    for (const row of toCreate) {
      if (!row.manifestNumber) continue;
      const existing = byManifest.get(row.manifestNumber) ?? [];
      existing.push(row);
      byManifest.set(row.manifestNumber, existing);
    }
    await Promise.allSettled(
      Array.from(byManifest.entries()).map(([manifestNumber, pkgRows]) =>
        upsertPackagesToManifestDoc(
          manifestNumber,
          pkgRows.map((r) => ({
            tracking: r.trackingNumber,
            slCode: r.customer?.slCode ?? "",
            customerName: r.customer?.fullName ?? "",
            customerEmail: r.customer?.email ?? "",
            ruta: r.customer?.ruta ?? "",
            weight: r.weight,
            description: r.description,
            permisos: r.permisos,
          })),
        ),
      ),
    );

    setIsSaving(false);

    toast({
      title: `${saved} paquete${saved !== 1 ? "s" : ""} creado${saved !== 1 ? "s" : ""}`,
      description:
        failed > 0
          ? `${failed} paquete${failed !== 1 ? "s" : ""} no se pudieron crear.`
          : "Todos los paquetes fueron creados exitosamente.",
      variant: failed > 0 ? "destructive" : "default",
    });

    if (saved > 0) {
      handleReset();
      onOpenChange(false);
      onComplete?.(saved);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleReset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          "max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] sm:max-w-[95vw] sm:max-h-[90vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border",
          isDark ? "bg-gray-800 border-gray-700 text-white" : "",
        )}
      >
        <DialogHeader className="shrink-0 pb-4 border-b">
          <DialogTitle className="text-lg font-bold">Carga Masiva de Paquetes</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Ingresa los trackings — el sistema consulta ML Cargo y Colombia
            automáticamente y asigna el cliente.
          </DialogDescription>
        </DialogHeader>

        {/* ── Stepper ── */}
        <div className="flex items-center my-4 shrink-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  i < stepIndex
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : i === stepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  s.icon
                )}
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight
                  className={cn(
                    "h-4 w-4 mx-1 shrink-0",
                    i < stepIndex
                      ? "text-emerald-500"
                      : "text-muted-foreground",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0">
          {/* ── Step 1: Input trackings ── */}
        {step === "input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pega o escribe los trackings — uno por línea, o separados por coma
              o punto y coma. El sistema consultará ML Cargo y Colombia en
              paralelo y asociará el cliente automáticamente.
            </p>
            <Textarea
              placeholder={
                "TBA123456789000\nTBA987654321000\n1Z999AA10123456784"
              }
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              className={cn(
                "h-52 font-mono text-sm resize-none",
                isDark ? "bg-gray-700 border-gray-600" : "",
              )}
              aria-label="Lista de trackings"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {trackingInput.split(/[\n,;]+/).filter((s) => s.trim()).length}{" "}
                tracking(s)
              </span>
              <Button
                onClick={handleParseAndFetch}
                disabled={!trackingInput.trim() || isChecking}
                className="gap-1.5"
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {isChecking ? "Verificando…" : "Consultar y asociar"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Auto-fetch + customer match ── */}
        {step === "match" && (
          <MatchStep
            rows={rows}
            isFetching={isFetching}
            isDark={isDark}
            onRemove={handleRemoveRow}
            onCustomerSelect={handleCustomerSelect}
            onRetryRow={handleRetryRow}
            onSlCodeLookup={handleSlCodeLookup}
            onNext={() => setStep("confirm")}
            onBack={() => setStep("input")}
          />
        )}

        {/* ── Step 3: Confirm with inline edit ── */}
        {step === "confirm" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Revisa y ajusta los datos. Se crearán{" "}
              <strong>{rows.filter((r) => r.customer).length}</strong>{" "}
              paquete(s).
            </p>

            {/* ── Bulk manifest assign ── */}
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2",
                isDark
                  ? "bg-gray-800/60 border-gray-700"
                  : "bg-gray-50 border-gray-200",
              )}
            >
              <span className="text-xs text-muted-foreground shrink-0">
                Manifiesto para todos:
              </span>
              <div className="flex-1 max-w-[200px]">
                <ManifestAutocomplete
                  value={bulkManifest?.number ?? ""}
                  onChange={(id, number) => setBulkManifest({ id, number })}
                  isDark={isDark}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                disabled={!bulkManifest}
                onClick={() => {
                  if (!bulkManifest) return;
                  setRows((prev) =>
                    prev.map((r) => ({
                      ...r,
                      manifestId: bulkManifest.id,
                      manifestNumber: bulkManifest.number,
                    })),
                  );
                }}
              >
                Aplicar a todos
              </Button>
            </div>

            <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead
                  className={cn(
                    "sticky top-0 z-10",
                    isDark
                      ? "bg-gray-700 text-gray-300"
                      : "bg-gray-50 text-gray-500",
                  )}
                >
                  <tr>
                    <th className="text-left px-3 py-2 font-medium border-b border-border">
                      Tracking
                    </th>
                    <th className="text-left px-3 py-2 font-medium border-b border-border">
                      Cliente
                    </th>
                    <th className="text-left px-3 py-2 font-medium border-b border-border w-20">
                      Peso (kg)
                    </th>
                    <th className="text-left px-3 py-2 font-medium border-b border-border w-36">
                      Descripción
                    </th>
                    <th className="text-left px-3 py-2 font-medium border-b border-border">
                      Tipo
                    </th>
                    <th className="text-left px-3 py-2 font-medium border-b border-border w-40">
                      Manifiesto
                    </th>
                    <th className="text-left px-3 py-2 font-medium border-b border-border">
                      Fuente
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border last:border-0",
                        !row.customer && "opacity-50",
                        isDark ? "hover:bg-gray-700/40" : "hover:bg-gray-50/80",
                      )}
                    >
                      <td className="px-3 py-2 font-mono">
                        {row.trackingNumber}
                      </td>
                      <td className="px-3 py-2">
                        {row.customer ? (
                          <span className="font-medium">
                            {row.customer.fullName?.toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.weight || ""}
                          onChange={(e) =>
                            updateRow(row.id, {
                              weight: parseFloat(e.target.value) || 0,
                            })
                          }
                          className={cn(
                            "h-7 w-20 text-xs px-2",
                            isDark ? "bg-gray-700 border-gray-600" : "",
                          )}
                          aria-label={`Peso ${row.trackingNumber}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.description}
                          onChange={(e) =>
                            updateRow(row.id, {
                              description: e.target.value.toUpperCase(),
                            })
                          }
                          className={cn(
                            "h-7 w-36 text-xs px-2",
                            isDark ? "bg-gray-700 border-gray-600" : "",
                          )}
                          placeholder="Descripción"
                          aria-label={`Descripción ${row.trackingNumber}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.manifestType}
                          onChange={(e) =>
                            updateRow(row.id, { manifestType: e.target.value })
                          }
                          className={cn(
                            "h-7 rounded border text-xs px-1.5 w-32",
                            isDark
                              ? "bg-gray-700 border-gray-600 text-white"
                              : "bg-white border-gray-300 text-gray-900",
                          )}
                          aria-label={`Tipo manifiesto ${row.trackingNumber}`}
                        >
                          {MANIFEST_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <ManifestAutocomplete
                          value={row.manifestNumber ?? ""}
                          onChange={(id, number) =>
                            updateRow(row.id, {
                              manifestId: id,
                              manifestNumber: number,
                            })
                          }
                          isDark={isDark}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {row.fetchStatus === "found_ml" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-emerald-600 border-emerald-300"
                          >
                            ML
                          </Badge>
                        )}
                        {row.fetchStatus === "found_col" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-blue-600 border-blue-300"
                          >
                            COL
                          </Badge>
                        )}
                        {row.fetchStatus === "not_found" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-amber-600 border-amber-300"
                          >
                            Manual
                          </Badge>
                        )}
                        {row.fetchStatus === "error" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-red-600 border-red-300"
                          >
                            Error
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" onClick={() => setStep("match")}>
                Atrás
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isSaving || !rows.some((r) => r.customer)}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creando paquetes…
                  </>
                ) : (
                  <>
                    <PackageCheck className="h-4 w-4 mr-1.5" />
                    Confirmar y Crear
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
