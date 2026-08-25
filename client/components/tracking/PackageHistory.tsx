import { memo, useState } from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import type { TrackingSearchResult } from "@/lib/hooks/queries/useTrackingSearch";

const INITIAL_VISIBLE = 4;

interface PackageHistoryProps {
  pkg: TrackingSearchResult & { history?: HistoryEvent[] };
}

interface HistoryEvent {
  description?: string;
  note?: string;
  status?: string;
  date?: string;
}

export const PackageHistory = memo(function PackageHistory({
  pkg,
}: PackageHistoryProps) {
  const { t } = useLocale("tracking");
  const history: HistoryEvent[] = pkg.history ?? [];
  const [expanded, setExpanded] = useState(false);

  if (!history.length) return null;

  const displayHistory = expanded ? history : history.slice(0, INITIAL_VISIBLE);
  const hiddenCount = history.length - INITIAL_VISIBLE;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
        <History className="h-3 w-3" aria-hidden="true" />
        {t("historyTitle")}
      </p>
      <ol className="space-y-2" role="list" aria-label={t("historyTitle")}>
        {displayHistory.map((ev, i) => (
          <li key={i} className="flex gap-2 text-xs">
            <span
              className={cn(
                "mt-1 h-2 w-2 rounded-full flex-shrink-0",
                i === 0 ? "bg-gray-900" : "bg-gray-200",
              )}
              aria-hidden="true"
            />
            <div>
              <p
                className={cn(
                  "leading-tight",
                  i === 0 ? "text-gray-900 font-medium" : "text-gray-600",
                )}
              >
                {ev.description ?? ev.note ?? ev.status}
              </p>
              {ev.date && (
                <time
                  className="text-[10px] text-gray-400 mt-0.5 block"
                  dateTime={ev.date}
                >
                  {ev.date}
                </time>
              )}
            </div>
          </li>
        ))}
      </ol>

      {history.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-1 text-[11px] text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
              {t("showLess")}
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
              {t("showMore", { count: hiddenCount })}
            </>
          )}
        </button>
      )}
    </div>
  );
});

PackageHistory.displayName = "PackageHistory";
