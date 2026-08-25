import * as React from "react";
import { cn } from "@/lib/utils";

interface StatisticsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  change?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  loading?: boolean;
}

const StatisticsCard = React.forwardRef<HTMLDivElement, StatisticsCardProps>(
  (
    {
      label,
      value,
      change,
      icon,
      trend = "neutral",
      loading = false,
      className,
      ...props
    },
    ref,
  ) => {
    const getTrendColor = () => {
      switch (trend) {
        case "up":
          return "text-green-600 dark:text-green-400";
        case "down":
          return "text-red-600 dark:text-red-400";
        default:
          return "text-muted-foreground";
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/50",
          className,
        )}
        {...props}
      >
        {/* Background gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 hover:opacity-100 transition-opacity" />

        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Label */}
            <p className="text-xs font-medium text-muted-foreground truncate">
              {label}
            </p>

            {/* Value */}
            {loading ? (
              <div className="h-7 w-24 bg-muted rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold tracking-tight">{value}</p>
            )}

            {/* Change/Trend */}
            {change && !loading && (
              <p className={cn("text-xs font-medium", getTrendColor())}>
                {change}
              </p>
            )}
          </div>

          {/* Icon */}
          {icon && !loading && (
            <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary">
              {icon}
            </div>
          )}

          {loading && icon && (
            <div className="flex-shrink-0 rounded-lg bg-muted p-2.5 animate-pulse" />
          )}
        </div>

        {/* Accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 opacity-0 hover:opacity-100 transition-opacity" />
      </div>
    );
  },
);

StatisticsCard.displayName = "StatisticsCard";

export { StatisticsCard, type StatisticsCardProps };
