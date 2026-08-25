/**
 * NovaCopyCell.tsx
 *
 * Small inline component that renders a value with a one-click copy button.
 * Used inside the Nova results table to let operators copy tracking numbers
 * and SL codes without selecting text.
 *
 * Accessibility: announces copy result to screen readers via aria-live.
 * Performance: handleCopy is memoised with useCallback.
 * i18n: all visible strings come from the 'nova' namespace.
 */

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";

import { cn } from "@/lib/utils";

interface CopyCellProps {
  /** The text value to display and copy to clipboard. */
  value: string;
  /** Optional override for the button aria-label (defaults to i18n key). */
  ariaLabel?: string;
  /** Optional custom CSS classes for the text element */
  className?: string;
}

export function CopyCell({ value, ariaLabel, className }: CopyCellProps) {
  const { t } = useLocale("nova");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard not available — fail silently */
      });
  }, [value]);

  return (
    <span
      className="inline-flex items-center gap-1.5 group"
      data-testid="copy-cell"
    >
      <span
        className={cn("font-mono font-bold text-foreground", className)}
        data-testid="copy-cell-value"
      >
        {value}
      </span>

      <button
        type="button"
        onClick={handleCopy}
        aria-label={ariaLabel ?? t("nova.copyCell_ariaLabel")}
        aria-pressed={copied}
        className="p-0.5 rounded hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="copy-cell-button"
      >
        {copied ? (
          <Check aria-hidden="true" className="h-3 w-3 text-green-500" />
        ) : (
          <Copy aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {/* Screen-reader live region — announces copy result without focus move */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {copied ? t("nova.copyCell_copiedAriaLive") : ""}
      </span>
    </span>
  );
}
