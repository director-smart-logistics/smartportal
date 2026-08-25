import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, getDocs, collection, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { firebaseApi } from "@/lib/firebase/callable";
import { syncInvoicesToSp2 } from "@/lib/services/sync-invoices-service";
import { movePackagesBetweenManifestDocs } from "@/lib/services/manifest-consolidation-service";
import { getCustomerServiceSuggestion } from "@/lib/services/encomienda-suggestions";
import { recomputeInvoiceCRC } from "@/lib/services/update-exchange-rate-service";
import { isOrphanSlCode, TEMP_WARNING_TITLE } from "@/lib/utils/invoice-reassign";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { logAction } from "@/lib/services/audit-service";
import { useUsers } from "@/lib/hooks/queries/useUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  X,
  User,
  FileText,
  Scale,
  Weight,
  PlusCircle,
  Sparkles,
  Loader2,
  ArrowRightLeft,
  Trash2,
  Info,
  Package as PackageIcon,
  Check,
  Copy,
  AlertTriangle,
  Mail,
  Phone,
  CreditCard,
  Hash,
  Tag,
  DollarSign,
  Calendar,
  Percent,
  FileSpreadsheet,
  History,
  MapPin,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { Invoice, InvoiceStatus } from "../../types";
import { ManifestPicker } from "@/components/manifest/ManifestPicker";

interface EditInvoiceModalProps {
  isOpen: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  invoices: Invoice[];
  allManifestNumbers?: string[];
  manifestPackageCounts?: Map<string, number>;
}

export function EditInvoiceModal({
  isOpen,
  invoice,
  onClose,
  invoices,
  allManifestNumbers,
  manifestPackageCounts,
}: EditInvoiceModalProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: users } = useUsers();

  const [editClientName, setEditClientName] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientDni, setEditClientDni] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editDueDate, setEditDueDate] = useState("");
  const [editManifestNumber, setEditManifestNumber] = useState("");
  const [editDiscountPercentage, setEditDiscountPercentage] = useState(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editPaymentReference, setEditPaymentReference] = useState("");
  const [editExchangeRate, setEditExchangeRate] = useState(0);
  const [editOriginalExchangeRate, setEditOriginalExchangeRate] = useState(0);
  const [editTcAlsoPackages, setEditTcAlsoPackages] = useState(true);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editInternalNotes, setEditInternalNotes] = useState("");
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");

  const [pkgWeightCache, setPkgWeightCache] = useState<Map<string, number>>(new Map());
  const [moveItemPopover, setMoveItemPopover] = useState<{ itemIdx: number } | null>(null);
  const [movingItemIdx, setMovingItemIdx] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [packageTrackingLogs, setPackageTrackingLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    const loadFullInvoice = async () => {
      setEditStatus(invoice.status);
      setEditDiscountPercentage(invoice.discountPercentage ?? 0);
      setEditNotes(invoice.notes ?? "");
      setEditInternalNotes((invoice as any).internalNotes ?? "");
      setEditCurrency(invoice.currency ?? "USD");
      const dueDateStr = invoice.dueDate
        ? (typeof invoice.dueDate === 'string'
          ? invoice.dueDate
          : (invoice.dueDate as any)?.toDate?.()?.toISOString?.() ?? String(invoice.dueDate))
        : "";
      setEditDueDate(dueDateStr ? dueDateStr.slice(0, 10) : "");
      setEditClientName(invoice.clientName ?? invoice.customer?.fullName ?? "");
      setEditClientEmail(invoice.clientEmail ?? invoice.customer?.email ?? "");
      setEditClientPhone(invoice.clientPhone ?? invoice.customer?.phone ?? "");
      setEditClientDni(invoice.clientDni ?? "");
      setEditManifestNumber(invoice.manifestNumber ?? "");
      setEditPaymentMethod((invoice as any).paymentMethod ?? "");
      setEditPaymentReference((invoice as any).paymentReference ?? "");

      let fullInvoice: any = invoice;
      try {
        const snap = await getDoc(doc(db, 'invoices', invoice.id));
        if (snap.exists()) fullInvoice = { id: snap.id, ...snap.data() };
      } catch { /* fall back */ }

      const resolvedTC =
        Number(fullInvoice.exchangeRate) ||
        (Number(fullInvoice.totalAmount) > 0 && fullInvoice.amountCRC
          ? Math.round(fullInvoice.amountCRC / Number(fullInvoice.totalAmount) * 100) / 100
          : 0);
      setEditExchangeRate(resolvedTC);
      setEditOriginalExchangeRate(resolvedTC);
      setEditTcAlsoPackages(true);

      const novaItems: any[] = fullInvoice.items ?? [];
      const spItems: any[] = fullInvoice.invoiceItems ?? [];
      const mergedItems = spItems.length > 0 ? spItems.map((i: any) => ({
        trackingNumber: i.trackingNumber ?? '',
        description: i.description ?? '',
        weight: i.realWeight ?? i.weight ?? 0,
        realWeight: i.realWeight ?? i.weight ?? 0,
        unitPrice: i.unitPrice ?? i.totalPrice ?? 0,
        quantity: i.quantity ?? 1,
        packageId: i.packageId,
        isManual: i.isManual,
        currency: (i.currency === 'CRC' ? 'CRC' : 'USD') as 'USD' | 'CRC',
        requiresPermit: !!(i.requiresPermit || i.package?.requiresPermit),
      })) : novaItems.map((i: any) => ({
        trackingNumber: i.tracking ?? '',
        description: i.description ?? '',
        weight: i.realWeight ?? i.weight ?? 0,
        realWeight: i.realWeight ?? i.weight ?? 0,
        unitPrice: i.amount ?? i.subtotal ?? 0,
        quantity: 1,
        packageId: undefined,
        isManual: false,
        currency: 'USD' as 'USD' | 'CRC',
      }));
      setEditItems(mergedItems);

      const trackings = mergedItems.map(i => i.trackingNumber).filter(Boolean) as string[];
      if (trackings.length > 0) {
        const newMap = new Map<string, number>();
        const chunks: string[][] = [];
        for (let i = 0; i < trackings.length; i += 30) chunks.push(trackings.slice(i, i + 30));
        await Promise.all(chunks.map(async chunk => {
          const snap = await getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)));
          snap.forEach(d => {
            const data = d.data();
            const actualW = data.peso ?? data.weight;
            if (data.trackingNumber && actualW != null) newMap.set(data.trackingNumber, Number(actualW));
          });
        }));
        setPkgWeightCache(newMap);

        // If it's a consolidated invoice, automatically update editItems weights to be the real package weights!
        if (fullInvoice.isConsolidation !== false) {
          setEditItems(prev => prev.map(item => {
            const actual = newMap.get(item.trackingNumber);
            return {
              ...item,
              weight: actual != null ? actual : item.weight,
              realWeight: actual != null ? actual : (item.realWeight ?? item.weight)
            };
          }));
        }
      }
    };
    loadFullInvoice();
  }, [invoice]);

  const sameClientTargetInvoices = useMemo(() => {
    if (!invoice) return [];
    const srcKey = invoice.slCode ?? invoice.customerId ?? '';
    if (!srcKey) return [];
    return invoices.filter(inv =>
      inv.id !== invoice.id &&
      (inv.slCode === srcKey || inv.customerId === srcKey) &&
      (inv.status === 'draft' || inv.status === 'overdue')
    );
  }, [invoices, invoice]);

  const formatTimeEntry = (dateInput: any) => {
    if (!dateInput) return "—";
    try {
      let d: Date;
      if (dateInput instanceof Date) {
        d = dateInput;
      } else if (typeof dateInput === 'object' && dateInput !== null) {
        const seconds = dateInput._seconds ?? dateInput.seconds;
        if (typeof seconds === 'number') {
          d = new Date(seconds * 1000);
        } else {
          d = new Date(dateInput);
        }
      } else {
        d = new Date(dateInput);
      }
      return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CR");
    } catch {
      return "—";
    }
  };

  useEffect(() => {
    if (!isOpen || !invoice || invoice.status !== 'annulled') {
      setPackageTrackingLogs([]);
      return;
    }

    const fetchPackageLogs = async () => {
      if (editItems.length === 0) {
        return;
      }

      setLoadingLogs(true);
      try {
        const trackings = editItems
          .map((item: any) => item.trackingNumber?.trim()?.toUpperCase())
          .filter(Boolean);

        if (trackings.length === 0) {
          setPackageTrackingLogs([]);
          setLoadingLogs(false);
          return;
        }

        const chunks: string[][] = [];
        for (let i = 0; i < trackings.length; i += 30) {
          chunks.push(trackings.slice(i, i + 30));
        }

        const pkgDocs: any[] = [];
        await Promise.all(chunks.map(async (chunk) => {
          const q = query(collection(db, 'packages'), where('trackingNumber', 'in', chunk));
          const snap = await getDocs(q);
          snap.forEach(d => {
            pkgDocs.push({ id: d.id, ...d.data() });
          });
        }));

        const transitoriaDocs: Record<string, any> = {};
        await Promise.all(chunks.map(async (chunk) => {
          const q = query(collection(db, 'manifest_consolidation'), where('tracking', 'in', chunk));
          const snap = await getDocs(q);
          snap.forEach(d => {
            transitoriaDocs[d.id] = d.data();
          });
        }));

        const resolvedLogs = trackings.map(tr => {
          const pkg = pkgDocs.find(p => p.trackingNumber?.toUpperCase() === tr || p.tracking?.toUpperCase() === tr);
          const trans = transitoriaDocs[tr];

          let currentLocation = 'Desconocido';
          if (pkg?.manifestNumber) {
            if (pkg.manifestNumber === 'consolidacion_transitoria') {
              currentLocation = 'Consolidación Transitoria';
            } else {
              currentLocation = `Manifiesto: ${pkg.manifestNumber}`;
            }
          } else if (trans) {
            currentLocation = 'Consolidación Transitoria';
          }

          const history = pkg?.statusHistory || [];
          const relevantHistory = history.map((h: any) => ({
            changedAt: h.changedAt || h.timestamp || '',
            note: h.note || `Cambio de estado a ${h.status}`,
            changedBy: h.changedBy || 'sistema'
          }));

          const isMovedToOtherManifest = !!(pkg?.manifestNumber && invoice.manifestNumber && pkg.manifestNumber !== invoice.manifestNumber && pkg.manifestNumber !== 'consolidacion_transitoria');
          return {
            tracking: tr,
            currentLocation,
            status: pkg?.status || trans?.invoiceStatus || 'Desvinculado',
            weight: pkg?.weight || trans?.weight || 0,
            history: relevantHistory,
            isMovedToOtherManifest,
            originalManifest: invoice.manifestNumber || '',
            currentManifest: pkg?.manifestNumber || ''
          };
        });

        setPackageTrackingLogs(resolvedLogs);
      } catch (err) {
        console.error("Error fetching package logs:", err);
      } finally {
        setLoadingLogs(false);
      }
    };

    fetchPackageLogs();
  }, [isOpen, invoice, editItems]);

  const groupedPackageLogs = useMemo(() => {
    if (packageTrackingLogs.length === 0) return [];

    const groups: Map<string, {
      trackings: string[];
      weights: number[];
      currentLocation: string;
      status: string;
      isMovedToOtherManifest: boolean;
      originalManifest: string;
      currentManifest: string;
      history: any[];
    }> = new Map();

    for (const log of packageTrackingLogs) {
      const resolvedHistory = (log.history || []).map((h: any) => {
        const op = h.changedBy || 'sistema';
        let resolved = op;
        if (users) {
          const matched = users.find(u => u.id === op || u.email?.toLowerCase() === op.toLowerCase());
          if (matched) {
            resolved = matched.fullName && matched.email && matched.fullName !== matched.email
              ? `${matched.fullName} (${matched.email})`
              : (matched.fullName || matched.email || op);
          }
        }
        return { ...h, changedBy: resolved };
      });

      const historySummary = resolvedHistory
        .map((h: any) => `${h.note || ''}|${h.status || ''}|${h.changedBy || ''}`)
        .join('###');
      
      const groupKey = `${log.currentLocation}@@@${historySummary}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          trackings: [log.tracking],
          weights: [log.weight],
          currentLocation: log.currentLocation,
          status: log.status,
          isMovedToOtherManifest: log.isMovedToOtherManifest,
          originalManifest: log.originalManifest,
          currentManifest: log.currentManifest,
          history: resolvedHistory,
        });
      } else {
        const group = groups.get(groupKey)!;
        group.trackings.push(log.tracking);
        group.weights.push(log.weight);
      }
    }

    return Array.from(groups.values()).map(g => {
      const totalWeight = g.weights.reduce((sum, w) => sum + w, 0);
      return {
        trackings: g.trackings,
        weight: totalWeight,
        currentLocation: g.currentLocation,
        status: g.status,
        isMovedToOtherManifest: g.isMovedToOtherManifest,
        originalManifest: g.originalManifest,
        currentManifest: g.currentManifest,
        history: g.history,
      };
    });
  }, [packageTrackingLogs, users]);

  const liveTotals = useMemo(() => {
    const toUSD = (price: number, currency?: 'USD' | 'CRC') =>
      currency === 'CRC' && editExchangeRate > 0
        ? Math.round(price / editExchangeRate * 100) / 100
        : price;

    const subtotal = editItems.reduce((s, i) => s + toUSD(i.unitPrice, i.currency) * i.quantity, 0);
    const totalWeight = editItems.reduce((s, i) => s + i.weight, 0);
    const discountAmt = Math.round(subtotal * (editDiscountPercentage / 100) * 100) / 100;
    const total = Math.round((subtotal - discountAmt) * 100) / 100;
    const totalCRC = editExchangeRate > 0 ? Math.round(total * editExchangeRate) : 0;

    return {
      subtotal,
      totalWeight,
      discountAmt,
      total,
      totalCRC,
    };
  }, [editItems, editDiscountPercentage, editExchangeRate]);

  const handleSuggestAIService = async () => {
    if (!invoice) return;
    setIsSuggesting(true);
    try {
      const slCode = invoice.slCode || (invoice as any).clientSlCode || invoice.customerId;
      if (!slCode || slCode.startsWith('__')) {
        toast({ title: "Sin código SL", description: "No se puede sugerir servicio para un cliente sin código SL.", variant: "default" });
        return;
      }

      const customerName = (invoice.clientName ?? invoice.customer?.fullName ?? "");
      const suggestion = await getCustomerServiceSuggestion(slCode, customerName);
      if (!suggestion) {
        toast({ title: "Sin historial", description: "No hay suficiente historial de servicios para este cliente.", variant: "default" });
        return;
      }

      const cleanDesc = suggestion.description.trim() || "SERVICIO DE TERCERO";
      toast({
        title: "Sugerencia obtenida",
        description: `${cleanDesc} — $${suggestion.amount.toFixed(2)}`,
      });

      setEditItems(prev => [
        ...prev,
        {
          trackingNumber: '',
          description: cleanDesc,
          weight: 0,
          unitPrice: suggestion.amount,
          quantity: 1,
          isManual: true,
          currency: 'USD' as const,
        }
      ]);
    } catch (err) {
      toast({ title: "Error al sugerir servicio", description: String(err), variant: "destructive" });
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSaveEditInvoice = async () => {
    if (!invoice) return;
    setIsSaving(true);
    try {
      const toUSD = (price: number, currency?: 'USD' | 'CRC') =>
        currency === 'CRC' && editExchangeRate > 0
          ? Math.round(price / editExchangeRate * 100) / 100
          : price;

      let externalManualItems: any[] = [];
      try {
        const latestSnap = await getDoc(doc(db, 'invoices', invoice.id));
        if (latestSnap.exists()) {
          const firestoreItems: any[] = latestSnap.data().invoiceItems ?? [];
          const editKeys = new Set(editItems.map(i => `${i.trackingNumber ?? ''}|${i.description}`));
          externalManualItems = firestoreItems.filter(
            (fi: any) => fi.isManual && !editKeys.has(`${fi.trackingNumber ?? ''}|${fi.description}`)
          );
        }
      } catch { /* proceed */ }

      const updatedInvoiceItems = [
        ...editItems.map(i => ({
          packageId: i.packageId || undefined,
          trackingNumber: i.trackingNumber || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: toUSD(i.unitPrice, i.currency),
          totalPrice: Math.round(toUSD(i.unitPrice, i.currency) * i.quantity * 100) / 100,
          weight: i.weight,
          realWeight: i.realWeight ?? i.weight,
          isManual: i.isManual ?? false,
          currency: i.currency ?? 'USD',
          requiresPermit: i.requiresPermit ?? false,
        })),
        ...externalManualItems,
      ];
      const hasPermitItems = updatedInvoiceItems.some(i => i.requiresPermit);
      const updatedNovaItems = [
        ...editItems.map(i => ({
          tracking: i.trackingNumber || '',
          description: i.description || '',
          weight: i.weight || 0,
          realWeight: i.realWeight ?? i.weight ?? 0,
          amount: toUSD(i.unitPrice, i.currency),
          subtotal: toUSD(i.unitPrice, i.currency),
          iva: 0,
          currency: 'USD',
          isManual: i.isManual ?? false,
          isPermiso: i.requiresPermit ?? false,
        })),
        ...externalManualItems.map(i => ({
          tracking: i.trackingNumber || '',
          description: i.description || '',
          weight: i.weight || 0,
          realWeight: i.realWeight ?? i.weight ?? 0,
          amount: i.unitPrice || i.totalPrice || 0,
          subtotal: i.unitPrice || i.totalPrice || 0,
          iva: 0,
          currency: 'USD',
          isManual: true,
          isPermiso: false,
        })),
      ];
      const newSubtotal = editItems.reduce((s, i) => s + toUSD(i.unitPrice, i.currency) * i.quantity, 0);
      const newTotalWeight = editItems.reduce((s, i) => s + i.weight, 0);
      const discountAmt = Math.round(newSubtotal * (editDiscountPercentage / 100) * 100) / 100;
      const newTotal = Math.round((newSubtotal - discountAmt) * 100) / 100;

      const editTrackings = editItems.map(i => i.trackingNumber).filter(Boolean) as string[];
      const derivedManifests = new Set<string>();
      const pkgSnapDocs: Array<{ id: string; data: () => any }> = [];
      if (editTrackings.length > 0) {
        const mChunks: string[][] = [];
        for (let i = 0; i < editTrackings.length; i += 30) mChunks.push(editTrackings.slice(i, i + 30));
        await Promise.all(mChunks.map(async chunk => {
          const snap = await getDocs(query(collection(db, 'packages'), where('trackingNumber', 'in', chunk)));
          snap.forEach(d => { pkgSnapDocs.push(d as any); const mn = d.data().manifestNumber; if (mn) derivedManifests.add(String(mn)); });
        }));
      }
      const finalManifestNumber = editManifestNumber || [...derivedManifests][0] || undefined;
      const finalManifestNumbers = derivedManifests.size > 0 ? [...derivedManifests] : undefined;
      const statusChanged = editStatus !== invoice.status;

      const newTrackingNumbers = Array.from(new Set(
        updatedInvoiceItems
          .map((i: any) => i.trackingNumber || i.tracking)
          .filter((t: any) => typeof t === 'string' && t.trim().length > 0),
      ));
      const newPackageCount = newTrackingNumbers.length;
      const newPrimaryTracking = newTrackingNumbers.length === 1 ? newTrackingNumbers[0] : undefined;

      await firebaseApi.invoices.update(invoice.id, {
        ...(statusChanged ? { status: editStatus } : {}),
        invoiceItems: updatedInvoiceItems,
        items: updatedNovaItems,
        totalAmount: newTotal,
        subtotalAmount: newSubtotal,
        discountAmount: discountAmt,
        discountPercentage: editDiscountPercentage,
        totalWeight: newTotalWeight,
        currency: editCurrency,
        amount: newTotal,
        subtotal: newSubtotal,
        iva: 0,
        trackingNumbers: newTrackingNumbers,
        trackingNumber: newPrimaryTracking,
        packageCount: newPackageCount,
        dueDate: editDueDate || undefined,
        notes: editNotes || undefined,
        internalNotes: editInternalNotes || undefined,
        clientName: editClientName || undefined,
        clientEmail: editClientEmail || undefined,
        clientPhone: editClientPhone || undefined,
        clientDni: editClientDni || undefined,
        manifestNumber: finalManifestNumber,
        manifestNumbers: finalManifestNumbers,
        hasPermitItems,
        paymentMethod: editPaymentMethod || undefined,
        paymentReference: editPaymentReference || undefined,
        exchangeRate: editExchangeRate > 0 ? editExchangeRate : undefined,
        ...(editExchangeRate > 0
          ? recomputeInvoiceCRC(
            { totalAmount: newTotal, ivaEnabled: (invoice as any).ivaEnabled },
            editExchangeRate,
          )
          : {}),
      } as any);

      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_updated',
        category: 'invoice',
        resource: '/invoices',
        resourceId: invoice.id,
        result: 'success',
        metadata: {
          invoiceNumber: invoice.invoiceNumber || invoice.id,
          totalAmount: newTotal,
          previousAmount: invoice.totalAmount,
          status: statusChanged ? editStatus : invoice.status,
          previousStatus: invoice.status,
          note: `Factura editada y guardada. ${statusChanged ? `Estado cambiado de ${invoice.status} a ${editStatus}.` : ''}`
        }
      });

      const oldManifest = invoice.manifestNumber;
      if (finalManifestNumber && finalManifestNumber !== oldManifest && pkgSnapDocs.length > 0) {
        const now = new Date().toISOString();
        const pkgBatch = writeBatch(db);
        let pkgOps = 0;
        pkgSnapDocs.forEach((d: any) => {
          pkgBatch.update(doc(db, 'packages', d.id), {
            manifestNumber: finalManifestNumber,
            updatedManifest: finalManifestNumber,
            manifestUpdatedAt: now,
          });
          pkgOps++;
        });
        if (pkgOps > 0) await pkgBatch.commit();
        if (oldManifest) {
          await movePackagesBetweenManifestDocs(editTrackings, oldManifest, finalManifestNumber, [invoice.id]).catch(() => { });
        }
      }

      const tcChanged = editOriginalExchangeRate > 0
        && editExchangeRate > 0
        && Math.abs(editExchangeRate - editOriginalExchangeRate) >= 0.01;
      if (tcChanged && editTcAlsoPackages && pkgSnapDocs.length > 0) {
        try {
          const now = new Date().toISOString();
          const BATCH_CAP = 400;
          let tcOps = 0;
          for (let i = 0; i < pkgSnapDocs.length; i += BATCH_CAP) {
            const chunk = pkgSnapDocs.slice(i, i + BATCH_CAP);
            const tcBatch = writeBatch(db);
            chunk.forEach((d: any) => {
              const data = d.data?.() ?? {};
              const cost = Number(data.cost ?? data.price ?? 0);
              const costCRC = Number.isFinite(cost) && cost > 0
                ? Math.round(cost * editExchangeRate)
                : 0;
              tcBatch.update(doc(db, 'packages', d.id), {
                exchangeRate: editExchangeRate,
                costCRC,
                exchangeRateUpdatedAt: now,
                exchangeRateUpdatedBy: 'invoice_edit',
                exchangeRateUpdateReason: `TC correction from invoice ${invoice.invoiceNumber} edit`,
              });
              tcOps++;
            });
            await tcBatch.commit();
          }
        } catch (tcErr) {
          console.warn('[InvoiceEdit] package TC propagation failed:', tcErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });

      try {
        const updatedSelf = {
          ...invoice,
          status: statusChanged ? editStatus : invoice.status,
          invoiceItems: updatedInvoiceItems,
          items: updatedNovaItems,
          totalAmount: newTotal,
          subtotalAmount: newSubtotal,
          discountAmount: discountAmt,
          discountPercentage: editDiscountPercentage,
          totalWeight: newTotalWeight,
          currency: editCurrency,
        };
        syncInvoicesToSp2([updatedSelf] as any).catch(err => {
          console.warn('[handleSaveEditInvoice] SP2 sync failed:', err);
        });
      } catch (err) {
        console.warn('[handleSaveEditInvoice] SP2 sync preparation failed:', err);
      }

      toast({
        title: t("common.success"),
        description: tcChanged && editTcAlsoPackages && pkgSnapDocs.length > 0
          ? `Factura actualizada · TC propagado a ${pkgSnapDocs.length} paquete${pkgSnapDocs.length !== 1 ? 's' : ''}`
          : 'Factura actualizada',
      });
      onClose();
    } catch (error) {
      console.error("Failed to update invoice:", error);
      toast({ title: t("common.error"), description: "Error al actualizar la factura", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMoveItem = async (itemIdx: number, targetInvoiceId: string) => {
    if (!invoice) return;
    const item = editItems[itemIdx];
    if (!item) return;
    setMoveItemPopover(null);
    setMovingItemIdx(itemIdx);
    try {
      const targetSnap = await getDoc(doc(db, 'invoices', targetInvoiceId));
      if (!targetSnap.exists()) throw new Error('Factura destino no encontrada.');
      const targetData = targetSnap.data() as any;

      const toUSD = (price: number, currency?: string, tc?: number): number =>
        currency === 'CRC' && tc && tc > 0
          ? Math.round(price / tc * 100) / 100
          : price;
      const recalcTotals = (
        spItems: Array<{ unitPrice: number; quantity: number; totalPrice: number; weight?: number }>,
        discountPct: number
      ) => {
        const subtotal = spItems.reduce((s, i) => s + (i.totalPrice ?? i.unitPrice * i.quantity), 0);
        const discountAmt = Math.round(subtotal * (discountPct / 100) * 100) / 100;
        const total = Math.round((subtotal - discountAmt) * 100) / 100;
        const weight = spItems.reduce((s, i) => s + (i.weight ?? 0), 0);
        return { subtotal, discountAmt, total, weight };
      };

      const itemUnitPriceUSD = toUSD(item.unitPrice, item.currency, editExchangeRate);
      const movedSpItem = {
        packageId: item.packageId ?? undefined,
        trackingNumber: item.trackingNumber || undefined,
        description: item.description,
        quantity: item.quantity,
        unitPrice: itemUnitPriceUSD,
        totalPrice: Math.round(itemUnitPriceUSD * item.quantity * 100) / 100,
        weight: item.weight,
        isManual: item.isManual ?? false,
        currency: 'USD',
        requiresPermit: item.requiresPermit ?? false,
      };
      const movedNovaItem = {
        tracking: item.trackingNumber,
        description: item.description,
        weight: item.weight,
        amount: itemUnitPriceUSD,
        subtotal: itemUnitPriceUSD,
        iva: 0,
        currency: 'USD',
      };

      const newSourceItems = editItems.filter((_, i) => i !== itemIdx);
      const srcSpItems = newSourceItems.map(i => {
        const usdPrice = toUSD(i.unitPrice, i.currency, editExchangeRate);
        return {
          packageId: i.packageId ?? undefined,
          trackingNumber: i.trackingNumber || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: usdPrice,
          totalPrice: Math.round(usdPrice * i.quantity * 100) / 100,
          weight: i.weight,
          isManual: i.isManual ?? false,
          currency: 'USD',
          requiresPermit: i.requiresPermit ?? false,
        };
      });
      const srcNovaItems = newSourceItems.map(i => ({
        tracking: i.trackingNumber,
        description: i.description,
        weight: i.weight,
        amount: toUSD(i.unitPrice, i.currency, editExchangeRate),
        subtotal: toUSD(i.unitPrice, i.currency, editExchangeRate),
        iva: 0,
        currency: 'USD',
      }));
      const srcTotals = recalcTotals(srcSpItems, editDiscountPercentage);

      const tgtDiscount = Number(targetData.discountPercentage) || 0;
      const tgtSpItems = [...(targetData.invoiceItems ?? []), movedSpItem];
      const tgtNovaItems = [...(targetData.items ?? []), movedNovaItem];
      const tgtTotals = recalcTotals(tgtSpItems, tgtDiscount);

      const batch = writeBatch(db);
      const now = new Date().toISOString();

      batch.update(doc(db, 'invoices', invoice.id), {
        invoiceItems: srcSpItems,
        items: srcNovaItems,
        totalAmount: srcTotals.total,
        subtotalAmount: srcTotals.subtotal,
        discountAmount: srcTotals.discountAmt,
        totalWeight: srcTotals.weight,
        updatedAt: now,
      });
      batch.update(doc(db, 'invoices', targetInvoiceId), {
        invoiceItems: tgtSpItems,
        items: tgtNovaItems,
        totalAmount: tgtTotals.total,
        subtotalAmount: tgtTotals.subtotal,
        discountAmount: tgtTotals.discountAmt,
        totalWeight: tgtTotals.weight,
        updatedAt: now,
      });
      await batch.commit();

      setEditItems(newSourceItems);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoice', targetInvoiceId] });

      try {
        const updatedSource = {
          ...invoice,
          invoiceItems: srcSpItems,
          items: srcNovaItems,
          totalAmount: srcTotals.total,
          subtotalAmount: srcTotals.subtotal,
          discountAmount: srcTotals.discountAmt,
          totalWeight: srcTotals.weight,
        };
        const updatedTarget = {
          ...targetData,
          id: targetInvoiceId,
          invoiceItems: tgtSpItems,
          items: tgtNovaItems,
          totalAmount: tgtTotals.total,
          subtotalAmount: tgtTotals.subtotal,
          discountAmount: tgtTotals.discountAmt,
          totalWeight: tgtTotals.weight,
        };
        
        syncInvoicesToSp2([updatedSource, updatedTarget] as any).catch(err => {
          console.warn('[handleMoveItem] SP2 sync failed:', err);
        });
      } catch (err) {
        console.warn('[handleMoveItem] SP2 sync preparation failed:', err);
      }

      const targetInv = invoices.find(i => i.id === targetInvoiceId);
      toast({
        title: 'Item movido correctamente',
        description: `"${item.description || item.trackingNumber || 'Item'}" → ${targetInv?.invoiceNumber ?? targetInvoiceId}`,
      });
    } catch (err) {
      toast({
        title: 'Error al mover el item',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setMovingItemIdx(null);
    }
  };

  if (!isOpen || !invoice) return null;

  const STATUS_DOT: Record<InvoiceStatus, string> = {
    draft: "bg-muted-foreground",
    sent: "bg-blue-500",
    paid: "bg-emerald-500",
    overdue: "bg-amber-500",
    cancelled: "bg-red-500",
    annulled: "bg-muted-foreground",
    deleted: "bg-destructive/40",
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden"
        role="dialog"
        aria-labelledby="edit-invoice-title"
        aria-modal="true"
        data-testid="edit-invoice-modal"
      >
        <div className="flex flex-col w-full h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 shrink-0">
            <div>
              <h2 id="edit-invoice-title" className="text-base font-bold text-foreground flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Editar factura
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{invoice.invoiceNumber}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cerrar"
              data-testid="close-edit-modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/20 dark:bg-slate-900/5">
            <div className="max-w-7xl mx-auto p-6 space-y-6">
              
              {/* 1. CABECERA DE LA FACTURA (Metadatos en estilo Excel Sheet) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2 select-none">
                    <FileText className="h-4 w-4 text-primary" />
                    1. Cabecera de la Factura (Metadatos)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-l border-border rounded-lg overflow-hidden bg-card shadow-sm">
                  
                  {/* Cell 1: Nombre */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground/80" />
                      Nombre
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        placeholder="Nombre completo"
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none font-sans text-foreground"
                      />
                    </div>
                  </div>

                  {/* Cell 2: Email */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <Mail className="h-3 w-3 text-muted-foreground/80" />
                      Email
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        type="email"
                        value={editClientEmail}
                        onChange={(e) => setEditClientEmail(e.target.value)}
                        placeholder="correo@ejemplo.com"
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none font-sans text-foreground"
                      />
                    </div>
                  </div>

                  {/* Cell 3: Teléfono */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <Phone className="h-3 w-3 text-muted-foreground/80" />
                      Teléfono
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        value={editClientPhone}
                        onChange={(e) => setEditClientPhone(e.target.value)}
                        placeholder="+506 8888-0000"
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none font-sans text-foreground"
                      />
                    </div>
                  </div>

                  {/* Cell 4: Cédula / DNI */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-muted-foreground/80" />
                      Cédula / DNI
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        value={editClientDni}
                        onChange={(e) => setEditClientDni(e.target.value)}
                        placeholder="1-0000-0000"
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none font-sans text-foreground"
                      />
                    </div>
                  </div>

                  {/* Cell 5: Cód. SL */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <Hash className="h-3 w-3 text-muted-foreground/80" />
                        Cód. SL
                      </div>
                      {(() => {
                        const code = invoice.slCode ?? "";
                        const isOrphan = isOrphanSlCode(code);
                        if (isOrphan && code) {
                          return (
                            <Badge variant="destructive" className="text-[8px] font-semibold px-1 py-0 animate-pulse">
                              Huérfano
                            </Badge>
                          );
                        } else if (code) {
                          return (
                            <Badge variant="secondary" className="text-[8px] font-semibold px-1 py-0 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0">
                              Vinculado
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="p-1 flex-1 flex items-center bg-muted/5">
                      {(() => {
                        const code = invoice.slCode ?? "";
                        const isOrphan = isOrphanSlCode(code);
                        return (
                          <input
                            value={code}
                            disabled
                            title={isOrphan && code ? TEMP_WARNING_TITLE : undefined}
                            className={cn(
                              "w-full bg-transparent border-0 px-2 py-1 text-xs font-mono font-bold focus:ring-0 focus:outline-none",
                              isOrphan && code ? "text-red-650 dark:text-red-400" : "text-muted-foreground"
                            )}
                          />
                        );
                      })()}
                    </div>
                  </div>

                  {/* Cell 6: Estado */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <Tag className="h-3 w-3 text-muted-foreground/80" />
                      Estado
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <Select value={editStatus} onValueChange={(v) => setEditStatus(v as InvoiceStatus)}>
                        <SelectTrigger className="w-full h-8 bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus-visible:ring-0 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["draft", "sent", "paid", "overdue", "cancelled", "annulled"] as InvoiceStatus[]).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[s])} aria-hidden />
                                {t(s)}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Cell 7: Moneda */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-muted-foreground/80" />
                      Moneda
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <Select value={editCurrency} onValueChange={setEditCurrency}>
                        <SelectTrigger className="w-full h-8 bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus-visible:ring-0 shadow-none font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["USD", "CRC", "EUR"].map((c) => (
                            <SelectItem key={c} value={c} className="text-xs font-semibold">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Cell 8: Vencimiento */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground/80" />
                      Vencimiento
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none text-foreground font-sans animate-none"
                      />
                    </div>
                  </div>

                  {/* Cell 9: N° Manifiesto */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <FileSpreadsheet className="h-3 w-3 text-muted-foreground/80" />
                      N° Manifiesto
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <ManifestPicker
                        allManifestNumbers={allManifestNumbers || []}
                        selectedManifests={editManifestNumber ? new Set([editManifestNumber]) : new Set()}
                        onManifestsChange={(v) => {
                          const first = Array.from(v)[0] || "";
                          setEditManifestNumber(first);
                        }}
                        manifestPackageCounts={manifestPackageCounts}
                        singleSelect={true}
                        allLabel="Seleccionar manifiesto..."
                        align="start"
                        triggerClassName="w-full h-8 bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus-visible:ring-0 shadow-none font-semibold text-foreground hover:bg-accent/40 rounded-none justify-between"
                      />
                    </div>
                  </div>

                  {/* Cell 10: Descuento (%) */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <Percent className="h-3 w-3 text-muted-foreground/80" />
                      Descuento (%)
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={editDiscountPercentage}
                        onChange={(e) => setEditDiscountPercentage(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none font-mono text-foreground"
                      />
                    </div>
                  </div>

                  {/* Cell 11: Método de pago */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-muted-foreground/80" />
                      Método de Pago
                    </div>
                    <div className="p-1 flex-1 flex items-center justify-center">
                      <div className="flex h-7 bg-muted/40 p-0.5 rounded border border-border/50 w-full">
                        {(['Efectivo', 'SINPE Móvil', 'Transferencia'] as const).map(method => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setEditPaymentMethod(method)}
                            className={cn(
                              'flex-1 text-[10px] font-bold rounded-sm transition-all focus:outline-none cursor-pointer',
                              editPaymentMethod === method
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground/75 hover:text-foreground'
                            )}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Cell 12: Referencia de pago */}
                  <div className="flex flex-col border-b border-r border-border min-w-0">
                    <div className="bg-muted/30 px-3 py-1.5 border-b border-border/60 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none flex items-center gap-1">
                      <Hash className="h-3 w-3 text-muted-foreground/80" />
                      Referencia de Pago
                    </div>
                    <div className="p-1 flex-1 flex items-center">
                      <input
                        value={editPaymentReference}
                        onChange={(e) => setEditPaymentReference(e.target.value)}
                        placeholder="# Transacción o comprobante"
                        className="w-full bg-transparent border-0 px-2 py-1 text-xs focus:ring-0 focus:outline-none text-foreground"
                      />
                    </div>
                  </div>

                </div>

                {/* Warning if orphan */}
                {(() => {
                  const code = invoice.slCode ?? "";
                  const isOrphan = isOrphanSlCode(code);
                  if (isOrphan && code) {
                    return (
                      <div className="flex gap-2 p-2.5 rounded-lg border border-red-200/60 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/15 text-xs text-red-750 dark:text-red-400 leading-normal shadow-sm">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <span>
                          <strong>Atención:</strong> {TEMP_WARNING_TITLE}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* 2. DETALLE DE ITEMS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2 select-none">
                    <PackageIcon className="h-4 w-4 text-primary" />
                    2. Items de la Factura ({editItems.length})
                  </h3>
                </div>

                {/* Toolbar */}
                <div className="flex items-center justify-between border border-border bg-card rounded-lg px-4 py-2 flex-wrap gap-2 shadow-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Exchange Rate Input */}
                    <div
                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 px-2 py-0.5 rounded"
                      title="Tipo de cambio (colones por dólar) aplicado a esta factura."
                    >
                      <span className="font-bold">TC:</span>
                      <span>₡</span>
                      <input
                        id="edit-invoice-tc"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editExchangeRate || ''}
                        onChange={(e) => setEditExchangeRate(parseFloat(e.target.value) || 0)}
                        className="w-14 h-4 p-0 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-transparent border-0 focus:outline-none focus:ring-0 focus:border-0"
                        placeholder="487"
                      />
                      <span>/$</span>
                    </div>

                    {editExchangeRate > 0 && editOriginalExchangeRate > 0 &&
                      Math.abs(editExchangeRate - editOriginalExchangeRate) >= 0.01 && (
                        <label
                          className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 cursor-pointer select-none font-medium animate-pulse"
                          title="Aplica el nuevo TC también a los paquetes vinculados a esta factura (recalcula costCRC)."
                        >
                          <input
                            type="checkbox"
                            checked={editTcAlsoPackages}
                            onChange={(e) => setEditTcAlsoPackages(e.target.checked)}
                            className="h-3 w-3 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                          />
                          <span>Aplicar a paquetes</span>
                          <span className="text-amber-600/70 font-mono text-[9px]">
                            (₡{editOriginalExchangeRate.toLocaleString('es-CR')} → ₡{editExchangeRate.toLocaleString('es-CR')})
                          </span>
                        </label>
                      )}
</div>

                  {/* Action Toolbar buttons */}
                  <div className="flex items-center gap-1.5">
                    {editItems.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setEditItems(prev => prev.map(item => {
                              const actual = pkgWeightCache.get(item.trackingNumber);
                              return { ...item, weight: actual != null ? actual : item.weight };
                            }))
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded border border-border bg-background hover:bg-muted text-foreground transition-colors shadow-sm cursor-pointer"
                          title="Restaurar peso real (sin redondeo) de cada paquete"
                        >
                          <Scale className="h-3 w-3 text-muted-foreground" />
                          Quitar Redondeo
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditItems(prev => prev.map(item => ({ ...item, weight: Math.ceil(item.weight) })))
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded border border-border bg-background hover:bg-muted text-foreground transition-colors shadow-sm cursor-pointer"
                          title="Aplicar Math.ceil a todos los pesos"
                        >
                          <Weight className="h-3 w-3 text-muted-foreground" />
                          Aplicar Redondeo
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditItems(prev => [...prev, { trackingNumber: '', description: '', weight: 0, unitPrice: 0, quantity: 1, isManual: true, currency: 'USD' }])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary transition-colors shadow-sm cursor-pointer"
                      title="Agregar item manual"
                    >
                      <PlusCircle className="h-3 w-3" />
                      Agregar item
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleSuggestAIService(); }}
                      disabled={isSuggesting}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400 border border-dashed border-violet-300 dark:border-violet-700 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40 px-2.5 py-1 rounded transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                      title="Sugerir servicio basado en historial (IA)"
                    >
                      {isSuggesting
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Sparkles className="h-3 w-3" />
                      }
                      AI Sugerir
                    </button>
                  </div>
                </div>

                {/* Items Table Grid */}
                <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
                  {editItems.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground italic text-xs">
                      Sin items registrados en esta factura.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border-spacing-0 text-[11px]">
                        <thead>
                          <tr className="bg-muted/50 text-muted-foreground border-b border-border font-medium select-none text-left">
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px] min-w-[170px]">Tracking / Paquete</th>
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px]">Descripción</th>
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px] text-right w-[90px]">Peso (kg)</th>
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px] text-center w-[75px]">Moneda</th>
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px] text-right w-[110px]">Precio Unit.</th>
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px] text-center w-[70px]">Cant.</th>
                            <th className="px-3 py-2 border-r border-border font-semibold uppercase tracking-wider text-[9px] text-right w-[110px]">Subtotal</th>
                            <th className="px-3 py-2 text-center w-[75px]">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editItems.map((item, idx) => {
                            const actualWeight = pkgWeightCache.get(item.trackingNumber);
                            const isCeiled = actualWeight != null && item.weight !== actualWeight;
                            const hasUnusualUsd = (item.currency === 'USD' || !item.currency) && item.unitPrice >= 500;

                            return (
                              <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/5 focus-within:bg-muted/10 transition-colors">
                                {/* 1. Tracking / Paquete */}
                                <td className="px-3 py-1 border-r border-border align-middle font-medium bg-muted/5">
                                  <div className="flex items-center gap-1.5 justify-between">
                                    {item.trackingNumber ? (
                                      <span className="font-mono text-[11px] font-semibold text-foreground bg-muted/50 border border-border/40 px-1.5 py-0.5 rounded whitespace-nowrap" title={item.trackingNumber}>
                                        {item.trackingNumber}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground italic bg-muted/40 px-1.5 py-0.5 rounded shrink-0">Manual</span>
                                    )}
                                    {isCeiled && (
                                      <Badge variant="outline" className="text-[8px] bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 px-1 py-0 shrink-0 font-bold" title={`Peso real: ${actualWeight} kg`}>
                                        R
                                      </Badge>
                                    )}
                                  </div>
                                </td>

                                {/* 2. Descripción */}
                                <td className="p-0 border-r border-border align-middle">
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                                    className="w-full h-8 bg-transparent border-0 px-3 py-1 focus:bg-background text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="Descripción del item"
                                  />
                                </td>

                                {/* 3. Peso */}
                                <td className="p-0 border-r border-border align-middle">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.weight}
                                    onChange={(e) => {
                                      const w = parseFloat(e.target.value);
                                      setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, weight: isNaN(w) ? 0 : w } : x));
                                    }}
                                    className="w-full h-8 text-right bg-transparent border-0 px-3 py-1 focus:bg-background text-xs focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                                  />
                                </td>

                                {/* 4. Moneda */}
                                <td className="p-0 border-r border-border align-middle text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, currency: x.currency === 'CRC' ? 'USD' : 'CRC' } : x));
                                    }}
                                    className={cn(
                                      "px-2 py-0.5 rounded font-extrabold text-[9px] transition-colors shadow-sm cursor-pointer",
                                      item.currency === 'CRC'
                                        ? "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                        : "bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800"
                                    )}
                                  >
                                    {item.currency ?? 'USD'}
                                  </button>
                                </td>

                                {/* 5. Precio Unitario */}
                                <td className="p-0 border-r border-border align-middle">
                                  <div className="flex items-center gap-1 pr-2">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.unitPrice}
                                      onChange={(e) => {
                                        const p = parseFloat(e.target.value);
                                        setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, unitPrice: isNaN(p) ? 0 : p } : x));
                                      }}
                                      className="w-full h-8 text-right bg-transparent border-0 px-3 py-1 focus:bg-background text-xs focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                                    />
                                    {hasUnusualUsd && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <AlertTriangle className="h-3.5 w-3.5 text-amber-550 shrink-0 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent className="text-[10px] max-w-[220px]" side="top">
                                          ¿Monto inusual en USD? Quizás quisiste decir ₡{item.unitPrice.toLocaleString("es-CR")}.
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </td>

                                {/* 6. Cantidad */}
                                <td className="p-0 border-r border-border align-middle">
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const q = parseInt(e.target.value, 10);
                                      setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: isNaN(q) ? 1 : q } : x));
                                    }}
                                    className="w-full h-8 text-center bg-transparent border-0 px-2 py-1 focus:bg-background text-xs focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                                  />
                                </td>

                                {/* 7. Subtotal */}
                                <td className="px-3 py-1 border-r border-border align-middle text-right font-mono font-semibold text-foreground select-none bg-muted/5">
                                  {item.currency === 'CRC' ? '₡' : '$'}
                                  {(item.unitPrice * item.quantity).toLocaleString(item.currency === 'CRC' ? 'es-CR' : 'en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  }).replace(/\s/g, ".")}
                                </td>

                                {/* 8. Acciones */}
                                <td className="px-2 py-1 align-middle">
                                  <div className="flex items-center justify-center gap-1">
                                    <div className="relative shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setMoveItemPopover(prev => prev?.itemIdx === idx ? null : { itemIdx: idx })}
                                        disabled={movingItemIdx === idx || sameClientTargetInvoices.length === 0}
                                        className={cn(
                                          'p-1 rounded transition-colors cursor-pointer',
                                          sameClientTargetInvoices.length === 0
                                            ? 'text-muted-foreground/30 cursor-not-allowed'
                                            : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                        )}
                                        title={sameClientTargetInvoices.length === 0 ? 'Sin otras facturas de este cliente' : 'Mover a otra factura'}
                                      >
                                        {movingItemIdx === idx ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <ArrowRightLeft className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                      {moveItemPopover?.itemIdx === idx && (
                                        <div className="absolute right-0 top-full mt-1 z-[200] bg-card border border-border rounded-lg shadow-xl min-w-[220px] max-w-[300px] overflow-hidden text-left">
                                          <div className="px-3 py-2 border-b border-border bg-muted/50">
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Mover a factura</p>
                                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                              {item.trackingNumber || item.description || 'Item'}
                                            </p>
                                          </div>
                                          <div className="max-h-52 overflow-y-auto">
                                            {sameClientTargetInvoices.map(inv => (
                                              <button
                                                key={inv.id}
                                                type="button"
                                                onClick={() => handleMoveItem(idx, inv.id)}
                                                className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border/40 last:border-0 cursor-pointer"
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="font-mono text-xs font-semibold text-foreground truncate">{inv.invoiceNumber}</span>
                                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">
                                                    {inv.status}
                                                  </span>
                                                </div>
                                                <p className="text-[9px] text-muted-foreground mt-0.5">
                                                  {(inv.invoiceItems?.length ?? 0)} items · ${(inv.totalAmount ?? 0).toFixed(2)} {inv.currency}
                                                </p>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                                      className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                      title="Eliminar item"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 2.5. RASTREO DE PAQUETES (Solo para Facturas Anuladas) */}
              {invoice?.status === 'annulled' && (
                <div className="space-y-4 pt-4 border-t border-border/60">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest flex items-center gap-2 select-none">
                    <History className="h-4 w-4 text-amber-600 animate-pulse" />
                    Rastreo e Historial de Paquetes (Factura Anulada)
                  </h3>

                  {loadingLogs ? (
                    <div className="flex items-center justify-center py-8 gap-2 bg-card border border-border rounded-lg shadow-sm">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Cargando historial de paquetes...</span>
                    </div>
                  ) : groupedPackageLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground bg-muted/5 border border-border rounded-lg shadow-sm">
                      <PackageIcon className="h-8 w-8 text-muted-foreground/40 mb-1" />
                      <span className="text-xs font-medium">No se encontraron paquetes asociados o con historial</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupedPackageLogs.map((log: any, idx: number) => {
                        const isTransitoria = log.currentLocation === 'Consolidación Transitoria';
                        return (
                          <div key={idx} className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col space-y-3 relative overflow-hidden">
                            {/* Accent badge for current location */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {log.trackings.length === 1 ? (
                                  <span className="font-mono text-xs font-bold text-foreground bg-muted/50 border border-border/40 px-1.5 py-0.5 rounded select-all truncate block" title={log.trackings[0]}>
                                    {log.trackings[0]}
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                                      {log.trackings.length} Paquetes Agrupados
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {log.trackings.map((tr: string, tIdx: number) => (
                                        <span key={tIdx} className="font-mono text-[10px] font-semibold text-foreground bg-muted/50 border border-border/40 px-1.5 py-0.5 rounded select-all" title={tr}>
                                          {tr}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <span className="text-[10px] text-muted-foreground block mt-1">
                                  {log.trackings.length === 1 ? `Peso: ${log.weight?.toFixed(2)} kg` : `Peso Total: ${log.weight?.toFixed(2)} kg`}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-bold py-0.5 px-2.5 rounded-full shrink-0 flex items-center gap-1 border-transparent mt-0.5",
                                  isTransitoria
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/20 dark:text-blue-400"
                                )}
                              >
                                <MapPin className="h-3 w-3 shrink-0" />
                                {log.currentLocation}
                              </Badge>
                            </div>

                            {/* Info Banners for Re-manifested / Transitoria states */}
                            {log.isMovedToOtherManifest && (
                              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-2.5 text-[10px] text-blue-800 dark:text-blue-300 font-semibold flex items-start gap-1.5 mt-1 select-none">
                                <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                                <span>Paquete re-manifiestado. Fue trasladado del manifiesto original ({log.originalManifest}) al manifiesto actual ({log.currentManifest}).</span>
                              </div>
                            )}

                            {isTransitoria && (
                              <div className="bg-amber-50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/20 rounded-lg p-2.5 text-[10px] text-amber-800 dark:text-amber-450 font-semibold flex items-start gap-1.5 mt-1 select-none">
                                <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                                <span>Paquete desvinculado y enviado a Consolidación Transitoria.</span>
                              </div>
                            )}

                            {/* Timeline of History entries */}
                            <div className="border-t border-border/60 pt-3 flex-1 flex flex-col">
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block select-none">
                                Historial de Movimientos
                              </span>
                              {log.history.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground italic">Sin registro de movimientos específico</p>
                              ) : (
                                <div className="space-y-3 relative pl-4 border-l border-border/80 ml-1.5 my-1 flex-1">
                                  {log.history.map((h: any, hIdx: number) => (
                                    <div key={hIdx} className="relative">
                                      {/* Timeline circle indicator */}
                                      <span className="absolute -left-[20.5px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300 border border-card" />
                                      <div className="text-[11px] leading-tight">
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{h.note}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground">
                                          <span>{formatTimeEntry(h.changedAt)}</span>
                                          <span>·</span>
                                          <span className="capitalize">{h.changedBy}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. NOTAS Y RESUMEN */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-border/60">
                {/* Notes Block */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 select-none">
                    <Info className="h-4 w-4 text-primary" />
                    3. Notas de Factura
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block font-medium">Notas para el cliente</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        placeholder="Información visible en la factura..."
                        className="w-full px-3 py-2 text-xs border border-border rounded-md bg-card text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block font-medium">Notas internas</label>
                      <textarea
                        value={editInternalNotes}
                        onChange={(e) => setEditInternalNotes(e.target.value)}
                        rows={2}
                        placeholder="Solo visible para el equipo..."
                        className="w-full px-3 py-2 text-xs border border-border rounded-md bg-card text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="flex flex-col items-start lg:items-end space-y-4">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 select-none self-start lg:self-end">
                    <Scale className="h-4 w-4 text-primary" />
                    4. Resumen Financiero
                  </h4>
                  <div className="w-full max-w-sm border border-border rounded-lg bg-card p-4 space-y-2.5 text-xs shadow-sm">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Subtotal:</span>
                      <span className="font-mono font-semibold text-foreground">${liveTotals.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    {editDiscountPercentage > 0 && (
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Descuento ({editDiscountPercentage}%):</span>
                        <span className="font-mono font-semibold text-red-600">-${liveTotals.discountAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Peso Total:</span>
                      <span className="font-semibold text-foreground">{liveTotals.totalWeight.toFixed(2)} kg</span>
                    </div>
                    <div className="border-t border-border/80 pt-2.5 flex justify-between items-baseline">
                      <span className="font-bold text-foreground text-sm">Total a cobrar:</span>
                      <div className="text-right">
                        <div className="font-mono text-lg font-extrabold text-foreground leading-none">
                          ${liveTotals.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {liveTotals.totalCRC > 0 && (
                          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold font-sans mt-1">
                            ₡{liveTotals.totalCRC.toLocaleString("es-CR").replace(/\s/g, ".")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-2 justify-end px-5 py-4 border-t border-border bg-muted/20 shrink-0">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="cancel-edit-btn"
              className="cursor-pointer"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveEditInvoice}
              disabled={isSaving}
              data-testid="confirm-edit-btn"
              className="cursor-pointer"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4 mr-1.5" />
              )}
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
