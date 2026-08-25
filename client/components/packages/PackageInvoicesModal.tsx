import React, { useState } from "react";
import { NovaInvoicePreview } from "@/components/nova/NovaInvoicePreview";
import { deleteInvoiceFromSp2 } from "@/lib/services/sync-invoices-service";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Trash2, RefreshCw, AlertTriangle, CheckCircle, XCircle, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
import { syncPackagesToSmartWeb } from "@/lib/services/sync-smartweb-service";
import { firebaseApi } from "@/lib/firebase/callable";

interface PackageInvoicesModalProps {
  open: boolean;
  onClose: () => void;
  pkg: any | null;
  invoicesList: any[];
  loading: boolean;
  updating: boolean;
  onAnnulInvoice: (invoiceId: string) => Promise<void>;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  onChangeInvoiceStatus?: (invoiceId: string, newStatus: string) => Promise<void>;
  onSyncInvoice?: (invoice: any) => Promise<void>;
  onRunAudit?: () => Promise<void>;
  onRepairSp2?: () => Promise<void>;
  auditResults?: any;
  loadingAudit?: boolean;
  repairing?: boolean;
}

const getStatusColorClass = (status: string) => {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300";
    case "sent":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300";
    case "paid":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "overdue":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300";
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-300";
    case "annulled":
      return "bg-gray-100 text-gray-800 border-gray-200 line-through dark:bg-gray-850/30 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/50 dark:text-gray-300";
  }
};

const formatCurrencyValue = (amount: number, currencyCode: string = "USD") => {
  const currencySymbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CRC: "₡",
  };
  const symbol = currencySymbols[currencyCode] || currencyCode;
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `${symbol}${safeAmount.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
};

export function PackageInvoicesModal({
  open,
  onClose,
  pkg,
  invoicesList,
  loading,
  updating,
  onAnnulInvoice,
  onDeleteInvoice,
  onChangeInvoiceStatus,
  onSyncInvoice,
  onRunAudit,
  onRepairSp2,
  auditResults,
  loadingAudit,
  repairing,
}: PackageInvoicesModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  // ANTI-REGRESSION WARNING: Local state for invoice preview.
  // Rendering the <NovaInvoicePreview> inside this component (which is already inside the active Radix UI Dialog tree)
  // is CRITICAL. If rendered outside this dialog context (e.g. at the root table component),
  // Radix UI's scroll-lock and click-interceptor (pointer-events: none on body) will block all mouse clicks
  // and touch gestures on the preview modal, making it impossible to click close or interact with it.
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);
  const [localActionLoading, setLocalActionLoading] = useState<string | null>(null);
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Record<string, boolean>>({});
  const [localPackagesMap, setLocalPackagesMap] = useState<Record<string, any>>({});

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState("");
  const [onConfirmAction, setOnConfirmAction] = useState<(() => void) | null>(null);

  const showConfirm = (title: string, description: string, action: () => void) => {
    setConfirmTitle(title);
    setConfirmDescription(description);
    setOnConfirmAction(() => action);
    setConfirmOpen(true);
  };

  React.useEffect(() => {
    if (!invoicesList || invoicesList.length === 0) {
      setLocalPackagesMap({});
      return;
    }

    const fetchLocalPackages = async () => {
      const allTrackings = new Set<string>();
      invoicesList.forEach((inv) => {
        const items = inv.invoiceItems ?? inv.items ?? [];
        items.forEach((item: any) => {
          const t = item.trackingNumber || item.tracking;
          if (t) allTrackings.add(t.toUpperCase().trim());
        });
      });
      const mainTracking = (pkg?.trackingNumber || pkg?.tracking || "").toUpperCase().trim();
      if (mainTracking) allTrackings.add(mainTracking);

      const trackingsArray = Array.from(allTrackings);
      if (trackingsArray.length === 0) return;

      try {
        const batches = [];
        for (let i = 0; i < trackingsArray.length; i += 30) {
          batches.push(trackingsArray.slice(i, i + 30));
        }

        const newMap: Record<string, any> = {};
        for (const chunk of batches) {
          const q = query(
            collection(db, "packages"),
            where("trackingNumber", "in", chunk)
          );
          const querySnapshot = await getDocs(q);
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const tracking = (data.trackingNumber || data.tracking || "").toUpperCase().trim();
            if (tracking) {
              newMap[tracking] = {
                id: doc.id,
                ...data,
              };
            }
          });
        }
        setLocalPackagesMap(newMap);
      } catch (err) {
        console.error("Error fetching local packages in PackageInvoicesModal:", err);
      }
    };

    fetchLocalPackages();
  }, [invoicesList, pkg]);

  const handleSyncSp2Package = async (tracking: string) => {
    const pkgData = localPackagesMap[tracking.toUpperCase().trim()];
    if (!pkgData) {
      toast({
        title: "Error",
        description: `No se encontró la información local del paquete ${tracking} para sincronizar.`,
        variant: "destructive",
      });
      return;
    }

    setLocalActionLoading(`sync-pkg-${tracking}`);
    try {
      const syncPayload = {
        id: pkgData.id,
        trackingNumber: pkgData.trackingNumber || tracking,
        slCode: pkgData.slCode,
        customerName: pkgData.customerName,
        status: pkgData.status,
        weight: pkgData.weight,
        description: pkgData.description,
        origin: pkgData.origin,
        ruta: pkgData.ruta,
        manifestNumber: pkgData.manifestNumber,
        requiresPermit: pkgData.requiresPermit,
        cost: pkgData.cost,
        currency: pkgData.currency || "USD",
        forceSync: true,
        allowCreate: true,
      };

      await syncPackagesToSmartWeb([syncPayload]);
      toast({
        title: "Sincronización completada",
        description: `El paquete ${tracking} se ha sincronizado correctamente con SP2.`,
      });

      if (onRunAudit) {
        await onRunAudit();
      }
    } catch (error) {
      console.error(`Error syncing package ${tracking} to SP2:`, error);
      toast({
        title: "Error al sincronizar paquete",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleDeleteSp2Shipment = async (shipmentId: string, tracking: string) => {
    showConfirm(
      "Eliminar Envío en SP2",
      `¿Está seguro de que desea eliminar el documento de envío ${shipmentId} (tracking: ${tracking}) de la base de datos de SP2 (SmartWeb)? Esta acción es permanente y no afectará a los datos locales de SP1.`,
      async () => {
        setLocalActionLoading(`delete-pkg-doc-${shipmentId}`);
        try {
          const res = await firebaseApi.packages.deleteSp2Shipment({ shipmentId });
          if (!res.success) {
            throw new Error(res.error || "No se pudo eliminar el shipment en SP2");
          }

          toast({
            title: "Documento eliminado en SP2",
            description: `Se eliminó el envío con ID ${shipmentId} para el tracking ${tracking} en SP2.`,
          });

          if (onRunAudit) {
            await onRunAudit();
          }
        } catch (error) {
          console.error(`Error deleting shipment doc ${shipmentId} from SP2:`, error);
          toast({
            title: "Error al eliminar envío en SP2",
            description: error instanceof Error ? error.message : "Error desconocido",
            variant: "destructive",
          });
        } finally {
          setLocalActionLoading(null);
        }
      }
    );
  };

  const toggleInvoiceExpanded = (invId: string) => {
    setExpandedInvoiceIds(prev => ({
      ...prev,
      [invId]: !prev[invId]
    }));
  };

  const handleSyncSp2Invoice = async (invId: string, invoiceNumber: string) => {
    const localInv = invoicesList.find(i => i.id === invId);
    if (!localInv) {
      toast({
        title: "Error",
        description: "No se encontró la factura local correspondiente para sincronizar.",
        variant: "destructive"
      });
      return;
    }
    if (!onSyncInvoice) return;
    setLocalActionLoading(`sync-${invId}`);
    try {
      await onSyncInvoice(localInv);
      // Wait a moment and trigger audit rerun
      if (onRunAudit) {
        await onRunAudit();
      }
    } catch (error) {
      console.error("Error syncing SP2 invoice from audit:", error);
      toast({
        title: "Error al sincronizar factura",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setLocalActionLoading(null);
    }
  };

  const handleDeleteSp2Invoice = async (invId: string, invoiceNumber: string) => {
    showConfirm(
      "Eliminar Factura en SP2",
      `¿Está seguro de que desea eliminar la factura ${invoiceNumber} de SP2 (SmartWeb)? Esta acción no eliminará la factura local de SP1.`,
      async () => {
        setLocalActionLoading(`delete-${invId}`);
        try {
          await deleteInvoiceFromSp2(invId, invoiceNumber);
          toast({
            title: "Factura eliminada en SP2",
            description: `Se ha solicitado la eliminación de la factura ${invoiceNumber} en SP2.`,
          });
          if (onRunAudit) {
            await onRunAudit();
          }
        } catch (error) {
          console.error("Error deleting SP2 invoice:", error);
          toast({
            title: "Error al eliminar factura en SP2",
            description: error instanceof Error ? error.message : "Error desconocido",
            variant: "destructive",
          });
        } finally {
          setLocalActionLoading(null);
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="flex flex-col p-6 bg-background border-border">
        <DialogHeader className="border-b border-border pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Facturas del Paquete
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Revisa las facturas asociadas al tracking:{" "}
                <span className="font-mono font-semibold text-foreground select-all">
                  {pkg?.trackingNumber || pkg?.tracking}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Modal content body */}
        <div className="flex-1 overflow-y-auto py-6 pr-2">
          {/* Audit Controls & Repair Section */}
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/30 border border-border p-4 rounded-xl">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Auditoría de Sincronización con SP2 (SmartWeb)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compara el estado de los paquetes e invoices locales contra los almacenados en la plataforma del cliente.
              </p>
            </div>
            <div className="flex items-center gap-2 self-end md:self-auto">
              {auditResults?.hasIssues && onRepairSp2 && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium flex items-center gap-1.5 transition-colors"
                  onClick={onRepairSp2}
                  disabled={updating || repairing}
                >
                  {repairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  Reparar Desajustes
                </Button>
              )}
              {onRunAudit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold flex items-center gap-1.5 hover:bg-muted"
                  onClick={onRunAudit}
                  disabled={loading || loadingAudit}
                >
                  {loadingAudit ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {auditResults ? "Volver a Auditar" : "Iniciar Auditoría"}
                </Button>
              )}
            </div>
          </div>

          {/* Audit Results Panel */}
          {loadingAudit ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 border border-dashed border-border rounded-xl bg-card mb-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Ejecutando auditoría en base de datos SP2...</p>
            </div>
          ) : auditResults ? (
            <div className="mb-6 border border-border rounded-xl overflow-hidden bg-card shadow-sm p-4 space-y-4 animate-in fade-in duration-200">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border pb-2">
                Resultados de la Auditoría
              </h4>
              
              {/* Package Audit */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-muted-foreground">Paquete en SP2:</span>
                  {auditResults.package.exists ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Existe
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                      <XCircle className="h-3.5 w-3.5" />
                      No existe en SP2 (SmartWeb)
                    </span>
                  )}
                  {auditResults.package.isDuplicate && (
                    <span className="text-[10px] bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 px-1.5 py-0.5 rounded font-semibold animate-pulse">
                      DUPLICADO
                    </span>
                  )}
                </div>
                
                {auditResults.package.exists && (
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-muted-foreground mr-1">Estado SP1 (Admin):</span>
                      <span className="font-semibold text-foreground uppercase">{auditResults.package.statusSp1}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-1">Estado SP2 (SmartWeb):</span>
                      <span className={cn(
                        "font-semibold uppercase",
                        auditResults.package.mismatch ? "text-amber-600 font-bold dark:text-amber-400" : "text-foreground"
                      )}>
                        {auditResults.package.statusSp2}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Invoices Audit */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-xs font-semibold text-muted-foreground">Facturas en SP2 (SmartWeb):</div>
                {auditResults.invoices.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No hay facturas locales asociadas para auditar.</div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden text-xs">
                    <div className="grid grid-cols-6 bg-muted/50 px-3 py-2 font-semibold text-muted-foreground">
                      <div>Factura #</div>
                      <div>Sincronizada</div>
                      <div className="text-center">Estado SP1 | SP2</div>
                      <div className="text-right">Monto SP1 | SP2</div>
                      <div className="text-center">Resultado</div>
                      <div className="text-center">Acciones SP2</div>
                    </div>
                    <div className="divide-y divide-border">
                      {auditResults.invoices.map((inv: any) => (
                        <div key={inv.id} className="grid grid-cols-6 px-3 py-2.5 items-center bg-card">
                          <div className="font-mono font-semibold text-foreground flex flex-col">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => toggleInvoiceExpanded(inv.id)}
                                className="p-0.5 hover:bg-muted rounded text-muted-foreground transition-colors"
                              >
                                {expandedInvoiceIds[inv.id] ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <span
                                className="hover:underline cursor-pointer text-blue-600 dark:text-blue-400"
                                onClick={() => setPreviewInvoice({ id: inv.id, invoiceNumber: inv.invoiceNumber })}
                              >
                                {inv.invoiceNumber}
                              </span>
                            </div>
                            <span className="text-[9px] text-muted-foreground font-sans font-normal ml-6">ID: {inv.id}</span>
                          </div>
                          <div>
                            {inv.existsSp2 ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Sí
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                                <XCircle className="h-3 w-3" /> No
                              </span>
                            )}
                          </div>
                          <div className="text-center font-mono">
                            <span className="text-muted-foreground">{inv.statusSp1}</span>
                            <span className="mx-1">|</span>
                            <span className={cn(
                              inv.statusSp1 !== inv.statusSp2 ? "text-amber-600 dark:text-amber-400 font-bold" : "text-foreground"
                            )}>{inv.statusSp2}</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-muted-foreground">${inv.amountSp1.toFixed(2)}</span>
                            <span className="mx-1">|</span>
                            <span className={cn(
                              Math.abs(inv.amountSp1 - inv.amountSp2) > 0.01 ? "text-amber-600 dark:text-amber-400 font-bold" : "text-foreground"
                            )}>${inv.amountSp2.toFixed(2)}</span>
                          </div>
                          <div className="text-center">
                            {inv.mismatch ? (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center justify-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Desajuste
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Correcto
                              </span>
                            )}
                          </div>
                          <div className="flex justify-center items-center gap-1.5">
                            {/* Sync / Re-sync button */}
                            {onSyncInvoice && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 border-border hover:bg-muted"
                                title={inv.existsSp2 ? "Re-sincronizar con SP2" : "Sincronizar con SP2"}
                                onClick={() => handleSyncSp2Invoice(inv.id, inv.invoiceNumber)}
                                disabled={updating || localActionLoading !== null}
                              >
                                {localActionLoading === `sync-${inv.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                )}
                              </Button>
                            )}

                            {/* Delete from SP2 button */}
                            {inv.existsSp2 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-950/30 dark:hover:bg-red-950/20"
                                title="Eliminar de SP2"
                                onClick={() => handleDeleteSp2Invoice(inv.id, inv.invoiceNumber)}
                                disabled={updating || localActionLoading !== null}
                              >
                                {localActionLoading === `delete-${inv.id}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                )}
                              </Button>
                            )}
                          </div>

                          {/* Collapsible tracking panel */}
                          {expandedInvoiceIds[inv.id] && (
                            <div className="col-span-6 bg-muted/20 px-8 py-3 border-t border-border mt-2 space-y-3 w-full self-start">
                              <div className="font-semibold text-muted-foreground mb-1 text-xs text-left">Paquetes / Tracking en esta Factura:</div>
                              {(() => {
                                const localInv = invoicesList.find(i => i.id === inv.id);
                                const items = localInv?.invoiceItems ?? localInv?.items ?? [];
                                if (items.length === 0) {
                                  return <div className="text-muted-foreground italic pl-2 text-left">No hay trackings asociados a esta factura.</div>;
                                }
                                return (
                                  <div className="space-y-2.5">
                                    {items.map((item: any, idx: number) => {
                                      const rawTracking = item.trackingNumber || item.tracking || "";
                                      const tracking = rawTracking.toUpperCase().trim();
                                      const localPkg = localPackagesMap[tracking];
                                      const auditedPkg = auditResults.packages?.find((p: any) => p.trackingNumber === tracking);

                                      return (
                                        <div key={idx} className="flex flex-col gap-2 p-2.5 rounded-md border border-border bg-card text-xs">
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                                            <div className="flex flex-col gap-0.5">
                                              <span className="font-mono font-bold text-foreground text-left">{tracking}</span>
                                              <span className="text-[10px] text-muted-foreground text-left">
                                                Descripción: {localPkg?.description || "N/A"} | Peso: {localPkg?.weight || 0} lbs
                                              </span>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center gap-4">
                                              <div className="flex flex-col items-start">
                                                <span className="text-[10px] text-muted-foreground">Estado SP1</span>
                                                <Badge variant="outline" className="font-mono py-0 h-5 text-[10px] w-fit">
                                                  {localPkg?.status || "N/A"}
                                                </Badge>
                                              </div>

                                              <div className="flex flex-col items-start">
                                                <span className="text-[10px] text-muted-foreground">Estado SP2</span>
                                                {auditedPkg ? (
                                                  auditedPkg.existsSp2 ? (
                                                    <Badge
                                                      variant={auditedPkg.mismatch ? "secondary" : "outline"}
                                                      className={cn(
                                                        "font-mono py-0 h-5 text-[10px] w-fit",
                                                        auditedPkg.mismatch && "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-950/50"
                                                      )}
                                                    >
                                                      {auditedPkg.statusSp2}
                                                    </Badge>
                                                  ) : (
                                                    <Badge variant="destructive" className="py-0 h-5 text-[10px] w-fit">No Existe</Badge>
                                                  )
                                                ) : (
                                                  <span className="text-muted-foreground italic text-[10px]">Sin auditar</span>
                                                )}
                                              </div>

                                              <div className="flex flex-col items-start">
                                                <span className="text-[10px] text-muted-foreground">Resultado</span>
                                                {auditedPkg ? (
                                                  auditedPkg.isDuplicate ? (
                                                    <span className="text-red-500 font-bold text-[10px]">Duplicado en SP2</span>
                                                  ) : auditedPkg.mismatch ? (
                                                    <span className="text-amber-500 font-bold text-[10px]">Desajuste</span>
                                                  ) : (
                                                    <span className="text-emerald-500 font-bold text-[10px]">Correcto</span>
                                                  )
                                                ) : (
                                                  <span className="text-muted-foreground text-[10px]">--</span>
                                                )}
                                              </div>

                                              <div className="flex items-center gap-1.5 ml-2">
                                                {/* Sync Package Button */}
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 px-2 py-0 border-border hover:bg-muted text-[10px] flex items-center gap-1"
                                                  title="Sincronizar/Re-sincronizar este paquete en SP2"
                                                  onClick={() => handleSyncSp2Package(tracking)}
                                                  disabled={updating || localActionLoading !== null || !localPkg}
                                                >
                                                  {localActionLoading === `sync-pkg-${tracking}` ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <RefreshCw className="h-3 w-3" />
                                                  )}
                                                  Re-sync
                                                </Button>

                                                {/* Delete shipment button if audited and exists */}
                                                {auditedPkg?.existsSp2 && (
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 py-0 border-red-200 hover:bg-red-50 hover:text-red-700 text-red-600 text-[10px] flex items-center gap-1 dark:border-red-950/30 dark:hover:bg-red-950/20"
                                                    title="Eliminar este tracking de SP2"
                                                    onClick={() => {
                                                      const primaryDoc = auditedPkg.sp2Docs?.[0];
                                                      if (primaryDoc) {
                                                        handleDeleteSp2Shipment(primaryDoc.id, tracking);
                                                      }
                                                    }}
                                                    disabled={updating || localActionLoading !== null}
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                    Eliminar
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Render list of duplicates if any */}
                                          {auditedPkg?.isDuplicate && auditedPkg.sp2Docs && auditedPkg.sp2Docs.length > 1 && (
                                            <div className="w-full mt-2 pt-2 border-t border-dashed border-border space-y-1.5 text-left">
                                              <div className="text-[10px] font-semibold text-red-500">
                                                ¡Atención! Se detectaron múltiples documentos ({auditedPkg.sp2Docs.length}) para este tracking en SP2. Seleccione cuál eliminar:
                                              </div>
                                              <div className="grid gap-1">
                                                {auditedPkg.sp2Docs.map((doc: any, dIdx: number) => (
                                                  <div key={dIdx} className="flex items-center justify-between bg-red-50/50 dark:bg-red-950/10 p-1.5 rounded border border-red-100 dark:border-red-950/30 text-[10px]">
                                                    <span className="font-mono text-muted-foreground">ID: {doc.id} | Cuenta: {doc.slCode} | Estado: {doc.status}</span>
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      className="h-5 px-1.5 text-red-600 hover:bg-red-100 hover:text-red-700 font-medium"
                                                      onClick={() => handleDeleteSp2Shipment(doc.id, tracking)}
                                                      disabled={updating || localActionLoading !== null}
                                                    >
                                                      {localActionLoading === `delete-pkg-doc-${doc.id}` ? (
                                                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                      ) : (
                                                        <Trash2 className="h-2.5 w-2.5 mr-1" />
                                                      )}
                                                      Eliminar Duplicado
                                                    </Button>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Local invoices table starts below */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Consultando facturas asociadas...</p>
            </div>
          ) : invoicesList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-xl bg-muted/20">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-semibold text-foreground">No se encontraron facturas</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                Este paquete no tiene facturas creadas o asociadas en la base de datos.
              </p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
                <div className="grid grid-cols-6 bg-muted/50 border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div>Factura #</div>
                  <div>Cliente</div>
                  <div>Fecha Creación</div>
                  <div className="text-right">Total</div>
                  <div className="text-center">Estado</div>
                  <div className="text-center">Acciones</div>
                </div>

                <div className="divide-y divide-border">
                  {invoicesList.map((inv) => {
                    const isAnnulled = ["cancelled", "annulled", "deleted"].includes(inv.status);
                    const clientName = inv.clientName || inv.customerName || inv.customer?.fullName || inv.nombreCliente || inv.nombre || "—";

                    return (
                      <div
                        key={inv.id}
                        className={cn(
                          "grid grid-cols-6 px-4 py-3.5 text-xs items-center transition-colors hover:bg-muted/10",
                          isAnnulled && "bg-gray-50/50 dark:bg-gray-900/10 text-muted-foreground"
                        )}
                      >
                        {/* Invoice # */}
                        <div className="font-mono font-semibold text-foreground flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleInvoiceExpanded(inv.id)}
                              className="p-0.5 hover:bg-muted rounded text-muted-foreground transition-colors"
                            >
                              {expandedInvoiceIds[inv.id] ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <span
                              className="hover:underline cursor-pointer text-blue-600 dark:text-blue-400"
                              onClick={() => setPreviewInvoice(inv)}
                            >
                              {inv.invoiceNumber || inv.id}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-sans font-normal ml-6">ID: {inv.id}</span>
                        </div>

                        {/* Client */}
                        <div className="font-medium text-foreground uppercase truncate pr-4 text-left" title={clientName}>
                          {clientName}
                        </div>

                        {/* Created Date */}
                        <div className="text-muted-foreground text-left">
                          {inv.createdAt
                            ? new Date(inv.createdAt).toLocaleDateString("es-CR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </div>

                        {/* Total */}
                        <div className="text-right font-semibold text-foreground">
                          {formatCurrencyValue(inv.totalAmount || inv.total || 0, inv.currency || "USD")}
                        </div>

                        {/* Status */}
                        <div className="flex justify-center">
                          {onChangeInvoiceStatus ? (
                            <select
                              value={inv.status}
                              onChange={(e) => onChangeInvoiceStatus(inv.id, e.target.value)}
                              disabled={updating}
                              className={cn(
                                "text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring dark:bg-background transition-colors",
                                getStatusColorClass(inv.status)
                              )}
                            >
                              <option value="draft">Borrador</option>
                              <option value="sent">Enviada</option>
                              <option value="paid">Pagada</option>
                              <option value="overdue">Vencida</option>
                              <option value="cancelled">Cancelada</option>
                              <option value="annulled">Anulada</option>
                            </select>
                          ) : (
                            <Badge
                              className={cn(
                                "text-[10px] font-semibold leading-none px-2.5 py-1 rounded-full whitespace-nowrap",
                                getStatusColorClass(inv.status)
                              )}
                            >
                              {String(t(`packages.statuses.${inv.status}`, inv.status))}
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-center items-center gap-1.5">
                          {/* Preview Button */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 border-border hover:bg-muted"
                            title="Ver Vista Previa"
                            onClick={() => setPreviewInvoice(inv)}
                            disabled={updating}
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                          </Button>

                          {/* Sync Button */}
                          {onSyncInvoice && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 border-border hover:bg-muted"
                              title="Sincronizar con SP2"
                              onClick={() => onSyncInvoice(inv)}
                              disabled={updating}
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            </Button>
                          )}

                          {/* Annul/Anular Button */}
                          {!isAnnulled && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 border-red-200 hover:bg-red-50 hover:text-red-700 text-red-600 dark:border-red-950/30 dark:hover:bg-red-950/20"
                              onClick={() => onAnnulInvoice(inv.id)}
                              disabled={updating}
                            >
                              Anular
                            </Button>
                          )}

                          {/* Delete/Eliminar Button */}
                          {onDeleteInvoice && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-950/30 dark:hover:bg-red-950/20"
                              title="Eliminar Factura"
                              onClick={() => {
                                showConfirm(
                                  "Eliminar Factura Permanentemente",
                                  `¿Está seguro de que desea eliminar permanentemente la factura ${inv.invoiceNumber || inv.id}? Esta acción no se puede deshacer.`,
                                  () => onDeleteInvoice(inv.id)
                                );
                              }}
                              disabled={updating}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                            </Button>
                          )}

                          {isAnnulled && !onDeleteInvoice && (
                            <span className="text-[10px] font-semibold text-muted-foreground">ANULADA</span>
                          )}
                        </div>

                        {/* Collapsible tracking panel */}
                        {expandedInvoiceIds[inv.id] && (
                          <div className="col-span-6 bg-muted/20 px-8 py-3 border-t border-border mt-2 space-y-3 w-full self-start">
                            <div className="font-semibold text-muted-foreground mb-1 text-xs text-left">Paquetes / Tracking en esta Factura:</div>
                            {(() => {
                              const items = inv.invoiceItems ?? inv.items ?? [];
                              if (items.length === 0) {
                                return <div className="text-muted-foreground italic pl-2 text-left">No hay trackings asociados a esta factura.</div>;
                              }
                              return (
                                <div className="space-y-2.5">
                                  {items.map((item: any, idx: number) => {
                                    const rawTracking = item.trackingNumber || item.tracking || "";
                                    const tracking = rawTracking.toUpperCase().trim();
                                    const localPkg = localPackagesMap[tracking];
                                    const auditedPkg = auditResults?.packages?.find((p: any) => p.trackingNumber === tracking);

                                    return (
                                      <div key={idx} className="flex flex-col gap-2 p-2.5 rounded-md border border-border bg-card text-xs">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                                          <div className="flex flex-col gap-0.5">
                                            <span className="font-mono font-bold text-foreground text-left">{tracking}</span>
                                            <span className="text-[10px] text-muted-foreground text-left">
                                              Descripción: {localPkg?.description || "N/A"} | Peso: {localPkg?.weight || 0} lbs
                                            </span>
                                          </div>
                                          
                                          <div className="flex flex-wrap items-center gap-4">
                                            <div className="flex flex-col items-start">
                                              <span className="text-[10px] text-muted-foreground">Estado SP1</span>
                                              <Badge variant="outline" className="font-mono py-0 h-5 text-[10px] w-fit">
                                                {localPkg?.status || "N/A"}
                                              </Badge>
                                            </div>

                                            <div className="flex flex-col items-start">
                                              <span className="text-[10px] text-muted-foreground">Estado SP2</span>
                                              {auditedPkg ? (
                                                auditedPkg.existsSp2 ? (
                                                  <Badge
                                                    variant={auditedPkg.mismatch ? "secondary" : "outline"}
                                                    className={cn(
                                                      "font-mono py-0 h-5 text-[10px] w-fit",
                                                      auditedPkg.mismatch && "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-950/50"
                                                    )}
                                                  >
                                                    {auditedPkg.statusSp2}
                                                  </Badge>
                                                ) : (
                                                  <Badge variant="destructive" className="py-0 h-5 text-[10px] w-fit">No Existe</Badge>
                                                )
                                              ) : (
                                                <span className="text-muted-foreground italic text-[10px]">Sin auditar (Inicie Auditoría arriba)</span>
                                              )}
                                            </div>

                                            <div className="flex flex-col items-start">
                                              <span className="text-[10px] text-muted-foreground">Resultado</span>
                                              {auditedPkg ? (
                                                auditedPkg.isDuplicate ? (
                                                  <span className="text-red-500 font-bold text-[10px]">Duplicado en SP2</span>
                                                ) : auditedPkg.mismatch ? (
                                                  <span className="text-amber-500 font-bold text-[10px]">Desajuste</span>
                                                ) : (
                                                  <span className="text-emerald-500 font-bold text-[10px]">Correcto</span>
                                                )
                                              ) : (
                                                <span className="text-muted-foreground text-[10px]">--</span>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-1.5 ml-2">
                                              {/* Sync Package Button */}
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 py-0 border-border hover:bg-muted text-[10px] flex items-center gap-1"
                                                title="Sincronizar/Re-sincronizar este paquete en SP2"
                                                onClick={() => handleSyncSp2Package(tracking)}
                                                disabled={updating || localActionLoading !== null || !localPkg}
                                              >
                                                {localActionLoading === `sync-pkg-${tracking}` ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <RefreshCw className="h-3 w-3" />
                                                )}
                                                Re-sync
                                              </Button>

                                              {/* Delete shipment button if audited and exists */}
                                              {auditedPkg?.existsSp2 && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="h-7 px-2 py-0 border-red-200 hover:bg-red-50 hover:text-red-700 text-red-600 text-[10px] flex items-center gap-1 dark:border-red-950/30 dark:hover:bg-red-950/20"
                                                  title="Eliminar este tracking de SP2"
                                                  onClick={() => {
                                                    const primaryDoc = auditedPkg.sp2Docs?.[0];
                                                    if (primaryDoc) {
                                                      handleDeleteSp2Shipment(primaryDoc.id, tracking);
                                                    }
                                                  }}
                                                  disabled={updating || localActionLoading !== null}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                  Eliminar
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Render list of duplicates if any */}
                                        {auditedPkg?.isDuplicate && auditedPkg.sp2Docs && auditedPkg.sp2Docs.length > 1 && (
                                          <div className="w-full mt-2 pt-2 border-t border-dashed border-border space-y-1.5 text-left">
                                            <div className="text-[10px] font-semibold text-red-500">
                                              ¡Atención! Se detectaron múltiples documentos ({auditedPkg.sp2Docs.length}) para este tracking en SP2. Seleccione cuál eliminar:
                                            </div>
                                            <div className="grid gap-1">
                                              {auditedPkg.sp2Docs.map((doc: any, dIdx: number) => (
                                                <div key={dIdx} className="flex items-center justify-between bg-red-50/50 dark:bg-red-950/10 p-1.5 rounded border border-red-100 dark:border-red-950/30 text-[10px]">
                                                  <span className="font-mono text-muted-foreground">ID: {doc.id} | Cuenta: {doc.slCode} | Estado: {doc.status}</span>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-5 px-1.5 text-red-600 hover:bg-red-100 hover:text-red-700 font-medium"
                                                    onClick={() => handleDeleteSp2Shipment(doc.id, tracking)}
                                                    disabled={updating || localActionLoading !== null}
                                                  >
                                                    {localActionLoading === `delete-pkg-doc-${doc.id}` ? (
                                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                    ) : (
                                                      <Trash2 className="h-2.5 w-2.5 mr-1" />
                                                    )}
                                                    Eliminar Duplicado
                                                  </Button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4 flex items-center justify-end shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-3 mt-4">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (onConfirmAction) {
                    onConfirmAction();
                  }
                  setConfirmOpen(false);
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Confirmar
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {previewInvoice && (
          <NovaInvoicePreview
            invoice={previewInvoice}
            onClose={() => setPreviewInvoice(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
