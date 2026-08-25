/**
 * TempCustomers — admin CRUD page for the `temp_customers` Firestore collection.
 *
 * ─── Why this page exists ───────────────────────────────────────────────────
 *
 * Temp customers are placeholder records (slCode `SL-NAN-NNNNN`) created
 * automatically by Nova when a manifest row's customer name doesn't match
 * any SP1/SP2 customer. They unblock invoicing, but operators need a way
 * to:
 *
 *   1. SEE every active temp record (so duplicates / typos can be caught).
 *   2. EDIT name / route / contact info before promotion or before the
 *      next manifest run uses the wrong details.
 *   3. DELETE stale entries after a real customer has been created and
 *      the rows have been re-assigned manually.
 *
 * No "create" affordance is exposed here on purpose — temp customer
 * creation is a side-effect of Nova's auto-flow, never a manual operator
 * action. Surfacing a Create button would invite duplicates that
 * `createOrGetTempCustomer` already prevents in the dedup-by-name path.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  UserCog,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Boxes,
  Mail,
  Phone,
  Truck,
  Hash,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PermissionTooltip } from '@/components/PermissionTooltip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  subscribeTempCustomers,
  updateTempCustomer,
  deleteTempCustomer,
  deleteTempCustomers,
  checkTempCustomerDependencies,
  type TempCustomerListItem,
  type TempCustomerUpdatePatch,
} from '@/lib/services/temp-customers-service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  return date.toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
}

// ── Edit dialog ────────────────────────────────────────────────────────────────

interface EditDialogProps {
  customer: TempCustomerListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditTempCustomerDialog({ customer, onClose, onSaved }: EditDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TempCustomerUpdatePatch>({});

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name ?? '',
        ruta: customer.ruta ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        consolidationEnabled: customer.consolidationEnabled ?? false,
        deliveryAddress: customer.deliveryAddress ?? '',
        courierService: customer.courierService ?? '',
      });
    }
  }, [customer]);

  const handleSave = async () => {
    if (!customer) return;
    if (!form.name?.trim()) {
      toast({
        title: 'Nombre requerido',
        description: 'El nombre del cliente temporal no puede estar vacío.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await updateTempCustomer(customer.id, form);
      toast({
        title: 'Cliente actualizado',
        description: `${form.name} guardado correctamente.`,
      });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: 'Error al actualizar',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!customer} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Editar cliente temporal
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-mono">{customer?.slCode}</span> · creado {formatRelative(customer?.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Nombre completo</label>
            <Input
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del cliente"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Truck className="h-3 w-3" />
                Ruta
              </label>
              <Input
                value={form.ruta ?? ''}
                onChange={e => setForm(f => ({ ...f, ruta: e.target.value }))}
                placeholder="Ej. Cartago"
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Teléfono
              </label>
              <Input
                value={form.phone ?? ''}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="8888-8888"
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Email
            </label>
            <Input
              type="email"
              value={form.email ?? ''}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="cliente@ejemplo.com"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Dirección de entrega</label>
            <Input
              value={form.deliveryAddress ?? ''}
              onChange={e => setForm(f => ({ ...f, deliveryAddress: e.target.value }))}
              placeholder="Dirección física"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Servicio de encomienda</label>
            <Input
              value={form.courierService ?? ''}
              onChange={e => setForm(f => ({ ...f, courierService: e.target.value }))}
              placeholder="Nombre del courier"
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Consolidación habilitada</p>
                <p className="text-xs text-muted-foreground">Múltiples paquetes por envío</p>
              </div>
            </div>
            <Switch
              checked={!!form.consolidationEnabled}
              onCheckedChange={v => setForm(f => ({ ...f, consolidationEnabled: v }))}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TempCustomers() {
  const { toast } = useToast();
  const { canUpdate, canDelete } = usePermissions();
  const [items, setItems] = useState<TempCustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rutaFilter, setRutaFilter] = useState('all');
  const [consolidationFilter, setConsolidationFilter] = useState('all');
  
  const [editing, setEditing] = useState<TempCustomerListItem | null>(null);
  const [deleting, setDeleting] = useState<TempCustomerListItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Bulk / Audit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [auditing, setAuditing] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  // Real-time subscription
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeTempCustomers(
      list => {
        setItems(list);
        setLoading(false);
      },
      err => {
        toast({
          title: 'Error al cargar clientes temporales',
          description: err.message,
          variant: 'destructive',
        });
        setLoading(false);
      },
    );
    return () => unsub();
  }, [toast, refreshKey]);

  // Derived unique routes for filter
  const uniqueRoutes = useMemo(() => {
    const routes = new Set<string>();
    items.forEach(c => {
      if (c.ruta) routes.add(c.ruta);
    });
    return Array.from(routes).sort();
  }, [items]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(c => {
      if (q) {
        const matches = (
          c.name?.toLowerCase().includes(q) ||
          c.slCode?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.ruta?.toLowerCase().includes(q) ||
          c.originalSlCode?.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }
      if (rutaFilter !== 'all') {
        if (rutaFilter === 'none' && c.ruta) return false;
        if (rutaFilter !== 'none' && c.ruta !== rutaFilter) return false;
      }
      if (consolidationFilter !== 'all') {
        const isConsol = !!c.consolidationEnabled;
        if (consolidationFilter === 'yes' && !isConsol) return false;
        if (consolidationFilter === 'no' && isConsol) return false;
      }
      return true;
    });
  }, [items, search, rutaFilter, consolidationFilter]);

  // Clear selection if items change such that selected items disappear
  useEffect(() => {
    const filteredIds = new Set(filtered.map(c => c.id));
    setSelectedIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (filteredIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [filtered]);

  // --- Handlers ---
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleAudit = async () => {
    if (filtered.length === 0) return;
    setAuditing(true);
    try {
      const slCodes = filtered.map(c => c.slCode).filter(Boolean) as string[];
      const deps = await checkTempCustomerDependencies(slCodes);
      
      const orphans = new Set<string>();
      let foundCount = 0;
      filtered.forEach(c => {
        if (!c.slCode) return;
        const d = deps[c.slCode];
        if (d && !d.hasPackages && !d.hasInvoices) {
          orphans.add(c.id);
          foundCount++;
        }
      });
      
      setSelectedIds(orphans);
      
      if (foundCount > 0) {
        toast({
          title: 'Auditoría completada',
          description: `Se encontraron ${foundCount} clientes sin paquetes ni facturas (han sido seleccionados para borrar).`,
        });
      } else {
        toast({
          title: 'Auditoría completada',
          description: 'No se encontraron clientes temporales huérfanos en la vista actual.',
        });
      }
    } catch (err) {
      toast({
        title: 'Error en auditoría',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setAuditing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirm = window.confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.size} clientes temporales? Esta acción no se puede deshacer.`);
    if (!confirm) return;
    
    setDeletingBulk(true);
    try {
      const { deleted, skipped } = await deleteTempCustomers(Array.from(selectedIds));
      toast({
        title: 'Eliminación completada',
        description: `Se eliminaron ${deleted} registros. ${skipped > 0 ? `(${skipped} omitidos)` : ''}`,
      });
      setSelectedIds(new Set());
    } catch (err) {
      toast({
        title: 'Error en eliminación',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteTempCustomer(deleting.id);
      toast({
        title: 'Cliente eliminado',
        description: `${deleting.name} (${deleting.slCode}) eliminado de temp_customers.`,
      });
      setDeleting(null);
    } catch (err) {
      toast({
        title: 'Error al eliminar',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  // Stats
  const stats = useMemo(() => {
    const total = items.length;
    const withRoute = items.filter(c => c.ruta).length;
    const withConsolidation = items.filter(c => c.consolidationEnabled).length;
    const withContact = items.filter(c => c.email || c.phone).length;
    return { total, withRoute, withConsolidation, withContact };
  }, [items]);

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
        data-testid="temp-customers-page"
      >
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg" aria-hidden="true">
              <UserCog className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                Clientes Temporales
              </h1>
              <p className="text-xs text-muted-foreground">
                Administra clientes <span className="font-mono">SL-NAN-*</span> creados automáticamente por Nova
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Truck className="h-3 w-3" /> Con ruta
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.withRoute}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Boxes className="h-3 w-3" /> Consolidación
            </p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.withConsolidation}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" /> Con contacto
            </p>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.withContact}</p>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, slCode, email, teléfono o ruta…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={rutaFilter} onValueChange={setRutaFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtro de ruta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las rutas</SelectItem>
                  <SelectItem value="none">Sin ruta</SelectItem>
                  {uniqueRoutes.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <Select value={consolidationFilter} onValueChange={setConsolidationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Consolidación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cualquiera</SelectItem>
                  <SelectItem value="yes">Con consolidación</SelectItem>
                  <SelectItem value="no">Sin consolidación</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Actions Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <PermissionTooltip allowed={canDelete('customers')}>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0 || deletingBulk || !canDelete('customers')}
                className="gap-2"
              >
                {deletingBulk ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar seleccionados ({selectedIds.size})
              </Button>
            </PermissionTooltip>
          </div>
          <div className="flex items-center gap-3">
            <PermissionTooltip allowed={canDelete('customers')}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAudit}
                disabled={auditing || filtered.length === 0 || !canDelete('customers')}
                className="gap-2"
                title="Busca clientes sin paquetes ni facturas y los selecciona para borrar"
              >
                {auditing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
                Auditar Huérfanos
              </Button>
            </PermissionTooltip>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Cargando clientes temporales…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <UserCog className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? 'No se encontraron resultados' : 'No hay clientes temporales registrados'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 w-10">
                      <Checkbox 
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onCheckedChange={handleSelectAll}
                        disabled={loading || filtered.length === 0}
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">SL Code</th>
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Ruta</th>
                    <th className="px-4 py-3 font-semibold">Contacto</th>
                    <th className="px-4 py-3 font-semibold">Origen</th>
                    <th className="px-4 py-3 font-semibold">Creado</th>
                    <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-border hover:bg-accent/40 transition-colors",
                        selectedIds.has(c.id) && "bg-primary/5"
                      )}
                      data-testid={`temp-customer-row-${c.id}`}
                    >
                      <td className="px-4 py-3">
                        <Checkbox 
                          checked={selectedIds.has(c.id)}
                          onCheckedChange={(v) => handleSelectRow(c.id, !!v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          <Hash className="h-3 w-3 mr-1" />
                          {c.slCode}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {c.name}
                          {c.consolidationEnabled && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600 dark:text-blue-400">
                              <Boxes className="h-2.5 w-2.5 mr-0.5" />
                              Consol.
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.ruta ? (
                          <Badge variant="secondary" className="text-xs">
                            <Truck className="h-3 w-3 mr-1" />
                            {c.ruta}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex flex-col gap-0.5">
                          {c.email && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </span>
                          )}
                          {!c.email && !c.phone && (
                            <span className="text-muted-foreground italic">Sin contacto</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">
                          {c.source ?? '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatRelative(c.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <PermissionTooltip allowed={canUpdate('customers')}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canUpdate('customers')}
                              onClick={() => setEditing(c)}
                              className="h-8 w-8 p-0"
                              aria-label={`Editar ${c.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </PermissionTooltip>
                          <PermissionTooltip allowed={canDelete('customers')}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canDelete('customers')}
                              onClick={() => setDeleting(c)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              aria-label={`Eliminar ${c.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </PermissionTooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer info */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Mostrando <strong>{filtered.length}</strong> de <strong>{items.length}</strong> clientes temporales
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Sincronización en tiempo real activa
              </span>
            </div>
          )}
        </Card>

        {/* Info banner */}
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 text-amber-800 dark:text-amber-300">
              <p className="font-semibold">Acerca de los clientes temporales</p>
              <p>
                Los clientes temporales (slCode <span className="font-mono">SL-NAN-*</span>) son creados automáticamente por Nova
                cuando un nombre del manifiesto no coincide con ningún cliente registrado. Sirven como placeholder
                para no bloquear la facturación.
              </p>
              <p>
                Para promover un cliente temporal a real, asígnale los paquetes a un cliente existente desde el manifiesto
                y luego elimina el registro temporal aquí.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Edit dialog */}
      <EditTempCustomerDialog
        customer={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setRefreshKey(k => k + 1)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={v => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Eliminar cliente temporal
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                ¿Eliminar <strong>{deleting?.name}</strong> (<span className="font-mono">{deleting?.slCode}</span>)?
              </span>
              <span className="block text-xs text-amber-600 dark:text-amber-400 mt-2">
                ⚠️ Esto NO afecta a paquetes, facturas o manifiestos que ya referencian este slCode.
                Asegúrate de re-asignarlos antes de eliminar.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
