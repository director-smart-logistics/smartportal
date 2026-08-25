import React, { useState, useMemo } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/context/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { logAction } from "@/lib/services/audit-service";
import { useCreateInvoice, useCreateInvoiceCustomer } from "@/lib/hooks/queries/useInvoices";
import { useCustomerSearch } from "@/lib/hooks/queries/useCustomers";
import { InvoiceCustomerForm } from "@/components/invoice/InvoiceCustomerForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  X,
  Search,
  Plus,
  FileText,
  Loader2,
} from "lucide-react";
import type { Customer, Package } from "../../types";

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: Package[];
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  packages,
}: CreateInvoiceModalProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();

  const createInvoiceMutation = useCreateInvoice();
  const createCustomerMutation = useCreateInvoiceCustomer();

  const [customerTab, setCustomerTab] = useState<"search" | "create">("search");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [discountPercentage, setDiscountPercentage] = useState(0);

  // Customer search hook inside the modal
  const { results: customerSearchResults } = useCustomerSearch(customerSearchTerm, 280, 60);

  const customers: Customer[] = useMemo(() => {
    return (customerSearchResults || []).map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      slCode: c.slCode,
    }));
  }, [customerSearchResults]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        (c.fullName ?? "").toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
        (c.slCode ?? "").toLowerCase().includes(customerSearchTerm.toLowerCase()),
    );
  }, [customers, customerSearchTerm]);

  const handleCreateInvoice = async () => {
    if (!selectedCustomer || selectedPackages.length === 0) {
      toast({
        title: t("common.error"),
        description: t("selectCustomerPackages"),
        variant: "destructive",
      });
      return;
    }

    try {
      const items = selectedPackages.map((packageId) => {
        const pkg = packages.find((p) => p.id === packageId);
        const unitPrice = pkg?.calculatedCost ? Number(pkg.calculatedCost) : 0;
        return {
          packageId,
          quantity: 1,
          unitPrice,
        };
      });

      const createManifests = [...new Set(
        selectedPackages
          .map(pid => (packages.find(p => p.id === pid) as any)?.manifestNumber)
          .filter((m): m is string => !!m)
      )];

      const res = await createInvoiceMutation.mutateAsync({
        customerId: selectedCustomer,
        items,
        discountPercentage: discountPercentage,
        ...(createManifests.length > 0 && {
          manifestNumber: createManifests[0],
          manifestNumbers: createManifests,
        }),
      } as any) as any;
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
          customerId: selectedCustomer,
          packagesCount: selectedPackages.length,
          discountPercentage,
          note: 'Factura creada desde modal rápido de creación.'
        }
      });

      setSelectedCustomer("");
      setSelectedPackages([]);
      setDiscountPercentage(0);
      setCustomerSearchTerm("");
      setCustomerTab("search");
      onClose();
      toast({
        title: t("common.success"),
        description: t("invoiceCreated"),
      });
    } catch (error) {
      console.error("Failed to create invoice:", error);
      toast({
        title: t("common.error"),
        description: t("failedCreate"),
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setSelectedCustomer("");
    setSelectedPackages([]);
    setDiscountPercentage(0);
    setCustomerSearchTerm("");
    setCustomerTab("search");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden"
      role="dialog"
      aria-labelledby="create-invoice-title"
      aria-modal="true"
      data-testid="create-invoice-modal"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 shrink-0">
        <h2 id="create-invoice-title" className="text-base font-bold text-foreground">
          {t("createInvoice")}
        </h2>
        <button
          onClick={handleCancel}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar"
          data-testid="close-create-modal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 max-w-2xl w-full mx-auto">
          {/* Customer Selection Tabs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("selectCustomer")}</p>
            <div className="flex border-b border-border mb-3" role="tablist" aria-label="Customer selection options">
              {(["search", "create"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  id={`tab-${tab}`}
                  aria-selected={customerTab === tab}
                  aria-controls={`panel-${tab}`}
                  tabIndex={customerTab === tab ? 0 : -1}
                  onClick={() => setCustomerTab(tab)}
                  className={cn(
                    "flex-1 py-2 px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    customerTab === tab
                      ? "border-b-2 border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid={`tab-${tab}`}
                >
                  {tab === "search"
                    ? <><Search className="h-3.5 w-3.5 inline mr-1.5" />{t("customerTabs.searchExisting")}</>
                    : <><Plus className="h-3.5 w-3.5 inline mr-1.5" />{t("customerTabs.createNew")}</>}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="panel-search" aria-labelledby="tab-search" hidden={customerTab !== "search"} tabIndex={0}>
              <Input
                id="customer-search"
                placeholder={t("searchByName")}
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                className="mb-2"
                aria-label="Search customers"
                data-testid="customer-search-input"
              />
              <div
                className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-lg p-1.5 bg-muted/20"
                role="listbox"
                aria-label="Available customers"
              >
                {filteredCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-1">{t("noCustomers")}</p>
                ) : filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      selectedCustomer === customer.id
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-accent text-foreground"
                    )}
                    role="option"
                    aria-selected={selectedCustomer === customer.id}
                    data-testid={`customer-option-${customer.id}`}
                  >
                    <span className="font-medium">{customer.fullName}</span>
                    <span className="text-xs text-muted-foreground ml-2">{customer.slCode} · {customer.email}</span>
                  </button>
                ))}
              </div>
            </div>

            <div role="tabpanel" id="panel-create" aria-labelledby="tab-create" hidden={customerTab !== "create"} tabIndex={0}>
              <InvoiceCustomerForm
                isDark={isDark}
                isCreating={createCustomerMutation.isPending}
                onCustomerCreated={(customer) => {
                  setSelectedCustomer(customer.id);
                  setCustomerTab("search");
                  toast({ title: t("common.success"), description: t("createCustomer.success") });
                }}
                onSubmit={async (formData) => {
                  try {
                    const result = await createCustomerMutation.mutateAsync(formData);
                    if (result.success && result.customer) {
                      setSelectedCustomer(result.customer.id);
                      setCustomerTab("search");
                      toast({ title: t("common.success"), description: t("createCustomer.success") });
                    }
                  } catch (error: any) {
                    toast({ title: t("common.error"), description: error?.response?.data?.message || error?.message || t("createCustomer.error"), variant: "destructive" });
                  }
                }}
              />
            </div>
          </div>

          {/* Package Selection */}
          {selectedCustomer && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t("selectPackages")} ({selectedPackages.length})
              </p>
              <div
                className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-lg p-1.5 bg-muted/20"
                role="group"
                aria-label="Available packages"
              >
                {packages.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2 py-1">{t("noPackages")}</p>
                ) : packages.map((pkg) => (
                  <label
                    key={pkg.id}
                    className="flex items-start gap-3 px-3 py-2 cursor-pointer rounded-md hover:bg-accent transition-colors"
                    data-testid={`package-option-${pkg.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPackages.includes(pkg.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedPackages([...selectedPackages, pkg.id]);
                        else setSelectedPackages(selectedPackages.filter((id) => id !== pkg.id));
                      }}
                      className="mt-1 accent-primary"
                      aria-label={`Select package ${pkg.trackingNumber}`}
                      data-testid={`package-checkbox-${pkg.id}`}
                    />
                    <div className="flex-1 text-sm">
                      <span className="font-medium text-foreground">{pkg.trackingNumber}</span>
                      <span className="text-xs text-muted-foreground ml-2">{pkg.origin} → {pkg.destination} ({pkg.weight} kg)</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Discount */}
          {selectedCustomer && (
            <div>
              <label htmlFor="discount-percentage" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                {t("discountPercentage")} (%)
              </label>
              <Input
                id="discount-percentage"
                type="number" min="0" max="100" step="0.01"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                aria-label="Discount percentage"
                data-testid="discount-percentage-input"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Aplicado sobre (subtotal + IVA)</p>
            </div>
          )}
      </div>
      <div className="flex gap-2 justify-end px-5 py-4 border-t border-border shrink-0 max-w-2xl w-full mx-auto">
        <Button
          variant="outline"
          onClick={handleCancel}
          data-testid="cancel-create-btn"
        >
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleCreateInvoice}
          disabled={!selectedCustomer || selectedPackages.length === 0}
          data-testid="confirm-create-btn"
        >
          <FileText className="h-4 w-4 mr-1.5" />
          {t("createInvoice")}
        </Button>
      </div>
    </div>
  );
}
