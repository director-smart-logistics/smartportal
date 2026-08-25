import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Check, ArrowRight } from "lucide-react";

interface StatusOption {
  value: string;
  label: string;
}

interface StatusPopoverEditorProps {
  currentStatus: string;
  statusOptions: StatusOption[];
  statusColors: Record<string, string>;
  onSave: (newStatus: string) => void;
  disabled?: boolean;
}

export function StatusPopoverEditor({
  currentStatus,
  statusOptions,
  statusColors,
  onSave,
  disabled = false,
}: StatusPopoverEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const normalizeStatus = (s: string) => {
    if (!s) return s;
    const lower = s.toLowerCase();
    if (lower === "route" || lower === "in_route" || lower === "in-route" || lower === "en_ruta" || lower === "en-ruta") return "on_route";
    if (lower === "transit") return "in_transit";
    if (lower === "held") return "retained";
    if (lower === "pre-alerted") return "pre_alerted";
    return lower;
  };

  const normCurrent = normalizeStatus(currentStatus);
  const currentOption = statusOptions.find((opt) => opt.value === currentStatus || normalizeStatus(opt.value) === normCurrent);
  const pendingOption = statusOptions.find((opt) => opt.value === pendingStatus || (pendingStatus && normalizeStatus(opt.value) === normalizeStatus(pendingStatus)));

  return (
    <>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full flex items-center justify-start px-3 py-2 text-left bg-transparent hover:bg-muted/40 transition-colors cursor-pointer disabled:cursor-not-allowed select-none focus:outline-none"
          >
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-semibold leading-none px-2.5 py-1 rounded-full border-transparent cursor-pointer transition-transform hover:scale-105 active:scale-95",
                statusColors[currentStatus] || statusColors[normCurrent] || "bg-gray-100 text-gray-800"
              )}
            >
              {currentOption?.label || currentStatus}
            </Badge>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-48 p-1 bg-background border border-border shadow-lg rounded-lg z-[300]"
          align="center"
          onClick={(e) => e.stopPropagation()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col space-y-0.5 max-h-[220px] overflow-y-auto scrollbar-thin">
            {statusOptions.map((opt) => {
              const isCurrent = opt.value === currentStatus;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCurrent) return;
                    setPendingStatus(opt.value);
                    setIsOpen(false);
                    setShowConfirmDialog(true);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left text-xs font-medium transition-colors",
                    isCurrent
                      ? "bg-primary/10 text-primary font-semibold cursor-default"
                      : "hover:bg-accent hover:text-accent-foreground text-foreground cursor-pointer"
                  )}
                >
                  <span>{opt.label}</span>
                  {isCurrent && <Check className="h-3 w-3 text-primary shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent
          className="fixed left-[50%] top-[50%] z-[310] translate-x-[-50%] translate-y-[-50%] max-w-[360px] w-[90vw] p-5 rounded-xl border bg-background shadow-xl overflow-hidden focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-bold text-foreground">
              Confirmar Cambio de Estado
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              ¿Estás seguro de que deseas cambiar el estado de este registro?
            </DialogDescription>
          </DialogHeader>

          {/* Estado actual -> Estado nuevo visual block */}
          <div className="my-4 flex flex-col items-center justify-center p-3 bg-muted/40 border border-border rounded-lg gap-2">
            <div className="flex flex-col items-center min-w-0 w-full">
              <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
                Estado Actual
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold leading-none px-2.5 py-1 rounded-full border-transparent shadow-sm truncate max-w-full",
                  statusColors[currentStatus] || "bg-gray-100 text-gray-800"
                )}
              >
                {currentOption?.label || currentStatus}
              </Badge>
            </div>

            <div className="flex items-center justify-center w-full py-1">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="flex flex-col items-center min-w-0 w-full">
              <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
                Nuevo Estado
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold leading-none px-2.5 py-1 rounded-full border-transparent shadow-sm truncate max-w-full",
                  pendingStatus && statusColors[pendingStatus] || "bg-gray-100 text-gray-800"
                )}
              >
                {pendingOption?.label || pendingStatus}
              </Badge>
            </div>
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2 mt-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirmDialog(false);
                setPendingStatus(null);
              }}
              className="h-8 text-xs flex-1 sm:flex-none border-border"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (pendingStatus) {
                  onSave(pendingStatus);
                }
                setShowConfirmDialog(false);
                setPendingStatus(null);
              }}
              className="h-8 text-xs flex-1 sm:flex-none bg-red-700 hover:bg-red-800 text-white font-semibold"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
