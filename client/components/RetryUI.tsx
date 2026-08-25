import React, { memo } from "react";
import { AlertCircle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RetryUIProps {
  onRetry: () => void;
  error?: string | Error;
  title?: string;
  description?: string;
  className?: string;
  "data-testid"?: string;
  compact?: boolean;
}

// Memoized component to prevent unnecessary re-renders
export const RetryUI = memo(function RetryUI({
  onRetry,
  error,
  title = "Failed to load data",
  description = "We couldn't fetch the data. Please try again.",
  className,
  "data-testid": dataTestId = "retry-ui",
  compact = false,
}: RetryUIProps) {
  const isNetworkError =
    error?.toString().toLowerCase().includes("network") ||
    error?.toString().toLowerCase().includes("fetch");

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-3 p-4 text-sm",
          className,
        )}
        data-testid={dataTestId}
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          {isNetworkError ? (
            <WifiOff className="h-4 w-4 text-destructive" aria-hidden="true" />
          ) : (
            <AlertCircle
              className="h-4 w-4 text-destructive"
              aria-hidden="true"
            />
          )}
          <span>{title}</span>
        </div>
        <Button
          onClick={onRetry}
          size="sm"
          variant="outline"
          className="gap-2"
          data-testid={`${dataTestId}-retry-button`}
          aria-label="Retry loading data"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Card
      className={cn("p-8", className)}
      data-testid={dataTestId}
      role="alert"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Icon */}
        <div className="rounded-full bg-destructive/10 p-4">
          {isNetworkError ? (
            <WifiOff className="h-8 w-8 text-destructive" aria-hidden="true" />
          ) : (
            <AlertCircle
              className="h-8 w-8 text-destructive"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {description}
          </p>
        </div>

        {/* Error Message (development) */}
        {process.env.NODE_ENV === "development" && error && (
          <div className="w-full max-w-md p-3 bg-muted/50 rounded-md">
            <p className="text-xs font-mono text-destructive break-all">
              {error.toString()}
            </p>
          </div>
        )}

        {/* Retry Button */}
        <Button
          onClick={onRetry}
          className="gap-2"
          data-testid={`${dataTestId}-retry-button`}
          aria-label="Retry loading data"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try Again
        </Button>

        {/* Network Hint */}
        {isNetworkError && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Wifi className="h-3 w-3" aria-hidden="true" />
            Check your internet connection
          </p>
        )}
      </div>
    </Card>
  );
});

// Inline retry button (for table rows, cards, etc.)
export const InlineRetryButton = memo(function InlineRetryButton({
  onRetry,
  size = "sm",
  className,
}: {
  onRetry: () => void;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Button
      onClick={onRetry}
      size={size}
      variant="ghost"
      className={cn("gap-2", className)}
      data-testid="inline-retry-button"
      aria-label="Retry"
    >
      <RefreshCw className="h-4 w-4" />
      Retry
    </Button>
  );
});
