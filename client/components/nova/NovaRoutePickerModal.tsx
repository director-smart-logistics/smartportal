import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { updateCustomerRuta } from "@/lib/services/customer-sync";
import { useRouteOptions } from "./nova-route-options";

export function RoutePickerModal({
  slCode,
  customerName,
  currentRuta,
  onClose,
  onSaved,
}: {
  slCode: string;
  customerName: string;
  currentRuta: string;
  onClose: () => void;
  onSaved: (ruta: string) => void;
}) {
  const [selected, setSelected] = useState(currentRuta || "");
  const [saving, setSaving] = useState(false);
  const routeOptions = useRouteOptions();

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateCustomerRuta(slCode, selected, false, 'nova_route_picker');
      onSaved(selected);
      onClose();
    } catch (err) {
      console.error("[RoutePickerModal] save error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-background rounded-2xl border border-border shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Asignar ruta
            </p>
            <p className="text-xs text-muted-foreground">
              {customerName} · {slCode}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-3 gap-2">
          {routeOptions.map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => setSelected(r.name)}
              className={cn(
                "px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all text-left",
                r.bg,
                r.text,
                r.border,
                selected === r.name
                  ? cn("ring-2 ring-offset-1", r.ring, "scale-[1.03]")
                  : "opacity-70 hover:opacity-100",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
        {/* Before → After comparison strip */}
        {selected !== (currentRuta || "") &&
          (() => {
            const beforeOpt = routeOptions.find((r) => r.name === currentRuta);
            const afterOpt = routeOptions.find((r) => r.name === selected);
            return (
              <div className="mx-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/50">
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
                    {currentRuta}
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
                    {selected}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 italic">
                    Sin asignar
                  </span>
                )}
              </div>
            );
          })()}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-card">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!selected || saving}>
            {saving ? "Guardando..." : "Actualizar ruta"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
