import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  AlertCircle,
  User,
  Mail,
  Phone,
  MapPin,
  Hash,
  Globe,
  ShieldCheck,
  Package,
  Calendar,
  Clock,
  Truck,
  BadgeCheck,
  ToggleLeft,
  ToggleRight,
  FileText,
  Activity,
  CreditCard,
  Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { firebaseApi } from "@/lib/firebase/callable";
import { getPreAlertsDatabase } from "@/lib/services/pre-alert-resolver";
import { collection, query, where, getDocs } from "firebase/firestore";

interface NovaCustomerQuickViewModalProps {
  slCode: string | null;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(
  raw: string | null | undefined,
  opts?: { showTime?: boolean },
): string {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat("es-CR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(opts?.showTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(d);
  } catch {
    return raw;
  }
}

function computeSuggestedRoute(customer: any): { suggested: string; reason: string } {
  if (!customer) return { suggested: "Encomiendas", reason: "Sin datos" };
  const currentRuta = customer.ruta;
  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  const defaultAddr = addresses.find((a: any) => a.isDefault) || addresses[0] || {};
  const encName = defaultAddr.encomienda?.name || customer.encomiendaServiceName || customer.encomiendaProvider;
  
  const province = (defaultAddr.province || customer.location?.province || customer.provincia || '').toLowerCase();
  const canton = (defaultAddr.canton || customer.location?.canton || customer.canton || '').toLowerCase();

  if (encName) {
    return { suggested: "Encomiendas", reason: `Cliente tiene encomienda configurada (${encName})` };
  }
  if (province.includes("guanacaste") || canton.includes("nicoya") || canton.includes("liberia") || canton.includes("santa cruz")) {
    return { suggested: "Ruta Guanacaste", reason: "Ubicación detectada en Guanacaste" };
  }
  if (province.includes("limon") || province.includes("limón") || canton.includes("siquirres") || canton.includes("pococí") || canton.includes("guapiles")) {
    return { suggested: "Ruta Limón / Encomiendas", reason: "Ubicación detectada en Limón/Caribe" };
  }
  if (province.includes("puntarenas") || canton.includes("perez zeledon") || canton.includes("quepos")) {
    return { suggested: "Ruta Pacífico / Sur", reason: "Ubicación detectada en Puntarenas/Zona Sur" };
  }
  if (province.includes("alajuela") || province.includes("heredia") || province.includes("cartago") || province.includes("san josé") || province.includes("san jose")) {
    return { suggested: "Ruta GAM (Central)", reason: "Ubicación dentro del Gran Área Metropolitana" };
  }
  return { suggested: currentRuta || "Encomiendas", reason: "Sugerencia basada en la dirección principal" };
}

function Field({
  label,
  value,
  icon: Icon,
  mono,
  span,
}: {
  label: string;
  value?: string | number | null | boolean;
  icon?: React.ElementType;
  mono?: boolean;
  span?: 2 | 3;
}) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "Sí"
          : "No"
        : String(value);
  const isEmpty = display === "—";
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 min-w-0",
        span === 2 && "col-span-2",
        span === 3 && "col-span-3",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-foreground break-all leading-snug",
          mono && "font-mono text-xs",
          isEmpty && "text-muted-foreground/50",
        )}
      >
        {display}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon
            className="h-3.5 w-3.5 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        )}
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h4>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {children}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: "green" | "blue" | "amber" | "default";
}) {
  const accentMap = {
    green:
      "bg-green-50  dark:bg-green-900/20  border-green-200  dark:border-green-800  text-green-700  dark:text-green-400",
    blue: "bg-blue-50   dark:bg-blue-900/20   border-blue-200   dark:border-blue-800   text-blue-700   dark:text-blue-400",
    amber:
      "bg-amber-50  dark:bg-amber-900/20  border-amber-200  dark:border-amber-800  text-amber-700  dark:text-amber-400",
    default: "bg-muted border-border text-foreground",
  };
  const cls = accentMap[accent ?? "default"];
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border px-4 py-3", cls)}>
      <div className="flex items-center gap-1.5 opacity-70">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <span className="text-sm font-semibold leading-tight">{value}</span>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  active:
    "border-green-500/40 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  inactive:
    "border-gray-400/40  bg-gray-100 text-gray-600 dark:bg-gray-800    dark:text-gray-400",
  suspended:
    "border-yellow-500/40 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400",
};

const TIER_STYLE: Record<string, string> = {
  basic: "border-gray-400/40   text-gray-600   dark:text-gray-400",
  smart: "border-blue-500/40   text-blue-600   dark:text-blue-400",
  premium: "border-purple-500/40 text-purple-600 dark:text-purple-400",
  business: "border-amber-500/40  text-amber-600  dark:text-amber-400",
};

// ── Component ──────────────────────────────────────────────────────────────

export function NovaCustomerQuickViewModal({
  slCode,
  onClose,
}: NovaCustomerQuickViewModalProps) {
  const [customer, setCustomer] = useState<any | null>(null);
  const [latestPreAlertDate, setLatestPreAlertDate] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slCode) {
      setCustomer(null);
      setLatestPreAlertDate(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCustomer(null);
    setLatestPreAlertDate(null);

    const cleanSlCode = slCode.trim().toUpperCase();

    // Fetch customer profile and query pre_alerts collection in parallel
    Promise.all([
      firebaseApi.customers.getBySlCode(cleanSlCode).catch(() => ({ success: false, data: null, error: 'Not found' })),
      getDocs(query(collection(getPreAlertsDatabase(), "pre_alerts"), where("slCode", "==", cleanSlCode))).catch(() => null),
    ])
      .then(([res, preAlertSnap]) => {
        if (cancelled) return;
        let customerData = res?.success && res?.data ? ((res.data as any).data ?? res.data) : null;

        // Fallback: If customer is not found in SP1 customers collection, resolve from SP2 pre-alert data
        if (!customerData && preAlertSnap && !preAlertSnap.empty) {
          const pData = preAlertSnap.docs[0].data();
          if (pData?.displayName || pData?.dni || pData?.email) {
            customerData = {
              slCode: pData.slCode || cleanSlCode,
              fullName: pData.displayName || `Cliente ${cleanSlCode}`,
              cedula: pData.dni || "—",
              email: pData.email || "—",
              phone: pData.phone || "—",
              status: "active",
              location: {
                address: "Perfil denormalizado en SP2",
                province: "Central",
              },
              packageCount: preAlertSnap.size,
              isPreAlertProfile: true,
            };
          }
        }

        if (customerData) {
          setCustomer(customerData);
          setError(null);
        } else {
          setError(res?.error ?? "No se encontró el cliente");
        }

        if (preAlertSnap && !preAlertSnap.empty) {
          let maxTs: number | null = null;
          let maxDate: any = null;
          preAlertSnap.docs.forEach((d) => {
            const data = d.data();
            const rawTs = data.preAlertCreatedAt || data.createdAt || data.timestamp || data.preAlertDate || data.date;
            let dateObj: Date | null = null;
            if (rawTs?.toDate) dateObj = rawTs.toDate();
            else if (typeof rawTs === "string" || typeof rawTs === "number") dateObj = new Date(rawTs);
            if (dateObj && !isNaN(dateObj.getTime())) {
              if (maxTs === null || dateObj.getTime() > maxTs) {
                maxTs = dateObj.getTime();
                maxDate = dateObj;
              }
            }
          });
          if (maxDate) setLatestPreAlertDate(maxDate);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Error al cargar los datos del cliente");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slCode]);

  const isOpen = !!slCode;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-background w-screen h-screen overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Detalles del cliente"
        >
          {/* Top Bar (Google Style App Bar) */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-bold text-foreground">
                  Detalles del Cliente
                </h2>
                {slCode && (
                  <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 bg-primary/10 text-primary border-primary/30">
                    {slCode}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="h-8 text-xs font-semibold"
              >
                Cerrar (Esc)
              </Button>
            </div>
          </div>

          {/* Fullscreen Body Container */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-muted/10">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center flex-1 py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">
                  Cargando información del cliente...
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col items-center justify-center flex-1 py-20 gap-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <p className="text-sm font-medium text-center text-muted-foreground">
                  {error}
                </p>
              </div>
            )}

            {customer &&
              (() => {
                const location = customer.location;
                const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
                const consolidationOn = !!customer.consolidationEnabled;
                const electronicInvoice = !!customer.electronicInvoiceRequired;
                const initials = (customer.fullName ?? "?")
                  .split(" ")
                  .map((w: string) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                const consolidationDate =
                  customer.consolidationEnabledAt ??
                  customer.consolidationActivatedAt ??
                  customer.consolidationStartedAt ??
                  customer.consolidationUpdatedAt ??
                  (consolidationOn ? customer.updatedAt : null);

                const feDate =
                  customer.electronicInvoiceEnabledAt ??
                  customer.electronicInvoiceActivatedAt ??
                  customer.electronicInvoiceRequestedAt ??
                  customer.electronicInvoiceUpdatedAt ??
                  (electronicInvoice ? customer.updatedAt : null);

                const lastLogin = customer.lastLoginAt ?? customer.lastLogin ?? customer.lastActiveAt;
                const lastPreAlert = customer.lastPreAlertAt ?? customer.lastPrealertAt ?? customer.latestPreAlertAt ?? customer.lastPreAlertDate ?? latestPreAlertDate;

                return (
                  <div className="flex flex-col flex-1 min-h-0">
                    {/* Google Style Profile Header */}
                    <div className="px-8 py-5 bg-card border-b border-border shrink-0">
                      <div className="w-full flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 select-none shadow-inner",
                              customer.status === "active"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {initials}
                          </div>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                                {customer.fullName}
                              </h1>
                              {customer.status && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs px-2 py-0.5 capitalize font-semibold",
                                    STATUS_STYLE[customer.status] ?? "",
                                  )}
                                >
                                  {customer.status}
                                </Badge>
                              )}
                              {customer.tier && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs px-2 py-0.5 capitalize font-semibold",
                                    TIER_STYLE[customer.tier] ?? "",
                                  )}
                                >
                                  {customer.tier}
                                </Badge>
                              )}
                              {customer.isVerified && (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded-md border border-green-200 dark:border-green-800">
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                  Verificado
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                              <span>{customer.email || "Sin correo"}</span>
                              {customer.phone && <span>· Tel: {customer.phone}</span>}
                              {customer.dni && <span>· DNI: {customer.dni}</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3-Column Clean Widescreen Google Grid */}
                    <div className="w-full px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
                      
                      {/* Column 1: Identity, Contact & Membership (4 cols) */}
                      <div className="lg:col-span-4 space-y-5">
                        {/* Identidad */}
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                            <User className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Identidad</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <Field label="Nombre" value={customer.firstName} />
                            <Field label="Apellidos" value={customer.lastName} />
                            <Field label="Cédula / DNI" value={customer.dni} icon={Hash} mono />
                            <Field label="SL Code" value={customer.slCode} mono />
                            <Field label="Rol" value={customer.role} />
                            <Field label="Firebase UID" value={customer.firebaseUid} mono />
                          </div>
                        </div>

                        {/* Contacto */}
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                            <Mail className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Contacto</h3>
                          </div>
                          <div className="space-y-3 text-xs">
                            <Field label="Correo Electrónico" value={customer.email} icon={Mail} />
                            <Field label="Teléfono" value={customer.phone} icon={Phone} />
                            <Field label="Email Verificado" value={customer.emailVerified} />
                          </div>
                        </div>

                        {/* Membresía */}
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                            <CreditCard className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Membresía</h3>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <Field label="Tier de Membresía" value={customer.tier} />
                            <Field label="Acepta Marketing" value={customer.acceptMarketing} />
                          </div>
                        </div>
                      </div>

                      {/* Column 2: PROMINENT Addresses & Location Cards (5 cols) */}
                      <div className="lg:col-span-5 space-y-5">
                        <div className="bg-card border-2 border-primary/30 rounded-2xl p-5 shadow-md space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-border/60">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-5 w-5 text-primary shrink-0" />
                              <h3 className="text-base font-bold text-foreground">
                                Direcciones Registradas ({addresses.length})
                              </h3>
                            </div>
                            <span className="text-xs text-muted-foreground font-semibold bg-muted px-2.5 py-1 rounded-md">
                              Origen: SP2
                            </span>
                          </div>

                          {/* Location summary pills */}
                          <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-muted/40 text-xs">
                            <div>
                              <span className="text-muted-foreground block text-[10px] font-bold uppercase">Provincia</span>
                              <span className="font-bold text-foreground">{location?.province || customer.provincia || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] font-bold uppercase">Cantón</span>
                              <span className="font-bold text-foreground">{location?.canton || customer.canton || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px] font-bold uppercase">Distrito</span>
                              <span className="font-bold text-foreground">{location?.district || customer.distrito || "—"}</span>
                            </div>
                          </div>

                          {/* Address Cards List */}
                          {addresses.length > 0 ? (
                            <div className="space-y-3 pt-1">
                              {addresses.map((addr: any, idx: number) => {
                                const isDefault = addr.isDefault || addr.id === customer.defaultAddress?.id;
                                const addrFullGeo = [addr.district, addr.canton, addr.province].filter(Boolean).join(", ");
                                const addrText = [addr.streetAddress, addr.details || addr.detail, addr.deliveryInstructions].filter(Boolean).join(" - ");

                                return (
                                  <div
                                    key={addr.id || idx}
                                    className={cn(
                                      "p-4 rounded-xl border-2 space-y-2.5 transition-all shadow-sm",
                                      isDefault
                                        ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60"
                                        : "bg-background border-border hover:border-primary/40"
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-sm text-foreground flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                                        {addr.alias || `Dirección #${idx + 1}`}
                                      </span>
                                      {isDefault && (
                                        <Badge variant="outline" className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900 dark:text-amber-100">
                                          Principal
                                        </Badge>
                                      )}
                                    </div>

                                    {addrText && (
                                      <div className="p-2.5 rounded-lg bg-muted/50 border border-border/60 text-xs font-medium text-foreground leading-relaxed">
                                        {addrText}
                                      </div>
                                    )}

                                    {addrFullGeo && (
                                      <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                                        <Globe className="h-3.5 w-3.5 shrink-0" />
                                        {addrFullGeo}
                                      </p>
                                    )}

                                    {addr.recipientName && (
                                      <p className="text-xs text-muted-foreground pt-2 border-t border-border/40 flex items-center justify-between">
                                        <span><span className="font-bold text-foreground">Destinatario:</span> {addr.recipientName}</span>
                                        {addr.recipientPhone && <span className="font-mono text-primary">{addr.recipientPhone}</span>}
                                      </p>
                                    )}

                                    {addr.encomienda?.name && (
                                      <div className="pt-2 border-t border-border/40 flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 font-bold">
                                        <Truck className="h-4 w-4 shrink-0 text-blue-600" />
                                        <span>Servicio de Encomienda: {addr.encomienda.name}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-6 text-center border-2 border-dashed border-border rounded-xl">
                              <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                              <p className="text-sm font-semibold text-foreground">Sin direcciones registradas en SP2</p>
                              {(customer.direccionExacta || location?.addressDetail || customer.address) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Dirección básica: {customer.direccionExacta || location?.addressDetail || customer.address}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Column 3: Configuración de Servicios y Auditoría (3 cols) */}
                      <div className="lg:col-span-3 space-y-5">
                        {/* Configuración de Servicios */}
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                            <Building2 className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                              Servicios
                            </h3>
                          </div>
                          
                          <div className="space-y-3.5 text-xs">
                            {/* Consolidación */}
                            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-foreground shrink-0">Consolidación</span>
                                <Badge variant={consolidationOn ? "default" : "outline"} className="shrink-0">
                                  {consolidationOn ? "Activa" : "Inactiva"}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground pt-1">
                                <span className="font-semibold text-foreground">Fecha Activación:</span>{" "}
                                {consolidationDate ? fmtDate(consolidationDate, { showTime: true }) : "No registrada"}
                              </p>
                            </div>

                            {/* Factura Electrónica */}
                            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-foreground shrink-0">Factura Electrónica</span>
                                <Badge variant={electronicInvoice ? "default" : "outline"} className="shrink-0 whitespace-nowrap">
                                  {electronicInvoice ? "Requerida" : "No requerida"}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground pt-1">
                                <span className="font-semibold text-foreground">Fecha Activación:</span>{" "}
                                {feDate ? fmtDate(feDate, { showTime: true }) : "No registrada"}
                              </p>
                            </div>

                            {customer.encomiendaServiceName && (
                              <Field label="Servicio Encomienda" value={customer.encomiendaServiceName} />
                            )}
                          </div>
                        </div>

                        {/* Actividad y Registro */}
                        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                            <Clock className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                              Actividad y Registro
                            </h3>
                          </div>

                          <div className="space-y-3 text-xs">
                            <Field
                              label="Registro en SP2"
                              value={fmtDate(customer.createdAt ?? customer.memberSince ?? customer.sp2RegisteredAt, { showTime: true })}
                              icon={Calendar}
                            />
                            <Field
                              label="Último Login"
                              value={fmtDate(lastLogin, { showTime: true })}
                              icon={Clock}
                            />
                            <Field
                              label="Última Pre-Alerta"
                              value={fmtDate(lastPreAlert, { showTime: true })}
                              icon={Package}
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
