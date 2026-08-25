import { cn } from "@/lib/utils";

interface CardSpotlightProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  glowColor?: string;
  borderGlowColor?: string;
  dataTestId?: string;
  ariaLabel?: string;
}

export default function CardSpotlight({
  title,
  description,
  icon,
  children,
  className,
  dataTestId,
  ariaLabel,
}: CardSpotlightProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
      data-testid={dataTestId}
      aria-label={ariaLabel}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      )}
      {description && (
        <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}
