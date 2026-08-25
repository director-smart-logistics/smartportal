import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowRightLeft } from 'lucide-react';

interface ManifestBadgeProps {
  manifestNumber: string;
  /** Show as reassigned (updatedManifest differs from original) */
  isReassigned?: boolean;
  className?: string;
}

export function ManifestBadge({ manifestNumber, isReassigned, className }: ManifestBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md border',
        isReassigned
          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700'
          : 'bg-muted text-foreground border-border',
        className
      )}
      title={isReassigned ? `Reasignado → ${manifestNumber}` : manifestNumber}
    >
      {isReassigned && <ArrowRightLeft className="h-2.5 w-2.5 shrink-0" aria-hidden />}
      {manifestNumber}
    </span>
  );
}
