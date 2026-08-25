/**
 * EncomiendaBulkInvoiceSendModal
 * Finds invoices for all selected customers, shows a confirmation list,
 * and sends all found invoices in bulk. Specific to the Encomiendas manifest.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  SendHorizonal,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { firebaseApi } from "@/lib/firebase/callable";
import { buildInvoiceEmailPayload } from "@/lib/services/invoice-service";
import { syncInvoicePackagesToSp2 } from "@/lib/services/sync-invoices-service";
import { db } from "@/lib/firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import type { NovaShippingLabelData } from "@/components/nova/NovaShippingLabelModal";

interface InvoiceItem {
  slCode: string;
  clientName: string;
  invoice: any | null;
  status: "pending" | "found" | "not_found" | "sending" | "sent" | "error";
  error?: string;
}

interface EncomiendaBulkInvoiceSendModalProps {
  queue: NovaShippingLabelData[];
  onClose: () => void;
}

// Sort query result docs newest-first by createdAt (client-side tiebreaker)
const newestInvoiceDoc = (docs: any[]) =>
  docs
    .slice()
    .sort(
      (a: any, b: any) =>
        (b.data().createdAt?.seconds ?? 0) - (a.data().createdAt?.seconds ?? 0),
    )[0];

async function findInvoiceForCustomer(
  slCode: string,
  trackings: string[],
): Promise<any | null> {
  if (trackings.length > 0) {
    const first = trackings[0];
    const s1 = await getDocs(
      query(
        collection(db, "invoices"),
        where("trackingNumbers", "array-contains", first),
      ),
    );
    if (!s1.empty) {
      const d = newestInvoiceDoc(s1.docs);
      return { id: d.id, ...d.data() };
    }
    const s2 = await getDocs(
      query(collection(db, "invoices"), where("trackingNumber", "==", first)),
    );
    if (!s2.empty) {
      const d = newestInvoiceDoc(s2.docs);
      return { id: d.id, ...d.data() };
    }
  }
  if (slCode && !slCode.startsWith("__nocode__")) {
    const s3 = await getDocs(
      query(
        collection(db, "invoices"),
        where("customerId", "==", slCode),
        orderBy("createdAt", "desc"),
        limit(1),
      ),
    );
    if (!s3.empty) return { id: s3.docs[0].id, ...s3.docs[0].data() };
  }
  return null;
}

async function sendInvoiceEmail(invoice: any): Promise<void> {
  const payload = buildInvoiceEmailPayload(invoice);
  if (!payload.customerEmail)
    throw new Error("El cliente no tiene email en la factura");

  await firebaseApi.email.sendInvoice(payload as any);

  if (invoice.id) {
    const now = new Date().toISOString();
    const protected_ = ["paid", "overdue", "cancelled", "annulled"];
    const willSetSent = !invoice.status || !protected_.includes(invoice.status);
    await updateDoc(doc(db, "invoices", invoice.id), {
      emailSent: true,
      emailSentAt: now,
      emailStatus: "sent",
      updatedAt: now,
      ...(willSetSent ? { status: "sent" } : {}),
    });
    // Promote linked packages to 'processed' (facturado) and sync to SmartWeb.
    // Fire-and-forget — must not slow down bulk sending.
    const sentInv = { ...invoice, ...(willSetSent ? { status: "sent" } : {}) };
    syncInvoicePackagesToSp2(sentInv, "processed").catch((e) =>
      console.error("[EncomiendaBulkInvoiceSendModal] SmartWeb sync error:", e),
    );
  }
}

export function EncomiendaBulkInvoiceSendModal({
  queue,
  onClose,
}: EncomiendaBulkInvoiceSendModalProps) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [lookingUp, setLookingUp] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!queue.length) return;
    setLookingUp(true);
    Promise.all(
      queue.map(async (q): Promise<InvoiceItem> => {
        try {
          const inv = await findInvoiceForCustomer(q.slCode, q.trackings);
          return {
            slCode: q.slCode,
            clientName: q.clientName,
            invoice: inv,
            status: inv ? "found" : "not_found",
            error: inv ? undefined : "No se encontró factura",
          };
        } catch (err) {
          return {
            slCode: q.slCode,
            clientName: q.clientName,
            invoice: null,
            status: "not_found",
            error: String(err),
          };
        }
      }),
    )
      .then(setItems)
      .finally(() => setLookingUp(false));
  }, [queue]);

  const handleSendAll = useCallback(async () => {
    const sendable = items.filter((i) => i.invoice && i.status === "found");
    if (!sendable.length) return;
    setSending(true);
    for (const item of sendable) {
      setItems((prev) =>
        prev.map((i) =>
          i.slCode === item.slCode ? { ...i, status: "sending" } : i,
        ),
      );
      try {
        await sendInvoiceEmail(item.invoice);
        setItems((prev) =>
          prev.map((i) =>
            i.slCode === item.slCode ? { ...i, status: "sent" } : i,
          ),
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.slCode === item.slCode
              ? { ...i, status: "error", error: String(err) }
              : i,
          ),
        );
      }
    }
    setSending(false);
  }, [items]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, sending]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const foundCount = items.filter((i) => i.invoice !== null).length;
  const sentCount = items.filter((i) => i.status === "sent").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const allDone =
    !lookingUp &&
    items.every(
      (i) =>
        i.status === "sent" || i.status === "not_found" || i.status === "error",
    );

  return (
    <AnimatePresence>
      <motion.div
        key="bulk-invoice-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="bg-background rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
            <Mail className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-sm">
              Enviar facturas — {queue.length} cliente
              {queue.length !== 1 ? "s" : ""}
            </span>
            {!lookingUp && (
              <span className="text-xs text-muted-foreground ml-1">
                {foundCount} con factura
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-40"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {lookingUp ? (
              <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Buscando facturas…</span>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.slCode}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"
                >
                  <div className="shrink-0">
                    {item.status === "sending" && (
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    )}
                    {item.status === "sent" && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    {item.status === "error" && (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    {item.status === "not_found" && (
                      <FileText className="h-4 w-4 text-muted-foreground opacity-40" />
                    )}
                    {item.status === "found" && (
                      <FileText className="h-4 w-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {item.clientName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {item.slCode}
                    </div>
                  </div>
                  <div className="text-xs shrink-0">
                    {item.status === "sending" && (
                      <span className="text-emerald-600">Enviando…</span>
                    )}
                    {item.status === "sent" && (
                      <span className="text-emerald-600">Enviado</span>
                    )}
                    {item.status === "error" && (
                      <span className="text-destructive">{item.error}</span>
                    )}
                    {item.status === "not_found" && (
                      <span className="text-muted-foreground">Sin factura</span>
                    )}
                    {item.status === "found" && (
                      <span className="text-muted-foreground">
                        {item.invoice?.invoiceNumber ?? "Factura encontrada"}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            {allDone && sentCount > 0 && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                ✓ {sentCount} factura{sentCount !== 1 ? "s" : ""} enviada
                {sentCount !== 1 ? "s" : ""}
                {errorCount > 0 &&
                  ` · ${errorCount} error${errorCount !== 1 ? "es" : ""}`}
              </p>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={sending}
              >
                {allDone ? "Cerrar" : "Cancelar"}
              </Button>
              {!allDone && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleSendAll}
                  disabled={lookingUp || sending || foundCount === 0}
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SendHorizonal className="h-3.5 w-3.5" />
                  )}
                  Enviar {foundCount > 0 ? `(${foundCount})` : ""}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
