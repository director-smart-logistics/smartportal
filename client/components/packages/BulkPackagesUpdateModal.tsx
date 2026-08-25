import React, { useState, useEffect } from "react";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Globe2,
  ShieldAlert,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CustomerAutocomplete, type AutocompleteCustomer } from "../customer/CustomerAutocomplete";

const getStatusOptions = (t: any) => [
  { label: t("packages.statusPreAlerted") || "Pre-alertado", value: "pre_alerted" },
  { label: t("packages.statusReceived") || "Recibido en Miami", value: "received" },
  { label: t("packages.statusInTransit") || "En Tránsito", value: "in_transit" },
  { label: t("packages.statusCustoms") || "En Aduana", value: "customs" },
  { label: t("packages.statusRetained") || "Retenido", value: "retained" },
  { label: t("packages.statusConsolidated") || "Consolidado", value: "consolidated" },
  { label: "Facturado", value: "processed" },
  { label: t("packages.statusOnRoute") || "En Ruta", value: "on_route" },
  { label: "Retira en SmartLogistics", value: "pickup" },
  { label: t("packages.statusDelivered") || "Entregado", value: "delivered" },
  { label: t("packages.statusReturned") || "Devuelto", value: "returned" },
];

const SYNC_ELIGIBLE_STATUSES = new Set([
  "received",
  "in_transit",
  "customs",
  "retained",
  "delivered",
  "returned",
  "pickup",
  "processed",
]);

export interface BulkUpdateData {
  updateDestination: boolean;
  destination: string;
  updateStatus: boolean;
  status: string;
  updateSlAccount: boolean;
  slAccountCustomer: AutocompleteCustomer | null;
  updateManifest: boolean;
  manifestNumber: string;
}

interface BulkPackagesUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPackages: any[];
  routes: any[];
  manifestsForBulk: any[];
  onConfirm: (
    updates: Record<string, any>,
    deliveredOptions: { updateInvoices: boolean; syncInvoicesSp2: boolean },
    manifestNumber: string | null
  ) => Promise<void>;
  updating: boolean;
  t: any;
}

export function BulkPackagesUpdateModal({
  isOpen,
  onClose,
  selectedPackages = [],
  routes = [],
  manifestsForBulk = [],
  onConfirm,
  updating,
  t,
}: BulkPackagesUpdateModalProps) {
  const [step, setStep] = useState<"form" | "preview" | "verify">("form");
  const [keyword, setKeyword] = useState("");
  const [manifestPopoverOpen, setManifestPopoverOpen] = useState(false);
  const [manifestSearch, setManifestSearch] = useState("");

  const [bulkUpdateData, setBulkUpdateData] = useState<BulkUpdateData>({
    updateDestination: false,
    destination: "",
    updateStatus: false,
    status: "",
    updateSlAccount: false,
    slAccountCustomer: null,
    updateManifest: false,
    manifestNumber: "",
  });

  const [bulkDeliveredOptions, setBulkDeliveredOptions] = useState({
    updateInvoices: false,
    syncInvoicesSp2: false,
  });

  // Reset steps and states when dialog is opened
  useEffect(() => {
    if (isOpen) {
      setStep("form");
      setKeyword("");
      setBulkUpdateData({
        updateDestination: false,
        destination: "",
        updateStatus: false,
        status: "",
        updateSlAccount: false,
        slAccountCustomer: null,
        updateManifest: false,
        manifestNumber: "",
      });
      setBulkDeliveredOptions({
        updateInvoices: false,
        syncInvoicesSp2: false,
      });
    }
  }, [isOpen]);

  const hasAnySelection =
    bulkUpdateData.updateDestination ||
    bulkUpdateData.updateStatus ||
    bulkUpdateData.updateSlAccount ||
    bulkUpdateData.updateManifest;

  const validateFormStep = () => {
    if (!hasAnySelection) {
      return false;
    }
    if (bulkUpdateData.updateDestination && !bulkUpdateData.destination) {
      return false;
    }
    if (bulkUpdateData.updateStatus && !bulkUpdateData.status) {
      return false;
    }
    if (bulkUpdateData.updateSlAccount && !bulkUpdateData.slAccountCustomer) {
      return false;
    }
    if (bulkUpdateData.updateManifest && !bulkUpdateData.manifestNumber.trim()) {
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (step === "form") {
      if (validateFormStep()) {
        setStep("preview");
      }
    } else if (step === "preview") {
      setStep("verify");
    }
  };

  const handlePrevStep = () => {
    if (step === "preview") {
      setStep("form");
    } else if (step === "verify") {
      setStep("preview");
    }
  };

  const handleFinalConfirm = async () => {
    if (keyword.trim().toUpperCase() !== "CONFIRMAR") return;

    const updates: Record<string, any> = {};
    if (bulkUpdateData.updateDestination) {
      updates.ruta = bulkUpdateData.destination;
      const selectedRoute = routes.find(
        (r: any) =>
          r.name.toLowerCase() === bulkUpdateData.destination.toLowerCase(),
      );
      updates.routeId = selectedRoute?.id || null;
      updates.destination = bulkUpdateData.destination;
    }
    if (bulkUpdateData.updateStatus) {
      updates.status = bulkUpdateData.status;
    }
    if (bulkUpdateData.updateSlAccount && bulkUpdateData.slAccountCustomer) {
      updates.slCode = bulkUpdateData.slAccountCustomer.slCode;
      updates.customerId = bulkUpdateData.slAccountCustomer.id;
      updates.customerName =
        bulkUpdateData.slAccountCustomer.fullName.toUpperCase();
    }

    const manifestNumber = bulkUpdateData.updateManifest && bulkUpdateData.manifestNumber
      ? bulkUpdateData.manifestNumber.trim()
      : null;

    await onConfirm(updates, bulkDeliveredOptions, manifestNumber);
  };

  // Status mapping for title representation
  const activeTitle = {
    form: t("packages.bulkUpdate") || "Actualización Masiva",
    preview: t("packages.confirmBulkUpdate") || "Confirmar Actualización Masiva",
    verify: "Confirmar y Sincronizar",
  }[step];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !updating) onClose(); }}>
      <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-lg w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-6 rounded-xl overflow-hidden bg-background border-border shadow-lg">
        <DialogHeader className="shrink-0 pb-4 border-b">
          <div className="flex items-center gap-2">
            {step === "verify" && <ShieldAlert className="h-5 w-5 text-amber-500" />}
            <DialogTitle className="text-lg font-bold">{activeTitle}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {step === "form" && (
              t("packages.bulkUpdateDescription", { count: selectedPackages.length }) || 
              `Configure los campos que desea actualizar para los ${selectedPackages.length} paquetes seleccionados.`
            )}
            {step === "preview" && "Revise los campos seleccionados y las opciones adicionales antes de proceder."}
            {step === "verify" && `Esta es una acción irreversible. Se actualizarán ${selectedPackages.length} paquetes.`}
          </DialogDescription>

          {/* Stepper visual */}
          <div className="flex items-center gap-2 mt-3 select-none">
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full transition-all border",
              step === "form" 
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800" 
                : "bg-muted text-muted-foreground border-transparent"
            )}>
              1. Configurar
            </span>
            <span className="text-[10px] text-muted-foreground">➔</span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full transition-all border",
              step === "preview" 
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800" 
                : "bg-muted text-muted-foreground border-transparent"
            )}>
              2. Revisar
            </span>
            <span className="text-[10px] text-muted-foreground">➔</span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full transition-all border",
              step === "verify" 
                ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800" 
                : "bg-muted text-muted-foreground border-transparent"
            )}>
              3. Confirmar
            </span>
          </div>
        </DialogHeader>

        {/* Wizard content sections */}
        <div className="flex-1 overflow-y-auto pr-2 py-4 space-y-4">
          
          {step === "form" && (
            <div className="space-y-4">
              {/* Field 1: Route */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="modalUpdateDestination"
                    checked={bulkUpdateData.updateDestination}
                    onChange={(e) =>
                      setBulkUpdateData({
                        ...bulkUpdateData,
                        updateDestination: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 cursor-pointer"
                  />
                  <Label
                    htmlFor="modalUpdateDestination"
                    className="font-medium text-gray-750 cursor-pointer"
                  >
                    Actualizar Ruta
                  </Label>
                </div>
                
                <Select
                  value={bulkUpdateData.destination}
                  onValueChange={(value) =>
                    setBulkUpdateData({ ...bulkUpdateData, destination: value })
                  }
                  disabled={!bulkUpdateData.updateDestination}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full bg-background border-input text-foreground placeholder:text-muted-foreground focus:ring-violet-500 focus:border-violet-500",
                      !bulkUpdateData.updateDestination && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <SelectValue placeholder="Seleccionar ruta" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {Array.from(
                      new Set(routes.map((r: any) => r.name).filter(Boolean)),
                    )
                      .sort()
                      .map((name: any) => (
                        <SelectItem key={name} value={name} className="hover:bg-accent focus:bg-accent cursor-pointer">
                          {name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Field 2: Status */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="modalUpdateStatus"
                    checked={bulkUpdateData.updateStatus}
                    onChange={(e) =>
                      setBulkUpdateData({
                        ...bulkUpdateData,
                        updateStatus: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 cursor-pointer"
                  />
                  <Label
                    htmlFor="modalUpdateStatus"
                    className="font-medium text-gray-750 cursor-pointer"
                  >
                    {t("packages.updateStatus") || "Actualizar Estado"}
                  </Label>
                </div>

                <Select
                  value={bulkUpdateData.status}
                  onValueChange={(value) =>
                    setBulkUpdateData({ ...bulkUpdateData, status: value })
                  }
                  disabled={!bulkUpdateData.updateStatus}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full bg-background border-input text-foreground placeholder:text-muted-foreground focus:ring-violet-500 focus:border-violet-500",
                      !bulkUpdateData.updateStatus && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <SelectValue placeholder={t("packages.selectStatus") || "Seleccionar estado"} />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    {getStatusOptions(t).map((option) => (
                      <SelectItem key={option.value} value={option.value} className="hover:bg-accent focus:bg-accent cursor-pointer">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Field 3: SL Account */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="modalUpdateSlAccount"
                    checked={bulkUpdateData.updateSlAccount}
                    onChange={(e) =>
                      setBulkUpdateData({
                        ...bulkUpdateData,
                        updateSlAccount: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 cursor-pointer"
                  />
                  <Label
                    htmlFor="modalUpdateSlAccount"
                    className="font-medium text-gray-750 cursor-pointer"
                  >
                    {t("packages.updateSlAccount") || "Actualizar Cuenta SL"}
                  </Label>
                </div>

                <div className={cn(!bulkUpdateData.updateSlAccount && "opacity-40 pointer-events-none")}>
                  <CustomerAutocomplete
                    value={bulkUpdateData.slAccountCustomer?.fullName || ""}
                    onChange={() => {}}
                    onCustomerSelect={(customer) => {
                      setBulkUpdateData({
                        ...bulkUpdateData,
                        slAccountCustomer: customer,
                      });
                    }}
                    placeholder={t("packages.searchCustomer") || "Buscar cliente..."}
                  />
                  {bulkUpdateData.slAccountCustomer && (
                    <div className="mt-2 p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {bulkUpdateData.slAccountCustomer.fullName}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t("packages.slAccount") || "Cuenta SL"}: {bulkUpdateData.slAccountCustomer.slCode}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/40">
                        ASIGNADO
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Field 4: Manifest */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="modalUpdateManifest"
                    checked={bulkUpdateData.updateManifest}
                    onChange={(e) =>
                      setBulkUpdateData({
                        ...bulkUpdateData,
                        updateManifest: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500 cursor-pointer"
                  />
                  <Label
                    htmlFor="modalUpdateManifest"
                    className="font-medium text-gray-750 cursor-pointer"
                  >
                    Actualizar Manifiesto
                  </Label>
                </div>

                <div className={cn(!bulkUpdateData.updateManifest && "opacity-40 pointer-events-none")}>
                  <Popover open={manifestPopoverOpen} onOpenChange={setManifestPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "w-full h-10 flex items-center justify-between rounded-lg border border-border px-3.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all",
                          !bulkUpdateData.manifestNumber && "text-muted-foreground",
                        )}
                        disabled={!bulkUpdateData.updateManifest}
                      >
                        <span>
                          {bulkUpdateData.manifestNumber || "Buscar manifiesto..."}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0 z-[300] bg-popover border-border text-popover-foreground" align="start">
                      <Command className="bg-popover text-popover-foreground">
                        <CommandInput
                          placeholder="Buscar manifiesto..."
                          value={manifestSearch}
                          onValueChange={setManifestSearch}
                          className="h-10 text-foreground border-b border-border bg-transparent"
                        />
                        <CommandList className="max-h-52 scrollbar-thin">
                          <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                             Sin resultados
                          </CommandEmpty>
                          <CommandGroup>
                            {(manifestsForBulk || [])
                              .filter((m) => {
                                const num = m.manifestNumber || m.id;
                                return (
                                  !manifestSearch ||
                                  num.toLowerCase().includes(manifestSearch.toLowerCase())
                                );
                              })
                              .map((m) => {
                                const num = m.manifestNumber || m.id;
                                return (
                                  <CommandItem
                                    key={m.id}
                                    value={num}
                                    onSelect={() => {
                                      setBulkUpdateData({
                                        ...bulkUpdateData,
                                        manifestNumber: num,
                                      });
                                      setManifestSearch("");
                                      setManifestPopoverOpen(false);
                                    }}
                                    className="hover:bg-accent focus:bg-accent text-foreground flex items-center justify-between cursor-pointer"
                                  >
                                    <div className="flex items-center">
                                      <Check
                                        className={cn(
                                          "mr-2.5 h-4 w-4 text-violet-400",
                                          bulkUpdateData.manifestNumber === num ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <span className="font-semibold">{num}</span>
                                    </div>
                                    {m.manifestType && (
                                      <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                        {m.manifestType.replace("_", " ").toUpperCase()}
                                      </span>
                                    )}
                                  </CommandItem>
                                );
                              })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="font-semibold">{t("packages.fieldsToUpdate") || "Campos a actualizar"}:</span>
                <ul className="list-disc list-inside mt-2 space-y-1 bg-muted/30 border p-3 rounded-lg">
                  {bulkUpdateData.updateDestination && (
                    <li>
                      Ruta: <strong>{bulkUpdateData.destination}</strong>
                    </li>
                  )}
                  {bulkUpdateData.updateStatus && (
                    <li>
                      {t("packages.status") || "Estado"}:{" "}
                      <strong>
                        {getStatusOptions(t).find((s) => s.value === bulkUpdateData.status)?.label || bulkUpdateData.status}
                      </strong>
                    </li>
                  )}
                  {bulkUpdateData.updateSlAccount && bulkUpdateData.slAccountCustomer && (
                    <li>
                      Cuenta SL: <strong>{bulkUpdateData.slAccountCustomer.fullName}</strong>
                    </li>
                  )}
                  {bulkUpdateData.updateManifest && bulkUpdateData.manifestNumber && (
                    <li>
                      Manifiesto: <strong>{bulkUpdateData.manifestNumber}</strong>
                    </li>
                  )}
                </ul>
              </div>

              {/* Automatic SmartWeb Sync warning card */}
              {bulkUpdateData.updateStatus && SYNC_ELIGIBLE_STATUSES.has(bulkUpdateData.status) && (
                <div className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-900/60 p-3.5 text-sm">
                  <Globe2 className="h-4 w-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-violet-800 dark:text-violet-300">
                      Sincronización SmartWeb automática
                    </p>
                    <p className="text-violet-600 dark:text-violet-400 text-xs mt-0.5 leading-relaxed">
                      Al confirmar, el estado de los paquetes se sincronizará con SmartWeb (SP2) y se registrará un evento en el historial de cada envío.
                    </p>
                  </div>
                </div>
              )}

              {/* Delivered Options Checklist */}
              {bulkUpdateData.updateStatus && bulkUpdateData.status === "delivered" && (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-card text-card-foreground">
                  <div className="px-4 py-2 bg-muted/40 border-b border-border">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Opciones para Entregado
                    </p>
                  </div>
                  {bulkDeliveredOptions.updateInvoices && (
                    <div className="px-4 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 select-none">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Confirmación Administrativa Requerida:</span> Esta opción marcará automáticamente las facturas asociadas como <strong>PAGADAS</strong> en el sistema. Asegúrese de contar con la aprobación del administrador y los comprobantes antes de proceder.
                      </div>
                    </div>
                  )}
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={bulkDeliveredOptions.updateInvoices}
                      onChange={(e) =>
                        setBulkDeliveredOptions((o) => ({
                          ...o,
                          updateInvoices: e.target.checked,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-gray-400 accent-violet-650 cursor-pointer"
                    />
                    <span className="block">
                      <span className="block text-xs font-semibold text-foreground leading-tight">
                        Actualizar facturas a Pagado
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Marca como <em>paid</em> las facturas vinculadas a estos paquetes (omite las ya pagadas o anuladas).
                      </span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none",
                      !bulkDeliveredOptions.updateInvoices && "opacity-40 pointer-events-none",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={bulkDeliveredOptions.syncInvoicesSp2}
                      onChange={(e) =>
                        setBulkDeliveredOptions((o) => ({
                          ...o,
                          syncInvoicesSp2: e.target.checked,
                        }))
                      }
                      disabled={!bulkDeliveredOptions.updateInvoices}
                      className="mt-0.5 h-4 w-4 rounded border-gray-400 accent-violet-650 cursor-pointer"
                    />
                    <span className="block">
                      <span className="block text-xs font-semibold text-foreground leading-tight">
                        Sincronizar facturas con SP2
                      </span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Envía el estado <em>paid</em> de cada factura a SmartWeb (SP2).
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* General Warning box */}
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3.5 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">{t("packages.warning") || "Advertencia"}:</span>{" "}
                  {t("packages.bulkUpdateWarning") || "Esta acción aplicará cambios permanentes sobre múltiples registros a la vez."}
                </div>
              </div>
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60 p-3.5 text-sm">
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Acción irreversible
                  </p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5 leading-relaxed">
                    Se actualizarán <strong>{selectedPackages.length}</strong> paquetes en SP1
                    {bulkUpdateData.updateStatus && SYNC_ELIGIBLE_STATUSES.has(bulkUpdateData.status)
                      ? ` y se sincronizarán con SmartWeb (SP2) como «${
                          getStatusOptions(t).find((s) => s.value === bulkUpdateData.status)?.label || bulkUpdateData.status
                        }»`
                      : ""}
                    .
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Escribe <strong>CONFIRMAR</strong> para continuar:
                </label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="CONFIRMAR"
                  disabled={updating}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-violet-650 focus:ring-1 focus:ring-violet-650/40 transition-all"
                  autoFocus
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer dynamic button actions */}
        <DialogFooter className="shrink-0 pt-4 border-t border-border mt-auto flex items-center justify-between sm:justify-between w-full">
          {step === "form" ? (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={updating}
                className="rounded-lg h-9 text-xs"
              >
                {t("common.cancel") || "Cancelar"}
              </Button>
              <Button
                onClick={handleNextStep}
                disabled={!validateFormStep()}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg h-9 px-4 text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
              >
                Continuar
                <ArrowRight className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={updating}
                className="rounded-lg h-9 text-xs flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3 w-3" />
                Atrás
              </Button>
              
              {step === "preview" ? (
                <Button
                  onClick={handleNextStep}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg h-9 px-4 text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  Continuar
                  <ArrowRight className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  onClick={handleFinalConfirm}
                  disabled={updating || keyword.trim().toUpperCase() !== "CONFIRMAR"}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg h-9 px-5 text-xs font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {updating ? (
                    <>
                      <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin text-white" />
                      Procesando...
                    </>
                  ) : (
                    "Confirmar y Sincronizar"
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
