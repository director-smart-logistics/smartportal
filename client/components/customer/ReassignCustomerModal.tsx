import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertCircle, Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AutocompleteCustomer } from "@/components/customer/CustomerAutocomplete";
import { useCustomerSearch } from "@/lib/hooks/queries/useCustomers";
import { useTranslation } from "react-i18next";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { isTempSlCode } from "@/lib/utils/invoice-reassign";

export interface ReassignCustomerModalProps {
  open: boolean;
  onClose: () => void;
  entityId: string | null;
  entityType: "package" | "invoice";
  currentCustomerId?: string | null;
  currentCustomerName: string | null;
  currentslCode: string | null;
  onSave: (entityId: string, customer: AutocompleteCustomer) => Promise<void>;
  updating: boolean;
}

export function ReassignCustomerModal({
  open,
  onClose,
  entityId,
  entityType,
  currentCustomerId,
  currentCustomerName,
  currentslCode,
  onSave,
  updating,
}: ReassignCustomerModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingCustomer, setPendingCustomer] = useState<AutocompleteCustomer | null>(null);
  const [otherInvoicesCount, setOtherInvoicesCount] = useState<number | null>(null);

  // Debounced/reactive customer search
  const { results, isLoading: isSearching } = useCustomerSearch(searchQuery, 280, 50);

  const suggestions: AutocompleteCustomer[] = results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    slCode: r.slCode ?? "N/A",
    deliveryAddress1: (r as any).deliveryAddress1,
    email: r.email ?? "",
    country: (r as any).country,
    ruta: (r as any).ruta ?? null,
  }));

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setPendingCustomer(null);
      setOtherInvoicesCount(null);

      // Specific query for batch invoice reassignments if current customer is a temporary placeholder
      if (entityType === "invoice" && entityId && currentslCode && isTempSlCode(currentslCode)) {
        const invRef = collection(db, "invoices");
        const slCode = currentslCode;
        Promise.all([
          getDocs(query(invRef, where("clientSlCode", "==", slCode))),
          getDocs(query(invRef, where("slCode", "==", slCode))),
          getDocs(query(invRef, where("customerId", "==", slCode))),
        ])
          .then(([s1, s2, s3]) => {
            const otherIds = new Set<string>();
            [s1, s2, s3].forEach((snap) => {
              snap.docs.forEach((d) => {
                if (d.id !== entityId) otherIds.add(d.id);
              });
            });
            setOtherInvoicesCount(otherIds.size);
          })
          .catch((err) => {
            console.warn(
              "[ReassignCustomerModal] Failed to fetch other invoices count:",
              err
            );
            setOtherInvoicesCount(0);
          });
      }
    }
  }, [open, entityType, entityId, currentslCode]);

  const handleSave = async () => {
    if (!entityId || !pendingCustomer) return;
    await onSave(entityId, pendingCustomer);
    onClose();
  };

  const isSameOwner = pendingCustomer?.slCode === currentslCode;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] sm:max-w-[820px] w-[95vw] h-auto max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0 rounded-xl overflow-hidden bg-background border-border shadow-lg">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle>
            {entityType === "invoice"
              ? t("invoices.reassignCustomer", "Reasignar Cliente")
              : t("packages.reassignCustomer", "Reasignar Cliente")}
          </DialogTitle>
          <DialogDescription>
            {entityType === "invoice"
              ? t("invoices.reassignCustomerDesc", "Busca y selecciona el cliente al que deseas asignar esta factura.")
              : t("packages.reassignCustomerDesc", "Busca y selecciona el cliente al que deseas asignar este paquete.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border h-[400px] max-h-[400px] flex-1 min-h-0">
          {/* Column 1 (Left): Customer Search & Selection */}
          <div className="flex flex-col h-full min-w-0 overflow-hidden">
            <div className="p-3 border-b bg-muted/20 shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                {t("packages.searchCustomerLabel", "1. Buscar Nuevo Cliente")}
              </span>
            </div>
            <div className="relative p-3 border-b shrink-0">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPendingCustomer(null);
                }}
                placeholder={t("packages.searchCustomerPlaceholder", "Buscar cliente...")}
                className="w-full h-9 pl-9 pr-8 bg-background border border-input rounded-md text-sm placeholder:text-muted-foreground"
                autoFocus
              />
              {isSearching && searchQuery.trim().length >= 2 && (
                <Loader2 className="absolute right-6 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground pointer-events-none" />
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 scrollbar-thin min-h-0">
              {isSearching && suggestions.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Buscando clientes…
                </div>
              )}
              {!isSearching && searchQuery.trim().length >= 2 && suggestions.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No se encontraron clientes para &ldquo;{searchQuery}&rdquo;
                </div>
              )}
              {searchQuery.trim().length < 2 && (
                <div className="py-8 text-center text-xs text-muted-foreground px-4">
                  Escribe al menos 2 caracteres para buscar.
                </div>
              )}
              {searchQuery.trim().length >= 2 && suggestions.map((cust) => {
                const isSelected = pendingCustomer?.id === cust.id;
                return (
                  <button
                    type="button"
                    key={cust.id}
                    onClick={() => setPendingCustomer(cust)}
                    className={cn(
                      "w-full flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer transition-colors text-left",
                      isSelected
                        ? "bg-primary/10 text-primary border-primary/20 border"
                        : "hover:bg-accent/50 text-foreground border border-transparent"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {cust.fullName}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {cust.slCode} {cust.email && `· ${cust.email}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Column 2 (Right): Comparison & Action confirmation */}
          <div className="flex flex-col h-full pt-4 px-4 pb-4 bg-muted/5 min-w-0 overflow-hidden">
            <div className="pb-2 border-b mb-2 shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                {t("packages.confirmChangesLabel", "2. Confirmar Cambios")}
              </span>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1 scrollbar-thin min-h-0">
              {/* Visual transition (Current vs Destination) */}
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Cliente Actual</span>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    {currentslCode && (
                      <Badge variant="outline" className="font-mono text-[9px] bg-slate-100 text-slate-800 border-slate-200 px-1 py-0 rounded shrink-0">
                        {currentslCode}
                      </Badge>
                    )}
                    <span className={cn(
                      "text-xs font-semibold text-muted-foreground truncate",
                      pendingCustomer && "line-through"
                    )}>
                      {currentCustomerName || "Sin cliente"}
                    </span>
                  </div>
                </div>
                <div className="h-px bg-border my-0.5 relative">
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] bg-background px-1.5 text-muted-foreground">↓</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9px] uppercase tracking-wider text-primary font-bold">Nuevo Cliente</span>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    {pendingCustomer ? (
                      <>
                        <Badge variant="outline" className="font-mono text-[9px] bg-slate-100 text-slate-800 border-slate-200 px-1 py-0 rounded shrink-0">
                          {pendingCustomer.slCode}
                        </Badge>
                        <span className="text-xs font-bold text-foreground truncate">
                          {pendingCustomer.fullName}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">
                        Selecciona un cliente...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Batch warning if applicable for invoices */}
              {entityType === "invoice" && pendingCustomer && otherInvoicesCount !== null && otherInvoicesCount > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 p-2.5 text-xs text-blue-700 dark:text-blue-400">
                  <div className="flex gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-700 dark:text-blue-400">
                        Reasignación en lote
                      </p>
                      <p className="text-blue-600/80 dark:text-blue-300/80 text-[10px] mt-0.5 leading-snug">
                        Este cliente temporal tiene{" "}
                        <strong>
                          {otherInvoicesCount} factura
                          {otherInvoicesCount > 1 ? "s" : ""} más
                        </strong>
                        . Se reasignarán todas automáticamente.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isSameOwner && pendingCustomer && (
                <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded p-2">
                  {entityType === "invoice"
                    ? "El cliente seleccionado ya es el dueño actual de la factura."
                    : "El cliente seleccionado ya es el dueño actual de este paquete."}
                </p>
              )}

              {!pendingCustomer && (
                <p className="text-[11px] text-muted-foreground leading-normal mt-2">
                  {entityType === "invoice"
                    ? "Selecciona un cliente de la lista de búsqueda de la izquierda para configurar la reasignación de esta factura."
                    : "Selecciona un cliente de la lista de búsqueda para configurar la reasignación de este paquete."}
                </p>
              )}
            </div>

            {/* Buttons pushed to the bottom of the column wrapper, using mt-auto */}
            <div className="flex items-center gap-2 pt-3 border-t mt-auto w-full shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updating}
                className="flex-1 h-9 text-xs"
              >
                {t("common.cancel", "Cancelar")}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!pendingCustomer || isSameOwner || updating}
                className="flex-1 h-9 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white shadow-sm"
              >
                {updating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    {t("common.saving", "Guardando...")}
                  </>
                ) : (
                  t("common.save", "Guardar")
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
