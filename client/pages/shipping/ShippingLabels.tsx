import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Package,
  FileText,
  Printer,
  AlertCircle,
  CheckCircle2,
  User,
  MapPin,
  AlertTriangle,
  Zap,
  X,
  Truck,
  PackageCheck,
  Undo2,
  Boxes,
  PauseCircle,
  Tag,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/useLocale";
import { useAuth } from "@/hooks/useAuth";
import { firebaseApi } from "@/lib/firebase/callable";
import { searchCustomers } from "@/lib/firebase/firestore-client";
import { searchCustomersLocal, getCustomerBySlCode } from "@/lib/services/customer-matcher";
import { collection, query, where, getDocs, limit, type QuerySnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { RecentLabelsHistory } from "@/components/shipping/RecentLabelsHistory";
import {
  NovaShippingLabelModal,
  type NovaShippingLabelData,
} from "@/components/nova/NovaShippingLabelModal";
import { type ShippingLabel } from "@/lib/services/shipping-labels.service";

const ENABLE_GOOGLE_MAPS = false;

// Helper functions for landmark/instruction deduplication
function cleanStringForComparison(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "") // keep only alphanumeric and spaces
    .trim();
}

function areStringsRedundant(str1: string, str2: string): boolean {
  const c1 = cleanStringForComparison(str1);
  const c2 = cleanStringForComparison(str2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;

  const stopWords = ['en', 'el', 'la', 'de', 'del', 'un', 'una', 'los', 'las', 'y', 'a', 'con', 'por', 'para', 'o', 'u', 'mini', 'super', 'instrucciones', 'detalles', 'señas', 'entregar'];
  const words1 = c1.split(/\s+/).filter(Boolean);
  const words2 = c2.split(/\s+/).filter(Boolean);

  // Keep significant words of str2 that are not present in str1
  const uniqueTo2 = words2.filter(w => !words1.includes(w) && !stopWords.includes(w));
  return uniqueTo2.length === 0;
}

function deduplicateAddressLines(addressStr: string): string {
  if (!addressStr) return "";
  const lines = addressStr.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const uniqueLines: string[] = [];
  
  for (const line of lines) {
    const cleanLine = line.replace(/^(instrucciones|detalles|señas):\s*/i, "");
    const isRedundant = uniqueLines.some(existing => {
      const cleanExisting = existing.replace(/^(instrucciones|detalles|señas):\s*/i, "");
      return areStringsRedundant(cleanExisting, cleanLine);
    });
    if (!isRedundant) {
      uniqueLines.push(line);
    }
  }
  return uniqueLines.join("\n");
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface UserResult {
  id: string;
  slCode?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  dni?: string;
  ruta?: string;
}

interface PackageResult {
  id: string;
  tracking: string;
  status: string;
  description?: string;
  carrier?: string;
  weight?: number;
  userId?: string;
  manifestId?: string;
  createdAt?: string;
}

interface ParcelData {
  parcelId: string;
  userId: string;
  packageIds: string[];
  trackings: string[];
  recipientName: string;
  recipientPhone?: string;
  recipientDni?: string;
  slCode: string;
  deliveryAddress: string;
  courierService: string;
  description: string;
  weight: number;
  isFragile?: boolean;
  isPriority?: boolean;
  createdAt: string;
  status: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  customs: "En Aduanas",
  transit: "En Tránsito",
  received: "Recibido en Miami",
  delivered: "Entregado",
  route: "En Ruta de Entrega",
  held: "Retenido en Aduana",
  returned: "Devuelto",
  consolidated: "Consolidado",
  pending: "Pendiente",
  processing: "Procesando",
  warehouse: "En Bodega",
  pickup: "Retira en SmartLogistics",
  "pre-alerted": "Pre-Alertado",
};

const STATUS_OPTIONS = [
  { value: "route", label: "En Ruta", icon: Truck, color: "blue" },
  { value: "delivered", label: "Entregado", icon: PackageCheck, color: "green" },
  { value: "returned", label: "Devuelto", icon: Undo2, color: "orange" },
  { value: "consolidated", label: "Consolidado", icon: Boxes, color: "purple" },
  { value: "held", label: "Retenido", icon: PauseCircle, color: "red" },
] as const;

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-950/30",   border: "border-blue-500",   text: "text-blue-700 dark:text-blue-300" },
  green:  { bg: "bg-green-50 dark:bg-green-950/30",  border: "border-green-500",  text: "text-green-700 dark:text-green-300" },
  orange: { bg: "bg-orange-50 dark:bg-orange-950/30",border: "border-orange-500", text: "text-orange-700 dark:text-orange-300" },
  purple: { bg: "bg-purple-50 dark:bg-purple-950/30",border: "border-purple-500", text: "text-purple-700 dark:text-purple-300" },
  red:    { bg: "bg-red-50 dark:bg-red-950/30",      border: "border-red-500",    text: "text-red-700 dark:text-red-300" },
};

// ── QR helper ─────────────────────────────────────────────────────────────────
function getQrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data)}`;
}

// ── ShippingLabel print component ──────────────────────────────────────────────
interface ShippingLabelProps {
  packages: PackageResult[];
  user: UserResult;
  parcel: ParcelData;
}

function ShippingLabel({ packages, user, parcel }: ShippingLabelProps) {
  const totalWeight = packages.reduce((s, p) => s + (p.weight || 0), 0);
  const qrUrl = ENABLE_GOOGLE_MAPS && parcel.deliveryAddress
    ? getQrUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parcel.deliveryAddress)}`)
    : null;

  return (
    <div className="border-2 border-black bg-white max-w-[8.5in] mx-auto">
      {/* Header */}
      <div className="border-b-2 border-black p-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/logo.svg" alt="SmartLogistics" className="h-16 w-auto" style={{ filter: "brightness(0)" }} />
            <div>
              <h1 className="text-4xl font-black tracking-tight text-black" style={{ letterSpacing: "-0.02em" }}>
                SMARTLOGISTICS
              </h1>
              <p className="text-xs uppercase tracking-widest text-black font-semibold mt-1">Shipping Label</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-black font-mono text-black tracking-tight">{user.slCode}</div>
          </div>
        </div>

        <div className="border-2 border-black px-4 py-3 mt-6">
          <div className="text-xs uppercase tracking-wider font-bold text-black mb-2">Tracking Numbers</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {packages.map((pkg, idx) => (
              <div key={idx} className="text-lg font-black font-mono text-black tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-black rounded-full shrink-0" />
                {pkg.tracking}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Address & Service */}
      <div className="border-b-2 border-black p-6">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider font-bold text-black mb-3">DELIVERY ADDRESS</div>
                <div className="font-black text-black text-3xl mb-2">{user.fullName}</div>
                <div className="text-black text-sm font-medium space-y-1">
                  <div>{user.phone || "Sin teléfono"}</div>
                  <div>Cédula: {user.dni || "N/A"}</div>
                </div>
              </div>
              {qrUrl && (
                <div className="ml-4 flex-shrink-0">
                  <div className="text-xs uppercase tracking-wider font-bold text-black mb-2 text-center">SCAN FOR MAP</div>
                  <div className="border-2 border-black p-1">
                    <img src={qrUrl} alt="QR Code for delivery location" className="w-24 h-24" style={{ imageRendering: "pixelated" }} />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-black">
              <div className="text-xs font-bold text-black mb-2">Dirección de entrega:</div>
              <div className="text-sm font-medium text-black whitespace-pre-wrap leading-relaxed">
                {parcel.deliveryAddress || "_______________________________________\n_______________________________________"}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-black mb-3">PARCEL SERVICE / COURIER</div>
            <div className="border-2 border-black p-4 h-36 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-black text-black uppercase">{parcel.courierService || "________________"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flags */}
      {(parcel.isFragile || parcel.isPriority) && (
        <div className="border-b-2 border-black p-6">
          <div className="flex gap-4">
            {parcel.isFragile && (
              <div className="flex-1 border-4 border-black p-4 text-center">
                <AlertTriangle className="w-10 h-10 text-black mx-auto mb-2" />
                <div className="text-2xl font-black text-black tracking-tight">FRAGILE</div>
                <div className="text-xs uppercase tracking-wider font-bold text-black mt-1">Handle with care</div>
              </div>
            )}
            {parcel.isPriority && (
              <div className="flex-1 border-4 border-black p-4 text-center">
                <Zap className="w-10 h-10 text-black mx-auto mb-2" />
                <div className="text-2xl font-black text-black tracking-tight">PRIORITY</div>
                <div className="text-xs uppercase tracking-wider font-bold text-black mt-1">Express shipping</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="border-b-2 border-black p-4">
        <div className="text-center">
          <div className="text-xs uppercase font-bold text-black tracking-wider">Fecha</div>
          <div className="text-2xl font-black text-black">{new Date(parcel.createdAt).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" })}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 text-center">
        <p className="text-xs text-black font-medium">SmartLogistics CR • San José, Costa Rica</p>
        <p className="text-xs text-black font-medium mt-1">www.smartlogisticscr.com</p>
      </div>
    </div>
  );
}

// ── Resolvers for address & encomienda ─────────────────────────────────────────
function buildFullAddressString(c: any): string {
  if (!c) return "";

  if (c.adminAddressOverride?.deliveryAddress) {
    return deduplicateAddressLines(c.adminAddressOverride.deliveryAddress);
  }

  // 1. Check defaultAddress or addresses array from SP2
  const defaultAddr = c.defaultAddress || c.addresses?.find((a: any) => a.isDefault || a.id === c.defaultAddress?.id) || c.addresses?.[0];
  
  if (defaultAddr) {
    const parts = [];
    const street = defaultAddr.streetAddress || "";
    const details = defaultAddr.details || defaultAddr.detail || "";
    const instructions = defaultAddr.deliveryInstructions || "";
    
    const textParts = [];
    if (street) textParts.push(street);
    if (details) textParts.push(details);
    
    if (instructions) {
      const isRedundant = areStringsRedundant(details, instructions);
      if (!isRedundant) {
        textParts.push(instructions);
      }
    }
    
    const text = textParts.filter(Boolean).join(" - ");
    if (text) parts.push(text);
    const geo = [defaultAddr.district, defaultAddr.canton, defaultAddr.province].filter(Boolean).join(", ");
    if (geo) parts.push(geo);
    if (parts.length > 0) return parts.join("\n");
  }

  // 2. Check location / direccion / address object
  const loc = c.location || c.direccion || c.address;
  if (loc && typeof loc === 'object') {
    const parts = [];
    const detail = loc.addressDetail || loc.direccionExacta || loc.detail || loc.streetAddress;
    if (detail) parts.push(detail);
    const geo = [loc.district || loc.distrito, loc.canton, loc.province || loc.provincia].filter(Boolean).join(", ");
    if (geo) parts.push(geo);
    if (parts.length > 0) return parts.join("\n");
  }

  // 3. Check top-level direccionExacta / direccion
  if (c.direccionExacta || c.direccion) {
    const detail = c.direccionExacta || c.direccion;
    const geo = [c.distrito, c.canton, c.provincia].filter(Boolean).join(", ");
    return geo ? `${detail}\n${geo}` : String(detail);
  }

  if (c.deliveryAddress) return String(c.deliveryAddress);

  return "";
}

function buildCourierServiceString(c: any): string {
  if (!c) return "";

  if (c.adminAddressOverride?.courierService) {
    return c.adminAddressOverride.courierService;
  }

  // Find default/principal address first
  const defaultAddr = c.defaultAddress || c.addresses?.find((a: any) => a.isDefault && a.isActive !== false);
  const encomAddr = defaultAddr ?? c.addresses?.[0];

  if (encomAddr?.encomienda?.name) return encomAddr.encomienda.name;
  if (encomAddr?.encomienda?.id) return encomAddr.encomienda.id;
  if (typeof encomAddr?.encomienda === 'string') return encomAddr.encomienda;

  // 2. Check top-level customer fields
  const topEnc = c.encomienda || c.encomiendaProvider;
  if (topEnc && typeof topEnc === 'object') {
    if (topEnc.name) return topEnc.name;
    if (topEnc.id) return topEnc.id;
    if (topEnc.nombre) return topEnc.nombre;
  } else if (typeof topEnc === 'string' && topEnc.trim()) {
    return topEnc.trim();
  }

  if (c.encomiendaName) return c.encomiendaName;
  if (c.encomiendaId) return c.encomiendaId;

  return "";
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ShippingLabels() {
  const { user: authUser } = useAuth();
  const { t } = useLocale(["menu", "common"]);
  const { toast } = useToast();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<UserResult[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Selected user & packages
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [packages, setPackages] = useState<PackageResult[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [showDelivered, setShowDelivered] = useState(false);
  const [packageFilter, setPackageFilter] = useState("");
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());

  // Form & preview
  const [labelModalData, setLabelModalData] = useState<NovaShippingLabelData | null>(null);
  const [editingLabel, setEditingLabel] = useState<ShippingLabel | null>(null);
  const [userParcels, setUserParcels] = useState<ParcelData[]>([]);
  const [loadingParcels, setLoadingParcels] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtered packages
  const filteredPackages = useMemo(() => {
    let list = packages;
    if (!showDelivered) {
      list = list.filter((p) => {
        const isDelivered = p.status === "delivered" || p.status === "entregado";
        return !isDelivered || selectedPackages.has(p.id);
      });
    }
    if (!packageFilter.trim()) return list;
    const q = packageFilter.toLowerCase();
    return list.filter(
      (p) =>
        p.tracking.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        (STATUS_LABELS[p.status] || p.status).toLowerCase().includes(q)
    );
  }, [packages, showDelivered, selectedPackages, packageFilter]);

  const allFilteredSelected =
    filteredPackages.length > 0 &&
    filteredPackages.every((p) => selectedPackages.has(p.id));

  // ── User search: Local offline cache + Firestore real-time search ───────────
  const searchUsers = useCallback(async (query: string): Promise<UserResult[]> => {
    const q = query.trim();
    if (!q || q.length < 1) {
      setUserSuggestions([]);
      setShowUserDropdown(false);
      setIsLoadingSuggestions(false);
      return [];
    }
    setIsLoadingSuggestions(true);
    try {
      // 1. Parallel search: local high-performance fuzzy/structured matcher + Firestore real-time search
      const [localRes, firestoreRes] = await Promise.allSettled([
        searchCustomersLocal(q, { limit: 25, minScore: 0.3 }),
        searchCustomers(q, 20),
      ]);

      const localHits = localRes.status === "fulfilled" ? localRes.value : [];
      const firestoreHits = firestoreRes.status === "fulfilled" ? firestoreRes.value : [];

      // 2. Direct exact SL Code match check
      const directBySl = getCustomerBySlCode(q);

      const resultsMap = new Map<string, UserResult>();

      const addOrMerge = (user: UserResult) => {
        const key = (user.slCode || user.id || "").toUpperCase().trim();
        if (!key) return;
        const existing = resultsMap.get(key);
        if (!existing) {
          resultsMap.set(key, user);
        } else {
          resultsMap.set(key, {
            ...existing,
            id: user.id || existing.id,
            slCode: user.slCode || existing.slCode,
            fullName: user.fullName || existing.fullName,
            email: user.email || existing.email,
            phone: user.phone || existing.phone,
            dni: user.dni || existing.dni,
            ruta: user.ruta || existing.ruta,
          });
        }
      };

      // Add direct SL match first if found
      if (directBySl) {
        addOrMerge({
          id: directBySl.id || directBySl.slCode,
          slCode: directBySl.slCode,
          fullName: directBySl.fullName || directBySl.name,
          email: directBySl.email,
          phone: directBySl.phone,
          dni: directBySl.dni,
          ruta: directBySl.ruta,
        });
      }

      // Add Firestore hits (enriched real-time data)
      firestoreHits.forEach((fs) => {
        if (fs.status === "deleted") return;
        addOrMerge({
          id: fs.id,
          slCode: fs.slCode,
          fullName: fs.fullName,
          email: fs.email,
          phone: fs.phone,
          dni: fs.dni,
          ruta: (fs as any).ruta,
        });
      });

      // Add local matcher hits
      localHits.forEach((lh) => {
        const fullCustomer = getCustomerBySlCode(lh.slCode);
        addOrMerge({
          id: fullCustomer?.id || lh.slCode,
          slCode: lh.slCode,
          fullName: lh.fullName,
          email: fullCustomer?.email,
          phone: fullCustomer?.phone,
          dni: fullCustomer?.dni,
          ruta: lh.ruta || fullCustomer?.ruta,
        });
      });

      const merged = Array.from(resultsMap.values());

      // Sort: exact SL match first, then exact name match, then prefix matches, then alpha
      const qUpper = q.toUpperCase();
      const qLower = q.toLowerCase();
      merged.sort((a, b) => {
        const aSl = (a.slCode || "").toUpperCase();
        const bSl = (b.slCode || "").toUpperCase();
        if (aSl === qUpper && bSl !== qUpper) return -1;
        if (bSl === qUpper && aSl !== qUpper) return 1;

        const aName = (a.fullName || "").toLowerCase();
        const bName = (b.fullName || "").toLowerCase();
        if (aName === qLower && bName !== qLower) return -1;
        if (bName === qLower && aName !== qLower) return 1;

        const aStarts = aName.startsWith(qLower) || aSl.startsWith(qUpper);
        const bStarts = bName.startsWith(qLower) || bSl.startsWith(qUpper);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return (a.fullName || "").localeCompare(b.fullName || "");
      });

      const finalResults = merged.slice(0, 15);
      setUserSuggestions(finalResults);
      setShowUserDropdown(finalResults.length > 0);
      return finalResults;
    } catch (err) {
      console.error("[ShippingLabels] user search error:", err);
      return [];
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (value.trim().length === 0) {
        setUserSuggestions([]);
        setShowUserDropdown(false);
        setIsLoadingSuggestions(false);
        return;
      }
      setIsLoadingSuggestions(true);
      searchTimeoutRef.current = setTimeout(() => searchUsers(value), 250);
    },
    [searchUsers]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showUserDropdown) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-user-search]")) setShowUserDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUserDropdown]);

  // ── Load packages for selected user ────────────────────────────────────────
  const loadPackages = useCallback(async (userId: string, userSlCode?: string) => {
    setLoadingPackages(true);
    console.log("[ShippingLabels] Loading packages for:", { userId, userSlCode });

    try {
      const cleanSlCode = (userSlCode || "").trim().toUpperCase();
      const cleanUserId = (userId || "").trim();
      const queryKeys = new Set<string>();

      if (cleanSlCode) {
        queryKeys.add(cleanSlCode);
        queryKeys.add(cleanSlCode.replace(/\s+/g, ""));
        queryKeys.add(cleanSlCode.replace("-", ""));
        if (/^SL\d+$/i.test(cleanSlCode)) {
          queryKeys.add(cleanSlCode.replace(/^SL/i, "SL-"));
        }
      }
      if (cleanUserId) {
        queryKeys.add(cleanUserId);
      }

      const queries: Promise<QuerySnapshot<DocumentData>>[] = [];
      queryKeys.forEach((key) => {
        queries.push(getDocs(query(collection(db, "packages"), where("slCode", "==", key), limit(150))));
        queries.push(getDocs(query(collection(db, "packages"), where("customerId", "==", key), limit(150))));
        queries.push(getDocs(query(collection(db, "packages"), where("userId", "==", key), limit(150))));
        queries.push(getDocs(query(collection(db, "packages"), where("customerSlCode", "==", key), limit(150))));
      });

      const settled = await Promise.allSettled(queries);
      const existingPkgDocs = new Map<string, any>();

      settled.forEach((res) => {
        if (res.status === "fulfilled" && res.value) {
          res.value.docs.forEach((docSnap) => {
            existingPkgDocs.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          });
        }
      });

      const allPackages = Array.from(existingPkgDocs.values());

      const pkgs: PackageResult[] = allPackages.map((p: any) => ({
        id: p.id,
        tracking: p.trackingNumber || p.tracking || p.guideNumber || p.guia || p.id,
        status: (p.status || p.packageStatus || "pending").toLowerCase().trim(),
        description: p.description || p.descripcion || p.itemName || p.content || "",
        carrier: p.carrier || p.courier || p.carrierName || "",
        weight: p.weight != null ? Number(p.weight) : (p.peso != null ? Number(p.peso) : undefined),
        userId: p.customerId || p.userId || p.slCode || cleanSlCode || cleanUserId,
        manifestId: p.manifestNumber || p.manifestId || p.gtiManifestId || p.manifestName || p.manifest || p.manifestNo || p.manifestRef || "",
        createdAt: p.createdAt || p.date || p.timestamp || p.receivedAt || p.fecha || "",
      }));

      // Sort newest to oldest
      pkgs.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return (b.id || "").localeCompare(a.id || "");
      });

      console.log("[ShippingLabels] Loaded customer packages:", {
        total: pkgs.length,
        userId,
        userSlCode
      });

      setPackages(pkgs);
      setSelectedPackages(new Set());
    } catch (err) {
      console.error("[ShippingLabels] load packages error:", err);
      toast({ title: "Error", description: "Error al cargar paquetes del cliente", variant: "destructive" });
    } finally {
      setLoadingPackages(false);
    }
  }, [toast]);

  // Load user parcels (encomiendas)
  const loadUserParcels = useCallback(async (userId: string) => {
    setLoadingParcels(true);
    try {
      const response = await (firebaseApi as any).parcels?.list?.({ userId, limit: 50 });
      if (response?.success && response.data) {
        const parcels = Array.isArray(response.data) ? response.data : [];
        setUserParcels(parcels);
      }
    } catch (error) {
      console.error("Error loading parcels:", error);
    } finally {
      setLoadingParcels(false);
    }
  }, []);

  const selectUser = useCallback(
    async (user: UserResult) => {
      setShowUserDropdown(false);
      setUserSuggestions([]);
      setSearchQuery(`${user.fullName || ""} (${user.slCode || user.email || ""})`);
      setSelectedUser(user);

      await loadPackages(user.id, user.slCode);
      await loadUserParcels(user.id);
    },
    [loadPackages, loadUserParcels]
  );

  const executeImmediateSearch = useCallback(async () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const query = searchQuery.trim();
    if (!query) return;

    if (userSuggestions.length === 1) {
      selectUser(userSuggestions[0]);
      return;
    }

    const results = await searchUsers(query);
    if (results.length === 1) {
      selectUser(results[0]);
    } else if (results.length > 1) {
      setShowUserDropdown(true);
    } else {
      toast({
        title: "Sin resultados",
        description: `No se encontraron clientes para "${query}"`,
        variant: "default",
      });
    }
  }, [searchQuery, userSuggestions, searchUsers, selectUser, toast]);

  // ── Package selection ───────────────────────────────────────────────────────
  const togglePackage = useCallback((id: string) => {
    setSelectedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setSelectedPackages((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredPackages.forEach((p) => next.delete(p.id));
      } else {
        filteredPackages.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }, [allFilteredSelected, filteredPackages]);



  return (
    <DashboardLayout>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .sl-print-area, .sl-print-area * { visibility: visible; }
          .sl-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: letter; margin: 0.5in; }
        }
      `}</style>

      <div className="h-[calc(100vh-80px)] flex flex-col p-4 md:p-6 overflow-hidden bg-background">
        <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="shrink-0 mb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-primary/10">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Etiquetas de Envío</h1>
            </div>
            <p className="text-sm text-muted-foreground ml-[52px]">
              Genera etiquetas imprimibles y consulta el historial reciente
            </p>
          </motion.div>

          {/* Two Column Layout (Fills remaining screen height) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
            {/* Left Column: Label Generator */}
            <div className="flex flex-col h-full min-h-0 gap-4 overflow-hidden">

              {/* Search */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="shrink-0 rounded-xl border border-border bg-card p-4"
              >
                <div className="relative" data-user-search>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => handleSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            executeImmediateSearch();
                          }
                        }}
                        onFocus={() => userSuggestions.length > 0 && setShowUserDropdown(true)}
                        placeholder="Buscar por SL Code, nombre, cédula o correo..."
                        className="h-11 pl-10 pr-9"
                        autoComplete="off"
                        aria-label="Buscar cliente"
                        aria-autocomplete="list"
                        aria-expanded={showUserDropdown}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setUserSuggestions([]);
                            setShowUserDropdown(false);
                            setSelectedUser(null);
                            setPackages([]);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Limpiar búsqueda"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      onClick={executeImmediateSearch}
                      disabled={isLoadingSuggestions || !searchQuery.trim()}
                      className="h-11 px-5"
                    >
                      {isLoadingSuggestions ? "Buscando..." : (
                        <><Search className="h-4 w-4 mr-2" />Buscar</>
                      )}
                    </Button>
                  </div>

                  {/* Suggestions dropdown */}
                  {showUserDropdown && userSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                      {userSuggestions.map((u) => (
                        <button
                          key={u.id || u.slCode}
                          type="button"
                          onClick={() => selectUser(u)}
                          className="w-full p-3 text-left hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-semibold text-foreground text-sm block">{u.fullName}</span>
                            <span className="text-xs text-muted-foreground">
                              {u.slCode} {u.email ? `· ${u.email}` : ""} {u.phone ? `· ${u.phone}` : ""}
                            </span>
                          </div>
                          {u.ruta && (
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded shrink-0">
                              {u.ruta}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <span>💡</span> Escribe 2+ caracteres para ver sugerencias automáticas
                </p>
              </motion.div>

              {/* Selected User Info */}
              <AnimatePresence>
                {selectedUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="shrink-0 rounded-xl border border-primary/30 bg-primary/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-foreground text-base">{selectedUser.fullName}</h3>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
                            {selectedUser.slCode && (
                              <span className="font-mono font-bold text-primary">{selectedUser.slCode}</span>
                            )}
                            {selectedUser.dni && <span>· {selectedUser.dni}</span>}
                            {selectedUser.email && <span>· {selectedUser.email}</span>}
                            {selectedUser.ruta && (
                              <span className="flex items-center gap-1">
                                · <MapPin className="h-3 w-3" />{selectedUser.ruta}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(null);
                          setPackages([]);
                          setSelectedPackages(new Set());
                          setEditingLabel(null);
                          setSearchQuery("");
                        }}
                        className="border-destructive/30 hover:border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0 font-semibold shadow-sm transition-all"
                        title="Iniciar de nuevo / Limpiar todo"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Iniciar de Nuevo
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Packages list (Fills remaining flex space inside Left Column) */}
              <AnimatePresence>
                {selectedUser && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-1 flex flex-col min-h-0 rounded-xl border border-border bg-card p-4 overflow-hidden"
                  >
                    {editingLabel && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-3 rounded-lg flex items-center justify-between mb-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                            Editando Guía: <span className="font-mono">{editingLabel.labelNumber}</span> (Ajusta la selección de paquetes)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          onClick={() => {
                            setEditingLabel(null);
                            setSelectedPackages(new Set());
                          }}
                        >
                          Cancelar Edición
                        </Button>
                      </div>
                    )}

                    {loadingPackages ? (
                      <div className="flex items-center justify-center py-12 gap-3 flex-1">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Cargando paquetes...</span>
                      </div>
                    ) : packages.length === 0 ? (
                      <div className="text-center py-12 flex-1 flex flex-col items-center justify-center">
                        <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                        <p className="font-semibold text-foreground">No hay paquetes disponibles</p>
                        <p className="text-sm text-muted-foreground mt-1">Este cliente no tiene paquetes elegibles</p>
                      </div>
                    ) : (
                      <>
                        <div className="shrink-0 flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-bold text-foreground text-sm">
                              Paquetes Disponibles ({filteredPackages.length})
                            </h3>
                            <button
                              type="button"
                              onClick={toggleAllFiltered}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all",
                                allFilteredSelected && selectedPackages.size > 0
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "bg-card border-border text-muted-foreground hover:border-primary hover:text-primary"
                              )}
                              aria-label="Seleccionar todos los paquetes"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {allFilteredSelected ? "Deseleccionar todo" : "Marcar todos"}
                            </button>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                              <input
                                type="checkbox"
                                checked={showDelivered}
                                onChange={(e) => setShowDelivered(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                              />
                              <span>Ver entregados</span>
                            </label>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {selectedPackages.size} seleccionado{selectedPackages.size !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Package filter */}
                        <div className="shrink-0 mb-3 relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            value={packageFilter}
                            onChange={(e) => setPackageFilter(e.target.value)}
                            placeholder="Filtrar por tracking o descripción..."
                            className="h-8 pl-9 pr-8 text-xs"
                            aria-label="Filtrar paquetes"
                          />
                          {packageFilter && (
                            <button
                              type="button"
                              onClick={() => setPackageFilter("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Limpiar filtro"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* 100% Dynamic Scrollable Package Rows */}
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
                          {filteredPackages.map((pkg) => {
                            const isSelected = selectedPackages.has(pkg.id);
                            return (
                              <div
                                key={pkg.id}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabIndex={0}
                                onClick={() => togglePackage(pkg.id)}
                                onKeyDown={(e) => e.key === " " && togglePackage(pkg.id)}
                                className={cn(
                                  "flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all cursor-pointer",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-border/80 bg-card"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => togglePackage(pkg.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary shrink-0"
                                  aria-label={`Seleccionar paquete ${pkg.tracking}`}
                                />
                                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold text-foreground">{pkg.tracking}</span>
                                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] font-bold rounded">
                                      {STATUS_LABELS[pkg.status] ?? pkg.status}
                                    </span>
                                    {pkg.manifestId && (
                                      <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 text-[11px] font-semibold rounded flex items-center gap-1">
                                        <FileText className="h-3 w-3 shrink-0" /> {pkg.manifestId}
                                      </span>
                                    )}
                                    {pkg.description && (
                                      <span className="text-xs text-muted-foreground truncate">{pkg.description}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                                  {pkg.carrier && <span>{pkg.carrier}</span>}
                                  {pkg.weight != null && <span>· {pkg.weight} lbs</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Always-visible Pinned Action Button */}
                        <div className="shrink-0 pt-3 border-t border-border mt-3 bg-card">
                          {editingLabel ? (
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingLabel(null);
                                  setSelectedPackages(new Set());
                                }}
                                className="flex-1 h-11 border-destructive/30 hover:border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold shadow-sm transition-all"
                              >
                                Cancelar Edición
                              </Button>
                              <Button
                                onClick={() => {
                                  const selectedPkgs = packages.filter((p) => selectedPackages.has(p.id));
                                  setLabelModalData({
                                    slCode: selectedUser?.slCode || "",
                                    clientName: selectedUser?.fullName || "",
                                    trackings: selectedPkgs.map((p) => p.tracking),
                                    ruta: selectedUser?.ruta,
                                  });
                                }}
                                disabled={!selectedUser}
                                className="flex-[2] h-11 font-bold text-sm shadow-md bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-700 dark:hover:bg-amber-800 transition-all"
                              >
                                <Tag className="h-4 w-4 mr-2" />
                                Continuar con Edición ({selectedPackages.size})
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedUser(null);
                                  setPackages([]);
                                  setSelectedPackages(new Set());
                                  setEditingLabel(null);
                                  setSearchQuery("");
                                }}
                                className="flex-1 h-11 border-destructive/30 hover:border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground font-semibold shadow-sm transition-all"
                              >
                                Iniciar de Nuevo
                              </Button>
                              <Button
                                onClick={() => {
                                  const selectedPkgs = packages.filter((p) => selectedPackages.has(p.id));
                                  setLabelModalData({
                                    slCode: selectedUser?.slCode || "",
                                    clientName: selectedUser?.fullName || "",
                                    trackings: selectedPkgs.map((p) => p.tracking),
                                    ruta: selectedUser?.ruta,
                                  });
                                }}
                                disabled={!selectedUser}
                                className="flex-[2] h-11 font-bold text-sm shadow-md"
                              >
                                <Tag className="h-4 w-4 mr-2" />
                                {selectedPackages.size > 0
                                  ? `Continuar con Etiqueta (${selectedPackages.size})`
                                  : "Generar Etiqueta sin Paquetes"
                                }
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
              </motion.div>
            )}
          </AnimatePresence>
            </div>
            {/* End Left Column */}

            {/* Right Column: Recent Labels History */}
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
              <RecentLabelsHistory
                customerId={selectedUser?.id}
                customerSlCode={selectedUser?.slCode}
                onLabelSelect={(label) => {
                  const u = {
                    id: label.customerId,
                    slCode: label.customerSlCode,
                    fullName: label.customerName,
                  };
                  setSelectedUser(u);
                  loadPackages(label.customerId, label.customerSlCode).then(() => {
                    const labelPkgIds = label.packageIds || label.packages.map((p) => p.id || p.trackingNumber);
                    setSelectedPackages(new Set(labelPkgIds));

                    setPackages((prev) => {
                      const existingIds = new Set(prev.map((p) => p.id));
                      const newPkgs = [...prev];
                      label.packages.forEach((lp) => {
                        const id = lp.id || lp.trackingNumber;
                        if (!existingIds.has(id)) {
                          newPkgs.push({
                            id,
                            tracking: lp.trackingNumber || lp.id,
                            status: label.status || "printed",
                            description: lp.description || "Package",
                            carrier: "",
                            weight: lp.weight,
                            userId: label.customerId,
                            manifestId: "",
                            createdAt: label.createdAt,
                          });
                        }
                      });
                      return newPkgs;
                    });
                  });

                  setEditingLabel(label);
                }}
              />
            </div>
            {/* End Right Column */}
          </div>
          {/* End Two Column Layout */}
        </div>
      </div>

      {/* ── Delivery Info Form Modal ──────────────────────────────────────────── */}
      {labelModalData && (
        <NovaShippingLabelModal
          data={labelModalData}
          editingLabel={editingLabel ?? undefined}
          onClose={() => {
            setLabelModalData(null);
            setEditingLabel(null);
            // Refresh package list and clear selection on completion/close
            if (selectedUser) {
              loadPackages(selectedUser.id, selectedUser.slCode);
              loadUserParcels(selectedUser.id);
            }
            setSelectedPackages(new Set());
          }}
        />
      )}
    </DashboardLayout>
  );
}
