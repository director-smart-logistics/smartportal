import React, { useState, useEffect } from "react";
import { DollarSign, Save, Trash2, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { NovaTerceroRow } from "@/lib/services/nova-terceros-service";

interface RouteStyle {
  bg: string;
  text: string;
  border: string;
  bgFaint: string;
  borderL: string;
  borderB: string;
  borderTFaint: string;
}

interface NovaTerceroRowCellProps {
  row: NovaTerceroRow;
  rOpt: RouteStyle | undefined;
  tc: number;
  onSave: (amount: number, description: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function NovaTerceroRowCell({
  row,
  rOpt,
  tc,
  onSave,
  onDelete,
}: NovaTerceroRowCellProps) {
  const { toast } = useToast();

  const [amount, setAmount] = useState(
    row.amount > 0 ? String(row.amount) : "",
  );
  const [description, setDescription] = useState(
    row.description || "SERVICIO DE TERCEROS",
  );
  const [currency, setCurrency] = useState<"USD" | "CRC">("USD");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Sync local fields when Firestore pushes an external update
  useEffect(() => {
    if (!saving) {
      setAmount(row.amount > 0 ? String(row.amount) : "");
      setDescription(row.description || "SERVICIO DE TERCEROS");
    }
    // Only re-sync on Firestore data changes, not while user is actively saving
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.amount, row.description]);

  const parsedAmount = parseFloat(amount) || 0;

  // Always store USD — convert from CRC if needed
  const amountUSD: number =
    currency === "CRC" && tc > 0
      ? Math.round((parsedAmount / tc) * 100) / 100
      : parsedAmount;

  // Equivalent for display in the other column
  const amountCRC: number | null =
    currency === "USD"
      ? tc > 0 && parsedAmount > 0
        ? Math.round(parsedAmount * tc)
        : null
      : parsedAmount > 0
        ? Math.round(parsedAmount)
        : null;

  const isSaved =
    row.amount === amountUSD &&
    (row.description || "") === description.trim() &&
    amountUSD > 0;

  const handleSave = async () => {
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }
    if (currency === "CRC" && tc === 0) {
      toast({
        title: "TC no disponible",
        description:
          "No se puede convertir ₡ a USD. Verifica el tipo de cambio del manifiesto.",
        variant: "destructive",
      });
      return;
    }
    const savedDescription =
      currency === "CRC" && tc > 0
        ? `${description.trim()} (₡${Math.round(parsedAmount).toLocaleString("es-CR")} TC:${tc})`
        : description.trim();
    setSaving(true);
    try {
      await onSave(amountUSD, savedDescription);
      toast({
        title: "Servicio guardado",
        description: `$${amountUSD.toFixed(2)} — ${savedDescription || "Servicio de Terceros"}`,
      });
    } catch (err) {
      toast({
        title: "Error al guardar",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsExiting(true);
    setDeleting(true);
    setTimeout(async () => {
      try {
        await onDelete();
      } catch (err) {
        toast({
          title: "Error al eliminar",
          description: String(err),
          variant: "destructive",
        });
        setIsExiting(false);
        setDeleting(false);
      }
    }, 300);
  };

  return (
    <tr
      className={cn(
        "border-b border-b-border/30 text-[11px] border-l-2",
        rOpt ? rOpt.bgFaint : "bg-slate-100/10 dark:bg-slate-700/5",
        rOpt ? rOpt.borderL : "border-l-slate-400 dark:border-l-slate-500",
        isExiting ? "animate-row-out" : "animate-row-in"
      )}
    >
      {/* Checkbox col — indicator icon */}
      <td className="px-2 py-1.5 text-center">
        <DollarSign
          className="h-3 w-3 text-orange-500/70 mx-auto"
          aria-hidden="true"
        />
      </td>

      {/* # col — empty */}
      <td className="px-1 py-1" />

      {/* Cliente + Tracking cols (colSpan=2) — badge + description input */}
      <td className="px-3 py-1.5" colSpan={2}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border border-orange-400/60 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 shrink-0 whitespace-nowrap select-none">
            <DollarSign className="h-2.5 w-2.5 shrink-0" />
            SERV. TERCEROS
          </span>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="Descripción del servicio..."
            className="h-6 text-[11px] flex-1 min-w-0"
            aria-label="Descripción del servicio de terceros"
          />
        </div>
      </td>

      {/* Peso col — empty */}
      <td className="px-3 py-1" />

      {/* P.Redn col — empty */}
      <td className="px-3 py-1" />

      {/* $ Dólares col — currency toggle + amount input + save button + equivalent display + delete button */}
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrency((c) => (c === "USD" ? "CRC" : "USD"))}
            title="Cambiar moneda"
            className={cn(
              "h-6 px-1.5 text-[9px] font-bold rounded border transition-colors shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
              currency === "USD"
                ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                : "bg-blue-600 text-white border-blue-700 hover:bg-blue-700",
            )}
            aria-label="Cambiar moneda"
          >
            {currency === "USD" ? "$ USD" : "₡ CRC"}
          </button>
          <Input
            type="number"
            min="0"
            step={currency === "CRC" ? "1" : "0.01"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder={currency === "CRC" ? "0" : "0.00"}
            className="h-6 w-20 text-[11px] text-right tabular-nums"
            aria-label="Monto del servicio de terceros"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            title={isSaved ? "Guardado" : "Guardar servicio"}
            className={cn(
              "inline-flex items-center justify-center h-6 w-6 rounded border transition-colors shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary",
              isSaved
                ? "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                : "border-orange-400/60 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30",
            )}
            aria-label="Guardar servicio"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isSaved ? (
              <Check className="h-3 w-3" />
            ) : (
              <Save className="h-3 w-3" />
            )}
          </button>

          {/* Equivalent display inline */}
          {currency === "USD" && amountCRC !== null && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-1">
              ₡{amountCRC.toLocaleString("es-CR")}
            </span>
          )}
          {currency === "CRC" && parsedAmount > 0 && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-1">
              {tc > 0 ? (
                `≈ $${amountUSD.toFixed(2)}`
              ) : (
                <span className="text-amber-500/70">sin TC</span>
              )}
            </span>
          )}

          {/* Delete button inline */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            title="Eliminar servicio de terceros"
            className="inline-flex items-center justify-center h-6 w-6 rounded border border-red-400/40 text-red-500/60 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 hover:border-red-400/70 transition-colors shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-destructive ml-1"
            aria-label="Eliminar servicio de terceros"
          >
            {deleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        </div>
      </td>

      {/* ₡ / $ equivalent col — empty to maintain alignment */}
      <td className="px-3 py-1.5" />

      {/* Action col — empty to maintain alignment */}
      <td className="px-3 py-1.5" />
    </tr>
  );
}
