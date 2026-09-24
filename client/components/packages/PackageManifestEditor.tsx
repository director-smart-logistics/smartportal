/**
 * PackageManifestEditor.tsx
 *
 * Inline editor for the `manifestNumber` field in the expanded /packages row and spreadsheet cells.
 *
 * ARCHITECTURAL DESIGN & INVARIANTS:
 * 1. Non-regressive Standard Manifest Moves:
 *    - Moving a package to a standard physical manifest (e.g. "MAN-2026-OCT") preserves the exact
 *      existing production workflow: updating the package document, mirroring the tracking in
 *      the manifest documents, and synchronizing the consolidation manifest doc.
 *
 * 2. Virtual Manifest Option ("Consolidación Transitoria"):
 *    - In addition to physical manifests, this editor exposes the virtual bucket "consolidacion_transitoria".
 *    - Search query normalization allows operators to find it using either spaces ("consolidacion transitoria")
 *      or raw database identifiers with underscores ("consolidacion_", "consolidacion_transitoria").
 *
 * 3. Invoice State & Multi-Package Safety:
 *    - Active Invoice (`invoiceId` present):
 *      Moving to transitoria annuls the invoice (mirroring `handleAnnulInvoice`).
 *      If the invoice has sibling packages (multi-package invoice), an explicit confirmation modal
 *      (AlertDialog) is presented listing all sibling trackings that will be moved together in a single batch.
 *      If it is a single-package invoice, confirmation proceeds directly with an inline warning.
 *      PAID invoices are strictly blocked and cannot be annulled or moved to transitoria.
 *    - ALREADY-Annulled Invoice with a lingering package (orphaned-package recovery):
 *      `moveInvoiceToTransitoria` does NOT no-op when the invoice is already annulled/
 *      cancelled/void — it skips the (redundant) invoice-annul write but STILL finds
 *      and moves any package still linked to it. This is the exact production
 *      incident this feature exists to fix: an invoice gets annulled, but a
 *      package's `invoiceId`/`invoiceNumber` link is never cleaned up, so it never
 *      actually reaches consolidacion_transitoria. See `invoiceAlreadyAnnulled` on
 *      TransitoriaMoveResult (invoice-service.ts).
 *    - Annulled Invoice (`annulledInvoiceNumber` present or detected):
 *      If the package's invoice was previously annulled, the UI explicitly recognizes it
 *      ("Factura [NUMBER] ya se encuentra anulada (desvinculada)") rather than falsely claiming "Paquete sin factura".
 *    - Unlinked Package (no invoice):
 *      The package is moved individually via `moveUnlinkedPackageToTransitoria`.
 *
 * 4. Sibling-Count Accuracy (previewPackagesLinkedToInvoice):
 *    - The confirmation preview (`fetchSiblings`) calls the EXACT SAME
 *      `previewPackagesLinkedToInvoice` → `findPackagesLinkedToInvoice` dual-query
 *      (invoiceId OR invoiceNumber, deduped) that `moveInvoiceToTransitoria` itself
 *      uses to decide what to move. Do NOT replace this with a narrower, single-field
 *      query in this component — packages in this codebase can have `invoiceId` and
 *      `invoiceNumber` drift out of sync (legacy data), and a preview built on a
 *      different query than the mover can silently under-count what actually moves.
 *    - `packageId` is only excluded from the sibling list when it is ACTUALLY found
 *      among the linked packages (`selfIncludedInLinked`). This editor is also
 *      rendered on the Invoices page (InvoicesSpreadsheetRow.tsx) where `packageId`
 *      is really the invoice's own doc id, not a real package id — in that case
 *      `packageId` never matches any linked package, and the UI must show the real
 *      total instead of fabricating a "(this package)" entry and off-by-one count.
 *    - `handleSelectTarget`'s own conditional fetch is guarded by `!loadingSiblings`
 *      in addition to `!siblingsFetched`, to avoid a duplicate concurrent call
 *      racing the eager prefetch effect (whichever resolves last would otherwise
 *      silently win and could overwrite a correct sibling list with a stale one).
 */
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Edit2,
  FileText,
  AlertTriangle,
  Loader2,
  ArrowRightLeft,
  Layers,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import {
  batchUpdateConsolidationManifest,
  movePackagesBetweenManifestDocs,
} from "@/lib/services/manifest-consolidation-service";
import {
  moveInvoiceToTransitoria,
  moveUnlinkedPackageToTransitoria,
  previewPackagesLinkedToInvoice,
} from "@/lib/services/invoice-service";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ManifestOption {
  id: string;
  manifestNumber?: string;
  manifestType?: string;
}

export interface PackageManifestEditorProps {
  /** Unique Firestore package document ID */
  packageId: string;
  /** Tracking number (e.g. "TRK-12345" or carrier tracking) */
  trackingNumber: string;
  /** Current manifest identifier or number assigned to this package */
  currentManifest: string;
  /** Customer SmartLogistics ID (e.g. "SL3506") */
  slCode: string;
  /** Customer display name */
  customerName: string;
  /** Package weight in lbs */
  weight: number;
  /** Declared package price/value */
  price: number;
  /** Package contents description */
  description: string;
  /** Whether the package requires special permits/permisos */
  permisos: boolean;
  /** List of available real manifests from Firestore */
  manifests: ManifestOption[];
  /** Active invoice ID, if linked to a non-annulled invoice */
  invoiceId?: string;
  /** Annulled invoice number, if invoice was already annulled */
  annulledInvoiceNumber?: string;
  /** Annulled invoice ID, if available */
  annulledInvoiceId?: string;
  /** Optional custom CSS classes for the popover trigger button */
  triggerClassName?: string;
  /** Controlled popover open state */
  open?: boolean;
  /** Callback for popover open state changes */
  onOpenChange?: (open: boolean) => void;
}

export function PackageManifestEditor({
  packageId,
  trackingNumber,
  currentManifest,
  slCode,
  customerName,
  weight,
  price,
  description,
  permisos,
  manifests,
  invoiceId,
  annulledInvoiceNumber,
  annulledInvoiceId,
  triggerClassName,
  open,
  onOpenChange,
}: PackageManifestEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [localOpen, setLocalOpen] = useState(false);
  const popoverOpen = open !== undefined ? open : localOpen;
  const setPopoverOpen = (val: boolean) => {
    setLocalOpen(val);
    onOpenChange?.(val);
  };
  const [search, setSearch] = useState("");
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Sibling packages for invoice-linked transitoria move
  const [siblingPackages, setSiblingPackages] = useState<{ id: string; trackingNumber: string }[]>([]);
  // Whether `packageId` was actually found among the invoice's linked packages.
  // Only true at the normal call site (Packages page, one row = one real package).
  // On the Invoices page, this editor is rendered per-INVOICE (packageId is the
  // invoice's own doc id, not a package id) — there `packageId` never matches any
  // linked package, so we must not try to single one out as "this package".
  const [selfIncludedInLinked, setSelfIncludedInLinked] = useState(true);
  const [loadingSiblings, setLoadingSiblings] = useState(false);
  const [siblingsFetched, setSiblingsFetched] = useState(false);
  const [showSiblingModal, setShowSiblingModal] = useState(false);
  const [detectedAnnulledNumber, setDetectedAnnulledNumber] = useState<string>(annulledInvoiceNumber || "");

  useEffect(() => {
    if (annulledInvoiceNumber) {
      setDetectedAnnulledNumber(annulledInvoiceNumber);
    }
  }, [annulledInvoiceNumber]);

  const effectiveAnnulledInvoiceNumber = annulledInvoiceNumber || detectedAnnulledNumber;

  // Eager prefetch: as soon as the popover opens, query in the background so there's
  // zero lag when selecting transitoria. Uses the SAME dual-query (invoiceId OR
  // invoiceNumber, deduped) that moveInvoiceToTransitoria itself uses to find what
  // it will move — via the shared previewPackagesLinkedToInvoice helper — so this
  // preview can never under-count relative to what actually gets moved.
  const fetchSiblings = useCallback(async (targetInvoiceId: string) => {
    if (!targetInvoiceId) return;
    setLoadingSiblings(true);
    try {
      const preview = await previewPackagesLinkedToInvoice(targetInvoiceId);
      const selfIncluded = preview.packages.some((p) => p.id === packageId);
      setSelfIncludedInLinked(selfIncluded);
      setSiblingPackages(selfIncluded ? preview.packages.filter((p) => p.id !== packageId) : preview.packages);
      setSiblingsFetched(true);
    } catch (err) {
      console.warn('[PackageManifestEditor] Failed to fetch sibling packages:', err);
      setSiblingPackages([]);
      setSelfIncludedInLinked(true);
    } finally {
      setLoadingSiblings(false);
    }
  }, [packageId]);

  // Reset the fetched sibling list whenever the invoice this package is linked to
  // changes (e.g. a real-time listener reassigns it while the popover stays open) —
  // otherwise `siblingsFetched` would stay true and the stale list would never
  // refresh for the new invoice.
  useEffect(() => {
    setSiblingsFetched(false);
    setSiblingPackages([]);
  }, [invoiceId]);

  useEffect(() => {
    if (popoverOpen && invoiceId && !siblingsFetched) {
      fetchSiblings(invoiceId);
    }
  }, [popoverOpen, invoiceId, siblingsFetched, fetchSiblings]);

  const isPkgPermiso = Boolean(
    permisos ||
    currentManifest.toUpperCase().endsWith('DANP') ||
    currentManifest.toUpperCase().includes('PERMISO')
  );

  const filteredManifests = (manifests || []).filter((m) => {
    const num = m.manifestNumber || m.id;
    if (num === currentManifest) return false;
    const targetIsPermiso = num.toUpperCase().endsWith('DANP') || num.toUpperCase().includes('PERMISO') || num.toUpperCase().includes('PERMIT');
    if (isPkgPermiso !== targetIsPermiso) return false;
    if (!search) return true;
    return num.toLowerCase().includes(search.toLowerCase());
  });

  // Total packages that will actually move if this invoice is confirmed —
  // `siblingPackages` already excludes `packageId` when it was found among the
  // linked packages (selfIncludedInLinked), so add it back for the true total.
  const totalLinkedPackageCount = selfIncludedInLinked ? siblingPackages.length + 1 : siblingPackages.length;

  const isCurrentTransitoria = (currentManifest || "").trim() === 'consolidacion_transitoria';
  const searchClean = (search || "").toLowerCase().trim();
  const searchNorm = searchClean.replace(/_/g, " ");
  const matchesSearch =
    !searchClean ||
    "consolidación transitoria".includes(searchNorm) ||
    "consolidacion transitoria".includes(searchNorm) ||
    "consolidacion_transitoria".includes(searchClean) ||
    "transitoria".includes(searchNorm) ||
    searchNorm.includes("consolidacion") ||
    searchNorm.includes("transitoria");

  // Show option whenever search matches so operators always find it (even if already in transitoria)
  const showTransitoriaOption = matchesSearch;

  const handleSelectTarget = async (target: string) => {
    setPendingTarget(target);
    setSearch("");

    if (target === 'consolidacion_transitoria') {
      // Guard against a duplicate concurrent fetch: the eager prefetch effect may
      // already be in flight (loadingSiblings=true) when the operator clicks this
      // option. Without the `!loadingSiblings` check, a second overlapping call to
      // fetchSiblings races the first one, and whichever resolves last silently
      // wins — occasionally overwriting the correct sibling list with a stale one.
      if (invoiceId && !siblingsFetched && !loadingSiblings) {
        await fetchSiblings(invoiceId);
      } else if (!invoiceId) {
        setSiblingPackages([]);
        if (!effectiveAnnulledInvoiceNumber) {
          try {
            const pSnap = await getDoc(doc(db, 'packages', packageId));
            if (pSnap.exists()) {
              const pData = pSnap.data();
              const annNum = (
                pData?.annulledInvoiceNumber ||
                (pData?.invoiceStatus === 'annulled' ? pData?.invoiceNumber : '') ||
                ''
              ).toString();
              if (annNum) {
                setDetectedAnnulledNumber(annNum);
              }
            }
          } catch (err) {
            console.warn('[PackageManifestEditor] Failed to check annulled invoice:', err);
          }
        }
      }
    } else {
      setSiblingPackages([]);
    }
  };

  const resetState = () => {
    setPopoverOpen(false);
    setPendingTarget(null);
    setSearch("");
    setSiblingPackages([]);
    setSiblingsFetched(false);
    setShowSiblingModal(false);
  };

  const handleConfirmTransitoria = async () => {
    setSaving(true);
    try {
      if (invoiceId) {
        const res = await moveInvoiceToTransitoria(invoiceId, {
          annulledBy: user?.email || user?.id || 'admin',
          reason: 'Movido a Consolidación Transitoria desde celda de Paquetes',
        });

        if (res.skipped === 'paid') {
          toast({
            title: "Factura pagada",
            description: "Esta factura está pagada y no puede anularse desde aquí.",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }

        if (res.skipped === 'not_found') {
          toast({
            title: "Error",
            description: "No se encontró la factura.",
            variant: "destructive",
          });
          setSaving(false);
          return;
        } else if (res.success && res.movedTrackings.length === 0) {
          // Invoice was already annulled and no lingering packages were found —
          // a genuine no-op, distinct from an error.
          toast({
            title: "Sin paquetes pendientes",
            description: `La factura ${res.invoiceNumber} ya estaba anulada y no tenía paquetes vinculados por mover.`,
          });
        } else if (res.success) {
          toast({
            title: "Manifiesto actualizado",
            description: res.invoiceAlreadyAnnulled
              ? `Factura ${res.invoiceNumber} ya estaba anulada — ${res.movedTrackings.length} paquete(s) pendiente(s) trasladado(s) a Consolidación Transitoria.`
              : `Factura ${res.invoiceNumber} anulada y ${res.movedTrackings.length} paquete(s) trasladado(s) a Consolidación Transitoria.`,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["packages"] });
        queryClient.invalidateQueries({ queryKey: ["invoices-cursor"] });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        resetState();
      } else {
        await moveUnlinkedPackageToTransitoria(packageId);
        queryClient.invalidateQueries({ queryKey: ["packages"] });
        toast({
          title: "Manifiesto actualizado",
          description: `Paquete ${trackingNumber || packageId} trasladado a Consolidación Transitoria.`,
        });
        resetState();
      }
    } catch (err: any) {
      toast({
        title: "Error al cambiar manifiesto",
        description: err?.message || "No se pudo actualizar el manifiesto.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingTarget) return;

    if (pendingTarget === 'consolidacion_transitoria') {
      if (isCurrentTransitoria && !invoiceId) return;
      if (invoiceId && totalLinkedPackageCount > 1) {
        setShowSiblingModal(true);
      } else {
        await handleConfirmTransitoria();
      }
      return;
    }

    if (pendingTarget === currentManifest) return;

    setSaving(true);
    const now = new Date().toISOString();
    try {
      // 1. Update package doc — source of truth
      await firestoreApi.packages.update(packageId, {
        manifestNumber: pendingTarget,
        manifestId: pendingTarget,
        updatedManifest: pendingTarget,
        manifestUpdatedAt: now,
      } as any);

      // 2. Best-effort mirror in manifests collection
      if (currentManifest && trackingNumber) {
        await movePackagesBetweenManifestDocs(
          [trackingNumber],
          currentManifest,
          pendingTarget,
        ).catch(() => {});
      }

      // 3. Best-effort update consolidation doc
      if (trackingNumber) {
        await batchUpdateConsolidationManifest(
          [trackingNumber],
          pendingTarget,
        ).catch(() => {});
      }

      // 4. Optimistic cache patch
      queryClient.setQueriesData<any>({ queryKey: ["packages"] }, (old) => {
        if (!old?.data || !Array.isArray(old.data)) return old;
        return {
          ...old,
          data: old.data.map((p: any) =>
            p.id === packageId
              ? {
                  ...p,
                  manifestNumber: pendingTarget,
                  updatedManifest: pendingTarget,
                }
              : p,
          ),
        };
      });

      queryClient.invalidateQueries({ queryKey: ["packages"] });

      toast({
        title: "Manifiesto actualizado",
        description: `Paquete ${trackingNumber || packageId} trasladado a ${pendingTarget}.`,
      });

      resetState();
    } catch (err: any) {
      toast({
        title: "Error al cambiar manifiesto",
        description: err?.message || "No se pudo actualizar el manifiesto.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Popover
        open={popoverOpen}
        onOpenChange={(open) => {
          setPopoverOpen(open);
          if (!open) {
            setPendingTarget(null);
            setSearch("");
            setSiblingPackages([]);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={triggerClassName || "group/manifest flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-violet-50 dark:hover:bg-violet-950/30 cursor-pointer transition-colors w-full text-left"}
            aria-label="Editar manifiesto del paquete"
          >
            {!triggerClassName && <FileText className="h-4 w-4 text-gray-500 shrink-0" />}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={cn("font-mono text-gray-700 dark:text-gray-300 truncate", triggerClassName ? "text-xs font-medium" : "text-sm")}>
                {currentManifest || "—"}
              </span>
              {permisos === true && (
                <span className="inline-flex items-center gap-0.5 text-red-600 font-bold bg-red-50 border border-red-100 px-1 py-0.5 rounded text-[9px] shrink-0" title="Requiere Permiso">
                  <AlertTriangle className="h-2.5 w-2.5 text-red-500 shrink-0" />
                  P
                </span>
              )}
            </div>
            {!triggerClassName && <Edit2 className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover/manifest:opacity-100 transition-opacity shrink-0" />}
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[360px] p-0 z-[300] shadow-xl border bg-popover rounded-lg overflow-hidden"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
              Trasladar a otro Manifiesto
            </span>
            {isPkgPermiso && (
              <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded">
                Solo Permisos
              </span>
            )}
          </div>

          <Command shouldFilter={false} className="border-0 rounded-none">
            <CommandInput
              placeholder="Buscar manifiesto destino..."
              value={search}
              onValueChange={setSearch}
              className="h-9 border-0 border-b focus:ring-0 focus:outline-none text-xs font-mono"
            />
            <CommandList className="max-h-[220px] overflow-y-auto">
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                Sin manifiestos disponibles
              </CommandEmpty>

              {showTransitoriaOption && (
                <div className="p-1 border-b border-border/50">
                  <CommandItem
                    value="consolidacion_transitoria"
                    onSelect={() => handleSelectTarget("consolidacion_transitoria")}
                    className={cn(
                      "py-2 px-3 cursor-pointer rounded-md flex items-center gap-2.5",
                      pendingTarget === "consolidacion_transitoria"
                        ? "bg-orange-100/80 dark:bg-orange-950/60"
                        : "hover:bg-orange-50 dark:hover:bg-orange-950/30",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400",
                        pendingTarget === "consolidacion_transitoria" ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="w-6 h-6 rounded bg-orange-100 dark:bg-orange-950/60 flex items-center justify-center shrink-0 self-center">
                      <Layers className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 leading-tight">
                      <span className="font-mono text-xs font-semibold text-orange-700 dark:text-orange-300">
                        Consolidación Transitoria
                      </span>
                      <span className="text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400 tracking-wider mt-0.5">
                        {isCurrentTransitoria
                          ? (invoiceId ? "Actual · Anular Factura" : (effectiveAnnulledInvoiceNumber ? "Actual · Factura Anulada" : "Actual"))
                          : (effectiveAnnulledInvoiceNumber ? "Factura Anulada" : "Virtual")}
                      </span>
                    </div>
                  </CommandItem>
                </div>
              )}

              <CommandGroup>
                {filteredManifests.map((m) => {
                  const num = m.manifestNumber || m.id;
                  const isSelected = pendingTarget === num;
                  return (
                    <CommandItem
                      key={m.id}
                      value={num}
                      onSelect={() => handleSelectTarget(num)}
                      className="py-1.5 px-3 cursor-pointer hover:bg-accent/60 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-primary",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="font-mono text-xs text-foreground font-medium truncate">
                          {num}
                        </span>
                      </div>
                      {m.manifestType && (
                        <span className="text-[9px] uppercase text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0 font-mono">
                          {m.manifestType.replace("_", " ")}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>

          {pendingTarget && (
            <div className="p-3 border-t bg-muted/10 flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">
                {pendingTarget === 'consolidacion_transitoria' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 font-medium text-orange-600 dark:text-orange-400">
                      <Layers className="h-3.5 w-3.5" />
                      <span>Destino: Consolidación Transitoria</span>
                    </div>

                    {invoiceId ? (
                      loadingSiblings ? (
                        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border border-border/50 text-xs text-muted-foreground animate-pulse">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500 shrink-0" />
                          <span>Verificando paquetes vinculados a la factura...</span>
                        </div>
                      ) : totalLinkedPackageCount > 1 ? (
                        <div className="flex flex-col gap-1.5 p-2 rounded-md bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300/70 dark:border-amber-800/60 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>Factura multi-paquete ({totalLinkedPackageCount} paquetes)</span>
                            </div>
                            <span className="text-[10px] font-bold bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                              +{siblingPackages.length} vinculados
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-tight">
                            Al confirmar se trasladarán los <strong className="font-semibold">{totalLinkedPackageCount} paquetes</strong> y se anulará la factura:
                          </p>
                          <div className="max-h-24 overflow-y-auto rounded bg-white/80 dark:bg-black/40 p-1.5 border border-amber-200/60 dark:border-amber-900/40 text-[11px] space-y-1 font-mono">
                            {selfIncludedInLinked && (
                              <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-100 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                <span className="truncate">{trackingNumber || packageId}</span>
                                <span className="text-[9px] uppercase font-sans text-amber-600 dark:text-amber-400 font-bold ml-auto shrink-0">(este paquete)</span>
                              </div>
                            )}
                            {siblingPackages.map((s) => (
                              <div key={s.id} className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                                <span className="truncate">{s.trackingNumber || s.id}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 p-2 rounded-md bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/60 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span>Factura con 1 único paquete</span>
                          </div>
                          <p className="text-[11px] text-blue-600/90 dark:text-blue-400/90 leading-tight">
                            Esta factura sólo contiene a <span className="font-mono font-semibold">{trackingNumber || packageId}</span>.
                            {isCurrentTransitoria
                              ? " El paquete ya está en transitoria. Al confirmar se anulará su factura asociada."
                              : " Al confirmar se trasladará a Consolidación Transitoria y su factura asociada será anulada."}
                          </p>
                        </div>
                      )
                    ) : effectiveAnnulledInvoiceNumber ? (
                      <div className="flex flex-col gap-1 p-2 rounded-md bg-muted/40 border border-border/50 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>Factura previamente anulada</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          Factura <span className="font-mono font-semibold line-through text-foreground">{effectiveAnnulledInvoiceNumber}</span> ya se encuentra anulada (desvinculada).
                          {isCurrentTransitoria
                            ? " El paquete ya está en Consolidación Transitoria."
                            : " El paquete será trasladado individualmente."}
                        </p>
                      </div>
                    ) : isCurrentTransitoria ? (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Este paquete ya se encuentra en Consolidación Transitoria sin factura pendiente.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1 p-2 rounded-md bg-muted/40 border border-border/50 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>Paquete sin factura</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          No tiene factura vinculada. Será trasladado individualmente.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="truncate">
                    Destino: <span className="font-mono font-semibold text-foreground">{pendingTarget}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setPendingTarget(null);
                    setSiblingPackages([]);
                  }}
                  disabled={saving || (pendingTarget === 'consolidacion_transitoria' && loadingSiblings)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "h-7 px-3 text-xs gap-1",
                    pendingTarget === 'consolidacion_transitoria'
                      ? "bg-orange-600 text-white hover:bg-orange-700"
                      : "",
                  )}
                  onClick={handleConfirm}
                  disabled={
                    saving ||
                    (pendingTarget === 'consolidacion_transitoria' &&
                      (loadingSiblings || (isCurrentTransitoria && !invoiceId)))
                  }
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Moviendo...
                    </>
                  ) : (
                    "Confirmar"
                  )}
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Sibling Packages Confirmation Modal */}
      <AlertDialog open={showSiblingModal} onOpenChange={setShowSiblingModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover factura completa a Consolidación Transitoria</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span>
                {selfIncludedInLinked
                  ? <>Esta factura tiene <strong>{siblingPackages.length}</strong> otro(s) paquete(s) vinculado(s) que también se moverán a Consolidación Transitoria junto con este.</>
                  : <>Esta factura tiene <strong>{totalLinkedPackageCount}</strong> paquete(s) vinculado(s) que se moverán a Consolidación Transitoria.</>}
              </span>
              <span className="block text-xs text-muted-foreground">
                La factura asociada será <strong>anulada</strong> y todos sus paquetes quedarán en estado consolidado en Consolidación Transitoria:
              </span>
              <span className="block max-h-36 overflow-y-auto bg-muted/50 p-2 rounded text-xs font-mono space-y-1 border">
                {selfIncludedInLinked && (
                  <span className="font-semibold text-foreground block">
                    • {trackingNumber || packageId} (este paquete)
                  </span>
                )}
                {siblingPackages.map((s) => (
                  <span key={s.id} className="text-muted-foreground block">
                    • {s.trackingNumber || s.id}
                  </span>
                ))}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmTransitoria();
              }}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Moviendo...
                </>
              ) : (
                `Confirmar y mover todos (${totalLinkedPackageCount})`
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
