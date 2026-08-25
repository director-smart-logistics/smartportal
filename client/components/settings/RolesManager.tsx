import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ShieldAlert, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const AVAILABLE_ROLES = ["MANAGER", "STAFF", "AGENT", "DELIVERY", "VIEWER"];
const ADMIN_ROLE = "ADMIN";

// Define the resources and their human readable names
const RESOURCES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "packages", label: "Paquetes" },
  { key: "tracking", label: "Rastreo" },
  { key: "deliveries", label: "Entregas" },
  { key: "distribution", label: "Distribución" },
  { key: "routes", label: "Rutas" },
  { key: "invoices", label: "Facturas" },
  { key: "manifests", label: "Manifiestos" },
  { key: "reconciliation", label: "Conciliación" },
  { key: "customers", label: "Clientes" },
  { key: "users", label: "Usuarios" },
  { key: "analytics", label: "Reportes/Análisis" },
  { key: "settings", label: "Configuraciones" },
  { key: "scanner", label: "Escáner" },
  { key: "calculator", label: "Calculadora" },
  { key: "payroll", label: "Nómina" },
];

const ACTIONS = [
  { key: "view", label: "Ver (Acceso)" },
  { key: "create", label: "Crear" },
  { key: "update", label: "Editar" },
  { key: "delete", label: "Eliminar" },
  { key: "manage", label: "Administrar (Total)" },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<
  string,
  Record<string, string[]>
> = {
  MANAGER: RESOURCES.reduce(
    (acc, r) => ({ ...acc, [r.key]: ["view", "create", "update", "delete"] }),
    {},
  ),
  STAFF: RESOURCES.reduce((acc, r) => {
    // Staff can view and interact with most operational things, but not manage settings/users/payroll
    if (["settings", "users", "payroll"].includes(r.key)) {
      return { ...acc, [r.key]: ["view"] };
    }
    return { ...acc, [r.key]: ["view", "create", "update"] };
  }, {}),
  AGENT: RESOURCES.reduce((acc, r) => {
    if (["dashboard", "packages", "customers", "tracking"].includes(r.key)) {
      return { ...acc, [r.key]: ["view", "create", "update"] };
    }
    return { ...acc, [r.key]: ["view"] };
  }, {}),
  DELIVERY: RESOURCES.reduce((acc, r) => {
    if (["dashboard", "deliveries", "tracking", "scanner"].includes(r.key)) {
      return { ...acc, [r.key]: ["view", "update"] };
    }
    return acc; // no access to others
  }, {}),
  VIEWER: RESOURCES.reduce((acc, r) => ({ ...acc, [r.key]: ["view"] }), {}),
};

export function RolesManager() {
  const { toast } = useToast();
  const { canManage } = usePermissions();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>("MANAGER");
  const [isSeeding, setIsSeeding] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Fetch current permissions for the selected role
  const { data: rolePermissions, isLoading } = useQuery({
    queryKey: ["permissions", selectedRole],
    queryFn: async () => {
      const doc = await firestoreApi.permissions.get(selectedRole);
      return doc || { id: selectedRole, resources: {} };
    },
  });

  const [localPermissions, setLocalPermissions] = useState<
    Record<string, string[]>
  >({});
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state when data loads
  useEffect(() => {
    if (rolePermissions && (rolePermissions as any).resources) {
      setLocalPermissions((rolePermissions as any).resources);
      setIsDirty(false);
    } else {
      setLocalPermissions({});
      setIsDirty(false);
    }
  }, [rolePermissions, selectedRole]);

  const updatePermissionMutation = useMutation({
    mutationFn: async (data: Record<string, string[]>) => {
      // Use setDoc to ensure the document ID is exactly the role name
      const docRef = doc(db, "permissions", selectedRole);
      await setDoc(
        docRef,
        {
          id: selectedRole,
          resources: data,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return { id: selectedRole, resources: data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["permissions", selectedRole],
      });
      // Also invalidate global permissions so any hook reading it updates
      queryClient.invalidateQueries({ queryKey: ["global-permissions"] });
      toast({
        title: "Permisos actualizados",
        description: `Los permisos para ${selectedRole} se guardaron exitosamente.`,
      });
      setIsDirty(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un error al guardar los permisos.",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (resource: string, action: string) => {
    setLocalPermissions((prev) => {
      const currentResourcePerms = prev[resource] || [];
      const newPerms = { ...prev };

      if (currentResourcePerms.includes(action)) {
        newPerms[resource] = currentResourcePerms.filter((a) => a !== action);
      } else {
        newPerms[resource] = [...currentResourcePerms, action];
      }

      return newPerms;
    });
    setIsDirty(true);
  };

  const handleSave = () => {
    updatePermissionMutation.mutate(localPermissions);
  };

  const executeSeed = async () => {
    setIsSeeding(true);
    setIsConfirmDialogOpen(false);
    setConfirmText("");

    setIsSeeding(true);
    try {
      const promises = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(
        async ([role, perms]) => {
          const docRef = doc(db, "permissions", role);
          return setDoc(
            docRef,
            {
              id: role,
              resources: perms,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        },
      );
      await Promise.all(promises);

      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      queryClient.invalidateQueries({ queryKey: ["global-permissions"] });
      toast({
        title: "Permisos reiniciados",
        description: "Se sembraron los permisos base para todos los roles.",
      });
      setIsDirty(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-600" />
              Gestión de Roles y Permisos
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Controla qué páginas y acciones puede ver o ejecutar cada rol.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Seleccionar Rol:</span>
            <Select
              value={selectedRole}
              onValueChange={(v) => {
                if (isDirty) {
                  if (
                    !window.confirm(
                      "Tienes cambios sin guardar. ¿Deseas cambiar de rol y perder los cambios?",
                    )
                  ) {
                    return;
                  }
                }
                setSelectedRole(v);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value={ADMIN_ROLE}
                  disabled
                  className="text-muted-foreground"
                >
                  ADMIN (Acceso Total)
                </SelectItem>
                {AVAILABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setConfirmText("");
                  setIsConfirmDialogOpen(true);
                }}
                disabled={isSeeding}
                variant="outline"
                className="border-amber-200 text-amber-700 hover:bg-amber-50"
                title="Sembrar permisos predeterminados para todos los roles"
              >
                {isSeeding ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ShieldAlert className="h-4 w-4 mr-2" />
                )}
                Reiniciar DB
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isDirty || updatePermissionMutation.isPending}
                className="bg-black text-white hover:bg-gray-800 dark:bg-yellow-500 dark:text-black dark:hover:bg-yellow-400"
              >
                {updatePermissionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg bg-card">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-semibold text-foreground">
                    Recurso / Módulo
                  </th>
                  {ACTIONS.map((action) => (
                    <th
                      key={action.key}
                      className="px-4 py-3 text-center font-semibold text-foreground"
                    >
                      {action.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {RESOURCES.map((resource) => {
                  const currentPerms = localPermissions[resource.key] || [];
                  const isAllChecked = ACTIONS.every((a) =>
                    currentPerms.includes(a.key),
                  );

                  return (
                    <tr
                      key={resource.key}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        {resource.label}
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {resource.key}
                        </code>
                      </td>
                      {ACTIONS.map((action) => (
                        <td
                          key={`${resource.key}-${action.key}`}
                          className="px-4 py-3 text-center"
                        >
                          <Switch
                            checked={currentPerms.includes(action.key)}
                            onCheckedChange={() =>
                              handleToggle(resource.key, action.key)
                            }
                            className={cn(
                              "data-[state=checked]:bg-emerald-500",
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 p-4 rounded-lg text-sm flex gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold mb-1">
            Notas importantes sobre permisos:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs opacity-90">
            <li>
              <strong>Ver (Acceso):</strong> Si esta opción está deshabilitada,
              el usuario no podrá acceder a la página correspondiente (será
              bloqueado a nivel de ruta).
            </li>
            <li>
              <strong>Crear / Editar / Eliminar:</strong> Controlan si se
              muestran los botones de acción para crear nuevos registros o
              modificar/borrar los existentes.
            </li>
            <li>
              <strong>Administrar:</strong> Otorga control total sobre
              configuraciones avanzadas del módulo (ej. acciones masivas,
              sincronizaciones).
            </li>
            <li>
              Los cambios se aplicarán <strong>inmediatamente</strong> a los
              usuarios en línea con este rol debido a la sincronización en
              tiempo real.
            </li>
          </ul>
        </div>
      </div>

      <AlertDialog
        open={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              ¿Reiniciar toda la configuración de roles?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground space-y-4 pt-2">
              <p>
                Estás a punto de sobrescribir{" "}
                <strong>todos los permisos de todos los roles</strong> y aplicar
                los valores predeterminados de fábrica.
              </p>
              <p className="font-medium">
                Esta acción es destructiva y no se puede deshacer.
              </p>
              <div className="bg-red-50 dark:bg-red-950/20 p-3 rounded border border-red-200 mt-4">
                <Label
                  htmlFor="confirm-text"
                  className="text-red-800 dark:text-red-200 mb-2 block"
                >
                  Para continuar, escribe <strong>REINICIAR</strong> en el campo
                  de abajo:
                </Label>
                <Input
                  id="confirm-text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="REINICIAR"
                  className="bg-white dark:bg-background border-red-300 focus-visible:ring-red-500"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel onClick={() => setConfirmText("")}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // Prevent default to handle logic
                if (confirmText === "REINICIAR") {
                  executeSeed();
                }
              }}
              disabled={confirmText !== "REINICIAR"}
              className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Reiniciar DB
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
