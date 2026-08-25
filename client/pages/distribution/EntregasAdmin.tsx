import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Input } from '@/components/ui/input';
import {
  RefreshCw, Search, Truck, TrendingUp,
  DollarSign, AlertTriangle,
} from 'lucide-react';
import {
  subscribeToRecentSessions,
  type RouteSession,
} from '@/lib/services/route-session-service';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  SessionRow, fmtCRC, fmtUSD,
} from './EntregasAdminComponents';
import { FleetAIPanel } from '@/components/distribution/FleetAIPanel';
import { isFleetAIEnabled } from '@/lib/services/fleet-ai-service';

// ── KPI aggregation ───────────────────────────────────────────────────────────
// ── KPI aggregation ───────────────────────────────────────────────────────────
function computeKpis(sessions: RouteSession[]) {
  const active = sessions.filter(s => s.status === 'open').length;
  
  let clientsTotal = 0;
  let clientsDelivered = 0;
  let pkgsTotal = 0;
  let pkgsDelivered = 0;
  
  let cashCRC = 0;
  let cashUSD = 0;
  let sinpeCRC = 0;
  let sinpeUSD = 0;
  let transferCRC = 0;
  let transferUSD = 0;
  let faltantes = 0;

  sessions.forEach(s => {
    const pkgs = s.packages ?? [];
    pkgsTotal += pkgs.length;
    pkgsDelivered += pkgs.filter(p => p.deliveryStatus === 'delivered').length;

    const uniqueClients = new Map<string, any[]>();
    pkgs.forEach(p => {
      const key = (p.slCode || p.customerName || '').toUpperCase().trim();
      if (key) {
        if (!uniqueClients.has(key)) uniqueClients.set(key, []);
        uniqueClients.get(key)!.push(p);
      }
    });

    clientsTotal += uniqueClients.size;
    uniqueClients.forEach(clientPkgs => {
      if (clientPkgs.some(p => p.deliveryStatus === 'delivered')) {
        clientsDelivered++;
      }
    });

    const eventPayMap = new Map<string, { cashPaid?: number; cashPaidCurrency?: string; paymentMethod?: string }>();
    if (Array.isArray(s.events)) {
      s.events.forEach((ev: any) => {
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

    (pkgs ?? []).forEach(p => {
      if (p.deliveryStatus !== 'delivered') return;
      const pkgKey = (p.packageId || p.tracking || '').toLowerCase().trim();
      const trkKey = (p.tracking || '').toLowerCase().trim();
      const evPay = eventPayMap.get(pkgKey) || eventPayMap.get(trkKey);

      const rawPm = String(p.paymentMethod || evPay?.paymentMethod || '').toLowerCase().trim();
      const isSinpe = rawPm.includes('sinpe') || rawPm === '06';
      const isTransfer = rawPm.includes('transf') || rawPm.includes('transfer') || rawPm.includes('tarjeta') || rawPm.includes('banco') || rawPm.includes('deposito') || rawPm.includes('depósito') || rawPm === '02' || rawPm === '03';

      const rawCurr = String(p.cashPaidCurrency || evPay?.cashPaidCurrency || p.currency || '').toUpperCase().trim();
      const isUSD = rawCurr === 'USD' || rawCurr === 'US$' || rawCurr === '$' || rawCurr === 'USD$' || !!(p as any).costUSD || !!(p as any).priceUSD;

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

      if (isSinpe) {
        if (isUSD) sinpeUSD += amt;
        else sinpeCRC += amt;
      } else if (isTransfer) {
        if (isUSD) transferUSD += amt;
        else transferCRC += amt;
      } else {
        if (isUSD) cashUSD += amt;
        else cashCRC += amt;
      }
    });

    faltantes += pkgs.filter(p => p.deliveryStatus === 'returned' || p.deliveryStatus === 'attempted').length;
  });

  const rate = clientsTotal > 0 ? Math.round((clientsDelivered / clientsTotal) * 100) : 0;
  return {
    active,
    rate,
    clientsDelivered,
    clientsTotal,
    pkgsDelivered,
    pkgsTotal,
    cashCRC,
    cashUSD,
    sinpeCRC,
    sinpeUSD,
    transferCRC,
    transferUSD,
    faltantes,
  };
}

// ── Filter options ────────────────────────────────────────────────────────────
type Filter = 'all' | 'open' | 'closed';

export default function EntregasAdmin() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const aiAvailable = isFleetAIEnabled() && hasPermission('ai', 'view');

  const [sessions, setSessions]     = useState<RouteSession[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<Filter>('all');
  const [search, setSearch]         = useState('');
  const [headerH, setHeaderH]       = useState(0);
  const [focusSession, setFocusSession] = useState<RouteSession | null>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);

  // Measure header to compute table height dynamically
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(() => {
      setHeaderH(headerRef.current?.getBoundingClientRect().bottom ?? 0);
    });
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  // Real-time listener
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToRecentSessions((data) => {
      setSessions(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const kpis = computeKpis(sessions);

  const filtered = sessions.filter(s => {
    if (filter === 'open' && s.status !== 'open') return false;
    if (filter === 'closed' && s.status !== 'closed') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !s.routeName?.toLowerCase().includes(q) &&
        !s.driverName?.toLowerCase().includes(q) &&
        !s.vehiclePlate?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const sentBy = user?.fullName || user?.email || 'Admin';

  const TABS: { key: Filter; label: string }[] = [
    { key: 'all',    label: 'Todas' },
    { key: 'open',   label: 'Activas' },
    { key: 'closed', label: 'Cerradas' },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
        {/* ── Fixed header: title, search, filter tabs ── */}
        <div ref={headerRef} className="px-6 pt-5 pb-0 shrink-0">
          {/* Row 1: Title + Search + AI */}
          <div className="flex items-center gap-4 flex-wrap pb-3 border-b border-border">
            {/* Title */}
            <div className="mr-2">
              <h1 className="text-xl font-bold text-foreground leading-none">Entregas</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Tiempo real · {sessions.length} sesiones</p>
            </div>

            {/* Search + AI + refresh */}
            <div className="flex items-center gap-2 ml-auto">
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar ruta, chofer..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 w-52 text-sm"
                />
              </div>
              {/* Fleet AI Panel — Only when AI is enabled with a valid token */}
              {aiAvailable && (
                <FleetAIPanel
                  sessions={sessions}
                  focusSession={focusSession}
                  onClearFocus={() => setFocusSession(null)}
                />
              )}
            </div>
          </div>

          {/* Row 2: Filter tabs — pill style active */}
          <div className="flex items-center gap-1 pt-3 pb-3">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setFilter(t.key)}
                className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium transition-all',
                  filter === t.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table (fills remaining screen height) ── */}
        <div className="flex-1 min-h-0 mx-6 mb-6 rounded-md border border-border overflow-hidden flex flex-col">
          {/* Sticky column headers */}
          <div className="grid grid-cols-[2fr_1.4fr_0.9fr_0.9fr_0.9fr_130px] gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-10 hidden sm:grid">
            <span>Ruta / Chofer</span>
            <span>Progreso</span>
            <span className="text-right">Efectivo</span>
            <span>Tiempo</span>
            <span>KM</span>
            <span className="text-right sr-only">Acciones</span>
          </div>

          {/* Scrollable rows */}
          <div className="flex-1 overflow-y-auto">
            {loading && sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cargando sesiones...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <Truck className="w-8 h-8 opacity-30" />
                <p className="text-sm">No hay sesiones {filter !== 'all' ? `${filter}s` : ''}</p>
              </div>
            ) : (
              filtered.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  sentBy={sentBy}
                  onAnalyzeDriver={aiAvailable ? () => setFocusSession(s) : undefined}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
