import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCustomerSearch } from "@/lib/hooks/queries/useCustomers";
import { Loader2 } from "lucide-react";

export interface AutocompleteCustomer {
  id: string;
  fullName: string;
  slCode: string;
  deliveryAddress1?: string;
  email: string;
  country?: string;
  ruta?: string | null;
}

interface CustomerAutocompleteProps {
  value: string;
  onChange: (customerId: string, customerName: string) => void;
  onCustomerSelect?: (customer: AutocompleteCustomer) => void;
  onInputChange?: (rawValue: string) => void;
  placeholder?: string;
  className?: string;
  displayValue?: "fullName" | "slCode";
  id?: string;
  "data-row"?: number;
  "data-col"?: number;
}

export function CustomerAutocomplete({
  value,
  onChange,
  onCustomerSelect,
  onInputChange,
  placeholder = "Search by name or account code...",
  className = "",
  displayValue = "fullName",
  id,
  "data-row": dataRow,
  "data-col": dataCol,
}: CustomerAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value ?? "");
  const [isSelected, setIsSelected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value ?? "");
      setIsSelected(!!value?.trim());
    }
  }, [value]); // intentionally not including inputValue in dependencies to avoid loops, value is the source of truth from parent

  const { results, isLoading } = useCustomerSearch(inputValue, 280, 50);

  const suggestions: AutocompleteCustomer[] = results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    slCode: r.slCode ?? "N/A",
    deliveryAddress1: (r as any).deliveryAddress1,
    email: r.email ?? "",
    country: (r as any).country,
    ruta: (r as any).ruta ?? null,
  }));

  const [isFocused, setIsFocused] = useState(false);
  const open = isFocused && !isSelected && inputValue.trim().length >= 2;

  const handleSelect = (customer: AutocompleteCustomer) => {
    setIsSelected(true);
    const textToDisplay =
      displayValue === "slCode" && customer.slCode && customer.slCode !== "N/A"
        ? customer.slCode
        : customer.fullName;
    setInputValue(textToDisplay);
    onChange(customer.id, customer.fullName);
    onCustomerSelect?.(customer);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <Popover open={open} onOpenChange={setIsFocused}>
      <PopoverTrigger asChild>
        <div className="relative w-full h-full">
          <Input
            id={id}
            data-row={dataRow}
            data-col={dataCol}
            ref={inputRef}
            type="text"
            value={inputValue}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => {
              setIsSelected(false);
              setIsFocused(true);
              let val = e.target.value;
              if (/^\d+$/.test(val)) {
                val = `SL${val}`;
              }
              setInputValue(val);
              onInputChange?.(val);
            }}
            onKeyDown={(e) => {
              if (open) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.stopPropagation();
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (suggestions.length > 0) {
                    handleSelect(suggestions[0]);
                  }
                  setIsFocused(false);
                }
              }
            }}
            placeholder={placeholder}
            className={className}
            autoComplete="off"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-haspopup="listbox"
          />
          {isLoading && open && (
            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 z-[80]"
        style={{ width: "max(var(--radix-popover-trigger-width), 300px)" }}
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando clientes…
              </div>
            )}
            {!isLoading && (
              <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                No se encontraron clientes para &ldquo;{inputValue}&rdquo;
              </CommandEmpty>
            )}
            <CommandGroup>
              {suggestions.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => handleSelect(customer)}
                  className="flex flex-col items-start gap-0.5 px-3 py-2.5 cursor-pointer"
                >
                  <span className="font-medium text-sm leading-tight">
                    {customer.fullName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {customer.slCode}
                    {customer.email && ` · ${customer.email}`}
                  </span>
                  {customer.deliveryAddress1 && (
                    <span className="text-xs text-muted-foreground/70">
                      {customer.deliveryAddress1}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
