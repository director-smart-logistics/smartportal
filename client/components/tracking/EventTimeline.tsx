import { memo, useState } from "react";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import type { MLCargoEvent } from "@/lib/hooks/queries/useTrackingSearch";

const INITIAL_VISIBLE = 4;

interface EventTimelineProps {
  events: MLCargoEvent[];
}

export const EventTimeline = memo(function EventTimeline({
  events,
}: EventTimelineProps) {
  const { t } = useLocale("tracking");
  const [expanded, setExpanded] = useState(false);
  const displayEvents = expanded ? events : events.slice(0, INITIAL_VISIBLE);
  const hiddenCount = events.length - INITIAL_VISIBLE;

  return (
    <div className="space-y-0">
      <ol className="relative" aria-label={t("historyTitle")} role="list">
        {displayEvents.map((ev, i) => (
          <li key={`${ev.fecha}-${i}`} className="flex gap-3 pb-3 last:pb-0">
            <div
              className="flex flex-col items-center flex-shrink-0 w-4"
              aria-hidden="true"
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full border-2 mt-0.5 flex-shrink-0",
                  i === 0
                    ? "bg-gray-900 border-gray-900"
                    : "bg-white border-gray-300",
                )}
              />
              {i < displayEvents.length - 1 && (
                <span className="w-px flex-1 bg-gray-200 mt-1" />
              )}
            </div>

            <div className={cn("pb-1 min-w-0", i === 0 && "font-medium")}>
              <p
                className={cn(
                  "text-xs leading-snug font-medium",
                  i === 0 ? "text-gray-900" : "text-gray-700",
                )}
              >
                {ev.detalle}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                <MapPin
                  className="h-2.5 w-2.5 flex-shrink-0"
                  aria-hidden="true"
                />
                {ev.ciudad}
                {ev.fecha && (
                  <span className="mx-0.5" aria-hidden="true">
                    ·
                  </span>
                )}
                <time dateTime={ev.fecha}>{ev.fecha}</time>
              </p>
            </div>
          </li>
        ))}
      </ol>

      {events.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 font-semibold hover:text-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
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

EventTimeline.displayName = "EventTimeline";
