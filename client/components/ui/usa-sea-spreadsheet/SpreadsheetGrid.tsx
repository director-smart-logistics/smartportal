import React, { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { SpreadsheetRow } from "./SpreadsheetRow";
import {
  useSpreadsheetCalculations,
  CalculatedSeaManifestRow,
  SeaManifestRowData,
} from "./useSpreadsheetCalculations";
import { SeaManifestInvoicePreview } from "./SeaManifestInvoicePreview";
import {
  NovaInvoicePreview,
  type SP1InvoiceShape,
} from "@/components/nova/NovaInvoicePreview";
import { firebaseApi } from "@/lib/firebase/callable";
import { sendInvoiceEmails, sendTestInvoiceEmail } from "@/lib/services/invoice-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getRouteColors, shortenRouteName } from "./utils";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Send,
  FileSpreadsheet,
  DollarSign,
  Search,
  ArrowDownAZ,
  ArrowUpZA,
  Save,
  Mail,
  CheckCircle2,
  Loader2,
  Check,
  ChevronsUpDown,
  ChevronDown,
  Boxes,
  Maximize,
  Users,
  FileText,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useSpreadsheetFocus } from "./useSpreadsheetFocus";
import { db } from "@/lib/firebase/config";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { format } from "date-fns";
import { useEffect } from "react";

export interface SpreadsheetGridProps {
  rows?: SeaManifestRowData[]; // Optional prop for loading DB data
  importedRows?: SeaManifestRowData[];
  onSubmit: (
    rows: CalculatedSeaManifestRow[],
    manifestName?: string,
    createDraftInvoices?: boolean,
    options?: {
      ivaEnabled?: boolean;
      bodegajeCost?: number;
      permisoCost?: number;
      exchangeRate?: number;
      mergeInvoices?: boolean;
    },
  ) => Promise<any[] | void>;
  onBulkSave?: (selectedRows: CalculatedSeaManifestRow[]) => void;
  onBulkEmail?: (selectedRows: CalculatedSeaManifestRow[]) => Promise<string[]>;
  isProcessing?: boolean;
}

const isUnassignedRoute = (r?: string) => {
  if (!r) return true;
  const lower = r.trim().toLowerCase();
  return (
    lower === "" ||
    lower === "por definir" ||
    lower === "sin ruta" ||
    lower === "all" ||
    lower === "desconocida" ||
    lower === "undefined"
  );
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const createEmptyRow = (): SeaManifestRowData => ({
  id: generateId(),
  warehouseId: "",
  slCode: "",
  customerName: "",
  ruta: "",
  length: "",
  width: "",
  height: "",
  multiplier: "",
  priceOverride: "",
  cubicFeetOverride: "",
  roundedVolumeOverride: "",
});

const COL_COUNT = 9; // editable columns

type SortConfig = {
  field: keyof CalculatedSeaManifestRow;
  direction: "asc" | "desc";
} | null;

export const gridTemplateCols =
  "40px 40px minmax(160px, 1fr) minmax(120px, 1fr) minmax(140px, 2.5fr) minmax(125px, 1fr) 80px 80px 80px 80px 100px 100px 100px minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 70px";

export function SpreadsheetGrid({
  rows: initialRows,
  importedRows,
  onSubmit,
  onBulkSave,
  onBulkEmail,
  isProcessing,
}: SpreadsheetGridProps) {
  const { t } = useTranslation("manifests");
  const { toast } = useToast();

  const [rows, setRows] = useState<SeaManifestRowData[]>(() => {
    if (initialRows && initialRows.length > 0) return initialRows;
    return Array.from({ length: 15 }, createEmptyRow);
  });

  const [manifestName, setManifestName] = useState(
    `SM_${format(new Date(), "ddMMyyyy")}_USA`,
  );
  const [savedManifests, setSavedManifests] = useState<string[]>([]);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const isLocalChangeRef = useRef(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [isCreationSession, setIsCreationSession] = useState(true);
  const initialCheckDone = useRef(false);
  const [globalPrice, setGlobalPrice] = useState<number>(30);
  const [exchangeRate, setExchangeRate] = useState<number>(500);

  const resolvedCustomersRef = useRef<Map<string, { customerName: string; customerEmail: string; ruta: string }>>(new Map());
  const pendingFetchesRef = useRef<Set<string>>(new Set());
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const saveManifestDoc = useCallback(async (
    currentRows: SeaManifestRowData[],
    currentGlobalPrice: number,
    currentExchangeRate: number,
    isDocProcessed: boolean,
    options?: { showToast?: boolean }
  ) => {
    const validRows = currentRows.filter(
      (r) =>
        r.warehouseId?.trim() ||
        r.slCode?.trim() ||
        r.length ||
        r.width ||
        r.height,
    );
    if (!manifestName.trim()) return;

    try {
      isLocalChangeRef.current = false;
      await setDoc(
        doc(db, "manifest_usa_sea", manifestName.trim()),
        {
          manifestName: manifestName.trim(),
          rows: validRows,
          globalPrice: currentGlobalPrice,
          exchangeRate: currentExchangeRate,
          processed: isDocProcessed,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setLastSavedTime(new Date());
      setIsDirty(false);
      if (options?.showToast) {
        toastRef.current({
          description: "Manifiesto guardado exitosamente.",
        });
      }
    } catch (error) {
      console.error("Failed to save manifest doc:", error);
      if (options?.showToast) {
        toastRef.current({
          description: "Error al guardar el manifiesto.",
          variant: "destructive",
        });
      }
    }
  }, [manifestName]);

  const handleManualSave = useCallback(async () => {
    setIsAutoSaving(true);
    await saveManifestDoc(rows, globalPrice, exchangeRate, isProcessed, { showToast: true });
    setIsAutoSaving(false);
  }, [rows, globalPrice, exchangeRate, isProcessed, saveManifestDoc]);

  // Auto-resolve customer details by slCode
  useEffect(() => {
    const unresolvedCodes = new Set<string>();
    rows.forEach((row) => {
      const code = row.slCode?.trim();
      if (code && (code.toUpperCase().startsWith("SL") || /^\d+$/.test(code))) {
        const uppercaseCode = code.toUpperCase();
        const cached = resolvedCustomersRef.current.get(uppercaseCode);
        if (cached) {
          const targetRuta = isUnassignedRoute(row.ruta) && !isUnassignedRoute(cached.ruta) ? cached.ruta : (row.ruta || cached.ruta || "");
          const needsNameUpdate = row.customerName !== cached.customerName;
          const needsEmailUpdate = row.customerEmail !== cached.customerEmail;
          const needsRutaUpdate = row.ruta !== targetRuta;

          if (needsNameUpdate || needsEmailUpdate || needsRutaUpdate) {
            isLocalChangeRef.current = true;
            setIsDirty(true);
            setRows((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      customerName: cached.customerName,
                      customerEmail: cached.customerEmail,
                      ruta: targetRuta,
                    }
                  : r
              )
            );
          }
        } else if (!pendingFetchesRef.current.has(uppercaseCode)) {
          unresolvedCodes.add(uppercaseCode);
        }
      }
    });

    if (unresolvedCodes.size === 0) return;

    const fetchBatch = async () => {
      const codesArray = Array.from(unresolvedCodes);
      codesArray.forEach((code) => pendingFetchesRef.current.add(code));

      try {
        await Promise.all(
          codesArray.map(async (code) => {
            let searchCode = code;
            if (/^\d+$/.test(searchCode)) {
              searchCode = `SL${searchCode}`;
            }
            const q = query(
              collection(db, "customers"),
              where("slCode", "==", searchCode)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              const data = snap.docs[0].data();
              const customerData = {
                customerName: data.fullName || data.customerName || "",
                customerEmail: data.email || data.customerEmail || "",
                ruta: data.ruta || "",
              };
              resolvedCustomersRef.current.set(code, customerData);
              isLocalChangeRef.current = true;
              setIsDirty(true);
              setRows((prev) =>
                prev.map((r) => {
                  const rCode = r.slCode?.trim().toUpperCase();
                  if (rCode === code || (rCode && `SL${rCode}` === code)) {
                    const targetRuta = isUnassignedRoute(r.ruta) && !isUnassignedRoute(customerData.ruta) ? customerData.ruta : (r.ruta || customerData.ruta || "");
                    return {
                      ...r,
                      customerName: customerData.customerName,
                      customerEmail: customerData.customerEmail,
                      ruta: targetRuta,
                    };
                  }
                  return r;
                })
              );
            } else {
              resolvedCustomersRef.current.set(code, {
                customerName: "",
                customerEmail: "",
                ruta: "",
              });
            }
          })
        );
      } catch (err) {
        console.error("Error auto-resolving customers:", err);
      } finally {
        codesArray.forEach((code) => pendingFetchesRef.current.delete(code));
      }
    };

    fetchBatch();
  }, [rows]);

  const [realInvoicePreview, setRealInvoicePreview] =
    useState<SP1InvoiceShape | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [createDraftInvoices, setCreateDraftInvoices] = useState(true);
  const [mergeInvoices, setMergeInvoices] = useState(false);
  const [showBulkSaveConfirm, setShowBulkSaveConfirm] = useState(false);
  const [showBulkEmailConfirm, setShowBulkEmailConfirm] = useState(false);

  const [manifestPopoverOpen, setManifestPopoverOpen] = useState(false);

  // Extra options for processing
  const [bodegajeCost, setBodegajeCost] = useState(0);
  const [permisoCost, setPermisoCost] = useState(0);
  const [ivaEnabled, setIvaEnabled] = useState(false);

  useEffect(() => {
    if (importedRows && importedRows.length > 0) {
      isLocalChangeRef.current = true;
      setIsDirty(true);
      setRows((prev) => {
        const nonEmptyPrev = prev.filter(
          (r) => r.warehouseId || r.slCode || r.length,
        );
        const combined = [...nonEmptyPrev, ...importedRows];
        if (combined.length < 15) {
          return [
            ...combined,
            ...Array.from({ length: 15 - combined.length }, createEmptyRow),
          ];
        }
        return [...combined, createEmptyRow()];
      });
      toast({
        description: `${importedRows.length} filas importadas con éxito.`,
      });
    }
  }, [importedRows, toast]);


  const [previewRowId, setPreviewRowId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [routeFilter, setRouteFilter] = useState<string>("ALL");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const uniqueRoutes = useMemo(() => {
    const routes = new Set<string>();
    rows.forEach((r) => {
      if (r.ruta && r.ruta.trim()) routes.add(r.ruta.trim());
    });
    return Array.from(routes).sort();
  }, [rows]);

  const calculatedRows = useSpreadsheetCalculations(
    rows,
    globalPrice,
    exchangeRate,
  );

  const totals = useMemo(() => {
    const validRows = calculatedRows.filter((r) => r.isValid);
    let totalItems = 0;
    let totalCubicFeet = 0;
    let totalRoundedVolume = 0;
    let totalUSD = 0;
    let totalCRC = 0;
    const uniqueClients = new Set<string>();
    const uniqueInvoices = new Set<string>();

    validRows.forEach((r) => {
      const mult = parseFloat(r.multiplier || "") || 1;
      totalItems += mult;
      totalCubicFeet += r.cubicFeet || 0;
      totalRoundedVolume += r.roundedVolume || 0;
      totalUSD += r.price || 0;
      totalCRC += r.priceCRC || 0;
      const sl = r.slCode?.trim().toUpperCase();
      if (sl) uniqueClients.add(sl);
      const inv = r.invoiceNumber?.trim();
      if (inv) uniqueInvoices.add(inv);
    });

    return {
      items: totalItems,
      cubicFeet: totalCubicFeet,
      roundedVolume: totalRoundedVolume,
      clients: uniqueClients.size,
      invoices: uniqueInvoices.size,
      usd: totalUSD,
      crc: totalCRC,
    };
  }, [calculatedRows]);

  const handleAddRows = useCallback(() => {
    isLocalChangeRef.current = true;
    setIsDirty(true);
    setRows((prev) => {
      const newRows = [...prev];
      for (let i = 0; i < 5; i++) {
        newRows.push(createEmptyRow());
      }
      return newRows;
    });
  }, []);

  const { handleKeyDown } = useSpreadsheetFocus(handleAddRows);

  // Firebase: Load available manifests
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "manifest_usa_sea"), (snapshot) => {
      const manifests = snapshot.docs
        .filter((d) => {
          const data = d.data();
          const loadedRows = data.rows || [];
          return loadedRows.some(
            (r: any) =>
              r.warehouseId?.trim() ||
              r.slCode?.trim() ||
              r.length ||
              r.width ||
              r.height
          );
        })
        .map((d) => d.id);
      setSavedManifests(manifests.sort().reverse()); // Most recent first assuming date prefixed
    });
    return () => unsub();
  }, []);

  // Firebase: Initialize isCreationSession on initial load once savedManifests is loaded
  useEffect(() => {
    if (savedManifests.length > 0 && !initialCheckDone.current) {
      const exists = savedManifests.includes(manifestName.trim());
      setIsCreationSession(!exists);
      initialCheckDone.current = true;
    }
  }, [savedManifests, manifestName]);

  // Firebase: Auto-save logic
  useEffect(() => {
    if (!isLocalChangeRef.current) return;
    if (isProcessed) return;
    if (!isCreationSession) return; // Disable auto-save for existing loaded manifests!

    const validRows = calculatedRows.filter(
      (r) =>
        r.warehouseId.trim() ||
        r.slCode.trim() ||
        r.length ||
        r.width ||
        r.height,
    );
    if (!manifestName.trim()) return;
    const exists = savedManifests.includes(manifestName.trim());
    if (validRows.length === 0 && !exists) return;

    setIsAutoSaving(true);
    const timeoutId = setTimeout(async () => {
      try {
        await saveManifestDoc(rows, globalPrice, exchangeRate, false);
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsAutoSaving(false);
      }
    }, 5000); // Debounce 5s

    return () => clearTimeout(timeoutId);
  }, [rows, manifestName, globalPrice, exchangeRate, isProcessed, isCreationSession, calculatedRows, savedManifests, saveManifestDoc]);

  // Realtime ruta sync — patch rows when ruta changes
  useEffect(() => {
    const handler = (e: Event) => {
      const { slCode, ruta } = (
        e as CustomEvent<{ slCode: string; ruta: string }>
      ).detail;
      isLocalChangeRef.current = true;
      setIsDirty(true);
      const uppercaseCode = slCode.toUpperCase();
      const cached = resolvedCustomersRef.current.get(uppercaseCode);
      if (cached) {
        resolvedCustomersRef.current.set(uppercaseCode, { ...cached, ruta });
      } else {
        resolvedCustomersRef.current.set(uppercaseCode, { customerName: "", customerEmail: "", ruta });
      }
      setRows((prev) =>
        prev.map((r) => {
          const rCode = r.slCode?.trim().toUpperCase();
          return rCode === uppercaseCode || (rCode && `SL${rCode}` === uppercaseCode) ? { ...r, ruta } : r;
        }),
      );
    };
    window.addEventListener("customer-ruta-updated", handler);
    return () => window.removeEventListener("customer-ruta-updated", handler);
  }, []);

  // Firebase: Real-time sync for current manifest
  useEffect(() => {
    if (!manifestName || manifestName === "NEW") return;

    const unsub = onSnapshot(
      doc(db, "manifest_usa_sea", manifestName),
      (snapshot) => {
        // Ignore local optimistic updates to avoid interrupting typing
        if (snapshot.metadata.hasPendingWrites) return;

        // Ignore if we have active unsaved local changes to prevent overwriting user input
        if (isLocalChangeRef.current) return;

        if (snapshot.exists()) {
          const data = snapshot.data();
          let loadedRows = data.rows || [];

          if (data.globalPrice !== undefined) {
            setGlobalPrice(data.globalPrice);
          }
          if (data.exchangeRate !== undefined) {
            setExchangeRate(data.exchangeRate);
          }
          if (data.processed !== undefined) {
            setIsProcessed(data.processed);
          } else {
            setIsProcessed(false);
          }

          // Pre-resolve empty customer names from local cache to prevent overwriting
          loadedRows = loadedRows.map((r: any) => {
            const code = r.slCode?.trim().toUpperCase();
            if (code && !r.customerName) {
              const cached = resolvedCustomersRef.current.get(code);
              if (cached) {
                return {
                  ...r,
                  customerName: cached.customerName,
                  customerEmail: cached.customerEmail,
                  ruta: r.ruta || cached.ruta || "",
                };
              }
            }
            return r;
          });

          // Prevent infinite loop by checking if the incoming rows are actually different
          // from our current valid calculated rows.
          // We only compare the fields that matter for the raw data.
          setRows((currentRows) => {
            const currentValid = currentRows.filter(
              (r) =>
                r.warehouseId?.trim() ||
                r.slCode?.trim() ||
                r.length ||
                r.width ||
                r.height,
            );

            // Map to base shape to avoid calculation field mismatches
            const cleanLoaded = loadedRows.map((r: any) => ({
              id: r.id,
              warehouseId: r.warehouseId || "",
              slCode: r.slCode || "",
              customerName: r.customerName || "",
              ruta: r.ruta || "",
              length: r.length || "",
              width: r.width || "",
              height: r.height || "",
              multiplier: r.multiplier || "",
              priceOverride: r.priceOverride || "",
              cubicFeetOverride: r.cubicFeetOverride || "",
              roundedVolumeOverride: r.roundedVolumeOverride || "",
              invoiceId: r.invoiceId || "",
              invoiceNumber: r.invoiceNumber || "",
              invoiceStatus: r.invoiceStatus || "",
              bodegajeCost: r.bodegajeCost || 0,
              permisoCost: r.permisoCost || 0,
              ivaEnabled: r.ivaEnabled || false,
            }));
            const cleanCurrent = currentValid.map((r: any) => ({
              id: r.id,
              warehouseId: r.warehouseId || "",
              slCode: r.slCode || "",
              customerName: r.customerName || "",
              ruta: r.ruta || "",
              length: r.length || "",
              width: r.width || "",
              height: r.height || "",
              multiplier: r.multiplier || "",
              priceOverride: r.priceOverride || "",
              cubicFeetOverride: r.cubicFeetOverride || "",
              roundedVolumeOverride: r.roundedVolumeOverride || "",
              invoiceId: r.invoiceId || "",
              invoiceNumber: r.invoiceNumber || "",
              invoiceStatus: r.invoiceStatus || "",
              bodegajeCost: r.bodegajeCost || 0,
              permisoCost: r.permisoCost || 0,
              ivaEnabled: r.ivaEnabled || false,
            }));

            if (JSON.stringify(cleanLoaded) === JSON.stringify(cleanCurrent)) {
              return currentRows; // No change, break the loop
            }

            // Apply changes
            if (loadedRows.length < 15) {
              loadedRows = [
                ...loadedRows,
                ...Array.from(
                  { length: 15 - loadedRows.length },
                  createEmptyRow,
                ),
              ];
            }
            const lastLoaded = loadedRows[loadedRows.length - 1];
            if (lastLoaded && (lastLoaded.warehouseId || lastLoaded.slCode)) {
              loadedRows.push(createEmptyRow());
            }
            return loadedRows;
          });
        } else {
          setIsProcessed(false);
        }
      },
    );

    return () => unsub();
  }, [manifestName]);

  // Firebase: Fetch invoices and self-heal processed manifests if needed
  useEffect(() => {
    if (!manifestName || manifestName === "NEW") return;

    let active = true;

    const checkAndHealManifest = async () => {
      try {
        const q = query(
          collection(db, "invoices"),
          where("manifestNumber", "==", manifestName)
        );
        const snap = await getDocs(q);
        if (!active) return;

        if (!snap.empty) {
          const invoicesList = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));

          const docRef = doc(db, "manifest_usa_sea", manifestName);
          const docSnap = await getDoc(docRef);
          if (!active) return;

          if (docSnap.exists()) {
            const docData = docSnap.data();
            const currentRows = docData.rows || [];
            let changed = false;

            // Retrieve exchange rate from the invoices if present
            const firstInvoice = invoicesList[0];
            const invoiceExchangeRate = firstInvoice?.exchangeRate;
            let targetExchangeRate = docData.exchangeRate;

            if (invoiceExchangeRate && (!targetExchangeRate || targetExchangeRate === 500)) {
              // If the manifest doesn't have a custom exchangeRate or has default 500,
              // and the invoice has a different one, restore it.
              targetExchangeRate = invoiceExchangeRate;
              changed = true;
            }

            const updatedRows = currentRows.map((row: any) => {
              const slCode = row.slCode?.trim().toUpperCase();
              if (!slCode) return row;

              const matchingInvoice = invoicesList.find(
                (inv) =>
                  inv.clientSlCode?.trim().toUpperCase() === slCode ||
                  inv.slCode?.trim().toUpperCase() === slCode
              );

              if (matchingInvoice) {
                const newInvId = matchingInvoice.id;
                const newInvNum = matchingInvoice.invoiceNumber || "";
                const newInvStatus = matchingInvoice.status || "";

                if (
                  row.invoiceId !== newInvId ||
                  row.invoiceNumber !== newInvNum ||
                  row.invoiceStatus !== newInvStatus
                ) {
                  changed = true;
                  return {
                    ...row,
                    invoiceId: newInvId,
                    invoiceNumber: newInvNum,
                    invoiceStatus: newInvStatus,
                  };
                }
              }
              return row;
            });

            if (changed || docData.processed !== true) {
              console.log(`[Self-Heal] Updating manifest ${manifestName} in Firestore...`);
              await setDoc(
                docRef,
                {
                  rows: updatedRows,
                  processed: true,
                  exchangeRate: targetExchangeRate !== undefined ? targetExchangeRate : 500,
                  globalPrice: docData.globalPrice !== undefined ? docData.globalPrice : 30,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            }
          }
        }
      } catch (err) {
        console.error("Error in checkAndHealManifest:", err);
      }
    };

    checkAndHealManifest();

    return () => {
      active = false;
    };
  }, [manifestName]);

  const loadManifest = (name: string) => {
    isLocalChangeRef.current = false;
    setIsDirty(false);
    if (name === "NEW") {
      setManifestName(`SM_${format(new Date(), "ddMMyyyy")}_USA_${new Date().getTime().toString().slice(-4)}`);
      setRows(Array.from({ length: 15 }, createEmptyRow));
      setIsProcessed(false);
      setIsCreationSession(true); // Yes, new creation session!
      return;
    }

    setManifestName(name);
    setIsCreationSession(false); // Loaded an existing manifest!
    toast({
      description: `Sincronizando manifiesto "${name}" en tiempo real...`,
    });
  };

  // Apply Filtering and Sorting
  const visibleRows = useMemo(() => {
    let result = [...calculatedRows];

    if (routeFilter !== "ALL") {
      result = result.filter(
        (r) =>
          r.ruta === routeFilter || (!r.warehouseId && !r.slCode && !r.length),
      );
    }

    if (filterText.trim()) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(
        (r) =>
          (r.warehouseId &&
            r.warehouseId.toLowerCase().includes(lowerFilter)) ||
          (r.slCode && r.slCode.toLowerCase().includes(lowerFilter)) ||
          (r.customerName &&
            r.customerName.toLowerCase().includes(lowerFilter)) ||
          (r.ruta && r.ruta.toLowerCase().includes(lowerFilter)) ||
          // Always show empty rows so user can keep typing
          (!r.warehouseId && !r.slCode && !r.length && !r.width && !r.height),
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        // Keep empty rows at the bottom
        const aEmpty =
          !a.warehouseId && !a.slCode && !a.length && !a.width && !a.height;
        const bEmpty =
          !b.warehouseId && !b.slCode && !b.length && !b.width && !b.height;
        if (aEmpty && !bEmpty) return 1;
        if (!aEmpty && bEmpty) return -1;
        if (aEmpty && bEmpty) return 0;

        const valA = a[sortConfig.field];
        const valB = b[sortConfig.field];

        if (valA === valB) return 0;

        const isAsc = sortConfig.direction === "asc";
        if (typeof valA === "string" && typeof valB === "string") {
          return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }

        return isAsc
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
    }

    return result;
  }, [calculatedRows, filterText, routeFilter, sortConfig]);

  const toggleSelectAll = useCallback(() => {
    const validIds = visibleRows.filter((r) => r.isValid).map((r) => r.id);
    if (selectedIds.size === validIds.length && validIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validIds));
    }
  }, [visibleRows, selectedIds]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCellChange = useCallback(
    (id: string, field: keyof SeaManifestRowData, value: string) => {
      isLocalChangeRef.current = true;
      setIsDirty(true);
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === id);
        if (idx === -1) return prev;

        const next = [...prev];
        const valToSet = field === "slCode" ? value.toUpperCase() : value;
        next[idx] = { ...next[idx], [field]: valToSet };

        if (idx === prev.length - 1 && value.trim() !== "") {
          next.push(createEmptyRow());
        }
        return next;
      });
    },
    [],
  );

  const handleRowUpdate = useCallback(
    (id: string, updates: Partial<SeaManifestRowData>) => {
      isLocalChangeRef.current = true;
      setIsDirty(true);
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === id);
        if (idx === -1) return prev;

        const next = [...prev];
        const updatedFields = { ...updates };
        if (updatedFields.slCode) {
          updatedFields.slCode = updatedFields.slCode.toUpperCase();
        }
        next[idx] = { ...next[idx], ...updatedFields };

        if (idx === prev.length - 1) {
          next.push(createEmptyRow());
        }
        return next;
      });
    },
    [],
  );

  const handlePaste = useCallback(
    (
      e: React.ClipboardEvent<HTMLInputElement>,
      visibleRowIdx: number,
      colIdx: number,
    ) => {
      e.preventDefault();
      const clipboardData = e.clipboardData.getData("text");
      if (!clipboardData) return;

      const targetRowId = visibleRows[visibleRowIdx]?.id;
      if (!targetRowId) return;

      isLocalChangeRef.current = true;
      setIsDirty(true);
      setRows((prev) => {
        const startIdx = prev.findIndex((r) => r.id === targetRowId);
        if (startIdx === -1) return prev;

        const pastedRows = clipboardData
          .split(/\r?\n/)
          .map((row) => row.split("\t"));
        const next = [...prev];
        let currentRowIdx = startIdx;

        for (const pastedRow of pastedRows) {
          if (pastedRow.length === 1 && pastedRow[0] === "") continue;

          if (currentRowIdx >= next.length) {
            next.push(createEmptyRow());
          }

          let currentColIdx = colIdx;
          for (const cellValue of pastedRow) {
            if (currentColIdx >= COL_COUNT) break;

            const fieldMap: (keyof SeaManifestRowData)[] = [
              "slCode",
              "warehouseId",
              "length",
              "width",
              "height",
              "priceOverride",
            ];
            const field = fieldMap[currentColIdx];

            if (field) {
              const valToSet = field === "slCode" ? cellValue.trim().toUpperCase() : cellValue.trim();
              next[currentRowIdx] = {
                ...next[currentRowIdx],
                [field]: valToSet,
              };
            }
            currentColIdx++;
          }
          currentRowIdx++;
        }

        const lastRow = next[next.length - 1];
        if (
          lastRow &&
          (lastRow.warehouseId ||
            lastRow.slCode ||
            lastRow.length ||
            lastRow.width ||
            lastRow.height)
        ) {
          next.push(createEmptyRow());
        }

        return next;
      });

      toast({
        description: t("spreadsheet.pasteWarning", {
          count: clipboardData.split(/\r?\n/).length,
        }),
      });
    },
    [visibleRows, t, toast],
  );

  const handleDeleteRow = useCallback((id: string) => {
    isLocalChangeRef.current = true;
    setIsDirty(true);
    setRows((prev) => {
      if (prev.length <= 1) return [createEmptyRow()];
      const next = prev.filter((r) => r.id !== id);
      if (next.length === 0) return [createEmptyRow()];
      return next;
    });
  }, []);

  const handlePreviewRealInvoice = useCallback(
    async (invoiceNumber: string) => {
      try {
        const q = query(
          collection(db, "invoices"),
          where("invoiceNumber", "==", invoiceNumber),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const data = docSnap.data() as SP1InvoiceShape;
          setRealInvoicePreview({ id: docSnap.id, ...data });
        } else {
          toast({
            title: "Error",
            description: "No se encontró la factura en la base de datos.",
            variant: "destructive",
          });
        }
      } catch (e) {
        console.error(e);
        toast({
          title: "Error",
          description: "Error al cargar la factura.",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleClearAll = useCallback(() => {
    if (
      window.confirm(
        t("common.confirmClear", "¿Seguro que desea limpiar todo?"),
      )
    ) {
      isLocalChangeRef.current = true;
      setIsDirty(true);
      setRows(Array.from({ length: 15 }, createEmptyRow));
      setFilterText("");
      setSortConfig(null);
    }
  }, [t]);

  const handleSubmit = () => {
    const validRowsToSubmit = calculatedRows.filter(
      (r) =>
        r.warehouseId.trim() ||
        r.slCode.trim() ||
        r.length ||
        r.width ||
        r.height,
    );
    const exists = savedManifests.includes(manifestName.trim());
    if (validRowsToSubmit.length === 0 && !exists) {
      toast({
        description: "No hay filas válidas para procesar",
        variant: "destructive",
      });
      return;
    }
    setShowProcessModal(true);
  };

  const handleConfirmProcess = async () => {
    const validRowsToSubmit = calculatedRows.filter(
      (r) =>
        r.warehouseId.trim() ||
        r.slCode.trim() ||
        r.length ||
        r.width ||
        r.height,
    );
    setShowProcessModal(false);
    const generatedInvoices = await onSubmit(
      validRowsToSubmit,
      manifestName.trim(),
      createDraftInvoices,
      {
        ivaEnabled,
        bodegajeCost,
        permisoCost,
        exchangeRate,
        mergeInvoices,
      },
    );

    // Map invoices back to the rows
    const updatedRows = rows.map((row) => {
      const matchingInvoice = (generatedInvoices || []).find(
        (inv) =>
          inv.clientSlCode === row.slCode || inv.slCode === row.slCode,
      );
      if (matchingInvoice) {
        return {
          ...row,
          invoiceId: matchingInvoice.id,
          invoiceNumber: matchingInvoice.invoiceNumber,
          invoiceStatus: matchingInvoice.status,
        };
      }
      return row;
    });

    setRows(updatedRows);
    setIsProcessed(true);

    // Save directly to Firestore and mark as processed
    setIsAutoSaving(true);
    await saveManifestDoc(updatedRows, globalPrice, exchangeRate, true);
    setIsAutoSaving(false);
  };

  const handleSort = (field: keyof CalculatedSeaManifestRow) => {
    setSortConfig((current) => {
      if (!current || current.field !== field)
        return { field, direction: "asc" };
      if (current.direction === "asc") return { field, direction: "desc" };
      return null;
    });
  };

  const hasData = rows.some(
    (r) => r.warehouseId || r.slCode || r.length || r.width || r.height,
  );
  const validRowCount = calculatedRows.filter((r) => r.isValid).length;

  const SortableHeader = ({
    field,
    label,
    className,
  }: {
    field: keyof CalculatedSeaManifestRow;
    label: string;
    className?: string;
  }) => {
    const isSorted = sortConfig?.field === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={cn(
          "px-3 py-2 border-r border-border hover:bg-accent/50 flex items-center gap-1 text-left font-semibold text-muted-foreground uppercase tracking-wider transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        {isSorted && (
          <span className="text-[hsl(var(--manifest-brand))] shrink-0">
            {sortConfig?.direction === "asc" ? (
              <ArrowDownAZ className="w-3.5 h-3.5" />
            ) : (
              <ArrowUpZA className="w-3.5 h-3.5" />
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="bg-muted px-2 py-0.5 rounded text-xs font-medium text-foreground">
              {validRowCount} {validRowCount === 1 ? "fila" : "filas"}
            </span>
          </div>

          <div className="flex items-center gap-4 pl-4 border-l border-border flex-wrap">
            {/* Manifest Name Input */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                Manifiesto:
              </span>
              <Input
                type="text"
                value={manifestName}
                onChange={(e) => {
                  isLocalChangeRef.current = true;
                  setIsDirty(true);
                  setManifestName(e.target.value);
                }}
                className="h-7 px-2 py-0 text-xs shadow-none bg-background font-mono w-48"
              />
            </div>

            {/* Global Price Input */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Precio/ft³:
              </span>
              <div className="relative w-20">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <DollarSign className="w-3.5 h-3.5" />
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={globalPrice}
                  onChange={(e) => {
                    isLocalChangeRef.current = true;
                    setIsDirty(true);
                    setGlobalPrice(Number(e.target.value) || 0);
                  }}
                  className="h-7 pl-6 pr-2 py-0 text-xs shadow-none bg-background"
                />
              </div>
            </div>

            {/* Exchange Rate Input */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                T. Cambio:
              </span>
              <div className="relative w-24">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">
                  ₡
                </span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={exchangeRate}
                  onChange={(e) => {
                    isLocalChangeRef.current = true;
                    setIsDirty(true);
                    setExchangeRate(Number(e.target.value) || 1);
                  }}
                  className="h-7 pl-6 pr-2 py-0 text-xs shadow-none bg-background"
                />
              </div>
            </div>

            {/* Filter Input */}
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <Input
                  type="text"
                  placeholder="Buscar general..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-7 pl-7 pr-2 py-0 text-xs shadow-none bg-background"
                />
              </div>
            </div>

            {/* Route Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Ruta:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 text-xs px-2 gap-1 font-semibold border shadow-none transition-all",
                      routeFilter !== "ALL"
                        ? (() => {
                            const colors = getRouteColors(routeFilter);
                            return `${colors.bg} ${colors.text} border-transparent hover:opacity-90`;
                          })()
                        : "bg-background text-foreground hover:bg-accent"
                    )}
                  >
                    {routeFilter === "ALL" ? "Todas las rutas" : shortenRouteName(routeFilter)}
                    <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 z-[70]">
                  <DropdownMenuItem
                    onClick={() => setRouteFilter("ALL")}
                    className={cn(
                      "text-xs font-medium cursor-pointer flex items-center justify-between",
                      routeFilter === "ALL" && "bg-accent"
                    )}
                  >
                    <span>Todas las rutas</span>
                    {routeFilter === "ALL" && <Check className="h-3 w-3 text-primary shrink-0" />}
                  </DropdownMenuItem>
                  {uniqueRoutes.map((route) => {
                    const colors = getRouteColors(route);
                    return (
                      <DropdownMenuItem
                        key={route}
                        onClick={() => setRouteFilter(route)}
                        className={cn(
                          "text-xs font-medium cursor-pointer flex items-center justify-between",
                          routeFilter === route && "bg-accent"
                        )}
                      >
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] font-semibold whitespace-nowrap truncate",
                            colors.bg,
                            colors.text
                          )}
                        >
                          {shortenRouteName(route)}
                        </Badge>
                        {routeFilter === route && <Check className="h-3 w-3 text-primary shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Load Manifest Filter */}
            <div className="flex items-center gap-2 border-l border-border pl-4 ml-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cargar Manifiesto:
              </span>
              <Popover
                open={manifestPopoverOpen}
                onOpenChange={setManifestPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={manifestPopoverOpen}
                    className="h-7 px-2 justify-between min-w-[200px] border-input bg-primary/10 text-primary shadow-none font-semibold text-xs"
                  >
                    {manifestName ? manifestName : "+ Crear Nuevo"}
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Buscar manifiesto..."
                      className="h-8 text-xs"
                    />
                    <CommandList>
                      <CommandEmpty>
                        No se encontró ningún manifiesto.
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="NEW"
                          onSelect={() => {
                            loadManifest("NEW");
                            setManifestPopoverOpen(false);
                          }}
                          className="font-medium text-blue-600 text-xs"
                        >
                          <Plus className="mr-2 h-3 w-3" />+ Crear Nuevo
                        </CommandItem>
                        {savedManifests.map((man) => (
                          <CommandItem
                            key={man}
                            value={man}
                            onSelect={(currentValue) => {
                              loadManifest(man);
                              setManifestPopoverOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-3 w-3",
                                manifestName === man
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {man}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isProcessed && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 mr-2">
              <Check className="w-3.5 h-3.5" /> Procesado
            </span>
          )}
          {isProcessed ? (
            <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded mr-2 font-medium">
              Autoguardado desactivado (Procesado)
            </div>
          ) : !isCreationSession ? (
            <div className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded mr-2 font-medium">
              Autoguardado desactivado (Manifiesto existente)
            </div>
          ) : isAutoSaving ? (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mr-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Guardando...
            </div>
          ) : lastSavedTime ? (
            <div className="flex items-center gap-1 text-[10px] text-emerald-600 mr-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            disabled={!isDirty || isProcessing || !manifestName.trim()}
            className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <Save className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
            {isDirty ? "Guardar*" : "Guardar"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={!hasData || isProcessing}
            className="h-8 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {t("spreadsheet.clearAll", "Limpiar")}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={validRowCount === 0 || isProcessing}
            className="h-8 text-xs bg-[hsl(var(--manifest-brand))] text-white hover:opacity-90"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {t("spreadsheet.process", "Procesar")}
          </Button>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-primary/5 border-b border-primary/20 px-4 py-2 flex items-center justify-between overflow-hidden"
          >
            <div className="text-sm font-semibold text-primary">
              {selectedIds.size}{" "}
              {selectedIds.size === 1
                ? "fila seleccionada"
                : "filas seleccionadas"}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-background"
                onClick={() => setShowBulkSaveConfirm(true)}
              >
                <Save className="w-4 h-4 mr-2 text-blue-600" />
                Guardar en BD
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 bg-background"
                onClick={() => setShowBulkEmailConfirm(true)}
              >
                <Mail className="w-4 h-4 mr-2 text-green-600" />
                Enviar Facturas
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-auto bg-background relative">
        <div className="min-w-[1360px] flex flex-col pb-16">
          {/* Table Header */}
          <div
            className="grid w-full bg-background border-b border-border sticky top-0 z-20 shadow-sm text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ gridTemplateColumns: gridTemplateCols }}
          >
            <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80">
              <Checkbox
                checked={
                  visibleRows.filter((r) => r.isValid).length > 0 &&
                  selectedIds.size ===
                    visibleRows.filter((r) => r.isValid).length
                }
                onCheckedChange={toggleSelectAll}
              />
            </div>
            <div className="shrink-0 flex items-center justify-center border-border border-b border-r bg-muted/80">
              #
            </div>
            <SortableHeader
              field="slCode"
              label={t("spreadsheet.smartId", "Smart ID")}
            />
            <SortableHeader
              field="warehouseId"
              label={t("spreadsheet.warehouseId", "Warehouse ID")}
            />
            <SortableHeader
              field="customerName"
              label={t("customer", "Cliente")}
            />
            <SortableHeader field="ruta" label={t("route", "Ruta")} />
            <SortableHeader
              field="length"
              label={t("spreadsheet.length", "Largo")}
            />
            <SortableHeader
              field="width"
              label={t("spreadsheet.width", "Ancho")}
            />
            <SortableHeader
              field="height"
              label={t("spreadsheet.height", "Alto")}
            />
            <SortableHeader
              field="multiplier"
              label={t("spreadsheet.multiplier", "Mult. X")}
            />
            <SortableHeader
              field="cubicFeet"
              label={t("spreadsheet.cubicFeet", "Pies³")}
              className="bg-accent/5"
            />
            <SortableHeader
              field="roundedVolume"
              label={t("spreadsheet.roundedVolume", "Vol.")}
              className="bg-accent/5"
            />
            <SortableHeader
              field="priceOverride"
              label={t("spreadsheet.pricePerCubicFoot", "Precio/ft³")}
              className="bg-accent/5"
            />
            <SortableHeader
              field="price"
              label={t("spreadsheet.price", "Precio ($)")}
              className="bg-accent/5"
            />
            <SortableHeader
              field="priceCRC"
              label="Precio (₡)"
              className="bg-accent/5"
            />
            <SortableHeader
              field="invoiceNumber"
              label="Factura"
              className="bg-accent/5"
            />
            <div className="shrink-0 flex items-center justify-center px-2 border-border border-b" />{" "}
            {/* Actions col */}
          </div>

          {/* Table Body */}
          <AnimatePresence initial={false}>
            {visibleRows.map((row, idx) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, height: 0, scaleY: 0.8 }}
                animate={{ opacity: 1, height: "auto", scaleY: 1 }}
                exit={{ opacity: 0, height: 0, scaleY: 0.8 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="origin-top"
              >
                <SpreadsheetRow
                  row={row}
                  rowIdx={idx}
                  rowCount={visibleRows.length}
                  colCount={COL_COUNT}
                  globalPrice={globalPrice}
                  onChange={handleCellChange}
                  onRowUpdate={handleRowUpdate}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onDelete={handleDeleteRow}
                  onPreviewInvoice={setPreviewRowId}
                  onPreviewRealInvoice={handlePreviewRealInvoice}
                  isSelected={selectedIds.has(row.id)}
                  onToggleSelect={toggleSelectRow}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add Rows Button */}
          <div className="p-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddRows}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("spreadsheet.addRow", "Agregar fila")}
            </Button>
          </div>
        </div>
      </div>

      {/* Spreadsheet Totals Footer Panel */}
      <div className="border-t border-border bg-card px-6 py-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Métricas en Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
              Totales:
            </span>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <Boxes className="w-3.5 h-3.5 mr-1 text-primary/80" />
              <span className="text-muted-foreground mr-0.5">Paquetes/Items:</span>
              <span className="font-bold">{totals.items}</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
              <Maximize className="w-3.5 h-3.5 mr-1 text-amber-600/80" />
              <span className="text-muted-foreground mr-0.5">Vol. Real:</span>
              <span className="font-bold">{totals.cubicFeet.toFixed(2)} ft³</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20">
              <Maximize className="w-3.5 h-3.5 mr-1 text-yellow-600/80" />
              <span className="text-muted-foreground mr-0.5">Vol. Redondeado:</span>
              <span className="font-bold">{totals.roundedVolume} Vol.</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
              <Users className="w-3.5 h-3.5 mr-1 text-blue-600/80" />
              <span className="text-muted-foreground mr-0.5">Clientes:</span>
              <span className="font-bold">{totals.clients}</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
              <FileText className="w-3.5 h-3.5 mr-1 text-purple-600/80" />
              <span className="text-muted-foreground mr-0.5">Facturas:</span>
              <span className="font-bold">{totals.invoices}</span>
            </div>
          </div>

          {/* Montos Totales */}
          <div className="flex items-center gap-4 text-sm font-semibold pr-2">
            <div className="text-muted-foreground flex items-center gap-1">
              <span>Monto Total:</span>
              <span className="text-foreground text-lg font-bold ml-1">
                ${totals.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {exchangeRate > 0 && (
              <div className="text-muted-foreground border-l border-border pl-4 flex items-center gap-1">
                <span>Total CRC:</span>
                <span className="text-emerald-600 text-lg font-bold ml-1">
                  ₡{totals.crc.toLocaleString("es-CR")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {previewRowId && (() => {
        const previewRow = visibleRows.find((r) => r.id === previewRowId);
        const siblingRows = previewRow?.slCode
          ? visibleRows.filter((r) => r.slCode === previewRow.slCode && r.isValid)
          : [];
        return (
          <SeaManifestInvoicePreview
            row={{
              ...(previewRow as CalculatedSeaManifestRow),
              bodegajeCost: previewRow?.bodegajeCost ?? bodegajeCost,
              permisoCost: previewRow?.permisoCost ?? permisoCost,
              ivaEnabled: previewRow?.ivaEnabled ?? ivaEnabled,
            }}
            siblingRows={siblingRows}
            exchangeRate={exchangeRate}
            manifestName={manifestName}
            onClose={() => setPreviewRowId(null)}
            onSaveDraft={async (payload) => {
              try {
                // If there are sibling rows, distribute the saved costs:
                // Set the main row to payload.bodegajeCost / payload.permisoCost
                // Set other sibling rows to 0
                const updatedSiblingRows = siblingRows.map((r) => {
                  if (r.id === payload.row.id) {
                    return {
                      ...r,
                      bodegajeCost: payload.bodegajeCost,
                      permisoCost: payload.permisoCost,
                      ivaEnabled: payload.ivaEnabled,
                    };
                  } else {
                    return {
                      ...r,
                      bodegajeCost: 0,
                      permisoCost: 0,
                      ivaEnabled: payload.ivaEnabled,
                    };
                  }
                });

                // Update rows in parent state
                const nextRows = rows.map((r) => {
                  const match = updatedSiblingRows.find((ur) => ur.id === r.id);
                  return match ? match : r;
                });
                setRows(nextRows);

                // Save temporally to Firestore without creating draft invoice yet
                await onSubmit(
                  updatedSiblingRows,
                  manifestName.trim(),
                  false, // createDraftInvoices = false
                  {
                    ivaEnabled: payload.ivaEnabled,
                    bodegajeCost: payload.bodegajeCost,
                    permisoCost: payload.permisoCost,
                    exchangeRate,
                  },
                );

                // Save to manifest_usa_sea document in Firestore
                await saveManifestDoc(nextRows, globalPrice, exchangeRate, isProcessed);

                toast({
                  title: "Éxito",
                  description: "Valores guardados temporalmente.",
                });
              } catch (err) {
                console.error("Error guardando temporalmente:", err);
                toast({
                  title: "Error",
                  description: "Ocurrió un error al guardar localmente.",
                  variant: "destructive",
                });
              }
            }}
            onConfirmSend={async (payload, testEmail) => {
              try {
                const updatedSiblingRows = siblingRows.map((r) => {
                  if (r.id === payload.row.id) {
                    return {
                      ...r,
                      bodegajeCost: payload.bodegajeCost,
                      permisoCost: payload.permisoCost,
                      ivaEnabled: payload.ivaEnabled,
                    };
                  } else {
                    return {
                      ...r,
                      bodegajeCost: 0,
                      permisoCost: 0,
                      ivaEnabled: payload.ivaEnabled,
                    };
                  }
                });

                // First, process the sibling rows (save package, create draft invoice)
                const generatedInvoices = await onSubmit(
                  updatedSiblingRows,
                  manifestName.trim(),
                  true, // create draft invoices
                  {
                    ivaEnabled: payload.ivaEnabled,
                    bodegajeCost: payload.bodegajeCost,
                    permisoCost: payload.permisoCost,
                    exchangeRate,
                    mergeInvoices: true, // Group these rows into one invoice!
                  },
                );

                let matchingInvoice: any = null;
                let nextRows = rows;
                // Update the grid state for these sibling rows if invoice was generated
                if (
                  generatedInvoices &&
                  Array.isArray(generatedInvoices) &&
                  generatedInvoices.length > 0
                ) {
                  matchingInvoice = generatedInvoices[0];
                  nextRows = rows.map((r) => {
                    const isSibling = siblingRows.some((sr) => sr.id === r.id);
                    if (isSibling) {
                      return {
                        ...r,
                        bodegajeCost: r.id === payload.row.id ? payload.bodegajeCost : 0,
                        permisoCost: r.id === payload.row.id ? payload.permisoCost : 0,
                        ivaEnabled: payload.ivaEnabled,
                        invoiceId: matchingInvoice.id,
                        invoiceNumber: matchingInvoice.invoiceNumber,
                        invoiceStatus: matchingInvoice.status,
                      };
                    }
                    return r;
                  });
                  setRows(nextRows);
                }

                if (!matchingInvoice) {
                  throw new Error("No se pudo generar o encontrar la factura correspondiente.");
                }

                // Save to manifest_usa_sea document in Firestore
                await saveManifestDoc(nextRows, globalPrice, exchangeRate, isProcessed);

                // Send the email (test or real)
                if (testEmail) {
                  await sendTestInvoiceEmail({ ...matchingInvoice, status: 'sent' }, testEmail);
                  toast({
                    title: "Éxito",
                    description: `Prueba de correo enviada a ${testEmail}.`,
                  });
                } else {
                  const res = await sendInvoiceEmails([ { ...matchingInvoice, status: 'sent' } ]);
                  if (res.errors.length > 0) {
                    toast({
                      title: "Error",
                      description: `Factura creada pero hubo un error al enviar el correo: ${res.errors[0].error}`,
                      variant: "destructive",
                    });
                  } else {
                    toast({
                      title: "Éxito",
                      description: "Factura procesada y enviada por correo.",
                    });
                  }
                }
              } catch (err) {
                console.error("Error procesando/enviando fila marítima:", err);
                toast({
                  title: "Error",
                  description: err instanceof Error ? err.message : "Ocurrió un error al procesar la fila.",
                  variant: "destructive",
                });
              }
            }}
          />
        );
      })()}

      {/* Real Invoice Preview Modal */}
      {realInvoicePreview && (
        <NovaInvoicePreview
          invoice={realInvoicePreview}
          onClose={() => setRealInvoicePreview(null)}
        />
      )}

      {/* Process Confirmation Modal */}
      <Dialog open={showProcessModal} onOpenChange={setShowProcessModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Procesamiento</DialogTitle>
            <DialogDescription>
              Se crearán{" "}
              {
                calculatedRows.filter(
                  (r) =>
                    r.warehouseId.trim() ||
                    r.slCode.trim() ||
                    r.length ||
                    r.width ||
                    r.height,
                ).length
              }{" "}
              paquetes en la base de datos del sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="draft-invoices"
                checked={createDraftInvoices}
                onCheckedChange={setCreateDraftInvoices}
              />
              <Label htmlFor="draft-invoices">
                Crear facturas en estado Borrador
              </Label>
            </div>
            {createDraftInvoices && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs">Cargo por Bodegaje ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bodegajeCost}
                    onChange={(e) =>
                      setBodegajeCost(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Cargo por Permisos ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={permisoCost}
                    onChange={(e) =>
                      setPermisoCost(Number(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="col-span-2 flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="aplicar-iva"
                    checked={ivaEnabled}
                    onCheckedChange={(checked) => setIvaEnabled(!!checked)}
                  />
                  <Label htmlFor="aplicar-iva" className="text-xs">
                    Aplicar IVA (13%)
                  </Label>
                </div>
                <div className="col-span-2 space-y-2 pt-3 border-t border-border mt-2">
                  <Label className="text-xs font-bold text-foreground">
                    Modo de Facturación
                  </Label>
                  <RadioGroup
                    defaultValue="individual"
                    value={mergeInvoices ? "consolidated" : "individual"}
                    onValueChange={(val) => setMergeInvoices(val === "consolidated")}
                    className="flex flex-col gap-2 mt-1"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="individual" id="r-individual" />
                      <Label htmlFor="r-individual" className="text-xs font-medium cursor-pointer">
                        Facturar individual por paquete / warehouse
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="consolidated" id="r-consolidated" />
                      <Label htmlFor="r-consolidated" className="text-xs font-medium cursor-pointer text-primary">
                        Agrupar por cliente / Smart ID (Factura única)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {mergeInvoices
                ? "Se agruparán todos los paquetes del mismo Smart ID en una única factura borrador."
                : "Se generará una factura en borrador independiente por cada paquete o warehouse id."}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProcessModal(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmProcess}>Procesar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Save Confirmation Modal */}
      <Dialog open={showBulkSaveConfirm} onOpenChange={setShowBulkSaveConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Guardado en BD</DialogTitle>
            <DialogDescription>
              Se guardarán/actualizarán {selectedIds.size} paquetes seleccionados en la base de datos.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Esta acción registrará los paquetes en el sistema. Las facturas existentes no se verán afectadas a menos que re-procese el manifiesto completo.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkSaveConfirm(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setShowBulkSaveConfirm(false);
                onBulkSave?.(visibleRows.filter((r) => selectedIds.has(r.id)));
              }}
            >
              Confirmar y Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Email Confirmation Modal */}
      <Dialog open={showBulkEmailConfirm} onOpenChange={setShowBulkEmailConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirmar Envío de Facturas</DialogTitle>
            <DialogDescription>
              Se enviarán las facturas correspondientes a los {selectedIds.size} paquetes seleccionados.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Se despacharán los correos con los tiquetes electrónicos a los clientes de forma masiva. Las facturas cambiarán a estado "Enviado".
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkEmailConfirm(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setShowBulkEmailConfirm(false);
                if (onBulkEmail) {
                  const sentIds = await onBulkEmail(
                    visibleRows.filter((r) => selectedIds.has(r.id)),
                  );
                  if (sentIds && sentIds.length > 0) {
                    const nextRows = rows.map((r) =>
                      sentIds.includes(r.invoiceId || "")
                        ? { ...r, invoiceStatus: "sent" }
                        : r,
                    );
                    setRows(nextRows);
                    await saveManifestDoc(nextRows, globalPrice, exchangeRate, isProcessed);
                  }
                }
              }}
            >
              Confirmar y Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
