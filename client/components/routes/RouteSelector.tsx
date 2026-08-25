import { useLocale } from "@/hooks/useLocale";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Route {
  id: string;
  name: string;
  status: string;
  destinationLocation?: string;
}

interface RouteSelectorProps {
  value?: string | null;
  onValueChange: (value: string | undefined) => void;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  label?: string;
  placeholder?: string;
  showInfo?: boolean;
  className?: string;
}

export function RouteSelector({
  value,
  onValueChange,
  disabled = false,
  error,
  required = false,
  label,
  placeholder,
  showInfo = true,
  className,
}: RouteSelectorProps) {
  const { t } = useLocale(["customers", "common"]);

  // Fetch active routes only
  const { data: routes = [], isLoading } = useQuery<Route[]>({
    queryKey: ["routes", "active"],
    queryFn: async () => {
      const response = await fetch("/api/routes?status=active");
      if (!response.ok) {
        throw new Error("Failed to fetch routes");
      }
      return response.json();
    },
  });

  const handleValueChange = (newValue: string) => {
    // Handle "none" selection to clear the route
    if (newValue === "__none__") {
      onValueChange(undefined);
    } else {
      onValueChange(newValue);
    }
  };

  const displayLabel = label || t("customers.preferredRoute");
  const displayPlaceholder = placeholder || t("customers.selectRoute");

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label */}
      <Label
        htmlFor="route-selector"
        className={cn("text-sm font-medium", {
          "text-red-500": error,
        })}
      >
        {displayLabel}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </Label>

      {/* Select Component */}
      <Select
        value={value || "__none__"}
        onValueChange={handleValueChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger
          id="route-selector"
          className={cn(
            "w-full",
            { "border-red-500": error },
            { "opacity-50 cursor-not-allowed": disabled || isLoading },
          )}
          aria-invalid={!!error}
          aria-describedby={
            error ? "route-error" : showInfo ? "route-info" : undefined
          }
          aria-label={displayLabel}
          aria-required={required}
          data-testid="route-selector"
        >
          <SelectValue
            placeholder={isLoading ? t("common.loading") : displayPlaceholder}
          />
        </SelectTrigger>

        <SelectContent data-testid="route-selector-content">
          {/* None option */}
          <SelectItem value="__none__" data-testid="route-option-none">
            <span className="text-muted-foreground italic">
              {t("customers.noRouteSelected")}
            </span>
          </SelectItem>

          {/* Active routes */}
          {routes.map((route) => (
            <SelectItem
              key={route.id}
              value={route.id}
              data-testid={`route-option-${route.id}`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">{route.name}</span>
                {route.destinationLocation && (
                  <span className="text-xs text-muted-foreground ml-2">
                    → {route.destinationLocation}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}

          {/* Empty state */}
          {!isLoading && routes.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("common.noResults")}
            </div>
          )}
        </SelectContent>
      </Select>

      {/* Info Message */}
      {showInfo && !error && (
        <div
          id="route-info"
          className="flex items-start gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <InfoIcon
            className="w-3 h-3 mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <span>{t("customers.routeWillAutoSync")}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <p
          id="route-error"
          className="text-xs text-red-500 flex items-center gap-1"
          role="alert"
          aria-live="assertive"
          data-testid="route-error"
        >
          <span className="font-medium">⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}
