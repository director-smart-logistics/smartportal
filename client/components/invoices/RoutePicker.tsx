import React, { useState } from "react";
import { Check, Edit2, Loader2, MapPin, Package } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useRouteOptions } from "@/components/nova/nova-route-options";
import { getRouteColor } from "@/lib/utils/route-colors";
import { cn } from "@/lib/utils";

interface RoutePickerProps {
  value: string;
  onChange: (newRoute: string) => void;
  routes?: any[];
  changing?: boolean;
  isEncomienda?: boolean;
  encomiendaName?: string;
  align?: "start" | "center" | "end";
  className?: string;
  variant?: "badge" | "pill";
}

export function RoutePicker({
  value,
  onChange,
  routes,
  changing = false,
  isEncomienda = false,
  encomiendaName,
  align = "start",
  className,
  variant = "badge",
}: RoutePickerProps) {
  const [open, setOpen] = useState(false);
  const dbRoutes = useRouteOptions();

  // Determine final routes list: either prop `routes` or fetched `dbRoutes`
  const activeRoutes = React.useMemo(() => {
    const list = routes || dbRoutes;
    // Map to simple shape { name: string }
    const mapped = list.map((r: any) => ({
      name: typeof r === "string" ? r : r.name || "",
    }));
    // Dedup and filter empty
    const seen = new Set<string>();
    return mapped.filter((r) => {
      if (!r.name) return false;
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [routes, dbRoutes]);

  const rc = value ? getRouteColor(value) : null;
  const isEnc = isEncomienda || value === "Encomiendas";
  const labelText = isEnc && encomiendaName ? encomiendaName : (value || "Asignar ruta");
  const labelTitle = isEnc
    ? (encomiendaName ? `Servicio de encomienda: ${encomiendaName}` : "Servicio de encomienda no asignado")
    : undefined;

  const triggerElement = variant === "pill" ? (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
      className={cn(
        "group flex items-center gap-1.5 cursor-pointer px-3 py-2 hover:bg-gray-100/60 dark:hover:bg-slate-800/40 transition-colors w-full h-full min-w-[80px] font-medium text-gray-800 dark:text-gray-200 select-none",
        className
      )}
    >
      {value ? (
        <span
          className={cn(
            "text-xs font-medium shrink-0 px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap border border-transparent",
            rc?.bg || "bg-slate-250",
            rc?.text || "text-slate-700"
          )}
        >
          {labelText}
        </span>
      ) : (
        <span className="text-xs text-gray-400 italic">sin ruta</span>
      )}
      {changing ? (
        <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-auto shrink-0" />
      ) : (
        <Edit2 className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
      )}
    </div>
  ) : (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      title={labelTitle}
      aria-label={labelTitle || (value ? `Cambiar ruta (actual: ${value})` : "Asignar ruta")}
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-medium rounded px-1.5 py-0.5 border cursor-pointer hover:opacity-75 transition-opacity max-w-[180px]",
        value && rc ? cn(rc.bg, rc.border, rc.text) : "bg-muted/30 border-border text-muted-foreground",
        className
      )}
    >
      {changing ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
      ) : isEnc ? (
        <Package className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      ) : (
        <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{labelText}</span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerElement}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-56 p-0 bg-white border border-gray-200 shadow-lg rounded-lg z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Buscar ruta..." className="h-9 text-sm" />
          <CommandList>
            <CommandEmpty className="text-sm text-gray-500 py-3">
              Sin resultados
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-gray-400 italic text-xs flex items-center gap-2 cursor-pointer py-1.5 px-2.5 hover:bg-accent"
              >
                <div className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                <span className="flex-1">Sin ruta</span>
                {!value && (
                  <Check className="h-3.5 w-3.5 text-gray-400 ml-auto" />
                )}
              </CommandItem>
              {activeRoutes.map((rOpt) => {
                const rc2 = getRouteColor(rOpt.name);
                const isSelected = value?.toLowerCase() === rOpt.name.toLowerCase();
                return (
                  <CommandItem
                    key={rOpt.name}
                    value={rOpt.name}
                    onSelect={() => {
                      onChange(rOpt.name);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 cursor-pointer py-1.5 px-2.5 hover:bg-accent"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rc2.swatch }} />
                    <span className={cn("text-xs flex-1", isSelected && "font-semibold")}>
                      {rOpt.name}
                    </span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-gray-700 ml-auto" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
