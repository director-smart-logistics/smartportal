import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getPreAlertsDatabase, resolveCustomerSlCode, resolveCustomerFullProfile } from '@/lib/services/pre-alert-resolver';
import { canonicalizeTracking } from '@/lib/utils/tracking-canonicalizer';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Search,
  BellRing,
  Users,
  Copy,
  CheckCheck,
  Loader2,
  Download,
  X,
  Hash,
  Calendar,
  RefreshCw,
  Info,
  User,
  Mail,
  CreditCard,
  Phone,
  Globe,
  Package,
  Weight,
  FileText,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { ReassignPreAlertDialog } from './ReassignPreAlertDialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PermissionTooltip } from '@/components/PermissionTooltip';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreAlertDoc {
  id: string;
  tracking: string;
  canonicalTracking?: string;
  slCode?: string;
  userId?: string;
  // Customer (denormalized)
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  dni?: string;
  phone?: string;
  // Package
  description?: string;
  weight?: number;
  origin?: string;
  destinationCountry?: string;
  carrier?: string;
  shipper?: string;
  manifestId?: string;
  requiresPermit?: boolean;
  missingDestination?: boolean;
  // Status
  status?: string;
  statusLabel?: string;
  preAlertCreatedAt?: Timestamp | string | null;
  syncedAt?: Timestamp | string | null;
  sp2PreAlertId?: string;
}

type SearchMode = 'tracking' | 'slcode';

const PRE_ALERTS_COLLECTION = 'pre_alerts';
const MAX_RESULTS = 200;
const DEBOUNCE_MS = 250;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(ts: Timestamp | string | null | undefined): string {
  if (!ts) return '—';
  let date: Date;
  if (ts instanceof Timestamp) {
    date = ts.toDate();
  } else if (typeof ts === 'string') {
    date = new Date(ts);
  } else {
    return '—';
  }
  return isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-CR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function statusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'pre-alerted':
    case 'pre_alerted':
      return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'received':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'transit':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'customs':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'delivered':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'processed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/**
 * Automatically detects whether search input is a customer SL Code or a carrier tracking number.
 *
 * @param value - Search input string
 * @returns SearchMode ('slcode' | 'tracking')
 */
function detectMode(value: string): SearchMode {
  const v = value.trim().toUpperCase();
  if (/^[A-Z]{2,4}[-\d]+$/.test(v) && v.length < 15) return 'slcode';
  return 'tracking';
}

/**
 * Generates and downloads a CSV export file of pre-alert search results.
 *
 * @param rows - Array of PreAlertDoc results to export
 * @param filename - Target filename for browser download
 */
function exportCsv(rows: PreAlertDoc[], filename: string): void {
  const headers = [
    'Tracking', 'Canonical', 'Carrier', 'SL Code', 'Nombre', 'Email', 'DNI', 'Teléfono',
    'Origen', 'Destino', 'Descripción', 'Peso', 'Permiso', 'Manifiesto',
    'Estado', 'Fecha Pre-Alerta', 'Sync',
  ];
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      [
        r.tracking, r.canonicalTracking ?? '', r.carrier ?? '', r.slCode ?? '',
        r.displayName ?? '', r.email ?? '', r.dni ?? '', r.phone ?? '',
        r.origin ?? '', r.destinationCountry ?? '', r.description ?? '',
        r.weight ?? '', r.requiresPermit ? 'Sí' : 'No', r.manifestId ?? '',
        r.status ?? '', formatTs(r.preAlertCreatedAt), formatTs(r.syncedAt),
      ].map(q).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0 w-24 text-xs">{label}</span>
      <span className="text-foreground text-xs font-medium break-all">{children}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PreAlerts() {
  const { toast } = useToast();

  const [mode, setMode] = useState<SearchMode>('tracking');
  const [inputValue, setInputValue] = useState('');
  const [results, setResults] = useState<PreAlertDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<PreAlertDoc | null>(null);
  const { canManage } = usePermissions();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auto-focus on mount ────────────────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Executes a bounded multi-key search on pre-alerts and enriches results with live customer profile data.
   *
   * SEARCH STRATEGY & COST BOUNDS:
   * 1. Empty Input Gate: If search input is blank, zeroes results with 0 Firestore reads.
   * 2. Canonical Tracking Resolution: Generates tracking variants (`raw`, `canonical`, without `420`, without leading `92`)
   *    and queries each with `limit(10)`.
   * 3. SL Code Direct Lookup: Normalizes SL Code prefix (e.g. `1234` $\to$ `SL1234`) and queries with `limit(50)`.
   * 4. Customer Profile Enrichment: Resolves DNI, Email, Phone from customers collection without duplicate reads.
   *
   * @param raw - User input string
   * @param currentMode - Active search mode ('tracking' | 'slcode')
   */
  const runQuery = useCallback(async (raw: string, currentMode: SearchMode) => {
    const val = raw.trim().toUpperCase();
    if (!val) {
      setResults([]);
      setSearched(false);
      setElapsed(null);
      return;
    }

    setLoading(true);
    setSearched(true);
    const t0 = performance.now();

    try {
      const targetDb = getPreAlertsDatabase();
      const ref = collection(targetDb, PRE_ALERTS_COLLECTION);
      let rawDocs: any[] = [];

      if (currentMode === 'tracking') {
        const analysis = canonicalizeTracking(val);
        const searchTerms = new Set<string>();
        searchTerms.add(val.toUpperCase().trim());
        if (analysis.normalized) searchTerms.add(analysis.normalized);
        if (analysis.canonicalTracking) searchTerms.add(analysis.canonicalTracking);
        analysis.trackingVariants.forEach(t => searchTerms.add(t));

        const terms = Array.from(searchTerms).slice(0, 10);
        const [snap1, snap2, snap3] = await Promise.all([
          getDocs(query(ref, where('tracking', 'in', terms), limit(10))),
          getDocs(query(ref, where('canonicalTracking', 'in', terms), limit(10))),
          getDocs(query(ref, where('trackingNumber', 'in', terms), limit(10))),
        ]);

        const seenIds = new Set<string>();
        [...snap1.docs, ...snap2.docs, ...snap3.docs].forEach(d => {
          if (!seenIds.has(d.id)) {
            seenIds.add(d.id);
            rawDocs.push({ id: d.id, ...d.data() });
          }
        });
      } else {
        // slCode mode: get all trackings for this customer
        let normalizedSl = val.toUpperCase().trim();
        if (!normalizedSl.startsWith('SL')) normalizedSl = `SL${normalizedSl}`;
        const snap = await getDocs(
          query(
            ref,
            where('slCode', '==', normalizedSl),
            limit(MAX_RESULTS)
          )
        );
        rawDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Resolve full customer profile (slCode, name, dni, email, phone) for each doc
      const resolvedDocs: PreAlertDoc[] = await Promise.all(
        rawDocs.map(async d => {
          const profile = await resolveCustomerFullProfile(targetDb, d);
          return {
            ...d,
            slCode: profile.slCode || d.slCode || '',
            displayName: profile.displayName || d.displayName || d.fullName || '',
            dni: profile.dni || d.dni || d.cedula || '',
            email: profile.email || d.email || '',
            phone: profile.phone || d.phone || '',
            tracking: d.tracking || d.trackingNumber || d.canonicalTracking || '',
            preAlertCreatedAt: d.preAlertDate || d.createdAt || d.submittedAt || d.preAlertCreatedAt,
          } as PreAlertDoc;
        })
      );

      setResults(resolvedDocs);
      setElapsed(Math.round(performance.now() - t0));

    } catch (err) {
      console.error('[PreAlerts] query error', err);
      toast({ title: 'Error al consultar pre-alertas', variant: 'destructive' });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ── Debounced input handler ────────────────────────────────────────────────
  const handleChange = useCallback((val: string) => {
    setInputValue(val);
    const detectedMode = detectMode(val);
    setMode(detectedMode);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runQuery(val, detectedMode);
    }, DEBOUNCE_MS);
  }, [runQuery]);

  const handleModeToggle = useCallback((m: SearchMode) => {
    setMode(m);
    if (inputValue.trim()) runQuery(inputValue, m);
  }, [inputValue, runQuery]);

  const handleClear = useCallback(() => {
    setInputValue('');
    setResults([]);
    setSearched(false);
    setElapsed(null);
    inputRef.current?.focus();
  }, []);

  // ── Copy ──────────────────────────────────────────────────────────────────
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (results.length === 0) return;
    const slug = inputValue.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    exportCsv(results, `pre_alerts_${slug}_${Date.now()}.csv`);
  }, [results, inputValue]);

  // ── Status summary (slCode mode) ──────────────────────────────────────────
  const statusSummary = mode === 'slcode' && results.length > 0
    ? Object.entries(
        results.reduce<Record<string, number>>((acc, r) => {
          const s = r.status ?? 'unknown';
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : null;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-100 shrink-0">
            <BellRing className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Pre-Alertas</h1>
            <p className="text-sm text-muted-foreground">
              Buscar por tracking o agrupar por cliente (SL Code)
            </p>
          </div>
        </div>

        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <Card className="p-4 space-y-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleModeToggle('tracking')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                mode === 'tracking'
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Hash className="h-3.5 w-3.5" />
              Tracking
            </button>
            <button
              onClick={() => handleModeToggle('slcode')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                mode === 'slcode'
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Por Cliente
            </button>

            {results.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExport}
                className="ml-auto gap-1.5 text-xs text-muted-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </Button>
            )}
          </div>

          {/* Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={e => handleChange(e.target.value)}
              placeholder={
                mode === 'tracking'
                  ? 'Ingrese número de tracking...'
                  : 'Ingrese SL Code (ej. SL-042)...'
              }
              className="pl-9 pr-9 font-mono text-sm uppercase"
              autoComplete="off"
              spellCheck={false}
            />
            {inputValue && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Limpiar"
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <X className="h-4 w-4" />
                }
              </button>
            )}
          </div>

          {/* Hint */}
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            {mode === 'tracking'
              ? 'Busca por tracking exacto o código canónico IMpb completo (sin cortes parciales).'
              : `Muestra hasta ${MAX_RESULTS} pre-alertas del cliente, más recientes primero.`
            }
          </p>
        </Card>

        {/* ── Status summary (slCode mode) ────────────────────────────────── */}
        {statusSummary && statusSummary.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Resumen:</span>
            {statusSummary.map(([s, count]) => (
              <span
                key={s}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                  statusColor(s)
                )}
              >
                {s}
                <span className="font-bold">{count}</span>
              </span>
            ))}
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {searched && !loading && (
          <div className="space-y-2">
            {/* Meta row */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
              <span>
                {results.length === 0
                  ? 'Sin resultados'
                  : `${results.length} resultado${results.length !== 1 ? 's' : ''}${results.length === MAX_RESULTS ? ' (límite máximo)' : ''}`
                }
              </span>
              {elapsed !== null && (
                <span className="flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  {elapsed} ms
                </span>
              )}
            </div>

            {results.length === 0 ? (
              <Card className="p-8 flex flex-col items-center gap-3 text-center text-muted-foreground">
                <BellRing className="h-10 w-10 opacity-20" />
                <p className="text-sm font-medium">No se encontró ninguna pre-alerta</p>
                <p className="text-xs">
                  {mode === 'tracking'
                    ? 'Verifique que el tracking esté registrado en pre_alerts.'
                    : 'Verifique que el SL Code sea correcto.'}
                </p>
              </Card>
            ) : mode === 'tracking' ? (
              /* ── Tracking mode: rich detail card ──────────────────────── */
              <div className="space-y-3">
                {results.map(row => (
                  <Card key={row.id} className="overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold select-all">{row.tracking}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => handleCopy(row.tracking)}
                                className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                aria-label="Copiar tracking">
                                {copied === row.tracking
                                  ? <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                                  : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Copiar tracking</TooltipContent>
                          </Tooltip>
                        </div>
                        {row.canonicalTracking && row.canonicalTracking !== row.tracking && (
                          <span className="font-mono text-[10px] text-muted-foreground">{row.canonicalTracking}</span>
                        )}
                      </div>
                      <PermissionTooltip allowed={canManage('customers')}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReassignTarget(row)}
                          disabled={!canManage('customers')}
                          className="h-7 gap-1.5 text-xs"
                        >
                          <ArrowRight className="h-3 w-3" aria-hidden />
                          Reasignar
                        </Button>
                      </PermissionTooltip>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x">
                      {/* ─ Cliente section ─ */}
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cliente</p>
                        <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Nombre">
                          {row.displayName || `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || '—'}
                        </DetailRow>
                        <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Correo">
                          {row.email
                            ? <a href={`mailto:${row.email}`} className="text-blue-600 hover:underline">{row.email}</a>
                            : '—'}
                        </DetailRow>
                        <DetailRow icon={<CreditCard className="h-3.5 w-3.5" />} label="DNI / Cédula">
                          {row.dni || '—'}
                        </DetailRow>
                        <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Teléfono">
                          {row.phone || '—'}
                        </DetailRow>
                        <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="SL Code">
                          <span className="font-semibold text-violet-700">{row.slCode || '—'}</span>
                        </DetailRow>
                        <DetailRow icon={<User className="h-3.5 w-3.5" />} label="ID Usuario">
                          <span className="font-mono font-medium">{row.userId || '—'}</span>
                        </DetailRow>
                      </div>

                      {/* ─ Paquete section ─ */}
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Paquete</p>
                        <DetailRow icon={<Globe className="h-3.5 w-3.5" />} label="Origen">
                          {row.origin || '—'}
                        </DetailRow>
                        <DetailRow icon={<Package className="h-3.5 w-3.5" />} label="Descripción">
                          {row.description || '—'}
                        </DetailRow>
                        <DetailRow icon={<Weight className="h-3.5 w-3.5" />} label="Peso">
                          {row.weight ? `${row.weight} kg` : '—'}
                        </DetailRow>
                        <DetailRow icon={row.requiresPermit
                          ? <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
                          : <ShieldCheck className="h-3.5 w-3.5 text-green-500" />} label="Permiso">
                          <span className={row.requiresPermit ? 'text-orange-600 font-medium' : 'text-green-600'}>
                            {row.requiresPermit ? 'Requiere permiso' : 'Sin permiso'}
                          </span>
                        </DetailRow>
                        {row.manifestId && (
                          <DetailRow icon={<FileText className="h-3.5 w-3.5" />} label="Manifiesto">
                            <span className="font-mono text-xs">{row.manifestId}</span>
                          </DetailRow>
                        )}
                        <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Pre-alerta">
                          {formatTs(row.preAlertCreatedAt)}
                        </DetailRow>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              /* ── SL Code mode: customer header + enriched table ──────── */
              <div className="space-y-3">
                {/* Customer identity header (from first result) */}
                {results[0] && (
                  <Card className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Nombre">
                        {results[0].displayName || `${results[0].firstName ?? ''} ${results[0].lastName ?? ''}`.trim() || '—'}
                      </DetailRow>
                      <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Correo">
                        {results[0].email
                          ? <a href={`mailto:${results[0].email}`} className="text-blue-600 hover:underline">{results[0].email}</a>
                          : '—'}
                      </DetailRow>
                      <DetailRow icon={<CreditCard className="h-3.5 w-3.5" />} label="DNI">
                        {results[0].dni || '—'}
                      </DetailRow>
                      <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Teléfono">
                        {results[0].phone || '—'}
                      </DetailRow>
                      <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="SL Code">
                        <span className="font-semibold text-violet-700">{results[0].slCode || '—'}</span>
                      </DetailRow>
                      <DetailRow icon={<User className="h-3.5 w-3.5" />} label="ID Usuario">
                        <span className="font-mono font-medium">{results[0].userId || '—'}</span>
                      </DetailRow>
                    </div>
                  </Card>
                )}

                {/* Trackings table */}
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Tracking</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Origen</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Descripción</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Peso</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Permiso</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs">Estado</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground text-xs whitespace-nowrap">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Fecha</span>
                        </th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={row.id} className={cn(
                          'border-b last:border-0 transition-colors hover:bg-muted/40',
                          i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                        )}>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-medium select-all">{row.tracking}</span>
                              {row.canonicalTracking && row.canonicalTracking !== row.tracking && (
                                <span className="font-mono text-[10px] text-muted-foreground">{row.canonicalTracking}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.origin || '—'}</td>
                          <td className="px-3 py-2.5 text-xs max-w-[160px] truncate" title={row.description}>
                            {row.description || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {row.weight ? `${row.weight} kg` : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            {row.requiresPermit === true
                              ? <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
                              : <ShieldCheck className="h-3.5 w-3.5 text-green-500" />}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn(
                              'inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium border',
                              statusColor(row.status)
                            )}>
                              {row.status || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {formatTs(row.preAlertCreatedAt)}
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button onClick={() => handleCopy(row.tracking)}
                                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                    aria-label="Copiar tracking">
                                    {copied === row.tracking
                                      ? <CheckCheck className="h-3.5 w-3.5 text-green-500" />
                                      : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="left">Copiar tracking</TooltipContent>
                              </Tooltip>
                              <PermissionTooltip allowed={canManage('customers')}>
                                <button
                                  onClick={() => setReassignTarget(row)}
                                  disabled={!canManage('customers')}
                                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent"
                                  aria-label="Reasignar pre-alerta"
                                  title="Reasignar a otro cliente"
                                >
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                              </PermissionTooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Empty state (not yet searched) ──────────────────────────────── */}
        {!searched && !loading && (
          <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
            <BellRing className="h-14 w-14 opacity-10" />
            <div>
              <p className="text-sm font-medium">Buscador de Pre-Alertas</p>
              <p className="text-xs mt-1">
                Escriba un tracking para buscarlo, o un SL Code para ver todos los trackings del cliente.
              </p>
            </div>
          </div>
        )}
      </div>

      <ReassignPreAlertDialog
        open={!!reassignTarget}
        onOpenChange={(o) => { if (!o) setReassignTarget(null); }}
        preAlert={reassignTarget}
        onSuccess={() => {
          // Re-run the current query so the row reflects the new owner.
          if (inputValue.trim()) runQuery(inputValue, mode);
        }}
      />
    </DashboardLayout>
  );
}
