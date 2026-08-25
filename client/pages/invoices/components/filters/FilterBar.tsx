import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale } from "@/hooks/useLocale";
import { Search, Filter, X, Check, Truck, CheckCircle, AlertTriangle, Layers, FileText, ChevronDown, ArrowUpDown, Sparkles, HelpCircle, AlertCircle, Loader2, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

import { cn } from "@/lib/utils";
import { getRouteColor } from "@/lib/utils/route-colors";
import { TEMP_WARNING_TITLE } from "@/lib/utils/invoice-reassign";
import { ManifestPicker } from "@/components/manifest/ManifestPicker";
import { useToast } from "@/components/ui/use-toast";
import { translateInvoiceToJQL } from "@/lib/services/gemini-client";
import { validateInvoiceJQLSyntax } from "@/lib/utils/invoice-jql";

import { Card } from "@/components/ui/card";
import type { InvoiceStatus, SortOrder } from "../../types";
import { STATUS_DOT } from "../../utils/formatters";
import type { LoadMoreAmount } from "@/lib/hooks/queries/useInvoices";

interface FilterBarProps {
  invoiceSearchTerm: string;
  setInvoiceSearchTerm: (val: string) => void;
  setPageIndex: (val: number) => void;
  filtersOpen: boolean;
  setFiltersOpen: (val: boolean) => void;
  statusFilterOpen: boolean;
  setStatusFilterOpen: (val: boolean) => void;
  invoiceStatusFilters: InvoiceStatus[];
  setInvoiceStatusFilters: React.Dispatch<React.SetStateAction<InvoiceStatus[]>>;
  manifestFilter: string;
  setManifestFilter: (val: string) => void;
  manifestOptions: string[];
  manifestPackageCounts?: Map<string, number>;
  dataLoadLimit: 'last24hours' | 'last48hours' | 'last4days' | 3000 | 5000 | 10000;
  setDataLoadLimit: (val: 'last24hours' | 'last48hours' | 'last4days' | 3000 | 5000 | 10000) => void;
  routeFilter: string;
  setRouteFilter: (val: string) => void;
  routeOptions: string[];
  tempCustomerFilter: boolean;
  setTempCustomerFilter: React.Dispatch<React.SetStateAction<boolean>>;
  groupBy: 'none' | 'name' | 'slCode' | 'dni' | 'email';
  setGroupBy: (val: 'none' | 'name' | 'slCode' | 'dni' | 'email') => void;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  sortOrder: SortOrder;
  setSortOrder: (val: SortOrder) => void;
  onSearch: () => void;
  onClearFilters?: () => void;
  isFiltersDirty: boolean;
  hasSearched: boolean;
  // Stats summary (optional)
  statsCount?: number;
  statsTotalWeight?: number;
  statsTotalAmount?: number;
  statsFlash?: boolean;
}

const GROUP_BY_LABELS: Record<string, string> = { name: 'Nombre', slCode: 'SL Code', dni: 'Cédula', email: 'Correo' };

export const FilterBar = React.memo(function FilterBar({
  invoiceSearchTerm, setInvoiceSearchTerm, setPageIndex,
  filtersOpen, setFiltersOpen,
  statusFilterOpen, setStatusFilterOpen,
  invoiceStatusFilters, setInvoiceStatusFilters,
  manifestFilter, setManifestFilter, manifestOptions,
  manifestPackageCounts,
  dataLoadLimit, setDataLoadLimit,
  routeFilter, setRouteFilter, routeOptions,
  tempCustomerFilter, setTempCustomerFilter,
  groupBy, setGroupBy, setExpandedGroups,
  sortOrder, setSortOrder,
  onSearch, onClearFilters,
  isFiltersDirty, hasSearched,
  statsCount, statsTotalWeight, statsTotalAmount, statsFlash,
}: FilterBarProps) {
  const { t } = useLocale(['invoices', 'common']);
  const { toast } = useToast();

  const [jqlError, setJqlError] = useState("");
  const [aiInputOpen, setAiInputOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [syntaxHelpOpen, setSyntaxHelpOpen] = useState(false);

  useEffect(() => {
    setJqlError(validateInvoiceJQLSyntax(invoiceSearchTerm));
  }, [invoiceSearchTerm]);

  const handleAiTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;

    setAiLoading(true);
    try {
      const jql = await translateInvoiceToJQL(aiQuery);
      if (jql) {
        setInvoiceSearchTerm(jql);
        setPageIndex(0);
        toast({
          title: "Búsqueda traducida con éxito",
          description: `Consulta JQL: ${jql}`,
        });
        setAiInputOpen(false);
        setAiQuery("");
      } else {
        toast({
          title: "No se pudo interpretar la consulta",
          description: "La IA no pudo traducir el texto a JQL. Intenta ser más descriptivo.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("AI JQL Translation failed:", err);
      toast({
        title: "Error al usar la IA",
        description: err.message || "No se pudo conectar con el servicio de IA.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleClearFilters = () => {
    setInvoiceSearchTerm("");
    setManifestFilter("all");
    setInvoiceStatusFilters([]);
    setRouteFilter("all");
    setTempCustomerFilter(false);
    setDataLoadLimit("last24hours");
    setPageIndex(0);
    setGroupBy("none");
    setExpandedGroups(new Set());
    if (onClearFilters) {
      onClearFilters();
    }
  };

  return (
    <Card className="p-3 border-border shadow-sm bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2 flex-wrap w-full">
        {/* 1. Search Bar */}
        <div className="flex flex-col min-w-[200px] w-full sm:min-w-[320px] lg:min-w-[420px] flex-1 relative">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder={t("trackingPlaceholder") || 'Buscar o escribir JQL...'}
                value={invoiceSearchTerm}
                onChange={(e) => { setInvoiceSearchTerm(e.target.value); setPageIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSearch();
                  }
                }}
                className="pl-9 pr-12 h-9 text-sm rounded-lg"
                aria-label={t("accessibility.searchInvoices")}
                data-testid="invoice-search-input"
              />
              {/* JQL Indicator Badge */}
              {(invoiceSearchTerm.includes("=") || invoiceSearchTerm.includes("~") || invoiceSearchTerm.includes(">") || invoiceSearchTerm.includes("<")) && (
                <span className="absolute right-10 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-violet-500/10 text-violet-500 border border-violet-500/20 px-1 py-0.5 rounded select-none">
                  JQL
                </span>
              )}
              {invoiceSearchTerm && (
                <button
                  onClick={() => { setInvoiceSearchTerm(""); setPageIndex(0); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  type="button"
                  title="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* AI Sparkles Assistant Button */}
            <Popover open={aiInputOpen} onOpenChange={setAiInputOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 hover:bg-violet-50 text-violet-600 border-violet-200 dark:hover:bg-violet-950/30 dark:border-violet-800"
                  title="Búsqueda Inteligente con IA"
                >
                  <Sparkles className="h-4 w-4 fill-violet-500/10" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 sm:w-96 p-4 rounded-xl shadow-xl border-border bg-popover text-popover-foreground z-50">
                <form onSubmit={handleAiTranslate} className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Sparkles className="h-4 w-4 text-violet-500 animate-pulse" />
                    <span>¿Qué facturas quieres buscar?</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-normal">
                    Escribe en lenguaje común (ej: facturas pagadas de Juan del manifiesto M23) y la IA generará el filtro JQL.
                  </p>
                  <Input
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder="Ej: facturas en borrador de la ruta Miami Aéreo"
                    className="h-10 text-xs rounded-xl"
                    disabled={aiLoading}
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setAiInputOpen(false)}
                      disabled={aiLoading}
                      className="h-8 text-xs rounded-lg"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={aiLoading || !aiQuery.trim()}
                      className="h-8 text-xs rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Traduciendo...
                        </>
                      ) : (
                        "Traducir a JQL"
                      )}
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>

            {/* Syntax Help Button */}
            <Popover open={syntaxHelpOpen} onOpenChange={setSyntaxHelpOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", syntaxHelpOpen ? "bg-accent" : "")}
                  title="Ayuda sintáctica JQL"
                >
                  <span className="text-xs font-bold font-mono">?</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4 rounded-xl shadow-xl border-border bg-popover text-popover-foreground text-xs space-y-3 z-50">
                <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  Guía Sintáctica JQL de Facturas
                </div>
                <div className="space-y-2">
                  <p>Filtra registros usando sintaxis precisa de campos, operadores y valores.</p>
                  <div>
                    <span className="font-semibold text-primary">Campos soportados:</span>
                    <ul className="list-disc list-inside pl-1 space-y-0.5 text-[11px] text-muted-foreground">
                      <li><code className="bg-muted px-1 py-0.25 rounded">invoice</code> (factura, número)</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">status</code> (estado, s): draft, sent, paid, annulled</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">customer</code> (cliente, name)</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">code</code> (slcode, smartid)</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">manifest</code> (manifiesto, m)</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">route</code> (ruta, r)</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">total</code> (monto, amount)</li>
                      <li><code className="bg-muted px-1 py-0.25 rounded">currency</code> (moneda): USD, CRC</li>
                    </ul>
                  </div>
                  <div>
                    <span className="font-semibold text-primary">Operadores:</span>
                    <p className="text-[11px] text-muted-foreground"><code className="bg-muted px-0.5 rounded">=</code> (igual), <code className="bg-muted px-0.5 rounded">!=</code> (diferente), <code className="bg-muted px-0.5 rounded">~</code> (contiene), <code className="bg-muted px-0.5 rounded">&gt;</code>, <code className="bg-muted px-0.5 rounded">&lt;</code></p>
                  </div>
                  <div>
                    <span className="font-semibold text-primary">Ejemplos:</span>
                    <ul className="list-none space-y-1 text-[11px] font-mono text-muted-foreground pl-1">
                      <li className="bg-muted/40 p-1 rounded">status = "paid" AND total &gt; 200</li>
                      <li className="bg-muted/40 p-1 rounded">customer ~ "Perez" OR code = "SL-883"</li>
                    </ul>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Separator */}
        <div className="hidden sm:block h-6 w-px mx-1 bg-gray-200 dark:bg-gray-600" />

        {/* 2. Manifest Picker */}
        <ManifestPicker
          allManifestNumbers={manifestOptions}
          selectedManifests={manifestFilter === 'all' ? new Set() : new Set([manifestFilter])}
          onManifestsChange={(set) => {
            const next = Array.from(set)[0];
            setManifestFilter(next || 'all');
            setPageIndex(0);
          }}
          manifestPackageCounts={manifestPackageCounts}
          singleSelect
          triggerClassName="w-full sm:w-auto sm:min-w-[200px] h-9 text-sm"
          allLabel={manifestOptions.length === 0 ? 'Sin manifiestos' : 'Todos los manifiestos'}
        />

        {/* 3. Data Load Limit */}
        <Select
          value={dataLoadLimit.toString()}
          onValueChange={(val) => setDataLoadLimit(val === 'last24hours' ? 'last24hours' : val === 'last48hours' ? 'last48hours' : val === 'last4days' ? 'last4days' : (Number(val) as 3000 | 5000 | 10000))}
        >
          <SelectTrigger className="h-9 text-sm shrink-0 w-full sm:w-auto sm:min-w-[168px] sm:max-w-[200px] gap-1.5">
            <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last24hours">Últimas 24 horas</SelectItem>
            <SelectItem value="last48hours">Últimas 48 horas</SelectItem>
            <SelectItem value="last4days">Últimos 4 días</SelectItem>
            <SelectItem value="3000">3,000 facturas</SelectItem>
            <SelectItem value="5000">5,000 facturas</SelectItem>
            <SelectItem value="10000">10,000 facturas</SelectItem>
          </SelectContent>
        </Select>

        {/* 4. Route Filter */}
        <Select value={routeFilter} onValueChange={(v) => { setRouteFilter(v); setPageIndex(0); }} disabled={routeOptions.length === 0}>
          <SelectTrigger
            className="h-9 text-sm shrink-0 w-full sm:w-auto sm:min-w-[120px] sm:max-w-[180px]"
            aria-label="Filtrar por ruta"
            data-testid="route-filter"
          >
            <SelectValue>
              {routeFilter === "all" ? (
                <span className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {routeOptions.length === 0 ? 'Sin rutas' : 'Rutas'}
                </span>
              ) : (() => {
                const rc = getRouteColor(routeFilter);
                return (
                  <span className={cn('flex items-center gap-1 rounded px-1 -mx-1', rc.bg, rc.text)}>
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    {routeFilter}
                  </span>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las rutas</SelectItem>
            {routeOptions.map((r) => {
              const rc = getRouteColor(r);
              return (
                <SelectItem key={r} value={r}>
                  <span className={cn('flex items-center gap-1.5 rounded px-1 -mx-1', rc.bg, rc.text)}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rc.swatch }} />
                    {r}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* 5. Status & Temp Filter */}
        <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-9 gap-1.5 text-sm font-normal shrink-0 justify-between overflow-hidden',
                'w-full sm:w-auto sm:min-w-[120px] sm:max-w-[180px]',
                invoiceStatusFilters.length > 0 || tempCustomerFilter ? 'border-primary/60 bg-primary/5 text-primary' : ''
              )}
              aria-label="Filtrar por estado"
              data-testid="invoice-status-filter"
            >
              <CheckCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex items-center gap-1.5 truncate">
                {invoiceStatusFilters.length === 1 && !tempCustomerFilter && (
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[invoiceStatusFilters[0]])} aria-hidden />
                )}
                {invoiceStatusFilters.length === 0 && !tempCustomerFilter
                  ? 'Estado'
                  : invoiceStatusFilters.length === 0 && tempCustomerFilter
                  ? "Temporales"
                  : invoiceStatusFilters.length === 1 && !tempCustomerFilter
                  ? t(invoiceStatusFilters[0])
                  : invoiceStatusFilters.length === 1 && tempCustomerFilter
                  ? `${t(invoiceStatusFilters[0])} + Temp`
                  : !tempCustomerFilter
                  ? `${invoiceStatusFilters.length} estados`
                  : `${invoiceStatusFilters.length} estados + Temp`}
              </span>
              {(invoiceStatusFilters.length > 0 || tempCustomerFilter) && (
                <span
                  role="button"
                  aria-label="Limpiar filtro de estado"
                  className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 shrink-0"
                  onClick={(e) => { e.stopPropagation(); setInvoiceStatusFilters([]); setTempCustomerFilter(false); setPageIndex(0); }}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="space-y-0.5">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                onClick={() => { setInvoiceStatusFilters([]); setTempCustomerFilter(false); setPageIndex(0); }}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {invoiceStatusFilters.length === 0 && !tempCustomerFilter && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
                <span className="font-medium text-muted-foreground">Todos</span>
              </button>

              <div className="my-1 border-t" />

              {/* Temp Customer Filter inside popover */}
              <label
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors cursor-pointer"
                title={TEMP_WARNING_TITLE}
              >
                <Checkbox
                  checked={tempCustomerFilter}
                  onCheckedChange={(checked) => {
                    setTempCustomerFilter(checked as boolean);
                    setPageIndex(0);
                  }}
                  id="status-filter-temp"
                  data-testid="filter-temp"
                />
                <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Temporales
                </span>
              </label>

              <div className="my-1 border-t" />

              {(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'annulled'] as InvoiceStatus[]).map((s) => {
                const checked = invoiceStatusFilters.includes(s);
                return (
                  <label
                    key={s}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setInvoiceStatusFilters(prev =>
                          prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                        );
                        setPageIndex(0);
                      }}
                      id={`status-filter-${s}`}
                      data-testid={`filter-${s}`}
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[s])} aria-hidden />
                      {t(s)}
                    </span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* 6. Action Button */}
        <div className="flex items-center ml-auto shrink-0 min-w-[100px] justify-end">
          <AnimatePresence mode="wait" initial={false}>
            {!hasSearched ? (
              <motion.div
                key="buscar"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <Button onClick={onSearch} className="h-9 px-4 gap-2">
                  <Search className="h-4 w-4" />
                  Buscar
                </Button>
              </motion.div>
            ) : isFiltersDirty ? (
              <motion.div
                key="nueva-busqueda"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <Button 
                  onClick={onSearch} 
                  className="h-9 px-4 gap-2 bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 shadow-md"
                >
                  <Search className="h-4 w-4" />
                  Nueva Búsqueda
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="limpiar"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <Button 
                  onClick={handleClearFilters} 
                  variant="outline" 
                  className="h-9 px-4 gap-2 border-red-200 hover:border-red-300 hover:bg-red-50 text-red-600 hover:text-red-700"
                  title="Limpiar filtros y volver al inicio"
                >
                  <X className="h-4 w-4" />
                  Limpiar
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {jqlError && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 rounded-lg text-xs shadow-sm font-medium overflow-hidden"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{jqlError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statsCount !== undefined && statsCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 border-t border-border text-[11px] font-medium flex-wrap bg-primary/5 text-primary rounded-b-lg overflow-hidden"
            )}
          >
            <span className="font-bold">{statsCount}</span>
            <span className="text-muted-foreground">factura{statsCount !== 1 ? "s" : ""}</span>
            {statsTotalWeight !== undefined && statsTotalWeight > 0 && (
              <>
                <span className="text-border select-none">·</span>
                <span>{statsTotalWeight.toFixed(2)} kg</span>
              </>
            )}
            {statsTotalAmount !== undefined && statsTotalAmount > 0 && (
              <>
                <span className="text-border select-none">·</span>
                <span>${statsTotalAmount.toFixed(2)}</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
});
