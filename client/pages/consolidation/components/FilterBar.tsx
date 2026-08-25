import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Filter, ChevronDown, Users, Layers, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type GroupByMode = 'customer' | 'manifest' | 'route';

const GROUP_BY_OPTIONS: { mode: GroupByMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'customer',  label: 'Cliente',     icon: <Users  className="h-3 w-3" aria-hidden /> },
  { mode: 'manifest',  label: 'Manifiesto',  icon: <Layers className="h-3 w-3" aria-hidden /> },
  { mode: 'route',     label: 'Ruta',        icon: <MapPin className="h-3 w-3" aria-hidden /> },
];

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  selectedManifest: string;
  onManifestChange: (v: string) => void;
  allManifestNumbers: string[];
  totalCustomers: number;
  totalPackages: number;
  groupBy: GroupByMode;
  onGroupByChange: (mode: GroupByMode) => void;
}

const ALL_KEY = '__all__';
const ALL_LABEL = 'Todos los manifiestos';

export function FilterBar({
  search,
  onSearchChange,
  selectedManifest,
  onManifestChange,
  allManifestNumbers,
  totalCustomers,
  totalPackages,
  groupBy,
  onGroupByChange,
}: FilterBarProps) {
  const [open, setOpen]           = useState(false);
  const [typeahead, setTypeahead] = useState('');
  const wrapperRef                = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const listRef                   = useRef<HTMLUListElement>(null);

  const displayLabel = selectedManifest === ALL_KEY ? ALL_LABEL : selectedManifest;

  const filtered = typeahead.trim()
    ? allManifestNumbers.filter(mf =>
        mf.toLowerCase().includes(typeahead.trim().toLowerCase())
      )
    : allManifestNumbers;

  const openDropdown = useCallback(() => {
    setTypeahead('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setTypeahead('');
  }, []);

  const select = useCallback((value: string) => {
    onManifestChange(value);
    closeDropdown();
  }, [onManifestChange, closeDropdown]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onManifestChange(ALL_KEY);
    closeDropdown();
  }, [onManifestChange, closeDropdown]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  // Keyboard navigation
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { closeDropdown(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = listRef.current?.querySelector('li button') as HTMLButtonElement | null;
      first?.focus();
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, value: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(value); }
    if (e.key === 'Escape') { closeDropdown(); inputRef.current?.focus(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (e.currentTarget.parentElement?.nextElementSibling?.querySelector('button')) as HTMLButtonElement | null;
      next?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (e.currentTarget.parentElement?.previousElementSibling?.querySelector('button')) as HTMLButtonElement | null;
      prev ? prev.focus() : inputRef.current?.focus();
    }
  };

  const isActive = selectedManifest !== ALL_KEY;

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/20">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden />
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar cliente, tracking, descripción…"
          className="pl-8 h-8 text-xs"
          aria-label="Buscar"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Manifest typeahead */}
      <div className="flex items-center gap-1.5" ref={wrapperRef}>
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
        <div className="relative">
          {/* Trigger button */}
          <button
            type="button"
            onClick={open ? closeDropdown : openDropdown}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 rounded-md border bg-background px-2.5 text-xs',
              'focus:outline-none focus:ring-2 focus:ring-ring transition-colors min-w-[160px] justify-between',
              isActive
                ? 'border-primary text-primary font-medium'
                : 'border-input text-foreground'
            )}
          >
            <span className="truncate max-w-[140px]">{displayLabel}</span>
            <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
              {/* Typeahead input */}
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" aria-hidden />
                  <input
                    ref={inputRef}
                    type="text"
                    value={typeahead}
                    onChange={e => setTypeahead(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Buscar manifiesto…"
                    className="w-full pl-6 pr-2 py-1 text-xs bg-muted/40 rounded border-0 outline-none focus:ring-1 focus:ring-ring"
                    aria-label="Buscar manifiesto"
                    autoComplete="off"
                  />
                  {typeahead && (
                    <button
                      type="button"
                      onClick={() => setTypeahead('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Options list */}
              <ul
                ref={listRef}
                role="listbox"
                aria-label="Manifiestos"
                className="max-h-52 overflow-y-auto py-1"
              >
                {!typeahead && (
                  <li role="option" aria-selected={selectedManifest === ALL_KEY}>
                    <button
                      type="button"
                      onClick={() => select(ALL_KEY)}
                      onKeyDown={e => handleItemKeyDown(e, ALL_KEY)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs transition-colors',
                        'hover:bg-accent focus:bg-accent outline-none',
                        selectedManifest === ALL_KEY && 'font-semibold text-primary'
                      )}
                    >
                      {ALL_LABEL}
                    </button>
                  </li>
                )}
                {filtered.length === 0 && (
                  <li className="px-3 py-3 text-xs text-muted-foreground text-center italic">
                    Sin resultados
                  </li>
                )}
                {filtered.map(mf => (
                  <li key={mf} role="option" aria-selected={selectedManifest === mf}>
                    <button
                      type="button"
                      onClick={() => select(mf)}
                      onKeyDown={e => handleItemKeyDown(e, mf)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs font-mono transition-colors',
                        'hover:bg-accent focus:bg-accent outline-none',
                        selectedManifest === mf && 'font-semibold text-primary bg-primary/5'
                      )}
                    >
                      {mf}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {isActive && (
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Limpiar filtro de manifiesto"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Group by segmented control */}
      <div className="flex items-center gap-1 rounded-md border border-input bg-background p-0.5" role="group" aria-label="Agrupar por">
        {GROUP_BY_OPTIONS.map(({ mode, label, icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onGroupByChange(mode)}
            aria-pressed={groupBy === mode}
            className={cn(
              'inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded transition-colors',
              groupBy === mode
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
        <span><strong className="text-foreground">{totalCustomers}</strong> cliente{totalCustomers !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span><strong className="text-foreground">{totalPackages}</strong> paquete{totalPackages !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
