import React, { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown, Check, Layers, FileText, Box, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ManifestPicker, type ManifestCategory } from '@/components/manifest/ManifestPicker';

export type GroupByMode = 'customer' | 'service' | 'invoiceStatus';

// ── Invoice status options ─────────────────────────────────────────────────────
export const INVOICE_STATUS_OPTIONS = [
  { value: 'draft',     label: 'Borrador' },
  { value: 'pending',   label: 'Pendiente' },
  { value: 'sent',      label: 'Enviada' },
  { value: 'paid',      label: 'Pagada' },
  { value: 'overdue',   label: 'Vencida' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'annulled',  label: 'Anulada' },
] as const;

export interface EncomiendaFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  selectedManifests: Set<string>;
  onManifestsChange: (v: Set<string>) => void;
  allManifestNumbers: string[];
  manifestPackageCounts?: Map<string, number>;
  totalCustomers: number;
  totalPackages: number;
  totalInvoices: number;
  groupBy: GroupByMode;
  onGroupByChange: (v: GroupByMode) => void;
  // New filters
  selectedInvoiceStatuses: Set<string>;
  onInvoiceStatusesChange: (v: Set<string>) => void;
  hasLoaded: boolean;
  loading: boolean;
  onLoadClick: () => void;
  onClearAll?: () => void;
  highlightManifests?: boolean;
  onManifestClick?: () => void;
}

// ── Reusable multi-select picker ───────────────────────────────────────────────

interface MultiSelectPickerProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  options: readonly { value: string; label: string }[];
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
}

function MultiSelectPicker({ id, label, icon, options, selected, onChange }: MultiSelectPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function toggle(val: string) {
    const next = new Set(selected);
    next.has(val) ? next.delete(val) : next.add(val);
    onChange(next);
  }

  function clearAll() { onChange(new Set()); }

  const count = selected?.size ?? 0;

  return (
    <div ref={ref} className="relative">
      <Button
        id={id}
        variant="outline"
        size="sm"
        className={cn('h-8 gap-1.5 text-xs', count > 0 && 'border-primary text-primary')}
        onClick={() => setOpen(v => !v)}
      >
        {icon}
        {label}
        {count > 0 && (
          <Badge className="h-4 px-1 text-[9px] bg-primary text-primary-foreground">{count}</Badge>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 ml-0.5 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-52 rounded-lg border border-border bg-popover shadow-lg py-1">
          {count > 0 && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 flex items-center gap-1.5 border-b border-border"
              onClick={clearAll}
            >
              <X className="h-3 w-3" />
              Limpiar selección ({count})
            </button>
          )}
          <div className="max-h-56 overflow-y-auto py-0.5">
            {options.map(opt => {
              const isSelected = selected.has(opt.value);
              return (
                <button
                  key={opt.value}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors',
                    isSelected && 'bg-primary/10 text-primary font-medium'
                  )}
                  onClick={() => toggle(opt.value)}
                >
                  <div className={cn(
                    'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                    isSelected ? 'bg-primary border-primary' : 'border-border'
                  )}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className="flex-1">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manifest classifier for encomiendas ────────────────────────────────────────

function classifyEncomiendaManifest(m: string): ManifestCategory {
  const upper = m.toUpperCase().trim();
  if (upper.includes('MEGA-MAN') || upper.includes('MEGA_MAN') || upper.startsWith('SL-MEGA-MAN')) return 'mega';
  if (/DANP/i.test(upper) || /PERMISOS/i.test(upper) || /PERMIT/i.test(upper)) return 'permit';
  return 'regular';
}

// ── GroupBy picker ─────────────────────────────────────────────────────────────

const GROUP_BY_OPTIONS: { value: GroupByMode; label: string }[] = [
  { value: 'customer',       label: 'Cliente' },
  { value: 'service',        label: 'Servicio' },
  { value: 'invoiceStatus',  label: 'Estado Factura' },
];

function GroupByPicker({
  value,
  onChange,
}: {
  value: GroupByMode;
  onChange: (v: GroupByMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const current = GROUP_BY_OPTIONS.find(o => o.value === value)!;

  return (
    <div ref={ref} className="relative">
      <Button
        id="encomienda-groupby-picker"
        variant="outline"
        size="sm"
        className={cn(
          'h-8 gap-1.5 text-xs',
          value !== 'customer' && 'border-primary text-primary'
        )}
        onClick={() => setOpen(v => !v)}
      >
        <Layers className="h-3.5 w-3.5" />
        Agrupar: <span className="font-semibold">{current.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 ml-0.5 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-48 rounded-lg border border-border bg-popover shadow-lg py-1">
          {GROUP_BY_OPTIONS.map(opt => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors',
                  isActive && 'bg-primary/10 text-primary font-semibold'
                )}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0',
                  isActive ? 'bg-primary border-primary' : 'border-border'
                )}>
                  {isActive && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Filters component ────────────────────────────────────────────────────

export function EncomiendaFilters({
  search,
  onSearchChange,
  selectedManifests,
  onManifestsChange,
  allManifestNumbers,
  manifestPackageCounts,
  totalCustomers,
  totalPackages,
  totalInvoices,
  groupBy,
  onGroupByChange,
  selectedInvoiceStatuses,
  onInvoiceStatusesChange,
  hasLoaded,
  loading,
  onLoadClick,
  onClearAll,
  highlightManifests = false,
  onManifestClick,
}: EncomiendaFiltersProps) {
  const activeFilters =
    (selectedManifests?.size ?? 0) +
    (selectedInvoiceStatuses?.size ?? 0);

  function clearAllFilters() {
    if (onClearAll) {
      onClearAll();
    } else {
      onManifestsChange(new Set());
      onInvoiceStatusesChange(new Set());
    }
  }

  return (
    <div className="px-6 py-3 border-b border-border bg-card/50 space-y-2.5">
      {/* Row 1: Search + filters + GroupBy */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Input
            id="encomienda-search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onLoadClick();
              }
            }}
            placeholder="Buscar tracking, cliente, nombre…"
            className="pl-8 h-8 text-xs"
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

        {/* Manifest filter — shared 3-column picker */}
        <div
          onClick={() => {
            if (highlightManifests && onManifestClick) {
              onManifestClick();
            }
          }}
        >
          <ManifestPicker
            id="encomienda-manifest-filter"
            allManifestNumbers={allManifestNumbers}
            selectedManifests={selectedManifests}
            onManifestsChange={(v) => {
              onManifestsChange(v);
              if (highlightManifests && onManifestClick) {
                onManifestClick();
              }
            }}
            manifestPackageCounts={manifestPackageCounts}
            classifyManifest={classifyEncomiendaManifest}
            triggerClassName={cn(highlightManifests && "highlight-manifest-picker animate-highlight-picker")}
          />
        </div>

        {/* Invoice status filter */}
        <MultiSelectPicker
          id="encomienda-invoice-status-filter"
          label="Factura"
          icon={<FileText className="h-3.5 w-3.5" />}
          options={INVOICE_STATUS_OPTIONS}
          selected={selectedInvoiceStatuses ?? new Set()}
          onChange={onInvoiceStatusesChange}
        />



        {/* GroupBy picker */}
        <GroupByPicker value={groupBy} onChange={onGroupByChange} />

        {/* Load / Refresh button */}
        <Button
          id="btn-encomienda-load-data"
          variant={hasLoaded ? "outline" : "default"}
          size="sm"
          onClick={onLoadClick}
          disabled={loading}
          className={cn(
            "h-8 gap-1.5 text-xs font-semibold transition-all",
            !hasLoaded && "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-sm border border-emerald-500/20",
            hasLoaded && "border-slate-200 text-slate-700 hover:bg-slate-50"
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {hasLoaded ? "Actualizar" : "Cargar Datos"}
        </Button>

        {/* Clear all active filters */}
        {activeFilters > 0 && (
          <button
            onClick={clearAllFilters}
            className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 rounded-md border border-destructive/30 flex items-center gap-1 transition-colors"
          >
            <X className="h-3 w-3" />
            Limpiar filtros ({activeFilters})
          </button>
        )}
      </div>



      <style>{`
        @keyframes highlightPulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
          }
          70% {
            transform: scale(1.04);
            box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
        .animate-highlight-picker {
          animation: highlightPulse 1.4s infinite ease-in-out;
        }
        .highlight-manifest-picker {
          border-color: #10b981 !important;
          background-color: rgb(240 253 250) !important;
          color: #047857 !important;
          font-weight: 600 !important;
          transition: all 0.2s ease-in-out;
        }
        .dark .highlight-manifest-picker {
          background-color: rgba(16, 185, 129, 0.15) !important;
          color: #34d399 !important;
          border-color: #34d399 !important;
        }
      `}</style>
    </div>
  );
}
