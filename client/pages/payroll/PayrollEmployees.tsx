import { useState, useMemo, memo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, User, Briefcase, Calendar, DollarSign, Edit, Trash2, ChevronDown, ChevronUp, Search, Download, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SkeletonPayrollTable } from "@/components/SkeletonLoaders";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn, safeFormatEmployeeDate } from "@/lib/utils";

interface Employee {
  id: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  hireDate: string;
  terminationDate: string | null;
  baseSalary: number;
  salaryFrequency: string;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  countryCode: string;
  status: string;
  paymentMethod: string;
  spouseDependent?: boolean;
  childrenCount?: number;
  privateInsuranceCost?: number;
  vacationAdjustedDays?: number;
  deductions?: any[];
  swag?: any[];
  unpaidLeaves?: any[];
  bankAccount: string | null;
  bankName: string | null;
  weeklySalary?: number;
  hourlyRate?: number;
}

const toCycleSalary = (monthlySalary: number, frequency: string): number => {
  if (frequency === "weekly") return monthlySalary / 4.33;
  if (frequency === "biweekly") return monthlySalary / 2;
  if (frequency === "daily") return monthlySalary / 30;
  return monthlySalary;
};

const PayrollEmployees = memo(function PayrollEmployees() {
  const { t } = useLocale(['employees', 'common', 'payrollReport']);
  const { toast } = useToast();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<string>("active");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [hireDateOpen, setHireDateOpen] = useState(false);
  const pageSize = 15;
  const [formData, setFormData] = useState({
    idNumber: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    hireDate: new Date().toISOString().split("T")[0],
    baseSalary: "",
    salaryFrequency: "monthly",
    departmentId: "",
    position: "",
    countryCode: "CR",
    status: "active",
    paymentMethod: "bank_transfer",
    bankAccount: "",
    bankName: "",
    spouseDependent: false,
    childrenCount: "0",
    privateInsuranceCost: "0",
    vacationAdjustedDays: "0",
  });

  // Fetch departments
  const { data: departmentsResponse } = useQuery({
    queryKey: ['departments-active'],
    queryFn: async () => {
      const result = await firestoreApi.departments.list({
        filters: [{ field: 'status', op: '==', value: 'active' }]
      });
      return result;
    },
  });

  const departments = useMemo(() => {
    return ((departmentsResponse as any)?.data as any[]) || [];
  }, [departmentsResponse]);

  // Fetch employees
  const { data: employeesResponse, isLoading } = useQuery({
    queryKey: ['employees', selectedStatus],
    queryFn: async () => {
      const filters = selectedStatus === 'all' 
        ? undefined 
        : [{ field: 'status', op: '==' as const, value: selectedStatus }];
      const result = await firestoreApi.employees.list({ filters });
      return result;
    },
  });

  const employees = useMemo(() => {
    return ((employeesResponse as any)?.data as Employee[]) || [];
  }, [employeesResponse]);

  // Create employee mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const dept = departments.find(d => d.id === data.departmentId);
      const baseSalaryVal = parseFloat(data.baseSalary);
      const isHourly = data.salaryFrequency === "hourly";
      const isWeekly = data.salaryFrequency === "weekly";
      const hourlyRate = isHourly
        ? baseSalaryVal
        : isWeekly
          ? (baseSalaryVal / 4.33) / 48
          : baseSalaryVal / 240;
      const weeklySalary = isHourly
        ? baseSalaryVal * 48
        : baseSalaryVal / 4.33;

      return await firestoreApi.employees.create({
        ...data,
        baseSalary: baseSalaryVal,
        hourlyRate,
        weeklySalary,
        hireDate: data.hireDate ? new Date(data.hireDate + "T12:00:00").toISOString() : new Date().toISOString(),
        departmentId: data.departmentId === "__none__" || !data.departmentId ? null : data.departmentId,
        departmentName: data.departmentId === "__none__" || !data.departmentId ? null : (dept ? dept.name : null),
        spouseDependent: data.spouseDependent,
        childrenCount: parseInt(data.childrenCount || "0", 10),
        privateInsuranceCost: parseFloat(data.privateInsuranceCost || "0"),
        vacationAdjustedDays: parseFloat(data.vacationAdjustedDays || "0"),
        deductions: [],
        swag: [],
        unpaidLeaves: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['employees'],
        refetchType: 'all'
      });
      setIsAddDialogOpen(false);
      resetForm();
      toast({
        title: t("common.success"),
        description: t("employeeCreated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("common.errorOccurred"),
        variant: "destructive",
      });
    },
  });

  // Update employee mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const dept = departments.find(d => d.id === data.departmentId);
      const baseSalaryVal = parseFloat(data.baseSalary);
      const isHourly = data.salaryFrequency === "hourly";
      const isWeekly = data.salaryFrequency === "weekly";
      const hourlyRate = isHourly
        ? baseSalaryVal
        : isWeekly
          ? (baseSalaryVal / 4.33) / 48
          : baseSalaryVal / 240;
      const weeklySalary = isHourly
        ? baseSalaryVal * 48
        : baseSalaryVal / 4.33;

      return await firestoreApi.employees.update(id, {
        ...data,
        baseSalary: baseSalaryVal,
        hourlyRate,
        weeklySalary,
        hireDate: data.hireDate ? new Date(data.hireDate + "T12:00:00").toISOString() : new Date().toISOString(),
        departmentId: data.departmentId === "__none__" || !data.departmentId ? null : data.departmentId,
        departmentName: data.departmentId === "__none__" || !data.departmentId ? null : (dept ? dept.name : null),
        spouseDependent: data.spouseDependent,
        childrenCount: parseInt(data.childrenCount || "0", 10),
        privateInsuranceCost: parseFloat(data.privateInsuranceCost || "0"),
        vacationAdjustedDays: parseFloat(data.vacationAdjustedDays || "0"),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['employees'],
        refetchType: 'all'
      });
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
      toast({
        title: t("common.success"),
        description: t("employeeUpdated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("common.errorOccurred"),
        variant: "destructive",
      });
    },
  });

  // Delete employee mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await firestoreApi.employees.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['employees'],
        refetchType: 'all'
      });
      setIsDeleteDialogOpen(false);
      setSelectedEmployee(null);
      toast({
        title: t("common.success"),
        description: t("employeeDeleted"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("common.errorOccurred"),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      idNumber: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      hireDate: new Date().toISOString().split("T")[0],
      baseSalary: "",
      salaryFrequency: "monthly",
      departmentId: "__none__",
      position: "",
      countryCode: "CR",
      status: "active",
      paymentMethod: "bank_transfer",
      bankAccount: "",
      bankName: "",
      spouseDependent: false,
      childrenCount: "0",
      privateInsuranceCost: "0",
      vacationAdjustedDays: "0",
    });
  };

  const handleAddEmployee = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setFormData({
      idNumber: employee.idNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email || "",
      phone: employee.phone || "",
      hireDate: employee.hireDate ? (employee.hireDate.includes("T") ? employee.hireDate.split("T")[0] : employee.hireDate) : new Date().toISOString().split("T")[0],
      baseSalary: employee.baseSalary.toString(),
      salaryFrequency: employee.salaryFrequency || "monthly",
      departmentId: employee.departmentId || "__none__",
      position: employee.position || "",
      countryCode: employee.countryCode,
      status: employee.status,
      paymentMethod: employee.paymentMethod,
      bankAccount: employee.bankAccount || "",
      bankName: employee.bankName || "",
      spouseDependent: !!employee.spouseDependent,
      childrenCount: (employee.childrenCount ?? 0).toString(),
      privateInsuranceCost: (employee.privateInsuranceCost ?? 0).toString(),
      vacationAdjustedDays: (employee.vacationAdjustedDays ?? 0).toString(),
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate IBAN for bank transfer
    if (formData.paymentMethod === "bank_transfer") {
      const ibanClean = formData.bankAccount.replace(/[-\s]/g, "").toUpperCase();
      if (!/^CR\d{20}$/.test(ibanClean)) {
        toast({
          title: t("common.error"),
          description: "La cuenta bancaria debe ser un IBAN de Costa Rica válido (22 caracteres, iniciando con CR y sin guiones).",
          variant: "destructive",
        });
        return;
      }
    }

    if (isEditDialogOpen && selectedEmployee) {
      updateMutation.mutate({ id: selectedEmployee.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-600 text-white dark:bg-green-500";
      case "inactive":
        return "bg-red-600 text-white dark:bg-red-500";
      case "suspended":
        return "bg-yellow-600 text-white dark:bg-yellow-500";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const formatCurrency = (value: number, countryCode: string) => {
    const currencyMap: Record<string, { locale: string; currency: string }> = {
      CR: { locale: "es-CR", currency: "CRC" },
      US: { locale: "en-US", currency: "USD" },
      MX: { locale: "es-MX", currency: "MXN" },
    };

    const config = currencyMap[countryCode] || currencyMap.US;
    
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatHourlyCurrency = (value: number, countryCode: string) => {
    const currencyMap: Record<string, { locale: string; currency: string }> = {
      CR: { locale: "es-CR", currency: "CRC" },
      US: { locale: "en-US", currency: "USD" },
      MX: { locale: "es-MX", currency: "MXN" },
    };

    const config = currencyMap[countryCode] || currencyMap.US;
    
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency: config.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getCountryName = (countryCode: string) => {
    const countryMap: Record<string, string> = {
      CR: "Costa Rica",
      US: "United States",
      MX: "Mexico",
    };
    return countryMap[countryCode] || countryCode;
  };

  const toggleRowExpanded = (employeeId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId],
    }));
  };

  // Filter and paginate employees
  const filteredEmployees = useMemo(() => {
    if (!searchQuery) return employees;
    const lowerQuery = searchQuery.toLowerCase();
    return employees.filter((emp) =>
      emp.firstName.toLowerCase().includes(lowerQuery) ||
      emp.lastName.toLowerCase().includes(lowerQuery) ||
      emp.idNumber.toLowerCase().includes(lowerQuery)
    );
  }, [employees, searchQuery]);

  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(startIdx, startIdx + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const handleExport = (data: Employee[]) => {
    const csv = [
      [
        t("idNumber"),
        t("firstName"),
        t("lastName"),
        t("country"),
        t("position"),
        t("hireDate"),
        t("baseSalary"),
        t("common.status"),
      ],
      ...data.map((emp) => [
        emp.idNumber,
        emp.firstName,
        emp.lastName,
        getCountryName(emp.countryCode),
        emp.position || "-",
        safeFormatEmployeeDate(emp.hireDate),
        emp.baseSalary.toString(),
        t(`status.${emp.status}`),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees-report.csv";
    a.click();
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {t("subtitle")}
            </p>
          </div>
          <PermissionTooltip allowed={canCreate('payroll')} message="No tienes permiso para añadir empleados">
            <Button onClick={handleAddEmployee} data-testid="add-employee-btn" disabled={!canCreate('payroll')}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("addEmployee")}
            </Button>
          </PermissionTooltip>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card className="p-2 md:p-3">
          {/* Search and Filter Bar */}
          <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("common.search") + "..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9"
              />
            </div>
            
            {/* Filters and Export - Right Side */}
            <div className="flex items-center gap-2">
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Label htmlFor="status-filter" className="whitespace-nowrap">
                  {t("filterStatus")}
                </Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger id="status-filter" data-testid="status-filter" className="w-48">
                    <SelectValue>
                      {selectedStatus === "all" 
                        ? t("allStatuses")
                        : selectedStatus === "active" ? t("statusActive") 
                        : selectedStatus === "inactive" ? t("statusInactive") 
                        : t("statusSuspended")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStatuses")}</SelectItem>
                    <SelectItem value="active">{t("statusActive")}</SelectItem>
                    <SelectItem value="inactive">{t("statusInactive")}</SelectItem>
                    <SelectItem value="suspended">{t("statusSuspended")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Export Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport(filteredEmployees)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {t("common.export")}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <SkeletonPayrollTable rows={10} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 p-2"></TableHead>
                      <TableHead className="p-2">{t("idNumber")}</TableHead>
                      <TableHead className="p-2">{t("fullName")}</TableHead>
                      <TableHead className="p-2 hidden md:table-cell">{t("department")}</TableHead>
                      <TableHead className="p-2 hidden lg:table-cell">{t("baseSalary")}</TableHead>
                      <TableHead className="p-2 hidden sm:table-cell">{t("country")}</TableHead>
                      <TableHead className="p-2 hidden xl:table-cell">{t("hireDate")}</TableHead>
                      <TableHead className="p-2">{t("common.status")}</TableHead>
                      <TableHead className="text-right p-2">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-4 p-2">
                          <p className="text-muted-foreground">{t("noEmployees")}</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedEmployees.map((employee) => (
                        <Fragment key={employee.id}>
                          <TableRow className="hover:bg-muted/50">
                            <TableCell className="p-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 transition-all duration-200"
                                onClick={() => toggleRowExpanded(employee.id)}
                                aria-label={
                                  expandedRows[employee.id]
                                    ? t("common.collapse")
                                    : t("common.expand")
                                }
                              >
                                <motion.div
                                  animate={{ rotate: expandedRows[employee.id] ? 180 : 0 }}
                                  transition={{ duration: 0.2, ease: "easeInOut" }}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </motion.div>
                              </Button>
                            </TableCell>
                            <TableCell className="p-2">
                              <span className="text-sm font-mono">{employee.idNumber}</span>
                            </TableCell>
                            <TableCell className="p-2">
                              <div className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                                <span className="font-medium text-sm">
                                  {employee.firstName} {employee.lastName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="p-2 hidden md:table-cell">
                              {employee.departmentName ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium truncate max-w-[120px]">
                                  {employee.departmentName}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="p-2 hidden lg:table-cell">
                              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(employee.baseSalary, employee.countryCode)}
                                <span className="text-xs text-muted-foreground ml-1 font-normal">
                                  / {t("payrollReport.monthly").toLowerCase()}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="p-2 hidden sm:table-cell">
                              <Badge variant="outline" className="text-xs font-medium">
                                {employee.countryCode}
                              </Badge>
                            </TableCell>
                            <TableCell className="p-2 hidden xl:table-cell">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                                <span className="text-sm">
                                  {safeFormatEmployeeDate(employee.hireDate)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="p-2">
                              <Badge
                                className={`${getStatusColor(employee.status)} font-semibold`}
                                data-testid={`employee-status-${employee.status}`}
                              >
                                {t(`status.${employee.status}`)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right p-2">
                              <div className="flex items-center justify-end gap-1.5">
                                <PermissionTooltip allowed={canUpdate('payroll')} message="Sin permiso de edición">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={!canUpdate('payroll')}
                                    onClick={() => handleEditEmployee(employee)}
                                    data-testid={`edit-employee-${employee.id}`}
                                    aria-label={t("common.edit")}
                                    className="h-7 w-7"
                                  >
                                    <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                                  </Button>
                                </PermissionTooltip>
                                <PermissionTooltip allowed={canDelete('payroll')} message="Sin permiso para eliminar">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={!canDelete('payroll')}
                                    onClick={() => handleDeleteEmployee(employee)}
                                    data-testid={`delete-employee-${employee.id}`}
                                    aria-label={t("common.delete")}
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  </Button>
                                </PermissionTooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                          <AnimatePresence>
                            {expandedRows[employee.id] && (
                              <TableRow className="bg-muted/30">
                                <TableCell colSpan={9} className="p-0">
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
                                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
                                      className="p-2 border-t border-gray-200"
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase">
                                            {t("department")}
                                          </p>
                                          <div className="flex items-center gap-1.5">
                                            <Briefcase className="h-3.5 w-3.5 text-gray-500" />
                                            <span className="text-sm font-medium">
                                              {employee.departmentName || t("noDepartment")}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase">
                                            {t("position")}
                                          </p>
                                          <div className="flex items-center gap-1.5">
                                            <Briefcase className="h-3.5 w-3.5 text-gray-500" />
                                            <span className="text-sm font-medium">
                                              {employee.position || "-"}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase">
                                            {employee.salaryFrequency === "weekly"
                                              ? "Salario Semanal"
                                              : employee.salaryFrequency === "biweekly"
                                                ? "Salario Quincenal"
                                                : employee.salaryFrequency === "daily"
                                                  ? "Salario Diario"
                                                  : t("baseSalary")}
                                          </p>
                                          <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-sm font-medium">
                                                {formatCurrency(
                                                  toCycleSalary(employee.baseSalary, employee.salaryFrequency || "monthly"),
                                                  employee.countryCode
                                                )}
                                                <span className="text-xs text-muted-foreground ml-1 font-normal">
                                                  / {employee.salaryFrequency ? t(`payrollReport.${employee.salaryFrequency}`).toLowerCase() : t("payrollReport.monthly").toLowerCase()}
                                                </span>
                                              </span>
                                            </div>
                                            <div>
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 select-none">
                                                {employee.salaryFrequency === "hourly"
                                                  ? "Fórmula: Salario directo"
                                                  : employee.salaryFrequency === "weekly"
                                                    ? "Fórmula: Base / 4.33"
                                                    : employee.salaryFrequency === "biweekly"
                                                      ? "Fórmula: Base / 2"
                                                      : employee.salaryFrequency === "daily"
                                                        ? "Fórmula: Base / 30"
                                                        : "Fórmula: Salario base bruto"}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase">
                                            {t("payrollReport.hourly")}
                                          </p>
                                          <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                                                {formatHourlyCurrency(
                                                  employee.salaryFrequency === "hourly"
                                                    ? employee.baseSalary
                                                    : employee.salaryFrequency === "weekly"
                                                      ? (employee.baseSalary / 4.33) / 48
                                                      : employee.baseSalary / 240,
                                                  employee.countryCode
                                                )}
                                                <span className="text-xs text-muted-foreground ml-1 font-normal">
                                                  / {t("payrollReport.hourly").toLowerCase()}
                                                </span>
                                              </span>
                                            </div>
                                            <div>
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 select-none">
                                                {employee.salaryFrequency === "hourly"
                                                  ? "Fórmula: Salario directo"
                                                  : employee.salaryFrequency === "weekly"
                                                    ? "Fórmula: (Base / 4.33) / 48"
                                                    : "Fórmula: Base / 240"}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </motion.div>
                                  </motion.div>
                                </TableCell>
                              </TableRow>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {t("common.showing")} {(currentPage - 1) * pageSize + 1} {t("common.to")}{" "}
                    {Math.min(currentPage * pageSize, filteredEmployees.length)} {t("common.of")}{" "}
                    {filteredEmployees.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      {t("common.previousPage")}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {t("common.page")} {currentPage} {t("common.of")} {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      {t("common.nextPage")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </Card>
        </motion.div>

        {/* Add/Edit Employee Dialog */}
        <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          setIsEditDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" data-testid="employee-dialog">
            <DialogHeader>
              <DialogTitle>
                {isEditDialogOpen ? t("editEmployee") : t("addEmployee")}
              </DialogTitle>
              <DialogDescription>
                {isEditDialogOpen
                  ? t("editEmployeeDesc")
                  : t("addEmployeeDesc")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="idNumber">
                      {t("idNumber")} *
                    </Label>
                    <Input
                      id="idNumber"
                      value={formData.idNumber}
                      onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                      data-testid="idNumber-input"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="countryCode">
                      {t("country")} *
                    </Label>
                    <Select
                      value={formData.countryCode}
                      onValueChange={(value) => setFormData({ ...formData, countryCode: value })}
                    >
                      <SelectTrigger id="countryCode" data-testid="countryCode-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CR">Costa Rica (CR)</SelectItem>
                        <SelectItem value="US">United States (US)</SelectItem>
                        <SelectItem value="MX">Mexico (MX)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">
                      {t("firstName")} *
                    </Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      data-testid="firstName-input"
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="lastName">
                      {t("lastName")} *
                    </Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      data-testid="lastName-input"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">
                      {t("email")}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid="email-input"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="phone">
                      {t("phone")}
                    </Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid="phone-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="hireDate">
                      {t("hireDate")} *
                    </Label>
                    <Popover open={hireDateOpen} onOpenChange={setHireDateOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          id="hireDate"
                          variant="outline"
                          type="button"
                          className={cn(
                            "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                            !formData.hireDate && "text-muted-foreground"
                          )}
                          data-testid="hireDate-input"
                        >
                          <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {formData.hireDate
                              ? format(new Date(formData.hireDate + "T12:00:00"), "PPP", {
                                  locale: es,
                                })
                              : "Seleccionar fecha"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="z-[80] w-auto p-0" 
                        align="start"
                        style={{ pointerEvents: "auto" }}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <CalendarComponent
                          mode="single"
                          selected={formData.hireDate ? new Date(formData.hireDate + "T12:00:00") : undefined}
                          onSelect={(date) => {
                            if (!date) return;
                            setFormData({
                              ...formData,
                              hireDate: format(date, "yyyy-MM-dd"),
                            });
                            setHireDateOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="baseSalary">
                      {t("baseSalary")} *
                    </Label>
                    <Input
                      id="baseSalary"
                      type="number"
                      step="0.01"
                      value={formData.baseSalary}
                      onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                      data-testid="baseSalary-input"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="salaryFrequency">
                      {t("payrollReport.frequency")} *
                    </Label>
                    <Select
                      value={formData.salaryFrequency}
                      onValueChange={(value) => setFormData({ ...formData, salaryFrequency: value })}
                    >
                      <SelectTrigger id="salaryFrequency" data-testid="salaryFrequency-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">{t("payrollReport.weekly")}</SelectItem>
                        <SelectItem value="biweekly">{t("payrollReport.biweekly")}</SelectItem>
                        <SelectItem value="monthly">{t("payrollReport.monthly")}</SelectItem>
                        <SelectItem value="contract">{t("payrollReport.contract")}</SelectItem>
                        <SelectItem value="hourly">{t("payrollReport.hourly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="position">
                      {t("position")}
                    </Label>
                    <Input
                      id="position"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      data-testid="position-input"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="departmentId">
                      {t("department")}
                    </Label>
                    <Select
                      value={formData.departmentId}
                      onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                    >
                      <SelectTrigger id="departmentId" data-testid="departmentId-select">
                        <SelectValue>
                          {formData.departmentId && formData.departmentId !== "__none__"
                            ? departments.find((d: any) => d.id === formData.departmentId)?.name || ""
                            : t("selectDepartment")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("noDepartment")}</SelectItem>
                        {departments.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name} {dept.code && `(${dept.code})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="status">
                      {t("common.status")} *
                    </Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger id="status" data-testid="status-select">
                        <SelectValue>
                          {formData.status === "active" ? t("statusActive") 
                          : formData.status === "inactive" ? t("statusInactive") 
                          : t("statusSuspended")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("statusActive")}</SelectItem>
                        <SelectItem value="inactive">{t("statusInactive")}</SelectItem>
                        <SelectItem value="suspended">{t("statusSuspended")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="paymentMethod">
                      {t("paymentMethodLabel")} *
                    </Label>
                    <Select
                      value={formData.paymentMethod}
                      onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                    >
                      <SelectTrigger id="paymentMethod" data-testid="paymentMethod-select">
                        <SelectValue>
                          {formData.paymentMethod === "bank_transfer" 
                            ? t("paymentMethods.bank")
                            : formData.paymentMethod === "cash"
                            ? t("paymentMethods.cash")
                            : formData.paymentMethod === "check"
                            ? t("paymentMethods.check")
                            : t("paymentMethodLabel")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">{t("paymentMethods.bank")}</SelectItem>
                        <SelectItem value="cash">{t("paymentMethods.cash")}</SelectItem>
                        <SelectItem value="check">{t("paymentMethods.check")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.paymentMethod === "bank_transfer" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="bankName">
                        {t("bankName")}
                      </Label>
                      <Input
                        id="bankName"
                        value={formData.bankName}
                        onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                        data-testid="bankName-input"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="bankAccount">
                        {t("bankAccount")}
                      </Label>
                      <Input
                        id="bankAccount"
                        value={formData.bankAccount}
                        onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                        data-testid="bankAccount-input"
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-4 mt-2">
                  <h4 className="text-sm font-semibold text-foreground mb-3">
                    Datos de Renta y Planilla (Costa Rica)
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="spouseDependent">
                        {t("spouseDependent")}
                      </Label>
                      <Select
                        value={formData.spouseDependent ? "true" : "false"}
                        onValueChange={(value) => setFormData({ ...formData, spouseDependent: value === "true" })}
                      >
                        <SelectTrigger id="spouseDependent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">{t("common.yes") || "Sí"}</SelectItem>
                          <SelectItem value="false">{t("common.no") || "No"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="childrenCount">
                        {t("childrenCount")}
                      </Label>
                      <Input
                        id="childrenCount"
                        type="number"
                        min="0"
                        value={formData.childrenCount}
                        onChange={(e) => setFormData({ ...formData, childrenCount: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="grid gap-2">
                      <Label htmlFor="privateInsuranceCost">
                        {t("privateInsuranceCost")}
                      </Label>
                      <Input
                        id="privateInsuranceCost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.privateInsuranceCost}
                        onChange={(e) => setFormData({ ...formData, privateInsuranceCost: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="vacationAdjustedDays">
                        {t("vacationAdjustedDays")}
                      </Label>
                      <Input
                        id="vacationAdjustedDays"
                        type="number"
                        step="0.1"
                        value={formData.vacationAdjustedDays}
                        onChange={(e) => setFormData({ ...formData, vacationAdjustedDays: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setIsEditDialogOpen(false);
                  }}
                  data-testid="cancel-employee-btn"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="submit-employee-btn"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? t("common.saving") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent data-testid="delete-employee-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteEmployee")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteEmployeeConfirm", {
                  name: selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : ""
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="cancel-delete-btn">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedEmployee && deleteMutation.mutate(selectedEmployee.id)}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="confirm-delete-btn"
              >
                {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </DashboardLayout>
  );
});

export default PayrollEmployees;
