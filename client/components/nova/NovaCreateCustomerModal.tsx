import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { createOrGetTempCustomer } from "@/lib/services/manifest-processor";
import {
  loadUnmatchedRouteCache,
  lookupLearnedRoute,
} from "@/lib/services/match-learning";
import { useRouteOptions } from "./nova-route-options";

export function CreateCustomerModal({
  nombre,
  onClose,
  onCreated,
}: {
  nombre: string;
  onClose: () => void;
  onCreated: (slCode: string, ruta: string) => void;
}) {
  const [fullName, setFullName] = useState(nombre);
  const [ruta, setRuta] = useState("");
  const [consolidacion, setConsolidacion] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUpdate, setIsUpdate] = useState(false);
  const routeOptions = useRouteOptions();

  // Pre-load learned route + detect existing temp record
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadUnmatchedRouteCache(),
      createOrGetTempCustomer(nombre.trim(), undefined, "nova_check").catch(
        () => null,
      ),
    ])
      .then(([_, existing]) => {
        if (cancelled) return;
        if (existing) {
          setIsUpdate(true);
          if (existing.ruta) setRuta(existing.ruta);
          if (existing.email) setEmail(existing.email);
          if (existing.phone) setPhone(existing.phone);
          if (existing.consolidationEnabled !== undefined)
            setConsolidacion(existing.consolidationEnabled);
        } else {
          const learned = lookupLearnedRoute(nombre);
          if (learned) setRuta(learned);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nombre]);

  const handleSave = async () => {
    if (!fullName.trim() || !ruta) {
      setError("Nombre y ruta son obligatorios");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const record = await createOrGetTempCustomer(
        fullName.trim(),
        undefined,
        "nova_create",
        ruta,
        email || undefined,
        phone || undefined,
        consolidacion,
      );
      setIsUpdate(false);
      onCreated(record.slCode, ruta);
      onClose();
    } catch (err) {
      setError("Error al guardar cliente temporal — revisa la consola");
      console.error("[CreateCustomerModal]", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <p className="text-sm font-semibold text-foreground">
            Crear perfil de cliente
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">
              Nombre completo *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">
              Ruta *
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {routeOptions.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => setRuta(r.name)}
                  className={cn(
                    "px-2 py-2 rounded-xl border-2 text-xs font-semibold transition-all text-left",
                    r.bg,
                    r.text,
                    r.border,
                    ruta === r.name
                      ? cn("ring-2 ring-offset-1", r.ring, "scale-[1.03]")
                      : "opacity-60 hover:opacity-100",
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-foreground mb-1 block">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-foreground mb-1 block">
                Teléfono
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consolidacion}
              onChange={(e) => setConsolidacion(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-foreground">
              Consolidación habilitada
            </span>
          </label>
          <p className="text-[11px] text-muted-foreground">
            Se asignará un código{" "}
            <span className="font-mono font-semibold">SL-NAN-XXXXX</span>{" "}
            temporal. Nova lo reconocerá automáticamente en el próximo
            manifiesto.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-card">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !fullName.trim() || !ruta}
          >
            {saving
              ? isUpdate
                ? "Actualizando..."
                : "Creando..."
              : isUpdate
                ? "Actualizar cliente"
                : "Crear cliente"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
