/**
 * FleetAIPanel — Admin component for on-demand AI fleet intelligence.
 *
 * Uses the app's design system (CSS variables) for light/dark compatibility.
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, TrendingUp, AlertTriangle, CheckCircle2,
  Fuel, Map, ChevronDown, ChevronUp, Loader2,
  Sparkles, RefreshCw, History, X, User, AlertCircle, Info, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  isFleetAIEnabled,
  analyzeFleet,
  analyzeDriver,
  getRecentAnalyses,
  type FleetInsight,
  type InsightCard,
} from '@/lib/services/fleet-ai-service';
import type { RouteSession } from '@/lib/services/route-session-service';
import { db } from '@/lib/firebase/config';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

// ── Severity config ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    bg: 'bg-destructive/10 border-destructive/30',
    badge: 'bg-destructive/20 text-destructive border-destructive/30',
    icon: AlertTriangle,
    iconColor: 'text-destructive',
    dot: 'bg-destructive',
  },
  warning: {
    bg: 'bg-amber-500/10 border-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    dot: 'bg-amber-500',
  },
  positive: {
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    dot: 'bg-emerald-500',
  },
  info: {
    bg: 'bg-muted/60 border-border',
    badge: 'bg-muted text-muted-foreground border-border',
    icon: Info,
    iconColor: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
} as const;

const CATEGORY_ICONS: Record<InsightCard['category'], React.ElementType> = {
  efficiency: TrendingUp,
  anomaly: AlertTriangle,
  pattern: Map,
  fuel: Fuel,
  recommendation: Sparkles,
  performance: Zap,
};

const CATEGORY_LABELS: Record<InsightCard['category'], string> = {
  efficiency: 'Eficiencia',
  anomaly: 'Anomalía',
  pattern: 'Patrón',
  fuel: 'Combustible',
  recommendation: 'Recomendación',
  performance: 'Desempeño',
};

// ── Insight Card ───────────────────────────────────────────────────────────────

function InsightCardView({ card, index }: { card: InsightCard; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[card.severity] ?? SEVERITY_CONFIG.info;
  const SevIcon = sev.icon;
  const CatIcon = CATEGORY_ICONS[card.category] ?? Info;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all duration-200',
        sev.bg,
        'animate-in fade-in slide-in-from-bottom-1',
      )}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start gap-2.5">
        <SevIcon className={cn('w-4 h-4 shrink-0 mt-0.5', sev.iconColor)} />
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 font-medium', sev.badge)}>
              <div className={cn('w-1.5 h-1.5 rounded-full mr-1', sev.dot)} />
              {card.severity === 'critical' ? 'Crítico' : card.severity === 'warning' ? 'Alerta' : card.severity === 'positive' ? 'Positivo' : 'Info'}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border-border gap-1">
              <CatIcon className="w-2.5 h-2.5" />
              {CATEGORY_LABELS[card.category]}
            </Badge>
            {card.driverName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-700/50 gap-1">
                <User className="w-2.5 h-2.5" />
                {card.driverName.split(' ')[0]}
              </Badge>
            )}
            {card.routeName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50 gap-1">
                <Map className="w-2.5 h-2.5" />
                {card.routeName}
              </Badge>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-foreground leading-snug">{card.title}</p>

          {/* Metric */}
          {card.metric && (
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{card.metric}</p>
          )}

          {/* Toggle detail */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1.5"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Ocultar detalle' : 'Ver detalle'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
              <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              {card.actionable && (
                <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded p-2 mt-1">
                  <Sparkles className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">{card.actionable}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Analysis Result ────────────────────────────────────────────────────────────

function AnalysisResultView({ analysis, onClose }: { analysis: FleetInsight; onClose: () => void }) {
  const criticalCount = analysis.insights.filter(i => i.severity === 'critical').length;
  const warningCount  = analysis.insights.filter(i => i.severity === 'warning').length;
  const positiveCount = analysis.insights.filter(i => i.severity === 'positive').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Brain className="w-4 h-4 text-violet-500" />
            <p className="text-sm font-semibold text-foreground">
              {analysis.analysisType === 'fleet' ? 'Análisis de Flota' : 'Análisis Individual'}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground ml-6">
            {analysis.promptSummary} · {new Date(analysis.generatedAt).toLocaleString('es-CR', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
        {criticalCount > 0 && (
          <span className="inline-flex items-center gap-1 bg-destructive/10 text-destructive text-[11px] font-medium px-2 py-0.5 rounded-full border border-destructive/20">
            <AlertTriangle className="w-3 h-3" />{criticalCount} crítico{criticalCount > 1 ? 's' : ''}
          </span>
        )}
        {warningCount > 0 && (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-amber-500/20">
            <AlertCircle className="w-3 h-3" />{warningCount} alerta{warningCount > 1 ? 's' : ''}
          </span>
        )}
        {positiveCount > 0 && (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />{positiveCount} positivo{positiveCount > 1 ? 's' : ''}
          </span>
        )}
        <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-[11px] px-2 py-0.5 rounded-full border border-border ml-auto">
          <Sparkles className="w-3 h-3" />{analysis.insights.length} insights
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {[...analysis.insights]
          .sort((a, b) => {
            const order = { critical: 0, warning: 1, positive: 2, info: 3 };
            return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
          })
          .map((card, i) => <InsightCardView key={i} card={card} index={i} />)
        }
      </div>
    </div>
  );
}

// ── Loading ────────────────────────────────────────────────────────────────────

function AnalyzingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="relative mb-3">
        <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Brain className="w-5 h-5 text-violet-500" />
        </div>
        <div className="absolute inset-0 rounded-full border-2 border-violet-400/30 animate-ping" />
      </div>
      <Loader2 className="w-4 h-4 text-violet-500 animate-spin mb-1.5" />
      <p className="text-sm font-medium text-foreground">Analizando con IA...</p>
      <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

interface FleetAIPanelProps {
  sessions: RouteSession[];
  focusSession?: RouteSession | null;
  onClearFocus?: () => void;
  className?: string;
}

export function FleetAIPanel({ sessions, focusSession, onClearFocus, className }: FleetAIPanelProps) {
  if (!isFleetAIEnabled()) return null;

  const [isOpen, setIsOpen]                   = useState(false);
  const [isAnalyzing, setIsAnalyzing]         = useState(false);
  const [analyzingMessage, setAnalyzingMessage] = useState('');
  const [currentAnalysis, setCurrentAnalysis] = useState<FleetInsight | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [recentAnalyses, setRecentAnalyses]   = useState<FleetInsight[]>([]);
  const [showHistory, setShowHistory]         = useState(false);

  const handleFleetAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzingMessage(`Procesando ${sessions.length} sesiones...`);
    setError(null); setCurrentAnalysis(null); setShowHistory(false);
    try {
      setCurrentAnalysis(await analyzeFleet(sessions));
    } catch (err: any) {
      setError(err.message ?? 'Error desconocido');
    } finally {
      setIsAnalyzing(false);
    }
  }, [sessions]);

  const handleDriverAnalysis = useCallback(async (session: RouteSession) => {
    setIsAnalyzing(true);
    setAnalyzingMessage(`Cargando historial de ${session.driverName}...`);
    setError(null); setCurrentAnalysis(null); setShowHistory(false);
    try {
      const historyQ = query(
        collection(db, 'route_sessions'),
        where('driverId', '==', session.driverId),
        orderBy('startAt', 'desc'),
        limit(11),
      );
      const snap = await getDocs(historyQ);
      const history = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as RouteSession))
        .filter(s => s.id !== session.id);
      setAnalyzingMessage(`Analizando desempeño de ${session.driverName}...`);
      setCurrentAnalysis(await analyzeDriver(session, history));
    } catch (err: any) {
      setError(err.message ?? 'Error al analizar el chofer');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleLoadHistory = useCallback(async () => {
    setShowHistory(true); setCurrentAnalysis(null);
    try { setRecentAnalyses(await getRecentAnalyses(8)); }
    catch (err: any) { setError(err.message); }
  }, []);

  // Auto-analyze when focusSession is set and panel is open
  React.useEffect(() => {
    if (focusSession && isOpen) handleDriverAnalysis(focusSession);
  }, [focusSession]);

  const hasContent = isAnalyzing || currentAnalysis || error || showHistory;

  return (
    <div className={cn('relative', className)}>
      {/* Trigger */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(v => !v)}
        className={cn(
          'h-8 gap-1.5 transition-all',
          isOpen && 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400',
        )}
      >
        <Brain className="w-3.5 h-3.5 text-violet-500" />
        <span className="text-xs font-medium">Fleet AI</span>
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </Button>

      {/* Dropdown panel — theme-aware */}
      {isOpen && (
        <div className={cn(
          'absolute right-0 top-10 z-50 w-[480px] max-w-[calc(100vw-2rem)]',
          'bg-popover border border-border rounded-xl shadow-xl',
          'flex flex-col',
          hasContent ? 'max-h-[70vh]' : '',
        )}>
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Inteligencia de Flota</p>
                  <p className="text-[10px] text-muted-foreground">Powered by Gemini AI</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleLoadHistory} title="Ver historial">
                  <History className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-8 bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5"
                onClick={handleFleetAnalysis}
                disabled={isAnalyzing || sessions.length === 0}
              >
                {isAnalyzing && !focusSession
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Sparkles className="w-3 h-3" />
                }
                Analizar flota ({sessions.length})
              </Button>

              {focusSession ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 text-xs gap-1.5"
                  onClick={() => handleDriverAnalysis(focusSession)}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing && focusSession
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <User className="w-3 h-3" />
                  }
                  {focusSession.driverName?.split(' ')[0]}
                  {onClearFocus && (
                    <span
                      className="ml-1 opacity-40 hover:opacity-100"
                      onClick={e => { e.stopPropagation(); onClearFocus(); }}
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </Button>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground border border-dashed border-border rounded-md h-8 px-2">
                  <User className="w-3 h-3 shrink-0" />
                  Clic en fila → analizar chofer
                </div>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden p-4">
            {isAnalyzing && <AnalyzingState message={analyzingMessage} />}

            {!isAnalyzing && error && (
              <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Error al analizar</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
                  <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={handleFleetAnalysis}>
                    <RefreshCw className="w-3 h-3 mr-1" />Reintentar
                  </Button>
                </div>
              </div>
            )}

            {!isAnalyzing && currentAnalysis && (
              <AnalysisResultView analysis={currentAnalysis} onClose={() => setCurrentAnalysis(null)} />
            )}

            {!isAnalyzing && showHistory && !currentAnalysis && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <History className="w-3.5 h-3.5" /> Análisis recientes
                </p>
                {recentAnalyses.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No hay análisis guardados aún</p>
                )}
                {recentAnalyses.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { setCurrentAnalysis(a); setShowHistory(false); }}
                    className="w-full text-left p-3 rounded-lg bg-muted/50 hover:bg-muted border border-border transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Brain className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{a.promptSummary}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(a.generatedAt).toLocaleString('es-CR', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{a.insights.length}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!isAnalyzing && !currentAnalysis && !error && !showHistory && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-3">
                  <Brain className="w-5 h-5 text-violet-500" />
                </div>
                <p className="text-sm font-medium text-foreground">Análisis de flota con IA</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px] leading-relaxed">
                  Detecta patrones, consumo de combustible, rendimiento por chofer y rutas problemáticas
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-[300px]">
                  {[
                    { icon: Fuel,         text: 'Consumo combustible' },
                    { icon: TrendingUp,   text: 'Tasa de entrega' },
                    { icon: AlertTriangle,text: 'Anomalías' },
                    { icon: Map,          text: 'Patrones de ruta' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-1.5 bg-muted/60 rounded-md px-2 py-1.5 border border-border">
                      <Icon className="w-3 h-3 text-violet-500 shrink-0" />
                      <span className="text-[10px] text-muted-foreground">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
