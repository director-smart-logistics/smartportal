import React from "react";
import type { InvoiceSibling } from "@/lib/services/invoice-siblings";

interface Props {
  siblings: InvoiceSibling[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
  statusLabel: string;
  statusText: (s: string) => string;
}

/** "This invoice has N more packages — they will be updated too" with a checkbox per package (all ticked). */
export function InvoiceSiblingsNotice({ siblings, checked, onToggle, loading, statusLabel, statusText }: Props) {
  if (loading) return <div className="mt-3 text-xs text-muted-foreground" data-testid="invoice-siblings-loading">Buscando otros paquetes de la misma factura…</div>;
  if (!siblings.length) return null;
  const byInvoice = siblings.reduce<Record<string, InvoiceSibling[]>>((m, s) => { (m[s.invoiceNumber || "—"] ||= []).push(s); return m; }, {});
  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-sm" data-testid="invoice-siblings-notice">
      <p className="font-semibold text-amber-900 dark:text-amber-200">
        {Object.keys(byInvoice).length === 1 ? `La factura ${Object.keys(byInvoice)[0]} tiene` : "Estas facturas tienen"} {siblings.length === 1 ? "1 paquete más" : `${siblings.length} paquetes más`}
      </p>
      <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
        Se actualizarán también a <strong>{statusLabel}</strong> para que la factura del cliente quede completa en SP2. Desmarque los que no correspondan (entrega parcial, devuelto…).
      </p>
      <ul className="mt-2 max-h-48 overflow-y-auto space-y-1">
        {Object.entries(byInvoice).map(([inv, list]) => (
          <li key={inv}>
            {Object.keys(byInvoice).length > 1 && <span className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200 mt-1">{inv}</span>}
            {list.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                <input type="checkbox" checked={checked.has(s.id)} onChange={() => onToggle(s.id)} className="h-3.5 w-3.5 accent-amber-600" data-testid="invoice-sibling-check" />
                <span className="font-mono">{s.trackingNumber}</span>
                <span className="text-muted-foreground">— hoy: {statusText(s.status)}</span>
              </label>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
