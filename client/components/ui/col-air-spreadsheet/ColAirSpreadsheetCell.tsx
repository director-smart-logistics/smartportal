import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface SpreadsheetCellProps {
  value: string | number;
  onChange?: (val: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  rowIdx: number;
  colIdx: number;
  readOnly?: boolean;
  type?: "text" | "number";
  placeholder?: string;
  className?: string;
  testId?: string;
  id?: string;
}

export const SpreadsheetCell = memo(function SpreadsheetCell({
  value,
  onChange,
  onKeyDown,
  onPaste,
  rowIdx,
  colIdx,
  readOnly = false,
  type = "text",
  placeholder,
  className,
  testId,
  id,
}: SpreadsheetCellProps) {
  return (
    <div
      className={cn(
        "relative flex-1 border-r border-b border-border min-w-[120px]",
        className,
      )}
    >
      <input
        id={id}
        data-row={rowIdx}
        data-col={colIdx}
        data-testid={testId || `cell-${rowIdx}-${colIdx}`}
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={placeholder}
        className={cn(
          "w-full h-full px-3 py-2 text-sm outline-none transition-colors",
          "focus:ring-2 focus:ring-[hsl(var(--manifest-brand))] focus:z-10 relative bg-transparent",
          readOnly
            ? "bg-muted/30 text-muted-foreground font-medium"
            : "hover:bg-accent/10",
        )}
      />
    </div>
  );
});
