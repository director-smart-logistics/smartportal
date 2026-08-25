import React from 'react';
import { Pencil, Trash2, Boxes, Calendar, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PermissionTooltip } from '@/components/PermissionTooltip';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { type ManifestRecord } from '@/lib/services/manifest-processor';
import { formatRelative } from '../utils';
import { manifestsGridTemplateCols, TYPE_CONFIGS } from '../constants';

interface ManifestRowProps {
  manifest: ManifestRecord;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  canUpdate: boolean;
  canDelete: boolean;
  onMove: (manifest: ManifestRecord) => void;
  onEdit: (manifest: ManifestRecord) => void;
  onDelete: (manifest: ManifestRecord) => void;
  onShowDetails?: (manifest: ManifestRecord) => void;
}

/**
 * ManifestRow Component
 * Renders a row styled exactly like the packages/invoices spreadsheet grids.
 * - Utilizes CSS grid layout for high-performance alignment
 * - Individual cell borders (border-r border-border)
 * - Right-click Radix UI context menus
 * - Custom flag support for USA, Colombia, Mexico, and China manifests
 */
export const ManifestRow = React.memo(function ManifestRow({
  manifest,
  isSelected,
  onToggleSelection,
  canUpdate,
  canDelete,
  onMove,
  onEdit,
  onDelete,
  onShowDetails,
}: ManifestRowProps) {
  const manifestId = manifest.id;
  const config = TYPE_CONFIGS[manifest.manifestType || ''] || {
    label: manifest.manifestType || 'Desconocido',
    flag: '🏳️',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'flex flex-col border-b border-border transition-colors bg-background group',
            isSelected
              ? 'bg-[hsl(var(--manifest-brand-subtle))] hover:bg-[hsl(var(--manifest-brand-subtle))/90]'
              : 'hover:bg-slate-50/70'
          )}
        >
          <div
            className="grid w-full h-10 items-stretch text-xs"
            style={{ gridTemplateColumns: manifestsGridTemplateCols }}
          >
            {/* 1. Checkbox cell */}
            <div className="border-r border-border flex items-center justify-center bg-muted/5 shrink-0 h-full">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelection(manifestId)}
                className="h-4 w-4 rounded border-gray-400 text-gray-900 focus:ring-offset-0 cursor-pointer focus:ring-[hsl(var(--manifest-brand))]"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* 2. Details Action button cell */}
            <div className="border-r border-border flex items-center justify-center bg-muted/5 text-muted-foreground select-none shrink-0 h-full">
              <button
                onClick={() => onShowDetails?.(manifest)}
                className="inline-flex items-center justify-center h-5.5 w-5.5 rounded border border-border bg-white hover:bg-slate-50 transition-colors shadow-xs"
                title="Ver detalles del manifiesto"
              >
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            {/* 3. Manifest Number cell */}
            <div className="border-r border-border flex items-center px-3 py-1 font-mono text-xs select-text min-w-0 font-bold text-foreground">
              <span className="truncate">{manifestId}</span>
            </div>

            {/* 4. Type Badge with flag cell */}
            <div className="border-r border-border flex items-center px-3 py-1 min-w-0 select-none">
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded border shadow-xs transition-all flex items-center gap-1.5',
                  config.className
                )}
              >
                <span className="text-xs shrink-0 leading-none">{config.flag}</span>
                <span className="truncate">{config.label}</span>
              </Badge>
            </div>

            {/* 5. Package Count cell */}
            <div className="border-r border-border flex items-center justify-center font-mono font-bold text-foreground text-center">
              {manifest.totalPackages ?? 0}
            </div>

            {/* 5b. Total Weight cell */}
            <div className="border-r border-border flex items-center justify-center font-mono font-bold text-foreground text-center">
              {manifest.totalWeight ? `${manifest.totalWeight.toFixed(2)} kg` : '0.00 kg'}
            </div>

            {/* 6. USD Price cell */}
            <div className="border-r border-border flex items-center justify-end px-3 font-mono font-bold text-foreground">
              ${(manifest.totalPrice ?? 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>

            {/* 7. Exchange Rate cell */}
            <div className="border-r border-border flex items-center justify-center font-mono text-xs font-semibold text-muted-foreground">
              {manifest.exchangeRate ? `₡${manifest.exchangeRate}` : '—'}
            </div>

            {/* 8. Processed Date cell */}
            <div className="border-r border-border flex items-center px-3 text-xs text-muted-foreground font-semibold min-w-0">
              <span className="flex items-center gap-1.5 truncate" title={manifest.processedAt}>
                <Calendar className="h-3.5 w-3.5 opacity-60 text-muted-foreground shrink-0" />
                <span className="truncate">{formatRelative(manifest.processedAt)}</span>
              </span>
            </div>

            {/* 9. Actions cell */}
            <div className="flex items-center justify-end px-3 py-1 gap-1" onClick={(e) => e.stopPropagation()}>
              <PermissionTooltip allowed={canUpdate}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canUpdate}
                  onClick={() => onMove(manifest)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-[hsl(var(--manifest-brand))] hover:bg-[hsl(var(--manifest-brand-subtle))] rounded"
                  title="Mover paquetes"
                >
                  <Boxes className="h-3.5 w-3.5" />
                </Button>
              </PermissionTooltip>
              <PermissionTooltip allowed={canUpdate}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canUpdate}
                  onClick={() => onEdit(manifest)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-[hsl(var(--manifest-brand))] hover:bg-[hsl(var(--manifest-brand-subtle))] rounded"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </PermissionTooltip>
              <PermissionTooltip allowed={canDelete}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canDelete}
                  onClick={() => onDelete(manifest)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-650 hover:bg-red-50 rounded"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </PermissionTooltip>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Right-click Context Menu */}
      <ContextMenuContent className="w-56 bg-white border border-border shadow-lg rounded-lg text-xs p-1 select-none">
        <div className="px-2 py-1.5 border-b border-border/60 mb-1">
          <p className="font-mono font-bold text-foreground truncate">{manifestId}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mt-0.5 flex items-center gap-1.5">
            <span>{config.flag}</span>
            <span>{config.label}</span>
          </p>
        </div>

        <ContextMenuItem
          disabled={!canUpdate}
          onClick={() => onMove(manifest)}
          className={cn(
            "cursor-pointer flex items-center gap-2 px-2.5 py-2 hover:bg-[hsl(var(--manifest-brand-subtle))] hover:text-[hsl(var(--manifest-brand))] font-medium text-foreground rounded transition-colors",
            !canUpdate && "opacity-50 cursor-not-allowed"
          )}
        >
          <Boxes className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[hsl(var(--manifest-brand))]" />
          <span>Transferir Paquetes</span>
        </ContextMenuItem>

        <ContextMenuItem
          disabled={!canUpdate}
          onClick={() => onEdit(manifest)}
          className={cn(
            "cursor-pointer flex items-center gap-2 px-2.5 py-2 hover:bg-[hsl(var(--manifest-brand-subtle))] hover:text-[hsl(var(--manifest-brand))] font-medium text-foreground rounded transition-colors",
            !canUpdate && "opacity-50 cursor-not-allowed"
          )}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[hsl(var(--manifest-brand))]" />
          <span>Editar Manifiesto</span>
        </ContextMenuItem>

        <ContextMenuSeparator className="bg-border/60 my-1" />

        <ContextMenuItem
          disabled={!canDelete}
          onClick={() => onDelete(manifest)}
          className={cn(
            "cursor-pointer flex items-center gap-2 px-2.5 py-2 text-red-650 hover:bg-red-50 font-medium rounded transition-colors",
            !canDelete && "opacity-50 cursor-not-allowed"
          )}
        >
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
          <span>Eliminar Manifiesto</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
