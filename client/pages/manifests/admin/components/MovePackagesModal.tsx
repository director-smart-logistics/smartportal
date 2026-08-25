import { useEffect, useState, useMemo } from 'react';
import { ArrowRightLeft, RefreshCw, Package, Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase/config';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { movePackagesBetweenManifestDocs } from '@/lib/services/manifest-consolidation-service';
import { logAction } from '@/lib/services/audit-service';
import { type ManifestRecord } from '@/lib/services/manifest-processor';

interface MovePackagesModalProps {
  manifest: ManifestRecord;
  allManifests: ManifestRecord[];
  onClose: () => void;
  user: any;
}

/**
 * MovePackagesModal Component
 * Facilitates selecting and moving packages from a source manifest to a target manifest.
 * Performs updates in the main packages collection and synchronizes embedded document arrays
 * using movePackagesBetweenManifestDocs.
 */
export function MovePackagesModal({
  manifest,
  allManifests,
  onClose,
  user,
}: MovePackagesModalProps) {
  const { toast } = useToast();
  
  const [packages, setPackages] = useState<any[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [selectedTrackings, setSelectedTrackings] = useState<Set<string>>(new Set());
  const [targetManifest, setTargetManifest] = useState<string>('');
  const [savingMove, setSavingMove] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch packages belonging to the source manifest using a one-shot query
  useEffect(() => {
    if (!manifest.id) return;
    setLoadingPkgs(true);

    const q = query(collection(db, 'packages'), where('manifestNumber', '==', manifest.id));
    getDocs(q)
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPackages(list);
        setLoadingPkgs(false);
      })
      .catch((err) => {
        console.error('Error fetching packages in MovePackagesModal:', err);
        setLoadingPkgs(false);
      });
  }, [manifest.id]);

  // Exclude current manifest from the target manifest dropdown list
  const manifestOptions = useMemo(() => {
    return allManifests.filter((m) => m.id !== manifest.id);
  }, [allManifests, manifest.id]);

  // Filter packages based on search query
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const tracking = (pkg.trackingNumber || pkg.tracking || pkg.id || '').toLowerCase();
      const customer = (pkg.customerName || '').toLowerCase();
      const slCode = (pkg.slCode || '').toLowerCase();
      const status = (pkg.status || '').toLowerCase();
      return (
        tracking.includes(q) ||
        customer.includes(q) ||
        slCode.includes(q) ||
        status.includes(q)
      );
    });
  }, [packages, searchQuery]);

  // Check if all filtered packages are selected
  const isAllFilteredSelected = useMemo(() => {
    if (filteredPackages.length === 0) return false;
    return filteredPackages.every((p) =>
      selectedTrackings.has((p.trackingNumber || p.tracking || p.id).toUpperCase())
    );
  }, [filteredPackages, selectedTrackings]);

  // Handle select/unselect all rows (filtered packages only)
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const next = new Set(selectedTrackings);
      filteredPackages.forEach((p) => {
        next.add((p.trackingNumber || p.tracking || p.id).toUpperCase());
      });
      setSelectedTrackings(next);
    } else {
      const next = new Set(selectedTrackings);
      filteredPackages.forEach((p) => {
        next.delete((p.trackingNumber || p.tracking || p.id).toUpperCase());
      });
      setSelectedTrackings(next);
    }
  };

  const handleSelectRow = (tracking: string, checked: boolean) => {
    setSelectedTrackings((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tracking.toUpperCase());
      else next.delete(tracking.toUpperCase());
      return next;
    });
  };

  // Perform packages move transaction
  const handleMoveConfirm = async () => {
    if (!targetManifest) {
      toast({
        title: 'Manifiesto requerido',
        description: 'Por favor selecciona el manifiesto destino.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedTrackings.size === 0) {
      toast({
        title: 'Paquetes requeridos',
        description: 'Por favor selecciona al menos un paquete para mover.',
        variant: 'destructive',
      });
      return;
    }

    setSavingMove(true);
    const trackings = Array.from(selectedTrackings);
    const now = new Date().toISOString();

    try {
      // 1. Update the packages in the packages collection (batched in chunks of 30)
      const chunks: string[][] = [];
      const CHUNK_SIZE = 30;
      for (let i = 0; i < trackings.length; i += CHUNK_SIZE) {
        chunks.push(trackings.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const q = query(
            collection(db, 'packages'),
            where('trackingNumber', 'in', chunk.map((t) => t.toUpperCase()))
          );
          const snap = await getDocs(q);
          const batch = writeBatch(db);
          snap.docs.forEach((d) => {
            batch.update(d.ref, {
              manifestNumber: targetManifest,
              manifestId: targetManifest,
              updatedManifest: targetManifest,
              manifestUpdatedAt: now,
            });
          });
          if (!snap.empty) {
            await batch.commit();
          }
        })
      );

      // 2. Synchronize packages inside embedded manifest document arrays
      await movePackagesBetweenManifestDocs(trackings, manifest.id, targetManifest);

      // 3. Log audit event
      logAction({
        userId: user?.id || 'system',
        userName: user?.fullName || user?.email || 'System',
        userEmail: user?.email || undefined,
        userRole: user?.role || undefined,
        action: 'manifest_packages_moved',
        category: 'manifest',
        resource: 'manifests',
        resourceId: manifest.id,
        result: 'success',
        metadata: {
          action: 'packages_moved',
          sourceManifest: manifest.id,
          targetManifest,
          packagesCount: trackings.length,
          trackings,
        },
      });

      toast({
        title: 'Paquetes transferidos con éxito',
        description: `Se movieron ${trackings.length} paquetes hacia el manifiesto ${targetManifest}.`,
      });
      setSelectedTrackings(new Set());
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error al mover paquetes',
        description: error?.message || 'Hubo un error procesando la transferencia.',
        variant: 'destructive',
      });
    } finally {
      setSavingMove(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] w-full sm:max-w-4xl h-[100dvh] sm:h-[85vh] flex flex-col p-0 overflow-hidden bg-white border border-border shadow-lg rounded-none sm:rounded-xl">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="flex items-center gap-2 font-bold text-lg text-foreground">
            <ArrowRightLeft className="h-5 w-5 text-[hsl(var(--manifest-brand))]" />
            Transferir Paquetes
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Selecciona paquetes del manifiesto origen{' '}
            <strong className="font-mono text-foreground font-semibold">{manifest.id}</strong>{' '}
            y elige un manifiesto de destino para enviarlos.
          </DialogDescription>
        </DialogHeader>

        {/* Target Manifest selection panel */}
        <div className="px-5 py-2 border-b border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex-1 w-full max-w-sm space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Manifiesto Destino
            </label>
            <Select value={targetManifest} onValueChange={setTargetManifest} disabled={savingMove}>
              <SelectTrigger className="w-full h-9 bg-background border border-border focus:ring-2 focus:ring-[hsl(var(--manifest-brand))]">
                <SelectValue placeholder="Selecciona el manifiesto destino" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-border shadow-md">
                {manifestOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="cursor-pointer hover:bg-accent/40">
                    <span className="font-mono text-xs font-semibold">{opt.id}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      ({opt.totalPackages} pkgs · {opt.manifestType})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs font-semibold text-muted-foreground block">
              Seleccionados
            </span>
            <span className="text-lg font-bold text-[hsl(var(--manifest-brand))] font-mono">
              {selectedTrackings.size}
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        {!loadingPkgs && packages.length > 0 && (
          <div className="px-5 py-2.5 border-b border-border flex items-center justify-between gap-4 bg-white shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/75" />
              <Input
                placeholder="Buscar por tracking, cliente, código SL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs focus-visible:ring-1 focus-visible:ring-[hsl(var(--manifest-brand))] font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full text-muted-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-medium shrink-0">
              {searchQuery ? (
                <span>
                  Mostrando <strong className="text-foreground">{filteredPackages.length}</strong> de{' '}
                  <strong className="text-foreground">{packages.length}</strong> paquetes
                </span>
              ) : (
                <span>
                  Total: <strong className="text-foreground">{packages.length}</strong> paquetes
                </span>
              )}
            </div>
          </div>
        )}

        {/* Real-time Packages Table */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 py-3">
          {loadingPkgs ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--manifest-brand))]" />
              <span className="text-xs text-muted-foreground">Cargando paquetes...</span>
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-1.5">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Este manifiesto no contiene paquetes.</p>
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <Search className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-bold text-muted-foreground">No se encontraron resultados</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                No hay paquetes en este manifiesto que coincidan con &ldquo;{searchQuery}&rdquo;.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs font-semibold border-border hover:bg-slate-50"
              >
                Limpiar búsqueda
              </Button>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border text-left uppercase text-[10px] text-muted-foreground font-bold tracking-wider">
                  <tr>
                    <th className="p-3 w-10">
                      <Checkbox
                        checked={isAllFilteredSelected}
                        onCheckedChange={handleSelectAll}
                        disabled={savingMove}
                      />
                    </th>
                    <th className="p-3">Tracking / ID</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-center">Peso (kg)</th>
                    <th className="p-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPackages.map((pkg) => {
                    const tracking = (pkg.trackingNumber || pkg.tracking || pkg.id || '').toUpperCase();
                    const isSelected = selectedTrackings.has(tracking);
                    return (
                      <tr
                        key={pkg.id}
                        className={cn(
                          'hover:bg-accent/20 transition-colors',
                          isSelected && 'bg-[hsl(var(--manifest-brand-subtle))]'
                        )}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(v) => handleSelectRow(tracking, !!v)}
                            disabled={savingMove}
                          />
                        </td>
                        <td className="p-3 font-mono font-bold text-foreground select-text">
                          {tracking}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground truncate max-w-[250px]">
                              {pkg.customerName || '—'}
                            </span>
                            {pkg.slCode && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {pkg.slCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono font-medium text-foreground">
                          {pkg.weight ? `${pkg.weight.toFixed(2)}` : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border',
                              pkg.status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
                                : pkg.status === 'processed'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400'
                            )}
                          >
                            {pkg.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="p-5 pt-2 border-t border-border shrink-0 gap-2 sm:gap-0 mt-2">
          <Button variant="ghost" onClick={onClose} disabled={savingMove} className="hover:bg-accent/60 text-muted-foreground hover:text-foreground">
            Cancelar
          </Button>
          <Button
            onClick={handleMoveConfirm}
            disabled={savingMove || selectedTrackings.size === 0 || !targetManifest}
            className="font-semibold shadow-sm bg-[hsl(var(--manifest-brand))] hover:opacity-90 text-white"
          >
            {savingMove ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Transfiriendo...
              </>
            ) : (
              `Transferir (${selectedTrackings.size})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
