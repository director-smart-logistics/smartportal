import React from "react";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Check,
  Copy,
  X,
  Search,
  Loader2,
  Route,
  Layers,
  Package as PackageIcon,
  Info,
  ArrowRightLeft,
} from "lucide-react";
import { ManifestPicker } from "@/components/manifest/ManifestPicker";
import type { InvoiceStatus } from "../../types";

interface InvoiceConfirmationDialogProps {
  isOpen: boolean;
  confirmAction: {
    type: string;
    invoiceId: string;
    invoiceNumber: string;
    show: boolean;
    data?: any;
  } | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  annulMode: "consolidation" | "manifest";
  setAnnulMode: (mode: "consolidation" | "manifest") => void;
  annulSelectedManifest: { docId: string; manifestNumber: string } | null;
  setAnnulSelectedManifest: (manifest: { docId: string; manifestNumber: string } | null) => void;
  annulManifestInput?: string;
  setAnnulManifestInput?: (input: string) => void;
  annulManifestLoading?: boolean;
  annulManifestMatches?: Array<{ docId: string; manifestNumber: string }>;
  annulDropdownOpen?: boolean;
  setAnnulDropdownOpen?: (open: boolean) => void;
  allManifestNumbers?: string[];
  manifestPackageCounts?: Map<string, number>;
  deleteConfirmText: string;
  setDeleteConfirmText: (text: string) => void;
  copiedInvoiceNumber: boolean;
  setCopiedInvoiceNumber: (copied: boolean) => void;
  bulkActionConfirmed: boolean;
  setBulkActionConfirmed: (confirmed: boolean) => void;
  emailSendOptions: { sendEmail: boolean; updatePackages: boolean; syncSp2: boolean };
  setEmailSendOptions: React.Dispatch<
    React.SetStateAction<{ sendEmail: boolean; updatePackages: boolean; syncSp2: boolean }>
  >;
  statusChangeOptions: { syncInvoice: boolean; updatePackages: boolean; syncSp2: boolean };
  setStatusChangeOptions: React.Dispatch<
    React.SetStateAction<{ syncInvoice: boolean; updatePackages: boolean; syncSp2: boolean }>
  >;
  bulkStatusOptions: { syncSp2: boolean; updatePackages: boolean; includeAnnulled?: boolean };
  setBulkStatusOptions: React.Dispatch<
    React.SetStateAction<{ syncSp2: boolean; updatePackages: boolean; includeAnnulled?: boolean }>
  >;
  customerConsolidationEnabledSP1?: boolean | null;
  customerConsolidationEnabledSP2?: boolean | null;
  autoEnableConsolidation?: boolean;
  setAutoEnableConsolidation?: (enabled: boolean) => void;
}

export function InvoiceConfirmationDialog({
  isOpen,
  confirmAction,
  onClose,
  onConfirm,
  annulMode,
  setAnnulMode,
  annulSelectedManifest,
  setAnnulSelectedManifest,
  annulManifestInput,
  setAnnulManifestInput,
  annulManifestLoading,
  annulManifestMatches,
  annulDropdownOpen,
  setAnnulDropdownOpen,
  deleteConfirmText,
  setDeleteConfirmText,
  copiedInvoiceNumber,
  setCopiedInvoiceNumber,
  bulkActionConfirmed,
  setBulkActionConfirmed,
  emailSendOptions,
  setEmailSendOptions,
  statusChangeOptions,
  setStatusChangeOptions,
  bulkStatusOptions,
  setBulkStatusOptions,
  customerConsolidationEnabledSP1 = null,
  customerConsolidationEnabledSP2 = null,
  autoEnableConsolidation = true,
  setAutoEnableConsolidation,
  allManifestNumbers = [],
  manifestPackageCounts,
}: InvoiceConfirmationDialogProps) {
  const { t } = useLocale(["invoices", "common"]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const copyInvoiceNumberToClipboard = async () => {
    const value = confirmAction?.invoiceNumber ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedInvoiceNumber(true);
      setTimeout(() => setCopiedInvoiceNumber(false), 2000);
    } catch (err) {
      console.error("Failed to copy invoice number:", err);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        data-testid="confirmation-dialog"
        className="sm:max-w-[880px] md:max-w-[920px] lg:max-w-[960px] w-full p-6 sm:p-8 rounded-2xl shadow-2xl border bg-background max-h-[90vh] overflow-y-auto"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmAction?.type === "status" && t("confirmStatusChange", { defaultValue: "Cambiar Estado de Factura" })}
            {confirmAction?.type === "pdf" && t("confirmGeneratePDF", { defaultValue: "Generar PDF" })}
            {confirmAction?.type === "email" && t("confirmSendEmail", { defaultValue: "Enviar Factura por Email" })}
            {confirmAction?.type === "sms" && t("confirmSendSMS", { defaultValue: "Enviar SMS" })}
            {confirmAction?.type === "whatsapp" && t("confirmOpenWhatsApp", { defaultValue: "Abrir WhatsApp" })}
            {confirmAction?.type === "annul" && t("confirmAnnulInvoice", { defaultValue: "Anular Factura" })}
            {confirmAction?.type === "delete" && t("confirmDeleteTitle", { defaultValue: "Eliminar Factura" })}
            {confirmAction?.type === "bulk-delete" && `Eliminar ${confirmAction?.data?.count} factura(s)`}
            {confirmAction?.type === "bulk-email" && `Enviar email a ${confirmAction?.data?.count} factura(s)`}
            {confirmAction?.type === "bulk-strip" && `Quitar Redondeo en ${confirmAction?.data?.count} factura(s)`}
            {confirmAction?.type === "bulk-merge" && `Fusionar ${confirmAction?.data?.count} facturas`}
            {confirmAction?.type === "bulk-status" && `Cambiar estado de ${confirmAction?.data?.count} factura(s)`}
            {confirmAction?.type === "bulk-sync" && `Sincronizar ${confirmAction?.data?.count} factura(s) con SmartWeb`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-sm text-muted-foreground">
            {/* SERVICIO DE TERCERO warning */}
            {((confirmAction?.type === "email" && confirmAction?.data?.missingTercero) ||
              (confirmAction?.type === "bulk-email" && (confirmAction?.data?.encomiendaMissingTerceroCount ?? 0) > 0)) && (
              <span className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/60 px-3 py-2.5 mb-2 block">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span className="block text-left">
                  <span className="block text-sm font-semibold text-amber-800 dark:text-amber-300 leading-tight">
                    Item faltante: SERVICIO DE TERCERO
                  </span>
                  <span className="block text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {confirmAction?.type === "email"
                      ? "Esta factura de Encomiendas no tiene el item SERVICIO DE TERCERO. Agréguelo en el módulo de Encomiendas antes de enviar."
                      : `${confirmAction?.data?.encomiendaMissingTerceroCount} factura(s) de Encomiendas no tienen el item SERVICIO DE TERCERO. Verifique antes de enviar.`}
                  </span>
                </span>
              </span>
            )}

            {/* Status Change Details */}
            {confirmAction?.type === "status" && (
              <span className="block space-y-4">
                <span className="block text-sm text-muted-foreground text-left">
                  Se ejecutará el siguiente flujo para <strong className="text-foreground">{confirmAction?.invoiceNumber}</strong>:
                </span>
                <span className="block divide-y divide-border rounded-lg border border-border overflow-hidden text-left">
                  <span className="flex items-start gap-3 px-4 py-3 bg-muted/20">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-2 border-primary bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                    </span>
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Cambiar estado de la factura</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        De <Badge variant="outline" className="text-[10px] mx-0.5">{t(`statuses.${confirmAction?.data?.oldStatus}`)}</Badge> a <Badge variant="outline" className="text-[10px] mx-0.5">{t(`statuses.${confirmAction?.data?.newStatus}`)}</Badge>.
                      </span>
                    </span>
                  </span>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="status-opt-sync-invoice"
                      checked={statusChangeOptions.syncInvoice}
                      onCheckedChange={(v) => setStatusChangeOptions(o => ({ ...o, syncInvoice: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Sincronizar estado con SP2</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Actualiza el estado de la factura en SmartWeb (SP2).</span>
                    </span>
                  </label>
                  {confirmAction?.data?.newStatus === "paid" && (
                    <>
                      <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="status-opt-update-pkgs"
                          checked={statusChangeOptions.updatePackages}
                          onCheckedChange={(v) => setStatusChangeOptions(o => ({ ...o, updatePackages: !!v }))}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="block">
                          <span className="block text-sm font-medium text-foreground leading-tight">Actualizar paquetes a En Ruta</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">Marca los paquetes de esta factura como <em>on_route</em> en SP1 (con guardia anti-regresión).</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                        <Checkbox
                          id="status-opt-sync-sp2"
                          checked={statusChangeOptions.syncSp2}
                          onCheckedChange={(v) => setStatusChangeOptions(o => ({ ...o, syncSp2: !!v }))}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="block">
                          <span className="block text-sm font-medium text-foreground leading-tight">Sincronizar paquetes con SP2</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">Actualiza el estado de los paquetes en SmartWeb (SP2).</span>
                        </span>
                      </label>
                    </>
                  )}
                </span>
              </span>
            )}

            {/* Email Send Details */}
            {confirmAction?.type === "email" && (
              <span className="block space-y-4">
                <span className="block text-sm text-muted-foreground text-left">
                  Selecciona las acciones a ejecutar para <strong className="text-foreground">{confirmAction?.invoiceNumber}</strong>:
                </span>
                <span className="block divide-y divide-border rounded-lg border border-border overflow-hidden text-left">
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="opt-send-email"
                      checked={emailSendOptions.sendEmail}
                      onCheckedChange={(v) => setEmailSendOptions(o => ({ ...o, sendEmail: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Enviar email al cliente</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Envía la factura al correo del cliente.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="opt-update-pkgs"
                      checked={emailSendOptions.updatePackages}
                      onCheckedChange={(v) => setEmailSendOptions(o => ({ ...o, updatePackages: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Actualizar paquetes a Facturado</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Marca los paquetes de esta factura como <em>processed</em> en SP1.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="opt-sync-sp2"
                      checked={emailSendOptions.syncSp2}
                      onCheckedChange={(v) => setEmailSendOptions(o => ({ ...o, syncSp2: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Sincronizar con SP2</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Agrega la factura al historial del cliente en SmartWeb (SP2).</span>
                    </span>
                  </label>
                </span>
              </span>
            )}

            {confirmAction?.type === "pdf" && (
              <span className="block text-left">
                {t("confirmGeneratePDFDescription")} <strong>{confirmAction?.invoiceNumber}</strong>?
              </span>
            )}
            {confirmAction?.type === "sms" && (
              <span className="block text-left">
                {t("confirmSendSMSDescription")} <strong>{confirmAction?.invoiceNumber}</strong>?
              </span>
            )}
            {confirmAction?.type === "whatsapp" && (
              <span className="block text-left">
                {t("confirmOpenWhatsAppDescription")} <strong>{confirmAction?.invoiceNumber}</strong>?
              </span>
            )}

            {/* Annul Invoice Details */}
            {confirmAction?.type === "annul" && (
              <div className="space-y-4 block text-left">
                <div>
                  <span className="block text-sm font-medium text-foreground">
                    {t("confirmAnnulInvoiceDescription", { defaultValue: "Esta acción no se puede deshacer. ¿Está seguro de que desea anular la factura" })}{" "}
                    <strong className="font-mono text-primary font-bold">{confirmAction?.invoiceNumber}</strong>?
                  </span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    Seleccione el destino de los paquetes contenidos en esta factura:
                  </span>
                </div>

                {/* 2 Symmetrical Option Cards (Fixed equal height, zero layout shift) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Option A — Consolidation */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setAnnulMode("consolidation")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setAnnulMode("consolidation"); }}
                    className={cn(
                      "cursor-pointer text-left rounded-xl border-2 p-4 transition-all flex flex-col justify-between select-none min-h-[96px]",
                      annulMode === "consolidation"
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/20",
                    )}
                    data-testid="annul-mode-consolidation-btn"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/60 flex items-center justify-center shrink-0">
                          <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        </div>
                        <span className="text-sm font-bold text-foreground">
                          Mover a Consolidación
                        </span>
                      </div>
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                        annulMode === "consolidation" ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {annulMode === "consolidation" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-snug">
                      Los paquetes quedan en el casillero del cliente en <strong>Consolidación Transitoria</strong>.
                    </p>
                  </div>

                  {/* Option B — Assign to manifest */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setAnnulMode("manifest")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setAnnulMode("manifest"); }}
                    className={cn(
                      "cursor-pointer text-left rounded-xl border-2 p-4 transition-all flex flex-col justify-between select-none min-h-[96px]",
                      annulMode === "manifest"
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/20",
                    )}
                    data-testid="annul-mode-manifest-btn"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
                          <Route className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-bold text-foreground">
                          Asignar a otro Manifiesto
                        </span>
                      </div>
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                        annulMode === "manifest" ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {annulMode === "manifest" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-snug">
                      Los paquetes se transfieren al manifiesto y factura correspondiente.
                    </p>
                  </div>
                </div>

                {/* Contextual Configuration Area (Dedicated container, zero layout shift) */}
                <div className="rounded-xl border border-border bg-muted/25 p-4 min-h-[84px] flex flex-col justify-center">
                  {annulMode === "consolidation" ? (
                    (customerConsolidationEnabledSP1 === false || customerConsolidationEnabledSP2 === false) ? (
                      <div className="flex items-start gap-2.5 text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1.5 flex-1">
                          <p className="font-semibold text-amber-900 dark:text-amber-200">
                            Consolidación inactiva para este cliente
                          </p>
                          <label className="flex items-center gap-2 cursor-pointer text-amber-950 dark:text-amber-100 bg-amber-100/60 hover:bg-amber-100/90 dark:bg-amber-950/60 p-2 rounded-md transition-colors border border-amber-200/50">
                            <Checkbox
                              id="auto-enable-consolidation-chk"
                              checked={autoEnableConsolidation}
                              onCheckedChange={(checked) => setAutoEnableConsolidation?.(checked === true)}
                              className="border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white shrink-0"
                            />
                            <span className="leading-tight text-xs font-medium select-none">
                              Activar la consolidación automáticamente para este cliente en ambos portales.
                            </span>
                          </label>
                        </div>
                      </div>
                    ) : customerConsolidationEnabledSP1 === null ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        <span>Verificando estado de casillero del cliente...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>La factura quedará <strong>anulada</strong> y los paquetes pasarán a <strong>Consolidación Transitoria</strong> en el casillero del cliente.</span>
                      </div>
                    )
                  ) : (
                    /* Manifest mode configuration */
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 justify-between">
                        {confirmAction?.data?.manifestNumber && (
                          <div className="flex items-center gap-1.5 text-xs bg-background/80 border rounded-md px-2.5 py-1.5 shrink-0">
                            <PackageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">Manifiesto Origen:</span>
                            <code className="font-mono text-foreground font-bold">{confirmAction.data.manifestNumber}</code>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-semibold text-foreground shrink-0">
                            Destino:
                          </span>
                          <div className="flex-1 min-w-[240px]">
                            <ManifestPicker
                              allManifestNumbers={(allManifestNumbers || []).filter(m => m !== confirmAction?.data?.manifestNumber)}
                              selectedManifests={annulSelectedManifest ? new Set([annulSelectedManifest.manifestNumber]) : new Set()}
                              onManifestsChange={(set) => {
                                const selected = Array.from(set)[0];
                                if (selected) {
                                  setAnnulSelectedManifest({ docId: selected, manifestNumber: selected });
                                } else {
                                  setAnnulSelectedManifest(null);
                                }
                              }}
                              manifestPackageCounts={manifestPackageCounts}
                              singleSelect={true}
                              allLabel="Seleccione manifiesto destino..."
                              align="start"
                              triggerClassName="w-full justify-between h-9 px-3 bg-background border-border text-xs"
                              id="annul-manifest-picker"
                            />
                          </div>
                        </div>
                      </div>

                      {annulSelectedManifest && (
                        <div className="bg-blue-50/80 dark:bg-blue-950/40 p-2.5 rounded-lg border border-blue-200 dark:border-blue-900 flex items-start gap-2 animate-in fade-in duration-150">
                          <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <span className="text-xs leading-snug text-blue-800 dark:text-blue-300">
                            Esta factura quedará <strong>anulada</strong> y sus paquetes se transferirán al manifiesto <strong>{annulSelectedManifest.manifestNumber}</strong> (asociándose a la factura de dicho manifiesto).
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delete Invoice Details */}
            {confirmAction?.type === "delete" && (
              <span className="block space-y-3 text-left">
                <span className="block">{t("confirmDeleteDescription", { invoiceNumber: confirmAction?.invoiceNumber })}</span>
                <span className="block text-sm font-medium text-foreground">La factura pasará a la papelera y podrá ser restaurada.</span>
                <span className="block text-xs text-muted-foreground mt-1">Para confirmar, escribe o pega el número de la factura:</span>
                <span className="flex items-center gap-1.5">
                  <code className="flex-1 text-sm font-mono font-bold text-foreground bg-muted/40 rounded px-2 py-1 select-all break-all text-center">
                    {confirmAction?.invoiceNumber}
                  </code>
                  <button
                    type="button"
                    onClick={copyInvoiceNumberToClipboard}
                    className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md border border-border bg-background hover:bg-muted transition-colors"
                    aria-label="Copiar número de factura al portapapeles"
                    title={copiedInvoiceNumber ? "Copiado" : "Copiar al portapapeles"}
                  >
                    {copiedInvoiceNumber ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </span>
                <Input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={confirmAction?.invoiceNumber}
                  className="font-mono text-sm h-9"
                  autoFocus
                  aria-label="Confirmar número de factura para eliminar"
                  data-testid="delete-confirm-input"
                />
              </span>
            )}

            {confirmAction?.type === "bulk-delete" && (
              <span className="block text-left">
                ¿Está seguro de que desea enviar <strong>{confirmAction?.data?.count}</strong> factura(s) a la papelera? Podrán recuperarse desde Papelera de Facturas.
              </span>
            )}

            {/* Bulk Email Details */}
            {confirmAction?.type === "bulk-email" && (
              <span className="block space-y-4">
                <span className="block text-sm text-muted-foreground text-left">
                  Selecciona las acciones a ejecutar para <strong className="text-foreground">{confirmAction?.data?.count}</strong> factura(s):
                </span>
                <span className="block divide-y divide-border rounded-lg border border-border overflow-hidden text-left">
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="bulk-opt-send-email"
                      checked={emailSendOptions.sendEmail}
                      onCheckedChange={(v) => setEmailSendOptions(o => ({ ...o, sendEmail: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Enviar email a cada cliente</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Envía la factura al correo de cada cliente seleccionado.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="bulk-opt-update-pkgs"
                      checked={emailSendOptions.updatePackages}
                      onCheckedChange={(v) => setEmailSendOptions(o => ({ ...o, updatePackages: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Actualizar paquetes a Facturado</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Marca los paquetes de cada factura como <em>processed</em> en SP1.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="bulk-opt-sync-sp2"
                      checked={emailSendOptions.syncSp2}
                      onCheckedChange={(v) => setEmailSendOptions(o => ({ ...o, syncSp2: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Sincronizar con SP2</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Agrega cada factura al historial del cliente en SmartWeb (SP2).</span>
                    </span>
                  </label>
                </span>
              </span>
            )}

            {confirmAction?.type === "bulk-strip" && (
              <span className="block text-left">
                Se restaurará el peso real (sin redondeo) en los items de <strong>{confirmAction?.data?.count}</strong> factura(s). Los totales de peso se recalcularán. ¿Continuar?
              </span>
            )}
            {confirmAction?.type === "bulk-merge" && (
              <span className="block text-left">
                Se combinarán <strong>{confirmAction?.data?.count}</strong> facturas en una nueva. Las facturas originales se eliminarán. Esta acción no se puede deshacer. ¿Continuar?
              </span>
            )}
            {confirmAction?.type === "bulk-sync" && (
              <span className="block text-sm text-muted-foreground text-left">
                Se sincronizarán <strong className="text-foreground">{confirmAction?.data?.count}</strong> factura(s) con SmartWeb (SP2) y los paquetes vinculados se marcarán como <em>Facturado</em> en SP1.
              </span>
            )}

            {/* Bulk Status Details */}
            {confirmAction?.type === "bulk-status" && (
              <span className="block space-y-4">
                {confirmAction?.data?.annulledCount > 0 && (
                  <span className="flex items-start gap-3 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-left">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                    <span className="block text-xs space-y-1">
                      <span className="block font-bold text-sm text-red-700 dark:text-red-300">
                        Atención: {confirmAction.data.annulledCount} factura(s) en estado Anulada/Cancelada detectada(s)
                      </span>
                      <span className="block opacity-90 leading-normal">
                        Las facturas anuladas o canceladas se <strong>omitirán por defecto</strong> para prevenir descalces en consolidación transitoria y mantener los metadatos de ruta intactos.
                      </span>
                    </span>
                  </span>
                )}
                <span className="block text-sm text-muted-foreground text-left">
                  Se ejecutará el siguiente flujo para <strong className="text-foreground">{confirmAction?.data?.count}</strong> factura(s):
                </span>
                <span className="block divide-y divide-border rounded-lg border border-border overflow-hidden text-left">
                  <span className="flex items-start gap-3 px-4 py-3 bg-muted/20">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-2 border-primary bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                    </span>
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Cambiar estado de las facturas</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {confirmAction?.data?.count} factura(s) → <Badge variant="outline" className="text-[10px] mx-0.5">{confirmAction?.data?.newStatus}</Badge>
                      </span>
                    </span>
                  </span>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      id="bulk-status-opt-sync-sp2"
                      checked={bulkStatusOptions.syncSp2}
                      onCheckedChange={(v) => setBulkStatusOptions(o => ({ ...o, syncSp2: !!v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="block">
                      <span className="block text-sm font-medium text-foreground leading-tight">Sincronizar estado con SP2</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Actualiza el estado de cada factura en SmartWeb (SP2).</span>
                    </span>
                  </label>
                  {confirmAction?.data?.newStatus === "paid" && (
                    <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                      <Checkbox
                        id="bulk-status-opt-update-pkgs"
                        checked={bulkStatusOptions.updatePackages}
                        onCheckedChange={(v) => setBulkStatusOptions(o => ({ ...o, updatePackages: !!v }))}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="block">
                        <span className="block text-sm font-medium text-foreground leading-tight">Actualizar paquetes a En Ruta</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">Marca los paquetes de cada factura como <em>on_route</em> en SP1 y sincroniza con SP2.</span>
                      </span>
                    </label>
                  )}
                  {confirmAction?.data?.annulledCount > 0 && (
                    <label className="flex items-start gap-3 px-4 py-3 cursor-pointer bg-red-500/5 hover:bg-red-500/10 transition-colors">
                      <Checkbox
                        id="bulk-status-opt-include-annulled"
                        checked={!!bulkStatusOptions.includeAnnulled}
                        onCheckedChange={(v) => setBulkStatusOptions(o => ({ ...o, includeAnnulled: !!v }))}
                        className="mt-0.5 shrink-0 border-red-500/50 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        data-testid="include-annulled-checkbox"
                      />
                      <span className="block">
                        <span className="block text-sm font-semibold text-red-700 dark:text-red-400 leading-tight">
                          Forzar actualización en facturas anuladas/canceladas
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Desmarcado por defecto para omitirlas. Marque esta casilla únicamente si desea forzar el cambio de estado a todas las {confirmAction?.data?.annulledCount} factura(s) anuladas.
                        </span>
                      </span>
                    </label>
                  )}
                </span>
              </span>
            )}

            {/* Double-confirmation checkbox for all bulk actions */}
            {confirmAction?.type?.startsWith("bulk-") && (
              <span className="block pt-3 mt-3 border-t border-border text-left">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <Checkbox
                    id="bulk-final-confirm"
                    checked={bulkActionConfirmed}
                    onCheckedChange={(v) => setBulkActionConfirmed(!!v)}
                    className="shrink-0"
                    data-testid="bulk-final-confirm-checkbox"
                  />
                  <span className="text-xs font-medium text-foreground">
                    Confirmo que deseo ejecutar esta acción sobre{" "}
                    <strong>{confirmAction?.data?.count}</strong> factura(s)
                  </span>
                </label>
              </span>
            )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} data-testid="confirmation-cancel-btn">{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={
              (confirmAction?.type === "annul" && annulMode === "manifest" && !annulSelectedManifest) ||
              (confirmAction?.type === "delete" && deleteConfirmText !== confirmAction?.invoiceNumber) ||
              (confirmAction?.type?.startsWith("bulk-") && !bulkActionConfirmed)
            }
            className={cn(
              "font-medium",
              (confirmAction?.type === "annul" || confirmAction?.type === "delete" || confirmAction?.type === "bulk-delete")
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            )}
            data-testid="confirmation-confirm-btn"
          >
            {confirmAction?.type === "delete" || confirmAction?.type === "bulk-delete"
              ? t("delete")
              : confirmAction?.type === "bulk-email"
              ? "Enviar"
              : t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
