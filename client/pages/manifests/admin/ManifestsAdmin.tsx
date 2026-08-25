import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen,
  Search,
  RefreshCw,
  Boxes,
  DollarSign,
  Package,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionTooltip } from '@/components/PermissionTooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase/config';
import {
  collection,
  doc,
  deleteDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import {
  getRecentManifestsPaginated,
  type ManifestRecord,
} from '@/lib/services/manifest-processor';
import { searchManifests } from '@/lib/firebase/firestore-client';
import { deletePackagesByTrackings } from '@/lib/services/invoice-service';
import { logAction } from '@/lib/services/audit-service';

// Modular Imports
import { EditManifestModal } from './components/EditManifestModal';
import { MovePackagesModal } from './components/MovePackagesModal';
import { ManifestRow } from './components/ManifestRow';
import { ManifestDetailsModal } from './components/ManifestDetailsModal';
import { manifestsGridTemplateCols } from './constants';

/**
 * ManifestsAdmin Component
 * Main page dashboard for administering manifests in real-time.
 * Employs custom CSS styling to match the USA Maritime spreadsheet aesthetic:
 * - Burgundy accents using hsl(var(--manifest-brand))
 * - Pure white cards with explicit borders
 * - Monospace layout for manifest identifiers
 * - Right-click context menus for lightning-fast row interactions
 */
export default function ManifestsAdmin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { canUpdate, canDelete } = usePermissions();

  const [manifests, setManifests] = useState<ManifestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Pagination states
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(7);
  const [pageCursors, setPageCursors] = useState<(any | null)[]>([null]);
  const [hasMore, setHasMore] = useState(true);

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [activeDetailsManifest, setActiveDetailsManifest] = useState<ManifestRecord | null>(null);

  // Modal Dialog States
  const [editingManifest, setEditingManifest] = useState<ManifestRecord | null>(null);
  const [deletingManifest, setDeletingManifest] = useState<ManifestRecord | null>(null);
  const [movingManifest, setMovingManifest] = useState<ManifestRecord | null>(null);

  // Actions loading states
  const [deletingProgress, setDeletingProgress] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch paginated recent manifests or handle server-side search
  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setSelectedIds(new Set());

      const q = search.trim();
      if (q.length >= 2) {
        setIsSearching(true);
        try {
          const results = await searchManifests(q);
          if (active) {
            const converted = results.map((r) => ({
              id: r.id,
              manifestType: (r.manifestType as string) ?? 'usa_air',
              totalPackages: (r.totalPackages as number) ?? 0,
              totalPrice: (r.totalPrice as number) ?? 0,
              totalWeight: (r.totalWeight as number) ?? 0,
              exchangeRate: (r.exchangeRate as number) > 0 ? (r.exchangeRate as number) : undefined,
              routes: (r.routes as string[]) ?? [],
              processedAt: (r.processedAt as string) ?? '',
              isMegaMan:
                r.id.toUpperCase().startsWith('MEGA-MAN-') ||
                r.id.toUpperCase().startsWith('SL-MEGA-MAN-') ||
                r.id.toUpperCase().startsWith('ENC-MEGA-MAN-') ||
                undefined,
            } as ManifestRecord));
            setManifests(converted);
            setHasMore(false);
          }
        } catch (error) {
          console.error('Error searching manifests:', error);
        } finally {
          if (active) setIsSearching(false);
        }
      } else {
        setIsSearching(false);
        const currentCursor = pageCursors[pageIndex] || null;
        try {
          const { manifests: fetched, lastDoc, hasMore: more } = await getRecentManifestsPaginated(
            pageSize,
            currentCursor
          );
          if (active) {
            setManifests(fetched);
            setHasMore(more);
            if (lastDoc && pageCursors.length === pageIndex + 1) {
              setPageCursors((prev) => [...prev, lastDoc]);
            }
          }
        } catch (error) {
          console.error('Error loading paginated manifests:', error);
        }
      }
      if (active) setLoading(false);
    }

    loadData();

    return () => {
      active = false;
    };
  }, [pageIndex, pageSize, search, refreshKey]);

  // Reset pageIndex and cursors on search change or page size change
  useEffect(() => {
    setPageIndex(0);
    setPageCursors([null]);
  }, [search, pageSize]);

  // Statistics calculation for the current page
  const stats = useMemo(() => {
    const total = manifests.length;
    const totalPkgs = manifests.reduce((sum, m) => sum + (m.totalPackages || 0), 0);
    const totalValue = manifests.reduce((sum, m) => sum + (m.totalPrice || 0), 0);
    return { total, totalPkgs, totalValue };
  }, [manifests]);

  // Search Filter (handles minor client-side filtering for 1 char input)
  const filteredManifests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length >= 2) return manifests;
    return manifests.filter((m) => m.id.toLowerCase().includes(q));
  }, [manifests, search]);

  const paginatedManifests = filteredManifests;

  // Selection toggles
  const handleToggleRowSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === filteredManifests.length) {
        return new Set();
      } else {
        return new Set(filteredManifests.map((m) => m.id));
      }
    });
  };

  // Cascading deletion confirmation handler
  const handleDeleteConfirm = async () => {
    if (!deletingManifest) return;
    setDeletingProgress(true);
    const manifestId = deletingManifest.id;

    try {
      // 1. Fetch package tracking numbers associated with this manifest
      const pkgsQ = query(collection(db, 'packages'), where('manifestNumber', '==', manifestId));
      const pkgsSnap = await getDocs(pkgsQ);
      const trackings = pkgsSnap.docs
        .map((d) => (d.data().trackingNumber || d.data().tracking || d.id || '').toUpperCase())
        .filter(Boolean);

      // 2. Delete the manifest document itself
      await deleteDoc(doc(db, 'manifests', manifestId));

      // 2b. Delete corresponding document in manifest_usa_sea / manifest_col_air
      if (deletingManifest.manifestType === 'usa_sea') {
        await deleteDoc(doc(db, 'manifest_usa_sea', manifestId));
      } else if (deletingManifest.manifestType === 'colombia_air') {
        await deleteDoc(doc(db, 'manifest_col_air', manifestId));
      }

      // 3. Clean up associated packages and draft invoices (final status packages are protected automatically)
      const cleanupRes = await deletePackagesByTrackings(trackings, manifestId);

      // 4. Log Audit Event
      logAction({
        userId: user?.id || 'system',
        userName: user?.fullName || user?.email || 'System',
        userEmail: user?.email || undefined,
        userRole: user?.role || undefined,
        action: 'system_event',
        category: 'manifest',
        resource: 'manifests',
        resourceId: manifestId,
        result: 'success',
        metadata: {
          action: 'manifest_deleted',
          manifestId,
          packagesFound: trackings.length,
          packagesDeleted: cleanupRes.packagesDeleted,
          invoicesDeleted: cleanupRes.invoicesDeleted,
        },
      });

      toast({
        title: 'Manifiesto eliminado',
        description: `Se eliminó ${manifestId}. Paquetes borrados: ${cleanupRes.packagesDeleted}. Facturas eliminadas: ${cleanupRes.invoicesDeleted}.`,
      });
      setDeletingManifest(null);
      setRefreshKey((k) => k + 1);
    } catch (error: any) {
      toast({
        title: 'Error al eliminar manifiesto',
        description: error?.message || 'Hubo un problema procesando la eliminación.',
        variant: 'destructive',
      });
    } finally {
      setDeletingProgress(false);
    }
  };

  // Bulk cascading deletion confirmation handler
  const handleBulkDeleteConfirm = async () => {
    setDeletingProgress(true);
    let manifestsDeleted = 0;
    let pkgsDeletedTotal = 0;
    let invsDeletedTotal = 0;

    try {
      const deletePromises = Array.from(selectedIds).map(async (manifestId) => {
        const targetManifest = manifests.find((m) => m.id === manifestId);
        if (!targetManifest) return null;

        // 1. Fetch package tracking numbers associated with this manifest
        const pkgsQ = query(collection(db, 'packages'), where('manifestNumber', '==', manifestId));
        const pkgsSnap = await getDocs(pkgsQ);
        const trackings = pkgsSnap.docs
          .map((d) => (d.data().trackingNumber || d.data().tracking || d.id || '').toUpperCase())
          .filter(Boolean);

        // 2. Delete the manifest document itself
        await deleteDoc(doc(db, 'manifests', manifestId));

        // 2b. Delete corresponding document in manifest_usa_sea / manifest_col_air
        if (targetManifest.manifestType === 'usa_sea') {
          await deleteDoc(doc(db, 'manifest_usa_sea', manifestId));
        } else if (targetManifest.manifestType === 'colombia_air') {
          await deleteDoc(doc(db, 'manifest_col_air', manifestId));
        }

        // 3. Clean up associated packages and draft invoices
        const cleanupRes = await deletePackagesByTrackings(trackings, manifestId);

        return {
          manifestId,
          packagesFound: trackings.length,
          packagesDeleted: cleanupRes.packagesDeleted,
          invoicesDeleted: cleanupRes.invoicesDeleted,
        };
      });

      const deleteResults = await Promise.all(deletePromises);

      for (const res of deleteResults) {
        if (!res) continue;
        pkgsDeletedTotal += res.packagesDeleted;
        invsDeletedTotal += res.invoicesDeleted;
        manifestsDeleted++;

        // Log Audit Event
        logAction({
          userId: user?.id || 'system',
          userName: user?.fullName || user?.email || 'System',
          userEmail: user?.email || undefined,
          userRole: user?.role || undefined,
          action: 'system_event',
          category: 'manifest',
          resource: 'manifests',
          resourceId: res.manifestId,
          result: 'success',
          metadata: {
            action: 'manifest_deleted_bulk',
            manifestId: res.manifestId,
            packagesFound: res.packagesFound,
            packagesDeleted: res.packagesDeleted,
            invoicesDeleted: res.invoicesDeleted,
          },
        });
      }

      toast({
        title: 'Eliminación masiva completa',
        description: `Se eliminaron ${manifestsDeleted} manifiestos. Paquetes borrados: ${pkgsDeletedTotal}. Facturas eliminadas: ${invsDeletedTotal}.`,
      });
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      setRefreshKey((k) => k + 1);
    } catch (error: any) {
      toast({
        title: 'Error en eliminación masiva',
        description: error?.message || 'Hubo un problema procesando la eliminación masiva.',
        variant: 'destructive',
      });
    } finally {
      setDeletingProgress(false);
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="space-y-4 p-4 md:p-6 bg-white dark:bg-slate-950 min-h-[calc(100vh-4rem)] text-foreground select-none"
      >
        {/* Module Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-sans">
              Administración de Manifiestos
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Elimina, edita, renombra y transfiere paquetes entre manifiestos en tiempo real con soporte de click derecho.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
            {/* Compact inline statistics */}
            <div className="flex items-center gap-2 px-3.5 rounded-lg border border-border/85 bg-white dark:bg-slate-900 shadow-xs text-xs font-semibold h-10 relative overflow-hidden shrink-0">
              {loading ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Manifiestos:</span>
                    <Skeleton className="h-3.5 w-6 rounded" />
                  </div>
                  <div className="h-3 w-px bg-border/80" />
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Paquetes:</span>
                    <Skeleton className="h-3.5 w-9 rounded" />
                  </div>
                  <div className="h-3 w-px bg-border/80" />
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Valor:</span>
                    <Skeleton className="h-3.5 w-14 rounded" />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Manifiestos:</span>
                    <span className="font-mono text-foreground font-bold">{stats.total}</span>
                  </div>
                  <div className="h-3 w-px bg-border/80" />
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Paquetes:</span>
                    <span className="font-mono text-foreground font-bold">{stats.totalPkgs}</span>
                  </div>
                  <div className="h-3 w-px bg-border/80" />
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Valor:</span>
                    <span className="font-mono text-[hsl(var(--manifest-brand))] font-bold">
                      ${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
            </div>

            <Button
              variant="outline"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              className="gap-2 border border-border bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold h-10 shrink-0"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', loading && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        <Card className="p-4 border border-border/70 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número de manifiesto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-10 bg-white focus:bg-white hover:bg-white border border-border focus-visible:ring-2 focus-visible:ring-[hsl(var(--manifest-brand))] focus-visible:border-transparent text-sm h-10 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                type="button"
                title="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sincronizando tiempo real</span>
          </div>
        </Card>

        {/* Real-time Listing Spreadsheet Table */}
        <Card className="border border-border bg-white dark:bg-slate-950 shadow-md overflow-hidden rounded-xl">
          <div className="overflow-auto max-h-[calc(100vh-350px)] min-h-[300px] relative">
            <div className="min-w-[1100px] flex flex-col pb-4">
              {/* Spreadsheet Grid Header */}
              <div
                className="grid w-full bg-slate-50 dark:bg-slate-900/50 border-b border-border text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground select-none sticky top-0 z-20 shadow-xs"
                style={{ gridTemplateColumns: manifestsGridTemplateCols }}
              >
                <div className="border-r border-border h-9 flex items-center justify-center bg-muted/20">
                  <input
                    type="checkbox"
                    checked={filteredManifests.length > 0 && selectedIds.size === filteredManifests.length}
                    onChange={handleToggleSelectAll}
                    disabled={loading || filteredManifests.length === 0}
                    className="h-3.5 w-3.5 rounded border-gray-400 text-gray-900 focus:ring-offset-0 cursor-pointer focus:ring-[hsl(var(--manifest-brand))]"
                  />
                </div>
                <div className="border-r border-border h-9 flex items-center justify-center text-center">
                  Info
                </div>
                <div className="border-r border-border h-9 flex items-center px-3">
                  Número de Manifiesto
                </div>
                <div className="border-r border-border h-9 flex items-center px-3">
                  Tipo
                </div>
                <div className="border-r border-border h-9 flex items-center justify-center text-center">
                  Cant. Paquetes
                </div>
                <div className="border-r border-border h-9 flex items-center justify-center text-center">
                  Peso Total (kg)
                </div>
                <div className="border-r border-border h-9 flex items-center justify-end px-3">
                  Valor USD
                </div>
                <div className="border-r border-border h-9 flex items-center justify-center text-center">
                  T. Cambio
                </div>
                <div className="border-r border-border h-9 flex items-center px-3">
                  Procesado
                </div>
                <div className="h-9 flex items-center justify-end px-3">
                  Acciones
                </div>
              </div>

              {/* Grid Body / Rows */}
              {loading ? (
                <div className="divide-y divide-border/60">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={`skeleton-row-${i}`}
                      className="grid w-full h-10 items-center text-xs border-b border-border bg-background"
                      style={{ gridTemplateColumns: manifestsGridTemplateCols }}
                    >
                      <div className="border-r border-border h-full flex items-center justify-center bg-muted/5">
                        <Skeleton className="h-3.5 w-3.5 rounded" />
                      </div>
                      <div className="border-r border-border h-full flex items-center justify-center bg-muted/5">
                        <Skeleton className="h-4 w-4 rounded" />
                      </div>
                      <div className="border-r border-border h-full flex items-center px-3">
                        <Skeleton className="h-4 w-32 rounded font-mono" />
                      </div>
                      <div className="border-r border-border h-full flex items-center px-3">
                        <Skeleton className="h-5 w-24 rounded-full" />
                      </div>
                      <div className="border-r border-border h-full flex items-center justify-center">
                        <Skeleton className="h-4 w-8 rounded font-mono" />
                      </div>
                      <div className="border-r border-border h-full flex items-center justify-center">
                        <Skeleton className="h-4 w-12 rounded font-mono" />
                      </div>
                      <div className="border-r border-border h-full flex items-center justify-end px-3">
                        <Skeleton className="h-4 w-16 rounded font-mono" />
                      </div>
                      <div className="border-r border-border h-full flex items-center justify-center">
                        <Skeleton className="h-4 w-12 rounded font-mono" />
                      </div>
                      <div className="border-r border-border h-full flex items-center px-3">
                        <Skeleton className="h-4 w-24 rounded" />
                      </div>
                      <div className="h-full flex items-center justify-end px-3 gap-1">
                        <Skeleton className="h-7 w-7 rounded animate-pulse" />
                        <Skeleton className="h-7 w-7 rounded animate-pulse" />
                        <Skeleton className="h-7 w-7 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredManifests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-3 text-center">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm font-bold text-muted-foreground">
                    {search ? 'No se encontraron manifiestos con ese ID' : 'No hay manifiestos registrados'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {search ? 'Intenta modificar el filtro de búsqueda.' : 'Los manifiestos aparecerán aquí automáticamente al ser creados.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {paginatedManifests.map((m) => (
                    <ManifestRow
                      key={m.id}
                      manifest={m}
                      isSelected={selectedIds.has(m.id)}
                      onToggleSelection={handleToggleRowSelection}
                      canUpdate={canUpdate('manifests')}
                      canDelete={canDelete('manifests')}
                      onMove={setMovingManifest}
                      onEdit={setEditingManifest}
                      onDelete={setDeletingManifest}
                      onShowDetails={(manifest) => setActiveDetailsManifest(manifest)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pagination footer — inside the Card */}
          {!loading && filteredManifests.length > 0 && (
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-white dark:bg-slate-950"
              role="navigation"
              aria-label="Filas por página"
            >
              <div className="flex items-center gap-2">
                <label htmlFor="rows-per-page" className="text-xs font-semibold text-muted-foreground">
                  Filas por página:
                </label>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setPageIndex(0);
                  }}
                >
                  <SelectTrigger
                    id="rows-per-page"
                    className="w-20 h-8 text-xs border-border bg-white dark:bg-slate-900 focus:ring-1 focus:ring-[hsl(var(--manifest-brand))]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  Página {pageIndex + 1} · Mostrando {filteredManifests.length === 0 ? 0 : pageIndex * pageSize + 1}-{pageIndex * pageSize + filteredManifests.length}
                </span>
                
                <div className="flex gap-1" role="group" aria-label={`Página ${pageIndex + 1}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPageIndex(0);
                      setPageCursors([null]);
                    }}
                    disabled={pageIndex === 0}
                    className="h-8 px-2 text-xs border-border hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Inicio
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                    disabled={pageIndex === 0}
                    className="h-8 px-2 text-xs border-border hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    « Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex(pageIndex + 1)}
                    disabled={!hasMore || filteredManifests.length < pageSize}
                    className="h-8 px-2 text-xs border-border hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    Siguiente »
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Edit Manifest Modal */}
      {editingManifest && (
        <EditManifestModal
          manifest={editingManifest}
          onClose={() => setEditingManifest(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
          user={user}
        />
      )}

      {/* Move Packages Modal */}
      {movingManifest && (
        <MovePackagesModal
          manifest={movingManifest}
          allManifests={manifests}
          onClose={() => setMovingManifest(null)}
          user={user}
        />
      )}

      {/* Manifest Details Spreadsheet Modal */}
      {activeDetailsManifest && (
        <ManifestDetailsModal
          manifest={activeDetailsManifest}
          onClose={() => setActiveDetailsManifest(null)}
        />
      )}

      {/* Single Delete Confirmation Alert */}
      <AlertDialog open={!!deletingManifest} onOpenChange={(v) => { if (!v) setDeletingManifest(null); }}>
        <AlertDialogContent className="max-w-md bg-white border border-border shadow-lg rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-650 font-bold text-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              ¿Eliminar Manifiesto?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-xs leading-relaxed text-muted-foreground pt-2">
                <p>
                  Esta acción eliminará de forma permanente el manifiesto{' '}
                  <strong className="font-mono text-foreground font-bold select-all bg-slate-100 px-1 py-0.5 rounded">{deletingManifest?.id}</strong>.
                </p>
                <div className="bg-red-50/80 border border-red-100 rounded-lg p-3.5 text-red-800 space-y-1.5 leading-relaxed shadow-sm">
                  <p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[10px]">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-650" />
                    Operación destructiva en cascada:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Se eliminarán todos los paquetes asociados en la colección <code className="font-mono bg-red-100/50 px-1 rounded font-semibold">packages</code>.</li>
                    <li>Se limpiarán todas las facturas en estado <strong className="font-bold text-red-900">draft</strong> asociadas a esos paquetes.</li>
                    <li>Se borrarán los borradores de hojas en <code className="font-mono bg-red-100/50 px-1 rounded font-semibold">manifest_usa_sea</code> y <code className="font-mono bg-red-100/50 px-1 rounded font-semibold">manifest_col_air</code>.</li>
                    <li><strong className="font-bold text-red-900">Protección de Datos:</strong> Los paquetes que ya tengan estados finales como entregado (<code className="font-mono bg-red-100/50 px-1 rounded font-semibold">delivered</code>) no serán eliminados.</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 border-t border-border/60 mt-2 gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deletingProgress} className="hover:bg-slate-100 border-border text-muted-foreground">Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deletingProgress}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm"
            >
              {deletingProgress ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Confirmar y Eliminar'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-4 py-2.5 sm:py-3 rounded-xl border border-slate-800 shadow-2xl flex flex-col sm:flex-row items-center gap-2 sm:gap-6 animate-in slide-in-from-bottom-4 duration-300 w-[calc(100%-2rem)] sm:w-auto max-w-md sm:max-w-none">
          <div className="flex items-center gap-2 justify-center">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--manifest-brand))] animate-pulse" />
            <span className="text-xs font-semibold whitespace-nowrap">
              <strong className="font-mono text-sm">{selectedIds.size}</strong> manifiestos seleccionados
            </span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold h-8 flex-1 sm:flex-none"
            >
              Limpiar Selección
            </Button>
            <PermissionTooltip allowed={canDelete('manifests')}>
              <Button
                variant="destructive"
                size="sm"
                disabled={!canDelete('manifests') || deletingProgress}
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold gap-1.5 shadow-sm h-8 flex-1 sm:flex-none whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </Button>
            </PermissionTooltip>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Alert */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="max-w-md bg-white border border-border shadow-lg rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-650 font-bold text-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              ¿Eliminar {selectedIds.size} Manifiestos?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-xs leading-relaxed text-muted-foreground pt-2">
                <p>
                  Esta acción eliminará de forma permanente los <strong className="font-bold text-foreground">{selectedIds.size}</strong> manifiestos seleccionados y toda su información asociada.
                </p>
                <div className="bg-red-50/80 border border-red-100 rounded-lg p-3.5 text-red-800 space-y-1.5 leading-relaxed shadow-sm">
                  <p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[10px]">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-650" />
                    Operación destructiva en cascada:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Se eliminarán todos los paquetes asociados en la colección <code className="font-mono bg-red-100/50 px-1 rounded font-semibold">packages</code>.</li>
                    <li>Se limpiarán todas las facturas en estado <strong className="font-bold text-red-900">draft</strong> asociadas a esos paquetes.</li>
                    <li>Se borrarán los borradores de hojas en <code className="font-mono bg-red-100/50 px-1 rounded font-semibold">manifest_usa_sea</code> y <code className="font-mono bg-red-100/50 px-1 rounded font-semibold">manifest_col_air</code>.</li>
                    <li><strong className="font-bold text-red-900">Protección de Datos:</strong> Los paquetes con estados finales no serán borrados de la base de datos.</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pt-3 border-t border-border/60 mt-2 gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deletingProgress} className="hover:bg-slate-100 border-border text-muted-foreground">
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBulkDeleteConfirm}
              disabled={deletingProgress}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm"
            >
              {deletingProgress ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Eliminando...
                </>
              ) : (
                'Confirmar y Eliminar Todo'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
