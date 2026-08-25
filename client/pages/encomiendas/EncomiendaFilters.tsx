import { Search, X, ChevronDown, ChevronRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EncomiendaManifestRow } from "@/lib/services/manifest-processor";
import { ManifestPicker } from "@/components/manifest/ManifestPicker";
import type { ManifestCategory } from "@/components/manifest/ManifestPicker";

// ── Classifier for encomienda manifests ───────────────────────────────────────
function classifyEncomiendaManifest(manifestNumber: string): ManifestCategory {
  const upper = manifestNumber.toUpperCase().trim();
  if (upper.includes("MEGA-MAN") || upper.includes("MEGA_MAN") || upper.startsWith("SL-MEGA-MAN")) return "mega";
  if (
    /DANP$/i.test(upper) ||
    /DANP[^A-Z]/i.test(upper) ||
    /PERMISOS/i.test(upper) ||
    /PERMIT/i.test(upper)
  )
    return "permit";
  return "regular";
}

export interface EncomiendaFiltersProps {
  manifestMap: Map<string, EncomiendaManifestRow[]>;
  selectedManifests: Set<string>;
  setSelectedManifests: (v: Set<string>) => void;
  search: string;
  setSearch: (s: string) => void;
  filterPending: boolean;
  setFilterPending: (v: boolean | ((prev: boolean) => boolean)) => void;
  allOpen: boolean | null;
  setAllOpen: (v: boolean | null | ((prev: boolean | null) => boolean | null)) => void;
}

export function EncomiendaFilters({
  manifestMap,
  selectedManifests,
  setSelectedManifests,
  search,
  setSearch,
  filterPending,
  setFilterPending,
  allOpen,
  setAllOpen,
}: EncomiendaFiltersProps) {
  const allManifestNumbers = Array.from(manifestMap.keys()).sort((a, b) => {
    const aDate = manifestMap.get(a)?.[0]?.savedAt ?? "";
    const bDate = manifestMap.get(b)?.[0]?.savedAt ?? "";
    return bDate.localeCompare(aDate);
  });

  const manifestPackageCounts = new Map<string, number>(
    allManifestNumbers.map((m) => [m, manifestMap.get(m)?.length ?? 0])
  );

  const hasActiveFilters =
    selectedManifests.size > 0 || !!search || filterPending;

  return (
    <>
      {/* Manifest picker — 3-column, single-select */}
      <ManifestPicker
        allManifestNumbers={allManifestNumbers}
        selectedManifests={selectedManifests}
        onManifestsChange={setSelectedManifests}
        manifestPackageCounts={manifestPackageCounts}
        classifyManifest={classifyEncomiendaManifest}
        allLabel="Todos los manifiestos"
        singleSelect
        triggerClassName="w-56"
        id="encomienda-manifest-picker"
      />

      {/* Text search */}
      <div className="relative flex-1 min-w-48 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Nombre, SL code, DNI, tracking…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filter: sin cliente / temp customer */}
      <button
        type="button"
        onClick={() => setFilterPending((v) => !v)}
        title={filterPending ? "Mostrar todos los clientes" : "Filtrar clientes sin SL o temporales"}
        className={cn(
          "h-8 inline-flex items-center gap-1.5 px-3 rounded-md border text-xs font-medium shrink-0 transition-colors",
          filterPending
            ? "bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300"
            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Sin cliente
        {filterPending && (
          <span className="ml-0.5 text-[9px] font-bold bg-amber-500 text-white rounded-full px-1 py-px leading-none">
            ON
          </span>
        )}
      </button>

      {/* Collapse / Expand all */}
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs gap-1.5 shrink-0"
        onClick={() => setAllOpen((v) => (v === false ? true : false))}
        title={allOpen === false ? "Expandir todos los manifiestos" : "Colapsar todos los manifiestos"}
      >
        {allOpen === false ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {allOpen === false ? "Expandir" : "Colapsar"}
      </Button>

      {/* Active filter chip */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => {
            setSelectedManifests(new Set());
            setSearch("");
            setFilterPending(false);
          }}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-full px-2 py-0.5 shrink-0"
        >
          <X className="h-2.5 w-2.5" />
          Limpiar filtros
        </button>
      )}
    </>
  );
}
