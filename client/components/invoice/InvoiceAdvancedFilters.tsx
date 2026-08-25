import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  X,
  Calendar,
  DollarSign,
  ChevronDown,
  MapPin,
  FileText,
  User,
  Mail,
  CreditCard,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { InvoiceFilterProps, SearchField } from "@/lib/types/invoice-filters";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const SEARCH_FIELD_OPTIONS: Array<{
  value: SearchField;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    value: "invoiceNumber",
    label: "Número de factura",
    icon: <Hash className="h-3.5 w-3.5" />,
  },
  {
    value: "customerName",
    label: "Nombre del cliente",
    icon: <User className="h-3.5 w-3.5" />,
  },
  {
    value: "customerEmail",
    label: "Correo electrónico",
    icon: <Mail className="h-3.5 w-3.5" />,
  },
  {
    value: "customerId",
    label: "Cédula",
    icon: <CreditCard className="h-3.5 w-3.5" />,
  },
  { value: "slCode", label: "SmartID", icon: <Hash className="h-3.5 w-3.5" /> },
  {
    value: "manifestNumber",
    label: "Número de manifiesto",
    icon: <FileText className="h-3.5 w-3.5" />,
  },
  {
    value: "trackingNumber",
    label: "Tracking",
    icon: <MapPin className="h-3.5 w-3.5" />,
  },
];

export function InvoiceAdvancedFilters({
  filters,
  onFiltersChange,
  onReset,
  availableRoutes = [],
  availableManifests = [],
  totalResults,
  isLoading = false,
}: InvoiceFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  const activeFilterCount = React.useMemo(() => {
    let count = 0;
    if (filters.searchTerm) count++;
    if (filters.status !== "all") count++;
    if (filters.emailStatus !== "all") count++;
    if (filters.routes.length > 0) count++;
    if (filters.manifests.length > 0) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.customerIds.length > 0) count++;
    if (filters.amountMin !== null || filters.amountMax !== null) count++;
    return count;
  }, [filters]);

  const toggleSearchField = (field: SearchField) => {
    const current = filters.searchFields;
    const updated = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field];
    onFiltersChange({ searchFields: updated });
  };

  const toggleRoute = (route: string) => {
    const current = filters.routes;
    const updated = current.includes(route)
      ? current.filter((r) => r !== route)
      : [...current, route];
    onFiltersChange({ routes: updated });
  };

  const toggleManifest = (manifest: string) => {
    const current = filters.manifests;
    const updated = current.includes(manifest)
      ? current.filter((m) => m !== manifest)
      : [...current, manifest];
    onFiltersChange({ manifests: updated });
  };

  return (
    <div className="space-y-3">
      {/* Main search bar with field selector */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="invoice-search-input"
            aria-label="Buscar facturas"
            value={filters.searchTerm}
            onChange={(e) => onFiltersChange({ searchTerm: e.target.value })}
            placeholder="Buscar facturas..."
            className="pl-10 pr-4"
            disabled={isLoading}
          />
        </div>

        {/* Search fields selector */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              data-testid="search-fields-button"
              variant="outline"
              size="default"
              className="gap-2 min-w-[180px] justify-between"
              aria-label="Seleccionar campos de búsqueda"
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Buscar en ({filters.searchFields.length})
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="end">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground mb-3">
                Campos de búsqueda
              </p>
              {SEARCH_FIELD_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleSearchField(option.value)}
                >
                  <Checkbox
                    data-testid={`search-field-${option.value}`}
                    id={`search-field-${option.value}`}
                    checked={filters.searchFields.includes(option.value)}
                    onCheckedChange={() => toggleSearchField(option.value)}
                  />
                  <Label
                    htmlFor={`search-field-${option.value}`}
                    className="flex items-center gap-2 cursor-pointer flex-1 text-sm"
                  >
                    {option.icon}
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Advanced filters toggle */}
        <Button
          data-testid="toggle-advanced-filters"
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-label={
            showAdvanced
              ? "Ocultar filtros avanzados"
              : "Mostrar filtros avanzados"
          }
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Reset button */}
        {activeFilterCount > 0 && (
          <Button
            data-testid="clear-filters-button"
            type="button"
            variant="ghost"
            size="icon"
            onClick={onReset}
            aria-label="Limpiar filtros"
            title="Limpiar todos los filtros"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Advanced filters panel */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            role="region"
            aria-label="Filtros avanzados"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
              {/* Routes filter */}
              {availableRoutes.length > 0 && (
                <div
                  className="space-y-2"
                  role="group"
                  aria-labelledby="routes-filter-label"
                >
                  <Label
                    id="routes-filter-label"
                    className="text-sm font-semibold"
                  >
                    Rutas
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {availableRoutes.map((route) => (
                      <Badge
                        data-testid={`route-filter-${route.value}`}
                        key={route.value}
                        variant={
                          filters.routes.includes(route.value)
                            ? "default"
                            : "outline"
                        }
                        role="button"
                        tabIndex={0}
                        aria-pressed={filters.routes.includes(route.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRoute(route.value);
                          }
                        }}
                        className="cursor-pointer hover:bg-primary/90"
                        onClick={() => toggleRoute(route.value)}
                      >
                        {route.label}
                        {filters.routes.includes(route.value) && (
                          <X className="h-3 w-3 ml-1" />
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Manifests filter */}
              {availableManifests.length > 0 && (
                <div
                  className="space-y-2"
                  role="group"
                  aria-labelledby="manifests-filter-label"
                >
                  <Label
                    id="manifests-filter-label"
                    className="text-sm font-semibold"
                  >
                    Manifiestos
                  </Label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {availableManifests.map((manifest) => (
                      <Badge
                        data-testid={`manifest-filter-${manifest.value}`}
                        key={manifest.value}
                        variant={
                          filters.manifests.includes(manifest.value)
                            ? "default"
                            : "outline"
                        }
                        role="button"
                        tabIndex={0}
                        aria-pressed={filters.manifests.includes(
                          manifest.value,
                        )}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleManifest(manifest.value);
                          }
                        }}
                        className="cursor-pointer hover:bg-primary/90"
                        onClick={() => toggleManifest(manifest.value)}
                      >
                        {manifest.label}
                        {filters.manifests.includes(manifest.value) && (
                          <X className="h-3 w-3 ml-1" />
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Date range filter */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label
                    id="date-range-label"
                    className="text-sm font-semibold"
                  >
                    Campo de fecha
                  </Label>
                  <Select
                    data-testid="date-range-select"
                    value={filters.dateField}
                    onValueChange={(value: any) =>
                      onFiltersChange({ dateField: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invoiceDate">
                        Fecha de factura
                      </SelectItem>
                      <SelectItem value="dueDate">
                        Fecha de vencimiento
                      </SelectItem>
                      <SelectItem value="createdAt">
                        Fecha de creación
                      </SelectItem>
                      <SelectItem value="emailSentAt">
                        Fecha de envío
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Desde</Label>
                  <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        data-testid="date-from-button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.dateFrom && "text-muted-foreground",
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {filters.dateFrom
                          ? format(new Date(filters.dateFrom), "PPP", {
                              locale: es,
                            })
                          : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        data-testid="date-from-calendar"
                        mode="single"
                        selected={
                          filters.dateFrom
                            ? new Date(filters.dateFrom)
                            : undefined
                        }
                        onSelect={(date) => {
                          const iso = date ? date.toISOString() : null;
                          onFiltersChange({
                            dateFrom: iso,
                            dateTo: iso,
                          });
                          setDateFromOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Hasta</Label>
                  <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        data-testid="date-to-button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.dateTo && "text-muted-foreground",
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {filters.dateTo
                          ? format(new Date(filters.dateTo), "PPP", {
                              locale: es,
                            })
                          : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        data-testid="date-to-calendar"
                        mode="single"
                        selected={
                          filters.dateTo
                            ? new Date(filters.dateTo)
                            : (filters.dateFrom ? new Date(filters.dateFrom) : undefined)
                        }
                        defaultMonth={
                          filters.dateTo
                            ? new Date(filters.dateTo)
                            : (filters.dateFrom ? new Date(filters.dateFrom) : undefined)
                        }
                        onSelect={(date) => {
                          onFiltersChange({
                            dateTo: date ? date.toISOString() : null,
                          });
                          setDateToOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <Separator />

              {/* Amount range filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Monto mínimo
                  </Label>
                  <Input
                    data-testid="amount-min-input"
                    type="number"
                    placeholder="0.00"
                    value={filters.amountMin ?? ""}
                    onChange={(e) =>
                      onFiltersChange({
                        amountMin: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Monto máximo
                  </Label>
                  <Input
                    data-testid="amount-max-input"
                    type="number"
                    placeholder="0.00"
                    value={filters.amountMax ?? ""}
                    onChange={(e) =>
                      onFiltersChange({
                        amountMax: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {isLoading ? (
            "Cargando..."
          ) : (
            <>
              {totalResults} {totalResults === 1 ? "factura" : "facturas"}
              {activeFilterCount > 0 && " (filtradas)"}
            </>
          )}
        </span>
        {activeFilterCount > 0 && (
          <Button
            data-testid="clear-filters-button"
            type="button"
            variant="link"
            size="sm"
            onClick={onReset}
            aria-label="Limpiar filtros"
            className="h-auto p-0 text-xs"
          >
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
