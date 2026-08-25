import { useState, useCallback, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useSettings } from "@/lib/context/SettingsContext";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings2, DollarSign, FileText, Phone, UserCog, Package, Brain, Trash2, Loader2, AlertTriangle, Shield } from "lucide-react";
import { cleanRoutingPrefixLearning } from "@/lib/services/match-learning";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingManagementNew } from "@/components/settings/PricingManagementNew";
import ConsolidationRulesTab from "@/pages/settings/ConsolidationRulesTab";
import { RolesManager } from "@/components/settings/RolesManager";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";

export default function SettingsNew() {
  const { t } = useLocale(['settings', 'common']);
  const { settings, updateSettings, invoiceSettings, updateInvoiceSettings } =
    useSettings();
  const { toast } = useToast();
  const { canUpdate, canManage } = usePermissions();
  const queryClient = useQueryClient();

  const [appName, setAppName] = useState(settings.appName);
  const [baseCost, setBaseCost] = useState(settings.baseCost.toString());
  const [costPerKg, setCostPerKg] = useState(settings.costPerKg.toString());
  const [distanceFee, setDistanceFee] = useState(
    settings.distanceFee.toString(),
  );
  const [maxWeight, setMaxWeight] = useState(
    settings.maxConsolidationWeight.toString(),
  );

  const [companyName, setCompanyName] = useState(invoiceSettings.companyName);
  const [companyAddress, setCompanyAddress] = useState(
    invoiceSettings.companyAddress,
  );
  const [companyEmail, setCompanyEmail] = useState(
    invoiceSettings.companyEmail,
  );
  const [companyPhone, setCompanyPhone] = useState(
    invoiceSettings.companyPhone,
  );
  const [invoiceSenderEmail, setInvoiceSenderEmail] = useState(
    invoiceSettings.invoiceSenderEmail,
  );
  const [twilioAccountSid, setTwilioAccountSid] = useState(
    invoiceSettings.twilioAccountSid,
  );
  const [twilioAuthToken, setTwilioAuthToken] = useState(
    invoiceSettings.twilioAuthToken,
  );
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState(
    invoiceSettings.twilioPhoneNumber,
  );
  const [invoiceCurrency, setInvoiceCurrency] = useState(
    invoiceSettings.invoiceCurrency,
  );
  const [invoiceTerms, setInvoiceTerms] = useState(
    invoiceSettings.invoiceTerms || "",
  );

  const handleSave = async () => {
    try {
      if (!appName.trim()) {
        toast({
          title: t("common.error"),
          description: t("appNameRequired"),
          variant: "destructive",
        });
        return;
      }

      const base = parseFloat(baseCost);
      const perKg = parseFloat(costPerKg);
      const distance = parseFloat(distanceFee);
      const max = parseFloat(maxWeight);

      if (isNaN(base) || isNaN(perKg) || isNaN(distance) || isNaN(max)) {
        toast({
          title: t("common.error"),
          description: t("invalidNumbers"),
          variant: "destructive",
        });
        return;
      }

      if (base < 0 || perKg < 0 || distance < 0 || max < 0) {
        toast({
          title: t("common.error"),
          description: t("negativeValues"),
          variant: "destructive",
        });
        return;
      }

      await updateSettings({
        appName: appName.trim(),
        baseCost: base,
        costPerKg: perKg,
        distanceFee: distance,
        maxConsolidationWeight: max,
      });

      toast({
        title: t("common.success"),
        description: t("settingsSaved"),
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: t("common.error"),
        description: t("saveFailed"),
        variant: "destructive",
      });
    }
  };

  const calculateExample = () => {
    const weight = 5;
    const cost =
      parseFloat(baseCost) +
      weight * parseFloat(costPerKg) +
      parseFloat(distanceFee);
    return cost.toFixed(2);
  };

  const handleSaveInvoiceSettings = async () => {
    try {
      if (!companyName.trim()) {
        toast({
          title: t("common.error"),
          description: t("companyNameRequired"),
          variant: "destructive",
        });
        return;
      }

      if (!invoiceSenderEmail.trim() || !invoiceSenderEmail.includes("@")) {
        toast({
          title: t("common.error"),
          description: t("invalidEmail"),
          variant: "destructive",
        });
        return;
      }

      await updateInvoiceSettings({
        companyName,
        companyAddress,
        companyEmail,
        companyPhone,
        invoiceSenderEmail,
        twilioAccountSid,
        twilioAuthToken,
        twilioPhoneNumber,
        invoiceCurrency,
        invoiceTerms,
      });

      toast({
        title: t("common.success"),
        description: t("invoiceSaved"),
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("invoiceSaveFailed"),
        variant: "destructive",
      });
    }
  };
  const [selectedCountry, setSelectedCountry] = useState<string>("CR");
  const [employerSsRate, setEmployerSsRate] = useState("0.2683");
  const [employeeSsRate, setEmployeeSsRate] = useState("0.1083");
  const [overtimeRate, setOvertimeRate] = useState("1.5");
  const [standardWeeklyHours, setStandardWeeklyHours] = useState("48");

  const { data: payrollSettings, isLoading: loadingPayroll } = useQuery({
    queryKey: ["payrollSettings", selectedCountry],
    queryFn: async () => {
      return await firestoreApi.payrollSettings.getByCountry(selectedCountry);
    },
  });

  useEffect(() => {
    if (payrollSettings) {
      const ps = payrollSettings as any;
      setEmployerSsRate(ps.employerSocialSecurityRate?.toString() ?? "0.2683");
      setEmployeeSsRate(ps.employeeSocialSecurityRate?.toString() ?? "0.1083");
      setOvertimeRate(ps.overtimeRate?.toString() ?? "1.5");
      setStandardWeeklyHours(ps.standardWeeklyHours?.toString() ?? "48");
    }
  }, [payrollSettings]);

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: any) => {
      return await firestoreApi.payrollSettings.update(selectedCountry, {
        employerSocialSecurityRate: data.employerSsRate,
        employeeSocialSecurityRate: data.employeeSsRate,
        overtimeRate: data.overtimeRate,
        standardWeeklyHours: data.standardWeeklyHours,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollSettings", selectedCountry] });
      toast({
        title: t("common.success"),
        description: t("payrollSaved"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("payrollSaveFailed"),
        variant: "destructive",
      });
    },
  });

  const handleSavePayrollSettings = () => {
    const data = {
      employerSsRate: parseFloat(employerSsRate),
      employeeSsRate: parseFloat(employeeSsRate),
      overtimeRate: parseFloat(overtimeRate),
      standardWeeklyHours: parseInt(standardWeeklyHours),
    };
    updatePayrollMutation.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>

        {/* Tabbed Interface */}
        <Tabs defaultValue="pricing" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">{t("pricingTab")}</span>
            </TabsTrigger>
            <TabsTrigger value="invoice" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{t("invoiceTab")}</span>
            </TabsTrigger>
            <TabsTrigger value="consolidation" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">{t("consolidationTab")}</span>
            </TabsTrigger>
            <TabsTrigger value="payroll" className="flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">{t("payrollTab")}</span>
            </TabsTrigger>
            {canManage('settings') && (
              <TabsTrigger value="roles" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Roles y Permisos</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="nova" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Nova</span>
            </TabsTrigger>
          </TabsList>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-6">
            <PricingManagementNew />
          </TabsContent>

          {/* Consolidation Rules Tab */}
          <TabsContent value="consolidation" className="space-y-6">
            <ConsolidationRulesTab />
          </TabsContent>

          {/* Invoice Settings Tab */}
          <TabsContent value="invoice" className="space-y-6">
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("invoiceTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("invoiceDescription")}
                </p>
              </div>

              <div className="space-y-4">
                <div className="border-b pb-4">
                  <h3 className="font-semibold text-sm mb-3">
                    {t("companyInfoTitle")}
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName" className="text-sm font-semibold">
                        {t("companyNameLabel")}
                      </Label>
                      <Input
                        id="companyName"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="text-sm"
                        placeholder={t("companyNamePlaceholder")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="companyAddress" className="text-sm font-semibold">
                        {t("companyAddressLabel")}
                      </Label>
                      <Input
                        id="companyAddress"
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        className="text-sm"
                        placeholder={t("companyAddressPlaceholder")}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="companyEmail" className="text-sm font-semibold">
                          {t("companyEmailLabel")}
                        </Label>
                        <Input
                          id="companyEmail"
                          type="email"
                          value={companyEmail}
                          onChange={(e) => setCompanyEmail(e.target.value)}
                          className="text-sm"
                          placeholder={t("companyEmailPlaceholder")}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="companyPhone" className="text-sm font-semibold">
                          {t("companyPhoneLabel")}
                        </Label>
                        <Input
                          id="companyPhone"
                          value={companyPhone}
                          onChange={(e) => setCompanyPhone(e.target.value)}
                          className="text-sm"
                          placeholder={t("companyPhonePlaceholder")}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b pb-4">
                  <h3 className="font-semibold text-sm mb-3">
                    {t("emailConfigTitle")}
                  </h3>

                  <div className="space-y-2">
                    <Label htmlFor="invoiceSenderEmail" className="text-sm font-semibold">
                      {t("senderEmailLabel")}
                    </Label>
                    <Input
                      id="invoiceSenderEmail"
                      type="email"
                      value={invoiceSenderEmail}
                      onChange={(e) => setInvoiceSenderEmail(e.target.value)}
                      className="text-sm"
                      placeholder={t("senderEmailPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("senderEmailHint")}
                    </p>
                  </div>
                </div>

                <div className="border-b pb-4">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {t("smsConfigTitle")}
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="twilioAccountSid" className="text-sm font-semibold">
                        {t("accountSidLabel")}
                      </Label>
                      <Input
                        id="twilioAccountSid"
                        value={twilioAccountSid}
                        onChange={(e) => setTwilioAccountSid(e.target.value)}
                        className="text-sm"
                        placeholder={t("accountSidPlaceholder")}
                        type="password"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="twilioAuthToken" className="text-sm font-semibold">
                        {t("authTokenLabel")}
                      </Label>
                      <Input
                        id="twilioAuthToken"
                        value={twilioAuthToken}
                        onChange={(e) => setTwilioAuthToken(e.target.value)}
                        className="text-sm"
                        placeholder={t("authTokenPlaceholder")}
                        type="password"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="twilioPhoneNumber" className="text-sm font-semibold">
                        {t("twilioPhoneLabel")}
                      </Label>
                      <Input
                        id="twilioPhoneNumber"
                        value={twilioPhoneNumber}
                        onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                        className="text-sm"
                        placeholder={t("twilioPhonePlaceholder")}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                      {t("securityWarning")}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm mb-3">
                    {t("invoiceConfigTitle")}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoiceCurrency" className="text-sm font-semibold">
                        {t("currencyLabel")}
                      </Label>
                      <Input
                        id="invoiceCurrency"
                        value={invoiceCurrency}
                        onChange={(e) => setInvoiceCurrency(e.target.value)}
                        className="text-sm"
                        placeholder={t("currencyPlaceholder")}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 mt-4">
                    <Label htmlFor="invoiceTerms" className="text-sm font-semibold">
                      {t("termsLabel")}
                    </Label>
                    <textarea
                      id="invoiceTerms"
                      value={invoiceTerms}
                      onChange={(e) => setInvoiceTerms(e.target.value)}
                      className="text-sm border rounded-md p-2 w-full min-h-20"
                      placeholder={t("termsPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("termsHint")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t pt-4">
                <Button
                  variant="outline"
                  disabled={!canUpdate('settings')}
                  onClick={() => {
                    setCompanyName(invoiceSettings.companyName);
                    setCompanyAddress(invoiceSettings.companyAddress);
                    setCompanyEmail(invoiceSettings.companyEmail);
                    setCompanyPhone(invoiceSettings.companyPhone);
                    setInvoiceSenderEmail(invoiceSettings.invoiceSenderEmail);
                    setTwilioAccountSid(invoiceSettings.twilioAccountSid);
                    setTwilioAuthToken(invoiceSettings.twilioAuthToken);
                    setTwilioPhoneNumber(invoiceSettings.twilioPhoneNumber);
                    setInvoiceCurrency(invoiceSettings.invoiceCurrency);
                    setInvoiceTerms(invoiceSettings.invoiceTerms || "");
                  }}
                >
                  {t("reset")}
                </Button>
                <PermissionTooltip allowed={canUpdate('settings')} message="No tienes permiso para actualizar configuraciones">
                  <Button
                    onClick={handleSaveInvoiceSettings}
                    disabled={!canUpdate('settings')}
                    className="bg-black dark:bg-yellow-500 text-white dark:text-black hover:bg-black/90 dark:hover:bg-yellow-400"
                  >
                    {t("saveInvoiceSettings")}
                  </Button>
                </PermissionTooltip>
              </div>
            </Card>
          </TabsContent>

          {/* Payroll Settings Tab */}
          <TabsContent value="payroll" className="space-y-6">
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <UserCog className="h-5 w-5" />
                  {t("payrollTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("payrollDescription")}
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payroll-country" className="text-sm font-semibold">
                    {t("countryLabel")}
                  </Label>
                  <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger id="payroll-country" data-testid="payroll-country-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CR">{t("countryCR")}</SelectItem>
                      <SelectItem value="US">{t("countryUS")}</SelectItem>
                      <SelectItem value="MX">{t("countryMX")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("countryHint")}
                  </p>
                </div>

                {!loadingPayroll && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="employer-ss-rate" className="text-sm font-semibold">
                        {t("employerSsRateLabel")}
                      </Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          id="employer-ss-rate"
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          value={employerSsRate}
                          onChange={(e) => setEmployerSsRate(e.target.value)}
                          className="text-sm"
                          placeholder={t("employerSsRatePlaceholder")}
                          data-testid="employer-ss-rate-input"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[80px]">
                          ({(parseFloat(employerSsRate) * 100).toFixed(2)}%)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedCountry === "CR" && t("employerSsRateHintCR")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="employee-ss-rate" className="text-sm font-semibold">
                        {t("employeeSsRateLabel")}
                      </Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          id="employee-ss-rate"
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          value={employeeSsRate}
                          onChange={(e) => setEmployeeSsRate(e.target.value)}
                          className="text-sm"
                          placeholder={t("employeeSsRatePlaceholder")}
                          data-testid="employee-ss-rate-input"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[80px]">
                          ({(parseFloat(employeeSsRate) * 100).toFixed(2)}%)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedCountry === "CR" && t("employeeSsRateHintCR")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="overtime-rate" className="text-sm font-semibold">
                        {t("overtimeRateLabel")}
                      </Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          id="overtime-rate"
                          type="number"
                          step="0.1"
                          min="1"
                          max="3"
                          value={overtimeRate}
                          onChange={(e) => setOvertimeRate(e.target.value)}
                          className="text-sm"
                          placeholder={t("overtimeRatePlaceholder")}
                          data-testid="overtime-rate-input"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[80px]">
                          ({(parseFloat(overtimeRate) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedCountry === "CR" && t("overtimeRateHintCR")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="standard-hours" className="text-sm font-semibold">
                        {t("standardHoursLabel")}
                      </Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          id="standard-hours"
                          type="number"
                          min="1"
                          max="80"
                          value={standardWeeklyHours}
                          onChange={(e) => setStandardWeeklyHours(e.target.value)}
                          className="text-sm"
                          placeholder={t("standardHoursPlaceholder")}
                          data-testid="standard-hours-input"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[80px]">
                          {t("standardHoursSuffix")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedCountry === "CR" && t("standardHoursHintCR")}
                      </p>
                    </div>
                  </>
                )}

                {loadingPayroll && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end border-t pt-4">
                <Button
                  variant="outline"
                  disabled={!canUpdate('payroll')}
                  onClick={() => {
                    setEmployerSsRate("0.2683");
                    setEmployeeSsRate("0.1083");
                    setOvertimeRate("1.5");
                    setStandardWeeklyHours("48");
                  }}
                >
                  {t("reset")}
                </Button>
                <PermissionTooltip allowed={canUpdate('payroll')} message="No tienes permiso para actualizar nómina">
                  <Button
                    onClick={handleSavePayrollSettings}
                    disabled={updatePayrollMutation.isPending || !canUpdate('payroll')}
                    className="bg-black dark:bg-yellow-500 text-white dark:text-black hover:bg-black/90 dark:hover:bg-yellow-400"
                    data-testid="save-payroll-settings-btn"
                  >
                    {updatePayrollMutation.isPending ? t("saving") : t("savePayrollSettings")}
                  </Button>
                </PermissionTooltip>
              </div>
            </Card>
          </TabsContent>
          {/* Roles Management Tab */}
          {canManage('settings') && (
            <TabsContent value="roles" className="space-y-6">
              <RolesManager />
            </TabsContent>
          )}

          {/* Nova Maintenance Tab */}
          <TabsContent value="nova" className="space-y-6">
            <NovaMaintenanceTab />
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ─── Nova Maintenance Tab ─────────────────────────────────────────────────────────

function NovaMaintenanceTab() {
  const { toast } = useToast();
  const { canManage } = usePermissions();
  const [cleanState, setCleanState] = useState<'idle' | 'running' | 'done'>('idle');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClean = useCallback(async () => {
    setConfirmOpen(false);
    setCleanState('running');
    try {
      const count = await cleanRoutingPrefixLearning();
      toast({
        title: count > 0 ? `${count} entradas limpiadas` : 'Sin entradas contaminadas',
        description: count > 0
          ? `Se invalidaron ${count} registros con prefijo de ciudad (Alajuela, Heredia, BB…). El learning ahora está limpio.`
          : 'No se encontraron entradas con prefijo de ciudad en match_feedback.',
      });
      setCleanState('done');
    } catch {
      toast({ title: 'Error al limpiar learning', variant: 'destructive' });
      setCleanState('idle');
    }
  }, [toast]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Mantenimiento de learning</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Acciones de mantenimiento sobre los datos de aprendizaje de Nova.
          Estas operaciones son reversibles — los registros se marcan como inválidos, no se eliminan.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0 rounded-lg bg-amber-50 p-2">
            <Trash2 className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Limpiar learning con prefijos de ciudad</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Invalida las entradas de <code className="font-mono bg-muted px-1 rounded">match_feedback</code> cuyo nombre de manifiesto empieza con un prefijo
              de ciudad o zona (Alajuela, Heredia, Cartago, BB, etc.).  Esas entradas se generan cuando el sistema de aprendizaje
              confunde un cliente sin cuenta (prefijado por zona) con un cliente registrado de nombre similar,
              causando que trackings aparezcan en el grupo equivocado al imprimir manifiestos de ruta.
            </p>
            <div className="flex items-center gap-2 mt-3">
              {!confirmOpen && cleanState !== 'done' && (
                <PermissionTooltip allowed={canManage('manifests')} message="No tienes permiso">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cleanState === 'running' || !canManage('manifests')}
                    onClick={() => setConfirmOpen(true)}
                    className="text-amber-700 border-amber-200 hover:bg-amber-50"
                  >
                    {cleanState === 'running'
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Limpiando…</>
                      : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Limpiar ahora</>}
                  </Button>
                </PermissionTooltip>
              )}
              {cleanState === 'done' && (
                <span className="text-xs text-green-600 font-medium">✅ Completado — el learning está limpio</span>
              )}
              {confirmOpen && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                  <span className="text-xs text-amber-800">¿Confirmar limpieza?</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={handleClean}>
                    Sí, limpiar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setConfirmOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
