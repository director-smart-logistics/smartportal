import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, CheckCircle2, Route } from "lucide-react";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";

interface ReassignManifestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoiceNumber: string;
    manifestNumber?: string;
  };
  onConfirm: (data: {
    newManifestNumber: string;
    newInvoiceNumber: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function ReassignManifestModal({
  open,
  onOpenChange,
  invoice,
  onConfirm,
  isLoading = false,
}: ReassignManifestModalProps) {
  const [manifestInput, setManifestInput] = useState("");
  const [matches, setMatches] = useState<
    { docId: string; manifestNumber: string }[]
  >([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedManifest, setSelectedManifest] = useState<string | null>(null);

  const [invoiceNumberInput, setInvoiceNumberInput] = useState("");

  useEffect(() => {
    if (open) {
      setManifestInput(invoice.manifestNumber || "");
      setInvoiceNumberInput(invoice.invoiceNumber || "");
      setSelectedManifest(null);
    }
  }, [open, invoice.manifestNumber, invoice.invoiceNumber]);

  useEffect(() => {
    if (!open) return;
    const term = manifestInput.trim().toUpperCase();

    // Si el usuario escribe exactamente el actual o lo deja vacio
    if (term === (invoice.manifestNumber || "").toUpperCase()) {
      setMatches([]);
      return;
    }

    let isMounted = true;
    setLoadingMatches(true);

    const delay = term.length === 0 ? 0 : 300;
    const timer = setTimeout(async () => {
      try {
        const col = collection(db, "manifests");
        const q =
          term.length === 0
            ? query(col, orderBy("createdAt", "desc"), limit(10))
            : query(
                col,
                where("manifestNumber", ">=", term),
                where("manifestNumber", "<=", term + "\uf8ff"),
                orderBy("manifestNumber", "desc"),
                limit(10),
              );
        const snap = await getDocs(q);
        if (isMounted) {
          const results = snap.docs
            .map((d) => ({
              docId: d.id,
              manifestNumber: (d.data().manifestNumber ?? d.id) as string,
            }))
            // Evitar duplicados
            .filter(
              (m, idx, arr) =>
                arr.findIndex((x) => x.manifestNumber === m.manifestNumber) ===
                idx,
            );
          setMatches(results);
        }
      } catch (err) {
        if (isMounted) setMatches([]);
      } finally {
        if (isMounted) setLoadingMatches(false);
      }
    }, delay);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [manifestInput, open, invoice.manifestNumber]);

  const handleConfirm = async () => {
    const finalManifest =
      selectedManifest !== null
        ? selectedManifest
        : manifestInput.trim().toUpperCase();
    const finalInvoiceNumber = invoiceNumberInput.trim().toUpperCase();
    await onConfirm({
      newManifestNumber: finalManifest,
      newInvoiceNumber: finalInvoiceNumber,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-[100dvh] sm:h-auto sm:max-w-md sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] rounded-none sm:rounded-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-emerald-500 shrink-0" />
            Corregir Factura y Manifiesto
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm mb-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Datos Actuales
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">
                Factura Actual:
              </span>
              <span className="font-mono font-bold text-foreground">
                {invoice.invoiceNumber || "Sin Número"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-muted-foreground">
                Manifiesto Actual:
              </span>
              <span className="font-mono font-bold text-foreground">
                {invoice.manifestNumber || "Ninguno"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Corregir Número de Factura
            </label>
            <Input
              value={invoiceNumberInput}
              onChange={(e) =>
                setInvoiceNumberInput(e.target.value.toUpperCase())
              }
              placeholder="Ej. SL26111-20240101"
              className="font-mono text-sm uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Buscar Nuevo Manifiesto (o dejar en blanco para desvincular)
            </label>
            <div className="relative">
              <Input
                value={manifestInput}
                onChange={(e) => {
                  setManifestInput(e.target.value.toUpperCase());
                  setSelectedManifest(null);
                }}
                placeholder="Ej. 14-03-2026ANP"
                className="font-mono text-sm"
              />
              {loadingMatches && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {matches.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border text-sm">
              {matches.map((m) => (
                <button
                  key={m.docId}
                  type="button"
                  onClick={() => {
                    setManifestInput(m.manifestNumber);
                    setSelectedManifest(m.manifestNumber);
                    setMatches([]);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                    selectedManifest === m.manifestNumber
                      ? "bg-emerald-50 dark:bg-emerald-950/40"
                      : "hover:bg-muted/50",
                  )}
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono flex-1">{m.manifestNumber}</span>
                  {selectedManifest === m.manifestNumber && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={isLoading}
            onClick={handleConfirm}
            className="gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Route className="h-3.5 w-3.5" />
            )}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
