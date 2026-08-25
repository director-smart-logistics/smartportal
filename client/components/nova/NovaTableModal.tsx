import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  FileSpreadsheet,
  Bot,
  User,
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Download,
  ChevronDown,
  ChevronUp,
  Users,
  FileWarning,
  FileDown,
  Scale,
  Receipt,
  ShieldCheck,
  Clock,
  Package,
  Table2,
  DatabaseZap,
  X,
  Copy,
  Search,
  Unlink2,
  FileText,
  Mail,
  DollarSign,
  SendHorizontal,
  UserPen,
  SendHorizonal,
  RefreshCw,
  ArrowUpToLine,
  UserPlus,
  Sparkles,
  Link2,
  Tag,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  Printer,
  MoreHorizontal,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MapPin,
  ThumbsUp,
  EyeOff,
  Eye,
  Pencil,
  GitMerge,
  Trash2,
  FolderOpen,
  UserX,
  GraduationCap,
  Undo2,
} from "lucide-react";
import {
  useState,
  useCallback,
  useMemo,
  memo,
  useEffect,
  useRef,
  startTransition,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import type {
  NovaMessage as NovaMessageType,
  ProcessingStep,
  MultiMatchRowData,
} from "@/hooks/use-nova-chat";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { useFirebaseAuth } from "@/lib/context/FirebaseAuthContext";
import { NovaUnlinkActionModal, type GroupInfo } from "./NovaUnlinkActionModal";
import { NovaNameEditConfirmModal } from "./NovaNameEditConfirmModal";
import { NovaPesoEditConfirmModal } from "./NovaPesoEditConfirmModal";
import {
  ingestManifestToPackages,
  saveManifestRecord,
  saveEncomiendaManifestRows,
  getRecentManifests,
  isDivergentMatch,
  ProcessingResult,
  type ManifestRecord,
  loadManifestFromFirestore,
  checkPreAlertIntegrity,
  upsertManifestPackageOverrides,
} from "@/lib/services/manifest-processor";
import { updateCustomerRuta } from "@/lib/services/customer-sync";
import {
  loadUnmatchedRouteCache,
  lookupLearnedRoute,
  saveUnmatchedRouteLearning,
  saveMatchFeedback,
  saveMatchFeedbackBulk,
  loadLearnedMatches,
  reloadLearnedMatches,
  forgetMatchFeedback,
} from "@/lib/services/match-learning";
import { calculatePrice } from "@/lib/utils/pricing";
import { useNovaCustomerAssignment } from "@/hooks/use-nova-customer-assignment";
import { logAction } from "@/lib/services/audit-service";
import {
  searchCustomers as searchCustomersFirestore,
  type CustomerSearchResult,
} from "@/lib/firebase/firestore-client";
import { db } from "@/lib/firebase/config";
import { writeBatch, doc, collection, query, getDocs, where, deleteField, deleteDoc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion } from "firebase/firestore";
import {
  createInvoicesFromRows,
  deleteInvoicesByManifest,
  deleteInvoicesForTrackings,
  getInvoiceBreakdownByManifest,
  annulInvoicesByTrackingsAndManifest,
  RECREATE_PROTECTED_STATUSES,
  getInvoicesByManifest,
  subscribeInvoicesByManifest,
  deletePackagesByTrackings,
  sendInvoiceEmails,
  sendTestInvoiceEmail,
  groupRowsForInvoicing,
  getCustomersBySlCodes,
  subscribeCustomersBySlCodes,
  generateInvoiceNumber,
  isConsolidatedInvoice,
  type InvoiceRecord,
  type InvoiceManifestBreakdown,
  type CustomerContactInfo,
} from "@/lib/services/invoice-service";
import { useAuth } from "@/lib/context/FirebaseAuthContext";
import { useEncomiendaLookup } from "@/lib/services/encomienda-lookup";
import { NovaInvoicePreview } from "@/components/nova/NovaInvoicePreview";
import { NovaEditCustomerModal } from "@/components/nova/NovaEditCustomerModal";
import { NovaCustomerQuickViewModal } from "@/components/nova/NovaCustomerQuickViewModal";
import {
  NovaShippingLabelModal,
  type NovaShippingLabelData,
} from "@/components/nova/NovaShippingLabelModal";
import {
  type AjustePrecio,
  PriceAdjustmentModal,
} from "./NovaPriceAdjustmentModal";
import { CustomerSearchModal } from "./NovaCustomerSearchModal";
import { CreateCustomerModal } from "./NovaCreateCustomerModal";
import { RoutePickerModal } from "./NovaRoutePickerModal";
import {
  useRouteOptions,
  buildRouteOption,
  abbrevRoute,
} from "./nova-route-options";
import { batchCheckTrackingPreAlerts, watchTrackingPreAlerts, type PreAlertInfo } from "@/lib/services/nova-tools";
import { useNovaDataOrigin } from "@/hooks/use-nova-data-origin";
import { NovaAutoSaveIndicator } from "@/components/nova/modal/NovaAutoSaveIndicator";
import { useNovaAutoSave } from "@/hooks/use-nova-auto-save";
import { NovaRevalidateAllButton } from "@/components/nova/modal/NovaRevalidateAllButton";
import {
  NovaMergeGroupsConfirmModal,
  type MergeInvoiceImpact,
} from "@/components/nova/modal/NovaMergeGroupsConfirmModal";
import {
  NovaDeleteInvoiceConfirmModal,
  type DeleteInvoiceTarget,
} from "@/components/nova/modal/NovaDeleteInvoiceConfirmModal";
import {
  buildGroupFingerprint,
  findMergeTarget,
  findGroupSiblings,
  type MergeTarget,
  type GroupSibling,
} from "@/lib/nova/merge-groups";
import { deleteInvoiceById } from "@/lib/services/invoice-service";
import { deleteInvoiceFromSp2 } from "@/lib/services/sync-invoices-service";
import { applyIntegrityRepairs } from "@/lib/nova/integrity";
import { useNovaIntegrityAudit } from "@/hooks/use-nova-integrity-audit";
import { useNovaPackagesWatch } from "@/hooks/use-nova-packages-watch";
import { NovaIntegrityModal } from "@/components/nova/modal/NovaIntegrityModal";
import { createOrGetTempCustomer } from "@/lib/services/manifest-processor";
import {
  updateManifestExchangeRate,
  updateInvoicesExchangeRate,
} from "@/lib/services/update-exchange-rate-service";
import { NovaSaveConfirmModal } from "@/components/nova/modal/NovaSaveConfirmModal";
import { CopyCell } from "./NovaCopyCell";
import { MultiMatchSection } from "./NovaMultiMatchSection";
import {
  buildBoletaHTML,
  buildRouteManifestHTML,
  type BoletaPrintRow,
  type RouteManifestRow,
} from "@/lib/utils/nova-print";
import { useNovaResolvedRows } from "@/hooks/use-nova-resolved-rows";
import { useNovaPriceCalcs } from "@/hooks/use-nova-price-calcs";
import { useNovaDownloads } from "@/hooks/use-nova-downloads";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  computeSeparateInvoiceDefaults,
  computeMergedInvoiceDefaults,
  countActiveUnifiedGroups,
  computeAutoConsolidationKeys,
  computeAutoFacturaUnicaKeys,
  computeProtectedGroupKeys,
} from "@/lib/utils/nova-invoice-grouping";
import {
  subscribeManifestTerceros,
  createTerceroRow,
  updateTerceroRow,
  deleteTerceroRow,
  buildTerceroId,
  type NovaTerceroRow,
} from "@/lib/services/nova-terceros-service";
import { NovaTerceroRowCell } from "@/components/nova/NovaTerceroRowCell";
import { NovaTableSkeleton } from "./NovaTableSkeleton";

type GroupEntry = {
  row: {
    tracking: string;
    nombre: string;
    guia: string;
    manifiesto: string;
    peso: number;
    precio: number;
    slCode: string;
    nombreCliente: string;
    ruta: string;
    consolidacion: boolean;
    descripcion: string;
    permisos: boolean;
    pesoRedondeo: number;
    diferenciaRedondeo: number;
    pesoConsolidacion: number;
    precioSinPermiso: number;
    precioConPermiso: number;
    matchScore: number;
    matchSource?: "pre_alert" | "name";
    originalData: Record<string, unknown>;
  };
  originalIdx: number;
};

interface NovaCopyButtonProps {
  value: string;
  ariaLabel?: string;
  className?: string;
}

const NovaCopyButton = memo(function NovaCopyButton({
  value,
  ariaLabel,
  className,
}: NovaCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* fail silently */
      });
  }, [value]);

  return (
    <button
      type="button"
      title={copied ? "¡Copiado!" : "Copiar"}
      onClick={handleCopy}
      className={cn(
        "shrink-0 inline-flex items-center justify-center h-5 w-5 rounded border transition-all focus:outline-none focus:ring-1",
        copied
          ? "opacity-100 border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 focus:ring-emerald-500/40"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100 border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:border-emerald-500 focus:ring-emerald-500/40",
        className
      )}
      aria-label={ariaLabel ?? "Copiar"}
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
});

function fmtHoverDate(raw: unknown): string {
  if (!raw) return "";
  try {
    let d: Date;
    if (typeof raw === "object" && raw !== null && "_seconds" in (raw as any)) {
      d = new Date((raw as any)._seconds * 1000);
    } else if (typeof raw === "number") {
      d = new Date(raw);
    } else {
      d = new Date(String(raw));
    }
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-CR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export const ResultSummary = memo(function ResultSummary({
  resultData: propResultData,
  onDownload,
  onDownloadXLSX,
  onSelectMatch,
  embedMode = false,
  initialExchangeRate,
  onShowRecentManifests,
}: {
  resultData: NonNullable<NovaMessageType["resultData"]>;
  onDownload?: () => void;
  onDownloadXLSX?: () => void;
  onSelectMatch?: (
    rowIndex: number,
    slCode: string,
    ruta: string,
    consolidacion: boolean,
    fullName?: string,
  ) => void;
  embedMode?: boolean;
  initialExchangeRate?: string;
  onShowRecentManifests?: () => void;
}) {
  // ── Live result data — allows reloading external changes without closing the modal ─
  // The "Recargar cambios externos" button merges fresh Firestore rows into a
  // LOCAL state copy so the operator's overrides (kept in separate Maps) are
  // preserved. The parent (`useNovaChat.processedData`) is intentionally NOT
  // mutated by this merge — keeping the merge local prevents the auto-save
  // pipeline from silently saving rows the operator hasn't reviewed yet.
  //
  // ─── Resilience to parent re-emissions ──────────────────────────────────
  // Naively resetting `liveResultData` on every `propResultData` change would
  // wipe the local merge any time the parent re-renders with a new
  // `processedData` reference (auto-save, recalc, etc.). The guards below
  // keep the merge stable while still accepting LEGITIMATE parent updates:
  //
  //   1. Different `manifestNumber` → reset (operator opened another manifest).
  //   2. Parent has MORE rows than us → reset (parent ran a full fresh load
  //      that supersedes our merge — e.g. the operator triggered
  //      `loadManifestFromDB` from the chat input while the modal was open).
  //   3. Otherwise, preserve the local merge.
  const queryClient = useQueryClient();
  const [liveResultData, setLiveResultData] = useState(propResultData);
  const [isReloadingManifest, setIsReloadingManifest] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const lastManifestRef = useRef(propResultData.manifestNumber);
  const hasLocalMergeRef = useRef(false);
  useEffect(() => {
    // Case 1 — manifest switched: always re-baseline.
    if (propResultData.manifestNumber !== lastManifestRef.current) {
      lastManifestRef.current = propResultData.manifestNumber;
      hasLocalMergeRef.current = false;
      setLiveResultData(propResultData);
      setReloadError(null);
      return;
    }
    // Case 2 — same manifest, local merge present: only accept the parent if
    // it carries MORE rows than our merge (a fresh full reload from upstream).
    if (hasLocalMergeRef.current) {
      if (propResultData.rows.length > liveResultData.rows.length) {
        hasLocalMergeRef.current = false;
        setLiveResultData(propResultData);
      }
      return;
    }
    // Case 3 — no local merge: just stay in sync with the parent.
    setLiveResultData(propResultData);
    // We intentionally exclude `liveResultData.rows.length` from the dep array:
    // the comparison is read INSIDE the effect, and including it would cause
    // a re-run every time we set live state, defeating the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propResultData]);
  const resultData = liveResultData ?? propResultData;

  const { resolve: resolveEncomienda } = useEncomiendaLookup();
  const routeOptions = useRouteOptions();
  // Filter dropdown only — extends `routeOptions` with the 'Desconocida'
  // fallback so the operator can always slice the table by unknown-route
  // packages, even when the routes collection has no active 'Desconocida'
  // entry. Intentionally scoped here (not in `useRouteOptions`) so the
  // assignment pickers in NovaRoutePickerModal / NovaCreateCustomerModal /
  // NovaEditCustomerModal stay clean — 'Desconocida' is a fallback, not a
  // route the operator should be able to assign.
  const routeFilterOptions = useMemo(
    () =>
      routeOptions.some((r) => r.name === "Desconocida")
        ? routeOptions
        : [...routeOptions, buildRouteOption("Desconocida")],
    [routeOptions],
  );
  const [showCorrections, setShowCorrections] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showTable, setShowTable] = useState(embedMode || !!propResultData.loadedFromFirestore);
  useEffect(() => {
    if (propResultData.loadedFromFirestore) {
      setShowTable(true);
    }
  }, [propResultData.loadedFromFirestore]);

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestDone, setIngestDone] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const lastFailedOpRef = useRef<{
    type: "ingest" | "ingestAndInvoice";
    sendEmails: boolean;
  } | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState<string>("");

  const [debouncedTableFilter, setDebouncedTableFilter] = useState(tableFilter);
  const [debouncedRouteFilter, setDebouncedRouteFilter] = useState(routeFilter);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTableFilter(tableFilter);
      setDebouncedRouteFilter(routeFilter);
    }, 300);
    return () => clearTimeout(handler);
  }, [tableFilter, routeFilter]);

  const isFiltering = tableFilter !== debouncedTableFilter || routeFilter !== debouncedRouteFilter;

  // ── Validation Progress & Auto-save States ──
  const [isAutoSavePaused, setIsAutoSavePaused] = useState(false);
  const [validationProgress, setValidationProgress] = useState<{
    active: boolean;
    current: number;
    total: number;
    message: string;
    isFadingOut: boolean;
  }>({
    active: false,
    current: 0,
    total: 0,
    message: "",
    isFadingOut: false,
  });
  const [routePopoverOpen, setRoutePopoverOpen] = useState(false);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [manifestFilter, setManifestFilter] = useState<string>("");
  const [manifestPopoverOpen, setManifestPopoverOpen] = useState(false);
  const [manifestSearch, setManifestSearch] = useState("");
  const [routePicker, setRoutePicker] = useState<{
    slCode: string;
    customerName: string;
    currentRuta: string;
  } | null>(null);
  const [rutaOverrides, setRutaOverrides] = useState<Record<string, string>>(
    {},
  );
  // ── Data-origin policy ──────────────────────────────────────────────────────
  // Centralizes "fresh Excel parse" vs "Firestore-loaded saved manifest" gate.
  // Every consumer below reads `dataOriginPolicy.<flag>` instead of casting
  // `(resultData as ...).loadedFromFirestore`. See @/lib/nova/data-origin for
  // the contract + tests. Adding a new origin-aware behavior is one flag here
  // + one read at the call-site.
  const dataOriginPolicy = useNovaDataOrigin(resultData);
  const dataOriginPolicyRef = useRef(dataOriginPolicy);
  useEffect(() => {
    dataOriginPolicyRef.current = dataOriginPolicy;
  }, [dataOriginPolicy]);
  const { toast } = useToast();
  // ── Integrity audit ────────────────────────────────────────────────────────
  // Auto-runs ONCE when a Firestore-loaded manifest opens; the report
  // surfaces in `NovaIntegrityModal` (toggled via `showIntegrityModal`).
  // We gate on `showTable` so the audit doesn't fire while the operator is
  // still on the upload screen.
  const integrityAudit = useNovaIntegrityAudit({
    manifestId: resultData.manifestNumber,
    isFromFirestore: dataOriginPolicy.origin === "firestore",
    enabled: showTable,
  });
  const [showIntegrityModal, setShowIntegrityModal] = useState(false);
  // States for save integrity pre-alert warnings
  const [showSaveIntegrityWarning, setShowSaveIntegrityWarning] = useState(false);
  const [saveIntegrityConflicts, setSaveIntegrityConflicts] = useState<any[]>([]);
  const [saveIntegrityPendingAction, setSaveIntegrityPendingAction] = useState<'ingest' | 'ingest_and_invoice' | null>(null);
  const [saveIntegrityPendingSendEmails, setSaveIntegrityPendingSendEmails] = useState<boolean>(false);
  const [saveIntegrityPendingOptions, setSaveIntegrityPendingOptions] = useState<any>(null);

  // Toolbar consolidation: the "Re-validar todo" item lives inside the
  // Acciones dropdown now, but its confirmation modal is rendered by
  // NovaRevalidateAllButton with the trigger hidden — `externalOpen`
  // lets the dropdown toggle visibility while preserving the existing
  // confirmation copy + tests.
  const [showRevalidateAllConfirm, setShowRevalidateAllConfirm] =
    useState(false);

  // ── Per-row drift map from the integrity audit ───────────────────────────
  // Surface integrity issues at the row level so the operator sees the
  // problem WHERE it lives — without having to scan the toolbar badge or
  // open the modal for every check. The map is keyed by `rowIndex` (the
  // index into `manifest.packages[]`, which matches `resultData.rows[idx]`)
  // and stores the most-severe issue's kind so the row UI can render the
  // appropriate hint colour. We track both the high-severity drift kinds
  // (slcode_mismatch, invoice_customer_drift, duplicate_invoice) AND the
  // medium-severity invoice fields (invoice_weight_drift /
  // invoice_price_drift) so a per-row icon click can route the operator
  // straight to the integrity modal regardless of severity.
  const rowDriftMap = useMemo<
    Map<
      number,
      {
        kind: import("@/lib/nova/integrity").IntegrityIssueKind;
        severity: "high" | "medium" | "low";
      }
    >
  >(() => {
    const out = new Map<
      number,
      {
        kind: import("@/lib/nova/integrity").IntegrityIssueKind;
        severity: "high" | "medium" | "low";
      }
    >();
    const report = integrityAudit.report;
    if (!report) return out;
    // The audit is already severity-sorted (high → low), so the FIRST
    // issue encountered for a given rowIndex wins — no need to compare.
    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    for (const issue of report.issues) {
      const idx = issue.manifestRow.rowIndex;
      const cur = out.get(idx);
      if (!cur || severityRank[issue.severity] < severityRank[cur.severity]) {
        out.set(idx, { kind: issue.kind, severity: issue.severity });
      }
    }
    return out;
  }, [integrityAudit.report]);

  // ── External package watcher ─────────────────────────────────────────────
  // Detects when another operator (or another tab) moves a package INTO or
  // OUT OF the current manifest while it's open. Surfaces a banner with a
  // "Recargar" prompt so the table never silently drifts from Firestore.
  // Only active for Firestore-loaded manifests (fresh-parse manifests
  // haven't hit Firestore yet, so there's nothing to watch).
  const expectedTrackings = useMemo(
    () => resultData.rows.map((r) => r.tracking || "").filter(Boolean),
    [resultData.rows],
  );
  const packagesWatch = useNovaPackagesWatch({
    manifestId: resultData.manifestNumber,
    expectedTrackings,
    enabled: showTable && dataOriginPolicy.origin === "firestore",
  });
  const {
    unlinkedRows,
    setUnlinkedRows,
    slCodeOverrides,
    setSlCodeOverrides,
    matchOverrides,
    setMatchOverrides,
    nameOverrides,
    setNameOverrides,
    approvedMatches,
    setApprovedMatches,
    recentlyUnlinked,
    applyNameAndMatch,
    applyExplicitMatch,
    handleUnlinkOnly,
    handleUnlinkRow,
    handleUnlinkAndRematch,
  } = useNovaCustomerAssignment({
    showTable,
    resultDataRows: resultData.rows,
    setRutaOverrides,
    // Skip the one-shot auto-rematch when data came from Firestore — the
    // operator's stored assignments must not be silently rewritten just
    // because the manifest `nombre` diverges from the saved `nombreCliente`.
    // Re-linking is an explicit user action via the Acciones menu.
    // ── Data-origin policy (single source of truth) ─────────────────────────
    // The auto-revalidation effect must respect the same gate everywhere. We
    // derive the policy ONCE via useNovaDataOrigin and read the boolean from
    // it instead of re-deriving `loadedFromFirestore` in 8 places. See
    // `@/lib/nova/data-origin` for the contract + tests.
    skipAutoValidation: !dataOriginPolicy.allowAutoDivergentRematch,
  });
  const [createCustomer, setCreateCustomer] = useState<{
    nombre: string;
    rowIndex: number;
    rowIndices: number[];
  } | null>(null);
  const [unlinkMatch, setUnlinkMatch] = useState<{
    rowIndex: number;
    nombre: string;
    multipleRows?: number[];
    currentSlCode?: string;
  } | null>(null);
  const [unlinkActionModal, setUnlinkActionModal] = useState<{
    indices: number[];
    groupName: string;
  } | null>(null);
  const [reassignPreAlertConfirm, setReassignPreAlertConfirm] = useState<{
    slCode: string;
    fullName: string;
    ruta: string;
    preAlertSlCode: string;
    trackingNumber: string;
    onConfirm: () => void;
  } | null>(null);
  const [linkMatch, setLinkMatch] = useState<{
    rowIndices: number[];
    nombre: string;
    currentSlCode?: string;
  } | null>(null);
  // ── Merge-groups confirm modal ──────────────────────────────────────────────
  // Populated when the operator clicks "Fusionar con SL…" in an unmatched
  // group's Acciones menu. Holds the precomputed source/target summaries +
  // any active invoice impact so the modal can render without re-deriving
  // them. Setting back to null closes the modal. The actual mutation only
  // fires on `onConfirm` via `applyExplicitMatch`.
  const [mergeConfirm, setMergeConfirm] = useState<null | {
    sourceIdxs: number[];
    sourceCustomer: string;
    sourceWeight: number;
    sourcePrice: number;
    sourceRuta: string;
    target: MergeTarget;
    targetWeight: number;
    targetPrice: number;
    invoiceImpact?: MergeInvoiceImpact;
  }>(null);
  // ── Delete-invoice confirm modal ──────────────────────────────────────────
  // Surfaced when the operator clicks the per-badge "X" icon to drop a
  // corrupted invoice. The state IS the target (not just a flag) because
  // the modal needs the invoice details — number, customer, status, total —
  // to render its identity card and decide whether to require typed-confirm.
  // Reset to `null` to close.
  const [deleteInvoiceTarget, setDeleteInvoiceTarget] =
    useState<DeleteInvoiceTarget | null>(null);
  const [customerQuickView, setCustomerQuickView] = useState<string | null>(
    null,
  );
  const [editingName, setEditingName] = useState<{
    idx: number;
    value: string;
  } | null>(null);
  const [nameEditConfirm, setNameEditConfirm] = useState<{
    idx: number;
    newName: string;
    groupIdxs: number[];
  } | null>(null);
  const [editingPeso, setEditingPeso] = useState<{
    idx: number;
    value: string;
  } | null>(null);
  const [pesoEditConfirm, setPesoEditConfirm] = useState<{
    idx: number;
    oldPeso: number;
    newPeso: number;
    newPrice: number;
  } | null>(null);
  const [pesoOverrides, setPesoOverrides] = useState<Record<number, number>>(
    {},
  );
  // Copied states have been refactored into isolated NovaCopyButton components to prevent re-renders

  // ── Invoice state ──────────────────────────────────────────────────────────
  const [exchangeRate, setExchangeRate] = useState(
    initialExchangeRate ?? "487",
  );
  const [localExchangeRate, setLocalExchangeRate] = useState(exchangeRate);

  useEffect(() => {
    setLocalExchangeRate(exchangeRate);
  }, [exchangeRate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExchangeRate(localExchangeRate);
    }, 400);
    return () => clearTimeout(timer);
  }, [localExchangeRate]);

  // Sync TC from Firestore-loaded manifest (initialExchangeRate arrives after mount
  // when the manifest record is hydrated from the DB).
  useEffect(() => {
    if (initialExchangeRate) {
      setExchangeRate(initialExchangeRate);
    }
  }, [initialExchangeRate]);
  const [ivaEnabled, setIvaEnabled] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [isInvoicing, setIsInvoicing] = useState(false);
  const [paidInvoiceRegenTarget, setPaidInvoiceRegenTarget] = useState<{
    groupKey: string;
    clientName: string;
    targetIdxs: number[];
  } | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(
    null,
  );
  const [createdInvoices, setCreatedInvoices] = useState<InvoiceRecord[]>([]);
  const [invoicesCollapsed, setInvoicesCollapsed] = useState(false);
  const [sendReceiptInvoice, setSendReceiptInvoice] =
    useState<InvoiceRecord | null>(null);
  const [editCustomer, setEditCustomer] = useState<{
    slCode: string;
    fullName?: string;
    email?: string;
    dni?: string;
    phone?: string;
    ruta?: string;
  } | null>(null);
  const [recalcConfirm, setRecalcConfirm] = useState<{
    type: "recalc" | "round" | "encomiendas";
    targets: number[];
  } | null>(null);
  const [roundingModal, setRoundingModal] = useState<{
    targets: number[];
    granularity: 1 | 0.1 | 0.01;
  } | null>(null);
  const [recalcResult, setRecalcResult] = useState<{
    type: "recalc" | "round" | "encomiendas";
    count: number;
  } | null>(null);
  const [shippingLabelData, setShippingLabelData] =
    useState<NovaShippingLabelData | null>(null);
  const [invoiceWizard, setInvoiceWizard] = useState<{
    queue: InvoiceRecord[];
    index: number;
    withSend: boolean;
  } | null>(null);
  // Realtime invoices for this manifest — synced via onSnapshot subscription
  const [persistedInvoices, setPersistedInvoices] = useState<InvoiceRecord[]>(
    [],
  );
  // Tracks groupKeys where the operator explicitly toggled consolidation/merged mode.
  // Prevents the reactive invoice-mode effect from overriding manual operator choices.
  const operatorModeOverrides = useRef<Set<string>>(new Set());

  const { user } = useAuth();
  const handleSendReceipt = useCallback(
    async (inv: InvoiceRecord) => {
      // sendInvoiceEmails persists the send-log automatically on success —
      // we only need to forward the operator identity so the history attribution
      // shows "nova · <userId>" instead of the default "system".
      await sendInvoiceEmails([inv], {
        sentBy: user?.id || "nova",
        source: "nova-resend",
      });
    },
    [user?.id],
  );

  // ── Customer contact map (slCode → email + phone + dni + ruta) — REALTIME ───
  // Uses onSnapshot so email/phone/DNI/ruta update live while the table is open.
  // rutaOverrides are seeded only once (!(slCode in next) guard prevents overwrite
  // of operator-set route choices during the same session).
  const [customerContactMap, setCustomerContactMap] = useState<
    Map<string, CustomerContactInfo>
  >(new Map());

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__customerContactMap = customerContactMap;
    }
  }, [customerContactMap]);

  const [terceroRows, setTerceroRows] = useState<Map<string, NovaTerceroRow>>(
    new Map(),
  );
  const [tercerosLoaded, setTercerosLoaded] = useState(false);

  const [prevManifestNum, setPrevManifestNum] = useState<string | null>(null);
  const [prevShowTable, setPrevShowTable] = useState(showTable);

  if (resultData.manifestNumber !== prevManifestNum || showTable !== prevShowTable) {
    setPrevManifestNum(resultData.manifestNumber);
    setPrevShowTable(showTable);
    setTercerosLoaded(false);
  }

  const getCustomerConsEnabled = useCallback((inv: any) => {
    if (!inv) return undefined;
    const slCode = inv.slCode || inv.clientSlCode || inv.customerId || inv.userId || inv.customer?.slCode;
    if (!slCode) return undefined;
    return customerContactMap.get(String(slCode).toUpperCase().trim())?.consolidationEnabled;
  }, [customerContactMap]);

  useEffect(() => {
    if (!showTable || !resultData.manifestNumber) return;
    setTercerosLoaded(false);
    return subscribeManifestTerceros(resultData.manifestNumber, (map) => {
      setTerceroRows(map);
      setTercerosLoaded(true);
    });
  }, [showTable, resultData.manifestNumber]);

  const enrichInv = useCallback((inv: InvoiceRecord): InvoiceRecord => {
    const pesoMap = new Map(
      resultData.rows.map((r) => [r.tracking?.toUpperCase(), r.peso ?? 0]),
    );

    const isTercerosItem = (item: any) => {
      const isPkg = !!(item.tracking || item.trackingNumber);
      if (isPkg) return false;
      if (item.isSystem !== undefined) {
        return item.isSystem === true && item.systemType === 'terceros';
      }
      const desc = (item.description || '').toLowerCase();
      return desc.includes('tercer') || desc.includes('encomienda');
    };

    // Filter out existing system terceros manual items to avoid duplicates or stale items, but preserve other manual/system items
    const baseItems = (inv.items || []).filter(
      (i) => !isTercerosItem(i)
    );
    const baseInvoiceItems = ((inv as any).invoiceItems || []).filter(
      (i: any) => !isTercerosItem(i)
    );

    const enrich = (arr: any[]) =>
      arr.map((i) => {
        const t = (i.trackingNumber || i.tracking || "").toUpperCase();
        const rp = t ? pesoMap.get(t) : undefined;
        return rp != null ? { ...i, realWeight: rp } : i;
      });

    const enrichedItems = enrich(baseItems);
    const enrichedInvoiceItems = enrich(baseInvoiceItems);

    const slCode = String(inv.clientSlCode || inv.slCode || "").toUpperCase();
    const tr = slCode ? terceroRows.get(slCode) : undefined;

    if (tr && (tr.amount ?? 0) > 0) {
      const trAmount = tr.amount;
      const trDesc = tr.description || 'SERVICIO DE TERCERO';
      const trSubtotal = ivaEnabled ? Math.round(trAmount / 1.13 * 100) / 100 : trAmount;
      const trIva = ivaEnabled ? Math.round((trAmount - trSubtotal) * 100) / 100 : 0;

      enrichedItems.push({
        tracking: '',
        description: trDesc,
        weight: 0,
        realWeight: 0,
        subtotal: trSubtotal,
        iva: trIva,
        amount: trAmount,
        currency: 'USD',
        isPermiso: false,
        isManual: true,
        isSystem: true,
        systemType: 'terceros',
      } as any);

      enrichedInvoiceItems.push({
        description: trDesc,
        trackingNumber: '',
        quantity: 1,
        unitPrice: trAmount,
        totalPrice: trAmount,
        weight: 0,
        realWeight: 0,
        isManual: true,
        isSystem: true,
        systemType: 'terceros',
        isPermiso: false,
      } as any);
    }

    // Recalculate totals dynamically to avoid visual discrepancies in the preview
    const tcNum = parseFloat(exchangeRate) || 0;
    const totalUSD = enrichedItems.reduce((s, i) => s + (i.amount ?? 0), 0);
    const subtotalUSD = ivaEnabled ? Math.round(totalUSD / 1.13 * 100) / 100 : totalUSD;
    const ivaUSD = ivaEnabled ? Math.round((totalUSD - subtotalUSD) * 100) / 100 : 0;
    const totalCRC = tcNum > 0 ? Math.round(totalUSD * tcNum) : 0;
    const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
    const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

    return {
      ...inv,
      items: enrichedItems,
      ...((inv as any).invoiceItems || enrichedInvoiceItems.length > 0
        ? { invoiceItems: enrichedInvoiceItems }
        : {}),
      amount: totalUSD,
      subtotal: subtotalUSD,
      iva: ivaUSD,
      amountCRC: totalCRC,
      subtotalCRC: subtotalCRC,
      ivaCRC: ivaCRC,
      totalAmount: totalUSD,
      subtotalAmount: subtotalUSD,
      taxAmount: ivaUSD,
    };
  }, [resultData.rows, terceroRows, ivaEnabled, exchangeRate]);

  useEffect(() => {
    if (!showTable) return;
    // Subscribe to EVERY slCode that could appear in the rendered table —
    // not just the manifest's original `row.slCode` but also operator
    // overrides (matchOverrides / slCodeOverrides). This is what makes
    // "Editar cliente" → name change reactive in the table: when the
    // edit modal writes `customers/{slCode}`, the onSnapshot callback
    // fires and the new fullName flows down to the displayName fallback
    // chain. Without including overrides, customers reassigned via
    // "Vincular a otro cliente" / "Reasignar" wouldn't appear in the
    // contact map and their downstream renames would be invisible.
    const slCodes = [
      ...new Set([
        ...resultData.rows.map((r) => r.slCode).filter(Boolean),
        ...Object.values(slCodeOverrides)
          .map((o) => o.slCode)
          .filter(Boolean),
        ...Object.values(matchOverrides)
          .map((o) => o.slCode)
          .filter(Boolean),
      ]),
    ] as string[];
    return subscribeCustomersBySlCodes(slCodes, (map) => {
      setCustomerContactMap(map);
      if (!resultData.loadedFromFirestore) {
        setRutaOverrides((prev) => {
          const next = { ...prev };
          map.forEach((info, slCode) => {
            if (info.ruta && !(slCode in next)) {
              next[slCode] = info.ruta;
            }
          });
          return next;
        });
      }
    });
  }, [showTable, resultData.rows, slCodeOverrides, matchOverrides, resultData.loadedFromFirestore]);

  // ── Invoice-mode effect — reactive sync from live invoices + customer flags ──
  // Runs whenever persistedInvoices (onSnapshot) or customerContactMap changes.
  // Priority:
  //   1. Existing invoices in Firestore → infer consolidated / merged mode from them.
  //   2. No invoices yet → activate consolidation when customer has consolidationEnabled=true.
  // Skips groupKeys where the operator has manually toggled the mode this session
  // (operatorModeOverrides ref) so live Firestore updates never override deliberate choices.
  useEffect(() => {
    if (customerContactMap.size === 0) return;
    const opOverrides = operatorModeOverrides.current;

    const patchSeparate: Record<string, boolean> = {};
    const patchMerged: Record<string, boolean> = {};

    // Step 1: infer from existing Firestore invoices (highest priority)
    persistedInvoices.forEach((inv) => {
      const status = String(inv.status || "").toLowerCase();
      if (status === "annulled" || status === "cancelled" || status === "void")
        return;
      const slCode = inv.clientSlCode || inv.slCode ? String(inv.clientSlCode || inv.slCode) : "";
      if (!slCode || slCode === "BB" || slCode === "M" || slCode === "SR")
        return;
      if (opOverrides.has(slCode)) return; // operator already made a deliberate choice
      if (isConsolidatedInvoice(inv)) {
        patchSeparate[slCode] = true;
        patchMerged[slCode] = false;
      } else if (inv.isMergedSingle) {
        if (!(slCode in patchSeparate)) {
          patchMerged[slCode] = true;
          patchSeparate[slCode] = false;
        }
      }
    });

    // Step 2: no existing invoices → use customer consolidationEnabled flag.
    // Delegates to computeAutoConsolidationKeys so the logic is unit-tested
    // and stays consistent with the table's grouping (effective slCode after
    // matchOverrides / slCodeOverrides). This ensures that when an operator
    // manually links a row to an existing customer, the group size recomputes
    // and consolidation auto-activates. Also honours row.consolidacion=true
    // as a trigger — not just customer.consolidationEnabled — so rows already
    // carrying the "C" badge converge on consolidation as soon as the group
    // reaches ≥2 effective members.
    const consolEnabledMap = new Map<string, boolean>();
    customerContactMap.forEach((info, sl) =>
      consolEnabledMap.set(sl, !!info.consolidationEnabled),
    );
    const autoKeys = computeAutoConsolidationKeys({
      rows: resultData.rows,
      slCodeOverrides,
      matchOverrides,
      unlinkedRows,
      operatorOverrideKeys: opOverrides,
      customerConsolidationEnabled: consolEnabledMap,
    });
    autoKeys.forEach((slCode) => {
      if (slCode in patchSeparate || slCode in patchMerged) return;
      patchSeparate[slCode] = true;
      patchMerged[slCode] = false;
    });

    // Step 3: temp customers (SL-NAN-*) with 2+ rows → auto Factura única.
    // Without this, the operator would have to manually toggle Factura única
    // every time they assign multiple packages to the same temp customer,
    // and forgetting it produces 2 separate invoices that share a colliding
    // invoiceNumber (timestamp precision is per-second). Skipped when the
    // operator has already toggled the mode for this slCode this session,
    // and skipped when an existing Firestore invoice already determined the
    // mode in Step 1 (ensures we never fight a deliberate non-merged save).
    const facturaUnicaKeys = computeAutoFacturaUnicaKeys({
      rows: resultData.rows,
      slCodeOverrides,
      matchOverrides,
      unlinkedRows,
      operatorOverrideKeys: opOverrides,
    });
    facturaUnicaKeys.forEach((slCode) => {
      if (slCode in patchSeparate || slCode in patchMerged) return;
      patchMerged[slCode] = true;
      patchSeparate[slCode] = false;
    });

    if (Object.keys(patchSeparate).length > 0) {
      setSeparateInvoices((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.entries(patchSeparate).forEach(([k, v]) => {
          if (next[k] !== v) {
            next[k] = v;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
    if (Object.keys(patchMerged).length > 0) {
      setMergedInvoices((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.entries(patchMerged).forEach(([k, v]) => {
          if (next[k] !== v) {
            next[k] = v;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [
    customerContactMap,
    persistedInvoices,
    resultData.rows,
    matchOverrides,
    slCodeOverrides,
    unlinkedRows,
  ]);

  // ── Pre-populate routes from learned cache for unmatched rows ──────────────
  useEffect(() => {
    if (!showTable) return;
    if (resultData.loadedFromFirestore) return; // STRICT RULE: Never overwrite or auto-assign routes when loading from Firestore
    loadUnmatchedRouteCache()
      .then(() => {
        setRutaOverrides((prev) => {
          const next = { ...prev };
          resultData.rows.forEach((row, idx) => {
            if (row.slCode && !unlinkedRows.has(idx)) return; // skip matched rows that are NOT unlinked
            const rutaKey = `__unmatched__${row.nombre}`;
            if (rutaKey in next) return; // already has an override
            // Tier 1+2: exact name or learned prefix from Firestore
            const learned = lookupLearnedRoute(row.nombre);
            if (learned) {
              next[rutaKey] = learned;
              return;
            }
            // Tier 3: first-word prefix matches a known route name (e.g. "BB" → route "BB")
            const firstWord = row.nombre.trim().split(/\s+/)[0].toUpperCase();
            const knownRoute = routeOptions.find(
              (r) => r.name.toUpperCase() === firstWord,
            );
            if (knownRoute) next[rutaKey] = knownRoute.name;
          });
          return next;
        });
      })
      .catch(() => { });
  }, [showTable, resultData.rows, routeOptions, unlinkedRows]);

  // ── Realtime ruta sync — patch rutaOverrides whenever any ruta changes ───
  useEffect(() => {
    const handler = (e: Event) => {
      const { slCode, ruta } = (
        e as CustomEvent<{ slCode: string; ruta: string }>
      ).detail;
      setRutaOverrides((prev) => ({ ...prev, [slCode]: ruta }));
    };
    window.addEventListener("customer-ruta-updated", handler);
    return () => window.removeEventListener("customer-ruta-updated", handler);
  }, []);

  // ── Row selection state ───────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [lastReassignment, setLastReassignment] = useState<{
    trackings: string[];
    originalManifestNumber: string;
    targetManifestId: string;
    invoicesBackup: { id: string; data: any }[];
    indices: number[];
  } | null>(null);
  const [isUndoingReassignment, setIsUndoingReassignment] = useState(false);
  // ── Manifest-override state (maps originalIdx → override manifest number) ──────────────
  const [manifestOverrides, setManifestOverrides] = useState<
    Record<number, string>
  >({});
  // ── manifestReassignedIndices: visually removed from table + ingested-only (no invoice) ──
  const [manifestReassignedIndices, setManifestReassignedIndices] = useState<
    Set<number>
  >(new Set());
  // ── Manifest picker dialog state ─────────────────────────────────────────────
  const [manifestPicker, setManifestPicker] = useState<{
    targetIndices: number[]; // originalIdx list to reassign
    step: 1 | 2;
    selectedManifestId: string; // chosen manifest ID
  } | null>(null);
  const [manifestPickerSearch, setManifestPickerSearch] = useState("");
  const [manifestSuggestions, setManifestSuggestions] = useState<
    ManifestRecord[]
  >([]);
  const [isLoadingManifests, setIsLoadingManifests] = useState(false);

  // ── Bulk Move Manifest dialog state ─────────────────────────────────────────────
  const [bulkMoveManifestPicker, setBulkMoveManifestPicker] = useState<{
    targetIndices: number[];
    step: 1 | 2;
    selectedManifestId: string;
    isEncomiendaOnly?: boolean;
  } | null>(null);
  const [bulkMoveSearch, setBulkMoveSearch] = useState("");
  const [isMovingManifest, setIsMovingManifest] = useState(false);
  // ── Bulk delete dialog state ─────────────────────────────────────────────
  const [showBulkDelete, setShowBulkDelete] = useState<{
    step: 1 | 2;
    indices: number[];
  } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);


  // ── Price overrides (local recalculation without mutating resultData) ─────
  const [priceOverrides, setPriceOverrides] = useState<
    Record<string, { precio: number; pesoRedondeo: number }>
  >({});
  const [priceAdjustments, setPriceAdjustments] = useState<
    Record<string, AjustePrecio>
  >({});

  // Hydrate priceAdjustments and priceOverrides from the rows loaded from Firestore
  useEffect(() => {
    if (!resultData.rows.length || isReloadingManifest) return;

    const initialAdjustments: Record<string, AjustePrecio> = {};
    const initialOverrides: Record<string, { precio: number; pesoRedondeo: number }> = {};

    resultData.rows.forEach((row) => {
      const r = row as any;
      const tracking = String(r.tracking || '').toUpperCase();
      if (!tracking) return;
      const adj = (r.originalData?.ajustePrecio ?? r.ajustePrecio) as AjustePrecio | undefined;
      if (adj) {
        initialAdjustments[tracking] = adj;
        initialOverrides[tracking] = {
          precio: adj.precioAjustado,
          pesoRedondeo: r.pesoRedondeo ?? r.peso ?? 0,
        };
      }
    });

    setPriceAdjustments(initialAdjustments);
    setPriceOverrides(initialOverrides);
  }, [resultData.rows, isReloadingManifest]);

  const [priceAdjustModal, setPriceAdjustModal] = useState<{
    customerName: string;
    rowIndices: number[];
  } | null>(null);
  const [separateInvoices, setSeparateInvoices] = useState<
    Record<string, boolean>
  >(() => computeSeparateInvoiceDefaults(resultData.rows));
  const [mergedInvoices, setMergedInvoices] = useState<Record<string, boolean>>(
    () => computeMergedInvoiceDefaults(resultData.rows),
  );
  const [showOnlyReview, setShowOnlyReview] = useState(false);
  const [showOnlyDivergent, setShowOnlyDivergent] = useState(false);
  const [showOnlyNoSlCode, setShowOnlyNoSlCode] = useState(false);
  const [showOnlyTempOrNan, setShowOnlyTempOrNan] = useState(false);
  const [showOnlyPreAlerted, setShowOnlyPreAlerted] = useState(false);
  const [showGroupHeaders, setShowGroupHeaders] = useState(true);
  const [showHideGroupHeadersAlert, setShowHideGroupHeadersAlert] =
    useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [routeWarningDismissed, setRouteWarningDismissed] = useState(false);
  // Breakdown of every invoice doc tied to this manifest (drafts vs sent vs paid…).
  // Replaces the previous boolean count: powers the per-status hint in the
  // confirmation dialog and gates the "Anular y re-crear" action button so the
  // operator knows EXACTLY what will happen before clicking, instead of suffering
  // a silent no-op when sent/overdue invoices block the recreate pipeline.
  const [existingInvoiceBreakdown, setExistingInvoiceBreakdown] =
    useState<InvoiceManifestBreakdown | null>(null);
  const [existingInvoicesList, setExistingInvoicesList] = useState<any[]>([]);
  const [protectedActions, setProtectedActions] = useState<Record<string, 'items_only' | 'overwrite' | 'skip'>>({});
  // ── Recent-manifest TC reference (for pre-fill + staleness alert) ────────────
  const [recentManifestTc, setRecentManifestTc] = useState<{
    tc: number;
    daysSince: number;
  } | null>(null);
  useEffect(() => {
    // Only pre-fill for fresh (non-Firestore-loaded) manifests
    if (initialExchangeRate) return;
    getRecentManifests(10)
      .then((manifests) => {
        const withTc = manifests.filter((m) => (m.exchangeRate ?? 0) > 0);
        if (!withTc.length) return;
        const latest = withTc[0]; // sorted by processedAt desc
        const daysSince = latest.processedAt
          ? Math.floor(
            (Date.now() - new Date(latest.processedAt).getTime()) / 86400000,
          )
          : 0;
        setRecentManifestTc({ tc: latest.exchangeRate!, daysSince });
        setExchangeRate(String(latest.exchangeRate!));
      })
      .catch(() => { });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ── Check existing invoices when save-confirm dialog opens ──────────────────
  // ── Existing-invoice breakdown loader ───────────────────────────────────────
  // Triggered when the save-confirm dialog opens. Replaces the old simple count
  // with a per-status breakdown (drafts/sent/paid/overdue/pending/annulled) so
  // the dialog can: (1) tell the operator exactly which invoices "Re-crear"
  // would skip (sent/paid/overdue/pending — protected by AI GUARD), (2) detect
  // when "Anular y re-crear" should be offered (sent/overdue/pending > 0 AND
  // paid === 0), (3) tag annulled docs as inert tombstones (they are not
  // counted as protected — RECREATE_PROTECTED_STATUSES excludes them, so
  // /createInvoicesFromRows can freely create new invoices for the same slCode
  // without colliding with annulled ones).
  useEffect(() => {
    if (!showSaveConfirm) {
      setExistingInvoiceBreakdown(null);
      setExistingInvoicesList([]);
      setProtectedActions({});
      return;
    }
    setExistingInvoiceBreakdown(null);
    setExistingInvoicesList([]);
    setProtectedActions({});

    const invoicesRef = collection(db, 'invoices');
    getDocs(query(invoicesRef, where('manifestNumber', '==', resultData.manifestNumber)))
      .then((snap) => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        setExistingInvoicesList(list);

        const b: InvoiceManifestBreakdown = {
          total: 0,
          drafts: 0,
          sent: 0,
          paid: 0,
          overdue: 0,
          pending: 0,
          annulled: 0,
          protectedIds: [],
        };

        const actions: Record<string, 'items_only' | 'overwrite' | 'skip'> = {};

        list.forEach((inv: any) => {
          const status = String(inv.status || 'draft').toLowerCase();
          b.total++;
          if (status === 'draft') {
            b.drafts++;
          } else if (status === 'sent') {
            b.sent++;
            b.protectedIds.push(inv.id);
          } else if (status === 'paid') {
            b.paid++;
          } else if (status === 'overdue') {
            b.overdue++;
            b.protectedIds.push(inv.id);
          } else if (status === 'pending' || status === 'pending_payment') {
            b.pending++;
            b.protectedIds.push(inv.id);
          } else if (status === 'annulled' || status === 'cancelled' || status === 'void') {
            b.annulled++;
          } else {
            b.drafts++;
          }

          // Initialize action as 'skip' (Omitir) by default for protected invoices
          if (RECREATE_PROTECTED_STATUSES.has(status)) {
            const slCode = String(inv.clientSlCode || inv.slCode || '').toUpperCase();
            if (slCode) {
              actions[slCode] = 'skip';
            }
          }
        });

        setExistingInvoiceBreakdown(b);
        setProtectedActions(actions);
      })
      .catch((err) => {
        console.error("[Nova][breakdown] error loading invoices:", err);
        setExistingInvoiceBreakdown({
          total: 0,
          drafts: 0,
          sent: 0,
          paid: 0,
          overdue: 0,
          pending: 0,
          annulled: 0,
          protectedIds: [],
        });
        setExistingInvoicesList([]);
        setProtectedActions({});
      });
  }, [showSaveConfirm, resultData.manifestNumber]);

  // ── Disable pull-to-refresh while table is open (Samsung/Android Chrome swipe-down) ──
  useEffect(() => {
    if (!showTable) return;
    const prevBody = document.body.style.overscrollBehaviorY;
    const prevHtml = document.documentElement.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "none";
    document.documentElement.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overscrollBehaviorY = prevBody;
      document.documentElement.style.overscrollBehaviorY = prevHtml;
    };
  }, [showTable]);

  // ── Pre-alert badge + reactive details ────────────────────────────────────────
  const [preAlertsMap, setPreAlertsMap] = useState<Map<string, PreAlertInfo>>(
    new Map(),
  );
  const [preAlertCustomers, setPreAlertCustomers] = useState<
    Map<string, { fullName: string; ruta?: string }>
  >(new Map());
  // Keyed by manifest number so it resets when a new manifest is loaded
  const preAlertAutoAssignRef = useRef<string | null>(null);
  // Tracks indices the operator manually unlinked this session.
  // The async pre-alert auto-assign must NEVER clobber explicit operator choices.
  const operatorManualUnlinksRef = useRef<Set<number>>(new Set());

  // ── Live mirrors of override state (BUG-PREALERT-OVERWRITE 2026-04-28) ──
  // The pre-alert auto-assign effect runs an async network call (~2 s) before
  // applying overrides. Without these refs, the assign closure captures stale
  // values of `matchOverrides`/`unlinkedRows` from the time the effect FIRED,
  // not the time the assign RUNS — so any operator interaction during the in-
  // flight window (manual link / unlink / slCode swap) is silently overwritten.
  // The refs always reflect the latest state and are read inside the async
  // callback to skip rows the operator has already curated.
  const unlinkedRowsRef = useRef(unlinkedRows);
  useEffect(() => {
    unlinkedRowsRef.current = unlinkedRows;
  }, [unlinkedRows]);
  const matchOverridesRef = useRef(matchOverrides);
  useEffect(() => {
    matchOverridesRef.current = matchOverrides;
  }, [matchOverrides]);
  const slCodeOverridesRef = useRef(slCodeOverrides);
  useEffect(() => {
    slCodeOverridesRef.current = slCodeOverrides;
  }, [slCodeOverrides]);

  const approvedMatchesRef = useRef(approvedMatches);
  useEffect(() => {
    approvedMatchesRef.current = approvedMatches;
  }, [approvedMatches]);

  // ── Sync In-Memory Pre-Alert Hydration (Zero-Cost / 0 Firestore Reads) ──────
  // When a manifest is loaded from Firestore, all pre-alert information is already
  // embedded in `resultData.rows[].preAlert`. We hydrate state synchronously
  // without issuing any Firestore queries, listeners, or network calls.
  useEffect(() => {
    if (!resultData?.rows?.length) return;

    const initialPreAlertMap = new Map<string, PreAlertInfo>();
    const initialCustomers = new Map<string, any>();

    resultData.rows.forEach((r: any) => {
      const p = r.preAlert || r.preAlertInfo;
      const trackingNorm = String(r.tracking || "").toUpperCase().trim();
      if (!trackingNorm) return;

      if (p && (p.found || p.slCode || r.hasPreAlert || r.matchSource === "pre_alert")) {
        const resolvedSlCode = String(p.slCode || r.preAlertSlCode || r.slCode || "").toUpperCase().trim();
        const clientFullName = p.clientName || r.nombreCliente || "";

        initialPreAlertMap.set(trackingNorm, {
          found: true,
          tracking: r.tracking,
          canonicalTracking: p.canonicalTracking || r.tracking,
          slCode: resolvedSlCode,
          clientName: clientFullName,
          description: p.description || r.descripcion || "",
          declaredValue: typeof p.declaredValue === "number" ? p.declaredValue : (typeof r.valor === "number" ? r.valor : undefined),
          courier: p.courier || r.courier,
          hasInvoice: p.hasInvoice ?? (r.hasInvoice || false),
          invoiceUrl: p.invoiceUrl,
          preAlertCreatedAt: p.preAlertCreatedAt || r.preAlertCreatedAt,
          sp2PreAlertId: p.sp2PreAlertId || r.preAlertId || r.preAlertKey,
        });

        if (resolvedSlCode && clientFullName) {
          initialCustomers.set(resolvedSlCode, {
            slCode: resolvedSlCode,
            fullName: clientFullName,
            ruta: r.ruta || "",
          });
        }
      } else if (r.hasPreAlert || r.matchSource === "pre_alert" || r.preAlertSlCode) {
        const resolvedSlCode = String(r.preAlertSlCode || r.slCode || "").toUpperCase().trim();
        const clientFullName = r.nombreCliente || "";
        initialPreAlertMap.set(trackingNorm, {
          found: true,
          tracking: r.tracking,
          canonicalTracking: r.tracking,
          slCode: resolvedSlCode,
          clientName: clientFullName,
          preAlertCreatedAt: r.preAlertCreatedAt,
          sp2PreAlertId: r.preAlertId || r.preAlertKey,
        });

        if (resolvedSlCode && clientFullName) {
          initialCustomers.set(resolvedSlCode, {
            slCode: resolvedSlCode,
            fullName: clientFullName,
            ruta: r.ruta || "",
          });
        }
      }
    });

    if (initialPreAlertMap.size > 0) {
      setPreAlertsMap((prev) => {
        const next = new Map(prev);
        initialPreAlertMap.forEach((v, k) => {
          if (!next.has(k)) next.set(k, v);
        });
        return next;
      });
    }

    if (initialCustomers.size > 0) {
      setPreAlertCustomers((prev) => {
        const next = new Map(prev);
        initialCustomers.forEach((v, k) => {
          if (!next.has(k)) next.set(k, v);
        });
        return next;
      });
    }
  }, [resultData?.rows, resultData?.manifestNumber]);

  useEffect(() => {
    if (!showTable || !resultData.rows.length) return;

    const trackings = [
      ...new Set(resultData.rows.map((r) => r.tracking).filter(Boolean)),
    ] as string[];
    if (!trackings.length) return;
    let cancelled = false;

    const unsub = watchTrackingPreAlerts(trackings, async (map) => {
      if (cancelled) return;

      // 1. Update the reactive pre-alerts map in state for badges and filtering
      setPreAlertsMap(map);

      // Build tracking -> slCode map from pre-alerts
      const slCodeByTracking = new Map<string, string>();
      map.forEach((info, t) => {
        if (info.found) {
          const resolvedSlCode = (
            info.slCode ||
            info.sp2PreAlertId?.match(/^(SL\d+)-/i)?.[1] ||
            null
          )?.toUpperCase() ?? null;
          if (resolvedSlCode) slCodeByTracking.set(t, resolvedSlCode);
        }
      });

      // 2. Identify rows with pre-alerts that are mismatched (wrong slCode or not assigned)
      const mismatches: Array<{ idx: number; slCode: string }> = [];
      resultData.rows.forEach((row, idx) => {
        if (deletedIndices.has(idx)) return;
        if (manifestReassignedIndices.has(idx)) return;

        // If the operator has explicitly approved or manually assigned this row,
        // do not let the reactive pre-alert check overwrite the operator's decision.
        if (approvedMatchesRef.current.has(idx)) return;

        const trackingNorm = (row.tracking || "").toUpperCase().trim();
        const preAlertSlCode = slCodeByTracking.get(trackingNorm);
        if (!preAlertSlCode) return;

        // Effective slCode of this row in the active UI state (curated/loaded)
        const currentSlCode = (
          slCodeOverridesRef.current[idx]?.slCode ||
          matchOverridesRef.current[idx]?.slCode ||
          (unlinkedRowsRef.current.has(idx) ? "" : row.slCode) ||
          ""
        ).toUpperCase().trim();

        if (currentSlCode !== preAlertSlCode) {
          mismatches.push({ idx, slCode: preAlertSlCode });
        }
      });

      if (mismatches.length === 0) {
        // No mismatches to correct, but still fetch details of all pre-alerted codes
        // to populate preAlertCustomers so row tooltips are fully informative.
        const uniqueSlCodes = [...new Set(slCodeByTracking.values())];
        if (uniqueSlCodes.length > 0) {
          const custMap = await getCustomersBySlCodes(uniqueSlCodes);
          if (!cancelled) {
            setPreAlertCustomers((prev) => {
              const next = new Map(prev);
              custMap.forEach((c, code) => next.set(code.toUpperCase(), c));
              return next;
            });
          }
        }
        return;
      }

      // Fetch customer records for mismatching SL codes
      const uniqueSlCodesToFetch = [...new Set(mismatches.map((m) => m.slCode))];
      const customerMap = await getCustomersBySlCodes(uniqueSlCodesToFetch);
      if (cancelled) return;

      // Update preAlertCustomers for tooltips
      setPreAlertCustomers((prev) => {
        const next = new Map(prev);
        customerMap.forEach((c, code) => next.set(code.toUpperCase(), c));
        return next;
      });

      // 3. Apply reactive auto-corrections: force React state to match the pre-alert owners!
      // DATA ORIGIN IMMUNITY: Skip automatic pre-alert assignments for Firestore-loaded / Mega-Man manifests.
      if (!dataOriginPolicyRef.current.allowAutoPreAlertAssign) return;

      setMatchOverrides((prev) => {
        const next = { ...prev };
        let changed = false;
        mismatches.forEach(({ idx, slCode }) => {
          const c = customerMap.get(slCode);
          if (!c) return;
          const currentSl = (
            prev[idx]?.slCode ||
            (unlinkedRowsRef.current.has(idx) ? "" : resultData.rows[idx].slCode) ||
            ""
          ).toUpperCase().trim();
          if (currentSl !== slCode) {
            next[idx] = { slCode, fullName: c.fullName, ruta: c.ruta };
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      setSlCodeOverrides((prev) => {
        const next = { ...prev };
        let changed = false;
        mismatches.forEach(({ idx, slCode }) => {
          const c = customerMap.get(slCode);
          if (!c) return;
          const currentSl = (
            prev[idx]?.slCode ||
            (unlinkedRowsRef.current.has(idx) ? "" : resultData.rows[idx].slCode) ||
            ""
          ).toUpperCase().trim();
          if (currentSl !== slCode) {
            next[idx] = { slCode, ruta: c.ruta };
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      mismatches.forEach(({ slCode }) => {
        const c = customerMap.get(slCode);
        if (c?.ruta) {
          setRutaOverrides((prev) => ({ ...prev, [slCode]: c.ruta }));
        }
      });

      // Clear corrected rows from unlinkedRows so they are actively linked
      setUnlinkedRows((prev) => {
        const next = new Set(prev);
        let changed = false;
        mismatches.forEach(({ idx }) => {
          if (next.has(idx)) {
            next.delete(idx);
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      console.log(
        `[Nova] Auto-corrected ${mismatches.length} pre-alert mismatch(es) reactive:`,
        mismatches.map((m) => `row ${m.idx} → ${m.slCode}`),
      );
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [showTable, resultData.rows, resultData.manifestNumber]);

  // ── Realtime invoice subscription — onSnapshot keeps persistedInvoices live ──
  const invoiceDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!showTable || !resultData.manifestNumber) return;
    return () => {
      if (invoiceDebounceTimerRef.current) clearTimeout(invoiceDebounceTimerRef.current);
    };
  }, [showTable, resultData.manifestNumber]);

  useEffect(() => {
    if (!showTable || !resultData.manifestNumber) return;
    return subscribeInvoicesByManifest(
      resultData.manifestNumber,
      (invoices) => {
        if (invoiceDebounceTimerRef.current) clearTimeout(invoiceDebounceTimerRef.current);
        invoiceDebounceTimerRef.current = setTimeout(() => {
          setPersistedInvoices(invoices);
        }, 800);
      }
    );
  }, [showTable, resultData.manifestNumber]);

  // ── Column sort (Excel-like) ──────────────────────────────────────────────
  type SortCol =
    | "cliente"
    | "ruta"
    | "tracking"
    | "peso"
    | "pesoRedondeo"
    | "precio"
    | "colones"
    | "descripcion";
  const [sortConfig, setSortConfig] = useState<{
    col: SortCol;
    dir: "asc" | "desc";
  }>({ col: "cliente", dir: "asc" });
  const handleColSort = (col: SortCol) => {
    startTransition(() => {
      setSortConfig((prev) => ({
        col,
        dir: prev.col === col && prev.dir === "asc" ? "desc" : "asc",
      }));
      const newFlatPesoSort = col === "peso" || col === "pesoRedondeo";
      if (newFlatPesoSort) setShowGroupHeaders(false);
      else if (flatPesoSort) setShowGroupHeaders(true);
    });
  };

  // Peso/pesoRedondeo sort: rows rendered flat (no grouping) for individual weight validation.
  // Hoisted here so both the toolbar button and the tbody IIFE can reference it.
  const flatPesoSort =
    sortConfig.col === "peso" || sortConfig.col === "pesoRedondeo";

  const { user: authUser } = useFirebaseAuth();

  // ── Audit log for opening and closing the manifest modal ──────────────────
  useEffect(() => {
    if (showTable && resultData.manifestNumber) {
      // Force reload the learned matches cache on mount to ensure 100% fresh matching rules
      reloadLearnedMatches().catch(err => {
        console.error("[Nova] Error al recargar caché de aprendizaje en el montaje:", err);
      });

      logAction({
        userId: authUser?.id || "unknown",
        userName: authUser?.fullName || authUser?.email || "Usuario Nova",
        userEmail: authUser?.email || undefined,
        action: "manifest_viewed",
        category: "manifest",
        resource: "manifests",
        resourceId: resultData.manifestNumber,
        result: "success",
        metadata: {
          event: "modal_opened",
          manifestNumber: resultData.manifestNumber,
        },
      });

      return () => {
        logAction({
          userId: authUser?.id || "unknown",
          userName: authUser?.fullName || authUser?.email || "Usuario Nova",
          userEmail: authUser?.email || undefined,
          action: "manifest_closed",
          category: "manifest",
          resource: "manifests",
          resourceId: resultData.manifestNumber,
          result: "success",
          metadata: {
            event: "modal_closed",
            manifestNumber: resultData.manifestNumber,
          },
        });
      };
    }
  }, [showTable, resultData.manifestNumber, authUser]);

  // Derive country/shippingType from manifestType string (e.g. 'usa_air' → ['usa','air'])
  const [manifestCountry, manifestShipping] = useMemo(() => {
    const parts = ((resultData.manifestType as string) ?? "usa_air").split("_");
    return [parts[0] ?? "usa", parts[1] ?? "air"] as const;
  }, [resultData.manifestType]);

  // ── Price calculations ─────────────────────────────────────────────────────
  const {
    computedPrices,
    tc,
    getEffectivePrice,
    getEffectivePesoRedondeo,
    applyRecalc,
    recalcFlash,
  } = useNovaPriceCalcs({
    resultDataRows: resultData.rows,
    manifestCountry,
    manifestShipping,
    exchangeRate,
    priceOverrides,
    setPriceOverrides,
    loadedFromFirestore: resultData.loadedFromFirestore,
  });

  const handleRecalculate = useCallback(() => {
    const targets =
      selectedRows.size > 0
        ? [...selectedRows]
        : resultData.rows.map((_, i) => i);
    setRecalcConfirm({ type: "recalc", targets });
  }, [selectedRows, resultData.rows]);

  // ── Manifest picker: load recent manifests when picker opens ──────────────
  useEffect(() => {
    if (manifestPicker?.step !== 1 && bulkMoveManifestPicker?.step !== 1) return;
    setIsLoadingManifests(true);
    getRecentManifests(80)
      .then((r) => {
        setManifestSuggestions(r);
      })
      .finally(() => setIsLoadingManifests(false));
  }, [manifestPicker?.step, bulkMoveManifestPicker?.step]);

  // Filter suggestions by search query (case-insensitive, includes current manifest as option)
  const filteredManifestSuggestions = useMemo(() => {
    const q = manifestPickerSearch.trim().toUpperCase();
    const suggestions = manifestSuggestions.filter(
      (m) => m.id !== resultData.manifestNumber,
    );
    if (!q) return suggestions;
    return suggestions.filter((m) => m.id.toUpperCase().includes(q));
  }, [manifestSuggestions, manifestPickerSearch, resultData.manifestNumber]);

  // Filter suggestions by search query for bulk move (case-insensitive, includes current manifest as option)
  const filteredBulkMoveSuggestions = useMemo(() => {
    const q = bulkMoveSearch.trim().toUpperCase();
    let suggestions = manifestSuggestions.filter(
      (m) => m.id !== resultData.manifestNumber,
    );
    if (bulkMoveManifestPicker?.isEncomiendaOnly) {
      suggestions = suggestions.filter(
        (m) => m.isEncomienda === true || m.id.toUpperCase().startsWith("ENC-")
      );
    }
    if (!q) return suggestions;
    return suggestions.filter((m) => m.id.toUpperCase().includes(q));
  }, [manifestSuggestions, bulkMoveSearch, resultData.manifestNumber, bulkMoveManifestPicker?.isEncomiendaOnly]);

  // Apply chosen manifest override to targetIndices.
  // Setting a manifest: stores the override + visually removes rows from the table.
  // Clearing (manifestId = ''): removes override + restores rows to the table.
  const applyManifestOverride = useCallback(
    (indices: number[], manifestId: string) => {
      setManifestOverrides((prev) => {
        const next = { ...prev };
        indices.forEach((i) => {
          if (manifestId) {
            next[i] = manifestId;
          } else {
            delete next[i];
          }
        });
        return next;
      });
      // Track reassigned rows separately from truly-deleted ones so they can
      // be restored to the table when the override is cleared.
      setManifestReassignedIndices((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => (manifestId ? next.add(i) : next.delete(i)));
        return next;
      });
    },
    [],
  );

  // ── Bulk delete handler ───────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (!showBulkDelete || showBulkDelete.step !== 2 || isDeleting) return;
    if (deleteConfirmText.trim().toUpperCase() !== "ELIMINAR") return;
    setIsDeleting(true);
    try {
      const indices = showBulkDelete.indices;
      const trackings = indices
        .map((i) => resultData.rows[i]?.tracking)
        .filter(Boolean) as string[];
      
      await deletePackagesByTrackings(trackings, resultData.manifestNumber, authUser?.email || "operator");

      // Prune from manifest's embedded array in Firestore
      if (resultData.manifestNumber) {
        const docRef = doc(db, 'manifests', resultData.manifestNumber);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const mData = snap.data();
          const current = Array.isArray(mData.packages) ? mData.packages : [];
          const trackingSet = new Set(trackings.map(t => t.toUpperCase()));
          const remaining = current.filter(p => {
            const trk = String(p.tracking || p.trackingNumber || p.guia || '').toUpperCase();
            return !trackingSet.has(trk);
          });
          if (remaining.length !== current.length) {
            const totalWeight = remaining.reduce((sum, p) => sum + (p.weight || 0), 0);
            const totalPrice = remaining.reduce((sum, p) => sum + (p.price || 0), 0);
            const routes = [...new Set(remaining.map(p => p.ruta).filter(Boolean))];
            const customersMap = new Map();
            remaining.forEach(p => {
              if (!p.slCode) return;
              const existing = customersMap.get(p.slCode);
              if (existing) {
                existing.packageCount++;
              } else {
                customersMap.set(p.slCode, {
                  slCode: p.slCode,
                  fullName: p.customerName || p.nombre || '',
                  email: p.customerEmail || '',
                  ruta: p.ruta || '',
                  packageCount: 1,
                });
              }
            });
            await setDoc(docRef, {
              totalPackages: remaining.length,
              totalWeight: Math.round(totalWeight * 100) / 100,
              totalPrice: Math.round(totalPrice * 100) / 100,
              totalCustomers: customersMap.size,
              routes,
              packages: remaining,
              customers: Array.from(customersMap.values()),
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }
        }
      }

      // Audit log deletion action
      logAction({
        userId: authUser?.id || "unknown",
        userName: authUser?.fullName || authUser?.email || "Usuario Nova",
        userEmail: authUser?.email || undefined,
        action: 'package_deleted',
        category: 'manifest',
        resource: 'manifests',
        resourceId: resultData.manifestNumber,
        result: 'success',
        metadata: {
          note: `Eliminación masiva de paquetes ejecutada en Nova.`,
          trackings,
        }
      });

      // Remove from local view
      setDeletedIndices((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.add(i));
        return next;
      });
      setSelectedRows((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });
      setShowBulkDelete(null);
      setDeleteConfirmText("");
    } catch (err: any) {
      console.error("[Nova] handleBulkDelete error:", err);
      
      // Audit log for failure
      logAction({
        userId: authUser?.id || "unknown",
        userName: authUser?.fullName || authUser?.email || "Usuario Nova",
        userEmail: authUser?.email || undefined,
        action: 'package_deleted',
        category: 'manifest',
        resource: 'manifests',
        resourceId: resultData.manifestNumber || "unknown",
        result: 'error',
        metadata: {
          note: `Fallo al intentar desvincular paquetes en Nova.`,
          error: err?.message || String(err),
          trackings: showBulkDelete?.indices
            ? (showBulkDelete.indices.map((i) => resultData.rows[i]?.tracking).filter(Boolean) as string[])
            : []
        }
      });

      toast({
        title: "Error al desvincular",
        description: `No se pudieron desvincular los paquetes seleccionados. Detalle del error: ${err?.message || "Problema de conexión, validación o permisos en Firestore."}`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [
    showBulkDelete,
    isDeleting,
    deleteConfirmText,
    resultData.rows,
    resultData.manifestNumber,
    authUser,
  ]);


  // ── Bulk Move to Manifest handlers ───────────────────────────────────────
  const handleReassignEncomiendas = useCallback(() => {
    const targetRows = selectedRows.size > 0
      ? resultData.rows.filter((_, i) => selectedRows.has(i))
      : resultData.rows.filter((_, idx) => !deletedIndices.has(idx) && !manifestReassignedIndices.has(idx));

    const encomiendaIndices: number[] = [];
    targetRows.forEach((row) => {
      const origIdx = resultData.rows.indexOf(row);
      if (origIdx !== -1) {
        // Resolver ruta efectiva (incluyendo mapeos y overrides)
        const override = slCodeOverrides[origIdx];
        const effectiveSlCode = unlinkedRows.has(origIdx)
          ? ""
          : override?.slCode ||
          matchOverrides[origIdx]?.slCode ||
          row.slCode;
        const effNombre = nameOverrides[origIdx] ?? row.nombre;
        const rk = effectiveSlCode || `__unmatched__${effNombre}`;
        const effectiveRuta =
          rutaOverrides[rk] ??
          rutaOverrides[`__unmatched__${row.nombre}`] ??
          rutaOverrides[row.slCode] ??
          (override?.ruta || row.ruta) ??
          "";

        if (effectiveRuta === "Encomiendas") {
          encomiendaIndices.push(origIdx);
        }
      }
    });

    if (encomiendaIndices.length === 0) {
      toast({
        title: "Sin encomiendas",
        description: "No se encontraron paquetes con ruta 'Encomiendas' para reasignar.",
        variant: "destructive",
      });
      return;
    }

    setBulkMoveManifestPicker({
      targetIndices: encomiendaIndices,
      step: 1,
      selectedManifestId: "",
      isEncomiendaOnly: true,
    });
    setBulkMoveSearch("");
  }, [selectedRows, resultData.rows, deletedIndices, manifestReassignedIndices, slCodeOverrides, unlinkedRows, matchOverrides, nameOverrides, rutaOverrides, toast]);

  const handleOpenBulkMoveManifest = useCallback(() => {
    if (selectedRows.size === 0) return;
    setBulkMoveManifestPicker({
      targetIndices: Array.from(selectedRows),
      step: 1,
      selectedManifestId: "",
    });
    setBulkMoveSearch("");
  }, [selectedRows]);

  const handleExecuteBulkMove = useCallback(async () => {
    if (!bulkMoveManifestPicker || bulkMoveManifestPicker.step !== 2 || isMovingManifest) return;
    const targetManifestId = bulkMoveManifestPicker.selectedManifestId.trim().toUpperCase();
    if (!targetManifestId) return;

    setIsMovingManifest(true);

    // Backup arrays for rollback
    const invoicesBackup: { id: string; data: any }[] = [];
    const packagesBackupTrackings: string[] = [];

    try {
      const indices = bulkMoveManifestPicker.targetIndices;
      // Get trackings
      const trackings = indices
        .map((i) => resultData.rows[i]?.tracking)
        .filter(Boolean) as string[];

      // 0. Backup original invoices before modifying/deleting them
      const invQ = query(collection(db, "invoices"), where("manifestNumber", "==", resultData.manifestNumber));
      const invSnap = await getDocs(invQ);
      const trackingSet = new Set(trackings.map(t => t.toUpperCase()));

      invSnap.docs.forEach(d => {
        const data = d.data();
        const single = (data.trackingNumber as string) ?? "";
        const multi = Array.isArray(data.trackingNumbers) ? data.trackingNumbers : [];
        const allTrackings = [single, ...multi].map(t => t.toUpperCase()).filter(Boolean);
        if (allTrackings.some(t => trackingSet.has(t))) {
          invoicesBackup.push({ id: d.id, data });
        }
      });

      // 1. Delete draft invoices in current manifest
      const draftDeletedCount = await deleteInvoicesForTrackings(
        trackings,
        resultData.manifestNumber
      );

      // 2. Annul active non-draft invoices in current manifest (preserve paid ones)
      const annulResult = await annulInvoicesByTrackingsAndManifest(
        trackings,
        resultData.manifestNumber,
        {
          reason: `Traslado masivo a manifiesto ${targetManifestId}`,
          annulledBy: authUser?.email || "usuario",
        }
      );

      // 3. Update packages and encomiendas manifestNumber in Firestore collections
      const nowStr = new Date().toISOString();
      const BATCH_LIMIT = 500;
      let batch = writeBatch(db);
      let batchCount = 0;

      for (const t of trackings) {
        const trackingUpper = t.toUpperCase();
        packagesBackupTrackings.push(trackingUpper);

        // Update packages collection
        const docRef = doc(db, "packages", trackingUpper);
        batch.set(
          docRef,
          {
            manifestNumber: targetManifestId,
            updatedAt: nowStr,
            ...(targetManifestId.startsWith("ENC-") ? { encomiendaManifestNumber: targetManifestId } : {}),
          },
          { merge: true }
        );
        batchCount++;

        // Update manifest_encomiendas collection
        const encRef = doc(db, "manifest_encomiendas", trackingUpper);
        batch.set(
          encRef,
          {
            manifestNumber: targetManifestId,
            updatedAt: nowStr,
          },
          { merge: true }
        );
        batchCount++;

        if (batchCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
      if (batchCount > 0) {
        await batch.commit();
      }

      // 4. Update local reactive view state to visually hide moved packages immediately
      setDeletedIndices((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.add(i));
        return next;
      });

      // Clear selection
      setSelectedRows((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });

      // 5. Success feedback toast
      toast({
        title: "Traslado masivo exitoso",
        description: `Se trasladaron ${trackings.length} paquete(s) al manifiesto ${targetManifestId}. Facturas: ${draftDeletedCount} eliminada(s) (borrador), ${annulResult.annulledIds.length} anulada(s). ${annulResult.skippedPaid > 0 ? `${annulResult.skippedPaid} factura(s) pagada(s) protegidas.` : ""}`,
      });

      setLastReassignment({
        trackings,
        originalManifestNumber: resultData.manifestNumber || "",
        targetManifestId,
        invoicesBackup,
        indices: [...indices],
      });

      logAction({
        userId: authUser?.id || "unknown",
        userName: authUser?.fullName || authUser?.email || "Usuario Nova",
        userEmail: authUser?.email || undefined,
        action: "manifest_packages_moved",
        category: "manifest",
        resource: "manifests",
        resourceId: resultData.manifestNumber || "unknown",
        result: "success",
        metadata: {
          action: "packages_moved_nova",
          sourceManifest: resultData.manifestNumber || "",
          targetManifest: targetManifestId,
          packagesCount: trackings.length,
          trackings,
          isEncomiendaOnly: !!bulkMoveManifestPicker?.isEncomiendaOnly,
        },
      });

      setBulkMoveManifestPicker(null);
    } catch (err: any) {
      console.error("[Nova][BulkMove] Error occurred, initiating automated rollback...", err);

      // RUN ROLLBACK TO RESTORE SYSTEM CONSISTENCY
      try {
        // Rollback packages and manifest_encomiendas
        if (packagesBackupTrackings.length > 0) {
          const nowStr = new Date().toISOString();
          let rBatch = writeBatch(db);
          let rBatchCount = 0;
          for (const trackingUpper of packagesBackupTrackings) {
            const docRef = doc(db, "packages", trackingUpper);
            rBatch.set(
              docRef,
              {
                manifestNumber: resultData.manifestNumber,
                updatedAt: nowStr,
                encomiendaManifestNumber: deleteField(),
              },
              { merge: true }
            );
            rBatchCount++;

            const encRef = doc(db, "manifest_encomiendas", trackingUpper);
            rBatch.set(
              encRef,
              {
                manifestNumber: resultData.manifestNumber,
                updatedAt: nowStr,
              },
              { merge: true }
            );
            rBatchCount++;

            if (rBatchCount >= 500) {
              await rBatch.commit();
              rBatch = writeBatch(db);
              rBatchCount = 0;
            }
          }
          if (rBatchCount > 0) {
            await rBatch.commit();
          }
        }

        // Restore backup invoices
        if (invoicesBackup.length > 0) {
          let invBatch = writeBatch(db);
          let invBatchCount = 0;
          for (const backup of invoicesBackup) {
            const docRef = doc(db, "invoices", backup.id);
            invBatch.set(docRef, backup.data);
            invBatchCount++;
            if (invBatchCount >= 500) {
              await invBatch.commit();
              invBatch = writeBatch(db);
              invBatchCount = 0;
            }
          }
          if (invBatchCount > 0) {
            await invBatch.commit();
          }
        }

        toast({
          title: "Traslado fallido y base de datos revertida",
          description: `Se produjo un error durante el traslado masivo. Toda la operación se canceló y el estado original de los paquetes y facturas fue restaurado automáticamente. Detalle: ${err?.message || "Error desconocido"}`,
          variant: "destructive",
        });
      } catch (rollbackErr: any) {
        console.error("[Nova][BulkMove][Rollback] Rollback process failed with critical error:", rollbackErr);
        toast({
          title: "ERROR CRÍTICO: Reversión fallida",
          description: `El traslado masivo falló y no se pudo restaurar el estado original automáticamente: ${rollbackErr?.message || "Error desconocido"}. Por favor contacte soporte técnico inmediatamente.`,
          variant: "destructive",
        });
      }
    } finally {
      setIsMovingManifest(false);
    }
  }, [
    bulkMoveManifestPicker,
    isMovingManifest,
    resultData.rows,
    resultData.manifestNumber,
    authUser?.email,
    toast,
  ]);

  const handleUndoReassignment = useCallback(async () => {
    if (!lastReassignment || isUndoingReassignment) return;
    setIsUndoingReassignment(true);
    try {
      const { trackings, originalManifestNumber, targetManifestId, invoicesBackup, indices } = lastReassignment;
      const nowStr = new Date().toISOString();

      // 1. Revert packages and manifest_encomiendas in Firestore
      let rBatch = writeBatch(db);
      let rBatchCount = 0;
      for (const tracking of trackings) {
        const trackingUpper = tracking.toUpperCase();

        const docRef = doc(db, "packages", trackingUpper);
        rBatch.set(
          docRef,
          {
            manifestNumber: originalManifestNumber,
            updatedAt: nowStr,
            encomiendaManifestNumber: deleteField(),
          },
          { merge: true }
        );
        rBatchCount++;

        const encRef = doc(db, "manifest_encomiendas", trackingUpper);
        rBatch.set(
          encRef,
          {
            manifestNumber: originalManifestNumber,
            updatedAt: nowStr,
          },
          { merge: true }
        );
        rBatchCount++;

        if (rBatchCount >= 500) {
          await rBatch.commit();
          rBatch = writeBatch(db);
          rBatchCount = 0;
        }
      }
      if (rBatchCount > 0) {
        await rBatch.commit();
      }

      // 2. Restore backup invoices
      if (invoicesBackup.length > 0) {
        let invBatch = writeBatch(db);
        let invBatchCount = 0;
        for (const backup of invoicesBackup) {
          const docRef = doc(db, "invoices", backup.id);
          invBatch.set(docRef, backup.data);
          invBatchCount++;
          if (invBatchCount >= 500) {
            await invBatch.commit();
            invBatch = writeBatch(db);
            invBatchCount = 0;
          }
        }
        if (invBatchCount > 0) {
          await invBatch.commit();
        }
      }

      // 3. Revert local view state
      setDeletedIndices((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });

      toast({
        title: "Reasignación revertida exitosamente",
        description: `Se recuperaron ${trackings.length} paquetes al manifiesto original ${originalManifestNumber}. Facturas restauradas.`,
      });

      logAction({
        userId: authUser?.id || "unknown",
        userName: authUser?.fullName || authUser?.email || "Usuario Nova",
        userEmail: authUser?.email || undefined,
        action: "manifest_packages_moved",
        category: "manifest",
        resource: "manifests",
        resourceId: targetManifestId, // Target manifest they were moved to
        result: "success",
        metadata: {
          action: "packages_moved_nova_undo",
          sourceManifest: targetManifestId,
          targetManifest: originalManifestNumber,
          packagesCount: trackings.length,
          trackings,
        },
      });

      setLastReassignment(null);
    } catch (err: any) {
      console.error("[Nova][UndoReassignment] Error during undo:", err);
      toast({
        title: "Error al revertir la reasignación",
        description: `No se pudo deshacer la reasignación: ${err?.message || "Error desconocido"}`,
        variant: "destructive",
      });
    } finally {
      setIsUndoingReassignment(false);
    }
  }, [lastReassignment, isUndoingReassignment, toast]);

  const handleRoundAndRecalc = useCallback(() => {
    const targets =
      selectedRows.size > 0
        ? [...selectedRows]
        : resultData.rows.map((_, i) => i);
    setRoundingModal({ targets, granularity: 1 });
  }, [selectedRows, resultData.rows]);

  const handleRoundEncomiendas = useCallback(() => {
    const targets = resultData.rows
      .map((row, idx) => {
        const effSlCodeForRuta =
          slCodeOverrides[idx]?.slCode ??
          matchOverrides[idx]?.slCode ??
          row.slCode;
        const effectiveRuta =
          rutaOverrides[effSlCodeForRuta] ??
          rutaOverrides[`__unmatched__${row.nombre}`] ??
          slCodeOverrides[idx]?.ruta ??
          matchOverrides[idx]?.ruta ??
          (row.ruta || "");
        return effectiveRuta === "Encomiendas" ? idx : -1;
      })
      .filter((idx) => idx >= 0);
    if (targets.length > 0) setRecalcConfirm({ type: "encomiendas", targets });
  }, [resultData.rows, rutaOverrides, slCodeOverrides, matchOverrides]);

  const confirmRecalc = useCallback(() => {
    if (!recalcConfirm) return;
    applyRecalc(
      recalcConfirm.targets,
      recalcConfirm.type !== "recalc" ? 1 : false,
    );
    setRecalcResult({
      type: recalcConfirm.type,
      count: recalcConfirm.targets.length,
    });
    setRecalcConfirm(null);
  }, [recalcConfirm, applyRecalc]);

  const rowNeedsReview = useCallback(
    (row: (typeof resultData.rows)[0], originalIdx: number): boolean => {
      if (unlinkedRows.has(originalIdx)) return true;
      const overrideSlCode = slCodeOverrides[originalIdx]?.slCode;
      const effectiveSlCode = overrideSlCode || row.slCode;
      if (!effectiveSlCode) return true;
      // BUG-F4: don't flag as review if operator explicitly assigned a customer via any override
      const hasManualAssignment = !!(
        matchOverrides[originalIdx] || slCodeOverrides[originalIdx]
      );
      if (!row.nombreCliente && !hasManualAssignment) return true;
      if (
        row.matchScore !== undefined &&
        row.matchScore < 0.65 &&
        !hasManualAssignment
      )
        return true;
      return false;
    },
    [slCodeOverrides, matchOverrides, unlinkedRows],
  );

  const filteredIdxs = useMemo(
    () =>
      resultData.rows
        .map((row, originalIdx) => ({ row, originalIdx }))
        .filter(({ row, originalIdx }) => {
          if (deletedIndices.has(originalIdx)) return false;
          if (manifestReassignedIndices.has(originalIdx)) return false;
          if (showOnlyReview && !rowNeedsReview(row, originalIdx)) return false;
          if (showOnlyDivergent) {
            const effCustomerName =
              matchOverrides[originalIdx]?.fullName || row.nombreCliente;
            if (!effCustomerName || unlinkedRows.has(originalIdx)) return false;
            if (!isDivergentMatch(row.nombre, effCustomerName)) return false;
          }
          if (showOnlyNoSlCode) {
            // Unlinked rows are treated as having no slCode regardless of row.slCode
            if (!unlinkedRows.has(originalIdx)) {
              const effSlCode =
                slCodeOverrides[originalIdx]?.slCode ||
                matchOverrides[originalIdx]?.slCode ||
                row.slCode;
              if (effSlCode) return false;
            }
          }
          if (showOnlyTempOrNan) {
            if (unlinkedRows.has(originalIdx)) return false;
            const effSlCode =
              slCodeOverrides[originalIdx]?.slCode ||
              matchOverrides[originalIdx]?.slCode ||
              row.slCode;
            if (!effSlCode || !effSlCode.toUpperCase().startsWith("SL-NAN-"))
              return false;
          }
          if (showOnlyPreAlerted) {
            const normTracking = (row.tracking || "").toUpperCase().trim();
            const info = preAlertsMap.get(normTracking);
            if (!info || !info.found) return false;
          }
          if (debouncedRouteFilter) {
            const override = slCodeOverrides[originalIdx];
            // Mirror the same effectiveSlCode logic used in rendering (line ~1894)
            const effectiveSlCode = unlinkedRows.has(originalIdx)
              ? ""
              : override?.slCode ||
              matchOverrides[originalIdx]?.slCode ||
              row.slCode;
            const effNombre = nameOverrides[originalIdx] ?? row.nombre;
            const rk = effectiveSlCode || `__unmatched__${effNombre}`;
            const effectiveRuta =
              rutaOverrides[rk] ??
              rutaOverrides[`__unmatched__${row.nombre}`] ??
              rutaOverrides[`__unmatched__${row.nombre}`] ??
              rutaOverrides[row.slCode] ??
              (override?.ruta || row.ruta) ??
              "";
            if (debouncedRouteFilter === "__sin_ruta__") {
              if (effectiveRuta) return false;
            } else {
              if (effectiveRuta !== debouncedRouteFilter) return false;
            }
          }
          if (manifestFilter && row.manifiesto !== manifestFilter) return false;
          if (!debouncedTableFilter.trim()) return true;
          const q = debouncedTableFilter.toLowerCase();
          // BUG-F1/F2/F3: include overridden names and slCode in text search
          const effName =
            matchOverrides[originalIdx]?.fullName ??
            nameOverrides[originalIdx] ??
            row.nombreCliente;
          const override = slCodeOverrides[originalIdx];
          const effSlCode = override?.slCode || row.slCode;
          return (
            row.tracking?.toLowerCase().includes(q) ||
            row.nombre?.toLowerCase().includes(q) ||
            effName?.toLowerCase().includes(q) ||
            effSlCode?.toLowerCase().includes(q) ||
            row.ruta?.toLowerCase().includes(q) ||
            row.descripcion?.toLowerCase().includes(q)
          );
        })
        .map(({ originalIdx }) => originalIdx),
    [
      resultData.rows,
      showOnlyReview,
      showOnlyDivergent,
      showOnlyNoSlCode,
      showOnlyTempOrNan,
      showOnlyPreAlerted,
      preAlertsMap,
      debouncedRouteFilter,
      manifestFilter,
      debouncedTableFilter,
      slCodeOverrides,
      rutaOverrides,
      nameOverrides,
      matchOverrides,
      rowNeedsReview,
      deletedIndices,
      manifestReassignedIndices,
      unlinkedRows,
    ],
  );

  const uniqueManifests = useMemo(() => {
    const seen = new Set<string>();
    resultData.rows.forEach((r) => {
      if (r.manifiesto) seen.add(r.manifiesto);
    });
    return Array.from(seen).sort();
  }, [resultData.rows]);
  const isFusion = uniqueManifests.length > 1;

  // Groups with a matched slCode but no route assigned — blocks save
  const unroutedGroupKeys = useMemo(() => {
    const missing = new Set<string>();
    const seen = new Set<string>();
    filteredIdxs.forEach((originalIdx) => {
      const row = resultData.rows[originalIdx];
      const override = slCodeOverrides[originalIdx];
      const effectiveSlCode = override?.slCode || row.slCode;
      if (!effectiveSlCode) return;
      if (seen.has(effectiveSlCode)) return;
      seen.add(effectiveSlCode);
      const effectiveRuta =
        rutaOverrides[effectiveSlCode] ??
        rutaOverrides[effectiveSlCode || `__unmatched__${row.nombre}`] ??
        rutaOverrides[row.slCode] ??
        (override?.ruta || row.ruta);
      if (!effectiveRuta) missing.add(effectiveSlCode);
    });
    return missing;
  }, [filteredIdxs, resultData.rows, slCodeOverrides, rutaOverrides]);
  const hasUnroutedGroups = unroutedGroupKeys.size > 0;

  // Auto-show banner whenever new unrouted groups appear
  useEffect(() => {
    if (hasUnroutedGroups) setRouteWarningDismissed(false);
  }, [hasUnroutedGroups]);

  const isAllSelected =
    filteredIdxs.length > 0 && filteredIdxs.every((i) => selectedRows.has(i));
  const isIndeterminate =
    !isAllSelected && filteredIdxs.some((i) => selectedRows.has(i));

  const toggleSelectAll = useCallback(() => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        filteredIdxs.forEach((i) => next.delete(i));
      } else {
        filteredIdxs.forEach((i) => next.add(i));
      }
      return next;
    });
  }, [isAllSelected, filteredIdxs]);

  const toggleRow = useCallback((idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Rows to use for invoice/ingest operations — selected subset or filtered visible rows
  const activeRows = useMemo(
    () =>
      selectedRows.size > 0
        ? resultData.rows.filter((_, i) => selectedRows.has(i))
        : filteredIdxs.map((idx) => resultData.rows[idx]),
    [resultData.rows, selectedRows, filteredIdxs],
  );

  // ── Partial-selection UI summary (BUG-PARTIAL-SELECTION 2026-04-28) ─────
  // Mirrors the protection logic that runs inside handleIngestAndInvoice so
  // the save-confirm dialog can warn the operator BEFORE they click save.
  // Recomputes whenever selection or persisted invoices change.
  const partialSelectionSummary = useMemo(() => {
    if (selectedRows.size === 0)
      return { protectedGroups: 0, preservedTrackings: 0 };
    const selectedTrackings = new Set<string>();
    activeRows.forEach((r) => {
      if (r.tracking) selectedTrackings.add(r.tracking.toUpperCase());
    });
    const fp = new Map<string, { trackings: Set<string> }>();
    persistedInvoices.forEach((inv) => {
      const status = String(inv.status || "").toLowerCase();
      if (status === "annulled" || status === "cancelled" || status === "void")
        return;
      const slCode = String(
        inv.clientSlCode || inv.slCode || ""
      ).toUpperCase();
      if (!slCode || slCode === "BB" || slCode === "M" || slCode === "SR")
        return;
      const entry = fp.get(slCode) ?? { trackings: new Set<string>() };
      const single = (inv.trackingNumber ?? "") as string;
      const multi = Array.isArray(inv.trackingNumbers)
        ? (inv.trackingNumbers as string[])
        : [];
      [...(single ? [single] : []), ...multi].forEach((t) => {
        if (t) entry.trackings.add(t.toUpperCase());
      });
      fp.set(slCode, entry);
    });
    const { protectedKeys, preservedTrackings } = computeProtectedGroupKeys(
      fp,
      selectedTrackings,
    );
    return { protectedGroups: protectedKeys.size, preservedTrackings };
  }, [selectedRows, activeRows, persistedInvoices]);

  // ── Unmatched-rows summary ────────────────────────────────────────────────
  // Computes the set of rows that have NO effective slCode after all
  // overrides have been applied. Used by the save dialog to surface the
  // "Auto-crear N clientes temporales" affordance — the operator's
  // explicit click triggers `createOrGetTempCustomer` for every unique
  // unmatched name and applies the resulting SL-NAN-… code via
  // `applyExplicitMatch`. Without this step those rows would be saved
  // with empty slCode and skipped from invoicing.
  //
  // Indexed by the operator's chosen display name (post override) so two
  // rows that the operator manually re-named to the same string land on a
  // single temp customer.
  const unmatchedByName = useMemo<Map<string, number[]>>(() => {
    const map = new Map<string, number[]>();
    resultData.rows.forEach((row, idx) => {
      if (deletedIndices.has(idx)) return;
      if (unlinkedRows.has(idx)) return;
      const effSlCode =
        slCodeOverrides[idx]?.slCode ||
        matchOverrides[idx]?.slCode ||
        row.slCode;
      if (effSlCode) return;
      const name = (nameOverrides[idx] || row.nombre || "").trim();
      if (!name) return;
      const list = map.get(name) ?? [];
      list.push(idx);
      map.set(name, list);
    });
    return map;
  }, [
    resultData.rows,
    deletedIndices,
    unlinkedRows,
    slCodeOverrides,
    matchOverrides,
    nameOverrides,
  ]);

  // ── Auto-create temp customers for unmatched rows ────────────────────────
  // Iterates `unmatchedByName`, calls `createOrGetTempCustomer` per unique
  // name (creating SL-NAN-… docs in `temp_customers` if not already
  // present), and applies the resulting customer to every row in that
  // name-group via `applyExplicitMatch`. Operator-driven only — never
  // auto-fires; the save dialog renders an explicit button.
  //
  // The handler awaits all Firestore creates in parallel and surfaces a
  // boolean for the button's loading state. Errors per-name are
  // swallowed (warned to console) so a single name failure doesn't block
  // the rest. Re-running is safe — `createOrGetTempCustomer` dedupes by
  // normalized name.
  const [autoCreatingTemp, setAutoCreatingTemp] = useState(false);
  const handleAutoCreateTempCustomers = useCallback(async () => {
    if (unmatchedByName.size === 0) return;
    setAutoCreatingTemp(true);
    try {
      const entries = Array.from(unmatchedByName.entries());
      const results = await Promise.all(
        entries.map(async ([name]) => {
          try {
            const temp = await createOrGetTempCustomer(
              name,
              undefined,
              "nova_unmatched_save",
            );
            return { name, slCode: temp.slCode, ok: true as const };
          } catch (err) {
            console.warn(
              "[Nova] createOrGetTempCustomer failed for",
              name,
              err,
            );
            return { name, slCode: "", ok: false as const };
          }
        }),
      );
      results.forEach(({ name, slCode, ok }) => {
        if (!ok || !slCode) return;
        const indices = unmatchedByName.get(name) ?? [];
        if (indices.length === 0) return;
        applyExplicitMatch(indices, { slCode, fullName: name, ruta: "" });
      });
    } finally {
      setAutoCreatingTemp(false);
    }
  }, [unmatchedByName, applyExplicitMatch]);

  // ── Verification of packages with pre-alerts (isolated correction helper) ──
  const [verifyingPreAlerts, setVerifyingPreAlerts] = useState(false);
  const handleVerifyPreAlerts = useCallback(async (targetRowIndices?: number[]) => {
    setVerifyingPreAlerts(true);
    setIsAutoSavePaused(true);
    setValidationProgress({
      active: true,
      current: 0,
      total: 0,
      message: "Verificando pre-alertas en vivo (SP2)...",
      isFadingOut: false,
    });
    try {
      const activeIndices = resultData.rows
        .map((row, idx) => ({ row, idx }))
        .filter(({ idx }) => !deletedIndices.has(idx) && (!targetRowIndices || targetRowIndices.includes(idx)));

      if (activeIndices.length === 0) {
        toast({
          title: "Sin filas",
          description: "No hay filas seleccionadas para verificar.",
        });
        return;
      }

      const trackingList = activeIndices
        .map(({ row }) => (row.tracking || "").toUpperCase().trim())
        .filter(Boolean);

      if (trackingList.length === 0) {
        toast({
          title: "Sin números de rastreo",
          description: "No se encontraron números de rastreo para verificar.",
        });
        return;
      }

      setValidationProgress(prev => ({ ...prev, total: trackingList.length }));

      const preAlertMap = new Map<string, any>();
      for (let i = 0; i < trackingList.length; i += 15) {
        const chunk = trackingList.slice(i, i + 15);
        const chunkMap = await batchCheckTrackingPreAlerts(chunk, resultData.manifestNumber);
        chunkMap.forEach((val, key) => {
          preAlertMap.set(key, val);
        });
        const currentProcessed = Math.min(i + 15, trackingList.length);
        setValidationProgress(prev => ({
          ...prev,
          current: currentProcessed,
          message: `Verificando ${currentProcessed} de ${trackingList.length} pre-alertas en vivo...`,
        }));
      }

      // Update state preAlertsMap so badges and tooltips render immediately!
      setPreAlertsMap(prev => {
        const next = new Map(prev);
        preAlertMap.forEach((val, key) => {
          if (val?.found) next.set(key, val);
        });
        return next;
      });

      const preAlertSlCodes = new Set<string>();
      activeIndices.forEach(({ row }) => {
        const trackingKey = (row.tracking || "").toUpperCase().trim();
        const info = preAlertMap.get(trackingKey);
        if (info?.found && info.slCode) {
          preAlertSlCodes.add(info.slCode.toUpperCase().trim());
        }
      });

      const customerProfiles = new Map<string, { slCode: string; fullName: string; ruta?: string }>();
      if (preAlertSlCodes.size > 0) {
        const customers = await getCustomersBySlCodes(Array.from(preAlertSlCodes));
        customers.forEach(c => {
          if (c.slCode) {
            customerProfiles.set(c.slCode.toUpperCase().trim(), {
              slCode: c.slCode,
              fullName: c.fullName || "",
              ruta: c.ruta || "",
            });
          }
        });
      }

      let correctedCount = 0;
      activeIndices.forEach(({ row, idx }) => {
        const trackingKey = (row.tracking || "").toUpperCase().trim();
        const info = preAlertMap.get(trackingKey);

        if (info?.found && info.slCode) {
          const preAlertSlCode = info.slCode.toUpperCase().trim();
          const currentSlCode = (slCodeOverrides[idx]?.slCode || row.slCode || "").toUpperCase().trim();

          if (!currentSlCode || currentSlCode.startsWith("SL-NAN-") || currentSlCode !== preAlertSlCode) {
            const profile = customerProfiles.get(preAlertSlCode);
            if (profile) {
              applyExplicitMatch([idx], {
                slCode: profile.slCode,
                fullName: profile.fullName,
                ruta: profile.ruta,
              });
              correctedCount++;
            } else {
              applyExplicitMatch([idx], {
                slCode: preAlertSlCode,
                fullName: (row.nombreCliente && !row.nombreCliente.includes('Cliente Pre-alertado') ? row.nombreCliente : (row.nombre || `Cliente Pre-alertado (${preAlertSlCode})`)),
                ruta: row.ruta || '',
              });
              correctedCount++;
            }
          }
        }
      });

      if (correctedCount > 0) {
        toast({
          title: "Verificación de Pre-Alertas",
          description: `Se han corregido ${correctedCount} asociaciones basadas en pre-alertas de clientes en vivo (SP2).`,
        });
      } else {
        toast({
          title: "Verificación de Pre-Alertas",
          description: "No se encontraron discrepancias. Todas las pre-alertas coinciden correctamente.",
        });
      }
    } catch (err) {
      console.error("[Nova] Error al verificar pre-alertas:", err);
      toast({
        variant: "destructive",
        title: "Error de verificación",
        description: `Ocurrió un error al consultar las pre-alertas en Firestore. Detalle: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setVerifyingPreAlerts(false);
      setValidationProgress(prev => ({ ...prev, isFadingOut: true }));
      setTimeout(() => {
        setValidationProgress({
          active: false,
          current: 0,
          total: 0,
          message: "",
          isFadingOut: false,
        });
      }, 500);
    }
  }, [resultData.rows, deletedIndices, toast, applyExplicitMatch, slCodeOverrides, setIsAutoSavePaused, setValidationProgress]);

  // ── Manual training of Nova matching system (teach Nova) ────────────────────
  const runNovaLearningSequence = useCallback(async (isSilent: boolean = false, targetIndices?: number[]) => {
    try {
      const itemsToLearn: Array<{
        manifestName: string;
        slCode: string;
        fullName: string;
        ruta: string | null;
        consolidationEnabled: boolean;
        source: 'admin_manual';
      }> = [];

      const unmatchedRoutesToLearn: Array<{
        manifestName: string;
        ruta: string;
      }> = [];

      const unlinkedNamesToForget: string[] = [];
      const taughtIndices: number[] = [];

      resultData.rows.forEach((row, idx) => {
        if (deletedIndices.has(idx)) return;
        if (targetIndices && !targetIndices.includes(idx)) return;

        if (unlinkedRows.has(idx)) {
          if (row.nombre) {
            unlinkedNamesToForget.push(row.nombre);
          }
          return;
        }

        const slCode = (slCodeOverrides[idx]?.slCode || matchOverrides[idx]?.slCode || row.slCode || '').trim();
        const fullName = matchOverrides[idx]?.fullName || row.nombreCliente;
        const rk = slCode || `__unmatched__${row.nombre}`;
        const effectiveRuta = (
          rutaOverrides[rk] ??
          rutaOverrides[`__unmatched__${row.nombre}`] ??
          slCodeOverrides[idx]?.ruta ??
          matchOverrides[idx]?.ruta ??
          row.ruta ??
          ''
        ).trim();

        const cc = slCode ? customerContactMap.get(slCode) : null;
        const consolidationEnabled = cc?.consolidationEnabled || row.consolidacion || false;

        const isRealCustomer = slCode && /^SL\d+$/i.test(slCode);

        if (isRealCustomer && fullName) {
          itemsToLearn.push({
            manifestName: row.nombre,
            slCode: slCode.toUpperCase().trim(),
            fullName,
            ruta: effectiveRuta || null,
            consolidationEnabled,
            source: 'admin_manual' as const,
          });
          taughtIndices.push(idx);
        } else if (effectiveRuta && row.nombre) {
          unmatchedRoutesToLearn.push({
            manifestName: row.nombre,
            ruta: effectiveRuta,
          });
          taughtIndices.push(idx);
        }
      });

      const totalItems = itemsToLearn.length + unmatchedRoutesToLearn.length + unlinkedNamesToForget.length;
      if (totalItems === 0) {
        if (!isSilent) {
          toast({
            title: "Sin datos para aprender",
            description: "No se encontraron clientes asociados válidos, rutas asignadas ni desasociaciones en la tabla actual.",
          });
        }
        return;
      }

      if (!isSilent) {
        setValidationProgress(prev => ({
          ...prev,
          total: totalItems,
          message: `Guardando ${itemsToLearn.length} clientes, ${unmatchedRoutesToLearn.length} rutas y procesando ${unlinkedNamesToForget.length} desasociaciones en Nova...`,
        }));
      }

      if (itemsToLearn.length > 0) {
        await saveMatchFeedbackBulk(itemsToLearn);
      }

      for (const uItem of unmatchedRoutesToLearn) {
        await saveUnmatchedRouteLearning(uItem.manifestName, uItem.ruta);
      }

      for (const name of unlinkedNamesToForget) {
        await forgetMatchFeedback(name);
      }

      await Promise.all([
        reloadLearnedMatches(),
        loadUnmatchedRouteCache(),
      ]);

      if (taughtIndices.length > 0) {
        setApprovedMatches(prev => new Set([...prev, ...taughtIndices]));
      }

      if (!isSilent) {
        setValidationProgress(prev => ({ ...prev, current: totalItems }));
        toast({
          title: "¡Nova ha aprendido!",
          description: `Se han guardado/actualizado exitosamente ${itemsToLearn.length} clientes, ${unmatchedRoutesToLearn.length} rutas y procesado ${unlinkedNamesToForget.length} desasociaciones en Nova.`,
        });
      } else {
        console.log(`[Nova] Auto-learned ${itemsToLearn.length} clients, ${unmatchedRoutesToLearn.length} routes, and forgot ${unlinkedNamesToForget.length} unlinked.`);
      }
    } catch (err) {
      console.error("[Nova] Error al ejecutar aprendizaje:", err);
      if (!isSilent) {
        toast({
          variant: "destructive",
          title: "Error de aprendizaje",
          description: `Ocurrió un error al guardar los datos de aprendizaje en Firestore. Detalle: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }, [
    resultData.rows,
    deletedIndices,
    unlinkedRows,
    slCodeOverrides,
    matchOverrides,
    rutaOverrides,
    customerContactMap,
    setApprovedMatches,
    toast,
    setValidationProgress,
  ]);

  const [teachingNova, setTeachingNova] = useState(false);
  const handleTeachNova = useCallback(async (targetIndices?: number[]) => {
    setTeachingNova(true);
    setIsAutoSavePaused(true);
    setValidationProgress({
      active: true,
      current: 0,
      total: 0,
      message: "Preparando asociaciones de nombres y rutas...",
      isFadingOut: false,
    });
    try {
      await runNovaLearningSequence(false, targetIndices);
    } finally {
      setTeachingNova(false);
      setValidationProgress(prev => ({ ...prev, isFadingOut: true }));
      setTimeout(() => {
        setValidationProgress({
          active: false,
          current: 0,
          total: 0,
          message: "",
          isFadingOut: false,
        });
        setIsAutoSavePaused(false);
      }, 500);
    }
  }, [runNovaLearningSequence, setIsAutoSavePaused, setValidationProgress]);

  // Billing prices that mirror the group-footer display.
  // Mirrors the table's isConsolidation rule: ≥2 non-permit rows for the same
  // effective slCode (AND not forced to individual via separateInvoices).
  // Does NOT rely on row.consolidacion which may be absent in Firestore-loaded manifests.
  const billedPrices = useMemo<number[]>(() => {
    // Group non-permit rows by effective slCode
    const groups = new Map<string, { sumPeso: number; indices: number[] }>();
    resultData.rows.forEach((row, idx) => {
      if (row.permisos) return;
      const effSl =
        slCodeOverrides[idx]?.slCode ??
        matchOverrides[idx]?.slCode ??
        row.slCode ??
        "";
      if (!effSl || unlinkedRows.has(idx)) return;
      const g = groups.get(effSl) ?? { sumPeso: 0, indices: [] };
      g.sumPeso += row.peso ?? 0;
      g.indices.push(idx);
      groups.set(effSl, g);
    });
    // For each group with ≥2 rows where consolidation is active (separateInvoices[slCode]=true),
    // compute ceiling-billed group total: ceil(sumPeso) × $12/kg.
    // separateInvoices[slCode]=true means «Factura única / consolidación» is ON (not individual).
    const groupTotals = new Map<string, number>();
    groups.forEach((g, slCode) => {
      if (g.indices.length < 2) return;
      if (!separateInvoices[slCode]) return; // consolidation not enabled for this group
      if (manifestShipping !== "air") return; // ceiling billing is air-only — sea uses cubic-foot pricing
      const res = calculatePrice(
        Math.ceil(g.sumPeso),
        manifestCountry as any,
        manifestShipping as any,
        "regular",
        false,
      );
      groupTotals.set(
        slCode,
        res.quoteRequired ? 0 : Math.round(res.price * 100) / 100,
      );
    });
    // Distributor pass: find last non-override row per consolidated group so it can
    // receive the exact remainder — guarantees sum(billedPrices) === groupTotal exactly.
    const groupLastIdx = new Map<string, number>();
    resultData.rows.forEach((row, idx) => {
      const tracking = String(row.tracking || '').toUpperCase();
      if (priceOverrides[tracking]?.precio != null || row.permisos) return;
      const effSl =
        slCodeOverrides[idx]?.slCode ??
        matchOverrides[idx]?.slCode ??
        row.slCode ??
        "";
      if (groupTotals.has(effSl)) groupLastIdx.set(effSl, idx);
    });
    const groupRunning = new Map<string, number>();
    return resultData.rows.map((row, idx) => {
      const tracking = String(row.tracking || '').toUpperCase();
      if (priceOverrides[tracking]?.precio != null)
        return priceOverrides[tracking]!.precio;
      if (!row.permisos) {
        const effSl =
          slCodeOverrides[idx]?.slCode ??
          matchOverrides[idx]?.slCode ??
          row.slCode ??
          "";
        const gTotal = groupTotals.get(effSl);
        const g = groups.get(effSl);
        if (gTotal != null && g && g.sumPeso > 0) {
          if (idx === groupLastIdx.get(effSl)) {
            // Last row: exact remainder so sum === groupTotal with no drift
            return (
              Math.round((gTotal - (groupRunning.get(effSl) ?? 0)) * 100) / 100
            );
          }
          const share =
            Math.round(gTotal * ((row.peso ?? 0) / g.sumPeso) * 100) / 100;
          groupRunning.set(effSl, (groupRunning.get(effSl) ?? 0) + share);
          return share;
        }
      }
      let fallbackPrice = computedPrices[idx] ?? 0;
      if (fallbackPrice === 0 && (row.peso ?? 0) > 0) {
        const res = calculatePrice(row.peso ?? 0, manifestCountry as any, manifestShipping as any, 'regular', row.permisos);
        fallbackPrice = res.quoteRequired ? 0 : Math.round(res.price * 100) / 100;
      }
      return fallbackPrice;
    });
  }, [
    resultData.rows,
    priceOverrides,
    computedPrices,
    slCodeOverrides,
    matchOverrides,
    unlinkedRows,
    separateInvoices,
    manifestCountry,
    manifestShipping,
  ]);

  // PERF-2: derive total from index set directly — avoids O(n²) indexOf per row
  const activeTotal = useMemo(() => {
    const targetIdxs =
      selectedRows.size > 0
        ? [...selectedRows]
        : filteredIdxs;
    return targetIdxs.reduce((s, i) => s + (billedPrices[i] ?? 0), 0);
  }, [selectedRows, filteredIdxs, billedPrices]);

  const fullManifestTotalUSD = useMemo(() => {
    return billedPrices.reduce((s, p) => s + (p ?? 0), 0);
  }, [billedPrices]);

  const totalCostUSD = useMemo(() => {
    const idxs =
      selectedRows.size > 0
        ? filteredIdxs.filter((i) => selectedRows.has(i))
        : filteredIdxs;
    return idxs.reduce((s, i) => s + (billedPrices[i] ?? 0), 0);
  }, [selectedRows, filteredIdxs, billedPrices]);

  const stats = useMemo(() => {
    const idxs =
      selectedRows.size > 0
        ? filteredIdxs.filter((i) => selectedRows.has(i))
        : filteredIdxs;
    const clients = new Set<string>();
    const consolidating = new Set<string>();
    let totalPeso = 0;
    idxs.forEach((i) => {
      const row = resultData.rows[i];
      totalPeso += pesoOverrides[i] ?? row.peso ?? 0;
      if (unlinkedRows.has(i)) return;
      const sl =
        slCodeOverrides[i]?.slCode ??
        matchOverrides[i]?.slCode ??
        (row.slCode || "");
      if (!sl) return;
      clients.add(sl);
      if (row.consolidacion) consolidating.add(sl);
    });
    return {
      totalPeso,
      clientCount: clients.size,
      consolidatingCount: consolidating.size,
    };
  }, [selectedRows, filteredIdxs, resultData.rows, pesoOverrides, unlinkedRows, slCodeOverrides, matchOverrides]);

  const totalManifestClientsCount = useMemo(() => {
    const clients = new Set<string>();
    resultData.rows.forEach((row, i) => {
      if (unlinkedRows.has(i)) return;
      const sl =
        slCodeOverrides[i]?.slCode ??
        matchOverrides[i]?.slCode ??
        (row.slCode || "");
      if (sl) clients.add(sl);
    });
    return clients.size;
  }, [resultData.rows, unlinkedRows, slCodeOverrides, matchOverrides]);

  // ── Resolved rows hook ─────────────────────────────────────────────────────
  const { buildResolvedRows, saveLearnedRoutes } = useNovaResolvedRows({
    resultDataRows: resultData.rows,
    unlinkedRows,
    slCodeOverrides,
    matchOverrides,
    rutaOverrides,
    nameOverrides,
    priceOverrides,
    pesoOverrides,
    computedPrices,
    separateInvoices,
    manifestCountry,
    manifestShipping,
    customerContactMap,
    priceAdjustments,
    loadedFromFirestore: resultData.loadedFromFirestore,
    preAlertsMap,
  });

  const resolvedRows = useMemo(
    () => buildResolvedRows(resultData.rows),
    [buildResolvedRows, resultData.rows],
  );

  // ── Auto-save (debounced) ──────────────────────────────────────────────────
  // Persists every override to `manifests/{manifestNumber}` after 1.5s of
  // inactivity. ONLY writes the manifest doc (lightweight) — packages and
  // invoices stay untouched until the explicit "Actualizar BD" button.
  // CRITICAL RULE (2026-07-28): Manifests loaded from Firestore (dataOriginPolicy.origin === "firestore")
  // MUST NEVER auto-save automatically on open or re-open. Auto-save is strictly for
  // new parses after explicit ingestDone.
  const autoSaveEnabled =
    showTable &&
    dataOriginPolicy.origin !== "firestore" &&
    !resultData.loadedFromFirestore &&
    !!ingestDone &&
    !isAutoSavePaused;
  const autoSaveBuildRows = useCallback(
    () => buildResolvedRows(resultData.rows),
    [buildResolvedRows, resultData.rows],
  );
  const autoSave = useNovaAutoSave({
    manifestNumber: resultData.manifestNumber,
    manifestType: resultData.manifestType as string,
    customerContacts: customerContactMap,
    exchangeRate: tc,
    priceAdjustments,
    priceOverrides,
    buildResolvedRows: autoSaveBuildRows,
    enabled: autoSaveEnabled,
    preAlertsMap,
    dataOriginPolicy,
    // Every override map / set that ends up persisted in the manifest doc:
    changeKey: [
      slCodeOverrides,
      matchOverrides,
      nameOverrides,
      rutaOverrides,
      unlinkedRows,
      priceOverrides,
      pesoOverrides,
      separateInvoices,
      mergedInvoices,
      manifestOverrides,
      deletedIndices,
      priceAdjustments,
    ],
  });

  const handleIngest = useCallback(async (bypassIntegrity = false) => {
    if (!activeRows.length) return;
    setIsAutoSavePaused(false);

    if (dataOriginPolicy.origin !== "firestore" && !bypassIntegrity) {
      const resolvedRows = buildResolvedRows(activeRows);
      const conflicts = checkPreAlertIntegrity(resolvedRows, preAlertsMap, {
        slCodeOverrides,
        matchOverrides,
      });
      if (conflicts.length > 0) {
        setSaveIntegrityConflicts(conflicts);
        setSaveIntegrityPendingAction('ingest');
        setShowSaveIntegrityWarning(true);
        return;
      }
    }

    setIsIngesting(true);
    setIngestDone(null);
    setIngestError(null);
    try {
      const resolvedRows = buildResolvedRows(activeRows);
      saveLearnedRoutes(activeRows, resolvedRows);
      // BUG-PARTIAL-SELECTION 2026-04-28: in selection mode, manifest-summary
      // writers must receive the FULL row set so the manifests/{mn} doc is
      // not truncated to the operator's selection (Firestore array merge
      // replaces the whole array). Mirrors handleIngestAndInvoice below.
      // ── AI GUARD: BUG-FILTER-SAVE (2026-06-08) ───────────────────────────
      // DO NOT revert manifestDocRows to conditional logic. It MUST ALWAYS be
      // the full table (buildResolvedRows(resultData.rows)).
      // Using resolvedRows here would TRUNCATE the manifest document in the
      // database when the user has an active table filter (e.g. filtering by Route).
      const manifestDocRows = buildResolvedRows(resultData.rows).filter((_, idx) => !deletedIndices.has(idx));

      // ── DIAGNOSTIC: snapshot of what's about to be persisted ─────────────
      // BUG-PERSIST-LOST-OVERRIDES 2026-04-29: operators reported saved
      // assignments occasionally vanishing on reload. This log lets us
      // confirm at the moment of save whether the resolved rows actually
      // carry the operator's overrides — discrepancies between the override
      // Maps and the resolved row.slCode are the smoking gun. Cheap (one
      // log line + summary) and survives in production for traceability.
      const persistSummary = {
        manifest: resultData.manifestNumber,
        ingestRows: resolvedRows.length,
        manifestDocRows: manifestDocRows.length,
        unmatched: manifestDocRows.filter((r) => !r.slCode).length,
        unrouted: manifestDocRows.filter((r) => r.slCode && !r.ruta).length,
        overrideMaps: {
          slCodeOverrides: Object.keys(slCodeOverrides).length,
          matchOverrides: Object.keys(matchOverrides).length,
          rutaOverrides: Object.keys(rutaOverrides).length,
          unlinkedRows: unlinkedRows.size,
        },
        sample: manifestDocRows.slice(0, 3).map((r) => ({
          tracking: r.tracking,
          slCode: r.slCode,
          ruta: r.ruta,
          nombre: r.nombre,
          nombreCliente: r.nombreCliente,
        })),
      };
      console.info("[Nova][handleIngest] persisting:", persistSummary);

      // ── SYNC DELETED PACKAGES TO DATABASE ─────────────────────────────────
      // If the operator has deleted rows, we must update those package documents
      // and their associated invoices in Firestore so they don't reappear on reload.
      const deletedTrackings = Array.from(deletedIndices)
        .map(idx => resultData.rows[idx])
        .filter((row): row is NonNullable<typeof row> => Boolean(row && row.tracking));

      if (deletedTrackings.length > 0) {
        const trackingsUpper = deletedTrackings.map(r => r.tracking.toUpperCase().trim());
        const docRef = doc(db, 'manifests', resultData.manifestNumber);
        
        // 1. Guardar trackings en la lista negra del manifiesto
        await updateDoc(docRef, {
          deletedTrackings: arrayUnion(...trackingsUpper),
          updatedAt: serverTimestamp()
        }).catch(err => console.error("Error saving deletedTrackings blacklist:", err));

        // 2. Desvincular paquetes en la colección global
        await deletePackagesByTrackings(
          trackingsUpper,
          resultData.manifestNumber,
          authUser?.email || "operator"
        );

        // 3. Registrar Log de Auditoría
        logAction({
          userId: authUser?.id || "unknown",
          userName: authUser?.fullName || authUser?.email || "Usuario Nova",
          userEmail: authUser?.email || undefined,
          action: 'package_deleted',
          category: 'manifest',
          resource: 'manifests',
          resourceId: resultData.manifestNumber,
          result: 'success',
          metadata: {
            note: `Eliminación y desasociación en lote de paquetes en Nova (Lista Negra).`,
            trackings: trackingsUpper,
          }
        });
      }

      saveLocalBackup(manifestDocRows);
      // Build per-tracking manifest override map from current state
      const rowManifestOverrides: Record<string, string> = {};
      Object.entries(manifestOverrides).forEach(([idxStr, manifest]) => {
        const row = resultData.rows[parseInt(idxStr)];
        if (row?.tracking && manifest)
          rowManifestOverrides[row.tracking.toUpperCase()] = manifest;
      });

      const result = await ingestManifestToPackages(
        selectedRows.size > 0 ? resolvedRows : manifestDocRows,
        resultData.manifestNumber,
        {
          manifestType: resultData.manifestType as string,
          customerContacts: customerContactMap,
          exchangeRate: tc,
          priceAdjustments,
          priceOverrides,
          rowManifestOverrides,
          updatedBy: authUser?.email || "nova",
          preAlertsMap,
          dataOriginPolicy,
          bypassIntegrity,
        },
      );
      await saveManifestRecord(manifestDocRows, resultData.manifestNumber, {
        manifestType: resultData.manifestType as string,
        customerContacts: customerContactMap,
        exchangeRate: tc,
        priceAdjustments,
        priceOverrides,
      });
      saveEncomiendaManifestRows(
        manifestDocRows,
        resultData.manifestNumber,
      ).catch((e) =>
        console.warn("[Nova] saveEncomiendaManifestRows error:", e),
      );

      // ── Explicit save prevails: sync TC to invoices ──────────────────────
      // BUG-AUTOSAVE-TC-DRIFT 2026-04-30: autosave writes whatever TC is
      // in the input to manifest + packages, but NEVER touches invoices
      // (they're billing artefacts). So an operator who corrects a wrong
      // TC and then clicks "Solo guardar datos" would leave invoices
      // with the stale CRC even though the rest of the manifest is now
      // right. The explicit save must prevail — apply the current TC to
      // every non-annulled invoice. Status / statusHistory / items are
      // NEVER modified (data correction, not state transition).
      if (tc > 0) {
        try {
          const invResult = await updateInvoicesExchangeRate(
            resultData.manifestNumber,
            tc,
            {
              changedBy: authUser?.email || "nova",
              reason: "Sync TC on Guardar en BD (handleIngest post-save)",
            },
          );
          if (invResult.invoicesUpdated > 0) {
            console.info(
              `[Nova][handleIngest] synced TC ₡${tc.toLocaleString("es-CR")} to ${invResult.invoicesUpdated} invoice(s)` +
              (invResult.skippedInvoicesAnnulled > 0
                ? ` (${invResult.skippedInvoicesAnnulled} annulled preserved)`
                : ""),
            );
          }
          if (invResult.errors.length > 0) {
            console.warn(
              "[Nova][handleIngest] invoice TC sync errors:",
              invResult.errors,
            );
          }
        } catch (invErr) {
          // Non-blocking — the main save already succeeded, invoice TC
          // sync is a best-effort alignment step.
          console.warn("[Nova][handleIngest] invoice TC sync failed:", invErr);
        }
      }

      const totalProcessed = result.inserted + result.updated;
      const parts: string[] = [];
      if (result.inserted > 0) parts.push(`${result.inserted} ingresados`);
      if (result.updated > 0) parts.push(`${result.updated} actualizados`);
      if (result.errors > 0) parts.push(`${result.errors} errores`);
      setIngestDone(
        parts.join(" · ") || `${totalProcessed} paquetes procesados`,
      );
      logAction({
        userId: authUser?.id || "unknown",
        userName: authUser?.fullName || authUser?.email || "Usuario Nova",
        userEmail: authUser?.email || undefined,
        action: "manifest_processed",
        category: "manifest",
        resource: "manifests",
        resourceId: resultData.manifestNumber,
        result: "success",
        metadata: {
          saveType: "data_only",
          manifestNumber: resultData.manifestNumber,
          insertedCount: result.inserted,
          updatedCount: result.updated,
          errorsCount: result.errors,
          overridesCount: {
            slCodeOverrides: Object.keys(slCodeOverrides).length,
            nameOverrides: Object.keys(nameOverrides).length,
            rutaOverrides: Object.keys(rutaOverrides).length,
            unlinkedRows: unlinkedRows.size,
            priceOverrides: Object.keys(priceOverrides).length,
            pesoOverrides: Object.keys(pesoOverrides).length,
            priceAdjustments: Object.keys(priceAdjustments).length,
          },
          slCodeChanges: Object.entries(slCodeOverrides).map(([idx, override]) => ({
            rowIndex: parseInt(idx),
            tracking: resultData.rows[parseInt(idx)]?.tracking || "",
            originalSlCode: resultData.rows[parseInt(idx)]?.slCode || "",
            newSlCode: override.slCode,
          })),
          unlinkedTrackings: Array.from(unlinkedRows).map(idx => resultData.rows[idx]?.tracking || ""),
        },
      });
      // Invalidate React Query caches to keep underlying tables reactive
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      // Auto-trigger learning sequence in background/silent mode
      runNovaLearningSequence(true).catch(e => console.error("[Nova] Silent auto-learning failed:", e));
    } catch (err) {
      lastFailedOpRef.current = { type: "ingest", sendEmails: false };
      setIngestError(err instanceof Error ? err.message : String(err));
      console.error("[Nova] ingest error:", err);
    } finally {
      setIsIngesting(false);
    }
  }, [
    activeRows,
    buildResolvedRows,
    resultData.manifestNumber,
    resultData.manifestType,
    resultData.rows,
    customerContactMap,
    tc,
    priceAdjustments,
    manifestOverrides,
    selectedRows,
    authUser?.email,
    runNovaLearningSequence,
  ]);

  /**
   * TC-only correction path (4th dialog option).
   *
   * Called when the operator discovers a batch of packages/invoices/manifest
   * was saved with the wrong exchange rate. Runs the isolated TC-update
   * service which:
   *   • Updates `exchangeRate` + recomputed `costCRC` on every package in
   *     the manifest.
   *   • Updates `exchangeRate` + recomputed `amountCRC` / `subtotalCRC` /
   *     `ivaCRC` on every non-annulled invoice. **Status is never touched.**
   *   • Updates `exchangeRate` on the manifest doc.
   *
   * Annulled / cancelled / void invoices are preserved verbatim as
   * historical tombstones. This is intentionally a data-correction, not a
   * state transition — paid stays paid, sent stays sent, with their CRC
   * representation now correct.
   */
  const handleUpdateExchangeRateOnly = useCallback(async () => {
    if (!resultData.manifestNumber || tc <= 0) return;
    setIsAutoSavePaused(false);
    setIsIngesting(true);
    setIngestError(null);
    setIngestDone(null);
    try {
      const result = await updateManifestExchangeRate(
        resultData.manifestNumber,
        tc,
        {
          changedBy: authUser?.email || "nova",
          reason: "TC correction via Nova save dialog",
        },
      );
      if (result.errors.length > 0) {
        console.warn(
          "[Nova][updateExchangeRateOnly] partial errors:",
          result.errors,
        );
      }
      const parts: string[] = [];
      if (result.packagesUpdated > 0)
        parts.push(
          `${result.packagesUpdated} paquete${result.packagesUpdated !== 1 ? "s" : ""}`,
        );
      if (result.invoicesUpdated > 0)
        parts.push(
          `${result.invoicesUpdated} factura${result.invoicesUpdated !== 1 ? "s" : ""}`,
        );
      if (result.manifestUpdated) parts.push("manifiesto");
      setIngestDone(
        parts.length > 0
          ? `TC ₡${tc.toLocaleString("es-CR")} aplicado a ${parts.join(" + ")}${result.skippedInvoicesAnnulled > 0
            ? ` (${result.skippedInvoicesAnnulled} anulada${result.skippedInvoicesAnnulled !== 1 ? "s" : ""} preservada${result.skippedInvoicesAnnulled !== 1 ? "s" : ""})`
            : ""
          }`
          : "Nada que actualizar.",
      );
      toast({
        title: "Tipo de cambio actualizado",
        description: `Estados de facturas preservados. ${parts.join(", ") || "Sin cambios."}`,
      });
      // Invalidate React Query caches to keep underlying tables reactive
      queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIngestError(msg);
      console.error("[Nova] updateExchangeRateOnly error:", err);
      toast({
        title: "Error actualizando TC",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsIngesting(false);
    }
  }, [resultData.manifestNumber, tc, authUser?.email, toast]);

  const handleIngestAndInvoice = useCallback(
    async (sendEmails: boolean, options: { protectedActions?: Record<string, 'items_only' | 'overwrite' | 'skip'>; annulFirst?: boolean } = {}, bypassIntegrity = false) => {
      if (!activeRows.length) return;
      setIsAutoSavePaused(false);

      if (dataOriginPolicy.origin !== "firestore" && !bypassIntegrity) {
        const resolvedRows = buildResolvedRows(activeRows);
        const conflicts = checkPreAlertIntegrity(resolvedRows, preAlertsMap, {
          slCodeOverrides,
          matchOverrides,
        });
        if (conflicts.length > 0) {
          setSaveIntegrityConflicts(conflicts);
          setSaveIntegrityPendingAction('ingest_and_invoice');
          setSaveIntegrityPendingSendEmails(sendEmails);
          setSaveIntegrityPendingOptions(options);
          setShowSaveIntegrityWarning(true);
          return;
        }
      }

      setIsInvoicing(true);
      setIsIngesting(true);
      setInvoiceStatus(null);
      setIngestDone(null);
      setIngestError(null);
      try {
        // All overrides baked in — resolvedRows is the single source of truth
        const resolvedRows = buildResolvedRows(activeRows);
        saveLearnedRoutes(activeRows, resolvedRows);

        // ── ANNUL-FIRST PHASE — explicit "Anular y re-crear" flow ──────────
        // When the dialog operator clicks "Anular y re-crear", every sent /
        // overdue / pending invoice that references any of the rows being
        // ingested gets marked status='annulled'. Audit fields (annulledAt,
        // annulledBy='nova', annulledReason) are stamped + statusHistory is
        // appended via arrayUnion so the tombstone is fully traceable. After
        // this phase, the smart-diff (step 2b below) sees only drafts +
        // annulled (excluded) docs for these slCodes — the new invoice is
        // created freely, no AI GUARD trip. Paid invoices are NEVER annulled
        // and the operator has been told they need manual handling.
        // Track every invoiceId we annul during this run so the smart-diff
        // below can exclude them from `existingGroupFP` even if the
        // `subscribeInvoicesByManifest` onSnapshot hasn't fired yet (the
        // local `persistedInvoices` state is captured by closure at the
        // start of this callback). Without the exclusion the diff would
        // still see the just-annulled invoice as a protected sent-status
        // doc and trip the AI GUARD, leaving the new invoice uncreated.
        const annulledIdsThisRun = new Set<string>();

        // Collect trackings for invoices that the admin explicitly requested to overwrite/reset
        const trackingsToAnnul: string[] = [];
        if (options.protectedActions) {
          const overwriteSlCodes = new Set(
            Object.entries(options.protectedActions)
              .filter(([, action]) => action === 'overwrite')
              .map(([sl]) => sl.toUpperCase())
          );
          if (overwriteSlCodes.size > 0) {
            resolvedRows.forEach(r => {
              const sl = (r.slCode || '').toUpperCase();
              if (sl && overwriteSlCodes.has(sl) && r.tracking) {
                trackingsToAnnul.push(r.tracking);
              }
            });
          }
        } else if (options.annulFirst) {
          // Legacy/fallback full annul
          resolvedRows.forEach(r => {
            if (r.tracking) {
              trackingsToAnnul.push(r.tracking);
            }
          });
        }

        if (trackingsToAnnul.length > 0) {
          const annulRes = await annulInvoicesByTrackingsAndManifest(
            trackingsToAnnul,
            resultData.manifestNumber,
            {
              annulledBy: authUser?.email || "nova",
              reason: "Anulada antes de re-crear desde Nova (Actualizar BD - Sobrescribir)",
            },
          );
          annulRes.annulledIds.forEach((id) => annulledIdsThisRun.add(id));
          if (annulRes.annulledIds.length > 0) {
            console.info(
              `[Nova] anuladas ${annulRes.annulledIds.length} factura(s) protegidas antes de re-crear`,
            );
          }
          if (annulRes.skippedPaid > 0) {
            console.warn(
              `[Nova] ${annulRes.skippedPaid} factura(s) Pagada(s) NO se anularon — anula manualmente desde /invoices`,
            );
          }
        } else {
          // ── MOVED-TRACKING AUTO-ANNUL (BUG-DRIFT-PERSISTS 2026-04-29) ──────
          // Even when the operator picks plain "Re-crear facturas" (no
          // annulFirst), the smart-diff below would silently leave behind
          // an invoice whose tracking has been REASSIGNED to a different
          // customer in this session — the AI GUARD skips it because it's
          // protected, but its slCode no longer matches the manifest, so
          // the audit reports drift on every reload (BUG-DRIFT-PERSISTS).
          //
          // We surgically annul ONLY the invoices whose tracking has moved
          // (i.e. the existing invoice's slCode disagrees with the
          // resolved-row slCode for the same tracking). Stable invoices
          // are untouched so the AI GUARD semantic is preserved.
          const trackingToResolvedSl = new Map<string, string>();
          for (const r of resolvedRows) {
            const t = (r.tracking ?? "").toUpperCase();
            if (!t) continue;
            trackingToResolvedSl.set(t, (r.slCode || "").toUpperCase());
          }
          const movedTrackings: string[] = [];
          for (const inv of persistedInvoices) {
            const invSl = String(
              inv.clientSlCode || inv.slCode || ""
            ).toUpperCase();
            if (!invSl || invSl === "BB" || invSl === "M" || invSl === "SR")
              continue;
            const status = String(inv.status || "").toLowerCase();
            if (
              status === "annulled" ||
              status === "cancelled" ||
              status === "void"
            )
              continue;
            const single = (inv.trackingNumber ?? "") as string;
            const multi = Array.isArray(inv.trackingNumbers)
              ? (inv.trackingNumbers as string[])
              : [];
            const trackings = [...(single ? [single] : []), ...multi]
              .map((t) => (t || "").toUpperCase())
              .filter(Boolean);
            for (const t of trackings) {
              const resolvedSl = trackingToResolvedSl.get(t);
              if (resolvedSl !== undefined && resolvedSl !== invSl) {
                movedTrackings.push(t);
              }
            }
          }
          if (movedTrackings.length > 0) {
            const annulRes = await annulInvoicesByTrackingsAndManifest(
              movedTrackings,
              resultData.manifestNumber,
              {
                annulledBy: authUser?.email || "nova",
                reason:
                  "Anulada por reasignación de cliente — tracking movido a otro slCode",
              },
            );
            annulRes.annulledIds.forEach((id) => annulledIdsThisRun.add(id));
            if (annulRes.annulledIds.length > 0) {
              console.info(
                `[Nova] anuladas ${annulRes.annulledIds.length} factura(s) por tracking reasignado`,
              );
            }
            if (annulRes.skippedPaid > 0) {
              console.warn(
                `[Nova] ${annulRes.skippedPaid} factura(s) Pagada(s) con tracking movido NO se anularon — revisa manualmente desde /invoices`,
              );
            }
          }
        }

        // ── Manifest-summary rows (BUG-PARTIAL-SELECTION 2026-04-28) ─────────
        // saveManifestRecord, saveLocalBackup and saveEncomiendaManifestRows
        // each REPLACE arrays inside the manifests/{mn} doc on every write
        // (Firestore `merge: true` does not merge arrays element-wise — the
        // whole array is overwritten). In selection mode `resolvedRows` is the
        // selected subset only, so passing it to those summary writers would
        // truncate the manifest doc to the operator's current selection and
        // erase the unselected packages from the manifests collection. The
        // manifest record must always reflect the FULL state of the table —
        // operator intent for the selected subset is captured downstream by
        // the per-tracking ingest + invoice protection logic below.
        // ── AI GUARD: BUG-FILTER-SAVE (2026-06-08) ───────────────────────────
        // DO NOT revert manifestDocRows to conditional logic. It MUST ALWAYS be
        // the full table (buildResolvedRows(resultData.rows)).
        // Using resolvedRows here would TRUNCATE the manifest document in the
        // database when the user has an active table filter (e.g. filtering by Route).
        const manifestDocRows = buildResolvedRows(resultData.rows).filter((_, idx) => !deletedIndices.has(idx));

        // ── SYNC DELETED PACKAGES TO DATABASE ─────────────────────────────────
        // If the operator has deleted rows, we must update those package documents
        // and their associated invoices in Firestore so they don't reappear on reload.
        const deletedTrackings = Array.from(deletedIndices)
          .map(idx => resultData.rows[idx])
          .filter((row): row is NonNullable<typeof row> => Boolean(row && row.tracking));

        if (deletedTrackings.length > 0) {
          const trackingsUpper = deletedTrackings.map(r => r.tracking.toUpperCase().trim());
          const docRef = doc(db, 'manifests', resultData.manifestNumber);
          
          // 1. Guardar trackings en la lista negra del manifiesto
          await updateDoc(docRef, {
            deletedTrackings: arrayUnion(...trackingsUpper),
            updatedAt: serverTimestamp()
          }).catch(err => console.error("Error saving deletedTrackings blacklist:", err));

          // 2. Desvincular paquetes en la colección global
          await deletePackagesByTrackings(
            trackingsUpper,
            resultData.manifestNumber,
            authUser?.email || "operator"
          );

          // 3. Registrar Log de Auditoría
          logAction({
            userId: authUser?.id || "unknown",
            userName: authUser?.fullName || authUser?.email || "Usuario Nova",
            userEmail: authUser?.email || undefined,
            action: 'package_deleted',
            category: 'manifest',
            resource: 'manifests',
            resourceId: resultData.manifestNumber,
            result: 'success',
            metadata: {
              note: `Eliminación y desasociación en lote de paquetes en Nova (Lista Negra).`,
              trackings: trackingsUpper,
            }
          });
        }

        saveLocalBackup(manifestDocRows);
        // ── Build per-tracking manifest override map ─────────────────────────
        // Allows individual rows to target a different manifest ("Cambiar manifiesto" action).
        const rowManifestOverrides: Record<string, string> = {};
        Object.entries(manifestOverrides).forEach(([idxStr, manifest]) => {
          const row = resultData.rows[parseInt(idxStr)];
          if (row?.tracking && manifest)
            rowManifestOverrides[row.tracking.toUpperCase()] = manifest;
        });

        const ingestResult = await ingestManifestToPackages(
          selectedRows.size > 0 ? resolvedRows : manifestDocRows,
          resultData.manifestNumber,
          {
            manifestType: resultData.manifestType as string,
            customerContacts: customerContactMap,
            exchangeRate: tc,
            priceAdjustments,
            priceOverrides,
            rowManifestOverrides,
            updatedBy: authUser?.email || "nova",
            preAlertsMap,
            dataOriginPolicy,
            bypassIntegrity,
          },
        );
        const totalProcessed = ingestResult.inserted + ingestResult.updated;
        const parts: string[] = [];
        if (ingestResult.inserted > 0)
          parts.push(`${ingestResult.inserted} ingresados`);
        if (ingestResult.updated > 0)
          parts.push(`${ingestResult.updated} actualizados`);
        if (ingestResult.errors > 0)
          parts.push(`${ingestResult.errors} errores`);
        setIngestDone(
          parts.join(" · ") || `${totalProcessed} paquetes procesados`,
        );

        // 1b — Save manifest record for traceability + manifest filter pre-loading
        //      Uses manifestDocRows (full set) so the manifests/{mn} doc never gets
        //      truncated by a partial selection.
        await saveManifestRecord(manifestDocRows, resultData.manifestNumber, {
          manifestType: resultData.manifestType as string,
          customerContacts: customerContactMap,
          exchangeRate: tc,
          priceAdjustments,
          priceOverrides,
        });
        // 1c — Persist encomienda rows to manifest_encomiendas collection (fire-and-forget errors)
        //      Also uses manifestDocRows — encomiendas are scoped to the manifest, not to
        //      the operator's selection.
        saveEncomiendaManifestRows(
          manifestDocRows,
          resultData.manifestNumber,
        ).catch((e) =>
          console.warn("[Nova] saveEncomiendaManifestRows error:", e),
        );

        // 2 — Smart invoice diff: only delete/recreate groups that actually changed.
        // Unchanged groups (same tracking set + same USD total) keep their existing draft invoices,
        // preserving invoice numbers, dates, and any manual edits on those drafts.
        setCreatedInvoices([]);

        // 2a — Fingerprint each primary (non-reassigned) group in resolved state.
        //      Key: slCode.toUpperCase() for matched rows; '__unmatched__${nombre}' for unlinked rows.
        //      totalAmount includes tercero amounts so toggling Servicio de Terceros is detected.
        const resolvedGroupFP = new Map<
          string,
          { trackings: Set<string>; total: number }
        >();
        for (const row of resolvedRows) {
          const t = (row.tracking ?? "").toUpperCase();
          if (!t || rowManifestOverrides[t]) continue;
          const key = row.slCode
            ? row.slCode.toUpperCase()
            : `__unmatched__${row.nombre}`;
          const fp = resolvedGroupFP.get(key) ?? {
            trackings: new Set<string>(),
            total: 0,
          };
          fp.trackings.add(t);
          fp.total += row.precio;
          resolvedGroupFP.set(key, fp);
        }
        for (const [slKey, tercero] of terceroRows) {
          if ((tercero.amount ?? 0) <= 0) continue;
          const fp = resolvedGroupFP.get(slKey.toUpperCase());
          if (fp) fp.total += tercero.amount;
        }

        // 2b — Fingerprint existing Firestore invoices for this manifest.
        //      Annulled / cancelled / void docs are tombstones — they MUST be
        //      excluded from the fingerprint so the smart-diff treats their
        //      slCode as "no existing invoice" and proceeds to create a fresh
        //      one (mirrors RECREATE_PROTECTED_STATUSES + the AI GUARD update).
        //      `hasProtected` only flips on for sent/paid/overdue/pending.
        const existingGroupFP = new Map<
          string,
          { trackings: Set<string>; total: number; hasProtected: boolean }
        >();
        for (const inv of persistedInvoices) {
          // Skip invoices we just annulled this run — the local
          // `persistedInvoices` snapshot is stale until the onSnapshot
          // tick lands. Without this guard the smart-diff would still see
          // the annulled doc as protected and trip the AI GUARD.
          const invId = (inv.id ?? "") as string;
          if (invId && annulledIdsThisRun.has(invId)) continue;
          const rawCode = String(inv.clientSlCode || inv.slCode || "");
          if (!rawCode) continue;
          const slCode = rawCode.toUpperCase();
          if (slCode === "BB" || slCode === "M" || slCode === "SR") continue; // route-only placeholders always recreated
          const status = (
            (inv.status as string | undefined) || ""
          ).toLowerCase();
          // Annulled / cancelled / void: skip entirely — invisible to smart-diff.
          if (
            status === "annulled" ||
            status === "cancelled" ||
            status === "void"
          )
            continue;
          const isProtected = RECREATE_PROTECTED_STATUSES.has(status);
          const fp = existingGroupFP.get(slCode) ?? {
            trackings: new Set<string>(),
            total: 0,
            hasProtected: false,
          };
          const single = (inv.trackingNumber ?? "") as string;
          const multi = Array.isArray(inv.trackingNumbers)
            ? (inv.trackingNumbers as string[])
            : [];
          [...(single ? [single] : []), ...multi].forEach((t) => {
            if (t) fp.trackings.add(t.toUpperCase());
          });
          fp.total += (inv.totalAmount ?? 0) as number;
          if (isProtected) fp.hasProtected = true;
          existingGroupFP.set(slCode, fp);
        }

        // 2b' — Protect partial-group selections (BUG-PARTIAL-SELECTION 2026-04-28).
        //       In selection mode (selectedRows.size > 0), the operator chose to
        //       save only a subset of rows. Any existing invoice whose tracking
        //       set extends BEYOND that subset contains rows the operator did
        //       NOT touch this session. Without this guard, the size mismatch
        //       between resolvedGroupFP (selected only) and existingGroupFP
        //       (all rows of the existing invoice) would mark the group as
        //       "changed" → deleteInvoicesForTrackings would silently destroy
        //       the existing invoice, dropping the unselected rows.
        //       Protected groups are skipped in step 2c (no diff) and in step 3
        //       (no recreate). Their existing invoices stay intact.
        const isSelectionMode = selectedRows.size > 0;
        const selectedTrackings = isSelectionMode
          ? new Set(
            resolvedRows
              .map((r) => (r.tracking ?? "").toUpperCase())
              .filter(Boolean),
          )
          : null;
        const { protectedKeys: protectedGroupKeys, preservedTrackings } =
          computeProtectedGroupKeys(existingGroupFP, selectedTrackings);
        if (protectedGroupKeys.size > 0) {
          console.info(
            `[Nova] partial save: protected ${protectedGroupKeys.size} group(s), ` +
            `preserved ${preservedTrackings} tracking(s) from existing invoices`,
          );
        }

        // 2c — Determine changed groups (need delete + recreate).
        //      Unmatched groups (__unmatched__*) are always processed — no stable key to diff against.
        //      Protected groups (partial-selection guard) are NEVER changed — their existing invoices
        //      stay intact so unselected rows are preserved.
        const changedGroupKeys = new Set<string>();
        for (const [key, newFP] of resolvedGroupFP) {
          if (protectedGroupKeys.has(key)) continue; // selection-mode partial-overlap guard
          if (key.startsWith("__unmatched__")) {
            changedGroupKeys.add(key);
            continue;
          }
          const existing = existingGroupFP.get(key);
          if (!existing) {
            changedGroupKeys.add(key);
            continue;
          } // new group — needs invoice
          if (existing.hasProtected) {
            const action = options.protectedActions?.[key] || 'skip';
            if (action === 'skip') continue;
            // items_only and overwrite need recreation/update!
            changedGroupKeys.add(key);
            continue;
          }
          const sameT =
            newFP.trackings.size === existing.trackings.size &&
            [...newFP.trackings].every((t) => existing.trackings.has(t));
          const sameA = Math.abs(newFP.total - existing.total) < 0.01;
          if (!sameT || !sameA) changedGroupKeys.add(key);
        }

        // 2d — Clean up orphan draft invoices for customers who no longer have any packages in the manifest.
        //      Drafts for active customers are merged/replaced atomically inside createInvoicesFromRows.
        // ── AI GUARD: BUG-FILTER-SAVE (2026-06-08) ───────────────────────────
        // DO NOT use resolvedRows for activeSlCodes. You MUST use manifestDocRows.
        // If the table is filtered (e.g. by Route), resolvedRows omits hidden packages.
        // Cleaning up based on resolvedRows would cause the system to DELETE all
        // draft invoices for the hidden packages, leading to massive data loss.
        const activeSlCodes = new Set(
          manifestDocRows.map((r) => (r.slCode || "").toUpperCase()).filter(Boolean)
        );
        try {
          const invoicesRef = collection(db, 'invoices');
          const existSnap = await getDocs(query(
            invoicesRef,
            where('manifestNumber', '==', resultData.manifestNumber),
            where('status', '==', 'draft')
          ));
          const toDelete = existSnap.docs.filter(d => {
            const sl = String(d.data().clientSlCode || d.data().slCode || '').toUpperCase();
            return sl && !activeSlCodes.has(sl);
          });
          await Promise.all(toDelete.map(async (d) => {
            await deleteDoc(d.ref);
            try {
              await deleteInvoiceFromSp2(d.id, d.data().invoiceNumber || d.id);
            } catch (err) {
              console.warn(`[Nova] Failed to delete orphan draft invoice ${d.id} from SP2:`, err);
            }
          }));
        } catch (err) {
          console.warn('[Nova] Failed to clean up orphan drafts:', err);
        }

        // Annul old active invoices in the source manifest for trackings moved to another manifest
        const movedToOtherManifestTrackings = Object.keys(rowManifestOverrides);
        if (movedToOtherManifestTrackings.length > 0) {
          await annulInvoicesByTrackingsAndManifest(
            movedToOtherManifestTrackings,
            resultData.manifestNumber,
            {
              annulledBy: authUser?.email || "nova",
              reason: "Anulada por reasignación de manifiesto — tracking movido a otro manifiesto",
            }
          );
        }

        // 3 — Create invoices from fully-resolved rows (overrides already baked in)
        const enhancedRows = resolvedRows.map((row) => ({
          ...row,
          // BUG-I4 fix: use resolved slCode (post-override) as the groupKey, not original
          _groupKey: row.slCode || `__unmatched__${row.nombre}`,
        }));

        // Compute which slCodes are in "Factura única" mode (mergedInvoices ON, separateInvoices OFF)
        const mergedSlCodes = new Set<string>(
          enhancedRows
            .filter(
              (r) =>
                mergedInvoices[(r as any)._groupKey] &&
                !separateInvoices[(r as any)._groupKey],
            )
            .map((r) => r.slCode)
            .filter((s): s is string => !!s),
        );

        // ── Invoice creation: primary manifest rows (changed groups only) + all reassigned rows
        const rowsByManifest = new Map<string, typeof enhancedRows>();
        enhancedRows.forEach((row) => {
          const t = (row.tracking ?? "").toUpperCase();
          const targetMn = rowManifestOverrides[t];
          const mn = targetMn || resultData.manifestNumber;
          // Primary manifest: skip rows whose group is unchanged (invoices preserved above)
          if (!targetMn) {
            const ck = row.slCode
              ? row.slCode.toUpperCase()
              : `__unmatched__${row.nombre}`;
            if (!changedGroupKeys.has(ck)) return;
          }
          const list = rowsByManifest.get(mn) ?? [];
          list.push(row);
          rowsByManifest.set(mn, list);
        });

        const allCreated: InvoiceRecord[] = [];
        const allErrors: Array<{ slCode: string; error: string }> = [];

        for (const [mn, mnRows] of rowsByManifest) {
          // terceroRows are scoped to the primary manifest — do not carry them over to target manifests
          const terceroItemsMap =
            mn === resultData.manifestNumber
              ? new Map(
                [...terceroRows.entries()]
                  .filter(([, v]) => v.amount > 0)
                  .map(([k, v]) => [
                    k,
                    {
                      amount: v.amount,
                      description: v.description || "Servicio de Terceros",
                    },
                  ]),
              )
              : new Map<string, { amount: number; description: string }>();
          const isTargetManifest = mn !== resultData.manifestNumber;
          const invoiceOpts = {
            ivaEnabled,
            exchangeRate: tc,
            manifestNumber: mn,
            mergedSlCodes,
            terceroItems: terceroItemsMap,
            // Merge existing drafts ONLY when appending reassigned rows to a DIFFERENT target manifest.
            // For the primary manifest currently open in Nova, the rows in Nova are the authoritative truth.
            mergeExistingDrafts: isTargetManifest,
            protectedActions: options.protectedActions,
          };

          // Split rows within this manifest group: separateInvoices / merged / individual
          const consolidatedRows = mnRows.filter(
            (r) => separateInvoices[(r as any)._groupKey],
          );
          const individualRows = mnRows.filter((r) => {
            const gk = (r as any)._groupKey;
            return !separateInvoices[gk] && !mergedInvoices[gk];
          });
          const mergedRows = mnRows.filter(
            (r) =>
              mergedInvoices[(r as any)._groupKey] &&
              !separateInvoices[(r as any)._groupKey],
          );

          // Consolidated invoices: force consolidacion=true (BUG-I2)
          if (consolidatedRows.length > 0) {
            const rowsWithConsolidation = consolidatedRows.map((r) => ({
              ...r,
              consolidacion: true,
            }));
            const res = await createInvoicesFromRows(
              rowsWithConsolidation,
              invoiceOpts,
            );
            allCreated.push(...res.created);
            allErrors.push(...res.errors);
          }
          // Merged single invoices ("Factura única"): one invoice per slCode group
          if (mergedRows.length > 0) {
            const res = await createInvoicesFromRows(mergedRows, invoiceOpts);
            allCreated.push(...res.created);
            allErrors.push(...res.errors);
          }
          // Individual invoices
          // For target manifests, group by slCode so all rows for the same customer are
          // handled in a single createInvoicesFromRows call — avoids the fragile cascade-
          // merge waterfall (one call per row) that breaks due to Firestore index propagation
          // delays when merging reassigned rows into an existing draft invoice.
          if (isTargetManifest) {
            const bySlCode = new Map<string, typeof individualRows>();
            individualRows.forEach((r) => {
              const key = (r as any)._groupKey as string;
              const list = bySlCode.get(key) ?? [];
              list.push(r);
              bySlCode.set(key, list);
            });
            for (const rows of bySlCode.values()) {
              const res = await createInvoicesFromRows(rows, invoiceOpts);
              allCreated.push(...res.created);
              allErrors.push(...res.errors);
            }
          } else {
            for (const row of individualRows) {
              const res = await createInvoicesFromRows([row], invoiceOpts);
              allCreated.push(...res.created);
              allErrors.push(...res.errors);
            }
          }
        }

        // BUG-I3: count rows silently skipped due to empty slCode
        const skippedCount = resolvedRows.filter((r) => !r.slCode).length;

        const created = allCreated;
        const errors = allErrors;
        setCreatedInvoices(created); // subscription auto-refreshes persistedInvoices

        if (errors.length > 0) {
          console.warn("[Nova] Invoice errors:", errors);
        }

        const skippedSuffix =
          skippedCount > 0 ? ` · ${skippedCount} sin factura (sin código)` : "";

        // ── Explicit save prevails: sync TC to invoices ──────────────────────
        // Freshly-created invoices already have the correct TC (buildInvoiceData
        // stamps it). But protected invoices (sent/overdue/pending) that the
        // AI GUARD skipped, plus unchanged drafts the smart-diff left alone,
        // may still carry a stale TC from the original save. Normalizing here
        // ensures every non-annulled invoice in this manifest reflects the
        // operator's current TC. Idempotent — no-op for invoices already at
        // the new TC. Annulled invoices are preserved verbatim.
        if (tc > 0) {
          try {
            const invResult = await updateInvoicesExchangeRate(
              resultData.manifestNumber,
              tc,
              {
                changedBy: authUser?.email || "nova",
                reason:
                  "Sync TC on Re-crear facturas (handleIngestAndInvoice post-save)",
              },
            );
            if (invResult.invoicesUpdated > 0) {
              console.info(
                `[Nova][handleIngestAndInvoice] synced TC ₡${tc.toLocaleString("es-CR")} to ${invResult.invoicesUpdated} invoice(s)` +
                (invResult.skippedInvoicesAnnulled > 0
                  ? ` (${invResult.skippedInvoicesAnnulled} annulled preserved)`
                  : ""),
              );
            }
            if (invResult.errors.length > 0) {
              console.warn(
                "[Nova][handleIngestAndInvoice] invoice TC sync errors:",
                invResult.errors,
              );
            }
          } catch (invErr) {
            console.warn(
              "[Nova][handleIngestAndInvoice] invoice TC sync failed:",
              invErr,
            );
          }
        }

        // 4 — Optionally send emails
        if (sendEmails && created.length > 0) {
          const emailResult = await sendInvoiceEmails(created);
          setInvoiceStatus(
            `${created.length} factura${created.length !== 1 ? "s" : ""} creada${created.length !== 1 ? "s" : ""}` +
            ` · ${emailResult.sent} correo${emailResult.sent !== 1 ? "s" : ""} enviado${emailResult.sent !== 1 ? "s" : ""}` +
            skippedSuffix,
          );
        } else {
          setInvoiceStatus(
            `${created.length} factura${created.length !== 1 ? "s" : ""} creada${created.length !== 1 ? "s" : ""}` +
            (errors.length > 0 ? ` · ${errors.length} errores` : "") +
            skippedSuffix,
          );
        }
        logAction({
          userId: authUser?.id || "unknown",
          userName: authUser?.fullName || authUser?.email || "Usuario Nova",
          userEmail: authUser?.email || undefined,
          action: "manifest_processed",
          category: "manifest",
          resource: "manifests",
          resourceId: resultData.manifestNumber,
          result: "success",
          metadata: {
            saveType: "ingest_and_invoice",
            manifestNumber: resultData.manifestNumber,
            createdInvoicesCount: created.length,
            errorsCount: errors.length,
            sendEmails,
            overridesCount: {
              slCodeOverrides: Object.keys(slCodeOverrides).length,
              nameOverrides: Object.keys(nameOverrides).length,
              rutaOverrides: Object.keys(rutaOverrides).length,
              unlinkedRows: unlinkedRows.size,
              priceOverrides: Object.keys(priceOverrides).length,
              pesoOverrides: Object.keys(pesoOverrides).length,
              priceAdjustments: Object.keys(priceAdjustments).length,
            },
            slCodeChanges: Object.entries(slCodeOverrides).map(([idx, override]) => ({
              rowIndex: parseInt(idx),
              tracking: resultData.rows[parseInt(idx)]?.tracking || "",
              originalSlCode: resultData.rows[parseInt(idx)]?.slCode || "",
              newSlCode: override.slCode,
            })),
            unlinkedTrackings: Array.from(unlinkedRows).map(idx => resultData.rows[idx]?.tracking || ""),
          },
        });
        // Invalidate React Query caches to keep underlying tables reactive
        queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['packages'] });
        // Auto-trigger learning sequence in background/silent mode
        runNovaLearningSequence(true).catch(e => console.error("[Nova] Silent auto-learning failed:", e));
      } catch (err) {
        lastFailedOpRef.current = { type: "ingestAndInvoice", sendEmails };
        setIngestError(err instanceof Error ? err.message : String(err));
        console.error("[Nova] invoice error:", err);
      } finally {
        setIsInvoicing(false);
        setIsIngesting(false);
      }
    },
    [
      activeRows,
      buildResolvedRows,
      saveLearnedRoutes,
      resultData.manifestNumber,
      resultData.manifestType,
      resultData.rows,
      customerContactMap,
      tc,
      ivaEnabled,
      separateInvoices,
      mergedInvoices,
      priceAdjustments,
      manifestOverrides,
      terceroRows,
      persistedInvoices,
      selectedRows,
      authUser?.email,
      runNovaLearningSequence,
    ],
  );

  // ── Revalidate calculations for a SINGLE group ───────────────────────────────
  const handleRevalidateGroupCalculations = useCallback(
    async (groupKey: string, entries: GroupEntry[]): Promise<void> => {
      if (!entries.length) return;

      const groupRows = entries.map((e) => e.row);
      const groupTrackings = groupRows
        .map((r) => r.tracking)
        .filter((t): t is string => !!t);

      if (!groupTrackings.length) {
        toast({
          title: "Error",
          description: "El grupo seleccionado no contiene trackings válidos.",
          variant: "destructive",
        });
        return;
      }

      // OPTIMISTIC & INSTANT REAL-TIME UI UPDATE:
      // We clear the local React overrides/adjustments first to trigger the clean recalculated
      // pricing and weights instantly in the UI table (within 0ms of clicking), completely
      // preserving any active filters (like search query "rebe") because no components reload.
      setPriceOverrides((prev) => {
        const next = { ...prev };
        groupTrackings.forEach((t) => delete next[t.toUpperCase()]);
        return next;
      });

      setPriceAdjustments((prev) => {
        const next = { ...prev };
        groupTrackings.forEach((t) => delete next[t.toUpperCase()]);
        return next;
      });

      setPesoOverrides((prev) => {
        const next = { ...prev };
        entries.forEach((e) => delete next[e.originalIdx]);
        return next;
      });

      // Synchronously clear the stale fields from liveResultData.rows in memory
      // to completely prevent the calculation engine from falling back to saved row values,
      // which breaks the pricing resurrection loop and lets the auto-save persist clean pricing.
      setLiveResultData((prev) => {
        if (!prev) return prev;
        const nextRows = prev.rows.map((row, idx) => {
          const isGroupRow = entries.some((e) => e.originalIdx === idx);
          if (!isGroupRow) return row;

          const cleanRow = { ...row } as any;
          delete cleanRow.ajustePrecio;
          delete cleanRow.pesoRedondeo;
          delete cleanRow.precio;
          delete cleanRow.cost;
          delete cleanRow.costCRC;
          delete cleanRow.precioSinPermiso;
          delete cleanRow.precioConPermiso;
          delete cleanRow.diferenciaRedondeo;
          delete cleanRow.pesoConsolidacion;

          if (cleanRow.originalData) {
            const cleanOriginal = { ...cleanRow.originalData as any };
            delete cleanOriginal.ajustePrecio;
            delete cleanOriginal.pesoRedondeo;
            delete cleanOriginal.precio;
            delete cleanOriginal.cost;
            delete cleanOriginal.costCRC;
            delete cleanOriginal.precioSinPermiso;
            delete cleanOriginal.precioConPermiso;
            delete cleanOriginal.diferenciaRedondeo;
            delete cleanOriginal.pesoConsolidacion;
            cleanRow.originalData = cleanOriginal;
          }

          return cleanRow;
        });

        return {
          ...prev,
          rows: nextRows,
        };
      });

      // Launch database updates asynchronously in the background without blocking the UI
      Promise.all([
        // Step 1: Annul and delete existing invoices for these trackings to prevent any price/weight drift.
        annulInvoicesByTrackingsAndManifest(
          groupTrackings,
          resultData.manifestNumber,
          {
            annulledBy: authUser?.email || "nova",
            reason: "Revalidación manual de cálculos del grupo (Acciones → Revalidar cálculos)",
          }
        ).then(() => deleteInvoicesForTrackings(groupTrackings, resultData.manifestNumber)),

        // Step 2: Perform batch update in Firestore 'packages' collection to clear all custom pricing/weight override fields.
        (() => {
          const batch = writeBatch(db);
          groupTrackings.forEach((tracking) => {
            const docRef = doc(db, "packages", tracking.toUpperCase());
            batch.update(docRef, {
              ajustePrecio: deleteField(),
              pesoRedondeo: deleteField(),
              price: deleteField(),
              cost: deleteField(),
              costCRC: deleteField(),
              exchangeRate: deleteField(),
              precioSinPermiso: deleteField(),
              precioConPermiso: deleteField(),
              diferenciaRedondeo: deleteField(),
              pesoConsolidacion: deleteField(),
            });
          });
          return batch.commit();
        })()
      ]).then(() => {
        // Invalidate React Query caches to keep underlying tables reactive
        queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['packages'] });

        toast({
          title: "Cálculos Revalidados",
          description: `Se han restablecido y revalidado todos los cálculos del grupo de consolidación de ${entries[0]?.row.nombreCliente || 'cliente'}.`,
        });
      }).catch((err) => {
        console.error("[Nova][revalidate-calculations] background sync failed:", err);
        toast({
          title: "Error de Sincronización",
          description: `Ocurrió un error al guardar los cálculos revalidados en la base de datos. Detalle: ${err instanceof Error ? err.message : String(err)}`,
          variant: "destructive",
        });
      });
    },
    [
      resultData.manifestNumber,
      authUser?.email,
      toast,
      setPriceOverrides,
      setPriceAdjustments,
      setPesoOverrides,
      setLiveResultData,
    ]
  );

  // ── Re-generate invoice for a SINGLE group ───────────────────────────────
  // BUG-INVOICE-PREFIX-STALE 2026-04-29: when an unmatched row gets a temp
  // customer (e.g. ARELIS VALERIO QUESADA → SL-MAN-30811) AFTER an invoice
  // was already created with a route-derived prefix (Encomiendas-…, BB-…,
  // M-…, SR-…), the existing draft sits there with the old prefix even
  // though the row is now linked to a real (temp) slCode. Re-creating the
  // invoice via "Actualizar BD" works but is overkill — it touches every
  // group. This per-group handler scopes the regenerate to ONE group:
  //
  //   1. Find every existing invoice (any status except 'paid') that
  //      contains any of the group's trackings — including invoices whose
  //      slCode no longer matches (Encomiendas-, BB-, M-, SR-, or even a
  //      previous customer slCode after a merge).
  //   2. Annul protected invoices (sent/overdue/pending) and delete drafts.
  //   3. Build resolvedRows for THIS group's row indices.
  //   4. Call createInvoicesFromRows scoped to those rows, with mergedSlCodes
  //      / terceroItems plumbed through so the output matches what the
  //      operator sees in the table.
  //
  // Returns a discriminated outcome so the UI can render precise feedback:
  //   - created  > 0  → success toast
  //   - errors   > 0  → error toast
  //   - skipped  > 0  → informative toast (existing protected invoice, etc.)
  //   - reason: 'no-rows' | 'no-trackings' → explicit no-op cause
  // The legacy silent no-op ("button does nothing") is therefore impossible.
  const handleRegenerateGroupInvoice = useCallback(
    async (
      rowIndices: number[],
      options: { forceAnnulPaid?: boolean } = {},
    ): Promise<{
      created: number;
      annulled: number;
      errors: number;
      skipped: NonNullable<
        Awaited<ReturnType<typeof createInvoicesFromRows>>['skipped']
      >;
      reason?: 'no-rows' | 'no-trackings';
    }> => {
      if (!rowIndices.length) {
        console.warn('[Nova][regenerate-group] no row indices supplied');
        return { created: 0, annulled: 0, errors: 0, skipped: [], reason: 'no-rows' };
      }
      const result: {
        created: number;
        annulled: number;
        errors: number;
        skipped: NonNullable<
          Awaited<ReturnType<typeof createInvoicesFromRows>>['skipped']
        >;
        reason?: 'no-rows' | 'no-trackings';
      } = { created: 0, annulled: 0, errors: 0, skipped: [] };
      try {
        // Step 1+2 — collect trackings, annul + delete existing invoices.
        const groupRows = rowIndices
          .map((i) => resultData.rows[i])
          .filter(Boolean);
        const groupTrackings = groupRows
          .map((r) => r.tracking)
          .filter((t): t is string => !!t);
        if (!groupTrackings.length) {
          console.warn('[Nova][regenerate-group] selected rows have no trackings', {
            rowIndices,
            rows: groupRows.map(r => ({ tracking: r.tracking, slCode: r.slCode })),
          });
          result.reason = 'no-trackings';
          return result;
        }
        const annulRes = await annulInvoicesByTrackingsAndManifest(
          groupTrackings,
          resultData.manifestNumber,
          {
            annulledBy: authUser?.email || "nova",
            reason: options.forceAnnulPaid
              ? "Re-generación forzada de factura pagada por grupo (Acciones → Re-generar factura)"
              : "Re-generación de factura por grupo (Acciones → Re-generar factura)",
            forceAnnulPaid: options.forceAnnulPaid,
          },
        );
        result.annulled = annulRes.annulledIds.length;

        if (options.forceAnnulPaid) {
          logAction({
            userId: authUser?.id || "unknown",
            userName: authUser?.fullName || authUser?.email || "Usuario Nova",
            userEmail: authUser?.email || undefined,
            action: "invoice_regenerated_paid",
            category: "invoice",
            resource: "invoices",
            resourceId: resultData.manifestNumber,
            result: "success",
            metadata: {
              note: `Re-generación forzada de factura pagada por grupo para trackings: ${groupTrackings.join(', ')}`,
              manifestNumber: resultData.manifestNumber,
              trackings: groupTrackings,
            }
          });
        }

        // Step 3 — Extract and resolve rows for the selected group.
        // It retrieves the raw row objects from resultData.rows using the selected indices
        // and resolves their final fields (applying overrides like manually assigned slCodes,
        // modified weights, and custom package pricing) using buildResolvedRows.
        const subset = rowIndices
          .map((i) => resultData.rows[i])
          .filter((r): r is NonNullable<typeof r> => Boolean(r));
        const resolvedSubset = buildResolvedRows(subset);

        // Step 3.5 — Recalculate and persist package states to the database before invoicing.
        // To guarantee zero data drift between packages in Firestore and the newly generated invoice,
        // we first execute a batch upsert to the 'packages' collection using `ingestManifestToPackages`
        // for the resolved subset of packages. This recalculates their final pricing, stamps
        // their exchange rate, and links them to the correct client slCode in the DB.
        const rowManifestOverrides: Record<string, string> = {};
        Object.entries(manifestOverrides).forEach(([idxStr, manifest]) => {
          const row = resultData.rows[parseInt(idxStr)];
          if (row?.tracking && manifest)
            rowManifestOverrides[row.tracking.toUpperCase()] = manifest;
        });
        await ingestManifestToPackages(
          resolvedSubset,
          resultData.manifestNumber,
          {
            manifestType: resultData.manifestType as string,
            customerContacts: customerContactMap,
            exchangeRate: tc,
            priceAdjustments,
            rowManifestOverrides,
            updatedBy: authUser?.email || "nova",
          },
        );

        // Update the manifests/{mn} document in Firestore with the current state of all rows
        // to persist any inline edits, routings, or third-party service associations that have occurred.
        const manifestDocRows = buildResolvedRows(resultData.rows).filter((_, idx) => !deletedIndices.has(idx));
        await saveManifestRecord(manifestDocRows, resultData.manifestNumber, {
          manifestType: resultData.manifestType as string,
          customerContacts: customerContactMap,
          exchangeRate: tc,
        });

        // Step 4 — pull the canonical effective slCode from the first resolved
        // row to drive mergedSlCodes / terceroItems lookups (the group key
        // upstream is normally the same uppercase slCode).
        const effSl = (resolvedSubset[0]?.slCode || "").toUpperCase();
        const groupKey = resolvedSubset[0]?.slCode
          ? resolvedSubset[0].slCode.toUpperCase()
          : `__unmatched__${resolvedSubset[0]?.nombre ?? ""}`;
        const isMerged = !!mergedInvoices[groupKey];
        const mergedSlCodes = isMerged && effSl ? new Set([effSl]) : undefined;

        // Forward terceros for this slCode if any.
        const terceroItems = (() => {
          if (!effSl) return undefined;
          const tr = terceroRows.get(effSl);
          if (!tr || (tr.amount ?? 0) <= 0) return undefined;
          const m = new Map<string, { amount: number; description: string }>();
          m.set(effSl, {
            amount: tr.amount,
            description: tr.description || "Servicio de Terceros",
          });
          return m;
        })();

        const emailMap: Record<string, string> = {};
        customerContactMap.forEach((info, sl) => {
          if (info.email) emailMap[sl] = info.email;
        });

        // Force consolidacion = true on resolved rows when the operator has
        // separateInvoices enabled (mirrors handleIngestAndInvoice's logic so
        // the new invoice picks the consolidated/non-consolidated shape).
        const isConsolidatedGroup = !!separateInvoices[groupKey];
        const inputRows = isConsolidatedGroup
          ? resolvedSubset.map((r) => ({ ...r, consolidacion: true }))
          : resolvedSubset;

        const createRes = await createInvoicesFromRows(inputRows, {
          manifestNumber: resultData.manifestNumber,
          ivaEnabled,
          exchangeRate: tc,
          emailMap,
          mergedSlCodes,
          terceroItems,
          mergeExistingDrafts: true,
        });
        result.created = createRes.created.length;
        result.errors = createRes.errors.length;
        result.skipped = createRes.skipped ?? [];
        if (createRes.created.length > 0) {
          setCreatedInvoices((prev) => [...prev, ...createRes.created]);
        }
        if (createRes.errors.length > 0) {
          console.warn('[Nova][regenerate-group] errors:', createRes.errors);
        }
        if (result.skipped.length > 0) {
          console.info('[Nova][regenerate-group] skipped (protected):', result.skipped);
        }
        console.info('[Nova][regenerate-group] outcome', {
          slCode: effSl,
          manifestNumber: resultData.manifestNumber,
          trackings: groupTrackings.length,
          annulled: result.annulled,
          created: result.created,
          errors: result.errors,
          skipped: result.skipped.length,
        });

        // Invalidate React Query caches to keep underlying tables reactive
        queryClient.invalidateQueries({ queryKey: ['invoices-cursor'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['packages'] });

        return result;
      } catch (e) {
        console.error("[Nova][regenerate-group] failed:", e);
        result.errors++;
        return result;
      }
    },
    [
      resultData.manifestNumber,
      resultData.manifestType,
      resultData.rows,
      buildResolvedRows,
      mergedInvoices,
      separateInvoices,
      terceroRows,
      customerContactMap,
      ivaEnabled,
      tc,
      manifestOverrides,
      priceAdjustments,
      authUser?.email,
    ],
  );

  // ── Download handlers hook ───────────────────────────────────────────────
  const {
    handleDownloadCSV,
    handleDownloadXLSX,
    saveLocalBackup,
    handleDownloadBackupCSV,
  } = useNovaDownloads({
    resultData,
    buildResolvedRows,
    authUser,
  });

  const handleRetry = useCallback(() => {
    const op = lastFailedOpRef.current;
    if (!op) return;
    setIngestError(null);
    if (op.type === "ingest") handleIngest();
    else handleIngestAndInvoice(op.sendEmails);
  }, [handleIngest, handleIngestAndInvoice]);

  /**
   * Reload manifest data from Firestore while preserving operator overrides.
   * Only safe when there are ADDED trackings (new packages moved in). REMOVED
   * trackings would shift array indices and break overrides keyed by rowIndex,
   * so we block reload and tell the operator to close+reopen.
   */
  const handleReloadManifest = useCallback(async (isManual = false) => {
    if (!resultData.manifestNumber || dataOriginPolicy.origin !== "firestore")
      return;

    setIsReloadingManifest(true);
    setReloadError(null);
    try {
      const fresh = await loadManifestFromFirestore(resultData.manifestNumber);
      if (!fresh) {
        throw new Error("No se pudo recargar el manifiesto desde Firestore.");
      }

      const normTracking = (t: string) => (t || "").trim().toUpperCase();
      const oldRows = resultData.rows;

      // 1. Calculate added and removed package counts
      const oldTrackings = new Set(oldRows.map((r) => normTracking(r.tracking)).filter(Boolean));
      const newTrackings = new Set(fresh.rows.map((r) => normTracking(r.tracking)).filter(Boolean));

      let addedCount = 0;
      newTrackings.forEach((t) => {
        if (!oldTrackings.has(t)) addedCount++;
      });

      let removedCount = 0;
      oldTrackings.forEach((t) => {
        if (!newTrackings.has(t)) removedCount++;
      });

      // 2. Map old index -> tracking
      const oldTrackingMap = new Map<number, string>();
      oldRows.forEach((row, i) => {
        const t = normTracking(row.tracking);
        if (t) oldTrackingMap.set(i, t);
      });

      // 3. Map tracking -> new index
      const newTrackingIdxMap = new Map<string, number>();
      fresh.rows.forEach((row, i) => {
        const t = normTracking(row.tracking);
        if (t) newTrackingIdxMap.set(t, i);
      });

      // 4. Remap helper for Record<number, T>
      const remapRecord = <T extends unknown>(prevRecord: Record<number, T>): Record<number, T> => {
        const nextRecord: Record<number, T> = {};
        Object.entries(prevRecord).forEach(([oldIdxStr, val]) => {
          const oldIdx = Number(oldIdxStr);
          const t = oldTrackingMap.get(oldIdx);
          if (t && newTrackingIdxMap.has(t)) {
            const newIdx = newTrackingIdxMap.get(t)!;
            nextRecord[newIdx] = val;
          }
        });
        return nextRecord;
      };

      // 5. Remap helper for Set<number>
      const remapSet = (prevSet: Set<number>): Set<number> => {
        const nextSet = new Set<number>();
        prevSet.forEach((oldIdx) => {
          const t = oldTrackingMap.get(oldIdx);
          if (t && newTrackingIdxMap.has(t)) {
            const newIdx = newTrackingIdxMap.get(t)!;
            nextSet.add(newIdx);
          }
        });
        return nextSet;
      };

      // 6. Apply atomic index-based remapping to prevent loss of local edits
      setPesoOverrides((prev) => remapRecord(prev));
      setManifestOverrides((prev) => remapRecord(prev));
      setPriceOverrides((prev) => remapRecord(prev));
      setPriceAdjustments((prev) => remapRecord(prev));
      setSelectedRows((prev) => remapSet(prev));
      setDeletedIndices((prev) => remapSet(prev));
      setManifestReassignedIndices((prev) => remapSet(prev));

      setUnlinkedRows((prev) => remapSet(prev));
      setSlCodeOverrides((prev) => remapRecord(prev));
      setMatchOverrides((prev) => remapRecord(prev));
      setNameOverrides((prev) => remapRecord(prev));
      setApprovedMatches((prev) => remapSet(prev));

      // 7. Update local rows state with fresh database values
      setLiveResultData((prev) => ({
        ...prev,
        rows: fresh.rows,
        summary: {
          ...prev.summary,
          totalRows: fresh.rows.length,
        },
      }));

      // 8. Flag that we hold a local merge so the prop-sync effect preserves it
      if (addedCount > 0 || removedCount > 0) {
        hasLocalMergeRef.current = true;
      }

      // 9. Acknowledge packages watcher to reset the drift diff state
      packagesWatch.acknowledge();

      // 10. Notify user via descriptive Spanish Toast only if there were actual modifications or manual action
      const parts: string[] = [];
      if (addedCount > 0) {
        parts.push(`agregado${addedCount !== 1 ? "s" : ""} ${addedCount} paquete${addedCount !== 1 ? "s" : ""}`);
      }
      if (removedCount > 0) {
        parts.push(`removido${removedCount !== 1 ? "s" : ""} ${removedCount} paquete${removedCount !== 1 ? "s" : ""}`);
      }

      if (isManual) {
        if (parts.length > 0) {
          toast({
            title: "Sincronización Inteligente Exitosa",
            description: `Se han ${parts.join(" y ")} en este manifiesto. Tus cambios y ajustes locales se conservaron sin pérdidas.`,
          });
        } else {
          toast({
            title: "Sincronización Inteligente",
            description: "El manifiesto ya está al día. No se detectaron discrepancias.",
          });
        }
      }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      setReloadError(msg);
      if (isManual) {
        toast({
          title: "Error al sincronizar manifiesto",
          description: msg,
          variant: "destructive",
        });
      } else {
        console.error("[Nova][AutoSync] Error reloading manifest:", err);
      }
    } finally {
      setIsReloadingManifest(false);
    }
  }, [
    resultData.manifestNumber,
    resultData.rows,
    dataOriginPolicy.origin,
    packagesWatch,
    toast,
    setLiveResultData,
    setPesoOverrides,
    setManifestOverrides,
    setPriceOverrides,
    setPriceAdjustments,
    setSelectedRows,
    setDeletedIndices,
    setManifestReassignedIndices,
    setUnlinkedRows,
    setSlCodeOverrides,
    setMatchOverrides,
    setNameOverrides,
    setApprovedMatches,
  ]);

  // Auto-sync when packages are added or removed externally (100% real-time multi-user) with DEBOUNCE to avoid thrashing during batch operations
  useEffect(() => {
    if (
      showTable &&
      dataOriginPolicy.origin === "firestore" &&
      (packagesWatch.addedTrackings.size > 0 || packagesWatch.removedTrackings.size > 0) &&
      !isReloadingManifest &&
      !reloadError
    ) {
      const timer = setTimeout(() => {
        handleReloadManifest(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [
    showTable,
    dataOriginPolicy.origin,
    packagesWatch.addedTrackings.size,
    packagesWatch.removedTrackings.size,
    isReloadingManifest,
    reloadError,
    handleReloadManifest,
  ]);

  // ── Helper: Fetch Firestore invoices and packages enrichment for printing ──
  const fetchManifestPrintEnrichment = useCallback(
    async (manifestNumber: string, trackings: string[]) => {
      const trackingToInvoiceMap = new Map<string, any>();
      const invoiceIdMap = new Map<string, any>();
      const trackingToPackageMap = new Map<string, any>();

      if (!manifestNumber && !trackings.length) {
        return { trackingToInvoiceMap, invoiceIdMap, trackingToPackageMap };
      }

      try {
        // 1. Fetch Invoices for this manifest (direct & multi-manifest arrays)
        const invoicePromises: Promise<any>[] = [];
        if (manifestNumber) {
          invoicePromises.push(
            getDocs(
              query(
                collection(db, "invoices"),
                where("manifestNumber", "==", manifestNumber)
              )
            ).catch(() => null),
            getDocs(
              query(
                collection(db, "invoices"),
                where("manifestNumbers", "array-contains", manifestNumber)
              )
            ).catch(() => null)
          );
        }
        const invSnaps = await Promise.all(invoicePromises);
        invSnaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((d: any) => {
            const inv = { id: d.id, ...d.data() };
            if (inv.status === "annulled" || inv.status === "cancelled") return;
            invoiceIdMap.set(d.id, inv);
            const tList: string[] = [];
            if (inv.trackingNumber) tList.push(inv.trackingNumber);
            if (Array.isArray(inv.trackingNumbers))
              tList.push(...inv.trackingNumbers);
            if (Array.isArray(inv.items)) {
              inv.items.forEach((it: any) => {
                if (it.trackingNumber) tList.push(it.trackingNumber);
                if (it.tracking) tList.push(it.tracking);
              });
            }
            tList.forEach((t) => {
              if (t) trackingToInvoiceMap.set(t.toUpperCase().trim(), inv);
            });
          });
        });

        // 2. Fetch Packages for this manifest
        if (manifestNumber) {
          const pkgSnap = await getDocs(
            query(
              collection(db, "packages"),
              where("manifestNumber", "==", manifestNumber)
            )
          ).catch(() => null);
          if (pkgSnap) {
            pkgSnap.docs.forEach((d: any) => {
              const data = d.data();
              const pkg = { id: d.id, ...data };
              if (d.id)
                trackingToPackageMap.set(d.id.toUpperCase().trim(), pkg);
              if (data.tracking)
                trackingToPackageMap.set(data.tracking.toUpperCase().trim(), pkg);
              if (data.trackingNumber)
                trackingToPackageMap.set(
                  data.trackingNumber.toUpperCase().trim(),
                  pkg
                );
            });
          }
        }

        // 3. Fallback: For any trackings not found in manifest packages, query them chunked
        const missingTrackings = trackings
          .map((t) => (t || "").toUpperCase().trim())
          .filter((t) => t && !trackingToPackageMap.has(t));

        if (missingTrackings.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < missingTrackings.length; i += 30) {
            chunks.push(missingTrackings.slice(i, i + 30));
          }
          await Promise.all(
            chunks.map(async (chunk) => {
              const snap = await getDocs(
                query(
                  collection(db, "packages"),
                  where("trackingNumber", "in", chunk)
                )
              ).catch(() => null);
              if (snap) {
                snap.docs.forEach((d: any) => {
                  const data = d.data();
                  const pkg = { id: d.id, ...data };
                  if (d.id)
                    trackingToPackageMap.set(d.id.toUpperCase().trim(), pkg);
                  if (data.tracking)
                    trackingToPackageMap.set(
                      data.tracking.toUpperCase().trim(),
                      pkg
                    );
                  if (data.trackingNumber)
                    trackingToPackageMap.set(
                      data.trackingNumber.toUpperCase().trim(),
                      pkg
                    );
                });
              }
            })
          );
        }
      } catch (err) {
        console.warn(
          "[NovaTableModal] Warning fetching manifest print enrichment:",
          err
        );
      }

      return { trackingToInvoiceMap, invoiceIdMap, trackingToPackageMap };
    },
    []
  );

  const handlePrintBoleta = useCallback(async () => {
    const win = window.open("", "_blank", "width=1100,height=700");
    if (!win) return;
    win.document.write(`
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
        <h2>Cargando boleta de bodega, por favor espere...</h2>
      </div>
    `);

    try {
      const allTrackings = resultData.rows
        .map((r) => r.tracking)
        .filter(Boolean) as string[];
      const slCodes = Array.from(
        new Set(resultData.rows.map((r) => r.slCode).filter(Boolean))
      ) as string[];

      const [customerMap, enrichment] = await Promise.all([
        getCustomersBySlCodes(slCodes).catch(() => new Map()),
        fetchManifestPrintEnrichment(
          resultData.manifestNumber || "",
          allTrackings
        ),
      ]);

      const printRows: BoletaPrintRow[] = resultData.rows.map((row, idx) => {
        const effSlCode =
          slCodeOverrides[idx]?.slCode ??
          matchOverrides[idx]?.slCode ??
          (row.slCode || "");
        const effRuta =
          rutaOverrides[effSlCode] ??
          rutaOverrides[`__unmatched__${row.nombre}`] ??
          rutaOverrides[row.slCode ?? ""] ??
          slCodeOverrides[idx]?.ruta ??
          matchOverrides[idx]?.ruta ??
          (row.ruta || "");
        const effCustomerName =
          matchOverrides[idx]?.fullName ??
          nameOverrides[idx] ??
          (row.nombreCliente || "");

        const cust = customerMap.get(effSlCode);
        const isConsolidado =
          cust && typeof cust.consolidationEnabled === "boolean"
            ? cust.consolidationEnabled
            : (row.consolidacion ?? false);

        const trk = (row.tracking || "").toUpperCase().trim();
        const pkg = enrichment.trackingToPackageMap.get(trk);
        const isReturned = Boolean(
          pkg?.isReturned === true ||
          pkg?.wasReturned === true ||
          !!pkg?.returnedAt ||
          !!pkg?.returnReason ||
          pkg?.status === "returned" ||
          pkg?.deliveryStatus === "returned" ||
          (row as any).isReturned === true
        );
        const originManifest = isReturned
          ? (pkg?.originalManifest ||
              pkg?.originManifest ||
              pkg?.manifiestoOrigen ||
              (pkg?.updatedManifest &&
              pkg?.manifestNumber &&
              pkg?.updatedManifest !== pkg?.manifestNumber
                ? pkg?.manifestNumber
                : undefined) ||
              (row as any).originManifest ||
              (row as any).manifiestoOrigen)
          : undefined;

        return {
          slCode: effSlCode,
          customerName: effCustomerName,
          manifestName: row.nombre || "",
          tracking: row.tracking || "",
          ruta: effRuta,
          consolidacion: isConsolidado,
          permisos: Boolean(row.permisos || pkg?.requiresPermit || pkg?.permisos),
          isReturned,
          originManifest,
        };
      });

      // Sort: by ruta (empty last), then customerName A-Z (sistema), then slCode as tiebreaker
      printRows.sort((a, b) => {
        if (!a.ruta && b.ruta) return 1;
        if (a.ruta && !b.ruta) return -1;
        if (a.ruta !== b.ruta)
          return a.ruta.localeCompare(b.ruta, "es", { sensitivity: "base" });
        const nameCmp = a.customerName.localeCompare(b.customerName, "es", {
          sensitivity: "base",
        });
        if (nameCmp !== 0) return nameCmp;
        return a.slCode.localeCompare(b.slCode);
      });

      const html = buildBoletaHTML(printRows, resultData.manifestNumber || "");
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    } catch (err) {
      win.document.open();
      win.document.write(`
        <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; color:red;">
          <h2>Error al generar la boleta de bodega</h2>
        </div>
      `);
      win.document.close();
      console.error("Error building boleta:", err);
    }
  }, [
    resultData.rows,
    resultData.manifestNumber,
    slCodeOverrides,
    matchOverrides,
    rutaOverrides,
    nameOverrides,
    fetchManifestPrintEnrichment,
  ]);

  // ── Boleta de Bodega ALFA (pure alphabetical, no route grouping) ─────────────
  const handlePrintBoletaAlfa = useCallback(async () => {
    const win = window.open("", "_blank", "width=1100,height=700");
    if (!win) return;
    win.document.write(`
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
        <h2>Cargando boleta de bodega ALFA, por favor espere...</h2>
      </div>
    `);

    try {
      const allTrackings = resultData.rows
        .map((r) => r.tracking)
        .filter(Boolean) as string[];
      const slCodes = Array.from(
        new Set(resultData.rows.map((r) => r.slCode).filter(Boolean))
      ) as string[];

      const [customerMap, enrichment] = await Promise.all([
        getCustomersBySlCodes(slCodes).catch(() => new Map()),
        fetchManifestPrintEnrichment(
          resultData.manifestNumber || "",
          allTrackings
        ),
      ]);

      const printRows: BoletaPrintRow[] = resultData.rows.map((row, idx) => {
        const effSlCode =
          slCodeOverrides[idx]?.slCode ??
          matchOverrides[idx]?.slCode ??
          (row.slCode || "");
        const effRuta =
          rutaOverrides[effSlCode] ??
          rutaOverrides[`__unmatched__${row.nombre}`] ??
          rutaOverrides[row.slCode ?? ""] ??
          slCodeOverrides[idx]?.ruta ??
          matchOverrides[idx]?.ruta ??
          (row.ruta || "");
        const effCustomerName =
          matchOverrides[idx]?.fullName ??
          nameOverrides[idx] ??
          (row.nombreCliente || "");

        const cust = customerMap.get(effSlCode);
        const isConsolidado =
          cust && typeof cust.consolidationEnabled === "boolean"
            ? cust.consolidationEnabled
            : (row.consolidacion ?? false);

        const trk = (row.tracking || "").toUpperCase().trim();
        const pkg = enrichment.trackingToPackageMap.get(trk);
        const isReturned = Boolean(
          pkg?.isReturned === true ||
          pkg?.wasReturned === true ||
          !!pkg?.returnedAt ||
          !!pkg?.returnReason ||
          pkg?.status === "returned" ||
          pkg?.deliveryStatus === "returned" ||
          (row as any).isReturned === true
        );
        const originManifest = isReturned
          ? (pkg?.originalManifest ||
              pkg?.originManifest ||
              pkg?.manifiestoOrigen ||
              (pkg?.updatedManifest &&
              pkg?.manifestNumber &&
              pkg?.updatedManifest !== pkg?.manifestNumber
                ? pkg?.manifestNumber
                : undefined) ||
              (row as any).originManifest ||
              (row as any).manifiestoOrigen)
          : undefined;

        return {
          slCode: effSlCode,
          customerName: effCustomerName,
          manifestName: row.nombre || "",
          tracking: row.tracking || "",
          ruta: effRuta,
          consolidacion: isConsolidado,
          permisos: Boolean(row.permisos || pkg?.requiresPermit || pkg?.permisos),
          isReturned,
          originManifest,
        };
      });

      // Sort: customerName A-Z, slCode as tiebreaker — no route grouping
      printRows.sort((a, b) => {
        const nameCmp = a.customerName.localeCompare(b.customerName, "es", {
          sensitivity: "base",
        });
        if (nameCmp !== 0) return nameCmp;
        return a.slCode.localeCompare(b.slCode);
      });

      const html = buildBoletaHTML(
        printRows,
        resultData.manifestNumber || "",
        false
      );

      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    } catch (err) {
      win.document.open();
      win.document.write(`
        <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; color:red;">
          <h2>Error al generar la boleta de bodega ALFA</h2>
        </div>
      `);
      win.document.close();
      console.error("Error building boleta alfa:", err);
    }
  }, [
    resultData.rows,
    resultData.manifestNumber,
    slCodeOverrides,
    matchOverrides,
    rutaOverrides,
    nameOverrides,
    fetchManifestPrintEnrichment,
  ]);

  // ── Route manifest print ────────────────────────────────────────────────────
  const handlePrintRouteManifest = useCallback(async () => {
    if (!routeFilter || routeFilter === "__sin_ruta__") return;

    // buildResolvedRows is the single source of truth for effective prices:
    // it applies all overrides (price, route, name), consolidation distribution,
    // and shipping-type rules — exactly matching the Nova table display.
    const rowsToPrint = resultData.rows.filter((_, i) =>
      filteredIdxs.includes(i)
    );
    const resolvedRows = buildResolvedRows(rowsToPrint);

    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;

    win.document.write(`
      <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
        <h2>Cargando manifiesto de ruta, por favor espere...</h2>
      </div>
    `);

    try {
      const slCodes = Array.from(
        new Set(resolvedRows.map((r) => r.slCode).filter(Boolean))
      ) as string[];
      const trackings = resolvedRows
        .map((r) => r.tracking)
        .filter(Boolean) as string[];

      const [customerMap, enrichment] = await Promise.all([
        getCustomersBySlCodes(slCodes).catch(() => new Map()),
        fetchManifestPrintEnrichment(
          resultData.manifestNumber || "",
          trackings
        ),
      ]);

      const filteredRows: RouteManifestRow[] = resolvedRows
        .filter((r) => (r.ruta || "") === routeFilter)
        .map((r) => {
          const c = customerMap.get(r.slCode);
          const isConsolidado =
            c && typeof c.consolidationEnabled === "boolean"
              ? c.consolidationEnabled
              : (r.consolidacion ?? false);

          const trk = (r.tracking || "").toUpperCase().trim();
          const pkg = enrichment.trackingToPackageMap.get(trk);
          const pkgInvoice =
            enrichment.trackingToInvoiceMap.get(trk) ||
            (pkg?.invoiceId
              ? enrichment.invoiceIdMap.get(pkg.invoiceId)
              : null);

          const isReturned = Boolean(
            pkg?.isReturned === true ||
            pkg?.wasReturned === true ||
            !!pkg?.returnedAt ||
            !!pkg?.returnReason ||
            pkg?.status === "returned" ||
            pkg?.deliveryStatus === "returned" ||
            (r as any).isReturned === true ||
            (r as any).wasReturned === true ||
            !!(r as any).returnedAt ||
            !!(r as any).returnReason
          );

          const originManifest = isReturned
            ? (pkg?.originalManifest ||
                pkg?.originManifest ||
                pkg?.manifiestoOrigen ||
                (pkg?.updatedManifest &&
                pkg?.manifestNumber &&
                pkg?.updatedManifest !== pkg?.manifestNumber
                  ? pkg?.manifestNumber
                  : undefined) ||
                (r as any).originManifest ||
                (r as any).manifiestoOrigen)
            : undefined;

          // Look for matching item inside the invoice if available
          let invItem = null;
          if (pkgInvoice && Array.isArray(pkgInvoice.items)) {
            invItem = pkgInvoice.items.find((it: any) => {
              const itTrk = (
                it.trackingNumber ||
                it.tracking ||
                ""
              )
                .toUpperCase()
                .trim();
              return itTrk && itTrk === trk;
            });
          }
          const priceUSD = invItem
            ? Number(
                invItem.unitPrice ??
                  invItem.totalPrice ??
                  invItem.amount ??
                  0
              )
            : Number(pkg?.price ?? r.precio ?? 0);

          return {
            slCode: r.slCode || "",
            customerName: r.nombreCliente || r.nombre || "",
            manifestName: r.nombre || "",
            tracking: r.tracking || "",
            price: priceUSD,
            descripcion: r.descripcion || "",
            peso: r.pesoRedondeo ?? Math.ceil(r.peso ?? 0),
            consolidacion: isConsolidado,
            permisos: Boolean(r.permisos || pkg?.requiresPermit || pkg?.permisos),
            invoiceId: pkgInvoice?.id || pkg?.invoiceId,
            invoiceNumber: pkgInvoice?.invoiceNumber || pkg?.invoiceNumber,
            invoiceAmountUSD:
              pkgInvoice?.totalAmount ??
              pkgInvoice?.amount ??
              pkgInvoice?.subtotal,
            invoiceAmountCRC:
              pkgInvoice?.amountCRC ?? pkgInvoice?.totalAmountCRC,
            isReturned: isReturned,
            isReassigned:
              pkg?.isReassigned === true || (r as any).isReassigned === true,
            originManifest: originManifest,
          };
        });

      if (filteredRows.length === 0) {
        win.close();
        return;
      }

      const html = buildRouteManifestHTML(
        filteredRows,
        routeFilter,
        resultData.manifestNumber || "",
        tc
      );

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
  }, [
    buildResolvedRows,
    resultData.rows,
    filteredIdxs,
    routeFilter,
    resultData.manifestNumber,
    tc,
    fetchManifestPrintEnrichment,
  ]);

  // ── PERF: memoize group building + sorting so selectedRows / priceOverrides
  // changes (checkbox clicks, Guardar) do NOT trigger O(n) re-grouping.
  // selectedRows is intentionally NOT in the dependency array.
  const sortedGroups = useMemo((): [string, GroupEntry[]][] => {
    const dir = sortConfig.dir === "asc" ? 1 : -1;
    const filtered = filteredIdxs.map((originalIdx) => ({
      row: resultData.rows[originalIdx],
      originalIdx,
    }));

    const groupMap = new Map<string, GroupEntry[]>();
    (flatPesoSort
      ? [...filtered].sort((a, b) => {
        const aV =
          sortConfig.col === "pesoRedondeo"
            ? a.row.pesoRedondeo || a.row.peso || 0
            : a.row.peso || 0;
        const bV =
          sortConfig.col === "pesoRedondeo"
            ? b.row.pesoRedondeo || b.row.peso || 0
            : b.row.peso || 0;
        return (aV - bV) * dir;
      })
      : filtered
    ).forEach(({ row, originalIdx }) => {
      const override = slCodeOverrides[originalIdx];
      const matchOverride = matchOverrides[originalIdx];
      const effNombreForKey = nameOverrides[originalIdx] ?? row.nombre;
      // BUG-UNMATCHED-GROUP-KEY-RESOLVER 2026-08-18: Ensure ONLY real numeric SL codes (SL followed by digits, e.g. SL262073)
      // are treated as global client identifiers for grouping. Generic pseudo-codes like 'SL-NAN', 'SL-TEMP', or 'sin registro'
      // must NEVER merge different individuals together. Unregistered packages must be grouped by individual client name.
      const directSlCodeRaw = unlinkedRows.has(originalIdx)
        ? ""
        : override?.slCode || matchOverride?.slCode || row.slCode || "";
      const directSlCode = (directSlCodeRaw && /^SL\d+$/i.test(directSlCodeRaw.trim()))
        ? directSlCodeRaw.trim().toUpperCase()
        : "";

      let twinSlCode = directSlCode;
      if (!twinSlCode && !unlinkedRows.has(originalIdx)) {
        const normName = effNombreForKey.trim().toUpperCase();
        if (normName) {
          const siblingObj = filtered.find(({ row: r, originalIdx: oIdx }) => {
            if (unlinkedRows.has(oIdx)) return false;
            const siblingName = (nameOverrides[oIdx] ?? r.nombre).trim().toUpperCase();
            if (siblingName !== normName) return false;
            const sSlCodeRaw = slCodeOverrides[oIdx]?.slCode || matchOverrides[oIdx]?.slCode || r.slCode;
            const sSlCode = (sSlCodeRaw && /^SL\d+$/i.test(sSlCodeRaw.trim())) ? sSlCodeRaw.trim().toUpperCase() : "";
            return !!sSlCode;
          });
          if (siblingObj) {
            const sIdx = siblingObj.originalIdx;
            const twinSlCodeRaw = slCodeOverrides[sIdx]?.slCode || matchOverrides[sIdx]?.slCode || resultData.rows[sIdx].slCode || "";
            twinSlCode = (twinSlCodeRaw && /^SL\d+$/i.test(twinSlCodeRaw.trim())) ? twinSlCodeRaw.trim().toUpperCase() : "";
          }
        }
      }

      const key = flatPesoSort
        ? `__flat_${originalIdx}`
        : unlinkedRows.has(originalIdx)
          ? `__unmatched__${effNombreForKey}`
          : twinSlCode || `__unmatched__${effNombreForKey}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push({ row, originalIdx });
    });

    const sortRowsInGroup = (rows: GroupEntry[]): GroupEntry[] => {
      const copy = [...rows];
      copy.sort((a, b) => {
        let aV: string | number = 0,
          bV: string | number = 0;
        switch (sortConfig.col) {
          case "tracking":
            aV = (a.row.tracking || "").toUpperCase();
            bV = (b.row.tracking || "").toUpperCase();
            break;
          case "peso":
            aV = a.row.peso || 0;
            bV = b.row.peso || 0;
            break;
          case "pesoRedondeo": {
            const aTrk = String(a.row.tracking || '').toUpperCase();
            const bTrk = String(b.row.tracking || '').toUpperCase();
            aV =
              priceOverrides[aTrk]?.pesoRedondeo ??
              a.row.pesoRedondeo ??
              a.row.peso ??
              0;
            bV =
              priceOverrides[bTrk]?.pesoRedondeo ??
              b.row.pesoRedondeo ??
              b.row.peso ??
              0;
            break;
          }
          case "precio": {
            const aTrk = String(a.row.tracking || '').toUpperCase();
            const bTrk = String(b.row.tracking || '').toUpperCase();
            aV =
              priceOverrides[aTrk]?.precio ??
              computedPrices[a.originalIdx] ??
              0;
            bV =
              priceOverrides[bTrk]?.precio ??
              computedPrices[b.originalIdx] ??
              0;
            break;
          }
          case "colones": {
            const aTrk = String(a.row.tracking || '').toUpperCase();
            const bTrk = String(b.row.tracking || '').toUpperCase();
            aV =
              (priceOverrides[aTrk]?.precio ??
                computedPrices[a.originalIdx] ??
                0) * tc;
            bV =
              (priceOverrides[bTrk]?.precio ??
                computedPrices[b.originalIdx] ??
                0) * tc;
            break;
          }
          case "cliente":
            aV = (
              matchOverrides[a.originalIdx]?.fullName ??
              nameOverrides[a.originalIdx] ??
              a.row.nombre ??
              ""
            ).toUpperCase();
            bV = (
              matchOverrides[b.originalIdx]?.fullName ??
              nameOverrides[b.originalIdx] ??
              b.row.nombre ??
              ""
            ).toUpperCase();
            break;
          case "ruta": {
            const aEff =
              slCodeOverrides[a.originalIdx]?.slCode ||
              matchOverrides[a.originalIdx]?.slCode ||
              a.row.slCode;
            const bEff =
              slCodeOverrides[b.originalIdx]?.slCode ||
              matchOverrides[b.originalIdx]?.slCode ||
              b.row.slCode;
            aV = (
              rutaOverrides[aEff] ??
              rutaOverrides[`__unmatched__${a.row.nombre}`] ??
              slCodeOverrides[a.originalIdx]?.ruta ??
              matchOverrides[a.originalIdx]?.ruta ??
              (a.row.ruta || "")
            ).toUpperCase();
            bV = (
              rutaOverrides[bEff] ??
              rutaOverrides[`__unmatched__${b.row.nombre}`] ??
              slCodeOverrides[b.originalIdx]?.ruta ??
              matchOverrides[b.originalIdx]?.ruta ??
              (b.row.ruta || "")
            ).toUpperCase();
            break;
          }
          case "descripcion":
            aV = (a.row.descripcion || "").toUpperCase();
            bV = (b.row.descripcion || "").toUpperCase();
            break;
          default:
            aV = a.row.peso || 0;
            bV = b.row.peso || 0;
        }
        if (typeof aV === "number" && typeof bV === "number")
          return (aV - bV) * dir;
        return String(aV).localeCompare(String(bV), "es") * dir;
      });
      return copy;
    };
    groupMap.forEach((entries, key) =>
      groupMap.set(key, sortRowsInGroup(entries)),
    );

    if (flatPesoSort) return Array.from(groupMap.entries());

    const getGroupSortVal = (entries: GroupEntry[]): string | number => {
      const { row, originalIdx } = entries[0];
      const override = slCodeOverrides[originalIdx];
      const effSlCode =
        override?.slCode || matchOverrides[originalIdx]?.slCode || row.slCode;
      const effRuta =
        rutaOverrides[effSlCode] ??
        rutaOverrides[`__unmatched__${row.nombre}`] ??
        rutaOverrides[row.slCode] ??
        (override?.ruta || matchOverrides[originalIdx]?.ruta || row.ruta) ??
        "";
      switch (sortConfig.col) {
        case "cliente":
          return (
            matchOverrides[originalIdx]?.fullName ??
            nameOverrides[originalIdx] ??
            row.nombre ??
            ""
          ).toUpperCase();
        case "ruta":
          return (effRuta || "").toUpperCase();
        case "tracking":
          return (row.tracking || "").toUpperCase();
        case "peso":
          return row.peso || 0;
        case "pesoRedondeo": {
          const tracking = String(row.tracking || '').toUpperCase();
          return (
            priceOverrides[tracking]?.pesoRedondeo ??
            row.pesoRedondeo ??
            row.peso ??
            0
          );
        }
        case "precio": {
          const tracking = String(row.tracking || '').toUpperCase();
          return (
            priceOverrides[tracking]?.precio ??
            computedPrices[originalIdx] ??
            0
          );
        }
        case "colones": {
          const tracking = String(row.tracking || '').toUpperCase();
          return (
            (priceOverrides[tracking]?.precio ??
              computedPrices[originalIdx] ??
              0) * tc
          );
        }
        case "descripcion":
          return (row.descripcion || "").toUpperCase();
        default:
          return "";
      }
    };
    const getGroupSecondary = (entries: GroupEntry[]): string => {
      const { row, originalIdx } = entries[0];
      if (sortConfig.col === "cliente") return "";
      if (sortConfig.col === "ruta")
        return (
          matchOverrides[originalIdx]?.fullName ??
          nameOverrides[originalIdx] ??
          row.nombre ??
          ""
        ).toUpperCase();
      return "";
    };

    return Array.from(groupMap.entries()).sort(([, aE], [, bE]) => {
      const aV = getGroupSortVal(aE);
      const bV = getGroupSortVal(bE);
      let primary: number;
      if (typeof aV === "number" && typeof bV === "number")
        primary = (aV - bV) * dir;
      else primary = String(aV).localeCompare(String(bV), "es") * dir;
      if (primary !== 0) return primary;
      return (
        getGroupSecondary(aE).localeCompare(getGroupSecondary(bE), "es") * dir
      );
    });
  }, [
    filteredIdxs,
    resultData.rows,
    sortConfig,
    flatPesoSort,
    slCodeOverrides,
    nameOverrides,
    unlinkedRows,
    matchOverrides,
    rutaOverrides,
    priceOverrides,
    computedPrices,
    tc,
  ]);

  // ── Available groups for "Move to existing group" feature ──────────────────
  // Builds a list of all groups in the manifest for the unlink modal to show
  // as potential targets when the operator wants to move rows to another group.
  const availableGroups = useMemo(() => {
    return sortedGroups.map(([groupKey, entries]) => {
      const firstEntry = entries[0];
      const { row, originalIdx } = firstEntry;
      const effSlCode =
        slCodeOverrides[originalIdx]?.slCode ||
        matchOverrides[originalIdx]?.slCode ||
        row.slCode;
      const name =
        matchOverrides[originalIdx]?.fullName ||
        nameOverrides[originalIdx] ||
        row.nombreCliente ||
        row.nombre;
      // Effective ruta — used by `onMoveToGroup` so a row reassigned to
      // this group inherits the right delivery route. Honours the
      // override stack: rutaOverrides[slCode] > slCodeOverrides[idx].ruta
      // > matchOverrides[idx].ruta > the source row's own ruta.
      const ruta =
        (effSlCode ? rutaOverrides[effSlCode] : undefined) ??
        slCodeOverrides[originalIdx]?.ruta ??
        matchOverrides[originalIdx]?.ruta ??
        row.ruta ??
        "";
      return {
        key: groupKey,
        name,
        slCode: effSlCode,
        ruta,
        rowCount: entries.length,
        isMatched: !!effSlCode && !groupKey.startsWith("__unmatched__"),
      };
    });
  }, [
    sortedGroups,
    slCodeOverrides,
    matchOverrides,
    nameOverrides,
    rutaOverrides,
  ]);

  // ── Merge-target detection (groupKey → MergeTarget) ──────────────────────────
  // For every unmatched group, check whether ANOTHER group in the manifest
  // represents the same customer (same normalized name) AND has a real
  // slCode. If yes, surface a one-click "Fusionar con SL…" affordance in
  // the unmatched group's Acciones menu. Detection is strict — we never
  // suggest a merge when the candidate is ambiguous (2+ matched twins) or
  // when the source already has a slCode. See `lib/nova/merge-groups.ts`.
  //
  // Memoized off the same deps as `sortedGroups` because effective slCode
  // and customer-name math depends on the override state. selectedRows /
  // priceOverrides are intentionally NOT inputs — they don't influence
  // group-key composition.
  const mergeTargetByGroupKey = useMemo((): Record<string, MergeTarget> => {
    const fingerprints = sortedGroups.map(([groupKey, entries]) =>
      buildGroupFingerprint(groupKey, entries, {
        matchOverrides,
        slCodeOverrides,
        unlinkedRows,
      }),
    );
    const targets: Record<string, MergeTarget> = {};
    for (const fp of fingerprints) {
      const target = findMergeTarget(fp, fingerprints);
      if (target) targets[fp.groupKey] = target;
    }
    return targets;
  }, [sortedGroups, matchOverrides, slCodeOverrides, unlinkedRows]);

  // ── Sibling groups index (status-agnostic) ────────────────────────────────
  // Drives the "Revalidar grupo" Acciones item: lists every OTHER group in
  // the manifest that shares the customer name (≥0.85 fuzzy similarity),
  // regardless of matched/unmatched status. The conservative
  // `mergeTargetByGroupKey` only fires for unmatched-vs-matched pairs;
  // this map covers the matched-vs-matched duplicate case the operator
  // hits after a save/reload split (BUG-REVALIDAR-GRUPO 2026-04-29).
  //
  // Sharing the fingerprint pass with `mergeTargetByGroupKey` would be a
  // micro-optimization but the recompute is O(n²) on group count which
  // is small in practice (manifests rarely exceed ~80 groups), so we
  // keep them as separate memos for clarity.
  const groupSiblingsByGroupKey = useMemo((): Record<
    string,
    GroupSibling[]
  > => {
    const fingerprints = sortedGroups.map(([groupKey, entries]) =>
      buildGroupFingerprint(groupKey, entries, {
        matchOverrides,
        slCodeOverrides,
        unlinkedRows,
      }),
    );
    const out: Record<string, GroupSibling[]> = {};
    for (const fp of fingerprints) {
      const siblings = findGroupSiblings(fp, fingerprints);
      if (siblings.length > 0) out[fp.groupKey] = siblings;
    }
    return out;
  }, [sortedGroups, matchOverrides, slCodeOverrides, unlinkedRows]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        embedMode ? "flex flex-col h-full overflow-hidden" : "mt-2 space-y-3"
      }
    >
      {lastReassignment && (
        <div className="rounded-xl border border-teal-300 dark:border-teal-800 bg-teal-500/10 dark:bg-teal-950/20 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="p-1 rounded-md bg-teal-500 text-white mt-0.5">
              <Undo2 className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-teal-800 dark:text-teal-400">
                Traslado de encomiendas realizado
              </p>
              <p className="text-xs text-muted-foreground">
                Se trasladaron <strong>{lastReassignment.trackings.length} paquetes</strong> al manifiesto{" "}
                <code className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300">{lastReassignment.targetManifestId}</code>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLastReassignment(null)}
              className="h-8 text-xs border-teal-200/50 hover:bg-teal-500/10 text-teal-700 dark:text-teal-300 bg-transparent hover:text-teal-800"
              disabled={isUndoingReassignment}
            >
              Descartar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleUndoReassignment}
              className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
              disabled={isUndoingReassignment}
            >
              {isUndoingReassignment ? (
                <>
                  <Loader2 className="h-3 animate-spin" />
                  Revirtiendo...
                </>
              ) : (
                <>
                  <Undo2 className="h-3 w-3" />
                  Deshacer traslado
                </>
              )}
            </Button>
          </div>
        </div>
      )}


      {/* Corrections + Validation — single collapsible */}
      {!embedMode &&
        (resultData.corrections.length > 0 ||
          (resultData.validation &&
            resultData.validation.issues.length > 0)) && (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setShowCorrections(!showCorrections)}
              className="w-full flex items-center justify-between p-3 bg-muted/40 hover:bg-accent/50 transition-colors"
            >
              <span className="text-sm font-medium text-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Detalles del procesamiento
                {resultData.corrections.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    · {resultData.corrections.length} correcciones
                  </span>
                )}
                {resultData.validation &&
                  resultData.validation.issues.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal">
                      · {resultData.validation.issues.length} observaciones
                    </span>
                  )}
              </span>
              {showCorrections ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showCorrections && (
              <div className="border-t border-border divide-y divide-border max-h-64 overflow-y-auto">
                {resultData.corrections.map((correction, idx) => (
                  <div key={`c-${idx}`} className="p-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Fila {correction.row}</span>
                      <span>•</span>
                      <span>{correction.field}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="line-through text-muted-foreground">
                        {correction.original}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-green-600 font-medium">
                        {correction.corrected}
                      </span>
                    </div>
                  </div>
                ))}
                {resultData.validation &&
                  resultData.validation.issues.map((issue, idx) => (
                    <div key={`v-${idx}`} className="p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium",
                            issue.type === "error" &&
                            "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
                            issue.type === "warning" &&
                            "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
                            issue.type === "suggestion" &&
                            "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
                          )}
                        >
                          {issue.type === "error"
                            ? "Error"
                            : issue.type === "warning"
                              ? "Aviso"
                              : "Sugerencia"}
                        </span>
                        <span className="text-muted-foreground">
                          {issue.field}
                        </span>
                      </div>
                      <p className="mt-1 text-foreground">{issue.message}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

      {/* Multi-Match Selection */}
      {!embedMode &&
        resultData.multiMatchRows &&
        resultData.multiMatchRows.length > 0 && (
          <MultiMatchSection multiMatchRows={resultData.multiMatchRows} />
        )}

      {/* Ver tabla & Ver manifiestos de Firestore buttons in chat card */}
      {!embedMode && !showTable && (
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full mt-2">
          <Button
            onClick={() => setShowTable(true)}
            size="sm"
            className="gap-2 flex-1 w-full h-9 font-medium"
          >
            <Table2 className="h-4 w-4" />
            Ver tabla
          </Button>

          {onShowRecentManifests && (
            <Button
              onClick={onShowRecentManifests}
              variant="outline"
              size="sm"
              className="gap-2 flex-1 w-full h-9 font-medium border-primary/20 hover:bg-primary/5"
            >
              <FolderOpen className="h-4 w-4 text-primary" />
              Ver manifiestos de Firestore
            </Button>
          )}
        </div>
      )}

      {/* Full row table modal — portalled to body in non-embed mode to escape framer-motion transform context */}
      {(() => {
        const tableModal = (
          <AnimatePresence>
            {showTable && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={
                  embedMode
                    ? "relative flex flex-col flex-1 overflow-hidden"
                    : "fixed inset-0 z-[60] bg-background overflow-hidden flex flex-col"
                }
              >
                {!embedMode && (
                  <button
                    type="button"
                    onClick={() => setShowTable(false)}
                    className="hidden md:flex absolute top-2 right-3 z-[62] rounded-lg p-1.5 border-2 border-red-500 bg-background hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    aria-label="Cerrar tabla"
                  >
                    <X className="h-4 w-4 text-red-500" />
                  </button>
                )}
                <div className="flex flex-col border-b border-border bg-card">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2">
                    {!embedMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowTable(false);
                          if (onShowRecentManifests) {
                            onShowRecentManifests();
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0"
                        aria-label="Volver"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Manifiestos
                      </button>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      <Table2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                        {resultData.manifestNumber} —{" "}
                        {filteredIdxs.length}
                        {filteredIdxs.length !== resultData.rows.length
                          ? `/${resultData.rows.length}`
                          : ""}{" "}
                        filas
                      </span>
                    </div>
                    {/* ── Toolbar consolidation (BUG-TOOLBAR-CROWDED 2026-04-29) ──
                      Pre-fix the toolbar grew to 8–10 buttons with most at the
                      same visual weight — bulk-actions, view toggles, filters
                      and the Re-validar escape hatch all competed for the same
                      strip. We collapse everything operational into a single
                      "Acciones" dropdown so the row stays clean, while keeping
                      the THREE high-signal items always visible:
                        • Integrity-warning badge
                        • Route filter (drives the per-row colour scheme)
                        • Search input (table filter)
                      The dropdown groups items by purpose (Selección /
                      Vista / Filtros / Especiales) so the operator's mental
                      model stays close to what was previously visible. ─── */}
                    {(() => {
                      const divergentCount = resultData.rows.filter(
                        (row, idx) => {
                          if (deletedIndices.has(idx) || unlinkedRows.has(idx))
                            return false;
                          const effName =
                            matchOverrides[idx]?.fullName || row.nombreCliente;
                          return (
                            !!effName && isDivergentMatch(row.nombre, effName)
                          );
                        },
                      ).length;
                      const noSlCount = resultData.rows.filter((row, idx) => {
                        if (deletedIndices.has(idx)) return false;
                        const effSlCode =
                          slCodeOverrides[idx]?.slCode ||
                          matchOverrides[idx]?.slCode ||
                          row.slCode;
                        return !effSlCode;
                      }).length;
                      const tempOrNanCount = resultData.rows.filter(
                        (row, idx) => {
                          if (deletedIndices.has(idx) || unlinkedRows.has(idx))
                            return false;
                          const effSlCode =
                            slCodeOverrides[idx]?.slCode ||
                            matchOverrides[idx]?.slCode ||
                            row.slCode;
                          return (
                            effSlCode &&
                            effSlCode.toUpperCase().startsWith("SL-NAN-")
                          );
                        },
                      ).length;
                      const preAlertedCount = resultData.rows.filter(
                        (row, idx) => {
                          if (deletedIndices.has(idx)) return false;
                          const normTracking = (row.tracking || "").toUpperCase().trim();
                          const info = preAlertsMap.get(normTracking);
                          return info && info.found;
                        },
                      ).length;
                      const activeFilterCount =
                        (showOnlyReview ? 1 : 0) +
                        (showOnlyDivergent ? 1 : 0) +
                        (showOnlyNoSlCode ? 1 : 0) +
                        (showOnlyTempOrNan ? 1 : 0) +
                        (showOnlyPreAlerted ? 1 : 0) +
                        (!showGroupHeaders && !flatPesoSort ? 1 : 0);
                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0",
                                activeFilterCount > 0
                                  ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                                  : "border-border bg-muted/40 text-foreground hover:bg-accent",
                              )}
                              aria-label="Acciones de la tabla"
                              data-testid="nova-toolbar-actions"
                            >
                              <Sparkles className="h-3 w-3" />
                              Acciones
                              {activeFilterCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500 text-white">
                                  {activeFilterCount}
                                </span>
                              )}
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className={cn(
                              "w-auto p-3 z-[70] shadow-2xl rounded-xl border border-border/80 bg-popover transition-all",
                              filteredIdxs.length < resultData.rows.length
                                ? "min-w-[720px] max-w-[840px]"
                                : "min-w-[500px] max-w-[600px]"
                            )}
                          >
                            <div className={cn(
                              "grid gap-4",
                              filteredIdxs.length < resultData.rows.length
                                ? "grid-cols-3"
                                : "grid-cols-2"
                            )}>
                              {/* ── Columna 1: Vista & Filtros ── */}
                              <div className="space-y-3">
                                <div>
                                  <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
                                    Vista
                                  </DropdownMenuLabel>
                                  <DropdownMenuCheckboxItem
                                    checked={!showGroupHeaders && !flatPesoSort}
                                    onCheckedChange={() => {
                                      if (!flatPesoSort)
                                        setShowGroupHeaders((v) => !v);
                                    }}
                                    disabled={flatPesoSort}
                                    className="rounded-lg text-xs font-medium cursor-pointer"
                                  >
                                    {showGroupHeaders && !flatPesoSort ? (
                                      <EyeOff className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                                    ) : (
                                      <Eye className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                                    )}
                                    Ocultar encabezados
                                  </DropdownMenuCheckboxItem>
                                </div>

                                <div className="pt-2 border-t border-border/60">
                                  <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
                                    Filtros Rápidos
                                  </DropdownMenuLabel>
                                  <div className="space-y-0.5">
                                    {dataOriginPolicy.showDivergentFilter &&
                                      (divergentCount > 0 || showOnlyDivergent) && (
                                        <DropdownMenuCheckboxItem
                                          checked={showOnlyDivergent}
                                          onCheckedChange={() =>
                                            setShowOnlyDivergent((v) => !v)
                                          }
                                          className="rounded-lg text-xs font-medium cursor-pointer"
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5 mr-2 text-amber-500 shrink-0" />
                                          Divergentes
                                          {divergentCount > 0
                                            ? ` (${divergentCount})`
                                            : ""}
                                        </DropdownMenuCheckboxItem>
                                      )}
                                    {(noSlCount > 0 || showOnlyNoSlCode) && (
                                      <DropdownMenuCheckboxItem
                                        checked={showOnlyNoSlCode}
                                        onCheckedChange={() =>
                                          setShowOnlyNoSlCode((v) => !v)
                                        }
                                        className="rounded-lg text-xs font-medium cursor-pointer"
                                      >
                                        <UserX className="h-3.5 w-3.5 mr-2 text-rose-500 shrink-0" />
                                        Sin cliente
                                        {noSlCount > 0 ? ` (${noSlCount})` : ""}
                                      </DropdownMenuCheckboxItem>
                                    )}
                                    {(tempOrNanCount > 0 || showOnlyTempOrNan) && (
                                      <DropdownMenuCheckboxItem
                                        checked={showOnlyTempOrNan}
                                        onCheckedChange={() =>
                                          setShowOnlyTempOrNan((v) => !v)
                                        }
                                        className="rounded-lg text-xs font-medium cursor-pointer"
                                      >
                                        <UserX className="h-3.5 w-3.5 mr-2 text-orange-400 shrink-0" />
                                        Temp / SL-NAN
                                        {tempOrNanCount > 0
                                          ? ` (${tempOrNanCount})`
                                          : ""}
                                      </DropdownMenuCheckboxItem>
                                    )}
                                    {(preAlertedCount > 0 || showOnlyPreAlerted) && (
                                      <DropdownMenuCheckboxItem
                                        checked={showOnlyPreAlerted}
                                        onCheckedChange={() =>
                                          setShowOnlyPreAlerted((v) => !v)
                                        }
                                        className="rounded-lg text-xs font-medium cursor-pointer"
                                      >
                                        <Tag className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                                        Pre-alertados
                                        {preAlertedCount > 0
                                          ? ` (${preAlertedCount})`
                                          : ""}
                                      </DropdownMenuCheckboxItem>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* ── Columna 2: Acciones en Todo el Manifiesto ── */}
                              <div className="space-y-3 pl-3 border-l border-border/60">
                                <div>
                                  <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">
                                    {filteredIdxs.length < resultData.rows.length ? "Todo el Manifiesto" : "Especiales"}
                                  </DropdownMenuLabel>

                                  <div className="space-y-1 mt-1">
                                    {/* Pre-Alertas Todo */}
                                    <DropdownMenuItem
                                      disabled={verifyingPreAlerts}
                                      onClick={() => handleVerifyPreAlerts()}
                                      className="rounded-lg text-xs font-medium text-indigo-700 dark:text-indigo-400 focus:bg-indigo-50 dark:focus:bg-indigo-950/30 cursor-pointer"
                                    >
                                      {verifyingPreAlerts ? (
                                        <Loader2 className="h-3.5 w-3.5 mr-2 text-indigo-500 shrink-0 animate-spin" />
                                      ) : (
                                        <ShieldCheck className="h-3.5 w-3.5 mr-2 text-indigo-500 shrink-0" />
                                      )}
                                      Corregir por Pre-Alertas {filteredIdxs.length < resultData.rows.length ? "(Todo)" : ""}
                                    </DropdownMenuItem>

                                    {/* Re-validar Todo */}
                                    {dataOriginPolicy.showRevalidateAllButton && (
                                      <DropdownMenuItem
                                        onClick={() => setShowRevalidateAllConfirm(true)}
                                        data-testid="nova-revalidate-all-button"
                                        className="rounded-lg text-xs font-medium text-violet-700 dark:text-violet-400 focus:bg-violet-50 dark:focus:bg-violet-950/30 cursor-pointer"
                                      >
                                        <RefreshCw className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                                        Re-validar todo
                                      </DropdownMenuItem>
                                    )}

                                    {/* Aprendizaje Todo */}
                                    <DropdownMenuItem
                                      disabled={teachingNova}
                                      onClick={() => handleTeachNova()}
                                      className="rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-950/30 cursor-pointer"
                                    >
                                      {teachingNova ? (
                                        <Loader2 className="h-3.5 w-3.5 mr-2 text-emerald-500 shrink-0 animate-spin" />
                                      ) : (
                                        <GraduationCap className="h-3.5 w-3.5 mr-2 text-emerald-500 shrink-0" />
                                      )}
                                      Enseñar a Nova {filteredIdxs.length < resultData.rows.length ? "(Todo)" : ""}
                                    </DropdownMenuItem>

                                    {/* Encomiendas */}
                                    <DropdownMenuItem
                                      onClick={handleReassignEncomiendas}
                                      className="rounded-lg text-xs font-medium text-amber-700 dark:text-amber-400 focus:bg-amber-50 dark:focus:bg-amber-950/30 cursor-pointer"
                                    >
                                      <Package className="h-3.5 w-3.5 mr-2 text-amber-500 shrink-0" />
                                      Reasignar Encomiendas
                                    </DropdownMenuItem>
                                  </div>
                                </div>
                              </div>

                              {/* ── Columna 3: Acciones Filtradas (Solo si hay filtro activo) ── */}
                              {filteredIdxs.length < resultData.rows.length && (
                                <div className="space-y-3 pl-3 border-l border-primary/20 bg-primary/5 -my-2 py-2 -mr-1 pr-2 rounded-r-lg">
                                  <div>
                                    <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-primary px-2 py-1 flex items-center justify-between">
                                      <span>Filtradas</span>
                                      <span className="text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                                        {filteredIdxs.length} filas
                                      </span>
                                    </DropdownMenuLabel>

                                    <div className="space-y-1.5 mt-1">
                                      {/* Pre-Alertas Filtradas */}
                                      <DropdownMenuItem
                                        disabled={verifyingPreAlerts}
                                        onClick={() => handleVerifyPreAlerts(filteredIdxs)}
                                        className="rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer border border-indigo-200 dark:border-indigo-800/60 shadow-sm"
                                      >
                                        {verifyingPreAlerts ? (
                                          <Loader2 className="h-3.5 w-3.5 mr-2 text-indigo-600 shrink-0 animate-spin" />
                                        ) : (
                                          <ShieldCheck className="h-3.5 w-3.5 mr-2 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                        )}
                                        Corregir por Pre-Alertas ({filteredIdxs.length})
                                      </DropdownMenuItem>

                                      {/* Re-validar Filtradas */}
                                      {dataOriginPolicy.showRevalidateAllButton && (
                                        <DropdownMenuItem
                                          onClick={async () => {
                                            setIsAutoSavePaused(true);
                                            setValidationProgress({
                                              active: true,
                                              current: 0,
                                              total: filteredIdxs.length,
                                              message: `Re-validando ${filteredIdxs.length} filas filtradas...`,
                                              isFadingOut: false,
                                            });
                                            try {
                                              await handleUnlinkAndRematch(
                                                filteredIdxs,
                                                (idx) => resultData.rows[idx]?.nombre ?? "",
                                                undefined,
                                                { preAlertsMap, customerContactMap }
                                              );
                                            } finally {
                                              setValidationProgress(prev => ({ ...prev, isFadingOut: true }));
                                              setTimeout(() => {
                                                setValidationProgress({
                                                  active: false,
                                                  current: 0,
                                                  total: 0,
                                                  message: "",
                                                  isFadingOut: false,
                                                });
                                              }, 500);
                                            }
                                          }}
                                          className="rounded-lg text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50/80 dark:bg-violet-950/50 hover:bg-violet-100 dark:hover:bg-violet-900/60 cursor-pointer border border-violet-200 dark:border-violet-800/60 shadow-sm"
                                        >
                                          <RefreshCw className="h-3.5 w-3.5 mr-2 text-violet-600 dark:text-violet-400 shrink-0" />
                                          Re-validar filtradas ({filteredIdxs.length})
                                        </DropdownMenuItem>
                                      )}

                                      {/* Enseñar Filtradas */}
                                      <DropdownMenuItem
                                        disabled={teachingNova}
                                        onClick={() => handleTeachNova(filteredIdxs)}
                                        className="rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-pointer border border-emerald-200 dark:border-emerald-800/60 shadow-sm"
                                      >
                                        {teachingNova ? (
                                          <Loader2 className="h-3.5 w-3.5 mr-2 text-emerald-600 shrink-0 animate-spin" />
                                        ) : (
                                          <GraduationCap className="h-3.5 w-3.5 mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        )}
                                        Enseñar a Nova ({filteredIdxs.length})
                                      </DropdownMenuItem>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })()}
                    {/* ── Re-validar all confirm modal — opened from the dropdown ── */}
                    <NovaRevalidateAllButton
                      policy={dataOriginPolicy}
                      rowCount={resultData.rows.length}
                      externalOpen={showRevalidateAllConfirm}
                      onExternalOpenChange={setShowRevalidateAllConfirm}
                      hideTrigger
                      onConfirm={async () => {
                        const allIndices = resultData.rows
                          .map((_, idx) => idx)
                          .filter((idx) => !deletedIndices.has(idx));
                        setIsAutoSavePaused(true);
                        setValidationProgress({
                          active: true,
                          current: 0,
                          total: 0,
                          message: "Re-validando clientes...",
                          isFadingOut: false,
                        });
                        try {
                          await handleUnlinkAndRematch(
                            allIndices,
                            (idx) => resultData.rows[idx]?.nombre ?? "",
                            (current, total) => {
                              setValidationProgress(prev => ({
                                ...prev,
                                current,
                                total,
                                message: `Validando ${current} de ${total} clientes`,
                              }));
                            },
                            { preAlertsMap, customerContactMap }
                          );
                        } catch (err) {
                          console.error("Error revalidating all:", err);
                        } finally {
                          setValidationProgress(prev => ({ ...prev, isFadingOut: true }));
                          setTimeout(() => {
                            setValidationProgress({
                              active: false,
                              current: 0,
                              total: 0,
                              message: "",
                              isFadingOut: false,
                            });
                          }, 500);
                        }
                      }}
                    />
                    {/* ── Integrity-audit badge (Firestore manifests only) ──
                      Kept ALWAYS-VISIBLE — high-signal warning that should
                      never hide behind a dropdown. Clicking opens the
                      NovaIntegrityModal where the operator can review
                      evidence and optionally apply high-confidence repairs.
                      Only renders when the audit found ≥1 issue. ──────── */}

                    {/* ── Route filter dropdown (shadcn Popover) ── */}
                    <Popover
                      open={routePopoverOpen}
                      onOpenChange={setRoutePopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all shrink-0",
                            routeFilter
                              ? (() => {
                                const rOpt = routeFilterOptions.find(
                                  (o) => o.name === routeFilter,
                                );
                                return rOpt
                                  ? `${rOpt.bg} ${rOpt.text} ${rOpt.border}`
                                  : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-foreground";
                              })()
                              : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:text-foreground hover:bg-accent",
                          )}
                          aria-label="Filtrar por ruta"
                        >
                          {routeFilter === "__sin_ruta__"
                            ? "Sin ruta"
                            : routeFilter || "Todas las rutas"}
                          <ChevronDown className="h-3 w-3 opacity-80 text-neutral-500 dark:text-neutral-400" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-56 max-w-full p-1 z-[70]"
                        align="start"
                        sideOffset={4}
                      >
                        <div className="flex flex-col gap-0.5 max-h-72 sm:max-h-[450px] md:max-h-[600px] overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setRouteFilter("");
                              setRoutePopoverOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5",
                              !routeFilter
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0">
                              {!routeFilter && <Check className="h-3.5 w-3.5" />}
                            </span>
                            Todas las rutas
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRouteFilter("__sin_ruta__");
                              setRoutePopoverOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5",
                              routeFilter === "__sin_ruta__"
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0">
                              {routeFilter === "__sin_ruta__" && <Check className="h-3.5 w-3.5" />}
                            </span>
                            Sin ruta
                          </button>
                          <div className="h-px bg-border my-0.5" />
                          {routeFilterOptions.map((r) => (
                            <button
                              key={r.name}
                              type="button"
                              onClick={() => {
                                setRouteFilter(r.name);
                                setRoutePopoverOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-2 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 hover:bg-accent",
                                routeFilter === r.name
                                  ? "bg-accent text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0">
                                {routeFilter === r.name && <Check className="h-3.5 w-3.5" />}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-semibold border truncate max-w-[calc(100%-2rem)]",
                                  r.bg,
                                  r.text,
                                  r.border,
                                )}
                              >
                                <span
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full shrink-0 bg-current",
                                  )}
                                />
                                <span className="truncate">{r.name}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {/* ── Manifest filter dropdown (fusion mode only) ── */}
                    {isFusion && (
                      <Popover
                        open={manifestPopoverOpen}
                        onOpenChange={(open) => {
                          setManifestPopoverOpen(open);
                          if (!open) setManifestSearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all shrink-0",
                              manifestFilter
                                ? "border-teal-400/60 bg-teal-500/10 text-teal-700 dark:text-teal-400"
                                : "border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 hover:text-foreground hover:bg-accent",
                            )}
                            aria-label="Filtrar por manifiesto"
                          >
                            <GitMerge className="h-3 w-3 opacity-70 shrink-0" />
                            {manifestFilter ? (
                              <span className="max-w-[80px] truncate">
                                {manifestFilter}
                              </span>
                            ) : (
                              "Manifiesto"
                            )}
                            {manifestFilter ? (
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label="Limpiar filtro de manifiesto"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setManifestFilter("");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    setManifestFilter("");
                                  }
                                }}
                                className="ml-0.5 rounded-full hover:bg-teal-500/20 p-0.5 cursor-pointer"
                              >
                                <X className="h-2.5 w-2.5" />
                              </span>
                            ) : (
                              <ChevronDown className="h-3 w-3 opacity-80 text-neutral-500 dark:text-neutral-400" />
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-1.5 z-[70]"
                          align="start"
                          sideOffset={4}
                        >
                          <div className="pb-1.5 mb-1 border-b border-border">
                            <input
                              autoFocus
                              type="text"
                              value={manifestSearch}
                              onChange={(e) =>
                                setManifestSearch(e.target.value)
                              }
                              placeholder="Buscar manifiesto..."
                              className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              aria-label="Buscar manifiesto"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setManifestFilter("");
                                setManifestPopoverOpen(false);
                                setManifestSearch("");
                              }}
                              className={cn(
                                "w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
                                !manifestFilter
                                  ? "bg-accent text-foreground"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                              )}
                            >
                              Todos los manifiestos
                            </button>
                            <div className="h-px bg-border my-0.5" />
                            {uniqueManifests
                              .filter(
                                (m) =>
                                  !manifestSearch.trim() ||
                                  m
                                    .toLowerCase()
                                    .includes(manifestSearch.toLowerCase()),
                              )
                              .map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => {
                                    setManifestFilter(m);
                                    setManifestPopoverOpen(false);
                                    setManifestSearch("");
                                  }}
                                  className={cn(
                                    "w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5",
                                    manifestFilter === m
                                      ? "bg-teal-500/10 text-teal-700 dark:text-teal-400"
                                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                  )}
                                >
                                  <GitMerge className="h-3 w-3 shrink-0 opacity-60" />
                                  <span className="truncate flex-1">{m}</span>
                                  {manifestFilter === m && (
                                    <Check className="h-3 w-3 ml-auto shrink-0 text-teal-600 dark:text-teal-400" />
                                  )}
                                </button>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                    <div className="relative shrink-0 w-full sm:w-52">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 pointer-events-none" />
                      <input
                        type="text"
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        placeholder="Filtrar por tracking, nombre, cliente, ruta..."
                        className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    {/* close button moved to top-right corner of modal */}
                  </div>
                </div>
                <div className={cn(
                  "flex-1 overflow-auto overscroll-y-contain",
                  validationProgress.active && !validationProgress.isFadingOut && "transition-all duration-300 filter blur-[3px] pointer-events-none select-none"
                )}>


                  <style>{`
                    @keyframes tableRowFadeIn {
                      from {
                        opacity: 0;
                        transform: translateY(4px);
                      }
                      to {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                    .animate-table-row-fade-in {
                      animation: tableRowFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    @keyframes rowFadeIn {
                      from {
                        opacity: 0;
                        transform: translateY(-8px);
                      }
                      to {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                    @keyframes rowFadeOut {
                      from {
                        opacity: 1;
                        transform: translateY(0);
                      }
                      to {
                        opacity: 0;
                        transform: translateY(-8px);
                      }
                    }
                    @keyframes cellCollapse {
                      from {
                        padding-top: 6px;
                        padding-bottom: 6px;
                        line-height: 1.25;
                      }
                      to {
                        padding-top: 0px;
                        padding-bottom: 0px;
                        line-height: 0;
                        height: 0px;
                        font-size: 0px;
                      }
                    }
                    .animate-row-in {
                      animation: rowFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    .animate-row-out {
                      animation: rowFadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    .animate-row-out td {
                      animation: cellCollapse 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                      overflow: hidden;
                    }
                    .animate-row-out td * {
                      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                      height: 0px !important;
                      min-height: 0px !important;
                      padding-top: 0px !important;
                      padding-bottom: 0px !important;
                      margin-top: 0px !important;
                      margin-bottom: 0px !important;
                      opacity: 0;
                      overflow: hidden;
                    }
                  `}</style>
                  <table className="w-full min-w-[820px] text-[11px]">
                    <colgroup>
                      <col className="w-10" />
                      <col className="w-28" />
                      <col className="w-auto" />
                      <col className="w-44" />
                      <col className="w-20" />
                      <col className="w-20" />
                      <col className="w-24" />
                      <col className="w-24" />
                      <col className="w-72" />
                    </colgroup>
                    <thead className="bg-background sticky top-0 z-10 border-b-2 border-border shadow-[0_1px_0_0_hsl(var(--border))]">
                      <tr>
                        {/* # — not sortable */}
                        <th className="px-3 py-1.5 text-left font-semibold text-foreground whitespace-nowrap border-b border-border text-[10px] uppercase tracking-wide w-10 min-w-[40px]">
                          #
                        </th>
                        {(
                          [
                            { label: "Ruta", col: "ruta", className: "w-28 min-w-[110px]" },
                            { label: "Cliente", col: "cliente", className: "w-auto min-w-[180px]" },
                            { label: "Tracking", col: "tracking", className: "w-44 min-w-[170px]" },
                            {
                              label:
                                resultData.manifestType === "usa_sea"
                                  ? "Vol (ft³)"
                                  : "Peso",
                              col: "peso",
                              className: "w-20 min-w-[80px]",
                            },
                            {
                              label:
                                resultData.manifestType === "usa_sea"
                                  ? "Vol. Redn"
                                  : "P. Redn",
                              col: "pesoRedondeo",
                              className: "w-20 min-w-[80px]",
                            },
                            { label: "$ Dólares", col: "precio", className: "w-24 min-w-[96px]" },
                            { label: "₡ Colones", col: "colones", className: "w-24 min-w-[96px]" },
                            { label: "", col: "descripcion", className: "w-72 min-w-[280px]" },
                          ] as { label: string; col: SortCol; className: string }[]
                        ).map(({ label, col, className }) => {
                          const isSortable = col !== "descripcion";
                          const isActive = isSortable && sortConfig.col === col;
                          return (
                            <th
                              key={col}
                              onClick={isSortable ? () => handleColSort(col) : undefined}
                              className={cn(
                                "px-3 py-1.5 text-left font-semibold whitespace-nowrap border-b-2 border-border/70 text-[10px] uppercase tracking-wide select-none group transition-colors",
                                isSortable ? "cursor-pointer hover:bg-accent/50" : "",
                                isActive ? "text-primary" : "text-foreground",
                                col === "precio" && "min-w-[80px]",
                                className
                              )}
                              aria-sort={
                                isActive
                                  ? sortConfig.dir === "asc"
                                    ? "ascending"
                                    : "descending"
                                  : "none"
                              }
                            >
                              <span className="inline-flex items-center gap-1">
                                {label}
                                {isSortable ? (
                                  isActive ? (
                                    sortConfig.dir === "asc" ? (
                                      <ArrowUp className="h-3 w-3 text-primary" />
                                    ) : (
                                      <ArrowDown className="h-3 w-3 text-primary" />
                                    )
                                  ) : (
                                    <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                                  )
                                ) : null}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {isFiltering || !tercerosLoaded ? (
                        <NovaTableSkeleton rowCount={isFiltering ? 5 : 15} />
                      ) : (() => {
                        let globalRowNum = 0;
                        const jsx: React.ReactNode[] = [];

                        sortedGroups.forEach(([groupKey, rawEntries]) => {
                          const entries = rawEntries;
                          const firstEntry = entries[0];
                          const { row: firstRow, originalIdx: firstIdx } =
                            firstEntry;
                          const override = slCodeOverrides[firstIdx];
                          const effectiveSlCode = unlinkedRows.has(firstIdx)
                            ? ""
                            : override?.slCode ||
                            matchOverrides[firstIdx]?.slCode ||
                            firstRow.slCode;
                          const rutaKey = effectiveSlCode || groupKey;
                          const effNombreForRuta =
                            nameOverrides[firstIdx] ?? firstRow.nombre;
                          const effectiveRuta =
                            rutaOverrides[rutaKey] ??
                            rutaOverrides[`__unmatched__${effNombreForRuta}`] ??
                            rutaOverrides[`__unmatched__${firstRow.nombre}`] ??
                            rutaOverrides[firstRow.slCode] ??
                            (effectiveSlCode ? customerContactMap.get(effectiveSlCode.toUpperCase())?.ruta : undefined) ??
                            (override?.ruta ||
                              matchOverrides[firstIdx]?.ruta ||
                              firstRow.ruta);
                          const rOpt = routeOptions.find(
                            (o) => o.name === effectiveRuta,
                          );
                          const groupTotal = entries.reduce(
                            (s, e) => {
                              const tracking = String(e.row.tracking || '').toUpperCase();
                              return s +
                                (priceOverrides[tracking]?.precio ??
                                  computedPrices[e.originalIdx] ??
                                  0);
                            },
                            0,
                          );
                          const isUnmatched =
                            groupKey.startsWith("__unmatched__");
                          const cc = effectiveSlCode ? customerContactMap.get(effectiveSlCode.toUpperCase().trim()) : undefined;

                          // Group-level select state
                          const groupIdxs = entries.map((e) => e.originalIdx);
                          const groupAllSelected = groupIdxs.every((i) =>
                            selectedRows.has(i),
                          );
                          const groupIndeterminate =
                            !groupAllSelected &&
                            groupIdxs.some((i) => selectedRows.has(i));
                          const toggleGroup = () => {
                            setSelectedRows((prev) => {
                              const next = new Set(prev);
                              if (groupAllSelected) {
                                groupIdxs.forEach((i) => next.delete(i));
                              } else {
                                groupIdxs.forEach((i) => next.add(i));
                              }
                              return next;
                            });
                          };

                          // ── Hoisted group display values ─────────────────────────────────────
                          const grpSelected = entries.filter((e) =>
                            selectedRows.has(e.originalIdx),
                          );
                          const grpDisplayEntries =
                            grpSelected.length > 0 ? grpSelected : entries;
                          const grpSumPeso = grpDisplayEntries.reduce(
                            (s, e) =>
                              s +
                              (resolvedRows[e.originalIdx]?.peso ?? 0),
                            0,
                          );
                          const isEffectivelyConsolidated =
                            separateInvoices[groupKey] && entries.length >= 2;
                          const nonPermitDisplayEntries =
                            grpDisplayEntries.filter((e) => !e.row.permisos);

                          const grpSumPesoRedondeo = isEffectivelyConsolidated
                            ? nonPermitDisplayEntries.reduce(
                              (s, e) => s + (resolvedRows[e.originalIdx]?.pesoRedondeo ?? 0),
                              0,
                            )
                            : Math.ceil(grpSumPeso);

                          const consolidatedHeaderTotal = (() => {
                            if (!isEffectivelyConsolidated) {
                              return grpDisplayEntries.reduce(
                                (s, e) => s + (resolvedRows[e.originalIdx]?.precio ?? 0),
                                0,
                              );
                            }
                            return nonPermitDisplayEntries.reduce(
                              (s, e) => s + (resolvedRows[e.originalIdx]?.precio ?? 0),
                              0,
                            );
                          })();
                          const hasPermisos = entries.some(
                            (e) => e.row.permisos,
                          );
                          const grpQueueSize = (() => {
                            const ae =
                              grpSelected.length > 0 ? grpSelected : entries;
                            if (mergedInvoices[groupKey]) return 1;
                            if (isEffectivelyConsolidated)
                              return (
                                ae.filter((e) => e.row.permisos).length +
                                (ae.some((e) => !e.row.permisos) ? 1 : 0) || 1
                              );
                            return ae.length;
                          })();

                          // Group header row — displayed ABOVE child rows (pushed to jsx before entries loop).
                          // Suppressed in flat peso sort and when ALL entries are explicitly unlinked.
                          const allUnlinked = entries.every((e) =>
                            unlinkedRows.has(e.originalIdx),
                          );
                          // Pre-compute divergent rows for the warning badge and quick-fix action.
                          // A row is "divergent" when the manifest name shares NO tokens with the matched
                          // customer name — strong signal the match is wrong (e.g. learned-match pollution).
                          // ── Data-origin gate ────────────────────────────────────────────────────
                          // For Firestore-loaded manifests the divergence is intentional (curated
                          // links such as "PAULA UMANA" → "ANA PAULA FONSECA QUADROS"). Surfacing
                          // the badge invites the operator to click it and unwind their own work,
                          // so the policy hides the badge entirely. Per-row Acciones still allow
                          // explicit handling, and "Re-validar todo" is the bulk escape hatch.
                          // Same fallback chain as the rendered displayName below — falls
                          // back to the live `cc?.fullName` from customerContactMap before
                          // the manifest-snapshot `firstRow.nombreCliente` so divergent-
                          // match detection sees the up-to-date customer name.
                          const groupDisplayName =
                            matchOverrides[firstIdx]?.fullName ||
                            nameOverrides[firstIdx] ||
                            cc?.fullName ||
                            firstRow.nombreCliente ||
                            "";
                          const divergentEntries =
                            effectiveSlCode &&
                              dataOriginPolicy.showDivergentBadges
                              ? entries.filter(
                                (e) =>
                                  !unlinkedRows.has(e.originalIdx) &&
                                  isDivergentMatch(
                                    e.row.nombre,
                                    groupDisplayName,
                                  ),
                              )
                              : [];
                          const divergentCount = divergentEntries.length;
                          const terceroRow = effectiveSlCode
                            ? terceroRows.get(effectiveSlCode.toUpperCase())
                            : null;
                          const terceroAmount =
                            (terceroRow?.amount ?? 0) > 0
                              ? terceroRow!.amount
                              : 0;
                          // __unmatched__ groups are always fully unlinked by design — show footer
                          // regardless of allUnlinked so the operator can assign a customer via Acciones.
                          const showFooter =
                            showGroupHeaders &&
                            !flatPesoSort &&
                            (!allUnlinked ||
                              groupKey.startsWith("__unmatched__"));
                          const groupHasRecentFlash = entries.some((e) =>
                            recentlyUnlinked.has(e.originalIdx),
                          );
                          const footerRow = showFooter ? (
                            <tr
                              key={`grp-${groupKey}`}
                              className={cn(
                                "animate-table-row-fade-in border-b-2 border-t border-t-border/40 border-l-2",
                                rOpt
                                  ? cn(rOpt.bg, rOpt.borderL, rOpt.borderB)
                                  : "bg-slate-100/20 dark:bg-slate-700/10 border-l-slate-400 dark:border-l-slate-500 border-b-slate-400 dark:border-b-slate-500",
                                groupHasRecentFlash &&
                                "ring-2 ring-inset ring-emerald-500/60",
                              )}
                            >
                              {/* # — empty */}
                              <td className="px-3 py-1" />
                              {/* Ruta — clickable route badge in group header row */}
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      title="Cambiar ruta"
                                      className="focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                                    >
                                      {effectiveRuta && rOpt ? (
                                        <span
                                          className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 cursor-pointer hover:opacity-70 transition-opacity",
                                            rOpt.bg,
                                            rOpt.text,
                                            rOpt.border,
                                          )}
                                        >
                                          {abbrevRoute(effectiveRuta)}
                                        </span>
                                      ) : (
                                        <span
                                          className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 cursor-pointer transition-colors hover:border-primary/50 hover:text-primary",
                                            effectiveSlCode &&
                                              unroutedGroupKeys.has(
                                                effectiveSlCode,
                                              )
                                              ? "border-red-400/70 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 ring-1 ring-red-300/60 dark:ring-red-800/60"
                                              : "border-dashed border-muted-foreground/40 text-muted-foreground/60 font-medium",
                                          )}
                                        >
                                          sin ruta
                                        </span>
                                      )}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    className="w-44 z-[70]"
                                  >
                                    {routeOptions.map((r) => (
                                      <DropdownMenuItem
                                        key={r.name}
                                        onClick={() => {
                                          setRutaOverrides((prev) => ({
                                            ...prev,
                                            [rutaKey]: r.name,
                                          }));
                                          if (effectiveSlCode) {
                                            updateCustomerRuta(
                                              effectiveSlCode,
                                              r.name,
                                              false,
                                              'nova_route_picker',
                                            ).catch(console.error);
                                          } else {
                                            // HARDENING FIX 1: Check if we have a SL-NAN assigned
                                            // via matchOverride for this group but slCodeOverrides
                                            // hasn't caught up (i.e. the user just did unlink→temp).
                                            const pendingSlCode =
                                              matchOverrides[firstIdx]?.slCode ||
                                              slCodeOverrides[firstIdx]?.slCode;
                                            if (pendingSlCode) {
                                              updateCustomerRuta(
                                                pendingSlCode,
                                                r.name,
                                                false,
                                                'nova_route_picker',
                                              ).catch(console.error);
                                            }
                                            saveUnmatchedRouteLearning(
                                              firstRow.nombre,
                                              r.name,
                                            ).catch(console.error);
                                          }
                                        }}
                                        className={cn(
                                          "gap-2",
                                          effectiveRuta === r.name &&
                                          "font-semibold",
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "inline-block w-2.5 h-2.5 rounded-sm shrink-0 border",
                                            r.bg,
                                            r.border,
                                          )}
                                        />
                                        {r.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                              {/* Cliente + Tracking (colSpan=2) — muted slCode + name + Acciones */}
                              <td className="px-3 py-1.5" colSpan={2}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    {(() => {
                                      const mo = matchOverrides[firstIdx];
                                      // Display-name fallback chain (most-authoritative first):
                                      //   1. matchOverride.fullName  — operator's explicit assignment this session
                                      //   2. nameOverride            — operator typed a corrected name
                                      //   3. cc.fullName             — LIVE customers/{slCode}.fullName via onSnapshot
                                      //   4. firstRow.nombreCliente  — manifest snapshot taken at load time
                                      // Step 3 is what makes the "Editar cliente" → save flow reactive:
                                      // updates to `customers/{slCode}` propagate via
                                      // subscribeCustomersBySlCodes without requiring a manifest reload.
                                      const displayName =
                                        mo?.fullName ||
                                        nameOverrides[firstIdx] ||
                                        cc?.fullName ||
                                        firstRow.nombreCliente;
                                      // `uppercase` Tailwind utility forces capitalization at
                                      // the CSS layer (text-transform: uppercase) so the operator
                                      // sees a consistent caps presentation across the whole
                                      // table — without us having to mutate every name source
                                      // (Excel parse / Firestore manifest doc / customer search).
                                      if (!displayName)
                                        return (
                                          <span className="text-sm font-semibold text-foreground whitespace-nowrap uppercase">
                                            {firstRow.nombre}
                                          </span>
                                        );
                                      const isApprovedName =
                                        approvedMatches.has(firstIdx);
                                      const nameSpan = (
                                        <span
                                          className={cn(
                                            "text-sm font-bold whitespace-nowrap uppercase cursor-help hover:underline decoration-dotted decoration-slate-400/50 underline-offset-2",
                                            isApprovedName
                                              ? "text-foreground/80"
                                              : mo
                                                ? "text-green-700 dark:text-green-400"
                                                : firstRow.matchScore >= 0.9
                                                  ? "text-green-700 dark:text-green-400"
                                                  : firstRow.matchScore >= 0.65
                                                    ? "text-yellow-700 dark:text-yellow-400"
                                                    : "text-red-700 dark:text-red-400",
                                          )}
                                        >
                                          {displayName}
                                        </span>
                                      );

                                      if (!cc) return nameSpan;

                                       return (
                                         <TooltipProvider>
                                           <Tooltip>
                                             <TooltipTrigger asChild>
                                               {nameSpan}
                                             </TooltipTrigger>
                                             <TooltipContent className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-950 dark:text-slate-50 rounded-lg shadow-xl max-w-sm space-y-3 z-[9999] font-sans">
                                             <div className="space-y-2 min-w-[260px] text-xs">
                                               <div className="font-extrabold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800/50 pb-1.5 flex items-center justify-between gap-2">
                                                 <span className="truncate uppercase text-left">{displayName}</span>
                                                 <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded shrink-0">{cc.slCode}</span>
                                               </div>

                                               <div className="space-y-1.5 text-left font-sans">
                                                 {/* Consolidation status */}
                                                 <div>
                                                   <span className="text-slate-500 dark:text-slate-400 font-semibold font-sans">Consolidación: </span>
                                                   {cc.consolidationEnabled ? (
                                                     <span className="text-emerald-600 dark:text-emerald-400 font-bold font-sans">
                                                       Activa
                                                       {(() => {
                                                         const enabledAtRaw = cc.consolidationEnabledAt || cc.consolidationActivatedAt || cc.consolidationStartedAt || null;
                                                         const fallbackRaw = !enabledAtRaw ? (cc.updatedAt || cc.lastSyncAt || cc.modifiedAt || null) : null;
                                                         const dateToShow = enabledAtRaw || fallbackRaw;
                                                         return dateToShow ? (
                                                           <span className="text-[10px] text-slate-500 dark:text-slate-300 font-medium font-mono ml-1 font-sans">
                                                             (desde {fmtHoverDate(dateToShow)})
                                                           </span>
                                                         ) : null;
                                                       })()}
                                                     </span>
                                                   ) : (
                                                     <span className="text-slate-400 font-bold font-sans">Deshabilitada</span>
                                                   )}
                                                 </div>

                                                 {/* Last route change */}
                                                 <div>
                                                   <span className="text-slate-500 dark:text-slate-400 font-semibold font-sans">Último cambio de ruta: </span>
                                                   {(() => {
                                                     const lastHistory = cc.routeHistory && cc.routeHistory.length > 0
                                                       ? cc.routeHistory[cc.routeHistory.length - 1]
                                                       : null;
                                                     const rawDate = cc.rutaSetByAdminAt || lastHistory?.changedAt;
                                                     return rawDate ? (
                                                       <span className="text-slate-800 dark:text-slate-200 font-bold font-mono">
                                                         {fmtHoverDate(rawDate)}
                                                       </span>
                                                     ) : (
                                                       <span className="text-slate-500 italic font-medium font-sans">No registrado</span>
                                                     );
                                                   })()}
                                                 </div>

                                                 {/* Personal Profile updates */}
                                                 <div>
                                                   <span className="text-slate-500 dark:text-slate-400 font-semibold font-sans">Perfil actualizado: </span>
                                                   {(() => {
                                                     const profileDateRaw = cc.profileLastUpdatedAt || cc.updatedAt || cc.createdAt || null;
                                                     return profileDateRaw ? (
                                                       <span className="text-slate-800 dark:text-slate-200 font-bold font-mono">
                                                         {fmtHoverDate(profileDateRaw)}
                                                       </span>
                                                     ) : (
                                                       <span className="text-slate-500 italic font-medium font-sans">Sin cambios</span>
                                                     );
                                                   })()}
                                                 </div>

                                                 {/* Address updates */}
                                                 <div>
                                                   <span className="text-slate-500 dark:text-slate-400 font-semibold font-sans">Dirección actualizada: </span>
                                                   {(() => {
                                                     const latestAddressDateRaw = cc.addresses?.reduce((latest, addr) => {
                                                       const d = addr.updatedAt || addr.createdAt;
                                                       if (!d) return latest;
                                                       const dTime = new Date(d).getTime();
                                                       const latestTime = latest ? new Date(latest).getTime() : 0;
                                                       return dTime > latestTime ? d : latest;
                                                     }, null) || cc.defaultAddress?.updatedAt || cc.defaultAddress?.createdAt || null;
                                                     return latestAddressDateRaw ? (
                                                       <span className="text-slate-800 dark:text-slate-200 font-bold font-mono">
                                                         {fmtHoverDate(latestAddressDateRaw)}
                                                       </span>
                                                     ) : (
                                                       <span className="text-slate-500 italic font-medium font-sans">Sin cambios</span>
                                                     );
                                                   })()}
                                                 </div>

                                                 {/* Route History */}
                                                 <div className="pt-1 border-t border-slate-100 dark:border-slate-800/50">
                                                   <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 font-sans">Historial de Rutas</div>
                                                   {cc.routeHistory && cc.routeHistory.length > 0 ? (
                                                     <div className="space-y-1 max-h-[80px] overflow-y-auto pr-1 border-l border-slate-200 dark:border-slate-700 pl-2">
                                                       {cc.routeHistory.map((h, i) => (
                                                         <div key={i} className="text-[10px] flex items-center justify-between gap-1.5">
                                                           <span className="text-slate-700 dark:text-slate-300 truncate font-sans">
                                                             {h.previousRuta || 'Sin ruta'} → <span className="font-semibold text-emerald-600 dark:text-emerald-400">{h.newRuta}</span>
                                                           </span>
                                                           <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
                                                             {fmtHoverDate(h.changedAt)}
                                                           </span>
                                                         </div>
                                                       ))}
                                                     </div>
                                                   ) : (
                                                     <div className="text-[10px] text-slate-500 italic pl-2 border-l border-slate-100 dark:border-slate-800 font-medium font-sans">Sin cambios de ruta registrados</div>
                                                   )}
                                                 </div>

                                                 {/* Primary Address */}
                                                 <div className="pt-1 border-t border-slate-100 dark:border-slate-800 font-sans">
                                                   <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 font-sans">Dirección de Entrega</div>
                                                   {cc.defaultAddress && cc.defaultAddress.streetAddress ? (
                                                     <div className="bg-slate-50 dark:bg-slate-900/30 p-2 rounded border border-slate-100 dark:border-slate-800 text-[10px] space-y-0.5 font-sans">
                                                       <div className="font-semibold text-slate-700 dark:text-slate-300 truncate font-sans">{cc.defaultAddress.alias || 'Principal'}</div>
                                                       <div className="text-slate-800 dark:text-slate-200 leading-tight font-sans">{cc.defaultAddress.streetAddress}</div>
                                                       {cc.defaultAddress.details && <div className="text-slate-500 dark:text-slate-400 italic font-sans">{cc.defaultAddress.details}</div>}
                                                       <div className="text-slate-500 dark:text-slate-400 font-semibold mt-0.5 font-sans">
                                                         {[cc.defaultAddress.district, cc.defaultAddress.canton, cc.defaultAddress.province].filter(Boolean).join(', ')}
                                                       </div>
                                                     </div>
                                                   ) : (
                                                     <div className="text-[10px] text-slate-500 italic font-medium font-sans">Sin dirección de entrega registrada</div>
                                                   )}
                                                 </div>
                                               </div>
                                             </div>
                                           </TooltipContent>
                                         </Tooltip>
                                         </TooltipProvider>
                                       );
                                     })()}
                                    {/* Pre-alert badge — explains why unrelated manifest names appear under one customer */}
                                    {firstRow.matchSource === "pre_alert" && (
                                      <span
                                        title="Este cliente pre-alertó estos paquetes. La asignación es por pre-alerta (tracking registrado por el cliente), no por similitud de nombre."
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 shrink-0 select-none whitespace-nowrap"
                                      >
                                        Pre-alerta
                                      </span>
                                    )}
                                    {/* Divergent-match warning badge — clickable shortcut to unlink + rematch */}
                                    {divergentCount > 0 && (
                                      <button
                                        type="button"
                                        title={`${divergentCount} ${divergentCount === 1 ? "fila tiene" : "filas tienen"} nombre diferente al del cliente ("${groupDisplayName}"). Clic para desvincular y re-asignar automáticamente.`}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0 whitespace-nowrap cursor-pointer hover:bg-amber-500/25 transition-colors"
                                        onClick={() =>
                                          handleUnlinkAndRematch(
                                            divergentEntries.map(
                                              (e) => e.originalIdx,
                                            ),
                                            (idx) =>
                                              resultData.rows[idx]?.nombre ??
                                              "",
                                          )
                                        }
                                      >
                                        <AlertTriangle className="h-2.5 w-2.5" />
                                        {divergentCount} diferente
                                        {divergentCount !== 1 ? "s" : ""}
                                      </button>
                                    )}
                                    {/* Quick-approve button for fuzzy matches */}
                                    {(() => {
                                      const mo = matchOverrides[firstIdx];
                                      const hasMatch =
                                        !mo &&
                                        firstRow.nombreCliente &&
                                        firstRow.matchScore > 0 &&
                                        firstRow.matchScore < 1.0 &&
                                        !approvedMatches.has(firstIdx);
                                      const isApproved =
                                        approvedMatches.has(firstIdx);
                                      if (isApproved) return null;
                                      if (!hasMatch) return null;

                                      const isUnlinked = !effectiveSlCode || unlinkedRows.has(firstIdx);

                                      if (isUnlinked) {
                                        return (
                                          <span
                                            title={`Coincidencia no certera (${Math.round(firstRow.matchScore * 100)}%): No hay cliente vinculado. Asigne un cliente manualmente desde Acciones.`}
                                            className={cn(
                                              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-dashed shrink-0 select-none cursor-not-allowed opacity-75",
                                              firstRow.matchScore >= 0.9
                                                ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20 text-green-700/80 dark:text-green-400/80"
                                                : firstRow.matchScore >= 0.65
                                                  ? "border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20 text-yellow-700/80 dark:text-yellow-400/80"
                                                  : "border-red-500/50 bg-red-50/50 dark:bg-red-950/20 text-red-700/80 dark:text-red-400/80",
                                            )}
                                          >
                                            <ThumbsUp className="h-2.5 w-2.5" />
                                            {Math.round(
                                              firstRow.matchScore * 100,
                                            )}
                                            %
                                          </span>
                                        );
                                      }

                                      return (
                                        <button
                                          type="button"
                                          title={`Aprobar asociación: "${firstRow.nombre}" → ${firstRow.nombreCliente} (${Math.round(firstRow.matchScore * 100)}% confianza)`}
                                          onClick={async () => {
                                            await saveMatchFeedback({
                                              manifestName: firstRow.nombre,
                                              slCode: effectiveSlCode,
                                              fullName:
                                                firstRow.nombreCliente || "",
                                              ruta: effectiveRuta,
                                              consolidationEnabled:
                                                firstRow.consolidacion || false,
                                              source: "admin_pick",
                                            });
                                            setApprovedMatches(
                                              (prev) =>
                                                new Set([...prev, firstIdx]),
                                            );
                                          }}
                                          className={cn(
                                            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-dashed transition-colors cursor-pointer shrink-0",
                                            firstRow.matchScore >= 0.9
                                              ? "border-green-400/60 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                                              : firstRow.matchScore >= 0.65
                                                ? "border-yellow-400/60 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                                                : "border-red-400/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40",
                                          )}
                                        >
                                          <ThumbsUp className="h-2.5 w-2.5" />
                                          {Math.round(
                                            firstRow.matchScore * 100,
                                          )}
                                          %
                                        </button>
                                      );
                                    })()}
                                    {/* muted slCode badge (after name) or sin registro
                                        Temp customers (SL-NAN-…) get a red outline so the
                                        operator can spot them at a glance — these are
                                        records that haven't graduated to a permanent SL
                                        and may still need ID / contact info captured. */}
                                    {effectiveSlCode ? (
                                      <button
                                        type="button"
                                        title={
                                          effectiveSlCode
                                            .toUpperCase()
                                            .startsWith("SL-NAN-")
                                            ? "Cliente temporal — ver detalles"
                                            : "Ver detalles del cliente"
                                        }
                                        onClick={() =>
                                          setCustomerQuickView(effectiveSlCode)
                                        }
                                        className={cn(
                                          "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium shrink-0 transition-colors cursor-pointer",
                                          effectiveSlCode
                                            .toUpperCase()
                                            .startsWith("SL-NAN-")
                                            ? "bg-red-500/10 border border-red-500/60 text-red-700 dark:text-red-400 hover:bg-red-500/20"
                                            : approvedMatches.has(firstIdx)
                                              ? "bg-emerald-500/10 border border-dashed border-emerald-500/80 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 font-semibold"
                                              : "bg-muted border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40",
                                        )}
                                      >
                                        {approvedMatches.has(firstIdx) && (
                                          <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                                        )}
                                        {effectiveSlCode}
                                      </button>
                                    ) : (
                                      <span
                                        title="Sin cliente asociado — requiere asignación manual"
                                        className="relative inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-500/10 shrink-0 whitespace-nowrap select-none overflow-hidden"
                                      >
                                        {/* SVG Clockwise Marching Dashed Border */}
                                        <svg
                                          className="absolute inset-0 w-full h-full pointer-events-none rounded-[inherit]"
                                          xmlns="http://www.w3.org/2000/svg"
                                        >
                                          <rect
                                            x="0.75"
                                            y="0.75"
                                            width="calc(100% - 1.5px)"
                                            height="calc(100% - 1.5px)"
                                            rx="3"
                                            ry="3"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.2"
                                            className="text-red-500/80 animate-marching-ants"
                                          />
                                        </svg>
                                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                                        </span>
                                        sin registro
                                      </span>
                                    )}
                                    {/* Encomienda service badge — shown when customer has an encomienda service configured */}
                                    {cc?.encomiendaServiceName && (
                                      <span
                                        title={`Servicio de encomienda: ${resolveEncomienda(cc.encomiendaServiceName)}`}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border border-red-400/60 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 shrink-0 select-none whitespace-nowrap"
                                      >
                                        {resolveEncomienda(cc.encomiendaServiceName)}
                                      </span>
                                    )}
                                    {/* ── Acciones for unmatched rows (no slCode) — after name ── */}
                                    {!effectiveSlCode &&
                                      (() => {
                                        // ── Merge-with-twin detection ──────────────────────────────────
                                        // When the table contains ANOTHER group with the same
                                        // normalized customer name AND a real slCode, surface a
                                        // one-click "Fusionar con SL…" affordance. This skips the
                                        // CustomerSearchModal round-trip — operator already sees
                                        // the answer in the table. See `lib/nova/merge-groups.ts`.
                                        const mergeTarget =
                                          mergeTargetByGroupKey[groupKey];
                                        const sourceIdxs = entries.map(
                                          (e) => e.originalIdx,
                                        );
                                        const sourceWeight = entries.reduce(
                                          (s, e) => s + (e.row.peso ?? 0),
                                          0,
                                        );
                                        const sourcePrice = entries.reduce(
                                          (s, e) => {
                                            const tracking = String(e.row.tracking || '').toUpperCase();
                                            return s +
                                              (priceOverrides[tracking]
                                                ?.precio ??
                                                computedPrices[e.originalIdx] ??
                                                0);
                                          },
                                          0,
                                        );
                                        return (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                type="button"
                                                className="inline-flex items-center justify-center h-7 w-7 md:w-auto md:px-2.5 rounded-md text-[11px] font-semibold border border-border/70 bg-background text-foreground hover:bg-accent shadow-sm transition-colors shrink-0"
                                              >
                                                <span className="hidden md:inline-flex items-center gap-1.5 whitespace-nowrap">
                                                  Acciones{" "}
                                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                </span>
                                                <MoreHorizontal className="h-4 w-4 md:hidden text-muted-foreground" />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                              align="start"
                                              className="w-56 z-[70]"
                                            >
                                              {/* ── Merge with matched twin (one-click) ─────────────── */}
                                              {mergeTarget &&
                                                (() => {
                                                  // Sum peso + price for the target group so the modal
                                                  // can show the post-merge aggregate without re-grouping.
                                                  const targetEntries =
                                                    sortedGroups.find(
                                                      ([k]) =>
                                                        k ===
                                                        mergeTarget.groupKey,
                                                    )?.[1] ?? [];
                                                  const targetWeight =
                                                    targetEntries.reduce(
                                                      (s, e) =>
                                                        s + (e.row.peso ?? 0),
                                                      0,
                                                    );
                                                  const targetPrice =
                                                    targetEntries.reduce(
                                                      (s, e) => {
                                                        const tracking = String(e.row.tracking || '').toUpperCase();
                                                        return s +
                                                          (priceOverrides[
                                                            tracking
                                                          ]?.precio ??
                                                            computedPrices[
                                                            e.originalIdx
                                                            ] ??
                                                            0);
                                                      },
                                                      0,
                                                    );
                                                  // Detect any active invoice for the target slCode so the modal
                                                  // can warn the operator about post-merge invoice impact.
                                                  // Status comparison uses string cast: the persisted documents
                                                  // can hold values ('annulled', 'void') that the canonical
                                                  // InvoiceRecord union type doesn't enumerate but the runtime
                                                  // legitimately writes (see annulInvoicesByTrackingsAndManifest).
                                                  const targetInvoice =
                                                    persistedInvoices.find(
                                                      (inv) => {
                                                        const slMatch =
                                                          String(
                                                            inv.clientSlCode ||
                                                              inv.slCode ||
                                                              ""
                                                          ).toUpperCase() ===
                                                          String(mergeTarget.slCode).toUpperCase();
                                                        const status = String(
                                                          inv.status || "",
                                                        ).toLowerCase();
                                                        return (
                                                          slMatch &&
                                                          status !==
                                                          "annulled" &&
                                                          status !==
                                                          "cancelled" &&
                                                          status !== "void"
                                                        );
                                                      },
                                                    );
                                                  const invoiceImpact:
                                                    | MergeInvoiceImpact
                                                    | undefined = targetInvoice
                                                      ? {
                                                        invoiceNumber:
                                                          targetInvoice.invoiceNumber ||
                                                          targetInvoice.id ||
                                                          "",
                                                        status:
                                                          (targetInvoice.status ||
                                                            "draft") as MergeInvoiceImpact["status"],
                                                        totalAmount: Number(
                                                          targetInvoice.totalAmount ??
                                                          targetInvoice.amount ??
                                                          0,
                                                        ),
                                                      }
                                                      : undefined;
                                                  return (
                                                    <>
                                                      <DropdownMenuItem
                                                        onClick={() =>
                                                          setMergeConfirm({
                                                            sourceIdxs,
                                                            sourceCustomer:
                                                              firstRow.nombreCliente ||
                                                              firstRow.nombre,
                                                            sourceWeight,
                                                            sourcePrice,
                                                            sourceRuta:
                                                              effectiveRuta ||
                                                              "",
                                                            target: mergeTarget,
                                                            targetWeight,
                                                            targetPrice,
                                                            invoiceImpact,
                                                          })
                                                        }
                                                        className="text-emerald-700 dark:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                                                      >
                                                        <Link2 className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                                                        Fusionar con{" "}
                                                        {mergeTarget.slCode}
                                                      </DropdownMenuItem>
                                                      <DropdownMenuSeparator />
                                                    </>
                                                  );
                                                })()}
                                              {/* ── Revalidar grupo ───────────────────────────────────────
                                                Detects matched-vs-matched (or matched-vs-unmatched
                                                when the conservative `findMergeTarget` already fired)
                                                duplicates of THIS group that share the customer name.
                                                Clicking offers to merge with the top-ranked sibling
                                                (highest confidence + most rows). After confirm, the
                                                operator can re-revalidate to fold remaining siblings.
                                                Only renders when ≥1 sibling was found AND the merge-
                                                target item above DIDN'T already cover the case (so the
                                                operator never sees two adjacent merge actions). ── */}
                                              {(() => {
                                                const siblings =
                                                  groupSiblingsByGroupKey[
                                                  groupKey
                                                  ] ?? [];
                                                if (siblings.length === 0)
                                                  return null;
                                                if (
                                                  mergeTargetByGroupKey[
                                                  groupKey
                                                  ]
                                                )
                                                  return null; // already surfaced above
                                                const top = siblings[0];
                                                const targetEntries =
                                                  sortedGroups.find(
                                                    ([k]) =>
                                                      k ===
                                                      top.fingerprint.groupKey,
                                                  )?.[1] ?? [];
                                                const targetWeight =
                                                  targetEntries.reduce(
                                                    (s, e) =>
                                                      s + (e.row.peso ?? 0),
                                                    0,
                                                  );
                                                const targetPrice =
                                                  targetEntries.reduce(
                                                    (s, e) => {
                                                      const tracking = String(e.row.tracking || '').toUpperCase();
                                                      return s +
                                                        (priceOverrides[
                                                          tracking
                                                        ]?.precio ??
                                                          computedPrices[
                                                          e.originalIdx
                                                          ] ??
                                                          0);
                                                    },
                                                    0,
                                                  );
                                                const targetInvoice =
                                                  persistedInvoices.find(
                                                    (inv) => {
                                                      const slMatch =
                                                        String(inv.clientSlCode || inv.slCode || "").toUpperCase() ===
                                                        String(top.fingerprint.effectiveSlCode).toUpperCase();
                                                      const status = String(
                                                        inv.status || "",
                                                      ).toLowerCase();
                                                      return (
                                                        slMatch &&
                                                        status !== "annulled" &&
                                                        status !==
                                                        "cancelled" &&
                                                        status !== "void"
                                                      );
                                                    },
                                                  );
                                                const invoiceImpact:
                                                  | MergeInvoiceImpact
                                                  | undefined = targetInvoice
                                                    ? {
                                                      invoiceNumber:
                                                        targetInvoice.invoiceNumber ||
                                                        targetInvoice.id ||
                                                        "",
                                                      status:
                                                        (targetInvoice.status ||
                                                          "draft") as MergeInvoiceImpact["status"],
                                                      totalAmount: Number(
                                                        targetInvoice.totalAmount ??
                                                        targetInvoice.amount ??
                                                        0,
                                                      ),
                                                    }
                                                    : undefined;
                                                const siblingLabel =
                                                  top.fingerprint
                                                    .effectiveSlCode ||
                                                  `${top.fingerprint.effectiveCustomerName} (sin registro)`;
                                                const remaining =
                                                  siblings.length - 1;
                                                return (
                                                  <>
                                                    <DropdownMenuItem
                                                      onClick={() =>
                                                        setMergeConfirm({
                                                          sourceIdxs,
                                                          sourceCustomer:
                                                            firstRow.nombreCliente ||
                                                            firstRow.nombre,
                                                          sourceWeight,
                                                          sourcePrice,
                                                          sourceRuta:
                                                            effectiveRuta || "",
                                                          target: {
                                                            slCode:
                                                              top.fingerprint
                                                                .effectiveSlCode,
                                                            customerName:
                                                              top.fingerprint
                                                                .effectiveCustomerName,
                                                            ruta: top
                                                              .fingerprint
                                                              .effectiveRuta,
                                                            rowCount:
                                                              top.fingerprint
                                                                .rowCount,
                                                            groupKey:
                                                              top.fingerprint
                                                                .groupKey,
                                                            confidence:
                                                              top.confidence,
                                                          },
                                                          targetWeight,
                                                          targetPrice,
                                                          invoiceImpact,
                                                        })
                                                      }
                                                      className="text-cyan-700 dark:text-cyan-400 focus:bg-cyan-50 dark:focus:bg-cyan-950/30"
                                                      data-testid={`nova-revalidar-grupo-${groupKey}`}
                                                    >
                                                      <RefreshCw className="h-3.5 w-3.5 mr-2 text-cyan-500" />
                                                      Revalidar grupo
                                                      <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                                        → {siblingLabel}
                                                        {remaining > 0 &&
                                                          ` (+${remaining})`}
                                                      </span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                  </>
                                                );
                                              })()}
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setCreateCustomer({
                                                    nombre: firstRow.nombre,
                                                    rowIndex: firstIdx,
                                                    rowIndices: sourceIdxs,
                                                  })
                                                }
                                              >
                                                <UserPlus className="h-3.5 w-3.5 mr-2 text-primary" />
                                                Crear cliente
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setLinkMatch({
                                                    rowIndices: sourceIdxs,
                                                    nombre: firstRow.nombre,
                                                  })
                                                }
                                              >
                                                <Link2 className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                                Vincular cliente
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setUnlinkActionModal({
                                                    indices: sourceIdxs,
                                                    groupName: firstRow.nombre,
                                                  })
                                                }
                                                className="text-orange-700 dark:text-orange-400 focus:bg-orange-50 dark:focus:bg-orange-950/30"
                                              >
                                                <Unlink2 className="h-3.5 w-3.5 mr-2 text-orange-500" />
                                                Desvincular / Reagrupar
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        );
                                      })()}
                                    {/* ── Acciones dropdown next to customer name ── */}
                                    {effectiveSlCode &&
                                      (() => {
                                        const cc =
                                          customerContactMap.get(
                                            effectiveSlCode,
                                          );
                                        // Prefer the LIVE customer name from customers/{slCode}
                                        // (via subscribeCustomersBySlCodes onSnapshot) before
                                        // the manifest snapshot, so an "Editar cliente" rename
                                        // immediately propagates to invoice creation, label
                                        // printing and email recipients without a manifest reload.
                                        const clientName =
                                          matchOverrides[firstIdx]?.fullName ||
                                          cc?.fullName ||
                                          firstRow.nombreCliente ||
                                          firstRow.nombre;
                                        const buildOne = (
                                          rowList: (typeof entries)[0]["row"][],
                                          forceIndividualPricing = false,
                                        ): InvoiceRecord => {
                                          const isConsolidation =
                                            !forceIndividualPricing &&
                                            rowList.length > 1 &&
                                            !rowList.some((r) => r.permisos);
                                          const invoiceNumber =
                                            generateInvoiceNumber(
                                              effectiveSlCode,
                                              isConsolidation,
                                            );
                                          // ── Resolved rows pricing ─────────────────────────────────────
                                          // Leverages the pre-calculated resolvedRows as the single source
                                          // of truth, ensuring 100% mathematical consistency with Firestore.
                                          const getItemBilling = (
                                            r: (typeof rowList)[0],
                                          ) => {
                                            const rIdx = resultData.rows.indexOf(r);
                                            const tracking = String(r.tracking || '').toUpperCase();
                                            const resolvedRow = resolvedRows[rIdx];
                                            if (!resolvedRow) {
                                              return { billPeso: r.peso ?? 0, billPrice: 0 };
                                            }
                                            const hasOverride = priceOverrides[tracking]?.precio != null;

                                            // WEIGHT DISPLAY RULE (7 regressions prevented):
                                            //   ① Price override       → use override's explicit pesoRedondeo
                                            //   ② Consolidation        → proportional share of Math.ceil(propSumPeso)
                                            //   ③ Permiso (r.permisos) → pesoRedondeo (ceil kg)
                                            //   ④ Regular individual   → r.peso ONLY (real/actual weight)
                                            const billPeso = (isConsolidation || r.permisos || hasOverride)
                                              ? resolvedRow.pesoRedondeo
                                              : resolvedRow.peso;

                                            return {
                                              billPeso,
                                              billPrice: resolvedRow.precio,
                                            };
                                          };

                                          const totalUSD = rowList.reduce((s, r) => {
                                            const rIdx = resultData.rows.indexOf(r);
                                            return s + (resolvedRows[rIdx]?.precio ?? 0);
                                          }, 0);
                                          const terceroRow = effectiveSlCode
                                            ? terceroRows.get(
                                              effectiveSlCode.toUpperCase(),
                                            )
                                            : null;
                                          const terceroAmount =
                                            (terceroRow?.amount ?? 0) > 0
                                              ? terceroRow!.amount
                                              : 0;
                                          const totalUSDWithTercero =
                                            totalUSD + terceroAmount;
                                          const subtotalUSD = ivaEnabled
                                            ? Math.round(
                                              (totalUSDWithTercero / 1.13) *
                                              100,
                                            ) / 100
                                            : totalUSDWithTercero;
                                          const ivaUSD = ivaEnabled
                                            ? Math.round(
                                              (totalUSDWithTercero -
                                                subtotalUSD) *
                                              100,
                                            ) / 100
                                            : 0;
                                          const totalCRC =
                                            tc > 0
                                              ? Math.round(
                                                totalUSDWithTercero * tc,
                                              )
                                              : 0;
                                          return {
                                            id: invoiceNumber,
                                            userId: effectiveSlCode,
                                            clientId: effectiveSlCode,
                                            clientName,
                                            clientDni: cc?.dni || "",
                                            clientEmail: cc?.email || "",
                                            clientRoute:
                                              effectiveRuta ||
                                              "San José, Costa Rica",
                                            slCode: effectiveSlCode,
                                            invoiceNumber,
                                            isConsolidation,
                                            ivaEnabled,
                                            subtotal: subtotalUSD,
                                            // BUG-I-AUDIT-03 FIX: derive CRC breakdown from totalCRC
                                            // (matches invoice-service.ts formula) to prevent rounding
                                            // divergence between preview and persisted invoice.
                                            subtotalCRC: ivaEnabled
                                              ? (tc > 0 ? Math.round(totalCRC / 1.13) : 0)
                                              : totalCRC,
                                            iva: ivaUSD,
                                            ivaCRC: ivaEnabled
                                              ? (tc > 0 ? Math.round(totalCRC - Math.round(totalCRC / 1.13)) : 0)
                                              : 0,
                                            ivaRate: ivaEnabled ? 0.13 : 0,
                                            amount: totalUSDWithTercero,
                                            currency: "USD" as const,
                                            amountCRC: totalCRC,
                                            exchangeRate: tc,
                                            status: "pending" as const,
                                            items: [
                                              ...rowList.map((r) => {
                                                const {
                                                  billPeso,
                                                  billPrice: itemPrice,
                                                } = getItemBilling(r);
                                                const rIdxItem =
                                                  resultData.rows.indexOf(r);
                                                return {
                                                  tracking: r.tracking,
                                                  description: r.tracking || "",
                                                  weight: billPeso,
                                                  realWeight:
                                                    pesoOverrides[rIdxItem] ??
                                                    r.peso ??
                                                    0,
                                                  subtotal: ivaEnabled
                                                    ? Math.round(
                                                      (itemPrice / 1.13) *
                                                      100,
                                                    ) / 100
                                                    : itemPrice,
                                                  iva: ivaEnabled
                                                    ? Math.round(
                                                      (itemPrice -
                                                        Math.round(
                                                          (itemPrice / 1.13) *
                                                          100,
                                                        ) /
                                                        100) *
                                                      100,
                                                    ) / 100
                                                    : 0,
                                                  amount: itemPrice,
                                                  currency: "USD",
                                                };
                                              }),
                                              ...(terceroAmount > 0
                                                ? [
                                                  {
                                                    tracking: "",
                                                    description:
                                                      terceroRow!
                                                        .description ||
                                                      "Servicio de Terceros",
                                                    weight: 0,
                                                    subtotal: ivaEnabled
                                                      ? Math.round(
                                                        (terceroAmount /
                                                          1.13) *
                                                        100,
                                                      ) / 100
                                                      : terceroAmount,
                                                    iva: ivaEnabled
                                                      ? Math.round(
                                                        (terceroAmount -
                                                          Math.round(
                                                            (terceroAmount /
                                                              1.13) *
                                                            100,
                                                          ) /
                                                          100) *
                                                        100,
                                                      ) / 100
                                                      : 0,
                                                    amount: terceroAmount,
                                                    currency: "USD" as const,
                                                  },
                                                ]
                                                : []),
                                            ],
                                            ...(terceroAmount > 0
                                              ? {
                                                invoiceItems: [
                                                  ...rowList.map((r) => {
                                                    const {
                                                      billPeso,
                                                      billPrice: itemPrice,
                                                    } = getItemBilling(r);
                                                    const rIdxItem =
                                                      resultData.rows.indexOf(
                                                        r,
                                                      );
                                                    return {
                                                      description:
                                                        r.tracking || "",
                                                      trackingNumber:
                                                        r.tracking,
                                                      quantity: 1,
                                                      unitPrice: itemPrice,
                                                      totalPrice: itemPrice,
                                                      weight: billPeso,
                                                      realWeight:
                                                        pesoOverrides[
                                                        rIdxItem
                                                        ] ??
                                                        r.peso ??
                                                        0,
                                                      isManual: false,
                                                    };
                                                  }),
                                                  {
                                                    description:
                                                      terceroRow!
                                                        .description ||
                                                      "Servicio de Terceros",
                                                    trackingNumber: "",
                                                    quantity: 1,
                                                    unitPrice: terceroAmount,
                                                    totalPrice: terceroAmount,
                                                    weight: 0,
                                                    isManual: true,
                                                  },
                                                ],
                                              }
                                              : {}),
                                            packageCount: rowList.length,
                                            totalWeight: rowList.reduce(
                                              (s, r) =>
                                                s + getItemBilling(r).billPeso,
                                              0,
                                            ),
                                            notes: isConsolidation
                                              ? `Consolidada — ${rowList.length} paquetes`
                                              : rowList.length > 1
                                                ? `Factura única — ${rowList.length} paquetes`
                                                : `Paquete ${rowList[0].tracking}`,
                                            createdAt: new Date().toISOString(),
                                            updatedAt: new Date().toISOString(),
                                          };
                                        };
                                        const buildQueue =
                                          (): InvoiceRecord[] => {
                                            const grpSel = entries.filter((e) =>
                                              selectedRows.has(e.originalIdx),
                                            );
                                            const activeEntries =
                                              grpSel.length > 0
                                                ? grpSel
                                                : entries;
                                            if (mergedInvoices[groupKey])
                                              return [
                                                buildOne(
                                                  activeEntries.map(
                                                    (e) => e.row,
                                                  ),
                                                  true,
                                                ),
                                              ];
                                            if (!isEffectivelyConsolidated)
                                              return activeEntries.map((e) =>
                                                buildOne([e.row]),
                                              );
                                            const permisosRows = activeEntries
                                              .filter((e) => e.row.permisos)
                                              .map((e) => e.row);
                                            const normalRows = activeEntries
                                              .filter((e) => !e.row.permisos)
                                              .map((e) => e.row);
                                            const queue: InvoiceRecord[] = [];
                                            permisosRows.forEach((r) =>
                                              queue.push(buildOne([r])),
                                            );
                                            if (normalRows.length > 0)
                                              queue.push(buildOne(normalRows));
                                            if (queue.length === 0)
                                              queue.push(
                                                buildOne(
                                                  activeEntries.map(
                                                    (e) => e.row,
                                                  ),
                                                ),
                                              );
                                            return queue;
                                          };
                                        const queueSize = (() => {
                                          const ae =
                                            grpSelected.length > 0
                                              ? grpSelected
                                              : entries;
                                          if (mergedInvoices[groupKey])
                                            return 1;
                                          if (isEffectivelyConsolidated)
                                            return (
                                              ae.filter((e) => e.row.permisos)
                                                .length +
                                              (ae.some((e) => !e.row.permisos)
                                                ? 1
                                                : 0) || 1
                                            );
                                          return ae.length;
                                        })();
                                        return (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                type="button"
                                                className="inline-flex items-center justify-center h-7 w-7 md:w-auto md:px-2.5 rounded-md text-[11px] font-semibold border border-border/70 bg-background text-foreground hover:bg-accent shadow-sm transition-colors shrink-0"
                                              >
                                                <span className="hidden md:inline-flex items-center gap-1.5 whitespace-nowrap">
                                                  Acciones{" "}
                                                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                </span>
                                                <MoreHorizontal className="h-4 w-4 md:hidden text-muted-foreground" />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                              align="start"
                                              className="w-[510px] z-[70] p-1.5"
                                              onCloseAutoFocus={(e) => e.preventDefault()}
                                            >
                                              <div className="grid grid-cols-3 gap-x-0.5 divide-x divide-border/40">
                                                {/* ── Col 1: Cliente ── */}
                                                <div className="flex flex-col gap-0.5 pr-1">
                                                  <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                                                    Cliente
                                                  </p>
                                                  {effectiveSlCode && (
                                                    <>
                                                      <DropdownMenuItem
                                                        onClick={() => {
                                                          const sel = entries
                                                            .filter((e) =>
                                                              selectedRows.has(
                                                                e.originalIdx,
                                                              ),
                                                            )
                                                            .map(
                                                              (e) =>
                                                                e.originalIdx,
                                                            );
                                                          const targetIdxs =
                                                            sel.length > 0
                                                              ? sel
                                                              : entries.map(
                                                                (e) =>
                                                                  e.originalIdx,
                                                              );
                                                          setUnlinkActionModal({
                                                            indices: targetIdxs,
                                                            groupName:
                                                              clientName ||
                                                              groupKey,
                                                          });
                                                        }}
                                                      >
                                                        <Unlink2 className="h-3.5 w-3.5 mr-2 text-orange-500 shrink-0" />
                                                        Desvincular
                                                      </DropdownMenuItem>
                                                      {divergentCount > 0 && (
                                                        <DropdownMenuItem
                                                          onClick={() =>
                                                            handleUnlinkAndRematch(
                                                              divergentEntries.map(
                                                                (e) =>
                                                                  e.originalIdx,
                                                              ),
                                                              (idx) =>
                                                                resultData.rows[
                                                                  idx
                                                                ]?.nombre ?? "",
                                                            )
                                                          }
                                                          className="text-amber-700 dark:text-amber-400 focus:bg-amber-50 dark:focus:bg-amber-950/30"
                                                        >
                                                          <AlertTriangle className="h-3.5 w-3.5 mr-2 text-amber-500 shrink-0" />
                                                          Desvincular
                                                          divergentes (
                                                          {divergentCount})
                                                        </DropdownMenuItem>
                                                      )}
                                                      <DropdownMenuSeparator />
                                                      <DropdownMenuItem
                                                        onClick={() =>
                                                          setLinkMatch({
                                                            rowIndices:
                                                              entries.map(
                                                                (e) =>
                                                                  e.originalIdx,
                                                              ),
                                                            nombre:
                                                              firstRow.nombre,
                                                          })
                                                        }
                                                      >
                                                        <Link2 className="h-3.5 w-3.5 mr-2 text-blue-500 shrink-0" />
                                                        Vincular a otro cliente
                                                      </DropdownMenuItem>
                                                    </>
                                                  )}
                                                  {/* ── Revalidar grupo (matched) ─────────────────────────────
                                                    Same logic as the unmatched-dropdown variant: when this
                                                    matched group has a sibling group elsewhere in the table
                                                    sharing the customer name (≥0.85 fuzzy similarity), offer
                                                    a one-click merge with the top-ranked sibling. Covers the
                                                    matched-vs-matched duplicate case (BUG-REVALIDAR-GRUPO
                                                    2026-04-29) where save/reload split a customer into
                                                    multiple groups under different slCodes. ── */}
                                                  {(() => {
                                                    const siblings =
                                                      groupSiblingsByGroupKey[
                                                      groupKey
                                                      ] ?? [];
                                                    if (siblings.length === 0)
                                                      return null;
                                                    const sourceIdxs =
                                                      entries.map(
                                                        (e) => e.originalIdx,
                                                      );
                                                    const sourceWeight =
                                                      entries.reduce(
                                                        (s, e) =>
                                                          s + (e.row.peso ?? 0),
                                                        0,
                                                      );
                                                    const sourcePrice =
                                                      entries.reduce(
                                                        (s, e) =>
                                                          s +
                                                          (priceOverrides[
                                                            e.originalIdx
                                                          ]?.precio ??
                                                            computedPrices[
                                                            e.originalIdx
                                                            ] ??
                                                            0),
                                                        0,
                                                      );
                                                    const top = siblings[0];
                                                    const targetEntries =
                                                      sortedGroups.find(
                                                        ([k]) =>
                                                          k ===
                                                          top.fingerprint
                                                            .groupKey,
                                                      )?.[1] ?? [];
                                                    const targetWeight =
                                                      targetEntries.reduce(
                                                        (s, e) =>
                                                          s + (e.row.peso ?? 0),
                                                        0,
                                                      );
                                                    const targetPrice =
                                                      targetEntries.reduce(
                                                        (s, e) =>
                                                          s +
                                                          (priceOverrides[
                                                            e.originalIdx
                                                          ]?.precio ??
                                                            computedPrices[
                                                            e.originalIdx
                                                            ] ??
                                                            0),
                                                        0,
                                                      );
                                                    const targetInvoice =
                                                      persistedInvoices.find(
                                                        (inv) => {
                                                          const slMatch =
                                                            String(inv.clientSlCode || inv.slCode || "").toUpperCase() ===
                                                            String(top.fingerprint.effectiveSlCode).toUpperCase();
                                                          const status = String(
                                                            inv.status || "",
                                                          ).toLowerCase();
                                                          return (
                                                            slMatch &&
                                                            status !==
                                                            "annulled" &&
                                                            status !==
                                                            "cancelled" &&
                                                            status !== "void"
                                                          );
                                                        },
                                                      );
                                                    const invoiceImpact:
                                                      | MergeInvoiceImpact
                                                      | undefined =
                                                      targetInvoice
                                                        ? {
                                                          invoiceNumber:
                                                            targetInvoice.invoiceNumber ||
                                                            targetInvoice.id ||
                                                            "",
                                                          status:
                                                            (targetInvoice.status ||
                                                              "draft") as MergeInvoiceImpact["status"],
                                                          totalAmount: Number(
                                                            targetInvoice.totalAmount ??
                                                            targetInvoice.amount ??
                                                            0,
                                                          ),
                                                        }
                                                        : undefined;
                                                    const siblingLabel =
                                                      top.fingerprint
                                                        .effectiveSlCode ||
                                                      `${top.fingerprint.effectiveCustomerName} (sin registro)`;
                                                    const remaining =
                                                      siblings.length - 1;
                                                    return (
                                                      <DropdownMenuItem
                                                        onClick={() =>
                                                          setMergeConfirm({
                                                            sourceIdxs,
                                                            sourceCustomer:
                                                              clientName ||
                                                              firstRow.nombreCliente ||
                                                              firstRow.nombre,
                                                            sourceWeight,
                                                            sourcePrice,
                                                            sourceRuta:
                                                              effectiveRuta ||
                                                              "",
                                                            target: {
                                                              slCode:
                                                                top.fingerprint
                                                                  .effectiveSlCode,
                                                              customerName:
                                                                top.fingerprint
                                                                  .effectiveCustomerName,
                                                              ruta: top
                                                                .fingerprint
                                                                .effectiveRuta,
                                                              rowCount:
                                                                top.fingerprint
                                                                  .rowCount,
                                                              groupKey:
                                                                top.fingerprint
                                                                  .groupKey,
                                                              confidence:
                                                                top.confidence,
                                                            },
                                                            targetWeight,
                                                            targetPrice,
                                                            invoiceImpact,
                                                          })
                                                        }
                                                        className="text-cyan-700 dark:text-cyan-400 focus:bg-cyan-50 dark:focus:bg-cyan-950/30"
                                                        data-testid={`nova-revalidar-grupo-matched-${groupKey}`}
                                                      >
                                                        <RefreshCw className="h-3.5 w-3.5 mr-2 text-cyan-500 shrink-0" />
                                                        Revalidar grupo
                                                        <span className="ml-auto text-[9px] font-mono text-muted-foreground">
                                                          → {siblingLabel}
                                                          {remaining > 0 &&
                                                            ` (+${remaining})`}
                                                        </span>
                                                      </DropdownMenuItem>
                                                    );
                                                  })()}
                                                </div>

                                                {/* ── Col 3: Facturación ── */}
                                                <div className="flex flex-col gap-0.5 px-1">
                                                  <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                                                    Facturación
                                                  </p>
                                                  <DropdownMenuItem
                                                    disabled={
                                                      entries.length <= 1
                                                    }
                                                    onClick={() => {
                                                      operatorModeOverrides.current.add(
                                                        groupKey,
                                                      );
                                                      const turningOn =
                                                        !separateInvoices[
                                                        groupKey
                                                        ];
                                                      setSeparateInvoices(
                                                        (prev) => ({
                                                          ...prev,
                                                          [groupKey]: turningOn,
                                                        }),
                                                      );
                                                      if (
                                                        turningOn &&
                                                        mergedInvoices[groupKey]
                                                      ) {
                                                        setMergedInvoices(
                                                          (prev) => ({
                                                            ...prev,
                                                            [groupKey]: false,
                                                          }),
                                                        );
                                                      }
                                                      if (!turningOn) {
                                                        setPriceOverrides(
                                                          (prev) => {
                                                            const next = {
                                                              ...prev,
                                                            };
                                                            entries.forEach(
                                                              ({
                                                                originalIdx:
                                                                idx,
                                                              }) => {
                                                                delete next[
                                                                  idx
                                                                ];
                                                              },
                                                            );
                                                            return next;
                                                          },
                                                        );
                                                      }
                                                    }}
                                                  >
                                                    <span
                                                      className={cn(
                                                        "inline-block w-3.5 h-3.5 rounded border mr-2 shrink-0 transition-colors",
                                                        isEffectivelyConsolidated
                                                          ? "bg-sky-500 border-sky-600"
                                                          : "bg-transparent border-border",
                                                      )}
                                                    />
                                                    {isEffectivelyConsolidated
                                                      ? "Consolid. activa"
                                                      : "Consolidar"}
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    disabled={
                                                      entries.length <= 1 ||
                                                      isEffectivelyConsolidated
                                                    }
                                                    onClick={() => {
                                                      operatorModeOverrides.current.add(
                                                        groupKey,
                                                      );
                                                      const turningOn =
                                                        !mergedInvoices[
                                                        groupKey
                                                        ];
                                                      setMergedInvoices(
                                                        (prev) => ({
                                                          ...prev,
                                                          [groupKey]: turningOn,
                                                        }),
                                                      );
                                                      if (
                                                        turningOn &&
                                                        separateInvoices[
                                                        groupKey
                                                        ]
                                                      ) {
                                                        setSeparateInvoices(
                                                          (prev) => ({
                                                            ...prev,
                                                            [groupKey]: false,
                                                          }),
                                                        );
                                                      }
                                                    }}
                                                  >
                                                    <span
                                                      className={cn(
                                                        "inline-block w-3.5 h-3.5 rounded border mr-2 shrink-0 transition-colors",
                                                        mergedInvoices[groupKey]
                                                          ? "bg-violet-500 border-violet-600"
                                                          : "bg-transparent border-border",
                                                      )}
                                                    />
                                                    Fact. única
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() => {
                                                      const sel =
                                                        entries.filter((e) =>
                                                          selectedRows.has(
                                                            e.originalIdx,
                                                          ),
                                                        );
                                                      const targetIdxs =
                                                        sel.length > 0
                                                          ? sel.map(
                                                            (e) =>
                                                              e.originalIdx,
                                                          )
                                                          : entries.map(
                                                            (e) =>
                                                              e.originalIdx,
                                                          );
                                                      setPriceAdjustModal({
                                                        customerName:
                                                          clientName,
                                                        rowIndices: targetIdxs,
                                                      });
                                                    }}
                                                  >
                                                    <SlidersHorizontal
                                                      className={cn(
                                                        "h-3.5 w-3.5 mr-2 shrink-0",
                                                        entries.some((e) => {
                                                          const tracking = e.row.tracking?.toUpperCase();
                                                          return tracking && priceAdjustments[tracking];
                                                        })
                                                          ? "text-violet-500"
                                                          : "text-amber-500",
                                                      )}
                                                    />
                                                    Ajustar precio
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    onClick={() => {
                                                      const upperSl = effectiveSlCode.toUpperCase();
                                                      if (!terceroRows.has(upperSl)) {
                                                        setTerceroRows((prev) => {
                                                          const next = new Map(prev);
                                                          const id = buildTerceroId(resultData.manifestNumber, effectiveSlCode);
                                                          next.set(upperSl, {
                                                            id,
                                                            manifestNumber: resultData.manifestNumber,
                                                            slCode: upperSl,
                                                            customerName: clientName,
                                                            description: "",
                                                            amount: 0,
                                                            savedAt: new Date().toISOString(),
                                                            updatedAt: new Date().toISOString(),
                                                          });
                                                          return next;
                                                        });
                                                        createTerceroRow({
                                                          manifestNumber:
                                                            resultData.manifestNumber,
                                                          slCode:
                                                            effectiveSlCode,
                                                          customerName:
                                                            clientName,
                                                        }).catch((err) => {
                                                          console.error("Error creating tercero row:", err);
                                                          setTerceroRows((prev) => {
                                                            const next = new Map(prev);
                                                            next.delete(upperSl);
                                                            return next;
                                                          });
                                                        });
                                                      }
                                                    }}
                                                  >
                                                    <DollarSign className="h-3.5 w-3.5 mr-2 text-orange-500 shrink-0" />
                                                    Serv. de Terceros
                                                  </DropdownMenuItem>
                                                  <DropdownMenuItem
                                                    className="text-amber-700 dark:text-amber-400 focus:bg-amber-50 dark:focus:bg-amber-950/30"
                                                    onClick={() => handleRevalidateGroupCalculations(groupKey, entries)}
                                                  >
                                                    <RefreshCw className="h-3.5 w-3.5 mr-2 text-amber-500 shrink-0" />
                                                    Revalidar cálculos
                                                  </DropdownMenuItem>
                                                </div>

                                                {/* ── Col 4: Comprobantes ── */}
                                                <div className="flex flex-col gap-0.5 pl-1">
                                                  <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                                                    Comprobantes
                                                  </p>
                                                  {/* ── Re-generar factura ───────────────────────────────────
                                                    Per-group regenerate. Annuls every existing invoice that
                                                    contains any of this group's trackings (regardless of
                                                    its slCode prefix — covers Encomiendas-/BB-/M-/SR- legacy
                                                    invoices created when the row was unmatched), deletes
                                                    leftover drafts, and creates a fresh invoice using the
                                                    CURRENT resolved slCode + name. The new invoice number
                                                    therefore carries the right prefix (temp customer
                                                    SL-MAN-xxxxx, real customer SL-xxxx, etc.). Paid
                                                    invoices are preserved by `annulInvoicesByTrackingsAndManifest`. */}
                                                  <DropdownMenuItem
                                                    onClick={async () => {
                                                      const targetIdxs =
                                                        entries.map(
                                                          (e) => e.originalIdx,
                                                        );
                                                      const groupSl = String(effectiveSlCode || "").toUpperCase();
                                                      const hasPaidInvoice = persistedInvoices.some((inv) => {
                                                        const status = String(inv.status || "").toLowerCase();
                                                        if (status !== "paid") return false;
                                                        const invSl = String(inv.clientSlCode || inv.slCode || "").toUpperCase();
                                                        return invSl === groupSl;
                                                      });

                                                      if (hasPaidInvoice) {
                                                        setPaidInvoiceRegenTarget({
                                                          groupKey,
                                                          clientName: clientName || effectiveSlCode,
                                                          targetIdxs,
                                                        });
                                                      } else {
                                                        const res =
                                                          await handleRegenerateGroupInvoice(
                                                            targetIdxs,
                                                          );
                                                        if (res.created > 0) {
                                                          setIngestDone(
                                                            `Re-generadas ${res.created} factura${res.created !== 1 ? "s" : ""} para ${clientName || effectiveSlCode}${res.annulled > 0 ? ` · anuladas ${res.annulled}` : ""}`,
                                                          );
                                                        } else if (
                                                          res.errors > 0
                                                        ) {
                                                          setIngestError(
                                                            `No se pudieron re-generar facturas para ${clientName || effectiveSlCode}`,
                                                          );
                                                        } else if (
                                                          res.skipped.length > 0
                                                        ) {
                                                          // AI GUARD blocked recreation — surface
                                                          // the protected status (paid/sent/overdue/
                                                          // pending) so the operator knows why.
                                                          const statuses = Array.from(
                                                            new Set(
                                                              res.skipped.flatMap(
                                                                (s) => s.statuses,
                                                              ),
                                                            ),
                                                          ).join(", ");
                                                          const invNums = res.skipped
                                                            .flatMap((s) => s.invoiceNumbers)
                                                            .filter(Boolean)
                                                            .join(", ");
                                                          const trackings = Array.from(
                                                            new Set(
                                                              res.skipped.flatMap(
                                                                (s) => s.trackings || [],
                                                              ),
                                                            ),
                                                          ).filter(Boolean).join(", ");
                                                          setIngestError(
                                                            `No se re-generó: ya existe factura ${statuses}${invNums ? ` (${invNums})` : ""}${trackings ? ` asociada a trackings: ${trackings}` : ""}. Anúlala primero o usa "Anular y re-crear".`,
                                                          );
                                                        }
                                                      }
                                                    }}
                                                    className="text-violet-700 dark:text-violet-400 focus:bg-violet-50 dark:focus:bg-violet-950/30"
                                                    data-testid={`nova-regenerar-factura-${groupKey}`}
                                                  >
                                                    <RefreshCw className="h-3.5 w-3.5 mr-2 text-violet-500 shrink-0" />
                                                    Re-generar factura
                                                  </DropdownMenuItem>
                                                  {cc?.email && (
                                                    <DropdownMenuItem
                                                      onClick={() => {
                                                        const queue =
                                                          buildQueue();
                                                        if (
                                                          queue.length === 1
                                                        ) {
                                                          setSendReceiptInvoice(
                                                            queue[0],
                                                          );
                                                        } else {
                                                          setInvoiceWizard({
                                                            queue,
                                                            index: 0,
                                                            withSend: true,
                                                          });
                                                        }
                                                      }}
                                                    >
                                                      <Mail className="h-3.5 w-3.5 mr-2 text-emerald-500 shrink-0" />
                                                      Enviar recibo
                                                    </DropdownMenuItem>
                                                  )}
                                                </div>
                                              </div>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        );
                                      })()}
                                  </div>
                                </div>
                              </td>
                              {/* Peso — group sum */}
                              <td
                                className={cn(
                                  "px-3 py-1 tabular-nums text-right text-xs border-t",
                                  rOpt
                                    ? rOpt.borderTFaint
                                    : "border-t-slate-400/30 dark:border-t-slate-500/20",
                                )}
                              >
                                <span
                                  className={cn(
                                    "font-bold",
                                    isEffectivelyConsolidated
                                      ? "text-sky-600 dark:text-sky-400"
                                      : rOpt
                                        ? rOpt.text
                                        : "text-foreground/70",
                                  )}
                                >
                                  {grpSumPeso.toFixed(2)}
                                </span>
                              </td>
                              {/* P.Redondeo — ceil(sum) only when consolidated */}
                              <td
                                className={cn(
                                  "px-3 py-1 tabular-nums text-right text-xs border-t",
                                  rOpt
                                    ? rOpt.borderTFaint
                                    : "border-t-slate-400/30 dark:border-t-slate-500/20",
                                )}
                              >
                                {isEffectivelyConsolidated ? (
                                  <span className="font-bold text-sky-600 dark:text-sky-400">
                                    {grpSumPesoRedondeo.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-foreground/40">—</span>
                                )}
                              </td>
                              {/* Precio Final — group subtotal (consolidated uses ceil(sumPeso) price) */}
                              <td
                                className={cn(
                                  "px-3 py-1.5 text-right whitespace-nowrap border-t",
                                  rOpt
                                    ? rOpt.borderTFaint
                                    : "border-t-slate-400/30 dark:border-t-slate-500/20",
                                )}
                              >
                                {effectiveSlCode && (
                                  <span
                                    className={cn(
                                      "text-[12px] font-semibold tabular-nums",
                                      isEffectivelyConsolidated
                                        ? "text-sky-600 dark:text-sky-400"
                                        : "text-foreground",
                                    )}
                                  >
                                    ${(consolidatedHeaderTotal + terceroAmount).toFixed(2)}
                                  </span>
                                )}
                              </td>
                              {/* ₡ Colones — group colones */}
                              <td
                                className={cn(
                                  "px-3 py-1.5 text-right whitespace-nowrap border-t",
                                  rOpt
                                    ? rOpt.borderTFaint
                                    : "border-t-slate-400/30 dark:border-t-slate-500/20",
                                )}
                              >
                                {effectiveSlCode && tc > 0 && (
                                  <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                                    ₡
                                    {Math.round(
                                      (consolidatedHeaderTotal + terceroAmount) * tc,
                                    ).toLocaleString("es-CR")}
                                  </span>
                                )}
                              </td>
                              {/* Descripción — package count + invoice badge + Consolida */}
                              <td className="px-3 py-1.5">
                                {effectiveSlCode && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                                      {grpSelected.length > 0 ? (
                                        <>
                                          <span className="font-medium text-foreground">
                                            {grpSelected.length}
                                          </span>
                                          <span className="text-muted-foreground/60">
                                            /{entries.length}
                                          </span>
                                        </>
                                      ) : (
                                        entries.length
                                      )}{" "}
                                      paq.
                                    </span>
                                    {entries.length > 1 && (
                                      <span
                                        className={cn(
                                          "inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap",
                                          isEffectivelyConsolidated
                                            ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                            : mergedInvoices[groupKey]
                                              ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/25"
                                              : "bg-muted border border-border/60 text-muted-foreground",
                                        )}
                                      >
                                        {grpQueueSize} fact.
                                      </span>
                                    )}
                                    {isEffectivelyConsolidated && (
                                      <span
                                        title="Consolidación activa: precio ceil(sumPeso) × tarifa"
                                        className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25"
                                      >
                                        C
                                      </span>
                                    )}
                                    {entries.some((e) => (pesoOverrides[e.originalIdx] ?? e.row.peso ?? 0) === 0) && (
                                      <span
                                        title="Revisa el procedimiento aduanal: este paquete puede que esté retenido en aduana."
                                        className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25 cursor-help"
                                      >
                                        DUA
                                      </span>
                                    )}
                                    {/* ── Group-level invoice badge ────────────────────────────
                                      Renders a SINGLE invoice pill in the group header for any
                                      whole-group invoice — both consolidación (ceiling pricing)
                                      and factura-única / merged-single (one invoice with all
                                      trackings, individual pricing). Without the merged-single
                                      branch the badge only fired for consolidación, so an
                                      operator with a "Factura única" group saw the same
                                      invoice repeated on every child row — high cognitive load
                                      (BUG-MERGED-PER-ROW-BADGES 2026-04-29). The per-row badge
                                      now suppresses itself when its invoice is THIS groupInv,
                                      so the header is the single source of truth. ────────── */}
                                    {(() => {
                                      // ── Defensive gate ─────────────────────────────────────
                                      // The original gate was state-only:
                                      //   (isEffectivelyConsolidated || mergedInvoices[groupKey])
                                      // which silently failed for Firestore-loaded manifests
                                      // when the inferring effect's `slCode` casing didn't match
                                      // `groupKey`'s uppercased form. We now ALSO unconditionally
                                      // attempt to resolve a whole-group invoice — if one exists
                                      // for this slCode (consolidación or factura-única), we
                                      // surface it in the header regardless of the toggle state.
                                      const groupSl = (
                                        effectiveSlCode || ""
                                      ).toUpperCase();
                                      if (!groupSl) return null;
                                      const isMergedCandidate = (
                                        inv: InvoiceRecord,
                                      ): boolean => {
                                        if (
                                          String(inv.clientSlCode || inv.slCode || "").toUpperCase() !== groupSl
                                        )
                                          return false;
                                        const status = String(
                                          inv.status || "",
                                        ).toLowerCase();
                                        if (
                                          status === "annulled" ||
                                          status === "cancelled" ||
                                          status === "void"
                                        )
                                          return false;
                                        // Direct flags first, then fallback to tracking-count heuristic
                                        // (multi-tracking, non-consolidation invoice for this slCode
                                        // is the canonical "factura única" shape).
                                        if (inv.isMergedSingle === true)
                                          return true;
                                        if (isConsolidatedInvoice(inv))
                                          return false;
                                        const single = (inv.trackingNumber ??
                                          "") as string;
                                        const multi = Array.isArray(
                                          inv.trackingNumbers,
                                        )
                                          ? (inv.trackingNumbers as string[])
                                          : [];
                                        const all = [
                                          ...(single ? [single] : []),
                                          ...multi,
                                        ].filter(Boolean);
                                        return all.length > 1;
                                      };
                                      const groupInv =
                                        createdInvoices.find(
                                          (inv) =>
                                            inv.isConsolidation &&
                                            (inv.slCode || "").toUpperCase() ===
                                            groupSl,
                                        ) ??
                                        persistedInvoices.find(
                                          (inv) => {
                                            const status = String(inv.status || "").toLowerCase();
                                            if (status === "annulled" || status === "cancelled" || status === "void")
                                              return false;
                                            return isConsolidatedInvoice(inv) &&
                                              String(inv.clientSlCode || inv.slCode || "").toUpperCase() === groupSl;
                                          }
                                        ) ??
                                        createdInvoices.find(
                                          isMergedCandidate,
                                        ) ??
                                        persistedInvoices.find(
                                          isMergedCandidate,
                                        );
                                      if (!groupInv) return null;
                                      const label =
                                        groupInv.isMergedSingle ||
                                          !isConsolidatedInvoice(groupInv)
                                          ? "Factura única"
                                          : "Factura consolidada";
                                      const enrichInv = (
                                        inv: InvoiceRecord,
                                      ): InvoiceRecord => {
                                        const pesoMap = new Map(
                                          resultData.rows.map((r) => [
                                            r.tracking?.toUpperCase(),
                                            r.peso ?? 0,
                                          ]),
                                        );
                                        const enrich = (arr: any[]) =>
                                          arr.map((i) => {
                                            const t = (
                                              i.trackingNumber ||
                                              i.tracking ||
                                              ""
                                            ).toUpperCase();
                                            const rp = t
                                              ? pesoMap.get(t)
                                              : undefined;
                                            return rp != null
                                              ? { ...i, realWeight: rp }
                                              : i;
                                          });
                                        return {
                                          ...inv,
                                          items: inv.items
                                            ? enrich(inv.items)
                                            : inv.items,
                                          ...((inv as any).invoiceItems
                                            ? {
                                              invoiceItems: enrich(
                                                (inv as any).invoiceItems,
                                              ),
                                            }
                                            : {}),
                                        };
                                      };
                                      return (
                                        <span className="inline-flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            title={`Ver ${label.toLowerCase()}: ${groupInv.invoiceNumber}`}
                                            onClick={() =>
                                              setPreviewInvoice(
                                                enrichInv(groupInv),
                                              )
                                            }
                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer whitespace-nowrap"
                                          >
                                            <FileText className="h-2.5 w-2.5 shrink-0" />
                                            {label}
                                          </button>
                                          {/* ── Delete corrupted consolidated invoice ───────────
                                            Same affordance as the per-row badge — drops the
                                            invoice from Firestore so "Actualizar BD" can
                                            regenerate it from the (corrected) manifest. */}
                                          <button
                                            type="button"
                                            title={`Eliminar ${label.toLowerCase()} ${groupInv.invoiceNumber} (corrupta)`}
                                            aria-label={`Eliminar ${label.toLowerCase()} corrupta ${groupInv.invoiceNumber}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!groupInv.id) return;
                                              setDeleteInvoiceTarget({
                                                invoiceId: groupInv.id,
                                                invoiceNumber:
                                                  groupInv.invoiceNumber ||
                                                  groupInv.id,
                                                clientName:
                                                  groupInv.clientName || "",
                                                clientSlCode:
                                                  String(groupInv.clientSlCode || groupInv.slCode || ""),
                                                status: String(
                                                  groupInv.status || "draft",
                                                ),
                                                totalAmount: Number(
                                                  groupInv.totalAmount ??
                                                  groupInv.amount ??
                                                  0,
                                                ),
                                                manifestNumber:
                                                  groupInv.manifestNumber,
                                              });
                                            }}
                                            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded text-red-500/70 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                                          >
                                            <X
                                              className="h-2.5 w-2.5"
                                              aria-hidden="true"
                                            />
                                          </button>
                                        </span>
                                      );
                                    })()}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null;

                          // ── Group-level merged invoice id ─────────────────────────
                          // Pre-compute the id of the SINGLE-invoice-for-the-whole-group
                          // (consolidated OR merged-single) so each child-row badge
                          // can skip itself when its only invoice is THIS one. Without
                          // this guard the operator sees the same invoice number
                          // repeated on every child row even though the header
                          // already shows it (BUG-MERGED-PER-ROW-BADGES 2026-04-29).
                          const groupSlUpper = (
                            effectiveSlCode || ""
                          ).toUpperCase();
                          const groupHeaderInv: InvoiceRecord | undefined =
                            groupSlUpper
                              ? (createdInvoices.find(
                                (inv) =>
                                  inv.isConsolidation &&
                                  (inv.slCode || "").toUpperCase() ===
                                  groupSlUpper,
                              ) ??
                                persistedInvoices.find(
                                  (inv) => {
                                    const status = String(inv.status || "").toLowerCase();
                                    if (status === "annulled" || status === "cancelled" || status === "void")
                                      return false;
                                    return isConsolidatedInvoice(inv) &&
                                      String(inv.clientSlCode || inv.slCode || "").toUpperCase() === groupSlUpper;
                                  }
                                ) ??
                                createdInvoices.find((inv) => {
                                  if (
                                    String(inv.slCode || "").toUpperCase() !== groupSlUpper
                                  )
                                    return false;
                                  if (
                                    inv.isConsolidation ||
                                    isConsolidatedInvoice(inv)
                                  )
                                    return false;
                                  if (inv.isMergedSingle === true) return true;
                                  const all = [
                                    ...(inv.trackingNumber
                                      ? [inv.trackingNumber]
                                      : []),
                                    ...(inv.trackingNumbers || []),
                                  ].filter(Boolean);
                                  return all.length > 1;
                                }) ??
                                persistedInvoices.find((inv) => {
                                  if (
                                    String(inv.clientSlCode || inv.slCode || "").toUpperCase() !== groupSlUpper
                                  )
                                    return false;
                                  const status = String(
                                    inv.status || "",
                                  ).toLowerCase();
                                  if (
                                    status === "annulled" ||
                                    status === "cancelled" ||
                                    status === "void"
                                  )
                                    return false;
                                  if (isConsolidatedInvoice(inv)) return false;
                                  if (inv.isMergedSingle === true) return true;
                                  const all = [
                                    ...(inv.trackingNumber
                                      ? [inv.trackingNumber]
                                      : []),
                                    ...(inv.trackingNumbers || []),
                                  ].filter(Boolean);
                                  return all.length > 1;
                                }))
                              : undefined;
                          const groupHeaderInvId = groupHeaderInv?.id;

                          // Package rows
                          entries.forEach(
                            ({ row, originalIdx: oIdx }, entryIdx) => {
                              globalRowNum++;
                              const rowNum = globalRowNum;
                              const isRowSelected = selectedRows.has(oIdx);
                              jsx.push(
                                // `group` enables hover-only reveal of per-row
                                // actions (e.g. the Eliminar fila trash button) so
                                // they don't clutter the table at rest.
                                <tr
                                  key={`row-${oIdx}`}
                                  className={cn(
                                    "animate-table-row-fade-in group border-b border-b-border/30 hover:bg-accent/20 transition-colors text-[11px] border-l-2",
                                    rOpt
                                      ? rOpt.bgFaint
                                      : "bg-slate-100/10 dark:bg-slate-700/5",
                                    rOpt
                                      ? rOpt.borderL
                                      : "border-l-slate-400 dark:border-l-slate-500",
                                    entryIdx === 0 &&
                                    "border-t border-t-border/30",
                                    row.permisos && "bg-amber-500/5",
                                    isRowSelected && "bg-primary/5",
                                  )}
                                >
                                  <td className="px-1 py-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap text-center">
                                    {rowNum}
                                  </td>
                                  {/* Ruta column — always visible, click to change route for whole group */}
                                  <td className="px-2 py-1 whitespace-nowrap">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          title="Cambiar ruta del grupo"
                                          className="focus:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                                        >
                                          {effectiveRuta && rOpt ? (
                                            <span
                                              className={cn(
                                                "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 cursor-pointer hover:opacity-70 transition-opacity",
                                                rOpt.bg,
                                                rOpt.text,
                                                rOpt.border,
                                              )}
                                            >
                                              {abbrevRoute(effectiveRuta)}
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border-dashed border shrink-0 border-muted-foreground/40 text-muted-foreground/60 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer">
                                              sin ruta
                                            </span>
                                          )}
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="start"
                                        className="w-44 z-[70]"
                                      >
                                        {routeOptions.map((r) => (
                                          <DropdownMenuItem
                                            key={r.name}
                                            onClick={() => {
                                              setRutaOverrides((prev) => ({
                                                ...prev,
                                                [rutaKey]: r.name,
                                              }));
                                              if (effectiveSlCode) {
                                                updateCustomerRuta(
                                                  effectiveSlCode,
                                                  r.name,
                                                  false,
                                                  'nova_route_picker',
                                                ).catch(console.error);
                                              } else {
                                                // HARDENING FIX 1: Check if we have a SL-NAN assigned
                                                // via matchOverride for this row but effectiveSlCode
                                                // hasn't reflected it yet.
                                                const pendingSlCode =
                                                  matchOverrides[oIdx]?.slCode ||
                                                  slCodeOverrides[oIdx]?.slCode;
                                                if (pendingSlCode) {
                                                  updateCustomerRuta(
                                                    pendingSlCode,
                                                    r.name,
                                                    false,
                                                    'nova_route_picker',
                                                  ).catch(console.error);
                                                }
                                                saveUnmatchedRouteLearning(
                                                  row.nombre,
                                                  r.name,
                                                ).catch(console.error);
                                              }
                                            }}
                                            className={cn(
                                              "gap-2",
                                              effectiveRuta === r.name &&
                                              "font-semibold",
                                            )}
                                          >
                                            <span
                                              className={cn(
                                                "inline-block w-2.5 h-2.5 rounded-sm shrink-0 border",
                                                r.bg,
                                                r.border,
                                              )}
                                            />
                                            {r.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </td>
                                  {/* Package-row client cell: manifest name (inline-editable) + badge */}
                                  <td className="px-3 py-1 whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                      {/* R badge BEFORE the name — only when unmatched (no slCode) */}
                                      {!showGroupHeaders &&
                                        (() => {
                                          const rowSlCode = unlinkedRows.has(
                                            oIdx,
                                          )
                                            ? ""
                                            : slCodeOverrides[oIdx]?.slCode ||
                                            row.slCode;
                                          if (rowSlCode) return null;
                                          return (
                                            <button
                                              type="button"
                                              title="Mostrar encabezados de grupos para revisar y asignar cliente"
                                              onClick={() =>
                                                setShowGroupHeaders(true)
                                              }
                                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/50 shrink-0 hover:bg-red-500/25 transition-colors cursor-pointer"
                                            >
                                              R
                                            </button>
                                          );
                                        })()}
                                      {editingName?.idx === oIdx ? (
                                        <div className="flex items-center gap-1 min-w-0 flex-1">
                                          <input
                                            autoFocus
                                            type="text"
                                            value={editingName.value}
                                            onChange={(e) =>
                                              setEditingName({
                                                idx: oIdx,
                                                value: e.target.value,
                                              })
                                            }
                                            onKeyDown={(e) => {
                                              if (
                                                e.key === "Enter" ||
                                                e.key === "Tab"
                                              ) {
                                                e.preventDefault();
                                                const newName =
                                                  editingName.value
                                                    .trim()
                                                    .toUpperCase();
                                                setEditingName(null);
                                                if (
                                                  newName &&
                                                  newName !==
                                                  (
                                                    nameOverrides[oIdx] ??
                                                    row.nombre
                                                  ).toUpperCase()
                                                ) {
                                                  setNameEditConfirm({
                                                    idx: oIdx,
                                                    newName,
                                                    groupIdxs: entries.map(
                                                      (e) => e.originalIdx,
                                                    ),
                                                  });
                                                }
                                              } else if (e.key === "Escape") {
                                                setEditingName(null);
                                              }
                                            }}
                                            onBlur={() => setEditingName(null)}
                                            className="text-xs font-medium bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary w-full min-w-0 uppercase"
                                            aria-label="Editar nombre del paquete"
                                          />
                                          <button
                                            type="button"
                                            aria-label="Confirmar nombre"
                                            title="Confirmar (Enter)"
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onClick={() => {
                                              const newName = editingName.value
                                                .trim()
                                                .toUpperCase();
                                              setEditingName(null);
                                              if (
                                                newName &&
                                                newName !==
                                                (
                                                  nameOverrides[oIdx] ??
                                                  row.nombre
                                                ).toUpperCase()
                                              ) {
                                                setNameEditConfirm({
                                                  idx: oIdx,
                                                  newName,
                                                  groupIdxs: entries.map(
                                                    (e) => e.originalIdx,
                                                  ),
                                                });
                                              }
                                            }}
                                            className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-green-500 hover:bg-green-600 text-white transition-colors"
                                          >
                                            <Check className="h-3 w-3" />
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Cancelar edición"
                                            title="Cancelar (Escape)"
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onClick={() => setEditingName(null)}
                                            className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="group flex items-center gap-1.5 min-w-0">
                                          <button
                                            type="button"
                                            title="Doble clic para editar nombre"
                                            onDoubleClick={() =>
                                              setEditingName({
                                                idx: oIdx,
                                                value:
                                                  nameOverrides[oIdx] ??
                                                  row.nombre,
                                              })
                                            }
                                            className="flex items-center gap-1 focus:outline-none min-w-0"
                                          >
                                            <span
                                              className={cn(
                                                "text-xs font-medium whitespace-nowrap uppercase group-hover:underline decoration-dashed decoration-muted-foreground/50 min-w-0",
                                                (pesoOverrides[oIdx] ?? row.peso ?? 0) === 0
                                                  ? "text-red-600 dark:text-red-400 font-bold"
                                                  : "text-foreground",
                                              )}
                                            >
                                              {row.nombre}
                                            </span>
                                          </button>
                                          {/* ── Per-row integrity drift indicator ────────────────
                                          Lit when the audit detected an inconsistency for this
                                          tracking — the most common case is the manifest's
                                          slCode disagreeing with an existing invoice's slCode
                                          (CHRISTIAN CASTRO MEZA case 2026-04-29: two distinct
                                          customers ended up under the same group because the
                                          manifest got rewritten with a single SL while invoices
                                          retained the originals). Click jumps straight to the
                                          integrity modal so the operator can see evidence and
                                          apply the suggested repair. */}

                                          {/* slCode badge — right after name, before icons */}
                                          {!showGroupHeaders &&
                                            (() => {
                                              const rowSlCode =
                                                unlinkedRows.has(oIdx)
                                                  ? ""
                                                  : slCodeOverrides[oIdx]
                                                    ?.slCode || row.slCode;
                                              const score = row.matchScore ?? 0;
                                              const isManuallyAssigned = !!(
                                                slCodeOverrides[oIdx] ||
                                                matchOverrides[oIdx]
                                              );
                                              if (
                                                !rowSlCode ||
                                                (!isManuallyAssigned &&
                                                  score < 0.9)
                                              )
                                                return null;
                                              return (
                                                <button
                                                  type="button"
                                                  title="Ver detalles del cliente"
                                                  onClick={() =>
                                                    setCustomerQuickView(
                                                      rowSlCode,
                                                    )
                                                  }
                                                  className={cn(
                                                    "inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[9px] font-mono font-medium border shrink-0 transition-colors cursor-pointer",
                                                    approvedMatches.has(oIdx)
                                                      ? "bg-emerald-500/10 dark:bg-emerald-950/30 border-dashed border-emerald-500/80 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 font-semibold"
                                                      : "bg-muted border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40",
                                                  )}
                                                >
                                                  {approvedMatches.has(
                                                    oIdx,
                                                  ) && (
                                                      <Check className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                                                    )}
                                                  {rowSlCode}
                                                </button>
                                              );
                                            })()}
                                          {/* ── Per-row child action buttons ─────────────────────────
                                          Each button gets a DISTINCT colored outline so the
                                          operator can recognise the action at a glance:
                                            • Editar nombre → blue (primary edit affordance)
                                            • Copiar nombre  → emerald (clipboard / confirm)
                                            • ⋯  Más acciones  → violet (secondary menu)
                                          The buttons use opacity-0 → 100 on group-hover so the
                                          row stays visually clean when the operator isn't
                                          interacting with that line. ──────────────────────── */}
                                          <button
                                            type="button"
                                            title="Editar nombre"
                                            aria-label="Editar nombre"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingName({
                                                idx: oIdx,
                                                value:
                                                  nameOverrides[oIdx] ??
                                                  row.nombre,
                                              });
                                            }}
                                            className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded border border-blue-400/50 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:border-blue-500 transition-all focus:outline-none focus:ring-1 focus:ring-blue-500/40 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                          >
                                            <Pencil
                                              className="h-3 w-3"
                                              aria-hidden="true"
                                            />
                                          </button>
                                          <NovaCopyButton
                                            value={row.nombre}
                                            ariaLabel="Copiar nombre"
                                          />
                                          {/* Per-row actions dropdown */}
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <button
                                                type="button"
                                                aria-label="Acciones de fila"
                                                onClick={(e) =>
                                                  e.stopPropagation()
                                                }
                                                className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded border border-violet-400/50 bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:border-violet-500 transition-all focus:outline-none focus:ring-1 focus:ring-violet-500/40 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                              >
                                                <MoreHorizontal
                                                  className="h-3 w-3"
                                                  aria-hidden="true"
                                                />
                                              </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                              align="start"
                                              className="w-44 z-[70]"
                                            >
                                              {/* Row has effective customer → Desvincular + Reasignar */}
                                              {!unlinkedRows.has(oIdx) &&
                                                (slCodeOverrides[oIdx]
                                                  ?.slCode ||
                                                  matchOverrides[oIdx]
                                                    ?.slCode ||
                                                  row.slCode) && (
                                                  <>
                                                    <DropdownMenuItem
                                                      onClick={() =>
                                                        setUnlinkActionModal({
                                                          indices: [oIdx],
                                                          groupName:
                                                            row.nombre ??
                                                            "",
                                                        })
                                                      }
                                                    >
                                                      <Unlink2 className="h-3.5 w-3.5 mr-2 text-orange-500" />
                                                      Desvincular
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                      onClick={() =>
                                                        setUnlinkMatch({
                                                          rowIndex: oIdx,
                                                          nombre:
                                                            row.nombre,
                                                        })
                                                      }
                                                    >
                                                      <Link2 className="h-3.5 w-3.5 mr-2 text-primary" />
                                                      Reasignar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                  </>
                                                )}
                                              {/* Already unlinked but trapped in wrong group via nameOverride → Separar del grupo */}
                                              {unlinkedRows.has(oIdx) &&
                                                nameOverrides[oIdx] !==
                                                undefined && (
                                                  <DropdownMenuItem
                                                    className="text-orange-700 dark:text-orange-400 focus:bg-orange-50 dark:focus:bg-orange-950/30"
                                                    onClick={() => {
                                                      operatorManualUnlinksRef.current.add(
                                                        oIdx,
                                                      );
                                                      handleUnlinkOnly([oIdx]);
                                                      setShowOnlyDivergent(
                                                        false,
                                                      );
                                                    }}
                                                  >
                                                    <UserX className="h-3.5 w-3.5 mr-2 text-orange-500" />
                                                    Separar del grupo
                                                  </DropdownMenuItem>
                                                )}
                                              {/* Row unlinked → Asignar cliente */}
                                              {unlinkedRows.has(oIdx) && (
                                                <>
                                                  <DropdownMenuItem
                                                    onClick={() =>
                                                      setUnlinkMatch({
                                                        rowIndex: oIdx,
                                                        nombre:
                                                          row.nombre,
                                                      })
                                                    }
                                                  >
                                                    <Link2 className="h-3.5 w-3.5 mr-2 text-primary" />
                                                    Asignar cliente
                                                  </DropdownMenuItem>
                                                  <DropdownMenuSeparator />
                                                </>
                                              )}
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setEditingName({
                                                    idx: oIdx,
                                                    value:
                                                      nameOverrides[oIdx] ??
                                                      row.nombre,
                                                  })
                                                }
                                              >
                                                <Pencil className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                                Editar nombre
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      )}
                                      {cc?.consolidationEnabled && (
                                        <span
                                          title="Consolidación activa"
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border border-sky-400 dark:border-sky-600 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 shrink-0 select-none"
                                        >
                                          C
                                        </span>
                                      )}
                                      {cc?.electronicInvoiceRequired && (
                                        <span
                                          title="Factura electrónica requerida"
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-400 dark:border-amber-600 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 shrink-0 select-none"
                                        >
                                          FE
                                        </span>
                                      )}
                                      {(pesoOverrides[oIdx] ?? row.peso ?? 0) === 0 && (
                                        <span
                                          title="Revisa el procedimiento aduanal: este paquete puede que esté retenido en aduana."
                                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border border-red-500/40 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 shrink-0 select-none cursor-help"
                                        >
                                          DUA
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {/* Tracking — Pre-alert + Permiso badges inline, no wrapping */}
                                  <td className="px-3 py-1 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <CopyCell
                                        value={row.tracking}
                                        className={
                                          (pesoOverrides[oIdx] ?? row.peso ?? 0) === 0
                                            ? "text-red-600 dark:text-red-400 font-bold"
                                            : undefined
                                        }
                                      />
                                      {(() => {
                                        const normTracking = (row.tracking || "").toUpperCase().trim();
                                        const rowPreAlert = (row as any).preAlert || (row as any).preAlertInfo;
                                        const info = preAlertsMap.get(normTracking) || (rowPreAlert && (rowPreAlert.found || rowPreAlert.slCode) ? rowPreAlert : ((row as any).hasPreAlert || (row as any).matchSource === "pre_alert" ? { found: true, tracking: row.tracking, slCode: (row as any).preAlertSlCode || row.slCode, clientName: (row as any).nombreCliente } : null));
                                        if (!info || !info.found) return null;

                                        const preAlertSlCode = (
                                          info.slCode ||
                                          info.sp2PreAlertId?.match(/^(SL\d+)-/i)?.[1] ||
                                          (row as any).preAlertSlCode ||
                                          (row as any).slCode ||
                                          ""
                                        ).toUpperCase().trim();

                                        const effectiveSlCode = unlinkedRows.has(oIdx)
                                          ? ""
                                          : (slCodeOverrides[oIdx]?.slCode || matchOverrides[oIdx]?.slCode || row.slCode || "").toUpperCase().trim();

                                         const preAlertCust = preAlertCustomers.get(preAlertSlCode);
                                         const custName = preAlertCust ? preAlertCust.fullName : (info.clientName || (row as any).nombreCliente || "");
                                         const rowData = row as any;
                                         const rawDate = rowData.preAlertCreatedAt || info.preAlertCreatedAt;
                                         let dateFormatted = "";
                                         if (rawDate) {
                                           const d = typeof rawDate?.toDate === "function" ? rawDate.toDate() : new Date(rawDate);
                                           if (!isNaN(d.getTime())) {
                                             dateFormatted = d.toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" });
                                           }
                                         }
                                         const compositeKey = rowData.preAlertKey || info.sp2PreAlertId || `${normTracking}_${preAlertSlCode}`;
                                         const description = info.description || rowData.preAlert?.description || rowData.descripcion || rowData.contenido;
                                         const declaredVal = info.declaredValue ?? rowData.preAlert?.declaredValue ?? rowData.valor;
                                         const courier = info.courier || rowData.preAlert?.courier;
                                         const hasInvoice = info.hasInvoice ?? rowData.preAlert?.hasInvoice;

                                         const badgeTitle = `Pre-alerta: ${preAlertSlCode}${custName ? ` — ${custName}` : ""}${description ? ` | ${description}` : ""}${declaredVal != null ? ` | $${declaredVal}` : ""}`;

                                         return (
                                           <TooltipProvider key={`prealert-tt-${oIdx}`}>
                                             <Tooltip delayDuration={100}>
                                               <TooltipTrigger asChild>
                                                 <span
                                                   title={badgeTitle}
                                                   className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 shrink-0 select-none cursor-help hover:bg-emerald-500/25 hover:border-emerald-500/40 transition-colors shadow-xs"
                                                 >
                                                   P
                                                 </span>
                                               </TooltipTrigger>
                                               <TooltipContent
                                                 side="top"
                                                 sideOffset={6}
                                                 className="p-3 max-w-sm text-xs space-y-2 bg-slate-900 text-white shadow-2xl rounded-xl border border-slate-700 z-[99999] pointer-events-none"
                                               >
                                                 <div className="font-semibold text-emerald-400 flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                                                   <div className="flex items-center gap-1.5">
                                                     <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                                                     <span>Pre-alerta Verificada</span>
                                                   </div>
                                                   {courier && (
                                                     <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                                       {courier}
                                                     </span>
                                                   )}
                                                 </div>

                                                 <div className="space-y-1 text-slate-200">
                                                   <div>
                                                     <span className="text-slate-400 font-medium">Cliente:</span>{" "}
                                                     <span className="font-semibold text-emerald-300">{preAlertSlCode}</span>
                                                     {custName ? <span className="text-slate-300"> — {custName}</span> : ""}
                                                   </div>

                                                   {description && (
                                                     <div className="text-slate-300">
                                                       <span className="text-slate-400 font-medium">Descripción:</span> {description}
                                                     </div>
                                                   )}

                                                   {declaredVal !== undefined && declaredVal !== null && (
                                                     <div className="text-slate-300">
                                                       <span className="text-slate-400 font-medium">Valor declarado:</span> ${Number(declaredVal).toFixed(2)}
                                                     </div>
                                                   )}

                                                   {hasInvoice && (
                                                     <div className="text-teal-300 text-[11px] flex items-center gap-1">
                                                       <FileText className="h-3 w-3 shrink-0" />
                                                       <span>Factura adjunta por el cliente</span>
                                                     </div>
                                                   )}
                                                 </div>

                                                 <div className="pt-1 border-t border-slate-800/80 space-y-0.5 text-[10px] text-slate-400">
                                                   <div className="font-mono break-all">
                                                     <span className="font-sans font-medium text-slate-500">ID:</span> {compositeKey}
                                                   </div>
                                                   {dateFormatted && (
                                                     <div className="flex items-center gap-1">
                                                       <Clock className="h-3 w-3 shrink-0 text-slate-500" />
                                                       <span>Declarado: {dateFormatted}</span>
                                                     </div>
                                                   )}
                                                 </div>

                                                 {effectiveSlCode && effectiveSlCode !== preAlertSlCode && (
                                                   <div className="text-amber-300 font-semibold pt-1 border-t border-amber-500/20 text-[11px]">
                                                     ⚠️ Advertencia: Reasignado a {effectiveSlCode}
                                                   </div>
                                                 )}
                                               </TooltipContent>
                                             </Tooltip>
                                           </TooltipProvider>
                                         );
                                       })()}
                                      {isFusion && row.manifiesto && (
                                        <span
                                          title={`Manifiesto de origen: ${row.manifiesto}`}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/25 shrink-0 select-none max-w-[72px]"
                                        >
                                          <GitMerge className="h-2.5 w-2.5 shrink-0" />
                                          <span className="truncate">
                                            {row.manifiesto}
                                          </span>
                                        </span>
                                      )}
                                      {row.permisos && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shrink-0">
                                          Permiso
                                        </span>
                                      )}
                                      {manifestOverrides[oIdx] && (
                                        <button
                                          type="button"
                                          title={`Manifiesto reasignado: ${manifestOverrides[oIdx]} (clic para quitar)`}
                                          onClick={() =>
                                            applyManifestOverride([oIdx], "")
                                          }
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/40 shrink-0 hover:bg-red-500/15 hover:text-red-600 hover:border-red-500/40 transition-colors max-w-[80px]"
                                        >
                                          <FolderOpen className="h-2.5 w-2.5 shrink-0" />
                                          <span className="truncate">
                                            {manifestOverrides[oIdx]}
                                          </span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-1 tabular-nums text-right text-foreground">
                                    {editingPeso?.idx === oIdx ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={editingPeso.value}
                                          onChange={(e) =>
                                            setEditingPeso({
                                              idx: oIdx,
                                              value: e.target.value,
                                            })
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const newPeso = parseFloat(
                                                editingPeso.value,
                                              );
                                              if (
                                                !isNaN(newPeso) &&
                                                newPeso >= 0
                                              ) {
                                                const res = calculatePrice(
                                                  newPeso,
                                                  manifestCountry as any,
                                                  manifestShipping as any,
                                                  "regular",
                                                  row.permisos,
                                                );
                                                setPesoEditConfirm({
                                                  idx: oIdx,
                                                  oldPeso:
                                                    pesoOverrides[oIdx] ??
                                                    row.peso,
                                                  newPeso,
                                                  newPrice: res.quoteRequired
                                                    ? 0
                                                    : Math.round(
                                                      res.price * 100,
                                                    ) / 100,
                                                });
                                              }
                                              setEditingPeso(null);
                                            } else if (e.key === "Escape") {
                                              setEditingPeso(null);
                                            }
                                          }}
                                          autoFocus
                                          className="w-16 text-right text-xs px-1 py-0 border border-primary rounded bg-background text-foreground tabular-nums"
                                        />
                                        <button
                                          type="button"
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onClick={() => {
                                            const newPeso = parseFloat(
                                              editingPeso.value,
                                            );
                                            if (
                                              !isNaN(newPeso) &&
                                              newPeso >= 0
                                            ) {
                                              const res = calculatePrice(
                                                newPeso,
                                                manifestCountry as any,
                                                manifestShipping as any,
                                                "regular",
                                                row.permisos,
                                              );
                                              setPesoEditConfirm({
                                                idx: oIdx,
                                                oldPeso:
                                                  pesoOverrides[oIdx] ??
                                                  row.peso,
                                                newPeso,
                                                newPrice: res.quoteRequired
                                                  ? 0
                                                  : Math.round(
                                                    res.price * 100,
                                                  ) / 100,
                                              });
                                            }
                                            setEditingPeso(null);
                                          }}
                                          className="shrink-0 flex items-center justify-center h-4 w-4 rounded bg-green-500 hover:bg-green-600 text-white transition-colors"
                                        >
                                          <Check className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onClick={() => setEditingPeso(null)}
                                          className="shrink-0 flex items-center justify-center h-4 w-4 rounded bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        title="Doble clic para editar peso"
                                        onDoubleClick={() =>
                                          setEditingPeso({
                                            idx: oIdx,
                                            value: (
                                              resolvedRows[oIdx]?.peso ?? row.peso
                                            ).toFixed(2),
                                          })
                                        }
                                        className={cn(
                                          "tabular-nums focus:outline-none group",
                                          (pesoOverrides[oIdx] ?? row.peso ?? 0) === 0
                                            ? "text-red-600 dark:text-red-400 font-bold"
                                            : pesoOverrides[oIdx] !== undefined
                                              ? "text-amber-600 dark:text-amber-400 font-semibold"
                                              : "",
                                        )}
                                      >
                                        {(
                                          resolvedRows[oIdx]?.peso ?? row.peso
                                        ).toFixed(2)}
                                        {pesoOverrides[oIdx] !== undefined && (
                                          <span className="ml-0.5 text-[9px] text-amber-500">
                                            ✎
                                          </span>
                                        )}
                                      </button>
                                    )}
                                  </td>
                                  <td className="px-3 py-1 tabular-nums text-right text-foreground">
                                    {(() => {
                                      const resolvedRow = resolvedRows[oIdx];
                                      if (!resolvedRow) return "—";
                                      const tracking = String(row.tracking || '').toUpperCase();
                                      const hasOverride = priceOverrides[tracking]?.precio != null;

                                      return (isEffectivelyConsolidated || row.permisos || hasOverride) ? (
                                        (resolvedRow.pesoRedondeo != null ? Number(resolvedRow.pesoRedondeo) : Number(resolvedRow.peso || 0)).toFixed(2)
                                      ) : (
                                        <span className="text-foreground/40">—</span>
                                      );
                                    })()}
                                  </td>
                                  {(() => {
                                    const resolvedRow = resolvedRows[oIdx];
                                    const effPrice =
                                      resolvedRow?.precio ?? getEffectivePrice(oIdx, row);
                                    return (
                                      <>
                                        <td
                                          className={cn(
                                            "px-3 py-1 tabular-nums text-right",
                                            (() => {
                                              const tracking = String(row.tracking || '').toUpperCase();
                                              return !isEffectivelyConsolidated &&
                                                priceOverrides[tracking]
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-foreground";
                                            })(),
                                          )}
                                        >
                                          ${effPrice.toFixed(2)}
                                          {(() => {
                                            const tracking = String(row.tracking || '').toUpperCase();
                                            return !isEffectivelyConsolidated &&
                                              priceOverrides[tracking] &&
                                              computedPrices[oIdx] !==
                                              priceOverrides[tracking].precio && (
                                                <span className="ml-1 text-[9px] line-through text-muted-foreground">
                                                  $
                                                  {computedPrices[oIdx]?.toFixed(
                                                    2,
                                                  )}
                                                </span>
                                              );
                                          })()}
                                        </td>
                                        <td className="px-3 py-1 tabular-nums text-right text-[10px] text-muted-foreground whitespace-nowrap">
                                          <div className="flex items-center justify-end gap-1.5">
                                            {tc > 0
                                              ? `₡${Math.round(effPrice * tc).toLocaleString("es-CR")}`
                                              : "—"}
                                            {resolvedRow?.ajustePrecio && (
                                              <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800 scale-95 origin-right">
                                                Ajustado
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      </>
                                    );
                                  })()}
                                  <td className="px-3 py-1 text-foreground whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      {/* Per-row invoice badge — individual invoice for this tracking
                                      (also shown for permisos rows inside a consolidated group).
                                      Skips when the matched invoice IS the group's whole-group
                                      invoice (consolidación o factura única) — that case is
                                      already represented by the single header pill, repeating
                                      it here adds visual noise (BUG-MERGED-PER-ROW-BADGES). */}
                                      {(() => {
                                        const rowInv = createdInvoices.find(
                                          (inv) =>
                                            !inv.isConsolidation &&
                                            (inv.trackingNumber ===
                                              row.tracking ||
                                              inv.trackingNumbers?.includes(
                                                row.tracking,
                                              )),
                                        );
                                        // createdInvoices: current session — persistedInvoices: loaded from Firestore
                                        const displayInv =
                                          rowInv ??
                                          persistedInvoices.find(
                                            (inv) => {
                                              const status = String(inv.status || "").toLowerCase();
                                              if (status === "annulled" || status === "cancelled" || status === "void")
                                                return false;
                                              const tracking = (row.tracking || "").toUpperCase();
                                              return (
                                                inv.id === (row as any).invoiceId ||
                                                inv.invoiceNumber === (row as any).invoiceNumber ||
                                                (!isConsolidatedInvoice(inv) &&
                                                  ((inv.trackingNumber || "").toUpperCase() === tracking ||
                                                    inv.trackingNumbers?.map(t => (t || "").toUpperCase()).includes(tracking) ||
                                                    inv.items?.some((it: any) => (it.tracking || it.trackingNumber || "").toUpperCase() === tracking) ||
                                                    inv.invoiceItems?.some((it: any) => (it.trackingNumber || it.tracking || "").toUpperCase() === tracking)))
                                              );
                                            }
                                          );
                                        if (!displayInv) return null;
                                        // Suppress when this is the group-header invoice — same
                                        // pill is already visible in the header above.
                                        if (
                                          groupHeaderInvId &&
                                          displayInv.id === groupHeaderInvId
                                        )
                                          return null;
                                        const isClientMismatch = displayInv.clientSlCode && row.slCode &&
                                          String(displayInv.clientSlCode).toUpperCase() !== String(row.slCode).toUpperCase();
                                        return (
                                          <span className="inline-flex items-center gap-0.5 shrink-0">
                                            <button
                                              type="button"
                                              title={isClientMismatch
                                                ? `⚠️ Conflicto: Factura de ${displayInv.clientSlCode} (${displayInv.clientName || ""}), pero paquete es de ${row.slCode}`
                                                : `Ver factura: ${displayInv.invoiceNumber}`
                                              }
                                              onClick={() =>
                                                setPreviewInvoice(enrichInv(displayInv))
                                              }
                                              className={cn(
                                                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors cursor-pointer whitespace-nowrap",
                                                isClientMismatch
                                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                                              )}
                                            >
                                              {isClientMismatch ? (
                                                <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
                                              ) : (
                                                <FileText className="h-2.5 w-2.5 shrink-0" />
                                              )}
                                              {displayInv.invoiceNumber}
                                            </button>
                                            {/* ── Delete corrupted invoice ──────────────────────────
                                            Hover-revealed X icon that opens a confirmation modal.
                                            Used to drop invoices generated with the wrong customer
                                            (data corruption) so the next "Actualizar BD" can
                                            regenerate them. NOT for routine cancellation — that's
                                            handled via the /invoices page anular flow. */}
                                            <button
                                              type="button"
                                              title={`Eliminar factura ${displayInv.invoiceNumber} (corrupta)`}
                                              aria-label={`Eliminar factura corrupta ${displayInv.invoiceNumber}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!displayInv.id) return;
                                                setDeleteInvoiceTarget({
                                                  invoiceId: displayInv.id,
                                                  invoiceNumber:
                                                    displayInv.invoiceNumber ||
                                                    displayInv.id,
                                                  clientName:
                                                    displayInv.clientName || "",
                                                  clientSlCode:
                                                    String(displayInv.clientSlCode || displayInv.slCode || ""),
                                                  status: String(
                                                    displayInv.status ||
                                                    "draft",
                                                  ),
                                                  totalAmount: Number(
                                                    displayInv.totalAmount ??
                                                    displayInv.amount ??
                                                    0,
                                                  ),
                                                  manifestNumber:
                                                    displayInv.manifestNumber,
                                                });
                                              }}
                                              className="inline-flex items-center justify-center h-3.5 w-3.5 rounded text-red-500/70 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                                            >
                                              <X
                                                className="h-2.5 w-2.5"
                                                aria-hidden="true"
                                              />
                                            </button>
                                          </span>
                                        );
                                      })()}
                                      {/* ── Eliminar fila — hover-revealed per-row delete ────────
                                      Use case: the manifest Excel contained a package from a
                                      different courier and the operator needs to drop just
                                      that single tracking. Reuses the existing showBulkDelete
                                      flow (2-step double confirmation: preview → type ELIMINAR)
                                      so we never bypass the safety gate or duplicate the modal. */}
                                      <button
                                        type="button"
                                        title={`Eliminar fila (${row.tracking}) — paquete de otro courier u otra excepción`}
                                        aria-label={`Eliminar fila ${row.tracking}`}
                                        onClick={() =>
                                          setShowBulkDelete({
                                            step: 1,
                                            indices: [oIdx],
                                          })
                                        }
                                        className="ml-auto shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground/40 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:bg-red-500/15 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500/60"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>,
                              );
                            },
                          );
                          // Servicio de Terceros row — appears after package rows, before group summary
                          if (
                            effectiveSlCode &&
                            terceroRows.has(effectiveSlCode.toUpperCase())
                          ) {
                            const tr = terceroRows.get(
                              effectiveSlCode.toUpperCase(),
                            )!;
                            jsx.push(
                              <NovaTerceroRowCell
                                key={`tercero-${effectiveSlCode}`}
                                row={tr}
                                rOpt={rOpt}
                                tc={tc}
                                onSave={(amount, description) => {
                                  const upperSl = effectiveSlCode.toUpperCase();
                                  setTerceroRows((prev) => {
                                    const next = new Map(prev);
                                    const existing = next.get(upperSl);
                                    if (existing) {
                                      next.set(upperSl, {
                                        ...existing,
                                        amount,
                                        description,
                                        updatedAt: new Date().toISOString(),
                                      });
                                    }
                                    return next;
                                  });
                                  return updateTerceroRow({
                                    id: tr.id,
                                    amount,
                                    description,
                                  });
                                }}
                                onDelete={async () => {
                                  const upperSl = effectiveSlCode.toUpperCase();
                                  setTerceroRows((prev) => {
                                    const next = new Map(prev);
                                    next.delete(upperSl);
                                    return next;
                                  });
                                  try {
                                    await deleteTerceroRow(tr.id);
                                  } catch (err) {
                                    console.error("Error deleting tercero row:", err);
                                    setTerceroRows((prev) => {
                                      const next = new Map(prev);
                                      next.set(upperSl, tr);
                                      return next;
                                    });
                                    throw err;
                                  }
                                }}
                              />,
                            );
                          }
                          // Group footer row pushed AFTER child rows — totals displayed below children.
                          if (footerRow) jsx.push(footerRow);
                        });

                        return jsx;
                      })()}
                    </tbody>
                  </table>
                </div>
                {/* Unrouted groups alert banner — spans full width above footer */}
                <AnimatePresence>
                  {hasUnroutedGroups && !routeWarningDismissed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-800/60">
                        <AlertCircle
                          className="h-3.5 w-3.5 text-red-500 shrink-0"
                          aria-hidden="true"
                        />
                        <p className="flex-1 text-xs font-medium text-red-700 dark:text-red-300">
                          {unroutedGroupKeys.size} grupo
                          {unroutedGroupKeys.size !== 1 ? "s" : ""} sin ruta —
                          asigna una ruta antes de guardar en la base de datos
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setRouteFilter((r) =>
                              r === "__sin_ruta__" ? "" : "__sin_ruta__",
                            )
                          }
                          className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0"
                          aria-label="Ver grupos sin ruta"
                        >
                          {routeFilter === "__sin_ruta__"
                            ? "Quitar filtro"
                            : "Ver grupos"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRouteWarningDismissed(true)}
                          className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-400 hover:text-red-600 transition-colors shrink-0"
                          aria-label="Cerrar alerta"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* ── External-package drift banner ─────────────────────────────
                  Lit when another operator (or another tab) added or removed
                  a package from this manifest while it's open. We DON'T auto-
                  reload — the operator might be in the middle of unsaved
                  edits — but we surface the count + the option to dismiss.

                  RELOAD BUTTON (amber, prominent):
                  - Only shown when there are ADDED trackings (safe to merge).
                  - BLOCKED when there are REMOVED trackings (indices would shift
                    and break slCodeOverrides/matchOverrides keyed by rowIndex).
                  - Reload calls loadMegaManFromFirestore + merges new rows in-place. */}

                {/* Modal footer — responsive rows for mobile, single row for desktop */}
                <div className="border-t border-border bg-card relative">
                  {/* Mobile toggle button */}
                  <button
                    type="button"
                    onClick={() => setIsFooterExpanded(!isFooterExpanded)}
                    className="xl:hidden absolute -top-8 right-4 px-3 py-1 rounded-t-lg bg-card border border-b-0 border-border shadow-sm flex items-center justify-center text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <ChevronUp
                      className={cn(
                        "h-4 w-4 transition-transform",
                        !isFooterExpanded && "rotate-180",
                      )}
                    />
                    <span className="sr-only">Toggle footer</span>
                  </button>
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-4 py-2.5">
                    <div
                      className={cn(
                        "flex-wrap items-center gap-3 shrink-0",
                        isFooterExpanded ? "flex" : "hidden xl:flex",
                      )}
                    >
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          const crcTotal = tc > 0 ? Math.round(totalCostUSD * tc) : 0;
                          return selectedRows.size > 0 ? (
                            <>
                              <span className="font-semibold text-primary">
                                {selectedRows.size}
                              </span>
                              /{resultData.rows.length} seleccionadas ·{" "}
                              <span className="font-semibold text-primary">
                                ${totalCostUSD.toFixed(2)}
                              </span>
                              {tc > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · ₡{crcTotal.toLocaleString("es-CR")}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              {filteredIdxs.length}
                              {filteredIdxs.length !==
                                resultData.rows.length ? (
                                <span className="text-muted-foreground/60">
                                  /{resultData.rows.length}
                                </span>
                              ) : (
                                ""
                              )}{" "}
                              filas ·{" "}
                              <span className="font-semibold">
                                ${totalCostUSD.toFixed(2)}
                              </span>
                              {tc > 0 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · ₡{crcTotal.toLocaleString("es-CR")}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </span>
                      {/* ── Client / consolidation stats badges ─────────────── */}
                      <div className="flex items-center gap-1.5">
                        <span
                          title={`${stats.totalPeso.toFixed(2)} kg total en filas mostradas`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 whitespace-nowrap"
                        >
                          <Scale className="h-2.5 w-2.5 shrink-0" />
                          {stats.totalPeso.toFixed(2)} kg
                        </span>
                        <span
                          title={`${stats.clientCount} cliente${stats.clientCount !== 1 ? "s" : ""} en el manifiesto`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 whitespace-nowrap"
                        >
                          <Users className="h-2.5 w-2.5 shrink-0" />
                          {stats.clientCount} cliente
                          {stats.clientCount !== 1 ? "s" : ""}
                        </span>
                        {stats.consolidatingCount > 0 && (
                          <span
                            title={`${stats.consolidatingCount} cliente${stats.consolidatingCount !== 1 ? "s" : ""} con consolidación activa`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 whitespace-nowrap"
                          >
                            <Scale className="h-2.5 w-2.5 shrink-0" />
                            {stats.consolidatingCount} cons.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                          TC (₡/$):
                        </label>
                        <input
                          type="number"
                          value={localExchangeRate}
                          onChange={(e) => setLocalExchangeRate(e.target.value)}
                          placeholder="530.00"
                          className="w-24 text-xs px-2 py-1 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                          min={0}
                          step={0.01}
                        />
                      </div>
                      <label className="hidden flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ivaEnabled}
                          onChange={(e) => setIvaEnabled(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">
                          IVA 13%
                        </span>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2 w-full xl:w-auto">
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          isFooterExpanded ? "flex" : "hidden xl:flex",
                        )}
                      >
                        {/* Auto-save indicator — inline before the print/export
                        dropdown so the operator sees save status next to the
                        action buttons. Hidden when status === 'idle'. */}
                        {autoSaveEnabled && (
                          <NovaAutoSaveIndicator
                            status={autoSave.status}
                            lastSavedAt={autoSave.lastSavedAt}
                            errorMessage={autoSave.errorMessage}
                          />
                        )}
                        {/* Print / Export — collapsed into a single dropdown on all screen sizes */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs h-8"
                            >
                              <Printer className="h-3 w-3" />
                              <span className="hidden sm:inline">
                                Imprimir / Exportar
                              </span>
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-64 z-[70] p-1.5"
                          >
                            <DropdownMenuItem
                              onClick={handlePrintBoletaAlfa}
                              className="gap-3 text-sm font-medium cursor-pointer py-2.5 px-3 rounded-lg"
                            >
                              <Printer className="h-4.5 w-4.5 text-indigo-500 shrink-0" />
                              Boletas de Bodega ALFA
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={handlePrintRouteManifest}
                              disabled={
                                !routeFilter || routeFilter === "__sin_ruta__"
                              }
                              className="gap-3 text-sm font-medium cursor-pointer py-2.5 px-3 rounded-lg"
                              title={
                                routeFilter && routeFilter !== "__sin_ruta__"
                                  ? `Manifiesto de ruta: ${routeFilter}`
                                  : "Selecciona una ruta en el filtro"
                              }
                            >
                              <MapPin className="h-4.5 w-4.5 text-orange-500 shrink-0" />
                              Manifiesto ruta
                              {routeFilter && routeFilter !== "__sin_ruta__"
                                ? ` (${routeFilter})`
                                : ""}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {/* Guardar en BD: creates packages + invoices (no email) */}
                      <div className="flex justify-end w-full xl:w-auto">
                        <Button
                          onClick={() => {
                            setShowSaveConfirm(true);
                          }}
                          disabled={isIngesting || isInvoicing}
                          size="sm"
                          className="gap-1.5 text-xs h-8 w-full xl:w-auto"
                        >
                          {isIngesting || isInvoicing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <DatabaseZap className="h-3 w-3" />
                          )}
                          {isIngesting || isInvoicing
                            ? isIngesting
                              ? "Guardando..."
                              : "Procesando..."
                            : createdInvoices.length > 0
                              ? "Actualizar BD"
                              : ingestDone || "Guardar en BD"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Error recovery banner */}
                  {ingestError && (
                    <div className="px-4 pb-3 flex items-start gap-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        <span
                          className="text-[11px] text-destructive font-mono truncate flex-1"
                          title={ingestError}
                        >
                          {ingestError}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={handleDownloadBackupCSV}
                        title="Descargar los datos actuales como CSV (copia de respaldo)"
                      >
                        <Download className="h-3 w-3" />
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 shrink-0"
                        onClick={handleRetry}
                        disabled={isIngesting || isInvoicing}
                        title="Reintentar la operación anterior"
                      >
                        {isIngesting || isInvoicing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Reintentar
                      </Button>
                    </div>
                  )}
                  {/* Invoice badges are now shown inline on each row — no bottom panel needed */}
                </div>
                {/* Link customer modal — inside portal so z-index is correct */}
                {linkMatch &&
                  createPortal(
                    <CustomerSearchModal
                      nombre={linkMatch.nombre}
                      currentSlCode={linkMatch.currentSlCode}
                      onClose={() => setLinkMatch(null)}
                      onCreateNew={() => {
                          // Carry the row indices from the link dialog so onCreated
                          // can apply slCodeOverrides to every row in the group.
                          // Without rowIndices the onCreated handler would crash
                          // calling forEach on undefined.
                          setCreateCustomer({
                            nombre: linkMatch.nombre,
                            rowIndex: linkMatch.rowIndices[0],
                            rowIndices: linkMatch.rowIndices,
                          });
                        }}
                        onSelected={(slCode, fullName, ruta) => {
                          const proceed = () => {
                            setUnlinkedRows((prev) => {
                              const next = new Set(prev);
                              linkMatch.rowIndices.forEach((idx) =>
                                next.delete(idx),
                              );
                              return next;
                            });
                            setMatchOverrides((prev) => {
                              const next = { ...prev };
                              linkMatch.rowIndices.forEach((idx) => {
                                next[idx] = { slCode, fullName, ruta };
                              });
                              return next;
                            });
                            setSlCodeOverrides((prev) => {
                              const next = { ...prev };
                              linkMatch.rowIndices.forEach((idx) => {
                                next[idx] = { slCode, ruta };
                              });
                              return next;
                            });
                            if (ruta)
                              setRutaOverrides((prev) => ({
                                ...prev,
                                [slCode]: ruta,
                              }));

                            linkMatch.rowIndices.forEach((idx) => {
                              const row = resultData.rows[idx];
                              if (row) {
                                onSelectMatch?.(
                                  idx,
                                  slCode,
                                  ruta || row.ruta || "",
                                  row.consolidacion || false,
                                  fullName
                                );
                              }
                            });

                            const firstIdx = linkMatch.rowIndices[0];
                            const origRow =
                              firstIdx !== undefined
                                ? resultData.rows[firstIdx]
                                : null;
                            if (origRow) {
                              saveMatchFeedback({
                                manifestName: origRow.nombre,
                                slCode,
                                fullName,
                                ruta: ruta || null,
                                consolidationEnabled:
                                  origRow.consolidacion || false,
                                source: "admin_pick",
                              }).catch(() => { });
                              setApprovedMatches((prev) => {
                                const next = new Set(prev);
                                linkMatch.rowIndices.forEach((idx) => next.add(idx));
                                return next;
                              });
                            }
                            // BUG-E5: refresh contact map so email/recibo is available immediately
                            getCustomersBySlCodes([slCode])
                              .then((newMap) => {
                                setCustomerContactMap(
                                  (prev) => new Map([...prev, ...newMap]),
                                );
                              })
                              .catch(() => { });
                          };

                          let collision: { tracking: string; preAlertSlCode: string } | null = null;
                          for (const idx of linkMatch.rowIndices) {
                            const row = resultData.rows[idx];
                            if (row) {
                              const normTracking = (row.tracking || "").toUpperCase().trim();
                              const preAlert = preAlertsMap.get(normTracking);
                              if (
                                preAlert?.found &&
                                preAlert.slCode &&
                                preAlert.slCode.toUpperCase() !== slCode.toUpperCase()
                              ) {
                                collision = { tracking: row.tracking || "", preAlertSlCode: preAlert.slCode };
                                break;
                              }
                            }
                          }

                          if (collision) {
                            setReassignPreAlertConfirm({
                              slCode,
                              fullName,
                              ruta: ruta || "",
                              preAlertSlCode: collision.preAlertSlCode,
                              trackingNumber: collision.tracking,
                              onConfirm: () => {
                                proceed();
                                setReassignPreAlertConfirm(null);
                              },
                            });
                          } else {
                            proceed();
                          }
                          setLinkMatch(null);
                        }}
                      />,
                    document.body,
                  )}
                {/* Create customer modal — inside portal so z-index is correct */}
                <AnimatePresence>
                  {createCustomer && (
                    <CreateCustomerModal
                      nombre={createCustomer.nombre}
                      onClose={() => setCreateCustomer(null)}
                      onCreated={(slCode, ruta) => {
                        const proceed = () => {
                          // BUG-E1: apply override to ALL rows in the group, not just firstIdx
                          setSlCodeOverrides((prev) => {
                            const next = { ...prev };
                            createCustomer.rowIndices.forEach((idx) => {
                              next[idx] = { slCode, ruta };
                            });
                            return next;
                          });
                          setRutaOverrides((prev) => ({
                            ...prev,
                            [slCode]: ruta,
                          }));

                          createCustomer.rowIndices.forEach((idx) => {
                            const row = resultData.rows[idx];
                            if (row) {
                              onSelectMatch?.(
                                idx,
                                slCode,
                                ruta || row.ruta || "",
                                row.consolidacion || false,
                                createCustomer.nombre
                              );
                            }
                          });

                          const origRow =
                            resultData.rows[createCustomer.rowIndex];
                          if (origRow) {
                            saveMatchFeedback({
                              manifestName: origRow.nombre,
                              slCode,
                              fullName: origRow.nombre,
                              ruta: ruta || null,
                              consolidationEnabled:
                                origRow.consolidacion || false,
                              source: "admin_manual",
                            }).catch(() => { });
                            setApprovedMatches((prev) => {
                              const next = new Set(prev);
                              createCustomer.rowIndices.forEach((idx) => next.add(idx));
                              return next;
                            });
                          }
                          // BUG-E6: refresh contact map so email/recibo is available immediately
                          getCustomersBySlCodes([slCode])
                            .then((newMap) => {
                              setCustomerContactMap(
                                (prev) => new Map([...prev, ...newMap]),
                              );
                            })
                            .catch(() => { });
                        };

                        let collision: { tracking: string; preAlertSlCode: string } | null = null;
                        for (const idx of createCustomer.rowIndices) {
                          const row = resultData.rows[idx];
                          if (row) {
                            const normTracking = (row.tracking || "").toUpperCase().trim();
                            const preAlert = preAlertsMap.get(normTracking);
                            if (
                              preAlert?.found &&
                              preAlert.slCode &&
                              preAlert.slCode.toUpperCase() !== slCode.toUpperCase()
                            ) {
                              collision = { tracking: row.tracking || "", preAlertSlCode: preAlert.slCode };
                              break;
                            }
                          }
                        }

                        if (collision) {
                          setReassignPreAlertConfirm({
                            slCode,
                            fullName: createCustomer.nombre,
                            ruta: ruta || "",
                            preAlertSlCode: collision.preAlertSlCode,
                            trackingNumber: collision.tracking,
                            onConfirm: () => {
                              proceed();
                              setReassignPreAlertConfirm(null);
                            },
                          });
                        } else {
                          proceed();
                        }
                        setCreateCustomer(null);
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* Real-time progress overlay */}
                {validationProgress.active && (
                  <div
                    id="validation-progress-overlay"
                    className={cn(
                      "absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-500",
                      validationProgress.isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
                    )}
                  >
                    <div className="bg-card border shadow-xl rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 text-center animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-center">
                        <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-full animate-bounce">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-semibold text-sm text-foreground">
                          {validationProgress.message || "Validando..."}
                        </h3>
                        {validationProgress.total > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Progreso: {Math.round((validationProgress.current / validationProgress.total) * 100)}%
                          </p>
                        )}
                      </div>
                      {validationProgress.total > 0 && (
                        <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                            style={{
                              width: `${(validationProgress.current / validationProgress.total) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        );
        return embedMode ? tableModal : createPortal(tableModal, document.body);
      })()}

      {/* TC pre-save confirmation dialog — extracted to NovaSaveConfirmModal
          to keep this file focused on the table surface. All state flows in
          via props; all actions flow out via named callbacks. */}
      <NovaSaveConfirmModal
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        manifestNumber={resultData.manifestNumber}
        activeRowsCount={activeRows.length}
        totalManifestRowsCount={resultData.rows.length}
        activeClientsCount={stats.clientCount}
        totalManifestClientsCount={totalManifestClientsCount}
        manifestReassignedCount={manifestReassignedIndices.size}
        activeTotalUsd={activeTotal}
        fullManifestTotalUsd={fullManifestTotalUSD}
        allRows={activeRows}
        mergedInvoices={mergedInvoices}
        separateInvoices={separateInvoices}
        partialSelectionSummary={partialSelectionSummary}
        activeRouteFilter={routeFilter}
        activeTableFilter={tableFilter}
        selectedCheckboxesCount={selectedRows.size}
        tc={tc}
        persistedTc={initialExchangeRate}
        recentManifestTc={recentManifestTc}
        dataOrigin={dataOriginPolicy.origin}
        integrityReport={integrityAudit.report as any}
        onOpenIntegrityModal={() => setShowIntegrityModal(true)}
        unmatchedByName={unmatchedByName}
        autoCreatingTemp={autoCreatingTemp}
        onAutoCreateTempCustomers={handleAutoCreateTempCustomers}
        existingInvoiceBreakdown={existingInvoiceBreakdown}
        existingInvoicesList={existingInvoicesList}
        protectedActions={protectedActions}
        onUpdateProtectedAction={(sl, act) => {
          setProtectedActions(prev => ({ ...prev, [sl.toUpperCase()]: act }));
        }}
        onUpdateAllProtectedActions={(act) => {
          setProtectedActions(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
              // Paid invoices cannot be overwritten
              if (act === 'overwrite') {
                const found = existingInvoicesList.find(inv => String(inv.clientSlCode || inv.slCode || '').toUpperCase() === k);
                if (found && String(found.status || '').toLowerCase() === 'paid') {
                  return; // skip paid
                }
              }
              next[k] = act;
            });
            return next;
          });
        }}
        onConfirmSaveOnly={handleIngest}
        onConfirmRecreate={() => handleIngestAndInvoice(false, { protectedActions })}
        onConfirmAnnulAndRecreate={() =>
          handleIngestAndInvoice(false, { annulFirst: true })
        }
        onConfirmUpdateTcOnly={handleUpdateExchangeRateOnly}
      />

      {/* ── Manifest Picker — Step 1: search + select ── */}
      <Dialog
        open={manifestPicker?.step === 1}
        onOpenChange={(open) => {
          if (!open) {
            setManifestPicker(null);
            setManifestPickerSearch("");
          }
        }}
      >
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 text-teal-500 shrink-0" />
              Cambiar manifiesto
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Selecciona el manifiesto de destino para{" "}
              <strong>
                {manifestPicker?.targetIndices.length ?? 0} paquete
                {(manifestPicker?.targetIndices.length ?? 0) !== 1 ? "s" : ""}
              </strong>
              . Manifiesto actual:{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                {resultData.manifestNumber}
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar manifiesto..."
                value={manifestPickerSearch}
                onChange={(e) => setManifestPickerSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            {/* Custom manual entry */}
            {manifestPickerSearch.trim() &&
              !filteredManifestSuggestions.some(
                (m) =>
                  m.id.toUpperCase() ===
                  manifestPickerSearch.trim().toUpperCase(),
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    setManifestPicker((prev) =>
                      prev
                        ? {
                          ...prev,
                          selectedManifestId: manifestPickerSearch
                            .trim()
                            .toUpperCase(),
                        }
                        : prev,
                    )
                  }
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors",
                    manifestPicker?.selectedManifestId ===
                      manifestPickerSearch.trim().toUpperCase()
                      ? "border-teal-500/60 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                      : "border-dashed border-border hover:bg-accent",
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                  <span className="font-mono font-semibold">
                    {manifestPickerSearch.trim().toUpperCase()}
                  </span>
                  <span className="text-muted-foreground text-xs ml-auto">
                    Usar este
                  </span>
                </button>
              )}

            {/* Suggestions list */}
            <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {isLoadingManifests ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando manifiestos...
                </div>
              ) : filteredManifestSuggestions.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-xs">
                  {manifestPickerSearch
                    ? "No se encontraron manifiestos"
                    : "Sin manifiestos recientes"}
                </div>
              ) : (
                filteredManifestSuggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setManifestPicker((prev) =>
                        prev ? { ...prev, selectedManifestId: m.id } : prev,
                      )
                    }
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                      manifestPicker?.selectedManifestId === m.id
                        ? "bg-teal-500/10 text-teal-700 dark:text-teal-300"
                        : "hover:bg-accent",
                    )}
                  >
                    {manifestPicker?.selectedManifestId === m.id ? (
                      <Check className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="font-mono font-semibold text-xs truncate">
                      {m.id}
                    </span>
                    <span className="text-muted-foreground text-[11px] ml-auto shrink-0">
                      {m.totalPackages} paq.
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setManifestPicker(null);
                setManifestPickerSearch("");
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!manifestPicker?.selectedManifestId}
              onClick={() =>
                setManifestPicker((prev) =>
                  prev ? { ...prev, step: 2 } : prev,
                )
              }
            >
              Siguiente
              <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manifest Picker — Step 2: double-confirmation ── */}
      <Dialog
        open={manifestPicker?.step === 2}
        onOpenChange={(open) => {
          if (!open) setManifestPicker(null);
        }}
      >
        <DialogContent className="max-w-sm w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Confirmar reasignación de manifiesto
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Los siguientes{" "}
              <strong>
                {manifestPicker?.targetIndices.length ?? 0} paquete
                {(manifestPicker?.targetIndices.length ?? 0) !== 1 ? "s" : ""}
              </strong>{" "}
              se van a registrar en el manifiesto{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded font-bold text-teal-700 dark:text-teal-300">
                {manifestPicker?.selectedManifestId}
              </code>{" "}
              en lugar del manifiesto actual{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                {resultData.manifestNumber}
              </code>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 my-1">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Al guardar, los paquetes y sus facturas se crearán bajo el
              manifiesto de destino.
            </p>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border border-border bg-muted/40 p-2">
            {(manifestPicker?.targetIndices ?? []).map((i) => {
              const row = resultData.rows[i];
              return row ? (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <code className="font-mono text-muted-foreground truncate">
                    {row.tracking}
                  </code>
                  <span className="text-muted-foreground/60 truncate shrink-0">
                    {row.nombre}
                  </span>
                </div>
              ) : null;
            })}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setManifestPicker((prev) =>
                  prev ? { ...prev, step: 1 } : prev,
                )
              }
            >
              Volver
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => {
                if (!manifestPicker) return;
                applyManifestOverride(
                  manifestPicker.targetIndices,
                  manifestPicker.selectedManifestId,
                );
                setManifestPicker(null);
                setManifestPickerSearch("");
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Confirmar reasignación
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Move Manifest — Step 1: search + select ── */}
      <Dialog
        open={bulkMoveManifestPicker?.step === 1}
        onOpenChange={(open) => {
          if (!open) {
            setBulkMoveManifestPicker(null);
            setBulkMoveSearch("");
          }
        }}
      >
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 text-teal-500 shrink-0" />
              Trasladar en Bulk a Manifiesto
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Selecciona el manifiesto de destino para el traslado de{" "}
              <strong>
                {bulkMoveManifestPicker?.targetIndices.length ?? 0} paquete
                {(bulkMoveManifestPicker?.targetIndices.length ?? 0) !== 1 ? "s" : ""}
              </strong>{" "}
              seleccionados. Manifiesto actual:{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded font-semibold text-teal-700 dark:text-teal-300">
                {resultData.manifestNumber}
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar manifiesto..."
                value={bulkMoveSearch}
                onChange={(e) => setBulkMoveSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            {/* Custom manual entry */}
            {bulkMoveSearch.trim() &&
              (!bulkMoveManifestPicker?.isEncomiendaOnly ||
                bulkMoveSearch.trim().toUpperCase().startsWith("ENC-")) &&
              !filteredBulkMoveSuggestions.some(
                (m) =>
                  m.id.toUpperCase() ===
                  bulkMoveSearch.trim().toUpperCase(),
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    setBulkMoveManifestPicker((prev) =>
                      prev
                        ? {
                          ...prev,
                          selectedManifestId: bulkMoveSearch
                            .trim()
                            .toUpperCase(),
                        }
                        : prev,
                    )
                  }
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors",
                    bulkMoveManifestPicker?.selectedManifestId ===
                      bulkMoveSearch.trim().toUpperCase()
                      ? "border-teal-500/60 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                      : "border-dashed border-border hover:bg-accent",
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                  <span className="font-mono font-semibold">
                    {bulkMoveSearch.trim().toUpperCase()}
                  </span>
                  <span className="text-muted-foreground text-xs ml-auto">
                    Usar este
                  </span>
                </button>
              )}

            {/* Suggestions list */}
            <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {isLoadingManifests ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando manifiestos...
                </div>
              ) : filteredBulkMoveSuggestions.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-xs">
                  {bulkMoveSearch
                    ? "No se encontraron manifiestos"
                    : "Sin manifiestos recientes"}
                </div>
              ) : (
                filteredBulkMoveSuggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setBulkMoveManifestPicker((prev) =>
                        prev ? { ...prev, selectedManifestId: m.id } : prev,
                      )
                    }
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                      bulkMoveManifestPicker?.selectedManifestId === m.id
                        ? "bg-teal-500/10 text-teal-700 dark:text-teal-300"
                        : "hover:bg-accent",
                    )}
                  >
                    {bulkMoveManifestPicker?.selectedManifestId === m.id ? (
                      <Check className="h-3.5 w-3.5 text-teal-500 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="font-mono font-semibold text-xs truncate">
                      {m.id}
                    </span>
                    <span className="text-muted-foreground text-[11px] ml-auto shrink-0">
                      {m.totalPackages} paq.
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkMoveManifestPicker(null);
                setBulkMoveSearch("");
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!bulkMoveManifestPicker?.selectedManifestId}
              onClick={() =>
                setBulkMoveManifestPicker((prev) =>
                  prev ? { ...prev, step: 2 } : prev,
                )
              }
            >
              Siguiente
              <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Move Manifest — Step 2: double-confirmation + invoice warning ── */}
      <Dialog
        open={bulkMoveManifestPicker?.step === 2}
        onOpenChange={(open) => {
          if (!open) setBulkMoveManifestPicker(null);
        }}
      >
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 animate-bounce" />
              Confirmar Traslado Masivo & Modificación de Facturas
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {bulkMoveManifestPicker?.isEncomiendaOnly ? (
                <>
                  Los siguientes{" "}
                  <strong>
                    {bulkMoveManifestPicker?.targetIndices.length ?? 0} paquetes de encomiendas
                  </strong>{" "}
                  serán trasladados inmediatamente al manifiesto de encomiendas{" "}
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded font-bold text-teal-700 dark:text-teal-300">
                    {bulkMoveManifestPicker?.selectedManifestId}
                  </code>{" "}
                  y removidos de la vista actual.
                </>
              ) : (
                <>
                  Los siguientes{" "}
                  <strong>
                    {bulkMoveManifestPicker?.targetIndices.length ?? 0} paquete
                    {(bulkMoveManifestPicker?.targetIndices.length ?? 0) !== 1 ? "s" : ""}
                  </strong>{" "}
                  serán trasladados inmediatamente al manifiesto{" "}
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded font-bold text-teal-700 dark:text-teal-300">
                    {bulkMoveManifestPicker?.selectedManifestId}
                  </code>{" "}
                  y removidos del manifiesto actual{" "}
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                    {resultData.manifestNumber}
                  </code>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 my-1 space-y-2 text-xs">
            <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Impacto de la Operación en la Base de Datos:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              {bulkMoveManifestPicker?.isEncomiendaOnly ? (
                <>
                  <li>Los paquetes cambiarán su manifiesto a <span className="font-mono font-semibold">{bulkMoveManifestPicker?.selectedManifestId}</span> en las colecciones <code className="font-mono">packages</code> y <code className="font-mono">manifest_encomiendas</code>.</li>
                  <li>Las facturas en <span className="font-semibold text-foreground">Borrador (Draft)</span> de estos paquetes se <span className="font-semibold text-red-600 dark:text-red-400">eliminarán</span> de forma permanente.</li>
                  <li>Las facturas activas enviadas/vencidas se <span className="font-semibold text-amber-600 dark:text-amber-400">anularán</span> (conservando registro en Firestore).</li>
                  <li>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Reversión (Deshacer)</span>: Al finalizar con éxito, se mostrará una barra de recuperación en la parte superior de NovaTable que le permitirá <strong className="text-teal-700 dark:text-teal-400">deshacer todo el traslado</strong> y restaurar las facturas originales con un solo clic.
                  </li>
                  <li>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Rollback de seguridad</span>: En caso de cualquier error durante la escritura en la base de datos, la operación se cancelará atómicamente, restaurando de inmediato todas las facturas borradas/anuladas y revirtiendo los paquetes a su estado original.
                  </li>
                </>
              ) : (
                <>
                  <li>Los paquetes cambiarán su manifiesto a <span className="font-mono font-semibold">{bulkMoveManifestPicker?.selectedManifestId}</span> en la colección <code className="font-mono">packages</code> de Firestore.</li>
                  <li>Las facturas en <span className="font-semibold text-foreground">Borrador (Draft)</span> de estos paquetes se <span className="font-semibold text-red-600 dark:text-red-400">eliminarán</span> de forma permanente.</li>
                  <li>Las facturas activas enviadas/vencidas se <span className="font-semibold text-amber-600 dark:text-amber-400">anularán</span> (conservando registro de auditoría en Firestore).</li>
                  <li>Las facturas <span className="font-semibold text-emerald-600 dark:text-emerald-400">Pagadas (Paid)</span> serán protegidas y no se modificarán.</li>
                </>
              )}
            </ul>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border border-border bg-muted/40 p-2">
            {(bulkMoveManifestPicker?.targetIndices ?? []).map((i) => {
              const row = resultData.rows[i];
              return row ? (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 truncate">
                    <code className="font-mono text-muted-foreground truncate">
                      {row.tracking}
                    </code>
                    <span className="text-muted-foreground/60 truncate">
                      {row.nombre}
                    </span>
                  </div>
                  {(row as any).invoiceNumber && (
                    <span className="text-muted-foreground/40 text-[9px] font-mono shrink-0 bg-muted px-1 py-0.5 rounded border">
                      Inv: {(row as any).invoiceNumber}
                    </span>
                  )}
                </div>
              ) : null;
            })}
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isMovingManifest}
              onClick={() =>
                setBulkMoveManifestPicker((prev) =>
                  prev ? { ...prev, step: 1 } : prev,
                )
              }
            >
              Volver
            </Button>
            <Button
              size="sm"
              disabled={isMovingManifest}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleExecuteBulkMove}
            >
              {isMovingManifest ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Trasladando...
                </>
              ) : (
                <>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Confirmar traslado masivo
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk delete — Step 1: impact summary ── */}
      <Dialog
        open={showBulkDelete?.step === 1}
        onOpenChange={(open) => {
          if (!open) setShowBulkDelete(null);
        }}
      >
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
              <Trash2 className="h-4 w-4 shrink-0" />
              Confirmar eliminación / desasociación de paquetes
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Resumen de acciones que se aplicarán para los{" "}
              <strong>
                {showBulkDelete?.indices.length ?? 0} paquete
                {(showBulkDelete?.indices.length ?? 0) !== 1 ? "s" : ""}
              </strong>{" "}
              seleccionados.
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs space-y-3 my-2 max-h-80 overflow-y-auto pr-1">
            {(() => {
              const toRestore: any[] = [];
              const toDelete: any[] = [];
              const protectedInvs: string[] = [];

              (showBulkDelete?.indices ?? []).forEach(idx => {
                const r = resultData.rows[idx];
                if (!r) return;
                const isProtected = ['processed', 'delivered', 'returned', 'pickup'].includes(((r as any).status || '').toLowerCase());
                const hasHistory = !!((r as any).originalManifestNumber || r.originalData?.originalManifestID);
                if (isProtected || hasHistory) {
                  toRestore.push(r);
                } else {
                  toDelete.push(r);
                }
                if ((r as any).invoiceNumber && (r as any).invoiceStatus && (r as any).invoiceStatus !== 'draft') {
                  protectedInvs.push(`${(r as any).invoiceNumber} (${(r as any).invoiceStatus})`);
                }
              });

              return (
                <>
                  {toRestore.length > 0 && (
                    <div className="space-y-1 bg-amber-50 dark:bg-amber-950/20 p-2.5 rounded border border-amber-200 dark:border-amber-900">
                      <p className="font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1.5 text-[11px]">
                        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                        Desasociar y restaurar ({toRestore.length})
                      </p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-normal">
                        Paquetes procesados, entregados o importados. Se removerán de este manifiesto y volverán a su manifiesto de origen o consolidación transitoria:
                      </p>
                      <ul className="list-disc list-inside text-[10px] space-y-0.5 mt-1 max-h-32 overflow-y-auto font-mono text-amber-700 dark:text-amber-400">
                        {toRestore.map((r, i) => (
                          <li key={i} className="truncate">
                            {r.tracking} - {String(r.nombre ?? '').substring(0, 18)} (→ {(r as any).originalManifestNumber || 'Transitoria'})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {toDelete.length > 0 && (
                    <div className="space-y-1 bg-red-50 dark:bg-red-950/20 p-2.5 rounded border border-red-200 dark:border-red-900">
                      <p className="font-semibold text-red-800 dark:text-red-400 flex items-center gap-1.5 text-[11px]">
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        Desvincular del manifiesto ({toDelete.length})
                      </p>
                      <p className="text-[10px] text-red-600 dark:text-red-500 leading-normal">
                        Paquetes nuevos sin historial. Se removerán de este manifiesto y quedarán archivados sin manifiesto asociado (none) en la base de datos de paquetes, y sus facturas borradores serán eliminadas:
                      </p>
                      <ul className="list-disc list-inside text-[10px] space-y-0.5 mt-1 max-h-32 overflow-y-auto font-mono text-red-700 dark:text-red-400">
                        {toDelete.map((r, i) => (
                          <li key={i} className="truncate">
                            {r.tracking} - {String(r.nombre ?? '').substring(0, 18)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {protectedInvs.length > 0 && (
                    <div className="bg-destructive/10 text-destructive text-[10px] p-2.5 rounded border border-destructive/20 font-medium leading-normal flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>
                        ⚠️ <strong>¡ATENCIÓN!</strong> Se detectaron facturas protegidas activas ({protectedInvs.join(', ')}). Estas facturas NO serán eliminadas. Anúlalas en el portal de facturas primero si requieres re-generarlas.
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkDelete(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() =>
                setShowBulkDelete((prev) =>
                  prev ? { ...prev, step: 2 } : null,
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk delete — Step 2: type ELIMINAR to confirm ── */}
      <Dialog
        open={showBulkDelete?.step === 2}
        onOpenChange={(open) => {
          if (!open) {
            setShowBulkDelete(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-sm w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Confirmar eliminación definitiva
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Escribe{" "}
              <strong className="font-mono tracking-widest text-red-600 dark:text-red-400">
                ELIMINAR
              </strong>{" "}
              para confirmar la eliminación permanente de{" "}
              <strong>
                {showBulkDelete?.indices.length ?? 0} paquete
                {(showBulkDelete?.indices.length ?? 0) !== 1 ? "s" : ""}
              </strong>{" "}
              y sus facturas.
            </DialogDescription>
          </DialogHeader>

          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                deleteConfirmText.trim().toUpperCase() === "ELIMINAR"
              )
                handleBulkDelete();
            }}
            placeholder="Escribe ELIMINAR aquí"
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-colors placeholder:text-muted-foreground/50"
            autoFocus
            aria-label="Confirmar eliminación"
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setShowBulkDelete(null);
                setDeleteConfirmText("");
              }}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleBulkDelete}
              disabled={
                deleteConfirmText.trim().toUpperCase() !== "ELIMINAR" ||
                isDeleting
              }
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" /> Confirmar Desvinculación
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogo de confirmacion de regeneracion para facturas pagadas */}
      <Dialog
        open={!!paidInvoiceRegenTarget}
        onOpenChange={(open) => {
          if (!open) setPaidInvoiceRegenTarget(null);
        }}
      >
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse text-amber-500" />
              Advertencia: Factura Pagada Detectada
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed mt-2 text-foreground/80">
              El cliente <strong>{paidInvoiceRegenTarget?.clientName}</strong> ya posee una factura en estado <strong>PAGADA</strong> para el manifiesto <strong>{resultData.manifestNumber}</strong>.
              <br /><br />
              Al re-generar esta factura:
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground text-xs">
                <li>La factura pagada actual se <strong>anulará automáticamente</strong>.</li>
                <li>Esto puede generar discrepancias y descuadres en caja/reportes financieros.</li>
                <li>Esta acción quedará <strong>registrada permanentemente en la bitácora de auditoría</strong> bajo su usuario.</li>
              </ul>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setPaidInvoiceRegenTarget(null)}
              disabled={isInvoicing}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700 dark:text-white border-amber-600 hover:border-amber-700"
              disabled={isInvoicing}
              onClick={async () => {
                if (!paidInvoiceRegenTarget) return;
                setIsInvoicing(true);
                try {
                  const res = await handleRegenerateGroupInvoice(
                    paidInvoiceRegenTarget.targetIdxs,
                    { forceAnnulPaid: true }
                  );
                  if (res.created > 0) {
                    setIngestDone(
                      `Re-generadas ${res.created} factura${res.created !== 1 ? "s" : ""} para ${paidInvoiceRegenTarget.clientName}${res.annulled > 0 ? ` · anuladas ${res.annulled}` : ""}`
                    );
                  } else if (res.errors > 0) {
                    setIngestError(
                      `No se pudieron re-generar facturas para ${paidInvoiceRegenTarget.clientName}`
                    );
                  } else if (res.skipped.length > 0) {
                    const statuses = Array.from(
                      new Set(res.skipped.flatMap((s) => s.statuses))
                    ).join(", ");
                    setIngestError(
                      `No se re-generó: ya existe factura ${statuses}.`
                    );
                  }
                } catch (err) {
                  setIngestError("Error al procesar la re-generación.");
                } finally {
                  setIsInvoicing(false);
                  setPaidInvoiceRegenTarget(null);
                }
              }}
            >
              {isInvoicing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procesando…
                </>
              ) : (
                <>
                  Proceder y Registrar Log
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Hide group headers save-block alert */}
      <AlertDialog
        open={showHideGroupHeadersAlert}
        onOpenChange={(open) => {
          if (!open) setShowHideGroupHeadersAlert(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encabezados de grupos ocultos</AlertDialogTitle>
            <AlertDialogDescription>
              La opción <strong>"Ocultar encabezados de grupos"</strong> está
              activa en la barra superior. Debes desactivarla antes de guardar
              los datos en la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel
              onClick={() => setShowHideGroupHeadersAlert(false)}
            >
              Cerrar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowGroupHeaders(true);
                setShowHideGroupHeadersAlert(false);
              }}
            >
              Mostrar encabezados
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reassign Pre-Alert Mismatch Warning Dialog */}
      <AlertDialog
        open={!!reassignPreAlertConfirm}
        onOpenChange={(open) => {
          if (!open) setReassignPreAlertConfirm(null);
        }}
      >
        <AlertDialogContent className="max-w-md border-amber-500/20 bg-background/95 backdrop-blur-sm shadow-2xl rounded-2xl p-6">
          <AlertDialogHeader className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-6 w-6 stroke-[2]" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-center text-foreground font-sans">
              Advertencia de Re-asignación de Pre-alerta
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground text-center leading-relaxed">
              Se está re-asignando un paquete a un cliente que no tenía la pre-alerta, y este ya está prealertado por otro cliente en SmartWeb (SP2).
            </AlertDialogDescription>
          </AlertDialogHeader>

          {reassignPreAlertConfirm && (
            <div className="mt-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-3.5 text-xs text-left">
              <div className="flex justify-between items-center py-1 border-b border-amber-500/10">
                <span className="font-medium text-muted-foreground">Número de Tracking:</span>
                <span className="font-mono font-bold text-foreground bg-amber-500/10 px-2 py-0.5 rounded text-[11px] select-all">
                  {reassignPreAlertConfirm.trackingNumber}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-amber-500/10">
                <span className="font-medium text-muted-foreground">Cliente Pre-alertado (Original):</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {reassignPreAlertConfirm.preAlertSlCode}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="font-medium text-muted-foreground">Nuevo Cliente (Asignación Manual):</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  {reassignPreAlertConfirm.slCode} {reassignPreAlertConfirm.fullName ? `(${reassignPreAlertConfirm.fullName})` : ""}
                </span>
              </div>
              <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 leading-normal pt-1.5 border-t border-amber-500/10 text-center font-medium">
                ¿Está seguro de que esta re-asignación es correcta y no se trata de un error?
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <AlertDialogCancel
              onClick={() => setReassignPreAlertConfirm(null)}
              className="h-9 px-4 text-xs font-semibold rounded-lg hover:bg-accent border border-border"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (reassignPreAlertConfirm) {
                  reassignPreAlertConfirm.onConfirm();
                }
              }}
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white border-0 transition-all shadow-md shadow-amber-500/10"
            >
              Confirmar reasignación
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Pre-Alert Integrity Warning Dialog */}
      <AlertDialog
        open={showSaveIntegrityWarning}
        onOpenChange={(open) => {
          if (!open) {
            setShowSaveIntegrityWarning(false);
            setSaveIntegrityPendingAction(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-xl border-amber-500/20 bg-background/95 backdrop-blur-sm shadow-2xl rounded-2xl p-6">
          <AlertDialogHeader className="space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-6 w-6 stroke-[2]" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-center text-foreground font-sans">
              Advertencia de Integridad de Pre-alertas
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground text-center leading-relaxed">
              Se han detectado discrepancias entre el cliente asignado en la tabla y el dueño de la pre-alerta activa para los siguientes trackings:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-4 max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {saveIntegrityConflicts.map((c, i) => (
              <div key={i} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 flex justify-between items-center text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">Fila {c.rowIndex + 1}:</span>
                    <span className="font-mono font-bold text-foreground bg-amber-500/10 px-1.5 py-0.5 rounded text-[11px] select-all">
                      {c.tracking}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Pre-alerta: <span className="font-semibold text-amber-600 dark:text-amber-400">{c.preAlertSlCode}</span> {c.preAlertEmail ? `(${c.preAlertEmail})` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground font-medium">Asignación Tabla:</div>
                  <div className="font-semibold text-foreground">{c.targetSlCode}</div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-destructive leading-normal pt-4 mt-2 border-t border-destructive/10 text-center font-bold">
            IMPORTANTE: Proceder con el guardado violará la integridad de la pre-alerta de los clientes. Esta acción quedará registrada en las bitácoras de auditoría (logs) bajo su exclusiva responsabilidad. ¿Desea continuar?
          </p>

          <div className="flex justify-end gap-3 mt-6">
            <AlertDialogCancel
              onClick={() => {
                setShowSaveIntegrityWarning(false);
                setSaveIntegrityPendingAction(null);
              }}
              className="h-9 px-4 text-xs font-semibold rounded-lg hover:bg-accent border border-border"
            >
              Cancelar y revisar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowSaveIntegrityWarning(false);
                const action = saveIntegrityPendingAction;
                setSaveIntegrityPendingAction(null);

                // Registrar log de auditoria para cada tracking omitido por bypass de pre-alerta
                saveIntegrityConflicts.forEach(conflict => {
                  logAction({
                    userId: authUser?.id || "unknown",
                    userName: authUser?.fullName || authUser?.email || "Usuario Nova",
                    userEmail: authUser?.email || undefined,
                    action: 'pre_alert_bypass',
                    category: 'pre_alerts',
                    resource: 'packages',
                    resourceId: conflict.tracking,
                    result: 'success',
                    metadata: {
                      manifestNumber: resultData.manifestNumber,
                      tracking: conflict.tracking,
                      preAlertOwnerSlCode: conflict.preAlertSlCode,
                      preAlertOwnerEmail: conflict.preAlertEmail || undefined,
                      preAlertOwnerUserId: conflict.preAlertUserId || undefined,
                      assignedSlCode: conflict.targetSlCode,
                      note: "El administrador forzó la asignación del paquete a un cliente distinto del dueño de la pre-alerta bajo su exclusiva responsabilidad.",
                    }
                  });
                });

                if (action === "ingest") {
                  await handleIngest(true);
                } else if (action === "ingest_and_invoice") {
                  await handleIngestAndInvoice(
                    saveIntegrityPendingSendEmails,
                    saveIntegrityPendingOptions || {},
                    true
                  );
                }
              }}
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white border-0 transition-all shadow-md shadow-amber-500/10"
            >
              Proceder con el guardado
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recalc/Round confirmation dialog */}
      <AlertDialog
        open={!!recalcConfirm}
        onOpenChange={(open) => {
          if (!open) setRecalcConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {recalcConfirm?.type === "recalc" && "Confirmar recálculo"}
              {recalcConfirm?.type === "round" && "Confirmar redondeo"}
              {recalcConfirm?.type === "encomiendas" &&
                "Confirmar redondeo de encomiendas"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recalcConfirm?.type === "recalc" && (
                <>
                  Se recalcularán los precios de{" "}
                  <strong>{recalcConfirm.targets.length}</strong>{" "}
                  {recalcConfirm.targets.length === 1 ? "fila" : "filas"} según
                  el peso actual. Esta acción no puede deshacerse.
                </>
              )}
              {recalcConfirm?.type === "round" && (
                <>
                  Se redondeará el peso hacia arriba y se recalculará el precio
                  de <strong>{recalcConfirm.targets.length}</strong>{" "}
                  {recalcConfirm.targets.length === 1 ? "fila" : "filas"}. Esta
                  acción no puede deshacerse.
                </>
              )}
              {recalcConfirm?.type === "encomiendas" && (
                <>
                  Se redondeará el peso hacia arriba y se recalculará el precio
                  de <strong>{recalcConfirm.targets.length}</strong>{" "}
                  {recalcConfirm.targets.length === 1 ? "paquete" : "paquetes"}{" "}
                  de clientes con ruta <strong>Encomiendas</strong>. Esta acción
                  no puede deshacerse.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRecalc}>
              {recalcConfirm?.type === "recalc" ? "Recalcular" : "Redondear"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Rounding options modal ── */}
      <Dialog
        open={!!roundingModal}
        onOpenChange={(open) => {
          if (!open) setRoundingModal(null);
        }}
      >
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpToLine className="h-4 w-4 text-amber-500" />
              Opciones de redondeo de peso
            </DialogTitle>
            <DialogDescription>
              {roundingModal?.targets.length ?? 0}{" "}
              {roundingModal?.targets.length === 1
                ? "fila seleccionada"
                : "filas seleccionadas"}
              . El peso se redondea <strong>hacia arriba</strong> al múltiplo
              más cercano según la precisión elegida.
            </DialogDescription>
          </DialogHeader>

          {/* Granularity selector */}
          <div className="flex gap-2">
            {(
              [
                {
                  label: "Unidad",
                  sublabel: "Ej: 0.46 → 1 kg",
                  value: 1 as const,
                },
                {
                  label: "Décima",
                  sublabel: "Ej: 0.46 → 0.5 kg",
                  value: 0.1 as const,
                },
                {
                  label: "Centésima",
                  sublabel: "Ej: 0.46 → 0.46 kg",
                  value: 0.01 as const,
                },
              ] as { label: string; sublabel: string; value: 1 | 0.1 | 0.01 }[]
            ).map(({ label, sublabel, value }) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setRoundingModal((prev) =>
                    prev ? { ...prev, granularity: value } : prev,
                  )
                }
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                  roundingModal?.granularity === value
                    ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-400/40"
                    : "border-border text-muted-foreground hover:border-amber-300 hover:bg-amber-500/5",
                )}
              >
                <span>{label}</span>
                <span className="text-[11px] font-normal opacity-60">
                  {sublabel}
                </span>
              </button>
            ))}
          </div>

          {/* Live preview table */}
          {roundingModal &&
            (() => {
              const g = roundingModal.granularity;
              const previewRows = roundingModal.targets
                .slice(0, 100)
                .map((idx) => {
                  const row = resultData.rows[idx];
                  if (!row) return null;
                  const roundedPeso =
                    Math.round(Math.ceil(row.peso / g) * g * 1000) / 1000;
                  const currentPrice = getEffectivePrice(idx, row);
                  const newResult = calculatePrice(
                    roundedPeso,
                    manifestCountry as any,
                    manifestShipping as any,
                    "regular",
                    row.permisos,
                  );
                  const newPrice = newResult.quoteRequired
                    ? 0
                    : Math.round(newResult.price * 100) / 100;
                  const changed = roundedPeso !== row.peso;
                  return {
                    idx,
                    row,
                    roundedPeso,
                    currentPrice,
                    newPrice,
                    changed,
                  };
                })
                .filter(Boolean) as {
                  idx: number;
                  row: (typeof resultData.rows)[0];
                  roundedPeso: number;
                  currentPrice: number;
                  newPrice: number;
                  changed: boolean;
                }[];

              const changedCount = previewRows.filter((r) => r.changed).length;
              const priceDelta = previewRows.reduce(
                (sum, r) => sum + (r.newPrice - r.currentPrice),
                0,
              );

              return (
                <>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground px-0.5">
                    <span className="text-amber-600 font-medium">
                      {changedCount} filas con cambio
                    </span>
                    <span>·</span>
                    <span
                      className={cn(
                        "font-medium",
                        priceDelta > 0
                          ? "text-amber-600"
                          : priceDelta < 0
                            ? "text-green-600"
                            : "",
                      )}
                    >
                      {priceDelta === 0
                        ? "Sin variación en precio"
                        : `${priceDelta > 0 ? "+" : ""}$${priceDelta.toFixed(2)} en total`}
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border text-xs">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">
                            #
                          </th>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                            Tracking
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                            Peso actual
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                            Peso nuevo
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                            Precio actual
                          </th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                            Precio nuevo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map(
                          ({
                            idx,
                            row,
                            roundedPeso,
                            currentPrice,
                            newPrice,
                            changed,
                          }) => (
                            <tr
                              key={idx}
                              className={cn(
                                "border-t border-border transition-colors",
                                changed ? "bg-amber-500/5" : "",
                              )}
                            >
                              <td className="px-2 py-1.5 text-muted-foreground">
                                {idx + 1}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[10px] text-foreground whitespace-nowrap">
                                {row.tracking}
                              </td>
                              <td className="px-2 py-1.5 text-right text-muted-foreground">
                                {row.peso} kg
                              </td>
                              <td
                                className={cn(
                                  "px-2 py-1.5 text-right font-semibold",
                                  changed
                                    ? "text-amber-600"
                                    : "text-muted-foreground",
                                )}
                              >
                                {roundedPeso} kg
                              </td>
                              <td className="px-2 py-1.5 text-right text-muted-foreground">
                                ${currentPrice}
                              </td>
                              <td
                                className={cn(
                                  "px-2 py-1.5 text-right font-semibold",
                                  newPrice > currentPrice
                                    ? "text-amber-600"
                                    : newPrice < currentPrice
                                      ? "text-green-600"
                                      : "text-muted-foreground",
                                )}
                              >
                                ${newPrice}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                    {roundingModal.targets.length > 100 && (
                      <p className="text-center text-xs text-muted-foreground py-1.5 border-t border-border bg-muted/30">
                        Mostrando 100 de {roundingModal.targets.length} filas
                      </p>
                    )}
                  </div>
                </>
              );
            })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setRoundingModal(null)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (!roundingModal) return;
                applyRecalc(roundingModal.targets, roundingModal.granularity);
                setRecalcResult({
                  type: "round",
                  count: roundingModal.targets.length,
                });
                setRoundingModal(null);
              }}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.97] transition-all"
            >
              Aplicar redondeo
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Price Adjustment Modal ── */}
      <AnimatePresence>
        {priceAdjustModal && (
          <PriceAdjustmentModal
            customerName={priceAdjustModal.customerName}
            rowIndices={priceAdjustModal.rowIndices}
            rows={resultData.rows}
            computedPrices={computedPrices}
            priceOverrides={priceOverrides}
            manifestCountry={manifestCountry}
            manifestShipping={manifestShipping}
            existingAdjustments={priceAdjustments}
            currentUser={authUser}
            onClose={() => setPriceAdjustModal(null)}
            onConfirm={(adjustments) => {
              setPriceAdjustments((prev) => {
                const nextAdjustments = { ...prev, ...adjustments };

                setPriceOverrides((prevOverrides) => {
                  const nextOverrides = { ...prevOverrides };
                  Object.entries(adjustments).forEach(([tracking, adj]) => {
                    const upperTrk = tracking.toUpperCase();
                    const matchedRow = resultData.rows.find(
                      (r) => r.tracking?.toUpperCase() === upperTrk
                    ) as any;
                    nextOverrides[upperTrk] = {
                      precio: adj.precioAjustado,
                      pesoRedondeo:
                        prevOverrides[upperTrk]?.pesoRedondeo ??
                        matchedRow?.pesoRedondeo ??
                        matchedRow?.peso ??
                        0,
                    };
                  });

                  // Synchronously update the fields in liveResultData.rows in memory
                  // to prevent the hydration hook from falling back to old cached values.
                  setLiveResultData((prevLive) => {
                    if (!prevLive) return prevLive;
                    const nextRows = prevLive.rows.map((row) => {
                      const trk = (row.tracking || '').toUpperCase();
                      if (trk in nextAdjustments) {
                        return {
                          ...row,
                          ajustePrecio: nextAdjustments[trk],
                          pesoRedondeo: nextOverrides[trk]?.pesoRedondeo,
                          precio: nextOverrides[trk]?.precio,
                          precioSinPermiso: nextOverrides[trk]?.precio,
                          precioConPermiso: nextOverrides[trk]?.precio,
                          originalData: {
                            ...(row.originalData || {}),
                            ajustePrecio: nextAdjustments[trk],
                            pesoRedondeo: nextOverrides[trk]?.pesoRedondeo,
                            precio: nextOverrides[trk]?.precio,
                            precioSinPermiso: nextOverrides[trk]?.precio,
                            precioConPermiso: nextOverrides[trk]?.precio,
                          }
                        };
                      }
                      return row;
                    });
                    return { ...prevLive, rows: nextRows };
                  });

                  const isFirestoreManifest = dataOriginPolicy.origin === "firestore" || resultData.loadedFromFirestore;
                  if (isFirestoreManifest) {
                    const manifestDocRows = buildResolvedRows(resultData.rows).filter((_, idx) => !deletedIndices.has(idx));
                    const updatedDocRows = manifestDocRows.map((row) => {
                      const trk = (row.tracking || '').toUpperCase();
                      if (trk in nextAdjustments) {
                        return {
                          ...row,
                          ajustePrecio: nextAdjustments[trk],
                          pesoRedondeo: nextOverrides[trk]?.pesoRedondeo,
                          precio: nextOverrides[trk]?.precio,
                          precioSinPermiso: nextOverrides[trk]?.precio,
                          precioConPermiso: nextOverrides[trk]?.precio,
                        };
                      }
                      return row;
                    });

                    saveManifestRecord(updatedDocRows, resultData.manifestNumber, {
                      manifestType: resultData.manifestType as string,
                      customerContacts: customerContactMap,
                      exchangeRate: tc,
                      priceAdjustments: nextAdjustments,
                      priceOverrides: nextOverrides,
                    }).catch(err => console.error("Error autosaving manifest adjustments:", err));

                    upsertManifestPackageOverrides(updatedDocRows, resultData.manifestNumber, {
                      manifestType: resultData.manifestType as string,
                      customerContacts: customerContactMap,
                      exchangeRate: tc,
                      priceAdjustments: nextAdjustments,
                      priceOverrides: nextOverrides,
                      preAlertsMap,
                      dataOriginPolicy,
                    }).catch(err => console.error("Error autosaving package adjustments:", err));
                  }

                  return nextOverrides;
                });

                return nextAdjustments;
              });

              setPriceAdjustModal(null);
              // Instant persistence: flush autoSave so price adjustment is written to Firestore immediately
              setTimeout(() => {
                void autoSave.flush();
              }, 100);
            }}
          />
        )}
      </AnimatePresence>

      {/* Recalc/Round result dialog */}
      <AlertDialog
        open={!!recalcResult}
        onOpenChange={(open) => {
          if (!open) setRecalcResult(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {recalcResult?.type === "recalc" && "Recálculo completado"}
              {recalcResult?.type === "round" && "Redondeo completado"}
              {recalcResult?.type === "encomiendas" &&
                "Redondeo de encomiendas completado"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recalcResult?.type === "recalc" && (
                <>
                  Se recalcularon los precios de{" "}
                  <strong>{recalcResult.count}</strong>{" "}
                  {recalcResult.count === 1 ? "fila" : "filas"} exitosamente.
                </>
              )}
              {recalcResult?.type === "round" && (
                <>
                  Se redondeó el peso y se recalculó el precio de{" "}
                  <strong>{recalcResult.count}</strong>{" "}
                  {recalcResult.count === 1 ? "fila" : "filas"} exitosamente.
                </>
              )}
              {recalcResult?.type === "encomiendas" && (
                <>
                  Se redondeó el peso y se recalculó el precio de{" "}
                  <strong>{recalcResult.count}</strong>{" "}
                  {recalcResult.count === 1 ? "paquete" : "paquetes"} de ruta{" "}
                  <strong>Encomiendas</strong> exitosamente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end mt-4">
            <AlertDialogAction onClick={() => setRecalcResult(null)}>
              Aceptar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invoice preview modal */}
      <AnimatePresence>
        {previewInvoice && (
          <NovaInvoicePreview
            invoice={previewInvoice}
            onClose={() => setPreviewInvoice(null)}
            customerConsolidationEnabled={getCustomerConsEnabled(previewInvoice)}
          />
        )}
      </AnimatePresence>

      {/* Send receipt modal — preview + red confirm-send button */}
      <AnimatePresence>
        {sendReceiptInvoice && (
          <NovaInvoicePreview
            invoice={enrichInv(sendReceiptInvoice)}
            onClose={() => setSendReceiptInvoice(null)}
            onConfirmSend={async (inv) => {
              await handleSendReceipt(inv as InvoiceRecord);
            }}
            onTestSend={async (inv, email) => {
              await sendTestInvoiceEmail(inv as InvoiceRecord, email);
            }}
            customerConsolidationEnabled={getCustomerConsEnabled(sendReceiptInvoice)}
          />
        )}
      </AnimatePresence>

      {/* ── Merge groups confirm modal — surfaced when operator picks
          "Fusionar con SL…" in an unmatched group's Acciones. The modal
          shows a side-by-side comparison of source/target totals + any
          active invoice impact. Confirm calls applyExplicitMatch which
          rewrites matchOverrides/slCodeOverrides/nameOverrides for every
          row in the source group; the table re-renders with the merged
          group on the next tick. The merge does NOT touch Firestore
          invoices — that's the explicit data-integrity policy choice. ─ */}
      <NovaMergeGroupsConfirmModal
        open={mergeConfirm !== null}
        source={
          mergeConfirm
            ? {
              customerName: mergeConfirm.sourceCustomer,
              slCode: "",
              rowCount: mergeConfirm.sourceIdxs.length,
              totalWeight: mergeConfirm.sourceWeight,
              totalPrice: mergeConfirm.sourcePrice,
              ruta: mergeConfirm.sourceRuta,
            }
            : {
              customerName: "",
              slCode: "",
              rowCount: 0,
              totalWeight: 0,
              totalPrice: 0,
              ruta: "",
            }
        }
        target={
          mergeConfirm
            ? {
              customerName: mergeConfirm.target.customerName,
              slCode: mergeConfirm.target.slCode,
              rowCount: mergeConfirm.target.rowCount,
              totalWeight: mergeConfirm.targetWeight,
              totalPrice: mergeConfirm.targetPrice,
              ruta: mergeConfirm.target.ruta,
            }
            : {
              customerName: "",
              slCode: "",
              rowCount: 0,
              totalWeight: 0,
              totalPrice: 0,
              ruta: "",
            }
        }
        invoiceImpact={mergeConfirm?.invoiceImpact}
        onClose={() => setMergeConfirm(null)}
        onConfirm={() => {
          if (!mergeConfirm) return;
          applyExplicitMatch(mergeConfirm.sourceIdxs, {
            slCode: mergeConfirm.target.slCode,
            fullName: mergeConfirm.target.customerName,
            ruta: mergeConfirm.target.ruta,
          });
          setMergeConfirm(null);
        }}
      />

      {/* ── Integrity audit modal — surfaces cross-source inconsistencies
          (manifest vs packages / encomiendas / invoices) and lets the
          operator apply high-confidence repairs in a single batch. The
          repair affects ONLY manifests + packages — invoices are handled
          via the separate per-badge X button (NovaDeleteInvoiceConfirmModal).
          After Apply, we re-run the audit so the modal reflects the
          new state without manual refetch. ─────────────────────────────── */}
      <NovaIntegrityModal
        open={showIntegrityModal}
        report={integrityAudit.report}
        loading={integrityAudit.loading}
        onClose={() => setShowIntegrityModal(false)}
        onRefresh={integrityAudit.runAudit}
        onApply={async (repairs) => {
          if (!resultData.manifestNumber || repairs.length === 0) return;
          const result = await applyIntegrityRepairs(
            resultData.manifestNumber,
            repairs,
          );
          // ── Operator feedback ────────────────────────────────────────
          // Surface every meaningful side-effect of the repair so the
          // operator sees more than a silent UI refresh. The toast is
          // a single source of truth for: success counts, invoice number
          // rewrites, temp-customer cleanup, and Firestore-level failures.
          // Critical for trust — without this the operator can't tell
          // whether the apply did the SP1↔SP2 cross-collection writes the
          // policy promises (manifests + packages + encomiendas + invoices).
          if (!result.ok) {
            console.warn("[Nova] Integrity repair failed:", result.error);
            toast({
              variant: "destructive",
              title: "No se pudieron aplicar las correcciones",
              description:
                result.error ?? "Error desconocido al guardar en Firestore.",
            });
          } else {
            const parts: string[] = [];
            parts.push(
              `${result.manifestRowsUpdated} fila${result.manifestRowsUpdated !== 1 ? "s" : ""} corregida${result.manifestRowsUpdated !== 1 ? "s" : ""}`,
            );
            if (result.invoicesDocsUpdated > 0) {
              parts.push(
                `${result.invoicesDocsUpdated} factura${result.invoicesDocsUpdated !== 1 ? "s" : ""} actualizada${result.invoicesDocsUpdated !== 1 ? "s" : ""}`,
              );
            }
            if (result.invoiceNumberRewrites.length > 0) {
              parts.push(
                `${result.invoiceNumberRewrites.length} N°-factura reescrito${result.invoiceNumberRewrites.length !== 1 ? "s" : ""}`,
              );
            }
            if (result.tempCustomersDeleted.length > 0) {
              parts.push(
                `${result.tempCustomersDeleted.length} cliente${result.tempCustomersDeleted.length !== 1 ? "s" : ""} temporal${result.tempCustomersDeleted.length !== 1 ? "es" : ""} eliminado${result.tempCustomersDeleted.length !== 1 ? "s" : ""}`,
              );
            }
            if (result.missingPackageDocs.length > 0) {
              parts.push(
                `Alerta: ${result.missingPackageDocs.length} sin doc en packages`,
              );
            }
            toast({
              title: "Correcciones aplicadas",
              description: parts.join(" · "),
            });
          }
          // Re-audit so the modal reflects the post-repair state. The
          // table itself updates via the manifest-realtime path that
          // useNovaChat already wires up (saveManifestRecord triggers
          // an onSnapshot tick on `manifests/{id}`).
          await integrityAudit.runAudit();
        }}
      />

      {/* ── Delete-invoice confirm modal — destructive action gated by
          confirmation. The modal itself handles the typed-confirmation
          requirement for protected statuses (sent/paid/overdue/pending),
          so the wire-up here is just "open with target → on confirm,
          delete + close". The realtime invoices subscription
          (`subscribeInvoicesByManifest`) auto-refreshes `persistedInvoices`
          so the badge disappears from the table without an explicit
          re-fetch. ───────────────────────────────────────────────────── */}
      <NovaDeleteInvoiceConfirmModal
        open={deleteInvoiceTarget !== null}
        invoice={deleteInvoiceTarget}
        onClose={() => setDeleteInvoiceTarget(null)}
        onConfirm={async () => {
          if (!deleteInvoiceTarget) return;
          const ok = await deleteInvoiceById(deleteInvoiceTarget.invoiceId);
          if (!ok) {
            console.warn(
              "[Nova] Failed to delete invoice",
              deleteInvoiceTarget.invoiceId,
            );
          }
          setDeleteInvoiceTarget(null);
        }}
      />

      {/* Route picker modal — portaled to body so it escapes the outer motion.div stacking context */}
      {routePicker &&
        createPortal(
          <AnimatePresence>
            <RoutePickerModal
              slCode={routePicker.slCode}
              customerName={routePicker.customerName}
              currentRuta={routePicker.currentRuta}
              onClose={() => setRoutePicker(null)}
              onSaved={(ruta) => {
                setRutaOverrides((prev) => ({
                  ...prev,
                  [routePicker.slCode]: ruta,
                }));
              }}
            />
          </AnimatePresence>,
          document.body,
        )}

      {/* Customer quick-view modal — portaled to body */}
      {customerQuickView &&
        createPortal(
          <NovaCustomerQuickViewModal
            slCode={customerQuickView}
            onClose={() => setCustomerQuickView(null)}
          />,
          document.body,
        )}

      {/* Name-edit confirmation modal */}
      <NovaNameEditConfirmModal
        state={nameEditConfirm}
        onConfirmSingle={(idx, newName) => applyNameAndMatch([idx], newName)}
        onConfirmGroup={(groupIdxs, newName) =>
          applyNameAndMatch(groupIdxs, newName)
        }
        onClose={() => setNameEditConfirm(null)}
      />

      {/* Peso-edit confirmation modal */}
      <NovaPesoEditConfirmModal
        state={pesoEditConfirm}
        tc={tc}
        onConfirm={(idx, newPeso, newPrice) => {
          const row = resultData.rows[idx];
          const tracking = String(row?.tracking || '').toUpperCase();
          setPesoOverrides((prev) => ({ ...prev, [idx]: newPeso }));
          if (tracking) {
            setPriceOverrides((prev) => ({
              ...prev,
              [tracking]: { precio: newPrice, pesoRedondeo: Math.ceil(newPeso) },
            }));
          }
        }}
        onClose={() => setPesoEditConfirm(null)}
      />

      {/* Unlink action chooser — portaled to body to escape motion.div stacking context */}
      {createPortal(
        <NovaUnlinkActionModal
          state={unlinkActionModal}
          getRowName={(idx) => resultData.rows[idx]?.nombre ?? ""}
          availableGroups={availableGroups}
          onClose={() => setUnlinkActionModal(null)}
          onUnlinkOnly={(indices) => {
            indices.forEach((i) => operatorManualUnlinksRef.current.add(i));
            handleUnlinkOnly(indices);
            setShowOnlyDivergent(false);
          }}
          onUnlinkAndRematch={async (indices, getName) => {
            indices.forEach((i) => operatorManualUnlinksRef.current.add(i));
            await handleUnlinkAndRematch(indices, getName);
            setShowOnlyDivergent(false);
          }}
          onAssignClient={(indices, nombre) => {
            setUnlinkMatch({
              rowIndex: indices[0],
              nombre,
              multipleRows: indices.length > 1 ? indices : undefined,
            });
          }}
          onMoveToGroup={async (indices, targetGroupKey) => {
            // Find target group info
            const targetGroup = availableGroups.find(
              (g) => g.key === targetGroupKey,
            );
            if (!targetGroup) return;

            const targetRuta = targetGroup.slCode
              ? (rutaOverrides[targetGroup.slCode] ?? targetGroup.ruta ?? "")
              : "";

            // Pre-construct the NEW override objects that will be set.
            // We need these to build the resolved rows for immediate save.
            const newSlCodeOverrides: Record<
              number,
              { slCode: string; ruta: string }
            > = {};
            const newMatchOverrides: Record<
              number,
              { slCode: string; fullName: string; ruta: string }
            > = {};
            const newNameOverrides: Record<number, string> = {};
            const newUnlinkedRows = new Set(unlinkedRows);
            // BUG-MOVE-UNMATCHED-STALE-SLCODE 2026-04-29: track indices whose
            // target is an unmatched group so we can (a) clear their stale
            // slCode/match overrides from React state and (b) write slCode=''
            // in the immediate save — the previous code deleted from the
            // just-created empty objects (no-op) and propagated the old slCode
            // via the `|| slCodeOverrides[idx]?.slCode` fallback chain.
            const indicesMovedToUnmatched: number[] = [];

            indices.forEach((idx) => {
              operatorManualUnlinksRef.current.add(idx);
              if (targetGroup.slCode) {
                // Target is a matched group: remove from unlinked, assign slCode
                newUnlinkedRows.delete(idx);
                newSlCodeOverrides[idx] = {
                  slCode: targetGroup.slCode,
                  ruta: targetRuta,
                };
                newMatchOverrides[idx] = {
                  slCode: targetGroup.slCode,
                  fullName: targetGroup.name,
                  ruta: targetRuta,
                };
              } else {
                // Target is an unmatched group: ADD to unlinked so groupKey
                // resolves to __unmatched__${name} in sortedGroups.
                newUnlinkedRows.add(idx);
                newNameOverrides[idx] = targetGroup.name;
                indicesMovedToUnmatched.push(idx);
              }
            });

            // Apply to React state (async - UI will update)
            setUnlinkedRows(newUnlinkedRows);
            if (Object.keys(newSlCodeOverrides).length > 0) {
              setSlCodeOverrides((prev) => ({
                ...prev,
                ...newSlCodeOverrides,
              }));
            }
            if (Object.keys(newMatchOverrides).length > 0) {
              setMatchOverrides((prev) => ({ ...prev, ...newMatchOverrides }));
            }
            if (Object.keys(newNameOverrides).length > 0) {
              setNameOverrides((prev) => ({ ...prev, ...newNameOverrides }));
            }
            // Clear stale slCode/match overrides for rows moved to unmatched group.
            // These can't be batched into the objects above because the state
            // updater needs to DELETE existing keys, not just spread new ones.
            if (indicesMovedToUnmatched.length > 0) {
              setSlCodeOverrides((prev) => {
                const next = { ...prev };
                indicesMovedToUnmatched.forEach((i) => delete next[i]);
                return next;
              });
              setMatchOverrides((prev) => {
                const next = { ...prev };
                indicesMovedToUnmatched.forEach((i) => delete next[i]);
                return next;
              });
            }
            if (targetRuta && targetGroup.slCode) {
              setRutaOverrides((prev) => ({
                ...prev,
                [targetGroup.slCode]: targetRuta,
              }));
            }
            setShowOnlyDivergent(false);

            // IMMEDIATE PERSISTENCE: Build resolved rows with the NEW overrides
            // and save directly. This bypasses the async React state propagation.
            try {
              const movedToUnmatched = new Set<number>(indicesMovedToUnmatched);
              const resolvedRows = resultData.rows.map((row, idx) => {
                const isUnmatchedMove = movedToUnmatched.has(idx);
                // For rows moved to an unmatched group: force slCode to '' so
                // the manifest doc reflects the intentional unlink.
                const newSlCode = isUnmatchedMove
                  ? ""
                  : (newSlCodeOverrides[idx]?.slCode ??
                    slCodeOverrides[idx]?.slCode ??
                    matchOverrides[idx]?.slCode ??
                    row.slCode ??
                    "");
                const newMatchName = isUnmatchedMove
                  ? (newNameOverrides[idx] ?? row.nombre)
                  : (newMatchOverrides[idx]?.fullName ??
                    matchOverrides[idx]?.fullName ??
                    newNameOverrides[idx] ??
                    nameOverrides[idx] ??
                    row.nombreCliente ??
                    row.nombre);
                const newRuta = newSlCode
                  ? (rutaOverrides[newSlCode] ??
                    newSlCodeOverrides[idx]?.ruta ??
                    slCodeOverrides[idx]?.ruta ??
                    matchOverrides[idx]?.ruta ??
                    row.ruta ??
                    "")
                  : "";

                return {
                  ...row,
                  slCode: isUnmatchedMove ? "" : newSlCode || row.slCode,
                  nombreCliente: newMatchName,
                  ruta: newRuta,
                };
              });

              const filteredRows = resolvedRows.filter((_, idx) => !deletedIndices.has(idx));

              await saveManifestRecord(
                filteredRows,
                resultData.manifestNumber,
                {
                  manifestType: resultData.manifestType as string,
                  customerContacts: customerContactMap,
                  exchangeRate: tc,
                },
              );

              autoSave.markSaved();
            } catch (err) {
              console.error("[Nova] Failed to save move-to-group:", err);
            }
          }}
        />,
        document.body,
      )}

      {/* Customer search / re-assign modal — portaled to body so it appears above z-[60] tableModal */}
      {unlinkMatch &&
        createPortal(
          <CustomerSearchModal
            nombre={unlinkMatch.nombre}
            currentSlCode={unlinkMatch.currentSlCode}
            onClose={() => setUnlinkMatch(null)}
            onCreateNew={() => {
                // Carry the row indices from the unlink dialog so onCreated can
                // apply slCodeOverrides to every targeted row. Without rowIndices
                // the onCreated handler would crash calling forEach on undefined.
                const targetRows = unlinkMatch.multipleRows ?? [
                  unlinkMatch.rowIndex,
                ];
                setCreateCustomer({
                  nombre: unlinkMatch.nombre,
                  rowIndex: unlinkMatch.rowIndex,
                  rowIndices: targetRows,
                });
              }}
              onSelected={(slCode, fullName, ruta) => {
                const targetRows = unlinkMatch.multipleRows || [
                  unlinkMatch.rowIndex,
                ];
                const proceed = () => {
                  setUnlinkedRows((prev) => {
                    const next = new Set(prev);
                    targetRows.forEach((i) => next.delete(i));
                    return next;
                  });
                  setMatchOverrides((prev) => {
                    const next = { ...prev };
                    targetRows.forEach((idx) => {
                      next[idx] = { slCode, fullName, ruta };
                    });
                    return next;
                  });
                  setSlCodeOverrides((prev) => {
                    const next = { ...prev };
                    targetRows.forEach((idx) => {
                      next[idx] = { slCode, ruta };
                    });
                    return next;
                  });
                  if (ruta)
                    setRutaOverrides((prev) => ({ ...prev, [slCode]: ruta }));

                  targetRows.forEach((idx) => {
                    const row = resultData.rows[idx];
                    if (row) {
                      onSelectMatch?.(
                        idx,
                        slCode,
                        ruta || row.ruta || "",
                        row.consolidacion || false,
                        fullName
                      );
                    }
                  });

                  // BUG-E5: refresh contact map so email/recibo is available immediately
                  getCustomersBySlCodes([slCode])
                    .then((newMap) => {
                      setCustomerContactMap(
                        (prev) => new Map([...prev, ...newMap]),
                      );
                    })
                    .catch(() => { });

                  // Save feedback to Nova Learning (match_feedback) so it can help with future matches
                  const uniqueNamesToLearn = new Set<string>();
                  targetRows.forEach((idx) => {
                    const row = resultData.rows[idx];
                    if (row && row.nombre) {
                      uniqueNamesToLearn.add(row.nombre.trim());
                    }
                  });

                  uniqueNamesToLearn.forEach((manifestName) => {
                    const matchingRowIdx = targetRows.find(
                      (idx) => resultData.rows[idx]?.nombre === manifestName
                    );
                    const origRow = matchingRowIdx !== undefined ? resultData.rows[matchingRowIdx] : undefined;
                    if (origRow) {
                      saveMatchFeedback({
                        manifestName,
                        slCode,
                        fullName,
                        ruta: ruta || null,
                        consolidationEnabled: origRow.consolidacion || false,
                        source: "admin_manual",
                      }).catch(() => { });
                    }
                  });

                  setApprovedMatches((prev) => {
                    const next = new Set(prev);
                    targetRows.forEach((idx) => next.add(idx));
                    return next;
                  });
                };

                let collision: { tracking: string; preAlertSlCode: string } | null = null;
                for (const idx of targetRows) {
                  const row = resultData.rows[idx];
                  if (row) {
                    const normTracking = (row.tracking || "").toUpperCase().trim();
                    const preAlert = preAlertsMap.get(normTracking);
                    if (
                      preAlert?.found &&
                      preAlert.slCode &&
                      preAlert.slCode.toUpperCase() !== slCode.toUpperCase()
                    ) {
                      collision = { tracking: row.tracking || "", preAlertSlCode: preAlert.slCode };
                      break;
                    }
                  }
                }

                if (collision) {
                  setReassignPreAlertConfirm({
                    slCode,
                    fullName,
                    ruta: ruta || "",
                    preAlertSlCode: collision.preAlertSlCode,
                    trackingNumber: collision.tracking,
                    onConfirm: () => {
                      proceed();
                      setReassignPreAlertConfirm(null);
                    },
                  });
                } else {
                  proceed();
                }
                setUnlinkMatch(null);
              }}
            />,
          document.body,
        )}

      {/* Invoice wizard — steps through a queue of invoices (one per permiso + consolidated normal rows) */}
      {invoiceWizard &&
        (() => {
          const { queue, index, withSend } = invoiceWizard;
          const current = enrichInv(queue[index]);
          const total = queue.length;
          const isLast = index === total - 1;

          const handleClose = () => setInvoiceWizard(null);

          const handleConfirm = async (inv: InvoiceRecord) => {
            if (withSend) {
              await sendInvoiceEmails([inv as InvoiceRecord]);
            }
            if (isLast) {
              setInvoiceWizard(null);
            } else {
              setInvoiceWizard((prev) =>
                prev ? { ...prev, index: prev.index + 1 } : null,
              );
            }
          };

          return (
            <div className="fixed inset-0 z-[75]">
              {/* Step indicator pill — anchored above the modal */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[76] flex items-center gap-2 px-3 py-1.5 rounded-full bg-background border border-border shadow-lg">
                {queue.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2 rounded-full transition-all",
                      i < index
                        ? "w-4 bg-green-500"
                        : i === index
                          ? "w-6 bg-primary"
                          : "w-2 bg-border",
                    )}
                  />
                ))}
                <span className="text-xs font-semibold text-foreground ml-1">
                  Factura {index + 1} de {total}
                </span>
              </div>
              <NovaInvoicePreview
                invoice={current}
                onClose={handleClose}
                onConfirmSend={withSend ? handleConfirm : undefined}
                onTestSend={
                  withSend
                    ? async (inv, email) => {
                      await sendTestInvoiceEmail(inv as InvoiceRecord, email);
                    }
                    : undefined
                }
                customerConsolidationEnabled={getCustomerConsEnabled(current)}
              />
            </div>
          );
        })()}

      {/* Edit customer modal — portaled to body so it escapes the outer motion.div stacking context */}
      {editCustomer &&
        createPortal(
          <NovaEditCustomerModal
            isOpen={!!editCustomer}
            slCode={editCustomer.slCode}
            initialData={{
              fullName: editCustomer.fullName,
              email: editCustomer.email,
              dni: editCustomer.dni,
              phone: editCustomer.phone,
              ruta: editCustomer.ruta,
            }}
            onClose={() => setEditCustomer(null)}
            onSuccess={({
              fullName: newFullName,
              email,
              dni,
              phone: newPhone,
              ruta: newRuta,
            }) => {
              // Eagerly mirror the just-saved values into customerContactMap so
              // every consumer of the displayName fallback chain (group header,
              // per-row cell, divergent-match detection, invoice creation,
              // shipping label) sees the new name immediately. The
              // `subscribeCustomersBySlCodes` onSnapshot will eventually
              // confirm via Firestore, but doing this synchronously avoids
              // the brief stale-name flash between modal close and snapshot
              // tick.
              setCustomerContactMap((prev) => {
                const next = new Map(prev);
                const existing = next.get(editCustomer.slCode);
                next.set(editCustomer.slCode, {
                  slCode: editCustomer.slCode,
                  fullName:
                    newFullName ||
                    existing?.fullName ||
                    editCustomer.fullName ||
                    "",
                  email,
                  phone: newPhone || existing?.phone || "",
                  dni,
                  ruta: newRuta || existing?.ruta || "",
                  consolidationEnabled: existing?.consolidationEnabled ?? false,
                  electronicInvoiceRequired:
                    existing?.electronicInvoiceRequired ?? false,
                  encomiendaServiceName: existing?.encomiendaServiceName ?? "",
                });
                return next;
              });
              // BUG-E3: update rutaOverrides so table reflects ruta change immediately
              if (newRuta)
                setRutaOverrides((prev) => ({
                  ...prev,
                  [editCustomer.slCode]: newRuta,
                }));
            }}
          />,
          document.body,
        )}

      {/* Shipping label modal — triggered from group header "Etiqueta" button */}
      <NovaShippingLabelModal
        data={shippingLabelData}
        onClose={() => setShippingLabelData(null)}
      />
    </motion.div>
  );
});

export { ResultSummary as NovaTableModal };
