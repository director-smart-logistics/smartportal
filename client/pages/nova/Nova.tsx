import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { useLocale } from "@/hooks/useLocale";
import { useAuth } from "@/hooks/useAuth";
import { RotateCcw, Package, Copy, Check, Download, Play, AlertCircle, CheckCircle, TrendingUp, Users, Clock, FileSpreadsheet, ChevronDown, ChevronUp, MapPin, Weight, Truck, Hash, FileText, Globe, DollarSign, Phone, Mail, UserCheck, Sparkles, Loader2, Info, Merge, ShieldAlert, Database } from "lucide-react";
import { useNovaChat } from "@/hooks/use-nova-chat";
import { useManifestAgent } from "@/hooks/use-manifest-agent";
import { NovaMessage } from "@/components/nova/NovaMessage";
import { NovaComposer } from "@/components/nova/NovaComposer";
import { useEffect, useRef, useCallback, useState, memo, useMemo, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { downloadManifestExcel, triggerExcelDownload, getManifestDetail } from "@/lib/services/mlocker-service";
import { storage, db } from "@/lib/firebase/config";
import { doc as fsDoc, setDoc as fsSetDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, getMetadata } from "firebase/storage";
import { createMergedManifestFile } from "@/lib/services/manifest-merger-service";
import { calculatePrice } from "@/lib/utils/pricing";
import { findCustomerMatch } from "@/lib/services/customer-matcher";
import { subscribeManifestProcessedStatus, saveManifestMLockerLink, saveManifestMergedLink, getMegaManManifests, getRecentManifests, subscribeRecentManifests, backfillMegaManFusedSources, saveManifestRecord, linkPackagesToMegaMan, fuseFirestoreManifests, mergeManifestIntoMegaMan } from "@/lib/services/manifest-processor";
import { mergeManifestDocs } from "@/lib/services/manifest-consolidation-service";
import type { ManifestProcessedStatus, ManifestType, ManifestRecord, MegaManRecord } from "@/lib/services/manifest-processor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { NovaConversationMessage } from "@/hooks/use-manifest-agent";
import type { NovaTrackingResult, NovaTrackingEvent, MLockerManifestItem } from "@/lib/services/nova-agent-engine";
import { NovaChart } from "@/components/nova/NovaChart";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";

// ── Inline helpers for Nova agent messages ────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0, m: RegExpExecArray | null, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-muted text-[0.8em] font-mono">{m[1].slice(1, -1)}</code>);
    else if (m[2]) parts.push(<strong key={key++} className="font-semibold">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const NovaMarkdown = memo(function NovaMarkdown({ text }: { text: string }) {
  const sanitized = text
    .replace(/<\/?(tool_code|example_response|tool_result|function_call|function_response|system|instructions|context)\s*\/?>/gi, '')
    .replace(/<(tool_code|example_response|tool_result|function_call|function_response|system|instructions|context)>[\s\S]*?<\/\1>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const lines = sanitized.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      nodes.push(
        <div key={`code-${i}`} className="my-2 rounded-xl overflow-hidden border border-[#e8eaed]">
          {lang && <div className="px-4 py-1.5 bg-[#f1f3f4] border-b border-[#e8eaed] text-[10px] font-mono text-[#70757a] uppercase tracking-wide">{lang}</div>}
          <pre className="px-4 py-3 overflow-x-auto text-xs font-mono text-[#1f1f1f] leading-relaxed bg-[#f8f9fa]"><code>{codeLines.join('\n')}</code></pre>
        </div>
      );
      continue;
    }

    // Markdown table
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++; }
      const rows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.replace(/ /g, '')));
      if (rows.length > 0) {
        nodes.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-2 rounded-xl border border-[#e8eaed]">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {rows.map((row, ri) => {
                  const cells = row.split('|').slice(1, -1).map(c => c.trim());
                  return (
                    <tr key={ri} className={cn('border-b border-[#e8eaed] last:border-0', ri === 0 ? 'bg-[#f8f9fa]' : 'hover:bg-[#f8f9fa]/60 transition-colors')}>
                      {cells.map((cell, ci) => ri === 0
                        ? <th key={ci} className="px-3 py-2 text-left text-[11px] font-semibold text-[#444746] uppercase tracking-wide whitespace-nowrap">{renderInline(cell)}</th>
                        : <td key={ci} className="px-3 py-2 text-sm text-[#1f1f1f]">{renderInline(cell)}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Headings
    if (line.startsWith('### ')) { nodes.push(<h3 key={i} className="text-sm font-semibold text-[#1f1f1f] mt-3 mb-0.5 leading-snug">{renderInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## '))  { nodes.push(<h2 key={i} className="text-base font-semibold text-[#1f1f1f] mt-4 mb-1 leading-snug">{renderInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('# '))   { nodes.push(<h1 key={i} className="text-lg font-semibold text-[#1f1f1f] mt-4 mb-1 leading-snug">{renderInline(line.slice(2))}</h1>); i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) { nodes.push(<hr key={i} className="my-3 border-[#e8eaed]" />); i++; continue; }

    // Unordered list
    if (line.match(/^\s*[-*]\s+/)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
        const m2 = lines[i].match(/^\s*[-*]\s+(.*)/)!;
        items.push(<li key={i} className="leading-relaxed">{renderInline(m2[1])}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-0.5 my-1.5 text-[#1f1f1f]">{items}</ul>);
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const m2 = lines[i].match(/^\s*\d+\.\s+(.*)/)!;
        items.push(<li key={i} className="leading-relaxed">{renderInline(m2[1])}</li>);
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-0.5 my-1.5 text-[#1f1f1f]">{items}</ol>);
      continue;
    }

    if (line.trim() === '') { if (nodes.length > 0) nodes.push(<div key={`sp-${i}`} className="h-2" />); i++; continue; }
    nodes.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  return <>{nodes}</>;
});

function formatTrackingDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('es-CR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

const TrackingCard = memo(function TrackingCard({ result }: { result: NovaTrackingResult }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [customerMatch, setCustomerMatch] = useState<
    { slCode?: string; fullName?: string; phone?: string; email?: string; ruta?: string } | null | 'loading' | 'notfound'
  >('loading');

  const isColom = result.provider === 'colombia';
  const weightKg = (result.weight ?? 0) > 0 ? (result.weight ?? 0) : null;

  useEffect(() => {
    const searchTerm = result.customerName || result.customerCode;
    if (!searchTerm) { setCustomerMatch(null); return; }
    let cancelled = false;
    setCustomerMatch('loading');
    findCustomerMatch(searchTerm)
      .then(res => {
        if (cancelled) return;
        if (res.bestMatch && res.bestMatch.score >= 0.65) {
          const c = res.bestMatch.customer as unknown as Record<string, unknown>;
          setCustomerMatch({
            slCode: c.slCode as string,
            fullName: (c.fullName || c.firstName || c.name) as string,
            phone: c.phone as string,
            email: c.email as string,
            ruta: (c.ruta || c.route) as string,
          });
        } else {
          setCustomerMatch('notfound');
        }
      })
      .catch(() => { if (!cancelled) setCustomerMatch('notfound'); });
    return () => { cancelled = true; };
  }, [result.customerName, result.customerCode]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result.trackingNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result.trackingNumber]);

  const events: NovaTrackingEvent[] = useMemo(
    () => [...(result.events ?? [])].reverse(),
    [result.events]
  );
  const displayEvents = expanded ? events : events.slice(0, 4);
  const hiddenCount = events.length - 4;

  const statusLabel = useMemo(() => {
    if (result.statusMessage) return result.statusMessage;
    if (result.latestEvent?.detalle) return result.latestEvent.detalle;
    return 'Sin estado';
  }, [result.statusMessage, result.latestEvent]);

  const statusColor = useMemo(() => {
    const s = statusLabel.toLowerCase();
    if (/entregad|delivered/.test(s)) return 'bg-green-500/10 text-green-700 border-green-500/25';
    if (/tránsito|transit|en ruta/.test(s)) return 'bg-blue-500/10 text-blue-700 border-blue-500/25';
    if (/aduana|customs|retenid/.test(s)) return 'bg-amber-500/10 text-amber-700 border-amber-500/25';
    if (/facturad|processed/.test(s)) return 'bg-purple-500/10 text-purple-700 border-purple-500/25';
    return 'bg-muted text-muted-foreground border-border';
  }, [statusLabel]);

  const descText = result.description || '';
  const destText = result.destinationFull || result.destination || '';

  const priceResult = useMemo(() => {
    if (isColom || !weightKg || weightKg <= 0) return null;
    return calculatePrice(weightKg, 'usa', 'air', 'regular', result.requiresPermit ?? false);
  }, [isColom, weightKg, result.requiresPermit]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="mt-2 w-full max-w-[92%] rounded-2xl border border-border bg-card overflow-hidden shadow-sm">

      {/* ── Header: source badge + status + copy ── */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {isColom ? (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-700 border border-yellow-400/30 flex items-center gap-0.5">
              <Globe className="h-2.5 w-2.5" />Colombia
            </span>
          ) : (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 border border-blue-500/20 flex items-center gap-0.5">
              <Truck className="h-2.5 w-2.5" />ML Cargo
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
            <Check className="h-2.5 w-2.5" />Encontrado
          </span>
          <span className={cn('shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate max-w-[180px]', statusColor)}>
            {statusLabel}
          </span>
        </div>
        <button type="button" onClick={handleCopy} aria-label="Copiar número de tracking"
          className={cn('shrink-0 flex items-center gap-1 text-xs rounded-md px-2 py-1 transition-all text-muted-foreground hover:text-foreground hover:bg-accent', copied && 'text-green-600')}>
          {copied ? <><Check className="h-3.5 w-3.5" />Copiado</> : <><Copy className="h-3.5 w-3.5" />Copiar</>}
        </button>
      </div>

      {/* ── Alert flags ── */}
      {(result.requiresPermit || result.missingDestination) && (
        <div className="px-4 pt-3 pb-0 space-y-2">
          {result.requiresPermit && (
            <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
              <div>
                <p className="text-xs font-semibold text-orange-800">Requiere Permisos de Importación</p>
                <p className="text-[10px] text-orange-700 mt-0.5">Este paquete requiere tratamiento especial en aduana.</p>
              </div>
            </div>
          )}
          {result.missingDestination && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
              <div>
                <p className="text-xs font-semibold text-red-800">Sin Destino Asignado</p>
                <p className="text-[10px] text-red-700 mt-0.5">Crea una pre-alerta y contacta al servicio al cliente.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Core fields grid ── */}
      <dl className="px-4 pt-4 pb-3 grid grid-cols-2 gap-x-6 gap-y-3 text-xs border-b border-border">
        {/* Tracking */}
        <div className="col-span-2">
          <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
            <Hash className="h-3 w-3" /> Tracking
          </dt>
          <dd className="font-mono font-bold text-foreground text-sm break-all leading-snug">{result.trackingNumber}</dd>
        </div>

        {result.customerName && (
          <div className="col-span-2">
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <Package className="h-3 w-3" /> Cliente
            </dt>
            <dd className="font-bold text-foreground">{result.customerName}</dd>
          </div>
        )}

        {result.customerCode && (
          <div>
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <Hash className="h-3 w-3" /> Código
            </dt>
            <dd className="font-mono font-semibold text-foreground">{result.customerCode}</dd>
          </div>
        )}

        {destText && (
          <div>
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <MapPin className="h-3 w-3" /> Destino
            </dt>
            <dd className="font-semibold text-foreground">{destText}</dd>
          </div>
        )}

        {(result.shipper || result.shipperDescription) && (
          <div>
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <Truck className="h-3 w-3" /> Shipper
            </dt>
            <dd className="font-semibold text-foreground">{result.shipperDescription || result.shipper}</dd>
          </div>
        )}

        {weightKg && (
          <div>
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <Weight className="h-3 w-3" /> Peso
            </dt>
            <dd className="font-semibold text-foreground">
              {weightKg} kg
            </dd>
          </div>
        )}

        {result.manifestId && (
          <div>
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <FileText className="h-3 w-3" /> Manifiesto
            </dt>
            <dd className="font-mono font-semibold text-foreground">{result.manifestId}</dd>
          </div>
        )}

        {result.invoice && (
          <div>
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <FileText className="h-3 w-3" /> Factura
            </dt>
            <dd className="font-mono font-semibold text-foreground">{result.invoice}</dd>
          </div>
        )}

        {descText && (
          <div className="col-span-2">
            <dt className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
              <Info className="h-3 w-3" /> Descripción
            </dt>
            <dd className="text-foreground">{descText}</dd>
          </div>
        )}
      </dl>

      {/* ── Price estimate (ML Cargo / USA only) ── */}
      {priceResult && (
        <div className="px-4 pt-3 pb-3 border-b border-border">
          {priceResult.quoteRequired ? (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <DollarSign className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Precio Est.</p>
                <p className="text-xs font-bold text-amber-800">Requiere cotización</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                  Precio Est. ({isColom ? 'Colombia' : 'Aéreo USA'})
                </p>
                <p className="text-lg font-bold text-emerald-900 leading-tight">
                  ${priceResult.price.toFixed(2)}{' '}
                  <span className="text-xs font-medium text-emerald-700">{priceResult.currency}</span>
                </p>
                {priceResult.breakdown && (
                  <p className="text-[10px] text-emerald-600 mt-0.5 leading-snug">{priceResult.breakdown}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Customer system match ── */}
      {(result.customerName || result.customerCode) && (
        <div className="px-4 pt-3 pb-3 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <UserCheck className="h-3 w-3" /> Coincidencia en Sistema
          </p>
          {customerMatch === 'loading' && (
            <div className="relative overflow-hidden rounded-lg border border-border px-3 py-2.5 bg-muted/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Buscando cliente en sistema…</span>
              </div>
            </div>
          )}
          {customerMatch === 'notfound' && (
            <div className="flex items-center gap-2.5 rounded-lg bg-muted/30 border border-border px-3 py-2.5 text-xs text-muted-foreground">
              <UserCheck className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <span className="font-medium">Sin coincidencia en el sistema</span>
            </div>
          )}
          {customerMatch && customerMatch !== 'loading' && customerMatch !== 'notfound' && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-0.5 flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> Cliente en Sistema
                  </p>
                  <p className="text-sm font-bold text-foreground truncate">
                    {customerMatch.fullName}
                  </p>
                </div>
                {customerMatch.slCode && (
                  <span className="font-mono text-xs bg-blue-100 text-blue-800 border border-blue-200 rounded px-1.5 py-0.5 font-semibold shrink-0">
                    {customerMatch.slCode}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                {customerMatch.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="text-foreground font-medium">{customerMatch.phone}</span>
                  </div>
                )}
                {customerMatch.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="text-foreground/80 truncate">{customerMatch.email}</span>
                  </div>
                )}
                {customerMatch.ruta && (
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="font-semibold text-foreground">
                      Ruta: <span className="font-mono bg-blue-100 text-blue-800 rounded px-1">{customerMatch.ruta}</span>
                    </span>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* ── Event timeline ── */}
      {events.length > 0 && (
        <div className="px-4 pt-3 pb-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Historial
            <span className="font-normal text-muted-foreground/60">({events.length})</span>
          </p>
          <ol className="space-y-0" aria-label="Historial de rastreo">
            {displayEvents.map((ev, idx) => {
              const isFirst = idx === 0;
              return (
                <li key={idx} className="flex gap-3 pb-3 last:pb-0">
                  <div className="flex flex-col items-center flex-shrink-0 w-4">
                    <span className={cn(
                      'h-2.5 w-2.5 rounded-full border-2 mt-0.5 shrink-0',
                      isFirst ? 'bg-foreground border-foreground' : 'bg-background border-border'
                    )} />
                    {idx < displayEvents.length - 1 && (
                      <span className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="pb-1 min-w-0">
                    <p className={cn('text-xs leading-snug', isFirst ? 'font-semibold text-foreground' : 'font-medium text-foreground/70')}>
                      {ev.detalle || '—'}
                    </p>
                    {(ev.ciudad || ev.fecha) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        {ev.ciudad}
                        {ev.ciudad && ev.fecha && <span className="mx-0.5">·</span>}
                        {ev.fecha && formatTrackingDate(ev.fecha)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setExpanded(e => !e)}
              className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
              {expanded
                ? <><ChevronUp className="h-3 w-3" />Mostrar menos</>
                : <><ChevronDown className="h-3 w-3" />Ver {hiddenCount} evento{hiddenCount !== 1 ? 's' : ''} más</>
              }
            </button>
          )}
        </div>
      )}

      {/* Colombia: mensaje fallback when no events ── */}
      {isColom && result.mensaje && events.length === 0 && (
        <p className="px-4 py-3 text-xs text-muted-foreground italic">{result.mensaje}</p>
      )}

      {/* Colombia: last update timestamp ── */}
      {isColom && result.lastUpdate && (
        <p className="px-4 pb-3 text-[10px] text-muted-foreground">
          Última actualización: {formatTrackingDate(result.lastUpdate)}
        </p>
      )}
    </motion.div>
  );
});

function FusionBadge({ mergedIntoId, count }: { mergedIntoId: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 shrink">
      {count > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />{count} pkgs
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded min-w-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" title={`Fusionado en ${mergedIntoId}`}>
        <Merge className="h-3 w-3 shrink-0" />
        <span className="truncate min-w-0">Fusionado en {mergedIntoId}</span>
      </span>
    </span>
  );
}

const ManifestCards = memo(function ManifestCards({ manifests, onProcess, onDownload, processedStatus, onFusionRequest, selectionResetKey }: {
  manifests: MLockerManifestItem[];
  onProcess?: (id: string) => void;
  onDownload?: (id: string) => void;
  processedStatus?: Record<string, ManifestProcessedStatus>;
  onFusionRequest?: (ids: string[]) => void;
  /** Increment this to clear all checkbox selections (e.g. after fusion starts) */
  selectionResetKey?: number;
}) {
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectionResetKey]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleProcessClick = useCallback((id: string) => {
    if (processedStatus?.[id]) {
      setPendingConfirm(id);
    } else {
      onProcess?.(id);
    }
  }, [processedStatus, onProcess]);

  return (
    <div className="space-y-2 w-full">
      {manifests.map((m) => {
        const processed = processedStatus?.[m.id];
        const isConfirming = pendingConfirm === m.id;
        const isSelected = selectedIds.has(m.id);
        return (
          <div key={m.id}
            className={cn(
              'rounded-lg border bg-card px-4 py-3 transition-colors',
              isConfirming
                ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10 border-l-4 border-l-amber-400'
                : isSelected
                  ? 'border-primary/60 bg-primary/5 border-l-4 border-l-primary'
                  : processed?.mergedInto
                    ? 'border-orange-200/80 dark:border-orange-800/50 bg-orange-50/40 dark:bg-orange-900/5 border-l-4 border-l-orange-400'
                    : processed
                      ? 'border-green-200/80 dark:border-green-800/50 bg-green-50/40 dark:bg-green-900/5 border-l-4 border-l-green-500'
                      : 'border-border'
            )}>
            {isConfirming ? (
              <div className="flex items-center gap-3 flex-wrap">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs text-foreground flex-1 min-w-0 leading-snug">
                  Este manifiesto ya tiene <strong>{processed?.totalPackages}</strong> paquetes procesados.
                  Los trackings existentes se actualizarán y los nuevos se crearán. ¿Continuar?
                </p>
                <button type="button" onClick={() => setPendingConfirm(null)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={() => { setPendingConfirm(null); onProcess?.(m.id); }}
                  className="shrink-0 text-xs px-3 py-1.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-semibold">
                  Sí, actualizar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {/* Checkbox for fusion selection */}
                <button
                  type="button"
                  onClick={() => toggleSelect(m.id)}
                  aria-label={isSelected ? 'Deseleccionar manifiesto' : 'Seleccionar para fusión'}
                  className={cn(
                    'shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                    isSelected
                      ? 'bg-primary border-primary text-white'
                      : 'border-border hover:border-primary/60 bg-background'
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5" />}
                </button>
                <Package className="h-5 w-5 shrink-0 text-primary/60" />
                <span className="font-mono text-sm font-semibold text-foreground truncate flex-1 min-w-0">{m.id}</span>
                {(processed?.mergedInto || m.mergedInto) ? (
                  <FusionBadge
                    mergedIntoId={processed?.mergedInto || m.mergedInto!}
                    count={(processed?.totalPackages ?? 0) > 0 ? processed!.totalPackages : (m.totalPackages ?? 0)}
                  />
                ) : processed ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded shrink-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Check className="h-3.5 w-3.5" />{processed.totalPackages > 0 ? `${processed.totalPackages} pkgs` : 'Procesado'}
                  </span>
                ) : m.manifestType && (
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded shrink-0',
                    m.manifestType === 'Permisos' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    m.manifestType === 'Sin Destino' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-muted text-muted-foreground'
                  )}>{m.manifestType}</span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">{m.receptionDate?.slice(0, 10)}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {onDownload && (
                    <button type="button" onClick={() => onDownload(m.id)} title="Descargar Excel"
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all">
                      <Download className="h-3.5 w-3.5" />Excel
                    </button>
                  )}
                  {onProcess && !processed?.mergedInto && (
                    <button type="button" onClick={() => handleProcessClick(m.id)}
                      title={processed ? 'Actualizar manifiesto' : 'Procesar manifiesto'}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-opacity',
                        processed
                          ? 'bg-amber-500 text-white hover:opacity-90'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      )}>
                      {processed
                        ? <><RotateCcw className="h-3.5 w-3.5" />Actualizar</>
                        : <><Play className="h-3.5 w-3.5" />Procesar</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Fusion action bar — visible when ≥ 2 manifests selected */}
      {selectedIds.size >= 2 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <Merge className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-medium text-primary flex-1">
            {selectedIds.size} manifiestos seleccionados para fusión
          </span>
          <button
            type="button"
            onClick={() => onFusionRequest?.(Array.from(selectedIds))}
            className="flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Merge className="h-3.5 w-3.5" />
            Fusionar {selectedIds.size}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
});

const SavedManifestsSection = memo(function SavedManifestsSection({ onLoad, onReprocess }: { onLoad?: (id: string) => void; onReprocess?: (id: string) => void }) {
  const [records, setRecords] = useState<ManifestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fusionDialogOpen, setFusionDialogOpen] = useState(false);
  const [fusionStep, setFusionStep] = useState<'confirm' | 'processing'>('confirm');
  const [fusionProgress, setFusionProgress] = useState('');

  const [createSlMega, setCreateSlMega] = useState(true);
  const [createEncMega, setCreateEncMega] = useState(false);

  useEffect(() => {
    const unsub = subscribeRecentManifests(7, r => {
      setRecords(r);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Clear selections when records change (e.g. after list refreshes or a manifest is merged)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [records]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleStartFusion = useCallback(() => {
    setCreateSlMega(true);
    setCreateEncMega(false);
    setFusionStep('confirm');
    setFusionProgress('');
    setFusionDialogOpen(true);
  }, []);

  const handleConfirmFusion = useCallback(async () => {
    if (!createSlMega && !createEncMega) {
      toast({
        title: 'Selección requerida',
        description: 'Debes seleccionar al menos un tipo de fusión para continuar.',
        variant: 'destructive',
      });
      return;
    }

    setFusionStep('processing');
    setFusionProgress('Iniciando fusión...');
    try {
      const sourceIds = Array.from(selectedIds);
      let megaId = '';

      if (createEncMega) {
        setFusionProgress('Creando ENC-MEGA-MAN...');
        megaId = await fuseFirestoreManifests(
          sourceIds,
          (msg) => setFusionProgress(`[ENC] ${msg}`),
          'ENC'
        );
      }

      if (createSlMega) {
        setFusionProgress('Creando SL-MEGA-MAN...');
        const slMegaId = await fuseFirestoreManifests(
          sourceIds,
          (msg) => setFusionProgress(`[SL] ${msg}`),
          'SL'
        );
        megaId = slMegaId;
      }
      
      toast({
        title: 'Fusión Firestore completada',
        description: `Se completó la fusión de los manifiestos seleccionados de forma exitosa.`,
      });

      setSelectedIds(new Set());
      setFusionDialogOpen(false);

      // Automatically load the newly fused MEGA-MAN manifest in Nova!
      if (onLoad && megaId) {
        onLoad(megaId);
      }
    } catch (err) {
      toast({
        title: 'Error al fusionar manifiestos',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setFusionStep('confirm');
    }
  }, [selectedIds, createSlMega, createEncMega, toast, onLoad]);

  // States for merging a single regular manifest into an existing MEGA-MAN
  const [mergeIntoDialogOpen, setMergeIntoDialogOpen] = useState(false);
  const [sourceManifestId, setSourceManifestId] = useState<string | null>(null);
  const [selectedTargetMegaId, setSelectedTargetMegaId] = useState<string>('');
  const [megaOptions, setMegaOptions] = useState<MegaManRecord[]>([]);
  const [loadingMegas, setLoadingMegas] = useState(false);
  const [mergeProgress, setMergeProgress] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Triggered when clicking "A Mega-Man" on a regular manifest row
  const handleStartMergeIntoExisting = useCallback(async (sourceId: string) => {
    setSourceManifestId(sourceId);
    setSelectedTargetMegaId('');
    setMergeProgress('');
    setIsMerging(false);
    setMergeIntoDialogOpen(true);
    setLoadingMegas(true);
    try {
      const megas = await getMegaManManifests();
      setMegaOptions(megas);
    } catch (err) {
      toast({
        title: 'Error al cargar MEGA-MANs',
        description: 'No se pudieron recuperar los manifiestos consolidados existentes.',
        variant: 'destructive',
      });
    } finally {
      setLoadingMegas(false);
    }
  }, [toast]);

  // Triggered when confirming the merge inside the dialog
  const handleConfirmMergeIntoExisting = useCallback(async () => {
    if (!sourceManifestId || !selectedTargetMegaId) return;
    setIsMerging(true);
    setMergeProgress('Iniciando fusión en MEGA-MAN...');
    try {
      await mergeManifestIntoMegaMan(
        sourceManifestId,
        selectedTargetMegaId,
        (msg) => setMergeProgress(msg)
      );

      toast({
        title: 'Fusión exitosa',
        description: `El manifiesto ${sourceManifestId} fue integrado correctamente al MEGA-MAN ${selectedTargetMegaId}.`,
      });

      setMergeIntoDialogOpen(false);
      setSourceManifestId(null);
      setSelectedTargetMegaId('');

      // Automatically load the updated target MEGA-MAN in Nova!
      if (onLoad) {
        onLoad(selectedTargetMegaId);
      }
    } catch (err) {
      toast({
        title: 'Error en la fusión',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsMerging(false);
    }
  }, [sourceManifestId, selectedTargetMegaId, toast, onLoad]);


  if (loading) {
    return (
      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />Cargando manifiestos guardados…
        </p>
      </div>
    );
  }

  if (!records.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-3"
    >
      <div className="rounded-xl border border-border/80 bg-muted/5 p-2">
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
        {records.map(r => {
          const isSelected = selectedIds.has(r.id);
          const isFirestoreFusion = !!r.isFirestoreFusion || r.id.startsWith('SL-MEGA-MAN-');
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-lg border transition-colors",
                r.isMegaMan
                  ? isFirestoreFusion
                    ? "border-red-200/70 bg-red-50/40 dark:bg-red-900/5 dark:border-red-800/40 px-4 py-2.5"
                    : "border-orange-200/70 bg-orange-50/40 dark:bg-orange-900/5 dark:border-orange-800/40 px-4 py-2.5"
                  : isSelected
                    ? "border-primary/60 bg-primary/5 border-l-4 border-l-primary px-4 py-2"
                    : "border-border bg-muted/20 hover:bg-muted/30 px-4 py-2"
              )}
            >
              {r.isMegaMan ? (
                /* ── MEGA-MAN row: two-line layout ── */
                <div className="flex items-start gap-3">
                  {isFirestoreFusion ? (
                    <Merge className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  ) : (
                    <Merge className="h-4 w-4 shrink-0 text-orange-500 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-foreground">{r.id}</span>
                      {r.totalPackages > 0 && (
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded",
                          isFirestoreFusion
                            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                        )}>
                          {r.totalPackages} pkgs
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {r.processedAt ? new Date(r.processedAt).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : ''}
                      </span>
                    </div>
                    {r.fusedFrom && r.fusedFrom.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={cn(
                          "text-[10px] font-medium uppercase tracking-wide",
                          isFirestoreFusion ? "text-red-500/80" : "text-orange-500/80"
                        )}>
                          Fusión:
                        </span>
                        {r.fusedFrom.map(src => {
                          const srcCount = r.fusedFromCounts?.[src] ?? 0;
                          return (
                            <span
                              key={src}
                              className={cn(
                                "inline-flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded border",
                                isFirestoreFusion
                                  ? "bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200/60"
                                  : "bg-orange-100/80 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200/60"
                              )}
                            >
                              {src}
                              {srcCount > 0 && (
                                <span className={cn(
                                  "text-[10px] font-bold px-1 py-0 rounded-sm",
                                  isFirestoreFusion
                                    ? "bg-red-200/70 text-red-800 dark:bg-red-800/50 dark:text-red-200"
                                    : "bg-orange-200/70 text-orange-800 dark:bg-orange-800/50 dark:text-orange-200"
                                )}>
                                  {srcCount}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {(r.consolidationCount ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">↳</span>
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">+{r.consolidationCount} pkgs</span>
                        <span className="text-[10px] text-muted-foreground">de Consolidación</span>
                      </div>
                    )}
                    {r.moveHistory && r.moveHistory.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1">
                        {r.moveHistory.map((mv, i) => (
                          <div key={i} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">↳</span>
                            <span className={cn(
                              "text-[11px] font-medium",
                              isFirestoreFusion ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"
                            )}>
                              +{mv.count} pkgs
                            </span>
                            <span className="text-[10px] text-muted-foreground">de</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{mv.fromManifest}</span>
                            {mv.userName && <span className="text-[10px] text-muted-foreground/70">· {mv.userName}</span>}
                            <span className="text-[10px] text-muted-foreground/60">{mv.timestamp ? new Date(mv.timestamp).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-center">
                    {onReprocess && (
                      <button
                        type="button"
                        onClick={() => onReprocess(r.id)}
                        title="Re-procesar con Nova — solo paquetes originales del ML Manifest (no incluye paquetes de Consolidación)"
                        className={cn(
                          "flex items-center rounded-md p-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity",
                          isFirestoreFusion ? "bg-red-500" : "bg-orange-500"
                        )}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onLoad && (
                      <button
                        type="button"
                        onClick={() => onLoad(r.id)}
                        title="Cargar datos desde Firestore (incluye paquetes de consolidación)"
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-primary text-white hover:opacity-90 transition-opacity"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />Cargar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ── Regular manifest row ── */
                <div className="flex items-start gap-3 w-full">
                  {/* Checkbox for fusion selection */}
                  <Checkbox
                    id={`select-manifest-${r.id}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(r.id)}
                    className="shrink-0 h-4 w-4 mt-1 border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />

                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary/70 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-foreground">{r.id}</span>
                      {r.totalPackages > 0 && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                          {r.totalPackages} pkgs
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {r.processedAt ? new Date(r.processedAt).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : ''}
                      </span>
                    </div>
                    {r.moveHistory && r.moveHistory.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1">
                        {r.moveHistory.map((mv, i) => (
                          <div key={i} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">↳</span>
                            <span className="text-[11px] font-medium text-primary">+{mv.count} pkgs</span>
                            <span className="text-[10px] text-muted-foreground">de</span>
                            <span className="font-mono text-[11px] text-muted-foreground">{mv.fromManifest}</span>
                            {mv.userName && <span className="text-[10px] text-muted-foreground/70">· {mv.userName}</span>}
                            <span className="text-[10px] text-muted-foreground/60">{mv.timestamp ? new Date(mv.timestamp).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {onLoad && (
                    <div className="flex items-center gap-2 shrink-0 self-center">
                      {r.mergedInto ? (
                        <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200 dark:border-green-900/40">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          Fusionado
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartMergeIntoExisting(r.id)}
                          title="Fusionar en Mega-Man existente"
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/20 transition-all"
                        >
                          <Merge className="h-3.5 w-3.5 animate-pulse" />
                          A Mega-Man
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onLoad(r.id)}
                        title="Cargar datos desde Firestore"
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold bg-primary text-white hover:opacity-90 transition-opacity"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />Cargar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Sleek Firestore Fusion Action Bar */}
      {selectedIds.size >= 2 && (
        <div className="mt-4 p-3 rounded-xl border border-red-200/50 bg-gradient-to-r from-red-50/90 to-rose-50/90 dark:from-red-950/20 dark:to-rose-950/20 backdrop-blur-md flex items-center justify-between gap-3 shadow-md shadow-red-500/5 transition-all duration-300">
          <div className="flex items-center gap-2">
            <Merge className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-red-800 dark:text-red-300">
              {selectedIds.size} manifiestos seleccionados
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-red-200 text-red-700 hover:bg-red-100/50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleStartFusion}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/10 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Fusionar Firestore
            </button>
          </div>
        </div>
      )}

      {/* Dialog for Firestore Fusion */}
      <Dialog open={fusionDialogOpen} onOpenChange={(open) => {
        if (fusionStep !== 'processing') {
          setFusionDialogOpen(open);
        }
      }}>
        <DialogContent className="w-full h-[100dvh] sm:h-auto left-0 top-0 translate-x-0 translate-y-0 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:bottom-auto sm:right-auto sm:max-w-[650px] md:max-w-[760px] lg:max-w-[800px] rounded-none sm:rounded-2xl border-none sm:border border-red-100 dark:border-red-900/40 shadow-xl overflow-hidden p-0 bg-background text-foreground flex flex-col">
          <div className="bg-gradient-to-b from-red-50/50 to-transparent dark:from-red-950/10 p-6 pb-4">
            <DialogHeader>
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 mb-3">
                <Merge className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                Fusión de Manifiestos en Firestore
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1.5">
                Esta acción consolidará los manifiestos seleccionados directamente en la base de datos.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 space-y-4 flex-1">
            {fusionStep === 'confirm' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* Left Column: Manifiestos a fusionar */}
                <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2 flex flex-col h-full min-h-[220px]">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Manifiestos a fusionar:</span>
                  <div className="space-y-1.5 font-mono text-xs max-h-[240px] overflow-y-auto pr-1 flex-1">
                    {Array.from(selectedIds)
                      .sort((a, b) => {
                        const parseDate = (id: string) => {
                          const m = id.match(/^(\d{2})-(\d{2})-(\d{4})/);
                          return m ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime() : 0;
                        };
                        return parseDate(a) - parseDate(b);
                      })
                      .map((id, index, arr) => {
                        const isPrimary = index === arr.length - 1;
                        return (
                          <div key={id} className={cn(
                            "flex items-center justify-between p-2 rounded-lg border",
                            isPrimary 
                              ? "bg-red-50/50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300"
                              : "bg-background border-border text-foreground"
                          )}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] text-muted-foreground font-semibold">#{index + 1}</span>
                              <span className="font-semibold truncate">{id}</span>
                            </div>
                            {isPrimary && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 tracking-wider">
                                Primario (T.C.)
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Right Column: Opciones de fusión + Resiliencia */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Opciones de Fusión:</span>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-2.5 rounded-xl border bg-background/50 border-border/50 hover:bg-muted/10 transition-colors">
                        <Checkbox
                          id="check-create-sl"
                          checked={createSlMega}
                          onCheckedChange={(checked) => setCreateSlMega(!!checked)}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5 min-w-0">
                          <label htmlFor="check-create-sl" className="text-xs font-bold cursor-pointer text-foreground block">
                            Crear SL-MEGA-MAN (Carga Miami)
                          </label>
                          <p className="text-[11px] text-muted-foreground leading-normal">
                            Fusiona todos los paquetes aéreos y marítimos regulares en un manifiesto consolidado de carga.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-2.5 rounded-xl border bg-background/50 border-border/50 hover:bg-muted/10 transition-colors">
                        <Checkbox
                          id="check-create-enc"
                          checked={createEncMega}
                          onCheckedChange={(checked) => setCreateEncMega(!!checked)}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5 min-w-0">
                          <label htmlFor="check-create-enc" className="text-xs font-bold cursor-pointer text-foreground block">
                            Crear ENC-MEGA-MAN (Encomiendas)
                          </label>
                          <p className="text-[11px] text-muted-foreground leading-normal">
                            Extrae y consolida únicamente los paquetes en ruta de "Encomiendas". La carga regular de Miami permanecerá activa en los manifiestos origen.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 dark:border-rose-900/40 dark:bg-rose-900/5 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-red-800 dark:text-red-400 block">Garantía de Resiliencia</span>
                      <p className="text-[11px] text-red-700/90 dark:text-red-300/80 leading-relaxed">
                        El proceso migrará secuencialmente los paquetes, facturas y consolidaciones. En caso de interrupción, Nova recuperará todos los paquetes en paralelo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center space-y-4">
                <div className="relative flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-red-500 animate-spin" />
                  <Merge className="h-4 w-4 text-red-500 absolute animate-pulse" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-bold text-foreground">Procesando fusión en Firestore...</p>
                  <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-lg border inline-block">
                    {fusionProgress}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-muted/40 p-4 px-6 border-t flex justify-end gap-2 mt-auto sm:mt-4">
            {fusionStep === 'confirm' ? (
              <>
                <button
                  type="button"
                  onClick={() => setFusionDialogOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-muted transition-colors text-muted-foreground text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!createSlMega && !createEncMega}
                  onClick={handleConfirmFusion}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Confirmar y Fusionar
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium py-1">
                <Clock className="h-3.5 w-3.5 animate-pulse text-red-500" />
                Por favor, mantén esta pestaña abierta...
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog for Merging Regular Manifest into Existing MEGA-MAN */}
      <Dialog open={mergeIntoDialogOpen} onOpenChange={(open) => {
        if (!isMerging) {
          setMergeIntoDialogOpen(open);
          if (!open) {
            setSourceManifestId(null);
            setSelectedTargetMegaId('');
            setMergeProgress('');
          }
        }
      }}>
        <DialogContent className="w-full h-[100dvh] sm:h-auto left-0 top-0 translate-x-0 translate-y-0 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:bottom-auto sm:right-auto sm:max-w-[480px] rounded-none sm:rounded-2xl border-none sm:border border-red-100 dark:border-red-900/40 shadow-xl overflow-hidden p-0 bg-background text-foreground flex flex-col animate-in fade-in-50 zoom-in-95 duration-200">
          <div className="bg-gradient-to-b from-red-50/50 to-transparent dark:from-red-950/10 p-6 pb-4">
            <DialogHeader>
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500 mb-3">
                <Merge className="h-5 w-5 animate-pulse" />
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                Fusionar en Mega-Man Existente
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Esta acción moverá todos los paquetes y facturas del manifiesto origen <span className="font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded border text-[11px]">{sourceManifestId}</span> hacia el manifiesto <span className="font-semibold text-foreground">MEGA-MAN</span> seleccionado a continuación.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-2 space-y-4 flex-1">
            {!isMerging ? (
              <>
                <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">Seleccionar MEGA-MAN de destino:</span>
                  {loadingMegas ? (
                    <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                      <span>Cargando manifiestos consolidados...</span>
                    </div>
                  ) : megaOptions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground italic">
                      No se encontraron manifiestos MEGA-MAN activos en Firestore.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
                      {megaOptions.map((mega) => {
                        const isSelected = selectedTargetMegaId === mega.id;
                        const isAlreadyFused = mega.fusedFrom?.map((id: string) => id.toUpperCase()).includes(sourceManifestId?.toUpperCase() || '');
                        return (
                          <button
                            key={mega.id}
                            type="button"
                            disabled={isAlreadyFused}
                            onClick={() => setSelectedTargetMegaId(mega.id)}
                            className={cn(
                              "w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all",
                              isSelected
                                ? "bg-red-50/60 border-red-300 text-red-800 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-300 ring-2 ring-red-500/20 font-medium"
                                : isAlreadyFused
                                  ? "bg-muted/30 border-muted-foreground/10 text-muted-foreground opacity-60 cursor-not-allowed"
                                  : "bg-background border-border hover:bg-muted/40 text-foreground"
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-mono font-semibold text-xs block">{mega.id}</span>
                              <span className="text-[10px] text-muted-foreground mt-0.5 block truncate">
                                Procesado: {mega.processedAt ? new Date(mega.processedAt).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {isAlreadyFused && (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full">
                                  Ya integrado
                                </span>
                              )}
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                                isSelected 
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {mega.totalPackages} pkgs
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 dark:border-rose-900/40 dark:bg-rose-900/5 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-red-800 dark:text-red-400">Garantía de Consistencia</span>
                    <p className="text-xs text-red-700/90 dark:text-red-300/80 leading-relaxed">
                      Esta operación es irreversible. Los paquetes se moverán de forma lógica en Firestore y el manifiesto original se archivará como "fusionado".
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center space-y-4">
                <div className="relative flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-red-500 animate-spin" />
                  <Merge className="h-4 w-4 text-red-500 absolute animate-pulse" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-bold text-foreground">Procesando fusión individual...</p>
                  <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-lg border inline-block">
                    {mergeProgress}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-muted/40 p-4 px-6 border-t flex justify-end gap-2 mt-auto sm:mt-4">
            {!isMerging ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMergeIntoDialogOpen(false);
                    setSourceManifestId(null);
                    setSelectedTargetMegaId('');
                    setMergeProgress('');
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-muted-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!selectedTargetMegaId}
                  onClick={handleConfirmMergeIntoExisting}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Confirmar e Integrar
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium py-1">
                <Clock className="h-3.5 w-3.5 animate-pulse text-red-500" />
                Actualizando base de datos en tiempo real...
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
});


const NovaChatMessage = memo(function NovaChatMessage({ msg, onProcessManifest, onDownloadManifest, refreshTrigger, onFusionRequest, fusionResetKey, onReprocessMegaMan, onLoadManifest, onShowFirestoreManifests }: {
  msg: NovaConversationMessage;
  onProcessManifest?: (id: string) => void;
  onDownloadManifest?: (id: string) => void;
  /** BUG-N5: increments when any manifest finishes processing so badges refresh */
  refreshTrigger?: number;
  onFusionRequest?: (ids: string[]) => void;
  fusionResetKey?: number;
  onReprocessMegaMan?: (id: string) => void;
  onLoadManifest?: (id: string) => void;
  onShowFirestoreManifests?: () => void;
}) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [processedStatus, setProcessedStatus] = useState<Record<string, ManifestProcessedStatus>>(() => {
    if (!msg.mlockerManifests?.length) return {};
    const initial: Record<string, ManifestProcessedStatus> = {};
    msg.mlockerManifests.forEach(m => {
      if (m.processed || m.mergedInto) {
        initial[m.id] = {
          totalPackages: m.totalPackages ?? 0,
          processedAt: m.processedAt || '',
          ...(m.mergedInto ? { mergedInto: m.mergedInto } : {}),
        };
      }
    });
    return initial;
  });
  const repairAttemptsRef = useRef<Set<string>>(new Set());

  // Realtime Firestore subscription — badge updates instantly when any manifest
  // document is written (processed by Nova or imported by SP2) without polling.
  const manifestIdsKey = msg.mlockerManifests?.map(m => m.id).join(',') ?? '';
  useEffect(() => {
    if (!manifestIdsKey) return;
    const ids = manifestIdsKey.split(',').filter(Boolean);
    if (!ids.length) return;
    const unsub = subscribeManifestProcessedStatus(ids, setProcessedStatus);
    return unsub;
  }, [msg.id, manifestIdsKey]);

  // Background repair for fused manifests whose stub has totalPackages=0 and
  // Tier 3 recovery failed (no manifestNumber pointer). Calls the MLocker portal
  // as the authoritative source, then self-heals Firestore so the onSnapshot
  // above updates the badge without any further manual intervention.
  useEffect(() => {
    const manifests = msg.mlockerManifests;
    if (!manifests?.length) return;
    for (const m of manifests) {
      const st = processedStatus[m.id];
      const isFused = st?.mergedInto || m.mergedInto;
      const hasNoCount = !(st?.totalPackages ?? 0) && !(m.totalPackages ?? 0);
      if (!isFused || !hasNoCount || repairAttemptsRef.current.has(m.id)) continue;
      repairAttemptsRef.current.add(m.id);
      getManifestDetail(m.id)
        .then(detail => {
          const count = detail.totalPackages || detail.packageCount || detail.packages?.length || 0;
          if (count > 0) {
            fsSetDoc(fsDoc(db, 'manifests', m.id), { totalPackages: count }, { merge: true }).catch(() => {});
          }
        })
        .catch(() => { repairAttemptsRef.current.delete(m.id); });
    }
  }, [processedStatus, msg.mlockerManifests]);

  const handleCopy = useCallback(() => {
    if (!msg.content) return;
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [msg.content]);

  return (
    <div className={cn('group/message relative flex w-full flex-col', isUser ? 'items-end' : 'items-start')}>
      {isUser ? (
        /* ── User bubble: Gemini sharp top-right corner ── */
        <div className="max-w-[85%] rounded-3xl rounded-tr-[4px] bg-primary px-4 py-3 text-primary-foreground text-sm leading-relaxed">
          <NovaMarkdown text={msg.content} />
        </div>
      ) : (
        /* ── AI message: prose, no bubble ── */
        <div className="flex items-start gap-3 w-full">
          <div className="flex-1 min-w-0">
            {msg.isThinking ? (
              <div className="flex flex-col gap-1.5 py-2">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#a80010] inline-block"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.65, 1, 0.65] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
                {msg.thinkingStatus && (
                  <motion.p
                    key={msg.thinkingStatus}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-xs text-[#70757a] italic"
                  >
                    {msg.thinkingStatus}
                  </motion.p>
                )}
              </div>
            ) : (
              <div className="text-sm leading-relaxed text-[#1f1f1f]">
                <NovaMarkdown text={msg.content} />
              </div>
            )}
            {msg.trackingResult?.found && <TrackingCard result={msg.trackingResult} />}
            {msg.mlockerManifests && msg.mlockerManifests.length > 0 && (
              <div className="w-full mt-2 space-y-3">
                <ManifestCards
                  manifests={msg.mlockerManifests}
                  onProcess={onProcessManifest}
                  onDownload={onDownloadManifest}
                  processedStatus={processedStatus}
                  onFusionRequest={onFusionRequest}
                  selectionResetKey={fusionResetKey}
                />
                {onShowFirestoreManifests && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={onShowFirestoreManifests}
                      className="nova-chip flex items-center gap-2 rounded-xl px-4 py-2 text-[#444746] dark:text-zinc-200 text-xs font-semibold transition-all hover:shadow-md active:scale-[0.98] border border-border/80 bg-white dark:bg-zinc-800 cursor-pointer"
                    >
                      <Database className="h-4 w-4 text-[#a80010]" />
                      Ver manifiestos guardados en Firestore
                    </button>
                  </div>
                )}
              </div>
            )}
            {msg.firestoreManifestsOnly && (
              <div className="w-full mt-2">
                <SavedManifestsSection onLoad={onLoadManifest} onReprocess={onReprocessMegaMan} />
              </div>
            )}
            {msg.loadManifestId && (
              <div className="w-full mt-3">
                <button
                  type="button"
                  onClick={() => onLoadManifest?.(msg.loadManifestId!)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  Cargar manifiesto {msg.loadManifestId}
                </button>
              </div>
            )}
            {msg.chartData && (
              <div className="w-full mt-1">
                <NovaChart chart={msg.chartData} />
              </div>
            )}
            {/* Copy button — fades in on hover */}
            {!msg.isThinking && msg.content && (
              <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/message:opacity-100 transition-opacity duration-150">
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copiar respuesta"
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[#70757a] hover:bg-[#444746]/8 hover:text-[#1f1f1f] transition-colors"
                >
                  {copied
                    ? <><Check className="h-3 w-3 text-green-500" />Copiado</>
                    : <><Copy className="h-3 w-3" />Copiar</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ── Module-level constants (BUG-N1: avoid array recreation on every render) ──
const MANIFEST_TYPE_OPTIONS: { value: ManifestType; label: string }[] = [
  { value: 'usa_air',      label: 'USA Aéreo' },
  { value: 'usa_sea',      label: 'USA Marítimo' },
  { value: 'mexico_air',   label: 'México Aéreo' },
  { value: 'mexico_sea',   label: 'México Marítimo' },
  { value: 'china_air',    label: 'China Aéreo' },
  { value: 'china_sea',    label: 'China Marítimo' },
  { value: 'colombia_air', label: 'Colombia Aéreo' },
  { value: 'colombia_sea', label: 'Colombia Marítimo' },
];

// ── Psychological & morale-boosting motivational phrases ─────────────────────

const NOVA_MOTIVATIONAL_PHRASES = [
  "¡Hoy vas a tener un día de éxito!",
  "Hoy tienes la capacidad de lograr mucho más.",
  "Cada paso constante construye grandes resultados.",
  "Foco, determinación y calma para triunfar hoy.",
  "Tu actitud y profesionalismo marcan la diferencia.",
  "Un día excelente comienza con una mentalidad positiva.",
  "La constancia de hoy es la tranquilidad de mañana.",
  "Con serenidad y precisión todo fluye hacia el éxito.",
  "Confía en tu capacidad: hoy será una gran jornada.",
  "La excelencia se forja en cada pequeño detalle.",
];

export default function Manifiesto() {
  const { user } = useAuth();
  const { t } = useLocale(['nova', 'common']);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { canCreate } = usePermissions();

  const motivationPhrase = useMemo(() => {
    const dayOfMonth = new Date().getDate();
    return NOVA_MOTIVATIONAL_PHRASES[dayOfMonth % NOVA_MOTIVATIONAL_PHRASES.length];
  }, []);

  const {
    messages,
    isProcessing,
    currentStep,
    processedData,
    processFiles,
    loadManifestFromDB,
    clearMessages,
    downloadCSV,
    downloadXLSX,
    applyMatchSelection,
  } = useNovaChat({
    onError: useCallback(
      (error: Error) => {
        toast({
          title: t('common.error'),
          description: error.message,
          variant: 'destructive',
        });
      },
      [toast, t]
    ),
  });

  const {
    isThinking: novaThinking,
    hasManifestToday,
    conversation: novaConversation,
    pendingMLockerManifestId,
    onManifestProcessed,
    onMLockerManifestHandled,
    requestMLockerManifest,
    sendMessage: sendToNova,
    showFirestoreManifestsDirect,
    clearConversation: clearNovaConversation,
  } = useManifestAgent();

  const [isMLockerLoading, setIsMLockerLoading] = useState(false);
  // fusionResetKey increments after each fusion — propagated to ManifestCards
  // via NovaChatMessage so checkboxes are cleared once fusion starts.
  const [fusionResetKey, setFusionResetKey] = useState(0);

  const [fusionDialog, setFusionDialog] = useState<{
    open: boolean;
    ids: string[];
    /** loading = downloading+merging; confirm = awaiting user; processing = AI pipeline */
    step: 'loading' | 'confirm' | 'processing';
    progressMsg: string;
    preview?: {
      file: File;
      primaryId: string;
      megaManifestId: string;
      totalRows: number;
      perManifestRowCounts: number[];
      /** Rows dropped because tracking + description + weight all matched */
      removedDuplicates: number;
      /** Trackings still appearing >1 time after dedup (different data — flagged for review) */
      conflictTrackings: string[];
    };
  }>({ open: false, ids: [], step: 'loading', progressMsg: '' });
  // One-time backfill for MEGA-MAN docs saved before fusedManifests field was introduced.
  // Idempotent — backfillMegaManFusedSources skips docs that already have the field.
  useEffect(() => {
    const known: Array<{ id: string; sources: string[] }> = [
      { id: 'MEGA-MAN-16-04-2026', sources: ['16-04-2026DAN', '15-04-2026DAN'] },
      { id: 'MEGA-MAN-14-04-2026', sources: ['14-04-2026DAN', '13-04-2026DAN'] },
      { id: 'MEGA-MAN-09-04-2026', sources: ['09-04-2026DAN', '08-04-2026DAN'] },
    ];
    known.forEach(({ id, sources }) => backfillMegaManFusedSources(id, sources).catch(() => {}));
  }, []);

  const mlockerHandledRef = useRef<string | null>(null);
  // Tracks the MLocker portal ID waiting to be linked after processFiles completes
  const pendingMLockerLinkRef = useRef<string | null>(null);
  // Tracks discarded manifest IDs from a fusion — marked with mergedInto after processing
  const pendingDiscardedIdsRef = useRef<string[]>([]);
  // Tracks a MEGA-MAN being re-processed from Storage so the useEffect can auto-save
  const pendingReprocessMegaManRef = useRef<string | null>(null);
  // BUG-N5: counter increments when a manifest finishes processing so
  // NovaChatMessage components re-fetch their processedStatus badges
  const [processRefreshKey, setProcessRefreshKey] = useState(0);

  // ── Pre-processing dialog state ───────────────────────────────────────────
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [preProcessOpen, setPreProcessOpen] = useState(false);
  const [dialogManifestType, setDialogManifestType] = useState<ManifestType>('usa_air');
  const [dialogExchangeRate, setDialogExchangeRate] = useState('487');
  const [capturedExchangeRate, setCapturedExchangeRate] = useState('487');

  const handleFilesSelected = useCallback((files: File[]) => {
    setPendingFiles(files);
    setDialogManifestType('usa_air');
    setPreProcessOpen(true);
  }, []);

  const handlePreProcessConfirm = useCallback(() => {
    const rate = dialogExchangeRate.trim();
    const parsed = parseFloat(rate);
    const finalRate = !isNaN(parsed) && parsed > 0 ? rate : '487';
    setCapturedExchangeRate(finalRate);
    setPreProcessOpen(false);
    processFiles(pendingFiles, dialogManifestType);
    setPendingFiles([]);
  }, [pendingFiles, dialogManifestType, dialogExchangeRate, processFiles]);

  const handleProcessManifest = useCallback((manifestId: string) => {
    requestMLockerManifest(manifestId);
  }, [requestMLockerManifest]);

  const handleFusionRequest = useCallback(async (ids: string[]) => {
    // Open immediately with loading state, then download + merge in background
    // so the confirm dialog shows real row counts and duplicate warnings.
    setFusionDialog({ open: true, ids, step: 'loading', progressMsg: 'Descargando manifiestos...' });
    try {
      const preview = await createMergedManifestFile(
        ids,
        (msg) => setFusionDialog(prev => ({ ...prev, progressMsg: msg }))
      );
      setFusionDialog(prev => ({ ...prev, step: 'confirm', preview }));
    } catch (err) {
      toast({
        title: 'Error al preparar la fusión',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setFusionDialog(prev => ({ ...prev, open: false }));
    }
  }, [toast]);

  const handleFusionConfirm = useCallback(async () => {
    const { preview } = fusionDialog;
    if (!preview) return;
    setFusionResetKey(k => k + 1);
    setFusionDialog(prev => ({ ...prev, step: 'processing', progressMsg: 'Procesando con IA...' }));
    try {
      setFusionDialog(prev => ({ ...prev, open: false }));
      // Use primaryId (most-recent manifest) for the Firestore mlocker link
      pendingMLockerLinkRef.current = preview.primaryId;
      // Track discarded manifests so they get marked with mergedInto after processing
      pendingDiscardedIdsRef.current = fusionDialog.ids.filter(id => id !== preview.primaryId);
      // Upload merged Excel to Storage so it can be re-processed in the future
      // Path mirrors the MLocker proxy convention: MLCARGO/<date>/<megaId>.xlsx
      const megaDate = preview.megaManifestId.replace('SL-MEGA-MAN-', '').replace('MEGA-MAN-', '');
      try {
        const fileRef = storageRef(storage, `MLCARGO/${megaDate}/${preview.megaManifestId}.xlsx`);
        await uploadBytes(fileRef, preview.file, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          customMetadata: {
            megaManifestId: preview.megaManifestId,
            sourceManifests: fusionDialog.ids.join(','),
          },
        });
      } catch (uploadErr) {
        console.warn('[Nova] MEGA-MAN Storage upload failed — re-process will be unavailable:', uploadErr);
      }
      await processFiles([preview.file]);
    } catch (err) {
      toast({
        title: 'Error al procesar manifiesto fusionado',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [fusionDialog, processFiles, toast]);

  const handleLoadManifest = useCallback(async (manifestId: string) => {
    // Load existing data from Firestore — works for any manifest (individual or MEGA-MAN).
    await loadManifestFromDB(manifestId);
  }, [loadManifestFromDB]);

  const handleReprocessMegaMan = useCallback(async (megaManId: string) => {
    // Download the MEGA-MAN Excel from Firebase Storage and re-process it.
    // The Storage path mirrors the upload convention used in handleFusionConfirm.
    const datePart = megaManId.replace('SL-MEGA-MAN-', '').replace('MEGA-MAN-', '');
    const storagePath = `MLCARGO/${datePart}/${megaManId}.xlsx`;
    try {
      const fileRef = storageRef(storage, storagePath);
      const url = await getDownloadURL(fileRef);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const file = new File([blob], `${megaManId}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      pendingReprocessMegaManRef.current = megaManId;
      await processFiles([file]);
    } catch (err) {
      toast({
        title: 'Error al re-procesar MEGA-MAN',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [processFiles, toast]);

  const handleDownloadManifest = useCallback(async (manifestId: string) => {
    try {
      const result = await downloadManifestExcel(manifestId);
      triggerExcelDownload(result);
    } catch (err) {
      toast({
        title: 'Error al descargar manifiesto',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Auto-scroll on new messages (both manifest processor and Nova agent)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, novaConversation]);

  // After a manifest is processed, persist to Firestore memory and signal
  // NovaChatMessage to re-fetch processedStatus badges (BUG-N5)
  useEffect(() => {
    if (processedData) {
      onManifestProcessed(processedData).catch(() => {});
      setProcessRefreshKey(k => k + 1);
      // If this was a MLocker manifest, save manifests/{mlockerId} so the
      // processed-badge lookup finds it by its portal ID (not Excel manifest number)
      const mlockerId = pendingMLockerLinkRef.current;
      if (mlockerId) {
        pendingMLockerLinkRef.current = null;
        saveManifestMLockerLink(
          mlockerId,
          processedData.summary.totalRows,
          processedData.manifestNumber,
        ).catch(() => {});
        // Mark all discarded (non-primary) source manifests as fusionado.
        // Use the MEGA-MAN manifest number (not the portal ID) as mergedInto so
        // the fusedFrom query in subscribeRecentManifests can find them.
        const discarded = pendingDiscardedIdsRef.current;
        pendingDiscardedIdsRef.current = [];
        const megaManId = processedData.manifestNumber || mlockerId;
        discarded.forEach(id => saveManifestMergedLink(id, megaManId).catch(() => {}));
        const allSources = [mlockerId, ...discarded].filter(Boolean);
        // ── Sync packages into Firestore (sequential — order matters) ─────────
        // 1. saveManifestRecord creates the MEGA-MAN doc with all packages.
        //    The guard in use-nova-chat.ts skips this for MEGA-MAN files, so we
        //    do it here explicitly.
        // 2. fsSetDoc fusedManifests AFTER save — avoids a race where the non-merge
        //    create path in saveManifestRecord would overwrite a premature write.
        // 3. mergeManifestDocs copies each discarded manifest's packages into the
        //    primary portal doc (separate from the MEGA-MAN doc).
        const doMerge = async () => {
          const isMM = megaManId.startsWith('MEGA-MAN-') || megaManId.startsWith('SL-MEGA-MAN-');
          if (isMM && processedData.rows.length > 0) {
            await saveManifestRecord(
              processedData.rows as any,
              megaManId,
              { manifestType: processedData.manifestType },
            ).catch(() => {});
          }
          // Persist source-manifest list on the MEGA-MAN doc AFTER packages are saved.
          // Write both fusedFrom (canonical, read by loadMegaManFromFirestore &
          // subscribeRecentManifests) and fusedManifests (legacy compat).
          if (allSources.length > 0 && megaManId) {
            fsSetDoc(fsDoc(db, 'manifests', megaManId), {
              fusedFrom:      allSources,
              fusedManifests: allSources,
            }, { merge: true }).catch(() => {});
          }
          // Re-link all packages from source manifests → MEGA-MAN so direct queries
          // (packages WHERE manifestNumber == megaManId) return the complete set.
          if (isMM && allSources.length > 0) {
            linkPackagesToMegaMan(allSources, megaManId, processedData.rows as any[]).catch(() => {});
          }
          // Copy packages from each discarded source manifest into the primary portal doc.
          discarded.forEach(id => mergeManifestDocs(id, mlockerId).catch(() => {}));
        };
        doMerge();
      } else {
        // ── Re-process from Storage path ─────────────────────────────────────
        // Save the MEGA-MAN packages to Firestore (guard in use-nova-chat skips it).
        const reprocessId = pendingReprocessMegaManRef.current;
        if (reprocessId && reprocessId === processedData.manifestNumber && processedData.rows.length > 0) {
          pendingReprocessMegaManRef.current = null;
          saveManifestRecord(
            processedData.rows as any,
            reprocessId,
            { manifestType: processedData.manifestType },
          ).catch(() => {});
        }
      }
    }
  }, [processedData, onManifestProcessed]);

  // When Nova signals to process a MLocker manifest, fetch its detail and
  // convert the package list into a synthetic File that processFiles can handle.
  useEffect(() => {
    if (!pendingMLockerManifestId) return;
    if (mlockerHandledRef.current === pendingMLockerManifestId) return;
    mlockerHandledRef.current = pendingMLockerManifestId;
    pendingMLockerLinkRef.current = pendingMLockerManifestId;

    const processMLockerManifest = async () => {
      setIsMLockerLoading(true);
      try {
        // Download + store Excel in Firebase Storage, then read it back for processing
        const excelResult = await downloadManifestExcel(pendingMLockerManifestId);

        // Always use base64 from proxy response to build the File object.
        // The signed downloadUrl is only for the manual "Excel" download button —
        // fetching it client-side is blocked by CORS (storage.googleapis.com).
        if (!excelResult.base64) {
          throw new Error('No se obtuvo el archivo Excel del manifiesto.');
        }
        const byteChars = atob(excelResult.base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const xlsxBlob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const xlsxFile = new File(
          [xlsxBlob],
          excelResult.filename || `${pendingMLockerManifestId}.xlsx`,
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );

        await processFiles([xlsxFile]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast({
          title: 'Error al procesar manifiesto MLocker',
          description: msg,
          variant: 'destructive',
        });
      } finally {
        setIsMLockerLoading(false);
        onMLockerManifestHandled();
      }
    };

    processMLockerManifest();
  }, [pendingMLockerManifestId, processFiles, onMLockerManifestHandled, toast]);

  const handleClearChat = useCallback(() => {
    clearMessages();
    toast({
      title: t('nova.chatCleared'),
      description: t('nova.chatClearedDesc'),
    });
  }, [clearMessages, toast, t]);

  // BUG-N2: these are plain boolean derivations — useMemo adds overhead with no benefit
  const hasMessages = messages.length > 0;
  const hasConversation = novaConversation.length > 0;
  const hasAnyContent = hasMessages || hasConversation;

  return (
    <DashboardLayout hideBreadcrumb>
      {/*
        Gemini-style layout:
        - Full viewport height minus the dashboard header (4rem)
        - Scrollable message area fills all available space
        - Input bar is sticky at the bottom (never scrolls away)
      */}
      <div className="relative flex flex-col h-[calc(100vh-4rem)] bg-white overflow-hidden">

        {/* ── Scrollable content area ── */}
        <div className="flex-1 overflow-y-auto">
          {!hasAnyContent ? (
            /* ── Gemini-style empty state ── */
            <div className="flex flex-col justify-center h-full px-4">
              <div className="mx-auto w-full max-w-3xl">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Unified Single-Line Greeting & Psychological Motivational Header */}
                  <div className="mb-5 flex items-center gap-2.5">
                    <img src="/logo.svg" alt="SmartLogistics" className="h-6 w-6 object-contain shrink-0" />
                    <p className="text-lg md:text-xl font-normal leading-snug bg-gradient-to-r from-[#1f1f1f] via-[#a80010] to-[#e8152d] bg-clip-text text-transparent">
                      Hola{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}. {motivationPhrase}
                    </p>
                  </div>

                  {/* Quick Action Chip — single focused MLocker action */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => sendToNova('Obtener manifiestos')}
                      disabled={novaThinking || isProcessing}
                      className="nova-chip flex items-center gap-2 rounded-xl px-4 py-2.5 text-[#444746] text-sm transition-all hover:shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-[#a80010]" />
                      Obtener manifiestos de MLocker
                    </button>
                  </div>
                  <SavedManifestsSection onLoad={handleLoadManifest} onReprocess={handleReprocessMegaMan} />
                </motion.div>
              </div>
            </div>
          ) : (
            /* ── Unified chat ── */
            <div className="px-4 sm:px-6 pt-8 pb-6">
              <div className="max-w-3xl mx-auto space-y-8">

                {/* Merged chronological stream: Nova conversation + manifest messages */}
                {(() => {
                  type Tagged =
                    | { kind: 'nova'; msg: typeof novaConversation[0]; ts: number }
                    | { kind: 'manifest'; msg: typeof messages[0]; idx: number; ts: number };

                  const tagged: Tagged[] = [
                    ...novaConversation.map(msg => ({
                      kind: 'nova' as const,
                      msg,
                      ts: msg.timestamp ? new Date(msg.timestamp).getTime() : 0,
                    })),
                    ...messages.map((msg, idx) => ({
                      kind: 'manifest' as const,
                      msg,
                      idx,
                      ts: msg.timestamp ? new Date(msg.timestamp).getTime() : 0,
                    })),
                  ];

                  // BUG-N3: guard NaN timestamps (invalid/undefined dates produce NaN)
                  tagged.sort((a, b) => (isNaN(a.ts) ? 0 : a.ts) - (isNaN(b.ts) ? 0 : b.ts));

                  return tagged.map(item => {
                    if (item.kind === 'nova') {
                      return (
                        <NovaChatMessage
                          key={`${item.msg.id}-${item.msg.mlockerManifests?.length ?? 0}-${item.msg.trackingResult?.found ? 1 : 0}-${item.msg.firestoreManifestsOnly ? 1 : 0}`}
                          msg={item.msg}
                          onProcessManifest={handleProcessManifest}
                          onDownloadManifest={handleDownloadManifest}
                          refreshTrigger={processRefreshKey}
                          onFusionRequest={handleFusionRequest}
                          fusionResetKey={fusionResetKey}
                          onReprocessMegaMan={handleReprocessMegaMan}
                          onLoadManifest={handleLoadManifest}
                          onShowFirestoreManifests={showFirestoreManifestsDirect}
                        />
                      );
                    }
                    return (
                      <NovaMessage
                        key={item.msg.id}
                        message={item.msg}
                        onDownload={processedData ? downloadCSV : undefined}
                        onDownloadXLSX={processedData ? downloadXLSX : undefined}
                        onSelectCustomerMatch={applyMatchSelection}
                        isLatest={item.idx === messages.length - 1}
                        initialExchangeRate={item.msg.resultData?.exchangeRate ? String(item.msg.resultData.exchangeRate) : capturedExchangeRate}
                        onShowRecentManifests={showFirestoreManifestsDirect}
                      />
                    );
                  });
                })()}

                {/* Processing indicator */}
                {(isProcessing || isMLockerLoading) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-1 py-2"
                  >
                    <img src="/logo.svg" alt="Nova" className="h-5 w-5 shrink-0 object-contain mt-0.5" />
                    <div className="flex items-center gap-1.5 pt-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 bg-red-500/60 rounded-full"
                          animate={{ scale: [1, 1.5, 1], opacity: [0.35, 1, 0.35] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                        />
                      ))}
                      <span className="text-xs text-[#70757a] ml-1">
                        {isMLockerLoading
                          ? `Cargando manifiesto ${pendingMLockerManifestId}…`
                          : 'Nova está procesando…'}
                      </span>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* ── Fixed input bar at the bottom ── */}
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-[#f8f9fa] via-[#f8f9fa]/95 to-transparent pt-2 pb-4 px-4 sm:px-6 z-20">
          <div className="max-w-3xl mx-auto">
            {/* Highly visible Nueva conversación header bar above composer */}
            {hasAnyContent && (
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#a80010]" />
                  Nova Chat Activo
                </span>
                <button
                  type="button"
                  onClick={() => { clearNovaConversation(); handleClearChat(); }}
                  disabled={isProcessing || novaThinking}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-zinc-800 border border-border shadow-xs hover:border-[#a80010]/60 hover:text-[#a80010] text-[#1f1f1f] dark:text-zinc-100 transition-all active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#a80010]" />
                  Nueva conversación
                </button>
              </div>
            )}

            <NovaComposer
              onFilesSelected={handleFilesSelected}
              onTextSubmit={sendToNova}
              isProcessing={isProcessing || isMLockerLoading}
              isThinking={novaThinking}
              hasConversation={hasAnyContent}
            />
          </div>
        </div>

      </div>

      {/* ── Pre-processing dialog: manifest type + exchange rate ── */}
      <Dialog open={preProcessOpen} onOpenChange={open => { if (!open) { setPreProcessOpen(false); setPendingFiles([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Configurar procesamiento
            </DialogTitle>
            <DialogDescription className="text-xs">
              Confirma el tipo de ruta y el tipo de cambio antes de procesar el manifiesto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Manifest type */}
            <div className="space-y-1.5">
              {/* BUG-N7: proper radiogroup role + aria-checked for accessibility */}
              <label id="manifest-type-label" className="text-xs font-medium text-foreground">
                Tipo de ruta
              </label>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-labelledby="manifest-type-label">
                {MANIFEST_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={dialogManifestType === opt.value}
                    onClick={() => setDialogManifestType(opt.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all',
                      dialogManifestType === opt.value
                        ? 'border-primary bg-primary/8 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Exchange rate */}
            <div className="space-y-1.5">
              <label htmlFor="nova-tc" className="text-xs font-medium text-foreground">
                Tipo de cambio (₡ por $1)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">₡</span>
                <input
                  id="nova-tc"
                  type="number"
                  min="1"
                  step="1"
                  value={dialogExchangeRate}
                  onChange={e => setDialogExchangeRate(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="487"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Se usará para calcular totales en colones al ingresar paquetes.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => { setPreProcessOpen(false); setPendingFiles([]); }}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePreProcessConfirm}
              disabled={!dialogExchangeRate || parseFloat(dialogExchangeRate) <= 0}
              className={cn(
                'px-4 py-2 text-sm font-semibold rounded-lg transition-all',
                (!dialogExchangeRate || parseFloat(dialogExchangeRate) <= 0)
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
              )}
            >
              Procesar manifiesto
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Smart-Mega-Man: fusion dialog (3-step: loading → confirm → processing) ── */}
      <Dialog
        open={fusionDialog.open}
        onOpenChange={open => {
          if (!open && fusionDialog.step === 'loading') return; // block close while downloading
          if (!open) setFusionDialog(prev => ({ ...prev, open: false }));
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Merge className="h-4 w-4 text-primary" />
              Fusión de manifiestos
            </DialogTitle>
            <DialogDescription className="text-xs">
              Nova combinará los manifiestos seleccionados en uno solo y los procesará juntos con IA.
            </DialogDescription>
          </DialogHeader>

          {/* ── Step 1: Loading (downloading + merging raw data) ── */}
          {fusionDialog.step === 'loading' && (
            <div className="py-6 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Merge className="h-6 w-6 text-primary" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">Preparando fusión…</p>
                <p className="text-xs text-muted-foreground max-w-xs">{fusionDialog.progressMsg}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {fusionDialog.ids.map(id => (
                  <span key={id} className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Confirm (real data loaded — show row counts + warnings) ── */}
          {fusionDialog.step === 'confirm' && fusionDialog.preview && (
            <>
              <div className="space-y-2 py-1">
                {/* Per-manifest row count list */}
                <p className="text-xs font-medium text-foreground">
                  Manifiestos a fusionar — <span className="text-primary font-semibold">{fusionDialog.preview.totalRows} filas en total</span>
                </p>
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {fusionDialog.ids.map((id, idx) => {
                    const rowCount = fusionDialog.preview!.perManifestRowCounts[idx] ?? 0;
                    const isPrimary = id === fusionDialog.preview!.primaryId;
                    return (
                      <div key={id} className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border',
                        isPrimary
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-muted/40'
                      )}>
                        <Package className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                        <span className="font-mono text-xs font-semibold text-foreground truncate flex-1">{id}</span>
                        {isPrimary && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">base</span>
                        )}
                        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{rowCount} filas</span>
                      </div>
                    );
                  })}
                </div>

                {/* Exact duplicates auto-removed — green confirmation */}
                {fusionDialog.preview.removedDuplicates > 0 && (
                  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-emerald-300/70 bg-emerald-50 dark:bg-emerald-900/10">
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      <p className="font-semibold">
                        {fusionDialog.preview.removedDuplicates} fila{fusionDialog.preview.removedDuplicates !== 1 ? 's' : ''} duplicada{fusionDialog.preview.removedDuplicates !== 1 ? 's' : ''} eliminada{fusionDialog.preview.removedDuplicates !== 1 ? 's' : ''} automáticamente
                      </p>
                      <p className="mt-0.5">
                        Mismo tracking, descripción y peso — se conservó únicamente la primera aparición. Sin efecto en los datos.
                      </p>
                    </div>
                  </div>
                )}

                {/* Conflict trackings — same tracking, different data — amber warning */}
                {fusionDialog.preview.conflictTrackings.length > 0 && (
                  <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-900/10">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                      <p className="font-semibold">
                        {fusionDialog.preview.conflictTrackings.length} tracking{fusionDialog.preview.conflictTrackings.length !== 1 ? 's' : ''} con datos distintos entre manifiestos
                      </p>
                      <p className="mt-0.5">
                        Mismo número de guía pero descripción o peso diferente. Se incluyeron <strong>todas las filas</strong> — revisa en la tabla Nova antes de facturar.
                      </p>
                    </div>
                  </div>
                )}

                {/* Standard Nova guarantee note */}
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-muted/30">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-[11px] text-muted-foreground leading-relaxed space-y-0.5">
                    <p className="font-medium text-foreground">Garantías de integridad</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>Columnas alineadas automáticamente entre manifiestos</li>
                      <li>Nombre del manifiesto más reciente como nombre base</li>
                      <li>Matches de clientes sobre el conjunto completo</li>
                    </ul>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <button
                  type="button"
                  onClick={() => setFusionDialog(prev => ({ ...prev, open: false }))}
                  className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <PermissionTooltip allowed={canCreate('manifest')} message="No tienes permisos para fusionar manifiestos">
                  <button
                    type="button"
                    onClick={handleFusionConfirm}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
                  >
                    <Merge className="h-3.5 w-3.5" />
                    Procesar fusión
                  </button>
                </PermissionTooltip>
              </DialogFooter>
            </>
          )}

          {/* ── Step 3: Processing (AI pipeline running, dialog stays open briefly) ── */}
          {fusionDialog.step === 'processing' && (
            <div className="py-6 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">Nova procesando…</p>
                <p className="text-xs text-muted-foreground">{fusionDialog.progressMsg}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


    </DashboardLayout>
  );
}
