import React, { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { logAction } from "@/lib/services/audit-service";
import { useInvoicesCursor, useRestoreInvoice, usePermanentlyDeleteInvoice } from "@/lib/hooks/queries/useInvoices";
import { PermanentDeleteInvoiceDialog } from "@/components/invoice/PermanentDeleteInvoiceDialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  RotateCcw,
  Search,
  FileText,
  Trash2,
  User,
  Calendar,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";

interface DeletedInvoice {
  id: string;
  invoiceNumber: string;
  clientName?: string;
  slCode?: string;
  clientSlCode?: string;
  totalAmount?: number;
  deletedAt?: any;
  deletedBy?: string;
  deletedByName?: string;
  deletedInvoiceNumber?: string;
  manifestNumber?: string;
  status: string;
  customer?: { fullName?: string; slCode?: string };
  [key: string]: any;
}

const InvoiceRecovery = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<DeletedInvoice | null>(null);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);
  const [bulkDeletePrompt, setBulkDeletePrompt] = useState<{ type: 'selected' | 'all', count: number } | null>(null);

  const {
    invoices: deletedInvoices,
    isLoading,
    reload,
  } = useInvoicesCursor<DeletedInvoice>({
    statusFilter: "deleted",
    initialLimit: 500,
  });

  const restoreMutation = useRestoreInvoice();
  const permanentDeleteMutation = usePermanentlyDeleteInvoice();

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return deletedInvoices;
    return deletedInvoices.filter(
      (inv) =>
        (inv.invoiceNumber ?? "").toLowerCase().includes(term) ||
        (inv.deletedInvoiceNumber ?? "").toLowerCase().includes(term) ||
        (inv.clientName ?? "").toLowerCase().includes(term) ||
        (inv.customer?.fullName ?? "").toLowerCase().includes(term) ||
        (inv.slCode ?? "").toLowerCase().includes(term) ||
        (inv.clientSlCode ?? "").toLowerCase().includes(term) ||
        (inv.deletedByName ?? "").toLowerCase().includes(term) ||
        (inv.manifestNumber ?? "").toLowerCase().includes(term)
    );
  }, [deletedInvoices, searchTerm]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (filtered.length > 0 && selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkRestoring(true);
    let successCount = 0;
    try {
      const promises = Array.from(selectedIds).map(async (id) => {
        await restoreMutation.mutateAsync(id);
        successCount++;
      });
      await Promise.allSettled(promises);
      toast({ title: "Restauración completada", description: `Se restauraron ${successCount} facturas exitosamente.` });
      setSelectedIds(new Set());
      reload();
    } catch {
      toast({ title: "Error en restauración masiva", description: "Ocurrió un error al restaurar algunas facturas.", variant: "destructive" });
    } finally {
      setIsBulkRestoring(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeletePrompt) return;
    
    setIsBulkDeleting(true);
    const idsToDelete = bulkDeletePrompt.type === 'all' 
      ? deletedInvoices.map(i => i.id) 
      : Array.from(selectedIds);
      
    let successCount = 0;
    try {
      const promises = idsToDelete.map(async (id) => {
        await permanentDeleteMutation.mutateAsync(id);
        successCount++;
      });
      await Promise.allSettled(promises);
      toast({ title: "Eliminación completada", description: `Se eliminaron permanentemente ${successCount} facturas.` });
      setSelectedIds(new Set());
      setBulkDeletePrompt(null);
      reload();
    } catch {
      toast({ title: "Error en eliminación masiva", description: "Ocurrió un error al eliminar algunas facturas.", variant: "destructive" });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  /**
   * Hard-delete handler — only reachable after the PermanentDeleteInvoiceDialog
   * has already enforced its two-factor confirmation (checkbox + slCode match),
   * so this function does NOT re-validate. It does, however, emit an audit log
   * with enough context to reconstruct what was destroyed and by whom.
   */
  const handlePermanentDelete = useCallback(async () => {
    if (!invoiceToDelete) return;
    const inv = invoiceToDelete;
    try {
      await permanentDeleteMutation.mutateAsync(inv.id);
      logAction({
        userId: user?.id ?? "unknown",
        userName: user?.fullName,
        userEmail: user?.email,
        userRole: user?.role,
        action: "invoice_permanently_deleted",
        category: "invoice",
        resource: "/invoices/recovery",
        resourceId: inv.id,
        result: "success",
        metadata: {
          invoiceNumber: inv.invoiceNumber || inv.deletedInvoiceNumber,
          slCode: inv.slCode || inv.clientSlCode || inv.customer?.slCode,
          clientName: inv.clientName || inv.customer?.fullName,
          deletedAt: inv.deletedAt,
          deletedBy: inv.deletedBy,
          totalAmount: inv.totalAmount,
        },
      });
      toast({
        title: "Factura eliminada permanentemente",
        description: `${inv.invoiceNumber || inv.deletedInvoiceNumber || inv.id} ya no existe en la base de datos.`,
      });
      setInvoiceToDelete(null);
      reload();
    } catch {
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar la factura permanentemente. Intenta de nuevo.",
        variant: "destructive",
      });
    }
  }, [invoiceToDelete, permanentDeleteMutation, user, toast, reload]);

  const handleRestore = useCallback(
    async (inv: DeletedInvoice) => {
      if (restoringId) return;
      setRestoringId(inv.id);
      try {
        await restoreMutation.mutateAsync(inv.id);
        logAction({
          userId: user?.id ?? "unknown",
          userName: user?.fullName,
          userEmail: user?.email,
          userRole: user?.role,
          action: "invoice_restored",
          category: "invoice",
          resource: "/invoices/recovery",
          resourceId: inv.id,
          result: "success",
          metadata: {
            invoiceNumber: inv.invoiceNumber || inv.deletedInvoiceNumber,
            restoredFrom: "deleted",
          },
        });
        toast({
          title: "Factura restaurada",
          description: `${inv.invoiceNumber || inv.deletedInvoiceNumber || inv.id} fue restaurada como borrador.`,
        });
        reload();
      } catch {
        toast({
          title: "Error al restaurar",
          description: "No se pudo restaurar la factura. Intenta de nuevo.",
          variant: "destructive",
        });
      } finally {
        setRestoringId(null);
      }
    },
    [restoringId, restoreMutation, user, toast, reload]
  );

  const formatDate = (ts: any): string => {
    if (!ts) return "—";
    try {
      let d: Date;
      if (ts?.toDate) {
        d = ts.toDate();
      } else if (typeof ts === "object" && ts !== null && ("_seconds" in ts || "seconds" in ts)) {
        const secs = (ts as any)._seconds ?? (ts as any).seconds;
        d = new Date(secs * 1000);
      } else {
        d = new Date(ts);
      }
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("es-CR", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const formatAmount = (amount?: number): string => {
    if (amount == null) return "—";
    return `₡${amount.toLocaleString("es-CR", { minimumFractionDigits: 2 })}`;
  };

  if (user?.role !== "ADMIN" && user?.role !== "MANAGER") {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8">
          <Card className="p-8 text-center bg-muted/30">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">Acceso denegado</h2>
            <p className="text-muted-foreground">
              No tienes permisos para acceder a esta sección.
            </p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="p-4 md:p-6 space-y-4"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="gap-1.5 text-muted-foreground"
            >
              <Link to="/invoices">
                <ArrowLeft className="h-4 w-4" />
                Facturas
              </Link>
            </Button>
            <div>
              <h1 className={`text-2xl md:text-3xl font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                <Trash2 className="h-6 w-6 text-destructive" />
                Papelera de Facturas
              </h1>
              <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                Facturas eliminadas — se pueden restaurar como borradores
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={handleBulkRestore}
                  disabled={isBulkRestoring}
                  className={cn("gap-1.5", isDark ? "border-emerald-700 text-emerald-400 hover:bg-emerald-950/30" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50")}
                >
                  {isBulkRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Restaurar ({selectedIds.size})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBulkDeletePrompt({ type: 'selected', count: selectedIds.size })}
                  disabled={isBulkDeleting}
                  className={cn("gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10", isDark ? "hover:bg-destructive/20 border-destructive/50" : "")}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar ({selectedIds.size})
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={reload}
              className={cn("gap-1.5", isDark ? "border-gray-600 hover:bg-gray-700" : "")}
              aria-label="Recargar papelera"
            >
              <RefreshCw className="h-4 w-4" />
              Recargar
            </Button>
            <Button
              variant="destructive"
              disabled={deletedInvoices.length === 0 || isBulkDeleting}
              onClick={() => setBulkDeletePrompt({ type: 'all', count: deletedInvoices.length })}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Vaciar
            </Button>
            <Badge variant="secondary" className="gap-1 tabular-nums hidden sm:flex">
              <Trash2 className="h-3 w-3" />
              {deletedInvoices.length} eliminada
              {deletedInvoices.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        {/* ── Warning banner ──────────────────────────────────────────────── */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Las facturas en la papelera no se han eliminado permanentemente. Al
            restaurarlas vuelven como <strong>borradores</strong> y puedes
            editarlas normalmente.
          </p>
        </div>

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número, cliente, SL, manifiesto…"
            className="pl-9 h-9 text-sm"
            aria-label="Buscar facturas eliminadas"
          />
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div
                className="flex flex-col items-center justify-center py-16 gap-3"
                aria-live="polite"
                aria-label="Cargando facturas eliminadas"
              >
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cargando…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Trash2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">
                  {searchTerm ? "Sin resultados" : "Papelera vacía"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchTerm
                    ? "Intenta otro término de búsqueda."
                    : "No hay facturas eliminadas."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm"
                  aria-label="Facturas eliminadas"
                >
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th scope="col" className="px-4 py-3 w-10">
                        <Checkbox 
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={toggleAll}
                          aria-label="Seleccionar todas las facturas"
                        />
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Factura
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Cliente
                      </th>
                      <th
                        scope="col"
                        className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Monto
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Eliminado el
                      </th>
                      <th
                        scope="col"
                        className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Eliminado por
                      </th>
                      <th
                        scope="col"
                        className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Checkbox 
                            checked={selectedIds.has(inv.id)}
                            onCheckedChange={() => toggleSelection(inv.id)}
                            aria-label={`Seleccionar factura ${inv.invoiceNumber}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-mono text-xs font-medium">
                              {inv.invoiceNumber ||
                                inv.deletedInvoiceNumber ||
                                `${inv.id.slice(0, 12)}…`}
                            </span>
                          </div>
                          {inv.manifestNumber && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-6 font-mono">
                              {inv.manifestNumber}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs">
                              {(inv.clientName ||
                                inv.customer?.fullName)?.toUpperCase() ||
                                "—"}
                            </span>
                          </div>
                          {(inv.slCode || inv.clientSlCode || inv.customer?.slCode) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-5 font-mono">
                              {inv.slCode || inv.clientSlCode || inv.customer?.slCode}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-medium tabular-nums">
                            {formatAmount(inv.totalAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {formatDate(inv.deletedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {inv.deletedByName || inv.deletedBy || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                              disabled={
                                restoringId === inv.id ||
                                restoreMutation.isPending
                              }
                              onClick={() => handleRestore(inv)}
                              aria-label={`Restaurar factura ${inv.invoiceNumber || inv.deletedInvoiceNumber}`}
                            >
                              {restoringId === inv.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Restaurar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                              disabled={permanentDeleteMutation.isPending}
                              onClick={() => setInvoiceToDelete(inv)}
                              aria-label={`Eliminar permanentemente la factura ${inv.invoiceNumber || inv.deletedInvoiceNumber}`}
                              data-testid={`permanent-delete-btn-${inv.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Mostrando {filtered.length} factura
            {filtered.length !== 1 ? "s" : ""} eliminada
            {filtered.length !== 1 ? "s" : ""}
            {searchTerm && ` · búsqueda: "${searchTerm}"`}
          </p>
        )}

        {/* Permanent delete confirmation — two-factor */}
        {invoiceToDelete && (
          <PermanentDeleteInvoiceDialog
            open={!!invoiceToDelete}
            onOpenChange={(isOpen) => {
              if (!isOpen) setInvoiceToDelete(null);
            }}
            invoice={{
              id: invoiceToDelete.id,
              invoiceNumber:
                invoiceToDelete.invoiceNumber ||
                invoiceToDelete.deletedInvoiceNumber,
              clientName:
                invoiceToDelete.clientName ||
                invoiceToDelete.customer?.fullName,
              slCode:
                invoiceToDelete.slCode ||
                invoiceToDelete.clientSlCode ||
                invoiceToDelete.customer?.slCode,
            }}
            onConfirm={handlePermanentDelete}
            isLoading={permanentDeleteMutation.isPending}
          />
        )}

        {/* Bulk Delete Confirmation */}
        <AlertDialog open={!!bulkDeletePrompt} onOpenChange={(open) => { if (!open) setBulkDeletePrompt(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar permanentemente {bulkDeletePrompt?.count} factura{bulkDeletePrompt?.count !== 1 ? 's' : ''}?</AlertDialogTitle>
              <AlertDialogDescription className="text-amber-600 dark:text-amber-500 font-medium mt-2">
                Esta acción es irreversible y eliminará completamente los registros de la base de datos.
                {bulkDeletePrompt?.type === 'all' && " Esto vaciará toda la papelera."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
                disabled={isBulkDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              >
                {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isBulkDeleting ? "Eliminando..." : "Sí, eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </DashboardLayout>
  );
};

export default InvoiceRecovery;
