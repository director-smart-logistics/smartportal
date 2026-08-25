import React, { useState, useMemo, useEffect, memo } from "react";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Invoice } from "../../types";

/**
 * InvoiceStatsBar
 * 
 * Renders the real-time statistics bar (count, weight, amount) for the current 
 * filtered set of invoices. It manages its own computation and flash animation
 * to prevent unnecessary re-renders in the parent orchestrator.
 */
interface InvoiceStatsBarProps {
  /** The currently filtered list of invoices */
  invoices: Invoice[];
}

export const InvoiceStatsBar = memo(function InvoiceStatsBar({ invoices }: InvoiceStatsBarProps) {
  // Real-time stats for the current filtered set — updates on every filter change
  const [statsFlash, setStatsFlash] = useState(false);
  
  const filteredStats = useMemo(() => {
    const count = invoices.length;
    let totalWeight = 0;
    let totalAmount = 0;
    for (const inv of invoices) {
      totalAmount += Number((inv as any).totalAmount ?? 0);
      const items: any[] = (inv as any).invoiceItems ?? (inv as any).items ?? [];
      for (const item of items) {
        totalWeight += Number(item.weight ?? 0);
      }
    }
    return { count, totalWeight, totalAmount };
  }, [invoices]);

  // Brief background flash when stats change — no re-mount, no jump
  useEffect(() => {
    setStatsFlash(true);
    const t = setTimeout(() => setStatsFlash(false), 150);
    return () => clearTimeout(t);
  }, [filteredStats.count, filteredStats.totalWeight]);

  if (invoices.length === 0) return null;

  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-1.5 border-b border-border text-[11px] text-muted-foreground flex-wrap transition-colors duration-150",
      statsFlash ? "bg-primary/10" : "bg-primary/5"
    )}>
      <span className="flex items-center gap-1 font-semibold text-primary">
        {filteredStats.count} factura{filteredStats.count !== 1 ? 's' : ''}
      </span>
      <span className="text-border select-none">·</span>
      <span className="flex items-center gap-1">
        <Scale className="h-3 w-3 shrink-0" />
        {filteredStats.totalWeight.toFixed(2)} {invoices.length > 0 && invoices.every(i => i.source === 'maritime') ? 'FT³' : 'kg'}
      </span>
      <span className="text-border select-none">·</span>
      <span className="flex items-center gap-1">
        ${filteredStats.totalAmount.toFixed(2)}
      </span>
    </div>
  );
});
