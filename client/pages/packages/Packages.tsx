import { useState, useMemo, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PackagesDataTable } from "@/components/packages/PackagesDataTable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Edit2, Eye, Plane, Truck, Package as PackageIcon, CalendarIcon, X, Sparkles, CheckCircle, AlertTriangle, RefreshCw, Search, Layers, ChevronRight, ChevronDown, Database, Users, Loader2, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { usePackagesPaginated, useCreatePackage, useUpdatePackage, useDeletePackage, usePackageSearch, type PaginationParams, type PaginationMeta } from "@/lib/hooks/queries/usePackages";
import { SkeletonDataTable } from "@/components/SkeletonLoaders";
import { useRoutes } from "@/lib/hooks/queries/useRoutes";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { firebaseApi } from '@/lib/firebase/callable';
import { firestoreApi, backfillPackageSearchTokens } from '@/lib/firebase/firestore-client';
import { db } from '@/lib/firebase';
import { addDoc, updateDoc, doc, arrayUnion, collection, getDocs, query, where, onSnapshot, Timestamp, orderBy, limit } from 'firebase/firestore';
import { TagInput } from "@/components/packages/TagInput";
import type { Package } from "@/types";
import { cn } from "@/lib/utils";
import { BulkAddPackagesModal } from "@/components/packages/BulkAddPackagesModal";
import { CreatePackageModal, type PackageModalPayload, type PackageFormData } from "@/components/packages/CreatePackageModal";
import { createOrGetTempCustomer } from "@/lib/services/manifest-processor";
import { upsertPackagesToManifestDoc } from "@/lib/services/manifest-consolidation-service";
import { syncPackagesToSmartWeb } from "@/lib/services/sync-smartweb-service";
import { ManifestPicker } from "@/components/manifest/ManifestPicker";
import { translateToJQL } from "@/lib/services/gemini-client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// Package statuses and flags will be translated dynamically
const PACKAGE_STATUS_VALUES = [
  "pre_alerted",
  "received",
  "in_transit",
  "customs",
  "retained",
  "on_route",
  "delivered",
  "consolidated",
  "returned",
];

const FLAG_STATUS_VALUES = [
  "normal",
  "requires_documents",
  "stuck_in_customs",
  "clear_to_proceed",
];

const JQL_FIELDS_MAP: Record<string, string> = {
  "tracking": "trackingNumber",
  "t": "trackingNumber",
  "status": "status",
  "s": "status",
  "route": "ruta",
  "r": "ruta",
  "ruta": "ruta",
  "weight": "weight",
  "w": "weight",
  "peso": "weight",
  "customer": "customerName",
  "client": "customerName",
  "c": "customerName",
  "name": "customerName",
  "code": "slCode",
  "slcode": "slCode",
  "manifest": "manifestNumber",
  "m": "manifestNumber",
  "flag": "flagStatus",
  "f": "flagStatus",
  "dni": "dni",
  "cedula": "dni",
  "invoice": "invoiceNumber",
  "factura": "invoiceNumber",
  "email": "customerEmail",
  "correo": "customerEmail"
};

const resolveStatus = (val: string): string => {
  const map: Record<string, string> = {
    "pre_alerted": "pre_alerted",
    "pre-alerted": "pre_alerted",
    "pre_alerta": "pre_alerted",
    "pre-alerta": "pre_alerted",
    "prealerta": "pre_alerted",
    "received": "received",
    "recibido": "received",
    "in_transit": "in_transit",
    "in-transit": "in_transit",
    "transito": "in_transit",
    "transit": "in_transit",
    "customs": "customs",
    "aduana": "customs",
    "aduanas": "customs",
    "retained": "retained",
    "retenido": "retained",
    "held": "retained",
    "consolidated": "consolidated",
    "consolidado": "consolidated",
    "processed": "processed",
    "facturado": "processed",
    "on_route": "on_route",
    "on-route": "on_route",
    "route": "on_route",
    "in_route": "on_route",
    "in-route": "on_route",
    "en_ruta": "on_route",
    "en-ruta": "on_route",
    "en ruta": "on_route",
    "pickup": "pickup",
    "retira": "pickup",
    "delivered": "delivered",
    "entregado": "delivered",
    "returned": "returned",
    "devuelto": "returned"
  };
  return map[val] || val;
};

const resolveFlag = (val: string): string => {
  const map: Record<string, string> = {
    "normal": "normal",
    "requires_documents": "requires_documents",
    "requires-documents": "requires_documents",
    "documentos": "requires_documents",
    "stuck_in_customs": "stuck_in_customs",
    "stuck-in-customs": "stuck_in_customs",
    "retenido_aduana": "stuck_in_customs",
    "clear_to_proceed": "clear_to_proceed",
    "clear-to-proceed": "clear_to_proceed",
    "liberado": "clear_to_proceed",
    "aprobado": "clear_to_proceed"
  };
  return map[val] || val;
};

/**
 * Parses a Jira-like Query Language (JQL) string into a high-performance in-memory predicate function.
 *
 * Supports operators: `=`, `!=`, `~` (contains), `!~` (not contains), `>`, `<`, `>=`, `<=`.
 * Handles suffix matching on normalized identifiers (trackingNumber, slCode, manifestNumber, dni, invoiceNumber).
 *
 * @param queryStr - Raw user search input (e.g. `status = "received" AND ruta = "GAM"`)
 * @returns Filter predicate function `(pkg: Package) => boolean` or `null` if query is plain text
 */
function parseJQL(queryStr: string): ((pkg: any) => boolean) | null {
  const trimmed = queryStr.trim();
  if (!trimmed) return null;

  const hasOperator = /[=><~]/.test(trimmed);
  if (!hasOperator) return null; // Fallback to standard search

  let isOr = false;
  let parts = trimmed.split(/\s+AND\s+/i);
  if (parts.length === 1) {
    const orParts = trimmed.split(/\s+OR\s+/i);
    if (orParts.length > 1) {
      parts = orParts;
      isOr = true;
    }
  }

  const rules: ((pkg: any) => boolean)[] = [];

  for (const part of parts) {
    const match = part.match(/^\s*(\w+)\s*(!=|>=|<=|=|>|<|~|!~)\s*(["']?.*?["']?)\s*$/);
    if (!match) continue;

    const [, rawField, op, rawValue] = match;
    const field = rawField.toLowerCase().trim();
    const value = rawValue.replace(/^["']|["']$/g, "").trim().toLowerCase();

    const mappedField = JQL_FIELDS_MAP[field];
    if (!mappedField) continue;

    rules.push((pkg: any) => {
      let val: any;
      if (mappedField === "customerName") {
        val = pkg.customerName || pkg.customer?.fullName || pkg.customer?.name || "";
      } else if (mappedField === "slCode") {
        val = pkg.slCode || pkg.customer?.slCode || "";
      } else if (mappedField === "ruta") {
        val = pkg.ruta || pkg.destination || "";
      } else if (mappedField === "dni") {
        val = pkg.dni || pkg.customer?.dni || "";
      } else if (mappedField === "customerEmail") {
        val = pkg.customerEmail || pkg.email || pkg.customer?.email || "";
      } else {
        val = pkg[mappedField];
      }

      let valStr = String(val ?? "").toLowerCase().trim();
      let matchVal = value;

      if (mappedField === "status") {
        valStr = resolveStatus(valStr);
        matchVal = resolveStatus(matchVal);
      } else if (mappedField === "flagStatus") {
        valStr = resolveFlag(valStr);
        matchVal = resolveFlag(matchVal);
      }

      const isNormalizedField = (
        mappedField === "trackingNumber" ||
        mappedField === "slCode" ||
        mappedField === "dni" ||
        mappedField === "invoiceNumber"
      );

      const valNorm = isNormalizedField ? valStr.replace(/[-\s]/g, "") : valStr;
      const matchNorm = isNormalizedField ? matchVal.replace(/[-\s]/g, "") : matchVal;

      const isSuffixMatch = (matchVal.length === 4 || matchVal.length === 6 || matchVal.length === 8) &&
                            (mappedField === "trackingNumber" || mappedField === "slCode" || mappedField === "manifestNumber" || mappedField === "dni" || mappedField === "invoiceNumber");

      switch (op) {
        case "=":
          if (valStr === matchVal || (isNormalizedField && valNorm === matchNorm)) {
            return true;
          }
          if (isSuffixMatch) {
            return valStr.endsWith(matchVal) || valNorm.endsWith(matchNorm);
          }
          return false;
        case "!=":
          if (isSuffixMatch) {
            return valStr !== matchVal && !valStr.endsWith(matchVal) && (!isNormalizedField || (!valNorm.endsWith(matchNorm) && valNorm !== matchNorm));
          }
          return valStr !== matchVal && (!isNormalizedField || valNorm !== matchNorm);
        case "~":
          return valStr.includes(matchVal) || (isNormalizedField && valNorm.includes(matchNorm));
        case "!~":
          return !valStr.includes(matchVal) && (!isNormalizedField || !valNorm.includes(matchNorm));
        case ">":
          return Number(val || 0) > Number(matchVal || 0);
        case "<":
          return Number(val || 0) < Number(matchVal || 0);
        case ">=":
          return Number(val || 0) >= Number(matchVal || 0);
        case "<=":
          return Number(val || 0) <= Number(matchVal || 0);
        default:
          return false;
      }
    });
  }

  if (rules.length === 0) return null;

  return (pkg: any) => {
    if (isOr) {
      return rules.some((rule) => rule(pkg));
    } else {
      return rules.every((rule) => rule(pkg));
    }
  };
}

/**
 * Validates a user-entered JQL query syntax for errors before execution.
 *
 * @param queryStr - Raw query string
 * @returns Error description string if invalid, or empty string if valid / plain text search
 */
function validateJQLSyntax(queryStr: string): string {
  const trimmed = queryStr.trim();
  if (!trimmed) return "";
  const hasOperator = /[=><~]/.test(trimmed);
  if (!hasOperator) return ""; // Regular search fallback

  let parts = trimmed.split(/\s+AND\s+/i);
  if (parts.length === 1) {
    const orParts = trimmed.split(/\s+OR\s+/i);
    if (orParts.length > 1) {
      parts = orParts;
    }
  }

  for (const part of parts) {
    const match = part.match(/^\s*(\w+)\s*(!=|>=|<=|=|>|<|~|!~)\s*(["']?.*?["']?)\s*$/);
    if (!match) {
      return `Error en JQL: "${part}". Se espera formato: campo = valor.`;
    }
    const [, field] = match;
    if (!JQL_FIELDS_MAP[field.toLowerCase().trim()]) {
      return `Campo no válido: "${field}".`;
    }
  }
  return "";
}

// Helper component for smooth height transition of dynamic container content
const AnimateHeight = memo(function AnimateHeight({ children, className }: { children: React.ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setHeight(entry.contentRect.height);
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <motion.div
      animate={{ height }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={cn("overflow-hidden relative w-full", className)}
    >
      <div ref={containerRef} className="w-full">{children}</div>
    </motion.div>
  );
});

export default function PackagesEnhanced() {
  const { user } = useAuth();
  const { canCreate, canManage } = usePermissions();
  const { t } = useLocale(['packages', 'common', 'preFilters']);
  const { theme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isDark = theme === "dark";
  
  // Fetch routes for destination autocomplete
  const { data: routesData } = useRoutes();
  const activeRoutes = useMemo(() => {
    const data = (routesData as any)?.data || [];
    const routes = Array.isArray(data) ? data : [];
    return routes.filter((r: any) => r.status === 'active');
  }, [routesData]);

  // State management - Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  // State management - Pre-filters (required before loading data)
  const [preFiltersApplied, setPreFiltersApplied] = useState(false);
  const [preManifestNumber, setPreManifestNumber] = useState("");
  const [preType, setPreType] = useState<string | undefined>(undefined);
  const [preDateRange, setPreDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  
  // State management - Applied pre-filters (used for API call)
  const [appliedPreFilters, setAppliedPreFilters] = useState<{
    manifestNumber?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
  }>({});
  
  // State management - Table Filters (after pre-filters are applied)
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [destinationFilter, setDestinationFilter] = useState<string[]>([]);
  const [routeFilterOpen, setRouteFilterOpen] = useState(false);
  const [flagFilter, setFlagFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isBackfillingPackages, setIsBackfillingPackages] = useState(false);
  const [backfillPackagesProgress, setBackfillPackagesProgress] = useState<{ done: number; total: number } | null>(null);

  // State management - Data load limit and group by
  const [dataLoadLimit, setDataLoadLimit] = useState<'last4days' | 3000 | 5000 | 10000>('last4days');
  const [appliedDataLoadLimit, setAppliedDataLoadLimit] = useState<'last4days' | 3000 | 5000 | 10000>('last4days');
  const [groupBy, setGroupBy] = useState<'' | 'name' | 'slCode' | 'dni' | 'email'>('');

  // Derived: true when a manifest filter is active
  const isManifestMode = !!appliedPreFilters.manifestNumber;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const isEncomiendaRouteMismatch = useMemo(() => {
    if (!appliedPreFilters.manifestNumber) return false;
    const isEncomiendaManifest = appliedPreFilters.manifestNumber.toUpperCase().startsWith("ENC");
    return (
      isEncomiendaManifest &&
      destinationFilter.length > 0 &&
      !destinationFilter.some(d => d.toLowerCase() === "encomiendas")
    );
  }, [appliedPreFilters.manifestNumber, destinationFilter]);

  // State management - Orphans Audit
  const [isAuditing, setIsAuditing] = useState(false);
  const [orphansFilterActive, setOrphansFilterActive] = useState(false);
  const [orphanPackageIds, setOrphanPackageIds] = useState<Set<string>>(new Set());

  // JQL Search & Realtime state
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [realtimePackages, setRealtimePackages] = useState<Package[]>([]);
  const [isRealtimeLoading, setIsRealtimeLoading] = useState(false);
  const [jqlError, setJqlError] = useState("");
  const [aiInputOpen, setAiInputOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [syntaxHelpOpen, setSyntaxHelpOpen] = useState(false);
  


  // Validate JQL syntax in real-time
  useEffect(() => {
    setJqlError(validateJQLSyntax(searchQuery));
  }, [searchQuery]);
  // Fetch manifest numbers for pre-filter autocomplete
  const { data: manifestsData } = useQuery({
    queryKey: ['manifests', 'list'],
    queryFn: async () => {
      const result = await firestoreApi.manifests.list({
        pageSize: 100,
        orderByField: 'processedAt',
        orderDirection: 'desc',
      });
      return (result.data || []) as Array<{
        id: string;
        manifestNumber: string;
        manifestType?: string;
        totalPackages?: number;
        packages?: any[];
        totalCustomers?: number;
        processedAt?: string;
        country?: string;
        shippingType?: string;
        mergedInto?: string;
      }>;
    },
    staleTime: 1000 * 60 * 5,
  });
  const manifestOptions = useMemo(() => {
    const manifests = manifestsData || [];
    const seen = new Set<string>();
    manifests.forEach(m => {
      const val = (m.manifestNumber || m.id || '').trim();
      if (val) seen.add(val);
    });
    return Array.from(seen);
  }, [manifestsData]);

  const manifestPackageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (manifestsData || []).forEach(m => {
      const key = (m.manifestNumber || m.id || '').trim();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + (m.totalPackages ?? m.packages?.length ?? 0));
      }
    });
    return counts;
  }, [manifestsData]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Server-side freeform package search — always active when a query is typed.


  const handleBackfillPackages = async () => {
    setIsBackfillingPackages(true);
    setBackfillPackagesProgress(null);
    try {
      const result = await backfillPackageSearchTokens((done, total) =>
        setBackfillPackagesProgress({ done, total })
      );
      toast({
        title: t('common.success'),
        description: `Índice de paquetes generado: ${result.updated} actualizados, ${result.skipped} omitidos.`,
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: 'Error al generar el índice de búsqueda de paquetes.',
        variant: 'destructive',
      });
    } finally {
      setIsBackfillingPackages(false);
      setBackfillPackagesProgress(null);
    }
  };
  
  const handleAuditOrphans = async () => {
    // Audit based on whatever packages are currently loaded (pre-filtered data)
    const packagesToCheck = packagesResponse?.data || [];
    if (!packagesToCheck || packagesToCheck.length === 0) return;
    
    setIsAuditing(true);
    try {
      const trackingNumbers = packagesToCheck.map(p => p.trackingNumber).filter(Boolean) as string[];
      const invoicedTrackings = new Set<string>();
      
      // Check in chunks of 30 using array-contains-any
      for (let i = 0; i < trackingNumbers.length; i += 30) {
        const chunk = trackingNumbers.slice(i, i + 30);
        const invSnap = await getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains-any', chunk)));
        
        invSnap.forEach(d => {
          const data = d.data();
          if (data.trackingNumbers && Array.isArray(data.trackingNumbers)) {
            data.trackingNumbers.forEach((t: string) => invoicedTrackings.add(t));
          }
        });
      }
      
      const orphans = new Set<string>();
      let foundCount = 0;
      packagesToCheck.forEach(pkg => {
        if (!invoicedTrackings.has(pkg.trackingNumber)) {
           orphans.add(pkg.id);
           foundCount++;
        }
      });
      
      setOrphanPackageIds(orphans);
      setOrphansFilterActive(true);
      
      if (foundCount > 0) {
        toast({
          title: 'Auditoría completada',
          description: `Se encontraron ${foundCount} paquetes sin factura. Mostrando solo estos registros.`,
        });
      } else {
        toast({
          title: 'Auditoría completada',
          description: 'Todos los paquetes de la vista actual tienen factura asociada.',
        });
        setOrphansFilterActive(false);
      }
    } catch (error) {
      toast({
        title: 'Error en auditoría',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsAuditing(false);
    }
  };

  // Build pagination params for server-side filtering (only when pre-filters applied)
  // Note: search is NOT included here - it filters client-side on loaded data
  const paginationParams: PaginationParams = useMemo(() => {
    const isBulkLoad = typeof appliedDataLoadLimit === 'number';

    // Manifest mode: load ALL packages of the manifest at once for client-side pagination.
    // No date filter applied — manifests are bounded and we want every package.
    if (appliedPreFilters.manifestNumber) {
      const target = appliedPreFilters.manifestNumber.trim().toUpperCase();
      const selectedManifestDoc = (manifestsData || []).find(m => {
        const mId = (m.id || '').trim().toUpperCase();
        const mNum = (m.manifestNumber || '').trim().toUpperCase();
        return (mId === target || mNum === target) && m.mergedInto;
      });
      const queryManifestId = selectedManifestDoc?.mergedInto || appliedPreFilters.manifestNumber;

      return {
        page: 1,
        limit: 5000,
        sortBy,
        sortOrder,
        manifestNumber: queryManifestId,
        ...(appliedPreFilters.type && { type: appliedPreFilters.type }),
        ...(flagFilter && { flagStatus: flagFilter }),
      };
    }

    // Auto-compute date range when 'last4days' is selected and no manual date set
    let autoDateFrom: string | undefined;
    let autoDateTo: string | undefined;
    if (appliedDataLoadLimit === 'last4days' && !appliedPreFilters.dateFrom) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 4);
      from.setHours(0, 0, 0, 0);
      autoDateFrom = from.toISOString();
      autoDateTo = now.toISOString();
    }

    return {
      page: isBulkLoad ? 1 : currentPage,
      limit: isBulkLoad ? appliedDataLoadLimit : pageSize,
      sortBy,
      sortOrder,
      ...(appliedPreFilters.type && { type: appliedPreFilters.type }),
      ...((( appliedPreFilters.dateFrom || autoDateFrom) && { dateFrom: appliedPreFilters.dateFrom || autoDateFrom })),
      ...((( appliedPreFilters.dateTo   || autoDateTo  ) && { dateTo:   appliedPreFilters.dateTo   || autoDateTo   })),
      ...(flagFilter && { flagStatus: flagFilter }),
    };
  }, [currentPage, pageSize, appliedDataLoadLimit, sortBy, sortOrder, appliedPreFilters, flagFilter]);
  
  // Fetch packages with server-side pagination - ONLY when pre-filters are applied
  // Using enabled: false completely prevents API calls until user applies filters
  const { data: packagesResponse, isLoading, isFetching, error: packagesError } = usePackagesPaginated(
    paginationParams,
    { enabled: preFiltersApplied }
  );
  const packagesData = preFiltersApplied ? (packagesResponse?.data || []) : [];
  const paginationMeta = preFiltersApplied ? packagesResponse?.meta : undefined;
  
  const { data: routesResponse } = useRoutes();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);


  // React Query handles caching; real-time subscription removed.
  const createPackageMutation = useCreatePackage();
  const updatePackageMutation = useUpdatePackage(selectedPackage?.id || "");
  const deletePackageMutation = useDeletePackage();

  // Real-time Firestore package listener
  useEffect(() => {
    if (!preFiltersApplied || !realtimeEnabled) {
      setRealtimePackages([]);
      return;
    }

    setIsRealtimeLoading(true);
    const collectionRef = collection(db, "packages");
    const constraints: any[] = [];

    // Filter by manifestNumber
    if (appliedPreFilters.manifestNumber) {
      const target = appliedPreFilters.manifestNumber.trim().toUpperCase();
      const selectedManifestDoc = (manifestsData || []).find(m => {
        const mId = (m.id || '').trim().toUpperCase();
        const mNum = (m.manifestNumber || '').trim().toUpperCase();
        return (mId === target || mNum === target) && m.mergedInto;
      });
      const queryManifestId = selectedManifestDoc?.mergedInto || appliedPreFilters.manifestNumber;
      constraints.push(where("manifestNumber", "==", queryManifestId));
    }
    // Filter by type
    if (appliedPreFilters.type) {
      constraints.push(where("type", "==", appliedPreFilters.type));
    }
    // Filter by flagStatus
    if (flagFilter) {
      constraints.push(where("flagStatus", "==", flagFilter));
    }
    // Filter by date range
    if (appliedPreFilters.dateFrom || paginationParams.dateFrom) {
      constraints.push(where("createdAt", ">=", Timestamp.fromDate(new Date(appliedPreFilters.dateFrom || paginationParams.dateFrom!))));
    }
    if (appliedPreFilters.dateTo || paginationParams.dateTo) {
      constraints.push(where("createdAt", "<=", Timestamp.fromDate(new Date(appliedPreFilters.dateTo || paginationParams.dateTo!))));
    }

    // Sort by createdAt desc
    constraints.push(orderBy("createdAt", "desc"));

    // Add query limits matching dataLoadLimit choice
    const queryLimit = typeof appliedDataLoadLimit === 'number' ? appliedDataLoadLimit : 3000;
    constraints.push(limit(queryLimit));

    const q = query(collectionRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const pkgs: Package[] = [];
        snapshot.forEach((doc) => {
          const rawData = doc.data();
          const data: any = { ...rawData };
          // Convert any Firestore timestamps to ISO strings
          for (const key in data) {
            if (data[key] && typeof data[key] === 'object' && 'seconds' in data[key]) {
              data[key] = new Date(data[key].seconds * 1000).toISOString();
            }
          }
          pkgs.push({ id: doc.id, ...data } as Package);
        });
        setRealtimePackages(pkgs);
        setIsRealtimeLoading(false);
      },
      (error) => {
        console.error("Firestore onSnapshot subscription failed:", error);
        setIsRealtimeLoading(false);
        toast({
          title: "Suscripción en vivo desactivada",
          description: "No se pudieron suscribir los cambios en tiempo real. Cambiando a base de datos estática.",
          variant: "destructive"
        });
        setRealtimeEnabled(false);
      }
    );

    return () => unsubscribe();
  }, [preFiltersApplied, realtimeEnabled, appliedPreFilters, flagFilter, appliedDataLoadLimit, paginationParams.dateFrom, paginationParams.dateTo, toast]);

  const handleAiTranslate = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const jql = await translateToJQL(aiQuery);
      if (jql) {
        setSearchQuery(jql);
        toast({
          title: "Búsqueda IA",
          description: `Consulta JQL: ${jql}`,
        });
      } else {
        toast({
          title: "No se pudo traducir",
          description: "La IA no pudo interpretar la consulta. Intente simplificar la descripción.",
          variant: "destructive"
        });
      }
      setAiInputOpen(false);
      setAiQuery("");
    } catch (err: any) {
      console.error("AI translation failed:", err);
      toast({
        title: "Error de IA",
        description: err.message || "Fallo en la comunicación con el motor de IA.",
        variant: "destructive"
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Apply client-side JQL/search filter on the loaded data
  const packagesList = useMemo(() => {
    return realtimeEnabled ? realtimePackages : packagesData;
  }, [realtimeEnabled, realtimePackages, packagesData]);

  // Pre-compiled string index for ultra-fast matching of packages
  const indexedPackages = useMemo(() => {
    return (packagesList as Package[] || []).map((pkg) => {
      const p = pkg as any;
      const tracking = (p.trackingNumber || "").toLowerCase();
      const name = (p.customerName || p.customer?.fullName || p.customer?.name || "").toLowerCase();
      const slCode = (p.slCode || p.customer?.slCode || "").toLowerCase();
      const email = (p.customerEmail || p.email || p.customer?.email || "").toLowerCase();
      const origin = (p.origin || "").toLowerCase();
      const destination = (p.ruta || p.destination || "").toLowerCase();
      const status = (p.status || "").toLowerCase();
      const manifest = (p.manifestNumber || "").toLowerCase();
      const dni = (p.dni || p.customer?.dni || "").toLowerCase();

      // Suffixes for ultra-fast matching
      const trackingLast4 = tracking.slice(-4);
      const trackingLast6 = tracking.slice(-6);
      const trackingLast8 = tracking.slice(-8);

      const invoiceLast4 = (p.invoiceNumber || "").toLowerCase().slice(-4);
      const invoiceLast6 = (p.invoiceNumber || "").toLowerCase().slice(-6);
      const invoiceLast8 = (p.invoiceNumber || "").toLowerCase().slice(-8);

      const dniLast4 = dni.slice(-4);
      const dniLast6 = dni.slice(-6);
      const dniLast8 = dni.slice(-8);

      const slCodeLast4 = slCode.slice(-4);

      const indexStr = `${tracking} ${name} ${slCode} ${email} ${origin} ${destination} ${status} ${manifest} ${dni} ${trackingLast4} ${trackingLast6} ${trackingLast8} ${invoiceLast4} ${invoiceLast6} ${invoiceLast8} ${dniLast4} ${dniLast6} ${dniLast8} ${slCodeLast4}`;

      return {
        pkg,
        indexStr
      };
    });
  }, [packagesList]);

  // Check if search query matches any already loaded package in memory (cost efficiency)
  const hasLocalMatches = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (term.length < 2) return false;

    // If manifest filter is applied, all packages for this manifest are loaded in full
    if (appliedPreFilters.manifestNumber) {
      return true;
    }

    const termNorm = term.replace(/[-\s]/g, "");
    const jqlFn = parseJQL(searchQuery);

    if (jqlFn) {
      try {
        return indexedPackages.some(({ pkg }) => jqlFn(pkg));
      } catch (err) {
        return false;
      }
    }

    // Restrict local matches to unique identifiers (tracking number, slCode, invoice number)
    return indexedPackages.some(({ pkg }) => {
      const p = pkg as any;
      const tracking = (p.trackingNumber || "").toLowerCase().replace(/[-\s]/g, "");
      const slCode = (p.slCode || p.customer?.slCode || "").toLowerCase().replace(/[-\s]/g, "");
      const invoice = (p.invoiceNumber || "").toLowerCase().replace(/[-\s]/g, "");

      return (
        tracking === termNorm ||
        slCode === termNorm ||
        invoice === termNorm
      );
    });
  }, [indexedPackages, searchQuery, appliedPreFilters.manifestNumber]);

  // Server-side freeform package search — only active when query is typed and no local matches are found
  const freeformSearchActive = searchQuery.trim().length >= 2 && !hasLocalMatches;
  const { results: freeformResults, isLoading: freeformLoading } = usePackageSearch(
    freeformSearchActive ? searchQuery : '',
    300,
    60
  );

  const filteredPackages = useMemo(() => {
    let list = indexedPackages;

    // Filter packages by manifest or originalManifest client-side if a manifest filter is selected in the UI
    if (preManifestNumber) {
      const target = preManifestNumber.trim().toLowerCase();
      list = list.filter(({ pkg }) => {
        const p = pkg as any;
        const pm = (p.manifestNumber || '').trim().toLowerCase();
        const po = (p.originalManifest || '').trim().toLowerCase();
        return pm === target || po === target;
      });
    }

    // Client-side status filter — multi-select, applied after data load
    if (statusFilters.length > 0) {
      list = list.filter(({ pkg }) => statusFilters.includes((pkg as any).status || ''));
    }

    // Client-side route filter (case-insensitive)
    if (destinationFilter.length > 0) {
      const routesLower = destinationFilter.map(f => f.toLowerCase());
      list = list.filter(({ pkg }) => {
        const r = ((pkg as any).ruta || (pkg as any).destination || "").toLowerCase();
        return routesLower.some(fl => r === fl);
      });
    }

    // Apply JQL Filter if active
    const jqlFn = parseJQL(searchQuery);
    if (jqlFn) {
      try {
        let result = list.filter(({ pkg }) => jqlFn(pkg)).map(({ pkg }) => pkg);
        if (orphansFilterActive) {
          result = result.filter(pkg => orphanPackageIds.has(pkg.id));
        }
        return result;
      } catch (err: any) {
        console.error("JQL filter execution error:", err);
      }
    }

    if (!debouncedSearch.trim()) {
      let result = list.map(({ pkg }) => pkg);
      if (orphansFilterActive) {
        result = result.filter(pkg => orphanPackageIds.has(pkg.id));
      }
      return result;
    }

    const searchLower = debouncedSearch.toLowerCase().trim();
    let result = list
      .filter(({ indexStr }) => indexStr.includes(searchLower))
      .map(({ pkg }) => pkg);

    if (orphansFilterActive) {
      result = result.filter(pkg => orphanPackageIds.has(pkg.id));
    }

    return result;
  }, [indexedPackages, debouncedSearch, searchQuery, destinationFilter, statusFilters, orphansFilterActive, orphanPackageIds, preManifestNumber]);

  const isFiltersDirty = useMemo(() => {
    const typeDirty = (preType || undefined) !== (appliedPreFilters.type || undefined);
    
    const uiFromIso = preDateRange.from ? new Date(preDateRange.from) : undefined;
    if (uiFromIso) uiFromIso.setHours(0, 0, 0, 0);
    const appliedFromIso = appliedPreFilters.dateFrom ? new Date(appliedPreFilters.dateFrom) : undefined;
    const fromDirty = (uiFromIso?.toISOString() || "") !== (appliedFromIso?.toISOString() || "");
    
    const uiToIso = preDateRange.to ? new Date(preDateRange.to) : undefined;
    if (uiToIso) uiToIso.setHours(23, 59, 59, 999);
    const appliedToIso = appliedPreFilters.dateTo ? new Date(appliedPreFilters.dateTo) : undefined;
    const toDirty = (uiToIso?.toISOString() || "") !== (appliedToIso?.toISOString() || "");
    
    const limitDirty = dataLoadLimit !== appliedDataLoadLimit;
    
    const baseDirty = typeDirty || fromDirty || toDirty || limitDirty;
    if (baseDirty) return true;

    const manifestDirty = (preManifestNumber || "") !== (appliedPreFilters.manifestNumber || "");
    const routeOrStatusActive = destinationFilter.length > 0 || statusFilters.length > 0;

    if (manifestDirty || routeOrStatusActive) {
      // If we have loaded data and we have local matches, we are NOT dirty.
      if (preFiltersApplied && indexedPackages.length > 0 && filteredPackages.length > 0) {
        return false;
      }
      return true;
    }

    return false;
  }, [
    preManifestNumber, preType, preDateRange, dataLoadLimit, appliedPreFilters, appliedDataLoadLimit,
    destinationFilter, statusFilters, preFiltersApplied, indexedPackages.length, filteredPackages.length
  ]);
  
  // Get route names from active routes for the multi-select filter.
  // Kept in original case so server-side / client-side comparisons match the
  // ruta field stored on package docs.
  const routeNamesForFilter = useMemo(() => {
    return activeRoutes
      .map((route: any) => route.name as string)
      .filter(Boolean)
      .filter((name, index, self) => self.findIndex(n => n.toLowerCase() === name.toLowerCase()) === index)
      .sort();
  }, [activeRoutes]);

  // Helper: does the Encomiendas route exist?
  const encomiendaRoute = useMemo(
    () => routeNamesForFilter.find(n => n.toLowerCase() === 'encomiendas') ?? null,
    [routeNamesForFilter],
  );

  const toggleRouteFilter = (name: string) => {
    setDestinationFilter(prev =>
      prev.some(f => f.toLowerCase() === name.toLowerCase())
        ? prev.filter(f => f.toLowerCase() !== name.toLowerCase())
        : [...prev, name]
    );
    setCurrentPage(1);
  };

  const routeFilterLabel = useMemo(() => {
    if (destinationFilter.length === 0) return 'Rutas';
    if (destinationFilter.length === 1) return destinationFilter[0].toUpperCase();
    return `${destinationFilter.length} rutas`;
  }, [destinationFilter]);

  // Packages with mapped fields for PackagesDataTable
  // calculatedCost: use DB value if present, then fallback to price/cost stored in DB,
  // never override with a client-side formula that doesn't reflect the actual manifest price.
  const packagesWithCosts = useMemo(() => {
    return filteredPackages.map((pkg) => ({
      ...pkg,
      calculatedCost: pkg.calculatedCost != null
        ? pkg.calculatedCost
        : ((pkg as any).price ?? (pkg as any).cost ?? undefined),
      // Use existing origin/destination fields, fallback to locationId fields if needed
      origin: (pkg as any).origin || pkg.originLocationId || "",
      destination: (pkg as any).destination || pkg.destinationLocationId || "",
    }));
  }, [filteredPackages]);

  // ── Client-side pagination for manifest mode or realtime mode ─────────────────
  // When a manifest is loaded or we are in real-time mode, we fetch packages at once and paginate here
  // so the page buttons actually navigate instead of always re-fetching page 1.
  const clientSidePagination = isManifestMode || realtimeEnabled;

  const manifestTotalPages = useMemo(
    () => (clientSidePagination ? Math.max(1, Math.ceil(packagesWithCosts.length / pageSize)) : 1),
    [clientSidePagination, packagesWithCosts.length, pageSize]
  );

  const displayPackages = useMemo(() => {
    if (!clientSidePagination) return packagesWithCosts;
    const start = (currentPage - 1) * pageSize;
    return packagesWithCosts.slice(start, start + pageSize);
  }, [clientSidePagination, packagesWithCosts, currentPage, pageSize]);

  const effectiveMeta = useMemo(() => {
    if (clientSidePagination) return {
      total: packagesWithCosts.length,
      page: currentPage,
      limit: pageSize,
      totalPages: manifestTotalPages,
      hasNextPage: currentPage < manifestTotalPages,
      hasPrevPage: currentPage > 1,
    };
    return paginationMeta ?? null;
  }, [clientSidePagination, packagesWithCosts.length, currentPage, pageSize, manifestTotalPages, paginationMeta]);

  // Group packages client-side when groupBy is active
  const groupedPackages = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, typeof packagesWithCosts>();
    for (const pkg of (packagesWithCosts as any[])) {
      let key: string;
      switch (groupBy) {
        case 'name':   key = (pkg.customerName || '').toUpperCase().trim() || 'Sin Nombre'; break;
        case 'slCode': key = pkg.slCode || 'Sin Código SL'; break;
        case 'email':  key = pkg.customer?.email || 'Sin Correo'; break;
        case 'dni':    key = pkg.customer?.dni || 'Sin Cédula'; break;
        default:       key = '';
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pkg);
    }
    return Array.from(groups.entries())
      .map(([key, pkgs]) => ({
        key,
        packages: pkgs,
        totalWeight: pkgs.reduce((s: number, p: any) => s + (p.weight || 0), 0),
      }))
      .sort((a, b) => a.key.localeCompare(b.key, 'es'));
  }, [packagesWithCosts, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAllGroups = () => {
    if (!groupedPackages) return;
    if (expandedGroups.size < groupedPackages.length) {
      setExpandedGroups(new Set(groupedPackages.map(g => g.key)));
    } else {
      setExpandedGroups(new Set());
    }
  };

  // Find and assign route based on destination
  const assignRouteForPackage = (destination: string) => {
    const routes = (routesResponse as any)?.data as any[] | undefined;
    if (!routes || routes.length === 0) return undefined;
    const matchingRoute = routes.find(
      (route) =>
        (route.destinationLocation &&
          destination &&
          destination.toLowerCase().includes(route.destinationLocation.toLowerCase())) ||
        route.destinationLocation?.toLowerCase().includes(destination.toLowerCase()),
    );
    return matchingRoute?.id;
  };

  // Handle edit — form population handled by CreatePackageModal via selectedPackage prop
  const handleEdit = (pkg: Package) => {
    setSelectedPackage(pkg);
    setShowCreateModal(true);
  };



  // Handle save — called by CreatePackageModal with validated payload
  const handleSave = async ({ formData, invoiceBillingMode, selectedDraftInvoiceId, computedPrice }: PackageModalPayload) => {

    try {
      setIsSaving(true);

      // ── Temp customer creation when no existing customer selected ──
      let finalCustomerId = formData.customerId;
      let finalSlCode = formData.slCode;
      let finalCustomerName = formData.customerName;
      if (!finalCustomerId && finalCustomerName.trim()) {
        const tempRecord = await createOrGetTempCustomer(
          finalCustomerName.trim(),
          undefined,
          'packages_form',
        );
        finalSlCode = tempRecord.slCode;
        finalCustomerName = tempRecord.name;
        finalCustomerId = `temp_${tempRecord.slCode}`;
      }

      const packageData = {
        trackingNumber: formData.trackingNumber,
        type: formData.type,
        category: formData.category,
        customerName: finalCustomerName,
        customerId: finalCustomerId,
        slCode: finalSlCode,
        weight: formData.weight,
        status: formData.status as Package["status"],
        flagStatus: formData.flagStatus,
        origin: formData.origin.toUpperCase(),
        destination: formData.destination.toUpperCase(),
        routeId: formData.routeId || "",
        description: formData.description.toUpperCase(),
        manifestType: formData.manifestType,
        permisos: formData.permisos,
        ...(formData.manifestNumber ? { manifestNumber: formData.manifestNumber } : {}),
        ...(computedPrice && !computedPrice.quoteRequired ? { calculatedCost: computedPrice.price } : {}),
      };

      if (selectedPackage) {
        await updatePackageMutation.mutateAsync(packageData);
        toast({ title: t("common.success"), description: t("packages.form.successUpdate") });
        
        // Auto-sync the updated customer assignment to SP2
        try {
          await syncPackagesToSmartWeb([{
            id: selectedPackage.id,
            trackingNumber: packageData.trackingNumber,
            slCode: packageData.slCode,
            customerName: packageData.customerName,
            status: packageData.status,
            weight: packageData.weight,
            description: packageData.description,
            origin: packageData.origin,
            destination: packageData.destination,
            ruta: (routesData as any)?.data?.find((r: any) => r.id === packageData.routeId)?.name || packageData.routeId,
            manifestNumber: packageData.manifestNumber,
            requiresPermit: packageData.permisos,
            cost: packageData.calculatedCost,
            forceSync: true, // Force the update in SP2
            allowCreate: true, // Allow creation if it was orphaned
          }]);
        } catch (syncErr) {
          console.error("Error auto-syncing package update to SmartWeb:", syncErr);
        }
      } else {
        await createPackageMutation.mutateAsync(packageData);
        // Update manifest doc if manifest was selected
        if (formData.manifestNumber) {
          upsertPackagesToManifestDoc(formData.manifestNumber, [{
            tracking:      formData.trackingNumber,
            slCode:        finalSlCode,
            customerName:  finalCustomerName,
            weight:        formData.weight,
            description:   formData.description.toUpperCase(),
            permisos:      formData.permisos,
          }]).catch(() => {});
        }

        // ── Invoice billing handling (create or add to draft) ───────────────
        if (invoiceBillingMode !== 'none' && finalCustomerId) {
          const priceValue = formData.priceOverride
            ?? (computedPrice && !computedPrice.quoteRequired ? computedPrice.price : 0);
          const billingWeight = formData.pesoRedondeo ?? (formData.permisos ? Math.ceil(formData.weight) : formData.weight);
          const invItem = {
            trackingNumber: formData.trackingNumber,
            description:    formData.description.toUpperCase() || 'PAQUETE',
            quantity:       1,
            unitPrice:      priceValue,
            totalPrice:     priceValue,
            weight:         billingWeight,
            realWeight:     formData.weight,
            isManual:       false,
            isPermiso:      formData.permisos,
          };
          const coreItem = {
            tracking:    formData.trackingNumber,
            description: invItem.description,
            weight:      billingWeight,
            realWeight:  formData.weight,
            subtotal:    priceValue,
            iva:         0,
            amount:      priceValue,
            currency:    computedPrice?.currency ?? 'USD',
            isPermiso:   formData.permisos,
          };
          if (invoiceBillingMode === 'create') {
            const now = new Date().toISOString();

            let clientEmail = '';
            let clientDni = '';
            let clientRoute = '';
            let customerData: any = null;

            try {
              const { getDoc, doc } = await import('firebase/firestore');
              const customerSnap = await getDoc(doc(db, 'customers', finalSlCode.toUpperCase().trim()));
              if (customerSnap.exists()) {
                const cData = customerSnap.data();
                clientEmail = cData.email || '';
                clientDni = cData.dni || '';
                clientRoute = cData.ruta || '';
                customerData = {
                  id: finalSlCode,
                  fullName: cData.fullName || finalCustomerName || finalSlCode,
                  email: clientEmail,
                  slCode: finalSlCode,
                  ruta: clientRoute || null,
                };
              }
            } catch (err) {
              console.warn('[Packages] Could not fetch customer info:', err);
            }

            if (!customerData) {
              customerData = {
                id: finalSlCode,
                fullName: finalCustomerName || finalSlCode,
                email: '',
                slCode: finalSlCode,
                ruta: null,
              };
            }

            await addDoc(collection(db, 'invoices'), {
              status:          'draft',
              source:          'manual',
              customerId:      finalCustomerId,
              clientId:        finalCustomerId,
              clientName:      customerData.fullName,
              clientEmail,
              clientDni,
              clientRoute,
              slCode:          finalSlCode,
              clientSlCode:    finalSlCode,
              trackingNumbers: [formData.trackingNumber],
              invoiceItems:    [invItem],
              items:           [coreItem],
              subtotal:        priceValue,
              subtotalAmount:  priceValue,
              iva:             0,
              taxAmount:       0,
              ivaRate:         0,
              ivaEnabled:      false,
              amount:          priceValue,
              totalAmount:     priceValue,
              currency:        computedPrice?.currency ?? 'USD',
              totalWeight:     formData.weight,
              packageCount:    1,
              notes:           '',
              createdAt:       now,
              updatedAt:       now,
              customer:        customerData,
            });
            toast({ title: 'Factura borrador creada', description: `Factura en borrador lista para ${finalCustomerName}` });
          } else if (invoiceBillingMode === 'add' && selectedDraftInvoiceId) {
            await updateDoc(doc(db, 'invoices', selectedDraftInvoiceId), {
              invoiceItems:    arrayUnion(invItem),
              items:           arrayUnion(coreItem),
              trackingNumbers: arrayUnion(formData.trackingNumber),
              updatedAt:       new Date().toISOString(),
            });
            toast({ title: 'Paquete agregado', description: 'Paquete agregado a la factura borrador existente' });
          }
        } else {
          toast({ title: t("common.success"), description: t("packages.form.successCreate") });
        }
      }

      setShowCreateModal(false);
      setSelectedPackage(null);
      // React Query invalidation handles refresh
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to save package:", errorMsg);
      toast({
        title: t("common.error"),
        description: errorMsg.includes("already exists")
          ? "This tracking number already exists"
          : "Failed to save package",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!selectedPackage) return;

    try {
      setIsDeleting(true);
      await deletePackageMutation.mutateAsync(selectedPackage.id);
      
      toast({
        title: t("common.success"),
        description: "Package deleted successfully",
      });
      
      setShowDeleteDialog(false);
      setSelectedPackage(null);
      // React Query invalidation handles refresh
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Failed to delete package:", errorMsg);
      toast({
        title: t("common.error"),
        description: "Failed to delete package",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    const csv = [
      [
        "Tracking #",
        "Type",
        "Customer",
        "SL Account",
        "Origin",
        "Destination",
        "Weight (kg)",
        "Status",
        "Flag Status",
        "Days in System",
        "Cost (USD)",
        "Description",
      ].join(","),
      ...packagesWithCosts.map((pkg) =>
        [
          pkg.trackingNumber,
          pkg.type || "air",
          pkg.customerName,
          pkg.slCode || "",
          pkg.origin,
          pkg.destination,
          pkg.weight,
          pkg.status,
          pkg.flagStatus || "normal",
          pkg.daysInSystem || 0,
          pkg.calculatedCost || 0,
          pkg.description || "",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "packages.csv";
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: t("common.success"),
      description: "Packages exported successfully",
    });
  };

  // Handle applying pre-filters
  const handleApplyPreFilters = () => {
    // dataLoadLimit (always set) counts as a valid filter — user can load without manifest/date
    const hasPreFilters = preManifestNumber || preType || preDateRange.from || preDateRange.to || dataLoadLimit;
    if (!hasPreFilters) {
      toast({
        title: t("common.error"),
        description: t("preFilters.atLeastOneRequired"),
        variant: "destructive",
      });
      return;
    }
    
    const normalizedFrom = preDateRange.from ? new Date(preDateRange.from) : undefined;
    const normalizedTo   = preDateRange.to   ? new Date(preDateRange.to)   : undefined;
    if (normalizedFrom) normalizedFrom.setHours(0, 0, 0, 0);
    if (normalizedTo)   normalizedTo.setHours(23, 59, 59, 999);

    setAppliedPreFilters({
      manifestNumber: preManifestNumber || undefined,
      type: preType || undefined,
      dateFrom: normalizedFrom ? normalizedFrom.toISOString() : undefined,
      dateTo:   normalizedTo   ? normalizedTo.toISOString()   : undefined,
    });
    setAppliedDataLoadLimit(dataLoadLimit);
    setPreFiltersApplied(true);
    setCurrentPage(1);
  };

  // Handle clearing pre-filters and going back to pre-filter view
  const handleClearPreFilters = () => {
    setPreFiltersApplied(false);
    setAppliedPreFilters({});
    setAppliedDataLoadLimit('last4days');
    setPreManifestNumber("");
    setPreType(undefined);
    setPreDateRange({ from: undefined, to: undefined });
    setStatusFilters([]);
    setDestinationFilter([]);
    setFlagFilter("");
    setSearchQuery("");
    setDebouncedSearch("");
    setGroupBy('');
    setExpandedGroups(new Set());
    setOrphansFilterActive(false);
    setOrphanPackageIds(new Set());
    setDataLoadLimit('last4days');
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`space-y-4 p-4 md:p-6`}
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1
                className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
              >
                {t("packages.title") || "Packages"}
              </h1>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex">
                      {realtimeEnabled ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1.5 cursor-help py-0.5 px-2.5 text-[10px] font-semibold h-5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                          </span>
                          Tiempo Real Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 dark:bg-red-500/25 dark:text-red-400 dark:border-red-500/50 gap-1.5 cursor-help py-0.5 px-2 text-[10px] font-bold h-5 animate-pulse" style={{ animationDuration: "3.5s" }}>
                          <Database className="h-3 w-3" />
                          Modo Ahorro
                        </Badge>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs p-3 space-y-1.5 text-xs">
                    {realtimeEnabled ? (
                      <>
                        <p className="font-semibold text-amber-500">Conexión Directa en Vivo</p>
                        <p>Los datos se actualizan automáticamente en tiempo real. Esta opción consume más recursos de red y lecturas de Firestore.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-emerald-500">Modo de Ahorro y Caché</p>
                        <p>Los datos se cargan de forma estática en tu navegador para optimizar el rendimiento y reducir los costos operativos. Si necesitas actualizaciones automáticas (ej. para escaneo continuo), activa <strong>"Tiempo Real"</strong>.</p>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p
              className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              {t("packages.managePackages")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <PermissionTooltip allowed={canCreate('packages')}>
              <Button
                variant="outline"
                onClick={() => setShowBulkModal(true)}
                className={isDark ? "border-gray-600 hover:bg-gray-700" : ""}
                aria-label={t("packages.bulkAdd")}
              >
                <Layers className="h-4 w-4 mr-1.5" />
                {t("packages.bulkAdd")}
              </Button>
            </PermissionTooltip>

            <PermissionTooltip allowed={canManage('packages')}>
              <Button
                variant="outline"
                onClick={orphansFilterActive ? () => setOrphansFilterActive(false) : handleAuditOrphans}
                disabled={isAuditing || (!orphansFilterActive && (!packagesResponse?.data || packagesResponse.data.length === 0))}
                className={isDark ? "border-gray-600 hover:bg-gray-700" : ""}
                aria-label="Auditar Huérfanos"
              >
                {isAuditing ? (
                  <Loader2 className="h-4 w-4 mr-1.5 text-yellow-500 animate-spin" />
                ) : orphansFilterActive ? (
                  <X className="h-4 w-4 mr-1.5 text-red-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-1.5 text-yellow-500" />
                )}
                {orphansFilterActive ? "Quitar Filtro de Huérfanos" : "Auditar (Sin Factura)"}
              </Button>
            </PermissionTooltip>

            <PermissionTooltip allowed={canCreate('packages')}>
              <Button
                onClick={() => {
                  setSelectedPackage(null);
                  setShowCreateModal(true);
                }}
                className={`flex items-center gap-2 ${
                  isDark
                    ? "bg-white text-black hover:bg-gray-100"
                    : "bg-black text-white hover:bg-gray-900"
                }`}
                data-testid="create-package-btn"
                aria-label={t("packages.newPackage")}
              >
                <Plus className="h-4 w-4" />
                {t("packages.newPackage")}
              </Button>
            </PermissionTooltip>
          </div>
        </motion.div>

        {/* Unified Filter Bar */}
        <Card className={`p-3 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <div className="flex items-center gap-2 flex-wrap">

            {/* Package search — JQL and AI-driven search bar */}
            <div className="flex flex-col min-w-[200px] w-full sm:min-w-[320px] flex-1 relative">
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Buscar con JQL (ej: s = received AND w > 5) o búsqueda rápida..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`h-9 pl-9 pr-12 text-sm ${isDark ? "bg-gray-700 border-gray-600 text-white" : ""} ${jqlError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  />
                  {/* JQL Indicator Badge */}
                  {searchQuery.includes("=") || searchQuery.includes("~") || searchQuery.includes(">") || searchQuery.includes("<") ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold bg-violet-500/10 text-violet-500 border border-violet-500/20 px-1 py-0.5 rounded select-none">
                      JQL
                    </span>
                  ) : null}
                </div>
                
                {/* AI Sparkles Assistant Button */}
                <Popover open={aiInputOpen} onOpenChange={setAiInputOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={`h-9 w-9 shrink-0 ${isDark ? "bg-gray-700 border-gray-600 hover:bg-gray-600 text-violet-400" : "hover:bg-violet-50 text-violet-600 border-violet-200"}`}
                      title="Búsqueda Inteligente con IA"
                    >
                      <Sparkles className="h-4 w-4 fill-violet-500/10" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 sm:w-96 p-4 rounded-xl shadow-xl border-border bg-popover text-popover-foreground z-50" align="start">
                    <form onSubmit={(e) => { e.preventDefault(); handleAiTranslate(); }} className="space-y-3">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                        <Sparkles className="h-4 w-4 text-violet-500 animate-pulse" />
                        <span>¿Qué paquetes quieres buscar?</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-normal">
                        Describe en lenguaje natural qué paquetes deseas encontrar. Gemini lo convertirá a sintaxis JQL.
                      </p>
                      <Input
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        placeholder="Ej: paquetes con peso menor a 1 kilo en aduanas"
                        className="h-10 text-xs rounded-xl"
                        disabled={aiLoading}
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => { setAiInputOpen(false); setAiQuery(""); }}
                          disabled={aiLoading}
                          className="h-8 text-xs rounded-lg"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="submit"
                          disabled={aiLoading || !aiQuery.trim()}
                          className="h-8 text-xs rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white"
                        >
                          {aiLoading ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              Traduciendo...
                            </>
                          ) : (
                            "Traducir a JQL"
                          )}
                        </Button>
                      </div>
                    </form>
                  </PopoverContent>
                </Popover>

                {/* Syntax Help Button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSyntaxHelpOpen(!syntaxHelpOpen)}
                        className={`h-9 w-9 shrink-0 ${syntaxHelpOpen ? "bg-accent" : ""}`}
                      >
                        <span className="text-xs font-bold font-mono">?</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Guía de Sintaxis JQL</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* JQL Syntax Error Message */}
              {jqlError && (
                <div className="absolute top-10 left-0 right-0 z-50 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 px-3 py-1.5 rounded-md text-xs shadow-md backdrop-blur-sm flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{jqlError}</span>
                </div>
              )}

              {/* JQL Quick Help Banner */}
              {syntaxHelpOpen && (
                <div className={`absolute top-10 left-0 right-0 z-50 p-3 rounded-lg border text-xs shadow-lg backdrop-blur-md ${isDark ? "bg-gray-800/95 border-gray-700 text-gray-300" : "bg-white/95 border-gray-200 text-gray-700"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-violet-500">Manual Rápido de JQL</span>
                    <button onClick={() => setSyntaxHelpOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="font-semibold">Campos:</p>
                      <p>• <span className="font-mono text-violet-400">status (s)</span>: recibidos, aduana...</p>
                      <p>• <span className="font-mono text-violet-400">weight (w)</span>: peso numérico</p>
                      <p>• <span className="font-mono text-violet-400">route (r)</span>: ruta aéreo/marítimo</p>
                    </div>
                    <div>
                      <p className="font-semibold">Operadores:</p>
                      <p>• <span className="font-mono text-violet-400">=</span> igual, <span className="font-mono text-violet-400">!=</span> no igual</p>
                      <p>• <span className="font-mono text-violet-400">~</span> contiene, <span className="font-mono text-violet-400">!~</span> no contiene</p>
                      <p>• <span className="font-mono text-violet-400">&gt;, &lt;, &gt;=, &lt;=</span> numéricos</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-muted/50 text-[10px] text-muted-foreground">
                    <span className="font-semibold">Ejemplos:</span> <code className="bg-muted px-1 py-0.5 rounded">s = received AND w &gt; 5</code> | <code className="bg-muted px-1 py-0.5 rounded">r ~ aereo OR f = documentos</code>
                  </div>
                </div>
              )}
            </div>

            {/* Separator */}
            <div className={`hidden sm:block h-6 w-px mx-1 ${isDark ? "bg-gray-600" : "bg-gray-200"}`} />

            {/* Standardized Manifest Picker */}
            <ManifestPicker
              allManifestNumbers={manifestOptions}
              selectedManifests={preManifestNumber ? new Set([preManifestNumber]) : new Set()}
              onManifestsChange={(set) => {
                const next = (Array.from(set)[0] || "").trim();
                setPreManifestNumber(next);
              }}
              manifestPackageCounts={manifestPackageCounts}
              singleSelect
              triggerClassName={cn(
                "w-full sm:w-auto sm:min-w-[200px] h-9 text-sm",
                isDark ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600" : ""
              )}
              allLabel="Todos los manifiestos"
            />

            {/* Data load limit */}
            <Select
              value={dataLoadLimit.toString()}
              onValueChange={(val) => setDataLoadLimit(val === 'last4days' ? 'last4days' : (Number(val) as 3000 | 5000 | 10000))}
            >
              <SelectTrigger className={`h-9 w-[168px] gap-1.5 ${isDark ? "bg-gray-700 border-gray-600 text-white" : ""}`}>
                <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last4days">Últimos 4 días</SelectItem>
                <SelectItem value="3000">3,000 paquetes</SelectItem>
                <SelectItem value="5000">5,000 paquetes</SelectItem>
                <SelectItem value="10000">10,000 paquetes</SelectItem>
              </SelectContent>
            </Select>

            {/* Realtime toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div 
                    className={cn(
                      "flex items-center space-x-2 h-9 px-3 border rounded-md transition-all duration-300 cursor-help",
                      realtimeEnabled
                        ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold"
                        : "border-red-500/50 bg-red-500/5 text-red-600 dark:text-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.15)] hover:bg-red-500/10"
                    )}
                    style={!realtimeEnabled ? { animationDuration: "3.5s" } : undefined}
                  >
                    <Checkbox
                      id="realtime-toggle"
                      checked={realtimeEnabled}
                      onCheckedChange={(checked) => setRealtimeEnabled(!!checked)}
                      className={cn(
                        "transition-colors",
                        realtimeEnabled ? "border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:text-white" : "border-red-500/50 data-[state=checked]:bg-red-600 data-[state=checked]:text-white"
                      )}
                    />
                    <label
                      htmlFor="realtime-toggle"
                      className="text-xs font-semibold leading-none cursor-pointer select-none"
                    >
                      Tiempo Real
                    </label>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3 space-y-1.5 text-xs">
                  {realtimeEnabled ? (
                    <>
                      <p className="font-semibold text-amber-500">Conexión Directa en Vivo</p>
                      <p>Los datos se actualizan automáticamente en tiempo real. Esta opción consume más recursos de red y lecturas de Firestore.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-red-500">Modo de Ahorro Activo</p>
                      <p>Los datos se cargan de forma estática en tu navegador para optimizar el rendimiento y reducir los costos operativos. Si necesitas actualizaciones en vivo (ej. para escaneo continuo), marca esta casilla.</p>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Route multi-select */}
            <div className={`transition-opacity ${!preFiltersApplied ? "opacity-40 pointer-events-none" : ""}`}>
              <Popover open={routeFilterOpen} onOpenChange={setRouteFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm font-medium transition-colors
                      ${destinationFilter.length > 0
                        ? 'border-primary bg-primary/5 text-primary'
                        : isDark ? 'border-gray-600 bg-gray-700 text-white' : 'border-input bg-background text-foreground hover:bg-accent'}`}
                    aria-label="Filtrar por ruta"
                  >
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[110px] truncate">{routeFilterLabel}</span>
                    {destinationFilter.length > 0 && (
                      <span
                        role="button"
                        aria-label="Limpiar filtro de rutas"
                        className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                        onClick={(e) => { e.stopPropagation(); setDestinationFilter([]); setCurrentPage(1); }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="space-y-1">
                    {/* Clear all */}
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                      onClick={() => { setDestinationFilter([]); setCurrentPage(1); }}
                    >
                      <span className="flex h-4 w-4 items-center justify-center">
                        {destinationFilter.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
                      </span>
                      <span className="font-medium">Todas</span>
                    </button>

                    {/* Todos excepto Encomiendas shortcut */}
                    {encomiendaRoute && (
                      <button
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                        onClick={() => {
                          setDestinationFilter(
                            routeNamesForFilter.filter(n => n.toLowerCase() !== 'encomiendas')
                          );
                          setCurrentPage(1);
                        }}
                      >
                        <span className="flex h-4 w-4 items-center justify-center">
                          {destinationFilter.length > 0 &&
                            !destinationFilter.some(f => f.toLowerCase() === 'encomiendas') &&
                            destinationFilter.length === routeNamesForFilter.length - 1 && (
                              <Check className="h-3.5 w-3.5 text-primary" />
                          )}
                        </span>
                        <span className="font-medium text-muted-foreground">Todos excepto Encomiendas</span>
                      </button>
                    )}

                    <div className="my-1 border-t" />

                    {/* Individual route checkboxes */}
                    {routeNamesForFilter.map((name) => {
                      const checked = destinationFilter.some(f => f.toLowerCase() === name.toLowerCase());
                      return (
                        <label
                          key={name}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleRouteFilter(name)}
                            id={`route-filter-${name}`}
                          />
                          <span className="uppercase tracking-wide text-xs font-medium">{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status — multi-select Popover */}
            <div className={`transition-opacity ${!preFiltersApplied ? "opacity-40 pointer-events-none" : ""}`}>
              <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-9 gap-1.5 text-sm font-normal',
                      isDark ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : '',
                      statusFilters.length > 0 ? 'border-primary/60 bg-primary/5 text-primary' : '',
                    )}
                  >
                    <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                    {statusFilters.length === 0
                      ? 'Estado'
                      : statusFilters.length === 1
                        ? t(`packages.statuses.${statusFilters[0]}`)
                        : `${statusFilters.length} estados`
                    }
                    {statusFilters.length > 0 && (
                      <span
                        role="button"
                        aria-label="Limpiar filtro de estado"
                        className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                        onClick={(e) => { e.stopPropagation(); setStatusFilters([]); setCurrentPage(1); }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" align="start">
                  <div className="space-y-0.5">
                    {/* Select all / clear */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                      onClick={() => { setStatusFilters([]); setCurrentPage(1); }}
                    >
                      <span className="flex h-4 w-4 items-center justify-center">
                        {statusFilters.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
                      </span>
                      <span className="font-medium text-muted-foreground">Todos</span>
                    </button>

                    <div className="my-1 border-t" />

                    {PACKAGE_STATUS_VALUES.map((status) => {
                      const checked = statusFilters.includes(status);
                      return (
                        <label
                          key={status}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              setStatusFilters(prev =>
                                prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
                              );
                              setCurrentPage(1);
                            }}
                            id={`status-filter-${status}`}
                          />
                          <span className="text-xs font-medium">{t(`packages.statuses.${status}`)}</span>
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>



            {/* Actions */}
            <div className="flex items-center ml-auto shrink-0 min-w-[100px] justify-end">
              <AnimatePresence mode="wait" initial={false}>
                {!preFiltersApplied ? (
                  <motion.div
                    key="buscar"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button onClick={handleApplyPreFilters} className="h-9 px-4 gap-2">
                      <Search className="h-4 w-4" />
                      Buscar
                    </Button>
                  </motion.div>
                ) : isFiltersDirty ? (
                  <motion.div
                    key="nueva-busqueda"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button 
                      onClick={handleApplyPreFilters} 
                      className="h-9 px-4 gap-2 bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 shadow-md"
                    >
                      <Search className="h-4 w-4" />
                      Nueva Búsqueda
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="limpiar"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button 
                      onClick={handleClearPreFilters} 
                      variant="outline" 
                      className="h-9 px-4 gap-2 border-red-200 hover:border-red-300 hover:bg-red-50 text-red-600 hover:text-red-700"
                      title="Limpiar filtros y volver al inicio"
                    >
                      <X className="h-4 w-4" />
                      Limpiar
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </Card>

        <AnimateHeight>
          <AnimatePresence mode="wait">
            {freeformSearchActive ? (
              /* ── Freeform search results ── */
              (() => {
                const activeManifest = appliedPreFilters.manifestNumber;
                const displayResults = activeManifest
                  ? freeformResults.filter((pkg: any) =>
                      (pkg.manifestNumber || pkg.updatedManifest || '').toUpperCase() === activeManifest.toUpperCase()
                    )
                  : freeformResults;
                return (
                  <motion.div
                    key="freeform"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="w-full"
                  >
                    <Card className={`overflow-hidden border-0 shadow-none ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="p-4">
              <div className={`flex items-center justify-between mb-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <div className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  <span>
                    {freeformLoading
                      ? 'Buscando…'
                      : `${displayResults.length} resultado${displayResults.length !== 1 ? 's' : ''} para "${searchQuery}"${activeManifest ? ` en ${activeManifest}` : ''}`}
                  </span>
                </div>
              </div>
              {freeformLoading ? (
                <PackagesDataTable
                  isOrphansMode={orphansFilterActive}
                  packages={[]}
                  routes={(routesResponse as any)?.data || []}
                  onUpdate={async () => {}}
                  onBulkUpdate={async () => {}}
                  onDelete={async () => {}}
                  loading={true}
                />
              ) : displayResults.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-12 ${isDark ? 'text-gray-500' : 'text-muted-foreground'}`}>
                  <PackageIcon className="h-10 w-10 mb-3 opacity-20" />
                  <p className="text-sm">No se encontraron paquetes para &ldquo;{searchQuery}&rdquo;</p>
                </div>
              ) : (
                <PackagesDataTable
                  isOrphansMode={orphansFilterActive}
                  packages={displayResults.map((pkg: any) => ({
                    ...pkg,
                    calculatedCost: pkg.calculatedCost ?? pkg.price ?? pkg.cost ?? undefined,
                    origin: pkg.origin || '',
                    destination: pkg.destination || '',
                  }))}
                  routes={(routesResponse as any)?.data || []}
                  onUpdate={async (id: string, field: string, value: string | number) => {
                    const result = await firebaseApi.packages.update(id, { [field]: value });
                    if (!result.success || result.error) throw new Error(result.error || 'Failed to update package');
                    if (field === 'ruta' && typeof value === 'string') {
                      const pkg = displayResults.find((p: any) => p.id === id);
                      if (pkg?.customerId) {
                        try {
                          await firebaseApi.customers.update(pkg.customerId, { ruta: value });
                          window.dispatchEvent(new Event('customer-ruta-updated'));
                        } catch { /* best-effort — package was already saved */ }
                      }
                    }
                    queryClient.invalidateQueries({ queryKey: ['packages'] });
                    queryClient.invalidateQueries({ queryKey: ['packageSearch'] });
                  }}
                  onBulkUpdate={async (id: string, updates: Record<string, any>, skipInvalidate?: boolean) => {
                    queryClient.setQueriesData<any>({ queryKey: ['packages'] }, (old) => {
                      if (!old?.data) return old;
                      return { ...old, data: old.data.map((pkg: any) => pkg.id === id ? { ...pkg, ...updates } : pkg) };
                    });
                    queryClient.setQueriesData<any>({ queryKey: ['packageSearch'] }, (old) => {
                      if (!Array.isArray(old)) return old;
                      return old.map((pkg: any) => pkg.id === id ? { ...pkg, ...updates } : pkg);
                    });
                    const result = await firebaseApi.packages.update(id, updates);
                    if (!result.success || result.error) throw new Error(result.error || 'Failed to update package');
                    if (!skipInvalidate) {
                      queryClient.invalidateQueries({ queryKey: ['packages'] });
                      queryClient.invalidateQueries({ queryKey: ['packageSearch'] });
                    }
                  }}
                  onDelete={async (id: string) => {
                    await deletePackageMutation.mutateAsync(id);
                    toast({ title: t('common.success'), description: 'Package deleted successfully' });
                  }}
                />
              )}
            </div>
          </Card>
        </motion.div>
      );
    })()
  ) : !preFiltersApplied ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="py-20 text-center max-w-md mx-auto flex flex-col items-center justify-center"
              >
                <div className="p-4 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 mb-4 animate-pulse">
                  <Search className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Búsqueda de Paquetes Requerida</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Por razones de costo operativo e incremento de eficiencia, esta vista no pre-carga datos de paquetes automáticamente. Por favor, selecciona un manifiesto o escribe una consulta en la barra superior y presiona el botón <strong>Buscar</strong> para cargar la información.
                </p>
              </motion.div>
            ) : packagesError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className={`flex flex-col items-center justify-center py-16 w-full ${isDark ? "text-red-400" : "text-red-500"}`}
              >
                <PackageIcon className="h-12 w-12 mb-4 opacity-40" />
                <p className="text-sm font-medium">Error al cargar paquetes</p>
                <p className="text-xs mt-1 opacity-70">{(packagesError as Error)?.message || "Error de conexión con Firestore"}</p>
                <button onClick={handleApplyPreFilters} className="mt-3 text-xs underline opacity-70 hover:opacity-100">Reintentar</button>
              </motion.div>
            ) : packagesWithCosts.length === 0 && isEncomiendaRouteMismatch ? (
              <motion.div
                key="encomienda-mismatch"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="py-16 px-6 text-center max-w-md mx-auto flex flex-col items-center justify-center border border-amber-200/60 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/10 rounded-xl shadow-sm w-full"
              >
                <div className="p-3.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 mb-4">
                  <AlertTriangle className="h-8 w-8 animate-bounce" style={{ animationDuration: '3s' }} />
                </div>
                <h3 className="text-base font-bold text-amber-800 dark:text-amber-400 mb-2">¿Filtro de ruta incorrecto?</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed mb-6">
                  Estás buscando en un manifiesto de encomiendas (<strong>{appliedPreFilters.manifestNumber}</strong>) pero filtrando por una ruta diferente a <strong>Encomiendas</strong>. Un manifiesto de encomiendas rara vez tendrá una ruta distinta a <strong>Encomiendas</strong>.
                </p>
                <div className="flex gap-2 w-full justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950 text-amber-800 dark:text-amber-300"
                    onClick={() => {
                      setDestinationFilter(["Encomiendas"]);
                    }}
                  >
                    Cambiar a ruta Encomiendas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-amber-700 hover:text-amber-800 hover:bg-amber-100/50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                    onClick={() => {
                      setDestinationFilter([]);
                    }}
                  >
                    Quitar filtro de ruta
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="data"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                {/* Editable DataGrid with Real-time Sync */}
                <Card
                  className={`overflow-hidden border-0 shadow-none ${isDark ? "bg-gray-800" : "bg-white"}`}
                >
          {isLoading || isFetching || (realtimeEnabled && isRealtimeLoading) ? (
            <PackagesDataTable
              isOrphansMode={orphansFilterActive}
              packages={[]}
              routes={(routesResponse as any)?.data || []}
              onUpdate={async () => {}}
              onBulkUpdate={async () => {}}
              onDelete={async () => {}}
              loading={true}
            />
          ) : groupBy && groupedPackages ? (
            /* ── Grouped view ── */
            <div className="p-3 space-y-2">
              {/* Group controls header */}
              <div className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" />
                  <span className="font-medium">
                    {groupedPackages.length} grupos · {packagesWithCosts.length} paquetes
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleAllGroups}
                  className={`text-xs font-semibold underline-offset-2 hover:underline transition-colors ${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"}`}
                >
                  {expandedGroups.size < groupedPackages.length ? "Expandir todo" : "Colapsar todo"}
                </button>
              </div>

              {groupedPackages.map(({ key, packages: grpPkgs, totalWeight }) => {
                const isExpanded = expandedGroups.has(key);
                return (
                  <div
                    key={key}
                    className={`rounded-xl border overflow-hidden ${isDark ? "border-gray-700" : "border-gray-200"}`}
                  >
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                        isDark ? "bg-gray-800 hover:bg-gray-750" : "bg-gray-50 hover:bg-gray-100"
                      }`}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-gray-900"}`}>{key}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isDark ? "bg-gray-700 text-gray-300" : "bg-white border border-gray-200 text-gray-700"
                        }`}>
                          {grpPkgs.length} paquete{grpPkgs.length !== 1 ? 's' : ''}
                        </span>
                        {totalWeight > 0 && (
                          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            {totalWeight.toFixed(2)} kg
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Expanded packages */}
                    {isExpanded && (
                      <div className={`border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                        <PackagesDataTable
                          isOrphansMode={orphansFilterActive}
                          packages={grpPkgs}
                          routes={(routesResponse as any)?.data || []}
                          onUpdate={async (id: string, field: string, value: string | number) => {
                            const result = await firebaseApi.packages.update(id, { [field]: value });
                            if (!result.success || result.error) throw new Error(result.error || 'Failed to update package');
                            if (field === 'ruta' && typeof value === 'string') {
                              const pkg = grpPkgs.find((p: any) => p.id === id);
                              if (pkg?.customerId) {
                                try {
                                  await firebaseApi.customers.update((pkg as any).customerId, { ruta: value });
                                  window.dispatchEvent(new Event('customer-ruta-updated'));
                                } catch { /* best-effort — package was already saved */ }
                              }
                            }
                            queryClient.invalidateQueries({ queryKey: ["packages"] });
                            queryClient.invalidateQueries({ queryKey: ['packageSearch'] });
                          }}
                          onBulkUpdate={async (id: string, updates: Record<string, any>, skipInvalidate?: boolean) => {
                            queryClient.setQueriesData<any>({ queryKey: ['packages'] }, (old) => {
                              if (!old?.data) return old;
                              return { ...old, data: old.data.map((pkg: any) => pkg.id === id ? { ...pkg, ...updates } : pkg) };
                            });
                            queryClient.setQueriesData<any>({ queryKey: ['packageSearch'] }, (old) => {
                              if (!Array.isArray(old)) return old;
                              return old.map((pkg: any) => pkg.id === id ? { ...pkg, ...updates } : pkg);
                            });
                            const result = await firebaseApi.packages.update(id, updates);
                            if (!result.success || result.error) throw new Error(result.error || 'Failed to update package');
                            if (!skipInvalidate) {
                              queryClient.invalidateQueries({ queryKey: ["packages"] });
                              queryClient.invalidateQueries({ queryKey: ['packageSearch'] });
                            }
                          }}
                          onDelete={async (id: string) => {
                            await deletePackageMutation.mutateAsync(id);
                            toast({ title: "Success", description: "Package deleted successfully" });
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Flat table view ── */
            <>
            <PackagesDataTable
              isOrphansMode={orphansFilterActive}
              packages={displayPackages}
              disablePagination
              loading={isLoading || isFetching || (realtimeEnabled && isRealtimeLoading)}
              routes={(routesResponse as any)?.data || []}
              onUpdate={async (id: string, field: string, value: string | number) => {
                const result = await firebaseApi.packages.update(id, { [field]: value });

                if (!result.success || result.error) {
                  throw new Error(result.error || 'Failed to update package');
                }

                if (field === 'ruta' && typeof value === 'string') {
                  const pkg = packagesWithCosts.find((p) => p.id === id);
                  if ((pkg as any)?.customerId) {
                    try {
                      await firebaseApi.customers.update((pkg as any).customerId, { ruta: value });
                      window.dispatchEvent(new Event('customer-ruta-updated'));
                    } catch { /* best-effort — package was already saved */ }
                  }
                }

                // Invalidate and refetch packages
                queryClient.invalidateQueries({ queryKey: ["packages"] });
                queryClient.invalidateQueries({ queryKey: ['packageSearch'] });
              }}
              onBulkUpdate={async (id: string, updates: Record<string, any>, skipInvalidate?: boolean) => {
                queryClient.setQueriesData<any>({ queryKey: ['packages'] }, (old) => {
                  if (!old?.data) return old;
                  return { ...old, data: old.data.map((pkg: any) => pkg.id === id ? { ...pkg, ...updates } : pkg) };
                });
                queryClient.setQueriesData<any>({ queryKey: ['packageSearch'] }, (old) => {
                  if (!Array.isArray(old)) return old;
                  return old.map((pkg: any) => pkg.id === id ? { ...pkg, ...updates } : pkg);
                });

                const result = await firebaseApi.packages.update(id, updates);
                if (!result.success || result.error) {
                  throw new Error(result.error || 'Failed to update package');
                }

                // Invalidate and refetch packages only if not skipped (for bulk operations)
                if (!skipInvalidate) {
                  queryClient.invalidateQueries({ queryKey: ["packages"] });
                  queryClient.invalidateQueries({ queryKey: ['packageSearch'] });
                }
              }}
              onDelete={async (id: string) => {
                await deletePackageMutation.mutateAsync(id);
                toast({
                  title: "Success",
                  description: "Package deleted successfully",
                });
              }}
            />
          
          {/* Pagination Controls - shown in client-side pagination mode (manifest/realtime) and last4days mode (server-side) */}
          <AnimatePresence>
            {effectiveMeta && (clientSidePagination || typeof appliedDataLoadLimit !== 'number') && (
              <motion.div
                key="pagination-footer"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden w-full"
              >
                <div 
                  className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}
                  role="navigation"
                  aria-label={t("packages.pagination.rowsPerPage")}
                  data-testid="packages-pagination"
                >
                  <div className="flex items-center gap-2" data-testid="pagination-rows-per-page">
                    <label 
                      htmlFor="rows-per-page" 
                      className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                    >
                      {t("packages.pagination.rowsPerPage")}:
                    </label>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(val) => {
                        setPageSize(Number(val));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger 
                        id="rows-per-page"
                        className={`w-20 h-8 text-sm ${isDark ? "bg-gray-700 border-gray-600" : ""}`}
                        aria-label={t("packages.pagination.rowsPerPage")}
                        data-testid="pagination-page-size-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25" data-testid="pagination-page-size-25">25</SelectItem>
                        <SelectItem value="50" data-testid="pagination-page-size-50">50</SelectItem>
                        <SelectItem value="100" data-testid="pagination-page-size-100">100</SelectItem>
                         {clientSidePagination && (
                          <SelectItem value="9999" data-testid="pagination-page-size-all">Todos</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center gap-2" data-testid="pagination-info">
                    <span 
                      className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      aria-live="polite"
                      data-testid="pagination-range-text"
                    >
                      {t("packages.pagination.showing")} {Math.min(((currentPage - 1) * pageSize) + 1, effectiveMeta.total)}-{Math.min(currentPage * pageSize, effectiveMeta.total)} {t("packages.pagination.of")} {effectiveMeta.total}
                    </span>
                    <div className="flex gap-1" role="group" aria-label={t("packages.accessibility.pageChanged", { page: currentPage, total: effectiveMeta.totalPages })} data-testid="pagination-buttons">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        disabled={!effectiveMeta.hasPrevPage}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label={t("packages.pagination.firstPage")}
                        title={t("packages.pagination.firstPage")}
                        data-testid="pagination-first-page"
                      >
                        <span aria-hidden="true">««</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={!effectiveMeta.hasPrevPage}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label={t("packages.pagination.previousPage")}
                        title={t("packages.pagination.previousPage")}
                        data-testid="pagination-prev-page"
                      >
                        <span aria-hidden="true">«</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(effectiveMeta.totalPages, p + 1))}
                        disabled={!effectiveMeta.hasNextPage}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label={t("packages.pagination.nextPage")}
                        title={t("packages.pagination.nextPage")}
                        data-testid="pagination-next-page"
                      >
                        <span aria-hidden="true">»</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(effectiveMeta.totalPages)}
                        disabled={!effectiveMeta.hasNextPage}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label={t("packages.pagination.lastPage")}
                        title={t("packages.pagination.lastPage")}
                        data-testid="pagination-last-page"
                      >
                        <span aria-hidden="true">»»</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </>
          )}
          {/* Bulk load summary row */}
          {paginationMeta && typeof appliedDataLoadLimit === 'number' && (
            <div className={`flex items-center justify-center px-4 py-2.5 border-t text-sm ${isDark ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"}`}>
              Mostrando {packagesWithCosts.length.toLocaleString('es-CR')} paquetes cargados
              {paginationMeta.total > packagesWithCosts.length && (
                <span className="ml-1">(de {paginationMeta.total.toLocaleString('es-CR')} totales)</span>
              )}
            </div>
          )}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </AnimateHeight>
      </motion.div>

      {/* Create / Edit Package Modal */}
      <CreatePackageModal
        open={showCreateModal}
        onOpenChange={(open) => { if (!open) setSelectedPackage(null); setShowCreateModal(open); }}
        selectedPackage={selectedPackage}
        onSave={handleSave}
        isSaving={isSaving}
        isDark={isDark}
        t={t}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className={isDark ? "bg-gray-800 border-gray-700" : ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete package{" "}
              {selectedPackage?.trackingNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <BulkAddPackagesModal
        open={showBulkModal}
        onOpenChange={setShowBulkModal}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ['packages'] })}
      />
    </DashboardLayout>
  );
}
