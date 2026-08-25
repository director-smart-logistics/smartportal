import { useState, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Edit, Trash2, ChevronDown, Users, DollarSign, Search, Wallet, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  costCenter: string | null;
  monthlyBudget: number | null;
  status: string;
  countryCode: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeptEmployee {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  departmentId: string | null;
  baseSalary: number;
  salaryFrequency: string;
  status: string;
}

interface FormData {
  name: string;
  code: string;
  description: string;
  costCenter: string;
  monthlyBudget: string;
  status: string;
  countryCode: string;
}

const toMonthlySalary = (salary: number, frequency: string): number => {
  switch (frequency) {
    case "hourly": return salary * 240;
    default: return salary;
  }
};

const formatCRC = (value: number) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);


export default memo(function PayrollDepartments() {
  const { t } = useLocale(["departments", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<FormData>({
    name: "",
    code: "",
    description: "",
    costCenter: "",
    monthlyBudget: "",
    status: "active",
    countryCode: "CR",
  });

  const isEditing = selectedDepartment !== null && isFormOpen;

  // Fetch departments
  const { data: departmentsResponse, isLoading } = useQuery({
    queryKey: ["departments", selectedStatus],
    queryFn: async () => {
      const filters =
        selectedStatus === "all"
          ? undefined
          : [{ field: "status", op: "==" as const, value: selectedStatus }];
      return await firestoreApi.departments.list({ filters });
    },
  });

  const departments = useMemo(
    () => ((departmentsResponse as any)?.data as Department[]) || [],
    [departmentsResponse]
  );

  // Fetch all active employees to compute dept salary totals
  const { data: employeesResponse } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () =>
      await firestoreApi.employees.list({
        filters: [{ field: "status", op: "==", value: "active" }],
      }),
  });

  const allEmployees = useMemo(
    () => ((employeesResponse as any)?.data as DeptEmployee[]) || [],
    [employeesResponse]
  );

  // Group employees by department + compute monthly cost
  const deptStats = useMemo(() => {
    const map = new Map<string, { employees: DeptEmployee[]; monthlyCost: number }>();
    allEmployees.forEach((emp) => {
      if (!emp.departmentId) return;
      const existing = map.get(emp.departmentId) ?? { employees: [], monthlyCost: 0 };
      existing.employees.push(emp);
      existing.monthlyCost += toMonthlySalary(emp.baseSalary, emp.salaryFrequency || "monthly");
      map.set(emp.departmentId, existing);
    });
    return map;
  }, [allEmployees]);

  // Global totals
  const globalTotals = useMemo(() => {
    const totalMonthlyCost = Array.from(deptStats.values()).reduce(
      (sum, s) => sum + s.monthlyCost,
      0
    );
    return { totalMonthlyCost, totalEmployees: allEmployees.length };
  }, [deptStats, allEmployees]);

  // Filtered departments
  const filteredDepartments = useMemo(() => {
    if (!searchQuery.trim()) return departments;
    const q = searchQuery.toLowerCase();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.code?.toLowerCase().includes(q) ||
        d.costCenter?.toLowerCase().includes(q)
    );
  }, [departments, searchQuery]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: FormData) =>
      await firestoreApi.departments.create({
        ...data,
        monthlyBudget: data.monthlyBudget ? parseFloat(data.monthlyBudget) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setIsFormOpen(false);
      resetForm();
      toast({ title: t("common.success"), description: t("departmentCreated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("departmentError"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) =>
      await firestoreApi.departments.update(id, {
        ...data,
        monthlyBudget: data.monthlyBudget ? parseFloat(data.monthlyBudget) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setIsFormOpen(false);
      resetForm();
      toast({ title: t("common.success"), description: t("departmentUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("departmentError"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await firestoreApi.departments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setIsDeleteDialogOpen(false);
      setSelectedDepartment(null);
      toast({ title: t("common.success"), description: t("departmentDeleted") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("departmentError"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedDepartment(null);
    setFormData({ name: "", code: "", description: "", costCenter: "", monthlyBudget: "", status: "active", countryCode: "CR" });
  };

  const handleAdd = () => { resetForm(); setIsFormOpen(true); };

  const handleEdit = (dept: Department) => {
    setSelectedDepartment(dept);
    setFormData({
      name: dept.name,
      code: dept.code || "",
      description: dept.description || "",
      costCenter: dept.costCenter || "",
      monthlyBudget: dept.monthlyBudget ? dept.monthlyBudget.toString() : "",
      status: dept.status,
      countryCode: dept.countryCode || "CR",
    });
    setIsFormOpen(true);
  };

  const handleDelete = (dept: Department) => { setSelectedDepartment(dept); setIsDeleteDialogOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && selectedDepartment) {
      updateMutation.mutate({ id: selectedDepartment.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleCard = (id: string) => setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  const isMutating = createMutation.isPending || updateMutation.isPending;


  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t("title")}</h1>
            <p className="text-xs text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>
          <Button onClick={handleAdd} data-testid="add-department-btn">
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("addDepartment")}
          </Button>
        </motion.div>

        {/* Summary Strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {[
            { icon: Building2, label: t("totalDepartments"), value: departments.length.toString(), color: "text-primary", bg: "bg-primary/10" },
            { icon: Users, label: t("totalEmployees"), value: globalTotals.totalEmployees.toString(), color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
            { icon: DollarSign, label: t("totalMonthlyCost"), value: formatCRC(globalTotals.totalMonthlyCost), color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <Card key={label} className="p-3 flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", bg)}>
                <Icon className={cn("h-4 w-4", color)} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className={cn("text-base font-bold truncate", color)}>{value}</p>
              </div>
            </Card>
          ))}
        </motion.div>

        {/* Search + Filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center gap-2 flex-wrap"
        >
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder={t("common.search") + "..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
              aria-label={t("common.search")}
            />
          </div>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-40 h-9" data-testid="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="active">{t("statusActive")}</SelectItem>
              <SelectItem value="inactive">{t("statusInactive")}</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {/* Department Cards */}
        {isLoading ? (
          <SkeletonPayrollTable rows={6} />
        ) : filteredDepartments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">{t("noDepartments")}</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {filteredDepartments.map((dept, idx) => {
              const stats = deptStats.get(dept.id);
              const headcount = stats?.employees.length ?? 0;
              const monthlyCost = stats?.monthlyCost ?? 0;
              const budget = dept.monthlyBudget ?? 0;
              const budgetPct = budget > 0 ? Math.min((monthlyCost / budget) * 100, 100) : 0;
              const isOver = budget > 0 && monthlyCost > budget;
              const isExpanded = expandedCards[dept.id] ?? false;

              return (
                <motion.div
                  key={dept.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.04, ease: [0.4, 0, 0.2, 1] }}
                >
                  <Card className="overflow-hidden border border-border hover:border-primary/30 transition-colors duration-200">
                    <div className="p-4">
                      {/* Card header row */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate leading-tight">{dept.name}</p>
                            {dept.code && <p className="text-xs text-muted-foreground font-mono">{dept.code}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Badge
                            className={cn(
                              "text-xs font-medium",
                              dept.status === "active"
                                ? "bg-emerald-600 text-white dark:bg-emerald-500"
                                : "bg-red-600 text-white dark:bg-red-500"
                            )}
                          >
                            {dept.status === "active" ? t("statusActive") : t("statusInactive")}
                          </Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(dept)} aria-label={t("editDepartment")}>
                            <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(dept)} aria-label={t("deleteDepartment")}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>

                      {/* Cost center chip */}
                      {dept.costCenter && (
                        <div className="mb-3">
                          <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md font-mono text-muted-foreground">
                            <Wallet className="h-3 w-3" aria-hidden="true" />
                            {dept.costCenter}
                          </span>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-muted/50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            <span className="text-xs text-muted-foreground">{t("employees")}</span>
                          </div>
                          <p className="text-lg font-bold text-foreground leading-none">{headcount}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            <span className="text-xs text-muted-foreground">{t("monthlyCost")}</span>
                          </div>
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 leading-none truncate">
                            {formatCRC(monthlyCost)}
                          </p>
                        </div>
                      </div>

                      {/* Budget gauge */}
                      {budget > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                              <span className="text-xs text-muted-foreground">{t("budget")}</span>
                            </div>
                            <span className={cn("text-xs font-semibold", isOver ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                              {Math.round(budgetPct)}%{isOver && " ⚠"}
                            </span>
                          </div>
                          <Progress
                            value={budgetPct}
                            className={cn("h-1.5", isOver && "[&>div]:bg-red-500")}
                            aria-label={`${t("budget")}: ${Math.round(budgetPct)}%`}
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">{formatCRC(monthlyCost)}</span>
                            <span className="text-[11px] text-muted-foreground">{formatCRC(budget)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Employee toggle */}
                    {headcount > 0 && (
                      <>
                        <button
                          onClick={() => toggleCard(dept.id)}
                          className="w-full flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 hover:bg-muted/40 transition-colors text-xs text-muted-foreground font-medium"
                          aria-expanded={isExpanded}
                        >
                          <span>{isExpanded ? t("common.collapse") : t("viewEmployees")} ({headcount})</span>
                          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </motion.div>
                        </button>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                              style={{ overflow: "hidden" }}
                            >
                              <div className="divide-y divide-border">
                                {stats?.employees.map((emp) => (
                                  <div key={emp.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {emp.firstName} {emp.lastName}
                                      </p>
                                      {emp.position && (
                                        <p className="text-xs text-muted-foreground truncate">{emp.position}</p>
                                      )}
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 ml-2 flex-shrink-0">
                                      {formatCRC(toMonthlySalary(emp.baseSalary, emp.salaryFrequency || "monthly"))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsFormOpen(open); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{isEditing ? t("editDepartment") : t("addDepartment")}</DialogTitle>
              <DialogDescription>{isEditing ? t("editDepartmentDesc") : t("addDepartmentDesc")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dept-name">{t("name")} *</Label>
                    <Input id="dept-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dept-code">{t("code")}</Label>
                    <Input id="dept-code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="OPS" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dept-description">{t("description")}</Label>
                  <Input id="dept-description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dept-costCenter">{t("costCenter")}</Label>
                    <Input id="dept-costCenter" value={formData.costCenter} onChange={(e) => setFormData({ ...formData, costCenter: e.target.value })} placeholder="CC-001" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dept-budget">{t("monthlyBudget")}</Label>
                    <Input id="dept-budget" type="number" step="1000" min="0" value={formData.monthlyBudget} onChange={(e) => setFormData({ ...formData, monthlyBudget: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="dept-status">{t("status")} *</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger id="dept-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("statusActive")}</SelectItem>
                        <SelectItem value="inactive">{t("statusInactive")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dept-country">{t("country")}</Label>
                    <Select value={formData.countryCode} onValueChange={(value) => setFormData({ ...formData, countryCode: value })}>
                      <SelectTrigger id="dept-country"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CR">Costa Rica</SelectItem>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="MX">México</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { resetForm(); setIsFormOpen(false); }}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={isMutating}>{isMutating ? t("common.saving") : t("common.save")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteDepartment")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteDepartmentConfirm", { name: selectedDepartment?.name || "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedDepartment && deleteMutation.mutate(selectedDepartment.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
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

