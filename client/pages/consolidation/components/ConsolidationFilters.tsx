/**
 * ConsolidationFilters
 *
 * Filter bar for the consolidation module.
 * Search + ManifestPicker (shared 3-column) + groupBy toggle + stats.
 */

import React from 'react';
import {
  Search,
  FileText,
  X,
} from 'lucide-react';
import { isPermitManifest } from './manifest-utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ManifestPicker, type ManifestCategory } from '@/components/manifest/ManifestPicker';

export type GroupByMode = 'customer' | 'manifest' | 'kanban';
export type InvoiceStatusFilter = '__all__' | 'draft' | 'sent' | 'paid' | 'annulled' | 'uninvoiced';

export interface ConsolidationFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  /** Set of selected manifest numbers — empty = all manifests */
  selectedManifests: Set<string>;
  onManifestsChange: (v: Set<string>) => void;
  allManifestNumbers: string[];
  /** Package count per manifest for display */
  manifestPackageCounts?: Map<string, number>;
  groupBy: GroupByMode;
  onGroupByChange: (v: GroupByMode) => void;
}

/** Classify a manifest number using the consolidation-specific rules */
function classifyManifest(m: string): ManifestCategory {
  const upper = m.toUpperCase().trim();
  if (upper.includes('MEGA-MAN') || upper.includes('MEGA_MAN') || upper.startsWith('SL-MEGA-MAN')) return 'mega';
  if (isPermitManifest(m)) return 'permit';
  return 'regular';
}

export function ConsolidationFilters({
  search,
  onSearchChange,
  selectedManifests,
  onManifestsChange,
  allManifestNumbers,
  manifestPackageCounts,
  groupBy,
  onGroupByChange,
}: ConsolidationFiltersProps) {
  return (
    <div className="px-3 sm:px-6 py-3 border-b border-border bg-card/50 space-y-2">
      {/* ── Row 1: Search + Manifest picker on same row ────────────────── */}
      <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Input
            id="consolidation-search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar tracking, cliente, nombre…"
            className="pl-8 h-8 text-xs w-full"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Manifest picker — shared component */}
        <div className="w-full sm:w-auto shrink-0">
          <ManifestPicker
            id="consolidation-manifest-filter"
            allManifestNumbers={allManifestNumbers}
            selectedManifests={selectedManifests}
            onManifestsChange={onManifestsChange}
            manifestPackageCounts={manifestPackageCounts}
            classifyManifest={classifyManifest}
          />
        </div>
      </div>
    </div>
  );
}

