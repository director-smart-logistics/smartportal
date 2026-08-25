import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Calendar,
  Package,
  User,
  MapPin,
  Pencil,
  Truck,
  Printer,
  X,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import { firebaseApi } from "../../lib/firebase/callable";
import { ShippingLabelPrint, type ParcelPreview } from "../nova/NovaShippingLabelModal";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "../ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  shippingLabelsService,
  ShippingLabel,
} from "../../lib/services/shipping-labels.service";
import { useToast } from "../../hooks/use-toast";
import { format } from "date-fns";

interface RecentLabelsHistoryProps {
  customerId?: string;
  customerSlCode?: string;
  onLabelSelect?: (label: ShippingLabel) => void;
}

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  printed: "bg-blue-100 text-blue-800 border-blue-300",
  in_transit: "bg-purple-100 text-purple-800 border-purple-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const STATUS_LABELS = {
  pending: "Pendiente",
  printed: "Impreso",
  in_transit: "En Tránsito",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function RecentLabelsHistory({
  customerId,
  customerSlCode,
  onLabelSelect,
}: RecentLabelsHistoryProps) {
  const { t } = useTranslation("shipping");
  const { toast } = useToast();

  const [labels, setLabels] = useState<ShippingLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Load labels
  const loadLabels = useCallback(async () => {
    setLoading(true);
    try {
      let result;

      if (customerId) {
        result = await shippingLabelsService.getCustomerLabels(customerId, 100);
      } else if (customerSlCode) {
        result = await shippingLabelsService.getLabelsBySlCode(
          customerSlCode,
          100,
        );
      } else {
        result = await shippingLabelsService.getRecentLabels(100);
      }

      setLabels(result.labels);
    } catch (error: any) {
      console.error("Error loading labels:", error);
      toast({
        title: "Error",
        description: error.message || "Error al cargar etiquetas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [customerId, customerSlCode, toast]);

  useEffect(() => {
    loadLabels();

    const handleGenerated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customerSlCode || customEvent.detail?.slCode === customerSlCode) {
        loadLabels();
      }
    };

    window.addEventListener("shipping-label-generated", handleGenerated);
    return () => {
      window.removeEventListener("shipping-label-generated", handleGenerated);
    };
  }, [loadLabels, customerSlCode]);

  // Filter labels
  const filteredLabels = labels.filter((label) => {
    // Status filter
    if (statusFilter !== "all" && label.status !== statusFilter) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        label.labelNumber.toLowerCase().includes(query) ||
        label.customerName.toLowerCase().includes(query) ||
        label.recipientName.toLowerCase().includes(query) ||
        (label.packages || []).some((pkg) =>
          pkg.trackingNumber.toLowerCase().includes(query),
        )
      );
    }

    return true;
  });

  // States for custom modals
  const [quickPrintTarget, setQuickPrintTarget] = useState<ShippingLabel | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShippingLabel | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const handleQuickPrint = (label: ShippingLabel) => {
    setQuickPrintTarget(label);
  };

  const handleQuickPrintConfirm = async (includeTrackings: boolean) => {
    if (!quickPrintTarget) return;
    const label = quickPrintTarget;
    setQuickPrintTarget(null);

    if (includeTrackings && (!label.packages || label.packages.length === 0)) {
      toast({
        title: "Redirigiendo a edición",
        description: "Esta guía no tiene paquetes asociados. Por favor, selecciona paquetes para poder imprimir con trackings.",
      });
      if (onLabelSelect) {
        onLabelSelect(label);
      }
      return;
    }

    try {
      const container = document.createElement("div");
      container.className = "sl-print-area hidden print:block";
      document.body.appendChild(container);

      const parcel: ParcelPreview = {
        parcelId: label.labelNumber,
        slCode: label.customerSlCode,
        recipientName: label.recipientName,
        recipientPhone: label.recipientPhone || undefined,
        recipientDni: undefined,
        deliveryAddress: label.recipientAddress,
        courierService: label.notes?.replace(/^Courier:\s*/, "") || "",
        trackings: includeTrackings ? (label.packages || []).map((p) => p.trackingNumber) : [],
        ruta: label.routeName || undefined,
        createdAt: label.createdAt,
      };

      let customerData = null;
      try {
        const custRes = await firebaseApi.customers.getBySlCode(label.customerSlCode);
        if (custRes.success && custRes.data) {
          customerData = custRes.data;
        }
      } catch (e) {
        console.warn("[RecentLabelsHistory] Failed to load customer details for quick print:", e);
      }

      const root = createRoot(container);
      root.render(<ShippingLabelPrint parcel={parcel} customer={customerData} />);

      setTimeout(() => {
        window.print();
        setTimeout(() => {
          root.unmount();
          container.remove();
        }, 500);
      }, 100);
    } catch (error: any) {
      toast({
        title: "Error de impresión",
        description: "No se pudo preparar la impresión rápida.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = (label: ShippingLabel) => {
    setCancelTarget(label);
    setCancelReason("");
  };

  const handleCancelSubmit = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    const labelId = cancelTarget.id;
    const reason = cancelReason;

    setCancelTarget(null);
    setCancelReason("");

    try {
      await shippingLabelsService.cancelLabel({
        labelId,
        reason,
      });
      toast({
        title: "Éxito",
        description: "Etiqueta cancelada exitosamente",
      });
      loadLabels();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al cancelar etiqueta",
        variant: "destructive",
      });
    }
  };



  return (
    <Card className="w-full h-full flex flex-col min-h-0 overflow-hidden bg-card">
      <CardHeader className="shrink-0 pb-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm md:text-base">
            <Printer className="h-5 w-5 text-primary" />
            Impresión Rápida e Historial
            {filteredLabels.length > 0 && (
              <Badge variant="secondary">{filteredLabels.length}</Badge>
            )}
          </CardTitle>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente, tracking..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 text-xs"
                data-testid="search-labels-input"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="w-full sm:w-[150px] h-9 text-xs"
              data-testid="status-filter-select"
            >
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="printed">Impreso</SelectItem>
              <SelectItem value="in_transit">En Tránsito</SelectItem>
              <SelectItem value="delivered">Entregado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-4 pr-2 scrollbar-thin">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Cargando etiquetas...
          </div>
        ) : filteredLabels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron etiquetas
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLabels.map((label) => (
              <div
                key={label.id}
                className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                data-testid={`label-item-${label.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {/* Line 1: Client Name + Courier Badge + Date */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground flex items-center gap-1 truncate">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>
                          {label.customerName}
                          {label.customerSlCode && (
                            <span className="text-muted-foreground text-xs font-normal ml-1">
                              ({label.customerSlCode})
                            </span>
                          )}
                        </span>
                      </span>

                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0.5 font-bold shrink-0 flex items-center gap-1"
                      >
                        <Truck className="h-3 w-3 shrink-0" />
                        {label.notes?.replace(/^Courier:\s*/, "") || "Sin Encomienda"}
                      </Badge>

                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {format(new Date(label.createdAt), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>

                    {/* Line 2: Label ID and Package info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded select-all font-semibold shrink-0">
                        {label.labelNumber}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {label.packageCount} pq · {label.totalWeight.toFixed(1)} lbs
                        </span>
                      </div>
                    </div>

                    {/* Tracking Numbers */}
                    {(label.packages || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(label.packages || []).slice(0, 3).map((pkg) => (
                          <Badge
                            key={pkg.id}
                            variant="secondary"
                            className="text-xs font-mono"
                          >
                            {pkg.trackingNumber}
                          </Badge>
                        ))}
                        {(label.packages || []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{(label.packages || []).length - 3} más
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-center">
                    {onLabelSelect && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onLabelSelect(label)}
                        data-testid={`view-label-${label.id}`}
                        title="Ver/Editar Etiqueta"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickPrint(label)}
                      data-testid={`print-label-${label.id}`}
                      title="Impresión Rápida"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancel(label)}
                      data-testid={`cancel-label-${label.id}`}
                      title="Cancelar Etiqueta"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Quick Print AlertDialog ───────────────────────────────────────────── */}
      <AlertDialog open={!!quickPrintTarget} onOpenChange={(open) => { if (!open) setQuickPrintTarget(null); }}>
        <AlertDialogContent className="sm:max-w-[620px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Impresión Rápida de Guía</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas incluir los números de rastreo (trackings) en la guía impresa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end mt-4">
            <AlertDialogCancel
              onClick={() => setQuickPrintTarget(null)}
              className="sm:mr-auto mt-0"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleQuickPrintConfirm(false)}
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground mt-0 font-medium"
            >
              Imprimir sin Trackings
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleQuickPrintConfirm(true)}
              className="font-medium"
            >
              Imprimir con Trackings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancel Label AlertDialog ──────────────────────────────────────────── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) { setCancelTarget(null); setCancelReason(""); } }}>
        <AlertDialogContent className="sm:max-w-[480px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Etiqueta</AlertDialogTitle>
            <AlertDialogDescription>
              Por favor, indica el motivo por el cual deseas cancelar esta etiqueta en el sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="Escribe el motivo de la cancelación..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full text-sm h-10"
              autoFocus
            />
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel
              onClick={() => { setCancelTarget(null); setCancelReason(""); }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubmit}
              disabled={!cancelReason.trim()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium"
            >
              Confirmar Cancelación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
