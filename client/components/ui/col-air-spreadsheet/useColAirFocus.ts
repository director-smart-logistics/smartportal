import { useCallback } from "react";
import { ColAirManifestRowData } from "./useColAirCalculations";

// El orden de las columnas que participan en el salto rápido
const NAVIGABLE_FIELDS = [
  "slCode",
  "warehouseId",
  "peso",
  "permisos",
  "priceOverride",
];

export function useColAirFocus(
  rows: ColAirManifestRowData[],
  onReachEnd?: () => void,
) {
  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement | HTMLButtonElement>,
      rowIndex: number,
      field: string,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();

        const currentFieldIndex = NAVIGABLE_FIELDS.indexOf(field);
        if (currentFieldIndex === -1) return; // No es un campo navegable por este flujo

        const isLastFieldInRow =
          currentFieldIndex === NAVIGABLE_FIELDS.length - 1;
        const isLastRow = rowIndex === rows.length - 1;

        if (isLastFieldInRow) {
          if (isLastRow) {
            // Si es la última fila y el último campo, ejecutamos el callback para crear nuevas filas
            if (onReachEnd) {
              onReachEnd();

              // Pequeño delay para permitir que React renderice las nuevas filas antes de enfocar
              setTimeout(() => {
                const nextRowFirstFieldId = `input-${rowIndex + 1}-slCode`;
                const nextEl = document.getElementById(nextRowFirstFieldId);
                if (nextEl) {
                  nextEl.focus();
                  if (nextEl instanceof HTMLInputElement) nextEl.select();
                }
              }, 50);
            }
          } else {
            // Si hay más filas, salta al primer campo de la siguiente fila
            const nextRowFirstFieldId = `input-${rowIndex + 1}-slCode`;
            const nextEl = document.getElementById(nextRowFirstFieldId);
            if (nextEl) {
              nextEl.focus();
              if (nextEl instanceof HTMLInputElement) nextEl.select();
            }
          }
        } else {
          // Salta al siguiente campo en la MISMA fila
          const nextFieldName = NAVIGABLE_FIELDS[currentFieldIndex + 1];
          const nextFieldId = `input-${rowIndex}-${nextFieldName}`;
          const nextEl = document.getElementById(nextFieldId);
          if (nextEl) {
            nextEl.focus();
            if (nextEl instanceof HTMLInputElement) nextEl.select();
          }
        }
      }
    },
    [rows.length, onReachEnd],
  );

  return { handleKeyDown };
}
