import { useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  TrendingUp,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TimeEntry {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: number;
  type: string;
}

interface EmployeePayroll {
  employeeId: string;
  employeeName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  salaryFrequency: string;
  baseSalary: number;
  basePay: number;
  regularHours: number;
  overtimeHours: number;
  overtimePay: number;
  bonuses: number;
  grossPay: number;
  deductions: {
    socialSecurity: number;
    incomeTax: number;
    pension: number;
    other: number;
  };
  totalDeductions: number;
  netPay: number;
  timeEntries?: TimeEntry[];
}

interface EmployeePayrollDetailsProps {
  employee: EmployeePayroll;
  currency?: string;
}

export function EmployeePayrollDetails({
  employee,
  currency = "CRC",
}: EmployeePayrollDetailsProps) {
  const { t } = useLocale(["payrollReport", "common"]);
  const [showTimeEntries, setShowTimeEntries] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleTimeString("es-CR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-CR", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
      {/* Employee Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <span className="text-blue-700 dark:text-blue-300 font-semibold">
              {employee.employeeName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)}
            </span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">
              {employee.employeeName}
            </h4>
            <p className="text-sm text-muted-foreground">
              {employee.department || t("common.unknown")} •{" "}
              {t(employee.salaryFrequency)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(employee.netPay)}
          </p>
          <p className="text-xs text-muted-foreground">{t("netPay")}</p>
        </div>
      </div>

      {/* Pay Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">{t("basePay")}</span>
          </div>
          <p className="text-lg font-semibold">
            {formatCurrency(employee.basePay)}
          </p>
          <p className="text-xs text-muted-foreground">
            {employee.regularHours}h
          </p>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium">{t("overtimePay")}</span>
          </div>
          <p className="text-lg font-semibold text-orange-600">
            {formatCurrency(employee.overtimePay)}
          </p>
          <p className="text-xs text-muted-foreground">
            {employee.overtimeHours}h
          </p>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">{t("grossPay")}</span>
          </div>
          <p className="text-lg font-semibold text-green-600">
            {formatCurrency(employee.grossPay)}
          </p>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Minus className="h-4 w-4" />
            <span className="text-xs font-medium">{t("deductions")}</span>
          </div>
          <p className="text-lg font-semibold text-red-600">
            -{formatCurrency(employee.totalDeductions)}
          </p>
        </Card>
      </div>

      {/* Deductions Breakdown */}
      <Card className="p-4">
        <h5 className="font-semibold mb-3 text-sm">{t("deductions")}</h5>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {t("socialSecurity")}
            </p>
            <p className="font-medium">
              {formatCurrency(employee.deductions.socialSecurity)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("incomeTax")}</p>
            <p className="font-medium">
              {formatCurrency(employee.deductions.incomeTax)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("pension")}</p>
            <p className="font-medium">
              {formatCurrency(employee.deductions.pension)}
            </p>
          </div>
          {employee.deductions.other > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">
                {t("common.other")}
              </p>
              <p className="font-medium">
                {formatCurrency(employee.deductions.other)}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Time Entries Section */}
      {employee.timeEntries && employee.timeEntries.length > 0 && (
        <div>
          <Button
            variant="ghost"
            className="w-full justify-between p-2 h-auto"
            onClick={() => setShowTimeEntries(!showTimeEntries)}
            data-testid="toggle-time-entries"
          >
            <div className="flex items-center gap-2">
              {showTimeEntries ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Clock className="h-4 w-4" />
              <span className="font-medium">
                {t("common.timeEntries", "Time Entries")} (
                {employee.timeEntries.length})
              </span>
            </div>
            <Badge variant="outline">
              {employee.regularHours + employee.overtimeHours}h{" "}
              {t("common.total")}
            </Badge>
          </Button>

          {showTimeEntries && (
            <Card className="mt-2">
              <div className="divide-y">
                {employee.timeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3 flex items-center justify-between hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[60px]">
                        <p className="text-xs font-medium text-muted-foreground">
                          {formatDate(entry.date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{formatTime(entry.checkIn)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span>{formatTime(entry.checkOut)}</span>
                      </div>
                      <Badge
                        variant={
                          entry.type === "overtime"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {entry.type}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {entry.totalHours.toFixed(2)}h
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Contact Info */}
      {(employee.email || employee.phone) && (
        <Card className="p-3 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {employee.email && (
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("common.email")}
                </p>
                <p className="font-medium">{employee.email}</p>
              </div>
            )}
            {employee.phone && (
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("common.phone")}
                </p>
                <p className="font-medium">{employee.phone}</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
