import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  AlertCircle,
  Edit,
  Trash2,
} from "lucide-react";
import { useCustomer, customersKeys } from "@/lib/hooks/queries/useCustomers";
import { useQueryClient } from "@tanstack/react-query";
import { usePackagesByCustomer } from "@/lib/hooks/queries/usePackages";
import { EditCustomerModal } from "@/components/customer/EditCustomerModal";
import { DeleteCustomerModal } from "@/components/customer/DeleteCustomerModal";
import { CustomerInfoGrid } from "@/components/customer/CustomerInfoGrid";
import { CustomerStats } from "@/components/customer/CustomerStats";
import { CustomerPackagesTable } from "@/components/customer/CustomerPackagesTable";
import { CustomerDetailTabs } from "@/components/customer/CustomerDetailTabs";
import { calculateCustomerStats } from "@/lib/utils/customerStats";
import type { Customer, Package } from "@/types";
import { cn } from "@/lib/utils";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLocale(['customers', 'common', 'packages']);
  const { theme } = useTheme();
  const { toast } = useToast();

  const isDark = theme === "dark";

  const queryClient = useQueryClient();
  const { data: customer, isLoading } = useCustomer(id || "");

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: customersKeys.detail(id || '') });
    };
    window.addEventListener('customer-ruta-updated', handler);
    return () => window.removeEventListener('customer-ruta-updated', handler);
  }, [queryClient, id]);
  const { data: customerPackages } = usePackagesByCustomer(id || "");
  const packages = (customerPackages as Package[]) || [];
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Calculate customer statistics
  const stats = useMemo(() => 
    calculateCustomerStats(
      packages, 
      customer?.createdAt || new Date().toISOString()
    ),
    [packages, customer?.createdAt]
  );

  const handleDelete = () => {
    if (!customer) return;
    setIsDeleteModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "inactive":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
      case "suspended":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className={cn("p-6 space-y-6", isDark ? "bg-gray-900" : "bg-white")}>
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className={cn("text-sm", isDark ? "text-gray-400" : "text-gray-600")}>
                {t("customers.detailsPage.loading")}
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!customer) {
    return (
      <DashboardLayout>
        <div className={cn("p-6 space-y-6", isDark ? "bg-gray-900" : "bg-white")}>
          <Card
            className={cn(
              "p-8 text-center",
              isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
            )}
            data-testid="customer-not-found"
          >
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className={cn("text-xl font-semibold mb-2", isDark ? "text-white" : "text-gray-900")}>
              {t("customers.detailsPage.notFound")}
            </h2>
            <p className={cn("mb-4", isDark ? "text-gray-400" : "text-gray-600")}>
              {t("customers.detailsPage.notFoundDescription")}
            </p>
            <Button onClick={() => navigate("/customers")} data-testid="btn-back-to-list">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("customers.detailsPage.backToList")}
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className={cn("p-6 space-y-6", isDark ? "bg-gray-900" : "bg-white")}>
        {/* Header with Back Button and Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/customers")}
            className={cn(
              "flex items-center gap-2 text-sm font-medium transition-colors",
              isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
            )}
            data-testid="btn-back"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </button>

          <div className="flex gap-2">
            <Button
              onClick={() => setIsEditModalOpen(true)}
              variant="outline"
              data-testid="btn-edit-customer"
            >
              <Edit className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("common.edit")}
            </Button>
            <Button
              onClick={handleDelete}
              variant="destructive"
              data-testid="btn-delete-customer"
            >
              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("common.delete")}
            </Button>
          </div>
        </div>

        {/* Customer Name and Status Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1
              className={cn("text-3xl font-bold", isDark ? "text-white" : "text-gray-900")}
              data-testid="customer-name"
            >
              {customer.fullName?.toUpperCase()}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge 
                className={getStatusColor(customer.status)}
                data-testid="customer-status"
              >
                {customer.status === "active" && t("customers.statusActive")}
                {customer.status === "inactive" && t("customers.statusInactive")}
                {customer.status === "suspended" && t("customers.statusSuspended")}
              </Badge>
              {customer.slCode && (
                <span
                  className={cn("text-sm font-mono", isDark ? "text-gray-400" : "text-gray-600")}
                  data-testid="customer-sl-code-badge"
                >
                  {customer.slCode}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Statistics Dashboard */}
        <CustomerStats stats={stats} />

        {/* Tabbed Interface */}
        <CustomerDetailTabs
          overviewContent={
            <CustomerInfoGrid customer={customer} />
          }
          packagesContent={
            <CustomerPackagesTable packages={packages} />
          }
          packagesCount={packages.length}
        />
      </div>

      {/* Edit Modal */}
      <EditCustomerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: customersKeys.detail(id || '') })}
        customer={customer}
      />

      <DeleteCustomerModal
        isOpen={isDeleteModalOpen}
        customer={customer}
        packages={packages}
        onClose={() => setIsDeleteModalOpen(false)}
        onDeleted={() => {
          setIsDeleteModalOpen(false);
          navigate("/customers");
        }}
      />
    </DashboardLayout>
  );
}
