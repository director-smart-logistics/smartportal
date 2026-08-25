/**
 * AI Manifest Interactions Service
 *
 * Persists conversation context, processed manifest history, and agent insights
 * to the `ai_manifest_interactions` Firestore collection.
 *
 * Document structure:
 *   ai_manifest_interactions/{userId}/sessions/{sessionId}   — one chat session
 *   ai_manifest_interactions/{userId}/manifests/{manifestId} — one processed manifest summary
 *   ai_manifest_interactions/{userId}/context/current        — latest agent context snapshot
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── Module-level context cache ─────────────────────────────────────────────────
// Avoids re-reading the context doc on every page mount / fast refresh.
// Invalidated whenever updateAgentContext writes a new snapshot.

const CONTEXT_CACHE_TTL = 5 * 60_000; // 5 min
const _ctxCache = new Map<string, { ctx: AgentContext; expiresAt: number }>();

function ctxCacheGet(userId: string): AgentContext | undefined {
  const entry = _ctxCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _ctxCache.delete(userId); return undefined; }
  return entry.ctx;
}

function ctxCacheSet(userId: string, ctx: AgentContext): void {
  _ctxCache.set(userId, { ctx, expiresAt: Date.now() + CONTEXT_CACHE_TTL });
}

export function invalidateAgentContextCache(userId: string): void {
  _ctxCache.delete(userId);
}

// ── Collection paths ──────────────────────────────────────────────────────────

const ROOT = 'ai_manifest_interactions';
const CONVERSATION_LOGS_ROOT = 'nova_conversation_logs';

function sessionsRef(userId: string) {
  return collection(db, ROOT, userId, 'sessions');
}

function manifestsRef(userId: string) {
  return collection(db, ROOT, userId, 'manifests');
}

function contextRef(userId: string) {
  return doc(db, ROOT, userId, 'context', 'current');
}

function conversationLogsRef() {
  return collection(db, CONVERSATION_LOGS_ROOT);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: 'agent' | 'user' | 'system';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  durationMs?: number;
  trackingNumbers?: string[];
  resourceType?: string;
}

/**
 * A single Nova conversation turn stored in `nova_conversation_logs`.
 * These records feed into Nova's learning — surfaced as few-shot context in the system prompt.
 */
export interface ConversationTurn {
  id?: string;
  userId: string;
  sessionId: string;
  userQuery: string;
  novaResponse: string;
  toolsUsed: string[];
  durationMs?: number;
  trackingNumbers?: string[];
  resourceType?: string;
  resultType?: 'tracking' | 'manifest' | 'invoice' | 'customer' | 'package' | 'route' | 'chart' | 'general';
  timestamp: string;
}

export interface ManifestSession {
  id: string;
  sessionId: string;
  userId: string;
  messages: AgentMessage[];
  manifestsProcessed: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessedManifestRecord {
  id: string;
  manifestNumber: string;
  manifestType: string;
  totalRows: number;
  totalPrice: number;
  customersMatched: number;
  namesCorrections: number;
  weightCorrections: number;
  topCustomers: Array<{ slCode: string; name: string; packages: number }>;
  processedAt: string;
  userId: string;
}

export interface AgentContext {
  userId: string;
  lastManifestAt: string | null;
  totalManifestsThisMonth: number;
  totalPackagesThisMonth: number;
  totalRevenueThisMonth: number;
  lastFiveManifests: Array<{
    manifestNumber: string;
    totalRows: number;
    totalPrice: number;
    processedAt: string;
  }>;
  topClientThisMonth: {
    slCode: string;
    name: string;
    packages: number;
  } | null;
  trendDirection: 'up' | 'down' | 'stable' | null;
  trendPercent: number | null;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (ts?.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

// ── Session API ───────────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  initialMessages: AgentMessage[] = []
): Promise<string> {
  const ref = await addDoc(sessionsRef(userId), {
    userId,
    messages: initialMessages,
    manifestsProcessed: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function appendSessionMessages(
  userId: string,
  sessionId: string,
  messages: AgentMessage[],
  manifestsProcessed?: number
): Promise<void> {
  const sessionDoc = doc(sessionsRef(userId), sessionId);
  // arrayUnion eliminates the getDoc round-trip: a single write appends atomically.
  const update: Record<string, unknown> = {
    messages: arrayUnion(...messages),
    updatedAt: serverTimestamp(),
  };
  if (manifestsProcessed !== undefined) {
    update.manifestsProcessed = manifestsProcessed;
  }
  await updateDoc(sessionDoc, update);
}

export async function getRecentSession(
  userId: string
): Promise<ManifestSession | null> {
  const q = query(sessionsRef(userId), orderBy('updatedAt', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    sessionId: d.id,
    userId: data.userId,
    messages: data.messages || [],
    manifestsProcessed: data.manifestsProcessed || 0,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

// ── Manifest records API ──────────────────────────────────────────────────────

export async function saveManifestRecord(
  userId: string,
  record: Omit<ProcessedManifestRecord, 'id' | 'userId'>
): Promise<string> {
  const ref = await addDoc(manifestsRef(userId), {
    ...record,
    userId,
    processedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getRecentManifests(
  userId: string,
  count = 5
): Promise<ProcessedManifestRecord[]> {
  const q = query(
    manifestsRef(userId),
    orderBy('processedAt', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      manifestNumber: data.manifestNumber || '',
      manifestType: data.manifestType || 'usa_air',
      totalRows: data.totalRows || 0,
      totalPrice: data.totalPrice || 0,
      customersMatched: data.customersMatched || 0,
      namesCorrections: data.namesCorrections || 0,
      weightCorrections: data.weightCorrections || 0,
      topCustomers: data.topCustomers || [],
      processedAt: toISO(data.processedAt),
      userId: data.userId || userId,
    } as ProcessedManifestRecord;
  });
}

export async function getManifestsThisMonth(
  userId: string
): Promise<ProcessedManifestRecord[]> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = Timestamp.fromDate(startOfMonth);

  const q = query(
    manifestsRef(userId),
    where('processedAt', '>=', since),
    orderBy('processedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      manifestNumber: data.manifestNumber || '',
      manifestType: data.manifestType || 'usa_air',
      totalRows: data.totalRows || 0,
      totalPrice: data.totalPrice || 0,
      customersMatched: data.customersMatched || 0,
      namesCorrections: data.namesCorrections || 0,
      weightCorrections: data.weightCorrections || 0,
      topCustomers: data.topCustomers || [],
      processedAt: toISO(data.processedAt),
      userId: data.userId || userId,
    } as ProcessedManifestRecord;
  });
}

// ── Agent context API ─────────────────────────────────────────────────────────

export async function getAgentContext(
  userId: string
): Promise<AgentContext | null> {
  // Return cached copy if still fresh — avoids Firestore read on every mount
  const cached = ctxCacheGet(userId);
  if (cached) return cached;

  const snap = await getDoc(contextRef(userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  const ctx: AgentContext = {
    userId: data.userId || userId,
    lastManifestAt: data.lastManifestAt || null,
    totalManifestsThisMonth: data.totalManifestsThisMonth || 0,
    totalPackagesThisMonth: data.totalPackagesThisMonth || 0,
    totalRevenueThisMonth: data.totalRevenueThisMonth || 0,
    lastFiveManifests: data.lastFiveManifests || [],
    topClientThisMonth: data.topClientThisMonth || null,
    trendDirection: data.trendDirection || null,
    trendPercent: data.trendPercent || null,
    updatedAt: toISO(data.updatedAt),
  };
  ctxCacheSet(userId, ctx);
  return ctx;
}

export async function updateAgentContext(
  userId: string,
  manifests: ProcessedManifestRecord[]
): Promise<AgentContext> {
  const thisMonth = manifests.filter((m) => {
    const d = new Date(m.processedAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  // Compute top client this month across all manifests
  const clientMap = new Map<string, { slCode: string; name: string; packages: number }>();
  for (const m of thisMonth) {
    for (const c of m.topCustomers || []) {
      const existing = clientMap.get(c.slCode);
      if (existing) {
        existing.packages += c.packages;
      } else {
        clientMap.set(c.slCode, { ...c });
      }
    }
  }
  const topClientThisMonth =
    clientMap.size > 0
      ? Array.from(clientMap.values()).sort((a, b) => b.packages - a.packages)[0]
      : null;

  // Compute trend from last 5 manifests (compare latest 2 vs previous 3 avg)
  const last5 = manifests.slice(0, 5);
  let trendDirection: AgentContext['trendDirection'] = null;
  let trendPercent: number | null = null;
  if (last5.length >= 2) {
    const latest = last5[0].totalRows;
    const prev = last5[1].totalRows;
    if (prev > 0) {
      const change = ((latest - prev) / prev) * 100;
      trendPercent = Math.round(Math.abs(change));
      trendDirection =
        Math.abs(change) < 5 ? 'stable' : change > 0 ? 'up' : 'down';
    }
  }

  const ctx: Omit<AgentContext, 'updatedAt'> = {
    userId,
    lastManifestAt: manifests[0]?.processedAt || null,
    totalManifestsThisMonth: thisMonth.length,
    totalPackagesThisMonth: thisMonth.reduce((s, m) => s + m.totalRows, 0),
    totalRevenueThisMonth: thisMonth.reduce((s, m) => s + m.totalPrice, 0),
    lastFiveManifests: last5.map((m) => ({
      manifestNumber: m.manifestNumber,
      totalRows: m.totalRows,
      totalPrice: m.totalPrice,
      processedAt: m.processedAt,
    })),
    topClientThisMonth,
    trendDirection,
    trendPercent,
  };

  const now = new Date().toISOString();
  const full: AgentContext = { ...ctx, updatedAt: now };

  await setDoc(contextRef(userId), {
    ...ctx,
    updatedAt: serverTimestamp(),
  });

  // Invalidate then re-prime the cache with fresh data
  ctxCacheSet(userId, full);
  return full;
}

// ── Nova conversation learning API ────────────────────────────────────────────

/**
 * Persist a single Q&A turn to `nova_conversation_logs`.
 * Fire-and-forget — callers should .catch(() => {}) this.
 *
 * These records let Nova learn from past interactions:
 *  - getRecentConversationTurns() retrieves them for few-shot injection.
 */
export async function saveConversationTurn(
  turn: Omit<ConversationTurn, 'id'>
): Promise<void> {
  await addDoc(conversationLogsRef(), {
    ...turn,
    timestamp: serverTimestamp(),
  });
}

/**
 * Fetch the most recent N conversation turns for a user.
 * Used to build few-shot context for Nova's system prompt.
 */
export async function getRecentConversationTurns(
  userId: string,
  count = 10
): Promise<ConversationTurn[]> {
  const q = query(
    conversationLogsRef(),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId ?? userId,
      sessionId: data.sessionId ?? '',
      userQuery: data.userQuery ?? '',
      novaResponse: data.novaResponse ?? '',
      toolsUsed: data.toolsUsed ?? [],
      durationMs: data.durationMs,
      trackingNumbers: data.trackingNumbers,
      resourceType: data.resourceType,
      resultType: data.resultType,
      timestamp: data.timestamp?.toDate?.()?.toISOString() ?? data.timestamp ?? '',
    } as ConversationTurn;
  });
}
