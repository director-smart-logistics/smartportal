/**
 * DeleteCustomerModal — Safe customer deletion with risk assessment.
 *
 * Risk levels:
 *  - HIGH:  customer.isVerified AND recentPackageCount > 0 → 3-step flow
 *  - LOW:   everything else                                → 2-step flow
 *
 * @module components/DeleteCustomerModal
 */

import { useState, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  AlertOctagon,
  Package,
  BadgeCheck,
  Clock,
  Loader2,
  Trash2,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useDeleteCustomer } from "@/lib/hooks/queries/useCustomers";
import type { Customer, Package as Pkg } from "@/types";

type Step = "warn" | "confirm" | "type";
type RiskLevel = "high" | "low";

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-CR", { dateStyle: "medium" });
  } catch {
    return "—";
  }
}

interface DeleteCustomerModalProps {
  isOpen: boolean;
  customer: Customer;
  packages: Pkg[];
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteCustomerModal({
  isOpen,
  customer,
  packages,
  onClose,
  onDeleted,
}: DeleteCustomerModalProps) {
  const { mutateAsync: deleteCustomer, isPending: deleting } =
    useDeleteCustomer();

  // --- Risk assessment (computed from props — no async needed) ---
  const recentPackageCount = useMemo(() => {
    const cutoff = new Date(Date.now() - SIX_MONTHS_MS).toISOString();
    return packages.filter((p) => {
      const d = (p as any).updatedAt || (p as any).createdAt;
      return d && d >= cutoff;
    }).length;
  }, [packages]);

  const riskLevel: RiskLevel =
    customer.isVerified && recentPackageCount > 0 ? "high" : "low";

  const stepCount = riskLevel === "high" ? 3 : 2;
  const expectedConfirm = customer.slCode || customer.email || "";

  const [step, setStep] = useState<Step>("warn");
  const [understood, setUnderstood] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state on open
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !deleting) {
        onClose();
        // Reset after animation
        setTimeout(() => {
          setStep("warn");
          setUnderstood(false);
          setConfirmText("");
          setError(null);
        }, 200);
      }
    },
    [deleting, onClose],
  );

  const currentStepNumber =
    step === "warn" ? 1 : step === "confirm" ? 2 : stepCount;

  const handleDelete = useCallback(async () => {
    if (confirmText.trim().toLowerCase() !== expectedConfirm.toLowerCase())
      return;
    setError(null);
    try {
      await deleteCustomer(customer.id);
      onDeleted();
      onClose();
    } catch (err: any) {
      setError(
        err?.message || "Error al eliminar el cliente. Intenta de nuevo.",
      );
    }
  }, [
    confirmText,
    expectedConfirm,
    deleteCustomer,
    customer.id,
    onDeleted,
    onClose,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md gap-0 p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header strip */}
        <div
          className={cn(
            "px-5 pt-5 pb-4 border-b",
            riskLevel === "high"
              ? "bg-red-50 border-red-200"
              : "bg-amber-50 border-amber-200",
          )}
        >
          {/* Step progress */}
          <div className="flex items-center gap-1.5 mb-3">
            {Array.from({ length: stepCount }).map((_, i) => (
              <>
                <div
                  key={i}
                  className={cn(
                    "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center",
                    i + 1 < currentStepNumber
                      ? "bg-slate-400 text-white"
                      : i + 1 === currentStepNumber
                        ? riskLevel === "high"
                          ? "bg-red-600 text-white"
                          : "bg-amber-600 text-white"
                        : "bg-slate-200 text-slate-400",
                  )}
                >
                  {i + 1}
                </div>
                {i < stepCount - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 rounded",
                      i + 1 < currentStepNumber
                        ? "bg-slate-400"
                        : "bg-slate-200",
                    )}
                  />
                )}
              </>
            ))}
            <span className="ml-2 text-[10px] font-medium text-slate-500">
              Paso {currentStepNumber} de {stepCount}
            </span>
          </div>

          {/* Customer chip */}
          <div className="flex items-center gap-2">
            {customer.photoURL ? (
              <img
                src={customer.photoURL}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-slate-500">
                  {(customer.firstName?.[0] || "?").toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">
                {customer.fullName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {customer.email}
              </p>
            </div>
            {customer.slCode && (
              <span className="shrink-0 font-mono text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">
                {customer.slCode}
              </span>
            )}
          </div>
        </div>

        {/* ── STEP 1: WARN ── */}
        {step === "warn" && (
          <>
            <DialogHeader className="px-5 pt-4 pb-2 space-y-0">
              <div className="flex items-start gap-3">
                {riskLevel === "high" ? (
                  <AlertOctagon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900 leading-snug">
                    {riskLevel === "high"
                      ? "Cliente con actividad reciente"
                      : "Eliminar cliente"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-slate-600">
                    {riskLevel === "high"
                      ? "Este cliente está verificado y tiene paquetes con movimiento reciente. Esta acción no es sugerida."
                      : "Esta acción eliminará permanentemente la cuenta del cliente."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="px-5 pb-4 space-y-3">
              {/* High-risk summary */}
              {riskLevel === "high" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                    Señales de riesgo detectadas
                  </p>
                  <div className="space-y-1.5">
                    {customer.isVerified && (
                      <div className="flex items-center gap-2 text-xs text-red-800">
                        <BadgeCheck className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        Cuenta verificada activa
                      </div>
                    )}
                    {recentPackageCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-red-800">
                        <Package className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        {recentPackageCount} paquete
                        {recentPackageCount !== 1 ? "s" : ""} con movimiento en
                        los últimos 6 meses
                      </div>
                    )}
                    {customer.lastLoginAt && (
                      <div className="flex items-center gap-2 text-xs text-red-800">
                        <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        Último acceso: {formatDate(customer.lastLoginAt)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Consequence list */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Consecuencias de la eliminación
                </p>
                {[
                  "El cliente perderá acceso a su cuenta inmediatamente",
                  "El historial de paquetes e invoices permanecerá en el sistema",
                  "Los datos de perfil se eliminarán de la colección de clientes",
                  "Esta acción puede revertirse contactando al soporte técnico",
                ].map((c) => (
                  <div
                    key={c}
                    className="flex items-start gap-2 text-xs text-slate-700"
                  >
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                    {c}
                  </div>
                ))}
              </div>

              {/* Checkbox for high risk */}
              {riskLevel === "high" && (
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    className="mt-0.5 accent-red-600"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    Entiendo que este cliente tiene actividad reciente y que
                    eliminar su cuenta{" "}
                    <strong className="text-red-700">
                      no es una acción sugerida
                    </strong>
                    .
                  </span>
                </label>
              )}
            </div>

            <DialogFooter className="px-5 pb-5 pt-0 flex items-center justify-end gap-2 sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="min-w-[80px]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={riskLevel === "high" && !understood}
                onClick={() =>
                  setStep(riskLevel === "high" ? "confirm" : "type")
                }
                className={cn(
                  "min-w-[120px] gap-1.5",
                  riskLevel === "high"
                    ? "bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
                    : "bg-amber-600 hover:bg-amber-700 text-white",
                )}
              >
                Continuar
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 2 (high risk): DANGER CONFIRM ── */}
        {step === "confirm" && (
          <>
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-bold text-slate-900 leading-snug">
                    ¿Estás absolutamente seguro?
                  </p>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                    Estás a punto de eliminar un cliente verificado con
                    actividad operativa activa. Esta acción{" "}
                    <strong className="text-red-600">no es reversible</strong>{" "}
                    sin intervención del equipo técnico.
                  </p>
                </div>
              </div>
            </div>

            <div className="mx-5 mb-4 rounded-xl bg-red-600 text-white p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                Advertencia crítica
              </p>
              <p className="text-sm leading-relaxed">
                Al continuar se eliminará permanentemente el perfil de{" "}
                <strong>{customer.fullName}</strong> (
                {customer.slCode || customer.email}) del sistema de
                SmartLogistics.
              </p>
            </div>

            <DialogFooter className="px-5 pb-5 pt-0 flex items-center justify-end gap-2 sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="min-w-[80px]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => setStep("type")}
                className="min-w-[140px] bg-red-600 hover:bg-red-700 text-white gap-1.5"
              >
                Aún así continuar
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── FINAL STEP: TYPE TO CONFIRM ── */}
        {step === "type" && (
          <>
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-start gap-3">
                <Trash2 className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-bold text-slate-900 leading-snug">
                    Confirmar eliminación
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Escribe{" "}
                    <code className="font-mono bg-slate-100 text-slate-900 px-1.5 py-0.5 rounded text-xs">
                      {expectedConfirm}
                    </code>{" "}
                    para confirmar.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4 space-y-3">
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedConfirm}
                className={cn(
                  "h-10 font-mono text-sm",
                  confirmText &&
                    confirmText.toLowerCase() !== expectedConfirm.toLowerCase()
                    ? "border-red-300 focus:ring-red-300"
                    : confirmText.toLowerCase() ===
                        expectedConfirm.toLowerCase()
                      ? "border-green-400 focus:ring-green-400"
                      : "",
                )}
                autoFocus
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    confirmText.toLowerCase() === expectedConfirm.toLowerCase()
                  ) {
                    handleDelete();
                  }
                }}
                aria-label={`Escribe ${expectedConfirm} para confirmar la eliminación`}
              />
              {error && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="px-5 pb-5 pt-0 flex items-center justify-end gap-2 sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={deleting}
                className="min-w-[80px]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={
                  confirmText.toLowerCase() !== expectedConfirm.toLowerCase() ||
                  deleting
                }
                onClick={handleDelete}
                className="min-w-[140px] bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 gap-1.5"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Eliminando…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar cliente
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
