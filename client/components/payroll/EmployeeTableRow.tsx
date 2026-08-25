import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import {
  ChevronDown,
  ChevronRight,
  Send,
  FileText,
  Copy,
  MessageCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface TimeEntry {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: number;
  type: string;
  notes?: string | null;
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

interface EmployeeTableRowProps {
  employee: EmployeePayroll;
  onSendPayslip?: (employeeId: string, employeeName: string) => void;
  onPreviewPayslip?: (employeeId: string) => void;
  isSending?: boolean;
}

export function EmployeeTableRow({
  employee,
  onSendPayslip,
  onPreviewPayslip,
  isSending = false,
}: EmployeeTableRowProps) {
  const { t } = useLocale(["payrollReport", "common"]);
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [timeEntryFilter, setTimeEntryFilter] = useState("");
  const [timeEntryPage, setTimeEntryPage] = useState(1);
  const timeEntriesPerPage = 10;

  const handleCopyEmail = async () => {
    if (!employee.email) return;

    try {
      await navigator.clipboard.writeText(employee.email);
      setEmailCopied(true);
      toast({
        title: t("common.success", "Success"),
        description: t("emailCopied", "Email copied to clipboard"),
      });
      setTimeout(() => setEmailCopied(false), 2000);
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: t("copyFailed", "Failed to copy email"),
        variant: "destructive",
      });
    }
  };

  const handleOpenWhatsApp = () => {
    if (!employee.phone) return;

    // Clean phone number and format for WhatsApp
    const cleanPhone = employee.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
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
    return new Date(dateString).toLocaleDateString("es-CR");
  };

  // Filter and paginate time entries
  const getFilteredTimeEntries = () => {
    if (!employee.timeEntries) return [];

    if (!timeEntryFilter) return employee.timeEntries;

    return employee.timeEntries.filter(
      (entry) =>
        entry.type.toLowerCase().includes(timeEntryFilter.toLowerCase()) ||
        entry.notes?.toLowerCase().includes(timeEntryFilter.toLowerCase()) ||
        formatDate(entry.date).includes(timeEntryFilter),
    );
  };

  const filteredTimeEntries = getFilteredTimeEntries();
  const totalTimePages = Math.ceil(
    filteredTimeEntries.length / timeEntriesPerPage,
  );
  const startTimeIndex = (timeEntryPage - 1) * timeEntriesPerPage;
  const endTimeIndex = startTimeIndex + timeEntriesPerPage;
  const paginatedTimeEntries = filteredTimeEntries.slice(
    startTimeIndex,
    endTimeIndex,
  );

  // Calculate time entry totals
  const timeEntryTotals = {
    totalHours: filteredTimeEntries.reduce((sum, e) => sum + e.totalHours, 0),
    count: filteredTimeEntries.length,
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      work: "bg-blue-500",
      overtime: "bg-orange-500",
      vacation: "bg-green-500",
      sick_leave: "bg-red-500",
      lunch_break: "bg-gray-400",
      snack_break: "bg-gray-300",
    };

    const labels: Record<string, string> = {
      work: "Regular",
      overtime: "Overtime",
      vacation: "Vacation",
      sick_leave: "Sick",
      lunch_break: "Lunch",
      snack_break: "Snack",
    };

    return (
      <Badge
        className={`${variants[type] || "bg-gray-500"} text-white text-xs`}
      >
        {labels[type] || type}
      </Badge>
    );
  };

  return (
    <>
      {/* Employee Row */}
      <tr className="hover:bg-muted/50 border-b">
        <td className="p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-6 w-6 p-0 transition-all duration-200"
          >
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            >
              <ChevronRight className="h-4 w-4" />
            </motion.div>
          </Button>
        </td>
        <td className="p-2">
          <div>
            <p className="font-medium">{employee.employeeName}</p>
            <p className="text-xs text-muted-foreground">
              {employee.department || "—"}
            </p>
          </div>
        </td>
        <td className="p-2 text-center">
          <div>
            <p className="font-medium">{employee.regularHours.toFixed(1)}h</p>
            {employee.overtimeHours > 0 && (
              <p className="text-xs text-orange-600">
                +{employee.overtimeHours.toFixed(1)}h OT
              </p>
            )}
          </div>
        </td>
        <td className="p-2 text-right">
          <p className="font-medium">{formatCurrency(employee.grossPay)}</p>
        </td>
        <td className="p-2 text-right">
          <p className="font-medium text-red-600">
            -{formatCurrency(employee.totalDeductions)}
          </p>
        </td>
        <td className="p-2 text-right">
          <p className="font-bold">{formatCurrency(employee.netPay)}</p>
        </td>
        <td className="p-2">
          <div className="space-y-1">
            {employee.email && (
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                  {employee.email}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyEmail}
                  className="h-6 w-6 p-0"
                  title={t("common.copy", "Copy")}
                >
                  {emailCopied ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            )}
            {employee.phone && (
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">
                  {employee.phone}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenWhatsApp}
                  className="h-6 w-6 p-0"
                  title="WhatsApp"
                >
                  <MessageCircle className="h-3 w-3 text-green-600" />
                </Button>
              </div>
            )}
          </div>
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPreviewPayslip?.(employee.employeeId)}
              className="h-7 w-7 p-0"
              title={t("preview", "Preview Payslip")}
            >
              <FileText className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onSendPayslip?.(employee.employeeId, employee.employeeName)
              }
              className="h-7 w-7 p-0"
              disabled={!employee.email || isSending}
              title={t("sendPayslip", "Send Payslip")}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </td>
      </tr>

      {/* Time Entries Table (Expanded) */}
      <AnimatePresence>
        {expanded &&
          employee.timeEntries &&
          employee.timeEntries.length > 0 && (
            <tr>
              <td colSpan={8} className="p-0 bg-muted/20">
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <motion.div
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{
                      duration: 0.25,
                      ease: [0.4, 0, 0.2, 1],
                      delay: 0.05,
                    }}
                  >
                    <div>
                      {/* Scrollable Table */}
                      <div className="border-0 overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0 z-10">
                              {/* Search Row in Header */}
                              <tr>
                                <td
                                  colSpan={6}
                                  className="p-2 border-b bg-muted/30"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder={
                                        t("common.search", "Search") +
                                        " time entries..."
                                      }
                                      value={timeEntryFilter}
                                      onChange={(e) => {
                                        setTimeEntryFilter(e.target.value);
                                        setTimeEntryPage(1); // Reset to first page on filter
                                      }}
                                      className="flex-1 px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <Badge
                                      variant="outline"
                                      className="px-3 py-1"
                                    >
                                      {timeEntryTotals.count}{" "}
                                      {t("common.entries", "entries")}
                                    </Badge>
                                  </div>
                                </td>
                              </tr>
                              {/* Column Headers Row */}
                              <tr>
                                <th className="text-left p-2 font-medium">
                                  {t("common.date", "Date")}
                                </th>
                                <th className="text-left p-2 font-medium">
                                  {t("common.checkIn", "Check In")}
                                </th>
                                <th className="text-left p-2 font-medium">
                                  {t("common.checkOut", "Check Out")}
                                </th>
                                <th className="text-center p-2 font-medium">
                                  <div className="flex items-center justify-center gap-2">
                                    {t("common.hours")}
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {timeEntryTotals.totalHours.toFixed(1)}h
                                    </Badge>
                                  </div>
                                </th>
                                <th className="text-left p-2 font-medium">
                                  {t("common.type", "Type")}
                                </th>
                                <th className="text-left p-2 font-medium">
                                  {t("common.notes", "Notes")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y bg-background">
                              {paginatedTimeEntries.map((entry) => (
                                <tr
                                  key={entry.id}
                                  className="hover:bg-muted/30"
                                >
                                  <td className="p-2">
                                    {formatDate(entry.date)}
                                  </td>
                                  <td className="p-2">
                                    {formatTime(entry.checkIn)}
                                  </td>
                                  <td className="p-2">
                                    {formatTime(entry.checkOut)}
                                  </td>
                                  <td className="p-2 text-center font-medium">
                                    {entry.totalHours.toFixed(2)}h
                                  </td>
                                  <td className="p-2">
                                    {getTypeBadge(entry.type)}
                                  </td>
                                  <td className="p-2 text-muted-foreground text-xs">
                                    {entry.notes || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Pagination */}
                        {totalTimePages > 1 && (
                          <div className="flex items-center justify-between p-2 border-t bg-muted/30">
                            <div className="text-xs text-muted-foreground">
                              {t("common.showing", "Showing")}{" "}
                              {startTimeIndex + 1}-
                              {Math.min(
                                endTimeIndex,
                                filteredTimeEntries.length,
                              )}{" "}
                              {t("common.of", "of")}{" "}
                              {filteredTimeEntries.length}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setTimeEntryPage((prev) =>
                                    Math.max(1, prev - 1),
                                  )
                                }
                                disabled={timeEntryPage === 1}
                                className="h-7 px-2"
                              >
                                <ChevronRight className="h-3 w-3 rotate-180" />
                              </Button>
                              <span className="text-xs">
                                {timeEntryPage} / {totalTimePages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setTimeEntryPage((prev) =>
                                    Math.min(totalTimePages, prev + 1),
                                  )
                                }
                                disabled={timeEntryPage === totalTimePages}
                                className="h-7 px-2"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </td>
            </tr>
          )}
      </AnimatePresence>

      {/* No Time Entries Message */}
      <AnimatePresence>
        {expanded &&
          (!employee.timeEntries || employee.timeEntries.length === 0) && (
            <tr>
              <td
                colSpan={8}
                className="p-2 text-center text-sm text-muted-foreground bg-muted/20"
              >
                {t("noTimeEntries", "No time entries for this period")}
              </td>
            </tr>
          )}
      </AnimatePresence>
    </>
  );
}
