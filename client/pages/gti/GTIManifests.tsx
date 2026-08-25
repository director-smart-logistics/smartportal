/**
 * GTIManifests — Manifiestos › GTI
 *
 * Full management & administration of saved GTI tiquete exports from `gti_manifests` collection.
 * Allows 100% editing of all values:
 *  - Inline cell editing (Nombre, Cédula, Email, Teléfono, Descripción, Precio USD, Tipo Doc, Medio Pago, Condición Venta)
 *  - Live recalculation of MONTO, FLETE, LOGÍSTICA when Precio USD or TC is updated
 *  - Manifest-level TC editing
 *  - Add custom row / Delete rows
 *  - Bulk update any field & Bulk export (Official 52-col GTI Excel / CSV + Simple Summary)
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileDown,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Download,
  FileText,
  Calendar,
  Users,
  Filter,
  X,
  Pencil,
  Check,
  CheckSquare,
  Square,
  Layers,
  AlertCircle,
  Plus,
  Trash2,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  subscribeGTIManifests,
  updateGTIManifestRows,
  updateGTIManifestTC,
  deleteGTIManifestRows,
  addGTIManifestRow,
  type GTIManifestDoc,
} from '@/lib/services/gti-manifest-service';
import {
  downloadGTITiquetes,
  downloadGTITiquetesXLSX,
  type GTICalculatedRow,
  type GTIRowInput,
} from '@/lib/services/gti-export';

// ── Editable fields config ────────────────────────────────────────────────────

type EditableField =
  | 'nombre'
  | 'dni'
  | 'email'
  | 'phone'
  | 'descripcion'
  | 'precioUSD'
  | 'tipoDocumento'
  | 'medioPago'
  | 'condicionVenta';

const EDITABLE_FIELDS: { key: EditableField; label: string }[] = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'dni', label: 'Cédula' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'precioUSD', label: 'Precio USD ($)' },
  { key: 'tipoDocumento', label: 'Tipo Doc (01 FE / 04 TE)' },
  { key: 'medioPago', label: 'Medio Pago (01, 03, 06, 02)' },
  { key: 'condicionVenta', label: 'Condición Venta (01 / 02)' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: GTIManifestDoc['exportedAt']): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return (
    d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Costa_Rica' }) +
    ' ' +
    d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' })
  );
}

function fmtAmt(n: number): string {
  return '₡' + n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildCSV(manifest: GTIManifestDoc): string {
  const BOM = '\uFEFF';
  const HEADERS = ['Nombre', 'Cédula', 'Email', 'Teléfono', 'Descripción', 'PrecioUSD', 'TC', 'MONTO (₡)', 'FLETE 01 (₡)', 'LOG. c/IVA 02 (₡)'];
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = [HEADERS.join(',')];
  for (const r of manifest.rows) {
    if (r.precioUSD <= 0) continue;
    const logConIva = Math.round(r.logistica * 1.13 * 100) / 100;
    lines.push(
      [
        esc(r.nombre),
        esc(r.dni),
        esc(r.email),
        esc(r.phone),
        esc(r.descripcion || ''),
        r.precioUSD.toFixed(2),
        manifest.tc,
        r.monto.toFixed(2),
        r.flete.toFixed(2),
        logConIva.toFixed(2),
      ].join(',')
    );
  }
  return BOM + lines.join('\r\n');
}

function downloadCSVManifest(manifest: GTIManifestDoc) {
  const csv = buildCSV(manifest);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GTI_${manifest.manifestNumber}${manifest.routeSuffix ? '_' + manifest.routeSuffix : ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXLSXManifest(manifest: GTIManifestDoc) {
  const headers = [
    'Nombre',
    'Cédula',
    'Email',
    'Teléfono',
    'Descripción',
    'PrecioUSD',
    'TC',
    'MONTO (₡)',
    'FLETE 01 (₡)',
    'LOG. c/IVA 02 (₡)',
  ];

  const wsData = [
    headers,
    ...manifest.rows
      .filter((r) => r.precioUSD > 0)
      .map((r) => [
        r.nombre,
        r.dni,
        r.email,
        r.phone,
        r.descripcion || '',
        r.precioUSD,
        manifest.tc,
        r.monto,
        r.flete,
        Math.round(r.logistica * 1.13 * 100) / 100,
      ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 32 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 30 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GTI');
  XLSX.writeFile(wb, `GTI_${manifest.manifestNumber}${manifest.routeSuffix ? '_' + manifest.routeSuffix : ''}.xlsx`);
}

// ── EditableCell ─────────────────────────────────────────────────────────────

function EditableCell({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback(() => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onCommit(trimmed);
  }, [draft, value, onCommit]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  if (editing) {
    return (
      <td className={cn('px-1 py-0.5', className)}>
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            className="w-full min-w-[70px] px-1.5 py-0.5 text-xs rounded border border-primary/60 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono"
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              commit();
            }}
            className="text-green-600 hover:text-green-700 flex-shrink-0"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              cancel();
            }}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      className={cn(
        'px-2.5 py-1.5 group cursor-pointer hover:bg-primary/5 transition-colors',
        className
      )}
      onClick={start}
      title="Click para editar"
    >
      <span className="flex items-center gap-1">
        <span className="truncate max-w-[140px]">{value || <span className="text-muted-foreground/50 italic">—</span>}</span>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" />
      </span>
    </td>
  );
}

// ── RowsTable with full selection + inline edit ───────────────────────────────

function RowsTable({
  manifest,
  rows,
  rowIndexMap,
  selected,
  onToggle,
  onToggleAll,
  onCellCommit,
  onDeleteRow,
}: {
  manifest: GTIManifestDoc;
  rows: Array<GTICalculatedRow & { _origIdx: number }>;
  rowIndexMap: Map<number, number>;
  selected: Set<number>;
  onToggle: (origIdx: number) => void;
  onToggleAll: (select: boolean) => void;
  onCellCommit: (origIdx: number, field: EditableField, value: any) => void;
  onDeleteRow: (origIdx: number) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r._origIdx));
  const someSelected = rows.some((r) => selected.has(r._origIdx));

  return (
    <div className="overflow-x-auto rounded-md border border-border/50 mt-3 shadow-2xs">
      <table className="w-full text-xs">
        <thead className="bg-muted/60 text-muted-foreground border-b border-border/60">
          <tr>
            <th className="px-2 py-2.5 w-7 text-center whitespace-nowrap">
              <button
                type="button"
                onClick={() => onToggleAll(!allSelected)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
              >
                {allSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-primary" />
                ) : someSelected ? (
                  <Layers className="h-3.5 w-3.5 opacity-60" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
              </button>
            </th>
            <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Cliente & Cédula</th>
            <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Contacto / Descripción</th>
            <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap">Doc / Medio / Cond (Hacienda)</th>
            <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">Precio USD ($)</th>
            <th className="px-3 py-2.5 text-right font-medium whitespace-nowrap">Montos en Colones (₡)</th>
            <th className="px-3 py-2.5 text-center font-medium whitespace-nowrap w-12">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {rows.map((r) => {
            const isSel = selected.has(r._origIdx);
            const docTypeVal = r.tipoDocumento || (r.electronicInvoiceRequired ? '01' : '04');
            const medioPagoVal = r.medioPago || '06';
            const condVentaVal = r.condicionVenta || '01';
            const logConIva = Math.round(r.logistica * 1.13 * 100) / 100;

            return (
              <tr
                key={r._origIdx}
                className={cn('transition-colors', isSel ? 'bg-primary/5' : 'hover:bg-muted/20')}
              >
                {/* Checkbox */}
                <td className="px-2 py-2 w-7 text-center align-middle">
                  <button
                    type="button"
                    onClick={() => onToggle(r._origIdx)}
                    className={cn(
                      'transition-colors',
                      isSel ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                    aria-label="Seleccionar fila"
                  >
                    {isSel ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  </button>
                </td>

                {/* Cliente + Cédula Editable */}
                <td className="px-3 py-2 align-middle">
                  <div className="flex flex-col">
                    <EditableCell
                      value={r.nombre}
                      onCommit={(v) => onCellCommit(r._origIdx, 'nombre', v)}
                      className="font-semibold text-foreground text-xs"
                    />
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                      <span className="font-mono text-[10px] opacity-70">DNI:</span>
                      <EditableCell
                        value={r.dni || ''}
                        onCommit={(v) => onCellCommit(r._origIdx, 'dni', v)}
                        className="font-mono text-muted-foreground"
                      />
                    </div>
                  </div>
                </td>

                {/* Contacto + Descripción */}
                <td className="px-3 py-2 align-middle">
                  <div className="flex flex-col gap-0.5">
                    <EditableCell
                      value={r.descripcion || 'Flete Internacional'}
                      onCommit={(v) => onCellCommit(r._origIdx, 'descripcion', v)}
                      className="font-medium text-xs text-foreground/90"
                    />
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <EditableCell
                        value={r.email || ''}
                        onCommit={(v) => onCellCommit(r._origIdx, 'email', v)}
                        className="text-muted-foreground truncate max-w-[140px]"
                      />
                      {r.phone && <span className="opacity-40">•</span>}
                      <EditableCell
                        value={r.phone || ''}
                        onCommit={(v) => onCellCommit(r._origIdx, 'phone', v)}
                        className="text-muted-foreground font-mono"
                      />
                    </div>
                  </div>
                </td>

                {/* Config Hacienda (Doc / Medio / Cond) */}
                <td className="px-3 py-2 align-middle">
                  <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <select
                      value={docTypeVal}
                      onChange={(e) => onCellCommit(r._origIdx, 'tipoDocumento', e.target.value)}
                      className="bg-muted/40 hover:bg-muted text-[11px] font-mono border border-border/60 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer shadow-2xs transition-colors"
                      title="Tipo de Documento Fiscal"
                    >
                      <option value="04">04 TE</option>
                      <option value="01">01 FE</option>
                    </select>

                    <select
                      value={medioPagoVal}
                      onChange={(e) => onCellCommit(r._origIdx, 'medioPago', e.target.value)}
                      className="bg-muted/40 hover:bg-muted text-[11px] font-mono border border-border/60 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer shadow-2xs transition-colors"
                      title="Medio de Pago"
                    >
                      <option value="06">06 SINPE</option>
                      <option value="03">03 Transf</option>
                      <option value="01">01 Efectivo</option>
                      <option value="02">02 Tarjeta</option>
                    </select>

                    <select
                      value={condVentaVal}
                      onChange={(e) => onCellCommit(r._origIdx, 'condicionVenta', e.target.value)}
                      className="bg-muted/40 hover:bg-muted text-[11px] font-mono border border-border/60 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer shadow-2xs transition-colors"
                      title="Condición de Venta"
                    >
                      <option value="01">01 Contado</option>
                      <option value="02">02 Crédito</option>
                    </select>
                  </div>
                </td>

                {/* Precio USD ($) + TC */}
                <td className="px-3 py-2 text-right align-middle font-mono">
                  <div className="flex flex-col items-end">
                    <EditableCell
                      value={String(r.precioUSD ?? 0)}
                      onCommit={(v) => {
                        const parsed = parseFloat(v);
                        if (!isNaN(parsed) && parsed >= 0) {
                          onCellCommit(r._origIdx, 'precioUSD', parsed);
                        }
                      }}
                      className="text-right font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400"
                    />
                    <span className="text-[10px] text-muted-foreground">TC: {manifest.tc}</span>
                  </div>
                </td>

                {/* Desglose de Montos Compartido (MONTO ₡, Flete 0%, Logística +13%) */}
                <td className="px-3 py-2 text-right align-middle font-mono">
                  <div className="flex flex-col items-end whitespace-nowrap">
                    <span className="font-extrabold text-xs text-foreground">
                      MONTO: {fmtAmt(r.monto)}
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium text-[10px] mt-0.5">
                      Flete 0%: {fmtAmt(r.flete)}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[10px] mt-0.5">
                      Log +13%: {fmtAmt(logConIva)}
                    </span>
                  </div>
                </td>

                {/* Acciones */}
                <td className="px-3 py-2 text-center align-middle w-12 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onDeleteRow(r._origIdx)}
                    className="text-muted-foreground hover:text-red-600 transition-colors p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Eliminar fila"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── BulkActionBar ─────────────────────────────────────────────────────────────

function BulkActionBar({
  count,
  manifestNumber,
  selectedIndices,
  onClear,
  onBulkUpdate,
  onBulkDelete,
  onExport,
  saving,
}: {
  count: number;
  manifestNumber: string;
  selectedIndices: number[];
  onClear: () => void;
  onBulkUpdate: (field: EditableField, value: string) => void;
  onBulkDelete: () => void;
  onExport: (format: 'csv' | 'xlsx') => void;
  saving: boolean;
}) {
  const [field, setField] = useState<EditableField>('nombre');
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleApply = useCallback(() => {
    if (!value.trim()) return;
    onBulkUpdate(field, value.trim());
    setValue('');
  }, [field, value, onBulkUpdate]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-primary/8 rounded-lg border border-primary/20 text-xs">
      <span className="font-semibold text-primary">
        {count} fila{count !== 1 ? 's' : ''} seleccionada{count !== 1 ? 's' : ''}
      </span>

      <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
        <Select value={field} onValueChange={(v) => setField(v as EditableField)}>
          <SelectTrigger className="h-7 text-xs w-44 border-primary/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDITABLE_FIELDS.map((f) => (
              <SelectItem key={f.key} value={f.key} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply();
          }}
          placeholder={`Nuevo valor para ${EDITABLE_FIELDS.find((f) => f.key === field)?.label}…`}
          className="flex-1 h-7 px-2.5 text-xs rounded border border-primary/30 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono"
        />

        <Button size="sm" className="h-7 text-xs px-3" onClick={handleApply} disabled={!value.trim() || saving}>
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Aplicar'}
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onBulkDelete}
        disabled={saving}
        className="h-7 text-xs px-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Eliminar Selección
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 gap-1">
            <Download className="h-3.5 w-3.5" />
            Exportar selección
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onExport('csv')} className="gap-2 text-xs cursor-pointer">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport('xlsx')} className="gap-2 text-xs cursor-pointer">
            <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
            Excel
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground ml-auto">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Manifest card ─────────────────────────────────────────────────────────────

function ManifestCard({
  manifest,
  searchTerm,
  toast,
}: {
  manifest: GTIManifestDoc;
  searchTerm: string;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Annotate rows with their real index in manifest.rows
  const indexedRows = useMemo(
    () => manifest.rows.map((r, i) => ({ ...r, _origIdx: i })),
    [manifest.rows]
  );

  const filteredRows = useMemo(() => {
    if (!searchTerm) return indexedRows;
    const q = searchTerm.toLowerCase();
    return indexedRows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        (r.descripcion || '').toLowerCase().includes(q) ||
        (r.dni || '').includes(q) ||
        (r.email || '').toLowerCase().includes(q)
    );
  }, [indexedRows, searchTerm]);

  const totalMonto = useMemo(
    () => manifest.rows.reduce((s, r) => s + r.monto, 0),
    [manifest.rows]
  );

  const handleToggle = useCallback(
    (i: number) =>
      setSelected((prev) => {
        const n = new Set(prev);
        n.has(i) ? n.delete(i) : n.add(i);
        return n;
      }),
    []
  );

  const handleToggleAll = useCallback(
    (select: boolean) =>
      setSelected(select ? new Set(filteredRows.map((r) => r._origIdx)) : new Set()),
    [filteredRows]
  );

  const handleCellCommit = useCallback(
    async (origIdx: number, field: EditableField, value: any) => {
      try {
        await updateGTIManifestRows(manifest.manifestNumber, [
          { rowIndex: origIdx, fields: { [field]: value } },
        ]);
        toast({ description: 'Campo actualizado exitosamente.' });
      } catch {
        toast({ variant: 'destructive', description: 'Error al guardar el cambio.' });
      }
    },
    [manifest.manifestNumber, toast]
  );

  const handleBulkUpdate = useCallback(
    async (field: EditableField, value: string) => {
      const indices = [...selected];
      if (indices.length === 0) return;
      setSaving(true);
      try {
        const parsedVal = field === 'precioUSD' ? parseFloat(value) : value;
        await updateGTIManifestRows(
          manifest.manifestNumber,
          indices.map((rowIndex) => ({ rowIndex, fields: { [field]: parsedVal } }))
        );
        toast({ description: `${indices.length} filas actualizadas.` });
        setSelected(new Set());
      } catch {
        toast({ variant: 'destructive', description: 'Error en la actualización masiva.' });
      } finally {
        setSaving(false);
      }
    },
    [manifest.manifestNumber, selected, toast]
  );

  const handleDeleteSingleRow = useCallback(
    async (origIdx: number) => {
      if (!window.confirm('¿Confirma que desea eliminar esta fila del manifiesto GTI?')) return;
      try {
        await deleteGTIManifestRows(manifest.manifestNumber, [origIdx]);
        toast({ description: 'Fila eliminada.' });
      } catch {
        toast({ variant: 'destructive', description: 'Error al eliminar fila.' });
      }
    },
    [manifest.manifestNumber, toast]
  );

  const handleBulkDelete = useCallback(async () => {
    const indices = [...selected];
    if (!indices.length) return;
    if (!window.confirm(`¿Confirma que desea eliminar las ${indices.length} filas seleccionadas?`)) return;
    setSaving(true);
    try {
      await deleteGTIManifestRows(manifest.manifestNumber, indices);
      toast({ description: `${indices.length} filas eliminadas.` });
      setSelected(new Set());
    } catch {
      toast({ variant: 'destructive', description: 'Error al eliminar filas.' });
    } finally {
      setSaving(false);
    }
  }, [manifest.manifestNumber, selected, toast]);

  const handleEditTC = useCallback(async () => {
    const input = window.prompt(
      `Actualizar Tipo de Cambio (TC) para el manifiesto ${manifest.manifestNumber}:`,
      String(manifest.tc)
    );
    if (!input) return;
    const newTC = parseFloat(input);
    if (isNaN(newTC) || newTC <= 0) {
      toast({ variant: 'destructive', description: 'Ingrese un tipo de cambio válido.' });
      return;
    }
    try {
      await updateGTIManifestTC(manifest.manifestNumber, newTC);
      toast({ description: `Tipo de cambio actualizado a ${newTC} y valores recalculados.` });
    } catch (err: any) {
      toast({ variant: 'destructive', description: err.message || 'Error al actualizar TC.' });
    }
  }, [manifest.manifestNumber, manifest.tc, toast]);

  const handleAddRow = useCallback(async () => {
    const nombre = window.prompt('Nombre del cliente:');
    if (!nombre?.trim()) return;
    const dni = window.prompt('Cédula / DNI:') || '';
    const email = window.prompt('Email:') || '';
    const phone = window.prompt('Teléfono:') || '';
    const precioStr = window.prompt('Precio en USD ($):', '10') || '0';
    const precioUSD = parseFloat(precioStr) || 0;

    try {
      await addGTIManifestRow(manifest.manifestNumber, {
        nombre: nombre.trim(),
        dni: dni.trim(),
        email: email.trim(),
        phone: phone.trim(),
        precioUSD,
        descripcion: 'Flete Internacional',
        tipoDocumento: '04',
        condicionVenta: '01',
        medioPago: '06',
      });
      toast({ description: 'Fila agregada exitosamente.' });
    } catch (err: any) {
      toast({ variant: 'destructive', description: err.message || 'Error al agregar fila.' });
    }
  }, [manifest.manifestNumber, toast]);

  const handleExportSelected = useCallback(
    (format: 'csv' | 'xlsx') => {
      const selRows = manifest.rows.filter((_, i) => selected.has(i));
      const pseudo: GTIManifestDoc = { ...manifest, rows: selRows, rowCount: selRows.length };
      format === 'csv' ? downloadCSVManifest(pseudo) : downloadXLSXManifest(pseudo);
    },
    [manifest, selected]
  );

  const rowIndexMap = useMemo(
    () => new Map(indexedRows.map((r, i) => [r._origIdx, i])),
    [indexedRows]
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <span className="text-muted-foreground flex-shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{manifest.manifestNumber}</span>
            {manifest.routeSuffix && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {manifest.routeSuffix}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {fmtDate(manifest.exportedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {manifest.rowCount} filas
            </span>
            <span className="font-mono font-bold text-foreground">{fmtAmt(totalMonto)}</span>
            <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
              TC: {manifest.tc}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditTC();
                }}
                className="hover:text-primary transition-colors text-muted-foreground ml-1"
                title="Editar Tipo de Cambio del Manifiesto"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="gap-1 text-xs h-7 border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
          >
            <Plus className="h-3.5 w-3.5" />
            + Fila
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7 flex-shrink-0">
                <Download className="h-3.5 w-3.5" />
                Exportar
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  const inputs: GTIRowInput[] = manifest.rows.map((r) => ({
                    nombre: r.nombre,
                    dni: r.dni,
                    email: r.email,
                    phone: r.phone,
                    precioUSD: r.precioUSD,
                    descripcion: r.descripcion,
                    electronicInvoiceRequired:
                      (r as any).electronicInvoiceRequired ?? (r as any).tipoDocumento === '01',
                    tipoDocumento: (r as any).tipoDocumento,
                    condicionVenta: (r as any).condicionVenta,
                    medioPago: (r as any).medioPago,
                  }));
                  downloadGTITiquetesXLSX(inputs, {
                    tc: manifest.tc,
                    manifestNumber: manifest.manifestNumber,
                    routeSuffix: manifest.routeSuffix,
                  });
                }}
                className="gap-2 text-xs cursor-pointer font-medium text-emerald-600 dark:text-emerald-400"
              >
                <FileDown className="h-3.5 w-3.5" />
                Excel GTI Oficial (52 Cols)
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  const inputs: GTIRowInput[] = manifest.rows.map((r) => ({
                    nombre: r.nombre,
                    dni: r.dni,
                    email: r.email,
                    phone: r.phone,
                    precioUSD: r.precioUSD,
                    descripcion: r.descripcion,
                    electronicInvoiceRequired:
                      (r as any).electronicInvoiceRequired ?? (r as any).tipoDocumento === '01',
                    tipoDocumento: (r as any).tipoDocumento,
                    condicionVenta: (r as any).condicionVenta,
                    medioPago: (r as any).medioPago,
                  }));
                  downloadGTITiquetes(inputs, {
                    tc: manifest.tc,
                    manifestNumber: manifest.manifestNumber,
                    routeSuffix: manifest.routeSuffix,
                  });
                }}
                className="gap-2 text-xs cursor-pointer font-medium text-emerald-600 dark:text-emerald-400"
              >
                <FileText className="h-3.5 w-3.5" />
                CSV GTI Oficial (52 Cols)
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  downloadCSVManifest(manifest);
                }}
                className="gap-2 text-xs cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Resumen Simple CSV
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  downloadXLSXManifest(manifest);
                }}
                className="gap-2 text-xs cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                Resumen Simple Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/40">
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mt-3">
              <BulkActionBar
                count={selected.size}
                manifestNumber={manifest.manifestNumber}
                selectedIndices={[...selected]}
                onClear={() => setSelected(new Set())}
                onBulkUpdate={handleBulkUpdate}
                onBulkDelete={handleBulkDelete}
                onExport={handleExportSelected}
                saving={saving}
              />
            </div>
          )}

          {/* Rows table */}
          {filteredRows.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {searchTerm ? 'No se encontraron filas que coincidan con la búsqueda.' : 'No hay filas en este manifiesto.'}
            </div>
          ) : (
            <RowsTable
              manifest={manifest}
              rows={filteredRows}
              rowIndexMap={rowIndexMap}
              selected={selected}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
              onCellCommit={handleCellCommit}
              onDeleteRow={handleDeleteSingleRow}
            />
          )}

          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Haz clic en cualquier celda editable (Nombre, Cédula, Email, Teléfono, Descripción, Precio USD, Tipo Doc, Medio Pago, Condición Venta) para modificar el valor en tiempo real.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GTIManifests() {
  const { toast } = useToast();
  const [manifests, setManifests] = useState<GTIManifestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<string>('all');

  useEffect(() => {
    const unsub = subscribeGTIManifests((list) => {
      setManifests(list);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Distinct route suffixes for tabs
  const routeSuffixes = useMemo(() => {
    const set = new Set<string>();
    manifests.forEach((m) => {
      if (m.routeSuffix) set.add(m.routeSuffix);
    });
    return Array.from(set).sort();
  }, [manifests]);

  // Filtered manifests
  const filteredManifests = useMemo(() => {
    let list = manifests;
    if (selectedRoute !== 'all') {
      list = list.filter((m) => m.routeSuffix === selectedRoute);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.manifestNumber.toLowerCase().includes(q) ||
          m.rows.some(
            (r) =>
              r.nombre.toLowerCase().includes(q) ||
              (r.dni || '').includes(q) ||
              (r.email || '').toLowerCase().includes(q) ||
              (r.descripcion || '').toLowerCase().includes(q)
          )
      );
    }
    return list;
  }, [manifests, selectedRoute, searchTerm]);

  // Export ALL manifests in a single combined Excel workbook
  const handleExportAll = useCallback(
    (format: 'csv' | 'xlsx') => {
      if (!filteredManifests.length) return;

      if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();

        for (const m of filteredManifests) {
          const sheetName = (m.manifestNumber + (m.routeSuffix ? '_' + m.routeSuffix : '')).slice(0, 31);
          const headers = [
            'Nombre',
            'Cédula',
            'Email',
            'Teléfono',
            'Descripción',
            'PrecioUSD',
            'TC',
            'MONTO (₡)',
            'FLETE 01 (₡)',
            'LOG. c/IVA 02 (₡)',
          ];

          const wsData = [
            headers,
            ...m.rows
              .filter((r) => r.precioUSD > 0)
              .map((r) => [
                r.nombre,
                r.dni,
                r.email,
                r.phone,
                r.descripcion || '',
                r.precioUSD,
                m.tc,
                r.monto,
                r.flete,
                Math.round(r.logistica * 1.13 * 100) / 100,
              ]),
          ];

          const ws = XLSX.utils.aoa_to_sheet(wsData);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }

        XLSX.writeFile(wb, `GTI_Manifiestos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else {
        // Combined CSV
        const BOM = '\uFEFF';
        const HEADERS = [
          'Manifiesto',
          'Ruta',
          'Nombre',
          'Cédula',
          'Email',
          'Teléfono',
          'Descripción',
          'PrecioUSD',
          'TC',
          'MONTO (₡)',
          'FLETE 01 (₡)',
          'LOG. c/IVA 02 (₡)',
        ];
        const esc = (v: any) => {
          const s = String(v ?? '');
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const lines = [HEADERS.join(',')];
        for (const m of filteredManifests) {
          for (const r of m.rows) {
            if (r.precioUSD <= 0) continue;
            const logConIva = Math.round(r.logistica * 1.13 * 100) / 100;
            lines.push(
              [
                esc(m.manifestNumber),
                esc(m.routeSuffix || ''),
                esc(r.nombre),
                esc(r.dni),
                esc(r.email),
                esc(r.phone),
                esc(r.descripcion || ''),
                r.precioUSD.toFixed(2),
                m.tc,
                r.monto.toFixed(2),
                r.flete.toFixed(2),
                logConIva.toFixed(2),
              ].join(',')
            );
          }
        }

        const csv = BOM + lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GTI_Manifiestos_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
    [filteredManifests]
  );

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              Manifiestos GTI
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Administración y edición 100% interactiva de exportaciones GTI guardadas desde Nova.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  Exportar todo ({filteredManifests.length})
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleExportAll('xlsx')} className="gap-2 text-xs cursor-pointer">
                  <FileDown className="h-3.5 w-3.5 text-emerald-600" />
                  Excel combinado
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportAll('csv')} className="gap-2 text-xs cursor-pointer">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  CSV combinado
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por manifiesto, cliente, cédula..."
              className="pl-9 text-xs h-9"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Route tabs */}
          {routeSuffixes.length > 0 && (
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50 text-xs overflow-x-auto">
              <button
                onClick={() => setSelectedRoute('all')}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                  selectedRoute === 'all'
                    ? 'bg-background shadow-xs text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Todas las rutas
              </button>
              {routeSuffixes.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRoute(r)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    selectedRoute === r
                      ? 'bg-background shadow-xs text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body list */}
        {loading ? (
          <div className="py-16 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            Cargando manifiestos GTI...
          </div>
        ) : filteredManifests.length === 0 ? (
          <div className="py-16 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
            <p className="text-sm font-medium text-muted-foreground">No se encontraron manifiestos GTI</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {searchTerm || selectedRoute !== 'all'
                ? 'Intenta borrar los filtros de búsqueda.'
                : 'Procesa un manifiesto en Nova y haz clic en "Manifiesto GTI" para guardar el primero.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground font-medium px-1">
              {filteredManifests.length} manifiesto{filteredManifests.length !== 1 ? 's' : ''}
            </div>
            {filteredManifests.map((m) => (
              <ManifestCard key={m.manifestNumber} manifest={m} searchTerm={searchTerm} toast={toast} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
