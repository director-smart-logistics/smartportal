import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2, X } from "lucide-react";

interface Customer {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string;
  slCode?: string;
}

interface CustomerSearchInputProps {
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer) => void;
  onSearchTermChange?: (term: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function CustomerSearchInput({
  customers,
  selectedCustomer,
  onSelectCustomer,
  onSearchTermChange,
  isLoading = false,
  disabled = false,
}: CustomerSearchInputProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(customer);
    setSearchTerm(customer.fullName);
    setShowSuggestions(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || customers.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < customers.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < customers.length) {
          handleSelectCustomer(customers[focusedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        setFocusedIndex(-1);
        break;
    }
  };

  useEffect(() => {
    if (selectedCustomer) {
      setSearchTerm(selectedCustomer.fullName);
    } else {
      setSearchTerm("");
    }
  }, [selectedCustomer]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    onSearchTermChange?.(val);
    setShowSuggestions(true);
    setFocusedIndex(-1);
    if (!val && selectedCustomer) {
      onSelectCustomer(null as any);
    }
  };

  const handleClear = () => {
    setSearchTerm("");
    onSearchTermChange?.("");
    onSelectCustomer(null as any);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const showDropdown = showSuggestions && searchTerm.length >= 2;

  return (
    <div className="w-full relative" data-testid="customer-search-input">
      <div className="relative">
        {isLoading ? (
          <Loader2
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            aria-hidden="true"
          />
        )}
        <Input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar por nombre, apellido, correo, SL, DNI…"
          disabled={disabled}
          className="pl-10 pr-8 bg-white border-gray-300"
          aria-label="Buscar cliente"
          aria-autocomplete="list"
          aria-controls="customer-suggestions"
          aria-expanded={showDropdown && customers.length > 0}
          data-testid="customer-search-field"
          autoComplete="off"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Limpiar búsqueda"
            tabIndex={-1}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          id="customer-suggestions"
          role="listbox"
          data-testid="customer-suggestions"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
              <span>Buscando…</span>
            </div>
          ) : customers.length > 0 ? (
            <ul
              className="max-h-64 overflow-y-auto divide-y divide-gray-50"
              role="presentation"
            >
              {customers.map((customer, index) => (
                <li key={customer.id} role="presentation">
                  <button
                    onClick={() => handleSelectCustomer(customer)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    type="button"
                    className={`w-full text-left px-4 py-2.5 transition-colors focus:outline-none focus:bg-blue-50 ${
                      index === focusedIndex ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                    role="option"
                    aria-selected={selectedCustomer?.id === customer.id}
                    data-testid={`customer-option-${customer.id}`}
                  >
                    <div className="font-medium text-sm text-gray-900 leading-tight">
                      {customer.fullName}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {customer.slCode && (
                        <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                          {customer.slCode}
                        </span>
                      )}
                      {customer.email && (
                        <span className="text-xs text-gray-400 truncate">
                          {customer.email}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="px-4 py-3 text-sm text-gray-500 text-center"
              data-testid="no-customers-found"
            >
              Sin resultados para "{searchTerm}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
