import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineStageProps {
  title: string;
  description?: string;
  date: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isLast?: boolean;
  icon?: React.ReactNode;
}

export function TimelineStage({
  title,
  description,
  date,
  isCompleted,
  isCurrent,
  isLast = false,
  icon,
}: TimelineStageProps) {
  return (
    <div className="flex gap-3 pb-4 relative">
      {/* Connector Line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[15px] top-8 w-0.5 h-12",
            isCompleted ? "bg-black" : "bg-muted",
          )}
        />
      )}

      {/* Stage Indicator */}
      <div className="relative">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all",
            isCompleted
              ? "bg-black border-black"
              : isCurrent
                ? "bg-yellow-400 border-yellow-400"
                : "bg-background border-muted",
          )}
        >
          {isCompleted ? (
            <Check className="h-4 w-4 text-white" />
          ) : isCurrent ? (
            <Circle className="h-3 w-3 text-black animate-pulse" />
          ) : (
            <Circle className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                "text-sm font-semibold",
                isCompleted || isCurrent
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {icon && <span className="inline-block mr-2">{icon}</span>}
              {title}
            </h4>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        <time className="text-xs text-muted-foreground mt-1 block">{date}</time>
      </div>
    </div>
  );
}
