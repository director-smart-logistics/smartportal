import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Search, Loader2, X, Link2, BookOpen, Sparkles, UserPlus, ArrowRight, UserCheck } from "lucide-react";
import { useEffect, useId, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import { useCustomerSearch } from "@/hooks/use-customer-search";
import { NovaCustomerResultRow } from "./NovaCustomerResultRow";
import { NovaCustomerSearchSection } from "./NovaCustomerSearchSection";

export type { CombinedResult } from "@/hooks/use-customer-search";

export function CustomerSearchModal({
  nombre,
  currentSlCode,
  onClose,
  onSelected,
  onCreateNew,
}: {
  nombre: string;
  currentSlCode?: string;
  onClose: () => void;
  onSelected: (slCode: string, fullName: string, ruta: string) => void;
  onCreateNew?: () => void;
}) {
  const { t } = useLocale("nova");
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const {
    query,
    displayResults,
    suggestedResults,
    learningResults,
    currentCustomer,
    loading,
    handleInput,
    clearQuery,
    triggerSearchImmediate,
  } = useCustomerSearch(nombre, currentSlCode);

  // Close on Escape & Arrow Key navigation
  const visibleList = query.trim().length >= 2
    ? displayResults
    : [
        ...(currentCustomer ? [currentCustomer] : []),
        ...learningResults,
        ...suggestedResults.filter((s) => s.slCode !== currentCustomer?.slCode),
      ];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < visibleList.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, visibleList.length - 1)));
      } else if (e.key === "Enter") {
        if (visibleList.length > 0 && selectedIndex >= 0 && selectedIndex < visibleList.length) {
          e.preventDefault();
          const selected = visibleList[selectedIndex];
          if (selected) {
            handleSelect(selected.slCode, selected.fullName, selected.ruta || "");
          }
        } else if (query.trim().length >= 2) {
          e.preventDefault();
          triggerSearchImmediate?.();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, visibleList, selectedIndex, query, triggerSearchImmediate]);

  // Reset selected index on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (slCode: string, fullName: string, ruta: string) => {
    onSelected(slCode, fullName, ruta);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
      data-testid="customer-search-backdrop"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="customer-search-modal"
        className="w-full max-w-2xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/60 backdrop-blur-sm shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Link2 className="h-4 w-4 text-primary" />
              </div>
              <p
                id={titleId}
                className="text-sm font-bold text-foreground truncate"
              >
                {t("nova.customerSearch_title", { defaultValue: "Vincular o Reasignar Cliente" })}
              </p>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
              <span className="shrink-0">{t("nova.customerSearch_manifestLabel", { defaultValue: "Manifiesto:" })}</span>
              <span className="font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded-md truncate max-w-[320px]">
                {nombre}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("nova.customerSearch_closeAriaLabel", { defaultValue: "Cerrar" })}
            data-testid="customer-search-close"
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search input bar */}
        <div className="p-4 border-b border-border bg-background/50 shrink-0">
          <div className="relative flex items-center">
            <Search
              className={cn(
                "absolute left-3.5 h-4 w-4 text-muted-foreground transition-opacity duration-150 pointer-events-none",
                loading ? "opacity-0" : "opacity-100",
              )}
            />
            {loading && (
              <Loader2 className="absolute left-3.5 h-4 w-4 text-primary animate-spin" />
            )}
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && visibleList.length === 0 && query.trim().length >= 2) {
                  e.preventDefault();
                  triggerSearchImmediate?.();
                }
              }}
              placeholder={t("nova.customerSearch_searchPlaceholder", { defaultValue: "Buscar por nombre, SL Code (ej. SL1234), cédula, teléfono..." })}
              aria-label={t("nova.customerSearch_searchAriaLabel", { defaultValue: "Buscar cliente" })}
              data-testid="customer-search-input"
              className="w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all shadow-xs"
            />
            {query && (
              <button
                type="button"
                onClick={clearQuery}
                className="absolute right-3 p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Results Area */}
        <div
          className="overflow-y-auto flex-1 divide-y divide-border"
          aria-live="polite"
          data-testid="customer-search-results"
        >
          {/* A. When user is searching (query >= 2) */}
          {query.trim().length >= 2 ? (
            displayResults.length > 0 ? (
              <NovaCustomerSearchSection
                testId="search-results-section"
                icon={<UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                label={`Resultados de Búsqueda (${displayResults.length})`}
                headerClassName="bg-primary/5 border-primary/20"
                labelClassName="text-primary"
              >
                {displayResults.map((r, idx) => (
                  <NovaCustomerResultRow
                    key={`search-${r.slCode}`}
                    result={r}
                    variant="regular"
                    isActive={selectedIndex === idx}
                    onSelect={() => handleSelect(r.slCode, r.fullName, r.ruta || "")}
                  />
                ))}
              </NovaCustomerSearchSection>
            ) : !loading ? (
              <div className="p-8 text-center space-y-3" data-testid="no-results">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <Search className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    No se encontraron clientes para "{query}"
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Verifique el nombre, SL Code o cree un cliente temporal.
                  </p>
                </div>
                {onCreateNew && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      onCreateNew();
                      onClose();
                    }}
                    className="mt-2"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    Crear cliente temporal
                  </Button>
                )}
              </div>
            ) : null
          ) : (
            /* B. When query is empty: Show Current Linked Customer + Nova Learning + Instant Local Suggestions */
            <>
              {/* 0. Currently Linked Customer */}
              {currentCustomer && (
                <NovaCustomerSearchSection
                  testId="current-customer-section"
                  icon={
                    <UserCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  }
                  label="Cliente Actualmente Vinculado"
                  headerClassName="bg-indigo-500/10 border-indigo-500/20"
                  labelClassName="text-indigo-700 dark:text-indigo-400"
                >
                  <NovaCustomerResultRow
                    key={`current-${currentCustomer.slCode}`}
                    result={currentCustomer}
                    variant="regular"
                    isActive={selectedIndex === 0}
                    onSelect={() => handleSelect(currentCustomer.slCode, currentCustomer.fullName, currentCustomer.ruta || "")}
                  />
                </NovaCustomerSearchSection>
              )}

              {/* 1. Nova Learning (Approved associations) */}
              {learningResults.length > 0 && (
                <NovaCustomerSearchSection
                  testId="learning-results-section"
                  icon={
                    <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  }
                  label="Nova Learning — Asociaciones Aprobadas Previamente"
                  headerClassName="bg-emerald-500/10 border-emerald-500/20"
                  labelClassName="text-emerald-700 dark:text-emerald-400"
                >
                  {learningResults.map((r, idx) => (
                    <NovaCustomerResultRow
                      key={`learning-${r.slCode}`}
                      result={r}
                      variant="learning"
                      isActive={selectedIndex === idx}
                      onSelect={() => handleSelect(r.slCode, r.fullName, r.ruta || "")}
                    />
                  ))}
                </NovaCustomerSearchSection>
              )}

              {/* 2. Instant Local High-Confidence Suggestions */}
              {suggestedResults.length > 0 && (
                <NovaCustomerSearchSection
                  testId="suggested-results-section"
                  icon={
                    <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  }
                  label="Coincidencias Sugeridas en Base de Datos"
                  headerClassName="bg-blue-500/10 border-blue-500/20"
                  labelClassName="text-blue-700 dark:text-blue-400"
                >
                  {suggestedResults.map((r, idx) => (
                    <NovaCustomerResultRow
                      key={`suggested-${r.slCode}`}
                      result={r}
                      variant="suggested"
                      isActive={selectedIndex === learningResults.length + idx}
                      onSelect={() => handleSelect(r.slCode, r.fullName, r.ruta || "")}
                    />
                  ))}
                </NovaCustomerSearchSection>
              )}

              {/* Empty state when no learning or suggestions found */}
              {learningResults.length === 0 && suggestedResults.length === 0 && (
                <div className="p-8 text-center space-y-2 text-muted-foreground" data-testid="empty-state">
                  <p className="text-sm font-medium text-foreground">
                    Escriba un nombre, SL Code, cédula o teléfono para buscar
                  </p>
                  <p className="text-xs">
                    El sistema buscará instantáneamente en la base de clientes.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border bg-card/60 shrink-0">
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            Use <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px] font-mono">↑</kbd> <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px] font-mono">↓</kbd> para navegar y <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px] font-mono">Enter</kbd> para seleccionar
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {onCreateNew && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onCreateNew();
                  onClose();
                }}
                className="gap-1.5 text-xs font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Crear cliente temporal
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="cancel-button"
              className="text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
