import { useState, useMemo, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useSettings } from "@/lib/context/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  Plus,
  Minus,
  Search,
  Box,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const PKG_STATUS_CONFIG: Record<
  string,
  { label: string; cls: string; warn: boolean }
> = {
  customs: {
    label: "Aduana",
    cls: "border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300",
    warn: false,
  },
  aduana: {
    label: "Aduana",
    cls: "border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300",
    warn: false,
  },
  pre_alerted: {
    label: "Pre-alertado",
    cls: "border-gray-300 text-gray-600",
    warn: false,
  },
  received: {
    label: "Recibido",
    cls: "border-green-300 text-green-700 dark:text-green-400",
    warn: false,
  },
  in_transit: {
    label: "En Tránsito",
    cls: "border-blue-300 text-blue-700 dark:text-blue-400",
    warn: false,
  },
  pending: {
    label: "Pendiente",
    cls: "border-gray-300 text-gray-600",
    warn: false,
  },
  processed: {
    label: "Facturado",
    cls: "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300",
    warn: true,
  },
  on_route: {
    label: "En Ruta",
    cls: "border-violet-300 text-violet-700 bg-violet-50 dark:bg-violet-950/30",
    warn: true,
  },
  delivered: {
    label: "Entregado",
    cls: "border-emerald-300 text-emerald-700 dark:text-emerald-400",
    warn: true,
  },
  retained: {
    label: "Retenido",
    cls: "border-red-300 text-red-700 bg-red-50 dark:bg-red-950/30",
    warn: true,
  },
  consolidated: {
    label: "Consolidado",
    cls: "border-purple-300 text-purple-700 dark:text-purple-400",
    warn: true,
  },
  returned: {
    label: "Devuelto",
    cls: "border-orange-300 text-orange-700 dark:text-orange-400",
    warn: true,
  },
};

const MANIFEST_LABELS: Record<string, { label: string; flag: string }> = {
  usa_air: { label: "USA Aéreo", flag: "🇺🇸" },
  usa_sea: { label: "USA Marítimo", flag: "🇺🇸" },
  mexico_air: { label: "México Aéreo", flag: "🇲🇽" },
  mexico_sea: { label: "México Marítimo", flag: "🇲🇽" },
  china_air: { label: "China Aéreo", flag: "🇨🇳" },
  china_sea: { label: "China Marítimo", flag: "🇨🇳" },
  colombia_air: { label: "Colombia Aéreo", flag: "🇨🇴" },
  colombia_sea: { label: "Colombia Marítimo", flag: "🇨🇴" },
};

interface PackageData {
  id: string;
  trackingNumber: string;
  customerName: string;
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

interface PackageSelectionGridProps {
  packages: PackageData[];
  selectedPackageIds: string[];
  customerSlCode?: string;
  onAddPackage: (packageId: string) => void;
  onRemovePackage: (packageId: string) => void;
  onPackageUpdate?: () => void;
  isLoading?: boolean;
  /** Called whenever the search input value changes — used by the parent to run a global tracking search */
  onSearchChange?: (term: string) => void;
  /** Package IDs found via global search (belong to a different customer) — shown with an 'Otro cliente' badge */
  foreignPackageIds?: Set<string>;
}

export function PackageSelectionGrid({
  packages,
  selectedPackageIds,
  customerSlCode,
  onAddPackage,
  onRemovePackage,
  onPackageUpdate,
  isLoading = false,
  onSearchChange,
  foreignPackageIds,
}: PackageSelectionGridProps) {
  const { t } = useLocale(["invoices", "common"]);
  const { toast } = useToast();
  const { invoiceSettings } = useSettings();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [packageToAssociate, setPackageToAssociate] = useState<{
    id: string;
    trackingNumber: string;
  } | null>(null);
  const itemsPerPage = 10;

  // Copy tracking number to clipboard
  const handleCopyTrackingNumber = async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      toast({
        title: t("common.success"),
        description: `${t("packages.trackingNumber")} ${trackingNumber} copied`,
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  // Show confirmation modal for SL code association
  const handleAssociateSlCodeClick = (
    packageId: string,
    trackingNumber: string,
  ) => {
    if (!customerSlCode) {
      toast({
        title: t("common.error"),
        description: "Customer SL account code not available",
        variant: "destructive",
      });
      return;
    }
    setPackageToAssociate({ id: packageId, trackingNumber });
    setShowConfirmModal(true);
  };

  // Confirm and associate SL account code to package
  const confirmAssociateSlCode = async () => {
    if (!packageToAssociate || !customerSlCode) return;

    try {
      await apiClient.packages.update(packageToAssociate.id, {
        slCode: customerSlCode,
      });

      toast({
        title: t("common.success"),
        description: t("invoices.slCodeAssigned", {
          code: customerSlCode,
          tracking: packageToAssociate.trackingNumber,
        }),
      });

      // Close modal and reset
      setShowConfirmModal(false);
      setPackageToAssociate(null);

      // Refresh packages list
      if (onPackageUpdate) {
        onPackageUpdate();
      }
    } catch (error) {
      console.error("Failed to associate SL code:", error);
      toast({
        title: t("common.error"),
        description: "Failed to associate SL account code",
        variant: "destructive",
      });
      setShowConfirmModal(false);
      setPackageToAssociate(null);
    }
  };

  // Calculate package cost based on settings
  const calculatePackageCost = (pkg: PackageData): number => {
    if (pkg.calculatedCost) return pkg.calculatedCost;

    // Use invoice settings for cost calculation if available
    const settings = invoiceSettings as any;
    const baseRate = settings?.baseRate || 10;
    const weightRate = settings?.weightRate || 2;

    return baseRate + Number(pkg.weight) * weightRate;
  };

  // Filter packages based on search
  const filteredPackages = useMemo(() => {
    if (!searchTerm.trim()) return packages;

    const term = searchTerm.toLowerCase();
    return packages.filter(
      (pkg) =>
        pkg.trackingNumber.toLowerCase().includes(term) ||
        pkg.destination.toLowerCase().includes(term) ||
        (pkg.manifestNumber || "").toLowerCase().includes(term),
    );
  }, [packages, searchTerm]);

  // Separate available and selected packages
  const allAvailablePackages = filteredPackages.filter(
    (pkg) => !selectedPackageIds.includes(pkg.id),
  );

  const selectedPackages = packages.filter((pkg) =>
    selectedPackageIds.includes(pkg.id),
  );

  // Pagination for available packages
  const effectivePageSize = showAll
    ? allAvailablePackages.length || 1
    : itemsPerPage;
  const totalPages = Math.ceil(allAvailablePackages.length / effectivePageSize);
  const startIndex = showAll ? 0 : (currentPage - 1) * itemsPerPage;
  const endIndex = showAll
    ? allAvailablePackages.length
    : startIndex + itemsPerPage;
  const availablePackages = allAvailablePackages.slice(startIndex, endIndex);

  // Reset to page 1 when search changes or showAll toggles
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showAll]);

  return (
    <div className="space-y-3" data-testid="package-selection-grid">
      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
          aria-hidden="true"
        />
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onSearchChange?.(e.target.value);
          }}
          placeholder={t("common.search")}
          className="pl-9 h-9 border-gray-300"
          data-testid="package-search-input"
        />
      </div>

      {/* Selected Packages */}
      {selectedPackages.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-700 mb-2">
            {t("invoices.selectedPackages")} ({selectedPackages.length})
          </h3>
          <div
            className="max-h-[200px] overflow-y-auto pr-1 space-y-1.5"
            data-testid="scrollable-selected-packages"
          >
            {selectedPackages.map((pkg) => (
              <Card
                key={pkg.id}
                className="p-3 border-gray-300 hover:border-gray-400 transition-colors"
                data-testid={`selected-package-${pkg.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-green-100 rounded-lg shrink-0">
                      <Package
                        className="h-4 w-4 text-green-700"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-gray-900 truncate">
                          {pkg.trackingNumber}
                        </p>
                        <button
                          onClick={() =>
                            handleCopyTrackingNumber(pkg.trackingNumber)
                          }
                          className="shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
                          aria-label={`Copy ${pkg.trackingNumber}`}
                          data-testid={`copy-tracking-selected-${pkg.id}`}
                        >
                          <Copy className="h-3.5 w-3.5 text-gray-500 hover:text-gray-700" />
                        </button>
                      </div>
                      {(pkg.description || pkg.manifestNumber) && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {pkg.description}
                          {pkg.description && pkg.manifestNumber && (
                            <span className="text-gray-400"> • </span>
                          )}
                          {pkg.manifestNumber && (
                            <span className="text-gray-400">
                              {pkg.manifestNumber}
                            </span>
                          )}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs border-gray-300"
                        >
                          {pkg.weight} kg
                        </Badge>
                        {(() => {
                          const sc = PKG_STATUS_CONFIG[pkg.status] ?? {
                            label: pkg.status,
                            cls: "border-gray-300 text-gray-600",
                            warn: false,
                          };
                          return (
                            <Badge
                              variant="outline"
                              className={cn("text-xs", sc.cls)}
                            >
                              {sc.label}
                            </Badge>
                          );
                        })()}
                        {pkg.manifestType &&
                        MANIFEST_LABELS[pkg.manifestType] ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-blue-200 text-blue-700"
                          >
                            {MANIFEST_LABELS[pkg.manifestType].flag}{" "}
                            {MANIFEST_LABELS[pkg.manifestType].label}
                          </Badge>
                        ) : null}
                        {pkg.permisos && (
                          <Badge
                            variant="outline"
                            className="text-xs border-orange-300 text-orange-700"
                          >
                            ⚠ Permiso
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      ${calculatePackageCost(pkg).toFixed(2)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRemovePackage(pkg.id)}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100"
                      aria-label={`${t("invoices.removeFromInvoice")} ${pkg.trackingNumber}`}
                      data-testid={`remove-package-btn-${pkg.id}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Available Packages */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-2">
          {t("invoices.availablePackages")}{" "}
          {!isLoading && `(${allAvailablePackages.length})`}
          {isLoading && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-gray-400"
              aria-hidden="true"
            />
          )}
        </h3>
        {/* Warning: packages not in aduana/customs status */}
        {!isLoading &&
          allAvailablePackages.some(
            (pkg) => PKG_STATUS_CONFIG[pkg.status]?.warn,
          ) && (
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/60 py-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Atención:</strong> Uno o más paquetes tienen un estado
                diferente a <em>Aduana</em> — es posible que ya hayan sido
                facturados o procesados. Verifique antes de crear la factura.
              </AlertDescription>
            </Alert>
          )}

        {isLoading ? (
          <div
            className="space-y-1.5"
            aria-busy="true"
            aria-label="Cargando paquetes"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[74px] rounded-lg bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : allAvailablePackages.length === 0 ? (
          <Card
            className="p-6 text-center border-gray-300"
            data-testid="no-packages-available"
          >
            <Box
              className="h-10 w-10 mx-auto mb-2 text-gray-400"
              aria-hidden="true"
            />
            <p className="text-xs text-gray-600">
              {searchTerm
                ? t("common.noResults")
                : selectedPackages.length > 0
                  ? t("invoices.noPackages")
                  : t("invoices.noPackagesSelected")}
            </p>
          </Card>
        ) : (
          <div
            className="max-h-[400px] overflow-y-auto pr-1 space-y-1.5"
            data-testid="scrollable-packages-list"
          >
            {availablePackages.map((pkg) => (
              <Card
                key={pkg.id}
                className="p-3 border-gray-300 hover:border-gray-400 transition-colors"
                data-testid={`available-package-${pkg.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gray-100 rounded-lg shrink-0">
                      <Package
                        className="h-4 w-4 text-gray-700"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-gray-900 truncate">
                          {pkg.trackingNumber}
                        </p>
                        <button
                          onClick={() =>
                            handleCopyTrackingNumber(pkg.trackingNumber)
                          }
                          className="shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
                          aria-label={`Copy ${pkg.trackingNumber}`}
                          data-testid={`copy-tracking-available-${pkg.id}`}
                        >
                          <Copy className="h-3.5 w-3.5 text-gray-500 hover:text-gray-700" />
                        </button>
                        {foreignPackageIds?.has(pkg.id) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-600"
                          >
                            Otro cliente
                          </Badge>
                        )}
                        {!pkg.slCode && customerSlCode && (
                          <button
                            onClick={() =>
                              handleAssociateSlCodeClick(
                                pkg.id,
                                pkg.trackingNumber,
                              )
                            }
                            className="shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
                            aria-label={`Associate SL code to ${pkg.trackingNumber}`}
                            title={`Associate SL: ${customerSlCode}`}
                            data-testid={`associate-sl-${pkg.id}`}
                          >
                            <Link className="h-3.5 w-3.5 text-gray-600 hover:text-gray-900" />
                          </button>
                        )}
                      </div>
                      {(pkg.description || pkg.manifestNumber) && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {pkg.description}
                          {pkg.description && pkg.manifestNumber && (
                            <span className="text-gray-400"> • </span>
                          )}
                          {pkg.manifestNumber && (
                            <span className="text-gray-400">
                              {pkg.manifestNumber}
                            </span>
                          )}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge
                          variant="outline"
                          className="text-xs border-gray-300"
                        >
                          {pkg.weight} kg
                        </Badge>
                        {(() => {
                          const sc = PKG_STATUS_CONFIG[pkg.status] ?? {
                            label: pkg.status,
                            cls: "border-gray-300 text-gray-600",
                            warn: false,
                          };
                          return (
                            <Badge
                              variant="outline"
                              className={cn("text-xs", sc.cls)}
                            >
                              {sc.label}
                            </Badge>
                          );
                        })()}
                        {pkg.manifestType &&
                        MANIFEST_LABELS[pkg.manifestType] ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-blue-200 text-blue-700"
                          >
                            {MANIFEST_LABELS[pkg.manifestType].flag}{" "}
                            {MANIFEST_LABELS[pkg.manifestType].label}
                          </Badge>
                        ) : null}
                        {pkg.permisos && (
                          <Badge
                            variant="outline"
                            className="text-xs border-orange-300 text-orange-700"
                          >
                            ⚠ Permiso
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      ${calculatePackageCost(pkg).toFixed(2)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAddPackage(pkg.id)}
                      className="bg-gray-900 hover:bg-gray-800 text-white border-gray-900"
                      aria-label={`${t("invoices.addToInvoice")} ${pkg.trackingNumber}`}
                      data-testid={`add-package-btn-${pkg.id}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {allAvailablePackages.length > itemsPerPage && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">
                {showAll
                  ? `${allAvailablePackages.length} paquetes`
                  : `${startIndex + 1}-${Math.min(endIndex, allAvailablePackages.length)} de ${allAvailablePackages.length}`}
              </p>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors"
                data-testid="show-all-btn"
              >
                {showAll ? "Ver paginado" : "Ver todos"}
              </button>
            </div>
            {!showAll && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                  className="h-7 w-7 p-0 border-gray-300"
                  data-testid="prev-page-btn"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-gray-700 min-w-[40px] text-center">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="h-7 w-7 p-0 border-gray-300"
                  data-testid="next-page-btn"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("invoices.associateSlCodeTitle")}</DialogTitle>
            <DialogDescription>
              {t("invoices.associateSlCodeDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {t("packages.trackingNumber")}
                  </p>
                  <p className="text-sm font-mono font-semibold text-gray-900 mt-1">
                    {packageToAssociate?.trackingNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-700">
                    {t("invoices.slCodeLabel")}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {customerSlCode}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              {t("invoices.associateSlCodeWarning")}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmModal(false);
                setPackageToAssociate(null);
              }}
              className="border-gray-300"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmAssociateSlCode}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
