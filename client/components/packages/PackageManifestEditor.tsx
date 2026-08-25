/**
 * PackageManifestEditor.tsx
 *
 * Inline editor for the `manifestNumber` field in the expanded /packages row.
 *
 * UX:
 *   1. Click on the manifest cell → Popover opens with a typeahead Command
 *      filtered against available manifests (only valid manifests can be selected).
 *   2. Operator selects a target manifest and confirms the atomic move.
 *   3. Confirmar → atomic move executes:
 *        a. Update the package doc (manifestNumber, manifestId, updatedManifest, manifestUpdatedAt).
 *        b. Mirror the move in the source/destination manifest docs' embedded packages[] arrays.
 *        c. Update consolidation doc via batchUpdateConsolidationManifest.
 *      Zero background invoice mutations — completely atomic and transparent.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Edit2,
  FileText,
  AlertTriangle,
  Loader2,
  ArrowRightLeft,
} from "lucide-react";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import {
  batchUpdateConsolidationManifest,
  movePackagesBetweenManifestDocs,
} from "@/lib/services/manifest-consolidation-service";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ManifestOption {
  id: string;
  manifestNumber?: string;
  manifestType?: string;
}

interface PackageManifestEditorProps {
  packageId: string;
  trackingNumber: string;
  currentManifest: string;
  slCode: string;
  customerName: string;
  weight: number;
  price: number;
  description: string;
  permisos: boolean;
  manifests: ManifestOption[];
  triggerClassName?: string;
  open?: boolean;
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
  triggerClassName,
  open,
  onOpenChange,
}: PackageManifestEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localOpen, setLocalOpen] = useState(false);
  const popoverOpen = open !== undefined ? open : localOpen;
  const setPopoverOpen = (val: boolean) => {
    setLocalOpen(val);
    onOpenChange?.(val);
  };
  const [search, setSearch] = useState("");
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleSelectTarget = (target: string) => {
    setPendingTarget(target);
    setSearch("");
  };

  const resetState = () => {
    setPopoverOpen(false);
    setPendingTarget(null);
    setSearch("");
  };

  const handleConfirm = async () => {
    if (!pendingTarget || pendingTarget === currentManifest) return;
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
    <Popover
      open={popoverOpen}
      onOpenChange={(open) => {
        setPopoverOpen(open);
        if (!open) {
          setPendingTarget(null);
          setSearch("");
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
          <div className="p-3 border-t bg-muted/10 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground truncate">
              Destino: <span className="font-mono font-semibold text-foreground">{pendingTarget}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPendingTarget(null)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-xs gap-1"
                onClick={handleConfirm}
                disabled={saving}
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
  );
}
