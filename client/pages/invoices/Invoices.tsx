import React, { useState, useMemo, useCallback, useRef, useEffect, Fragment, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/context/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { useSettings } from "@/lib/context/SettingsContext";
import { firebaseApi } from "@/lib/firebase/callable";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SkeletonDataTable } from "@/components/SkeletonLoaders";
import { useRouteOptions } from "@/components/nova/nova-route-options";
import { RoutePicker } from "@/components/invoices/RoutePicker";
import { NovaInvoicePreview, type SP1InvoiceShape } from "@/components/nova/NovaInvoicePreview";
import { NovaShippingLabelModal, type NovaShippingLabelData } from "@/components/nova/NovaShippingLabelModal";
import { EncomiendaBulkLabelModal } from "@/components/nova/EncomiendaBulkLabelModal";
import {
  Plus,
  FileText,
  Search,
  Eye,
  Mail,
  MessageSquare,
  Download,
  Trash2,
  Pencil,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  User,
  Package as PackageIcon,
  Send,
  CheckSquare,
  Square,
  MinusSquare,
  MousePointerClick,
  AlertTriangle,
  XCircle,
  Route,
  Layers,
  Scale,
  Weight,
  PlusCircle,
  MapPin,
  GitMerge,
  ArrowRightLeft,
  RotateCcw,
  RefreshCw,
  Globe2,
  Printer,
  UserCog,
  TrendingUp,
  Ship,
  Sparkles,
  FileEdit,
  Filter,
  MoreVertical,
  Info,
  Undo2,
} from "lucide-react";
import { buildRouteManifestHTML, type RouteManifestRow } from "@/lib/utils/nova-print";
import { SyncInvoicesModal } from "@/components/invoices/SyncInvoicesModal";
import type { InvoiceRecord } from "@/lib/services/invoice-service";
import { pushStatusToSp2, syncInvoicePackagesToSp2, syncInvoicesToSp2, previewSyncInvoices, deleteInvoiceFromSp2 } from "@/lib/services/sync-invoices-service";
import { syncPackagesToSmartWeb } from "@/lib/services/sync-smartweb-service";
import { firestoreApi, getInvoiceByTracking } from "@/lib/firebase/firestore-client";
import { buildInvoiceEmailPayload, sendTestInvoiceEmail, subscribeCustomersBySlCodes, getCustomersBySlCodes, safeFormatDate, type CustomerContactInfo } from "@/lib/services/invoice-service";
import { subscribeEncomiendas, type Encomienda } from "@/lib/services/encomienda-service";
import { addItemsToConsolidation, movePackagesBetweenManifestDocs, removeManyFromConsolidation, type ManifestConsolidationItem } from "@/lib/services/manifest-consolidation-service";
import { doc, getDoc, onSnapshot, collection, query, where, orderBy as fsOrderBy, getDocs, updateDoc, addDoc, deleteDoc, writeBatch, limit as fsLimit, arrayUnion, serverTimestamp, deleteField } from "firebase/firestore";
import { db, dbSP2 } from "@/lib/firebase/config";
import { logAction, type AuditAction } from "@/lib/services/audit-service";
import { useInvoicesCursor, useCreateInvoice, useDeleteInvoice, useCreateInvoiceCustomer, type LoadMoreAmount } from "@/lib/hooks/queries/useInvoices";
import { useCustomerSearch } from "@/lib/hooks/queries/useCustomers";

import { useToast } from "@/hooks/use-toast";
import { InvoiceCustomerForm } from "@/components/invoice/InvoiceCustomerForm";
import { ReassignCustomerModal } from "@/components/customer/ReassignCustomerModal";
import { ReassignManifestModal } from "@/components/invoice/ReassignManifestModal";

interface ReassignTarget {
  slCode: string;
  fullName: string;
  email?: string;
}
import { BulkUpdateTcModal, type BulkUpdateTcSelectionSummary } from "@/components/invoice/BulkUpdateTcModal";
import { BulkInvoicePaymentModal } from "./components/modals/BulkInvoicePaymentModal";
import { SyncVerifierModal } from "@/components/invoices/SyncVerifierModal";
import { InvoiceDetailPanel } from "@/components/invoices/InvoiceDetailPanel";
import { bulkUpdateInvoicesExchangeRate, recomputeInvoiceCRC } from "@/lib/services/update-exchange-rate-service";
import { parseInvoiceJQL } from "@/lib/utils/invoice-jql";
import { deleteTempCustomer } from "@/lib/services/temp-customers-service";
import { replaceInvoiceNumberPrefix, isTempSlCode, isOrphanSlCode, isOrphanInvoiceNumber, TEMP_WARNING_TITLE } from "@/lib/utils/invoice-reassign";
import { cn } from "@/lib/utils";
import { getRouteColor, ROUTE_COLORS } from "@/lib/utils/route-colors";
import { getCustomerServiceSuggestion } from "@/lib/services/encomienda-suggestions";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterBar } from "./components/filters/FilterBar";
import { EditInvoiceModal } from "./components/modals/EditInvoiceModal";

import { InvoiceConfirmationDialog } from "./components/modals/InvoiceConfirmationDialog";
import { getCustomerBySlCode } from "@/lib/services/matching";
import { ReassignResendPromptDialog, type ReassignResendPrompt } from "./components/modals/ReassignResendPromptDialog";
import { InvoicesDataTable } from "@/components/invoices/InvoicesDataTable";
import { BulkActionsBar } from "@/components/invoices/BulkActionsBar";
import { usePermissions } from "@/lib/hooks/usePermissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled" | "annulled" | "deleted";

type SortOrder = "none" | "name-asc" | "name-desc";

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  status: InvoiceStatus;
  subtotalAmount?: number;
  discountPercentage?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  currency: string;
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  emailSent?: boolean;
  emailSentAt?: string;
  lastResendMessageId?: string;
  emailResendIds?: string[];
  emailStatus?: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';
  emailStatusUpdatedAt?: string;
  emailStatusLogs?: Array<{
    status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';
    timestamp: string;
    emailId: string;
    metadata?: Record<string, any>;
  }>;
  emailSendLogs?: Array<{
    resendMessageId: string | null;
    sentTo: string;
    sentAt: string;
    sentBy: string;
    invoiceNumber?: string;
  }>;
  smsSent?: boolean;
  invoiceItems?: Array<{
    packageId?: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    weight?: number;
    realWeight?: number;
    trackingNumber?: string;
    isManual?: boolean;
    requiresPermit?: boolean;
  }>;
  customer?: Customer;
  clientName?: string;
  clientEmail?: string;
  slCode?: string;
  clientSlCode?: string;
  source?: 'nova' | 'manual' | 'maritime';
  manifestNumber?: string;
  clientPhone?: string;
  clientDni?: string;
  origin?: string;
  destination?: string;
  exchangeRate?: number;
  smartwebSynced?: boolean;
  smartwebSyncedAt?: string | null;
}

interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  slCode?: string;
  ruta?: string | null;
  dni?: string;
}

interface Package {
  id: string;
  trackingNumber: string;
  weight: number;
  origin: string;
  destination: string;
  calculatedCost?: number;
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

const InvoiceGeneration = memo(function InvoiceGeneration() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useLocale(['invoices', 'common']);
  const { invoiceSettings } = useSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDark = theme === "dark";
  const { canUpdate, canManage } = usePermissions();
  const dbRoutes = useRouteOptions();

  // Spreadsheet sort state
  const [sortField, setSortField] = useState<string>("invoiceNumber");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback((field: string) => {
    setSortDirection(prev => sortField === field ? (prev === "asc" ? "desc" : "asc") : "asc");
    setSortField(field);
  }, [sortField]);

  // Data load limit — matches Packages pattern
  const [dataLoadLimit, setDataLoadLimit] = useState<'last24hours' | 'last48hours' | 'last4days' | 3000 | 5000 | 10000>('last24hours');
  const [appliedDataLoadLimit, setAppliedDataLoadLimit] = useState<'last24hours' | 'last48hours' | 'last4days' | 3000 | 5000 | 10000>('last24hours');

  // Derive cursor options from appliedDataLoadLimit
  const cursorOptions = useMemo(() => {
    if (appliedDataLoadLimit === 'last24hours') {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return { initialLimit: 3000, dateFrom: from.toISOString() };
    }
    if (appliedDataLoadLimit === 'last48hours') {
      const from = new Date(Date.now() - 48 * 60 * 60 * 1000);
      return { initialLimit: 3000, dateFrom: from.toISOString() };
    }
    if (appliedDataLoadLimit === 'last4days') {
      const from = new Date();
      from.setDate(from.getDate() - 4);
      from.setHours(0, 0, 0, 0);
      return { initialLimit: 3000, dateFrom: from.toISOString() };
    }
    return { initialLimit: appliedDataLoadLimit };
  }, [appliedDataLoadLimit]);

  const [hasSearched, setHasSearched] = useState(false);
  const [isGeneralQueryActive, setIsGeneralQueryActive] = useState(false);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
  const [manifestFilter, setManifestFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [invoiceStatusFilters, setInvoiceStatusFilters] = useState<InvoiceStatus[]>([]);
  const [tempCustomerFilter, setTempCustomerFilter] = useState(false);

  const [appliedInvoiceSearchTerm, setAppliedInvoiceSearchTerm] = useState("");
  const [appliedManifestFilter, setAppliedManifestFilter] = useState("all");
  const [appliedRouteFilter, setAppliedRouteFilter] = useState("all");
  const [appliedInvoiceStatusFilters, setAppliedInvoiceStatusFilters] = useState<InvoiceStatus[]>([]);
  const [appliedTempCustomerFilter, setAppliedTempCustomerFilter] = useState(false);

  const {
    invoices: rawInvoices,
    isLoading: loadingInvoices,
    isFetching: fetchingInvoices,
    isFetchingMore,
    hasMore: hasMoreInvoices,
    totalLoaded,
    loadMore,
    reload: reloadInvoices,
  } = useInvoicesCursor<Invoice>({ ...cursorOptions, enabled: hasSearched && isGeneralQueryActive });

  const handleSearchWithRoute = useCallback((targetRoute: string) => {
    setHasSearched(true);
    const hasSpecificFilters = manifestFilter !== 'all' || targetRoute !== 'all' || invoiceSearchTerm.trim() !== '';
    setIsGeneralQueryActive(!hasSpecificFilters);
    setAppliedManifestFilter(manifestFilter);
    setAppliedRouteFilter(targetRoute);
    setAppliedInvoiceSearchTerm(invoiceSearchTerm);
    setAppliedInvoiceStatusFilters(invoiceStatusFilters);
    setAppliedTempCustomerFilter(tempCustomerFilter);
    setAppliedDataLoadLimit(dataLoadLimit);
    reloadInvoices();
  }, [manifestFilter, invoiceSearchTerm, invoiceStatusFilters, tempCustomerFilter, dataLoadLimit, reloadInvoices]);

  const handleSearchClick = useCallback(() => {
    handleSearchWithRoute(routeFilter);
  }, [handleSearchWithRoute, routeFilter]);

  const handleClearFiltersClick = useCallback(() => {
    setHasSearched(false);
    setIsGeneralQueryActive(false);
    
    // Reset UI states
    setInvoiceSearchTerm("");
    setManifestFilter("all");
    setRouteFilter("all");
    setInvoiceStatusFilters([]);
    setTempCustomerFilter(false);
    setDataLoadLimit("last24hours");
    setGroupBy("none");
    setExpandedGroups(new Set());
    
    // Reset Applied states
    setAppliedManifestFilter("all");
    setAppliedRouteFilter("all");
    setAppliedInvoiceSearchTerm("");
    setAppliedInvoiceStatusFilters([]);
    setAppliedTempCustomerFilter(false);
    setAppliedDataLoadLimit("last24hours");
  }, []);
  const createInvoiceMutation = useCreateInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();
  const createCustomerMutation = useCreateInvoiceCustomer();
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [returnPackagesConfirmInvoice, setReturnPackagesConfirmInvoice] = useState<any | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  // Customer selection tab state: "search" | "create"
  const [customerTab, setCustomerTab] = useState<"search" | "create">("search");


  const { results: customerSearchResults, isLoading: loadingCustomers } = useCustomerSearch(customerSearchTerm, 280, 60);
  const customers: Customer[] = useMemo(() => customerSearchResults.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    slCode: c.slCode,
  })), [customerSearchResults]);



  const [loadingManifest, setLoadingManifest] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const isLoading = loadingInvoices || fetchingInvoices || loadingManifest || loadingProfiles;
  const [trackingSearchResults, setTrackingSearchResults] = useState<Invoice[]>([]);
  const [trackingSearching, setTrackingSearching] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  // Manifest-filter: real-time onSnapshot so email / status changes on any manifest
  // invoice are reflected immediately without a page reload.
  const [manifestSearchResults, setManifestSearchResults] = useState<Invoice[]>([]);
  useEffect(() => {
    if (appliedManifestFilter === 'all' || !hasSearched) { 
      setManifestSearchResults([]); 
      setLoadingManifest(false);
      return; 
    }
    setLoadingManifest(true);
    const searchTerms = [appliedManifestFilter];
    const originalManifest = manifestsData?.find(
      m => (m.manifestNumber || m.id || '').trim() === appliedManifestFilter || m.id?.trim() === appliedManifestFilter
    );
    if (originalManifest) {
      const origVal = originalManifest.manifestNumber || originalManifest.id || '';
      if (origVal && !searchTerms.includes(origVal)) {
        searchTerms.push(origVal);
      }
    }
    /**
     * ARCHITECTURAL OPTIMIZATION (Zero Secondary Reads & Zero Write Loops):
     * The snapshot listener exclusively transforms document data in memory.
     * Permit status (DANP, RETENIDO, hasPermits) is evaluated strictly in-memory
     * from invoiceItems without performing secondary getDocs queries or updateDoc loops.
     */
    const q = query(
      collection(db, 'invoices'),
      where('manifestNumber', 'in', searchTerms),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setManifestSearchResults(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Invoice))
        );
        setLoadingManifest(false);
      },
      () => {
        setManifestSearchResults([]);
        setLoadingManifest(false);
      },
    );
    return () => unsub();
  }, [appliedManifestFilter, hasSearched]);

  /**
   * Route-filter: real-time onSnapshot to get invoices matching the active route filter.
   * Acotado con limit(200) para evitar descargas masivas de documentos.
   */
  const [routeSearchResults, setRouteSearchResults] = useState<Invoice[]>([]);
  useEffect(() => {
    if (appliedRouteFilter === 'all' || !hasSearched) {
      setRouteSearchResults([]);
      return;
    }
    // Limit to 200 to keep the fetch lightweight and cost-effective
    const q = query(
      collection(db, 'invoices'),
      where('clientRoute', '==', appliedRouteFilter),
      fsLimit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRouteSearchResults(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as Invoice))
        );
      },
      () => {
        setRouteSearchResults([]);
      }
    );
    return () => unsub();
  }, [appliedRouteFilter, hasSearched]);

  // Check if search query matches any already loaded invoice in memory (cost efficiency)
  const hasLocalInvoiceMatches = useMemo(() => {
    const term = appliedInvoiceSearchTerm.trim().toLowerCase();
    if (!term) return false;

    // If manifest filter is applied, all invoices for this manifest are loaded in full
    if (appliedManifestFilter !== "all") {
      return true;
    }

    const termNorm = term.replace(/[-\s]/g, "");
    const jqlFn = parseInvoiceJQL(appliedInvoiceSearchTerm);

    const loadedList = [
      ...rawInvoices,
      ...manifestSearchResults,
      ...routeSearchResults
    ];

    return loadedList.some((inv) => {
      if (inv.status === 'deleted') return false;
      if (appliedInvoiceStatusFilters.length > 0 && !appliedInvoiceStatusFilters.includes(inv.status as InvoiceStatus)) return false;
      if (appliedRouteFilter !== "all") {
        const invRuta = ((inv as any).clientRoute || (inv as any).route?.name || (inv as any).route || inv.customer?.ruta || "").trim();
        if (invRuta.toUpperCase() !== appliedRouteFilter.toUpperCase()) return false;
      }
      if (appliedTempCustomerFilter) {
        const code = (inv as any).slCode || inv.customer?.slCode;
        const isOrphan = isOrphanSlCode(code) || isOrphanInvoiceNumber(inv.invoiceNumber);
        if (!isOrphan) return false;
      }

      if (jqlFn) {
        try {
          return jqlFn(inv);
        } catch {
          return false;
        }
      }

      const invoiceNumNorm = (inv.invoiceNumber ?? "").toLowerCase().replace(/[-\s]/g, "");
      const slCodeNorm = (inv.slCode || inv.customer?.slCode || "").toLowerCase().replace(/[-\s]/g, "");
      
      const itemTracking = (inv.invoiceItems ?? []).map((i) => i.trackingNumber ?? "").join(" ").toLowerCase();
      const novaTrackings = [
        (inv as any).trackingNumber ?? "",
        ...((inv as any).trackingNumbers ?? []),
        ...((inv as any).items ?? []).map((i: any) => i.tracking ?? ""),
      ].join(" ").toLowerCase();
      const trackingNorm = (itemTracking + " " + novaTrackings).replace(/[-\s]/g, "");

      // Restrict local matches to unique identifiers (invoice number, slCode, exact tracking)
      return (
        invoiceNumNorm === termNorm ||
        slCodeNorm === termNorm ||
        (termNorm.length > 2 && trackingNorm.includes(termNorm))
      );
    });
  }, [rawInvoices, manifestSearchResults, routeSearchResults, appliedInvoiceSearchTerm, appliedInvoiceStatusFilters, appliedManifestFilter, appliedRouteFilter, appliedTempCustomerFilter]);

  // Server-side text search (combines tracking and main general search)
  const [searchTermResults, setSearchTermResults] = useState<Invoice[]>([]);
  useEffect(() => {
    const term = appliedInvoiceSearchTerm.trim();
    if (!term || !hasSearched || hasLocalInvoiceMatches) {
      setSearchTermResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setTrackingSearching(true);
      Promise.all([
        getInvoiceByTracking(term.toUpperCase()),
        firestoreApi.invoices.search(term, 100)
      ]).then(([trackingRes, searchRes]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const combined: Invoice[] = [];
        const add = (items: any[]) => {
          items.forEach(item => {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              combined.push(item);
            }
          });
        };
        add(trackingRes);
        add(searchRes);
        setSearchTermResults(combined);
      }).catch(err => {
        console.error("Text search failed:", err);
        if (!cancelled) setSearchTermResults([]);
      }).finally(() => {
        if (!cancelled) setTrackingSearching(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [appliedInvoiceSearchTerm, hasSearched, hasLocalInvoiceMatches]);

  // Merge cursor-loaded invoices with manifest, route, and search results (dedup by id).
  // This ensures all relevant invoices load properly without downloading the whole collection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const invoices: Invoice[] = useMemo(() => {
    if (!hasSearched) return [];
    const seen = new Set<string>();
    const combined: Invoice[] = [];

    const add = (items: Invoice[]) => {
      items.forEach(item => {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          combined.push(item);
        }
      });
    };

    add(rawInvoices);
    add(manifestSearchResults);
    add(routeSearchResults);
    add(searchTermResults);

    return combined;
  }, [rawInvoices, manifestSearchResults, routeSearchResults, searchTermResults, hasSearched]);
  // dateRange removed — replaced by dataLoadLimit (matches Packages)
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [groupBy, setGroupBy] = useState<'none' | 'name' | 'slCode' | 'dni' | 'email'>('none');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());


  const [previewInvoice, setPreviewInvoice] = useState<SP1InvoiceShape | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [generatingPDFId, setGeneratingPDFId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [refreshingEmailId, setRefreshingEmailId] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestingAIQuickId, setSuggestingAIQuickId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editDiscountPercentage, setEditDiscountPercentage] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editInternalNotes, setEditInternalNotes] = useState<string>("");
  const [editPackages, setEditPackages] = useState<string[]>([]);
  const [editCurrency, setEditCurrency] = useState<string>("USD");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editClientName, setEditClientName] = useState<string>("");
  const [editClientEmail, setEditClientEmail] = useState<string>("");
  const [editClientPhone, setEditClientPhone] = useState<string>("");
  const [editClientDni, setEditClientDni] = useState<string>("");
  const [editManifestNumber, setEditManifestNumber] = useState<string>("");
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("");
  const [editPaymentReference, setEditPaymentReference] = useState<string>("");
  const [sendingSMSId, setSendingSMSId] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedInvoiceNumber, setCopiedInvoiceNumber] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedEmailLogs, setExpandedEmailLogs] = useState<Set<string>>(new Set());
  const [expandedPackageItems, setExpandedPackageItems] = useState<Set<string>>(new Set());
  const [changingRouteId, setChangingRouteId] = useState<string | null>(null);
  const [reassigningInvoice, setReassigningInvoice] = useState<Invoice | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassigningManifestInvoice, setReassigningManifestInvoice] = useState<Invoice | null>(null);
  const [isReassigningManifest, setIsReassigningManifest] = useState(false);
  // Post-reassign: prompt operator to resend the invoice to the NEW owner's email.
  // Opened only after a successful reassign + mandatory SP2 sync, and only when
  // the new customer has a destination address.
  const [reassignResendPrompt, setReassignResendPrompt] = useState<ReassignResendPrompt | null>(null);
  const [liveInvoiceData, setLiveInvoiceData] = useState<Map<string, Partial<Invoice>>>(new Map());
  // Live customer info indexed by slCode — enriches each invoice row with
  // contact + encomienda service name (the latter is not denormalized on
  // the invoice doc itself, so we resolve it from the customer record).
  const [customerInfoBySlCode, setCustomerInfoBySlCode] = useState<Map<string, CustomerContactInfo>>(new Map());
  // Live `encomiendas` directory — used to resolve `encomiendaProvider`
  // (a raw id pushed from SP2) to a human-readable service name.
  const [encomiendaDirectory, setEncomiendaDirectory] = useState<Map<string, Encomienda>>(new Map());

  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [pkgWeightCache, setPkgWeightCache] = useState<Map<string, number>>(new Map());
  const [editItems, setEditItems] = useState<Array<{
    trackingNumber: string;
    description: string;
    weight: number;
    unitPrice: number;
    quantity: number;
    packageId?: string;
    isManual?: boolean;
    currency?: 'USD' | 'CRC';
    requiresPermit?: boolean;
  }>>([]);
  const [editExchangeRate, setEditExchangeRate] = useState<number>(0);
  /**
   * Original TC captured when the modal opens — used to detect a change.
   * Saving the same TC twice is a no-op; only when `editExchangeRate`
   * differs from this do we propagate to linked packages.
   */
  const [editOriginalExchangeRate, setEditOriginalExchangeRate] = useState<number>(0);
  /**
   * Operator opt-in: when true AND the TC changed, handleSaveEditInvoice
   * also rewrites `exchangeRate` + `costCRC` on every package linked to
   * this invoice. Defaults to true because that's the safer invariant
   * (invoice and its packages should always agree on TC) — but stays a
   * checkbox so the operator can opt out for one-off surgical edits.
   */
  const [editTcAlsoPackages, setEditTcAlsoPackages] = useState<boolean>(true);
  /** Which item row has the "move to" dropdown open — null = none */
  const [moveItemPopover, setMoveItemPopover] = useState<{ itemIdx: number } | null>(null);
  /** Item index currently being moved (shows spinner) */
  const [movingItemIdx, setMovingItemIdx] = useState<number | null>(null);

  /** Other draft/pending invoices belonging to the same client — valid move targets */
  const sameClientTargetInvoices = useMemo(() => {
    if (!editingInvoice) return [];
    const srcKey = editingInvoice.slCode ?? editingInvoice.customerId ?? '';
    if (!srcKey) return [];
    return invoices.filter(inv =>
      inv.id !== editingInvoice.id &&
      (inv.slCode === srcKey || inv.customerId === srcKey) &&
      (inv.status === 'draft' || inv.status === 'overdue')
    );
  }, [invoices, editingInvoice]);

  // Subscribe to Firestore onSnapshot for each expanded row and the active editingInvoice to get real-time status updates
  useEffect(() => {
    if (expandedRows.size === 0 && !editingInvoice) return;
    const unsubscribers: (() => void)[] = [];

    const idsToSubscribe = new Set<string>(expandedRows);
    if (editingInvoice) {
      idsToSubscribe.add(editingInvoice.id);
    }

    idsToSubscribe.forEach((invoiceId) => {
      const unsub = onSnapshot(
        doc(db, "invoices", invoiceId),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as Partial<Invoice>;
          setLiveInvoiceData((prev) => {
            const next = new Map(prev);
            next.set(invoiceId, data);
            return next;
          });
        },
        () => { /* ignore errors silently */ }
      );
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((u) => u());
  }, [expandedRows, editingInvoice]);

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [bulkActionConfirmed, setBulkActionConfirmed] = useState(false);
  const [emailSendOptions, setEmailSendOptions] = useState({
    sendEmail: true,
    updatePackages: true,
    syncSp2: true,
  });
  const [statusChangeOptions, setStatusChangeOptions] = useState({
    syncInvoice: true,
    updatePackages: true,
    syncSp2: true,
  });
  const [bulkStatusOptions, setBulkStatusOptions] = useState({
    syncSp2: true,
    updatePackages: true,
    includeAnnulled: false,
  });

  const [confirmAction, setConfirmAction] = useState<{
    show: boolean;
    type: string;
    invoiceId: string;
    invoiceNumber: string;
    data?: any;
  } | null>(null);
  const [shippingLabelData, setShippingLabelData] = useState<NovaShippingLabelData | null>(null);
  const [bulkLabelQueue, setBulkLabelQueue] = useState<NovaShippingLabelData[]>([]);

  // Annul dialog options
  const [annulMode, setAnnulMode] = useState<'consolidation' | 'manifest'>('consolidation');
  const [annulManifestInput, setAnnulManifestInput] = useState('');
  const [annulManifestMatches, setAnnulManifestMatches] = useState<{ docId: string; manifestNumber: string }[]>([]);
  const [annulManifestLoading, setAnnulManifestLoading] = useState(false);
  const [annulSelectedManifest, setAnnulSelectedManifest] = useState<{ docId: string; manifestNumber: string } | null>(null);
  const [annulDropdownOpen, setAnnulDropdownOpen] = useState(false);
  const [customerConsolidationEnabledSP1, setCustomerConsolidationEnabledSP1] = useState<boolean | null>(null);
  const [customerConsolidationEnabledSP2, setCustomerConsolidationEnabledSP2] = useState<boolean | null>(null);
  const [autoEnableConsolidation, setAutoEnableConsolidation] = useState(true);

  // Manifest search for annul dialog (debounced)
  useEffect(() => {
    if (annulMode !== 'manifest') {
      setAnnulManifestMatches([]);
      return;
    }
    setAnnulManifestLoading(true);
    const term = annulManifestInput.trim();
    const delay = term.length === 0 ? 0 : 250;
    const timer = setTimeout(async () => {
      try {
        const col = collection(db, 'manifests');
        // Order by `createdAt` (always written via serverTimestamp() in
        // saveManifestRecord) instead of `updatedAt` — historically some code
        // paths wrote `updatedAt` as an ISO string while the canonical save
        // used a Firestore Timestamp. Mixed types break orderBy and made the
        // "Recientes" list appear in arbitrary order. `createdAt` is preserved
        // across re-process (see saveManifestRecord) so it is safe to sort by.
        const q = term.length === 0
          ? query(col, fsOrderBy('createdAt', 'desc'), fsLimit(25))
          : query(
            col,
            where('manifestNumber', '>=', term.toUpperCase()),
            where('manifestNumber', '<=', term.toUpperCase() + '\uf8ff'),
            fsOrderBy('manifestNumber', 'desc'),
            fsLimit(25),
          );
        const snap = await getDocs(q);
        const isInvoicePermit = Boolean(
          confirmAction?.data?.requiresPermit ||
          confirmAction?.data?.hasPermitItems ||
          (confirmAction?.data?.manifestNumber || '').toUpperCase().endsWith('DANP') ||
          (confirmAction?.data?.manifestNumber || '').toUpperCase().includes('PERMISO')
        );

        setAnnulManifestMatches(
          snap.docs
            .map(d => ({ docId: d.id, manifestNumber: (d.data().manifestNumber ?? d.id) as string }))
            .filter(m => m.manifestNumber !== confirmAction?.data?.manifestNumber)
            .filter(m => {
              const targetIsPermit = m.manifestNumber.toUpperCase().endsWith('DANP') || m.manifestNumber.toUpperCase().includes('PERMISO') || m.manifestNumber.toUpperCase().includes('PERMIT');
              return isInvoicePermit === targetIsPermit;
            })
            .filter((m, idx, arr) => arr.findIndex(x => x.manifestNumber === m.manifestNumber) === idx),
        );
      } catch {
        setAnnulManifestMatches([]);
      } finally {
        setAnnulManifestLoading(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [annulManifestInput, annulMode, confirmAction?.data]);

  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  // Mobile filters state
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkStripping, setBulkStripping] = useState(false);
  const [bulkMerging, setBulkMerging] = useState(false);
  const [bulkUpdatingStatus, setBulkUpdatingStatus] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkSyncingInvoices, setBulkSyncingInvoices] = useState(false);
  // ── Bulk TC update ────────────────────────────────────────────────────────
  // Lets the operator correct the exchange rate on a selection of invoices
  // and cascade the change to their linked packages + manifest docs.
  const [bulkTcModalOpen, setBulkTcModalOpen] = useState(false);
  const [bulkTcSubmitting, setBulkTcSubmitting] = useState(false);
  const [bulkPaymentModalOpen, setBulkPaymentModalOpen] = useState(false);

  // ── Sync Verifier ─────────────────────────────────────────────────────────
  const [syncVerifierOpen, setSyncVerifierOpen] = useState(false);

  // ── Invoice → SmartWeb sync ────────────────────────────────────────────────
  const [syncInvoicesOpen, setSyncInvoicesOpen] = useState(false);
  const [syncInvoiceTargets, setSyncInvoiceTargets] = useState<InvoiceRecord[]>([]);

  const handleOpenSyncInvoices = useCallback((targets: Invoice[]) => {
    setSyncInvoiceTargets(targets as unknown as InvoiceRecord[]);
    setSyncInvoicesOpen(true);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Request queue for handling massive concurrent operations
  const requestQueueRef = useRef<Map<string, AbortController>>(new Map());
  const maxConcurrentRequests = 5;
  const activeRequestsRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      requestQueueRef.current.forEach((controller) => controller.abort());
      requestQueueRef.current.clear();
    };
  }, []);

  // Request throttling helper
  const executeWithThrottle = useCallback(async <T,>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> => {
    const existingController = requestQueueRef.current.get(key);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    requestQueueRef.current.set(key, controller);

    while (activeRequestsRef.current >= maxConcurrentRequests) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    activeRequestsRef.current++;

    try {
      const result = await fn(controller.signal);
      return result;
    } finally {
      activeRequestsRef.current--;
      requestQueueRef.current.delete(key);
    }
  }, []);

  const filteredCustomers = customers.filter(
    (c) =>
      (c.fullName ?? "").toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
      (c.slCode ?? "").toLowerCase().includes(customerSearchTerm.toLowerCase()),
  );

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
      }>;
    },
    staleTime: 1000 * 60 * 5,
  });

  const manifestPackageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    // First, populate from manifestsData
    (manifestsData || []).forEach(m => {
      const key = (m.manifestNumber || m.id || '').trim();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + (m.totalPackages ?? m.packages?.length ?? 0));
      }
    });
    // Fallback/enrich: if there are loaded invoices whose manifestNumber is not in counts,
    // we can count the items from the invoiceItems.
    invoices.forEach((inv) => {
      if (inv.manifestNumber) {
        const key = inv.manifestNumber.trim();
        if (key && !counts.has(key)) {
          const pkgCount = (inv.invoiceItems || []).length;
          counts.set(key, (counts.get(key) || 0) + pkgCount);
        }
      }
    });
    return counts;
  }, [manifestsData, invoices]);

  const manifestOptions = useMemo(() => {
    const seen = new Set<string>();
    (manifestsData || []).forEach(m => {
      const val = (m.manifestNumber || m.id || '').trim();
      if (val) seen.add(val);
    });
    invoices.forEach((inv) => {
      if (inv.manifestNumber) {
        const val = inv.manifestNumber.trim();
        if (val) seen.add(val);
      }
    });
    return Array.from(seen).sort();
  }, [manifestsData, invoices]);

  // Manifests formatted for PackageManifestEditor (used in InvoicesDataTable rows)
  const manifestsForDataTable = useMemo(() => {
    if (manifestsData && manifestsData.length > 0) {
      return manifestsData.map(m => ({
        id: m.id || m.manifestNumber,
        manifestNumber: m.manifestNumber,
        manifestType: m.manifestType || (m.manifestNumber.toUpperCase().endsWith('M') ? 'usa_sea' : 'usa_air'),
      }));
    }
    return manifestOptions.map(m => ({
      id: m,
      manifestNumber: m,
      manifestType: m.toUpperCase().endsWith('M') ? 'usa_sea' : 'usa_air',
    }));
  }, [manifestsData, manifestOptions]);

  const routeOptions = useMemo(() => {
    const seen = new Map<string, string>(); // key=UPPER for dedup, value=display
    // Pre-populate with all active routes from dbRoutes to enable filtering before search
    (dbRoutes || []).forEach(r => {
      if (r.name) {
        seen.set(r.name.toUpperCase(), r.name);
      }
    });
    invoices.forEach((inv) => {
      const slCode = (inv.clientSlCode || inv.slCode || inv.customer?.slCode || "").toString().trim();
      const customerInfo = slCode ? customerInfoBySlCode.get(slCode) : undefined;
      const ruta = ((inv as any).clientRoute || (inv as any).route?.name || (inv as any).route || customerInfo?.ruta || inv.customer?.ruta || '').trim();
      if (ruta) {
        const key = ruta.toUpperCase();
        if (!seen.has(key)) seen.set(key, ruta);
      }
    });
    return Array.from(seen.values()).sort();
  }, [invoices, customerInfoBySlCode, dbRoutes]);

  const filteredInvoices = useMemo(() => {
    const term = invoiceSearchTerm.trim().toLowerCase();
    const jqlFn = parseInvoiceJQL(invoiceSearchTerm);

    return invoices.filter((rawInv) => {
      const slCode = (rawInv.clientSlCode || rawInv.slCode || rawInv.customer?.slCode || "").toString().trim();
      const customerInfo = slCode ? customerInfoBySlCode.get(slCode) : undefined;
      const customerObj = customerInfo ? {
        id: rawInv.customer?.id || "",
        fullName: customerInfo.fullName,
        email: customerInfo.email,
        phone: customerInfo.phone,
        dni: customerInfo.dni,
        ruta: customerInfo.ruta,
        slCode: customerInfo.slCode,
      } : undefined;

      const inv = { 
        ...rawInv, 
        ...(liveInvoiceData.get(rawInv.id) ?? {}),
        customer: customerObj || rawInv.customer
      } as Invoice;

      if (inv.status === 'deleted') return false;
      if (invoiceStatusFilters.length > 0 && !invoiceStatusFilters.includes(inv.status as InvoiceStatus)) return false;
      if (manifestFilter !== "all") {
        const mObj = manifestsData?.find(
          m => (m.manifestNumber || m.id || '').trim() === manifestFilter || m.id?.trim() === manifestFilter
        );
        const allowedNumbers = new Set([
          manifestFilter.trim().toLowerCase(),
          (mObj?.manifestNumber || '').trim().toLowerCase(),
          (mObj?.id || '').trim().toLowerCase()
        ].filter(Boolean));

        const invMn = (inv.manifestNumber || '').trim().toLowerCase();
        if (!allowedNumbers.has(invMn)) return false;
      }
      if (routeFilter !== "all") {
        const invRuta = ((inv as any).clientRoute || (inv as any).route?.name || (inv as any).route || inv.customer?.ruta || "").trim();
        if (invRuta.toUpperCase() !== routeFilter.toUpperCase()) return false;
      }
      if (tempCustomerFilter) {
        const code = (inv as any).slCode || inv.customer?.slCode;
        const isOrphan = isOrphanSlCode(code) || isOrphanInvoiceNumber(inv.invoiceNumber);
        if (!isOrphan) return false;
      }
      
      if (jqlFn) {
        try {
          return jqlFn(inv);
        } catch (err) {
          console.error("JQL check failed:", err);
          return false;
        }
      }

      if (!term) return true;
      const termNorm = term.replace(/[-\s]/g, "");

      const itemTracking = (inv.invoiceItems ?? []).map((i) => i.trackingNumber ?? "").join(" ").toLowerCase();
      const novaTrackings = [
        (inv as any).trackingNumber ?? "",
        ...((inv as any).trackingNumbers ?? []),
        ...((inv as any).items ?? []).map((i: any) => i.tracking ?? ""),
      ].join(" ").toLowerCase();

      const trackingNorm = (itemTracking + " " + novaTrackings).replace(/[-\s]/g, "");
      const invoiceNumNorm = (inv.invoiceNumber ?? "").toLowerCase().replace(/[-\s]/g, "");
      const slCodeNorm = (inv.slCode || inv.customer?.slCode || "").toLowerCase().replace(/[-\s]/g, "");
      const dniNorm = (inv.clientDni || inv.customer?.dni || "").toLowerCase().replace(/[-\s]/g, "");
      const phoneNorm = (inv.clientPhone || inv.customer?.phone || "").toLowerCase().replace(/[-\s]/g, "");

      return (
        (inv.invoiceNumber ?? "").toLowerCase().includes(term) ||
        invoiceNumNorm.includes(termNorm) ||
        (inv.customer?.fullName ?? "").toLowerCase().includes(term) ||
        (inv.clientName ?? "").toLowerCase().includes(term) ||
        (inv.clientEmail ?? "").toLowerCase().includes(term) ||
        (inv.customer?.email ?? "").toLowerCase().includes(term) ||
        (inv.customer?.phone ?? "").toLowerCase().includes(term) ||
        (inv.clientPhone ?? "").toLowerCase().includes(term) ||
        phoneNorm.includes(termNorm) ||
        (inv.clientDni ?? "").toLowerCase().includes(term) ||
        dniNorm.includes(termNorm) ||
        (inv.slCode ?? "").toLowerCase().includes(term) ||
        (inv.customer?.slCode ?? "").toLowerCase().includes(term) ||
        slCodeNorm.includes(termNorm) ||
        (inv.totalAmount ?? 0).toFixed(2).includes(term) ||
        (inv.manifestNumber ?? "").toLowerCase().includes(term) ||
        (inv.customer?.ruta ?? "").toLowerCase().includes(term) ||
        (inv.notes ?? "").toLowerCase().includes(term) ||
        itemTracking.includes(term) ||
        novaTrackings.includes(term) ||
        (termNorm.length > 2 && trackingNorm.includes(termNorm))
      );
    });
  }, [invoices, invoiceSearchTerm, invoiceStatusFilters, manifestFilter, routeFilter, tempCustomerFilter, liveInvoiceData, customerInfoBySlCode]);

  const displayedFilteredInvoices = useMemo(() => {
    let result = [...filteredInvoices];

    // Priority 1: Table column header sorting (sortField & sortDirection)
    if (sortField) {
      result.sort((a, b) => {
        const itemA = a as any;
        const itemB = b as any;
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'invoiceNumber') {
          valA = (itemA.invoiceNumber || itemA.number || itemA.id || '').trim();
          valB = (itemB.invoiceNumber || itemB.number || itemB.id || '').trim();
        } else if (sortField === 'manifestNumber') {
          valA = (itemA.manifestNumber || itemA.manifestId || '').trim();
          valB = (itemB.manifestNumber || itemB.manifestId || '').trim();
        } else if (sortField === 'clientName') {
          valA = (itemA.customer?.fullName || itemA.clientName || itemA.customerName || itemA.fullName || itemA.clientSlCode || itemA.slCode || '').trim();
          valB = (itemB.customer?.fullName || itemB.clientName || itemB.customerName || itemB.fullName || itemB.clientSlCode || itemB.slCode || '').trim();
        } else if (sortField === 'route') {
          valA = (itemA.customer?.ruta || itemA.ruta || itemA.deliveryRoute || '').trim();
          valB = (itemB.customer?.ruta || itemB.ruta || itemB.deliveryRoute || '').trim();
        } else if (sortField === 'totalAmount') {
          valA = Number(itemA.totalAmount ?? itemA.total ?? itemA.amount ?? itemA.subtotal ?? 0);
          valB = Number(itemB.totalAmount ?? itemB.total ?? itemB.amount ?? itemB.subtotal ?? 0);
        } else if (sortField === 'status') {
          valA = (itemA.status || '').trim();
          valB = (itemB.status || '').trim();
        } else if (sortField === 'date') {
          valA = new Date(itemA.date || itemA.createdAt || 0).getTime();
          valB = new Date(itemB.date || itemB.createdAt || 0).getTime();
        } else {
          valA = (itemA[sortField] || '').toString().trim();
          valB = (itemB[sortField] || '').toString().trim();
        }

        if (typeof valA === 'number' && typeof valB === 'number' && !isNaN(valA) && !isNaN(valB)) {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA || '');
        const strB = String(valB || '');

        if (!strA && !strB) return 0;
        if (!strA) return 1;
        if (!strB) return -1;

        const comp = strA.localeCompare(strB, 'es', { sensitivity: 'base', numeric: true });
        return sortDirection === 'asc' ? comp : -comp;
      });
    } else if (sortOrder !== 'none') {
      // Legacy dropdown sorting by customer name
      result.sort((a, b) => {
        const nameA = (a.customer?.fullName || a.clientName || '').trim().toLowerCase();
        const nameB = (b.customer?.fullName || b.clientName || '').trim().toLowerCase();

        if (!nameA && !nameB) return 0;
        if (!nameA) return 1;
        if (!nameB) return -1;

        const comparison = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
        return sortOrder === 'name-asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [filteredInvoices, sortOrder, sortField, sortDirection]);

  // Paginated data
  const paginatedInvoices = useMemo(() => {
    if (groupBy !== 'none') return displayedFilteredInvoices;
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return displayedFilteredInvoices.slice(start, end);
  }, [displayedFilteredInvoices, pageIndex, pageSize, groupBy]);

  const totalPages = Math.max(1, Math.ceil(displayedFilteredInvoices.length / pageSize));

  // Real-time stats for the current filtered set — updates on every filter change
  const filteredStats = useMemo(() => {
    const count = displayedFilteredInvoices.length;
    let totalWeight = 0;
    let totalAmount = 0;
    for (const inv of displayedFilteredInvoices) {
      totalAmount += Number((inv as any).totalAmount ?? 0);
      const items: any[] = (inv as any).invoiceItems ?? (inv as any).items ?? [];
      for (const item of items) {
        totalWeight += Number(item.weight ?? 0);
      }
    }
    return { count, totalWeight, totalAmount };
  }, [displayedFilteredInvoices]);

  const isEncomiendaRouteMismatch = useMemo(() => {
    if (!appliedManifestFilter || appliedManifestFilter === "all") return false;
    const isEncomiendaManifest = appliedManifestFilter.toUpperCase().startsWith("ENC");
    return (
      isEncomiendaManifest &&
      routeFilter !== "all" &&
      routeFilter.toLowerCase() !== "encomiendas"
    );
  }, [appliedManifestFilter, routeFilter]);

  // Keep stable stats during transition/loading to prevent layout jumps and flickers
  const [stableStats, setStableStats] = useState({ count: 0, totalWeight: 0, totalAmount: 0 });
  useEffect(() => {
    if (!isLoading && !trackingSearching) {
      setStableStats(filteredStats);
    }
  }, [filteredStats, isLoading, trackingSearching]);

  // Subscribe once to the global `encomiendas` collection so admin renames or
  // additions are reflected live in every invoice row.
  useEffect(() => {
    const unsub = subscribeEncomiendas(
      (items) => {
        const map = new Map<string, Encomienda>();
        for (const e of items) {
          if (e.id) map.set(e.id, e);
          // Also key by lowercased name so we can resolve free-text providers
          // (e.g. customer.encomiendaProvider stored as "DHL Express")
          if (e.name) map.set(`name:${e.name.toLowerCase()}`, e);
        }
        setEncomiendaDirectory(map);
      },
      (err) => console.warn('[encomiendas-subscribe]', err),
    );
    return unsub;
  }, []);

  // Subscribe to the customer docs that back the currently-paginated invoices
  // so we can render the encomienda service name (and other customer fields)
  // on every row without bloating the invoice doc itself. The `subscribe`
  // helper chunks at 30 slCodes per Firestore `in` query.
  const slCodesForCustomerSub = useMemo(() => {
    const codes = new Set<string>();
    for (const inv of invoices) {
      const code = (inv as any).clientSlCode || (inv as any).slCode || inv.customer?.slCode;
      if (typeof code === 'string' && code.trim()) codes.add(code.trim());
    }
    return Array.from(codes).sort();
  }, [invoices]);
  // Stable key so the effect only re-runs when the actual set of codes changes.
  const slCodesKey = slCodesForCustomerSub.join('|');
  useEffect(() => {
    if (!slCodesForCustomerSub.length) {
      setCustomerInfoBySlCode(new Map());
      setLoadingProfiles(false);
      return;
    }
    setLoadingProfiles(true);
    const unsub = subscribeCustomersBySlCodes(slCodesForCustomerSub, (map) => {
      setCustomerInfoBySlCode(map);
      setLoadingProfiles(false);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slCodesKey]);



  // Grouped data
  const GROUP_BY_LABELS: Record<string, string> = { name: 'Nombre', slCode: 'SL Code', dni: 'Cédula', email: 'Correo' };

  const groupedData = useMemo(() => {
    if (groupBy === 'none') return null;
    const groups = new Map<string, Invoice[]>();
    for (const inv of filteredInvoices) {
      let key = '';
      if (groupBy === 'name') key = (inv.customer?.fullName || inv.clientName || 'Sin nombre').toUpperCase();
      else if (groupBy === 'slCode') key = inv.customer?.slCode || inv.slCode || 'Sin código SL';
      else if (groupBy === 'dni') key = inv.clientDni || 'Sin cédula';
      else if (groupBy === 'email') key = inv.customer?.email || inv.clientEmail || 'Sin correo';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }
    return groups;
  }, [filteredInvoices, groupBy]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Bulk selection (must come after paginatedInvoices) ──────────────────
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const pageIds = paginatedInvoices.map(i => i.id);
      const allSelected = pageIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [paginatedInvoices]);

  const invoicesById = useMemo(() => {
    const map = new Map<string, Invoice>();
    for (const inv of invoices) {
      map.set(inv.id, inv);
    }
    return map;
  }, [invoices]);

  const selectedCount = selectedIds.size;

  const selectedInvoicesList = useMemo(() => {
    const list: Invoice[] = [];
    selectedIds.forEach(id => {
      const inv = invoicesById.get(id);
      if (inv) {
        list.push({ ...inv, ...(liveInvoiceData.get(id) ?? {}) } as Invoice);
      }
    });
    return list;
  }, [selectedIds, invoicesById, liveInvoiceData]);

  const pageSelectedCount = paginatedInvoices.filter(i => selectedIds.has(i.id)).length;
  const allPageSelected = paginatedInvoices.length > 0 && pageSelectedCount === paginatedInvoices.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;

  // ── Bulk TC update ──────────────────────────────────────────────────────
  // Propagates a new exchange rate across the selected invoices AND their
  // linked packages AND the manifest docs that reference them, via the
  // isolated service in update-exchange-rate-service.ts. Safe & idempotent:
  // no invoice status is modified, annulled invoices are preserved, and
  // re-running with the same rate is a no-op.
  const handleBulkUpdateTc = useCallback(
    async (newRate: number) => {
      if (selectedIds.size === 0 || !Number.isFinite(newRate) || newRate <= 0) return;
      setBulkTcSubmitting(true);
      try {
        const result = await bulkUpdateInvoicesExchangeRate(
          Array.from(selectedIds),
          newRate,
          {
            changedBy: user?.email || user?.id || 'invoices-ui',
            reason: `Bulk TC update from /invoices on ${selectedIds.size} invoice(s)`,
          },
        );
        if (result.errors.length > 0) {
          console.warn('[BulkTC] partial errors:', result.errors);
        }
        const parts: string[] = [];
        if (result.invoicesUpdated > 0) parts.push(`${result.invoicesUpdated} factura${result.invoicesUpdated !== 1 ? 's' : ''}`);
        if (result.packagesUpdated > 0) parts.push(`${result.packagesUpdated} paquete${result.packagesUpdated !== 1 ? 's' : ''}`);
        if (result.manifestsUpdated > 0) parts.push(`${result.manifestsUpdated} manifiesto${result.manifestsUpdated !== 1 ? 's' : ''}`);
        // Audit trail so the change is traceable in /audit.
        logAction({
          userId: user?.id ?? 'unknown',
          userName: user?.fullName,
          userEmail: user?.email,
          userRole: user?.role,
          action: 'invoice_bulk_tc_updated' as AuditAction,
          category: 'invoice',
          resource: '/invoices',
          result: result.errors.length > 0 ? 'error' : 'success',
          errorMessage: result.errors.length > 0 ? result.errors.slice(0, 3).join(' · ') : undefined,
          metadata: {
            newRate,
            invoicesUpdated: result.invoicesUpdated,
            packagesUpdated: result.packagesUpdated,
            manifestsUpdated: result.manifestsUpdated,
            skippedAnnulled: result.skippedInvoicesAnnulled,
            affectedManifests: result.affectedManifests,
            invoiceIds: Array.from(selectedIds),
            errors: result.errors.length,
          },
        });
        toast({
          title: 'Tipo de cambio actualizado',
          description:
            parts.length > 0
              ? `TC ₡${newRate.toLocaleString('es-CR')} aplicado a ${parts.join(' + ')}${result.skippedInvoicesAnnulled > 0
                ? ` (${result.skippedInvoicesAnnulled} anulada${result.skippedInvoicesAnnulled !== 1 ? 's' : ''} preservada${result.skippedInvoicesAnnulled !== 1 ? 's' : ''})`
                : ''
              }`
              : 'Nada que actualizar.',
          variant: result.errors.length > 0 ? 'destructive' : 'default',
        });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
        setBulkTcModalOpen(false);
        setSelectedIds(new Set());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BulkTC] failed:', err);
        toast({
          title: 'Error actualizando TC',
          description: msg,
          variant: 'destructive',
        });
      } finally {
        setBulkTcSubmitting(false);
      }
    },
    [selectedIds, user, queryClient, toast],
  );

  // ── Bulk delete ─────────────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setBulkProgress({ done: 0, total: selectedIds.size });
    const ids = Array.from(selectedIds);
    let done = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const invObj = invoices.find((i: any) => i.id === id) as any;
        await firestoreApi.invoices.update(id, {
          status: 'deleted',
          deletedAt: serverTimestamp(),
          deletedBy: user?.id ?? 'unknown',
          deletedByName: user?.fullName ?? 'unknown',
          ...(invObj?.invoiceNumber && { deletedInvoiceNumber: invObj.invoiceNumber }),
        });

        // Unlink packages associated with this invoice in SP1
        try {
          const pkgSnaps = await getDocs(query(collection(db, 'packages'), where('invoiceId', '==', id)));
          if (!pkgSnaps.empty) {
            const batch = writeBatch(db);
            pkgSnaps.docs.forEach(pkgDoc => {
              batch.update(doc(db, 'packages', pkgDoc.id), {
                invoiceId: deleteField(),
                invoiceNumber: deleteField(),
                invoiceStatus: deleteField(),
                smartwebSynced: false,
                statusHistory: arrayUnion({
                  status: 'customs',
                  changedAt: new Date().toISOString(),
                  changedBy: user?.email || user?.id || 'admin',
                  note: `Factura ${invObj?.invoiceNumber || id} eliminada (masivo) — paquete desvinculado.`,
                }),
              });
            });
            await batch.commit();
            console.log(`[handleBulkDelete] Successfully unlinked ${pkgSnaps.size} packages in SP1 for invoice ${id}`);
          }
        } catch (pkgErr) {
          console.warn(`[handleBulkDelete] Failed to unlink packages in SP1 for invoice ${id}:`, pkgErr);
        }
        
        // Ensure soft-deletions sync to SP2 by removing the invoice there
        try {
          await deleteInvoiceFromSp2(id, invObj?.invoiceNumber || id);
        } catch (sp2Err) {
          console.warn(`[handleBulkDelete] Failed to remove invoice ${id} from SP2:`, sp2Err);
        }

        logAction({
          userId: user?.id ?? 'unknown',
          userName: user?.fullName,
          userEmail: user?.email,
          userRole: user?.role,
          action: 'invoice_deleted',
          category: 'invoice',
          resource: '/invoices',
          resourceId: id,
          result: 'success',
          metadata: { invoiceNumber: invObj?.invoiceNumber, bulk: true },
        });
        done++;
        setBulkProgress({ done, total: ids.length });
      } catch (err) {
        errors.push(id);
        done++;
        setBulkProgress({ done, total: ids.length });
      }
    }
    setSelectedIds(new Set());
    setBulkDeleting(false);
    setBulkProgress(null);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
    toast({
      title: t('common.success'),
      description: `${ids.length - errors.length} factura(s) enviada(s) a la papelera${errors.length ? `, ${errors.length} error(es)` : ''}`,
      variant: errors.length ? 'destructive' : 'default',
    });
  }, [selectedIds, invoices, user, queryClient, toast, t]);

  // ── Bulk send email ─────────────────────────────────────────────────────
  const handlePrintRouteManifest = useCallback(async () => {
    if (manifestFilter === 'all' || routeFilter === 'all') return;

    const tc = filteredInvoices.find(inv => (inv.exchangeRate ?? 0) > 0)?.exchangeRate ?? 0;

    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      toast({ title: t('common.error'), description: 'Bloqueador de ventanas activado', variant: 'destructive' });
      return;
    }

    win.document.write(`
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
        <h2>Cargando manifiesto, por favor espere...</h2>
      </div>
    `);

    try {
      // Get unique SL codes
      const slCodes = new Set<string>();
      filteredInvoices.forEach(inv => {
        const code = (inv as any).slCode || inv.customer?.slCode;
        if (code) slCodes.add(code);
      });

      const customers = await getCustomersBySlCodes(Array.from(slCodes));
      const customerMap = new Map();
      customers.forEach(c => customerMap.set(c.slCode, c));

      const rows: RouteManifestRow[] = [];
      filteredInvoices.forEach(inv => {
        const slCode = (inv as any).slCode || inv.customer?.slCode || '';
        const customerName = (inv as any).clientName || inv.customer?.fullName || '';
        const manifestName = inv.manifestNumber || '';
        
        const c = customerMap.get(slCode);
        const isConsolidado = c && typeof c.consolidationEnabled === 'boolean'
          ? c.consolidationEnabled
          : ((inv as any).isConsolidation ?? false);

        const items = inv.invoiceItems ?? [];
        if (items.length > 0) {
          items.forEach(item => {
            const rawItem = item as any;
            const isItemReturned = Boolean(
              rawItem.isReturned === true ||
              rawItem.wasReturned === true ||
              !!rawItem.returnedAt ||
              !!rawItem.returnReason
            );
            rows.push({
              slCode,
              customerName,
              manifestName: rawItem.manifestNumber || manifestName,
              tracking: item.trackingNumber || rawItem.tracking || '',
              price: Number(item.totalPrice ?? item.unitPrice ?? 0),
              descripcion: item.description || '',
              peso: Number(item.weight ?? 0),
              consolidacion: isConsolidado,
              permisos: !!(rawItem.requiresPermit || rawItem.permisos),
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              invoiceAmountUSD: inv.totalAmount,
              invoiceAmountCRC: (inv as any).totalAmountCRC,
              isReturned: isItemReturned,
              isReassigned: !!rawItem.isReassigned,
              originManifest: isItemReturned ? (rawItem.originManifest || (rawItem.manifestNumber && rawItem.manifestNumber !== manifestFilter ? rawItem.manifestNumber : undefined)) : undefined,
            });
          });
        } else {
          rows.push({
            slCode,
            customerName,
            manifestName,
            tracking: '',
            price: Number(inv.totalAmount ?? 0),
            descripcion: '',
            peso: 0,
            consolidacion: isConsolidado,
            permisos: false,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceAmountUSD: inv.totalAmount,
            invoiceAmountCRC: (inv as any).totalAmountCRC,
          });
        }
      });

      if (rows.length === 0) {
        win.close();
        return;
      }

      const html = buildRouteManifestHTML(rows, routeFilter, manifestFilter, Number(tc));
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
  }, [filteredInvoices, manifestFilter, routeFilter, toast, t]);

  const handleBulkSendEmail = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    setBulkSending(true);
    setBulkProgress({ done: 0, total: ids.length });
    let done = 0;
    let sentOk = 0;
    const errors: Array<{ id: string; error: string; invoiceNumber?: string }> = [];

    // During the loop: skip individual SP2 invoice sync to avoid firing N concurrent CF calls.
    // SP1 package status updates still run per-invoice.
    const perInvoiceOpts = emailSendOptions.syncSp2
      ? { ...emailSendOptions, syncSp2: false, updatePackages: true }
      : emailSendOptions;

    const sentIds: string[] = [];
    const CONCURRENCY_LIMIT = 6;
    let currentIndex = 0;

    const runWorker = async () => {
      while (currentIndex < ids.length) {
        const itemIndex = currentIndex++;
        const id = ids[itemIndex];
        const inMemInv = invoicesById.get(id);

        try {
          if (inMemInv && (inMemInv.status === 'annulled' || inMemInv.status === 'cancelled')) {
            errors.push({
              id,
              error: `Factura ${inMemInv.invoiceNumber || id} se encuentra ${inMemInv.status === 'annulled' ? 'anulada' : 'cancelada'}.`,
              invoiceNumber: inMemInv.invoiceNumber,
            });
          } else {
            await handleSendEmail(id, perInvoiceOpts, inMemInv, {
              skipCacheInvalidation: true,
              skipToast: true,
            });
            sentIds.push(id);
            sentOk++;
          }
        } catch (err: any) {
          errors.push({
            id,
            error: err instanceof Error ? err.message : 'Error al enviar correo',
            invoiceNumber: inMemInv?.invoiceNumber,
          });
        } finally {
          done++;
          setBulkProgress({ done, total: ids.length });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_LIMIT, ids.length) },
      () => runWorker()
    );
    await Promise.all(workers);

    // Single batch SP2 invoice sync after all emails are sent.
    // AWAITED so the bulk action only resolves once SmartWeb has stamped the
    // invoices (`smartwebSynced`/`smartwebSyncedAt`) and SP1 packages have been
    // promoted to `processed`.
    let syncSummary: { ok: boolean; created: number; updated: number; errors: number } | null = null;
    let syncFailed = false;
    let syncErrorMsg = '';
    let noSlCodeCount = 0;
    if (emailSendOptions.syncSp2 && sentIds.length > 0) {
      const toSync = (invoices as InvoiceRecord[])
        .filter(inv => inv.id && sentIds.includes(inv.id))
        .map(inv => ({ ...inv, status: 'sent' as const }));

      const { eligible, noSlCode } = previewSyncInvoices(toSync);
      noSlCodeCount = noSlCode.length;

      const toSyncToSp2 = eligible.concat(noSlCode);

      if (toSyncToSp2.length > 0) {
        try {
          const res = await syncInvoicesToSp2(toSyncToSp2);
          syncSummary = {
            ok: res.ok,
            created: res.summary.created,
            updated: res.summary.updated,
            errors: res.summary.errors,
          };
          
          // Live update in memory
          const syncedAt = new Date().toISOString();
          const succeededIds = new Set(
            res.results
              .filter(r => r.outcome === 'created' || r.outcome === 'updated')
              .map(r => r.invoiceId),
          );
          if (succeededIds.size > 0) {
            setLiveInvoiceData(prev => {
              const next = new Map(prev);
              for (const id of succeededIds) {
                const ex = next.get(id) || {};
                next.set(id, {
                  ...ex,
                  smartwebSynced: true,
                  smartwebSyncedAt: syncedAt
                });
              }
              return next;
            });
          }

          // Log each sync result to system logs
          if (res.results) {
            for (const r of res.results) {
              logAction({
                userId: user?.id ?? 'unknown',
                userName: user?.fullName,
                userEmail: user?.email,
                userRole: user?.role,
                action: 'invoice_updated',
                category: 'invoice',
                resource: '/invoices',
                resourceId: r.invoiceId,
                result: r.outcome === 'error' ? 'error' : 'success',
                errorMessage: r.outcome === 'error' ? r.reason : undefined,
                metadata: {
                  invoiceNumber: r.invoiceNumber,
                  syncOutcome: r.outcome,
                  syncReason: r.reason,
                  shipmentLinks: r.shipmentLinks,
                  note: `Sincronización automática de factura con SmartWeb posterior a envío de correo: ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`
                }
              });
            }
          }

          if (!res.ok || res.summary.errors > 0) {
            toast({
              title: 'Error Parcial de Sincronización',
              description: `Algunas facturas no se sincronizaron con SmartWeb (${res.summary.errors} error[es]). Usa "Sync SmartWeb" para reintentar.`,
              variant: 'destructive',
            });
          }
        } catch (err: any) {
          syncFailed = true;
          syncErrorMsg = err instanceof Error ? err.message : String(err);
          console.warn('[bulk-invoice-sync-sp2]', err);
          toast({
            title: 'Error de Red (SmartWeb)',
            description: `Fallo al sincronizar con el portal: ${syncErrorMsg}. Usa "Sync SmartWeb" para reintentar.`,
            variant: 'destructive',
          });
        }
      }

      if (noSlCodeCount > 0) {
        toast({
          title: 'Aviso de Sincronización',
          description: `${noSlCodeCount} factura(s) sin SL Code se crearon en SmartWeb sin vínculo a usuario.`,
        });
      }
    }

    // Refresh React Query caches ONCE at the end of the batch
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
    queryClient.invalidateQueries({ queryKey: ['packages'] });

    setBulkSending(false);
    setBulkProgress(null);
    setSelectedIds(new Set());

    // Compose a single rich summary toast
    const parts: string[] = [`${sentOk} email(s) enviado(s)`];
    if (errors.length) parts.push(`${errors.length} error(es)`);
    if (syncSummary) {
      const synced = syncSummary.created + syncSummary.updated;
      parts.push(`SmartWeb: ${synced} sincronizada(s)${syncSummary.errors > 0 ? `, ${syncSummary.errors} error(es)` : ''}`);
    } else if (syncFailed) {
      parts.push('SmartWeb: falló');
    }
    toast({
      title: sentOk > 0 && !syncFailed ? t('common.success') : t('common.error'),
      description: parts.join(' · '),
      variant: errors.length > 0 && sentOk === 0 ? 'destructive' : undefined,
    });
  }, [selectedIds, emailSendOptions, invoices, invoicesById, toast, t, queryClient, user]);

  // ── Bulk strip rounding ─────────────────────────────────────────────────
  const handleBulkStripRounding = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkStripping(true);
    setBulkProgress({ done: 0, total: selectedIds.size });
    const ids = Array.from(selectedIds);
    let done = 0;
    const errors: string[] = [];
    for (const invoiceId of ids) {
      try {
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) { done++; setBulkProgress({ done, total: ids.length }); continue; }
        const novaItems: any[] = (invoice as any).items ?? [];
        const spItems = invoice.invoiceItems ?? [];
        const allItems = spItems.length > 0
          ? spItems
          : novaItems.map((i: any) => ({
            trackingNumber: i.tracking ?? '',
            description: i.description ?? '',
            weight: i.weight ?? 0,
            unitPrice: i.amount ?? i.subtotal ?? 0,
            quantity: 1,
            packageId: undefined,
            isManual: false,
          }));
        const trackings = allItems.map((i: any) => (i.trackingNumber || '')).filter(Boolean) as string[];
        const weightMap = new Map<string, number>();
        if (trackings.length > 0) {
          const chunks: string[][] = [];
          for (let j = 0; j < trackings.length; j += 30) chunks.push(trackings.slice(j, j + 30));
          await Promise.all(chunks.map(async chunk => {
            const snap = await getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)));
            snap.forEach(d => {
              const data = d.data();
              const actualW = data.peso ?? data.weight;
              if (data.trackingNumber && actualW != null) weightMap.set(data.trackingNumber, Number(actualW));
            });
          }));
        }
        const updatedInvoiceItems = allItems.map((item: any) => ({
          ...item,
          weight: weightMap.get(item.trackingNumber) ?? item.weight ?? 0,
          totalPrice: (item.unitPrice ?? 0) * (item.quantity ?? 1),
        }));
        const updatedNovaItems = novaItems.map((i: any) => ({
          ...i,
          weight: weightMap.get(i.tracking ?? i.trackingNumber ?? '') ?? i.weight ?? 0,
        }));
        const newTotalWeight = updatedInvoiceItems.reduce((s: number, i: any) => s + (i.weight ?? 0), 0);
        await firestoreApi.invoices.update(invoiceId, {
          invoiceItems: updatedInvoiceItems,
          ...(updatedNovaItems.length > 0 ? { items: updatedNovaItems } : {}),
          totalWeight: newTotalWeight,
        } as any);
        done++;
      } catch {
        errors.push(invoiceId);
        done++;
      }
      setBulkProgress({ done, total: ids.length });
    }
    setBulkStripping(false);
    setBulkProgress(null);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
    toast({
      title: done > errors.length ? t('common.success') : t('common.error'),
      description: `${done - errors.length} factura(s) sin redondeo${errors.length ? `, ${errors.length} error(es)` : ''}`,
      variant: errors.length && done === errors.length ? 'destructive' : 'default',
    });
  }, [selectedIds, invoices, queryClient, toast, t]);

  // ── Bulk merge ─────────────────────────────────────────────────────────
  const handleBulkMerge = useCallback(async () => {
    if (selectedIds.size < 2) return;
    const ids = Array.from(selectedIds);
    const selected = invoices.filter(inv => ids.includes(inv.id));

    const clientKeys = new Set(selected.map(inv => (inv as any).slCode ?? inv.customerId ?? ''));
    if (clientKeys.size > 1) {
      toast({ title: 'Error', description: 'Todas las facturas deben ser del mismo cliente para fusionar.', variant: 'destructive' });
      return;
    }

    // AI GUARD — NON-DRAFT MERGE BLOCK:
    // Merging non-draft invoices would delete sent/paid records and replace them
    // with a new draft, losing payment history. Only `draft` invoices may be merged.
    const MERGEABLE_STATUSES = new Set(['draft', undefined, null, '']);
    const nonDraft = selected.find(inv => !MERGEABLE_STATUSES.has((inv as any).status ?? ''));
    if (nonDraft) {
      toast({
        title: 'No se puede fusionar',
        description: `La factura ${(nonDraft as any).invoiceNumber ?? nonDraft.id} no está en borrador. Solo se pueden fusionar facturas en estado borrador.`,
        variant: 'destructive',
      });
      return;
    }

    setBulkMerging(true);
    try {
      const sorted = [...selected].sort((a, b) => {
        const da = new Date((a as any).createdAt ?? (a as any).invoiceDate ?? 0).getTime();
        const db2 = new Date((b as any).createdAt ?? (b as any).invoiceDate ?? 0).getTime();
        return db2 - da;
      });
      const base = sorted[0];
      const allItems: any[] = selected.flatMap(inv => (inv as any).items ?? []);
      const allInvoiceItems: any[] = selected.flatMap(inv => inv.invoiceItems ?? []);

      const newAmount = Math.round(selected.reduce((s, inv) => s + (inv.totalAmount ?? 0), 0) * 100) / 100;
      const newSubtotal = Math.round(selected.reduce((s, inv) => s + (inv.subtotalAmount ?? inv.totalAmount ?? 0), 0) * 100) / 100;
      const newTax = Math.round(selected.reduce((s, inv) => s + (inv.taxAmount ?? 0), 0) * 100) / 100;
      const newWeight = selected.reduce((s, inv) => s + ((inv as any).totalWeight ?? 0), 0);
      const newAmountCRC = selected.reduce((s, inv) => s + ((inv as any).amountCRC ?? 0), 0);
      const newSubCRC = selected.reduce((s, inv) => s + ((inv as any).subtotalCRC ?? 0), 0);
      const newIvaCRC = selected.reduce((s, inv) => s + ((inv as any).ivaCRC ?? 0), 0);

      const manifestNums = new Set<string>();
      selected.forEach(inv => {
        if ((inv as any).manifestNumber) manifestNums.add((inv as any).manifestNumber);
        ((inv as any).manifestNumbers ?? []).forEach((m: string) => manifestNums.add(m));
      });

      const slCode = (base as any).slCode ?? '';
      const ts = Date.now().toString().slice(-9);
      const newInvoiceNumber = `${slCode}${ts}-MERGE`;
      const now = new Date().toISOString();
      const dueDateISO = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString(); })();

      const merged: Record<string, any> = {
        customerId: base.customerId,
        slCode: (base as any).slCode,
        clientName: (base as any).clientName ?? base.customer?.fullName ?? '',
        clientEmail: (base as any).clientEmail ?? base.customer?.email ?? '',
        clientDni: (base as any).clientDni ?? '',
        clientRoute: (base as any).clientRoute ?? base.customer?.ruta ?? '',
        customer: base.customer,
        userId: (base as any).userId ?? '',
        clientId: (base as any).clientId ?? base.customerId,
        invoiceNumber: newInvoiceNumber,
        status: 'draft' as const,
        source: (base as any).source ?? 'manual',
        items: allItems,
        invoiceItems: allInvoiceItems.length > 0 ? allInvoiceItems : undefined,
        totalAmount: newAmount,
        subtotalAmount: newSubtotal,
        taxAmount: newTax,
        amount: newAmount,
        subtotal: newSubtotal,
        iva: newTax,
        ivaEnabled: (base as any).ivaEnabled ?? false,
        ivaRate: (base as any).ivaRate ?? 0,
        currency: base.currency ?? '$',
        exchangeRate: (base as any).exchangeRate ?? 0,
        amountCRC: newAmountCRC,
        subtotalCRC: newSubCRC,
        ivaCRC: newIvaCRC,
        totalWeight: newWeight,
        packageCount: allInvoiceItems.length || allItems.length,
        isConsolidation: selected.some(inv => !!(inv as any).isConsolidation),
        manifestNumber: manifestNums.size === 1 ? Array.from(manifestNums)[0] : undefined,
        manifestNumbers: Array.from(manifestNums),
        notes: `Fusión de: ${selected.map(i => i.invoiceNumber).join(', ')}`,
        invoiceDate: base.invoiceDate ?? now,
        dueDate: dueDateISO,
        createdAt: now,
        updatedAt: now,
      };
      Object.keys(merged).forEach(k => merged[k] === undefined && delete merged[k]);

      // Atomic: create merged invoice first, then delete originals.
      // The non-draft guard above ensures only draft invoices reach this point.
      // AI GUARD: NEVER reorder — create MUST succeed before delete runs.
      await addDoc(collection(db, 'invoices'), merged);
      for (const id of ids) {
        const inv = invoices.find(i => i.id === id);
        await deleteDoc(doc(db, 'invoices', id));
        if (inv?.smartwebSynced) {
          await deleteInvoiceFromSp2(id, inv.invoiceNumber || id);
        }
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      toast({ title: 'Facturas fusionadas', description: `${ids.length} facturas combinadas en ${newInvoiceNumber}` });
    } catch (err) {
      toast({ title: 'Error al fusionar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setBulkMerging(false);
    }
  }, [selectedIds, invoices, queryClient, toast]);

  // ── Bulk status update ─────────────────────────────────────────────────
  const handleBulkStatusUpdate = useCallback(async (
    newStatus: InvoiceStatus,
    opts: { syncSp2?: boolean; updatePackages?: boolean; includeAnnulled?: boolean } = {},
  ) => {
    if (selectedIds.size === 0) return;

    const allIds = Array.from(selectedIds);
    let ids = allIds;
    let skippedAnnulledCount = 0;

    if (!opts.includeAnnulled) {
      ids = allIds.filter(id => {
        const inv = invoices.find(i => i.id === id);
        const isAnnulled = inv?.status === 'annulled' || inv?.status === 'cancelled';
        if (isAnnulled) {
          skippedAnnulledCount++;
          return false;
        }
        return true;
      });
    }

    if (ids.length === 0) {
      toast({
        title: "Acción omitida",
        description: `Las ${skippedAnnulledCount} factura(s) seleccionada(s) están en estado Anulada/Cancelada y fueron omitidas por seguridad.`,
        variant: "default",
      });
      setSelectedIds(new Set());
      return;
    }

    setBulkUpdatingStatus(true);
    setBulkProgress({ done: 0, total: ids.length });

    // Batch optimistic UI update to make the status change instant and reactive,
    // preserving existing clientRoute and customer objects.
    setLiveInvoiceData(prev => {
      const next = new Map(prev);
      for (const id of ids) {
        const invObj = invoices.find(i => i.id === id);
        const ex = next.get(id) || invObj || {};
        next.set(id, { ...ex, status: newStatus });
      }
      return next;
    });

    queryClient.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((inv: any) => ids.includes(inv.id) ? { ...inv, status: newStatus } : inv)
      };
    });

    let done = 0;
    const errors: string[] = [];
    const bulkChangedAt = new Date().toISOString();
    for (const id of ids) {
      try {
        await firestoreApi.invoices.update(id, { status: newStatus } as any);
        // Append to statusHistory (best-effort, non-blocking) — mirrors
        // handleStatusChange so bulk and single-invoice flows leave the same
        // audit trail.
        updateDoc(doc(db, 'invoices', id), {
          statusHistory: arrayUnion({
            status: newStatus,
            changedAt: bulkChangedAt,
            changedBy: user?.id || 'admin',
            reason: 'Bulk status update',
          }),
        }).catch(err => console.warn('[handleBulkStatusUpdate] statusHistory update failed:', id, err));
        const bInv = invoices.find(i => i.id === id);
        
        logAction({
          userId: user?.id ?? 'unknown',
          userName: user?.fullName,
          userEmail: user?.email,
          userRole: user?.role,
          action: 'invoice_updated',
          category: 'invoice',
          resource: '/invoices',
          resourceId: id,
          result: 'success',
          metadata: {
            invoiceNumber: (bInv as any)?.invoiceNumber ?? id,
            status: newStatus,
            previousStatus: bInv?.status,
            bulk: true,
            note: `Estado de factura cambiado a ${newStatus} por actualización masiva`
          },
        });

        if (opts.syncSp2 !== false) {
          pushStatusToSp2(id, (bInv as any)?.invoiceNumber ?? id, newStatus);
        }
        // When bulk-marked sent: update linked packages to 'processed' (Facturado) in SP1 + sync SP2
        if (newStatus === 'sent' && opts.updatePackages !== false) {
          firebaseApi.invoices.getById(id).then((resp: any) => {
            const fullInv = resp.success ? resp.data : null;
            if (fullInv) syncInvoicePackagesToSp2(fullInv, 'processed').catch(err =>
              console.warn('[invoice-pkg-sync][bulk-sent]', err),
            );
          }).catch(() => { });
        }
        // When bulk-marked paid: update linked packages to 'on_route' in SP1 + sync SP2
        if (newStatus === 'paid' && opts.updatePackages !== false) {
          firebaseApi.invoices.getById(id).then((resp: any) => {
            const fullInv = resp.success ? resp.data : null;
            if (fullInv) syncInvoicePackagesToSp2(fullInv, 'on_route').catch(err =>
              console.warn('[invoice-pkg-sync][bulk-paid]', err),
            );
          }).catch(() => { });
        }
      } catch {
        errors.push(id);
      }
      done++;
      setBulkProgress({ done, total: ids.length });
    }
    setBulkUpdatingStatus(false);
    setBulkProgress(null);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
    const skippedMsg = skippedAnnulledCount > 0 ? ` (${skippedAnnulledCount} anulada(s) omitida(s))` : '';
    toast({
      title: errors.length === 0 ? t('common.success') : t('common.error'),
      description: `${ids.length - errors.length} factura(s) actualizadas${skippedMsg}${errors.length ? `, ${errors.length} error(es)` : ''}`,
      variant: errors.length && errors.length === ids.length ? 'destructive' : 'default',
    });
  }, [selectedIds, invoices, user?.id, queryClient, toast, t]);

  const getStatusColor = (status: InvoiceStatus) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "sent": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "paid": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "overdue": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
      case "cancelled": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
      case "annulled": return "bg-muted text-muted-foreground line-through";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const STATUS_DOT: Record<InvoiceStatus, string> = {
    draft: "bg-muted-foreground",
    sent: "bg-blue-500",
    paid: "bg-emerald-500",
    overdue: "bg-amber-500",
    cancelled: "bg-red-500",
    annulled: "bg-muted-foreground",
    deleted: "bg-destructive/40",
  };

  const getStatusIcon = (status: InvoiceStatus) => {
    switch (status) {
      case "draft":
        return <Clock className="h-4 w-4" />;
      case "sent":
        return <CheckCircle className="h-4 w-4" />;
      case "paid":
        return <CheckCircle className="h-4 w-4" />;
      case "overdue":
        return <AlertCircle className="h-4 w-4" />;
      case "cancelled":
        return <AlertCircle className="h-4 w-4" />;
      case "annulled":
        return <X className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const formatCurrency = (amount: number, currencyCode: string = "USD") => {
    const currencySymbols: Record<string, string> = {
      USD: "$",
      EUR: "€",
      GBP: "£",
      CRC: "₡",
      MXN: "$",
      CAD: "C$",
      AUD: "A$",
    };

    const symbol = currencySymbols[currencyCode] || currencyCode;
    const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
    return `${symbol} ${safeAmount.toFixed(2)} ${currencyCode}`;
  };

  const handleSuggestAIService = useCallback(async () => {
    if (!editingInvoice) return;
    setIsSuggesting(true);
    try {
      const slCode = (editingInvoice as any).slCode || (editingInvoice as any).clientSlCode || editingInvoice.customerId;
      if (!slCode || slCode.startsWith('__')) {
        toast({ title: "Sin código SL", description: "No se puede sugerir servicio para un cliente sin código SL.", variant: "default" });
        return;
      }

      const customerName = (editingInvoice.clientName ?? editingInvoice.customer?.fullName ?? "");
      const suggestion = await getCustomerServiceSuggestion(slCode, customerName);
      if (!suggestion) {
        toast({ title: "Sin historial", description: "No hay suficiente historial de servicios para este cliente.", variant: "default" });
        return;
      }

      const cleanDesc = suggestion.description.trim() || "SERVICIO DE TERCERO";

      setEditItems(prev => [
        ...prev,
        {
          trackingNumber: '',
          description: cleanDesc,
          weight: 0,
          unitPrice: suggestion.amount,
          quantity: 1,
          isManual: true,
          currency: 'USD'
        }
      ]);

      const sourceLabel = suggestion.aiEnhanced
        ? `IA · ${suggestion.occurrences} facturas anteriores`
        : `${suggestion.occurrences} facturas anteriores`;
      toast({
        title: "Servicio sugerido agregado",
        description: `${cleanDesc} — $${suggestion.amount.toFixed(2)} (${sourceLabel})`,
      });
    } catch (err) {
      toast({ title: "Error al sugerir servicio", description: String(err), variant: "destructive" });
    } finally {
      setIsSuggesting(false);
    }
  }, [editingInvoice, toast]);

  const handleSuggestAIQuick = useCallback(async (invoice: Invoice) => {
    setSuggestingAIQuickId(invoice.id);
    try {
      const slCode = (invoice as any).slCode || (invoice as any).clientSlCode || invoice.customerId;
      if (!slCode || slCode.startsWith('__')) {
        toast({ title: "Sin código SL", description: "No se puede sugerir servicio para un cliente sin código SL.", variant: "default" });
        return;
      }

      const customerName = (invoice.clientName ?? invoice.customer?.fullName ?? "");
      const suggestion = await getCustomerServiceSuggestion(slCode, customerName);
      if (!suggestion) {
        toast({ title: "Sin historial", description: "No hay suficiente historial de servicios para este cliente.", variant: "default" });
        return;
      }

      const cleanDesc = suggestion.description.trim() || "SERVICIO DE TERCERO";

      // Update invoice in firestore
      const latestSnap = await getDoc(doc(db, 'invoices', invoice.id));
      if (!latestSnap.exists()) return;
      const invData = latestSnap.data();
      const newItems = [...(invData.invoiceItems ?? invData.items ?? [])];

      newItems.push({
        trackingNumber: '',
        description: cleanDesc,
        weight: 0,
        unitPrice: suggestion.amount,
        quantity: 1,
        totalPrice: suggestion.amount,
        isManual: true,
        currency: 'USD'
      });

      const totalAmount = newItems.reduce((acc: number, item: any) => {
        return acc + (Number(item.totalPrice ?? item.unitPrice ?? item.amount) || 0);
      }, 0);

      const ivaEnabled = invData.ivaEnabled ?? false;
      const subtotal = ivaEnabled ? Math.round(totalAmount / 1.13 * 100) / 100 : totalAmount;
      const iva = ivaEnabled ? Math.round((totalAmount - subtotal) * 100) / 100 : 0;

      const tc = Number(invData.exchangeRate) || 0;
      const amountCRC = tc > 0 ? Math.round(totalAmount * tc) : 0;

      await updateDoc(doc(db, 'invoices', invoice.id), {
        invoiceItems: newItems,
        totalAmount,
        subtotalAmount: subtotal,
        taxAmount: iva,
        amount: totalAmount,
        subtotal: subtotal,
        iva: iva,
        amountCRC,
        updatedAt: new Date().toISOString(),
      });

      const sourceLabel = suggestion.aiEnhanced
        ? `IA · ${suggestion.occurrences} facturas anteriores`
        : `${suggestion.occurrences} facturas anteriores`;
      toast({
        title: "Servicio agregado a factura",
        description: `${cleanDesc} — $${suggestion.amount.toFixed(2)} (${sourceLabel})`,
      });
      // Invalidate the cache to show updated UI
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
    } catch (err) {
      toast({ title: "Error al sugerir servicio", description: String(err), variant: "destructive" });
    } finally {
      setSuggestingAIQuickId(null);
    }
  }, [toast, queryClient]);

  const handleOpenEditModal = async (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setEditStatus(invoice.status);
    setEditDiscountPercentage(invoice.discountPercentage ?? 0);
    setEditNotes(invoice.notes ?? "");
    setEditInternalNotes("");
    setEditCurrency(invoice.currency ?? "USD");
    const dueDateStr = invoice.dueDate
      ? (typeof invoice.dueDate === 'string'
        ? invoice.dueDate
        : (invoice.dueDate as any)?.toDate?.()?.toISOString?.() ?? String(invoice.dueDate))
      : "";
    setEditDueDate(dueDateStr ? dueDateStr.slice(0, 10) : "");
    setEditClientName(invoice.clientName ?? invoice.customer?.fullName ?? "");
    setEditClientEmail(invoice.clientEmail ?? invoice.customer?.email ?? "");
    setEditClientPhone(invoice.clientPhone ?? invoice.customer?.phone ?? "");
    setEditClientDni(invoice.clientDni ?? "");
    setEditManifestNumber(invoice.manifestNumber ?? "");
    setEditPaymentMethod("");
    // Fetch fresh full document so invoiceItems is never missing from list cache
    let fullInvoice: any = invoice;
    try {
      const snap = await getDoc(doc(db, 'invoices', invoice.id));
      if (snap.exists()) fullInvoice = { id: snap.id, ...snap.data() };
    } catch { /* fall back to list data */ }
    // Resolve exchange rate: top-level field first, then derive from amountCRC
    const resolvedTC =
      Number(fullInvoice.exchangeRate) ||
      (Number(fullInvoice.totalAmount) > 0 && fullInvoice.amountCRC
        ? Math.round(fullInvoice.amountCRC / Number(fullInvoice.totalAmount) * 100) / 100
        : 0);
    setEditExchangeRate(resolvedTC);
    setEditOriginalExchangeRate(resolvedTC);
    setEditTcAlsoPackages(true);
    const pkgIds = (fullInvoice.invoiceItems ?? [])
      .map((i: any) => i.packageId)
      .filter((id: any): id is string => !!id);
    setEditPackages(pkgIds);
    const novaItems: any[] = fullInvoice.items ?? [];
    const spItems: any[] = fullInvoice.invoiceItems ?? [];
    const mergedItems = spItems.length > 0 ? spItems.map((i: any) => ({
      trackingNumber: i.trackingNumber ?? '',
      description: i.description ?? '',
      weight: i.weight ?? 0,
      unitPrice: i.unitPrice ?? i.totalPrice ?? 0,
      quantity: i.quantity ?? 1,
      packageId: i.packageId,
      isManual: i.isManual,
      currency: (i.currency === 'CRC' ? 'CRC' : 'USD') as 'USD' | 'CRC',
      requiresPermit: !!(i.requiresPermit || i.package?.requiresPermit),
    })) : novaItems.map((i: any) => ({
      trackingNumber: i.tracking ?? '',
      description: i.description ?? '',
      weight: i.weight ?? 0,
      unitPrice: i.amount ?? i.subtotal ?? 0,
      quantity: 1,
      packageId: undefined,
      isManual: false,
      currency: 'USD' as 'USD' | 'CRC',
    }));
    setEditItems(mergedItems);
    const trackings = mergedItems.map(i => i.trackingNumber).filter(Boolean) as string[];
    if (trackings.length > 0) {
      const newMap = new Map<string, number>();
      const manifestSet = new Set<string>();
      const chunks: string[][] = [];
      for (let i = 0; i < trackings.length; i += 30) chunks.push(trackings.slice(i, i + 30));
      await Promise.all(chunks.map(async chunk => {
        const snap = await getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)));
        snap.forEach(d => {
          const data = d.data();
          const actualW = data.peso ?? data.weight;
          if (data.trackingNumber && actualW != null) newMap.set(data.trackingNumber, Number(actualW));
          if (data.manifestNumber) manifestSet.add(String(data.manifestNumber));
        });
      }));
      setPkgWeightCache(newMap);
      if (manifestSet.size > 0 && !invoice.manifestNumber) {
        setEditManifestNumber([...manifestSet].join(', '));
      }
    }
  };

  /**
   * Persists changes to an existing invoice document in Firestore.
   *
   * CROSS-MODULE DATA FLOW & INTEGRITY GUARANTEES:
   * 1. Parallel Field Synchronization: Simultaneously synchronizes SP1 set (`totalAmount`,
   *    `subtotalAmount`, `trackingNumbers`) and Nova set (`amount`, `subtotal`, `items`)
   *    so downstream consumers and SP2 push syncs never read stale totals.
   * 2. Atomic Exchange Rate Propagation: If the operator updated the invoice exchange rate
   *    and chose `editTcAlsoPackages: true`, iterates through linked packages in batches of
   *    $\le 400$ operations using `writeBatch(db)` to keep under Firestore's 500-op hard limit.
   * 3. External Item Preservation: Re-reads the latest Firestore document before write to merge
   *    any manual items appended concurrently by other operators in Encomiendas.
   * 4. Multi-Manifest Linkage: Derives `manifestNumbers` set from all package tracking numbers.
   */
  const handleSaveEditInvoice = async () => {
    if (!editingInvoice) return;
    try {
      const toUSD = (price: number, currency?: 'USD' | 'CRC') =>
        currency === 'CRC' && editExchangeRate > 0
          ? Math.round(price / editExchangeRate * 100) / 100
          : price;
      // Re-fetch the latest Firestore state and preserve any isManual items
      // that were added externally while this modal was open (e.g. via
      // "Agregar a factura" in EncomiendaManifests). Without this, a save
      // would silently overwrite those items with the stale editItems snapshot.
      let externalManualItems: any[] = [];
      try {
        const latestSnap = await getDoc(doc(db, 'invoices', editingInvoice.id));
        if (latestSnap.exists()) {
          const firestoreItems: any[] = latestSnap.data().invoiceItems ?? [];
          const editKeys = new Set(editItems.map(i => `${i.trackingNumber ?? ''}|${i.description}`));
          externalManualItems = firestoreItems.filter(
            (fi: any) => fi.isManual && !editKeys.has(`${fi.trackingNumber ?? ''}|${fi.description}`)
          );
        }
      } catch { /* non-fatal — proceed with editItems only */ }

      const updatedInvoiceItems = [
        ...editItems.map(i => ({
          packageId: i.packageId || undefined,
          trackingNumber: i.trackingNumber || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: toUSD(i.unitPrice, i.currency),
          totalPrice: Math.round(toUSD(i.unitPrice, i.currency) * i.quantity * 100) / 100,
          weight: i.weight,
          isManual: i.isManual ?? false,
          currency: i.currency ?? 'USD',
          requiresPermit: i.requiresPermit ?? false,
        })),
        ...externalManualItems,
      ];
      const hasPermitItems = updatedInvoiceItems.some(i => i.requiresPermit);
      const updatedNovaItems = editItems.map(i => ({
        tracking: i.trackingNumber,
        description: i.description,
        weight: i.weight,
        amount: i.unitPrice,
        subtotal: i.unitPrice,
        iva: 0,
        currency: editCurrency,
      }));
      const newSubtotal = editItems.reduce((s, i) => s + toUSD(i.unitPrice, i.currency) * i.quantity, 0);
      const newTotalWeight = editItems.reduce((s, i) => s + i.weight, 0);
      const discountAmt = Math.round(newSubtotal * (editDiscountPercentage / 100) * 100) / 100;
      const newTotal = Math.round((newSubtotal - discountAmt) * 100) / 100;
      // Derive manifest numbers from package trackings
      const editTrackings = editItems.map(i => i.trackingNumber).filter(Boolean) as string[];
      const derivedManifests = new Set<string>();
      const pkgSnapDocs: Array<{ id: string }> = [];
      if (editTrackings.length > 0) {
        const mChunks: string[][] = [];
        for (let i = 0; i < editTrackings.length; i += 30) mChunks.push(editTrackings.slice(i, i + 30));
        await Promise.all(mChunks.map(async chunk => {
          const snap = await getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)));
          snap.forEach(d => { pkgSnapDocs.push(d); const mn = d.data().manifestNumber; if (mn) derivedManifests.add(String(mn)); });
        }));
      }
      const finalManifestNumber = editManifestNumber || [...derivedManifests][0] || undefined;
      const finalManifestNumbers = derivedManifests.size > 0 ? [...derivedManifests] : undefined;

      // Category guard: do not allow regular invoices to be assigned to permit manifests or vice-versa
      if (finalManifestNumber) {
        const targetIsPermit = finalManifestNumber.toUpperCase().endsWith('DANP') || finalManifestNumber.toUpperCase().includes('PERMISO') || finalManifestNumber.toUpperCase().includes('PERMIT');
        if (hasPermitItems && !targetIsPermit) {
          throw new Error('Esta factura contiene items de permisos y no puede asignarse a un manifiesto regular.');
        }
        if (!hasPermitItems && targetIsPermit) {
          throw new Error('Esta factura contiene items regulares y no puede asignarse a un manifiesto de permisos (DANP).');
        }
      }

      const statusChanged = editStatus !== editingInvoice.status;

      // ── BUG-NOVA-STALE FIX 2026-05-15 ───────────────────────────────────
      // SP1 invoices have TWO parallel sets of total/tracking fields:
      //   • SP1 set:   totalAmount, subtotalAmount, taxAmount, trackingNumbers
      //   • Nova set:  amount,      subtotal,       iva,       (also trackingNumbers)
      // The sync layer (`pushInvoiceStatusToSP2` + `buildPayload`) reads with
      //   `a.amount ?? a.totalAmount`  — i.e. Nova WINS when present.
      // Historically the edit form only updated the SP1 set, so after every
      // edit the Nova fields kept their pre-edit values and propagated wrong
      // totals to SP2. Same for `trackingNumbers` which never got recomputed
      // when items were removed, leaving SP2 with phantom trackings.
      // We now derive every parallel/legacy field from the post-edit items.
      const newTrackingNumbers = Array.from(new Set(
        updatedInvoiceItems
          .map((i: any) => i.trackingNumber || i.tracking)
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0),
      ));
      const newPackageCount = newTrackingNumbers.length;
      const newPrimaryTracking = newTrackingNumbers.length === 1 ? newTrackingNumbers[0] : undefined;

      await firebaseApi.invoices.update(editingInvoice.id, {
        ...(statusChanged ? { status: editStatus } : {}),
        invoiceItems: updatedInvoiceItems,
        items: updatedNovaItems,
        totalAmount: newTotal,
        subtotalAmount: newSubtotal,
        discountAmount: discountAmt,
        discountPercentage: editDiscountPercentage,
        totalWeight: newTotalWeight,
        currency: editCurrency,
        // Nova-style parallel fields — must stay aligned with SP1 set, see
        // BUG-NOVA-STALE FIX note above.
        amount: newTotal,
        subtotal: newSubtotal,
        iva: 0,
        // Tracking metadata derived from the final item set so SP2 never sees
        // stale phantom trackings from items the operator removed.
        trackingNumbers: newTrackingNumbers,
        trackingNumber: newPrimaryTracking,
        packageCount: newPackageCount,
        dueDate: editDueDate || undefined,
        notes: editNotes || undefined,
        internalNotes: editInternalNotes || undefined,
        clientName: editClientName || undefined,
        clientEmail: editClientEmail || undefined,
        clientPhone: editClientPhone || undefined,
        clientDni: editClientDni || undefined,
        manifestNumber: finalManifestNumber,
        manifestNumbers: finalManifestNumbers,
        hasPermitItems,
        paymentMethod: editPaymentMethod || undefined,
        paymentReference: editPaymentReference || undefined,
        exchangeRate: editExchangeRate > 0 ? editExchangeRate : undefined,
        // Full CRC triplet — recompute so subtotal/iva stay aligned with total.
        // Without this the invoice doc drifts: amountCRC reflects new TC while
        // subtotalCRC/ivaCRC stay at the pre-edit TC, tripping the short-circuit
        // in updateInvoicesExchangeRate on the next save.
        ...(editExchangeRate > 0
          ? recomputeInvoiceCRC(
            { totalAmount: newTotal, ivaEnabled: (editingInvoice as any).ivaEnabled },
            editExchangeRate,
          )
          : {}),
      } as any);

      // Sync packages + manifests collection when manifestNumber changes
      const oldManifest = editingInvoice.manifestNumber;
      if (finalManifestNumber && finalManifestNumber !== oldManifest && pkgSnapDocs.length > 0) {
        const now = new Date().toISOString();
        const pkgBatch = writeBatch(db);
        let pkgOps = 0;
        pkgSnapDocs.forEach((d: any) => {
          pkgBatch.update(doc(db, 'packages', d.id), {
            manifestNumber: finalManifestNumber,
            updatedManifest: finalManifestNumber,
            manifestUpdatedAt: now,
          });
          pkgOps++;
        });
        if (pkgOps > 0) await pkgBatch.commit();
        if (oldManifest) {
          await movePackagesBetweenManifestDocs(editTrackings, oldManifest, finalManifestNumber, [editingInvoice.id]).catch(() => { });
        }
      }

      // ── Propagate TC change to linked packages (opt-in) ──────────────────
      // When the operator corrected the invoice TC AND chose "Aplicar a
      // paquetes", rewrite `exchangeRate` + recomputed `costCRC` on every
      // package linked to this invoice. Status fields are NEVER touched —
      // TC correction is a data fix, not a state transition. Scope is this
      // invoice's packages only; for manifest-wide corrections the operator
      // uses Nova's 4th dialog button.
      const tcChanged = editOriginalExchangeRate > 0
        && editExchangeRate > 0
        && Math.abs(editExchangeRate - editOriginalExchangeRate) >= 0.01;
      if (tcChanged && editTcAlsoPackages && pkgSnapDocs.length > 0) {
        try {
          const now = new Date().toISOString();
          const BATCH_CAP = 400;
          let tcOps = 0;
          // Chunk at 400 ops to stay under Firestore's 500-op batch limit.
          // A consolidated invoice with many packages would otherwise blow
          // past the hard limit and reject the whole write.
          for (let i = 0; i < pkgSnapDocs.length; i += BATCH_CAP) {
            const chunk = pkgSnapDocs.slice(i, i + BATCH_CAP);
            const tcBatch = writeBatch(db);
            chunk.forEach((d: any) => {
              const data = d.data?.() ?? {};
              const cost = Number(data.cost ?? data.price ?? 0);
              const costCRC = Number.isFinite(cost) && cost > 0
                ? Math.round(cost * editExchangeRate)
                : 0;
              tcBatch.update(doc(db, 'packages', d.id), {
                exchangeRate: editExchangeRate,
                costCRC,
                exchangeRateUpdatedAt: now,
                exchangeRateUpdatedBy: 'invoice_edit',
                exchangeRateUpdateReason: `TC correction from invoice ${editingInvoice.invoiceNumber} edit`,
              });
              tcOps++;
            });
            await tcBatch.commit();
          }
          if (tcOps > 0) {
            console.info(
              `[InvoiceEdit] propagated TC ₡${editExchangeRate.toLocaleString('es-CR')} to ${tcOps} linked package(s)`,
            );
          }
        } catch (tcErr) {
          // Non-blocking — invoice save already succeeded; package sync is
          // a best-effort alignment step.
          console.warn('[InvoiceEdit] package TC propagation failed:', tcErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', editingInvoice.id] });
      setEditingInvoice(null);

      // Sync the updated invoice to SP2
      try {
        const updatedSelf = {
          ...editingInvoice,
          status: statusChanged ? editStatus : editingInvoice.status,
          invoiceItems: updatedInvoiceItems,
          items: updatedNovaItems,
          totalAmount: newTotal,
          subtotalAmount: newSubtotal,
          discountAmount: discountAmt,
          discountPercentage: editDiscountPercentage,
          totalWeight: newTotalWeight,
          currency: editCurrency,
        };
        syncInvoicesToSp2([updatedSelf] as any).catch(err => {
          console.warn('[handleSaveEditInvoice] SP2 sync failed:', err);
        });
      } catch (err) {
        console.warn('[handleSaveEditInvoice] SP2 sync preparation failed:', err);
      }

      toast({
        title: t("common.success"),
        description: tcChanged && editTcAlsoPackages && pkgSnapDocs.length > 0
          ? `Factura actualizada · TC propagado a ${pkgSnapDocs.length} paquete${pkgSnapDocs.length !== 1 ? 's' : ''}`
          : 'Factura actualizada',
      });
    } catch (error) {
      console.error("Failed to update invoice:", error);
      toast({ title: t("common.error"), description: "Error al actualizar la factura", variant: "destructive" });
    }
  };

  /**
   * Moves a single item from the currently-editing invoice to another invoice
   * belonging to the same client.  Uses writeBatch for atomic dual-document update.
   *
   * Data accuracy guarantees:
   *  – Target invoice is always fetched fresh from Firestore (no stale cache).
   *  – Both invoiceItems AND items arrays are updated (Nova + SP1 compat).
   *  – Totals (subtotalAmount, discountAmount, totalAmount, totalWeight) are
   *    recalculated from scratch for BOTH invoices.
   *  – CRC prices are converted to USD using the source invoice exchange rate
   *    before being stored on the target (invoices store amounts in USD).
   */
  const handleMoveItem = async (itemIdx: number, targetInvoiceId: string) => {
    if (!editingInvoice) return;
    const item = editItems[itemIdx];
    if (!item) return;
    setMoveItemPopover(null);
    setMovingItemIdx(itemIdx);
    try {
      // ── 1. Fetch target invoice fresh to avoid stale data ───────────
      const targetSnap = await getDoc(doc(db, 'invoices', targetInvoiceId));
      if (!targetSnap.exists()) throw new Error('Factura destino no encontrada.');
      const targetData = targetSnap.data() as any;

      // ── 2. Helpers ──────────────────────────────────────────────────
      const toUSD = (price: number, currency?: string, tc?: number): number =>
        currency === 'CRC' && tc && tc > 0
          ? Math.round(price / tc * 100) / 100
          : price;
      const recalcTotals = (
        spItems: Array<{ unitPrice: number; quantity: number; totalPrice: number; weight?: number }>,
        discountPct: number
      ) => {
        const subtotal = spItems.reduce((s, i) => s + (i.totalPrice ?? i.unitPrice * i.quantity), 0);
        const discountAmt = Math.round(subtotal * (discountPct / 100) * 100) / 100;
        const total = Math.round((subtotal - discountAmt) * 100) / 100;
        const weight = spItems.reduce((s, i) => s + (i.weight ?? 0), 0);
        return { subtotal, discountAmt, total, weight };
      };

      // ── 3. Build item in SP1 format (always store USD) ──────────────
      const itemUnitPriceUSD = toUSD(item.unitPrice, item.currency, editExchangeRate);
      const movedSpItem = {
        packageId: item.packageId ?? undefined,
        trackingNumber: item.trackingNumber || undefined,
        description: item.description,
        quantity: item.quantity,
        unitPrice: itemUnitPriceUSD,
        totalPrice: Math.round(itemUnitPriceUSD * item.quantity * 100) / 100,
        weight: item.weight,
        isManual: item.isManual ?? false,
        currency: 'USD',
        requiresPermit: item.requiresPermit ?? false,
      };
      const movedNovaItem = {
        tracking: item.trackingNumber,
        description: item.description,
        weight: item.weight,
        amount: itemUnitPriceUSD,
        subtotal: itemUnitPriceUSD,
        iva: 0,
        currency: 'USD',
      };

      // ── 4. SOURCE invoice — remove item, recalculate ────────────────
      const newSourceItems = editItems.filter((_, i) => i !== itemIdx);
      const srcSpItems = newSourceItems.map(i => {
        const usdPrice = toUSD(i.unitPrice, i.currency, editExchangeRate);
        return {
          packageId: i.packageId ?? undefined,
          trackingNumber: i.trackingNumber || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: usdPrice,
          totalPrice: Math.round(usdPrice * i.quantity * 100) / 100,
          weight: i.weight,
          isManual: i.isManual ?? false,
          currency: 'USD',
          requiresPermit: i.requiresPermit ?? false,
        };
      });
      const srcNovaItems = newSourceItems.map(i => ({
        tracking: i.trackingNumber,
        description: i.description,
        weight: i.weight,
        amount: toUSD(i.unitPrice, i.currency, editExchangeRate),
        subtotal: toUSD(i.unitPrice, i.currency, editExchangeRate),
        iva: 0,
        currency: 'USD',
      }));
      const srcTotals = recalcTotals(srcSpItems, editDiscountPercentage);

      // ── 5. TARGET invoice — append item, recalculate ────────────────
      const tgtDiscount = Number(targetData.discountPercentage) || 0;
      const tgtSpItems = [...(targetData.invoiceItems ?? []), movedSpItem];
      const tgtNovaItems = [...(targetData.items ?? []), movedNovaItem];
      const tgtTotals = recalcTotals(tgtSpItems, tgtDiscount);

      // ── 6. Atomic batch write ───────────────────────────────────────
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      batch.update(doc(db, 'invoices', editingInvoice.id), {
        invoiceItems: srcSpItems,
        items: srcNovaItems,
        totalAmount: srcTotals.total,
        subtotalAmount: srcTotals.subtotal,
        discountAmount: srcTotals.discountAmt,
        totalWeight: srcTotals.weight,
        updatedAt: now,
      });
      batch.update(doc(db, 'invoices', targetInvoiceId), {
        invoiceItems: tgtSpItems,
        items: tgtNovaItems,
        totalAmount: tgtTotals.total,
        subtotalAmount: tgtTotals.subtotal,
        discountAmount: tgtTotals.discountAmt,
        totalWeight: tgtTotals.weight,
        updatedAt: now,
      });
      await batch.commit();

      // ── 7. Update local UI state ────────────────────────────────────
      setEditItems(newSourceItems);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', editingInvoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoice', targetInvoiceId] });

      // ── 8. Sync BOTH invoices to SP2 ────────────────────────────────
      try {
        const updatedSource = {
          ...editingInvoice,
          invoiceItems: srcSpItems,
          items: srcNovaItems,
          totalAmount: srcTotals.total,
          subtotalAmount: srcTotals.subtotal,
          discountAmount: srcTotals.discountAmt,
          totalWeight: srcTotals.weight,
        };
        const updatedTarget = {
          ...targetData,
          id: targetInvoiceId,
          invoiceItems: tgtSpItems,
          items: tgtNovaItems,
          totalAmount: tgtTotals.total,
          subtotalAmount: tgtTotals.subtotal,
          discountAmount: tgtTotals.discountAmt,
          totalWeight: tgtTotals.weight,
        };
        
        syncInvoicesToSp2([updatedSource, updatedTarget] as any).catch(err => {
          console.warn('[handleMoveItem] SP2 sync failed:', err);
        });
      } catch (err) {
        console.warn('[handleMoveItem] SP2 sync preparation failed:', err);
      }

      const targetInv = invoices.find(i => i.id === targetInvoiceId);
      toast({
        title: 'Item movido correctamente',
        description: `"${item.description || item.trackingNumber || 'Item'}" → ${targetInv?.invoiceNumber ?? targetInvoiceId}`,
      });
    } catch (err) {
      console.error('[InvoiceGen] handleMoveItem error:', err);
      toast({
        title: 'Error al mover el item',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setMovingItemIdx(null);
    }
  };



  const handlePreviewInvoice = useCallback(async (invoiceId: string) => {
    setGeneratingPDFId(invoiceId);

    try {
      // 1. Tier 1: Resolve from in-memory state (0ms, 0 reads)
      let invoiceData: any = invoices.find((inv) => inv.id === invoiceId);

      const hasEmbeddedItems = (inv: any) =>
        (Array.isArray(inv?.invoiceItems) && inv.invoiceItems.length > 0) ||
        (Array.isArray(inv?.items) && inv.items.length > 0);

      // 2. Tier 2: If not in memory or missing embedded items, fetch single document directly via Firestore SDK (<50ms, 1 read)
      if (!invoiceData || !hasEmbeddedItems(invoiceData)) {
        try {
          const docSnap = await getDoc(doc(db, "invoices", invoiceId));
          if (docSnap.exists()) {
            invoiceData = { id: docSnap.id, ...docSnap.data() };
          }
        } catch (fetchErr) {
          console.warn("[handlePreviewInvoice] Direct Firestore getDoc fallback:", fetchErr);
        }
      }

      // 3. Tier 3: Safety net fallback to callable API if needed
      if (!invoiceData) {
        try {
          const invoiceResp = await firebaseApi.invoices.getById(invoiceId);
          if (invoiceResp?.success && (invoiceResp as any)?.data) {
            invoiceData = (invoiceResp as any).data;
          }
        } catch (callErr) {
          console.warn("[handlePreviewInvoice] Callable fallback error:", callErr);
        }
      }

      // 4. Stale list handling (BUG-INV-STALE-LIST)
      if (!invoiceData) {
        queryClient.invalidateQueries({ queryKey: ["invoices-cursor"] });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        throw new Error("Esta factura ya no existe en la base de datos (probablemente fue re-generada). La lista se está actualizando.");
      }

      // 5. Items normalization preserving all metadata (tracking, description, isManual, weights, permits)
      const rawItems = (Array.isArray(invoiceData.invoiceItems) && invoiceData.invoiceItems.length > 0)
        ? invoiceData.invoiceItems
        : (Array.isArray(invoiceData.items) && invoiceData.items.length > 0)
          ? invoiceData.items
          : [];

      const isPermitManifest = ((invoiceData.manifestNumber || '').toUpperCase().includes('DANP'));

      const invoiceItems = rawItems.map((item: any, idx: number) => {
        const trackingNumber = item.trackingNumber || item.tracking || item.package?.trackingNumber || '';
        const isManual = item.isManual === true;
        const requiresPermit = !!(item.requiresPermit || item.isPermiso || item.package?.requiresPermit || isPermitManifest);
        const weight = item.weight != null ? Number(item.weight) : undefined;
        const realWeight = item.realWeight != null ? Number(item.realWeight) : (item.weight != null ? Number(item.weight) : undefined);
        const unitPrice = Number(item.unitPrice ?? item.amount ?? 0);
        const totalPrice = Number(item.totalPrice ?? item.amount ?? (unitPrice * (item.quantity || 1)));
        const exchangeRate = item.package?.exchangeRate || item.exchangeRate || (item.package?.costCRC && item.package?.price ? Math.round(item.package.costCRC / item.package.price) : 0) || 0;

        return {
          id: item.id || `item-${idx}`,
          packageId: item.packageId,
          description: item.description,
          trackingNumber,
          quantity: item.quantity || 1,
          unitPrice,
          totalPrice,
          weight,
          realWeight,
          isManual,
          exchangeRate,
          requiresPermit,
          package: item.package || (trackingNumber ? { trackingNumber, requiresPermit, weight } : undefined),
        };
      });

      // 6. Customer & Route fallback hierarchy
      const isRealSlCode = (c: any) =>
        typeof c === 'string' && /^SL[-_]?[0-9]+/i.test(c.trim());

      const rawSlCode = (
        (isRealSlCode((invoiceData as any).clientSlCode) && (invoiceData as any).clientSlCode) ||
        (isRealSlCode((invoiceData as any).slCode) && (invoiceData as any).slCode) ||
        (isRealSlCode(invoiceData.customer?.slCode) && invoiceData.customer?.slCode) ||
        (isRealSlCode(invoiceData.customerId) && invoiceData.customerId) ||
        (invoiceData as any).clientSlCode ||
        (invoiceData as any).slCode ||
        invoiceData.customer?.slCode ||
        ''
      );

      let contactInfo: CustomerContactInfo | undefined =
        rawSlCode ? customerInfoBySlCode.get(rawSlCode.trim()) : undefined;

      // If contactInfo not in subscriber map and email is missing on invoice, fetch customer record
      if (!contactInfo?.email && !invoiceData.clientEmail && !invoiceData.customer?.email) {
        // Try by SL code / customerId first
        const lookupId = (isRealSlCode(rawSlCode) ? rawSlCode : (isRealSlCode(invoiceData.customerId) ? invoiceData.customerId : '')).trim();
        if (lookupId) {
          try {
            const custSnap = await getDoc(doc(db, "customers", lookupId));
            if (custSnap.exists()) {
              const cd = custSnap.data() as any;
              contactInfo = {
                slCode: cd.slCode || lookupId,
                email: cd.email || cd.correo || '',
                phone: cd.phone || cd.phoneNumber || cd.telefono || '',
                dni: cd.dni || cd.cedula || cd.identificationNumber || '',
                fullName: cd.fullName || cd.nombre || '',
                ruta: cd.ruta || '',
                consolidationEnabled: !!cd.consolidationEnabled,
                electronicInvoiceRequired: !!cd.electronicInvoiceRequired,
                encomiendaServiceName: cd.encomiendaServiceName || '',
              };
            }
          } catch (err) {
            console.warn("[handlePreviewInvoice] Customer lookup by ID fallback:", err);
          }
        }

        // If still no contact info, try by fullName
        const clientName = invoiceData.clientName || invoiceData.customer?.fullName;
        if (!contactInfo?.email && clientName && clientName !== '—') {
          try {
            const qName = query(collection(db, "customers"), where("fullName", "==", clientName.trim()), fsLimit(1));
            const nameSnap = await getDocs(qName);
            if (!nameSnap.empty) {
              const cd = nameSnap.docs[0].data() as any;
              contactInfo = {
                slCode: cd.slCode || nameSnap.docs[0].id,
                email: cd.email || cd.correo || '',
                phone: cd.phone || cd.phoneNumber || cd.telefono || '',
                dni: cd.dni || cd.cedula || cd.identificationNumber || '',
                fullName: cd.fullName || cd.nombre || clientName,
                ruta: cd.ruta || '',
                consolidationEnabled: !!cd.consolidationEnabled,
                electronicInvoiceRequired: !!cd.electronicInvoiceRequired,
                encomiendaServiceName: cd.encomiendaServiceName || '',
              };
            }
          } catch (err) {
            console.warn("[handlePreviewInvoice] Customer lookup by name fallback:", err);
          }
        }
      }

      const customer = {
        id: (isRealSlCode(rawSlCode) ? rawSlCode : '') || contactInfo?.slCode || invoiceData.customerId || '',
        fullName: invoiceData.clientName || contactInfo?.fullName || invoiceData.customer?.fullName || '—',
        email: invoiceData.clientEmail || contactInfo?.email || invoiceData.customer?.email || '',
        phone: invoiceData.clientPhone || contactInfo?.phone || invoiceData.customer?.phone || '',
        slCode: (isRealSlCode(rawSlCode) ? rawSlCode : '') || contactInfo?.slCode || (isRealSlCode(invoiceData.customer?.slCode) ? invoiceData.customer?.slCode : '') || '',
        cedula: invoiceData.clientDni || contactInfo?.dni || invoiceData.customer?.cedula || invoiceData.customer?.identificationNumber || '—',
        ruta: invoiceData.clientRoute || contactInfo?.ruta || invoiceData.customer?.ruta || null,
      };

      // 7. Full SP1InvoiceShape construction
      const transformedInvoice: SP1InvoiceShape = {
        id: invoiceData.id,
        source: invoiceData.source,
        invoiceNumber: invoiceData.invoiceNumber,
        status: invoiceData.status,
        totalAmount: Number(invoiceData.totalAmount || invoiceData.amount || 0),
        subtotalAmount: Number(invoiceData.subtotalAmount || invoiceData.subtotal || 0),
        taxAmount: Number(invoiceData.taxAmount || invoiceData.iva || 0),
        discountAmount: Number(invoiceData.discountAmount || 0),
        discountPercentage: Number(invoiceData.discountPercentage || 0),
        currency: invoiceData.currency || "USD",
        invoiceDate: invoiceData.invoiceDate || invoiceData.createdAt || invoiceData.created_at,
        dueDate: invoiceData.dueDate,
        notes: invoiceData.notes,
        emailSent: invoiceData.emailSent,
        manifestNumber: invoiceData.manifestNumber,
        exchangeRate: Number(invoiceData.exchangeRate || 0),
        amountCRC: Number(invoiceData.amountCRC || 0),
        ivaEnabled: invoiceData.ivaEnabled ?? false,
        customer,
        invoiceItems,
      };

      setPreviewInvoice(transformedInvoice);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("Failed to preview invoice:", error);
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("failedPreview"),
        variant: "destructive",
      });
    } finally {
      setGeneratingPDFId(null);
    }
  }, [invoices, customerInfoBySlCode, t, toast, queryClient]);

  const handleGeneratePDF = async (invoiceId: string) => {
    setGeneratingPDFId(invoiceId);

    try {
      const response: any = await firebaseApi.invoices.getById(invoiceId);

      // Handle base64 PDF response
      if (response?.data?.pdf) {
        const base64Data = response.data.pdf;
        const filename = response.data.filename || `invoice-${invoiceId}.pdf`;

        // Convert base64 to blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      } else {
        throw new Error("Invalid PDF response format");
      }

      toast({
        title: t("common.success"),
        description: t("pdfDownloaded"),
      });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("failedPDF"),
        variant: "destructive",
      });
    } finally {
      setGeneratingPDFId(null);
    }
  };

  const handleChangeRoute = async (invoice: Invoice, newRoute: string) => {
    setChangingRouteId(invoice.id);
    try {
      const updates: Record<string, any> = { clientRoute: newRoute };
      if (invoice.customer) updates['customer.ruta'] = newRoute;
      await firestoreApi.invoices.update(invoice.id, updates);

      if (invoice.customerId) {
        try { await firestoreApi.customers.update(invoice.customerId, { ruta: newRoute }); } catch { }
      }

      const trackings = (invoice.invoiceItems || []).map(i => i.trackingNumber).filter(Boolean) as string[];
      if (trackings.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < trackings.length; i += 30) chunks.push(trackings.slice(i, i + 30));
        const batch = writeBatch(db);
        await Promise.all(chunks.map(async chunk => {
          const snap = await getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)));
          snap.forEach(d => { batch.update(d.ref, { ruta: newRoute }); });
        }));
        await batch.commit();
      }

      setLiveInvoiceData(prev => {
        const next = new Map(prev);
        const ex = (next.get(invoice.id) || {}) as any;
        next.set(invoice.id, { ...ex, clientRoute: newRoute, customer: ex.customer ? { ...ex.customer, ruta: newRoute } : invoice.customer ? { ...invoice.customer, ruta: newRoute } : undefined });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      toast({ title: 'Ruta actualizada', description: newRoute });
    } catch (error) {
      console.error('Failed to update route:', error);
      toast({ title: 'Error al cambiar ruta', variant: 'destructive' });
    } finally {
      setChangingRouteId(null);
    }
  };

  // Adapter for InvoicesDataTable's generic onSaveField callback
  const handleSaveField = useCallback((invoiceId: string, field: string, value: any, oldValue: any) => {
    if (field === "route") {
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice) handleChangeRoute(invoice as Invoice, value);
    } else if (field === "status") {
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice && value !== oldValue) {
        showConfirmation('status', invoiceId, (invoice as Invoice).invoiceNumber, { oldStatus: oldValue, newStatus: value });
      }
    }
  }, [invoices, handleChangeRoute]);

  // Force sync a single invoice with SmartWeb from the spreadsheet row
  const handleForceSync = useCallback(async (invoice: Invoice) => {
    handleOpenSyncInvoices([invoice]);
  }, [handleOpenSyncInvoices]);

  const handleSendEmail = async (
    invoiceId: string,
    opts = emailSendOptions,
    preloadedInvoice?: Invoice | SP1InvoiceShape | any,
    options?: { skipCacheInvalidation?: boolean; skipToast?: boolean }
  ) => {
    setSendingEmailId(invoiceId);
    try {
      let invoice: any = preloadedInvoice;
      if (!invoice) {
        const invoiceResp = await firebaseApi.invoices.getById(invoiceId);
        invoice = invoiceResp.success ? (invoiceResp as any)?.data : null;
      }
      if (!invoice) throw new Error("Invoice not found");

      // Anti-drift check: do not send annulled or cancelled invoices
      if (invoice.status === 'annulled' || invoice.status === 'cancelled') {
        throw new Error(`La factura ${invoice.invoiceNumber || invoiceId} se encuentra ${invoice.status === 'annulled' ? 'anulada' : 'cancelada'}.`);
      }

      if (opts.sendEmail) {
        let invoiceForPayload = invoice;
        if (!invoiceForPayload.clientEmail && !invoiceForPayload.customer?.email) {
          const slCode = (invoiceForPayload.slCode || (invoiceForPayload as any).clientSlCode || invoiceForPayload.customerId || '').trim();
          const contact = slCode ? customerInfoBySlCode.get(slCode) : undefined;
          if (contact?.email) {
            invoiceForPayload = {
              ...invoiceForPayload,
              clientEmail: contact.email,
              customer: {
                ...(invoiceForPayload.customer || {}),
                email: contact.email,
              },
            };
          }
        }

        // Canonical email payload — handles all invoice shapes, discount, IVA, TC/CRC, consolidation
        const payload = buildInvoiceEmailPayload(invoiceForPayload);
        if (!payload.customerEmail) {
          throw new Error("Customer email not found in invoice");
        }

        if (!invoiceSettings.invoiceSenderEmail) {
          throw new Error("Email service not configured. Please set up email settings first.");
        }

        const emailResult: any = await firebaseApi.email.sendInvoice(payload as any);

        // Store email send log in invoice document for delivery tracking
        const resendMessageId = emailResult?.data?.messageId || emailResult?.messageId || null;
        const nowIso = new Date().toISOString();
        const emailLog = {
          resendMessageId,
          sentTo: payload.customerEmail,
          sentAt: nowIso,
          sentBy: user?.id || 'system',
          invoiceNumber: invoice.invoiceNumber,
        };
        const willPromoteStatus = !invoice.status || invoice.status === 'draft';
        const emailUpdateData: Record<string, any> = {
          emailSent: true,
          emailSentAt: nowIso,
          lastResendMessageId: resendMessageId,
          emailSendLogs: arrayUnion(emailLog),
          emailStatus: 'sent',
          ...(willPromoteStatus ? { status: 'sent' } : {}),
        };
        if (resendMessageId) {
          emailUpdateData.emailResendIds = arrayUnion(resendMessageId);
        }
        await firestoreApi.invoices.update(invoiceId, emailUpdateData);

        // Optimistic live update in local state for immediate UI feedback
        setLiveInvoiceData(prev => {
          const next = new Map(prev);
          const current = next.get(invoiceId) || {};
          next.set(invoiceId, {
            ...current,
            emailSent: true,
            emailSentAt: nowIso,
            emailStatus: 'sent',
            ...(willPromoteStatus ? { status: 'sent' } : {}),
          });
          return next;
        });

        if (!options?.skipCacheInvalidation) {
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
        }
      }

      // Fire-and-forget: sync invoice to SP2 and/or mark packages as 'processed'
      if (opts.syncSp2) {
        // Full invoice sync: pushes the invoice document to SP2's collection.
        const code = (invoice.slCode || (invoice as any).clientSlCode || '').trim();
        if (!code) {
          if (!options?.skipToast) {
            toast({
              title: 'Aviso de Sincronización',
              description: 'Factura sin SL Code asignado. El correo se envió, pero la factura no aparecerá en el portal del cliente.',
            });
          }
        } else {
          syncInvoicesToSp2([{ ...invoice, status: 'sent' } as InvoiceRecord])
            .then(res => {
              if ((!res.ok || res.summary.errors > 0) && !options?.skipToast) {
                toast({
                  title: 'Error de Sincronización',
                  description: 'La factura no pudo sincronizarse con el portal del cliente. Usa "Sync SmartWeb" para reintentar.',
                  variant: 'destructive',
                });
              }
            })
            .catch(err => {
              console.warn('[invoice-sync-sp2][email]', err);
              if (!options?.skipToast) {
                toast({
                  title: 'Error de Conexión',
                  description: `Error al contactar SmartWeb: ${err.message}. Reintenta sincronizar más tarde.`,
                  variant: 'destructive',
                });
              }
            });
        }
        syncInvoicePackagesToSp2(invoice, 'processed', {
          updateSp1: true,
          syncSp2: false,
        }).catch(err =>
          console.warn('[invoice-pkg-sync-sp1][email]', err),
        );
      } else if (opts.updatePackages) {
        syncInvoicePackagesToSp2(invoice, 'processed', {
          updateSp1: true,
          syncSp2: false,
        }).catch(err =>
          console.warn('[invoice-pkg-sync][email]', err),
        );
      }

      if (!options?.skipToast) {
        toast({
          title: t("common.success"),
          description: t("emailScheduled"),
        });
      }
    } catch (error) {
      console.error("Failed to send email:", error);
      if (!options?.skipToast) {
        toast({
          title: t("common.error"),
          description: error instanceof Error ? error.message : t("failedEmail"),
          variant: "destructive",
        });
      }
      throw error;
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleRefreshEmailStatus = async (invoiceId: string) => {
    setRefreshingEmailId(invoiceId);
    try {
      // callFunction returns the CF response directly: { success, status?, reason? }
      const result = await firebaseApi.email.refreshStatus(invoiceId) as any;
      if (result?.success) {
        const STATUS_LABELS: Record<string, string> = {
          sent: 'Enviado', delivered: 'Entregado', opened: 'Abierto',
          clicked: 'Clic', bounced: 'Rebotado', complained: 'Spam', failed: 'Fallido',
        };
        const label = STATUS_LABELS[result.status] ?? result.status ?? '—';
        toast({ title: 'Estado sincronizado', description: `Estado actual: ${label}` });
      } else if (result?.reason === 'no_message_id') {
        toast({ title: 'Sin ID de mensaje', description: 'No hay messageId de Resend guardado en esta factura.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error al sincronizar estado', variant: 'destructive' });
    } finally {
      setRefreshingEmailId(null);
    }
  };

  const handleSendSMS = async (invoiceId: string) => {
    setSendingSMSId(invoiceId);
    try {
      const invoiceResp2 = await firebaseApi.invoices.getById(invoiceId);
      const invoice: any = invoiceResp2.success ? (invoiceResp2 as any)?.data : null;
      if (!invoice) throw new Error("Invoice not found");

      // Get customer info from invoice object
      const customer = invoice.customer;
      if (!customer || !customer.phone) {
        throw new Error("Customer phone number not found in invoice");
      }

      // SMS not yet implemented via Firebase — notify user
      throw new Error('SMS sending not yet configured. Please contact the customer directly at ' + customer.phone);
    } catch (error) {
      console.error("Failed to send SMS:", error);
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("failedSMS"),
        variant: "destructive",
      });
    } finally {
      setSendingSMSId(null);
    }
  };

  const handleAnnulInvoice = async (invoiceId: string, targetManifest?: { docId: string; manifestNumber: string }) => {
    setUpdatingStatusId(invoiceId);
    try {
      const nowAnnul = new Date().toISOString();
      await firestoreApi.invoices.update(invoiceId, {
        status: "annulled",
        annulledAt: nowAnnul,
        statusHistory: arrayUnion({
          status: 'annulled',
          changedAt: nowAnnul,
          changedBy: user?.email || user?.id || 'admin',
          note: `Factura anulada. Paquetes movidos a: ${targetManifest ? targetManifest.manifestNumber : 'consolidacion_transitoria'}`
        }),
      });
      // En SP1 cuando anulo o delete una factura esto deberia literalemnte borrar la factura de SP2
      const annulInv = invoices.find(i => i.id === invoiceId);
      deleteInvoiceFromSp2(invoiceId, (annulInv as any)?.invoiceNumber ?? invoiceId).catch(err => console.warn('[handleAnnulInvoice] SP2 deletion failed:', err));

      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_updated',
        category: 'invoice',
        resource: '/invoices',
        resourceId: invoiceId,
        result: 'success',
        metadata: {
          invoiceNumber: (annulInv as any)?.invoiceNumber ?? invoiceId,
          status: 'annulled',
          previousStatus: annulInv?.status,
          note: `Factura anulada. Paquetes movidos a: ${targetManifest ? targetManifest.manifestNumber : 'consolidacion_transitoria'}`
        },
      });
      // Optimistic update — reflect status change in the cursor cache and liveInvoiceData immediately
      setLiveInvoiceData(prev => {
        const next = new Map(prev);
        const existing = next.get(invoiceId) || {};
        next.set(invoiceId, { ...existing, status: 'annulled' });
        return next;
      });
      queryClient.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((inv: any) => inv.id === invoiceId ? { ...inv, status: 'annulled' } : inv) };
      });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });

      // Move non-manual invoice items to manifest_consolidation
      const inv = invoices.find(i => i.id === invoiceId);
      if (inv) {
        const now = new Date().toISOString();
        const slCode = inv.slCode || inv.customerId || '';
        const custName = (inv as any).clientName || inv.customer?.fullName || slCode;
        const ruta = inv.customer?.ruta || (inv as any).clientRoute || '';
        const manifest = (inv as any).manifestNumber
          || ((inv as any).manifestNumbers as string[] | undefined)?.[0]
          || '';

        const items: ManifestConsolidationItem[] = (inv.invoiceItems ?? [])
          .filter(item => !item.isManual && item.trackingNumber)
          .map(item => ({
            tracking: item.trackingNumber!.toUpperCase(),
            slCode,
            customerName: custName,
            ruta,
            weight: item.realWeight ?? item.weight ?? 0,
            price: item.totalPrice ?? item.unitPrice ?? 0,
            currency: 'USD',
            description: item.description ?? '',
            permisos: !!(item.requiresPermit),
            origin: 'Miami, FL',
            manifestNumber: manifest,
            invoiceId,
            invoiceNumber: inv.invoiceNumber,
            invoiceStatus: 'annulled',
            status: '',
            movedAt: now,
          }));

        if (items.length > 0) {
          const targetDocId = targetManifest ? targetManifest.docId : 'consolidacion_transitoria';
          const targetManifestNumber = targetManifest ? targetManifest.manifestNumber : 'consolidacion_transitoria';
          
          const now2 = new Date().toISOString();
          const trackings = items.map(i => i.tracking.toUpperCase());
          
          // Batch query packages in chunks of 30 (operators: 'in') to avoid N individual getDocs
          const CHUNK_SIZE = 30;
          const trackingChunks: string[][] = [];
          for (let i = 0; i < trackings.length; i += CHUNK_SIZE) {
            trackingChunks.push(trackings.slice(i, i + CHUNK_SIZE));
          }
          
          const validDocs: any[] = [];
          const seenDocIds = new Set<string>();
          for (const chunk of trackingChunks) {
            const [snapTN, snapT] = await Promise.all([
              getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk))),
              getDocs(query(collection(db, 'packages'), where('tracking', 'in', chunk))),
            ]);
            for (const d of [...snapTN.docs, ...snapT.docs]) {
              if (!seenDocIds.has(d.id)) {
                seenDocIds.add(d.id);
                validDocs.push(d);
              }
            }
          }
          
          if (validDocs.length > 0) {
            const pkgBatch = writeBatch(db);
            validDocs.forEach(pkgDoc => {
              const data = pkgDoc.data() as any;
              const currentMf = data.manifestNumber || data.manifiesto || '';
              pkgBatch.update(doc(db, 'packages', pkgDoc.id), {
                // Stamp origin so consolidation view can group under source manifest.
                // Guard: never overwrite if already stamped (idempotent).
                ...(!data.originalManifestId && currentMf && currentMf !== targetManifestNumber
                  ? { originalManifestId: currentMf, originalManifestID: currentMf }
                  : {}),
                manifestId:       targetDocId,
                manifestNumber:   targetManifestNumber,
                updatedManifest:  targetManifestNumber,
                manifestUpdatedAt: now2,
                // Mark as consolidated or customs depending on targetManifest
                consolidacion: true,
                status: targetManifest ? 'customs' : 'consolidated',
                // GAP-4 FIX: clear stale invoice association when moving to transitoria.
                // Packages here are intentionally un-invoiced — they must show up in
                // the re-assignment workflow, NOT as phantom-members of the dead invoice.
                invoiceId:     deleteField(),
                invoiceNumber: deleteField(),
                invoiceStatus: deleteField(), // FIX: Limpiar el estado de factura residual
                annulledInvoiceId: invoiceId,
                annulledInvoiceNumber: inv.invoiceNumber || invoiceId,
                annulledAt: now2,
                ...(!data.firstConsolidatedAt ? { firstConsolidatedAt: now2 } : {}),
                smartwebSynced: false,
                smartwebSyncSource: 'transitoria',
                invoicedAt: (inv as any).createdAt
                  ? (typeof (inv as any).createdAt.toDate === 'function'
                      ? (inv as any).createdAt.toDate().toISOString()
                      : String((inv as any).createdAt))
                  : now2,
                statusHistory: arrayUnion({
                  status: targetManifest ? 'customs' : 'consolidated',
                  changedAt: now2,
                  changedBy: user?.email || user?.id || 'admin',
                  note: `Factura ${inv.invoiceNumber || invoiceId} anulada desde panel de facturas — paquete desvinculado.`,
                }),
              });
            });
            await pkgBatch.commit();

            // Push the new manifestNumber to SP2 so the customer portal
            // (shipments collection) stays in sync.
            const pkgsForSp2 = validDocs
              .map(pkgDoc => {
                const data = pkgDoc.data() as any;
                const tracking = (data.trackingNumber || data.tracking || pkgDoc.id || '').toString();
                if (!tracking) return null;
                return {
                  id: pkgDoc.id,
                  trackingNumber: tracking,
                  slCode: (data.slCode || slCode || '').toString(),
                  customerName: (data.customerName || custName || '').toString(),
                  status: targetManifest ? 'customs' : 'consolidated', // FIX: depende de targetManifest
                  weight: data.weight,
                  description: data.description ?? '',
                  ruta: data.ruta ?? ruta,
                  manifestNumber: targetManifestNumber,
                  forceSync: true, // FIX: Forzar la sincronización para saltar prioridad en SP2
                };
              })
              .filter((p): p is NonNullable<typeof p> => p !== null && Boolean(p.status));
            
            if (pkgsForSp2.length > 0) {
              syncPackagesToSmartWeb(pkgsForSp2).catch(err =>
                console.warn('[handleAnnulInvoice] SP2 manifest sync failed:', err),
              );
            }
          }

          if (targetManifest) {
            await movePackagesBetweenManifestDocs(trackings, manifest, targetManifest.manifestNumber, [invoiceId]);
          } else {
            await addItemsToConsolidation(items);
          }
        }
      }

      toast({
        title: t("common.success"),
        description: t("invoiceAnnulled"),
      });
    } catch (error) {
      console.error("Failed to annul invoice:", error);
      toast({
        title: t("common.error"),
        description: t("failedAnnul"),
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleStatusChange = async (
    invoiceId: string,
    newStatus: InvoiceStatus,
    opts = statusChangeOptions,
  ) => {
    setUpdatingStatusId(invoiceId);
    const changedAt = new Date().toISOString();
    try {
      await firebaseApi.invoices.update(invoiceId, { status: newStatus });
      // Append to statusHistory (best-effort, non-blocking)
      updateDoc(doc(db, 'invoices', invoiceId), {
        statusHistory: arrayUnion({ status: newStatus, changedAt, changedBy: user?.id || 'admin' }),
      }).catch(err => console.warn('[handleStatusChange] statusHistory update failed:', err));
      // Optimistic update — reflect status change in the cursor cache immediately
      queryClient.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((inv: any) => inv.id === invoiceId ? { ...inv, status: newStatus } : inv) };
      });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      // Status push to SP2 (controlled by opts.syncInvoice)
      const invData = invoices.find(i => i.id === invoiceId);
      if (opts.syncInvoice) {
        pushStatusToSp2(invoiceId, (invData as any)?.invoiceNumber ?? invoiceId, newStatus);
      }
      // When marked sent: update linked packages to 'processed' (Facturado) in SP1 + sync SP2
      if (newStatus === 'sent' && (opts.updatePackages || opts.syncSp2)) {
        firebaseApi.invoices.getById(invoiceId).then((resp: any) => {
          const fullInv = resp.success ? resp.data : null;
          if (fullInv) syncInvoicePackagesToSp2(fullInv, 'processed', {
            updateSp1: opts.updatePackages,
            syncSp2: opts.syncSp2,
          }).catch(err =>
            console.warn('[invoice-pkg-sync][sent]', err),
          );
        }).catch(() => { });
      }
      // When marked paid: update linked packages to 'on_route' in SP1 + sync SP2
      if (newStatus === 'paid' && (opts.updatePackages || opts.syncSp2)) {
        firebaseApi.invoices.getById(invoiceId).then((resp: any) => {
          const fullInv = resp.success ? resp.data : null;
          if (fullInv) syncInvoicePackagesToSp2(fullInv, 'on_route', {
            updateSp1: opts.updatePackages,
            syncSp2: opts.syncSp2,
          }).catch(err =>
            console.warn('[invoice-pkg-sync][paid]', err),
          );
        }).catch(() => { });
      }
      // When marked annulled, cancelled, or draft: update linked packages to 'consolidated' in SP1 + sync SP2 with forceSync: true
      if ((newStatus === 'annulled' || newStatus === 'cancelled' || newStatus === 'draft') && (opts.updatePackages || opts.syncSp2)) {
        firebaseApi.invoices.getById(invoiceId).then((resp: any) => {
          const fullInv = resp.success ? resp.data : null;
          if (fullInv) syncInvoicePackagesToSp2(fullInv, 'consolidated', {
            updateSp1: opts.updatePackages,
            syncSp2: opts.syncSp2,
            forceSync: true,
          }).catch(err =>
            console.warn('[invoice-pkg-sync][revert-consolidated]', err),
          );
        }).catch(() => { });
      }
      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_updated',
        category: 'invoice',
        resource: '/invoices',
        resourceId: invoiceId,
        result: 'success',
        metadata: { invoiceNumber: (invData as any)?.invoiceNumber ?? invoiceId, status: newStatus, previousStatus: invData?.status, note: `Estado de factura cambiado a ${newStatus}` },
      });
      toast({
        title: t("common.success"),
        description: t("statusUpdated") || "Invoice status updated",
      });
    } catch (error) {
      console.error("Failed to update status:", error);
      toast({
        title: t("common.error"),
        description: t("failedStatusUpdate") || "Failed to update invoice status",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleCopyEmail = async (email: string, invoiceId: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(invoiceId);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (error) {
      console.error("Failed to copy email:", error);
    }
  };

  const handleReturnPackages = useCallback((invoice: any) => {
    if (!invoice?.id) return;
    setReturnPackagesConfirmInvoice(invoice);
  }, []);

  const confirmReturnPackages = useCallback(async () => {
    const invoice = returnPackagesConfirmInvoice;
    if (!invoice?.id) return;
    setReturnPackagesConfirmInvoice(null);

    try {
      const now = new Date().toISOString();
      const batch = writeBatch(db);

      // 1. Update invoice status history (to audit this)
      batch.update(doc(db, 'invoices', invoice.id), {
        statusHistory: arrayUnion({
          status: invoice.status,
          changedAt: now,
          changedBy: 'invoices-list-manual',
          note: 'Paquetes movidos a estado devuelto por administración.',
        }),
      });

      // 2. Query packages linked to this invoice
      const pkgsQuery = query(
        collection(db, 'packages'),
        where('invoiceId', '==', invoice.id)
      );
      const pkgsSnap = await getDocs(pkgsQuery);
      const pkgsToReturn = pkgsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      if (pkgsToReturn.length === 0) {
        toast({
          title: 'Sin paquetes',
          description: 'No se encontraron paquetes asociados a esta factura.',
          variant: 'destructive',
        });
        return;
      }

      for (const pkg of pkgsToReturn) {
        batch.update(doc(db, 'packages', pkg.id), {
          status: 'returned',
          deliveryStatus: 'returned',
          returnedAt: now,
          returnReason: 'Devolución manual por administración (Listado de Facturas)',
          statusHistory: arrayUnion({
            status: 'returned',
            changedAt: now,
            changedBy: 'invoice-manual-return',
            note: `Paquete movido a devuelto mediante acción en factura ${invoice.invoiceNumber || invoice.id}`,
          }),
        });
      }

      await batch.commit();

      // 3. Sync to SmartWeb (SP2)
      const sp2Pkgs = pkgsToReturn.map(p => ({
        id:             p.id,
        trackingNumber: p.trackingNumber || p.tracking || '',
        slCode:         p.slCode || '',
        customerName:   p.customerName || p.nombreCliente || '',
        status:         'returned',
        weight:         p.weight || p.peso,
        description:    p.description || p.descripcion,
        ruta:           p.ruta || '',
        manifestNumber: p.manifestNumber || p.manifiesto || '',
        forceSync:      true,
        allowCreate:    true,
      }));

      if (sp2Pkgs.length > 0) {
        syncPackagesToSmartWeb(sp2Pkgs).catch(err =>
          console.warn('[handleReturnPackages] SP2 package sync failed:', err)
        );
      }

      toast({
        title: 'Paquetes devueltos',
        description: `Los ${pkgsToReturn.length} paquetes de la factura ${invoice.invoiceNumber || invoice.id} fueron marcados como "Devueltos".`,
      });
    } catch (err: any) {
      console.error('[handleReturnPackages] Error:', err);
      toast({
        title: 'Error al devolver paquetes',
        description: err.message || 'Error desconocido',
        variant: 'destructive',
      });
    }
  }, [toast, returnPackagesConfirmInvoice]);

  /**
   * De-annul an invoice — restore status to draft AND undo the side-effects of
   * the original annulment so the invoice's items effectively "come back":
   *
   *   1. status: 'annulled' → 'draft' (clears annulledAt, appends statusHistory).
   *   2. Items moved to manifest_consolidation get removed there (the invoice
   *      already retains its invoiceItems array, so removing the consolidation
   *      stub is enough to restore the table to its pre-annul state).
   *   3. Packages whose manifestId was reassigned to a target manifest during
   *      annul are reverted to their `originalManifestId` (stamped at annul time).
   *   4. SP2 receives the new 'draft' status so the customer portal hides it.
   *
   * Best-effort: a failure in steps 2-4 does not roll back the status change.
   */
  const handleDeannulInvoice = async (invoiceId: string) => {
    setUpdatingStatusId(invoiceId);
    const restoredAt = new Date().toISOString();
    try {
      const inv = invoices.find(i => i.id === invoiceId);
      const invoiceNumber = (inv as any)?.invoiceNumber ?? invoiceId;

      // ── 1. Status flip + audit trail ─────────────────────────────────────
      await firebaseApi.invoices.update(invoiceId, { status: 'draft', annulledAt: null });
      // Append to statusHistory (non-blocking — annulled doc already has prior entries)
      updateDoc(doc(db, 'invoices', invoiceId), {
        statusHistory: arrayUnion({
          status: 'draft',
          changedAt: restoredAt,
          changedBy: user?.email || user?.id || 'admin',
          reason: 'De-anulación de factura',
        }),
      }).catch(err => console.warn('[handleDeannulInvoice] statusHistory update failed:', err));
      pushStatusToSp2(invoiceId, invoiceNumber, 'draft');

      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_updated',
        category: 'invoice',
        resource: '/invoices',
        resourceId: invoiceId,
        result: 'success',
        metadata: {
          invoiceNumber: invoiceNumber,
          status: 'draft',
          previousStatus: 'annulled',
          note: 'Factura de-anulada y restaurada a estado borrador.'
        },
      });

      // ── 2. Optimistic UI update ─────────────────────────────────────────
      queryClient.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((i: any) => i.id === invoiceId ? { ...i, status: 'draft' } : i) };
      });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });

      // ── 3. Side-effect cleanup: consolidation + package manifest revert ──
      if (inv) {
        const items = (inv.invoiceItems ?? []) as any[];
        const trackings = items
          .map(it => (it.trackingNumber || '').toString().trim().toUpperCase())
          .filter(Boolean);

        if (trackings.length > 0) {
          // 3a. Remove items from manifest_consolidation (idempotent: deleteDoc
          //     on a missing doc resolves cleanly, so this is safe even when the
          //     original annul went the "move-to-target-manifest" path).
          removeManyFromConsolidation(trackings).catch(err =>
            console.warn('[handleDeannulInvoice] removeManyFromConsolidation failed:', err),
          );

          // 3b. Revert packages whose manifestId was reassigned during annul.
          //     handleAnnulInvoice stamps `originalManifestId` on each package
          //     when targetManifest is provided. We undo that here — packages
          //     that were never moved have no originalManifestId and are skipped.
          (async () => {
            try {
              const CHUNK_SIZE = 30;
              const allPkgDocs: any[] = [];
              const seenDocIds = new Set<string>();

              for (let i = 0; i < trackings.length; i += CHUNK_SIZE) {
                const chunk = trackings.slice(i, i + CHUNK_SIZE);
                const [snapTN, snapT] = await Promise.all([
                  getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk))),
                  getDocs(query(collection(db, 'packages'), where('tracking', 'in', chunk))),
                ]);
                [...snapTN.docs, ...snapT.docs].forEach(d => {
                  if (!seenDocIds.has(d.id)) {
                    seenDocIds.add(d.id);
                    allPkgDocs.push(d);
                  }
                });
              }

              const movedDocs = allPkgDocs
                .filter(d => {
                  const data = d.data() as any;
                  return data.originalManifestId && data.originalManifestId !== data.manifestId;
                });
              if (movedDocs.length > 0) {
                const batch = writeBatch(db);
                movedDocs.forEach(d => {
                  const data = d.data() as any;
                  batch.update(doc(db, 'packages', d.id), {
                    manifestId: data.originalManifestId,
                    manifestNumber: data.originalManifestId, // SP1 uses manifestNumber === manifestId convention
                    originalManifestId: null,
                    manifestUpdatedAt: restoredAt,
                  });
                });
                await batch.commit();
              }
            } catch (err) {
              console.warn('[handleDeannulInvoice] package manifest revert failed:', err);
            }
          })();
        }
      }

      toast({ title: 'Factura restaurada', description: 'La factura fue de-anulada y está en borrador con todos sus items.' });
    } catch (error) {
      console.error('Failed to de-annul invoice:', error);
      toast({ title: t('common.error'), description: 'No se pudo de-anular la factura.', variant: 'destructive' });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleOpenWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}`;
    window.open(whatsappUrl, '_blank');
  };

  const toggleRowExpansion = (invoiceId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(invoiceId)) {
        newSet.delete(invoiceId);
      } else {
        newSet.add(invoiceId);
      }
      return newSet;
    });
  };

  const createAuditLog = async (invoiceId: string, action: string, details?: any) => {
    try {
      const actionMap: Record<string, AuditAction> = {
        PDF_GENERATED: 'invoice_viewed',
        EMAIL_SENT: 'invoice_sent',
        SMS_SENT: 'invoice_sent',
        WHATSAPP_OPENED: 'invoice_sent',
        INVOICE_ANNULLED: 'invoice_updated',
        STATUS_CHANGED: 'invoice_updated',
      };
      const mapped = actionMap[action];
      if (user && mapped) {
        logAction({
          userId: user.id,
          userName: user.fullName,
          userEmail: user.email,
          userRole: user.role,
          action: mapped,
          category: 'invoice',
          resource: '/invoices',
          resourceId: invoiceId,
          result: 'success',
          metadata: { originalAction: action, ...details },
        });
      }
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  };

  const isEncomiendaInvoice = (inv: any): boolean => {
    const route = (inv.clientRoute || inv.customer?.ruta || '').trim();
    return route === 'Encomiendas';
  };

  /**
   * Resolves the customer's selected encomienda service name from the
   * invoice, the enriched live snapshot, or the embedded customer record.
   *
   * Falls back through the SP1 native shapes (`customer.encomienda.name`,
   * `customer.addresses[].encomienda.name`, `customer.defaultAddress.encomienda.name`,
   * `customer.courierService`) and finally the SP2-synced field
   * (`customer.encomiendaProvider`, raw id) — empty string when nothing is set.
   */
  /**
   * Resolves a string that may be either a display name, a Firestore doc id
   * from the `encomiendas` collection, or already-formatted text. Returns the
   * canonical name when found in the live directory; otherwise echoes the
   * original trimmed string.
   */
  const resolveEncomiendaLabel = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    // Direct id lookup
    const byId = encomiendaDirectory.get(trimmed);
    if (byId?.name) return byId.name;
    // Name lookup (case-insensitive) — confirms the directory still contains it
    const byName = encomiendaDirectory.get(`name:${trimmed.toLowerCase()}`);
    if (byName?.name) return byName.name;
    return trimmed;
  };

  const getEncomiendaServiceName = (inv: any): string => {
    const live = liveInvoiceData.get(inv?.id) as any;
    const pickAddrName = (c: any): string | undefined => {
      const addrs = c?.addresses;
      if (!Array.isArray(addrs)) return undefined;
      const match = addrs.find((a: any) => a?.encomienda?.name);
      return match?.encomienda?.name;
    };
    // Look up the live customer record by slCode — this is the authoritative
    // source: `subscribeCustomersBySlCodes` already resolves
    // encomiendaServiceName from `customer.encomienda.name`, addresses, etc.
    const slCode = (inv?.clientSlCode || inv?.slCode || inv?.customer?.slCode || '').toString().trim();
    const cust = slCode ? customerInfoBySlCode.get(slCode) : undefined;
    const candidates: Array<unknown> = [
      cust?.encomiendaServiceName,
      live?.encomiendaServiceName,
      live?.encomiendaService,
      live?.courierService,
      inv?.encomiendaServiceName,
      inv?.encomiendaService,
      inv?.courierService,
      live?.customer?.encomienda?.name,
      inv?.customer?.encomienda?.name,
      live?.customer?.defaultAddress?.encomienda?.name,
      inv?.customer?.defaultAddress?.encomienda?.name,
      pickAddrName(live?.customer),
      pickAddrName(inv?.customer),
      // SP2-synced raw ids — resolved against the live directory below
      live?.customer?.encomiendaProvider,
      inv?.customer?.encomiendaProvider,
    ];
    for (const c of candidates) {
      const label = resolveEncomiendaLabel(c);
      if (label) return label;
    }
    return '';
  };

  const buildLabelData = useCallback((inv: any): NovaShippingLabelData => {
    const items: any[] = inv.invoiceItems ?? inv.items ?? [];
    const trackings = items
      .filter((i: any) => !i.isManual && (i.trackingNumber || i.tracking))
      .map((i: any) => (i.trackingNumber || i.tracking) as string)
      .filter(Boolean);
    return {
      slCode: inv.clientSlCode ?? inv.slCode ?? inv.customerId ?? '',
      clientName: inv.customerName ?? inv.customer?.fullName ?? '',
      trackings,
      ruta: inv.clientRoute ?? inv.customer?.ruta,
      encomiendaName: getEncomiendaServiceName(inv) || inv.encomiendaService || inv.courierService,
    };
  }, [getEncomiendaServiceName]);

  const hasTerceroItem = (inv: any): boolean => {
    const items: any[] = inv.invoiceItems || inv.items || [];
    return items.some(
      (i: any) =>
        (i.isManual === true && !i.trackingNumber && !i.tracking) ||
        (i.description ?? '').toUpperCase().includes('TERCERO'),
    );
  };

  const { canMerge, hasEncomiendas, encomiendaMissingTerceroCount } = useMemo(() => {
    if (selectedIds.size === 0) {
      return { canMerge: false, hasEncomiendas: false, encomiendaMissingTerceroCount: 0 };
    }
    let encomiendasCount = 0;
    let missingTercero = 0;
    const clientKeys = new Set<string>();

    selectedIds.forEach(id => {
      const raw = invoicesById.get(id);
      if (raw) {
        const inv = { ...raw, ...(liveInvoiceData.get(id) ?? {}) } as Invoice;
        clientKeys.add((inv as any).slCode ?? inv.customerId ?? '');
        const isEnc = isEncomiendaInvoice(inv);
        if (isEnc) {
          encomiendasCount++;
          if (!hasTerceroItem(inv)) {
            missingTercero++;
          }
        }
      }
    });

    return {
      canMerge: selectedIds.size >= 2 && clientKeys.size === 1,
      hasEncomiendas: encomiendasCount > 0,
      encomiendaMissingTerceroCount: missingTercero,
    };
  }, [selectedIds, invoicesById, liveInvoiceData]);

  const showConfirmation = (type: string, invoiceId: string, invoiceNumber: string, data?: any) => {
    if (type === 'email' || type === 'bulk-email') {
      setEmailSendOptions({ sendEmail: true, updatePackages: true, syncSp2: true });
    }
    if (type === 'status') {
      setStatusChangeOptions({ syncInvoice: true, updatePackages: true, syncSp2: true });
    }
    if (type === 'bulk-status') {
      setBulkStatusOptions({ syncSp2: true, updatePackages: true, includeAnnulled: false });
    }
    setBulkActionConfirmed(false);

    if (type === 'annul') {
      const inv = invoices.find(i => i.id === invoiceId) || invoice;
      const slCode = (inv as any)?.slCode || inv?.customerId || (inv as any)?.clientSlCode || '';
      
      const cachedCust = slCode ? getCustomerBySlCode(slCode) : null;
      let initialStatus = true;

      if (cachedCust && typeof cachedCust.consolidationEnabled === 'boolean') {
        initialStatus = cachedCust.consolidationEnabled;
      } else if (inv?.customer && typeof inv.customer.consolidationEnabled === 'boolean') {
        initialStatus = inv.customer.consolidationEnabled;
      } else if (typeof (inv as any)?.isConsolidation === 'boolean') {
        initialStatus = (inv as any).isConsolidation;
      } else if (typeof (inv as any)?.customerConsolidationEnabled === 'boolean') {
        initialStatus = (inv as any).customerConsolidationEnabled;
      }

      setCustomerConsolidationEnabledSP1(initialStatus);
      setCustomerConsolidationEnabledSP2(initialStatus);
      setAutoEnableConsolidation(true); // reset checkbox to true by default

      if (slCode) {
        // Fetch SP1 in background to verify latest status without blocking UI
        getDoc(doc(db, 'customers', slCode)).then((snap) => {
          if (snap.exists()) {
            const val = snap.data()?.consolidationEnabled === true;
            setCustomerConsolidationEnabledSP1(val);
          }
        }).catch((err) => {
          console.warn('[showConfirmation] SP1 customer fetch failed:', err);
        });

        // Fetch SP2 in background
        const usersRef = collection(dbSP2, 'users');
        const q = query(usersRef, where('slCode', '==', slCode), fsLimit(1));
        getDocs(q).then((snap) => {
          if (!snap.empty) {
            const val = snap.docs[0].data()?.consolidationEnabled === true;
            setCustomerConsolidationEnabledSP2(val);
          }
        }).catch((err) => {
          console.warn('[showConfirmation] SP2 user fetch failed:', err);
        });
      }
    }

    // Fallback for legacy invoices created before BUG-CREATE-INVOICE-PARITY (0.0.600)
    // was fixed: those docs lack an `invoiceNumber` field, so the delete dialog —
    // which gates the confirm button on `deleteConfirmText === confirmAction.invoiceNumber`
    // — would render an empty <code> block and stay disabled forever (the operator
    // had nothing valid to type). Falling back to the Firestore doc id keeps the
    // confirmation contract intact (still requires the operator to type/paste a
    // unique identifier) while making the legacy docs deletable. New invoices
    // created via either Nova or the manual flow always carry a real invoiceNumber
    // and never hit the fallback path.
    const safeInvoiceNumber = invoiceNumber && invoiceNumber.trim()
      ? invoiceNumber
      : invoiceId;
    setConfirmAction({
      show: true,
      type,
      invoiceId,
      invoiceNumber: safeInvoiceNumber,
      data,
    });
  };

  const handleReassignInvoice = async (target: ReassignTarget) => {
    if (!reassigningInvoice) return;
    setIsReassigning(true);
    try {
      const existingCustomer = (reassigningInvoice as any).customer ?? {};
      const oldInvoiceNumber = (reassigningInvoice as any).invoiceNumber ?? '';
      const oldSlCode: string = (reassigningInvoice as any).slCode
        ?? (reassigningInvoice as any).clientSlCode
        ?? existingCustomer?.slCode
        ?? '';
      const isTempOwner = isTempSlCode(oldSlCode);
      const newInvoiceNumber = replaceInvoiceNumberPrefix(oldInvoiceNumber, target.slCode);
      const updatedCustomer = {
        ...existingCustomer,
        fullName: target.fullName,
        slCode: target.slCode,
        ...(target.email ? { email: target.email } : {}),
      };
      const updates: Record<string, any> = {
        clientName: target.fullName,
        clientSlCode: target.slCode,
        slCode: target.slCode,
        customerId: target.slCode,
        userId: target.slCode,
        invoiceNumber: newInvoiceNumber,
        ...(target.email != null ? { clientEmail: target.email } : {}),
        // Update nested customer object fields via dot-notation (preserves ruta/phone/etc.)
        'customer.fullName': target.fullName,
        'customer.slCode': target.slCode,
        ...(target.email != null ? { 'customer.email': target.email } : {}),
      };
      // Patch for optimistic cache (React Query stores flat objects, not dot-notation)
      const cacheUpdates = {
        clientName: target.fullName,
        clientSlCode: target.slCode,
        slCode: target.slCode,
        customerId: target.slCode,
        userId: target.slCode,
        invoiceNumber: newInvoiceNumber,
        customer: updatedCustomer,
      };
      await firestoreApi.invoices.update(reassigningInvoice.id, updates as any);
      // Optimistic UI update — reflect new owner immediately in the cursor cache
      queryClient.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((inv: any) =>
            inv.id === reassigningInvoice.id ? { ...inv, ...cacheUpdates } : inv
          ),
        };
      });
      // Also update liveInvoiceData so the expanded row reflects the change immediately
      setLiveInvoiceData(prev => {
        const next = new Map(prev);
        const ex = (next.get(reassigningInvoice.id) || {}) as any;
        next.set(reassigningInvoice.id, { ...ex, ...cacheUpdates });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', reassigningInvoice.id] });
      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_reassigned',
        category: 'invoice',
        result: 'success',
        resourceId: reassigningInvoice.id,
        metadata: {
          invoiceNumber: (reassigningInvoice as any).invoiceNumber,
          previousOwner: (reassigningInvoice as any).slCode ?? (reassigningInvoice as any).clientSlCode,
          newOwner: target.slCode,
          newClientName: target.fullName,
        },
      });
      // MANDATORY: re-sync the updated invoice to SP2 so the new owner sees it
      // in SmartWeb. Awaited (no fire-and-forget) because an out-of-sync SP2
      // invoice after a reassign is exactly the class of bug this flow must
      // prevent. Failures surface as a warning toast but do NOT revert the
      // Firestore write — the operator can retry via "Re-sync SP2".
      const updatedInvoice = { ...reassigningInvoice, ...updates, status: (reassigningInvoice as any).status ?? 'draft' } as InvoiceRecord;
      let sp2Synced = true;
      try {
        await syncInvoicesToSp2([updatedInvoice]);
      } catch (syncErr: any) {
        sp2Synced = false;
        console.warn('[reassign] SP2 sync failed:', syncErr);
        toast({
          title: 'Reasignada, pero falló la sincronización con SP2',
          description: `${(reassigningInvoice as any).invoiceNumber}: ${syncErr?.message ?? 'Error desconocido'}. Usa el botón "Re-sync SP2" para reintentar.`,
          variant: 'destructive',
        });
      }

      // Clean up the temp customer placeholder when the previous owner was a
      // temp record (SL-NAN-*) AND no other live invoice still references it.
      // Skipped silently when the new owner happens to be the same temp slCode.
      //
      // IMPORTANT: Historical invoices store the slCode under ANY of three
      // fields (clientSlCode, slCode, customerId) — see
      // `findActiveInvoiceForCustomer` in invoice-service.ts. Querying only
      // one field would risk deleting a temp doc that legacy invoices still
      // reference, leaving them orphaned. We query all three in parallel.
      let tempCleaned = false;
      let bulkReassignedCount = 0;
      let bulkSyncedCount = 0;

      if (isTempOwner && oldSlCode && oldSlCode !== target.slCode) {
        try {
          const invRef = collection(db, 'invoices');
          const [s1, s2, s3] = await Promise.all([
            getDocs(query(invRef, where('clientSlCode', '==', oldSlCode))),
            getDocs(query(invRef, where('slCode', '==', oldSlCode))),
            getDocs(query(invRef, where('customerId', '==', oldSlCode))),
          ]);

          const otherDocs = new Map<string, any>();
          [s1, s2, s3].forEach(snap => {
            snap.docs.forEach(d => {
              if (d.id !== reassigningInvoice.id) otherDocs.set(d.id, d.data());
            });
          });

          if (otherDocs.size > 0) {
            // Bulk reassign all other invoices for this temp customer
            const batch = writeBatch(db);
            const otherUpdatedInvoices: InvoiceRecord[] = [];

            for (const [docId, docData] of otherDocs.entries()) {
              const newOtherInvoiceNumber = replaceInvoiceNumberPrefix(docData.invoiceNumber || '', target.slCode);
              const otherUpdates = {
                ...updates,
                invoiceNumber: newOtherInvoiceNumber,
              };
              batch.update(doc(db, 'invoices', docId), otherUpdates);
              otherUpdatedInvoices.push({ ...docData, ...otherUpdates, id: docId, status: docData.status ?? 'draft' } as InvoiceRecord);
            }

            await batch.commit();
            bulkReassignedCount = otherDocs.size;

            // Sync all updated invoices to SP2
            try {
              await syncInvoicesToSp2(otherUpdatedInvoices);
              bulkSyncedCount = otherDocs.size;
            } catch (err) {
              console.warn('[reassign] bulk SP2 sync failed:', err);
              // Do not fail the whole operation, SP2 sync can be retried later
            }
          }

          // Since we've reassigned all remaining invoices (if any), the temp customer is now truly orphaned.
          await deleteTempCustomer(oldSlCode);
          tempCleaned = true;
          logAction({
            userId: user?.id ?? 'unknown',
            userName: user?.fullName,
            userEmail: user?.email,
            userRole: user?.role,
            action: 'temp_customer_deleted' as AuditAction,
            category: 'invoice',
            result: 'success',
            resourceId: oldSlCode,
            metadata: {
              reason: bulkReassignedCount > 0 ? 'bulk_reassigned_to_real_customer' : 'reassigned_to_real_customer',
              invoiceId: reassigningInvoice.id,
              bulkReassignedCount,
              invoiceNumber: (reassigningInvoice as any).invoiceNumber,
              newOwner: target.slCode,
            },
          });

        } catch (cleanupErr) {
          console.warn('[reassign] temp customer cleanup or bulk reassignment failed:', cleanupErr);
        }
      }

      toast({
        title: 'Factura reasignada',
        description: `${(reassigningInvoice as any).invoiceNumber} → ${target.fullName} (${target.slCode})${bulkReassignedCount > 0 ? ` · ${bulkReassignedCount} adicionales reasignadas` : ''}${tempCleaned ? ' · cliente temporal eliminado' : ''}${sp2Synced ? '' : ' · SP2 pendiente para la principal'}`,
      });

      // Prompt the operator to resend the invoice to the NEW owner's inbox.
      // Only offered when we have an email AND the SP2 sync succeeded — if SP2
      // failed, the operator should retry the sync first (SP2 is the source of
      // truth for the customer portal).
      const resendEmail = target.email
        ?? (target as any).customer?.email
        ?? existingCustomer?.email
        ?? '';
      if (sp2Synced && resendEmail) {
        setReassignResendPrompt({
          invoiceId: reassigningInvoice.id,
          invoiceNumber: (reassigningInvoice as any).invoiceNumber ?? '',
          email: resendEmail,
          fullName: target.fullName,
        });
      }

      setReassigningInvoice(null);
    } catch (err: any) {
      toast({ title: 'Error al reasignar', description: err?.message ?? 'Inténtalo de nuevo.', variant: 'destructive' });
    } finally {
      setIsReassigning(false);
    }
  };

  const handleReassignManifest = async ({ newManifestNumber, newInvoiceNumber }: { newManifestNumber: string, newInvoiceNumber: string }) => {
    if (!reassigningManifestInvoice) return;
    setIsReassigningManifest(true);
    try {
      const invoice = reassigningManifestInvoice;
      const oldManifest = (invoice as any).manifestNumber;
      const oldInvoiceNumber = (invoice as any).invoiceNumber;

      const updatedManifests = newManifestNumber ? [newManifestNumber] : [];

      const updateData: any = {
        manifestNumber: newManifestNumber || null,
        manifestNumbers: updatedManifests
      };

      if (newInvoiceNumber && newInvoiceNumber !== oldInvoiceNumber) {
        updateData.invoiceNumber = newInvoiceNumber;
      }

      const invoiceRef = doc(db, 'invoices', invoice.id);
      await updateDoc(invoiceRef, updateData);

      setLiveInvoiceData(prev => {
        const next = new Map(prev);
        const ex = next.get(invoice.id) || {};
        next.set(invoice.id, {
          ...ex,
          ...updateData
        } as any);
        return next;
      });

      const manifestChanged = newManifestNumber !== oldManifest;
      const invoiceNumberChanged = newInvoiceNumber && newInvoiceNumber !== oldInvoiceNumber;

      if (manifestChanged || invoiceNumberChanged) {
        const invoiceItems = (invoice as any).invoiceItems || (invoice as any).items || [];
        const trackings = invoiceItems
          .map((i: any) => i.package?.trackingNumber || i.trackingNumber)
          .filter(Boolean);

        if (trackings.length > 0) {
          const packagesQuery = query(collection(db, 'packages'), where('trackingNumber', 'in', trackings.slice(0, 30)));
          const pkgSnapDocs = (await getDocs(packagesQuery)).docs;

          const now = new Date().toISOString();
          const pkgBatch = writeBatch(db);
          let pkgOps = 0;
          pkgSnapDocs.forEach((d: any) => {
            const pkgUpdate: any = {};
            if (manifestChanged) {
              pkgUpdate.manifestNumber = newManifestNumber || null;
              pkgUpdate.updatedManifest = newManifestNumber || null;
              pkgUpdate.manifestUpdatedAt = now;
            }
            if (invoiceNumberChanged) {
              pkgUpdate.invoiceNumber = newInvoiceNumber;
            }
            if (Object.keys(pkgUpdate).length > 0) {
              pkgBatch.update(doc(db, 'packages', d.id), pkgUpdate);
              pkgOps++;
            }
          });
          if (pkgOps > 0) await pkgBatch.commit();

          if (manifestChanged && oldManifest && newManifestNumber) {
            await movePackagesBetweenManifestDocs(trackings, oldManifest, newManifestNumber, [invoice.id]).catch(() => { });
          }
        }
      }

      toast({
        title: "Datos actualizados",
        description: `Factura y manifiesto corregidos exitosamente.`,
      });
      setReassigningManifestInvoice(null);
    } catch (err: any) {
      console.error("Error al corregir datos:", err);
      toast({
        title: "Error",
        description: err?.message || "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsReassigningManifest(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string, invoiceNumber?: string) => {
    try {
      await deleteInvoiceMutation.mutateAsync({
        id: invoiceId,
        deletedBy: user?.id ?? 'unknown',
        deletedByName: user?.fullName ?? 'unknown',
        invoiceNumber,
      });
      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_deleted',
        category: 'invoice',
        resource: '/invoices',
        resourceId: invoiceId,
        result: 'success',
        metadata: { invoiceNumber },
      });
      toast({
        title: t("common.success"),
        description: t("invoiceDeleted"),
      });
    } catch (error) {
      console.error("Failed to delete invoice:", error);
      toast({
        title: t("common.error"),
        description: t("failedDelete"),
        variant: "destructive",
      });
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    const { type, invoiceId, invoiceNumber, data } = confirmAction;

    try {
      switch (type) {
        case 'pdf':
          await createAuditLog(invoiceId, 'PDF_GENERATED', { invoiceNumber });
          setConfirmAction(null);
          await handleGeneratePDF(invoiceId);
          break;
        case 'email':
          await createAuditLog(invoiceId, 'EMAIL_SENT', { invoiceNumber });
          setConfirmAction(null);
          await handleSendEmail(invoiceId, emailSendOptions, invoicesById.get(invoiceId));
          break;
        case 'sms':
          await createAuditLog(invoiceId, 'SMS_SENT', { invoiceNumber });
          setConfirmAction(null);
          await handleSendSMS(invoiceId);
          break;
        case 'whatsapp':
          await createAuditLog(invoiceId, 'WHATSAPP_OPENED', { invoiceNumber, phone: data?.phone });
          setConfirmAction(null);
          handleOpenWhatsApp(data?.phone);
          break;
        case 'annul': {
          await createAuditLog(invoiceId, 'INVOICE_ANNULLED', { invoiceNumber });
          const targetMf = annulMode === 'manifest' ? annulSelectedManifest ?? undefined : undefined;

          // Auto-enable consolidation if requested and currently disabled in SP1 or SP2
          const inv = invoices.find(i => i.id === invoiceId);
          const slCode = inv?.slCode || inv?.customerId || (inv as any)?.clientSlCode || '';
          if (
            annulMode === 'consolidation' &&
            autoEnableConsolidation &&
            (customerConsolidationEnabledSP1 === false || customerConsolidationEnabledSP2 === false) &&
            slCode
          ) {
            try {
              const { updateCustomerConsolidation } = await import('@/lib/services/customer-sync');
              await updateCustomerConsolidation(slCode, true);
            } catch (err) {
              console.warn('[annul action] Failed to enable customer consolidation automatically:', err);
            }
          }

          setConfirmAction(null);
          setAnnulMode('consolidation');
          setAnnulManifestInput('');
          setAnnulManifestMatches([]);
          setAnnulSelectedManifest(null);
          setAnnulDropdownOpen(false);
          await handleAnnulInvoice(invoiceId, targetMf);
          break;
        }
        case 'delete':
          setConfirmAction(null);
          setDeleteConfirmText('');
          await handleDeleteInvoice(invoiceId, invoiceNumber);
          break;
        case 'status':
          await createAuditLog(invoiceId, 'STATUS_CHANGED', {
            invoiceNumber,
            oldStatus: data?.oldStatus,
            newStatus: data?.newStatus
          });
          setConfirmAction(null);
          await handleStatusChange(invoiceId, data?.newStatus, statusChangeOptions);
          break;
        case 'bulk-delete':
          setConfirmAction(null);
          await handleBulkDelete();
          break;
        case 'bulk-email':
          setConfirmAction(null);
          await handleBulkSendEmail();
          break;
        case 'bulk-strip':
          setConfirmAction(null);
          await handleBulkStripRounding();
          break;
        case 'bulk-merge':
          setConfirmAction(null);
          await handleBulkMerge();
          break;
        case 'bulk-status':
          setConfirmAction(null);
          await handleBulkStatusUpdate(data?.newStatus as InvoiceStatus, bulkStatusOptions);
          break;
        case 'bulk-sync':
          setConfirmAction(null);
          handleOpenSyncInvoices(selectedInvoicesList);
          break;
        default:
          setConfirmAction(null);
      }
    } catch (error) {
      console.error('Action failed:', error);
      setConfirmAction(null);
    }
  };
  const isFiltersDirty = useMemo(() => {
    const limitChanged = dataLoadLimit !== appliedDataLoadLimit;
    if (limitChanged) return true;

    const searchChanged = invoiceSearchTerm.trim() !== appliedInvoiceSearchTerm.trim();
    const manifestChanged = manifestFilter !== appliedManifestFilter;
    const routeChanged = routeFilter !== appliedRouteFilter;
    const statusChanged = 
      invoiceStatusFilters.length !== appliedInvoiceStatusFilters.length ||
      !invoiceStatusFilters.every(s => appliedInvoiceStatusFilters.includes(s));
    const tempChanged = tempCustomerFilter !== appliedTempCustomerFilter;

    if (searchChanged || manifestChanged || routeChanged || statusChanged || tempChanged) {
      // If we have loaded data and we have local matches, we are NOT dirty.
      if (hasSearched && invoices.length > 0 && filteredInvoices.length > 0) {
        return false;
      }
      return true;
    }

    return false;
  }, [
    invoiceSearchTerm, appliedInvoiceSearchTerm,
    manifestFilter, appliedManifestFilter,
    dataLoadLimit, appliedDataLoadLimit,
    tempCustomerFilter, appliedTempCustomerFilter,
    routeFilter, appliedRouteFilter,
    invoiceStatusFilters, appliedInvoiceStatusFilters,
    hasSearched, invoices.length, filteredInvoices.length
  ]);

  const showPlaceholder = !hasSearched || (!isGeneralQueryActive && appliedManifestFilter === 'all' && appliedRouteFilter === 'all' && !appliedInvoiceSearchTerm.trim());

  // Check if user has permission
  if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8">
          <Card className="p-8 text-center bg-muted/30">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2 text-foreground">{t("accessDenied")}</h2>
            <p className="text-muted-foreground">{t("accessDeniedDescription")}</p>
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
        transition={{ duration: 0.25 }}
        className="p-4 md:p-6 space-y-4"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2">
          <div>
            <h1
              className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
              data-testid="invoices-page-title"
            >
              {t("title")}
            </h1>
            <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {t("createAndManage")}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
            {/* Stats summary pill — now next to the sync button in the header */}
            {invoices.length > 0 && (
              <div
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 rounded-md text-xs font-medium border shrink-0 transition-all duration-300 h-10 relative overflow-hidden",
                  (isLoading || trackingSearching)
                    ? "bg-muted/70 border-transparent w-48"
                    : "border-border bg-background text-muted-foreground w-auto"
                )}
              >
                <AnimatePresence mode="wait">
                  {(isLoading || trackingSearching) ? (
                    <motion.div
                      key="skeleton"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 bg-muted/60 animate-pulse"
                    />
                  ) : (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
                    >
                      <span className="font-bold text-foreground">{stableStats.count}</span>
                      <span>factura{stableStats.count !== 1 ? "s" : ""}</span>
                      {stableStats.totalWeight !== undefined && stableStats.totalWeight > 0 && (
                        <>
                          <span className="text-border select-none">·</span>
                          <span className="font-semibold text-foreground">{stableStats.totalWeight.toFixed(2)} kg</span>
                        </>
                      )}
                      {stableStats.totalAmount !== undefined && stableStats.totalAmount > 0 && (
                        <>
                          <span className="text-border select-none">·</span>
                          <span className="font-semibold text-foreground">
                            ${stableStats.totalAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => setSyncVerifierOpen(true)}
              className={cn("shrink-0 gap-1.5", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
              title="Verificar y corregir facturas desincronizadas con SmartWeb"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Auditar (sync)</span>
              <span className="sm:hidden">Auditar</span>
            </Button>

            <Button
              asChild
              className={`shrink-0 gap-1.5 ${
                isDark
                  ? "bg-white text-black hover:bg-gray-100"
                  : "bg-black text-white hover:bg-gray-900"
              }`}
              aria-label="Create new invoice"
              data-testid="create-invoice-btn"
            >
              <Link to="/invoices/create">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t("newInvoice")}</span>
                <span className="sm:hidden">Nuevo</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <FilterBar
          invoiceSearchTerm={invoiceSearchTerm}
          setInvoiceSearchTerm={setInvoiceSearchTerm}
          setPageIndex={setPageIndex}
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
          invoiceStatusFilters={invoiceStatusFilters}
          setInvoiceStatusFilters={setInvoiceStatusFilters}
          statusFilterOpen={statusFilterOpen}
          setStatusFilterOpen={setStatusFilterOpen}
          manifestFilter={manifestFilter}
          setManifestFilter={setManifestFilter}
          manifestOptions={manifestOptions}
          manifestPackageCounts={manifestPackageCounts}
          dataLoadLimit={dataLoadLimit}
          setDataLoadLimit={setDataLoadLimit}
          routeFilter={routeFilter}
          setRouteFilter={setRouteFilter}
          routeOptions={routeOptions}
          tempCustomerFilter={tempCustomerFilter}
          setTempCustomerFilter={setTempCustomerFilter}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          setExpandedGroups={setExpandedGroups}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          onSearch={handleSearchClick}
          onClearFilters={handleClearFiltersClick}
          isFiltersDirty={isFiltersDirty}
          hasSearched={hasSearched}
        />

        {/* ── Invoice table ─────────────────────────────────────────────────── */}
        <Card className={`overflow-hidden border-0 shadow-none ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
          {/* Bulk action bar — only shown when rows are selected */}
          <BulkActionsBar
            selectedCount={selectedCount}
            bulkSending={bulkSending}
            bulkDeleting={bulkDeleting}
            bulkStripping={bulkStripping}
            bulkMerging={bulkMerging}
            bulkUpdatingStatus={bulkUpdatingStatus}
            bulkSyncingInvoices={bulkSyncingInvoices}
            bulkTcSubmitting={bulkTcSubmitting}
            bulkProgress={bulkProgress}
            canMerge={canMerge}
            onClearSelection={React.useCallback(() => setSelectedIds(new Set()), [])}
            onBulkEmail={React.useCallback(() => showConfirmation('bulk-email', '', '', { count: selectedCount, encomiendaMissingTerceroCount }), [selectedCount, encomiendaMissingTerceroCount])}
            onBulkStrip={React.useCallback(() => showConfirmation('bulk-strip', '', '', { count: selectedCount }), [selectedCount])}
            onBulkMerge={React.useCallback(() => showConfirmation('bulk-merge', '', '', { count: selectedCount }), [selectedCount])}
            onBulkStatus={React.useCallback((status) => {
              const selectedList = invoices.filter(i => selectedIds.has(i.id));
              const annulledCount = selectedList.filter(i => i.status === 'annulled' || i.status === 'cancelled').length;
              showConfirmation('bulk-status', '', '', { newStatus: status, count: selectedCount, annulledCount });
            }, [selectedIds, invoices, selectedCount, showConfirmation])}
            onBulkSync={React.useCallback(() => showConfirmation('bulk-sync', '', '', { count: selectedCount }), [selectedCount])}
            onBulkTcUpdate={React.useCallback(() => setBulkTcModalOpen(true), [])}
            onBulkPaymentMethod={React.useCallback(() => setBulkPaymentModalOpen(true), [])}
            onBulkDelete={React.useCallback(() => showConfirmation('bulk-delete', '', '', { count: selectedCount }), [selectedCount])}
            t={t}
          />

          <AnimateHeight>
            <AnimatePresence mode="wait">
              {isLoading || trackingSearching ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <InvoicesDataTable
                    invoices={[]}
                    routes={dbRoutes}
                    loading={true}
                    selectedInvoices={selectedIds}
                    onToggleSelection={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    onShowDetails={() => {}}
                    onSaveField={async () => {}}
                    canUpdate={canUpdate}
                    canManage={canManage}
                    syncingInvoiceId={null}
                    onForceSync={async () => {}}
                    onReassignCustomer={() => {}}
                    onReassignManifest={() => {}}
                    onSuggestAI={() => {}}
                    onAnnul={() => {}}
                    onRestore={async () => {}}
                    onDelete={() => {}}
                    suggestingAIId={null}
                    manifests={manifestOptions}
                    onPreview={() => {}}
                    onSendEmail={() => {}}
                    sendingEmailId={null}
                    onReturnPackages={handleReturnPackages}
                    t={t}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </motion.div>
              ) : showPlaceholder ? (
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
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Búsqueda de Facturas Requerida</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Por razones de costo operativo e incremento de eficiencia, esta vista no pre-carga datos de facturas automáticamente. Por favor, selecciona un filtro o escribe una consulta JQL en la barra superior y presiona el botón <strong>Buscar</strong> para cargar la información.
                  </p>
                </motion.div>
              ) : displayedFilteredInvoices.length === 0 && !trackingSearching ? (
                isEncomiendaRouteMismatch ? (
                  <motion.div
                    key="encomienda-mismatch"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="py-16 px-6 text-center max-w-md mx-auto flex flex-col items-center justify-center border border-amber-200/60 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/10 rounded-xl shadow-sm"
                  >
                    <div className="p-3.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 mb-4">
                      <AlertTriangle className="h-8 w-8 animate-bounce" style={{ animationDuration: '3s' }} />
                    </div>
                    <h3 className="text-base font-bold text-amber-800 dark:text-amber-400 mb-2">¿Filtro de ruta incorrecto?</h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed mb-6">
                      Estás buscando en un manifiesto de encomiendas (<strong>{appliedManifestFilter}</strong>) pero filtrando por la ruta <strong>{appliedRouteFilter}</strong>. Un manifiesto de encomiendas rara vez tendrá una ruta distinta a <strong>Encomiendas</strong>.
                    </p>
                    <div className="flex gap-2 w-full justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-950 text-amber-800 dark:text-amber-300"
                        onClick={() => {
                          setRouteFilter("Encomiendas");
                          handleSearchWithRoute("Encomiendas");
                        }}
                      >
                        Cambiar a ruta Encomiendas
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-700 hover:text-amber-800 hover:bg-amber-100/50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                        onClick={() => {
                          setRouteFilter("all");
                          handleSearchWithRoute("all");
                        }}
                      >
                        Quitar filtro de ruta
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="py-16 text-center"
                  >
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("noInvoicesFound")}</p>
                  </motion.div>
                )
              ) : groupedData !== null ? (
                <motion.div
                  key="grouped"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="divide-y divide-border"
                >
                  {Array.from(groupedData.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([groupKey, groupInvoices]) => {
                    const isOpen = expandedGroups.has(groupKey);
                    const total = groupInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0);
                    return (
                      <div key={groupKey}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupKey)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                        >
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            : <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          <span className="text-sm font-semibold text-foreground truncate flex-1">{groupKey}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{groupInvoices.length} factura{groupInvoices.length !== 1 ? 's' : ''}</span>
                          <span className="text-xs font-bold text-foreground shrink-0">${total.toFixed(2)}</span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <ul className="divide-y divide-border" role="list">
                                {groupInvoices.map((rawInvoice, index) => {
                                  const isExpanded = expandedRows.has(rawInvoice.id);
                                  const invoice = { ...rawInvoice, ...(liveInvoiceData.get(rawInvoice.id) ?? {}) } as Invoice;
                                  const isAnnulled = invoice.status === "annulled";
                                  const isOrphanRow = isOrphanSlCode((invoice as any).slCode || invoice.customer?.slCode) || isOrphanInvoiceNumber(invoice.invoiceNumber);
                                  return (
                                    <motion.li
                                      key={invoice.id}
                                      initial={{ opacity: 0, y: -4 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.15, delay: index * 0.01 }}
                                      data-orphan={isOrphanRow ? 'true' : undefined}
                                      className={cn(
                                        isOrphanRow
                                          ? "bg-red-50/70 dark:bg-red-950/20 border-l-2 border-l-red-300 dark:border-l-red-800"
                                          : "bg-card"
                                      )}
                                    >
                                      <div
                                        className={cn("flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer pl-10", isAnnulled && "opacity-50")}
                                        onClick={() => toggleRowExpansion(invoice.id)}
                                      >
                                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelect(invoice.id); }} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label={selectedIds.has(invoice.id) ? 'Deseleccionar' : 'Seleccionar'}>
                                          {selectedIds.has(invoice.id) ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                                        </button>
                                        <span className="shrink-0 text-muted-foreground/60" aria-hidden>{isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[invoice.status as InvoiceStatus])} aria-hidden />
                                            <span
                                              className={cn(
                                                "text-sm font-semibold truncate",
                                                isOrphanInvoiceNumber(invoice.invoiceNumber)
                                                  ? "text-red-600 dark:text-red-400"
                                                  : "text-foreground"
                                              )}
                                              title={isOrphanInvoiceNumber(invoice.invoiceNumber) ? TEMP_WARNING_TITLE : undefined}
                                            >
                                              {invoice.invoiceNumber}
                                            </span>
                                          </div>
                                          {(invoice.customer || invoice.clientName) && (
                                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                              {isOrphanSlCode((invoice as any).slCode || invoice.customer?.slCode) && (
                                                <span
                                                  className="inline-flex items-center gap-1 shrink-0 rounded-md border border-red-400 bg-red-50 dark:bg-red-950/40 dark:border-red-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300 animate-pulse"
                                                  title={TEMP_WARNING_TITLE}
                                                  aria-label="Cliente temporal — requiere reasignación"
                                                >
                                                  <AlertTriangle className="h-3.5 w-3.5 fill-red-200 dark:fill-red-900 stroke-red-700 dark:stroke-red-300" />
                                                  Temporal
                                                </span>
                                              )}
                                              <span className="text-sm font-medium text-foreground">{(invoice.customer?.fullName || invoice.clientName)?.toUpperCase()}</span>
                                              {(invoice.customer?.email || invoice.clientEmail) && (
                                                <>
                                                  <span className="text-[11px] text-muted-foreground/50">·</span>
                                                  <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{invoice.customer?.email || invoice.clientEmail}</span>
                                                </>
                                              )}
                                            </div>
                                          )}
                                          {(() => {
                                            const live = liveInvoiceData.get(invoice.id) as any;
                                            const isDANP = (invoice.manifestNumber || '').toUpperCase().includes('DANP');
                                            const hasPermits = isDANP || invoice.invoiceItems?.some(i => i.requiresPermit) || (invoice as any).hasPermitItems || live?.hasPermitItems || live?.invoiceItems?.some((i: any) => i.requiresPermit);
                                            const ruta = (liveInvoiceData.get(invoice.id) as any)?.clientRoute || (liveInvoiceData.get(invoice.id) as any)?.customer?.ruta || invoice.customer?.ruta || (invoice as any).clientRoute;
                                            if (!ruta && !invoice.manifestNumber && !hasPermits) return null;
                                            return (
                                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                                <RoutePicker
                                                  value={ruta || ""}
                                                  onChange={(route) => handleChangeRoute(invoice, route)}
                                                  routes={dbRoutes}
                                                  changing={changingRouteId === invoice.id}
                                                  isEncomienda={ruta === "Encomiendas"}
                                                  encomiendaName={ruta === "Encomiendas" ? getEncomiendaServiceName(invoice) : undefined}
                                                />
                                                {invoice.manifestNumber && (
                                                  <span className={cn(
                                                    "inline-flex items-center gap-0.5 text-[10px] font-medium border rounded px-1.5 py-0.5",
                                                    invoice.source === 'maritime'
                                                      ? "text-cyan-700 bg-cyan-50 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"
                                                      : "text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                                                  )}>
                                                    {invoice.source === 'maritime' && <Ship className="h-3 w-3 mr-1 text-blue-500" />}
                                                    {invoice.manifestNumber}
                                                  </span>
                                                )}
                                                {(() => { const _li = { ...invoice, ...(liveInvoiceData.get(invoice.id) ?? {}) }; return isEncomiendaInvoice(_li) && !hasTerceroItem(_li); })() && (
                                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5" title="Esta factura de Encomiendas no tiene el item SERVICIO DE TERCERO">
                                                    <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                                    SIN COBRO DE TERCEROS
                                                  </span>
                                                )}
                                                {hasPermits && (
                                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5">
                                                    &#9888; PERMISOS
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                        <div className="shrink-0 hidden sm:block">
                                          <Badge variant="outline" className={cn("text-xs", getStatusColor(invoice.status as InvoiceStatus))}>{t(invoice.status)}</Badge>
                                        </div>
                                        {(() => {
                                          const usd = Number(invoice.totalAmount) || 0;
                                          const tc = Number((invoice as any).exchangeRate) || 0;
                                          const crcStored = Number((invoice as any).amountCRC) || 0;
                                          const crc = crcStored > 0 ? crcStored : (tc > 0 ? Math.round(usd * tc) : 0);
                                          return (
                                            <div className="shrink-0 text-right hidden md:block">
                                              <p className="text-sm font-bold leading-tight">
                                                ${usd.toFixed(2)}
                                                {crc > 0 && (
                                                  <span className="ml-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                                    · ₡{crc.toLocaleString('es-CR').replace(/\s/g, ".")}
                                                  </span>
                                                )}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                                                {tc > 0 && (
                                                  <span
                                                    className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-mono"
                                                    title={`Tipo de cambio: ₡${tc}/$`}
                                                  >
                                                    TC ₡{tc}
                                                  </span>
                                                )}
                                                <span>{safeFormatDate((invoice as any).invoiceDate || (invoice as any).createdAt || (invoice as any).date) || '—'}</span>
                                              </p>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      <AnimatePresence initial={false}>
                                        {isExpanded && (
                                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                            <div className="px-12 py-3 border-t border-border bg-muted/20">
                                              <div className="flex flex-wrap gap-2">
                                                <Button variant="outline" size="sm" onClick={() => handlePreviewInvoice(invoice.id)} className="h-7 text-xs gap-1.5"><Eye className="h-3 w-3" />Ver</Button>
                                                <Button variant="outline" size="sm" disabled={sendingEmailId === invoice.id || isAnnulled} onClick={() => handleSendEmail(invoice.id, emailSendOptions, invoice)} className="h-7 text-xs gap-1.5"><Mail className="h-3 w-3" />{invoice.emailSent ? 'Reenviar' : 'Email'}</Button>
                                                <Button variant="outline" size="sm" disabled={isAnnulled} onClick={() => handleOpenEditModal(invoice)} className="h-7 text-xs gap-1.5 text-indigo-600"><Pencil className="h-3 w-3" />Editar</Button>
                                                {(() => {
                                                  const orphanOwner = isOrphanSlCode((invoice as any).slCode || invoice.customer?.slCode);
                                                  return (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => setReassigningInvoice(invoice)}
                                                      className={cn(
                                                        "h-7 text-xs gap-1.5",
                                                        orphanOwner
                                                          ? "text-red-600 border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 animate-pulse"
                                                          : "text-violet-600"
                                                      )}
                                                      title={orphanOwner ? TEMP_WARNING_TITLE : undefined}
                                                    >
                                                      {orphanOwner ? <AlertTriangle className="h-3 w-3" /> : <UserCog className="h-3 w-3" />}
                                                      Reasignar
                                                    </Button>
                                                  );
                                                })()}
                                                <Button variant="outline" size="sm" onClick={() => showConfirmation('delete', invoice.id, invoice.invoiceNumber)} className="h-7 text-xs gap-1.5 text-red-600"><Trash2 className="h-3 w-3" />Eliminar</Button>
                                              </div>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </motion.li>
                                  );
                                })}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="table"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <InvoicesDataTable
                    invoices={paginatedInvoices.map(raw => ({
                      ...raw,
                      ...(liveInvoiceData.get(raw.id) ?? {}),
                    }))}
                    routes={dbRoutes}
                    loading={isLoading || trackingSearching}
                    selectedInvoices={selectedIds}
                    onToggleSelection={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    onShowDetails={(inv) => handleOpenEditModal(inv as Invoice)}
                    onSaveField={handleSaveField}
                    canUpdate={canUpdate}
                    canManage={canManage}
                    syncingInvoiceId={null}
                    onForceSync={handleForceSync}
                    onReassignCustomer={(invoiceId, currentId, currentName, currentslCode) => {
                      const inv = invoices.find(i => i.id === invoiceId);
                      if (inv) setReassigningInvoice(inv as Invoice);
                    }}
                    onReassignManifest={(inv) => setReassigningManifestInvoice(inv as Invoice)}
                    onSuggestAI={(inv) => handleSuggestAIQuick(inv as Invoice)}
                    onAnnul={(invoiceId, invoiceNumber, manifestNumber) =>
                      showConfirmation('annul', invoiceId, invoiceNumber, { manifestNumber: manifestNumber || '' })
                    }
                    onRestore={(invoiceId) => handleDeannulInvoice(invoiceId)}
                    onDelete={(invoiceId, invoiceNumber) =>
                      showConfirmation('delete', invoiceId, invoiceNumber)
                    }
                    suggestingAIId={suggestingAIQuickId}
                    t={t}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    manifests={manifestsForDataTable}
                    onPreview={handlePreviewInvoice}
                    onSendEmail={(id) => handleSendEmail(id)}
                    sendingEmailId={sendingEmailId}
                    onReturnPackages={handleReturnPackages}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination footer — inside the Card like Packages */}
            <AnimatePresence>
              {!isLoading && !showPlaceholder && groupBy === 'none' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t ${isDark ? "border-gray-700" : "border-gray-200"} overflow-hidden`}
                  role="navigation"
                  aria-label={t("common.rowsPerPage") || "Filas por página"}
                  data-testid="pagination-controls"
                >
                  <div className="flex items-center gap-2" data-testid="pagination-rows-per-page">
                    <label 
                      htmlFor="rows-per-page" 
                      className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                    >
                      {t("common.rowsPerPage") || "Filas por página"}:
                    </label>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(val) => {
                        setPageSize(Number(val));
                        setPageIndex(0);
                      }}
                    >
                      <SelectTrigger 
                        id="rows-per-page"
                        className={`w-20 h-8 text-sm ${isDark ? "bg-gray-700 border-gray-600" : ""}`}
                        aria-label={t("common.rowsPerPage") || "Filas por página"}
                        data-testid="pagination-page-size-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25" data-testid="pagination-page-size-25">25</SelectItem>
                        <SelectItem value="50" data-testid="pagination-page-size-50">50</SelectItem>
                        <SelectItem value="100" data-testid="pagination-page-size-100">100</SelectItem>
                        <SelectItem value="999999" data-testid="pagination-page-size-all">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3" data-testid="pagination-info">
                    <span 
                      className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                      aria-live="polite"
                      data-testid="pagination-range-text"
                    >
                      {t("common.showing") || "Mostrando"} {displayedFilteredInvoices.length === 0 ? 0 : pageIndex * pageSize + 1}-{Math.min((pageIndex + 1) * pageSize, displayedFilteredInvoices.length)} {t("common.of") || "de"} {displayedFilteredInvoices.length}
                    </span>
                    <div className="flex gap-1" role="group" aria-label={`Página ${pageIndex + 1} de ${totalPages}`} data-testid="pagination-buttons">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageIndex(0)}
                        disabled={pageIndex === 0}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label="Primera página"
                        data-testid="pagination-first-page"
                      >
                        <span aria-hidden="true">««</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                        disabled={pageIndex === 0}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label={t("previous")}
                        data-testid="pagination-prev-page"
                      >
                        <span aria-hidden="true">«</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
                        disabled={pageIndex >= totalPages - 1}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label={t("next")}
                        data-testid="pagination-next-page"
                      >
                        <span aria-hidden="true">»</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageIndex(totalPages - 1)}
                        disabled={pageIndex >= totalPages - 1}
                        className={cn("h-8 px-2 text-sm", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
                        aria-label="Última página"
                        data-testid="pagination-last-page"
                      >
                        <span aria-hidden="true">»»</span>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </AnimateHeight>
        </Card>
      </motion.div>

      {/* ── Edit Invoice Modal ────────────────────────────────────────────── */}
      <EditInvoiceModal
        isOpen={editingInvoice !== null}
        invoice={editingInvoice}
        onClose={() => setEditingInvoice(null)}
        invoices={invoices}
        allManifestNumbers={manifestOptions}
        manifestPackageCounts={manifestPackageCounts}
      />

      {/* ── Invoice Preview Modal (with inline send) ──────────────────────── */}
      {showPreviewModal && previewInvoice && (
        <NovaInvoicePreview
          invoice={previewInvoice}
          onClose={() => { setShowPreviewModal(false); setPreviewInvoice(null); }}
          onConfirmSend={async () => {
            if (previewInvoice.id) await handleSendEmail(previewInvoice.id, emailSendOptions, previewInvoice);
          }}
          onTestSend={async (inv, email) => {
            await sendTestInvoiceEmail(inv as any, email);
          }}
        />
      )}

      {generatingPDFId && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              <div className="h-12 w-12 rounded-full border-4 border-slate-100 dark:border-slate-800 border-t-red-600 dark:border-t-red-500 animate-spin" />
              <Loader2 className="absolute h-5 w-5 text-red-600 dark:text-red-500 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Estamos cargando su factura...
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Por favor, espere un momento.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ────────────────────────────────────────────── */}
      <InvoiceConfirmationDialog
        isOpen={confirmAction?.show ?? false}
        confirmAction={confirmAction}
        onClose={() => {
          setConfirmAction(null);
          setDeleteConfirmText('');
          setBulkActionConfirmed(false);
          setCopiedInvoiceNumber(false);
          setAnnulMode('consolidation');
          setAnnulManifestInput('');
          setAnnulManifestMatches([]);
          setAnnulSelectedManifest(null);
          setAnnulDropdownOpen(false);
        }}
        onConfirm={handleConfirmAction}
        annulMode={annulMode}
        setAnnulMode={setAnnulMode}
        annulSelectedManifest={annulSelectedManifest}
        setAnnulSelectedManifest={setAnnulSelectedManifest}
        annulManifestInput={annulManifestInput}
        setAnnulManifestInput={setAnnulManifestInput}
        annulManifestLoading={annulManifestLoading}
        annulManifestMatches={annulManifestMatches}
        annulDropdownOpen={annulDropdownOpen}
        setAnnulDropdownOpen={setAnnulDropdownOpen}
        deleteConfirmText={deleteConfirmText}
        setDeleteConfirmText={setDeleteConfirmText}
        copiedInvoiceNumber={copiedInvoiceNumber}
        setCopiedInvoiceNumber={setCopiedInvoiceNumber}
        bulkActionConfirmed={bulkActionConfirmed}
        setBulkActionConfirmed={setBulkActionConfirmed}
        emailSendOptions={emailSendOptions}
        setEmailSendOptions={setEmailSendOptions}
        statusChangeOptions={statusChangeOptions}
        setStatusChangeOptions={setStatusChangeOptions}
        bulkStatusOptions={bulkStatusOptions}
        setBulkStatusOptions={setBulkStatusOptions}
        customerConsolidationEnabledSP1={customerConsolidationEnabledSP1}
        customerConsolidationEnabledSP2={customerConsolidationEnabledSP2}
        autoEnableConsolidation={autoEnableConsolidation}
        setAutoEnableConsolidation={setAutoEnableConsolidation}
        allManifestNumbers={manifestOptions}
        manifestPackageCounts={manifestPackageCounts}
      />

      {/* ── Shipping label modal (single encomienda invoice) ────────── */}
      <NovaShippingLabelModal
        data={shippingLabelData}
        onClose={() => setShippingLabelData(null)}
      />

      {/* ── Bulk shipping labels modal (multiple encomienda invoices) ── */}
      {bulkLabelQueue.length > 0 && (
        <EncomiendaBulkLabelModal
          queue={bulkLabelQueue}
          onClose={() => setBulkLabelQueue([])}
        />
      )}

      {/* ── Invoice → SmartWeb sync modal ───────────────────────────── */}
      <SyncInvoicesModal
        open={syncInvoicesOpen}
        invoices={syncInvoiceTargets}
        onClose={() => {
          setSyncInvoicesOpen(false);
          setSyncInvoiceTargets([]);
        }}
        onDone={(res) => {
          setBulkSyncingInvoices(false);
          setSelectedIds(new Set());
          if (res) {
            const syncedAt = new Date().toISOString();
            const succeededIds = new Set(
              res.results
                .filter(r => r.outcome === 'created' || r.outcome === 'updated')
                .map(r => r.invoiceId),
            );
            setLiveInvoiceData(prev => {
              const next = new Map(prev);
              for (const id of succeededIds) {
                const ex = next.get(id) || {};
                next.set(id, { ...ex, smartwebSynced: true, smartwebSyncedAt: syncedAt } as any);
              }
              return next;
            });

            // Log each sync result to system logs
            if (res.results) {
              for (const r of res.results) {
                logAction({
                  userId: user?.id ?? 'unknown',
                  userName: user?.fullName,
                  userEmail: user?.email,
                  userRole: user?.role,
                  action: 'invoice_updated',
                  category: 'invoice',
                  resource: '/invoices',
                  resourceId: r.invoiceId,
                  result: r.outcome === 'error' ? 'error' : 'success',
                  errorMessage: r.outcome === 'error' ? r.reason : undefined,
                  metadata: {
                    invoiceNumber: r.invoiceNumber,
                    syncOutcome: r.outcome,
                    syncReason: r.reason,
                    shipmentLinks: r.shipmentLinks,
                    note: `Sincronización de factura con SmartWeb: ${r.outcome}${r.reason ? ` (${r.reason})` : ''}`
                  }
                });
              }
            }
          }
        }}
      />

      {/* ── Reassign invoice modal ────────────────────────────────────── */}
      {reassigningInvoice && (
        <ReassignCustomerModal
          open={!!reassigningInvoice}
          onClose={() => setReassigningInvoice(null)}
          entityId={reassigningInvoice.id}
          entityType="invoice"
          currentCustomerName={(reassigningInvoice as any).clientName ?? ''}
          currentslCode={(reassigningInvoice as any).slCode ?? (reassigningInvoice as any).clientSlCode ?? ''}
          onSave={async (invoiceId, customer) => {
            await handleReassignInvoice({
              slCode: customer.slCode,
              fullName: customer.fullName,
              email: customer.email || "",
            });
          }}
          updating={isReassigning}
        />
      )}

      {/* ── Reassign manifest modal ───────────────────────────────────── */}
      {reassigningManifestInvoice && (
        <ReassignManifestModal
          open={!!reassigningManifestInvoice}
          onOpenChange={(open) => { if (!open) setReassigningManifestInvoice(null); }}
          invoice={{
            id: reassigningManifestInvoice.id,
            invoiceNumber: (reassigningManifestInvoice as any).invoiceNumber ?? '',
            manifestNumber: (reassigningManifestInvoice as any).manifestNumber ?? '',
          }}
          onConfirm={handleReassignManifest}
          isLoading={isReassigningManifest}
        />
      )}

      {/* ── Post-reassign: prompt to resend invoice email to the new owner ── */}
      <ReassignResendPromptDialog
        prompt={reassignResendPrompt}
        onClose={() => setReassignResendPrompt(null)}
        onConfirm={async (invoiceId) => {
          // Email-only send — SP2 already synced during reassign, so
          // we explicitly disable syncSp2 + updatePackages here.
          await handleSendEmail(
            invoiceId,
            {
              sendEmail: true,
              updatePackages: false,
              syncSp2: false,
            },
            invoicesById.get(invoiceId)
          );
        }}
      />

      {/* ── Bulk TC update modal ───────────────────────────────────────────
          Derived from `selectedInvoicesList` so the summary shows live
          counts without an extra Firestore round-trip. Package count is an
          upper-bound estimate (counts distinct packageId + trackingNumber
          entries across the selection's invoiceItems); the service does
          the authoritative load. */}
      {(() => {
        const annulledCount = selectedInvoicesList.filter(inv => {
          const s = String((inv as any).status || '').toLowerCase();
          return s === 'annulled' || s === 'cancelled' || s === 'void';
        }).length;
        const pkgKeys = new Set<string>();
        const manifestKeys = new Set<string>();
        const tcSet = new Set<number>();
        for (const inv of selectedInvoicesList) {
          const items: any[] = Array.isArray((inv as any).invoiceItems) ? (inv as any).invoiceItems : [];
          for (const it of items) {
            if (it?.packageId) pkgKeys.add(`id:${it.packageId}`);
            else if (it?.trackingNumber) pkgKeys.add(`tk:${String(it.trackingNumber).toUpperCase()}`);
          }
          const mnSingle = (inv as any).manifestNumber;
          if (typeof mnSingle === 'string' && mnSingle) manifestKeys.add(mnSingle);
          const mnMulti = Array.isArray((inv as any).manifestNumbers) ? (inv as any).manifestNumbers : [];
          mnMulti.forEach((m: any) => { if (typeof m === 'string' && m) manifestKeys.add(m); });
          const tc = Number((inv as any).exchangeRate || 0);
          if (tc > 0) tcSet.add(Math.round(tc * 100) / 100);
        }
        const summary: BulkUpdateTcSelectionSummary = {
          invoicesCount: selectedInvoicesList.length,
          annulledInvoicesCount: annulledCount,
          packagesCount: pkgKeys.size,
          manifestsCount: manifestKeys.size,
          currentTcs: Array.from(tcSet).sort((a, b) => a - b),
        };
        return (
          <BulkUpdateTcModal
            open={bulkTcModalOpen}
            onOpenChange={setBulkTcModalOpen}
            summary={summary}
            isSubmitting={bulkTcSubmitting}
            onConfirm={handleBulkUpdateTc}
          />
        );
      })()}
      <BulkInvoicePaymentModal
        open={bulkPaymentModalOpen}
        onOpenChange={setBulkPaymentModalOpen}
        selectedInvoiceIds={Array.from(selectedIds)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          setSelectedIds(new Set());
        }}
      />
      <SyncVerifierModal
        open={syncVerifierOpen}
        onOpenChange={setSyncVerifierOpen}
        getFullInvoiceRecord={(id) => invoices.find(inv => inv.id === id)}
      />

      {/* ── Return packages confirmation dialog ────────────────────────────── */}
      <AlertDialog open={!!returnPackagesConfirmInvoice} onOpenChange={(open) => { if (!open) setReturnPackagesConfirmInvoice(null); }}>
        <AlertDialogContent className="max-w-md rounded-2xl border p-6 shadow-2xl animate-in fade-in duration-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold flex items-center gap-2 text-amber-600">
              <Undo2 className="h-5 w-5" />
              Devolver Paquetes
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2 leading-relaxed">
              ¿Estás seguro de mover todos los paquetes de la factura <strong className="text-foreground">{returnPackagesConfirmInvoice?.invoiceNumber || returnPackagesConfirmInvoice?.id}</strong> al estado <strong className="text-red-500 font-semibold">"Devuelto" (returned)</strong>?
              <br />
              <br />
              <span className="text-xs border-l-2 border-amber-500 pl-2 block text-muted-foreground bg-amber-500/5 py-1.5 rounded-r">
                <strong>Nota:</strong> Esta acción no anulará la factura, solo moverá los paquetes asociados al módulo de devoluciones para su gestión.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex items-center justify-end gap-2 mt-4">
            <AlertDialogCancel className="h-9 text-xs font-bold rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReturnPackages}
              className="h-9 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirmar Devolución
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
});

export default InvoiceGeneration;
