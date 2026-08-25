import React, { useState, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PackagesSpreadsheetRow } from "./PackagesSpreadsheetRow";
import { PackageDetailsModal } from "./PackageDetailsModal";
import { ReassignCustomerModal } from "../customer/ReassignCustomerModal";
import { PackageInvoicesModal } from "./PackageInvoicesModal";
import { getAuthToken } from "@/lib/auth/auth-client";
import { calculatePrice, DEFAULT_PRICING } from "@/lib/utils/pricing";
import {
  firestoreApi,
  getInvoiceByTracking,
} from "@/lib/firebase/firestore-client";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/firebase";
import { firebaseApi } from "@/lib/firebase/callable";

import {
  writeBatch,
  doc,
  collection,
  setDoc,
  onSnapshot,
  query as fsQuery,
  orderBy as fsOrderBy,
  limit as fsLimit,
  getDocs,
  where,
  deleteField,
} from "firebase/firestore";
import {
  movePackagesBetweenManifestDocs,
  upsertPackagesToManifestDoc,
  batchUpdateConsolidationManifest,
} from "@/lib/services/manifest-consolidation-service";
import { syncManifestEncomiendaFromPackages } from "@/lib/services/manifest-processor";
import {
  subscribeCustomersBySlCodes,
} from "@/lib/services/invoice-service";
import { NovaInvoicePreview,
  type SP1InvoiceShape,
} from "@/components/nova/NovaInvoicePreview";
import { SyncSmartWebModal } from "@/components/packages/SyncSmartWebModal";
import { SyncOrphansSmartWebModal } from "@/components/packages/SyncOrphansSmartWebModal";
import { BulkPackagesUpdateModal } from "@/components/packages/BulkPackagesUpdateModal";
import { syncPackagesToSmartWeb } from "@/lib/services/sync-smartweb-service";
import { pushStatusToSp2, deleteInvoiceFromSp2, syncInvoicesToSp2, syncInvoicePackagesToSp2 } from "@/lib/services/sync-invoices-service";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineEditCell } from "../data-grid/InlineEditCell";
import {
  CustomerAutocomplete,
  AutocompleteCustomer,
} from "../customer/CustomerAutocomplete";
import { PackageManifestEditor } from "./PackageManifestEditor";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/useLocale";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { useAudit } from "@/hooks/use-audit";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Edit2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Package as PackageIcon,
  PackagePlus,
  Plane,
  MapPin,
  Truck,
  Check,
  CheckCircle,
  Trash2,
  Eye,
  Copy,
  Ship,
  Mail,
  Flag,
  AlertTriangle,
  User,
  FileText,
  X,
  Download,
  ExternalLink,
  Cloud,
  RefreshCw,
  Calculator,
  ArrowRight,
  Wifi,
  Globe2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Package {
  id: string;
  trackingNumber: string;
  type?: string; // air, sea, local
  category?: string; // regular, restricted, electronics
  customerName: string;
  customerId?: string;
  origin: string;
  destination: string;
  routeId?: string;
  route?: {
    id: string;
    name: string;
    status: string;
    destinationLocation?: string;
  };
  weight: number;
  status: string;
  flagStatus?: string; // normal, requires_documents, stuck_in_customs, clear_to_proceed
  daysInSystem?: number;
  calculatedCost?: number;
  createdAt: string;
  customer?: {
    email?: string;
    fullName?: string;
    slCode?: string;
  };
  slCode?: string;
  clientSlCode?: string;
  firebasePackageId?: string;
  lastSyncAt?: string;
  firebaseSyncStatus?: string;
}

interface PackagesDataTableProps {
  packages: Package[];
  onUpdate: (
    id: string,
    field: string,
    value: string | number,
  ) => Promise<void>;
  onBulkUpdate?: (
    id: string,
    updates: Record<string, any>,
    skipInvalidate?: boolean,
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  routes?: any[];
  loading?: boolean;
  /** When true, disables internal pagination so the parent can handle page navigation */
  disablePagination?: boolean;
  isOrphansMode?: boolean;
}

// Status options will be translated dynamically
const getStatusOptions = (t: any) => [
  { label: t("packages.statusPreAlerted"), value: "pre_alerted" },
  { label: t("packages.statusReceived"), value: "received" },
  { label: t("packages.statusInTransit"), value: "in_transit" },
  { label: t("packages.statusCustoms"), value: "customs" },
  { label: t("packages.statusRetained"), value: "retained" },
  { label: t("packages.statusConsolidated"), value: "consolidated" },
  { label: "Facturado", value: "processed" },
  { label: t("packages.statusOnRoute"), value: "on_route" },
  { label: "Retira en SmartLogistics", value: "pickup" },
  { label: t("packages.statusDelivered"), value: "delivered" },
  { label: t("packages.statusReturned"), value: "returned" },
];

// Statuses that warrant an automatic SP2 (SmartWeb) sync when set via bulk update.
// Operational/transit states (pre_alerted, received, in_transit, customs) are handled
// by the tracking middleware.  'consolidated' is admin-set and must be pushed explicitly.
const SYNC_ELIGIBLE_STATUSES = new Set([
  "delivered",
  "processed",
  "on_route",
  "route",
  "in_route",
  "returned",
  "retained",
  "pickup",
  "consolidated",
]);

// All admin-set statuses use forceSync=true so the explicit admin override always
// reaches SP2 regardless of what SP2's current priority/regression guard says.
// e.g. consolidated(60) < customs(80), returned(95) could be below a delivered(100),
// held(75) < customs(80), etc. — admin intent must always win.
const FORCE_SYNC_STATUSES = new Set([
  "delivered",
  "processed",
  "on_route",
  "route",
  "in_route",
  "returned",
  "retained",
  "pickup",
  "consolidated",
  "held",
]);

const STATUS_COLORS: Record<string, string> = {
  pre_alerted: "bg-slate-200 text-slate-900",
  "pre-alerted": "bg-slate-200 text-slate-900",
  received: "bg-blue-200 text-blue-900",
  in_transit: "bg-purple-200 text-purple-900",
  transit: "bg-purple-200 text-purple-900",
  customs: "bg-amber-200 text-amber-900",
  retained: "bg-red-200 text-red-900",
  held: "bg-red-200 text-red-900",
  processed: "bg-emerald-200 text-emerald-900",
  pickup: "bg-teal-200 text-teal-900",
  on_route: "bg-cyan-200 text-cyan-900",
  route: "bg-cyan-200 text-cyan-900",
  in_route: "bg-cyan-200 text-cyan-900",
  delivered: "bg-green-200 text-green-900",
  consolidated: "bg-indigo-200 text-indigo-900",
  returned: "bg-orange-200 text-orange-900",
};

const ROUTE_COLORS: Record<string, { bg: string; text: string }> = {
  "San Jose Centro": { bg: "bg-purple-100", text: "text-purple-800" },
  "San Jose Escazu": { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
  "San Jose Coronado": { bg: "bg-pink-100", text: "text-pink-800" },
  Heredia: { bg: "bg-blue-100", text: "text-blue-800" },
  Cartago: { bg: "bg-green-100", text: "text-green-800" },
  Alajuela: { bg: "bg-orange-100", text: "text-orange-800" },
  Guanacaste: { bg: "bg-amber-100", text: "text-amber-800" },
  Encomiendas: { bg: "bg-cyan-100", text: "text-cyan-800" },

  Retira: { bg: "bg-teal-100", text: "text-teal-800" },
  Desconocida: { bg: "bg-zinc-100", text: "text-zinc-700" },
};

const ROUTE_COLOR_PALETTE: Array<{ bg: string; text: string }> = [
  { bg: "bg-purple-100", text: "text-purple-800" },
  { bg: "bg-blue-100", text: "text-blue-800" },
  { bg: "bg-green-100", text: "text-green-800" },
  { bg: "bg-orange-100", text: "text-orange-800" },
  { bg: "bg-amber-100", text: "text-amber-800" },
  { bg: "bg-cyan-100", text: "text-cyan-800" },
  { bg: "bg-indigo-100", text: "text-indigo-800" },
  { bg: "bg-teal-100", text: "text-teal-800" },
  { bg: "bg-pink-100", text: "text-pink-800" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
  { bg: "bg-rose-100", text: "text-rose-800" },
  { bg: "bg-lime-100", text: "text-lime-800" },
  { bg: "bg-sky-100", text: "text-sky-800" },
  { bg: "bg-violet-100", text: "text-violet-800" },
];

const getRouteColors = (name: string): { bg: string; text: string } => {
  if (!name) return { bg: "bg-slate-200", text: "text-slate-700" };
  if (ROUTE_COLORS[name]) return ROUTE_COLORS[name];
  const ci = Object.entries(ROUTE_COLORS).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  )?.[1];
  if (ci) return ci;
  const hash = name
    .toLowerCase()
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ROUTE_COLOR_PALETTE[hash % ROUTE_COLOR_PALETTE.length];
};

interface RouteInlineCellProps {
  value: string;
  routes: any[];
  onSave: (name: string) => void;
}

export function RouteInlineCell({ value, routes, onSave }: RouteInlineCellProps) {
  const [open, setOpen] = React.useState(false);
  const routeNames: string[] = React.useMemo(() => {
    const names = routes.map((r: any) => r.name).filter(Boolean) as string[];
    return Array.from(new Set(names)).sort();
  }, [routes]);

  const colors = getRouteColors(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
          className="group flex items-center gap-1.5 cursor-pointer px-3 py-2 hover:bg-gray-100/60 transition-colors w-full h-full min-w-[80px] font-medium text-gray-800 select-none"
        >
          {value ? (
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium shrink-0 px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap border-transparent",
                colors.bg,
                colors.text,
              )}
            >
              {value}
            </Badge>
          ) : (
            <span className="text-xs text-gray-400 italic">sin ruta</span>
          )}
          <Edit2 className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0 bg-white border border-gray-200 shadow-lg rounded-lg"
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder="Buscar ruta..." className="h-9 text-sm" />
          <CommandList>
            <CommandEmpty className="text-sm text-gray-500 py-3">
              Sin resultados
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => {
                  onSave("");
                  setOpen(false);
                }}
                className="text-gray-400 italic text-xs flex items-center gap-2 cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                <span className="flex-1">Sin ruta</span>
                {!value && (
                  <Check className="h-3.5 w-3.5 text-gray-400 ml-auto" />
                )}
              </CommandItem>
              {routeNames.map((name) => {
                const c = getRouteColors(name);
                const dotBg = c.bg.replace("-100", "-500");
                return (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      onSave(name);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <div className={cn("w-2 h-2 rounded-full shrink-0", dotBg)} />
                    <span className={cn("text-xs flex-1", value?.toLowerCase() === name.toLowerCase() && "font-semibold")}>
                      {name}
                    </span>
                    {value?.toLowerCase() === name.toLowerCase() && (
                      <Check className="h-3.5 w-3.5 text-gray-700 ml-auto" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const packagesGridTemplateCols =
  "40px 40px minmax(130px, 1fr) minmax(110px, 0.9fr) minmax(180px, 1.8fr) minmax(110px, 1fr) minmax(100px, 0.8fr) minmax(70px, 0.6fr) minmax(85px, 0.7fr) 90px";

export function PackagesDataTable({
  packages,
  onUpdate,
  onBulkUpdate,
  onDelete,
  routes = [],
  loading = false,
  disablePagination = false,
  isOrphansMode = false,
}: PackagesDataTableProps) {
  const { toast } = useToast();
  const { t } = useLocale(["packages", "common"]);
  const { canUpdate, canDelete, canManage, hasPermission } = usePermissions();
  const { log: auditLog } = useAudit();
  const queryClient = useQueryClient();

  const [customerMap, setCustomerMap] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const slCodes = new Set<string>();
    packages.forEach((pkg) => {
      const code = pkg.slCode || pkg.clientSlCode || pkg.customer?.slCode;
      if (code) slCodes.add(code);
    });
    const uniqueCodes = Array.from(slCodes).sort();
    if (!uniqueCodes.length) {
      setCustomerMap(new Map());
      return;
    }
    const unsub = subscribeCustomersBySlCodes(uniqueCodes, (map) => {
      setCustomerMap(map);
    });
    return unsub;
  }, [packages]);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    packageId: string | null;
    field: string | null;
    oldValue: string | number | null;
    newValue: string | number | null;
  }>({
    open: false,
    packageId: null,
    field: null,
    oldValue: null,
    newValue: null,
  });

  const [customerEditModal, setCustomerEditModal] = useState<{
    open: boolean;
    packageId: string | null;
    currentCustomerId: string | null;
    currentCustomerName: string | null;
    currentslCode: string | null;
  }>({
    open: false,
    packageId: null,
    currentCustomerId: null,
    currentCustomerName: null,
    currentslCode: null,
  });

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    packageId: string | null;
    trackingNumber: string | null;
  }>({
    open: false,
    packageId: null,
    trackingNumber: null,
  });

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [detailsPackageId, setDetailsPackageId] = useState<string | null>(null);
  const [invoiceCache, setInvoiceCache] = useState<
    Record<string, Record<string, unknown>[] | "loading">
  >({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [syncingPackage, setSyncingPackage] = useState<string | null>(null);

  const [invoicesModalOpen, setInvoicesModalOpen] = useState(false);
  const [invoicesModalPackage, setInvoicesModalPackage] = useState<any | null>(null);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [loadingInvoicesList, setLoadingInvoicesList] = useState(false);
  const [auditResults, setAuditResults] = useState<any | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [repairing, setRepairing] = useState(false);

  // Unified invoice fetching is now placed below currentPackages definition
  const [syncingInvoice, setSyncingInvoice] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<SP1InvoiceShape | null>(
    null,
  );
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [moveToTransitoriaDialog, setMoveToTransitoriaDialog] = useState(false);
  const [moveToTransitoriaMoving, setMoveToTransitoriaMoving] = useState(false);

  const [repriceExchangeRate, setRepriceExchangeRate] = useState<number>(500);
  const [repricePricingType, setRepricePricingType] =
    useState<string>("usa_air");

  // Reprice modal state
  const [repriceModal, setRepriceModal] = useState<{
    open: boolean;
    applying: boolean;
    previews: Array<{
      pkg: Package;
      currentCost: number | undefined;
      newCost: number;
      quoteRequired: boolean;
      breakdown: string;
      changed: boolean;
    }>;
  }>({ open: false, applying: false, previews: [] });

  // Pricing type → label + rules mapping (shown in modal)
  const PRICING_RULES: Record<string, { label: string; rules: string }> = {
    usa_air: {
      label: "🇺🇸 USA Aéreo",
      rules:
        "0–499g: $8 · 500g–1kg: $12 · cada 500g extra: +$8 (fracción ≥500g: +$12) · con permiso: ceil(kg)×$12 +$3",
    },
    usa_sea: {
      label: "🇺🇸 USA Marítimo",
      rules: "$30/pie³ · volumen = peso(kg) ÷ 28 · ~$1.07/kg",
    },
    mexico_air: {
      label: "🇲🇽 México Aéreo",
      rules: "$16/kg · con permiso: +$3/kg",
    },
    mexico_sea: {
      label: "🇲🇽 México Marítimo",
      rules: "$5/kg (peso volumétrico)",
    },
    china_air: { label: "🇨🇳 China Aéreo", rules: "$20/kg" },
    china_sea: { label: "🇨🇳 China Marítimo", rules: "$45/pie³" },
    colombia_air: { label: "🇨🇴 Colombia Aéreo", rules: "$12/kg" },
    colombia_sea: {
      label: "🇨🇴 Colombia Marítimo",
      rules: "$7/kg (peso volumétrico)",
    },
  };

  // Map package fields to calculatePrice args
  const mapPkgToCategory = (
    category?: string,
  ): import("@/lib/utils/pricing").ItemCategory =>
    category === "restricted"
      ? "restricted"
      : category === "electronics"
        ? "electronics"
        : "regular";

  // Compute previews for a set of packages using a given pricing type key
  const computeRepricePreviews = (pkgs: Package[], pricingType: string) => {
    const [c, s] = pricingType.split("_");
    const country = (["usa", "mexico", "china", "colombia"] as const).includes(
      c as any,
    )
      ? (c as import("@/lib/utils/pricing").Country)
      : "usa";
    const shipping: import("@/lib/utils/pricing").ShippingType =
      s === "sea" ? "sea" : "air";
    return pkgs.map((pkg) => {
      const category = mapPkgToCategory((pkg as any).category);
      const permit = !!(pkg as any).requiresPermit;
      const result = calculatePrice(
        pkg.weight ?? 0,
        country,
        shipping,
        category,
        permit,
        DEFAULT_PRICING,
      );
      return {
        pkg,
        currentCost: pkg.calculatedCost,
        newCost: result.price,
        quoteRequired: result.quoteRequired,
        breakdown: result.breakdown,
        changed: result.price !== (pkg.calculatedCost ?? 0),
      };
    });
  };

  // Recompute previews in real-time whenever pricing type changes while modal is open
  useEffect(() => {
    if (
      !repriceModal.open ||
      repriceModal.applying ||
      repriceModal.previews.length === 0
    )
      return;
    const currentIds = new Set(repriceModal.previews.map((p) => p.pkg.id));
    const selectedPkgs = packages.filter((pkg) => currentIds.has(pkg.id));
    if (selectedPkgs.length === 0) return;
    setRepriceModal((prev) => ({
      ...prev,
      previews: computeRepricePreviews(selectedPkgs, repricePricingType),
    }));
  }, [repricePricingType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open reprice modal: auto-detect dominant pricing type from selected packages
  const handleOpenRepriceModal = () => {
    const selectedPkgs = packages.filter((pkg) => selectedRows.has(pkg.id));
    // Detect most common manifestType among selected packages
    const typeCounts = new Map<string, number>();
    selectedPkgs.forEach((pkg) => {
      const mt = ((pkg as any).manifestType || "").toLowerCase();
      if (mt) typeCounts.set(mt, (typeCounts.get(mt) || 0) + 1);
    });
    const dominantType =
      typeCounts.size > 0
        ? [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : repricePricingType;
    const validType = dominantType in PRICING_RULES ? dominantType : "usa_air";
    setRepricePricingType(validType);
    const previews = computeRepricePreviews(selectedPkgs, validType);
    setRepriceModal({ open: true, applying: false, previews });
  };

  // Confirm reprice: save calculatedCost for all previews to Firebase
  const handleConfirmReprice = async () => {
    setRepriceModal((prev) => ({ ...prev, applying: true }));
    try {
      const updates = repriceModal.previews.map(({ pkg, newCost }) => {
        const costCRC = Math.round(newCost * repriceExchangeRate);
        return onBulkUpdate
          ? onBulkUpdate(
              pkg.id,
              {
                calculatedCost: newCost,
                price: newCost,
                costCRC,
                exchangeRate: repriceExchangeRate,
              },
              true,
            )
          : Promise.resolve();
      });
      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["packageSearch"] });
      toast({
        title: t("common.success"),
        description: `Precios actualizados para ${repriceModal.previews.length} paquete${repriceModal.previews.length !== 1 ? "s" : ""}`,
      });
      setRepriceModal({ open: false, applying: false, previews: [] });
      setSelectedRows(new Set());
    } catch (err: any) {
      toast({
        title: t("common.error"),
        description: err.message || "Error al actualizar precios",
        variant: "destructive",
      });
      setRepriceModal((prev) => ({ ...prev, applying: false }));
    }
  };

  // Helper function to map origin to branch
  const mapOriginToBranch = (origin: string): string => {
    const originLower = (origin || "").toLowerCase();
    if (
      originLower.includes("usa") ||
      originLower.includes("united states") ||
      originLower.includes("us")
    ) {
      return "usa";
    } else if (originLower.includes("mexico") || originLower.includes("mx")) {
      return "mexico";
    } else if (originLower.includes("china") || originLower.includes("cn")) {
      return "china";
    } else if (originLower.includes("colombia") || originLower.includes("co")) {
      return "colombia";
    }
    return "other";
  };



  // Realtime list of the 200 most-recent manifests — feeds both the bulk-update
  // popover AND the new inline PackageManifestEditor's typeahead. Subscribing
  // (instead of polling via useQuery + 5min staleTime) ensures that a manifest
  // ingested in another tab or by a colleague appears in the dropdown
  // immediately, with no refresh needed. The shape matches the previous
  // useQuery result so every consumer keeps working unchanged.
  const [manifestsForBulk, setManifestsForBulk] = useState<
    Array<{ id: string; manifestNumber?: string; manifestType?: string }>
  >([]);
  useEffect(() => {
    const q = fsQuery(
      collection(db, "manifests"),
      fsOrderBy("createdAt", "desc"),
      fsLimit(200),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setManifestsForBulk(
          snap.docs.map((d) => {
            const data = d.data() as {
              manifestNumber?: string;
              manifestType?: string;
            };
            return {
              id: d.id,
              manifestNumber: data.manifestNumber,
              manifestType: data.manifestType,
            };
          }),
        );
      },
      () => {
        /* swallow — keep last-known list to avoid a flash of empty UI */
      },
    );
    return () => unsub();
  }, []);
  // bulkUpdateData is now managed locally inside BulkPackagesUpdateModal

  // Copy tracking number to clipboard
  const copyToClipboard = React.useCallback(async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      toast({
        title: t("packages.copied"),
        description: `${t("packages.trackingNumber")}: ${trackingNumber}`,
      });
    } catch (err) {
      toast({
        title: t("common.error"),
        description: t("packages.copyError"),
        variant: "destructive",
      });
    }
  }, [t]);

  // Sync package to Firebase (smart-portal-2)
  const syncPackageToFirebase = async (pkg: Package) => {
    if (!pkg.slCode) {
      toast({
        title: t("common.error"),
        description: "El paquete necesita un código SL para sincronizar",
        variant: "destructive",
      });
      return;
    }

    setSyncingPackage(pkg.id);
    try {
      const token = await getAuthToken();
      const response = await fetch(`/api/packages/${pkg.id}/sync-to-firebase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.message ||
          errorData.error ||
          "Failed to sync package to Firebase";
        throw new Error(errorMessage);
      }

      const data = await response.json();

      toast({
        title: t("common.success"),
        description: `Paquete sincronizado con Firebase (SL2)`,
      });

      queryClient.invalidateQueries({ queryKey: ["packages"] });
    } catch (error: any) {
      console.error("Error syncing package to Firebase:", error);
      toast({
        title: t("common.error"),
        description: error.message || "Error al sincronizar con Firebase",
        variant: "destructive",
      });
    } finally {
      setSyncingPackage(null);
    }
  };

  // Sync invoice to Firebase (smart-portal-2)
  const syncInvoiceToFirebase = async (pkg: Package) => {
    if (!pkg.slCode) {
      toast({
        title: t("common.error"),
        description:
          "El paquete necesita un código SL para sincronizar la factura",
        variant: "destructive",
      });
      return;
    }

    if (!pkg.calculatedCost) {
      toast({
        title: t("common.error"),
        description:
          "El paquete necesita un costo calculado para sincronizar la factura",
        variant: "destructive",
      });
      return;
    }

    setSyncingInvoice(pkg.id);
    try {
      const token = await getAuthToken();
      const response = await fetch(
        `/api/packages/${pkg.id}/sync-invoice-to-firebase`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to sync invoice to Firebase");
      }

      const data = await response.json();

      toast({
        title: t("common.success"),
        description: `Factura sincronizada con Firebase (SL2)`,
      });

      queryClient.invalidateQueries({ queryKey: ["packages"] });
    } catch (error: any) {
      console.error("Error syncing invoice to Firebase:", error);
      toast({
        title: t("common.error"),
        description:
          error.message || "Error al sincronizar factura con Firebase",
        variant: "destructive",
      });
    } finally {
      setSyncingInvoice(null);
    }
  };

  const [bulkActionsModal, setBulkActionsModal] = useState(false);

  const [manifestWizard, setManifestWizard] = useState<{
    open: boolean;
    step: "checking" | "invoice_decision" | "executing";
    newManifest: string;
    selectedPkgs: Package[];
    invoiceQueue: Array<{
      invoiceId: string;
      invoice: Record<string, any>;
      matchedPkgs: Package[];
      totalItems: number;
      hasMultipleItems: boolean;
    }>;
    currentIdx: number;
    decisions: Array<{
      invoiceId: string;
      invoiceNumber: string;
      action: "annul" | "move_all" | "move_selected_only";
    }>;
  }>({
    open: false,
    step: "checking",
    newManifest: "",
    selectedPkgs: [],
    invoiceQueue: [],
    currentIdx: 0,
    decisions: [],
  });

  // Sync SmartWeb Modal State
  const [syncSmartWebOpen, setSyncSmartWebOpen] = useState(false);
  const [syncOrphansSmartWebOpen, setSyncOrphansSmartWebOpen] = useState(false);
  const [syncingPkgId, setSyncingPkgId] = useState<string | null>(null);

  const handleForceSyncRow = React.useCallback(async (pkg: any) => {
    if (syncingPkgId) return;
    setSyncingPkgId(pkg.id);
    const sp2Pkg = {
      id: pkg.id,
      trackingNumber: pkg.trackingNumber || (pkg as any).tracking || "",
      slCode: (pkg as any).slCode || "",
      customerName: (pkg as any).customerName || "",
      status: pkg.status,
      weight: pkg.weight,
      description: (pkg as any).description || "",
      origin: pkg.origin,
      ruta: (pkg as any).ruta || "",
      manifestNumber: (pkg as any).manifestNumber || "",
      requiresPermit:
        (pkg as any).requiresPermit || (pkg as any).permisos || false,
      cost: pkg.calculatedCost || (pkg as any).price || (pkg as any).cost || 0,
      calculatedCost: pkg.calculatedCost,
      currency: (pkg as any).currency || "USD",
      forceSync: true,
    };
    try {
      await syncPackagesToSmartWeb([sp2Pkg]);
      const syncedAt = new Date().toISOString();
      await firestoreApi.packages.update(pkg.id, {
        smartwebSynced: true,
        smartwebSyncedAt: syncedAt,
        smartwebSyncSource: "admin_force",
      } as any);
      toast({
        title: "Sync SP2 exitoso",
        description: `${sp2Pkg.trackingNumber} → estado "${pkg.status}" enviado a SmartWeb.`,
      });
    } catch (err: any) {
      toast({
        title: "Error al sincronizar con SP2",
        description: err?.message ?? "Network error",
        variant: "destructive",
      });
    } finally {
      setSyncingPkgId(null);
    }
  }, [syncingPkgId, toast, t]);

  // Facturar (Invoice) Modal State
  const [facturarModal, setFacturarModal] = useState<{
    open: boolean;
    step: "validation" | "processing" | "results";
    packageIds: string[];
    validationResults: {
      valid: Package[];
      invalid: Array<{ pkg: Package; reason: string }>;
    };
    processingStatus: {
      current: number;
      total: number;
      message: string;
    };
    results: {
      success: boolean;
      created: number;
      failed: number;
      invoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        customerId: string;
        customerName: string;
        packageCount: number;
        total: number;
        firebaseSynced: boolean;
        firebaseInvoiceId?: string;
        error?: string;
      }>;
      errors: string[];
    } | null;
    discountPercentage: number;
    syncToFirebase: boolean;
    currency: "USD" | "CRC";
    paymentMethod: string;
    notes: string;
    dueDate: string;
    taxRate: number;
  }>({
    open: false,
    step: "validation",
    packageIds: [],
    validationResults: { valid: [], invalid: [] },
    processingStatus: { current: 0, total: 0, message: "" },
    results: null,
    discountPercentage: 0,
    syncToFirebase: true,
    currency: "USD",
    paymentMethod: "",
    notes: "",
    dueDate: "",
    taxRate: 13,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [allAcrossPagesSelected, setAllAcrossPagesSelected] = useState(false);

  // Column sorting state
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Memoized sorting logic
  const sortedPackages = React.useMemo(() => {
    if (!sortField) return packages;

    return [...packages].sort((a, b) => {
      const pa = a as any;
      const pb = b as any;
      let valA: any = "";
      let valB: any = "";

      if (sortField === "trackingNumber") {
        valA = pa.trackingNumber || pa.tracking || "";
        valB = pb.trackingNumber || pb.tracking || "";
      } else if (sortField === "manifestNumber") {
        valA = pa.manifestNumber || pa.manifiesto || "";
        valB = pb.manifestNumber || pb.manifiesto || "";
      } else if (sortField === "customerName") {
        valA = pa.customerName || "";
        valB = pb.customerName || "";
      } else if (sortField === "invoice") {
        const getInv = (pkgId: string) => {
          const invs = invoiceCache[pkgId];
          if (!invs || invs === "loading" || invs.length === 0) return "";
          const active = invs.find(
            (inv: any) => inv.status && !["cancelled", "annulled", "deleted"].includes(inv.status)
          );
          return (active || invs[0])?.invoiceNumber || (active || invs[0])?.id || "";
        };
        valA = getInv(pa.id);
        valB = getInv(pb.id);
      } else if (sortField === "route") {
        valA = pa.ruta || pa.route?.name || "";
        valB = pb.route?.name || pb.ruta || "";
      } else if (sortField === "weight") {
        valA = pa.weight || 0;
        valB = pb.weight || 0;
      } else if (sortField === "status") {
        valA = pa.status || "";
        valB = pb.status || "";
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (strA < strB) return sortDirection === "asc" ? -1 : 1;
      if (strA > strB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [packages, sortField, sortDirection, invoiceCache]);

  // Pagination logic — disabled when parent handles server-side pagination
  const totalPages = Math.ceil(sortedPackages.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPackages = disablePagination
    ? sortedPackages
    : sortedPackages.slice(startIndex, endIndex);

  // Fetch invoices for all packages visible on the current page
  useEffect(() => {
    if (!currentPackages || currentPackages.length === 0) return;
    currentPackages.forEach((pkg) => {
      const pkgId = pkg.id;
      if (invoiceCache[pkgId] !== undefined) return;
      if (!pkg?.trackingNumber) {
        setInvoiceCache((prev) => ({ ...prev, [pkgId]: [] }));
        return;
      }
      setInvoiceCache((prev) => ({ ...prev, [pkgId]: "loading" }));
      getInvoiceByTracking(pkg.trackingNumber)
        .then((nums) => setInvoiceCache((prev) => ({ ...prev, [pkgId]: nums })))
        .catch(() => setInvoiceCache((prev) => ({ ...prev, [pkgId]: [] })));
    });
  }, [currentPackages, invoiceCache]);

  const handleOpenInvoicesModal = async (pkg: any) => {
    setAuditResults(null);
    setInvoicesModalPackage(pkg);
    setInvoicesModalOpen(true);
    if (!pkg.trackingNumber) {
      setInvoicesList([]);
      return;
    }
    setLoadingInvoicesList(true);
    try {
      const res = await getInvoiceByTracking(pkg.trackingNumber);
      setInvoicesList(res || []);
      setInvoiceCache((prev) => ({ ...prev, [pkg.id]: res || [] }));
    } catch (error) {
      console.error("Error fetching invoices for modal:", error);
      setInvoicesList([]);
    } finally {
      setLoadingInvoicesList(false);
    }
  };

  const handleAnnulInvoiceFromModal = async (invoiceId: string) => {
    if (!invoicesModalPackage) return;
    setUpdating(true);
    try {
      const targetInvoice = invoicesList.find((inv) => inv.id === invoiceId);
      if (!targetInvoice) return;
      
      const invoiceNumber = targetInvoice.invoiceNumber || invoiceId;
      
      // 1. Update invoice status to 'annulled' in Firestore
      await firestoreApi.invoices.update(invoiceId, {
        status: "annulled",
        annulledAt: new Date().toISOString(),
        annulledReason: "Anulado desde el modal de facturas del paquete",
      });
      
      // 2. Delete from SP2 (SmartWeb)
      await deleteInvoiceFromSp2(invoiceId, invoiceNumber).catch((err) => {
        console.warn("[handleAnnulInvoiceFromModal] SP2 deletion failed:", err);
      });
      
      // 3. Clear package invoice association in Firestore for all packages linked to this invoice
      const trackings: string[] = [
        ...((targetInvoice.trackingNumbers as string[]) || []),
        targetInvoice.trackingNumber as string,
      ].filter(Boolean);
      
      if (trackings.length > 0) {
        const pkgDocs = await Promise.all(
          trackings.map(async (tr) => {
            const [snapTN, snapT] = await Promise.all([
              getDocs(fsQuery(collection(db, "packages"), where("trackingNumber", "==", tr))),
              getDocs(fsQuery(collection(db, "packages"), where("tracking", "==", tr))),
            ]);
            return !snapTN.empty ? snapTN.docs[0] : !snapT.empty ? snapT.docs[0] : null;
          })
        );
        
        const validDocs = pkgDocs.filter((d): d is NonNullable<typeof d> => d !== null);
        
        if (validDocs.length > 0) {
          const pkgBatch = writeBatch(db);
          validDocs.forEach((pkgDoc) => {
            pkgBatch.update(doc(db, "packages", pkgDoc.id), {
              invoiceId: deleteField(),
              invoiceNumber: deleteField(),
              smartwebSynced: false,
              consolidacion: true,
              status: "consolidated",
            });
          });
          await pkgBatch.commit();
        }
      }
      
      toast({
        title: "Factura anulada",
        description: `La factura ${invoiceNumber} ha sido anulada con éxito.`,
      });
      
      // 4. Refresh the invoices list for the modal
      if (invoicesModalPackage?.trackingNumber) {
        const updatedInvoices = await getInvoiceByTracking(invoicesModalPackage.trackingNumber);
        setInvoicesList(updatedInvoices || []);
        setInvoiceCache((prev) => ({ ...prev, [invoicesModalPackage.id]: updatedInvoices || [] }));
      }
      
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-cursor"] });
    } catch (error) {
      console.error("Error annulling invoice from modal:", error);
      toast({
        title: "Error al anular factura",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteInvoiceFromModal = async (invoiceId: string) => {
    if (!invoicesModalPackage) return;
    setUpdating(true);
    try {
      const targetInvoice = invoicesList.find((inv) => inv.id === invoiceId);
      if (!targetInvoice) return;
      const invoiceNumber = targetInvoice.invoiceNumber || invoiceId;

      // 1. Delete from SP1 Firestore
      await firestoreApi.invoices.delete(invoiceId);

      // 2. Delete from SP2
      await deleteInvoiceFromSp2(invoiceId, invoiceNumber).catch((err) => {
        console.warn("[handleDeleteInvoiceFromModal] SP2 deletion failed:", err);
      });

      // 3. Clear package invoice association in Firestore for all packages linked to this invoice
      const trackings: string[] = [
        ...((targetInvoice.trackingNumbers as string[]) || []),
        targetInvoice.trackingNumber as string,
      ].filter(Boolean);

      if (trackings.length > 0) {
        const pkgDocs = await Promise.all(
          trackings.map(async (tr) => {
            const [snapTN, snapT] = await Promise.all([
              getDocs(fsQuery(collection(db, "packages"), where("trackingNumber", "==", tr))),
              getDocs(fsQuery(collection(db, "packages"), where("tracking", "==", tr))),
            ]);
            return !snapTN.empty ? snapTN.docs[0] : !snapT.empty ? snapT.docs[0] : null;
          })
        );

        const validDocs = pkgDocs.filter((d): d is NonNullable<typeof d> => d !== null);

        if (validDocs.length > 0) {
          const pkgBatch = writeBatch(db);
          validDocs.forEach((pkgDoc) => {
            pkgBatch.update(doc(db, "packages", pkgDoc.id), {
              invoiceId: deleteField(),
              invoiceNumber: deleteField(),
              smartwebSynced: false,
              consolidacion: true,
              status: "consolidated",
            });
          });
          await pkgBatch.commit();
        }
      }

      toast({
        title: "Factura eliminada",
        description: `La factura ${invoiceNumber} ha sido eliminada con éxito.`,
      });

      // 4. Refresh the invoices list for the modal
      if (invoicesModalPackage?.trackingNumber) {
        const updatedInvoices = await getInvoiceByTracking(invoicesModalPackage.trackingNumber);
        setInvoicesList(updatedInvoices || []);
        setInvoiceCache((prev) => ({ ...prev, [invoicesModalPackage.id]: updatedInvoices || [] }));
      }

      // Reset audit
      setAuditResults(null);

      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-cursor"] });
    } catch (error) {
      console.error("Error deleting invoice from modal:", error);
      toast({
        title: "Error al eliminar factura",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleChangeInvoiceStatusFromModal = async (invoiceId: string, newStatus: string) => {
    if (!invoicesModalPackage) return;
    setUpdating(true);
    try {
      const targetInvoice = invoicesList.find((inv) => inv.id === invoiceId);
      if (!targetInvoice) return;
      const invoiceNumber = targetInvoice.invoiceNumber || invoiceId;

      // 1. Update status in SP1 Firestore
      await firestoreApi.invoices.update(invoiceId, { status: newStatus });

      // 2. Push status to SP2
      await pushStatusToSp2(invoiceId, invoiceNumber, newStatus).catch((err) => {
        console.warn("[handleChangeInvoiceStatusFromModal] SP2 status push failed:", err);
      });

      // 3. Update SP1 packages and SP2 shipments status based on new status
      const targetPkgStatus = newStatus === "paid" ? "on_route" : newStatus === "sent" ? "processed" : "consolidated";
      await syncInvoicePackagesToSp2(targetInvoice, targetPkgStatus, { forceSync: true }).catch((err) => {
        console.warn("[handleChangeInvoiceStatusFromModal] Packages status sync failed:", err);
      });

      toast({
        title: "Estado actualizado",
        description: `La factura ${invoiceNumber} cambió de estado a "${newStatus}" con éxito.`,
      });

      // 4. Refresh the invoices list for the modal
      if (invoicesModalPackage?.trackingNumber) {
        const updatedInvoices = await getInvoiceByTracking(invoicesModalPackage.trackingNumber);
        setInvoicesList(updatedInvoices || []);
        setInvoiceCache((prev) => ({ ...prev, [invoicesModalPackage.id]: updatedInvoices || [] }));
      }

      // Reset audit
      setAuditResults(null);

      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices-cursor"] });
    } catch (error) {
      console.error("Error changing status of invoice from modal:", error);
      toast({
        title: "Error al cambiar estado",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleSyncInvoiceFromModal = async (invoice: any) => {
    setUpdating(true);
    try {
      const res = await syncInvoicesToSp2([invoice]);
      if (res.ok) {
        toast({
          title: "Sincronización exitosa",
          description: `La factura ${invoice.invoiceNumber || invoice.id} ha sido sincronizada con SP2.`,
        });
      } else {
        toast({
          title: "Sincronización con advertencias",
          description: "La sincronización reportó algunos problemas o fue omitida (ej. borrador).",
          variant: "warning" as any,
        });
      }

      // Refresh the invoices list for the modal
      if (invoicesModalPackage?.trackingNumber) {
        const updatedInvoices = await getInvoiceByTracking(invoicesModalPackage.trackingNumber);
        setInvoicesList(updatedInvoices || []);
        setInvoiceCache((prev) => ({ ...prev, [invoicesModalPackage.id]: updatedInvoices || [] }));
      }

      // Reset audit
      setAuditResults(null);
    } catch (error) {
      console.error("Error syncing invoice from modal:", error);
      toast({
        title: "Error al sincronizar factura",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  // =========================================================================
  // HIGH-PERFORMANCE BACKEND AUDIT (ANTI-REGRESSION WARNING)
  // =========================================================================
  // Do NOT query dbSP2 directly in a loop or from the client. Doing so causes
  // resource-exhausted Firestore errors, CORS blocking, and severe browser memory
  // leaks under massive package lists. Always use the backend Cloud Function:
  // firebaseApi.packages.auditSp2
  // =========================================================================
  const handleRunAuditSp2 = async () => {
    if (!invoicesModalPackage) return;
    const trackingNumber = invoicesModalPackage.trackingNumber || invoicesModalPackage.tracking;
    if (!trackingNumber) return;

    setLoadingAudit(true);
    try {
      // 1. Gather all tracking numbers from all invoices
      const allTrackings = new Set<string>();
      invoicesList.forEach((inv) => {
        const items = inv.invoiceItems ?? inv.items ?? [];
        items.forEach((item: any) => {
          const t = item.trackingNumber || item.tracking;
          if (t) allTrackings.add(t.toUpperCase().trim());
        });
      });
      // Also add the main package's tracking
      const mainTracking = (invoicesModalPackage.trackingNumber || invoicesModalPackage.tracking || "").toUpperCase().trim();
      if (mainTracking) allTrackings.add(mainTracking);

      const trackingsArray = Array.from(allTrackings);

      // 2. Fetch local packages for these trackings to get status and IDs
      const localPkgsList: Array<{ id: string; trackingNumber: string; status: string }> = [];
      if (trackingsArray.length > 0) {
        try {
          const batches = [];
          for (let i = 0; i < trackingsArray.length; i += 30) {
            batches.push(trackingsArray.slice(i, i + 30));
          }
          
          const { collection, query, where, getDocs } = await import("firebase/firestore");
          
          for (const chunk of batches) {
            const q = query(
              collection(db, "packages"),
              where("trackingNumber", "in", chunk)
            );
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              localPkgsList.push({
                id: doc.id,
                trackingNumber: data.trackingNumber || data.tracking || "",
                status: data.status || "N/A",
              });
            });
          }
        } catch (fetchErr) {
          console.error("Error fetching local packages for audit:", fetchErr);
        }
      }

      // If any of the trackings didn't have a package doc in SP1, add them as shell items so they can still be audited in SP2
      trackingsArray.forEach(t => {
        if (!localPkgsList.some(p => p.trackingNumber.toUpperCase().trim() === t)) {
          localPkgsList.push({
            id: t,
            trackingNumber: t,
            status: "N/A",
          });
        }
      });

      const res = await firebaseApi.packages.auditSp2({
        trackingNumber,
        invoicesList: invoicesList.map((localInv) => ({
          id: localInv.id,
          invoiceNumber: localInv.invoiceNumber || localInv.id,
          status: localInv.status || "N/A",
          totalAmount: localInv.totalAmount || localInv.total || 0,
        })),
        packagesList: localPkgsList,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || "No se pudo completar la auditoría");
      }

      const auditRes = res.data;

      // Enrich result with local package status
      auditRes.package.statusSp1 = invoicesModalPackage.status || "N/A";

      if (auditRes.package.exists && auditRes.package.statusSp1 !== auditRes.package.statusSp2) {
        auditRes.package.mismatch = true;
      }

      // Check if there are any issues
      auditRes.hasIssues = !auditRes.package.exists ||
                          auditRes.package.isDuplicate ||
                          auditRes.package.mismatch ||
                          auditRes.invoices.some((i: any) => i.mismatch) ||
                          (auditRes.packages && auditRes.packages.some((p: any) => p.mismatch || p.isDuplicate));

      setAuditResults(auditRes);
      toast({
        title: "Auditoría completada",
        description: auditRes.hasIssues
          ? "Se encontraron desajustes entre SP1 y SP2. Use la opción de reparar."
          : "Todo está sincronizado correctamente con SP2.",
        variant: auditRes.hasIssues ? "warning" as any : "default",
      });
    } catch (error) {
      console.error("Error auditing SP2:", error);
      toast({
        title: "Error en auditoría SP2",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleRepairSp2 = async () => {
    if (!invoicesModalPackage || !auditResults) return;
    setRepairing(true);
    try {
      const trackingNumber = invoicesModalPackage.trackingNumber || invoicesModalPackage.tracking;
      
      // 1. Repair Package in SP2
      if (!auditResults.package.exists || auditResults.package.mismatch) {
        // Find local package document ID
        const localPkgQuery = fsQuery(
          collection(db, "packages"),
          where("trackingNumber", "==", trackingNumber.toUpperCase())
        );
        const localPkgSnap = await getDocs(localPkgQuery);
        if (!localPkgSnap.empty) {
          const pkgDoc = localPkgSnap.docs[0];
          const pkgData = pkgDoc.data();
          await syncPackagesToSmartWeb([{
            id: pkgDoc.id,
            trackingNumber: pkgData.trackingNumber,
            slCode: pkgData.slCode,
            customerName: pkgData.customerName,
            status: pkgData.status,
            weight: pkgData.weight,
            description: pkgData.description,
            ruta: pkgData.ruta || "",
            forceSync: true,
            allowCreate: true,
          }]);
        }
      }

      // 2. Repair Invoices in SP2
      const mismatchedInvoices = auditResults.invoices.filter((i: any) => i.mismatch);
      if (mismatchedInvoices.length > 0) {
        const localInvsToSync = invoicesList.filter((inv) => 
          mismatchedInvoices.some((mi: any) => mi.id === inv.id)
        );
        if (localInvsToSync.length > 0) {
          await syncInvoicesToSp2(localInvsToSync);
        }
      }

      toast({
        title: "Reparación completada",
        description: "Se han enviado actualizaciones a SP2 para resolver los desajustes.",
      });

      // Run audit again to verify
      await handleRunAuditSp2();
    } catch (error) {
      console.error("Error repairing SP2:", error);
      toast({
        title: "Error al reparar SP2",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setRepairing(false);
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-slate-100 text-slate-800 border-slate-200";
      case "sent":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "paid":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "overdue":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      case "annulled":
        return "bg-gray-100 text-gray-800 border-gray-200 line-through";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatCurrencyValue = (amount: number, currencyCode: string = "USD") => {
    const currencySymbols: Record<string, string> = {
      USD: "$",
      EUR: "€",
      GBP: "£",
      CRC: "₡",
    };
    const symbol = currencySymbols[currencyCode] || currencyCode;
    const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
    return `${symbol}${safeAmount.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
  };

  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: currentPackages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: React.useCallback(
      (index: number) => {
        const pkg = currentPackages[index];
        return expandedRows[pkg?.id] ? 350 : 42;
      },
      [currentPackages, expandedRows]
    ),
    overscan: 10,
  });

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Reset to page 1 when packages change (e.g., after filtering or data refresh)
  useEffect(() => {
    setCurrentPage(1);
  }, [packages.length]);

  const toggleRowExpanded = React.useCallback((packageId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [packageId]: !prev[packageId],
    }));
  }, []);

  const selectAllAcrossPages = React.useCallback(() => {
    setSelectedRows(new Set(packages.map((pkg) => pkg.id)));
    setAllAcrossPagesSelected(true);
  }, [packages]);

  const clearAllSelection = React.useCallback(() => {
    setSelectedRows(new Set());
    setAllAcrossPagesSelected(false);
  }, []);

  const toggleRowSelection = React.useCallback((packageId: string) => {
    setAllAcrossPagesSelected(false);
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(packageId)) {
        newSet.delete(packageId);
      } else {
        newSet.add(packageId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = React.useCallback(() => {
    const currentPageIds = currentPackages.map((pkg) => pkg.id);
    const allCurrentPageSelected = currentPageIds.every((id) =>
      selectedRows.has(id),
    );
    setAllAcrossPagesSelected(false);
    if (allCurrentPageSelected) {
      setSelectedRows((prev) => {
        const newSet = new Set(prev);
        currentPageIds.forEach((id) => newSet.delete(id));
        return newSet;
      });
    } else {
      setSelectedRows((prev) => {
        const newSet = new Set(prev);
        currentPageIds.forEach((id) => newSet.add(id));
        return newSet;
      });
    }
  }, [currentPackages, selectedRows]);

  const handleReassignCustomerClick = React.useCallback((pkgId: string, currentId: string | null, currentName: string | null, currentslCode: string | null) => {
    setCustomerEditModal({
      open: true,
      packageId: pkgId,
      currentCustomerId: currentId,
      currentCustomerName: currentName,
      currentslCode: currentslCode,
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedRows);
      const results = await Promise.allSettled(
        ids.map((id) => (onDelete ? onDelete(id) : Promise.resolve())),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      setSelectedRows(new Set());
      setBulkDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["packageSearch"] });
      toast({
        title: t("common.success"),
        description: `${succeeded} paquete${succeeded !== 1 ? "s" : ""} eliminado${succeeded !== 1 ? "s" : ""}${failed > 0 ? ` · ${failed} error${failed !== 1 ? "es" : ""}` : ""}`,
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (error) {
      console.error("Bulk delete error:", error);
      toast({
        title: t("common.error"),
        description: "Error al eliminar paquetes",
        variant: "destructive",
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleMoveToConsolidacionTransitoria = async () => {
    if (selectedRows.size === 0 || !onBulkUpdate) return;
    setMoveToTransitoriaMoving(true);
    try {
      // Capture current package data BEFORE overwriting manifestNumber,
      // so we can stamp originalManifestID for the consolidation view.
      const selectedPkgs = packages.filter((pkg) => selectedRows.has(pkg.id));
      const syncedAt = new Date().toISOString();

      // ── 1. Update Firestore SP1: manifest fields + status 'consolidated' ───
      //    Each package keeps its originalManifestID so the ConsolidationManifests
      //    view can group it under its source manifest panel instead of a
      //    standalone "Consolidación Transitoria" panel.
      const results = await Promise.allSettled(
        selectedPkgs.map((pkg) => {
          const currentMf = (pkg as any).manifestNumber || (pkg as any).manifiesto || '';
          const alreadyTransitoria = currentMf === 'consolidacion_transitoria';
          return onBulkUpdate(
            pkg.id,
            {
              manifestId:     "consolidacion_transitoria",
              manifestNumber: "consolidacion_transitoria",
              consolidacion:  true,
              status:         "consolidated",  // renders as "Consolidado" badge
              // GAP-2 FIX (DataTable): clear stale invoice association so the package
              // appears as un-invoiced in transitoria and is visible to all pools.
              invoiceId:      null,
              invoiceNumber:  null,
              smartwebSynced:     false,
              smartwebSyncSource: "transitoria",
              // GAP-3 FIX: guard with existing value — never overwrite once stamped.
              // This ensures idempotent moves: if moved to transitoria twice,
              // originalManifestID still points to the true origin manifest.
              ...(!alreadyTransitoria && currentMf && !(pkg as any).originalManifestID
                ? { originalManifestID: currentMf }
                : {}),
            },
            true,
          );
        }),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed    = results.length - succeeded;

      // ── 2. SP2 sync ── push 'consolidated' so customer portal reflects move ──
      const pkgsToSync = selectedPkgs
        .map((pkg) => {
          // slCode can live at top-level OR nested under customer
          const slCode =
            (pkg as any).slCode ||
            (pkg as any).customer?.slCode ||
            "";
          const customerName =
            (pkg as any).customerName ||
            (pkg as any).customer?.name ||
            "";
          return {
            id:             pkg.id,
            trackingNumber: pkg.trackingNumber || (pkg as any).tracking || "",
            slCode,
            customerName,
            status:         "consolidated",  // SP2 English key → shows "Consolidado"
            weight:         (pkg as any).weight,
            description:    (pkg as any).description,
            ruta:           (pkg as any).ruta || "",
            manifestNumber: "consolidacion_transitoria",
            forceSync:      true,   // bypass SP2 regression guard (was Entregado)
            allowCreate:    true,   // create in SP2 if shipment is missing
          };
        })
        .filter((p) => !!p.trackingNumber);

      let syncCreated = 0;
      let syncUpdated = 0;
      let syncSkipped = 0;
      let syncErrors  = 0;

      if (pkgsToSync.length > 0) {
        try {
          const syncResult = await syncPackagesToSmartWeb(pkgsToSync);
          syncCreated = syncResult.created;
          syncUpdated = syncResult.updated;
          syncSkipped = syncResult.skipped;
          syncErrors  = syncResult.errors;

          // Log full per-package outcome for debugging
          console.info(
            "[transitoria→SP2] sync result:",
            { syncCreated, syncUpdated, syncSkipped, syncErrors },
            syncResult.details,
          );

          // Only stamp metadata if at least one package reached SP2
          const actualSynced = syncCreated + syncUpdated;
          if (actualSynced > 0) {
            await Promise.allSettled(
              pkgsToSync.map((p) =>
                firestoreApi.packages.update(p.id, {
                  smartwebSynced:     true,
                  smartwebSyncedAt:   syncedAt,
                  smartwebSyncSource: "transitoria",
                } as any),
              ),
            );
          }
        } catch (syncErr: any) {
          console.error("[transitoria→SP2] sync call failed:", syncErr?.message);
          syncErrors = pkgsToSync.length;
        }
      }

      setSelectedRows(new Set());
      setMoveToTransitoriaDialog(false);
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["packageSearch"] });

      const sp2Parts: string[] = [];
      if (syncCreated > 0) sp2Parts.push(`${syncCreated} creado${syncCreated !== 1 ? "s" : ""} en SP2`);
      if (syncUpdated > 0) sp2Parts.push(`${syncUpdated} actualizado${syncUpdated !== 1 ? "s" : ""} en SP2`);
      if (syncSkipped > 0) sp2Parts.push(`${syncSkipped} omitido${syncSkipped !== 1 ? "s" : ""} (ver consola)`);
      if (syncErrors  > 0) sp2Parts.push(`${syncErrors} error${syncErrors !== 1 ? "es" : ""} en sync`);

      const hasSyncIssue = syncErrors > 0 || (pkgsToSync.length > 0 && syncCreated + syncUpdated === 0);
      toast({
        title: "Consolidación Transitoria",
        description:
          `${succeeded} paquete${succeeded !== 1 ? "s" : ""} movido${succeeded !== 1 ? "s" : ""} a Consolidación Transitoria` +
          (sp2Parts.length > 0 ? ` · ${sp2Parts.join(", ")}` : "") +
          (failed > 0 ? ` · ${failed} error${failed !== 1 ? "es" : ""} SP1` : ""),
        variant: hasSyncIssue || failed > 0 ? "destructive" : "default",
      });
    } catch (error) {
      console.error("Move to transitoria error:", error);
      toast({
        title: t("common.error"),
        description: "Error al mover paquetes a Consolidación Transitoria",
        variant: "destructive",
      });
    } finally {
      setMoveToTransitoriaMoving(false);
    }
  };

  const resetBulkState = () => {
    setSelectedRows(new Set());
    setBulkActionsModal(false);
    setManifestWizard({
      open: false,
      step: "checking",
      newManifest: "",
      selectedPkgs: [],
      invoiceQueue: [],
      currentIdx: 0,
      decisions: [],
    });
  };

  const executeManifestUpdate = async (
    pkgsToMove: Package[],
    newManifest: string,
    decisions: Array<{
      invoiceId: string;
      invoiceNumber: string;
      action: string;
    }>,
    invoiceQueue: Array<{
      invoiceId: string;
      invoice: Record<string, any>;
      matchedPkgs: Package[];
      totalItems: number;
      hasMultipleItems: boolean;
    }>,
  ) => {
    setUpdating(true);
    const now = new Date().toISOString();
    try {
      let allPkgsToMove = [...pkgsToMove];

      for (const decision of decisions) {
        const queueItem = invoiceQueue.find(
          (q) => q.invoiceId === decision.invoiceId,
        );
        if (!queueItem) continue;

        if (decision.action === "annul") {
          await firestoreApi.invoices
            .update(decision.invoiceId, {
              status: "annulled",
              annulledAt: now,
              annulledReason: `Paquetes movidos al manifiesto ${newManifest}`,
            })
            .catch(() => {});
        } else if (decision.action === "move_all") {
          const invoiceTrackings: string[] = [
            ...((queueItem.invoice.trackingNumbers as string[]) || []),
            queueItem.invoice.trackingNumber as string,
          ].filter(Boolean);
          const extraPkgs = packages.filter(
            (p) =>
              p.trackingNumber &&
              invoiceTrackings.includes(p.trackingNumber) &&
              !allPkgsToMove.find((sp) => sp.id === p.id),
          );
          allPkgsToMove = [...allPkgsToMove, ...extraPkgs];
        }
      }

      const seen = new Set<string>();
      allPkgsToMove = allPkgsToMove.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      // 🚨 Strict category separation guard: Regular vs Permits (DANP)
      const isPermisoBatch = allPkgsToMove.some(
        (p: any) => p.permisos || p.isPermiso || p.requiresPermit || String(p.manifestNumber || '').toUpperCase().endsWith('DANP') || String(p.manifestNumber || '').toUpperCase().includes('PERMISO')
      );
      const targetIsPermiso = newManifest.toUpperCase().endsWith('DANP') || newManifest.toUpperCase().includes('PERMISO') || newManifest.toUpperCase().includes('PERMIT');
      if (isPermisoBatch !== targetIsPermiso) {
        throw new Error(
          isPermisoBatch
            ? 'Los paquetes seleccionados son de permisos y no pueden trasladarse a un manifiesto regular.'
            : 'Los paquetes seleccionados son regulares y no pueden trasladarse a un manifiesto de permisos (DANP).'
        );
      }

      const BATCH_SIZE = 490;
      for (let i = 0; i < allPkgsToMove.length; i += BATCH_SIZE) {
        const chunk = allPkgsToMove.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((pkg) => {
          const originalManifest = (pkg as any).manifestNumber || null;
          batch.update(doc(collection(db, "packages"), pkg.id), {
            manifestNumber: newManifest,
            manifestId: newManifest,
            updatedManifest: newManifest,
            manifestUpdatedAt: now,
            ...(originalManifest && originalManifest !== newManifest
              ? { originalManifestID: originalManifest }
              : {}),
          });
        });
        await batch.commit();
      }

      // Sync manifest_encomiendas for the destination manifest.
      // syncManifestEncomiendaFromPackages queries packages (source of truth) so it
      // correctly overwrites any stale manifest_encomiendas docs — even those that had
      // a wrong ruta field name or belonged to a different manifest before the move.
      syncManifestEncomiendaFromPackages(newManifest).catch(() => {});

      await upsertPackagesToManifestDoc(
        newManifest,
        allPkgsToMove.map((p) => ({
          tracking: p.trackingNumber || (p as any).tracking || p.id,
          slCode: (p as any).slCode || "",
          customerName: (p as any).customerName || "",
          customerEmail: (p as any).customerEmail || (p as any).email || "",
          ruta: (p as any).ruta || (p as any).destination || "",
          weight: (p as any).weight || (p as any).peso || 0,
          price: (p as any).price || (p as any).calculatedCost || 0,
          description: (p as any).description || "",
          permisos: (p as any).permisos ?? false,
        })),
      ).catch(() => {});

      const trackings = allPkgsToMove
        .map((p) => p.trackingNumber || (p as any).tracking)
        .filter(Boolean) as string[];
      await batchUpdateConsolidationManifest(trackings, newManifest).catch(
        () => {},
      );

      const oldManifests = new Set(
        allPkgsToMove.map((p) => (p as any).manifestNumber).filter(Boolean),
      );
      await Promise.all(
        Array.from(oldManifests)
          .filter((old) => old !== newManifest)
          .map((old) =>
            movePackagesBetweenManifestDocs(
              trackings,
              old as string,
              newManifest,
            ).catch(() => {}),
          ),
      );

      // Audit — one event per source manifest so history is traceable
      Array.from(oldManifests)
        .filter((old) => old !== newManifest)
        .forEach((old) => {
          const countFromOld =
            allPkgsToMove.filter((p) => (p as any).manifestNumber === old)
              .length || allPkgsToMove.length;
          auditLog({
            action: "manifest_packages_moved",
            category: "manifest",
            resource: "manifests",
            resourceId: newManifest,
            result: "success",
            metadata: {
              fromManifest: old,
              toManifest: newManifest,
              count: countFromOld,
            },
          });
        });

      // Optimistically reflect the new manifestNumber in every cached page so
      // the table updates immediately without waiting for the refetch.
      const movedIds = new Set(allPkgsToMove.map((p) => p.id));
      queryClient.setQueriesData<any>({ queryKey: ["packages"] }, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((pkg: any) =>
            movedIds.has(pkg.id)
              ? {
                  ...pkg,
                  manifestNumber: newManifest,
                  updatedManifest: newManifest,
                }
              : pkg,
          ),
        };
      });

      // Clear invoiceCache for moved packages so the next expand re-fetches
      // fresh invoice data (picking up any annulled status).
      setInvoiceCache((prev) => {
        const next = { ...prev };
        movedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ["packages"] });
      queryClient.invalidateQueries({ queryKey: ["packageSearch"] });
      toast({
        title: t("common.success"),
        description: `${allPkgsToMove.length} paquete${allPkgsToMove.length !== 1 ? "s" : ""} movido${allPkgsToMove.length !== 1 ? "s" : ""} al manifiesto ${newManifest}`,
      });
      resetBulkState();
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("packages.bulkUpdateError"),
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleManifestWizardDecide = async (
    action: "annul" | "move_all" | "move_selected_only",
  ) => {
    const { invoiceQueue, currentIdx, decisions, newManifest, selectedPkgs } =
      manifestWizard;
    const current = invoiceQueue[currentIdx];
    const inv = current.invoice;
    const newDecisions = [
      ...decisions,
      {
        invoiceId: current.invoiceId,
        invoiceNumber:
          (inv.invoiceNumber as string) ||
          (inv.number as string) ||
          `#${current.invoiceId.slice(-6)}`,
        action,
      },
    ];
    if (currentIdx + 1 < invoiceQueue.length) {
      setManifestWizard((prev) => ({
        ...prev,
        currentIdx: prev.currentIdx + 1,
        decisions: newDecisions,
      }));
    } else {
      setManifestWizard((prev) => ({
        ...prev,
        step: "executing",
        decisions: newDecisions,
      }));
      await executeManifestUpdate(
        selectedPkgs,
        newManifest,
        newDecisions,
        invoiceQueue,
      );
    }
  };

  const handleConfirmBulkUpdate = async (
    updates: Record<string, any>,
    deliveredOptions: { updateInvoices: boolean; syncInvoicesSp2: boolean },
    manifestNumber: string | null,
  ) => {
    setUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedRows).map((packageId) =>
          onBulkUpdate
            ? onBulkUpdate(packageId, updates, true)
            : Promise.resolve(),
        ),
      );

      // ── SmartWeb (SP2) sync — runs only for customer-visible milestone statuses ──
      if (
        updates.status &&
        SYNC_ELIGIBLE_STATUSES.has(updates.status)
      ) {
        const needsForceSync = FORCE_SYNC_STATUSES.has(updates.status);
        const pkgsToSync = packages
          .filter((pkg) => selectedRows.has(pkg.id))
          .map((pkg) => ({
            id: pkg.id,
            trackingNumber: pkg.trackingNumber || (pkg as any).tracking || "",
            slCode: (pkg as any).slCode || "",
            customerName: (pkg as any).customerName || "",
            status: updates.status,
            weight: (pkg as any).weight,
            description: (pkg as any).description,
            ruta: (pkg as any).ruta || updates.destination || "",
            manifestNumber: (pkg as any).manifestNumber,
            requiresPermit: (pkg as any).requiresPermit,
            cost: (pkg as any).calculatedCost ?? (pkg as any).cost,
            currency: (pkg as any).currency,
            ...(needsForceSync ? { forceSync: true } : {}),
          }))
          .filter((p) => !!p.trackingNumber);

        if (pkgsToSync.length > 0) {
          try {
            const syncResult = await syncPackagesToSmartWeb(pkgsToSync);
            const msg = `SmartWeb: ${syncResult.created} creados, ${syncResult.updated} actualizados, ${syncResult.skipped} omitidos`;
            toast({ title: "Sincronización SmartWeb", description: msg });
            // Persist sync stamp to each package doc so the table badge is permanent
            const syncedAt = new Date().toISOString();
            await Promise.allSettled(
              pkgsToSync.map((p) =>
                firestoreApi.packages.update(p.id, {
                  smartwebSynced: true,
                  smartwebSyncedAt: syncedAt,
                  smartwebSyncSource: "package",
                } as any),
              ),
            );
          } catch (syncErr: any) {
            toast({
              title: "Error SmartWeb Sync",
              description:
                syncErr?.message ?? "No se pudo sincronizar con SmartWeb",
              variant: "destructive",
            });
          }
        }
      }

      // ── Mark linked invoices as paid + sync to SP2 when setting packages to delivered ──
      if (
        updates.status === "delivered" &&
        deliveredOptions.updateInvoices
      ) {
        const selectedPkgList = packages.filter((pkg) =>
          selectedRows.has(pkg.id),
        );
        const invoiceMap = new Map<
          string,
          { id: string; invoiceNumber: string }
        >();
        await Promise.allSettled(
          selectedPkgList.map(async (pkg) => {
            const tracking =
              (pkg as any).trackingNumber || (pkg as any).tracking;
            if (!tracking) return;
            const results = await getInvoiceByTracking(tracking);
            const active = results.find(
              (inv: any) =>
                !["annulled", "void", "cancelled", "paid"].includes(
                  (inv.status || "").toLowerCase(),
                ),
            ) as any | undefined;
            if (!active?.id) return;
            invoiceMap.set(active.id, {
              id: active.id,
              invoiceNumber: active.invoiceNumber || active.id,
            });
          }),
        );
        const invoicesToPay = Array.from(invoiceMap.values());
        if (invoicesToPay.length > 0) {
          await Promise.allSettled(
            invoicesToPay.map((inv) =>
              firestoreApi.invoices.update(inv.id, { status: "paid" } as any),
            ),
          );
          if (deliveredOptions.syncInvoicesSp2) {
            invoicesToPay.forEach((inv) => {
              pushStatusToSp2(inv.id, inv.invoiceNumber, "paid");
            });
          }
          toast({
            title: "Facturas actualizadas",
            description: `${invoicesToPay.length} factura${invoicesToPay.length !== 1 ? "s" : ""} marcada${invoicesToPay.length !== 1 ? "s" : ""} como pagada${invoicesToPay.length !== 1 ? "s" : ""}${deliveredOptions.syncInvoicesSp2 ? " y sincronizadas con SP2" : ""}.`,
          });
        }
      }

      if (!manifestNumber) {
        queryClient.invalidateQueries({ queryKey: ["packages"] });
        queryClient.invalidateQueries({ queryKey: ["packageSearch"] });
        toast({
          title: t("common.success"),
          description: t("packages.bulkUpdateSuccess", {
            count: selectedRows.size,
          }),
        });
        resetBulkState();
        return;
      }

      const selectedPkgs = packages.filter((pkg) => selectedRows.has(pkg.id));

      setManifestWizard({
        open: true,
        step: "checking",
        newManifest: manifestNumber,
        selectedPkgs,
        invoiceQueue: [],
        currentIdx: 0,
        decisions: [],
      });

      const invoiceMap: Record<
        string,
        { invoice: Record<string, any>; matchedPkgs: Package[] }
      > = {};
      await Promise.allSettled(
        selectedPkgs.map(async (pkg) => {
          const trackingKey = pkg.trackingNumber || (pkg as any).tracking;
          if (!trackingKey) return;
          const results = await getInvoiceByTracking(trackingKey);
          const active = results.find(
            (inv) =>
              !["annulled", "void", "cancelled"].includes(
                ((inv as any).status || "").toLowerCase(),
              ),
          );
          if (!active || !(active as any).id) return;
          const invId = (active as any).id as string;
          if (!invoiceMap[invId])
            invoiceMap[invId] = {
              invoice: active as Record<string, any>,
              matchedPkgs: [],
            };
          invoiceMap[invId].matchedPkgs.push(pkg);
        }),
      );

      const invoiceQueue = Object.entries(invoiceMap)
        .map(([invoiceId, { invoice, matchedPkgs }]) => {
          const trackingNumbers: string[] = [
            ...((invoice.trackingNumbers as string[]) || []),
            invoice.trackingNumber as string,
          ].filter(Boolean);
          const allItems: any[] = (invoice.items as any[]) || [];
          const totalItems =
            allItems.length > 0 ? allItems.length : trackingNumbers.length || 1;
          return {
            invoiceId,
            invoice,
            matchedPkgs,
            totalItems,
            hasMultipleItems: totalItems > 1,
          };
        })
        .filter((q) => q.matchedPkgs.length > 0);

      if (invoiceQueue.length === 0) {
        setManifestWizard((prev) => ({ ...prev, step: "executing" }));
        await executeManifestUpdate(selectedPkgs, manifestNumber, [], []);
      } else {
        setManifestWizard((prev) => ({
          ...prev,
          invoiceQueue,
          step: "invoice_decision",
        }));
      }
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("packages.bulkUpdateError"),
        variant: "destructive",
      });
      setManifestWizard((prev) => ({ ...prev, open: false }));
    } finally {
      setUpdating(false);
    }
  };

  // Facturar: Open modal and run pre-validations
  const handleOpenFacturarModal = () => {
    const selectedPackages = packages.filter((pkg) => selectedRows.has(pkg.id));

    // Pre-validate packages
    const valid: Package[] = [];
    const invalid: Array<{ pkg: Package; reason: string }> = [];

    for (const pkg of selectedPackages) {
      const reasons: string[] = [];

      // Check if package has a customer assigned
      if (!pkg.customerId) {
        reasons.push(t("packages.facturar.validation.noCustomer"));
      }

      // Check if package has calculated cost
      if (!pkg.calculatedCost || pkg.calculatedCost === 0) {
        reasons.push(t("packages.facturar.validation.noCost"));
      }

      // Check if package has SL account code (either on package or customer)
      if (!pkg.customer?.slCode && !pkg.customer?.slCode) {
        reasons.push(t("packages.facturar.validation.noSlCode"));
      }

      if (reasons.length > 0) {
        invalid.push({ pkg, reason: reasons.join(", ") });
      } else {
        valid.push(pkg);
      }
    }

    setFacturarModal({
      open: true,
      step: "validation",
      packageIds: Array.from(selectedRows),
      validationResults: { valid, invalid },
      processingStatus: { current: 0, total: 0, message: "" },
      results: null,
      discountPercentage: 0,
      syncToFirebase: true,
      currency: "USD",
      paymentMethod: "",
      notes: "",
      dueDate: "",
      taxRate: 13,
    });
  };

  // Facturar: Process invoices
  const handleProcessFacturar = async () => {
    if (facturarModal.validationResults.valid.length === 0) {
      toast({
        title: t("common.error"),
        description: t("packages.facturar.noValidPackages"),
        variant: "destructive",
      });
      return;
    }

    setFacturarModal((prev) => ({
      ...prev,
      step: "processing",
      processingStatus: {
        current: 0,
        total: prev.validationResults.valid.length,
        message: t("packages.facturar.processing.starting"),
      },
    }));

    try {
      const validPackageIds = facturarModal.validationResults.valid.map(
        (pkg) => pkg.id,
      );

      setFacturarModal((prev) => ({
        ...prev,
        processingStatus: {
          current: 0,
          total: validPackageIds.length,
          message: t("packages.facturar.processing.creatingInvoices"),
        },
      }));

      const token = await getAuthToken();
      const response = await fetch("/api/invoices/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packageIds: validPackageIds,
          discountPercentage: facturarModal.discountPercentage,
          syncToFirebase: facturarModal.syncToFirebase,
          autoGeneratePdf: true,
          currency: facturarModal.currency,
          paymentMethod: facturarModal.paymentMethod || undefined,
          notes: facturarModal.notes || undefined,
          dueDate: facturarModal.dueDate || undefined,
          taxRate: facturarModal.taxRate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || t("packages.facturar.error.apiError"),
        );
      }

      setFacturarModal((prev) => ({
        ...prev,
        step: "results",
        results: data,
        processingStatus: {
          current: data.created + data.failed,
          total: prev.validationResults.valid.length,
          message: t("packages.facturar.processing.complete"),
        },
      }));

      // Refresh packages data
      queryClient.invalidateQueries({ queryKey: ["packages"] });

      if (data.success) {
        toast({
          title: t("common.success"),
          description: t("packages.facturar.success", { count: data.created }),
        });
      }
    } catch (error: any) {
      console.error("[Facturar] Error:", error);
      setFacturarModal((prev) => ({
        ...prev,
        step: "results",
        results: {
          success: false,
          created: 0,
          failed: prev.validationResults.valid.length,
          invoices: [],
          errors: [error.message || t("packages.facturar.error.unknown")],
        },
      }));

      toast({
        title: t("common.error"),
        description: error.message || t("packages.facturar.error.unknown"),
        variant: "destructive",
      });
    }
  };

  // Facturar: Close modal and reset
  const handleCloseFacturarModal = () => {
    const shouldClearSelection = facturarModal.results?.success;

    setFacturarModal({
      open: false,
      step: "validation",
      packageIds: [],
      validationResults: { valid: [], invalid: [] },
      processingStatus: { current: 0, total: 0, message: "" },
      results: null,
      discountPercentage: 0,
      syncToFirebase: true,
      currency: "USD",
      paymentMethod: "",
      notes: "",
      dueDate: "",
      taxRate: 13,
    });

    // Clear selection if invoices were created successfully
    if (shouldClearSelection) {
      setSelectedRows(new Set());
    }
  };

  // Generate PDF for a single package (no Firebase sync)
  const handleGeneratePdfForPackage = async (pkg: Package) => {
    if (!pkg.calculatedCost) {
      toast({
        title: t("common.error"),
        description: t("packages.generatePdfDisabled"),
        variant: "destructive",
      });
      return;
    }

    setUpdating(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/packages/${pkg.id}/generate-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          downloadOnly: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.message || data.error || t("packages.pdfGenerationError"),
        );
      }

      const data = await response.json();

      if (data.pdfUrl) {
        // Open PDF in new tab for download
        window.open(data.pdfUrl, "_blank");

        toast({
          title: t("common.success"),
          description: t("packages.pdfGenerated"),
        });

        // Refresh packages data to show PDF URL
        queryClient.invalidateQueries({ queryKey: ["packages"] });
      }
    } catch (error: any) {
      console.error("[generatePdf] Error:", error);
      toast({
        title: t("common.error"),
        description: error.message || t("packages.pdfGenerationError"),
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  // Handle single package facturar (opens modal with single package pre-selected)
  const handleSinglePackageFacturar = (pkg: Package) => {
    // Validate the package
    const reasons: string[] = [];

    if (!pkg.customerId) {
      reasons.push(t("packages.facturar.validation.noCustomer"));
    }

    if (!pkg.calculatedCost || pkg.calculatedCost === 0) {
      reasons.push(t("packages.facturar.validation.noCost"));
    }

    if (!pkg.customer?.slCode) {
      reasons.push(t("packages.facturar.validation.noSlCode"));
    }

    const valid = reasons.length === 0 ? [pkg] : [];
    const invalid =
      reasons.length > 0 ? [{ pkg, reason: reasons.join(", ") }] : [];

    setFacturarModal({
      open: true,
      step: "validation",
      packageIds: [pkg.id],
      validationResults: { valid, invalid },
      processingStatus: { current: 0, total: 0, message: "" },
      results: null,
      discountPercentage: 0,
      syncToFirebase: true,
      currency: "USD",
      paymentMethod: "",
      notes: "",
      dueDate: "",
      taxRate: 13,
    });
  };

  const handleSaveRequest = React.useCallback((
    packageId: string,
    field: string,
    newValue: string | number,
    oldValue: string | number,
  ) => {
    setConfirmDialog({
      open: true,
      packageId,
      field,
      newValue,
      oldValue,
    });
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteDialog.packageId || !onDelete) {
      return;
    }

    setUpdating(true);
    try {
      await onDelete(deleteDialog.packageId);
      toast({
        title: t("common.success"),
        description: t("packages.packageDeletedSuccess"),
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("packages.failedToDeletePackage"),
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
      setDeleteDialog({ open: false, packageId: null, trackingNumber: null });
    }
  };

  const handleCustomerSelection = async (pkgId: string, customer: AutocompleteCustomer) => {
    if (!pkgId || !customer) {
      return;
    }

    setUpdating(true);
    try {
      const currentPkg = packages.find(
        (p) => p.id === pkgId,
      );
      const updates: Record<string, any> = {
        customerName: customer.fullName.toUpperCase(),
        customerId: customer.id,
        slCode: customer.slCode || "", // Auto-assign SL account code
      };

      // Auto-populate destination if customer has country and package destination is CRC or empty
      if (
        customer.country &&
        (currentPkg?.destination === "CRC" || !currentPkg?.destination)
      ) {
        updates.destination = customer.country.toUpperCase();
      }

      if (onBulkUpdate) {
        await onBulkUpdate(pkgId, updates);
      } else {
        // Fallback to individual updates
        for (const [field, value] of Object.entries(updates)) {
          await onUpdate(pkgId, field, value);
        }
      }

      toast({
        title: t("common.success"),
        description: t("packages.customerLinkedSuccess"),
      });
      
      setCustomerEditModal({
        open: false,
        packageId: null,
        currentCustomerId: null,
        currentCustomerName: null,
        currentslCode: null,
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("packages.failedToUpdateCustomer"),
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmSave = async () => {
    if (
      !confirmDialog.packageId ||
      !confirmDialog.field ||
      confirmDialog.newValue === null
    ) {
      return;
    }

    setUpdating(true);
    try {
      // Special handling for destination field - also send routeId
      if (confirmDialog.field === "destination" && onBulkUpdate) {
        const selectedRoute = routes.find(
          (r: any) =>
            r.name.toUpperCase() ===
            String(confirmDialog.newValue).toUpperCase(),
        );
        await onBulkUpdate(confirmDialog.packageId, {
          destination: confirmDialog.newValue,
          routeId: selectedRoute?.id || null,
        });
      } else {
        await onUpdate(
          confirmDialog.packageId,
          confirmDialog.field,
          confirmDialog.newValue,
        );
      }
      // SP2 sync for individual eligible status changes (fire-and-forget)
      if (
        confirmDialog.field === "status" &&
        typeof confirmDialog.newValue === "string" &&
        SYNC_ELIGIBLE_STATUSES.has(confirmDialog.newValue)
      ) {
        const pkg = packages.find((p) => p.id === confirmDialog.packageId);
        if (pkg) {
          const sp2Pkg = {
            id: pkg.id,
            trackingNumber: pkg.trackingNumber || (pkg as any).tracking || "",
            slCode: (pkg as any).slCode || "",
            customerName: (pkg as any).customerName || "",
            status: confirmDialog.newValue as string,
            weight: pkg.weight,
            description: (pkg as any).description,
            ruta: (pkg as any).ruta || pkg.route?.name || "",
            calculatedCost: pkg.calculatedCost,
            currency: (pkg as any).currency || "USD",
          };
          syncPackagesToSmartWeb([
            {
              ...sp2Pkg,
              ...(FORCE_SYNC_STATUSES.has(confirmDialog.newValue as string)
                ? { forceSync: true }
                : {}),
            },
          ])
            .then(() => {
              const syncedAt = new Date().toISOString();
              return firestoreApi.packages.update(pkg.id, {
                smartwebSynced: true,
                smartwebSyncedAt: syncedAt,
                smartwebSyncSource: "package",
              } as any);
            })
            .catch((err) => console.warn("[pkg-inline-sync]", err));
        }
      }
      toast({
        title: t("common.success"),
        description: t("packages.updated"),
      });
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || t("packages.failedToUpdate"),
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
      setConfirmDialog({
        open: false,
        packageId: null,
        field: null,
        newValue: null,
        oldValue: null,
      });
    }
  };

  const getFieldLabel = (field: string): string => {
    const fieldLabels: Record<string, string> = {
      customerName: t("packages.customer"),
      weight: t("packages.weightKg"),
      status: t("packages.status"),
      calculatedCost: t("packages.cost"),
      destination: t("packages.destination"),
      type: t("packages.type"),
      flagStatus: t("packages.flag"),
    };
    return fieldLabels[field] || field;
  };

  // Helper to translate field values (especially status values)
  const getTranslatedValue = (field: string, value: any): string => {
    if (field === "status" && value) {
      // Translate status values
      const statusKey = `packages.statuses.${value}`;
      const translated = t(statusKey);
      // If translation exists (not same as key), return it
      return translated !== statusKey ? translated : String(value);
    }
    if (field === "flagStatus" && value) {
      // Translate flag values
      const flagKey = `packages.flags.${value === "requires_documents" ? "requiresDocuments" : value === "stuck_in_customs" ? "stuckInCustoms" : value === "clear_to_proceed" ? "clearToProceed" : value}`;
      const translated = t(flagKey);
      return translated !== flagKey ? translated : String(value);
    }
    if (field === "type" && value) {
      // Translate type values
      const typeKey = `packages.types.${value}`;
      const translated = t(typeKey);
      return translated !== typeKey ? translated : String(value);
    }
    return String(value);
  };

  const memoizedStatusOptions = React.useMemo(() => getStatusOptions(t), [t]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="flex items-center gap-1.5 hover:text-foreground text-left w-full h-full justify-between font-semibold group/header text-xs text-muted-foreground transition-colors"
      >
        <span>{label}</span>
        <span className="shrink-0 text-muted-foreground/60 group-hover/header:text-foreground transition-colors">
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5 text-primary animate-in fade-in zoom-in-75 duration-250" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-primary animate-in fade-in zoom-in-75 duration-250" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 hover:opacity-100 transition-opacity" />
          )}
        </span>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full border border-border rounded-xl overflow-hidden bg-background">
        <div className="min-w-[950px] lg:min-w-[1200px] flex flex-col">
          {/* Spreadsheet Header Row */}
          <div
            className="grid w-full bg-background border-b border-border sticky top-0 z-20 shadow-sm text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ gridTemplateColumns: packagesGridTemplateCols }}
          >
            <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9">
              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9 text-xs font-semibold">
              Det.
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              {t("packages.trackingNumber")}
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Manifiesto
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              SmartID / Cliente
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Factura
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Ruta
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Peso
            </div>
            <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
              Estado
            </div>
            <div className="px-3 py-2 border-border bg-muted/50 h-9 flex items-center justify-center">
              Sync
            </div>
          </div>

          {/* Render 12 Skeleton Rows */}
          {Array.from({ length: 12 }).map((_, idx) => (
            <div
              key={idx}
              className="grid w-full h-10 items-center text-xs border-b border-border"
              style={{ gridTemplateColumns: packagesGridTemplateCols }}
            >
              <div className="border-r border-border h-full flex items-center justify-center bg-muted/10">
                <div className="h-3.5 w-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="border-r border-border h-full flex items-center justify-center bg-muted/10">
                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3.5 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-3 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="px-3 border-r border-border h-full flex items-center">
                <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="px-3 h-full flex items-center justify-center">
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        {t("packages.noPackages")}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* Bulk Selection Floating Bar */}
      <AnimatePresence>
        {selectedRows.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95vw] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              className="pointer-events-auto w-full max-w-full"
            >
              <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-900 border border-gray-800 shadow-2xl rounded-xl overflow-x-auto scrollbar-none select-none text-white w-full max-w-full">
                {/* Status Indicator */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex h-5 items-center justify-center rounded-full bg-white/15 px-2.5 text-[11px] font-bold text-white">
                    {selectedRows.size}
                  </div>
                  <span className="text-[11px] font-semibold text-gray-300 hidden sm:inline">
                    {selectedRows.size === 1
                      ? t("packages.packageSelected")
                      : t("packages.packagesSelected")}
                  </span>
                </div>

                <div className="h-4 w-px bg-gray-700/60 shrink-0" />

                <div className="flex items-center gap-1.5 shrink-0">
                  <PermissionTooltip allowed={canManage("packages")}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {isOrphansMode ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSyncOrphansSmartWebOpen(true)}
                            disabled={updating}
                            className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 shrink-0"
                          >
                            <Wifi className="h-3.5 w-3.5" />
                            <span className="hidden lg:inline">Sincronizar Huérfanos</span>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSyncSmartWebOpen(true)}
                            disabled={updating}
                            className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 shrink-0"
                          >
                            <Wifi className="h-3.5 w-3.5" />
                            <span className="hidden lg:inline">Sync SmartWeb</span>
                          </Button>
                        )}
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-gray-800 text-white border-gray-700"
                      >
                        <p>
                          Sincronizar {selectedRows.size} paquete
                          {selectedRows.size !== 1 ? "s" : ""} con SmartWeb
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </PermissionTooltip>

                  <PermissionTooltip allowed={canManage("packages")}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleOpenRepriceModal}
                          disabled={updating || repriceModal.applying}
                          className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 shrink-0"
                        >
                          <Calculator className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Precio</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-gray-800 text-white border-gray-700"
                      >
                        <p>
                          Re-calcular precio de {selectedRows.size} paquete
                          {selectedRows.size !== 1 ? "s" : ""}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </PermissionTooltip>

                  {onBulkUpdate && (
                    <PermissionTooltip allowed={canUpdate("packages")}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMoveToTransitoriaDialog(true)}
                            disabled={updating || moveToTransitoriaMoving}
                            className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 shrink-0"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                            <span className="hidden lg:inline">Mover a Consolidación</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-gray-800 text-white border-gray-700"
                        >
                          <p>
                            Mover {selectedRows.size} paquete
                            {selectedRows.size !== 1 ? "s" : ""} a Consolidación
                            Transitoria
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </PermissionTooltip>
                  )}

                  <PermissionTooltip allowed={canUpdate("packages")}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBulkActionsModal(true)}
                          className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-white hover:bg-white/10 hover:text-white shrink-0"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">{t("packages.shortUpdate")}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-gray-800 text-white border-gray-700"
                      >
                        <p>{t("packages.bulkUpdate")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </PermissionTooltip>

                  {onDelete && (
                    <PermissionTooltip allowed={canDelete("packages")}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBulkDeleteDialog(true)}
                            disabled={updating || bulkDeleting}
                            className="h-8 rounded-lg text-xs px-3 font-medium gap-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">Eliminar</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-gray-800 text-white border-gray-700"
                        >
                          <p>
                            Eliminar {selectedRows.size} paquete
                            {selectedRows.size !== 1 ? "s" : ""}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </PermissionTooltip>
                  )}
                </div>

                <div className="h-4 w-px bg-gray-700/60 shrink-0" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedRows(new Set())}
                      className="h-7 w-7 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="bg-gray-800 text-white border-gray-700"
                  >
                    <p>{t("packages.clearSelection")}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

            {/* Responsive table container with sticky header */}
      <div
        className="flex flex-col flex-1 min-h-0 bg-background border border-border rounded-xl overflow-hidden shadow-sm"
        data-testid="packages-table-container"
        role="region"
        aria-label={t("packages.accessibility.packageTable")}
      >
        {/* Scrollable grid container - attached to parentRef */}
        <div
          ref={parentRef}
          className="flex-1 overflow-auto bg-background relative max-h-[calc(100vh-350px)] min-h-[300px]"
          tabIndex={0}
        >
          {/* Virtual scroll viewport wrapper - min-w guarantees layout holds horizontally */}
          <div className="min-w-[950px] lg:min-w-[1200px] flex flex-col pb-4">
            
            {/* Spreadsheet Header Row */}
            <div
              className="grid w-full bg-background border-b border-border sticky top-0 z-20 shadow-sm text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              style={{ gridTemplateColumns: packagesGridTemplateCols }}
            >
              <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9">
                <input
                  type="checkbox"
                  checked={
                    currentPackages.length > 0 &&
                    currentPackages.every((pkg) => selectedRows.has(pkg.id))
                  }
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-400 text-gray-900 focus:ring-gray-500 focus:ring-offset-0 cursor-pointer"
                  data-testid="select-all-checkbox"
                  aria-label={t("packages.selectAll")}
                  title={t("packages.selectAll")}
                />
              </div>
              <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80 h-9 text-xs font-semibold">
                Det.
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader(t("packages.trackingNumber"), "trackingNumber")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Manifiesto", "manifestNumber")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("SmartID / Cliente", "customerName")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Factura", "invoice")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Ruta", "route")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Peso", "weight")}
              </div>
              <div className="px-3 py-2 border-r border-border bg-muted/50 h-9 flex items-center">
                {renderSortHeader("Estado", "status")}
              </div>
              <div className="px-3 py-2 border-border bg-muted/50 h-9 flex items-center justify-center">
                Sync
              </div>
            </div>

            {/* Cross-page select-all banner if any selection */}
            {(() => {
              const allPageSelected =
                currentPackages.length > 0 &&
                currentPackages.every((pkg) => selectedRows.has(pkg.id));
              const hasMorePages = packages.length > currentPackages.length;
              if (!allAcrossPagesSelected && (!allPageSelected || !hasMorePages)) return null;
              return (
                <div className="w-full bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 py-1.5 text-center text-xs">
                  {allAcrossPagesSelected ? (
                    <span className="text-blue-800 dark:text-blue-200">
                      Todos los <strong>{packages.length}</strong> paquetes están seleccionados.{" "}
                      <button
                        type="button"
                        onClick={clearAllSelection}
                        className="underline font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                      >
                        Limpiar selección
                      </button>
                    </span>
                  ) : hasMorePages ? (
                    <span className="text-blue-800 dark:text-blue-200">
                      Los <strong>{currentPackages.length}</strong> paquetes de esta página están seleccionados.{" "}
                      <button
                        type="button"
                        onClick={selectAllAcrossPages}
                        className="underline font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                      >
                        Seleccionar los {packages.length} paquetes
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })()}

            {/* Virtualized Rows Container */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const pkg = currentPackages[virtualRow.index];
                if (!pkg) return null;
                return (
                  <PackagesSpreadsheetRow
                    key={pkg.id}
                    pkg={pkg}
                    virtualRow={virtualRow}
                    isSelected={selectedRows.has(pkg.id)}
                    customerMap={customerMap}
                    onToggleSelection={toggleRowSelection}
                    onShowDetails={setDetailsPackageId}
                    onCopyTracking={copyToClipboard}
                    onSaveField={handleSaveRequest}
                    routes={routes}
                    canUpdate={canUpdate}
                    canManage={canManage}
                    statusOptions={memoizedStatusOptions}
                    statusColors={STATUS_COLORS}
                    syncingPkgId={syncingPkgId}
                    onForceSync={handleForceSyncRow}
                    onReassignCustomer={handleReassignCustomerClick}
                    manifests={manifestsForBulk}
                    t={t}
                    pkgInvoices={invoiceCache[pkg.id]}
                    onOpenInvoicesModal={handleOpenInvoicesModal}
                    onDelete={(id, tracking) => setDeleteDialog({ open: true, packageId: id, trackingNumber: tracking })}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          !updating && setDeleteDialog({ ...deleteDialog, open })
        }
      >
        <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-md w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border shadow-lg">
          <DialogHeader className="shrink-0 pb-4 border-b">
            <DialogTitle className="text-lg font-bold">{t("packages.deletePackageTitle")}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {t("packages.deletePackageConfirmation")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 py-4 space-y-3">
            <div className="flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 rounded">
              <div>
                <div className="text-sm font-medium text-gray-700">
                  {t("packages.trackingNumber")}:
                </div>
                <div className="text-lg font-bold text-red-900">
                  {deleteDialog.trackingNumber}
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600 px-4">
              {t("packages.deletePackagePermanent")}
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t border-border mt-auto">
            <Button
              variant="outline"
              onClick={() =>
                setDeleteDialog({
                  open: false,
                  packageId: null,
                  trackingNumber: null,
                })
              }
              disabled={updating}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={updating}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("packages.deletePackageButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-calcular Precio Modal */}
      <Dialog
        open={repriceModal.open}
        onOpenChange={(open) => {
          if (!repriceModal.applying)
            setRepriceModal((prev) => ({ ...prev, open }));
        }}
      >
        <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-3xl w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border shadow-lg">
          <DialogHeader className="shrink-0 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Calculator className="h-5 w-5 text-amber-600" />
              Re-calcular precios
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Precios recalculados para {repriceModal.previews.length} paquete
              {repriceModal.previews.length !== 1 ? "s" : ""} seleccionado
              {repriceModal.previews.length !== 1 ? "s" : ""}. Revisa los
              cambios antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Controls row: pricing type + exchange rate */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Pricing type selector */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Ruta de precios
                </label>
                <select
                  value={repricePricingType}
                  onChange={(e) => setRepricePricingType(e.target.value)}
                  disabled={repriceModal.applying}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-amber-500 focus:border-amber-500"
                >
                  {Object.entries(PRICING_RULES).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Exchange rate */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Tipo de cambio
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-500">₡</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={repriceExchangeRate}
                    onChange={(e) =>
                      setRepriceExchangeRate(
                        Math.max(1, Number(e.target.value) || 500),
                      )
                    }
                    className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-amber-500 focus:border-amber-500"
                  />
                  <span className="text-sm text-gray-400">/USD</span>
                </div>
              </div>
            </div>

            {/* Pricing rules panel */}
            {PRICING_RULES[repricePricingType] && (
              <div className="flex items-start gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <Calculator className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs font-semibold text-amber-800">
                    {PRICING_RULES[repricePricingType].label} — reglas:{" "}
                  </span>
                  <span className="text-xs text-amber-700">
                    {PRICING_RULES[repricePricingType].rules}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm">
                <Calculator className="h-4 w-4 text-amber-600" />
                <span className="text-amber-900 font-medium">
                  {repriceModal.previews.filter((p) => p.changed).length} cambio
                  {repriceModal.previews.filter((p) => p.changed).length !== 1
                    ? "s"
                    : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <span className="text-blue-900 font-medium">
                  $
                  {repriceModal.previews
                    .reduce((s, p) => s + (p.quoteRequired ? 0 : p.newCost), 0)
                    .toFixed(2)}
                </span>
                <span className="text-blue-600 text-xs">
                  / ₡
                  {Math.round(
                    repriceModal.previews.reduce(
                      (s, p) => s + (p.quoteRequired ? 0 : p.newCost),
                      0,
                    ) * repriceExchangeRate,
                  ).toLocaleString()}
                </span>
              </div>
              {repriceModal.previews.some((p) => p.quoteRequired) && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-orange-900">
                    {
                      repriceModal.previews.filter((p) => p.quoteRequired)
                        .length
                    }{" "}
                    requieren cotización
                  </span>
                </div>
              )}
            </div>

            {/* Package price preview table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">
                      Tracking
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">
                      Cliente
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">
                      Peso (kg)
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">
                      Actual
                    </th>
                    <th className="text-center px-2 py-2" />
                    <th className="text-right px-3 py-2 font-medium text-gray-700">
                      Nuevo USD
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">
                      CRC
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {repriceModal.previews.map(
                    ({
                      pkg,
                      currentCost,
                      newCost,
                      quoteRequired,
                      breakdown,
                      changed,
                    }) => (
                      <tr
                        key={pkg.id}
                        className={cn(
                          "transition-colors",
                          changed ? "bg-amber-50/40" : "bg-white",
                        )}
                      >
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-gray-700 truncate block max-w-[120px]">
                            {pkg.trackingNumber}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs text-gray-800 truncate max-w-[140px]">
                            {pkg.customerName?.toUpperCase()}
                          </div>
                          {pkg.slCode && (
                            <div className="text-[10px] text-gray-400">
                              {pkg.slCode}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {(pkg.weight ?? 0).toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={cn(
                              "font-mono text-xs",
                              changed
                                ? "text-gray-400 line-through"
                                : "text-gray-700",
                            )}
                          >
                            {currentCost != null
                              ? `$${currentCost.toFixed(2)}`
                              : "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {changed && (
                            <ArrowRight className="h-3 w-3 text-amber-500 mx-auto" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {quoteRequired ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
                              Cotizar
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "font-mono text-xs font-semibold",
                                changed ? "text-amber-700" : "text-gray-700",
                              )}
                            >
                              ${newCost.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!quoteRequired && (
                            <span
                              className={cn(
                                "font-mono text-xs",
                                changed ? "text-amber-600" : "text-gray-400",
                              )}
                            >
                              ₡
                              {Math.round(
                                newCost * repriceExchangeRate,
                              ).toLocaleString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t border-border mt-auto">
            <Button
              variant="outline"
              onClick={() =>
                setRepriceModal({ open: false, applying: false, previews: [] })
              }
              disabled={repriceModal.applying}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReprice}
              disabled={
                repriceModal.applying || repriceModal.previews.length === 0
              }
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {repriceModal.applying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Aplicando...
                </>
              ) : (
                <>
                  Confirmar {repriceModal.previews.length} precio
                  {repriceModal.previews.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkPackagesUpdateModal
        isOpen={bulkActionsModal}
        onClose={() => setBulkActionsModal(false)}
        selectedPackages={packages.filter((pkg) => selectedRows.has(pkg.id))}
        routes={routes}
        manifestsForBulk={manifestsForBulk}
        onConfirm={handleConfirmBulkUpdate}
        updating={updating}
        t={t}
      />

      {/* Manifest Invoice Wizard */}
      <Dialog
        open={manifestWizard.open}
        onOpenChange={(open) => {
          if (
            !open &&
            !updating &&
            manifestWizard.step === "invoice_decision"
          ) {
            setManifestWizard((prev) => ({ ...prev, open: false }));
          }
        }}
      >
        <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-xl w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border shadow-lg">
          <DialogHeader className="shrink-0 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              {manifestWizard.step === "checking" && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span>Verificando facturas asociadas…</span>
                </>
              )}
              {manifestWizard.step === "invoice_decision" && (
                <>
                  <FileText className="h-5 w-5 text-amber-500" />
                  <span>Factura activa encontrada</span>
                  {manifestWizard.invoiceQueue.length > 1 && (
                    <span className="ml-1 text-sm font-normal text-gray-400">
                      ({manifestWizard.currentIdx + 1} de{" "}
                      {manifestWizard.invoiceQueue.length})
                    </span>
                  )}
                </>
              )}
              {manifestWizard.step === "executing" && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                  <span>Aplicando cambios…</span>
                </>
              )}
            </DialogTitle>
            {manifestWizard.step === "invoice_decision" && (
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Los paquetes seleccionados pertenecen a una factura activa.
                Indica cómo deseas proceder antes de mover al manifiesto{" "}
                <strong>{manifestWizard.newManifest}</strong>.
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 py-4">

          {/* Checking */}
          {manifestWizard.step === "checking" && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
              <p className="text-sm text-gray-500">
                Consultando facturas vinculadas a los paquetes seleccionados…
              </p>
            </div>
          )}

          {/* Executing */}
          {manifestWizard.step === "executing" && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-green-400" />
              <p className="text-sm text-gray-500">
                Aplicando cambios al manifiesto y actualizando facturas…
              </p>
            </div>
          )}

          {/* Invoice decision */}
          {manifestWizard.step === "invoice_decision" &&
            (() => {
              const item =
                manifestWizard.invoiceQueue[manifestWizard.currentIdx];
              if (!item) return null;
              const inv = item.invoice;
              const invNumber =
                (inv.invoiceNumber as string) ||
                (inv.number as string) ||
                `#${item.invoiceId.slice(-6)}`;
              const invStatus = (inv.status as string) || "pending";
              const invTotal = inv.total
                ? `$${Number(inv.total).toFixed(2)}`
                : "—";
              const invClient =
                (inv.clientName as string) ||
                (inv.customerName as string) ||
                "—";
              const invSlCode =
                (inv.slCode as string) || (inv.clientSlCode as string) || "";
              return (
                <div className="space-y-4 py-2">
                  {/* Invoice card */}
                  <div className="border border-amber-200 rounded-lg bg-amber-50/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">
                          {invNumber}
                        </div>
                        <div className="text-sm text-gray-600 mt-0.5 truncate">
                          {invClient}
                        </div>
                        {invSlCode && (
                          <span className="text-[10px] font-mono bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded mt-1 inline-block">
                            {invSlCode}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {invTotal}
                        </div>
                        <Badge className="mt-1 text-[10px] capitalize">
                          {invStatus}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      {item.totalItems} ítem{item.totalItems !== 1 ? "s" : ""}{" "}
                      en esta factura
                    </div>
                  </div>

                  {/* Matched packages */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Paquete{item.matchedPkgs.length !== 1 ? "s" : ""}{" "}
                      seleccionado{item.matchedPkgs.length !== 1 ? "s" : ""} (
                      {item.matchedPkgs.length})
                    </p>
                    <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-24 overflow-y-auto">
                      {item.matchedPkgs.map((pkg) => (
                        <div
                          key={pkg.id}
                          className="flex items-center justify-between px-3 py-1.5 text-xs"
                        >
                          <span className="font-mono text-gray-700 truncate">
                            {pkg.trackingNumber}
                          </span>
                          <span className="text-gray-400 shrink-0 ml-2">
                            {(pkg.weight ?? 0).toFixed(2)} kg
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Destination indicator */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    Mover a manifiesto{" "}
                    <strong className="text-gray-800 ml-1">
                      {manifestWizard.newManifest}
                    </strong>
                  </div>

                  {/* Decision buttons */}
                  <div className="space-y-2 pt-1">
                    <p className="text-sm font-medium text-gray-700">
                      ¿Qué deseas hacer con esta factura?
                    </p>

                    <button
                      type="button"
                      onClick={() => handleManifestWizardDecide("annul")}
                      disabled={updating}
                      className="w-full flex items-start gap-3 px-4 py-3 border-2 border-red-200 hover:border-red-400 hover:bg-red-50/50 rounded-lg transition-colors text-left disabled:opacity-50"
                    >
                      <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-red-400 flex items-center justify-center">
                        <X className="h-3 w-3 text-red-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-red-700">
                          Anular esta factura
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          La factura quedará marcada como anulada. Se moverán
                          los paquetes seleccionados.
                        </div>
                      </div>
                    </button>

                    {item.hasMultipleItems && (
                      <button
                        type="button"
                        onClick={() => handleManifestWizardDecide("move_all")}
                        disabled={updating}
                        className="w-full flex items-start gap-3 px-4 py-3 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg transition-colors text-left disabled:opacity-50"
                      >
                        <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center">
                          <PackageIcon className="h-3 w-3 text-blue-500" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-blue-700">
                            Mover TODOS los paquetes de la factura
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Los {item.totalItems} paquetes de la factura se
                            moverán al nuevo manifiesto. La factura se mantiene.
                          </div>
                        </div>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleManifestWizardDecide("move_selected_only")
                      }
                      disabled={updating}
                      className="w-full flex items-start gap-3 px-4 py-3 border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50/50 rounded-lg transition-colors text-left disabled:opacity-50"
                    >
                      <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-gray-400 flex items-center justify-center">
                        <Check className="h-3 w-3 text-gray-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-700">
                          Solo mover{" "}
                          {item.matchedPkgs.length === 1
                            ? "este paquete"
                            : `estos ${item.matchedPkgs.length} paquetes`}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.hasMultipleItems
                            ? "La factura se mantiene con sus otros ítems. Solo se actualiza el manifiesto del paquete seleccionado."
                            : "La factura se mantiene tal cual. Solo se actualiza el manifiesto del paquete."}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {manifestWizard.step === "invoice_decision" && (
            <DialogFooter className="shrink-0 pt-4 border-t border-border mt-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setManifestWizard((prev) => ({ ...prev, open: false }))
                }
                disabled={updating}
              >
                Cancelar operación
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Facturar (Invoice) Modal */}
      <Dialog
        open={facturarModal.open}
        onOpenChange={(open) =>
          !updating && (open ? null : handleCloseFacturarModal())
        }
      >
        <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-3xl w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border shadow-lg">
          <DialogHeader className="shrink-0 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FileText className="h-5 w-5 text-green-600" />
              {t("packages.facturar.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {facturarModal.step === "validation" &&
                t("packages.facturar.validationDescription")}
              {facturarModal.step === "processing" &&
                t("packages.facturar.processingDescription")}
              {facturarModal.step === "results" &&
                t("packages.facturar.resultsDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 py-4">

          {/* Validation Step */}
          {facturarModal.step === "validation" && (
            <div className="space-y-4 py-4">
              {/* Summary - Compact */}
              <div className="flex gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-900">
                    {t("packages.facturar.validPackages")}
                  </span>
                  <span className="text-lg font-bold text-green-700">
                    {facturarModal.validationResults.valid.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-900">
                    {t("packages.facturar.invalidPackages")}
                  </span>
                  <span className="text-lg font-bold text-red-700">
                    {facturarModal.validationResults.invalid.length}
                  </span>
                </div>
              </div>

              {/* Invalid packages list */}
              {facturarModal.validationResults.invalid.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                    <span className="font-medium text-red-900">
                      {t("packages.facturar.packagesWithIssues")}
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {facturarModal.validationResults.invalid.map(
                      ({ pkg, reason }) => (
                        <div
                          key={pkg.id}
                          className="px-4 py-2 border-b border-red-100 last:border-0 flex justify-between items-start"
                        >
                          <div>
                            <div className="font-medium text-gray-900">
                              {pkg.trackingNumber}
                            </div>
                            <div className="text-sm text-gray-600">
                              {pkg.customerName?.toUpperCase()}
                            </div>
                          </div>
                          <div className="text-sm text-red-600 text-right max-w-[200px]">
                            {reason}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* Valid packages — detailed confirmation table */}
              {facturarModal.validationResults.valid.length > 0 && (
                <div className="border border-green-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-green-50 border-b border-green-200">
                    <div className="flex items-center gap-2">
                      <PackageIcon className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-900">
                        {facturarModal.validationResults.valid.length}{" "}
                        {facturarModal.validationResults.valid.length === 1
                          ? "paquete listo para facturar"
                          : "paquetes listos para facturar"}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-green-700">
                      Total: $
                      {facturarModal.validationResults.valid
                        .reduce(
                          (sum, pkg) => sum + (Number(pkg.calculatedCost) || 0),
                          0,
                        )
                        .toFixed(2)}{" "}
                      USD
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">
                            Tracking
                          </th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">
                            Cliente
                          </th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                            Ruta
                          </th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">
                            Peso
                          </th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">
                            Precio USD
                          </th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                            CRC
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {facturarModal.validationResults.valid.map((pkg) => (
                          <tr
                            key={pkg.id}
                            className="hover:bg-green-50/40 transition-colors"
                          >
                            <td className="px-3 py-2">
                              <span className="font-mono text-gray-800 truncate block max-w-[130px]">
                                {pkg.trackingNumber}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900 truncate max-w-[130px]">
                                {pkg.customerName?.toUpperCase()}
                              </div>
                              {((pkg as any).slCode ||
                                pkg.customer?.slCode) && (
                                <div className="text-[10px] text-gray-400">
                                  {(pkg as any).slCode || pkg.customer?.slCode}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 hidden sm:table-cell">
                              {(pkg as any).ruta || pkg.destination ? (
                                <Badge
                                  className={cn(
                                    "text-[10px] font-medium",
                                    getRouteColors(
                                      (pkg as any).ruta ||
                                        pkg.destination ||
                                        "",
                                    ).bg,
                                    getRouteColors(
                                      (pkg as any).ruta ||
                                        pkg.destination ||
                                        "",
                                    ).text,
                                  )}
                                >
                                  {(pkg as any).ruta || pkg.destination}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700 font-mono">
                              {(pkg.weight ?? 0).toFixed(3)} kg
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-green-700">
                              ${(Number(pkg.calculatedCost) || 0).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500 hidden md:table-cell">
                              {(pkg as any).costCRC
                                ? `₡${Number((pkg as any).costCRC).toLocaleString("es-CR")}`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invoice Options */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h4 className="font-medium text-gray-900">
                  {t("packages.facturar.invoiceOptions")}
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Currency - Compact Radio Selection */}
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {t("packages.facturar.currency")}
                    </Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFacturarModal((prev) => ({
                            ...prev,
                            currency: "USD",
                          }))
                        }
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                          facturarModal.currency === "USD"
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        <span>$</span>
                        <span>USD</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFacturarModal((prev) => ({
                            ...prev,
                            currency: "CRC",
                          }))
                        }
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                          facturarModal.currency === "CRC"
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        <span>₡</span>
                        <span>CRC</span>
                      </button>
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1">
                    <Label
                      htmlFor="paymentMethod"
                      className="text-sm font-medium"
                    >
                      {t("packages.facturar.paymentMethod")}
                    </Label>
                    <select
                      id="paymentMethod"
                      value={facturarModal.paymentMethod}
                      onChange={(e) =>
                        setFacturarModal((prev) => ({
                          ...prev,
                          paymentMethod: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="">
                        {t("packages.facturar.selectPaymentMethod")}
                      </option>
                      <option value="cash">
                        {t("packages.facturar.paymentMethods.cash")}
                      </option>
                      <option value="transfer">
                        {t("packages.facturar.paymentMethods.transfer")}
                      </option>
                      <option value="card">
                        {t("packages.facturar.paymentMethods.card")}
                      </option>
                      <option value="sinpe">
                        {t("packages.facturar.paymentMethods.sinpe")}
                      </option>
                      <option value="credit">
                        {t("packages.facturar.paymentMethods.credit")}
                      </option>
                    </select>
                  </div>

                  {/* Discount Percentage */}
                  <div className="space-y-1">
                    <Label
                      htmlFor="discountPercentage"
                      className="text-sm font-medium"
                    >
                      {t("packages.facturar.discountPercentage")}
                    </Label>
                    <input
                      id="discountPercentage"
                      type="number"
                      min="0"
                      max="100"
                      value={facturarModal.discountPercentage}
                      onChange={(e) =>
                        setFacturarModal((prev) => ({
                          ...prev,
                          discountPercentage: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  {/* Tax Rate */}
                  <div className="space-y-1">
                    <Label htmlFor="taxRate" className="text-sm font-medium">
                      {t("packages.facturar.taxRate")}
                    </Label>
                    <input
                      id="taxRate"
                      type="number"
                      min="0"
                      max="100"
                      value={facturarModal.taxRate}
                      onChange={(e) =>
                        setFacturarModal((prev) => ({
                          ...prev,
                          taxRate: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  {/* Sync to Firebase Toggle */}
                  <div className="flex items-center justify-between col-span-2 pt-2">
                    <Label
                      htmlFor="syncToFirebase"
                      className="text-sm font-medium"
                    >
                      {t("packages.facturar.syncToFirebase")}
                    </Label>
                    <input
                      id="syncToFirebase"
                      type="checkbox"
                      checked={facturarModal.syncToFirebase}
                      onChange={(e) =>
                        setFacturarModal((prev) => ({
                          ...prev,
                          syncToFirebase: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-sm font-medium">
                    {t("packages.facturar.notes")}
                  </Label>
                  <textarea
                    id="notes"
                    value={facturarModal.notes}
                    onChange={(e) =>
                      setFacturarModal((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder={t("packages.facturar.notesPlaceholder")}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Processing Step */}
          {facturarModal.step === "processing" && (
            <div className="py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-green-600" />
              <div className="text-lg font-medium text-gray-900 mb-2">
                {facturarModal.processingStatus.message}
              </div>
              <div className="text-sm text-gray-600">
                {t("packages.facturar.processing.pleaseWait")}
              </div>
            </div>
          )}

          {/* Results Step */}
          {facturarModal.step === "results" && facturarModal.results && (
            <div className="space-y-4 py-4">
              {/* Summary */}
              <div
                className={cn(
                  "p-4 rounded-lg border",
                  facturarModal.results.success
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  {facturarModal.results.success ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  )}
                  <span
                    className={cn(
                      "font-medium text-lg",
                      facturarModal.results.success
                        ? "text-green-900"
                        : "text-red-900",
                    )}
                  >
                    {facturarModal.results.success
                      ? t("packages.facturar.results.success")
                      : t("packages.facturar.results.partialSuccess")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="text-sm text-gray-600">
                      {t("packages.facturar.results.created")}
                    </div>
                    <div className="text-xl font-bold text-green-700">
                      {facturarModal.results.created}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">
                      {t("packages.facturar.results.failed")}
                    </div>
                    <div className="text-xl font-bold text-red-700">
                      {facturarModal.results.failed}
                    </div>
                  </div>
                </div>
              </div>

              {/* Compact Summary - Scalable for large batches */}
              {facturarModal.results.invoices.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-600" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {facturarModal.results.invoices.length}{" "}
                        {facturarModal.results.invoices.length === 1
                          ? "factura creada"
                          : "facturas creadas"}
                      </span>
                      <div className="text-xs text-gray-500">
                        {facturarModal.results.invoices.reduce(
                          (sum, inv) => sum + inv.packageCount,
                          0,
                        )}{" "}
                        paquetes procesados
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      Total: $
                      {facturarModal.results.invoices
                        .reduce((sum, inv) => sum + inv.total, 0)
                        .toFixed(2)}
                    </div>
                    {facturarModal.results.invoices.some(
                      (inv) => inv.firebaseSynced,
                    ) && (
                      <div className="text-xs text-green-600 flex items-center gap-1 justify-end">
                        <CheckCircle className="h-3 w-3" />
                        {
                          facturarModal.results.invoices.filter(
                            (inv) => inv.firebaseSynced,
                          ).length
                        }{" "}
                        sincronizadas
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Errors */}
              {facturarModal.results.errors.length > 0 && (
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                    <span className="font-medium text-red-900">
                      {t("packages.facturar.results.errors")}
                    </span>
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    {facturarModal.results.errors.map((error, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-2 border-b border-red-100 last:border-0 text-sm text-red-700"
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t border-border mt-auto">
            {facturarModal.step === "validation" && (
              <>
                <Button variant="outline" onClick={handleCloseFacturarModal}>
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleProcessFacturar}
                  disabled={
                    facturarModal.validationResults.valid.length === 0 ||
                    updating
                  }
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {t("packages.facturar.createInvoices", {
                    count: facturarModal.validationResults.valid.length,
                  })}
                </Button>
              </>
            )}
            {facturarModal.step === "processing" && (
              <Button variant="outline" disabled>
                {t("packages.facturar.processing.inProgress")}
              </Button>
            )}
            {facturarModal.step === "results" && (
              <Button
                onClick={handleCloseFacturarModal}
                className="bg-gray-900 text-white hover:bg-gray-800"
              >
                {t("common.close")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Save / Field Edit Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({
              open: false,
              packageId: null,
              field: null,
              oldValue: null,
              newValue: null,
            });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar modificación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas cambiar el campo{" "}
              <strong>{confirmDialog.field ? getFieldLabel(confirmDialog.field) : ""}</strong> de{" "}
              <strong>{confirmDialog.oldValue !== null ? getTranslatedValue(confirmDialog.field || "", confirmDialog.oldValue) : "vacío"}</strong> a{" "}
              <strong>{confirmDialog.newValue !== null ? getTranslatedValue(confirmDialog.field || "", confirmDialog.newValue) : "vacío"}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel disabled={updating}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSave}
              disabled={updating}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {updating ? "Guardando..." : "Confirmar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={bulkDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar{" "}
              <strong>{selectedRows.size}</strong> paquete
              {selectedRows.size !== 1 ? "s" : ""}? Esta acción no puede
              deshacerse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel disabled={bulkDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting
                ? "Eliminando..."
                : `Eliminar (${selectedRows.size})`}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to Consolidación Transitoria Confirmation Dialog */}
      <AlertDialog
        open={moveToTransitoriaDialog}
        onOpenChange={(open) => {
          if (!open) setMoveToTransitoriaDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover a Consolidación Transitoria</AlertDialogTitle>
            <AlertDialogDescription>
              Se moverán{" "}
              <strong>{selectedRows.size}</strong> paquete
              {selectedRows.size !== 1 ? "s" : ""} al manifiesto de
              Consolidación Transitoria. Esta acción actualiza el{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                manifestId
              </code>{" "}
              de cada paquete y los hará visibles en el flujo de
              consolidación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel disabled={moveToTransitoriaMoving}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMoveToConsolidacionTransitoria}
              disabled={moveToTransitoriaMoving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {moveToTransitoriaMoving
                ? "Moviendo..."
                : `Mover (${selectedRows.size})`}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {previewInvoice && (
        <NovaInvoicePreview
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
      <SyncSmartWebModal
        open={syncSmartWebOpen}
        forceSync={true}
        packages={packages
          .filter((pkg) => selectedRows.has(pkg.id))
          .map((pkg) => ({
            id: pkg.id,
            trackingNumber: pkg.trackingNumber,
            slCode: pkg.slCode || pkg.customer?.slCode || "",
            customerName: pkg.customerName,
            status: pkg.status,
            weight: pkg.weight,
            description:
              (pkg as any).description || (pkg as any).descripcion || "",
            origin: pkg.origin,
            destination: pkg.destination,
            ruta: (pkg as any).ruta || pkg.route?.name || "",
            manifestNumber:
              (pkg as any).manifestNumber || (pkg as any).manifestId || "",
            requiresPermit:
              (pkg as any).requiresPermit || (pkg as any).permisos || false,
            cost:
              pkg.calculatedCost ||
              (pkg as any).price ||
              (pkg as any).cost ||
              0,
            calculatedCost: pkg.calculatedCost,
            currency: (pkg as any).currency || "USD",
            allowCreate: true,
          }))}
        onClose={() => setSyncSmartWebOpen(false)}
      />
      <SyncOrphansSmartWebModal
        open={syncOrphansSmartWebOpen}
        packages={packages
          .filter((pkg) => selectedRows.has(pkg.id))
          .map((pkg) => ({
            id: pkg.id,
            trackingNumber: pkg.trackingNumber,
            slCode: pkg.slCode || pkg.customer?.slCode || "",
            customerName: pkg.customerName,
            status: pkg.status,
            weight: pkg.weight,
            description:
              (pkg as any).description || (pkg as any).descripcion || "",
            origin: pkg.origin,
            destination: pkg.destination,
            ruta: (pkg as any).ruta || pkg.route?.name || "",
            manifestNumber:
              (pkg as any).manifestNumber || (pkg as any).manifestId || "",
            requiresPermit:
              (pkg as any).requiresPermit || (pkg as any).permisos || false,
            cost:
              pkg.calculatedCost ||
              (pkg as any).price ||
              (pkg as any).cost ||
              0,
            calculatedCost: pkg.calculatedCost,
            currency: (pkg as any).currency || "USD",
          }))}
        onClose={() => setSyncOrphansSmartWebOpen(false)}
      />
      {/* Customer Selection Modal */}
      <ReassignCustomerModal
        open={customerEditModal.open}
        onClose={() => {
          setCustomerEditModal({
            open: false,
            packageId: null,
            currentCustomerId: null,
            currentCustomerName: null,
            currentslCode: null,
          });
        }}
        entityId={customerEditModal.packageId}
        entityType="package"
        currentCustomerId={customerEditModal.currentCustomerId}
        currentCustomerName={customerEditModal.currentCustomerName}
        currentslCode={customerEditModal.currentslCode}
        onSave={handleCustomerSelection}
        updating={updating}
      />

      <PackageDetailsModal
        packageId={detailsPackageId}
        open={!!detailsPackageId}
        onClose={() => setDetailsPackageId(null)}
        routes={routes}
        manifests={manifestsForBulk}
        canUpdate={canUpdate}
        statusOptions={getStatusOptions(t)}
        statusColors={STATUS_COLORS}
        onForceSync={handleForceSyncRow}
        syncingPkgId={syncingPkgId}
      />

      {/* Invoices List / Management Modal */}
      <PackageInvoicesModal
        open={invoicesModalOpen}
        onClose={() => setInvoicesModalOpen(false)}
        pkg={invoicesModalPackage}
        invoicesList={invoicesList}
        loading={loadingInvoicesList}
        updating={updating}
        onAnnulInvoice={handleAnnulInvoiceFromModal}
        onDeleteInvoice={handleDeleteInvoiceFromModal}
        onChangeInvoiceStatus={handleChangeInvoiceStatusFromModal}
        onSyncInvoice={handleSyncInvoiceFromModal}
        onRunAudit={handleRunAuditSp2}
        onRepairSp2={handleRepairSp2}
        auditResults={auditResults}
        loadingAudit={loadingAudit}
        repairing={repairing}
      />
    </TooltipProvider>
  );
}
