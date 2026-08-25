/**
 * Encomienda Management — SP1 Admin Panel
 *
 * Full CRUD for courier/encomienda providers.
 * Real-time updates via Firestore onSnapshot.
 * Bidirectional sync with SP2 on every write.
 *
 * @module pages/encomiendas/EncomiendaManagement
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  MapPin,
  X,
  ChevronDown,
  ChevronUp,
  Globe,
  Phone,
  Clock,
  Package,
  User,
  Mail,
} from "lucide-react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import {
  subscribeEncomiendas,
  subscribeSP2Changes,
  createEncomienda,
  updateEncomienda,
  patchEncomienda,
  deleteEncomienda,
  importFromSP2,
  encomiendaToForm,
  EMPTY_FORM,
  type Encomienda,
  type EncomiendaFormData,
} from "@/lib/services/encomienda-service";
import { firestoreApi, COLLECTIONS } from "@/lib/firebase/firestore-client";
import { db } from "@/lib/firebase/config";
import { getDocs, query, collection, where, limit } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabFilter = "all" | "active" | "inactive" | "pending";

const REVIEW_STATUS_MAP = {
  seeded: {
    label: "Semilla",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
  approved: {
    label: "Aprobado",
    className: "border-green-200 bg-green-50 text-green-700",
  },
  pending: {
    label: "Pendiente",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  rejected: {
    label: "Rechazado",
    className: "border-red-200 bg-red-50 text-red-700",
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeStr = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// ─── ZoneTagInput ─────────────────────────────────────────────────────────────

interface ZoneTagInputProps {
  value: string[];
  onChange: (zones: string[]) => void;
  suggestions: string[];
}

const ZoneTagInput = memo<ZoneTagInputProps>(function ZoneTagInput({
  value,
  onChange,
  suggestions,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = norm(query);
    return suggestions
      .filter(
        (s) => !value.some((v) => norm(v) === norm(s)) && norm(s).includes(q)
      )
      .slice(0, 10);
  }, [query, suggestions, value]);

  const addZone = useCallback(
    (zone: string) => {
      const trimmed = zone.trim();
      if (!trimmed) return;
      if (value.some((v) => norm(v) === norm(trimmed))) return;
      onChange([...value, trimmed]);
      setQuery("");
      setOpen(false);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const removeZone = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        addZone(filtered[0]);
      } else if (query.trim()) {
        addZone(query);
      }
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      removeZone(value.length - 1);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      data-testid="zone-tag-input"
      role="group"
      aria-label="Zonas de cobertura"
    >
      <div
        className={cn(
          "min-h-[2.5rem] w-full rounded-md border bg-background px-3 py-2 text-sm flex flex-wrap gap-1.5 cursor-text transition-colors",
          focused
            ? "border-primary ring-2 ring-ring ring-offset-2"
            : "border-input"
        )}
        onClick={() => inputRef.current?.focus()}
        role="presentation"
      >
        {value.map((zone, i) => (
          <span
            key={`${zone}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5"
            data-testid="zone-tag"
          >
            <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
            {zone}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeZone(i);
              }}
              className="hover:text-destructive focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full"
              aria-label={`Eliminar zona ${zone}`}
              data-testid={`remove-zone-${i}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            if (query) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "Escribe para buscar zonas…" : ""}
          className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          aria-label="Buscar o agregar zona"
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
          aria-controls="zone-suggestions"
          autoComplete="off"
          data-testid="zone-input"
        />
      </div>

      {open && (filtered.length > 0 || query.trim()) && (
        <ul
          id="zone-suggestions"
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md py-1 max-h-48 overflow-y-auto"
          aria-label="Sugerencias de zonas"
          data-testid="zone-suggestions"
        >
          {filtered.map((s) => {
            const idx = norm(s).indexOf(norm(query));
            return (
              <li
                key={s}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addZone(s);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                data-testid={`zone-suggestion-${s}`}
              >
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  {s.slice(0, idx)}
                  <mark className="bg-yellow-100 text-yellow-800 rounded px-0.5">
                    {s.slice(idx, idx + query.length)}
                  </mark>
                  {s.slice(idx + query.length)}
                </span>
              </li>
            );
          })}
          {query.trim() &&
            !filtered.some((s) => norm(s) === norm(query.trim())) && (
              <li
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addZone(query.trim());
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground text-muted-foreground italic"
                data-testid="zone-add-new"
              >
                <Plus className="h-3 w-3 shrink-0" aria-hidden="true" />
                Agregar &ldquo;{query.trim()}&rdquo;
              </li>
            )}
        </ul>
      )}
    </div>
  );
});

// ─── FieldGroup ───────────────────────────────────────────────────────────────

const FieldGroup = memo<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}>(function FieldGroup({ label, required, children, hint, htmlFor }) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
});

// ─── ZoneChips ────────────────────────────────────────────────────────────────

const ZoneChips = memo<{ zones: string[]; max?: number }>(function ZoneChips({
  zones,
  max = 4,
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? zones : zones.slice(0, max);
  const hidden = zones.length - max;

  return (
    <div className="flex flex-wrap gap-1" role="list" aria-label="Zonas de cobertura">
      {visible.map((z) => (
        <span
          key={z}
          role="listitem"
          className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5"
        >
          <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {z}
        </span>
      ))}
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 text-muted-foreground text-[11px] px-2 py-0.5 hover:bg-muted transition-colors"
          aria-label={`Ver ${hidden} zonas más`}
          data-testid="zone-show-more"
        >
          <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />+{hidden}
        </button>
      )}
      {expanded && zones.length > max && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 text-muted-foreground text-[11px] px-2 py-0.5 hover:bg-muted transition-colors"
          aria-label="Ver menos zonas"
          data-testid="zone-show-less"
        >
          <ChevronUp className="h-2.5 w-2.5" aria-hidden="true" />Menos
        </button>
      )}
    </div>
  );
});

// ─── StatCard ─────────────────────────────────────────────────────────────────

const StatCard = memo<{
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive";
}>(function StatCard({ label, value, icon, variant = "default" }) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    destructive: "bg-red-100 text-red-700",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        colors[variant]
      )}
      data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs opacity-80 mt-0.5">{label}</p>
      </div>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

const EncomiendaManagement: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLocale(["encomiendas", "common"]);

  // ── State ────────────────────────────────────────────────────────────────
  const [encomiendas, setEncomiendas] = useState<Encomienda[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Encomienda | null>(null);
  const [form, setForm] = useState<EncomiendaFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<EncomiendaFormData>>({});

  const [deleteTarget, setDeleteTarget] = useState<Encomienda | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [importingFromSP2, setImportingFromSP2] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [submitterCache, setSubmitterCache] = useState<Map<string, { fullName?: string; slCode?: string }>>(new Map());

  // ── Submitter lookup: fetch customer info for user-submitted providers ─────
  useEffect(() => {
    const fetchMissing = async () => {
      for (const id of expandedRows) {
        const enc = encomiendas.find(e => e.id === id);
        if (!enc?.isUserSubmitted || !enc.submittedBy || submitterCache.has(enc.submittedBy)) continue;
        try {
          // Try by customer document ID = Firebase Auth UID
          const resp = await firestoreApi.customers.get(enc.submittedBy) as any;
          if (resp?.success && resp.data) {
            setSubmitterCache(prev => new Map(prev).set(enc.submittedBy!, { fullName: resp.data.fullName, slCode: resp.data.slCode }));
            continue;
          }
          // Fallback: query by email
          if (enc.submittedByEmail) {
            const snap = await getDocs(query(collection(db, COLLECTIONS.CUSTOMERS), where('email', '==', enc.submittedByEmail), limit(1)));
            if (!snap.empty) {
              const d = snap.docs[0].data();
              setSubmitterCache(prev => new Map(prev).set(enc.submittedBy!, { fullName: d.fullName, slCode: d.slCode }));
            }
          }
        } catch { /* silent */ }
      }
    };
    fetchMissing();
  }, [expandedRows, encomiendas]);

  // ── Real-time subscription (SP1) ──────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeEncomiendas(
      (items) => {
        setEncomiendas(items);
        setLoading(false);
      },
      (err) => {
        console.error("encomiendas subscription error", err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // ── Real-time SP2 → SP1 sync ──────────────────────────────────────────────
  // Listens to SP2's public collection; applies SP2-originated changes to SP1.
  // SP1-originated writes are filtered out via recentSP1Writes TTL map.
  useEffect(() => {
    // 1. Fetch missing/offline changes immediately on mount
    importFromSP2().catch(err => console.error("Auto-sync from SP2 failed:", err));
    
    // 2. Subscribe to real-time changes while the page is open
    return subscribeSP2Changes();
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let active = 0, inactive = 0, pending = 0, userSubmitted = 0;
    for (const e of encomiendas) {
      if (e.active) active++;
      else inactive++;
      if (e.reviewStatus === "pending") pending++;
      if (e.isUserSubmitted) userSubmitted++;
    }
    return { total: encomiendas.length, active, inactive, pending, userSubmitted };
  }, [encomiendas]);

  // ── Tab badge counts (search-aware) ───────────────────────────────────────
  const tabCounts = useMemo(() => {
    const src = search.trim()
      ? (() => {
          const q = normalizeStr(search);
          return encomiendas.filter(
            (e) =>
              normalizeStr(e.name).includes(q) ||
              normalizeStr(e.description).includes(q) ||
              (e.zones ?? []).some((z) => normalizeStr(z).includes(q)) ||
              (e.phone && e.phone.includes(q))
          );
        })()
      : encomiendas;

    let active = 0, inactive = 0, pending = 0;
    for (const e of src) {
      if (e.active) active++;
      else inactive++;
      if (e.reviewStatus === "pending") pending++;
    }
    return { all: src.length, active, inactive, pending };
  }, [encomiendas, search]);

  // ── All known zones (autocomplete) ────────────────────────────────────────
  const allKnownZones = useMemo(() => {
    const set = new Set<string>();
    encomiendas.forEach((e) =>
      (e.zones ?? []).forEach((z) => {
        if (z?.trim()) set.add(z.trim());
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [encomiendas]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = encomiendas;

    if (tab === "active") list = list.filter((e) => e.active);
    if (tab === "inactive") list = list.filter((e) => !e.active);
    if (tab === "pending") list = list.filter((e) => e.reviewStatus === "pending");

    if (search.trim()) {
      const q = normalizeStr(search);
      list = list.filter(
        (e) =>
          normalizeStr(e.name).includes(q) ||
          normalizeStr(e.description).includes(q) ||
          (e.zones ?? []).some((z) => normalizeStr(z).includes(q)) ||
          (e.phone && e.phone.includes(search))
      );
    }

    return list;
  }, [encomiendas, tab, search]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  const setField = useCallback(
    <K extends keyof EncomiendaFormData>(key: K, value: EncomiendaFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    [formErrors]
  );

  const validateForm = (): boolean => {
    const errors: Partial<EncomiendaFormData> = {};
    if (!form.name.trim()) errors.name = "Requerido";
    if (!form.phone.trim()) errors.phone = "Requerido";
    if (!form.zonesRaw.trim()) errors.zonesRaw = "Agrega al menos una zona";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((e: Encomienda) => {
    setEditing(e);
    setForm(encomiendaToForm(e));
    setFormErrors({});
    setFormOpen(true);
  }, []);

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateEncomienda(editing.id, form);
        toast({ title: "Proveedor actualizado", description: form.name });
      } else {
        await createEncomienda(form);
        toast({ title: "Proveedor creado", description: form.name });
      }
      setFormOpen(false);
    } catch (err) {
      toast({
        title: "Error al guardar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = useCallback(
    async (e: Encomienda) => {
      try {
        await patchEncomienda(e.id, { active: !e.active });
        toast({
          title: e.active ? "Proveedor desactivado" : "Proveedor activado",
          description: e.name,
        });
      } catch {
        toast({ title: "Error al cambiar estado", variant: "destructive" });
      }
    },
    [toast]
  );

  const handleReview = useCallback(
    async (e: Encomienda, status: "approved" | "rejected") => {
      try {
        // If approved, we also make it active. If rejected, inactive.
        await patchEncomienda(e.id, { reviewStatus: status, active: status === "approved" });
        toast({
          title: status === "approved" ? "Servicio aprobado" : "Servicio rechazado",
          description: e.name,
        });
      } catch (err) {
        toast({
          title: "Error al actualizar estado",
          description: err instanceof Error ? err.message : "Error desconocido",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEncomienda(deleteTarget.id);
      toast({ title: "Proveedor eliminado", description: deleteTarget.name });
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: "Error al eliminar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleImportFromSP2 = async () => {
    setImportingFromSP2(true);
    try {
      const { imported, updated, skipped } = await importFromSP2();
      const hasChanges = imported > 0 || updated > 0;
      toast({
        title: hasChanges ? "Sync SP2 completado" : "Todo al día",
        description: hasChanges
          ? [
              imported > 0 && `${imported} nuevos`,
              updated > 0 && `${updated} actualizados`,
              skipped > 0 && `${skipped} sin cambios`,
            ]
              .filter(Boolean)
              .join(" · ")
          : `${skipped} registros ya están actualizados.`,
      });
    } catch (err) {
      toast({
        title: "Error al importar",
        description: err instanceof Error ? err.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setImportingFromSP2(false);
    }
  };

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TAB_LIST: { key: TabFilter; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: tabCounts.all },
    { key: "active", label: "Activos", count: tabCounts.active },
    { key: "inactive", label: "Inactivos", count: tabCounts.inactive },
    { key: "pending", label: "Pendientes", count: tabCounts.pending },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <section
        className="flex flex-col gap-6 p-4 sm:p-6"
        aria-label="Gestión de Encomiendas"
        data-testid="encomienda-management"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="rounded-lg bg-primary/10 p-2.5"
              aria-hidden="true"
            >
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Encomiendas</h1>
              <p className="text-sm text-muted-foreground">
                Gestión de proveedores de encomienda y courier
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportFromSP2}
              disabled={importingFromSP2}
              aria-label="Importar datos desde SP2"
              data-testid="import-sp2-btn"
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-1.5", importingFromSP2 && "animate-spin")}
                aria-hidden="true"
              />
              Sync SP2
            </Button>
            <Button
              size="sm"
              onClick={openCreate}
              aria-label="Nuevo proveedor de encomienda"
              data-testid="new-encomienda-btn"
            >
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Nuevo proveedor
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          role="region"
          aria-label="Estadísticas de encomiendas"
          data-testid="encomienda-stats"
        >
          <StatCard
            label="Total"
            value={stats.total}
            icon={<Package className="h-5 w-5" />}
          />
          <StatCard
            label="Activos"
            value={stats.active}
            icon={<CheckCircle className="h-5 w-5" />}
            variant="success"
          />
          <StatCard
            label="Inactivos"
            value={stats.inactive}
            icon={<XCircle className="h-5 w-5" />}
            variant="destructive"
          />
          <StatCard
            label="Pendientes"
            value={stats.pending}
            icon={<Clock className="h-5 w-5" />}
            variant="warning"
          />
        </div>

        {/* Filters */}
        <div
          className="flex flex-col sm:flex-row gap-3"
          role="search"
          aria-label="Filtros de encomiendas"
        >
          {/* Tabs */}
          <div
            className="flex gap-1 bg-muted rounded-lg p-1 border"
            role="tablist"
            aria-label="Filtrar proveedores"
            data-testid="encomienda-tabs"
          >
            {TAB_LIST.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 flex items-center gap-1.5",
                  tab === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
                data-testid={`tab-${key}`}
              >
                {label}
                <span
                  className={cn(
                    "flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold",
                    tab === key
                      ? "bg-foreground text-background"
                      : "bg-muted-foreground/20 text-muted-foreground"
                  )}
                  aria-label={`${count} ${label.toLowerCase()}`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm" data-testid="search-container">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, zona, teléfono…"
              className="pl-9 pr-9 h-9 text-sm"
              aria-label="Buscar encomiendas"
              data-testid="search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
                data-testid="clear-search-btn"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div
          className="rounded-lg border bg-card overflow-hidden"
          role="region"
          aria-label="Lista de proveedores de encomienda"
          data-testid="encomienda-table"
        >
          {loading ? (
            <div
              className="flex items-center justify-center py-20 text-muted-foreground"
              role="status"
              aria-live="polite"
              data-testid="loading-state"
            >
              <RefreshCw className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
              Cargando proveedores…
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2"
              role="status"
              aria-live="polite"
              data-testid="empty-state"
            >
              <Truck className="h-10 w-10 opacity-20" aria-hidden="true" />
              <p className="text-sm font-medium">
                {search
                  ? `Sin resultados para "${search}"`
                  : "No hay proveedores aún"}
              </p>
              {!search && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openCreate}
                  data-testid="empty-create-btn"
                >
                  <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Crear primer proveedor
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                aria-label="Proveedores de encomienda"
                data-testid="providers-table"
              >
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Proveedor
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell"
                    >
                      Zonas
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell"
                    >
                      Contacto
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell"
                    >
                      Costo / Días
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Estado
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {filtered.map((enc) => {
                      const isExpanded = expandedRows.has(enc.id);
                      const reviewCfg =
                        REVIEW_STATUS_MAP[enc.reviewStatus] ??
                        REVIEW_STATUS_MAP.seeded;

                      return (
                        <React.Fragment key={enc.id}>
                          <motion.tr
                            layout
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                              "border-b transition-colors hover:bg-muted/40",
                              !enc.active && "opacity-60"
                            )}
                            data-testid={`row-${enc.id}`}
                          >
                            {/* Provider */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleRow(enc.id)}
                                  className="p-0.5 rounded hover:bg-muted transition-colors"
                                  aria-expanded={isExpanded}
                                  aria-label={`${isExpanded ? "Colapsar" : "Expandir"} detalles de ${enc.name}`}
                                  data-testid={`expand-${enc.id}`}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                  )}
                                </button>
                                <div>
                                  <p className="font-semibold text-sm">{enc.name}</p>
                                  {enc.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-[16rem]">
                                      {enc.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Zones */}
                            <td className="px-4 py-3 hidden md:table-cell">
                              <ZoneChips zones={enc.zones} max={3} />
                            </td>

                            {/* Contact */}
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                {enc.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" aria-hidden="true" />
                                    {enc.phone}
                                  </span>
                                )}
                                {enc.website && (
                                  <a
                                    href={enc.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 hover:text-primary transition-colors"
                                    aria-label={`Sitio web de ${enc.name}`}
                                  >
                                    <Globe className="h-3 w-3" aria-hidden="true" />
                                    Web
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Cost / Days */}
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {enc.costDisplay && (
                                  <p>{enc.costDisplay}</p>
                                )}
                                {enc.estimatedDays && (
                                  <p className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" aria-hidden="true" />
                                    {enc.estimatedDays}
                                  </p>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={enc.active}
                                    onCheckedChange={() =>
                                      handleToggleActive(enc)
                                    }
                                    aria-label={`${enc.active ? "Desactivar" : "Activar"} ${enc.name}`}
                                    data-testid={`toggle-active-${enc.id}`}
                                  />
                                  <span
                                    className={cn(
                                      "text-xs font-medium",
                                      enc.active
                                        ? "text-green-600"
                                        : "text-muted-foreground"
                                    )}
                                  >
                                    {enc.active ? "Activo" : "Inactivo"}
                                  </span>
                                </div>
                                <span
                                  className={cn(
                                    "inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                    reviewCfg.className
                                  )}
                                  data-testid={`review-badge-${enc.id}`}
                                >
                                  {reviewCfg.label}
                                </span>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {enc.reviewStatus === "pending" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleReview(enc, "approved")}
                                      aria-label={`Aprobar ${enc.name}`}
                                      data-testid={`approve-btn-${enc.id}`}
                                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                                      title="Aprobar servicio"
                                    >
                                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleReview(enc, "rejected")}
                                      aria-label={`Rechazar ${enc.name}`}
                                      data-testid={`reject-btn-${enc.id}`}
                                      className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-100"
                                      title="Rechazar servicio"
                                    >
                                      <XCircle className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                    <div className="w-px h-4 bg-border mx-1" />
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEdit(enc)}
                                  aria-label={`Editar ${enc.name}`}
                                  data-testid={`edit-btn-${enc.id}`}
                                  className="h-8 w-8"
                                >
                                  <Edit2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(enc)}
                                  aria-label={`Eliminar ${enc.name}`}
                                  data-testid={`delete-btn-${enc.id}`}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>
                            </td>
                          </motion.tr>

                          {/* Expanded row */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.tr
                                key={`${enc.id}-expanded`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                data-testid={`row-expanded-${enc.id}`}
                              >
                                <td
                                  colSpan={6}
                                  className="px-6 py-4 bg-muted/30 border-b"
                                >
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                                        Dirección de Retiro
                                      </p>
                                      <p>{enc.pickupAddress || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                                        Horario
                                      </p>
                                      <p>{enc.schedule || "—"}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                                        Todas las Zonas ({enc.zones.length})
                                      </p>
                                      <ZoneChips zones={enc.zones} max={enc.zones.length} />
                                    </div>
                                    {enc.isUserSubmitted && (
                                      <div className="sm:col-span-2 md:col-span-3 pt-2 border-t">
                                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                                          <User className="h-3 w-3" aria-hidden="true" />
                                          Enviado por
                                        </p>
                                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                                          {submitterCache.get(enc.submittedBy ?? '')?.fullName && (
                                            <span className="font-semibold text-foreground">
                                              {submitterCache.get(enc.submittedBy ?? '')!.fullName}
                                            </span>
                                          )}
                                          {submitterCache.get(enc.submittedBy ?? '')?.slCode && (
                                            <span className="font-mono text-muted-foreground">
                                              {submitterCache.get(enc.submittedBy ?? '')!.slCode}
                                            </span>
                                          )}
                                          {enc.submittedByEmail && (
                                            <span className="flex items-center gap-1 text-muted-foreground">
                                              <Mail className="h-3 w-3" aria-hidden="true" />
                                              {enc.submittedByEmail}
                                            </span>
                                          )}
                                          {enc.detectedCanton && (
                                            <span className="flex items-center gap-1 text-muted-foreground">
                                              <MapPin className="h-3 w-3" aria-hidden="true" />
                                              {enc.detectedCanton}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div
              className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between text-xs text-muted-foreground"
              aria-live="polite"
              data-testid="table-footer"
            >
              <span>
                {filtered.length} proveedor{filtered.length !== 1 ? "es" : ""} de{" "}
                {encomiendas.length}
              </span>
              <span
                className="flex items-center gap-1"
                title="Sincronización en tiempo real"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
                En tiempo real
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!saving) setFormOpen(open);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90dvh] overflow-y-auto"
          aria-modal="true"
          role="dialog"
          aria-labelledby="encomienda-dialog-title"
          data-testid="encomienda-form-dialog"
        >
          <DialogHeader>
            <DialogTitle id="encomienda-dialog-title">
              {editing ? `Editar: ${editing.name}` : "Nuevo Proveedor de Encomienda"}
            </DialogTitle>
          </DialogHeader>

          <form
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            noValidate
            aria-label="Formulario de encomienda"
            data-testid="encomienda-form"
          >
            {/* Name */}
            <FieldGroup label="Nombre" required htmlFor="enc-name">
              <Input
                id="enc-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Nombre del proveedor"
                aria-required="true"
                aria-invalid={!!formErrors.name}
                aria-describedby={formErrors.name ? "enc-name-error" : undefined}
                data-testid="form-name"
                className={formErrors.name ? "border-destructive" : ""}
              />
              {formErrors.name && (
                <p id="enc-name-error" className="text-xs text-destructive" role="alert">
                  {formErrors.name}
                </p>
              )}
            </FieldGroup>

            {/* Phone */}
            <FieldGroup label="Teléfono" required htmlFor="enc-phone">
              <Input
                id="enc-phone"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="Ej: 2222-3333"
                aria-required="true"
                aria-invalid={!!formErrors.phone}
                data-testid="form-phone"
                className={formErrors.phone ? "border-destructive" : ""}
              />
              {formErrors.phone && (
                <p className="text-xs text-destructive" role="alert">
                  {formErrors.phone}
                </p>
              )}
            </FieldGroup>

            {/* Email */}
            <FieldGroup label="Correo electrónico" htmlFor="enc-email">
              <Input
                id="enc-email"
                type="email"
                value={form.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="correo@ejemplo.com"
                data-testid="form-email"
              />
            </FieldGroup>

            {/* Website */}
            <FieldGroup label="Sitio web" htmlFor="enc-website">
              <Input
                id="enc-website"
                type="url"
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="https://…"
                data-testid="form-website"
              />
            </FieldGroup>

            {/* Cost display */}
            <FieldGroup label="Costo (texto)" htmlFor="enc-cost-display">
              <Input
                id="enc-cost-display"
                value={form.costDisplay}
                onChange={(e) => setField("costDisplay", e.target.value)}
                placeholder="Ej: Definido por la encomienda"
                data-testid="form-cost-display"
              />
            </FieldGroup>

            {/* Estimated Days */}
            <FieldGroup label="Días estimados" htmlFor="enc-days">
              <Input
                id="enc-days"
                value={form.estimatedDays}
                onChange={(e) => setField("estimatedDays", e.target.value)}
                placeholder="Ej: 1-2 días"
                data-testid="form-days"
              />
            </FieldGroup>

            {/* Pickup Address */}
            <FieldGroup label="Dirección de retiro" htmlFor="enc-address" hint="Dirección donde el cliente debe dejar el paquete">
              <Input
                id="enc-address"
                value={form.pickupAddress}
                onChange={(e) => setField("pickupAddress", e.target.value)}
                placeholder="Dirección de retiro"
                data-testid="form-address"
              />
            </FieldGroup>

            {/* Schedule */}
            <FieldGroup label="Horario" htmlFor="enc-schedule">
              <Input
                id="enc-schedule"
                value={form.schedule}
                onChange={(e) => setField("schedule", e.target.value)}
                placeholder="Ej: Lun–Vie 8am–5pm"
                data-testid="form-schedule"
              />
            </FieldGroup>

            {/* Description — full width */}
            <div className="sm:col-span-2">
              <FieldGroup label="Descripción" htmlFor="enc-description">
                <Textarea
                  id="enc-description"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="Breve descripción del servicio…"
                  rows={2}
                  aria-label="Descripción del proveedor"
                  data-testid="form-description"
                />
              </FieldGroup>
            </div>

            {/* Zones — full width */}
            <div className="sm:col-span-2">
              <FieldGroup
                label="Zonas de cobertura"
                required
                hint={`${form.zonesRaw.split(",").filter((z) => z.trim()).length} zona(s) — escribe para buscar o agrega una nueva`}
              >
                <ZoneTagInput
                  value={form.zonesRaw
                    .split(",")
                    .map((z) => z.trim())
                    .filter(Boolean)}
                  onChange={(zones) => setField("zonesRaw", zones.join(", "))}
                  suggestions={allKnownZones}
                />
                {formErrors.zonesRaw && (
                  <p className="text-xs text-destructive" role="alert">
                    {formErrors.zonesRaw}
                  </p>
                )}
              </FieldGroup>
            </div>

            {/* Active toggle */}
            <div className="sm:col-span-2 flex items-center gap-3 pt-1">
              <Switch
                id="enc-active"
                checked={form.active}
                onCheckedChange={(v) => setField("active", v)}
                aria-label="Estado activo del proveedor"
                data-testid="form-active-toggle"
              />
              <label
                htmlFor="enc-active"
                className="text-sm font-medium cursor-pointer"
              >
                {form.active ? "Activo — visible para clientes" : "Inactivo — oculto"}
              </label>
            </div>
          </form>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
              data-testid="form-cancel-btn"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
              data-testid="form-save-btn"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : editing ? (
                "Guardar cambios"
              ) : (
                "Crear proveedor"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ─────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent
          data-testid="delete-dialog"
          role="alertdialog"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-desc"
        >
          <AlertDialogHeader>
            <AlertDialogTitle id="delete-dialog-title">
              ¿Eliminar proveedor?
            </AlertDialogTitle>
            <AlertDialogDescription id="delete-dialog-desc">
              Esta acción eliminará &ldquo;
              <strong>{deleteTarget?.name}</strong>&rdquo; de SP1 y SP2. No se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              data-testid="delete-cancel-btn"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              aria-busy={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="delete-confirm-btn"
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default EncomiendaManagement;
