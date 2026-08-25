import { useMemo } from "react";

export interface ColAirManifestRowData {
  id: string; // unique internal id
  warehouseId: string;
  slCode: string; // keep data model as slCode since it maps to customer.slCode
  customerName?: string;
  customerEmail?: string;
  ruta?: string;
  peso: string; // Peso en KG
  permisos: boolean; // Si requiere permisos o no
  priceOverride?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
}

export interface CalculatedColAirManifestRow extends ColAirManifestRowData {
  weightKG: number;
  price: number;
  priceCRC: number;
  isValid: boolean;
  ivaEnabled?: boolean;
  bodegajeCost?: number;
  permisoCost?: number;
}

/**
 * Parses a string to a valid positive number. Returns 0 if invalid.
 */
function parseDimension(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseFloat(value.replace(/,/g, "."));
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

/**
 * Hook to calculate spreadsheet values dynamically for Colombia Air.
 */
export function useColAirCalculations(
  rows: ColAirManifestRowData[],
  exchangeRate: number = 500,
): CalculatedColAirManifestRow[] {
  return useMemo(() => {
    return rows.map((row) => {
      const weightNum = parseDimension(row.peso);

      let price = 0;
      let priceCRC = 0;

      if (weightNum > 0) {
        // Regulares = $12, Restringidos (permisos) = $15
        const basePrice = row.permisos ? 15 : 12;

        const overrideNum = parseDimension(row.priceOverride);
        const applicablePrice = overrideNum > 0 ? overrideNum : basePrice;

        // Calcula el precio exacto (weight * applicablePrice)
        price = weightNum * applicablePrice;
        priceCRC = price * exchangeRate;
      }

      const isValid =
        (row.warehouseId.trim() !== "" || row.slCode.trim() !== "") &&
        weightNum > 0;

      return {
        ...row,
        weightKG: weightNum,
        price,
        priceCRC,
        isValid,
      };
    });
  }, [rows, exchangeRate]);
}
