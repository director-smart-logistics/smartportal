import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InlineEditCell } from "@/components/data-grid/InlineEditCell";
import { PackageManifestEditor } from "@/components/packages/PackageManifestEditor";
import { usePackage, useUpdatePackage } from "@/lib/hooks/queries/usePackages";
import { cn } from "@/lib/utils";
import { checkTrackingPreAlert } from "@/lib/services/nova-tools";
import {
  Package,
  Globe2,
  Calendar,
  Clock,
  User,
  Truck,
  Scale,
  FileText,
  DollarSign,
  Tag,
  Wifi,
  Loader2,
  Copy,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface PackageDetailsModalProps {
  packageId: string | null;
  open: boolean;
  onClose: () => void;
  routes: any[];
  manifests: any[];
  canUpdate: (permission: string) => boolean;
  statusOptions: any[];
  statusColors: Record<string, string>;
  onForceSync: (pkg: any) => Promise<void>;
  syncingPkgId: string | null;
}

function fmtDate(raw: unknown): string {
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
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return String(raw);
  }
}

export function PackageDetailsModal({
  packageId,
  open,
  onClose,
  routes,
  manifests,
  canUpdate,
  statusOptions,
  statusColors,
  onForceSync,
  syncingPkgId,
}: PackageDetailsModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation(["packages", "common"]);

  // Fetch package details reactively when open
  const { data, isLoading, error } = usePackage(packageId || "", {
    enabled: !!packageId && open,
  });
  const pkg = data as any;

  const [preAlertInfo, setPreAlertInfo] = React.useState<any>(null);
  const [loadingPreAlert, setLoadingPreAlert] = React.useState(false);

  React.useEffect(() => {
    if (pkg?.trackingNumber || pkg?.tracking) {
      const trk = (pkg.trackingNumber || pkg.tracking || "");
      if (trk && open) {
        setLoadingPreAlert(true);
        checkTrackingPreAlert(trk)
          .then((info) => {
            setPreAlertInfo(info);
          })
          .catch((err) => {
            console.error("Failed to check pre-alert:", err);
          })
          .finally(() => {
            setLoadingPreAlert(false);
          });
        return;
      }
    }
    setPreAlertInfo(null);
  }, [pkg?.trackingNumber, pkg?.tracking, open]);

  const updateMutation = useUpdatePackage(packageId || "");

  const handleSaveField = async (field: string, newValue: any) => {
    if (!packageId) return;
    try {
      await updateMutation.mutateAsync({ [field]: newValue });
      toast({
        title: "Campo actualizado",
        description: `Se actualizó correctamente en la base de datos.`,
      });
    } catch (err: any) {
      toast({
        title: "Error al guardar",
        description: err?.message || "No se pudo actualizar el campo.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado al portapapeles",
      description: text,
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="flex flex-col p-6 bg-background border-border">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  Detalles del Paquete
                </DialogTitle>
                <DialogDescription className="font-mono text-xs flex items-center gap-1.5 mt-1 select-all">
                  <span>ID: {packageId}</span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 mt-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Cargando detalles del paquete...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs">
              Error al consultar los datos del paquete: {(error as Error).message}
            </div>
          )}

          {!isLoading && pkg && (
            <div className="space-y-6 mt-4">
              {/* Pre-alert Owner Banner */}
              {preAlertInfo && preAlertInfo.found && (
                <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400 font-semibold">
                    <User className="h-4 w-4 shrink-0" />
                    <span>Creador de Pre-alerta Activa</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-muted-foreground pt-1.5 border-t border-violet-500/10">
                    <div>
                      <span className="font-medium">Código SL:</span>{" "}
                      <span className="font-mono font-bold text-foreground bg-violet-500/20 px-1.5 py-0.5 rounded text-[11px]">
                        {preAlertInfo.slCode || "—"}
                      </span>
                    </div>
                    {preAlertInfo.userId && (
                      <div>
                        <span className="font-medium">ID de Usuario:</span>{" "}
                        <span className="font-mono text-foreground font-semibold">
                          {preAlertInfo.userId}
                        </span>
                      </div>
                    )}
                    {preAlertInfo.email && (
                      <div className="md:col-span-2">
                        <span className="font-medium">Correo Electrónico:</span>{" "}
                        <span className="text-foreground font-semibold">
                          {preAlertInfo.email}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Header Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Número de Rastreo
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-sm font-semibold select-all text-foreground">
                    <span>{pkg.trackingNumber || pkg.tracking || "—"}</span>
                    <button
                      onClick={() => copyToClipboard(pkg.trackingNumber || pkg.tracking || "")}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar tracking"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    SmartID / Cliente
                  </span>
                  <span className="text-sm font-semibold text-foreground block uppercase">
                    {pkg.customerName || "—"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground block">
                    {pkg.slCode || "—"}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Estado
                  </span>
                  <InlineEditCell
                    value={pkg.status}
                    onSave={(v) => handleSaveField("status", v)}
                    type="select"
                    options={statusOptions}
                    disabled={!canUpdate("packages")}
                    renderValue={(value) => (
                      <Badge
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap cursor-pointer",
                          statusColors[value as string] || "bg-gray-200 text-gray-900"
                        )}
                      >
                        {statusOptions.find((opt) => opt.value === value)?.label || value}
                      </Badge>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Logistics & Shipment Info */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Logística y Ruta
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Route */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Ruta Asignada
                    </span>
                    <InlineEditCell
                      value={pkg.ruta || ""}
                      onSave={(v) => handleSaveField("ruta", v)}
                      type="select"
                      options={routes.map((r) => ({ label: r.name, value: r.name }))}
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer">
                          {v || "Sin ruta"}
                        </span>
                      )}
                    />
                  </div>

                  {/* Transport Type */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Tipo de Transporte
                    </span>
                    <InlineEditCell
                      value={pkg.type || "maritimo"}
                      onSave={(v) => handleSaveField("type", v)}
                      type="select"
                      options={[
                        { label: "Aéreo", value: "aereo" },
                        { label: "Marítimo", value: "maritimo" },
                        { label: "Local", value: "local" },
                      ]}
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold capitalize text-foreground underline decoration-dotted cursor-pointer">
                          {v}
                        </span>
                      )}
                    />
                  </div>

                  {/* Origin */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Origen
                    </span>
                    <InlineEditCell
                      value={pkg.origin || "USA"}
                      onSave={(v) => handleSaveField("origin", v)}
                      type="select"
                      options={[
                        { label: "USA", value: "USA" },
                        { label: "CRC", value: "CRC" },
                        { label: "CHN", value: "CHN" },
                      ]}
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer">
                          {v}
                        </span>
                      )}
                    />
                  </div>

                  {/* Manifest Assignment */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Manifiesto Asociado
                    </span>
                    <div className="max-w-[280px]">
                      <PackageManifestEditor
                        packageId={pkg.id}
                        trackingNumber={pkg.trackingNumber || pkg.tracking || ""}
                        currentManifest={pkg.manifestNumber || pkg.manifiesto || ""}
                        slCode={pkg.slCode || ""}
                        customerName={pkg.customerName || ""}
                        weight={pkg.weight || 0}
                        price={pkg.price || 0}
                        description={pkg.description || ""}
                        permisos={pkg.requiresPermit || pkg.permisos || false}
                        manifests={manifests}
                      />
                    </div>
                  </div>

                  {/* Days in System */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Días en Sistema
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {pkg.daysInSystem != null ? `${pkg.daysInSystem} días` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Master Package Grouped Trackings */}
              {pkg.isMasterPackage && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Package className="h-4 w-4 text-amber-500" />
                      Paquetes Agrupados (Rastreos del Paquete Maestro)
                    </h4>
                    <div className="flex flex-wrap gap-2 p-4 rounded-xl border border-amber-100 bg-amber-50/10 dark:border-amber-950/20 dark:bg-amber-950/5">
                      {pkg.groupedTrackings && pkg.groupedTrackings.length > 0 ? (
                        pkg.groupedTrackings.map((t: string) => (
                          <span
                            key={t}
                            onClick={() => copyToClipboard(t)}
                            className="font-mono text-xs font-bold text-foreground bg-muted/80 px-2.5 py-1.5 rounded-md border border-border/50 cursor-pointer transition-all hover:bg-violet-600 hover:text-white hover:border-violet-600 select-all"
                            title="Haz clic para copiar"
                          >
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No hay trackings agrupados en este paquete maestro.</span>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Weights and Pricing */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  Pesos y Costos
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Physical Weight */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Peso Físico
                    </span>
                    <InlineEditCell
                      value={pkg.weight}
                      onSave={(v) => handleSaveField("weight", Number(v))}
                      type="number"
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer">
                          {v != null ? `${Number(v).toFixed(2)} kg/lb` : "—"}
                        </span>
                      )}
                    />
                  </div>

                  {/* Rounded Weight */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Peso Redondeado
                    </span>
                    <InlineEditCell
                      value={pkg.pesoRedondeo ?? 0}
                      onSave={(v) => handleSaveField("pesoRedondeo", Number(v))}
                      type="number"
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer">
                          {v != null && Number(v) > 0 ? `${Number(v).toFixed(2)} kg/lb` : "—"}
                        </span>
                      )}
                    />
                  </div>

                  {/* Description */}
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Descripción del Contenido
                    </span>
                    <InlineEditCell
                      value={pkg.description || ""}
                      onSave={(v) => handleSaveField("description", v)}
                      type="text"
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer break-words block max-w-full">
                          {v || "Sin descripción"}
                        </span>
                      )}
                    />
                  </div>

                  {/* Price USD */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Precio (USD)
                    </span>
                    <InlineEditCell
                      value={pkg.price || 0}
                      onSave={(v) => handleSaveField("price", Number(v))}
                      type="number"
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer">
                          {v != null ? `$${Number(v).toFixed(2)}` : "—"}
                        </span>
                      )}
                    />
                  </div>

                  {/* Price CRC */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Precio (CRC)
                    </span>
                    <InlineEditCell
                      value={pkg.costCRC || 0}
                      onSave={(v) => handleSaveField("costCRC", Number(v))}
                      type="number"
                      disabled={!canUpdate("packages")}
                      renderValue={(v) => (
                        <span className="text-sm font-semibold text-foreground underline decoration-dotted cursor-pointer">
                          {v != null ? `₡${Number(v).toLocaleString("es-CR")}` : "—"}
                        </span>
                      )}
                    />
                  </div>

                  {/* Calculated Cost */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Costo Calculado (Sistema)
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {pkg.calculatedCost != null ? `$${pkg.calculatedCost.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Synced with SmartWeb (SP2) */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Sincronización SmartWeb / SP2
                </h4>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border border-violet-100 bg-violet-50/20 dark:border-violet-950/20 dark:bg-violet-950/5">
                  <div className="flex items-center gap-3">
                    <Globe2 className={cn("h-6 w-6 shrink-0", pkg.smartwebSynced ? "text-violet-500 animate-pulse" : "text-muted-foreground/60")} />
                    <div>
                      <span className="text-xs font-bold text-violet-800 dark:text-violet-400 block">
                        {pkg.smartwebSynced ? "Sincronizado con SmartWeb / SP2" : "No Sincronizado"}
                      </span>
                      {pkg.smartwebSyncedAt && (
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          Última sincronización: {fmtDate(pkg.smartwebSyncedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => onForceSync(pkg)}
                    disabled={syncingPkgId === pkg.id}
                    size="sm"
                    variant="outline"
                    className="border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-xs gap-1.5 self-start md:self-auto"
                  >
                    {syncingPkgId === pkg.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Sincronizando...
                      </>
                    ) : (
                      <>
                        <Wifi className="h-3.5 w-3.5" />
                        Forzar Sincronización
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Timestamps */}
              <div className="flex items-center gap-6 text-[10px] text-muted-foreground select-none">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Creado: {fmtDate(pkg.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Modificado: {fmtDate(pkg.updatedAt)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
