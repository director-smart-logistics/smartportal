/**
 * KanbanPackageItem
 *
 * A single draggable package row within a Kanban customer card.
 * Handles the HTML5 drag initiation and visual state for locked vs. draggable.
 *
 * ── Drag Rules ──────────────────────────────────────────────────────────────────
 *   - Only packages where isPackageDraggable() === true can be dragged
 *   - The drag payload (PackageDragPayload) is set in PACKAGE_DND_TYPE format
 *   - Protected packages (delivered, processed, sent/paid invoices) show a lock icon
 */

import React from 'react';
import {
  GripVertical,
  Lock,
  Scale,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/ui/copy-button';
import {
  isPackageDraggable,
  PACKAGE_DND_TYPE,
  type ConsolidationPackage,
  type PackageDragPayload,
} from './types';
import { PackageStatusBadge } from './PackageStatusBadge';

interface KanbanPackageItemProps {
  pkg: ConsolidationPackage;
  manifestNumber: string;
  customerName: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function KanbanPackageItem({
  pkg,
  manifestNumber,
  customerName,
  onDragStart,
  onDragEnd,
}: KanbanPackageItemProps) {
  const draggable = isPackageDraggable(pkg);

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] border transition-all',
        draggable
          ? 'bg-background hover:bg-muted/50 cursor-grab active:cursor-grabbing border-border hover:border-primary/30 hover:shadow-sm'
          : 'bg-muted/20 text-muted-foreground border-transparent cursor-not-allowed'
      )}
    >
      {draggable ? (
        <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" aria-hidden />
      ) : (
        <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" aria-hidden />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-mono font-medium truncate">{pkg.trackingNumber}</span>
          <CopyButton value={pkg.trackingNumber} label="Copiar tracking" iconSize="h-2.5 w-2.5" />
          <PackageStatusBadge status={pkg.status || ''} />
        </div>
        {pkg.description && (
          <div className="text-muted-foreground truncate text-[9px]">{pkg.description}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 text-[9px] text-muted-foreground">
        {pkg.weight != null && (
          <span className="flex items-center gap-0.5">
            <Scale className="h-2 w-2" aria-hidden />
            {pkg.weight.toFixed(2)}
          </span>
        )}
        {pkg.price != null && pkg.price > 0 && (
          <span className="flex items-center gap-0.5">
            <DollarSign className="h-2 w-2" aria-hidden />
            {pkg.price.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
