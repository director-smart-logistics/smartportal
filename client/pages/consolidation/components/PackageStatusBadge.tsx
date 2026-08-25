/**
 * PackageStatusBadge
 *
 * Compact, colored status indicator for packages in the Kanban board.
 * Uses the same color palette as the Distribution module's getStatusBadge.
 *
 * ── Status Color Mapping ─────────────────────────────────────────────────────
 *   received        → cyan     (Recibido en Miami)
 *   transit         → indigo   (En Tránsito a CR)
 *   customs         → amber    (Procesando en CR)
 *   held            → orange   (Retenido en Aduana)
 *   consolidated    → purple   (Consolidado)
 *   route           → blue     (En Ruta)
 *   delivered       → green    (Entregado)
 *   returned/failed → red      (Devuelto)
 *   processed       → sky      (Facturado)
 *   pickup          → teal     (Retira en SL)
 *   pre-alerted     → gray     (Pre-Alertado)
 */

import React from 'react';
import { cn } from '@/lib/utils';

/** Canonical status → display config */
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  received:                { label: 'Recibido',     bg: 'bg-cyan-100',    text: 'text-cyan-700' },
  transit:                 { label: 'En Tránsito',  bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  customs:                 { label: 'Aduana',        bg: 'bg-amber-100',   text: 'text-amber-700' },
  held:                    { label: 'Retenido',      bg: 'bg-orange-100',  text: 'text-orange-700' },
  consolidated:            { label: 'Consolidado',   bg: 'bg-purple-100',  text: 'text-purple-700' },
  consolidated_completed:  { label: 'Consolidado',   bg: 'bg-purple-100',  text: 'text-purple-700' },
  route:                   { label: 'En Ruta',       bg: 'bg-blue-100',    text: 'text-blue-700' },
  in_transit:              { label: 'En Ruta',       bg: 'bg-blue-100',    text: 'text-blue-700' },
  out_for_delivery:        { label: 'En Ruta',       bg: 'bg-blue-100',    text: 'text-blue-700' },
  delivered:               { label: 'Entregado',     bg: 'bg-green-100',   text: 'text-green-700' },
  returned:                { label: 'Devuelto',      bg: 'bg-red-100',     text: 'text-red-700' },
  failed:                  { label: 'Devuelto',      bg: 'bg-red-100',     text: 'text-red-700' },
  processed:               { label: 'Facturado',     bg: 'bg-sky-100',     text: 'text-sky-700' },
  pickup:                  { label: 'Retira',        bg: 'bg-teal-100',    text: 'text-teal-700' },
  'pre-alerted':           { label: 'Pre-Alerta',    bg: 'bg-gray-100',    text: 'text-gray-600' },
};

const DEFAULT_CONFIG = { label: 'Pendiente', bg: 'bg-gray-100', text: 'text-gray-500' };

interface PackageStatusBadgeProps {
  status: string;
  className?: string;
}

export function PackageStatusBadge({ status, className }: PackageStatusBadgeProps) {
  const key = (status || '').toLowerCase();
  const config = STATUS_CONFIG[key] || { ...DEFAULT_CONFIG, label: status || DEFAULT_CONFIG.label };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none whitespace-nowrap',
        config.bg,
        config.text,
        className
      )}
      title={config.label}
    >
      {config.label}
    </span>
  );
}
