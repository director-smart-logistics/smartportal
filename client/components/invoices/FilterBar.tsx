import React, { useState, useEffect } from "react";
import {
  Sparkles,
  X,
  Search,
  AlertCircle,
  Loader2,
  CheckCircle,
  Truck,
  FileText,
  Users,
  Check,
  Database,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { translateInvoiceToJQL } from "@/lib/services/gemini-client";
import { validateInvoiceJQLSyntax } from "@/lib/utils/invoice-jql";

const INVOICE_STATUSES = [
  { value: "draft", label: "Borrador" },
  { value: "sent", label: "Enviado" },
  { value: "paid", label: "Pagado" },
  { value: "overdue", label: "Vencido" },
  { value: "cancelled", label: "Cancelado" },
  { value: "annulled", label: "Anulado" },
] as const;

type InvoiceStatus = typeof INVOICE_STATUSES[number]["value"];

interface FilterBarProps {
  // Search
  invoiceSearchTerm: string;
  setInvoiceSearchTerm: (v: string) => void;
  setPageIndex: (v: number) => void;
  // Status
  invoiceStatusFilters: InvoiceStatus[];
  setInvoiceStatusFilters: (v: InvoiceStatus[]) => void;
  statusFilterOpen: boolean;
  setStatusFilterOpen: (v: boolean) => void;
  // Manifest
  manifestFilter: string;
  setManifestFilter: (v: string) => void;
  manifestOptions: string[];
  // Data load limit (replaces date range — matches Packages pattern)
  dataLoadLimit: 'last24hours' | 'last48hours' | 'last4days' | 3000 | 5000 | 10000;
  setDataLoadLimit: (v: 'last24hours' | 'last48hours' | 'last4days' | 3000 | 5000 | 10000) => void;
  // Route
  routeFilter: string;
  setRouteFilter: (v: string) => void;
  routeOptions: string[];
  // Misc
  tempCustomerFilter?: boolean;
  setTempCustomerFilter?: (v: boolean) => void;
  groupBy: string;
  setGroupBy: (v: string) => void;
  setExpandedGroups: (v: Set<string>) => void;
  sortOrder: string;
  setSortOrder: (v: string) => void;
  // Misc
  filtersOpen?: boolean;
  setFiltersOpen?: (v: boolean) => void;
  isDark?: boolean;
  t?: any;
}

export function FilterBar({
  invoiceSearchTerm,
  setInvoiceSearchTerm,
  setPageIndex,
  invoiceStatusFilters,
  setInvoiceStatusFilters,
  statusFilterOpen,
  setStatusFilterOpen,
  manifestFilter,
  setManifestFilter,
  manifestOptions,
  dataLoadLimit,
  setDataLoadLimit,
  routeFilter,
  setRouteFilter,
  routeOptions,
  tempCustomerFilter,
  setTempCustomerFilter,
  groupBy,
  setGroupBy,
  setExpandedGroups,
  sortOrder,
  setSortOrder,
  isDark,
  t,
}: FilterBarProps) {
  const [jqlError, setJqlError] = useState("");
  const [aiInputOpen, setAiInputOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [syntaxHelpOpen, setSyntaxHelpOpen] = useState(false);
  const { toast } = useToast();

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
        toast({ title: "Búsqueda traducida", description: `JQL: ${jql}` });
        setAiInputOpen(false);
        setAiQuery("");
      } else {
        toast({
          title: "No se pudo interpretar",
          description: "Intenta ser más descriptivo.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error IA",
        description: err.message || "No se pudo conectar con IA.",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const clearSearch = () => {
    setInvoiceSearchTerm("");
    setJqlError("");
    setPageIndex(0);
  };

  const clearAll = () => {
    setInvoiceSearchTerm("");
    setJqlError("");
    setInvoiceStatusFilters([]);
    setManifestFilter("all");
    setRouteFilter("all");
    setTempCustomerFilter?.(false);
    setGroupBy("none");
    setExpandedGroups(new Set());
    setPageIndex(0);
  };

  const statusLabel =
    invoiceStatusFilters.length === 0
      ? "Estado"
      : invoiceStatusFilters.length === 1
        ? INVOICE_STATUSES.find((s) => s.value === invoiceStatusFilters[0])?.label ?? invoiceStatusFilters[0]
        : `${invoiceStatusFilters.length} estados`;

  const routeLabel =
    routeFilter === "all" || !routeFilter ? "Ruta" : routeFilter;

  const hasActiveFilters =
    !!invoiceSearchTerm ||
    invoiceStatusFilters.length > 0 ||
    (manifestFilter && manifestFilter !== "all") ||
    (routeFilter && routeFilter !== "all") ||
    tempCustomerFilter;

  return (
    <Card
      className={cn(
        "p-3",
        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* ── Search input with AI + Syntax help */}
        <div className="flex flex-col min-w-[200px] w-full sm:min-w-[320px] flex-1 relative">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={invoiceSearchTerm}
                onChange={(e) => {
                  setInvoiceSearchTerm(e.target.value);
                  setPageIndex(0);
                }}
                placeholder='Buscar o JQL (ej: status = "paid" AND total > 100)...'
                className={cn(
                  "h-9 pl-9 pr-10 text-sm",
                  isDark ? "bg-gray-700 border-gray-600 text-white" : "",
                  jqlError ? "border-red-500 focus-visible:ring-red-500" : ""
                )}
                aria-label="Buscar facturas"
                data-testid="invoice-search-input"
              />
              {invoiceSearchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {/* JQL indicator */}
              {(invoiceSearchTerm.includes("=") ||
                invoiceSearchTerm.includes("~") ||
                invoiceSearchTerm.includes(">") ||
                invoiceSearchTerm.includes("<")) && (
                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-violet-500/10 text-violet-500 border border-violet-500/20 px-1 py-0.5 rounded select-none">
                  JQL
                </span>
              )}
            </div>

            {/* AI Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Popover open={aiInputOpen} onOpenChange={setAiInputOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={cn(
                          "h-9 w-9 shrink-0",
                          isDark
                            ? "bg-gray-700 border-gray-600 hover:bg-gray-600 text-violet-400"
                            : "hover:bg-violet-50 text-violet-600 border-violet-200"
                        )}
                      >
                        <Sparkles className="h-4 w-4 fill-violet-500/10" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 sm:w-96 p-4 rounded-xl shadow-xl border-border bg-popover z-50">
                      <form onSubmit={handleAiTranslate} className="space-y-3">
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                          <Sparkles className="h-4 w-4 text-violet-500 animate-pulse" />
                          ¿Qué facturas quieres buscar?
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Escribe en lenguaje natural y la IA generará el filtro JQL.
                        </p>
                        <Input
                          value={aiQuery}
                          onChange={(e) => setAiQuery(e.target.value)}
                          placeholder="Ej: facturas pagadas de Juan Perez del manifiesto MAN-30"
                          className="h-9 text-xs"
                          disabled={aiLoading}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setAiInputOpen(false)} disabled={aiLoading}>
                            Cancelar
                          </Button>
                          <Button type="submit" size="sm" disabled={aiLoading || !aiQuery.trim()} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
                            {aiLoading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Traduciendo...</> : "Generar Filtro"}
                          </Button>
                        </div>
                      </form>
                    </PopoverContent>
                  </Popover>
                </TooltipTrigger>
                <TooltipContent><p>Asistente de Búsqueda IA</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Syntax Help Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSyntaxHelpOpen(!syntaxHelpOpen)}
                    className={`h-9 w-9 shrink-0 ${syntaxHelpOpen ? "bg-accent" : ""}`}
                  >
                    <span className="text-xs font-bold font-mono">?</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Guía de Sintaxis JQL</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* JQL error */}
          {jqlError && (
            <div className="absolute top-10 left-0 right-0 z-50 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 px-3 py-1.5 rounded-md text-xs shadow-md backdrop-blur-sm flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{jqlError}</span>
            </div>
          )}

          {/* JQL Quick Help Banner */}
          {syntaxHelpOpen && (
            <div className={`absolute top-10 left-0 right-0 z-50 p-3 rounded-lg border text-xs shadow-lg backdrop-blur-md ${isDark ? "bg-gray-800/95 border-gray-700 text-gray-300" : "bg-white/95 border-gray-200 text-gray-700"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-violet-500">Manual Rápido de JQL</span>
                <button onClick={() => setSyntaxHelpOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <p className="font-semibold">Campos:</p>
                  <p>• <span className="font-mono text-violet-400">status (s)</span>: draft, paid, sent...</p>
                  <p>• <span className="font-mono text-violet-400">total (t)</span>: monto numérico</p>
                  <p>• <span className="font-mono text-violet-400">manifest (m)</span>: número manifiesto</p>
                </div>
                <div>
                  <p className="font-semibold">Operadores:</p>
                  <p>• <span className="font-mono text-violet-400">=</span> igual, <span className="font-mono text-violet-400">!=</span> no igual</p>
                  <p>• <span className="font-mono text-violet-400">~</span> contiene, <span className="font-mono text-violet-400">!~</span> no contiene</p>
                  <p>• <span className="font-mono text-violet-400">&gt;, &lt;, &gt;=, &lt;=</span> numéricos</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-muted/50 text-[10px] text-muted-foreground">
                <span className="font-semibold">Ejemplos:</span> <code className="bg-muted px-1 py-0.5 rounded">s = paid AND t &gt; 50</code> | <code className="bg-muted px-1 py-0.5 rounded">m ~ DANP OR client ~ Juan</code>
              </div>
            </div>
          )}
        </div>

        {/* ── Separator */}
        <div className={cn("hidden sm:block h-6 w-px mx-1", isDark ? "bg-gray-600" : "bg-gray-200")} />

        {/* ── Manifest filter */}
        <Select
          value={manifestFilter || "all"}
          onValueChange={(v) => { setManifestFilter(v); setPageIndex(0); }}
        >
          <SelectTrigger
            className={cn(
              "h-9 w-auto min-w-[160px] gap-1.5",
              isDark ? "bg-gray-700 border-gray-600 text-white" : "",
              manifestFilter && manifestFilter !== "all" ? "border-primary/60 bg-primary/5 text-primary" : ""
            )}
            aria-label="Filtrar por manifiesto"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Manifiesto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los manifiestos</SelectItem>
            {manifestOptions.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ── Data load limit — matches Packages pattern */}
        <Select
          value={dataLoadLimit.toString()}
          onValueChange={(val) => setDataLoadLimit(val === 'last24hours' ? 'last24hours' : val === 'last48hours' ? 'last48hours' : val === 'last4days' ? 'last4days' : (Number(val) as 3000 | 5000 | 10000))}
        >
          <SelectTrigger className={`h-9 w-[168px] gap-1.5 ${isDark ? "bg-gray-700 border-gray-600 text-white" : ""}`}>
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

        {/* ── Route filter */}
        <Popover open={routeOpen} onOpenChange={setRouteOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors",
                routeFilter && routeFilter !== "all"
                  ? "border-primary bg-primary/5 text-primary"
                  : isDark
                    ? "border-gray-600 bg-gray-700 text-white"
                    : "border-input bg-background text-foreground hover:bg-accent"
              )}
              aria-label="Filtrar por ruta"
            >
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[110px] truncate">{routeLabel}</span>
              {routeFilter && routeFilter !== "all" && (
                <span
                  role="button"
                  aria-label="Limpiar filtro de ruta"
                  className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                  onClick={(e) => { e.stopPropagation(); setRouteFilter("all"); setPageIndex(0); }}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            <div className="space-y-0.5">
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                onClick={() => { setRouteFilter("all"); setPageIndex(0); setRouteOpen(false); }}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {(!routeFilter || routeFilter === "all") && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
                <span className="font-medium">Todas</span>
              </button>
              <div className="my-1 border-t" />
              {routeOptions.map((route) => (
                <button
                  key={route}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                  onClick={() => { setRouteFilter(route); setPageIndex(0); setRouteOpen(false); }}
                >
                  <span className="flex h-4 w-4 items-center justify-center">
                    {routeFilter === route && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="uppercase tracking-wide text-xs font-medium">{route}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* ── Status filter */}
        <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-9 gap-1.5 text-sm font-normal",
                isDark ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600" : "",
                invoiceStatusFilters.length > 0 ? "border-primary/60 bg-primary/5 text-primary" : ""
              )}
              aria-label="Filtrar por estado"
            >
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              {statusLabel}
              {invoiceStatusFilters.length > 0 && (
                <span
                  role="button"
                  aria-label="Limpiar filtro de estado"
                  className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                  onClick={(e) => { e.stopPropagation(); setInvoiceStatusFilters([]); setPageIndex(0); }}
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
                onClick={() => { setInvoiceStatusFilters([]); setPageIndex(0); }}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {invoiceStatusFilters.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
                </span>
                <span className="font-medium text-muted-foreground">Todos</span>
              </button>
              <div className="my-1 border-t" />
              {INVOICE_STATUSES.map(({ value, label }) => {
                const checked = invoiceStatusFilters.includes(value as InvoiceStatus);
                return (
                  <label
                    key={value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setInvoiceStatusFilters(
                          checked
                            ? invoiceStatusFilters.filter((s) => s !== value)
                            : [...invoiceStatusFilters, value as InvoiceStatus]
                        );
                        setPageIndex(0);
                      }}
                      id={`status-filter-${value}`}
                    />
                    <span className="text-xs font-medium">{label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* ── Temp customer toggle */}
        {setTempCustomerFilter && (
          <button
            type="button"
            onClick={() => { setTempCustomerFilter(!tempCustomerFilter); setPageIndex(0); }}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors",
              tempCustomerFilter
                ? "border-red-400/60 bg-red-50 dark:bg-red-950/20 text-red-600"
                : isDark
                  ? "border-gray-600 bg-gray-700 text-white"
                  : "border-input bg-background text-foreground hover:bg-accent"
            )}
            aria-label="Mostrar solo facturas de clientes temporales"
            title="Mostrar solo facturas de clientes temporales"
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">Temporales</span>
          </button>
        )}

        {/* ── Actions — clear */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Clear filters */}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className={cn("h-9 px-3", isDark ? "hover:bg-gray-700" : "")}
            title="Limpiar todos los filtros"
            aria-label="Limpiar filtros"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
