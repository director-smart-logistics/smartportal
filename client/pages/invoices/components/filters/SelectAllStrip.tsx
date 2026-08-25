import React from "react";
import { CheckSquare, Square, MinusSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { type Invoice } from "../../types";

interface SelectAllStripProps {
  allPageSelected: boolean;
  somePageSelected: boolean;
  toggleSelectAll: () => void;
  manifestFilter: string;
  displayedFilteredInvoices: Invoice[];
  setSelectedIds: (update: React.SetStateAction<Set<string>>) => void;
  groupBy: string;
  pageIndex: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  setPageIndex: (index: number) => void;
  totalPages: number;
}

export function SelectAllStrip({
  allPageSelected,
  somePageSelected,
  toggleSelectAll,
  manifestFilter,
  displayedFilteredInvoices,
  setSelectedIds,
  groupBy,
  pageIndex,
  pageSize,
  setPageSize,
  setPageIndex,
  totalPages,
}: SelectAllStripProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 md:py-1.5 border-b border-border bg-muted/20 flex-wrap" role="row">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSelectAll}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label={allPageSelected ? 'Deseleccionar página' : 'Seleccionar página'}
          data-testid="select-all-checkbox"
        >
          {allPageSelected
            ? <CheckSquare className="h-4 w-4 text-primary" />
            : somePageSelected
              ? <MinusSquare className="h-4 w-4 text-primary" />
              : <Square className="h-4 w-4" />}
        </button>
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
          {allPageSelected ? 'Toda la página' : 'Seleccionar'}
        </span>
      </div>
      {manifestFilter !== 'all' && displayedFilteredInvoices.length > 0 && (
        <button
          type="button"
          onClick={() => setSelectedIds(new Set(displayedFilteredInvoices.map(i => i.id)))}
          className="ml-0 md:ml-2 inline-flex items-center h-5 px-2 rounded border border-primary/50 text-[10px] text-primary font-medium hover:bg-primary/10 transition-colors"
          data-testid="select-all-manifest-btn"
        >
          Seleccionar todo el manifiesto ({displayedFilteredInvoices.length})
        </button>
      )}

      {/* Top pagination strip */}
      {groupBy === 'none' && displayedFilteredInvoices.length > 0 && (
        <div className="ml-auto w-full md:w-auto flex items-center justify-end gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {pageIndex * pageSize + 1}–{Math.min((pageIndex + 1) * pageSize, displayedFilteredInvoices.length)} / {displayedFilteredInvoices.length}
          </span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPageIndex(0); }}
            className="h-6 px-1.5 text-[10px] border border-border rounded bg-background text-foreground"
            aria-label="Filas por página"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={999999}>Todos</option>
          </select>
          <button
            type="button"
            onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0}
            className="h-6 w-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
            disabled={pageIndex >= totalPages - 1}
            className="h-6 w-6 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
