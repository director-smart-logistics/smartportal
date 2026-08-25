import { useState, useCallback, useMemo, memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUpdateCustomer, useDeleteCustomer, useSyncCustomers, useCustomerSearch, customersKeys } from "@/lib/hooks/queries/useCustomers";
import { useQueryClient } from "@tanstack/react-query";
import { collection, query, where, getCountFromServer, getDocs, limit, Timestamp } from "firebase/firestore";
import { db, dbSP2 } from "@/lib/firebase/config";
import { COLLECTIONS, backfillSearchTokens } from "@/lib/firebase/firestore-client";
import { invalidateCustomerCache } from "@/lib/services/customer-matcher";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditCustomerModal } from "@/components/customer/EditCustomerModal";
import { CustomerDetailModal } from "@/components/customer/CustomerDetailModal";
import { RecreateCustomerModal } from "@/components/customer/RecreateCustomerModal";
import { ForceSyncCustomerModal } from "@/components/customer/ForceSyncCustomerModal";
import { WelcomeEmailModal, WelcomeCustomerTarget } from "@/components/customer/WelcomeEmailModal";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Search,
  Mail,
  Phone,
  MapPin,
  Loader2,
  RefreshCw,
  Database,
  Edit2,
  Eye,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Trash2,
  RotateCcw,
  CloudDownload,
  ChevronDown,
  Users,
  UserPlus,
  BarChart3,
  Calendar as CalendarIcon,
  Filter,
  X,
} from "lucide-react";

interface CustomerData {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  dni?: string;
  email: string;
  phone: string;
  address?: string;
  slCode?: string;
  city?: string;
  country?: string;
  zipCode?: string;
  deliveryAddress1?: string;
  deliveryAddress2?: string;
  deliveryAddress3?: string;
  notes?: string;
  status: "active" | "inactive" | "suspended" | "deleted";
  memberSince?: string;
  createdAt: string;
  acceptMarketing?: boolean;
  consolidationEnabled?: boolean;
  consolidationEnabledAt?: string | null;
  consolidationActivatedAt?: string | null;
  consolidationStartedAt?: string | null;
  consolidationDisabledAt?: string | null;
  updatedAt?: string | null;
  lastSyncAt?: string | null;
  modifiedAt?: string | null;
  encomiendaProvider?: string;
  courierService?: string;
  encomienda?: { id?: string; name?: string } | null;
  defaultAddress?: { encomienda?: { name?: string } | null } | null;
  addresses?: Array<{ encomienda?: { id?: string; name?: string } | null }>;
  electronicInvoiceRequired?: boolean;
  showPromoBanner?: boolean;
  showVerificationModal?: boolean;
  showVisitGuide?: boolean;
  tier?: string;
  membershipTier?: string;
  ruta?: string;
  preferredRouteId?: string;
  preferredLanguage?: string;
  timezone?: string;
  location?: { province?: string; canton?: string; district?: string; city?: string; country?: string };
  isVerified?: boolean;
  verifiedDni?: string;
  verifiedEmail?: string;
  verifiedPhone?: string;
  birthDate?: string;
  nationality?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const hasValue = (v: unknown): boolean =>
  v !== null && v !== undefined && v !== "";

/**
 * Formats an ISO/millis/Firestore-Timestamp value into a short es-CR locale string.
 * Returns an empty string for nullish or invalid values.
 *
 * @param raw - ISO string, timestamp number, or Firestore Timestamp object
 * @param opts - Optional configuration including whether to show time (hh:mm)
 * @returns Formatted date string (e.g. "15 ago 2026") or empty string
 */
function fmtCustomerDate(raw: unknown, opts?: { showTime?: boolean }): string {
  if (!hasValue(raw)) return "";
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
      ...(opts?.showTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(d);
  } catch {
    return "";
  }
}

/**
 * Resolves the true earliest registration date for a customer across multiple legacy
 * and SP2 synchronization fields (`memberSince`, `createdAt`, `sp2CreatedAt`, `termsAcceptedAt`).
 *
 * @param c - Customer profile document or object
 * @returns The earliest raw date found or null if none is present
 */
function resolveCustomerEarliestRegDate(c: any): any {
  if (!c) return null;
  if (typeof c === "string" || c instanceof Date || c?.toDate || (typeof c === "object" && "_seconds" in c)) {
    return c;
  }
  const candidates = [c.memberSince, c.createdAt, c.sp2CreatedAt, c.termsAcceptedAt].filter(Boolean);
  if (candidates.length === 0) return null;

  let earliestDate: Date | null = null;
  let earliestRaw: any = null;

  for (const raw of candidates) {
    const { dateObj } = parseCustomerRegDate(raw);
    if (dateObj && !isNaN(dateObj.getTime())) {
      if (!earliestDate || dateObj.getTime() < earliestDate.getTime()) {
        earliestDate = dateObj;
        earliestRaw = raw;
      }
    }
  }

  return earliestRaw || c.memberSince || c.createdAt || c.sp2CreatedAt || null;
}

/**
 * Parses any raw customer registration date into a normalized Date object,
 * standard YYYY-MM-DD string, and display DD/MM/YYYY string.
 *
 * @param rawDate - String, Timestamp, or Date representation of registration
 * @returns Object containing `dateObj`, `yyyyMmDd`, and `displayDdMmYyyy`
 */
function parseCustomerRegDate(rawDate: any): { dateObj: Date | null; yyyyMmDd: string; displayDdMmYyyy: string } {
  if (!rawDate) return { dateObj: null, yyyyMmDd: "", displayDdMmYyyy: "" };

  if (typeof rawDate === "string") {
    const cleanStr = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [y, m, d] = cleanStr.split("-").map(Number);
      const localDate = new Date(y, m - 1, d, 12, 0, 0);
      return {
        dateObj: localDate,
        yyyyMmDd: cleanStr,
        displayDdMmYyyy: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
      };
    }
    const parsed = new Date(cleanStr);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return {
        dateObj: parsed,
        yyyyMmDd: `${y}-${m}-${d}`,
        displayDdMmYyyy: `${d}/${m}/${y}`,
      };
    }
    return { dateObj: null, yyyyMmDd: cleanStr.slice(0, 10), displayDdMmYyyy: cleanStr };
  }

  let dateObj: Date | null = null;
  if (rawDate?.toDate) {
    dateObj = rawDate.toDate();
  } else if (typeof rawDate === "object" && rawDate !== null && "_seconds" in rawDate) {
    dateObj = new Date(rawDate._seconds * 1000);
  } else if (rawDate instanceof Date) {
    dateObj = rawDate;
  }

  if (dateObj && !isNaN(dateObj.getTime())) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return {
      dateObj,
      yyyyMmDd: `${y}-${m}-${d}`,
      displayDdMmYyyy: `${d}/${m}/${y}`,
    };
  }

  return { dateObj: null, yyyyMmDd: "", displayDdMmYyyy: "" };
}

/**
 * Resolves the customer's selected encomienda service name from the SP1-native
 * shapes (`encomienda.name`, `defaultAddress.encomienda.name`,
 * `addresses[].encomienda.name`, `courierService`) and finally the SP2-synced
 * field (`encomiendaProvider`, raw id). Empty string when nothing is set.
 */
interface EncomiendaResolvable {
  encomiendaProvider?: string;
  courierService?: string;
  encomienda?: { id?: string; name?: string } | null;
  defaultAddress?: { encomienda?: { name?: string } | null } | null;
  addresses?: Array<{ encomienda?: { id?: string; name?: string } | null }>;
}

function getEncomiendaServiceName(c: EncomiendaResolvable): string {
  const addrName = Array.isArray(c.addresses)
    ? c.addresses.find(a => a?.encomienda?.name)?.encomienda?.name
    : undefined;
  const candidates: Array<unknown> = [
    c.encomienda?.name,
    c.defaultAddress?.encomienda?.name,
    addrName,
    c.courierService,
    c.encomiendaProvider,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Properties for the memoized CustomerRow component.
 * Receives all customer metadata and action callbacks directly from the parent table
 * to ensure pure prop-driven rendering with zero secondary network reads.
 */
interface CustomerRowProps {
  /** Customer entity containing profile, routes, consolidation status and timestamps */
  customer: any;
  /** Row index for stagger animation */
  idx: number;
  /** Current theme state */
  isDark: boolean;
  /** Permission checker for update operations */
  canUpdate: (perm: string) => boolean;
  /** Permission checker for delete operations */
  canDelete: (perm: string) => boolean;
  /** ID of customer currently undergoing an asynchronous status change */
  updateCustomerId: string | null;
  /** State setter for targets of the welcome WhatsApp/Email modal */
  setWelcomeModalTargets: React.Dispatch<React.SetStateAction<WelcomeCustomerTarget[]>>;
  /** State setter to open/close welcome modal */
  setIsWelcomeModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Callback to open CustomerDetailModal with selected customer */
  handleViewDetail: (customer: any) => void;
  /** Callback to restore a deleted customer */
  handleRestoreCustomer: (id: string) => void;
  /** Callback to toggle customer status between active and inactive */
  handleStatusChange: (id: string, status: string) => void;
  /** Callback to open EditCustomerModal */
  handleEditFromResult: (customer: any) => void;
  /** State setter to open delete confirmation dialog */
  setCustomerToDelete: (customer: any) => void;
}

/**
 * CustomerRow (Optimized Pure Component)
 *
 * Renders a single customer row in the Customers table.
 *
 * ARCHITECTURAL OPTIMIZATION (Zero N+1 Sockets):
 * Historically, each CustomerRow opened an independent `onSnapshot(doc(db, "customers", id))`
 * socket subscription on mount, resulting in 50-100 simultaneous open WebSocket listeners
 * per tab. This has been refactored into a pure memoized component driven entirely by
 * props supplied by the parent's paginated React Query (`useCustomersPaginated`).
 *
 * Mutations (edit, status toggle, delete) update or invalidate the query cache, ensuring
 * atomic list refreshes across all tabs without socket overhead.
 */
const CustomerRow = memo(function CustomerRow({
  customer,
  idx,
  isDark,
  canUpdate,
  canDelete,
  updateCustomerId,
  setWelcomeModalTargets,
  setIsWelcomeModalOpen,
  handleViewDetail,
  handleRestoreCustomer,
  handleStatusChange,
  handleEditFromResult,
  setCustomerToDelete,
}: CustomerRowProps) {

  return (
    <motion.div
      role="listitem"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: idx * 0.025 }}
      className={cn(
        "flex items-center justify-between px-4 py-3 gap-3 transition-colors",
        isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"
      )}
      data-testid={`customer-result-${customer.id}`}
    >
      {/* Avatar + info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          customer.status === "active"
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        )}>
          {(customer.fullName?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-semibold truncate", isDark ? "text-white" : "text-gray-900")}>
              {customer.fullName?.toUpperCase()}
            </span>
            {customer.slCode && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {customer.slCode}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 capitalize",
                customer.status === "active"
                  ? "border-green-500/40 text-green-600 dark:text-green-400"
                  : "border-gray-400/40 text-gray-500"
              )}
            >
              {customer.status}
            </Badge>
            {customer.consolidationEnabled && (() => {
              const enabledAtRaw =
                customer.consolidationEnabledAt ??
                customer.consolidationActivatedAt ??
                customer.consolidationStartedAt ??
                null;
              const fallbackRaw = !hasValue(enabledAtRaw)
                ? (customer.updatedAt ?? customer.lastSyncAt ?? customer.modifiedAt ?? null)
                : null;
              const exact = fmtCustomerDate(enabledAtRaw, { showTime: true });
              const approx = !exact ? fmtCustomerDate(fallbackRaw, { showTime: true }) : "";
              const tooltip = exact
                ? `Consolidación habilitada el ${exact}`
                : approx
                  ? `Consolidación habilitada (fecha aproximada ${approx})`
                  : "Consolidación habilitada (fecha no registrada)";
              const inlineDate = exact || (approx ? `~${approx}` : "");
              return (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-sky-400/60 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20"
                  title={tooltip}
                  aria-label={tooltip}
                  data-testid={`customer-consolida-badge-${customer.id}`}
                >
                  Consolida{inlineDate && <span className="ml-1 opacity-80 font-normal">· {inlineDate}</span>}
                </Badge>
              );
            })()}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {/* Registration Date */}
            {(() => {
              const rawDate = resolveCustomerEarliestRegDate(customer);
              const { displayDdMmYyyy } = parseCustomerRegDate(rawDate);
              if (!displayDdMmYyyy) return null;
              return (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded font-mono"
                  title={`Fecha de registro: ${displayDdMmYyyy}`}
                  data-testid={`customer-reg-date-${customer.id}`}
                >
                  <CalendarIcon className="h-3 w-3 text-slate-500" />
                  <span>Reg: {displayDdMmYyyy}</span>
                </span>
              );
            })()}
            {customer.email && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Mail className="h-3 w-3" />
                {customer.email}
              </span>
            )}
            {customer.phone && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Phone className="h-3 w-3" />
                {customer.phone}
              </span>
            )}
            {customer.city && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {customer.city}
              </span>
            )}
            {customer.dni && (
              <span className="text-[11px] text-muted-foreground font-mono">
                {customer.dni}
              </span>
            )}
            {customer.ruta && (() => {
              const ruta = String(customer.ruta);
              const isEnc = ruta === 'Encomiendas';
              const encName = isEnc ? getEncomiendaServiceName(customer as unknown as EncomiendaResolvable) : '';
              
              const routeDateRaw = customer.rutaSetByAdminAt ?? customer.sp1AdminUpdatedAt ?? customer.updatedAt ?? null;
              const exactRouteDate = fmtCustomerDate(routeDateRaw, { showTime: true });
              
              const tagTitle = isEnc
                ? (encName
                    ? `Servicio de encomienda: ${encName}`
                    : 'Encomiendas — servicio no asignado')
                : (exactRouteDate
                    ? `Ruta asignada: ${ruta} (desde ${exactRouteDate})`
                    : `Ruta asignada: ${ruta}`);
              return (
                <>
                  <span
                    className="flex items-center gap-1 text-[11px] font-medium text-primary/80 bg-primary/8 border border-primary/20 px-1.5 py-0 rounded"
                    title={tagTitle}
                    aria-label={tagTitle}
                    data-testid={`customer-ruta-badge-${customer.id}`}
                    data-ruta={ruta}
                  >
                    {ruta}{exactRouteDate && <span className="ml-1 opacity-80 font-normal">· {exactRouteDate}</span>}
                  </span>
                  {isEnc && encName && (
                    <span
                      className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0 rounded max-w-[160px] truncate"
                      title={`Servicio de encomienda: ${encName}`}
                      aria-label={`Servicio de encomienda: ${encName}`}
                      data-testid={`customer-encomienda-service-${customer.id}`}
                    >
                      {encName}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5 shrink-0 border-l border-border/40 pl-3 ml-2">
        <button
          type="button"
          onClick={() => {
            setWelcomeModalTargets([{
              id: customer.id,
              fullName: customer.fullName || "Cliente",
              email: customer.email || "",
              slCode: customer.slCode,
            }]);
            setIsWelcomeModalOpen(true);
          }}
          title="Enviar correo de bienvenida"
          className={cn(
            "p-2 rounded-xl transition-all shadow-sm border border-border/30 hover:scale-105 active:scale-95",
            isDark ? "hover:bg-indigo-950/60 bg-gray-800/60 text-indigo-400" : "hover:bg-indigo-50 bg-white text-indigo-600"
          )}
          aria-label={`Enviar correo de bienvenida a ${customer.fullName}`}
          data-testid={`btn-send-welcome-${customer.id}`}
        >
          <Mail className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => handleViewDetail(customer)}
          title="Ver detalles"
          className={cn(
            "p-2 rounded-xl transition-all shadow-sm border border-border/30 hover:scale-105 active:scale-95",
            isDark ? "hover:bg-gray-800 bg-gray-800/40 text-gray-300" : "hover:bg-gray-100 bg-white text-gray-700"
          )}
          aria-label={`Ver detalles de ${customer.fullName}`}
          data-testid={`btn-view-detail-${customer.id}`}
        >
          <Eye className="h-5 w-5" />
        </button>
        {customer.status === 'deleted' ? (
          <PermissionTooltip allowed={canUpdate('customers')}>
            <button
              type="button"
              onClick={() => handleRestoreCustomer(customer.id)}
              disabled={updateCustomerId === customer.id || !canUpdate('customers')}
              title="Restaurar cliente"
              className={cn(
                "p-2 rounded-xl transition-all shadow-sm border border-border/30 hover:scale-105 active:scale-95",
                isDark ? "hover:bg-green-950/60 bg-gray-800/40" : "hover:bg-green-50 bg-white"
              )}
              aria-label={`Restaurar ${customer.fullName}`}
              data-testid={`btn-restore-${customer.id}`}
            >
              {updateCustomerId === customer.id ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <RotateCcw className="h-5 w-5 text-green-500" />
              )}
            </button>
          </PermissionTooltip>
        ) : (
          <>
            <PermissionTooltip allowed={canUpdate('customers')}>
              <button
                type="button"
                onClick={() =>
                  handleStatusChange(
                    customer.id,
                    customer.status === "active" ? "inactive" : "active"
                  )
                }
                disabled={updateCustomerId === customer.id || !canUpdate('customers')}
                title={customer.status === "active" ? "Desactivar" : "Activar"}
                className={cn(
                  "p-2 rounded-xl transition-all shadow-sm border border-border/30 hover:scale-105 active:scale-95",
                  isDark ? "hover:bg-gray-800 bg-gray-800/40" : "hover:bg-gray-100 bg-white"
                )}
                aria-label={customer.status === "active" ? "Desactivar cliente" : "Activar cliente"}
                data-testid={`btn-toggle-status-${customer.id}`}
              >
                {updateCustomerId === customer.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : customer.status === "active" ? (
                  <ToggleRight className="h-5 w-5 text-green-500" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
            </PermissionTooltip>
            <PermissionTooltip allowed={canUpdate('customers')}>
              <button
                type="button"
                onClick={() => handleEditFromResult(customer)}
                disabled={!canUpdate('customers')}
                title="Editar cliente"
                className={cn(
                  "p-2 rounded-xl transition-all shadow-sm border border-border/30 hover:scale-105 active:scale-95",
                  isDark ? "hover:bg-amber-950/40 bg-gray-800/40 text-amber-400" : "hover:bg-amber-50 bg-white text-amber-600"
                )}
                aria-label={`Editar ${customer.fullName}`}
                data-testid={`btn-edit-${customer.id}`}
              >
                <Edit2 className="h-5 w-5" />
              </button>
            </PermissionTooltip>
            <PermissionTooltip allowed={canDelete('customers')}>
              <button
                type="button"
                onClick={() => setCustomerToDelete(customer)}
                disabled={!canDelete('customers')}
                title="Eliminar cliente"
                className={cn(
                  "p-2 rounded-xl transition-all shadow-sm border border-border/30 hover:scale-105 active:scale-95",
                  isDark ? "hover:bg-red-950/60 bg-gray-800/40 text-red-400" : "hover:bg-red-50 bg-white text-red-500"
                )}
                aria-label={`Eliminar ${customer.fullName}`}
                data-testid={`btn-delete-${customer.id}`}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </PermissionTooltip>
          </>
        )}
      </div>
    </motion.div>
  );
});

const Customers = memo(function Customers() {
  const { t } = useLocale(['customers', 'common']);
  const { theme } = useTheme();
  const { toast } = useToast();
  const { canUpdate, canDelete, canManage } = usePermissions();

  const isDark = theme === "dark";

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CustomerData | null>(null);
  const [updateCustomerId, setUpdateCustomerId] = useState<string | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerData | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isRecreateOpen, setIsRecreateOpen] = useState(false);
  const [isForceSyncOpen, setIsForceSyncOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);
  const [customerCounts, setCustomerCounts] = useState<{ totalCustomers: number; newCustomersThisMonth: number } | null>(null);
  const [isFetchingCounts, setIsFetchingCounts] = useState(false);
  const [selectedRegistrationDate, setSelectedRegistrationDate] = useState<Date | undefined>(undefined);
  const [isFilteringByDate, setIsFilteringByDate] = useState<boolean>(false);
  const [dateFilteredCustomers, setDateFilteredCustomers] = useState<any[] | null>(null);
  const [isLoadingDateQuery, setIsLoadingDateQuery] = useState<boolean>(false);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [welcomeModalTargets, setWelcomeModalTargets] = useState<WelcomeCustomerTarget[]>([]);

  const queryClient = useQueryClient();
  const updateCustomerMutation = useUpdateCustomer(updateCustomerId || "");
  const deleteCustomerMutation = useDeleteCustomer();
  const syncCustomersMutation = useSyncCustomers();

  const { results: searchResults, isLoading: searchLoading } = useCustomerSearch(searchQuery, 280, 60);

  // Active customer list: date filtered list when date query executed, otherwise search results
  const displayedCustomers = useMemo(() => {
    if (isFilteringByDate && dateFilteredCustomers !== null) {
      return dateFilteredCustomers;
    }
    return searchResults;
  }, [searchResults, isFilteringByDate, dateFilteredCustomers]);

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: customersKeys.all });
      queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
    };
    window.addEventListener('customer-ruta-updated', handler);
    return () => window.removeEventListener('customer-ruta-updated', handler);
  }, [queryClient]);

  /**
   * Executes an explicit, bounded Firestore query for customers registered on a specific date.
   *
   * ARCHITECTURAL NOTE (Bounded Scan & In-Memory Filter):
   * Limits initial fetch to 3,000 documents and evaluates earliest registration date
   * across multiple legacy and SP2 fields in-memory without unindexed Firestore scans.
   */
  const handleExecuteDateQuery = useCallback(async () => {
    if (!selectedRegistrationDate) {
      setDateFilteredCustomers(null);
      setIsFilteringByDate(false);
      return;
    }
    try {
      setIsLoadingDateQuery(true);
      setIsFilteringByDate(true);
      setSearchQuery(""); // Clear text search when date filter is activated
      const targetDateStr = format(selectedRegistrationDate, "yyyy-MM-dd");

      const collRef = collection(db, COLLECTIONS.CUSTOMERS);
      const qSnap = await getDocs(query(collRef, limit(3000)));

      const matching = qSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter((c: any) => {
          const rawDate = resolveCustomerEarliestRegDate(c);
          const { yyyyMmDd } = parseCustomerRegDate(rawDate);
          return yyyyMmDd === targetDateStr;
        });

      setDateFilteredCustomers(matching);
      toast({
        title: "Consulta completada",
        description: `Se encontraron ${matching.length} cliente(s) registrados el ${format(selectedRegistrationDate, "dd/MM/yyyy", { locale: es })}.`,
      });
    } catch (error) {
      console.error("Error al ejecutar consulta por fecha:", error);
      toast({
        title: t("common.error"),
        description: "No se pudieron obtener los clientes para la fecha seleccionada.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDateQuery(false);
    }
  }, [selectedRegistrationDate, toast, t]);

  /** Clears the active registration date filter and restores default search list */
  const handleClearDateFilter = useCallback(() => {
    setSelectedRegistrationDate(undefined);
    setDateFilteredCustomers(null);
    setIsFilteringByDate(false);
  }, []);

  /** Handles changes in search query input, clearing any conflicting date filters */
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (value.length > 0 && (isFilteringByDate || dateFilteredCustomers !== null || selectedRegistrationDate !== undefined)) {
      handleClearDateFilter();
    }
  }, [isFilteringByDate, dateFilteredCustomers, selectedRegistrationDate, handleClearDateFilter]);

  /**
   * On-demand calculation of customer count metrics (total count + new this month).
   *
   * ARCHITECTURAL NOTE (Cost Optimization):
   * This calculation never runs automatically on mount to avoid unnecessary read consumption.
   * Total customers are retrieved via `getCountFromServer` (zero body payload download cost).
   */
  const handleFetchCounts = useCallback(async () => {
    try {
      setIsFetchingCounts(true);
      const collRef = collection(db, COLLECTIONS.CUSTOMERS);

      // 1. Total customers count in SP1
      const totalSnap = await getCountFromServer(collRef);
      const totalCustomers = totalSnap.data().count;

      // 2. Start of present month in Costa Rica local time
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      let newCustomersThisMonth = 0;

      try {
        const qSnap = await getDocs(query(collRef, limit(3500)));
        qSnap.docs.forEach((docSnap) => {
          const d = docSnap.data();
          // Exclude bulk migrated users & inactive/deleted users
          const isMigrated = d.migratedFromWordPress === true || d.migratedFromLegacy === true || !!d.wpUserId;
          const isInactiveOrDeleted = d.status === "inactive" || d.status === "deleted";
          if (isMigrated || isInactiveOrDeleted) return;

          const rawDate = resolveCustomerEarliestRegDate(d);
          if (!rawDate) return;

          const { dateObj } = parseCustomerRegDate(rawDate);

          if (dateObj && !isNaN(dateObj.getTime()) && dateObj >= startOfMonth) {
            newCustomersThisMonth++;
          }
        });
      } catch (e) {
        console.warn("Error al calcular clientes nuevos del mes:", e);
      }

      setCustomerCounts({
        totalCustomers,
        newCustomersThisMonth,
      });

      toast({
        title: "Contadores actualizados",
        description: `Total: ${totalCustomers.toLocaleString("es-CR")} | Nuevos este mes: ${newCustomersThisMonth.toLocaleString("es-CR")}`,
      });
    } catch (error) {
      console.error("Error al obtener contadores:", error);
      toast({
        title: t("common.error"),
        description: "No se pudieron obtener los contadores de clientes.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingCounts(false);
    }
  }, [toast, t]);

  /**
   * Synchronizes customers with Smart Portal 2.
   *
   * @param full - When true, forces a full resync recalculating fullNames and repairing corrupted records.
   */
  const handleSync = async (full = false) => {
    try {
      toast({
        title: t("common.processing"),
        description: full
          ? "Sincronización completa — re-procesando todos los clientes"
          : t("customers.syncing"),
      });
      const result = await syncCustomersMutation.mutateAsync(full);
      const stats = (result as any)?.stats;
      const detail = stats
        ? `${stats.created ?? 0} creados, ${stats.updated ?? 0} actualizados`
        : t("customers.syncSuccess");
      toast({
        title: full ? "Sincronización completa" : t("common.success"),
        description: detail,
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("customers.syncError"),
        variant: "destructive",
      });
    }
  };

  /** Generates prefix search tokens on customer records for high-speed indexing */
  const handleBackfill = async () => {
    setIsBackfilling(true);
    setBackfillProgress(null);
    try {
      const result = await backfillSearchTokens((done, total) =>
        setBackfillProgress({ done, total })
      );
      toast({
        title: t("common.success"),
        description: `Tokens generados: ${result.updated} actualizados, ${result.skipped} omitidos.`,
      });
    } catch (err) {
      toast({
        title: t("common.error"),
        description: "Error al generar tokens de búsqueda.",
        variant: "destructive",
      });
    } finally {
      setIsBackfilling(false);
      setBackfillProgress(null);
    }
  };

  /** Opens the customer detail view modal */
  const handleViewDetail = useCallback((raw: any) => {
    setDetailCustomer(raw);
    setIsDetailModalOpen(true);
  }, []);

  /** Opens the customer edit modal with complete normalized profile data */
  const handleEditFromResult = useCallback((raw: any) => {
    const customerData: CustomerData = {
      ...raw,
      id: raw.id,
      fullName: raw.fullName,
      email: raw.email,
      phone: raw.phone,
      address: raw.address,
      city: raw.city,
      country: raw.country,
      zipCode: raw.zipCode,
      status: raw.status,
      createdAt: raw.createdAt,
      slCode: raw.slCode,
      firstName: raw.firstName,
      lastName: raw.lastName,
      dni: raw.dni,
      deliveryAddress1: raw.deliveryAddress1,
      deliveryAddress2: raw.deliveryAddress2,
      deliveryAddress3: raw.deliveryAddress3,
      notes: raw.notes,
      acceptMarketing: raw.acceptMarketing,
      consolidationEnabled: raw.consolidationEnabled,
      electronicInvoiceRequired: raw.electronicInvoiceRequired,
      showPromoBanner: raw.showPromoBanner,
      showVerificationModal: raw.showVerificationModal,
      showVisitGuide: raw.showVisitGuide,
      tier: raw.tier,
      membershipTier: raw.membershipTier,
      memberSince: raw.memberSince,
      ruta: raw.ruta,
      preferredRouteId: raw.preferredRouteId,
      preferredLanguage: raw.preferredLanguage,
      timezone: raw.timezone,
      location: raw.location,
      isVerified: raw.isVerified,
      verifiedDni: raw.verifiedDni,
      verifiedEmail: raw.verifiedEmail,
      verifiedPhone: raw.verifiedPhone,
      birthDate: raw.birthDate,
      nationality: raw.nationality,
      encomienda: raw.encomienda,
      encomiendaProvider: raw.encomiendaProvider,
      defaultAddress: raw.defaultAddress,
      addresses: raw.addresses,
    };
    setSelectedCustomer(customerData);
    setIsEditModalOpen(true);
  }, []);

  /** Restores a deleted customer back to active status and invalidates customer queries */
  const handleRestoreCustomer = async (customerId: string) => {
    try {
      setUpdateCustomerId(customerId);
      await updateCustomerMutation.mutateAsync({ status: 'active' });
      queryClient.invalidateQueries({ queryKey: customersKeys.all });
      toast({
        title: t("common.success"),
        description: "Cliente restaurado correctamente.",
      });
    } catch {
      toast({
        title: t("common.error"),
        description: "No se pudo restaurar el cliente.",
        variant: "destructive",
      });
    } finally {
      setUpdateCustomerId(null);
    }
  };

  /** Permanently soft-deletes a customer and purges in-memory matching cache */
  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    try {
      await deleteCustomerMutation.mutateAsync(customerToDelete.id);
      queryClient.invalidateQueries({ queryKey: customersKeys.all });
      invalidateCustomerCache();
      toast({
        title: t("common.success"),
        description: `Cliente ${customerToDelete.fullName} eliminado correctamente.`,
      });
    } catch {
      toast({
        title: t("common.error"),
        description: "No se pudo eliminar el cliente.",
        variant: "destructive",
      });
    } finally {
      setCustomerToDelete(null);
      setDeleteConfirmText("");
    }
  };

  /**
   * Toggles customer status between active and inactive.
   *
   * @param customerId - Document ID of target customer
   * @param status - Target status ('active' | 'inactive')
   */
  const handleStatusChange = async (customerId: string, status: "active" | "inactive") => {
    try {
      setUpdateCustomerId(customerId);
      await updateCustomerMutation.mutateAsync({ status });
      toast({
        title: t("common.success"),
        description: t("customers.statusUpdateSuccess"),
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("customers.statusUpdateError"),
        variant: "destructive",
      });
    } finally {
      setUpdateCustomerId(null);
    }
  };

  const hasQuery = (searchQuery || "").trim().length >= 2;
  const isDateFilterActive = selectedRegistrationDate !== null || dateFilteredCustomers !== null;
  const showEmpty = !hasQuery && !isDateFilterActive && displayedCustomers.length === 0;
  const showNoResults = hasQuery && !searchLoading && searchResults.length === 0;

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
        data-testid="customers-page-container"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row"
          data-testid="customers-header"
        >
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                data-testid="customers-title"
              >
                {t("title")}
              </h1>

              {customerCounts && (
                <div className="flex items-center gap-2 flex-wrap" data-testid="customer-stats-badges">
                  <Badge
                    variant="outline"
                    className="bg-blue-50/80 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800 px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                    data-testid="badge-total-customers"
                  >
                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{customerCounts.totalCustomers.toLocaleString("es-CR")} registrados a la fecha</span>
                  </Badge>

                  <Badge
                    variant="outline"
                    className="bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                    data-testid="badge-new-customers-month"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{customerCounts.newCustomersThisMonth.toLocaleString("es-CR")} nuevos este mes</span>
                  </Badge>
                </div>
              )}
            </div>
            <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {hasQuery && !searchLoading
                ? `${searchResults.length} resultado${searchResults.length !== 1 ? "s" : ""} para "${searchQuery}"`
                : t("total")}
            </p>
          </div>
          <TooltipProvider>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* 1. Obtener / Actualizar Contadores */}
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleFetchCounts}
                    disabled={isFetchingCounts}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-sm cursor-pointer",
                      "border-indigo-300/70 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100/90",
                      "dark:border-indigo-700/70 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50",
                      isFetchingCounts && "opacity-60 pointer-events-none"
                    )}
                    aria-label="Obtener contadores"
                    data-testid="btn-get-customer-counts"
                  >
                    {isFetchingCounts ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <BarChart3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    )}
                    <span>{customerCounts ? "Actualizar Contadores" : "Obtener Contadores"}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center" className="max-w-xs p-3 space-y-1.5 text-xs bg-slate-900 text-slate-100 dark:bg-slate-800 dark:text-slate-100 border border-slate-700 shadow-xl rounded-lg z-50">
                  <p className="font-bold text-indigo-300 text-xs flex items-center gap-1">
                    📊 Contadores de Clientes
                  </p>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Calcula en tiempo real el número de clientes registrados a la fecha y los nuevos registros del mes (solicitud bajo demanda para ahorrar cuota de Firestore).
                  </p>
                  <div className="pt-1.5 border-t border-slate-700/80 text-[11px] space-y-0.5">
                    <span className="font-semibold text-slate-200">Valores que actualiza:</span>
                    <div className="text-slate-300 text-[10px] font-mono leading-tight">
                      • <code className="text-indigo-300">totalCustomers</code> (Padrón total) y <code className="text-indigo-300">newThisMonth</code> (Mes actual)
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* 2. Dropdown Menu de Herramientas (Sync, Recuperación e Índice) */}
              <PermissionTooltip allowed={canManage('customers')}>
                <DropdownMenu>
                  <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={syncCustomersMutation.isPending || isBackfilling || !canManage('customers')}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-sm",
                            "border-blue-300/70 bg-blue-50/70 text-blue-900 hover:bg-blue-100/90",
                            "dark:border-blue-700/70 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50",
                            (syncCustomersMutation.isPending || isBackfilling) && "opacity-50 pointer-events-none"
                          )}
                        >
                          {syncCustomersMutation.isPending ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                          ) : isBackfilling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                          ) : (
                            <CloudDownload className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          )}
                          <span>Herramientas de Clientes</span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-70 ml-0.5" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="center" className="max-w-xs p-2 text-xs bg-slate-900 text-slate-100 dark:bg-slate-800 border border-slate-700 shadow-xl rounded-lg z-50">
                      Opciones avanzadas para sincronizar usuarios Auth, importar perfiles desde SP2, recuperar clientes e indexar la búsqueda rápida.
                    </TooltipContent>
                  </Tooltip>

                  <DropdownMenuContent align="end" className="w-80 p-2 text-xs z-50 bg-popover text-popover-foreground border shadow-xl">
                    <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
                      Herramientas & Sincronización
                    </DropdownMenuLabel>
                    
                    {/* Item 1: Sincronizar Auth */}
                    <DropdownMenuItem
                      onClick={(e) => handleSync(e.shiftKey)}
                      disabled={syncCustomersMutation.isPending}
                      className="flex flex-col items-start gap-1 p-2 rounded-md cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      <div className="flex items-center gap-2 font-semibold text-foreground text-xs">
                        <RefreshCw className={cn("h-3.5 w-3.5 text-slate-600 dark:text-slate-400", syncCustomersMutation.isPending && "animate-spin")} />
                        <span>Sincronizar (Auth ➔ Firestore)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        Sync incremental. <span className="font-semibold text-amber-600 dark:text-amber-400">Shift + Click</span> para re-sync completa de Auth.
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/80 pt-0.5 border-t border-border/40 w-full">
                        Actualiza: displayName, email, phone, direcciones, photoURL, disabled
                      </p>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1" />

                    {/* Item 2: Sync SP2 */}
                    <DropdownMenuItem
                      onClick={() => setIsForceSyncOpen(true)}
                      className="flex flex-col items-start gap-1 p-2 rounded-md cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400 text-xs">
                        <CloudDownload className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Forzar Sync desde SP2 (Portal Cliente)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        Importa la dirección física completa (provincia, cantón, distrito, detalle) y teléfono registrados en SP2.
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/80 pt-0.5 border-t border-border/40 w-full">
                        Actualiza: provincia, canton, distrito, direccionExacta, location, phone, email
                      </p>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1" />

                    {/* Item 3: Recuperar Cliente Eliminado */}
                    <DropdownMenuItem
                      onClick={() => setIsRecreateOpen(true)}
                      className="flex flex-col items-start gap-1 p-2 rounded-md cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400 text-xs">
                        <RotateCcw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Recuperar Cliente Eliminado</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        Recrea manualmente un perfil de cliente cuyo documento o casillero fue eliminado por error o presenta datos huérfanos.
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/80 pt-0.5 border-t border-border/40 w-full">
                        Actualiza: Recrea documento maestro en customers/{`{slCode}`}
                      </p>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1" />

                    {/* Item 4: Indexar Búsqueda */}
                    <DropdownMenuItem
                      onClick={handleBackfill}
                      disabled={isBackfilling}
                      className="flex flex-col items-start gap-1 p-2 rounded-md cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      <div className="flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-400 text-xs">
                        {isBackfilling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600 dark:text-rose-400" />
                        ) : (
                          <Database className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                        )}
                        <span>Indexar Búsqueda (Backfill)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-normal">
                        Genera tokens de búsqueda rápida para encontrar clientes instantáneamente por nombre, SL Code, cédula o teléfono.
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground/80 pt-0.5 border-t border-border/40 w-full">
                        Actualiza: searchTokens en customers/{`{slCode}`}
                      </p>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </PermissionTooltip>
            </div>
          </TooltipProvider>
        </motion.div>

        {/* Search bar & Registration Date Filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card className={cn("overflow-hidden border shadow-sm", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200/80")}>
            <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
              {/* Search input */}
              <div className="relative flex-1 min-w-[260px]">
                {searchLoading ? (
                  <Loader2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  autoFocus
                  placeholder="Buscar por nombre, SL Code, cédula, email o teléfono…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={cn(
                    "pl-9 pr-8 h-9 text-sm rounded-lg transition-colors",
                    isDark ? "bg-gray-800/80 border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50/50 border-gray-200"
                  )}
                  aria-label="Buscar clientes"
                  data-testid="customer-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground p-0.5 rounded-full"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Registration Date Filter Container */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="flex items-center gap-1.5 bg-muted/40 dark:bg-gray-800/50 p-1 rounded-lg border border-border/50">
                  <span className="text-xs font-medium text-muted-foreground pl-1.5 hidden md:inline">Registro:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 text-xs justify-start text-left font-normal min-w-[130px] border-border/70",
                          !selectedRegistrationDate && "text-muted-foreground",
                          selectedRegistrationDate && "border-primary font-semibold text-primary bg-primary/10",
                          isDark ? "bg-gray-800" : "bg-white"
                        )}
                        data-testid="customer-date-picker-trigger"
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-primary/80" />
                        {selectedRegistrationDate ? (
                          format(selectedRegistrationDate, "dd/MM/yyyy", { locale: es })
                        ) : (
                          <span>Fecha registro</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={selectedRegistrationDate}
                        onSelect={(date) => setSelectedRegistrationDate(date)}
                        locale={es}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleExecuteDateQuery}
                    disabled={isLoadingDateQuery || !selectedRegistrationDate}
                    className={cn(
                      "h-8 px-3 text-xs font-semibold gap-1.5 transition-all shadow-sm",
                      selectedRegistrationDate
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed"
                    )}
                    data-testid="btn-execute-date-query"
                    title="Ejecutar consulta de clientes registrados en la fecha seleccionada"
                  >
                    {isLoadingDateQuery ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Filter className="h-3.5 w-3.5" />
                    )}
                    <span>Consultar</span>
                  </Button>

                  {selectedRegistrationDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearDateFilter}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      title="Limpiar filtro de fecha"
                      data-testid="btn-clear-date-filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {isFilteringByDate && (
                  <Badge variant="secondary" className="h-8 text-xs px-3 font-semibold bg-primary/10 text-primary border-primary/20 flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    {displayedCustomers.length} en fecha
                  </Badge>
                )}

                {isFilteringByDate && displayedCustomers.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWelcomeModalTargets(
                        displayedCustomers.map((c: any) => ({
                          id: c.id,
                          fullName: c.fullName || "Cliente",
                          email: c.email || "",
                          slCode: c.slCode,
                        }))
                      );
                      setIsWelcomeModalOpen(true);
                    }}
                    className="h-8 gap-1.5 text-xs font-semibold border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
                    data-testid="btn-bulk-welcome-email"
                  >
                    <Mail className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Bienvenida a filtrados ({displayedCustomers.length})</span>
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Results area */}
        <div
          className={cn(
            "divide-y",
            isDark ? "divide-gray-800" : "divide-gray-100"
          )}
          role="list"
          aria-label="Resultados de clientes"
        >
          {/* Empty / prompt state */}
          <AnimatePresence mode="wait">
            {showEmpty && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 gap-3"
              >
                <Search className={cn("h-10 w-10", isDark ? "text-gray-600" : "text-gray-300")} />
                <p className={cn("text-sm font-medium", isDark ? "text-gray-400" : "text-gray-500")}>
                  Escribe al menos 2 caracteres para buscar clientes
                </p>
                <p className={cn("text-xs", isDark ? "text-gray-600" : "text-gray-400")}>
                  Busca por nombre, SL Code, cédula o correo electrónico
                </p>
              </motion.div>
            )}

            {showNoResults && (
              <motion.div
                key="noresults"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12 gap-2"
              >
                <AlertCircle className={cn("h-8 w-8", isDark ? "text-gray-600" : "text-gray-300")} />
                <p className={cn("text-sm", isDark ? "text-gray-400" : "text-gray-500")}>
                  Sin resultados para <span className="font-semibold">"{searchQuery}"</span>
                </p>
                <p className={cn("text-xs", isDark ? "text-gray-600" : "text-gray-400")}>
                  Si el cliente existe pero no aparece, ejecuta "Indexar búsqueda" una vez.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {!searchLoading && searchResults.length > 0 && displayedCustomers.length === 0 && (
            <motion.div
              key="no-date-match"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center"
            >
              <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Sin registros en la fecha seleccionada ({selectedRegistrationDate ? format(selectedRegistrationDate, "dd/MM/yyyy", { locale: es }) : ""})</p>
              <p className="text-xs text-muted-foreground mt-1">Prueba seleccionar otra fecha o borrar el filtro para ver más resultados.</p>
            </motion.div>
          )}

          {/* Results list */}
          {displayedCustomers.map((customer, idx) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              idx={idx}
              isDark={isDark}
              canUpdate={canUpdate}
              canDelete={canDelete}
              updateCustomerId={updateCustomerId}
              setWelcomeModalTargets={setWelcomeModalTargets}
              setIsWelcomeModalOpen={setIsWelcomeModalOpen}
              handleViewDetail={handleViewDetail}
              handleRestoreCustomer={handleRestoreCustomer}
              handleStatusChange={handleStatusChange}
              handleEditFromResult={handleEditFromResult}
              setCustomerToDelete={setCustomerToDelete}
            />
          ))}
        </div>

        {/* Edit Modal */}
        {selectedCustomer && (
          <EditCustomerModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedCustomer(null);
            }}
            onSuccess={() => {
              setIsEditModalOpen(false);
              setSelectedCustomer(null);
            }}
            customer={selectedCustomer as any}
          />
        )}

        {/* Detail Modal */}
        {detailCustomer && (
          <CustomerDetailModal
            isOpen={isDetailModalOpen}
            customer={detailCustomer}
            onClose={() => {
              setIsDetailModalOpen(false);
              setDetailCustomer(null);
            }}
          />
        )}

        {/* Recreate (recovery) modal — admin manually rebuilds a deleted customer */}
        <RecreateCustomerModal
          open={isRecreateOpen}
          onOpenChange={setIsRecreateOpen}
          initial={/^SL\d+$/i.test((searchQuery || "").trim()) ? { slCode: (searchQuery || "").trim().toUpperCase() } : undefined}
          onSuccess={(slCode) => {
            queryClient.invalidateQueries({ queryKey: customersKeys.all });
            queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
            invalidateCustomerCache();
            setSearchQuery(slCode);
          }}
        />

        <ForceSyncCustomerModal
          open={isForceSyncOpen}
          onOpenChange={setIsForceSyncOpen}
          initialSlCode={/^SL\d+$/i.test((searchQuery || "").trim()) ? (searchQuery || "").trim().toUpperCase() : undefined}
          onSuccess={(slCode) => {
            queryClient.invalidateQueries({ queryKey: customersKeys.all });
            queryClient.invalidateQueries({ queryKey: ['customerSearch'] });
            invalidateCustomerCache();
            setSearchQuery(slCode);
          }}
        />

        {/* Welcome Email Modal */}
        <WelcomeEmailModal
          isOpen={isWelcomeModalOpen}
          onClose={() => setIsWelcomeModalOpen(false)}
          targets={welcomeModalTargets}
        />

        {/* Delete Confirmation Dialog — typed confirmation required.
            This deletes the customers/{id} doc from Firestore; soft-deactivate
            with the toggle if you only want to suspend the account. */}
        <AlertDialog
          open={!!customerToDelete}
          onOpenChange={(open) => {
            if (!open) {
              setCustomerToDelete(null);
              setDeleteConfirmText("");
            }
          }}
        >
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" aria-hidden />
                Eliminar permanentemente cliente
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    Vas a borrar definitivamente el documento de{" "}
                    <strong className="text-foreground">{customerToDelete?.fullName}</strong>
                    {customerToDelete?.slCode && (
                      <> (<span className="font-mono">{customerToDelete.slCode}</span>)</>
                    )}{" "}
                    de la colección <span className="font-mono">customers</span>.
                  </p>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-200">
                    <p className="font-semibold mb-1">Esta operación NO se puede deshacer.</p>
                    <p>
                      Paquetes, facturas y manifiestos asociados quedarán huérfanos —
                      sus referencias por <span className="font-mono">slCode</span> seguirán
                      existiendo pero el cliente ya no figurará en la lista. Para suspender
                      el acceso sin borrar usa el toggle de estado.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="delete-confirm" className="text-xs font-medium text-foreground">
                      Para confirmar, escribe el{" "}
                      <span className="font-mono">
                        {customerToDelete?.slCode || customerToDelete?.email || ""}
                      </span>
                      :
                    </label>
                    <Input
                      id="delete-confirm"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={customerToDelete?.slCode || customerToDelete?.email || ""}
                      autoComplete="off"
                      disabled={deleteCustomerMutation.isPending}
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteCustomerMutation.isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCustomer}
                disabled={
                  deleteCustomerMutation.isPending ||
                  deleteConfirmText.trim().toLowerCase() !==
                    (customerToDelete?.slCode || customerToDelete?.email || "")
                      .toLowerCase()
                }
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {deleteCustomerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                Eliminar definitivamente
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </DashboardLayout>
  );
});

export default Customers;
