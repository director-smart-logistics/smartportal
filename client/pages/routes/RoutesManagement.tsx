import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
import { ROUTE_COLORS, getRouteColor } from "@/lib/utils/route-colors";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus, MapPin, Truck, Users, Search, Edit, Trash2,
  AlertCircle, Save, X, Check, ChevronsUpDown, Package,
  CheckCircle2, Loader2, RotateCcw, Boxes, Store, Ban,
  Filter, Copy, ChevronDown, ChevronRight, Layers, LayoutGrid, ListOrdered,
  Eye, FileText, Weight, Car, Bike, type LucideIcon,
  Route, UserCheck, CircleDot, Printer, AlertTriangle, Download, FileDown, FlagOff,
  ChevronLeft, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useRoutes, useCreateRoute, useUpdateRoute, useDeleteRoute, useRoutePackages,
} from "@/lib/hooks/queries/useRoutes";
import { useUsers } from "@/lib/hooks/queries/useUsers";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { SkeletonCard } from "@/components/SkeletonLoaders";
import { Skeleton } from "@/components/ui/skeleton";
import { firebaseApi } from "@/lib/firebase/callable";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { query, collection, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildRouteManifestHTML, buildBoletaHTML, type RouteManifestRow, type BoletaPrintRow } from "@/lib/utils/nova-print";
import { NovaInvoicePreview } from "@/components/nova/NovaInvoicePreview";
import { ManifestPicker } from "@/components/manifest/ManifestPicker";
import { getInvoiceByTracking } from "@/lib/firebase/firestore-client";
import { sendTestInvoiceEmail, sendInvoiceEmails, markInvoicesAsPaidForTrackings, updateInvoiceStatusForTrackings, getCustomersBySlCodes, getInvoiceStatusesByManifests, type InvoiceRecord } from "@/lib/services/invoice-service";
import { syncPackagesToSmartWeb, type SP1PackageForSync } from "@/lib/services/sync-smartweb-service";
import { pushStatusToSp2 } from "@/lib/services/sync-invoices-service";
import { downloadGTITiquetes, downloadGTITiquetesXLSX, buildGTICalculatedRows, type GTIRowInput } from "@/lib/services/gti-export";
import { downloadCSV as downloadManifestCSV, downloadXLSX as downloadManifestXLSX, type ManifestRow, type ProcessingResult } from "@/lib/services/manifest-processor";
import { saveGTIManifest, fetchGTIInvoicesByManifest, markInvoicesAsGTIDownloaded, getGTICountsByManifests, type GTIInvoiceEntry } from "@/lib/services/gti-manifest-service";
import { BulkManifestWizardModal } from "@/components/manifest/BulkManifestWizardModal";
import type { WizardPackage } from "@/components/manifest/BulkManifestWizardModal";
import { RouteCheckIn } from "@/components/routes/RouteCheckIn";
import { RouteCheckOut } from "@/components/routes/RouteCheckOut";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import {
  getActiveSession,
  type RouteSession,
  type RouteSessionPackage,
} from "@/lib/services/route-session-service";
import { isOrphanSlCode } from "@/lib/utils/invoice-reassign";

// ── Types ──────────────────────────────────────────────────────────────────

type VehicleType = "car" | "van" | "truck" | "motorcycle" | "pickup" | "box_truck" | "bike";

interface RouteVehicle {
  type: VehicleType;
  plate: string;
  capacity?: number;
  notes?: string;
  driverId?: string;
  driverName?: string;
}

interface CatalogRoute {
  id: string;
  name: string;
  description?: string;
  originLocation?: string;
  destinationLocation?: string;
  vehiclePlate?: string;
  vehicleType?: string;
  vehicles?: RouteVehicle[];
  estimatedDistance?: number;
  estimatedDuration?: string;
  status: "active" | "inactive";
  areas?: string[];
  cantons?: string[];
  province?: string;
  color?: string;
  type?: "metropolitan" | "encomienda";
  totalPackages?: number;
  completedPackages?: number;
  assignedAgentId?: string | null;
  assignedAgent?: { id: string; fullName: string; email: string } | null;
}

interface Agent {
  id: string;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const COSTA_RICA_PROVINCES = [
  "Alajuela", "Cartago", "Guanacaste", "Heredia", "Limón", "Puntarenas", "San José",
];

const VEHICLE_TYPES: { value: VehicleType; label: string; Icon: LucideIcon }[] = [
  { value: "van",       label: "Van",          Icon: Truck },
  { value: "truck",     label: "Camión",       Icon: Truck },
  { value: "box_truck", label: "Furgón",       Icon: Boxes },
  { value: "pickup",    label: "Pickup",       Icon: Truck },
  { value: "car",       label: "Auto",         Icon: Car },
  { value: "motorcycle",label: "Motocicleta",  Icon: Bike },
  { value: "bike",      label: "Bicicleta",    Icon: Bike },
];


const STATUS_LABELS: Record<string, string> = {
  customs:      "Procesando en Costa Rica",
  route:        "En Ruta de Entrega",
  delivered:    "Entregado",
  returned:     "Devuelto",
  consolidated: "Consolidado",
  pickup:       "Retira en SmartLogistics",
  held:         "Retenido en Aduana",
  received:     "Recibido en Miami",
  transit:      "En Tránsito a Costa Rica",
  "pre-alerted":"Pre-Alertado",
  processed:    "Facturado",
};

const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "customs", label: "En Aduanas" },
  { value: "route", label: "En Ruta" },
  { value: "consolidated", label: "Consolidado" },
  { value: "held", label: "Retenido" },
  { value: "delivered", label: "Entregado" },
  { value: "returned", label: "Devuelto" },
];

const PKG_STATUS_COLORS: Record<string, string> = {
  route:        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  delivered:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  customs:      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  held:         "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  consolidated: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  pickup:       "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  returned:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  transit:      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "pre-alerted":"bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  processed:    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  received:     "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

// Maps legacy / SP2-variant status values → canonical SP1 keys
const LEGACY_STATUS_MAP: Record<string, string> = {
  on_route:          "route",
  en_route:          "route",
  en_ruta:           "route",
  "en ruta":         "route",
  in_customs:        "customs",
  en_aduana:         "customs",
  aduana:            "customs",
  aduanas:           "customs",
  "en aduanas":      "customs",
  retira:            "pickup",
  retira_en_sl:      "pickup",
  "retira en sl":    "pickup",
  entregado:         "delivered",
  devuelto:          "returned",
  retenido:          "held",
  consolidado:       "consolidated",
  facturado:         "processed",
  pre_alerted:       "pre-alerted",
  "pre alerted":     "pre-alerted",
};

function normalizeStatus(raw: string | undefined | null): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  return LEGACY_STATUS_MAP[lower] ?? raw;
}

// ── Route View Modal (real-time delivery monitor) ─────────────────────────

function RouteViewModal({
  route,
  onClose,
  onEdit,
}: {
  route: CatalogRoute;
  onClose: () => void;
  onEdit: (r: CatalogRoute) => void;
}) {
  const { data: pkgs = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['route-monitor', route.name],
    queryFn: async () => {
      const res = await firestoreApi.packages.list({
        filters: [{ field: 'ruta', op: '==', value: route.name }],
        orderByField: 'createdAt',
        orderDirection: 'desc',
        pageSize: 500,
      });
      const data = (res.data as any[]) ?? [];
      return data.map((pkg: any) => ({
        ...pkg,
        tracking: pkg.tracking || pkg.trackingNumber || pkg.id
      }));
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
  });

  const colors = getRouteColor(route.name);
  const allAreas = [...(route.cantons || []), ...(route.areas || [])];
  const routeVehicles = route.vehicles ?? [];
  const hasVehicles = routeVehicles.length > 0;

  const stats = useMemo(() => {
    const all = pkgs as any[];
    const total = all.length;
    const delivered = all.filter((p: any) => p.status === 'delivered').length;
    const inRoute = all.filter((p: any) => p.status === 'route').length;
    const returned = all.filter((p: any) => p.status === 'returned').length;
    const pending = total - delivered - returned;
    const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;

    const byStatus: Record<string, number> = {};
    all.forEach((p: any) => {
      const s = p.status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    return { total, delivered, inRoute, returned, pending, pct, byStatus };
  }, [pkgs]);

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <>
      {/* Header with gradient */}
      <div className={cn("p-5 bg-gradient-to-r text-white relative", colors.gradient)}>
        <DialogHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Route className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold text-white">{route.name}</DialogTitle>
              <DialogDescription className="text-white/70 text-sm mt-0.5">
                {route.province || '—'} &middot; {route.type === 'encomienda' ? 'Encomienda' : 'Metropolitana'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={cn("text-xs", route.status === 'active' ? "bg-white/20 text-white border-white/30" : "bg-black/20 text-white/70 border-white/20")}>
                {route.status === 'active' ? 'Activa' : 'Inactiva'}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        {/* Area badges + live indicator */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex flex-wrap gap-1.5">
            {allAreas.slice(0, 6).map((area) => (
              <span key={area} className="px-2 py-0.5 bg-white/15 text-white text-[10px] font-medium rounded-full">{area}</span>
            ))}
            {allAreas.length > 6 && (
              <span className="px-2 py-0.5 bg-white/25 text-white text-[10px] font-bold rounded-full">+{allAreas.length - 6}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-white/60 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            En vivo &middot; {lastUpdated}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 overflow-y-auto max-h-[calc(85vh-200px)] space-y-5">
        {/* ── Global Progress Bar ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Progreso de Entregas
            </h3>
            <span className="text-xs font-bold text-foreground">{stats.pct}%</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span><strong className="text-foreground">{stats.delivered}</strong> entregados</span>
            <span><strong className="text-blue-600">{stats.inRoute}</strong> en ruta</span>
            <span><strong className="text-amber-600">{stats.pending}</strong> pendientes</span>
            {stats.returned > 0 && <span><strong className="text-red-600">{stats.returned}</strong> devueltos</span>}
            <span className="ml-auto font-semibold">{stats.total} total</span>
          </div>
        </div>

        {/* ── Live Stats Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="border border-border rounded-xl p-3 text-center bg-card">
            <p className="text-2xl font-bold text-foreground">{isLoading ? '…' : stats.total}</p>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase mt-0.5">Total</p>
          </div>
          <div className="border border-border rounded-xl p-3 text-center bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
            <p className="text-2xl font-bold text-emerald-600">{isLoading ? '…' : stats.delivered}</p>
            <p className="text-[9px] font-semibold text-emerald-600 uppercase mt-0.5">Entregados</p>
          </div>
          <div className="border border-border rounded-xl p-3 text-center bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <p className="text-2xl font-bold text-blue-600">{isLoading ? '…' : stats.inRoute}</p>
            <p className="text-[9px] font-semibold text-blue-600 uppercase mt-0.5">En Ruta</p>
          </div>
          <div className="border border-border rounded-xl p-3 text-center bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <p className="text-2xl font-bold text-amber-600">{isLoading ? '…' : stats.pending}</p>
            <p className="text-[9px] font-semibold text-amber-600 uppercase mt-0.5">Pendientes</p>
          </div>
          <div className="border border-border rounded-xl p-3 text-center bg-card">
            <p className="text-2xl font-bold text-foreground">{hasVehicles ? routeVehicles.length : 0}</p>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase mt-0.5">Vehículos</p>
          </div>
        </div>

        {/* ── Vehicles / Drivers Section ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Flota y Choferes</h3>
            <span className="text-xs text-muted-foreground ml-auto">{hasVehicles ? `${routeVehicles.length} vehículos` : 'Sin vehículos asignados'}</span>
          </div>

          {hasVehicles ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {routeVehicles.map((v, idx) => {
                const VehicleIcon = VEHICLE_TYPES.find(vt => vt.value === v.type)?.Icon ?? Truck;
                const vehicleLabel = VEHICLE_TYPES.find(vt => vt.value === v.type)?.label ?? v.type;
                return (
                  <div key={idx} className="border border-border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br", colors.gradient)}>
                        <VehicleIcon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">{vehicleLabel}</p>
                        <p className="text-xs text-muted-foreground font-mono">{v.plate || 'Sin placa'}</p>
                      </div>
                      {v.capacity && (
                        <span className="text-[10px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                          {v.capacity} kg
                        </span>
                      )}
                    </div>
                    {/* Driver info */}
                    <div className="mt-3 pt-3 border-t border-border">
                      {v.driverId ? (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">{v.driverName || 'Chofer asignado'}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <CircleDot className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs text-muted-foreground">Sin chofer asignado</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-6 text-center">
              <Truck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No hay vehículos configurados. Edita la ruta para agregar vehículos y asignar choferes.</p>
            </div>
          )}
        </div>

        {/* ── Status Breakdown ── */}
        {Object.keys(stats.byStatus).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Desglose por Estado</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold", PKG_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground")}>
                    {STATUS_LABELS[status] ?? status}: {count}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Packages Table ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Paquetes en la Ruta</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {isLoading ? 'Cargando…' : `${stats.total} paquetes`}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-1.5">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : stats.total === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">No hay paquetes asignados a esta ruta</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Los paquetes aparecerán aquí cuando se asignen desde el módulo de despacho</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 px-4 py-2 bg-muted/50 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Tracking</span>
                <span>SL Code</span>
                <span>Cliente</span>
                <span>Chofer</span>
                <span>Estado</span>
                <span>Descripción</span>
              </div>
              <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
                {(pkgs as any[]).map((pkg: any) => (
                  <div key={pkg.id} className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 px-4 py-2 items-center text-xs hover:bg-muted/30 transition-colors">
                    <span className="font-mono font-semibold text-foreground truncate text-[11px]">{pkg.tracking ?? '—'}</span>
                    <span className="text-[11px] font-medium text-foreground truncate">{pkg.slCode ?? '—'}</span>
                    <span className="text-[11px] text-foreground truncate">{pkg.customerName ?? '—'}</span>
                    <span className="text-[11px] text-muted-foreground truncate italic">
                      {pkg.assignedDriverName ?? 'Sin asignar'}
                    </span>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap w-fit", PKG_STATUS_COLORS[pkg.status] ?? "bg-muted text-muted-foreground")}>
                      {STATUS_LABELS[pkg.status] ?? pkg.status ?? '—'}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">{pkg.description ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex justify-between items-center bg-muted/30">
        <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(route); }}>
          <Edit className="h-3.5 w-3.5 mr-1.5" />
          Editar Ruta
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </>
  );
}

/**
 * Parses the manifest creation timestamp from DD-MM-YYYY format strings for sorting.
 *
 * @param m - Manifest identifier string (e.g. "11-08-2026DAN")
 * @returns Millisecond timestamp or 0 if format is unrecognized
 */
const parseManifestDate = (m: string) => {
  if (!m) return 0;
  const match = m.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
  }
  return 0;
};

/**
 * Finds the corresponding invoice line item for a specific package tracking number.
 *
 * @param invoice - Invoice document or object
 * @param pkg - Package object containing tracking number
 * @returns Matching invoice item or null
 */
const getInvoiceItemForPackage = (invoice: any, pkg: any) => {
  if (!invoice) return null;
  const tracking = (pkg.tracking || '').toUpperCase().trim();
  const items = invoice.invoiceItems || invoice.items || [];
  return items.find((item: any) => {
    const itemTracking = (item.trackingNumber || item.tracking || '').toUpperCase().trim();
    return itemTracking === tracking;
  });
};

const InvoiceParentCheckbox = ({
  checked,
  indeterminate,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  ariaLabel?: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-3.5 w-3.5 rounded border-border accent-foreground self-center cursor-pointer"
      aria-label={ariaLabel}
    />
  );
};

/**
 * Resolves UI badge styling and localized label for invoice payment status.
 *
 * @param status - Invoice payment status string
 * @returns Object with label and CSS classes
 */
const getInvoiceStatusBadge = (status: string) => {
  const normalized = (status || '').toLowerCase().trim();
  switch (normalized) {
    case 'draft':
      return { label: 'Borrador', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/50' };
    case 'sent':
      return { label: 'Enviada', cls: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50' };
    case 'paid':
      return { label: 'Pagada', cls: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/50' };
    case 'overdue':
      return { label: 'Vencida', cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50' };
    case 'cancelled':
    case 'annulled':
      return { label: 'Anulada', cls: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-950/40 dark:text-gray-400 dark:border-gray-900/50' };
    default:
      return { label: status || 'Desconocido', cls: 'bg-muted text-muted-foreground border-border' };
  }
};

export default function RoutesManagement() {
  const { user } = useAuth();
  const { t } = useLocale(['routes', 'common']);
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const { canCreate, canUpdate, canDelete, canManage } = usePermissions();
  const qc = useQueryClient();

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"catalog" | "dispatch">("dispatch");

  const [tempWarningOpen, setTempWarningOpen] = useState(false);
  const [tempWarningPackages, setTempWarningPackages] = useState<any[]>([]);
  const [pendingPrintAction, setPendingPrintAction] = useState<(() => void) | null>(null);

  // ── Catalog state ─────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<CatalogRoute | null>(null);
  const [viewingRoute, setViewingRoute] = useState<CatalogRoute | null>(null);
  const [agentSearchOpen, setAgentSearchOpen] = useState(false);
  const [agentSearchValue, setAgentSearchValue] = useState("");

  const { data: routesResp, isLoading: catalogLoading } = useRoutes(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const { data: usersResp } = useUsers();
  const createRouteMutation = useCreateRoute();
  const updateRouteMutation = useUpdateRoute(editingRoute?.id ?? "");
  const deleteRouteMutation = useDeleteRoute();

  const catalogRoutes: CatalogRoute[] = (routesResp as any)?.data ?? [];

  const agents: Agent[] = useMemo(() => {
    const users = (usersResp as any[]) ?? [];
    return users
      .filter((u) => u.role === "AGENT" || u.role === "DELIVERY")
      .map((a) => ({ id: a.id, name: a.fullName || a.email }));
  }, [usersResp]);

  const emptyVehicle = (): RouteVehicle => ({ type: "van", plate: "", capacity: undefined, notes: "" });

  const initialFormData = {
    name: "",
    province: "Alajuela",
    type: "metropolitan" as "metropolitan" | "encomienda",
    color: "blue-600",
    status: "active" as "active" | "inactive",
    cantons: "" as string,
    areas: "" as string,
  };
  const [formData, setFormData] = useState(initialFormData);
  const [vehicles, setVehicles] = useState<RouteVehicle[]>([emptyVehicle()]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const filteredCatalog = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return catalogRoutes.filter(
      (r) =>
        (r.name ?? "").toLowerCase().includes(s) ||
        r.destinationLocation?.toLowerCase().includes(s) ||
        r.vehiclePlate?.toLowerCase().includes(s)
    );
  }, [catalogRoutes, searchTerm]);

  const getStatusColor = (status: "active" | "inactive") =>
    status === "active"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-gray-100 text-gray-600 border-gray-200";

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setVehicles([emptyVehicle()]);
    setSelectedAgents([]);
    setEditingRoute(null);
  }, []);

  const handleOpenEdit = useCallback((route: CatalogRoute) => {
    setEditingRoute(route);
    setFormData({
      name: route.name,
      province: route.province ?? "Alajuela",
      type: (route.type as "metropolitan" | "encomienda") ?? "metropolitan",
      color: route.color ?? "blue-600",
      status: route.status,
      cantons: (route.cantons || []).join(", "),
      areas: (route.areas || []).join(", "),
    });
    // Load vehicles: prefer new vehicles[] array, fall back to legacy single vehicle fields
    if (route.vehicles && route.vehicles.length > 0) {
      setVehicles(route.vehicles);
    } else if (route.vehiclePlate) {
      setVehicles([{ type: (route.vehicleType as VehicleType) ?? "van", plate: route.vehiclePlate }]);
    } else {
      setVehicles([emptyVehicle()]);
    }
    setSelectedAgents(route.assignedAgentId ? [route.assignedAgentId] : []);
    setShowCreateModal(true);
  }, []);

  const handleSaveRoute = async () => {
    if (!formData.name) {
      toast({ title: t("common.error"), description: "El nombre es requerido", variant: "destructive" });
      return;
    }
    try {
      const cleanVehicles = vehicles.filter((v) => v.plate.trim() !== "");
      const cantonsArray = formData.cantons.split(",").map(s => s.trim()).filter(Boolean);
      const areasArray = formData.areas.split(",").map(s => s.trim()).filter(Boolean);
      const payload = {
        name: formData.name,
        province: formData.province,
        type: formData.type,
        color: formData.color,
        status: formData.status,
        active: formData.status === "active",
        cantons: cantonsArray,
        areas: areasArray,
        vehicles: cleanVehicles,
        vehicleType: cleanVehicles[0]?.type ?? "van",
        vehiclePlate: cleanVehicles[0]?.plate ?? "",
        assignedAgentId: (selectedAgents[0] ?? null) as string | null,
      };
      if (editingRoute) {
        await updateRouteMutation.mutateAsync(payload);
        auditLog({ action: 'route_updated', category: 'route', result: 'success', resource: editingRoute.name, resourceId: editingRoute.id, metadata: { name: payload.name, status: payload.status } });
        toast({ title: t("common.success"), description: t("updateSuccess") });
      } else {
        await createRouteMutation.mutateAsync(payload);
        auditLog({ action: 'route_created', category: 'route', result: 'success', resource: payload.name, metadata: { type: payload.type, province: payload.province } });
        toast({ title: t("common.success"), description: t("createSuccess") });
      }
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      auditLog({ action: 'route_updated', category: 'route', result: 'error', resource: formData.name, errorMessage: err instanceof Error ? err.message : String(err) });
      toast({ title: t("common.error"), description: t("updateError"), variant: "destructive" });
    }
  };

  const handleDeleteRoute = useCallback(async (routeId: string) => {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await deleteRouteMutation.mutateAsync(routeId);
      toast({ title: t("common.success"), description: t("deleteSuccess") });
    } catch {
      toast({ title: t("common.error"), description: t("deleteError"), variant: "destructive" });
    }
  }, [deleteRouteMutation, toast, t]);

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }, []);

  // ── Route session state ────────────────────────────────────────────────────
  const [routeSession, setRouteSession]     = useState<RouteSession | null>(null);
  const [sessionCheckedIn, setSessionCheckedIn] = useState(false);
  const [showCheckIn, setShowCheckIn]       = useState(false);
  const [showCheckOut, setShowCheckOut]     = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [customerConsolidationMap, setCustomerConsolidationMap] = useState<Map<string, boolean>>(new Map());
  const [customerFeMap, setCustomerFeMap] = useState<Map<string, boolean>>(new Map());

  // ── Dispatch state ────────────────────────────────────────────────────────
  const [dispatchRoute, setDispatchRoute] = useState<CatalogRoute | null>(null);
  const [dispatchSearch, setDispatchSearch] = useState("");
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(new Set());
  const [isDispatching, setIsDispatching] = useState(false);
  const [isDownloadingGTI, setIsDownloadingGTI] = useState(false);
  const [gtiDialogOpen, setGtiDialogOpen] = useState(false);
  const [gtiLoadingDialog, setGtiLoadingDialog] = useState(false);
  const [gtiInvoices, setGtiInvoices] = useState<{ all: GTIInvoiceEntry[]; newOnly: GTIInvoiceEntry[] } | null>(null);
  const [gtiContactMap, setGtiContactMap] = useState<Map<string, any>>(new Map());
  const [gtiDownloadMode, setGtiDownloadMode] = useState<'all' | 'new'>('all');
  const [gtiDownloadFormat, setGtiDownloadFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [gtiCountMap, setGtiCountMap] = useState<Map<string, number>>(new Map());
  const [manifestWizardOpen, setManifestWizardOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [routeActionOptions, setRouteActionOptions] = useState<{
    syncSp2: boolean;
    markInvoicesPaid: boolean;
    syncInvoicesSp2: boolean;
    updateInvoices: boolean;
    invoiceStatus: 'sent' | 'paid';
  }>({
    syncSp2: true,
    markInvoicesPaid: false,
    syncInvoicesSp2: false,
    updateInvoices: false,
    invoiceStatus: 'sent',
  });
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const renderSortIcon = useCallback((field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />;
    }
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary shrink-0" />
      : <ArrowDown className="h-3 w-3 text-primary shrink-0" />;
  }, [sortField, sortOrder]);
  const [manifestFilter, setManifestFilter] = useState("");
  const [manifestOpen, setManifestOpen] = useState(false);
  const [printTc, setPrintTc] = useState(487);
  const [groupBy, setGroupBy] = useState<"invoice" | "none" | "customerName" | "slCode" | "manifestNumber">("invoice");
  const [viewingPkg, setViewingPkg] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'invoice'>('details');
  const [pkgInvoice, setPkgInvoice] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceStatusMap, setInvoiceStatusMap] = useState<Map<string, string>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Estados locales optimizados y en tiempo real para Manifiestos y Facturas
  const [manifestPackages, setManifestPackages] = useState<any[]>([]);
  const [manifestInvoices, setManifestInvoices] = useState<any[]>([]);

  // Load manifests list with page limit and caching
  const { data: manifestsQueryData } = useQuery({
    queryKey: ['manifests', 'list-routes'],
    queryFn: async () => {
      const result = await firestoreApi.manifests.list({
        pageSize: 150,
        orderByField: 'processedAt',
        orderDirection: 'desc',
      });
      return (result.data || []) as any[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const manifestsFullData = useMemo(() => {
    return manifestsQueryData || [];
  }, [manifestsQueryData]);

  const manifestCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (manifestsQueryData || []).forEach(d => {
      const id = d.id;
      if (typeof d.totalPackages === 'number') {
        counts.set(id, d.totalPackages);
      } else if (Array.isArray(d.packages)) {
        counts.set(id, d.packages.length);
      }
    });
    return counts;
  }, [manifestsQueryData]);

  const allManifestsList = useMemo(() => {
    const list = (manifestsQueryData || []).map(d => d.id).filter(Boolean);
    return list.sort((a, b) => {
      const da = parseManifestDate(a);
      const db = parseManifestDate(b);
      if (da !== db) return db - da;
      return b.localeCompare(a);
    });
  }, [manifestsQueryData]);

  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pkgsLoading, setPkgsLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const refetchPkgs = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // 2. Suscribirse a los paquetes del manifiesto seleccionado
  useEffect(() => {
    if (!manifestFilter) {
      setManifestPackages([]);
      setPkgsLoading(false);
      return;
    }
    setPkgsLoading(true);
    const searchTerms = [manifestFilter];
    const originalManifest = manifestsFullData?.find(
      m => (m.manifestNumber || m.id || '').trim() === manifestFilter || m.id?.trim() === manifestFilter
    );
    if (originalManifest) {
      const origVal = originalManifest.manifestNumber || originalManifest.id || '';
      if (origVal && !searchTerms.includes(origVal)) {
        searchTerms.push(origVal);
      }
    }
    const q = query(
      collection(db, 'packages'),
      where('manifestNumber', 'in', searchTerms)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            tracking: data.tracking || data.trackingNumber || d.id
          };
        });
        setManifestPackages(list);
        setPkgsLoading(false);
      },
      (err) => {
        console.error('[RoutesManagement] packages subscription error:', err);
        setPkgsLoading(false);
      }
    );
    return unsub;
  }, [manifestFilter, manifestsFullData, refreshTrigger]);

  // 3. Suscribirse a las facturas del manifiesto seleccionado (soportando facturas multi-manifiesto y devueltos)
  useEffect(() => {
    if (!manifestFilter) {
      setManifestInvoices([]);
      setInvoicesLoading(false);
      return;
    }
    setInvoicesLoading(true);
    const searchTerms = [manifestFilter];
    const originalManifest = manifestsFullData?.find(
      m => (m.manifestNumber || m.id || '').trim() === manifestFilter || m.id?.trim() === manifestFilter
    );
    if (originalManifest) {
      const origVal = originalManifest.manifestNumber || originalManifest.id || '';
      if (origVal && !searchTerms.includes(origVal)) {
        searchTerms.push(origVal);
      }
    }

    let q1Invs: any[] = [];
    let q2Invs: any[] = [];

    const mergeInvoices = () => {
      const invMap = new Map<string, any>();
      [...q1Invs, ...q2Invs].forEach(d => {
        invMap.set(d.id, { id: d.id, ...d.data() });
      });
      setManifestInvoices(Array.from(invMap.values()));
      setInvoicesLoading(false);
    };

    const q1 = query(
      collection(db, 'invoices'),
      where('manifestNumber', 'in', searchTerms)
    );
    const q2 = query(
      collection(db, 'invoices'),
      where('manifestNumbers', 'array-contains-any', searchTerms)
    );

    const unsub1 = onSnapshot(
      q1,
      (snap) => {
        q1Invs = snap.docs;
        mergeInvoices();
      },
      (err) => {
        console.error('[RoutesManagement] invoices q1 subscription error:', err);
        setInvoicesLoading(false);
      }
    );

    const unsub2 = onSnapshot(
      q2,
      (snap) => {
        q2Invs = snap.docs;
        mergeInvoices();
      },
      (err) => {
        console.error('[RoutesManagement] invoices q2 subscription error:', err);
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [manifestFilter, manifestsFullData, refreshTrigger]);

  const fetchedMissingInvoiceIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    fetchedMissingInvoiceIdsRef.current.clear();
  }, [manifestFilter]);

  // Cargar facturas referenciadas por paquetes del manifiesto (e.g. paquetes devueltos con factura propia)
  useEffect(() => {
    const missingIds = new Set<string>();
    manifestPackages.forEach((p: any) => {
      if (
        p.invoiceId &&
        !fetchedMissingInvoiceIdsRef.current.has(p.invoiceId) &&
        !manifestInvoices.some((inv: any) => inv.id === p.invoiceId)
      ) {
        missingIds.add(p.invoiceId);
      }
    });
    if (missingIds.size === 0) return;

    missingIds.forEach(id => fetchedMissingInvoiceIdsRef.current.add(id));

    let cancelled = false;
    Promise.all(Array.from(missingIds).map(id => getDoc(doc(db, 'invoices', id))))
      .then(snaps => {
        if (cancelled) return;
        const extraInvs = snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() }));
        if (extraInvs.length > 0) {
          setManifestInvoices(prev => {
            const map = new Map<string, any>(prev.map(i => [i.id, i]));
            extraInvs.forEach(i => map.set(i.id, i));
            return Array.from(map.values());
          });
        }
      })
      .catch(console.error);

    return () => { cancelled = true; };
  }, [manifestPackages, manifestInvoices]);

  // Alias de compatibilidad para evitar regresiones de código en el resto del archivo
  const routePackages = manifestPackages;
  const allPkgsForManifests = manifestPackages;
  const uniqueManifests = useMemo(() => {
    const set = new Set<string>();
    if (manifestFilter) set.add(manifestFilter.trim());
    manifestPackages.forEach(p => {
      const mn = (p.manifestNumber || p.manifiesto || '').trim();
      if (mn) set.add(mn);
    });
    return Array.from(set);
  }, [manifestPackages, manifestFilter]);
  const manifestPackageCounts = manifestCounts;

  const isMaritime = useMemo(() => {
    return manifestPackages.some((p: any) => p.isSeaFreight === true) ||
           manifestInvoices.some((inv: any) => inv.source === 'maritime');
  }, [manifestPackages, manifestInvoices]);

  const isActiveRoute = (r: any) =>
    r.status === "active" || r.status === "Active" || r.active === true || (!r.status && r.active !== false);

  const filteredRoutesList = useMemo(() => {
    const active = catalogRoutes.filter(isActiveRoute);
    if (!dispatchSearch) return active;
    const s = dispatchSearch.toLowerCase();
    return active.filter(
      (r) => r.name.toLowerCase().includes(s) || r.province?.toLowerCase().includes(s)
    );
  }, [catalogRoutes, dispatchSearch]);



  useEffect(() => {
    if (!uniqueManifests.length) { setInvoiceStatusMap(new Map()); return; }
    let cancelled = false;
    getInvoiceStatusesByManifests(uniqueManifests)
      .then(map => { if (!cancelled) setInvoiceStatusMap(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uniqueManifests]);

  useEffect(() => {
    if (!uniqueManifests.length) { setGtiCountMap(new Map()); return; }
    let cancelled = false;
    getGTICountsByManifests(uniqueManifests)
      .then(map => { if (!cancelled) setGtiCountMap(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uniqueManifests]);

  useEffect(() => {
    const slCodes = new Set<string>();
    (routePackages as any[]).forEach(p => {
      if (p.slCode) slCodes.add(p.slCode);
    });
    (allPkgsForManifests as any[]).forEach(p => {
      if (p.slCode) slCodes.add(p.slCode);
    });
    if (slCodes.size === 0) {
      setCustomerConsolidationMap(new Map());
      setCustomerFeMap(new Map());
      return;
    }
    
    let cancelled = false;
    getCustomersBySlCodes(Array.from(slCodes))
      .then(customers => {
        if (cancelled) return;
        const consolidationMap = new Map<string, boolean>();
        const feMap = new Map<string, boolean>();
        customers.forEach(c => {
          if (typeof c.consolidationEnabled === 'boolean') {
            consolidationMap.set(c.slCode, c.consolidationEnabled);
          }
          if (typeof c.electronicInvoiceRequired === 'boolean') {
            feMap.set(c.slCode, c.electronicInvoiceRequired);
          }
        });
        setCustomerConsolidationMap(consolidationMap);
        setCustomerFeMap(feMap);
      })
      .catch(() => {});
    
  }, [routePackages, allPkgsForManifests]);

  // Mapa de trackings a facturas en tiempo real
  const trackingToInvoiceMap = useMemo(() => {
    const map = new Map<string, any>();
    manifestInvoices.forEach(inv => {
      const items = inv.invoiceItems || inv.items || [];
      items.forEach((item: any) => {
        const t = (item.trackingNumber || item.tracking || '').toUpperCase().trim();
        if (t && inv.status !== 'cancelled' && inv.status !== 'annulled') {
          map.set(t, inv);
        }
      });
      const st = (inv.trackingNumber || inv.tracking || '').toUpperCase().trim();
      if (st && inv.status !== 'cancelled' && inv.status !== 'annulled') {
        map.set(st, inv);
      }
    });
    return map;
  }, [manifestInvoices]);

  // Map of invoiceId -> invoice for O(1) direct lookup
  const invoiceIdMap = useMemo(() => {
    const map = new Map<string, any>();
    manifestInvoices.forEach(inv => {
      map.set(inv.id, inv);
    });
    return map;
  }, [manifestInvoices]);

  const getPackageInvoice = useCallback((pkg: any) => {
    const t = (pkg.tracking || '').toUpperCase().trim();
    if (t && trackingToInvoiceMap.has(t)) {
      return trackingToInvoiceMap.get(t);
    }
    if (pkg.invoiceId && invoiceIdMap.has(pkg.invoiceId)) {
      return invoiceIdMap.get(pkg.invoiceId);
    }
    return null;
  }, [invoiceIdMap, trackingToInvoiceMap]);

  const filteredPkgs = useMemo(() => {
    let pkgs = manifestPackages as any[];
    if (dispatchRoute) {
      pkgs = pkgs.filter(p => p.ruta === dispatchRoute.name);
    } else {
      return [];
    }
    if (dispatchStatusFilter) {
      pkgs = pkgs.filter(p => normalizeStatus(p.status) === dispatchStatusFilter);
    }
    if (!tableFilter) return pkgs;
    const s = tableFilter.toLowerCase();
    return pkgs.filter(
      (p) =>
        p.tracking?.toLowerCase().includes(s) ||
        p.slCode?.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s) ||
        p.customerName?.toLowerCase().includes(s)
    );
  }, [manifestPackages, dispatchRoute, dispatchStatusFilter, tableFilter]);

  const sortedPkgs = useMemo(() => {
    if (!sortField) return filteredPkgs;
    
    return [...filteredPkgs].sort((a: any, b: any) => {
      let valA: any = '';
      let valB: any = '';
      
      if (sortField === 'tracking') {
        valA = a.tracking || '';
        valB = b.tracking || '';
      } else if (sortField === 'manifest') {
        valA = a.manifestNumber || a.manifiesto || '';
        valB = b.manifestNumber || b.manifiesto || '';
      } else if (sortField === 'slCode') {
        valA = a.slCode || '';
        valB = b.slCode || '';
      } else if (sortField === 'client') {
        valA = a.customerName || '';
        valB = b.customerName || '';
      } else if (sortField === 'description') {
        valA = a.description || '';
        valB = b.description || '';
      } else if (sortField === 'weight') {
        valA = a.weight || 0;
        valB = b.weight || 0;
      } else if (sortField === 'amount') {
        const invA = getPackageInvoice(a);
        const invB = getPackageInvoice(b);
        valA = invA?.totalAmount ?? a.totalAmount ?? 0;
        valB = invB?.totalAmount ?? b.totalAmount ?? 0;
      } else if (sortField === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      }
      
      if (typeof valA === 'string') {
        return sortOrder === 'asc' 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc'
          ? (valA > valB ? 1 : valA < valB ? -1 : 0)
          : (valB > valA ? 1 : valB < valA ? -1 : 0);
      }
    });
  }, [filteredPkgs, sortField, sortOrder, getPackageInvoice]);

  const routeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    manifestPackages.forEach(p => {
      const r = p.ruta;
      if (r) {
        counts.set(r, (counts.get(r) || 0) + 1);
      }
    });
    return counts;
  }, [manifestPackages]);

  // Auto-detect dominant TC from loaded packages
  useEffect(() => {
    const rates = (routePackages as any[])
      .map(p => Number(p.exchangeRate))
      .filter(r => r > 0);
    if (!rates.length) return;
    const freq: Record<number, number> = {};
    rates.forEach(r => { freq[r] = (freq[r] ?? 0) + 1; });
    const dominant = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    if (dominant > 0) setPrintTc(dominant);
  }, [routePackages]);

  useEffect(() => {
    // Keep manifest filter active across route changes per customer feedback
    setTableFilter("");
    setSelectedPkgs(new Set());
    setCurrentPage(1);
  }, [dispatchRoute?.id]);

  useEffect(() => {
    setSelectedPkgs(new Set());
    setCurrentPage(1);
  }, [dispatchStatusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [groupBy]);

  const tcMismatchCount = useMemo(() => {
    return (filteredPkgs as any[]).filter(p => {
      const r = Number(p.exchangeRate);
      return r > 0 && r !== printTc;
    }).length;
  }, [filteredPkgs, printTc]);

  const totalCount = useMemo(() => {
    if (groupBy === "invoice") {
      const groupedIds = new Set<string>();
      let hasUninvoiced = false;
      filteredPkgs.forEach(pkg => {
        const inv = getPackageInvoice(pkg);
        if (inv) {
          groupedIds.add(inv.id);
        } else {
          hasUninvoiced = true;
        }
      });
      return groupedIds.size + (hasUninvoiced ? 1 : 0);
    } else if (groupBy === "none") {
      return filteredPkgs.length;
    } else {
      const map = new Map<string, any[]>();
      filteredPkgs.forEach(p => {
        const key = groupBy === "customerName" ? (p.customerName || "Sin nombre")
          : groupBy === "slCode" ? (p.slCode || "Sin SL Code")
          : (p.manifestNumber || p.manifiesto || "Sin manifiesto");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      });
      let count = 0;
      map.forEach(items => {
        count += 1 + items.length;
      });
      return count;
    }
  }, [filteredPkgs, groupBy, getPackageInvoice]);

  const invoicesCount = useMemo(() => {
    const groupedIds = new Set<string>();
    filteredPkgs.forEach(pkg => {
      const inv = getPackageInvoice(pkg);
      if (inv) {
        groupedIds.add(inv.id);
      }
    });
    return groupedIds.size;
  }, [filteredPkgs, getPackageInvoice]);

  type FlatItem =
    | { type: 'header'; key: string; count: number; totalUSD: number; totalCRC: number }
    | { type: 'invoice-parent'; id: string; invoice: any; pkgs: any[]; isExpanded: boolean }
    | { type: 'invoice-child'; pkg: any; invoice: any }
    | { type: 'row'; pkg: any };

  const flatList = useMemo((): FlatItem[] => {
    const pkgs = sortedPkgs as any[];

    if (groupBy === "invoice") {
      const parents: Array<{ id: string; invoice: any; pkgs: any[]; isExpanded: boolean }> = [];
      const grouped = new Map<string, { invoice: any; pkgs: any[] }>();
      const uninvoiced: any[] = [];

      pkgs.forEach(pkg => {
        const inv = getPackageInvoice(pkg);
        if (inv) {
          const key = inv.id;
          if (!grouped.has(key)) {
            grouped.set(key, { invoice: inv, pkgs: [] });
          }
          grouped.get(key)!.pkgs.push(pkg);
        } else {
          uninvoiced.push(pkg);
        }
      });

      // Ordenar facturas por número de factura o campo seleccionado
      Array.from(grouped.entries())
        .sort((a, b) => {
          if (!sortField) {
            return (a[1].invoice.invoiceNumber || a[0]).localeCompare(b[1].invoice.invoiceNumber || b[0]);
          }
          
          let valA: any = '';
          let valB: any = '';
          
          if (sortField === 'tracking') {
            valA = a[1].invoice.invoiceNumber || a[0];
            valB = b[1].invoice.invoiceNumber || b[0];
          } else if (sortField === 'manifest') {
            valA = a[1].invoice.manifestNumber || '';
            valB = b[1].invoice.manifestNumber || '';
          } else if (sortField === 'slCode') {
            valA = a[1].invoice.slCode || '';
            valB = b[1].invoice.slCode || '';
          } else if (sortField === 'client') {
            valA = a[1].invoice.clientName || '';
            valB = b[1].invoice.clientName || '';
          } else if (sortField === 'description') {
            valA = a[1].pkgs.length;
            valB = b[1].pkgs.length;
          } else if (sortField === 'weight') {
            valA = a[1].pkgs.reduce((sum: number, p: any) => sum + (p.weight || 0), 0);
            valB = b[1].pkgs.reduce((sum: number, p: any) => sum + (p.weight || 0), 0);
          } else if (sortField === 'amount') {
            valA = a[1].invoice.totalAmount ?? 0;
            valB = b[1].invoice.totalAmount ?? 0;
          } else if (sortField === 'status') {
            valA = a[1].invoice.status || '';
            valB = b[1].invoice.status || '';
          }
          
          if (typeof valA === 'string') {
            return sortOrder === 'asc' 
              ? valA.localeCompare(valB)
              : valB.localeCompare(valA);
          } else {
            return sortOrder === 'asc'
              ? (valA > valB ? 1 : valA < valB ? -1 : 0)
              : (valB > valA ? 1 : valB < valA ? -1 : 0);
          }
        })
        .forEach(([id, group]) => {
          parents.push({
            id,
            invoice: group.invoice,
            pkgs: group.pkgs,
            isExpanded: expandedInvoices.has(id),
          });
        });

      // Agregar grupo de paquetes sin facturar al final si existen
      if (uninvoiced.length > 0) {
        parents.push({
          id: 'uninvoiced',
          invoice: null,
          pkgs: uninvoiced,
          isExpanded: expandedInvoices.has('uninvoiced'),
        });
      }

      // Paginación de las filas padre
      const paginatedParents = parents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      const result: FlatItem[] = [];
      paginatedParents.forEach(parent => {
        result.push({
          type: 'invoice-parent',
          id: parent.id,
          invoice: parent.invoice,
          pkgs: parent.pkgs,
          isExpanded: parent.isExpanded,
        });

        if (parent.isExpanded) {
          parent.pkgs.forEach(pkg => {
            if (parent.invoice) {
              result.push({ type: 'invoice-child', pkg, invoice: parent.invoice });
            } else {
              result.push({ type: 'row', pkg });
            }
          });
        }
      });
      return result;
    }

    if (groupBy === "none") {
      const items = pkgs.map(p => ({ type: 'row' as const, pkg: p }));
      return items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }

    // Agrupamiento tradicional por otros campos
    const map = new Map<string, any[]>();
    pkgs.forEach(p => {
      const key = groupBy === "customerName" ? (p.customerName || "Sin nombre")
        : groupBy === "slCode" ? (p.slCode || "Sin SL Code")
        : (p.manifestNumber || p.manifiesto || "Sin manifiesto");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });

    const unpaginatedList: FlatItem[] = [];
    Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, items]) => {
        const totalUSD = items.reduce((s, p) => s + Number(p.price ?? p.cost ?? p.value ?? 0), 0);
        unpaginatedList.push({ type: 'header', key, count: items.length, totalUSD, totalCRC: Math.round(totalUSD * printTc) });
        items.forEach(p => unpaginatedList.push({ type: 'row', pkg: p }));
      });

    return unpaginatedList.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [sortedPkgs, groupBy, printTc, expandedInvoices, currentPage, pageSize, sortField, sortOrder, getPackageInvoice]);

  const visiblePkgsOnPage = useMemo(() => {
    const pkgs: any[] = [];
    flatList.forEach(item => {
      if (item.type === 'row' || item.type === 'invoice-child') {
        pkgs.push(item.pkg);
      }
    });
    return pkgs;
  }, [flatList]);

  const pageAllPackages = useMemo(() => {
    const pkgs: any[] = [];
    flatList.forEach(item => {
      if (item.type === 'invoice-parent') {
        pkgs.push(...item.pkgs);
      } else if (item.type === 'row') {
        pkgs.push(item.pkg);
      }
    });
    return pkgs;
  }, [flatList]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleViewInvoiceDirectly = useCallback((invoice: any) => {
    setViewingPkg({ tracking: invoice.trackingNumber || invoice.id, customerName: invoice.clientName, slCode: invoice.slCode });
    setViewMode('invoice');
    setPkgInvoice(invoice);
  }, []);

  const handleViewPkgDetails = useCallback((pkg: any) => {
    setViewingPkg(pkg);
    setViewMode('details');
    setPkgInvoice(null);
  }, []);

  const handleViewPkgInvoice = useCallback(async (pkg: any) => {
    setViewingPkg(pkg);
    setViewMode('invoice');
    setPkgInvoice(null);
    setInvoiceLoading(true);
    try {
      const results = await getInvoiceByTracking(pkg.tracking || pkg.id || '');
      const inv = results[0] ?? null;
      setPkgInvoice(inv);
      if (inv) {
        const t = (pkg.tracking ?? '').toUpperCase();
        if (t) setInvoiceStatusMap(prev => new Map(prev).set(t, (inv.status as string) || 'draft'));
      }
    } catch {
      setPkgInvoice(null);
    } finally {
      setInvoiceLoading(false);
    }
  }, []);

  // When route changes, look for an existing open session or prompt check-in
  useEffect(() => {
    if (!dispatchRoute || !user) {
      setRouteSession(null);
      setSessionCheckedIn(false);
      setShowCheckIn(false);
      return;
    }
    let cancelled = false;
    setCheckingSession(true);
    getActiveSession(dispatchRoute.id, user.id)
      .then(session => {
        if (cancelled) return;
        if (session) {
          setRouteSession(session);
          setSessionCheckedIn(true);
        } else {
          setRouteSession(null);
          setSessionCheckedIn(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionCheckedIn(true);
      })
      .finally(() => { if (!cancelled) setCheckingSession(false); });
    return () => { cancelled = true; };
  }, [dispatchRoute?.id, user?.id]);

  const handleCheckInComplete = useCallback(async (sessionId: string) => {
    const { getRouteSession } = await import('@/lib/services/route-session-service');
    const session = await getRouteSession(sessionId);
    setRouteSession(session);
    setSessionCheckedIn(true);
    setShowCheckIn(false);
  }, []);

  const handleSkipCheckIn = useCallback(() => {
    setSessionCheckedIn(true);
    setShowCheckIn(false);
    if (dispatchRoute && user) {
      import('@/lib/services/route-session-service').then(({ createRouteSession, getRouteSession }) => {
        const sessionData = {
          routeId:       dispatchRoute.id,
          routeName:     dispatchRoute.name,
          driverId:      user.id,
          driverName:    (user as any).fullName || user.email,
          vehiclePlate:  '',
          startKm:       0,
          packages:      [] as RouteSessionPackage[],
          totalPackages: 0,
          totalWeight:   0,
          cashToCollect: 0,
          cashCurrency:  'CRC',
          status:        'open' as const,
          skippedCheckIn: true,
          skippedBy:     (user as any).fullName || user.email,
          startAt:       new Date().toISOString(),
        };
        createRouteSession(sessionData)
          .then((id: string) => getRouteSession(id))
          .then((s: RouteSession | null) => { if (s) setRouteSession(s); })
          .catch(() => {});
      });
    }
  }, [dispatchRoute, user]);

  const handleCheckOutComplete = useCallback(() => {
    setShowCheckOut(false);
    setRouteSession(null);
    setSessionCheckedIn(false);
    setDispatchRoute(null);
    setSelectedPkgs(new Set());
  }, []);

  const handleTogglePkg = useCallback((id: string) => {
    setSelectedPkgs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleInvoice = useCallback((id: string, pkgs: any[]) => {
    setSelectedPkgs(prev => {
      const next = new Set(prev);
      const pkgIds = pkgs.map(p => p.id);
      const isAllSelected = pkgIds.length > 0 && pkgIds.every(pId => next.has(pId));
      if (isAllSelected) {
        pkgIds.forEach(pId => next.delete(pId));
      } else {
        pkgIds.forEach(pId => next.add(pId));
      }
      return next;
    });
  }, []);

  const toggleInvoiceExpand = useCallback((id: string) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const pagePkgIds = useMemo(() => pageAllPackages.map(p => p.id), [pageAllPackages]);
  const isAllPageSelected = useMemo(() => {
    return pagePkgIds.length > 0 && pagePkgIds.every(id => selectedPkgs.has(id));
  }, [pagePkgIds, selectedPkgs]);

  const handleSelectPage = useCallback(() => {
    setSelectedPkgs(prev => {
      const next = new Set(prev);
      if (isAllPageSelected) {
        pagePkgIds.forEach(id => next.delete(id));
      } else {
        pagePkgIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [isAllPageSelected, pagePkgIds]);

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedPkgs(new Set((filteredPkgs as any[]).map(p => p.id)));
  }, [filteredPkgs]);

  const handleClearSelection = useCallback(() => {
    setSelectedPkgs(new Set());
  }, []);

  const handleCopy = useCallback((tracking: string) => {
    navigator.clipboard.writeText(tracking);
    setCopiedTracking(tracking);
    setTimeout(() => setCopiedTracking(null), 1500);
  }, []);

  const buildRouteManifestResult = useCallback((): ProcessingResult | null => {
    const pkgsToBuild = selectedPkgs.size > 0
      ? (filteredPkgs as any[]).filter(p => selectedPkgs.has(p.id))
      : (filteredPkgs as any[]);
    if (!pkgsToBuild.length) return null;
    const manifestNum = manifestFilter || pkgsToBuild[0]?.manifestNumber || pkgsToBuild[0]?.manifiesto || '';
    const rows: ManifestRow[] = pkgsToBuild.map((p: any) => {
      const peso = Number(p.weight ?? p.peso ?? 0);
      const precio = Number(p.price ?? p.cost ?? p.value ?? 0);
      return {
        tracking:           p.tracking ?? '',
        nombre:             p.customerName ?? '',
        guia:               p.guia ?? p.tracking ?? '',
        manifiesto:         p.manifestNumber || p.manifiesto || manifestNum,
        peso,
        pesoRedondeo:       peso,
        diferenciaRedondeo: 0,
        pesoConsolidacion:  0,
        precioSinPermiso:   precio,
        precioConPermiso:   precio,
        precio,
        slCode:             p.slCode ?? '',
        nombreCliente:      p.customerName ?? '',
        ruta:               p.ruta ?? dispatchRoute?.name ?? '',
        consolidacion:      !!(p.consolidacion ?? p.isConsolidation),
        permisos:           !!(p.requiresPermit ?? p.permisos),
        descripcion:        p.description ?? p.descripcion ?? '',
        matchScore:         1,
        originalData:       {},
      };
    });
    return {
      rows,
      summary: {
        totalRows: rows.length,
        processedRows: rows.filter(r => r.slCode).length,
        customersMatched: new Set(rows.map(r => r.slCode).filter(Boolean)).size,
        totalPrice: rows.reduce((s, r) => s + r.precio, 0),
        errors: 0,
        namesCorrections: 0,
        weightCorrections: 0,
      },
      manifestNumber: manifestNum,
      manifestType: 'usa_air',
      corrections: [],
      validation: { isValid: true, issues: [], suggestions: [] },
      multiMatchRows: [],
      requiresUserChoice: false,
    };
  }, [selectedPkgs, filteredPkgs, manifestFilter, dispatchRoute]);

  const handleDownloadRouteManifestCSV = useCallback(() => {
    const result = buildRouteManifestResult();
    if (!result) return;
    downloadManifestCSV(result);
  }, [buildRouteManifestResult]);

  const handleDownloadRouteManifestXLSX = useCallback(() => {
    const result = buildRouteManifestResult();
    if (!result) return;
    downloadManifestXLSX(result);
  }, [buildRouteManifestResult]);

  const executePrintRouteManifest = useCallback(async () => {
    const pkgsToPrint = selectedPkgs.size > 0
      ? (filteredPkgs as any[]).filter(p => selectedPkgs.has(p.id))
      : (filteredPkgs as any[]);
    if (!pkgsToPrint.length) return;

    // Abrir ventana síncronamente para que no la bloquee el navegador
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      toast({ title: t('common.error'), description: "Bloqueador de ventanas emergentes activado", variant: "destructive" });
      return;
    }
    
    // UI de carga mientras obtenemos clientes (super reactivo)
    win.document.write(`
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
        <h2>Cargando manifiesto, por favor espere...</h2>
      </div>
    `);

    try {
      // Extraer SL Codes únicos y traer clientes directo desde DB
      const slCodes = Array.from(new Set(pkgsToPrint.map(p => p.slCode).filter(Boolean)));
      const customers = await getCustomersBySlCodes(slCodes as string[]);
      const customerMap = new Map();
      customers.forEach(c => customerMap.set(c.slCode, c));

      const manifestNum = manifestFilter || pkgsToPrint[0]?.manifestNumber || pkgsToPrint[0]?.manifiesto || '';
      const rows: RouteManifestRow[] = pkgsToPrint.map(p => {
        const c = customerMap.get(p.slCode);
        // Prioridad super reactiva al customer config actual
        const isConsolidado = c && typeof c.consolidationEnabled === 'boolean' 
          ? c.consolidationEnabled 
          : (p.consolidacion ?? p.isConsolidation ?? false);

        const pkgInvoice = getPackageInvoice(p);
        const invItem = pkgInvoice ? getInvoiceItemForPackage(pkgInvoice, p) : null;
        const priceUSD = invItem
          ? Number(invItem.unitPrice ?? invItem.totalPrice ?? invItem.amount ?? 0)
          : Number(p.price ?? p.precio ?? p.cost ?? p.value ?? 0);

        // A package is ONLY returned if it was truly in the returns workflow (has returnReason, returnedAt, isReturned, wasReturned)
        const isReturned = Boolean(
          p.isReturned === true ||
          p.wasReturned === true ||
          !!p.returnedAt ||
          !!p.returnReason ||
          p.status === 'returned' ||
          p.deliveryStatus === 'returned'
        );

        const originManifest = isReturned
          ? (p.originalManifest || p.originManifest || p.manifiestoOrigen || (p.updatedManifest && p.manifestNumber && p.updatedManifest !== p.manifestNumber ? p.manifestNumber : undefined) || p.manifestNumber)
          : undefined;

        return {
          slCode:        p.slCode ?? '',
          customerName:  p.customerName ?? '',
          manifestName:  p.manifestNumber || p.manifiesto || '',
          tracking:      p.tracking ?? '',
          price:         priceUSD,
          descripcion:   p.description ?? p.descripcion ?? '',
          peso:          Number(p.weight ?? p.peso ?? 0),
          consolidacion: isConsolidado,
          permisos:      !!(p.requiresPermit || p.permisos),
          invoiceId:     pkgInvoice?.id || p.invoiceId,
          invoiceNumber: pkgInvoice?.invoiceNumber || p.invoiceNumber,
          invoiceAmountUSD: pkgInvoice?.totalAmount ?? pkgInvoice?.amount ?? pkgInvoice?.subtotal,
          invoiceAmountCRC: pkgInvoice?.amountCRC ?? pkgInvoice?.totalAmountCRC,
          isReturned:    isReturned,
          isReassigned:  p.isReassigned === true,
          originManifest: originManifest,
        };
      });

      const html = buildRouteManifestHTML(rows, dispatchRoute?.name ?? '', manifestNum, printTc);
      
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    } catch (err) {
      win.document.open();
      win.document.write(`
        <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; color:red;">
          <h2>Error al generar el manifiesto de ruta</h2>
        </div>
      `);
      win.document.close();
      console.error("Error building route manifest:", err);
    }
  }, [selectedPkgs, filteredPkgs, dispatchRoute, manifestFilter, printTc, getPackageInvoice, toast, t]);

  const handlePrintRouteManifest = useCallback(() => {
    const pkgsToPrint = selectedPkgs.size > 0
      ? (filteredPkgs as any[]).filter(p => selectedPkgs.has(p.id))
      : (filteredPkgs as any[]);
    
    const orphans = pkgsToPrint.filter(p => isOrphanSlCode(p.slCode));
    if (orphans.length > 0) {
      setTempWarningPackages(orphans);
      setPendingPrintAction(() => executePrintRouteManifest);
      setTempWarningOpen(true);
      return;
    }
    executePrintRouteManifest();
  }, [selectedPkgs, filteredPkgs, executePrintRouteManifest]);

  const executePrintBoleta = useCallback(async () => {
    const pkgsToPrint = selectedPkgs.size > 0
      ? (filteredPkgs as any[]).filter(p => selectedPkgs.has(p.id))
      : (filteredPkgs as any[]);
    if (!pkgsToPrint.length) {
      toast({
        title: "No hay paquetes",
        description: "No hay paquetes seleccionados o filtrados para imprimir.",
        variant: "destructive",
      });
      return;
    }

    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) {
      toast({
        title: "Ventana bloqueada",
        description: "El navegador bloqueó la ventana de impresión. Por favor, permita ventanas emergentes.",
        variant: "destructive",
      });
      return;
    }

    win.document.write(`
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
        <h2>Generando Boleta de Bodega...</h2>
      </div>
    `);

    try {
      const slCodes = Array.from(new Set(pkgsToPrint.map(p => p.slCode).filter(Boolean)));
      const customers = await getCustomersBySlCodes(slCodes as string[]);
      const customerMap = new Map();
      customers.forEach(c => customerMap.set(c.slCode, c));

      const rows: BoletaPrintRow[] = pkgsToPrint.map(p => {
        const c = customerMap.get(p.slCode);
        const isConsolidado = c && typeof c.consolidationEnabled === 'boolean' 
          ? c.consolidationEnabled 
          : (p.consolidacion ?? p.isConsolidation ?? false);

        return {
          slCode:       p.slCode ?? '',
          customerName: p.customerName ?? '',
          manifestName: p.manifestNumber || p.manifiesto || '',
          tracking:     p.tracking ?? '',
          ruta:         p.ruta ?? dispatchRoute?.name ?? '',
          consolidacion: isConsolidado,
          permisos:      !!(p.requiresPermit || p.permisos),
        };
      });

      // Sort: ruta (empty last) → customerName A-Z (sistema) → slCode as tiebreaker
      rows.sort((a, b) => {
        if (!a.ruta && b.ruta) return 1;
        if (a.ruta && !b.ruta) return -1;
        if (a.ruta !== b.ruta) return a.ruta.localeCompare(b.ruta, 'es', { sensitivity: 'base' });
        const nameCmp = a.customerName.localeCompare(b.customerName, 'es', { sensitivity: 'base' });
        if (nameCmp !== 0) return nameCmp;
        return a.slCode.localeCompare(b.slCode);
      });

      const manifestNum = manifestFilter || pkgsToPrint[0]?.manifestNumber || pkgsToPrint[0]?.manifiesto || '';
      const html = buildBoletaHTML(rows, manifestNum);
      
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    } catch (err) {
      win.document.open();
      win.document.write(`
        <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; color:red;">
          <h2>Error al generar la Boleta de Bodega</h2>
        </div>
      `);
      win.document.close();
      console.error("Error building boleta manifest:", err);
    }
  }, [selectedPkgs, filteredPkgs, dispatchRoute, manifestFilter, toast]);

  const handlePrintBoleta = useCallback(() => {
    const pkgsToPrint = selectedPkgs.size > 0
      ? (filteredPkgs as any[]).filter(p => selectedPkgs.has(p.id))
      : (filteredPkgs as any[]);

    const orphans = pkgsToPrint.filter(p => isOrphanSlCode(p.slCode));
    if (orphans.length > 0) {
      setTempWarningPackages(orphans);
      setPendingPrintAction(() => executePrintBoleta);
      setTempWarningOpen(true);
      return;
    }
    executePrintBoleta();
  }, [selectedPkgs, filteredPkgs, executePrintBoleta]);

  const BATCH = 50;
  const runBulkUpdate = useCallback(async (
    status: string,
    extra: Record<string, any>,
    opts: { syncSp2?: boolean; markInvoicesPaid?: boolean; syncInvoicesSp2?: boolean; updateInvoices?: boolean; invoiceStatus?: string } = {},
  ) => {
    const syncToSP2 = opts.syncSp2 !== false;
    if (selectedPkgs.size === 0) return;
    setIsDispatching(true);
    setConfirmAction(null);

    // ── RETURNED STATUS LOCK GUARD ────────────────────────────────────────────
    // Filter out packages in returned state so bulk route actions (e.g. marking
    // an entire route delivered) do not accidentally regress returned items.
    const eligiblePkgs = (filteredPkgs as any[]).filter(
      p => selectedPkgs.has(p.id) && p.status !== 'returned' && p.deliveryStatus !== 'returned'
    );
    const ids = eligiblePkgs.map(p => p.id);
    if (ids.length === 0) {
      setIsDispatching(false);
      return;
    }

    try {
      const batchId = `bulk_${status}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batchResult = await firebaseApi.packages.bulkUpdateStatus(
          ids.slice(i, i + BATCH),
          status,
          {
            ...extra,
            statusLockedAt: new Date().toISOString(),
            manuallyUpdated: true,
            statusLabel: STATUS_LABELS[status] ?? status,
          }
        );
        if (!batchResult.success) {
          throw new Error(batchResult.error || 'Error al actualizar paquetes en el servidor');
        }
        if (i + BATCH < ids.length) await new Promise((r) => setTimeout(r, 100));
      }

      // For non-delivered statuses — optionally update related invoice status
      let invoicesUpdated = 0;
      const updatedNonDeliveredInvoiceIds: string[] = [];
      const updatedNonDeliveredInvoiceNumbers: string[] = [];
      if (status !== 'delivered' && opts.updateInvoices && opts.invoiceStatus) {
        const trackings = (filteredPkgs as any[])
          .filter(p => selectedPkgs.has(p.id))
          .map(p => (p.tracking || '').toUpperCase())
          .filter(Boolean);
        if (trackings.length) {
          const result = await updateInvoiceStatusForTrackings(trackings, opts.invoiceStatus);
          invoicesUpdated = result.count;
          result.updatedInvoices.forEach(inv => {
            updatedNonDeliveredInvoiceIds.push(inv.id);
            if (inv.invoiceNumber) {
              updatedNonDeliveredInvoiceNumbers.push(inv.invoiceNumber);
            }
          });
          if (opts.syncSp2) {
            result.updatedInvoices.forEach(inv => {
              pushStatusToSp2(inv.id, inv.invoiceNumber ?? inv.id, opts.invoiceStatus!)
                .then(() => {
                  auditLog({
                    action: 'invoice_updated',
                    category: 'invoice',
                    result: 'success',
                    resource: inv.invoiceNumber ?? inv.id,
                    resourceId: inv.id,
                    metadata: {
                      status: opts.invoiceStatus,
                      source: 'routes_update_bulk',
                      parentBatchId: batchId
                    }
                  });
                })
                .catch((err) => {
                  auditLog({
                    action: 'invoice_updated',
                    category: 'invoice',
                    result: 'error',
                    resource: inv.invoiceNumber ?? inv.id,
                    resourceId: inv.id,
                    errorMessage: err instanceof Error ? err.message : String(err),
                    metadata: {
                      status: opts.invoiceStatus,
                      source: 'routes_update_bulk',
                      parentBatchId: batchId
                    }
                  });
                });
            });
          }
        }
      }

      // When marking as delivered, also mark associated invoices as paid (if enabled)
      let invoicesPaid = 0;
      const updatedInvoiceIds: string[] = [];
      const updatedInvoiceNumbers: string[] = [];
      let syncSp2InvoicesAttempted = false;

      if (status === 'delivered' && (opts.markInvoicesPaid ?? false)) {
        const trackings = (filteredPkgs as any[])
          .filter(p => selectedPkgs.has(p.id))
          .map(p => (p.tracking || '').toUpperCase())
          .filter(Boolean);
        if (trackings.length) {
          const paidResult = await markInvoicesAsPaidForTrackings(trackings);
          invoicesPaid = paidResult.count;
          paidResult.updatedInvoices.forEach(inv => {
            updatedInvoiceIds.push(inv.id);
            if (inv.invoiceNumber) {
              updatedInvoiceNumbers.push(inv.invoiceNumber);
            }
          });

          // Push `paid` status to SP2 for each updated invoice (fire-and-forget)
          if (opts.syncInvoicesSp2 ?? false) {
            syncSp2InvoicesAttempted = true;
            paidResult.updatedInvoices.forEach(inv => {
              pushStatusToSp2(inv.id, inv.invoiceNumber ?? inv.id, 'paid')
                .then(() => {
                  auditLog({
                    action: 'invoice_updated',
                    category: 'invoice',
                    result: 'success',
                    resource: inv.invoiceNumber ?? inv.id,
                    resourceId: inv.id,
                    metadata: {
                      status: 'paid',
                      source: 'routes_delivery_bulk',
                      parentBatchId: batchId
                    }
                  });
                })
                .catch((err) => {
                  auditLog({
                    action: 'invoice_updated',
                    category: 'invoice',
                    result: 'error',
                    resource: inv.invoiceNumber ?? inv.id,
                    resourceId: inv.id,
                    errorMessage: err instanceof Error ? err.message : String(err),
                    metadata: {
                      status: 'paid',
                      source: 'routes_delivery_bulk',
                      parentBatchId: batchId
                    }
                  });
                });
            });
          }
        }
      }

      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'success',
        resource: dispatchRoute?.name ?? '',
        metadata: {
          status,
          count: ids.length,
          invoicesPaid,
          invoicesUpdated,
          updatedInvoiceIds,
          updatedInvoiceNumbers,
          updatedNonDeliveredInvoiceIds,
          updatedNonDeliveredInvoiceNumbers,
          syncSp2InvoicesAttempted,
          markInvoicesPaid: opts.markInvoicesPaid ?? false,
          syncInvoicesSp2: opts.syncInvoicesSp2 ?? false,
          syncSp2: opts.syncSp2 ?? false,
          updateInvoices: opts.updateInvoices ?? false,
          invoiceStatus: opts.invoiceStatus,
          routeId: dispatchRoute?.id,
          batchId
        }
      });
      setSelectedPkgs(new Set());
      qc.invalidateQueries({ queryKey: ["route-packages"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      const invoiceDesc = invoicesPaid > 0
        ? ` · ${invoicesPaid} factura${invoicesPaid !== 1 ? 's' : ''} marcada${invoicesPaid !== 1 ? 's' : ''} como pagada${invoicesPaid !== 1 ? 's' : ''}`
        : invoicesUpdated > 0
        ? ` · ${invoicesUpdated} factura${invoicesUpdated !== 1 ? 's' : ''} actualizada${invoicesUpdated !== 1 ? 's' : ''}`
        : '';
      const desc = `${ids.length} paquetes → ${STATUS_LABELS[status] ?? status}${invoiceDesc}`;
      toast({ title: "Actualizado", description: desc });

      // SP2 sync — fire-and-forget after the SP1 update already succeeded.
      // forceSync is false for most statuses (SP2 regression guard stays active).
      // Exception: 'consolidated' uses forceSync=true because its SP2 priority (60)
      // is below customs (80) and transit (70) — without forceSync the update would
      // be silently blocked for packages already at those states in SP2.
      if (syncToSP2) {
        const pkgsToSync = (filteredPkgs as any[]).filter(p => ids.includes(p.id));
        // All admin-set statuses use forceSync=true — admin intent must always win
        // over SP2's regression guard (e.g. consolidated=60 < customs=80, held=75 < customs=80,
        // returned could be below a delivered=100 for re-deliveries, etc.).
        const FORCE_SYNC_ADMIN_STATUSES = new Set([
          'consolidated', 'pickup', 'returned', 'delivered', 'processed', 'route', 'on_route', 'held', 'retained', 'transit', 'customs'
        ]);
        const needsForceSync = FORCE_SYNC_ADMIN_STATUSES.has(status);
        const sp1Pkgs: SP1PackageForSync[] = pkgsToSync.map(p => ({
          id: p.id,
          trackingNumber: p.tracking || p.trackingNumber || p.id,
          slCode: p.slCode,
          customerName: p.customerName,
          status,
          weight: p.weight,
          description: p.description || p.descripcion,
          origin: p.origin || p.originLocationId,
          destination: p.destination || p.destinationLocationId,
          ruta: p.ruta ?? dispatchRoute?.name,
          manifestNumber: p.manifestNumber || p.manifiesto,
          requiresPermit: p.requiresPermit,
          cost: p.calculatedCost ?? p.cost ?? p.price,
          currency: p.currency,
          ...(needsForceSync ? { forceSync: true } : {}),
        }));
        syncPackagesToSmartWeb(sp1Pkgs)
          .then((result) => {
            const allSkipped = result.updated === 0 && result.created === 0 && result.skipped > 0 && result.errors === 0;
            toast({
              title: allSkipped ? 'SP2 sin cambios' : 'Sync SP2',
              description: allSkipped
                ? `${result.skipped} paquete(s) omitidos — aún no registrados en el portal del cliente (SP2). SP1 sí fue actualizado.`
                : `${result.updated} actualizado(s), ${result.created} creado(s)${result.errors ? `, ${result.errors} error(es)` : ''}${result.skipped ? `, ${result.skipped} omitido(s)` : ''}`,
              variant: allSkipped ? 'default' : 'default',
            });
          })
          .catch(() => {
            toast({
              title: 'Sync SP2 fallido',
              description: 'SP1 fue actualizado correctamente. El sync a SP2 falló — reintenta manualmente si es necesario.',
              variant: 'destructive',
            });
          });
      }
    } catch (err) {
      auditLog({ action: 'packages_bulk_updated', category: 'package', result: 'error', resource: dispatchRoute?.name ?? '', errorMessage: err instanceof Error ? err.message : String(err), metadata: { status, count: ids.length } });
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error al actualizar", variant: "destructive" });
    } finally {
      setIsDispatching(false);
    }
  }, [selectedPkgs, filteredPkgs, qc, toast, dispatchRoute, auditLog]);

  // ── GTI manifest download — per invoice, with all-vs-new selection dialog ──

  /** Step 1: Fetch invoices for the manifest + open the selection dialog */
  const handleOpenGTIDialog = useCallback(async () => {
    if (!dispatchRoute || !manifestFilter) return;

    // Filter manifestPackages for the current route
    const routePkgs = manifestPackages.filter(
      (p: any) => p.ruta === dispatchRoute.name
    );

    if (!routePkgs.length) {
      toast({
        title: 'Sin paquetes en ruta',
        description: `No hay paquetes asignados a la ruta "${dispatchRoute.name}" para el manifiesto ${manifestFilter}.`,
        variant: 'destructive',
      });
      return;
    }

    setGtiLoadingDialog(true);
    try {
      // Find invoices linked to the route packages from already loaded manifestInvoices
      const routeInvoices: any[] = [];
      const seenInvIds = new Set<string>();
      routePkgs.forEach(pkg => {
        const inv = getPackageInvoice(pkg);
        if (inv && !seenInvIds.has(inv.id)) {
          seenInvIds.add(inv.id);
          routeInvoices.push(inv);
        }
      });

      const invoicesMapped: GTIInvoiceEntry[] = routeInvoices.map(inv => {
        const slCode = (inv.clientSlCode || inv.slCode || inv.clientCode || '').trim();
        return {
          id:               inv.id,
          clientSlCode:     slCode,
          clientName:       inv.clientName || inv.name || '',
          manifestNumber:   inv.manifestNumber || manifestFilter,
          totalAmount:      inv.totalAmount ?? inv.amount ?? 0,
          amountCRC:        inv.amountCRC ?? 0,
          trackingNumbers:  inv.trackingNumbers || [],
          gtiDownloadCount: inv.gtiDownloadCount ?? 0,
          gtiDownloadedAt:  inv.gtiDownloadedAt  ?? null,
          status:           inv.status || 'draft',
        };
      });

      const slCodes = [...new Set(invoicesMapped.map(inv => inv.clientSlCode).filter(Boolean))] as string[];
      const contactMap = slCodes.length 
        ? await getCustomersBySlCodes(slCodes) 
        : new Map<string, any>();

      // Filter only invoices that are paid (status === 'paid')
      const validInvoices = invoicesMapped.filter(inv => inv.totalAmount > 0 && inv.status === 'paid');

      if (!validInvoices.length) {
        toast({
          title: 'Sin facturas pagadas',
          description: `No se encontraron facturas con estado "Pagado" para los clientes de esta ruta en el manifiesto ${manifestFilter}.`,
          variant: 'destructive',
        });
        setGtiLoadingDialog(false);
        return;
      }

      const newInvoices   = validInvoices.filter(inv => !inv.gtiDownloadCount);
      setGtiInvoices({ all: validInvoices, newOnly: newInvoices });
      setGtiContactMap(contactMap);
      setGtiDownloadMode(newInvoices.length > 0 ? 'new' : 'all');
      setGtiDialogOpen(true);
    } catch (err) {
      toast({ title: 'Error al cargar facturas GTI', description: String(err), variant: 'destructive' });
    } finally {
      setGtiLoadingDialog(false);
    }
  }, [dispatchRoute, manifestFilter, manifestPackages, manifestInvoices, getPackageInvoice, toast]);

  /** Step 2: Build CSV/XLSX from selected invoices, download, then mark flags */
  const handleConfirmGTIDownload = useCallback(async () => {
    if (!gtiInvoices || !manifestFilter) return;
    const toDownload = gtiDownloadMode === 'new' ? gtiInvoices.newOnly : gtiInvoices.all;
    if (!toDownload.length) {
      toast({ title: 'Sin facturas', description: 'No hay facturas para descargar con el modo seleccionado.', variant: 'destructive' });
      return;
    }
    setIsDownloadingGTI(true);
    setGtiDialogOpen(false);
    try {
      const gtiRows: GTIRowInput[] = toDownload.map(inv => {
        const contact = gtiContactMap.get(inv.clientSlCode);
        const precioUSD =
          inv.amountCRC > 0 && printTc > 0
            ? Math.round((inv.amountCRC / printTc) * 100) / 100
            : inv.totalAmount;
        return {
          nombre:      inv.clientName || '',
          dni:         contact?.dni   || '',
          email:       contact?.email || '',
          phone:       contact?.phone || '',
          precioUSD,
          descripcion: 'Flete Internacional',
          electronicInvoiceRequired: contact?.electronicInvoiceRequired ?? false,
        };
      });
      const opts = { tc: printTc, manifestNumber: manifestFilter, routeSuffix: '' };
      if (gtiDownloadFormat === 'xlsx') {
        downloadGTITiquetesXLSX(gtiRows, opts);
      } else {
        downloadGTITiquetes(gtiRows, opts);
      }

      const calcRows = buildGTICalculatedRows(gtiRows, opts);
      await Promise.all([
        saveGTIManifest(calcRows, opts, (user as any)?.uid || user?.id || '', (user as any)?.email || ''),
        markInvoicesAsGTIDownloaded(toDownload.map(inv => inv.id)),
      ]);

      toast({
        title: 'Manifiesto GTI descargado',
        description: `${toDownload.length} factura${toDownload.length !== 1 ? 's' : ''} exportadas — ${manifestFilter}.`,
      });
      setGtiInvoices(null);
      // Optimistic update: reflect new counts immediately in the table badges
      setGtiCountMap(prev => {
        const next = new Map(prev);
        for (const inv of toDownload) {
          const k = `${inv.clientSlCode}__${inv.manifestNumber}`;
          next.set(k, (next.get(k) ?? 0) + 1);
        }
        return next;
      });
    } catch (err) {
      toast({ title: 'Error al generar GTI', description: err instanceof Error ? err.message : 'Error inesperado', variant: 'destructive' });
    } finally {
      setIsDownloadingGTI(false);
    }
  }, [gtiInvoices, gtiDownloadMode, gtiDownloadFormat, gtiContactMap, manifestFilter, printTc, toast, user]);

  // ── Permission guard ───────────────────────────────────────────────────────
  if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8">
          <Card className="p-8 text-center bg-gray-100 border-gray-300">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-600" />
            <h2 className="text-xl font-bold mb-2 text-gray-900">{t("accessDenied")}</h2>
            <p className="text-gray-600">{t("accessDeniedDescription")}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-4 md:p-6 space-y-4"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{t("manage")}</h1>
            <p className="text-xs text-gray-500">{t("manageDescription")}</p>
          </div>
          {activeTab === "catalog" && (
            <PermissionTooltip allowed={canCreate('routes')}>
              <Button
                onClick={() => { resetForm(); setShowCreateModal(true); }}
                disabled={!canCreate('routes')}
                className="flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800 h-8 text-xs"
                aria-label={t("newRoute")}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("newRoute")}
              </Button>
            </PermissionTooltip>
          )}
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1.5 bg-muted/60 border border-border p-1.5 rounded-xl w-fit shadow-sm" role="tablist" aria-label="Secciones de rutas">
          <button
            role="tab"
            aria-selected={activeTab === "dispatch"}
            onClick={() => setActiveTab("dispatch")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "dispatch"
                ? "bg-red-600 text-white shadow border border-red-700"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Truck className="h-4 w-4" />
            Despacho
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "catalog"}
            onClick={() => setActiveTab("catalog")}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "catalog"
                ? "bg-red-600 text-white shadow border border-red-700"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Catálogo
          </button>
        </div>

        <AnimatePresence mode="wait">
          {/* ── CATALOG TAB ─────────────────────────────────────────────── */}
          {activeTab === "catalog" && (
            <motion.div
              key="catalog"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Search + filter bar */}
              <div className="flex gap-2 bg-gray-50 border border-gray-200 p-3 rounded-md">
                <div className="flex-1 relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                  <Input
                    placeholder={t("searchPlaceholder")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-8 text-xs bg-white border-gray-300 text-gray-900"
                    aria-label="Buscar rutas"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 h-8 text-xs rounded-md border bg-white border-gray-300 text-gray-900 focus:ring-2 focus:ring-gray-400 outline-none"
                  aria-label="Filtrar por estado"
                >
                  <option value="all">{t("allStatus")}</option>
                  <option value="active">{t("active")}</option>
                  <option value="inactive">{t("inactive")}</option>
                </select>
              </div>

              {/* Route grid */}
              {catalogLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : filteredCatalog.length === 0 ? (
                <Card className="p-10 text-center bg-gray-50">
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                    <Truck className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                  </motion.div>
                  <p className="text-sm text-gray-500">{t("noRoutes")}</p>
                </Card>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                >
                  {filteredCatalog.map((route, index) => {
                    const colors = getRouteColor(route.name);
                    const routeAbbrev = route.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    const allAreas = [...(route.cantons || []), ...(route.areas || [])];
                    return (
                      <motion.div
                        key={route.id}
                        initial={{ opacity: 0, scale: 0.92, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.04, ease: [0.4, 0, 0.2, 1] }}
                        whileHover={{ scale: 1.02, transition: { duration: 0.15 } }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div
                          className={cn(
                            "relative rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all cursor-default bg-gradient-to-br",
                            colors.gradient
                          )}
                        >
                          {/* Main content - fixed height for consistency */}
                          <div className="p-4 h-[130px] flex flex-col">
                            {/* Header row: icon + name + close button */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                                  <Truck className="h-4 w-4 text-white" aria-hidden="true" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="text-sm font-bold text-white truncate leading-tight">{route.name}</h3>
                                  <p className="text-xs text-white/70 truncate">{route.province || '—'}</p>
                                </div>
                              </div>
                              <PermissionTooltip allowed={canDelete('routes')}>
                                <button
                                  onClick={() => handleDeleteRoute(route.id)}
                                  disabled={!canDelete('routes')}
                                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label={`Eliminar ${route.name}`}
                                >
                                  <X className="h-3.5 w-3.5 text-white/80" />
                                </button>
                              </PermissionTooltip>
                            </div>

                            {/* Spacer to push badges to bottom */}
                            <div className="flex-1" />

                            {/* Bottom row: badges (single line) + abbreviation */}
                            <div className="flex items-end justify-between gap-2">
                              <div className="flex gap-1 flex-1 overflow-hidden">
                                {allAreas.slice(0, 3).map((area) => (
                                  <span
                                    key={area}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white truncate max-w-[70px]"
                                  >
                                    {area}
                                  </span>
                                ))}
                                {allAreas.length > 3 && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/30 text-white shrink-0">
                                    +{allAreas.length - 3}
                                  </span>
                                )}
                              </div>
                              <span className="text-3xl font-black text-white/20 leading-none shrink-0">
                                {routeAbbrev}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons overlay at bottom */}
                          <div className="flex divide-x divide-white/10">
                            <button
                              onClick={() => setViewingRoute(route)}
                              className="flex-1 py-2 bg-black/10 hover:bg-black/20 flex items-center justify-center gap-1.5 text-white/90 text-xs font-medium transition-colors"
                              aria-label={`Ver ruta ${route.name}`}
                            >
                              <Eye className="h-3 w-3" />
                              Ver Ruta
                            </button>
                            <PermissionTooltip allowed={canUpdate('routes')}>
                              <button
                                onClick={() => handleOpenEdit(route)}
                                disabled={!canUpdate('routes')}
                                className="flex-1 py-2 bg-black/10 hover:bg-black/20 flex items-center justify-center gap-1.5 text-white/90 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={`Editar ${route.name}`}
                              >
                                <Edit className="h-3 w-3" />
                                Editar
                              </button>
                            </PermissionTooltip>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── DISPATCH TAB ─────────────────────────────────────────────── */}
          {activeTab === "dispatch" && (
            <motion.div
              key="dispatch"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >

              {/* ── Compact Manifest Selector ── */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-red-600" />
                    Paso 1: Seleccionar Manifiesto Activo
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Elige un manifiesto para cargar sus paquetes y habilitar la selección de rutas.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                  <ManifestPicker
                    allManifestNumbers={allManifestsList}
                    selectedManifests={manifestFilter ? new Set([manifestFilter]) : new Set()}
                    onManifestsChange={(set) => {
                      const next = Array.from(set)[0];
                      setManifestFilter(next || "");
                      setDispatchRoute(null); // Resetear ruta al cambiar manifiesto
                      setSelectedPkgs(new Set());
                      setCurrentPage(1);
                    }}
                    manifestPackageCounts={manifestCounts}
                    singleSelect
                    triggerClassName={cn(
                      "h-9 px-3 text-xs font-bold rounded-lg border-2 flex items-center justify-between gap-1.5 transition-all shadow-md w-full sm:min-w-[240px]",
                      manifestFilter
                        ? "border-red-600 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-600/30 hover:scale-[1.02] active:scale-95 duration-150"
                        : "border-amber-500 bg-amber-500/10 text-amber-800 dark:text-amber-300 dark:border-amber-500/50 dark:bg-amber-500/5 hover:bg-amber-500/20 shadow-sm animate-pulse hover:animate-none"
                    )}
                    allLabel="Seleccionar Manifiesto..."
                    align="end"
                  />
                </div>
              </div>

              {/* ── Route Selector - Grid Layout matching SP2 ── */}
              <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-6 transition-all duration-300", !manifestFilter && "opacity-40 pointer-events-none")}>
                {/* Left Column - Selected Route Card */}
                <div className="lg:col-span-1 flex flex-col">
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    Ruta Seleccionada
                  </p>
                  <div className="flex-1">
                    {catalogLoading ? (
                      <div className="rounded-xl overflow-hidden shadow-lg h-full min-h-[110px] flex flex-col justify-between border border-muted/50 bg-card p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                            <div className="space-y-1">
                              <Skeleton className="w-24 h-4 rounded" />
                              <Skeleton className="w-16 h-3 rounded" />
                            </div>
                          </div>
                          <Skeleton className="w-6 h-6 rounded" />
                        </div>
                        <div className="mt-8 flex items-end justify-between">
                          <div className="flex flex-wrap gap-1.5">
                            <Skeleton className="w-12 h-4 rounded" />
                            <Skeleton className="w-12 h-4 rounded" />
                          </div>
                          <Skeleton className="w-10 h-8 rounded" />
                        </div>
                      </div>
                    ) : dispatchRoute ? (
                      (() => {
                        const colors = getRouteColor(dispatchRoute.name);
                        const abbr = dispatchRoute.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 3);
                        const allAreas = [...(dispatchRoute.areas || []), ...(dispatchRoute.cantons || [])];
                        return (
                          <div className={cn("rounded-xl overflow-hidden shadow-lg h-full flex flex-col justify-between bg-gradient-to-br", colors.gradient)}>
                            {/* Header with route name and close */}
                            <div className="p-3 pb-1">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                                    <Truck className="w-4 h-4 text-white" aria-hidden="true" />
                                  </div>
                                  <div>
                                    <p className="font-bold text-lg leading-tight text-white">{dispatchRoute.name}</p>
                                    <p className="text-white/70 text-xs">{dispatchRoute.province || '—'}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => { setDispatchRoute(null); setDispatchSearch(""); setSelectedPkgs(new Set()); }}
                                  className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors shrink-0"
                                  aria-label="Limpiar ruta seleccionada"
                                >
                                  <X className="w-3.5 h-3.5 text-white" />
                                </button>
                              </div>
                            </div>
                            {/* Area badges + Large abbreviation */}
                            <div className="p-3 pt-2 flex items-end justify-between">
                              <div className="flex flex-wrap gap-1.5 flex-1">
                                {allAreas.slice(0, 4).map((area) => (
                                  <span key={area} className="px-2 py-0.5 bg-white/20 text-white text-[10px] rounded-full">{area}</span>
                                ))}
                                {allAreas.length > 4 && (
                                  <span className="px-2 py-0.5 bg-white/30 text-white text-[10px] rounded-full font-bold">+{allAreas.length - 4}</span>
                                )}
                              </div>
                              <span className="text-5xl font-black text-white/30 leading-none">{abbr}</span>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <MapPin className="w-10 h-10 mx-auto mb-2 opacity-50" aria-hidden="true" />
                        <p className="text-sm">Selecciona una ruta</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Route Cards Grid */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase">
                      {manifestFilter ? "Paso 2: Seleccionar Ruta" : "Seleccionar Ruta (Selecciona un manifiesto primero)"}
                    </p>
                    <span className="text-xs text-muted-foreground">{filteredRoutesList.length} rutas disponibles</span>
                  </div>
                  {catalogLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {[...Array(12)].map((_, i) => (
                        <div key={i} className="p-2 rounded-lg border border-muted/50 bg-card text-center flex flex-col items-center justify-center gap-1.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <Skeleton className="w-3 h-3 rounded-full shrink-0" />
                            <Skeleton className="w-8 h-4 rounded" />
                          </div>
                          <Skeleton className="w-12 h-3 rounded mx-auto" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2" role="listbox" aria-label="Seleccionar ruta">
                      {filteredRoutesList.map((route) => {
                        const count = routeCounts.get(route.name) ?? 0;
                        const colors = getRouteColor(route.name);
                        const isSelected = dispatchRoute?.id === route.id;
                        const isRouteEmpty = count === 0;
                        const abbr = route.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 3);
                        return (
                           <button
                             key={route.id}
                             role="option"
                             aria-selected={isSelected}
                             disabled={!manifestFilter}
                             onClick={() => {
                               setDispatchRoute(isSelected ? null : route);
                               setSelectedPkgs(new Set());
                               setCurrentPage(1);
                             }}
                             className={cn(
                               "p-2 rounded-lg border-2 text-center transition-all hover:shadow-md relative",
                               isSelected
                                 ? cn("bg-gradient-to-br shadow-lg border-transparent", colors.gradient)
                                 : cn(colors.bg, colors.border),
                               isRouteEmpty && manifestFilter && "opacity-50 grayscale-[30%] border-dashed"
                             )}
                           >
                             {/* Absolute badge */}
                             {count > 0 && (
                               <span className={cn(
                                 "absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none shadow-sm min-w-[16px] text-center border transition-all",
                                 isSelected
                                   ? "bg-white text-foreground border-transparent"
                                   : "bg-emerald-500 text-white border-emerald-600 dark:bg-emerald-600 dark:border-emerald-700"
                               )}>
                                 {count}
                               </span>
                             )}
                             <div className="flex items-center justify-center gap-1.5 mb-1">
                               <div className={cn(
                                 "w-3 h-3 rounded-full border-2 shrink-0",
                                 isSelected ? "bg-white/30 border-white" : colors.border
                               )}>
                                 {isSelected && <div className="w-full h-full rounded-full bg-white scale-50" />}
                               </div>
                               <span className={cn("font-black text-sm", isSelected ? "text-white" : colors.text)}>
                                 {abbr}
                               </span>
                             </div>
                             <p className={cn("text-[10px] font-bold leading-tight truncate", isSelected ? "text-white" : colors.text)}>
                               {route.name}
                             </p>
                           </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Search + manifest filter + status filters ── */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      placeholder="Filtrar por tracking, cliente..."
                      className="pl-9 h-9 text-sm"
                      aria-label="Filtrar paquetes"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
                    {STATUS_FILTERS.map((sf) => (
                      <button
                        key={sf.value}
                        onClick={() => setDispatchStatusFilter(sf.value)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold transition-all border",
                          dispatchStatusFilter === sf.value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-card text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                        )}
                        aria-pressed={dispatchStatusFilter === sf.value}
                      >
                        {sf.label}
                      </button>
                    ))}
                  </div>
                  {/* Group-by selector */}
                  <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Agrupar por">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Agrupar:</span>
                    {([
                      { value: "invoice", label: "Factura" },
                      { value: "none", label: "Ninguno" },
                      { value: "customerName", label: "Nombre" },
                      { value: "slCode", label: "SL Code" },
                      { value: "manifestNumber", label: "Manifiesto" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setGroupBy(opt.value)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border",
                          groupBy === opt.value
                            ? "bg-foreground text-background border-foreground"
                            : "bg-card text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                        )}
                        aria-pressed={groupBy === opt.value}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Bulk action buttons ── */}
              <AnimatePresence>
                {selectedPkgs.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap gap-1.5 overflow-hidden"
                  >
                    <Button size="sm" className="h-7 text-xs bg-gray-900 text-white hover:bg-gray-800 gap-1" onClick={() => { setRouteActionOptions(o => ({ ...o, syncSp2: true, updateInvoices: false, invoiceStatus: 'sent' })); setConfirmAction("route"); }} disabled={isDispatching}>
                      <Truck className="h-3 w-3" />En Ruta ({selectedPkgs.size})
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-emerald-700 text-white hover:bg-emerald-800 gap-1" onClick={() => { setRouteActionOptions(o => ({ ...o, syncSp2: true, markInvoicesPaid: false, syncInvoicesSp2: false })); setConfirmAction("delivered"); }} disabled={isDispatching}>
                      <CheckCircle2 className="h-3 w-3" />Entregado
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-400 text-red-700 hover:bg-red-50 dark:text-red-400" onClick={() => setShowCheckOut(true)} disabled={isDispatching}>
                      <FlagOff className="h-3 w-3" />Cerrar ruta
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-sky-700 text-white hover:bg-sky-800 gap-1" onClick={() => { setRouteActionOptions(o => ({ ...o, syncSp2: true, updateInvoices: false, invoiceStatus: 'sent' })); setConfirmAction("consolidated"); }} disabled={isDispatching}>
                      <Boxes className="h-3 w-3" />Consolidado
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-teal-700 text-white hover:bg-teal-800 gap-1" onClick={() => { setRouteActionOptions(o => ({ ...o, syncSp2: true, updateInvoices: false, invoiceStatus: 'sent' })); setConfirmAction("pickup"); }} disabled={isDispatching}>
                      <Store className="h-3 w-3" />Retira en SL
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-red-700 text-white hover:bg-red-800 gap-1" onClick={() => { setRouteActionOptions(o => ({ ...o, syncSp2: true, updateInvoices: false, invoiceStatus: 'sent' })); setConfirmAction("held"); }} disabled={isDispatching}>
                      <Ban className="h-3 w-3" />Retenido
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setRouteActionOptions(o => ({ ...o, syncSp2: true, updateInvoices: false, invoiceStatus: 'sent' })); setConfirmAction("returned"); }} disabled={isDispatching}>
                      <RotateCcw className="h-3 w-3" />Devuelto
                    </Button>
                    {(() => {
                      const selectedCustomsCount = (filteredPkgs as any[])
                        .filter(p => selectedPkgs.has(p.id) && normalizeStatus(p.status) === 'customs')
                        .length;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-violet-400 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 disabled:opacity-40"
                          onClick={() => setManifestWizardOpen(true)}
                          disabled={isDispatching || selectedCustomsCount === 0}
                          title={selectedCustomsCount === 0 ? 'Solo aplica para paquetes en estado Aduana' : `Cambiar manifiesto (${selectedCustomsCount} en aduana)`}
                        >
                          <FileText className="h-3 w-3" />
                          Cambiar manifiesto{selectedCustomsCount > 0 ? ` (${selectedCustomsCount})` : ''}
                        </Button>
                      );
                    })()}
                    <button
                      onClick={() => refetchPkgs()}
                      className="h-7 w-7 ml-auto flex items-center justify-center rounded-lg border border-border bg-card hover:bg-accent transition-colors text-muted-foreground"
                      aria-label="Recargar paquetes"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Packages table ── */}
              {dispatchRoute ? (
                <div className="space-y-2">
                  {/* Table header row with totals */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
                      <span>Paquetes de la Ruta</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground uppercase tracking-wider">
                        {filteredPkgs.length} {filteredPkgs.length !== 1 ? 'Paquetes' : 'Paquete'}
                      </span>
                      {groupBy === "invoice" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/50 uppercase tracking-wider">
                          {invoicesCount} {invoicesCount !== 1 ? 'Facturas' : 'Factura'}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap sm:ml-auto justify-end">
                      <label className="text-[10px] text-muted-foreground whitespace-nowrap">TC (₡/$):</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={printTc}
                          onChange={e => setPrintTc(Number(e.target.value))}
                          className={cn(
                            "w-20 h-7 text-xs px-2 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
                            tcMismatchCount > 0 ? "border-amber-500" : "border-border"
                          )}
                          min={0}
                          aria-label="Tipo de cambio para impresión"
                        />
                      </div>
                      {tcMismatchCount > 0 && (
                        <span
                          className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap"
                          title={`${tcMismatchCount} paquete(s) con TC diferente al seleccionado`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {tcMismatchCount} TC ≠
                        </span>
                      )}
                      <button
                        onClick={handlePrintRouteManifest}
                        disabled={filteredPkgs.length === 0}
                        className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-xs font-medium text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Imprimir manifiesto de ruta"
                        title={selectedPkgs.size > 0 ? `Imprimir ${selectedPkgs.size} seleccionados` : 'Imprimir todos'}
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                        Manifiesto de Ruta
                      </button>
                      <button
                        onClick={handlePrintBoleta}
                        disabled={filteredPkgs.length === 0}
                        className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-xs font-medium text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Imprimir boleta de bodega"
                        title={selectedPkgs.size > 0 ? `Imprimir ${selectedPkgs.size} seleccionados` : "Imprimir todos"}
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                        Boleta de Bodega
                      </button>
                      {/* GTI manifest — paid invoices */}
                      <button
                        onClick={handleOpenGTIDialog}
                        disabled={!dispatchRoute || !manifestFilter || isDownloadingGTI || gtiLoadingDialog}
                        className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg border border-green-500/60 bg-green-500/5 hover:bg-green-500/10 hover:border-green-500 transition-colors text-xs font-medium text-green-700 dark:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Descargar Manifiesto GTI (facturas pagadas del manifiesto seleccionado)"
                        title={
                          !dispatchRoute ? 'Selecciona una ruta primero'
                          : !manifestFilter ? 'Selecciona un manifiesto'
                          : `Descargar GTI — Facturas pagadas de ${manifestFilter}`
                        }
                      >
                        {(isDownloadingGTI || gtiLoadingDialog)
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                        Descargar GTI
                      </button>
                      {!selectedPkgs.size && (
                        <button
                          onClick={() => refetchPkgs()}
                          className="h-7 w-7 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-accent transition-colors text-muted-foreground"
                          aria-label="Recargar paquetes"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {checkingSession ? (
                    <Card className="p-10 text-center bg-muted/20">
                      <Loader2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3 animate-spin" aria-hidden="true" />
                      <p className="text-sm font-semibold text-foreground">Cargando paquetes…</p>
                    </Card>
                  ) : pkgsLoading ? (
                    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm overflow-x-auto">
                      <div className="divide-y divide-border min-w-[1150px]">
                        {/* Skeleton Sticky table header */}
                        <div className="grid grid-cols-[20px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,2fr)_56px_90px_80px_160px_60px] gap-x-3 px-4 py-2.5 bg-card border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <Skeleton className="h-3.5 w-3.5 rounded self-center" />
                          <span>Tracking</span>
                          <span>Manifiesto</span>
                          <span>SL Code</span>
                          <span>Cliente</span>
                          <span>Descripción</span>
                          <span>{isMaritime ? "Volumen (FT³)" : "Peso (KG)"}</span>
                          <span>$/CRC</span>
                          <span>GTI</span>
                          <span>Estado</span>
                          <span>Acción</span>
                        </div>
                        {/* Skeleton Rows */}
                        {[...Array(6)].map((_, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[20px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,2fr)_56px_90px_80px_160px_60px] gap-x-3 px-4 py-3 items-center"
                          >
                            <Skeleton className="h-3.5 w-3.5 rounded self-center" />
                            {/* Tracking */}
                            <Skeleton className="h-4 w-28 rounded font-mono" />
                            {/* Manifiesto */}
                            <Skeleton className="h-4 w-20 rounded" />
                            {/* SL Code */}
                            <Skeleton className="h-4 w-12 rounded" />
                            {/* Cliente */}
                            <Skeleton className="h-4 w-24 rounded" />
                            {/* Descripción */}
                            <Skeleton className="h-4 w-32 rounded" />
                            {/* Peso */}
                            <Skeleton className="h-4 w-8 rounded ml-auto" />
                            {/* $/CRC */}
                            <div className="space-y-1">
                              <Skeleton className="h-3 w-12 rounded ml-auto" />
                              <Skeleton className="h-2.5 w-16 rounded ml-auto" />
                            </div>
                            {/* GTI */}
                            <Skeleton className="h-5 w-12 rounded mx-auto" />
                            {/* Estado */}
                            <Skeleton className="h-6 w-24 rounded-full" />
                            {/* Acción */}
                            <Skeleton className="h-7 w-12 rounded" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : filteredPkgs.length === 0 ? (
                    <Card className="p-10 text-center bg-muted/20">
                      <Truck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
                      <p className="text-sm font-semibold text-foreground">No hay paquetes en esta ruta</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dispatchStatusFilter
                          ? `No hay paquetes en estado "${STATUS_LABELS[dispatchStatusFilter]}" para esta ruta en el manifiesto seleccionado`
                          : "Esta ruta no tiene paquetes asignados en el manifiesto seleccionado."}
                      </p>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm overflow-x-auto">
                        {/* Unified scroll container — header + rows together so scrollbar width never causes misalignment */}
                        <div className="divide-y divide-border max-h-[560px] overflow-y-auto min-w-[1150px]">
                          {/* Sticky table header */}
                          <div className="grid grid-cols-[20px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,2fr)_56px_90px_80px_160px_60px] gap-x-3 px-4 py-2.5 bg-card border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground sticky top-0 z-20">
                            <InvoiceParentCheckbox
                              checked={isAllPageSelected}
                              indeterminate={!isAllPageSelected && pagePkgIds.some(id => selectedPkgs.has(id))}
                              onChange={handleSelectPage}
                              ariaLabel="Seleccionar todos en esta página"
                            />
                            <button
                              type="button"
                              onClick={() => handleSort('tracking')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>Tracking</span>
                              {renderSortIcon('tracking')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSort('manifest')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>Manifiesto</span>
                              {renderSortIcon('manifest')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSort('slCode')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>SL Code</span>
                              {renderSortIcon('slCode')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSort('client')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>Cliente</span>
                              {renderSortIcon('client')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSort('description')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>Descripción</span>
                              {renderSortIcon('description')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSort('weight')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>{isMaritime ? "Volumen (FT³)" : "Peso (KG)"}</span>
                              {renderSortIcon('weight')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSort('amount')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>$/CRC</span>
                              {renderSortIcon('amount')}
                            </button>
                            <span className="text-center">GTI</span>
                            <button
                              type="button"
                              onClick={() => handleSort('status')}
                              className="flex items-center gap-1 hover:text-foreground text-left focus:outline-none select-none transition-colors"
                            >
                              <span>Estado</span>
                              {renderSortIcon('status')}
                            </button>
                            <span>Acción</span>
                          </div>

                          {/* Gmail style selection banner */}
                          {selectedPkgs.size > 0 && isAllPageSelected && selectedPkgs.size < filteredPkgs.length && (
                            <div className="bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs px-4 py-2 flex items-center justify-center gap-2 border-b border-border font-medium sticky top-[33px] z-10">
                              <span>Se han seleccionado los {selectedPkgs.size} paquetes de esta página.</span>
                              <button
                                onClick={handleSelectAllFiltered}
                                className="font-bold underline hover:text-emerald-700 dark:hover:text-emerald-200 transition-colors"
                              >
                                Seleccionar los {filteredPkgs.length} paquetes del manifiesto/ruta
                              </button>
                            </div>
                          )}
                          {selectedPkgs.size === filteredPkgs.length && filteredPkgs.length > pagePkgIds.length && (
                            <div className="bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs px-4 py-2 flex items-center justify-center gap-2 border-b border-border font-medium sticky top-[33px] z-10">
                              <span>Se han seleccionado los {filteredPkgs.length} paquetes de todo el manifiesto/ruta.</span>
                              <button
                                onClick={handleClearSelection}
                                className="font-bold underline hover:text-emerald-700 dark:hover:text-emerald-200 transition-colors"
                              >
                                Borrar selección
                              </button>
                            </div>
                          )}

                          {flatList.map((item, idx) => {
                            if (item.type === 'header') {
                              return (
                                <div key={`h-${item.key}-${idx}`} className="grid grid-cols-[20px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,2fr)_56px_90px_80px_160px_60px] gap-x-3 px-4 py-2 items-center bg-muted/70 border-b border-border text-[11px] font-bold text-foreground">
                                  <div className="col-span-7 flex items-center gap-2 min-w-0">
                                    {groupBy === "slCode" && <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">SL:</span>}
                                    {groupBy === "manifestNumber" && <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">Manifiesto:</span>}
                                    {groupBy === "customerName" && <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">Cliente:</span>}
                                    <span className="truncate">{item.key}</span>
                                    <span className="font-normal text-muted-foreground shrink-0">({item.count} paq.)</span>
                                  </div>
                                  <div className="flex flex-col items-end gap-0">
                                    <span className="font-bold text-foreground whitespace-nowrap">${item.totalUSD.toFixed(2)}</span>
                                    {printTc > 0 && <span className="text-[9px] font-semibold text-muted-foreground whitespace-nowrap">₡{item.totalCRC.toLocaleString('es-CR')}</span>}
                                  </div>
                                  <span />
                                  <span />
                                  <span />
                                </div>
                              );
                            }

                            if (item.type === 'invoice-parent') {
                              const pkgIds = item.pkgs.map(p => p.id);
                              const isAllSelected = pkgIds.length > 0 && pkgIds.every(pId => selectedPkgs.has(pId));
                              const isSomeSelected = !isAllSelected && pkgIds.some(pId => selectedPkgs.has(pId));
                              const totalUSD = item.invoice
                                ? (item.invoice.totalAmount ?? item.invoice.amount ?? 0)
                                : item.pkgs.reduce((s, p) => s + Number(p.price ?? p.cost ?? p.value ?? 0), 0);
                              const totalCRC = item.invoice
                                ? (item.invoice.amountCRC ?? Math.round(totalUSD * (item.invoice.exchangeRate ?? printTc)))
                                : Math.round(totalUSD * printTc);
                              const totalWeight = item.pkgs.reduce((s, p) => s + Number(p.weight ?? p.peso ?? 0), 0);
                              
                              return (
                                <div
                                  key={`inv-${item.id}-${idx}`}
                                  className={cn(
                                    "grid grid-cols-[20px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,2fr)_56px_90px_80px_160px_60px] gap-x-3 px-4 py-2.5 items-center hover:bg-muted/50 transition-colors text-xs border-b border-border",
                                    item.invoice ? "bg-muted/20" : "bg-amber-500/5 border-l-2 border-l-amber-500 dark:border-l-amber-600"
                                  )}
                                >
                                  <InvoiceParentCheckbox
                                    checked={isAllSelected}
                                    indeterminate={isSomeSelected}
                                    onChange={() => handleToggleInvoice(item.id, item.pkgs)}
                                    ariaLabel={`Seleccionar todos los paquetes de la factura ${item.invoice?.invoiceNumber || item.id}`}
                                  />
                                  
                                  {/* Tracking column (Chevron + Invoice ID) */}
                                  <div className="flex items-center gap-1 min-w-0">
                                    <button
                                      onClick={() => toggleInvoiceExpand(item.id)}
                                      className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                      title={item.isExpanded ? "Contraer" : "Expandir"}
                                    >
                                      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", item.isExpanded && "transform rotate-90")} />
                                    </button>
                                    <span className="font-mono font-bold text-foreground truncate text-[11px]">
                                      {item.invoice ? (item.invoice.invoiceNumber || item.id) : "Sin Facturar"}
                                    </span>
                                  </div>

                                  {/* Manifiesto */}
                                  <span className={cn(
                                    "font-semibold text-[11px] truncate",
                                    manifestFilter ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                                  )}>
                                    {manifestFilter || "—"}
                                  </span>

                                  {/* SL Code */}
                                  <span className="text-[11px] font-bold text-foreground truncate">
                                    {item.invoice ? (item.invoice.slCode || item.invoice.clientCode || "—") : "—"}
                                  </span>

                                  {/* Cliente */}
                                  <span className="text-[11px] text-foreground font-semibold truncate uppercase">
                                    {item.invoice ? (item.invoice.clientName || item.invoice.name || "—") : "Varios clientes"}
                                  </span>

                                  {/* Descripción */}
                                  <span className="text-[11px] text-muted-foreground truncate italic">
                                    {item.pkgs.length} paquete(s)
                                  </span>

                                  {/* Peso */}
                                  <span className="text-[11px] text-foreground font-bold whitespace-nowrap">
                                    {isMaritime ? `${Math.round(totalWeight)} FT³` : `${totalWeight.toFixed(2)}`}
                                  </span>

                                  {/* $/CRC */}
                                  <div className="flex flex-col gap-0.5 items-end">
                                    <span className="text-[11px] text-foreground font-bold">${totalUSD.toFixed(2)}</span>
                                    {totalCRC > 0 && (
                                      <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                        ₡{totalCRC.toLocaleString('es-CR')}
                                      </span>
                                    )}
                                  </div>
                                  {/* GTI */}
                                  <div className="flex justify-center">
                                    {(() => {
                                      const slCode = (item.invoice?.clientSlCode || item.invoice?.slCode || item.invoice?.clientCode || '').trim();
                                      const mNum = (item.invoice?.manifestNumber || manifestFilter || '').trim();
                                      const gtiCount = item.invoice?.gtiDownloadCount ?? gtiCountMap.get(`${slCode}__${mNum}`) ?? 0;
                                      return gtiCount > 0 ? (
                                        <span
                                          title={`Descargado al GTI ${gtiCount} vez${gtiCount !== 1 ? 'es' : ''}`}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[9px] font-bold whitespace-nowrap"
                                        >
                                          <Download className="h-2.5 w-2.5" aria-hidden="true" />
                                          {gtiCount}×
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground/40">—</span>
                                      );
                                    })()}
                                  </div>
                                  {/* Estado */}
                                  <div>
                                    {item.invoice ? (
                                      (() => {
                                        const badge = getInvoiceStatusBadge(item.invoice.status);
                                        return (
                                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap border", badge.cls)}>
                                            {badge.label}
                                          </span>
                                        );
                                      })()
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 text-[9px] uppercase tracking-wider dark:bg-gray-800 dark:text-gray-400">
                                        No facturado
                                      </span>
                                    )}
                                  </div>

                                  {/* Acción */}
                                  <div className="flex items-center gap-1">
                                    {item.invoice && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-1.5 text-[10px] gap-1 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                                        onClick={() => handleViewInvoiceDirectly(item.invoice)}
                                        title="Ver Factura"
                                      >
                                        <FileText className="h-3 w-3" />
                                        Ver
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Rendering for both invoice-child and standard row
                            const pkg = item.pkg;
                            const isChild = item.type === 'invoice-child';
                            const canonicalStatus = normalizeStatus(pkg.status);
                            const statusCls = PKG_STATUS_COLORS[canonicalStatus] ?? "bg-muted text-muted-foreground";
                            const pkgInvoice = isChild ? item.invoice : getPackageInvoice(pkg);
                            const invItem = pkgInvoice ? getInvoiceItemForPackage(pkgInvoice, pkg) : null;
                            const priceUSD = invItem
                              ? (invItem.unitPrice ?? invItem.totalPrice ?? invItem.amount ?? 0)
                              : Number(pkg.price ?? pkg.cost ?? pkg.value ?? 0);
                            const effectiveTc = Number(pkg.exchangeRate) > 0 ? Number(pkg.exchangeRate) : printTc;
                            const monto       = effectiveTc > 0 ? Math.round(priceUSD * effectiveTc * 100) / 100 : 0;
                            const fmtCRC      = (n: number) => '₡' + n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            const manifestNum = pkg.manifestNumber || pkg.manifiesto;
                            const gtiCount    = gtiCountMap.get(`${pkg.slCode ?? ''}__${manifestNum ?? ''}`) ?? 0;
                            const invStatus   = invoiceStatusMap.get((pkg.tracking ?? '').toUpperCase());
                            const invoiceSent = invStatus === 'sent' || invStatus === 'paid' || invStatus === 'overdue';

                            return (
                              <div
                                key={`pkg-${pkg.id}-${idx}`}
                                className={cn(
                                  "grid grid-cols-[20px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,2fr)_56px_90px_80px_160px_60px] gap-x-3 px-4 py-2 items-center hover:bg-muted/30 transition-colors text-xs border-b border-border/50",
                                  selectedPkgs.has(pkg.id) && "bg-primary/5",
                                  isChild && "bg-muted/5 dark:bg-muted/2"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPkgs.has(pkg.id)}
                                  onChange={() => handleTogglePkg(pkg.id)}
                                  className="h-3.5 w-3.5 rounded border-border accent-foreground cursor-pointer"
                                  aria-label={`Seleccionar ${pkg.tracking}`}
                                />
                                
                                {/* Tracking */}
                                <div className="flex items-center gap-1 min-w-0">
                                  {isChild && (
                                    <span className="text-muted-foreground mr-1 text-[10px] font-bold select-none shrink-0">└─</span>
                                  )}
                                  <span className="font-mono font-semibold text-foreground truncate text-[11px]">{pkg.tracking ?? "—"}</span>
                                  {pkg.tracking && (
                                    <button
                                      onClick={() => handleCopy(pkg.tracking)}
                                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                      aria-label={`Copiar tracking ${pkg.tracking}`}
                                    >
                                      {copiedTracking === pkg.tracking
                                        ? <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                                        : <Copy className="h-3 w-3" aria-hidden="true" />}
                                    </button>
                                  )}
                                </div>

                                {/* Manifiesto */}
                                {(() => {
                                  const mNum = pkg.manifestNumber || pkg.manifiesto;
                                  return (
                                    <span className={cn(
                                      "font-semibold text-[11px] truncate",
                                      mNum ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                                    )}>
                                      {mNum ?? "—"}
                                    </span>
                                  );
                                })()}

                                {/* SL Code */}
                                {(() => {
                                  return (
                                    <div className="flex flex-col gap-0 items-start">
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="text-[11px] font-medium text-foreground truncate">{pkg.slCode ?? "—"}</span>
                                        {(pkg.permisos || pkg.requiresPermit) && <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">PERM</span>}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Cliente */}
                                {(() => {
                                  const isConsolidado = customerConsolidationMap.has(pkg.slCode)
                                    ? customerConsolidationMap.get(pkg.slCode)
                                    : pkg.consolidacion;
                                  const isFe = customerFeMap.has(pkg.slCode)
                                    ? customerFeMap.get(pkg.slCode)
                                    : (pkg.electronicInvoiceRequired ?? false);
                                  return (
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="text-[11px] text-foreground truncate uppercase">{pkg.customerName ?? "—"}</span>
                                      {isConsolidado && <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">CONS</span>}
                                      {isFe && (
                                        <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                          FE
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* Descripción */}
                                <span className="text-[11px] text-muted-foreground truncate">{pkg.description ?? "—"}</span>

                                {/* Peso */}
                                <span className="text-[11px] text-foreground whitespace-nowrap">
                                  {(pkg.weight ?? pkg.peso) != null
                                    ? (isMaritime
                                        ? `${Math.round(pkg.weight ?? pkg.peso)} FT³`
                                        : `${(pkg.weight ?? pkg.peso)}`
                                      )
                                    : "—"}
                                </span>

                                {/* $/CRC column */}
                                <div className="flex flex-col gap-0.5 items-end">
                                  <span className="text-[11px] text-foreground whitespace-nowrap font-semibold">${priceUSD.toFixed(2)}</span>
                                  {monto > 0 && <span className="text-[9px] text-muted-foreground whitespace-nowrap">{fmtCRC(monto)}</span>}
                                  {(() => {
                                    const pkgTc = Number(pkg.exchangeRate);
                                    return pkgTc > 0 && pkgTc !== printTc ? (
                                      <span
                                        className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap"
                                        title={`Este paquete fue ingresado con TC ₡${pkgTc}, diferente al TC actual ₡${printTc}`}
                                      >
                                        TC ₡{pkgTc}
                                      </span>
                                    ) : null;
                                  })()}
                                </div>

                                {/* GTI download flag */}
                                <div className="flex justify-center">
                                  {gtiCount > 0 ? (
                                    <span
                                      title={`Descargado al GTI ${gtiCount} vez${gtiCount !== 1 ? 'es' : ''}`}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[9px] font-bold whitespace-nowrap"
                                    >
                                      <Download className="h-2.5 w-2.5" aria-hidden="true" />
                                      {gtiCount}×
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/40">—</span>
                                  )}
                                </div>

                                {/* Estado */}
                                <span className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap",
                                  statusCls
                                )}>
                                  {STATUS_LABELS[canonicalStatus] ?? (canonicalStatus || "—")}
                                </span>

                                {/* Acción */}
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 w-6 p-0"
                                    aria-label={`Detalles de ${pkg.tracking}`}
                                    title="Detalles del cliente"
                                    onClick={() => handleViewPkgDetails(pkg)}
                                  >
                                    <Eye className="h-3 w-3" aria-hidden="true" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn(
                                      "h-6 w-6 p-0",
                                      invoiceSent && "border-blue-500 dark:border-blue-400"
                                    )}
                                    aria-label={`Factura de ${pkg.tracking}`}
                                    title={invoiceSent ? "Factura enviada" : "Factura asociada"}
                                    onClick={() => handleViewPkgInvoice(pkg)}
                                  >
                                    <FileText className={cn("h-3 w-3", invoiceSent ? "text-blue-600 dark:text-blue-400" : "")} aria-hidden="true" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pagination Controls */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-border mt-4 text-xs text-muted-foreground bg-card p-3 rounded-xl shadow-sm border">
                        <div className="flex items-center gap-4">
                          <span>
                            {groupBy === "invoice" ? (
                              `Mostrando ${Math.min(totalCount, (currentPage - 1) * pageSize + 1)}–${Math.min(totalCount, currentPage * pageSize)} de ${totalCount} facturas`
                            ) : (
                              `Mostrando ${Math.min(totalCount, (currentPage - 1) * pageSize + 1)}–${Math.min(totalCount, currentPage * pageSize)} de ${totalCount} filas`
                            )}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span>Mostrar:</span>
                            <select
                              value={pageSize}
                              onChange={e => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                              }}
                              className="h-8 rounded-lg border border-border bg-background px-2 font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              {[10, 25, 50, 100, 200].map(size => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(1)}
                            title="Primera página"
                          >
                            <ChevronsLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            title="Página anterior"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="px-3 font-semibold text-foreground">
                            Página {currentPage} de {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            title="Página siguiente"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-lg"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(totalPages)}
                            title="Última página"
                          >
                            <ChevronsRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Card className="p-12 text-center bg-muted/20 border-dashed border-2">
                  <Truck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" aria-hidden="true" />
                  {!manifestFilter ? (
                    <>
                      <p className="text-sm font-bold text-foreground">Paso 1: Selecciona un Manifiesto Activo</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Elige un manifiesto del selector arriba para cargar sus paquetes y ver las rutas.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-foreground">Paso 2: Selecciona una Ruta</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Haz clic en una de las rutas disponibles arriba con paquetes asignados.
                      </p>
                    </>
                  )}
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── View Route Modal (real-time delivery monitor) ──────────────────── */}
      <Dialog open={!!viewingRoute} onOpenChange={(open) => { if (!open) setViewingRoute(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0">
          {viewingRoute && (
            <RouteViewModal
              route={viewingRoute}
              onClose={() => setViewingRoute(null)}
              onEdit={(r) => { setViewingRoute(null); handleOpenEdit(r); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Package Details Dialog (details mode only) ──────────────────── */}
      <Dialog
        open={(viewMode === 'details' && !!viewingPkg) || (viewMode === 'invoice' && !!viewingPkg && !pkgInvoice)}
        onOpenChange={(open) => { if (!open) { setViewingPkg(null); setPkgInvoice(null); } }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              {viewMode === 'details' ? <Eye className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {viewMode === 'details' ? 'Detalles del cliente' : 'Factura asociada'}
              {viewingPkg?.slCode && <span className="ml-1 text-xs font-normal text-muted-foreground">· {viewingPkg.slCode}</span>}
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              {viewingPkg?.tracking ?? ""}{viewingPkg?.customerName ? ` · ${viewingPkg.customerName}` : ""}
            </DialogDescription>
          </DialogHeader>

          {viewMode === 'details' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {[
                { label: "Tracking", value: viewingPkg?.tracking },
                { label: "SL Code", value: viewingPkg?.slCode },
                { label: "Cliente", value: viewingPkg?.customerName },
                { label: "Manifiesto", value: viewingPkg?.manifestNumber || viewingPkg?.manifiesto },
                { label: "Descripción", value: viewingPkg?.description ?? viewingPkg?.descripcion },
                { label: "Peso", value: viewingPkg?.weight != null ? `${viewingPkg.weight} KG` : undefined },
                { label: "Valor", value: viewingPkg?.price != null ? `$${Number(viewingPkg.price).toFixed(2)}` : undefined },
                { label: "Ruta", value: viewingPkg?.ruta },
                { label: "Estado", value: STATUS_LABELS[viewingPkg?.status] ?? viewingPkg?.status },
                { label: "Email", value: viewingPkg?.customerEmail },
                { label: "DNI", value: viewingPkg?.customerDni },
                { label: "Origen", value: viewingPkg?.origin },
              ].filter(f => f.value).map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p className="font-semibold text-foreground truncate">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            /* Invoice mode — loading or not found (pkgInvoice found renders standalone below) */
            invoiceLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando factura...
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No hay factura asociada a este tracking
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      {/* ── Standalone Invoice Preview (outside any Dialog so it renders correctly) ── */}
      {viewMode === 'invoice' && !!pkgInvoice && (
        <NovaInvoicePreview
          invoice={pkgInvoice}
          onClose={() => { setViewingPkg(null); setPkgInvoice(null); }}
          onConfirmSend={async (inv) => {
            await sendInvoiceEmails([inv as InvoiceRecord]);
            const t = (viewingPkg?.tracking ?? '').toUpperCase();
            if (t) setInvoiceStatusMap(prev => new Map(prev).set(t, 'sent'));
            setPkgInvoice({ ...pkgInvoice, status: 'sent' });
          }}
          onTestSend={async (inv, email) => { await sendTestInvoiceEmail(inv as InvoiceRecord, email); }}
        />
      )}

      {/* ── Catalog Create/Edit Modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-4xl"
            >
              <Card className="bg-white border-gray-300 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Truck className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <h2 id="route-modal-title" className="text-lg font-bold text-gray-900">
                        {editingRoute ? t("editRoute") : t("createNewRoute")}
                      </h2>
                      <p className="text-xs text-gray-500">Configura los detalles de la ruta de entrega</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowCreateModal(false); resetForm(); }}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                    aria-label="Cerrar modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Body - Two columns */}
                <div className="max-h-[65vh] overflow-y-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-gray-200">

                    {/* ── LEFT COLUMN: Identity ──────────────────────────── */}
                    <div className="p-6 space-y-5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Identificación</p>

                      <div>
                        <Label className="text-sm font-medium mb-1.5 block text-gray-700">{t("routeName")} *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={t("routeNamePlaceholder")}
                          className="bg-white border-gray-300 text-gray-900"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm font-medium mb-1.5 block text-gray-700">Provincia</Label>
                          <Select
                            value={formData.province}
                            onValueChange={(v) => setFormData({ ...formData, province: v })}
                          >
                            <SelectTrigger className="bg-white border-gray-300">
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              {COSTA_RICA_PROVINCES.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm font-medium mb-1.5 block text-gray-700">Tipo</Label>
                          <Select
                            value={formData.type}
                            onValueChange={(v) => setFormData({ ...formData, type: v as "metropolitan" | "encomienda" })}
                          >
                            <SelectTrigger className="bg-white border-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="metropolitan">Metropolitana</SelectItem>
                              <SelectItem value="encomienda">Encomienda</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Color picker - visual grid */}
                      <div>
                        <Label className="text-sm font-medium mb-2 block text-gray-700">Color</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "blue-600", css: "bg-blue-600", label: "Azul" },
                            { value: "red-600", css: "bg-red-600", label: "Rojo" },
                            { value: "green-600", css: "bg-green-600", label: "Verde" },
                            { value: "yellow-500", css: "bg-yellow-500", label: "Amarillo" },
                            { value: "purple-600", css: "bg-purple-600", label: "Morado" },
                            { value: "orange-500", css: "bg-orange-500", label: "Naranja" },
                            { value: "pink-500", css: "bg-pink-500", label: "Rosa" },
                            { value: "cyan-500", css: "bg-cyan-500", label: "Cyan" },
                            { value: "emerald-600", css: "bg-emerald-600", label: "Esmeralda" },
                            { value: "indigo-600", css: "bg-indigo-600", label: "Índigo" },
                            { value: "teal-600", css: "bg-teal-600", label: "Teal" },
                            { value: "slate-600", css: "bg-slate-600", label: "Gris" },
                          ].map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => setFormData({ ...formData, color: c.value })}
                              className={cn(
                                "w-8 h-8 rounded-full transition-all",
                                c.css,
                                formData.color === c.value
                                  ? "ring-2 ring-offset-2 ring-gray-900 scale-110"
                                  : "hover:scale-110 opacity-70 hover:opacity-100"
                              )}
                              title={c.label}
                              aria-label={`Color ${c.label}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Status + Agent in same column */}
                      <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                        <div>
                          <Label className="text-sm font-medium">{t("status")}</Label>
                          <p className="text-xs text-gray-500">
                            {formData.status === "active" ? t("routeIsActive") : t("routeIsInactive")}
                          </p>
                        </div>
                        <Switch
                          checked={formData.status === "active"}
                          onCheckedChange={(c) => setFormData({ ...formData, status: c ? "active" : "inactive" })}
                          className="data-[state=checked]:bg-gray-900"
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-1.5 block text-gray-700">{t("assignAgents")}</Label>
                        <Popover open={agentSearchOpen} onOpenChange={setAgentSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={agentSearchOpen}
                              className="w-full justify-between bg-white border-gray-300 text-gray-900 font-normal"
                            >
                              {selectedAgents.length === 0
                                ? t("selectAgents")
                                : `${selectedAgents.length} ${t("agentsSelected")}`}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput
                                placeholder={t("searchAgents")}
                                value={agentSearchValue}
                                onValueChange={setAgentSearchValue}
                              />
                              <CommandEmpty>{t("noAgentsFound")}</CommandEmpty>
                              <CommandGroup className="max-h-48 overflow-y-auto">
                                {agents.map((agent) => (
                                  <CommandItem key={agent.id} value={agent.name} onSelect={() => toggleAgent(agent.id)}>
                                    <Check className={cn("mr-2 h-4 w-4", selectedAgents.includes(agent.id) ? "opacity-100" : "opacity-0")} />
                                    {agent.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {selectedAgents.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {selectedAgents.map((aid) => {
                              const a = agents.find((ag) => ag.id === aid);
                              return a ? (
                                <Badge key={aid} variant="outline" className="bg-gray-100 text-gray-800 border-gray-300 text-xs">
                                  {a.name}
                                  <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => toggleAgent(aid)} aria-label={`Quitar ${a.name}`} />
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── RIGHT COLUMN: Coverage & Fleet ─────────────────── */}
                    <div className="p-6 space-y-5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cobertura y Flota</p>

                      <div>
                        <Label className="text-sm font-medium mb-1.5 block text-gray-700">Cantones</Label>
                        <textarea
                          value={formData.cantons}
                          onChange={(e) => setFormData({ ...formData, cantons: e.target.value })}
                          placeholder="Ej: Escazú, Santa Ana, Belén"
                          rows={2}
                          className="w-full px-3 py-2 rounded-md border bg-white border-gray-300 text-gray-900 text-sm focus:ring-2 focus:ring-gray-400 outline-none resize-none"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Separados por coma</p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-1.5 block text-gray-700">Áreas / Zonas</Label>
                        <textarea
                          value={formData.areas}
                          onChange={(e) => setFormData({ ...formData, areas: e.target.value })}
                          placeholder="Ej: Centro, Norte, Sur, Paseo Colón"
                          rows={2}
                          className="w-full px-3 py-2 rounded-md border bg-white border-gray-300 text-gray-900 text-sm focus:ring-2 focus:ring-gray-400 outline-none resize-none"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Separados por coma</p>
                      </div>

                      {/* Fleet */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-gray-700">Flota de Vehículos</Label>
                          <button
                            type="button"
                            onClick={() => setVehicles((prev) => [...prev, emptyVehicle()])}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Agregar
                          </button>
                        </div>

                        <div className="space-y-2">
                          {vehicles.map((v, idx) => {
                            const VehicleIcon = VEHICLE_TYPES.find(vt => vt.value === v.type)?.Icon ?? Truck;
                            return (
                              <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                                <div className="flex items-center gap-2">
                                  <VehicleIcon className="h-4 w-4 text-gray-400 shrink-0" />
                                  <select
                                    value={v.type}
                                    onChange={(e) => setVehicles((prev) => prev.map((x, i) => i === idx ? { ...x, type: e.target.value as VehicleType } : x))}
                                    className="px-2 py-1.5 rounded-md border bg-white border-gray-300 text-gray-900 text-sm focus:ring-2 focus:ring-gray-400 outline-none w-28"
                                  >
                                    {VEHICLE_TYPES.map((vt) => (
                                      <option key={vt.value} value={vt.value}>{vt.label}</option>
                                    ))}
                                  </select>
                                  <Input
                                    value={v.plate}
                                    onChange={(e) => setVehicles((prev) => prev.map((x, i) => i === idx ? { ...x, plate: e.target.value.toUpperCase() } : x))}
                                    placeholder="Placa"
                                    className="bg-white border-gray-300 text-gray-900 h-8 text-sm flex-1"
                                  />
                                  <Input
                                    type="number"
                                    value={v.capacity ?? ""}
                                    onChange={(e) => setVehicles((prev) => prev.map((x, i) => i === idx ? { ...x, capacity: e.target.value ? Number(e.target.value) : undefined } : x))}
                                    placeholder="Kg"
                                    className="bg-white border-gray-300 text-gray-900 h-8 text-sm w-16"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setVehicles((prev) => prev.filter((_, i) => i !== idx))}
                                    disabled={vehicles.length === 1}
                                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    aria-label="Eliminar vehículo"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                {/* Driver selector */}
                                <div className="flex items-center gap-2 pl-6">
                                  <Users className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                  <select
                                    value={v.driverId ?? ""}
                                    onChange={(e) => {
                                      const dId = e.target.value || undefined;
                                      const dName = dId ? (agents.find(a => a.id === dId)?.name ?? '') : undefined;
                                      setVehicles((prev) => prev.map((x, i) => i === idx ? { ...x, driverId: dId, driverName: dName } : x));
                                    }}
                                    className="flex-1 px-2 py-1 rounded-md border bg-white border-gray-300 text-gray-900 text-xs focus:ring-2 focus:ring-gray-400 outline-none"
                                  >
                                    <option value="">Sin chofer asignado</option>
                                    {agents.map((a) => (
                                      <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end bg-gray-50/50">
                  <Button
                    variant="outline"
                    onClick={() => { setShowCreateModal(false); resetForm(); }}
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  >
                    {t("common.cancel")}
                  </Button>
                  <PermissionTooltip allowed={editingRoute ? canUpdate('routes') : canCreate('routes')}>
                    <Button
                      onClick={handleSaveRoute}
                      disabled={createRouteMutation.isPending || updateRouteMutation.isPending || (editingRoute ? !canUpdate('routes') : !canCreate('routes'))}
                      className="flex items-center gap-2 bg-gray-900 text-white hover:bg-gray-800"
                    >
                      {(createRouteMutation.isPending || updateRouteMutation.isPending)
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Save className="h-4 w-4" />
                      }
                      {t("common.save")}
                    </Button>
                  </PermissionTooltip>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Temp Customer Warning Modal ────────────────────────────────────── */}
      <Dialog open={tempWarningOpen} onOpenChange={setTempWarningOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Paquetes sin cliente asociado
            </DialogTitle>
            <DialogDescription className="text-sm">
              Se detectaron <strong>{tempWarningPackages.length}</strong> paquete(s) asignados a clientes temporales o huérfanos (ej. SL-NAN). 
              Estos paquetes y sus facturas deberían ser revisados y reasignados en la pantalla correspondiente para garantizar la integridad de los registros.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 max-h-60 overflow-y-auto rounded-md border border-border">
            <div className="grid grid-cols-3 bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border sticky top-0">
              <span>Tracking</span>
              <span>SL Code</span>
              <span>Cliente</span>
            </div>
            <div className="divide-y divide-border">
              {tempWarningPackages.map((pkg, idx) => (
                <div key={idx} className="grid grid-cols-3 px-3 py-2 text-xs text-foreground items-center">
                  <span className="font-mono truncate pr-2" title={pkg.tracking}>{pkg.tracking ?? "—"}</span>
                  <span className="text-amber-600 dark:text-amber-500 font-semibold truncate pr-2" title={pkg.slCode}>{pkg.slCode ?? "—"}</span>
                  <span className="truncate" title={pkg.customerName}>{pkg.customerName ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setTempWarningOpen(false);
                setPendingPrintAction(null);
                setTempWarningPackages([]);
              }}
            >
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (pendingPrintAction) pendingPrintAction();
                setTempWarningOpen(false);
                setPendingPrintAction(null);
                setTempWarningPackages([]);
              }}
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir de todos modos
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Manifest Wizard ──────────────────────────────────────────── */}
      <BulkManifestWizardModal
        open={manifestWizardOpen}
        onClose={() => setManifestWizardOpen(false)}
        packages={
          ((filteredPkgs as any[]).filter(
            p => selectedPkgs.has(p.id) && normalizeStatus(p.status) === 'customs'
          )) as WizardPackage[]
        }
        allPackages={
          ((filteredPkgs as any[]).filter(
            p => normalizeStatus(p.status) === 'customs'
          )) as WizardPackage[]
        }
        availableManifests={allManifestsList}
        onSuccess={() => {
          setSelectedPkgs(new Set());
          qc.invalidateQueries({ queryKey: ["route-packages"] });
        }}
      />

      {/* ── Dispatch Confirm Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm"
            >
              <Card className="bg-white dark:bg-card border-gray-300 dark:border-border p-6 space-y-4">
                <h3 id="confirm-modal-title" className="text-lg font-bold text-gray-900 dark:text-foreground">
                  Confirmar actualización
                </h3>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Se ejecutará el siguiente flujo para <strong className="text-foreground">{selectedPkgs.size}</strong> paquete{selectedPkgs.size !== 1 ? 's' : ''}:
                  </p>
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {/* Step 1 — always fixed */}
                    <div className="flex items-start gap-3 px-4 py-3 bg-muted/20">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-2 border-primary bg-primary flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">Cambiar paquetes a {STATUS_LABELS[confirmAction] ?? confirmAction}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Actualiza el estado de {selectedPkgs.size} paquete{selectedPkgs.size !== 1 ? 's' : ''} en SP1.</p>
                      </div>
                    </div>
                    {/* Steps for delivered — invoice marking */}
                    {confirmAction === 'delivered' && (
                      <>
                        {/* Option "Marcar facturas asociadas como Pagado" hidden by user request */}
                        {false && (
                          <>
                            <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                              <Checkbox
                                id="route-opt-mark-paid"
                                checked={routeActionOptions.markInvoicesPaid}
                                onCheckedChange={(v) => setRouteActionOptions(o => ({ ...o, markInvoicesPaid: !!v }))}
                                className="mt-0.5 shrink-0"
                              />
                              <div>
                                <p className="text-sm font-medium text-foreground leading-tight">Marcar facturas asociadas como Pagado</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Busca las facturas que incluyan estos paquetes y las marca como pagadas.</p>
                              </div>
                            </label>
                            {routeActionOptions.markInvoicesPaid && (
                              <div className="px-4 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-y border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 select-none">
                                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">Confirmación Administrativa Requerida:</span> Esta opción marcará automáticamente las facturas asociadas como <strong>PAGADAS</strong> en el sistema. Asegúrese de contar con la aprobación del administrador y los comprobantes antes de proceder.
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                          <Checkbox
                            id="route-opt-sync-invoices-sp2"
                            checked={routeActionOptions.syncInvoicesSp2}
                            onCheckedChange={(v) => setRouteActionOptions(o => ({ ...o, syncInvoicesSp2: !!v }))}
                            className="mt-0.5 shrink-0"
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground leading-tight">Sincronizar estado de facturas con SP2</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Actualiza el estado de las facturas a Pagado en SmartWeb (SP2).</p>
                          </div>
                        </label>
                      </>
                    )}
                    {/* For non-delivered — optional invoice status update */}
                    {confirmAction !== 'delivered' && (
                      <>
                        <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                          <Checkbox
                            id="route-opt-update-invoices"
                            checked={routeActionOptions.updateInvoices}
                            onCheckedChange={(v) => setRouteActionOptions(o => ({ ...o, updateInvoices: !!v }))}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground leading-tight">Actualizar estado de facturas relacionadas</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Cambia el estado de las facturas que incluyan estos paquetes.</p>
                          </div>
                        </label>
                        {routeActionOptions.updateInvoices && (
                          <div className="flex items-center gap-3 px-4 py-3 bg-muted/10">
                            <span className="text-xs text-muted-foreground shrink-0">Cambiar a:</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setRouteActionOptions(o => ({ ...o, invoiceStatus: 'sent' }))}
                                className={cn(
                                  "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                                  routeActionOptions.invoiceStatus === 'sent'
                                    ? "bg-foreground text-background border-foreground"
                                    : "bg-card text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                                )}
                              >
                                Enviada
                              </button>
                              <button
                                type="button"
                                onClick={() => setRouteActionOptions(o => ({ ...o, invoiceStatus: 'paid' }))}
                                className={cn(
                                  "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                                  routeActionOptions.invoiceStatus === 'paid'
                                    ? "bg-foreground text-background border-foreground"
                                    : "bg-card text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                                )}
                              >
                                Pagada
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {/* Last step — sync packages to SP2 (all statuses) */}
                    <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                      <Checkbox
                        id="route-opt-sync-sp2"
                        checked={routeActionOptions.syncSp2}
                        onCheckedChange={(v) => setRouteActionOptions(o => ({ ...o, syncSp2: !!v }))}
                        className="mt-0.5 shrink-0"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">Sincronizar paquetes con SP2</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Actualiza el estado de los paquetes en SmartWeb (SP2) / portal del cliente.</p>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmAction(null)}
                    disabled={isDispatching}
                    className="text-sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() =>
                      runBulkUpdate(confirmAction, {
                        dispatchedRoute: dispatchRoute?.id ?? "",
                        routeName: dispatchRoute?.name ?? "",
                        [`${confirmAction}At`]: new Date().toISOString(),
                      }, routeActionOptions)
                    }
                    disabled={isDispatching}
                    className="bg-gray-900 text-white hover:bg-gray-800 flex items-center gap-2"
                  >
                    {isDispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Confirmar
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── GTI download selection dialog ─────────────────────────────────── */}
      <Dialog open={gtiDialogOpen} onOpenChange={v => { if (!isDownloadingGTI) setGtiDialogOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Download className="h-4 w-4" />
              Descargar GTI — {manifestFilter}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecciona el formato y qué facturas incluir. El correo se omite en Excel.
            </DialogDescription>
          </DialogHeader>

          {/* Format selector */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg border border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setGtiDownloadFormat('xlsx')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all",
                gtiDownloadFormat === 'xlsx'
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Download className="h-3 w-3" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setGtiDownloadFormat('csv')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all",
                gtiDownloadFormat === 'csv'
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText className="h-3 w-3" />
              CSV (.csv)
            </button>
          </div>

          <div className="space-y-2 py-1">
            {/* Option: All */}
            <button
              type="button"
              onClick={() => setGtiDownloadMode('all')}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                gtiDownloadMode === 'all'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Todos los registros</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gtiInvoices?.all.length ?? 0} factura{gtiInvoices?.all.length !== 1 ? 's' : ''} del manifiesto
                  {gtiInvoices && gtiInvoices.all.length > gtiInvoices.newOnly.length && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">({gtiInvoices.all.length - gtiInvoices.newOnly.length} ya descargada{gtiInvoices.all.length - gtiInvoices.newOnly.length !== 1 ? 's' : ''})</span>
                  )}
                </p>
              </div>
              <div className={cn(
                "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
                gtiDownloadMode === 'all' ? "border-primary bg-primary" : "border-muted-foreground"
              )} />
            </button>

            {/* Option: New only */}
            <button
              type="button"
              onClick={() => setGtiDownloadMode('new')}
              disabled={!gtiInvoices?.newOnly.length}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                gtiDownloadMode === 'new'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40",
                !gtiInvoices?.newOnly.length && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Solo nuevos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gtiInvoices?.newOnly.length ?? 0} factura{gtiInvoices?.newOnly.length !== 1 ? 's' : ''} sin descargar
                </p>
                {!gtiInvoices?.newOnly.length && (
                  <p className="text-xs text-muted-foreground/60 mt-0.5">Todas ya fueron descargadas</p>
                )}
              </div>
              <div className={cn(
                "w-4 h-4 rounded-full border-2 shrink-0 transition-colors",
                gtiDownloadMode === 'new' ? "border-primary bg-primary" : "border-muted-foreground"
              )} />
            </button>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setGtiDialogOpen(false)} disabled={isDownloadingGTI}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleConfirmGTIDownload}
              disabled={isDownloadingGTI || (gtiDownloadMode === 'new' && !gtiInvoices?.newOnly.length)}
            >
              {isDownloadingGTI
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              Descargar {gtiDownloadMode === 'all' ? 'Todos' : 'Nuevos'} ({gtiDownloadFormat.toUpperCase()})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Route Check-Out modal ────────────────────────────────────────── */}
      {showCheckOut && routeSession && (
        <RouteCheckOut
          open={showCheckOut}
          session={routeSession}
          deliveredPackageIds={
            new Set(
              (filteredPkgs as any[])
                .filter(p => p.status === 'delivered')
                .map(p => p.id)
            )
          }
          onClosed={handleCheckOutComplete}
          onCancel={() => setShowCheckOut(false)}
        />
      )}

    </DashboardLayout>
  );
}
