import { useEffect, useState } from 'react';
import { RefreshCw, Package, Calendar, DollarSign, ArrowRight, Info, Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { type ManifestRecord } from '@/lib/services/manifest-processor';
import { formatRelative } from '../utils';
import { TYPE_CONFIGS } from '../constants';

interface ManifestDetailsModalProps {
  manifest: ManifestRecord;
  onClose: () => void;
}

/**
 * ManifestDetailsModal Component
 * Renders a read-only details grid for all packages mapped to a specific manifest.
 * Visual layout matches the invoices and packages spreadsheet design system.
 */
export function ManifestDetailsModal({ manifest, onClose }: ManifestDetailsModalProps) {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const config = TYPE_CONFIGS[manifest.manifestType || ''] || {
    label: manifest.manifestType || 'Desconocido',
    flag: '🏳️',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  // Fetch packages inside this manifest using a one-shot query
  useEffect(() => {
    if (!manifest.id) return;
    setLoading(true);

    const q = query(collection(db, 'packages'), where('manifestNumber', '==', manifest.id));
    getDocs(q)
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPackages(list);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching packages in ManifestDetailsModal:', err);
        setLoading(false);
      });
  }, [manifest.id]);

  const filteredPackages = packages.filter((pkg) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const tracking = (pkg.trackingNumber || pkg.tracking || pkg.id || '').toLowerCase();
    const customer = (pkg.customerName || '').toLowerCase();
    const slCode = (pkg.slCode || '').toLowerCase();
    const ruta = (pkg.ruta || pkg.destination || '').toLowerCase();
    const status = (pkg.status || '').toLowerCase();
    return (
      tracking.includes(q) ||
      customer.includes(q) ||
      slCode.includes(q) ||
      ruta.includes(q) ||
      status.includes(q)
    );
  });

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] w-full sm:max-w-4xl h-[100dvh] sm:h-[85vh] flex flex-col p-0 overflow-hidden bg-white border border-border shadow-lg rounded-none sm:rounded-xl">
        {/* Modal Header */}
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-4 flex-wrap pr-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[hsl(var(--manifest-brand)/0.08)] text-[hsl(var(--manifest-brand))] rounded-xl border border-[hsl(var(--manifest-brand)/0.15)] shadow-xs">
                <Info className="h-5.5 w-5.5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground font-sans">
                  Detalles de Manifiesto
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-medium">
                  Vista detallada del manifiesto y sus paquetes asociados.
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded border shadow-xs transition-all flex items-center gap-1.5',
                  config.className
                )}
              >
                <span className="text-xs shrink-0 leading-none">{config.flag}</span>
                <span>{config.label}</span>
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Manifest Stats Grid */}
        <div className="px-5 py-3 border-b border-border bg-slate-50/60 grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Identificador
            </span>
            <span className="font-mono text-xs font-bold text-foreground block select-all">
              {manifest.id}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Paquetes
            </span>
            <span className="text-xs font-bold text-foreground font-mono block">
              {packages.length} / {manifest.totalPackages ?? 0}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Valor Declarado
            </span>
            <span className="text-xs font-bold text-foreground font-mono block">
              ${(manifest.totalPrice ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Tipo de Cambio
            </span>
            <span className="text-xs font-bold text-foreground font-mono block">
              {manifest.exchangeRate ? `₡${manifest.exchangeRate}` : '—'}
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        {!loading && packages.length > 0 && (
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-4 bg-white shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/75" />
              <Input
                placeholder="Buscar por tracking, cliente, código SL, ruta..."
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

        {/* Package spreadsheet table container */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-7 w-7 animate-spin text-[hsl(var(--manifest-brand))]" />
              <span className="text-xs font-semibold text-muted-foreground">Obteniendo paquetes...</span>
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-bold text-muted-foreground">Este manifiesto no contiene paquetes.</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Asocia paquetes en consolidación o a través del importador para verlos listados aquí.
              </p>
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
            <div className="border border-border rounded-lg overflow-hidden bg-white shadow-xs">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-border text-left uppercase text-[10px] text-muted-foreground font-bold tracking-wider">
                  <tr>
                    <th className="p-3 border-r border-border">Tracking / ID</th>
                    <th className="p-3 border-r border-border">Cliente</th>
                    <th className="p-3 border-r border-border text-center">Peso (kg)</th>
                    <th className="p-3 border-r border-border text-center">Ruta / Destino</th>
                    <th className="p-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredPackages.map((pkg) => {
                    const tracking = (pkg.trackingNumber || pkg.tracking || pkg.id || '').toUpperCase();
                    return (
                      <tr key={pkg.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 border-r border-border font-mono font-bold text-foreground select-text">
                          {tracking}
                        </td>
                        <td className="p-3 border-r border-border">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground truncate max-w-[200px]">
                              {pkg.customerName || '—'}
                            </span>
                            {pkg.slCode && (
                              <span className="text-[10px] text-muted-foreground font-mono font-medium">
                                {pkg.slCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 border-r border-border text-center font-mono font-bold text-foreground">
                          {pkg.weight ? `${pkg.weight.toFixed(2)}` : '—'}
                        </td>
                        <td className="p-3 border-r border-border text-center font-semibold text-muted-foreground">
                          {pkg.ruta || pkg.destination || '—'}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded border shadow-xs',
                              pkg.status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : pkg.status === 'processed'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
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

        {/* Modal Footer */}
        <DialogFooter className="p-5 pt-2 border-t border-border shrink-0 gap-2 sm:gap-0 mt-2">
          <Button
            onClick={onClose}
            className="font-semibold shadow-sm bg-[hsl(var(--manifest-brand))] hover:opacity-90 text-white"
          >
            Cerrar Detalles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
