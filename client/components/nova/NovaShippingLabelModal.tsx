/**
 * NovaShippingLabelModal
 * Triggered from the Nova table modal group row to generate a shipping label
 * for a specific SL Code + set of trackings derived from the manifest.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  buildShippingLabelHTML,
  type ShippingLabelRow,
} from "@/lib/utils/nova-print";
import { motion, AnimatePresence } from "framer-motion";

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

import {
  X,
  Tag,
  Printer,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Zap,
  PackageCheck,
  Undo2,
  Boxes,
  PauseCircle,
  MapPin,
  User,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firebaseApi } from "@/lib/firebase/callable";
import { useToast } from "@/hooks/use-toast";
import {
  createOrGetTempCustomer,
  updateTempCustomerEncomienda,
  type TempCustomerRecord,
} from "@/lib/services/manifest-processor";
import { updateCustomerEncomiendaService } from "@/lib/services/customer-sync";
import { shippingLabelsService, type ShippingLabel } from "@/lib/services/shipping-labels.service";
import { useEncomiendaLookup, resolveEncomiendaName, resolveCustomerEncomiendaService } from "@/lib/services/encomienda-lookup";
// ── Encomienda option (from /data/encomiendas.json) ─────────────────────────
interface EncomiendaOption {
  id: string;
  name: string;
  zones: string[];
  cost: number | null;
  costDisplay: string;
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface NovaShippingLabelData {
  slCode: string;
  clientName: string;
  trackings: string[];
  ruta?: string;
  /** Pre-filled encomienda service name (from customer info in the manifests view) */
  encomiendaName?: string;
}

export interface ParcelPreview {
  parcelId: string;
  slCode: string;
  recipientName: string;
  recipientPhone?: string;
  recipientDni?: string;
  deliveryAddress: string;
  courierService: string;
  trackings: string[];
  ruta?: string;
  createdAt: string;
}

export interface CustomerAddress {
  deliveryInstructions?: string | null;
  streetAddress?: string;
  encomienda?: {
    id: string;
    name: string;
    phone?: string;
    pickupAddress?: string;
    schedule?: string;
  } | null;
  requiresEncomienda?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CustomerInfo {
  id?: string;
  slCode?: string;
  fullName?: string;
  phone?: string;
  dni?: string;
  email?: string;
  ruta?: string;
  addresses?: CustomerAddress[];
  defaultAddress?: CustomerAddress | null;
}

// ── Status options ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "route", label: "En Ruta", icon: Truck, color: "blue" },
  {
    value: "delivered",
    label: "Entregado",
    icon: PackageCheck,
    color: "green",
  },
  { value: "returned", label: "Devuelto", icon: Undo2, color: "orange" },
  { value: "consolidated", label: "Consolidado", icon: Boxes, color: "purple" },
  { value: "held", label: "Retenido", icon: PauseCircle, color: "red" },
] as const;

const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-500",
    text: "text-blue-700 dark:text-blue-300",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-500",
    text: "text-green-700 dark:text-green-300",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-500",
    text: "text-orange-700 dark:text-orange-300",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-500",
    text: "text-purple-700 dark:text-purple-300",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-500",
    text: "text-red-700 dark:text-red-300",
  },
};

// ── QR helper ─────────────────────────────────────────────────────────────────
function getQrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(data)}`;
}

// ── Printable label ───────────────────────────────────────────────────────────
export function ShippingLabelPrint({
  parcel,
  customer,
}: {
  parcel: ParcelPreview;
  customer: CustomerInfo | null;
}) {
  const qrUrl = ENABLE_GOOGLE_MAPS && parcel.deliveryAddress
    ? getQrUrl(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parcel.deliveryAddress)}`,
      )
    : null;

  return (
    <div className="enc-label-body border-2 border-black bg-white max-w-[8.5in] mx-auto">
      {/* Header */}
      <div className="enc-label-header border-b-2 border-black p-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="/logo.svg"
              alt="SmartLogistics"
              className="enc-label-logo h-16 w-auto"
              style={{ filter: "brightness(0)" }}
            />
            <div>
              <h1
                className="text-4xl font-black tracking-tight text-black"
                style={{ letterSpacing: "-0.02em" }}
              >
                SMARTLOGISTICS
              </h1>
              <p className="text-xs uppercase tracking-widest text-black font-semibold mt-1">
                Guía de Envío
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="enc-label-sl-code text-5xl font-black font-mono text-black tracking-tight">
              {parcel.slCode}
            </div>
          </div>
        </div>

        {parcel.trackings && parcel.trackings.length > 0 && (
          <div className="border-2 border-black px-4 py-3 mt-6">
            <div className="text-xs uppercase tracking-wider font-bold text-black mb-2">
              Números de Rastreo
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {parcel.trackings.map((t, i) => (
                <div
                  key={i}
                  className="enc-label-tracking-num text-lg font-black font-mono text-black tracking-tight flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 bg-black rounded-full shrink-0" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Address & Service */}
      <div className="enc-label-address-section border-b-2 border-black p-6">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-black mb-3">
                Entregar A
              </div>
              <div className="enc-label-recipient font-black text-black text-3xl mb-2">
                {parcel.recipientName}
              </div>
              <div className="text-black text-sm font-medium space-y-1">
                <div>
                  {customer?.phone || parcel.recipientPhone || "Sin teléfono"}
                </div>
                <div>
                  Cédula: {customer?.dni || parcel.recipientDni || "N/A"}
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-black">
              <div className="text-xs font-bold text-black mb-2">
                Dirección de entrega:
              </div>
              <div className="text-sm font-medium text-black whitespace-pre-wrap leading-relaxed">
                {parcel.deliveryAddress ||
                  "_______________________________________\n_______________________________________"}
              </div>
            </div>
            {parcel.ruta && (
              <div className="mt-2 text-xs font-bold text-black">
                Ruta: <span className="font-medium">{parcel.ruta}</span>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-black mb-3">
              Servicio de Encomienda
            </div>
            <div className="enc-label-service-box border-2 border-black p-4 h-36 flex items-center justify-center">
              <div className="text-center">
                <div className="enc-label-service-name text-4xl font-black text-black uppercase">
                  {parcel.courierService || ""}
                </div>
              </div>
            </div>
            {qrUrl && (
              <div className="mt-3 flex flex-col items-end">
                <div className="text-xs uppercase tracking-wider font-bold text-black mb-1">
                  Ver en Mapa
                </div>
                <img
                  src={qrUrl}
                  alt="QR Code"
                  className="enc-label-qr w-24 h-24"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="border-b-2 border-black p-4">
        <div className="text-center">
          <div className="text-xs uppercase font-bold text-black tracking-wider">
            Fecha
          </div>
          <div className="text-2xl font-black text-black">
            {new Date(parcel.createdAt).toLocaleDateString("es-CR")}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 text-center">
        <p className="text-xs text-black font-medium">
          SmartLogistics CR • San José, Costa Rica
        </p>
        <p className="text-xs text-black font-medium mt-1">
          www.smartlogisticscr.com
        </p>
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface NovaShippingLabelModalProps {
  data: NovaShippingLabelData | null;
  onClose: () => void;
  autoGenerate?: boolean;
  onSuccess?: () => void;
  editingLabel?: ShippingLabel;
}

export function NovaShippingLabelModal({
  data,
  onClose,
  autoGenerate,
  onSuccess,
  editingLabel,
}: NovaShippingLabelModalProps) {
  const { toast } = useToast();
  const { resolve: resolveEncomienda } = useEncomiendaLookup();

  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [tempCustomer, setTempCustomer] = useState<TempCustomerRecord | null>(
    null,
  );
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [courierService, setCourierService] = useState("");
  const [newPackageStatus, setNewPackageStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [useAdminOverride, setUseAdminOverride] = useState(false);
  const [saveToAdminOverride, setSaveToAdminOverride] = useState(true);
  const [clientAddress, setClientAddress] = useState("");
  const [clientCourier, setClientCourier] = useState("");
  const [parcelPreview, setParcelPreview] = useState<ParcelPreview | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);

  const handlePrintLabel = useCallback(() => {
    if (!parcelPreview) return;
    const row: ShippingLabelRow = {
      slCode: parcelPreview.slCode,
      recipientName: parcelPreview.recipientName,
      recipientPhone: parcelPreview.recipientPhone ?? "",
      recipientDni: parcelPreview.recipientDni ?? "",
      deliveryAddress: parcelPreview.deliveryAddress ?? "",
      ruta: parcelPreview.ruta ?? "",
      courierService: parcelPreview.courierService ?? "",
      trackings: parcelPreview.trackings,
      createdAt: parcelPreview.createdAt,
      customerPhone: customer?.phone ?? "",
      customerDni: customer?.dni ?? "",
    };
    const html = buildShippingLabelHTML([row], false, window.location.origin);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [parcelPreview, customer]);

  // ── Auto-generate ref (bulk mode) ─────────────────────────────────────────
  const autoGenerateCalledRef = useRef(false);
  useEffect(() => {
    autoGenerateCalledRef.current = false;
  }, [data?.slCode]);

  // ── Encomiendas autocomplete ───────────────────────────────────────────────
  const [encomiendas, setEncomiendas] = useState<EncomiendaOption[]>([]);
  const [courierOpen, setCourierOpen] = useState(false);
  const courierInputRef = useRef<HTMLInputElement>(null);
  const courierDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch encomiendas list once
  useEffect(() => {
    import("@/lib/services/encomienda-service")
      .then(({ getActiveEncomiendas }) => {
        getActiveEncomiendas()
          .then((list) => {
            const mergedList: EncomiendaOption[] = list.map((e) => ({
              id: e.id,
              name: e.name,
              zones: e.zones || [],
              cost: e.cost ?? null,
              costDisplay: e.costDisplay || "",
            }));

            fetch("/data/encomiendas.json")
              .then((r) => r.json())
              .then((d: { encomiendas: EncomiendaOption[] }) => {
                if (Array.isArray(d?.encomiendas)) {
                  d.encomiendas.forEach((e) => {
                    if (!mergedList.some((item) => item.id.toLowerCase() === e.id.toLowerCase())) {
                      mergedList.push(e);
                    }
                  });
                }
                setEncomiendas(mergedList);
              })
              .catch(() => {
                setEncomiendas(mergedList);
              });
          })
          .catch((err) => {
            console.warn("[NovaShippingLabelModal] getActiveEncomiendas failed:", err);
            fetch("/data/encomiendas.json")
              .then((r) => r.json())
              .then((d: { encomiendas: EncomiendaOption[] }) =>
                setEncomiendas(d.encomiendas || []),
              )
              .catch(() => {});
          });
      })
      .catch(() => {
        fetch("/data/encomiendas.json")
          .then((r) => r.json())
          .then((d: { encomiendas: EncomiendaOption[] }) =>
            setEncomiendas(d.encomiendas || []),
          )
          .catch(() => {});
      });
  }, []);

  // Filter encomiendas based on current input
  const filteredEncomiendas = useMemo(() => {
    if (!courierService.trim()) return encomiendas;
    const q = courierService.toLowerCase();
    return encomiendas.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.zones.some((z) => z.toLowerCase().includes(q)),
    );
  }, [courierService, encomiendas]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!courierOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        courierInputRef.current &&
        !courierInputRef.current.contains(e.target as Node) &&
        courierDropdownRef.current &&
        !courierDropdownRef.current.contains(e.target as Node)
      ) {
        setCourierOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [courierOpen]);

  // Load customer info when modal opens
  useEffect(() => {
    if (!data?.slCode) return;
    setLoadingCustomer(true);
    setCustomer(null);
    setTempCustomer(null);
    setDeliveryAddress("");
    setCourierService("");
    setNewPackageStatus("");
    setParcelPreview(null);
    setShowPreview(false);

    firebaseApi.customers
      .getBySlCode(data.slCode)
      .then(async (res) => {
        if (res.success && res.data) {
          const c = res.data as CustomerInfo;
          setCustomer(c);

          const encomAddr = c.defaultAddress ?? c.addresses?.find((a) => a.isDefault && a.isActive !== false) ?? c.addresses?.[0];

          // Smart encomienda service pre-fill resolver:
          // Checks defaultAddress, addresses, and top-level customer fields.
          const resolvedEnc = resolveCustomerEncomiendaService(c, data?.encomiendaName);
          setClientCourier(resolvedEnc);

          // Smart address resolver: extracts structured location fields (province, canton, district, detail)
          // entered by users in SP2 when map pin was removed.
          const resolveFullAddress = (): string => {
            if (encomAddr) {
              const parts = [];
              if (encomAddr.streetAddress) parts.push(encomAddr.streetAddress);
              
              const details = (encomAddr as any).details ? (encomAddr as any).details.trim() : "";
              const instructions = encomAddr.deliveryInstructions ? encomAddr.deliveryInstructions.trim() : "";
              
              if (details) parts.push(details);
              
              if (instructions) {
                const isRedundant = areStringsRedundant(details, instructions);
                if (!isRedundant) {
                  parts.push(`Instrucciones: ${instructions}`);
                }
              }
              
              if (parts.length > 0) return parts.join("\n");
            }

            const loc = (c as any).location || (c as any).direccion || (c as any).address;
            if (loc && typeof loc === 'object') {
              const parts = [];
              const detail = loc.addressDetail || loc.direccionExacta || loc.detail || loc.streetAddress;
              if (detail) parts.push(detail);
              if (loc.district || loc.distrito) parts.push(loc.district || loc.distrito);
              if (loc.canton) parts.push(loc.canton);
              if (loc.province || loc.provincia) parts.push(loc.province || loc.provincia);
              if (parts.length > 0) return parts.join(", ");
            }
            if ((c as any).direccionExacta) {
              const parts = [(c as any).direccionExacta];
              if ((c as any).distrito) parts.push((c as any).distrito);
              if ((c as any).canton) parts.push((c as any).canton);
              if ((c as any).provincia) parts.push((c as any).provincia);
              return parts.join(", ");
            }
            const legacyAddr = (c as any).encomiendaAddress || (c as any).address;
            if (legacyAddr?.deliveryInstructions) return legacyAddr.deliveryInstructions;
            if (legacyAddr?.streetAddress) return legacyAddr.streetAddress;
            if (c.ruta) return `Ruta: ${c.ruta}`;
            return "";
          };

          const fullAddr = resolveFullAddress();
          setClientAddress(fullAddr);

          if (editingLabel) {
            setDeliveryAddress(editingLabel.recipientAddress);
            setCourierService(editingLabel.notes?.replace(/^Courier:\s*/, "") || "");
            setUseAdminOverride(false);
          } else {
            const override = (c as any).adminAddressOverride;
            if (override?.deliveryAddress) {
              setDeliveryAddress(deduplicateAddressLines(override.deliveryAddress));
              setCourierService(resolveEncomiendaName(override.courierService || ""));
              setUseAdminOverride(true);
            } else {
              setDeliveryAddress(fullAddr);
              setCourierService(resolvedEnc);
              setUseAdminOverride(false);
            }
          }
        } else {
          // callFunction returns { success: false } instead of rejecting when not found —
          // handle temp customer path here (the .catch() below never fires in practice).
          try {
            const temp = await createOrGetTempCustomer(
              data.clientName,
              data.slCode || undefined,
              "encomiendas_label",
            );
            setTempCustomer(temp);
            // Pre-fill address / courier if already persisted on a previous label generation
            if (editingLabel) {
              setDeliveryAddress(editingLabel.recipientAddress);
              setCourierService(editingLabel.notes?.replace(/^Courier:\s*/, "") || "");
            } else {
              if (temp.deliveryAddress) setDeliveryAddress(temp.deliveryAddress);
              if (temp.courierService) setCourierService(temp.courierService);
              else if (data?.encomiendaName)
                setCourierService(data.encomiendaName);
            }
            toast({
              title: "Cliente temporal registrado",
              description: `${data.clientName} → ${temp.slCode}. Nova lo reconocerá en el próximo manifiesto.`,
            });
          } catch (e) {
            console.warn(
              "[NovaShippingLabelModal] temp customer creation failed:",
              e,
            );
          }
        }
      })
      .catch(async () => {
        // Genuine network / auth rejection fallback (rare but possible)
        try {
          const temp = await createOrGetTempCustomer(
            data.clientName,
            data.slCode || undefined,
            "encomiendas_label",
          );
          setTempCustomer(temp);
          if (editingLabel) {
            setDeliveryAddress(editingLabel.recipientAddress);
            setCourierService(editingLabel.notes?.replace(/^Courier:\s*/, "") || "");
          } else {
            if (temp.deliveryAddress) setDeliveryAddress(temp.deliveryAddress);
            if (temp.courierService) setCourierService(temp.courierService);
            else if (data?.encomiendaName) setCourierService(data.encomiendaName);
          }
        } catch (e) {
          console.warn(
            "[NovaShippingLabelModal] temp customer fallback failed:",
            e,
          );
        }
      })
      .finally(() => setLoadingCustomer(false));
  }, [data?.slCode, toast, editingLabel]);

  // Escape key
  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [data, onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = data ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [data]);

  const handleGenerate = useCallback(async () => {
    if (!data) return;
    if (!deliveryAddress.trim() || !courierService.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Completa la dirección y el servicio de encomienda",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    try {
      const parcelId = editingLabel ? editingLabel.labelNumber : `PCL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Optionally update package statuses if tracking IDs resolve to package docs
      if (newPackageStatus && data.trackings.length > 0) {
        // Try bulk update by searching each tracking — best-effort
        const pkgRes = await firebaseApi.packages.list({
          q: data.slCode,
          limit: 200,
        });
        if (pkgRes.success && pkgRes.data) {
          const allPkgs: any[] = pkgRes.data.data ?? [];
          const matchedIds = allPkgs
            .filter((p) => data.trackings.includes(p.tracking))
            .map((p) => p.id);

          if (matchedIds.length > 0) {
            await firebaseApi.packages.bulkUpdateStatus(
              matchedIds,
              newPackageStatus,
              {
                statusLockedAt: new Date().toISOString(),
                manuallyUpdated: true,
              },
            );
          }
        }
      }

      const preview: ParcelPreview = {
        parcelId,
        slCode: data.slCode,
        recipientName: customer?.fullName || data.clientName,
        recipientPhone: customer?.phone,
        recipientDni: customer?.dni,
        deliveryAddress,
        courierService,
        trackings: data.trackings,
        ruta: data.ruta || customer?.ruta,
        createdAt: editingLabel ? editingLabel.createdAt : new Date().toISOString(),
      };

      setParcelPreview(preview);
      setShowPreview(true);

      // Persist shipping label record in Firestore history
      try {
        const { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp } = await import("firebase/firestore");
        const { db, auth } = await import("@/lib/firebase/config");

        // Resolve matching packages in Firestore to persist relational weight and cost totals
        const packageDocs = await Promise.all(
          data.trackings.map((t) => getDoc(doc(db, "packages", t)))
        );

        const packages = packageDocs
          .filter((doc) => doc.exists())
          .map((doc) => {
            const data = doc.data()!;
            return {
              id: doc.id,
              trackingNumber: data.tracking || data.trackingNumber || doc.id,
              description: data.description || "Package",
              weight: data.weight || 0,
              value: data.calculatedCost || 0,
            };
          });

        const totalWeight = packages.reduce((sum, pkg) => sum + (pkg.weight || 0), 0);
        const totalValue = packages.reduce((sum, pkg) => sum + (pkg.value || 0), 0);
        const uid = auth.currentUser?.uid || "admin";

        if (editingLabel) {
          await updateDoc(doc(db, "shippingLabels", editingLabel.id), {
            recipientAddress: deliveryAddress.trim(),
            recipientPhone: customer?.phone || "",
            recipientDni: customer?.dni || "",
            packageIds: data.trackings,
            packageCount: packages.length,
            totalWeight,
            totalValue,
            packages,
            notes: `Courier: ${courierService}`,
            updatedAt: serverTimestamp(),
          });
        } else {
          // Generate label number matching standard format
          const d = new Date();
          const yyyymmdd = d.toISOString().slice(0, 10).replace(/-/g, "");
          const ms = d.getTime();
          const rand = Math.floor(100 + Math.random() * 900);
          const labelNumber = `LABEL-${yyyymmdd}-${ms}-${rand}`;

          // Generate search tokens for simple firestore query matches
          const searchTokens = [
            data.slCode.toLowerCase(),
            (customer?.fullName || data.clientName).toLowerCase(),
            labelNumber.toLowerCase(),
            ...data.trackings.map(t => t.toLowerCase())
          ];

          await addDoc(collection(db, "shippingLabels"), {
            labelNumber,
            customerId: customer?.id || tempCustomer?.slCode || data.slCode,
            customerName: customer?.fullName || tempCustomer?.name || data.clientName,
            customerSlCode: data.slCode,
            recipientName: customer?.fullName || tempCustomer?.name || data.clientName,
            recipientAddress: deliveryAddress.trim(),
            recipientCity: customer?.ruta || tempCustomer?.ruta || data.ruta || "",
            recipientCountry: "Costa Rica",
            recipientPhone: customer?.phone || null,
            packageIds: data.trackings,
            packageCount: packages.length,
            totalWeight,
            totalValue,
            packages,
            deliveryMethod: "route",
            routeId: null,
            routeName: null,
            labelFormat: "thermal",
            barcodeData: labelNumber,
            status: "pending",
            notes: `Courier: ${courierService}`,
            deliveryInstructions: null,
            createdAt: serverTimestamp(),
            createdBy: uid,
            updatedAt: serverTimestamp(),
            searchTokens,
          });
        }
      } catch (err) {
        console.warn("[NovaShippingLabelModal] Failed to write shipping label history record:", err);
      }

      // Persist flat address + courier service back to the customer's adminAddressOverride field if checked
      if (customer?.id && saveToAdminOverride) {
        firebaseApi.customers
          .update(customer.id, {
            adminAddressOverride: {
              deliveryAddress: deliveryAddress.trim(),
              courierService: courierService.trim(),
            },
          })
          .catch((e) =>
            console.warn(
              "[NovaShippingLabelModal] adminAddressOverride data save failed:",
              e,
            ),
          );

        if (customer.slCode) {
          updateCustomerEncomiendaService(customer.slCode, courierService).catch((e) =>
            console.warn(
              "[NovaShippingLabelModal] updateCustomerEncomiendaService failed:",
              e,
            )
          );
        }
      } else if (tempCustomer?.slCode) {
        // ── Temp customer: update temp_customers collection ──
        updateTempCustomerEncomienda(
          tempCustomer.slCode,
          deliveryAddress,
          courierService,
        ).catch((e) =>
          console.warn(
            "[NovaShippingLabelModal] temp encomienda save failed:",
            e,
          ),
        );
      }

      toast({
        title: "Etiqueta generada",
        description: `${data.trackings.length} tracking${data.trackings.length !== 1 ? "s" : ""} · ${parcelId}`,
      });
      window.dispatchEvent(new CustomEvent('shipping-label-generated', { detail: { slCode: data.slCode } }));
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("[NovaShippingLabelModal] generate error:", err);
      toast({
        title: "Error",
        description: "Error al generar etiqueta",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [
    data,
    customer,
    deliveryAddress,
    courierService,
    newPackageStatus,
    toast,
    onSuccess,
  ]);

  // ── Auto-generate when defaults ready (bulk mode — Encomiendas only) ──────────
  useEffect(() => {
    if (!autoGenerate || loadingCustomer || generating || showPreview) return;
    if (!deliveryAddress.trim() || !courierService.trim()) return;
    if (autoGenerateCalledRef.current) return;
    autoGenerateCalledRef.current = true;
    handleGenerate();
  }, [
    autoGenerate,
    loadingCustomer,
    deliveryAddress,
    courierService,
    generating,
    showPreview,
    handleGenerate,
  ]);

  if (!data) return null;

  return (
    <AnimatePresence>
      {/* Backdrop — higher z than the table modal (z-50) so we sit above it */}
      <motion.div
        key="nova-label-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[75] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <motion.div
        key="nova-label-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-label-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[75] flex items-center justify-center p-4 pointer-events-none"
      >
        {showPreview && parcelPreview ? (
          /* ── Print preview ─────────────────────────────────────────────────── */
          <div className="pointer-events-auto w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border print:hidden flex-shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Vista Previa — {data.slCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={handlePrintLabel}
                  aria-label="Imprimir etiqueta"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => setShowPreview(false)}
                >
                  ← Editar
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              <ShippingLabelPrint parcel={parcelPreview} customer={customer} />
            </div>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────────────────── */
          <div className="pointer-events-auto w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <span
                  id="nova-label-title"
                  className="text-sm font-semibold text-foreground"
                >
                  Generar Etiqueta
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Customer info card */}
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                {loadingCustomer ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Cargando info del cliente...
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">
                          {customer?.fullName || data.clientName}
                        </span>
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded">
                          {data.slCode}
                        </span>
                        {(data.ruta || customer?.ruta) && (
                          <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[10px] font-medium rounded flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" />
                            {data.ruta || customer?.ruta}
                          </span>
                        )}
                      </div>
                      {customer?.email && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {customer.email}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Trackings list */}
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {data.trackings.length} tracking
                    {data.trackings.length !== 1 ? "s" : ""}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-28 overflow-y-auto">
                    {data.trackings.map((t, i) => (
                      <span
                        key={i}
                        className="text-xs font-mono text-foreground flex items-center gap-1"
                      >
                        <span className="w-1 h-1 bg-foreground/40 rounded-full shrink-0" />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Delivery address */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label
                    className="text-xs font-semibold text-foreground"
                    htmlFor="nova-label-address"
                  >
                    Dirección de Entrega *
                  </label>
                  {!!(customer as any)?.adminAddressOverride?.deliveryAddress && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={cn(
                          "px-2.5 py-0.5 text-[10px] font-bold rounded-full border transition-all",
                          !useAdminOverride
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-input hover:text-foreground"
                        )}
                        onClick={() => {
                          setUseAdminOverride(false);
                          setDeliveryAddress(clientAddress);
                          setCourierService(clientCourier);
                        }}
                      >
                        Cliente (SmartWeb)
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "px-2.5 py-0.5 text-[10px] font-bold rounded-full border transition-all",
                          useAdminOverride
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-input hover:text-foreground"
                        )}
                        onClick={() => {
                          setUseAdminOverride(true);
                          const override = (customer as any).adminAddressOverride;
                          if (override) {
                            setDeliveryAddress(override.deliveryAddress || "");
                            setCourierService(resolveEncomiendaName(override.courierService || ""));
                          }
                        }}
                      >
                        Admin (Portal)
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  id="nova-label-address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Ingresa la dirección completa de entrega..."
                  rows={3}
                  className="w-full px-3 py-2.5 border-2 border-input rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none bg-background text-foreground text-sm"
                  aria-required="true"
                />
              </div>

              {/* Courier service — autocomplete */}
              <div className="relative">
                <label
                  className="block text-xs font-semibold text-foreground mb-1.5"
                  htmlFor="nova-label-courier"
                >
                  Servicio de Encomienda / Courier *
                </label>
                <Input
                  ref={courierInputRef}
                  id="nova-label-courier"
                  value={courierService}
                  onChange={(e) => {
                    setCourierService(e.target.value);
                    setCourierOpen(true);
                  }}
                  onFocus={() => setCourierOpen(true)}
                  placeholder="Ej: Correos de Costa Rica, Jetbox..."
                  className={cn(
                    "h-10 text-sm",
                    courierService && "border-primary",
                  )}
                  aria-required="true"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={courierOpen}
                  aria-controls="nova-courier-listbox"
                />
                {courierOpen && filteredEncomiendas.length > 0 && (
                  <div
                    ref={courierDropdownRef}
                    id="nova-courier-listbox"
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 z-[80] max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                  >
                    {filteredEncomiendas.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        role="option"
                        aria-selected={courierService === e.name}
                        onClick={() => {
                          setCourierService(e.name);
                          setCourierOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent",
                          courierService === e.name &&
                            "bg-accent font-semibold",
                        )}
                      >
                        <span className="font-medium text-foreground">
                          {e.name}
                        </span>
                        {e.zones.length > 0 && (
                          <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                            {e.zones.join(", ")}
                          </span>
                        )}
                        {e.costDisplay && (
                          <span className="text-[10px] text-primary font-medium">
                            {e.costDisplay}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Save override checkbox */}
              {customer?.id && (
                <div className="flex items-center space-x-2 bg-accent/40 px-3 py-2 rounded-lg border border-border">
                  <input
                    type="checkbox"
                    id="saveToAdminOverride"
                    checked={saveToAdminOverride}
                    onChange={(e) => setSaveToAdminOverride(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-primary/20 accent-primary cursor-pointer"
                  />
                  <label htmlFor="saveToAdminOverride" className="text-[11px] font-semibold text-muted-foreground cursor-pointer select-none leading-none">
                    Guardar cambios como dirección de administración preferida (no altera el perfil del cliente en SmartWeb)
                  </label>
                </div>
              )}

              {/* Optional status update */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Actualizar estado{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {STATUS_OPTIONS.map((opt) => {
                    const isSelected = newPackageStatus === opt.value;
                    const colors = STATUS_COLORS[opt.color];
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setNewPackageStatus(isSelected ? "" : opt.value)
                        }
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-2 rounded-lg border-2 transition-all text-left",
                          isSelected
                            ? `${colors.bg} ${colors.border} ${colors.text}`
                            : "bg-card border-border hover:border-border/80 text-foreground",
                        )}
                        aria-pressed={isSelected}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
                {newPackageStatus && (
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Se intentará actualizar los paquetes a "
                    {
                      STATUS_OPTIONS.find((o) => o.value === newPackageStatus)
                        ?.label
                    }
                    "
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={
                  !deliveryAddress.trim() ||
                  !courierService.trim() ||
                  generating
                }
                onClick={handleGenerate}
              >
                {generating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Tag className="h-3.5 w-3.5" />
                    Generar Etiqueta
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
