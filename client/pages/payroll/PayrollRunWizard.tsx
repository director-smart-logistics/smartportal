import { useState, useMemo, memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  Users,
  DollarSign,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Play,
  Download,
  AlertCircle,
  Loader2,
  Building2,
  User,
  Sparkles,
  Mail,
  Settings,
  Eye,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { firestoreApi, createDocument } from "@/lib/firebase/firestore-client";
import { useEmailService } from "@/lib/hooks/useEmailService";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";

/* ── types ─────────────────────────────────────────────────────────────────── */

interface SwagRecord {
  id: string;
  item: string;
  cost: number;
  date: string;
  status: "pending" | "deducted" | "paid" | "delivered";
  payrollId?: string;
  items?: { name: string; cost: number }[];
}

interface DeductionRecord {
  id: string;
  amount: number;
  description: string;
  date: string;
  status: "pending" | "deducted";
  payrollId?: string;
}

interface UnpaidLeaveRecord {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "approved" | "rejected" | "pending";
}

interface Employee {
  id: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  baseSalary: number;
  salaryFrequency: string;
  departmentName?: string;
  position?: string;
  countryCode: string;
  status: string;
  spouseDependent?: boolean;
  childrenCount?: number;
  privateInsuranceCost?: number;
  deductions?: DeductionRecord[];
  swag?: SwagRecord[];
  unpaidLeaves?: UnpaidLeaveRecord[];
  bankAccount?: string | null;
}

interface PayrollLine {
  employeeId: string;
  employeeName: string;
  department: string;
  grossSalary: number;
  ccss: number;
  renta: number;
  otherDeductions: number;
  netSalary: number;
  included: boolean;
  applyDeductions: boolean;

  appliedDeductionsMap: Record<string, number>;
  appliedSwagMap: Record<string, number>;
  applyPrivateInsurance: boolean;

  // detailed columns
  idNumber: string;
  bankAccount: string;
  baseSalary: number;
  unpaidLeaveDays: number;
  unpaidLeaveDiscount: number;
  privateInsuranceCost: number;
  descargosDeducted: number;
  swagDeducted: number;
  spouseDependent: boolean;
  childrenCount: number;
}

type Step = "period" | "employees" | "review" | "done";

/* ── helpers ────────────────────────────────────────────────────────────────── */

const toCycleSalary = (monthlySalary: number, frequency: string): number => {
  if (frequency === "weekly") return monthlySalary / 4.33;
  if (frequency === "biweekly") return monthlySalary / 2;
  if (frequency === "daily") return monthlySalary / 30;
  return monthlySalary;
};

const toMonthly = (salary: number, freq: string) => {
  if (freq === "hourly")    return salary * 240;
  if (freq === "weekly")    return salary * 4.33;
  if (freq === "biweekly")  return salary * 2;
  if (freq === "daily")     return salary * 30;
  return salary;
};

const formatCRC = (n: number) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    minimumFractionDigits: 0,
  }).format(n);

const calcDynamicCCSS = (gross: number, rate: number) => gross * rate;

const calcDynamicRenta = (gross: number, brackets: { upTo: number; rate: number }[], spouse: boolean, children: number) => {
  if (!brackets || brackets.length === 0) return 0;
  let tax = 0;
  let prevLimit = 0;
  const sortedBrackets = [...brackets].sort((a, b) => a.upTo - b.upTo);
  for (let i = 0; i < sortedBrackets.length; i++) {
    const bracket = sortedBrackets[i];
    const rate = bracket.rate;
    const currentLimit = bracket.upTo;
    if (gross > currentLimit) {
      tax += (currentLimit - prevLimit) * rate;
      prevLimit = currentLimit;
    } else {
      tax += (gross - prevLimit) * rate;
      break;
    }
  }

  // Cost Rican credits
  const spouseCredit = spouse ? 2590 : 0;
  const childCredit = children * 1710;

  return Math.max(0, tax - (spouseCredit + childCredit));
};

// Overlap check helper
const getOverlapDays = (leave: UnpaidLeaveRecord, periodStart: Date, periodEnd: Date) => {
  const leaveStart = new Date(leave.startDate + "T00:00:00");
  const leaveEnd = new Date(leave.endDate + "T00:00:00");
  const pStart = new Date(format(periodStart, "yyyy-MM-dd") + "T00:00:00");
  const pEnd = new Date(format(periodEnd, "yyyy-MM-dd") + "T00:00:00");
  
  const overlapStart = new Date(Math.max(leaveStart.getTime(), pStart.getTime()));
  const overlapEnd = new Date(Math.min(leaveEnd.getTime(), pEnd.getTime()));
  
  if (overlapStart > overlapEnd) return 0;
  const calendarDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (typeof leave.days === "number" && leave.days > 0) {
    return Math.min(leave.days, calendarDays);
  }
  return calendarDays;
};

const getCurrentWeekNumber = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  while (start.getDay() !== 1) { // Monday
    start.setDate(start.getDate() + 1);
  }
  const diff = now.getTime() - start.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const w = Math.ceil(diff / oneWeek);
  return Math.min(52, Math.max(1, w)).toString();
};

const getWeeksOfYear = (year: number) => {
  const weeks = [];
  // Find the first Monday of the year
  let date = new Date(year, 0, 1);
  while (date.getDay() !== 1) { // 1 is Monday
    date.setDate(date.getDate() + 1);
  }
  
  // Generate weeks
  for (let w = 1; w <= 52; w++) {
    const start = new Date(date);
    
    // The actual calculation boundary (Monday to Sunday)
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    
    // The display boundary (Monday to Friday, omitting Sat and Sun)
    const displayEnd = new Date(date);
    displayEnd.setDate(displayEnd.getDate() + 4);
    
    weeks.push({
      number: w.toString(),
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
      label: `Semana ${w} (${format(start, "d 'de' MMM", { locale: es })} - ${format(displayEnd, "d 'de' MMM", { locale: es })})`,
    });
    
    // Move to next Monday
    date.setDate(date.getDate() + 7);
  }
  return weeks;
};

const STEPS: Step[] = ["period", "employees", "review", "done"];

const stepMeta: Record<Step, { icon: React.ReactNode; label: string }> = {
  period:    { icon: <Calendar className="h-4 w-4" />,      label: "Período" },
  employees: { icon: <Users className="h-4 w-4" />,         label: "Empleados" },
  review:    { icon: <DollarSign className="h-4 w-4" />,    label: "Nómina" },
  done:      { icon: <CheckCircle2 className="h-4 w-4" />,  label: "Completado" },
};

/* ── component ──────────────────────────────────────────────────────────────── */

const PayrollRunWizard = memo(function PayrollRunWizard() {
  const { t } = useLocale(["payrollRun", "common"]);
  const { toast } = useToast();
  const { sendEmail } = useEmailService();

  const [step, setStep] = useState<Step>("period");
  const [period, setPeriod] = useState({
    frequency: "monthly",
    month: new Date().getMonth().toString(),
    year: new Date().getFullYear().toString(),
    quincena: "1",
    weekNumber: getCurrentWeekNumber(),
    startDate: "",
    endDate: "",
    label: "",
  });
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [activeDeductionsEmployeeId, setActiveDeductionsEmployeeId] = useState<string | null>(null);
  const [sendingColillas, setSendingColillas] = useState(false);
  // Auto-send payslip checkbox option when the administrator approves the payroll run.
  // Helps streamline workflow by avoiding the manual "Send Payslips" click on step 4.
  const [autoSendColillas, setAutoSendColillas] = useState(true);
  const [periodStartOpen, setPeriodStartOpen] = useState(false);
  const [periodEndOpen, setPeriodEndOpen] = useState(false);

  const [hasInitializedFromPast, setHasInitializedFromPast] = useState(false);
  const [previewLine, setPreviewLine] = useState<PayrollLine | null>(null);

  /* fetch past payroll runs */
  const { data: pastRunsResp, isLoading: isLoadingPastRuns } = useQuery({
    queryKey: ["payroll-runs-all"],
    queryFn: () =>
      firestoreApi.payrollRuns.list({
        orderByField: "runDate",
        orderDirection: "desc",
      }),
  });

  const pastRuns = useMemo(() => {
    return ((pastRunsResp as any)?.data as any[]) || [];
  }, [pastRunsResp]);

  const weeksList = useMemo(() => {
    const y = parseInt(period.year) || new Date().getFullYear();
    return getWeeksOfYear(y);
  }, [period.year]);

  // Auto-fill from past run once
  useEffect(() => {
    if (pastRuns.length > 0 && !hasInitializedFromPast) {
      const latest = pastRuns[0];
      setPeriod((p) => ({
        ...p,
        frequency: latest.frequency || "monthly",
      }));
      setHasInitializedFromPast(true);
    }
  }, [pastRuns, hasInitializedFromPast]);

  const handleUseRunReference = (run: any) => {
    setPeriod((p) => ({
      ...p,
      frequency: run.frequency || "monthly",
    }));
    toast({
      title: "Configuración copiada",
      description: `Se aplicó la frecuencia de pago de la planilla: ${run.period}`,
    });
  };

  /* fetch active employees */
  const { data: empResp, isLoading } = useQuery({
    queryKey: ["employees-active"],
    queryFn: () =>
      firestoreApi.employees.list({
        filters: [{ field: "status", op: "==", value: "active" }],
      }),
  });
  const employees: Employee[] =
    ((empResp as any)?.data as Employee[]) || [];

  /* fetch all settings to compute social security and taxes dynamically */
  const { data: settingsListResp } = useQuery({
    queryKey: ["payroll-settings-all"],
    queryFn: () => firestoreApi.payrollSettings.list(),
  });

  const settingsMap = useMemo(() => {
    const list = ((settingsListResp as any)?.data as any[]) || [];
    const map: Record<string, any> = {};
    list.forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, [settingsListResp]);

  const getCountrySettings = (countryCode: string) => {
    return settingsMap[countryCode] || {
      countryCode,
      employerSocialSecurityRate: 0.2683,
      employeeSocialSecurityRate: 0.1083,
      overtimeRate: 1.5,
      standardWeeklyHours: 48,
      incomeTaxBrackets: [
        { upTo: 922000, rate: 0 },
        { upTo: 1352000, rate: 0.1 },
        { upTo: 2373000, rate: 0.15 },
        { upTo: 4745000, rate: 0.2 },
        { upTo: 999999999, rate: 0.25 },
      ],
    };
  };

  /* period label & boundaries */
  const periodLabel = useMemo(() => {
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    if (period.frequency === "monthly") {
      return `${months[parseInt(period.month)]} ${period.year}`;
    }
    if (period.frequency === "biweekly") {
      return `${months[parseInt(period.month)]} ${period.year} - Q${period.quincena}`;
    }
    if (period.frequency === "weekly") {
      const y = parseInt(period.year) || new Date().getFullYear();
      const weeks = getWeeksOfYear(y);
      const w = weeks.find((wk) => wk.number === period.weekNumber);
      return w ? w.label : `Semana ${period.weekNumber} (${period.year})`;
    }
    return `${period.startDate} – ${period.endDate}`;
  }, [period]);

  const periodBoundaries = useMemo(() => {
    let pStart = new Date();
    let pEnd = new Date();
    const y = parseInt(period.year) || new Date().getFullYear();
    const m = parseInt(period.month) || 0;

    if (period.frequency === "monthly") {
      pStart = new Date(y, m, 1, 0, 0, 0);
      pEnd = new Date(y, m + 1, 0, 23, 59, 59);
    } else if (period.frequency === "biweekly") {
      if (period.quincena === "1") {
        pStart = new Date(y, m, 1, 0, 0, 0);
        pEnd = new Date(y, m, 15, 23, 59, 59);
      } else {
        pStart = new Date(y, m, 16, 0, 0, 0);
        pEnd = new Date(y, m + 1, 0, 23, 59, 59);
      }
    } else if (period.frequency === "weekly") {
      const weeks = getWeeksOfYear(y);
      const w = weeks.find((wk) => wk.number === period.weekNumber);
      if (w) {
        pStart = new Date(w.startDate + "T00:00:00");
        pEnd = new Date(w.endDate + "T23:59:59");
      }
    } else {
      pStart = new Date(period.startDate + "T00:00:00");
      pEnd = new Date(period.endDate + "T23:59:59");
    }
    return { pStart, pEnd };
  }, [period]);

  const buildLines = () => {
    const { pStart, pEnd } = periodBoundaries;

    const filteredEmployees = employees.filter(
      (emp) => (emp.salaryFrequency || "monthly") === period.frequency
    );

    const built: PayrollLine[] = filteredEmployees.map((emp) => {
      const baseSalaryMonthly = emp.salaryFrequency === "hourly" ? emp.baseSalary * 240 : emp.baseSalary;
      
      // 1. Calculate Unpaid Leaves overlap days
      let unpaidDays = 0;
      (emp.unpaidLeaves || []).forEach(l => {
        if (l.status === "approved") {
          unpaidDays += getOverlapDays(l, pStart, pEnd);
        }
      });

      // Base salary scaled to pay period frequency (e.g. monthly / 4.33 for weekly)
      const baseSalaryCycle = Math.round(toCycleSalary(baseSalaryMonthly, period.frequency) * 100) / 100;

      // Daily salary based on employee payment frequency (Frecuencia de Pago):
      // - Weekly: standard 6-day working week in CR (weekly salary / 6)
      // - Hourly: 8 hours per day (hourly rate * 8)
      // - Biweekly / Monthly / Others: standard 30-day commercial month (monthly salary / 30)
      const empFrequency = emp.salaryFrequency || period.frequency || "monthly";
      const dailyRate = empFrequency === "weekly"
        ? baseSalaryCycle / 6
        : empFrequency === "hourly"
        ? (emp.hourlyRate ? emp.hourlyRate * 8 : (baseSalaryMonthly / 240) * 8)
        : baseSalaryMonthly / 30;

      // Unpaid leave discount for the missed days in this cycle (full daily rate per missed day)
      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100;

      // Gross salary for this cycle (base salary minus unpaid leave discount)
      const grossCycle = Math.max(0, Math.round((baseSalaryCycle - unpaidDiscountCycle) * 100) / 100);

      // Taxes & CCSS calculated on gross monthly equivalent (for progressive tax correctness)
      const grossMonthlyEquivalent = toMonthly(grossCycle, period.frequency);
      const settings = getCountrySettings(emp.countryCode || "CR");
      const ccssMonthly = calcDynamicCCSS(grossMonthlyEquivalent, settings.employeeSocialSecurityRate);
      const rentaMonthly = calcDynamicRenta(grossMonthlyEquivalent, settings.incomeTaxBrackets, !!emp.spouseDependent, emp.childrenCount || 0);
      
      const ccssCycle = Math.round(toCycleSalary(ccssMonthly, period.frequency) * 100) / 100;
      const rentaCycle = Math.round(toCycleSalary(rentaMonthly, period.frequency) * 100) / 100;

      // 5. Group and scale private insurance
      const privInsCostMonthly = emp.privateInsuranceCost || 0;
      const privInsCostCycle = toCycleSalary(privInsCostMonthly, period.frequency);
      
      const pendingDeductions = (emp.deductions || []).filter(d => d.status === "pending");
      const pendingSwags = (emp.swag || []).filter(s => s.status === "pending");

      const totalDeductionsCostCycle = privInsCostCycle + 
        pendingDeductions.reduce((s, r) => s + r.amount, 0) + 
        pendingSwags.reduce((s, r) => s + r.cost, 0);

      // 6. Calculate net salary before these deductions in cycle
      const netBeforeOtherCycle = Math.max(0, grossCycle - ccssCycle - rentaCycle);
      
      // Initialize maps
      const appliedDeductionsMap: Record<string, number> = {};
      pendingDeductions.forEach(d => {
        appliedDeductionsMap[d.id] = d.amount;
      });

      const appliedSwagMap: Record<string, number> = {};
      pendingSwags.forEach(s => {
        appliedSwagMap[s.id] = s.cost;
      });

      let privInsDeductedCycle = privInsCostCycle;
      let descargosDeductedCycle = pendingDeductions.reduce((s, r) => s + r.amount, 0);
      let swagDeductedCycle = pendingSwags.reduce((s, r) => s + r.cost, 0);

      let remainingNetCycle = netBeforeOtherCycle;

      // Distribute deductions with capping
      if (privInsDeductedCycle > 0) {
        privInsDeductedCycle = Math.min(privInsDeductedCycle, remainingNetCycle);
        remainingNetCycle -= privInsDeductedCycle;
      }
      
      // Apply capping to descargos map
      pendingDeductions.forEach(d => {
        const allowed = Math.min(appliedDeductionsMap[d.id], remainingNetCycle);
        appliedDeductionsMap[d.id] = allowed;
        remainingNetCycle -= allowed;
      });
      descargosDeductedCycle = pendingDeductions.reduce((s, r) => s + (appliedDeductionsMap[r.id] || 0), 0);

      // Apply capping to swag map
      pendingSwags.forEach(s => {
        const allowed = Math.min(appliedSwagMap[s.id], remainingNetCycle);
        appliedSwagMap[s.id] = allowed;
        remainingNetCycle -= allowed;
      });
      swagDeductedCycle = pendingSwags.reduce((s, r) => s + (appliedSwagMap[r.id] || 0), 0);

      const netCycle = remainingNetCycle;
      const otherDeductionsCycle = privInsDeductedCycle + descargosDeductedCycle + swagDeductedCycle;

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        department: emp.departmentName || "—",
        grossSalary: grossCycle,
        ccss: ccssCycle,
        renta: rentaCycle,
        otherDeductions: otherDeductionsCycle,
        netSalary: netCycle,
        included: true,
        applyDeductions: totalDeductionsCostCycle > 0,
        
        appliedDeductionsMap,
        appliedSwagMap,
        applyPrivateInsurance: privInsCostCycle > 0,

        idNumber: emp.idNumber || "",
        bankAccount: emp.bankAccount || "",
        baseSalary: baseSalaryCycle,
        unpaidLeaveDays: unpaidDays,
        unpaidLeaveDiscount: unpaidDiscountCycle,
        privateInsuranceCost: privInsDeductedCycle,
        descargosDeducted: descargosDeductedCycle,
        swagDeducted: swagDeductedCycle,
        spouseDependent: !!emp.spouseDependent,
        childrenCount: emp.childrenCount || 0,
      };
    });
    setLines(built);
    setStep("employees");
  };

  const toggleEmployee = (id: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.employeeId === id ? { ...l, included: !l.included } : l
      )
    );
  };

  const handleItemDeductionChange = (
    empId: string,
    type: "deduction" | "swag" | "privateInsurance",
    itemId: string,
    value: number
  ) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.employeeId !== empId) return l;

        const emp = employees.find((e) => e.id === empId);
        if (!emp) return l;

        const updatedDeductionsMap = { ...l.appliedDeductionsMap };
        const updatedSwagMap = { ...l.appliedSwagMap };
        let applyPrivateInsurance = l.applyPrivateInsurance;

        if (type === "deduction") {
          const original = (emp.deductions || []).find((d) => d.id === itemId);
          const maxVal = original ? original.amount : 0;
          updatedDeductionsMap[itemId] = Math.max(0, Math.min(maxVal, value));
        } else if (type === "swag") {
          const original = (emp.swag || []).find((s) => s.id === itemId);
          const maxVal = original ? original.cost : 0;
          updatedSwagMap[itemId] = Math.max(0, Math.min(maxVal, value));
        } else if (type === "privateInsurance") {
          applyPrivateInsurance = value > 0;
        }

        // Recalculate based on these inputs
        const gross = l.grossSalary;
        const grossMonthly = toMonthly(gross, period.frequency);
        const settings = getCountrySettings(emp.countryCode || "CR");
        
        const ccssMonthly = calcDynamicCCSS(grossMonthly, settings.employeeSocialSecurityRate);
        const rentaMonthly = calcDynamicRenta(
          grossMonthly,
          settings.incomeTaxBrackets,
          !!emp.spouseDependent,
          emp.childrenCount || 0
        );

        const ccss = Math.round(toCycleSalary(ccssMonthly, period.frequency) * 100) / 100;
        const renta = Math.round(toCycleSalary(rentaMonthly, period.frequency) * 100) / 100;

        const netBeforeOther = Math.round(Math.max(0, gross - ccss - renta) * 100) / 100;

        // Sum up the requested deductions (scaled to cycle)
        const privInsCostMonthly = emp.privateInsuranceCost || 0;
        const privInsCost = applyPrivateInsurance ? toCycleSalary(privInsCostMonthly, period.frequency) : 0;

        let remainingNet = netBeforeOther;
        
        let privInsDeducted = Math.min(privInsCost, remainingNet);
        remainingNet -= privInsDeducted;

        // Apply custom values, capped at remaining net
        const finalDeductionsMap: Record<string, number> = {};
        Object.entries(updatedDeductionsMap).forEach(([id, val]) => {
          const allowed = Math.min(val, remainingNet);
          finalDeductionsMap[id] = allowed;
          remainingNet -= allowed;
        });

        const finalSwagMap: Record<string, number> = {};
        Object.entries(updatedSwagMap).forEach(([id, val]) => {
          const allowed = Math.min(val, remainingNet);
          finalSwagMap[id] = allowed;
          remainingNet -= allowed;
        });

        const descargosDeducted = Object.values(finalDeductionsMap).reduce((s, r) => s + r, 0);
        const swagDeducted = Object.values(finalSwagMap).reduce((s, r) => s + r, 0);

        const otherDeductions = privInsDeducted + descargosDeducted + swagDeducted;

        return {
          ...l,
          appliedDeductionsMap: finalDeductionsMap,
          appliedSwagMap: finalSwagMap,
          applyPrivateInsurance,
          privateInsuranceCost: privInsDeducted,
          descargosDeducted,
          swagDeducted,
          otherDeductions,
          netSalary: Math.round((netBeforeOther - otherDeductions) * 100) / 100,
        };
      })
    );
  };

  const handleManualOverride = (
    empId: string,
    field: "grossSalary" | "ccss" | "renta",
    value: number
  ) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.employeeId !== empId) return l;
        const updated = { ...l, [field]: value };
        const gross = updated.grossSalary;
        const ccss = updated.ccss;
        const renta = updated.renta;
        const otherDeductions = updated.otherDeductions;
        updated.netSalary = Math.round(Math.max(0, gross - ccss - renta - otherDeductions) * 100) / 100;
        return updated;
      })
    );
  };

  const includedLines = lines.filter((l) => l.included);

  const totals = useMemo(() => ({
    gross:       includedLines.reduce((s, l) => s + l.grossSalary, 0),
    ccss:        includedLines.reduce((s, l) => s + l.ccss, 0),
    renta:       includedLines.reduce((s, l) => s + l.renta, 0),
    deductions:  includedLines.reduce((s, l) => s + l.otherDeductions, 0),
    net:         includedLines.reduce((s, l) => s + l.netSalary, 0),
  }), [includedLines]);

  /* save run mutation */
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save payroll run
      const payrollRun = await createDocument<any>("payroll_runs", {
        period: periodLabel,
        frequency: period.frequency,
        employeeCount: includedLines.length,
        totalGross: totals.gross,
        totalCCSS: totals.ccss,
        totalRenta: totals.renta,
        totalNet: totals.net,
        status: "approved",
        lines: includedLines,
        runDate: new Date().toISOString(),
      });

      // 2. Update employee pending deductions and swag
      const promises = includedLines.map(async (line) => {
        const emp = employees.find(e => e.id === line.employeeId);
        if (!emp) return;

        let deductionsChanged = false;
        let swagChanged = false;

        const updatedDeductions: DeductionRecord[] = [];
        (emp.deductions || []).forEach((d) => {
          const appliedAmount = line.appliedDeductionsMap[d.id];
          if (d.status === "pending" && appliedAmount !== undefined && appliedAmount > 0) {
            deductionsChanged = true;
            if (appliedAmount >= d.amount) {
              updatedDeductions.push({ ...d, status: "deducted" as const, payrollId: payrollRun.id });
            } else {
              updatedDeductions.push({ ...d, amount: d.amount - appliedAmount });
              updatedDeductions.push({
                id: Math.random().toString(36).substr(2, 9),
                amount: appliedAmount,
                description: `${d.description} (Rebajo parcial)`,
                date: new Date().toISOString().split("T")[0],
                status: "deducted" as const,
                payrollId: payrollRun.id,
              });
            }
          } else {
            updatedDeductions.push(d);
          }
        });

        const updatedSwag: SwagRecord[] = [];
        (emp.swag || []).forEach((s) => {
          const appliedCost = line.appliedSwagMap[s.id];
          if (s.status === "pending" && appliedCost !== undefined && appliedCost > 0) {
            swagChanged = true;
            if (appliedCost >= s.cost) {
              updatedSwag.push({ ...s, status: "deducted" as const, payrollId: payrollRun.id });
            } else {
              updatedSwag.push({ ...s, cost: s.cost - appliedCost });
              updatedSwag.push({
                id: Math.random().toString(36).substr(2, 9),
                cost: appliedCost,
                item: `${s.item} (Rebajo parcial)`,
                date: new Date().toISOString().split("T")[0],
                status: "deducted" as const,
                payrollId: payrollRun.id,
              });
            }
          } else {
            updatedSwag.push(s);
          }
        });

        const updateData: Partial<Employee> = {};
        if (deductionsChanged) updateData.deductions = updatedDeductions;
        if (swagChanged) updateData.swag = updatedSwag;

        if (deductionsChanged || swagChanged) {
          await firestoreApi.employees.update(emp.id, updateData);
        }
      });

      await Promise.all(promises);
      return payrollRun;
    },
    // Once the payroll run is successfully saved in Firestore, check if the administrator
    // chose to auto-send pay stub emails. If so, trigger handleSendEmails inline, then
    // transition to the final step.
    onSuccess: async () => {
      if (autoSendColillas) {
        toast({
          title: "Planilla guardada",
          description: "Enviando colillas de pago por correo...",
        });
        await handleSendEmails();
      } else {
        toast({ title: "Planilla ejecutada con éxito" });
      }
      setStep("done");
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  /* BAC planillas Excel Exporter */
  const handleExportBAC = () => {
    const data = includedLines.map((l) => {
      const cleanIban = (l.bankAccount || "").replace(/[-\s]/g, "").toUpperCase();
      return {
        "Tipo Identificación": l.idNumber && l.idNumber.length > 9 ? "2" : "1", // 1=Física, 2=Jurídica
        "Identificación": l.idNumber || "",
        "Nombre Completo": l.employeeName,
        "Cuenta IBAN": cleanIban,
        "Monto": l.netSalary,
        "Moneda": "CRC",
        "Referencia": `Planilla ${periodLabel}`,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Planilla BAC");

    // Adjust columns
    worksheet["!cols"] = [
      { wch: 10 }, // Tipo
      { wch: 15 }, // Id
      { wch: 30 }, // Nombre
      { wch: 25 }, // IBAN
      { wch: 12 }, // Monto
      { wch: 8 },  // Moneda
      { wch: 20 }, // Referencia
    ];

    XLSX.writeFile(workbook, `Planilla_BAC_${periodLabel.replace(/\s+/g, "_")}.xlsx`);
    toast({ title: "Planilla BAC exportada en Excel con éxito" });
  };

  const handlePrintPreview = (line: PayrollLine) => {
    const emp = employees.find(e => e.id === line.employeeId);
    const position = emp?.position || "Colaborador";
    const settings = getCountrySettings(emp?.countryCode || "CR");
    const weeklyHours = settings.standardWeeklyHours || 48;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "El navegador bloqueó la ventana emergente.", variant: "destructive" });
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Colilla de Pago - ${line.employeeName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            padding: 30px;
            background: #ffffff;
            color: #27272a;
            line-height: 1.4;
          }
          .colilla-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            border: 1px solid #e4e4e7;
            border-top: 4px solid #9E0A21;
            border-radius: 8px;
            background-color: #ffffff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .header-table td { vertical-align: middle; }
          .logo-img { display: block; height: 38px; width: auto; }
          .header-right { text-align: right; }
          .title-text { font-size: 14px; font-weight: 800; color: #9E0A21; text-transform: uppercase; letter-spacing: 1.5px; }
          .company-text { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-top: 2px; }
          .divider { height: 1px; background-color: #e4e4e7; margin: 15px 0 20px 0; }
          .meta-container { background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
          .meta-table { width: 100%; border-collapse: collapse; }
          .meta-cell { vertical-align: top; }
          .meta-label { font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
          .meta-value { font-size: 13px; font-weight: 700; color: #18181b; }
          .meta-value-regular { font-size: 13px; font-weight: 600; color: #27272a; }
          .concepts-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          .concepts-table th { background-color: #f4f4f5; color: #52525b; padding: 8px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .concepts-table td { padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a; }
          .gross-row { background-color: #fafafa; font-weight: 700; color: #18181b; }
          .gross-row td { border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7; font-weight: 700; }
          .total-box { width: 100%; background-color: #fafafa; border: 1px solid #e4e4e7; border-left: 4px solid #059669; border-radius: 6px; margin-top: 24px; border-collapse: collapse; }
          .total-box td { padding: 14px 18px; vertical-align: middle; }
          .total-label { font-size: 10px; font-weight: 800; color: #065f46; letter-spacing: 0.5px; text-transform: uppercase; }
          .total-desc { font-size: 11px; color: #71717a; margin-top: 2px; }
          .total-amount { font-size: 22px; font-weight: 900; color: #059669; text-align: right; }
          .footer { text-align: center; margin-top: 30px; color: #a1a1aa; font-size: 11px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5; }
          @media screen and (max-width: 520px) {
            body { padding: 15px; }
            .colilla-container { padding: 20px; }
            .header-table td { display: block !important; width: 100% !important; text-align: center !important; }
            .header-right { text-align: center !important; margin-top: 12px; }
            .meta-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; border-bottom: 1px dashed #e4e4e7 !important; }
            .meta-cell:last-child { border-bottom: none !important; }
            .concepts-table th, .concepts-table td { padding: 8px 6px !important; font-size: 12px !important; }
          }
          @media print {
            body { padding: 0; background: white; }
            .colilla-container { border: none; box-shadow: none; padding: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="colilla-container">
          <table class="header-table">
            <tr>
              <td>
                <img src="${window.location.origin}/logo.svg" alt="SmartLogistics Costa Rica" class="logo-img" onerror="this.onerror=null; this.src='${window.location.origin}/logo.png';" />
              </td>
              <td class="header-right">
                <div class="title-text">Colilla de Pago Oficial</div>
                <div class="company-text">SmartLogistics Costa Rica</div>
              </td>
            </tr>
          </table>

          <div class="divider"></div>

          <div class="meta-container">
            <table class="meta-table">
              <tr>
                <td class="meta-cell" style="width: 50%; padding: 0 12px 8px 0; border-bottom: 1px dashed #e4e4e7;">
                  <div class="meta-label">Colaborador</div>
                  <div class="meta-value">${line.employeeName}</div>
                </td>
                <td class="meta-cell" style="width: 50%; padding: 0 0 8px 12px; border-bottom: 1px dashed #e4e4e7;">
                  <div class="meta-label">Período</div>
                  <div class="meta-value">${periodLabel}</div>
                </td>
              </tr>
              <tr>
                <td class="meta-cell" style="padding: 8px 12px 8px 0; border-bottom: 1px dashed #e4e4e7;">
                  <div class="meta-label">Identificación</div>
                  <div class="meta-value-regular">${line.idNumber || "—"}</div>
                </td>
                <td class="meta-cell" style="padding: 8px 0 8px 12px; border-bottom: 1px dashed #e4e4e7;">
                  <div class="meta-label">Puesto</div>
                  <div class="meta-value-regular">${position}</div>
                </td>
              </tr>
              <tr>
                <td class="meta-cell" style="padding: 8px 12px 0 0;">
                  <div class="meta-label">Frecuencia / Horas</div>
                  <div class="meta-value-regular" style="text-transform: capitalize;">
                    ${period.frequency === "monthly" ? "Mensual" : period.frequency === "biweekly" ? "Quincenal" : period.frequency === "weekly" ? "Semanal" : period.frequency} / ${weeklyHours} hs
                  </div>
                </td>
                <td class="meta-cell" style="padding: 8px 0 0 12px;">
                  <div class="meta-label">Salario Base Contractual</div>
                  <div class="meta-value">${formatCRC(emp?.baseSalary || 0)}</div>
                </td>
              </tr>
            </table>
          </div>

          <table class="concepts-table">
            <thead>
              <tr>
                <th style="border-top-left-radius: 4px; border-bottom-left-radius: 4px;">Concepto / Detalle</th>
                <th style="text-align: right; width: 25%;">Ingresos (CRC)</th>
                <th style="text-align: right; width: 25%; border-top-right-radius: 4px; border-bottom-right-radius: 4px;">Deducciones (CRC)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${period.frequency === "weekly" ? "Salario Base Semanal" : period.frequency === "biweekly" ? "Salario Base Quincenal" : "Salario Base Mensual"}</td>
                <td style="text-align: right; font-weight: 600;">${formatCRC(line.baseSalary)}</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
              </tr>
              ${line.unpaidLeaveDays > 0 ? `
              <tr style="color: #b91c1c;">
                <td>Rebajo Permiso sin Goce (${line.unpaidLeaveDays} ${line.unpaidLeaveDays === 1 ? 'día' : 'días'})</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
                <td style="text-align: right; font-weight: 600; color: #b91c1c;">-${formatCRC(line.unpaidLeaveDiscount)}</td>
              </tr>
              ` : ""}
              <tr class="gross-row">
                <td>Salario Bruto Calculado</td>
                <td style="text-align: right; font-weight: 700;">${formatCRC(line.grossSalary)}</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
              </tr>
              <tr>
                <td>Retención Obrero CCSS (${((settings.employeeSocialSecurityRate || 0.1083) * 100).toFixed(2)}%)</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
                <td style="text-align: right; font-weight: 600; color: #b91c1c;">-${formatCRC(line.ccss)}</td>
              </tr>
              ${line.renta > 0 ? `
              <tr>
                <td>Impuesto sobre la Renta</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
                <td style="text-align: right; font-weight: 600; color: #b91c1c;">-${formatCRC(line.renta)}</td>
              </tr>
              ` : ""}
              ${line.privateInsuranceCost > 0 ? `
              <tr>
                <td>Seguro Privado Co-pago</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
                <td style="text-align: right; font-weight: 600; color: #b91c1c;">-${formatCRC(line.privateInsuranceCost)}</td>
              </tr>
              ` : ""}
              ${line.descargosDeducted > 0 ? `
              <tr>
                <td>Descargos / Compras Deducidas</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
                <td style="text-align: right; font-weight: 600; color: #b91c1c;">-${formatCRC(line.descargosDeducted)}</td>
              </tr>
              ` : ""}
              ${line.swagDeducted > 0 ? `
              <tr>
                <td>Branding / Swag Deducido</td>
                <td style="text-align: right; color: #a1a1aa;">—</td>
                <td style="text-align: right; font-weight: 600; color: #b91c1c;">-${formatCRC(line.swagDeducted)}</td>
              </tr>
              ` : ""}
            </tbody>
          </table>

          <table class="total-box">
            <tr>
              <td>
                <div class="total-label">Salario Neto a Depositar</div>
                <div class="total-desc">Monto total a transferir a su cuenta bancaria</div>
              </td>
              <td class="total-amount">
                ${formatCRC(line.netSalary)}
              </td>
            </tr>
          </table>

          <div class="footer">
            Este es un documento confidencial e informativo emitido por SmartLogistics Costa Rica S.A.<br/>
            © 2026 SmartLogistics. Todos los derechos reservados.
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  /* Send Executive payslip emails */
  const handleSendEmails = async () => {
    setSendingColillas(true);
    let successCount = 0;
    let failCount = 0;

    for (const line of includedLines) {
      const emp = employees.find(e => e.id === line.employeeId);
      if (!emp || !emp.email) {
        failCount++;
        continue;
      }

      const settings = getCountrySettings(emp.countryCode || "CR");
      const weeklyHours = settings.standardWeeklyHours || 48;

      // Build executive HTML template
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @media screen and (max-width: 520px) {
              .header-cell { display: block !important; width: 100% !important; text-align: center !important; }
              .header-right { text-align: center !important; margin-top: 12px !important; }
              .meta-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; border-bottom: 1px dashed #e4e4e7 !important; }
              .meta-cell:last-child { border-bottom: none !important; }
              .concepts-th, .concepts-td { padding: 8px 6px !important; font-size: 12px !important; }
              .total-cell { display: block !important; width: 100% !important; text-align: center !important; }
              .total-amount-cell { display: block !important; width: 100% !important; text-align: center !important; margin-top: 10px !important; }
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #fafafa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <div style="max-width: 600px; margin: 20px auto; padding: 30px; border: 1px solid #e4e4e7; border-top: 4px solid #9E0A21; border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); box-sizing: border-box;">
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td class="header-cell" style="vertical-align: middle;">
                  <img src="https://smart-portal-admin.web.app/logo.png" alt="SmartLogistics Costa Rica" style="display: block; height: 38px; width: auto;" onerror="this.style.display='none'" />
                </td>
                <td class="header-cell header-right" style="vertical-align: middle; text-align: right;">
                  <div style="font-size: 14px; font-weight: 800; color: #9E0A21; text-transform: uppercase; letter-spacing: 1.5px;">Colilla de Pago Oficial</div>
                  <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-top: 2px;">SmartLogistics Costa Rica</div>
                </td>
              </tr>
            </table>

            <div style="height: 1px; background-color: #e4e4e7; margin: 15px 0 20px 0;"></div>

            <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td class="meta-cell" style="width: 50%; padding: 0 12px 8px 0; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Colaborador</div>
                    <div style="font-size: 13px; font-weight: 700; color: #18181b;">${line.employeeName}</div>
                  </td>
                  <td class="meta-cell" style="width: 50%; padding: 0 0 8px 12px; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Período</div>
                    <div style="font-size: 13px; font-weight: 700; color: #18181b;">${periodLabel}</div>
                  </td>
                </tr>
                <tr>
                  <td class="meta-cell" style="padding: 8px 12px 8px 0; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Identificación</div>
                    <div style="font-size: 13px; font-weight: 600; color: #27272a;">${line.idNumber || "—"}</div>
                  </td>
                  <td class="meta-cell" style="padding: 8px 0 8px 12px; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Puesto</div>
                    <div style="font-size: 13px; font-weight: 600; color: #27272a;">${emp.position || "Colaborador"}</div>
                  </td>
                </tr>
                <tr>
                  <td class="meta-cell" style="padding: 8px 12px 0 0; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Frecuencia / Horas</div>
                    <div style="font-size: 13px; font-weight: 600; color: #27272a; text-transform: capitalize;">
                      ${period.frequency === "monthly" ? "Mensual" : period.frequency === "biweekly" ? "Quincenal" : period.frequency === "weekly" ? "Semanal" : period.frequency} / ${weeklyHours} hs
                    </div>
                  </td>
                  <td class="meta-cell" style="padding: 8px 0 0 12px; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Salario Base Contractual</div>
                    <div style="font-size: 13px; font-weight: 700; color: #18181b;">${formatCRC(emp.baseSalary)}</div>
                  </td>
                </tr>
              </table>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="background-color: #f4f4f5;">
                  <th class="concepts-th" style="text-align: left; padding: 8px 12px; color: #52525b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-top-left-radius: 4px; border-bottom-left-radius: 4px;">Concepto / Detalle</th>
                  <th class="concepts-th" style="text-align: right; padding: 8px 12px; color: #52525b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; width: 25%;">Ingresos (CRC)</th>
                  <th class="concepts-th" style="text-align: right; padding: 8px 12px; color: #52525b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; width: 25%; border-top-right-radius: 4px; border-bottom-right-radius: 4px;">Deducciones (CRC)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">
                    ${period.frequency === "weekly" ? "Salario Base Semanal" : period.frequency === "biweekly" ? "Salario Base Quincenal" : "Salario Base Mensual"}
                  </td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a; font-weight: 600;">${formatCRC(line.baseSalary)}</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                </tr>
                ${line.unpaidLeaveDays > 0 ? `
                <tr style="color: #b91c1c;">
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5;">Rebajo Permiso sin Goce (${line.unpaidLeaveDays} ${line.unpaidLeaveDays === 1 ? 'día' : 'días'})</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.unpaidLeaveDiscount)}</td>
                </tr>
                ` : ""}
                <tr style="background-color: #fafafa; font-weight: 700; color: #18181b;">
                  <td class="concepts-td" style="padding: 10px 12px; border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7;">Salario Bruto Calculado</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; font-weight: 700; border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7;">${formatCRC(line.grossSalary)}</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7;">—</td>
                </tr>
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Retención Obrero CCSS (${((settings.employeeSocialSecurityRate || 0.1083) * 100).toFixed(2)}%)</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.ccss)}</td>
                </tr>
                ${line.renta > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Impuesto sobre la Renta</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.renta)}</td>
                </tr>
                ` : ""}
                ${line.privateInsuranceCost > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Seguro Privado Co-pago</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.privateInsuranceCost)}</td>
                </tr>
                ` : ""}
                ${(line.descargosDeducted || 0) > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Descargos / Compras Deducidas</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.descargosDeducted)}</td>
                </tr>
                ` : ""}
                ${(line.swagDeducted || 0) > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Branding / Swag Deducido</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.swagDeducted)}</td>
                </tr>
                ` : ""}
              </tbody>
            </table>

            <table style="width: 100%; background-color: #fafafa; border: 1px solid #e4e4e7; border-left: 4px solid #059669; border-radius: 6px; margin-top: 24px; border-collapse: collapse;">
              <tr>
                <td class="total-cell" style="padding: 14px 18px; text-align: left; vertical-align: middle;">
                  <div style="font-size: 10px; font-weight: 800; color: #065f46; letter-spacing: 0.5px; text-transform: uppercase;">Salario Neto a Depositar</div>
                  <div style="font-size: 11px; color: #71717a; margin-top: 2px;">Monto total a transferir a su cuenta bancaria</div>
                </td>
                <td class="total-amount-cell" style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                  <div style="font-size: 22px; font-weight: 900; color: #059669; font-family: Arial, sans-serif;">
                    ${formatCRC(line.netSalary)}
                  </div>
                </td>
              </tr>
            </table>

            <div style="text-align: center; margin-top: 30px; color: #a1a1aa; font-size: 11px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5;">
              Este es un documento confidencial e informativo emitido por SmartLogistics Costa Rica S.A.<br/>
              © 2026 SmartLogistics. Todos los derechos reservados.
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const res = await sendEmail({
          to: emp.email,
          subject: `Colilla de Pago - Período ${periodLabel} - SmartLogistics`,
          html: htmlContent,
        });

        if (res.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    setSendingColillas(false);
    toast({
      title: "Envío de colillas finalizado",
      description: `Se enviaron ${successCount} correos con éxito y fallaron ${failCount}.`,
    });
  };

  const stepIndex = STEPS.indexOf(step);

  const defaultCountry = includedLines[0]
    ? employees.find(e => e.id === includedLines[0].employeeId)?.countryCode || "CR"
    : "CR";
  const defaultSettings = getCountrySettings(defaultCountry);
  const defaultRateStr = `${((defaultSettings.employeeSocialSecurityRate || 0.1083) * 100).toFixed(2)}%`;

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-6xl mx-auto space-y-6 p-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const meta = stepMeta[s];
            const isDone = STEPS.indexOf(step) > i;
            const isActive = step === s;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <span className={cn("h-4 w-4 flex items-center justify-center", isActive ? "text-primary-foreground" : "")}>
                      {meta.icon}
                    </span>
                  )}
                  <span className="hidden sm:inline">{meta.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-px flex-1 mx-1 transition-colors",
                      STEPS.indexOf(step) > i ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {/* ── STEP 1: Period ── */}
            {step === "period" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Period Selector Card */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {t("selectPeriod")}
                    </CardTitle>
                    <CardDescription>{t("selectPeriodDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-1.5">
                      <Label>{t("frequency")}</Label>
                      <Select
                        value={period.frequency}
                        onValueChange={(v) =>
                          setPeriod((p) => ({ 
                            ...p, 
                            frequency: v,
                            ...(v === "weekly" && {
                              weekNumber: getCurrentWeekNumber(),
                            }),
                            ...(v === "biweekly" && {
                              quincena: "1",
                            }),
                          }))
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">{t("monthly")}</SelectItem>
                          <SelectItem value="biweekly">{t("biweekly")}</SelectItem>
                          <SelectItem value="weekly">{t("weekly")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {period.frequency === "monthly" && (
                      <div className="grid grid-cols-2 gap-4 animate-in fade-in-50 duration-200">
                        <div className="space-y-1.5">
                          <Label>{t("month")}</Label>
                          <Select
                            value={period.month}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, month: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map(
                                (m, i) => (
                                  <SelectItem key={i} value={i.toString()}>
                                    {m}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("year")}</Label>
                          <Select
                            value={period.year}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, year: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1].map((o) => {
                                const y = (new Date().getFullYear() - o).toString();
                                return (
                                  <SelectItem key={y} value={y}>
                                    {y}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {period.frequency === "biweekly" && (
                      <div className="grid grid-cols-3 gap-4 animate-in fade-in-50 duration-200">
                        <div className="space-y-1.5">
                          <Label>{t("month")}</Label>
                          <Select
                            value={period.month}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, month: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map(
                                (m, i) => (
                                  <SelectItem key={i} value={i.toString()}>
                                    {m}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>{t("year")}</Label>
                          <Select
                            value={period.year}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, year: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1].map((o) => {
                                const y = (new Date().getFullYear() - o).toString();
                                return (
                                  <SelectItem key={y} value={y}>
                                    {y}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Quincena</Label>
                          <Select
                            value={period.quincena}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, quincena: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1ra Quincena (Días 1-15)</SelectItem>
                              <SelectItem value="2">2da Quincena (Días 16-Fin)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {period.frequency === "weekly" && (
                      <div className="grid grid-cols-3 gap-4 animate-in fade-in-50 duration-200">
                        <div className="col-span-1 space-y-1.5">
                          <Label>{t("year")}</Label>
                          <Select
                            value={period.year}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, year: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 1].map((o) => {
                                const y = (new Date().getFullYear() - o).toString();
                                return (
                                  <SelectItem key={y} value={y}>
                                    {y}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 space-y-1.5">
                          <Label>Semana del Año</Label>
                          <Select
                            value={period.weekNumber}
                            onValueChange={(v) =>
                              setPeriod((p) => ({ ...p, weekNumber: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {weeksList.map((wk) => (
                                <SelectItem key={wk.number} value={wk.number}>
                                  {wk.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {/* Period preview */}
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        {t("periodPreview")}: {periodLabel}
                      </div>
                      <span className="text-xs text-muted-foreground">Moneda: CRC (Colones)</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Historial Reference Card */}
                <Card className="lg:col-span-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Planillas Recientes
                    </CardTitle>
                    <CardDescription className="text-xs font-sans">
                      Historial de nóminas ejecutadas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 pt-0">
                    {isLoadingPastRuns ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : pastRuns.length === 0 ? (
                      <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg font-sans">
                        No hay planillas ejecutadas anteriormente.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {pastRuns.slice(0, 3).map((run: any) => (
                          <div 
                            key={run.id} 
                            className="p-3 rounded-lg border bg-muted/20 text-xs space-y-1.5 transition-all hover:bg-muted/40 font-sans"
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-semibold text-foreground">{run.period}</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase">
                                {run.frequency === "monthly" ? "Mensual" : run.frequency === "biweekly" ? "Quincenal" : "Semanal"}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground space-y-0.5">
                              <div>Colaboradores: <span className="font-medium text-foreground">{run.employeeCount}</span></div>
                              <div>Neto: <span className="font-medium text-foreground">{formatCRC(run.totalNet || 0)}</span></div>
                              <div className="text-[10px] text-muted-foreground/75">
                                Ejecución: {new Date(run.runDate).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" })}
                              </div>
                            </div>
                            <Button 
                              variant="outline" 
                              className="w-full text-[10px] h-7 mt-1"
                              onClick={() => handleUseRunReference(run)}
                            >
                              Usar como Referencia
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── STEP 2: Employees ── */}
            {step === "employees" && (
              <>
                <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    {t("reviewEmployees")}
                    <Badge variant="secondary" className="ml-1">
                      {lines.filter((l) => l.included).length} / {lines.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{t("reviewEmployeesDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 pl-4"></TableHead>
                        <TableHead>{t("employee")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("department")}</TableHead>
                        <TableHead className="text-center">Permisos sin Goce</TableHead>
                        <TableHead className="text-center text-rose-600">Descargos</TableHead>
                        <TableHead className="text-right">Salario Base</TableHead>
                        <TableHead className="text-right">{t("grossSalary")}</TableHead>
                        <TableHead className="text-center w-20">Colilla</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow
                          key={line.employeeId}
                          className={cn(
                            "cursor-pointer",
                            !line.included && "opacity-40"
                          )}
                          onClick={() => toggleEmployee(line.employeeId)}
                        >
                          <TableCell className="pl-4">
                            <div
                              className={cn(
                                "h-4 w-4 rounded border-2 flex items-center justify-center transition-colors",
                                line.included
                                  ? "bg-primary border-primary"
                                  : "border-muted-foreground"
                              )}
                            >
                              {line.included && (
                                <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{line.employeeName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {line.department}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium">
                            {line.unpaidLeaveDays > 0 ? (
                              <Badge variant="destructive">{line.unpaidLeaveDays} días</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const emp = employees.find(e => e.id === line.employeeId);
                              const privInsCost = toCycleSalary(emp?.privateInsuranceCost || 0, period.frequency);
                              
                              const pendingDeductions = (emp?.deductions || []).filter(d => d.status === "pending");
                              const pendingSwag = (emp?.swag || []).filter(s => s.status === "pending");
                              
                              const totalPendingDeductions = pendingDeductions.reduce((s, r) => s + r.amount, 0);
                              const totalPendingSwag = pendingSwag.reduce((s, r) => s + r.cost, 0);
                              const totalPending = privInsCost + totalPendingDeductions + totalPendingSwag;

                              if (totalPending === 0) {
                                return <span className="text-xs text-muted-foreground">—</span>;
                              }

                              return (
                                <div className="flex flex-col items-center gap-1 font-sans">
                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="font-bold text-rose-600">
                                      {formatCRC(line.otherDeductions)}
                                    </span>
                                    <span className="text-muted-foreground">aplicados</span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground bg-rose-50/50 border border-rose-100 px-2 py-0.5 rounded-full dark:bg-rose-950/20 dark:border-rose-900/30">
                                    Total Pendiente: {formatCRC(totalPending)}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] px-2.5 mt-1 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30 gap-1 font-semibold"
                                    onClick={() => setActiveDeductionsEmployeeId(line.employeeId)}
                                  >
                                    <Settings className="h-3 w-3" />
                                    Ajustar Cobros
                                  </Button>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatCRC(line.baseSalary)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium">{formatCRC(line.grossSalary)}</span>
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2 text-slate-700 hover:text-slate-900 border-slate-200"
                              onClick={() => setPreviewLine(line)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Deductions Configuration Dialog */}
              {(() => {
                const activeLine = lines.find((l) => l.employeeId === activeDeductionsEmployeeId);
                const activeEmp = employees.find((e) => e.id === activeDeductionsEmployeeId);
                if (!activeLine || !activeEmp) return null;

                const privInsCost = toCycleSalary(activeEmp.privateInsuranceCost || 0, period.frequency);
                const pendingDeductions = (activeEmp.deductions || []).filter((d) => d.status === "pending");
                const pendingSwag = (activeEmp.swag || []).filter((s) => s.status === "pending");
                const totalPendingDeductions = pendingDeductions.reduce((s, r) => s + r.amount, 0);
                const totalPendingSwag = pendingSwag.reduce((s, r) => s + r.cost, 0);
                const totalPending = privInsCost + totalPendingDeductions + totalPendingSwag;

                return (
                  <Dialog
                    open={activeDeductionsEmployeeId !== null}
                    onOpenChange={(open) => !open && setActiveDeductionsEmployeeId(null)}
                  >
                    <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto font-sans">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground font-bold">
                          <Users className="h-5 w-5 text-primary" />
                          Configurar Descargos y Deducciones
                        </DialogTitle>
                        <DialogDescription>
                          Ajusta los rebajos que se aplicarán a <strong>{activeLine.employeeName}</strong> en esta corrida de nómina.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 my-2">
                        {/* Info panel */}
                        <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-lg text-xs">
                          <div>
                            <span className="text-muted-foreground block">Departamento</span>
                            <span className="font-semibold text-foreground">{activeLine.department}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Salario Neto Disponible</span>
                            <span className="font-semibold text-emerald-600">
                              {formatCRC(activeLine.grossSalary - activeLine.ccss - activeLine.renta)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                          {/* 1. Seguro Privado */}
                          {privInsCost > 0 && (
                            <div className="p-3 border rounded-lg space-y-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h5 className="text-xs font-bold text-foreground">Seguro Privado (Copago)</h5>
                                  <p className="text-[10px] text-muted-foreground">Cobro mensual recurrente</p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    id="modal-insurance-chk"
                                    checked={activeLine.applyPrivateInsurance}
                                    onChange={(e) => {
                                      handleItemDeductionChange(
                                        activeLine.employeeId,
                                        "privateInsurance",
                                        "insurance",
                                        e.target.checked ? privInsCost : 0
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                  <label htmlFor="modal-insurance-chk" className="text-xs font-medium cursor-pointer text-foreground">
                                    Deducir
                                  </label>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs pt-1 border-t border-dashed">
                                <span className="text-muted-foreground">Monto: {formatCRC(privInsCost)}</span>
                                <span className="font-medium text-foreground">
                                  Restante: {activeLine.applyPrivateInsurance ? "₡0" : formatCRC(privInsCost)}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 2. Deducciones / Descargos */}
                          {pendingDeductions.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Deducciones / Descargos Especiales
                              </h5>
                              <div className="space-y-2">
                                {pendingDeductions.map((d) => {
                                  const applied = activeLine.appliedDeductionsMap[d.id] ?? 0;
                                  const remaining = Math.max(0, d.amount - applied);
                                  return (
                                    <div key={d.id} className="p-3 border rounded-lg space-y-2.5">
                                      <div className="flex justify-between items-start gap-2">
                                        <div className="max-w-[70%]">
                                          <span className="text-xs font-semibold text-foreground block truncate">
                                            {d.description || "Compra especial"}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground">Fecha: {d.date}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-muted-foreground">₡</span>
                                          <Input
                                            type="number"
                                            value={applied}
                                            min={0}
                                            max={d.amount}
                                            onChange={(e) => {
                                              handleItemDeductionChange(
                                                activeLine.employeeId,
                                                "deduction",
                                                d.id,
                                                parseFloat(e.target.value) || 0
                                              );
                                            }}
                                            className="h-7 w-24 px-1.5 text-xs text-right bg-background text-foreground"
                                          />
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-[10px] px-2 text-foreground"
                                            onClick={() => {
                                              handleItemDeductionChange(
                                                activeLine.employeeId,
                                                "deduction",
                                                d.id,
                                                d.amount
                                              );
                                            }}
                                          >
                                            Todo
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="flex justify-between text-xs pt-1 border-t border-dashed">
                                        <span className="text-muted-foreground">Pendiente original: {formatCRC(d.amount)}</span>
                                        <span
                                          className={cn(
                                            "font-medium",
                                            remaining === 0
                                              ? "text-emerald-600"
                                              : remaining < d.amount
                                              ? "text-amber-600"
                                              : "text-foreground"
                                          )}
                                        >
                                          {remaining === 0
                                            ? "Restante: ₡0 (Liquidado)"
                                            : `Restante: ${formatCRC(remaining)}`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 3. Swag */}
                          {pendingSwag.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                Cobros por Swag / Indumentaria
                              </h5>
                              <div className="space-y-2">
                                {pendingSwag.map((s) => {
                                  const applied = activeLine.appliedSwagMap[s.id] ?? 0;
                                  const remaining = Math.max(0, s.cost - applied);
                                  return (
                                    <div key={s.id} className="p-3 border rounded-lg space-y-2.5">
                                      <div className="flex justify-between items-start gap-2">
                                        <div className="max-w-[70%]">
                                          <span className="text-xs font-semibold text-foreground block truncate">
                                            {s.item}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground">Fecha entrega: {s.date}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-xs text-muted-foreground">₡</span>
                                          <Input
                                            type="number"
                                            value={applied}
                                            min={0}
                                            max={s.cost}
                                            onChange={(e) => {
                                              handleItemDeductionChange(
                                                activeLine.employeeId,
                                                "swag",
                                                s.id,
                                                parseFloat(e.target.value) || 0
                                              );
                                            }}
                                            className="h-7 w-24 px-1.5 text-xs text-right bg-background text-foreground"
                                          />
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-[10px] px-2 text-foreground"
                                            onClick={() => {
                                              handleItemDeductionChange(
                                                activeLine.employeeId,
                                                "swag",
                                                s.id,
                                                s.cost
                                              );
                                            }}
                                          >
                                            Todo
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="flex justify-between text-xs pt-1 border-t border-dashed">
                                        <span className="text-muted-foreground">Costo original: {formatCRC(s.cost)}</span>
                                        <span
                                          className={cn(
                                            "font-medium",
                                            remaining === 0
                                              ? "text-emerald-600"
                                              : remaining < s.cost
                                              ? "text-amber-600"
                                              : "text-foreground"
                                          )}
                                        >
                                          {remaining === 0
                                            ? "Restante: ₡0 (Liquidado)"
                                            : `Restante: ${formatCRC(remaining)}`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Modal Summary statistics */}
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-muted-foreground">Total rebajos aplicados:</span>
                            <span className="text-rose-600">{formatCRC(activeLine.otherDeductions)}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold bg-primary/5 p-2.5 rounded-lg border border-primary/10">
                            <span className="text-foreground">Salario Neto Estimado:</span>
                            <span className="text-emerald-600">{formatCRC(activeLine.netSalary)}</span>
                          </div>
                          {activeLine.netSalary <= 0 && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] p-2 rounded flex items-center gap-1.5 font-medium">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                              Las deducciones han consumido todo el salario neto. El pago neto final será ₡0.
                            </div>
                          )}
                        </div>
                      </div>

                      <DialogFooter>
                        <Button onClick={() => setActiveDeductionsEmployeeId(null)} className="w-full sm:w-auto text-white">
                          Confirmar y Cerrar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                );
              })()}
              </>
            )}

            {/* ── STEP 3: Review ── */}
            {step === "review" && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: t("totalGross"), value: totals.gross, color: "text-foreground" },
                    { label: `${t("totalCCSS")} (${defaultRateStr})`, value: totals.ccss, color: "text-orange-600 dark:text-orange-400" },
                    { label: t("totalRenta"), value: totals.renta, color: "text-rose-600 dark:text-rose-400" },
                    { label: t("totalNet"), value: totals.net, color: "text-emerald-600 dark:text-emerald-400" },
                  ].map((item) => (
                    <Card key={item.label}>
                      <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className={cn("text-base font-bold mt-0.5", item.color)}>
                          {formatCRC(item.value)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Detail table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("payrollDetail")}</CardTitle>
                    <CardDescription>
                      {t("period")}: <strong>{periodLabel}</strong> · {includedLines.length} {t("employees")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("employee")}</TableHead>
                          <TableHead className="text-right">{t("gross")}</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">{t("ccss")} ({defaultRateStr})</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">{t("renta")}</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Seguro Priv.</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Descargos/Swag</TableHead>
                          <TableHead className="text-right font-semibold">{t("net")}</TableHead>
                          <TableHead className="text-center w-20">Colilla</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {includedLines.map((line) => (
                          <TableRow key={line.employeeId}>
                            <TableCell>
                              <span className="text-sm font-medium">{line.employeeName}</span>
                              {line.unpaidLeaveDays > 0 && (
                                <div className="text-xs text-red-600">
                                  Rebajo sin Goce: -{formatCRC(line.unpaidLeaveDiscount)} ({line.unpaidLeaveDays} {line.unpaidLeaveDays === 1 ? 'día' : 'días'})
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">₡</span>
                                <Input
                                  type="number"
                                  value={line.grossSalary}
                                  onChange={(e) => {
                                    handleManualOverride(line.employeeId, "grossSalary", parseFloat(e.target.value) || 0);
                                  }}
                                  className="h-7 w-24 px-1.5 py-0 text-right text-xs border rounded bg-background text-foreground"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              <div className="flex justify-end items-center gap-1 text-orange-600 dark:text-orange-400">
                                <span className="text-[10px]">-₡</span>
                                <Input
                                  type="number"
                                  value={line.ccss}
                                  onChange={(e) => {
                                    handleManualOverride(line.employeeId, "ccss", parseFloat(e.target.value) || 0);
                                  }}
                                  className="h-7 w-24 px-1.5 py-0 text-right text-xs border rounded bg-background text-orange-600 dark:text-orange-400"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right hidden sm:table-cell">
                              <div className="flex justify-end items-center gap-1 text-rose-600 dark:text-rose-400">
                                <span className="text-[10px]">-₡</span>
                                <Input
                                  type="number"
                                  value={line.renta}
                                  onChange={(e) => {
                                    handleManualOverride(line.employeeId, "renta", parseFloat(e.target.value) || 0);
                                  }}
                                  className="h-7 w-24 px-1.5 py-0 text-right text-xs border rounded bg-background text-rose-600 dark:text-rose-400"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell text-rose-600">
                              {line.privateInsuranceCost > 0 ? `-${formatCRC(line.privateInsuranceCost)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell text-rose-600">
                              {line.descargosDeducted + line.swagDeducted > 0 ? `-${formatCRC(line.descargosDeducted + line.swagDeducted)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCRC(line.netSalary)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 text-slate-700 hover:text-slate-900 border-slate-200"
                                onClick={() => setPreviewLine(line)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />
                                Ver
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30 font-semibold text-sm">
                      <span>{t("totals")}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">{formatCRC(totals.net)}</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {t("disclaimer", { rate: ((defaultSettings.employeeSocialSecurityRate || 0.1083) * 100).toFixed(2) })}
                </div>
              </div>
            )}

            {/* ── STEP 4: Done ── */}
            {step === "done" && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-bold">{t("runComplete")}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {`${periodLabel} · ${includedLines.length} ${t("employees")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
                    <Button variant="outline" size="sm" onClick={handleExportBAC}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Exportar Excel BAC
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendEmails}
                      disabled={sendingColillas}
                      className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      {sendingColillas ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Mail className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Enviar Colillas por Correo
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setStep("period");
                        setLines([]);
                      }}
                    >
                      {t("newRun")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons */}
        {step !== "done" && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(STEPS[stepIndex - 1])}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.back")}
            </Button>

            {step === "period" && (
              <Button onClick={buildLines} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-1.5" />
                )}
                {t("loadEmployees")}
              </Button>
            )}

            {step === "employees" && (
              <Button
                onClick={() => setStep("review")}
                disabled={includedLines.length === 0}
              >
                <DollarSign className="h-4 w-4 mr-1.5" />
                {t("calculatePayroll")}
              </Button>
            )}

            {step === "review" && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 mr-2 bg-muted/45 px-3 py-1.5 rounded-lg border border-border">
                  <Checkbox
                    id="auto-send-colillas"
                    checked={autoSendColillas}
                    onCheckedChange={(checked) => setAutoSendColillas(!!checked)}
                  />
                  <Label htmlFor="auto-send-colillas" className="text-sm font-medium cursor-pointer select-none">
                    Enviar colillas por correo al aprobar
                  </Label>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleExportBAC}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Exportar Excel BAC
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || sendingColillas}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {saveMutation.isPending || sendingColillas ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1.5" />
                  )}
                  {sendingColillas ? "Enviando colillas..." : "Aprobar y Ejecutar"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Payslip Preview Dialog */}
        <Dialog open={previewLine !== null} onOpenChange={(open) => !open && setPreviewLine(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto font-sans bg-slate-100 p-6">
            <DialogHeader className="print:hidden pb-2 border-b">
              <DialogTitle className="flex items-center gap-2 text-slate-800 font-bold">
                <Eye className="h-5 w-5 text-slate-600" />
                Vista Previa de Colilla
              </DialogTitle>
            </DialogHeader>

            {previewLine && (() => {
              const emp = employees.find(e => e.id === previewLine.employeeId);
              const position = emp?.position || "Colaborador";
              const settings = getCountrySettings(emp?.countryCode || "CR");
              const weeklyHours = settings?.standardWeeklyHours || 48;
              
              return (
                <div className="my-2 space-y-5">
                  {/* High Fidelity Payslip Box matching the email styles */}
                  <div className="w-full max-w-[600px] mx-auto p-5 sm:p-8 border border-zinc-200 border-t-4 border-t-[#9E0A21] rounded-lg bg-white shadow-sm text-zinc-800">
                    
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-5">
                      <img 
                        src="/logo.svg" 
                        alt="SmartLogistics Costa Rica" 
                        className="h-9 w-auto object-contain"
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.png'; }}
                      />
                      <div className="text-center sm:text-right">
                        <div className="text-sm font-extrabold text-[#9E0A21] tracking-wider uppercase">Colilla de Pago Oficial</div>
                        <div className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase mt-0.5">SmartLogistics Costa Rica</div>
                      </div>
                    </div>

                    <div className="h-px bg-zinc-200 my-4"></div>

                    <div className="bg-zinc-50 border border-zinc-200 rounded-md p-4 sm:p-5 mb-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:border-r sm:pr-4">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Colaborador</div>
                          <div className="text-sm font-bold text-zinc-900 mt-0.5">{previewLine.employeeName}</div>
                        </div>
                        <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:pl-4">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Período</div>
                          <div className="text-sm font-bold text-zinc-900 mt-0.5">{periodLabel}</div>
                        </div>
                        <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:border-r sm:pr-4 sm:pt-3">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Identificación</div>
                          <div className="text-sm font-medium text-zinc-700 mt-0.5">{previewLine.idNumber || "—"}</div>
                        </div>
                        <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:pl-4 sm:pt-3">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Puesto</div>
                          <div className="text-sm font-medium text-zinc-700 mt-0.5">{position}</div>
                        </div>
                        <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:border-r sm:pr-4 sm:pt-3">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Frecuencia / Horas</div>
                          <div className="text-sm font-medium text-zinc-700 mt-0.5 capitalize">
                            {period.frequency === "monthly" ? "Mensual" : period.frequency === "biweekly" ? "Quincenal" : period.frequency === "weekly" ? "Semanal" : period.frequency} / {weeklyHours} hs
                          </div>
                        </div>
                        <div className="sm:pl-4 sm:pt-3">
                          <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Salario Base Contractual</div>
                          <div className="text-sm font-bold text-zinc-900 mt-0.5">{formatCRC(emp?.baseSalary || 0)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-zinc-100 text-left">
                            <th className="py-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider rounded-l">Concepto / Detalle</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider text-right w-[25%]">Ingresos (CRC)</th>
                            <th className="py-2 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider text-right w-[25%] rounded-r">Deducciones (CRC)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          <tr>
                            <td className="py-2.5 px-3 text-zinc-700">
                              {period.frequency === "weekly" ? "Salario Base Semanal" : period.frequency === "biweekly" ? "Salario Base Quincenal" : "Salario Base Mensual"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-zinc-900">{formatCRC(previewLine.baseSalary)}</td>
                            <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                          </tr>
                          {previewLine.unpaidLeaveDays > 0 ? (
                            <tr className="text-red-800">
                              <td className="py-2.5 px-3">Rebajo Permiso sin Goce ({previewLine.unpaidLeaveDays} {previewLine.unpaidLeaveDays === 1 ? 'día' : 'días'})</td>
                              <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-red-700">-{formatCRC(previewLine.unpaidLeaveDiscount)}</td>
                            </tr>
                          ) : null}
                          <tr className="bg-zinc-50 font-bold text-zinc-900 border-t border-b border-zinc-200">
                            <td className="py-2.5 px-3">Salario Bruto Calculado</td>
                            <td className="py-2.5 px-3 text-right font-extrabold">{formatCRC(previewLine.grossSalary)}</td>
                            <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 text-zinc-600">Retención Obrero CCSS (${((settings?.employeeSocialSecurityRate ?? 0.1083) * 100).toFixed(2)}%)</td>
                            <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-red-700">-{formatCRC(previewLine.ccss)}</td>
                          </tr>
                          {previewLine.renta > 0 ? (
                            <tr>
                              <td className="py-2.5 px-3 text-zinc-600">Impuesto sobre la Renta</td>
                              <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-red-700">-{formatCRC(previewLine.renta)}</td>
                            </tr>
                          ) : null}
                          {previewLine.privateInsuranceCost > 0 ? (
                            <tr>
                              <td className="py-2.5 px-3 text-zinc-600">Seguro Privado Co-pago</td>
                              <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-red-700">-{formatCRC(previewLine.privateInsuranceCost)}</td>
                            </tr>
                          ) : null}
                          {previewLine.descargosDeducted > 0 ? (
                            <tr>
                              <td className="py-2.5 px-3 text-zinc-600">Descargos / Compras Deducidas</td>
                              <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-red-700">-{formatCRC(previewLine.descargosDeducted)}</td>
                            </tr>
                          ) : null}
                          {previewLine.swagDeducted > 0 ? (
                            <tr>
                              <td className="py-2.5 px-3 text-zinc-600">Branding / Swag Deducido</td>
                              <td className="py-2.5 px-3 text-right text-zinc-400">—</td>
                              <td className="py-2.5 px-3 text-right font-semibold text-red-700">-{formatCRC(previewLine.swagDeducted)}</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-zinc-50 border border-zinc-200 border-l-4 border-l-[#059669] rounded-md mt-6 gap-3">
                      <div>
                        <div className="text-[10px] font-extrabold text-[#065f46] tracking-wider uppercase">Salario Neto a Depositar</div>
                        <div className="text-xs text-zinc-500 mt-0.5">Monto total a transferir a su cuenta bancaria</div>
                      </div>
                      <div className="text-2xl font-black text-[#059669] self-end sm:self-auto">
                        {formatCRC(previewLine.netSalary)}
                      </div>
                    </div>

                    <div className="text-center mt-8 text-[11px] text-zinc-400 border-t border-zinc-200 pt-4 leading-relaxed">
                      Este es un documento confidencial e informativo emitido por SmartLogistics Costa Rica S.A.<br />
                      © 2026 SmartLogistics. Todos los derechos reservados.
                    </div>
                  </div>

                  <DialogFooter className="print:hidden border-t pt-3">
                    <Button 
                      variant="outline" 
                      onClick={() => handlePrintPreview(previewLine)}
                      className="w-full sm:w-auto text-slate-700 hover:bg-slate-100"
                    >
                      <Printer className="h-4 w-4 mr-2 text-slate-500" />
                      Imprimir Colilla
                    </Button>
                    <Button onClick={() => setPreviewLine(null)} className="w-full sm:w-auto text-white">
                      Cerrar
                    </Button>
                  </DialogFooter>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </motion.div>
    </DashboardLayout>
  );
});

export default PayrollRunWizard;
