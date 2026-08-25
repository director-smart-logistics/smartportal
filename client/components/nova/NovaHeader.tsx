import { memo } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NovaHeaderProps {
  title: string;
  subtitle: string;
  clearButtonText: string;
  showClearButton: boolean;
  isProcessing: boolean;
  onClear: () => void;
}

export const NovaHeader = memo(function NovaHeader({
  title,
  clearButtonText,
  showClearButton,
  isProcessing,
  onClear,
}: NovaHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e0e0e0]/60">
      <div className="flex items-center gap-2.5">
        <img src="/logo.svg" alt="" className="h-5 w-5 object-contain" />
        <span className="text-sm font-medium text-[#1f1f1f]">{title}</span>
      </div>
      {showClearButton && (
        <button
          type="button"
          onClick={onClear}
          disabled={isProcessing}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-[#444746]",
            "hover:bg-[#444746]/8 transition-colors",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {clearButtonText}
        </button>
      )}
    </div>
  );
});
