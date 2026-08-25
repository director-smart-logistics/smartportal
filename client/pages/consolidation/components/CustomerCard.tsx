import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, User, Package, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ManifestGroup } from './ManifestGroup';
import type { CustomerSection } from './types';

interface CustomerCardProps {
  section: CustomerSection;
  allManifestNumbers: string[];
  defaultOpen?: boolean;
  /** When non-null, externally forces the card open (true) or closed (false) */
  forceOpen?: boolean | null;
  onPackageMoved: (pkgId: string, newManifest: string) => void;
  onPackageRemoved?: (pkgId: string) => void;
}

export function CustomerCard({
  section,
  allManifestNumbers,
  defaultOpen = true,
  forceOpen = null,
  onPackageMoved,
  onPackageRemoved,
}: CustomerCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen !== null) setOpen(forceOpen);
  }, [forceOpen]);
  const { customer, manifestGroups, totalPackages } = section;

  /** Only this customer's manifest numbers — used to limit the move-dialog list */
  const customerManifestNumbers = useMemo(
    () => manifestGroups.map(g => g.manifestNumber),
    [manifestGroups]
  );

  const totalInvoices = manifestGroups.reduce((s, g) => s + g.invoices.length, 0);
  const reassignedTotal = manifestGroups.reduce(
    (s, g) => s + g.packages.filter(p => p.isReassigned).length,
    0
  );

  return (
    <div className={cn(
      'rounded-xl border shadow-sm overflow-hidden',
      reassignedTotal > 0 ? 'border-blue-200 dark:border-blue-700' : 'border-border'
    )}>
      {/* Customer header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-3 px-5 py-4 text-left transition-colors',
          'bg-card hover:bg-muted/30',
          open && 'border-b border-border'
        )}
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
        }

        <span className="flex items-center gap-2 flex-1 min-w-0">
          <User className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <span className="font-semibold text-sm text-foreground truncate">{customer.fullName?.toUpperCase()}</span>
          <span className="font-mono text-[11px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
            {customer.slCode}
          </span>
          {customer.ruta && (
            <span className="text-[11px] text-muted-foreground shrink-0">· {customer.ruta}</span>
          )}
        </span>

        {/* Stats */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Layers className="h-3 w-3" aria-hidden />
            {manifestGroups.length} manifiesto{manifestGroups.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Package className="h-3 w-3" aria-hidden />
            {totalPackages} paquete{totalPackages !== 1 ? 's' : ''}
          </span>
          {totalInvoices > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {totalInvoices} factura{totalInvoices !== 1 ? 's' : ''}
            </span>
          )}
          {reassignedTotal > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700">
              {reassignedTotal} reasignado{reassignedTotal !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {/* Manifest groups */}
      {open && (
        <div className="px-5 py-4 space-y-3 bg-muted/10">
          {manifestGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Sin manifiestos para este cliente.
            </p>
          ) : manifestGroups.map(group => (
            <ManifestGroup
              key={group.manifestNumber}
              group={group}
              allManifestNumbers={allManifestNumbers}
              defaultOpen={manifestGroups.length === 1}
              onPackageMoved={onPackageMoved}
              onPackageRemoved={onPackageRemoved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
