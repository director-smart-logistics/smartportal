/**
 * NovaMultiMatchSection.tsx
 *
 * Compact banner shown in the Nova chat card when the AI found multiple
 * possible customer matches for one or more manifest rows. Prompts the
 * operator to open the table and resolve the ambiguity manually.
 *
 * Accessibility: uses role="alert" so screen readers announce it immediately
 *   when it mounts. aria-label gives context beyond colour alone.
 * Performance: wrapped in React.memo — re-renders only when multiMatchRows changes.
 * Motion: respects prefers-reduced-motion via framer-motion's useReducedMotion.
 * i18n: all strings from 'nova' namespace.
 */

import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Users } from "lucide-react";
import type { MultiMatchRowData } from "@/hooks/use-nova-chat";
import { useLocale } from "@/hooks/useLocale";

interface MultiMatchSectionProps {
  multiMatchRows: MultiMatchRowData[];
}

export const MultiMatchSection = memo(function MultiMatchSection({
  multiMatchRows,
}: MultiMatchSectionProps) {
  const { t } = useLocale("nova");
  const reducedMotion = useReducedMotion();

  if (multiMatchRows.length === 0) return null;

  const count = multiMatchRows.length;

  return (
    <motion.div
      role="alert"
      aria-label={t("nova.multiMatch_ariaLabel")}
      aria-live="polite"
      data-testid="multi-match-section"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5"
    >
      <div
        aria-hidden="true"
        className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0"
      >
        <Users className="h-3.5 w-3.5 text-amber-500" />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-semibold text-amber-700 dark:text-amber-400"
          data-testid="multi-match-title"
        >
          {t("nova.multiMatch_title", { count })}
        </p>
        <p
          className="text-[10px] text-amber-600/70 dark:text-amber-500/70 mt-0.5"
          data-testid="multi-match-subtitle"
        >
          {t("nova.multiMatch_subtitle")}
        </p>
      </div>
    </motion.div>
  );
});
