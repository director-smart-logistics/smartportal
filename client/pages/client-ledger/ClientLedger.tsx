import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { db } from "@/lib/firebase/config";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { useFirebaseAuth } from "@/lib/context/FirebaseAuthContext";
import {
  collection,
  query,
  where,
  getDocs,
  limit as fsLimit,
  updateDoc,
  doc,
  arrayUnion,
  type QuerySnapshot,
} from "firebase/firestore";
import {
  pushStatusToSp2,
  syncInvoicePackagesToSp2,
} from "@/lib/services/sync-invoices-service";
import { cn, extractDateFromInvoiceNumber } from "@/lib/utils";
import {
  Search,
  X,
  User,
  FileText,
  Package,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Printer,
  CheckCircle,
  Clock,
  Loader2,
  Calendar,
  BarChart3,
  ChevronDown as ChevronDownSm,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker } from "@/components/ui/date-range-picker";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TABS = 10;
const SEARCH_DEBOUNCE_MS = 350;

// Tab color palette — red/rose gradient shades for visual identity
const TAB_PALETTE = [
  { active: 'bg-red-600 text-white border-red-700/40 shadow-sm shadow-red-600/25', inactive: 'bg-red-600/15 text-red-700 dark:text-red-300 border-red-400/30 hover:bg-red-600/25' },
  { active: 'bg-rose-600 text-white border-rose-700/40 shadow-sm shadow-rose-600/25', inactive: 'bg-rose-600/15 text-rose-700 dark:text-rose-300 border-rose-400/30 hover:bg-rose-600/25' },
  { active: 'bg-red-700 text-white border-red-800/40 shadow-sm shadow-red-700/25', inactive: 'bg-red-700/15 text-red-800 dark:text-red-200 border-red-500/30 hover:bg-red-700/25' },
  { active: 'bg-rose-500 text-white border-rose-600/40 shadow-sm shadow-rose-500/25', inactive: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-400/30 hover:bg-rose-500/25' },
  { active: 'bg-red-500 text-white border-red-600/40 shadow-sm shadow-red-500/25', inactive: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-400/30 hover:bg-red-500/25' },
  { active: 'bg-rose-700 text-white border-rose-800/40 shadow-sm shadow-rose-700/25', inactive: 'bg-rose-700/15 text-rose-800 dark:text-rose-200 border-rose-500/30 hover:bg-rose-700/25' },
  { active: 'bg-red-800 text-white border-red-900/40 shadow-sm shadow-red-800/25', inactive: 'bg-red-800/15 text-red-900 dark:text-red-100 border-red-600/30 hover:bg-red-800/25' },
  { active: 'bg-rose-800 text-white border-rose-900/40 shadow-sm shadow-rose-800/25', inactive: 'bg-rose-800/15 text-rose-900 dark:text-rose-100 border-rose-600/30 hover:bg-rose-800/25' },
  { active: 'bg-red-400 text-white border-red-500/40 shadow-sm shadow-red-400/25', inactive: 'bg-red-400/15 text-red-500 dark:text-red-300 border-red-300/30 hover:bg-red-400/25' },
  { active: 'bg-rose-400 text-white border-rose-500/40 shadow-sm shadow-rose-400/25', inactive: 'bg-rose-400/15 text-rose-500 dark:text-rose-300 border-rose-300/30 hover:bg-rose-400/25' },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: string;
  uid?: string;
  slCode?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  dni?: string;
  phone?: string;
  ruta?: string;
}

interface PackageDoc {
  id: string;
  tracking?: string;
  trackingNumber?: string;
  slCode?: string;
  status?: string;
  statusLabel?: string;
  smartwebSynced?: boolean;
  smartwebSyncedAt?: any;
  sp2Status?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface InvoiceItem {
  trackingNumber?: string;
  tracking?: string;
  description?: string;
  weight?: number;
  unitPrice?: number;
  totalPrice?: number;
  amount?: number;
  quantity?: number;
  isManual?: boolean;
  isPermiso?: boolean;
}

interface InvoiceDoc {
  id: string;
  invoiceNumber?: string;
  slCode?: string;
  customerId?: string;
  clientSlCode?: string;
  clientName?: string;
  status?: string;
  amount?: number;
  totalAmount?: number;
  currency?: string;
  amountCRC?: number;
  exchangeRate?: number;
  createdAt?: any;
  invoiceDate?: any;
  sentAt?: any;
  paidAt?: any;
  dueDate?: any;
  packageCount?: number;
  invoiceItems?: InvoiceItem[];
  items?: InvoiceItem[];
  isConsolidation?: boolean;
  manifestNumber?: string;
  manifestNumbers?: string[];
  isMergedSingle?: boolean;
  smartwebSynced?: boolean;
}

interface TabData {
  id: string;
  client: CustomerProfile;
  invoices: InvoiceDoc[];
  packages: PackageDoc[];
  loading: boolean;
  dateRange: { from: string; to: string };
  statusFilter: string;
  expandedIds: Set<string>;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const INV_STATUS_CFG: Record<
  string,
  { label: string; badge: string; dot: string; hover: string }
> = {
  draft: {
    label: "Borrador",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-gray-400",
    hover: "hover:bg-muted/80",
  },
  sent: {
    label: "Enviada",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    dot: "bg-blue-500",
    hover: "hover:bg-blue-200 dark:hover:bg-blue-800/60",
  },
  paid: {
    label: "Pagada",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    dot: "bg-green-500",
    hover: "hover:bg-green-200 dark:hover:bg-green-800/60",
  },
  overdue: {
    label: "Vencida",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    dot: "bg-red-500",
    hover: "hover:bg-red-200 dark:hover:bg-red-800/60",
  },
  cancelled: {
    label: "Cancelada",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-gray-300",
    hover: "hover:bg-muted/80",
  },
  pending: {
    label: "Pendiente",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    dot: "bg-yellow-500",
    hover: "hover:bg-yellow-200 dark:hover:bg-yellow-800/60",
  },
  annulled: {
    label: "Anulada",
    badge: "bg-muted text-muted-foreground",
    dot: "bg-gray-200",
    hover: "hover:bg-muted/80",
  },
};

const PKG_STATUS_CFG: Record<string, { label: string; dot: string }> = {
  delivered: { label: "Entregado", dot: "bg-green-500" },
  route: { label: "En Ruta", dot: "bg-blue-500" },
  customs: { label: "Procesando CR", dot: "bg-orange-500" },
  processed: { label: "Facturado", dot: "bg-purple-500" },
  transit: { label: "En Tránsito", dot: "bg-sky-500" },
  received: { label: "Recibido MIA", dot: "bg-teal-500" },
  held: { label: "Retenido", dot: "bg-red-500" },
  returned: { label: "Devuelto", dot: "bg-rose-500" },
  pickup: { label: "En Sucursal", dot: "bg-amber-500" },
  consolidated: { label: "Consolidado", dot: "bg-indigo-500" },
  "pre-alerted": { label: "Pre-Alertado", dot: "bg-gray-400" },
};

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

const normalizeStr = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const fmt$ = (n?: number) =>
  n != null
    ? `$${n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "$0.00";

// Handles ISO strings, JS Date objects, and Firestore Timestamps ({ seconds, nanoseconds })
const toJsDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "seconds" in value)
    return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (value?: any): string => {
  const d = toJsDate(value);
  if (!d) return "-";
  return d.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Costa_Rica",
  });
};

// Extract date embedded in invoice numbers like SL4859-20260416154146-C
const dateFromInvoiceNumber = (num?: string): string => extractDateFromInvoiceNumber(num);

const getClientName = (c: CustomerProfile): string =>
  c.fullName ||
  [c.firstName, c.lastName].filter(Boolean).join(" ") ||
  c.slCode ||
  c.id;

const getClientKey = (c: CustomerProfile): string => c.slCode || c.id;

const getInvAmount = (inv: InvoiceDoc): number =>
  inv.amount ?? inv.totalAmount ?? 0;

const getInvItems = (
  inv: InvoiceDoc
): Array<{
  tracking: string;
  description: string;
  weight: number;
  amount: number;
}> => {
  const src = inv.invoiceItems?.length ? inv.invoiceItems : inv.items ?? [];
  return src.map((i) => ({
    tracking: i.trackingNumber || i.tracking || "",
    description: i.description || i.trackingNumber || i.tracking || "",
    weight: i.weight ?? 0,
    amount: i.totalPrice ?? i.unitPrice ?? i.amount ?? 0,
  }));
};

// ─── Firestore Search ─────────────────────────────────────────────────────────

async function searchCustomers(term: string): Promise<CustomerProfile[]> {
  const t = term.trim();
  if (t.length < 2) return [];

  const mergeAny = (snaps: QuerySnapshot[]): CustomerProfile[] => {
    const map = new Map<string, CustomerProfile>();
    snaps.forEach((snap) =>
      snap.docs.forEach((d) => {
        if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() } as CustomerProfile);
      })
    );
    return Array.from(map.values());
  };

  const USERS = "users";
  const CUSTOMERS = "customers";

  try {
    const isSlCode = /^sl\d*/i.test(t) || /^\d{1,5}$/.test(t);
    const isEmail = t.includes("@");
    const isDni = /^\d{7,}$/.test(t) && !isSlCode;

    if (isSlCode) {
      const slCode = /^sl/i.test(t) ? t.toUpperCase() : `SL${t.toUpperCase()}`;
      const [a, b] = await Promise.all([
        getDocs(query(collection(db, USERS), where("slCode", "==", slCode), fsLimit(10))),
        getDocs(query(collection(db, CUSTOMERS), where("slCode", "==", slCode), fsLimit(10))),
      ]);
      return mergeAny([a, b]);
    }

    if (isEmail) {
      const [a, b] = await Promise.all([
        getDocs(query(collection(db, USERS), where("email", "==", t.toLowerCase()), fsLimit(10))),
        getDocs(query(collection(db, CUSTOMERS), where("email", "==", t.toLowerCase()), fsLimit(10))),
      ]);
      return mergeAny([a, b]);
    }

    if (isDni) {
      const [a, b] = await Promise.all([
        getDocs(query(collection(db, USERS), where("dni", "==", t), fsLimit(10))),
        getDocs(query(collection(db, CUSTOMERS), where("dni", "==", t), fsLimit(10))),
      ]);
      return mergeAny([a, b]);
    }

    // ── Name search ──────────────────────────────────────────────────────────
    // Problem: multi-word phrases like "Ana Maria Bolaños" are stored as
    // individual tokens ["ana","maria","bolanos"] — NOT as a single phrase.
    // Strategy:
    //   1. Split input into individual normalized words.
    //   2. Run array-contains per word (users + customers) — broad net.
    //   3. Prefix search on firstNameLower + lastNameLower for the first/last word.
    //   4. Client-side: keep only results whose full name contains ALL words.

    const normalized = normalizeStr(t);
    const words = normalized.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length === 0) return [];

    const promises: Promise<QuerySnapshot>[] = [];

    // Per-word array-contains queries (covers searchTokens stored as individual words)
    const tokenWords = words.slice(0, 3); // cap at 3 to stay within Firestore limits
    for (const word of tokenWords) {
      promises.push(
        getDocs(query(collection(db, USERS), where("searchTokens", "array-contains", word), fsLimit(25)))
      );
      promises.push(
        getDocs(query(collection(db, CUSTOMERS), where("searchTokens", "array-contains", word), fsLimit(25)))
      );
    }

    // Prefix on firstNameLower using first word
    const firstWord = words[0];
    promises.push(
      getDocs(query(collection(db, USERS), where("firstNameLower", ">=", firstWord), where("firstNameLower", "<=", firstWord + "\uf8ff"), fsLimit(20)))
    );
    promises.push(
      getDocs(query(collection(db, CUSTOMERS), where("firstNameLower", ">=", firstWord), where("firstNameLower", "<=", firstWord + "\uf8ff"), fsLimit(20)))
    );

    // Prefix on lastNameLower using last word (catches "Bolaños" when stored as lastNameLower)
    const lastWord = words[words.length - 1];
    if (lastWord !== firstWord) {
      promises.push(
        getDocs(query(collection(db, USERS), where("lastNameLower", ">=", lastWord), where("lastNameLower", "<=", lastWord + "\uf8ff"), fsLimit(20)))
      );
      promises.push(
        getDocs(query(collection(db, CUSTOMERS), where("lastNameLower", ">=", lastWord), where("lastNameLower", "<=", lastWord + "\uf8ff"), fsLimit(20)))
      );
    }

    // Fallback: legacy firstName/lastName prefix (some docs store mixed case)
    promises.push(
      getDocs(query(collection(db, USERS), where("firstName", ">=", t), where("firstName", "<=", t + "\uf8ff"), fsLimit(15)))
    );
    promises.push(
      getDocs(query(collection(db, CUSTOMERS), where("firstName", ">=", t), where("firstName", "<=", t + "\uf8ff"), fsLimit(15)))
    );

    const settled = await Promise.allSettled(promises);
    const snaps = settled
      .filter((r): r is PromiseFulfilledResult<QuerySnapshot> => r.status === "fulfilled")
      .map((r) => r.value);

    const pool = mergeAny(snaps);

    // Client-side relevance filter: result must contain ALL input words in its full name
    if (words.length > 1) {
      return pool.filter((c) => {
        const candidate = normalizeStr(getClientName(c));
        return words.every((w) => candidate.includes(w));
      });
    }

    return pool;
  } catch (err) {
    console.error("[ClientLedger] searchCustomers error:", err);
    return [];
  }
}

// ─── Firestore Data Fetcher ───────────────────────────────────────────────────

async function fetchClientData(
  slCode: string
): Promise<{ invoices: InvoiceDoc[]; packages: PackageDoc[] }> {
  try {
    const [s1, s2, s3, s4] = await Promise.all([
      getDocs(
        query(collection(db, "invoices"), where("slCode", "==", slCode), fsLimit(200))
      ),
      getDocs(
        query(collection(db, "invoices"), where("customerId", "==", slCode), fsLimit(200))
      ),
      getDocs(
        query(collection(db, "invoices"), where("clientSlCode", "==", slCode), fsLimit(50))
      ),
      getDocs(
        query(collection(db, "packages"), where("slCode", "==", slCode), fsLimit(500))
      ),
    ]);

    const invMap = new Map<string, InvoiceDoc>();
    [s1, s2, s3].forEach((snap) =>
      snap.docs.forEach((d) => {
        if (!invMap.has(d.id)) invMap.set(d.id, { id: d.id, ...d.data() } as InvoiceDoc);
      })
    );

    const invoices = Array.from(invMap.values()).sort((a, b) => {
      const da = new Date(a.createdAt ?? a.invoiceDate ?? 0).getTime();
      const db2 = new Date(b.createdAt ?? b.invoiceDate ?? 0).getTime();
      return db2 - da;
    });

    const packages = s4.docs.map((d) => ({ id: d.id, ...d.data() } as PackageDoc));

    return { invoices, packages };
  } catch (err) {
    console.error("[ClientLedger] fetchClientData error:", err);
    return { invoices: [], packages: [] };
  }
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  variant?: "default" | "green" | "red" | "blue";
}

const StatCard = memo(function StatCard({
  title,
  value,
  sub,
  icon,
  variant = "default",
}: StatCardProps) {
  const iconBg = {
    default: "bg-muted text-muted-foreground",
    green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    red: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  }[variant];

  const cardBorder = {
    default: "",
    green: "border-green-200 dark:border-green-800",
    red: "border-red-200 dark:border-red-800",
    blue: "border-blue-200 dark:border-blue-800",
  }[variant];

  return (
    <Card className={cn("border", cardBorder)}>
      <CardContent className="p-3 md:p-4 flex items-center gap-3">
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground leading-tight truncate">{title}</p>
          <p className="text-base md:text-lg font-bold leading-tight truncate">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
});

// ─── InvoiceRow ───────────────────────────────────────────────────────────────

interface InvoiceRowProps {
  invoice: InvoiceDoc;
  packages: PackageDoc[];
  expanded: boolean;
  onToggle: () => void;
  onStatusChange?: (invoiceId: string, newStatus: string) => void;
  updatingId?: string | null;
}

const InvoiceRow = memo(function InvoiceRow({
  invoice,
  packages,
  expanded,
  onToggle,
  onStatusChange,
  updatingId,
}: InvoiceRowProps) {
  const status = invoice.status ?? "draft";
  const cfg = INV_STATUS_CFG[status] ?? INV_STATUS_CFG.draft;
  const amount = getInvAmount(invoice);
  const items = getInvItems(invoice);

  const getPkgStatus = (tracking: string) => {
    if (!tracking) return null;
    const upper = tracking.toUpperCase();
    const pkg = packages.find(
      (p) =>
        (p.tracking ?? "").toUpperCase() === upper ||
        (p.trackingNumber ?? "").toUpperCase() === upper
    );
    return pkg?.status ?? null;
  };

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors text-left"
        aria-expanded={expanded}
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", cfg.dot)} aria-hidden="true" />
        <span className="text-muted-foreground shrink-0" aria-hidden="true">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto] gap-2 md:gap-3 items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {invoice.invoiceNumber ?? invoice.id.slice(0, 8)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {fmtDate(invoice.createdAt ?? invoice.invoiceDate)}
              {invoice.manifestNumber ? ` · ${invoice.manifestNumber}` : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label={`Estado: ${cfg.label}. Haz clic para cambiar`}
                className={cn(
                  "text-[10px] shrink-0 font-medium rounded-full px-2 h-5 hidden sm:inline-flex items-center gap-1 border-0 transition-colors cursor-pointer",
                  cfg.badge,
                  cfg.hover,
                  updatingId === invoice.id && "opacity-60 pointer-events-none"
                )}
              >
                {updatingId === invoice.id
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <span>{cfg.label}</span>}
                <ChevronDownSm className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Cambiar estado
              </div>
              <DropdownMenuSeparator />
              {Object.entries(INV_STATUS_CFG)
                .filter(([key]) => key !== (invoice.status ?? "draft"))
                .map(([key, val]) => (
                  <DropdownMenuItem
                    key={key}
                    className="text-xs gap-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStatusChange?.(invoice.id, key);
                    }}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full shrink-0", val.dot)}
                    />
                    {val.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-[11px] text-muted-foreground shrink-0 hidden md:block">
            {invoice.packageCount ?? items.length} paq.
          </span>
          <span className="text-sm font-bold shrink-0 tabular-nums">{fmt$(amount)}</span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3 mt-1 rounded-md border border-border/60 bg-muted/20 overflow-hidden">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-3 text-center">
                  Sin paquetes registrados en esta factura
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" role="table" aria-label="Paquetes de la factura">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          Tracking
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">
                          Descripción
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">
                          Peso
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          Monto
                        </th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                          Estado SP2
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const pkgStatus = getPkgStatus(item.tracking);
                        const pkgCfg = pkgStatus ? PKG_STATUS_CFG[pkgStatus] : null;
                        return (
                          <tr
                            key={idx}
                            className="border-b border-border/40 last:border-0 hover:bg-accent/20 transition-colors"
                          >
                            <td className="px-3 py-1.5 font-mono text-[11px] text-foreground/80">
                              {item.tracking || "-"}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground hidden md:table-cell max-w-[140px] truncate">
                              {item.description || "-"}
                            </td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground hidden sm:table-cell tabular-nums">
                              {item.weight ? `${item.weight} kg` : "-"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                              {fmt$(item.amount)}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center justify-center gap-1.5">
                                {pkgCfg ? (
                                  <>
                                    <span
                                      className={cn("h-1.5 w-1.5 rounded-full shrink-0", pkgCfg.dot)}
                                      aria-hidden="true"
                                    />
                                    <span className="text-[10px] whitespace-nowrap">
                                      {pkgCfg.label}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/60">
                                    Sin sync
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {(invoice.isConsolidation || invoice.isMergedSingle) && (
                <div className="px-3 py-1.5 border-t border-border/40 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {invoice.isConsolidation ? "Factura Consolidada" : "Factura Única"}
                  </span>
                  {invoice.smartwebSynced && (
                    <Badge className="text-[9px] h-4 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0">
                      SmartWeb ✓
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ─── Client Tab Panel ─────────────────────────────────────────────────────────

interface ClientTabPanelProps {
  tab: TabData;
  onDateRangeChange: (from: string, to: string) => void;
  onStatusFilterChange: (s: string) => void;
  onToggleExpanded: (invoiceId: string) => void;
  onStatusChange?: (invoiceId: string, newStatus: string) => void;
  updatingId?: string | null;
}

const ClientTabPanel = memo(function ClientTabPanel({
  tab,
  onDateRangeChange,
  onStatusFilterChange,
  onToggleExpanded,
  onStatusChange,
  updatingId,
}: ClientTabPanelProps) {
  const filteredInvoices = useMemo(() => {
    let inv = tab.invoices;

    if (tab.statusFilter !== "all") {
      inv = inv.filter((i) => (i.status ?? "draft") === tab.statusFilter);
    }

    if (tab.dateRange.from || tab.dateRange.to) {
      inv = inv.filter((i) => {
        const d = new Date(i.createdAt ?? i.invoiceDate ?? 0);
        if (isNaN(d.getTime())) return true;
        if (tab.dateRange.from && d < new Date(tab.dateRange.from)) return false;
        if (tab.dateRange.to && d > new Date(tab.dateRange.to + "T23:59:59")) return false;
        return true;
      });
    }

    return inv;
  }, [tab.invoices, tab.statusFilter, tab.dateRange]);

  const stats = useMemo(() => {
    const base = tab.dateRange.from || tab.dateRange.to ? filteredInvoices : tab.invoices;
    const total = base.reduce((s, i) => s + getInvAmount(i), 0);
    const paid = base
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + getInvAmount(i), 0);
    const pending = base
      .filter((i) => ["sent", "pending", "overdue"].includes(i.status ?? ""))
      .reduce((s, i) => s + getInvAmount(i), 0);
    return {
      total,
      paid,
      pending,
      pkgCount: tab.packages.length,
      invoiceCount: base.length,
    };
  }, [tab.invoices, tab.packages, filteredInvoices, tab.dateRange]);

  const handlePrintStatement = useCallback(() => {
    const name = getClientName(tab.client);
    const slCode = getClientKey(tab.client);

    const rows = filteredInvoices
      .map((inv) => {
        const st = inv.status ?? "draft";
        const cfg = INV_STATUS_CFG[st] ?? INV_STATUS_CFG.draft;
        const amt = getInvAmount(inv);
        const items = getInvItems(inv);
        const invDate =
          fmtDate(inv.sentAt) !== "-"
            ? fmtDate(inv.sentAt)
            : fmtDate(inv.invoiceDate) !== "-"
            ? fmtDate(inv.invoiceDate)
            : fmtDate(inv.createdAt) !== "-"
            ? fmtDate(inv.createdAt)
            : dateFromInvoiceNumber(inv.invoiceNumber);
        return `<tr>
          <td>${inv.invoiceNumber ?? inv.id.slice(0, 8)}</td>
          <td>${invDate}</td>
          <td>${cfg.label}</td>
          <td style="text-align:right">${inv.packageCount ?? items.length}</td>
          <td style="text-align:right;font-weight:600">${fmt$(amt)}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Estado de Cuenta — ${name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Helvetica,Arial,sans-serif;color:#111;padding:32px;font-size:13px;line-height:1.5}
    .brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
    .brand img{height:36px;width:auto;object-fit:contain}
    .brand-right{text-align:right}
    .brand-right h1{font-size:18px;font-weight:800;color:#0f172a;margin:0 0 2px}
    .brand-right .subtitle{color:#64748b;font-size:11px}
    .meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px}
    .meta-item .label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:2px}
    .meta-item .val{font-size:13px;font-weight:600}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#f1f5f9}
    th{padding:8px 10px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#555}
    th:nth-child(4),th:last-child{text-align:right}
    td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
    td:nth-child(4),td:last-child{text-align:right}
    tfoot td{border-top:2px solid #111;border-bottom:none;font-weight:700;background:#f8f9fa;padding:10px}
    .footer-label{color:#555;font-weight:400;font-size:11px}
    @media print{body{padding:16px}}
  </style>
</head>
<body>
  <div class="brand">
    <img src="/logo-inv.png" alt="SmartLogistics CR" />
    <div class="brand-right">
      <h1>Estado de Cuenta</h1>
      <div class="subtitle">Generado el ${new Date().toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Costa_Rica" })}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="label">Cliente</div><div class="val">${name}</div></div>
    <div class="meta-item"><div class="label">Código SL</div><div class="val">${slCode}</div></div>
    ${tab.client.email ? `<div class="meta-item"><div class="label">Correo</div><div class="val">${tab.client.email}</div></div>` : ""}
    ${tab.client.ruta ? `<div class="meta-item"><div class="label">Ruta</div><div class="val">${tab.client.ruta}</div></div>` : ""}
    ${tab.client.dni ? `<div class="meta-item"><div class="label">Cédula</div><div class="val">${tab.client.dni}</div></div>` : ""}
  </div>
  <table>
    <thead><tr><th>Nº Factura</th><th>Fecha</th><th>Estado</th><th>Paquetes</th><th>Monto</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="4" class="footer-label">Total (${filteredInvoices.length} facturas)</td><td>${fmt$(stats.total)}</td></tr>
      <tr><td colspan="4" class="footer-label">Pagado</td><td>${fmt$(stats.paid)}</td></tr>
      <tr><td colspan="4" class="footer-label">Pendiente / Por cobrar</td><td>${fmt$(stats.pending)}</td></tr>
    </tfoot>
  </table>
</body>
</html>`;

    const win = window.open("", "_blank", "width=960,height=720");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 350);
    }
  }, [filteredInvoices, tab.client, stats]);

  const handlePrintPackages = useCallback(() => {
    const name = getClientName(tab.client);
    const rows = tab.packages
      .map((p) => {
        const st = p.status ?? "";
        const cfg = st ? PKG_STATUS_CFG[st] : null;
        const sp1Label = cfg
          ? cfg.label
          : st
          ? st.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Sin estado";
        const sp2Label = p.smartwebSynced
          ? `Sincronizado${p.smartwebSyncedAt ? ` · ${fmtDate(p.smartwebSyncedAt)}` : ""}`
          : "No sincronizado";
        const sp2Color = p.smartwebSynced ? "color:#16a34a" : "color:#9ca3af";
        const updatedDate = fmtDate(p.updatedAt ?? p.createdAt);
        const tracking = p.tracking ?? p.trackingNumber ?? p.id;
        return `<tr>
          <td style="font-family:monospace">${tracking}</td>
          <td>${sp1Label}</td>
          <td style="${sp2Color};font-size:11px">${sp2Label}</td>
          <td>${updatedDate !== "-" ? updatedDate : "Sin fecha"}</td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Paquetes — ${name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Helvetica,Arial,sans-serif;color:#111;padding:32px;font-size:13px;line-height:1.5}
    .brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
    .brand img{height:36px;width:auto;object-fit:contain}
    .brand-right{text-align:right}
    .brand-right h1{font-size:18px;font-weight:800;color:#0f172a;margin:0 0 2px}
    .brand-right .sub{color:#64748b;font-size:11px}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#f1f5f9}
    th{padding:8px 10px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#555}
    td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:12px}
    tfoot td{border-top:2px solid #111;font-weight:600;background:#f8f9fa;font-size:11px;padding:8px 10px}
    @media print{body{padding:16px}}
  </style>
</head>
<body>
  <div class="brand">
    <img src="/logo-inv.png" alt="SmartLogistics CR" />
    <div class="brand-right">
      <h1>Paquetes SP1/SP2</h1>
      <div class="sub">${name} &nbsp;·&nbsp; ${getClientKey(tab.client)} &nbsp;·&nbsp; Generado el ${new Date().toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Costa_Rica" })}</div>
    </div>
  </div>
  <p style="font-size:12px;color:#555;margin-bottom:16px">${tab.packages.length} paquete${tab.packages.length !== 1 ? "s" : ""} registrados</p>
  <table>
    <thead><tr><th>Tracking</th><th>Estado SP1</th><th>Sync SP2</th><th>Actualizado</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">${tab.packages.length} paquete${tab.packages.length !== 1 ? "s" : ""} en total</td></tr></tfoot>
  </table>
</body>
</html>`;

    const win = window.open("", "_blank", "width=760,height=640");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    }
  }, [tab.packages, tab.client]);

  if (tab.loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Cargando datos de {getClientName(tab.client)}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Client header */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b bg-card shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{getClientName(tab.client)}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-xs font-mono text-muted-foreground">
                  {getClientKey(tab.client)}
                </span>
                {tab.client.email && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    · {tab.client.email}
                  </span>
                )}
                {tab.client.dni && (
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    · {tab.client.dni}
                  </span>
                )}
                {tab.client.ruta && (
                  <Badge variant="outline" className="text-[10px] h-4 shrink-0">
                    {tab.client.ruta}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintPackages}
              className="gap-1.5 h-8 text-xs"
              disabled={tab.packages.length === 0}
              aria-label="Imprimir lista de paquetes"
            >
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Paquetes</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintStatement}
              className="gap-1.5 h-8 text-xs"
              disabled={filteredInvoices.length === 0}
              aria-label="Imprimir estado de cuenta"
            >
              <Printer className="h-3.5 w-3.5" />
              Estado de Cuenta
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 mt-4">
          <StatCard
            title="Total Facturado"
            value={fmt$(stats.total)}
            sub={`${stats.invoiceCount} factura${stats.invoiceCount !== 1 ? "s" : ""}`}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            title="Pagado"
            value={fmt$(stats.paid)}
            icon={<CheckCircle className="h-4 w-4" />}
            variant="green"
          />
          <StatCard
            title="Por Cobrar"
            value={fmt$(stats.pending)}
            icon={<Clock className="h-4 w-4" />}
            variant="red"
          />
          <StatCard
            title="Paquetes SP2"
            value={String(stats.pkgCount)}
            icon={<Package className="h-4 w-4" />}
            variant="blue"
          />
        </div>
      </div>

      {/* Filters bar */}
      <div className="px-4 md:px-6 py-2 border-b bg-background shrink-0 flex items-center gap-2 flex-wrap">
        <DateRangePicker
          value={{
            from: tab.dateRange.from ? new Date(tab.dateRange.from) : undefined,
            to: tab.dateRange.to ? new Date(tab.dateRange.to) : undefined,
          }}
          onChange={(r) =>
            onDateRangeChange(
              r?.from ? r.from.toISOString() : "",
              r?.to ? r.to.toISOString() : ""
            )
          }
          placeholder="Filtrar por fecha"
          className="h-8 text-xs w-[195px] shrink-0"
        />
        <div className="ml-auto">
          <Select value={tab.statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger
              className="h-8 text-xs w-[130px]"
              aria-label="Filtrar por estado de factura"
            >
              <SelectValue placeholder="Estado…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="sent">Enviada</SelectItem>
              <SelectItem value="paid">Pagada</SelectItem>
              <SelectItem value="overdue">Vencida</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Invoice list */}
      <div className="flex-1 overflow-y-auto">
        {filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-25" />
            <p className="font-semibold text-sm text-foreground">Sin facturas</p>
            <p className="text-xs mt-1">
              No hay facturas con los filtros actuales para este cliente
            </p>
          </div>
        ) : (
          <div className="bg-card">
            {/* List header */}
            <div className="px-4 py-2 bg-muted/30 text-xs text-muted-foreground border-b flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" />
                {filteredInvoices.length} factura
                {filteredInvoices.length !== 1 ? "s" : ""}
                {tab.dateRange.from || tab.dateRange.to ? " (filtrado)" : ""}
              </span>
              <span className="font-semibold text-foreground tabular-nums">
                {fmt$(filteredInvoices.reduce((s, i) => s + getInvAmount(i), 0))}
              </span>
            </div>
            {filteredInvoices.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                packages={tab.packages}
                expanded={tab.expandedIds.has(inv.id)}
                onToggle={() => onToggleExpanded(inv.id)}
                onStatusChange={onStatusChange}
                updatingId={updatingId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientLedger() {
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const { user } = useFirebaseAuth();

  const [openTabs, setOpenTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchCustomers(searchQuery);
      setSearchResults(results);
      setShowDropdown(true);
      setIsSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  }, []);

  const openClient = useCallback(
    async (client: CustomerProfile) => {
      const key = getClientKey(client);
      setShowDropdown(false);
      setSearchQuery("");
      setSearchResults([]);

      // Already open → just activate
      if (openTabs.some((t) => t.id === key)) {
        setActiveTabId(key);
        return;
      }

      const newTab: TabData = {
        id: key,
        client,
        invoices: [],
        packages: [],
        loading: true,
        dateRange: { from: "", to: "" },
        statusFilter: "all",
        expandedIds: new Set(),
      };

      // FIFO eviction when at max
      setOpenTabs((prev) => {
        const next = [...prev];
        if (next.length >= MAX_TABS) next.shift();
        next.push(newTab);
        return next;
      });
      setActiveTabId(key);

      try {
        const { invoices, packages } = await fetchClientData(key);
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.id === key ? { ...t, invoices, packages, loading: false } : t
          )
        );
      } catch {
        setOpenTabs((prev) =>
          prev.map((t) => (t.id === key ? { ...t, loading: false } : t))
        );
        toast({
          title: "Error",
          description: "No se pudo cargar los datos del cliente",
          variant: "destructive",
        });
      }
    },
    [openTabs, toast]
  );

  const closeTab = useCallback(
    (id: string) => {
      setOpenTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (activeTabId === id) {
          const nextActive = next[Math.max(0, idx - 1)];
          setActiveTabId(nextActive?.id ?? null);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const updateTab = useCallback((id: string, patch: Partial<TabData>) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }, []);

  const toggleExpanded = useCallback((tabId: string, invoiceId: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const next = new Set(t.expandedIds);
        if (next.has(invoiceId)) next.delete(invoiceId);
        else next.add(invoiceId);
        return { ...t, expandedIds: next };
      })
    );
  }, []);

  const handleStatusChange = useCallback(
    async (invoiceId: string, newStatus: string) => {
      const tabId = activeTabId;
      if (!tabId) return;
      const tab = openTabs.find((t) => t.id === tabId);
      const invoice = tab?.invoices.find((i) => i.id === invoiceId);
      if (!invoice) return;

      setUpdatingInvoiceId(invoiceId);

      // Optimistic update
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.id !== tabId
            ? t
            : { ...t, invoices: t.invoices.map((i) => i.id !== invoiceId ? i : { ...i, status: newStatus }) }
        )
      );

      const changedAt = new Date().toISOString();
      try {
        await updateDoc(doc(db, 'invoices', invoiceId), { status: newStatus });

        // Append to statusHistory (best-effort, non-blocking) — mirrors the
        // InvoiceGeneration handlers so every surface that mutates invoice
        // status leaves the same audit trail.
        updateDoc(doc(db, 'invoices', invoiceId), {
          statusHistory: arrayUnion({
            status: newStatus,
            changedAt,
            changedBy: user?.id || 'admin',
            reason: 'ClientLedger status update',
          }),
        }).catch(err => console.warn('[ClientLedger] statusHistory update failed:', err));

        // Fire-and-forget: push status to SP2
        pushStatusToSp2(
          invoiceId,
          invoice.invoiceNumber ?? invoiceId,
          newStatus
        ).catch(() => {});

        // Package sync for paid (on_route) and sent (processed) — also stamps
        // smartwebSynced metadata on linked SP1 packages, matching the
        // InvoiceGeneration flow exactly.
        if (newStatus === 'paid' || newStatus === 'sent') {
          const sp1Status = newStatus === 'paid' ? 'on_route' : 'processed';
          syncInvoicePackagesToSp2(invoice, sp1Status).catch(() => {});
        }

        auditLog({
          action: 'invoice_updated',
          category: 'invoice',
          result: 'success',
          resource: invoice.invoiceNumber ?? invoiceId,
          resourceId: invoiceId,
          metadata: {
            oldStatus: invoice.status ?? 'draft',
            newStatus,
            source: 'client_ledger_status_update',
            clientSlCode: invoice.clientSlCode || invoice.slCode
          }
        });

        toast({
          title: 'Estado actualizado',
          description: `${invoice.invoiceNumber ?? invoiceId} → ${INV_STATUS_CFG[newStatus]?.label ?? newStatus}`,
        });

        // Background reconcile with Firestore (NO GHOST DATA rule)
        fetchClientData(tabId).then(({ invoices, packages }) => {
          setOpenTabs((prev) =>
            prev.map((t) => (t.id === tabId ? { ...t, invoices, packages } : t))
          );
        }).catch(() => {});
      } catch (err) {
        console.error('[ClientLedger] handleStatusChange error:', err);
        auditLog({
          action: 'invoice_updated',
          category: 'invoice',
          result: 'error',
          resource: invoice.invoiceNumber ?? invoiceId,
          resourceId: invoiceId,
          errorMessage: err instanceof Error ? err.message : String(err),
          metadata: {
            oldStatus: invoice.status ?? 'draft',
            newStatus,
            source: 'client_ledger_status_update',
            clientSlCode: invoice.clientSlCode || invoice.slCode
          }
        });
        // Revert optimistic update
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.id !== tabId
              ? t
              : { ...t, invoices: t.invoices.map((i) => i.id !== invoiceId ? i : { ...i, status: invoice.status }) }
          )
        );
        toast({
          title: 'Error',
          description: 'No se pudo actualizar el estado de la factura',
          variant: 'destructive',
        });
      } finally {
        setUpdatingInvoiceId(null);
      }
    },
    [activeTabId, openTabs, user?.id, toast, auditLog]
  );

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <DashboardLayout fullHeight>
      <div className="flex flex-col h-full overflow-hidden" data-testid="client-ledger-page">
        {/* ── Header + Search ──────────────────────────────────────────────── */}
        <div className="px-4 md:px-6 pt-5 pb-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Estado de Cuenta</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Consulta facturas, paquetes y balances por cliente
              </p>
            </div>
            {openTabs.length > 0 && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {openTabs.length}/{MAX_TABS} abiertos
              </Badge>
            )}
          </div>

          {/* Search input */}
          <div ref={searchContainerRef} className="relative max-w-xl">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                placeholder="Buscar por nombre, código SL, correo o cédula…"
                className="pl-9 pr-9 h-10 text-sm"
                autoComplete="off"
                aria-label="Buscar cliente"
                aria-autocomplete="list"
                aria-controls={showDropdown ? "client-search-results" : undefined}
                aria-expanded={showDropdown}
              />
              {isSearching ? (
                <Loader2
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground"
                  aria-label="Buscando…"
                />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* Results dropdown */}
            <AnimatePresence>
              {showDropdown && searchResults.length > 0 && (
                <motion.div
                  id="client-search-results"
                  role="listbox"
                  aria-label="Resultados de búsqueda de clientes"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                  className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto"
                >
                  <div className="px-3 py-1.5 border-b border-border text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""}
                  </div>
                  {searchResults.map((c) => {
                    const name = getClientName(c);
                    const key = getClientKey(c);
                    const alreadyOpen = openTabs.some((t) => t.id === key);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={alreadyOpen}
                        onClick={() => openClient(c)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left focus:outline-none focus:bg-accent"
                      >
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {key}
                            {c.email ? ` · ${c.email}` : ""}
                            {c.ruta ? ` · ${c.ruta}` : ""}
                          </p>
                        </div>
                        {alreadyOpen ? (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Abierto
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                            Abrir →
                          </span>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            <AnimatePresence>
              {showDropdown &&
                searchResults.length === 0 &&
                !isSearching &&
                searchQuery.trim().length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-popover border border-border rounded-lg shadow-lg px-4 py-4 text-center"
                  >
                    <p className="text-sm text-muted-foreground">
                      Sin resultados para{" "}
                      <span className="font-medium text-foreground">
                        "{searchQuery}"
                      </span>
                    </p>
                  </motion.div>
                )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        {openTabs.length > 0 && (
          <div
            className="flex items-center gap-1 px-3 md:px-4 py-1.5 border-b bg-muted/20 overflow-x-auto shrink-0"
            style={{ scrollbarWidth: "none" }}
            role="tablist"
            aria-label="Clientes abiertos"
          >
            {openTabs.map((tab, tabIdx) => {
              const isActive = tab.id === activeTabId;
              const palette = TAB_PALETTE[tabIdx % TAB_PALETTE.length];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-full text-xs font-semibold shrink-0 transition-all max-w-[180px] border",
                    isActive ? palette.active : palette.inactive
                  )}
                >
                  {tab.loading && (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0 opacity-80" />
                  )}
                  <span className="truncate">{getClientName(tab.client)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="ml-0.5 p-0.5 rounded-full opacity-70 hover:opacity-100 transition-opacity shrink-0"
                    aria-label={`Cerrar ${getClientName(tab.client)}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Content area ─────────────────────────────────────────────────── */}
        {openTabs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
            <div className="max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-5">
                <User className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="font-semibold text-base mb-2">Busca un cliente para comenzar</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Escribe el nombre, código SL, correo electrónico o cédula del cliente en
                el buscador. Puedes abrir hasta{" "}
                <strong className="text-foreground">{MAX_TABS} clientes</strong> simultáneamente
                en pestañas, como un Excel. La pestaña más antigua se cierra
                automáticamente cuando se supera el límite.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                {[
                  { label: "Nombre", ex: "Juan Pérez" },
                  { label: "Código SL", ex: "SL1234 o 1234" },
                  { label: "Correo", ex: "juan@email.com" },
                  { label: "Cédula", ex: "10012345678" },
                ].map((hint) => (
                  <div key={hint.label} className="bg-muted/40 rounded-md px-3 py-2">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                      {hint.label}
                    </p>
                    <p className="text-xs text-foreground mt-0.5">{hint.ex}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab ? (
          <ClientTabPanel
            key={activeTab.id}
            tab={activeTab}
            onDateRangeChange={(from, to) =>
              updateTab(activeTab.id, { dateRange: { from, to } })
            }
            onStatusFilterChange={(s) =>
              updateTab(activeTab.id, { statusFilter: s })
            }
            onToggleExpanded={(invoiceId) => toggleExpanded(activeTab.id, invoiceId)}
            onStatusChange={handleStatusChange}
            updatingId={updatingInvoiceId}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
