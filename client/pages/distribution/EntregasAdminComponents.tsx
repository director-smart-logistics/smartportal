import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  sendAdminNotification, forceCloseSession, subscribeToSessionPackages,
  reassignSessionDriver, deleteRouteSession, revertPackageToRoute, removePackageFromRouteSession,
  type RouteSession, type SessionReport, type RouteSessionPackage,
} from '@/lib/services/route-session-service';
import { useUsers } from '@/lib/hooks/queries/useUsers';
import { useToast } from '@/hooks/use-toast';
import {
  Bell, Send, Loader2, ChevronDown, ChevronUp,
  AlertTriangle, Clock, Search,
  Package, Users, Truck, AlertCircle,
  RotateCcw, ThumbsUp, PhoneCall, ShieldClose, UserCog,
  Eye, FileText, Trash2, Brain, CheckCircle2, MapPin, Navigation,
  Building2, Filter, ArrowUpDown, X, FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── helpers ──────────────────────────────────────────────────────────────────
export function fmtTime(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}
export function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }); }
  catch { return '—'; }
}
export function fmtCRC(n: number) { return `₡${Math.round(n).toLocaleString('es-CR')}`; }
export function fmtUSD(n: number) { return `$${n.toFixed(2)}`; }
export function elapsed(iso?: string) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── Status chip ──────────────────────────────────────────────────────────────
export function StatusChip({ status }: { status: 'open' | 'closed' }) {
  return status === 'open' ? (
    <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700/40 text-[10px]">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Activa
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px]">Cerrada</Badge>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────
export function DeliveryBar({ rate }: { rate: number }) {
  const c = rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', c)} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{rate}%</span>
    </div>
  );
}

// ── Notification dialog (fixes overlap) ──────────────────────────────────────
const PRESETS = [
  { icon: Package,   text: 'Hay un paquete urgente, llámame al llegar.' },
  { icon: Clock,     text: 'Apura el paso, hay retraso en la ruta.' },
  { icon: ThumbsUp,  text: 'Buen trabajo, sigue así.' },
  { icon: RotateCcw, text: 'Regresa a bodega antes de continuar.' },
  { icon: PhoneCall, text: 'Llama a la oficina cuando puedas.' },
];

export function NotifDialog({ session, sentBy, open, onClose }: {
  session: RouteSession; sentBy: string; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await sendAdminNotification(session.id!, msg.trim(), sentBy, session.driverId);
      toast({ title: 'Notificación enviada', description: `Al chofer de ${session.routeName}` });
      setMsg(''); onClose();
    } catch { toast({ title: 'Error al enviar', variant: 'destructive' }); }
    finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4 text-amber-500" />
            Notificar · {session.routeName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-col gap-1.5">
            {PRESETS.map(({ icon: Icon, text }) => (
              <button key={text} onClick={() => setMsg(text)}
                className="flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors text-left">
                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />{text}
              </button>
            ))}
          </div>
          <textarea value={msg} onChange={e => setMsg(e.target.value)}
            placeholder="Mensaje personalizado..." rows={3}
            className="w-full rounded-lg bg-background border border-input text-sm text-foreground placeholder-muted-foreground px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          <Button onClick={send} disabled={!msg.trim() || sending} className="w-full" size="sm">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Send className="w-3.5 h-3.5 mr-2" />}
            Enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Force close dialog ────────────────────────────────────────────────────────
export function ForceCloseDialog({ session, adminName, open, onClose }: {
  session: RouteSession; adminName: string; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);

  const doClose = async () => {
    setClosing(true);
    try {
      await forceCloseSession(session.id!, adminName, note);
      toast({ title: 'Sesión cerrada', description: `${session.routeName} cerrada por admin` });
      onClose();
    } catch { toast({ title: 'Error', variant: 'destructive' }); }
    finally { setClosing(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Forzar cierre · {session.routeName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Esta acción cierra la sesión sin el proceso normal de check-out. El chofer será notificado.</p>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="Motivo del cierre forzado..." rows={3}
          className="w-full rounded-lg bg-background border border-input text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button variant="destructive" onClick={doClose} disabled={closing} className="flex-1">
            {closing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <ShieldClose className="w-3.5 h-3.5 mr-2" />}
            Cerrar Sesión
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Reassign driver dialog ────────────────────────────────────────────────────
export function ReassignDialog({ session, open, onClose }: {
  session: RouteSession; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const { data: usersResp } = useUsers();
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  const drivers = ((usersResp as any[]) ?? [])
    .filter(u => u.role === 'AGENT' || u.role === 'DELIVERY')
    .map(u => ({ id: u.id, name: u.fullName || u.email }));

  const save = async () => {
    const driver = drivers.find(d => d.id === selected);
    if (!driver) return;
    setSaving(true);
    try {
      await reassignSessionDriver(session.id!, driver.id, driver.name);
      toast({ title: 'Chofer reasignado', description: driver.name });
      onClose();
    } catch { toast({ title: 'Error', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCog className="w-4 h-4 text-blue-500" />
            Reasignar Chofer · {session.routeName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Chofer actual: <strong>{session.driverName}</strong></p>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          className="w-full rounded-lg bg-background border border-input text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Selecciona un chofer...</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={save} disabled={!selected || saving} className="flex-1">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <UserCog className="w-3.5 h-3.5 mr-2" />}
            Reasignar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Packages dialog (live) ────────────────────────────────────────────────────
const PKG_STATUS_COLORS: Record<string, string> = {
  delivered:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending:      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  returned:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  attempted:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pickup:       'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  retira_oficina: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  consolidated: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  consolidado:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
};

interface PkgInvoice {
  invoiceNumber?: string;
  amountUSD?: number;
  amountCRC?: number;
  exchangeRate?: number;
  status?: string;
}

async function fetchInvoicesForTrackings(trackings: string[]): Promise<Map<string, PkgInvoice>> {
  const result = new Map<string, PkgInvoice>();
  if (!trackings.length) return result;
  const upper = trackings.map(t => t.toUpperCase());
  const CHUNK = 30;
  for (let i = 0; i < upper.length; i += CHUNK) {
    const chunk = upper.slice(i, i + CHUNK);
    try {
      const snap = await getDocs(query(collection(db, 'invoices'), where('trackingNumber', 'in', chunk)));
      snap.forEach(d => {
        const data = d.data();
        const t = (data.trackingNumber as string ?? '').toUpperCase();
        if (t) result.set(t, {
          invoiceNumber: data.invoiceNumber,
          amountUSD: data.amount ?? data.totalAmount,
          amountCRC: data.amountCRC,
          exchangeRate: Number(data.exchangeRate || data.tc || data.tipoCambio || 0),
          status: data.status,
        });
      });
    } catch { /* non-fatal */ }
  }
  return result;
}

export function PackagesDialog({ session, open, onClose }: {
  session: RouteSession; open: boolean; onClose: () => void;
}) {
  const [pkgs, setPkgs] = useState<RouteSessionPackage[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Map<string, PkgInvoice>>(new Map());
  const [loadingInv, setLoadingInv] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Live packages
  useEffect(() => {
    if (!open || !session.id) return;
    return subscribeToSessionPackages(session.id, setPkgs);
  }, [open, session.id]);

  // Fetch invoices once packages load
  useEffect(() => {
    if (!open || !pkgs.length) return;
    setLoadingInv(true);
    const trackings = pkgs.map(p => p.tracking).filter(Boolean);
    fetchInvoicesForTrackings(trackings)
      .then(setInvoiceMap)
      .finally(() => setLoadingInv(false));
  }, [open, pkgs.length]);

  const delivered = pkgs.filter(p => p.deliveryStatus === 'delivered').length;
  const pending   = pkgs.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending').length;

  const filtered = pkgs.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.tracking?.toLowerCase().includes(q) ||
      p.customerName?.toLowerCase().includes(q) ||
      p.slCode?.toLowerCase().includes(q) ||
      invoiceMap.get(p.tracking?.toUpperCase() ?? '')?.invoiceNumber?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || (p.deliveryStatus ?? 'pending') === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden" aria-describedby={undefined}>
        {/* Hidden title for Radix a11y */}
        <DialogTitle className="sr-only">Paquetes · {session.routeName}</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-base">{session.routeName}</span>
            <span className="text-muted-foreground text-sm">· Paquetes</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[11px]">{delivered} entregados</Badge>
            <Badge variant="secondary" className="text-[11px]">{pending} pendientes</Badge>
            <Badge variant="outline" className="text-[11px]">{pkgs.length} total</Badge>
            {loadingInv && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border bg-muted/30 shrink-0">
          <div className="relative flex-1 max-w-sm">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tracking, cliente, factura..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs rounded-md bg-background border border-input px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="delivered">Entregado</option>
            <option value="attempted">Intento fallido</option>
            <option value="returned">Devuelto</option>
          </select>
          {(search || statusFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              Limpiar
            </button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} de {pkgs.length}</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1.4fr_0.55fr_1.2fr_0.7fr_1.8fr_0.65fr_0.85fr] gap-3 px-5 py-2.5 bg-muted border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
            <span>Tracking</span>
            <span>SL Code</span>
            <span>Cliente</span>
            <span>Estado</span>
            <span className="flex items-center gap-1"><FileText className="w-3 h-3" />Factura</span>
            <span className="text-right">USD</span>
            <span className="text-right">CRC</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Package className="w-8 h-8 opacity-25" />
              <p className="text-sm">{pkgs.length === 0 ? 'Sin paquetes registrados' : 'Sin resultados para el filtro aplicado'}</p>
            </div>
          ) : filtered.map(p => {
            const inv = invoiceMap.get(p.tracking?.toUpperCase() ?? '');
            return (
              <div key={p.packageId}
                className="grid grid-cols-[1.4fr_0.55fr_1.2fr_0.7fr_1.8fr_0.65fr_0.85fr] gap-3 px-5 py-2.5 border-b border-border last:border-0 items-center hover:bg-muted/30 transition-colors">
                <span className="font-mono text-[11px] text-foreground truncate" title={p.tracking}>{p.tracking}</span>
                <span className="text-[11px] text-muted-foreground">{p.slCode ?? '—'}</span>
                <span className="text-[11px] text-foreground truncate" title={p.customerName}>{p.customerName ?? '—'}</span>
                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold w-fit whitespace-nowrap', PKG_STATUS_COLORS[p.deliveryStatus ?? 'pending'] ?? 'bg-muted text-muted-foreground')}>
                  {p.deliveryStatus ?? 'pendiente'}
                </span>
                <span className="text-[11px] font-medium text-foreground whitespace-nowrap">
                  {inv?.invoiceNumber
                    ? <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-muted-foreground shrink-0" />{inv.invoiceNumber}</span>
                    : <span className="text-muted-foreground">—</span>}
                </span>
                <span className="text-[11px] text-right tabular-nums text-emerald-600 font-medium">
                  {inv?.amountUSD ? `$${Number(inv.amountUSD).toFixed(2)}` : (p.cashAmount && p.currency === 'USD' ? `$${Number(p.cashAmount).toFixed(2)}` : '—')}
                </span>
                <span className="text-[11px] text-right tabular-nums text-blue-600 font-medium">
                  {inv?.amountCRC ? `₡${Math.round(Number(inv.amountCRC)).toLocaleString('es-CR')}` : (p.cashAmount && p.currency === 'CRC' ? `₡${Math.round(p.cashAmount).toLocaleString('es-CR')}` : '—')}
                </span>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ── Payment & Customer Metrics Helper Functions ────────────────────────────────

/**
 * Robustly detects whether a currency field string or numeric indicator denotes US Dollars ($/USD).
 * Prevents currency misclassification regressions when drivers or packages log USD amounts.
 */
export function isUSDCurrency(str?: string): boolean {
  if (!str) return false;
  const s = String(str).toUpperCase().trim();
  return s === 'USD' || s === 'US$' || s === '$' || s === 'USD$';
}

export function isCRCCurrency(str?: string): boolean {
  if (!str) return false;
  const s = String(str).toUpperCase().trim();
  return s === 'CRC' || s === '₡' || s === 'COLONES' || s === 'COLON';
}

export function determinePackageIsUSD(
  p: RouteSessionPackage,
  evPay?: { cashPaidCurrency?: string },
  amt?: number,
): boolean {
  const explicitCurr = p.cashPaidCurrency || evPay?.cashPaidCurrency || p.currency || (p as any).currencySymbol || (p as any).moneda;
  if (isUSDCurrency(explicitCurr)) return true;
  if (isCRCCurrency(explicitCurr)) return false;
  if (typeof amt === 'number' && amt > 200) return false;
  if ((p as any).currency === 'USD' || (p as any).moneda === 'USD') return true;
  return false;
}

export function getSessionExchangeRate(
  packages?: RouteSessionPackage[],
  invoiceMap?: Map<string, PkgInvoice>,
  session?: RouteSession,
  defaultTc: number = 500,
): number {
  if (invoiceMap) {
    for (const inv of invoiceMap.values()) {
      if (inv.exchangeRate && Number(inv.exchangeRate) > 0) {
        return Number(inv.exchangeRate);
      }
    }
  }
  if (session) {
    const sRate = Number((session as any).exchangeRate || (session as any).tc || (session as any).tipoCambio);
    if (sRate > 0) return sRate;
  }
  for (const p of (packages ?? [])) {
    const rate = Number((p as any).exchangeRate || (p as any).tc || (p as any).tipoCambio);
    if (rate > 0) return rate;
  }
  return defaultTc;
}

export function formatMoneyWithTc(crc: number, usd: number, tc: number = 500) {
  const safeTc = tc > 0 ? tc : 500;
  if (crc > 0 && usd > 0) {
    const usdToCRC = Math.round(usd * safeTc);
    const totalCRC = crc + usdToCRC;
    const totalUSD = usd + (crc / safeTc);
    return {
      primary: `${fmtCRC(crc)}  /  ${fmtUSD(usd)}`,
      sub: `Total: ${fmtCRC(totalCRC)}  ($${usd.toFixed(2)} × ₡${safeTc} = ${fmtCRC(usdToCRC)} · Total USD: ${fmtUSD(totalUSD)})`,
    };
  }
  if (usd > 0) {
    const equivCRC = Math.round(usd * safeTc);
    return {
      primary: fmtUSD(usd),
      sub: `≈ ${fmtCRC(equivCRC)} (TC ₡${safeTc})`,
    };
  }
  if (crc > 0) {
    const equivUSD = crc / safeTc;
    return {
      primary: fmtCRC(crc),
      sub: `≈ ${fmtUSD(equivUSD)} (TC ₡${safeTc})`,
    };
  }
  return {
    primary: '₡0',
    sub: undefined,
  };
}

/**
 * Classifies raw payment method strings or Hacienda payment codes into standard buckets:
 * - 'sinpe': SINPE Móvil, sinpe, sinpe_movil, or code '06'
 * - 'transfer': Transferencia, Transfer, Tarjeta, Banco, Depósito, or codes '02'/'03'
 * - 'cash': Efectivo, Cash, or code '01' (default fallback)
 */
function classifyPaymentMethod(rawPm?: string): 'sinpe' | 'transfer' | 'cash' {
  if (!rawPm) return 'cash';
  const s = String(rawPm).toLowerCase().trim();
  if (s.includes('sinpe') || s === '06') return 'sinpe';
  if (
    s.includes('transf') ||
    s.includes('transfer') ||
    s.includes('tarjeta') ||
    s.includes('banco') ||
    s.includes('deposito') ||
    s.includes('depósito') ||
    s === '02' ||
    s === '03'
  ) return 'transfer';
  return 'cash';
}

/**
 * Computes exact monetary breakdown in both CRC (₡) and USD ($) for delivered packages in a route session.
 * 
 * CRITICAL DESIGN RULES TO PREVENT REGRESSIONS:
 * 1. Dual Key Event Mapping: Indexes delivery events by both `packageId` and `tracking` to ensure
 *    driver payment logs are retrieved regardless of document vs tracking key mismatches.
 * 2. Multi-currency Support: Separates totals for CRC and USD per payment method (Efectivo, SINPE, Transferencia).
 * 3. Fallback Amount Extraction: Checks `cashPaid` on package, then `cashPaid` on delivery event, then price fields.
 */
export function computePaymentMetrics(packages: RouteSessionPackage[], events?: any[]) {
  let cashCRC = 0;
  let cashUSD = 0;
  let sinpeCRC = 0;
  let sinpeUSD = 0;
  let transferCRC = 0;
  let transferUSD = 0;

  const eventPayMap = new Map<string, { cashPaid?: number; cashPaidCurrency?: string; paymentMethod?: string }>();
  if (Array.isArray(events)) {
    events.forEach(ev => {
      if (ev && (ev.type === 'delivery' || ev.hasSignature || ev.cashPaid) && ev.cashPaid > 0) {
        const payInfo = {
          cashPaid: ev.cashPaid,
          cashPaidCurrency: ev.cashPaidCurrency,
          paymentMethod: ev.paymentMethod,
        };
        if (ev.packageId) eventPayMap.set(String(ev.packageId).toLowerCase().trim(), payInfo);
        if (ev.tracking) eventPayMap.set(String(ev.tracking).toLowerCase().trim(), payInfo);
      }
    });
  }

  (packages ?? []).forEach(p => {
    const isDelivered = p.deliveryStatus === 'delivered' || (p as any).status === 'delivered';
    if (!isDelivered) return;

    const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
    const trkKey = (p.tracking || '').toLowerCase().trim();
    const evPay = eventPayMap.get(pkgKey) || eventPayMap.get(trkKey);

    const pmCategory = classifyPaymentMethod(p.paymentMethod || evPay?.paymentMethod);

    let amt = 0;
    if (typeof p.cashPaid === 'number' && p.cashPaid > 0) {
      amt = p.cashPaid;
    } else if (evPay && typeof evPay.cashPaid === 'number' && evPay.cashPaid > 0) {
      amt = evPay.cashPaid;
    } else {
      amt = (p as any).cashAmount ??
            (p as any).amountCRC ??
            (p as any).amountUSD ??
            (p as any).amount ??
            (p as any).price ??
            (p as any).precio ??
            (p as any).costCRC ??
            0;
    }

    if (amt <= 0) return;

    const isUSD = determinePackageIsUSD(p, evPay, amt);

    if (pmCategory === 'sinpe') {
      if (isUSD) sinpeUSD += amt;
      else sinpeCRC += amt;
    } else if (pmCategory === 'transfer') {
      if (isUSD) transferUSD += amt;
      else transferCRC += amt;
    } else {
      if (isUSD) cashUSD += amt;
      else cashCRC += amt;
    }
  });

  return { cashCRC, cashUSD, sinpeCRC, sinpeUSD, transferCRC, transferUSD };
}

export function computeCustomerMetrics(packages: RouteSessionPackage[]) {
  const uniqueClients = new Map<string, RouteSessionPackage[]>();
  (packages ?? []).forEach(p => {
    const key = (p.slCode || p.customerName || '').toUpperCase().trim();
    if (key) {
      if (!uniqueClients.has(key)) uniqueClients.set(key, []);
      uniqueClients.get(key)!.push(p);
    }
  });

  const totalClients = uniqueClients.size;
  let deliveredClients = 0;
  let pickupClients = 0;
  let consolidatedClients = 0;
  let returnedClients = 0;
  let pendingClients = 0;

  uniqueClients.forEach(clientPkgs => {
    const statuses = clientPkgs.map(p => (p.deliveryStatus || (p as any).status || 'pending').toLowerCase().trim());
    if (statuses.some(s => s === 'delivered')) {
      deliveredClients++;
    } else if (statuses.some(s => s === 'pickup' || s === 'retira_oficina')) {
      pickupClients++;
    } else if (statuses.some(s => s === 'consolidated' || s === 'consolidado')) {
      consolidatedClients++;
    } else if (statuses.some(s => s === 'returned')) {
      returnedClients++;
    } else {
      pendingClients++;
    }
  });

  const pkgs = packages ?? [];
  return {
    totalClients,
    deliveredClients,
    pickupClients,
    consolidatedClients,
    returnedClients,
    pendingClients,
    totalPackages: pkgs.length,
    deliveredPackages: pkgs.filter(p => p.deliveryStatus === 'delivered').length,
    pickupPackages: pkgs.filter(p => p.deliveryStatus === 'pickup' || p.deliveryStatus === 'retira_oficina').length,
    consolidatedPackages: pkgs.filter(p => p.deliveryStatus === 'consolidated' || p.deliveryStatus === 'consolidado').length,
    returnedPackages: pkgs.filter(p => p.deliveryStatus === 'returned').length,
  };
}

export function computeOperationalMetrics(session: RouteSession) {
  const startKm = session.startKm ?? 0;
  const endKm = session.endKm ?? 0;
  const kmDriven = session.kmDriven ?? (endKm > startKm ? endKm - startKm : 0);

  const fuelRefills = session.fuelRefills ?? [];
  let fuelCRC = 0;
  let fuelUSD = 0;
  fuelRefills.forEach(f => {
    if (f.currency === 'USD') fuelUSD += (f.amountPaid ?? 0);
    else fuelCRC += (f.amountPaid ?? 0);
  });

  const tollPayments = session.tollPayments ?? [];
  let tollCRC = 0;
  let tollUSD = 0;
  tollPayments.forEach(t => {
    if (t.currency === 'USD') tollUSD += (t.amountPaid ?? 0);
    else tollCRC += (t.amountPaid ?? 0);
  });

  const parkingPayments = session.parkingPayments ?? [];
  let parkingCRC = 0;
  let parkingUSD = 0;
  parkingPayments.forEach(p => {
    if (p.currency === 'USD') parkingUSD += (p.amountPaid ?? 0);
    else parkingCRC += (p.amountPaid ?? 0);
  });

  const didRefuelFuel = fuelRefills.length > 0 || fuelCRC > 0 || fuelUSD > 0;

  return {
    startKm,
    endKm,
    kmDriven,
    didRefuelFuel,
    fuelRefillsCount: fuelRefills.length,
    fuelCRC,
    fuelUSD,
    tollCRC,
    tollUSD,
    parkingCRC,
    parkingUSD,
  };
}

// ── Live report computation (for open sessions) ──────────────────────────────
export function computeLiveReport(session: RouteSession): SessionReport {
  const pkgs = session.packages ?? [];
  const delivered = pkgs.filter(p => p.deliveryStatus === 'delivered').length;
  const returned  = pkgs.filter(p => p.deliveryStatus === 'returned').length;
  const attempted = pkgs.filter(p => p.deliveryStatus === 'attempted').length;
  const total     = pkgs.length || session.totalPackages || 0;
  const rate      = total > 0 ? Math.round((delivered / total) * 100) : 0;

  const pay = computePaymentMetrics(pkgs);
  const cli = computeCustomerMetrics(pkgs);

  const faltantes = pkgs
    .filter(p => p.deliveryStatus === 'returned' || p.deliveryStatus === 'attempted')
    .map(p => ({ packageId: p.packageId, tracking: p.tracking, customerName: p.customerName, category: p.deliveryStatus ?? 'returned', note: p.returnReason }));

  const durationMinutes = session.startAt
    ? Math.round((Date.now() - new Date(session.startAt).getTime()) / 60000)
    : 0;

  return {
    totalPackages: total,
    deliveredCount: delivered,
    returnedCount: returned,
    faltanteCount: faltantes.length,
    deliveryRate: rate,
    kmDriven: 0,
    durationMinutes,
    cashCollectedCRC: pay.cashCRC,
    cashCollectedUSD: pay.cashUSD,
    sinpeCollectedCRC: pay.sinpeCRC,
    sinpeCollectedUSD: pay.sinpeUSD,
    transferCollectedCRC: pay.transferCRC,
    transferCollectedUSD: pay.transferUSD,
    totalClients: cli.totalClients,
    deliveredClients: cli.deliveredClients,
    faltanteDetail: faltantes,
    generatedAt: new Date().toISOString(),
  };
}

// ── Live delivery timeline ────────────────────────────────────────────────────
/**
 * Shows the last-delivered package for open sessions.
 */
export function LiveDeliveryTimeline({ packages }: { packages: RouteSessionPackage[] }) {
  // Last delivered — highest deliveredAt timestamp
  const delivered = packages
    .filter(p => p.deliveryStatus === 'delivered' && p.deliveredAt)
    .sort((a, b) => new Date(b.deliveredAt!).getTime() - new Date(a.deliveredAt!).getTime());
  const lastDelivered = delivered[0] ?? null;

  if (!lastDelivered) return null;

  return (
    <div className="mb-3">
      <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-card px-3.5 py-2.5 flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-emerald-500">
          <CheckCircle2 className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Último Entregado</p>
            {lastDelivered.deliveredAt && (
              <span className="text-[9px] px-1.5 py-0 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                {fmtTime(lastDelivered.deliveredAt)}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-foreground truncate mt-0.5" title={lastDelivered.customerName}>
            {lastDelivered.customerName ?? '—'}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-mono">{lastDelivered.tracking}</span>
            {lastDelivered.slCode && (
              <span className="font-mono text-muted-foreground">({lastDelivered.slCode})</span>
            )}
            {lastDelivered.cashAmount && lastDelivered.cashAmount > 0 && (
              <span className="text-emerald-600 font-semibold">
                {lastDelivered.currency === 'USD' ? `$${lastDelivered.cashAmount}` : `₡${Math.round(lastDelivered.cashAmount).toLocaleString('es-CR')}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function getSessionManifests(session: RouteSession): string[] {
  const set = new Set<string>();
  if ((session as any).manifestNumbers && Array.isArray((session as any).manifestNumbers)) {
    (session as any).manifestNumbers.forEach((m: string) => { if (m?.trim()) set.add(m.trim()); });
  }
  if ((session as any).selectedManifests && Array.isArray((session as any).selectedManifests)) {
    (session as any).selectedManifests.forEach((m: string) => { if (m?.trim()) set.add(m.trim()); });
  }
  (session.packages ?? []).forEach(p => {
    if (p.manifestNumber && p.manifestNumber.trim()) {
      set.add(p.manifestNumber.trim());
    }
  });
  return Array.from(set);
}

// ── Session Stat Detail Modal (Interactive Breakdown) ─────────────────────────
export type StatModalCategory = 'delivered' | 'pickup' | 'consolidated' | 'returned' | 'all';

export function SessionStatDetailModal({
  session,
  initialCategory = 'delivered',
  initialPaymentFilter = 'all',
  open,
  onClose,
}: {
  session: RouteSession;
  initialCategory?: StatModalCategory;
  initialPaymentFilter?: 'all' | 'cash' | 'sinpe' | 'transfer';
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [category, setCategory] = useState<StatModalCategory>(initialCategory);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'sinpe' | 'transfer'>(initialPaymentFilter);
  const [sortBy, setSortBy] = useState<'client_asc' | 'client_desc' | 'tracking' | 'factura' | 'amount_desc' | 'amount_asc' | 'date_desc' | 'date_asc'>('date_desc');
  const [invoiceMap, setInvoiceMap] = useState<Map<string, PkgInvoice>>(new Map());
  const [loadingInv, setLoadingInv] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState<{ url: string; title: string } | null>(null);
  const [revertConfirmPkg, setRevertConfirmPkg] = useState<RouteSessionPackage | null>(null);
  const [reverting, setReverting] = useState(false);
  const [deleteConfirmPkg, setDeleteConfirmPkg] = useState<RouteSessionPackage | null>(null);
  const [deletingPkg, setDeletingPkg] = useState(false);

  const [manifestTc, setManifestTc] = useState<number | null>(null);

  // Sync props when opening
  useEffect(() => {
    if (open) {
      setCategory(initialCategory);
      setPaymentFilter(initialPaymentFilter);
      setSearch('');
    }
  }, [open, initialCategory, initialPaymentFilter]);

  const pkgs = useMemo(() => session.packages ?? [], [session.packages]);

  // Fetch exchange rate from manifest documents
  useEffect(() => {
    if (!open) return;
    const mList = getSessionManifests(session);
    if (!mList.length) return;
    for (const mNo of mList) {
      if (!mNo || mNo === 'consolidacion_transitoria') continue;
      getDocs(query(collection(db, 'manifests'), where('manifestNumber', '==', mNo.trim())))
        .then(snap => {
          if (!snap.empty) {
            const rate = Number(snap.docs[0].data()?.exchangeRate);
            if (rate > 0) setManifestTc(rate);
          }
        })
        .catch(() => {});
    }
  }, [open, session]);

  // Fetch invoices for trackings (cached per open modal)
  useEffect(() => {
    if (!open || pkgs.length === 0) return;
    const trackings = pkgs.map(p => p.tracking).filter(Boolean);
    if (trackings.length === 0) return;

    setLoadingInv(true);
    fetchInvoicesForTrackings(trackings)
      .then(map => setInvoiceMap(map))
      .catch(err => console.warn('[SessionStatDetailModal] Error loading invoices:', err))
      .finally(() => setLoadingInv(false));
  }, [open, pkgs]);

  // Map events by package key
  const eventMap = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(session.events)) {
      session.events.forEach(ev => {
        if (ev && ev.packageId) map.set(String(ev.packageId).toLowerCase().trim(), ev);
        if (ev && ev.tracking) map.set(String(ev.tracking).toLowerCase().trim(), ev);
      });
    }
    return map;
  }, [session.events]);

  // Filter packages
  const filtered = useMemo(() => {
    return pkgs.filter(p => {
      const status = (p.deliveryStatus || (p as any).status || 'pending').toLowerCase().trim();

      // 1. Category Filter
      let matchCat = true;
      if (category === 'delivered') {
        matchCat = status === 'delivered';
      } else if (category === 'pickup') {
        matchCat = status === 'pickup' || status === 'retira_oficina';
      } else if (category === 'consolidated') {
        matchCat = status === 'consolidated' || status === 'consolidado' || !!p.isConsolidation;
      } else if (category === 'returned') {
        matchCat = status === 'returned';
      }

      if (!matchCat) return false;

      // 2. Payment Filter
      if (paymentFilter !== 'all') {
        const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
        const trkKey = (p.tracking || '').toLowerCase().trim();
        const evPay = eventMap.get(pkgKey) || eventMap.get(trkKey);
        const pm = classifyPaymentMethod(p.paymentMethod || evPay?.paymentMethod);
        if (pm !== paymentFilter) return false;
      }

      // 3. Search Filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const inv = invoiceMap.get(p.tracking?.toUpperCase() ?? '');
        const match =
          p.customerName?.toLowerCase().includes(q) ||
          p.slCode?.toLowerCase().includes(q) ||
          p.tracking?.toLowerCase().includes(q) ||
          p.deliveryAddress?.toLowerCase().includes(q) ||
          p.manifestNumber?.toLowerCase().includes(q) ||
          inv?.invoiceNumber?.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [pkgs, category, paymentFilter, search, invoiceMap, eventMap]);

  // Sort packages
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const invA = invoiceMap.get(a.tracking?.toUpperCase() ?? '');
      const invB = invoiceMap.get(b.tracking?.toUpperCase() ?? '');

      const getAmt = (p: RouteSessionPackage, inv?: PkgInvoice) => {
        const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
        const trkKey = (p.tracking || '').toLowerCase().trim();
        const evPay = eventMap.get(pkgKey) || eventMap.get(trkKey);
        if (typeof p.cashPaid === 'number' && p.cashPaid > 0) return p.cashPaid;
        if (evPay && typeof evPay.cashPaid === 'number' && evPay.cashPaid > 0) return evPay.cashPaid;
        return (p as any).cashAmount ?? (p as any).amountCRC ?? (p as any).amountUSD ?? (p as any).amount ?? (p as any).price ?? (p as any).precio ?? (p as any).costCRC ?? inv?.amountCRC ?? inv?.amountUSD ?? 0;
      };

      if (sortBy === 'client_asc') return (a.customerName ?? '').localeCompare(b.customerName ?? '');
      if (sortBy === 'client_desc') return (b.customerName ?? '').localeCompare(a.customerName ?? '');
      if (sortBy === 'tracking') return (a.tracking ?? '').localeCompare(b.tracking ?? '');
      if (sortBy === 'factura') return (invA?.invoiceNumber ?? '').localeCompare(invB?.invoiceNumber ?? '');
      if (sortBy === 'amount_desc') return getAmt(b, invB) - getAmt(a, invA);
      if (sortBy === 'amount_asc') return getAmt(a, invA) - getAmt(b, invB);

      const getTime = (p: RouteSessionPackage) => {
        const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
        const trkKey = (p.tracking || '').toLowerCase().trim();
        const ev = eventMap.get(pkgKey) || eventMap.get(trkKey);
        const iso = p.deliveredAt || p.returnedAt || ev?.timestamp;
        return iso ? new Date(iso).getTime() : 0;
      };
      if (sortBy === 'date_asc') return getTime(a) - getTime(b);
      return getTime(b) - getTime(a); // default date_desc
    });
  }, [filtered, sortBy, invoiceMap, eventMap]);

  // Customer metrics
  const cliMetrics = useMemo(() => computeCustomerMetrics(pkgs), [pkgs]);
  const sessionTc = useMemo(() => {
    return manifestTc || getSessionExchangeRate(pkgs, invoiceMap, session);
  }, [pkgs, invoiceMap, session, manifestTc]);

  // Current money total
  const currentMoney = useMemo(() => {
    let crc = 0;
    let usd = 0;
    filtered.forEach(p => {
      const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
      const trkKey = (p.tracking || '').toLowerCase().trim();
      const evPay = eventMap.get(pkgKey) || eventMap.get(trkKey);
      const inv = invoiceMap.get(p.tracking?.toUpperCase() ?? '');

      let amt = 0;
      if (typeof p.cashPaid === 'number' && p.cashPaid > 0) {
        amt = p.cashPaid;
      } else if (evPay && typeof evPay.cashPaid === 'number' && evPay.cashPaid > 0) {
        amt = evPay.cashPaid;
      } else {
        amt = (p as any).cashAmount ??
              (p as any).amountCRC ??
              (p as any).amountUSD ??
              (p as any).amount ??
              (p as any).price ??
              (p as any).precio ??
              (p as any).costCRC ??
              inv?.amountCRC ??
              inv?.amountUSD ??
              0;
      }

      if (amt > 0) {
        const isUSD = determinePackageIsUSD(p, evPay, amt);
        if (isUSD) usd += amt;
        else crc += amt;
      }
    });
    return { crc, usd };
  }, [filtered, eventMap, invoiceMap]);

  const displayMoney = useMemo(() => {
    return formatMoneyWithTc(currentMoney.crc, currentMoney.usd, sessionTc);
  }, [currentMoney, sessionTc]);

  const CATEGORY_TABS: { key: StatModalCategory; label: string; count: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'delivered', label: 'Entregados', count: cliMetrics.deliveredClients, icon: CheckCircle2 },
    { key: 'pickup', label: 'Retira Oficina', count: cliMetrics.pickupClients, icon: Building2 },
    { key: 'consolidated', label: 'Consolidados', count: cliMetrics.consolidatedClients, icon: Package },
    { key: 'returned', label: 'Devueltos', count: cliMetrics.returnedClients, icon: RotateCcw },
    { key: 'all', label: 'Todos', count: cliMetrics.totalClients, icon: Users },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Detalle de Sesión · {session.routeName}</DialogTitle>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 border-b border-border bg-card gap-3 shrink-0 pr-12">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-foreground">{session.routeName}</span>
                  <StatusChip status={session.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Chofer: <span className="font-medium text-foreground">{session.driverName ?? '—'}</span>
                  {session.vehiclePlate && <span className="ml-2 font-mono">({session.vehiclePlate})</span>}
                </p>
              </div>

              {/* Money summary badge */}
              <div className="flex items-center gap-2 bg-muted/60 px-3 py-1 rounded-lg border border-border text-xs ml-0 sm:ml-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Cobrado:</span>
                <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {displayMoney.primary}
                </span>
                {displayMoney.sub && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({displayMoney.sub})
                  </span>
                )}
                {loadingInv && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border bg-muted/20 overflow-x-auto shrink-0">
            {CATEGORY_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = category === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setCategory(tab.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  <span className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums',
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-border bg-card shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar cliente, tracking, factura, dirección..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Filter className="w-3.5 h-3.5" />
                <select
                  value={paymentFilter}
                  onChange={e => setPaymentFilter(e.target.value as any)}
                  className="bg-background border border-input rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">Todos los pagos</option>
                  <option value="cash">Efectivo</option>
                  <option value="sinpe">SINPE Móvil</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </div>

              <div className="flex items-center gap-1 text-muted-foreground">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-background border border-input rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="date_desc">Fecha/Hora (Reciente)</option>
                  <option value="date_asc">Fecha/Hora (Antiguo)</option>
                  <option value="client_asc">Cliente (A - Z)</option>
                  <option value="client_desc">Cliente (Z - A)</option>
                  <option value="tracking">Tracking</option>
                  <option value="factura">Factura</option>
                  <option value="amount_desc">Monto (Mayor)</option>
                  <option value="amount_asc">Monto (Menor)</option>
                </select>
              </div>

              <span className="text-[11px] font-mono text-muted-foreground pl-2 border-l border-border">
                {sorted.length} de {pkgs.length} paquetes
              </span>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border">
            <div className="grid grid-cols-[1.4fr_1.2fr_1.1fr_1fr_1.1fr_120px] gap-3 px-5 py-2.5 bg-muted/80 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
              <span>Cliente / Receptor</span>
              <span>Factura / Manifiesto</span>
              <span>Paquete</span>
              <span>Cobro / Pago</span>
              <span>Auditoría / Evento</span>
              <span className="text-center">Acciones / Firma</span>
            </div>

            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Package className="w-8 h-8 opacity-25" />
                <p className="text-sm font-medium">{pkgs.length === 0 ? 'Sin paquetes en la sesión' : 'Sin resultados para los filtros seleccionados'}</p>
                {(search || paymentFilter !== 'all') && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setPaymentFilter('all'); }} className="text-xs mt-1">
                    Limpiar Filtros
                  </Button>
                )}
              </div>
            ) : (
              sorted.map(p => {
                const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
                const trkKey = (p.tracking || '').toLowerCase().trim();
                const ev = eventMap.get(pkgKey) || eventMap.get(trkKey);
                const inv = invoiceMap.get(p.tracking?.toUpperCase() ?? '');

                const pm = classifyPaymentMethod(p.paymentMethod || ev?.paymentMethod);

                let paidAmt = 0;
                if (typeof p.cashPaid === 'number' && p.cashPaid > 0) paidAmt = p.cashPaid;
                else if (ev && typeof ev.cashPaid === 'number' && ev.cashPaid > 0) paidAmt = ev.cashPaid;
                else {
                  paidAmt = (p as any).cashAmount ??
                            (p as any).amountCRC ??
                            (p as any).amountUSD ??
                            (p as any).amount ??
                            (p as any).price ??
                            (p as any).precio ??
                            (p as any).costCRC ??
                            inv?.amountCRC ??
                            inv?.amountUSD ??
                            0;
                }

                const isUSD = determinePackageIsUSD(p, ev, paidAmt);

                const sigUrl = p.signatureUrl || ev?.signatureUrl || ev?.fuelPhotoUrl;
                const statusStr = (p.deliveryStatus || (p as any).status || 'pending').toLowerCase();
                const statusBadgeClass = PKG_STATUS_COLORS[statusStr] ?? 'bg-muted text-muted-foreground';
                const isRevertible = ['consolidated', 'consolidado', 'pickup', 'retira_oficina', 'returned', 'attempted'].includes(statusStr);

                const timestampIso = p.deliveredAt || p.returnedAt || ev?.timestamp;

                return (
                  <div
                    key={p.packageId || p.tracking}
                    className="grid grid-cols-[1.4fr_1.2fr_1.1fr_1fr_1.1fr_120px] gap-3 px-5 py-3 border-b border-border last:border-0 items-center hover:bg-muted/30 transition-colors text-xs"
                  >
                    {/* Cliente */}
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate" title={p.customerName}>
                        {p.customerName ?? 'Cliente Desconocido'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {p.slCode && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                            {p.slCode}
                          </Badge>
                        )}
                        {p.deliveryAddress && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={p.deliveryAddress}>
                            {p.deliveryAddress}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Factura / Manifiesto */}
                    <div className="min-w-0">
                      {inv?.invoiceNumber ? (
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{inv.invoiceNumber}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                      {p.manifestNumber && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate" title={`Manifiesto: ${p.manifestNumber}`}>
                          Man: {p.manifestNumber}
                        </p>
                      )}
                    </div>

                    {/* Paquete */}
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-medium text-foreground truncate" title={p.tracking}>
                        {p.tracking}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-semibold capitalize', statusBadgeClass)}>
                          {statusStr === 'retira_oficina' ? 'Retira Oficina' : statusStr}
                        </span>
                        {p.weight && (
                          <span className="text-[10px] text-muted-foreground font-mono">{p.weight} kg</span>
                        )}
                      </div>
                    </div>

                    {/* Cobro / Pago */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 capitalize">
                          {pm === 'cash' ? 'Efectivo' : pm === 'sinpe' ? 'SINPE' : 'Transf'}
                        </Badge>
                      </div>
                      <p className="font-bold tabular-nums text-foreground mt-0.5">
                        {paidAmt > 0 ? (isUSD ? fmtUSD(paidAmt) : fmtCRC(paidAmt)) : '—'}
                      </p>
                    </div>

                    {/* Auditoría / Evento */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{timestampIso ? `${fmtDate(timestampIso)} ${fmtTime(timestampIso)}` : '—'}</span>
                      </div>
                      {(p.returnReason || p.attemptNote || ev?.reason || ev?.note) && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate mt-0.5" title={p.returnReason || p.attemptNote || ev?.reason || ev?.note}>
                          {p.returnReason || p.attemptNote || ev?.reason || ev?.note}
                        </p>
                      )}
                    </div>

                    {/* Acciones / Firma */}
                    <div className="flex items-center justify-center gap-1.5">
                      {isRevertible && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px] font-semibold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-300 dark:border-amber-700 flex items-center gap-1 shrink-0"
                          title="Revertir a En Ruta (Restaurar manifiesto y factura)"
                          onClick={() => setRevertConfirmPkg(p)}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Revertir
                        </Button>
                      )}
                      {sigUrl && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-emerald-600 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950 shrink-0"
                          title="Ver evidencia de firma"
                          onClick={() => setSelectedSignature({ url: sigUrl, title: `Firma · ${p.customerName ?? p.tracking}` })}
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-red-600 border-red-200 dark:border-red-800/40 hover:bg-red-50 dark:hover:bg-red-950/50 hover:border-red-300 shrink-0"
                        title="Eliminar registro de la sesión de ruta"
                        onClick={() => setDeleteConfirmPkg(p)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Package from Session Confirmation Dialog */}
      {deleteConfirmPkg && (
        <Dialog open={!!deleteConfirmPkg} onOpenChange={v => !v && setDeleteConfirmPkg(null)}>
          <DialogContent className="max-w-md p-5">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-600">
                <Trash2 className="w-4.5 h-4.5 text-red-600" />
                Eliminar Registro de la Sesión
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-xs space-y-2.5 text-muted-foreground">
              <p>
                ¿Estás seguro de que deseas eliminar este registro de la sesión de ruta <strong className="text-foreground">{session.routeName}</strong>?
              </p>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 space-y-1.5 text-[11px] border border-red-200 dark:border-red-900/40 font-mono text-red-800 dark:text-red-300">
                <p>• <strong>Cliente:</strong> {deleteConfirmPkg.customerName ?? 'Desconocido'} {deleteConfirmPkg.slCode ? `(${deleteConfirmPkg.slCode})` : ''}</p>
                <p>• <strong>Tracking:</strong> {deleteConfirmPkg.tracking}</p>
                {deleteConfirmPkg.manifestNumber && <p>• <strong>Manifiesto:</strong> {deleteConfirmPkg.manifestNumber}</p>}
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                El paquete será liberado de la sesión activa del chofer para que pueda ser asignado a la ruta correcta.
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmPkg(null)} disabled={deletingPkg}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5"
                disabled={deletingPkg}
                onClick={async () => {
                  setDeletingPkg(true);
                  try {
                    await removePackageFromRouteSession(session.id!, deleteConfirmPkg, 'Admin');
                    toast({
                      title: 'Registro Eliminado',
                      description: `El paquete ${deleteConfirmPkg.tracking} (${deleteConfirmPkg.customerName ?? deleteConfirmPkg.slCode ?? 'Cliente'}) fue removido de la sesión.`,
                    });
                    setDeleteConfirmPkg(null);
                  } catch (err: any) {
                    toast({
                      title: 'Error al eliminar',
                      description: err?.message || 'No se pudo eliminar el registro de la sesión.',
                      variant: 'destructive',
                    });
                  } finally {
                    setDeletingPkg(false);
                  }
                }}
              >
                {deletingPkg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar y Eliminar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Revert Consolidation Confirmation Dialog */}
      {revertConfirmPkg && (
        <Dialog open={!!revertConfirmPkg} onOpenChange={v => !v && setRevertConfirmPkg(null)}>
          <DialogContent className="max-w-md p-4">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600">
                <RotateCcw className="w-4 h-4" />
                Revertir Consolidación a En Ruta
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-xs space-y-2 text-muted-foreground">
              <p>
                ¿Deseas revertir el estado del paquete <strong className="font-mono text-foreground">{revertConfirmPkg.tracking}</strong> del cliente <strong className="text-foreground">{revertConfirmPkg.customerName}</strong> a <span className="text-emerald-600 font-bold">En Ruta</span>?
              </p>
              <div className="bg-muted/40 rounded p-2.5 space-y-1 text-[11px] font-mono border border-border">
                <p>• Estado en ruta: <span className="text-emerald-600 font-semibold">pending / En Ruta</span></p>
                <p>• Manifiesto a restaurar: <span className="text-blue-600 font-semibold">{(revertConfirmPkg as any).originalManifestNumber || (session as any).manifestNumbers?.[0] || revertConfirmPkg.manifestNumber || '—'}</span></p>
                <p>• Factura: <span className="text-indigo-600 font-semibold">Des-anulada y vinculada en BD</span></p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" size="sm" onClick={() => setRevertConfirmPkg(null)} disabled={reverting}>
                Cancelar
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={reverting}
                onClick={async () => {
                  setReverting(true);
                  try {
                    await revertPackageToRoute(session.id!, revertConfirmPkg, 'Admin');
                    toast({
                      title: 'Consolidación Revertida',
                      description: `El paquete ${revertConfirmPkg.tracking} de ${revertConfirmPkg.customerName ?? 'cliente'} volvió a estar En Ruta.`,
                    });
                    setRevertConfirmPkg(null);
                  } catch (err: any) {
                    toast({
                      title: 'Error al revertir',
                      description: err?.message || 'No se pudo revertir el paquete.',
                      variant: 'destructive',
                    });
                  } finally {
                    setReverting(false);
                  }
                }}
              >
                {reverting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Confirmar y Revertir
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Signature Image Preview Modal */}
      {selectedSignature && (
        <Dialog open={!!selectedSignature} onOpenChange={v => !v && setSelectedSignature(null)}>
          <DialogContent className="max-w-md p-4">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-500" />
                {selectedSignature.title}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 border border-border rounded-lg p-2 bg-muted/20 flex items-center justify-center min-h-[200px]">
              <img
                src={selectedSignature.url}
                alt="Firma de entrega"
                className="max-h-[350px] w-auto object-contain rounded"
              />
            </div>
            <div className="flex justify-end mt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedSignature(null)}>
                Cerrar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Report panel (expanded row) ───────────────────────────────────────────────
export function ReportPanel({ session, isLive }: { session: RouteSession; isLive?: boolean }) {
  const [modalCategory, setModalCategory] = useState<StatModalCategory>('delivered');
  const [modalPaymentFilter, setModalPaymentFilter] = useState<'all' | 'cash' | 'sinpe' | 'transfer'>('all');
  const [showStatModal, setShowStatModal] = useState(false);

  const openCategoryModal = (cat: StatModalCategory) => {
    setModalCategory(cat);
    setModalPaymentFilter('all');
    setShowStatModal(true);
  };

  const openPaymentModal = (pmFilter: 'cash' | 'sinpe' | 'transfer') => {
    setModalCategory('all');
    setModalPaymentFilter(pmFilter);
    setShowStatModal(true);
  };

  const pkgs = session.packages ?? [];
  const isOpen = session.status === 'open';
  const liveReport = isOpen ? computeLiveReport(session) : null;
  const report = session.report ?? liveReport ?? {
    totalPackages: pkgs.length,
    deliveredCount: pkgs.filter(p => p.deliveryStatus === 'delivered').length,
    returnedCount: pkgs.filter(p => p.deliveryStatus === 'returned').length,
    faltanteCount: pkgs.filter(p => p.deliveryStatus === 'returned' || p.deliveryStatus === 'attempted').length,
    deliveryRate: pkgs.length > 0 ? Math.round((pkgs.filter(p => p.deliveryStatus === 'delivered').length / pkgs.length) * 100) : 0,
    kmDriven: session.kmDriven ?? 0,
    durationMinutes: 0,
    cashCollectedCRC: 0,
    cashCollectedUSD: 0,
    faltanteDetail: [],
    generatedAt: new Date().toISOString(),
  };

  const pay = computePaymentMetrics(pkgs, session.events);
  const cli = computeCustomerMetrics(pkgs);
  const ops = computeOperationalMetrics(session);
  const manifests = getSessionManifests(session);

  const getMoneyCardDisplay = (crc: number, usd: number) => {
    if (crc > 0 && usd > 0) return { v: fmtCRC(crc), sub: fmtUSD(usd) };
    if (usd > 0) return { v: fmtUSD(usd), sub: undefined };
    if (crc > 0) return { v: fmtCRC(crc), sub: undefined };
    return { v: '₡0', sub: undefined };
  };

  const cashDisp = getMoneyCardDisplay(pay.cashCRC, pay.cashUSD);
  const sinpeDisp = getMoneyCardDisplay(pay.sinpeCRC, pay.sinpeUSD);
  const transferDisp = getMoneyCardDisplay(pay.transferCRC, pay.transferUSD);

  return (
    <div className="px-4 pb-4 pt-3 border-t border-border bg-muted/20">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reporte Operativo & Métricas de Sesión</p>
        {isLive && (
          <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />En vivo
          </span>
        )}
      </div>

      {/* Live timeline — only for open sessions with packages */}
      {isLive && pkgs.length > 0 && (
        <LiveDeliveryTimeline packages={pkgs} />
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
        {[
          { l: 'Clientes Entregados', cat: 'delivered', v: `${cli.deliveredClients}/${cli.totalClients}`, sub: `${cli.deliveredPackages} paquetes`, cls: 'text-emerald-600 font-bold' },
          { l: 'Retira en Oficina', cat: 'pickup', v: `${cli.pickupClients} clientes`, sub: `${cli.pickupPackages} paquetes`, cls: 'text-teal-600 font-bold' },
          { l: 'Consolidados', cat: 'consolidated', v: `${cli.consolidatedClients} clientes`, sub: `${cli.consolidatedPackages} paquetes`, cls: 'text-indigo-600 font-bold' },
          { l: 'Devueltos', cat: 'returned', v: `${cli.returnedClients} clientes`, sub: `${cli.returnedPackages} paquetes`, cls: 'text-orange-600 font-bold' },
          { l: 'Efectivo CRC/USD', pm: 'cash', v: cashDisp.v, sub: cashDisp.sub, cls: 'text-emerald-600 font-bold' },
          { l: 'SINPE Móvil', pm: 'sinpe', v: sinpeDisp.v, sub: sinpeDisp.sub, cls: 'text-purple-600 font-bold' },
          { l: 'Transferencia', pm: 'transfer', v: transferDisp.v, sub: transferDisp.sub, cls: 'text-indigo-600 font-bold' },
          { l: 'KM Recorridos', v: ops.kmDriven > 0 ? `${ops.kmDriven.toLocaleString('es-CR')} km` : (session.endKm && session.startKm ? `${session.endKm - session.startKm} km` : '—'), sub: ops.startKm > 0 && ops.endKm > 0 ? `${ops.startKm} → ${ops.endKm} km` : undefined, cls: 'text-blue-600 font-bold' },
          { l: 'Combustible', v: ops.didRefuelFuel ? 'SÍ Cargó' : 'No cargó', sub: ops.fuelCRC > 0 ? fmtCRC(ops.fuelCRC) : ops.fuelUSD > 0 ? fmtUSD(ops.fuelUSD) : undefined, cls: ops.didRefuelFuel ? 'text-amber-600 font-bold' : 'text-muted-foreground font-medium' },
          { l: 'Peajes', v: ops.tollCRC > 0 || ops.tollUSD > 0 ? fmtCRC(ops.tollCRC) : '₡0', sub: ops.tollUSD > 0 ? fmtUSD(ops.tollUSD) : undefined, cls: ops.tollCRC > 0 ? 'text-blue-600 font-bold' : 'text-muted-foreground font-medium' },
          { l: 'Parqueo', v: ops.parkingCRC > 0 || ops.parkingUSD > 0 ? fmtCRC(ops.parkingCRC) : '₡0', sub: ops.parkingUSD > 0 ? fmtUSD(ops.parkingUSD) : undefined, cls: ops.parkingCRC > 0 ? 'text-purple-600 font-bold' : 'text-muted-foreground font-medium' },
          { l: 'Manifiestos', v: manifests.length > 0 ? manifests.join(', ') : '—', sub: manifests.length > 0 ? `${manifests.length} manifiesto(s)` : undefined, cls: 'text-foreground font-bold font-mono text-xs' },
        ].map(card => {
          const isInteractive = Boolean(card.cat || card.pm);
          return (
            <button
              key={card.l}
              type="button"
              disabled={!isInteractive}
              onClick={() => {
                if (card.cat) openCategoryModal(card.cat as StatModalCategory);
                else if (card.pm) openPaymentModal(card.pm as 'cash' | 'sinpe' | 'transfer');
              }}
              className={cn(
                'rounded-lg border border-border bg-card px-3 py-2 flex flex-col justify-between text-left transition-all duration-150',
                isInteractive ? 'hover:border-primary/50 hover:bg-muted/40 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.99] group' : 'cursor-default'
              )}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">{card.l}</p>
                {isInteractive && <Eye className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all shrink-0" />}
              </div>
              <div>
                <p className={cn('text-sm font-bold tabular-nums', card.cls)}>{card.v}</p>
                {card.sub && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{card.sub}</p>}
              </div>
            </button>
          );
        })}
      </div>

      {report.faltanteDetail?.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 p-3">
          <p className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Faltantes ({report.faltanteDetail.length})
          </p>
          {report.faltanteDetail.map(f => (
            <div key={f.packageId} className="flex items-center gap-2 text-[11px] py-0.5">
              <span className="text-muted-foreground font-mono">{f.tracking.slice(-8)}</span>
              <span className="text-foreground flex-1">{f.customerName ?? 'N/A'}</span>
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{f.category}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Interactive Detail Modal */}
      <SessionStatDetailModal
        session={session}
        initialCategory={modalCategory}
        initialPaymentFilter={modalPaymentFilter}
        open={showStatModal}
        onClose={() => setShowStatModal(false)}
      />
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, icon: Icon, colorClass }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; colorClass: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums leading-none">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Delete session dialog ─────────────────────────────────────────────────────
export function DeleteSessionDialog({ session, open, onClose }: {
  session: RouteSession; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteRouteSession(session.id!);
      toast({ title: 'Sesión eliminada', description: `${session.routeName} eliminada permanentemente` });
      onClose();
    } catch (e: any) {
      toast({ title: 'Error al eliminar', description: e?.message, variant: 'destructive' });
    } finally { setDeleting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="w-4 h-4 text-red-500" />
            Eliminar sesión · {session.routeName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Esta acción es <strong>irreversible</strong>. Se eliminará permanentemente la sesión cerrada y su reporte asociado.
        </p>
        <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          Ruta: <strong>{session.routeName}</strong> · Chofer: <strong>{session.driverName ?? '—'}</strong>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button variant="destructive" onClick={doDelete} disabled={deleting} className="flex-1">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Trash2 className="w-3.5 h-3.5 mr-2" />}
            Eliminar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Session row ───────────────────────────────────────────────────────────────
// IMPORTANT: keep grid-cols in sync with the header in EntregasAdmin.tsx
const ROW_COLS = 'grid-cols-[1fr_auto] sm:grid-cols-[2fr_1.4fr_0.9fr_0.9fr_0.9fr_130px]';

export function SessionRow({ session, sentBy, onAnalyzeDriver }: { session: RouteSession; sentBy: string; onAnalyzeDriver?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showForceClose, setShowForceClose] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [showPkgs, setShowPkgs] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Group packages by unique client (slCode or customerName)
  const uniqueClients = React.useMemo(() => {
    const clients = new Map<string, RouteSessionPackage[]>();
    (session.packages ?? []).forEach(p => {
      const key = (p.slCode || p.customerName || '').toUpperCase().trim();
      if (key) {
        if (!clients.has(key)) clients.set(key, []);
        clients.get(key)!.push(p);
      }
    });
    return clients;
  }, [session.packages]);

  const totalClientsCount = uniqueClients.size;
  
  const deliveredClientsCount = React.useMemo(() => {
    let count = 0;
    uniqueClients.forEach(pkgs => {
      if (pkgs.some(p => p.deliveryStatus === 'delivered')) {
        count++;
      }
    });
    return count;
  }, [uniqueClients]);

  const payMetrics = React.useMemo(() => {
    return computePaymentMetrics(session.packages ?? [], session.events);
  }, [session.packages, session.events]);

  const totalPkgsCount = (session.packages ?? []).length;
  const deliveredPkgsCount = React.useMemo(() => {
    return (session.packages ?? []).filter(p => p.deliveryStatus === 'delivered').length;
  }, [session.packages]);

  const manifests = React.useMemo(() => getSessionManifests(session), [session]);

  const rate = totalClientsCount > 0 ? Math.round((deliveredClientsCount / totalClientsCount) * 100) : 0;
  const isOpen = session.status === 'open';

  // Live report: computed from packages[] for open sessions, or use stored report for closed
  const liveReport = isOpen ? computeLiveReport(session) : null;
  const displayReport = session.report ?? liveReport;

  return (
    <>
      <div className={cn('border-b border-border last:border-0 transition-colors', isOpen && 'bg-emerald-50/30 dark:bg-emerald-900/5')}>
        {/* Main row */}
        <div className={cn('grid items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors', ROW_COLS)}>
          {/* Route + driver */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate">{session.routeName ?? '—'}</span>
              <StatusChip status={session.status} />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
              <Users className="w-3 h-3" />
              <span className="truncate">{session.driverName ?? session.driverId?.slice(0, 8)}</span>
              <span>·</span><span>{fmtDate(session.createdAt)}</span>
              <span>{fmtTime(session.startAt)}</span>
            </div>
            {manifests.length > 0 && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground font-mono truncate">
                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate" title={manifests.join(', ')}>Manifiestos: {manifests.join(', ')}</span>
              </div>
            )}
          </div>
          {/* Progress */}
          <div className="hidden sm:block">
            <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-between gap-1">
              <span className="font-semibold text-foreground">{deliveredClientsCount}/{totalClientsCount} clientes</span>
              <span className="text-[10px] opacity-75 font-mono">({deliveredPkgsCount}/{totalPkgsCount} pkgs)</span>
            </div>
            <DeliveryBar rate={rate} />
          </div>
          {/* Cash & Payment methods */}
          <div className="hidden sm:block text-right text-xs">
            {payMetrics.cashCRC > 0 && <div className="text-emerald-600 font-medium tabular-nums text-[10px]">Efec: {fmtCRC(payMetrics.cashCRC)}</div>}
            {payMetrics.sinpeCRC > 0 && <div className="text-purple-600 font-semibold tabular-nums text-[10px]">SINPE: {fmtCRC(payMetrics.sinpeCRC)}</div>}
            {payMetrics.transferCRC > 0 && <div className="text-indigo-600 font-semibold tabular-nums text-[10px]">Transf: {fmtCRC(payMetrics.transferCRC)}</div>}
            {payMetrics.cashCRC === 0 && payMetrics.sinpeCRC === 0 && payMetrics.transferCRC === 0 && (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          {/* Time */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="w-3 h-3" />
            {isOpen ? elapsed(session.startAt) : (session.report?.durationMinutes ? `${session.report.durationMinutes}m` : '—')}
          </div>
          {/* KM */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Truck className="w-3 h-3" />
            {session.report?.kmDriven ? `${session.report.kmDriven} km` : '—'}
          </div>
          {/* Actions — fixed 130px to match header */}
          <div className="flex items-center justify-end gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver paquetes" onClick={() => setShowPkgs(true)}>
              <Eye className="w-3.5 h-3.5" />
            </Button>
            {onAnalyzeDriver && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-violet-500 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                title="Analizar con IA"
                onClick={onAnalyzeDriver}
              >
                <Brain className="w-3.5 h-3.5" />
              </Button>
            )}
            {isOpen ? (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Notificar chofer" onClick={() => setShowNotif(true)}>
                  <Bell className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Reasignar chofer" onClick={() => setShowReassign(true)}>
                  <UserCog className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Forzar cierre" onClick={() => setShowForceClose(true)}>
                  <ShieldClose className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Eliminar sesión" onClick={() => setShowDelete(true)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(p => !p)}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        {/* Expanded — show session report */}
        {expanded && <ReportPanel session={session} isLive={isOpen} />}
      </div>

      {/* Dialogs — rendered outside the row to avoid z-index overlap */}
      <NotifDialog session={session} sentBy={sentBy} open={showNotif} onClose={() => setShowNotif(false)} />
      <ForceCloseDialog session={session} adminName={sentBy} open={showForceClose} onClose={() => setShowForceClose(false)} />
      <ReassignDialog session={session} open={showReassign} onClose={() => setShowReassign(false)} />
      <PackagesDialog session={session} open={showPkgs} onClose={() => setShowPkgs(false)} />
      <DeleteSessionDialog session={session} open={showDelete} onClose={() => setShowDelete(false)} />
    </>
  );
}
