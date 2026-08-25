import React, { useMemo, useState, useEffect, memo } from "react";

const ENABLE_GOOGLE_MAPS = false;

import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { apiClient } from "@/lib/api/api-client";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { SkeletonCard } from "@/components/SkeletonLoaders";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { useRoutePackagesRealtime, useUpdatePackageStatus, useBatchUpdatePackageStatus, useRecordDeliveryAttempt, RoutePackage } from "@/lib/hooks/queries/useDistribution";
import { SignatureCapture, type SignatureGeoData } from "@/components/distribution/SignatureCapture";
import { DistributionScannerModal } from "@/components/distribution/DistributionScannerModal";
import { useUsers } from "@/lib/hooks/queries/useUsers";
import { CustomerAutocomplete, type AutocompleteCustomer } from "@/components/customer/CustomerAutocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { RouteCheckIn } from "@/components/routes/RouteCheckIn";
import { RouteCheckOut } from "@/components/routes/RouteCheckOut";
import {
  getActiveSession,
  type RouteSession,
  type RouteSessionPackage,
} from "@/lib/services/route-session-service";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs, updateDoc, writeBatch, limit } from "firebase/firestore";
import {
  Package,
  Search,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Truck,
  MapPin,
  AlertCircle,
  ChevronDown,
  AlertTriangle,
  Copy,
  Check,
  Users,
  ScanLine,
  FlagOff,
} from "lucide-react";

// ── CustomerDeliveryGroup ─────────────────────────────────────────────────────
interface CustomerDeliveryGroup {
  key: string;
  customerName: string;
  slCode?: string;
  address?: string;
  packages: RoutePackage[];
}

// ─── Admin Filter Panel ─────────────────────────────────────────────────────

interface AdminFilterPanelProps {
  mode: 'agent' | 'route';
  onModeChange: (m: 'agent' | 'route') => void;
  selectedAgentId: string;
  onAgentChange: (v: string) => void;
  selectedRouteId: string;
  onRouteChange: (v: string) => void;
  deliveryAgents: Array<{ id: string; fullName?: string; email: string }>;
  allRoutes: Array<{ id: string; name: string }>;
  uniqueManifests?: string[];
  selectedManifest?: string;
  onManifestChange?: (v: string) => void;
}

function AdminFilterPanel({
  mode, onModeChange,
  selectedAgentId, onAgentChange,
  selectedRouteId, onRouteChange,
  deliveryAgents, allRoutes,
  uniqueManifests = [], selectedManifest = "", onManifestChange,
}: AdminFilterPanelProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2.5">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-600 mr-1">Ver por:</span>
        <button
          onClick={() => onModeChange('agent')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            mode === 'agent'
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
          data-testid="filter-mode-agent"
        >
          <Users className="h-3 w-3" />
          Chofer
        </button>
        <button
          onClick={() => onModeChange('route')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            mode === 'route'
              ? 'bg-gray-900 text-white'
              : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
          data-testid="filter-mode-route"
        >
          <MapPin className="h-3 w-3" />
          Ruta
        </button>
      </div>

      {/* Agent / Route selector row */}
      <div className="flex items-center gap-2">
        {mode === 'agent' ? (
          <Select value={selectedAgentId} onValueChange={onAgentChange}>
            <SelectTrigger className="flex-1 bg-white border-gray-300 h-8 text-xs" data-testid="agent-selector">
              <SelectValue placeholder="Selecciona un chofer…" />
            </SelectTrigger>
            <SelectContent>
              {deliveryAgents.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs">
                  {a.fullName || a.email}
                </SelectItem>
              ))}
              {deliveryAgents.length === 0 && (
                <div className="py-3 text-center text-xs text-gray-400">Sin choferes registrados</div>
              )}
            </SelectContent>
          </Select>
        ) : (
          <Select value={selectedRouteId} onValueChange={onRouteChange}>
            <SelectTrigger className="flex-1 bg-white border-gray-300 h-8 text-xs" data-testid="route-selector">
              <SelectValue placeholder="Selecciona una ruta…" />
            </SelectTrigger>
            <SelectContent>
              {allRoutes.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.name}
                </SelectItem>
              ))}
              {allRoutes.length === 0 && (
                <div className="py-3 text-center text-xs text-gray-400">Sin rutas activas</div>
              )}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Manifest selector — only visible when there are manifests in this route */}
      {uniqueManifests.length > 0 && onManifestChange && (
        <Select value={selectedManifest || "__all__"} onValueChange={(v) => onManifestChange(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full bg-white border-gray-300 h-8 text-xs" data-testid="manifest-selector">
            <SelectValue placeholder="Todos los manifiestos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs font-medium text-gray-500">
              Todos los manifiestos
            </SelectItem>
            {uniqueManifests.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                Manifiesto {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ── Return Reason Options ─────────────────────────────────────────────────────

const RETURN_REASONS = [
  { value: 'customer_not_available', label: 'Cliente no disponible' },
  { value: 'incorrect_address',      label: 'Dirección incorrecta' },
  { value: 'refused_delivery',       label: 'Rechazó la entrega' },
  { value: 'address_inaccessible',   label: 'Dirección inaccesible' },
  { value: 'customer_rescheduled',   label: 'Cliente reprogramó' },
  { value: 'damaged_package',        label: 'Paquete dañado' },
  { value: 'other',                  label: 'Otro' },
] as const;

// ─── Main Component ──────────────────────────────────────────────────────────

const Distribution = memo(function Distribution() {
  const { t } = useLocale(['distribution', 'packages', 'common']);
  const { user } = useAuth();
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const { canUpdate } = usePermissions();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnDialogTarget, setReturnDialogTarget] = useState<
    | { kind: 'single'; rp: RoutePackage }
    | { kind: 'group'; group: CustomerDeliveryGroup }
    | null
  >(null);
  const [selectedReturnReasons, setSelectedReturnReasons] = useState<string[]>([]);
  const [deliveryConfirmOpen, setDeliveryConfirmOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<RoutePackage | null>(null);
  
  // Customer association modal state
  const [showCustomerAssociationModal, setShowCustomerAssociationModal] = useState(false);
  const [selectedCustomerForAssociation, setSelectedCustomerForAssociation] = useState<AutocompleteCustomer | null>(null);

  // Signature capture
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<string | undefined>(undefined);

  // Copy tracking number state
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);

  // Scanner modal
  const [scannerOpen, setScannerOpen] = useState(false);

  // Group delivery state
  const [checkedPackages, setCheckedPackages] = useState<Record<string, boolean>>({});
  const [confirmingGroup, setConfirmingGroup] = useState<CustomerDeliveryGroup | null>(null);
  const [paymentCollected, setPaymentCollected] = useState(true);
  
  // Mobile route info collapse state
  const [mobileRouteInfoOpen, setMobileRouteInfoOpen] = useState(false);

  // Auto-open route info on desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) { // md breakpoint
        setMobileRouteInfoOpen(true);
      }
    };
    
    // Set initial state
    handleResize();
    
    // Listen for window resize
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if user is Admin or Manager
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // ── Route session state ───────────────────────────────────────────────────
  const [routeSession, setRouteSession]         = useState<RouteSession | null>(null);
  const [sessionCheckedIn, setSessionCheckedIn] = useState(false);
  const [showCheckIn, setShowCheckIn]           = useState(false);
  const [showCheckOut, setShowCheckOut]         = useState(false);
  const [checkingSession, setCheckingSession]   = useState(false);
  // (useEffect + handlers are defined after selectedRoute/currentUserId are declared below)

  // Admin filter mode: by delivery agent or by route
  const [adminFilterMode, setAdminFilterMode] = useState<'agent' | 'route'>('agent');
  const [selectedAdminRouteId, setSelectedAdminRouteId] = useState<string>("");
  const [selectedManifest, setSelectedManifest] = useState<string>("");

  // Fetch all users for Admin/Manager dropdown (only if they have permission)
  const { data: allUsers } = useUsers({ enabled: isAdminOrManager });
  const deliveryAgents = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(u => u.role === 'DELIVERY' || u.role === 'AGENT');
  }, [allUsers]);

  // Resolve the target userId:
  //   - Admin/Manager (agent mode): use the selected agent's ID
  //   - Delivery/Agent: use their own UID
  const currentUserId = (user as any)?.uid ?? (user as any)?.id;
  const targetUserId = isAdminOrManager
    ? (selectedAgentId || undefined)
    : currentUserId;

  const shouldFetchByAgent = !isAdminOrManager
    ? true
    : adminFilterMode === 'agent' && selectedAgentId !== "";
  const shouldFetchByRoute = isAdminOrManager && adminFilterMode === 'route' && selectedAdminRouteId !== "";
  const shouldFetchRoute = shouldFetchByAgent || shouldFetchByRoute;

  // Real-time Firestore listeners (replaces polling)
  const {
    data: routes,
    isLoading,
    error,
  } = useRoutePackagesRealtime(
    adminFilterMode,
    adminFilterMode === 'agent' ? targetUserId : undefined,
    adminFilterMode === 'route' ? (selectedAdminRouteId || undefined) : undefined,
    { enabled: shouldFetchRoute }
  );

  // All routes for the route picker (admin only) — direct Firestore, no Cloud Function
  const { data: allRoutesRaw } = useQuery({
    queryKey: ['routes-picker'],
    queryFn: async () => {
      const res = await firestoreApi.routes.list({
        orderByField: 'name',
        orderDirection: 'asc',
        pageSize: 200,
      });
      return (res as any)?.data ?? [];
    },
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });
  const allActiveRoutes = useMemo(() => {
    if (!allRoutesRaw) return [];
    return (allRoutesRaw as any[])
      .filter(r => r.status === 'active' || (r as any).active === true || !r.status)
      .map(r => ({ id: r.id as string, name: r.name as string }));
  }, [allRoutesRaw]);

  // Auto-select first route when routes are loaded or validate selection
  useEffect(() => {
    if (!routes) return;
    
    if (routes.length === 0) {
      setSelectedRouteId(null);
      return;
    }
    
    // If no route selected, select first one
    if (!selectedRouteId) {
      setSelectedRouteId(routes[0].id);
      return;
    }
    
    // Validate selected route still exists in current routes
    const routeExists = routes.some(r => r.id === selectedRouteId);
    if (!routeExists) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes, selectedRouteId]);

  // Get the currently selected route
  const selectedRoute = useMemo(() => {
    if (!routes || !selectedRouteId) return null;
    return routes.find(r => r.id === selectedRouteId) || null;
  }, [routes, selectedRouteId]);

  // ── Session check: runs when the selected route changes ───────────────────
  useEffect(() => {
    if (!selectedRoute || !currentUserId) {
      setRouteSession(null);
      setSessionCheckedIn(false);
      setShowCheckIn(false);
      return;
    }
    let cancelled = false;
    setCheckingSession(true);
    getActiveSession(selectedRoute.id, currentUserId)
      .then(session => {
        if (cancelled) return;
        if (session) {
          setRouteSession(session);
          setSessionCheckedIn(true);
        } else {
          setRouteSession(null);
          setSessionCheckedIn(false);
          setShowCheckIn(true);
        }
      })
      .catch(() => { if (!cancelled) setShowCheckIn(true); })
      .finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute?.id, currentUserId]);

  const handleCheckInComplete = async (sessionId: string) => {
    const { getRouteSession } = await import('@/lib/services/route-session-service');
    const session = await getRouteSession(sessionId);
    setRouteSession(session);
    setSessionCheckedIn(true);
    setShowCheckIn(false);
  };

  const handleSkipCheckIn = () => {
    setSessionCheckedIn(true);
    setShowCheckIn(false);
    if (selectedRoute && currentUserId) {
      import('@/lib/services/route-session-service').then(({ createRouteSession, getRouteSession }) => {
        createRouteSession({
          routeId:        selectedRoute.id,
          routeName:      selectedRoute.name,
          driverId:       currentUserId,
          driverName:     (user as any)?.fullName || user?.email || '',
          vehiclePlate:   '',
          startKm:        0,
          packages:       [] as RouteSessionPackage[],
          totalPackages:  0,
          totalWeight:    0,
          cashToCollect:  0,
          cashCurrency:   'CRC',
          status:         'open' as const,
          skippedCheckIn: true,
          skippedBy:      (user as any)?.fullName || user?.email || '',
          startAt:        new Date().toISOString(),
        })
          .then((id: string) => getRouteSession(id))
          .then((s: RouteSession | null) => { if (s) setRouteSession(s); })
          .catch(() => {});
      });
    }
  };

  const handleCheckOutComplete = () => {
    setShowCheckOut(false);
    setRouteSession(null);
    setSessionCheckedIn(false);
  };

  const updateStatus = useUpdatePackageStatus();
  const batchUpdateStatus = useBatchUpdatePackageStatus();
  const recordAttempt = useRecordDeliveryAttempt();

  // Unique manifests derived from the selected route's packages
  const uniqueManifests = useMemo(() => {
    if (!selectedRoute?.routePackages) return [];
    const s = new Set<string>();
    (selectedRoute.routePackages as any[]).forEach(rp => {
      const m = (rp as any).package?.manifestNumber || (rp as any).package?.manifiesto;
      if (m) s.add(m);
    });
    return Array.from(s).sort();
  }, [selectedRoute]);

  // Get active packages assigned to this route (ignoring historical delivered/processed ones)
  const activeRoutePackages = useMemo(() => {
    if (!selectedRoute?.routePackages) return [];
    return selectedRoute.routePackages.filter((rp) => {
      const pkg = rp.package;
      if (!pkg) return false;
      // If the package has a `ruta` field, it must match the selected route name
      if (pkg.ruta && pkg.ruta !== selectedRoute.name) return false;
      // Only show packages actively on this delivery route
      const status = (pkg.status || '').toLowerCase().trim();
      const isTerminal = status === 'delivered' || status === 'returned';
      const isActiveStatus = status === 'route' || status === 'on_route' || status === 'en_route' || status === 'en_ruta' || status === 'en ruta' || status === 'enviado';
      const inv = ((pkg as any).invoiceStatus || '').toLowerCase().trim();
      const isInvoiceSent = inv === 'sent' || inv === 'enviado';
      return !isTerminal && (isActiveStatus || isInvoiceSent);
    });
  }, [selectedRoute]);

  // Filter packages based on search for the selected route
  // IMPORTANT: Filter to show packages ready for delivery (in_transit or consolidated_completed)
  const filteredPackages = useMemo(() => {
    if (!selectedRoute?.routePackages) return [];

    // Safety filter: only show packages that explicitly belong to this route
    // (guards against stale listener data leaking across route switches)
    let packages = selectedRoute.routePackages.filter((rp) => {
      const pkg = rp.package;
      if (!pkg) return false;
      // If the package has a `ruta` field, it must match the selected route name
      if (pkg.ruta && pkg.ruta !== selectedRoute.name) return false;
      // Only show packages actively on this delivery route
      const status = (pkg.status || '').toLowerCase().trim();
      const isTerminal = status === 'delivered' || status === 'returned';
      const isActiveStatus = status === 'route' || status === 'on_route' || status === 'en_route' || status === 'en_ruta' || status === 'en ruta' || status === 'enviado';
      const inv = ((pkg as any).invoiceStatus || '').toLowerCase().trim();
      const isInvoiceSent = inv === 'sent' || inv === 'enviado';
      return !isTerminal && (isActiveStatus || isInvoiceSent);
    });

    // Apply manifest filter
    if (selectedManifest) {
      packages = packages.filter(rp => {
        const pkg = rp.package as any;
        return (pkg.manifestNumber || pkg.manifiesto) === selectedManifest;
      });
    }

    // Super-search: name, slCode, tracking (full or last N digits), manifest, address
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const isNumeric = /^\d+$/.test(query);
      packages = packages.filter((rp) => {
        const pkg = rp.package as any;
        const tracking = (pkg.trackingNumber || '').toLowerCase();
        const name = (pkg.customerName || pkg.customer?.fullName || '').toLowerCase();
        const slCode = (pkg.slCode || '').toLowerCase();
        const address = (pkg.deliveryAddress || pkg.customer?.address || pkg.destination || '').toLowerCase();
        const manifest = (pkg.manifestNumber || pkg.manifiesto || '').toLowerCase();
        const email = (pkg.customer?.email || '').toLowerCase();
        return (
          tracking.includes(query) ||
          // Last N digits match (numeric queries ≥ 4 chars)
          (isNumeric && query.length >= 4 && tracking.slice(-query.length) === query) ||
          name.includes(query) ||
          slCode.replace(/^sl-?/i, '').includes(query.replace(/^sl-?/i, '')) ||
          slCode.includes(query) ||
          address.includes(query) ||
          manifest.includes(query) ||
          email.includes(query)
        );
      });
    }

    // Sort: `route` status first, then alphabetical by customer name
    const PRIORITY_STATUS = new Set(['route']);
    packages.sort((a, b) => {
      const aFirst = PRIORITY_STATUS.has(a.package.status ?? '') ? 0 : 1;
      const bFirst = PRIORITY_STATUS.has(b.package.status ?? '') ? 0 : 1;
      if (aFirst !== bFirst) return aFirst - bFirst;
      const nameA = (a.package.customerName || a.package.customer?.fullName || '').toLowerCase();
      const nameB = (b.package.customerName || b.package.customer?.fullName || '').toLowerCase();
      return nameA.localeCompare(nameB, 'es');
    });

    return packages;
  }, [selectedRoute, searchQuery, selectedManifest]);

  // Calculate package statistics for display
  const packageStats = useMemo(() => {
    if (!selectedRoute?.routePackages) {
      return { total: 0, inTransit: 0, pending: 0, delivered: 0, failed: 0 };
    }
    
    const stats = {
      total: selectedRoute.routePackages.length,
      inTransit: 0,
      pending: 0,
      delivered: 0,
      failed: 0,
    };
    
    selectedRoute.routePackages.forEach((rp) => {
      const status = (rp.package?.status || '').toLowerCase().trim();
      const isTerminal = status === 'delivered' || status === 'returned';
      const isActiveStatus = status === 'route' || status === 'on_route' || status === 'en_route' || status === 'en_ruta' || status === 'en ruta' || status === 'enviado';
      const inv = ((rp.package as any)?.invoiceStatus || '').toLowerCase().trim();
      const isInvoiceSent = inv === 'sent' || inv === 'enviado';
      
      if (!isTerminal && (isActiveStatus || isInvoiceSent)) stats.inTransit++;
      else if (
        status === 'consolidated' ||
        status === 'received' ||
        status === 'transit' ||
        status === 'customs' ||
        status === 'held'
      ) stats.pending++;
      else if (status === 'delivered') stats.delivered++;
      else if (status === 'returned') stats.failed++;
    });
    
    return stats;
  }, [selectedRoute]);

  // Group packages by customer (slCode > customerId > customerName)
  const groupedPackages = useMemo((): CustomerDeliveryGroup[] => {
    const PLACEHOLDERS = new Set(['cr', 'costa rica', 'costarica', '']);
    const groups = new Map<string, CustomerDeliveryGroup>();
    for (const rp of filteredPackages) {
      const pkg = rp.package;
      const key = pkg.slCode || pkg.customer?.id || pkg.customerName || rp.packageId;
      if (!groups.has(key)) {
        const rawAddr = (pkg as any).deliveryAddress || pkg.customer?.address || '';
        const address = PLACEHOLDERS.has(rawAddr.toLowerCase().trim()) ? '' : rawAddr;
        groups.set(key, {
          key,
          customerName: pkg.customer?.fullName || pkg.customerName || 'Sin nombre',
          slCode: pkg.slCode,
          address,
          packages: [],
        });
      }
      groups.get(key)!.packages.push(rp);
    }
    return Array.from(groups.values());
  }, [filteredPackages]);

  // Auto-check all packages when the filtered list changes (new packages arrive or route switches)
  useEffect(() => {
    setCheckedPackages(
      Object.fromEntries(filteredPackages.map((rp) => [rp.packageId, true]))
    );
  }, [selectedRouteId]);

  // Ensure newly-arrived packages are auto-checked
  useEffect(() => {
    setCheckedPackages((prev) => {
      const next: Record<string, boolean> = { ...prev };
      let changed = false;
      filteredPackages.forEach((rp) => {
        if (!(rp.packageId in next)) {
          next[rp.packageId] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [filteredPackages]);

  const handleOpenGroupDelivery = (group: CustomerDeliveryGroup) => {
    setConfirmingGroup(group);
    setSignatureData(undefined);
    setSignatureOpen(true);
  };

  const [deliveryGeoData, setDeliveryGeoData] = useState<SignatureGeoData | undefined>(undefined);

  const handleSignatureConfirm = (dataUrl: string, geoData?: SignatureGeoData) => {
    setSignatureData(dataUrl);
    setDeliveryGeoData(geoData);
    setSignatureOpen(false);
    setDeliveryConfirmOpen(true);
  };

  const handleConfirmGroupDelivery = async () => {
    if (!confirmingGroup) return;
    const selectedIds = confirmingGroup.packages
      .filter((rp) => checkedPackages[rp.packageId] !== false)
      .map((rp) => rp.packageId);
    if (selectedIds.length === 0) return;
    try {
      await batchUpdateStatus.mutateAsync({
        packageIds: selectedIds,
        status: 'delivered',
        signatureData,
        paymentCollected,
      });
      auditLog({ action: 'delivery_completed', category: 'delivery', result: 'success', resource: confirmingGroup.customerName, metadata: { count: selectedIds.length, packageIds: selectedIds, paymentCollected, hasSignature: !!signatureData } });
      toast({
        title: t("common.success"),
        description: `${selectedIds.length} paquete(s) entregado(s) — ${confirmingGroup.customerName}`,
        variant: "default",
      });

      // Save resolved GPS address back to packages with the same slCode
      if (deliveryGeoData?.address && confirmingGroup.slCode) {
        try {
          const pkgsCol = collection(db, 'packages');
          const snap = await getDocs(query(pkgsCol, where('slCode', '==', confirmingGroup.slCode), limit(50)));
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => {
              batch.update(d.ref, { deliveryAddress: deliveryGeoData.address });
            });
            await batch.commit();
          }
        } catch { /* non-critical */ }
      }

      setDeliveryConfirmOpen(false);
      setConfirmingGroup(null);
      setSignatureData(undefined);
      setDeliveryGeoData(undefined);
      setPaymentCollected(true);
    } catch (err) {
      auditLog({ action: 'delivery_completed', category: 'delivery', result: 'error', resource: confirmingGroup.customerName, errorMessage: err instanceof Error ? err.message : String(err) });
      toast({
        title: t("common.error"),
        description: t("distribution.error.updateStatus"),
        variant: "destructive",
      });
    }
  };

  const handleCopyTracking = async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopiedTrackingId(trackingNumber);
      toast({
        title: t("common.success"),
        description: t("packages.trackingCopied", { trackingNumber }),
        variant: "default",
      });
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedTrackingId(null);
      }, 2000);
    } catch (err) {
      toast({
        title: t("common.error"),
        description: t("common.copyFailed"),
        variant: "destructive",
      });
    }
  };

  const handleCustomerAssociation = async () => {
    if (!selectedPackage || !selectedCustomerForAssociation) return;

    try {
      // First associate customer with package
      await apiClient.patch(`/packages/${selectedPackage.packageId}/bulk`, {
        customerId: selectedCustomerForAssociation.id,
        customerName: selectedCustomerForAssociation.fullName.toUpperCase(),
        slCode: selectedCustomerForAssociation.slCode || "",
      });

      // Then update status to delivered
      await updateStatus.mutateAsync({
        packageId: selectedPackage.packageId,
        status: "delivered",
      });

      auditLog({ action: 'delivery_completed', category: 'delivery', result: 'success', resource: selectedCustomerForAssociation.fullName, resourceId: selectedPackage.packageId, metadata: { slCode: selectedCustomerForAssociation.slCode } });
      toast({
        title: t("common.success"),
        description: t("distribution.success.delivered"),
        variant: "default",
      });

      setShowCustomerAssociationModal(false);
      setSelectedPackage(null);
      setSelectedCustomerForAssociation(null);
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("distribution.error.updateStatus"),
        variant: "destructive",
      });
    }
  };

  const handleQuickReturn = async (rp: RoutePackage, reasons: string[]) => {
    if (!reasons.length) return;
    const primaryReason = reasons[0];
    const driverId   = (user as any)?.uid  ?? (user as any)?.id  ?? undefined;
    const driverName = (user as any)?.fullName ?? (user as any)?.displayName ?? (user as any)?.email ?? undefined;
    try {
      await updateStatus.mutateAsync({
        packageId: rp.packageId,
        status: 'returned',
        failureReason: primaryReason,
        notes: reasons.length > 1 ? reasons.slice(1).join(', ') : undefined,
      });
      recordAttempt.mutate({
        packageId:      rp.packageId,
        trackingNumber: rp.package.trackingNumber,
        reason:         primaryReason,
        notes:          reasons.length > 1 ? reasons.slice(1).join(', ') : undefined,
        driverId,
        driverName,
      });
      auditLog({ action: 'delivery_failed', category: 'delivery', result: 'success', resourceId: rp.packageId, metadata: { failureReason: primaryReason } });
      toast({ title: t("common.success"), description: t("distribution.success.failed"), variant: "default" });
      setReturnDialogOpen(false);
      setReturnDialogTarget(null);
      setSelectedReturnReasons([]);
    } catch {
      toast({ title: t("common.error"), description: t("distribution.error.updateStatus"), variant: "destructive" });
    }
  };

  const handleBulkGroupReturn = async (group: CustomerDeliveryGroup, reasons: string[]) => {
    if (!reasons.length) return;
    const primaryReason = reasons[0];
    try {
      const packageIds = group.packages.map(rp => rp.packageId);
      await batchUpdateStatus.mutateAsync({
        packageIds,
        status: 'returned',
      });
      auditLog({ action: 'delivery_failed', category: 'delivery', result: 'success', resource: group.customerName, metadata: { failureReason: primaryReason, count: group.packages.length } });
      toast({ title: t("common.success"), description: `${group.packages.length} paquete(s) marcados como devueltos — ${group.customerName}` });
      setReturnDialogOpen(false);
      setReturnDialogTarget(null);
      setSelectedReturnReasons([]);
    } catch {
      toast({ title: t("common.error"), description: t("distribution.error.updateStatus"), variant: "destructive" });
    }
  };

  const getStatusBadge = (status: string) => {
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none flex-shrink-0";
    switch (status) {
      case "delivered":
        return <span className={`${base} bg-green-100 text-green-700`} data-testid="status-delivered">Entregado</span>;
      case "returned":
      case "failed":
        return <span className={`${base} bg-red-100 text-red-700`} data-testid="status-failed">Devuelto</span>;
      case "route":
      case "in_transit":
      case "out_for_delivery":
        return <span className={`${base} bg-blue-100 text-blue-700`} data-testid="status-in-transit">En Ruta</span>;
      case "consolidated":
      case "consolidated_completed":
        return <span className={`${base} bg-purple-100 text-purple-700`} data-testid="status-consolidated">Consolidado</span>;
      case "processed":
        return <span className={`${base} bg-sky-100 text-sky-700`} data-testid="status-processed">Facturado</span>;
      case "customs":
        return <span className={`${base} bg-amber-100 text-amber-700`} data-testid="status-customs">Procesando en Costa Rica</span>;
      case "held":
        return <span className={`${base} bg-orange-100 text-orange-700`} data-testid="status-held">Retenido en Aduana</span>;
      case "transit":
        return <span className={`${base} bg-indigo-100 text-indigo-700`} data-testid="status-transit">En Tránsito a Costa Rica</span>;
      case "received":
        return <span className={`${base} bg-cyan-100 text-cyan-700`} data-testid="status-received">Recibido en Miami</span>;
      case "pickup":
        return <span className={`${base} bg-teal-100 text-teal-700`} data-testid="status-pickup">Retira en SmartLogistics</span>;
      case "pre-alerted":
        return <span className={`${base} bg-gray-100 text-gray-600`} data-testid="status-pre-alerted">Pre-Alertado</span>;
      default:
        return <span className={`${base} bg-gray-100 text-gray-500`} data-testid="status-pending">{status || "Pendiente"}</span>;
    }
  };


  // Show loading only for non-admin or when admin has selected an agent
  if (isLoading && shouldFetchRoute) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="distribution-title">
              {t("distribution.title")}
            </h1>
            <p className="text-sm text-gray-600">
              {t("distribution.subtitle")}
            </p>
          </div>

          {/* Admin Filter Panel — loading state */}
          {isAdminOrManager && <AdminFilterPanel
            mode={adminFilterMode}
            onModeChange={(m) => { setAdminFilterMode(m); setSelectedRouteId(null); setSelectedManifest(""); }}
            selectedAgentId={selectedAgentId}
            onAgentChange={(v) => { setSelectedAgentId(v); setSelectedRouteId(null); setSelectedManifest(""); }}
            selectedRouteId={selectedAdminRouteId}
            onRouteChange={(v) => { setSelectedAdminRouteId(v); setSelectedRouteId(null); setSelectedManifest(""); }}
            deliveryAgents={deliveryAgents}
            allRoutes={allActiveRoutes}
            uniqueManifests={uniqueManifests}
            selectedManifest={selectedManifest}
            onManifestChange={setSelectedManifest}
          />}

          {/* Skeleton Loading State */}
          <div className="space-y-4">
            {/* Route Cards Skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
            {/* Package List Skeleton */}
            <Card className="p-4">
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {t("distribution.title")}
            </h1>
            <p className="text-sm text-gray-600">
              {t("distribution.subtitle")}
            </p>
          </div>

          <Alert variant="destructive" data-testid="distribution-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("common.error")}</AlertTitle>
            <AlertDescription>
              {t("distribution.error.loadRoute")}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  // Show appropriate message when no routes data
  if ((!routes || routes.length === 0) && !isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="distribution-title">
              {t("distribution.title")}
            </h1>
            <p className="text-sm text-gray-600">
              {t("distribution.subtitle")}
            </p>
          </div>

          {/* Admin Filter Panel — empty state */}
          {isAdminOrManager && <AdminFilterPanel
            mode={adminFilterMode}
            onModeChange={(m) => { setAdminFilterMode(m); setSelectedRouteId(null); setSelectedManifest(""); }}
            selectedAgentId={selectedAgentId}
            onAgentChange={(v) => { setSelectedAgentId(v); setSelectedRouteId(null); setSelectedManifest(""); }}
            selectedRouteId={selectedAdminRouteId}
            onRouteChange={(v) => { setSelectedAdminRouteId(v); setSelectedRouteId(null); setSelectedManifest(""); }}
            deliveryAgents={deliveryAgents}
            allRoutes={allActiveRoutes}
            uniqueManifests={uniqueManifests}
            selectedManifest={selectedManifest}
            onManifestChange={setSelectedManifest}
          />}

          <Card className="p-8 text-center bg-gray-50 border-gray-300">
            <div data-testid="no-route-assigned">
              <Truck className="h-16 w-16 mx-auto text-gray-400 mb-4" aria-hidden="true" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {isAdminOrManager 
                  ? (selectedAgentId !== "" ? t("distribution.noRouteAssigned") : t("distribution.selectAgentPrompt"))
                  : t("distribution.noRouteAssigned")}
              </h2>
              <p className="text-gray-600">
                {isAdminOrManager
                  ? (selectedAgentId !== "" ? t("distribution.agentHasNoRoute") : t("distribution.selectAgentPromptMessage"))
                  : t("distribution.noRouteMessage")}
              </p>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-4 md:p-6 space-y-4"
      >
        {/* Header with Mobile Route Toggle */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-start justify-between gap-3"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900" data-testid="distribution-title">
                {t("distribution.title")}
              </h1>
              {/* Real-time live indicator */}
              {shouldFetchRoute && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wide flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  En Vivo
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600">
              {t("distribution.subtitle")}
            </p>
          </div>
        </motion.div>

        {/* Admin Filter Panel — main view */}
        {isAdminOrManager && (
          <AdminFilterPanel
            mode={adminFilterMode}
            onModeChange={(m) => { setAdminFilterMode(m); setSelectedRouteId(null); setSelectedManifest(""); }}
            selectedAgentId={selectedAgentId}
            onAgentChange={(v) => { setSelectedAgentId(v); setSelectedRouteId(null); setSelectedManifest(""); }}
            selectedRouteId={selectedAdminRouteId}
            onRouteChange={(v) => { setSelectedAdminRouteId(v); setSelectedRouteId(null); setSelectedManifest(""); }}
            deliveryAgents={deliveryAgents}
            allRoutes={allActiveRoutes}
            uniqueManifests={uniqueManifests}
            selectedManifest={selectedManifest}
            onManifestChange={setSelectedManifest}
          />
        )}



        {/* Search & Packages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {selectedRoute ? (
                <>
                  {selectedRoute.name} - {t("distribution.packageList.title")} ({selectedRoute.completedPackages}/{selectedRoute.totalPackages})
                </>
              ) : (
                <span className="text-gray-500 flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4" />
                  {t("distribution.selectRoutePrompt")}
                </span>
              )}
            </h2>
            {sessionCheckedIn && routeSession && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => setShowCheckOut(true)}
              >
                <FlagOff className="h-3.5 w-3.5" />
                Cerrar ruta
              </Button>
            )}
          </div>

          {checkingSession && (
            <Card className="p-8 text-center bg-gray-50 border-gray-200 mb-3">
              <Loader2 className="h-8 w-8 mx-auto text-gray-400 mb-3 animate-spin" />
              <p className="text-sm font-semibold text-gray-700">Verificando sesión de ruta…</p>
            </Card>
          )}

          {!checkingSession && selectedRoute && !sessionCheckedIn && !showCheckIn && (
            <Card className="p-8 text-center bg-gray-50 border-gray-200 mb-3">
              <Truck className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-semibold text-gray-700">Check-in requerido</p>
              <p className="text-xs text-gray-500 mt-1">Completa el check-in del vehículo para ver los paquetes.</p>
              <Button size="sm" className="mt-3" onClick={() => setShowCheckIn(true)}>Iniciar check-in</Button>
            </Card>
          )}

          {sessionCheckedIn && <>
          <div className="bg-gray-50 border-gray-200 p-3 rounded-md border mb-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                <Input
                  type="text"
                  placeholder="Nombre, SL, tracking, factura..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-xs bg-white border-gray-300"
                  data-testid="package-search"
                  aria-label="Buscar paquetes"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-9 flex-shrink-0 border-gray-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors px-0"
                onClick={() => setScannerOpen(true)}
                aria-label="Escanear código de barras"
                title="Escanear código"
                data-testid="scanner-btn"
              >
                <ScanLine className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2" role="list" aria-label={t("distribution.packageList.title")}>
            {isLoading ? (
              <>
                {[...Array(6)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </>
            ) : filteredPackages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="p-6 text-center bg-gray-50 border-gray-300">
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Package className="h-10 w-10 mx-auto text-gray-400 mb-3" aria-hidden="true" />
                  </motion.div>
                  <p className="text-sm text-gray-600">
                    {searchQuery ? `Sin resultados para "${searchQuery}"` : t("distribution.packageList.noPackages")}
                  </p>
                </Card>
              </motion.div>
            ) : (
              groupedPackages.map((group, groupIndex) => {
                const checkedCount = group.packages.filter(
                  (rp) => checkedPackages[rp.packageId] !== false
                ).length;
                const mapsUrl = group.address
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(group.address)}`
                  : '';

                return (
                  <motion.div
                    key={group.key}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: groupIndex * 0.04 }}
                    role="listitem"
                  >
                    <Card className="border border-gray-200 bg-white overflow-hidden" data-testid={`group-${group.key}`}>
                      {/* ── Group header ── */}
                      <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-gray-900 leading-tight break-words" data-testid="customer-name">
                              {group.customerName}
                            </h3>
                            {group.slCode && (
                              <span className="text-xs text-gray-400 font-mono">{group.slCode}</span>
                            )}
                          </div>
                          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-gray-900 text-white text-xs font-bold flex-shrink-0">
                            {group.packages.length}
                          </span>
                        </div>

                        {/* Address → Google Maps */}
                        {group.address ? (
                          ENABLE_GOOGLE_MAPS ? (
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 rounded-md border border-blue-200 transition-colors"
                              aria-label={`Navegar a ${group.address}`}
                              data-testid="delivery-address-link"
                            >
                              <MapPin className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" aria-hidden="true" />
                              <span className="text-xs font-semibold text-blue-800 break-words leading-snug flex-1" data-testid="delivery-address">
                                {group.address}
                              </span>
                            </a>
                          ) : (
                            <div
                              className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-border transition-colors"
                              data-testid="delivery-address-block"
                            >
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
                              <span className="text-xs font-semibold text-foreground break-words leading-snug flex-1" data-testid="delivery-address">
                                {group.address}
                              </span>
                            </div>
                          )
                        ) : null}
                      </div>

                      {/* ── Package rows with checkboxes ── */}
                      <div className="border-t border-gray-100 divide-y divide-gray-100">
                        {group.packages.map((rp) => {
                          const p = rp.package;
                          const isChecked = checkedPackages[rp.packageId] !== false;
                          return (
                            <div
                              key={rp.packageId}
                              className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${isChecked ? 'bg-white' : 'bg-red-50/60'}`}
                            >
                              <Checkbox
                                id={`chk-${rp.packageId}`}
                                checked={isChecked}
                                onCheckedChange={(v) =>
                                  setCheckedPackages((prev) => ({ ...prev, [rp.packageId]: !!v }))
                                }
                                aria-label={`Entregar ${p.trackingNumber}`}
                                className="flex-shrink-0"
                              />
                              <label
                                htmlFor={`chk-${rp.packageId}`}
                                className="flex-1 min-w-0 cursor-pointer flex items-center gap-2"
                              >
                                <span className="text-xs font-mono font-bold text-gray-900 break-all leading-tight">
                                  {p.trackingNumber}
                                </span>
                              </label>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {/* Delivery attempt counter badge */}
                                {(p.deliveryAttemptCount ?? 0) > 0 && (
                                  <span
                                    className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold leading-none"
                                    title={`${p.deliveryAttemptCount} intento(s) de entrega`}
                                    aria-label={`${p.deliveryAttemptCount} intento(s) de entrega`}
                                  >
                                    {p.deliveryAttemptCount}
                                  </span>
                                )}
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleCopyTracking(p.trackingNumber)}
                                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                                  title={t("packages.copyTracking")}
                                >
                                  {copiedTrackingId === p.trackingNumber
                                    ? <Check className="h-3.5 w-3.5 text-green-600" />
                                    : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                                </motion.button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ── Group action bar ── */}
                      <div className="p-3 border-t border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-2">
                          <PermissionTooltip allowed={canUpdate('distribution')}>
                            <Button
                              variant="outline"
                              className="h-11 text-xs font-bold border-gray-300 text-red-600 hover:bg-red-50 hover:border-red-300 shrink-0 gap-1.5"
                              disabled={batchUpdateStatus.isPending || updateStatus.isPending || !canUpdate('distribution')}
                              aria-label="Devolver todos los paquetes del grupo"
                              onClick={() => { setReturnDialogTarget({ kind: 'group', group }); setSelectedReturnReasons([]); setReturnDialogOpen(true); }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              Devolver todos
                            </Button>
                          </PermissionTooltip>
                          <PermissionTooltip allowed={canUpdate('distribution')}>
                            <Button
                              className="flex-1 h-11 text-sm font-bold bg-gray-900 hover:bg-gray-800 text-white"
                              onClick={() => handleOpenGroupDelivery(group)}
                              disabled={checkedCount === 0 || batchUpdateStatus.isPending || !canUpdate('distribution')}
                              data-testid={`deliver-group-${group.key}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
                              Entregar
                            </Button>
                          </PermissionTooltip>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </div>
          </>}
        </motion.div>
      </motion.div>

      {/* Signature Capture — fullscreen, shown before delivery confirm */}
      {confirmingGroup && (
        <SignatureCapture
          open={signatureOpen}
          onClose={() => { setSignatureOpen(false); setConfirmingGroup(null); }}
          onConfirm={handleSignatureConfirm}
          isLoading={batchUpdateStatus.isPending}
          packageInfo={{
            trackingNumber: '',
            packageCount: confirmingGroup.packages.filter(rp => checkedPackages[rp.packageId] !== false).length,
            customerName: confirmingGroup.customerName,
            slCode: confirmingGroup.slCode,
            destination: confirmingGroup.address,
          }}
        />
      )}


      {/* Delivery Confirmation Modal */}
      <Dialog open={deliveryConfirmOpen} onOpenChange={setDeliveryConfirmOpen}>
        <DialogContent className="sm:max-w-[420px]" data-testid="delivery-confirm-modal">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
              Confirmar Entrega
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Revisa los paquetes antes de confirmar
            </DialogDescription>
          </DialogHeader>

          {confirmingGroup && (
            <div className="space-y-3 py-1">
              {/* Customer info */}
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="text-base font-bold text-gray-900 leading-tight">{confirmingGroup.customerName}</p>
                {confirmingGroup.slCode && (
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{confirmingGroup.slCode}</p>
                )}
              </div>

              {/* Packages to deliver */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Paquetes a entregar</p>
                {confirmingGroup.packages
                  .filter((rp) => checkedPackages[rp.packageId] !== false)
                  .map((rp) => (
                    <div key={rp.packageId} className="flex items-center gap-2 p-2 bg-green-50 rounded-md border border-green-200">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" aria-hidden="true" />
                      <span className="text-xs font-mono font-bold text-green-900">{rp.package.trackingNumber}</span>
                    </div>
                  ))}
              </div>

              {/* Signature preview */}
              {signatureData && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Firma capturada</p>
                  <img src={signatureData} alt="Firma del cliente" className="w-full h-16 object-contain bg-white border border-gray-200 rounded-md" />
                </div>
              )}

              {/* Payment collection toggle */}
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-md border border-yellow-200">
                <div>
                  <p className="text-sm font-bold text-yellow-800">Cobrar en efectivo</p>
                  <p className="text-xs text-yellow-700">El cliente paga al recibir</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={paymentCollected}
                  onClick={() => setPaymentCollected((p) => !p)}
                  className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-yellow-400 ${paymentCollected ? 'bg-green-500' : 'bg-gray-300'}`}
                  aria-label="Toggle cobro en efectivo"
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${paymentCollected ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-row gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeliveryConfirmOpen(false)}
              className="flex-1 h-10 font-medium border-gray-300 hover:bg-gray-100"
              data-testid="delivery-cancel-btn"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmGroupDelivery}
              disabled={batchUpdateStatus.isPending}
              className="flex-1 h-10 font-medium bg-gray-900 hover:bg-gray-800 text-white"
              data-testid="delivery-confirm-btn"
            >
              {batchUpdateStatus.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
              Confirmar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distribution Scanner Modal */}
      <DistributionScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          setSearchQuery(code);
          setScannerOpen(false);
        }}
      />

      {/* Customer Association Modal */}
      <Dialog open={showCustomerAssociationModal} onOpenChange={setShowCustomerAssociationModal}>
        <DialogContent 
          className="sm:max-w-md"
          data-testid="customer-association-modal"
          aria-describedby="customer-association-description"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{t("distribution.customerAssociation.title")}</DialogTitle>
            <DialogDescription id="customer-association-description">
              {selectedPackage && (
                <span className="text-base">
                  {t("distribution.customerAssociation.description", { 
                    trackingNumber: selectedPackage.package.trackingNumber 
                  })}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-orange-600">
                {t("packages.linkPackageToCustomer")} *
              </label>
              <p className="text-xs text-gray-500 mb-2">
                {t("distribution.customerAssociation.searchHint")}
              </p>
              <CustomerAutocomplete
                value={selectedCustomerForAssociation?.fullName || ""}
                onChange={() => {}}
                onCustomerSelect={(customer) => {
                  setSelectedCustomerForAssociation(customer);
                }}
                placeholder={t("distribution.customerAssociation.placeholder")}
                data-testid="customer-search-input"
              />
              {selectedCustomerForAssociation && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="text-sm font-semibold text-green-900">{t("distribution.customerAssociation.selected")}</div>
                  <div className="text-sm text-green-800 mt-1">
                    <span className="font-medium">{selectedCustomerForAssociation.fullName}</span>
                  </div>
                  {selectedCustomerForAssociation.slCode && (
                    <div className="text-xs text-green-700 mt-1">
                      {t("customers.slCode")}: <span className="font-mono font-semibold">{selectedCustomerForAssociation.slCode}</span>
                    </div>
                  )}
                  {selectedCustomerForAssociation.email && (
                    <div className="text-xs text-green-600 mt-0.5">
                      {t("customers.email")}: {selectedCustomerForAssociation.email}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomerAssociationModal(false);
                setSelectedPackage(null);
                setSelectedCustomerForAssociation(null);
              }}
              className="flex-1 h-10 font-medium border-gray-300 hover:bg-gray-100"
              data-testid="customer-association-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCustomerAssociation}
              disabled={!selectedCustomerForAssociation || updateStatus.isPending}
              className="flex-1 h-10 font-medium bg-gray-900 hover:bg-gray-800 text-white"
              data-testid="customer-association-confirm"
            >
              {updateStatus.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("distribution.customerAssociation.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Return Reason Dialog — full modal optimised for mobile & cognitive accessibility */}
      <Dialog
        open={returnDialogOpen}
        onOpenChange={(open) => {
          if (!open) { setReturnDialogOpen(false); setReturnDialogTarget(null); setSelectedReturnReasons([]); }
        }}
      >
        <DialogContent
          className="p-0 gap-0 w-full max-w-[100vw] sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90dvh] overflow-hidden"
          data-testid="return-reason-dialog"
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center shrink-0" aria-hidden="true">
                <RotateCcw className="h-7 w-7 text-red-600" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold text-gray-900 leading-tight">
                  Motivo de devolución
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-0.5 truncate">
                  {returnDialogTarget?.kind === 'single'
                    ? returnDialogTarget.rp.package.trackingNumber
                    : returnDialogTarget?.kind === 'group'
                      ? `${returnDialogTarget.group.customerName} · ${returnDialogTarget.group.packages.length} paquete${returnDialogTarget.group.packages.length !== 1 ? 's' : ''}`
                      : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Reason options — large tap targets */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {RETURN_REASONS.map(r => {
              const isSelected = selectedReturnReasons.includes(r.value);
              return (
                <label
                  key={r.value}
                  htmlFor={`rdlg-${r.value}`}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all select-none active:scale-[0.98]",
                    isSelected
                      ? "border-red-500 bg-red-50"
                      : "border-gray-200 bg-white"
                  )}
                >
                  <Checkbox
                    id={`rdlg-${r.value}`}
                    checked={isSelected}
                    onCheckedChange={(v) =>
                      setSelectedReturnReasons(prev =>
                        v ? [...prev, r.value] : prev.filter(x => x !== r.value)
                      )
                    }
                    className="h-7 w-7 rounded-md shrink-0"
                    aria-label={r.label}
                  />
                  <span className={cn(
                    "text-lg font-semibold leading-snug",
                    isSelected ? "text-red-700" : "text-gray-800"
                  )}>
                    {r.label}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Actions */}
          <div className="px-4 pb-8 pt-3 border-t border-gray-100 space-y-3 shrink-0">
            <Button
              disabled={selectedReturnReasons.length === 0 || updateStatus.isPending}
              onClick={async () => {
                if (!returnDialogTarget || !selectedReturnReasons.length) return;
                if (returnDialogTarget.kind === 'single') {
                  await handleQuickReturn(returnDialogTarget.rp, selectedReturnReasons);
                } else {
                  await handleBulkGroupReturn(returnDialogTarget.group, selectedReturnReasons);
                }
              }}
              className="w-full h-14 text-lg font-bold rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white"
              aria-label="Confirmar devolución"
            >
              {updateStatus.isPending
                ? <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
                : <RotateCcw className="h-5 w-5 mr-2" aria-hidden="true" />
              }
              {returnDialogTarget?.kind === 'group'
                ? `Devolver ${returnDialogTarget.group.packages.length} paquete${returnDialogTarget.group.packages.length !== 1 ? 's' : ''}`
                : 'Confirmar devolución'
              }
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setReturnDialogOpen(false); setReturnDialogTarget(null); setSelectedReturnReasons([]); }}
              className="w-full h-12 text-base font-medium text-gray-500"
              aria-label="Cancelar"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Route Check-In modal ───────────────────────────────────────────── */}
      {showCheckIn && selectedRoute && currentUserId && (
        <RouteCheckIn
          open={showCheckIn}
          routeId={selectedRoute.id}
          routeName={selectedRoute.name}
          driverId={currentUserId}
          driverName={(user as any)?.fullName || user?.email || ''}
          packages={activeRoutePackages.map((rp: any) => ({
            packageId:    rp.packageId,
            tracking:     rp.package?.tracking ?? rp.package?.trackingNumber ?? rp.packageId,
            customerName: rp.package?.customerName,
            slCode:       rp.package?.slCode,
            weight:       rp.package?.weight,
            ruta:         rp.package?.ruta ?? selectedRoute.name,
            cashAmount:   rp.package?.calculatedCost ?? rp.package?.cost,
            currency:     rp.package?.currency,
            costCRC:      rp.package?.costCRC ?? 0,
            isConsolidation: !!(rp.package?.isConsolidation || rp.package?.consolidaFlag || rp.package?.tipo === 'consolidacion' || rp.package?.consolida),
            isPermiso:       !!(rp.package?.isPermiso || rp.package?.permisosFlag || rp.package?.requiresPermit || rp.package?.permisos || rp.package?.tipo === 'permiso'),
            invoiceStatus:   rp.package?.invoiceStatus || '',
            manifestNumber:  rp.package?.manifestNumber || rp.package?.manifestId || '',
            deliveryAddress: rp.package?.deliveryAddress || rp.package?.customer?.address || '',
          })) as RouteSessionPackage[]}
          totalWeight={activeRoutePackages.reduce((s: number, rp: any) => s + (Number(rp.package?.weight) || 0), 0)}
          cashToCollect={activeRoutePackages.reduce((s: number, rp: any) => s + (Number(rp.package?.calculatedCost ?? rp.package?.cost) || 0), 0)}
          isAdmin={isAdminOrManager}
          onCheckedIn={handleCheckInComplete}
          onSkip={isAdminOrManager ? handleSkipCheckIn : undefined}
        />
      )}

      {/* ── Route Check-Out modal ──────────────────────────────────────────── */}
      {showCheckOut && routeSession && (
        <RouteCheckOut
          open={showCheckOut}
          session={routeSession}
          deliveredPackageIds={
            new Set(
              ((selectedRoute as any)?.routePackages ?? [])
                .filter((rp: any) => rp.package?.status === 'delivered')
                .map((rp: any) => rp.packageId)
            )
          }
          onClosed={handleCheckOutComplete}
          onCancel={() => setShowCheckOut(false)}
        />
      )}

    </DashboardLayout>
  );
});

export default Distribution;
