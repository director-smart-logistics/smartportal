import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/useLocale";
import {
  DollarSign,
  Save,
  RefreshCw,
  Package,
  Plane,
  Ship,
  Truck,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { apiClient } from "@/lib/api/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PricingConfig {
  branch: string;
  deliveryType: string;
  currency: string;
  dimensional_factor: string;
  regular: {
    "0-499g": string;
    "500g-1kg": string;
    per_kg: string;
  };
  restricted: {
    base: string;
    tracking_fee: string;
    per_kg: string;
  };
  electronics: {
    quote_required: string;
  };
}

const branches = [
  { value: "usa", label: "United States", flag: "🇺🇸", currency: "USD" },
  { value: "mexico", label: "Mexico", flag: "🇲🇽", currency: "MXN" },
  { value: "china", label: "China", flag: "🇨🇳", currency: "CNY" },
  { value: "colombia", label: "Colombia", flag: "🇨🇴", currency: "COP" },
  { value: "other", label: "Other", flag: "🌍", currency: "USD" },
];

const deliveryTypes = [
  { value: "air", label: "Air", icon: Plane, factor: "5000" },
  { value: "sea", label: "Sea", icon: Ship, factor: "6000" },
  { value: "local", label: "Local", icon: Truck, factor: "4000" },
];

export function PricingManagement() {
  const { t } = useLocale(["settings", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedBranch, setSelectedBranch] = useState("mexico");
  const [selectedDeliveryType, setSelectedDeliveryType] = useState("air");
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Fetch pricing configuration
  const { data: pricingData, isLoading } = useQuery({
    queryKey: [`/api/pricing/config/${selectedBranch}/${selectedDeliveryType}`],
    queryFn: async () => {
      const result = await apiClient.get(
        `/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
      );
      if (result.error) throw new Error(result.error);
      return result.data as PricingConfig;
    },
  });

  // Update local state when data changes
  useEffect(() => {
    if (pricingData) {
      setConfig(pricingData as PricingConfig);
    }
  }, [pricingData]);

  // Save pricing configuration
  const saveMutation = useMutation({
    mutationFn: async (data: PricingConfig) => {
      const result = await apiClient.post(
        `/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
        data,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
        ],
      });
      toast({
        title: t("success"),
        description: t("pricingConfigurationSaved"),
      });
    },
    onError: () => {
      toast({
        title: t("error"),
        description: t("failedToSavePricingConfiguration"),
        variant: "destructive",
      });
    },
  });

  // Delete pricing configuration
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await apiClient.delete(
        `/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
      );
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
        ],
      });
      setShowDeleteDialog(false);
      toast({
        title: t("deleted"),
        description: t("pricingConfigurationDeleted"),
      });
    },
    onError: () => {
      toast({
        title: t("error"),
        description: t("failedToDeletePricingConfiguration"),
        variant: "destructive",
      });
    },
  });

  // Reset to default values
  const resetToDefaultsMutation = useMutation({
    mutationFn: async () => {
      const defaultConfig = {
        branch: selectedBranch,
        deliveryType: selectedDeliveryType,
        currency: currentBranch?.currency || "USD",
        dimensional_factor: currentDeliveryType?.factor || "5000",
        regular: {
          "0-499g": "8",
          "500g-1kg": "12",
          per_kg: "12",
        },
        restricted: {
          base: "12",
          tracking_fee: "3",
          per_kg: "12",
        },
        electronics: {
          quote_required: "true",
        },
      };

      const res = await apiClient.post(
        `/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
        defaultConfig,
      );
      if (res.error) throw new Error("Failed to reset pricing config");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/pricing/config/${selectedBranch}/${selectedDeliveryType}`,
        ],
      });
      setShowResetDialog(false);
      toast({
        title: t("resetComplete"),
        description: t("pricingConfigurationReset"),
      });
    },
    onError: () => {
      toast({
        title: t("error"),
        description: t("failedToResetPricingConfiguration"),
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (config) {
      saveMutation.mutate(config);
    }
  };

  const handleReset = () => {
    if (pricingData) {
      setConfig(pricingData as PricingConfig);
      toast({
        title: t("reset"),
        description: t("changesDiscarded"),
      });
    }
  };

  const updateConfigValue = (path: string[], value: string) => {
    if (!config) return;

    const newConfig = { ...config };
    let current: any = newConfig;

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
    setConfig(newConfig);
  };

  const currentBranch = branches.find((b) => b.value === selectedBranch);
  const currentDeliveryType = deliveryTypes.find(
    (d) => d.value === selectedDeliveryType,
  );
  const DeliveryIcon = currentDeliveryType?.icon || Plane;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="h-6 w-6" />
          {t("pricingManagement")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("pricingManagementDescription")}
        </p>
      </div>

      {/* Branch and Delivery Type Selector */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              {t("branchOriginCountry")}
            </Label>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.value} value={branch.value}>
                    <span className="flex items-center gap-2">
                      <span>{branch.flag}</span>
                      <span>{branch.label}</span>
                      <span className="text-xs text-muted-foreground">
                        ({branch.currency})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("branchHint")}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t("deliveryType")}</Label>
            <Select
              value={selectedDeliveryType}
              onValueChange={setSelectedDeliveryType}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deliveryTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{type.label}</span>
                        <span className="text-xs text-muted-foreground">
                          (Factor: {type.factor})
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("deliveryTypeHint")}
            </p>
          </div>
        </div>
      </Card>

      {/* Current Configuration Badge */}
      <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-2xl">{currentBranch?.flag}</span>
          <DeliveryIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              {currentBranch?.label} - {currentDeliveryType?.label}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {t("currency")}: {config?.currency || currentBranch?.currency} |
              {t("dimensionalFactor")}:{" "}
              {config?.dimensional_factor || currentDeliveryType?.factor}
            </p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("loadingPricing")}
            </p>
          </div>
        </Card>
      )}

      {/* Pricing Configuration Table */}
      {!isLoading && config && (
        <Card className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              {t("configurationSettings")}
            </h3>

            {/* Currency and Dimensional Factor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t("currency")}</Label>
                <Input
                  value={config.currency || ""}
                  onChange={(e) =>
                    updateConfigValue(["currency"], e.target.value)
                  }
                  placeholder="USD"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {t("currencyHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  {t("dimensionalFactor")}
                </Label>
                <Input
                  type="number"
                  value={config.dimensional_factor || ""}
                  onChange={(e) =>
                    updateConfigValue(["dimensional_factor"], e.target.value)
                  }
                  placeholder="5000"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  {t("dimensionalFactorHint")}
                </p>
              </div>
            </div>

            {/* Pricing Tables */}
            <div className="space-y-6">
              {/* Regular Items */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold">{t("regularItems")}</h4>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">
                          {t("weightTier")}
                        </TableHead>
                        <TableHead className="font-semibold">
                          {t("price")} ({config.currency})
                        </TableHead>
                        <TableHead className="font-semibold w-[200px]">
                          {t("description")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">0-499g</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={config.regular["0-499g"] || ""}
                            onChange={(e) =>
                              updateConfigValue(
                                ["regular", "0-499g"],
                                e.target.value,
                              )
                            }
                            className="w-32 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("basePriceUnder500g")}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">500g-1kg</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={config.regular["500g-1kg"] || ""}
                            onChange={(e) =>
                              updateConfigValue(
                                ["regular", "500g-1kg"],
                                e.target.value,
                              )
                            }
                            className="w-32 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("price500gTo1kg")}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("perAdditionalKg")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={config.regular.per_kg || ""}
                            onChange={(e) =>
                              updateConfigValue(
                                ["regular", "per_kg"],
                                e.target.value,
                              )
                            }
                            className="w-32 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("pricePerKgAbove1kg")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Restricted Items */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-orange-600" />
                  <h4 className="font-semibold">{t("restrictedItems")}</h4>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">
                          {t("feeType")}
                        </TableHead>
                        <TableHead className="font-semibold">
                          {t("price")} ({config.currency})
                        </TableHead>
                        <TableHead className="font-semibold w-[200px]">
                          {t("description")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("basePrice")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={config.restricted.base || ""}
                            onChange={(e) =>
                              updateConfigValue(
                                ["restricted", "base"],
                                e.target.value,
                              )
                            }
                            className="w-32 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("baseHandlingFee")}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("trackingFee")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={config.restricted.tracking_fee || ""}
                            onChange={(e) =>
                              updateConfigValue(
                                ["restricted", "tracking_fee"],
                                e.target.value,
                              )
                            }
                            className="w-32 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("additionalTrackingFee")}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("perAdditionalKg")}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={config.restricted.per_kg || ""}
                            onChange={(e) =>
                              updateConfigValue(
                                ["restricted", "per_kg"],
                                e.target.value,
                              )
                            }
                            className="w-32 font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("pricePerKgAbove1kg")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Electronics */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-purple-600" />
                  <h4 className="font-semibold">{t("electronics")}</h4>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">
                          {t("setting")}
                        </TableHead>
                        <TableHead className="font-semibold">
                          {t("value")}
                        </TableHead>
                        <TableHead className="font-semibold w-[200px]">
                          {t("description")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("quoteRequired")}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={config.electronics.quote_required || "true"}
                            onValueChange={(value) =>
                              updateConfigValue(
                                ["electronics", "quote_required"],
                                value,
                              )
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">{t("yes")}</SelectItem>
                              <SelectItem value="false">{t("no")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t("electronicsQuoteRequired")}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-between border-t pt-6">
            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("deleteConfiguration")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowResetDialog(true)}
                disabled={resetToDefaultsMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("resetToDefaults")}
              </Button>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={saveMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("discardChanges")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="bg-black dark:bg-yellow-500 text-white dark:text-black hover:bg-black/90 dark:hover:bg-yellow-400"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? t("saving") : t("saveConfiguration")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deletePricingConfiguration")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deletePricingConfigurationDescription", {
                branch: currentBranch?.label,
                deliveryType: currentDeliveryType?.label,
              })}
              {t("thisActionCannotBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset to Defaults Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resetToDefaultValues")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("resetToDefaultValuesDescription", {
                branch: currentBranch?.label,
                deliveryType: currentDeliveryType?.label,
                factor: currentDeliveryType?.factor,
                currency: currentBranch?.currency,
              })}
              <ul className="mt-2 space-y-1 text-sm">
                <li>• {t("regularDefault")}</li>
                <li>• {t("restrictedDefault")}</li>
                <li>• {t("electronicsDefault")}</li>
                <li>
                  •{" "}
                  {t("dimensionalFactorDefault", {
                    factor: currentDeliveryType?.factor,
                  })}
                </li>
                <li>
                  •{" "}
                  {t("currencyDefault", { currency: currentBranch?.currency })}
                </li>
              </ul>
              {t("anyCustomChangesOverwritten")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetToDefaultsMutation.mutate()}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              {resetToDefaultsMutation.isPending
                ? t("resetting")
                : t("resetToDefaults")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pricing Information */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-md bg-muted">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold mb-1">
                {t("dimensionalWeightCalculation")}
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                {t("dimensionalWeightFormula")}:{" "}
                <span className="font-mono">
                  {t("dimensionalWeightFormulaMath")}
                </span>{" "}
                • {t("dimensionalWeightExplanation")}
              </p>
              <div className="flex gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <Plane className="h-3 w-3" />
                  {t("air")}: 5000
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <Ship className="h-3 w-3" />
                  {t("sea")}: 6000
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted">
                  <Truck className="h-3 w-3" />
                  {t("local")}: 4000
                </span>
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">
              <strong>{t("example")}:</strong> {t("dimensionalWeightExample")}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
