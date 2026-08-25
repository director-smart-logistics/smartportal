import { useMemo } from "react";

export interface SeaManifestRowData {
  id: string; // unique internal id
  warehouseId: string;
  slCode: string; // keep data model as slCode since it maps to customer.slCode
  customerName?: string;
  customerEmail?: string;
  ruta?: string;
  length: string;
  width: string;
  height: string;
  multiplier?: string;
  priceOverride?: string;
  cubicFeetOverride?: string;
  roundedVolumeOverride?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
}

export interface CalculatedSeaManifestRow extends SeaManifestRowData {
  cubicFeet: number;
  roundedVolume: number;
  price: number;
  priceCRC: number;
  isValid: boolean;
  bodegajeCost?: number;
  permisoCost?: number;
  ivaEnabled?: boolean;
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
 * Hook to calculate spreadsheet values dynamically.
 */
export function useSpreadsheetCalculations(
  rows: SeaManifestRowData[],
  globalPrice: number = 30,
  exchangeRate: number = 500,
): CalculatedSeaManifestRow[] {
  return useMemo(() => {
    return rows.map((row) => {
      const lengthNum = parseDimension(row.length);
      const widthNum = parseDimension(row.width);
      const heightNum = parseDimension(row.height);

      let cubicFeet = 0;
      let roundedVolume = 0;
      let price = 0;
      let priceCRC = 0;

      const overrideCubicFeet = parseDimension(row.cubicFeetOverride);
      const overrideRoundedVolume = parseDimension(row.roundedVolumeOverride);
      const multiplierNum = parseDimension(row.multiplier) || 1;

      if (
        (lengthNum > 0 && widthNum > 0 && heightNum > 0) ||
        overrideCubicFeet > 0 ||
        overrideRoundedVolume > 0
      ) {
        if (overrideCubicFeet > 0) {
          cubicFeet = overrideCubicFeet;
        } else {
          cubicFeet =
            ((lengthNum * widthNum * heightNum) / 1728) * multiplierNum;
        }

        if (overrideRoundedVolume > 0) {
          roundedVolume = overrideRoundedVolume;
        } else {
          roundedVolume = Math.ceil(cubicFeet);
        }

        const overrideNum = parseDimension(row.priceOverride);
        const applicablePrice = overrideNum > 0 ? overrideNum : globalPrice;

        price = roundedVolume * applicablePrice;
        priceCRC = price * exchangeRate;
      }

      const isValid =
        (row.warehouseId.trim() !== "" || row.slCode.trim() !== "") &&
        ((lengthNum > 0 && widthNum > 0 && heightNum > 0) ||
          overrideCubicFeet > 0 ||
          overrideRoundedVolume > 0);

      return {
        ...row,
        cubicFeet,
        roundedVolume,
        price,
        priceCRC,
        isValid,
      };
    });
  }, [rows, globalPrice, exchangeRate]);
}
