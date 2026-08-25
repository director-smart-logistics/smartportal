/**
 * ManifestPicker
 *
 * Shared, reusable 3-column manifest picker component.
 * Columns: Regulares | Permisos | MEGA-MAN
 *
 * Features:
 * - Typeahead search for fast manifest lookup
 * - Per-column select-all with indeterminate state
 * - Package count badges per manifest
 * - Sorted newest → oldest by default
 *
 * Usage:
 *   <ManifestPicker
 *     allManifestNumbers={manifests}
 *     selectedManifests={selected}
 *     onManifestsChange={setSelected}
 *     manifestPackageCounts={countMap}
 *   />
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  Layers,
  X,
  ChevronDown,
  Shield,
  Truck,
  Package,
  Ship,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── Category types ──────────────────────────────────────────────────────────────

export type ManifestCategory = 'regular' | 'permit' | 'mega' | 'sea';

const CATEGORY_META: Record<ManifestCategory, {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  headerColor: string;
}> = {
  regular: {
    label: 'Regulares',
    Icon: Package,
    emptyLabel: 'Sin manifiestos regulares',
    headerColor: 'text-blue-700 dark:text-blue-300',
  },
  permit: {
    label: 'Permisos',
    Icon: Shield,
    emptyLabel: 'Sin manifiestos de permiso',
    headerColor: 'text-orange-700 dark:text-orange-300',
  },
  mega: {
    label: 'MEGA-MAN',
    Icon: Truck,
    emptyLabel: 'Sin manifiestos MEGA',
    headerColor: 'text-purple-700 dark:text-purple-300',
  },
  sea: {
    label: 'Marítimos',
    Icon: Ship,
    emptyLabel: 'Sin manifiestos marítimos',
    headerColor: 'text-emerald-700 dark:text-emerald-300',
  },
};

const COLUMN_ORDER: ManifestCategory[] = ['regular', 'permit', 'mega', 'sea'];

// ── Default classifier ──────────────────────────────────────────────────────────

/**
 * Default manifest classifier. Override via the `classifyManifest` prop
 * if your naming convention is different.
 */
function defaultClassifier(manifestNumber: string): ManifestCategory {
  const upper = manifestNumber.toUpperCase().trim();

  // MEGA-MAN prefix / sub-string (covers MEGA-MAN, ENC-MEGA-MAN, SL-MEGA-MAN, etc.)
  if (upper.includes('MEGA-MAN') || upper.includes('MEGA_MAN') || upper.startsWith('SL-MEGA-MAN')) return 'mega';

  // Maritime / Sea manifests
  if (
    upper.startsWith('SM-') ||
    upper.startsWith('SM_') ||
    upper.includes('MIA_SEA') ||
    upper.includes('MARITIMO') ||
    upper.includes('MARITIMA') ||
    upper.endsWith('_SEA') ||
    upper.endsWith('-SEA') ||
    upper.endsWith('_USA')
  ) return 'sea';

  // DANP / PERMISOS → permit
  if (
    /DANP$/i.test(upper) ||
    /DANP[^A-Z]/i.test(upper) ||
    /PERMISOS/i.test(upper) ||
    /PERMIT/i.test(upper)
  ) return 'permit';

  return 'regular';
}

// ── Props ───────────────────────────────────────────────────────────────────────

export interface ManifestPickerProps {
  /** Full list of manifest numbers available for selection */
  allManifestNumbers: string[];
  /** Currently selected manifest numbers — empty = all manifests */
  selectedManifests: Set<string>;
  /** Callback when the selection changes */
  onManifestsChange: (v: Set<string>) => void;
  /** Optional package count per manifest for display */
  manifestPackageCounts?: Map<string, number>;
  /** Optional custom manifest classifier function */
  classifyManifest?: (manifestNumber: string) => ManifestCategory;
  /** Label shown when nothing is selected */
  allLabel?: string;
  /** Popover alignment */
  align?: 'start' | 'center' | 'end';
  /** Additional className for the trigger button */
  triggerClassName?: string;
  /** Unique ID for accessibility */
  id?: string;
  /** If true, only one manifest can be selected at a time */
  singleSelect?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────────

export function ManifestPicker({
  allManifestNumbers,
  selectedManifests,
  onManifestsChange,
  manifestPackageCounts,
  classifyManifest = defaultClassifier,
  allLabel = 'Todos los manifiestos',
  align = 'start',
  triggerClassName,
  id = 'manifest-picker',
  singleSelect = false,
}: ManifestPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Normalize selectedManifests to trimmed strings
  const trimmedSelected = useMemo(() => {
    const next = new Set<string>();
    selectedManifests.forEach(m => {
      if (typeof m === 'string') next.add(m.trim());
    });
    return next;
  }, [selectedManifests]);

  // Deduplicate and trim all manifest numbers, sorted newest -> oldest by date
  const uniqueManifestsList = useMemo(() => {
    const list = Array.from(new Set((allManifestNumbers || []).map(m => (m || '').trim()).filter(Boolean)));
    
    const parseManifestDate = (m: string): number => {
      // Matches DD-MM-YYYY
      const match = m.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (match) {
        const [, dd, mm, yyyy] = match;
        return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
      }
      // Matches YYYY-MM-DD
      const matchIso = m.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (matchIso) {
        const [, yyyy, mm, dd] = matchIso;
        return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
      }
      return 0;
    };

    return list.sort((a, b) => {
      const da = parseManifestDate(a);
      const db = parseManifestDate(b);
      if (da !== db) return db - da; // Descending order (newest first)
      return b.localeCompare(a);     // Tie-breaker fallback
    });
  }, [allManifestNumbers]);

  // Normalize package counts to trimmed manifest numbers
  const cleanPackageCounts = useMemo(() => {
    const next = new Map<string, number>();
    if (manifestPackageCounts) {
      manifestPackageCounts.forEach((val, key) => {
        if (key) next.set(key.trim(), val);
      });
    }
    return next;
  }, [manifestPackageCounts]);

  const hasFilter = trimmedSelected.size > 0;

  /** Categorize manifests into four groups */
  const categorized = useMemo(() => {
    const groups: Record<ManifestCategory, string[]> = { regular: [], permit: [], mega: [], sea: [] };
    for (const m of uniqueManifestsList) {
      groups[classifyManifest(m)].push(m);
    }
    return groups;
  }, [uniqueManifestsList, classifyManifest]);

  /** Filtered and sliced manifests per category based on typeahead search */
  const filteredCategorized = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: Record<ManifestCategory, string[]> = { regular: [], permit: [], mega: [], sea: [] };
    for (const cat of COLUMN_ORDER) {
      if (!q) {
        // Default: display only the top 10 most recent manifests
        result[cat] = categorized[cat].slice(0, 10);
      } else {
        // Searching: filter through the full list of manifests
        result[cat] = categorized[cat].filter(m => m.toLowerCase().includes(q));
      }
    }
    return result;
  }, [categorized, search]);

  /** Toggle a single manifest */
  const toggleManifest = (mf: string) => {
    if (singleSelect) {
      const next = new Set<string>();
      if (!trimmedSelected.has(mf)) next.add(mf);
      onManifestsChange(next);
      setOpen(false); // Close popover on selection in single select mode
      return;
    }
    const next = new Set<string>();
    selectedManifests.forEach(m => {
      if (typeof m === 'string') next.add(m.trim());
    });
    if (next.has(mf)) next.delete(mf);
    else next.add(mf);
    onManifestsChange(next);
  };

  /** Toggle an entire category (filtered items only) */
  const toggleCategory = (cat: ManifestCategory) => {
    if (singleSelect) return;
    const items = filteredCategorized[cat];
    if (items.length === 0) return;
    const next = new Set<string>();
    selectedManifests.forEach(m => {
      if (typeof m === 'string') next.add(m.trim());
    });
    const allSelected = items.every(m => next.has(m));
    if (allSelected) {
      items.forEach(m => next.delete(m));
    } else {
      items.forEach(m => next.add(m));
    }
    onManifestsChange(next);
  };

  /** Clear all selections */
  const clearSelection = () => onManifestsChange(new Set());

  /** Trigger label */
  const triggerLabel = hasFilter
    ? trimmedSelected.size === 1
      ? Array.from(trimmedSelected)[0]
      : `${trimmedSelected.size} manifiestos`
    : allLabel;

  /** Reset search when popover closes */
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          id={id}
          className={cn(
            'h-8 shrink-0 inline-flex items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-normal text-foreground shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring',
            hasFilter && 'border-2 border-red-600 bg-red-600/10 text-red-700 dark:text-red-300 font-bold shadow-sm',
            triggerClassName,
          )}
        >
          <Layers className="h-3.5 w-3.5 mr-1 text-current shrink-0 opacity-90" aria-hidden />
          <span className={cn('truncate font-bold', !hasFilter && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            {hasFilter && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpiar filtro de manifiestos"
                onClick={(e) => { e.stopPropagation(); clearSelection(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); clearSelection(); } }}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-3 w-3 text-current" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-current opacity-85 shrink-0" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[95vw] sm:max-w-none sm:min-w-[740px] p-0 overflow-hidden z-[9999]" align={align} sideOffset={6}>
        {/* Typeahead search */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar manifiesto…"
              className="w-full h-7 pl-7 pr-7 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* 4-column grid with horizontal scroll on mobile */}
        <div className="overflow-x-auto">
          <div className="grid grid-cols-4 divide-x min-h-[200px] min-w-[700px] sm:min-w-0">
            {COLUMN_ORDER.map(cat => {
              const meta = CATEGORY_META[cat];
              const allItems = categorized[cat];
              const items = filteredCategorized[cat];
              const catSelected = items.filter(m => trimmedSelected.has(m)).length;
              const allCatSelected = items.length > 0 && catSelected === items.length;

              return (
                <div key={cat} className="flex flex-col">
                  <div
                    role="button"
                    tabIndex={singleSelect ? -1 : 0}
                    onClick={() => !singleSelect && toggleCategory(cat)}
                    onKeyDown={(e) => {
                      if (!singleSelect && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        toggleCategory(cat);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 border-b bg-muted/30 transition-colors sticky top-0 outline-none select-none",
                      !singleSelect && "hover:bg-muted/60 cursor-pointer focus-visible:bg-muted/60"
                    )}
                  >
                    {!singleSelect && (
                      <Checkbox
                        checked={allCatSelected ? true : catSelected > 0 ? 'indeterminate' : false}
                        className="pointer-events-none"
                        tabIndex={-1}
                      />
                    )}
                    <meta.Icon className={cn('h-3.5 w-3.5 shrink-0', meta.headerColor)} aria-hidden />
                    <span className={cn('text-xs font-bold', meta.headerColor)}>{meta.label}</span>
                    <Badge variant="secondary" className="text-[8px] h-4 px-1 ml-auto">
                      {search ? `${items.length}/${allItems.length}` : allItems.length}
                    </Badge>
                  </div>

                  {/* Manifest list */}
                  <div className="overflow-y-auto max-h-[300px] flex-1">
                    {items.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground px-3 py-6">
                        {search ? 'Sin coincidencias' : meta.emptyLabel}
                      </div>
                    ) : (
                      items.map(mf => {
                        const isChecked = trimmedSelected.has(mf);
                        const count = cleanPackageCounts.get(mf) ?? 0;
                        return (
                          <div
                            key={mf}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleManifest(mf)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleManifest(mf);
                              }
                            }}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-all cursor-pointer outline-none select-none border-l-2 border-transparent',
                              'hover:bg-muted/50 focus-visible:bg-muted/50',
                              isChecked && 'bg-red-500/10 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-bold border-red-600',
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              className="pointer-events-none shrink-0"
                              tabIndex={-1}
                            />
                            <span className="font-mono text-[11px] flex-1 text-left truncate">{mf}</span>
                            <span className="text-muted-foreground text-[10px] shrink-0 tabular-nums">
                              {count} paq.
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
