/**
 * useManifestAgent
 *
 * Intelligent AI agent hook for the Manifiesto page.
 * - Loads past manifest history from Firestore (ai_manifest_interactions)
 * - Generates a personalised greeting with proactive insights
 * - Detects daily reminder when no manifest has been entered today
 * - Analyses trends across the last 5 manifests
 * - Saves every processed manifest to Firestore for long-term memory
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  getAgentContext,
  updateAgentContext,
  getRecentManifests,
  saveManifestRecord,
  createSession,
  saveConversationTurn,
  type AgentContext,
  type ProcessedManifestRecord,
} from '@/lib/services/ai-manifest-service';
import { askNova, type NovaContext } from '@/lib/services/nova-agent-engine';
import type { CurrentManifestData } from '@/lib/services/nova-tools';
import type { ProcessedNovaData as ProcessedManifiestoData } from '@/hooks/use-nova-chat';
import { logAction } from '@/lib/services/audit-service';

const PROCESS_MANIFEST_SIGNAL = /PROCESAR_MANIFIESTO:\[([^\]]+)\]/;

const GENERIC_FALLBACK_PATTERNS = [
  'No pude generar una respuesta',
  'intenta de nuevo con más detalles',
  'no obtuve resultados',
];

function isGenericFallback(text: string): boolean {
  return GENERIC_FALLBACK_PATTERNS.some(p => text.includes(p));
}

// ── Agent personality strings ─────────────────────────────────────────────────

const AGENT_NAME = 'Nova';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CR', {
    day: 'numeric',
    month: 'long',
  });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('es-CR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ── Insight message builders ──────────────────────────────────────────────────

function buildWelcomeMessage(
  ctx: AgentContext | null,
  userName: string
): string {
  const greeting = getGreeting();
  const name = userName.split(' ')[0];

  if (!ctx || !ctx.lastManifestAt) {
    return (
      `${greeting}, ${name}. Soy **${AGENT_NAME}**, tu asistente administrativo de logística. ` +
      `Aún no has procesado ningún manifiesto. ¿Deseas cargar uno ahora para comenzar?`
    );
  }

  const lines: string[] = [];
  lines.push(`${greeting}, ${name}. Soy **${AGENT_NAME}**.`);

  // Daily reminder — no manifest today
  const lastDate = new Date(ctx.lastManifestAt);
  const today = new Date();
  const isToday =
    lastDate.getDate() === today.getDate() &&
    lastDate.getMonth() === today.getMonth() &&
    lastDate.getFullYear() === today.getFullYear();

  if (!isToday) {
    lines.push(
      `📋 Aún no has ingresado un manifiesto hoy. El último fue el **${formatDate(ctx.lastManifestAt)}**.`
    );
  }

  // Month summary
  if (ctx.totalManifestsThisMonth > 0) {
    lines.push(
      `Este mes has procesado **${ctx.totalManifestsThisMonth} manifiestos** ` +
      `con **${ctx.totalPackagesThisMonth} paquetes** por un total de **${formatCurrency(ctx.totalRevenueThisMonth)}**.`
    );
  }

  // Top client
  if (ctx.topClientThisMonth) {
    const c = ctx.topClientThisMonth;
    lines.push(
      `📦 Tu cliente más activo este mes es **${c.name} (${c.slCode})** ` +
      `con **${c.packages} paquetes** ingresados.`
    );
  }

  // Trend
  if (ctx.trendDirection && ctx.trendPercent !== null && ctx.lastFiveManifests.length >= 2) {
    const last = ctx.lastFiveManifests[0];
    const prev = ctx.lastFiveManifests[1];
    const arrow =
      ctx.trendDirection === 'up' ? '📈' :
      ctx.trendDirection === 'down' ? '📉' : '➡️';
    const verb =
      ctx.trendDirection === 'up' ? 'aumentó' :
      ctx.trendDirection === 'down' ? 'disminuyó' : 'se mantuvo estable';

    lines.push(
      `${arrow} En los últimos 5 manifiestos el número de trackings **${verb}** ` +
      `${ctx.trendDirection !== 'stable' ? `un **${ctx.trendPercent}%**` : ''} ` +
      `(${prev.totalRows} → ${last.totalRows} paquetes).`
    );
  }

  lines.push(`\n¿Deseas ingresar un manifiesto ahora?`);

  return lines.join('\n\n');
}

function buildPostProcessMessage(
  result: ProcessedManifiestoData,
  ctx: AgentContext | null
): string {
  const lines: string[] = [];

  lines.push(
    `✅ Manifiesto **${result.manifestNumber || 'procesado'}** listo. ` +
    `**${result.summary.processedRows} paquetes**, total **${formatCurrency(result.summary.totalPrice)}**.`
  );

  if (result.summary.namesCorrections > 0) {
    lines.push(
      `🔍 Corregí **${result.summary.namesCorrections} nombres** con IA para mayor precisión.`
    );
  }

  if (result.summary.weightCorrections > 0) {
    lines.push(
      `⚖️ Detecté **${result.summary.weightCorrections} anomalías de peso** que pueden requerir revisión.`
    );
  }

  // Compare with previous manifest
  if (ctx?.lastFiveManifests && ctx.lastFiveManifests.length > 0) {
    const prev = ctx.lastFiveManifests[0];
    const diff = result.summary.processedRows - prev.totalRows;
    if (Math.abs(diff) >= 2) {
      const dir = diff > 0 ? `${diff} más` : `${Math.abs(diff)} menos`;
      lines.push(
        `📊 Este manifiesto tiene **${dir} paquetes** que el anterior (**${prev.totalRows}**).`
      );
    }
  }

  return lines.join('\n\n');
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface AgentInsight {
  type: 'greeting' | 'reminder' | 'trend' | 'top_client' | 'post_process';
  message: string;
  severity: 'info' | 'warning' | 'success';
}

export interface NovaConversationMessage {
  id: string;
  role: 'user' | 'nova';
  content: string;
  timestamp: string;
  isThinking?: boolean;
  thinkingStatus?: string;
  toolsUsed?: string[];
  mlockerManifests?: import('@/lib/services/nova-agent-engine').MLockerManifestItem[];
  trackingResult?: import('@/lib/services/nova-agent-engine').NovaTrackingResult;
  chartData?: import('@/lib/services/nova-agent-engine').NovaChartData;
  firestoreManifestsOnly?: boolean;
  loadManifestId?: string;
}

export interface UseManifestAgentReturn {
  isLoading: boolean;
  isThinking: boolean;
  agentContext: AgentContext | null;
  welcomeMessage: string;
  insights: AgentInsight[];
  hasManifestToday: boolean;
  conversation: NovaConversationMessage[];
  pendingMLockerManifestId: string | null;
  onManifestProcessed: (result: ProcessedManifiestoData) => Promise<void>;
  onMLockerManifestHandled: () => void;
  requestMLockerManifest: (manifestId: string) => void;
  sendMessage: (text: string) => Promise<void>;
  showFirestoreManifestsDirect: () => void;
  clearConversation: () => void;
  refreshContext: () => Promise<void>;
}

let msgCounter = 0;
function genMsgId() { return `nova-${Date.now()}-${++msgCounter}`; }

export function useManifestAgent(): UseManifestAgentReturn {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [agentContext, setAgentContext] = useState<AgentContext | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [insights, setInsights] = useState<AgentInsight[]>([]);
  const [conversation, setConversation] = useState<NovaConversationMessage[]>([]);
  const [pendingMLockerManifestId, setPendingMLockerManifestId] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const currentManifestRef = useRef<CurrentManifestData>(null);
  // Stable refs so sendMessage callback never goes stale between renders
  const conversationRef = useRef<NovaConversationMessage[]>([]);
  const agentContextRef = useRef<AgentContext | null>(null);
  const isThinkingRef = useRef(false);

  const userId = user?.id || user?.email || 'anonymous';
  const userName = (user as any)?.fullName || (user as any)?.displayName || (user as any)?.email || 'Gerente';

  const loadContext = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const [ctx, recentManifests] = await Promise.all([
        getAgentContext(userId),
        getRecentManifests(userId, 10),
      ]);

      // Rebuild context from latest manifests to keep it fresh
      let freshCtx = ctx;
      if (recentManifests.length > 0) {
        freshCtx = await updateAgentContext(userId, recentManifests);
      }

      agentContextRef.current = freshCtx;
      setAgentContext(freshCtx);
      setWelcomeMessage(buildWelcomeMessage(freshCtx, userName));
      setInsights(buildInsights(freshCtx));
    } catch (err) {
      console.warn('[ManifestAgent] Failed to load context:', err);
      setWelcomeMessage(buildWelcomeMessage(null, userName));
    } finally {
      setIsLoading(false);
      refreshingRef.current = false;
    }
  }, [userId, userName]);

  useEffect(() => {
    if (userId) {
      loadContext();
      // Create a Firestore session for this page visit (non-blocking)
      createSession(userId).then(id => { sessionIdRef.current = id; }).catch(() => {});
    }
  }, [loadContext, userId]);

  const onManifestProcessed = useCallback(
    async (result: ProcessedManifiestoData) => {
      if (!userId) return;

      // Extract top customers from rows
      const customerMap = new Map<string, { slCode: string; name: string; packages: number }>();
      for (const row of result.rows) {
        if (!row.slCode) continue;
        const existing = customerMap.get(row.slCode);
        if (existing) {
          existing.packages++;
        } else {
          customerMap.set(row.slCode, {
            slCode: row.slCode,
            name: row.nombreCliente || row.nombre || row.slCode,
            packages: 1,
          });
        }
      }
      const topCustomers = Array.from(customerMap.values())
        .sort((a, b) => b.packages - a.packages)
        .slice(0, 5);

      const record: Omit<ProcessedManifestRecord, 'id' | 'userId'> = {
        manifestNumber: result.manifestNumber || `MAN-${Date.now()}`,
        manifestType: result.manifestType || 'usa_air',
        totalRows: result.summary.totalRows,
        totalPrice: result.summary.totalPrice,
        customersMatched: result.summary.customersMatched,
        namesCorrections: result.summary.namesCorrections,
        weightCorrections: result.summary.weightCorrections,
        topCustomers,
        processedAt: new Date().toISOString(),
      };

      try {
        await saveManifestRecord(userId, record);
        const updated = await getRecentManifests(userId, 10);
        const freshCtx = await updateAgentContext(userId, updated);
        agentContextRef.current = freshCtx;
        setAgentContext(freshCtx);
        setInsights(buildInsights(freshCtx));
        // Store manifest data for Nova tool access
        currentManifestRef.current = {
          rows: (result.rows || []) as unknown as Array<Record<string, unknown>>,
          summary: result.summary,
          manifestNumber: result.manifestNumber,
          manifestType: result.manifestType,
        };
      } catch (err) {
        console.warn('[ManifestAgent] Failed to save manifest record:', err);
      }
    },
    [userId]
  );

  // Keep conversationRef in sync on every render (before paint)
  conversationRef.current = conversation;

  const sendMessage = useCallback(
    async (text: string) => {
      // Gate via ref — avoids stale isThinking state capture
      if (!text.trim() || isThinkingRef.current) return;

      const trimmedText = text.trim();

      // ⚠️ ARCHITECTURAL RULE (AGENTS.md Rule 8):
      // FAST PATH: Direct local Firestore manifest view.
      // MUST ONLY match explicit requests for local Firestore processed manifests.
      // CRITICAL: NEVER include generic keywords like "Obtener manifiestos" or "más recientes"
      // in this regex! "Obtener manifiestos" requests live manifests from ML Cargo portal via
      // Gemini's AI tool `list_mlocker_manifests`. Intercepting it breaks ML Cargo fetching.
      const isManifestListRequest =
        /manifiestos (de firestore|guardados en firestore)/i.test(trimmedText) ||
        trimmedText.includes('Ver manifiestos de Firestore');

      if (isManifestListRequest) {
        const userMsg: NovaConversationMessage = {
          id: genMsgId(),
          role: 'user',
          content: trimmedText,
          timestamp: new Date().toISOString(),
        };
        const novaMsg: NovaConversationMessage = {
          id: genMsgId(),
          role: 'nova',
          content: '📁 **Manifiestos procesados en Firestore**\nAquí tienes la lista de manifiestos guardados y fusionados:',
          timestamp: new Date().toISOString(),
          isThinking: false,
          firestoreManifestsOnly: true,
        };
        setConversation(prev => [...prev, userMsg, novaMsg]);
        return;
      }

      // FAST PATH: Direct local Firestore manifest view command
      const loadManifestRegex = /(?:ver|abrir|procesar|cargar)\s+manifiesto\s+([A-Za-z0-9\-_]+)/i;
      const directIdRegex = /^(?:ver|abrir|procesar|cargar)\s+([A-Za-z0-9\-_]+)$/i;
      const loadMatch = trimmedText.match(loadManifestRegex) || trimmedText.match(directIdRegex);
      if (loadMatch) {
        const manifestId = loadMatch[1].trim();
        const isLikelyManifestId = manifestId.length >= 3 && (
          /\d/.test(manifestId) ||
          /MEGA-MAN/i.test(manifestId) ||
          manifestId.includes('-')
        );
        if (isLikelyManifestId) {
          const userMsg: NovaConversationMessage = {
            id: genMsgId(),
            role: 'user',
            content: trimmedText,
            timestamp: new Date().toISOString(),
          };
          const novaMsg: NovaConversationMessage = {
            id: genMsgId(),
            role: 'nova',
            content: `📂 **Abrir Manifiesto**\nHe preparado el manifiesto **${manifestId}** para ti. Haz clic en el botón de abajo para cargarlo directamente sin usar la IA:`,
            timestamp: new Date().toISOString(),
            isThinking: false,
            loadManifestId: manifestId,
          };
          setConversation(prev => [...prev, userMsg, novaMsg]);
          return;
        }
      }

      const userMsg: NovaConversationMessage = {
        id: genMsgId(),
        role: 'user',
        content: trimmedText,
        timestamp: new Date().toISOString(),
      };
      const thinkingId = genMsgId();
      const thinkingMsg: NovaConversationMessage = {
        id: thinkingId,
        role: 'nova',
        content: '',
        timestamp: new Date().toISOString(),
        isThinking: true,
      };

      isThinkingRef.current = true;
      setIsThinking(true);
      setConversation(prev => [...prev, userMsg, thinkingMsg]);

      const queryStartTime = Date.now();

      try {
        // Read from refs — always current, no stale closure
        const snap = agentContextRef.current;
        const ctx: NovaContext = {
          userId,
          userName,
          sessionId: sessionIdRef.current,
          currentManifest: currentManifestRef.current,
          conversationHistory: conversationRef.current
            .filter(m => !m.isThinking)
            .map(m => ({
              role: m.role === 'user' ? 'user' : 'agent',
              content: m.content,
              timestamp: m.timestamp,
            })),
          agentContextSnapshot: snap
            ? {
                lastManifestAt: snap.lastManifestAt,
                totalManifestsThisMonth: snap.totalManifestsThisMonth,
                totalPackagesThisMonth: snap.totalPackagesThisMonth,
                totalRevenueThisMonth: snap.totalRevenueThisMonth,
                trendDirection: snap.trendDirection,
                topClientThisMonth: snap.topClientThisMonth,
              }
            : null,
        };

        let response = await askNova(text, ctx, (statusMsg) => {
          setConversation(prev => prev.map(m =>
            m.id === thinkingId ? { ...m, thinkingStatus: statusMsg } : m
          ));
        });

        // Auto-retry: if Nova returned a generic fallback with no tools used,
        // the first Gemini call likely returned empty. Retry once.
        if (isGenericFallback(response.text) && response.toolsUsed.length === 0) {
          if (import.meta.env.DEV) console.warn('[ManifestAgent] Generic fallback detected — retrying askNova');
          response = await askNova(text, ctx);
        }

        // Check for PROCESAR_MANIFIESTO signal in Nova's response
        const signalMatch = response.text.match(PROCESS_MANIFEST_SIGNAL);
        const cleanText = response.text.replace(PROCESS_MANIFEST_SIGNAL, '').trim();

        if (import.meta.env.DEV) {
          console.log('[ManifestAgent] response.mlockerManifests:', response.mlockerManifests?.length ?? 'undefined', 'toolsUsed:', response.toolsUsed);
        }
        const durationMs = Date.now() - queryStartTime;

        const novaMsg: NovaConversationMessage = {
          id: thinkingId,
          role: 'nova',
          content: cleanText || response.text,
          timestamp: new Date().toISOString(),
          isThinking: false,
          toolsUsed: response.toolsUsed,
          mlockerManifests: response.mlockerManifests,
          trackingResult: response.trackingResult,
          chartData: response.chartData,
          firestoreManifestsOnly: response.firestoreManifestsOnly,
        };
        if (import.meta.env.DEV) {
          console.log('[ManifestAgent] novaMsg.mlockerManifests:', novaMsg.mlockerManifests?.length ?? 'undefined');
        }
        setConversation(prev => prev.map(m => m.id === thinkingId ? novaMsg : m));

        // ── Audit log ────────────────────────────────────────────────────────
        const trackingNumbers = response.trackingResult?.trackingNumber
          ? [response.trackingResult.trackingNumber]
          : [];
        const resultType = response.trackingResult
          ? 'tracking'
          : response.mlockerManifests?.length
          ? 'manifest'
          : response.chartData
          ? 'chart'
          : 'general';
        logAction({
          userId,
          userName,
          action: 'nova_query',
          category: 'nova',
          resource: text.trim().slice(0, 120),
          result: 'success',
          sessionId: sessionIdRef.current,
          metadata: {
            toolsUsed: response.toolsUsed,
            durationMs,
            resultType,
            toolCount: response.toolsUsed.length,
            hasTracking: !!response.trackingResult,
            hasManifests: !!response.mlockerManifests?.length,
            hasChart: !!response.chartData,
          },
        });

        // ── Nova learning: persist turn to nova_conversation_logs ────────────
        if (sessionIdRef.current) {
          saveConversationTurn({
            userId,
            sessionId: sessionIdRef.current,
            userQuery: text.trim(),
            novaResponse: (cleanText || response.text).slice(0, 2000),
            toolsUsed: response.toolsUsed,
            durationMs,
            trackingNumbers: trackingNumbers.length ? trackingNumbers : undefined,
            resourceType: resultType,
            resultType,
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }

        // If Nova signalled manifest processing, store the ID for Nova.tsx to act on
        if (signalMatch?.[1]) {
          setPendingMLockerManifestId(signalMatch[1]);
        }
      } catch (err) {
        console.warn('[ManifestAgent] askNova error:', err);
        const errStr = String(err);
        const isSuspended = errStr.includes('suspended') || errStr.includes('403') || errStr.includes('API_KEY') || errStr.includes('API key');
        
        const friendlyMessage = isSuspended
          ? `⚠️ **La conexión con el motor de IA de Google está temporalmente inactiva (API Key suspendida).**\n\nNo te preocupes, puedes seguir realizando tus operaciones de manifiestos directamente utilizando el listado de abajo:`
          : `⚠️ **Ocurrió un inconveniente al procesar tu consulta.**\n\nPuedes seguir gestionando tus manifiestos directamente con la lista de abajo:`;

        const errorMsg: NovaConversationMessage = {
          id: thinkingId,
          role: 'nova',
          content: friendlyMessage,
          timestamp: new Date().toISOString(),
          isThinking: false,
          firestoreManifestsOnly: true,
        };
        setConversation(prev => prev.map(m => m.id === thinkingId ? errorMsg : m));
      } finally {
        isThinkingRef.current = false;
        setIsThinking(false);
      }
    },
    // userId and userName are the only true deps — everything else reads from refs
    [userId, userName]
  );

  const clearConversation = useCallback(() => {
    setConversation([]);
  }, []);

  const onMLockerManifestHandled = useCallback(() => {
    setPendingMLockerManifestId(null);
  }, []);

  const requestMLockerManifest = useCallback((manifestId: string) => {
    setPendingMLockerManifestId(manifestId);
  }, []);

  const hasManifestToday = useMemo(() => {
    if (!agentContext?.lastManifestAt) return false;
    const last = new Date(agentContext.lastManifestAt);
    const now = new Date();
    return (
      last.getDate() === now.getDate() &&
      last.getMonth() === now.getMonth() &&
      last.getFullYear() === now.getFullYear()
    );
  }, [agentContext?.lastManifestAt]);

  const showFirestoreManifestsDirect = useCallback(() => {
    const novaMsg: NovaConversationMessage = {
      id: genMsgId(),
      role: 'nova',
      content: '📁 **Manifiestos procesados en Firestore**\nAquí tienes la lista de manifiestos guardados y fusionados:',
      timestamp: new Date().toISOString(),
      isThinking: false,
      firestoreManifestsOnly: true,
    };
    setConversation(prev => [...prev, novaMsg]);
  }, []);

  return {
    isLoading,
    isThinking,
    agentContext,
    welcomeMessage,
    insights,
    hasManifestToday,
    conversation,
    pendingMLockerManifestId,
    onManifestProcessed,
    onMLockerManifestHandled,
    requestMLockerManifest,
    sendMessage,
    showFirestoreManifestsDirect,
    clearConversation,
    refreshContext: loadContext,
  };
}

// ── Insight builder ───────────────────────────────────────────────────────────

function buildInsights(ctx: AgentContext | null): AgentInsight[] {
  if (!ctx) return [];
  const list: AgentInsight[] = [];

  // Daily reminder
  if (ctx.lastManifestAt) {
    const last = new Date(ctx.lastManifestAt);
    const now = new Date();
    const isToday =
      last.getDate() === now.getDate() &&
      last.getMonth() === now.getMonth() &&
      last.getFullYear() === now.getFullYear();
    if (!isToday) {
      list.push({
        type: 'reminder',
        message: `Sin manifiesto hoy. Último: ${formatDate(ctx.lastManifestAt)}`,
        severity: 'warning',
      });
    }
  }

  // Trend
  if (ctx.trendDirection && ctx.trendPercent !== null) {
    list.push({
      type: 'trend',
      message:
        ctx.trendDirection === 'up'
          ? `Trackings ↑${ctx.trendPercent}% vs manifiesto anterior`
          : ctx.trendDirection === 'down'
          ? `Trackings ↓${ctx.trendPercent}% vs manifiesto anterior`
          : 'Volumen estable vs manifiesto anterior',
      severity:
        ctx.trendDirection === 'down' ? 'warning' :
        ctx.trendDirection === 'up' ? 'success' : 'info',
    });
  }

  // Top client
  if (ctx.topClientThisMonth) {
    list.push({
      type: 'top_client',
      message: `Top cliente: ${ctx.topClientThisMonth.name} · ${ctx.topClientThisMonth.packages} pkgs`,
      severity: 'info',
    });
  }

  return list;
}
