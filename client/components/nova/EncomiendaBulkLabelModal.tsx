/**
 * EncomiendaBulkLabelModal
 * Fetches all selected customers in parallel, builds ParcelPreview for each,
 * and renders all shipping labels in a single preview with one print action.
 * Specific to the Encomiendas manifest module — does not affect Nova flow.
 *
 * Print isolation: uses printInWindow (client/lib/utils/print-window.ts) which
 * opens a clean browser window so that global.css @media print rules
 * (body * { visibility: hidden }) cannot interfere.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  buildShippingLabelHTML,
  type ShippingLabelRow,
} from "@/lib/utils/nova-print";
import { motion, AnimatePresence } from "framer-motion";
import { X, Printer, Loader2, AlertTriangle, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firebaseApi } from "@/lib/firebase/callable";
import {
  type NovaShippingLabelData,
  type ParcelPreview,
  type CustomerInfo,
  type CustomerAddress,
  ShippingLabelPrint,
} from "@/components/nova/NovaShippingLabelModal";
import { resolveEncomiendaName, initializeEncomiendaLookup, resolveCustomerEncomiendaService } from "@/lib/services/encomienda-lookup";

interface BulkResult {
  data: NovaShippingLabelData;
  preview: ParcelPreview | null;
  customer: CustomerInfo | null;
  error?: string;
  hasMissingData?: boolean;
}

interface EncomiendaBulkLabelModalProps {
  queue: NovaShippingLabelData[];
  onClose: () => void;
}

export function resolveAddress(
  c: CustomerInfo,
  encomiendaNameHint?: string,
): { deliveryAddress: string; courierService: string } {
  // Use admin address override if it exists to preserve client information integrity in SP2
  const adminOverride = (c as any).adminAddressOverride;
  if (adminOverride?.deliveryAddress) {
    return {
      deliveryAddress: adminOverride.deliveryAddress,
      courierService: adminOverride.courierService || adminOverride.encomiendaService || "",
    };
  }

  // Find default/principal address first, falling back to the first address in the profile
  const encomAddr = c.defaultAddress ?? c.addresses?.find((a) => a.isDefault && a.isActive !== false) ?? c.addresses?.[0];

  // 1. Resolve courier service name (with top-level fallback)
  const courierService = resolveCustomerEncomiendaService(c, encomiendaNameHint);

  // 2. Resolve delivery address (with top-level fallback)
  let deliveryAddress = "";
  if (encomAddr) {
    const parts = [];
    if (encomAddr.streetAddress) parts.push(encomAddr.streetAddress);
    if ((encomAddr as any).details) parts.push((encomAddr as any).details);
    if (encomAddr.deliveryInstructions) parts.push(`Instrucciones: ${encomAddr.deliveryInstructions}`);
    deliveryAddress = parts.join("\n");
  }
  
  if (!deliveryAddress.trim()) {
    const loc = (c as any).location || (c as any).direccion || (c as any).address;
    if (loc && typeof loc === 'object') {
      const parts = [];
      const detail = loc.addressDetail || loc.direccionExacta || loc.detail || loc.streetAddress || (c as any).direccionExacta;
      if (detail) parts.push(detail);
      if (loc.district || loc.distrito) parts.push(loc.district || loc.distrito);
      if (loc.canton) parts.push(loc.canton);
      if (loc.province || loc.provincia) parts.push(loc.province || loc.provincia);
      if (parts.length > 0) deliveryAddress = parts.join(", ");
    }
  }

  if (!deliveryAddress.trim() && (c as any).direccionExacta) {
    const parts = [(c as any).direccionExacta];
    if ((c as any).distrito) parts.push((c as any).distrito);
    if ((c as any).canton) parts.push((c as any).canton);
    if ((c as any).provincia) parts.push((c as any).provincia);
    deliveryAddress = parts.join(", ");
  }

  if (!deliveryAddress.trim()) {
    deliveryAddress = c.ruta ? `Ruta: ${c.ruta}` : "";
  }

  return { deliveryAddress, courierService };
}

export function EncomiendaBulkLabelModal({
  queue,
  onClose,
}: EncomiendaBulkLabelModalProps) {
  const [results, setResults] = useState<BulkResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!queue.length) return;
    setLoading(true);
    initializeEncomiendaLookup()
      .catch((e) => console.warn("[BulkLabelModal] Lookup init failed:", e))
      .finally(() => {
        Promise.all(
          queue.map(async (item): Promise<BulkResult> => {
            try {
              const res = await firebaseApi.customers.getBySlCode(item.slCode);
              if (!res.success || !res.data)
                throw new Error("Cliente no encontrado");
              const c = res.data as CustomerInfo;
              const { deliveryAddress, courierService } = resolveAddress(
                c,
                item.encomiendaName,
              );
              const hasMissingData = !deliveryAddress || !courierService;
              const preview: ParcelPreview = {
                parcelId: `PCL-${Date.now()}-${item.slCode}`,
                slCode: item.slCode,
                recipientName: c.fullName ?? item.clientName,
                recipientPhone: c.phone,
                recipientDni: c.dni,
                deliveryAddress: deliveryAddress || "",
                courierService: courierService || "",
                trackings: item.trackings,
                ruta: item.ruta ?? c.ruta,
                createdAt: new Date().toISOString(),
              };
              return {
                data: item,
                preview,
                customer: c,
                hasMissingData,
                ...(hasMissingData ? { error: "Sin dirección de encomienda o servicio configurado" } : {})
              };
            } catch (err) {
              const preview: ParcelPreview = {
                parcelId: `PCL-${Date.now()}-${item.slCode}`,
                slCode: item.slCode,
                recipientName: item.clientName || "",
                recipientPhone: "",
                recipientDni: "",
                deliveryAddress: "",
                courierService: item.encomiendaName || "",
                trackings: item.trackings,
                ruta: item.ruta || "",
                createdAt: new Date().toISOString(),
              };
              return {
                data: item,
                preview,
                customer: null,
                hasMissingData: true,
                error: String(err),
              };
            }
          }),
        )
          .then((raw) => {
            // Sort by courier service name so labels print grouped by encomienda provider.
            // Errors (preview === null) are pushed to the end with the \uFFFF sentinel.
            const sorted = [...raw].sort((a, b) => {
              const sa = a.preview?.courierService ?? "\uFFFF";
              const sb = b.preview?.courierService ?? "\uFFFF";
              return sa.localeCompare(sb, "es", { sensitivity: "base" });
            });
            setResults(sorted);
          })
          .finally(() => setLoading(false));
      });
  }, [queue]);

  const handlePrintAll = useCallback(() => {
    const valid = results.filter((r) => r.preview !== null);
    if (!valid.length) return;
    const rows: ShippingLabelRow[] = valid.map((r) => ({
      slCode: r.preview!.slCode,
      recipientName: r.preview!.recipientName,
      recipientPhone: r.preview!.recipientPhone ?? "",
      recipientDni: r.preview!.recipientDni ?? "",
      deliveryAddress: r.preview!.deliveryAddress ?? "",
      ruta: r.preview!.ruta ?? "",
      courierService: r.preview!.courierService ?? "",
      trackings: r.preview!.trackings,
      createdAt: r.preview!.createdAt,
      customerPhone: r.customer?.phone ?? "",
      customerDni: r.customer?.dni ?? "",
    }));
    const html = buildShippingLabelHTML(rows, true, window.location.origin);
    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [results]);

  const handlePrintCompleteOnly = useCallback(() => {
    const complete = results.filter((r) => r.preview !== null && !r.hasMissingData);
    if (!complete.length) return;
    const rows: ShippingLabelRow[] = complete.map((r) => ({
      slCode: r.preview!.slCode,
      recipientName: r.preview!.recipientName,
      recipientPhone: r.preview!.recipientPhone ?? "",
      recipientDni: r.preview!.recipientDni ?? "",
      deliveryAddress: r.preview!.deliveryAddress ?? "",
      ruta: r.preview!.ruta ?? "",
      courierService: r.preview!.courierService ?? "",
      trackings: r.preview!.trackings,
      createdAt: r.preview!.createdAt,
      customerPhone: r.customer?.phone ?? "",
      customerDni: r.customer?.dni ?? "",
    }));
    const html = buildShippingLabelHTML(rows, true, window.location.origin);
    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }, [results]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const okCount = results.filter((r) => r.preview !== null).length;
  const failCount = results.filter((r) => r.hasMissingData || r.preview === null).length;

  const printRows = useMemo<BulkResult[][]>(() => {
    const valid = results.filter((r) => r.preview !== null);
    const rows: BulkResult[][] = [];
    for (let i = 0; i < valid.length; i += 2) rows.push(valid.slice(i, i + 2));
    return rows;
  }, [results]);

  return (
    <AnimatePresence>
      <motion.div
        id="enc-bulk-label-root"
        key="enc-bulk-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-background overflow-y-auto"
      >
        {/* Toolbar */}
        <div className="enc-bulk-chrome sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-3 flex items-center gap-3">
          <Tag className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm">
            Vista Previa — {queue.length} etiqueta
            {queue.length !== 1 ? "s" : ""}
          </span>
          {!loading && (
            <>
              {okCount > 0 && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                  {okCount} lista{okCount !== 1 ? "s" : ""}
                </span>
              )}
              {failCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {failCount} sin datos
                </span>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!loading && okCount > 0 && (
              <>
                {failCount > 0 && okCount - failCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePrintCompleteOnly}
                    className="gap-1.5 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/60 dark:text-emerald-400 dark:hover:bg-emerald-950/20 font-medium no-print"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir completas ({okCount - failCount})
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handlePrintAll}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir todas ({okCount})
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Screen preview — all results, errors shown */}
        <div className="enc-bulk-screen-area px-6 py-6 space-y-8 max-w-[9in] mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">
                Generando {queue.length} etiqueta{queue.length !== 1 ? "s" : ""}
                …
              </span>
            </div>
          ) : (
            <div className="space-y-6">
              {failCount > 0 && (
                <div className="border border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 rounded-lg p-4 text-sm text-amber-700 dark:text-amber-400 flex flex-col gap-2 no-print shadow-sm">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-500 animate-bounce" />
                    <span>Atención: {failCount} etiqueta{failCount !== 1 ? 's' : ''} se generarán con campos en blanco</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Los siguientes clientes no tienen una dirección de encomienda o servicio de transporte válido configurado en su perfil. Sus etiquetas se imprimirán, pero los campos de dirección y transportista saldrán vacíos:
                  </p>
                  <ul className="list-disc pl-5 text-xs font-semibold space-y-1.5 mt-1">
                    {results
                      .filter((r) => r.hasMissingData || r.preview === null)
                      .map((r) => (
                        <li key={r.data.slCode} className="text-amber-700 dark:text-amber-400">
                          <span className="font-bold">{r.data.clientName || 'Cliente sin nombre'}</span> ({r.data.slCode})
                          {r.error ? <span className="font-normal text-muted-foreground/90"> — {r.error}</span> : ''}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {results.map((r) => (
                <div
                  key={r.data.slCode}
                  className={`enc-bulk-label-item relative ${r.hasMissingData ? "border-2 border-amber-400 rounded-lg p-2 bg-amber-50/20" : r.preview ? "" : " enc-bulk-label-error no-print"}`}
                >
                  {r.hasMissingData && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded shadow-sm flex items-center gap-1 z-10 no-print">
                      <AlertTriangle className="h-3 w-3" />
                      FALTAN DATOS (IMPRIME EN BLANCO)
                    </div>
                  )}
                  {r.preview ? (
                    <ShippingLabelPrint
                      parcel={r.preview}
                      customer={r.customer}
                    />
                  ) : (
                    <div className="border border-destructive/40 rounded-lg p-4 text-sm text-destructive flex items-center gap-2 bg-destructive/5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        <strong>{r.data.clientName}</strong> ({r.data.slCode}) —{" "}
                        {r.error ??
                          "Sin datos suficientes para generar la etiqueta"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
