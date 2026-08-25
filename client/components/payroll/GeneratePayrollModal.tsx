import { useState, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SalaryFrequency } from "@shared/payroll";

interface GeneratePayrollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (data: GeneratePayrollData) => void;
  isGenerating?: boolean;
}

export interface GeneratePayrollData {
  frequency: SalaryFrequency;
  periodStart: string;
  periodEnd: string;
  departmentIds?: string[];
  employeeIds?: string[];
  countryCode?: string;
}

export function GeneratePayrollModal({
  open,
  onOpenChange,
  onGenerate,
  isGenerating = false,
}: GeneratePayrollModalProps) {
  const { t } = useLocale(["payrollReport", "common"]);
  const API_URL = import.meta.env.VITE_API_URL || "/api";

  const [frequency, setFrequency] = useState<SalaryFrequency>("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [countryCode] = useState("CR");

  // Fetch departments for filtering
  const { data: departmentsData } = useQuery({
    queryKey: ["/api/payroll/departments"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/payroll/departments`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
    enabled: open,
  });

  const departments = departmentsData?.data || [];

  // Auto-calculate period end based on frequency when period start changes
  useEffect(() => {
    if (!periodStart) return;

    const startDate = new Date(periodStart);
    let endDate = new Date(startDate);

    switch (frequency) {
      case "weekly":
        endDate.setDate(startDate.getDate() + 6);
        break;
      case "biweekly":
        endDate.setDate(startDate.getDate() + 13);
        break;
      case "monthly":
        endDate.setMonth(startDate.getMonth() + 1);
        endDate.setDate(0); // Last day of month
        break;
      case "contract":
      case "hourly":
        // Default to end of month
        endDate.setMonth(startDate.getMonth() + 1);
        endDate.setDate(0);
        break;
    }

    setPeriodEnd(endDate.toISOString().split("T")[0]);
  }, [periodStart, frequency]);

  const handleGenerate = () => {
    if (!periodStart || !periodEnd) return;

    const data: GeneratePayrollData = {
      frequency,
      periodStart,
      periodEnd,
      countryCode,
    };

    if (selectedDepartment && selectedDepartment !== "all") {
      data.departmentIds = [selectedDepartment];
    }

    onGenerate(data);
  };

  const resetForm = () => {
    setFrequency("monthly");
    setPeriodStart("");
    setPeriodEnd("");
    setSelectedDepartment("all");
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const isValid = periodStart && periodEnd;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        data-testid="generate-payroll-modal"
      >
        <DialogHeader>
          <DialogTitle>{t("generateTitle")}</DialogTitle>
          <DialogDescription>{t("generateDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Frequency Selection */}
          <div className="space-y-2">
            <Label htmlFor="frequency">
              {t("generateSelectFrequency")}
              <span className="text-red-500 ml-1" aria-label="required">
                *
              </span>
            </Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as SalaryFrequency)}
            >
              <SelectTrigger id="frequency" data-testid="frequency-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{t("weekly")}</SelectItem>
                <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                <SelectItem value="monthly">{t("monthly")}</SelectItem>
                <SelectItem value="contract">{t("contract")}</SelectItem>
                <SelectItem value="hourly">{t("hourly")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("frequency")}</p>
          </div>

          {/* Period Start */}
          <div className="space-y-2">
            <Label htmlFor="period-start">
              {t("generateSelectPeriodStart")}
              <span className="text-red-500 ml-1" aria-label="required">
                *
              </span>
            </Label>
            <div className="relative">
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => {
                  const val = e.target.value;
                  setPeriodStart(val);
                  setPeriodEnd(val);
                }}
                className="pr-10"
                data-testid="period-start-input"
                required
                aria-required="true"
              />
              <Calendar
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Period End */}
          <div className="space-y-2">
            <Label htmlFor="period-end">
              {t("generateSelectPeriodEnd")}
              <span className="text-red-500 ml-1" aria-label="required">
                *
              </span>
            </Label>
            <div className="relative">
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                min={periodStart}
                className="pr-10"
                data-testid="period-end-input"
                required
                aria-required="true"
              />
              <Calendar
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-blue-800 dark:text-blue-200 rounded-lg p-2.5 text-xs leading-tight">
            <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Selección automática de fecha final</span>
              La fecha final del período se igualó automáticamente a la fecha inicial. Por favor verifica y ajusta la fecha final según el período a procesar.
            </div>
          </div>

          {/* Department Filter (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="department">
              {t("generateFilterByDepartment")}
            </Label>
            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger id="department" data-testid="department-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDepartments")}</SelectItem>
                {departments.map((dept: any) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Info Message */}
          {periodStart && periodEnd && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>{t("period")}:</strong>{" "}
                {new Date(periodStart).toLocaleDateString()} -{" "}
                {new Date(periodEnd).toLocaleDateString()}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {t(frequency)} {t("frequency").toLowerCase()}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isGenerating}
            data-testid="cancel-generate-btn"
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!isValid || isGenerating}
            data-testid="confirm-generate-btn"
          >
            {isGenerating && (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {isGenerating ? t("generating") : t("generate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
