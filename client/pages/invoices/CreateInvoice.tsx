import { useState, useMemo, useEffect, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/context/ThemeContext";
import { useCustomerSearch } from "@/lib/hooks/queries/useCustomers";
import { usePackagesForInvoice } from "@/lib/hooks/queries/usePackages";
import { useCreateInvoice } from "@/lib/hooks/queries/useInvoices";
import { usePricing } from "@/lib/hooks/usePricing";
import { firestoreApi, searchPackages } from "@/lib/firebase/firestore-client";
import { buildInvoiceData, type InvoiceGroup } from "@/lib/services/invoice-service";
import { getRecentManifests } from "@/lib/services/manifest-processor";
import { logAction } from "@/lib/services/audit-service";
import type { ProcessedRow } from "@/hooks/use-nova-chat";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, AlertCircle, AlertTriangle, RotateCcw, Package, FileText } from "lucide-react";
import { CustomerSearchInput } from "@/components/invoices/CustomerSearchInput";
import { AssignSlCodeModal } from "@/components/invoices/AssignSlCodeModal";
import { PackageSelectionGrid } from "@/components/invoices/PackageSelectionGrid";
import { NovaInvoicePreview, type SP1InvoiceShape } from "@/components/nova/NovaInvoicePreview";
import { ManualInvoiceItems, ManualInvoiceItem } from "@/components/invoices/ManualInvoiceItems";

interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  slCode?: string;
  address?: string;
}

interface PackageData {
  id: string;
  trackingNumber: string;
  customerName: string;
  customerId?: string;
  slCode?: string;
  weight: number;
  destination: string;
  status: string;
  calculatedCost?: number;
  manifestType?: string;
  permisos?: boolean;
  manifestNumber?: string;
  description?: string;
}

const CreateInvoice = memo(function CreateInvoice() {
  const { t } = useLocale(['invoices', 'common']);
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { toast } = useToast();
  const navigate = useNavigate();
  const { calculate: calculateShippingPrice } = usePricing();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);

  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const { results: customerSearchResults, isLoading: loadingCustomers } = useCustomerSearch(customerSearchTerm, 300, 50);
  const { data: packagesResp, isLoading: loadingPackages, refetch: refetchPackages } = usePackagesForInvoice(
    selectedCustomer?.id || "",
    selectedCustomer?.slCode,
  );
  const createInvoiceMutation = useCreateInvoice();
  const [notes, setNotes] = useState("");
  const [showSlCodeModal, setShowSlCodeModal] = useState(false);
  const [assigningSlCode, setAssigningSlCode] = useState(false);
  const [isConsolidation, setIsConsolidation] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [applyIva, setApplyIva] = useState(true);

  // Auto-fetched USD→CRC exchange rate from the most recent manifest. Mirrors
  // NovaTableModal's pre-fill behaviour so manual invoices are stamped with
  // the same rate Nova uses today, and downstream surfaces (NovaInvoicePreview,
  // sync-invoices-service) render CRC totals identically. Operator can override
  // before submitting.
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  useEffect(() => {
    let alive = true;
    getRecentManifests(10)
      .then(manifests => {
        if (!alive) return;
        const withTc = manifests.filter(m => (m.exchangeRate ?? 0) > 0);
        if (withTc.length > 0 && withTc[0].exchangeRate) {
          setExchangeRate(withTc[0].exchangeRate);
        }
      })
      .catch(() => { /* non-fatal — operator can type the rate manually */ });
    return () => { alive = false; };
  }, []);

  // Global tracking search — fires when the user types in the package search box
  const [pkgSearch, setPkgSearch] = useState("");
  const [globalExtraPkgs, setGlobalExtraPkgs] = useState<PackageData[]>([]);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);

  // Clear extra packages when the selected customer changes
  useEffect(() => {
    setGlobalExtraPkgs([]);
  }, [selectedCustomer?.id]);

  // Debounced global search: 400ms after the user stops typing
  useEffect(() => {
    if (!pkgSearch.trim() || pkgSearch.length < 3) return;
    const timer = setTimeout(async () => {
      setIsGlobalSearching(true);
      try {
        const results = await searchPackages(pkgSearch.trim(), 15);
        setGlobalExtraPkgs(prev => {
          const seen = new Set(prev.map(p => p.id));
          const newPkgs: PackageData[] = results
            .filter(r => !seen.has(r.id))
            .map(r => ({
              id: r.id,
              trackingNumber: r.trackingNumber,
              customerName: r.customerName || "",
              customerId: (r as any).customerId,
              slCode: r.slCode,
              weight: Number((r as any).weight) || 0,
              destination: String((r as any).destination || ""),
              status: r.status || "",
              calculatedCost: (r as any).calculatedCost ? Number((r as any).calculatedCost) : undefined,
              manifestType: (r as any).manifestType,
              permisos: (r as any).permisos,
              manifestNumber: (r as any).manifestNumber,
              description: (r as any).description,
            }));
          return [...prev, ...newPkgs];
        });
      } catch { /* ignore */ }
      finally { setIsGlobalSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [pkgSearch]);
  
  // Items tab state: "packages" | "manual"
  const [itemsTab, setItemsTab] = useState<"packages" | "manual">("packages");
  const [manualItems, setManualItems] = useState<ManualInvoiceItem[]>([]);

  // Map live search results from Firestore
  const customers: Customer[] = useMemo(() => {
    return customerSearchResults.map((c: any) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      slCode: c.slCode,
      address: c.address,
    }));
  }, [customerSearchResults]);

  const allPackages: PackageData[] = useMemo(() => {
    // usePackages already unwraps result.data, so packagesResp is the array
    const data = (packagesResp as any) || [];
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((p: any) => ({
      id: p.id,
      trackingNumber: p.trackingNumber,
      customerName: p.customerName,
      customerId: p.customerId,
      slCode: p.slCode,
      weight: Number(p.weight) || 0,
      destination: p.destination || "",
      status: p.status || "pending",
      calculatedCost: p.calculatedCost
        ? Number(p.calculatedCost)
        : (p.price ? Number(p.price) : (p.cost ? Number(p.cost) : undefined)),
      manifestType: (() => {
        if (p.manifestType) return p.manifestType as string;
        const origin = (p.origin || "").toLowerCase();
        const type   = (p.type   || "").toLowerCase();
        const country =
          origin.includes("miami") || origin.includes("usa") || origin.includes("united") || origin.includes(", fl") || origin.includes("florida")
            ? "usa"
            : origin.includes("china") || origin.includes("guangzhou") || origin.includes("shenzhen") || origin.includes("beijing")
            ? "china"
            : origin.includes("colombia") || origin.includes("bogot")
            ? "colombia"
            : origin.includes("mexico") || origin.includes("m\u00e9x")
            ? "mexico"
            : null;
        if (!country) return undefined;
        return `${country}_${type === "sea" ? "sea" : "air"}`;
      })(),
      permisos: !!(p.permisos || p.requiresPermit),
      manifestNumber: p.manifestNumber || p.manifestId || undefined,
      description: p.description || p.descripcion || undefined,
    }));
  }, [packagesResp]);

  // Filter packages for selected customer
  // usePackagesForInvoice already queries by customerId+slCode server-side;
  // this filter is a safety net for edge cases (e.g. packages linked only by name).
  const customerPackages = useMemo(() => {
    if (!selectedCustomer) return [];
    return allPackages.filter((pkg) => {
      if (selectedCustomer.id && pkg.customerId && pkg.customerId === selectedCustomer.id) return true;
      if (selectedCustomer.slCode && pkg.slCode && pkg.slCode === selectedCustomer.slCode) return true;
      if (pkg.customerName.toLowerCase() === selectedCustomer.fullName.toLowerCase()) return true;
      return false;
    });
  }, [allPackages, selectedCustomer]);

  // Merge customer packages with any globally-found extras (deduped by id).
  // globalExtraPkgs accumulates across searches so selected foreign packages are never lost.
  const customerPackageIds = useMemo(() => new Set(customerPackages.map(p => p.id)), [customerPackages]);
  const effectivePackages = useMemo(() => {
    const extras = globalExtraPkgs.filter(p => !customerPackageIds.has(p.id));
    return [...customerPackages, ...extras];
  }, [customerPackages, globalExtraPkgs, customerPackageIds]);
  const foreignPkgIds = useMemo(
    () => new Set(globalExtraPkgs.filter(p => !customerPackageIds.has(p.id)).map(p => p.id)),
    [globalExtraPkgs, customerPackageIds],
  );

  // Calculate invoice totals using pricing utility
  const calculatePackageCost = (pkg: PackageData): number => {
    if (pkg.calculatedCost) return pkg.calculatedCost;
    
    // Use the pricing calculator with USA Air as default
    const result = calculateShippingPrice(pkg.weight, {
      country: 'usa',
      shippingType: 'air',
      itemCategory: 'regular',
      requiresPermit: false,
    });
    
    return result.quoteRequired ? 0 : result.price;
  };

  // Stamp the correct price into packages so PackageSelectionGrid shows the same
  // value as the invoice preview (not its own baseRate+weight×rate fallback).
  const effectivePackagesWithCost = useMemo(() => {
    return effectivePackages.map(pkg => ({
      ...pkg,
      calculatedCost: pkg.calculatedCost ?? calculatePackageCost(pkg),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePackages]);

  const selectedPackages = useMemo(() => {
    return effectivePackages.filter((pkg) => selectedPackageIds.includes(pkg.id));
  }, [effectivePackages, selectedPackageIds]);

  const invoiceItems = useMemo(() => {
    // Combine package items and manual items for preview
    const packageItems = selectedPackages.map((pkg) => ({
      id: pkg.id,
      trackingNumber: pkg.trackingNumber,
      description: undefined,
      weight: pkg.weight,
      unitPrice: calculatePackageCost(pkg),
      quantity: 1,
      totalPrice: calculatePackageCost(pkg),
      isManual: false,
    }));
    
    const manualInvoiceItems = manualItems
      .filter(item => item.description.trim())
      .map((item) => ({
        id: item.id,
        trackingNumber: undefined,
        description: item.description,
        weight: item.weight || 0,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: item.unitPrice * item.quantity,
        isManual: true,
        origin: item.origin,
        destination: item.destination,
        dimensions: item.length && item.width && item.height 
          ? `${item.length}x${item.width}x${item.height} cm`
          : undefined,
      }));
    
    return [...packageItems, ...manualInvoiceItems];
  }, [selectedPackages, manualItems]);

  const subtotal = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalWeight = invoiceItems.reduce((sum, item) => sum + item.weight, 0);
  const taxRate = 0.13; // 13% IVA
  const tax = applyIva ? subtotal * taxRate : 0;
  const discountAmount = (subtotal + tax) * (discountPercentage / 100);
  const total = subtotal + tax - discountAmount;

  const draftInvoice = useMemo((): SP1InvoiceShape => ({
    id: 'draft',
    invoiceNumber: 'BORRADOR',
    status: 'draft',
    subtotalAmount: subtotal,
    taxAmount: tax,
    totalAmount: total,
    discountAmount: discountAmount,
    discountPercentage: discountPercentage,
    ivaEnabled: applyIva,
    invoiceDate: new Date().toISOString(),
    notes: notes || undefined,
    customer: selectedCustomer
      ? {
          fullName: selectedCustomer.fullName,
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          slCode: selectedCustomer.slCode,
        }
      : undefined,
    invoiceItems: invoiceItems.map((item) => ({
      trackingNumber: item.trackingNumber,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      weight: item.weight,
      isManual: item.isManual,
    })),
  }), [selectedCustomer, invoiceItems, subtotal, tax, total, discountAmount, discountPercentage, applyIva, notes]);

  // Handle customer selection
  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setSelectedPackageIds([]);
    
    // Check if customer has SL code
    if (customer && !customer.slCode) {
      setShowSlCodeModal(true);
    }
  };

  // Reset/Clear the invoice form
  const handleClearForm = () => {
    setSelectedCustomer(null);
    setSelectedPackageIds([]);
    setManualItems([]);
    setNotes("");
    setIsConsolidation(false);
    setDiscountPercentage(0);
    setApplyIva(true);
    setItemsTab("packages");
  };

  // Handle SL code assignment
  const handleAssignSlCode = async (slCode: string) => {
    if (!selectedCustomer) return;

    setAssigningSlCode(true);
    try {
      await firestoreApi.customers.update(selectedCustomer.id, {
        slCode: slCode,
      });

      setSelectedCustomer({
        ...selectedCustomer,
        slCode: slCode,
      });

      setShowSlCodeModal(false);
      toast({
        title: t("common.success"),
        description: t("invoices.slCodeAssigned"),
      });
    } catch (error) {
      throw new Error(t("invoices.failedAssignSlCode"));
    } finally {
      setAssigningSlCode(false);
    }
  };

  // Handle package selection
  const handleAddPackage = (packageId: string) => {
    setSelectedPackageIds((prev) => [...prev, packageId]);
  };

  const handleRemovePackage = (packageId: string) => {
    setSelectedPackageIds((prev) => prev.filter((id) => id !== packageId));
  };

  // Handle invoice creation
  const handleCreateInvoice = async () => {
    // Validate customer selection
    if (!selectedCustomer) {
      toast({
        title: t("common.error"),
        description: t("invoices.selectCustomerPackages"),
        variant: "destructive",
      });
      return;
    }

    // Validate items (either packages or manual items required)
    const hasPackages = selectedPackageIds.length > 0;
    const hasManualItems = manualItems.length > 0 && manualItems.some(item => item.description.trim());
    
    if (!hasPackages && !hasManualItems) {
      toast({
        title: t("common.error"),
        description: t("invoices.selectItemsOrManual"),
        variant: "destructive",
      });
      return;
    }

    // Validate manual items if present
    if (hasManualItems) {
      const invalidItems = manualItems.filter(
        item => !item.description.trim() || item.quantity < 1 || item.unitPrice < 0
      );
      if (invalidItems.length > 0) {
        toast({
          title: t("common.error"),
          description: t("invoices.createCustomer.requiredFields"),
          variant: "destructive",
        });
        return;
      }
    }

    try {
      // ────────────────────────────────────────────────────────────────────
      // INVOICE PARITY WITH NOVA — single source of truth via buildInvoiceData
      // ────────────────────────────────────────────────────────────────────
      // The previous payload only sent SP1-shaped fields (subtotalAmount,
      // taxAmount, totalAmount) and nothing about CRC totals, exchange rate,
      // invoice number, dates, manifest, source, isConsolidation, items[]
      // (SP2 shape), invoiceItems[], customer{}, trackingNumber/Numbers, etc.
      // That meant invoices created here showed "Invalid Date" + missing CRC
      // + no Nova badge + no tracking description (image 2 in regression
      // screenshot). Switching to buildInvoiceData() — the same builder
      // createInvoicesFromRows() uses for Nova-generated invoices —
      // guarantees byte-for-byte field parity (image 1). Any future field
      // added to Nova invoices automatically lands in manual ones too.

      // 1. Convert each selected package into a ProcessedRow that mimics what
      //    Nova's manifest pipeline would produce. Only the fields buildInvoiceData
      //    reads (tracking, peso, precio, permisos, pesoRedondeo) are populated
      //    with real values; the rest are safe defaults so we satisfy the
      //    ProcessedRow contract without lying about the data shape.
      const selectedPkgs = hasPackages
        ? selectedPackageIds
            .map(id => effectivePackages.find(p => p.id === id))
            .filter((p): p is PackageData => !!p)
        : [];

      const customerSlCode = selectedCustomer.slCode || '';
      const customerName   = selectedCustomer.fullName;
      const customerEmail  = selectedCustomer.email || '';
      const customerRoute  = (selectedCustomer.address || '').toUpperCase();

      const rows: ProcessedRow[] = selectedPkgs.map(pkg => {
        const price = Math.round(calculatePackageCost(pkg) * 100) / 100;
        const realPeso = pkg.weight || 0;
        const isPermiso = !!pkg.permisos;
        return {
          tracking:           pkg.trackingNumber,
          nombre:             customerName,
          guia:               pkg.trackingNumber,
          manifiesto:         pkg.manifestNumber || '',
          peso:               realPeso,
          precio:             price,
          slCode:             customerSlCode,
          nombreCliente:      customerName,
          ruta:               customerRoute,
          // isConsolidation is decided by buildInvoiceData based on row count
          // and isMergedSingle; this field on the row is informational only.
          consolidacion:      isConsolidation,
          descripcion:        pkg.description || '',
          permisos:           isPermiso,
          pesoRedondeo:       isPermiso ? Math.ceil(realPeso) : realPeso,
          diferenciaRedondeo: 0,
          pesoConsolidacion:  0,
          precioSinPermiso:   price,
          precioConPermiso:   price,
          matchScore:         1,
          originalData:       {},
        };
      });

      // 2. Manual line items become extraItems — buildInvoiceData renders them
      //    as canonical isManual=true rows (description + amount), exactly like
      //    Nova does for Servicio de Terceros entries.
      const extraItemsRaw = hasManualItems
        ? manualItems
            .filter(item => item.description.trim())
            .map(item => ({
              description: item.description.trim(),
              amount:      Number(item.unitPrice) * Number(item.quantity || 1),
            }))
        : [];

      // 3. EDGE CASE — manual-only invoice (no packages selected).
      //    buildInvoiceData expects rows[].length >= 1 to compute group totals.
      //    Synthesize a single placeholder row with precio=0 and let extraItems
      //    drive the totals. The placeholder gets stripped from the final
      //    items[] / invoiceItems[] arrays so it never reaches the document.
      const isManualOnly = rows.length === 0 && extraItemsRaw.length > 0;
      if (isManualOnly) {
        rows.push({
          tracking:           '',
          nombre:             customerName,
          guia:               '',
          manifiesto:         '',
          peso:               0,
          precio:             0,
          slCode:             customerSlCode,
          nombreCliente:      customerName,
          ruta:               customerRoute,
          consolidacion:      false,
          descripcion:        '',
          permisos:           false,
          pesoRedondeo:       0,
          diferenciaRedondeo: 0,
          pesoConsolidacion:  0,
          precioSinPermiso:   0,
          precioConPermiso:   0,
          matchScore:         1,
          originalData:       {},
        });
      }

      // 4. Group payload mirrors what groupRowsForInvoicing() yields per customer.
      //    isMergedSingle = "Factura única" (one invoice per customer with
      //    individual per-row pricing) — applied when operator did NOT tick the
      //    Consolidación checkbox AND there is more than one selected package.
      //    This matches Nova's UX: a multi-package operator-driven invoice that
      //    is NOT consolidated is by definition Factura única.
      const group: InvoiceGroup = {
        slCode:         customerSlCode || 'SIN-CODIGO',
        userId:         selectedCustomer.id,
        clientName:     customerName,
        clientEmail:    customerEmail,
        clientDni:      '',
        clientRoute:    customerRoute,
        rows,
        isMergedSingle: !isConsolidation && rows.length > 1,
      };

      // 5. If every selected package shares the SAME manifest, stamp it on the
      //    invoice. Mixed manifests → leave undefined (Nova does the same).
      const manifests = Array.from(
        new Set(selectedPkgs.map(p => p.manifestNumber).filter(Boolean) as string[])
      );
      const sharedManifestNumber = manifests.length === 1 ? manifests[0] : undefined;

      // 6. Build the canonical invoice payload.
      let data = buildInvoiceData(
        group,
        applyIva,
        exchangeRate,
        sharedManifestNumber,
        extraItemsRaw.length ? extraItemsRaw : undefined,
      );

      // 7. Manual-only mode: strip the placeholder row from items + invoiceItems
      //    so the saved doc only contains the real (extra) items.
      if (isManualOnly) {
        data = {
          ...data,
          items:        (data.items ?? []).filter(i => i.tracking !== ''),
          invoiceItems: (data.invoiceItems ?? []).filter(ii => ii.trackingNumber !== '' || ii.isManual),
          packageCount: 0,
          totalWeight:  0,
        };
      }

      // 8. Apply discount post-build. buildInvoiceData does not natively
      //    support discounts (Nova never offered them). We replay the same
      //    USD/CRC math invariants the builder uses so subtotal + iva === total
      //    and amountCRC == round(total * exchangeRate).
      if (discountPercentage > 0) {
        const grossTotal     = data.totalAmount ?? 0;
        const discountAmt    = Math.round(grossTotal * (discountPercentage / 100) * 100) / 100;
        const newTotal       = Math.round((grossTotal - discountAmt) * 100) / 100;
        const newSubtotal    = applyIva ? Math.round(newTotal / 1.13 * 100) / 100 : newTotal;
        const newIva         = applyIva ? Math.round((newTotal - newSubtotal) * 100) / 100 : 0;
        const newCRC         = exchangeRate > 0 ? Math.round(newTotal * exchangeRate) : 0;
        const newSubCRC      = applyIva ? Math.round(newCRC / 1.13) : newCRC;
        const newIvaCRC      = applyIva ? Math.round(newCRC - newSubCRC) : 0;
        data = {
          ...data,
          totalAmount:        newTotal,
          subtotalAmount:     newSubtotal,
          taxAmount:          newIva,
          amount:             newTotal,
          subtotal:           newSubtotal,
          iva:                newIva,
          amountCRC:          newCRC,
          subtotalCRC:        newSubCRC,
          ivaCRC:             newIvaCRC,
          discountPercentage,
          discountAmount:     discountAmt,
        } as typeof data;
      }

      // 9. Provenance + operator overrides.
      //    - source: 'manual' so /invoices badges show "Manual" instead of
      //      "Nova" — visually distinguishes the origin of every invoice.
      //    - notes: operator's free-text overrides the auto-generated notes
      //      buildInvoiceData produces ("Factura consolidada — N paquetes").
      const trimmedNotes = notes.trim();
      data = {
        ...data,
        source: 'manual',
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      } as typeof data;

      // 10. Persist via the generic create — firestoreApi adds server
      //     timestamps for createdAt/updatedAt. The hook also invalidates
      //     /invoices caches so the new doc appears immediately in the list.
      const res = await createInvoiceMutation.mutateAsync(data as any) as any;
      const createdId = res?.data?.id || 'unknown';

      logAction({
        userId: user?.id ?? 'unknown',
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: 'invoice_created',
        category: 'invoice',
        resource: '/invoices',
        resourceId: createdId,
        result: 'success',
        metadata: {
          invoiceNumber: data.invoiceNumber || 'N/A',
          totalAmount: total,
          customerSlCode,
          customerName,
          note: 'Factura manual creada desde panel de creación de facturas.'
        }
      });

      toast({
        title: t("common.success"),
        description: t("invoices.invoiceCreated"),
      });

      navigate("/invoices");
    } catch (error) {
      console.error('[CreateInvoice] handleCreateInvoice failed:', error);
      toast({
        title: t("common.error"),
        description: t("invoices.failedCreate"),
        variant: "destructive",
      });
    }
  };

  // Check permissions
  if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8">
          <Card className="p-8 text-center bg-white border-gray-300">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-600" aria-hidden="true" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t("invoices.accessDenied")}</h2>
            <p className="text-gray-600">{t("invoices.accessDeniedDescription")}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const isCreating = createInvoiceMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4" data-testid="create-invoice-page">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/invoices")}
              className={`h-8 w-8 p-0 ${isDark ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"}`}
              data-testid="back-to-invoices-btn"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{t("invoices.createInvoice")}</h1>
              <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>{t("invoices.subtitle")}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-6"
          >
            {/* Left Column: Customer & Package Selection */}
            <div className="xl:col-span-5 space-y-5">
              {/* Customer Selection */}
              <Card className="p-5 border-gray-200 shadow-sm" data-testid="customer-selection-card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-gray-900">
                    {t("invoices.customerDetails")}
                  </h2>
                  {selectedCustomer && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleClearForm}
                      className="h-7 px-2.5 text-xs"
                      data-testid="clear-form-btn"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {t("common.clear") || "Clear"}
                    </Button>
                  )}
                </div>
                <CustomerSearchInput
                  customers={customers}
                  selectedCustomer={selectedCustomer}
                  onSelectCustomer={handleSelectCustomer}
                  onSearchTermChange={setCustomerSearchTerm}
                  isLoading={loadingCustomers}
                  disabled={isCreating}
                />
                
                <AnimatePresence mode="wait">
                  {selectedCustomer && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="mt-3 space-y-3"
                    >
                      {/* Consolidation & Discount Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 mt-2 border-t border-gray-100">
                        {/* Left checkboxes */}
                        <div className="flex items-center gap-5">
                          {/* Consolidation Checkbox */}
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="is-consolidation"
                              checked={isConsolidation}
                              onCheckedChange={(checked) => setIsConsolidation(checked as boolean)}
                            />
                            <label
                              htmlFor="is-consolidation"
                              className="text-sm font-medium text-gray-800 cursor-pointer whitespace-nowrap"
                            >
                              {t("invoices.isConsolidation")}
                            </label>
                          </div>
                          {/* IVA Checkbox */}
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="apply-iva"
                              checked={applyIva}
                              onCheckedChange={(checked) => setApplyIva(!!checked)}
                            />
                            <label
                              htmlFor="apply-iva"
                              className="text-sm font-medium text-gray-800 cursor-pointer whitespace-nowrap"
                            >
                              IVA (13%)
                            </label>
                          </div>
                        </div>

                        {/* Discount Percentage Input */}
                        <div className="flex items-center gap-2">
                          <Label htmlFor="discount-percentage" className="text-sm font-medium text-gray-800 whitespace-nowrap">
                            {t("invoices.discountPercentage")}
                          </Label>
                          <div className="relative">
                            <Input
                              id="discount-percentage"
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={discountPercentage || ""}
                              onChange={(e) => setDiscountPercentage(parseFloat(e.target.value) || 0)}
                              onFocus={(e) => e.target.select()}
                              className="border-gray-300 w-24 h-9 pr-7 text-right no-spinners"
                              placeholder="0"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium select-none pointer-events-none">
                              %
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Consolidation Warning */}
                      <AnimatePresence>
                        {isConsolidation && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Alert className="border-amber-200 bg-amber-50 py-2">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <AlertDescription className="text-sm text-amber-800">
                                {t("invoices.consolidationWarning")}
                              </AlertDescription>
                            </Alert>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              {/* Package/Manual Items Selection with Tabs */}
              <AnimatePresence mode="wait">
                {selectedCustomer && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <Card className="border-gray-200 shadow-sm overflow-hidden" data-testid="items-selection-card">
                  {/* Tab Navigation */}
                  <div 
                    className="flex border-b border-gray-200 bg-gray-50/50"
                    role="tablist"
                    aria-label="Item selection options"
                  >
                    <button
                      role="tab"
                      id="tab-packages"
                      aria-selected={itemsTab === "packages"}
                      aria-controls="panel-packages"
                      tabIndex={itemsTab === "packages" ? 0 : -1}
                      onClick={() => setItemsTab("packages")}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") {
                          setItemsTab("manual");
                          document.getElementById("tab-manual")?.focus();
                        }
                      }}
                      className={`flex-1 py-3 px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset border-b-2 ${
                        itemsTab === "packages"
                          ? "border-gray-900 text-gray-900 bg-white"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                      data-testid="tab-packages"
                    >
                      <Package className="h-4 w-4 inline-block mr-1.5" aria-hidden="true" />
                      {t("invoices.itemsTabs.packages")}
                      {selectedPackageIds.length > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-900 text-white">
                          {selectedPackageIds.length}
                        </span>
                      )}
                    </button>
                    <button
                      role="tab"
                      id="tab-manual"
                      aria-selected={itemsTab === "manual"}
                      aria-controls="panel-manual"
                      tabIndex={itemsTab === "manual" ? 0 : -1}
                      onClick={() => setItemsTab("manual")}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          setItemsTab("packages");
                          document.getElementById("tab-packages")?.focus();
                        }
                      }}
                      className={`flex-1 py-3 px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset border-b-2 ${
                        itemsTab === "manual"
                          ? "border-gray-900 text-gray-900 bg-white"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                      data-testid="tab-manual"
                    >
                      <FileText className="h-4 w-4 inline-block mr-1.5" aria-hidden="true" />
                      {t("invoices.itemsTabs.manual")}
                      {manualItems.length > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-900 text-white">
                          {manualItems.length}
                        </span>
                      )}
                    </button>
                  </div>

                      {/* Tab Panels */}
                      <AnimatePresence mode="wait">
                        {itemsTab === "packages" && (
                          <motion.div
                            key="packages-panel"
                            role="tabpanel"
                            id="panel-packages"
                            aria-labelledby="tab-packages"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="p-4"
                          >
                            <PackageSelectionGrid
                              packages={effectivePackagesWithCost}
                              selectedPackageIds={selectedPackageIds}
                              customerSlCode={selectedCustomer?.slCode}
                              onAddPackage={handleAddPackage}
                              onRemovePackage={handleRemovePackage}
                              onPackageUpdate={() => refetchPackages()}
                              isLoading={loadingPackages || isGlobalSearching}
                              onSearchChange={setPkgSearch}
                              foreignPackageIds={foreignPkgIds}
                            />
                          </motion.div>
                        )}

                        {itemsTab === "manual" && (
                          <motion.div
                            key="manual-panel"
                            role="tabpanel"
                            id="panel-manual"
                            aria-labelledby="tab-manual"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="p-4"
                          >
                            <ManualInvoiceItems
                              items={manualItems}
                              onItemsChange={setManualItems}
                              disabled={isCreating}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Notes */}
              <AnimatePresence mode="wait">
                {selectedCustomer && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <Card className="p-5 border-gray-200 shadow-sm" data-testid="notes-card">
                  <Label htmlFor="invoice-notes" className="text-sm font-semibold text-gray-900 mb-2 block">
                    {t("invoices.notes")}
                  </Label>
                  <Textarea
                    id="invoice-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("invoices.notes")}
                    className="min-h-20 border-gray-300"
                    disabled={isCreating}
                    data-testid="invoice-notes-input"
                  />
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Invoice Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="xl:col-span-7 flex flex-col h-full"
            >
              <div className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <NovaInvoicePreview invoice={draftInvoice} inline />
              </div>

              {/* Action Buttons */}
              <AnimatePresence mode="wait">
                {selectedCustomer && (selectedPackageIds.length > 0 || manualItems.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.3 }}
                    className="mt-6"
                  >
                    <div className="flex gap-3">
                      <Button
                        onClick={handleCreateInvoice}
                        disabled={isCreating}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white shadow-sm h-12 text-base font-medium"
                        data-testid="create-invoice-btn"
                      >
                        {isCreating ? (
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        ) : null}
                        {t("invoices.createInvoice")}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>

        {/* SL Code Assignment Modal */}
        <AssignSlCodeModal
          open={showSlCodeModal}
          onClose={() => setShowSlCodeModal(false)}
          onAssign={handleAssignSlCode}
          customerName={selectedCustomer?.fullName || ""}
          loading={assigningSlCode}
        />
      </div>
    </DashboardLayout>
  );
});

export default CreateInvoice;
