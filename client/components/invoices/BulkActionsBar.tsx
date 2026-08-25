import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Send,
  Scale,
  GitMerge,
  ChevronDown,
  RefreshCw,
  TrendingUp,
  Trash2,
  X,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface BulkProgress {
  done: number;
  total: number;
}

interface BulkActionsBarProps {
  selectedCount: number;
  bulkSending: boolean;
  bulkDeleting: boolean;
  bulkStripping: boolean;
  bulkMerging: boolean;
  bulkUpdatingStatus: boolean;
  bulkSyncingInvoices: boolean;
  bulkTcSubmitting: boolean;
  bulkProgress: BulkProgress | null;
  canMerge: boolean;
  onClearSelection: () => void;
  onBulkEmail: () => void;
  onBulkStrip: () => void;
  onBulkMerge: () => void;
  onBulkStatus: (status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "annulled") => void;
  onBulkSync: () => void;
  onBulkTcUpdate: () => void;
  onBulkPaymentMethod?: () => void;
  onBulkDelete: () => void;
  t: any;
}

export const BulkActionsBar = React.memo(function BulkActionsBar({
  selectedCount,
  bulkSending,
  bulkDeleting,
  bulkStripping,
  bulkMerging,
  bulkUpdatingStatus,
  bulkSyncingInvoices,
  bulkTcSubmitting,
  bulkProgress,
  canMerge,
  onClearSelection,
  onBulkEmail,
  onBulkStrip,
  onBulkMerge,
  onBulkStatus,
  onBulkSync,
  onBulkTcUpdate,
  onBulkPaymentMethod,
  onBulkDelete,
  t,
}: BulkActionsBarProps) {
  const isAnySubmitting =
    bulkSending ||
    bulkDeleting ||
    bulkStripping ||
    bulkMerging ||
    bulkUpdatingStatus ||
    bulkSyncingInvoices ||
    bulkTcSubmitting;

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95vw] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
            className="pointer-events-auto w-full max-w-full"
          >
            <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-900 border border-gray-800 shadow-2xl rounded-xl overflow-x-auto scrollbar-none select-none text-white w-full max-w-full">
              {/* Status Indicator */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex h-5 items-center justify-center rounded-full bg-white/15 px-2.5 text-[11px] font-bold text-white">
                  {selectedCount}
                </div>
                <span className="text-[11px] font-semibold text-gray-300 hidden sm:inline">
                  {selectedCount === 1 ? "factura seleccionada" : "facturas seleccionadas"}
                </span>
              </div>

              <div className="h-4 w-px bg-gray-700/60 shrink-0" />

              {/* Main Action Group */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Enviar Email */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isAnySubmitting}
                  onClick={onBulkEmail}
                  className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-white hover:bg-white/10 hover:text-white shrink-0"
                >
                  {bulkSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "Enviando..."}
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Enviar Email</span>
                    </>
                  )}
                </Button>

                {/* Quitar Redondeo */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isAnySubmitting}
                  onClick={onBulkStrip}
                  className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-white hover:bg-white/10 hover:text-white shrink-0"
                >
                  {bulkStripping ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      "Quitando..."
                    </>
                  ) : (
                    <>
                      <Scale className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Quitar Redondeo</span>
                    </>
                  )}
                </Button>

                {/* Fusionar */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canMerge || isAnySubmitting}
                  onClick={onBulkMerge}
                  className={cn(
                    "h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-white hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent shrink-0",
                    canMerge && "text-violet-400 hover:text-violet-300 hover:bg-violet-500/20"
                  )}
                  title={canMerge ? "Fusionar facturas seleccionadas" : "Selecciona 2+ facturas del mismo cliente"}
                >
                  {bulkMerging ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Fusionando...
                    </>
                  ) : (
                    <>
                      <GitMerge className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Fusionar</span>
                    </>
                  )}
                </Button>

                {/* Estado Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isAnySubmitting}
                      className="h-8 rounded-lg text-xs px-3 font-medium gap-1 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 shrink-0"
                    >
                      {bulkUpdatingStatus ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : "..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          <span className="hidden sm:inline">Estado</span>
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs bg-gray-900 border-gray-800 text-white">
                    {([
                      { value: "draft", label: "Borrador", cls: "text-gray-400" },
                      { value: "sent", label: "Enviado", cls: "text-blue-400" },
                      { value: "paid", label: "Pagado", cls: "text-emerald-400" },
                      { value: "overdue", label: "Vencido", cls: "text-amber-400" },
                      { value: "cancelled", label: "Cancelado", cls: "text-red-400" },
                      { value: "annulled", label: "Anulada", cls: "text-gray-400" },
                    ] as const).map(({ value, label, cls }) => (
                      <DropdownMenuItem
                        key={value}
                        className={cn("text-xs gap-2 cursor-pointer focus:bg-white/10 focus:text-white", cls)}
                        onSelect={() => onBulkStatus(value)}
                      >
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Sync SmartWeb */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isAnySubmitting}
                  onClick={onBulkSync}
                  className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 shrink-0"
                  title="Sincronizar facturas con SmartWeb"
                >
                  {bulkSyncingInvoices ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sincronizando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">Sync SmartWeb</span>
                    </>
                  )}
                </Button>

                {/* Actualizar Tipo de Cambio */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isAnySubmitting}
                  onClick={onBulkTcUpdate}
                  className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 shrink-0"
                  title="Actualizar tipo de cambio en facturas seleccionadas"
                >
                  {bulkTcSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">Actualizar TC</span>
                    </>
                  )}
                </Button>

                {/* Actualizar Medio de Pago / Datos Fiscales */}
                {onBulkPaymentMethod && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isAnySubmitting}
                    onClick={onBulkPaymentMethod}
                    className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 shrink-0"
                    title="Actualizar medio de pago y condición de venta en facturas seleccionadas"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Medio de Pago</span>
                  </Button>
                )}

                <div className="h-4 w-px bg-gray-700/60 shrink-0" />

                {/* Eliminar (Danger action) */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isAnySubmitting}
                  onClick={onBulkDelete}
                  className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 shrink-0"
                >
                  {bulkDeleting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Eliminar</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="h-4 w-px bg-gray-700/60 shrink-0" />

              {/* Clear button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearSelection}
                disabled={isAnySubmitting}
                className="h-7 w-7 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 shrink-0"
                title="Deseleccionar todo"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
