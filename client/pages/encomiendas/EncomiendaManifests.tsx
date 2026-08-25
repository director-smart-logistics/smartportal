/**
 * EncomiendaManifests — Logística › Encomiendas
 *
 * Displays all manifests that contain encomienda packages (ruta = Encomiendas),
 * saved to the `manifest_encomiendas` Firestore collection by Nova on ingest.
 *
 * Features:
 *  - Real-time subscription via onSnapshot
 *  - Grouped by manifest, then by customer
 *  - Shipping-label generator (NovaShippingLabelModal)
 *  - Third-party service cost per tracking (persisted to Firestore)
 *  - One-click "Agregar a factura" to append a cost line-item to the matching invoice
 */

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  PackagePlus,
  ChevronDown,
  ChevronRight,
  Search,
  Tag,
  UserPlus,
  DollarSign,
  FileText,
  Loader2,
  CheckCircle,
  RefreshCw,
  Printer,
  X,
  ArrowLeftRight,
  Edit2,
  Plus,
  Trash2,
  Save,
  ReceiptText,
  AlertTriangle,
  Check,
  Mail,
  ShieldCheck,
  Sparkles,
  Scale,
  Copy,
  MapPin
} from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { useAudit } from "@/hooks/use-audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  subscribeAllEncomiendaManifests,
  getPackagesForEncomiendas,
  updateEncomiendaThirdPartyCost,
  markEncomiendaInvoiceUpdated,
  syncManifestEncomiendaFromPackages,
  syncAllEncomiendaPackages,
  createOrGetTempCustomer,
  fuseFirestoreManifests,
  type EncomiendaManifestRow,
  type TempCustomerRecord,
} from "@/lib/services/manifest-processor";
import {
  buildInvoiceEmailPayload,
  sendTestInvoiceEmail,
  recordInvoiceEmailSent,
  type InvoiceRecord,
} from "@/lib/services/invoice-service";
import { syncInvoicePackagesToSp2, syncInvoicesToSp2, deleteInvoiceFromSp2 } from "@/lib/services/sync-invoices-service";
import { syncPackagesToSmartWeb } from "@/lib/services/sync-smartweb-service";
import { findInvoiceForPackage, auditAndSyncInvoices } from "@/lib/services/encomienda-invoice-sync";
import { BulkManifestWizardModal, type WizardPackage } from "@/components/manifest/BulkManifestWizardModal";
import {
  subscribeEncomiendas,
  type Encomienda,
} from "@/lib/services/encomienda-service";
import {
  NovaShippingLabelModal,
  type NovaShippingLabelData,
} from "@/components/nova/NovaShippingLabelModal";
import { EncomiendaBulkLabelModal } from "@/components/nova/EncomiendaBulkLabelModal";
import { EncomiendaBulkInvoiceSendModal } from "@/components/nova/EncomiendaBulkInvoiceSendModal";
import { NovaInvoicePreview } from "@/components/nova/NovaInvoicePreview";
import { firebaseApi } from "@/lib/firebase/callable";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  onSnapshot,
  arrayUnion,
  addDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
  documentId,
  runTransaction,
} from "firebase/firestore";
import {
  buildEncomiendaServiceManifestHTML,
  type EncomiendaServiceManifestRow,
} from "@/lib/utils/nova-print";
import { db } from "@/lib/firebase/config";
import {
  getCustomerServiceSuggestion,
  getBulkServiceSuggestions,
  type ServiceSuggestion,
} from "@/lib/services/encomienda-suggestions";
import { EncomiendaFilters } from "./EncomiendaFilters";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerInfo {
  phone?: string;
  encomiendaName?: string;
  encomiendaPhone?: string;
  encomiendaAddress?: string;
}

// Human-readable labels for live statuses from the packages collection
const LIVE_STATUS_LABELS: Record<string, string> = {
  customs:      "En Aduanas",
  transit:      "En Tránsito",
  received:     "Recibido",
  route:        "En Ruta",
  on_route:     "En Ruta",
  in_route:     "En Ruta",
  delivered:    "Entregado",
  processed:    "Facturado",
  held:         "Retenido",
  returned:     "Devuelto",
  consolidated: "Consolidado",
  "pre-alerted":"Pre-Alertado",
  pickup:       "Retira en Oficina",
};

// Human-readable labels for live statuses from the packages collection

const STATUS_COLORS: Record<string, string> = {
  customs:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  transit:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  received:  "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  route:     "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  on_route:  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  in_route:  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  processed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  held:      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  returned:  "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

interface ThirdCostState {
  cost: string;
  description: string;
  saving: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-CR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Costa_Rica",
    });
  } catch {
    return iso;
  }
}

// ─── WhatsApp icon (inline SVG — Lucide does not include WA) ────────────────────

/** Always return the most recently created invoice document — prevents stale/older invoices
 * from being matched when a customer has more than one invoice in Firestore. */
const newestInvoiceDoc = (docs: any[]): any =>
  docs.slice().sort((a: any, b: any) => (b.data().createdAt?.seconds ?? 0) - (a.data().createdAt?.seconds ?? 0))[0];

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

interface LiveInvoiceContextType {
  liveInvoiceByTracking: Map<string, any>;
  liveInvoiceByCustomerManifest: Map<string, any>;
  onMutationSuccess: () => void;
}
const LiveInvoiceContext = createContext<LiveInvoiceContextType | null>(null);

// ─── Invoice editor modal ─────────────────────────────────────────────────────

const INVOICE_STATUSES = [
  { value: "draft",     label: "Borrador" },
  { value: "sent",      label: "Enviada" },
  { value: "pending",   label: "Pendiente" },
  { value: "paid",      label: "Pagada" },
  { value: "overdue",   label: "Vencida" },
  { value: "cancelled", label: "Cancelada" },
];

interface EditableItem {
  trackingNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number;
  isManual: boolean;
}

function EncomiendaInvoiceEditorModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const { toast } = useToast();
  const rawItems: EditableItem[] = (invoice.invoiceItems || invoice.items || []).map((i: any) => ({
    trackingNumber: i.trackingNumber || i.tracking || "",
    description: i.description || "",
    quantity: Number(i.quantity ?? 1),
    unitPrice: Number(i.unitPrice ?? i.amount ?? 0),
    totalPrice: Number(i.totalPrice ?? i.amount ?? 0),
    weight: Number(i.weight ?? 0),
    isManual: i.isManual ?? false,
  }));

  const [items, setItems] = useState<EditableItem[]>(rawItems);
  const [status, setStatus] = useState<string>(invoice.status || "draft");
  const [notes, setNotes] = useState<string>(invoice.notes || "");
  const [ivaEnabled, setIvaEnabled] = useState<boolean>(invoice.ivaEnabled ?? false);
  const [saving, setSaving] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  const total = items.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
  const subtotal = ivaEnabled ? Math.round(total / 1.13 * 100) / 100 : total;
  const tax = ivaEnabled ? Math.round((total - subtotal) * 100) / 100 : 0;

  const handleSuggestService = async () => {
    if (!invoice.slCode || loadingSuggestion) return;
    setLoadingSuggestion(true);
    try {
      const customerName = invoice.clientName || invoice.customer?.fullName || "";
      const suggestion = await getCustomerServiceSuggestion(invoice.slCode, customerName);
      if (!suggestion) {
        toast({ title: "Sin historial", description: "No hay suficiente historial de servicios para este cliente.", variant: "default" });
        return;
      }
      setItems(prev => [...prev, {
        trackingNumber: "",
        description: suggestion.description,
        quantity: 1,
        unitPrice: suggestion.amount,
        totalPrice: suggestion.amount,
        weight: 0,
        isManual: true,
      }]);
      
      const sourceLabel = suggestion.aiEnhanced
        ? `IA · ${suggestion.occurrences} facturas anteriores`
        : `${suggestion.occurrences} facturas anteriores`;
        
      toast({
        title: "Servicio sugerido cargado",
        description: `${suggestion.description} — $${suggestion.amount.toFixed(2)} (${sourceLabel}). Haz clic en Guardar.`,
      });
    } catch (err) {
      toast({ title: "Error al sugerir servicio", description: String(err), variant: "destructive" });
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const updateItem = (idx: number, field: keyof EditableItem, value: string | number | boolean) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "unitPrice" || field === "quantity") {
        updated.totalPrice = Math.round(Number(updated.unitPrice) * Number(updated.quantity) * 100) / 100;
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const addItem = () => setItems(prev => [...prev, {
    trackingNumber: "",
    description: "Servicio adicional",
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    weight: 0,
    isManual: true,
  }]);

  const handleSave = async () => {
    if (!invoice.id) return;
    setSaving(true);
    try {
      const updatedItems = items.map(i => ({ ...i }));
      const rate = Number(invoice.exchangeRate ?? 0);
      const totalCRC = rate > 0 ? Math.round(total * rate) : 0;
      const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
      const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

      await updateDoc(doc(db, "invoices", invoice.id), {
        invoiceItems: updatedItems,
        items: updatedItems,
        status,
        notes,
        ivaEnabled,
        totalAmount: total,
        subtotalAmount: subtotal,
        taxAmount: tax,
        amount: total,
        subtotal,
        iva: tax,
        totalCRC,
        amountCRC: totalCRC,
        subtotalCRC,
        ivaCRC,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: "Factura actualizada", description: invoice.invoiceNumber });
      onSaved({ 
        ...invoice, 
        invoiceItems: updatedItems, 
        items: updatedItems,
        status, 
        notes, 
        ivaEnabled,
        totalAmount: total,
        subtotalAmount: subtotal,
        taxAmount: tax,
        amount: total,
        subtotal,
        iva: tax,
        totalCRC,
        amountCRC: totalCRC,
        subtotalCRC,
        ivaCRC,
      });
    } catch (err) {
      toast({ title: "Error al guardar", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="h-4 w-4 text-emerald-600" />
            Factura {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Status + IVA row */}
        <div className="flex flex-wrap items-center gap-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Estado:</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 text-xs w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={ivaEnabled}
              onChange={e => setIvaEnabled(e.target.checked)}
              className="rounded"
            />
            IVA 13%
          </label>
          <span className="text-xs text-muted-foreground ml-auto">
            Cliente: <strong>{invoice.clientName?.toUpperCase() || invoice.customer?.fullName?.toUpperCase() || "—"}</strong>
            {invoice.slCode && (
              <span className="ml-1 font-mono text-[10px] bg-muted px-1 py-0.5 rounded">
                {invoice.slCode}
              </span>
            )}
          </span>
        </div>

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-32">
                  Tracking
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Descripción
                </th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-16">
                  Cant.
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">
                  Precio Unit.
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">
                  Total
                </th>
                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-16">
                  Peso kg
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-2 py-1.5">
                    <Input
                      value={item.trackingNumber}
                      onChange={e => updateItem(idx, "trackingNumber", e.target.value)}
                      className="h-6 text-xs font-mono w-28"
                      placeholder="Tracking"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={item.description}
                      onChange={e => updateItem(idx, "description", e.target.value)}
                      className="h-6 text-xs w-full"
                      placeholder="Descripción"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                      className="h-6 text-xs text-center w-14"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))}
                      className="h-6 text-xs text-right w-20 tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-foreground">
                    {fmt$(item.totalPrice)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.weight}
                      onChange={e => updateItem(idx, "weight", Number(e.target.value))}
                      className="h-6 text-xs text-center w-14 tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                      title="Eliminar item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add item / Suggest button */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs gap-1.5 w-fit"
            onClick={addItem}
          >
            <Plus className="h-3 w-3" />
            Agregar item
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs gap-1.5 w-fit text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
            onClick={handleSuggestService}
            disabled={loadingSuggestion || !invoice.slCode}
            title={!invoice.slCode ? "El cliente no tiene un código asignado" : "Sugerir costo con IA basado en historial"}
          >
            {loadingSuggestion ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            AI Sugerir
          </Button>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notas</label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="text-xs resize-none"
            placeholder="Notas adicionales..."
          />
        </div>

        {/* Totals + save */}
        <div className="flex items-end justify-between gap-4 pt-2 border-t border-border">
          <div className="text-xs space-y-0.5 text-muted-foreground">
            {ivaEnabled && (
              <>
                <div className="flex gap-3">
                  <span>Subtotal:</span>
                  <span className="tabular-nums font-medium text-foreground">{fmt$(subtotal)}</span>
                </div>
                <div className="flex gap-3">
                  <span>IVA (13%):</span>
                  <span className="tabular-nums font-medium text-foreground">{fmt$(tax)}</span>
                </div>
              </>
            )}
            <div className="flex gap-3 text-sm font-semibold text-foreground">
              <span>Total:</span>
              <span className="tabular-nums">{fmt$(total)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} className="h-8 px-3 text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 px-4 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

interface PackageRowProps {
  row: EncomiendaManifestRow;
  onOpenLabel: (data: NovaShippingLabelData) => void;
  onOpenInvoice: (invoice: any) => void;
  onInvoiceUpdated?: () => void;
  readOnly?: boolean;
  invoiceStatus?: string;
  invoiceItem?: any;
  onMoveToTransitoria?: (target: { type: 'single'; id: string; packages: EncomiendaManifestRow[] }) => void;
  index?: number;
  encomiendaName?: string;
}

function PackageRow({
  row,
  onOpenLabel,
  readOnly = false,
  invoiceStatus,
  invoiceItem,
  onMoveToTransitoria,
  index,
  encomiendaName,
}: PackageRowProps) {
  const { toast } = useToast();
  const effectiveStatus = row.status || '';
  const effectiveLabel = row.statusLabel || (row.status ? (LIVE_STATUS_LABELS[row.status] || row.status) : '');
  
  const isDispatched = ['route', 'on_route', 'in_route', 'on_rute', 'on-route', 'in-route', 'delivered', 'dispatched'].includes(effectiveStatus.toLowerCase());
  const hasDiscrepancy = isDispatched && invoiceStatus === 'draft';

  return (
    <div className="flex flex-row items-center justify-between gap-3 py-2 px-1 sm:px-2 hover:bg-muted/40 transition-colors group border-b border-border/40 last:border-0">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {typeof index === 'number' && (
            <span className="text-[10px] font-bold text-muted-foreground/80 bg-muted border border-border/50 rounded px-1.5 py-0.5 select-none min-w-[20px] text-center">
              {index + 1}
            </span>
          )}
          <span className="text-sm font-mono font-bold text-foreground">{row.tracking}</span>
          
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(row.tracking);
              toast({ title: "Copiado", description: `Tracking ${row.tracking} copiado al portapapeles.`, duration: 1500 });
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
            title="Copiar tracking"
          >
            <Copy className="h-3 w-3" />
          </button>

          <span className="text-xs text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/20" title="Peso (kg)">
            {invoiceItem?.realWeight ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {invoiceItem.realWeight} kg
              </span>
            ) : (
              `${row.weight} kg`
            )}
          </span>

          <div className="flex items-center gap-1.5 flex-wrap">
            {effectiveStatus ? (
              <span className={cn(
                "inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full",
                STATUS_COLORS[effectiveStatus] ?? "bg-muted text-muted-foreground"
              )}>
                {effectiveLabel}
              </span>
            ) : null}
            {hasDiscrepancy && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-4 w-4 text-amber-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Paquete {effectiveLabel.toLowerCase()} pero la factura sigue en borrador.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center shrink-0">
        <div className="w-[60px] text-right">
          <span className="font-semibold text-sm text-foreground">
            {fmt$(row.price)}
          </span>
        </div>
        {/* Generar Etiqueta hidden in mobile as requested */}
        {!readOnly && (
          <div className="hidden sm:flex justify-end">
            <div className="flex items-center gap-1 border-l border-border/60 pl-3 ml-3">
              {onMoveToTransitoria && (
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  onClick={() => onMoveToTransitoria({ type: 'single', id: row.tracking, packages: [row] })}
                  title="Mover a Consolidación Transitoria"
                >
                  <PackagePlus className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground bg-background"
                onClick={() => onOpenLabel({ 
                  slCode: row.slCode, 
                  clientName: row.customerName, 
                  trackings: [row.tracking], 
                  ruta: row.ruta,
                  encomiendaName: encomiendaName || "" 
                })}
                title="Generar etiqueta"
              >
                <Tag className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Customer group ─────────────────────────────────────────────────────────

interface CustomerGroupProps {
  slCode: string;
  customerName: string;
  rows: EncomiendaManifestRow[];
  onOpenLabel: (data: NovaShippingLabelData) => void;
  onOpenInvoice: (invoice: any) => void;
  forceOpen?: boolean | null;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  encomiendas: Encomienda[];
  /** When set, only render this group if its service matches */
  serviceFilter?: string;
  /** Fired once Firestore resolves this customer's encomienda service name */
  onServiceLoaded?: (slCode: string, serviceName: string) => void;
  /** When set, only show groups whose invoice status matches */
  invoiceStatusFilter?: 'all' | 'pending' | 'sent';
  /** When true, renders rows read-only (no invoice actions) */
  readOnly?: boolean;
  onMoveToTransitoria?: (target: { type: 'single' | 'group' | 'manifest'; id: string; packages: EncomiendaManifestRow[] }) => void;
}

function CustomerGroup({
  slCode,
  customerName,
  rows,
  onOpenLabel,
  onOpenInvoice,
  forceOpen,
  isSelected,
  onToggleSelect,
  encomiendas,
  serviceFilter,
  onServiceLoaded,
  invoiceStatusFilter,
  readOnly = false,
  onMoveToTransitoria,
}: CustomerGroupProps) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (forceOpen !== null && forceOpen !== undefined) setOpen(forceOpen);
  }, [forceOpen]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [encPickerOpen, setEncPickerOpen] = useState(false);
  const [pendingEnc, setPendingEnc] = useState<Encomienda | null>(null);
  const [assigningEnc, setAssigningEnc] = useState(false);
  const { toast } = useToast();
  const [globalDesc, setGlobalDesc] = useState("SERVICIO DE TERCERO");
  const [globalCost, setGlobalCost] = useState("");
  const [globalCurrency, setGlobalCurrency] = useState<'USD' | 'CRC'>('USD');
  const [globalSaving, setGlobalSaving] = useState(false);
  const [lookingInvoice, setLookingInvoice] = useState(false);

  // ── Temp customer creation state ────────────────────────────────────────────
  const [tempDialogOpen, setTempDialogOpen]       = useState(false);
  const [pendingEncForTemp, setPendingEncForTemp] = useState<Encomienda | null>(null);
  const [creatingTemp, setCreatingTemp]           = useState(false);
  const [tempRecord, setTempRecord]               = useState<TempCustomerRecord | null>(null);
  const [itemEdits, setItemEdits] = useState<Record<string, { description: string; amount: string; saving: boolean }>>({});

  const context = useContext(LiveInvoiceContext);
  if (!context) throw new Error("CustomerGroup must be used within LiveInvoiceProvider");
  const { liveInvoiceByTracking, liveInvoiceByCustomerManifest, onMutationSuccess } = context;

  const manifestNumber = rows[0]?.manifestNumber || '';
  const firstTracking = rows[0]?.tracking;

  const invoiceFromMap = useMemo(() => {
    if (!slCode || slCode.startsWith('__')) {
      if (firstTracking) {
        return liveInvoiceByTracking.get(firstTracking.toUpperCase());
      }
      return null;
    }
    const key = `${slCode}_${manifestNumber}`;
    return liveInvoiceByCustomerManifest.get(key) || (firstTracking ? liveInvoiceByTracking.get(firstTracking.toUpperCase()) : null);
  }, [slCode, manifestNumber, firstTracking, liveInvoiceByCustomerManifest, liveInvoiceByTracking]);

  const liveManualItems = useMemo(() => {
    const items = invoiceFromMap?.invoiceItems ?? invoiceFromMap?.items ?? [];
    return items.filter((i: any) => i.isManual).map((i: any) => ({
      description: i.description,
      amount: Number(i.totalPrice ?? i.unitPrice ?? 0),
      _descKey: i.descKey ?? i.description,
      trackingRef: i.trackingRef ?? '',
    }));
  }, [invoiceFromMap]);

  const handleOpenInvoiceForSend = useCallback(async () => {
    if (invoiceFromMap) { onOpenInvoice(invoiceFromMap); return; }
    if (!rows.length) return;
    setLookingInvoice(true);
    // Build a map of tracking → real weight from the manifest rows
    const rowWeightMap = new Map(rows.map(r => [r.tracking.toUpperCase(), r.weight]));
    const patchRealW = (arr: any[]) => arr.map((item: any) => {
      const tn = (item.trackingNumber || item.tracking || '').toUpperCase();
      const rw = tn ? rowWeightMap.get(tn) : undefined;
      return rw != null ? { ...item, realWeight: rw } : item;
    });
    const withRealWeights = (raw: any) => ({
      ...raw,
      ...(Array.isArray(raw.invoiceItems) ? { invoiceItems: patchRealW(raw.invoiceItems) } : {}),
      ...(Array.isArray(raw.items)        ? { items:        patchRealW(raw.items)        } : {}),
    });
    try {
      const firstTracking = rows[0].tracking;
      const invoiceDoc = await findInvoiceForPackage(firstTracking, slCode && !slCode.startsWith('__') ? slCode : undefined);
      if (!invoiceDoc) {
        toast({ title: 'Sin factura', description: 'No se encontró factura para este cliente/paquete.', variant: 'destructive' });
        return;
      }
      const inv = withRealWeights({ id: invoiceDoc.id, ...invoiceDoc.data() });
      onOpenInvoice(inv);
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    } finally {
      setLookingInvoice(false);
    }
  }, [invoiceFromMap, rows, slCode, onOpenInvoice, toast]);


  const handleCreateTempAndAssign = useCallback(async () => {
    if (creatingTemp) return;
    setCreatingTemp(true);
    try {
      // 1. Create (or retrieve) temp customer record
      const record = await createOrGetTempCustomer(customerName, slCode, 'encomiendas_manifests');
      setTempRecord(record);

      // 2. Batch-update manifest_encomiendas + packages to new slCode (triggers real-time regroup)
      const batch = writeBatch(db);
      for (const row of rows) {
        const id = row.tracking.toUpperCase();
        batch.update(doc(db, 'manifest_encomiendas', id), { slCode: record.slCode, customerName });
        batch.update(doc(db, 'packages',             id), { slCode: record.slCode });
      }
      await batch.commit();

      // 3. Update any linked invoices to the new slCode
      const seen = new Set<string>();
      for (const row of rows) {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains', row.tracking))),
          getDocs(query(collection(db, 'invoices'), where('trackingNumber', '==', row.tracking))),
        ]);
        for (const d of [...s1.docs, ...s2.docs]) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          await updateDoc(doc(db, 'invoices', d.id), {
            customerId: record.slCode,
            slCode:     record.slCode,
          });
        }
      }
      // Also search by old slCode directly
      if (slCode) {
        const s3 = await getDocs(query(collection(db, 'invoices'), where('customerId', '==', slCode)));
        for (const d of s3.docs) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          await updateDoc(doc(db, 'invoices', d.id), { customerId: record.slCode, slCode: record.slCode });
        }
      }

      // 4. If an encomienda was pending, assign it to the new temp customer
      if (pendingEncForTemp) {
        const tempRef = doc(db, 'temp_customers', record.slCode);
        await setDoc(tempRef, {
          encomienda:     { id: pendingEncForTemp.id, name: pendingEncForTemp.name, phone: pendingEncForTemp.phone, pickupAddress: pendingEncForTemp.pickupAddress },
          courierService: pendingEncForTemp.name,
          updatedAt:      new Date().toISOString(),
        }, { merge: true });
      }

      toast({
        title: 'Cliente temporal creado',
        description: `${customerName} → ${record.slCode}${pendingEncForTemp ? ` · ${pendingEncForTemp.name} asignado` : ''}`,
      });
      onMutationSuccess();
    } catch (err) {
      console.error('[TempCustomer] creation error:', err);
      toast({ title: 'Error al crear cliente temporal', description: String(err), variant: 'destructive' });
    } finally {
      setCreatingTemp(false);
    }
  }, [creatingTemp, customerName, slCode, rows, pendingEncForTemp, toast, onMutationSuccess]);

  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // Apply a service item with explicit description + USD amount, bypassing the
  // controlled-input state so it can be called programmatically (e.g. from AI suggest).
  const applyServiceItem = useCallback(async (desc: string, amount: number) => {
    if (!rows.length) return;
    let invId = invoiceFromMap?.id;
    let invoiceRef;
    if (invId) {
      invoiceRef = doc(db, "invoices", invId);
    } else {
      const firstTracking = rows[0].tracking;
      const invoiceDoc = await findInvoiceForPackage(firstTracking, slCode && !slCode.startsWith('__') ? slCode : undefined);
      if (!invoiceDoc) {
        toast({ title: "Factura no encontrada", description: "No hay factura para aplicar el servicio sugerido.", variant: "destructive" });
        return;
      }
      invoiceRef = invoiceDoc.ref;
    }
    const cleanDesc = desc.trim() || "SERVICIO DE TERCERO";
    const newItem = {
      description: cleanDesc,
      trackingNumber: "",
      trackingRef: "",
      descKey: cleanDesc,
      quantity: 1,
      unitPrice: amount,
      totalPrice: amount,
      weight: 0,
      isManual: true,
    };
    await runTransaction(db, async (t) => {
      const snap = await t.get(invoiceRef);
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const existing: any[] = data?.invoiceItems ?? [];
      const kept = existing.filter((i: any) => !(i.isManual === true && !i.trackingRef && (i.descKey ?? '') === cleanDesc));
      const updated = [...kept, newItem];
      const total = updated.reduce((s: number, i: any) => s + (i.totalPrice ?? i.unitPrice ?? 0), 0);

      const ivaEnabled = !!data.ivaEnabled;
      const finalTotal = Math.round(total * 100) / 100;
      const finalSubtotal = ivaEnabled ? Math.round(finalTotal / 1.13 * 100) / 100 : finalTotal;
      const finalTax = ivaEnabled ? Math.round((finalTotal - finalSubtotal) * 100) / 100 : 0;

      const rate = Number(data.exchangeRate ?? 0);
      const totalCRC = rate > 0 ? Math.round(finalTotal * rate) : 0;
      const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
      const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

      t.update(invoiceRef, {
        invoiceItems: updated,
        items: updated,
        totalAmount: finalTotal,
        subtotalAmount: finalSubtotal,
        amount: finalTotal,
        subtotal: finalSubtotal,
        iva: finalTax,
        taxAmount: finalTax,
        totalCRC,
        amountCRC: totalCRC,
        subtotalCRC,
        ivaCRC,
        updatedAt: new Date().toISOString()
      });
    });
  }, [rows, slCode, toast, invoiceFromMap]);

  const handleSuggestService = useCallback(async () => {
    if (!slCode || loadingSuggestion) return;
    setLoadingSuggestion(true);
    try {
      const suggestion = await getCustomerServiceSuggestion(slCode, customerName);
      if (!suggestion) {
        toast({ title: "Sin historial", description: "No hay suficiente historial de servicios para este cliente.", variant: "default" });
        return;
      }
      await applyServiceItem(suggestion.description, suggestion.amount);
      const sourceLabel = suggestion.aiEnhanced
        ? `IA · ${suggestion.occurrences} facturas anteriores`
        : `${suggestion.occurrences} facturas anteriores`;
      toast({
        title: "Servicio sugerido aplicado",
        description: `${suggestion.description} — $${suggestion.amount.toFixed(2)} (${sourceLabel})`,
      });
      onMutationSuccess();
    } catch (err) {
      toast({ title: "Error al sugerir servicio", description: String(err), variant: "destructive" });
    } finally {
      setLoadingSuggestion(false);
    }
  }, [slCode, customerName, loadingSuggestion, applyServiceItem, toast, onMutationSuccess]);

  const handleAddGlobalItem = useCallback(async () => {
    const parsed = parseFloat(globalCost);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }
    if (!rows.length) return;
    setGlobalSaving(true);
    try {
      let invId = invoiceFromMap?.id;
      let invoiceRef;
      let exchangeRate = 0;
      let invoiceNumber = '';
      let currentData: any = null;

      if (invId) {
        invoiceRef = doc(db, "invoices", invId);
        currentData = invoiceFromMap;
        exchangeRate = invoiceFromMap.exchangeRate ?? 0;
        invoiceNumber = invoiceFromMap.invoiceNumber ?? invId;
      } else {
        const firstTracking = rows[0].tracking;
        const invoiceDoc = await findInvoiceForPackage(firstTracking, slCode && !slCode.startsWith('__') ? slCode : undefined);
        if (!invoiceDoc) {
          toast({ title: "Factura no encontrada", description: "No hay factura para este grupo de tracking.", variant: "destructive" });
          setGlobalSaving(false);
          return;
        }
        invoiceRef = invoiceDoc.ref;
        currentData = invoiceDoc.data();
        exchangeRate = currentData.exchangeRate ?? 0;
        invoiceNumber = currentData.invoiceNumber ?? invoiceDoc.id;
      }

      const tc = exchangeRate;
      if (globalCurrency === 'CRC' && tc === 0) {
        toast({ title: "TC no disponible", description: "No se puede convertir ₡ a USD. Ingresa el costo en USD o asegúrate que la factura tenga tipo de cambio.", variant: "destructive" });
        setGlobalSaving(false);
        return;
      }
      const parsedUSD = globalCurrency === 'CRC' && tc > 0
        ? Math.round(parsed / tc * 100) / 100
        : parsed;
      const desc = globalDesc.trim() || "SERVICIO DE TERCERO";
      const newItem = {
        description: desc + (globalCurrency === 'CRC' && tc > 0 ? ` (₡${parsed.toLocaleString()} TC:${tc})` : ''),
        trackingNumber: "",
        trackingRef: "",
        descKey: desc,
        quantity: 1,
        unitPrice: parsedUSD,
        totalPrice: parsedUSD,
        weight: 0,
        isManual: true,
      };
      await runTransaction(db, async (t) => {
        const gsnap = await t.get(invoiceRef);
        if (!gsnap.exists()) return;
        const data = gsnap.data() as any;
        const existingItems: any[] = data?.invoiceItems ?? [];
        const kept = existingItems.filter(
          (i: any) => !(i.isManual === true && !i.trackingRef && (i.descKey ?? '') === desc)
        );
        const updatedItems = [...kept, newItem];
        const gTotal = updatedItems.reduce((s: number, i: any) => s + (i.totalPrice ?? i.unitPrice ?? 0), 0);

        const ivaEnabled = !!data?.ivaEnabled;
        const finalTotal = Math.round(gTotal * 100) / 100;
        const finalSubtotal = ivaEnabled ? Math.round(finalTotal / 1.13 * 100) / 100 : finalTotal;
        const finalTax = ivaEnabled ? Math.round((finalTotal - finalSubtotal) * 100) / 100 : 0;

        const rate = Number(data?.exchangeRate ?? 0);
        const totalCRC = rate > 0 ? Math.round(finalTotal * rate) : 0;
        const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
        const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

        t.update(invoiceRef, {
          invoiceItems:   updatedItems,
          items:          updatedItems,
          totalAmount:    finalTotal,
          subtotalAmount: finalSubtotal,
          amount:         finalTotal,
          subtotal:       finalSubtotal,
          iva:            finalTax,
          taxAmount:      finalTax,
          totalCRC,
          amountCRC:      totalCRC,
          subtotalCRC,
          ivaCRC,
          updatedAt:      new Date().toISOString(),
        });
      });
      setGlobalCost("");
      setGlobalDesc("SERVICIO DE TERCERO");
      toast({ title: "Item agregado a factura", description: invoiceNumber });
      onMutationSuccess();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setGlobalSaving(false);
    }
  }, [globalDesc, globalCost, globalCurrency, rows, toast, invoiceFromMap, slCode, onMutationSuccess]);

  const handleSaveManualItem = useCallback(async (
    itemKey: string,
    item: { description: string; amount: number; _descKey: string; trackingRef: string },
  ) => {
    const invId = invoiceFromMap?.id;
    if (!invId) return;
    const edit = itemEdits[itemKey];
    if (!edit) return;
    const newDesc = edit.description.trim() || item.description;
    const newAmount = parseFloat(edit.amount);
    if (isNaN(newAmount) || newAmount < 0) {
      toast({ title: 'Monto inválido', variant: 'destructive' });
      return;
    }
    setItemEdits(prev => ({ ...prev, [itemKey]: { ...prev[itemKey], saving: true } }));
    try {
      const invSnap = await getDoc(doc(db, 'invoices', invId));
      if (!invSnap.exists()) return;
      const data = invSnap.data();
      const existing: any[] = data.invoiceItems ?? [];
      const updated = existing.map((i: any) => {
        const iKey = `${i.descKey ?? i.description}|${i.trackingRef ?? ''}`;
        return iKey === itemKey ? { ...i, description: newDesc, unitPrice: newAmount, totalPrice: newAmount } : i;
      });
      const newTotal = updated.reduce((s: number, i: any) => s + (i.totalPrice ?? i.unitPrice ?? 0), 0);

      const ivaEnabled = !!data.ivaEnabled;
      const finalTotal = Math.round(newTotal * 100) / 100;
      const finalSubtotal = ivaEnabled ? Math.round(finalTotal / 1.13 * 100) / 100 : finalTotal;
      const finalTax = ivaEnabled ? Math.round((finalTotal - finalSubtotal) * 100) / 100 : 0;

      const rate = Number(data.exchangeRate ?? 0);
      const totalCRC = rate > 0 ? Math.round(finalTotal * rate) : 0;
      const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
      const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

      await updateDoc(doc(db, 'invoices', invId), {
        invoiceItems: updated,
        items: updated,
        totalAmount: finalTotal,
        subtotalAmount: finalSubtotal,
        amount: finalTotal,
        subtotal: finalSubtotal,
        iva: finalTax,
        taxAmount: finalTax,
        totalCRC,
        amountCRC: totalCRC,
        subtotalCRC,
        ivaCRC,
      });
      setItemEdits(prev => { const n = { ...prev }; delete n[itemKey]; return n; });
      toast({ title: 'Item actualizado' });
      onMutationSuccess();
    } catch (err) {
      toast({ title: 'Error al guardar', description: String(err), variant: 'destructive' });
      setItemEdits(prev => ({ ...prev, [itemKey]: { ...prev[itemKey], saving: false } }));
    }
  }, [invoiceFromMap, itemEdits, toast, onMutationSuccess]);

  const handleDeleteManualItem = useCallback(async (
    item: { description: string; amount: number; _descKey: string; trackingRef: string },
  ) => {
    const invId = invoiceFromMap?.id;
    if (!invId) return;
    try {
      const invSnap = await getDoc(doc(db, 'invoices', invId));
      if (!invSnap.exists()) return;
      const data = invSnap.data();
      const itemKey = `${item._descKey}|${item.trackingRef}`;
      const existing: any[] = data.invoiceItems ?? [];
      const kept = existing.filter((i: any) => `${i.descKey ?? i.description}|${i.trackingRef ?? ''}` !== itemKey);
      const newTotal = kept.reduce((s: number, i: any) => s + (i.totalPrice ?? i.unitPrice ?? 0), 0);

      const ivaEnabled = !!data.ivaEnabled;
      const finalTotal = Math.round(newTotal * 100) / 100;
      const finalSubtotal = ivaEnabled ? Math.round(finalTotal / 1.13 * 100) / 100 : finalTotal;
      const finalTax = ivaEnabled ? Math.round((finalTotal - finalSubtotal) * 100) / 100 : 0;

      const rate = Number(data.exchangeRate ?? 0);
      const totalCRC = rate > 0 ? Math.round(finalTotal * rate) : 0;
      const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
      const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

      await updateDoc(doc(db, 'invoices', invId), {
        invoiceItems: kept,
        items: kept,
        totalAmount: finalTotal,
        subtotalAmount: finalSubtotal,
        amount: finalTotal,
        subtotal: finalSubtotal,
        iva: finalTax,
        taxAmount: finalTax,
        totalCRC,
        amountCRC: totalCRC,
        subtotalCRC,
        ivaCRC,
      });
      toast({ title: 'Item eliminado' });
      onMutationSuccess();
    } catch (err) {
      toast({ title: 'Error al eliminar', description: String(err), variant: 'destructive' });
    }
  }, [invoiceFromMap, toast, onMutationSuccess]);

  const handleAssignEncomienda = useCallback(async (enc: Encomienda) => {
    if (!slCode || slCode.startsWith('__')) return;
    // Guard: must be a recognisable SL code, not a service name or placeholder
    if (!slCode.toUpperCase().startsWith('SL')) {
      // Show temp-customer creation dialog instead of a dead-end error
      setPendingEncForTemp(enc);
      setTempDialogOpen(true);
      setEncPickerOpen(false);
      setPendingEnc(null);
      return;
    }
    setAssigningEnc(true);
    const isTempCustomer = slCode.toUpperCase().startsWith('SL-NAN-');
    // Canonical encomienda payload — reused at address + top level so the
    // selection survives even if `addresses[]` is rebuilt by a future sync.
    const encPayload = {
      id: enc.id,
      name: enc.name,
      phone: enc.phone,
      pickupAddress: enc.pickupAddress,
    };
    const nowIso = new Date().toISOString();
    try {
      if (isTempCustomer) {
        // Temp customer — save flat to temp_customers collection
        const tempRef = doc(db, 'temp_customers', slCode);
        await setDoc(tempRef, {
          encomienda: encPayload,
          courierService: enc.name,
          encomiendaServiceName: enc.name,
          encomiendaUpdatedAt: nowIso,
          updatedAt: nowIso,
        }, { merge: true });
      } else {
        // Real customer — transactional read-modify-write so concurrent
        // writes (e.g. the scheduled SP2 sync rebuilding addresses) can't
        // clobber this selection mid-flight. Mirrors the encomienda to the
        // customer's top level so it's recoverable even if the addresses
        // array is rewritten.
        const customerRef = doc(db, 'customers', slCode);
        await runTransaction(db, async (t) => {
          const snap = await t.get(customerRef);
          const data = snap.exists() ? snap.data() : {};
          const addresses: any[] = Array.isArray(data.addresses) ? [...data.addresses] : [];
          // Prefer the existing address that already carries an encomienda
          // assignment (so subsequent changes update-in-place instead of
          // forking). Falls back to the default address, then to index 0.
          const defaultIdx = addresses.findIndex((a: any) => a?.isDefault && a?.isActive);
          const withEncIdx = addresses.findIndex((a: any) => a?.encomienda?.name || a?.encomienda?.id);
          const idx = withEncIdx >= 0
            ? withEncIdx
            : defaultIdx >= 0
              ? defaultIdx
              : 0;
          if (!addresses[idx]) addresses[idx] = {};
          addresses[idx] = { ...addresses[idx], encomienda: encPayload };
          t.set(customerRef, {
            addresses,
            // Top-level mirror so readers (Facturas, Nova, etc.) always find
            // the service name even without deep-traversing the addresses array.
            encomienda: encPayload,
            encomiendaServiceName: enc.name,
            encomiendaProvider: enc.id,
            encomiendaUpdatedAt: nowIso,
            // Admin-provenance stamp — the scheduled sync respects this for
            // contact-field priority and (post-fix) address preservation.
            sp1AdminUpdatedAt: nowIso,
            updatedAt: nowIso,
          }, { merge: true });
        });
      }
      setEncPickerOpen(false);
      setPendingEnc(null);
      toast({ title: 'Servicio asignado', description: `${enc.name} → ${customerName}` });
      onMutationSuccess();
    } catch (err) {
      toast({ title: 'Error al asignar', description: String(err), variant: 'destructive' });
    } finally {
      setAssigningEnc(false);
    }
  }, [slCode, customerName, toast, onMutationSuccess]);

  const shouldLoadCustomer = open || !!serviceFilter;

  useEffect(() => {
    if (!shouldLoadCustomer || !slCode || slCode.startsWith('__')) return;
    const isTempCustomer = slCode.toUpperCase().startsWith('SL-NAN-');
    const collectionName = isTempCustomer ? 'temp_customers' : 'customers';
    
    let active = true;
    getDoc(doc(db, collectionName, slCode)).then((snap) => {
      if (!snap.exists() || !active) return;
      const d = snap.data();
      if (isTempCustomer) {
        const addresses: any[] = d.addresses || [];
        const encAddr = addresses.find((a: any) => a.encomienda?.name) || addresses[0] || {};
        const enc = d.encomienda || encAddr.encomienda || null;
        const encomiendaName = enc?.name || d.courierService || '';
        setCustomerInfo({
          phone:             d.phone || '',
          encomiendaName,
          encomiendaPhone:  enc?.phone || '',
          encomiendaAddress: enc?.pickupAddress || d.deliveryAddress || '',
        });
        onServiceLoaded?.(slCode, encomiendaName);
      } else {
        const addresses: any[] = d.addresses || [];
        const encAddr = addresses.find((a: any) => a.encomienda?.name) || addresses[0] || {};
        const enc = d.encomienda || encAddr.encomienda || null;
        const encomiendaName = enc?.name || d.encomiendaServiceName || '';
        setCustomerInfo({
          phone:             d.phone || d.verifiedPhone || '',
          encomiendaName,
          encomiendaPhone:  enc?.phone || '',
          encomiendaAddress: enc?.pickupAddress || '',
        });
        onServiceLoaded?.(slCode, encomiendaName);
      }
    }).catch((err) => {
      console.warn(`[CustomerGroup] Failed to lazy load customer ${slCode}:`, err);
    });

    return () => { active = false; };
  }, [shouldLoadCustomer, slCode, onServiceLoaded]);

  const totalPackages = rows.reduce((s, r) => s + r.price, 0);
  const totalManualItems = liveManualItems.reduce((s, i) => s + i.amount, 0);
  const total = totalPackages + totalManualItems;

  // Hide when service filter is active and this customer's loaded service doesn't match.
  // Customers without an SL code have no encomienda data (subscription skipped) so
  // customerInfo stays null permanently — they must also be hidden when filtering.
  if (serviceFilter) {
    if (!slCode || slCode.startsWith('__')) return null;
    if (customerInfo !== null && (customerInfo.encomiendaName || '') !== serviceFilter) return null;
  }
  // Hide when invoice status filter is active and the loaded invoice status doesn't match.
  // 'pending' = no invoice or draft (not yet sent); 'sent' = sent or paid.
  // invoiceFromMap is live via Context maps so this reacts immediately when status changes.
  if (invoiceStatusFilter && invoiceStatusFilter !== 'all') {
    const isSentOrPaid = invoiceFromMap?.status === 'sent' || invoiceFromMap?.status === 'paid';
    if (invoiceStatusFilter === 'pending' && isSentOrPaid) return null;
    if (invoiceStatusFilter === 'sent' && !isSentOrPaid) return null;
  }

  return (
    <div className="flex flex-col border-b-[3px] border-border/60 pb-5 mb-5 last:border-0 last:mb-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 px-1 sm:px-3 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected ?? false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0 accent-emerald-600 cursor-pointer"
              aria-label={`Seleccionar ${customerName}`}
            />
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 shrink-0 text-left"
            aria-expanded={open}
            title={open ? "Colapsar cliente" : "Expandir cliente"}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <Popover
            open={encPickerOpen}
            onOpenChange={(v) => {
              setEncPickerOpen(v);
              if (!v) setPendingEnc(null);
            }}
          >
            <PopoverTrigger asChild>
              {customerInfo?.encomiendaName ? (
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title="Cambiar servicio de encomienda"
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-300/50 hover:border-emerald-500 px-2.5 py-1 rounded-md shrink-0 transition-colors cursor-pointer"
                >
                  {customerInfo.encomiendaName}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 border border-dashed border-red-500/50 dark:border-red-500/30 hover:border-red-600 hover:text-red-700 dark:hover:text-red-300 px-2 py-0.5 rounded-full shrink-0 transition-colors"
                  title="Asignar servicio de encomienda"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Asignar servicio
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start" side="bottom">
              {pendingEnc ? (
                <div className="p-3 space-y-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">Confirmar asignación</p>
                    <p className="text-[11px] text-muted-foreground">
                      Asignar <strong>{pendingEnc.name}</strong> a <strong>{customerName?.toUpperCase()}</strong>?
                    </p>
                    {pendingEnc.phone && (
                      <p className="text-[10px] text-muted-foreground/70">{pendingEnc.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAssignEncomienda(pendingEnc)}
                      disabled={assigningEnc}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-3 text-[11px] font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60"
                    >
                      {assigningEnc
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Check className="h-3 w-3" />
                      }
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingEnc(null)}
                      disabled={assigningEnc}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-3 text-[11px] font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-60"
                    >
                      <X className="h-3 w-3" />
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <Command>
                  <CommandInput
                    placeholder="Buscar servicio…"
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <CommandList className="max-h-52">
                    <CommandEmpty className="text-xs text-muted-foreground py-4 text-center">
                      Sin resultados
                    </CommandEmpty>
                    <CommandGroup>
                      {encomiendas
                        .filter((e) => e.active)
                        .map((enc) => (
                          <CommandItem
                            key={enc.id}
                            value={enc.name}
                            onSelect={() => setPendingEnc(enc)}
                            className="flex flex-col items-start gap-0.5 py-1.5 px-2 cursor-pointer"
                          >
                            <span className="text-xs font-medium text-foreground">{enc.name}</span>
                            {enc.phone && (
                              <span className="text-[10px] text-muted-foreground">{enc.phone}</span>
                            )}
                            {enc.zones?.length > 0 && (
                              <span className="text-[10px] text-muted-foreground/70 truncate max-w-full">
                                {enc.zones.slice(0, 3).join(', ')}{enc.zones.length > 3 ? '…' : ''}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </PopoverContent>
          </Popover>

          <span className="text-[10px] font-mono text-muted-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded shrink-0">
            {slCode || "\u2014"}
          </span>
          <span className="text-sm font-semibold text-foreground truncate flex-1 min-w-[120px]" title={customerName}>
            {customerName?.toUpperCase()}
          </span>

          {/* Spacer to keep badges slightly separated from the name if there's room */}
          <div className="hidden sm:block w-1 shrink-0" />

          {/* Package count and total */}
          <div className="flex items-center gap-2 shrink-0 bg-background/80 px-2.5 py-1 rounded-md border border-border/50">
            <span className="text-[11px] font-medium text-muted-foreground">
              {rows.length} paq. <span className="mx-1.5 text-border">•</span> <span className="font-bold text-foreground text-xs">{fmt$(total)}</span>
            </span>
          </div>

          {(() => {
            const status = invoiceFromMap?.status as string | undefined;
            if (lookingInvoice) return (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 bg-background"
                disabled
              >
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Factura…
              </Button>
            );
            if (!status) return (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-dashed border-border/50 bg-background text-muted-foreground hover:bg-muted/30"
                onClick={(e) => { e.stopPropagation(); handleOpenInvoiceForSend(); }}
                title="Sin factura registrada. Clic para buscar o asociar."
              >
                <FileText className="h-3 w-3" aria-hidden />
                Sin factura
              </Button>
            );
            const cfg: Record<string, { label: string; cls: string }> = {
              draft:    { label: 'Borrador',  cls: 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100/50 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700 dark:hover:bg-yellow-900/30' },
              sent:     { label: 'Enviada',   cls: 'bg-blue-50   text-blue-700   border-blue-300   hover:bg-blue-100/50  dark:bg-blue-900/20   dark:text-blue-400   dark:border-blue-700   dark:hover:bg-blue-900/30'   },
              paid:     { label: 'Pagada',    cls: 'bg-green-50  text-green-700  border-green-300  hover:bg-green-100/50 dark:bg-green-900/20  dark:text-green-400  dark:border-green-700  dark:hover:bg-green-900/30'  },
              overdue:  { label: 'Vencida',   cls: 'bg-red-50    text-red-700    border-red-300    hover:bg-red-100/50   dark:bg-red-900/20    dark:text-red-400    dark:border-red-700    dark:hover:bg-red-900/30'    },
              annulled: { label: 'Anulada',   cls: 'bg-gray-100  text-gray-500   border-gray-300   hover:bg-gray-200/50  dark:bg-gray-800      dark:text-gray-400   dark:border-gray-600   dark:hover:bg-gray-800/80'   },
              cancelled:{ label: 'Cancelada', cls: 'bg-gray-100  text-gray-500   border-gray-300   hover:bg-gray-200/50  dark:bg-gray-800      dark:text-gray-400   dark:border-gray-600   dark:hover:bg-gray-800/80'   },
            };
            const c = cfg[status] ?? { label: status, cls: 'bg-background/80 text-muted-foreground border-border/50 hover:bg-muted/30' };
            return (
              <Button
                variant="outline"
                size="sm"
                className={cn('h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 transition-colors border', c.cls)}
                onClick={(e) => { e.stopPropagation(); handleOpenInvoiceForSend(); }}
                title={`Factura ${invoiceFromMap?.invoiceNumber ? invoiceFromMap.invoiceNumber : ''} - Estado: ${c.label}. Clic para ver.`}
              >
                <ReceiptText className="h-3 w-3" aria-hidden />
                {invoiceFromMap?.invoiceNumber ? `${invoiceFromMap.invoiceNumber} - ` : ''}{c.label}
              </Button>
            );
          })()}



          {(!slCode || slCode.startsWith('__') || !slCode.toUpperCase().startsWith('SL')) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setTempDialogOpen(true); }}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-dashed border-amber-400/70 hover:border-amber-500 bg-background/80 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2.5 py-1 rounded-md shrink-0 transition-colors"
              title="Este cliente no tiene código SL. Crear cliente temporal para asociar sus paquetes."
            >
              <UserPlus className="h-3 w-3" />
              Crear cliente
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {!readOnly && onMoveToTransitoria && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:text-emerald-400 dark:hover:bg-emerald-950/20 bg-background"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToTransitoria({
                    type: 'group',
                    id: slCode,
                    packages: rows,
                  });
                }}
                title="Mover todo este cliente a Consolidación Transitoria"
              >
                <PackagePlus className="h-3.5 w-3.5" />
                A Transitoria
              </Button>
            )}

          </div>
        </div>
      </div>
    
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col">

              <div className="flex flex-col divide-y divide-border/40">
                {rows.map((row, index) => (
                  <PackageRow
                    key={row.tracking}
                    row={row}
                    onOpenLabel={onOpenLabel}
                    onOpenInvoice={onOpenInvoice}
                    onInvoiceUpdated={onMutationSuccess}
                    readOnly={readOnly}
                    invoiceStatus={invoiceFromMap?.status}
                    invoiceItem={invoiceFromMap?.invoiceItems?.find((i: any) => (i.trackingNumber || i.tracking || '').toUpperCase() === row.tracking.toUpperCase())}
                    onMoveToTransitoria={onMoveToTransitoria}
                    index={index}
                    encomiendaName={customerInfo?.encomiendaName || ""}
                  />
                ))}
                
                {/* Manual Items */}
                {!readOnly && liveManualItems.length > 0 && liveManualItems.map((item, idx) => {
                  const itemKey = `${item._descKey}|${item.trackingRef}`;
                  const edit = itemEdits[itemKey];
                  const isEditing = !!edit;
                  return (
                    <div key={`manual-${idx}`} className="flex flex-row items-center justify-between gap-3 p-3 bg-amber-50/20 hover:bg-amber-50/40 dark:bg-amber-950/10 dark:hover:bg-amber-950/20 transition-colors border-t border-border/50 group">
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-amber-800 dark:text-amber-500">Servicio Adicional</span>
                          {item.trackingRef && (
                            <span className="text-[10px] font-mono text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">{item.trackingRef}</span>
                          )}
                        </div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={edit.description}
                            onChange={e => setItemEdits(prev => ({ ...prev, [itemKey]: { ...prev[itemKey], description: e.target.value } }))}
                            className="h-7 w-full mt-1 text-xs rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                            aria-label="Editar descripción"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground break-words mt-0.5">{item.description}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center shrink-0">
                        <div className="w-[60px] text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={edit.amount}
                              onChange={e => setItemEdits(prev => ({ ...prev, [itemKey]: { ...prev[itemKey], amount: e.target.value } }))}
                              className="h-7 w-full text-xs rounded border border-input bg-background px-1 text-right focus:outline-none focus:ring-1 focus:ring-ring"
                              aria-label="Editar monto"
                            />
                          ) : (
                            <span className="font-semibold text-sm text-foreground">{fmt$(item.amount)}</span>
                          )}
                        </div>
                        
                        <div className="flex w-16 sm:w-[72px] justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-1 sm:border-l sm:border-border/60 sm:pl-3 sm:ml-3">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={edit.saving}
                                  onClick={() => handleSaveManualItem(itemKey, item)}
                                  className="p-1.5 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 transition-colors disabled:opacity-50"
                                  title="Guardar"
                                >
                                  {edit.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setItemEdits(prev => { const n = { ...prev }; delete n[itemKey]; return n; })}
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                                  title="Cancelar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setItemEdits(prev => ({ ...prev, [itemKey]: { description: item.description, amount: String(item.amount), saving: false } }))}
                                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                                  title="Editar"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteManualItem(item)}
                                  className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Global Add Item */}
                {!readOnly && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 bg-muted/10 hover:bg-muted/30 transition-colors border-t border-border/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0 w-full">
                      <div className="hidden sm:flex p-1.5 bg-muted rounded-md text-muted-foreground shrink-0">
                        <Plus className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={globalDesc}
                        onChange={(e) => setGlobalDesc(e.target.value)}
                        placeholder="Descripción de servicio de terceros..."
                        className="h-8 flex-1 w-full text-xs rounded-md border border-input bg-background px-3 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 mt-1 sm:mt-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setGlobalCurrency((c) => c === 'USD' ? 'CRC' : 'USD')}
                          className={cn(
                            "h-8 px-2.5 text-[10px] font-bold rounded-md shrink-0 transition-colors border",
                            globalCurrency === 'USD'
                              ? "bg-emerald-600 border-emerald-700 hover:bg-emerald-700 text-white"
                              : "bg-blue-600 border-blue-700 hover:bg-blue-700 text-white"
                          )}
                        >
                          {globalCurrency === 'USD' ? '$ USD' : '₡ CRC'}
                        </button>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={globalCost}
                          onChange={(e) => setGlobalCost(e.target.value)}
                          placeholder="0.00"
                          className="h-8 w-24 text-xs rounded-md border border-input bg-background px-3 text-right focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 sm:border-l sm:border-border/60 sm:pl-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleSuggestService(); }}
                          disabled={loadingSuggestion}
                          title="Sugerir y aplicar servicio de tercero basado en historial"
                          aria-label="AI Sugerir servicio"
                          className="inline-flex items-center justify-center gap-1 h-8 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-dashed border-violet-300 dark:border-violet-700 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40 px-2 rounded-md transition-colors disabled:opacity-50"
                        >
                          {loadingSuggestion
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Sparkles className="h-3 w-3" />
                          }
                          <span className="hidden sm:inline">AI Sugerir</span>
                          <span className="inline sm:hidden">AI</span>
                        </button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 px-2.5 text-[11px] font-medium gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                          onClick={handleAddGlobalItem}
                          disabled={globalSaving || !globalCost}
                        >
                          {globalSaving
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Plus className="h-3.5 w-3.5" />
                          }
                          <span className="hidden sm:inline">Agregar</span>
                          <span className="inline sm:hidden">Add</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Temp customer creation dialog ── */}
      <Dialog
        open={tempDialogOpen}
        onOpenChange={(v) => {
          if (!v && !creatingTemp) {
            setTempDialogOpen(false);
            if (!tempRecord) setPendingEncForTemp(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden />
              Cliente sin SL code válido
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* Error context */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/10 px-3 py-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                El código SL actual no es válido
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                SL code: <span className="font-mono font-bold">{slCode || '—'}</span>
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                Cliente: <span className="font-semibold">{customerName?.toUpperCase()}</span>
              </p>
              {pendingEncForTemp && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Encomienda pendiente: <span className="font-semibold">{pendingEncForTemp.name}</span>
                </p>
              )}
            </div>

            {/* Success state: record already created */}
            {tempRecord ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-900/10 px-3 py-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Cliente temporal creado
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Código asignado:{' '}
                  <span className="font-mono font-bold text-sm text-emerald-900 dark:text-emerald-200">
                    {tempRecord.slCode}
                  </span>
                </p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
                  Los paquetes y facturas de este cliente ya están asociados al nuevo código.
                  La vista se actualizará en tiempo real.
                </p>
                {pendingEncForTemp && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
                    ✓ Encomienda <strong>{pendingEncForTemp.name}</strong> asignada.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Se creará un cliente temporal en <span className="font-mono">temp_customers</span> con
                  un código <span className="font-mono font-semibold">SL-NAN-XXX</span> consecutivo.
                  Todos los paquetes ({rows.length}) e invoices de este grupo se reasociarán
                  automáticamente y la vista se actualizará en tiempo real.
                </p>
                <Button
                  className="w-full gap-2"
                  onClick={handleCreateTempAndAssign}
                  disabled={creatingTemp}
                >
                  {creatingTemp
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creando…</>
                    : <><Plus className="h-3.5 w-3.5" />Crear cliente temporal</>
                  }
                </Button>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setTempDialogOpen(false); if (!tempRecord) setPendingEncForTemp(null); }}
                disabled={creatingTemp}
              >
                {tempRecord ? 'Cerrar' : 'Cancelar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Manifest card ────────────────────────────────────────────────────────────

interface ManifestCardProps {
  manifestNumber: string;
  rows: EncomiendaManifestRow[];
  onOpenLabel: (data: NovaShippingLabelData) => void;
  onOpenInvoice: (invoice: any) => void;
  forceOpen?: boolean | null;
  defaultOpen?: boolean;
  onBulkPrintLabels?: (data: NovaShippingLabelData[]) => void;
  onBulkSendInvoices?: (data: NovaShippingLabelData[]) => void;
  encomiendas: Encomienda[];
  invoiceStatusFilter?: 'all' | 'pending' | 'sent';
  readOnly?: boolean;
  isManifestSelected?: boolean;
  onToggleSelectManifest?: () => void;
  onMoveToTransitoria?: (target: { type: 'single' | 'group' | 'manifest'; id: string; packages: EncomiendaManifestRow[] }) => void;
}

function ManifestCard({
  manifestNumber,
  rows,
  onOpenLabel,
  onOpenInvoice,
  forceOpen,
  defaultOpen = false,
  onBulkPrintLabels,
  onBulkSendInvoices,
  encomiendas,
  invoiceStatusFilter,
  readOnly = false,
  isManifestSelected = false,
  onToggleSelectManifest,
  onMoveToTransitoria,
}: ManifestCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen !== null && forceOpen !== undefined) setOpen(forceOpen);
  }, [forceOpen]);
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const context = useContext(LiveInvoiceContext);
  const { onMutationSuccess } = context || {};

  const [selectedSlCodes, setSelectedSlCodes] = useState<Set<string>>(new Set());
  const [localGroupsOpen, setLocalGroupsOpen] = useState<boolean | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deliveringSelected, setDeliveringSelected] = useState(false);
  const [movingToRouteSelected, setMovingToRouteSelected] = useState(false);
  const [printingManifest, setPrintingManifest] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPackages, setWizardPackages] = useState<WizardPackage[]>([]);
  const [allWizardPackages, setAllWizardPackages] = useState<WizardPackage[]>([]);
  const [serviceFilter, setServiceFilter] = useState('');
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [serviceNamesMap, setServiceNamesMap] = useState<Record<string, string>>({});

  const effectiveGroupForceOpen = localGroupsOpen !== null ? localGroupsOpen : forceOpen;

  const toggleSelectCustomer = useCallback((slCode: string) => {
    setSelectedSlCodes((prev) => {
      const next = new Set(prev);
      if (next.has(slCode)) next.delete(slCode); else next.add(slCode);
      return next;
    });
  }, []);



  const byCustomer = useMemo(() => {
    const map = new Map<string, { name: string; rows: EncomiendaManifestRow[] }>();
    rows.forEach((r) => {
      const key = r.slCode || `__nocode__${r.customerName}`;
      if (!map.has(key)) map.set(key, { name: r.customerName, rows: [] });
      map.get(key)!.rows.push(r);
    });
    return Array.from(map.entries()).map(([slCode, v]) => ({
      slCode,
      customerName: v.name,
      rows: v.rows,
    }));
  }, [rows]);

  useEffect(() => {
    if (isManifestSelected) {
      setSelectedSlCodes(new Set(byCustomer.map((c) => c.slCode)));
    } else {
      setSelectedSlCodes(new Set());
    }
  }, [isManifestSelected, byCustomer]);

  const selectedPackagesForDelivery = useMemo(() => {
    const targets = byCustomer.filter((c) => selectedSlCodes.has(c.slCode));
    const allSelectedPkgs = targets.flatMap((c) => c.rows);
    return allSelectedPkgs.filter(p => {
      const effectiveStatus = (p.status || '').toLowerCase();
      return ['route', 'on_route', 'in_route', 'on_rute', 'on-route', 'in-route'].includes(effectiveStatus);
    });
  }, [byCustomer, selectedSlCodes]);

  const totalRouteSelectedRows = selectedPackagesForDelivery.length;

  const ROUTE_STATUS_KEYS = ['route', 'on_route', 'in_route', 'on_rute', 'on-route', 'in-route'];

  const selectedPackagesForRoute = useMemo(() => {
    const targets = byCustomer.filter((c) => selectedSlCodes.has(c.slCode));
    const allSelectedPkgs = targets.flatMap((c) => c.rows);
    return allSelectedPkgs.filter(p => {
      const effectiveStatus = (p.status || '').toLowerCase();
      return !ROUTE_STATUS_KEYS.includes(effectiveStatus);
    });
  }, [byCustomer, selectedSlCodes]);

  const totalEligibleForRoute = selectedPackagesForRoute.length;

  const handleBulkDeliver = useCallback(async () => {
    if (selectedPackagesForDelivery.length === 0 || deliveringSelected) return;
    setDeliveringSelected(true);
    try {
      const syncedAt = new Date().toISOString();
      const batch = writeBatch(db);
      
      for (const p of selectedPackagesForDelivery) {
        const pkgRef = doc(db, 'packages', p.tracking.toUpperCase());
        batch.update(pkgRef, {
          status: "delivered",
          statusLabel: "Entregado",
          updatedAt: syncedAt
        });

        const encRef = doc(db, 'manifest_encomiendas', p.tracking.toUpperCase());
        batch.update(encRef, {
          status: "delivered",
          statusLabel: "Entregado",
          updatedAt: syncedAt
        });
      }
      
      await batch.commit();
      
      // Sync to SP2/SmartWeb reactively
      const pkgsToSync = selectedPackagesForDelivery.map(p => ({
        id: p.tracking.toUpperCase(),
        trackingNumber: p.tracking,
        slCode: p.slCode || '',
        customerName: p.customerName || '',
        status: 'delivered',
        weight: p.weight,
        description: p.description || '',
        ruta: p.ruta || 'Encomiendas',
        manifestNumber: p.manifestNumber || '',
        forceSync: true,
        allowCreate: true
      }));

      try {
        await syncPackagesToSmartWeb(pkgsToSync);
        
        // Stamp packages as synced
        const syncBatch = writeBatch(db);
        for (const p of selectedPackagesForDelivery) {
          const pkgRef = doc(db, 'packages', p.tracking.toUpperCase());
          syncBatch.update(pkgRef, {
            smartwebSynced: true,
            smartwebSyncedAt: syncedAt,
            smartwebSyncSource: "bulk_delivery",
          });
        }
        await syncBatch.commit();
      } catch (syncErr) {
        console.warn("[bulk delivery smartweb sync failed]", syncErr);
      }

      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'success',
        resource: 'encomiendas',
        metadata: {
          status: 'delivered',
          count: selectedPackagesForDelivery.length,
          trackings: selectedPackagesForDelivery.map(p => p.tracking)
        }
      });

      toast({
        title: "Entrega completada",
        description: `${selectedPackagesForDelivery.length} paquete${selectedPackagesForDelivery.length !== 1 ? 's' : ''} marcados como entregados.`,
      });
      setSelectedSlCodes(new Set());
      onMutationSuccess?.();
    } catch (err) {
      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'error',
        resource: 'encomiendas',
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: {
          status: 'delivered',
          count: selectedPackagesForDelivery.length
        }
      });

      toast({
        title: "Error al entregar",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setDeliveringSelected(false);
    }
  }, [selectedPackagesForDelivery, deliveringSelected, toast, onMutationSuccess]);

  const handleBulkMoveToRoute = useCallback(async () => {
    if (selectedPackagesForRoute.length === 0 || movingToRouteSelected) return;
    setMovingToRouteSelected(true);
    try {
      const syncedAt = new Date().toISOString();
      const batch = writeBatch(db);
      
      for (const p of selectedPackagesForRoute) {
        const pkgRef = doc(db, 'packages', p.tracking.toUpperCase());
        batch.update(pkgRef, {
          status: "route",
          statusLabel: "En Ruta",
          updatedAt: syncedAt
        });

        const encRef = doc(db, 'manifest_encomiendas', p.tracking.toUpperCase());
        batch.update(encRef, {
          status: "route",
          statusLabel: "En Ruta",
          updatedAt: syncedAt
        });
      }
      
      await batch.commit();
      
      // Sync to SP2/SmartWeb reactively
      const pkgsToSync = selectedPackagesForRoute.map(p => ({
        id: p.tracking.toUpperCase(),
        trackingNumber: p.tracking,
        slCode: p.slCode || '',
        customerName: p.customerName || '',
        status: 'route',
        weight: p.weight,
        description: p.description || '',
        ruta: p.ruta || 'Encomiendas',
        manifestNumber: p.manifestNumber || '',
        forceSync: true,
        allowCreate: true
      }));

      try {
        await syncPackagesToSmartWeb(pkgsToSync);
        
        // Stamp packages as synced
        const syncBatch = writeBatch(db);
        for (const p of selectedPackagesForRoute) {
          const pkgRef = doc(db, 'packages', p.tracking.toUpperCase());
          syncBatch.update(pkgRef, {
            smartwebSynced: true,
            smartwebSyncedAt: syncedAt,
            smartwebSyncSource: "bulk_route",
          });
        }
        await syncBatch.commit();
      } catch (syncErr) {
        console.warn("[bulk route smartweb sync failed]", syncErr);
      }

      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'success',
        resource: 'encomiendas',
        metadata: {
          status: 'route',
          count: selectedPackagesForRoute.length,
          trackings: selectedPackagesForRoute.map(p => p.tracking)
        }
      });

      toast({
        title: "Puesto en Ruta",
        description: `${selectedPackagesForRoute.length} paquete${selectedPackagesForRoute.length !== 1 ? 's' : ''} movidos a En Ruta de Entrega.`,
      });
      setSelectedSlCodes(new Set());
      onMutationSuccess?.();
    } catch (err) {
      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'error',
        resource: 'encomiendas',
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: {
          status: 'route',
          count: selectedPackagesForRoute.length
        }
      });

      toast({
        title: "Error al poner en ruta",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setMovingToRouteSelected(false);
    }
  }, [selectedPackagesForRoute, movingToRouteSelected, toast, onMutationSuccess]);

  const handleBulkDelete = useCallback(async () => {
    const targets = byCustomer.filter((c) => selectedSlCodes.has(c.slCode));
    const allRows = targets.flatMap((c) => c.rows);
    if (!allRows.length) return;
    setDeletingSelected(true);
    try {
      const batch = writeBatch(db);
      for (const row of allRows) {
        batch.delete(doc(db, 'manifest_encomiendas', row.tracking.toUpperCase()));
      }
      await batch.commit();
      setSelectedSlCodes(new Set());
      setConfirmDelete(false);
      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'success',
        resource: 'encomiendas',
        metadata: {
          deleted: true,
          count: allRows.length,
          trackings: allRows.map(p => p.tracking)
        }
      });

      toast({
        title: 'Eliminado',
        description: `${allRows.length} paquete${allRows.length !== 1 ? 's' : ''} eliminados del manifiesto.`,
      });
      onMutationSuccess?.();
    } catch (err) {
      auditLog({
        action: 'packages_bulk_updated',
        category: 'package',
        result: 'error',
        resource: 'encomiendas',
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: {
          deleted: true,
          count: allRows.length
        }
      });

      toast({ title: 'Error al eliminar', description: String(err), variant: 'destructive' });
    } finally {
      setDeletingSelected(false);
    }
  }, [byCustomer, selectedSlCodes, toast, onMutationSuccess]);

  const toWizardPackage = useCallback((row: EncomiendaManifestRow): WizardPackage => ({
    id: row.tracking,
    trackingNumber: row.tracking,
    tracking: row.tracking,
    manifestNumber: row.manifestNumber,
    weight: row.weight,
    slCode: row.slCode,
    customerName: row.customerName,
    description: row.description,
    ruta: row.ruta,
    price: row.price,
    permisos: row.permisos,
  }), []);

  const handleMoveSelected = useCallback(() => {
    const targets = byCustomer.filter(c => selectedSlCodes.has(c.slCode));
    const selected = targets.flatMap(c => c.rows).map(toWizardPackage);
    const all = byCustomer.flatMap(c => c.rows).map(toWizardPackage);
    setWizardPackages(selected);
    setAllWizardPackages(all);
    setWizardOpen(true);
  }, [byCustomer, selectedSlCodes, toWizardPackage]);

  const handleServiceLoaded = useCallback((slCode: string, serviceName: string) => {
    setServiceNamesMap(prev => prev[slCode] === serviceName ? prev : { ...prev, [slCode]: serviceName });
  }, []);

  const availableServiceNames = useMemo(() => {
    // Only expose names that are registered in the encomiendas list to prevent
    // orphaned / non-encomienda strings from appearing in the filter dropdown.
    const validNames = new Set(encomiendas.map((e) => e.name).filter(Boolean));
    const names = new Set(
      Object.values(serviceNamesMap).filter((n) => n && validNames.has(n)),
    );
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [serviceNamesMap, encomiendas]);

  const handlePrintServiceManifest = useCallback(async () => {
    setPrintingManifest(true);
    try {
      const targetCustomers = serviceFilter
        ? byCustomer.filter(c => (serviceNamesMap[c.slCode] || '') === serviceFilter)
        : byCustomer;

      if (!targetCustomers.length) {
        toast({ title: 'Sin datos', description: 'No hay paquetes para el servicio seleccionado.', variant: 'destructive' });
        return;
      }

      const neededSlCodes = targetCustomers
        .map(c => c.slCode)
        .filter(s => s && !s.startsWith('__') && !(s in serviceNamesMap));
      const resolvedMap: Record<string, string> = { ...serviceNamesMap };

      if (neededSlCodes.length > 0) {
        const chunkArr = <T,>(arr: T[], size: number): T[][] =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
        const regularCodes = neededSlCodes.filter(s => !s.toUpperCase().startsWith('SL-NAN-'));
        const tempCodes    = neededSlCodes.filter(s => s.toUpperCase().startsWith('SL-NAN-'));

        if (regularCodes.length > 0) {
          for (const chunk of chunkArr(regularCodes, 10)) {
            const snaps = await getDocs(query(collection(db, 'customers'), where(documentId(), 'in', chunk)));
            snaps.docs.forEach(d => {
              const data = d.data();
              const addresses: any[] = data.addresses || [];
              const encAddr = addresses.find((a: any) => a.encomienda?.name) || addresses[0] || {};
              resolvedMap[d.id] = encAddr.encomienda?.name || '';
            });
          }
        }
        if (tempCodes.length > 0) {
          for (const chunk of chunkArr(tempCodes, 10)) {
            const snaps = await getDocs(query(collection(db, 'temp_customers'), where(documentId(), 'in', chunk)));
            snaps.docs.forEach(d => {
              const data = d.data();
              const addresses: any[] = data.addresses || [];
              const encAddr = addresses.find((a: any) => a.encomienda?.name) || addresses[0] || {};
              resolvedMap[d.id] = data.encomienda?.name || encAddr.encomienda?.name || data.courierService || '';
            });
          }
        }
      }

      const printRows: EncomiendaServiceManifestRow[] = [];
      targetCustomers.forEach(c => {
        const service = resolvedMap[c.slCode] || 'Sin Servicio Asignado';
        c.rows.forEach(r => {
          printRows.push({
            slCode:        c.slCode,
            customerName:  c.customerName,
            tracking:      r.tracking,
            description:   r.description || '',
            peso:          Number(r.weight ?? 0),
            price:         Number(r.price ?? 0),
            courierService: service,
          });
        });
      });

      if (!printRows.length) {
        toast({ title: 'Sin datos', description: 'No hay paquetes para imprimir.', variant: 'destructive' });
        return;
      }

      const html = buildEncomiendaServiceManifestHTML(printRows, manifestNumber, 0);
      const win = window.open('', '_blank', 'width=900,height=1100');
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    } catch (err) {
      toast({ title: 'Error al imprimir', description: String(err), variant: 'destructive' });
    } finally {
      setPrintingManifest(false);
    }
  }, [byCustomer, manifestNumber, serviceNamesMap, serviceFilter, toast]);

  const handleBulkPrint = useCallback(() => {
    if (!onBulkPrintLabels) return;
    const targets = byCustomer.filter((c) => selectedSlCodes.has(c.slCode));
    if (!targets.length) {
      toast({ title: "Nada seleccionado", description: "Selecciona al menos un cliente.", variant: "destructive" });
      return;
    }
    onBulkPrintLabels(
      targets.map((c) => ({
        slCode: c.slCode,
        clientName: c.customerName,
        trackings: c.rows.map((r) => r.tracking),
        ruta: c.rows[0]?.ruta,
        encomiendaName: serviceNamesMap[c.slCode] || "",
      }))
    );
  }, [byCustomer, selectedSlCodes, onBulkPrintLabels, toast, serviceNamesMap]);

  const total = rows.reduce((s, r) => s + r.price, 0);
  const savedDate = rows[0]?.savedAt ? fmtDate(rows[0].savedAt) : "\u2014";
  const invoicedCount = rows.filter((r) => r.invoiceUpdated).length;
  const allSelected = byCustomer.length > 0 && byCustomer.every((c) => selectedSlCodes.has(c.slCode));
  const someSelected = !allSelected && byCustomer.some((c) => selectedSlCodes.has(c.slCode));

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-muted/10 border-b border-border/60 hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onToggleSelectManifest && (
            <input
              type="checkbox"
              checked={isManifestSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelectManifest();
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 shrink-0 accent-blue-600 cursor-pointer border-blue-400 rounded"
              aria-label={`Seleccionar manifiesto ${manifestNumber}`}
            />
          )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left group"
          aria-expanded={open}
          title={open ? "Colapsar manifiesto" : "Expandir manifiesto"}
        >
          <span className={cn(
            "inline-flex items-center justify-center h-5 w-5 rounded border shrink-0 transition-colors",
            open
              ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-400"
              : "bg-muted border-border text-muted-foreground group-hover:border-emerald-300"
          )}>
            {open
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground truncate">
              Manifiesto {manifestNumber}
            </span>
            <span className="text-[11px] text-muted-foreground/80 truncate">
              {byCustomer.length} clientes • {rows.length} paquetes • {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)}
            </span>
          </div>
        </button>
        </div>
        
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 pt-3 sm:pt-0 border-t sm:border-0 border-border/40 mt-1 sm:mt-0">
          {invoicedCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-400/50 bg-emerald-50/50 text-emerald-700 dark:text-emerald-300 shrink-0"
            >
              {invoicedCount} facturado{invoicedCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-950/30"
            onClick={(e) => { e.stopPropagation(); setLocalGroupsOpen(v => v === false ? true : false); }}
            title={(localGroupsOpen === false) ? "Expandir clientes" : "Colapsar clientes"}
          >
            {localGroupsOpen === false
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />
            }
            Clientes
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            onClick={(e) => { e.stopPropagation(); handlePrintServiceManifest(); }}
            disabled={printingManifest || rows.length === 0}
            title={serviceFilter ? `Imprimir manifiesto — ${serviceFilter}` : 'Imprimir manifiesto por servicio de encomiendas'}
          >
            {printingManifest
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Printer className="h-3.5 w-3.5" />
            }
            Manifiesto
          </Button>
          {selectedSlCodes.size > 0 && (() => {
            const totalSelectedRows = byCustomer
              .filter((c) => selectedSlCodes.has(c.slCode))
              .reduce((s, c) => s + c.rows.length, 0);
            return (
              <>
                {onBulkPrintLabels && (
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white hidden sm:flex"
                    onClick={handleBulkPrint}
                    title={`Imprimir etiquetas de ${selectedSlCodes.size} cliente${selectedSlCodes.size !== 1 ? 's' : ''}`}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir ({selectedSlCodes.size})
                  </Button>
                )}
                {/* ── Bulk deliver packages in route ── */}
                {!readOnly && totalRouteSelectedRows > 0 && (
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white flex"
                    onClick={handleBulkDeliver}
                    disabled={deliveringSelected}
                    title={`Marcar ${totalRouteSelectedRows} paquete${totalRouteSelectedRows !== 1 ? 's' : ''} como entregados`}
                  >
                    {deliveringSelected ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Entregar ({totalRouteSelectedRows})
                  </Button>
                )}
                {/* ── Bulk move packages to route ── */}
                {!readOnly && totalEligibleForRoute > 0 && (
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 bg-orange-600 hover:bg-orange-700 text-white flex"
                    onClick={handleBulkMoveToRoute}
                    disabled={movingToRouteSelected}
                    title={`Poner ${totalEligibleForRoute} paquete${totalEligibleForRoute !== 1 ? 's' : ''} en ruta de entrega`}
                  >
                    {movingToRouteSelected ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    Ruta ({totalEligibleForRoute})
                  </Button>
                )}
                {/* ── Move selected packages to transitory consolidation ── */}
                {!readOnly && onMoveToTransitoria && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:text-emerald-400 dark:hover:bg-emerald-950/20 bg-background"
                    onClick={() => {
                      const targets = byCustomer.filter((c) => selectedSlCodes.has(c.slCode));
                      const selected = targets.flatMap((c) => c.rows);
                      onMoveToTransitoria({
                        type: selectedSlCodes.size === byCustomer.length ? 'manifest' : 'group',
                        id: manifestNumber,
                        packages: selected
                      });
                    }}
                    title={`Mover ${totalSelectedRows} paquete${totalSelectedRows !== 1 ? 's' : ''} a Consolidación Transitoria`}
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    A Transitoria ({totalSelectedRows})
                  </Button>
                )}
                {/* ── Move selected packages to another manifest ── */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700/60 dark:text-blue-400 dark:hover:bg-blue-950/20 bg-background"
                  onClick={handleMoveSelected}
                  title={`Mover ${totalSelectedRows} paquete${totalSelectedRows !== 1 ? 's' : ''} a otro manifiesto`}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Mover ({totalSelectedRows})
                </Button>
                {/* ── Bulk delete with two-step confirmation ── */}
                {confirmDelete ? (
                  <>
                    <span className="text-[11px] text-red-600 dark:text-red-400 shrink-0 font-semibold">
                      ¿Eliminar {totalSelectedRows} paq.?
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0"
                      onClick={handleBulkDelete}
                      disabled={deletingSelected}
                      title="Confirmar eliminación"
                    >
                      {deletingSelected
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Check className="h-3.5 w-3.5" />
                      }
                      Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deletingSelected}
                      title="Cancelar eliminación"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] font-medium gap-1.5 shrink-0 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700/60 dark:text-red-400 dark:hover:bg-red-950/20 bg-background"
                    onClick={() => setConfirmDelete(true)}
                    title={`Eliminar ${totalSelectedRows} paquete${totalSelectedRows !== 1 ? 's' : ''}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar ({totalSelectedRows})
                  </Button>
                )}
            </>
          );
        })()}
      </div>
      </div>

      {/* ── Move-to-manifest wizard ─────────────────────────────────────────── */}
      <BulkManifestWizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        packages={wizardPackages}
        allPackages={allWizardPackages}
        onSuccess={(count) => {
          setWizardOpen(false);
          setSelectedSlCodes(new Set());
          setConfirmDelete(false);
          syncManifestEncomiendaFromPackages(manifestNumber).catch(() => {});
          toast({
            title: 'Paquetes movidos',
            description: `${count} paquete${count !== 1 ? 's' : ''} movidos exitosamente.`,
          });
        }}
      />



      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-1 sm:px-4 pb-4 pt-1 space-y-1">
              {byCustomer.map(({ slCode, customerName, rows: cRows }) => (
                <CustomerGroup
                  key={slCode}
                  slCode={slCode}
                  customerName={customerName}
                  rows={cRows}
                  onOpenLabel={onOpenLabel}
                  onOpenInvoice={onOpenInvoice}
                  forceOpen={effectiveGroupForceOpen}
                  isSelected={selectedSlCodes.has(slCode)}
                  onToggleSelect={onBulkPrintLabels ? () => toggleSelectCustomer(slCode) : undefined}
                  encomiendas={encomiendas}
                  serviceFilter={serviceFilter}
                  onServiceLoaded={handleServiceLoaded}
                  invoiceStatusFilter={invoiceStatusFilter}
                  readOnly={readOnly}
                  onMoveToTransitoria={onMoveToTransitoria}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EncomiendaManifests() {
  const { user } = useAuth();
  const { log: auditLog } = useAudit();
  const [manifestMap, setManifestMap] = useState<Map<string, EncomiendaManifestRow[]>>(new Map());
  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedManifests, setSelectedManifests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [liveInvoiceByTracking, setLiveInvoiceByTracking] = useState<Map<string, any>>(new Map());
  const [liveInvoiceByCustomerManifest, setLiveInvoiceByCustomerManifest] = useState<Map<string, any>>(new Map());
  const [paidManifestsSet, setPaidManifestsSet] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (isSilent = false, forceBypass = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const packagesMap = await getPackagesForEncomiendas(forceBypass);
      setManifestMap(packagesMap);

      const manifestNumbers = Array.from(packagesMap.keys()).filter(Boolean);
      const allInvoices: any[] = [];
      
      if (manifestNumbers.length > 0) {
        const CHUNK = 30;
        for (let i = 0; i < manifestNumbers.length; i += CHUNK) {
          const chunk = manifestNumbers.slice(i, i + CHUNK);
          const q = query(collection(db, 'invoices'), where('manifestNumber', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            allInvoices.push({ id: d.id, ...d.data() });
          });
        }
      }

      allInvoices.sort((a, b) => {
        const tA = a.createdAt?.seconds ?? 0;
        const tB = b.createdAt?.seconds ?? 0;
        return tA - tB;
      });

      const invoiceByTracking = new Map<string, any>();
      const invoiceByCustomerManifest = new Map<string, any>();
      const paidManifests = new Set<string>();
      const manifestInvoiceCounts = new Map<string, { total: number; paid: number }>();

      allInvoices.forEach(inv => {
        const mn = inv.manifestNumber || '';
        if (!mn) return;

        const status = inv.status || '';
        const isPaid = status === 'paid';
        const cur = manifestInvoiceCounts.get(mn) ?? { total: 0, paid: 0 };
        manifestInvoiceCounts.set(mn, { total: cur.total + 1, paid: cur.paid + (isPaid ? 1 : 0) });

        const trackings = inv.trackingNumbers || (inv.trackingNumber ? [inv.trackingNumber] : []);
        trackings.forEach((t: string) => {
          if (t) invoiceByTracking.set(t.toUpperCase(), inv);
        });

        const slCode = inv.slCode || inv.customerId || '';
        if (slCode) {
          const key = `${slCode}_${mn}`;
          invoiceByCustomerManifest.set(key, inv);
        }
      });

      manifestInvoiceCounts.forEach(({ total, paid }, mn) => {
        if (total > 0 && paid === total) {
          paidManifests.add(mn);
        }
      });

      setLiveInvoiceByTracking(invoiceByTracking);
      setLiveInvoiceByCustomerManifest(invoiceByCustomerManifest);
      setPaidManifestsSet(paidManifests);
    } catch (err) {
      console.error('[EncomiendaManifests] loadData error:', err);
      toast({ title: 'Error al cargar datos', description: String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  const [filterPending, setFilterPending] = useState(false);
  const [labelData, setLabelData] = useState<NovaShippingLabelData | null>(null);
  const [bulkPrintItems, setBulkPrintItems] = useState<NovaShippingLabelData[]>([]);
  const [bulkInvoiceItems, setBulkInvoiceItems] = useState<NovaShippingLabelData[]>([]);
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);
  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false);

  // Mega-Man Fusion selection and modal states
  const [selectedManifestIds, setSelectedManifestIds] = useState<Set<string>>(new Set());
  const [fusionModalOpen, setFusionModalOpen] = useState(false);
  const [fusing, setFusing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [megaManCustomName, setMegaManCustomName] = useState("");

  // Compute chronological date suffix from the selected manifests
  const dateSuffix = useMemo(() => {
    if (selectedManifestIds.size === 0) return "";
    const sortedIds = Array.from(selectedManifestIds).sort((a, b) => {
      const parseDate = (id: string) => {
        const m = id.match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (!m) return 0;
        return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime();
      };
      return parseDate(a) - parseDate(b);
    });
    const primaryId = sortedIds[sortedIds.length - 1] || "";
    return primaryId.match(/^(\d{2}-\d{2}-\d{4})/)?.[1] || primaryId;
  }, [selectedManifestIds]);

  // Reset custom name to default full ID when opening modal
  useEffect(() => {
    if (fusionModalOpen && dateSuffix) {
      setMegaManCustomName(`ENC-MEGA-MAN-${dateSuffix}`);
    }
  }, [fusionModalOpen, dateSuffix]);

  const toggleSelectManifest = useCallback((manifestId: string) => {
    setSelectedManifestIds((prev) => {
      const next = new Set(prev);
      if (next.has(manifestId)) {
        next.delete(manifestId);
      } else {
        next.add(manifestId);
      }
      return next;
    });
  }, []);

  const handleFusion = useCallback(async () => {
    if (selectedManifestIds.size < 2 || fusing) return;
    setFusing(true);
    setProgressMessage("Iniciando fusión...");
    try {
      const sourceIds = Array.from(selectedManifestIds);
      const sanitizedName = megaManCustomName
        .toUpperCase()
        .replace(/\s+/g, "-")
        .replace(/[^A-Z0-9_-]/g, "");

      const resultMegaId = await fuseFirestoreManifests(sourceIds, (msg) => {
        setProgressMessage(msg);
      }, 'ENC', sanitizedName);
      toast({
        title: "¡Mega-Man creado!",
        description: `El manifiesto ${resultMegaId} se ha creado y sincronizado exitosamente.`,
      });
      setSelectedManifestIds(new Set());
      setFusionModalOpen(false);
    } catch (err) {
      toast({
        title: "Error al fusionar",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setFusing(false);
      setProgressMessage("");
    }
  }, [selectedManifestIds, fusing, toast, megaManCustomName]);

  // Transitoria Move states and handlers
  const [transitoriaTarget, setTransitoriaTarget] = useState<{
    type: 'single' | 'group' | 'manifest';
    id: string;
    packages: EncomiendaManifestRow[];
  } | null>(null);
  const [movingToTransitoria, setMovingToTransitoria] = useState(false);

  const executeMoveToTransitoria = useCallback(async () => {
    if (!transitoriaTarget || movingToTransitoria) return;
    setMovingToTransitoria(true);
    try {
      // Step 1: Query linked invoices to annul them and keep financial state clean
      const trackings = pkgs.map(p => p.tracking.toUpperCase());
      const CHUNK_SIZE = 30;
      const trackingChunks: string[][] = [];
      for (let i = 0; i < trackings.length; i += CHUNK_SIZE) {
        trackingChunks.push(trackings.slice(i, i + CHUNK_SIZE));
      }

      const invoicesToAnnul: Array<{ id: string; num: string }> = [];
      const seenInvIds = new Set<string>();

      await Promise.all(trackingChunks.map(async chunk => {
        try {
          const [snapArr, snapSingle] = await Promise.all([
            getDocs(query(collection(db, 'invoices'), where('trackingNumbers', 'array-contains-any', chunk.slice(0, 10)))),
            getDocs(query(collection(db, 'invoices'), where('trackingNumber', 'in', chunk))),
          ]);
          for (const d of [...snapArr.docs, ...snapSingle.docs]) {
            if (seenInvIds.has(d.id)) continue;
            const data = d.data();
            if (data.status !== 'annulled' && data.status !== 'cancelled' && (data.status || '').toLowerCase() !== 'paid') {
              seenInvIds.add(d.id);
              invoicesToAnnul.push({ id: d.id, num: data.invoiceNumber || d.id });
            }
          }
        } catch (err) {
          console.warn('[executeMoveToTransitoria] Error finding encomienda invoices:', err);
        }
      }));

      // Step 2: Update Firestore SP1
      const batch = writeBatch(db);
      for (const p of pkgs) {
        const pkgRef = doc(db, 'packages', p.tracking.toUpperCase());
        batch.update(pkgRef, {
          manifestId: "consolidacion_transitoria",
          manifestNumber: "consolidacion_transitoria",
          consolidacion: true,
          status: "consolidated",
          invoiceId: null,
          invoiceNumber: null,
          smartwebSynced: false,
          smartwebSyncSource: "transitoria",
          originalManifestID: p.manifestNumber || '',
          updatedAt: syncedAt
        });

        // Delete from manifest_encomiendas so it is removed from Encomiendas views
        const encRef = doc(db, 'manifest_encomiendas', p.tracking.toUpperCase());
        batch.delete(encRef);
      }

      // Annull all linked invoices
      for (const inv of invoicesToAnnul) {
        batch.update(doc(db, 'invoices', inv.id), {
          status: 'annulled',
          annulledAt: syncedAt,
          cancelReason: `Paquetes de encomienda trasladados a Consolidación Transitoria`,
          updatedAt: syncedAt,
        });
      }

      await batch.commit();

      // Delete from SP2 customer portal
      for (const inv of invoicesToAnnul) {
        deleteInvoiceFromSp2(inv.id, inv.num).catch(() => {});
      }

      // Step 1.5: Prune from the source manifest documents' embedded packages arrays in Firestore
      try {
        const pkgsByManifest = new Map<string, EncomiendaManifestRow[]>();
        pkgs.forEach(p => {
          const mNum = p.manifestNumber || transitoriaTarget.id;
          if (mNum && !mNum.startsWith('selected-')) {
            const list = pkgsByManifest.get(mNum) || [];
            list.push(p);
            pkgsByManifest.set(mNum, list);
          }
        });

        await Promise.all(
          Array.from(pkgsByManifest.entries()).map(async ([mNum, mPkgs]) => {
            const trackingSet = new Set(mPkgs.map(p => p.tracking.toUpperCase()));
            const docRef = doc(db, 'manifests', mNum);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const mData = snap.data();
              const current = Array.isArray(mData.packages) ? mData.packages : [];
              const remaining = current.filter(p => {
                const trk = String(p.tracking || p.trackingNumber || p.guia || '').toUpperCase();
                return !trackingSet.has(trk);
              });
              if (remaining.length !== current.length) {
                const totalWeight = remaining.reduce((sum, p) => sum + (p.weight || 0), 0);
                const totalPrice = remaining.reduce((sum, p) => sum + (p.price || 0), 0);
                const routes = [...new Set(remaining.map(p => p.ruta).filter(Boolean))];
                const customersMap = new Map();
                remaining.forEach(p => {
                  if (!p.slCode) return;
                  const existing = customersMap.get(p.slCode);
                  if (existing) {
                    existing.packageCount++;
                  } else {
                    customersMap.set(p.slCode, {
                      slCode: p.slCode,
                      fullName: p.customerName || p.nombre || '',
                      email: p.customerEmail || '',
                      ruta: p.ruta || '',
                      packageCount: 1,
                    });
                  }
                });
                await setDoc(docRef, {
                  totalPackages: remaining.length,
                  totalWeight: Math.round(totalWeight * 100) / 100,
                  totalPrice: Math.round(totalPrice * 100) / 100,
                  totalCustomers: customersMap.size,
                  routes,
                  packages: remaining,
                  customers: Array.from(customersMap.values()),
                  updatedAt: serverTimestamp(),
                }, { merge: true });
              }
            }
          })
        );
      } catch (pruneErr) {
        console.warn("[transitoria manifest prune failed]", pruneErr);
      }

      // Step 2: Push to SP2 (SmartWeb)
      const pkgsToSync = pkgs.map(p => ({
        id: p.tracking.toUpperCase(),
        trackingNumber: p.tracking,
        slCode: p.slCode || '',
        customerName: p.customerName || '',
        status: 'consolidated',
        weight: p.weight,
        description: p.description || '',
        ruta: p.ruta || 'Encomiendas',
        manifestNumber: 'consolidacion_transitoria',
        forceSync: true,
        allowCreate: true
      }));

      try {
        await syncPackagesToSmartWeb(pkgsToSync);
        // Stamp packages as synced
        const syncBatch = writeBatch(db);
        for (const p of pkgs) {
          const pkgRef = doc(db, 'packages', p.tracking.toUpperCase());
          syncBatch.update(pkgRef, {
            smartwebSynced: true,
            smartwebSyncedAt: syncedAt,
            smartwebSyncSource: "transitoria",
          });
        }
        await syncBatch.commit();
      } catch (err) {
        console.warn("[transitoria sync failed]", err);
      }

      auditLog({
        action: 'manifest_packages_moved',
        category: 'manifest',
        result: 'success',
        resource: 'consolidacion_transitoria',
        metadata: {
          count: pkgs.length,
          fromManifest: transitoriaTarget.id,
          trackings: pkgs.map(p => p.tracking)
        }
      });

      toast({
        title: "Traslado completado",
        description: `${pkgs.length} paquete${pkgs.length !== 1 ? 's' : ''} trasladados a Consolidación Transitoria.`,
      });
      setTransitoriaTarget(null);
      if (transitoriaTarget.id.startsWith('selected-')) {
        setSelectedManifestIds(new Set());
      }
    } catch (err) {
      auditLog({
        action: 'manifest_packages_moved',
        category: 'manifest',
        result: 'error',
        resource: 'consolidacion_transitoria',
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: {
          count: transitoriaTarget?.packages?.length ?? 0,
          fromManifest: transitoriaTarget.id
        }
      });

      toast({
        title: "Error al trasladar",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setMovingToTransitoria(false);
    }
  }, [transitoriaTarget, movingToTransitoria, toast, setSelectedManifestIds]);

  const handleMoveSelectedManifestsToTransitoria = useCallback(() => {
    const pkgs: EncomiendaManifestRow[] = [];
    selectedManifestIds.forEach((id) => {
      const rows = manifestMap.get(id);
      if (rows) {
        pkgs.push(...rows);
      }
    });
    if (pkgs.length === 0) return;
    setTransitoriaTarget({
      type: 'manifest',
      id: `selected-${selectedManifestIds.size}-manifests`,
      packages: pkgs,
    });
  }, [selectedManifestIds, manifestMap]);

  // Keep the invoice preview in sync with live Firestore updates
  useEffect(() => {
    const invoiceId = previewInvoice?.id;
    if (!invoiceId) return;
    const unsub = onSnapshot(doc(db, 'invoices', invoiceId), (snap) => {
      if (!snap.exists()) return;
      setPreviewInvoice((prev: any) =>
        prev?.id === invoiceId ? { id: invoiceId, ...snap.data() } : prev
      );
    });
    return () => unsub();
  }, [previewInvoice?.id]);

  const handleSendInvoiceEmail = useCallback(async (invoice: any) => {
    if (sendingInvoiceEmail) return;
    setSendingInvoiceEmail(true);
    try {
      // Always fetch the freshest copy so manually-added items are included
      let inv = invoice;
      if (invoice?.id) {
        try {
          const freshSnap = await getDoc(doc(db, 'invoices', invoice.id));
          if (freshSnap.exists()) {
            const freshData: any = { id: freshSnap.id, ...freshSnap.data() };
            // Re-apply weight corrections from the passed invoice (actual package weight,
            // not pesoRedondeo billing weight stored in Firestore for legacy invoices).
            const applyWeightPatch = (freshArr: any[], srcArr: any[]) => {
              const weightMap = new Map<string, number>(
                srcArr.map((i: any) => [
                  (i.trackingNumber || i.tracking || '').toUpperCase(),
                  i.weight,
                ])
              );
              const realWeightMap = new Map<string, number>(
                srcArr.filter((i: any) => i.realWeight != null).map((i: any) => [
                  (i.trackingNumber || i.tracking || '').toUpperCase(),
                  i.realWeight,
                ])
              );
              return freshArr.map((i: any) => {
                const tn = (i.trackingNumber || i.tracking || '').toUpperCase();
                const w = weightMap.get(tn);
                const rw = realWeightMap.get(tn);
                return (w != null && w > 0)
                  ? { ...i, weight: w, ...(rw != null ? { realWeight: rw } : {}) }
                  : i;
              });
            };
            if (Array.isArray(invoice.invoiceItems) && Array.isArray(freshData.invoiceItems)) {
              freshData.invoiceItems = applyWeightPatch(freshData.invoiceItems, invoice.invoiceItems);
            }
            if (Array.isArray(invoice.items) && Array.isArray(freshData.items)) {
              freshData.items = applyWeightPatch(freshData.items, invoice.items);
            }
            inv = freshData;
          }
        } catch { /* fall back to passed invoice */ }
      }
      const payload = buildInvoiceEmailPayload(inv);
      if (!payload.customerEmail) throw new Error('El cliente no tiene email en la factura');
      const emailResult: any = await firebaseApi.email.sendInvoice(payload as any);
      if (inv.id) {
        // ── Side-effect parity with InvoiceGeneration.handleSendEmail ─────
        // Pre-fix (≤v0.0.635): this flow only updated emailSent/Status and
        // promoted packages — but it did NOT (a) append an entry to the
        // canonical emailSendLogs history, (b) push the invoice document
        // to SP2/SmartWeb, or (c) record the Resend messageId. As a
        // result, invoices sent from EncomiendaManifests never appeared
        // in the customer portal and the history panel showed a gap.
        //
        // Fix (v0.0.636): use the same canonical helpers as the Facturas
        // UI so every send produces identical Firestore state regardless
        // of which surface triggered it. recordInvoiceEmailSent persists
        // emailSendLogs (arrayUnion), lastResendMessageId, emailResendIds
        // and promotes draft → sent atomically. syncInvoicesToSp2 pushes
        // the full invoice doc to SP2 with a slCode guard.
        const resendMessageId = emailResult?.data?.messageId || emailResult?.messageId || null;
        await recordInvoiceEmailSent(inv.id, {
          sentTo: payload.customerEmail,
          sentBy: user?.id || 'encomiendas',
          invoiceNumber: inv.invoiceNumber,
          resendMessageId,
          currentStatus: inv.status,
        });

        // Determine the post-send status the same way recordInvoiceEmailSent
        // does so the in-memory snapshot we pass to sync helpers matches
        // what was just persisted.
        const protectedStatuses = ['paid', 'overdue', 'cancelled', 'annulled'];
        const willPromoteStatus = !inv.status || inv.status === 'draft' || !protectedStatuses.includes(inv.status);
        const sentInv = { ...inv, ...(willPromoteStatus ? { status: 'sent' } : {}) };

        // Full invoice push to SP2 — fire-and-forget. slCode guard mirrors
        // the InvoiceGeneration flow so customers without an SL code don't
        // silently disappear from SmartWeb.
        const code = ((sentInv as any).slCode || (sentInv as any).clientSlCode || '').trim();
        if (code) {
          syncInvoicePackagesToSp2(sentInv, 'processed', { updateSp1: true, syncSp2: false }).catch(e =>
            console.error('[EncomiendaManifests] package SP1 update error:', e)
          );
        }
      }
      auditLog({
        action: 'invoice_sent',
        category: 'invoice',
        result: 'success',
        resource: inv.invoiceNumber || inv.id,
        resourceId: inv.id,
        metadata: {
          sentTo: payload.customerEmail,
          manifestNumber: inv.manifestNumber || '',
          amount: inv.totalAmount || inv.amount || 0
        }
      });

      toast({ title: 'Email enviado', description: `Factura ${inv.invoiceNumber} enviada a ${payload.customerEmail}` });
    } catch (err) {
      auditLog({
        action: 'invoice_sent',
        category: 'invoice',
        result: 'error',
        resource: invoice.invoiceNumber || invoice.id,
        resourceId: invoice.id,
        errorMessage: err instanceof Error ? err.message : String(err)
      });

      toast({ title: 'Error al enviar email', description: String(err), variant: 'destructive' });
    } finally {
      setSendingInvoiceEmail(false);
    }
  }, [sendingInvoiceEmail, toast, user?.id]);

  // manifestOptions no longer needed — ManifestPicker reads directly from manifestMap in EncomiendaFilters

  useEffect(() => {
    loadData(false, true); // Fuerza la carga de datos frescos reales al entrar/montar la vista
  }, [loadData]);

  const [rutaMismatchTrackings, setRutaMismatchTrackings] = useState<string[]>([]);
  const [rutaMismatchExpanded, setRutaMismatchExpanded] = useState(false);

  // Auto-sync on mount — runs silently on every page load (no toast)
  useEffect(() => {
    let cancelled = false;
    syncAllEncomiendaPackages()
      .then(({ rutaMismatches }) => {
        if (cancelled) return;
        if (rutaMismatches.length > 0) setRutaMismatchTrackings(rutaMismatches);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[EncomiendaManifests] auto-sync error:', err);
      });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = subscribeEncomiendas((items) => setEncomiendas(items));
    return () => unsub();
  }, []);

  const isPendingCustomer = useCallback((sl: string) => {
    if (!sl || sl.startsWith('__')) return true;
    const up = sl.toUpperCase();
    return !up.startsWith('SL') || up.startsWith('SL-NAN-');
  }, []);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const entries = Array.from(manifestMap.entries()).filter(([m]) => m !== 'consolidacion_transitoria');

    const byManifest =
      selectedManifests.size === 0
        ? entries
        : entries.filter(([m]) => selectedManifests.has(m));

    const rowMatches = (r: EncomiendaManifestRow) =>
      !q ||
      r.tracking.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      r.slCode.toLowerCase().includes(q) ||
      ((r as any).nombre ?? "").toLowerCase().includes(q) ||
      ((r as any).customerDni ?? "").toLowerCase().includes(q);

    const parseManifestDate = (num: string): number => {
      const m = num.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (!m) return 0;
      return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
    };

    const result: [string, EncomiendaManifestRow[]][] = [];
    for (const [manifestNumber, mRows] of byManifest) {
      let rows = mRows.filter(r => {
        // Exclude delivered packages
        const status = (r.status || '').toLowerCase();
        if (status === 'delivered') return false;

        // Exclude packages with sent, paid, or overdue invoices
        const inv = liveInvoiceByTracking.get(r.tracking.toUpperCase());
        if (inv) {
          const invStatus = (inv.status || '').toLowerCase();
          if (['sent', 'paid', 'overdue'].includes(invStatus)) {
            return false;
          }
        }
        return true;
      });

      // If all packages in the manifest were filtered out, hide the manifest
      if (rows.length === 0) continue;

      if (filterPending) {
        rows = rows.filter((r) => isPendingCustomer(r.slCode));
        if (rows.length === 0) continue;
      }

      if (q) {
        if (manifestNumber.toLowerCase().includes(q)) {
          result.push([manifestNumber, rows]);
          continue;
        }
        const matched = rows.filter(rowMatches);
        if (matched.length > 0) result.push([manifestNumber, matched]);
      } else {
        result.push([manifestNumber, rows]);
      }
    }

    // Sort manifests from most recent to oldest
    result.sort((a, b) => parseManifestDate(b[0]) - parseManifestDate(a[0]));
    return result;
  }, [manifestMap, search, selectedManifests, filterPending, isPendingCustomer, liveInvoiceByTracking]);

  if (!user) return null;

  return (
    <LiveInvoiceContext.Provider value={{ liveInvoiceByTracking, liveInvoiceByCustomerManifest, onMutationSuccess: () => loadData(true, true) }}>
      <DashboardLayout>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="border-b border-border bg-card px-4 py-3 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Title */}
              <div className="flex items-center gap-2 shrink-0">
                <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h1 className="text-base font-semibold text-foreground">
                  Encomiendas
                </h1>
              </div>

              {/* Filters */}
              <EncomiendaFilters
                manifestMap={manifestMap}
                selectedManifests={selectedManifests}
                setSelectedManifests={setSelectedManifests}
                search={search}
                setSearch={setSearch}
                filterPending={filterPending}
                setFilterPending={setFilterPending}
                allOpen={allOpen}
                setAllOpen={setAllOpen}
              />

              {/* Refresh Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadData(false, true)}
                disabled={loading || refreshing}
                className="h-8 shrink-0 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:text-emerald-400 dark:hover:bg-emerald-950/20 bg-background px-3"
                title="Ignora la caché de 2 minutos y fuerza la consulta a la base de datos para obtener información en tiempo real"
              >
                <RefreshCw className={cn("h-4 w-4", (loading || refreshing) && "animate-spin")} />
                <span>Refrescar caché de encomiendas</span>
              </Button>
            </div>
          </div>



        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando encomiendas…</span>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center text-muted-foreground">
              <Package className="h-10 w-10 opacity-20" />
              <p className="text-sm font-medium">
                {filterPending
                  ? "No hay clientes sin SL o temporales en los manifiestos actuales"
                  : search
                    ? "Sin resultados para la búsqueda"
                    : "No hay manifiestos de encomienda guardados"}
              </p>
              {!search && (
                <p className="text-xs max-w-xs">
                  Los paquetes con ruta <strong>Encomiendas</strong> se guardan
                  automáticamente al ejecutar <em>Guardar en BD</em> en Nova.
                </p>
              )}
            </div>
          ) : (
            filteredEntries.map(([manifestNumber, rows], index) => (
              <ManifestCard
                key={manifestNumber}
                manifestNumber={manifestNumber}
                rows={rows}
                onOpenLabel={(d) => setLabelData(d)}
                onOpenInvoice={(inv) => setPreviewInvoice(inv)}
                forceOpen={allOpen}
                defaultOpen={false}
                onBulkPrintLabels={(items) => setBulkPrintItems(items)}
                onBulkSendInvoices={(items) => setBulkInvoiceItems(items)}
                encomiendas={encomiendas}
                readOnly={false}
                isManifestSelected={selectedManifestIds.has(manifestNumber)}
                onToggleSelectManifest={() => toggleSelectManifest(manifestNumber)}
                onMoveToTransitoria={setTransitoriaTarget}
              />
            ))
          )}
        </div>
      </div>

      {previewInvoice && (
        <NovaInvoicePreview
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
          onConfirmSend={async (inv) => {
            await handleSendInvoiceEmail(inv as any);
          }}
          onTestSend={async (inv, email) => {
            await sendTestInvoiceEmail(inv as any, email);
          }}
        />
      )}

      {/* Single label modal */}
      <NovaShippingLabelModal
        data={labelData}
        onClose={() => setLabelData(null)}
      />
      {/* Bulk labels — all-at-once preview + single print action */}
      {bulkPrintItems.length > 0 && (
        <EncomiendaBulkLabelModal
          queue={bulkPrintItems}
          onClose={() => setBulkPrintItems([])}
        />
      )}
      {/* Bulk invoice send */}
      {bulkInvoiceItems.length > 0 && (
        <EncomiendaBulkInvoiceSendModal
          queue={bulkInvoiceItems}
          onClose={() => setBulkInvoiceItems([])}
        />
      )}

      {/* ── Transitoria Move Confirmation Dialog ── */}
      <Dialog
        open={!!transitoriaTarget}
        onOpenChange={(open) => {
          if (!open && !movingToTransitoria) {
            setTransitoriaTarget(null);
          }
        }}
      >
        {transitoriaTarget && (
          <DialogContent className="max-w-md p-6 rounded-xl bg-background border border-border shadow-lg">
            <DialogHeader className="space-y-1.5 pb-4 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-emerald-700 dark:text-emerald-400">
                <PackagePlus className="h-5 w-5" />
                Mover a Consolidación Transitoria
              </DialogTitle>
            </DialogHeader>

            {movingToTransitoria ? (
              <div className="text-center py-8 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Trasladando paquetes...</p>
                  <p className="text-xs text-muted-foreground animate-pulse font-medium">
                    Sincronizando con SmartWeb...
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Vas a trasladar <strong className="text-foreground">{transitoriaTarget.packages.length} paquete(s)</strong> del manifiesto a <strong className="text-emerald-700 dark:text-emerald-400">Consolidación Transitoria</strong>.
                </p>

                {/* Source Context */}
                <div className="bg-muted/40 rounded-lg border border-border p-3 space-y-1 text-xs">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Detalles del traslado:
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Origen: <span className="font-semibold text-foreground">{transitoriaTarget.type === 'manifest' ? `Manifiesto completo (${transitoriaTarget.id})` : transitoriaTarget.type === 'group' ? `Cliente (${transitoriaTarget.id})` : `Paquete (${transitoriaTarget.id})`}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Destino: <span className="font-semibold text-emerald-600 dark:text-emerald-400">consolidacion_transitoria</span>
                  </p>
                </div>

                {/* Warning/Info alert */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10 p-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  <p className="leading-relaxed">
                    Esta acción desvinculará los paquetes del manifiesto de encomienda actual y los moverá a la bandeja de consolidación en tiempo real.
                  </p>
                </div>

                {/* Dialog Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransitoriaTarget(null)}
                    disabled={movingToTransitoria}
                    className="h-8 text-xs px-3"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={executeMoveToTransitoria}
                    disabled={movingToTransitoria}
                    className="h-8 text-xs px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Confirmar Traslado
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      {/* ── Floating Mega-Man Fusion Bar ── */}
      <AnimatePresence>
        {selectedManifestIds.size >= 2 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95vw] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              className="pointer-events-auto w-full max-w-full"
            >
              <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl text-white select-none">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex h-5 items-center justify-center rounded-full bg-blue-500 px-2.5 text-[11px] font-bold text-white">
                    {selectedManifestIds.size}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-300">
                    manifiestos seleccionados
                  </span>
                </div>
                <div className="h-4 w-px bg-slate-700/60 shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFusionModalOpen(true)}
                  className="h-8 rounded-lg text-xs px-3 font-semibold gap-1.5 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 shrink-0 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Crear Mega-Man
                </Button>
                <div className="h-4 w-px bg-slate-700/60 shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMoveSelectedManifestsToTransitoria}
                  className="h-8 rounded-lg text-xs px-3 font-semibold gap-1.5 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 shrink-0 transition-colors"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  A Transitoria
                </Button>
                <div className="h-4 w-px bg-slate-700/60 shrink-0" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedManifestIds(new Set())}
                  className="h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 shrink-0 transition-colors"
                  title="Limpiar selección"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Mega-Man Fusion Dialog ── */}
      <Dialog
        open={fusionModalOpen}
        onOpenChange={(open) => {
          if (!open && !fusing) {
            setFusionModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-md p-6 rounded-xl bg-background border border-border shadow-lg">
          <DialogHeader className="space-y-1.5 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Fusionar Manifiestos de Encomiendas
            </DialogTitle>
          </DialogHeader>

          {fusing ? (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Fusionando manifiestos...</p>
                <p className="text-xs text-muted-foreground animate-pulse font-medium">
                  {progressMessage || "Sincronizando Firestore..."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Vas a fusionar los manifiestos seleccionados en un único manifiesto <strong>MEGA-MAN</strong> de encomiendas. Todos los paquetes, facturas, encomiendas y consolidaciones se vincularán reactivamente.
              </p>

              {/* Source Manifests list */}
              <div className="bg-muted/40 rounded-lg border border-border p-3 space-y-2 max-h-32 overflow-y-auto">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Manifiestos de origen ({selectedManifestIds.size}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedManifestIds).map((id) => (
                    <Badge key={id} variant="secondary" className="text-[10px] font-mono py-0.5 px-2">
                      {id}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Destination Manifest name input and preview */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="custom-mega-name" className="text-xs font-bold text-foreground">
                    Identificador del manifiesto destino:
                  </label>
                  <Input
                    id="custom-mega-name"
                    value={megaManCustomName}
                    onChange={(e) => {
                      const cleanValue = e.target.value
                        .toUpperCase()
                        .replace(/\s+/g, "-")
                        .replace(/[^A-Z0-9_-]/g, "");
                      setMegaManCustomName(cleanValue);
                    }}
                    placeholder={`ENC-MEGA-MAN-${dateSuffix}`}
                    className="h-9 font-mono text-xs uppercase"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Tiene control total para editar tanto el nombre como el sufijo de fecha del manifiesto consolidado.
                  </p>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/20 p-3 space-y-0.5">
                  <p className="text-[10px] font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wider">
                    Identificador Final (MEGA-MAN ID):
                  </p>
                  <p className="text-xs font-mono font-bold text-blue-900 dark:text-blue-200 break-all">
                    {megaManCustomName.trim() || "[Identificador Vacío]"}
                  </p>
                </div>
              </div>

              {/* Detailed Technical Actions & Rollback Shield */}
              <div className="space-y-2.5">
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    Detalle de la Operación (¿Qué hará?)
                  </div>
                  <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-1 leading-normal">
                    <li>Extraerá los paquetes con <strong className="text-foreground">ruta = "Encomiendas"</strong> de los manifiestos origen.</li>
                    <li>Migrará atómicamente paquetes, facturas y consolidaciones al ID <strong className="text-foreground">{megaManCustomName.trim()}</strong>.</li>
                    <li>Los manifiestos origen quedarán vacíos y se archivarán (los de carga mixta mantendrán el resto de paquetes y recalcularán totales).</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/10 dark:border-emerald-900/30 dark:bg-emerald-950/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-emerald-200/50 dark:border-emerald-900/30 text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Mecanismo de Respaldo Integrado (Anti-Fallos)
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-normal">
                    En caso de cualquier interrupción o error, se activa un <strong className="text-emerald-800 dark:text-emerald-200">rollback automático</strong> instantáneo que:
                  </p>
                  <ul className="list-disc pl-4 text-[10.5px] text-emerald-600 dark:text-emerald-400 space-y-0.5 leading-normal">
                    <li>Restaura el estado original exacto de los manifiestos origen mediante snapshots de seguridad.</li>
                    <li>Devuelve la asociación de trackings y facturas a sus manifiestos originales.</li>
                    <li>Elimina el ID de fusión fallido de la base de datos para garantizar consistencia.</li>
                  </ul>
                </div>
              </div>

              {/* Dialog Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFusionModalOpen(false)}
                  disabled={fusing}
                  className="h-8 text-xs px-3"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleFusion}
                  disabled={fusing || !megaManCustomName.trim()}
                  className="h-8 text-xs px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 shadow"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirmar Fusión
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </DashboardLayout>
    </LiveInvoiceContext.Provider>
  );
}
