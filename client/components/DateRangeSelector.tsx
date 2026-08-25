import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "@/lib/utils/dateUtils";
import {
  getLastNMonths,
  getCurrentYear,
  getPreviousYear,
  getCustomRange,
  formatDate,
} from "@/lib/utils/dateUtils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DateRangeSelectorProps {
  onRangeChange: (range: DateRange) => void;
  currentRange?: DateRange;
  compact?: boolean;
}

export function DateRangeSelector({
  onRangeChange,
  currentRange,
  compact = false,
}: DateRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const presets = [
    { label: "Last 3 Months", range: getLastNMonths(3) },
    { label: "Last 6 Months", range: getLastNMonths(6) },
    { label: "Last 12 Months", range: getLastNMonths(12) },
    { label: "Current Year", range: getCurrentYear() },
    { label: "Previous Year", range: getPreviousYear() },
  ];

  const handlePreset = (range: DateRange) => {
    onRangeChange(range);
    setShowCustom(false);
  };

  const handleCustom = () => {
    if (customStart && customEnd) {
      const range = getCustomRange(new Date(customStart), new Date(customEnd));
      onRangeChange(range);
      setShowCustom(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <select
          onChange={(e) => {
            const preset = presets.find((p) => p.label === e.target.value);
            if (preset) {
              handlePreset(preset.range);
            }
          }}
          className="text-sm px-2 py-1 rounded border border-input bg-background"
          defaultValue={currentRange?.label || "Last 6 Months"}
        >
          {presets.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <TooltipProvider key={preset.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={
                    currentRange?.label === preset.label ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => handlePreset(preset.range)}
                >
                  {preset.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p>Filter by {preset.label.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showCustom ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCustom(!showCustom)}
              >
                Custom
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <p>Set a custom date range</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {showCustom && (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomStart(val);
                  setCustomEnd(val);
                }}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Date</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCustom}
                  size="sm"
                  className="w-full"
                  disabled={!customStart || !customEnd}
                >
                  Apply Custom Range
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>Apply the selected date range</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {currentRange && (
        <p className="text-xs text-muted-foreground">
          {formatDate(currentRange.startDate)} to{" "}
          {formatDate(currentRange.endDate)}
        </p>
      )}
    </div>
  );
}
