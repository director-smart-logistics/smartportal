import * as React from "react";
import { cn } from "@/lib/utils";
import { Plane, Ship, Truck, Package } from "lucide-react";

interface PackageTypeOption {
  value: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

interface PackageTypeSelectorProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  options?: PackageTypeOption[];
  className?: string;
}

const defaultOptions: PackageTypeOption[] = [
  {
    value: "air",
    label: "Air",
    icon: <Plane className="h-4 w-4" />,
    description: "Air freight",
  },
  {
    value: "sea",
    label: "Sea",
    icon: <Ship className="h-4 w-4" />,
    description: "Sea freight",
  },
  {
    value: "freight",
    label: "Freight",
    icon: <Truck className="h-4 w-4" />,
    description: "Ground freight",
  },
  {
    value: "local",
    label: "Local",
    icon: <Package className="h-4 w-4" />,
    description: "Local delivery",
  },
];

export function PackageTypeSelector({
  value,
  onChange,
  options = defaultOptions,
  className,
}: PackageTypeSelectorProps) {
  const handleClear = () => {
    onChange(undefined);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Package Type</label>
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(isSelected ? undefined : option.value)}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background",
              )}
            >
              <div
                className={cn(
                  "mb-1 p-2 rounded-md",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {option.icon}
              </div>
              <span className="text-sm font-medium">{option.label}</span>
              {option.description && (
                <span className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {value && (
        <div className="text-xs text-muted-foreground">
          Selected: {options.find((o) => o.value === value)?.label}
        </div>
      )}
    </div>
  );
}
