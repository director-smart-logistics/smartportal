import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusToggleProps {
  value: "active" | "inactive" | "suspended";
  onChange: (value: "active" | "inactive") => void;
  onEditClick?: () => void;
  disabled?: boolean;
}

export const StatusToggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  StatusToggleProps
>(({ value, onChange, onEditClick, disabled = false }, ref) => {
  const isActive = value === "active";

  return (
    <div className="flex items-center gap-2">
      <TogglePrimitive.Root
        ref={ref}
        pressed={isActive}
        onPressedChange={(pressed) => {
          onChange(pressed ? "active" : "inactive");
        }}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-colors",
          "h-6 w-11 bg-gray-300 dark:bg-gray-600",
          isActive && "bg-gray-500 dark:bg-gray-600",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white transition-transform",
            isActive && "translate-x-2.5",
            !isActive && "-translate-x-2.5",
          )}
        />
      </TogglePrimitive.Root>

      {value === "suspended" && (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-xs">
            Suspended
          </Badge>
          {onEditClick && (
            <button
              onClick={onEditClick}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Change
            </button>
          )}
        </div>
      )}
    </div>
  );
});

StatusToggle.displayName = "StatusToggle";
