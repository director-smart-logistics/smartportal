import { useTheme } from "@/lib/context/ThemeContext";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Hash,
  Globe,
  Package,
  Calendar,
  Clock,
  Truck,
  LanguagesIcon,
  BadgeCheck,
  Boxes,
  ChevronDown,
  ChevronUp,
  Database,
  Cloud,
  HardDrive,
  X,
  Info,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

interface CustomerDetailModalProps {
  isOpen: boolean;
  customer: any | null;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(raw: unknown, opts?: { showTime?: boolean }): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  try {
    let d: Date;
    if (typeof raw === "object" && raw !== null && "_seconds" in (raw as any)) {
      d = new Date((raw as any)._seconds * 1000);
    } else if (typeof raw === "number") {
      d = new Date(raw);
    } else {
      d = new Date(String(raw));
    }
    if (isNaN(d.getTime())) return String(raw);
    return new Intl.DateTimeFormat("es-CR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(opts?.showTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(d);
  } catch {
    return String(raw);
  }
}

type SyncSource = "sp1" | "sp2" | "both" | null;

interface FieldProps {
  label: string;
  value?: string | number | null | boolean;
  icon?: React.ElementType;
  mono?: boolean;
  syncSource?: SyncSource;
  hideIfEmpty?: boolean;
}

function Field({
  label,
  value,
  icon: Icon,
  mono,
  syncSource,
  hideIfEmpty = true,
}: FieldProps) {
  const isEmpty = value === null || value === undefined || value === "";

  if (hideIfEmpty && isEmpty) return null;

  const display = isEmpty
    ? "—"
    : typeof value === "boolean"
      ? value
        ? "Sí"
        : "No"
      : String(value);

  const syncBadge = syncSource && (
    <span
      className={cn(
        "text-[9px] font-bold px-1 py-0.5 rounded",
        syncSource === "sp1" &&
          "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        syncSource === "sp2" &&
          "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
        syncSource === "both" &&
          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      )}
    >
      {syncSource === "sp1" && "SP1"}
      {syncSource === "sp2" && "SP2"}
      {syncSource === "both" && "SP1+SP2"}
    </span>
  );

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
        {label}
        {syncBadge}
      </span>
      <span
        className={cn(
          "text-sm text-foreground break-all leading-tight font-medium",
          mono && "font-mono",
          display === "—" && "text-muted-foreground/60 italic font-normal",
        )}
      >
        {display}
      </span>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active:
    "border-green-500/40 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  inactive:
    "border-gray-400/40 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  suspended:
    "border-yellow-500/40 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400",
};

const TIER_STYLE: Record<string, string> = {
  basic: "border-gray-400/40 text-gray-600 dark:text-gray-400",
  smart: "border-blue-500/40 text-blue-600 dark:text-blue-400",
  premium: "border-purple-500/40 text-purple-600 dark:text-purple-400",
  business: "border-amber-500/40 text-amber-600 dark:text-amber-400",
};

// Map of which fields sync from which source
const SP1_FIELDS = [
  "slCode",
  "fullName",
  "firstName",
  "lastName",
  "dni",
  "phone",
  "email",
  "location",
  "address",
  "ruta",
  "consolidationEnabled",
  "tier",
  "status",
  "role",
  "firebaseUid",
  "customerName",
];
const SP2_FIELDS = [
  "birthDate",
  "nationality",
  "preferredLanguage",
  "memberSince",
  "membershipExpires",
  "membershipTier",
  "acceptMarketing",
  "emailVerified",
  "isVerified",
  "verifiedDni",
  "verifiedEmail",
  "verifiedPhone",
  "verificationSource",
  "consolidationEnabledAt",
  "consolidationDisabledAt",
];

function getSyncSource(fieldName: string): SyncSource {
  const inSP1 = SP1_FIELDS.includes(fieldName);
  const inSP2 = SP2_FIELDS.includes(fieldName);
  if (inSP1 && inSP2) return "both";
  if (inSP1) return "sp1";
  if (inSP2) return "sp2";
  return null;
}

export function CustomerDetailModal({
  isOpen,
  customer,
  onClose,
}: CustomerDetailModalProps) {
  const { theme } = useTheme();
  const { t } = useTranslation("customers");
  const isDark = theme === "dark";
  const [showAuditDetails, setShowAuditDetails] = useState(false);

  if (!customer) return null;

  const location = customer.location || {
    province: (customer as any).provincia || (customer as any).province,
    canton: (customer as any).canton,
    district: (customer as any).distrito || (customer as any).district,
    addressDetail: (customer as any).direccionExacta || (customer as any).direccion || (customer as any).address,
    city: (customer as any).ciudad || (customer as any).city,
  };
  const fullLocation = [
    (customer as any).direccionExacta || (customer as any).direccion || (location as any)?.addressDetail || (location as any)?.detail,
    location?.district,
    location?.canton,
    location?.province,
  ].filter(Boolean).join(', ');
  const exactAddress =
    (customer as any).direccionExacta ||
    (customer as any).direccion ||
    (location as any)?.addressDetail ||
    (location as any)?.detail ||
    customer.defaultAddress?.streetAddress ||
    customer.defaultAddress?.deliveryInstructions ||
    customer.addresses?.[0]?.streetAddress ||
    customer.addresses?.[0]?.deliveryInstructions ||
    (customer as any).address;

  const encomiendaDisplay = (() => {
    const enc = customer.encomienda || (customer as any).encomiendaProvider;
    if (!enc) return (customer as any).encomiendaName || (customer as any).encomiendaId || null;
    if (typeof enc === "object") {
      return (enc as any).name || (enc as any).id || (enc as any).nombre || null;
    }
    return String(enc);
  })();

  const isConsolidationActive = customer.consolidationEnabled === true;
  const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "w-screen h-screen max-w-none max-h-none p-0 gap-0 overflow-hidden flex flex-col rounded-none border-none inset-0 m-0 z-[70] [&>button:last-child]:hidden",
          isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900",
        )}
        data-testid="customer-detail-modal"
      >
        {/* HEADER STICKY */}
        <div
          className={cn(
            "px-6 py-4 border-b flex items-center justify-between shrink-0",
            isDark ? "border-gray-800 bg-gray-900/90" : "border-gray-200 bg-white shadow-sm",
          )}
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 border shadow-inner",
                customer.status === "active"
                  ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                  : "bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400",
              )}
            >
              {(customer.fullName?.[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight leading-tight">
                  {customer.fullName?.toUpperCase()}
                </h2>
                {customer.slCode && (
                  <Badge variant="outline" className="font-mono text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary border-primary/20">
                    {customer.slCode}
                  </Badge>
                )}
                {customer.status && (
                  <Badge
                    variant="outline"
                    className={cn("text-xs px-2 py-0.5 capitalize font-semibold", STATUS_STYLE[customer.status] ?? "")}
                  >
                    {customer.status}
                  </Badge>
                )}
                {customer.tier && (
                  <Badge
                    variant="outline"
                    className={cn("text-xs px-2 py-0.5 capitalize font-semibold", TIER_STYLE[customer.tier] ?? "")}
                  >
                    {customer.tier}
                  </Badge>
                )}
                {customer.isVerified && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> TSE Verificado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detalle consolidado del cliente • Creado: {fmtDate(customer.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isConsolidationActive && (
              <div
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-semibold"
                data-testid="customer-detail-consolidation-header"
              >
                <Boxes className="h-4 w-4" />
                <span>Consolidación Activa</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full hover:bg-muted"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* BODY - 3 COLUMNS BY DOMAIN */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* COLUMNA 1: IDENTIDAD & CONTACTO 👤 */}
          <div className={cn("p-5 rounded-xl border flex flex-col gap-4 shadow-sm", isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-border">
              <User className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-sm">Identidad & Contacto</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" value={customer.firstName} syncSource={getSyncSource("firstName")} />
              <Field label="Apellidos" value={customer.lastName} syncSource={getSyncSource("lastName")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cédula / DNI" value={customer.dni} mono syncSource={getSyncSource("dni")} />
              <Field label="Código SL" value={customer.slCode} mono syncSource={getSyncSource("slCode")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Firebase UID" value={customer.firebaseUid} mono syncSource={getSyncSource("firebaseUid")} />
              <Field label="Rol" value={customer.role} syncSource={getSyncSource("role")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("customers.birthDate")} value={customer.birthDate} icon={Calendar} syncSource={getSyncSource("birthDate")} />
              <Field label={t("customers.nationality")} value={customer.nationality} icon={Globe} syncSource={getSyncSource("nationality")} />
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <Field label="Correo Electrónico" value={customer.email} icon={Mail} syncSource={getSyncSource("email")} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono" value={customer.phone} icon={Phone} syncSource={getSyncSource("phone")} />
                <Field label="Idioma Preferido" value={customer.preferredLanguage} icon={LanguagesIcon} syncSource={getSyncSource("preferredLanguage")} />
              </div>
            </div>
          </div>

          {/* COLUMNA 2: LOGÍSTICA & MEMBRESÍA 🚚 */}
          <div className={cn("p-5 rounded-xl border flex flex-col gap-4 shadow-sm", isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-border">
              <Truck className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-sm">Logística, Rutas & Membresía</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Ruta Asignada (SP1)" value={customer.ruta} icon={Truck} syncSource={getSyncSource("ruta")} />
              <Field label="Servicio Encomienda" value={encomiendaDisplay} icon={Package} syncSource={getSyncSource("encomienda")} />
            </div>

            {/* Banner de Consolidación */}
            {isConsolidationActive ? (
              <div
                className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400"
                data-testid="customer-detail-consolidation-section"
              >
                <Boxes className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold leading-tight">Consolidación Habilitada</span>
                  <span className="text-[11px] opacity-80 mt-0.5">
                    Habilitada el {fmtDate(customer.consolidationEnabledAt ?? customer.updatedAt, { showTime: true })}
                  </span>
                </div>
              </div>
            ) : hasValue(customer.consolidationDisabledAt) ? (
              <div
                className="flex items-start gap-2.5 p-3 rounded-lg bg-muted border border-border text-muted-foreground"
                data-testid="customer-detail-consolidation-disabled"
              >
                <Boxes className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold leading-tight">Consolidación Desactivada</span>
                  <span className="text-[11px] opacity-70 mt-0.5">
                    Desde {fmtDate(customer.consolidationDisabledAt, { showTime: true })}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Membresía */}
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("customers.membershipTier")} value={customer.membershipTier} syncSource={getSyncSource("membershipTier")} />
                <Field label="Miembro Desde" value={fmtDate(customer.memberSince)} icon={Calendar} syncSource={getSyncSource("memberSince")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Membresía Expira" value={fmtDate(customer.membershipExpires)} syncSource={getSyncSource("membershipExpires")} />
                <Field label="Acepta Marketing" value={customer.acceptMarketing} syncSource={getSyncSource("acceptMarketing")} />
              </div>
            </div>

            {/* Resumen de Envíos */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <Field label="Total Envíos" value={customer.totalShipments} icon={Package} />
              <Field label="Envíos Pendientes" value={customer.pendingShipments} />
            </div>

            {/* Notas */}
            {hasValue(customer.notes) && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Notas
                </span>
                <p className="text-xs text-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg border border-border/50 leading-relaxed">
                  {customer.notes}
                </p>
              </div>
            )}
          </div>

          {/* COLUMNA 3: UBICACIÓN & DIRECCIONES REGISTRADAS 📍 */}
          <div className={cn("p-5 rounded-xl border flex flex-col gap-4 shadow-sm", isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-border">
              <MapPin className="w-5 h-5 text-emerald-500" />
              <h3 className="font-semibold text-sm">Ubicación & Direcciones SP2</h3>
            </div>

            {hasValue(fullLocation) && (
              <Field label="Ubicación Completa" value={fullLocation} icon={MapPin} syncSource={getSyncSource("location")} />
            )}

            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Provincia" value={location?.province} syncSource={getSyncSource("location")} />
              <Field label="Cantón" value={location?.canton} syncSource={getSyncSource("location")} />
              <Field label="Distrito" value={location?.district} syncSource={getSyncSource("location")} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Ciudad" value={location?.city} syncSource={getSyncSource("location")} />
              <Field label="País" value={customer.country} icon={Globe} syncSource={getSyncSource("location")} />
            </div>

            <Field label="Dirección Principal" value={exactAddress} syncSource={getSyncSource("address")} />

            {/* Registered Addresses from SP2 */}
            {Array.isArray(customer.addresses) && customer.addresses.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                  Direcciones en SP2 ({customer.addresses.length})
                </span>
                <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {customer.addresses.map((addr: any, idx: number) => {
                    const isDefault = addr.isDefault || addr.id === customer.defaultAddress?.id;
                    const addrFullGeo = [addr.district, addr.canton, addr.province].filter(Boolean).join(", ");
                    const addrText = [addr.streetAddress, addr.details || addr.detail, addr.deliveryInstructions].filter(Boolean).join(" - ");

                    return (
                      <div
                        key={addr.id || idx}
                        className={cn(
                          "p-3 rounded-lg border text-xs space-y-1.5 transition-all shadow-sm",
                          isDefault
                            ? "bg-amber-500/10 border-amber-500/30 text-foreground"
                            : "bg-muted/30 border-border"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-foreground flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            {addr.alias || "Dirección"}
                          </span>
                          {isDefault && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-600 border-amber-500/30">
                              Principal
                            </Badge>
                          )}
                        </div>

                        {addrText && (
                          <p className="text-foreground/90 font-medium leading-snug">
                            {addrText}
                          </p>
                        )}

                        {addrFullGeo && (
                          <p className="text-muted-foreground text-[11px]">
                            {addrFullGeo}
                          </p>
                        )}

                        {addr.recipientName && (
                          <p className="text-muted-foreground text-[10px]">
                            <span className="font-semibold">Entrega a:</span> {addr.recipientName} {addr.recipientPhone ? `(${addr.recipientPhone})` : ""}
                          </p>
                        )}

                        {addr.encomienda?.name && (
                          <p className="text-blue-600 dark:text-blue-400 font-semibold text-[10px] flex items-center gap-1">
                            <Package className="h-3 w-3" /> Encomienda: {addr.encomienda.name}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* AUDIT DETAILS COLLAPSIBLE */}
        <div className="px-6 pb-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAuditDetails(!showAuditDetails)}
              className={cn(
                "w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-colors",
                isDark ? "border-gray-800 hover:bg-gray-900 bg-gray-900/40" : "border-gray-200 hover:bg-gray-100 bg-white",
              )}
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span>Detalles técnicos de sincronización e infraestructura (SP1 / SP2)</span>
              </div>
              {showAuditDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAuditDetails && (
              <div
                className={cn(
                  "p-4 rounded-xl border space-y-4 text-xs",
                  isDark ? "border-gray-800 bg-gray-900/50" : "border-gray-200 bg-white",
                )}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Sincronizado" value={customer.isSynced ? "Sí" : "No"} />
                  <Field label="Fuente" value={customer.syncSource} />
                  <Field label="Versión Sync" value={customer.syncVersion} mono />
                  <Field label="Último Sync" value={fmtDate(customer.lastSyncAt, { showTime: true })} icon={Clock} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border">
                  <Field label="Creado en SP1" value={fmtDate(customer.createdAt, { showTime: true })} mono />
                  <Field label="Actualizado en SP1" value={fmtDate(customer.updatedAt, { showTime: true })} mono />
                  <Field label="Creado en SP2" value={fmtDate(customer.sp2CreatedAt, { showTime: true })} mono />
                  <Field label="Actualizado en SP2" value={fmtDate(customer.sp2UpdatedAt, { showTime: true })} mono />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER STICKY */}
        <div
          className={cn(
            "px-6 py-4 border-t flex items-center justify-between shrink-0",
            isDark ? "bg-gray-900/90 border-gray-800" : "bg-white border-gray-200 shadow-sm",
          )}
        >
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Mostrando vista de lectura consolidada. Para modificar datos use el botón Editar.</span>
          </div>

          <Button type="button" onClick={onClose} className="min-w-[120px]">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
