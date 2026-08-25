import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/data-grid/DataGrid";
import { Plus, Eye, Edit, Trash2, Shield, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import type { UserRole } from "@/types";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import { useUsers, useDeleteUser, useDeletePendingRegistration } from "@/lib/hooks/queries/useUsers";
import { useMemo, useState, memo } from "react";
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
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  createdAt: string;
  status: "active" | "inactive" | "suspended" | "pending_invitation";
  isPending?: boolean;
}

const Users = memo(function Users() {
  const { user: currentUser } = useAuth();
  const { canCreate, canUpdate, canDelete, canManage } = usePermissions();
  const { t } = useLocale(['users', 'common']);
  const { data, isLoading } = useUsers();
  const deleteUserMutation = useDeleteUser();
  const deletePendingMutation = useDeletePendingRegistration();
  const { toast } = useToast();
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  
  const usersData = useMemo(() => {
    const list = data || [];
    return list.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role as UserRole,
      phone: u.phone,
      createdAt: u.createdAt,
      status: (u.status as User["status"]) || "active",
      isPending: u.isPending,
    }));
  }, [data]);

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      if (userToDelete.isPending) {
        await deletePendingMutation.mutateAsync(userToDelete.email);
      } else {
        await deleteUserMutation.mutateAsync(userToDelete.id);
      }
      toast({
        title: userToDelete.isPending ? t("invitationCanceled") : t("userDeleted"),
        variant: "default",
      });
      setUserToDelete(null);
    } catch (error) {
      toast({
        title: t("deleteError"),
        description: error instanceof Error ? error.message : t("unknownError"),
        variant: "destructive",
      });
    }
  };

  const getRoleBgColor = (role: UserRole) => {
    switch (role) {
      case "ADMIN":
        return "bg-gray-900 text-gray-50 dark:bg-gray-100 dark:text-gray-900";
      case "MANAGER":
        return "bg-gray-700 text-gray-50 dark:bg-gray-300 dark:text-gray-900";
      case "STAFF":
        return "bg-gray-600 text-gray-50 dark:bg-gray-400 dark:text-gray-900";
      case "AGENT":
        return "bg-gray-500 text-gray-50 dark:bg-gray-500 dark:text-gray-50";
      case "DELIVERY":
        return "bg-gray-400 text-gray-900 dark:bg-gray-600 dark:text-gray-50";
      default:
        return "bg-gray-300 text-gray-900 dark:bg-gray-700 dark:text-gray-50";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-gray-800 text-gray-50 dark:bg-gray-200 dark:text-gray-900";
      case "inactive":
        return "bg-gray-400 text-gray-900 dark:bg-gray-600 dark:text-gray-50";
      case "suspended":
        return "bg-gray-900 text-gray-50 dark:bg-gray-100 dark:text-gray-900";
      case "pending_invitation":
        return "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300";
      default:
        return "bg-gray-300 text-gray-900 dark:bg-gray-700 dark:text-gray-50";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return t("active");
      case "inactive":
        return t("inactive");
      case "suspended":
        return t("suspended");
      case "pending_invitation":
        return t("pendingInvitation") || "Invitación Pendiente";
      default:
        return status;
    }
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case "ADMIN":
        return t("admin");
      case "MANAGER":
        return t("manager");
      case "STAFF":
        return t("staff");
      case "AGENT":
        return t("agent");
      case "DELIVERY":
        return t("delivery");
      default:
        return role;
    }
  };

  const columns: DataGridColumn<User>[] = [
    {
      key: "fullName",
      label: t("fullName"),
      sortable: true,
      filterable: true,
      render: (value, row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-sm">{value}</span>
          <span className="text-xs text-muted-foreground">{row.email}</span>
        </div>
      ),
    },
    {
      key: "role",
      label: t("role"),
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-500" aria-hidden="true" />
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBgColor(value)}`}
            data-testid={`user-role-${value}`}
          >
            {getRoleLabel(value)}
          </span>
        </div>
      ),
    },
    {
      key: "phone",
      label: t("phone"),
      sortable: true,
    },
    {
      key: "status",
      label: t("status"),
      sortable: true,
      render: (value) => (
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(value)}`}
          data-testid={`user-status-${value}`}
        >
          {getStatusLabel(value)}
        </span>
      ),
    },
    {
      key: "createdAt",
      label: t("createdAt"),
      sortable: true,
    },
    {
      key: "id",
      label: t("actions"),
      render: (_, row) => (
        <div className="flex gap-2">
          {!row.isPending && (
            <Link to={`/users/${row.id}`}>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`view-user-${row.id}`}
                title={t("viewDetails")}
                aria-label={`${t("viewDetails")} ${row.fullName}`}
              >
                <Eye className="h-4 w-4 text-gray-600" />
              </Button>
            </Link>
          )}
          
          {!row.isPending && (
            <PermissionTooltip allowed={canUpdate('users')} message="No tienes permiso para editar usuarios">
              <Link to={`/users/${row.id}/edit`} className={!canUpdate('users') ? 'pointer-events-none' : ''}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canUpdate('users')}
                  data-testid={`edit-user-${row.id}`}
                  title={t("editUser")}
                  aria-label={`${t("editUser")} ${row.fullName}`}
                >
                  <Edit className="h-4 w-4 text-gray-600" />
                </Button>
              </Link>
            </PermissionTooltip>
          )}
          
          <PermissionTooltip allowed={canDelete('users')} message="No tienes permiso para eliminar usuarios">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canDelete('users')}
              data-testid={`delete-user-${row.id}`}
              className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-100"
              title={row.isPending ? (t("cancelInvitation") || "Cancelar invitación") : t("deleteUser")}
              aria-label={`${row.isPending ? (t("cancelInvitation") || "Cancelar invitación") : t("deleteUser")} ${row.fullName}`}
              onClick={() => handleDeleteClick(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </PermissionTooltip>
        </div>
      ),
    },
  ];

  const handleExport = (data: User[]) => {
    const csv = [
      [
        t("exportHeaders.fullName"),
        t("exportHeaders.email"),
        t("exportHeaders.role"),
        t("exportHeaders.phone"),
        t("exportHeaders.status"),
        t("exportHeaders.createdAt"),
      ],
      ...data.map((u) => [
        u.fullName,
        u.email,
        u.role,
        u.phone || "-",
        u.status,
        u.createdAt,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
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
              {t("manage")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {t("subtitle")}
            </p>
          </div>
          <PermissionTooltip allowed={canCreate('users')} message="No tienes permiso para crear usuarios">
            <Button asChild data-testid="create-user-btn" disabled={!canCreate('users')}>
              <Link to={canCreate('users') ? "/users/create" : "#"}>
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("addUser")}
              </Link>
            </Button>
          </PermissionTooltip>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
        >
          <DataGrid<User>
          columns={columns}
          data={usersData}
          pageSize={10}
          searchableFields={["fullName", "email"]}
          onExport={handleExport}
          emptyMessage={t("noUsers")}
          loading={isLoading}
        />
        </motion.div>
      </motion.div>

      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent data-testid="delete-user-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-gray-600" aria-hidden="true" />
              {userToDelete?.isPending ? (t("cancelInvitation") || "Cancelar Invitación") : t("deleteUser")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{userToDelete?.isPending ? (t("confirmCancelInvitation") || "Esta acción cancelará la invitación pendiente. El usuario no podrá acceder al portal.") : t("confirmDelete")}</p>
                {userToDelete && (
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {userToDelete.fullName} ({userToDelete.email})
                  </p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("deleteWarning")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="delete-user-cancel"
              disabled={deleteUserMutation.isPending || deletePendingMutation.isPending}
            >
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="delete-user-confirm"
              onClick={handleDeleteConfirm}
              disabled={deleteUserMutation.isPending || deletePendingMutation.isPending}
              className="bg-gray-900 text-gray-50 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {(deleteUserMutation.isPending || deletePendingMutation.isPending)
                ? t("common.loading")
                : userToDelete?.isPending
                  ? (t("cancelInvitation") || "Cancelar Invitación")
                  : t("deleteUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
});

export default Users;
