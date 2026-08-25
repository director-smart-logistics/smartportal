import React, { useState } from "react";
import { Edit2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface InlineEditCellProps {
  value: string | number;
  onSave: (newValue: string | number) => void;
  type?: "text" | "number" | "select";
  options?: { label: string | React.ReactNode; value: string }[];
  className?: string;
  uppercase?: boolean;
  renderValue?: (value: string | number) => React.ReactNode;
  disabled?: boolean;
  hideButtons?: boolean;
  saveOnBlur?: boolean;
}

export function InlineEditCell({
  value,
  onSave,
  type = "text",
  options = [],
  className = "",
  uppercase = false,
  renderValue,
  disabled = false,
  hideButtons = false,
  saveOnBlur = false,
}: InlineEditCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  // Sync state if external value changes
  React.useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    const finalValue =
      uppercase && typeof editValue === "string"
        ? editValue.toUpperCase()
        : editValue;
    onSave(finalValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div
        className={cn(
          "flex items-center px-3 transition-colors group h-full w-full select-none",
          disabled
            ? "cursor-not-allowed opacity-85 text-gray-400 bg-muted/10"
            : "cursor-pointer hover:bg-gray-100/60 focus:z-10 focus:ring-1 focus:ring-blue-500",
          className
        )}
        onClick={() => {
          if (!disabled) setIsEditing(true);
        }}
        title={disabled ? "No tienes permisos para editar esto" : undefined}
      >
        {renderValue ? (
          <div className="flex-1 min-w-0 flex items-center justify-start">{renderValue(value)}</div>
        ) : (
          <span className="text-xs flex-1 truncate font-medium text-gray-800">
            {value || "—"}
          </span>
        )}
        {!disabled && !hideButtons && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-900"
            aria-label="Edit"
          >
            <Edit2 className="h-4 w-4 stroke-[1.5]" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-stretch w-full h-full relative">
      {type === "select" ? (
        <Select
          value={String(editValue)}
          onValueChange={(val) => {
            if (hideButtons) {
              const finalValue = uppercase ? val.toUpperCase() : val;
              onSave(finalValue);
              setIsEditing(false);
            } else {
              setEditValue(val);
            }
          }}
          onOpenChange={(isOpen) => {
            if (!isOpen && hideButtons) {
              setTimeout(() => setIsEditing(false), 150);
            }
          }}
        >
          <SelectTrigger className="h-full text-xs min-w-[100px] w-full border border-blue-500 ring-1 ring-blue-500 focus:ring-1 focus:ring-blue-500 rounded-none shadow-none bg-white px-3 focus:z-20 flex items-center justify-between">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <input
          type={type}
          value={editValue}
          onChange={(e) => {
            if (type === "number") {
              const parsed = parseFloat(e.target.value);
              setEditValue(isNaN(parsed) ? 0 : parsed);
            } else {
              setEditValue(e.target.value);
            }
          }}
          className="w-full h-full px-3 text-xs outline-none bg-white border border-blue-500 ring-1 ring-blue-500 focus:z-20 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 rounded-none shadow-none font-medium text-gray-800"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          onBlur={() => {
            if (saveOnBlur) {
              handleSave();
            } else {
              handleCancel();
            }
          }}
        />
      )}
      {!hideButtons && (
        <div className="flex items-center gap-0.5 px-1 bg-white border-y border-r border-blue-500 focus-within:z-20">
          <button
            onClick={handleSave}
            className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
            aria-label="Save"
            title="Save (Enter)"
          >
            <Check className="h-3.5 w-3.5 stroke-2" />
          </button>
          <button
            onClick={handleCancel}
            className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
            aria-label="Cancel"
            title="Cancel (Escape)"
          >
            <X className="h-3.5 w-3.5 stroke-2" />
          </button>
        </div>
      )}
    </div>
  );
}
