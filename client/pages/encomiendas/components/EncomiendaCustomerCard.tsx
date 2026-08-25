import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Box, FileText, Copy, ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { CustomerSection, EncomiendaInvoice, EncomiendaPackage } from './useEncomiendaDispatchData';
import { useToast } from '@/hooks/use-toast';

import { updateCustomerEncomiendaService } from '@/lib/services/customer-sync';
import type { Encomienda } from '@/lib/services/encomienda-service';

// ── Status helpers ────────────────────────────────────────────────────────────

function invStatusCls(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'paid')      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (s === 'pending')   return 'bg-amber-100   text-amber-700  dark:bg-amber-900/40  dark:text-amber-300';
  if (s === 'sent')      return 'bg-sky-100      text-sky-700    dark:bg-sky-900/40    dark:text-sky-300';
  if (s === 'overdue')   return 'bg-rose-100     text-rose-700   dark:bg-rose-900/40   dark:text-rose-300';
  if (s === 'draft')     return 'bg-zinc-100     text-zinc-600   dark:bg-zinc-800      dark:text-zinc-300';
  if (s === 'cancelled' || s === 'annulled') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  return 'bg-muted text-muted-foreground';
}

function pkgStatusCls(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'route')     return 'bg-violet-100  text-violet-700 dark:bg-violet-900/40 dark:text-violet-300';
  if (s === 'transit')   return 'bg-amber-100   text-amber-700  dark:bg-amber-900/40  dark:text-amber-300';
  if (s === 'customs')   return 'bg-orange-100  text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
  if (s === 'received')  return 'bg-blue-100    text-blue-700   dark:bg-blue-900/40   dark:text-blue-300';
  if (s === 'delivered') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (s === 'returned')  return 'bg-red-100     text-red-700    dark:bg-red-900/40    dark:text-red-300';
  return 'bg-muted text-muted-foreground';
}

const INV_LABEL: Record<string, string> = {
  draft: 'Borrador', pending: 'Pendiente', sent: 'Enviada',
  paid: 'Pagada', overdue: 'Vencida', cancelled: 'Cancelada', annulled: 'Anulada',
};
const PKG_LABEL: Record<string, string> = {
  received: 'Recibido',
  transit: 'Tránsito',
  route: 'paquetes con estado en ruta',
  on_route: 'paquetes con estado en ruta',
  customs: 'Aduana',
  delivered: 'Entregado',
  returned: 'Devuelto',
  arrived: 'Llegó Hub',
  ready: 'Listo',
  pickup: 'Pickup',
  processed: 'Procesado',
};

function il(s: string) { return INV_LABEL[(s || '').toLowerCase()] ?? (s?.toUpperCase() ?? '—'); }
function pl(s: string) { return PKG_LABEL[(s || '').toLowerCase()] ?? (s?.toUpperCase() ?? '—'); }

// ── Props ─────────────────────────────────────────────────────────────────────

export interface EncomiendaCustomerCardProps {
  section: CustomerSection;
  selectedInvoiceIds: Set<string>;
  onToggleInvoice: (invoiceId: string) => void;
  onToggleCustomer: (customerId: string, allInvoiceIds: string[], value: boolean) => void;
  encomiendas?: Encomienda[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EncomiendaCustomerCard({
  section,
  selectedInvoiceIds,
  onToggleInvoice,
  onToggleCustomer,
  encomiendas = [],
}: EncomiendaCustomerCardProps) {
  const { toast } = useToast();
  const { customer, manifestGroups, totalPackages, totalAmount, lookupPackages } = section;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredEncomiendas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return encomiendas;
    return encomiendas.filter(enc => enc.name.toLowerCase().includes(term));
  }, [encomiendas, searchTerm]);

  const handleCopy = (text: string, description: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado',
      description: `${description} "${text}" copiado al portapapeles.`,
      duration: 2000,
    });
  };

  const handleUpdateCustomerEncomienda = async (serviceName: string) => {
    try {
      toast({
        title: 'Asignando Servicio',
        description: `Asignando servicio de encomienda "${serviceName || 'Ninguno'}" al cliente...`,
      });
      await updateCustomerEncomiendaService(customer.slCode, serviceName);
      toast({
        title: 'Servicio Asignado',
        description: `Se asignó el servicio "${serviceName || 'Ninguno'}" a ${customer.fullName} con éxito.`,
      });
    } catch (err: any) {
      console.error('[EncomiendaCustomerCard] Error assigning encomienda service:', err);
      toast({
        title: 'Error al asignar',
        description: err.message || 'Ocurrió un error inesperado al actualizar el servicio.',
        variant: 'destructive',
      });
    }
  };

  const allInvoices = manifestGroups.flatMap(g => g.invoices);
  const allPackages = manifestGroups.flatMap(g => g.packages).length > 0
    ? manifestGroups.flatMap(g => g.packages)
    : lookupPackages;
  const allInvoiceIds = allInvoices.map(inv => inv.id);

  const customerChecked = allInvoiceIds.length > 0 && allInvoiceIds.every(id => selectedInvoiceIds.has(id));
  const customerIndeterminate = !customerChecked && allInvoiceIds.some(id => selectedInvoiceIds.has(id));

  // Map invoice → packages (via invoice items trackings) - ALWAYS use lookupPackages for complete real-time lookup
  const trackingToPkg = new Map<string, EncomiendaPackage>();
  for (const pkg of lookupPackages) {
    if (pkg.trackingNumber) trackingToPkg.set(pkg.trackingNumber.toUpperCase(), pkg);
  }

  return (
    <div className={cn(
      'rounded-lg border shadow-sm transition-colors',
      isDropdownOpen ? 'overflow-visible relative z-30' : 'overflow-hidden',
      customerChecked ? 'border-primary/40' : 'border-border',
    )}>

      {/* ── Customer group header ──────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center gap-3 px-4 py-2 border-b border-border/60',
        customerChecked ? 'bg-primary/5' : 'bg-muted/30',
      )}>
        <Checkbox
          id={`chk-cust-${customer.id}`}
          checked={customerChecked ? true : customerIndeterminate ? 'indeterminate' : false}
          onCheckedChange={v => onToggleCustomer(customer.id, allInvoiceIds, !!v)}
          aria-label={`Seleccionar facturas de ${customer.fullName}`}
          className="shrink-0"
        />

        {/* Initial avatar */}
        <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 select-none">
          {customer.fullName?.charAt(0).toUpperCase()}
        </div>

        {/* slCode Badge — after avatar, before name! */}
        {customer.slCode && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-mono font-semibold shrink-0 uppercase border border-slate-200 dark:border-slate-700">
            {customer.slCode}
          </span>
        )}

        {/* Name + service */}
        <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
          <span className="font-semibold text-sm">{customer.fullName}</span>
          <div ref={dropdownRef} className="relative inline-block">
            {customer.encomiendaServiceName ? (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(prev => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 hover:bg-violet-200 transition-all select-none border border-violet-200"
                title="Cambiar servicio de encomienda"
              >
                <Box className="h-2.5 w-2.5 text-violet-600" />
                {customer.encomiendaServiceName}
                <ChevronDown className="h-2 w-2 opacity-60 text-violet-600" />
              </button>
            ) : (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(prev => !prev);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all select-none border border-dashed border-slate-300"
                title="Asignar servicio de encomienda"
              >
                <Box className="h-2.5 w-2.5" />
                Sin Servicio
                <ChevronDown className="h-2 w-2 opacity-60" />
              </button>
            )}

            {isDropdownOpen && (
              <div 
                className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 shadow-lg rounded-md p-1.5 z-30"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Asignar Encomienda
                </div>
                
                {/* Search Input for Typeahead */}
                <div className="px-1.5 py-1">
                  <input
                    type="text"
                    placeholder="Buscar servicio..."
                    className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 bg-slate-50"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="my-1 border-b border-slate-100" />

                {/* Filtered active encomiendas list */}
                <div className="max-h-48 overflow-y-auto space-y-0.5 py-0.5">
                  {filteredEncomiendas.length === 0 ? (
                    <div className="px-2 py-3 text-[11px] text-slate-400 italic text-center">
                      No se encontraron servicios
                    </div>
                  ) : (
                    filteredEncomiendas.map((enc) => (
                      <button
                        key={enc.id}
                        type="button"
                        className={cn(
                          "w-full flex items-center px-2.5 py-1.5 text-left text-[11px] rounded transition-colors text-slate-700 hover:bg-slate-100",
                          customer.encomiendaServiceName === enc.name && "bg-violet-50 text-violet-700 font-semibold"
                        )}
                        onClick={() => {
                          handleUpdateCustomerEncomienda(enc.name);
                          setIsDropdownOpen(false);
                          setSearchTerm('');
                        }}
                      >
                        {enc.name}
                      </button>
                    ))
                  )}
                </div>

                {customer.encomiendaServiceName && (
                  <>
                    <div className="my-1 border-b border-slate-100" />
                    <button
                      type="button"
                      className="w-full flex items-center px-2.5 py-1.5 text-left text-[11px] text-red-600 hover:bg-red-50 rounded font-medium transition-colors"
                      onClick={() => {
                        handleUpdateCustomerEncomienda('');
                        setIsDropdownOpen(false);
                        setSearchTerm('');
                      }}
                    >
                      Quitar servicio
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Summary counts */}
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-right">
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Paquetes</div>
            <div className="font-bold text-sm">{totalPackages}</div>
          </div>
          {totalAmount > 0 && (
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide">Total</div>
              <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                ${totalAmount.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {customer.notes && (
        <div className="bg-amber-50/50 dark:bg-amber-950/10 px-4 py-1.5 border-b border-border/40 flex items-start gap-1.5 text-[10px] text-amber-800 dark:text-amber-300">
          <span className="font-semibold uppercase tracking-wider shrink-0 mt-0.5">Notas/Instrucciones:</span>
          <span className="font-medium line-clamp-2 md:line-clamp-none leading-relaxed">{customer.notes}</span>
        </div>
      )}

      {/* ── Invoice rows — flat, no nesting ───────────────────────────────── */}
      {allInvoices.length > 0 ? (
        <div>
          {allInvoices.map((inv, idx) => {
            const isSelected = selectedInvoiceIds.has(inv.id);
            // Trackings linked to this invoice via items
            const trackings: string[] = (inv.invoiceItems || [])
              .map((it: any) => it.trackingNumber)
              .filter(Boolean);

            // Unique package statuses - show if at least one sub-package is scanned/registered and all registered sub-packages share the same status
            const physicalPkgs = trackings
              .map(t => trackingToPkg.get(t.toUpperCase()))
              .filter((p): p is EncomiendaPackage => !!p && p.status.toLowerCase() !== 'ready');

            const statuses = physicalPkgs.map(p => p.status);
            const allHaveSameStatus = physicalPkgs.length > 0 && 
              new Set(statuses).size === 1;

            const pkgStatuses = allHaveSameStatus ? [statuses[0]] : [];

            const cleanInvNo = (inv.invoiceNumber || inv.id).replace(/[\s\-_]+/g, '').toUpperCase();
            const hasMasterPkg = trackingToPkg.has(inv.invoiceNumber?.toUpperCase() || '') || trackingToPkg.has(cleanInvNo);

            return (
              <div
                key={inv.id}
                onClick={() => onToggleInvoice(inv.id)}
                className={cn(
                  'flex items-start gap-3 px-4 py-2.5 cursor-pointer text-xs transition-all duration-100',
                  'border-b border-border/30 last:border-b-0 border-l-4',
                  idx % 2 === 1 ? 'bg-muted/5' : 'bg-background',
                  isSelected
                    ? 'bg-primary/8 border-l-primary ring-1 ring-inset ring-primary/20'
                    : 'border-l-transparent hover:bg-accent/40 hover:border-l-primary/40',
                )}
              >
                {/* Checkbox — aligned to first line */}
                <span onClick={e => e.stopPropagation()} className="mt-0.5 shrink-0">
                  <Checkbox
                    id={`chk-inv-${inv.id}`}
                    checked={isSelected}
                    onCheckedChange={() => onToggleInvoice(inv.id)}
                    aria-label={`Factura ${inv.invoiceNumber}`}
                    className="h-3.5 w-3.5"
                  />
                </span>

                {/* Two-line content block */}
                <div className="flex-1 min-w-0 space-y-1">

                  {/* Line 1 — Invoice # + status pills + amount */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      onClick={(e) => handleCopy(inv.invoiceNumber || inv.id.slice(-8), 'Número de factura', e)}
                      className="inline-flex items-center gap-1 font-mono font-bold text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-2 shrink-0 cursor-copy hover:bg-blue-50 dark:hover:bg-blue-950/30 px-1.5 py-0.5 rounded transition-all duration-150 active:scale-95 group/inv"
                      title="Haz clic para copiar"
                    >
                      {inv.invoiceNumber || inv.id.slice(-8)}
                      <Copy className="h-3 w-3 text-blue-500/70 group-hover/inv:text-blue-600 transition-colors" />
                    </span>

                    {/* Invoice status */}
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap',
                      invStatusCls(inv.status)
                    )}>
                      {il(inv.status)}
                    </span>

                    {/* Internal tracking status badge */}
                    {hasMasterPkg ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                        Con Tracking Interno
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        Sin Tracking Interno
                      </span>
                    )}

                    {/* Package status pill(s) */}
                    {pkgStatuses.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    ) : (
                      pkgStatuses.slice(0, 2).map(st => (
                        <span
                          key={st}
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap select-none',
                            pkgStatusCls(st)
                          )}
                        >
                          {pl(st)}
                        </span>
                      ))
                    )}
                    {pkgStatuses.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">+{pkgStatuses.length - 2}</span>
                    )}

                    {/* Amount — pushed right */}
                    <span className="ml-auto font-semibold text-[12px] tabular-nums shrink-0">
                      {(inv.totalAmount || 0) > 0
                        ? `${inv.currency || 'USD'} ${(inv.totalAmount || 0).toFixed(2)}`
                        : <span className="text-muted-foreground font-normal">—</span>}
                    </span>
                  </div>

                  {/* Line 2 — Trackings subordinate, indented feel via muted style */}
                  {trackings.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-1 border-l-2 border-border/40">
                      {trackings.map(t => (
                        <span
                          key={t}
                          onClick={(e) => handleCopy(t, 'Código de rastreo', e)}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-foreground/80 bg-muted/70 hover:bg-violet-600 hover:text-white hover:scale-105 hover:shadow-sm px-2 py-0.5 rounded cursor-copy transition-all duration-150 active:scale-95 group/tracking"
                          title="Haz clic para copiar"
                        >
                          {t}
                          <Copy className="h-3 w-3 text-muted-foreground/70 group-hover/tracking:text-white transition-colors" />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback: no invoices but packages exist — show trackings directly */
        allPackages.length > 0 ? (
          <div>
            {allPackages.map((pkg, idx) => (
              <div
                key={pkg.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-2 text-xs border-b border-border/30 last:border-b-0 border-l-4 border-l-transparent',
                  idx % 2 === 1 ? 'bg-muted/5' : 'bg-background',
                  'hover:bg-accent/40 hover:border-l-primary/40 transition-all duration-100',
                )}
              >
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span
                  onClick={(e) => handleCopy(pkg.trackingNumber || pkg.id.slice(-8), 'Código de rastreo', e)}
                  className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-foreground/80 bg-muted/70 hover:bg-violet-600 hover:text-white hover:scale-105 hover:shadow-sm px-2 py-0.5 rounded cursor-copy transition-all duration-150 active:scale-95 group/pkg"
                  title="Haz clic para copiar"
                >
                  {pkg.trackingNumber || pkg.id.slice(-8)}
                  <Copy className="h-3 w-3 text-muted-foreground/70 group-hover/pkg:text-white transition-colors" />
                </span>
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
                  pkgStatusCls(pkg.status)
                )}>
                  {pl(pkg.status)}
                </span>
                {pkg.manifestNumber && (
                  <span className="text-[10px] text-muted-foreground font-mono">{pkg.manifestNumber}</span>
                )}
                <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 font-medium">Sin factura</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-2 text-xs text-muted-foreground italic">Sin facturas ni paquetes.</p>
        )
      )}
    </div>
  );
}
