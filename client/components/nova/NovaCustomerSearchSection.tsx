import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface NovaCustomerSearchSectionProps {
  icon: ReactNode;
  label: string;
  testId: string;
  headerClassName: string;
  labelClassName: string;
  trailing?: ReactNode;
  children: ReactNode;
}

export function NovaCustomerSearchSection({
  icon,
  label,
  testId,
  headerClassName,
  labelClassName,
  trailing,
  children,
}: NovaCustomerSearchSectionProps) {
  return (
    <div role="group" aria-label={label} data-testid={testId}>
      <div
        className={cn(
          "px-4 py-2 flex items-center gap-2 border-b",
          headerClassName,
        )}
      >
        <span aria-hidden="true">{icon}</span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            labelClassName,
          )}
        >
          {label}
        </span>
        {trailing && <span className="ml-auto">{trailing}</span>}
      </div>
      {children}
    </div>
  );
}
