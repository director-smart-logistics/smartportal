import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Search,
  Sparkles,
  Package as PackageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CustomerAutocomplete,
  type AutocompleteCustomer,
} from "@/components/customer/CustomerAutocomplete";
import { ManifestAutocomplete } from "@/components/manifest/ManifestAutocomplete";
import { useRoutes } from "@/lib/hooks/queries/useRoutes";
import {
  calculatePrice,
  type Country,
  type ShippingType,
  type ItemCategory,
} from "@/lib/utils/pricing";
import { db } from "@/lib/firebase";
import {
  collection,
  query as firestoreQuery,
  where,
  getDocs,
} from "firebase/firestore";
import { firebaseApi } from "@/lib/firebase/callable";
import type { Package } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PackageFormData {
  trackingNumber: string;
  type: string;
  category: string;
  customerName: string;
  customerId: string;
  slCode: string;
  weight: number;
  pesoRedondeo?: number;
  priceOverride?: number;
  largo?: number;
  ancho?: number;
  alto?: number;
  status: string;
  flagStatus: string;
  origin: string;
  destination: string;
  routeId: string;
  description: string;
  manifestType: string;
  permisos: boolean;
  manifestNumber: string;
  manifestId: string;
}

export type ComputedPrice = ReturnType<typeof calculatePrice>;

export interface PackageModalPayload {
  formData: PackageFormData;
  invoiceBillingMode: "none" | "create" | "add";
  selectedDraftInvoiceId: string;
  computedPrice: ComputedPrice | null;
}

interface CreatePackageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPackage: Package | null;
  onSave: (payload: PackageModalPayload) => Promise<void>;
  isSaving: boolean;
  isDark?: boolean;
  t: (key: string) => string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MANIFEST_TYPE_OPTIONS = [
  {
    value: "usa_air",
    label: "USA Aéreo",
    flag: "🇺🇸",
    country: "usa" as const,
    shipping: "air" as const,
  },
  {
    value: "usa_sea",
    label: "USA Marítimo",
    flag: "🇺🇸",
    country: "usa" as const,
    shipping: "sea" as const,
  },
  {
    value: "colombia_air",
    label: "Colombia Aéreo",
    flag: "🇨🇴",
    country: "colombia" as const,
    shipping: "air" as const,
  },
] as const;

const PACKAGE_STATUS_VALUES = [
  "pre_alerted",
  "received",
  "in_transit",
  "customs",
  "retained",
  "on_route",
  "delivered",
  "consolidated",
  "returned",
];

const FLAG_STATUS_VALUES = [
  "normal",
  "requires_documents",
  "stuck_in_customs",
  "clear_to_proceed",
];

const COMMON_DESCRIPTIONS = [
  "ZAPATOS",
  "ROPA",
  "ELECTRODOMESTICOS",
  "JUGUETES",
  "LIBROS",
  "COSMETICOS",
  "ACCESORIOS",
  "MEDICAMENTOS",
  "SUPLEMENTOS",
  "HERRAMIENTAS",
  "DEPORTES",
  "MUEBLES",
  "DECORACION",
  "ALIMENTOS",
  "BEBIDAS",
];

const INITIAL_FORM_DATA: PackageFormData = {
  trackingNumber: "",
  type: "air",
  category: "regular",
  customerName: "",
  customerId: "",
  slCode: "",
  weight: 0,
  pesoRedondeo: undefined,
  priceOverride: undefined,
  largo: undefined,
  ancho: undefined,
  alto: undefined,
  status: "customs",
  flagStatus: "normal",
  origin: "USA",
  destination: "CR",
  routeId: "",
  description: "",
  manifestType: "usa_air",
  permisos: false,
  manifestNumber: "",
  manifestId: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CreatePackageModal({
  open,
  onOpenChange,
  selectedPackage,
  onSave,
  isSaving,
  isDark = false,
  t,
}: CreatePackageModalProps) {
  const { toast } = useToast();

  const [formData, setFormData] = useState<PackageFormData>(INITIAL_FORM_DATA);
  const [invoiceBillingMode, setInvoiceBillingMode] = useState<
    "none" | "create" | "add"
  >("none");
  const [selectedDraftInvoiceId, setSelectedDraftInvoiceId] = useState("");

  const [trackingInput, setTrackingInput] = useState("");
  const [trackingSuggestions, setTrackingSuggestions] = useState<string[]>([]);
  const [showTrackingSuggestions, setShowTrackingSuggestions] = useState(false);
  const [trackingExists, setTrackingExists] = useState(false);
  const [isFetchingTracking, setIsFetchingTracking] = useState(false);

  const [destinationInput, setDestinationInput] = useState("");
  const [showDestinationSuggestions, setShowDestinationSuggestions] =
    useState(false);

  const [descriptionSuggestions, setDescriptionSuggestions] = useState<
    string[]
  >([]);
  const [showDescriptionSuggestions, setShowDescriptionSuggestions] =
    useState(false);

  const { data: routesResponse } = useRoutes();
  const activeRoutes = useMemo(
    () => ((routesResponse as any)?.data ?? routesResponse ?? []) as any[],
    [routesResponse],
  );

  // Populate form when editing an existing package
  useEffect(() => {
    if (selectedPackage && open) {
      const pkg = selectedPackage as any;
      setFormData({
        trackingNumber: pkg.trackingNumber || "",
        type: pkg.type || "air",
        category: pkg.category || "regular",
        customerName: pkg.customerName || "",
        customerId: pkg.customerId || "",
        slCode: pkg.slCode || "",
        weight: pkg.weight || 0,
        pesoRedondeo: pkg.pesoRedondeo,
        priceOverride: pkg.priceOverride,
        largo: pkg.largo,
        ancho: pkg.ancho,
        alto: pkg.alto,
        status: pkg.status || "customs",
        flagStatus: pkg.flagStatus || "normal",
        origin: pkg.origin || "USA",
        destination: pkg.destination || "CR",
        routeId: pkg.routeId || "",
        description: pkg.description || "",
        manifestType: pkg.manifestType || "usa_air",
        permisos: pkg.permisos ?? false,
        manifestNumber: pkg.manifestNumber || "",
        manifestId: pkg.manifestId || "",
      });
      setTrackingInput(pkg.trackingNumber || "");
    } else if (!selectedPackage && open) {
      setFormData(INITIAL_FORM_DATA);
      setTrackingInput("");
      setDestinationInput("");
      setTrackingExists(false);
      setInvoiceBillingMode("none");
      setSelectedDraftInvoiceId("");
    }
  }, [selectedPackage, open]);

  const resetAndClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setFormData(INITIAL_FORM_DATA);
        setTrackingInput("");
        setDestinationInput("");
        setTrackingExists(false);
        setInvoiceBillingMode("none");
        setSelectedDraftInvoiceId("");
      }
      onOpenChange(isOpen);
    },
    [onOpenChange],
  );

  // ── Computed price ─────────────────────────────────────────────────────────
  const computedPrice = useMemo(() => {
    const option = MANIFEST_TYPE_OPTIONS.find(
      (o) => o.value === formData.manifestType,
    );
    if (!option || !formData.weight || formData.weight <= 0) return null;
    return calculatePrice(
      formData.weight,
      option.country as Country,
      option.shipping as ShippingType,
      formData.category as ItemCategory,
      formData.permisos,
    );
  }, [
    formData.manifestType,
    formData.weight,
    formData.category,
    formData.permisos,
  ]);

  // ── Volumetric weight preview ──────────────────────────────────────────────
  const volWeight = useMemo(() => {
    if (!formData.largo || !formData.ancho || !formData.alto) return null;
    return parseFloat(
      ((formData.largo * formData.ancho * formData.alto) / 5000).toFixed(2),
    );
  }, [formData.largo, formData.ancho, formData.alto]);

  // ── Destination suggestions ────────────────────────────────────────────────
  const destinationSuggestions = useMemo(() => {
    if (!destinationInput) return activeRoutes.slice(0, 8);
    return activeRoutes
      .filter((r: any) =>
        r.name?.toUpperCase().includes(destinationInput.toUpperCase()),
      )
      .slice(0, 8);
  }, [activeRoutes, destinationInput]);

  // ── Draft invoices for billing section ────────────────────────────────────
  const { data: draftInvoicesForClient = [] } = useQuery({
    queryKey: ["draftInvoices", formData.slCode],
    queryFn: async () => {
      if (!formData.slCode) return [];
      const colRef = collection(db, "invoices");
      const q = firestoreQuery(
        colRef,
        where("slCode", "==", formData.slCode),
        where("status", "==", "draft"),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    },
    enabled: !!(
      formData.slCode &&
      invoiceBillingMode === "add" &&
      !selectedPackage
    ),
    staleTime: 30_000,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCustomerSelect = useCallback(
    (customer: AutocompleteCustomer) => {
      const dest = customer.deliveryAddress1
        ? customer.deliveryAddress1.toUpperCase()
        : formData.destination || "CR";
      setFormData((prev) => ({
        ...prev,
        customerId: customer.id,
        customerName: customer.fullName,
        slCode: customer.slCode || "",
        destination: dest,
      }));
      setDestinationInput(dest);
    },
    [formData.destination],
  );

  const handleTrackingChange = useCallback((value: string) => {
    const upper = value.toUpperCase();
    setTrackingInput(upper);
    setFormData((prev) => ({ ...prev, trackingNumber: upper }));
    setTrackingExists(false);
  }, []);

  const handleFetchTrackingInfo = useCallback(async () => {
    const tracking = (trackingInput || formData.trackingNumber)
      .trim()
      .toUpperCase();
    if (!tracking) return;
    setIsFetchingTracking(true);
    try {
      const [mlResult, colResult] = await Promise.allSettled([
        firebaseApi.mlocker.trackPackage(tracking),
        firebaseApi.colombia.track(tracking),
      ]);
      const mlRaw =
        mlResult.status === "fulfilled"
          ? ((mlResult.value as any)?.data ?? mlResult.value)
          : null;
      const colRaw =
        colResult.status === "fulfilled"
          ? ((colResult.value as any)?.data ?? colResult.value)
          : null;

      if (mlRaw?.found === true) {
        setFormData((prev) => ({
          ...prev,
          weight: Number(mlRaw.weight) > 0 ? Number(mlRaw.weight) : prev.weight,
          description: mlRaw.description
            ? String(mlRaw.description).toUpperCase()
            : prev.description,
          destination: mlRaw.destination
            ? String(mlRaw.destination).toUpperCase()
            : prev.destination,
          origin: "MIAMI",
          manifestType: "usa_air",
          type: "air",
          permisos: !!mlRaw.requiresPermit,
        }));
        toast({
          title: "ML Cargo — datos importados",
          description:
            `${mlRaw.weight ?? ""} kg · ${(mlRaw.description ?? "").toUpperCase()}`.trim() ||
            "Información cargada",
        });
      } else if (colRaw?.found === true) {
        setFormData((prev) => ({
          ...prev,
          origin: "BOGOTA",
          manifestType: "colombia_air",
          type: "air",
        }));
        toast({
          title: "Colombia — datos importados",
          description: `Estado: ${colRaw.statusMessage || "Encontrado"}`,
        });
      } else {
        toast({
          title: "No encontrado",
          description: "No se encontró información para ese tracking.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: t("common.error"),
        description:
          err instanceof Error ? err.message : "Error al consultar el tracking",
        variant: "destructive",
      });
    } finally {
      setIsFetchingTracking(false);
    }
  }, [trackingInput, formData.trackingNumber, t, toast]);

  const handleDestinationChange = useCallback((value: string, route?: any) => {
    const upper = value.toUpperCase();
    setDestinationInput(upper);
    if (route) {
      setFormData((prev) => ({
        ...prev,
        destination: route.name,
        routeId: route.id || "",
      }));
      setDestinationInput("");
    } else {
      setFormData((prev) => ({ ...prev, destination: upper, routeId: "" }));
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.trackingNumber || !formData.origin || !formData.destination) {
      toast({
        title: t("common.error"),
        description:
          t("packages.form.requiredFields") || "Completa los campos requeridos",
        variant: "destructive",
      });
      return;
    }
    if (!selectedPackage && trackingExists) {
      toast({
        title: t("common.error"),
        description: t("packages.form.trackingNumberExists"),
        variant: "destructive",
      });
      return;
    }
    if (isNaN(formData.weight) || formData.weight < 0.01) {
      toast({
        title: t("common.error"),
        description:
          t("packages.form.invalidWeight") || "El peso mínimo es 0.01 kg",
        variant: "destructive",
      });
      return;
    }
    await onSave({
      formData,
      invoiceBillingMode,
      selectedDraftInvoiceId,
      computedPrice,
    });
  }, [
    formData,
    invoiceBillingMode,
    selectedDraftInvoiceId,
    computedPrice,
    trackingExists,
    selectedPackage,
    onSave,
    t,
    toast,
  ]);

  const isSea = formData.manifestType === "usa_sea";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent
        className={cn(
          "flex flex-col p-6 bg-background border-border",
          isDark ? "bg-gray-800 border-gray-700 text-white" : "",
        )}
      >
        <DialogHeader
          className={cn(
            "pb-4 border-b shrink-0",
            isDark ? "border-gray-700" : "border-border",
          )}
        >
          <DialogTitle className="text-lg font-bold">
            {selectedPackage
              ? t("packages.form.editTitle")
              : t("packages.form.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {selectedPackage
              ? t("packages.form.editSubtitle")
              : t("packages.form.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-5 pr-2">
          {/* ── 2-COLUMN GRID ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-5 items-start">
            {/* ══ LEFT: Cliente · Rastreo · Logística ══════════════════ */}
            <div className="space-y-4">
              {/* CLIENTE */}
              <div
                className={cn(
                  "rounded-lg border p-4 space-y-3",
                  isDark
                    ? "border-gray-700 bg-gray-900/30"
                    : "border-border bg-muted/20",
                )}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Cliente
                </h3>
                <div className="space-y-1.5">
                  <label
                    className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                  >
                    {t("packages.form.customerNameSearch")}
                  </label>
                  <CustomerAutocomplete
                    value={formData.customerName}
                    onChange={(customerId, customerName) =>
                      setFormData((prev) => ({
                        ...prev,
                        customerId,
                        customerName,
                      }))
                    }
                    onCustomerSelect={handleCustomerSelect}
                    placeholder={t("packages.form.customerSearchPlaceholder")}
                    className={
                      isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                    }
                  />
                  {formData.customerName && !formData.customerId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Cliente no encontrado — se creará como temporal
                      (SL-NAN-XXXXX)
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("packages.form.customerId")}
                    </label>
                    <div
                      className={cn(
                        "text-sm px-3 py-1.5 rounded border truncate",
                        isDark
                          ? "bg-gray-700 border-gray-600 text-gray-300"
                          : "bg-muted/50 border-border",
                      )}
                    >
                      {formData.customerId || "—"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t("packages.form.slCode")}
                    </label>
                    <div
                      className={cn(
                        "text-sm px-3 py-1.5 rounded border font-semibold",
                        isDark
                          ? "bg-gray-700 border-gray-600 text-blue-400"
                          : "bg-blue-50 border-blue-200 text-blue-700",
                      )}
                    >
                      {formData.slCode || "—"}
                    </div>
                  </div>
                </div>
              </div>

              {/* RASTREO */}
              <div
                className={cn(
                  "rounded-lg border p-4 space-y-3",
                  isDark
                    ? "border-gray-700 bg-gray-900/30"
                    : "border-border bg-muted/20",
                )}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Rastreo
                </h3>
                <div className="space-y-1.5">
                  <label
                    className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                  >
                    {t("packages.form.trackingNumberRequired")}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder={t(
                          "packages.form.trackingNumberPlaceholder",
                        )}
                        value={trackingInput || formData.trackingNumber}
                        onChange={(e) => handleTrackingChange(e.target.value)}
                        onFocus={() =>
                          trackingSuggestions.length > 0 &&
                          setShowTrackingSuggestions(true)
                        }
                        onBlur={() =>
                          setTimeout(
                            () => setShowTrackingSuggestions(false),
                            200,
                          )
                        }
                        className={cn(
                          isDark
                            ? "bg-gray-700 border-gray-600 text-white"
                            : "",
                          trackingExists && !selectedPackage
                            ? "border-red-500"
                            : "",
                        )}
                        data-testid="tracking-number-input"
                        aria-label={t("packages.form.trackingNumber")}
                      />
                      {trackingExists && !selectedPackage && (
                        <p className="text-xs text-red-500 mt-1">
                          {t("packages.form.trackingNumberExists")}
                        </p>
                      )}
                      {showTrackingSuggestions &&
                        trackingSuggestions.length > 0 && (
                          <div
                            className={cn(
                              "absolute z-50 w-full mt-1 border rounded-md shadow-lg max-h-48 overflow-y-auto",
                              isDark
                                ? "bg-gray-700 border-gray-600"
                                : "bg-white border-gray-200",
                            )}
                          >
                            {trackingSuggestions.map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                className={cn(
                                  "w-full text-left px-3 py-2 text-sm",
                                  isDark
                                    ? "hover:bg-gray-600 text-gray-200"
                                    : "hover:bg-gray-100 text-gray-900",
                                )}
                                onClick={() => {
                                  handleTrackingChange(s);
                                  setShowTrackingSuggestions(false);
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Generar tracking automático"
                      onClick={() => {
                        if (!formData.slCode) {
                          toast({
                            title: t("common.error"),
                            description: "Selecciona un cliente primero",
                            variant: "destructive",
                          });
                          return;
                        }
                        const now = new Date();
                        const trk = `${formData.slCode}${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}${String(Math.floor(Math.random() * 99999) + 1).padStart(5, "0")}`;
                        handleTrackingChange(trk);
                      }}
                      className={
                        isDark ? "border-gray-600 hover:bg-gray-700" : ""
                      }
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleFetchTrackingInfo}
                      disabled={
                        (!trackingInput && !formData.trackingNumber) ||
                        isFetchingTracking
                      }
                      className={cn(
                        "gap-1.5 text-xs",
                        isDark ? "border-gray-600 hover:bg-gray-700" : "",
                      )}
                    >
                      {isFetchingTracking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : (
                        <Search className="h-3.5 w-3.5 shrink-0" />
                      )}
                      Obtener info
                    </Button>
                  </div>
                </div>
              </div>

              {/* LOGÍSTICA */}
              <div
                className={cn(
                  "rounded-lg border p-4 space-y-3",
                  isDark
                    ? "border-gray-700 bg-gray-900/30"
                    : "border-border bg-muted/20",
                )}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Logística
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      {t("packages.form.originRequired")}
                    </label>
                    <Input
                      placeholder={t("packages.form.originPlaceholder")}
                      value={formData.origin}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          origin: e.target.value.toUpperCase(),
                        }))
                      }
                      className={
                        isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      {t("packages.form.destinationRequired")}
                    </label>
                    <div className="relative">
                      <Input
                        placeholder={t("packages.form.destinationPlaceholder")}
                        value={destinationInput || formData.destination}
                        onChange={(e) =>
                          handleDestinationChange(e.target.value)
                        }
                        onFocus={() => setShowDestinationSuggestions(true)}
                        onBlur={() =>
                          setTimeout(
                            () => setShowDestinationSuggestions(false),
                            200,
                          )
                        }
                        className={
                          isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                        }
                        data-testid="destination-input"
                      />
                      {showDestinationSuggestions &&
                        destinationSuggestions.length > 0 && (
                          <div
                            className={cn(
                              "absolute z-50 w-full mt-1 border rounded-md shadow-lg max-h-48 overflow-y-auto",
                              isDark
                                ? "bg-gray-700 border-gray-600"
                                : "bg-white border-gray-200",
                            )}
                          >
                            {destinationSuggestions.map(
                              (route: any, i: number) => (
                                <button
                                  key={i}
                                  type="button"
                                  className={cn(
                                    "w-full text-left px-3 py-2 text-sm",
                                    isDark
                                      ? "hover:bg-gray-600 text-gray-200"
                                      : "hover:bg-gray-100 text-gray-900",
                                  )}
                                  onClick={() => {
                                    handleDestinationChange(route.name, route);
                                    setShowDestinationSuggestions(false);
                                  }}
                                >
                                  <div className="font-medium">
                                    {route.name}
                                  </div>
                                  {route.destinationLocation && (
                                    <div className="text-xs text-gray-500">
                                      {route.destinationLocation}
                                    </div>
                                  )}
                                </button>
                              ),
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      {t("packages.form.status")}
                    </label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) =>
                        setFormData((prev) => ({ ...prev, status: v }))
                      }
                    >
                      <SelectTrigger
                        className={
                          isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PACKAGE_STATUS_VALUES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {t(`packages.statuses.${s}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      Flag de Estado
                    </label>
                    <Select
                      value={formData.flagStatus}
                      onValueChange={(v) =>
                        setFormData((prev) => ({ ...prev, flagStatus: v }))
                      }
                    >
                      <SelectTrigger
                        className={
                          isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FLAG_STATUS_VALUES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {t(`packages.flags.${f}`) || f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label
                    className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                  >
                    Manifiesto
                  </label>
                  <ManifestAutocomplete
                    value={formData.manifestNumber}
                    onChange={(id, number) =>
                      setFormData((prev) => ({
                        ...prev,
                        manifestId: id,
                        manifestNumber: number,
                      }))
                    }
                    isDark={isDark}
                    placeholder="Buscar manifiesto…"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            {/* end left col */}

            {/* ══ RIGHT: Paquete · Facturación ═════════════════════════ */}
            <div className="space-y-4">
              {/* PAQUETE */}
              <div
                className={cn(
                  "rounded-lg border p-4 space-y-4",
                  isDark
                    ? "border-gray-700 bg-gray-900/30"
                    : "border-border bg-muted/20",
                )}
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Paquete
                </h3>

                {/* Manifest type — 3 options, auto-sets type */}
                <div className="space-y-2">
                  <label
                    className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                  >
                    Tipo de Manifiesto <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {MANIFEST_TYPE_OPTIONS.map((opt) => {
                      const isActive = formData.manifestType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              manifestType: opt.value,
                              type: opt.shipping,
                            }))
                          }
                          className={cn(
                            "flex flex-col items-center justify-center gap-0.5 py-3 px-1 rounded-lg border-2 text-center transition-all",
                            isActive
                              ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-gray-700"
                              : cn(
                                  "border-gray-200 hover:border-gray-400",
                                  isDark
                                    ? "border-gray-600 hover:border-gray-400 text-gray-300"
                                    : "text-gray-700",
                                ),
                          )}
                        >
                          <span className="text-xl leading-none">
                            {opt.flag}
                          </span>
                          <span className="text-[11px] font-medium leading-tight mt-0.5">
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Permisos + price chip */}
                  <div className="flex items-center justify-between mt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          permisos: !prev.permisos,
                        }))
                      }
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors",
                        formData.permisos
                          ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                          : cn(
                              "border-gray-200",
                              isDark
                                ? "border-gray-600 text-gray-400"
                                : "text-gray-500",
                            ),
                      )}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Requiere Permiso
                      {formData.permisos && (
                        <CheckCircle className="h-3.5 w-3.5 ml-1" />
                      )}
                    </button>
                    {computedPrice && (
                      <div
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-semibold",
                          computedPrice.quoteRequired
                            ? cn(
                                isDark
                                  ? "border-gray-600 text-gray-400"
                                  : "border-gray-200 text-gray-500",
                              )
                            : "border-green-300 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300",
                        )}
                      >
                        {computedPrice.quoteRequired ? (
                          <span>Precio: cotizar</span>
                        ) : (
                          <>
                            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                              Precio est.
                            </span>
                            <span>${computedPrice.price.toFixed(2)}</span>
                            <span className="text-xs font-normal text-gray-400">
                              {computedPrice.currency}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {computedPrice && !computedPrice.quoteRequired && (
                    <p className="text-[10px] text-gray-400">
                      {computedPrice.breakdown}
                    </p>
                  )}
                </div>

                {/* Peso · Peso Factura · Precio Manual */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      {t("packages.form.weightRequired")}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.weight || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          weight: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className={
                        isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      Peso Factura
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        (kg)
                      </span>
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={
                        formData.permisos
                          ? String(Math.ceil(formData.weight || 0))
                          : (formData.weight || 0).toFixed(2)
                      }
                      value={formData.pesoRedondeo ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          pesoRedondeo:
                            e.target.value === ""
                              ? undefined
                              : parseFloat(e.target.value) || 0,
                        }))
                      }
                      className={
                        isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                    >
                      Precio Manual
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        (override)
                      </span>
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={
                        computedPrice && !computedPrice.quoteRequired
                          ? computedPrice.price.toFixed(2)
                          : "0.00"
                      }
                      value={formData.priceOverride ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          priceOverride:
                            e.target.value === ""
                              ? undefined
                              : parseFloat(e.target.value) || 0,
                        }))
                      }
                      className={
                        isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                      }
                    />
                  </div>
                </div>

                {/* Dimensiones marítimas — only when USA Marítimo */}
                {isSea && (
                  <div
                    className={cn(
                      "rounded-md border p-3 space-y-2",
                      isDark
                        ? "border-blue-800 bg-blue-900/20"
                        : "border-blue-200 bg-blue-50/60",
                    )}
                  >
                    <label
                      className={cn(
                        "text-sm font-medium",
                        isDark ? "text-blue-300" : "text-blue-800",
                      )}
                    >
                      Dimensiones marítimas
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        (cm — peso volumétrico)
                      </span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["largo", "ancho", "alto"] as const).map((key) => (
                        <div key={key} className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground capitalize">
                            {key} (cm)
                          </label>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0"
                            value={formData[key] ?? ""}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                [key]:
                                  e.target.value === ""
                                    ? undefined
                                    : parseFloat(e.target.value) || 0,
                              }))
                            }
                            className={
                              isDark
                                ? "bg-gray-700 border-gray-600 text-white"
                                : "bg-white"
                            }
                          />
                        </div>
                      ))}
                    </div>
                    {volWeight !== null && (
                      <p
                        className={cn(
                          "text-xs font-medium",
                          isDark ? "text-blue-300" : "text-blue-700",
                        )}
                      >
                        Peso vol.: {volWeight} kg
                        {formData.weight > 0 &&
                          ` — se cobra: ${Math.max(volWeight, formData.weight).toFixed(2)} kg`}
                      </p>
                    )}
                  </div>
                )}

                {/* Categoría */}
                <div className="space-y-2">
                  <label
                    className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                  >
                    Categoría
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        value: "regular",
                        label: "Regular",
                        icon: <PackageIcon className="h-5 w-5 mb-1" />,
                        active:
                          "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
                        iconColor: "text-blue-600 dark:text-blue-400",
                        textColor: "text-blue-700 dark:text-blue-300",
                      },
                      {
                        value: "restricted",
                        label: "Restringido",
                        icon: <AlertTriangle className="h-5 w-5 mb-1" />,
                        active:
                          "border-orange-500 bg-orange-50 dark:bg-orange-900/20",
                        iconColor: "text-orange-600 dark:text-orange-400",
                        textColor: "text-orange-700 dark:text-orange-300",
                      },
                      {
                        value: "electronics",
                        label: "Electrónicos",
                        icon: (
                          <svg
                            className="h-5 w-5 mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                        ),
                        active:
                          "border-purple-500 bg-purple-50 dark:bg-purple-900/20",
                        iconColor: "text-purple-600 dark:text-purple-400",
                        textColor: "text-purple-700 dark:text-purple-300",
                      },
                    ].map((cat) => {
                      const isActive = formData.category === cat.value;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              category: cat.value,
                            }))
                          }
                          className={cn(
                            "relative flex flex-col items-center justify-center py-2.5 rounded-lg border-2 transition-all",
                            isActive
                              ? cat.active
                              : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500",
                          )}
                        >
                          <span
                            className={
                              isActive
                                ? cat.iconColor
                                : "text-gray-500 dark:text-gray-400"
                            }
                          >
                            {cat.icon}
                          </span>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              isActive
                                ? cat.textColor
                                : "text-gray-700 dark:text-gray-300",
                            )}
                          >
                            {cat.label}
                          </span>
                          {isActive && (
                            <CheckCircle
                              className={cn(
                                "absolute top-1.5 right-1.5 h-3.5 w-3.5",
                                cat.iconColor,
                              )}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* FACTURACIÓN — solo al crear */}
              {!selectedPackage && (
                <div
                  className={cn(
                    "rounded-lg border p-4 space-y-3",
                    isDark
                      ? "border-gray-700 bg-gray-900/30"
                      : "border-border bg-muted/20",
                  )}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    Facturación
                    <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                      — opcional
                    </span>
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        value: "none" as const,
                        label: "Sin factura",
                        desc: "Solo crear el paquete",
                      },
                      {
                        value: "create" as const,
                        label: "Nueva factura",
                        desc: "Borrador para este paquete",
                      },
                      {
                        value: "add" as const,
                        label: "Agregar a borrador",
                        desc: "Factura existente del cliente",
                      },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setInvoiceBillingMode(opt.value);
                          setSelectedDraftInvoiceId("");
                        }}
                        className={cn(
                          "flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg border-2 text-center transition-all",
                          invoiceBillingMode === opt.value
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                            : cn(
                                "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500",
                                isDark ? "text-gray-300" : "text-gray-600",
                              ),
                        )}
                      >
                        <span className="font-medium text-xs leading-tight">
                          {opt.label}
                        </span>
                        <span className="text-[10px] font-normal text-muted-foreground leading-tight">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                  {invoiceBillingMode === "add" && (
                    <div className="space-y-1.5">
                      <label
                        className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
                      >
                        Factura borrador del cliente
                      </label>
                      {!formData.slCode ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Selecciona un cliente para ver sus facturas en
                          borrador.
                        </p>
                      ) : draftInvoicesForClient.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No hay facturas en borrador para este cliente.
                        </p>
                      ) : (
                        <Select
                          value={selectedDraftInvoiceId}
                          onValueChange={setSelectedDraftInvoiceId}
                        >
                          <SelectTrigger
                            className={
                              isDark
                                ? "bg-gray-700 border-gray-600 text-white"
                                : ""
                            }
                          >
                            <SelectValue placeholder="Seleccionar factura…" />
                          </SelectTrigger>
                          <SelectContent>
                            {draftInvoicesForClient.map((inv: any) => (
                              <SelectItem key={inv.id} value={inv.id}>
                                {inv.invoiceNumber || `#${inv.id.slice(-6)}`} —{" "}
                                {inv.totalAmount != null
                                  ? `$${Number(inv.totalAmount).toFixed(2)}`
                                  : "Sin monto"}{" "}
                                —{" "}
                                {Array.isArray(inv.trackingNumbers)
                                  ? `${inv.trackingNumbers.length} pkg(s)`
                                  : "0 pkgs"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* end right col */}
          </div>
          {/* end 2-col grid */}

          {/* DESCRIPCIÓN — full width */}
          <div className="space-y-1 mt-5">
            <label
              className={`text-sm font-medium ${isDark ? "text-gray-300" : ""}`}
            >
              {t("packages.form.description")}
            </label>
            <div className="relative">
              <Input
                placeholder={t("packages.form.descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setFormData((prev) => ({ ...prev, description: value }));
                  if (value.length > 0) {
                    const filtered = COMMON_DESCRIPTIONS.filter((d) =>
                      d.includes(value),
                    );
                    setDescriptionSuggestions(filtered);
                    setShowDescriptionSuggestions(filtered.length > 0);
                  } else {
                    setDescriptionSuggestions(COMMON_DESCRIPTIONS);
                    setShowDescriptionSuggestions(false);
                  }
                }}
                onFocus={() => {
                  if (!formData.description) {
                    setDescriptionSuggestions(COMMON_DESCRIPTIONS);
                    setShowDescriptionSuggestions(true);
                  }
                }}
                onBlur={() =>
                  setTimeout(() => setShowDescriptionSuggestions(false), 200)
                }
                className={
                  isDark ? "bg-gray-700 border-gray-600 text-white" : ""
                }
              />
              {showDescriptionSuggestions &&
                descriptionSuggestions.length > 0 && (
                  <div
                    className={cn(
                      "absolute z-50 w-full mt-1 border rounded-md shadow-lg max-h-48 overflow-y-auto",
                      isDark
                        ? "bg-gray-700 border-gray-600"
                        : "bg-white border-gray-200",
                    )}
                  >
                    {descriptionSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm",
                          isDark
                            ? "hover:bg-gray-600 text-gray-200"
                            : "hover:bg-gray-100 text-gray-900",
                        )}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, description: s }));
                          setShowDescriptionSuggestions(false);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className={cn(
          "flex justify-end gap-3 pt-4 border-t shrink-0",
          isDark ? "border-gray-700" : "border-border"
        )}>
          <Button variant="outline" onClick={() => resetAndClose(false)}>
            {t("packages.form.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? t("packages.form.saving")
              : selectedPackage
                ? t("packages.form.update")
                : t("packages.form.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
