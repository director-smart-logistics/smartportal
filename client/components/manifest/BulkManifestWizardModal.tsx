/**
 * BulkManifestWizardModal
 *
 * Reusable manifest-change wizard for bulk-selected packages.
 * Shared between PackagesDataTable and RoutesManagement.
 *
 * Flow:
 *  1. input         — user types / picks the target manifest number
 *  2. checking      — fetches active invoices linked to selected packages
 *  3. invoice_decision — per-invoice decision: annul / move all / move selected only
 *  4. executing     — runs the Firestore batch and manifest-doc updates
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  FileText,
  X,
  Check,
  Package as PackageIcon,
  ArrowRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { writeBatch, doc, collection, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { getInvoiceByTracking } from "@/lib/firebase/firestore-client";
import {
  movePackagesBetweenManifestDocs,
  upsertPackagesToManifestDoc,
  batchUpdateConsolidationManifest,
} from "@/lib/services/manifest-consolidation-service";
import { useToast } from "@/hooks/use-toast";
import { useAudit } from "@/hooks/use-audit";
import { syncManifestEncomiendaFromPackages } from "@/lib/services/manifest-processor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WizardPackage {
  id: string;
  /** Routes use `tracking`, Packages page uses `trackingNumber` */
  trackingNumber?: string;
  tracking?: string;
  manifestNumber?: string;
  weight?: number;
  slCode?: string;
  customerName?: string;
  customerEmail?: string;
  email?: string;
  ruta?: string;
  destination?: string;
  price?: number;
  calculatedCost?: number;
  description?: string;
  permisos?: boolean;
  [key: string]: any;
}

interface InvoiceQueueItem {
  invoiceId: string;
  invoice: Record<string, any>;
  matchedPkgs: WizardPackage[];
  totalItems: number;
  hasMultipleItems: boolean;
}

type WizardStep = "input" | "checking" | "invoice_decision" | "executing";

interface Decision {
  invoiceId: string;
  invoiceNumber: string;
  action: "annul" | "move_all" | "move_selected_only";
}

const INVALID_MANIFEST_STATUSES = new Set([
  "closed",
  "cancelled",
  "void",
  "archived",
  "anulado",
  "cerrado",
]);

function defaultManifestFilter(manifest: any): boolean {
  const s = (manifest.status ?? "").toLowerCase().trim();
  return !s || !INVALID_MANIFEST_STATUSES.has(s);
}

// ── Inline autocomplete (no portal — stays inside the Dialog z-context) ────────

function ManifestAutocomplete({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? options.filter((o) =>
        o.toLowerCase().includes(value.trim().toLowerCase()),
      )
    : options;

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          autoComplete="off"
          placeholder="Buscar o escribir manifiesto…"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="pl-8 text-sm font-mono"
          aria-label="Manifiesto destino"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(true);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg text-sm"
        >
          {filtered.map((mn) => (
            <li
              key={mn}
              role="option"
              aria-selected={value === mn}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(mn);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer font-mono text-xs",
                "hover:bg-accent hover:text-accent-foreground",
                value === mn && "bg-accent/60 font-semibold",
              )}
            >
              <Check
                className={cn(
                  "h-3 w-3 shrink-0",
                  value === mn ? "opacity-100 text-emerald-600" : "opacity-0",
                )}
              />
              {mn}
            </li>
          ))}
        </ul>
      )}

      {open && value.trim() && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-xs text-muted-foreground">
          Sin resultados — se usará el valor escrito directamente
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface BulkManifestWizardModalProps {
  open: boolean;
  onClose: () => void;
  /** The packages selected for the manifest change */
  packages: WizardPackage[];
  /**
   * Full visible package list — used by move_all to pull in extra packages
   * from the same invoice that weren't explicitly selected.
   */
  allPackages?: WizardPackage[];
  onSuccess?: (movedCount: number) => void;
  /**
   * Pre-computed list of manifest numbers to show in the dropdown.
   * When provided (non-empty), the internal firestoreApi.manifests.list() query
   * is skipped — these values are used directly as options.
   * Ideal for callers that already have the manifest list (e.g. RoutesManagement).
   */
  availableManifests?: string[];
  /**
   * Optional filter applied to the manifest dropdown list.
   * Defaults to excluding closed / cancelled / void / archived manifests.
   */
  filterManifest?: (manifest: any) => boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkManifestWizardModal({
  open,
  onClose,
  packages,
  allPackages = [],
  onSuccess,
  availableManifests,
  filterManifest = defaultManifestFilter,
}: BulkManifestWizardModalProps) {
  const { toast } = useToast();
  const { log: auditLog } = useAudit();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>("input");
  const [newManifest, setNewManifest] = useState("");

  const [invoiceQueue, setInvoiceQueue] = useState<InvoiceQueueItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [executing, setExecuting] = useState(false);

  // Reset wizard when dialog opens
  useEffect(() => {
    if (open) {
      setStep("input");
      setNewManifest("");
      setInvoiceQueue([]);
      setCurrentIdx(0);
      setDecisions([]);
      setExecuting(false);
    }
  }, [open]);

  // ── Manifest autocomplete ──────────────────────────────────────────────────
  // Skip the Firestore query when the caller provides a pre-computed list.
  const useExternalList =
    Array.isArray(availableManifests) && availableManifests.length > 0;

  const { data: manifestList = [] } = useQuery({
    queryKey: ["manifests", "wizard-select"],
    queryFn: async () => {
      const res = await firestoreApi.manifests.list({
        pageSize: 300,
        orderByField: "createdAt",
        orderDirection: "desc",
      });
      return (res.data || []) as Array<{
        id: string;
        manifestNumber?: string;
        manifestType?: string;
      }>;
    },
    staleTime: 1000 * 60 * 5,
    enabled: open && !useExternalList,
  });

  const manifestOptions: string[] = useExternalList
    ? Array.from(
        new Set(availableManifests.map((m) => m.trim()).filter(Boolean)),
      ).sort()
    : Array.from(
        new Set(
          manifestList
            .filter(filterManifest)
            .map((m) => m.manifestNumber?.trim())
            .filter((n): n is string => !!n),
        ),
      ).sort();

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resolveTracking = (pkg: WizardPackage): string =>
    (pkg.trackingNumber || pkg.tracking || "").trim();

  // ── Start: check invoices after manifest input ─────────────────────────────

  const handleStartWizard = useCallback(async () => {
    const target = newManifest.trim();
    if (!target) return;
    setStep("checking");

    try {
      const invoiceMap: Record<
        string,
        { invoice: Record<string, any>; matchedPkgs: WizardPackage[] }
      > = {};

      await Promise.allSettled(
        packages.map(async (pkg) => {
          const trackingKey = resolveTracking(pkg);
          if (!trackingKey) return;
          const results = await getInvoiceByTracking(trackingKey);
          const active = results.find(
            (inv) =>
              !["annulled", "void", "cancelled"].includes(
                ((inv as any).status || "").toLowerCase(),
              ),
          );
          if (!active || !(active as any).id) return;
          const invId = (active as any).id as string;
          if (!invoiceMap[invId])
            invoiceMap[invId] = {
              invoice: active as Record<string, any>,
              matchedPkgs: [],
            };
          invoiceMap[invId].matchedPkgs.push(pkg);
        }),
      );

      const queue: InvoiceQueueItem[] = Object.entries(invoiceMap)
        .map(([invoiceId, { invoice, matchedPkgs }]) => {
          const trackingNumbers: string[] = [
            ...((invoice.trackingNumbers as string[]) || []),
            invoice.trackingNumber as string,
          ].filter(Boolean);
          const allItems: any[] = (invoice.items as any[]) || [];
          const totalItems =
            allItems.length > 0 ? allItems.length : trackingNumbers.length || 1;
          return {
            invoiceId,
            invoice,
            matchedPkgs,
            totalItems,
            hasMultipleItems: totalItems > 1,
          };
        })
        .filter((q) => q.matchedPkgs.length > 0);

      if (queue.length === 0) {
        setStep("executing");
        await runExecute(packages, target, [], []);
      } else {
        setInvoiceQueue(queue);
        setCurrentIdx(0);
        setDecisions([]);
        setStep("invoice_decision");
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Error al verificar facturas",
        variant: "destructive",
      });
      onClose();
    }
  }, [newManifest, packages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Invoice decision ────────────────────────────────────────────────────────

  const handleDecide = useCallback(
    async (action: Decision["action"]) => {
      const current = invoiceQueue[currentIdx];
      const inv = current.invoice;
      const newDecisions: Decision[] = [
        ...decisions,
        {
          invoiceId: current.invoiceId,
          invoiceNumber:
            (inv.invoiceNumber as string) ||
            (inv.number as string) ||
            `#${current.invoiceId.slice(-6)}`,
          action,
        },
      ];

      if (currentIdx + 1 < invoiceQueue.length) {
        setCurrentIdx((i) => i + 1);
        setDecisions(newDecisions);
      } else {
        setStep("executing");
        await runExecute(
          packages,
          newManifest.trim(),
          newDecisions,
          invoiceQueue,
        );
      }
    },
    [invoiceQueue, currentIdx, decisions, packages, newManifest], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Execute ────────────────────────────────────────────────────────────────

  const runExecute = useCallback(
    async (
      pkgsToMove: WizardPackage[],
      target: string,
      decs: Decision[],
      queue: InvoiceQueueItem[],
    ) => {
      setExecuting(true);
      const now = new Date().toISOString();
      try {
        let allPkgsToMove = [...pkgsToMove];

        for (const decision of decs) {
          const queueItem = queue.find(
            (q) => q.invoiceId === decision.invoiceId,
          );
          if (!queueItem) continue;

          if (decision.action === "annul") {
            await firestoreApi.invoices
              .update(decision.invoiceId, {
                status: "annulled",
                annulledAt: now,
                annulledReason: `Paquetes movidos al manifiesto ${target}`,
              })
              .catch(() => {});
          } else if (decision.action === "move_all") {
            const invTrackings: string[] = [
              ...((queueItem.invoice.trackingNumbers as string[]) || []),
              queueItem.invoice.trackingNumber as string,
            ].filter(Boolean);
            const extraPkgs = [...allPackages, ...pkgsToMove].filter(
              (p) =>
                resolveTracking(p) &&
                invTrackings.includes(resolveTracking(p)) &&
                !allPkgsToMove.find((sp) => sp.id === p.id),
            );
            allPkgsToMove = [...allPkgsToMove, ...extraPkgs];
          }
        }

        // Deduplicate
        const seen = new Set<string>();
        allPkgsToMove = allPkgsToMove.filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });

        // 🚨 Strict category separation guard: Regular vs Permits (DANP)
        const isPermisoBatch = allPkgsToMove.some(
          (p: any) => p.permisos || p.isPermiso || p.requiresPermit || String(p.manifestNumber || '').toUpperCase().endsWith('DANP') || String(p.manifestNumber || '').toUpperCase().includes('PERMISO')
        );
        const targetIsPermiso = target.toUpperCase().endsWith('DANP') || target.toUpperCase().includes('PERMISO') || target.toUpperCase().includes('PERMIT');
        if (isPermisoBatch !== targetIsPermiso) {
          throw new Error(
            isPermisoBatch
              ? 'Los paquetes seleccionados son de permisos y no pueden trasladarse a un manifiesto regular.'
              : 'Los paquetes seleccionados son regulares y no pueden trasladarse a un manifiesto de permisos (DANP).'
          );
        }

        // Batch update packages → new manifestNumber
        const BATCH_SIZE = 490;
        for (let i = 0; i < allPkgsToMove.length; i += BATCH_SIZE) {
          const chunk = allPkgsToMove.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((pkg) => {
            const originalManifest = (pkg.manifestNumber as string) || null;
            batch.update(doc(collection(db, "packages"), pkg.id), {
              manifestNumber: target,
              manifestId: target,
              updatedManifest: target,
              manifestUpdatedAt: now,
              ...(originalManifest && originalManifest !== target
                ? { originalManifestID: originalManifest }
                : {}),
            });
          });
          await batch.commit();
        }

        // Sync manifest_encomiendas for the destination manifest.
        // Reads from packages (source of truth) to overwrite any stale docs.
        syncManifestEncomiendaFromPackages(target).catch(() => {});

        // Update manifest docs
        await upsertPackagesToManifestDoc(
          target,
          allPkgsToMove.map((p) => ({
            tracking: resolveTracking(p) || p.id,
            slCode: p.slCode || "",
            customerName: p.customerName || "",
            customerEmail: p.customerEmail || p.email || "",
            ruta: p.ruta || p.destination || "",
            weight: p.weight || 0,
            price: p.price || p.calculatedCost || 0,
            description: p.description || "",
            permisos: p.permisos ?? false,
          })),
        ).catch(() => {});

        const trackings = allPkgsToMove
          .map((p) => resolveTracking(p))
          .filter(Boolean);
        await batchUpdateConsolidationManifest(trackings, target).catch(
          () => {},
        );

        const oldManifests = new Set(
          allPkgsToMove.map((p) => p.manifestNumber).filter(Boolean),
        );
        await Promise.all(
          Array.from(oldManifests)
            .filter((old) => old !== target)
            .map((old) =>
              movePackagesBetweenManifestDocs(
                trackings,
                old as string,
                target,
              ).catch(() => {}),
            ),
        );

        // Audit — one event per source manifest
        Array.from(oldManifests)
          .filter((old) => old !== target)
          .forEach((old) => {
            const countFromOld =
              allPkgsToMove.filter((p) => p.manifestNumber === old).length ||
              allPkgsToMove.length;
            auditLog({
              action: "manifest_packages_moved",
              category: "manifest",
              resource: "manifests",
              resourceId: target,
              result: "success",
              metadata: {
                fromManifest: old,
                toManifest: target,
                count: countFromOld,
              },
            });
          });

        // Invalidate caches
        queryClient.invalidateQueries({ queryKey: ["packages"] });
        queryClient.invalidateQueries({ queryKey: ["route-packages"] });

        toast({
          title: "Manifiesto actualizado",
          description: `${allPkgsToMove.length} paquete${allPkgsToMove.length !== 1 ? "s" : ""} movido${allPkgsToMove.length !== 1 ? "s" : ""} al manifiesto ${target}`,
        });

        onSuccess?.(allPkgsToMove.length);
        onClose();
      } catch (err: any) {
        toast({
          title: "Error al actualizar manifiesto",
          description: err.message || "Error inesperado",
          variant: "destructive",
        });
        onClose();
      } finally {
        setExecuting(false);
      }
    },
    [allPackages, queryClient, toast, onSuccess, onClose], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const isBlocking = step === "checking" || step === "executing" || executing;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isBlocking) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "checking" && (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <span>Verificando facturas asociadas…</span>
              </>
            )}
            {step === "invoice_decision" && (
              <>
                <FileText className="h-5 w-5 text-amber-500" />
                <span>Factura activa encontrada</span>
                {invoiceQueue.length > 1 && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    ({currentIdx + 1} de {invoiceQueue.length})
                  </span>
                )}
              </>
            )}
            {step === "executing" && (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-green-500" />
                <span>Aplicando cambios…</span>
              </>
            )}
            {step === "input" && (
              <>
                <ArrowRight className="h-5 w-5 text-primary" />
                <span>Cambiar manifiesto</span>
              </>
            )}
          </DialogTitle>

          {step === "input" && (
            <DialogDescription>
              {packages.length} paquete{packages.length !== 1 ? "s" : ""}{" "}
              seleccionado{packages.length !== 1 ? "s" : ""}. Elige el
              manifiesto de destino.
            </DialogDescription>
          )}
          {step === "invoice_decision" && (
            <DialogDescription>
              Los paquetes seleccionados pertenecen a una factura activa. Indica
              cómo deseas proceder antes de mover al manifiesto{" "}
              <strong>{newManifest}</strong>.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ── Step: input ── */}
        {step === "input" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Manifiesto destino</label>
              <ManifestAutocomplete
                value={newManifest}
                onChange={setNewManifest}
                options={manifestOptions}
              />
            </div>

            {/* Package preview */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Paquetes ({packages.length})
              </p>
              <div className="border rounded-md divide-y max-h-36 overflow-y-auto text-xs">
                {packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="flex items-center justify-between px-3 py-1.5"
                  >
                    <span className="font-mono text-foreground truncate">
                      {resolveTracking(pkg) || pkg.id}
                    </span>
                    <span className="text-muted-foreground shrink-0 ml-2">
                      {pkg.manifestNumber || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!newManifest.trim()}
                onClick={handleStartWizard}
              >
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: checking ── */}
        {step === "checking" && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
            <p className="text-sm text-muted-foreground">
              Consultando facturas vinculadas a los paquetes seleccionados…
            </p>
          </div>
        )}

        {/* ── Step: executing ── */}
        {step === "executing" && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-green-400" />
            <p className="text-sm text-muted-foreground">
              Aplicando cambios al manifiesto y actualizando facturas…
            </p>
          </div>
        )}

        {/* ── Step: invoice_decision ── */}
        {step === "invoice_decision" &&
          (() => {
            const item = invoiceQueue[currentIdx];
            if (!item) return null;
            const inv = item.invoice;
            const invNumber =
              (inv.invoiceNumber as string) ||
              (inv.number as string) ||
              `#${item.invoiceId.slice(-6)}`;
            const invStatus = (inv.status as string) || "pending";
            const invTotal = inv.total
              ? `$${Number(inv.total).toFixed(2)}`
              : "—";
            const invClient =
              (inv.clientName as string) || (inv.customerName as string) || "—";
            const invSlCode =
              (inv.slCode as string) || (inv.clientSlCode as string) || "";

            return (
              <div className="space-y-4 py-2">
                {/* Invoice card */}
                <div className="border border-amber-200 rounded-lg bg-amber-50/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{invNumber}</div>
                      <div className="text-sm text-muted-foreground mt-0.5 truncate uppercase">
                        {invClient}
                      </div>
                      {invSlCode && (
                        <span className="text-[10px] font-mono bg-background border rounded mt-1 inline-block px-1.5 py-0.5">
                          {invSlCode}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{invTotal}</div>
                      <Badge className="mt-1 text-[10px] capitalize">
                        {invStatus}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {item.totalItems} ítem{item.totalItems !== 1 ? "s" : ""} en
                    esta factura
                  </div>
                </div>

                {/* Matched packages */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Paquete{item.matchedPkgs.length !== 1 ? "s" : ""}{" "}
                    seleccionado
                    {item.matchedPkgs.length !== 1 ? "s" : ""} (
                    {item.matchedPkgs.length})
                  </p>
                  <div className="border rounded-md divide-y max-h-24 overflow-y-auto">
                    {item.matchedPkgs.map((pkg) => (
                      <div
                        key={pkg.id}
                        className="flex items-center justify-between px-3 py-1.5 text-xs"
                      >
                        <span className="font-mono truncate">
                          {resolveTracking(pkg)}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {((pkg.weight as number) ?? 0).toFixed(2)} kg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Destination indicator */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted border rounded-md px-3 py-2">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  Mover a manifiesto{" "}
                  <strong className="text-foreground ml-1">
                    {newManifest}
                  </strong>
                </div>

                {/* Decision buttons */}
                <div className="space-y-2 pt-1">
                  <p className="text-sm font-medium">
                    ¿Qué deseas hacer con esta factura?
                  </p>

                  <button
                    type="button"
                    onClick={() => handleDecide("annul")}
                    disabled={executing}
                    className="w-full flex items-start gap-3 px-4 py-3 border-2 border-red-200 hover:border-red-400 hover:bg-red-50/50 rounded-lg transition-colors text-left disabled:opacity-50"
                  >
                    <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-red-400 flex items-center justify-center">
                      <X className="h-3 w-3 text-red-500" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-red-700">
                        Anular esta factura
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        La factura quedará marcada como anulada. Se moverán los
                        paquetes seleccionados.
                      </div>
                    </div>
                  </button>

                  {item.hasMultipleItems && (
                    <button
                      type="button"
                      onClick={() => handleDecide("move_all")}
                      disabled={executing}
                      className="w-full flex items-start gap-3 px-4 py-3 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg transition-colors text-left disabled:opacity-50"
                    >
                      <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center">
                        <PackageIcon className="h-3 w-3 text-blue-500" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-blue-700">
                          Mover TODOS los paquetes de la factura
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Los {item.totalItems} paquetes de la factura se
                          moverán al nuevo manifiesto. La factura se mantiene.
                        </div>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDecide("move_selected_only")}
                    disabled={executing}
                    className="w-full flex items-start gap-3 px-4 py-3 border-2 border-border hover:border-foreground/40 hover:bg-accent/50 rounded-lg transition-colors text-left disabled:opacity-50"
                  >
                    <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 border-muted-foreground flex items-center justify-center">
                      <Check className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        Solo mover{" "}
                        {item.matchedPkgs.length === 1
                          ? "este paquete"
                          : `estos ${item.matchedPkgs.length} paquetes`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {item.hasMultipleItems
                          ? "La factura se mantiene con sus otros ítems. Solo se actualiza el manifiesto del paquete seleccionado."
                          : "La factura se mantiene tal cual. Solo se actualiza el manifiesto del paquete."}
                      </div>
                    </div>
                  </button>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    disabled={executing}
                  >
                    Cancelar operación
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
      </DialogContent>
    </Dialog>
  );
}
