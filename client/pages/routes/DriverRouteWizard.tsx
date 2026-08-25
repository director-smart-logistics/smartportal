import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Package, X, CheckCircle2, Lightbulb, AlertTriangle, Sparkles,
  Map as MapIcon, Navigation, Truck, Clock, ShieldCheck, Ban, RotateCcw,
  CheckCheck, AlertCircle, ChevronDown, ChevronUp, Search, Users, List, Mic,
  PenLine, SendHorizonal, Copy, Check, MapPin, Timer, TrendingDown,
  Zap, Bell, MessageSquare, Fuel, ParkingCircle, Camera, MoreVertical,
  DollarSign, Gauge, Banknote, FileText, CreditCard, Coins,
} from 'lucide-react';
import { collection, query as fsQuery, where as fsWhere, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useRoutes, useRoutePackages } from '@/lib/hooks/queries/useRoutes';
import {
  createRouteSession,
  recordDeliveryEvent,
  recordBulkDeliveryEvent,
  RouteSessionPackage,
  closeRouteSession,
  subscribeToAdminNotifications,
  markNotificationRead,
  AdminNotification,
  recordFuelRefill,
  recordParkingPayment,
  recordTollPayment,
} from '@/lib/services/route-session-service';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { getRouteColor } from '@/lib/utils/route-colors';
import type { RouteSession } from '@/lib/services/route-session-service';
import { useRouteOptimizer } from '@/lib/hooks/useRouteOptimizer';
import type { OptimizeStop } from '@/lib/hooks/useRouteOptimizer';
import { saveDeliveryCoordinates, ensureCustomerDeliveryAddress } from '@/lib/services/customer-sync';
import { useDriverMetrics } from '@/lib/hooks/useDriverMetrics';
import { syncPackagesToSmartWeb, syncPackagesToSmartWebWithTimeout, type SP1PackageForSync } from '@/lib/services/sync-smartweb-service';
import { markInvoicesAsPaidForTrackings, annulInvoicesByTrackingsAndManifest, safeFormatDate } from '@/lib/services/invoice-service';
import { pushStatusToSp2 } from '@/lib/services/sync-invoices-service';
import { getRecentManifests } from '@/lib/services/manifest-processor/queries';
import { analyzeDashboardImage, isDashboardAIEnabled } from '@/lib/services/route-ai-analyzer';

const ENABLE_GOOGLE_MAPS = false;

// ─── Route Abbreviation Helper ────────────────────────────────────────────────
export function getRouteAbbreviation(routeName: string): string {
  if (!routeName) return '';
  const r = routeName.trim();
  const lower = r.toLowerCase();

  if (lower === 'todas' || lower === 'all') return 'Todas';

  if (lower.includes('coronado') || lower.includes('sj-c') || lower === 'sjc' || lower.includes('sjoco')) return 'SJC';
  if (lower.includes('escazu') || lower.includes('escazú') || lower.includes('sj-e') || lower === 'sje' || lower.includes('sjoe')) return 'SJE';
  if (lower.includes('centro') || lower === 'sj' || lower === 'sjoc') return 'SJC';
  if (lower.includes('alajuela') || lower === 'ala') return 'ALA';
  if (lower.includes('heredia') || lower === 'hed' || lower === 'h') return 'HED';
  if (lower.includes('cartago 1') || lower.includes('cartago1') || lower === 'c1' || lower === 'c-1') return 'CAR1';
  if (lower.includes('cartago 2') || lower.includes('cartago2') || lower === 'c2' || lower === 'c-2') return 'CAR2';
  if (lower.includes('cartago')) return 'CAR';
  if (lower.includes('occidente') || lower === 'occ') return 'OCC';
  if (lower.includes('encomienda') || lower === 'enc') return 'ENC';
  if (lower.includes('retira') || lower === 'ret') return 'RET';
  if (lower.includes('guanacaste') || lower === 'gua') return 'GUA';
  if (lower.includes('puntarenas') || lower === 'pun') return 'PUN';
  if (lower.includes('limon') || lower.includes('limón') || lower === 'lim') return 'LIM';

  if (/^[A-Z0-9-]{2,5}$/.test(r)) return r;

  return r.substring(0, 3).toUpperCase();
}

// ─── Admin Notification Modal ─────────────────────────────────────────────────

function AdminNotificationModal({
  notifications,
  sessionId,
  onClose,
}: {
  notifications: AdminNotification[];
  sessionId: string;
  onClose: () => void;
}) {
  const unread = notifications.filter(n => !n.readAt);
  const latest = unread[0] ?? notifications[0];

  const handleRead = async () => {
    // Mark all unread as read
    await Promise.all(
      unread.map(n => n.id ? markNotificationRead(sessionId, n.id) : Promise.resolve()),
    );
    onClose();
  };

  if (!latest) return null;

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-white font-extrabold text-base sm:text-lg leading-tight">Mensaje del Administrador</p>
            <p className="text-white/80 text-sm font-semibold">{fmt(latest.sentAt)}</p>
          </div>
          {unread.length > 1 && (
            <Badge className="ml-auto bg-white/25 text-white border-0 text-xs sm:text-sm font-bold px-2.5 py-0.5">
              +{unread.length - 1} más
            </Badge>
          )}
        </div>

        {/* Body */}
        <div className="bg-zinc-950 px-6 py-6 border-t border-white/10">
          <div className="flex items-start gap-3.5 mb-5 bg-white/5 p-4 rounded-xl border border-white/5">
            <MessageSquare className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
            <p className="text-white text-base sm:text-lg font-bold leading-relaxed whitespace-pre-wrap flex-1">{latest.message}</p>
          </div>

          {/* Show other unread messages */}
          {unread.length > 1 && (
            <div className="space-y-3 mb-5 border-t border-white/10 pt-4">
              <p className="text-xs sm:text-sm font-bold text-amber-400/90 uppercase tracking-wider">Otros mensajes pendientes:</p>
              {unread.slice(1).map(n => (
                <div key={n.id} className="flex items-start gap-2.5 bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                  <p className="text-gray-200 text-sm font-semibold leading-relaxed flex-1">{n.message}</p>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full h-13 bg-amber-500 hover:bg-amber-400 text-white font-extrabold rounded-xl text-sm sm:text-base shadow-lg"
            onClick={handleRead}
          >
            <CheckCheck className="w-5 h-5 mr-2 shrink-0" />
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}


// ─── Wizard: Start session ────────────────────────────────────────────────────

export function StartRouteWizard({ user }: { user: any }) {
  const { toast } = useToast();
  const { data: routeResponse, isLoading: loadingRoutes } = useRoutes();
  // Filter client-side: server normalises active:boolean → status:string AFTER the query,
  // so a Firestore where("status","==","active") misses docs with only `active:true`.
  const routes = ((routeResponse as any)?.data ?? []).filter(
    (r: any) => r.status === 'active' || r.active === true
  );

  const displayRoutes = useMemo(() => {
    return routes.filter((r: any) => {
      const nameLower = (r.name || '').toLowerCase().trim();
      return nameLower !== 'retira' && nameLower !== 'encomiendas';
    });
  }, [routes]);

  const encomiendasRoute = useMemo(() => {
    return routes.find((r: any) => {
      const nameLower = (r.name || '').toLowerCase().trim();
      return nameLower === 'encomiendas';
    });
  }, [routes]);

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [startKm, setStartKm] = useState('');
  const [startFuelPercent, setStartFuelPercent] = useState<number>(75);
  const [isStarting, setIsStarting] = useState(false);

  // Manifest selection states
  const [recentManifests, setRecentManifests] = useState<any[]>([]);
  const [selectedManifests, setSelectedManifests] = useState<string[]>([]);
  const [loadingManifests, setLoadingManifests] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<'all' | 'regular' | 'permisos' | 'megamans' | 'maritimos'>('all');

  // OCR/photo states
  const [dashboardPhoto, setDashboardPhoto] = useState<string | null>(null);
  const [isOcrAnalyzing, setIsOcrAnalyzing] = useState(false);
  const dashboardPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadManifests = async () => {
      setLoadingManifests(true);
      try {
        const list = await getRecentManifests(100);
        setRecentManifests(list);
        setSelectedManifests(list.slice(0, 1).map(m => m.id)); // select only the 1 most recent by default
      } catch (err) {
        console.error("Error loading recent manifests:", err);
      } finally {
        setLoadingManifests(false);
      }
    };
    loadManifests();
  }, []);

  const selectedRouteObjs = useMemo(() =>
    routes.filter((r: any) => selectedRoutes.includes(r.id)),
    [routes, selectedRoutes]
  );
  
  const combinedRouteQueryName = useMemo(() => {
    if (selectedRouteObjs.length === 0) return null;
    return selectedRouteObjs.map((r: any) => r.name).join(' + ');
  }, [selectedRouteObjs]);

  const { data: rawPackages, isLoading: loadingPackages } = useRoutePackages(combinedRouteQueryName);

  // Fetch packages for the selected manifests (for manifests added by the driver that might not be on the route query)
  const [manifestPackages, setManifestPackages] = useState<any[]>([]);
  const [loadingManifestPackages, setLoadingManifestPackages] = useState(false);

  useEffect(() => {
    if (selectedManifests.length === 0) {
      setManifestPackages([]);
      return;
    }
    const loadPkgs = async () => {
      setLoadingManifestPackages(true);
      try {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const ref = collection(db, 'packages');
        
        // Split selectedManifests into chunks of 30 due to Firestore 'in' query limitations
        const chunks = [];
        for (let i = 0; i < selectedManifests.length; i += 30) {
          chunks.push(selectedManifests.slice(i, i + 30));
        }
        
        let allDocs: any[] = [];
        for (const chunk of chunks) {
          const q = query(ref, where('manifestNumber', 'in', chunk));
          const snap = await getDocs(q);
          allDocs = allDocs.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
        
        // Remove duplicates by ID
        const unique = Array.from(new Map(allDocs.map(item => [item.id, item])).values());
        setManifestPackages(unique);
      } catch (err) {
        console.error("Error loading manifest packages:", err);
      } finally {
        setLoadingManifestPackages(false);
      }
    };
    loadPkgs();
  }, [selectedManifests]);

  const filteredManifests = useMemo(() => {
    return recentManifests.filter(m => {
      const idUpper = m.id.toUpperCase();
      const matchesSearch = idUpper.includes(searchQuery.toUpperCase());
      if (!matchesSearch) return false;
      
      const isMega = !!m.isMegaMan || idUpper.includes('MEGA-MAN') || idUpper.includes('MEGAMAN');
      const isPermit = /DANP/i.test(m.id) || /PERMISOS/i.test(m.id) || /PERMIT/i.test(m.id) || m.manifestType === 'permiso';
      const isMaritime = m.manifestType === 'usa_maritime' || idUpper.includes('MARITIMO') || idUpper.includes('MARITIMOS') || idUpper.includes('MARITIME');
      const isReg = !isMega && !isPermit && !isMaritime;
      
      if (activeType === 'permisos') return isPermit;
      if (activeType === 'megamans') return isMega;
      if (activeType === 'maritimos') return isMaritime;
      if (activeType === 'regular') return isReg;
      return true;
    });
  }, [recentManifests, searchQuery, activeType]);

  const packages = useMemo(() => {
    const combined = [...(rawPackages || [])];
    const seenIds = new Set(combined.map(p => p.id));
    manifestPackages.forEach(p => {
      if (!seenIds.has(p.id)) {
        combined.push(p);
      }
    });

    return combined.filter((p: any) => {
      const status = (p.status || '').toLowerCase().trim();
      const isTerminal = status === 'delivered' || status === 'returned';
      const isActiveStatus = [
        'en_ruta', 'on_route', 'route', 'en_route', 'en ruta', 'enviado',
        'customs', 'received', 'warehouse', 'consolidated'
      ].includes(status);
      const inv = (p.invoiceStatus || '').toLowerCase().trim();
      const isInvoiceSent = inv === 'sent' || inv === 'enviado';
      
      const isSelectedManifest = selectedManifests.includes(p.manifestNumber || p.manifiesto || '');
      if (!isSelectedManifest) return false;

      // Filter by the selected routes in the session
      if (selectedRoutes.length > 0) {
        const pkgRoute = (p.ruta || p.routeId || p.assignedRouteId || '').toLowerCase().trim();
        const matchesAnyRoute = selectedRouteObjs.some((r: any) => {
          const rName = (r.name || '').toLowerCase().trim();
          return pkgRoute.includes(rName) || rName.includes(pkgRoute);
        });
        if (!matchesAnyRoute) return false;
      }

      return !isTerminal && (isActiveStatus || isInvoiceSent);
    });
  }, [rawPackages, manifestPackages, selectedManifests, selectedRoutes, selectedRouteObjs]);

  const allPlates = useMemo(() => {
    const plates = new Set<string>();
    routes.forEach((r: any) => {
      if (r.vehicles && Array.isArray(r.vehicles)) {
        r.vehicles.forEach((v: any) => v.plate && plates.add(v.plate));
      } else if (r.vehiclePlate) {
        plates.add(r.vehiclePlate);
      }
    });
    return Array.from(plates);
  }, [routes]);

  const handleStartSession = async () => {
    if (!vehiclePlate || !startKm) {
      toast({ title: 'Completa los datos del vehículo', variant: 'destructive' });
      return;
    }
    setIsStarting(true);
    try {
      const sessionPackages: RouteSessionPackage[] = (packages || []).map(p => ({
        packageId: p.id,
        tracking: p.trackingNumber,
        customerName: p.customerName || 'Cliente sin nombre',
        slCode: p.slCode,
        weight: p.weight,
        ruta: p.ruta || p.routeId || p.assignedRouteId || (selectedRouteObjs[0]?.name || ''),
        // Try all known cost field names in priority order
        cashAmount: p.calculatedCost || p.cost || p.totalAmount || p.amount || p.monto || p.value || 0,
        currency: p.currency || 'CRC',
        costCRC: p.costCRC || 0,
        isConsolidation: !!(p.isConsolidation || p.consolidaFlag || p.tipo === 'consolidacion' || p.consolida),
        isPermiso: !!(p.isPermiso || p.permisosFlag || p.requiresPermit || p.permisos || p.tipo === 'permiso'),
        invoiceStatus: p.invoiceStatus || '',
        manifestNumber: p.manifestNumber || p.manifestId || '',
        deliveryAddress: p.deliveryAddress || p.customer?.address || '',
      }));
      const totalWeight = sessionPackages.reduce((acc, p) => acc + (p.weight || 0), 0);
      const cashToCollect = sessionPackages.reduce((acc, p) => acc + (p.cashAmount || 0), 0);

      const combinedRouteId = selectedRoutes.join(',');
      const combinedRouteName = selectedRouteObjs.map((r: any) => r.name).join(' + ');

      await createRouteSession({
        routeId: combinedRouteId,
        routeName: combinedRouteName,
        driverId: user.id,
        driverName: user.fullName || user.email,
        vehiclePlate: vehiclePlate.toUpperCase(),
        startKm: Number(startKm),
        startFuelPercent,
        packages: sessionPackages,
        totalPackages: sessionPackages.length,
        totalWeight,
        cashToCollect,
        cashCurrency: 'CRC',
        status: 'open',
        startAt: new Date().toISOString(),
        startPhotoBase64: dashboardPhoto || undefined,
      });
      toast({ title: 'Sesión iniciada' });
    } catch (error: any) {
      toast({ title: 'Error al iniciar sesión', description: error.message, variant: 'destructive' });
    } finally {
      setIsStarting(false);
    }
  };

  if (loadingRoutes) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg sm:text-xl font-extrabold text-foreground">
            {step === 1 ? 'Seleccionar ruta' : 'Datos del vehículo'}
          </h1>
          {/* Step dots */}
          <div className="flex gap-1.5">
            <div className={cn('h-2 w-8 rounded-full transition-colors', step === 1 ? 'bg-primary' : 'bg-primary/20')} />
            <div className={cn('h-2 w-8 rounded-full transition-colors', step === 2 ? 'bg-primary' : 'bg-primary/20')} />
          </div>
        </div>
        <p className="text-sm font-semibold text-muted-foreground">
          {step === 1 ? 'Elige la o las rutas asignadas' : `Ruta(s) seleccionada(s): ${selectedRouteObjs.map((r: any) => r.name).join(' + ')}`}
        </p>
      </div>

      {/* Step 1 — Route list */}
      {step === 1 && (
        <>
          {routes.length === 0 ? (
            <p className="py-12 text-center text-base font-medium text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
              No hay rutas activas disponibles.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Grid of regular routes */}
              <div className="grid grid-cols-3 gap-2">
                {displayRoutes.map((r: any) => {
                  const color = getRouteColor(r.name);
                  const isSelected = selectedRoutes.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedRoutes(prev =>
                          prev.includes(r.id)
                            ? prev.filter(id => id !== r.id)
                            : [...prev, r.id]
                        );
                      }}
                      className={cn(
                        'group relative flex items-center gap-3 px-4 py-3.5 w-full text-left rounded-xl border-2 transition-all duration-200 cursor-pointer select-none active:scale-[0.98] outline-none min-h-[68px]',
                        isSelected
                          ? 'shadow-md shadow-primary/10'
                          : 'bg-background hover:border-muted-foreground/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:-translate-y-0.5'
                      )}
                      style={{
                        borderColor: color.swatch,
                        backgroundColor: isSelected ? color.swatch : undefined
                      }}
                    >
                      {/* Route Details */}
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          'block text-sm sm:text-base font-extrabold whitespace-normal break-words leading-snug transition-colors duration-150',
                          isSelected ? 'text-white font-black' : 'text-muted-foreground group-hover:text-foreground'
                        )}>
                          {r.name}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* Encomiendas as part of the grid */}
                {encomiendasRoute && (() => {
                  const r = encomiendasRoute;
                  const color = getRouteColor(r.name);
                  const isSelected = selectedRoutes.includes(r.id);
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoutes(prev =>
                          prev.includes(r.id)
                            ? prev.filter(id => id !== r.id)
                            : [...prev, r.id]
                        );
                      }}
                      className={cn(
                        'group relative flex items-center gap-3 px-4 py-3.5 w-full text-left rounded-xl border-2 transition-all duration-200 cursor-pointer select-none active:scale-[0.98] outline-none min-h-[68px]',
                        isSelected
                          ? 'shadow-md shadow-primary/10'
                          : 'bg-background hover:border-muted-foreground/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:-translate-y-0.5'
                      )}
                      style={{
                        borderColor: color.swatch,
                        backgroundColor: isSelected ? color.swatch : undefined
                      }}
                    >
                      {/* Route Details */}
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          'block text-sm sm:text-base font-extrabold transition-colors duration-150',
                          isSelected ? 'text-white font-black' : 'text-muted-foreground group-hover:text-foreground'
                        )}>
                          {r.name}
                        </span>
                      </div>
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

        {/* Manifest Typeahead Selector */}
        <div className="mt-6 space-y-4 bg-muted/15 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider block">
              Manifiestos a cargar
            </Label>
            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {selectedManifests.length} seleccionados
            </span>
          </div>

          {/* Quick Filters */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {(['all', 'regular', 'permisos', 'megamans', 'maritimos'] as const).map(type => {
              const label = type === 'all' ? 'Todos' 
                          : type === 'regular' ? 'Regulares' 
                          : type === 'permisos' ? 'Permisos' 
                          : type === 'megamans' ? 'MegaMans' 
                          : 'Marítimos';
              const isActive = activeType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveType(type)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-bold transition-all border whitespace-nowrap',
                    isActive 
                      ? 'bg-primary text-white border-primary shadow-sm' 
                      : 'bg-background border-border text-muted-foreground hover:border-muted-foreground/30'
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar manifiesto por nombre/ID..."
              className="pl-9 h-12 text-base bg-background border-border/80 focus-visible:ring-primary rounded-xl"
            />
            {searchQuery && (
              <button 
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Search Results List */}
          {loadingManifests ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando manifiestos...
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-border/60 rounded-xl divide-y divide-border bg-background shadow-inner">
              {filteredManifests.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground italic text-center">No se encontraron manifiestos.</p>
              ) : (
                filteredManifests.map(m => {
                  const isSelected = selectedManifests.includes(m.id);
                  const idUpper = m.id.toUpperCase();
                  const isMega = !!m.isMegaMan || idUpper.includes('MEGA-MAN') || idUpper.includes('MEGAMAN');
                  const isPermit = /DANP/i.test(m.id) || /PERMISOS/i.test(m.id) || /PERMIT/i.test(m.id) || m.manifestType === 'permiso';
                  const isMaritime = m.manifestType === 'usa_maritime' || idUpper.includes('MARITIMO') || idUpper.includes('MARITIMOS') || idUpper.includes('MARITIME');
                  
                  const typeLabel = isMega ? 'MegaMan' 
                                  : isPermit ? 'Permiso' 
                                  : isMaritime ? 'Marítimo' 
                                  : 'Regular';
                                  
                  const typeColor = isMega ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' 
                                  : isPermit ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' 
                                  : isMaritime ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedManifests(prev => {
                          if (prev.includes(m.id)) {
                            return prev.filter(id => id !== m.id);
                          } else {
                            return [...prev, m.id];
                          }
                        });
                      }}
                      className={cn(
                        'flex items-center gap-3 w-full text-left px-3.5 py-2.5 transition-colors text-xs',
                        isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                      )}
                    >
                      {/* Checkbox indicator */}
                      <div className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                        isSelected ? 'bg-primary border-primary text-white' : 'border-border bg-background'
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-foreground truncate">{m.id}</span>
                          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0', typeColor)}>
                            {typeLabel}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {m.totalPackages} pkgs · {safeFormatDate(m.processedAt)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Selected Manifest Tags */}
          {selectedManifests.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Manifiestos Seleccionados ({selectedManifests.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedManifests.map(id => (
                  <div 
                    key={id} 
                    className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-bold"
                  >
                    <span>{id}</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedManifests(prev => prev.filter(x => x !== id))}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/20 text-primary transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {/* Step 2 — Vehicle inputs */}
      {step === 2 && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
          {/* Package count feedback */}
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <Package className="w-4.5 h-4.5 text-primary" />
            {loadingPackages
              ? 'Cargando paquetes...'
              : `${packages?.length ?? 0} paquetes asignados a esta ruta`}
          </div>

          {/* Dashboard Photo Capture / OCR */}
          <div className="space-y-2.5">
            <Label className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider block">Tomar foto del tablero</Label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={dashboardPhotoRef}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setIsOcrAnalyzing(true);
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const base64 = ev.target?.result as string;
                  setDashboardPhoto(base64);
                  try {
                    const result = await analyzeDashboardImage(base64);
                    if (result.kmReading || result.fuelLevelPercent != null) {
                      if (result.kmReading) {
                        setStartKm(String(result.kmReading));
                      }
                      if (result.fuelLevelPercent != null) {
                        setStartFuelPercent(result.fuelLevelPercent);
                      }
                      toast({
                        title: 'Tablero procesado',
                        description: 'Kilometraje y nivel de combustible autocompletados correctamente.'
                      });
                    } else {
                      toast({
                        title: 'Foto guardada',
                        description: 'Foto del tablero guardada correctamente.'
                      });
                    }
                  } catch (err: any) {
                    console.warn("OCR analysis skipped:", err);
                    toast({
                      title: 'Foto guardada',
                      description: 'Foto del tablero guardada correctamente.'
                    });
                  } finally {
                    setIsOcrAnalyzing(false);
                  }
                };
                reader.readAsDataURL(file);
              }}
              className="hidden"
            />
            {dashboardPhoto ? (
              <div className="relative rounded-xl overflow-hidden border border-border bg-muted/20">
                <img src={dashboardPhoto} alt="Tablero" className="w-full h-40 object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setDashboardPhoto(null);
                    setStartKm('');
                    setStartFuelPercent(75);
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
                {isOcrAnalyzing && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-2">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-semibold">Procesando foto del tablero...</span>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => dashboardPhotoRef.current?.click()}
                disabled={isOcrAnalyzing}
                className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/15 flex flex-col items-center justify-center gap-1.5 transition-colors"
              >
                <Camera className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground">
                  {isDashboardAIEnabled() ? 'Tomar foto para auto-completar' : 'Tomar foto del tablero'}
                </span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider">Placa</Label>
              <Input
                list="plates-list"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="BCL-123"
                className="h-12 text-base font-mono uppercase font-bold"
              />
              <datalist id="plates-list">
                {allPlates.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider">Kilometraje inicial</Label>
              <Input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={startKm}
                onChange={(e) => setStartKm(e.target.value)}
                placeholder="150000"
                className="h-12 text-base font-mono font-bold"
              />
            </div>

            {/* Fuel level slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" />
                  Nivel de combustible
                </Label>
                <span className={cn(
                  'text-base font-extrabold tabular-nums px-2.5 py-0.5 rounded-full bg-muted',
                  startFuelPercent <= 20 ? 'text-destructive bg-destructive/10' :
                  startFuelPercent <= 40 ? 'text-amber-500 bg-amber-500/10' : 'text-emerald-600 bg-emerald-500/10'
                )}>{startFuelPercent}%</span>
              </div>
              {/* Visual fuel bar */}
              <div className="relative h-10 w-full">
                <div className="absolute inset-y-0 left-0 right-0 rounded-xl bg-muted border border-border overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-xl transition-all duration-200',
                      startFuelPercent <= 20 ? 'bg-destructive/70' :
                      startFuelPercent <= 40 ? 'bg-amber-400/70' : 'bg-emerald-500/70'
                    )}
                    style={{ width: `${startFuelPercent}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={startFuelPercent}
                  onChange={e => setStartFuelPercent(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-xs font-bold text-muted-foreground px-1">
                <span>Vacío</span>
                <span>¼</span>
                <span>½</span>
                <span>¾</span>
                <span>Lleno</span>
              </div>
              {startFuelPercent <= 20 && (
                <p className="text-xs text-destructive font-bold flex items-center gap-1.5 mt-2 bg-destructive/5 p-2 rounded-lg">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0" /> Tanque bajo — considera recargar antes de salir
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-8">
        {step === 2 && (
          <Button variant="ghost" onClick={() => setStep(1)} disabled={isStarting} className="h-12 text-sm sm:text-base font-bold text-muted-foreground px-4 border border-border">
            Atrás
          </Button>
        )}
        <Button
          className={cn('font-bold h-12 text-sm sm:text-base flex-1', step === 2 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : '')}
          onClick={step === 1 ? () => setStep(2) : handleStartSession}
          disabled={(step === 1 && selectedRoutes.length === 0) || (step === 2 && (isStarting || !vehiclePlate || !startKm))}
        >
          {isStarting
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Iniciando...</>
            : step === 1 ? 'Continuar' : 'Comenzar ruta'
          }
        </Button>
      </div>
    </div>
  );
}

// ─── Smart pace alert ────────────────────────────────────────────────────────

function usePaceAlert(session: RouteSession) {
  const delivered = session.deliveredCount || 0;
  const total = session.totalPackages;
  const elapsedMs = Date.now() - new Date(session.startAt!).getTime();
  const elapsedHours = elapsedMs / 1000 / 3600;
  const currentHour = new Date().getHours();

  if (total === 0 || elapsedHours < 0.5) return null;

  const rate = delivered / elapsedHours; // pkg/hr
  const remaining = total - delivered;
  const hoursLeft = remaining > 0 && rate > 0 ? remaining / rate : null;

  // Slow pace: less than 5/hr and more than 30 min elapsed
  if (rate < 5 && remaining > 0) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      type: 'warn' as const,
      message: `Son las ${timeStr} y llevas ${delivered} de ${total} entregas. Tu ritmo actual puede no alcanzar a completar la ruta a tiempo.`,
      tip: 'Planificar es más efectivo que apresurarse. Agrupa por zona y optimiza el orden de paradas.',
    };
  }

  // Behind on afternoon deliveries
  if (currentHour >= 14 && remaining > total * 0.5) {
    return {
      type: 'warn' as const,
      message: `Ya es tarde y quedan ${remaining} entregas pendientes. Revisa si puedes reagrupar las paradas restantes.`,
      tip: 'Agrupa las entregas cercanas entre sí para minimizar desplazamientos y ganar tiempo.',
    };
  }

  return null;
}

// ─── Tips modal ──────────────────────────────────────────────────────────────

const TIPS = [
  {
    icon: MapIcon,
    category: 'Planificación',
    text: 'Antes de salir, ordena las paradas de mayor a menor distancia desde el punto de inicio. Una buena ruta vale más que ir rápido.',
  },
  {
    icon: Navigation,
    category: 'Optimización',
    text: 'Agrupa entregas en el mismo barrio o edificio. Hacer 5 entregas seguidas en una zona es más eficiente que cruzar la ciudad entre cada una.',
  },
  {
    icon: AlertTriangle,
    category: 'Tráfico',
    text: 'Evita rutas por vías congestionadas en horas pico (7-9am, 12-1pm, 5-7pm). Usa Waze o Google Maps para rutas alternas antes de salir.',
  },
  {
    icon: Clock,
    category: 'Tiempo',
    text: 'Mide cuánto tiempo tardás por zona. Si una zona te toma más de lo esperado, revisa si puedes cambiar el orden de las próximas paradas.',
  },
  {
    icon: ShieldCheck,
    category: 'Pagos — MUY IMPORTANTE',
    text: 'Nunca entregues sin verificar primero si el paquete está pagado. Consulta el sistema antes de entregar. Una entrega sin cobro es una pérdida directa.',
  },
  {
    icon: Package,
    category: 'Inspección',
    text: 'Revisa el tracking del paquete antes de entregarlo. Asegúrate de que sea el correcto para ese cliente. Un error aquí genera devolución y doble viaje.',
  },
  {
    icon: CheckCheck,
    category: 'Confirmación',
    text: 'Siempre registra la entrega en el sistema en el momento. No acumules entregas para registrarlas al final: los datos deben ser en tiempo real.',
  },
  {
    icon: AlertCircle,
    category: 'Devoluciones',
    text: 'Si no puedes entregar, registra el motivo inmediatamente. El supervisor y el cliente dependen de esa información para tomar decisiones.',
  },
  {
    icon: Truck,
    category: 'Vehículo',
    text: 'No estaciones en lugares prohibidos. Una multa o remolque detiene toda la ruta. Busca siempre un lugar seguro, aunque camine un poco más.',
  },
  {
    icon: Ban,
    category: 'Seguridad',
    text: 'Nunca dejes paquetes sin vigilancia en el vehículo. Si debes alejarte, asegúralo. La responsabilidad de los paquetes es tuya durante la ruta.',
  },
];

function TipsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md mx-4 bg-background rounded-2xl border border-border shadow-2xl animate-in slide-in-from-bottom-4 duration-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="text-base font-extrabold">Tips para una ruta exitosa</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-muted/80 w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="divide-y divide-border">
            {TIPS.map(({ icon: Icon, category, text }, i) => (
              <li key={i} className="flex items-start gap-3.5 px-5 py-4 bg-background hover:bg-muted/10 transition-colors">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-1">{category}</p>
                  <p className="text-sm text-foreground/90 font-semibold leading-relaxed">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-5 py-4 border-t border-border bg-muted/10">
          <Button className="w-full h-13 text-sm sm:text-base font-extrabold rounded-xl" onClick={onClose}>Entendido</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Return reason modal ─────────────────────────────────────────────────────

const RETURN_REASONS = [
  'Cliente ausente',
  'Dirección incorrecta o no encontrada',
  'Cliente rechazó el paquete',
  'Paquete dañado — no se entregó',
  'Zona de acceso restringido',
  'No hay quien reciba',
  'Cliente solicitó reagendar',
  'Otro motivo',
];

function ReturnReasonModal({
  pkg,
  packages,
  onConfirm,
  onCancel,
}: {
  pkg: RouteSessionPackage;
  packages?: RouteSessionPackage[];
  onConfirm: (
    packagesToReturn: RouteSessionPackage[],
    reason: string,
    returnType: 'returned' | 'consolidacion' | 'retira_oficina'
  ) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [returnType, setReturnType] = useState<'returned' | 'consolidacion' | 'retira_oficina'>('returned');
  
  const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(() => {
    if (packages) {
      return new Set(packages.map(p => p.packageId));
    }
    return new Set([pkg.packageId]);
  });

  const reason = returnType === 'returned'
    ? (selected === 'Otro motivo' ? custom : selected)
    : custom;

  // Only 'returned' (Devuelto) requires selecting a reason.
  const isReasonRequired = returnType === 'returned';
  const isButtonDisabled = (isReasonRequired && !reason) || (packages && selectedPkgs.size === 0);

  const getEffectiveReason = () => {
    if (reason && reason.trim()) return reason.trim();
    if (returnType === 'retira_oficina') return 'Retira en Oficina';
    if (returnType === 'consolidacion') return 'Consolidación de Paquete';
    return '';
  };

  const getConfirmButtonLabel = () => {
    if (returnType === 'retira_oficina') return 'Registrar Retira en Oficina';
    if (returnType === 'consolidacion') return 'Registrar Consolidación';
    return 'Registrar Devolución';
  };

  const getConfirmButtonClasses = () => {
    if (returnType === 'retira_oficina') {
      return 'flex-1 h-13 text-sm sm:text-base font-extrabold rounded-xl shadow-md bg-teal-600 hover:bg-teal-700 text-white transition-all';
    }
    if (returnType === 'consolidacion') {
      return 'flex-1 h-13 text-sm sm:text-base font-extrabold rounded-xl shadow-md bg-blue-600 hover:bg-blue-700 text-white transition-all';
    }
    return 'flex-1 h-13 text-sm sm:text-base font-extrabold rounded-xl shadow-md bg-red-600 hover:bg-red-700 text-white transition-all';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-150">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0 bg-muted/10">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Registrar Devolución / No Entrega
          </p>
          <p className="text-lg sm:text-xl font-black text-foreground truncate uppercase">
            {pkg.customerName || 'Sin nombre'}
          </p>
          {packages && packages.length > 1 && (
            <p className="text-xs text-muted-foreground font-semibold mt-1">
              {packages.length} paquetes en total
            </p>
          )}
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground hover:bg-muted/80 w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* If bulk: packages selection */}
        {packages && packages.length > 1 && (
          <div className="space-y-2.5">
            <p className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
              Paquetes a procesar:
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {packages.map(p => {
                const isChecked = selectedPkgs.has(p.packageId);
                return (
                  <label key={p.packageId} className="flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3.5 hover:bg-muted/40 transition-colors min-h-[48px] bg-background border border-border/50">
                    <input
                      type="checkbox"
                      className="rounded border-border w-5 h-5 accent-primary shrink-0 cursor-pointer"
                      checked={isChecked}
                      onChange={e => {
                        const next = new Set(selectedPkgs);
                        if (e.target.checked) next.add(p.packageId);
                        else next.delete(p.packageId);
                        setSelectedPkgs(next);
                      }}
                    />
                    <span className="font-mono text-sm font-bold flex-1 truncate">{p.tracking}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Return type destination selection */}
        <div className="space-y-2.5">
          <p className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
            Destino / Estado de no entrega:
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              className={cn(
                'h-12 rounded-xl text-xs sm:text-sm font-extrabold border transition-all active:scale-95 flex items-center justify-center',
                returnType === 'returned'
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 ring-2 ring-red-500/20'
                  : 'border-border text-muted-foreground hover:bg-muted/40 bg-background'
              )}
              onClick={() => setReturnType('returned')}
            >
              Devuelto
            </button>
            <button
              type="button"
              className={cn(
                'h-12 rounded-xl text-xs sm:text-sm font-extrabold border transition-all active:scale-95 flex items-center justify-center',
                returnType === 'retira_oficina'
                  ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500/20'
                  : 'border-border text-muted-foreground hover:bg-muted/40 bg-background'
              )}
              onClick={() => setReturnType('retira_oficina')}
            >
              Retira Oficina
            </button>
            <button
              type="button"
              className={cn(
                'h-12 rounded-xl text-xs sm:text-sm font-extrabold border transition-all active:scale-95 flex items-center justify-center',
                returnType === 'consolidacion'
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                  : 'border-border text-muted-foreground hover:bg-muted/40 bg-background'
              )}
              onClick={() => setReturnType('consolidacion')}
            >
              Consolida
            </button>
          </div>
        </div>

        {/* Reasons or Optional Note selection */}
        {returnType === 'returned' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
                Selecciona el motivo (Obligatorio):
              </p>
            </div>
            <div className="border border-border/50 rounded-xl overflow-hidden divide-y divide-border bg-background shadow-sm">
              {RETURN_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={cn(
                    'w-full text-left px-5 py-4 text-sm sm:text-base font-bold transition-colors min-h-[50px] flex items-center justify-between',
                    selected === r 
                      ? 'bg-primary/5 text-primary font-black' 
                      : 'hover:bg-muted/30 text-foreground'
                  )}
                  onClick={() => setSelected(r === selected ? '' : r)}
                >
                  <span>{r}</span>
                  {selected === r && <Check className="w-5 h-5 text-primary shrink-0" />}
                </button>
              ))}
            </div>
            
            {selected === 'Otro motivo' && (
              <div className="pt-2">
                <Input
                  autoFocus
                  placeholder="Escribe el motivo detallado..."
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="text-base font-semibold h-12 rounded-xl border-border bg-background shadow-sm"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
                {returnType === 'consolidacion' ? 'Nota de consolidación:' : 'Nota de retiro en oficina:'}
              </p>
              <span className="text-xs font-semibold text-muted-foreground">
                (Opcional)
              </span>
            </div>
            <Input
              placeholder={returnType === 'consolidacion' ? 'Ej: Agrupación en bodega (opcional)...' : 'Ej: Sucursal Alajuela (opcional)...'}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="text-base font-semibold h-12 rounded-xl border-border bg-background shadow-sm"
            />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-6 py-5 border-t border-border bg-muted/10 flex gap-3 shrink-0">
        <Button 
          variant="ghost" 
          className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl" 
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className={getConfirmButtonClasses()}
          disabled={isButtonDisabled}
          onClick={() => {
            const selectedList = packages 
              ? packages.filter(p => selectedPkgs.has(p.packageId))
              : [pkg];
            onConfirm(selectedList, getEffectiveReason(), returnType);
          }}
        >
          <RotateCcw className="w-5 h-5 mr-2 shrink-0" />
          {getConfirmButtonLabel()}
        </Button>
      </div>
    </div>
  );
}

// ─── Signature modal ─────────────────────────────────────────────────────────

function SignatureModal({
  pkg,
  packages,
  onConfirm,
  onCancel,
}: {
  pkg: RouteSessionPackage;
  packages?: RouteSessionPackage[];  // bulk delivery: all pkgs in group
  onConfirm: (
    sig: string,
    cashPaid?: number,
    cashPaidCurrency?: string,
    paymentMethod?: string,
    geoData?: { address: string; lat: number; lng: number } | null
  ) => void;
  onCancel: () => void;
}) {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  // Collapse invoice list when many packages
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  // Cash payment state
  const [cashInput, setCashInput] = useState('');
  const [cashCurrency, setCashCurrency] = useState<'CRC' | 'USD'>(() => {
    const p = packages?.[0] ?? pkg;
    return ((p as any).currency === 'USD') ? 'USD' : 'CRC';
  });
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'transferencia' | 'sinpe'>(() => {
    const pref = ((packages?.[0] ?? pkg).paymentMethod || '').toLowerCase();
    if (pref.includes('transfer') || pref.includes('banc')) return 'transferencia';
    if (pref.includes('efectivo') || pref.includes('cash')) return 'efectivo';
    return 'sinpe';
  });

  const [geoStatus, setGeoStatus] = useState<'idle' | 'requesting' | 'resolving' | 'done' | 'denied' | 'error'>('idle');
  const [geoData, setGeoData] = useState<{ address: string; lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setGeoStatus('resolving');
        
        let resolvedAddress = '';
        const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || '';
        if (apiKey) {
          try {
            const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es`);
            const json = await res.json();
            if (json.status === 'OK' && json.results?.[0]?.formatted_address) {
              resolvedAddress = json.results[0].formatted_address;
            } else {
              console.warn('[ReverseGeocode] Google Maps Geocoding failed:', json.status, json.error_message);
            }
          } catch (err) {
            console.warn('[ReverseGeocode] Google Maps Geocoding error:', err);
          }
        }
        
        if (!resolvedAddress) {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`, {
              headers: { 'Accept-Language': 'es' }
            });
            const json = await res.json();
            resolvedAddress = json.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          } catch {
            resolvedAddress = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          }
        }
        
        setGeoData({ address: resolvedAddress, lat, lng });
        setGeoStatus('done');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);





  // Size canvas to the wrapper on mount and resize
  const syncCanvasSize = useCallback(() => {
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const { width, height } = wrap.getBoundingClientRect();
    // Save existing drawing, resize, restore
    const img = canvas.toDataURL();
    canvas.width = Math.floor(width);
    canvas.height = Math.floor(height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'transparent';
    if (!empty) {
      const i = new Image();
      i.onload = () => ctx.drawImage(i, 0, 0);
      i.src = img;
    }
  }, [empty]);

  useEffect(() => {
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Mouse helpers (React synthetic events are fine for mouse)
  const getPosFromMouse = (e: React.MouseEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const startMouse = useCallback((e: React.MouseEvent) => {
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPosFromMouse(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    drawing.current = true;
  }, []);
  const moveMouse = useCallback((e: React.MouseEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPosFromMouse(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    setEmpty(false);
  }, []);
  const end = useCallback(() => { drawing.current = false; }, []);

  // Touch handlers: must be registered with { passive: false } so preventDefault works.
  // React 17+ synthetic touch events are passive by default and cannot call preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPosFromTouch = (e: TouchEvent) => {
      const c = canvas;
      const r = c.getBoundingClientRect();
      const t = e.touches[0];
      return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const ctx = canvas.getContext('2d')!;
      const p = getPosFromTouch(e);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      drawing.current = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvas.getContext('2d')!;
      const p = getPosFromTouch(e);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      setEmpty(false);
    };
    const onTouchEnd = () => { drawing.current = false; };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  // ── Financial summary ────────────────────────────────────────────────────────
  // For single package
  const singleAmount = Number(pkg.cashAmount);
  const singleLabel = singleAmount > 0
    ? ((pkg as any).currency === 'USD'
        ? `$${singleAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : `₡${singleAmount.toLocaleString('es-CR')}`)
    : null;
  // Payment method from customer profile
  const paymentMethodLabel = (pkg as any).paymentMethod as string | undefined;


  // For bulk: aggregate across all packages
  const isBulk = packages && packages.length > 1;
  const bulkTotalUSD = isBulk
    ? packages!.filter(p => (p as any).currency === 'USD').reduce((s, p) => s + (p.cashAmount || 0), 0)
    : 0;
  const bulkTotalCRC = isBulk
    ? packages!.filter(p => !(p as any).currency || (p as any).currency === 'CRC').reduce((s, p) => s + (p.cashAmount || 0), 0)
      + packages!.filter(p => (p as any).currency === 'USD').reduce((s, p) => s + ((p as any).costCRC || 0), 0)
    : 0;
  const hasBulkAmount = isBulk && (bulkTotalCRC > 0 || bulkTotalUSD > 0);

  // Auto-fill default amount when paymentMethod changes to 'efectivo'
  useEffect(() => {
    if (paymentMethod === 'efectivo') {
      if (!isBulk && singleAmount > 0) {
        setCashInput(String(singleAmount));
      } else if (isBulk && bulkTotalCRC > 0) {
        setCashInput(String(bulkTotalCRC));
        setCashCurrency('CRC');
      } else if (isBulk && bulkTotalUSD > 0) {
        setCashInput(String(bulkTotalUSD));
        setCashCurrency('USD');
      } else {
        setCashInput('');
      }
    } else {
      setCashInput('');
    }
  }, [paymentMethod, isBulk, singleAmount, bulkTotalCRC, bulkTotalUSD]);


  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex items-start justify-between px-6 py-5 border-b border-border shrink-0 bg-muted/10">
        <div className="min-w-0 flex-1">
          {pkg.customerName && (
            <p className="text-lg sm:text-xl font-black text-foreground truncate uppercase">{pkg.customerName}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {pkg.slCode && (
              <span className="inline-flex items-center font-mono text-xs sm:text-sm font-extrabold px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 shrink-0">
                {pkg.slCode}
              </span>
            )}
            {/* Only show single tracking in single-package mode */}
            {!isBulk && (
              <p className="font-mono text-sm font-bold text-muted-foreground/80 truncate bg-muted px-2 py-0.5 rounded">{pkg.tracking}</p>
            )}
          </div>
        </div>
        <button
          className="ml-3 -mr-1 -mt-1 w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0 border border-border/80 shadow-sm"
          onClick={onCancel}
          title="Cancelar"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* ── Amount banner ── */}
      {/* Single package */}
      {!isBulk && singleLabel && (
        <div className="px-6 py-3.5 bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200 dark:border-emerald-800/60 shrink-0 flex items-center gap-2.5">
          <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <p className="text-sm sm:text-base text-emerald-800 dark:text-emerald-400 font-semibold">
            Monto a cobrar: <span className="font-black text-emerald-600 dark:text-emerald-300 text-lg sm:text-xl tabular-nums bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-800 ml-1">
              {singleLabel}
              {((pkg as any).currency === 'USD') && Number((pkg as any).costCRC) > 0 && (
                <>
                  <span className="mx-1.5 opacity-60">/</span>
                  <span>₡{Number((pkg as any).costCRC).toLocaleString('es-CR')}</span>
                </>
              )}
            </span>
          </p>
        </div>
      )}
      {/* Bulk: invoice breakdown */}
      {isBulk && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200 dark:border-emerald-800/60 shrink-0">
          {/* Header row — always visible, tap to toggle */}
          <button
            className="w-full flex items-center justify-between px-6 py-3.5 text-left hover:bg-emerald-100/30 dark:hover:bg-emerald-900/20 transition-colors"
            onClick={() => setInvoiceOpen(v => !v)}
          >
            <span className="text-xs sm:text-sm font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              {packages!.length} {packages!.length === 1 ? 'paquete' : 'paquetes'}
            </span>
            <div className="flex items-center gap-2">
              {/* Always show both totals */}
              <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                {bulkTotalCRC > 0 && <span>₡{bulkTotalCRC.toLocaleString('es-CR')}</span>}
                {bulkTotalCRC > 0 && bulkTotalUSD > 0 && <span className="mx-1 text-emerald-400">/</span>}
                {bulkTotalUSD > 0 && <span>${bulkTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>}
                {bulkTotalCRC === 0 && bulkTotalUSD === 0 && <span className="text-emerald-400">—</span>}
              </span>
              {invoiceOpen
                ? <ChevronUp className="w-5 h-5 text-emerald-600 shrink-0" />
                : <ChevronDown className="w-5 h-5 text-emerald-600 shrink-0" />}
            </div>
          </button>
          {/* Collapsible package list */}
          {invoiceOpen && (
            <div className="px-6 pb-4 space-y-2 max-h-48 overflow-y-auto pt-1 border-t border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/10">
              {packages!.map((p, i) => {
                const amt    = Number(p.cashAmount);
                const crc    = Number((p as any).costCRC);
                const isUSD  = (p as any).currency === 'USD';
                return (
                  <div key={p.packageId} className="flex items-center justify-between gap-3 py-1 border-b border-dashed border-emerald-100/50 dark:border-emerald-900/20 last:border-b-0">
                    <span className="font-mono text-sm text-emerald-800 dark:text-emerald-400 font-semibold truncate flex-1">
                      {i + 1}. {p.tracking}
                    </span>
                    <span className="text-sm font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0 text-right">
                      {amt > 0 ? (
                        <span className="flex flex-col items-end leading-tight">
                          <span className="font-extrabold">{isUSD ? `$${amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `₡${amt.toLocaleString('es-CR')}`}</span>
                          {isUSD && crc > 0 && <span className="text-[11px] opacity-75 font-semibold">₡{Math.round(crc).toLocaleString('es-CR')}</span>}
                        </span>
                      ) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}


      {/* ── Payment method badge (customer's preferred method) ── */}
      {paymentMethodLabel && (
        <div className="px-6 pt-4 pb-0 shrink-0">
          <div className="inline-flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs sm:text-sm font-bold px-3.5 py-2">
            <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Método preferido: <strong className="font-extrabold text-blue-800 dark:text-blue-200">{paymentMethodLabel}</strong></span>
          </div>
        </div>
      )}

      {/* ── Payment method selector & recorder ── */}
      <div className="px-2 sm:px-3 pt-3 pb-2.5 shrink-0 bg-muted/5 border-b border-border/40">

        {/* Selector segmentado de métodos de pago */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/50 rounded-full border border-border/80 mb-3 select-none">
          {(['efectivo', 'transferencia', 'sinpe'] as const).map((method) => {
            const label = method === 'efectivo' ? 'Efectivo' : method === 'transferencia' ? 'Transferencia' : 'SINPE';
            const isActive = paymentMethod === method;
            
            let Icon = Coins;
            if (method === 'transferencia') Icon = CreditCard;
            if (method === 'sinpe') Icon = SendHorizonal;
            
            return (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={cn(
                  "flex flex-row items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-1 sm:px-2 rounded-full text-xs sm:text-sm font-black transition-all w-full",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm font-black border border-primary/20 scale-[1.01]"
                    : "text-muted-foreground hover:bg-background/40"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground/70")} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {paymentMethod === 'efectivo' && (
          <div className="flex gap-2.5 items-center animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex rounded-xl border border-border overflow-hidden text-xs sm:text-sm font-extrabold shrink-0 bg-background shadow-sm">
              {(['CRC', 'USD'] as const).map(cur => (
                <button
                  key={cur}
                  type="button"
                  className={cn(
                    'h-11 px-4 transition-colors flex items-center justify-center gap-1 min-w-[70px]',
                    cashCurrency === cur
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
                  )}
                  onClick={() => setCashCurrency(cur)}
                >
                  <span>{cur === 'CRC' ? '₡' : '$'}</span>
                  <span>{cur}</span>
                </button>
              ))}
            </div>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Monto cobrado (0.00)"
              value={cashInput}
              onChange={e => setCashInput(e.target.value)}
              className="flex-1 h-12 rounded-xl border border-border bg-background text-base font-mono font-bold px-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
            />
            {cashInput && Number(cashInput) > 0 && (
              <button
                type="button"
                className="shrink-0 w-10 h-10 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 rounded-full transition-colors"
                onClick={() => setCashInput('')}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {paymentMethod === 'efectivo' && cashInput && Number(cashInput) > 0 && (
          <p className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 mt-2 font-extrabold flex items-center gap-1.5 animate-in fade-in duration-200">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            Se registrará cobro de {cashCurrency === 'USD' ? `$${Number(cashInput).toFixed(2)}` : `₡${Math.round(Number(cashInput)).toLocaleString('es-CR')}`} vía{' '}
            <span className="underline decoration-wavy decoration-emerald-500 font-black">
              Efectivo
            </span>
          </p>
        )}
      </div>

      {/* ── Instruction ── */}
      <div className="px-6 pt-4 pb-2 shrink-0">
        <p className="text-sm sm:text-base font-bold text-muted-foreground flex items-center gap-1.5">
          <PenLine className="w-4 h-4 text-muted-foreground shrink-0" />
          Firme en el recuadro de abajo con el dedo:
        </p>
      </div>

      {/* ── Canvas area ── grows to fill remaining space ── */}
      <div
        ref={canvasWrapRef}
        className="flex-1 mx-6 mb-4 rounded-2xl border-2 border-dashed border-border bg-zinc-50 dark:bg-zinc-950 overflow-hidden min-h-0 relative shadow-inner"
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-crosshair"
          onMouseDown={startMouse} onMouseMove={moveMouse} onMouseUp={end} onMouseLeave={end}
          // Touch events are wired imperatively via useEffect above ({ passive: false })
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Dibuje su firma aquí</p>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="px-6 pb-6 pt-0 flex gap-4 shrink-0">
        <Button
          variant="outline"
          className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl border-2 hover:bg-muted/80 shadow-sm"
          onClick={clear}
        >
          Limpiar
        </Button>
        <Button
          className="flex-1 h-13 text-sm sm:text-base font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white border-0 rounded-xl shadow-lg"
          onClick={() => {
            const paid = paymentMethod === 'efectivo' ? Number(cashInput) : 0;
            const sig = empty ? '' : canvasRef.current!.toDataURL('image/png');
            onConfirm(
              sig,
              paid > 0 ? paid : undefined,
              paid > 0 ? cashCurrency : undefined,
              paymentMethod,
              geoData,
            );
          }}
        >
          <CheckCircle2 className="w-5 h-5 mr-2 shrink-0" />
          {empty ? 'Confirmar sin firma' : 'Confirmar entrega'}
        </Button>
      </div>
    </div>
  );
}


// ─── Package list component ───────────────────────────────────────────────────

const STATUS_CFG = {
  pending:        { dot: 'bg-muted-foreground', label: '' },
  en_ruta:        { dot: 'bg-blue-400',         label: 'En ruta' },
  consolidado:    { dot: 'bg-indigo-500',       label: 'Consolidado' },
  consolidated:   { dot: 'bg-indigo-500',       label: 'Consolidado' },
  pickup:         { dot: 'bg-teal-500',         label: 'Retira Oficina' },
  retira_oficina: { dot: 'bg-teal-500',         label: 'Retira Oficina' },
  delivered:      { dot: 'bg-emerald-500',      label: 'Entregado' },
  returned:       { dot: 'bg-red-400',          label: 'Devuelto'  },
  attempted:      { dot: 'bg-amber-400',        label: 'Intento'   },
} as const;

function PkgRow({ pkg, expanded, loading, onExpand, onDeliver, onReturn, hideCustomerInfo = false, hideActions = false }: {
  pkg: RouteSessionPackage; expanded: boolean; loading: boolean;
  onExpand: () => void; onDeliver: () => void; onReturn: () => void;
  hideCustomerInfo?: boolean; hideActions?: boolean;
}) {
  const status = (pkg.deliveryStatus ?? 'pending') as keyof typeof STATUS_CFG;
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  const isDone = status === 'delivered' || status === 'returned' || status === 'consolidado' || status === 'consolidated' || status === 'pickup' || status === 'retira_oficina';
  const timeLabel = pkg.deliveredAt
    ? new Date(pkg.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : pkg.returnedAt ? new Date(pkg.returnedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(pkg.tracking || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn('transition-colors', isDone && 'bg-muted/20')}>
      {/* Row: click area (div, not button) + copy button as sibling to avoid nested-button violation */}
      <div 
        className={cn("w-full flex items-center gap-2.5 px-3 sm:px-4 py-2 text-left select-none min-h-[44px]", !hideActions && "cursor-pointer")} 
        onClick={hideActions ? undefined : onExpand} 
        role={hideActions ? undefined : "button"} 
        tabIndex={hideActions ? undefined : 0} 
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !hideActions && onExpand()}
      >
        <span className={cn('w-3.5 h-3.5 rounded-full shrink-0 border border-white/20', cfg.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const trackingLen = (pkg.tracking || '').length;
              const trackingFontClass = trackingLen > 28 
                ? 'text-xs sm:text-sm leading-tight' 
                : trackingLen > 20 
                  ? 'text-sm sm:text-base leading-snug' 
                  : 'text-base sm:text-lg leading-normal';
              return (
                <p className={cn('font-mono font-bold break-all tracking-tight', trackingFontClass, isDone && 'text-muted-foreground line-through')}>
                  {pkg.tracking}
                </p>
              );
            })()}
            {/* Copy button — standalone sibling, not nested */}
            <button
              onClick={handleCopy}
              className={cn(
                'shrink-0 p-1.5 rounded-md transition-colors bg-muted hover:bg-muted/80',
                copied ? 'text-emerald-500' : 'text-muted-foreground/60 hover:text-muted-foreground'
              )}
              title="Copiar tracking"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            {!!(pkg as any).manifestNumber && (
              <span className="inline-flex items-center shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {(pkg as any).manifestNumber}
              </span>
            )}
          </div>
          {(!hideCustomerInfo || !!(pkg as any).consolidaFlag || !!(pkg as any).isConsolidation || !!(pkg as any).permisosFlag || !!(pkg as any).isPermiso || !!(pkg as any).requiresPermit || !!cfg.label || !!pkg.invoiceStatus) && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {!hideCustomerInfo && (
                <>
                  <p className="text-sm sm:text-base font-bold text-foreground truncate uppercase">{pkg.customerName}</p>
                  {pkg.slCode && (
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800">
                      {pkg.slCode}
                    </span>
                  )}
                </>
              )}
              {!!(pkg.isConsolidation || (pkg as any).consolidaFlag || (pkg as any).consolida || (pkg as any).tipo === 'consolidacion') ? (
                <span className="inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 shrink-0">
                  Consolida
                </span>
              ) : !!(pkg.isPermiso || (pkg as any).permisosFlag || (pkg as any).requiresPermit || (pkg as any).permisos || (pkg as any).tipo === 'permiso') ? (
                <span className="inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shrink-0">
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 mr-1 shrink-0" />
                  Permiso
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                  Regular
                </span>
              )}
              
              {cfg.label && (
                <span className={cn('inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-full border shrink-0',
                  status === 'en_ruta'   && 'text-blue-700 bg-blue-50 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800',
                  status === 'delivered' && 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800',
                  status === 'returned'  && 'text-red-700 bg-red-50 dark:bg-red-950/40 border-red-200/60 dark:border-red-800',
                  status === 'attempted' && 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800',
                  (status === 'consolidado' || status === 'consolidated') && 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-800',
                  (status === 'pickup' || status === 'retira_oficina') && 'text-teal-700 bg-teal-50 dark:bg-teal-950/40 border-teal-200/60 dark:border-teal-800'
                )}>{cfg.label}</span>
              )}

              {pkg.invoiceStatus && (
                <span className={cn('inline-flex items-center text-xs font-extrabold px-2.5 py-0.5 rounded-full border shrink-0',
                  (pkg.invoiceStatus.toLowerCase() === 'sent' || pkg.invoiceStatus.toLowerCase() === 'enviado') && 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-800',
                  (pkg.invoiceStatus.toLowerCase() === 'paid' || pkg.invoiceStatus.toLowerCase() === 'pagada' || pkg.invoiceStatus.toLowerCase() === 'pagado') && 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800',
                  (pkg.invoiceStatus.toLowerCase() === 'draft' || pkg.invoiceStatus.toLowerCase() === 'borrador') && 'text-slate-600 bg-slate-50 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-800',
                  (pkg.invoiceStatus.toLowerCase() === 'cancelled' || pkg.invoiceStatus.toLowerCase() === 'anulada' || pkg.invoiceStatus.toLowerCase() === 'anulado') && 'text-red-700 bg-red-50 dark:bg-red-950/40 border-red-200/60 dark:border-red-800'
                )}>
                  Factura: {
                    pkg.invoiceStatus.toLowerCase() === 'sent' || pkg.invoiceStatus.toLowerCase() === 'enviado' ? 'Enviada' :
                    pkg.invoiceStatus.toLowerCase() === 'paid' || pkg.invoiceStatus.toLowerCase() === 'pagada' || pkg.invoiceStatus.toLowerCase() === 'pagado' ? 'Pagada' :
                    pkg.invoiceStatus.toLowerCase() === 'draft' || pkg.invoiceStatus.toLowerCase() === 'borrador' ? 'Borrador' :
                    pkg.invoiceStatus.toLowerCase() === 'cancelled' || pkg.invoiceStatus.toLowerCase() === 'anulada' || pkg.invoiceStatus.toLowerCase() === 'anulado' ? 'Anulada' :
                    pkg.invoiceStatus
                  }
                </span>
              )}

              {!hideCustomerInfo && pkg.deliveryAddress && (
                <p className="text-xs text-muted-foreground font-normal break-words w-full flex items-start gap-1 mt-0.5 leading-snug">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                  <span className="text-foreground/90">{pkg.deliveryAddress}</span>
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {timeLabel && <span className="text-xs font-bold text-muted-foreground tabular-nums">{timeLabel}</span>}
          {!hideActions && (expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />)}
        </div>
      </div>
      {!isDone && !hideActions && (
        <div className="flex gap-3 px-3 sm:px-4 pb-4">
          <Button variant="outline" className="flex-1 h-13 text-sm sm:text-base font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
            onClick={(e) => { e.stopPropagation(); onDeliver(); }} disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><PenLine className="w-5 h-5 mr-2" />Entregar</>}
          </Button>
          <Button variant="outline" className="flex-1 h-13 text-sm sm:text-base font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onReturn(); }} disabled={loading}>
            <RotateCcw className="w-5 h-5 mr-2" />No entregar
          </Button>
        </div>
      )}
      {expanded && status === 'returned' && pkg.returnReason && (
        <p className="px-5 pb-4 text-xs sm:text-sm text-muted-foreground italic font-medium">{pkg.returnReason}</p>
      )}
    </div>
  );
}

// ── Props injected from ActiveRouteView (single useDriverMetrics instance) ─────
type MetricsFns = Pick<import('@/lib/hooks/useDriverMetrics').MetricsState,
  'trackEvent' | 'startStopTimer' | 'endStopTimer'>;

function PackageList({
  session,
  enrichedPackages,
  liveMap,
  autoOptimize,
  onAutoOptimizeChange,
  onOptimizerReady,
  metrics,
  groupByCustomer,
}: {
  session: RouteSession;
  enrichedPackages: RouteSessionPackage[];
  liveMap: Map<string, any>;
  autoOptimize: boolean;
  onAutoOptimizeChange: (v: boolean) => void;
  onOptimizerReady: (hasStops: boolean) => void;
  metrics: MetricsFns;
  groupByCustomer: boolean;
}) {
  // Destructure metric helpers passed from parent (avoids double idle detector)
  const { trackEvent, startStopTimer, endStopTimer } = metrics;
  // ── Real-time customer profile flags ────────────────────────────────────────
  // Consolida flag lives on the customer doc (consolidationEnabled field),
  // not on the package. Subscribe to all unique customers in the session
  // so the badge reflects the live value without page refresh.
  const uniqueSlCodes = useMemo(() => {
    const codes = new Set<string>();
    session.packages.forEach(p => { if (p.slCode) codes.add(p.slCode.toUpperCase()); });
    return Array.from(codes);
  }, [session.packages]);

  const [customerFlagsMap, setCustomerFlagsMap] = useState<Map<string, {
    consolidationEnabled: boolean;
    coordinates?: { lat: number; lng: number } | null;
    district?: string | null;
    canton?: string | null;
    province?: string | null;
    exactAddress?: string | null;
    fullAddress?: string | null;
  }>>(new Map());

  useEffect(() => {
    if (uniqueSlCodes.length === 0) return;
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueSlCodes.length; i += 30) chunks.push(uniqueSlCodes.slice(i, i + 30));
    const unsubs: (() => void)[] = [];
    const partials = new Map<string, {
      consolidationEnabled: boolean;
      coordinates?: { lat: number; lng: number } | null;
      district?: string | null;
      canton?: string | null;
      province?: string | null;
      exactAddress?: string | null;
      fullAddress?: string | null;
    }>();
    chunks.forEach(chunk => {
      const q = fsQuery(collection(db, 'customers'), fsWhere('slCode', 'in', chunk));
      const unsub = onSnapshot(q, (snap) => {
        snap.docs.forEach((d) => {
          const data = d.data();
          const slCode = (data.slCode || '').toUpperCase();
          if (!slCode) return;
          // Extract GPS coordinates from defaultAddress (or first address with valid coords)
          const addrs: any[] = Array.isArray(data.addresses) ? data.addresses : [];
          const defaultAddr = data.defaultAddress ||
            addrs.find((a: any) => a.isDefault) ||
            addrs.find((a: any) => a.coordinates?.lat && a.coordinates?.lng) ||
            addrs[0] ||
            null;
          const coordinates = defaultAddr?.coordinates?.lat && defaultAddr?.coordinates?.lng
            ? { lat: Number(defaultAddr.coordinates.lat), lng: Number(defaultAddr.coordinates.lng) }
            : null;

          const district = defaultAddr?.district ||
            defaultAddr?.distrito ||
            data.location?.district ||
            data.location?.distrito ||
            data.district ||
            data.distrito ||
            addrs.find((a: any) => a.district || a.distrito)?.district ||
            addrs.find((a: any) => a.district || a.distrito)?.distrito ||
            null;

          const canton = defaultAddr?.canton ||
            data.location?.canton ||
            data.canton ||
            addrs.find((a: any) => a.canton)?.canton ||
            null;

          const province = defaultAddr?.province ||
            defaultAddr?.provincia ||
            data.location?.province ||
            data.location?.provincia ||
            data.province ||
            data.provincia ||
            addrs.find((a: any) => a.province || a.provincia)?.province ||
            null;

          const exactAddress = defaultAddr?.streetAddress ||
            defaultAddr?.address ||
            defaultAddr?.details ||
            data.direccionExacta ||
            data.direccion ||
            data.address ||
            data.location?.addressDetail ||
            data.location?.detail ||
            addrs[0]?.streetAddress ||
            addrs[0]?.address ||
            null;

          const fullAddress = exactAddress
            ? (district && !exactAddress.toLowerCase().includes(district.toLowerCase())
                ? [exactAddress, district, canton].filter(Boolean).join(', ')
                : exactAddress)
            : [district, canton, province].filter(Boolean).join(', ') || null;

          partials.set(slCode, {
            consolidationEnabled: data.consolidationEnabled === true,
            coordinates,
            district,
            canton,
            province,
            exactAddress,
            fullAddress,
          });
        });
        setCustomerFlagsMap(new Map(partials));
      });
      unsubs.push(unsub);
    });
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueSlCodes.join(',')]); // stable dep — only re-subscribe when slCode list changes

  // ── Location popover state ────────────────────────────────────────────────────
  const [locationPopover, setLocationPopover] = useState<string | null>(null); // customerName key


  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const touchStartTimeRef = useRef<number>(0);
  const isToggleModeRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);

  const playHapticClick = (pitch = 140, duration = 0.06) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('[HapticAudio] click failed:', e);
    }
  };

  const isPressedRef = useRef(false);

  const stopListeningForce = () => {
    isPressedRef.current = false;
    isStartingRef.current = false;
    isToggleModeRef.current = false;
    playHapticClick(110, 0.05);
    if (navigator.vibrate) {
      navigator.vibrate([25]);
    }
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.error('[VoiceSearch] stop error:', e);
    }
    setIsListening(false);
  };

  const handleMicRelease = (e: any) => {
    e.preventDefault();
    const duration = Date.now() - touchStartTimeRef.current;
    if (e.type === 'touchcancel' || duration < 400) {
      // Transition to toggle mode so it stays open
      isToggleModeRef.current = true;
    } else {
      stopListeningForce();
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Reconocimiento de voz no soportado', variant: 'destructive' });
      return;
    }

    if (isStartingRef.current) {
      console.warn('[VoiceSearch] Already starting, ignoring');
      return;
    }
    
    // If already listening, stop it (toggle action)
    if (isListening) {
      stopListeningForce();
      return;
    }

    isStartingRef.current = true;
    touchStartTimeRef.current = Date.now();
    isPressedRef.current = true;
    isToggleModeRef.current = false;

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }

      const rec = new SpeechRecognition();
      rec.lang = 'es-CR';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;

      rec.onstart = () => {
        isStartingRef.current = false;
        // If the user already aborted or pressed stop before start completed
        if (!isPressedRef.current && !isToggleModeRef.current) {
          try { rec.abort(); } catch (e) {}
          setIsListening(false);
          return;
        }
        setIsListening(true);
        playHapticClick(150, 0.08);
        if (navigator.vibrate) {
          navigator.vibrate([45]); // Gentle haptic pulse
        }
      };

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        
        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          const cleanedText = currentText.replace(/\.$/, '');
          setSearch(cleanedText);
        }
      };

      rec.onerror = (err: any) => {
        console.error('[VoiceSearch] error:', err);
        isStartingRef.current = false;
        setIsListening(false);
        if (err.error && err.error !== 'no-speech' && err.error !== 'aborted') {
          toast({ title: 'Error de micrófono', description: `Detalle: ${err.error}. Verifica permisos.`, variant: 'destructive' });
        }
      };

      rec.onend = () => {
        isStartingRef.current = false;
        setIsListening(false);
        isToggleModeRef.current = false;
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e: any) {
      console.error('[VoiceSearch] start error:', e);
      isStartingRef.current = false;
      setIsListening(false);
    }
  };

  const stopListening = () => {
    stopListeningForce();
  };

  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [returning, setReturning] = useState<RouteSessionPackage | null>(null);
  const [delivering, setDelivering] = useState<RouteSessionPackage | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // ── Bulk group actions ──────────────────────────────────────────────────────
  const [deliverAllTarget, setDeliverAllTarget] = useState<RouteSessionPackage[] | null>(null);
  const [returnAllTarget, setReturnAllTarget] = useState<RouteSessionPackage[] | null>(null);

  // ── View tabs: pending vs delivered ──────────────────────────────────────────
  const [viewTab, setViewTab] = useState<'pending' | 'delivered'>('pending');

  // Route-filtering tabs for driver (for multi-route sessions)
  const sessionRoutes = useMemo(() => {
    if (!session.routeName) return [];
    return session.routeName.split(/\s*(?:\+|\by\b)\s*/i).map(r => r.trim()).filter(Boolean);
  }, [session.routeName]);
  const [selectedRouteTab, setSelectedRouteTab] = useState<string>('Todas');

  // Manifest-filtering tabs for driver (when session contains packages from multiple manifests)
  const sessionManifests = useMemo(() => {
    const mans = new Set<string>();
    enrichedPackages.forEach(p => {
      const m = p.manifestNumber || (p as any).manifestId;
      if (m) mans.add(m);
    });
    return Array.from(mans).sort();
  }, [enrichedPackages]);
  const [selectedManifestTab, setSelectedManifestTab] = useState<string>('Todos');

  const q = search.toLowerCase().trim();

  // Only show packages still pending delivery — check BOTH the session field AND
  // the live canonical status (via enriched deliveryStatus).
  const pendingOnly = useMemo(() =>
    enrichedPackages.filter(p => {
      const ds = p.deliveryStatus;
      const isPending = !ds || ds === 'pending' || ds === 'en_ruta';
      if (!isPending) return false;
      if (selectedRouteTab !== 'Todas') {
        const pkgRoute = (p.ruta || '').toLowerCase().trim();
        const tabName = selectedRouteTab.toLowerCase().trim();
        if (!pkgRoute.includes(tabName) && !tabName.includes(pkgRoute)) return false;
      }
      if (selectedManifestTab !== 'Todos') {
        const pkgMan = (p.manifestNumber || (p as any).manifestId || '').toLowerCase().trim();
        const tabMan = selectedManifestTab.toLowerCase().trim();
        if (pkgMan !== tabMan) return false;
      }
      return true;
    }),
    [enrichedPackages, selectedRouteTab, selectedManifestTab]
  );
  const filtered = useMemo(() => {
    if (!q) return pendingOnly;
    return pendingOnly.filter(pkg =>
      pkg.tracking?.toLowerCase().includes(q) ||
      pkg.customerName?.toLowerCase().includes(q) ||
      pkg.slCode?.toLowerCase().includes(q) ||
      (pkg as any).email?.toLowerCase().includes(q) ||
      (pkg as any).cedula?.toLowerCase().includes(q)
    );
  }, [pendingOnly, q]);


  // ── Auto-optimize engine ─────────────────────────────────────────────────
  const [optimizedOrder, setOptimizedOrder] = useState<string[] | null>(null);
  const { optimize } = useRouteOptimizer();

  // ── Next-stop hint state (shown after each delivery) ─────────────────────
  interface NextStopHint { name: string; count: number; lat?: number; lng?: number; }
  const [nextStop, setNextStop] = useState<NextStopHint | null>(null);

  const runAutoOptimize = useCallback(
    async (stops: OptimizeStop[]) => {
      if (stops.length < 2) { setOptimizedOrder(null); return; }
      navigator.geolocation?.getCurrentPosition(
        async pos => {
          const res = await optimize(stops, pos.coords.latitude, pos.coords.longitude);
          if (res) setOptimizedOrder(res.orderedIds);
        },
        async () => {
          const res = await optimize(stops, 9.9281, -84.0907);
          if (res) setOptimizedOrder(res.orderedIds);
        },
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
      );
    },
    [optimize]
  );
  const pendingFiltered  = useMemo(() => filtered, [filtered]);
  // "Entregados" = packages explicitly closed within THIS session document.
  // We use session.packages (the canonical session record) instead of enrichedPackages
  // to avoid counting packages that were already delivered in previous sessions
  // or globally marked delivered in Firestore before this route started.
  const deliveredFiltered = useMemo(() => {
    const isPkgClosedInSession = (p: RouteSessionPackage) => {
      const st = (p.deliveryStatus || '').toLowerCase().trim();
      return st === 'delivered' || st === 'returned' || st === 'consolidado' || st === 'consolidated' || st === 'pickup' || st === 'retira_oficina';
    };

    const sessionDone = session.packages.filter(isPkgClosedInSession);
    const filteredByRoute = selectedRouteTab === 'Todas' ? sessionDone : sessionDone.filter(p => {
      const pkgRoute = (p.ruta || '').toLowerCase().trim();
      const tabName = selectedRouteTab.toLowerCase().trim();
      return pkgRoute.includes(tabName) || tabName.includes(pkgRoute);
    });
    const filteredByTab = selectedManifestTab === 'Todos' ? filteredByRoute : filteredByRoute.filter(p => {
      const pkgMan = (p.manifestNumber || (p as any).manifestId || '').toLowerCase().trim();
      const tabMan = selectedManifestTab.toLowerCase().trim();
      return pkgMan === tabMan;
    });
    if (!q) return filteredByTab;
    return filteredByTab.filter(pkg =>
      pkg.tracking?.toLowerCase().includes(q) ||
      pkg.customerName?.toLowerCase().includes(q) ||
      pkg.slCode?.toLowerCase().includes(q)
    );
  }, [session.packages, q, selectedRouteTab, selectedManifestTab]);
  const tabFiltered = viewTab === 'delivered' ? deliveredFiltered : pendingFiltered;

  const pendingClientsCount = useMemo(() => {
    return new Set(pendingFiltered.map(p => p.customerName || 'Sin nombre')).size;
  }, [pendingFiltered]);

  const deliveredClientsCount = useMemo(() => {
    return new Set(deliveredFiltered.map(p => p.customerName || 'Sin nombre')).size;
  }, [deliveredFiltered]);

  const pendingPackagesCount = pendingFiltered.length;
  const deliveredPackagesCount = deliveredFiltered.length;

  const getRoutePillStats = useCallback((route: string) => {
    const isPkgClosedInSession = (p: RouteSessionPackage) => {
      const st = (p.deliveryStatus || '').toLowerCase().trim();
      return st === 'delivered' || st === 'returned' || st === 'consolidado' || st === 'consolidated' || st === 'pickup' || st === 'retira_oficina';
    };
    const baseList = viewTab === 'delivered'
      ? session.packages.filter(isPkgClosedInSession)
      : enrichedPackages.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta');
    
    const filtered = route === 'Todas'
      ? baseList
      : baseList.filter(p => {
          const pkgRoute = (p.ruta || '').toLowerCase().trim();
          const routeLower = route.toLowerCase().trim();
          return pkgRoute.includes(routeLower) || routeLower.includes(pkgRoute);
        });

    const packagesCount = filtered.length;
    const clientsCount = new Set(filtered.map(p => p.customerName || 'Sin nombre')).size;
    
    return { packagesCount, clientsCount };
  }, [viewTab, session.packages, enrichedPackages]);

  const getManifestPillStats = useCallback((man: string) => {
    const isPkgClosedInSession = (p: RouteSessionPackage) => {
      const st = (p.deliveryStatus || '').toLowerCase().trim();
      return st === 'delivered' || st === 'returned' || st === 'consolidado' || st === 'consolidated' || st === 'pickup' || st === 'retira_oficina';
    };
    const baseList = viewTab === 'delivered'
      ? session.packages.filter(isPkgClosedInSession)
      : enrichedPackages.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta');
    
    const filtered = man === 'Todos'
      ? baseList
      : baseList.filter(p => (p.manifestNumber || (p as any).manifestId || '').toLowerCase().trim() === man.toLowerCase().trim());

    const packagesCount = filtered.length;
    const clientsCount = new Set(filtered.map(p => p.customerName || 'Sin nombre')).size;
    
    return { packagesCount, clientsCount };
  }, [viewTab, session.packages, enrichedPackages]);


  const customerBanner = useMemo(() => {
    if (!q || tabFiltered.length === 0) return null;
    const names = new Set(tabFiltered.map(p => p.customerName));
    if (names.size !== 1) return null;
    const pending = tabFiltered.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta');
    const totalCRC = pending.filter(p => !(p as any).currency || (p as any).currency === 'CRC').reduce((s, p) => s + (p.cashAmount || 0), 0);
    const totalUSD = pending.filter(p => (p as any).currency === 'USD').reduce((s, p) => s + (p.cashAmount || 0), 0);
    return { name: tabFiltered[0].customerName, slCode: tabFiltered[0].slCode, totalCRC, totalUSD, count: tabFiltered.length, pending: pending.length };
  }, [tabFiltered, q]);


  // Grouped by customer — derived from active tab (unsorted; sortedGroups applies the optimizer order)
  const groups = useMemo(() => {
    const groupList: Array<{
      slCodes: Set<string>;
      names: Set<string>;
      displayName: string;
      packages: RouteSessionPackage[];
    }> = [];

    tabFiltered.forEach(pkg => {
      const slCode = (pkg.slCode || '').toUpperCase().trim();
      const name = (pkg.customerName || 'Sin nombre').toUpperCase().trim();

      // Find an existing group that matches either slCode or customerName
      let matchedGroup = groupList.find(g => {
        const matchesSlCode = slCode && !slCode.startsWith('SL-NAN-') && g.slCodes.has(slCode);
        const matchesName = name && g.names.has(name);
        return matchesSlCode || matchesName;
      });

      if (!matchedGroup) {
        matchedGroup = {
          slCodes: new Set(),
          names: new Set(),
          displayName: pkg.customerName || 'Sin nombre',
          packages: []
        };
        groupList.push(matchedGroup);
      }

      // Add to sets to allow transitive matching
      if (slCode && !slCode.startsWith('SL-NAN-')) {
        matchedGroup.slCodes.add(slCode);
      }
      if (name) {
        matchedGroup.names.add(name);
      }

      // Update displayName to the longest name
      const currentName = pkg.customerName || '';
      if (currentName.length > matchedGroup.displayName.length) {
        matchedGroup.displayName = currentName;
      }

      matchedGroup.packages.push(pkg);
    });

    return groupList.map(g => [g.displayName, g.packages] as [string, RouteSessionPackage[]]);
  }, [tabFiltered]);

  // Build the stop list for the optimizer from all unique customers in this tab that
  // have GPS coordinates in the customerFlagsMap. Excludes already-delivered packages.
  const optimizerStops = useMemo<OptimizeStop[]>(() => {
    const seen = new Set<string>();
    const stops: OptimizeStop[] = [];
    for (const [customerName, pkgs] of groups) {
      if (seen.has(customerName)) continue;
      seen.add(customerName);
      // Only include if there are still pending packages for this customer
      const hasPending = pkgs.some(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta');
      if (!hasPending) continue;
      const slCodeKey = (pkgs[0]?.slCode || '').toUpperCase();
      const profile = customerFlagsMap.get(slCodeKey);
      if (profile?.coordinates) {
        stops.push({
          id: customerName,
          label: customerName,
          lat: profile.coordinates.lat,
          lng: profile.coordinates.lng,
        });
      }
    }
    return stops;
  }, [groups, customerFlagsMap]);

  const stopsWithoutLocation = useMemo(
    () => groups.filter(([name]) => !optimizerStops.find(s => s.id === name)).length,
    [groups, optimizerStops]
  );

  // Reactive auto-optimization: re-runs whenever the pending stop list changes
  useEffect(() => {
    if (!autoOptimize) return;
    runAutoOptimize(optimizerStops);
    onOptimizerReady(optimizerStops.length >= 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOptimize, optimizerStops]);

  // Notify parent whether the IA toggle should be visible.
  // Only meaningful in the pending tab (can't optimize already-delivered stops).
  useEffect(() => {
    onOptimizerReady(viewTab === 'pending' && optimizerStops.length >= 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab, optimizerStops.length]);

  // Sync incoming autoOptimize prop → if parent turns it off, clear order
  useEffect(() => {
    if (!autoOptimize) setOptimizedOrder(null);
  }, [autoOptimize]);

  // Grouped by customer — derived from active tab, respects optimized order when auto-optimize is ON
  const sortedGroups = useMemo(() => {
    if (!optimizedOrder || optimizedOrder.length === 0) return groups;
    const orderMap = new Map(optimizedOrder.map((id, idx) => [id.toUpperCase().trim(), idx]));
    return [...groups].sort(([a], [b]) => {
      const keyA = a.toUpperCase().trim();
      const keyB = b.toUpperCase().trim();
      const ia = orderMap.has(keyA) ? orderMap.get(keyA)! : 9999;
      const ib = orderMap.has(keyB) ? orderMap.get(keyB)! : 9999;
      return ia - ib;
    });
  }, [groups, optimizedOrder]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      const key = name.toUpperCase().trim();
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleDeliver = async (
    pkg: RouteSessionPackage,
    signatureDataUrl: string,
    cashPaid?: number,
    cashPaidCurrency?: string,
    paymentMethod?: string,
    geoData?: { address: string; lat: number; lng: number } | null,
  ) => {
    const targetPkgId = pkg.packageId || (pkg as any).id || pkg.tracking;
    setLoading(targetPkgId);
    setDelivering(null);
    try {
      // ── Measure stop duration ─────────────────────────────────────────────
      const stopMs = endStopTimer(targetPkgId);
      await recordDeliveryEvent(session.id!, pkg, 'delivery', {
        signatureUrl: signatureDataUrl,
        paymentMethod,
        ...(cashPaid && cashPaid > 0 ? { cashPaid, cashPaidCurrency: cashPaidCurrency ?? 'CRC' } : {}),
      });

      // Mark associated invoices as paid with Hacienda tax codes
      try {
        if (pkg.tracking) {
          const pm = (paymentMethod || '').toLowerCase();
          const medioCode = pm === 'efectivo' ? '01' : pm === 'tarjeta' ? '02' : pm === 'transferencia' ? '03' : '06';
          const paidResult = await markInvoicesAsPaidForTrackings([pkg.tracking], {
            metodoPago: paymentMethod,
            medioPagoCode: medioCode,
            condicionVentaCode: '01', // En entregas de chofer siempre es Contado (01)
          });
          if (paidResult.count > 0) {
            paidResult.updatedInvoices.forEach(inv => {
              pushStatusToSp2(inv.id, inv.invoiceNumber ?? inv.id, 'paid').catch(err =>
                console.warn('[handleDeliver] Failed to push status to SP2 for invoice:', inv.id, err)
              );
            });
          }
        }
      } catch (err) {
        console.error("[handleDeliver] Error updating invoice status:", err);
      }

      ensureCustomerDeliveryAddress({
        slCode: pkg.slCode,
        resolvedAddress: geoData?.address,
        lat: geoData?.lat,
        lng: geoData?.lng,
        packageAddress: pkg.deliveryAddress,
      }).catch(err => console.warn('[AddressSync] Failed to ensure customer address:', err));

      // Sync SP2 immediately
      try {
        await syncPackagesToSmartWeb([{
          id: targetPkgId,
          trackingNumber: pkg.tracking,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          status: 'delivered',
          weight: pkg.weight,
          ruta: pkg.ruta ?? session.routeName,
          currency: pkg.currency ?? cashPaidCurrency,
          forceSync: true,
          allowCreate: true,
        }]);
      } catch (syncErr) {
        console.error("SP2 Sync failed in handleDeliver:", syncErr);
        toast({
          title: 'Sync SP2 fallido',
          description: 'El paquete se guardó en SP1 pero falló la sincronización con el portal del cliente.',
          variant: 'destructive',
        });
      }

      setExpanded(null);
      const methodLabel = paymentMethod === 'efectivo' ? 'efectivo' : paymentMethod === 'transferencia' ? 'transferencia' : 'SINPE';
      const cashNote = cashPaid && cashPaid > 0
        ? ` · ${cashPaidCurrency === 'USD' ? `$${cashPaid.toFixed(2)}` : `₡${Math.round(cashPaid).toLocaleString('es-CR')}`} (${methodLabel})`
        : '';
      toast({ title: 'Entrega registrada', description: `${pkg.tracking} — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${cashNote}` });

      // ── Track delivery confirmed with stop duration ────────────────────────
      trackEvent('delivery_confirmed', {
        packageId: pkg.packageId,
        tracking: pkg.tracking,
        customerName: pkg.customerName,
        stopDurationMs: stopMs ?? undefined,
      });

      // ── Compute next stop in optimized order ─────────────────────────────
      const deliveredCustomer = pkg.customerName || '';
      const nextGroup = sortedGroups.find(([name, pkgs]) => {
        const key = (pkgs[0]?.slCode || '').toUpperCase().trim();
        const deliveredKey = (pkg.slCode || '').toUpperCase().trim();
        if (key && deliveredKey && !key.startsWith('SL-NAN-') && !deliveredKey.startsWith('SL-NAN-')) {
          if (key === deliveredKey) return false;
        } else {
          if (name === deliveredCustomer) return false;
        }
        return pkgs.some(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta');
      });
      if (nextGroup && autoOptimize) {
        const [nextName, nextPkgs] = nextGroup;
        const nextSlCode = (nextPkgs[0]?.slCode || '').toUpperCase();
        const coords = customerFlagsMap.get(nextSlCode)?.coordinates;
        setNextStop({
          name: nextName,
          count: nextPkgs.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta').length,
          lat: coords?.lat,
          lng: coords?.lng,
        });
      } else {
        setNextStop(null);
      }

      // Capture delivery GPS in the background — non-blocking
      // Only do so if the customer does NOT have pre-defined coordinates in their profile
      const hasPredefinedCoords = !!customerFlagsMap.get((pkg.slCode || '').toUpperCase())?.coordinates;
      if (pkg.slCode && !hasPredefinedCoords && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => saveDeliveryCoordinates(pkg.slCode!, pos.coords.latitude, pos.coords.longitude),
          () => {/* GPS denied or unavailable — silently skip */},
          { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
        );
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const handleReturnSubmit = async (
    pkgs: RouteSessionPackage[],
    reason: string,
    rt: 'returned' | 'consolidacion' | 'retira_oficina' = 'returned'
  ) => {
    if (pkgs.length === 0) return;
    setReturning(null);
    setReturnAllTarget(null);

    if (pkgs.length === 1) {
      const pkg = pkgs[0];
      const targetPkgId = pkg.packageId || (pkg as any).id || pkg.tracking;
      setLoading(targetPkgId);
      try {
        const stopMs = endStopTimer(targetPkgId);
        await recordDeliveryEvent(session.id!, pkg, 'return', { reason, returnType: rt });

        // If consolidation, annul associated invoices and add to manifest_consolidation
        if (rt === 'consolidacion') {
          try {
            if (pkg.tracking) {
              const { addItemsToConsolidation } = await import('@/lib/services/manifest-consolidation-service');
              const now = new Date().toISOString();
              await addItemsToConsolidation([{
                tracking: pkg.tracking.toUpperCase(),
                slCode: pkg.slCode || '',
                customerName: pkg.customerName || '',
                ruta: pkg.ruta || session.routeName || '',
                weight: pkg.weight || 0,
                price: (pkg as any).price ?? (pkg as any).precio ?? 0,
                currency: pkg.currency || 'USD',
                description: (pkg as any).description || '',
                permisos: !!((pkg as any).requiresPermit || (pkg as any).isPermiso || (pkg as any).permisos),
                origin: 'Miami, FL',
                manifestNumber: pkg.manifestNumber || '',
                status: 'consolidated',
                movedAt: now,
              }]);

              await annulInvoicesByTrackingsAndManifest([pkg.tracking], pkg.manifestNumber || '', {
                reason: `Consolidación de ruta: ${reason}`,
                annulledBy: 'driver_app',
              });
            }
          } catch (annulErr) {
            console.error("Failed to annul invoices in handleReturnSubmit:", annulErr);
          }
        }

        // Sync SP2 immediately
        try {
          await syncPackagesToSmartWeb([{
            id: targetPkgId,
            trackingNumber: pkg.tracking,
            slCode: pkg.slCode,
            customerName: pkg.customerName,
            status: rt === 'consolidacion' ? 'consolidated' : rt === 'retira_oficina' ? 'pickup' : 'returned',
            weight: pkg.weight,
            ruta: pkg.ruta ?? session.routeName,
            manifestNumber: rt === 'consolidacion' ? 'consolidacion_transitoria' : pkg.manifestNumber,
            currency: pkg.currency,
            forceSync: true,
            allowCreate: true,
          }]);
        } catch (syncErr) {
          console.error("SP2 Sync failed in handleReturnSubmit:", syncErr);
          toast({
            title: 'Sync SP2 fallido',
            description: 'La devolución se guardó en SP1 pero falló la sincronización con el portal del cliente.',
            variant: 'destructive',
          });
        }

        setExpanded(null);
        toast({ title: 'Devolución registrada', description: reason });
        trackEvent('return_confirmed', {
          packageId: targetPkgId,
          tracking: pkg.tracking,
          customerName: pkg.customerName,
          stopDurationMs: stopMs ?? undefined,
        });
      } catch (e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(null);
      }
    } else {
      const groupKey = pkgs[0]?.slCode || pkgs[0]?.customerName || '__bulk__';
      setLoading(groupKey);
      try {
        await recordBulkDeliveryEvent(session.id!, pkgs, 'return', { reason, returnType: rt });

        // If consolidation, annul associated invoices and add to manifest_consolidation in parallel
        if (rt === 'consolidacion') {
          try {
            const trackings = pkgs.map(p => p.tracking).filter(Boolean);
            if (trackings.length > 0) {
              const { addItemsToConsolidation } = await import('@/lib/services/manifest-consolidation-service');
              const now = new Date().toISOString();
              const cItems = pkgs.map(p => ({
                tracking: p.tracking.toUpperCase(),
                slCode: p.slCode || '',
                customerName: p.customerName || '',
                ruta: p.ruta || session.routeName || '',
                weight: p.weight || 0,
                price: (p as any).price ?? (p as any).precio ?? 0,
                currency: p.currency || 'USD',
                description: (p as any).description || '',
                permisos: !!((p as any).requiresPermit || (p as any).isPermiso || (p as any).permisos),
                origin: 'Miami, FL',
                manifestNumber: p.manifestNumber || '',
                status: 'consolidated',
                movedAt: now,
              }));
              const manifestNum = pkgs[0]?.manifestNumber || '';
              await Promise.all([
                addItemsToConsolidation(cItems),
                annulInvoicesByTrackingsAndManifest(trackings, manifestNum, {
                  reason: `Consolidación de ruta: ${reason}`,
                  annulledBy: 'driver_app',
                })
              ]);
            }
          } catch (annulErr) {
            console.error("Failed to annul invoices for consolidation in handleReturnSubmit:", annulErr);
          }
        }

        // Sync SP2 immediately with 4s timeout guard
        try {
          const sp1Pkgs: SP1PackageForSync[] = pkgs.map(p => ({
            id: p.packageId || (p as any).id || p.tracking,
            trackingNumber: p.tracking,
            slCode: p.slCode,
            customerName: p.customerName,
            status: rt === 'consolidacion' ? 'consolidated' : rt === 'retira_oficina' ? 'pickup' : 'returned',
            weight: p.weight,
            ruta: p.ruta ?? session.routeName,
            manifestNumber: rt === 'consolidacion' ? 'consolidacion_transitoria' : p.manifestNumber,
            currency: p.currency,
            forceSync: true,
            allowCreate: true,
          }));
          await syncPackagesToSmartWebWithTimeout(sp1Pkgs, 4000);
        } catch (syncErr) {
          console.error("SP2 Sync failed in handleReturnSubmit:", syncErr);
        }
        setExpanded(null);
        const label = rt === 'consolidacion' ? 'en consolidación' : rt === 'retira_oficina' ? 'a retirar en oficina' : 'devuelto(s)';
        toast({ title: `${pkgs.length} paquete(s) ${label}`, description: reason });
        trackEvent('bulk_return_confirmed', { customerName: pkgs[0]?.customerName });
      } catch (e: any) {
        toast({ title: 'Error al registrar devolución', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(null);
      }
    }
  };

  // Deliver ALL pending packages in a group — single atomic batch
  const handleDeliverAll = async (
    pkgs: RouteSessionPackage[],
    signatureDataUrl: string,
    cashPaid?: number,
    cashPaidCurrency?: string,
    paymentMethod?: string,
    geoData?: { address: string; lat: number; lng: number } | null,
  ) => {
    const groupKey = pkgs[0]?.slCode || pkgs[0]?.customerName || '__bulk__';
    setDeliverAllTarget(null);
    setExpanded(null);
    setLoading(groupKey);
    try {
      await recordBulkDeliveryEvent(session.id!, pkgs, 'delivery', {
        signatureUrl: signatureDataUrl,
        paymentMethod,
        ...(cashPaid && cashPaid > 0 ? { cashPaid, cashPaidCurrency: cashPaidCurrency ?? 'CRC' } : {}),
      });

      // Mark associated invoices as paid with Hacienda tax codes
      try {
        const trackings = pkgs.map(p => p.tracking).filter(Boolean);
        if (trackings.length > 0) {
          const pm = (paymentMethod || '').toLowerCase();
          const medioCode = pm === 'efectivo' ? '01' : pm === 'tarjeta' ? '02' : pm === 'transferencia' ? '03' : '06';
          const paidResult = await markInvoicesAsPaidForTrackings(trackings, {
            metodoPago: paymentMethod,
            medioPagoCode: medioCode,
            condicionVentaCode: '01', // En entregas de chofer siempre es Contado (01)
          });
          if (paidResult.count > 0) {
            paidResult.updatedInvoices.forEach(inv => {
              pushStatusToSp2(inv.id, inv.invoiceNumber ?? inv.id, 'paid').catch(err =>
                console.warn('[handleDeliverAll] Failed to push status to SP2 for invoice:', inv.id, err)
              );
            });
          }
        }
      } catch (err) {
        console.error("[handleDeliverAll] Error updating invoice status:", err);
      }

      if (pkgs.length > 0) {
        const sample = pkgs[0];
        ensureCustomerDeliveryAddress({
          slCode: sample.slCode,
          resolvedAddress: geoData?.address,
          lat: geoData?.lat,
          lng: geoData?.lng,
          packageAddress: sample.deliveryAddress,
        }).catch(err => console.warn('[AddressSync] Failed to ensure customer address:', err));
      }

      // Sync SP2 immediately with 4s timeout guard
      try {
        const sp1Pkgs: SP1PackageForSync[] = pkgs.map(p => ({
          id: p.packageId,
          trackingNumber: p.tracking,
          slCode: p.slCode,
          customerName: p.customerName,
          status: 'delivered',
          weight: p.weight,
          ruta: p.ruta ?? session.routeName,
          currency: p.currency ?? cashPaidCurrency,
          forceSync: true,
          allowCreate: true,
        }));
        await syncPackagesToSmartWeb(sp1Pkgs);
      } catch (syncErr) {
        console.error("SP2 Sync failed in handleDeliverAll:", syncErr);
        toast({
          title: 'Sync SP2 fallido',
          description: 'Las entregas se guardaron en SP1 pero falló la sincronización con el portal del cliente.',
          variant: 'destructive',
        });
      }
      const methodLabel = paymentMethod === 'efectivo' ? 'efectivo' : paymentMethod === 'transferencia' ? 'transferencia' : 'SINPE';
      const cashNote = cashPaid && cashPaid > 0
        ? ` · ${cashPaidCurrency === 'USD' ? `$${cashPaid.toFixed(2)}` : `₡${Math.round(cashPaid).toLocaleString('es-CR')}`} (${methodLabel})`
        : '';
      toast({ title: `${pkgs.length} entrega(s) registradas`, description: `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${cashNote}` });
      // GAP 4 fix: pass real count so deliveriesRef accumulates correctly
      trackEvent('bulk_deliver_confirmed', {
        customerName: pkgs[0]?.customerName,
        ...({ count: pkgs.length } as any),
      });
      // Capture delivery GPS once and save for each unique slCode — background, non-blocking
      // Only do so if the customer does NOT have pre-defined coordinates in their profile
      const slCodes = [...new Set(pkgs.map(p => p.slCode).filter(Boolean))] as string[];
      const codesWithoutCoords = slCodes.filter(code => {
        const hasCoords = !!customerFlagsMap.get(code.toUpperCase())?.coordinates;
        return !hasCoords;
      });
      if (codesWithoutCoords.length && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => codesWithoutCoords.forEach(code =>
            saveDeliveryCoordinates(code, pos.coords.latitude, pos.coords.longitude)
          ),
          () => {/* silently skip */},
          { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
        );
      }
    } catch (e: any) {
      toast({ title: 'Error al registrar entregas', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };


  // ActiveRouteView return statement and render logic continues below...

  if (session.packages.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-muted-foreground">
        <Package className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm">Sin paquetes asignados</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Status tabs: pending vs delivered (Modern Segmented Pill Control) ── */}
      <div className="bg-slate-100 dark:bg-slate-900/70 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-1.5 shrink-0 shadow-inner">
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl transition-all duration-200 font-extrabold text-xs sm:text-sm md:text-base cursor-pointer',
            viewTab === 'pending'
              ? 'bg-primary text-primary-foreground shadow-md ring-1 ring-black/5 font-black'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60'
          )}
          onClick={() => setViewTab('pending')}
        >
          <Truck className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          <span className="whitespace-nowrap">Por entregar</span>
          <span className={cn(
            'ml-1 px-2 py-0.5 rounded-full text-xs font-black shrink-0 tabular-nums transition-colors',
            viewTab === 'pending'
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          )}>
            {pendingClientsCount}
          </span>
        </button>

        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-xl transition-all duration-200 font-extrabold text-xs sm:text-sm md:text-base cursor-pointer',
            viewTab === 'delivered'
              ? 'bg-emerald-600 text-white shadow-md ring-1 ring-black/5 font-black'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60'
          )}
          onClick={() => setViewTab('delivered')}
        >
          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          <span className="whitespace-nowrap">Entregados</span>
          <span className={cn(
            'ml-1 px-2 py-0.5 rounded-full text-xs font-black shrink-0 tabular-nums transition-colors',
            viewTab === 'delivered'
              ? 'bg-white/25 text-white'
              : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          )}>
            {deliveredClientsCount}
          </span>
        </button>
      </div>

      {/* 
        Route tabs for multi-route sessions — Compact Mobile Design (iPhone 13 & mobile screens)
        RATIONALE: Keeps tab width minimal so 3-5 route tabs fit side-by-side on mobile viewports (~390px)
        without requiring excessive horizontal scrolling for the driver.
        Uses short route abbreviations (e.g. SJC, SJE, CAR1, ALA, HED, OCC, RET, ENC).
      */}
      {sessionRoutes.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pt-1 pb-2 shrink-0 scrollbar-none items-center">
          {['Todas', ...sessionRoutes].map(route => {
            const isSelected = selectedRouteTab === route;
            const stats = getRoutePillStats(route);
            const abbr = route === 'Todas' ? 'Todas' : getRouteAbbreviation(route);
            return (
              <button
                key={route}
                onClick={() => setSelectedRouteTab(route)}
                className={cn(
                  'px-3 py-1.5 rounded-xl border text-xs transition-all active:scale-95 shrink-0 flex items-center gap-1.5 shadow-xs',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm font-black'
                    : 'bg-background text-foreground border-border hover:bg-muted/50 font-bold'
                )}
                title={route}
              >
                <span className="uppercase tracking-wide font-extrabold">{abbr}</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0 tabular-nums leading-none',
                  isSelected 
                    ? 'bg-white/20 text-white' 
                    : 'bg-muted text-muted-foreground'
                )}>
                  {stats.clientsCount}c·{stats.packagesCount}p
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Manifest tabs for multi-manifest sessions */}
      {sessionManifests.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pt-0.5 pb-2 shrink-0 scrollbar-none items-center">
          <span className="text-[10px] uppercase font-bold text-muted-foreground mr-0.5 shrink-0">Manifiesto:</span>
          {['Todos', ...sessionManifests].map(man => {
            const isSelected = selectedManifestTab === man;
            const stats = getManifestPillStats(man);
            return (
              <button
                key={man}
                onClick={() => setSelectedManifestTab(man)}
                className={cn(
                  'px-2.5 py-1 rounded-xl border text-xs transition-all active:scale-95 shrink-0 flex items-center gap-1.5 shadow-2xs',
                  isSelected
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 font-extrabold shadow-sm'
                    : 'bg-background text-foreground border-border hover:bg-muted/50 font-bold'
                )}
                title={man}
              >
                <span className="font-mono text-[11px] font-bold">{man}</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0 tabular-nums leading-none',
                  isSelected 
                    ? 'bg-white/20 text-white dark:bg-black/20 dark:text-slate-900' 
                    : 'bg-muted text-muted-foreground'
                )}>
                  {stats.clientsCount}c·{stats.packagesCount}p
                </span>
              </button>
            );
          })}
        </div>
      )}



      {/* ── Customer total banner ── */}
      {customerBanner && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{customerBanner.name}</p>
              {customerBanner.slCode && <p className="text-xs text-muted-foreground font-mono">{customerBanner.slCode}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{customerBanner.pending} pendiente(s)</p>
            </div>
          </div>
          {(customerBanner.totalCRC > 0 || customerBanner.totalUSD > 0) && (
            <div className="flex gap-3 pt-1">
              {customerBanner.totalCRC > 0 && (
                <span className="text-sm font-mono font-semibold text-emerald-600">₡{customerBanner.totalCRC.toLocaleString()}</span>
              )}
              {customerBanner.totalUSD > 0 && (
                <span className="text-sm font-mono font-semibold text-blue-600">${customerBanner.totalUSD.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Next-stop hint banner (appears after delivery when IA is active) ── */}
      {nextStop && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-800 p-3 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500">✦ Siguiente parada</span>
              </div>
              <p className="text-sm font-semibold text-violet-900 dark:text-violet-100 truncate">{nextStop.name}</p>
              <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5">
                {nextStop.count} paquete{nextStop.count !== 1 ? 's' : ''} pendiente{nextStop.count !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {ENABLE_GOOGLE_MAPS && nextStop.lat && nextStop.lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${nextStop.lat},${nextStop.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 transition-colors"
                  onClick={() => trackEvent('nav_next_stop_maps_click', {
                    customerName: nextStop.name,
                    coords: { lat: nextStop.lat!, lng: nextStop.lng! },
                  })}
                >
                  <Navigation className="w-3 h-3" />
                  Ir
                </a>
              )}
              <button
                onClick={() => setNextStop(null)}
                className="text-violet-400 hover:text-violet-600 transition-colors"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-violet-500/80 dark:text-violet-400/70 mt-2 leading-relaxed flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 text-violet-500/80 mt-0.5 shrink-0" />
            <span>La IA optimiza por distancia y tráfico histórico. Verifica siempre en Waze antes de salir — condiciones reales pueden variar.</span>
          </p>
        </div>
      )}

      {/* ── Package list ── */}
      <div className="space-y-3 px-1 sm:px-0 pb-24">
        {tabFiltered.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
            <Package className="w-7 h-7 opacity-20" />
            <p className="text-xs">
              {viewTab === 'delivered'
                ? 'Aún no hay entregas registradas en esta sesión'
                : 'Sin entregas pendientes — ¡excelente trabajo!'}
            </p>
          </div>
        ) : groupByCustomer ? (
          // Grouped by customer (sorted by optimizer when applied)
          sortedGroups.map(([customerName, pkgs]) => {
            const key = customerName.toUpperCase().trim();
            const isOpen = expandedGroups.has(key);
            const pendingPkgs = pkgs.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta');
            const pendingCount = pendingPkgs.length;
            const sample = pkgs[0];
            let customerProfile: any = null;
            for (const p of pkgs) {
              const code = (p.slCode || '').toUpperCase();
              if (code) {
                const profile = customerFlagsMap.get(code);
                if (profile) {
                  customerProfile = profile;
                  if (profile.coordinates) break;
                }
              }
            }
            const isConsolida = customerProfile
              ? customerProfile.consolidationEnabled
              : pkgs.some(p => !!p.isConsolidation || !!(p as any).consolidaFlag || !!(p as any).consolida || (p as any).tipo === 'consolidacion');
            const isPermisos = pkgs.some(p =>
              !!p.isPermiso || !!(p as any).permisosFlag || !!(p as any).requiresPermit || !!(p as any).permisos || (p as any).tipo === 'permiso'
            );
            const groupActionsOpen = !isOpen;

            // Extract District and Address for this customer
            const district = customerProfile?.district ||
              (customerProfile as any)?.distrito ||
              pkgs.find(p => (p as any).district)?.district ||
              null;

            const address = customerProfile?.fullAddress ||
              customerProfile?.exactAddress ||
              pkgs.find(p => p.deliveryAddress)?.deliveryAddress ||
              null;

            return (
              <div 
                key={key} 
                className={cn(
                  "bg-card border border-border/70 rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.03)] dark:shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all duration-200 overflow-hidden",
                  isOpen ? "border-red-400 dark:border-red-700/80 shadow-lg ring-2 ring-red-500/10 dark:ring-red-500/20 bg-red-500/[0.01] dark:bg-red-950/[0.04]" : "hover:border-muted-foreground/30 hover:shadow-md"
                )}
              >
                {/* Customer group header — div avoids nested-button DOM violation */}
                {(() => {
                  const totalUSD = pendingPkgs
                    .filter(p => (p as any).currency === 'USD')
                    .reduce((s, p) => s + (p.cashAmount || 0), 0);
                  const totalCRC =
                    pendingPkgs.filter(p => !(p as any).currency || (p as any).currency === 'CRC').reduce((s, p) => s + (p.cashAmount || 0), 0) +
                    pendingPkgs.filter(p => (p as any).currency === 'USD').reduce((s, p) => s + ((p as any).costCRC || 0), 0);
                  
                  const hasPrice = totalCRC > 0 || totalUSD > 0;
                  const hasCoords = !!customerProfile?.coordinates;
 
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "w-full flex flex-col gap-1.5 p-3 text-left hover:bg-muted/50 transition-colors cursor-pointer",
                        isOpen && "bg-red-500/[0.03] dark:bg-red-500/[0.05] hover:bg-red-500/[0.06] dark:hover:bg-red-500/[0.08]"
                      )}
                      onClick={() => toggleGroup(customerName)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(customerName); } }}
                    >
                      {/* Top Row: Name */}
                      <div className="flex items-start gap-3 min-w-0 w-full">
                        <p className={cn(
                          "text-sm sm:text-base font-extrabold uppercase tracking-tight break-words flex-1 transition-colors duration-200",
                          isOpen ? "text-red-700 dark:text-red-400" : "text-foreground"
                        )}>
                          {customerName}
                        </p>
                      </div>

                      {/* Middle Row: Badges / SL Code */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {sample.slCode && (
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded uppercase shrink-0 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800">
                            {sample.slCode}
                          </span>
                        )}
                        {sample.ruta && (() => {
                          const rc = getRouteColor(sample.ruta);
                          const abbr = getRouteAbbreviation(sample.ruta);
                          return (
                            <span 
                              className={cn(
                                "inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded border uppercase shrink-0",
                                rc.bg,
                                rc.text,
                                rc.border
                              )}
                            >
                              {abbr}
                            </span>
                          );
                        })()}
                        {isConsolida ? (
                          <span className="inline-flex items-center text-[11px] font-black px-2 py-0.5 rounded uppercase shrink-0 bg-[#1d4ed8] text-white shadow-2xs">
                            Consolida
                          </span>
                        ) : isPermisos ? (
                          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded uppercase shrink-0 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800">
                            Permiso
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded uppercase shrink-0 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800">
                            Regular
                          </span>
                        )}
                        <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded uppercase shrink-0 bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800">
                          {pkgs.length} pkg{pkgs.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Customer Address Text Row — Full, untruncated address */}
                      {address && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground font-medium px-0.5 mt-0.5 leading-snug">
                          <MapPin className="w-3.5 h-3.5 text-primary/70 shrink-0 mt-0.5" />
                          <span className="break-words text-foreground/90 font-medium">
                            {address}
                          </span>
                        </div>
                      )}

                      {/* Bottom Row: Price Tag & District Badge on Left | Maps Link & Chevron on Right */}
                      <div className="flex items-center justify-between gap-2 w-full mt-0.5">
                        {/* Left: Price Tag + District Badge */}
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {hasPrice && (
                            <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50 px-2.5 py-1 rounded-md shrink-0">
                              {totalUSD > 0 && `$${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                              {totalCRC > 0 && totalUSD > 0 && <span className="mx-0.5 opacity-50">/</span>}
                              {totalCRC > 0 && `₡${Math.round(totalCRC).toLocaleString('es-CR')}`}
                            </span>
                          )}

                          {/* District Badge right in the highlighted area */}
                          {district && (
                            <span className="inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-md uppercase shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-2xs">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{district}</span>
                            </span>
                          )}
                        </div>

                        {/* Right: Google Maps Link + Chevron */}
                        <div className="flex items-center gap-2 shrink-0">
                          {ENABLE_GOOGLE_MAPS && (hasCoords || address) && (() => {
                            const mapUrl = hasCoords
                              ? `https://www.google.com/maps/dir/?api=1&destination=${customerProfile.coordinates.lat},${customerProfile.coordinates.lng}&travelmode=driving`
                              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
                            return (
                              <a
                                href={mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-emerald-500 text-white bg-emerald-600 hover:bg-emerald-700 dark:border-emerald-600 dark:bg-emerald-700 dark:hover:bg-emerald-600 transition-all active:scale-95 duration-100 shadow-sm text-sm font-extrabold uppercase tracking-wide shrink-0"
                                onClick={e => {
                                  e.stopPropagation();
                                  trackEvent('nav_google_maps_click', { customerName, coords: customerProfile?.coordinates, address });
                                }}
                                title="Abrir en Google Maps"
                              >
                                <MapPin className="w-4 h-4 shrink-0" />
                                <span>Mapa</span>
                              </a>
                            );
                          })()}

                          {/* Chevron expand button */}
                          <div className={cn(
                            "shrink-0 flex items-center justify-center w-9 h-9 rounded-xl border transition-all active:scale-95 duration-100 shadow-sm",
                            isOpen 
                              ? "bg-red-600 border-red-500 text-white hover:bg-red-700" 
                              : "border-border bg-background hover:bg-accent text-muted-foreground"
                          )}>
                            {isOpen ? <ChevronUp className="w-5 h-5 shrink-0" /> : <ChevronDown className="w-5 h-5 shrink-0" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                  {/* Group action panel */}
                  {groupActionsOpen && pendingCount > 0 && (
                    <div className="px-3 pb-3 pt-2 border-t border-border/10 bg-muted/10">
                      <div className="flex gap-2.5">
                        <Button variant="outline"
                          className="flex-1 h-10 text-xs sm:text-sm font-bold border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => { setExpanded(null); setReturnAllTarget(pendingPkgs); }}>
                          <RotateCcw className="w-4 h-4 mr-1.5 shrink-0" />
                          Devolver ({pendingCount})
                        </Button>
                        <Button variant="outline"
                          className="flex-1 h-10 text-xs sm:text-sm font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-850 dark:text-emerald-400"
                          onClick={() => { setExpanded(null); setDeliverAllTarget(pendingPkgs); }}>
                          <CheckCheck className="w-4 h-4 mr-1.5 shrink-0" />
                          Entregar ({pendingCount})
                        </Button>
                      </div>
                    </div>
                  )}

                {/* Package rows under this customer */}
                {isOpen && (
                  <div className="divide-y divide-border/60">
                    {pkgs.map(pkg => (
                      <PkgRow
                        key={pkg.packageId}
                        pkg={pkg}
                        expanded={expanded === pkg.packageId}
                        loading={loading === pkg.packageId}
                        hideCustomerInfo={true}
                        hideActions={true}
                        onExpand={() => {
                          const nowExpanded = expanded !== pkg.packageId;
                          setExpanded(nowExpanded ? pkg.packageId : null);
                          if (nowExpanded) {
                            startStopTimer(pkg.packageId);
                            trackEvent('pkg_panel_open', { packageId: pkg.packageId, tracking: pkg.tracking, customerName: pkg.customerName });
                          } else {
                            trackEvent('pkg_panel_close', { packageId: pkg.packageId, tracking: pkg.tracking });
                          }
                        }}
                        onDeliver={() => {
                          trackEvent('delivery_started', { packageId: pkg.packageId, tracking: pkg.tracking, customerName: pkg.customerName });
                          setDelivering(pkg);
                        }}
                        onReturn={() => {
                          trackEvent('return_started', { packageId: pkg.packageId, tracking: pkg.tracking, customerName: pkg.customerName });
                          setReturning(pkg);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Flat tracking list
          filtered.map(pkg => {
            const slCodeKey = (pkg.slCode || '').toUpperCase();
            const customerProfile = customerFlagsMap.get(slCodeKey);
            const isConsolida = customerProfile
              ? customerProfile.consolidationEnabled
              : !!(pkg.isConsolidation || (pkg as any).consolidaFlag || (pkg as any).consolida || (pkg as any).tipo === 'consolidacion');
            return (
              <PkgRow
                key={pkg.packageId}
                pkg={pkg}
                expanded={expanded === pkg.packageId}
                loading={loading === pkg.packageId}
                hideActions={true}
                onExpand={() => {
                  const nowExpanded = expanded !== pkg.packageId;
                  setExpanded(nowExpanded ? pkg.packageId : null);
                  if (nowExpanded) {
                    startStopTimer(pkg.packageId);
                    trackEvent('pkg_panel_open', { packageId: pkg.packageId, tracking: pkg.tracking, customerName: pkg.customerName });
                  } else {
                    trackEvent('pkg_panel_close', { packageId: pkg.packageId, tracking: pkg.tracking });
                  }
                }}
                onDeliver={() => {
                  trackEvent('delivery_started', { packageId: pkg.packageId, tracking: pkg.tracking, customerName: pkg.customerName });
                  setDelivering(pkg);
                }}
                onReturn={() => {
                  trackEvent('return_started', { packageId: pkg.packageId, tracking: pkg.tracking, customerName: pkg.customerName });
                  setReturning(pkg);
                }}
              />
            );
          })
        )}

        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">Sin resultados para "{search}"</div>
        )}
      </div>

      {/* ── Modals ── */}
      {delivering && (
        <SignatureModal
          pkg={delivering}
          onConfirm={(sig, cashPaid, cashPaidCurrency, paymentMethod, geoData) => handleDeliver(delivering, sig, cashPaid, cashPaidCurrency, paymentMethod, geoData)}
          onCancel={() => setDelivering(null)}
        />
      )}

      {deliverAllTarget && (
        <SignatureModal
          pkg={deliverAllTarget[0]}
          packages={deliverAllTarget}
          onConfirm={(sig, cashPaid, cashPaidCurrency, paymentMethod, geoData) => handleDeliverAll(deliverAllTarget, sig, cashPaid, cashPaidCurrency, paymentMethod, geoData)}
          onCancel={() => setDeliverAllTarget(null)}
        />
      )}

      {returning && (
        <ReturnReasonModal
          pkg={returning}
          onConfirm={(pkgsToReturn, reason, rt) => handleReturnSubmit(pkgsToReturn, reason, rt)}
          onCancel={() => setReturning(null)}
        />
      )}

      {returnAllTarget && (
        <ReturnReasonModal
          pkg={returnAllTarget[0]}
          packages={returnAllTarget}
          onConfirm={(pkgsToReturn, reason, rt) => handleReturnSubmit(pkgsToReturn, reason, rt)}
          onCancel={() => setReturnAllTarget(null)}
        />
      )}

      {/* ── Audio Indicator overlay ── */}
      {isListening && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 animate-bounce z-50">
          <Mic className="w-3.5 h-3.5 animate-pulse" />
          <span>Hablando... suelta o toca para buscar</span>
        </div>
      )}

      {/* ── Floating Bottom Search Bar ── */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-40 bg-background/95 backdrop-blur-md p-2 rounded-2xl border border-border shadow-xl flex gap-2 items-center animate-in slide-in-from-bottom-5 duration-200">
        <div className="relative flex-1">
          <Input
            className={cn(
              "pl-4 h-11 text-base font-semibold rounded-xl border border-primary/20 bg-background placeholder:text-muted-foreground/50 shadow-sm focus-visible:ring-primary/25 focus-visible:border-primary/45 transition-all w-full",
              (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ? "pr-24" : "pr-10",
              isListening && "border-red-500 ring-2 ring-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.25)] dark:shadow-[0_0_12px_rgba(239,68,68,0.4)] animate-pulse bg-red-50/5 dark:bg-red-950/5"
            )}
            placeholder={isListening ? "Habla ahora..." : "Buscar tracking, nombre, SL..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {/* WhatsApp style audio button */}
            {typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); startListening(); }}
                onMouseUp={handleMicRelease}
                onMouseLeave={stopListeningForce}
                onTouchStart={(e) => { e.preventDefault(); startListening(); }}
                onTouchEnd={handleMicRelease}
                onTouchCancel={handleMicRelease}
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 select-none active:scale-95 touch-none border shadow-sm",
                  isListening
                    ? "bg-red-500 border-red-600 text-white animate-pulse shadow-md shadow-red-500/30 scale-110"
                    : "bg-background border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
                title="Presiona para hablar"
              >
                <Mic className="w-4.5 h-4.5" />
              </button>
            )}
            {search && (
              <button
                className="text-muted-foreground hover:bg-muted hover:text-foreground w-9 h-9 rounded-full flex items-center justify-center border border-border bg-background shadow-sm transition-colors"
                onClick={() => setSearch('')}
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Active route view ────────────────────────────────────────────────────────

export function ActiveRouteView({ session }: { session: RouteSession }) {
  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);
  const [showClosePanel, setShowClosePanel] = useState(false);
  const [selectedCloseClients, setSelectedCloseClients] = useState<Set<string>>(new Set());
  const [showTips, setShowTips] = useState(false);
  const [endKm, setEndKm] = useState('');
  const [faltanteState, setFaltanteState] = useState<Record<string, { category: string; note: string }>>({});
  const paceAlert = usePaceAlert(session);
  const [alertOpen, setAlertOpen] = useState(false);
  const [groupByCustomer, setGroupByCustomer] = useState(true);

  // Actions dropdown
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  // Fuel refill modal
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [fuelKm, setFuelKm] = useState('');
  const [fuelAmount, setFuelAmount] = useState('');
  const [fuelCurrency, setFuelCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [fuelNote, setFuelNote] = useState('');
  const [fuelPhoto, setFuelPhoto] = useState<string | null>(null); // base64
  const [isSavingFuel, setIsSavingFuel] = useState(false);
  const fuelPhotoRef = useRef<HTMLInputElement>(null);

  // Parking modal
  const [showParkingModal, setShowParkingModal] = useState(false);
  const [parkingAmount, setParkingAmount] = useState('');
  const [parkingCurrency, setParkingCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [parkingNote, setParkingNote] = useState('');
  const [isSavingParking, setIsSavingParking] = useState(false);

  // Toll modal
  const [showTollModal, setShowTollModal] = useState(false);
  const [tollAmount, setTollAmount] = useState('');
  const [tollCurrency, setTollCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [tollNote, setTollNote] = useState('');
  const [isSavingToll, setIsSavingToll] = useState(false);

  // ── Admin notifications ───────────────────────────────────────────────────
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const prevUnreadCount = useRef(0);

  useEffect(() => {
    if (!session.id) return;
    const unsub = subscribeToAdminNotifications(session.id, (notifs) => {
      setAdminNotifications(notifs);
      const unreadCount = notifs.filter(n => !n.readAt).length;
      if (unreadCount > prevUnreadCount.current) {
        setShowNotifModal(true);
      }
      prevUnreadCount.current = unreadCount;
    });
    return unsub;
  }, [session.id]);

  const { idleAlert, dismissIdleAlert, trackEvent, startStopTimer, endStopTimer } = useDriverMetrics(session);

  // ── Live Firestore enrichment for packages & costs ─────────────────────────
  const { data: livePackages } = useRoutePackages(session.routeName || null);

  const liveMap = useMemo(() => {
    const m = new Map<string, any>();
    (livePackages || []).forEach((p: any) => {
      if (p.trackingNumber) m.set(p.trackingNumber, p);
      if (p.id) m.set(p.id, p);
    });
    return m;
  }, [livePackages]);

  const liveStatusToDelivery = (liveStatus: string | undefined, liveInvoiceStatus?: string): RouteSessionPackage['deliveryStatus'] | undefined => {
    if (!liveStatus) return undefined;
    const s = liveStatus.toLowerCase().trim();
    if (s === 'delivered' || s === 'entregado') return 'delivered';
    if (s === 'returned' || s === 'devuelto') return 'returned';
    if (s === 'consolidacion' || s === 'consolidado' || s === 'consolidated') return 'consolidado';
    if (s === 'pickup' || s === 'retira_oficina' || s === 'retira oficina' || s === 'oficina') return 'pickup';
    
    const isTerminal = s === 'delivered' || s === 'returned' || s === 'consolidacion' || s === 'consolidado' || s === 'consolidated' || s === 'pickup' || s === 'retira_oficina' || s === 'retira oficina' || s === 'oficina';
    const isActiveStatus = s === 'en_ruta' || s === 'en-ruta' || s === 'en route' || s === 'enviado' || s === 'route' || s === 'on_route' || s === 'en ruta';
    const inv = (liveInvoiceStatus || '').toLowerCase().trim();
    const isInvoiceSent = inv === 'sent' || inv === 'enviado';
    if (!isTerminal && (isActiveStatus || isInvoiceSent)) return 'en_ruta';
    
    if (s === 'attempted' || s === 'intento') return 'attempted';
    return undefined;
  };

  const enrichedPackages = useMemo(() => session.packages.map(pkg => {
    const live = liveMap.get(pkg.tracking) || liveMap.get(pkg.packageId);
    if (!live) return pkg;
    const liveCost = live.calculatedCost ?? live.cost ?? live.totalAmount ?? live.amount ?? live.monto ?? live.value ?? 0;
    const liveCRC  = live.costCRC ?? 0;
    const canonicalDelivery = liveStatusToDelivery(live.status, live.invoiceStatus);
    return {
      ...pkg,
      deliveryStatus:  canonicalDelivery ?? pkg.deliveryStatus,
      cashAmount:      pkg.cashAmount      || liveCost,
      costCRC:         (pkg as any).costCRC         || liveCRC,
      currency:        (pkg as any).currency        || live.currency || 'CRC',
      isConsolidation: !!(live.isConsolidation || live.consolidaFlag || live.tipo === 'consolidacion' || live.consolida),
      isPermiso:       !!(live.isPermiso || live.permisosFlag || live.requiresPermit || live.permisos || live.tipo === 'permiso'),
      invoiceStatus:   live.invoiceStatus || pkg.invoiceStatus,
      manifestNumber:  live.manifestNumber || live.manifestId || pkg.manifestNumber,
      deliveryAddress: live.deliveryAddress || live.customer?.address || pkg.deliveryAddress,
    };
  }), [session.packages, liveMap]);

  // Derive faltante (packages still pending at close time)
  const faltantePackages = useMemo(() =>
    enrichedPackages.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta'),
    [enrichedPackages]
  );

  // Auto-optimize state — lifted here so the header toggle can read/write it
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [optimizerVisible, setOptimizerVisible] = useState(false);

  const handleAutoOptimizeToggle = (v: boolean) => {
    setAutoOptimize(v);
  };

  const color = getRouteColor(session.routeName);
  const total = enrichedPackages.length;
  const delivered = enrichedPackages.filter(p => p.deliveryStatus === 'delivered').length;
  const isUndeliveredStatus = (s?: string) => s === 'returned' || s === 'consolidado' || s === 'consolidated' || s === 'pickup' || s === 'retira_oficina' || s === 'attempted';
  const undeliveredCount = enrichedPackages.filter(p => isUndeliveredStatus(p.deliveryStatus)).length;
  const pending = enrichedPackages.filter(p => !p.deliveryStatus || p.deliveryStatus === 'pending' || p.deliveryStatus === 'en_ruta').length;
  const startTime = new Date(session.startAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleCloseSession = async () => {
    if (!endKm) {
      toast({ title: 'Ingresa el kilometraje final', variant: 'destructive' });
      return;
    }
    if (Number(endKm) < session.startKm) {
      toast({ title: 'El km final no puede ser menor al inicial', variant: 'destructive' });
      return;
    }
    // Validate all faltante have a category before closing
    if (faltantePackages.length > 0) {
      const missing = faltantePackages.filter(p => !faltanteState[p.packageId]?.category);
      if (missing.length > 0) {
        toast({
          title: `${missing.length} paquete(s) sin categoría`,
          description: 'Selecciona el motivo de no entrega para cada faltante.',
          variant: 'destructive',
        });
        return;
      }
    }
    setIsClosing(true);
    try {
      // Build UndeliveredJustification[] with category as reason
      const undelivered = faltantePackages.map(p => ({
        packageId: p.packageId,
        tracking: p.tracking,
        customerName: p.customerName,
        reason: faltanteState[p.packageId]?.category || 'Sin categoría',
        note: faltanteState[p.packageId]?.note || undefined,
      }));

      // Process each return category in batch
      const byCategory: Record<string, RouteSessionPackage[]> = {};
      faltantePackages.forEach(p => {
        const cat = faltanteState[p.packageId]?.category || 'returned';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
      });

      for (const [cat, pkgs] of Object.entries(byCategory)) {
        const rt = cat === 'consolidacion' ? 'consolidacion' : cat === 'retira_oficina' ? 'retira_oficina' : 'returned';
        const reason = pkgs.map(p => faltanteState[p.packageId]?.note).filter(Boolean).join(', ') || cat;

        // Record return event (which also updates Firestore packages status!)
        await recordBulkDeliveryEvent(session.id!, pkgs, 'return', { reason, returnType: rt });

        // Extra logic for consolidation (annul invoices)
        if (rt === 'consolidacion') {
          try {
            const trackings = pkgs.map(p => p.tracking).filter(Boolean);
            if (trackings.length > 0) {
              const manifestNum = pkgs[0]?.manifestNumber || '';
              await annulInvoicesByTrackingsAndManifest(trackings, manifestNum, {
                reason: `Consolidación de ruta (Cierre): ${reason}`,
                annulledBy: 'driver_app',
              });
            }
          } catch (annulErr) {
            console.error("Failed to annul invoices for consolidation on close:", annulErr);
          }
        }

        // Sync SP2 immediate
        try {
          const sp1Pkgs: SP1PackageForSync[] = pkgs.map(p => ({
            id: p.packageId,
            trackingNumber: p.tracking,
            slCode: p.slCode,
            customerName: p.customerName,
            status: rt === 'consolidacion' ? 'consolidated' : rt === 'retira_oficina' ? 'pickup' : 'returned',
            weight: p.weight,
            ruta: p.ruta ?? session.routeName,
            manifestNumber: rt === 'consolidacion' ? 'consolidacion_transitoria' : p.manifestNumber,
            currency: p.currency,
            forceSync: true,
            allowCreate: true,
          }));
          await syncPackagesToSmartWeb(sp1Pkgs);
        } catch (syncErr) {
          console.error("SP2 Sync failed in handleCloseSession for cat:", cat, syncErr);
        }
      }

      const deliveredCount = enrichedPackages.filter(p => p.deliveryStatus === 'delivered').length;
      const undeliveredCount = faltantePackages.length +
        enrichedPackages.filter(p => isUndeliveredStatus(p.deliveryStatus)).length;

      trackEvent('session_close' as any, {
        ...({ faltanteCount: faltantePackages.length, deliveredCount } as any),
      });

      await closeRouteSession(session.id!, {
        endKm: Number(endKm),
        undelivered,
        deliveredCount,
        undeliveredCount,
      });
      toast({ title: 'Sesión finalizada', description: undelivered.length > 0 ? `${undelivered.length} faltante(s) registrado(s)` : undefined });
    } catch (error: any) {
      toast({ title: 'Error al cerrar sesión', description: error.message, variant: 'destructive' });
    } finally {
      setIsClosing(false);
    }
  };

  // Close actions dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    if (showActionsMenu) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showActionsMenu]);

  // ── Save fuel refill ──────────────────────────────────────────────────────
  const handleSaveFuelRefill = async () => {
    if (!fuelAmount || !fuelKm) {
      toast({ title: 'Completa el monto y el kilometraje', variant: 'destructive' });
      return;
    }
    setIsSavingFuel(true);
    try {
      await recordFuelRefill(
        session.id!,
        {
          kmAtRefill:  Number(fuelKm),
          amountPaid:  Number(fuelAmount),
          currency:    fuelCurrency,
          note:        fuelNote || undefined,
        },
        fuelPhoto ?? undefined,
      );
      toast({ title: 'Recarga registrada', description: `${fuelCurrency === 'CRC' ? '₡' : '$'}${Number(fuelAmount).toLocaleString()}` });
      setShowFuelModal(false);
      setFuelKm(''); setFuelAmount(''); setFuelNote(''); setFuelPhoto(null);
    } catch (err: any) {
      toast({ title: 'Error al registrar recarga', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingFuel(false);
    }
  };

  // ── Save parking payment ──────────────────────────────────────────────────
  const handleSaveParkingPayment = async () => {
    if (!parkingAmount) {
      toast({ title: 'Ingresa el monto del parqueo', variant: 'destructive' });
      return;
    }
    setIsSavingParking(true);
    try {
      await recordParkingPayment(session.id!, {
        amountPaid: Number(parkingAmount),
        currency:   parkingCurrency,
        note:       parkingNote || undefined,
      });
      toast({ title: 'Parqueo registrado', description: `${parkingCurrency === 'CRC' ? '₡' : '$'}${Number(parkingAmount).toLocaleString()}` });
      setShowParkingModal(false);
      setParkingAmount(''); setParkingNote('');
    } catch (err: any) {
      toast({ title: 'Error al registrar parqueo', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingParking(false);
    }
  };

  // ── Save toll payment ─────────────────────────────────────────────────────
  const handleSaveTollPayment = async () => {
    if (!tollAmount) {
      toast({ title: 'Ingresa el monto del peaje', variant: 'destructive' });
      return;
    }
    setIsSavingToll(true);
    try {
      await recordTollPayment(session.id!, {
        amountPaid: Number(tollAmount),
        currency:   tollCurrency,
        note:       tollNote || undefined,
      });
      toast({ title: 'Peaje registrado', description: `${tollCurrency === 'CRC' ? '₡' : '$'}${Number(tollAmount).toLocaleString()}` });
      setShowTollModal(false);
      setTollAmount(''); setTollNote('');
    } catch (err: any) {
      toast({ title: 'Error al registrar peaje', description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingToll(false);
    }
  };

  // ── Photo capture helper ──────────────────────────────────────────────────
  const handleFuelPhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFuelPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-lg mx-auto px-2 sm:px-4 pt-1 pb-4 animate-in fade-in duration-200 space-y-2">

      {/* ── Admin notification modal (only renders when admin sends a message) ── */}
      {showNotifModal && session.id && (
        <AdminNotificationModal
          notifications={adminNotifications}
          sessionId={session.id}
          onClose={() => setShowNotifModal(false)}
        />
      )}

      {/* ── Route header ── */}
      <div className="flex items-center justify-between gap-3 pt-2 pb-1 bg-transparent">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight leading-tight truncate">
              {session.routeName}
            </h1>
            {session.routeName && (
              <span className="bg-primary/10 text-primary border-2 border-primary/30 text-xs sm:text-sm font-black px-3 py-0.5 rounded-xl uppercase tracking-wider shadow-sm">
                {getRouteAbbreviation(session.routeName)}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground font-bold mt-1 pl-0">
            {pending}/{total} paquetes · {new Set(enrichedPackages.map(p => p.customerName || 'Sin nombre')).size} clientes
          </p>
        </div>

        <div className="flex items-center shrink-0">
          {/* ── Actions dropdown ── */}
          <div className="relative" ref={actionsMenuRef}>
            <Button
              variant="outline"
              className="h-11 px-4 text-xs sm:text-sm font-extrabold flex items-center gap-1.5 rounded-xl border border-border shadow-sm bg-background text-foreground hover:bg-accent"
              onClick={() => setShowActionsMenu(v => !v)}
            >
              Acciones
              <ChevronDown className={cn('w-4 h-4 transition-transform text-muted-foreground shrink-0', showActionsMenu && 'rotate-180')} />
            </Button>

            {showActionsMenu && (
              <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-border bg-popover shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                
                {/* View toggle */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm sm:text-base font-bold hover:bg-muted transition-colors text-left min-h-[48px] text-foreground"
                  onClick={() => {
                    setShowActionsMenu(false);
                    setGroupByCustomer(g => !g);
                  }}
                >
                  {groupByCustomer ? (
                    <>
                      <List className="w-5 h-5 text-indigo-500 shrink-0" />
                      <span>Ver como lista de tracking</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-5 h-5 text-indigo-500 shrink-0" />
                      <span>Ver agrupado por cliente</span>
                    </>
                  )}
                </button>
                <div className="my-1 border-t border-border" />

                {/* Fuel refill */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm sm:text-base font-bold hover:bg-muted transition-colors text-left min-h-[48px] text-foreground"
                  onClick={() => { setShowActionsMenu(false); setShowFuelModal(true); }}
                >
                  <Fuel className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>Recarga de combustible</span>
                </button>

                {/* Parking */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm sm:text-base font-bold hover:bg-muted transition-colors text-left min-h-[48px] text-foreground"
                  onClick={() => { setShowActionsMenu(false); setShowParkingModal(true); }}
                >
                  <ParkingCircle className="w-5 h-5 text-blue-500 shrink-0" />
                  <span>Pago de parqueo</span>
                </button>

                {/* Tolls */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm sm:text-base font-bold hover:bg-muted transition-colors text-left min-h-[48px] text-foreground"
                  onClick={() => { setShowActionsMenu(false); setShowTollModal(true); }}
                >
                  <Coins className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Pago de peajes</span>
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-border" />

                {/* Tips */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm sm:text-base font-bold hover:bg-muted transition-colors text-left min-h-[48px] text-foreground"
                  onClick={() => { setShowActionsMenu(false); setShowTips(true); }}
                >
                  <Lightbulb className="w-5 h-5 text-yellow-500 shrink-0" />
                  <span>Tips de ruta</span>
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-border" />

                {/* Close session — destructive */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm sm:text-base font-bold text-destructive hover:bg-destructive/10 transition-colors text-left min-h-[48px]"
                  onClick={() => { setShowActionsMenu(false); setShowClosePanel(true); }}
                >
                  <X className="w-5 h-5 shrink-0" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>


      <PackageList
        session={session}
        enrichedPackages={enrichedPackages}
        liveMap={liveMap}
        autoOptimize={autoOptimize}
        onAutoOptimizeChange={handleAutoOptimizeToggle}
        onOptimizerReady={setOptimizerVisible}
        metrics={{ trackEvent, startStopTimer, endStopTimer }}
        groupByCustomer={groupByCustomer}
      />

      {/* ── Close session modal ── */}
      {showClosePanel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md mx-4 bg-background rounded-2xl border border-border shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-extrabold">Cerrar sesión de ruta</h2>
              <button onClick={() => { setShowClosePanel(false); setEndKm(''); }} className="text-muted-foreground hover:text-foreground hover:bg-muted/80 w-9 h-9 rounded-full flex items-center justify-center transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-semibold text-muted-foreground mb-4">
              Ingresa el kilometraje final para cerrar <strong>{session.routeName}</strong>.
            </p>
            <div className="space-y-2 mb-5">
              <Label className="text-sm font-bold text-foreground">KILOMETRAJE FINAL</Label>
              <Input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={endKm}
                onChange={(e) => setEndKm(e.target.value)}
                placeholder={`Más de ${session.startKm.toLocaleString()}`}
                className="h-12 text-base font-bold font-mono rounded-xl"
                autoFocus
              />
            </div>


            {/* Faltante: require category per package */}
            {faltantePackages.length > 0 && (() => {
              const clientGroups = (() => {
                const map = new Map<string, { customerName: string; slCode: string; packages: RouteSessionPackage[] }>();
                faltantePackages.forEach(p => {
                  const key = p.slCode || p.customerName || 'Sin cliente';
                  if (!map.has(key)) {
                    map.set(key, {
                      customerName: p.customerName || 'Sin cliente',
                      slCode: p.slCode || '',
                      packages: [],
                    });
                  }
                  map.get(key)!.packages.push(p);
                });
                return Array.from(map.values());
              })();

              const handleApplyBulkReason = (category: string) => {
                if (!category) return;
                setFaltanteState(prev => {
                  const next = { ...prev };
                  clientGroups.forEach(g => {
                    const clientKey = g.slCode || g.customerName;
                    if (selectedCloseClients.has(clientKey)) {
                      g.packages.forEach(p => {
                        next[p.packageId] = {
                          category,
                          note: prev[p.packageId]?.note || '',
                        };
                      });
                    }
                  });
                  return next;
                });
              };

              return (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="text-sm sm:text-base font-extrabold text-amber-800 dark:text-amber-200">
                      {faltantePackages.length} paquete(s) sin entregar
                    </span>
                  </div>
                  
                  {/* Bulk action row */}
                  <div className="flex items-center justify-between gap-3 bg-white dark:bg-black/40 p-2 rounded-lg border border-amber-300/40">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-border w-5 h-5 accent-primary shrink-0 cursor-pointer"
                        checked={clientGroups.length > 0 && selectedCloseClients.size === clientGroups.length}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedCloseClients(new Set(clientGroups.map(g => g.slCode || g.customerName)));
                          } else {
                            setSelectedCloseClients(new Set());
                          }
                        }}
                      />
                      <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300 uppercase">Todos</span>
                    </label>
                    <div className="flex-1 max-w-[200px]">
                      <select
                        onChange={e => {
                          handleApplyBulkReason(e.target.value);
                          e.target.value = ''; // reset value
                        }}
                        className="w-full h-9 rounded-lg border border-border bg-background text-xs font-bold px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="">— ASIGNAR MASIVO —</option>
                        <option value="consolidacion">CONSOLIDACIÓN (BODEGA)</option>
                        <option value="retira_oficina">RETIRA OFICINA</option>
                        <option value="cliente_ausente">CLIENTE AUSENTE</option>
                        <option value="no_pago">NO REALIZÓ EL PAGO</option>
                        <option value="zona_restringida">ZONA RESTRINGIDA</option>
                        <option value="dano_paquete">PAQUETE DAÑADO</option>
                        <option value="direccion_incorrecta">DIRECCIÓN INCORRECTA</option>
                        <option value="otro">OTRO MOTIVO</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                    {clientGroups.map(g => {
                      const clientKey = g.slCode || g.customerName;
                      const isChecked = selectedCloseClients.has(clientKey);
                      const firstPkg = g.packages[0];
                      const fs = faltanteState[firstPkg.packageId] ?? { category: '', note: '' };
                      return (
                        <div key={clientKey} className="space-y-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-black/30 p-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="rounded border-border w-5 h-5 accent-primary shrink-0 cursor-pointer mt-0.5"
                              checked={isChecked}
                              onChange={e => setSelectedCloseClients(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(clientKey) : next.delete(clientKey);
                                return next;
                              })}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm font-extrabold text-foreground leading-tight truncate">{g.customerName}</p>
                              <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate leading-none">
                                {g.slCode && `${g.slCode} · `}{g.packages.map(p => p.tracking).join(', ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={fs.category}
                              onChange={e => {
                                const cat = e.target.value;
                                setFaltanteState(prev => {
                                  const next = { ...prev };
                                  g.packages.forEach(p => {
                                    next[p.packageId] = {
                                      category: cat,
                                      note: prev[p.packageId]?.note || '',
                                    };
                                  });
                                  return next;
                                });
                              }}
                              className="flex-1 h-12 rounded-xl border border-border bg-background text-base font-bold px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/45 cursor-pointer"
                            >
                              <option value="">— MOTIVO —</option>
                              <option value="consolidacion">CONSOLIDACIÓN (BODEGA)</option>
                              <option value="retira_oficina">RETIRA OFICINA</option>
                              <option value="cliente_ausente">CLIENTE AUSENTE</option>
                              <option value="no_pago">NO REALIZÓ EL PAGO</option>
                              <option value="zona_restringida">ZONA RESTRINGIDA</option>
                              <option value="dano_paquete">PAQUETE DAÑADO</option>
                              <option value="direccion_incorrecta">DIRECCIÓN INCORRECTA</option>
                              <option value="otro">OTRO MOTIVO</option>
                            </select>
                            {(fs.category === 'otro' || g.packages.some(p => !!faltanteState[p.packageId]?.note)) && (
                              <Input
                                value={fs.note}
                                onChange={e => {
                                  const noteVal = e.target.value;
                                  setFaltanteState(prev => {
                                    const next = { ...prev };
                                    g.packages.forEach(p => {
                                      next[p.packageId] = {
                                        category: prev[p.packageId]?.category || fs.category,
                                        note: noteVal,
                                      };
                                    });
                                    return next;
                                  });
                                }}
                                placeholder="Nota..."
                                className="flex-1 h-12 text-base font-semibold rounded-xl"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl" onClick={() => { setShowClosePanel(false); setEndKm(''); setFaltanteState({}); }} disabled={isClosing}>
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl" onClick={handleCloseSession} disabled={isClosing || !endKm}>
                {isClosing
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin shrink-0" />Cerrando...</>
                  : <><CheckCircle2 className="w-5 h-5 mr-2 shrink-0" />Cerrar sesión</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Tips modal ── */}
      {showTips && <TipsModal onClose={() => setShowTips(false)} />}

      {/* ── Fuel Refill Modal ── */}
      {showFuelModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md mx-4 bg-background rounded-2xl border border-border shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Fuel className="w-5 h-5 text-amber-500 shrink-0" />
                <h2 className="text-base sm:text-lg font-extrabold">Recarga de combustible</h2>
              </div>
              <button
                onClick={() => { setShowFuelModal(false); setFuelKm(''); setFuelAmount(''); setFuelNote(''); setFuelPhoto(null); }}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/80 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Km at refill */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">KILOMETRAJE AL RECARGAR</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={`Más de ${session.startKm.toLocaleString()}`}
                  value={fuelKm}
                  onChange={e => setFuelKm(e.target.value)}
                  className="h-12 text-base font-bold font-mono rounded-xl shadow-sm"
                />
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">MONTO PAGADO</Label>
                <div className="flex gap-2.5">
                  <div className="flex border border-border rounded-xl overflow-hidden text-xs sm:text-sm font-extrabold bg-muted/20 shadow-sm shrink-0">
                    <button
                      className={cn('px-4 py-3 h-12 transition-colors min-w-[50px] flex items-center justify-center', fuelCurrency === 'CRC' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      onClick={() => setFuelCurrency('CRC')}
                    >₡</button>
                    <button
                      className={cn('px-4 py-3 h-12 transition-colors min-w-[50px] flex items-center justify-center', fuelCurrency === 'USD' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      onClick={() => setFuelCurrency('USD')}
                    >$</button>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={fuelAmount}
                    onChange={e => setFuelAmount(e.target.value)}
                    className="h-12 text-base font-bold font-mono rounded-xl shadow-sm flex-1"
                  />
                </div>
              </div>

              {/* Dashboard photo */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">FOTO DEL TABLERO (OPCIONAL)</Label>
                <input
                  ref={fuelPhotoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFuelPhotoCapture}
                />
                {fuelPhoto ? (
                  <div className="relative rounded-xl overflow-hidden border border-border shadow-md">
                    <img src={fuelPhoto} alt="Panel" className="w-full h-40 object-cover" />
                    <button
                      onClick={() => setFuelPhoto(null)}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white rounded-full w-7 h-7 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2.5 py-1 rounded-md font-bold shadow text-center w-fit mx-auto">
                      La IA analizará el nivel de combustible
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fuelPhotoRef.current?.click()}
                    className="w-full h-20 border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2.5 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-muted/10 transition-all text-sm sm:text-base font-extrabold shadow-inner"
                  >
                    <Camera className="w-5 h-5 shrink-0" />
                    Tomar foto del tablero
                  </button>
                )}
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">NOTA (OPCIONAL)</Label>
                <Input
                  placeholder="Ej: RECOPE Guadalupe"
                  value={fuelNote}
                  onChange={e => setFuelNote(e.target.value)}
                  className="h-12 text-base font-semibold rounded-xl shadow-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="ghost" className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl" onClick={() => setShowFuelModal(false)} disabled={isSavingFuel}>
                Cancelar
              </Button>
              <Button className="flex-1 h-13 text-sm sm:text-base font-extrabold rounded-xl" onClick={handleSaveFuelRefill} disabled={isSavingFuel || !fuelKm || !fuelAmount}>
                {isSavingFuel ? <Loader2 className="w-5 h-5 animate-spin mr-2 shrink-0" /> : <Fuel className="w-5 h-5 mr-2 shrink-0" />}
                Registrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Parking Payment Modal ── */}
      {showParkingModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md mx-4 bg-background rounded-2xl border border-border shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <ParkingCircle className="w-5 h-5 text-blue-500 shrink-0" />
                <h2 className="text-base sm:text-lg font-extrabold">Pago de parqueo</h2>
              </div>
              <button
                onClick={() => { setShowParkingModal(false); setParkingAmount(''); setParkingNote(''); }}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/80 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">MONTO DEL PARQUEO</Label>
                <div className="flex gap-2.5">
                  <div className="flex border border-border rounded-xl overflow-hidden text-xs sm:text-sm font-extrabold bg-muted/20 shadow-sm shrink-0">
                    <button
                      className={cn('px-4 py-3 h-12 transition-colors min-w-[50px] flex items-center justify-center', parkingCurrency === 'CRC' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      onClick={() => setParkingCurrency('CRC')}
                    >₡</button>
                    <button
                      className={cn('px-4 py-3 h-12 transition-colors min-w-[50px] flex items-center justify-center', parkingCurrency === 'USD' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      onClick={() => setParkingCurrency('USD')}
                    >$</button>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={parkingAmount}
                    onChange={e => setParkingAmount(e.target.value)}
                    className="h-12 text-base font-bold font-mono rounded-xl shadow-sm flex-1"
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">UBICACIÓN / NOTA (OPCIONAL)</Label>
                <Input
                  placeholder="Ej: Mall San Pedro, zona A"
                  value={parkingNote}
                  onChange={e => setParkingNote(e.target.value)}
                  className="h-12 text-base font-semibold rounded-xl shadow-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="ghost" className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl" onClick={() => setShowParkingModal(false)} disabled={isSavingParking}>
                Cancelar
              </Button>
              <Button className="flex-1 h-13 text-sm sm:text-base font-extrabold rounded-xl" onClick={handleSaveParkingPayment} disabled={isSavingParking || !parkingAmount}>
                {isSavingParking ? <Loader2 className="w-5 h-5 animate-spin mr-2 shrink-0" /> : <ParkingCircle className="w-5 h-5 mr-2 shrink-0" />}
                Registrar
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Toll Payment Modal ── */}
      {showTollModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md mx-4 bg-background rounded-2xl border border-border shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Coins className="w-5 h-5 text-emerald-500 shrink-0" />
                <h2 className="text-base sm:text-lg font-extrabold">Pago de peaje</h2>
              </div>
              <button
                onClick={() => { setShowTollModal(false); setTollAmount(''); setTollNote(''); }}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/80 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">MONTO DEL PEAJE</Label>
                <div className="flex gap-2.5">
                  <div className="flex border border-border rounded-xl overflow-hidden text-xs sm:text-sm font-extrabold bg-muted/20 shadow-sm shrink-0">
                    <button
                      className={cn('px-4 py-3 h-12 transition-colors min-w-[50px] flex items-center justify-center', tollCurrency === 'CRC' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      onClick={() => setTollCurrency('CRC')}
                    >₡</button>
                    <button
                      className={cn('px-4 py-3 h-12 transition-colors min-w-[50px] flex items-center justify-center', tollCurrency === 'USD' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                      onClick={() => setTollCurrency('USD')}
                    >$</button>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={tollAmount}
                    onChange={e => setTollAmount(e.target.value)}
                    className="h-12 text-base font-bold font-mono rounded-xl shadow-sm flex-1"
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-foreground">PEAJE / NOTA (OPCIONAL)</Label>
                <Input
                  placeholder="Ej: Peaje Alajuela, Ruta 27"
                  value={tollNote}
                  onChange={e => setTollNote(e.target.value)}
                  className="h-12 text-base font-semibold rounded-xl shadow-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="ghost" className="flex-1 h-13 text-sm sm:text-base font-bold rounded-xl" onClick={() => setShowTollModal(false)} disabled={isSavingToll}>
                Cancelar
              </Button>
              <Button className="flex-1 h-13 text-sm sm:text-base font-extrabold rounded-xl" onClick={handleSaveTollPayment} disabled={isSavingToll || !tollAmount}>
                {isSavingToll ? <Loader2 className="w-5 h-5 animate-spin mr-2 shrink-0" /> : <Coins className="w-5 h-5 mr-2 shrink-0" />}
                Registrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
