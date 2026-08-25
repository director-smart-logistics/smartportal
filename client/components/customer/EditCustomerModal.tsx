import { useState, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteField } from "firebase/firestore";
import { useUpdateCustomer } from "@/lib/hooks/queries/useCustomers";
import { useRoutes } from "@/lib/hooks/queries/useRoutes";
import type { Customer } from "@/types";
import { resolveCustomerFullName } from "@/lib/utils/customer-name";
import { cn } from "@/lib/utils";
import { subscribeEncomiendas, type Encomienda } from "@/lib/services/encomienda-service";
import { updateCustomerRuta } from "@/lib/services/customer-sync";
import { getRouteColor } from "@/lib/utils/route-colors";
import { 
  Info, 
  User, 
  Truck, 
  MapPin, 
  Save, 
  X, 
  Loader2, 
  CheckCircle2, 
  ShieldCheck, 
  Globe, 
  CreditCard, 
  Building2, 
  RefreshCw,
  Sparkles
} from "lucide-react";
import { CedulaTseWidget } from "./CedulaTseWidget";
import { firebaseApi } from "@/lib/firebase/callable";

// ── Country normalization ─────────────────────────────────────────────────────
const COUNTRY_TO_CODE: Record<string, string> = {
  'costa rica': 'CR', 'cr': 'CR',
  'méxico': 'MX', 'mexico': 'MX', 'mx': 'MX',
  'guatemala': 'GT', 'gt': 'GT',
  'el salvador': 'SV', 'sv': 'SV',
  'honduras': 'HN', 'hn': 'HN',
  'nicaragua': 'NI', 'ni': 'NI',
  'panamá': 'PA', 'panama': 'PA', 'pa': 'PA',
  'argentina': 'AR', 'ar': 'AR',
  'bolivia': 'BO', 'bo': 'BO',
  'brasil': 'BR', 'brazil': 'BR', 'br': 'BR',
  'chile': 'CL', 'cl': 'CL',
  'colombia': 'CO', 'co': 'CO',
  'ecuador': 'EC', 'ec': 'EC',
  'paraguay': 'PY', 'py': 'PY',
  'perú': 'PE', 'peru': 'PE', 'pe': 'PE',
  'uruguay': 'UY', 'uy': 'UY',
  'venezuela': 'VE', 've': 'VE',
  'república dominicana': 'DO', 'dominican republic': 'DO', 'do': 'DO',
  'cuba': 'CU', 'cu': 'CU',
  'united states': 'US', 'estados unidos': 'US', 'us': 'US', 'usa': 'US',
};

function normalizeCountryToCode(raw: string | null | undefined): string {
  if (!raw) return 'CR';
  const key = raw.trim().toLowerCase();
  return COUNTRY_TO_CODE[key] || (raw.length === 2 ? raw.toUpperCase() : 'CR');
}

const CODE_TO_COUNTRY: Record<string, string> = {
  'CR': 'Costa Rica', 'MX': 'México', 'GT': 'Guatemala', 'SV': 'El Salvador',
  'HN': 'Honduras', 'NI': 'Nicaragua', 'PA': 'Panamá', 'AR': 'Argentina',
  'BO': 'Bolivia', 'BR': 'Brasil', 'CL': 'Chile', 'CO': 'Colombia',
  'EC': 'Ecuador', 'PY': 'Paraguay', 'PE': 'Perú', 'UY': 'Uruguay',
  'VE': 'Venezuela', 'DO': 'República Dominicana', 'CU': 'Cuba', 'US': 'United States',
};

function FieldHint({ message, variant = "info" }: { message: string; variant?: "info" | "warning" }) {
  return (
    <p className={cn(
      "text-[11px] flex items-center gap-1 mt-1 font-medium",
      variant === "warning" ? "text-amber-500 dark:text-amber-400" : "text-blue-500 dark:text-blue-400"
    )}>
      <Info className="w-3 h-3 flex-shrink-0" />
      {message}
    </p>
  );
}

interface EditCustomerModalProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditCustomerModal({
  isOpen,
  customer,
  onClose,
  onSuccess,
}: EditCustomerModalProps) {
  const { t } = useLocale(["customers", "common", "profile", "auth"]);
  const { theme } = useTheme();
  const { toast } = useToast();
  const updateCustomerMutation = useUpdateCustomer(customer?.id || "");

  const isDark = theme === "dark";

  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState(() => {
    if (!customer) {
      return {
        fullName: "",
        firstName: "",
        lastName: "",
        dni: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        country: "CR",
        zipCode: "",
        slCode: "",
        ruta: "",
        preferredRouteId: "",
        preferredLanguage: "es",
        timezone: "",
        locationProvince: "",
        locationCanton: "",
        locationDistrict: "",
        locationCity: "",
        deliveryAddress1: "",
        deliveryAddress2: "",
        deliveryAddress3: "",
        notes: "",
        status: "active" as "active" | "inactive" | "suspended",
        acceptMarketing: false,
        consolidationEnabled: false,
        electronicInvoiceRequired: false,
        tier: "basic",
        membershipTier: "basic",
        isVerified: false,
        verifiedDni: "",
        verifiedEmail: "",
        verifiedPhone: "",
        birthDate: "",
        nationality: "",
        encomiendaServiceName: "",
      };
    }

    const getStr = (val: any, fallback = "") => typeof val === "string" ? val : (val?.name || val?.id || fallback);
    const normalizedCountry = normalizeCountryToCode(
      customer.country || (customer as any).defaultAddress?.country
    );
    const provinceForDropdown =
      (customer as any).location?.province ||
      customer.defaultAddress?.province ||
      customer.city ||
      "";
    const resolvedAddress =
      customer.address ||
      customer.defaultAddress?.streetAddress ||
      customer.addresses?.[0]?.streetAddress ||
      [customer.defaultAddress?.province, customer.defaultAddress?.canton, customer.defaultAddress?.district].filter(Boolean).join(', ') ||
      "";
    const addr = customer.addresses ?? [];
    const resolvedDelivery1 = customer.deliveryAddress1 || addr[0]?.streetAddress || customer.defaultAddress?.details || "";
    const resolvedDelivery2 = customer.deliveryAddress2 || addr[1]?.streetAddress || "";
    const resolvedDelivery3 = customer.deliveryAddress3 || addr[2]?.streetAddress || "";

    return {
      fullName: customer.fullName || "",
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      dni: customer.dni || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: resolvedAddress,
      city: provinceForDropdown,
      country: normalizedCountry,
      zipCode: customer.zipCode || customer.defaultAddress?.postalCode || "",
      slCode: customer.slCode || "",
      ruta: customer.ruta || (customer as any).route || "",
      preferredRouteId: customer.preferredRouteId || "",
      preferredLanguage: customer.preferredLanguage || "es",
      timezone: customer.timezone || "",
      locationProvince: (customer as any).location?.province || customer.defaultAddress?.province || "",
      locationCanton: (customer as any).location?.canton || customer.defaultAddress?.canton || "",
      locationDistrict: (customer as any).location?.district || customer.defaultAddress?.district || "",
      locationCity: (customer as any).location?.city || customer.defaultAddress?.city || "",
      deliveryAddress1: resolvedDelivery1,
      deliveryAddress2: resolvedDelivery2,
      deliveryAddress3: resolvedDelivery3,
      notes: customer.notes || "",
      status: (customer.status === 'deleted' ? 'inactive' : customer.status) as 'active' | 'inactive' | 'suspended' || "active",
      acceptMarketing: customer.acceptMarketing || false,
      consolidationEnabled: customer.consolidationEnabled || false,
      electronicInvoiceRequired: (customer as any).electronicInvoiceRequired || false,
      tier: customer.tier || "basic",
      membershipTier: customer.membershipTier || customer.tier || "basic",
      isVerified: customer.isVerified || false,
      verifiedDni: customer.verifiedDni || "",
      verifiedEmail: customer.verifiedEmail || "",
      verifiedPhone: customer.verifiedPhone || "",
      birthDate: customer.birthDate || "",
      nationality: customer.nationality || "",
      encomiendaServiceName: "",
    };
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);

  const { data: routesResponse } = useRoutes();
  const routesList = ((routesResponse as any)?.data ?? routesResponse ?? []) as any[];

  useEffect(() => {
    return subscribeEncomiendas((items) => setEncomiendas(items.filter(i => i.active)));
  }, []);

  // Load customer data when modal opens
  useEffect(() => {
    if (customer) {
      const getStr = (val: any, fallback = "") => typeof val === "string" ? val : (val?.name || val?.id || fallback);

      const normalizedCountry = normalizeCountryToCode(
        customer.country || (customer as any).defaultAddress?.country
      );

      const provinceForDropdown =
        (customer as any).location?.province ||
        customer.defaultAddress?.province ||
        customer.city ||
        "";

      const resolvedAddress =
        customer.address ||
        customer.defaultAddress?.streetAddress ||
        customer.addresses?.[0]?.streetAddress ||
        [customer.defaultAddress?.province, customer.defaultAddress?.canton, customer.defaultAddress?.district].filter(Boolean).join(', ') ||
        "";

      const addr = customer.addresses ?? [];
      const resolvedDelivery1 = customer.deliveryAddress1 || addr[0]?.streetAddress || customer.defaultAddress?.details || "";
      const resolvedDelivery2 = customer.deliveryAddress2 || addr[1]?.streetAddress || "";
      const resolvedDelivery3 = customer.deliveryAddress3 || addr[2]?.streetAddress || "";

      const resolvedEncomienda = (() => {
        const rawId =
          getStr((customer as any).encomiendaServiceName) ||
          getStr((customer as any).encomienda) ||
          getStr((customer as any).encomiendaProvider) ||
          getStr(customer.defaultAddress?.encomienda) ||
          getStr(customer.addresses?.find((a: any) => a.encomienda)?.encomienda) ||
          "";
        if (!rawId) return "";

        const idLower = rawId.toLowerCase().replace(/[\s_-]+/g, '');
        const dynamicMatch = encomiendas.find(e => {
          const eName = e.name.toLowerCase().replace(/[\s_-]+/g, '');
          const eId = (e.id || '').toLowerCase().replace(/[\s_-]+/g, '');
          return eName === idLower || eId === idLower || eName.includes(idLower) || idLower.includes(eName);
        });
        if (dynamicMatch) return dynamicMatch.name;

        const staticMap: Record<string, string> = {
          'centeno': 'Centeno', 'encomiendas-centeno': 'Centeno',
          'caribeños': 'Caribeños', 'empresacaribenos': 'Caribeños',
          'trapaco': 'Transportes Paracito', 'tracopa': 'Tracopa',
          'tuasa': 'TUASA', 'pulmitan': 'Pulmitan de Liberia',
        };
        return staticMap[idLower] || rawId;
      })();

      let firstName = customer.firstName || "";
      let lastName = customer.lastName || "";
      if (!firstName && !lastName && customer.fullName) {
        const parts = customer.fullName.trim().split(" ");
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || "";
      }

      setFormData({
        fullName: customer.fullName || "",
        firstName,
        lastName,
        dni: customer.dni || "",
        email: customer.email || "",
        phone: customer.phone || "",
        address: resolvedAddress,
        city: provinceForDropdown,
        country: normalizedCountry,
        zipCode: customer.zipCode || customer.defaultAddress?.postalCode || "",
        slCode: customer.slCode || "",
        ruta: customer.ruta || (customer as any).route || "",
        preferredRouteId: customer.preferredRouteId || "",
        preferredLanguage: customer.preferredLanguage || "es",
        timezone: customer.timezone || "",
        locationProvince: (customer as any).location?.province || customer.defaultAddress?.province || "",
        locationCanton: (customer as any).location?.canton || customer.defaultAddress?.canton || "",
        locationDistrict: (customer as any).location?.district || customer.defaultAddress?.district || "",
        locationCity: (customer as any).location?.city || customer.defaultAddress?.city || "",
        deliveryAddress1: resolvedDelivery1,
        deliveryAddress2: resolvedDelivery2,
        deliveryAddress3: resolvedDelivery3,
        notes: customer.notes || "",
        status: (customer.status === 'deleted' ? 'inactive' : customer.status) as 'active' | 'inactive' | 'suspended' || "active",
        acceptMarketing: customer.acceptMarketing || false,
        consolidationEnabled: customer.consolidationEnabled || false,
        electronicInvoiceRequired: (customer as any).electronicInvoiceRequired || false,
        tier: customer.tier || "basic",
        membershipTier: customer.membershipTier || customer.tier || "basic",
        isVerified: customer.isVerified || false,
        verifiedDni: customer.verifiedDni || "",
        verifiedEmail: customer.verifiedEmail || "",
        verifiedPhone: customer.verifiedPhone || "",
        birthDate: customer.birthDate || "",
        nationality: customer.nationality || "",
        encomiendaServiceName: resolvedEncomienda,
      });
      setErrors({});
    }
  }, [customer, encomiendas]);

  const saveChanges = async () => {
    try {
      setIsLoading(true);

      const fullName = resolveCustomerFullName(
        formData.firstName,
        formData.lastName,
        formData.fullName,
      );

      const autoSyncRutaToSp2 = formData.ruta !== (customer?.ruta || "");

      await updateCustomerMutation.mutateAsync({
        fullName,
        firstName: formData.firstName,
        lastName: formData.lastName,
        dni: formData.dni,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        zipCode: formData.zipCode,
        slCode: formData.slCode,
        ruta: formData.ruta || null,
        isRutaAdminLocked: !!formData.ruta,
        rutaSetByAdminAt: new Date().toISOString(),
        route: deleteField(),
        zona: deleteField(),
        preferredRouteId: formData.preferredRouteId || null,
        preferredLanguage: formData.preferredLanguage,
        timezone: formData.timezone || null,
        location: {
          province: formData.locationProvince || "",
          canton: formData.locationCanton || "",
          district: formData.locationDistrict || "",
          city: formData.locationCity || "",
          country: CODE_TO_COUNTRY[formData.country] || formData.country || "Costa Rica",
        },
        deliveryAddress1: formData.deliveryAddress1,
        deliveryAddress2: formData.deliveryAddress2,
        deliveryAddress3: formData.deliveryAddress3,
        notes: formData.notes,
        status: formData.status,
        acceptMarketing: formData.acceptMarketing,
        consolidationEnabled: formData.consolidationEnabled,
        consolidationEnabledAt: formData.consolidationEnabled !== customer?.consolidationEnabled
          ? (formData.consolidationEnabled ? new Date().toISOString() : null)
          : ((customer as any)?.consolidationEnabledAt || null),
        consolidationDisabledAt: formData.consolidationEnabled !== customer?.consolidationEnabled
          ? (formData.consolidationEnabled ? null : new Date().toISOString())
          : ((customer as any)?.consolidationDisabledAt || null),
        electronicInvoiceRequired: formData.electronicInvoiceRequired,
        tier: formData.tier,
        membershipTier: formData.membershipTier,
        isVerified: formData.isVerified,
        verifiedDni: formData.verifiedDni || null,
        verifiedEmail: formData.verifiedEmail || null,
        verifiedPhone: formData.verifiedPhone || null,
        birthDate: formData.birthDate || null,
        nationality: formData.nationality || null,
        encomiendaServiceName: formData.encomiendaServiceName || null,
        syncRutaToSp2: autoSyncRutaToSp2,
      });

      // Automatically sync to SP2 if the route has changed
      if (autoSyncRutaToSp2 && formData.slCode && formData.ruta) {
        await updateCustomerRuta(formData.slCode, formData.ruta, true, 'edit_customer_modal');
      }

      toast({
        title: t("common.success"),
        description: t("customers.updateSuccess"),
        variant: "default",
      });

      window.dispatchEvent(new CustomEvent('customer-ruta-updated'));

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to update customer:", error);
      toast({
        title: t("common.error"),
        description: t("customers.updateError"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.firstName.trim()) newErrors.firstName = t("common.required");
    if (!formData.email.trim()) {
      newErrors.email = t("common.required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t("auth.invalidEmail");
    }
    if (!formData.phone.trim()) newErrors.phone = t("common.required");
    if (!formData.address.trim() && !customer?.addresses?.length) {
      newErrors.address = t("common.required");
    }
    if (!formData.country.trim()) newErrors.country = t("common.required");

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const errorFields: string[] = [];
      if (!formData.firstName.trim()) errorFields.push("Nombre");
      if (!formData.email.trim()) {
        errorFields.push("Email");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errorFields.push("Email (formato inválido)");
      }
      if (!formData.phone.trim()) errorFields.push("Teléfono");
      if (!formData.address.trim() && !customer?.addresses?.length) {
        errorFields.push("Dirección");
      }
      if (!formData.country.trim()) errorFields.push("País");

      toast({
        title: "Formulario incompleto",
        description: `Por favor complete o corrija los siguientes campos: ${errorFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    await saveChanges();
  };

  const uniqueRoutes = Array.from(
    new Map(routesList.map((r) => [(r.name || "").toLowerCase().trim(), r])).values()
  ).filter((r) => r.name);

  const uniqueEncomiendas = Array.from(
    new Map(encomiendas.map((e) => [e.name.toLowerCase().trim(), e])).values()
  );

  if (!customer) return null;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "w-screen h-screen max-w-none max-h-none p-0 gap-0 overflow-hidden flex flex-col rounded-none border-none inset-0 m-0 z-[70] [&>button:last-child]:hidden",
          isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"
        )}
        data-testid="edit-customer-modal"
      >
        {/* HEADER */}
        <div className={cn(
          "px-6 py-4 border-b flex items-center justify-between shrink-0",
          isDark ? "bg-gray-900/90 border-gray-800" : "bg-white border-gray-200 shadow-sm"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-base border border-primary/20 shadow-inner">
              {(formData.firstName?.[0] || customer?.fullName?.[0] || 'C').toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight">{customer?.fullName || `${formData.firstName} ${formData.lastName}`}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                  {formData.slCode || customer?.slCode}
                </span>
                <span className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider",
                  formData.status === 'active' 
                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" 
                    : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                )}>
                  {formData.status}
                </span>
                {formData.isVerified && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> TSE Verificado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("customers.editDescription")}
              </p>
            </div>
          </div>

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

        {/* BODY - 3 COLUMNS BY DOMAIN */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden" data-testid="edit-customer-form">
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* COLUMNA 1: INFORMACIÓN PERSONAL & MEMBRESÍA 👤 */}
            <div className={cn("p-5 rounded-xl border flex flex-col gap-4 shadow-sm", isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-200")}>
              <div className="flex items-center gap-2 border-b pb-3 border-border">
                <User className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-sm">Información Personal & Membresía</h3>
              </div>

              {/* Nombre y Apellidos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="firstName" className="text-xs" data-testid="label-firstname">
                    {t("customers.firstName")}<span className="text-red-500 ml-0.5">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => {
                      setFormData({ ...formData, firstName: e.target.value });
                      if (errors.firstName) setErrors({ ...errors, firstName: "" });
                    }}
                    className="text-sm"
                    data-testid="input-firstname"
                  />
                  {errors.firstName && <p className="text-xs text-red-500" data-testid="error-firstname">{errors.firstName}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="lastName" className="text-xs" data-testid="label-lastname">
                    {t("customers.lastName")}
                  </Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="text-sm"
                    data-testid="input-lastname"
                  />
                </div>
              </div>

              {/* DNI & TSE Widget */}
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="dni" className="text-xs" data-testid="label-dni">{t("customers.idNumber")}</Label>
                    <Input
                      id="dni"
                      value={formData.dni}
                      onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                      className="text-sm"
                      data-testid="input-dni"
                    />
                  </div>
                  <div>
                    <Label htmlFor="slCode" className="text-xs" data-testid="label-slCode">{t("customers.slCode")}</Label>
                    <Input
                      id="slCode"
                      value={formData.slCode}
                      onChange={(e) => setFormData({ ...formData, slCode: e.target.value })}
                      className="text-sm font-mono font-semibold"
                      data-testid="input-slCode"
                    />
                  </div>
                </div>
                <CedulaTseWidget
                  cedula={formData.dni}
                  currentFirstName={formData.firstName}
                  currentLastName={formData.lastName}
                  isVerified={formData.isVerified}
                  onApply={(data) => {
                    setFormData({
                      ...formData,
                      firstName: data.firstName,
                      lastName: data.lastName,
                      dni: data.verifiedDni,
                      isVerified: true,
                      verifiedDni: data.verifiedDni,
                      birthDate: data.birthDate || formData.birthDate,
                      nationality: data.nationality || formData.nationality,
                    });
                  }}
                />
              </div>

              {/* Contacto: Email & Teléfono */}
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs" data-testid="label-email">
                    {t("common.email")}<span className="text-red-500 ml-0.5">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (errors.email) setErrors({ ...errors, email: "" });
                    }}
                    className="text-sm"
                    data-testid="input-email"
                  />
                  {errors.email && <p className="text-xs text-red-500" data-testid="error-email">{errors.email}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="phone" className="text-xs" data-testid="label-phone">
                      {t("common.phone")}<span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => {
                        setFormData({ ...formData, phone: e.target.value });
                        if (errors.phone) setErrors({ ...errors, phone: "" });
                      }}
                      className="text-sm"
                      data-testid="input-phone"
                    />
                    {errors.phone && <p className="text-xs text-red-500" data-testid="error-phone">{errors.phone}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="status" className="text-xs" data-testid="label-status">{t("packages.status")}</Label>
                    <Select value={formData.status} onValueChange={(val: any) => setFormData({ ...formData, status: val })}>
                      <SelectTrigger id="status" className="text-sm" data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("customers.statusActive")}</SelectItem>
                        <SelectItem value="inactive">{t("customers.statusInactive")}</SelectItem>
                        <SelectItem value="suspended">{t("customers.statusSuspended")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Fecha Nacimiento & Nacionalidad */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="birthDate" className="text-xs">{t("customers.birthDate")}</Label>
                  <Input
                    id="birthDate"
                    placeholder="DD/MM/YYYY"
                    value={formData.birthDate}
                    onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                    className="text-sm"
                    data-testid="input-birth-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nationality" className="text-xs">{t("customers.nationality")}</Label>
                  <Input
                    id="nationality"
                    placeholder="Nacionalidad"
                    value={formData.nationality}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                    className="text-sm"
                    data-testid="input-nationality"
                  />
                </div>
              </div>

              {/* Membresía e Idioma */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="membershipTier" className="text-xs">{t("customers.membershipTier")}</Label>
                  <Select value={formData.membershipTier} onValueChange={(val) => setFormData({ ...formData, membershipTier: val })}>
                    <SelectTrigger id="membershipTier" className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="smart">Smart</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="preferredLanguage" className="text-xs">Idioma Preferido</Label>
                  <Select value={formData.preferredLanguage} onValueChange={(val) => setFormData({ ...formData, preferredLanguage: val })}>
                    <SelectTrigger id="preferredLanguage" className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="pt">Português</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* COLUMNA 2: LOGÍSTICA, RUTAS & ENCOMIENDAS 🚚 */}
            <div className={cn("p-5 rounded-xl border flex flex-col gap-4 shadow-sm", isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-200")}>
              <div className="flex items-center gap-2 border-b pb-3 border-border">
                <Truck className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-sm">Logística, Rutas & Encomiendas</h3>
              </div>

              {/* Ruta Logística SP1 */}
              <div className="space-y-1.5">
                <Label htmlFor="ruta" className="text-xs font-medium">{t("customers.routeOrZone")}</Label>
                <Select
                  value={formData.ruta || "NONE"}
                  onValueChange={(val) => setFormData({ ...formData, ruta: val === "NONE" ? "" : val })}
                >
                  <SelectTrigger 
                    id="ruta" 
                    className={cn(
                      "text-sm font-semibold transition-all border",
                      formData.ruta 
                        ? (() => {
                            const color = getRouteColor(formData.ruta);
                            return `${color.bg} ${color.border} ${color.text}`;
                          })()
                        : ""
                    )}
                  >
                    <SelectValue placeholder="Selecciona una ruta de entrega" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Ninguna (Sin Asignar)</SelectItem>
                    {uniqueRoutes.map((route) => {
                      const color = getRouteColor(route.name);
                      return (
                        <SelectItem key={route.id} value={route.name}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.swatch }} />
                            <span>{route.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                    {formData.ruta && !uniqueRoutes.some(r => r.name === formData.ruta) && (() => {
                      const color = getRouteColor(formData.ruta);
                      return (
                        <SelectItem key={formData.ruta} value={formData.ruta}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.swatch }} />
                            <span>{formData.ruta}</span>
                          </div>
                        </SelectItem>
                      );
                    })()}
                  </SelectContent>
                </Select>
              </div>

              {/* Sincronización automática de ruta a SP2 activa */}

              {/* Servicio de Encomiendas */}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="encomiendaServiceName" className="text-xs font-medium">{t("customers.encomiendaService")}</Label>
                <Select
                  value={formData.encomiendaServiceName || "NONE"}
                  onValueChange={(val) => setFormData({ ...formData, encomiendaServiceName: val === "NONE" ? "" : val })}
                >
                  <SelectTrigger id="encomiendaServiceName" className="text-sm" data-testid="input-encomienda">
                    <SelectValue placeholder="Selecciona un servicio de encomienda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Ninguno (Entrega Directa)</SelectItem>
                    {uniqueEncomiendas.map((enc) => (
                      <SelectItem key={enc.id} value={enc.name}>
                        {enc.name}
                      </SelectItem>
                    ))}
                    {formData.encomiendaServiceName && !uniqueEncomiendas.some(e => e.name === formData.encomiendaServiceName) && (
                      <SelectItem key={formData.encomiendaServiceName} value={formData.encomiendaServiceName}>
                        {formData.encomiendaServiceName}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Toggles de Consolidación y Marketing */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-muted/20">
                  <Label htmlFor="consolidationEnabled" className="flex flex-col space-y-0.5 cursor-pointer">
                    <span className="text-xs font-semibold">Consolidación de Paquetes</span>
                    <span className="font-normal text-[11px] text-muted-foreground">
                      Agrupa múltiples guías en un solo cobro
                    </span>
                  </Label>
                  <Switch
                    id="consolidationEnabled"
                    checked={formData.consolidationEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, consolidationEnabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg bg-muted/20">
                  <Label htmlFor="acceptMarketing" className="flex flex-col space-y-0.5 cursor-pointer">
                    <span className="text-xs font-semibold">Comunicaciones de Marketing</span>
                    <span className="font-normal text-[11px] text-muted-foreground">
                      Envío de ofertas y boletines
                    </span>
                  </Label>
                  <Switch
                    id="acceptMarketing"
                    checked={formData.acceptMarketing}
                    onCheckedChange={(checked) => setFormData({ ...formData, acceptMarketing: checked })}
                  />
                </div>
              </div>

              {/* Notas Operativas */}
              <div className="space-y-1 pt-1">
                <Label htmlFor="notes" className="text-xs">{t("customers.notes")}</Label>
                <textarea
                  id="notes"
                  placeholder="Indicaciones logísticas o notas internas..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed",
                    isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300"
                  )}
                  rows={4}
                  data-testid="textarea-notes"
                />
              </div>
            </div>

            {/* COLUMNA 3: UBICACIÓN & FACTURACIÓN ELECTRÓNICA 📍🧾 */}
            <div className={cn("p-5 rounded-xl border flex flex-col gap-4 shadow-sm", isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-200")}>
              <div className="flex items-center gap-2 border-b pb-3 border-border">
                <MapPin className="w-5 h-5 text-emerald-500" />
                <h3 className="font-semibold text-sm">Ubicación & Facturación Electrónica</h3>
              </div>

              {/* Dirección Principal / General */}
              <div className="space-y-1">
                <Label htmlFor="address" className="text-xs" data-testid="label-address">
                  {t("common.address")}<span className="text-red-500 ml-0.5">*</span>
                </Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => {
                    setFormData({ ...formData, address: e.target.value });
                    if (errors.address) setErrors({ ...errors, address: "" });
                  }}
                  className="text-sm"
                  data-testid="input-address"
                />
                {errors.address && <p className="text-xs text-red-500" data-testid="error-address">{errors.address}</p>}
              </div>

              {/* Provincia, País, Código Postal */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="city" className="text-xs" data-testid="label-city">Provincia</Label>
                  <Select value={formData.city} onValueChange={(val) => setFormData({ ...formData, city: val })}>
                    <SelectTrigger id="city" className="text-sm" data-testid="select-city">
                      <SelectValue placeholder="Provincia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="San José">San José</SelectItem>
                      <SelectItem value="Alajuela">Alajuela</SelectItem>
                      <SelectItem value="Cartago">Cartago</SelectItem>
                      <SelectItem value="Heredia">Heredia</SelectItem>
                      <SelectItem value="Guanacaste">Guanacaste</SelectItem>
                      <SelectItem value="Puntarenas">Puntarenas</SelectItem>
                      <SelectItem value="Limón">Limón</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="country" className="text-xs" data-testid="label-country">País<span className="text-red-500 ml-0.5">*</span></Label>
                  <Select value={formData.country} onValueChange={(val) => setFormData({ ...formData, country: val })}>
                    <SelectTrigger id="country" className="text-sm" data-testid="select-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CR">Costa Rica</SelectItem>
                      <SelectItem value="MX">México</SelectItem>
                      <SelectItem value="GT">Guatemala</SelectItem>
                      <SelectItem value="SV">El Salvador</SelectItem>
                      <SelectItem value="HN">Honduras</SelectItem>
                      <SelectItem value="NI">Nicaragua</SelectItem>
                      <SelectItem value="PA">Panamá</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="zipCode" className="text-xs" data-testid="label-zipcode">Cód. Postal</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    className="text-sm"
                    data-testid="input-zipcode"
                  />
                </div>
              </div>

              {/* Sub-ubicación: Provincia/Cantón/Distrito */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="locationProvince" className="text-[11px] text-muted-foreground">Provincia L.</Label>
                  <Input
                    id="locationProvince"
                    value={formData.locationProvince}
                    onChange={(e) => setFormData({ ...formData, locationProvince: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="locationCanton" className="text-[11px] text-muted-foreground">Cantón</Label>
                  <Input
                    id="locationCanton"
                    value={formData.locationCanton}
                    onChange={(e) => setFormData({ ...formData, locationCanton: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="locationDistrict" className="text-[11px] text-muted-foreground">Distrito</Label>
                  <Input
                    id="locationDistrict"
                    value={formData.locationDistrict}
                    onChange={(e) => setFormData({ ...formData, locationDistrict: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Dirección de Entrega Detallada (Líneas 1, 2 y 3) */}
              <div className="space-y-2 pt-2 border-t border-border">
                <Label className="text-xs font-semibold">{t("customers.deliveryAddresses")}</Label>

                <div className="space-y-1.5">
                  <Input
                    id="deliveryAddress1"
                    placeholder={t("customers.deliveryAddress1")}
                    value={formData.deliveryAddress1}
                    onChange={(e) => setFormData({ ...formData, deliveryAddress1: e.target.value })}
                    className="text-xs"
                    data-testid="input-delivery-address-1"
                  />
                  <Input
                    id="deliveryAddress2"
                    placeholder={t("customers.deliveryAddress2")}
                    value={formData.deliveryAddress2}
                    onChange={(e) => setFormData({ ...formData, deliveryAddress2: e.target.value })}
                    className="text-xs"
                    data-testid="input-delivery-address-2"
                  />
                  <Input
                    id="deliveryAddress3"
                    placeholder={t("customers.deliveryAddress3")}
                    value={formData.deliveryAddress3}
                    onChange={(e) => setFormData({ ...formData, deliveryAddress3: e.target.value })}
                    className="text-xs"
                    data-testid="input-delivery-address-3"
                  />
                </div>
              </div>

              {/* Facturación Electrónica */}
              <div className="p-3.5 rounded-lg border flex items-center justify-between bg-muted/20 mt-1">
                <Label htmlFor="electronicInvoiceRequired" className="flex flex-col space-y-0.5 cursor-pointer">
                  <span className="text-xs font-semibold">Factura Electrónica Requerida</span>
                  <span className="font-normal text-[11px] text-muted-foreground">
                    Generar comprobantes electrónicos de Hacienda
                  </span>
                </Label>
                <Switch
                  id="electronicInvoiceRequired"
                  checked={formData.electronicInvoiceRequired}
                  onCheckedChange={(checked) => setFormData({ ...formData, electronicInvoiceRequired: checked })}
                />
              </div>

              {/* Sync Restauración de Cuenta SP2 */}
              <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 flex items-center justify-between gap-3 mt-auto">
                <div className="text-[11px]">
                  <span className="font-semibold block text-blue-600 dark:text-blue-400">Cuenta SmartWeb (SP2)</span>
                  <span className="text-muted-foreground">Sincroniza o restaura el perfil en SP2.</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!formData.slCode) {
                      toast({
                        title: "Código SL requerido",
                        description: "Debe asignar un Código SL al cliente antes de recrear su cuenta en SP2.",
                        variant: "destructive",
                      });
                      return;
                    }
                    try {
                      setIsLoading(true);
                      const res = await firebaseApi.customers.recreateSp2Account(formData.slCode);
                      if (res.success && res.data?.success) {
                        toast({ title: "Cuenta sincronizada", description: res.data.message || "Perfil restaurado en SP2." });
                      } else {
                        toast({ title: "Error al sincronizar", description: res.data?.message || res.error || "No se pudo sincronizar.", variant: "destructive" });
                      }
                    } catch (err: any) {
                      toast({ title: "Error técnico", description: err?.message || "Error inesperado.", variant: "destructive" });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading || !formData.email}
                  className="text-xs h-8 whitespace-nowrap gap-1 text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Restaurar en SP2
                </Button>
              </div>
            </div>

          </div>

          {/* STICKY FOOTER */}
          <div className={cn(
            "px-6 py-4 border-t flex items-center justify-between shrink-0",
            isDark ? "bg-gray-900/90 border-gray-800" : "bg-white border-gray-200 shadow-sm"
          )}>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>Guardado en SP1 con auditoría automática. La sincronización a SP2 es opcional.</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
                data-testid="btn-cancel"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="btn-save"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 min-w-[140px]"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>


    </>
  );
}
