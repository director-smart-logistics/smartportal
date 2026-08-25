/**
 * InvoiceStatusDot
 *
 * Small colored status indicator for invoice state.
 * Shared across Kanban board and customer card views.
 *
 * ── Status → Color mapping ──────────────────────────────────────────────────────
 *   paid      → emerald (green)
 *   sent      → blue
 *   annulled  → red
 *   cancelled → red
 *   draft     → amber
 *   unknown   → gray
 */

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  paid:      { color: 'bg-emerald-500', label: 'Pagada' },
  sent:      { color: 'bg-blue-500',    label: 'Enviada' },
  annulled:  { color: 'bg-red-400',     label: 'Anulada' },
  cancelled: { color: 'bg-red-400',     label: 'Cancelada' },
  draft:     { color: 'bg-amber-400',   label: 'Borrador' },
  overdue:   { color: 'bg-orange-500',  label: 'Vencida' },
};

interface InvoiceStatusDotProps {
  status: string;
  /** Optional size override (default: 'sm') */
  size?: 'xs' | 'sm';
}

export function InvoiceStatusDot({ status, size = 'sm' }: InvoiceStatusDotProps) {
  const s = (status || 'draft').toLowerCase();
  const { color, label } = STATUS_MAP[s] || { color: 'bg-gray-400', label: status || 'Desconocido' };
  const sizeClass = size === 'xs' ? 'h-1 w-1' : 'h-1.5 w-1.5';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(sizeClass, 'rounded-full shrink-0', color)} aria-label={label} />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px] px-2 py-1">{label}</TooltipContent>
    </Tooltip>
  );
}
