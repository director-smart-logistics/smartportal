import { memo } from "react";
import { DollarSign } from "lucide-react";
import { calculatePrice } from "@/lib/utils/pricing";

interface PriceTagProps {
  weightKg: number;
  requiresPermit?: boolean;
}

export const PriceTag = memo(function PriceTag({
  weightKg,
  requiresPermit = false,
}: PriceTagProps) {
  const result = calculatePrice(
    weightKg,
    "usa",
    "air",
    "regular",
    requiresPermit,
  );

  if (result.quoteRequired) {
    return (
      <div
        className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
        role="status"
        aria-label="Precio estimado: requiere cotización"
      >
        <DollarSign
          className="h-3.5 w-3.5 text-amber-600 flex-shrink-0"
          aria-hidden="true"
        />
        <div>
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
            Precio Est.
          </p>
          <p className="text-xs font-bold text-amber-800">
            Requiere cotización
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
      role="status"
      aria-label={`Precio estimado: $${result.price.toFixed(2)} ${result.currency}`}
    >
      <DollarSign
        className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
          Precio Est. (Aéreo USA)
        </p>
        <p className="text-lg font-bold text-emerald-900 leading-tight">
          ${result.price.toFixed(2)}{" "}
          <span className="text-xs font-medium text-emerald-700">
            {result.currency}
          </span>
        </p>
        <p className="text-[10px] text-emerald-600 mt-0.5 leading-snug">
          {result.breakdown}
        </p>
      </div>
    </div>
  );
});

PriceTag.displayName = "PriceTag";
