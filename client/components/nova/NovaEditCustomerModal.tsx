import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  UserPen,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { useRouteOptions } from "./nova-route-options";
import { patchCustomerRutaInCache } from "@/lib/services/matching/customer-loader";

interface NovaEditCustomerModalProps {
  isOpen: boolean;
  slCode: string;
  initialData: {
    fullName?: string;
    email?: string;
    dni?: string;
    phone?: string;
    ruta?: string;
  };
  onClose: () => void;
  /**
   * Fired AFTER the cloud function returns success. The payload includes
   * `fullName` so the caller can update its local cache (e.g. NovaTable's
   * `customerContactMap`) immediately, without waiting for the
   * `subscribeCustomersBySlCodes` onSnapshot tick. Without it, the
   * operator briefly sees the OLD name in the table after closing the
   * modal.
   */
  onSuccess: (updated: {
    fullName: string;
    email: string;
    dni: string;
    phone: string;
    ruta: string;
  }) => void;
}

interface FormState {
  fullName: string;
  email: string;
  dni: string;
  phone: string;
  ruta: string;
}

export function NovaEditCustomerModal({
  isOpen,
  slCode,
  initialData,
  onClose,
  onSuccess,
}: NovaEditCustomerModalProps) {
  const [form, setForm] = useState<FormState>({
    fullName: "",
    email: "",
    dni: "",
    phone: "",
    ruta: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sp1Updated, setSp1Updated] = useState(false);
  const [sp2Updated, setSp2Updated] = useState(false);
  const routeOptions = useRouteOptions();

  useEffect(() => {
    if (isOpen) {
      setForm({
        fullName: initialData.fullName || "",
        email: initialData.email || "",
        dni: initialData.dni || "",
        phone: initialData.phone || "",
        ruta: initialData.ruta || "",
      });
      setError(null);
      setDone(false);
      setSp1Updated(false);
      setSp2Updated(false);

    }
  }, [isOpen, initialData]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const executeSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const routeChanged = form.ruta.trim() !== (initialData.ruta || "").trim();
      const autoSyncRutaToSp2 = routeChanged;

      // /v1/projects/...
      const fn = httpsCallable<
        Record<string, unknown>,
        { success: boolean; sp1Updated: boolean; sp2Updated: boolean }
      >(getFunctions(app, "us-central1"), "slUpdateCustomerProfile");
      const result = await fn({
        slCode,
        fullName: form.fullName.trim(),
        email: form.email.trim() || null,
        dni: form.dni.trim() || null,
        phone: form.phone.trim() || null,
        ruta: form.ruta.trim() || null,
        syncRutaToSp2: autoSyncRutaToSp2,
      });

      const { sp1Updated, sp2Updated } = result.data;
      setSp1Updated(sp1Updated);
      setSp2Updated(sp2Updated);
      setDone(true);
      if (form.ruta.trim()) {
        patchCustomerRutaInCache(slCode, form.ruta.trim());
      }
      onSuccess({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        dni: form.dni.trim(),
        phone: form.phone.trim(),
        ruta: form.ruta.trim(),
      });
      setTimeout(() => onClose(), 1800);
    } catch (e: unknown) {
      console.error("[NovaEditCustomer] update failed", e);
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      setError("El nombre es requerido");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Email inválido");
      return;
    }

    await executeSave();
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editar cliente"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <UserPen className="h-4 w-4 text-primary" aria-hidden="true" />
                <div>
                  <span className="text-sm font-semibold text-foreground">
                    Editar cliente
                  </span>
                  <span className="ml-2 text-xs font-mono text-muted-foreground">
                    {slCode}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex flex-col gap-3">
              {/* Nombre */}
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="nova-edit-fullname"
                >
                  Nombre completo
                </label>
                <input
                  id="nova-edit-fullname"
                  type="text"
                  value={form.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Nombre completo del cliente"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="nova-edit-email"
                >
                  Email
                </label>
                <input
                  id="nova-edit-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              {/* DNI + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="nova-edit-dni"
                  >
                    Cédula / DNI
                  </label>
                  <input
                    id="nova-edit-dni"
                    type="text"
                    value={form.dni}
                    onChange={(e) => handleChange("dni", e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="123456789"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="nova-edit-phone"
                  >
                    Teléfono
                  </label>
                  <input
                    id="nova-edit-phone"
                    type="text"
                    value={form.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    placeholder="88887777"
                  />
                </div>
              </div>

              {/* Ruta */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Ruta de entrega
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {routeOptions.map((r) => (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() =>
                        handleChange("ruta", form.ruta === r.name ? "" : r.name)
                      }
                      className={cn(
                        "px-2 py-1.5 rounded-lg border-2 text-[11px] font-semibold transition-all text-left leading-tight",
                        r.bg,
                        r.text,
                        r.border,
                        form.ruta === r.name
                          ? cn("ring-2 ring-offset-1 scale-[1.03]", r.ring)
                          : "opacity-60 hover:opacity-90",
                      )}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
                {/* Before → After comparison strip */}
                {form.ruta !== (initialData.ruta || "") &&
                  (() => {
                    const beforeOpt = routeOptions.find(
                      (r) => r.name === initialData.ruta,
                    );
                    const afterOpt = routeOptions.find(
                      (r) => r.name === form.ruta,
                    );
                    return (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/50">
                        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                          Antes
                        </span>
                        {beforeOpt ? (
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border opacity-70",
                              beforeOpt.bg,
                              beforeOpt.text,
                              beforeOpt.border,
                            )}
                          >
                            {initialData.ruta}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50 italic">
                            Sin asignar
                          </span>
                        )}
                        <ArrowRight
                          className="h-3 w-3 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                          Después
                        </span>
                        {afterOpt ? (
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ring-1",
                              afterOpt.bg,
                              afterOpt.text,
                              afterOpt.border,
                              afterOpt.ring,
                            )}
                          >
                            {form.ruta}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50 italic">
                            Sin asignar
                          </span>
                        )}
                      </div>
                    );
                  })()}
                {form.ruta && (
                  <button
                    type="button"
                    onClick={() => handleChange("ruta", "")}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline self-start transition-colors"
                  >
                    Quitar ruta asignada
                  </button>
                )}

                {/* Sincronización automática de ruta a SP2 activa */}
              </div>

              {/* Error */}
              {error && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs"
                  role="alert"
                >
                  <AlertCircle
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {error}
                </div>
              )}

              {/* Sync status */}
              {done && (
                <div className="flex flex-col gap-1">
                  <div
                    className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${sp1Updated ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"}`}
                  >
                    {sp1Updated ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    SP1 {sp1Updated ? "actualizado" : "no encontrado"}
                  </div>
                  <div
                    className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${sp2Updated ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-muted/50 text-muted-foreground"}`}
                  >
                    {sp2Updated ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    SP2{" "}
                    {sp2Updated ? "actualizado" : "usuario no encontrado (ok)"}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-card">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-background hover:bg-accent text-foreground transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || done}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />{" "}
                    Guardando…
                  </>
                ) : done ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                    Guardado
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" aria-hidden="true" /> Guardar
                    cambios
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>


    </>
  );
}
