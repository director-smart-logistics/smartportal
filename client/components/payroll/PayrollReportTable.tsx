import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import {
  ChevronDown,
  ChevronRight,
  User,
  Send,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployeeTableRow } from "./EmployeeTableRow";
import { PayslipModal } from "./PayslipModal";
import {
  SkeletonPayrollReportRows,
  SkeletonEmployeePayrollDetails,
} from "@/components/SkeletonLoaders";
import { useToast } from "@/hooks/use-toast";
import type { SalaryFrequency } from "@shared/payroll";

interface PayrollReport {
  id: string;
  frequency: SalaryFrequency;
  periodStart?: string;
  periodEnd?: string;
  status: string;
  totalGrossPay: number;
  totalNetPay: number;
  employeeCount: number;
  createdAt: string;
}

interface PayrollReportTableProps {
  reports: PayrollReport[];
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onSendPayslips: (id: string) => void;
  isLoading?: boolean;
  pageSize?: number;
}

export function PayrollReportTable({
  reports,
  onApprove,
  onDelete,
  onSendPayslips,
  isLoading = false,
  pageSize = 20,
}: PayrollReportTableProps) {
  const { t } = useLocale(["payrollReport", "common"]);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [employeeDetails, setEmployeeDetails] = useState<Record<string, any>>(
    {},
  );
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>(
    {},
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [employeeFilters, setEmployeeFilters] = useState<
    Record<string, string>
  >({});
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedReportPeriod, setSelectedReportPeriod] = useState<{
    start?: string;
    end?: string;
  }>({});
  const [sendingPayslip, setSendingPayslip] = useState<string | null>(null);

  const { toast } = useToast();
  const API_URL = import.meta.env.VITE_API_URL || "/api";

  // Pagination calculations
  const totalPages = Math.ceil(reports.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedReports = useMemo(() => {
    return reports.slice(startIndex, endIndex);
  }, [reports, startIndex, endIndex]);

  // Reset to page 1 when reports change
  useMemo(() => {
    setCurrentPage(1);
  }, [reports.length]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: "bg-gray-500",
      calculated: "bg-blue-500",
      approved: "bg-green-500",
      paid: "bg-emerald-600",
      cancelled: "bg-red-500",
    };

    return (
      <Badge className={`${variants[status] || "bg-gray-500"} text-white`}>
        {t(status)}
      </Badge>
    );
  };

  const getFilteredEmployees = (reportId: string) => {
    if (!employeeDetails[reportId]) return [];

    const filter = employeeFilters[reportId] || "";
    if (!filter) return employeeDetails[reportId];

    return employeeDetails[reportId].filter(
      (emp: any) =>
        emp.employeeName.toLowerCase().includes(filter.toLowerCase()) ||
        emp.department?.toLowerCase().includes(filter.toLowerCase()) ||
        emp.email?.toLowerCase().includes(filter.toLowerCase()),
    );
  };

  const getEmployeeTotals = (employees: any[]) => {
    return {
      totalHours: employees.reduce(
        (sum, e) => sum + (e.regularHours + e.overtimeHours),
        0,
      ),
      totalGross: employees.reduce((sum, e) => sum + e.grossPay, 0),
      totalDeductions: employees.reduce((sum, e) => sum + e.totalDeductions, 0),
      totalNet: employees.reduce((sum, e) => sum + e.netPay, 0),
    };
  };

  const toggleRowExpansion = async (reportId: string) => {
    const wasExpanded = expandedRows[reportId];

    setExpandedRows((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));

    // Fetch employee details if not already loaded
    if (!wasExpanded && !employeeDetails[reportId]) {
      setLoadingDetails((prev) => ({ ...prev, [reportId]: true }));

      try {
        const res = await fetch(`${API_URL}/payroll/reports/${reportId}`, {
          credentials: "include",
        });

        if (!res.ok) throw new Error("Failed to fetch employee details");

        const data = await res.json();
        setEmployeeDetails((prev) => ({
          ...prev,
          [reportId]: data.employees || [],
        }));
      } catch (error) {
        console.error("Error fetching employee details:", error);
      } finally {
        setLoadingDetails((prev) => ({ ...prev, [reportId]: false }));
      }
    }
  };

  const handlePreviewPayslip = (reportId: string, employeeId: string) => {
    const employees = employeeDetails[reportId];
    if (!employees) return;

    const employee = employees.find((e: any) => e.employeeId === employeeId);
    if (!employee) return;

    const report = reports.find((r) => r.id === reportId);
    setSelectedEmployee(employee);
    setSelectedReportPeriod({
      start: report?.periodStart,
      end: report?.periodEnd,
    });
    setPayslipModalOpen(true);
  };

  const handleSendPayslip = async (
    reportId: string,
    employeeId: string,
    employeeName: string,
  ) => {
    const employees = employeeDetails[reportId];
    if (!employees) return;

    const employee = employees.find((e: any) => e.employeeId === employeeId);
    if (!employee || !employee.email) {
      toast({
        title: t("common.error"),
        description: t("noEmail"),
        variant: "destructive",
      });
      return;
    }

    setSendingPayslip(employeeId);

    try {
      const res = await fetch(
        `${API_URL}/payroll/reports/${reportId}/send-payslip/${employeeId}`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!res.ok) throw new Error("Failed to send payslip");

      toast({
        title: t("common.success"),
        description: t("sendSuccess").replace("{name}", employeeName),
      });
    } catch (error) {
      console.error("Error sending payslip:", error);
      toast({
        title: t("common.error"),
        description: t("sendError"),
        variant: "destructive",
      });
    } finally {
      setSendingPayslip(null);
    }
  };

  if (isLoading) {
    return <SkeletonPayrollReportRows rows={8} />;
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{t("noData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scrollable Table Container */}
      <div className="max-h-[800px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {paginatedReports.map((report) => (
          <div
            key={report.id}
            className="border rounded-lg overflow-hidden bg-card"
          >
            {/* Report Row */}
            <div className="flex items-center gap-3 p-2 hover:bg-muted/50">
              {/* Expand Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleRowExpansion(report.id)}
                className="h-7 w-7 p-0 transition-all duration-200"
                aria-label={
                  expandedRows[report.id]
                    ? t("common.collapse")
                    : t("common.expand")
                }
              >
                <motion.div
                  animate={{ rotate: expandedRows[report.id] ? 90 : 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </motion.div>
              </Button>

              {/* Frequency */}
              <div className="min-w-[120px]">
                <span className="font-medium capitalize text-sm">
                  {t(report.frequency)}
                </span>
              </div>

              {/* Status */}
              <div className="min-w-[100px]">
                {getStatusBadge(report.status)}
              </div>

              {/* Employee Count */}
              <div className="flex items-center gap-2 min-w-[100px]">
                <User
                  className="h-3.5 w-3.5 text-gray-500"
                  aria-hidden="true"
                />
                <span className="font-medium text-sm">
                  {report.employeeCount}
                </span>
              </div>

              {/* Gross Pay */}
              <div className="min-w-[150px]">
                <span className="font-semibold text-sm">
                  {formatCurrency(report.totalGrossPay)}
                </span>
              </div>

              {/* Deductions */}
              <div className="min-w-[150px]">
                <span className="font-semibold text-sm text-red-600">
                  -{formatCurrency(report.totalGrossPay - report.totalNetPay)}
                </span>
              </div>

              {/* Net Pay */}
              <div className="min-w-[150px]">
                <Badge className="bg-gray-800 text-gray-50 dark:bg-gray-200 dark:text-gray-900 font-bold text-sm">
                  {formatCurrency(report.totalNetPay)}
                </Badge>
              </div>

              {/* Created Date */}
              <div className="min-w-[100px] text-xs text-muted-foreground">
                {new Date(report.createdAt).toLocaleDateString()}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSendPayslips(report.id)}
                  disabled={
                    report.status !== "approved" && report.status !== "paid"
                  }
                  aria-label={t("sendAllPayslips")}
                  title={t("sendAllPayslips")}
                  className="h-7 w-7 p-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onApprove(report.id)}
                  disabled={
                    report.status === "approved" || report.status === "paid"
                  }
                  aria-label={t("approve")}
                  title={t("approve")}
                  className="h-7 w-7 p-0"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(report.id)}
                  disabled={
                    report.status === "approved" || report.status === "paid"
                  }
                  aria-label={t("delete")}
                  title={t("delete")}
                  className="h-7 w-7 p-0"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </div>

            {/* Expanded Employee Table */}
            <AnimatePresence>
              {expandedRows[report.id] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: "hidden" }}
                  className="border-t bg-muted/30"
                >
                  {loadingDetails[report.id] ? (
                    <div className="divide-y p-2">
                      {[...Array(3)].map((_, i) => (
                        <SkeletonEmployeePayrollDetails key={i} />
                      ))}
                    </div>
                  ) : employeeDetails[report.id] &&
                    employeeDetails[report.id].length > 0 ? (
                    (() => {
                      const filteredEmployees = getFilteredEmployees(report.id);
                      const totals = getEmployeeTotals(filteredEmployees);

                      return (
                        <div>
                          <div className="border-0 bg-card overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-muted/50">
                                {/* Search Row in Header */}
                                <tr>
                                  <td
                                    colSpan={8}
                                    className="p-2 border-b bg-muted/30"
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        placeholder={
                                          t("common.search", "Search") +
                                          " " +
                                          t("employee").toLowerCase() +
                                          "..."
                                        }
                                        value={employeeFilters[report.id] || ""}
                                        onChange={(e) =>
                                          setEmployeeFilters((prev) => ({
                                            ...prev,
                                            [report.id]: e.target.value,
                                          }))
                                        }
                                        className="flex-1 px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                      />
                                      <Badge
                                        variant="outline"
                                        className="px-3 py-1"
                                      >
                                        {filteredEmployees.length}{" "}
                                        {t("employee").toLowerCase()}(s)
                                      </Badge>
                                    </div>
                                  </td>
                                </tr>
                                {/* Column Headers Row */}
                                <tr>
                                  <th className="w-10 p-2"></th>
                                  <th className="text-left p-2 font-medium text-sm">
                                    {t("employee")}
                                  </th>
                                  <th className="text-center p-2 font-medium text-sm">
                                    {t("regularHours")}
                                  </th>
                                  <th className="text-right p-2 font-medium text-sm">
                                    {t("grossPay")}
                                  </th>
                                  <th className="text-right p-2 font-medium text-sm">
                                    {t("deductions")}
                                  </th>
                                  <th className="text-right p-2 font-medium text-sm">
                                    {t("netPay")}
                                  </th>
                                  <th className="text-left p-2 font-medium text-sm">
                                    {t("common.contact", "Contact")}
                                  </th>
                                  <th className="text-center p-2 font-medium text-sm">
                                    {t("common.actions")}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredEmployees.map((employee: any) => (
                                  <EmployeeTableRow
                                    key={employee.employeeId}
                                    employee={employee}
                                    onSendPayslip={(empId, empName) =>
                                      handleSendPayslip(
                                        report.id,
                                        empId,
                                        empName,
                                      )
                                    }
                                    onPreviewPayslip={(empId) =>
                                      handlePreviewPayslip(report.id, empId)
                                    }
                                    isSending={
                                      sendingPayslip === employee.employeeId
                                    }
                                  />
                                ))}
                              </tbody>
                              <tfoot className="bg-muted/30 border-t-2">
                                <tr className="font-semibold">
                                  <td colSpan={2} className="p-2 text-right">
                                    {t("common.total", "Total")}:
                                  </td>
                                  <td className="p-2 text-center">
                                    {totals.totalHours.toFixed(1)}h
                                  </td>
                                  <td className="p-2 text-right">
                                    {formatCurrency(totals.totalGross)}
                                  </td>
                                  <td className="p-2 text-right text-red-600">
                                    -{formatCurrency(totals.totalDeductions)}
                                  </td>
                                  <td className="p-2 text-right font-bold">
                                    {formatCurrency(totals.totalNet)}
                                  </td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })() // Close IIFE
                  ) : (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      <p>{t("noEmployees")}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {t("common.showing", "Showing")} {startIndex + 1}-
            {Math.min(endIndex, reports.length)} {t("common.of", "of")}{" "}
            {reports.length} {t("common.results", "results")}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              aria-label={t("common.previousPage")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first, last, current, and neighbors
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  );
                })
                .map((page, idx, arr) => (
                  <div key={page} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== page - 1 && (
                      <span className="px-2 text-muted-foreground">...</span>
                    )}
                    <Button
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="min-w-[2.5rem]"
                    >
                      {page}
                    </Button>
                  </div>
                ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage === totalPages}
              aria-label={t("common.nextPage")}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Payslip Preview Modal */}
      <PayslipModal
        employee={selectedEmployee}
        periodStart={selectedReportPeriod.start}
        periodEnd={selectedReportPeriod.end}
        open={payslipModalOpen}
        onClose={() => setPayslipModalOpen(false)}
      />
    </div>
  );
}
