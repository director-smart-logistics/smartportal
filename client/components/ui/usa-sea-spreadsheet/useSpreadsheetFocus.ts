import { useCallback } from "react";

type Direction = "up" | "down" | "left" | "right";

export function useSpreadsheetFocus(onReachEnd?: () => void) {
  const moveFocus = useCallback(
    (
      currentRow: number,
      currentCol: number,
      direction: Direction,
      rowCount: number,
      colCount: number,
    ) => {
      let nextRow = currentRow;
      let nextCol = currentCol;

      switch (direction) {
        case "up":
          nextRow = Math.max(0, currentRow - 1);
          break;
        case "down":
          nextRow = Math.min(rowCount - 1, currentRow + 1);
          break;
        case "left":
          nextCol = Math.max(0, currentCol - 1);
          break;
        case "right":
          nextCol = Math.min(colCount - 1, currentCol + 1);
          break;
      }

      if (nextRow !== currentRow || nextCol !== currentCol) {
        const nextInput = document.querySelector(
          `input[data-row="${nextRow}"][data-col="${nextCol}"]`,
        ) as HTMLInputElement;
        if (nextInput) {
          // Use setTimeout to ensure focus happens after any potential state updates
          // that might have caused the keydown
          setTimeout(() => {
            nextInput.focus();
            nextInput.select();
          }, 0);
        }
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      rowIdx: number,
      colIdx: number,
      rowCount: number,
      colCount: number,
    ) => {
      // We only hijack arrow keys if we are not actively selecting text within the input,
      // or we just hijack them unconditionally for a true Excel feel where arrows always move cells.
      // Excel behavior: Left/Right arrows move cells if not editing. If editing, they move cursor.
      // To simplify and ensure high speed data entry, we will hijack up/down always,
      // and left/right if the cursor is at the start/end of the input, or we can just require
      // Tab / Enter for moving.
      // Let's implement full arrow navigation for an "Excel-like" feel.

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveFocus(rowIdx, colIdx, "up", rowCount, colCount);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveFocus(rowIdx, colIdx, "down", rowCount, colCount);
          break;
        case "Enter":
          e.preventDefault();
          // Horizontal jump logic for Enter:
          // slCode(0) -> warehouseId(1) -> length(2) -> ... -> multiplier(5) -> next row slCode(0)
          // or override columns: cubicFeetOverride(6) -> roundedVolumeOverride(7) -> priceOverride(8) -> next row slCode(0)
          if (colIdx === 5 || colIdx === 8) {
            // Jump to slCode (0) of the next row
            if (rowIdx + 1 < rowCount) {
              const nextInput = document.querySelector(
                `input[data-row="${rowIdx + 1}"][data-col="0"]`,
              ) as HTMLInputElement;
              if (nextInput) {
                setTimeout(() => {
                  nextInput.focus();
                  nextInput.select();
                }, 0);
              }
            } else {
              // Wait! The user might want a new row created if at the end.
              if (onReachEnd) {
                onReachEnd();
                // wait for React to render the new rows
                setTimeout(() => {
                  const nextInput = document.querySelector(
                    `input[data-row="${rowIdx + 1}"][data-col="0"]`,
                  ) as HTMLInputElement;
                  if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                  }
                }, 50);
              } else {
                moveFocus(rowIdx, colIdx, "down", rowCount, colCount);
              }
            }
          } else {
            moveFocus(rowIdx, colIdx, "right", rowCount, colCount);
          }
          break;
        case "ArrowLeft":
          // Only move left if cursor is at the beginning of the text
          if (e.currentTarget.selectionStart === 0) {
            e.preventDefault();
            moveFocus(rowIdx, colIdx, "left", rowCount, colCount);
          }
          break;
        case "ArrowRight":
          // Only move right if cursor is at the end of the text
          if (e.currentTarget.selectionEnd === e.currentTarget.value.length) {
            e.preventDefault();
            moveFocus(rowIdx, colIdx, "right", rowCount, colCount);
          }
          break;
      }
    },
    [moveFocus, onReachEnd],
  );

  return { handleKeyDown, moveFocus };
}
