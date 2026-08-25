import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { app } from "@/lib/firebase/config";
import { getFunctions, httpsCallable } from "firebase/functions";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { syncInvoicesToSp2 } from "@/lib/services/sync-invoices-service";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";

interface UnsyncedInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  clientSlCode: string;
  clientName: string;
  createdAt: string;
  _syncError?: string;
}

interface VerifyResult {
  unsynced: UnsyncedInvoice[];
  missingSlCode: UnsyncedInvoice[];
}

interface SyncVerifierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Fallback to fetch the full InvoiceRecord from the local state for syncing
  getFullInvoiceRecord: (id: string) => any;
}

export function SyncVerifierModal({
  open,
  onOpenChange,
  getFullInvoiceRecord,
}: SyncVerifierModalProps) {
  const { t } = useTranslation("invoices");
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(60);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    currentInvoiceNumber: string;
    status: string;
  } | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setResult(null);
    setSelectedIds(new Set());
    try {
      const functions = getFunctions(app, "us-central1");
      const verifyFn = httpsCallable<
        { days: number },
        { success: boolean; data: VerifyResult }
      >(functions, "slVerifyInvoicesSync");
      const res = await verifyFn({ days });
      if (res.data.success) {
        setResult(res.data.data);
      }
    } catch (err: any) {
      toast({
        title: "Error de Verificación",
        description: err.message || "No se pudo verificar con SP2.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (!result) return;
    if (selectedIds.size === result.unsynced.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(result.unsynced.map((i) => i.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSyncSelected = async () => {
    if (selectedIds.size === 0 || !result) return;
    setSyncing(true);

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const inv = result.unsynced.find((u) => u.id === id);
      let fullInv = getFullInvoiceRecord(id);

      if (!fullInv) {
        // Fallback: If not in local UI state, fetch directly from Firestore
        const { doc, getDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase/config");
        const docSnap = await getDoc(doc(db, "invoices", id));
        if (docSnap.exists()) {
          fullInv = { id: docSnap.id, ...docSnap.data() };
        }
      }

      if (!fullInv || !inv) {
        errorCount++;
        continue;
      }

      setSyncProgress({
        current: i + 1,
        total: ids.length,
        currentInvoiceNumber: inv.invoiceNumber || id,
        status: "syncing",
      });

      let success = false;
      let retries = 0;
      let lastError = "Desconocido";
      const MAX_RETRIES = 2;

      while (!success && retries <= MAX_RETRIES) {
        try {
          const res = await syncInvoicesToSp2([fullInv]);
          if (res.ok && res.summary.errors === 0) {
            success = true;
          } else {
            const errResult = res.results.find((r) => r.invoiceId === id);
            lastError = errResult?.reason || "Rechazado por SP2 (Bad Request)";

            retries++;
            if (retries <= MAX_RETRIES) {
              setSyncProgress((prev) =>
                prev ? { ...prev, status: `Reintentando...` } : null,
              );
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        } catch (err: any) {
          lastError = err.message || "Error de red o CORS";
          retries++;
          if (retries <= MAX_RETRIES) {
            setSyncProgress((prev) =>
              prev ? { ...prev, status: `Reintentando...` } : null,
            );
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }

      if (success) {
        successCount++;
        // Quitar de la tabla en tiempo real
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            unsynced: prev.unsynced.filter((u) => u.id !== id),
          };
        });
        // Quitar de la selección
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        errorCount++;
        // Mostrar el error exacto en la tabla para guiar al usuario
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            unsynced: prev.unsynced.map((u) =>
              u.id === id ? { ...u, _syncErrorMessage: lastError } : u,
            ),
          };
        });
      }
    }

    setSyncProgress(null);
    setSyncing(false);

    if (errorCount > 0) {
      toast({
        title: "Sincronización Incompleta",
        description: `Se sincronizaron ${successCount} facturas, pero ${errorCount} fallaron luego de reintentar.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sincronización Exitosa",
        description: `Se sincronizaron ${successCount} facturas correctamente.`,
      });
      onOpenChange(false);
    }

    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["invoices-cursor"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-4xl left-0 top-0 sm:left-[50%] sm:top-[50%] translate-x-0 translate-y-0 sm:translate-x-[-50%] sm:translate-y-[-50%] rounded-none sm:rounded-xl p-4 sm:p-6 flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-indigo-600" />
            Verificador de Sincronización SP1 ↔ SP2
          </DialogTitle>
          <DialogDescription>
            Busca facturas emitidas (enviadas o pagadas) en SmartPortal-1 que no
            estén reflejadas correctamente en el portal del cliente (SmartWeb
            SP2).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Controls */}
          <div className="flex items-end gap-4 p-4 border rounded-md bg-muted/30">
            <div className="space-y-1.5 flex-1 max-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">
                Rango de búsqueda (Días)
              </label>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value) || 30)}
                disabled={loading || syncing}
                className="h-8 text-sm"
              />
            </div>
            <Button
              onClick={handleVerify}
              disabled={loading || syncing}
              className="h-8"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Buscando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" /> Buscar Discrepancias
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto border rounded-md">
            {!result && !loading && (
              <div className="p-8 text-center text-muted-foreground">
                Haz clic en "Buscar Discrepancias" para consultar la base de
                datos de SmartWeb.
              </div>
            )}

            {loading && (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
                <p>Consultando registros en SP1 y SP2...</p>
                <p className="text-xs mt-2 opacity-70">
                  Esto puede tomar unos segundos.
                </p>
              </div>
            )}

            {result &&
              result.unsynced.length === 0 &&
              result.missingSlCode.length === 0 && (
                <div className="p-8 text-center flex flex-col items-center justify-center text-green-600">
                  <CheckCircle2 className="h-12 w-12 mb-4 opacity-80" />
                  <h3 className="font-semibold text-lg">
                    Todo está Sincronizado
                  </h3>
                  <p className="text-sm opacity-80 mt-1">
                    No se encontraron facturas faltantes en SP2 en los últimos{" "}
                    {days} días.
                  </p>
                </div>
              )}

            {result &&
              (result.unsynced.length > 0 ||
                result.missingSlCode.length > 0) && (
                <div className="relative">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="p-3 w-[40px] text-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={
                              selectedIds.size > 0 &&
                              selectedIds.size === result.unsynced.length
                            }
                            ref={(input) => {
                              if (input) {
                                input.indeterminate =
                                  selectedIds.size > 0 &&
                                  selectedIds.size < result.unsynced.length;
                              }
                            }}
                            onChange={handleToggleSelectAll}
                          />
                        </th>
                        <th className="p-3 font-medium">Factura</th>
                        <th className="p-3 font-medium">Fecha</th>
                        <th className="p-3 font-medium">Cliente</th>
                        <th className="p-3 font-medium">SL Code</th>
                        <th className="p-3 font-medium">Estado SP1</th>
                        <th className="p-3 font-medium">Problema</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.unsynced.map((inv) => (
                        <tr
                          key={inv.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={selectedIds.has(inv.id)}
                              onChange={() => handleToggleSelect(inv.id)}
                            />
                          </td>
                          <td className="p-3 font-medium">
                            {inv.invoiceNumber}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {inv.createdAt
                              ? new Date(inv.createdAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="p-3">{inv.clientName}</td>
                          <td className="p-3 font-mono">{inv.clientSlCode}</td>
                          <td className="p-3 capitalize">{inv.status}</td>
                          <td className="p-3 text-xs">
                            {inv._syncError ? (
                              <div className="flex flex-col">
                                <span className="text-red-600 flex items-center gap-1.5 font-medium">
                                  <AlertTriangle className="h-3.5 w-3.5" />{" "}
                                  Sincronización Fallida
                                </span>
                                <span className="text-muted-foreground text-[10px] mt-0.5 leading-tight max-w-[200px]">
                                  {inv._syncError}
                                </span>
                              </div>
                            ) : (
                              <span className="text-orange-600 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {inv._syncError === "SP2_IS_DRAFT"
                                  ? "Estancada en SP2 (Borrador)"
                                  : "Falta la Factura en SP2"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* Facturas sin SL Code (no se pueden seleccionar) */}
                      {result.missingSlCode.map((inv) => (
                        <tr
                          key={inv.id}
                          className="bg-red-50/30 dark:bg-red-950/10 opacity-70"
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              disabled
                              className="rounded border-gray-300 opacity-50"
                            />
                          </td>
                          <td className="p-3 font-medium">
                            {inv.invoiceNumber}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {inv.createdAt
                              ? new Date(inv.createdAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="p-3">{inv.clientName}</td>
                          <td className="p-3">
                            {inv._syncError === "ORPHAN_SL_CODE" ? (
                              <span className="text-orange-600 font-mono text-xs">
                                {inv.clientSlCode}
                              </span>
                            ) : (
                              <span className="text-red-500 font-medium text-xs">
                                SIN SL CODE
                              </span>
                            )}
                          </td>
                          <td className="p-3 capitalize">{inv.status}</td>
                          <td className="p-3 text-xs">
                            {inv._syncError === "ORPHAN_SL_CODE" ? (
                              <span className="text-orange-600 font-medium flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />{" "}
                                Cliente Temporal (Reasignar)
                              </span>
                            ) : (
                              <span className="text-red-600">
                                Requiere edición manual
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 mt-2 border-t">
          <div className="text-sm text-muted-foreground flex items-center gap-4">
            <span>{selectedIds.size} factura(s) seleccionada(s)</span>
            {syncProgress && (
              <span className="flex items-center text-indigo-600 font-medium bg-indigo-50 px-3 py-1 rounded-full">
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Sincronizando {syncProgress.current} de {syncProgress.total}:
                Factura {syncProgress.currentInvoiceNumber}
                {syncProgress.status !== "syncing" && (
                  <span className="ml-2 text-orange-600 text-xs">
                    ({syncProgress.status})
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button
              disabled={selectedIds.size === 0 || syncing}
              onClick={handleSyncSelected}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" /> Sincronizar (
                  {selectedIds.size})
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
